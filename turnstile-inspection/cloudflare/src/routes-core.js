import { HttpError, json, readJson } from './http.js';
import {
  derivePasswordHash,
  login,
  logout,
  newPasswordSalt,
  PASSWORD_ITERATIONS,
  requireAdmin,
  safeUser
} from './auth.js';
import { listNotifications, markNotificationRead } from './notifications.js';

export async function handleAuthRoutes(request, env, parts) {
  if (parts[1] === 'login' && request.method === 'POST') {
    const input = await readJson(request);
    if (!String(input.username || '').trim() || !String(input.password || '')) {
      throw new HttpError(400, 'credentials_required');
    }
    return json(await login(input.username, input.password, request, env));
  }

  if (parts[1] === 'logout' && request.method === 'POST') {
    await logout(request, env);
    return json({ ok: true });
  }

  throw new HttpError(404, 'not_found');
}

export async function handleUserRoutes(request, env, parts, user) {
  requireAdmin(user);

  if (parts.length === 2 && request.method === 'GET') {
    const rows = (await env.DB.prepare(
      `SELECT id,username,display_name,role,active,created_at,updated_at
       FROM users
       ORDER BY CASE WHEN role='admin' THEN 0 ELSE 1 END, display_name`
    ).all()).results || [];

    return json({ users: rows.map(safeUser) });
  }

  if (parts.length === 2 && request.method === 'POST') {
    const input = await readJson(request);
    const username = String(input.username || '').trim();
    const displayName = String(input.displayName || '').trim();
    const password = String(input.password || '');
    const role = input.role === 'admin' ? 'admin' : 'inspector';

    if (username.length < 3) throw new HttpError(400, 'username_too_short');
    if (displayName.length < 2) throw new HttpError(400, 'display_name_required');
    if (password.length < 8) throw new HttpError(400, 'password_too_short');

    const salt = newPasswordSalt();
    const passwordHash = await derivePasswordHash(password, salt, env.PASSWORD_PEPPER || '');
    const id = crypto.randomUUID();

    try {
      await env.DB.prepare(
        `INSERT INTO users
          (id,username,display_name,role,password_hash,password_salt,password_iterations)
         VALUES (?,?,?,?,?,?,?)`
      ).bind(id, username, displayName, role, passwordHash, salt, PASSWORD_ITERATIONS).run();
    } catch {
      throw new HttpError(409, 'username_exists');
    }

    return json({
      user: { id, username, displayName, role, active: true }
    }, 201);
  }

  if (parts.length === 3 && request.method === 'PATCH') {
    const target = await env.DB.prepare(
      `SELECT * FROM users WHERE id=?`
    ).bind(parts[2]).first();

    if (!target) throw new HttpError(404, 'user_not_found');

    const input = await readJson(request);

    if (target.id === user.id && input.active === false) {
      throw new HttpError(409, 'cannot_disable_self');
    }

    if (target.id === user.id && input.role != null && input.role !== 'admin') {
      throw new HttpError(409, 'cannot_demote_self');
    }

    const wouldRemoveAdmin =
      target.role === 'admin' &&
      target.active &&
      (input.active === false || (input.role != null && input.role !== 'admin'));

    if (wouldRemoveAdmin) {
      const adminCount = await env.DB.prepare(
        `SELECT COUNT(*) AS count
         FROM users
         WHERE role='admin' AND active=1`
      ).first();

      if (Number(adminCount?.count || 0) <= 1) {
        throw new HttpError(409, 'last_active_admin');
      }
    }

    if (input.active === false) {
      const activeAssignment = await env.DB.prepare(
        `SELECT 1 AS ok
         FROM inspection_gates g
         JOIN inspections i ON i.id=g.inspection_id
         WHERE g.assignee_user_id=? AND i.status='active'
         LIMIT 1`
      ).bind(target.id).first();

      if (activeAssignment?.ok) {
        throw new HttpError(409, 'user_has_active_assignments');
      }
    }

    const displayName = input.displayName == null
      ? target.display_name
      : String(input.displayName).trim();
    const active = input.active == null ? Number(target.active) : (input.active ? 1 : 0);
    const role = input.role == null
      ? target.role
      : (input.role === 'admin' ? 'admin' : 'inspector');

    if (displayName.length < 2) throw new HttpError(400, 'display_name_required');

    await env.DB.prepare(
      `UPDATE users
       SET display_name=?,active=?,role=?,updated_at=datetime('now')
       WHERE id=?`
    ).bind(displayName, active, role, target.id).run();

    if (input.password != null && String(input.password)) {
      const password = String(input.password);
      if (password.length < 8) throw new HttpError(400, 'password_too_short');

      const salt = newPasswordSalt();
      const passwordHash = await derivePasswordHash(password, salt, env.PASSWORD_PEPPER || '');

      await env.DB.batch([
        env.DB.prepare(
          `UPDATE users
           SET password_hash=?,password_salt=?,password_iterations=?,updated_at=datetime('now')
           WHERE id=?`
        ).bind(passwordHash, salt, PASSWORD_ITERATIONS, target.id),
        env.DB.prepare(`DELETE FROM sessions WHERE user_id=?`).bind(target.id)
      ]);
    }

    return json({ ok: true });
  }

  throw new HttpError(404, 'not_found');
}

export async function handleBootstrapRoutes(request, env, parts) {
  if (parts[1] === 'status' && request.method === 'GET') {
    const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM users`).first();
    return json({ initialized: Number(row?.count || 0) > 0 });
  }

  if (parts[1] === 'admin' && request.method === 'POST') {
    const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM users`).first();
    if (Number(row?.count || 0) > 0) throw new HttpError(409, 'already_initialized');

    const supplied = request.headers.get('x-bootstrap-token') || '';
    if (!env.BOOTSTRAP_TOKEN || supplied !== env.BOOTSTRAP_TOKEN) {
      throw new HttpError(403, 'bootstrap_forbidden');
    }

    const input = await readJson(request);
    const username = String(input.username || '').trim();
    const displayName = String(input.displayName || '').trim();
    const password = String(input.password || '');

    if (username.length < 3 || displayName.length < 2 || password.length < 8) {
      throw new HttpError(400, 'invalid_user_fields');
    }

    const id = crypto.randomUUID();
    const salt = newPasswordSalt();
    const passwordHash = await derivePasswordHash(password, salt, env.PASSWORD_PEPPER || '');

    await env.DB.prepare(
      `INSERT INTO users
        (id,username,display_name,role,password_hash,password_salt,password_iterations)
       VALUES (?,?,?,'admin',?,?,?)`
    ).bind(id, username, displayName, passwordHash, salt, PASSWORD_ITERATIONS).run();

    return json({
      ok: true,
      user: { id, username, displayName, role: 'admin', active: true }
    }, 201);
  }

  throw new HttpError(404, 'not_found');
}

export async function handleHistoryRoute(request, env, user) {
  if (request.method !== 'GET') throw new HttpError(405, 'method_not_allowed');

  const rows = (await env.DB.prepare(
    `SELECT DISTINCT i.id,i.title,i.status,i.started_at,i.completed_at,i.created_at
     FROM inspections i
     WHERE EXISTS (
       SELECT 1 FROM inspection_events e
       WHERE e.inspection_id=i.id AND e.actor_user_id=?
     )
     OR EXISTS (
       SELECT 1
       FROM inspection_gates g
       JOIN assignment_history ah ON ah.inspection_gate_id=g.id
       WHERE g.inspection_id=i.id
         AND (ah.from_user_id=? OR ah.to_user_id=?)
     )
     ORDER BY i.id DESC
     LIMIT 100`
  ).bind(user.id, user.id, user.id).all()).results || [];

  const history = [];

  for (const inspection of rows) {
    const gates = (await env.DB.prepare(
      `SELECT DISTINCT g.gate_no,g.status,g.assignee_user_id
       FROM inspection_gates g
       WHERE g.inspection_id=?
         AND (
           g.assignee_user_id=?
           OR EXISTS (
             SELECT 1
             FROM inspection_events e
             WHERE e.inspection_id=g.inspection_id
               AND e.gate_no=g.gate_no
               AND e.actor_user_id=?
           )
           OR EXISTS (
             SELECT 1
             FROM assignment_history ah
             WHERE ah.inspection_gate_id=g.id
               AND (ah.from_user_id=? OR ah.to_user_id=?)
           )
         )
       ORDER BY g.gate_no`
    ).bind(
      inspection.id,
      user.id,
      user.id,
      user.id,
      user.id
    ).all()).results || [];

    const gateStates = gates.map(gate => {
      let state = gate.status || 'pending';

      if (inspection.status === 'cancelled') {
        state = 'cancelled';
      } else if (gate.assignee_user_id !== user.id) {
        state = 'transferred';
      }

      return {
        gateNo: gate.gate_no,
        state
      };
    });

    history.push({
      id: inspection.id,
      title: inspection.title,
      status: inspection.status,
      startedAt: inspection.started_at,
      completedAt: inspection.completed_at,
      createdAt: inspection.created_at,
      gateNos: gateStates.map(gate => gate.gateNo),
      gateStates
    });
  }

  return json({ history });
}

export async function handleNotificationRoutes(request, env, parts, user) {
  if (parts.length === 2 && request.method === 'GET') {
    return json({ notifications: await listNotifications(env, user.id) });
  }

  if (parts.length === 3 && request.method === 'PATCH') {
    await markNotificationRead(env, user.id, Number(parts[2]));
    return json({ ok: true });
  }

  throw new HttpError(404, 'not_found');
}

export async function handlePushRoutes(request, env, parts, user) {
  if (parts[1] === 'public-key' && request.method === 'GET') {
    return json({ publicKey: env.VAPID_PUBLIC_KEY || '' });
  }

  if (parts[1] === 'subscription' && request.method === 'POST') {
    const input = await readJson(request);
    const endpoint = String(input.endpoint || '');
    const p256dh = String(input.keys?.p256dh || '');
    const auth = String(input.keys?.auth || '');

    if (!endpoint || !p256dh || !auth) throw new HttpError(400, 'invalid_subscription');

    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
    const id = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');

    await env.DB.prepare(
      `INSERT INTO push_subscriptions
        (id,user_id,endpoint,p256dh,auth,user_agent,active)
       VALUES (?,?,?,?,?,?,1)
       ON CONFLICT(endpoint) DO UPDATE SET
         user_id=excluded.user_id,
         p256dh=excluded.p256dh,
         auth=excluded.auth,
         user_agent=excluded.user_agent,
         active=1,
         updated_at=datetime('now')`
    ).bind(
      id,
      user.id,
      endpoint,
      p256dh,
      auth,
      request.headers.get('user-agent') || ''
    ).run();

    return json({ ok: true });
  }

  if (parts[1] === 'subscription' && request.method === 'DELETE') {
    const input = await readJson(request);
    await env.DB.prepare(
      `UPDATE push_subscriptions
       SET active=0,updated_at=datetime('now')
       WHERE endpoint=? AND user_id=?`
    ).bind(String(input.endpoint || ''), user.id).run();

    return json({ ok: true });
  }

  throw new HttpError(404, 'not_found');
}

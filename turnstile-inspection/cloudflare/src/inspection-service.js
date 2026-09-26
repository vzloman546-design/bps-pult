import { GATE_CODES, STATUS_OPTIONS, COMPLETE_REMARK_STATUSES, validGateNo } from './constants.js';
import { HttpError } from './http.js';
import { notifyAdmins, notifyUser } from './notifications.js';

const VALID_STATUS_SET = new Set(STATUS_OPTIONS);

export async function canAccessInspection(env, user, inspectionId) {
  if (user.role === 'admin') return true;

  const assigned = await env.DB.prepare(
    `SELECT 1 AS ok
     FROM inspection_gates
     WHERE inspection_id=? AND assignee_user_id=?
     LIMIT 1`
  ).bind(inspectionId, user.id).first();

  if (assigned?.ok) return true;

  const assignment = await env.DB.prepare(
    `SELECT 1 AS ok
     FROM assignment_history ah
     JOIN inspection_gates g ON g.id=ah.inspection_gate_id
     WHERE g.inspection_id=?
       AND (ah.from_user_id=? OR ah.to_user_id=?)
     LIMIT 1`
  ).bind(inspectionId, user.id, user.id).first();

  if (assignment?.ok) return true;

  const participated = await env.DB.prepare(
    `SELECT 1 AS ok
     FROM inspection_events
     WHERE inspection_id=? AND actor_user_id=?
     LIMIT 1`
  ).bind(inspectionId, user.id).first();

  return !!participated?.ok;
}

export async function broadcastInspection(env, inspectionId, event) {
  if (!env.INSPECTION_ROOM) return;
  const id = env.INSPECTION_ROOM.idFromName(String(inspectionId));
  const stub = env.INSPECTION_ROOM.get(id);
  await stub.fetch('https://inspection-room.internal/broadcast', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(event)
  });
}

export async function getInspectionSummary(env, inspectionId, user) {
  if (!(await canAccessInspection(env, user, inspectionId))) {
    throw new HttpError(403, 'inspection_forbidden');
  }

  const inspection = await env.DB.prepare(
    `SELECT i.*,u.display_name AS created_by_name
     FROM inspections i
     JOIN users u ON u.id=i.created_by
     WHERE i.id=?`
  ).bind(inspectionId).first();

  if (!inspection) throw new HttpError(404, 'inspection_not_found');

  let sql = `
    SELECT g.id,g.gate_no,g.assignee_user_id,g.status,g.started_at,g.completed_at,
           u.display_name AS assignee_name,
           COUNT(c.id) AS total,
           SUM(CASE
             WHEN c.visual<>'' AND c.power<>'' AND c.reader<>'' AND c.final_status<>''
              AND (c.final_status NOT IN ('Требует обслуживания','Неисправно')
                   OR trim(c.remarks)<>'')
             THEN 1 ELSE 0 END) AS complete_count
    FROM inspection_gates g
    LEFT JOIN users u ON u.id=g.assignee_user_id
    LEFT JOIN turnstile_checks c ON c.inspection_gate_id=g.id
    WHERE g.inspection_id=?`;

  const binds = [inspectionId];

  if (user.role !== 'admin') {
    sql += ` AND (
      g.assignee_user_id=?
      OR EXISTS (
        SELECT 1 FROM inspection_events e
        WHERE e.inspection_id=g.inspection_id
          AND e.gate_no=g.gate_no
          AND e.actor_user_id=?
      )
      OR EXISTS (
        SELECT 1 FROM assignment_history ah
        WHERE ah.inspection_gate_id=g.id
          AND (ah.from_user_id=? OR ah.to_user_id=?)
      )
    )`;
    binds.push(user.id, user.id, user.id, user.id);
  }

  sql += ` GROUP BY g.id ORDER BY g.gate_no`;

  const gates = (await env.DB.prepare(sql).bind(...binds).all()).results || [];

  let document = null;

  if (user.role === 'admin') {
    document = inspection.status === 'active'
      ? await env.DB.prepare(
          `SELECT id,version,status,byte_size,ready_at
           FROM documents
           WHERE inspection_id=? AND status='ready'
           ORDER BY version DESC
           LIMIT 1`
        ).bind(inspectionId).first()
      : await env.DB.prepare(
          `SELECT id,version,status,byte_size,ready_at
           FROM documents
           WHERE inspection_id=? AND status<>'superseded'
           ORDER BY version DESC
           LIMIT 1`
        ).bind(inspectionId).first();
  }

  return {
    id: inspection.id,
    title: inspection.title,
    status: inspection.status,
    startedAt: inspection.started_at,
    completedAt: inspection.completed_at,
    createdAt: inspection.created_at,
    createdByName: inspection.created_by_name,
    document: document ? {
      id: document.id,
      version: document.version,
      status: document.status,
      byteSize: document.byte_size,
      readyAt: document.ready_at
    } : null,
    gates: gates.map(g => ({
      id: g.id,
      gateNo: g.gate_no,
      assigneeUserId: g.assignee_user_id,
      assigneeName: g.assignee_name,
      status: g.status,
      startedAt: g.started_at,
      completedAt: g.completed_at,
      total: Number(g.total || 0),
      completed: Number(g.complete_count || 0)
    }))
  };
}

export async function listInspections(env, user) {
  let sql = `
    SELECT DISTINCT i.id,i.title,i.status,i.started_at,i.completed_at,i.created_at
    FROM inspections i
    LEFT JOIN inspection_gates g ON g.inspection_id=i.id`;

  const binds = [];

  if (user.role !== 'admin') {
    sql += ` WHERE
      g.assignee_user_id=?
      OR EXISTS (
        SELECT 1 FROM inspection_events e
        WHERE e.inspection_id=i.id AND e.actor_user_id=?
      )`;
    binds.push(user.id, user.id);
  }

  sql += ` ORDER BY i.id DESC LIMIT 100`;

  return (await env.DB.prepare(sql).bind(...binds).all()).results || [];
}

export async function createInspection(env, user, input) {
  const raw = Array.isArray(input.gates) ? input.gates : [];
  const seen = new Set();
  const gates = [];

  for (const item of raw) {
    const gateNo = Number(item.gateNo);
    if (!validGateNo(gateNo) || seen.has(gateNo)) throw new HttpError(400, 'invalid_gates');
    seen.add(gateNo);

    const assignee = String(item.assigneeUserId || '');
    if (!assignee) throw new HttpError(400, 'assignee_required');

    const target = await env.DB.prepare(
      `SELECT id,active FROM users
       WHERE id=? AND role IN ('admin','inspector')`
    ).bind(assignee).first();

    if (!target || !target.active) throw new HttpError(400, 'invalid_assignee');
    gates.push({ gateNo, assignee });
  }

  if (!gates.length) throw new HttpError(400, 'at_least_one_gate_required');

  const title = String(input.title || '').trim() || 'Технический осмотр';

  const inserted = await env.DB.prepare(
    `INSERT INTO inspections(title,status,created_by,started_at)
     VALUES (?,'active',?,datetime('now'))
     RETURNING id`
  ).bind(title, user.id).first();

  const inspectionId = inserted.id;

  for (const assignment of gates) {
    const gate = await env.DB.prepare(
      `INSERT INTO inspection_gates
        (inspection_id,gate_no,assignee_user_id,status)
       VALUES (?,?,?,'pending')
       RETURNING id`
    ).bind(inspectionId, assignment.gateNo, assignment.assignee).first();

    const statements = GATE_CODES[assignment.gateNo].map(code =>
      env.DB.prepare(
        `INSERT INTO turnstile_checks
          (inspection_gate_id,turnstile_code,last_updated_by)
         VALUES (?,?,NULL)`
      ).bind(gate.id, code)
    );

    await env.DB.batch(statements);

    await env.DB.prepare(
      `INSERT INTO assignment_history
        (inspection_gate_id,to_user_id,changed_by)
       VALUES (?,?,?)`
    ).bind(gate.id, assignment.assignee, user.id).run();

    await env.DB.prepare(
      `INSERT INTO inspection_events
        (inspection_id,gate_no,actor_user_id,event_type,payload_json)
       VALUES (?,?,?,?,?)`
    ).bind(
      inspectionId,
      assignment.gateNo,
      user.id,
      'gate_assigned',
      JSON.stringify({ toUserId: assignment.assignee })
    ).run();

    await notifyUser(
      env,
      assignment.assignee,
      'assignment',
      `Назначен ${assignment.gateNo} гейт`,
      `Открыт осмотр «${title}»`,
      inspectionId,
      assignment.gateNo
    );
  }

  await broadcastInspection(env, inspectionId, {
    type: 'inspection_started',
    inspectionId
  });

  return getInspectionSummary(env, inspectionId, user);
}

export async function cancelInspection(env, inspectionId, actor) {
  const inspection = await env.DB.prepare(
    `SELECT * FROM inspections WHERE id=?`
  ).bind(inspectionId).first();

  if (!inspection) throw new HttpError(404, 'inspection_not_found');
  if (!['active','draft'].includes(inspection.status)) {
    throw new HttpError(409, 'inspection_not_cancellable');
  }

  const assignees = (await env.DB.prepare(
    `SELECT DISTINCT assignee_user_id
     FROM inspection_gates
     WHERE inspection_id=? AND assignee_user_id IS NOT NULL`
  ).bind(inspectionId).all()).results || [];

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE inspections
       SET status='cancelled',completed_at=NULL,updated_at=datetime('now')
       WHERE id=?`
    ).bind(inspectionId),
    env.DB.prepare(
      `INSERT INTO inspection_events
        (inspection_id,actor_user_id,event_type,payload_json)
       VALUES (?,?,?,?)`
    ).bind(inspectionId, actor.id, 'inspection_cancelled', '{}')
  ]);

  for (const row of assignees) {
    await notifyUser(
      env,
      row.assignee_user_id,
      'inspection_cancelled',
      'Осмотр отменён',
      inspection.title ? `Осмотр «${inspection.title}» отменён администратором.` : 'Осмотр отменён администратором.',
      inspectionId,
      null
    );
  }

  await broadcastInspection(env, inspectionId, {
    type: 'inspection_cancelled',
    inspectionId
  });
}

export async function getGate(env, inspectionId, gateNo, user) {
  if (!validGateNo(gateNo)) throw new HttpError(404, 'gate_not_found');

  const gate = await env.DB.prepare(
    `SELECT g.*,u.display_name AS assignee_name
     FROM inspection_gates g
     LEFT JOIN users u ON u.id=g.assignee_user_id
     WHERE g.inspection_id=? AND g.gate_no=?`
  ).bind(inspectionId, gateNo).first();

  if (!gate) throw new HttpError(404, 'gate_not_found');

  let readOnly = false;

  if (user.role !== 'admin' && gate.assignee_user_id !== user.id) {
    const participated = await env.DB.prepare(
      `SELECT 1 AS ok
       WHERE EXISTS (
         SELECT 1 FROM inspection_events
         WHERE inspection_id=? AND gate_no=? AND actor_user_id=?
       )
       OR EXISTS (
         SELECT 1
         FROM assignment_history ah
         JOIN inspection_gates gh ON gh.id=ah.inspection_gate_id
         WHERE gh.inspection_id=? AND gh.gate_no=?
           AND (ah.from_user_id=? OR ah.to_user_id=?)
       )
       LIMIT 1`
    ).bind(
      inspectionId, gateNo, user.id,
      inspectionId, gateNo, user.id, user.id
    ).first();

    if (!participated?.ok) throw new HttpError(403, 'gate_forbidden');
    readOnly = true;
  }

  const inspection = await env.DB.prepare(
    `SELECT status FROM inspections WHERE id=?`
  ).bind(inspectionId).first();

  if (inspection?.status !== 'active') readOnly = true;

  const checks = (await env.DB.prepare(
    `SELECT c.turnstile_code,c.visual,c.power,c.reader,c.final_status,c.remarks,
            c.last_updated_by,c.updated_at,
            editor.display_name AS last_updated_by_name
     FROM turnstile_checks c
     LEFT JOIN users editor ON editor.id=c.last_updated_by
     WHERE c.inspection_gate_id=?
     ORDER BY c.id`
  ).bind(gate.id).all()).results || [];

  return {
    gateNo,
    inspectionId,
    status: gate.status,
    assigneeUserId: gate.assignee_user_id,
    assigneeName: gate.assignee_name,
    readOnly,
    checks: checks.map(c => ({
      code: c.turnstile_code,
      visual: c.visual,
      power: c.power,
      reader: c.reader,
      status: c.final_status,
      remarks: c.remarks,
      lastUpdatedBy: c.last_updated_by,
      lastUpdatedByName: c.last_updated_by_name,
      updatedAt: c.updated_at
    }))
  };
}

export async function reassignGate(env, inspectionId, gateNo, toUserId, actor) {
  const gate = await env.DB.prepare(
    `SELECT * FROM inspection_gates
     WHERE inspection_id=? AND gate_no=?`
  ).bind(inspectionId, gateNo).first();

  if (!gate) throw new HttpError(404, 'gate_not_found');

  const inspection = await env.DB.prepare(
    `SELECT status FROM inspections WHERE id=?`
  ).bind(inspectionId).first();

  if (!inspection || inspection.status !== 'active') {
    throw new HttpError(409, 'inspection_not_active');
  }

  if (gate.status === 'completed') {
    throw new HttpError(409, 'gate_already_completed');
  }

  const target = await env.DB.prepare(
    `SELECT id,active FROM users WHERE id=?`
  ).bind(toUserId).first();

  if (!target || !target.active) throw new HttpError(400, 'invalid_assignee');
  if (gate.assignee_user_id === toUserId) return;

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE inspection_gates
       SET assignee_user_id=?,updated_at=datetime('now')
       WHERE id=?`
    ).bind(toUserId, gate.id),
    env.DB.prepare(
      `INSERT INTO assignment_history
        (inspection_gate_id,from_user_id,to_user_id,changed_by)
       VALUES (?,?,?,?)`
    ).bind(gate.id, gate.assignee_user_id, toUserId, actor.id),
    env.DB.prepare(
      `INSERT INTO inspection_events
        (inspection_id,gate_no,actor_user_id,event_type,payload_json)
       VALUES (?,?,?,?,?)`
    ).bind(
      inspectionId,
      gateNo,
      actor.id,
      'gate_reassigned',
      JSON.stringify({ fromUserId: gate.assignee_user_id, toUserId })
    )
  ]);

  await notifyUser(
    env,
    toUserId,
    'assignment',
    `Назначен ${gateNo} гейт`,
    'Гейт был переназначен вам. Уже заполненные данные сохранены.',
    inspectionId,
    gateNo
  );

  await broadcastInspection(env, inspectionId, {
    type: 'gate_reassigned',
    inspectionId,
    gateNo,
    fromUserId: gate.assignee_user_id,
    toUserId
  });
}

export async function updateTurnstile(env, inspectionId, gateNo, code, patch, user) {
  const gate = await env.DB.prepare(
    `SELECT * FROM inspection_gates
     WHERE inspection_id=? AND gate_no=?`
  ).bind(inspectionId, gateNo).first();

  if (!gate) throw new HttpError(404, 'gate_not_found');

  const inspection = await env.DB.prepare(
    `SELECT status FROM inspections WHERE id=?`
  ).bind(inspectionId).first();

  if (!inspection || inspection.status !== 'active') {
    throw new HttpError(409, 'inspection_not_active');
  }

  if (user.role !== 'admin' && gate.assignee_user_id !== user.id) {
    throw new HttpError(403, 'gate_forbidden');
  }

  const current = await env.DB.prepare(
    `SELECT * FROM turnstile_checks
     WHERE inspection_gate_id=? AND turnstile_code=?`
  ).bind(gate.id, code).first();

  if (!current) throw new HttpError(404, 'turnstile_not_found');

  const next = {
    visual: patch.visual == null ? current.visual : String(patch.visual),
    power: patch.power == null ? current.power : String(patch.power),
    reader: patch.reader == null ? current.reader : String(patch.reader),
    final_status: patch.status == null ? current.final_status : String(patch.status),
    remarks: patch.remarks == null ? current.remarks : String(patch.remarks)
  };

  for (const key of ['visual', 'power', 'reader', 'final_status']) {
    if (!VALID_STATUS_SET.has(next[key])) throw new HttpError(400, 'invalid_status');
  }

  await env.DB.prepare(
    `UPDATE turnstile_checks
     SET visual=?,power=?,reader=?,final_status=?,remarks=?,
         last_updated_by=?,updated_at=datetime('now')
     WHERE id=?`
  ).bind(
    next.visual,
    next.power,
    next.reader,
    next.final_status,
    next.remarks,
    user.id,
    current.id
  ).run();

  const changed = {};
  const fieldMap = [
    ['visual', 'visual'],
    ['power', 'power'],
    ['reader', 'reader'],
    ['status', 'final_status'],
    ['remarks', 'remarks']
  ];

  for (const [apiKey, dbKey] of fieldMap) {
    const before = current[dbKey] ?? '';
    const after = next[dbKey] ?? '';
    if (before !== after) changed[apiKey] = { before, after };
  }

  await env.DB.prepare(
    `INSERT INTO inspection_events
      (inspection_id,gate_no,turnstile_code,actor_user_id,event_type,payload_json)
     VALUES (?,?,?,?,?,?)`
  ).bind(
    inspectionId,
    gateNo,
    code,
    user.id,
    'turnstile_updated',
    JSON.stringify({ changed })
  ).run();

  return recomputeCompletion(env, inspectionId, gateNo, user.id);
}

export async function reopenGate(env, inspectionId, gateNo, actor) {
  const gate = await env.DB.prepare(
    `SELECT * FROM inspection_gates
     WHERE inspection_id=? AND gate_no=?`
  ).bind(inspectionId, gateNo).first();

  if (!gate) throw new HttpError(404, 'gate_not_found');

  const inspection = await env.DB.prepare(
    `SELECT status FROM inspections WHERE id=?`
  ).bind(inspectionId).first();

  if (!inspection) throw new HttpError(404, 'inspection_not_found');
  if (inspection.status !== 'completed') {
    throw new HttpError(409, 'inspection_not_completed');
  }
  if (gate.status !== 'completed') {
    throw new HttpError(409, 'gate_not_completed');
  }

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE inspections
       SET status='active',completed_at=NULL,updated_at=datetime('now')
       WHERE id=?`
    ).bind(inspectionId),
    env.DB.prepare(
      `UPDATE inspection_gates
       SET status='in_progress',completed_at=NULL,updated_at=datetime('now')
       WHERE id=?`
    ).bind(gate.id),
    env.DB.prepare(
      `UPDATE documents
       SET status='superseded'
       WHERE inspection_id=? AND status='pending'`
    ).bind(inspectionId),
    env.DB.prepare(
      `INSERT INTO inspection_events
        (inspection_id,gate_no,actor_user_id,event_type,payload_json)
       VALUES (?,?,?,?,?)`
    ).bind(
      inspectionId,
      gateNo,
      actor.id,
      'gate_reopened',
      JSON.stringify({ previousStatus: gate.status })
    )
  ]);

  if (gate.assignee_user_id) {
    await notifyUser(
      env,
      gate.assignee_user_id,
      'gate_reopened',
      `${gateNo} гейт открыт для исправления`,
      'Администратор вернул гейт в работу. Откройте приложение и внесите исправления.',
      inspectionId,
      gateNo
    );
  }

  await broadcastInspection(env, inspectionId, {
    type: 'gate_reopened',
    inspectionId,
    gateNo
  });
}

export async function recomputeCompletion(env, inspectionId, gateNo, actorUserId) {
  const gate = await env.DB.prepare(
    `SELECT id,status FROM inspection_gates
     WHERE inspection_id=? AND gate_no=?`
  ).bind(inspectionId, gateNo).first();

  if (!gate) throw new HttpError(404, 'gate_not_found');

  const counts = await env.DB.prepare(
    `SELECT COUNT(*) AS total,
            SUM(CASE
              WHEN visual<>'' AND power<>'' AND reader<>'' AND final_status<>''
               AND (final_status NOT IN ('Требует обслуживания','Неисправно')
                    OR trim(remarks)<>'')
              THEN 1 ELSE 0 END) AS complete_count
     FROM turnstile_checks
     WHERE inspection_gate_id=?`
  ).bind(gate.id).first();

  const total = Number(counts?.total || 0);
  const complete = Number(counts?.complete_count || 0);
  const done = total > 0 && total === complete;
  const newStatus = done ? 'completed' : (complete > 0 ? 'in_progress' : 'pending');

  if (newStatus !== gate.status) {
    await env.DB.prepare(
      `UPDATE inspection_gates
       SET status=?,
           started_at=CASE
             WHEN ?='in_progress' AND started_at IS NULL THEN datetime('now')
             ELSE started_at END,
           completed_at=CASE WHEN ?='completed' THEN datetime('now') ELSE NULL END,
           updated_at=datetime('now')
       WHERE id=?`
    ).bind(newStatus, newStatus, newStatus, gate.id).run();

    await env.DB.prepare(
      `INSERT INTO inspection_events
        (inspection_id,gate_no,actor_user_id,event_type,payload_json)
       VALUES (?,?,?,?,?)`
    ).bind(
      inspectionId,
      gateNo,
      actorUserId,
      'gate_status_changed',
      JSON.stringify({ status: newStatus })
    ).run();

  }

  const all = await env.DB.prepare(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS complete_count
     FROM inspection_gates
     WHERE inspection_id=?`
  ).bind(inspectionId).first();

  const allDone =
    Number(all?.total || 0) > 0 &&
    Number(all?.total || 0) === Number(all?.complete_count || 0);

  const inspection = await env.DB.prepare(
    `SELECT status,current_document_version
     FROM inspections WHERE id=?`
  ).bind(inspectionId).first();

  if (allDone && inspection?.status === 'active') {
    const version = Number(inspection.current_document_version || 0) + 1;

    await env.DB.batch([
      env.DB.prepare(
        `UPDATE inspections
         SET status='completed',completed_at=datetime('now'),
             current_document_version=?,updated_at=datetime('now')
         WHERE id=?`
      ).bind(version, inspectionId),
      env.DB.prepare(
        `INSERT INTO documents(inspection_id,version,status)
         VALUES (?,?,'pending')`
      ).bind(inspectionId, version),
      env.DB.prepare(
        `INSERT INTO inspection_events
          (inspection_id,actor_user_id,event_type,payload_json)
         VALUES (?,?,?,?)`
      ).bind(
        inspectionId,
        actorUserId,
        'inspection_completed',
        JSON.stringify({ documentVersion: version })
      )
    ]);

    await notifyAdmins(
      env,
      'inspection_completed',
      'Осмотр завершён',
      'Все выбранные гейты заполнены. Подготавливается акт.',
      inspectionId,
      null
    );

    await broadcastInspection(env, inspectionId, {
      type: 'inspection_completed',
      inspectionId,
      documentVersion: version
    });

    return {
      gateStatus: newStatus,
      inspectionStatus: 'completed',
      documentVersion: version
    };
  }

  await broadcastInspection(env, inspectionId, {
    type: 'gate_progress',
    inspectionId,
    gateNo,
    status: newStatus,
    completed: complete,
    total
  });

  return {
    gateStatus: newStatus,
    inspectionStatus: inspection?.status || 'active',
    completed: complete,
    total
  };
}

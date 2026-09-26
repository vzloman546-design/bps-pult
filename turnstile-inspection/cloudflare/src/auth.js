import { HttpError } from './http.js';

export const PASSWORD_ITERATIONS = 50000;

function bytesToHex(bytes) {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function randomHex(size = 32) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

async function sha256Hex(text) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return bytesToHex(new Uint8Array(hash));
}

export async function derivePasswordHash(
  password,
  saltHex,
  pepper = '',
  iterations = PASSWORD_ITERATIONS
) {
  const cost = Math.max(10000, Math.min(100000, Number(iterations || PASSWORD_ITERATIONS)));
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(String(password) + String(pepper)),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: hexToBytes(saltHex), iterations: cost },
    key,
    256
  );
  return bytesToHex(new Uint8Array(bits));
}

function constantTimeHexEqual(left, right) {
  left = String(left || '');
  right = String(right || '');
  const length = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;

  for (let index = 0; index < length; index++) {
    diff |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }

  return diff === 0;
}

function loginThrottleIdentity(username, request) {
  const ip =
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for') ||
    'unknown';
  return String(username || '').trim().toLowerCase() + '|' + ip;
}

async function throttleKey(username, request) {
  return sha256Hex(loginThrottleIdentity(username, request));
}

async function assertLoginAllowed(username, request, env) {
  const key = await throttleKey(username, request);
  const row = await env.DB.prepare(
    `SELECT failures,window_started_at,blocked_until
     FROM auth_throttle
     WHERE throttle_key=?`
  ).bind(key).first();

  if (row?.blocked_until) {
    const blockedUntil = Date.parse(row.blocked_until);
    if (Number.isFinite(blockedUntil) && blockedUntil > Date.now()) {
      throw new HttpError(429, 'too_many_login_attempts');
    }
  }

  return key;
}

async function recordLoginFailure(key, env) {
  const row = await env.DB.prepare(
    `SELECT failures,window_started_at
     FROM auth_throttle
     WHERE throttle_key=?`
  ).bind(key).first();

  const now = Date.now();
  const previousStart = row?.window_started_at ? Date.parse(row.window_started_at) : NaN;
  const sameWindow = Number.isFinite(previousStart) && now - previousStart < 15 * 60 * 1000;
  const failures = sameWindow ? Number(row?.failures || 0) + 1 : 1;
  const windowStarted = sameWindow ? row.window_started_at : new Date(now).toISOString();
  const blockedUntil = failures >= 8
    ? new Date(now + 15 * 60 * 1000).toISOString()
    : null;

  await env.DB.prepare(
    `INSERT INTO auth_throttle
      (throttle_key,failures,window_started_at,blocked_until,updated_at)
     VALUES (?,?,?,?,datetime('now'))
     ON CONFLICT(throttle_key) DO UPDATE SET
       failures=excluded.failures,
       window_started_at=excluded.window_started_at,
       blocked_until=excluded.blocked_until,
       updated_at=datetime('now')`
  ).bind(key, failures, windowStarted, blockedUntil).run();
}

async function clearLoginFailures(key, env) {
  await env.DB.prepare(
    `DELETE FROM auth_throttle WHERE throttle_key=?`
  ).bind(key).run();
}

export function newPasswordSalt() {
  return randomHex(16);
}

export function safeUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    active: !!row.active
  };
}

function bearerToken(request) {
  const value = request.headers.get('authorization') || '';
  return value.toLowerCase().startsWith('bearer ') ? value.slice(7).trim() : '';
}

function websocketToken(request) {
  const protocols = (request.headers.get('sec-websocket-protocol') || '')
    .split(',')
    .map(v => v.trim());
  return protocols[0] === 'turnstile-inspection' ? (protocols[1] || '') : '';
}

async function sessionTokenHash(token, env) {
  return sha256Hex(String(token) + String(env.SESSION_PEPPER || ''));
}

export async function createSession(userId, request, env) {
  const token = randomHex(32);
  const tokenHash = await sessionTokenHash(token, env);
  const ttlDays = Math.max(1, Math.min(90, Number(env.SESSION_TTL_DAYS || 30)));
  const expiresAt = new Date(Date.now() + ttlDays * 86400000).toISOString();

  await env.DB.prepare(
    `INSERT INTO sessions (id,user_id,token_hash,expires_at,user_agent)
     VALUES (?,?,?,?,?)`
  ).bind(
    crypto.randomUUID(),
    userId,
    tokenHash,
    expiresAt,
    request.headers.get('user-agent') || ''
  ).run();

  return { token, expiresAt };
}

export async function resolveUserFromToken(token, env) {
  if (!token) return null;
  const tokenHash = await sessionTokenHash(token, env);

  const row = await env.DB.prepare(
    `SELECT u.id,u.username,u.display_name,u.role,u.active,
            s.id AS session_id,s.expires_at
     FROM sessions s
     JOIN users u ON u.id=s.user_id
     WHERE s.token_hash=?
       AND s.expires_at>datetime('now')
       AND u.active=1`
  ).bind(tokenHash).first();

  if (!row) return null;

  await env.DB.prepare(
    `UPDATE sessions SET last_seen_at=datetime('now') WHERE id=?`
  ).bind(row.session_id).run();

  return row;
}

export async function requireUser(request, env, options = {}) {
  const token = options.websocket ? websocketToken(request) : bearerToken(request);
  const user = await resolveUserFromToken(token, env);
  if (!user) throw new HttpError(401, 'unauthorized');
  return user;
}

export function requireAdmin(user) {
  if (user.role !== 'admin') throw new HttpError(403, 'admin_required');
}

export async function login(username, password, request, env) {
  const normalizedUsername = String(username || '').trim();
  const throttle = await assertLoginAllowed(normalizedUsername, request, env);

  const user = await env.DB.prepare(
    `SELECT * FROM users WHERE username=? COLLATE NOCASE AND active=1`
  ).bind(normalizedUsername).first();

  if (!user) {
    await recordLoginFailure(throttle, env);
    throw new HttpError(401, 'invalid_credentials');
  }

  const candidate = await derivePasswordHash(
    String(password || ''),
    user.password_salt,
    env.PASSWORD_PEPPER || '',
    user.password_iterations || PASSWORD_ITERATIONS
  );

  if (!constantTimeHexEqual(candidate, user.password_hash)) {
    await recordLoginFailure(throttle, env);
    throw new HttpError(401, 'invalid_credentials');
  }

  await clearLoginFailures(throttle, env);

  return {
    user: safeUser(user),
    ...(await createSession(user.id, request, env))
  };
}

export async function logout(request, env) {
  const token = bearerToken(request);
  if (!token) return;
  const tokenHash = await sessionTokenHash(token, env);
  await env.DB.prepare(`DELETE FROM sessions WHERE token_hash=?`).bind(tokenHash).run();
}

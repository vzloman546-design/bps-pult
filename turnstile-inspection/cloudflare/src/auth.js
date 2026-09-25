import { HttpError } from './http.js';

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

export async function derivePasswordHash(password, saltHex, pepper = '') {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(String(password) + String(pepper)),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: hexToBytes(saltHex), iterations: 120000 },
    key,
    256
  );
  return bytesToHex(new Uint8Array(bits));
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

  env.DB.prepare(
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
  const user = await env.DB.prepare(
    `SELECT * FROM users WHERE username=? COLLATE NOCASE AND active=1`
  ).bind(String(username || '').trim()).first();

  if (!user) throw new HttpError(401, 'invalid_credentials');

  const candidate = await derivePasswordHash(
    String(password || ''),
    user.password_salt,
    env.PASSWORD_PEPPER || ''
  );

  if (candidate !== user.password_hash) throw new HttpError(401, 'invalid_credentials');

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

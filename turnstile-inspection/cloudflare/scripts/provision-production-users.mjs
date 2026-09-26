import { readFile } from 'node:fs/promises';

const apiBase = String(process.env.TURNSTILE_API_BASE || '').replace(/\/$/, '');
const bootstrapToken = String(process.env.TURNSTILE_BOOTSTRAP_TOKEN || '');
const usersFile = new URL('./users.production.json', import.meta.url);

if (!apiBase) throw new Error('TURNSTILE_API_BASE is required');
if (!bootstrapToken) throw new Error('TURNSTILE_BOOTSTRAP_TOKEN is required');

const config = JSON.parse(await readFile(usersFile, 'utf8'));
const [admin, ...employees] = config.users || [];

if (!admin || admin.role !== 'admin') {
  throw new Error('First configured user must be the administrator');
}

function passwordFor(user) {
  const value = String(process.env[user.passwordEnv] || '');
  if (value.length < 8) {
    throw new Error('Missing or too short secret: ' + user.passwordEnv);
  }
  return value;
}

async function call(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.token) headers.set('authorization', 'Bearer ' + options.token);
  if (options.json !== undefined) headers.set('content-type', 'application/json');

  const response = await fetch(apiBase + path, {
    method: options.method || 'GET',
    headers,
    body: options.json === undefined ? undefined : JSON.stringify(options.json)
  });

  let body = null;
  try { body = await response.json(); } catch {}

  if (!response.ok) {
    const error = new Error(body?.error || ('HTTP ' + response.status));
    error.status = response.status;
    error.body = body;
    throw error;
  }

  return body;
}

const status = await call('/api/bootstrap/status');

if (!status.initialized) {
  await call('/api/bootstrap/admin', {
    method: 'POST',
    headers: { 'x-bootstrap-token': bootstrapToken },
    json: {
      username: admin.username,
      displayName: admin.displayName,
      password: passwordFor(admin)
    }
  });
}

const login = await call('/api/auth/login', {
  method: 'POST',
  json: {
    username: admin.username,
    password: passwordFor(admin)
  }
});

const token = login.token;
const existing = await call('/api/users', { token });
const byUsername = new Map((existing.users || []).map(user => [user.username.toLowerCase(), user]));

for (const employee of employees) {
  const current = byUsername.get(employee.username.toLowerCase());

  if (!current) {
    await call('/api/users', {
      method: 'POST',
      token,
      json: {
        username: employee.username,
        displayName: employee.displayName,
        password: passwordFor(employee),
        role: 'inspector'
      }
    });
    continue;
  }

  await call('/api/users/' + encodeURIComponent(current.id), {
    method: 'PATCH',
    token,
    json: {
      displayName: employee.displayName,
      active: true,
      role: 'inspector'
    }
  });
}

console.log('production-users-ready');

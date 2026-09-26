import { readFile } from 'node:fs/promises';
import { randomBytes, pbkdf2Sync } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const config = JSON.parse(
  await readFile(new URL('./users.production.json', import.meta.url), 'utf8')
);

let passwords = {};
try {
  passwords = JSON.parse(String(process.env.TURNSTILE_USER_PASSWORDS_JSON || '{}'));
} catch {
  throw new Error('TURNSTILE_USER_PASSWORDS_JSON must be valid JSON');
}

function saltHex() {
  return randomBytes(16).toString('hex');
}

function hashPassword(password, salt, iterations = 50000) {
  return pbkdf2Sync(
    Buffer.from(String(password), 'utf8'),
    Buffer.from(salt, 'hex'),
    iterations,
    32,
    'sha256'
  ).toString('hex');
}

const statements = [];

for (const user of config.users || []) {
  const password = String(passwords[user.username] || '');
  if (password.length < 8) {
    throw new Error('Missing or too short password for ' + user.username);
  }

  const salt = saltHex();
  const hash = hashPassword(password, salt, 50000);

  const username = user.username.replace(/'/g, "''");
  const saltSql = salt.replace(/'/g, "''");
  const hashSql = hash.replace(/'/g, "''");

  statements.push(
    `UPDATE users
     SET password_hash='${hashSql}',
         password_salt='${saltSql}',
         password_iterations=50000,
         updated_at=datetime('now')
     WHERE username='${username}' COLLATE NOCASE;`
  );

  statements.push(
    `DELETE FROM sessions
     WHERE user_id=(SELECT id FROM users WHERE username='${username}' COLLATE NOCASE);`
  );
}

statements.push(`DELETE FROM auth_throttle;`);

const sql = statements.join('\n');

execFileSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  [
    'wrangler',
    'd1',
    'execute',
    'turnstile-inspection',
    '--remote',
    '--yes',
    '--config',
    'wrangler.production.toml',
    '--command',
    sql
  ],
  {
    cwd: new URL('..', import.meta.url),
    stdio: 'inherit',
    env: process.env
  }
);

console.log('production-passwords-synchronized');

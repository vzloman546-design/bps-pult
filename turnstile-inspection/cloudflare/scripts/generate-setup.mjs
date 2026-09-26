import { generateKeyPairSync, randomBytes } from 'node:crypto';

function b64url(buffer) {
  return Buffer.from(buffer).toString('base64url');
}

function decodeB64url(value) {
  return Buffer.from(value, 'base64url');
}

function randomSecret(bytes = 32) {
  return b64url(randomBytes(bytes));
}

const { privateKey } = generateKeyPairSync('ec', {
  namedCurve: 'prime256v1'
});

const jwk = privateKey.export({ format: 'jwk' });

if (!jwk.x || !jwk.y || !jwk.d) {
  throw new Error('Не удалось сформировать P-256 VAPID ключи');
}

const publicBytes = Buffer.concat([
  Buffer.from([0x04]),
  decodeB64url(jwk.x),
  decodeB64url(jwk.y)
]);

const values = {
  SESSION_PEPPER: randomSecret(),
  PASSWORD_PEPPER: randomSecret(),
  BOOTSTRAP_TOKEN: randomSecret(),
  VAPID_PUBLIC_KEY: b64url(publicBytes),
  VAPID_PRIVATE_KEY: jwk.d
};

console.log(JSON.stringify(values, null, 2));
console.error('\nСохрани вывод только на время настройки Cloudflare. Не коммить эти значения в GitHub.');

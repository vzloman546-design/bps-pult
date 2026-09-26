import { generateKeyPairSync, randomBytes } from 'node:crypto';

function b64url(buffer) {
  return Buffer.from(buffer).toString('base64url');
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

const values = {
  BOOTSTRAP_TOKEN: randomSecret(),
  VAPID_KEYPAIR_JWK: JSON.stringify({
    kty: 'EC',
    crv: 'P-256',
    x: jwk.x,
    y: jwk.y,
    d: jwk.d
  })
};

console.log(JSON.stringify(values, null, 2));

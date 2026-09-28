import { buildPushPayload } from '@block65/webcrypto-web-push';

function b64urlToBytes(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function bytesToB64url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function vapidKeys(env) {
  if (!env.VAPID_KEYPAIR_JWK || !env.VAPID_SUBJECT) return null;

  try {
    const jwk = JSON.parse(env.VAPID_KEYPAIR_JWK);
    if (!jwk.x || !jwk.y || !jwk.d) return null;

    const x = b64urlToBytes(jwk.x);
    const y = b64urlToBytes(jwk.y);
    if (x.length !== 32 || y.length !== 32) return null;

    const publicBytes = new Uint8Array(65);
    publicBytes[0] = 0x04;
    publicBytes.set(x, 1);
    publicBytes.set(y, 33);

    return {
      subject: env.VAPID_SUBJECT,
      publicKey: bytesToB64url(publicBytes),
      privateKey: jwk.d
    };
  } catch {
    return null;
  }
}

export function vapidPublicKey(env) {
  return vapidKeys(env)?.publicKey || '';
}

async function recordPushDelivery(env, row, userId, response, error = null) {
  try {
    await env.DB.prepare(
      `INSERT INTO push_delivery_log
        (subscription_id,user_id,status_code,ok,error_text)
       VALUES (?,?,?,?,?)`
    ).bind(
      row?.id || null,
      userId,
      response?.status || null,
      response?.ok ? 1 : 0,
      error ? String(error?.message || error).slice(0, 500) : null
    ).run();
  } catch (logError) {
    console.error('push_delivery_log_failed', logError);
  }
}

export async function sendPushToUser(env, userId, notification) {
  const vapid = vapidKeys(env);
  if (!vapid) return { delivered: 0, skipped: true };

  const rows = (await env.DB.prepare(
    `SELECT id,endpoint,p256dh,auth
     FROM push_subscriptions
     WHERE user_id=? AND active=1`
  ).bind(userId).all()).results || [];

  let delivered = 0;

  for (const row of rows) {
    try {
      const subscription = {
        endpoint: row.endpoint,
        expirationTime: null,
        keys: {
          p256dh: row.p256dh,
          auth: row.auth
        }
      };

      const message = {
        data: JSON.stringify(notification),
        options: {
          ttl: 60 * 60 * 12,
          urgency: 'high'
        }
      };

      const payload = await buildPushPayload(message, subscription, vapid);
      const response = await fetch(subscription.endpoint, payload);
      await recordPushDelivery(env, row, userId, response);

      if (response.ok) {
        delivered++;
      } else if (response.status === 404 || response.status === 410) {
        await env.DB.prepare(
          `UPDATE push_subscriptions
           SET active=0,updated_at=datetime('now')
           WHERE id=?`
        ).bind(row.id).run();
      }
    } catch (error) {
      await recordPushDelivery(env, row, userId, null, error);
      console.error('push_send_failed', error);
    }
  }

  return { delivered, skipped: false };
}

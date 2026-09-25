import { buildPushPayload } from '@block65/webcrypto-web-push';

function configured(env) {
  return !!(
    env.VAPID_PUBLIC_KEY &&
    env.VAPID_PRIVATE_KEY &&
    env.VAPID_SUBJECT
  );
}

export async function sendPushToUser(env, userId, notification) {
  if (!configured(env)) return { delivered: 0, skipped: true };

  const rows = (await env.DB.prepare(
    `SELECT id,endpoint,p256dh,auth
     FROM push_subscriptions
     WHERE user_id=? AND active=1`
  ).bind(userId).all()).results || [];

  const vapid = {
    subject: env.VAPID_SUBJECT,
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY
  };

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
          ttl: 60 * 60 * 12
        }
      };

      const payload = await buildPushPayload(message, subscription, vapid);
      const response = await fetch(subscription.endpoint, payload);

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
      console.error('push_send_failed', error);
    }
  }

  return { delivered, skipped: false };
}

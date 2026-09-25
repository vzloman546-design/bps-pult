import { sendPushToUser } from './push.js';

export async function notifyUser(env, userId, type, title, body, inspectionId = null, gateNo = null) {
  await env.DB.prepare(
    `INSERT INTO notifications
      (user_id,type,title,body,inspection_id,gate_no)
     VALUES (?,?,?,?,?,?)`
  ).bind(userId, type, title, body, inspectionId, gateNo).run();

  await sendPushToUser(env, userId, {
    title,
    body,
    type,
    inspectionId,
    gateNo,
    url: inspectionId ? `./team.html?inspection=${inspectionId}` : './team.html'
  }).catch(error => console.error('push_notification_failed', error));
}

export async function notifyAdmins(env, type, title, body, inspectionId = null, gateNo = null) {
  const rows = await env.DB.prepare(
    `SELECT id FROM users WHERE role='admin' AND active=1`
  ).all();

  for (const row of rows.results || []) {
    await notifyUser(env, row.id, type, title, body, inspectionId, gateNo);
  }
}

export async function listNotifications(env, userId) {
  const rows = await env.DB.prepare(
    `SELECT id,type,title,body,inspection_id,gate_no,read_at,created_at
     FROM notifications
     WHERE user_id=?
     ORDER BY id DESC
     LIMIT 100`
  ).bind(userId).all();

  return rows.results || [];
}

export async function markNotificationRead(env, userId, notificationId) {
  await env.DB.prepare(
    `UPDATE notifications
     SET read_at=datetime('now')
     WHERE id=? AND user_id=?`
  ).bind(notificationId, userId).run();
}

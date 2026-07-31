'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const push = fs.readFileSync(path.join(root, 'push-notifications.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const events = fs.readFileSync(path.join(root, 'event-ui.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

assert.match(push, /https:\/\/bps-pult-push\.vzloman546\.workers\.dev/);
assert.match(push, /Notification\.requestPermission\(\)/);
assert.match(push, /userVisibleOnly:\s*true/);
assert.match(push, /applicationServerKey/);
assert.match(push, /\/api\/config/);
assert.match(push, /\/api\/pair/);
assert.match(push, /\/api\/test/);
assert.match(push, /\/api\/reminders/);
assert.match(push, /QUEUE_KEY/);
assert.match(push, /REGISTRY_KEY/);
assert.match(push, /async function reconcile/);
assert.doesNotMatch(push, /VAPID_PRIVATE_KEY|PAIRING_CODE\s*=/, 'Секреты не должны попадать во frontend');

assert.match(app, /function notificationSettingsHtml/);
assert.match(app, /data-action="enable-push"/);
assert.match(app, /data-action="test-push"/);
assert.match(app, /data-action="disable-push"/);
assert.match(app, /key:`task:\$\{task\.id\}:due`/);
assert.match(app, /key:`event:\$\{event\.id\}:start`/);
assert.match(app, /key:`event:\$\{event\.id\}:doors`/);
assert.match(app, /key:'backup:stale'/);
assert.match(app, /await reconcilePushNotifications\(\)/);
assert.match(events, /await reconcilePushNotifications\(\)/);

assert.match(sw, /addEventListener\("push"/);
assert.match(sw, /showNotification/);
assert.match(sw, /addEventListener\("notificationclick"/);
assert.match(sw, /clients\.openWindow/);
assert.match(html, /push-notifications\.js\?v=2\.6\.0/);

console.log('push-notifications: 25 контрактов интеграции пройдены');

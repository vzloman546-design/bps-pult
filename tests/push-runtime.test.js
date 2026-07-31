'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const source = fs.readFileSync(path.join(__dirname, '..', 'push-notifications.js'), 'utf8');
const values = new Map();
const calls = [];
let unsubscribed = false;

const subscription = {
  toJSON() {
    return {
      endpoint: 'https://push.example/subscription',
      keys: { p256dh: 'p256dh', auth: 'auth' },
    };
  },
  async unsubscribe() { unsubscribed = true; return true; },
};

const registration = {
  pushManager: {
    async getSubscription() { return subscription; },
    async subscribe() { return subscription; },
  },
};

class FakeCustomEvent {
  constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
}

const navigator = {
  standalone: true,
  onLine: true,
  serviceWorker: { ready: Promise.resolve(registration) },
};

const window = {
  navigator,
  PushManager: function PushManager() {},
  Notification: null,
  matchMedia: () => ({ matches: true }),
  dispatchEvent: () => true,
  addEventListener: () => {},
};

const Notification = {
  permission: 'default',
  async requestPermission() { this.permission = 'granted'; return 'granted'; },
};
window.Notification = Notification;

const publicBytes = new Uint8Array(65);
publicBytes[0] = 4;
const vapidPublicKey = Buffer.from(publicBytes).toString('base64url');

async function fetchMock(url, options = {}) {
  calls.push({ url, method: options.method || 'GET', body: options.body || '' });
  if (url.endsWith('/api/config')) return new Response(JSON.stringify({ ok: true, vapidPublicKey }), { status: 200 });
  if (url.endsWith('/api/pair')) return new Response(JSON.stringify({ ok: true, deviceId: 'device-1', token: 'token-1' }), { status: 200 });
  if (url.endsWith('/api/subscription')) return new Response(JSON.stringify({ ok: true }), { status: 200 });
  if (url.endsWith('/api/test')) return new Response(JSON.stringify({ ok: true }), { status: 200 });
  if (url.endsWith('/api/reminders') && (options.method || 'GET') === 'POST') return new Response(JSON.stringify({ ok: true, id: 'reminder-1' }), { status: 201 });
  if (/\/api\/reminders\//.test(url) && options.method === 'DELETE') return new Response(JSON.stringify({ ok: true, cancelled: true }), { status: 200 });
  if (url.endsWith('/api/unsubscribe')) return new Response(JSON.stringify({ ok: true }), { status: 200 });
  return new Response(JSON.stringify({ ok: false }), { status: 404 });
}

const context = {
  window,
  navigator,
  Notification,
  localStorage: {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  },
  fetch: fetchMock,
  Headers,
  Response,
  AbortController,
  CustomEvent: FakeCustomEvent,
  crypto: webcrypto,
  atob: value => Buffer.from(value, 'base64').toString('binary'),
  btoa: value => Buffer.from(value, 'binary').toString('base64'),
  setTimeout,
  clearTimeout,
  console,
  TypeError,
  Date,
  JSON,
  Map,
  Uint8Array,
  encodeURIComponent,
};
context.globalThis = context;
vm.runInNewContext(source, context);

(async () => {
  const api = window.BpsPush;
  assert.ok(api, 'BpsPush должен быть опубликован в window');
  assert.equal(api.state().paired, false);

  await api.enable('pairing-code');
  assert.equal(api.state().paired, true);
  assert.equal(api.state().permission, 'granted');
  assert.equal(calls.some(call => call.url.endsWith('/api/config')), true);
  assert.equal(calls.some(call => call.url.endsWith('/api/pair')), true);

  const payload = {
    localId: 'task-1',
    type: 'task_due',
    title: 'Задача',
    body: 'Проверить турникет',
    runAt: new Date(Date.now() + 3600000),
    url: './#tasks?open=task-1',
    tag: 'task-1',
  };
  const first = await api.upsert('task:task-1:due', payload);
  const second = await api.upsert('task:task-1:due', payload);
  assert.equal(first.id, 'reminder-1');
  assert.equal(second.unchanged, true);
  assert.equal(calls.filter(call => call.url.endsWith('/api/reminders') && call.method === 'POST').length, 1);

  await api.reconcile([]);
  assert.equal(calls.some(call => /\/api\/reminders\/reminder-1$/.test(call.url) && call.method === 'DELETE'), true);

  await api.sendTest();
  assert.equal(calls.some(call => call.url.endsWith('/api/test')), true);

  await api.disable();
  assert.equal(unsubscribed, true);
  assert.equal(api.state().paired, false);
  assert.equal(api.state().registryCount, 0);
  assert.equal(api.state().queueCount, 0);

  console.log('push-runtime: подключение, расписание, отмена и отключение пройдены');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

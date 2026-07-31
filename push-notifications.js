(() => {
  'use strict';

  const PUSH_API = 'https://bps-pult-push.vzloman546.workers.dev';
  const AUTH_KEY = 'bps-push-auth-v2';
  const REGISTRY_KEY = 'bps-push-registry-v2';
  const REQUEST_TIMEOUT_MS = 15000;

  const readJson = (key, fallback) => {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value ?? fallback;
    } catch (_) {
      return fallback;
    }
  };
  const writeJson = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const readAuth = () => readJson(AUTH_KEY, null);
  const readRegistry = () => {
    const value = readJson(REGISTRY_KEY, {});
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  };
  const writeRegistry = value => writeJson(REGISTRY_KEY, value);

  function isStandalone() {
    return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  }
  function isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
  }
  function supported() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }
  function base64UrlToUint8Array(value) {
    const padding = '='.repeat((4 - (value.length % 4)) % 4);
    const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    return Uint8Array.from(raw, character => character.charCodeAt(0));
  }
  function payloadSignature(payload) {
    return JSON.stringify({
      localId: payload.localId || null,
      type: payload.type || 'reminder',
      title: String(payload.title || ''),
      body: String(payload.body || ''),
      runAt: new Date(payload.runAt).toISOString(),
      url: payload.url || './',
      tag: payload.tag || null,
    });
  }
  async function request(path, options = {}, requireAuth = true) {
    const headers = new Headers(options.headers || {});
    headers.set('Content-Type', 'application/json');
    if (requireAuth) {
      const token = readAuth()?.token;
      if (!token) throw new Error('Устройство не подключено к push-сервису.');
      headers.set('Authorization', `Bearer ${token}`);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${PUSH_API}${path}`, { ...options, headers, signal: controller.signal });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(data.message || data.code || `HTTP ${response.status}`);
        error.status = response.status;
        error.code = data.code;
        throw error;
      }
      return data;
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('Сервер уведомлений не ответил вовремя.');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async function enable(pairingCode) {
    if (!supported()) throw new Error('Web Push не поддерживается на этом устройстве.');
    if (isIOS() && !isStandalone()) throw new Error('На iPhone откройте приложение с иконки на экране «Домой».');
    const code = String(pairingCode || '').trim();
    if (!code) throw new Error('Введите код подключения.');
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Разрешение на уведомления не выдано.');
    const config = await request('/api/config', { method: 'GET' }, false);
    if (!config?.vapidPublicKey) throw new Error('Worker не вернул публичный VAPID-ключ.');
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(config.vapidPublicKey),
      });
    }
    try {
      const result = await request('/api/pair', {
        method: 'POST',
        body: JSON.stringify({ pairingCode: code, subscription: subscription.toJSON() }),
      }, false);
      writeJson(AUTH_KEY, { deviceId: result.deviceId, token: result.token, pairedAt: new Date().toISOString() });
      window.dispatchEvent(new CustomEvent('bps-push-state'));
      return result;
    } catch (error) {
      if (!readAuth()?.token) await subscription.unsubscribe().catch(() => {});
      throw error;
    }
  }

  async function syncSubscription() {
    if (!readAuth()?.token || !supported() || Notification.permission !== 'granted') return false;
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return false;
    await request('/api/subscription', { method: 'PUT', body: JSON.stringify({ subscription: subscription.toJSON() }) });
    return true;
  }
  const sendTest = () => request('/api/test', { method: 'POST', body: '{}' });

  async function schedule(payload) {
    const normalized = {
      localId: payload.localId || null,
      type: payload.type || 'reminder',
      title: String(payload.title || '').trim(),
      body: String(payload.body || '').trim(),
      runAt: new Date(payload.runAt).toISOString(),
      url: payload.url || './',
      tag: payload.tag || null,
    };
    if (!normalized.title) throw new Error('Не указан заголовок уведомления.');
    return request('/api/reminders', { method: 'POST', body: JSON.stringify(normalized) });
  }
  const cancel = reminderId => request(`/api/reminders/${encodeURIComponent(reminderId)}`, { method: 'DELETE' });

  async function remove(key) {
    const registry = readRegistry();
    const current = registry[key];
    delete registry[key];
    writeRegistry(registry);
    if (!current?.id) return { ok: true, cancelled: Boolean(current) };
    try {
      return await cancel(current.id);
    } catch (error) {
      if (error?.status === 404) return { ok: true, cancelled: false };
      throw error;
    }
  }

  async function upsert(key, payload) {
    const signature = payloadSignature(payload);
    const current = readRegistry()[key];
    if (current?.signature === signature && current.id) return { ok: true, unchanged: true, id: current.id };
    if (current) await remove(key);
    const result = await schedule(payload);
    const registry = readRegistry();
    registry[key] = { id: result.id, signature, runAt: new Date(payload.runAt).toISOString() };
    writeRegistry(registry);
    return result;
  }

  async function reconcile(items) {
    if (!readAuth()?.token) return { skipped: true, scheduled: 0, removed: 0 };
    const desired = new Map((items || []).filter(item => item?.key && item?.payload).map(item => [item.key, item.payload]));
    const registry = readRegistry();
    let removed = 0;
    let scheduled = 0;
    for (const key of Object.keys(registry)) {
      if (!desired.has(key)) {
        await remove(key);
        removed += 1;
      }
    }
    for (const [key, payload] of desired) {
      const result = await upsert(key, payload);
      if (!result.unchanged) scheduled += 1;
    }
    return { skipped: false, scheduled, removed };
  }

  async function disable() {
    const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.ready.catch(() => null) : null;
    const subscription = registration ? await registration.pushManager.getSubscription().catch(() => null) : null;
    try {
      if (readAuth()?.token) await request('/api/unsubscribe', { method: 'POST', body: '{}' });
    } finally {
      await subscription?.unsubscribe().catch(() => {});
      localStorage.removeItem(AUTH_KEY);
      localStorage.removeItem(REGISTRY_KEY);
      window.dispatchEvent(new CustomEvent('bps-push-state'));
    }
  }

  function state() {
    return {
      api: PUSH_API,
      supported: supported(),
      standalone: isStandalone(),
      permission: 'Notification' in window ? Notification.permission : 'unsupported',
      paired: Boolean(readAuth()?.token),
      scheduledCount: Object.keys(readRegistry()).length,
    };
  }

  window.BpsPush = { enable, syncSubscription, sendTest, schedule, cancel, remove, upsert, reconcile, disable, state };
})();

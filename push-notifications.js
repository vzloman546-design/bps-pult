(() => {
  'use strict';

  const PUSH_API = 'https://bps-pult-push.vzloman546.workers.dev';
  const AUTH_KEY = 'bps-push-auth-v1';
  const QUEUE_KEY = 'bps-push-queue-v1';
  const REGISTRY_KEY = 'bps-push-registry-v1';
  const REQUEST_TIMEOUT_MS = 15000;
  const MAX_QUEUE_ITEMS = 200;

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  function supported() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }

  function readJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function readAuth() {
    return readJson(AUTH_KEY, null);
  }

  function writeAuth(value) {
    writeJson(AUTH_KEY, value);
  }

  function clearAuth() {
    localStorage.removeItem(AUTH_KEY);
  }

  function readQueue() {
    const queue = readJson(QUEUE_KEY, []);
    return Array.isArray(queue) ? queue : [];
  }

  function writeQueue(queue) {
    writeJson(QUEUE_KEY, queue.slice(-MAX_QUEUE_ITEMS));
    dispatchState();
  }

  function readRegistry() {
    const registry = readJson(REGISTRY_KEY, {});
    return registry && typeof registry === 'object' && !Array.isArray(registry) ? registry : {};
  }

  function writeRegistry(registry) {
    writeJson(REGISTRY_KEY, registry);
    dispatchState();
  }

  function clearLocalPushData() {
    localStorage.removeItem(QUEUE_KEY);
    localStorage.removeItem(REGISTRY_KEY);
    dispatchState();
  }

  function base64UrlToUint8Array(value) {
    const padding = '='.repeat((4 - (value.length % 4)) % 4);
    const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    return Uint8Array.from([...raw].map(character => character.charCodeAt(0)));
  }

  function stablePayloadSignature(payload) {
    return JSON.stringify({
      localId: payload.localId || null,
      type: payload.type || 'reminder',
      title: payload.title || '',
      body: payload.body || '',
      runAt: new Date(payload.runAt).toISOString(),
      url: payload.url || './',
      tag: payload.tag || null,
    });
  }

  function queueItem(item) {
    const queue = readQueue();
    const deduplicated = queue.filter(existing => {
      if (item.kind === 'schedule' && existing.kind === 'schedule') return existing.key !== item.key;
      if (item.kind === 'cancel' && existing.kind === 'cancel') return existing.reminderId !== item.reminderId;
      return true;
    });
    deduplicated.push({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      attempts: 0,
      ...item,
    });
    writeQueue(deduplicated);
    return deduplicated.at(-1);
  }

  function removeQueuedSchedule(key) {
    const queue = readQueue();
    const next = queue.filter(item => !(item.kind === 'schedule' && item.key === key));
    if (next.length !== queue.length) writeQueue(next);
  }

  function isNetworkLikeError(error) {
    const message = String(error?.message || error || '');
    return error?.name === 'AbortError' || error instanceof TypeError || /network|fetch|timeout|offline|load failed/i.test(message);
  }

  async function request(path, options = {}, requireAuth = true) {
    const auth = readAuth();
    const headers = new Headers(options.headers || {});
    headers.set('Content-Type', 'application/json');

    if (requireAuth) {
      if (!auth?.token) throw new Error('Устройство не подключено к push-сервису.');
      headers.set('Authorization', `Bearer ${auth.token}`);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${PUSH_API}${path}`, {
        ...options,
        headers,
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(data.message || data.code || `HTTP ${response.status}`);
        error.status = response.status;
        error.code = data.code;
        throw error;
      }
      return data;
    } finally {
      clearTimeout(timeout);
    }
  }

  function dispatchState(extra = {}) {
    window.dispatchEvent(new CustomEvent('bps-push-state', { detail: { ...state(), ...extra } }));
  }

  async function enable(pairingCode) {
    if (!supported()) throw new Error('Этот браузер не поддерживает Web Push.');
    if (!isStandalone()) {
      throw new Error('На iPhone уведомления включаются только в приложении, добавленном на экран «Домой».');
    }
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
      writeAuth({
        deviceId: result.deviceId,
        token: result.token,
        pairedAt: new Date().toISOString(),
      });
      dispatchState({ connected: true });
      return result;
    } catch (error) {
      if (!readAuth()?.token) await subscription.unsubscribe().catch(() => {});
      throw error;
    }
  }

  async function syncSubscription() {
    const auth = readAuth();
    if (!auth?.token || !supported() || Notification.permission !== 'granted') return false;
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return false;
    await request('/api/subscription', {
      method: 'PUT',
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    });
    return true;
  }

  async function sendTest() {
    return request('/api/test', { method: 'POST', body: '{}' });
  }

  async function schedule(payload, key = null, { queueOnFailure = true } = {}) {
    const normalized = {
      localId: payload.localId || null,
      type: payload.type || 'reminder',
      title: String(payload.title || '').trim(),
      body: String(payload.body || '').trim(),
      runAt: payload.runAt instanceof Date ? payload.runAt.toISOString() : new Date(payload.runAt).toISOString(),
      url: payload.url || './',
      tag: payload.tag || null,
    };
    if (!normalized.title) throw new Error('Не указан заголовок уведомления.');
    const signature = stablePayloadSignature(normalized);

    if (!navigator.onLine && queueOnFailure) {
      const queued = queueItem({ kind: 'schedule', key, payload: normalized, signature });
      if (key) {
        const registry = readRegistry();
        registry[key] = { status: 'queued', signature, runAt: normalized.runAt, queueId: queued.id };
        writeRegistry(registry);
      }
      return { ok: true, queued: true, queueId: queued.id };
    }

    try {
      const result = await request('/api/reminders', {
        method: 'POST',
        body: JSON.stringify(normalized),
      });
      if (key) {
        const registry = readRegistry();
        registry[key] = { status: 'scheduled', id: result.id, signature, runAt: normalized.runAt };
        writeRegistry(registry);
      }
      return { ...result, queued: false };
    } catch (error) {
      if (!queueOnFailure || !isNetworkLikeError(error)) throw error;
      const queued = queueItem({ kind: 'schedule', key, payload: normalized, signature });
      if (key) {
        const registry = readRegistry();
        registry[key] = { status: 'queued', signature, runAt: normalized.runAt, queueId: queued.id };
        writeRegistry(registry);
      }
      return { ok: true, queued: true, queueId: queued.id };
    }
  }

  async function cancelReminderId(reminderId, { queueOnFailure = true } = {}) {
    if (!reminderId) return { ok: true, cancelled: false };
    if (!navigator.onLine && queueOnFailure) {
      queueItem({ kind: 'cancel', reminderId });
      return { ok: true, queued: true };
    }
    try {
      return await request(`/api/reminders/${encodeURIComponent(reminderId)}`, { method: 'DELETE' });
    } catch (error) {
      if (!queueOnFailure || !isNetworkLikeError(error)) throw error;
      queueItem({ kind: 'cancel', reminderId });
      return { ok: true, queued: true };
    }
  }

  async function remove(key, options = {}) {
    if (!key) return { ok: true, cancelled: false };
    removeQueuedSchedule(key);
    const registry = readRegistry();
    const current = registry[key];
    delete registry[key];
    writeRegistry(registry);
    if (current?.id) return cancelReminderId(current.id, options);
    return { ok: true, cancelled: Boolean(current) };
  }

  async function upsert(key, payload, options = {}) {
    if (!key) throw new Error('Не указан ключ напоминания.');
    const signature = stablePayloadSignature(payload);
    const current = readRegistry()[key];
    if (current?.signature === signature && ['scheduled', 'queued'].includes(current.status)) {
      return { ok: true, unchanged: true, queued: current.status === 'queued', id: current.id };
    }
    await remove(key, options);
    return schedule(payload, key, options);
  }

  async function reconcile(desiredItems, options = {}) {
    if (!readAuth()?.token) return { scheduled: 0, removed: 0, skipped: true };
    const desired = new Map((desiredItems || []).filter(item => item?.key && item?.payload).map(item => [item.key, item.payload]));
    const registry = readRegistry();
    let removed = 0;
    let scheduled = 0;

    for (const key of Object.keys(registry)) {
      if (!desired.has(key)) {
        await remove(key, options);
        removed += 1;
      }
    }
    for (const [key, payload] of desired) {
      const result = await upsert(key, payload, options);
      if (!result.unchanged) scheduled += 1;
    }
    return { scheduled, removed, skipped: false };
  }

  async function flushQueue() {
    if (!navigator.onLine || !readAuth()?.token) return { processed: 0, remaining: readQueue().length };
    const queue = readQueue();
    const remaining = [];
    let processed = 0;

    for (let index = 0; index < queue.length; index += 1) {
      const item = queue[index];
      try {
        if (item.kind === 'schedule') {
          const result = await schedule(item.payload, item.key, { queueOnFailure: false });
          processed += 1;
          window.dispatchEvent(new CustomEvent('bps-push-sync', { detail: { kind: 'schedule', key: item.key, result } }));
        } else if (item.kind === 'cancel') {
          await cancelReminderId(item.reminderId, { queueOnFailure: false });
          processed += 1;
        }
      } catch (error) {
        remaining.push({ ...item, attempts: Number(item.attempts || 0) + 1, lastError: error.message });
        if (error?.status === 401 || error?.status === 410) {
          clearAuth();
          remaining.push(...queue.slice(index + 1));
          break;
        }
      }
    }
    writeQueue(remaining);
    dispatchState({ processed });
    return { processed, remaining: remaining.length };
  }

  async function disable() {
    const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.ready.catch(() => null) : null;
    const subscription = registration ? await registration.pushManager.getSubscription().catch(() => null) : null;
    try {
      if (readAuth()?.token) await request('/api/unsubscribe', { method: 'POST', body: '{}' });
    } finally {
      await subscription?.unsubscribe().catch(() => {});
      clearAuth();
      clearLocalPushData();
      dispatchState({ connected: false });
    }
  }

  function has(key) {
    return Boolean(key && readRegistry()[key]);
  }

  function state() {
    return {
      api: PUSH_API,
      supported: supported(),
      standalone: isStandalone(),
      permission: 'Notification' in window ? Notification.permission : 'unsupported',
      paired: Boolean(readAuth()?.token),
      queueCount: readQueue().length,
      registryCount: Object.keys(readRegistry()).length,
    };
  }

  window.BpsPush = {
    enable,
    syncSubscription,
    sendTest,
    schedule,
    cancel: cancelReminderId,
    remove,
    upsert,
    reconcile,
    flushQueue,
    disable,
    has,
    state,
  };
})();

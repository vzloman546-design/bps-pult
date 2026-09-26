(() => {
  'use strict';

  const cfg = window.TURNSTILE_TEAM_CONFIG || {};
  const storage = window.TeamStorage;

  function apiUrl(path) {
    return String(cfg.apiBase || '').replace(/\/$/, '') + path;
  }

  async function request(path, options = {}) {
    const session = storage.getSession();
    const headers = new Headers(options.headers || {});

    if (options.json !== undefined) {
      headers.set('content-type', 'application/json');
      options.body = JSON.stringify(options.json);
    }

    if (session?.token) headers.set('authorization', 'Bearer ' + session.token);

    const response = await fetch(apiUrl(path), {
      method: options.method || 'GET',
      headers,
      body: options.body,
      cache: 'no-store'
    });

    if (response.status === 401) {
      storage.setSession(null);
      window.dispatchEvent(new CustomEvent('turnstile:session-expired'));
    }

    if (!response.ok) {
      let payload = null;
      try { payload = await response.json(); } catch {}
      const error = new Error(payload?.error || ('http_' + response.status));
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    const type = response.headers.get('content-type') || '';
    return type.includes('application/json') ? response.json() : response;
  }

  async function cachedValue(key, loader, fallback = null) {
    try {
      const value = await loader();
      storage.setCache(key, value);
      return value;
    } catch (error) {
      const cached = storage.getCache(key, undefined);
      if (cached !== undefined && (!error.status || error.status >= 500 || !navigator.onLine)) {
        return cached;
      }
      if (fallback !== null && (!error.status || !navigator.onLine)) return fallback;
      throw error;
    }
  }

  async function sendCheck(entry) {
    return request(
      '/api/inspections/' + entry.inspectionId +
      '/gates/' + entry.gateNo +
      '/checks/' + encodeURIComponent(entry.code),
      { method: 'PATCH', json: entry.patch }
    );
  }

  let flushing = false;

  async function flushQueue() {
    if (flushing || !navigator.onLine) {
      return { sent: 0, remaining: storage.getCurrentQueue().length };
    }

    flushing = true;
    let sent = 0;

    try {
      const source = storage.getQueue();
      const remaining = [];
      const currentUserId = storage.getSession()?.user?.id || '';

      for (let i = 0; i < source.length; i++) {
        const entry = source[i];

        if (entry.userId && entry.userId !== currentUserId) {
          remaining.push(entry);
          continue;
        }

        try {
          if (entry.type === 'check') await sendCheck(entry);
          sent++;
        } catch (error) {
          remaining.push(entry);

          if (error.status === 401) {
            remaining.push(...source.slice(i + 1));
            break;
          }

          if (error.status === 403) {
            window.dispatchEvent(new CustomEvent('turnstile:sync-conflict', {
              detail: {
                inspectionId: entry.inspectionId,
                gateNo: entry.gateNo,
                code: entry.code
              }
            }));
          }
        }
      }

      storage.setQueue(remaining);
      const result = { sent, remaining: remaining.length };
      window.dispatchEvent(new CustomEvent('turnstile:queue-flushed', { detail: result }));
      return result;
    } finally {
      flushing = false;
    }
  }

  function realtimeUrl(inspectionId) {
    const base = cfg.apiBase
      ? new URL(cfg.apiBase)
      : new URL(location.origin);
    base.pathname = '/api/inspections/' + inspectionId + '/realtime';
    base.search = '';
    base.hash = '';
    base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
    return base.toString();
  }

  function connectRealtime(inspectionId, onEvent) {
    const session = storage.getSession();
    if (!session?.token) return null;

    const socket = new WebSocket(
      realtimeUrl(inspectionId),
      ['turnstile-inspection', session.token]
    );

    let pingTimer = null;

    socket.addEventListener('open', () => {
      pingTimer = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) socket.send('ping');
      }, 25000);
    });

    socket.addEventListener('message', event => {
      if (event.data === 'pong') return;
      try { onEvent?.(JSON.parse(event.data)); } catch {}
    });

    socket.addEventListener('close', () => {
      if (pingTimer) clearInterval(pingTimer);
    });

    return socket;
  }

  const TeamApi = {
    get session() { return storage.getSession(); },
    get queueCount() { return storage.getCurrentQueue().length; },

    health() {
      return request('/api/health');
    },

    async login(username, password) {
      const result = await request('/api/auth/login', {
        method: 'POST',
        json: { username, password }
      });

      storage.setSession({
        token: result.token,
        expiresAt: result.expiresAt,
        user: result.user
      });

      return result.user;
    },

    async logout() {
      try { await request('/api/auth/logout', { method: 'POST' }); } catch {}
      storage.setSession(null);
    },

    async me() {
      const current = storage.getSession();

      try {
        const result = await request('/api/me');
        if (current) storage.setSession({ ...current, user: result.user });
        return result.user;
      } catch (error) {
        if (current?.user && (!error.status || !navigator.onLine)) return current.user;
        throw error;
      }
    },

    async users() {
      return cachedValue('users', async () => (await request('/api/users')).users || [], []);
    },

    async createUser(input) {
      return (await request('/api/users', { method: 'POST', json: input })).user;
    },

    updateUser(id, input) {
      return request('/api/users/' + encodeURIComponent(id), {
        method: 'PATCH',
        json: input
      });
    },

    async inspections() {
      return cachedValue(
        'inspections',
        async () => (await request('/api/inspections')).inspections || [],
        []
      );
    },

    async inspection(id) {
      return cachedValue(
        'inspection:' + id,
        async () => (await request('/api/inspections/' + id)).inspection
      );
    },

    cancelInspection(id) {
      return request('/api/inspections/' + id + '/cancel', {
        method: 'PATCH',
        json: {}
      });
    },

    async createInspection(input) {
      const inspection = (await request('/api/inspections', {
        method: 'POST',
        json: input
      })).inspection;
      storage.setCache('inspection:' + inspection.id, inspection);
      storage.removeCache('inspections');
      return inspection;
    },

    async gate(inspectionId, gateNo) {
      const key = 'gate:' + inspectionId + ':' + gateNo;
      const gate = await cachedValue(
        key,
        async () => (await request(
          '/api/inspections/' + inspectionId + '/gates/' + gateNo
        )).gate
      );
      return storage.applyPendingMutations(gate);
    },

    assign(inspectionId, gateNo, assigneeUserId) {
      return request(
        '/api/inspections/' + inspectionId + '/gates/' + gateNo + '/assign',
        { method: 'PATCH', json: { assigneeUserId } }
      );
    },

    reopenGate(inspectionId, gateNo) {
      return request(
        '/api/inspections/' + inspectionId + '/gates/' + gateNo + '/reopen',
        { method: 'PATCH', json: {} }
      );
    },

    async updateCheck(inspectionId, gateNo, code, patch) {
      const entry = { type: 'check', inspectionId, gateNo, code, patch };
      storage.patchCachedGate(entry);

      if (!navigator.onLine) {
        storage.upsertCheckMutation(entry);
        return { queued: true };
      }

      try {
        return await sendCheck(entry);
      } catch (error) {
        if (!error.status || error.status >= 500) {
          storage.upsertCheckMutation(entry);
          return { queued: true };
        }
        throw error;
      }
    },

    async history() {
      return cachedValue(
        'history',
        async () => (await request('/api/history')).history || [],
        []
      );
    },

    async notifications() {
      return cachedValue(
        'notifications',
        async () => (await request('/api/notifications')).notifications || [],
        []
      );
    },

    markNotificationRead(id) {
      return request('/api/notifications/' + id, {
        method: 'PATCH',
        json: {}
      });
    },

    async events(id) {
      return (await request('/api/inspections/' + id + '/events')).events || [];
    },

    async generationSnapshot(id) {
      return (await request(
        '/api/inspections/' + id + '/generation-snapshot'
      )).inspection;
    },

    async document(id) {
      return (await request('/api/inspections/' + id + '/document')).document;
    },

    uploadDocument(id, blob) {
      return request('/api/inspections/' + id + '/document/upload', {
        method: 'POST',
        headers: { 'content-type': 'application/pdf' },
        body: blob
      });
    },

    async documentBlob(id) {
      const response = await request('/api/inspections/' + id + '/document/file');
      return response.blob();
    },

    async pushPublicKey() {
      return (await request('/api/push/public-key')).publicKey || '';
    },

    savePushSubscription(subscription) {
      return request('/api/push/subscription', {
        method: 'POST',
        json: subscription.toJSON()
      });
    },

    flushQueue,
    connectRealtime
  };

  window.TeamApi = TeamApi;
  window.addEventListener('online', () => {
    TeamApi.flushQueue().catch(() => {});
  });
})();

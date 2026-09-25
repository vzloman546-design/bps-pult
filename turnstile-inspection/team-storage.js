(() => {
  'use strict';

  const cfg = window.TURNSTILE_TEAM_CONFIG || {};
  const SESSION_KEY = cfg.sessionKey || 'turnstileTeam.session.v1';
  const QUEUE_KEY = cfg.syncQueueKey || 'turnstileTeam.syncQueue.v1';

  function readJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value == null ? fallback : value;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  }

  window.TeamStorage = {
    getSession() {
      return readJson(SESSION_KEY, null);
    },

    setSession(session) {
      writeJson(SESSION_KEY, session);
      window.dispatchEvent(new CustomEvent('turnstile:session-changed', { detail: session }));
    },

    getQueue() {
      const queue = readJson(QUEUE_KEY, []);
      return Array.isArray(queue) ? queue : [];
    },

    setQueue(queue) {
      writeJson(QUEUE_KEY, queue);
      window.dispatchEvent(new CustomEvent('turnstile:queue-changed', {
        detail: { count: Array.isArray(queue) ? queue.length : 0 }
      }));
    },

    upsertCheckMutation(item) {
      const queue = this.getQueue();
      const index = queue.findIndex(entry =>
        entry.type === 'check' &&
        entry.inspectionId === item.inspectionId &&
        entry.gateNo === item.gateNo &&
        entry.code === item.code
      );

      const next = {
        ...item,
        id: index >= 0 ? queue[index].id : crypto.randomUUID(),
        queuedAt: Date.now()
      };

      if (index >= 0) {
        next.patch = { ...(queue[index].patch || {}), ...(item.patch || {}) };
        queue[index] = next;
      } else {
        queue.push(next);
      }

      this.setQueue(queue);
      return next;
    }
  };
})();

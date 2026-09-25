(() => {
  'use strict';

  const cfg = window.TURNSTILE_TEAM_CONFIG || {};
  const SESSION_KEY = cfg.sessionKey || 'turnstileTeam.session.v1';
  const QUEUE_KEY = cfg.syncQueueKey || 'turnstileTeam.syncQueue.v1';
  const CACHE_KEY = 'turnstileTeam.dataCache.v1';

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

  function cacheMap() {
    const value = readJson(CACHE_KEY, {});
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function currentUserId() {
    return readJson(SESSION_KEY, null)?.user?.id || '';
  }

  function scopedCacheKey(key) {
    return (currentUserId() || 'anonymous') + ':' + key;
  }

  function mergeCheckIntoCachedGate(cache, item) {
    const key = scopedCacheKey('gate:' + item.inspectionId + ':' + item.gateNo);
    const record = cache[key];
    if (!record?.value?.checks) return;

    const check = record.value.checks.find(row => row.code === item.code);
    if (!check) return;

    Object.assign(check, item.patch || {});
    check.updatedAt = new Date().toISOString();
    record.cachedAt = Date.now();
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

    getCache(key, fallback = null) {
      const record = cacheMap()[scopedCacheKey(key)];
      return record ? record.value : fallback;
    },

    setCache(key, value) {
      const cache = cacheMap();
      cache[scopedCacheKey(key)] = {
        value,
        cachedAt: Date.now()
      };
      writeJson(CACHE_KEY, cache);
      return value;
    },

    removeCache(key) {
      const cache = cacheMap();
      delete cache[scopedCacheKey(key)];
      writeJson(CACHE_KEY, cache);
    },

    clearUserCache() {
      const userId = currentUserId();
      if (!userId) return;
      const cache = cacheMap();
      for (const key of Object.keys(cache)) {
        if (key.startsWith(userId + ':')) delete cache[key];
      }
      writeJson(CACHE_KEY, cache);
      this.setQueue(this.getQueue().filter(entry => entry.userId !== userId));
    },

    getCurrentQueue() {
      const userId = currentUserId();
      return this.getQueue().filter(entry => entry.userId === userId);
    },

    applyPendingMutations(gate) {
      if (!gate?.checks) return gate;
      const copy = JSON.parse(JSON.stringify(gate));
      const userId = currentUserId();
      const queue = this.getQueue().filter(entry =>
        entry.userId === userId &&
        entry.type === 'check' &&
        entry.inspectionId === copy.inspectionId &&
        entry.gateNo === copy.gateNo
      );

      for (const entry of queue) {
        const check = copy.checks.find(row => row.code === entry.code);
        if (check) Object.assign(check, entry.patch || {});
      }

      return copy;
    },

    upsertCheckMutation(item) {
      const queue = this.getQueue();
      const userId = currentUserId();
      const index = queue.findIndex(entry =>
        entry.userId === userId &&
        entry.type === 'check' &&
        entry.inspectionId === item.inspectionId &&
        entry.gateNo === item.gateNo &&
        entry.code === item.code
      );

      const next = {
        ...item,
        userId,
        id: index >= 0 ? queue[index].id : crypto.randomUUID(),
        queuedAt: Date.now()
      };

      if (index >= 0) {
        next.patch = { ...(queue[index].patch || {}), ...(item.patch || {}) };
        queue[index] = next;
      } else {
        queue.push(next);
      }

      const cache = cacheMap();
      mergeCheckIntoCachedGate(cache, next);
      writeJson(CACHE_KEY, cache);
      this.setQueue(queue);
      return next;
    }
  };
})();

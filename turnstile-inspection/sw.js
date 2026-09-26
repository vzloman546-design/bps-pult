const CACHE = 'turnstile-inspection-team-v5';

const STATIC_ASSETS = [
  './',
  './index.html',
  './team.html',
  './styles.css?v=12',
  './team.css?v=2',
  './team-config.js',
  './team-storage.js?v=2',
  './team-api.js?v=3',
  './team-install.js?v=2',
  './team-ui.js?v=5',
  './team-app.js?v=5',
  './pdf-renderer.js',
  './server-print.js',
  './team-manifest.webmanifest',
  './favicon-v11.png',
  './apple-touch-icon-v11.png',
  './turnstile-icon-192-v11.png',
  './turnstile-icon-512-v11.png',
  './assets-init.js',
  './asset-page1-1.js',
  './asset-page2-1.js',
  './asset-page2-2.js',
  './asset-page3-1.js',
  './asset-page3-2.js',
  './asset-page4-1.js',
  './asset-page4-2.js',
  './asset-page5-1.js',
  './asset-page5-2.js',
  './asset-page6-1.js',
  './asset-atlas-1.js',
  './asset-atlas-2.js',
  './asset-atlas-3.js',
  './assets-meta.js',
  './assets-final.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith('turnstile-inspection-') && key !== CACHE)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  if (url.pathname.includes('/api/')) {
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, copy));
          return response;
        })
        .catch(async () => {
          return (await caches.match(event.request))
            || (await caches.match('./team.html'))
            || (await caches.match('./index.html'));
        })
    );
    return;
  }

  if (url.origin === self.location.origin) {
    const network = fetch(event.request).then(async response => {
      if (response.ok) {
        const cache = await caches.open(CACHE);
        await cache.put(event.request, response.clone());
      }
      return response;
    });

    event.waitUntil(network.then(() => undefined).catch(() => undefined));

    event.respondWith(
      caches.match(event.request)
        .then(cached => cached || network)
        .catch(() => new Response('Offline', { status: 503 }))
    );
  }
});

self.addEventListener('push', event => {
  let payload = {};

  try {
    payload = event.data?.json() || {};
  } catch {
    payload = {
      title: 'Осмотр турникетов',
      body: event.data?.text() || 'Новое уведомление'
    };
  }

  event.waitUntil(
    self.registration.showNotification(
      payload.title || 'Осмотр турникетов',
      {
        body: payload.body || '',
        icon: './turnstile-icon-192-v11.png',
        badge: './favicon-v11.png',
        tag: payload.type && payload.inspectionId
          ? payload.type + ':' + payload.inspectionId
          : undefined,
        data: {
          url: payload.url || './team.html',
          inspectionId: payload.inspectionId || null,
          gateNo: payload.gateNo || null
        }
      }
    )
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  const target = new URL(
    event.notification.data?.url || './team.html',
    self.registration.scope
  ).href;

  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then(windows => {
      for (const client of windows) {
        if (client.url.startsWith(self.registration.scope) && 'focus' in client) {
          client.navigate(target).catch(() => {});
          return client.focus();
        }
      }

      if (clients.openWindow) return clients.openWindow(target);
      return undefined;
    })
  );
});

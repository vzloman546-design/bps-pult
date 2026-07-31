// Релиз 2.6.1: восстановление интерфейса и изолированная интеграция Web Push.
const VERSION = '2.6.1';
const CACHE = `bps-pult-${VERSION}`;
const APP_SHELL = [
  './', './index.html', './styles.css', './stability-logic.js', './event-logic.js', './knowledge-logic.js', './productivity-logic.js',
  './app.js', './push-notifications.js', './push-ui.js', './event-ui.js', './knowledge-ui.js', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './apple-touch-icon.png',
  './icon-192-dark.png', './icon-512-dark.png', './apple-touch-icon-dark.png',
  './icon-192-light.png', './icon-512-light.png', './apple-touch-icon-light.png',
  './favicon-dark-32.png', './favicon-light-32.png', './favicon-dark-64.png', './favicon-light-64.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith('bps-pult-') && key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.open(CACHE).then(async cache => {
        try {
          const response = await fetch(event.request, { cache: 'no-store' });
          if (response.ok) await cache.put('./index.html', response.clone());
          return response;
        } catch (_) {
          return (await cache.match('./index.html')) || Response.error();
        }
      })
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(event.request, { ignoreSearch: true });
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok) await cache.put(event.request, response.clone());
      return response;
    })
  );
});

self.addEventListener("push", (event) => {
  let data = {};

  try {
    data = event.data?.json() || {};
  } catch {
    data = {
      title: "БПС Пульт",
      body: event.data?.text() || "Есть новое рабочее напоминание.",
    };
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "БПС Пульт", {
      body: data.body || "",
      icon: "./icon-192.png",
      badge: "./icon-192.png",
      tag: data.tag || "bps-pult",
      renotify: true,
      data: {
        url: data.url || "./",
      },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = new URL(
    event.notification.data?.url || "./",
    self.registration.scope,
  ).href;

  event.waitUntil(
    clients
      .matchAll({
        type: "window",
        includeUncontrolled: true,
      })
      .then(async (windowClients) => {
        const existing = windowClients.find((client) =>
          client.url.startsWith(self.registration.scope),
        );

        if (existing) {
          if ("navigate" in existing) await existing.navigate(targetUrl);
          return existing.focus();
        }

        return clients.openWindow(targetUrl);
      }),
  );
});

// Релиз 2.5.1: активная версия обслуживает только собственный проверенный кэш оболочки.
const VERSION = '2.5.1';
const CACHE = `bps-pult-${VERSION}`;
const APP_SHELL = [
  './', './index.html', './styles.css', './stability-logic.js', './event-logic.js', './knowledge-logic.js', './productivity-logic.js',
  './app.js', './event-ui.js', './knowledge-ui.js', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './apple-touch-icon.png',
  './icon-192-dark.png', './icon-512-dark.png', './apple-touch-icon-dark.png',
  './icon-192-light.png', './icon-512-light.png', './apple-touch-icon-light.png',
  './favicon-dark-32.png', './favicon-light-32.png', './favicon-dark-64.png', './favicon-light-64.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_SHELL)));
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
        const cached = await cache.match('./index.html');
        if (cached) return cached;
        const response = await fetch(event.request);
        if (response.ok) await cache.put('./index.html', response.clone());
        return response;
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

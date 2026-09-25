const CACHE = 'turnstile-inspection-v5';
const ASSETS = ["./","./index.html","./styles.css","./app.js","./manifest.webmanifest","./icon.svg","./assets-init.js","./asset-page1-1.js","./asset-page1-2.js","./asset-page1-3.js","./asset-page2-1.js","./asset-page2-2.js","./asset-page3-1.js","./asset-page3-2.js","./asset-page4-1.js","./asset-page4-2.js","./asset-page5-1.js","./asset-page5-2.js","./asset-atlas-1.js","./asset-atlas-2.js","./asset-atlas-3.js","./assets-meta.js","./assets-final.js"];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request).then(resp => {
    const copy = resp.clone(); caches.open(CACHE).then(c => c.put(event.request, copy)); return resp;
  }).catch(() => event.request.mode === 'navigate' ? caches.match('./index.html') : Response.error())));
});
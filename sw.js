// 개발 중 - 캐시 비활성화
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
  );
});
self.addEventListener('fetch', e => {
  e.respondWith(fetch(e.request));
});

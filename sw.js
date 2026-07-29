// ============================================================
//  Service Worker — 离线缓存
//  所有静态资源预缓存，断网也能刷
// ============================================================
const CACHE = 'embq-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './data/questions.json',
  './data/categories.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

// 清掉旧版本缓存，否则老用户会一直吃到已删除的 js/*.js
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit ?? fetch(e.request).then((res) => {
      // 只缓存同源成功响应，避免把 opaque 响应塞进缓存
      if (res.ok && new URL(e.request.url).origin === location.origin) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    }).catch(() => hit)),
  );
});

// ============================================================
//  Service Worker — 离线缓存
//  所有静态资源预缓存，断网也能刷
// ============================================================
var CACHE_NAME = 'quiz-v1';
var ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/bank.js',
  './js/store.js',
  './js/scheduler.js',
  './js/quiz.js',
  './js/stats.js',
  './js/app.js',
  './data/_meta.js',
  './data/c-lang.js',
  './data/coding.js',
  './data/coding-2.js',
  './data/cpp.js',
  './data/cpp-2.js',
  './data/ds-algo.js',
  './data/ds-algo-2.js',
  './data/control.js',
  './data/os.js',
  './data/rtos.js',
  './data/linux-app.js',
  './data/linux-drv.js',
  './data/linux-drv-2.js',
  './data/mcu-hw.js',
  './data/hardware.js',
  './data/bus.js',
  './data/network.js',
  './data/build.js',
  './data/build-2.js',
  './data/tools.js',
  './data/debug.js',
  './data/debug-2.js',
  './data/security.js',
  './data/security-2.js',
  './data/automotive.js',
  './data/behavioral.js',
];

self.addEventListener('install', function(event) {
  event.waitUntil(caches.open(CACHE_NAME).then(function(cache) {
    return cache.addAll(ASSETS);
  }));
});

self.addEventListener('activate', function(event) {
  event.waitUntil(caches.keys().then(function(names) {
    return Promise.all(names.filter(function(n) { return n !== CACHE_NAME; }).map(function(n) { return caches.delete(n); }));
  }));
});

self.addEventListener('fetch', function(event) {
  event.respondWith(caches.match(event.request).then(function(resp) {
    return resp || fetch(event.request).then(function(networkResp) {
      if (networkResp.ok) {
        var clone = networkResp.clone();
        caches.open(CACHE_NAME).then(function(cache) { cache.put(event.request, clone); });
      }
      return networkResp;
    });
  }));
});

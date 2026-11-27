/* Service worker: simpan kerangka aplikasi agar bisa dibuka offline. Data (API) selalu dari server. */
var CACHE_NAME = 'visit-report-v1';
var SHELL = ['./', 'index.html', 'style.css', 'app.js', 'core.js', 'xlsx.js', 'demo-adapter.js', 'config.js', 'manifest.json',
  'brand/ikon.svg', 'brand/ikon-192.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE_NAME).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE_NAME; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;   // API Apps Script & Drive langsung ke jaringan
  e.respondWith(fetch(req).then(function (res) {
    if (res.ok) { var copy = res.clone(); caches.open(CACHE_NAME).then(function (c) { c.put(req, copy); }); }
    return res;
  }).catch(function () { return caches.match(req, { ignoreSearch: true }); }));
});

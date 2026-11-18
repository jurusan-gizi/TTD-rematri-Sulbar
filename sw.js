const CACHE = 'ttd-rematri-sulbar-v3';
const SHELL = [
  './', './index.html', './style.css', './app.js', './config.js', './manifest.json',
  './vendor/exceljs.min.js', './vendor/jszip.min.js',
  './assets/logo-sulbar.png', './assets/logo-poltekkes.png', './assets/icon-192.png', './assets/icon-512.png'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // API Apps Script tidak di-cache
  // Network-first untuk config.js & index (agar update cepat), cache-first untuk aset lain
  const netFirst = /\/(config\.js|index\.html)?$/.test(url.pathname) || url.pathname.endsWith('/app.js');
  if (netFirst) {
    e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html'))));
  } else {
    e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request).then(res => {
      const cp = res.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); return res;
    })));
  }
});

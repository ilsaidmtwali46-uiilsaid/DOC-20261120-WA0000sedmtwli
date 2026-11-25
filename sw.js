/* غيّر رقم الإصدار هنا عند كل تعديل على الملفات */
const CACHE = 'grocery-v16-20261125-a';
const FILES = [
  './', 'index.html', 'style.css', 'manifest.json',
  'icon-192.png', 'icon-512.png',
  'globals.js', 'db.js', 'disk.js', 'license.js', 'setup.js', 'parties.js',
  'suppliers.js', 'customers.js', 'purchases.js', 'inventory.js',
  'stocktake.js', 'daily.js', 'gallery.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => Promise.all(FILES.map(f =>
      fetch(f, { cache: 'reload' })
        .then(r => { if (r && r.ok) return c.put(f, r); })
        .catch(() => {})
    )))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then(res => {
        if (res && res.ok && res.type === 'basic'){
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(e.request, { ignoreSearch: true }).then(hit => {
          if (hit) return hit;
          if (e.request.mode === 'navigate') return caches.match('index.html');
          return Response.error();
        })
      )
  );
});

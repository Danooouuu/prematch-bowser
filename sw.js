/* Service worker : coquille de l'app + données en cache-first → ouverture instantanée et hors-ligne.
   Changer VERSION à chaque mise à jour du contenu (tools/build-bundle.mjs le fait automatiquement). */
const VERSION = 'prematch-2026.11.05-mw3cb5tw';
const SHELL = ['./', 'index.html', 'app.css', 'app.js', 'i18n.js', 'store.js', 'schemas.js', 'data/bundle.js',
  'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('prematch-') && k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;   // médias tiers : jamais interceptés ni copiés
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit => {
      const net = fetch(e.request).then(res => {
        if (res.ok) caches.open(VERSION).then(c => c.put(e.request, res.clone()));
        return res;
      }).catch(() => hit);
      return hit || net;     // cache d'abord (rapide), mise à jour en arrière-plan
    })
  );
});

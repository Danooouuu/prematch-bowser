/* Service worker : coquille de l'app + données en cache-first → ouverture instantanée et hors-ligne.
   Changer VERSION à chaque mise à jour du contenu (tools/build-bundle.mjs le fait automatiquement). */
const VERSION = 'prematch-2026.11.05-mw3oo3t2';
const SHELL = ['./', 'index.html', 'app.css', 'app.js', 'i18n.js', 'store.js', 'schemas.js', 'combat.js', 'data/bundle.js', 'data/combat-data.js', 'icons/section-kill.png', 'icons/nav-home.png', 'icons/nav-drills.png', 'icons/nav-flash.png', 'icons/nav-journal.png', 'icons/nav-settings.png', 'icons/nav-bolt.png',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png',
  'icons/section-fiches.png', 'icons/section-drills.png', 'icons/section-revision.png', 'icons/section-journal.png', 'icons/section-framedata.png'];

self.addEventListener('install', e => {
  // cache: 'reload' contourne le cache HTTP (GitHub Pages garde les fichiers 10 min) : la nouvelle version est bien la bonne.
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('prematch-') && k !== VERSION && k !== 'prematch-media').map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Images SmashWiki / miniatures YouTube : servies depuis le cache « prematch-media » si tu les as téléchargées (Réglages → Hors-ligne)
  if (/(^|\.)ssb\.wiki\.gallery$|(^|\.)ytimg\.com$/.test(url.hostname)) {
    e.respondWith(caches.open('prematch-media').then(c => c.match(e.request.url).then(hit => hit || fetch(e.request))));
    return;
  }
  if (url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit => {
      const net = fetch(e.request, { cache: 'no-cache' }).then(res => {
        if (res.ok) caches.open(VERSION).then(c => c.put(e.request, res.clone()));
        return res;
      }).catch(() => hit);
      return hit || net;     // cache d'abord (rapide), mise à jour en arrière-plan
    })
  );
});

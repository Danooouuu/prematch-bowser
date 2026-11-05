# PréMatch Bowser

## ▶ [Ouvrir l'app](https://danooouuu.github.io/prematch-bowser/)

**https://danooouuu.github.io/prematch-bowser/**

Sur iPhone : ouvre ce lien dans Safari → Partager → « Sur l'écran d'accueil ».

---

## README technique

## Lancer
```bash
# sans rien installer : double-clic sur index.html
# avec hors-ligne + installation PWA :
python -m http.server 8080        # ou : npx serve -l 8080
# → http://localhost:8080
```
Aucune dépendance, aucun build obligatoire. Navigateurs : Chrome/Edge/Brave 100+, Safari 16+, Firefox 110+.

## Après modification du contenu
```bash
node tools/build-bundle.mjs       # valide, trie, régénère data/bundle.js, change la version du service worker
```

## Veille (optionnel)
```bash
node tools/veille.mjs --dry
node tools/veille.mjs             # → data/veille.json, à importer dans Admin
```

## Fichiers
| Fichier | Rôle |
|---|---|
| `index.html` | point d'entrée, charge les scripts dans l'ordre |
| `app.js` | routeur, écrans (accueil, fiche, combo, drills, import Poppt, flashcards, admin, réglages) |
| `store.js` | IndexedDB, coffre AES-GCM/PBKDF2, cache médias LRU |
| `schemas.js` | schémas animés SVG originaux |
| `i18n.js` | chaînes d'interface FR (+ EN partiel) |
| `sw.js` | service worker cache-first |
| `manifest.webmanifest` | installation, icônes, raccourcis (`?vs=last`, `?vs=pikachu`…) |
| `data/*.json` | contenu source ; `data/bundle.js` est généré |

## Raccourcis d'URL
- `index.html?vs=pikachu` → fiche directe
- `index.html?vs=last` → dernier adversaire consulté
- `#/flash?vs=gnw` → révision d'un seul matchup
- `#/import-poppt?vs=gnw&combo=gnw-nair-uair` → import pré-rempli

## Débogage
- Réinitialiser : DevTools → Application → Clear storage.
- Inspecter les données fusionnées : `PMApp.data` dans la console.

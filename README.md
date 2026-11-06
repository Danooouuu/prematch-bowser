# PréMatch Bowser — fiches pré-match pour Super Smash Bros. Ultimate

Application personnelle (PWA) pour apprendre et jouer Bowser : ouvre la fiche de l'adversaire en une seconde, lis ses win conditions, ses combos et **tes** contre-mesures, puis entraîne-toi (drills, flashcards). Fonctionne hors-ligne, en français, sans compte ni dépendance payante.

## Contenu du paquet
```
prematch-bowser/
├── README.md                ← ce guide (installation pas à pas)
├── checklist_droits.md      ← conformité GIFs / clips / sources
├── spec/                    ← spécification technique
│   ├── 01-architecture.md           stack (PWA vs React Native), perf < 5 s, routes
│   ├── 02-modele-donnees.md         schéma de base, modèles JSON fiche/combo/média/drill
│   ├── 03-api.md                    modèle local + API REST optionnelle (requêtes/réponses)
│   ├── 04-cache-securite.md         cache, coffre chiffré, limites configurables
│   ├── 05-maquettes-ui.md           description des écrans
│   ├── 06-poppt-source-et-drills.md ajouter Poppt1 comme source, importer ses exercices
│   ├── 07-veille.md                 veille configurable (métadonnées seulement)
│   ├── 08-deploiement-maintenance.md PWA, APK, sauvegarde, mises à jour
│   ├── 09-liste-matchups.md         80 matchups triés et justifiés
│   └── 10-fiches-exemples.md        6 fiches complètes (Pikachu, Peach/Daisy, G&W, Cloud, Fox, Félinferno)
├── ui/  (captures : les GIFs SmashWiki n'y figurent pas, l'environnement de capture n'avait pas de réseau)
├── ui/                      ← maquettes haute fidélité (PNG, sombre + clair)
├── data/                    ← copie des JSON de contenu (matchups, fiches, drills, sources)
└── prototype/               ← l'app, prête à lancer
    ├── index.html, app.js, app.css, store.js, schemas.js, i18n.js, sw.js, manifest.webmanifest
    ├── data/  (JSON + bundle.js généré)
    ├── icons/
    └── tools/ build-bundle.mjs (valide + compile le contenu), veille.mjs (veille RSS)
```

## Les trois façons de l'utiliser
| Appareil | Comment | Hors-ligne |
|---|---|---|
| **PC Windows** | `PreMatch-Bowser-1.3.0-portable.exe` : double-clic, rien à installer. Tes données restent dans `%APPDATA%\prematch-bowser`. | oui ; images SmashWiki aussi après Réglages → Hors-ligne |
| **iPhone** | Safari → https://danooouuu.github.io/prematch-bowser/ → Partager → « Sur l'écran d'accueil ». | oui après une première ouverture avec réseau |
| **N'importe quel navigateur** | dossier `prototype/` (voir ci-dessous) | selon le mode |

Windows peut afficher « Windows a protégé votre ordinateur » (app non signée) : clique « Informations complémentaires » → « Exécuter quand même ».

## Installation pas à pas

### Le plus rapide (Windows ou macOS, 10 secondes)
1. Décompresse l'archive.
2. Double-clique sur `prototype/index.html`. L'app s'ouvre dans ton navigateur (Chrome ou Edge conseillés).

En ouverture directe (`file://`), les fiches, combos, drills et flashcards marchent. Le **hors-ligne garanti** (service worker) et l'**installation** demandent un serveur, voir ci-dessous.

### Windows — avec serveur local (hors-ligne + installation)
1. Installe Python depuis python.org (coche « Add to PATH ») **ou** Node.js LTS depuis nodejs.org.
2. Ouvre le dossier `prototype`, clic droit dans le vide → « Ouvrir dans le Terminal ».
3. Lance : `python -m http.server 8080`  (ou `npx serve -l 8080`)
4. Ouvre `http://localhost:8080` dans Chrome/Edge → icône « Installer » dans la barre d'adresse.

### macOS — avec serveur local
1. Terminal : `cd chemin/vers/prematch-bowser/prototype`
2. `python3 -m http.server 8080` (Python 3 est fourni par les outils de ligne de commande ; sinon `npx serve -l 8080`)
3. Ouvre `http://localhost:8080` dans Chrome → Installer ; dans Safari (macOS 14+) : Fichier → Ajouter au Dock.

### Android et iOS — PWA installée (recommandé)
Le téléphone a besoin d'une adresse **HTTPS**. Le plus simple, gratuit :
1. Va sur **app.netlify.com/drop** depuis ton PC et glisse le dossier `prototype/` (ou utilise GitHub Pages, voir `spec/08`).
2. Tu obtiens une URL `https://….netlify.app`.
3. **Android (Chrome)** : ouvre l'URL → menu ⋮ → « Installer l'application ».
   **iOS (Safari)** : ouvre l'URL → bouton Partager → « Sur l'écran d'accueil ».
4. Ouvre l'app une fois avec réseau : tout est mis en cache, elle fonctionne ensuite **en mode avion**.
5. Appui long sur l'icône (Android) : raccourcis « Dernier adversaire », « Pikachu », « Peach », « Drills ».

Sans hébergement : le PC lance le serveur local, et le téléphone (même Wi-Fi) ouvre `http://<IP-du-PC>:8080`. Les fiches s'affichent, mais sans HTTPS l'installation complète et le coffre chiffré restent inactifs.

### APK Android (optionnel)
Avec l'URL HTTPS : pwabuilder.com → « Package for stores » → Android → télécharge l'APK → installe-le (autoriser les sources inconnues). Détails dans `spec/08`.

## Utilisation avant un match (< 5 s)
1. Tap sur l'icône → la fiche du **dernier adversaire** s'ouvre directement ; sinon gros bouton **Pré-match**, ou tape 3 lettres (« pik », « gnw », « incin ») + Entrée.
2. Lis les 3–4 win conditions, puis **💡 Conseil rapide** (plein écran).
3. Swipe le carousel pour revoir les situations ; déplie un combo pour ses contre-mesures.

## Modifier le contenu
- Dans l'app : **Admin** → choisis une fiche → modifie → Enregistrer (stocké sur l'appareil, ton édition prime sur le contenu d'origine).
- Dans les fichiers : édite `prototype/data/*.json` puis `node tools/build-bundle.mjs` (valide l'attribution des médias et régénère `bundle.js`).
- Ajouter Poppt1 et importer ses exercices : `spec/06-poppt-source-et-drills.md`.

## Ce qu'il faut savoir sur le contenu fourni
- **80 matchups** classés (base : tableau Game8, désaccords signalés) ; **6 fiches complètes** ; les autres ont cote + justification et un bouton « Rédiger cette fiche ».
- Les pourcentages des combos sont **indicatifs** : Bowser est très lourd, la DI et la rage déplacent les fenêtres. Valide-les en mode Entraînement.
- **Icônes de personnages** partout (liste, favoris, fiches, journal) pour te repérer d'un coup d'œil.
- **SmashPro.tips intégré** : profil de chaque adversaire (points forts/faibles, meilleurs coups reliés à leur hitbox, options rapides et hors bouclier) + avis SmashPro sur les matchups de Bowser, et un **guide Bowser** rédigé d'après leur page.
- **Inputs en boutons de manette GameCube** (A, B, X, Z, R, C-stick, stick) ; repasse en texte dans Réglages si besoin.
- **80 fiches complètes** : win conditions, situations à reconnaître, 3 combos avec contre-mesures et GIFs de hitbox, conseils, stage à proposer, leçon Poppt liée.
- **Outils de progression** : journal de matchs avec statistiques (l'app repère ce qui te coûte des défaites et ouvre le drill correspondant), plan de jeu par matchup, frame data de Bowser (options hors bouclier), routine minutée de 10 minutes, drills de saisie et de récupération.
- **Icônes 3D** rendues dans Blender (fichier source `icone_prematch.blend` dans `ui/blender/`).
- **Galerie de coups pour les 80 matchups** : 2 355 GIFs de hitbox SmashWiki (chaque coup de chaque perso, plus tous les coups de Bowser via « Mes coups »), et des flashcards « Quel coup est-ce ? ».
- **Vraies images du jeu dans les fiches** : 24 GIFs de hitbox de SmashWiki (coups adverses + réponses de Bowser), chargés par lien et crédités ; il faut du réseau pour les voir. Hors-ligne, les schémas animés originaux prennent le relais.
- **Poppt1 — School of Smash Fundamentals** : les 19 leçons de la playlist sont intégrées (onglet Drills), reliées aux combos par thème, avec 5 drills prêts. Aucun timestamp n'a été inventé : les liens pointent sur la vidéo entière.

## Nouveautés 1.3 : combat, multi-perso, hors-ligne
- **Mon perso** (Réglages) : choisis n'importe lequel des 80 persos. Punitions, % de kill, frame data et guide s'adaptent ; les contre-mesures rédigées restent écrites pour Bowser (l'app le signale).
- **Section « Combat » dans chaque fiche** (80 persos) :
  - *Ce que tu peux punir hors bouclier* : tous ses coups à −N ou pire sur ton bouclier (N = ta meilleure option hors bouclier), ✊ quand ta saisie passe aussi, et ses coups sûrs.
  - *Tes % de kill sur lui* et *ses % de kill sur toi* (Battlefield, centre et bord, DI de survie).
  - Ses coups les plus rapides et ses options hors bouclier.
- **Calculateur de % de kill** (tuile « % de kill ») : attaquant, cible, 8 stages tournoi, centre/bord, DI, rage. Formules d'Ultimate reprises de rubendal/SSBU-Calculator (MIT) ; valeurs à ±5 %, sans coups usés. Kazuya et Sora ne sont pas couverts comme attaquants.
- **Frame data et guide pour ton perso**, quel qu'il soit.
- **Images hors-ligne** : Réglages → Hors-ligne (icônes 0,5 Mo, hitbox de ton perso, favoris, 80 fiches ≈ 200 Mo, tout ≈ 1 Go) et bouton 📥 sur chaque fiche. Stockées sur l'appareil, servies par le service worker.

## 1.3.2 : lecteur GIF
Les GIFs de hitbox passent par un lecteur maison (`prototype/gifplayer.js`) : affichage toujours complet (le navigateur tronquait des morceaux après un moment), boutons pause, image par image et ralenti ½× / ¼×, compteur d'images. Un GIF n'est téléchargé et animé que quand il est à l'écran.

## Tests effectués
Chrome headless, écran 390×844 : fiche visible en 290–434 ms à froid, 143 ms hors-ligne ; carousel, combos déroulants, conseil rapide, minuteur, flashcards, import Poppt (lien + timestamp → drill + média lié), édition admin, coffre chiffré (fichier stocké sans en-tête lisible, déchiffré à l'affichage), ouverture en `file://` ; aucune erreur console.

#!/usr/bin/env node
/* Génère data/bundle.js à partir des JSON de data/ (pour que l'app s'ouvre même en file://, sans serveur),
   valide le contenu, trie les matchups et met à jour la version du service worker.
   Usage : node tools/build-bundle.mjs            (aucune dépendance) */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = f => JSON.parse(readFileSync(join(root, 'data', f), 'utf8'));
const matchups = read('matchups.json'), fiches = read('fiches.json'), drills = read('drills.json'), sources = read('sources.json');

const errors = [];
const ids = new Set();
matchups.matchups.forEach(m => {
  if (ids.has(m.id)) errors.push(`matchup en double : ${m.id}`);
  ids.add(m.id);
  if (!(m.difficulte >= 1 && m.difficulte <= 10)) errors.push(`difficulté hors 1–10 : ${m.id}`);
});
matchups.matchups.sort((a, b) => b.difficulte - a.difficulte);   // tri stable : ordre éditorial conservé à difficulté égale
for (const f of fiches.fiches) {
  if (!ids.has(f.id)) errors.push(`fiche sans matchup : ${f.id}`);
  const mids = new Set((f.medias || []).map(m => m.id));
  if ((f.win_conditions || []).length < 3) errors.push(`${f.id} : moins de 3 win conditions`);
  if ((f.combos || []).length < 3) errors.push(`${f.id} : moins de 3 combos`);
  for (const c of f.combos || []) {
    for (const k of ['titre', 'inputs', 'conditions', 'but', 'contre_mesures']) if (!c[k]) errors.push(`${f.id}/${c.id} : champ ${k} manquant`);
    for (const mid of c.medias || []) if (!mids.has(mid)) errors.push(`${f.id}/${c.id} : média inconnu ${mid}`);
  }
  for (const m of f.medias || []) for (const k of ['source', 'auteur', 'permission']) if (m[k] === undefined) errors.push(`${f.id}/${m.id} : ${k} manquant (attribution obligatoire)`);
  const mu = matchups.matchups.find(x => x.id === f.id);
  if (mu) mu.fiche = true;
}
if (errors.length) { console.error('✗ Contenu invalide :\n  ' + errors.join('\n  ')); process.exit(1); }

writeFileSync(join(root, 'data', 'matchups.json'), JSON.stringify(matchups, null, 2) + '\n');

/* ---------- Galerie de coups SmashWiki (hitboxes.txt → URLs) ---------- */
const TOK = [ // [code, libellé FR, catégorie]
  ['DashAttack', 'Attaque en course', 'sol'], ['RapidJab', 'Jab rapide', 'sol'], ['Jab', 'Jab', 'sol'],
  ['FTilt', 'Tilt avant', 'sol'], ['UTilt', 'Tilt haut', 'sol'], ['DTilt', 'Tilt bas', 'sol'], ['BTilt', 'Tilt arrière', 'sol'],
  ['FSmash', 'Smash avant', 'smash'], ['USmash', 'Smash haut', 'smash'], ['DSmash', 'Smash bas', 'smash'], ['DownSmash', 'Smash bas', 'smash'],
  ['NAir', 'Nair', 'air'], ['FAir', 'Fair', 'air'], ['BAir', 'Bair', 'air'], ['UAir', 'Uair', 'air'], ['DAir', 'Dair', 'air'], ['ZAir', 'Zair', 'air'],
  ['Nair', 'Nair', 'air'], ['Fair', 'Fair', 'air'], ['Bair', 'Bair', 'air'], ['Uair', 'Uair', 'air'], ['Dair', 'Dair', 'air'],
  ['NSpecial', 'Spécial neutre (B)', 'special'], ['SSpecial', 'Spécial côté (→B)', 'special'], ['SideSpecial', 'Spécial côté (→B)', 'special'],
  ['USpecial', 'Spécial haut (↑B)', 'special'], ['DSpecial', 'Spécial bas (↓B)', 'special'], ['DownSpecial', 'Spécial bas (↓B)', 'special'],
  ['FThrow', 'Projection avant', 'throw'], ['BThrow', 'Projection arrière', 'throw'], ['UThrow', 'Projection haut', 'throw'], ['DThrow', 'Projection bas', 'throw'],
  ['ForwardThrow', 'Projection avant', 'throw'], ['BackThrow', 'Projection arrière', 'throw'], ['UpThrow', 'Projection haut', 'throw'], ['DownThrow', 'Projection bas', 'throw'],
  ['Grab', 'Saisie', 'throw'], ['Forward_Tilt', 'Tilt avant', 'sol'], ['Up_Tilt', 'Tilt haut', 'sol'], ['Down_Tilt', 'Tilt bas', 'sol'], ['Dash_Attack', 'Attaque en course', 'sol'],
  ['Forward_Smash', 'Smash avant', 'smash'], ['Up_Smash', 'Smash haut', 'smash'], ['Down_Smash', 'Smash bas', 'smash'],
  ['Neutral_Air', 'Nair', 'air'], ['Forward_Air', 'Fair', 'air'], ['Back_Air', 'Bair', 'air'], ['Up_Air', 'Uair', 'air'], ['Down_Air', 'Dair', 'air'],
  ['Forward_Throw', 'Projection avant', 'throw'], ['Back_Throw', 'Projection arrière', 'throw'], ['Up_Throw', 'Projection haut', 'throw'], ['Down_Throw', 'Projection bas', 'throw'], ['Standing_Grab', 'Saisie', 'throw']
].sort((a, b) => b[0].length - a[0].length);
const WORDS = { Grounded: 'au sol', Ground: 'au sol', G: 'au sol', Aerial: 'en l’air', Air: 'en l’air', A: 'en l’air', Up: 'haut', Down: 'bas', Hit: 'touché', Miss: 'raté',
  Falling: 'en chute', Landing: 'atterrissage', Max: 'max', Min: 'min', Charged: 'chargé', Uncharged: 'non chargé', FullyCharged: 'chargé', Reversed: 'inversé', Explosion: 'explosion',
  Attack: 'attaque', Counter: 'contre', Start: 'début', Weak: 'faible', Medium: 'moyen', Heavy: 'fort', Tapped: 'tapé', Held: 'maintenu', Close: 'proche', Far: 'loin', Success: 'réussi', Failure: 'raté', Early: 'tôt' };
const camel = t => t.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Za-z])(\d)/g, '$1 $2').trim();
function label(rest) {
  let who = '';
  const sub = rest.match(/^(Popo|Nana|IceClimbers|Rosalina&Luma|Rosalina|Luma|Olimar|(?:Red|Yellow|Blue|White|Purple)Pikmin|iranhaPlant|eteyPiranha|SS|eroSuitSamus)/);
  if (sub) { who = sub[1].replace('iranhaPlant', '').replace('eroSuitSamus', '').replace('SS', '').replace('eteyPiranha', 'Petey Piranha').replace(/(\w)Pikmin/, '$1 Pikmin').replace('IceClimbers', ''); rest = rest.slice(sub[1].length); }
  const t = TOK.find(([code]) => rest.startsWith(code));
  const tail = t ? rest.slice(t[0].length) : rest;
  const q = camel(tail).split(' ').filter(Boolean).map(w => WORDS[w] || w).join(' ');
  const base = t ? t[1] : camel(rest).split(' ').map((w, i) => i && WORDS[w] ? WORDS[w] : w).join(' ');
  return { l: (base + (t && q ? ' (' + q + ')' : '') + (who ? ' · ' + who : '')).trim(), c: t ? t[2] : 'special' };
}
const hitboxes = {};
for (const line of readFileSync(join(root, 'data', 'hitboxes.txt'), 'utf8').split('\n')) {
  if (!line.trim() || line.startsWith('#')) continue;
  const [id, page, prefix, list] = line.split('|');
  if (!ids.has(id) && !['pyra', 'mythra'].includes(id)) { errors.push(`hitboxes : id inconnu ${id}`); continue; }
  const moves = list.split(',').filter(Boolean).map(suf => {
    const file = suf.startsWith('!') ? suf.slice(1) : prefix + suf + 'SSBU.gif';
    const h = createHash('md5').update(file.replace(/ /g, '_')).digest('hex');
    const raw = suf.startsWith('!') ? suf.slice(1).replace(/\.gif.*$/, '').replace('SSBU', '').replace(prefix || '@@', '') : suf;
    const lab = label(raw);
    return [lab.l, lab.c, `${h[0]}/${h.slice(0, 2)}/${encodeURIComponent(file)}`];
  });
  hitboxes[id] = { page: `https://www.ssbwiki.com/${page}_(SSBU)/Hitboxes`, moves };
}
// Pyra et Mythra partagent le matchup « pyra-mythra »
if (hitboxes.pyra && hitboxes.mythra) {
  hitboxes['pyra-mythra'] = { page: hitboxes.pyra.page, moves: [...hitboxes.pyra.moves.map(m => [m[0] + ' · Pyra', m[1], m[2]]), ...hitboxes.mythra.moves.map(m => [m[0] + ' · Mythra', m[1], m[2]])] };
  delete hitboxes.pyra; delete hitboxes.mythra;
}
if (errors.length) { console.error('✗ Hitboxes :\n  ' + errors.join('\n  ')); process.exit(1); }

const bundle = { matchups, fiches, drills, sources, hitboxes: { base: 'https://ssb.wiki.gallery/images/', credit: 'Contributeurs SmashWiki · images du jeu © Nintendo', perso: hitboxes }, built: new Date().toISOString() };
writeFileSync(join(root, 'data', 'bundle.js'), '/* Généré par tools/build-bundle.mjs — ne pas éditer à la main. */\nself.PREMATCH_DATA = ' + JSON.stringify(bundle) + ';\n');

const swPath = join(root, 'sw.js');
const sw = readFileSync(swPath, 'utf8').replace(/const VERSION = '[^']*';/, `const VERSION = 'prematch-${fiches.version}-${Date.now().toString(36)}';`);
writeFileSync(swPath, sw);
console.log(`✓ bundle.js : ${matchups.matchups.length} matchups, ${fiches.fiches.length} fiches, ${drills.drills.length} drills, ${sources.sources.length} sources, ${Object.values(hitboxes).reduce((n, h) => n + h.moves.length, 0)} GIFs de hitbox pour ${Object.keys(hitboxes).length} persos`);

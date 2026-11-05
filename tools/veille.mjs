#!/usr/bin/env node
/* Veille de contenu — métadonnées uniquement.
   Lit data/sources.json + data/veille.config.json, interroge le flux RSS public YouTube de chaque chaîne autorisée,
   garde les vidéos dont le titre contient un mot-clé ou un nom de personnage, et écrit data/veille.json.
   Ne télécharge JAMAIS de vidéo, d'image ni de GIF : seulement titre, lien, auteur, date.
   Usage : node tools/veille.mjs [--dry]          (Node 18+, aucune dépendance) */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = f => JSON.parse(readFileSync(join(root, 'data', f), 'utf8'));
const cfgPath = join(root, 'data', 'veille.config.json');
const cfg = existsSync(cfgPath) ? JSON.parse(readFileSync(cfgPath, 'utf8')) : {};
const CONFIG = {
  sources_autorisees: cfg.sources_autorisees || ['poppt1'],   // allowlist explicite
  mots_cles_globaux: cfg.mots_cles_globaux || ['bowser'],
  max_par_source: cfg.max_par_source || 15,
  delai_ms_entre_requetes: cfg.delai_ms_entre_requetes || 2000, // politesse : 1 requête / 2 s
  age_max_jours: cfg.age_max_jours || 365,
  user_agent: cfg.user_agent || 'PreMatch-veille/1.0 (usage personnel)'
};
const DRY = process.argv.includes('--dry');

const sources = read('sources.json').sources.filter(s => CONFIG.sources_autorisees.includes(s.id) && s.type === 'youtube' && (s.channel_id || s.playlist_id))
  .flatMap(s => [s.channel_id && { ...s, feed: 'channel_id=' + s.channel_id }, s.playlist_id && { ...s, feed: 'playlist_id=' + s.playlist_id }].filter(Boolean));
const matchups = read('matchups.json').matchups;
const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const decode = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const tag = (xml, t) => { const m = xml.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)); return m ? decode(m[1].trim()) : ''; };

const candidats = [];
const vus = new Set();
for (const s of sources) {
  const url = `https://www.youtube.com/feeds/videos.xml?${s.feed}`;
  console.log(`→ ${s.nom} : ${url}`);
  if (DRY) continue;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': CONFIG.user_agent } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const xml = await res.text();
    const entries = xml.split('<entry>').slice(1);
    const kws = [...CONFIG.mots_cles_globaux, ...(s.mots_cles_veille || [])].map(norm);
    let n = 0;
    for (const e of entries) {
      const titre = tag(e, 'title'), vid = tag(e, 'yt:videoId'), date = tag(e, 'published'), auteur = tag(e, 'name');
      if (!vid || vus.has(vid)) continue;
      vus.add(vid);
      if ((Date.now() - Date.parse(date)) / 864e5 > CONFIG.age_max_jours) continue;
      const t = norm(titre);
      const detect = matchups.filter(m => [m.nom, ...(m.alias || [])].some(a => a.length > 2 && t.includes(norm(a)))).map(m => m.id);
      if (!kws.some(k => t.includes(k)) && !detect.length) continue;
      candidats.push({ titre, lien: `https://www.youtube.com/watch?v=${vid}`, video_id: vid, auteur: auteur || s.nom, date, source_id: s.id, source_nom: s.nom, matchups_detectes: detect, attribution: s.attribution, statut: 'a_verifier' });
      if (++n >= CONFIG.max_par_source) break;
    }
    console.log(`  ${n} candidat(s)`);
  } catch (err) { console.error(`  ✗ ${err.message}`); }
  await sleep(CONFIG.delai_ms_entre_requetes);
}
if (!sources.length) console.warn('Aucune source YouTube autorisée avec channel_id. Renseigne data/sources.json ou Réglages → Sources.');
if (!DRY) {
  writeFileSync(join(root, 'data', 'veille.json'), JSON.stringify({ genere_le: new Date().toISOString(), config: CONFIG, candidats }, null, 2));
  console.log(`✓ data/veille.json : ${candidats.length} candidat(s). Importe-le dans l'app : Admin → Importer veille.json`);
}

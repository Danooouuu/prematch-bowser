/* PréMatch — Bowser. Application PWA sans dépendance ni build.
   Rendu synchrone immédiat depuis data/bundle.js (fiche affichée < 1 s), puis fusion des éditions locales (IndexedDB). */
(function () {
  'use strict';
  const T = (k, v) => PMI18n.t(k, v);
  const S = self.PMStore;
  const BASE = self.PREMATCH_DATA;
  const app = document.getElementById('app');

  /* ---------- Utilitaires ---------- */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9&]+/g, ' ').trim();
  const lines = s => String(s || '').split('\n').map(x => x.trim()).filter(Boolean);
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const uid = p => p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const clone = o => JSON.parse(JSON.stringify(o));
  const dClass = d => d >= 8 ? 'd-hi' : d >= 5 ? 'd-mid' : 'd-lo';
  const MB = 1024 * 1024;
  function toast(msg) {
    let el = $('#toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = msg; el.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('show'), 2200);
  }
  function download(name, obj) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function parseTs(s) {   // "3:12" | "1:02:03" | "192" | "3m12s" -> secondes
    if (!s) return 0; s = String(s).trim();
    let m = s.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
    if (m && (m[1] || m[2])) return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
    if (/^\d+$/.test(s)) return +s;
    const p = s.split(':').map(Number); if (p.some(isNaN)) return 0;
    return p.reduce((acc, n) => acc * 60 + n, 0);
  }
  const fmtTs = sec => { sec = Math.max(0, Math.round(sec)); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0'); };
  function parseYouTube(url) {
    try {
      const u = new URL(url);
      let id = null;
      if (u.hostname.includes('youtu.be')) id = u.pathname.slice(1).split('/')[0];
      else if (u.pathname.startsWith('/shorts/') || u.pathname.startsWith('/embed/')) id = u.pathname.split('/')[2];
      else id = u.searchParams.get('v');
      if (!id || !/^[\w-]{6,}$/.test(id)) return null;
      return { id, start: parseTs(u.searchParams.get('t') || u.searchParams.get('start') || '') };
    } catch (e) { return null; }
  }

  /* ---------- Préférences (localStorage, jamais bloquant) ---------- */
  const PREF_KEY = 'prematch-prefs-v1';
  const DEFAULTS = { lang: 'fr', main: 'bowser', notation: 'gc', theme: 'auto', wakelock: true, cacheMB: 150, vaultMB: 500, favs: ['pikachu', 'peach'], recents: [], combosOpen: true, flash: {}, drillLog: [] };
  let prefs = (() => { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') }; } catch (e) { return { ...DEFAULTS }; } })();
  const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) { /* stockage indisponible : l'app marche quand même */ } };
  function applyTheme() {
    const r = document.documentElement;
    if (prefs.theme === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', prefs.theme);
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.content = prefs.theme === 'light' ? '#f6f4ef' : '#0d0f12';
  }

  /* ---------- Données ---------- */
  let DATA = build(BASE, {}, [], []);
  function build(base, editedFiches, userDrills, userSources) {
    const fiches = {};
    base.fiches.fiches.forEach(f => { fiches[f.id] = f; });
    Object.assign(fiches, editedFiches);
    const drills = base.drills.drills.filter(d => !userDrills.some(u => u.id === d.id)).concat(userDrills);
    const sources = base.sources.sources.map(s => userSources.find(u => u.id === s.id) || s).concat(userSources.filter(u => !base.sources.sources.some(s => s.id === u.id)));
    const matchups = base.matchups.matchups.map(m => ({ ...m, difficulte: fiches[m.id] ? fiches[m.id].difficulte : m.difficulte, fiche: !!fiches[m.id] }))
      .sort((a, b) => b.difficulte - a.difficulte);
    const byId = {}; matchups.forEach(m => { byId[m.id] = m; });
    return { matchups, byId, fiches, drills, sources, meta: base.matchups, edited: new Set(Object.keys(editedFiches)) };
  }
  async function loadLocal() {
    try {
      const ef = {}; (await S.all('fiches')).forEach(r => { ef[r.key] = r.value; });
      const ud = (await S.all('drills')).map(r => r.value);
      const us = (await S.all('sources')).map(r => r.value);
      DATA = build(BASE, ef, ud, us);
      return Object.keys(ef).length + ud.length + us.length > 0;
    } catch (e) { console.warn('Stockage local indisponible :', e); return false; }
  }
  const source = id => DATA.sources.find(s => s.id === id);

  /* ---------- Wake Lock (écran allumé sur une fiche) ---------- */
  let wake = null;
  async function wakeOn() { try { if (prefs.wakelock && 'wakeLock' in navigator && !wake) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } } catch (e) { wake = null; } }
  function wakeOff() { try { if (wake) wake.release(); } catch (e) { } wake = null; }

  /* ---------- Rendu générique ---------- */
  const nav = active => `<nav class="bottom" aria-label="Navigation">
    ${[['home', '#/'], ['drills', '#/drills'], ['flash', '#/flash'], ['journal', '#/journal'], ['settings', '#/reglages']]
      .map(([k, href]) => `<a href="${href}" class="${active === k ? 'on' : ''}"><img src="icons/nav-${k}.png" alt="" width="30" height="30">${T('nav_' + k)}</a>`).join('')}</nav>`;
  const top = (title, backHref, extra = '', headId = '') => `<header class="top">
    ${backHref ? `<a class="icon-btn" href="${backHref}" aria-label="${T('back')}">‹</a>` : `<div class="brand">${T('app')} <span>${esc(mainNom())}</span></div>`}
    ${backHref ? `${headId ? head(headId, 36) : ''}<h1>${esc(title)}</h1>` : ''}<div class="top-extra">${extra}</div></header>`;
  const meter = d => `<div class="meter ${dClass(d)}" role="img" aria-label="${T('difficulty')} ${d}/10">${Array.from({ length: 10 }, (_, i) => `<i class="${i < d ? 'on' : ''}"></i>`).join('')}<b>${d}/10</b></div>`;
  /* ---------- Mon perso (multi-perso) ---------- */
  const mainId = () => (prefs.main && DATA.byId[prefs.main]) ? prefs.main : 'bowser';
  const mainNom = () => (DATA.byId[mainId()] || { nom: 'Bowser' }).nom.replace(' (miroir)', '');
  /* ---------- Données de combat (chargées après le 1er rendu) ---------- */
  let COMBAT_READY = !!self.PREMATCH_COMBAT;
  function loadCombat() {
    if (COMBAT_READY) return Promise.resolve(true);
    if (!loadCombat.p) loadCombat.p = new Promise(res => { const sc = document.createElement('script'); sc.src = 'data/combat-data.js'; sc.onload = () => { COMBAT_READY = true; res(true); }; sc.onerror = () => res(false); document.head.appendChild(sc); });
    return loadCombat.p;
  }
  /* Noms de coups (sources en anglais) → français court, notation des joueurs entre parenthèses */
  const MV_FR = [[/^Neutral Air\b/, 'Aérien neutre (nair)'], [/^Forward Air\b/, 'Aérien avant (fair)'], [/^Back Air\b/, 'Aérien arrière (bair)'], [/^Up Air\b/, 'Aérien haut (uair)'], [/^Down Air\b/, 'Aérien bas (dair)'],
    [/^Forward Smash\b/, 'Smash avant'], [/^Up Smash\b/, 'Smash haut'], [/^Down Smash\b/, 'Smash bas'], [/^Forward Tilt\b/, 'Tilt avant'], [/^Up Tilt\b/, 'Tilt haut'], [/^Down Tilt\b/, 'Tilt bas'],
    [/^Dash Attack\b/, 'Attaque en course'], [/^Rapid Jab Finisher\b/, 'Fin de jab rapide'], [/^Jab\b/, 'Jab'], [/^Forward Throw\b/, 'Lancer avant'], [/^Back(ward)? Throw\b/, 'Lancer arrière'], [/^Up Throw\b/, 'Lancer haut'], [/^Down Throw\b/, 'Lancer bas'],
    [/^Neutral B\b/, 'B neutre'], [/^Side B\b/, 'B côté'], [/^Up B\b/, 'B haut'], [/^Down B\b/, 'B bas'], [/^Dash Grab\b/, 'Saisie en course'], [/^Pivot Grab\b/, 'Saisie pivot'], [/^Grab\b/, 'Saisie'],
    [/\(Air\)/, '(en l\u2019air)'], [/\bAir\b(?=[,)])/, 'en l\u2019air'], [/ or /, ' ou ']];
  const mvFr = n => MV_FR.reduce((t, [re, v]) => t.replace(re, v), String(n));
  const fr = n => n === null || n === undefined ? '—' : n + ' %';
  const advCls = a => a <= -15 ? 'unsafe' : a <= -6 ? 'meh' : 'ok';
  function koRows(atk, tgt, stage = 'Battlefield', limit = 6) {
    const rows = PMCombat.killTable(atk, tgt, { stage, pos: 'centre' }, limit);
    return rows.map(r => ({ ...r, edge: PMCombat.koPercent(r.mv, tgt, { stage, pos: 'bord' }) }));
  }
  const koTable = rows => rows.length ? `<div class="table-wrap"><table class="ko"><thead><tr><th>Coup</th><th>Sort</th><th>Centre</th><th>Bord</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(mvFr(r.name))}</td><td>${r.startup > 1 ? 'f' + r.startup : '—'}</td><td>${fr(r.ko)}</td><td>${fr(r.edge)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Données d’éjection indisponibles pour ce perso.</p>';
  async function fillCombat(root = app) {
    const boxes = $$('[data-combat]', root); if (!boxes.length) return;
    if (!(await loadCombat())) { boxes.forEach(b => { b.innerHTML = '<p class="muted">Données de combat indisponibles hors-ligne tant que l’app n’a pas été ouverte une fois avec du réseau.</p>'; }); return; }
    const me = mainId(), meNom = mainNom();
    boxes.forEach(b => {
      const id = b.dataset.id; const nom = (DATA.byId[id] || { nom: id }).nom.replace(' (miroir)', '');
      if (b.dataset.combat === 'fiche') {
        const p = PMCombat.punishable(me, id);
        const mine = koRows(me, id), theirs = koRows(id, me, 'Battlefield', 5);
        const fast = PMCombat.fastestMoves(id, 5), oos = PMCombat.oosOptions(id);
        const chipsAdv = (list, grab) => list.slice(0, 14).map(r => `<span class="chip sm adv-${advCls(r.adv)}">${esc(mvFr(r.name))} <b>${r.adv}</b>${grab && r.adv <= -grab.frames ? ' ✊' : ''}</span>`).join('');
        b.innerHTML = `
          <h4>🛡 Ce que tu peux punir hors bouclier</h4>
          ${p ? `<p class="small">Ton option la plus rapide : <b>${esc(mvFr(p.fastest.name))}</b> (${p.fastest.frames} frames). Tout coup de ${esc(nom)} à <b>−${p.fastest.frames} ou pire</b> sur ton bouclier est punissable.</p>
            <div class="chips">${chipsAdv(p.byFastest, p.grab) || '<span class="muted">Aucun coup relevé à ce niveau.</span>'}</div>
            ${p.grab ? `<p class="muted small">✊ = aussi punissable par ta saisie hors bouclier (${p.grab.frames} frames) : la punition la plus sûre.</p>` : ''}
            <p class="small">Sûrs sur ton bouclier (ne lance pas ton option dessus) :</p><div class="chips">${p.safe.slice(0, 8).map(r => `<span class="chip sm adv-ok">${esc(mvFr(r.name))} <b>${r.adv}</b></span>`).join('')}</div>` : '<p class="muted">Frame data indisponible.</p>'}
          <h4>💀 Tes % de kill sur ${esc(nom)}</h4>${koTable(mine)}
          <h4>⚠ Ses % de kill sur toi (${esc(meNom)})</h4>${koTable(theirs)}
          <div class="sp-cols"><div><h4>Ses coups les plus rapides</h4><p class="small">${fast.map(f => `${esc(mvFr(f.name))} <b>f${f.startup}</b>`).join(' · ') || '—'}</p></div>
            <div><h4>Ses options hors bouclier</h4><p class="small">${oos.map(o => `${esc(mvFr(o.name))} <b>${o.frames}f</b>`).join(' · ') || '—'}</p></div></div>
          <p class="muted">Battlefield, 1 contre 1, DI de survie, sans rage ni coups usés : valeurs indicatives. <a href="#/kill?vs=${id}">Calculateur complet ›</a></p>
          <p class="src">Frame data : Ultimate Frame Data · éjection : rubendal/SSBU-Calculator (MIT) · stages : données LVD du jeu.</p>`;
      }
    });
  }
  const goalTag = g => `<span class="goal g-${esc(g)}">${T('goal_' + g)}</span>`;
  /* Icône de tête (SmashWiki) avec repli sur les initiales si l'image ne charge pas */
  const HEADS = BASE.heads || { perso: {} };
  function head(id, size = 32) {
    const p = HEADS.perso[id]; const m = DATA.byId[id] || { nom: id };
    const ini = esc(m.nom.replace(/[^A-Za-zÀ-ÿ ]/g, '').split(' ').map(w => w[0]).join('').slice(0, 2));
    return `<span class="head" style="--s:${size}px" data-ini="${ini}">${p ? `<img src="${HEADS.base + p}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" width="${size}" height="${size}" onerror="this.remove()">` : ''}</span>`;
  }
  /* Notation manette GameCube */
  const K = (b, cls) => `<b class="gc gc-${cls || b}">${b}</b>`;
  const ST = d => `<b class="gc gc-stick">${d}</b>`, CS = d => `<b class="gc gc-C">C${d}</b>`;
  const GC_RULES = [
    [/saut court|short hop/, () => K('X') + '<i>tap</i>'], [/fast.?fall|chute rapide/, () => ST('↓') + '<i>au sommet</i>'],
    [/up.?throw/, () => K('Z') + ST('↑')], [/down.?throw/, () => K('Z') + ST('↓')], [/back.?throw/, () => K('Z') + ST('←')], [/(forward|f).?throw/, () => K('Z') + ST('→')],
    [/hors bouclier|oos/, () => K('R') + '+' + ST('↑') + K('B')],
    [/up.?b|whirling|climhazzard|fire fox|up-b/, () => ST('↑') + K('B')], [/side.?b|flying slam|spin dash|kart|roller|whip/, () => ST('→') + K('B')],
    [/down.?b|bowser bomb|seau|vengeance|counter|thunder(?! jolt)|rest\b/, () => ST('↓') + K('B')], [/neutral.?b|souffle|jolt|laser|charge shot/, () => K('B')],
    [/up.?smash/, () => CS('↑')], [/(side|f).?smash/, () => CS('→')], [/down.?smash/, () => CS('↓')],
    [/up.?tilt/, () => ST('↑') + '<i>léger</i>' + K('A')], [/d.?tilt|tilt bas/, () => ST('↓') + K('A')], [/f.?tilt|tilt/, () => ST('→') + '<i>léger</i>' + K('A')],
    [/up.?air|uair/, () => CS('↑') + '<i>en l’air</i>'], [/\bfair/, () => CS('→') + '<i>en l’air</i>'], [/\bbair/, () => CS('←') + '<i>en l’air</i>'],
    [/\bdair/, () => CS('↓') + '<i>en l’air</i>'], [/\bnair/, () => K('A') + '<i>en l’air</i>'], [/\bzair/, () => K('Z') + '<i>en l’air</i>'],
    [/dash attack|attaque en course/, () => ST('⇉') + K('A')], [/\bjab/, () => K('A')], [/grab|saisie/, () => K('Z')], [/bouclier/, () => K('R')],
    [/esquive/, () => K('R') + ST('↕')], [/\bdash|course/, () => ST('⇉')], [/saut/, () => K('X')]];
  function gcInput(txt) {
    if (prefs.notation !== 'gc') return `<kbd>${esc(txt)}</kbd>`;
    const t = String(txt).toLowerCase(); const r = GC_RULES.find(([re]) => re.test(t));
    return `<span class="gcin"><span class="gc-t">${esc(txt)}</span>${r ? `<span class="gc-k">${r[1]()}</span>` : ''}</span>`;
  }
  /* SmashPro.tips : nom de coup anglais → GIF de hitbox */
  const SP = BASE.smashpro || { perso: {} };
  const SP_MAP = [['NEUTRAL AIR', 'Nair'], ['FORWARD AIR', 'Fair'], ['BACK AIR', 'Bair'], ['UP AIR', 'Uair'], ['DOWN AIR', 'Dair'], ['ZAIR', 'Zair'],
    ['UP SMASH', 'Smash haut'], ['FORWARD SMASH', 'Smash avant'], ['DOWN SMASH', 'Smash bas'], ['UP TILT', 'Tilt haut'], ['DOWN TILT', 'Tilt bas'], ['FORWARD TILT', 'Tilt avant'],
    ['DASH ATTACK', 'Attaque en course'], ['JAB', 'Jab'], ['DOWN THROW', 'Projection bas'], ['UP THROW', 'Projection haut'], ['GRAB', 'Saisie'],
    ['NEUTRAL B', 'Spécial neutre'], ['SIDE B', 'Spécial côté'], ['UP B', 'Spécial haut'], ['DOWN B', 'Spécial bas']];
  function spMove(id, name) {
    const h = (BASE.hitboxes || { perso: {} }).perso[id]; if (!h) return -1;
    const up = name.toUpperCase(); const hit = SP_MAP.find(([k]) => up.startsWith(k)); if (!hit) return -1;
    let i = h.moves.findIndex(m => m[0].startsWith(hit[1]));
    const FILE = { 'Spécial neutre': /NSpecial|NeutralSpecial/, 'Spécial côté': /SSpecial|SideSpecial/, 'Spécial haut': /USpecial|UpSpecial/, 'Spécial bas': /DSpecial|DownSpecial/ };
    if (i < 0 && FILE[hit[1]]) i = h.moves.findIndex(m => FILE[hit[1]].test(decodeURIComponent(m[2])));
    return i;
  }
  function spSection(id, open) {
    const p = SP.perso[id]; if (!p) return '';
    const coup = c => { const i = spMove(id, c); return i >= 0 ? `<button class="chip sm" data-act="hb" data-id="${esc(id)}" data-i="${i}">${esc(c)}</button>` : `<span class="chip sm">${esc(c)}</span>`; };
    return `<details class="sec moves sp" ${open ? 'open' : ''}><summary><h2>Profil SmashPro.tips</h2></summary>
      <div class="sp-cols"><div><h4>Points forts</h4><ul class="small">${p.forts.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
        <div><h4>Points faibles</h4><ul class="small">${p.faibles.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div></div>
      ${p.coups.length ? `<h4>Ses meilleurs coups <small class="muted">(touche pour voir la hitbox)</small></h4><div class="chips hb-chips">${p.coups.map(coup).join('')}</div>` : ''}
      <div class="hb-view" data-hb-view></div>
      ${p.opts.length ? `<h4>Ses options rapides, sûres sur bouclier et hors bouclier</h4><p class="small">${p.opts.map(esc).join(' · ')}</p>` : ''}
      <p class="src">Source : <a href="${SP.base + esc(p.slug)}/" target="_blank" rel="noopener">SmashPro.tips — fiche complète ↗</a> (${esc(SP.credit)}) · hitbox : SmashWiki</p></details>`;
  }
  const permTag = p => `<span class="perm p-${esc(p)}">${T('perm_' + p)}</span>`;

  /* ---------- Médias / carousel ---------- */
  function mediaSlide(m) {
    let body = '';
    switch (m.type) {
      case 'schema': body = `<div class="schema">${PMSchemas.render(m.schema)}</div>`; break;
      case 'youtube': body = `<button class="yt" data-act="yt" data-vid="${esc(m.video_id)}" data-start="${parseTs(m.timestamp) || m.start || 0}" data-lien="${esc(m.lien)}">
          <img class="yt-thumb" alt="" loading="lazy" referrerpolicy="no-referrer" src="https://i.ytimg.com/vi/${encodeURIComponent(m.video_id)}/hqdefault.jpg" onerror="this.remove()">
          <span class="yt-play" aria-hidden="true">▶</span><span class="yt-label">${navigator.onLine ? T('media_online') : T('media_offline')}${m.timestamp ? ' · à ' + esc(m.timestamp) : ''}</span></button>`; break;
      case 'gif': body = `<div class="gif-box"><img class="gif" alt="${esc(m.titre)}" decoding="async" referrerpolicy="no-referrer" data-gif="${esc(m.url)}"><span class="gif-msg">🖼 Image indisponible ici (hors-ligne ou bloquée). Elle se charge depuis ${esc((m.source || '').split(' ')[0] || 'sa source')} dès que tu as du réseau.</span></div>`; break;
      case 'local': body = `<div class="local" data-local="${esc(m.blob_id)}"><span>🔒 ${T('media_locked')}</span></div>`; break;
      default: body = `<a class="search-card" href="${esc(m.lien)}" target="_blank" rel="noopener"><span aria-hidden="true">🔎</span><b>${esc(m.titre)}</b><small>Emplacement — lie un clip réel dans Admin</small></a>`;
    }
    return `<figure class="slide">${body}<figcaption>
      <b>${esc(m.titre)}</b>
      <span class="meta">${esc(m.source)}${m.auteur ? ' · ' + esc(m.auteur) : ''}${m.timestamp ? ' · ⏱ ' + esc(m.timestamp) : ''}</span>
      <span class="tags">${permTag(m.permission || 'lien_seulement')}${m.statut === 'a_verifier' ? `<span class="perm p-check">${T('to_check')}</span>` : ''}
      ${m.lien ? `<a href="${esc(m.lien)}" target="_blank" rel="noopener">${T('open_link')} ↗</a>` : ''}</span></figcaption></figure>`;
  }
  function carousel(medias) {
    if (!medias.length) return '';
    return `<div class="car" data-car>
      <div class="car-track" tabindex="0" aria-label="Médias">${medias.map(mediaSlide).join('')}</div>
      ${medias.length > 1 ? `<div class="car-ctl"><button class="icon-btn" data-act="car-prev" aria-label="Précédent">‹</button>
        <div class="car-dots">${medias.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>
        <button class="icon-btn" data-act="car-next" aria-label="Suivant">›</button></div>` : ''}</div>`;
  }
  function hydrateMedia(root) {
    $$('[data-car] .car-track', root).forEach(track => {
      const dots = $$('.car-dots i', track.parentElement);
      track.addEventListener('scroll', () => {
        const i = Math.round(track.scrollLeft / track.clientWidth);
        dots.forEach((d, k) => d.classList.toggle('on', k === i));
      }, { passive: true });
    });
    $$('img[data-cache-src]', root).forEach(async img => {
      try { const u = await S.MediaCache.url(img.dataset.cacheSrc); if (u) img.src = u; } catch (e) { }
    });
    $$('[data-local]', root).forEach(async el => {
      try {
        if (!S.Vault.isUnlocked()) return;
        const rec = (await S.Vault.list()).find(x => x.id === el.dataset.local);
        const u = await S.Vault.url(el.dataset.local);
        if (!u) return;
        el.innerHTML = rec && rec.mime.startsWith('video/') ? `<video src="${u}" controls loop muted playsinline></video>` : `<img src="${u}" alt="">`;
      } catch (e) { }
    });
  }

  /* ---------- Galerie de coups (GIFs de hitbox SmashWiki) ---------- */
  const HB = BASE.hitboxes || { perso: {} };
  const HB_CAT = [['sol', 'Au sol'], ['smash', 'Smash'], ['air', 'Aériens'], ['special', 'Spéciaux'], ['throw', 'Saisies et projections']];
  function movesSection(id, open, title) {
    const h = HB.perso[id]; if (!h) return '';
    return `<details class="sec moves" ${open ? 'open' : ''}><summary><h2>${esc(title || 'Coups en images')} <small>(${h.moves.length})</small></h2></summary>
      <div class="hb-view" data-hb-view><p class="muted">Touche un coup pour voir son GIF de hitbox (image réelle du jeu, zones de frappe en couleur).</p></div>
      ${HB_CAT.map(([c, lab]) => { const ms = h.moves.map((m, i) => [m, i]).filter(([m]) => m[1] === c); return ms.length ? `<h4>${lab}</h4><div class="chips hb-chips">${ms.map(([m, i]) => `<button class="chip sm" data-act="hb" data-id="${esc(id)}" data-i="${i}">${esc(m[0])}</button>`).join('')}</div>` : ''; }).join('')}
      <p class="src">Source : <a href="${esc(h.page)}" target="_blank" rel="noopener">SmashWiki</a> · ${esc(HB.credit)} · affiché par lien, jamais copié.</p></details>`;
  }
  function showMove(btn) {
    const h = HB.perso[btn.dataset.id]; const m = h && h.moves[+btn.dataset.i]; if (!m) return;
    const scope = btn.closest('.moves') || app;
    const box = $('[data-hb-view]', scope);
    $$('[data-act="hb"]', scope).forEach(c => c.classList.toggle('on', c === btn));
    box.innerHTML = `<figure class="slide hb-slide">${mediaSlide({ type: 'gif', url: HB.base + m[2], titre: m[0], source: 'SmashWiki (hitbox)', auteur: HB.credit, lien: h.page, permission: 'lien_seulement', statut: 'verifie' }).replace(/^<figure class="slide">|<\/figure>$/g, '')}</figure>`;
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* ---------- Écran : accueil ---------- */
  function muRow(m) {
    return `<a class="mu mu-h" href="#/vs/${m.id}">${head(m.id, 40)}<span class="pill sm ${dClass(m.difficulte)}">${m.difficulte}</span>
      <span class="mu-name">${esc(m.nom)}${spTag(m.id)}</span>
      <small>${esc(m.justification)}</small></a>`;
  }
  const SP_BOWSER = { littlemac: ['fav', 'Favorable'], dk: ['fav', 'Favorable'], krool: ['fav', 'Favorable'], hero: ['fav', 'Favorable (dur à approcher)'],
    pikachu: ['def', 'Défavorable'], greninja: ['def', 'Défavorable'], ness: ['def', 'Défavorable (taille et combos)'], younglink: ['def', 'Défavorable (taille et combos)'],
    samus: ['def', 'Défavorable (taille et combos)'], palutena: ['def', 'Défavorable (zoneur)'], roy: ['def', 'Défavorable (zoneur)'], peach: ['def', 'Défavorable (zoneur)'] };
  const spTag = id => SP_BOWSER[id] ? `<em class="sp-tag sp-${SP_BOWSER[id][0]}" title="Avis SmashPro.tips pour Bowser : ${esc(SP_BOWSER[id][1])}">SP</em>` : '';
  function search(q) {
    const n = norm(q);
    if (!n) return DATA.matchups;
    return DATA.matchups.filter(m => [m.nom, m.id, ...(m.alias || [])].some(x => norm(x).includes(n)));
  }
  function viewHome() {
    const last = prefs.recents[0] && DATA.byId[prefs.recents[0]];
    const chips = ids => ids.map(id => DATA.byId[id]).filter(Boolean).map(m => `<a class="chip chip-h ${dClass(m.difficulte)}" href="#/vs/${m.id}">${head(m.id, 24)}${esc(m.nom)}</a>`).join('');
    return `${top()}
      <main class="home">
        <a class="prematch" href="${last ? '#/vs/' + last.id : '#/'}" data-act="${last ? '' : 'focus-search'}">
          ${last ? head(last.id, 40) : '<img class="pm-bolt" src="icons/nav-bolt.png" alt="" width="40" height="40">'}<span>${last ? T('prematch_last', { name: esc(last.nom) }) : T('prematch_none')}</span></a>
        <nav class="tiles" aria-label="Sections">
          ${[['#/routine', 'drills', 'Routine 10 min'], ['#/journal', 'journal', 'Journal'], ['#/flash', 'revision', 'Révision'], ['#/frames', 'framedata', 'Frame data'], ['#/kill', 'kill', '% de kill'], ['#/guide', 'fiches', 'Guide ' + mainNom()]]
            .map(([h, ic, l]) => `<a class="tile" href="${h}"><img src="icons/section-${ic}.png" alt="" width="56" height="56">${l}</a>`).join('')}
        </nav>
        ${journalBanner()}
        <label class="search"><span class="sr">${T('search')}</span>
          <input id="q" type="search" autocomplete="off" enterkeyhint="go" placeholder="${T('search')}"></label>
        ${prefs.favs.length ? `<h2>${T('favorites')}</h2><div class="chips">${chips(prefs.favs)}</div>` : ''}
        ${prefs.recents.length > 1 ? `<h2>${T('recents')}</h2><div class="chips">${chips(prefs.recents.slice(1, 7))}</div>` : ''}
        <h2 id="list-title">${T('all')}</h2>
        <div id="list" class="list">${DATA.matchups.map(muRow).join('')}</div>
        <p class="hint">${T('install_hint')}</p>
      </main>${nav('home')}`;
  }
  function afterHome() {
    const q = $('#q');
    q.addEventListener('input', () => {
      const r = search(q.value);
      $('#list').innerHTML = r.length ? r.map(muRow).join('') : `<p class="empty">${T('no_result')}</p>`;
    });
    q.addEventListener('keydown', e => { if (e.key === 'Enter') { const r = search(q.value); if (r[0]) location.hash = '#/vs/' + r[0].id; } });
    if (matchMedia('(pointer:fine)').matches) q.focus();
  }

  /* ---------- Écran : fiche matchup ---------- */
  function comboBody(f, c, full) {
    const ref = c.ref_poppt;
    return `<div class="combo-body">
      <div class="inputs ${prefs.notation === 'gc' ? 'gc-mode' : ''}" aria-label="${T('inputs')}">${(c.inputs || []).map(gcInput).join('<span class="arr">→</span>')}</div>
      <dl class="cond">
        <div><dt>%</dt><dd>${esc(c.conditions && c.conditions.pourcent)}</dd></div>
        <div><dt>${T('pos')}</dt><dd>${esc(c.conditions && c.conditions.position)}</dd></div>
        <div><dt>${T('di')}</dt><dd>${esc(c.conditions && c.conditions.di)}</dd></div>
      </dl>
      <div class="counter"><h4>🛡 ${T('counters')}${mainId() !== 'bowser' ? ' (Bowser)' : ''}</h4><ul>${(c.contre_mesures || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
      ${(c.variantes || []).length ? `<h4>${T('variants')}</h4><ul class="small">${c.variantes.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${full ? carousel((c.medias || []).map(id => (f.medias || []).find(m => m.id === id)).filter(Boolean)) : ''}
      ${ref ? `<div class="poppt"><b>📺 ${T('poppt_ref')}</b>
          ${ref.video_url ? `<a href="${esc(ref.video_url)}" target="_blank" rel="noopener">${esc(ref.titre || 'vidéo')}${ref.timestamp ? ' à ' + esc(ref.timestamp) : ''} ↗</a>` : `<span class="perm p-check">${T('to_link')}</span>`}
          ${ref.note ? `<small>${esc(ref.note)}</small>` : ''}
          <a class="btn sm" href="#/import-poppt?vs=${f.id}&combo=${c.id}">＋ ${T('poppt_import')}</a></div>` : ''}
      ${(c.sources || []).filter(s => s.titre).length ? `<p class="src">${T('sources')} : ${c.sources.filter(s => s.titre).map(s => s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.titre)}</a>` : esc(s.titre)).join(' · ')}</p>` : ''}
      ${full ? '' : `<a class="more" href="#/combo/${f.id}/${c.id}">${T('detail')} ›</a>`}
    </div>`;
  }
  function viewFiche(id) {
    const m = DATA.byId[id];
    if (!m) return viewNotFound();
    prefs.recents = [id, ...prefs.recents.filter(x => x !== id)].slice(0, 12); savePrefs();
    const f = DATA.fiches[id];
    const fav = prefs.favs.includes(id);
    const favBtn = `<button class="icon-btn ${fav ? 'fav' : ''}" data-act="fav" data-id="${id}" aria-pressed="${fav}" aria-label="Favori">${fav ? '★' : '☆'}</button>`;
    if (!f) {
      return `${top(m.nom, '#/', favBtn, id)}<main class="fiche">${meter(m.difficulte)}
        <p class="lead">${esc(m.justification)}</p><p class="muted">${T('stub')}</p>
        <a class="btn" href="#/admin/${id}">✎ ${T('stub_create')}</a>
        <details class="sec combat" open><summary><h2>Combat : ${esc(mainNom())} contre ${esc(m.nom)}</h2></summary><div data-combat="fiche" data-id="${id}"><p class="muted">Calcul…</p></div></details>
        ${spSection(id, true)}${movesSection(id, true, id === 'bowser' ? 'Coups de Bowser en images' : 'Ses coups en images')}</main>${nav('')}`;
    }
    const combos = f.combos || [];
    return `${top(f.nom, '#/', favBtn, id)}
      <main class="fiche">${mainId() !== 'bowser' ? `<p class="sp-line">Contre-mesures et conseils écrits pour Bowser. La section « Combat » est calculée pour <b>${esc(mainNom())}</b>.</p>` : ''}${SP_BOWSER[id] && mainId() === 'bowser' ? `<p class="sp-line sp-${SP_BOWSER[id][0]}">SmashPro.tips classe ce matchup pour Bowser : <b>${esc(SP_BOWSER[id][1])}</b></p>` : ''}
        <div class="fiche-head">${meter(f.difficulte)}<button class="btn quick" data-act="quick">💡 ${T('quick')}</button></div>
        ${recordLine(id)}
        <section><h2>${T('win')}</h2><ul class="win">${(f.win_conditions || []).slice(0, 4).map(x => `<li>${esc(x)}</li>`).join('')}</ul></section>
        ${carousel(f.medias || [])}
        <details class="sec" data-sec="combos" ${prefs.combosOpen ? 'open' : ''}><summary><h2>${T('combos')} <small>(${combos.length})</small></h2></summary>
          ${combos.map(c => `<details class="combo"><summary><span class="ct">${esc(c.titre)}</span>${goalTag(c.but)}<span class="cp">${esc((c.conditions && c.conditions.pourcent || '').split('(')[0])}</span></summary>${comboBody(f, c, false)}</details>`).join('')}
        </details>
        <details class="sec combat" open><summary><h2>Combat : ${esc(mainNom())} contre ${esc(f.nom)}</h2></summary><div data-combat="fiche" data-id="${id}"><p class="muted">Calcul…</p></div></details>
        ${(f.setups || []).length ? `<details class="sec"><summary><h2>${T('setups')}</h2></summary>${f.setups.map(s => `<div class="setup"><b>${esc(s.titre)}</b><p><span class="lbl">${T('reco')}</span> ${esc(s.reconnaitre)}</p><p><span class="lbl ok">${T('answer')}</span> ${esc(s.reponse)}</p></div>`).join('')}</details>` : ''}
        ${spSection(id, false)}
        ${movesSection(id, false, 'Tous ses coups en images')}
        <section><h2>${T('tips')}</h2><ol class="tips">${(f.conseils_bowser || []).map(x => `<li>${esc(x)}</li>`).join('')}</ol></section>
        ${f.stage ? `<p class="stage">🗺 <b>Stage à proposer :</b> ${esc(f.stage)}</p>` : ''}
        ${planSection(id)}
        <p class="row wrap"><button class="btn ghost sm" data-act="dl" data-set="one" data-id="${id}">📥 Rendre cette fiche dispo hors-ligne</button><span class="muted small" data-dl-prog></span></p>
        <p class="src muted">Cote : ${esc(m.source_cote)} (${esc(m.cote)}) · ${DATA.edited.has(id) ? 'éditée localement' : 'contenu d’origine ' + esc(BASE.fiches.version)}</p>
      </main>
      <div class="overlay" id="quick" hidden role="dialog" aria-modal="true" aria-label="${T('quick')}">
        <div class="overlay-card"><p class="big">${esc(f.conseil_rapide)}</p>${planOverlay(id)}
          <ol>${(f.conseils_bowser || []).map(x => `<li>${esc(x)}</li>`).join('')}</ol>
          <button class="btn" data-act="quick-close">${T('close')}</button></div></div>
      ${nav('')}`;
  }
  function afterFiche() {
    fillCombat();
    hydrateMedia(app); fillPlan();
    const sec = $('details[data-sec="combos"]');
    if (sec) sec.addEventListener('toggle', () => { prefs.combosOpen = sec.open; savePrefs(); });
    wakeOn();
  }
  function viewCombo(fid, cid) {
    const f = DATA.fiches[fid]; const c = f && (f.combos || []).find(x => x.id === cid);
    if (!c) return viewNotFound();
    return `${top(c.titre, '#/vs/' + fid)}<main class="fiche"><p class="muted">${esc(f.nom)} · ${goalTag(c.but)}</p>${comboBody(f, c, true)}</main>${nav('')}`;
  }
  const viewNotFound = () => `${top('—', '#/')}<main><p class="empty">${T('no_result')}</p></main>${nav('')}`;

  /* ---------- Journal de matchs ---------- */
  const CAUSES = [
    ['grab', 'Grabs ratés ou punis', 'drill-grab'], ['recovery', 'Récupération / retour sur scène', 'drill-recovery-mix'],
    ['jongle', 'Jongles / désavantage', 'poppt-zackray'], ['edgeguard', 'Edgeguard subi', 'drill-recovery'],
    ['zoning', 'Zoning / projectiles', 'poppt-projectiles'], ['bouclier', 'Pression sur mon bouclier', 'drill-oos'],
    ['lecture', 'Mauvaises lectures / options répétées', 'poppt-bait'], ['kill', 'Kill raté ou trop tard', 'drill-edgeguard'],
    ['mental', 'Nerfs / tilt', 'poppt-plan']];
  let JOURNAL = [];
  async function loadJournal() { try { JOURNAL = (await S.get('kv', 'journal')) || []; } catch (e) { JOURNAL = []; } }
  const saveJournal = () => S.put('kv', 'journal', JOURNAL);
  function recordOf(id) { const ms = JOURNAL.filter(j => j.vs === id); return { v: ms.filter(j => j.res === 'V').length, d: ms.filter(j => j.res === 'D').length }; }
  function recordLine(id) {
    const r = recordOf(id); const n = r.v + r.d;
    return `<p class="record">${n ? `Ton bilan : <b class="win-c">${r.v} V</b> – <b class="loss-c">${r.d} D</b> (${Math.round(100 * r.v / n)} %)` : 'Aucun match noté contre lui.'} <a href="#/journal?vs=${id}">＋ Noter un match</a></p>`;
  }
  function topCauses(list) {
    const c = {}; list.filter(j => j.res === 'D').forEach(j => (j.causes || []).forEach(k => { c[k] = (c[k] || 0) + 1; }));
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  }
  function journalBanner() {
    if (!JOURNAL.length) return `<a class="mine" href="#/journal">✍ Note tes matchs : l'app te dira quoi travailler en priorité.</a>`;
    const tc = topCauses(JOURNAL.slice(0, 30))[0]; const cause = tc && CAUSES.find(c => c[0] === tc[0]);
    return cause ? `<a class="mine" href="#/drill/${cause[2]}">🎯 À travailler en priorité : <b>${esc(cause[1])}</b> (${tc[1]} défaite${tc[1] > 1 ? 's' : ''} récente${tc[1] > 1 ? 's' : ''}) → drill</a>` : '';
  }
  function viewJournal(params) {
    const vs = params.get('vs') || prefs.recents[0] || '';
    const tot = { v: JOURNAL.filter(j => j.res === 'V').length, d: JOURNAL.filter(j => j.res === 'D').length };
    const per = {}; JOURNAL.forEach(j => { per[j.vs] = per[j.vs] || { v: 0, d: 0 }; per[j.vs][j.res === 'V' ? 'v' : 'd']++; });
    const rows = Object.entries(per).sort((a, b) => (b[1].v + b[1].d) - (a[1].v + a[1].d));
    const tc = topCauses(JOURNAL);
    const maxC = tc.length ? tc[0][1] : 1;
    return `${top('Journal de matchs', '')}<main class="journal">
      <form id="j-form" class="form">
        <div class="grid2"><label>Adversaire<select name="vs">${DATA.matchups.map(m => `<option value="${m.id}" ${m.id === vs ? 'selected' : ''}>${esc(m.nom)}</option>`).join('')}</select></label>
          <label>Stage<select name="stage">${['', 'Battlefield', 'Small Battlefield', 'Final Destination', 'Pokémon Stadium 2', 'Smashville', 'Town and City', 'Hollow Bastion', 'Kalos', 'Autre'].map(x => `<option>${x}</option>`).join('')}</select></label></div>
        <div class="seg" role="radiogroup" aria-label="Résultat"><label><input type="radio" name="res" value="V" required> Victoire</label><label><input type="radio" name="res" value="D"> Défaite</label></div>
        <fieldset><legend>Qu'est-ce qui a coûté des stocks ?</legend><div class="chips">${CAUSES.map(([k, l]) => `<label class="chip sm check-chip"><input type="checkbox" name="causes" value="${k}"> ${esc(l)}</label>`).join('')}</div></fieldset>
        <label>Note (ce que tu feras différemment)<textarea name="note" rows="2" placeholder="ex. arrêter le side-B au centre, il le lisait"></textarea></label>
        <button class="btn" type="submit">Enregistrer le match</button>
      </form>
      <h2>Bilan</h2>
      ${JOURNAL.length ? `<p class="big-stat"><b class="win-c">${tot.v} V</b> – <b class="loss-c">${tot.d} D</b> · ${Math.round(100 * tot.v / (tot.v + tot.d))} % de victoires sur ${JOURNAL.length} matchs</p>
        ${tc.length ? `<h2>Ce qui te coûte le plus de défaites</h2><div class="bars">${tc.map(([k, n]) => { const c = CAUSES.find(x => x[0] === k); return `<a class="bar" href="#/drill/${c[2]}"><span class="bar-l">${esc(c[1])}</span><span class="bar-t"><i style="width:${Math.round(100 * n / maxC)}%"></i></span><span class="bar-n">${n}</span></a>`; }).join('')}</div><p class="muted">Touche une cause pour ouvrir le drill correspondant.</p>` : ''}
        <h2>Par adversaire</h2><div class="list">${rows.map(([id, r]) => { const m = DATA.byId[id] || { nom: id, difficulte: 5 }; const n = r.v + r.d; return `<a class="mu mu-h" href="#/vs/${id}">${head(id, 40)}<span class="pill sm ${dClass(m.difficulte)}">${Math.round(100 * r.v / n)}%</span><span class="mu-name">${esc(m.nom)}</span><small>${r.v} V – ${r.d} D</small></a>`; }).join('')}</div>
        <h2>Derniers matchs</h2><div class="list">${JOURNAL.slice(0, 15).map((j, i) => { const m = DATA.byId[j.vs] || { nom: j.vs }; return `<div class="jrow"><b class="${j.res === 'V' ? 'win-c' : 'loss-c'}">${j.res}</b>${head(j.vs, 24)} ${esc(m.nom)}${j.stage ? ' · ' + esc(j.stage) : ''} <small>${new Date(j.at).toLocaleDateString('fr-CH')}${(j.causes || []).length ? ' · ' + j.causes.map(k => (CAUSES.find(c => c[0] === k) || [])[1]).filter(Boolean).map(esc).join(', ') : ''}${j.note ? ' · « ' + esc(j.note) + ' »' : ''}</small><button class="icon-btn sm" data-act="j-del" data-i="${i}" aria-label="Supprimer">×</button></div>`; }).join('')}</div>`
        : '<p class="muted">Aucun match pour l’instant. Note chaque set : après une dizaine de matchs, l’app te montre tes vraies faiblesses et le drill qui va avec.</p>'}
    </main>${nav('journal')}`;
  }
  async function submitJournal(form) {
    const fd = new FormData(form);
    JOURNAL.unshift({ id: uid('m'), at: Date.now(), vs: fd.get('vs'), res: fd.get('res'), stage: fd.get('stage'), causes: fd.getAll('causes'), note: (fd.get('note') || '').trim() });
    await saveJournal(); toast('Match enregistré'); route();
  }

  /* ---------- Plan de jeu par matchup (Poppt : How to Create a Game Plan) ---------- */
  const PLANS = {};
  function planSection(id) {
    return `<details class="sec" data-sec="plan"><summary><h2>Mon plan de jeu</h2></summary>
      <form class="form plan" data-plan="${id}">
        <label>Mon objectif en neutre<input name="neutre" placeholder="ex. tenir le centre, ftilt sur ses approches"></label>
        <label>Ma punition principale<input name="punition" placeholder="ex. up-B hors bouclier sur ses aériens"></label>
        <label>Le piège à éviter<input name="piege" placeholder="ex. ne pas sauter dans son up-air"></label>
        <button class="btn sm" type="submit">Enregistrer le plan</button>
        <p class="muted">Méthode : <a href="https://www.youtube.com/watch?v=ij6H8XQ5Me8" target="_blank" rel="noopener">Poppt — How to Create a Game Plan ↗</a>. Le plan s'affiche aussi dans « Conseil rapide ».</p>
      </form></details>`;
  }
  function planOverlay(id) { return `<div class="plan-ov" data-plan-ov="${id}"></div>`; }
  async function fillPlan() {
    const form = $('form[data-plan]'); if (!form) return;
    const id = form.dataset.plan; let p = null; try { p = await S.get('kv', 'plan:' + id); } catch (e) { }
    PLANS[id] = p;
    if (p) { ['neutre', 'punition', 'piege'].forEach(k => { form.elements[k].value = p[k] || ''; }); }
    const ov = $('[data-plan-ov]');
    if (ov && p && (p.neutre || p.punition || p.piege)) ov.innerHTML = `<div class="plan-box"><b>Mon plan</b><ul>${p.neutre ? `<li>Neutre : ${esc(p.neutre)}</li>` : ''}${p.punition ? `<li>Punition : ${esc(p.punition)}</li>` : ''}${p.piege ? `<li>Éviter : ${esc(p.piege)}</li>` : ''}</ul></div>`;
  }

  /* ---------- Frame data Bowser (Ultimate Frame Data, relevé le 2026-11-05) ---------- */
  const FRAMES = {
    source: 'https://ultimateframedata.com/bowser',
    stats: [['Poids', '135 (le plus lourd du jeu)'], ['Vitesse de course', '1,971'], ['Vitesse aérienne', '1,155'], ['Chute / chute rapide', '1,77 / 2,832'], ['Saut court / complet (frames)', '31 / 45']],
    oos: [['Up-B (Whirling Fortress)', 6], ['Side-B en l’air (Flying Slam)', 9], ['Nair', 11], ['Grab hors bouclier', 12], ['Lâcher le bouclier (shield drop)', 11]],
    moves: [ // [coup, démarrage, total, atterrissage, dégâts, sur bouclier]
      ['Jab 1', '7', '25', '—', '4', '-13'], ['Ftilt', '10', '37', '—', '13', '-15'], ['Up-tilt', '11', '40', '—', '11', '-19'], ['Dtilt', '10/15', '45', '—', '7/8', '-22'],
      ['Attaque en course', '11', '55', '—', '12/10', '-33'], ['Side-smash', '22', '69', '—', '23/20 (17/14)', '-32'], ['Up-smash', '16', '57', '—', '22/16/12', '-27'], ['Down-smash', '12', '72', '—', '16/15', '-49'],
      ['Nair', '8', '47', '15', '6', '-12'], ['Fair', '11', '41', '14', '13/12/11', '-9'], ['Bair', '9', '44', '24', '19', '-17'], ['Up-air', '9', '44', '17', '15', '-12'], ['Dair', '17', '77', '34', '16', '-30'],
      ['Side-B (Flying Slam)', '6', '52', '—', 'saisie', '—'], ['Up-B au sol', '6', '81', '18', '1 / 6', '-36'], ['Down-B (Bowser Bomb)', '11', '66', '—', '20/11', '—'],
      ['Grab', '8', '40', '—', '—', '—'], ['Grab en course', '11', '48', '—', '—', '—'], ['Grab pivot', '12', '43', '—', '—', '—'],
      ['Back throw', '—', '38', '—', '12', '—'], ['Forward throw', '—', '58', '—', '12', '—'], ['Up-throw', '—', '74', '—', '~10', '—'], ['Down-throw', '—', '84', '—', '14', '—']]
  };
  function viewKill(params) {
    const atk = params.get('atk') || mainId(), tgt = params.get('vs') || prefs.recents[0] || 'mario';
    const opt = (n, v) => `<option value="${n}" ${n === v ? 'selected' : ''}>${esc((DATA.byId[n] || { nom: n }).nom.replace(' (miroir)', ''))}</option>`;
    return `${top('Calculateur de % de kill', '')}<main class="killcalc form">
      <div class="grid2"><label>Attaquant<select id="k-atk">${DATA.matchups.map(m => opt(m.id, atk)).join('')}</select></label>
        <label>Cible<select id="k-tgt">${DATA.matchups.map(m => opt(m.id, tgt)).join('')}</select></label></div>
      <div class="grid2"><label>Stage<select id="k-stage">${['Battlefield', 'Small Battlefield', 'Final Destination', 'Pokémon Stadium 2', 'Smashville', 'Town & City', 'Hollow Bastion', 'Kalos Pokémon League'].map(x => `<option>${x}</option>`).join('')}</select></label>
        <label>Position de la cible<select id="k-pos"><option value="centre">Centre</option><option value="bord">Au bord</option></select></label></div>
      <div class="grid2"><label>% de l’attaquant (rage) <output id="k-rv">0</output><input type="range" id="k-rage" min="0" max="150" value="0"></label>
        <label class="inline"><input type="checkbox" id="k-di" checked> DI de survie</label></div>
      <div id="k-out"><p class="muted">Calcul…</p></div>
      <p class="muted">Méthode : formule d’éjection d’Ultimate (bonus 1 contre 1), sakurai au sol, décroissance de 0,051/frame, gravité et vitesse de chute de la cible, zones de mort du stage. Pas de coups usés ni de multi-hits enchaînés : prends ±5 % de marge.</p>
      <p class="src">Données : rubendal/SSBU-Calculator (MIT), Ultimate Frame Data.</p>
    </main>${nav('')}`;
  }
  async function afterKill() {
    const out = $('#k-out');
    if (!(await loadCombat())) { out.innerHTML = '<p class="muted">Données indisponibles hors-ligne.</p>'; return; }
    const calc = () => {
      const atk = $('#k-atk').value, tgt = $('#k-tgt').value, stage = $('#k-stage').value, pos = $('#k-pos').value, di = $('#k-di').checked;
      const ragePct = +$('#k-rage').value; $('#k-rv').textContent = ragePct + ' %';
      const rage = 1 + Math.min(Math.max(ragePct - 35, 0), 115) / 115 * 0.1;
      const rows = PMCombat.killTable(atk, tgt, { stage, pos, di, rage }, 30);
      out.innerHTML = rows.length ? `<div class="table-wrap"><table class="ko"><thead><tr><th>Coup</th><th>Sort</th><th>Dégâts</th><th>Tue dès</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(mvFr(r.name))}</td><td>${r.startup > 1 ? 'f' + r.startup : '—'}</td><td>${r.dmg}</td><td><b>${r.ko} %</b></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Aucune donnée d’éjection pour cet attaquant (Kazuya et Sora ne sont pas couverts par la source).</p>';
    };
    $$('.killcalc select, .killcalc input').forEach(el => el.addEventListener('input', calc));
    calc();
  }
  function viewFramesGeneric() {
    return `${top('Frame data : ' + mainNom(), '')}<main class="frames"><div data-frames="${mainId()}"><p class="muted">Chargement…</p></div>${movesSection(mainId(), false, 'Hitbox de tes coups (SmashWiki)')}</main>${nav('')}`;
  }
  async function fillFrames() {
    const box = $('[data-frames]'); if (!box || !(await loadCombat())) return;
    const id = box.dataset.frames, u = self.PREMATCH_COMBAT.ufd[id];
    if (!u) { box.innerHTML = '<p class="muted">Pas de frame data pour ce perso.</p>'; return; }
    box.innerHTML = `<div class="explain"><b>Comment s’en servir</b><p>Ton option hors bouclier la plus rapide fixe ce que tu peux punir : un coup adverse à −N ou pire sur ton bouclier (N = frames de l’option) est punissable. Chaque fiche adverse fait le calcul pour toi.</p></div>
      <h2>Tes options hors bouclier</h2><div class="oos">${PMCombat.oosOptions(id).map(o => `<div class="oos-i"><span class="oos-f">${o.frames}</span><span>${esc(mvFr(o.name))}</span></div>`).join('')}</div>
      <h2>Tes coups</h2><div class="table-wrap"><table><thead><tr><th>Coup</th><th>Démarrage</th><th>Total</th><th>Actif</th><th>Sur bouclier</th></tr></thead><tbody>${u.moves.map(([n, st, adv, tot, act]) => { const a = parseInt(adv, 10); return `<tr><td>${esc(mvFr(n))}</td><td>${esc(st)}</td><td>${esc(tot)}</td><td>${esc(act)}</td><td class="${isNaN(a) ? '' : a <= -15 ? 'unsafe' : a <= -6 ? 'meh' : ''}">${esc(adv)}</td></tr>`; }).join('')}</tbody></table></div>
      <p class="src">Source : Ultimate Frame Data.</p>`;
  }
  function viewGuideGeneric() {
    const id = mainId();
    return `${top('Guide ' + mainNom(), '', '', id)}<main class="guide">
      <div class="guide-head">${head(id, 64)}<div><h1>${esc(mainNom())}</h1><p class="muted">Profil SmashPro.tips, options hors bouclier et % de kill de référence.</p></div></div>
      ${spSection(id, true)}
      <h2>Tes % de kill sur Mario (référence, Battlefield)</h2><div data-guidekill="${id}"><p class="muted">Calcul…</p></div>
      <h2>Ta manette GameCube</h2><div class="gc-ref">${K('A')} Attaque · ${K('B')} Spécial · ${K('X')}/${K('Y')} Saut · ${K('Z')} Saisie · ${K('R')}/${K('L')} Bouclier · ${CS('')} Smash</div>
      <p><a class="btn ghost" href="#/frames">Frame data</a> <a class="btn ghost" href="#/kill">Calculateur de kill</a> <a class="btn ghost" href="#/vs/${id}">Toutes tes hitbox</a></p>
    </main>${nav('')}`;
  }
  async function fillGuideKill() {
    const b = $('[data-guidekill]'); if (!b || !(await loadCombat())) return;
    b.innerHTML = koTable(koRows(b.dataset.guidekill, 'mario', 'Battlefield', 8));
  }
  function viewFrames() {
    return `${top('Frame data : Bowser', '')}<main class="frames">
      <div class="explain"><b>Comment s'en servir</b><p>Un coup adverse qui laisse l'adversaire à <b>−6 ou pire</b> sur ton bouclier est punissable par ton <b>up-B hors bouclier (6 frames)</b>. À −12 ou pire, ton grab hors bouclier passe aussi. Ton up-B est l'une des meilleures options hors bouclier du jeu : c'est ta punition par défaut.</p></div>
      <h2>Tes options hors bouclier</h2><div class="oos">${FRAMES.oos.map(([n, f]) => `<div class="oos-i"><span class="oos-f">${f}</span><span>${esc(n)}</span></div>`).join('')}</div>
      <h2>Tes coups</h2><div class="table-wrap"><table><thead><tr><th>Coup</th><th>Démarrage</th><th>Total</th><th>Atterr.</th><th>Dégâts</th><th>Sur bouclier</th></tr></thead>
        <tbody>${FRAMES.moves.map(r => `<tr>${r.map((c, i) => `<td class="${i === 5 && /^-/.test(c) ? (parseInt(c, 10) <= -15 ? 'unsafe' : 'meh') : ''}">${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <p class="muted">« Sur bouclier » = ton avantage quand le coup touche le bouclier adverse. Rouge = très punissable : ne le lance pas collé à un bouclier. Le fair (−9) et le nair (−12) espacés sont tes options les plus sûres.</p>
      <h2>Caractéristiques</h2><dl class="stats">${FRAMES.stats.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      <p class="src">Source : <a href="${FRAMES.source}" target="_blank" rel="noopener">Ultimate Frame Data — Bowser</a></p>
      ${movesSection('bowser', false, 'Hitbox de tes coups (SmashWiki)')}
    </main>${nav('')}`;
  }

  /* ---------- Hors-ligne : images SmashWiki / YouTube dans Cache Storage (servies par le service worker) ---------- */
  function mediaUrls(set, id) {
    const HBx = BASE.hitboxes || { perso: {} }, urls = new Set();
    const gal = cid => ((HBx.perso[cid] || {}).moves || []).forEach(m => urls.add(HBx.base + m[2]));
    const fiche = cid => ((DATA.fiches[cid] || {}).medias || []).forEach(m => { if (m.type === 'gif') urls.add(m.url); if (m.type === 'youtube') urls.add(`https://i.ytimg.com/vi/${m.video_id}/hqdefault.jpg`); });
    if (set === 'heads') Object.values(HEADS.perso).forEach(p => urls.add(HEADS.base + p));
    if (set === 'main') gal(mainId());
    if (set === 'one') { gal(id); fiche(id); urls.add(HEADS.base + HEADS.perso[id]); }
    if (set === 'favs') prefs.favs.forEach(cid => { gal(cid); fiche(cid); });
    if (set === 'fiches') Object.keys(DATA.fiches).forEach(fiche);
    if (set === 'all') { Object.keys(HBx.perso).forEach(gal); Object.keys(DATA.fiches).forEach(fiche); Object.values(HEADS.perso).forEach(p => urls.add(HEADS.base + p)); }
    return [...urls];
  }
  async function downloadSet(set, id) {
    if (!('caches' in self)) { toast('Hors-ligne non disponible dans ce navigateur'); return; }
    const urls = mediaUrls(set, id); const cache = await caches.open('prematch-media');
    let done = 0, bytes = 0, fail = 0; const prog = $('#dl-prog') || $('[data-dl-prog]');
    const todo = []; for (const u of urls) { if (!(await cache.match(u))) todo.push(u); else done++; }
    const step = async u => { try { const r = await fetch(u, { mode: 'cors' }); if (!r.ok) throw 0; const b = await r.clone().blob(); bytes += b.size; await cache.put(u, r); } catch (e) { fail++; } done++; if (prog) prog.textContent = `${done} / ${urls.length} images · ${(bytes / MB).toFixed(1)} Mo${fail ? ' · ' + fail + ' échecs' : ''}`; };
    for (let i = 0; i < todo.length; i += 6) await Promise.all(todo.slice(i, i + 6).map(step));
    toast(`Hors-ligne : ${urls.length - fail} / ${urls.length} images prêtes`);
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });
  }

  /* ---------- Guide Bowser (rédigé d'après SmashPro.tips, frame data UFD, hitbox SmashWiki) ---------- */
  function viewGuide() {
    const p = SP.perso.bowser || { forts: [], faibles: [] };
    const best = [
      ['Fair', 'Fair', 'Démarrage un peu lent, mais grande portée et une zone très large, même derrière toi et contre les petits persos. C’est ton aérien le plus sûr sur bouclier (−9) : combos à bas %, kill à haut %, et une arme d’edgeguard.'],
      ['Nair', 'Nair', 'Beaucoup de dégâts et un démarreur de combo à tous les % (nair en chute rapide → up-tilt). Il peut mener à un kill confirm.'],
      ['Side-B (Flying Slam)', 'FlyingSlamGrounded', 'Saisie qui ignore le bouclier, sort frame 6 même en l’air : option hors bouclier et pour atterrir. Gros lag si ça rate : le jeu mental, c’est d’alterner fair et side-B pour que l’adversaire ne sache jamais lequel arrive.'],
      ['Up-smash', 'Smash haut', 'La carapace est invincible et dépasse ta hurtbox : elle passe à travers beaucoup de contres et d’attaques aériennes. Éjection énorme, et la 2e hitbox à la retombée peut lancer un combo.'],
      ['Up-B au sol', 'WhirlingFortressGrounded', 'Ta punition hors bouclier par défaut (frame 6). Elle touche des deux côtés et tu peux te déplacer pendant, ce qui couvre les atterrissages. Lag de fin important : si l’adversaire t’appâte, tu es puni.']];
    const hbB = (BASE.hitboxes || { perso: {} }).perso.bowser;
    const mv = lab => { const i = hbB ? hbB.moves.findIndex(m => m[0].startsWith(lab) || m[2].includes(lab)) : -1; return i >= 0 ? `<button class="chip sm" data-act="hb" data-id="bowser" data-i="${i}">Voir la hitbox</button>` : ''; };
    const group = (title, ids, cls) => `<div class="g-mu"><h4 class="sp-${cls}">${title}</h4><div class="chips">${ids.filter(i => DATA.byId[i]).map(i => `<a class="chip chip-h" href="#/vs/${i}">${head(i, 24)}${esc(DATA.byId[i].nom)}</a>`).join('')}</div></div>`;
    return `${top('Guide Bowser', '', '', 'bowser')}<main class="guide">
      <div class="guide-head">${head('bowser', 64)}<div><h1>Bowser</h1><p class="muted">Le plus lourd du jeu (poids 135) : il encaisse, tape fort et contrôle la scène, mais ses coups sont punissables et son désavantage est faible.</p></div></div>
      <div class="sp-cols"><div><h4>Points forts</h4><ul class="small">${p.forts.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div><div><h4>Points faibles</h4><ul class="small">${p.faibles.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div></div>
      <h2>Tes 5 meilleurs coups</h2>
      <div class="moves best">${best.map(([n, lab, txt]) => `<div class="best-i"><b>${esc(n)}</b> ${gcInput(n.split(' (')[0])}<p>${esc(txt)}</p>${mv(lab)}</div>`).join('')}<div class="hb-view" data-hb-view></div></div>
      <h2>À retenir</h2>
      <ol class="tips">
        <li><b>Patience.</b> Bowser n’est jamais vraiment en sécurité si l’adversaire lit tes attaques : alterne défense et agression, et change de mode au bon moment.</li>
        <li><b>Up-B.</b> En récupération, le rythme de tes appuis change la hauteur : ne martèle pas B. Hors bouclier, ne le sors pas à chaque fois : beaucoup de coups sont sûrs sur ton bouclier, accepte de ne pas tout punir.</li>
        <li><b>Souffle de feu.</b> Pas en neutre à répétition : tu restes immobile plus d’une seconde.</li>
        <li><b>Armure.</b> Certaines de tes attaques ont de l’armure : l’adversaire ne doit pas foncer dedans. Sers-t’en pour gagner les échanges.</li>
      </ol>
      <h2>Matchups selon SmashPro.tips</h2>
      ${group('Favorables', ['littlemac', 'dk', 'krool', 'hero'], 'fav')}
      ${group('Défavorables', ['pikachu', 'greninja'], 'def')}
      ${group('Défavorables : taille et combos', ['ness', 'younglink', 'samus'], 'def')}
      ${group('Défavorables : zoneurs', ['palutena', 'roy', 'peach'], 'def')}
      <p class="muted">Leur avis diffère parfois du classement de l’app (tiré de Game8) : les deux sont affichés sur chaque fiche.</p>
      <h2>Ta manette GameCube</h2>
      <div class="gc-ref">
        <div>${K('A')} Attaque · ${K('B')} Spécial · ${K('X')}/${K('Y')} Saut · ${K('Z')} Saisie · ${K('R')}/${K('L')} Bouclier · ${CS('')} Smash (réglage par défaut)</div>
        <ul class="small">
          <li>Up-B hors bouclier : garde ${K('R')}, puis ${ST('↑')} + ${K('B')}. Pas besoin de lâcher le bouclier.</li>
          <li>Side-B hors bouclier : saute avec ${K('X')} depuis le bouclier, puis ${ST('→')} + ${K('B')} (frame 9).</li>
          <li>Saut court : tapote ${K('X')}, ou appuie ${K('X')} + ${K('Y')} en même temps.</li>
          <li>Aériens au C-stick (fair ${CS('→')}, bair ${CS('←')}) : tu gardes le stick pour te déplacer.</li>
          <li>Réglages conseillés : « Saut avec le stick » désactivé (évite les sauts involontaires en up-B), et C-stick sur « Attaques » si tu préfères les tilts au C-stick.</li>
        </ul>
      </div>
      <h2>Aller plus loin</h2>
      <p><a class="btn ghost" href="#/frames">Frame data</a> <a class="btn ghost" href="#/routine">Routine 10 min</a> <a class="btn ghost" href="#/vs/bowser">Toutes ses hitbox</a></p>
      <p class="src">Rédigé d’après <a href="${SP.base}bowser/" target="_blank" rel="noopener">SmashPro.tips — Bowser</a> (contributeurs Dineauzor, Gulbutron, Mika · ${esc(SP.credit)}), <a href="https://ultimateframedata.com/bowser" target="_blank" rel="noopener">Ultimate Frame Data</a> et les hitbox SmashWiki.</p>
    </main>${nav('')}`;
  }

  /* ---------- Écran : drills ---------- */
  function viewDrills() {
    return `${top(T('drills'), '', `<a class="btn sm" href="#/import-poppt">＋ Poppt</a>`)}<main>
      <h2>${T('drills')}</h2><div class="list">${DATA.drills.map(d => `<a class="mu" href="#/drill/${d.id}">
        <span class="pill d-mid">${d.type === 'timer' ? '⏱' : '☑'}</span><span class="mu-name">${esc(d.titre)}</span>
        <small>${esc(d.description || '')}${d.origine && d.origine.type === 'poppt' ? ' · 📺 ' + esc(d.origine.auteur) : ''}</small></a>`).join('')}</div>
      <a class="btn" href="#/import-poppt">＋ ${T('import_poppt')}</a>
      ${(() => { const p = source('poppt1') || {}; return (p.videos || []).length ? `<h2>📺 ${esc(p.playlist_nom || 'Playlist Poppt1')}</h2>
        <p class="muted">${p.videos.length} leçons de ${esc(p.nom)}. Ouvre la vidéo ou transforme-la en drill.</p>
        <div class="list">${p.videos.map(v => `<div class="lesson"><a href="https://www.youtube.com/watch?v=${esc(v.video_id)}" target="_blank" rel="noopener">${esc(v.titre)} ↗</a>
          <a class="btn sm ghost" href="#/import-poppt?vid=${esc(v.video_id)}">＋ Drill</a></div>`).join('')}</div>
        ${p.playlist_url ? `<p class="src"><a href="${esc(p.playlist_url)}" target="_blank" rel="noopener">Ouvrir la playlist complète ↗</a></p>` : ''}` : ''; })()}
      </main>${nav('drills')}`;
  }
  let timer = null;
  function viewDrill(id) {
    const d = DATA.drills.find(x => x.id === id);
    if (!d) return viewNotFound();
    const o = d.origine || {};
    return `${top(d.titre, '#/drills')}<main class="drill">
      <p>${esc(d.description || '')}</p>
      ${o.type === 'poppt' || o.lien ? `<p class="poppt"><b>Source :</b> ${esc(o.auteur || '')} ${o.lien ? `<a href="${esc(o.lien)}" target="_blank" rel="noopener">${esc(o.titre_video || 'vidéo')}${o.timestamp ? ' à ' + esc(o.timestamp) : ''} ↗</a>` : ''}</p>` : ''}
      <div class="timer"><div class="clock" id="clock">${fmtTs(d.etapes_minutees ? d.etapes_minutees[0].t : (d.duree_s || 180))}</div>
        <div class="rep" id="rep">${d.etapes_minutees ? `Étape 1 / ${d.etapes_minutees.length}` : `${T('rep')} 1 / ${d.repetitions || 1}`}</div>
        <div class="row"><button class="btn" data-act="t-start">${T('start')}</button><button class="btn ghost" data-act="t-pause">${T('pause')}</button><button class="btn ghost" data-act="t-reset">${T('reset')}</button></div></div>
      <h2>${T('steps')}</h2><ul class="check">${(d.etapes_minutees ? d.etapes_minutees.map(x => `${x.s} (${fmtTs(x.t)})`) : (d.etapes || [])).map((s, i) => `<li><label><input type="checkbox" data-step="${i}"> ${esc(s)}</label></li>`).join('')}</ul>
      ${(d.matchups || []).length ? `<p class="chips">${d.matchups.map(mid => DATA.byId[mid]).filter(Boolean).map(m => `<a class="chip ${dClass(m.difficulte)}" href="#/vs/${m.id}">${esc(m.nom)}</a>`).join('')}</p>` : ''}
    </main>${nav('drills')}`;
  }
  function afterDrill(id) {
    const d = DATA.drills.find(x => x.id === id); if (!d) return;
    const steps = d.etapes_minutees || null;
    const dur = (steps ? steps[0].t : (d.duree_s || 180)) * 1000;
    timer = { d, steps, dur, left: dur, rep: 1, run: false, last: 0, h: null };
    if (steps) markStep();
  }
  function markStep() {
    if (!timer || !timer.steps) return;
    $$('.check li').forEach((li, i) => { li.classList.toggle('now', i === timer.rep - 1); const cb = $('input', li); if (cb && i < timer.rep - 1) cb.checked = true; });
  }
  function beep() {
    try { const ac = new (self.AudioContext || self.webkitAudioContext)(); const o = ac.createOscillator(); const g = ac.createGain(); o.connect(g); g.connect(ac.destination); o.frequency.value = 880; g.gain.value = 0.15; o.start(); o.stop(ac.currentTime + 0.35); } catch (e) { }
    if (navigator.vibrate) navigator.vibrate(200);
  }
  function tick() {
    if (!timer || !timer.run) return;
    const now = performance.now(); timer.left -= now - timer.last; timer.last = now;
    if (timer.left <= 0) {
      beep();
      if (timer.steps && timer.rep < timer.steps.length) { timer.rep++; timer.dur = timer.steps[timer.rep - 1].t * 1000; timer.left = timer.dur; markStep(); }
      else if (!timer.steps && timer.rep < (timer.d.repetitions || 1)) { timer.rep++; timer.left = timer.dur; }
      else { timer.run = false; timer.left = 0; prefs.drillLog = [{ id: timer.d.id, at: Date.now() }, ...prefs.drillLog].slice(0, 200); savePrefs(); toast(T('done')); }
    }
    const c = $('#clock'), r = $('#rep');
    if (c) c.textContent = fmtTs(timer.left / 1000);
    if (r) r.textContent = timer.steps ? `Étape ${timer.rep} / ${timer.steps.length}` : `${T('rep')} ${timer.rep} / ${timer.d.repetitions || 1}`;
    if (timer.run) timer.h = setTimeout(tick, 200);
  }

  /* ---------- Écran : import d'exercice Poppt ---------- */
  function viewImportPoppt(params) {
    const vs = params.get('vs') || ''; const cid = params.get('combo') || '';
    const f = DATA.fiches[vs]; const c = f && (f.combos || []).find(x => x.id === cid);
    const src = source('poppt1') || { nom: 'Poppt1' };
    const lesson = (src.videos || []).find(v => v.video_id === params.get('vid'));
    const preUrl = lesson ? 'https://www.youtube.com/watch?v=' + lesson.video_id : (c && c.ref_poppt && c.ref_poppt.video_url || '');
    const preTitre = lesson ? 'Poppt — ' + lesson.titre : (c ? 'Poppt — ' + c.titre : '');
    return `${top(T('import_poppt'), vs ? '#/vs/' + vs : '#/drills')}<main>
      <form id="poppt-form" class="form">
        <p class="muted">Colle le lien YouTube de la vidéo de ${esc(src.nom)} (avec ou sans <code>?t=</code>). Seul le lien est enregistré : la vidéo reste chez son auteur.</p>
        <label>Lien YouTube<input name="url" type="url" required placeholder="https://youtu.be/XXXXXXXXXXX?t=192" value="${esc(preUrl)}"></label>
        <label>Timestamp (mm:ss, optionnel si présent dans le lien)<input name="ts" placeholder="3:12"></label>
        <label>Titre du drill<input name="titre" required value="${esc(preTitre)}"></label>
        <label>Étapes (une par ligne)<textarea name="etapes" rows="5" placeholder="Regarder l'extrait&#10;Reproduire 10× en entraînement&#10;Valider en match"></textarea></label>
        <label>Durée par série (secondes)<input name="duree" type="number" min="10" value="180"></label>
        <label>Séries<input name="reps" type="number" min="1" value="3"></label>
        <label>Matchup lié<select name="vs"><option value="">—</option>${DATA.matchups.map(m => `<option value="${m.id}" ${m.id === vs ? 'selected' : ''}>${esc(m.nom)}</option>`).join('')}</select></label>
        <input type="hidden" name="combo" value="${esc(cid)}">
        <label class="inline"><input type="checkbox" name="asMedia" checked> Ajouter aussi la vidéo (lien + timestamp) dans les médias de la fiche${c ? ' et lier ce combo' : ''}</label>
        <p class="muted">Attribution enregistrée : « ${esc(src.attribution || src.nom)} »</p>
        <button class="btn" type="submit">${T('add')}</button>
      </form></main>${nav('drills')}`;
  }
  async function submitPoppt(form) {
    const fd = new FormData(form);
    const yt = parseYouTube(fd.get('url'));
    if (!yt) { toast('Lien YouTube non reconnu'); return; }
    const start = parseTs(fd.get('ts')) || yt.start;
    const ts = start ? fmtTs(start) : '';
    const link = `https://www.youtube.com/watch?v=${yt.id}${start ? '&t=' + start + 's' : ''}`;
    const src = source('poppt1') || { nom: 'Poppt1' };
    const vs = fd.get('vs'); const cid = fd.get('combo');
    const drill = {
      id: uid('poppt'), titre: fd.get('titre'), description: 'Exercice importé depuis une vidéo de ' + src.nom + '.',
      type: 'timer', duree_s: +fd.get('duree') || 180, repetitions: +fd.get('reps') || 1,
      etapes: lines(fd.get('etapes')).length ? lines(fd.get('etapes')) : ['Regarder l’extrait', 'Reproduire en entraînement', 'Appliquer en match'],
      matchups: vs ? [vs] : [], origine: { type: 'poppt', source_id: 'poppt1', auteur: src.nom, lien: link, timestamp: ts, titre_video: ((src.videos || []).find(v => v.video_id === yt.id) || {}).titre || '', importe_le: new Date().toISOString() }
    };
    await S.put('drills', drill.id, drill);
    if (fd.get('asMedia') && vs) {
      const base = DATA.fiches[vs] ? clone(DATA.fiches[vs]) : skeleton(vs);
      const mid = uid('yt');
      base.medias = base.medias || [];
      base.medias.push({ id: mid, type: 'youtube', video_id: yt.id, start, titre: drill.titre, source: 'YouTube', auteur: src.nom, lien: link, timestamp: ts, permission: 'lien_seulement', statut: 'verifie' });
      const c = (base.combos || []).find(x => x.id === cid);
      if (c) { c.medias = [...(c.medias || []), mid]; c.ref_poppt = { statut: 'lie', video_url: link, timestamp: ts }; }
      await S.put('fiches', vs, base);
    }
    await loadLocal();
    toast(T('saved'));
    location.hash = '#/drill/' + drill.id;
  }

  /* ---------- Écran : révision rapide (flashcards, boîtes de Leitner) ---------- */
  let deck = [], deckI = 0;
  function buildDeck(filter) {
    const cards = [];
    Object.values(DATA.fiches).forEach(f => {
      if (filter && f.id !== filter) return;
      const medias = f.medias || [];
      (f.setups || []).forEach((s, i) => cards.push({ id: `${f.id}:s${i}`, f, media: null, q: `${f.nom} — ${s.reconnaitre}`, a: [s.reponse] }));
      (f.combos || []).forEach(c => {
        const m = (c.medias || []).map(id => medias.find(x => x.id === id)).find(x => x && x.type !== 'recherche');
        cards.push({ id: `${f.id}:${c.id}`, f, media: m, q: `${f.nom} : ${c.titre} — ${(c.inputs || []).join(' → ')}`, a: c.contre_mesures || [] });
      });
    });
    // Cartes « Quel coup ? » : GIF de hitbox SmashWiki → nom du coup (persos ayant une fiche, ou le perso filtré)
    const hbIds = filter ? [filter] : Object.keys(DATA.fiches);
    hbIds.forEach(id => { const h = HB.perso[id]; const nom = (DATA.byId[id] || {}).nom || id; if (!h) return;
      h.moves.filter(m => ['smash', 'air', 'special'].includes(m[1])).slice(0, filter ? 30 : 6).forEach(m => cards.push({ id: `${id}:hb:${m[2]}`, media: { type: 'gif', url: HB.base + m[2], titre: 'Quel coup ?', source: 'SmashWiki (hitbox)', auteur: HB.credit, lien: h.page, permission: 'lien_seulement', statut: 'verifie' }, q: `${nom} — quel coup est-ce ?`, a: [m[0]] })); });
    return cards.sort((a, b) => ((prefs.flash[a.id] || 1) - (prefs.flash[b.id] || 1)) || (Math.random() - 0.5));
  }
  function viewFlash(params) {
    const filter = params.get('vs') || '';
    deck = buildDeck(filter); deckI = 0;
    return `${top(T('flash'), '')}<main class="flash">
      <label>Matchup <select id="flash-filter"><option value="">Tous (fiches complètes)</option>${DATA.matchups.filter(m => DATA.fiches[m.id] || HB.perso[m.id]).map(m => `<option value="${m.id}" ${m.id === filter ? 'selected' : ''}>${esc(m.nom)}${DATA.fiches[m.id] ? '' : ' (coups seulement)'}</option>`).join('')}</select></label>
      <div id="card"></div></main>${nav('flash')}`;
  }
  function renderCard(revealed) {
    const el = $('#card'); if (!el) return;
    const c = deck[deckI];
    if (!c) { el.innerHTML = `<p class="empty">${T('flash_empty')}</p>`; return; }
    el.innerHTML = `<article class="card"><p class="count">${deckI + 1} / ${deck.length} · boîte ${prefs.flash[c.id] || 1}</p>
      ${c.media ? `<div class="card-media">${mediaSlide(c.media)}</div>` : ''}
      <p class="q">${esc(c.q)}</p><p class="q2">${T('flash_q')}</p>
      ${revealed ? `<ul class="a">${c.a.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
        <div class="row"><button class="btn ghost" data-act="fc-again">${T('again')}</button><button class="btn" data-act="fc-knew">${T('knew')}</button></div>`
        : `<button class="btn" data-act="fc-reveal">${T('reveal')}</button>`}</article>`;
    hydrateMedia(el);
  }

  /* ---------- Écran : administration ---------- */
  const skeleton = id => ({ id, nom: (DATA.byId[id] || {}).nom || id, difficulte: (DATA.byId[id] || {}).difficulte || 5, conseil_rapide: '', win_conditions: [], setups: [], combos: [], medias: [], conseils_bowser: [] });
  function viewAdmin() {
    return `${top(T('admin'), '')}<main class="admin">
      <div class="row wrap"><button class="btn" data-act="export">⬇ ${T('export')}</button>
        <label class="btn ghost">⬆ ${T('import')}<input type="file" accept="application/json" data-act-change="import" hidden></label></div>
      <h2>Fiches</h2><div class="list">${DATA.matchups.map(m => `<a class="mu" href="#/admin/${m.id}"><span class="pill ${dClass(m.difficulte)}">${m.difficulte}</span>
        <span class="mu-name">${esc(m.nom)}</span><small>${DATA.fiches[m.id] ? ((DATA.fiches[m.id].combos || []).length + ' combos · ' + (DATA.fiches[m.id].medias || []).length + ' médias') : 'à rédiger'}${DATA.edited.has(m.id) ? ' · éditée' : ''}</small></a>`).join('')}</div>
      <h2>${T('veille')}</h2><p class="muted">Candidats produits par <code>tools/veille.mjs</code> (liens + métadonnées, jamais de fichiers vidéo). Chaque ajout reste « à vérifier » jusqu'à ta validation.</p>
      <label class="btn ghost">${T('veille_import')}<input type="file" accept="application/json" data-act-change="veille" hidden></label>
      <div id="veille"></div>
    </main>${nav('admin')}`;
  }
  async function renderVeille() {
    const el = $('#veille'); if (!el) return;
    let v = null; try { v = await S.get('kv', 'veille'); } catch (e) { }
    if (!v || !(v.candidats || []).length) { el.innerHTML = ''; return; }
    el.innerHTML = `<p class="muted">Importé le ${esc(new Date(v.importe_le).toLocaleString())} — ${v.candidats.length} candidats</p>` + v.candidats.map((c, i) => `
      <div class="veille-item"><a href="${esc(c.lien)}" target="_blank" rel="noopener">${esc(c.titre)}</a><small>${esc(c.auteur)} · ${esc((c.date || '').slice(0, 10))}</small>
      <div class="row"><select data-veille-vs="${i}">${DATA.matchups.map(m => `<option value="${m.id}" ${(c.matchups_detectes || [])[0] === m.id ? 'selected' : ''}>${esc(m.nom)}</option>`).join('')}</select>
      <button class="btn sm" data-act="veille-add" data-i="${i}">＋ Média</button></div></div>`).join('');
  }

  let editing = null;
  function viewAdminEdit(id) {
    if (!DATA.byId[id]) return viewNotFound();
    editing = clone(DATA.fiches[id] || skeleton(id));
    return `${top('✎ ' + editing.nom, '#/admin')}<main class="admin"><form id="edit-form" class="form">${editForm()}</form></main>${nav('admin')}`;
  }
  const GOALS = ['kill', 'racking', 'stage_control', 'setup'];
  const PERMS = ['original', 'lien_seulement', 'autorise', 'perso', 'cc_by_sa'];
  const sel = (name, opts, val, labeler = x => x) => `<select name="${name}">${opts.map(o => `<option value="${o}" ${o === val ? 'selected' : ''}>${esc(labeler(o))}</option>`).join('')}</select>`;
  function editForm() {
    const e = editing;
    const medOpts = e.medias || [];
    return `
      <label>${T('difficulty')} <output id="dv">${e.difficulte}</output><input type="range" name="difficulte" min="1" max="10" value="${e.difficulte}" oninput="dv.value=this.value"></label>
      <label>${T('quick')}<textarea name="conseil_rapide" rows="2">${esc(e.conseil_rapide)}</textarea></label>
      <label>${T('win')} (3–4, une par ligne)<textarea name="win_conditions" rows="4">${esc((e.win_conditions || []).join('\n'))}</textarea></label>
      <label>${T('tips')} (une par ligne)<textarea name="conseils_bowser" rows="3">${esc((e.conseils_bowser || []).join('\n'))}</textarea></label>
      <label>${T('setups')} (titre | reconnaître | réponse, une par ligne)<textarea name="setups" rows="3">${esc((e.setups || []).map(s => [s.titre, s.reconnaitre, s.reponse].join(' | ')).join('\n'))}</textarea></label>
      <h2>${T('combos')}</h2>
      ${(e.combos || []).map((c, i) => `<fieldset><legend>Combo ${i + 1}</legend>
        <label>Titre<input name="c${i}_titre" value="${esc(c.titre)}" required></label>
        <label>Inputs (séparés par →)<input name="c${i}_inputs" value="${esc((c.inputs || []).join(' → '))}" placeholder="short hop nair → dash → grab"></label>
        <div class="grid3"><label>%<input name="c${i}_pct" value="${esc(c.conditions && c.conditions.pourcent)}"></label>
          <label>${T('pos')}<input name="c${i}_pos" value="${esc(c.conditions && c.conditions.position)}"></label>
          <label>DI<input name="c${i}_di" value="${esc(c.conditions && c.conditions.di)}"></label></div>
        <label>${T('goal')} ${sel(`c${i}_but`, GOALS, c.but, g => T('goal_' + g))}</label>
        <label>${T('variants')} (une par ligne)<textarea name="c${i}_var" rows="2">${esc((c.variantes || []).join('\n'))}</textarea></label>
        <label>${T('counters')} (une par ligne)<textarea name="c${i}_cm" rows="3">${esc((c.contre_mesures || []).join('\n'))}</textarea></label>
        <div class="media-pick">Médias : ${medOpts.map(m => `<label class="inline"><input type="checkbox" name="c${i}_med" value="${esc(m.id)}" ${(c.medias || []).includes(m.id) ? 'checked' : ''}> ${esc(m.titre)}</label>`).join('') || '<small>ajoute d’abord des médias</small>'}</div>
        <div class="grid2"><label>Vidéo Poppt (lien)<input name="c${i}_pu" value="${esc(c.ref_poppt && c.ref_poppt.video_url)}"></label>
          <label>Timestamp Poppt<input name="c${i}_pt" value="${esc(c.ref_poppt && c.ref_poppt.timestamp)}" placeholder="3:12"></label></div>
        <button type="button" class="btn ghost sm" data-act="c-del" data-i="${i}">${T('del')}</button></fieldset>`).join('')}
      <button type="button" class="btn ghost" data-act="c-add">＋ Combo</button>
      <h2>Médias</h2>
      ${(e.medias || []).map((m, j) => `<fieldset><legend>${esc(m.id)}</legend>
        <div class="grid2"><label>Type ${sel(`m${j}_type`, ['schema', 'youtube', 'gif', 'local', 'recherche'], m.type)}</label>
          <label>Schéma ${sel(`m${j}_schema`, [''].concat(PMSchemas.list()), m.schema || '')}</label></div>
        <label>Titre<input name="m${j}_titre" value="${esc(m.titre)}"></label>
        <label>Lien / URL (YouTube, GIF, page source)<input name="m${j}_lien" value="${esc(m.type === 'gif' ? m.url : m.lien)}"></label>
        <div class="grid3"><label>Source<input name="m${j}_source" value="${esc(m.source)}"></label>
          <label>Auteur<input name="m${j}_auteur" value="${esc(m.auteur)}"></label>
          <label>Timestamp<input name="m${j}_ts" value="${esc(m.timestamp)}" placeholder="m:ss"></label></div>
        <div class="grid2"><label>${T('perm')} ${sel(`m${j}_perm`, PERMS, m.permission || 'lien_seulement', p => T('perm_' + p))}</label>
          <label>Statut ${sel(`m${j}_statut`, ['verifie', 'a_verifier'], m.statut || 'a_verifier')}</label></div>
        <button type="button" class="btn ghost sm" data-act="m-del" data-j="${j}">${T('del')}</button></fieldset>`).join('')}
      <div class="row wrap"><button type="button" class="btn ghost" data-act="m-add">＋ Média (lien)</button>
        <label class="btn ghost">🔒 Clip perso chiffré<input type="file" accept="image/*,video/*" data-act-change="m-upload" hidden></label></div>
      <p class="muted">Le clip perso est chiffré (AES-GCM) dans ton appareil. Coffre : ${S.Vault.isUnlocked() ? T('vault_open') : T('vault_locked') + ' — Réglages'}.</p>
      <div class="row wrap sticky-save"><button class="btn" type="submit">💾 ${T('save')}</button>
        ${DATA.edited.has(editing.id) ? `<button type="button" class="btn ghost" data-act="e-reset">${T('reset_default')}</button>` : ''}</div>`;
  }
  function readForm() {
    const form = $('#edit-form'); if (!form) return;
    const fd = new FormData(form); const e = editing;
    e.difficulte = +fd.get('difficulte');
    e.conseil_rapide = fd.get('conseil_rapide').trim();
    e.win_conditions = lines(fd.get('win_conditions'));
    e.conseils_bowser = lines(fd.get('conseils_bowser'));
    e.setups = lines(fd.get('setups')).map(l => { const [titre = '', reconnaitre = '', reponse = ''] = l.split('|').map(x => x.trim()); return { titre, reconnaitre, reponse }; });
    e.medias = (e.medias || []).map((m, j) => {
      const type = fd.get(`m${j}_type`), lien = (fd.get(`m${j}_lien`) || '').trim(), ts = (fd.get(`m${j}_ts`) || '').trim();
      const out = { ...m, type, titre: fd.get(`m${j}_titre`), source: fd.get(`m${j}_source`), auteur: fd.get(`m${j}_auteur`), timestamp: ts, permission: fd.get(`m${j}_perm`), statut: fd.get(`m${j}_statut`), schema: fd.get(`m${j}_schema`) || undefined };
      if (type === 'gif') { out.url = lien; out.lien = m.lien && m.lien !== m.url ? m.lien : lien; } else out.lien = lien;
      if (type === 'youtube') { const y = parseYouTube(lien); if (y) { out.video_id = y.id; out.start = parseTs(ts) || y.start; if (!ts && y.start) out.timestamp = fmtTs(y.start); } }
      return out;
    });
    e.combos = (e.combos || []).map((c, i) => ({
      ...c, titre: fd.get(`c${i}_titre`), inputs: String(fd.get(`c${i}_inputs`) || '').split(/→|->|;/).map(x => x.trim()).filter(Boolean),
      conditions: { pourcent: fd.get(`c${i}_pct`), position: fd.get(`c${i}_pos`), di: fd.get(`c${i}_di`) },
      but: fd.get(`c${i}_but`), variantes: lines(fd.get(`c${i}_var`)), contre_mesures: lines(fd.get(`c${i}_cm`)),
      medias: fd.getAll(`c${i}_med`),
      ref_poppt: fd.get(`c${i}_pu`) ? { statut: 'lie', video_url: fd.get(`c${i}_pu`).trim(), timestamp: (fd.get(`c${i}_pt`) || '').trim() } : (c.ref_poppt && !c.ref_poppt.video_url ? c.ref_poppt : null)
    }));
  }
  function rerenderEdit() { const form = $('#edit-form'); if (form) form.innerHTML = editForm(); }

  /* ---------- Écran : réglages ---------- */
  function viewSettings() {
    const poppt = source('poppt1') || {};
    return `${top(T('settings'), '')}<main class="settings form">
      <a class="mine" href="#/admin">✎ Administration : éditer les fiches, médias, veille, sauvegarde</a>
      <label>Mon perso <select name="main">${DATA.matchups.map(m => `<option value="${m.id}" ${m.id === mainId() ? 'selected' : ''}>${esc(m.nom.replace(' (miroir)', ''))}</option>`).join('')}</select></label>
      <p class="muted">Change le perso que tu joues : punitions, % de kill, frame data et guide s’adaptent. Les contre-mesures écrites des fiches restent celles de Bowser.</p>
      <label>${T('lang')} ${sel('lang', Object.keys(PMI18n.LANGS), prefs.lang, l => PMI18n.LANGS[l])}</label>
      <label>Notation des inputs ${sel('notation', ['gc', 'texte'], prefs.notation, x => x === 'gc' ? 'Manette GameCube (boutons)' : 'Texte (up-tilt, side-B…)')}</label>
      <label>${T('theme')} ${sel('theme', ['auto', 'light', 'dark'], prefs.theme, x => T('theme_' + x))}</label>
      <label class="inline"><input type="checkbox" name="wakelock" ${prefs.wakelock ? 'checked' : ''}> ${T('wakelock')}</label>
      <h2>${T('storage')}</h2>
      <div class="grid2"><label>${T('cache_limit')}<input type="number" name="cacheMB" min="10" max="5000" value="${prefs.cacheMB}"></label>
        <label>${T('vault_limit')}<input type="number" name="vaultMB" min="10" max="10000" value="${prefs.vaultMB}"></label></div>
      <p id="usage" class="muted">…</p>
      <h2>Hors-ligne : images</h2>
      <p class="muted">Les GIFs et icônes viennent de SmashWiki. Télécharge-les ici pour les voir sans réseau (stockés sur cet appareil uniquement, pour ton usage).</p>
      <div class="dl-grid">
        <button type="button" class="btn ghost" data-act="dl" data-set="heads">Icônes des 80 persos <small>≈ 0,5 Mo</small></button>
        <button type="button" class="btn ghost" data-act="dl" data-set="main">Hitbox de ${esc(mainNom())} <small>≈ 15 Mo</small></button>
        <button type="button" class="btn ghost" data-act="dl" data-set="favs">GIFs de mes favoris <small>≈ 20 Mo / perso</small></button>
        <button type="button" class="btn ghost" data-act="dl" data-set="fiches">GIFs des 80 fiches <small>≈ 200 Mo</small></button>
        <button type="button" class="btn ghost" data-act="dl" data-set="all">Toutes les hitbox (2 355) <small>≈ 1 Go : PC conseillé</small></button>
        <button type="button" class="btn ghost danger" data-act="dl-clear">Vider les images hors-ligne</button>
      </div>
      <div id="dl-prog" class="muted"></div>
      <h2>${T('vault')}</h2><div id="vault-box"></div>
      <h2>${T('sources_title')}</h2>
      <fieldset><legend>${esc(poppt.nom || 'Poppt1')} — priorité ${poppt.priorite || 1}</legend>
        <p class="muted">${esc(poppt.description || '')}</p>
        <label>URL de la chaîne<input name="poppt_chaine" value="${esc(poppt.chaine_url)}" placeholder="https://www.youtube.com/@…"></label>
        <label>Channel ID (pour la veille RSS)<input name="poppt_cid" value="${esc(poppt.channel_id)}"></label>
        <label>Playlist Poppt<input name="poppt_pl" value="${esc(poppt.playlist_url)}"></label>
        <button type="button" class="btn sm" data-act="save-poppt">${T('save')}</button></fieldset>
      ${DATA.sources.filter(s => s.id !== 'poppt1').map(s => `<p class="src"><b>${esc(s.nom)}</b> · ${esc(s.description)} ${s.chaine_url ? `<a href="${esc(s.chaine_url)}" target="_blank" rel="noopener">↗</a>` : ''}</p>`).join('')}
      <p class="muted">Données ${esc(BASE.fiches.version)} · ${DATA.matchups.length} matchups · ${Object.keys(DATA.fiches).length} fiches complètes</p>
    </main>${nav('settings')}`;
  }
  async function afterSettings() {
    try {
      const est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null;
      const mc = await S.MediaCache.size(), vs = await S.Vault.size();
      $('#usage').textContent = `${T('used')} : cache ${(mc / MB).toFixed(1)} / ${prefs.cacheMB} Mo · coffre ${(vs / MB).toFixed(1)} / ${prefs.vaultMB} Mo` + (est ? ` · navigateur ${(est.usage / MB).toFixed(1)} Mo sur ${(est.quota / MB).toFixed(0)} Mo` : '');
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });
    } catch (e) { $('#usage').textContent = 'Stockage local indisponible dans ce contexte.'; }
    await renderVault();
    $$('.settings select, .settings input[type=checkbox], .settings input[type=number]').forEach(el => el.addEventListener('change', () => {
      if (el.name === 'lang') { prefs.lang = el.value; PMI18n.set(el.value); }
      else if (el.name === 'theme') { prefs.theme = el.value; applyTheme(); }
      else if (el.name === 'wakelock') prefs.wakelock = el.checked;
      else if (el.name === 'notation') prefs.notation = el.value;
      else if (el.name === 'main') { prefs.main = el.value; savePrefs(); toast('Perso : ' + mainNom()); route(); return; }
      else if (el.name === 'cacheMB' || el.name === 'vaultMB') prefs[el.name] = Math.max(10, +el.value || DEFAULTS[el.name]);
      else return;
      savePrefs(); if (el.name === 'lang') route();
    }));
  }
  async function renderVault() {
    const box = $('#vault-box'); if (!box) return;
    if (!S.Vault.available()) { box.innerHTML = '<p class="muted">WebCrypto indisponible (ouvre l’app en https ou localhost).</p>'; return; }
    let exists = false; try { exists = await S.Vault.exists(); } catch (e) { }
    const items = S.Vault.isUnlocked() ? await S.Vault.list() : [];
    box.innerHTML = `<p class="muted">${exists ? (S.Vault.isUnlocked() ? '🔓 ' + T('vault_open') : '🔒 ' + T('vault_locked')) : 'Aucun coffre. Il protège les clips que TU ajoutes (enregistrements perso).'}</p>
      ${S.Vault.isUnlocked() ? `<ul class="small">${items.map(i => `<li>${esc(i.name)} — ${(i.size / MB).toFixed(1)} Mo</li>`).join('') || '<li>vide</li>'}</ul>
        <div class="row wrap"><button type="button" class="btn ghost" data-act="v-lock">${T('vault_lock')}</button><button type="button" class="btn ghost danger" data-act="v-destroy">${T('vault_destroy')}</button></div>`
        : `<label>${T('passphrase')}<input type="password" id="pass" autocomplete="new-password" minlength="8"></label>
        <button type="button" class="btn" data-act="${exists ? 'v-unlock' : 'v-create'}">${exists ? T('vault_unlock') : T('vault_create')}</button>`}
      <p class="muted">Clé dérivée par PBKDF2-SHA-256 (250 000 itérations), chiffrement AES-GCM 256. Phrase oubliée = contenu irrécupérable.</p>`;
  }

  /* ---------- Sauvegarde / restauration ---------- */
  async function exportAll() {
    const dump = {
      format: 'prematch-backup', version: 1, date: new Date().toISOString(),
      fiches: (await S.all('fiches')).map(r => r.value), drills: (await S.all('drills')).map(r => r.value),
      sources: (await S.all('sources')).map(r => r.value), prefs, vault: null,
      journal: JOURNAL, plans: (await S.all('kv')).filter(r => String(r.key).startsWith('plan:')).map(r => ({ id: r.key, ...r.value }))
    };
    if (await S.Vault.exists() && confirm('Inclure le coffre chiffré (reste chiffré, restaurable avec ta phrase secrète) ?')) dump.vault = await S.Vault.exportEncrypted();
    download(`prematch-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`, dump);
  }
  async function importAll(file) {
    const dump = JSON.parse(await file.text());
    if (dump.format !== 'prematch-backup') throw new Error('Fichier non reconnu');
    for (const f of dump.fiches || []) await S.put('fiches', f.id, f);
    for (const d of dump.drills || []) await S.put('drills', d.id, d);
    for (const s of dump.sources || []) await S.put('sources', s.id, s);
    if (Array.isArray(dump.journal)) { const ids = new Set(JOURNAL.map(j => j.id)); JOURNAL = [...dump.journal.filter(j => !ids.has(j.id)), ...JOURNAL].sort((a, b) => b.at - a.at); await saveJournal(); }
    for (const p of dump.plans || []) { const { id, ...rest } = p; await S.put('kv', id, rest); }
    if (dump.prefs) { prefs = { ...DEFAULTS, ...dump.prefs }; savePrefs(); applyTheme(); }
    if (dump.vault && confirm('Restaurer aussi le coffre chiffré ? (remplace la méta du coffre actuel)')) await S.Vault.importEncrypted(dump.vault);
    await loadLocal();
  }

  /* ---------- Routeur ---------- */
  function route() {
    wakeOff();
    if (timer) { clearTimeout(timer.h); timer = null; }
    const raw = location.hash.slice(1) || '/';
    const [path, qs] = raw.split('?');
    const p = path.split('/').filter(Boolean);
    const params = new URLSearchParams(qs || '');
    let html, after = null;
    switch (p[0]) {
      case undefined: html = viewHome(); after = afterHome; break;
      case 'vs': html = viewFiche(p[1]); after = afterFiche; break;
      case 'combo': html = viewCombo(p[1], p[2]); after = () => hydrateMedia(app); break;
      case 'drills': html = viewDrills(); break;
      case 'drill': html = viewDrill(p[1]); after = () => afterDrill(p[1]); break;
      case 'import-poppt': html = viewImportPoppt(params); break;
      case 'flash': html = viewFlash(params); after = () => { renderCard(false); $('#flash-filter').addEventListener('change', e => { location.hash = '#/flash' + (e.target.value ? '?vs=' + e.target.value : ''); }); }; break;
      case 'admin': html = p[1] ? viewAdminEdit(p[1]) : viewAdmin(); after = p[1] ? null : renderVeille; break;
      case 'reglages': html = viewSettings(); after = afterSettings; break;
      case 'journal': html = viewJournal(params); break;
      case 'frames': html = mainId() === 'bowser' ? viewFrames() : viewFramesGeneric(); after = () => { hydrateMedia(app); fillFrames(); }; break;
      case 'guide': html = mainId() === 'bowser' ? viewGuide() : viewGuideGeneric(); after = fillGuideKill; break;
      case 'kill': html = viewKill(params); after = afterKill; break;
      case 'routine': location.replace('#/drill/routine-bowser'); return;
      default: html = viewNotFound();
    }
    app.innerHTML = html;
    window.scrollTo(0, 0);
    if (after) after();
  }

  /* ---------- Événements (délégation) ---------- */
  document.addEventListener('click', async e => {
    const el = e.target.closest('[data-act]'); if (!el || !el.dataset.act) return;
    const act = el.dataset.act;
    try {
      switch (act) {
        case 'focus-search': e.preventDefault(); $('#q') && $('#q').focus(); break;
        case 'fav': {
          const id = el.dataset.id; const on = !prefs.favs.includes(id);
          prefs.favs = on ? [...prefs.favs, id] : prefs.favs.filter(x => x !== id); savePrefs();
          el.textContent = on ? '★' : '☆'; el.classList.toggle('fav', on); el.setAttribute('aria-pressed', on); break;
        }
        case 'quick': $('#quick').hidden = false; $('#quick .btn').focus(); break;
        case 'quick-close': $('#quick').hidden = true; break;
        case 'car-prev': case 'car-next': {
          const tr = $('.car-track', el.closest('[data-car]'));
          tr.scrollBy({ left: (act === 'car-next' ? 1 : -1) * tr.clientWidth, behavior: 'smooth' }); break;
        }
        case 'yt': {
          if (!navigator.onLine) { toast(T('media_offline')); break; }
          if (self.PMDesktop) { window.open(el.dataset.lien || ('https://www.youtube.com/watch?v=' + el.dataset.vid), '_blank'); break; }   // app bureau : ouvre YouTube dans le navigateur
          const ifr = document.createElement('iframe');
          ifr.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(el.dataset.vid)}?start=${+el.dataset.start || 0}&autoplay=1&rel=0`;
          ifr.allow = 'autoplay; encrypted-media; picture-in-picture'; ifr.allowFullscreen = true; ifr.title = 'Extrait YouTube';
          ifr.className = 'yt-frame'; el.replaceWith(ifr); break;
        }
        case 't-start': if (timer && !timer.run) { if (timer.left <= 0) { timer.left = timer.dur; timer.rep = 1; } timer.run = true; timer.last = performance.now(); tick(); } break;
        case 't-pause': if (timer) { timer.run = false; clearTimeout(timer.h); } break;
        case 't-reset': if (timer) { timer.run = false; clearTimeout(timer.h); timer.rep = 1; timer.dur = (timer.steps ? timer.steps[0].t : (timer.d.duree_s || 180)) * 1000; timer.left = timer.dur; $('#clock').textContent = fmtTs(timer.dur / 1000); $('#rep').textContent = timer.steps ? `Étape 1 / ${timer.steps.length}` : `${T('rep')} 1 / ${timer.d.repetitions || 1}`; markStep(); } break;
        case 'hb': showMove(el); break;
        case 'j-del': JOURNAL.splice(+el.dataset.i, 1); await saveJournal(); route(); break;
        case 'fc-reveal': renderCard(true); break;
        case 'fc-knew': case 'fc-again': {
          const c = deck[deckI]; prefs.flash[c.id] = act === 'fc-knew' ? Math.min(5, (prefs.flash[c.id] || 1) + 1) : 1; savePrefs();
          deckI = (deckI + 1) % Math.max(1, deck.length); renderCard(false); break;
        }
        case 'export': await exportAll(); break;
        case 'c-add': readForm(); editing.combos.push({ id: uid('combo'), titre: 'Nouveau combo', inputs: [], conditions: {}, but: 'racking', variantes: [], contre_mesures: [], medias: [], ref_poppt: null, sources: [] }); rerenderEdit(); break;
        case 'c-del': readForm(); editing.combos.splice(+el.dataset.i, 1); rerenderEdit(); break;
        case 'm-add': readForm(); editing.medias.push({ id: uid('media'), type: 'youtube', titre: 'Nouveau média', source: '', auteur: '', lien: '', timestamp: '', permission: 'lien_seulement', statut: 'a_verifier' }); rerenderEdit(); break;
        case 'm-del': {
          readForm(); const [m] = editing.medias.splice(+el.dataset.j, 1);
          editing.combos.forEach(c => { c.medias = (c.medias || []).filter(x => x !== m.id); });
          if (m.type === 'local' && m.blob_id && confirm('Supprimer aussi le fichier chiffré du coffre ?')) await S.Vault.remove(m.blob_id);
          rerenderEdit(); break;
        }
        case 'e-reset': if (confirm('Effacer tes modifications de cette fiche ?')) { await S.del('fiches', editing.id); await loadLocal(); toast(T('saved')); location.hash = '#/admin'; } break;
        case 'veille-add': {
          const v = await S.get('kv', 'veille'); const c = v.candidats[+el.dataset.i];
          const vs = $(`[data-veille-vs="${el.dataset.i}"]`).value;
          const f = DATA.fiches[vs] ? clone(DATA.fiches[vs]) : skeleton(vs);
          const y = parseYouTube(c.lien);
          f.medias = f.medias || [];
          f.medias.push({ id: uid('veille'), type: y ? 'youtube' : 'recherche', video_id: y && y.id, start: y ? y.start : 0, titre: c.titre, source: c.source_nom || 'YouTube', auteur: c.auteur, lien: c.lien, timestamp: '', permission: 'lien_seulement', statut: 'a_verifier' });
          await S.put('fiches', vs, f); await loadLocal(); toast('Ajouté à ' + f.nom + ' (à vérifier)'); break;
        }
        case 'purge': await S.MediaCache.clear(); toast('Cache vidé'); afterSettings(); break;
        case 'dl': await downloadSet(el.dataset.set, el.dataset.id); break;
        case 'dl-clear': if ('caches' in self) { await caches.delete('prematch-media'); toast('Images hors-ligne supprimées'); afterSettings(); } break;
        case 'dl-offline': {
          let n = 0, fail = 0;
          for (const f of Object.values(DATA.fiches)) for (const m of f.medias || []) {
            if (m.type !== 'gif' || !['original', 'autorise', 'perso', 'cc_by_sa'].includes(m.permission)) continue;
            if (await S.MediaCache.has(m.url)) continue;
            try { await S.MediaCache.fetchAndStore(m.url, prefs.cacheMB * MB); n++; } catch (err) { fail++; }
          }
          toast(`${n} média(s) mis en cache${fail ? ', ' + fail + ' refusé(s) par l’hébergeur (lien conservé)' : ''}. Les schémas sont déjà hors-ligne.`);
          afterSettings(); break;
        }
        case 'v-create': await S.Vault.create($('#pass').value); toast('Coffre créé'); renderVault(); break;
        case 'v-unlock': await S.Vault.unlock($('#pass').value); toast(T('vault_open')); renderVault(); break;
        case 'v-lock': S.Vault.lock(); renderVault(); break;
        case 'v-destroy': if (confirm('Supprimer définitivement le coffre et tous les clips chiffrés ?')) { await S.Vault.destroy(); renderVault(); } break;
        case 'save-poppt': {
          const base = clone(source('poppt1'));
          base.chaine_url = $('[name=poppt_chaine]').value.trim(); base.channel_id = $('[name=poppt_cid]').value.trim(); base.playlist_url = $('[name=poppt_pl]').value.trim();
          if (base.channel_id) base.channel_id_statut = 'confirme_par_utilisateur';
          await S.put('sources', 'poppt1', base); await loadLocal(); toast(T('saved')); break;
        }
      }
    } catch (err) { console.error(err); toast(err.message || String(err)); }
  });
  document.addEventListener('change', async e => {
    const el = e.target.closest('[data-act-change]'); if (!el) return;
    const file = el.files && el.files[0]; if (!file) return;
    try {
      switch (el.dataset.actChange) {
        case 'import': await importAll(file); toast('Sauvegarde restaurée'); route(); break;
        case 'veille': {
          const v = JSON.parse(await file.text());
          await S.put('kv', 'veille', { ...v, importe_le: Date.now() }); renderVeille(); break;
        }
        case 'm-upload': {
          if (!S.Vault.isUnlocked()) throw new Error('Déverrouille d’abord le coffre (Réglages)');
          readForm();
          const blobId = await S.Vault.add(file, { fiche: editing.id }, prefs.vaultMB * MB);
          editing.medias.push({ id: uid('local'), type: 'local', blob_id: blobId, titre: file.name, source: 'Clip perso', auteur: 'Moi', lien: '', timestamp: '', permission: 'perso', statut: 'verifie' });
          rerenderEdit(); toast('Clip chiffré ajouté — pense à enregistrer'); break;
        }
      }
    } catch (err) { console.error(err); toast(err.message || String(err)); }
    el.value = '';
  });
  document.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      if (e.target.id === 'poppt-form') await submitPoppt(e.target);
      if (e.target.id === 'j-form') await submitJournal(e.target);
      if (e.target.dataset && e.target.dataset.plan) { const fd = new FormData(e.target); const p = { neutre: fd.get('neutre').trim(), punition: fd.get('punition').trim(), piege: fd.get('piege').trim() }; await S.put('kv', 'plan:' + e.target.dataset.plan, p); toast('Plan enregistré'); fillPlan(); }
      if (e.target.id === 'edit-form') { readForm(); await S.put('fiches', editing.id, editing); await loadLocal(); toast(T('saved')); location.hash = '#/vs/' + editing.id; }
    } catch (err) { console.error(err); toast(err.message || String(err)); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#quick') && !$('#quick').hidden) $('#quick').hidden = true; });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && location.hash.startsWith('#/vs/')) wakeOn(); });

  /* ---------- Démarrage ---------- */
  PMI18n.set(prefs.lang); applyTheme();
  const vs = new URLSearchParams(location.search).get('vs');           // raccourci : index.html?vs=pikachu
  if (vs === 'last' && prefs.recents[0]) location.replace('#/vs/' + prefs.recents[0]);
  else if (vs && DATA.byId[vs]) location.replace('#/vs/' + vs);
  window.addEventListener('hashchange', route);
  route();                                                              // rendu immédiat depuis le bundle
  performance.mark && performance.mark('prematch-first-render');
  setTimeout(loadCombat, 1500);
  Promise.all([loadLocal(), loadJournal()]).then(([changed]) => { if ((changed || JOURNAL.length) && !location.hash.startsWith('#/admin/') && !location.hash.startsWith('#/drill/')) route(); });
  if ('serviceWorker' in navigator && /^(https?|app):$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW :', err));
  self.PMApp = { get data() { return DATA; }, parseYouTube, parseTs, fmtTs };
})();

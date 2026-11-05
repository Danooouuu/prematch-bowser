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
  const DEFAULTS = { lang: 'fr', theme: 'auto', wakelock: true, cacheMB: 150, vaultMB: 500, favs: ['pikachu', 'peach'], recents: [], combosOpen: true, flash: {}, drillLog: [] };
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
    ${[['home', '#/', '⌂'], ['drills', '#/drills', '⏱'], ['flash', '#/flash', '⧉'], ['admin', '#/admin', '✎'], ['settings', '#/reglages', '⚙']]
      .map(([k, href, ic]) => `<a href="${href}" class="${active === k ? 'on' : ''}"><span aria-hidden="true">${ic}</span>${T('nav_' + k)}</a>`).join('')}</nav>`;
  const top = (title, backHref, extra = '') => `<header class="top">
    ${backHref ? `<a class="icon-btn" href="${backHref}" aria-label="${T('back')}">‹</a>` : `<div class="brand">${T('app')} <span>${T('sub')}</span></div>`}
    ${backHref ? `<h1>${esc(title)}</h1>` : ''}<div class="top-extra">${extra}</div></header>`;
  const meter = d => `<div class="meter ${dClass(d)}" role="img" aria-label="${T('difficulty')} ${d}/10">${Array.from({ length: 10 }, (_, i) => `<i class="${i < d ? 'on' : ''}"></i>`).join('')}<b>${d}/10</b></div>`;
  const goalTag = g => `<span class="goal g-${esc(g)}">${T('goal_' + g)}</span>`;
  const permTag = p => `<span class="perm p-${esc(p)}">${T('perm_' + p)}</span>`;

  /* ---------- Médias / carousel ---------- */
  function mediaSlide(m) {
    let body = '';
    switch (m.type) {
      case 'schema': body = `<div class="schema">${PMSchemas.render(m.schema)}</div>`; break;
      case 'youtube': body = `<button class="yt" data-act="yt" data-vid="${esc(m.video_id)}" data-start="${parseTs(m.timestamp) || m.start || 0}" data-lien="${esc(m.lien)}">
          <img class="yt-thumb" alt="" loading="lazy" referrerpolicy="no-referrer" src="https://i.ytimg.com/vi/${encodeURIComponent(m.video_id)}/hqdefault.jpg" onerror="this.remove()">
          <span class="yt-play" aria-hidden="true">▶</span><span class="yt-label">${navigator.onLine ? T('media_online') : T('media_offline')}${m.timestamp ? ' · à ' + esc(m.timestamp) : ''}</span></button>`; break;
      case 'gif': body = `<div class="gif-box"><img class="gif" alt="${esc(m.titre)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-cache-src="${esc(m.url)}" src="${esc(m.url)}"
          onerror="this.parentElement.classList.add('gif-fail')"><span class="gif-msg">🖼 Image indisponible ici (hors-ligne ou bloquée). Elle se charge depuis ${esc((m.source || '').split(' ')[0] || 'sa source')} dès que tu as du réseau.</span></div>`; break;
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
    const box = $('[data-hb-view]', btn.closest('.moves'));
    $$('.hb-chips .chip', btn.closest('.moves')).forEach(c => c.classList.toggle('on', c === btn));
    box.innerHTML = `<figure class="slide hb-slide">${mediaSlide({ type: 'gif', url: HB.base + m[2], titre: m[0], source: 'SmashWiki (hitbox)', auteur: HB.credit, lien: h.page, permission: 'lien_seulement', statut: 'verifie' }).replace(/^<figure class="slide">|<\/figure>$/g, '')}</figure>`;
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* ---------- Écran : accueil ---------- */
  function muRow(m) {
    return `<a class="mu" href="#/vs/${m.id}"><span class="pill ${dClass(m.difficulte)}">${m.difficulte}</span>
      <span class="mu-name">${esc(m.nom)}${m.fiche ? '<em title="Fiche complète">●</em>' : ''}</span>
      <small>${esc(m.justification)}</small></a>`;
  }
  function search(q) {
    const n = norm(q);
    if (!n) return DATA.matchups;
    return DATA.matchups.filter(m => [m.nom, m.id, ...(m.alias || [])].some(x => norm(x).includes(n)));
  }
  function viewHome() {
    const last = prefs.recents[0] && DATA.byId[prefs.recents[0]];
    const chips = ids => ids.map(id => DATA.byId[id]).filter(Boolean).map(m => `<a class="chip ${dClass(m.difficulte)}" href="#/vs/${m.id}">${esc(m.nom)}</a>`).join('');
    return `${top()}
      <main class="home">
        <a class="prematch" href="${last ? '#/vs/' + last.id : '#/'}" data-act="${last ? '' : 'focus-search'}">
          <span>⚡</span><span>${last ? T('prematch_last', { name: esc(last.nom) }) : T('prematch_none')}</span></a>
        <a class="mine" href="#/vs/bowser">🐢 Mes coups : Bowser en images (hitbox)</a>
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
      <div class="inputs" aria-label="${T('inputs')}">${(c.inputs || []).map(x => `<kbd>${esc(x)}</kbd>`).join('<span class="arr">→</span>')}</div>
      <dl class="cond">
        <div><dt>%</dt><dd>${esc(c.conditions && c.conditions.pourcent)}</dd></div>
        <div><dt>${T('pos')}</dt><dd>${esc(c.conditions && c.conditions.position)}</dd></div>
        <div><dt>${T('di')}</dt><dd>${esc(c.conditions && c.conditions.di)}</dd></div>
      </dl>
      <div class="counter"><h4>🛡 ${T('counters')}</h4><ul>${(c.contre_mesures || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
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
      return `${top(m.nom, '#/', favBtn)}<main class="fiche">${meter(m.difficulte)}
        <p class="lead">${esc(m.justification)}</p><p class="muted">${T('stub')}</p>
        <a class="btn" href="#/admin/${id}">✎ ${T('stub_create')}</a>
        ${movesSection(id, true, id === 'bowser' ? 'Coups de Bowser en images' : 'Ses coups en images')}</main>${nav('')}`;
    }
    const combos = f.combos || [];
    return `${top(f.nom, '#/', favBtn)}
      <main class="fiche">
        <div class="fiche-head">${meter(f.difficulte)}<button class="btn quick" data-act="quick">💡 ${T('quick')}</button></div>
        <section><h2>${T('win')}</h2><ul class="win">${(f.win_conditions || []).slice(0, 4).map(x => `<li>${esc(x)}</li>`).join('')}</ul></section>
        ${carousel(f.medias || [])}
        <details class="sec" data-sec="combos" ${prefs.combosOpen ? 'open' : ''}><summary><h2>${T('combos')} <small>(${combos.length})</small></h2></summary>
          ${combos.map(c => `<details class="combo"><summary><span class="ct">${esc(c.titre)}</span>${goalTag(c.but)}<span class="cp">${esc((c.conditions && c.conditions.pourcent || '').split('(')[0])}</span></summary>${comboBody(f, c, false)}</details>`).join('')}
        </details>
        ${(f.setups || []).length ? `<details class="sec"><summary><h2>${T('setups')}</h2></summary>${f.setups.map(s => `<div class="setup"><b>${esc(s.titre)}</b><p><span class="lbl">${T('reco')}</span> ${esc(s.reconnaitre)}</p><p><span class="lbl ok">${T('answer')}</span> ${esc(s.reponse)}</p></div>`).join('')}</details>` : ''}
        ${movesSection(id, false, 'Tous ses coups en images')}
        <section><h2>${T('tips')}</h2><ol class="tips">${(f.conseils_bowser || []).map(x => `<li>${esc(x)}</li>`).join('')}</ol></section>
        <p class="src muted">Cote : ${esc(m.source_cote)} (${esc(m.cote)}) · ${DATA.edited.has(id) ? 'éditée localement' : 'contenu d’origine ' + esc(BASE.fiches.version)}</p>
      </main>
      <div class="overlay" id="quick" hidden role="dialog" aria-modal="true" aria-label="${T('quick')}">
        <div class="overlay-card"><p class="big">${esc(f.conseil_rapide)}</p>
          <ol>${(f.conseils_bowser || []).map(x => `<li>${esc(x)}</li>`).join('')}</ol>
          <button class="btn" data-act="quick-close">${T('close')}</button></div></div>
      ${nav('')}`;
  }
  function afterFiche() {
    hydrateMedia(app);
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
      <div class="timer"><div class="clock" id="clock">${fmtTs(d.duree_s || 180)}</div>
        <div class="rep" id="rep">${T('rep')} 1 / ${d.repetitions || 1}</div>
        <div class="row"><button class="btn" data-act="t-start">${T('start')}</button><button class="btn ghost" data-act="t-pause">${T('pause')}</button><button class="btn ghost" data-act="t-reset">${T('reset')}</button></div></div>
      <h2>${T('steps')}</h2><ul class="check">${(d.etapes || []).map((s, i) => `<li><label><input type="checkbox" data-step="${i}"> ${esc(s)}</label></li>`).join('')}</ul>
      ${(d.matchups || []).length ? `<p class="chips">${d.matchups.map(mid => DATA.byId[mid]).filter(Boolean).map(m => `<a class="chip ${dClass(m.difficulte)}" href="#/vs/${m.id}">${esc(m.nom)}</a>`).join('')}</p>` : ''}
    </main>${nav('drills')}`;
  }
  function afterDrill(id) {
    const d = DATA.drills.find(x => x.id === id); if (!d) return;
    timer = { d, dur: (d.duree_s || 180) * 1000, left: (d.duree_s || 180) * 1000, rep: 1, run: false, last: 0, h: null };
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
      if (timer.rep < (timer.d.repetitions || 1)) { timer.rep++; timer.left = timer.dur; }
      else { timer.run = false; timer.left = 0; prefs.drillLog = [{ id: timer.d.id, at: Date.now() }, ...prefs.drillLog].slice(0, 200); savePrefs(); toast(T('done')); }
    }
    const c = $('#clock'), r = $('#rep');
    if (c) c.textContent = fmtTs(timer.left / 1000);
    if (r) r.textContent = `${T('rep')} ${timer.rep} / ${timer.d.repetitions || 1}`;
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
      <label>${T('lang')} ${sel('lang', Object.keys(PMI18n.LANGS), prefs.lang, l => PMI18n.LANGS[l])}</label>
      <label>${T('theme')} ${sel('theme', ['auto', 'light', 'dark'], prefs.theme, x => T('theme_' + x))}</label>
      <label class="inline"><input type="checkbox" name="wakelock" ${prefs.wakelock ? 'checked' : ''}> ${T('wakelock')}</label>
      <h2>${T('storage')}</h2>
      <div class="grid2"><label>${T('cache_limit')}<input type="number" name="cacheMB" min="10" max="5000" value="${prefs.cacheMB}"></label>
        <label>${T('vault_limit')}<input type="number" name="vaultMB" min="10" max="10000" value="${prefs.vaultMB}"></label></div>
      <p id="usage" class="muted">…</p>
      <div class="row wrap"><button type="button" class="btn ghost" data-act="dl-offline">⬇ ${T('offline_dl')}</button><button type="button" class="btn ghost" data-act="purge">${T('purge')}</button></div>
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
      sources: (await S.all('sources')).map(r => r.value), prefs, vault: null
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
        case 't-reset': if (timer) { timer.run = false; clearTimeout(timer.h); timer.left = timer.dur; timer.rep = 1; tick(); $('#clock').textContent = fmtTs(timer.dur / 1000); $('#rep').textContent = `${T('rep')} 1 / ${timer.d.repetitions || 1}`; } break;
        case 'hb': showMove(el); break;
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
  loadLocal().then(changed => { if (changed && !location.hash.startsWith('#/admin/')) route(); });
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW :', err));
  self.PMApp = { get data() { return DATA; }, parseYouTube, parseTs, fmtTs };
})();

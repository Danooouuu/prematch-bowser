/* PréMatch — moteur « combat » : % de kill (simulation d'éjection) et punitions hors bouclier.
   Données : data/combat-data.js (rubendal/SSBU-Calculator, licence MIT ; Ultimate Frame Data ; stages LVD).
   Résultats APPROXIMATIFS : pas de staleness, rage optionnelle, DI simplifiée (±18°), adversaire au sol. */
(function () {
  'use strict';
  const D = () => self.PREMATCH_COMBAT;

  /* ---------- Éjection (formules d'Ultimate, alignées sur rubendal/SSBU-Calculator) ---------- */
  const FRESH = 1.05;                         // bonus de fraîcheur d'un coup non usé
  const DI_RAD = 0.17;                        // déviation max de la DI (radians)
  function knockback(p, d, w, bkb, kbg, rage) {
    // p = % de la cible AVANT le coup, d = dégâts de base du coup, w = poids
    const P = p + d * FRESH;
    return ((((P / 10 + P * d * (1 - (1 - FRESH) * 0.3) / 20) * 1.4 * 200 / (w + 100)) + 18) * kbg / 100 + bkb) * rage;
  }
  function sakurai(kb) { return kb < 60 ? 0 : kb >= 88 ? 38 : Math.min((kb - 60) / 28 * 38 + 1, 38); }
  const hitstunOf = kb => Math.floor(Math.max(kb * 0.4, 5)) - 1;
  /* Vol de la cible ; true si elle franchit une zone de mort pendant l'hitstun (règle du calculateur rubendal). */
  function flies(kb, baseAngle, attr, stage, x0, diSign) {
    const [, grav, fall, dftGrav, dftFall] = attr;
    const hs = hitstunOf(kb), tumble = hs + 1 >= 32;
    const dft = tumble && baseAngle >= 70 && baseAngle <= 110;
    const ls = kb * 0.03;
    let vx = ls * Math.cos(baseAngle * Math.PI / 180);
    let vy = ls * Math.sin(baseAngle * Math.PI / 180) + (tumble && !dft ? 5 * (grav - 0.075) : 0);
    let ang = Math.atan2(vy, vx);
    const tot = Math.hypot(vx, vy);
    if (diSign && tumble && Math.abs(ang) >= DI_RAD) ang += diSign * DI_RAD;
    vx = tot * Math.cos(ang); vy = tot * Math.sin(ang);
    const dx = 0.051 * Math.abs(Math.cos(ang)), dy = 0.051 * Math.abs(Math.sin(ang));
    const g1 = dft ? dftGrav : grav, f1 = dft ? dftFall : fall;
    const [L, Rr, T, B] = stage.bz;
    let x = x0, y = 0, g = 0;
    for (let f = 0; f <= hs; f++) {
      const vyNow = vy;
      x += vx; y += vy + Math.max(g, -f1);
      if (x <= L || x >= Rr || y <= B) return true;
      if (y >= T && vyNow >= 2.4) return true;
      vx = Math.sign(vx) * Math.max(Math.abs(vx) - dx, 0);
      vy = Math.sign(vy) * Math.max(Math.abs(vy) - dy, 0);
      g -= g1;
    }
    return false;
  }
  /* % minimal (avant le coup) auquel le coup tue. opts : {stage, pos:'centre'|'bord', di:true, rage:1} */
  function koPercent(mv, tgtId, opts = {}) {
    const C = D(); if (!C) return null;
    const attr = C.attrs[tgtId]; const stage = C.stages[opts.stage || 'Battlefield'];
    if (!attr || !stage || !mv) return null;
    const [, , dmg, ang, bkb, kbg] = mv;
    if (ang > 180 && ang < 361) return null;          // météores / spikes : dépend du hors-stage
    const rage = opts.rage || 1;
    const x0 = opts.pos === 'bord' ? stage.edge - 8 : 0;
    for (let pc = 0; pc <= 300; pc++) {
      const kb = knockback(pc, dmg, attr[0], bkb, kbg, rage);
      let a = ang === 361 ? sakurai(kb) : ang;
      if ((a === 0 || a === 180) && kb >= 120) a = 32;
      const a2 = a > 90 && a <= 180 ? 180 - a : a;   // on lance toujours vers la droite (vers le bord)
      const tries = opts.di === false ? [0] : [-1, 1];
      if (tries.every(sg => flies(kb, a2, attr, stage, x0, sg))) return pc;
    }
    return null;
  }
  /* Meilleurs coups de kill d'un attaquant contre une cible */
  function killTable(atkId, tgtId, opts = {}, limit = 8) {
    const C = D(); const moves = (C && C.kb[atkId]) || [];
    const rows = moves.filter(mv => mv[1] > 0 && mv[1] < 999 && !/pummel|dodge|landing|ledge|getup|footstool/i.test(mv[0]))
      .map(mv => ({ name: mv[0], startup: mv[1], dmg: mv[2], mv, ko: koPercent(mv, tgtId, opts) }))
      .filter(r => r.ko !== null && r.ko <= 220);
    // dédoublonne par nom de coup (garde le meilleur)
    const best = {};
    rows.forEach(r => { const k = r.name.replace(/\s*\(.*?\)\s*$/, ''); if (!best[k] || r.ko < best[k].ko) best[k] = { ...r, name: k }; });
    return Object.values(best).sort((a, b) => a.ko - b.ko).slice(0, limit);
  }

  /* ---------- Punitions hors bouclier ---------- */
  const num = s => { const m = String(s || '').match(/-?\d+/); return m ? parseInt(m[0], 10) : null; };
  // avantage le plus favorable à l'adversaire parmi « -12/-13 » ou « -11 to -2 » : estimation prudente
  const advNum = s => { const m = String(s || '').match(/-?\d+/g); return m ? Math.max(...m.map(Number)) : null; };
  function oosOptions(id) {
    const u = D() && D().ufd[id]; if (!u) return [];
    return u.oos.map(([n, f]) => ({ name: n, frames: f })).sort((a, b) => a.frames - b.frames);
  }
  /* Coups de la cible dont l'avantage sur bouclier est ≤ −(frames de ton option) */
  function punishable(mainId, tgtId) {
    const C = D(); const u = C && C.ufd[tgtId]; const oos = oosOptions(mainId);
    if (!u || !oos.length) return null;
    const fastest = oos[0];
    const grab = oos.find(o => /grab/i.test(o.name));
    const rows = u.moves.map(([name, startup, adv]) => ({ name, startup, adv: advNum(adv) }))
      .filter(r => r.adv !== null && !/grab|throw|pummel|dodge|roll|getup|ledge/i.test(r.name));
    return {
      fastest, grab,
      byFastest: rows.filter(r => r.adv <= -fastest.frames).sort((a, b) => a.adv - b.adv),
      byGrab: grab ? rows.filter(r => r.adv <= -grab.frames).sort((a, b) => a.adv - b.adv) : [],
      safe: rows.filter(r => r.adv > -fastest.frames).sort((a, b) => b.adv - a.adv)
    };
  }
  function fastestMoves(id, n = 5) {
    const u = D() && D().ufd[id]; if (!u) return [];
    return u.moves.map(([name, s]) => ({ name, startup: num(s) })).filter(r => r.startup && r.startup > 0 && !/grab|dodge|roll|getup|ledge|throw|pummel/i.test(r.name))
      .sort((a, b) => a.startup - b.startup).slice(0, n);
  }
  self.PMCombat = { knockback, koPercent, killTable, punishable, oosOptions, fastestMoves, stages: () => Object.keys((D() || {}).stages || {}) };
})();

/* PréMatch — lecteur de GIF maison (canvas).
   Pourquoi : les GIFs de hitbox SmashWiki sont « delta » (chaque image ne redessine qu'une zone de la précédente).
   Avec beaucoup de gros GIFs ouverts, le navigateur libère des images de sa mémoire puis les redécode mal :
   des morceaux du perso ou de la hitbox disparaissent. Ici, on décode nous-mêmes et on compose image par image,
   donc l'affichage reste juste. Bonus : pause, image par image, ralenti. Les GIFs hors écran sont mis en pause
   et ne sont téléchargés qu'au moment où ils deviennent visibles. */
(function () {
  'use strict';

  /* ---------- Décodage ---------- */
  function parse(buf) {
    const b = new Uint8Array(buf);
    if (b[0] !== 0x47 || b[1] !== 0x49 || b[2] !== 0x46) throw new Error('pas un GIF');
    const W = b[6] | b[7] << 8, H = b[8] | b[9] << 8, pk = b[10];
    let i = 13, gct = null;
    if (pk & 0x80) { const n = 1 << ((pk & 7) + 1); gct = b.subarray(i, i + 3 * n); i += 3 * n; }
    const frames = []; let gce = null;
    while (i < b.length) {
      const t = b[i++];
      if (t === 0x21) {
        const lab = b[i++];
        if (lab === 0xF9 && b[i] >= 4) gce = { disp: (b[i + 1] >> 2) & 7, transp: b[i + 1] & 1, delay: b[i + 2] | b[i + 3] << 8, ti: b[i + 4] };
        while (b[i]) i += b[i] + 1; i++;
      } else if (t === 0x2C) {
        const x = b[i] | b[i + 1] << 8, y = b[i + 2] | b[i + 3] << 8, w = b[i + 4] | b[i + 5] << 8, h = b[i + 6] | b[i + 7] << 8, p = b[i + 8];
        i += 9; let pal = gct;
        if (p & 0x80) { const n = 1 << ((p & 7) + 1); pal = b.subarray(i, i + 3 * n); i += 3 * n; }
        const minCode = b[i++]; const parts = []; let len = 0;
        while (b[i]) { parts.push(b.subarray(i + 1, i + 1 + b[i])); len += b[i]; i += b[i] + 1; } i++;
        const data = new Uint8Array(len); let o = 0; for (const s of parts) { data.set(s, o); o += s.length; }
        const g = gce || { disp: 0, transp: 0, delay: 10, ti: 0 };
        frames.push({ x, y, w, h, interlace: !!(p & 0x40), pal, minCode, data, disp: g.disp, transp: g.transp, ti: g.ti, delay: g.delay <= 1 ? 10 : g.delay, px: null });
        gce = null;
      } else break;   // 0x3B = fin, ou octet inattendu
    }
    if (!frames.length) throw new Error('GIF vide');
    return { W, H, frames };
  }
  function lzw(minCode, data, npix) {
    const out = new Uint8Array(npix), prefix = new Uint16Array(4096), suffix = new Uint8Array(4096), stack = new Uint8Array(4097);
    const clear = 1 << minCode, eoi = clear + 1;
    for (let k = 0; k < clear; k++) suffix[k] = k;
    let size = minCode + 1, mask = (1 << size) - 1, next = eoi + 1, datum = 0, bits = 0, pos = 0, op = 0, old = -1, first = 0;
    while (op < npix) {
      while (bits < size) { if (pos >= data.length) return out; datum |= data[pos++] << bits; bits += 8; }
      let code = datum & mask; datum >>>= size; bits -= size;
      if (code === clear) { size = minCode + 1; mask = (1 << size) - 1; next = eoi + 1; old = -1; continue; }
      if (code === eoi) break;
      if (old === -1) { out[op++] = suffix[code]; old = first = code; continue; }
      const inCode = code; let sp = 0;
      if (code >= next) { stack[sp++] = first; code = old; }
      while (code > eoi) { stack[sp++] = suffix[code]; code = prefix[code]; }
      first = suffix[code]; stack[sp++] = first;
      if (next < 4096) { prefix[next] = old; suffix[next] = first; next++; if ((next & mask) === 0 && next < 4096) { size++; mask = (1 << size) - 1; } }
      old = inCode;
      while (sp > 0 && op < npix) out[op++] = stack[--sp];
    }
    return out;
  }
  function pixels(f) {
    if (f.px) return f.px;
    let px = lzw(f.minCode, f.data, f.w * f.h);
    if (f.interlace) {
      const d = new Uint8Array(px.length); let r = 0;
      for (const [s, st] of [[0, 8], [4, 8], [2, 4], [1, 2]]) for (let y = s; y < f.h; y += st) d.set(px.subarray(r++ * f.w, r * f.w), y * f.w);
      px = d;
    }
    f.px = px; f.data = null; return px;
  }

  /* ---------- Lecteur ---------- */
  const SPEEDS = [1, 0.5, 0.25];
  const players = new Set();
  class Player {
    constructor(img, gif) {
      this.img = img; this.g = gif; this.k = -1; this.playing = true; this.speed = 0; this.timer = 0; this.visible = false;
      const box = img.parentElement;
      this.cv = document.createElement('canvas'); this.cv.width = gif.W; this.cv.height = gif.H; this.cv.className = 'gif gif-cv';
      this.cv.setAttribute('role', 'img'); this.cv.setAttribute('aria-label', img.alt || 'GIF');
      this.ctx = this.cv.getContext('2d');
      this.buf = this.ctx.createImageData(gif.W, gif.H); this.saved = null;
      this.bar = document.createElement('div'); this.bar.className = 'gif-bar';
      this.bar.innerHTML = `<button type="button" data-g="prev" aria-label="Image précédente">⏮</button><button type="button" data-g="play" aria-label="Pause">⏸</button><button type="button" data-g="next" aria-label="Image suivante">⏭</button><button type="button" data-g="speed" aria-label="Vitesse">1×</button><span class="gif-n"></span>`;
      img.replaceWith(this.cv); box.appendChild(this.bar); box.classList.add('gif-live');
      this.cv.addEventListener('click', () => this.toggle());
      this.bar.addEventListener('click', e => {
        const a = e.target.closest('button'); if (!a) return; e.stopPropagation();
        const act = a.dataset.g;
        if (act === 'play') this.toggle();
        else if (act === 'speed') { this.speed = (this.speed + 1) % SPEEDS.length; a.textContent = (SPEEDS[this.speed] === 1 ? '1' : SPEEDS[this.speed] === 0.5 ? '½' : '¼') + '×'; }
        else { this.pause(); this.seek((this.k + (act === 'next' ? 1 : -1) + this.g.frames.length) % this.g.frames.length); }
      });
      this.seek(0);
    }
    /* Compose l'image n sur le tampon à partir de l'image courante (ou depuis le début si on recule). */
    compose(n) {
      const fr = this.g.frames, W = this.g.W, d = this.buf.data;
      if (n <= this.k || this.k < 0) { d.fill(0); this.k = -1; this.saved = null; }
      while (this.k < n) {
        const prev = fr[this.k];
        if (prev && prev.disp === 2) for (let y = prev.y; y < prev.y + prev.h; y++) d.fill(0, (y * W + prev.x) * 4, (y * W + prev.x + prev.w) * 4);
        else if (prev && prev.disp === 3 && this.saved) d.set(this.saved);
        const f = fr[++this.k];
        if (f.disp === 3) this.saved = d.slice(); else this.saved = null;
        const px = pixels(f), pal = f.pal; if (!pal) continue;
        for (let y = 0; y < f.h; y++) {
          const gy = f.y + y; if (gy >= this.g.H) break;
          let o = (gy * W + f.x) * 4, s = y * f.w;
          for (let x = 0; x < f.w; x++, o += 4, s++) {
            if (f.x + x >= W) continue;
            const c = px[s]; if (f.transp && c === f.ti) continue;
            d[o] = pal[c * 3]; d[o + 1] = pal[c * 3 + 1]; d[o + 2] = pal[c * 3 + 2]; d[o + 3] = 255;
          }
        }
      }
      this.ctx.putImageData(this.buf, 0, 0);
      const n2 = this.bar.querySelector('.gif-n'); if (n2) n2.textContent = `${this.k + 1}/${this.g.frames.length}`;
    }
    seek(n) { this.compose(n); }
    tick() {
      clearTimeout(this.timer);
      if (!this.playing || !this.visible) return;
      const f = this.g.frames[this.k];
      this.timer = setTimeout(() => { if (!this.cv.isConnected) return this.destroy(); this.compose((this.k + 1) % this.g.frames.length); this.tick(); }, f.delay * 10 / SPEEDS[this.speed]);
    }
    toggle() { this.playing ? this.pause() : this.play(); }
    play() { this.playing = true; this.bar.querySelector('[data-g="play"]').textContent = '⏸'; this.tick(); }
    pause() { this.playing = false; clearTimeout(this.timer); this.bar.querySelector('[data-g="play"]').textContent = '▶'; }
    setVisible(v) { this.visible = v; if (v) this.tick(); else clearTimeout(this.timer); }
    destroy() { clearTimeout(this.timer); io && io.unobserve(this.cv); players.delete(this); }
  }

  /* ---------- Branchement : <img class="gif" data-gif="url"> ---------- */
  const resolveUrl = async u => {
    try { const S = self.PMStore; const c = S && S.MediaCache && await S.MediaCache.url(u); if (c) return c; } catch (e) { }
    return u;
  };
  async function upgrade(img) {
    const url = img.dataset.gif;
    try {
      const r = await fetch(await resolveUrl(url), { mode: 'cors' });
      if (!r.ok) throw new Error(r.status);
      const gif = parse(await r.arrayBuffer());
      if (!img.isConnected) return;
      const p = new Player(img, gif); players.add(p); io.observe(p.cv); p.cv._pmPlayer = p;
    } catch (e) {
      // repli : l'image classique du navigateur
      if (img.isConnected) { img.onerror = () => img.parentElement && img.parentElement.classList.add('gif-fail'); img.src = url; }
    }
  }
  const io = 'IntersectionObserver' in self ? new IntersectionObserver(entries => entries.forEach(en => {
    const el = en.target;
    if (el.tagName === 'IMG') { if (en.isIntersecting && !el._pmLoading) { el._pmLoading = true; io.unobserve(el); upgrade(el); } }
    else if (el._pmPlayer) el._pmPlayer.setVisible(en.isIntersecting && document.visibilityState === 'visible');
  }), { rootMargin: '150px' }) : null;
  function scan(root) {
    for (const p of [...players]) if (!p.cv.isConnected) p.destroy();
    (root || document).querySelectorAll('img.gif[data-gif]:not([data-gif-seen])').forEach(img => {
      img.setAttribute('data-gif-seen', '');
      if (io) io.observe(img); else upgrade(img);
    });
  }
  document.addEventListener('visibilitychange', () => players.forEach(p => {
    if (document.visibilityState !== 'visible') p.setVisible(false);
    else { const r = p.cv.getBoundingClientRect(); p.setVisible(r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth); }
  }));
  new MutationObserver(() => scan()).observe(document.documentElement, { childList: true, subtree: true });
  self.PMGif = { scan, parse, lzw };
})();

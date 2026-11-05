/* PréMatch — stockage local : IndexedDB + coffre chiffré (WebCrypto AES-GCM 256, clé PBKDF2).
   Aucune dépendance. La clé du coffre ne quitte jamais la mémoire de l'onglet. */
(function () {
  'use strict';
  const DB_NAME = 'prematch';
  const DB_VERSION = 1;
  // fiches   : surcharge éditée par l'admin (clé = id de fiche)
  // drills   : drills ajoutés / importés (clé = id)
  // sources  : surcharge des sources (clé = id)
  // vault    : médias utilisateur chiffrés (clé = id)
  // mcache   : médias distants mis en cache hors-ligne (clé = url) — non chiffrés, contenu public
  // kv       : divers (méta du coffre, veille importée…)
  const STORES = ['fiches', 'drills', 'sources', 'vault', 'mcache', 'kv'];
  let dbp = null;

  function db() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      if (!('indexedDB' in self)) return reject(new Error('IndexedDB indisponible'));
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        for (const s of STORES) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }

  async function tx(store, mode, fn) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const t = d.transaction(store, mode);
      const s = t.objectStore(store);
      let out;
      Promise.resolve(fn(s)).then(r => { out = r; });
      t.oncomplete = () => resolve(out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('transaction annulée'));
    });
  }
  const wrap = req => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

  const get = (store, key) => tx(store, 'readonly', s => wrap(s.get(key)));
  const put = (store, key, val) => tx(store, 'readwrite', s => wrap(s.put(val, key)));
  const del = (store, key) => tx(store, 'readwrite', s => wrap(s.delete(key)));
  const clear = store => tx(store, 'readwrite', s => wrap(s.clear()));
  async function all(store) {
    return tx(store, 'readonly', s => new Promise((res, rej) => {
      const out = [];
      const req = s.openCursor();
      req.onsuccess = () => { const c = req.result; if (c) { out.push({ key: c.key, value: c.value }); c.continue(); } else res(out); };
      req.onerror = () => rej(req.error);
    }));
  }

  /* ---------- Coffre chiffré ---------- */
  const enc = new TextEncoder();
  const PBKDF2_ITER = 250000;
  let vaultKey = null;

  async function deriveKey(passphrase, salt, iter) {
    const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function encryptBuf(key, buf) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, buf);
    return { iv, data };
  }
  const decryptBuf = (key, iv, data) => crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);

  const Vault = {
    available: () => !!(self.crypto && crypto.subtle),
    async exists() { return !!(await get('kv', 'vault-meta')); },
    isUnlocked: () => !!vaultKey,
    async create(passphrase) {
      if (!passphrase || passphrase.length < 8) throw new Error('Phrase secrète : 8 caractères minimum');
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const key = await deriveKey(passphrase, salt, PBKDF2_ITER);
      const check = await encryptBuf(key, enc.encode('prematch-ok'));
      await put('kv', 'vault-meta', { salt, iter: PBKDF2_ITER, check, created: Date.now() });
      vaultKey = key;
    },
    async unlock(passphrase) {
      const meta = await get('kv', 'vault-meta');
      if (!meta) throw new Error('Aucun coffre');
      const key = await deriveKey(passphrase, meta.salt, meta.iter);
      try { await decryptBuf(key, meta.check.iv, meta.check.data); } catch (e) { throw new Error('Phrase secrète incorrecte'); }
      vaultKey = key;
    },
    lock() { vaultKey = null; },
    async destroy() { vaultKey = null; await clear('vault'); await del('kv', 'vault-meta'); },
    async add(file, meta, limitBytes) {
      if (!vaultKey) throw new Error('Coffre verrouillé');
      const used = await Vault.size();
      if (limitBytes && used + file.size > limitBytes) throw new Error('Limite de stockage du coffre atteinte (Réglages → Stockage)');
      const buf = await file.arrayBuffer();
      const { iv, data } = await encryptBuf(vaultKey, buf);
      const id = 'local-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      await put('vault', id, { iv, data, mime: file.type || 'application/octet-stream', name: file.name, size: file.size, created: Date.now(), meta });
      return id;
    },
    async url(id) {
      if (!vaultKey) return null;
      const rec = await get('vault', id);
      if (!rec) return null;
      const buf = await decryptBuf(vaultKey, rec.iv, rec.data);
      return URL.createObjectURL(new Blob([buf], { type: rec.mime }));
    },
    async size() { return (await all('vault')).reduce((n, r) => n + (r.value.size || 0), 0); },
    async list() { return (await all('vault')).map(r => ({ id: r.key, name: r.value.name, size: r.value.size, mime: r.value.mime, meta: r.value.meta })); },
    remove: id => del('vault', id),
    async exportEncrypted() {
      // Export brut : reste chiffré, restaurable uniquement avec la même phrase secrète.
      const meta = await get('kv', 'vault-meta');
      const items = (await all('vault')).map(r => ({ id: r.key, ...r.value, iv: b64(r.value.iv), data: b64(new Uint8Array(r.value.data)) }));
      return meta ? { meta: { ...meta, salt: b64(meta.salt), check: { iv: b64(meta.check.iv), data: b64(new Uint8Array(meta.check.data)) } }, items } : null;
    },
    async importEncrypted(dump) {
      if (!dump || !dump.meta) return;
      const m = dump.meta;
      await put('kv', 'vault-meta', { ...m, salt: unb64(m.salt), check: { iv: unb64(m.check.iv), data: unb64(m.check.data).buffer } });
      for (const it of dump.items || []) await put('vault', it.id, { ...it, iv: unb64(it.iv), data: unb64(it.data).buffer });
      vaultKey = null;
    }
  };

  function b64(u8) { let s = ''; u8 = u8 instanceof Uint8Array ? u8 : new Uint8Array(u8); for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
  function unb64(s) { const bin = atob(s); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return u8; }

  /* ---------- Cache médias distants (LRU, limite configurable) ---------- */
  const MediaCache = {
    async size() { return (await all('mcache')).reduce((n, r) => n + (r.value.size || 0), 0); },
    async has(url) { return !!(await get('mcache', url)); },
    async url(src) {
      const rec = await get('mcache', src);
      if (!rec) return null;
      rec.lastUsed = Date.now();
      put('mcache', src, rec).catch(() => {});
      return URL.createObjectURL(rec.blob);
    },
    async fetchAndStore(src, limitBytes) {
      const res = await fetch(src, { mode: 'cors' });   // échoue si l'hébergeur refuse : on garde alors le lien
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const blob = await res.blob();
      if (limitBytes && blob.size > limitBytes) throw new Error('Fichier plus grand que la limite de cache');
      await MediaCache.evict(limitBytes - blob.size);
      await put('mcache', src, { blob, size: blob.size, lastUsed: Date.now(), added: Date.now() });
      return blob.size;
    },
    async evict(targetBytes) {
      const items = (await all('mcache')).sort((a, b) => a.value.lastUsed - b.value.lastUsed);
      let total = items.reduce((n, r) => n + r.value.size, 0);
      for (const it of items) { if (total <= targetBytes) break; await del('mcache', it.key); total -= it.value.size; }
    },
    clear: () => clear('mcache')
  };

  self.PMStore = { get, put, del, all, clear, Vault, MediaCache, b64, unb64 };
})();

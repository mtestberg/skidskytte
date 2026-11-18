// Databaslager med ett litet gemensamt gränssnitt:
//   now(), set(path, v), update(path, obj), remove(path), get(path),
//   on(path, cb) → avsluta(), push(path, v) → id, onDisconnectRemove(path),
//   topBy(path, child, n) → [{ id, ...värde }] stigande.
//
// FirebaseDB: Firebase Realtime Database (spelet över nätet).
// LocalDB:    samma gränssnitt mellan flikar på samma enhet (BroadcastChannel).
//             Används när Firebase inte är konfigurerat, och i automatiska tester.

import { FIREBASE_CONFIG } from './config.js?v=202611182109';

// Platshållare som byts mot serverns klocka (Firebase serverTimestamp)
export const SERVER_TIME = '__server_time__';

const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';

export async function connect() {
  if (FIREBASE_CONFIG && FIREBASE_CONFIG.databaseURL) {
    try {
      const db = new FirebaseDB();
      await Promise.race([
        db.init(FIREBASE_CONFIG),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000)),
      ]);
      return db;
    } catch (e) {
      console.warn('Firebase gick inte att nå, kör lokalt läge', e);
    }
  }
  return new LocalDB();
}

// För tester: tvinga lokalt läge
export async function connectLocal() {
  return new LocalDB();
}

// ---------------------------------------------------------------- Firebase
class FirebaseDB {
  constructor() {
    this.online = true;
    this.kind = 'firebase';
    this.offset = 0;
  }

  async init(config) {
    const [appMod, dbMod] = await Promise.all([
      import(FB + 'firebase-app.js'),
      import(FB + 'firebase-database.js'),
    ]);
    this.m = dbMod;
    const app = appMod.initializeApp(config);
    this.db = dbMod.getDatabase(app);
    dbMod.onValue(dbMod.ref(this.db, '.info/serverTimeOffset'), (s) => { this.offset = s.val() || 0; });
  }

  ref(path) { return this.m.ref(this.db, path); }
  now() { return Date.now() + this.offset; }
  set(path, v) { return this.m.set(this.ref(path), v); }
  update(path, obj) { return this.m.update(this.ref(path), obj); }
  remove(path) { return this.m.remove(this.ref(path)); }
  async get(path) { const s = await this.m.get(this.ref(path)); return s.val(); }
  on(path, cb) { return this.m.onValue(this.ref(path), (s) => cb(s.val())); }
  async push(path, v) { const r = this.m.push(this.ref(path)); await this.m.set(r, v); return r.key; }
  onDisconnectRemove(path) { return this.m.onDisconnect(this.ref(path)).remove(); }
  onDisconnectUpdate(path, obj) {
    const o = {};
    for (const [k, v] of Object.entries(obj)) o[k] = v === SERVER_TIME ? this.m.serverTimestamp() : v;
    return this.m.onDisconnect(this.ref(path)).update(o);
  }
  // cb(true/false) när anslutningen till Firebase kommer/går (t.ex. när telefonen byter app)
  onConnected(cb) { return this.m.onValue(this.ref('.info/connected'), (s) => cb(!!s.val())); }
  async topBy(path, child, n) {
    const q = this.m.query(this.ref(path), this.m.orderByChild(child), this.m.limitToFirst(n));
    const s = await this.m.get(q);
    const out = [];
    s.forEach((c) => { out.push({ id: c.key, ...c.val() }); });
    return out;
  }
}

// ---------------------------------------------------------------- Lokal
const split = (p) => p.split('/').filter(Boolean);
const clone = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));

function getAt(tree, parts) {
  let n = tree;
  for (const k of parts) { if (n == null || typeof n !== 'object') return null; n = n[k]; }
  return n === undefined ? null : n;
}

function setAt(tree, parts, v) {
  let n = tree;
  for (let i = 0; i < parts.length - 1; i++) {
    if (n[parts[i]] == null || typeof n[parts[i]] !== 'object') n[parts[i]] = {};
    n = n[parts[i]];
  }
  const last = parts[parts.length - 1];
  if (v == null) delete n[last];
  else n[last] = v;
}

class LocalDB {
  constructor() {
    this.online = false;
    this.kind = 'local';
    this.tree = {};
    this.listeners = new Set();
    this.mine = []; // sökvägar att ta bort när fliken stängs
    try {
      const saved = JSON.parse(localStorage.getItem('skidskytte.localdb') || '{}');
      for (const [k, v] of Object.entries(saved)) if (k === 'ghosts' || k.startsWith('leaderboard')) this.tree[k] = v || {};
    } catch { /* ignorera */ }
    try {
      this.ch = new BroadcastChannel('skidskytte-local');
      this.ch.onmessage = (e) => this.recv(e.data);
      this.ch.postMessage({ t: 'hello' });
    } catch { this.ch = null; }
    this.mineUpd = [];
    window.addEventListener('pagehide', () => {
      for (const p of this.mine) this.op({ t: 'set', p, v: null });
      for (const [p, obj] of this.mineUpd) {
        const o = {};
        for (const [k, v] of Object.entries(obj)) o[k] = v === SERVER_TIME ? Date.now() : v;
        this.op({ t: 'update', p, v: o });
      }
    });
  }

  recv(m) {
    if (m.t === 'hello') { this.ch.postMessage({ t: 'sync', rooms: this.tree.rooms || {} }); return; }
    if (m.t === 'sync') {
      // slå ihop rum vi inte redan känner till
      this.tree.rooms = this.tree.rooms || {};
      for (const [k, v] of Object.entries(m.rooms || {})) if (!this.tree.rooms[k]) this.tree.rooms[k] = v;
      this.notify();
      return;
    }
    this.apply(m);
  }

  apply(m) {
    const parts = split(m.p);
    if (m.t === 'set') setAt(this.tree, parts, clone(m.v));
    else if (m.t === 'update') for (const [k, v] of Object.entries(m.v)) setAt(this.tree, [...parts, ...split(k)], clone(v));
    this.persist();
    this.notify();
  }

  op(m) {
    this.apply(m);
    if (this.ch) this.ch.postMessage(m);
  }

  persist() {
    try {
      const keep = Object.fromEntries(Object.entries(this.tree).filter(([k]) => k === 'ghosts' || k.startsWith('leaderboard')));
      localStorage.setItem('skidskytte.localdb', JSON.stringify(keep));
    } catch { /* ignorera */ }
  }

  notify() {
    for (const l of this.listeners) {
      const v = getAt(this.tree, l.parts);
      const s = JSON.stringify(v);
      if (s !== l.last) { l.last = s; l.cb(clone(v)); }
    }
  }

  now() { return Date.now(); }
  async set(path, v) { this.op({ t: 'set', p: path, v }); }
  async update(path, obj) { this.op({ t: 'update', p: path, v: obj }); }
  async remove(path) { this.op({ t: 'set', p: path, v: null }); }
  async get(path) { return clone(getAt(this.tree, split(path))); }
  on(path, cb) {
    const l = { parts: split(path), cb, last: undefined };
    this.listeners.add(l);
    setTimeout(() => this.notify(), 0);
    return () => this.listeners.delete(l);
  }
  async push(path, v) {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    await this.set(path + '/' + id, v);
    return id;
  }
  async onDisconnectRemove(path) { this.mine.push(path); }
  async onDisconnectUpdate(path, obj) { this.mineUpd.push([path, obj]); }
  onConnected(cb) { setTimeout(() => cb(true), 0); return () => {}; }
  async topBy(path, child, n) {
    const o = getAt(this.tree, split(path)) || {};
    return Object.entries(o)
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => a[child] - b[child])
      .slice(0, n);
  }
}

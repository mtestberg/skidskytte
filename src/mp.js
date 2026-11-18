// Multiplayer: rum, spelare, placering och spöken.
//
// Datamodell (Firebase Realtime Database eller LocalDB):
//   rooms/{KOD}                 { created, startAt?, raceId }
//   rooms/{KOD}/players/{id}    { name, color, ready, joinedAt, status, live?, result? }
//        status: 'lobby' | 'racing' | 'done'
//        live:   { p: framsteg i meter, st: 's'|'r'|'p', pd: meter på straffrundan }
//        result: { time, misses, raceId }
//   leaderboard/{id}            { name, time, misses, ts, ghost? }
//   ghosts/{id}                 "p,st,pd;p,st,pd;…" (ett prov per sekund)

export const COLORS = [0xe63946, 0x2a9d8f, 0xf4a261, 0x8e44ad, 0x2b6cb0, 0x43aa8b, 0xe76f51, 0x6d597a];
export const COLOR_CSS = (c) => '#' + c.toString(16).padStart(6, '0');

export const START_DELAY_MS = 10000;
const ROOM_TTL_MS = 12 * 3600 * 1000; // rum som inte använts på 12 h städas bort
export const STALE_MS = 60000; // frånkopplad längre än så → tas bort ur rummet
import { SERVER_TIME } from './net.js?v=202611181940';

export function makeCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let s = '';
  for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}

export function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

export class Room {
  constructor(db, code, me) {
    this.db = db;
    this.code = code;
    this.me = me; // { id, name }
    this.path = `rooms/${code}`;
    this.data = null;
    this.unsub = null;
  }

  async exists() {
    return (await this.db.get(this.path)) != null;
  }

  async create() {
    await this.db.update(this.path, { created: this.db.now(), touched: this.db.now(), raceId: 0 });
  }

  // Städning: tar bort rum som inte använts på ROOM_TTL_MS (körs när någon skapar ett rum).
  // Rum utan "touched" är gamla rum från före städningen och tas också bort.
  static async cleanup(db) {
    try {
      const old = await db.topBy('rooms', 'touched', 25);
      const limit = db.now() - ROOM_TTL_MS;
      await Promise.all(old.filter((r) => !(r.touched > limit)).map((r) => db.remove(`rooms/${r.id}`)));
      return old.filter((r) => !(r.touched > limit)).length;
    } catch {
      return 0; // t.ex. om databasreglerna ännu inte tillåter frågan – inget viktigt
    }
  }

  async join() {
    const players = (await this.db.get(this.path + '/players')) || {};
    const used = new Set(Object.values(players).map((p) => p.color));
    const color = COLORS.find((c) => !used.has(c)) ?? COLORS[Object.keys(players).length % COLORS.length];
    this.me.color = color;
    this.joinedAt = this.db.now();
    await this.db.update(this.path, { touched: this.db.now() });
    await this.register('lobby');
    // Tappas anslutningen (skärmen släcks, man byter app för att dela koden …) tar Firebase
    // bort spelaren. Då registrerar vi oss igen när anslutningen kommer tillbaka – som
    // "inte redo", så att ingen start sker utan att man själv tryckt Redo igen.
    this.offConn = this.db.onConnected((on) => {
      if (on && this.joined && !this.leaving) this.rejoin();
    });
    this.joined = true;
  }

  async register(status) {
    const pp = `${this.path}/players/${this.me.id}`;
    await this.db.set(pp, { name: this.me.name, color: this.me.color, ready: false, joinedAt: this.joinedAt, status, online: true });
    await this.armDisconnect();
  }

  // Vid tappad anslutning: markera mig som frånkopplad och inte redo (tas inte bort direkt)
  armDisconnect() {
    return this.db.onDisconnectUpdate(`${this.path}/players/${this.me.id}`, { online: false, ready: false, offlineAt: SERVER_TIME });
  }

  // Lägg tillbaka mig själv om min post försvunnit (efter tappad anslutning)
  async rejoin() {
    if (this.rejoining || this.leaving) return;
    this.rejoining = true;
    try {
      const cur = await this.db.get(`${this.path}/players/${this.me.id}`);
      if (!cur) await this.register(this.localStatus || 'lobby');
      else {
        await this.db.update(`${this.path}/players/${this.me.id}`, { online: true, offlineAt: null });
        await this.armDisconnect();
      }
    } finally {
      this.rejoining = false;
    }
  }

  listen(cb) {
    this.unsub = this.db.on(this.path, (d) => { this.data = d; cb(d); });
  }

  players() {
    const ps = this.data?.players || {};
    return Object.entries(ps)
      .map(([id, p]) => ({ id, ...p }))
      .sort((a, b) => a.joinedAt - b.joinedAt);
  }

  // Värd = den uppkopplade spelare som gick in först
  isHost() {
    const ps = this.players().filter((p) => p.online !== false);
    return ps.length > 0 && ps[0].id === this.me.id;
  }

  mine() {
    return this.data?.players?.[this.me.id] || null;
  }

  // Värden: om alla är i lobbyn och har tryckt Redo → sätt starttid om 10 s
  maybeStart() {
    if (!this.isHost() || !this.data) return;
    if (!this.mine()) return; // jag finns inte i rummet just nu (återansluter)
    // Städa bort spelare som varit frånkopplade länge (stängt fliken)
    const now = this.db.now();
    for (const p of this.players()) {
      if (p.online === false && p.offlineAt && now - p.offlineAt > STALE_MS) this.db.remove(`${this.path}/players/${p.id}`);
    }
    const ps = this.players().filter((p) => !(p.online === false && p.offlineAt && now - p.offlineAt > STALE_MS));
    if (!ps.length) return;
    // Alla i rummet – även tillfälligt frånkopplade – måste ha tryckt Redo
    const allReady = ps.every((p) => p.ready && p.status === 'lobby' && p.online !== false);
    const pending = this.data.startAt && this.data.startAt > this.db.now() - 1000;
    // Någon ny (eller frånkopplad som kommit tillbaka) väntar i lobbyn utan att vara redo
    // under nedräkningen → avbryt, så att ingen blir lämnad kvar
    if (pending && this.data.startAt > now && ps.some((p) => p.status === 'lobby' && !p.ready && p.online !== false)) {
      this.db.update(this.path, { startAt: null });
      return;
    }
    if (allReady && !pending) {
      this.db.update(this.path, { startAt: this.db.now() + (this.delay || START_DELAY_MS), raceId: (this.data.raceId || 0) + 1, touched: this.db.now() });
    }
  }

  setReady(v) { return this.db.update(`${this.path}/players/${this.me.id}`, { ready: v }); }
  setStatus(s) { this.localStatus = s; return this.db.update(`${this.path}/players/${this.me.id}`, { status: s }); }
  startRacing() {
    this.localStatus = 'racing';
    return this.db.update(`${this.path}/players/${this.me.id}`, { status: 'racing', ready: false, result: null, live: { p: 0, st: 's', pd: 0 } });
  }
  sendLive(live) { return this.db.update(`${this.path}/players/${this.me.id}`, { live }); }
  sendResult(result) {
    this.localStatus = 'done';
    return this.db.update(`${this.path}/players/${this.me.id}`, { status: 'done', result, live: { p: result.progress, st: 'f', pd: 0 } });
  }
  async leave() {
    this.leaving = true;
    if (this.unsub) this.unsub();
    if (this.offConn) this.offConn();
    await this.db.remove(`${this.path}/players/${this.me.id}`);
  }
}

// Placering: de i mål efter tid, övriga efter framsteg.
export function standings(entries) {
  return [...entries].sort((a, b) => {
    if (a.done && b.done) return a.time - b.time;
    if (a.done) return -1;
    if (b.done) return 1;
    return b.progress - a.progress;
  });
}

// ---------- Spöken ----------
export class GhostRecorder {
  constructor() { this.samples = []; this.next = 0; }
  sample(t, p, st, pd) {
    while (t >= this.next) {
      this.samples.push(`${Math.round(p)},${st},${Math.round(pd)}`);
      this.next += 1;
    }
  }
  encode() { return this.samples.join(';'); }
}

export function decodeGhost(str) {
  if (!str) return null;
  return str.split(';').map((s) => {
    const [p, st, pd] = s.split(',');
    return { p: +p, st, pd: +pd };
  });
}

// Spökets läge vid tid t (sekunder)
export function ghostAt(g, t) {
  if (!g || !g.length) return null;
  if (t >= g.length - 1) return { ...g[g.length - 1], done: true };
  const i = Math.floor(t), f = t - i;
  const a = g[i], b = g[i + 1];
  const same = a.st === b.st;
  return {
    p: a.p + (b.p - a.p) * f,
    st: a.st,
    pd: same ? a.pd + (b.pd - a.pd) * f : a.pd,
    done: false,
  };
}

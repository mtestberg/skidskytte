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
    await this.db.update(this.path, { created: this.db.now(), raceId: 0 });
  }

  async join() {
    const players = (await this.db.get(this.path + '/players')) || {};
    const used = new Set(Object.values(players).map((p) => p.color));
    const color = COLORS.find((c) => !used.has(c)) ?? COLORS[Object.keys(players).length % COLORS.length];
    this.me.color = color;
    const pp = `${this.path}/players/${this.me.id}`;
    await this.db.set(pp, { name: this.me.name, color, ready: false, joinedAt: this.db.now(), status: 'lobby' });
    await this.db.onDisconnectRemove(pp);
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

  isHost() {
    const ps = this.players();
    return ps.length > 0 && ps[0].id === this.me.id;
  }

  mine() {
    return this.data?.players?.[this.me.id] || null;
  }

  // Värden: om alla är i lobbyn och har tryckt Redo → sätt starttid om 10 s
  maybeStart() {
    if (!this.isHost() || !this.data) return;
    const ps = this.players();
    if (!ps.length) return;
    const allReady = ps.every((p) => p.ready && p.status === 'lobby');
    const pending = this.data.startAt && this.data.startAt > this.db.now() - 1000;
    if (allReady && !pending) {
      this.db.update(this.path, { startAt: this.db.now() + START_DELAY_MS, raceId: (this.data.raceId || 0) + 1 });
    }
  }

  setReady(v) { return this.db.update(`${this.path}/players/${this.me.id}`, { ready: v }); }
  setStatus(s) { return this.db.update(`${this.path}/players/${this.me.id}`, { status: s }); }
  startRacing() {
    return this.db.update(`${this.path}/players/${this.me.id}`, { status: 'racing', ready: false, result: null, live: { p: 0, st: 's', pd: 0 } });
  }
  sendLive(live) { return this.db.update(`${this.path}/players/${this.me.id}`, { live }); }
  sendResult(result) {
    return this.db.update(`${this.path}/players/${this.me.id}`, { status: 'done', result, live: { p: result.progress, st: 'f', pd: 0 } });
  }
  async leave() {
    if (this.unsub) this.unsub();
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

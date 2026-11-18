import { makeTransit } from './paths.js?v=202611182109';
// Bana: en sluten slinga på exakt LAP_LEN meter med höjdprofil.
// Två källor:
//  - inbakad bana (data/course.json från tools/build-course.mjs): riktigt spår + höjdkarta
//  - procedurell reservbana när ingen inbakad data finns

export const LAP_LEN = 2000;      // damsprint/-stafettsträcka 6 km = 3 × 2 km
export const LAPS = 3;
export const PENALTY_LEN = 150;
export const TIME_SCALE = 5;      // åkningen går 5× fortare än verklig fart (lopp ≈ 4–5 min)
export const JOIN_S = 130; // var man kommer ut på banan igen efter vallen/straffrundan (förbi straffrundan)
export const PEN_U = 75;   // straffrundans mitt längs stadion (vid sidan av läktaren, inte framför vallen)
export const PENALTY_RADIUS = PENALTY_LEN / (2 * Math.PI);
export const FINISH_LEN = 200;   // upploppsraka efter sista varvet
export const SHORT_LAP = 1500;   // kortare varv (masstart) via en genväg i slingan

export function proceduralHeight(x, z) {
  return (
    10 * Math.sin(x / 170 + 0.7) * Math.cos(z / 210) +
    6 * Math.sin((x + z) / 105) +
    2 * Math.cos((x - 2 * z) / 60) +
    1.5 * Math.sin(x / 23) * Math.sin(z / 29)
  );
}

function rawPath(u) {
  const a = u * Math.PI * 2;
  const r = 300 + 55 * Math.sin(3 * a + 0.5) + 30 * Math.cos(5 * a + 1.2);
  return [Math.cos(a) * r * 1.2, Math.sin(a) * r * 0.8];
}

// Hämta inbakad bana om den finns (annars null → procedurell)
export async function loadCourseData(url = 'data/courses/grandbornand.json') {
  try {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

export class Course {
  constructor(data = null, cfg = null) {
    this.data = data;
    this.cfg = cfg;
    this.id = cfg?.id || 'grandbornand';
    this.env = cfg?.env || {};
    const LOOP = cfg?.loop || LAP_LEN;
    this.name = data?.name || 'Procedurell bana';
    // 1. Rå punkter (+ höjd för inbakad bana) och kumulativ längd
    const raw = [];
    if (data) {
      for (const p of data.path) raw.push([p[0], p[1], p[2]]);
      raw.push(raw[0]);
    } else {
      const N = 4000;
      for (let i = 0; i <= N; i++) raw.push(rawPath(i / N));
    }
    let total = 0;
    const cum = [0];
    for (let i = 1; i < raw.length; i++) {
      total += Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]);
      cum.push(total);
    }
    // Skala så att varvet blir exakt banans slingläng (riktiga banan skalas bara några procent)
    const k = LOOP / total;
    this.k = k;
    this.hm = data?.terrain || null;
    // 2. Sampla jämnt var 1 m
    this.n = LOOP;
    this.xs = new Float32Array(this.n);
    this.zs = new Float32Array(this.n);
    this.es = new Float32Array(this.n);
    let e = new Float32Array(this.n);
    let j = 0;
    for (let i = 0; i < this.n; i++) {
      const target = i / k;
      while (j < cum.length - 2 && cum[j + 1] < target) j++;
      const f = (target - cum[j]) / (cum[j + 1] - cum[j] || 1);
      this.xs[i] = (raw[j][0] + (raw[j + 1][0] - raw[j][0]) * f) * k;
      this.zs[i] = (raw[j][1] + (raw[j + 1][1] - raw[j][1]) * f) * k;
      if (data) e[i] = raw[j][2] + (raw[j + 1][2] - raw[j][2]) * f;
    }
    // 3. Höjd (från terrängen för procedurell bana), utjämnad
    if (!data) for (let i = 0; i < this.n; i++) e[i] = proceduralHeight(this.xs[i], this.zs[i]);
    for (let pass = 0; pass < (data ? 2 : 3); pass++) {
      const out = new Float32Array(this.n);
      const w = data ? 12 : 30;
      for (let i = 0; i < this.n; i++) {
        let s = 0;
        for (let d = -w; d <= w; d++) s += e[(i + d + this.n) % this.n];
        out[i] = s / (2 * w + 1);
      }
      e = out;
    }
    // 4. Platt stadion runt s = 0
    const e0 = e[0];
    // Begränsa lutningen in mot stadion (12 %) innan stadion plattas till
    if (data) for (let i = 0; i < this.n; i++) {
      const d = Math.min(i, this.n - i);
      e[i] = Math.min(e0 + 0.12 * d, Math.max(e0 - 0.12 * d, e[i]));
    }
    for (let i = 0; i < this.n; i++) {
      const d = Math.min(i, this.n - i);
      // inbakad bana: lång övergång så att stadion inte skapar en brant vägg
      const t = data ? smooth(140, 40, d) : smooth(80, 30, d);
      e[i] = e[i] * (1 - t) + e0 * t;
    }
    // Lutningsbegränsning (data-banor): jämna ut partier brantare än 14 % (t.ex. backen
    // ner mot stadion där stadion plattas till). Stadion (±40 m) ligger fast.
    if (data) {
      const G = 0.14, n = this.n;
      for (let pass = 0; pass < 400; pass++) {
        let changed = false;
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n, ex = e[j] - e[i];
          if (Math.abs(ex) <= G) continue;
          const fix = (Math.abs(ex) - G) / 2 * Math.sign(ex);
          const pi = Math.min(i, n - i) < 40, pj = Math.min(j, n - j) < 40;
          if (!pi) e[i] += pj ? fix * 2 : fix;
          if (!pj) e[j] -= pi ? fix * 2 : fix;
          changed = true;
        }
        if (!changed) break;
      }
    }
    this.es = e;
    this.stadiumElev = e0;

    // Stadion: skjutvall åt ena sidan, straffrunda åt andra
    const [tx, tz] = this.tangentAt(0);
    this.normal = [-tz, tx];
    this.stadium = [this.xs[0], this.zs[0]];
    this.rangePos = [this.stadium[0] + this.normal[0] * 22, this.stadium[1] + this.normal[1] * 22];
    this.penaltyCenter = [
      this.stadium[0] - this.normal[0] * (PENALTY_RADIUS + 14) + tx * PEN_U,
      this.stadium[1] - this.normal[1] * (PENALTY_RADIUS + 14) + tz * PEN_U,
    ];
    this.penaltyA0 = Math.atan2(this.normal[1], this.normal[0]);
    this.startDir = [tx, tz];
    // Läktaren står på andra sidan spåret mitt emot skjutvallen och blickar ut över den:
    // läktare – spår – mattor – tavlor (som på riktiga arenor). Straffrundan ligger vid
    // sidan av läktaren, så den skymmer inte vallen.
    this.grandstandZone = this.pickGrandstand();

    // Grova punkter för avståndsberäkning (terräng, träd)
    this.coarse = [];
    for (let i = 0; i < this.n; i += 4) this.coarse.push([this.xs[i], this.zs[i], this.es[i]]);
    for (let i = 0; i < 64; i++) {
      const p = this.penaltyPoint(i / 64 * PENALTY_LEN);
      this.coarse.push([p[0], p[2], e0]);
    }
    // Upploppsrakan: rakt fram från stadion längs startriktningen
    this.finishDir = [tx, tz];
    for (let d = 0; d <= FINISH_LEN + 20; d += 4) {
      const p = this.finishPoint(d);
      this.coarse.push([p[0], p[2], e0]);
    }
    this.buildTransits();
    for (const k in this.transits) for (const [x, z] of this.transits[k].samples) this.coarse.push([x, z, e0]);
    // Genvägar för kortare varv (en per varvlängd som någon gren använder)
    // Varje gren har en lista med önskade varvlängder; den första som går att lösa med
    // en bra genväg (eller hela slingan) används. lapLens = { gren: varvlängd }.
    this.shortcuts = new Map();
    this.lapLens = {};
    for (const [f, pref] of Object.entries(cfg?.laps || { sprint: this.n, distans: this.n, masstart: [SHORT_LAP] })) {
      let chosen = this.n;
      for (const len of [].concat(pref)) {
        if (len >= this.n) { chosen = this.n; break; }
        if (this.shortcuts.has(len)) { chosen = len; break; }
        const sc = this.findShortcut(this.n - len, [...this.shortcuts.values()]);
        if (!sc) continue;
        this.shortcuts.set(len, sc);
        for (let d = 0; d < sc.len; d += 4) { const q = sc.at(d); this.coarse.push([q.x, q.z, q.y]); }
        chosen = len;
        break;
      }
      this.lapLens[f] = chosen;
    }
    this.views = new Map();
  }

  // Letar upp en genväg mellan två punkter a < b på slingan som gör varvet exakt
  // `cut` meter kortare: (b − a) − genvägens längd = cut. Genvägen ska ligga en bit
  // från stadion, inte korsa eller komma nära resten av spåret, svänga mjukt och
  // ha rimlig lutning (höjden följer terrängen, utjämnad).
  findShortcut(cut, others = []) {
    const n = this.n, P = (s) => { const p = this.pointAt(s); return [p[0], p[2]]; };
    let best = null;
    const st = (this.scStats = { f: 0, turn: 0, clear: 0, grade: 0, wall: 0, other: 0, ok: 0 });
    for (let a = 150; a <= n - 120 - cut; a += 10) {
      const pa = P(a), ta = this.tangentAt(a);
      // Avfarten får vika av i en vinkel (som en spårgaffel) i stället för att gå
      // parallellt med slingan en lång bit – då slipper man S-kurvor och höjdväggar.
      const make = (b) => {
        const pb = P(b), tb = this.tangentAt(b);
        const ux = pb[0] - pa[0], uz = pb[1] - pa[1], ul = Math.hypot(ux, uz) || 1;
        const mix = (t) => { const x = t[0] + 0.9 * ux / ul, z = t[1] + 0.9 * uz / ul, l = Math.hypot(x, z) || 1; return [x / l, z / l]; };
        return makeTransit(pa, mix(ta), pb, mix(tb), 0);
      };
      const f = (b) => (b - a) - make(b).len - cut;
      let lo = a + cut + 2, hi = Math.min(n - 120, a + cut + 1100);
      if (hi <= lo || f(lo) > 0 || f(hi) < 0) { st.f++; continue; }
      for (let it = 0; it < 30; it++) { const m = (lo + hi) / 2; if (f(m) < 0) lo = m; else hi = m; }
      const b = (lo + hi) / 2;
      const path = make(b);
      if (path.len < 30) continue;
      // mjuk sväng: riktningen får ändras högst 1/9 rad per meter (radie ≥ 9 m)
      let ok = true, prev = path.at(0);
      for (let d = 2; d <= path.len && ok; d += 2) {
        const q = path.at(d);
        const da = Math.abs(Math.atan2(q.tx * prev.tz - q.tz * prev.tx, q.tx * prev.tx + q.tz * prev.tz));
        if (da / 2 > 1 / 9) ok = false;
        prev = q;
      }
      if (!ok) { st.turn++; continue; }
      // fritt från resten av spåret och stadion
      for (let d = 40; d <= path.len - 40 && ok; d += 4) {
        const q = path.at(d);
        if (Math.hypot(q.x - this.stadium[0], q.z - this.stadium[1]) < 90) ok = false;
        if (this.inStadiumZone(q.x, q.z, 6)) ok = false;
        for (let i = 0; i < n && ok; i += 6) {
          if (Math.abs(i - a) < 70 || Math.abs(i - b) < 70) continue;
          if ((this.xs[i] - q.x) ** 2 + (this.zs[i] - q.z) ** 2 < 12 * 12) ok = false;
        }
      }
      if (!ok) { st.clear++; continue; }
      // höjd: terrängen längs genvägen, utjämnad och anpassad till spårets höjd i ändarna
      const L = Math.floor(path.len);
      let y = new Float32Array(L + 1);
      for (let d = 0; d <= L; d++) { const q = path.at(d); y[d] = this.terrainHeight(q.x, q.z); }
      for (let pass = 0; pass < 3; pass++) {
        const o = new Float32Array(L + 1);
        for (let d = 0; d <= L; d++) { let sum = 0, c = 0; for (let k = -12; k <= 12; k++) { const j = d + k; if (j >= 0 && j <= L) { sum += y[j]; c++; } } o[d] = sum / c; }
        y = o;
      }
      const ea = this.elevAt(a), eb = this.elevAt(b), y0 = y[0], y1 = y[L];
      for (let d = 0; d <= L; d++) { const t = d / L; y[d] += (ea - y0) * (1 - t) + (eb - y1) * t; }
      // För brant? Blanda mot en jämn lutning mellan ändarna (terrängen schaktas/fylls längs spåret)
      const grade = (arr) => { let g = 0; for (let d = 4; d <= L; d += 4) g = Math.max(g, Math.abs(arr[d] - arr[d - 4]) / 4); return g; };
      let maxG = grade(y);
      for (let w = 0.1; maxG > 0.13 && w <= 1.001; w += 0.1) {
        const yy = new Float32Array(L + 1);
        for (let d = 0; d <= L; d++) yy[d] = y[d] * (1 - w) + (ea + (eb - ea) * (d / L)) * w;
        const g = grade(yy);
        if (g <= 0.13 || w > 0.95) { y = yy; maxG = g; }
      }
      if (maxG > 0.16) { st.grade++; continue; }
      // Ingen vägg vid avfarterna: där genvägen ligger nära slingan får höjdskillnaden
      // inte vara större än en lagom slänt (1:2,5), annars skär terrängen över spåret.
      const near = (q, yy) => {
        let worst = 0;
        for (let i = 0; i < n; i += 3) {
          const h = Math.hypot(this.xs[i] - q.x, this.zs[i] - q.z);
          if (h > 26) continue;
          const dy = Math.abs(this.es[i] - yy);
          worst = Math.max(worst, dy - Math.max(0, h - 3) / 2);
        }
        return worst;
      };
      let wall = 0;
      for (let d = 0; d <= L; d += 3) wall = Math.max(wall, near(path.at(d), y[d]));
      if (wall > 1.2) { st.wall++; continue; }
      // inte för nära en annan genväg
      if (others.some((o) => { for (let d = 0; d <= L; d += 8) { const q = path.at(d); for (let e = 0; e <= o.len; e += 8) { const r = o.at(e); if ((r.x - q.x) ** 2 + (r.z - q.z) ** 2 < 20 * 20) return true; } } return false; })) { st.other++; continue; }
      st.ok++;
      const score = maxG + path.len / 4000;
      if (!best || score < best.score) best = { a, b, path, y, L, score, maxG };
    }
    if (!best) return null;
    const { a, b, path, y, L } = best;
    const yAt = (d) => { const c = Math.max(0, Math.min(L, d)), i = Math.min(L - 1, Math.floor(c)), f = c - i; return y[i] + (y[i + 1] - y[i]) * f; };
    return {
      a, b, len: path.len, maxGrade: best.maxG,
      at: (d) => { const q = path.at(d); q.y = yAt(d); return q; },
    };
  }

  // Varvet för en viss varvlängd: hela slingan (2 km) eller slingan med genväg.
  // Returnerar ett objekt med samma metoder som banan (pointAt, tangentAt, gradeAt …).
  lapView(len = this.n) {
    if (len >= this.n || !this.shortcuts.has(len)) return this;
    if (this.views.has(len)) return this.views.get(len);
    const { a, b, len: L, at } = this.shortcuts.get(len);
    const v = Object.create(this);
    v.n = Math.round(a + L + (this.n - b));
    v.xs = new Float32Array(v.n); v.zs = new Float32Array(v.n); v.es = new Float32Array(v.n);
    for (let i = 0; i < v.n; i++) {
      let x, y, z;
      if (i < a) [x, y, z] = this.pointAt(i);
      else if (i < a + L) { const q = at(i - a); x = q.x; y = q.y; z = q.z; }
      else [x, y, z] = this.pointAt(b + (i - a - L));
      v.xs[i] = x; v.zs[i] = z; v.es[i] = y;
    }
    v.isShort = true;
    this.views.set(len, v);
    return v;
  }

  // Terränghöjd i spelkoordinater
  terrainHeight(x, z) {
    const hm = this.hm;
    if (!hm) return proceduralHeight(x, z);
    // höjdkartan är i riktiga meter: skala tillbaka
    const gx = ((x / this.k + hm.size / 2) / hm.size) * (hm.n - 1);
    const gz = ((z / this.k + hm.size / 2) / hm.size) * (hm.n - 1);
    const cx = Math.min(hm.n - 1.001, Math.max(0, gx)), cz = Math.min(hm.n - 1.001, Math.max(0, gz));
    const i = Math.floor(cx), jj = Math.floor(cz), fx = cx - i, fz = cz - jj;
    const H = (a, b) => hm.h[b * hm.n + a] / 10;
    const h0 = H(i, jj) * (1 - fx) + H(i + 1, jj) * fx;
    const h1 = H(i, jj + 1) * (1 - fx) + H(i + 1, jj + 1) * fx;
    return h0 * (1 - fz) + h1 * fz;
  }

  wrap(s) {
    return ((s % this.n) + this.n) % this.n;
  }

  pointAt(s) {
    s = this.wrap(s);
    const i = Math.floor(s), f = s - i, i2 = (i + 1) % this.n;
    return [
      this.xs[i] + (this.xs[i2] - this.xs[i]) * f,
      this.es[i] + (this.es[i2] - this.es[i]) * f,
      this.zs[i] + (this.zs[i2] - this.zs[i]) * f,
    ];
  }

  tangentAt(s) {
    const a = this.wrap(s - 3), b = this.wrap(s + 3);
    const ia = Math.floor(a), ib = Math.floor(b);
    const dx = this.xs[ib] - this.xs[ia], dz = this.zs[ib] - this.zs[ia];
    const l = Math.hypot(dx, dz) || 1;
    return [dx / l, dz / l];
  }

  elevAt(s) {
    return this.pointAt(s)[1];
  }

  gradeAt(s) {
    // Begränsat till ±22 % (brantare än så finns inte på en skidskyttebana)
    const g = (this.elevAt(s + 8) - this.elevAt(s - 8)) / 16;
    return Math.max(-0.22, Math.min(0.22, g));
  }

  // Straffrundan börjar/slutar i punkten närmast banan och åks så att man
  // startar i banans riktning.
  penaltyPoint(d) {
    const a = this.penaltyA0 - (d / PENALTY_LEN) * Math.PI * 2;
    const [cx, cz] = this.penaltyCenter;
    return [cx + Math.cos(a) * PENALTY_RADIUS, this.stadiumElev, cz + Math.sin(a) * PENALTY_RADIUS];
  }

  finishPoint(d) {
    const [sx, sz] = this.stadium;
    const [fx, fz] = this.finishDir;
    return [sx + fx * d, this.stadiumElev, sz + fz * d];
  }

  penaltyTangent(d) {
    const a = this.penaltyA0 - (d / PENALTY_LEN) * Math.PI * 2;
    return [Math.sin(a), -Math.cos(a)];
  }

  // Övergångar på stadion: in till vallen, vall → straffrunda, vall/straffrunda → banan
  buildTransits() {
    const xz = (p) => [p[0], p[2]];
    const t = this.tangentAt(0);
    const sy = this.stadiumElev;
    const pen0 = xz(this.penaltyPoint(0)), penT = this.penaltyTangent(0);
    const join = xz(this.pointAt(JOIN_S)), joinT = this.tangentAt(JOIN_S), joinY = this.pointAt(JOIN_S)[1];
    const end = this.pointAt(this.n - 0.01);
    this.transits = {
      arrive: makeTransit(xz(end), this.tangentAt(this.n - 0.01), this.rangePos, this.normal, end[1], sy),
      toPenalty: makeTransit(this.rangePos, t, pen0, penT, sy),
      rangeOut: makeTransit(this.rangePos, t, join, joinT, sy, joinY),
      penaltyOut: makeTransit(pen0, penT, join, joinT, sy, joinY),
    };
  }

  // Stadionkoordinater: u = längs spåret vid stadion (startriktningen), v = åt skjutvallen (+normal)
  toLocal(x, z) {
    const [sx, sz] = this.stadium, [tx, tz] = this.startDir, [nx, nz] = this.normal;
    return [(x - sx) * tx + (z - sz) * tz, (x - sx) * nx + (z - sz) * nz];
  }
  fromLocal(u, v) {
    const [sx, sz] = this.stadium, [tx, tz] = this.startDir, [nx, nz] = this.normal;
    return [sx + tx * u + nx * v, sz + tz * u + nz * v];
  }
  pickGrandstand() {
    const W = 70, D = 9, vFront = -9;
    const clear = (z) => {
      for (let i = 0; i < this.n; i += 3) {
        const [u, v] = this.toLocal(this.xs[i], this.zs[i]);
        if (u > z.u0 - 4 && u < z.u1 + 4 && v > z.v0 - 4 && v < z.v1 + 3) return false;
      }
      return z.u1 < PEN_U - PENALTY_RADIUS - 6;
    };
    let first = null;
    for (const uc of [-5, -18, 8, -32]) {
      const z = { uc, vFront, width: W, side: -1, u0: uc - W / 2, u1: uc + W / 2, v0: vFront - D, v1: vFront + 1 };
      first = first || z;
      if (clear(z)) return z;
    }
    return first;
  }

  // Ytor på stadion som inget spår (genväg) får gå igenom: läktare, skjutvall, straffrunda, upplopp
  inStadiumZone(x, z, margin = 0) {
    const [u, v] = this.toLocal(x, z), m = margin, R = PENALTY_RADIUS;
    const g = this.grandstandZone;
    if (u > g.u0 - m && u < g.u1 + m && v > g.v0 - m && v < g.v1 + m) return 'läktare';
    if (u > -26 - m && u < 26 + m && v > 14 - m && v < 64 + m) return 'skjutvall';
    if (Math.hypot(u - PEN_U, v + R + 14) < R + 5 + m) return 'straffrunda';
    if (u > -5 - m && u < FINISH_LEN + 15 + m && Math.abs(v) < 10 + m) return 'upplopp';
    return null;
  }
  // Avstånd till närmaste åkbara spår (slingan och genvägarna, inte upploppet/övergångarna)
  trackDist(x, z) {
    if (!this.trackPts) {
      this.trackPts = [];
      for (let i = 0; i < this.n; i += 3) this.trackPts.push([this.xs[i], this.zs[i]]);
      for (const sc of this.shortcuts.values()) for (let d = 0; d <= sc.len; d += 3) { const q = sc.at(d); this.trackPts.push([q.x, q.z]); }
    }
    let best = Infinity;
    for (const [px, pz] of this.trackPts) { const d = (px - x) ** 2 + (pz - z) ** 2; if (d < best) best = d; }
    return Math.sqrt(best);
  }

  // Ligger (x, z) inom r meter från en övergång eller straffrundan? (öppningar i staketet)
  inLane(x, z, r) {
    const r2 = r * r;
    for (const k in this.transits) {
      if (k === 'arrive') continue;
      for (const [px, pz] of this.transits[k].samples) if ((px - x) ** 2 + (pz - z) ** 2 < r2) return true;
    }
    return false;
  }

  // Närmaste spårpunkt (grov): [avstånd, höjd]
  nearest(x, z) {
    let best = Infinity, be = 0;
    for (const p of this.coarse) {
      const d = (p[0] - x) ** 2 + (p[1] - z) ** 2;
      if (d < best) { best = d; be = p[2]; }
    }
    return [Math.sqrt(best), be];
  }
}

export function smooth(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

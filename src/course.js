import { makeTransit } from './paths.js?v=202611181940';
// Bana: en sluten slinga på exakt LAP_LEN meter med höjdprofil.
// Två källor:
//  - inbakad bana (data/course.json från tools/build-course.mjs): riktigt spår + höjdkarta
//  - procedurell reservbana när ingen inbakad data finns

export const LAP_LEN = 2000;      // damsprint/-stafettsträcka 6 km = 3 × 2 km
export const LAPS = 3;
export const PENALTY_LEN = 150;
export const TIME_SCALE = 5;      // åkningen går 5× fortare än verklig fart (lopp ≈ 4–5 min)
export const JOIN_S = 50; // var man kommer ut på banan igen efter vallen/straffrundan
export const PENALTY_RADIUS = PENALTY_LEN / (2 * Math.PI);
export const FINISH_LEN = 200;   // upploppsraka efter sista varvet

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
export async function loadCourseData(url = 'data/course.json') {
  try {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

export class Course {
  constructor(data = null) {
    this.data = data;
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
    // Skala så att varvet blir exakt LAP_LEN (riktiga banan skalas bara några procent)
    const k = LAP_LEN / total;
    this.k = k;
    this.hm = data?.terrain || null;
    // 2. Sampla jämnt var 1 m
    this.n = LAP_LEN;
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
    for (let i = 0; i < this.n; i++) {
      const d = Math.min(i, this.n - i);
      // inbakad bana: lång övergång så att stadion inte skapar en brant vägg
      const t = data ? smooth(260, 40, d) : smooth(80, 30, d);
      e[i] = e[i] * (1 - t) + e0 * t;
    }
    this.es = e;
    this.stadiumElev = e0;

    // Stadion: skjutvall åt ena sidan, straffrunda åt andra
    const [tx, tz] = this.tangentAt(0);
    this.normal = [-tz, tx];
    this.stadium = [this.xs[0], this.zs[0]];
    this.rangePos = [this.stadium[0] + this.normal[0] * 22, this.stadium[1] + this.normal[1] * 22];
    this.penaltyCenter = [
      this.stadium[0] - this.normal[0] * (PENALTY_RADIUS + 14) + tx * 30,
      this.stadium[1] - this.normal[1] * (PENALTY_RADIUS + 14) + tz * 30,
    ];
    this.penaltyA0 = Math.atan2(this.normal[1], this.normal[0]);

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

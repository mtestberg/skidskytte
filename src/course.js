// Bana: en sluten slinga på exakt LAP_LEN meter med höjdprofil.
// Prototyp: procedurell terräng. I steg 2 ersätts terrainHeight/rawPath
// med inbakad höjdkarta och spår från Le Grand-Bornand.

export const LAP_LEN = 2500;      // sprint 7,5 km = 3 × 2,5 km
export const LAPS = 3;
export const PENALTY_LEN = 150;
export const TIME_SCALE = 5;      // åkningen går 5× fortare än verklig fart (lopp ≈ 4–5 min)
export const PENALTY_RADIUS = PENALTY_LEN / (2 * Math.PI);

export function terrainHeight(x, z) {
  return (
    13 * Math.sin(x / 170 + 0.7) * Math.cos(z / 210) +
    8 * Math.sin((x + z) / 105) +
    2.5 * Math.cos((x - 2 * z) / 60) +
    1.5 * Math.sin(x / 23) * Math.sin(z / 29)
  );
}

function rawPath(u) {
  const a = u * Math.PI * 2;
  const r = 300 + 55 * Math.sin(3 * a + 0.5) + 30 * Math.cos(5 * a + 1.2);
  return [Math.cos(a) * r * 1.2, Math.sin(a) * r * 0.8];
}

export class Course {
  constructor() {
    // 1. Rå punkter + kumulativ längd
    const N = 4000;
    const raw = [];
    let total = 0;
    const cum = [0];
    for (let i = 0; i <= N; i++) {
      raw.push(rawPath(i / N));
      if (i > 0) {
        total += Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]);
        cum.push(total);
      }
    }
    // Skala så att varvet blir exakt LAP_LEN
    const k = LAP_LEN / total;
    // 2. Sampla jämnt var 1 m
    this.n = LAP_LEN;
    this.xs = new Float32Array(this.n);
    this.zs = new Float32Array(this.n);
    this.es = new Float32Array(this.n);
    let j = 0;
    for (let i = 0; i < this.n; i++) {
      const target = i / k;
      while (cum[j + 1] < target) j++;
      const f = (target - cum[j]) / (cum[j + 1] - cum[j]);
      this.xs[i] = (raw[j][0] + (raw[j + 1][0] - raw[j][0]) * f) * k;
      this.zs[i] = (raw[j][1] + (raw[j + 1][1] - raw[j][1]) * f) * k;
    }
    // 3. Höjd från terrängen, utjämnad
    let e = new Float32Array(this.n);
    for (let i = 0; i < this.n; i++) e[i] = terrainHeight(this.xs[i], this.zs[i]);
    for (let pass = 0; pass < 3; pass++) {
      const out = new Float32Array(this.n);
      const w = 30;
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
      const t = smooth(80, 30, d);
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

    // Grova punkter för avståndsberäkning (terräng, träd)
    this.coarse = [];
    for (let i = 0; i < this.n; i += 4) this.coarse.push([this.xs[i], this.zs[i], this.es[i]]);
    for (let i = 0; i < 64; i++) {
      const p = this.penaltyPoint(i / 64 * PENALTY_LEN);
      this.coarse.push([p[0], p[2], e0]);
    }
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
    return (this.elevAt(s + 8) - this.elevAt(s - 8)) / 16;
  }

  penaltyPoint(d) {
    const a = (d / PENALTY_LEN) * Math.PI * 2;
    const [cx, cz] = this.penaltyCenter;
    return [cx + Math.cos(a) * PENALTY_RADIUS, this.stadiumElev, cz + Math.sin(a) * PENALTY_RADIUS];
  }

  penaltyTangent(d) {
    const a = (d / PENALTY_LEN) * Math.PI * 2;
    return [-Math.sin(a), Math.cos(a)];
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

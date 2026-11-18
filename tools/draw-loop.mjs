#!/usr/bin/env node
// Ritar en trovärdig skidskytteslinga runt stadion utifrån terrängen i en höjdmodell.
// (Den officiella världscupsbanan finns inte som öppen data, så detta är en egen bana.)
//
//   node tools/draw-loop.mjs --dem raw/dem.tif --start 45.9417,6.4275 --out raw/slinga.gpx
//
//   --length  slingans längd i meter (standard 2000)
//   --climb   önskad total stigning per varv i meter (standard 65)
//   --maxgrade brantaste tillåtna lutning (standard 0.16)
//   --seed    slumpfrö (olika frön ger olika förslag)
//
// Slingan är "stjärnformad" kring en mittpunkt (korsar aldrig sig själv), börjar och
// slutar vid stadion, och väljs genom att prova tusentals former och poängsätta dem:
// lagom stigning, inga för branta partier, platt vid stadion, inte för långt bort.

import fs from 'node:fs';
import { readDem } from './dem.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith('--') ? [...acc, [a.slice(2), arr[i + 1]]] : acc), [])
);
if (!args.dem || !args.start) {
  console.error('Användning: node tools/draw-loop.mjs --dem raw/dem.tif --start lat,lon [--out raw/slinga.gpx]');
  process.exit(1);
}
const LEN = +(args.length || 2000);
const CLIMB = +(args.climb || 65);
const MAXG = +(args.maxgrade || 0.16);
const OUT = args.out || 'raw/slinga.gpx';
let seed = +(args.seed || 1);
const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

const [lat0, lon0] = args.start.split(',').map(Number);
const mLat = 111132.92 - 559.82 * Math.cos(2 * lat0 * Math.PI / 180);
const mLon = 111412.84 * Math.cos(lat0 * Math.PI / 180);
const toLL = (x, z) => [lat0 - z / mLat, lon0 + x / mLon];

// Förberäknat, utjämnat rutnät (dämpar hus och trädtoppar i ytmodellen)
const dem = await readDem(args.dem);
const EXT = 1400, STEP = 10, N = Math.round((2 * EXT) / STEP) + 1;
let grid = new Float32Array(N * N);
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
  grid[j * N + i] = dem(...toLL(-EXT + i * STEP, -EXT + j * STEP));
}
for (let pass = 0; pass < 3; pass++) {
  const out = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    let s = 0, c = 0;
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
      const a = Math.min(N - 1, Math.max(0, i + di)), b = Math.min(N - 1, Math.max(0, j + dj));
      s += grid[b * N + a]; c++;
    }
    out[j * N + i] = s / c;
  }
  grid = out;
}
const H = (x, z) => {
  const gx = Math.min(N - 1.001, Math.max(0, (x + EXT) / STEP)), gz = Math.min(N - 1.001, Math.max(0, (z + EXT) / STEP));
  const i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j;
  const g = (a, b) => grid[b * N + a];
  return (g(i, j) * (1 - fx) + g(i + 1, j) * fx) * (1 - fz) + (g(i, j + 1) * (1 - fx) + g(i + 1, j + 1) * fx) * fz;
};

// Slingans form: r(θ) = 1 + Σ a_k cos(kθ + φ_k) kring en mittpunkt i riktning α från stadion
function shape(p, n = 400) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2 + p.alpha + Math.PI; // börja i punkten närmast stadion
    let r = 1;
    for (let k = 0; k < p.a.length; k++) r += p.a[k] * Math.cos((k + 2) * t + p.ph[k]);
    r = Math.max(0.35, r);
    pts.push([Math.cos(t) * r * p.ex, Math.sin(t) * r / p.ex]);
  }
  // rotera ellipsen, flytta så att första punkten hamnar i stadion, skala till rätt längd
  const c = Math.cos(p.rot), s = Math.sin(p.rot);
  let q = pts.map(([x, z]) => [x * c - z * s, x * s + z * c]);
  const [fx, fz] = q[0];
  q = q.map(([x, z]) => [x - fx, z - fz]);
  let L = 0;
  for (let i = 0; i < q.length; i++) { const a = q[i], b = q[(i + 1) % q.length]; L += Math.hypot(b[0] - a[0], b[1] - a[1]); }
  const k = LEN / L;
  return q.map(([x, z]) => [x * k, z * k]);
}

function resample(q, step = 5) {
  const out = [];
  let acc = 0;
  for (let i = 0; i < q.length; i++) {
    const a = q[i], b = q[(i + 1) % q.length];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    while (acc <= d) { const f = acc / d; out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]); acc += step; }
    acc -= d;
  }
  return out;
}

function score(p) {
  const q = resample(shape(p), 5);
  const e = q.map(([x, z]) => H(x, z));
  const n = e.length;
  let climb = 0, steep = 0, flat = 0, far = 0, lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) {
    const d = e[(i + 1) % n] - e[i];
    if (d > 0) climb += d;
    const g = (e[(i + 4) % n] - e[i]) / 20;
    steep += Math.max(0, Math.abs(g) - MAXG) ** 2;
    const fromStart = Math.min(i, n - i) * 5;
    if (fromStart < 80) flat += g * g;
    const r = Math.hypot(q[i][0], q[i][1]);
    far += Math.max(0, r - 750) ** 2;
    lo = Math.min(lo, e[i]); hi = Math.max(hi, e[i]);
  }
  const s = steep * 4000 + (climb - CLIMB) ** 2 * 0.08 + flat * 3000 + far * 0.002 + Math.max(0, hi - lo - 70) ** 2 * 0.2;
  return { s, climb, range: hi - lo, q, e };
}

function randomParams() {
  return {
    alpha: rand() * Math.PI * 2,
    rot: rand() * Math.PI,
    ex: 0.8 + rand() * 0.6,
    a: [0, 1, 2].map((k) => (rand() * 2 - 1) * (0.25 / (k + 1))),
    ph: [0, 1, 2].map(() => rand() * Math.PI * 2),
  };
}
function mutate(p, f) {
  return {
    alpha: p.alpha + (rand() - 0.5) * 0.4 * f,
    rot: p.rot + (rand() - 0.5) * 0.4 * f,
    ex: Math.min(1.6, Math.max(0.7, p.ex + (rand() - 0.5) * 0.15 * f)),
    a: p.a.map((v, k) => Math.max(-0.3, Math.min(0.3, v + (rand() - 0.5) * 0.08 * f / (k + 1)))),
    ph: p.ph.map((v) => v + (rand() - 0.5) * 0.6 * f),
  };
}

let best = null;
for (let i = 0; i < 6000; i++) {
  const p = randomParams();
  const r = score(p);
  if (!best || r.s < best.r.s) best = { p, r };
}
for (let it = 0; it < 4000; it++) {
  const f = 1 - it / 4000;
  const p = mutate(best.p, 0.2 + f);
  const r = score(p);
  if (r.s < best.r.s) best = { p, r };
}

const { r } = best;
let maxG = 0;
for (let i = 0; i < r.e.length; i++) maxG = Math.max(maxG, Math.abs((r.e[(i + 4) % r.e.length] - r.e[i]) / 20));
console.log(`Slinga: ${LEN} m, stigning ${r.climb.toFixed(0)} m, höjdskillnad ${r.range.toFixed(0)} m, brantast ${(maxG * 100).toFixed(0)} %, poäng ${r.s.toFixed(1)}`);

let gpx = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="skidskytte draw-loop" xmlns="http://www.topografix.com/GPX/1/1">\n<trk><name>Skidskytte-slinga ${LEN} m</name><trkseg>\n`;
r.q.forEach(([x, z], i) => {
  const [la, lo] = toLL(x, z);
  gpx += `<trkpt lat="${la.toFixed(7)}" lon="${lo.toFixed(7)}"><ele>${r.e[i].toFixed(1)}</ele></trkpt>\n`;
});
gpx += '</trkseg></trk>\n</gpx>\n';
fs.mkdirSync(OUT.includes('/') ? OUT.slice(0, OUT.lastIndexOf('/')) : '.', { recursive: true });
fs.writeFileSync(OUT, gpx);
console.log('Skrev ' + OUT);

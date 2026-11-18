#!/usr/bin/env node
// Gör om ett riktigt skidspår + höjdmodell till spelets bandata (data/course.json).
//
// Användning (från repots rot):
//   cd tools && npm install && cd ..
//   node tools/build-course.mjs --track raw/spar.gpx --dem raw/dem.tif \
//        --start 45.9405,6.4282 --name "Le Grand-Bornand, dam 2 km"
//
//   --track  GPX (trkpt/rtept) eller GeoJSON (LineString/MultiLineString, t.ex. export från Overpass)
//   --dem    GeoTIFF höjdmodell i WGS84 (Copernicus DEM, EPSG:4326) eller Lambert-93 (IGN RGE ALTI, EPSG:2154).
//            Valfri: utan --dem används höjderna i GPX-filen och terrängen runt spåret blir påhittad.
//   --start  lat,lon för stadion/skjutvallen. Slingan börjar på spårpunkten närmast denna.
//   --name   Bannamn som visas i spelet.
//   --out    Utfil (standard data/course.json).
//
// Rådatan (raw/) checkas inte in, bara den bearbetade data/course.json.

import fs from 'node:fs';
import nodePath from 'node:path';
import { readDem } from './dem.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith('--') ? [...acc, [a.slice(2), arr[i + 1]]] : acc), [])
);
if (!args.track) {
  console.error('Saknar --track. Se kommentaren överst i filen.');
  process.exit(1);
}
const OUT = args.out || 'data/course.json';
const TERRAIN_MARGIN = 450; // meter terräng runt spårets ytterkant
const TERRAIN_N = 161;      // rutnät TERRAIN_N × TERRAIN_N

// ---------- 1. Läs spåret ----------
function readTrack(file) {
  const txt = fs.readFileSync(file, 'utf8');
  const pts = [];
  if (/^\s*</.test(txt)) {
    const re = /<(?:trkpt|rtept)\b([^>]*)>([\s\S]*?)<\/(?:trkpt|rtept)>|<(?:trkpt|rtept)\b([^>]*)\/>/g;
    let m;
    while ((m = re.exec(txt))) {
      const attrs = m[1] || m[3] || '';
      const lat = +/lat="([^"]+)"/.exec(attrs)?.[1];
      const lon = +/lon="([^"]+)"/.exec(attrs)?.[1];
      const ele = m[2] ? /<ele>([^<]+)<\/ele>/.exec(m[2])?.[1] : null;
      if (Number.isFinite(lat) && Number.isFinite(lon)) pts.push({ lat, lon, ele: ele != null ? +ele : null });
    }
  } else {
    const gj = JSON.parse(txt);
    const lines = [];
    const visit = (g) => {
      if (!g) return;
      if (g.type === 'FeatureCollection') g.features.forEach((f) => visit(f.geometry));
      else if (g.type === 'Feature') visit(g.geometry);
      else if (g.type === 'LineString') lines.push(g.coordinates);
      else if (g.type === 'MultiLineString') lines.push(...g.coordinates);
    };
    visit(gj);
    // Fogar ihop delsträckor i ordning (närmaste ände först)
    const chain = lines.shift() || [];
    while (lines.length) {
      const end = chain[chain.length - 1];
      let best = 0, bestD = Infinity, rev = false;
      lines.forEach((l, i) => {
        const d0 = dist2(end, l[0]), d1 = dist2(end, l[l.length - 1]);
        if (d0 < bestD) { bestD = d0; best = i; rev = false; }
        if (d1 < bestD) { bestD = d1; best = i; rev = true; }
      });
      const l = lines.splice(best, 1)[0];
      chain.push(...(rev ? l.reverse() : l));
    }
    for (const c of chain) pts.push({ lon: c[0], lat: c[1], ele: c[2] ?? null });
  }
  if (pts.length < 10) throw new Error('För få spårpunkter i ' + file);
  return pts;
}
const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;

// ---------- 3. Bygg ----------
const track = readTrack(args.track);
const lat0 = track.reduce((a, p) => a + p.lat, 0) / track.length;
const lon0 = track.reduce((a, p) => a + p.lon, 0) / track.length;
const mPerLat = 111132.92 - 559.82 * Math.cos(2 * lat0 * Math.PI / 180);
const mPerLon = 111412.84 * Math.cos(lat0 * Math.PI / 180);
// x = österut, z = söderut (spelets koordinater)
const toXZ = (lat, lon) => [(lon - lon0) * mPerLon, (lat0 - lat) * mPerLat];
const toLatLon = (x, z) => [lat0 - z / mPerLat, lon0 + x / mPerLon];

let pts = track.map((p) => ({ ...p, xz: toXZ(p.lat, p.lon) }));
// Ta bort dubbletter
pts = pts.filter((p, i) => i === 0 || Math.hypot(p.xz[0] - pts[i - 1].xz[0], p.xz[1] - pts[i - 1].xz[1]) > 0.5);
// Sluten slinga?
const gap = Math.hypot(pts[0].xz[0] - pts.at(-1).xz[0], pts[0].xz[1] - pts.at(-1).xz[1]);
if (gap > 60) console.warn(`Varning: spårets ändar är ${gap.toFixed(0)} m ifrån varandra. Slingan stängs med en rak linje.`);
// Börja vid stadion
if (args.start) {
  const [la, lo] = args.start.split(',').map(Number);
  const [sx, sz] = toXZ(la, lo);
  let bi = 0, bd = Infinity;
  pts.forEach((p, i) => { const d = Math.hypot(p.xz[0] - sx, p.xz[1] - sz); if (d < bd) { bd = d; bi = i; } });
  pts = [...pts.slice(bi), ...pts.slice(0, bi)];
  console.log(`Start vid spårpunkt ${bi} (${bd.toFixed(0)} m från --start)`);
}

const dem = args.dem ? await readDem(args.dem) : null;
if (!dem && pts.some((p) => p.ele == null)) throw new Error('Spåret saknar höjd (<ele>) och ingen --dem angavs.');

// Resampla var 2:a meter
let len = 0;
const cum = [0];
for (let i = 1; i <= pts.length; i++) {
  const a = pts[i - 1].xz, b = pts[i % pts.length].xz;
  len += Math.hypot(b[0] - a[0], b[1] - a[1]);
  cum.push(len);
}
const STEP = 2;
const out = [];
let j = 0;
for (let d = 0; d < len; d += STEP) {
  while (cum[j + 1] < d) j++;
  const a = pts[j], b = pts[(j + 1) % pts.length];
  const f = (d - cum[j]) / (cum[j + 1] - cum[j] || 1);
  const x = a.xz[0] + (b.xz[0] - a.xz[0]) * f, z = a.xz[1] + (b.xz[1] - a.xz[1]) * f;
  const e = dem ? dem(...toLatLon(x, z)) : a.ele + (b.ele - a.ele) * f;
  out.push([x, z, e]);
}
// Centrera slingan kring origo och gör höjden relativ startpunkten
const cx = out.reduce((a, p) => a + p[0], 0) / out.length;
const cz = out.reduce((a, p) => a + p[1], 0) / out.length;
const base = out[0][2];
const path = out.map(([x, z, e]) => [+(x - cx).toFixed(1), +(z - cz).toFixed(1), +(e - base).toFixed(1)]);

// Terräng runt spåret
let terrain = null;
if (dem) {
  const ext = Math.max(...path.map((p) => Math.max(Math.abs(p[0]), Math.abs(p[1]))));
  const size = Math.ceil((ext + TERRAIN_MARGIN) * 2 / 10) * 10;
  const h = new Array(TERRAIN_N * TERRAIN_N);
  for (let gz = 0; gz < TERRAIN_N; gz++) {
    for (let gx = 0; gx < TERRAIN_N; gx++) {
      const x = (gx / (TERRAIN_N - 1) - 0.5) * size + cx;
      const z = (gz / (TERRAIN_N - 1) - 0.5) * size + cz;
      h[gz * TERRAIN_N + gx] = Math.round((dem(...toLatLon(x, z)) - base) * 10); // decimeter
    }
  }
  terrain = { size, n: TERRAIN_N, h };
}

// Statistik
let climb = 0, maxUp = 0, maxDown = 0;
for (let i = 0; i < path.length; i++) {
  const a = path[i], b = path[(i + 5) % path.length];
  const g = (b[2] - a[2]) / (5 * STEP);
  maxUp = Math.max(maxUp, g); maxDown = Math.min(maxDown, g);
  const d = path[(i + 1) % path.length][2] - a[2];
  if (d > 0) climb += d;
}
const result = {
  name: args.name || nodePath.basename(args.track),
  source: { track: nodePath.basename(args.track), dem: args.dem ? nodePath.basename(args.dem) : null, built: new Date().toISOString() },
  lengthReal: Math.round(len),
  stats: { climb: Math.round(climb), maxGradeUp: +maxUp.toFixed(3), maxGradeDown: +maxDown.toFixed(3) },
  path,
  terrain,
};
fs.mkdirSync(nodePath.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(result));
console.log(`Skrev ${OUT}: ${result.lengthReal} m, stigning ${result.stats.climb} m, brantast +${(maxUp * 100).toFixed(0)} % / ${(maxDown * 100).toFixed(0)} %, ${(fs.statSync(OUT).size / 1024).toFixed(0)} kB`);

// Detaljer som gör omgivningen mer realistisk utan tunga texturer:
// pistat spår (manchesterränder + klassiska spår), markeringspinnar, staket,
// publik och banderoller vid stadion. Allt är instansierat eller små canvas-texturer.
import * as THREE from 'three';
import { FINISH_LEN, PENALTY_LEN } from './course.js?v=202611182008';

// ---------- Pistat spår ----------
// Spårbädden är lite gråblå och tydligt randig (manchester), med en upphöjd
// snövall längs kanterna som pistmaskinen lämnar. Det gör att spåret syns
// tydligt mot den orörda snön runt omkring.
function corduroyTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#d6e0ea';
  g.fillRect(0, 0, 128, 256);
  // manchesterränder längs spåret, tydligare än förut
  for (let x = 6; x < 122; x += 4) {
    g.fillStyle = 'rgba(110,135,168,0.42)';
    g.fillRect(x, 0, 2, 256);
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.fillRect(x + 2, 0, 1, 256);
  }
  // små ojämnheter så att ytan inte ser plastig ut
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '120,140,170'},${0.08 + Math.random() * 0.1})`;
    g.fillRect(6 + Math.random() * 116, Math.random() * 256, 1 + Math.random() * 3, 1 + Math.random() * 6);
  }
  // klassiska spår längs kanterna
  for (const x of [14, 26, 102, 114]) {
    g.fillStyle = 'rgba(85,108,140,0.8)';
    g.fillRect(x - 3, 0, 6, 256);
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.fillRect(x - 4, 0, 1, 256);
  }
  // skärspår (skating) i mitten
  g.strokeStyle = 'rgba(110,130,160,0.28)';
  g.lineWidth = 2;
  for (let y = 0; y < 256; y += 32) {
    g.beginPath(); g.moveTo(42, y); g.lineTo(64, y + 28); g.stroke();
    g.beginPath(); g.moveTo(86, y + 14); g.lineTo(64, y + 42); g.stroke();
  }
  // packad kant (mörkare linje) och vit snövall längst ut
  g.fillStyle = 'rgba(80,100,130,0.55)';
  g.fillRect(3, 0, 3, 256); g.fillRect(122, 0, 3, 256);
  g.fillStyle = '#f7f9fc';
  g.fillRect(0, 0, 3, 256); g.fillRect(125, 0, 3, 256);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Tvärsnitt: [sidoförskjutning (m från kant, + = utåt), höjd (m), u]
const PROFILE = [
  [0.85, -0.07, 0.0],   // vallens fot ute i orörd snö
  [0.28, 0.15, 0.0],    // vallens topp
  [0.02, 0.05, 0.012],  // kanten ner mot bädden
  [-0.12, 0.03, 0.035], // packad kant
];

function ribbon(points, width, tex, vScale, lip = 1) {
  // points: [{x,y,z,tx,tz,s}]
  const n = points.length;
  // vänster: PROFILE i ordning, höger: spegelvänd
  const cross = [];
  const prof = PROFILE.map(([o, h, u]) => [o * (0.4 + 0.6 * lip), h > 0.06 ? 0.04 + (h - 0.04) * lip : h, u]);
  for (const [o, h, u] of prof) cross.push([-(width / 2 + o), h, u]);
  for (const [o, h, u] of [...prof].reverse()) cross.push([width / 2 + o, h, 1 - u]);
  const m = cross.length;
  const pos = new Float32Array(n * m * 3), uv = new Float32Array(n * m * 2);
  const idx = [];
  points.forEach((p, i) => {
    const nx = -p.tz, nz = p.tx;
    cross.forEach(([off, h, u], j) => {
      pos.set([p.x + nx * off, p.y + h, p.z + nz * off], (i * m + j) * 3);
      uv.set([u, p.s / vScale], (i * m + j) * 2);
    });
    if (i < n - 1) {
      for (let j = 0; j < m - 1; j++) {
        const a = i * m + j, b = a + m;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    map: tex, roughness: 0.75, metalness: 0, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

export function buildTrack(scene, course) {
  const tex = corduroyTexture();
  const pts = [];
  for (let s = 0; s <= course.n; s += 2) {
    const [x, y, z] = course.pointAt(s % course.n);
    const [tx, tz] = course.tangentAt(s % course.n);
    pts.push({ x, y: y + 0.03, z, tx, tz, s });
  }
  scene.add(ribbon(pts, 5.2, tex, 9));
  // Straffrundan
  const pp = [];
  for (let d = 0; d <= 150; d += 1.5) {
    const [x, y, z] = course.penaltyPoint(d);
    const [tx, tz] = course.penaltyTangent(d);
    pp.push({ x, y: y + 0.03, z, tx, tz, s: d });
  }
  scene.add(ribbon(pp, 3.4, tex, 9, 0.6));
  // Röda avlånga konor runt straffrundan (innerkant och ytterkant), med vitt reflexband
  {
    const coneGeo = new THREE.ConeGeometry(0.13, 0.75, 8).translate(0, 0.375, 0);
    const baseGeo = new THREE.BoxGeometry(0.34, 0.04, 0.34).translate(0, 0.02, 0);
    const bandGeo = new THREE.CylinderGeometry(0.068, 0.085, 0.12, 8).translate(0, 0.42, 0);
    const MAXC = 220;
    const cones = new THREE.InstancedMesh(coneGeo, new THREE.MeshStandardMaterial({ color: 0xe0281e, roughness: 0.45 }), MAXC);
    const bases = new THREE.InstancedMesh(baseGeo, new THREE.MeshStandardMaterial({ color: 0x3a1210, roughness: 0.7 }), MAXC);
    const bands = new THREE.InstancedMesh(bandGeo, new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.3, emissive: 0x222222 }), MAXC);
    const cm = new THREE.Matrix4();
    let c = 0;
    for (const [off, step] of [[-2.25, 4], [2.25, 3.2]]) { // innerkant glesare, ytterkant tätare
      for (let d = 0; d < PENALTY_LEN && c < MAXC; d += step) {
        const [x, y, z] = course.penaltyPoint(d);
        const [tx, tz] = course.penaltyTangent(d);
        const px = x - tz * off, pz = z + tx * off;
        // lämna öppning där man åker in på och ut från straffrundan
        if (course.inLane(px, pz, 2.0)) continue;
        cm.makeTranslation(px, y, pz);
        cones.setMatrixAt(c, cm); bases.setMatrixAt(c, cm); bands.setMatrixAt(c, cm);
        c++;
      }
    }
    for (const im of [cones, bases, bands]) { im.count = c; im.castShadow = im === cones; scene.add(im); }
  }
  // Upploppsrakan
  const fp = [];
  for (let d = -6; d <= FINISH_LEN + 25; d += 2) {
    const [x, y, z] = course.finishPoint(d);
    const [tx, tz] = course.finishDir;
    fp.push({ x, y: y + 0.035, z, tx, tz, s: d });
  }
  scene.add(ribbon(fp, 6.5, tex, 9));
  // Övergångar: vall → straffrunda, vall/straffrunda → banan, spåret → vallen
  for (const k of ['toPenalty', 'rangeOut', 'penaltyOut', 'arrive']) {
    const path = course.transits[k];
    const tp = [];
    for (let d = 0; d <= path.len; d += 1.5) {
      const q = path.at(d);
      tp.push({ x: q.x, y: q.y + 0.032 + (k === 'arrive' ? 0.002 : 0), z: q.z, tx: q.tx, tz: q.tz, s: d });
    }
    scene.add(ribbon(tp, 3.4, tex, 9, 0));
  }

  // Markeringspinnar längs spåret (röda till vänster, blå till höger) var 25:e meter
  const poleGeo = new THREE.CylinderGeometry(0.025, 0.03, 1.3, 5).translate(0, 0.65, 0);
  const red = new THREE.InstancedMesh(poleGeo, new THREE.MeshStandardMaterial({ color: 0xd8312f, roughness: 0.5 }), 200);
  const blue = new THREE.InstancedMesh(poleGeo, new THREE.MeshStandardMaterial({ color: 0x1f5fbf, roughness: 0.5 }), 200);
  const m = new THREE.Matrix4();
  let i = 0;
  for (let s = 0; s < course.n && i < 200; s += 25, i++) {
    const [x, y, z] = course.pointAt(s);
    const [tx, tz] = course.tangentAt(s);
    // ingen pinne mitt i en korsande övergång
    m.makeTranslation(x - tz * 3.3, course.inLane(x - tz * 3.3, z + tx * 3.3, 2) ? -50 : y, z + tx * 3.3); red.setMatrixAt(i, m);
    m.makeTranslation(x + tz * 3.3, course.inLane(x + tz * 3.3, z - tx * 3.3, 2) ? -50 : y, z - tx * 3.3); blue.setMatrixAt(i, m);
  }
  red.count = blue.count = i;
  for (const im of [red, blue]) { im.castShadow = true; scene.add(im); }
}

// ---------- Stadion: staket, banderoller, publik ----------
function bannerTexture(text, bg, fg) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 512, 64);
  g.fillStyle = fg;
  g.font = '700 40px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildStadiumDetails(scene, course) {
  const y = course.stadiumElev;
  const N = course.n;
  // Staket med banderoller på båda sidor om spåret ±120 m runt stadion
  const panels = [
    bannerTexture('BIATHLON', '#1d4f91', '#ffffff'),
    bannerTexture('SPRINT 6 KM', '#ffd23f', '#0b1622'),
    bannerTexture('LE GRAND-BORNAND', '#d8312f', '#ffffff'),
  ].map((t) => new THREE.MeshStandardMaterial({ map: t, roughness: 0.7, side: THREE.DoubleSide }));
  const panelGeo = new THREE.PlaneGeometry(4.6, 0.6);
  const inst = panels.map((mat) => new THREE.InstancedMesh(panelGeo, mat, 90));
  const counts = [0, 0, 0];
  const pm = new THREE.Matrix4(), pq = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), pv = new THREE.Vector3();
  // längs upploppsrakan (båda sidor), sedan längs banan runt stadion
  const spots = [];
  for (let d = 35; d <= FINISH_LEN + 10; d += 5) {
    const [x, , z] = course.finishPoint(d);
    const [tx, tz] = course.finishDir;
    for (const side of [-1, 1]) {
      if (side === -1 && d < 120) continue; // där ligger banan nära bredvid
      spots.push([x, z, tx, tz, side, d, 4.6]);
    }
  }
  for (let s = -120; s <= 120; s += 5) {
    if (Math.abs(s) < 8) continue; // öppning vid portalen
    const ss = (s + N) % N;
    const [x, , z] = course.pointAt(ss);
    const [tx, tz] = course.tangentAt(ss);
    for (const side of [-1, 1]) {
      if (s > 30 && side === 1) continue; // där viker banan av från upploppet
      spots.push([x, z, tx, tz, side, s, 4.2]);
    }
  }
  for (const [x, z, tx, tz, side, s, off] of spots) {
    {
      const kind = (Math.round(s / 5) + (side > 0 ? 1 : 0) + 30) % 3;
      if (counts[kind] >= 90) continue;
      const px = x - tz * off * side, pz = z + tx * off * side;
      if (course.inLane(px, pz, 3.4)) continue; // öppning där övergången korsar
      pq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(x - px, z - pz)); // texten vänd mot spåret
      pv.set(px, y + 0.45, pz);
      pm.compose(pv, pq, one);
      inst[kind].setMatrixAt(counts[kind]++, pm);
    }
  }
  inst.forEach((im, i) => { im.count = counts[i]; scene.add(im); });

  // Publik: instansierade figurer bakom staketet och på läktaren
  const bodyGeo = new THREE.CapsuleGeometry(0.22, 0.75, 2, 5).translate(0, 0.6, 0);
  const headGeo = new THREE.SphereGeometry(0.13, 6, 5).translate(0, 1.35, 0);
  const MAX = 1200;
  const bodies = new THREE.InstancedMesh(bodyGeo, new THREE.MeshStandardMaterial({ roughness: 0.8 }), MAX);
  const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshStandardMaterial({ roughness: 0.8 }), MAX);
  const jackets = [0xd8312f, 0x1f5fbf, 0xffd23f, 0x2a9d8f, 0x222831, 0xf4a261, 0xffffff, 0x6d597a].map((c) => new THREE.Color(c));
  const hats = [0xd8312f, 0xffffff, 0x1f5fbf, 0x222831, 0xffd23f].map((c) => new THREE.Color(c));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  const crowd = [];
  const flagTex = [
    ['#006aa7', '#fecc02', 'cross'], ['#0055a4', '#ffffff', '#ef4135'], ['#ba0c2f', '#ffffff', 'cross-no'],
    ['#000000', '#dd0000', '#ffce00', 'h'], ['#009246', '#ffffff', '#ce2b37'],
  ].map(flagTexture);
  const flagGeo = new THREE.PlaneGeometry(0.75, 0.5).translate(0.4, 0, 0);
  const flagMats = flagTex.map((t) => new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide, roughness: 0.8 }));
  const flags = flagMats.map((mat) => new THREE.InstancedMesh(flagGeo, mat, 40));
  const flagCounts = flags.map(() => 0);
  const flagData = [];
  let k = 0;
  const place = (x, yy, z, facing) => {
    if (k >= MAX) return;
    if (course.inLane(x, z, 2.6)) return; // öppning där övergången korsar
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), facing + (Math.random() - 0.5) * 0.6);
    const s = 0.9 + Math.random() * 0.2;
    sc.set(s, s, s);
    p.set(x, yy, z);
    m.compose(p, q, sc);
    bodies.setMatrixAt(k, m); heads.setMatrixAt(k, m);
    bodies.setColorAt(k, jackets[Math.floor(Math.random() * jackets.length)]);
    heads.setColorAt(k, hats[Math.floor(Math.random() * hats.length)]);
    crowd.push({ i: k, x, y: yy, z, q: q.clone(), s, ph: Math.random() * 6 });
    // var åttonde viftar med flagga
    if (Math.random() < 0.13) {
      const f = Math.floor(Math.random() * flags.length);
      if (flagCounts[f] < 40) flagData.push({ f, i: flagCounts[f]++, x, y: yy + 1.75 * s, z, yaw: facing, ph: Math.random() * 6 });
    }
    k++;
  };
  // längs staketen
  for (let d = 36; d <= FINISH_LEN + 8; d += 1.3) {
    const [x, , z] = course.finishPoint(d);
    const [tx, tz] = course.finishDir;
    for (const side of [-1, 1]) {
      if (side === 1 && d > 55 && d < 145) continue; // där står läktaren
      if (side === -1 && d < 120) continue;          // där ligger banan nära bredvid
      if (Math.random() < 0.25) continue;
      const off = 5.4 + Math.random() * 1.8;
      const px = x - tz * off * side, pz = z + tx * off * side;
      place(px, y, pz, Math.atan2(tz * side, -tx * side));
    }
  }
  for (let s = -115; s <= 115; s += 1.6) {
    if (Math.abs(s) < 10) continue;
    const ss = (s + N) % N;
    const [x, , z] = course.pointAt(ss);
    const [tx, tz] = course.tangentAt(ss);
    for (const side of [-1, 1]) {
      if (s > 30 && side === 1) continue;
      if (Math.random() < 0.35) continue;
      const off = 5 + Math.random() * 1.8;
      const px = x - tz * off * side, pz = z + tx * off * side;
      place(px, course.terrainHeight(px, pz) * 0 + y, pz, Math.atan2(tz * side, -tx * side));
    }
  }
  // Läktaren längs upploppet: publik på varje trappsteg
  const G = grandstand(scene, course);
  for (let row = 0; row < G.rows; row++) {
    for (let c = -G.width / 2 + 0.8; c <= G.width / 2 - 0.8; c += 0.95) {
      if (Math.random() < 0.12) continue;
      const [x, , z] = course.finishPoint(G.center + c);
      const lat = G.lat + row * G.depth + 0.45;
      const [nx, nz] = course.normal;
      place(x + nx * lat, y + (row + 1) * G.rise, z + nz * lat, Math.atan2(-nx, -nz));
    }
  }
  bodies.count = heads.count = k;
  flags.forEach((im, i) => { im.count = flagCounts[i]; scene.add(im); });
  const fm = new THREE.Matrix4(), fq = new THREE.Quaternion(), fe = new THREE.Euler(), fv = new THREE.Vector3(), f1 = new THREE.Vector3(1, 1, 1);
  for (const im of [bodies, heads]) { im.castShadow = false; im.instanceColor.needsUpdate = true; scene.add(im); }

  // Publiken hoppar lite (billigt: bara några få per bildruta)
  let cursor = 0;
  return function animateCrowd(t) {
    for (let n = 0; n < 40 && crowd.length; n++) {
      const c = crowd[cursor++ % crowd.length];
      const hop = Math.max(0, Math.sin(t * 5 + c.ph)) * 0.12;
      p.set(c.x, c.y + hop, c.z);
      sc.set(c.s, c.s, c.s);
      m.compose(p, c.q, sc);
      bodies.setMatrixAt(c.i, m); heads.setMatrixAt(c.i, m);
    }
    bodies.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
    for (const d of flagData) {
      fe.set(Math.sin(t * 3 + d.ph) * 0.25, d.yaw + Math.PI / 2 + Math.sin(t * 2.2 + d.ph) * 0.6, Math.sin(t * 2.2 + d.ph) * 0.3);
      fq.setFromEuler(fe);
      fv.set(d.x, d.y + Math.max(0, Math.sin(t * 5 + d.ph)) * 0.12, d.z);
      fm.compose(fv, fq, f1);
      flags[d.f].setMatrixAt(d.i, fm);
    }
    flags.forEach((im) => { im.instanceMatrix.needsUpdate = true; });
  };
}

// ---------- Flaggor, läktare, portaler, snöfall ----------
function flagTexture(spec) {
  const c = document.createElement('canvas');
  c.width = 96; c.height = 64;
  const g = c.getContext('2d');
  const [a, b, d, kind] = spec;
  if (b && d === 'cross') { // nordiskt kors
    g.fillStyle = a; g.fillRect(0, 0, 96, 64);
    g.fillStyle = b; g.fillRect(28, 0, 12, 64); g.fillRect(0, 26, 96, 12);
  } else if (d === 'cross-no') {
    g.fillStyle = a; g.fillRect(0, 0, 96, 64);
    g.fillStyle = b; g.fillRect(24, 0, 20, 64); g.fillRect(0, 22, 96, 20);
    g.fillStyle = '#00205b'; g.fillRect(29, 0, 10, 64); g.fillRect(0, 27, 96, 10);
  } else if (kind === 'h') { // liggande trefärg
    [a, b, d].forEach((col, i) => { g.fillStyle = col; g.fillRect(0, i * 22, 96, 22); });
  } else { // stående trefärg
    [a, b, d].forEach((col, i) => { g.fillStyle = col; g.fillRect(i * 32, 0, 32, 64); });
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Läktare med trappsteg, säten och tak längs upploppsrakan (på +normal-sidan)
function grandstand(scene, course) {
  const G = { center: 100, width: 80, lat: 8.5, rows: 7, rise: 0.75, depth: 1.05 };
  const y = course.stadiumElev;
  const [nx, nz] = course.normal;
  const [fx, fz] = course.finishDir;
  const yaw = Math.atan2(fx, fz);
  const group = new THREE.Group();
  const [cx, , cz] = course.finishPoint(G.center);
  group.position.set(cx + nx * G.lat, y, cz + nz * G.lat);
  group.rotation.y = yaw + Math.PI / 2;
  // I gruppen: x = längs upploppet, z = bort från spåret (åt +normal). Kolla tecknet:
  const sideSign = Math.sign(nx * Math.cos(yaw) - nz * Math.sin(yaw)) || 1;
  const concrete = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.9 });
  const seat = new THREE.MeshStandardMaterial({ color: 0x1f5fbf, roughness: 0.6 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xd9dee4, roughness: 0.4, metalness: 0.5 });
  const roofM = new THREE.MeshStandardMaterial({ color: 0xf2f4f6, roughness: 0.6, side: THREE.DoubleSide });
  for (let r = 0; r < G.rows; r++) {
    const h = (r + 1) * G.rise;
    const step = new THREE.Mesh(new THREE.BoxGeometry(G.width, h, G.depth), concrete);
    step.position.set(0, h / 2, (r + 0.5) * G.depth * sideSign);
    step.castShadow = step.receiveShadow = true;
    group.add(step);
    const s = new THREE.Mesh(new THREE.BoxGeometry(G.width - 0.4, 0.12, 0.42), seat);
    s.position.set(0, h + 0.06, (r + 0.75) * G.depth * sideSign);
    group.add(s);
  }
  const backZ = G.rows * G.depth * sideSign;
  const back = new THREE.Mesh(new THREE.BoxGeometry(G.width, G.rows * G.rise + 3.2, 0.3), concrete);
  back.position.set(0, (G.rows * G.rise + 3.2) / 2, backZ);
  group.add(back);
  // tak på pelare, lutar mot spåret
  for (let x = -G.width / 2; x <= G.width / 2; x += 10) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, G.rows * G.rise + 3.4, 8), steel);
    post.position.set(x, (G.rows * G.rise + 3.4) / 2, backZ - 0.4 * sideSign);
    post.castShadow = true;
    group.add(post);
  }
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(G.width + 2, G.rows * G.depth + 2.5), roofM);
  roof.rotation.x = -Math.PI / 2 + 0.12 * sideSign;
  roof.position.set(0, G.rows * G.rise + 3.3, backZ / 2 - 0.6 * sideSign);
  roof.castShadow = true;
  group.add(roof);
  // reklamskylt längs läktarens framkant
  const front = new THREE.Mesh(new THREE.PlaneGeometry(G.width, 0.7),
    new THREE.MeshStandardMaterial({ map: bannerTexture('LE GRAND-BORNAND · BIATHLON', '#0b2a55', '#ffd23f'), roughness: 0.7, side: THREE.DoubleSide }));
  front.position.set(0, 0.55, -0.02 * sideSign);
  front.rotation.y = sideSign > 0 ? Math.PI : 0; // texten vänd mot spåret
  group.add(front);
  scene.add(group);
  return G;
}

function portal(scene, x, y, z, yaw, text, color, clock) {
  const g = new THREE.Group();
  const post = new THREE.MeshStandardMaterial({ color, roughness: 0.55 });
  for (const s of [-5.2, 5.2]) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 5.6, 14), post);
    m.position.set(s, 2.8, 0);
    m.castShadow = true;
    g.add(m);
  }
  const top = new THREE.Mesh(new THREE.BoxGeometry(11.4, 1.3, 0.9),
    [post, post, post, post,
      new THREE.MeshStandardMaterial({ map: bannerTexture(text, '#' + new THREE.Color(color).getHexString(), '#ffffff'), roughness: 0.5 }),
      new THREE.MeshStandardMaterial({ map: bannerTexture(text, '#' + new THREE.Color(color).getHexString(), '#ffffff'), roughness: 0.5 })]);
  top.position.set(0, 5.6, 0);
  top.castShadow = true;
  g.add(top);
  if (clock) {
    const board = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.0, 0.25),
      [post, post, post, post, clock, clock]);
    board.position.set(0, 6.9, 0);
    g.add(board);
  }
  g.position.set(x, y, z);
  g.rotation.y = yaw;
  scene.add(g);
  return g;
}

export function buildPortals(scene, course) {
  const y = course.stadiumElev;
  const [sx, , sz] = course.pointAt(0);
  const [tx, tz] = course.tangentAt(0);
  portal(scene, sx, y, sz, Math.atan2(tx, tz), 'START', 0x1d4f91);
  // Målportal med klocka i slutet av upploppet
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const clockMat = new THREE.MeshBasicMaterial({ map: tex });
  const [fx, , fz] = course.finishPoint(FINISH_LEN);
  const [dx, dz] = course.finishDir;
  portal(scene, fx, y, fz, Math.atan2(dx, dz), 'MÅL', 0xd8312f, clockMat);
  let last = '';
  return (text) => {
    if (text === last) return;
    last = text;
    g.fillStyle = '#111'; g.fillRect(0, 0, 256, 64);
    g.fillStyle = '#ffd23f';
    g.font = '700 44px ui-monospace, monospace';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 128, 34);
    tex.needsUpdate = true;
  };
}

// Lätt snöfall runt kameran
export function createSnow(scene) {
  const N = 1400, B = 40, H = 22;
  const pos = new Float32Array(N * 3);
  const vel = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * B;
    pos[i * 3 + 1] = Math.random() * H;
    pos[i * 3 + 2] = (Math.random() - 0.5) * B;
    vel[i] = 0.6 + Math.random() * 0.8;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.09, transparent: true, opacity: 0.85, depthWrite: false });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  scene.add(pts);
  let t = 0;
  return (camera, dt, wind = 0) => {
    t += dt;
    pts.position.set(Math.floor(camera.position.x), camera.position.y - H / 2, Math.floor(camera.position.z));
    for (let i = 0; i < N; i++) {
      let y = pos[i * 3 + 1] - vel[i] * dt;
      let x = pos[i * 3] + (Math.sin(t * 0.7 + i) * 0.2 + wind * 0.25) * dt;
      if (y < 0) { y += H; x = (Math.random() - 0.5) * B; }
      if (x > B / 2) x -= B; else if (x < -B / 2) x += B;
      pos[i * 3] = x; pos[i * 3 + 1] = y;
    }
    geo.attributes.position.needsUpdate = true;
  };
}

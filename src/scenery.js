// Detaljer som gör omgivningen mer realistisk utan tunga texturer:
// pistat spår (manchesterränder + klassiska spår), markeringspinnar, staket,
// publik och banderoller vid stadion. Allt är instansierat eller små canvas-texturer.
import * as THREE from 'three';

// ---------- Pistat spår ----------
function corduroyTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#e4ebf2';
  g.fillRect(0, 0, 128, 256);
  // manchesterränder längs spåret
  for (let x = 0; x < 128; x += 4) {
    g.fillStyle = x % 8 === 0 ? 'rgba(135,158,188,0.42)' : 'rgba(255,255,255,0.6)';
    g.fillRect(x, 0, 2, 256);
  }
  // klassiska spår längs kanterna
  for (const x of [10, 22, 106, 118]) {
    g.fillStyle = 'rgba(105,128,158,0.7)';
    g.fillRect(x - 3, 0, 6, 256);
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.fillRect(x - 4, 0, 1, 256);
  }
  // skärspår (skating) – svaga diagonala streck
  g.strokeStyle = 'rgba(140,160,185,0.18)';
  g.lineWidth = 2;
  for (let y = 0; y < 256; y += 32) {
    g.beginPath(); g.moveTo(40, y); g.lineTo(64, y + 28); g.stroke();
    g.beginPath(); g.moveTo(88, y + 14); g.lineTo(64, y + 42); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function ribbon(points, width, tex, vScale) {
  // points: [{x,y,z,tx,tz,s}]
  const n = points.length;
  const pos = new Float32Array(n * 2 * 3), uv = new Float32Array(n * 2 * 2);
  const idx = [];
  points.forEach((p, i) => {
    const nx = -p.tz, nz = p.tx;
    pos.set([p.x + nx * width / 2, p.y, p.z + nz * width / 2, p.x - nx * width / 2, p.y, p.z - nz * width / 2], i * 6);
    uv.set([0, p.s / vScale, 1, p.s / vScale], i * 4);
    if (i < n - 1) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    map: tex, roughness: 0.8, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const m = new THREE.Mesh(geo, mat);
  m.receiveShadow = true;
  return m;
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
  scene.add(ribbon(pp, 3.4, tex, 9));

  // Markeringspinnar längs spåret (röda till vänster, blå till höger) var 25:e meter
  const poleGeo = new THREE.CylinderGeometry(0.025, 0.03, 1.3, 5).translate(0, 0.65, 0);
  const red = new THREE.InstancedMesh(poleGeo, new THREE.MeshStandardMaterial({ color: 0xd8312f, roughness: 0.5 }), 200);
  const blue = new THREE.InstancedMesh(poleGeo, new THREE.MeshStandardMaterial({ color: 0x1f5fbf, roughness: 0.5 }), 200);
  const m = new THREE.Matrix4();
  let i = 0;
  for (let s = 0; s < course.n && i < 200; s += 25, i++) {
    const [x, y, z] = course.pointAt(s);
    const [tx, tz] = course.tangentAt(s);
    m.makeTranslation(x - tz * 3.3, y, z + tx * 3.3); red.setMatrixAt(i, m);
    m.makeTranslation(x + tz * 3.3, y, z - tx * 3.3); blue.setMatrixAt(i, m);
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
  const inst = panels.map((mat) => new THREE.InstancedMesh(panelGeo, mat, 60));
  const counts = [0, 0, 0];
  const pm = new THREE.Matrix4(), pq = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), pv = new THREE.Vector3();
  for (let s = -120; s <= 120; s += 5) {
    if (Math.abs(s) < 8) continue; // öppning vid portalen
    const ss = (s + N) % N;
    const [x, , z] = course.pointAt(ss);
    const [tx, tz] = course.tangentAt(ss);
    for (const side of [-1, 1]) {
      const kind = (Math.round(s / 5) + (side > 0 ? 1 : 0) + 30) % 3;
      if (counts[kind] >= 60) continue;
      const px = x - tz * 4.2 * side, pz = z + tx * 4.2 * side;
      pq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(x - px, z - pz)); // texten vänd mot spåret
      pv.set(px, y + 0.45, pz);
      pm.compose(pv, pq, one);
      inst[kind].setMatrixAt(counts[kind]++, pm);
    }
  }
  inst.forEach((im, i) => { im.count = counts[i]; scene.add(im); });

  // Publik: instansierade figurer bakom staketet och på läktaren
  const bodyGeo = new THREE.CapsuleGeometry(0.22, 0.75, 2, 6).translate(0, 0.6, 0);
  const headGeo = new THREE.SphereGeometry(0.13, 6, 5).translate(0, 1.35, 0);
  const MAX = 520;
  const bodies = new THREE.InstancedMesh(bodyGeo, new THREE.MeshStandardMaterial({ roughness: 0.8 }), MAX);
  const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshStandardMaterial({ roughness: 0.8 }), MAX);
  const jackets = [0xd8312f, 0x1f5fbf, 0xffd23f, 0x2a9d8f, 0x222831, 0xf4a261, 0xffffff, 0x6d597a].map((c) => new THREE.Color(c));
  const hats = [0xd8312f, 0xffffff, 0x1f5fbf, 0x222831, 0xffd23f].map((c) => new THREE.Color(c));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  const crowd = [];
  let k = 0;
  const place = (x, yy, z, facing) => {
    if (k >= MAX) return;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), facing + (Math.random() - 0.5) * 0.6);
    const s = 0.9 + Math.random() * 0.2;
    sc.set(s, s, s);
    p.set(x, yy, z);
    m.compose(p, q, sc);
    bodies.setMatrixAt(k, m); heads.setMatrixAt(k, m);
    bodies.setColorAt(k, jackets[Math.floor(Math.random() * jackets.length)]);
    heads.setColorAt(k, hats[Math.floor(Math.random() * hats.length)]);
    crowd.push({ i: k, x, y: yy, z, q: q.clone(), s, ph: Math.random() * 6 });
    k++;
  };
  // längs staketen
  for (let s = -115; s <= 115; s += 1.6) {
    if (Math.abs(s) < 10) continue;
    const ss = (s + N) % N;
    const [x, , z] = course.pointAt(ss);
    const [tx, tz] = course.tangentAt(ss);
    for (const side of [-1, 1]) {
      if (Math.random() < 0.35) continue;
      const off = 5 + Math.random() * 1.8;
      const px = x - tz * off * side, pz = z + tx * off * side;
      place(px, course.terrainHeight(px, pz) * 0 + y, pz, Math.atan2(tz * side, -tx * side));
    }
  }
  // läktaren (samma ställe som läktarboxen i world.js)
  const [nx, nz] = course.normal;
  const [tx, tz] = course.tangentAt(0);
  const [sx, sz] = course.stadium;
  for (let row = 0; row < 5; row++) {
    for (let c = -18; c <= 18; c += 1.1) {
      if (Math.random() < 0.15) continue;
      const d = 71 + row * 1.5;
      place(sx - nx * d + tx * c, y + 6 + row * 0.0 - (4 - row) * 0, sz - nz * d + tz * c, Math.atan2(nx, nz));
    }
  }
  bodies.count = heads.count = k;
  for (const im of [bodies, heads]) { im.castShadow = true; im.instanceColor.needsUpdate = true; scene.add(im); }

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
  };
}

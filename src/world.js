// 3D-värld: terräng, himmel, skog, stadion och åkaren.
import * as THREE from 'three';
import { terrainHeight, smooth } from './course.js';

const SIZE = 1500;
const SEG = 150;

export function buildWorld(scene, course) {
  // Himmel: gradient-kupol
  const skyGeo = new THREE.SphereGeometry(1800, 24, 12);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {},
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vP; void main(){
      float h = clamp(vP.y, -0.1, 1.0);
      vec3 top = vec3(0.30,0.50,0.78), hor = vec3(0.82,0.88,0.94);
      vec3 c = mix(hor, top, pow(max(h,0.0), 0.6));
      gl_FragColor = vec4(c,1.0); }`,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);

  // Avlägsna berg (siluetter)
  const mtnMat = new THREE.MeshLambertMaterial({ color: 0xb7c3d0, flatShading: true });
  const snowCap = new THREE.MeshLambertMaterial({ color: 0xf2f5f8, flatShading: true });
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + Math.random() * 0.1;
    const r = 1250 + Math.random() * 200;
    const h = 180 + Math.random() * 260;
    const w = 220 + Math.random() * 200;
    const m = new THREE.Mesh(new THREE.ConeGeometry(w, h, 6), mtnMat);
    m.position.set(Math.cos(a) * r, h / 2 - 30, Math.sin(a) * r);
    m.rotation.y = Math.random() * 3;
    scene.add(m);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(w * 0.35, h * 0.35, 6), snowCap);
    cap.position.set(m.position.x, h - 30 - h * 0.175 + 1, m.position.z);
    cap.rotation.y = m.rotation.y;
    scene.add(cap);
  }

  // Terräng
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const snow = new THREE.Color(0xf4f7fa);
  const shade = new THREE.Color(0xdde6ee);
  const trackC = new THREE.Color(0xb4c4d6);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    let h = terrainHeight(x, z);
    const [d, e] = course.nearest(x, z);
    const w = smooth(16, 6, d);
    h = h * (1 - w) + (e - 0.08) * w;
    // stadionplatå
    const ds = Math.hypot(x - course.stadium[0], z - course.stadium[1]);
    const ws = smooth(110, 60, ds);
    h = h * (1 - ws) + course.stadiumElev * ws - 0.08 * ws;
    pos.setY(i, h);
    const n = 0.5 + 0.5 * Math.sin(x * 0.13) * Math.cos(z * 0.11);
    tmp.copy(snow).lerp(shade, n * 0.5);
    tmp.lerp(trackC, smooth(8, 2.5, d) * 0.85);
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const terrain = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 })
  );
  terrain.receiveShadow = true;
  scene.add(terrain);

  // Spårlinjer (klassiska spår + skatebana markeras med käppar)
  const lineMat = new THREE.LineBasicMaterial({ color: 0xa9b8c8, transparent: true, opacity: 0.7 });
  for (const off of [-2.2, 2.2]) {
    const pts = [];
    for (let s = 0; s <= course.n; s += 4) {
      const [x, y, z] = course.pointAt(s);
      const [tx, tz] = course.tangentAt(s);
      pts.push(new THREE.Vector3(x - tz * off, y + 0.05, z + tx * off));
    }
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
  }
  // Straffrunda
  {
    const pts = [];
    for (let d = 0; d <= 150; d += 2) {
      const [x, y, z] = course.penaltyPoint(d);
      pts.push(new THREE.Vector3(x, y + 0.05, z));
    }
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0xd04040 })));
  }

  // Skog (granar: stam + tre kjolar), instansierad
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 2.2, 5);
  trunkGeo.translate(0, 1.1, 0);
  const tiers = [
    new THREE.ConeGeometry(2.4, 3.6, 7).translate(0, 3.2, 0),
    new THREE.ConeGeometry(1.9, 3.0, 7).translate(0, 5.0, 0),
    new THREE.ConeGeometry(1.3, 2.6, 7).translate(0, 6.6, 0),
  ];
  const needle = new THREE.MeshStandardMaterial({ color: 0x1f3d2c, roughness: 0.9, flatShading: true });
  const snowy = new THREE.MeshStandardMaterial({ color: 0xe8eef2, roughness: 0.95, flatShading: true });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3426, roughness: 1 });
  const capGeo = new THREE.ConeGeometry(0.75, 1.2, 7).translate(0, 7.6, 0);

  const spots = [];
  let tries = 0;
  while (spots.length < 1100 && tries < 9000) {
    tries++;
    const x = (Math.random() - 0.5) * SIZE * 0.95;
    const z = (Math.random() - 0.5) * SIZE * 0.95;
    const [d] = course.nearest(x, z);
    if (d < 9) continue;
    if (Math.hypot(x - course.stadium[0], z - course.stadium[1]) < 90) continue;
    // tätare skog nära spåret ger fartkänsla
    if (d > 60 && Math.random() < 0.55) continue;
    spots.push([x, z]);
  }
  const count = spots.length;
  const mTrunk = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
  const mTiers = tiers.map((g) => new THREE.InstancedMesh(g, needle, count));
  const mCap = new THREE.InstancedMesh(capGeo, snowy, count);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  spots.forEach(([x, z], i) => {
    const [d, e] = course.nearest(x, z);
    let h = terrainHeight(x, z);
    const w = smooth(16, 6, d);
    h = h * (1 - w) + e * w;
    const s = 0.7 + Math.random() * 0.8;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 6.28);
    sc.set(s, s * (0.9 + Math.random() * 0.3), s);
    p.set(x, h - 0.2, z);
    m.compose(p, q, sc);
    mTrunk.setMatrixAt(i, m);
    mTiers.forEach((t) => t.setMatrixAt(i, m));
    mCap.setMatrixAt(i, m);
  });
  for (const im of [mTrunk, ...mTiers, mCap]) {
    im.castShadow = true;
    im.receiveShadow = false;
    scene.add(im);
  }

  const flags = buildStadium(scene, course);
  return { terrain, flags };
}

function buildStadium(scene, course) {
  const [sx, sz] = course.stadium;
  const y = course.stadiumElev;
  const [nx, nz] = course.normal;
  const [tx, tz] = course.tangentAt(0);
  const yaw = Math.atan2(tx, tz);

  // Start/mål-portal
  const post = new THREE.MeshStandardMaterial({ color: 0x1d4f91, roughness: 0.6 });
  const banner = new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.5 });
  const g = new THREE.Group();
  for (const s of [-5, 5]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 5, 0.5), post);
    m.position.set(s, 2.5, 0);
    m.castShadow = true;
    g.add(m);
  }
  const top = new THREE.Mesh(new THREE.BoxGeometry(10.5, 1.1, 0.4), banner);
  top.position.set(0, 5, 0);
  top.castShadow = true;
  g.add(top);
  g.position.set(sx, y, sz);
  g.rotation.y = yaw;
  scene.add(g);

  // Skjutvall: mattor och tavlor 50 m bort
  const mat = new THREE.MeshStandardMaterial({ color: 0x3b6e3b, roughness: 1 });
  const frame = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.7 });
  const black = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 });
  const [rx, rz] = course.rangePos;
  for (let i = -6; i <= 6; i++) {
    const cx = rx + tx * i * 3, cz = rz + tz * i * 3;
    const matM = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 2.2), mat);
    matM.position.set(cx, y + 0.03, cz);
    matM.rotation.y = yaw;
    matM.receiveShadow = true;
    scene.add(matM);
    const fx = cx + nx * 50, fz = cz + nz * 50;
    const fr = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.35, 0.1), frame);
    fr.position.set(fx, y + 0.8, fz);
    fr.rotation.y = Math.atan2(nx, nz);
    fr.castShadow = true;
    scene.add(fr);
    for (let k = -2; k <= 2; k++) {
      const d = new THREE.Mesh(new THREE.CircleGeometry(0.06, 12), black);
      d.position.set(fx + tx * k * 0.17 - nx * 0.06, y + 0.8, fz + tz * k * 0.17 - nz * 0.06);
      d.rotation.y = Math.atan2(-nx, -nz);
      scene.add(d);
    }
  }
  // Vall bakom tavlorna
  const berm = new THREE.Mesh(new THREE.BoxGeometry(44, 4, 6),
    new THREE.MeshStandardMaterial({ color: 0xe3eaf0, roughness: 1 }));
  berm.position.set(rx + nx * 55, y + 1.2, rz + nz * 55);
  berm.rotation.y = yaw;
  scene.add(berm);
  // Läktare
  const stand = new THREE.Mesh(new THREE.BoxGeometry(40, 6, 8),
    new THREE.MeshStandardMaterial({ color: 0x8a96a3, roughness: 0.8 }));
  stand.position.set(sx - nx * 75, y + 3, sz - nz * 75);
  stand.rotation.y = yaw;
  stand.castShadow = true;
  scene.add(stand);

  // Vindflaggor längs vallen (vid mattorna och vid tavlorna)
  const flags = [];
  const poleM = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.4, metalness: 0.3 });
  const clothM = new THREE.MeshStandardMaterial({ color: 0xe8402b, roughness: 0.8, side: THREE.DoubleSide });
  const right = [-nz, nx];
  for (const [along, out] of [[-21, 4], [21, 4], [-21, 48], [0, 46], [21, 48]]) {
    const fx = rx + tx * along + nx * out, fz = rz + tz * along + nz * out;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 4, 6), poleM);
    pole.position.set(fx, y + 2, fz);
    pole.castShadow = true;
    scene.add(pole);
    const yawG = new THREE.Group();
    yawG.position.set(fx, y + 3.95, fz);
    const droop = new THREE.Group();
    yawG.add(droop);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.7, 6, 1).translate(0.55, -0.35, 0), clothM);
    cloth.castShadow = true;
    droop.add(cloth);
    scene.add(yawG);
    flags.push({ yawG, droop, cloth, right, phase: Math.random() * 6 });
  }
  return flags;
}

// Vind i m/s (+ = åt höger sett från skytten)
export function updateFlags(flags, wind, t) {
  const strength = Math.min(1, Math.abs(wind) / 4.5);
  const dir = wind >= 0 ? 1 : -1;
  const a = 0.12 + strength * 1.35;
  for (const f of flags) {
    const [rx, rz] = f.right;
    f.yawG.rotation.y = Math.atan2(-rz * dir, rx * dir);
    f.droop.rotation.z = -(Math.PI / 2 - a) + Math.sin(t * 3 + f.phase) * 0.05 * strength;
    f.cloth.rotation.x = Math.sin(t * (3 + strength * 9) + f.phase) * (0.1 + 0.25 * strength);
  }
}

// ---------- Åkaren ----------
export function buildSkier(bibColor = 0xffd23f, suitColor = 0x1d4f91) {
  const suit = new THREE.MeshStandardMaterial({ color: suitColor, roughness: 0.55 });
  const bib = new THREE.MeshStandardMaterial({ color: bibColor, roughness: 0.7 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xe0b48f, roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5 });
  const skiM = new THREE.MeshStandardMaterial({ color: 0xd0302a, roughness: 0.4 });
  const pole = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.3, metalness: 0.4 });

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const mk = (geo, mat, parent, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };

  // Ben (höft-pivot) med skidor
  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.12, 0.95, 0);
    body.add(hip);
    mk(new THREE.CapsuleGeometry(0.075, 0.38, 3, 8), suit, hip, 0, -0.25, 0);
    const knee = new THREE.Group();
    knee.position.set(0, -0.48, 0);
    hip.add(knee);
    mk(new THREE.CapsuleGeometry(0.065, 0.36, 3, 8), suit, knee, 0, -0.22, 0);
    mk(new THREE.BoxGeometry(0.11, 0.1, 0.26), dark, knee, 0, -0.45, 0.04);
    const ski = mk(new THREE.BoxGeometry(0.07, 0.025, 1.9), skiM, knee, 0, -0.5, 0.15);
    legs.push({ hip, knee, ski, side });
  }

  // Bål
  const torso = new THREE.Group();
  torso.position.set(0, 1.0, 0);
  body.add(torso);
  mk(new THREE.CapsuleGeometry(0.17, 0.42, 4, 10), suit, torso, 0, 0.3, 0);
  const bibM = mk(new THREE.BoxGeometry(0.36, 0.34, 0.36), bib, torso, 0, 0.36, 0);
  bibM.scale.set(1, 1, 0.92);
  // Gevär på ryggen
  const rifle = mk(new THREE.BoxGeometry(0.06, 0.95, 0.12), dark, torso, 0.05, 0.38, -0.24);
  rifle.rotation.z = 0.35;
  // Huvud
  const head = new THREE.Group();
  head.position.set(0, 0.72, 0.02);
  torso.add(head);
  mk(new THREE.SphereGeometry(0.11, 12, 10), skin, head, 0, 0, 0);
  const hat = mk(new THREE.SphereGeometry(0.118, 12, 8, 0, Math.PI * 2, 0, Math.PI / 1.8), suit, head, 0, 0.015, 0);
  hat.castShadow = true;
  mk(new THREE.BoxGeometry(0.2, 0.05, 0.05), dark, head, 0, 0.02, 0.1); // glasögon

  // Armar med stavar
  const arms = [];
  for (const side of [-1, 1]) {
    const sh = new THREE.Group();
    sh.position.set(side * 0.22, 0.52, 0);
    torso.add(sh);
    mk(new THREE.CapsuleGeometry(0.055, 0.28, 3, 8), suit, sh, 0, -0.18, 0);
    const el = new THREE.Group();
    el.position.set(0, -0.36, 0);
    sh.add(el);
    mk(new THREE.CapsuleGeometry(0.05, 0.24, 3, 8), suit, el, 0, -0.15, 0);
    mk(new THREE.SphereGeometry(0.055, 8, 6), dark, el, 0, -0.32, 0);
    const p = mk(new THREE.CylinderGeometry(0.012, 0.012, 1.55, 6), pole, el, 0, -1.05, -0.05);
    p.rotation.x = 0;
    arms.push({ sh, el, side });
  }

  return { root, body, torso, legs, arms, head, phase: 0 };
}

// push: 1 → 0 efter ett skjut; side: vilket ben skär
export function animateSkier(sk, dt, push, side, v, grade, mode = 'ski') {
  sk.phase += dt * (1 + v * 0.3);
  const crouch = mode === 'prone' ? 0 : 1;
  if (mode === 'prone') {
    sk.body.rotation.x = Math.PI / 2 - 0.15;
    sk.body.position.y = 0.18;
    sk.torso.rotation.x = 0;
    for (const a of sk.arms) { a.sh.rotation.x = -2.6; a.el.rotation.x = 0.4; }
    for (const l of sk.legs) {
      l.hip.rotation.set(0, 0, l.side * 0.15); l.knee.rotation.x = 0;
      l.ski.rotation.x = -(Math.PI / 2 - 0.15); l.ski.position.y = -0.5;
    }
    return;
  }
  sk.body.rotation.x = 0;
  if (mode === 'stand') {
    sk.body.position.y = 0;
    sk.torso.rotation.x = 0;
    sk.torso.rotation.y = -0.6;
    for (const a of sk.arms) { a.sh.rotation.x = -1.3; a.sh.rotation.z = a.side * 0.2; a.el.rotation.x = -0.8; }
    for (const l of sk.legs) { l.hip.rotation.set(0, l.side * 0.1, l.side * 0.08); l.knee.rotation.x = 0; }
    levelSkis(sk);
    return;
  }
  sk.torso.rotation.y = 0;
  // Stavtag: armar fram → drag bakåt; bålen fälls
  const p = push; // 1 precis efter skjut
  const armSwing = p > 0 ? -1.4 + (1 - p) * 2.0 : -1.4 + Math.min(1, 0.5) * 0.4;
  const lean = 0.25 + Math.max(0, grade) * 1.5 + p * 0.35 * crouch;
  sk.torso.rotation.x = lean;
  sk.body.position.y = -p * 0.1;
  for (const a of sk.arms) {
    a.sh.rotation.x = armSwing;
    a.sh.rotation.z = a.side * 0.12;
    a.el.rotation.x = -0.35 + p * 0.25;
  }
  // Skär: V-ställning, viktöverföring åt pushSide
  const skate = grade > -0.03 && v > 0.5;
  const vAngle = skate ? 0.28 + Math.max(0, grade) * 1.2 : 0.02;
  for (const l of sk.legs) {
    const active = l.side === side;
    l.hip.rotation.y = -l.side * vAngle;
    l.hip.rotation.z = l.side * (active ? 0.18 * p : 0.04);
    l.hip.rotation.x = -0.25 - (active ? 0 : p * 0.2);
    l.knee.rotation.x = 0.45 + (active ? p * 0.25 : 0);
    l.ski.position.y = -0.5 + (active ? 0 : p * 0.12);
  }
  levelSkis(sk);
  // tuck i utförsbackar utan skjut
  if (grade < -0.05 && p < 0.05) {
    sk.torso.rotation.x = 0.9;
    for (const a of sk.arms) a.sh.rotation.x = -0.9;
    for (const l of sk.legs) { l.hip.rotation.x = -0.7; l.knee.rotation.x = 1.0; }
    sk.body.position.y = -0.25;
    levelSkis(sk);
  }
}

function levelSkis(sk) {
  for (const l of sk.legs) l.ski.rotation.x = -(l.hip.rotation.x + l.knee.rotation.x);
}

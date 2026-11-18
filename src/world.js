// 3D-värld: terräng, himmel, skog, stadion och åkaren.
import * as THREE from 'three';
import { smooth } from './course.js';
import { buildTrack, buildStadiumDetails, buildPortals } from './scenery.js';

export const SUN_DIR = new THREE.Vector3(-0.5, 0.75, 0.35).normalize();

const SIZE_DEFAULT = 1500;
const SEG = 150;

export function buildWorld(scene, course) {
  // Himmel: gradient-kupol
  const skyGeo = new THREE.SphereGeometry(1800, 24, 12);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { sun: { value: SUN_DIR } },
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 sun; varying vec3 vP; void main(){
      float h = clamp(vP.y, -0.1, 1.0);
      vec3 top = vec3(0.22,0.45,0.80), hor = vec3(0.80,0.87,0.94);
      vec3 c = mix(hor, top, pow(max(h,0.0), 0.55));
      float d = max(dot(normalize(vP), sun), 0.0);
      c += vec3(1.0,0.92,0.75) * (pow(d, 900.0) * 3.0 + pow(d, 12.0) * 0.18);
      gl_FragColor = vec4(c,1.0); }`,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);

  // Terräng (riktig höjdkarta täcker hm.size meter, annars procedurell)
  const SIZE = course.hm ? Math.min(2400, course.hm.size * course.k) : SIZE_DEFAULT;
  // Avlägsna berg (siluetter) utanför terrängen
  const mtnMat = new THREE.MeshLambertMaterial({ color: 0xb7c3d0, flatShading: true });
  const snowCap = new THREE.MeshLambertMaterial({ color: 0xf2f5f8, flatShading: true });
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + Math.random() * 0.1;
    const r = Math.max(1250, SIZE / 2 + 250) + Math.random() * 200;
    const h = (course.hm ? 380 : 180) + Math.random() * 260;
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
    let h = course.terrainHeight(x, z);
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
  geo.computeVertexNormals();
  // Sten och barmark i branta sluttningar, lite skugga i skogen
  const nrm = geo.attributes.normal;
  const rock = new THREE.Color(0x7d8288), rockDark = new THREE.Color(0x5a5e63);
  for (let i = 0; i < pos.count; i++) {
    const ny = nrm.getY(i);
    const steep = smooth(0.86, 0.7, ny);
    if (steep <= 0) continue;
    const x = pos.getX(i), z = pos.getZ(i);
    const n = 0.5 + 0.5 * Math.sin(x * 0.31 + z * 0.17) * Math.cos(z * 0.23);
    tmp.setRGB(colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2]).lerp(rock.clone().lerp(rockDark, n), steep * (0.55 + 0.45 * n));
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const terrain = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 })
  );
  terrain.receiveShadow = true;
  scene.add(terrain);

  // Pistat spår, straffrunda och markeringspinnar
  buildTrack(scene, course);

  // Skog (granar: stam + tre kjolar), instansierad
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 2.2, 5);
  trunkGeo.translate(0, 1.1, 0);
  // Smal alpin gran: fyra kjolar i en geometri, snö på ovansidan av varje kjol
  const mergeCones = (list) => {
    const parts = list.map(([r, h, y]) => new THREE.ConeGeometry(r, h, 8, 1, true).translate(0, y, 0));
    const pos = [], nor = [], idx = [];
    let off = 0;
    for (const g of parts) {
      const gi = g.toNonIndexed();
      pos.push(...gi.attributes.position.array); nor.push(...gi.attributes.normal.array);
      off += gi.attributes.position.count;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    return out;
  };
  const tiers = [
    mergeCones([[2.1, 3.0, 2.9], [1.75, 2.7, 4.3], [1.35, 2.4, 5.6], [0.95, 2.1, 6.8], [0.5, 1.6, 7.9]]),
  ];
  const needle = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true, side: THREE.DoubleSide });
  const snowy = new THREE.MeshStandardMaterial({ color: 0xf0f4f7, roughness: 0.95, flatShading: true, side: THREE.DoubleSide });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3426, roughness: 1 });
  // snö: lite mindre och kortare kjolar strax ovanför varje grön kjol
  const capGeo = mergeCones([[1.7, 1.0, 3.95], [1.4, 0.95, 5.25], [1.05, 0.85, 6.45], [0.72, 0.75, 7.55], [0.35, 0.6, 8.5]]);

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
  // Skogen delas i rutor så att bara synliga rutor ritas (även i skuggpasset)
  const CH = 4;
  const chunks = Array.from({ length: CH * CH }, () => []);
  for (const sp of spots) {
    const cx = Math.min(CH - 1, Math.max(0, Math.floor(((sp[0] / SIZE) + 0.5) * CH)));
    const cz = Math.min(CH - 1, Math.max(0, Math.floor(((sp[1] / SIZE) + 0.5) * CH)));
    chunks[cz * CH + cx].push(sp);
  }
  const greens = [0x1c3a2a, 0x234634, 0x18331f, 0x2b4a36, 0x203d2e].map((c) => new THREE.Color(c));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  for (const list of chunks) {
    if (!list.length) continue;
    const count = list.length;
    const mTrunk = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
    const mTier = new THREE.InstancedMesh(tiers[0], needle, count);
    const mCap = new THREE.InstancedMesh(capGeo, snowy, count);
    list.forEach(([x, z], i) => {
      const [d, e] = course.nearest(x, z);
      let h = course.terrainHeight(x, z);
      const w = smooth(16, 6, d);
      h = h * (1 - w) + e * w;
      const s = 0.7 + Math.random() * 0.8;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 6.28);
      sc.set(s, s * (0.9 + Math.random() * 0.3), s);
      p.set(x, h - 0.2, z);
      m.compose(p, q, sc);
      mTrunk.setMatrixAt(i, m);
      mTier.setMatrixAt(i, m);
      mCap.setMatrixAt(i, m);
      mTier.setColorAt(i, greens[i % greens.length]);
    });
    for (const im of [mTrunk, mTier, mCap]) {
      im.castShadow = im !== mCap; // snön på grenarna behöver ingen egen skugga
      im.receiveShadow = false;
      im.computeBoundingSphere();
      scene.add(im);
    }
  }

  const flags = buildStadium(scene, course);
  const animateCrowd = buildStadiumDetails(scene, course);
  const setClock = buildPortals(scene, course);
  return { terrain, flags, animateCrowd, setClock };
}

function buildStadium(scene, course) {
  const [sx, sz] = course.stadium;
  const y = course.stadiumElev;
  const [nx, nz] = course.normal;
  const [tx, tz] = course.tangentAt(0);
  const yaw = Math.atan2(tx, tz);

  // (Start- och målportal, läktare och publik byggs i scenery.js)

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
function bibTexture(num, color) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#' + new THREE.Color(color).getHexString();
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#ffffff';
  g.fillRect(14, 30, 100, 70);
  g.fillStyle = '#111';
  g.font = '800 58px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(num), 64, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Skida med uppböjd spets (längd 1.85 m, spetsen mot +z)
function skiGeometry() {
  const g = new THREE.BoxGeometry(0.065, 0.018, 1.85, 1, 1, 16);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i);
    if (z > 0.62) { const t = (z - 0.62) / 0.3; p.setY(i, p.getY(i) + t * t * 0.07); }
    if (z < -0.88) p.setY(i, p.getY(i) + (-0.88 - z) * 0.2);
  }
  g.computeVertexNormals();
  return g;
}

export function buildSkier(bibColor = 0xffd23f, suitColor = 0x1d4f91, bibNo = 7) {
  const base = new THREE.Color(suitColor);
  const suit = new THREE.MeshStandardMaterial({ color: base, roughness: 0.45, metalness: 0.05 });
  const suit2 = new THREE.MeshStandardMaterial({ color: base.clone().offsetHSL(0, 0, -0.15), roughness: 0.5 });
  const stripe = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
  const bibMat = new THREE.MeshStandardMaterial({ map: bibTexture(bibNo, bibColor), roughness: 0.75 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xe0b48f, roughness: 0.75 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.45 });
  const glove = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.7 });
  const lens = new THREE.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.1, metalness: 0.8 });
  const skiM = new THREE.MeshStandardMaterial({ color: 0xd8312f, roughness: 0.3, metalness: 0.1 });
  const carbon = new THREE.MeshStandardMaterial({ color: 0x262626, roughness: 0.25, metalness: 0.5 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 0.6 });

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const mk = (geo, mat, parent, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };

  // Höft/bäcken
  mk(new THREE.CapsuleGeometry(0.13, 0.12, 4, 10).rotateZ(Math.PI / 2), suit2, body, 0, 0.98, 0);

  // Ben: lår → knä → smalben → pjäxa → skida
  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.1, 0.97, 0);
    body.add(hip);
    const thigh = mk(new THREE.CapsuleGeometry(0.075, 0.34, 4, 10), suit, hip, 0, -0.23, 0);
    thigh.scale.set(1, 1, 1.08);
    mk(new THREE.BoxGeometry(0.02, 0.36, 0.02), stripe, hip, side * 0.072, -0.23, 0);
    const knee = new THREE.Group();
    knee.position.set(0, -0.46, 0);
    hip.add(knee);
    mk(new THREE.CapsuleGeometry(0.058, 0.34, 4, 10), suit, knee, 0, -0.21, 0);
    // pjäxa
    mk(new THREE.BoxGeometry(0.1, 0.13, 0.27), dark, knee, 0, -0.44, 0.04);
    mk(new THREE.BoxGeometry(0.104, 0.04, 0.06), skiM, knee, 0, -0.4, -0.07);
    const ski = new THREE.Group();
    ski.position.set(0, -0.515, 0.12);
    knee.add(ski);
    mk(skiGeometry(), skiM, ski);
    mk(new THREE.BoxGeometry(0.07, 0.025, 0.2), dark, ski, 0, 0.018, -0.08); // bindning
    legs.push({ hip, knee, ski, side });
  }

  // Bål (avsmalnande), nummerlapp fram och bak
  const torso = new THREE.Group();
  torso.position.set(0, 1.02, 0);
  body.add(torso);
  const chest = mk(new THREE.CylinderGeometry(0.17, 0.135, 0.5, 12), suit, torso, 0, 0.27, 0);
  chest.scale.set(1, 1, 0.68);
  mk(new THREE.SphereGeometry(0.17, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), suit, torso, 0, 0.51, 0).scale.set(1.12, 0.45, 0.68);
  const bibFront = mk(new THREE.PlaneGeometry(0.27, 0.3), bibMat, torso, 0, 0.3, 0.103);
  bibFront.rotation.x = -0.06;
  const bibBack = mk(new THREE.PlaneGeometry(0.27, 0.3), bibMat, torso, 0, 0.3, -0.103);
  bibBack.rotation.y = Math.PI;
  // Gevär med sele på ryggen
  const rifle = new THREE.Group();
  rifle.position.set(0.02, 0.33, -0.17);
  rifle.rotation.z = 0.42;
  torso.add(rifle);
  mk(new THREE.BoxGeometry(0.055, 0.62, 0.11), wood, rifle, 0, -0.08, 0);        // stock
  mk(new THREE.CylinderGeometry(0.011, 0.011, 0.5, 6), carbon, rifle, 0, 0.47, 0.02); // pipa
  mk(new THREE.BoxGeometry(0.04, 0.12, 0.08), carbon, rifle, 0, 0.2, 0.05);     // magasin/sikte
  for (const sx of [-0.11, 0.11]) mk(new THREE.BoxGeometry(0.03, 0.5, 0.02), dark, torso, sx, 0.3, -0.105);

  // Huvud: hals, ansikte, mössa med pannband, solglasögon
  mk(new THREE.CylinderGeometry(0.045, 0.05, 0.08, 8), skin, torso, 0, 0.59, 0.01);
  const head = new THREE.Group();
  head.position.set(0, 0.71, 0.02);
  torso.add(head);
  mk(new THREE.SphereGeometry(0.105, 14, 12), skin, head).scale.set(0.92, 1.05, 1);
  mk(new THREE.SphereGeometry(0.11, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.1), suit, head, 0, 0.012, -0.004);
  mk(new THREE.TorusGeometry(0.1, 0.018, 6, 18).rotateX(Math.PI / 2), stripe, head, 0, 0.03, 0);
  const glasses = mk(new THREE.CylinderGeometry(0.104, 0.104, 0.045, 16, 1, true, -1.1, 2.2), lens, head, 0, 0.0, 0.0);
  glasses.scale.set(1, 1, 1.02);

  // Armar: överarm → armbåge → underarm → handske → stav (grepp, trissa)
  const arms = [];
  for (const side of [-1, 1]) {
    const sh = new THREE.Group();
    sh.position.set(side * 0.2, 0.47, 0);
    torso.add(sh);
    mk(new THREE.SphereGeometry(0.06, 8, 6), suit, sh);
    mk(new THREE.CapsuleGeometry(0.05, 0.24, 4, 8), suit, sh, 0, -0.16, 0);
    const el = new THREE.Group();
    el.position.set(0, -0.32, 0);
    sh.add(el);
    mk(new THREE.CapsuleGeometry(0.045, 0.22, 4, 8), suit, el, 0, -0.14, 0);
    mk(new THREE.SphereGeometry(0.05, 8, 6), glove, el, 0, -0.29, 0.01).scale.set(0.9, 1.1, 1.2);
    const pole = new THREE.Group();
    pole.position.set(0, -0.3, 0.02);
    pole.rotation.x = -0.12;
    el.add(pole);
    mk(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 6), dark, pole, 0, 0.0, 0);          // grepp
    mk(new THREE.CylinderGeometry(0.009, 0.006, 1.55, 6), carbon, pole, 0, -0.78, 0);    // stav
    mk(new THREE.CylinderGeometry(0.035, 0.035, 0.008, 10), dark, pole, 0, -1.48, 0);   // trissa
    arms.push({ sh, el, side, pole });
  }

  return { root, body, torso, legs, arms, head, phase: 0 };
}

// push: 1 → 0 efter ett skjut; side: vilket ben skär
export function animateSkier(sk, dt, push, side, v, grade, mode = 'ski') {
  sk.phase += dt * (1 + v * 0.3);
  sk.body.position.x = 0;
  sk.body.rotation.z = 0;
  for (const l of sk.legs) l.ski.rotation.y = 0;
  const crouch = mode === 'prone' ? 0 : 1;
  if (mode === 'fall') {
    // t: 0 → FALL_TIME. Snubblar åt sidan (0–0,35 s), ligger, reser sig (sista 0,6 s)
    const t = sk.fallT || 0, T = 2.6;
    const down = t < 0.35 ? t / 0.35 : t > T - 0.6 ? Math.max(0, (T - t) / 0.6) : 1;
    const e = down * down * (3 - 2 * down);
    sk.body.rotation.set(0.25 * e, 0, 1.42 * e * (sk.fallSide || 1));
    sk.body.position.set(0, 0.16 * e, 0); // kroppen roterar kring fötterna och hamnar liggande på snön
    sk.torso.rotation.set(0.3 * e, 0, 0);
    for (const a of sk.arms) { a.sh.rotation.set(-0.6 - e * 1.2, 0, a.side * 0.5 * e); a.el.rotation.x = -0.5; }
    for (const l of sk.legs) { l.hip.rotation.set(-0.3 * e, l.side * 0.3 * e, l.side * 0.2 * e); l.knee.rotation.x = 0.6 * e; }
    levelSkis(sk);
    return;
  }
  if (mode === 'cheer' || mode === 'standstill') {
    const cheer = mode === 'cheer';
    const t = sk.phase;
    sk.body.rotation.x = 0;
    sk.torso.rotation.set(0, 0, 0);
    sk.body.position.y = cheer ? Math.max(0, Math.sin(t * 6)) * 0.25 : 0;
    for (const a of sk.arms) {
      a.sh.rotation.x = cheer ? -2.9 + Math.sin(t * 6 + a.side) * 0.25 : -0.2;
      a.sh.rotation.z = a.side * (cheer ? -0.35 : 0.1);
      a.el.rotation.x = cheer ? -0.2 : -0.3;
    }
    for (const l of sk.legs) {
      l.hip.rotation.set(0, 0, l.side * 0.05);
      l.knee.rotation.x = cheer ? Math.max(0, Math.sin(t * 6)) * 0.3 : 0;
    }
    levelSkis(sk);
    return;
  }
  if (mode === 'prone') {
    sk.body.rotation.x = Math.PI / 2 - 0.15;
    sk.body.position.y = 0.18;
    sk.torso.rotation.x = 0;
    for (const a of sk.arms) { a.sh.rotation.x = -2.6; a.el.rotation.x = 0.4; }
    for (const l of sk.legs) {
      l.hip.rotation.set(0, 0, l.side * 0.15); l.knee.rotation.x = 0;
      l.ski.rotation.x = -(Math.PI / 2 - 0.15); l.ski.position.y = -0.515;
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
  // Stavtag: armar fram → drag bakåt; bålen fälls (bara om stavtag-knappen togs)
  const p = push; // 1 precis efter skjut
  const pp = sk.poleOn === false ? 0 : p;   // stavtag
  const pe = sk.edgeOn === false ? 0 : p;   // skär
  const armSwing = pp > 0 ? -1.4 + (1 - pp) * 2.0 : -1.4 + Math.min(1, 0.5) * 0.4;
  const lean = 0.25 + Math.max(0, grade) * 1.5 + pp * 0.35 * crouch;
  sk.torso.rotation.x = lean;
  sk.body.position.y = -Math.max(pp, pe * 0.6) * 0.1;
  for (const a of sk.arms) {
    a.sh.rotation.x = armSwing;
    a.sh.rotation.z = a.side * 0.12;
    a.el.rotation.x = -0.35 + pp * 0.25;
  }
  // Skär: skidorna parallella, det skärande benet vinklas utåt under skjutet
  // och foten förs ut åt sidan, så att skidorna aldrig korsas.
  const skate = grade > -0.03 && v > 0.5;
  const vMax = 0.22 + Math.max(0, grade) * 0.9;
  for (const l of sk.legs) {
    const active = l.side === side;
    const a = skate && active ? vMax * pe : 0;
    l.hip.rotation.y = 0;
    l.ski.rotation.y = l.side * a;
    l.hip.rotation.z = l.side * (active ? 0.24 * pe : 0.035);
    l.hip.rotation.x = -0.25 - (active ? 0 : pe * 0.2);
    l.knee.rotation.x = 0.45 + (active ? pe * 0.25 : 0);
    l.ski.position.y = -0.515 + (active ? 0 : pe * 0.12);
  }
  levelSkis(sk);
  // viktöverföring: kroppen glider över mot glidbenet
  sk.body.position.x = skate ? side * 0.07 * (0.4 + 0.6 * pe) : 0;
  sk.body.rotation.z = skate ? -side * 0.06 * pe : 0;
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

// Andra spelare i multiplayer som åkare i 3D (inte bara prickar på minikartan).
// Live-positionen kommer 4 ggr/s (p = total sträcka, st = läge, pd = sträcka i läget),
// så här jämnas rörelsen ut: farten skattas och positionen förutsägs mellan uppdateringarna.
import * as THREE from 'three';
import { LAP_LEN, TIME_SCALE, FINISH_LEN } from './course.js?v=202611182122';
import { buildSkier, animateSkier } from './world.js?v=202611182122';

function nameTag(name, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 34px system-ui, sans-serif';
  const w = Math.min(244, g.measureText(name).width + 34);
  g.fillStyle = 'rgba(10,20,35,0.72)';
  g.beginPath(); g.roundRect((256 - w) / 2, 8, w, 48, 14); g.fill();
  g.fillStyle = '#' + color.toString(16).padStart(6, '0');
  g.beginPath(); g.arc((256 - w) / 2 + 17, 32, 7, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(name, 128 + 8, 33, 200);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, sizeAttenuation: false }));
  sp.scale.set(0.4, 0.1, 1); // fast storlek på skärmen, läsbar även på avstånd
  sp.position.y = 2.25;
  sp.renderOrder = 10;
  return sp;
}

export class Rivals {
  constructor(scene, course) {
    this.scene = scene;
    this.course = course;
    this.map = new Map();
  }

  clear() {
    for (const r of this.map.values()) this.scene.remove(r.sk.root);
    this.map.clear();
  }

  // list: [{ id, name, color, st, progress, pd, done }]
  update(dt, list, now, camPos) {
    this.camPos = camPos;
    const seen = new Set();
    let r0tag;
    list.forEach((c, idx) => {
      if (!c.id) return;
      seen.add(c.id);
      let r = this.map.get(c.id);
      if (!r) {
        const sk = buildSkier(0xffffff, c.color, idx + 2);
        r0tag = nameTag(c.name || '?', c.color);
        sk.root.add(r0tag);
        this.scene.add(sk.root);
        r = { tag: r0tag, sk, st: c.st, disp: 0, target: 0, vEst: 0, lastVal: null, lastT: now, push: 0, side: 1, strokeT: 0, slot: idx };
        this.map.set(c.id, r);
      }
      r.slot = idx;
      // värdet som rör sig i det aktuella läget
      const val = c.st === 's' ? c.progress : c.pd;
      if (c.st !== r.st) { r.st = c.st; r.disp = val; r.vEst = 0; r.lastVal = val; r.lastT = now; }
      if (val !== r.lastVal) {
        const span = Math.max(0.1, now - r.lastT);
        const v = (val - (r.lastVal ?? val)) / span;
        if (v >= 0 && v < 80) r.vEst += (v - r.vEst) * 0.5;
        r.lastVal = val; r.lastT = now;
      } else if (now - r.lastT > 1.5) r.vEst *= 0.9; // inga nya data: sakta in
      r.target = val;
      this.place(r, c, dt);
    });
    for (const [id, r] of this.map) if (!seen.has(id)) { this.scene.remove(r.sk.root); this.map.delete(id); }
  }

  place(r, c, dt) {
    const course = this.course;
    const sk = r.sk;
    const moving = r.st === 's' || r.st === 'p' || r.st === 'm' || r.st === 't';
    if (moving) {
      if (Math.abs(r.target - r.disp) > 60) r.disp = r.target;  // långt efter (t.ex. fliken låg i bakgrunden): hoppa
      r.disp += r.vEst * dt;                                    // förutsäg
      r.disp += (r.target - r.disp) * (1 - Math.exp(-dt * 2.5)); // korrigera mot senaste data
      r.disp = Math.min(r.disp, r.target + Math.max(4, r.vEst * 0.5));
    }
    // sidoförskjutning så att åkare inte ligger exakt i varandra
    const lat = ((r.slot % 2) ? 1 : -1) * (1.4 + 0.6 * Math.floor(r.slot / 2));
    let x, y, z, tx, tz, mode = 'ski', grade = 0;
    if (r.st === 't' && course.transits?.[c.tk]) {
      // på väg mellan vallen, straffrundan och banan
      const path = course.transits[c.tk];
      const q = path.at(Math.min(path.len, Math.max(0, r.disp)));
      x = q.x; y = q.y; z = q.z; tx = q.tx; tz = q.tz;
    } else if (r.st === 'p') {
      [x, y, z] = course.penaltyPoint(r.disp);
      [tx, tz] = course.penaltyTangent(r.disp);
    } else if (r.st === 'm') {
      const d = Math.min(FINISH_LEN, r.disp);
      [x, y, z] = course.finishPoint(d);
      [tx, tz] = course.finishDir;
    } else if (r.st === 'r') {
      // på skjutvallen: egen matta bredvid min
      const [t0x, t0z] = course.tangentAt(0);
      const off = 3.2 * (r.slot + 1) * (r.slot % 2 ? -1 : 1);
      x = course.rangePos[0] + t0x * off; z = course.rangePos[1] + t0z * off; y = course.stadiumElev;
      [tx, tz] = course.normal;
      const T = this.track || course;
      const lap = Math.round((c.progress || 0) / T.n);
      const kind = (this.shoots || ['prone', 'standing'])[lap - 1] || 'standing';
      mode = kind === 'prone' ? 'prone' : 'stand';
    } else if (r.st === 'f' || c.done) {
      const [fx, fy, fz] = course.finishPoint(FINISH_LEN);
      const [dx, dz] = course.finishDir;
      const off = 6 + 1.6 * r.slot;
      x = fx + dx * off - dz * lat * 1.5; y = fy; z = fz + dz * off + dx * lat * 1.5;
      tx = -dx; tz = -dz; // vänd mot upploppet och heja
      mode = 'cheer';
    } else {
      const T = this.track || course, N = T.n;
      const s = ((r.disp % N) + N) % N;
      [x, y, z] = T.pointAt(s);
      [tx, tz] = T.tangentAt(s);
      grade = T.gradeAt(s);
    }
    if (mode === 'ski') { x += -tz * lat; z += tx * lat; }
    sk.root.position.set(x, y, z);
    // långt borta: dölj (prestanda); namnskylten bara när åkaren är någorlunda nära
    if (this.camPos) {
      const d = this.camPos.distanceTo(sk.root.position);
      sk.root.visible = d < 450;
      r.tag.visible = d < 160;
    }
    sk.root.rotation.y = Math.atan2(tx, tz);
    // Simulerade tag i takt med farten
    const v = moving ? r.vEst / TIME_SCALE : 0;
    if (mode === 'ski' && v > 0.6) {
      r.strokeT -= dt;
      if (r.strokeT <= 0) {
        const f = Math.min(1.8, Math.max(0.5, 0.8 + grade * 5)) * (r.st === 'm' ? 2 : 1);
        r.strokeT = 1 / f;
        r.push = 1; r.side *= -1;
        if (this.onStroke) this.onStroke(c.id, r.st === 'm' ? 1 : 0.7);
      }
    }
    r.push = Math.max(0, r.push - dt * 2.2);
    sk.poleOn = true; sk.edgeOn = true;
    animateSkier(sk, dt, r.push, r.side, v, grade, mode);
  }
}

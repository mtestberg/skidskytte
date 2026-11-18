// Animerad prisutdelning: pall vid stadion, topp tre kliver upp och firar, konfetti.
import * as THREE from 'three';
import { buildSkier, animateSkier } from './world.js?v=202611182122';

const HEIGHTS = [1.1, 0.75, 0.5];   // 1:a, 2:a, 3:e
const X = [0, -1.95, 1.95];          // 1:an i mitten

export class Ceremony {
  constructor(scene, course) {
    this.scene = scene;
    this.course = course;
    const [sx, sz] = course.stadium;
    const [nx, nz] = course.normal;
    const [tx, tz] = course.tangentAt(0);
    this.y = course.stadiumElev;
    // Pallen står på stadion, vänd mot kameran (längs normalen)
    // Pallen står på stadion framför läktaren (publiken i bakgrunden)
    this.origin = new THREE.Vector3(sx + nx * 1 - tx * 6, this.y, sz + nz * 1 - tz * 6);
    this.side = new THREE.Vector3(tx, 0, tz);
    this.front = new THREE.Vector3(nx, 0, nz);
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    const mats = [0xffd23f, 0xc0c7cf, 0xcd7f32].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.2 }));
    const white = new THREE.MeshStandardMaterial({ color: 0xf5f7fa, roughness: 0.8 });
    for (let i = 0; i < 3; i++) {
      const h = HEIGHTS[i];
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.8, h, 1.3), white);
      box.position.copy(this.at(i, h / 2));
      box.rotation.y = Math.atan2(this.front.x, this.front.z);
      box.castShadow = box.receiveShadow = true;
      this.group.add(box);
      const plate = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.18, 1.32), mats[i]);
      plate.position.copy(this.at(i, h - 0.09));
      plate.rotation.y = box.rotation.y;
      this.group.add(plate);
    }
    // Bakgrundsvägg
    const wall = new THREE.Mesh(new THREE.BoxGeometry(8, 3.2, 0.2), new THREE.MeshStandardMaterial({ color: 0x1d4f91, roughness: 0.6 }));
    wall.position.copy(this.origin).addScaledVector(this.front, -1.3).setY(this.y + 1.6);
    wall.rotation.y = Math.atan2(this.front.x, this.front.z);
    this.group.add(wall);

    // Konfetti
    const N = 260;
    this.conf = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.09, 0.05),
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
      N
    );
    this.confData = [];
    const cols = [0xffd23f, 0xe63946, 0x2a9d8f, 0xffffff, 0x2b6cb0, 0xf4a261].map((c) => new THREE.Color(c));
    for (let i = 0; i < N; i++) {
      this.conf.setColorAt(i, cols[i % cols.length]);
      this.confData.push(this.newConf(true));
    }
    this.conf.visible = false;
    this.group.add(this.conf);
    this.skiers = [];
    this.t = 0;
  }

  at(i, up) {
    return this.origin.clone().addScaledVector(this.side, X[i]).setY(this.y + up);
  }

  newConf(spread) {
    return {
      p: this.origin.clone().addScaledVector(this.side, (Math.random() - 0.5) * 7).addScaledVector(this.front, (Math.random() - 0.3) * 4)
        .setY(this.y + (spread ? Math.random() * 8 : 7 + Math.random() * 2)),
      v: 0.6 + Math.random() * 0.8,
      r: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
      w: (Math.random() - 0.5) * 8,
    };
  }

  // podium: [{ name, color }] i placeringsordning (1, 2, 3)
  start(podium) {
    for (const s of this.skiers) this.group.remove(s.sk.root);
    this.skiers = podium.slice(0, 3).map((p, i) => {
      const sk = buildSkier(0xffffff, p.color);
      for (const l of sk.legs) l.ski.visible = false; // skidorna av på pallen
      const from = this.at(i, 0).addScaledVector(this.front, 3);
      sk.root.position.copy(from);
      sk.root.rotation.y = Math.atan2(this.front.x, this.front.z);
      this.group.add(sk.root);
      return { sk, from, to: this.at(i, HEIGHTS[i]), delay: [2.4, 1.2, 0][i], name: p.name };
    });
    this.group.visible = true;
    this.conf.visible = false;
    this.t = 0;
  }

  stop() {
    this.group.visible = false;
  }

  update(dt, camera) {
    this.t += dt;
    for (const s of this.skiers) {
      const k = Math.min(1, Math.max(0, (this.t - s.delay) / 1.4));
      const e = k * k * (3 - 2 * k);
      s.sk.root.position.lerpVectors(s.from, s.to, e);
      s.sk.root.position.y += Math.sin(e * Math.PI) * 0.6; // hopp upp på pallen
      animateSkier(s.sk, dt, 0, 1, 0, 0, k >= 1 ? 'cheer' : 'standstill');
    }
    if (this.t > 3.6) this.conf.visible = true;
    if (this.conf.visible) {
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
      this.confData.forEach((c, i) => {
        c.p.y -= c.v * dt;
        c.p.addScaledVector(this.side, Math.sin(this.t * 2 + i) * dt * 0.3);
        c.r.x += c.w * dt; c.r.y += c.w * 0.7 * dt;
        if (c.p.y < this.y) this.confData[i] = this.newConf(false);
        q.setFromEuler(c.r);
        m.compose(c.p, q, one);
        this.conf.setMatrixAt(i, m);
      });
      this.conf.instanceMatrix.needsUpdate = true;
    }
    // Kamera framför pallen, långsam svängning
    const a = Math.sin(this.t * 0.25) * 0.35;
    // Siktpunkten förskjuts åt höger så att pallen hamnar till vänster om resultatpanelen
    const look = this.origin.clone().addScaledVector(this.side, 2.0).setY(this.y + 1.6);
    const camPos = look.clone()
      .addScaledVector(this.front, 7.2 * Math.cos(a))
      .addScaledVector(this.side, 7.2 * Math.sin(a))
      .setY(this.y + 2.7);
    camera.position.lerp(camPos, this.t < 0.1 ? 1 : 1 - Math.exp(-dt * 3));
    camera.lookAt(look);
  }

  // Skärmpositioner för namnskyltar
  labels(camera, W, H) {
    return this.skiers.map((s, i) => {
      const v = s.sk.root.position.clone().setY(s.sk.root.position.y + 2.2).project(camera);
      return { name: s.name, place: i + 1, x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H, show: v.z < 1 };
    });
  }
}

// Skytte: 5 tavlor, sikte som svajar i en åtta, håll andan, avfyra.
// Mått i millimeter (verkliga biathlontavlor):
//   svart platta Ø115 mm. Liggande träffyta Ø45 mm, stående Ø115 mm.

import { WIND_MM_PER_MS } from './wind.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const TARGET_SPACING = 165;
export const PLATE_R = 57.5;
export const BREATH_MAX = 4;   // sekunder man kan hålla andan
const BREATH_REFILL = 6;       // sekunder från tom till full

export class Shooting {
  constructor(kind) {
    this.kind = kind; // 'prone' | 'standing'
    this.hitR = kind === 'prone' ? 22.5 : 57.5;
    this.targets = [-2, -1, 0, 1, 2].map((i) => ({ x: i * TARGET_SPACING, y: 0, hit: false }));
    this.aim = { x: -2 * TARGET_SPACING + (Math.random() - 0.5) * 160, y: 90 + Math.random() * 60 };
    this.shotsLeft = 5;
    this.shots = [];
    this.breath = 1;        // 0…1
    this.holding = false;
    this.holdTime = 0;
    this.debt = 0;          // andfåddhet efter att ha hållit andan
    this.t = Math.random() * 10;
    this.cooldown = 0;
    this.recoil = 0;
    this.doneTimer = -1;
    this.done = false;
    this.pulse = 100;
    this.wind = 0;          // m/s, + = åt höger
    this.drift = { x: 0, y: 0, vx: 0, vy: 0 };
    this.events = [];       // ljudhändelser till main
  }

  get misses() {
    return this.targets.filter((t) => !t.hit).length;
  }

  swayAmp() {
    const p = Math.max(0, this.pulse - 65);
    let a = this.kind === 'prone' ? 7 + p * 0.33 : 14 + p * 0.55;
    a *= 1 + this.debt * 0.5;
    if (this.holding) a *= this.kind === 'prone' ? 0.5 : 0.35;
    return a;
  }

  sway() {
    const A = this.swayAmp();
    // Åtta (lemniskata) – snabbare vid högre puls
    const w = Math.PI * 2 * (0.22 + (this.pulse - 60) / 450);
    let x = A * Math.sin(w * this.t);
    let y = 0.5 * A * Math.sin(2 * w * this.t + 0.3);
    // Hjärtslag ger ett litet ryck
    const beat = (this.t * this.pulse) / 60;
    const ph = beat - Math.floor(beat);
    const jolt = ph < 0.12 ? Math.sin((ph / 0.12) * Math.PI) : 0;
    y += jolt * A * 0.12;
    x += this.drift.x;
    y += this.drift.y - this.recoil * 40;
    return { x, y };
  }

  point() {
    const s = this.sway();
    return { x: this.aim.x + s.x, y: this.aim.y + s.y };
  }

  setHolding(on) {
    if (on && !this.holding && this.breath > 0.1) {
      this.holding = true;
      this.holdTime = 0;
      this.events.push('inhale');
    } else if (!on && this.holding) {
      this.holding = false;
      // Ju längre man höll, desto mer andfådd
      this.debt += this.holdTime * 0.45;
      this.events.push('exhale');
    }
  }

  moveAim(dx, dy) {
    this.aim.x = clamp(this.aim.x + dx, -500, 500);
    this.aim.y = clamp(this.aim.y + dy, -250, 250);
  }

  fire() {
    if (this.cooldown > 0 || this.shotsLeft <= 0) return null;
    const a = this.point();
    // Vinden för kulan åt det håll det blåser
    const p = { x: a.x + this.wind * WIND_MM_PER_MS, y: a.y };
    let hit = null;
    for (const t of this.targets) {
      if (!t.hit && Math.hypot(p.x - t.x, p.y - t.y) <= this.hitR) { hit = t; break; }
    }
    if (hit) hit.hit = true;
    this.shots.push({ x: p.x, y: p.y, hit: !!hit });
    this.shotsLeft--;
    this.cooldown = 0.55;
    this.recoil = 1;
    this.events.push(hit ? 'hit' : 'miss');
    if (this.shotsLeft === 0) this.doneTimer = 1.3;
    return !!hit;
  }

  update(dt, pulse, wind = 0) {
    this.t += dt;
    this.pulse = pulse;
    this.wind = wind;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.recoil = Math.max(0, this.recoil - dt * 4);

    if (this.holding) {
      this.holdTime += dt;
      this.breath -= dt / BREATH_MAX;
      if (this.breath <= 0) {
        this.breath = 0;
        this.holding = false;
        this.debt += 2.2; // tvingad utandning – rejält andfådd
        this.events.push('gasp');
      }
    } else {
      this.breath = Math.min(1, this.breath + dt / BREATH_REFILL);
      this.debt = Math.max(0, this.debt - dt * 0.6);
    }

    // Långsam drift (mer stående, mindre när man håller andan)
    const dk = (this.kind === 'prone' ? 1.5 : 5) * (this.holding ? 0.3 : 1);
    const d = this.drift;
    d.vx += (Math.random() - 0.5) * dk * dt * 20 - d.x * dt * 1.5;
    d.vy += (Math.random() - 0.5) * dk * dt * 20 - d.y * dt * 1.5;
    d.vx *= 1 - dt * 2;
    d.vy *= 1 - dt * 2;
    d.x += d.vx * dt;
    d.y += d.vy * dt;

    if (this.doneTimer > 0) {
      this.doneTimer -= dt;
      if (this.doneTimer <= 0) this.done = true;
    }
  }

  // Kikarsikte: korset står still, tavlorna rör sig
  draw(ctx, W, H) {
    const R = Math.min(W, H) * 0.46;
    const cx = W / 2, cy = H / 2;
    const scale = R / 230; // px per mm – kikaren visar ~460 mm
    const p = this.point();

    ctx.save();
    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, 0, W, H);
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();

    // Bakgrund: snö, skog, tavelram
    const ox = cx - p.x * scale, oy = cy - p.y * scale;
    const g = ctx.createLinearGradient(0, cy - R, 0, cy + R);
    g.addColorStop(0, '#9fb3c4');
    g.addColorStop(1, '#e9eef2');
    ctx.fillStyle = g;
    ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    // skogskant
    ctx.fillStyle = '#2d3b33';
    ctx.fillRect(cx - R, oy - 600 * scale, 2 * R, 300 * scale);
    // vit tavelram
    ctx.fillStyle = '#f4f4f0';
    const fw = 5 * TARGET_SPACING + 60;
    ctx.fillRect(ox - (fw / 2) * scale, oy - 110 * scale, fw * scale, 220 * scale);
    ctx.strokeStyle = '#c9c9c0';
    ctx.lineWidth = 2;
    ctx.strokeRect(ox - (fw / 2) * scale, oy - 110 * scale, fw * scale, 220 * scale);

    for (const t of this.targets) {
      const tx = ox + t.x * scale, ty = oy + t.y * scale;
      ctx.beginPath();
      ctx.arc(tx, ty, PLATE_R * scale, 0, Math.PI * 2);
      ctx.fillStyle = '#111';
      ctx.fill();
      if (this.kind === 'prone') {
        ctx.beginPath();
        ctx.arc(tx, ty, this.hitR * scale, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      if (t.hit) {
        ctx.beginPath();
        ctx.arc(tx, ty, (PLATE_R + 1) * scale, 0, Math.PI * 2);
        ctx.fillStyle = '#fbfbf8';
        ctx.fill();
        ctx.strokeStyle = '#ccc';
        ctx.stroke();
      }
    }
    // träffbilder
    for (const s of this.shots) {
      ctx.beginPath();
      ctx.arc(ox + s.x * scale, oy + s.y * scale, 3.5 * scale + 1, 0, Math.PI * 2);
      ctx.fillStyle = s.hit ? 'rgba(80,80,80,0.6)' : '#444';
      ctx.fill();
    }

    // Kikarkors
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - R, cy); ctx.lineTo(cx - 10, cy);
    ctx.moveTo(cx + 10, cy); ctx.lineTo(cx + R, cy);
    ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy - 10);
    ctx.moveTo(cx, cy + 10); ctx.lineTo(cx, cy + R);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.stroke();

    // vinjett
    const vg = ctx.createRadialGradient(cx, cy, R * 0.7, cx, cy, R);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.65)');
    ctx.fillStyle = vg;
    ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    ctx.restore();

    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 6;
    ctx.stroke();
  }
}

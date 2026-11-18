// 2D-gränssnitt: pendel och minikarta (canvas).

export function drawPendulum(ctx, W, H, ski) {
  ctx.clearRect(0, 0, W, H);
  const cx = W / 2, py = H * 0.08, L = H * 0.78;
  const maxA = 0.75;
  // Bana (båge) + träffzon
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath();
  ctx.arc(cx, py, L, Math.PI / 2 - maxA, Math.PI / 2 + maxA);
  ctx.stroke();
  // Träffzonens bredd motsvarar tidsfönstret
  const span = ski.nextBeat - ski.lastBeat || 1;
  const zoneA = Math.max(0.05, Math.sin((Math.PI * ski.W) / span) * maxA);
  const near = ski.nearness();
  ctx.strokeStyle = `rgba(${Math.round(80 + 175 * near)},${Math.round(220)},${Math.round(120)},${0.55 + 0.45 * near})`;
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(cx, py, L, Math.PI / 2 - zoneA, Math.PI / 2 + zoneA);
  ctx.stroke();

  // Pendeln
  const a = ski.pendulum() * maxA;
  const bx = cx + Math.sin(a) * L, by = py + Math.cos(a) * L;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx, py);
  ctx.lineTo(bx, by);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(bx, by, 13 + near * 5, 0, Math.PI * 2);
  ctx.fillStyle = near > 0 ? '#7CFC9A' : '#ffffff';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, py, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();

  // Feedback
  const f = ski.feedback;
  if (f && ski.now - f.t < 0.7) {
    const alpha = 1 - (ski.now - f.t) / 0.7;
    ctx.font = `700 ${Math.round(H * 0.17)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle =
      f.kind === 'good' ? `rgba(124,252,154,${alpha})` : f.kind === 'bad' ? `rgba(255,110,110,${alpha})` : `rgba(255,220,120,${alpha})`;
    ctx.fillText(f.text, cx, py + L * 0.45);
  }
}

export class Minimap {
  constructor(canvas, course) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.course = course;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < course.n; i += 10) {
      minX = Math.min(minX, course.xs[i]); maxX = Math.max(maxX, course.xs[i]);
      minZ = Math.min(minZ, course.zs[i]); maxZ = Math.max(maxZ, course.zs[i]);
    }
    this.b = { minX: minX - 30, maxX: maxX + 30, minZ: minZ - 30, maxZ: maxZ + 30 };
  }

  map(x, z) {
    const { width: W, height: H } = this.c;
    const b = this.b;
    const s = Math.min((W - 12) / (b.maxX - b.minX), (H - 12) / (b.maxZ - b.minZ));
    const ox = (W - (b.maxX - b.minX) * s) / 2, oz = (H - (b.maxZ - b.minZ) * s) / 2;
    return [ox + (x - b.minX) * s, oz + (z - b.minZ) * s];
  }

  draw(me, others = []) {
    const { ctx, course } = this;
    const { width: W, height: H } = this.c;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(10,20,30,0.45)';
    ctx.beginPath();
    ctx.roundRect(0, 0, W, H, 10);
    ctx.fill();
    // Spår
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i <= course.n; i += 10) {
      const [x, z] = this.map(course.xs[i % course.n], course.zs[i % course.n]);
      if (i === 0) ctx.moveTo(x, z); else ctx.lineTo(x, z);
    }
    ctx.closePath();
    ctx.stroke();
    // Stadion
    const [sx, sz] = this.map(course.stadium[0], course.stadium[1]);
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(sx - 4, sz - 4, 8, 8);
    // Andra spelare (steg 3)
    for (const o of others) {
      const [x, z] = this.map(o.x, o.z);
      ctx.beginPath();
      ctx.arc(x, z, 4, 0, Math.PI * 2);
      ctx.fillStyle = o.color || '#9ad';
      ctx.fill();
    }
    // Jag
    const [mx, mz] = this.map(me.x, me.z);
    ctx.beginPath();
    ctx.arc(mx, mz, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ff4d4d';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

export function fmtTime(t) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

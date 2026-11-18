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
  // Träffzon i färgband: tidigt/sent (orange) → bra (gulgrön) → perfekt (grön).
  // Bredderna motsvarar tidsgränserna i skiing.js (perfekt ≈ ±18 %, bra ≈ ±40 % av fönstret).
  const span = ski.nextBeat - ski.lastBeat || 1;
  const toA = (t) => Math.max(0.03, Math.sin(Math.min(Math.PI / 2, (Math.PI * t) / span)) * maxA);
  const near = ski.nearness();
  const glow = 0.7 + 0.3 * near;
  const bands = ski.assist > 0
    ? [[ski.W, `rgba(80,235,120,${glow})`]]                 // starthjälp: hela zonen perfekt
    : [[ski.W, `rgba(255,150,60,${glow})`], [ski.W * 0.4, `rgba(205,235,90,${glow})`], [ski.W * 0.18, `rgba(70,240,120,${glow})`]];
  ctx.lineCap = 'butt';
  bands.forEach(([t, col], i) => {
    const z = toA(t);
    ctx.strokeStyle = col;
    ctx.lineWidth = 14 + i * 2;
    ctx.beginPath();
    ctx.arc(cx, py, L, Math.PI / 2 - z, Math.PI / 2 + z);
    ctx.stroke();
  });
  ctx.lineCap = 'round';
  // mittstreck
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, py + L - 11); ctx.lineTo(cx, py + L + 11);
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

  draw(me, others = [], label = '') {
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
    // Upploppsrakan
    if (course.finishPoint) {
      const a = course.finishPoint(0), b = course.finishPoint(200);
      const [ax, az] = this.map(a[0], a[2]), [bx, bz] = this.map(b[0], b[2]);
      ctx.strokeStyle = 'rgba(255,210,63,0.9)';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(ax, az); ctx.lineTo(bx, bz); ctx.stroke();
      ctx.fillStyle = '#d8312f';
      ctx.fillRect(bx - 3, bz - 3, 6, 6);
    }
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
    if (label) {
      ctx.font = `700 ${Math.round(H * 0.13)}px system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#fff';
      ctx.fillText(label, 8, 6);
      ctx.textBaseline = 'alphabetic';
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

// Vindflagga: hänger nästan rakt ned i stiltje, står ut åt vindens håll när det blåser.
export function drawFlag(ctx, W, H, wind, t) {
  ctx.clearRect(0, 0, W, H);
  const px = W / 2, top = H * 0.1, bottom = H * 0.97;
  ctx.strokeStyle = '#e6e6e6';
  ctx.lineWidth = Math.max(2, W * 0.03);
  ctx.beginPath();
  ctx.moveTo(px, bottom);
  ctx.lineTo(px, top);
  ctx.stroke();

  const strength = Math.min(1, Math.abs(wind) / 6); // full styrka först vid 6 m/s (Östersund)
  const dir = wind >= 0 ? 1 : -1;
  const a = 0.12 + strength * 1.35;              // 0 = rakt ned, π/2 = vågrätt
  const len = W * 0.44, hgt = H * 0.2;
  const amp = hgt * (0.06 + 0.16 * strength);
  const speed = 3 + strength * 9;
  const segs = 12;
  // Nedre kanten hänger lite mer än den övre (tyget faller)
  const edge = (off, ang) => {
    const ex = Math.sin(ang) * dir, ey = Math.cos(ang);
    const pts = [];
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      const w = Math.sin(t * speed - u * 6) * amp * u;
      pts.push([px + ex * u * len - ey * w * dir, top + off + ey * u * len + Math.abs(ex) * w]);
    }
    return pts;
  };
  const upper = edge(0, a), lower = edge(hgt, a * 0.8);
  ctx.beginPath();
  upper.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  for (let i = lower.length - 1; i >= 0; i--) ctx.lineTo(lower[i][0], lower[i][1]);
  ctx.closePath();
  ctx.fillStyle = '#e8402b';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

// Höjdkurva för varvet med prick för var man är
export class Profile {
  constructor(canvas, course) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.course = course;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < course.n; i += 5) { lo = Math.min(lo, course.es[i]); hi = Math.max(hi, course.es[i]); }
    this.lo = lo; this.hi = hi;
  }

  draw(s, toRange = true) {
    const { ctx, course } = this;
    const { width: W, height: H } = this.c;
    const pad = 6, top = 14;
    const X = (d) => pad + (d / course.n) * (W - 2 * pad);
    const Y = (e) => H - pad - ((e - this.lo) / (this.hi - this.lo || 1)) * (H - pad - top);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(10,20,30,0.45)';
    ctx.beginPath();
    ctx.roundRect(0, 0, W, H, 10);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(X(0), H - pad);
    for (let d = 0; d <= course.n; d += 10) ctx.lineTo(X(d), Y(course.es[d % course.n]));
    ctx.lineTo(X(course.n), H - pad);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fill();
    ctx.beginPath();
    for (let d = 0; d <= course.n; d += 10) {
      const x = X(d), y = Y(course.es[d % course.n]);
      d ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // mål/vall vid varvets slut
    ctx.fillStyle = '#ffd23f';
    ctx.font = `600 ${Math.round(H * 0.18)}px system-ui, sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillText(toRange ? 'Vallen' : 'Mål', W - pad, top - 2);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(`${Math.round(this.hi - this.lo)} m`, pad, top - 2);
    // jag
    const x = X(Math.min(s, course.n)), y = Y(course.elevAt(Math.min(s, course.n - 0.01)));
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#ff4d4d';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

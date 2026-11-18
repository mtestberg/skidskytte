// Mjuka övergångar på stadion (kubisk Bézier med jämn hastighet längs kurvan):
// spår → skjutvall, vall → straffrunda, straffrunda/vall → banan.
export function makeTransit(p0, t0, p3, t3, y0, y3 = y0) {
  const d = Math.hypot(p3[0] - p0[0], p3[1] - p0[1]);
  const k = Math.max(6, d * 0.45);
  const P = [p0, [p0[0] + t0[0] * k, p0[1] + t0[1] * k], [p3[0] - t3[0] * k, p3[1] - t3[1] * k], p3];
  const bez = (t) => {
    const u = 1 - t;
    const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, e = t * t * t;
    return [a * P[0][0] + b * P[1][0] + c * P[2][0] + e * P[3][0], a * P[0][1] + b * P[1][1] + c * P[2][1] + e * P[3][1]];
  };
  // längdtabell
  const N = 80, pts = [], cum = [0];
  for (let i = 0; i <= N; i++) pts.push(bez(i / N));
  for (let i = 1; i <= N; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const len = cum[N];
  const at = (dist) => {
    const s = Math.max(0, Math.min(len, dist));
    let i = 1;
    while (i < N && cum[i] < s) i++;
    const f = (s - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
    const x = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f;
    const z = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f;
    const tx = pts[i][0] - pts[i - 1][0], tz = pts[i][1] - pts[i - 1][1];
    const l = Math.hypot(tx, tz) || 1;
    const y = y0 + (y3 - y0) * (s / (len || 1));
    return { x, y, z, tx: tx / l, tz: tz / l };
  };
  // punkter var ~2 m (för öppningar i staket/publik)
  const samples = [];
  for (let d = 0; d <= len; d += 2) { const q = at(d); samples.push([q.x, q.z]); }
  return { len, at, samples };
}

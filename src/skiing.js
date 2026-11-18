// Skidåkning: pendel, takt, fart och puls.
//
// Pendeln passerar mitten en gång per "slag". Varje slag har ett tidsfönster
// (±W s). Tryck på stavtag och/eller skär inom fönstret ger ett skjut framåt.
// - Båda knapparna samtidigt och mitt i fönstret = fullt skjut.
// - En knapp = svagare skjut.
// - Ju längre från mitten man trycker, desto mer försenas nästa slag (lägre takt).
// - Tryck utanför fönstret ("ur takt") försenar pendeln och höjer pulsen.
// - Inga tryck = glid: farten sjunker, pulsen sjunker.
//
// Energi (0–100) räcker för hela loppet om man är taktisk:
// - Varje skjut kostar energi, dåliga skjut och tryck ur takt kostar mer.
// - Låg energi: pulsen stiger snabbare och sjunker långsammare, skjuten blir svagare.
// - Energi återhämtas i vila (glid, utför, på vallen), långsammare än pulsen sjunker.

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const PULSE_MIN = 55;
export const PULSE_MAX = 200;
export const ENERGY_MAX = 100;

export class Skiing {
  constructor() {
    this.reset();
  }

  reset() {
    this.v = 0;            // m/s (verklig fart, banan skalas med TIME_SCALE)
    this.pulse = 70;
    this.energy = ENERGY_MAX;
    this.lastPushAt = -10;
    this.now = 0;
    this.T = 1.25;
    this.W = 0.17;
    this.lastBeat = 0;
    this.nextBeat = 1.2;
    this.side = 1;
    this.cur = {};
    this.nxt = {};
    this.resolved = true;
    this.grade = 0;
    this.pushAnim = 0;     // 1 → 0 efter ett skjut (för animation)
    this.pushSide = 1;
    this.lastPower = 0;
    this.feedback = null;  // { text, kind, t }
    this.onBeat = null;    // callback(power)
    this.onPush = null;
    this.stats = { beats: 0, perfect: 0, pushes: 0, wild: 0 };
    this.assist = 3;       // de första tagen från stillastående har nästan hela pendeln som träffzon
  }

  period(grade) {
    // Långsam takt i utförsbackar, snabb i uppförsbackar
    const f = clamp(0.8 + grade * 5, 0.45, 1.35); // slag per sekund
    return 1 / f;
  }

  // Pendelns vinkel −1…1 (0 = mitten / träffzon)
  pendulum() {
    const span = this.nextBeat - this.lastBeat;
    const x = clamp((this.now - this.lastBeat) / span, 0, 1);
    return this.side * Math.sin(Math.PI * x);
  }

  // Hur nära träffzonen pendeln är just nu (1 = i mitten)
  nearness() {
    const d = Math.min(this.now - this.lastBeat, this.nextBeat - this.now);
    return clamp(1 - d / this.W, 0, 1);
  }

  press(which) {
    const t = this.now;
    if (!this.resolved && t - this.lastBeat <= this.W && this.cur[which] == null) {
      this.cur[which] = t - this.lastBeat;
      return;
    }
    if (this.nextBeat - t <= this.W && this.nxt[which] == null) {
      this.nxt[which] = t - this.nextBeat;
      return;
    }
    // Ur takt
    this.nextBeat += 0.2 * this.T;
    this.pulse = Math.min(PULSE_MAX, this.pulse + 3 * this.pulseGain());
    this.spend(0.8);
    this.stats.wild++;
    this.fb('Ur takt', 'bad');
  }

  // 0…1
  get energyFrac() {
    return this.energy / ENERGY_MAX;
  }

  // Låg energi → pulsen stiger snabbare
  pulseGain() {
    return 1 + (1 - this.energyFrac) * 0.6;
  }

  // Låg energi → svagare skjut (men aldrig stopp)
  strength() {
    return 0.8 + 0.2 * Math.min(1, this.energy / 20);
  }

  // Mycket energi kvar → dyrare; lite kvar → billigare (man blir aldrig helt slut)
  spend(x) {
    x *= 0.4 + 0.45 * this.energyFrac;
    this.energy = clamp(this.energy - x, 0, ENERGY_MAX);
  }

  fb(text, kind) {
    this.feedback = { text, kind, t: this.now };
  }

  resolve() {
    this.resolved = true;
    this.stats.beats++;
    const p = this.cur.pole, e = this.cur.edge;
    if (p == null && e == null) return;
    const W = this.W;
    // Under starthjälpen ger hela den breda zonen bra/perfekta tag
    const assist = this.assist > 0;
    const quality = (x) => (x == null ? 0 : assist ? 1 - 0.15 * (Math.abs(x) / W) : 1 - Math.abs(x) / W);
    const qp = quality(p);
    const qe = quality(e);
    let q, power;
    if (p != null && e != null) {
      const sync = clamp(1 - Math.abs(p - e) / (assist ? 0.5 : 0.12), 0.3, 1);
      q = (qp + qe) / 2;
      power = q * (0.55 + 0.45 * sync);
    } else {
      q = p != null ? qp : qe;
      power = q * 0.45;
    }
    // Skjut framåt (mindre effekt vid hög fart)
    this.v += 2.2 * power * this.strength() * Math.max(0, 1 - this.v / 16);
    // Felträff → längre till nästa pendelmatch
    this.nextBeat += (1 - q) * 0.5 * this.T;
    // Puls: ansträngning, mer i uppför, mer om slarvigt
    const up = Math.max(0, this.grade);
    this.pulse += 5.0 * (1 + up * 3.5) * (0.6 + 0.4 * power) * (1.5 - 0.8 * q) * this.pulseGain() * clamp((205 - this.pulse) / 55, 0.15, 1);
    this.pulse = Math.min(PULSE_MAX, this.pulse);
    // Energi: grundkostnad (mer i uppför) + extra för dålig träff
    this.spend(0.9 * (1 + up * 4) * (0.7 + 0.3 * power) + (1 - q) * 1.0);
    this.lastPushAt = this.now;
    this.pushAnim = 1;
    this.pushSide *= -1;
    this.lastPower = power;
    this.stats.pushes++;
    if (this.assist > 0) this.assist--;

    const avgOff = ((p ?? 0) + (e ?? 0)) / ((p != null) + (e != null));
    if (p == null || e == null) this.fb('Bara en knapp', 'mid');
    else if (power > 0.82) { this.fb('Perfekt!', 'good'); this.stats.perfect++; }
    else if (power > 0.6) this.fb('Bra', 'good');
    else this.fb(avgOff < 0 ? 'Tidigt' : 'Sent', 'mid');
    if (this.onPush) this.onPush(power);
  }

  update(dt, grade) {
    this.now += dt;
    this.grade = grade;
    this.T = this.period(grade);
    // Står man still (start, efter vallen, eller stannat i en backe) blir det lätt att komma igång
    if (this.v < 0.8 && this.assist < 3) this.assist = 3;
    this.W = this.assist > 0 ? this.T * 0.45 : Math.min(0.17, this.T * 0.3);

    if (!this.resolved && this.now >= this.lastBeat + this.W) this.resolve();
    if (this.now >= this.nextBeat) {
      this.lastBeat = this.nextBeat;
      this.nextBeat = this.lastBeat + this.T;
      this.side *= -1;
      this.cur = this.nxt;
      this.nxt = {};
      this.resolved = false;
      if (this.onBeat) this.onBeat();
    }

    // Fysik: gravitation längs backen, friktion, luftmotstånd
    const sinA = grade / Math.sqrt(1 + grade * grade);
    const a = -9.81 * sinA - 0.28 - 0.011 * this.v * this.v;
    this.v = clamp(this.v + a * dt, 0, 18);

    // Puls återhämtar sig vid glid och i utförsbackar (långsammare med låg energi)
    const down = grade < -0.02;
    const gliding = this.now - this.lastPushAt > 1.6 * this.T;
    const rest = down ? 92 : gliding ? 100 : 106;
    const k = (down || gliding ? 0.08 : 0.045) * (0.35 + 0.65 * this.energyFrac);
    this.pulse += (rest - this.pulse) * (1 - Math.exp(-k * dt));
    // Energi återhämtas i vila
    if (down || gliding) this.energy = Math.min(ENERGY_MAX, this.energy + (down ? 0.55 : 0.45) * dt);
    this.pulse = clamp(this.pulse, PULSE_MIN, PULSE_MAX);

    this.pushAnim = Math.max(0, this.pushAnim - dt * 2.2);
  }

  // Vila på skjutvallen
  rest(dt) {
    this.now += dt;
    this.v = Math.max(0, this.v - dt * 4);
    this.pulse += (70 - this.pulse) * (1 - Math.exp(-0.06 * (0.4 + 0.6 * this.energyFrac) * dt));
    this.energy = Math.min(ENERGY_MAX, this.energy + 0.35 * dt);
    this.pushAnim = Math.max(0, this.pushAnim - dt * 2.2);
  }

  // Börja åka igen efter vallen/straffrundan: synka pendeln
  restart() {
    this.assist = 3;
    this.lastBeat = this.now;
    this.nextBeat = this.now + 0.9;
    this.cur = {};
    this.nxt = {};
    this.resolved = true;
  }
}

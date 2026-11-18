// Sidvind över skjutvallen. Positivt värde = blåser åt höger (sett från skytten).
// Varierar långsamt under loppet med byar ovanpå.

export const WIND_MM_PER_MS = 9; // träffen förskjuts ca 9 mm per m/s på 50 m

export class Wind {
  // opts (per bana): { min, max } för grundvinden (m/s, slumpad riktning), amp = hur mycket den växlar, cap = max
  constructor(rand = Math.random, opts = {}) {
    const { min = 0, max = 1.5, amp = 1, cap = 4.5 } = opts;
    this.base = (rand() < 0.5 ? -1 : 1) * (min + rand() * (max - min));
    this.amp = amp;
    this.cap = cap;
    this.ph = [0, 1, 2, 3].map(() => rand() * Math.PI * 2);
  }

  // m/s vid racetid t (sekunder)
  at(t) {
    const [a, b, c, d] = this.ph;
    const v =
      this.base +
      this.amp * (2.0 * Math.sin(t / 21 + a) +
      1.0 * Math.sin(t / 8.3 + b) +
      0.6 * Math.sin(t / 3.1 + c) * (0.5 + 0.5 * Math.sin(t / 13 + d))); // byar
    return Math.max(-this.cap, Math.min(this.cap, v));
  }
}

// Sidvind över skjutvallen. Positivt värde = blåser åt höger (sett från skytten).
// Varierar långsamt under loppet med byar ovanpå.

export const WIND_MM_PER_MS = 9; // träffen förskjuts ca 9 mm per m/s på 50 m

export class Wind {
  constructor(rand = Math.random) {
    this.base = (rand() * 2 - 1) * 1.5;
    this.ph = [0, 1, 2, 3].map(() => rand() * Math.PI * 2);
  }

  // m/s vid racetid t (sekunder)
  at(t) {
    const [a, b, c, d] = this.ph;
    const v =
      this.base +
      2.0 * Math.sin(t / 21 + a) +
      1.0 * Math.sin(t / 8.3 + b) +
      0.6 * Math.sin(t / 3.1 + c) * (0.5 + 0.5 * Math.sin(t / 13 + d)); // byar
    return Math.max(-4.5, Math.min(4.5, v));
  }
}

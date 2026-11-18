// Syntetiserade ljud (WebAudio) – inga ljudfiler behövs.
let ac = null;
let master = null;
let noiseBuf = null;
export let enabled = true;

export function init() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain();
    master.gain.value = 0.8;
    master.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 1.5, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) {
    ac = null;
  }
}

export function setEnabled(on) {
  enabled = on;
  if (master) master.gain.value = on ? 0.8 : 0;
}

function noise(dur, type, freq, q, gain, attack = 0.003) {
  if (!ac) return;
  const t = ac.currentTime;
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ac.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
  src.stop(t + dur + 0.05);
  return { f, t };
}

function tone(freq, dur, gain, type = 'sine', endFreq = null, delay = 0) {
  if (!ac) return;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export function shot() {
  noise(0.25, 'lowpass', 2500, 0.7, 0.9, 0.001);
  tone(140, 0.18, 0.6, 'sine', 50);
}

export function hit() {
  // tavlan fäller: metalliskt klonk
  tone(1250, 0.12, 0.25, 'square', 900, 0.12);
  tone(620, 0.2, 0.2, 'triangle', 500, 0.12);
}

export function miss() {
  noise(0.08, 'highpass', 4000, 0.5, 0.15);
}

export function heartbeat(strength = 1) {
  tone(62, 0.13, 0.55 * strength, 'sine', 40);
  tone(55, 0.12, 0.4 * strength, 'sine', 38, 0.17);
}

export function inhale() {
  const n = noise(0.6, 'bandpass', 900, 0.8, 0.12, 0.25);
  if (n) n.f.frequency.linearRampToValueAtTime(1500, n.t + 0.5);
}

export function exhale() {
  const n = noise(0.7, 'bandpass', 1300, 0.7, 0.15, 0.05);
  if (n) n.f.frequency.linearRampToValueAtTime(700, n.t + 0.6);
}

export function gasp() {
  noise(0.35, 'bandpass', 1100, 1.2, 0.3, 0.02);
  setTimeout(() => exhale(), 350);
}

export function polePlant(power) {
  noise(0.06, 'highpass', 2500, 0.8, 0.05 + 0.1 * power);
  noise(0.18, 'bandpass', 600, 0.6, 0.06 + 0.08 * power, 0.01); // skärets "schhh"
}

export function tick() {
  tone(1800, 0.03, 0.04, 'sine');
}

export function beep(high = false) {
  tone(high ? 1320 : 880, high ? 0.5 : 0.18, 0.25, 'sine');
}

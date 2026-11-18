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

// Stavtag: stavspetsarna i snön ("tsk") + skärets "schhh"
export function polePlant(power) {
  noise(0.05, 'highpass', 3200, 0.9, 0.12 + 0.12 * power);
  tone(190, 0.07, 0.12 + 0.1 * power, 'triangle', 90, 0.0);
  noise(0.28, 'bandpass', 700, 0.5, 0.08 + 0.1 * power, 0.03);
}

export function tick() {
  tone(1800, 0.03, 0.04, 'sine');
}

export function beep(high = false) {
  tone(high ? 1320 : 880, high ? 0.5 : 0.18, 0.25, 'sine');
}

// ---------- Banans ljudbild (startas vid första ljudet) ----------
let loops = null;

// Brus i loop: källa → filter → mod (variation) → g (nivå, 0 = tyst) → master
function loopNoise(type, freq, q) {
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  // olika startpunkt i bruset så att looparna inte låter likadant
  const f = ac.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const mod = ac.createGain();
  mod.gain.value = 1;
  const g = ac.createGain();
  g.gain.value = 0;
  src.connect(f).connect(mod).connect(g).connect(master);
  src.start(0, Math.random() * 1.2);
  return { src, f, mod, g };
}

function ensureLoops() {
  if (!ac || loops) return loops;
  // Glid: skidorna mot snön
  const glide = loopNoise('bandpass', 1100, 0.6);
  // Publik: brus genom två "röst"-filter med långsam variation
  const crowdA = loopNoise('bandpass', 480, 0.9);
  const crowdB = loopNoise('bandpass', 1200, 1.3);
  // långsam variation i publikens sorl – på mod-noden, så att nivå 0 verkligen är tyst
  for (const [node, fq, depth] of [[crowdA, 0.17, 0.25], [crowdB, 0.31, 0.35]]) {
    node.mod.gain.value = 1 - depth;
    const lfo = ac.createOscillator();
    const lg = ac.createGain();
    lfo.frequency.value = fq; lg.gain.value = depth;
    lfo.connect(lg).connect(node.mod.gain);
    lfo.start();
  }
  loops = { glide, crowdA, crowdB };
  return loops;
}

const ramp = (param, v, t = 0.15) => param.setTargetAtTime(v, ac.currentTime, t);

// v i m/s
export function setGlide(v, on = true) {
  if (!ensureLoops()) return;
  const level = on && v > 0.4 ? Math.min(0.07, (v - 0.4) * 0.008) : 0;
  ramp(loops.glide.g.gain, level, 0.08);
  ramp(loops.glide.f.frequency, 700 + v * 60);
}

// level 0…1 (närhet till stadion, eller fullt vid skjutvallen)
export function setCrowd(level) {
  if (!ensureLoops()) return;
  ramp(loops.crowdA.g.gain, level * 0.26, 0.5);
  ramp(loops.crowdB.g.gain, level * 0.14, 0.5);
}

// Jubel: publikbrus som sväller och klingar av
export function cheer(strength = 1, dur = 2.2) {
  if (!ac) return;
  const t = ac.currentTime;
  for (const [f, q, gmax] of [[550, 0.9, 0.5], [1400, 1.2, 0.32], [2800, 1.8, 0.14]]) {
    const src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gmax * strength, t + 0.35);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    src.connect(bp).connect(g).connect(master);
    src.start(t); src.stop(t + dur + 0.1);
  }
}

// "Ååh" från publiken vid miss
export function ooh() {
  if (!ac) return;
  const t = ac.currentTime;
  const src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 3;
  bp.frequency.setValueAtTime(700, t);
  bp.frequency.exponentialRampToValueAtTime(380, t + 1.1);
  const g = ac.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.4, t + 0.25);
  g.gain.exponentialRampToValueAtTime(0.0005, t + 1.3);
  src.connect(bp).connect(g).connect(master);
  src.start(t); src.stop(t + 1.4);
}

// Varvklocka inför sista varvet
export function bell() {
  for (let i = 0; i < 4; i++) {
    tone(1580, 0.6, 0.18, 'sine', null, i * 0.32);
    tone(2390, 0.4, 0.08, 'sine', null, i * 0.32);
  }
}

// Vurpa: duns i snön + publiken reagerar
export function fall() {
  noise(0.35, 'lowpass', 400, 0.7, 0.6, 0.005);
  tone(80, 0.3, 0.5, 'sine', 40);
  setTimeout(ooh, 150);
}

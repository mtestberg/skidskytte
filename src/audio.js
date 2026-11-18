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
    loadSamples();
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
export function polePlant(power, pole = true, edge = true) {
  if (pole) {
    noise(0.05, 'highpass', 3200, 0.9, 0.12 + 0.12 * power);
    tone(190, 0.07, 0.12 + 0.1 * power, 'triangle', 90, 0.0);
  }
  if (edge) noise(0.28, 'bandpass', 700, 0.5, 0.08 + 0.1 * power, 0.03);
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
  // Publik: ett svagt sorl-golv (brus) – själva rösterna kommer från voice() nedan
  const crowdA = loopNoise('bandpass', 420, 0.8);
  const crowdB = loopNoise('bandpass', 1000, 1.1);
  for (const [node, fq, depth] of [[crowdA, 0.17, 0.3], [crowdB, 0.31, 0.4]]) {
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

// ---------- Publik av syntetiska röster ----------
// Varje röst: sågtand med vibrato → tre formantfilter (vokal) → envelop → publikbuss med eko.
const VOWELS = {
  a: [[800, 1], [1150, 0.6], [2900, 0.25]],
  e: [[480, 1], [1900, 0.55], [2600, 0.3]],   // "heej"
  o: [[470, 1], [800, 0.6], [2700, 0.15]],    // "ååh"
  i: [[300, 1], [2300, 0.45], [3000, 0.3]],
};
let crowdBus = null;
function bus() {
  if (crowdBus || !ac) return crowdBus;
  crowdBus = ac.createGain();
  crowdBus.gain.value = 1;
  // syntetiskt eko (stadion)
  const len = Math.floor(ac.sampleRate * 1.4);
  const ir = ac.createBuffer(2, len, ac.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  const conv = ac.createConvolver();
  conv.buffer = ir;
  const wet = ac.createGain(); wet.gain.value = 0.35;
  const dry = ac.createGain(); dry.gain.value = 0.8;
  crowdBus.connect(dry).connect(master);
  crowdBus.connect(conv).connect(wet).connect(master);
  return crowdBus;
}

// En röst. f0 = grundton, glide = tonhöjd i slutet (faktor), vowel = 'a'|'e'|'o'|'i'
function voice(delay, dur, f0, vowel, gain, glide = 1, pan = 0) {
  if (!ac) return;
  const b = bus();
  const t = ac.currentTime + delay;
  const o = ac.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(f0, t);
  o.frequency.linearRampToValueAtTime(f0 * (1 + (glide - 1) * 0.4), t + dur * 0.35);
  o.frequency.linearRampToValueAtTime(f0 * glide, t + dur);
  const vib = ac.createOscillator();
  const vg = ac.createGain();
  vib.frequency.value = 4.5 + Math.random() * 2;
  vg.gain.value = f0 * 0.025;
  vib.connect(vg).connect(o.frequency);
  const env = ac.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(gain, t + Math.min(0.12, dur * 0.3));
  env.gain.setValueAtTime(gain * 0.85, t + dur * 0.7);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const pn = ac.createStereoPanner ? ac.createStereoPanner() : null;
  if (pn) pn.pan.value = pan;
  for (const [f, a] of VOWELS[vowel]) {
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f * (0.93 + Math.random() * 0.14);
    bp.Q.value = 6;
    const fg = ac.createGain();
    fg.gain.value = a;
    o.connect(bp).connect(fg).connect(env);
  }
  if (pn) { env.connect(pn); pn.connect(b); } else env.connect(b);
  o.start(t); vib.start(t);
  o.stop(t + dur + 0.05); vib.stop(t + dur + 0.05);
}

const randVoicePitch = () => (Math.random() < 0.5 ? 105 + Math.random() * 55 : 195 + Math.random() * 90);

// Handklapp: korta brusstötar
function claps(delay, dur, rate, gain) {
  if (!ac) return;
  const n = Math.floor(dur * rate);
  for (let i = 0; i < n; i++) {
    const t = ac.currentTime + delay + Math.random() * dur;
    const src = ac.createBufferSource(); src.buffer = noiseBuf;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1200 + Math.random() * 1400; bp.Q.value = 1.2;
    const g = ac.createGain();
    g.gain.setValueAtTime(gain * (0.5 + Math.random() * 0.5), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03 + Math.random() * 0.02);
    src.connect(bp).connect(g).connect(bus());
    src.start(t, Math.random()); src.stop(t + 0.07);
  }
}

// Visslingar (enstaka supportrar)
function whistle(delay) {
  if (!ac) return;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator(); o.type = 'sine';
  const f = 1800 + Math.random() * 900;
  o.frequency.setValueAtTime(f, t);
  o.frequency.linearRampToValueAtTime(f * 1.25, t + 0.25);
  o.frequency.linearRampToValueAtTime(f * 0.9, t + 0.55);
  const g = ac.createGain();
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
  o.connect(g).connect(bus());
  o.start(t); o.stop(t + 0.65);
}

// Inspelat stadionsorl i loop (två förskjutna loopar så att skarven inte hörs)
let murmur = null;
function setMurmur(level) {
  const b = samples.crowd;
  if (!b) return false;
  if (!murmur) {
    const g = ac.createGain();
    g.gain.value = 0;
    g.connect(master);
    const mk = (off, gain) => {
      const src = ac.createBufferSource();
      src.buffer = b; src.loop = true;
      const lg = ac.createGain(); lg.gain.value = gain;
      src.connect(lg).connect(g);
      src.start(ac.currentTime, off);
    };
    mk(0, 0.7);
    mk(b.duration / 2, 0.45);
    murmur = { g };
  }
  murmur.g.gain.setTargetAtTime(level * 0.4, ac.currentTime, 0.6);
  return true;
}

// level 0…1: inspelat sorl om det finns, annars syntetiskt (brusgolv + babbel + klapp/visslingar)
let crowdLevel = 0, lastBabble = 0;
export function setCrowd(level) {
  if (!ensureLoops()) return;
  crowdLevel = level;
  if (setMurmur(level)) {
    ramp(loops.crowdA.g.gain, 0, 0.5);
    ramp(loops.crowdB.g.gain, 0, 0.5);
    return;
  }
  ramp(loops.crowdA.g.gain, level * 0.07, 0.5);
  ramp(loops.crowdB.g.gain, level * 0.035, 0.5);
  const now = ac.currentTime;
  const dt = Math.min(0.1, now - lastBabble);
  lastBabble = now;
  if (level <= 0.02) return;
  // babbel: korta stavelser från olika röster
  const expected = level * 9 * dt;
  let n = Math.floor(expected) + (Math.random() < expected % 1 ? 1 : 0);
  while (n-- > 0) {
    const vow = ['a', 'e', 'o', 'i'][Math.floor(Math.random() * 4)];
    voice(Math.random() * 0.05, 0.12 + Math.random() * 0.3, randVoicePitch(), vow, 0.05 * level, 0.9 + Math.random() * 0.25, Math.random() * 1.6 - 0.8);
  }
  if (Math.random() < level * 0.6 * dt) claps(0, 0.8, 10, 0.15 * level);
  if (Math.random() < level * 0.08 * dt) whistle(0);
}

// Jubel: inspelad publik om den finns (kortas/tonas efter dur), annars syntetiska röster + applåd
export function cheer(strength = 1, dur = 2.2) {
  if (!ac) return;
  if (playSample('cheer', Math.min(1.3, 0.5 + 0.6 * strength), 0.05, Math.max(2.2, dur + 1), 0.5 + Math.random() * 0.8)) return;
  const n = Math.min(34, Math.round(14 + 18 * strength));
  for (let i = 0; i < n; i++) {
    const vow = Math.random() < 0.55 ? 'e' : 'a';
    const d = 0.6 + Math.random() * (dur - 0.4);
    voice(Math.random() * 0.35, d, randVoicePitch() * 1.15, vow, 0.16 * strength, 1.1 + Math.random() * 0.25, Math.random() * 1.8 - 0.9);
  }
  claps(0.25, dur, 28 * strength, 0.32 * strength);
  for (let i = 0; i < Math.round(2 * strength); i++) whistle(0.2 + Math.random() * dur * 0.6);
}

// ---------- Inspelade ljud (assets/sfx) ----------
// Laddas när ljudet startas; saknas en fil används det syntetiska ljudet i stället.
const SAMPLE_FILES = { ooh: 'assets/sfx/ooh.mp3', cheer: 'assets/sfx/cheer.mp3', crowd: 'assets/sfx/crowd.mp3' };
const samples = {};
function loadSamples() {
  for (const [name, url] of Object.entries(SAMPLE_FILES)) {
    fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
      .then((buf) => ac.decodeAudioData(buf))
      .then((ab) => { samples[name] = ab; })
      .catch(() => { /* behåll syntetiskt ljud */ });
  }
}
// dur: tona ut efter så många sekunder (för korta jubel), offset: börja en bit in i filen
function playSample(name, gain = 1, rateJitter = 0.06, dur = null, offset = 0) {
  const b = samples[name];
  if (!ac || !b) return false;
  const t = ac.currentTime;
  const src = ac.createBufferSource();
  src.buffer = b;
  src.playbackRate.value = 1 + (Math.random() * 2 - 1) * rateJitter; // lite variation varje gång
  const g = ac.createGain();
  g.gain.setValueAtTime(gain, t);
  src.connect(g).connect(master);
  src.start(t, offset);              // start måste komma före stop
  if (dur != null && dur < b.duration - offset) {
    g.gain.setValueAtTime(gain, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    src.stop(t + dur + 0.05);
  }
  return true;
}
export const hasSample = (name) => !!samples[name];

// Arenajubel: jubelinspelningen i loop, volymen styrs av hur nära arenan/läktaren man är.
// Två loopar förskjutna i tid så att skarven inte hörs.
let arena = null;
export function setArenaCheer(level) {
  const b = samples.cheer;
  if (!ac || !b) return;
  if (!arena) {
    const g = ac.createGain();
    g.gain.value = 0;
    g.connect(master);
    const mk = (off) => {
      const src = ac.createBufferSource();
      src.buffer = b;
      src.loop = true;
      src.loopStart = 0.4;
      src.loopEnd = b.duration - 0.2;
      const lg = ac.createGain();
      lg.gain.value = 0.6;
      src.connect(lg).connect(g);
      src.start(ac.currentTime, off);
    };
    mk(0.4);
    mk(0.4 + (b.duration - 0.6) / 2);
    arena = { g };
  }
  arena.g.gain.setTargetAtTime(Math.max(0, level) * 1.1, ac.currentTime, 0.6);
}

// "Åååh" vid miss: inspelad publik om den finns, annars syntetiska röster på o som glider nedåt
export function ooh() {
  if (!ac) return;
  if (playSample('ooh', 0.9)) return;
  for (let i = 0; i < 22; i++) {
    voice(Math.random() * 0.15, 1.0 + Math.random() * 0.4, randVoicePitch() * 1.25, 'o', 0.15, 0.72 + Math.random() * 0.08, Math.random() * 1.6 - 0.8);
  }
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
  setTimeout(() => ooh(), 120); // publiken: "åååh"
}

// ---------- För förhandslyssning/tester: rendera i en OfflineAudioContext ----------
export function _useContext(ctx) {
  ac = ctx;
  master = ctx.createGain();
  master.gain.value = 0.8;
  master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  crowdBus = null; loops = null;
}
export function _babble(seconds, level = 1) {
  const n = Math.round(seconds * 9 * level);
  for (let i = 0; i < n; i++) {
    const vow = ['a', 'e', 'o', 'i'][Math.floor(Math.random() * 4)];
    voice(Math.random() * seconds, 0.12 + Math.random() * 0.3, randVoicePitch(), vow, 0.05 * level, 0.9 + Math.random() * 0.25, Math.random() * 1.6 - 0.8);
  }
  claps(0, seconds, 4 * level, 0.15 * level);
}

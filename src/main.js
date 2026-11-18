import * as THREE from 'three';
import { Course, loadCourseData, LAP_LEN, LAPS, PENALTY_LEN, TIME_SCALE, FINISH_LEN, JOIN_S } from './course.js';
import { Skiing } from './skiing.js';
import { Shooting, AIM_LIMIT } from './shooting.js';
import { buildWorld, buildSkier, animateSkier, updateFlags, SUN_DIR } from './world.js';
import { createSnow } from './scenery.js';
import { drawPendulum, Minimap, Profile, drawFlag, fmtTime } from './hud.js';
import { Wind } from './wind.js';
import { connect } from './net.js';
import { Room, makeCode, makeId, standings, GhostRecorder, decodeGhost, ghostAt, COLOR_CSS } from './mp.js';
import { Ceremony } from './ceremony.js';
import { Rivals } from './rivals.js';
import * as sfx from './audio.js';

const $ = (id) => document.getElementById(id);
window.addEventListener('error', (e) => { const el = $('err'); el.textContent = 'Fel: ' + e.message; el.classList.remove('hidden'); });

// ---------- Inställningar (sparas lokalt om möjligt) ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem('skidskytte.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('skidskytte.' + k, JSON.stringify(v)); } catch { /* ignorera */ } },
};
const opts = { sound: store.get('sound', true), gyro: store.get('gyro', false) };
$('opt-sound').checked = opts.sound;
$('opt-gyro').checked = opts.gyro;

// ---------- Three.js ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
$('stage').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xcdd8e3, 120, 900);
const camera = new THREE.PerspectiveCamera(62, 1, 0.3, 4000);

const hemi = new THREE.HemisphereLight(0xdfeaff, 0x8a9aa8, 1.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
const sc = sun.shadow.camera;
sc.left = -35; sc.right = 35; sc.top = 35; sc.bottom = -35; sc.near = 1; sc.far = 300;
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);


// Riktig bana om data/course.json finns, annars procedurell
const course = new Course(await loadCourseData());
const world = buildWorld(scene, course);
const rivals = new Rivals(scene, course);
let wind = new Wind();
const skier = buildSkier();
skier.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
scene.add(skier.root);

const minimap = new Minimap($('minimap'), course);
const ceremony = new Ceremony(scene, course);
const snow = createSnow(scene);
const profile = new Profile($('profile'), course);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  for (const id of ['pendulum', 'scope', 'profile', 'flag']) {
    const c = $(id);
    const r = c.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio, 2);
    c.width = Math.max(1, Math.round(r.width * dpr));
    c.height = Math.max(1, Math.round(r.height * dpr));
  }
}
window.addEventListener('resize', resize);

// ---------- Spelstatus ----------
const ski = new Skiing();
ski.onPush = (power) => { if (opts.sound) sfx.polePlant(power, ski.lastPole, ski.lastEdge); };
ski.onBeat = () => { if (opts.sound && (state === 'ski' || state === 'penalty' || state === 'transit')) sfx.tick(); };
ski.onFall = () => {
  skier.fallSide = Math.random() < 0.5 ? -1 : 1;
  if (opts.sound) { sfx.fall(); }
  banner('Vurpa!', 'Tre tag i rad utanför pendeln – res dig och börja om', 1.6);
};

let arrivePath = null;
let state = 'menu'; // menu | lobby | countdown | ski | arrive | range | transit | penalty | done | ceremony
let transit = null;  // { path, d, then: 'penalty'|'lap', label }
let countdown = 0;
let mode = 'solo';       // 'solo' (träning mot spöken) | 'mp' (rum)
let mpStartLocal = 0;    // performance.now() när loppet startar (mp)

// ---------- Nätverk ----------
let db = null;
let room = null;
let raceId = 0;
let ceremonyShown = false;
let recorder = null;
let liveTimer = 0;
let ghosts = [];          // [{ name, color, time, g }]
// Nytt id per flik, så att flera flikar/enheter aldrig krockar
const me = { id: makeId(), name: store.get('name', '') };
$('in-name').value = me.name;
connect().then((d) => {
  db = d;
  $('net-note').textContent = d.online
    ? ''
    : 'Lokalt läge: multiplayer fungerar bara mellan flikar på samma enhet tills Firebase är kopplat.';
});
let race, shooting = null, arriveTimer = 0, bannerTimer = 0;
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
let camInit = false;

// seed: gemensam vind för alla i samma rum
function newRace(countSeconds = 3, seed = null) {
  ski.reset();
  ski.assistAllowed = true;
  wind = new Wind(seed == null ? Math.random : seeded(seed));
  $('ski-ui').classList.remove('sprint');
  race = { lap: 1, s: 0, time: 0, penaltyLeft: 0, penaltyDist: 0, onStraight: false, finishDist: 0, misses: [], splits: [], shootTime: [], shootStart: 0 };
  state = 'countdown';
  countdown = countSeconds - 0.001;
  recorder = new GhostRecorder();
  liveTimer = 0;
  ceremonyShown = false;
  camInit = false;
  showUI();
  countBanner(Math.ceil(countdown));
  if (opts.sound) sfx.beep(false);
}

function seeded(n) {
  let x = n >>> 0 || 1;
  return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 100000) / 100000; };
}

function countBanner(n) {
  const b = $('banner');
  b.classList.add('count');
  const hint = n > 3 ? 'Loppet startar snart' : 'Tryck Stavtag + Skär samtidigt när pendeln är i den gröna zonen';
  b.innerHTML = `${n}<small>${hint}</small>`;
  b.classList.remove('hidden');
  bannerTimer = 0;
}

function tickCountdown(dt) {
  const before = Math.ceil(countdown - 0.999);
  // I rum följer nedräkningen den gemensamma starttiden
  if (mode === 'mp' && mpStartLocal) countdown = (mpStartLocal - performance.now()) / 1000;
  else countdown -= dt;
  const after = Math.ceil(countdown - 0.999);
  if (after !== before) {
    if (after > 0) {
      countBanner(after);
      if (opts.sound) sfx.beep(false);
    } else {
      state = 'ski';
      ski.restart();
      banner('KÖR!', '', 1.0);
      $('banner').classList.add('count');
      if (opts.sound) { sfx.beep(true); sfx.cheer(0.6, 2); }
    }
  }
}

function showUI() {
  const skiing = state === 'ski' || state === 'penalty' || state === 'countdown' || state === 'transit';
  $('hud').classList.toggle('hidden', !(skiing || state === 'arrive'));
  $('ski-ui').classList.toggle('hidden', !skiing);
  $('shoot-ui').classList.toggle('hidden', state !== 'range');
  $('rp-bar').classList.toggle('hidden', mode !== 'practice');
  $('shoot-ui').classList.toggle('practice', mode === 'practice');
  $('menu').classList.toggle('hidden', state !== 'menu');
  $('result').classList.toggle('hidden', state !== 'done');
  $('lobby').classList.toggle('hidden', state !== 'lobby');
  $('ceremony').classList.toggle('hidden', state !== 'ceremony');
  $('h-place').classList.toggle('hidden', !(mode === 'mp' || ghosts.length));
  $('btn-again').classList.toggle('hidden', mode === 'mp');
  $('btn-r-lobby').classList.toggle('hidden', mode !== 'mp');
  $('r-wait').classList.toggle('hidden', mode !== 'mp');
  if (state !== 'ceremony') { ceremony.stop(); sfx.stopAnthem(); }
  camInit = false;
  requestAnimationFrame(resize);
}

function banner(text, small = '', t = 1.6) {
  const b = $('banner');
  b.classList.remove('count');
  b.innerHTML = text + (small ? `<small>${small}</small>` : '');
  b.classList.remove('hidden');
  bannerTimer = t;
}

function enterRange() {
  arrivePath = course.transits.arrive; // glid in från spåret till skjutmattan
  race.splits.push({ label: `Varv ${race.lap}`, t: race.time });
  state = 'arrive';
  arriveTimer = 1.6;
  const kind = race.lap === 1 ? 'prone' : 'standing';
  shooting = new Shooting(kind);
  banner(kind === 'prone' ? 'Liggande skytte' : 'Stående skytte', 'Vänta in pulsen – men klockan går', 1.4);
  showUI();
}

function startShooting() {
  state = 'range';
  race.shootStart = race.time;
  $('s-kind').textContent = shooting.kind === 'prone' ? 'Liggande' : 'Stående';
  renderShots();
  showUI();
  resize();
  gyroRef = null; // nytt neutralläge för varje skjutning
  gyroVel.x = gyroVel.y = 0;
}

function leaveRange() {
  const misses = shooting.misses;
  race.misses.push(misses);
  race.shootTime.push(race.time - race.shootStart);
  race.splits.push({ label: `${shooting.kind === 'prone' ? 'Liggande' : 'Stående'}: ${5 - misses}/5`, t: race.time });
  ski.restart();
  ski.v = 2;
  if (misses > 0) {
    ski.assistAllowed = true;  // starthjälp ut från vallen, men inte på själva straffrundan
    race.penaltyLeft = misses * PENALTY_LEN;
    race.penaltyDist = 0;
    startTransit(course.transits.toPenalty, 'penalty', 'till straffrundan');
    banner(`${misses} ${misses === 1 ? 'straffrunda' : 'straffrundor'}`, `${misses * PENALTY_LEN} m`, 1.8);
  } else {
    banner('Fullt!', '5 av 5', 1.5);
    startTransit(course.transits.rangeOut, 'lap', 'ut på banan');
  }
  shooting = null;
  showUI();
}

function startTransit(path, then, label) {
  transit = { path, d: 0, then, label };
  state = 'transit';
}

function nextLap(startS = 0) {
  ski.assistAllowed = true;
  race.lap++;
  race.s = startS;
  state = 'ski';
  if (race.lap === LAPS) {
    banner('Sista varvet!', '', 1.6);
    if (opts.sound) { sfx.bell(); sfx.cheer(0.6, 2); }
  }
}

function finish() {
  race.splits.push({ label: 'Mål', t: race.time });
  state = 'done';
  if (opts.sound) sfx.cheer(1.3, 4);
  const total = race.time;
  const misses = race.misses.reduce((a, b) => a + b, 0);
  const best = store.get('best', null);
  const isBest = best == null || total < best;
  if (isBest) store.set('best', total);
  $('r-time').textContent = fmtTime(total);
  $('r-detail').textContent = `${10 - misses}/10 träffar · ${misses} straffrund${misses === 1 ? 'a' : 'or'}` + (isBest ? ' · Personbästa!' : '');
  $('r-splits').innerHTML =
    race.splits.map((s) => `<div><span>${s.label}</span><span>${fmtTime(s.t)}</span></div>`).join('') +
    `<div><span>Perfekta tag</span><span>${ski.stats.perfect} av ${ski.stats.pushes}</span></div>` +
    `<div><span>Energi kvar</span><span>${Math.round(ski.energy)} %</span></div>`;
  if (opts.sound) sfx.beep(true);
  showUI();
  submitResult(total, misses, isBest);
}

// ---------- Resultat, topplista och spöken ----------
async function submitResult(time, misses, isBest) {
  const ghostStr = recorder ? recorder.encode() : '';
  if (isBest && ghostStr) store.set('ghost', { time, g: ghostStr });
  if (mode === 'mp' && room) {
    room.sendResult({ time, misses, raceId, progress: LAPS * LAP_LEN + FINISH_LEN });
    renderWait();
  }
  if (!db) return;
  const name = me.name || 'Anonym';
  try {
    let ghostId = null;
    const top = await db.topBy('leaderboard', 'time', 1);
    if (!top.length || time < top[0].time) ghostId = await db.push('ghosts', ghostStr);
    await db.push('leaderboard', { name, time, misses, ts: db.now(), ...(ghostId ? { ghost: ghostId } : {}) });
  } catch (e) { console.warn('Kunde inte spara resultatet', e); }
  renderBoard($('r-board'), 10, time);
}

async function renderBoard(el, n, highlightTime = null) {
  if (!db) { el.innerHTML = ''; return; }
  el.innerHTML = '<div class="res"><h3>Topplista</h3>Laddar …</div>';
  try {
    const list = await db.topBy('leaderboard', 'time', n);
    el.innerHTML = `<div class="res"><h3>Topplista${db.online ? '' : ' (lokal)'}</h3>` +
      (list.length ? list.map((r, i) =>
        `<div class="${highlightTime != null && Math.abs(r.time - highlightTime) < 0.001 ? 'me' : ''}"><span class="n">${i + 1}</span><span class="nm">${esc(r.name)}</span><span class="tm">${fmtTime(r.time)}</span><span class="tm">${r.misses} m</span></div>`
      ).join('') : '<p class="note">Inga resultat än</p>') + '</div>';
  } catch {
    el.innerHTML = '<p class="note">Topplistan kunde inte laddas</p>';
  }
}

const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Spöken för träning: eget personbästa + världens snabbaste
async function loadGhosts() {
  ghosts = [];
  const pb = store.get('ghost', null);
  if (pb && pb.g) ghosts.push({ name: 'Ditt bästa', color: 0x9fd0ff, time: pb.time, g: decodeGhost(pb.g) });
  if (!db) return;
  try {
    const top = await db.topBy('leaderboard', 'time', 1);
    if (top.length && top[0].ghost && (!pb || Math.abs(top[0].time - pb.time) > 0.01)) {
      const g = await db.get('ghosts/' + top[0].ghost);
      if (g) ghosts.push({ name: top[0].name, color: 0xffd23f, time: top[0].time, g: decodeGhost(g) });
    }
  } catch { /* ignorera */ }
}

// Mitt framsteg i meter (för placering och spöken)
function myProgress() {
  if (!race) return 0;
  if (state === 'arrive' || state === 'range' || state === 'penalty' || state === 'transit') return race.lap * LAP_LEN;
  if (state === 'done' || state === 'ceremony') return LAPS * LAP_LEN + FINISH_LEN;
  if (race.onStraight) return LAPS * LAP_LEN + race.finishDist;
  return (race.lap - 1) * LAP_LEN + race.s;
}
// Extra avstånd som skickas med läget: meter på straffrundan eller upploppsrakan
function mySubDist() {
  return state === 'penalty' ? race.penaltyDist : race?.onStraight ? race.finishDist : 0;
}
function myStCode() {
  return state === 'penalty' ? 'p' : state === 'arrive' || state === 'range' || state === 'transit' ? 'r' : state === 'done' ? 'f' : race?.onStraight ? 'm' : 's';
}

// Övriga deltagare: andra i rummet, eller spöken i träning
function competitors() {
  if (mode === 'mp' && room) {
    return room.players()
      .filter((p) => p.id !== me.id && (p.status === 'racing' || (p.status === 'done' && p.result?.raceId === raceId)))
      .map((p) => ({
        id: p.id, name: p.name, color: p.color,
        done: p.status === 'done', time: p.result?.time ?? 0,
        progress: p.live?.p ?? 0, st: p.live?.st ?? 's', pd: p.live?.pd ?? 0,
      }));
  }
  if (!race) return [];
  return ghosts.map((g) => {
    const a = ghostAt(g.g, race.time);
    return { name: g.name, color: g.color, done: a.done, time: g.time, progress: a.p, st: a.st, pd: a.pd };
  });
}

function posOf(c) {
  if (c.st === 'p') { const p = course.penaltyPoint(c.pd); return { x: p[0], z: p[2] }; }
  if (c.st === 'm') { const p = course.finishPoint(c.pd); return { x: p[0], z: p[2] }; }
  if (c.st === 'r') return { x: course.rangePos[0], z: course.rangePos[1] };
  if (c.st === 'f' || c.done) return { x: course.stadium[0], z: course.stadium[1] };
  const p = course.pointAt(c.progress % LAP_LEN);
  return { x: p[0], z: p[2] };
}

function updatePlace(others) {
  if (!others.length) return;
  const mine = { me: true, done: state === 'done', time: race.time, progress: myProgress() };
  const order = standings([mine, ...others]);
  $('h-place').textContent = `${order.indexOf(mine) + 1} / ${order.length}`;
}

// ---------- Rum ----------
function playerName() {
  me.name = $('in-name').value.trim().slice(0, 16);
  store.set('name', me.name);
  return me.name;
}

async function enterRoom(code, create) {
  const msg = $('mp-msg');
  if (!playerName()) { msg.textContent = 'Skriv ditt namn först'; $('in-name').focus(); return; }
  if (!db) { msg.textContent = 'Ansluter … försök igen om en sekund'; return; }
  code = code.toUpperCase();
  if (!/^[A-Z]{4}$/.test(code)) { msg.textContent = 'Koden är fyra bokstäver'; return; }
  const r = new Room(db, code, me);
  if (create) await r.create();
  else if (!(await r.exists())) { msg.textContent = `Hittar inget rum med koden ${code}`; return; }
  await r.join();
  room = r;
  mode = 'mp';
  msg.textContent = '';
  $('l-code').textContent = code;
  state = 'lobby';
  showUI();
  room.listen(onRoom);
}

function onRoom(d) {
  if (!room) return;
  if (!d) return;
  // Min post saknas (tappad anslutning) → lägg tillbaka mig innan något annat händer
  if (!room.mine()) { room.rejoin(); if (state === 'lobby') renderLobby(); return; }
  room.maybeStart();
  // Nedräkningen avbröts (någon ny anslöt) → tillbaka till lobbyn, fortfarande redo
  if (state === 'countdown' && mode === 'mp' && !d.startAt) {
    state = 'lobby';
    race = null;
    room.db.update(`${room.path}/players/${me.id}`, { status: 'lobby', ready: true });
    room.localStatus = 'lobby';
    $('banner').classList.add('hidden');
    showUI();
    renderLobby();
    lobbyNote = { text: 'Någon ny anslöt – nedräkningen avbröts. Loppet startar när alla trycker Redo.', until: performance.now() + 6000 };
    renderLobby();
    return;
  }
  if (state === 'lobby') renderLobby();
  // Synkad start: starttid satt och jag är redo i lobbyn
  const my = room.mine();
  if (state === 'lobby' && d.startAt && my && my.ready && my.status === 'lobby' && d.startAt > db.now() - 500) {
    raceId = d.raceId;
    mpStartLocal = performance.now() + (d.startAt - db.now());
    room.startRacing();
    newRace(Math.max(1, (d.startAt - db.now()) / 1000), d.startAt);
  }
  if (state === 'done') {
    renderWait();
    maybeCeremony();
  }
}

let lobbyNote = null;
function renderLobby() {
  const ps = room.players();
  const my = room.mine();
  $('l-players').innerHTML = ps.map((p) => {
    const st = p.online === false ? 'frånkopplad' : p.status === 'racing' ? 'i loppet' : p.status === 'done' ? 'i mål' : p.ready ? 'Redo ✓' : 'väntar';
    return `<li><span class="dot" style="background:${COLOR_CSS(p.color)}"></span><span>${esc(p.name)}${p.id === me.id ? ' (du)' : ''}</span><span class="st ${p.ready ? 'ok' : ''}">${st}</span></li>`;
  }).join('');
  const busy = ps.some((p) => p.status === 'racing');
  const ready = !!my?.ready;
  $('btn-ready').textContent = ready ? 'Inte redo' : 'Redo';
  const startAt = room.data?.startAt;
  const left = startAt ? Math.ceil((startAt - db.now()) / 1000) : 0;
  $('l-msg').textContent = lobbyNote && performance.now() < lobbyNote.until ? lobbyNote.text
    : left > 0 && ready ? `Startar om ${left} s …`
    : busy ? 'Ett lopp pågår – du kommer med i nästa.'
    : ps.length < 2 ? 'Väntar på fler … (du kan också köra ensam)'
    : ps.every((p) => p.ready) ? 'Alla redo!'
    : ready ? `Väntar på att alla ska trycka Redo (${ps.filter((p) => p.ready).length}/${ps.length})` : '';
}

function renderWait() {
  if (mode !== 'mp' || !room) return;
  const ps = room.players().filter((p) => p.status === 'racing' || (p.status === 'done' && p.result?.raceId === raceId));
  const done = ps.filter((p) => p.status === 'done').sort((a, b) => a.result.time - b.result.time);
  const racing = ps.filter((p) => p.status === 'racing').sort((a, b) => (b.live?.p ?? 0) - (a.live?.p ?? 0));
  $('r-wait').innerHTML = `<div class="res"><h3>Rummet ${room.code}</h3>` +
    done.map((p, i) => `<div class="${p.id === me.id ? 'me' : ''}"><span class="n">${i + 1}</span><span class="dot" style="background:${COLOR_CSS(p.color)}"></span><span class="nm">${esc(p.name)}</span><span class="tm">${fmtTime(p.result.time)}</span></div>`).join('') +
    racing.map((p) => `<div><span class="n">–</span><span class="dot" style="background:${COLOR_CSS(p.color)}"></span><span class="nm">${esc(p.name)}</span><span class="tm">åker …</span></div>`).join('') +
    (racing.length ? `<p class="note">Prisutdelningen börjar när alla är i mål</p>` : '') + '</div>';
}

function maybeCeremony() {
  if (ceremonyShown || mode !== 'mp' || !room) return;
  const ps = room.players().filter((p) => p.status === 'racing' || (p.status === 'done' && p.result?.raceId === raceId));
  if (ps.some((p) => p.status === 'racing')) return;
  const order = ps.filter((p) => p.status === 'done').sort((a, b) => a.result.time - b.result.time);
  if (!order.length) return;
  ceremonyShown = true;
  setTimeout(() => startCeremony(order), 1500);
}

function startCeremony(order) {
  if (state !== 'done') return;
  state = 'ceremony';
  ceremony.start(order.map((p) => ({ name: p.name, color: p.color })));
  $('c-list').innerHTML = '<div class="res">' + order.map((p, i) =>
    `<div class="${p.id === me.id ? 'me' : ''}"><span class="n">${i + 1}</span><span class="dot" style="background:${COLOR_CSS(p.color)}"></span><span class="nm">${esc(p.name)}</span><span class="tm">${fmtTime(p.result.time)}</span></div>`).join('') + '</div>';
  showUI();
  if (opts.sound) { sfx.playAnthem(); setTimeout(() => sfx.cheer(1, 4), 300); }
}

function backToLobby() {
  if (!room) return toMenu();
  room.setStatus('lobby');
  state = 'lobby';
  showUI();
  renderLobby();
}

async function toMenu() {
  if (room) { const r = room; room = null; await r.leave(); }
  mode = 'solo';
  state = 'menu';
  ghosts = [];
  showUI();
  showBest();
}

// ---------- Uppdatering ----------
let heartPhase = 0;

function update(dt) {
  if (state === 'menu' || state === 'done') return;
  if (state === 'lobby') { if (room?.data) renderLobby(); return; }
  if (state === 'countdown') { tickCountdown(dt); return; }
  if (state === 'ceremony') return;
  race.time += dt;
  if (recorder) recorder.sample(race.time, myProgress(), myStCode(), mySubDist());
  if (mode === 'mp' && room) {
    liveTimer += dt;
    if (liveTimer > 0.25) {
      liveTimer = 0;
      room.sendLive({ p: Math.round(myProgress()), st: myStCode(), pd: Math.round(mySubDist()) });
    }
  }

  if (state === 'ski') {
    const grade = race.onStraight ? 0 : course.gradeAt(race.s);
    // Spurt på upploppet: takten drivs upp under de första ~25 m
    ski.sprint = race.onStraight ? Math.min(1, 0.35 + race.finishDist / 40) : 0;
    $('ski-ui').classList.toggle('sprint', ski.sprint > 0);
    ski.update(dt, grade);
    const ds = ski.v * dt * TIME_SCALE;
    if (race.onStraight) {
      race.finishDist += ds;
      if (race.finishDist >= FINISH_LEN) { race.finishDist = FINISH_LEN; finish(); }
    } else {
      race.s += ds;
      if (race.s >= LAP_LEN) {
        if (race.lap < LAPS) { race.s = LAP_LEN; enterRange(); }
        else {
          // Sista varvet: in på upploppsrakan mot målportalen
          race.s = LAP_LEN;
          race.onStraight = true;
          race.finishDist = 0;
          banner('Spurta!', `${FINISH_LEN} m kvar – staka så fort du kan!`, 1.6);
          if (opts.sound) sfx.cheer(1, 3);
        }
      }
    }
  } else if (state === 'penalty') {
    ski.update(dt, 0);
    const ds = ski.v * dt * TIME_SCALE;
    race.penaltyLeft -= ds;
    race.penaltyDist += ds;
    if (race.penaltyLeft <= 0) {
      // åk ut från straffrundan och in på banan igen
      ski.assistAllowed = true;
      race.penaltyDist = Math.round(race.penaltyDist / PENALTY_LEN) * PENALTY_LEN;
      startTransit(course.transits.penaltyOut, 'lap', 'ut på banan');
    }
  } else if (state === 'transit') {
    ski.update(dt, 0);
    transit.d += ski.v * dt * TIME_SCALE;
    if (transit.d >= transit.path.len) {
      const then = transit.then;
      transit = null;
      if (then === 'penalty') { state = 'penalty'; ski.assistAllowed = false; }
      else nextLap(JOIN_S);
    }
  } else if (state === 'arrive') {
    ski.rest(dt);
    arriveTimer -= dt;
    if (arriveTimer <= 0) startShooting();
  } else if (state === 'range') {
    ski.rest(dt);
    shooting.update(dt, ski.pulse, wind.at(race.time));
    // Hjärtslag hörs i kikaren
    heartPhase += (dt * ski.pulse) / 60;
    if (heartPhase >= 1) {
      heartPhase -= 1;
      if (opts.sound) sfx.heartbeat(Math.min(1, (ski.pulse - 50) / 100));
      const h = $('s-heart');
      h.classList.add('beat');
      setTimeout(() => h.classList.remove('beat'), 90);
    }
    for (const ev of shooting.events) {
      if (!opts.sound) continue;
      if (ev === 'hit') {
        sfx.shot(); sfx.hit();
        const full = shooting.targets.every((t) => t.hit);
        setTimeout(() => {
          sfx.hitCheer();                       // varje träff: snabbt jubel
          if (full) sfx.cheer(1.2, 3.5);        // fullt: det stora jublet ovanpå
        }, 150);
      } else if (ev === 'miss') { sfx.shot(); sfx.miss(); setTimeout(sfx.ooh, 200); }
      else if (ev === 'inhale') sfx.inhale();
      else if (ev === 'exhale') sfx.exhale();
      else if (ev === 'gasp') sfx.gasp();
    }
    if (shooting.events.length) renderShots();
    shooting.events.length = 0;
    if (shooting.done) { if (mode === 'practice') nextSeries(); else leaveRange(); }
  }

  if (bannerTimer > 0) {
    bannerTimer -= dt;
    if (bannerTimer <= 0) $('banner').classList.add('hidden');
  }
}

// ---------- Rendering ----------
const tmpV = new THREE.Vector3();

function placeSkier(dt) {
  let x, y, z, tx, tz, mode = 'ski';
  if (state === 'penalty') {
    [x, y, z] = course.penaltyPoint(race.penaltyDist);
    [tx, tz] = course.penaltyTangent(race.penaltyDist);
  } else if (state === 'transit' && transit) {
    ({ x, y, z, tx, tz } = transit.path.at(transit.d));
  } else if (state === 'arrive' && arrivePath && arriveTimer > 0.35) {
    // glider in mot skjutmattan
    const f = Math.min(1, (1.6 - arriveTimer) / 1.25);
    const e = 1 - (1 - f) * (1 - f);
    ({ x, y, z, tx, tz } = arrivePath.at(e * arrivePath.len));
  } else if (race?.onStraight && (state === 'ski' || state === 'done')) {
    [x, y, z] = course.finishPoint(race.finishDist);
    [tx, tz] = course.finishDir;
  } else if (state === 'arrive' || state === 'range' || (state === 'done')) {
    if (state === 'done') {
      [x, y, z] = course.pointAt(0);
      [tx, tz] = course.tangentAt(0);
    } else {
      x = course.rangePos[0]; z = course.rangePos[1]; y = course.stadiumElev;
      [tx, tz] = course.normal;
      mode = shooting && shooting.kind === 'prone' ? 'prone' : 'stand';
    }
  } else {
    const idle = state === 'menu' || state === 'lobby' || !race;
    const s = idle ? 40 : race.s;
    [x, y, z] = course.pointAt(s);
    [tx, tz] = course.tangentAt(s);
  }
  skier.root.position.set(x, y, z);
  skier.root.rotation.y = Math.atan2(tx, tz);
  const grade = state === 'ski' && !race.onStraight ? course.gradeAt(race.s) : 0;
  if (ski.fallen > 0 && (state === 'ski' || state === 'penalty' || state === 'transit')) { mode = 'fall'; skier.fallT = 2.6 - ski.fallen; }
  skier.poleOn = ski.lastPole !== false;
  skier.edgeOn = ski.lastEdge !== false;
  animateSkier(skier, dt, ski.pushAnim, ski.pushSide, state === 'menu' || state === 'lobby' ? 0 : ski.v, grade, mode);

  // Kamera bakom och ovanför
  const back = mode === 'ski' ? 3.5 : 4.2;
  const up = mode === 'ski' ? 1.65 : 1.6;
  tmpV.set(x - tx * back, y + up, z - tz * back);
  const look = new THREE.Vector3(x + tx * 4, y + 1.2, z + tz * 4);
  if (state === 'menu' || state === 'lobby') {
    const a = performance.now() / 9000;
    tmpV.set(x + Math.cos(a) * 7, y + 2.2, z + Math.sin(a) * 7);
    look.set(x, y + 1, z);
  }
  const k = camInit ? 1 - Math.exp(-dt * 5) : 1;
  camPos.lerp(tmpV, k);
  camLook.lerp(look, k);
  camInit = true;
  // håll kameran över marken
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  if (window.__camOverride) window.__camOverride(camera); // testhake

  sun.position.set(x + SUN_DIR.x * 120, y + SUN_DIR.y * 120, z + SUN_DIR.z * 120);
  sun.target.position.set(x, y, z);
}

function updateHud() {
  if (!race || state === 'menu' || state === 'done' || state === 'lobby' || state === 'ceremony') return;
  const t = fmtTime(race.time);
  $('h-time').textContent = t;
  $('s-time').textContent = t;
  let dist;
  if (state === 'penalty') dist = `Straffrunda: ${Math.max(0, Math.ceil(race.penaltyLeft))} m`;
  else if (state === 'transit') dist = `${Math.max(0, Math.ceil(transit.path.len - transit.d))} m ${transit.label}`;
  else if (race.onStraight) dist = `${Math.max(0, Math.ceil(FINISH_LEN - race.finishDist))} m till mål`;
  else if (race.lap < LAPS) dist = `${Math.max(0, Math.ceil(LAP_LEN - race.s))} m till vallen`;
  else dist = `${Math.max(0, Math.ceil(LAP_LEN - race.s + FINISH_LEN))} m till mål`;
  $('h-dist').textContent = dist;
  const bpm = Math.round(ski.pulse);
  $('h-bpm').textContent = bpm;
  $('s-bpm').textContent = bpm;
  const pct = Math.min(100, Math.max(0, ((ski.pulse - 55) / 145) * 100));
  const bar = $('h-pulsebar');
  bar.style.width = pct + '%';
  bar.style.backgroundSize = (100 / Math.max(pct, 1)) * 100 + '% 100%';
  $('h-speed').textContent = `${Math.round(ski.v * 3.6)} km/h`;
  const e = Math.round(ski.energy);
  $('h-energy').textContent = e + ' %';
  $('s-energy').textContent = e + ' %';
  $('h-energybar').style.width = e + '%';
  if (shooting) {
    $('s-breath').style.width = shooting.breath * 100 + '%';
    $('s-breath').classList.toggle('empty', !shooting.holding && !shooting.canHold);
    $('btn-breath').classList.toggle('blocked', !shooting.holding && !shooting.canHold);
    $('btn-breath').textContent = shooting.holding ? 'Håller andan' : shooting.canHold ? 'Håll andan' : 'Andas…';
  }
}

function renderShots() {
  if (!shooting) return;
  const n = 5 - shooting.shotsLeft;
  $('s-shots').innerHTML = shooting.targets
    .map((_, i) => {
      if (i >= n) return '<i></i>';
      return `<i class="${shooting.shots[i].hit ? 'hit' : 'miss'}"></i>`;
    })
    .join('');
}

let last = performance.now();
// Glidljud efter fart, publikens sorl efter avstånd till stadion
let straightCheer = 0;
function updateAmbience() {
  if (!opts.sound) return;
  const skiing = race && (state === 'ski' || state === 'penalty' || state === 'transit') && ski.fallen <= 0;
  sfx.setGlide(ski.v, !!skiing);
  let crowd = 0;
  if (state === 'arrive' || state === 'range') crowd = 0.75;
  else if (state === 'done' || state === 'ceremony') crowd = 0.9;
  else if (race?.onStraight) crowd = 1.15;          // läktaren längs upploppet
  else if (race && (skiing || state === 'countdown' || state === 'penalty')) {
    const p = skier.root.position;
    const d = Math.hypot(p.x - course.stadium[0], p.z - course.stadium[1]);
    crowd = Math.max(0, Math.min(1, (260 - d) / 220));
  }
  // Upploppet: återkommande jubelvågor medan man spurtar
  if (race?.onStraight && state === 'ski') {
    straightCheer -= 1 / 60;
    if (straightCheer <= 0) {
      // inspelat jubel är 6 s långt – starta en ny våg innan den förra klingat ut
      const rec = sfx.hasSample('cheer');
      sfx.cheer(1.1, rec ? 6 : 2.4);
      straightCheer = rec ? 4.2 + Math.random() : 1.6 + Math.random() * 0.8;
    }
  } else straightCheer = 0;
  sfx.setCrowd(crowd);
  sfx.setArenaCheer(arenaCheerLevel());
}

// Jubel från arenan: fullt vid starten, tonar bort när man åker ut, och växer
// successivt när man närmar sig stadion och läktaren igen.
function arenaCheerLevel() {
  if (!race || state === 'menu' || state === 'lobby') return 0;
  if (state === 'countdown') return 0.55;
  if (state === 'ceremony') return sfx.anthemPlaying() ? 0.25 : 0.6;   // musiken får höras
  if (state === 'done') return 0.7;
  if (state === 'arrive' || state === 'range') return 0.12;
  if (state === 'penalty' || state === 'transit') return 0.3;
  if (race.onStraight) return 0.75 + 0.35 * (race.finishDist / FINISH_LEN); // förbi läktaren mot mål
  const toStadium = LAP_LEN - race.s;          // meter kvar till stadion
  const coming = Math.max(0, 1 - toStadium / 450);   // börjar ca 450 m innan
  const leaving = Math.max(0, 1 - race.s / 180);     // tonar bort efter starten/vallen
  const sinceStart = race.time < 6 && race.lap === 1 ? 1 - race.time / 6 : 0;
  return Math.max(coming * coming * (race.lap === LAPS ? 1 : 0.75), leaving * 0.45, sinceStart * 0.8);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  updateHud();
  updateAmbience();

  if (state === 'range') {
    const c = $('scope');
    shooting.draw(c.getContext('2d'), c.width, c.height);
    const f = $('flag');
    drawFlag(f.getContext('2d'), f.width, f.height, shooting.wind, race.time);
    return; // 3D är dold under kikaren – spara batteri
  }
  if (state === 'ceremony') {
    if (rivals.map.size) rivals.clear();
    ceremony.update(dt, camera);
    const W = window.innerWidth, H = window.innerHeight;
    $('c-labels').innerHTML = ceremony.labels(camera, W, H)
      .filter((l) => l.show)
      .map((l) => `<div style="left:${l.x}px;top:${l.y}px"><b>${l.place}</b>${esc(l.name)}</div>`).join('');
    sun.position.copy(ceremony.origin).addScaledVector(SUN_DIR, 120);
    sun.target.position.copy(ceremony.origin);
    updateFlags(world.flags, wind.at(now / 1000), now / 1000);
    renderer.render(scene, camera);
    return;
  }
  placeSkier(dt);
  const others = (race && state !== 'menu' && state !== 'lobby') ? competitors() : [];
  // andra spelare som åkare i 3D (multiplayer)
  if (rivals) {
    if (window.__rivalList) rivals.update(dt, window.__rivalList(), now / 1000, camera.position); // testhake
    else if (mode === 'mp' && race && state !== 'menu' && state !== 'lobby') rivals.update(dt, others, now / 1000, camera.position);
    else if (rivals.map.size) rivals.clear();
  }
  const dots = others.map((c) => ({ ...posOf(c), color: COLOR_CSS(c.color) }));
  if (race && state !== 'menu') updatePlace(others);
  if (state === 'ski' || state === 'penalty' || state === 'countdown' || state === 'transit') {
    const c = $('pendulum');
    drawPendulum(c.getContext('2d'), c.width, c.height, ski);
    let mx, mz;
    if (state === 'penalty') { const p = course.penaltyPoint(race.penaltyDist); mx = p[0]; mz = p[2]; }
    else if (state === 'transit' && transit) { const p = transit.path.at(transit.d); mx = p.x; mz = p.z; }
    else if (race.onStraight) { const p = course.finishPoint(race.finishDist); mx = p[0]; mz = p[2]; }
    else { const p = course.pointAt(race.s); mx = p[0]; mz = p[2]; }
    minimap.draw({ x: mx, z: mz }, dots, `Varv ${race.lap}/${LAPS}`);
    profile.draw(state === 'penalty' || state === 'transit' ? course.n : race.s, race.lap < LAPS);
  } else if (state === 'arrive') {
    minimap.draw({ x: course.rangePos[0], z: course.rangePos[1] }, dots, `Varv ${race.lap}/${LAPS}`);
  }
  updateFlags(world.flags, race ? wind.at(race.time) : wind.at(now / 1000), now / 1000);
  world.animateCrowd(now / 1000);
  world.setClock(race && state !== 'menu' && state !== 'lobby' ? fmtTime(race.time) : '0:00.0');
  snow(camera, dt, race ? wind.at(race.time) : 0);
  renderer.render(scene, camera);
}

// ---------- Inmatning ----------
function holdButton(el, onDown, onUp) {
  const active = new Set();
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    el.setPointerCapture?.(e.pointerId);
    active.add(e.pointerId);
    el.classList.add('down');
    onDown?.();
  });
  const up = (e) => {
    if (!active.delete(e.pointerId)) return;
    if (active.size === 0) { el.classList.remove('down'); onUp?.(); }
  };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

const skiing = () => state === 'ski' || state === 'penalty' || state === 'transit';
holdButton($('btn-pole'), () => skiing() && ski.press('pole'));
holdButton($('btn-edge'), () => skiing() && ski.press('edge'));
holdButton($('btn-breath'), () => shooting && shooting.setHolding(true), () => shooting && shooting.setHolding(false));
// Efter varje skott blir telefonens läge just då det nya neutralläget för gyrot
// (man håller still när man skjuter), så att en ändrad hållning aldrig gör att siktet drar iväg.
const gyroRecenter = () => {}; // gyrot är relativt (följer rörelsen), inget nolläge behövs
holdButton($('btn-fire'), () => { if (shooting && state === 'range') { shooting.fire(); gyroRecenter(); } });

// Sikta genom att dra på kikaren
const scope = $('scope');
let dragId = null, dragX = 0, dragY = 0;
scope.addEventListener('pointerdown', (e) => {
  if (dragId != null) return;
  dragId = e.pointerId; dragX = e.clientX; dragY = e.clientY;
  scope.setPointerCapture?.(e.pointerId);
  $('s-hint').classList.add('hidden');
});
scope.addEventListener('pointermove', (e) => {
  if (e.pointerId !== dragId || !shooting) return;
  const R = Math.min(scope.clientWidth, scope.clientHeight) * 0.46;
  const mmPerPx = 230 / R;
  shooting.moveAim((e.clientX - dragX) * mmPerPx * 0.55, (e.clientY - dragY) * mmPerPx * 0.55);
  dragX = e.clientX; dragY = e.clientY;
});
const endDrag = (e) => { if (e.pointerId === dragId) dragId = null; };
scope.addEventListener('pointerup', endDrag);
scope.addEventListener('pointercancel', endDrag);

// Gyro (valbart): siktet följer telefonens rörelse, som när man pekar med en kamera.
// Vrider/lutar man telefonen flyttas siktet lika mycket, och håller man telefonen
// still ligger siktet still (inget neutralläge som siktet "faller tillbaka" mot).
// - Sidled: vrid telefonen åt sidan (panorera) eller luta som en ratt.
// - Höjdled: överkanten mot dig = siktet uppåt, bort från dig = nedåt.
// Mycket långsamma rörelser (under ~1,5°/s) ignoreras, så man kan sakta "flytta tillbaka"
// telefonen till en bekväm hållning utan att siktet följer med.
// Rotationen räknas som en rotationsmatris av hela orienteringen, så hopp i
// vinklarna (t.ex. när telefonen står på högkant i landskapsläge) spelar ingen roll.
let gyroRef = null;               // föregående orientering (3×3-matris), null = börja om
let gyroCur = null;
let gyroT = 0;
const GYRO_MM_PER_DEG_X = 42;     // sidled: ca 21° vridning över alla fem tavlor
const GYRO_MM_PER_DEG_Y = 30;     // höjdled
const GYRO_MIN_SPEED = 1.5;       // °/s – långsammare än så räknas som "flytta hållningen"
const gyroVel = { x: 0, y: 0 };   // kvar för kompatibilitet (används inte längre)
function eulerToMatrix(a, b, g) {
  // W3C: R = Rz(alpha) · Rx(beta) · Ry(gamma), telefon → jord
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cg = Math.cos(g), sg = Math.sin(g);
  return [
    [ca * cg - sa * sb * sg, -cb * sa, ca * sg + cg * sa * sb],
    [cg * sa + ca * sb * sg, ca * cb, sa * sg - ca * cg * sb],
    [-cb * sg, sb, cb * cg],
  ];
}
window.addEventListener('deviceorientation', (e) => {
  if (!opts.gyro || state !== 'range' || !shooting || e.beta == null || e.gamma == null) return;
  const d2r = Math.PI / 180;
  const R = eulerToMatrix((e.alpha || 0) * d2r, e.beta * d2r, e.gamma * d2r);
  const now = performance.now() / 1000;
  gyroCur = R;
  if (!gyroRef) { gyroRef = R; gyroT = now; return; }
  const P = gyroRef, dt = Math.max(0.005, Math.min(0.2, now - gyroT));
  gyroRef = R; gyroT = now;
  // Rotation i telefonens egna koordinater: D = Pᵀ·R (små vinklar → axel·vinkel)
  const D = (i, j) => P[0][i] * R[0][j] + P[1][i] * R[1][j] + P[2][i] * R[2][j];
  const wx = (D(2, 1) - D(1, 2)) / 2, wy = (D(0, 2) - D(2, 0)) / 2, wz = (D(1, 0) - D(0, 1)) / 2;
  // Skärmens axlar uttryckta i telefonens koordinater
  const ang = (((screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0) * d2r);
  const upX = Math.sin(ang), upY = Math.cos(ang);       // skärmens "upp"
  const rtX = Math.cos(ang), rtY = -Math.sin(ang);      // skärmens "höger"
  const rUp = (wx * upX + wy * upY) / d2r;              // panorering (grader)
  const rRight = (wx * rtX + wy * rtY) / d2r;           // fällning
  const rRoll = wz / d2r;                               // ratt
  if (Math.abs(rUp) + Math.abs(rRight) + Math.abs(rRoll) > 30) return; // orimligt hopp: hoppa över
  let h = rUp + rRoll;     // vrid vänster eller luta vänster sida ner → siktet åt vänster
  let v = rRight;          // överkanten mot dig → siktet uppåt
  if (Math.hypot(h, v) / dt < GYRO_MIN_SPEED) return;    // för långsamt: bara omställning av hållningen
  shooting.moveAim(-h * GYRO_MM_PER_DEG_X, -v * GYRO_MM_PER_DEG_Y);
});

// Tangentbord (dator)
const keys = new Set();
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys.add(e.code);
  if (skiing()) {
    if (e.code === 'KeyJ' || e.code === 'KeyF') ski.press('pole');
    if (e.code === 'KeyK' || e.code === 'KeyD') ski.press('edge');
    if (e.code === 'Space') { ski.press('pole'); ski.press('edge'); e.preventDefault(); }
  } else if (state === 'range' && shooting) {
    if (e.code === 'Space') { shooting.setHolding(true); e.preventDefault(); }
    if (e.code === 'Enter') { shooting.fire(); gyroRecenter(); }
  }
});
window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (e.code === 'Space' && shooting) shooting.setHolding(false);
});
setInterval(() => {
  if (state !== 'range' || !shooting) return;
  const s = 6;
  if (keys.has('ArrowLeft')) shooting.moveAim(-s, 0);
  if (keys.has('ArrowRight')) shooting.moveAim(s, 0);
  if (keys.has('ArrowUp')) shooting.moveAim(0, -s);
  if (keys.has('ArrowDown')) shooting.moveAim(0, s);
}, 16);

// ---------- Meny ----------
function showBest() {
  const b = store.get('best', null);
  $('best').textContent = b == null ? '' : `Personbästa: ${fmtTime(b)}`;
}
showBest();

$('opt-sound').addEventListener('change', (e) => { opts.sound = e.target.checked; store.set('sound', opts.sound); sfx.setEnabled(opts.sound); });
$('opt-gyro').addEventListener('change', (e) => { opts.gyro = e.target.checked; store.set('gyro', opts.gyro); });

async function prepare() {
  sfx.init();
  sfx.setEnabled(opts.sound);
  if (opts.gyro && typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) {
    try { await DeviceOrientationEvent.requestPermission(); } catch { /* nekad */ }
  }
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    }
    await screen.orientation?.lock?.('landscape');
  } catch { /* stöds inte överallt (t.ex. iPhone) */ }
}

// ---------- Skytteträning ----------
// Direkt till vallen, så många serier man vill. Varje serie börjar med vald puls
// och pulsen sjunker sedan i vila som på riktigt. Klockan visar seriens tid.
const RP_PULSES = [[78, 'lugn'], [140, 'efter åkning'], [170, 'max']];
const practice = { kind: 'prone', pulseIdx: 0, series: 0, hits: 0, shots: 0, best: null };

function rpStats() {
  const pct = practice.shots ? Math.round((100 * practice.hits) / practice.shots) : 0;
  $('rp-stats').textContent = practice.shots
    ? `Serie ${practice.series + 1} · ${practice.hits}/${practice.shots} (${pct} %)`
    : `Serie ${practice.series + 1}`;
  $('rp-kind').textContent = practice.kind === 'prone' ? 'Byt till stående' : 'Byt till liggande';
  $('rp-pulse').textContent = `Puls: ${RP_PULSES[practice.pulseIdx][1]}`;
}

function startSeries() {
  shooting = new Shooting(practice.kind);
  ski.pulse = RP_PULSES[practice.pulseIdx][0];
  race.time = 0;
  wind = new Wind(Math.random);
  startShooting();
  rpStats();
}

function nextSeries() {
  const hits = 5 - shooting.misses;
  practice.series++;
  practice.hits += hits;
  practice.shots += 5;
  const t = race.time - race.shootStart;
  banner(hits === 5 ? 'Fullt!' : `${hits} av 5`, `${practice.kind === 'prone' ? 'Liggande' : 'Stående'} · ${fmtTime(t)}`, 1.4);
  startSeries();
}

async function startPractice() {
  playerName();
  mode = 'practice';
  await prepare();
  ghosts = [];
  ski.reset();
  practice.series = 0; practice.hits = 0; practice.shots = 0;
  race = { lap: 1, s: 0, time: 0, penaltyLeft: 0, penaltyDist: 0, onStraight: false, finishDist: 0, misses: [], splits: [], shootTime: [], shootStart: 0 };
  recorder = null;
  startSeries();
}
$('btn-range').addEventListener('click', startPractice);
$('rp-kind').addEventListener('click', () => {
  practice.kind = practice.kind === 'prone' ? 'standing' : 'prone';
  practice.series = 0; practice.hits = 0; practice.shots = 0; // egen statistik per ställning
  startSeries(); // ny serie i den nya ställningen
});
$('rp-pulse').addEventListener('click', () => {
  practice.pulseIdx = (practice.pulseIdx + 1) % RP_PULSES.length;
  ski.pulse = RP_PULSES[practice.pulseIdx][0];
  rpStats();
});
$('rp-quit').addEventListener('click', toMenu);

async function start() {
  playerName();
  mode = 'solo';
  await prepare();
  await loadGhosts();
  newRace();
  resize();
}
$('btn-start').addEventListener('click', start);
$('btn-again').addEventListener('click', () => { showBest(); start(); });
$('btn-r-menu').addEventListener('click', toMenu);
$('btn-r-lobby').addEventListener('click', backToLobby);
$('btn-c-lobby').addEventListener('click', backToLobby);
$('btn-mp').addEventListener('click', () => {
  $('menu-main').classList.add('hidden');
  $('mp-panel').classList.remove('hidden');
});
$('btn-mp-back').addEventListener('click', () => {
  $('menu-main').classList.remove('hidden');
  $('mp-panel').classList.add('hidden');
});
$('btn-create').addEventListener('click', async () => {
  await prepare();
  let code = makeCode();
  if (db) for (let i = 0; i < 5 && (await new Room(db, code, me).exists()); i++) code = makeCode();
  enterRoom(code, true);
});
$('btn-join').addEventListener('click', async () => { await prepare(); enterRoom($('in-code').value.trim(), false); });
$('in-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-join').click(); });
$('btn-ready').addEventListener('click', () => { if (room) room.setReady(!room.mine()?.ready); });
$('btn-leave').addEventListener('click', toMenu);
$('btn-board').addEventListener('click', () => { $('board').classList.remove('hidden'); renderBoard($('b-list'), 20); });
$('btn-board-close').addEventListener('click', () => $('board').classList.add('hidden'));

resize();
requestAnimationFrame(frame);

// För automatiska tester
window.__game = {
  get state() { return state; }, get race() { return race; }, ski, course, rivals, get shooting() { return shooting; },
  get room() { return room; }, get db() { return db; }, get ghosts() { return ghosts; }, me,
  ceremony, camera, renderer, useLocalDb: async () => { const m = await import('./net.js'); db = await m.connectLocal(); },
  step: (dt) => update(dt), start: newRace,
  debugCeremony: (list) => { state = 'ceremony'; ceremony.start(list); showUI(); },
};

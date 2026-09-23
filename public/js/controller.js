// Phone controller: join, pick a game-specific setup, then play:
//  - Kart Party: landscape steering pad (tilt like a wheel, or touch)
//  - Fruit Frenzy / Pizza Party: a Wii-style remote (gyro "air mouse" or touchpad, plus a GRAB button)
import { KART_TYPES, STAT_NAMES, ITEM_SVG, ordinal } from './shared.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem('kp-' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('kp-' + k, JSON.stringify(v)); } catch {} },
};

const params = new URLSearchParams(location.search);
const S = {
  cid: store.get('cid', null) || (() => { const c = Math.random().toString(36).slice(2) + Date.now().toString(36); store.set('cid', c); return c; })(),
  name: store.get('name', ''),
  code: (params.get('room') || store.get('code', '')).toUpperCase(),
  joined: false,
  screen: 'join',
  lobby: null,
  thumbs: [],
  type: 0,
  steerMode: store.get('steerMode', null),
  sens: store.get('sens', 30),
  invert: store.get('invert', false),
  autoGas: store.get('autoGas', true),
  item: null, rolling: false,
  aim: store.get('aim', null),
  aimSpeed: store.get('aimSpeed', 1),
  flipX: store.get('flipX2', false),
  flipY: store.get('flipY2', false),
  game: null,
};
const IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// ------------------------------------------------------------------ screens
function show(name) {
  S.screen = name;
  for (const s of ['join', 'lobby', 'race', 'remote', 'results']) $(s).classList.toggle('hidden', s !== name);
  checkRotate();
  if (name === 'race') { wakeLock(); fullscreen(); }
  if (name === 'remote') wakeLock();
}
function banner(text, ms = 2200) {
  const b = $('banner'); b.textContent = text; b.classList.remove('hidden');
  clearTimeout(banner.t); banner.t = setTimeout(() => b.classList.add('hidden'), ms);
}
function checkRotate() {
  const portrait = innerHeight > innerWidth;
  $('rotate').classList.toggle('hidden', !(S.screen === 'race' && portrait));
}
addEventListener('resize', checkRotate);
addEventListener('orientationchange', () => setTimeout(checkRotate, 200));

// ------------------------------------------------------------------ join
$('nameIn').value = S.name;
if (params.get('room')) {
  $('codeIn').value = S.code;
  $('codeLabel').classList.add('hidden');
  $('roomTag').classList.remove('hidden');
  $('roomTag').querySelector('b').textContent = S.code;
} else $('codeIn').value = S.code;

$('joinForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  S.name = $('nameIn').value.trim().slice(0, 12) || 'Racer';
  S.code = $('codeIn').value.trim().toUpperCase();
  store.set('name', S.name); store.set('code', S.code);
  $('joinErr').textContent = '';
  // Motion permission must be requested from a tap (iOS)
  if (S.steerMode !== 'touch' || S.aim === 'air') await enableTilt(true);
  connect();
});

// ------------------------------------------------------------------ networking
let ws = null, retry = 0;
function connect() {
  if (ws && ws.readyState <= 1) return;
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws.onopen = () => { retry = 0; ws.send(JSON.stringify({ t: 'join', code: S.code, name: S.name, cid: S.cid })); };
  ws.onmessage = (e) => onMessage(JSON.parse(e.data));
  ws.onclose = () => {
    if (!S.joined) return;
    banner('Reconnecting…');
    setTimeout(connect, Math.min(4000, 500 * ++retry));
  };
}
const send = (m) => { if (ws?.readyState === 1) ws.send(JSON.stringify(m)); };

function onMessage(m) {
  switch (m.t) {
    case 'error':
      $('joinErr').textContent = m.msg;
      S.joined = false; ws.close(); show('join');
      break;
    case 'joined':
      S.joined = true; wakeLock();
      if (S.screen === 'join') show('lobby');
      break;
    case 'thumbs': S.thumbs = m.thumbs || []; renderKart(false); break;
    case 'lobby': onLobby(m); break;
    case 'phase':
      if (m.controller === 'remote') { startRemote(m); break; }
      if (m.phase === 'countdown') {
        document.documentElement.style.setProperty('--pc', m.color);
        show('race');
        setOverlay('GET READY<small>' + m.track + '</small>');
        S.item = null; S.rolling = false; renderItem();
        recenter(true);
        $('rLap').textContent = `LAP 1/${m.laps}`; $('rPos').textContent = '–'; $('rOf').textContent = '';
      } else if (m.phase === 'race') { setOverlay('GO!'); setTimeout(() => setOverlay(null), 700); }
      break;
    case 'hud': onHud(m); break;
    case 'finish': if (S.screen === 'remote') break; setOverlay(`${ordinal(m.place)}!<small>${m.time}</small>`); buzz([60, 40, 60, 40, 200]); break;
    case 'buzz': buzz(m.p); break;
    case 'hostgone': banner('The big screen disconnected'); break;
  }
}

// ------------------------------------------------------------------ lobby
function onLobby(m) {
  S.lobby = m;
  const you = m.you;
  document.documentElement.style.setProperty('--pc', you.color);
  $('meName').textContent = you.name;
  $('meSlot').textContent = 'P' + (you.slot + 1);
  if (S.type !== you.type) { S.type = you.type; renderKart(0); } else renderKart(false);
  $('hostCard').classList.toggle('hidden', !m.leader);
  $('startBtn').classList.toggle('hidden', !m.leader);
  $('waitCard').classList.toggle('hidden', m.leader);
  $('roomPill').textContent = S.code;
  $('leaderName').textContent = m.leaderName || 'the host';
  // game banner + game-specific setup
  const g = m.game || { name: 'Kart Party', controller: 'kart' };
  S.game = g;
  const banner = $('gameBanner');
  banner.style.setProperty('--gc', g.color);
  $('gbIcon').textContent = g.icon || '';
  $('gbName').textContent = g.name;
  $('gbTag').textContent = g.tagline || '';
  banner.querySelectorAll('.gb-arrow').forEach((b) => b.classList.toggle('hidden', !m.leader));
  $('kartSection').classList.toggle('hidden', g.controller !== 'kart');
  $('remoteSection').classList.toggle('hidden', g.controller !== 'remote');
  $('setupName').textContent = g.name;
  $('hostSettings').innerHTML = (m.settings || []).map((d) => `<div class="setting"><span>${esc(d.label)}</span><button data-set="${d.key}" data-d="-1">‹</button><b>${esc(d.value)}</b><button data-set="${d.key}" data-d="1">›</button></div>`).join('');
  $('hostSettings').querySelectorAll('[data-set]').forEach((b) => (b.onclick = () => { send({ t: 'set', key: b.dataset.set, d: +b.dataset.d }); buzz(8); }));
  $('startBtn').textContent = m.startLabel || 'START';
  $('resHost').querySelector('[data-cmd="next"]').classList.toggle('hidden', !m.hasNext);
  $('playerChips').innerHTML = m.players.map((p) => `<span style="--c:${p.color}"><i></i>${esc(p.name)}</span>`).join('');

  if (m.screen === 'lobby' && S.screen !== 'lobby') { show('lobby'); setOverlay(null); }
  if (m.screen === 'results' && m.results) showResults(m);
}

function renderKart(dir) {
  const kt = KART_TYPES[S.type];
  const img = $('kImg');
  if (S.thumbs[S.type]) img.src = S.thumbs[S.type];
  if (dir !== false) { img.className = ''; void img.offsetWidth; img.className = dir < 0 ? 'swap-r' : 'swap-l'; }
  $('kName').textContent = kt.name;
  $('kBlurb').textContent = kt.blurb;
  $('kStats').innerHTML = kt.stats.map((v, i) => `<div class="stat">${STAT_NAMES[i]}<div class="bar"><i style="width:${v * 20}%"></i></div><b>${v}</b></div>`).join('');
  $('kDots').innerHTML = KART_TYPES.map((_, i) => `<i class="${i === S.type ? 'on' : ''}"></i>`).join('');
}
const pickKart = (d) => { S.type = (S.type + d + KART_TYPES.length) % KART_TYPES.length; renderKart(d); send({ t: 'kart', type: S.type }); buzz(10); };
// swipe the showcase to change kart
{
  let sx = null;
  const sc = $('showcase');
  sc.addEventListener('pointerdown', (e) => { if (e.target.closest('.arrow')) return; sx = e.clientX; });
  sc.addEventListener('pointerup', (e) => { if (sx == null) return; const dx = e.clientX - sx; sx = null; if (Math.abs(dx) > 40) pickKart(dx < 0 ? 1 : -1); });
  sc.addEventListener('pointercancel', () => (sx = null));
}
$('kPrev').onclick = () => pickKart(-1);
$('kNext').onclick = () => pickKart(1);
document.querySelectorAll('[data-set]').forEach((b) => (b.onclick = () => { send({ t: 'set', key: b.dataset.set, d: +b.dataset.d }); buzz(8); }));
$('startBtn').onclick = () => { send({ t: 'start' }); buzz(20); };
document.querySelectorAll('[data-cmd]').forEach((b) => (b.onclick = () => send({ t: b.dataset.cmd })));

// steering settings
function renderSteerSettings() {
  document.querySelectorAll('#steerSeg button').forEach((b) => b.classList.toggle('on', b.dataset.mode === S.steerMode));
  document.querySelectorAll('#sensSeg button').forEach((b) => b.classList.toggle('on', +b.dataset.s === S.sens));
  $('tiltBox').classList.toggle('hidden', S.steerMode !== 'tilt');
  $('invertTilt').checked = S.invert;
  $('autoGas').checked = S.autoGas;
  $('gasBtn').classList.toggle('hidden', S.autoGas);
  $('race').classList.toggle('tilt', S.steerMode === 'tilt');
  $('race').classList.toggle('manual', !S.autoGas);
}
document.querySelectorAll('#steerSeg button').forEach((b) => (b.onclick = async () => {
  if (b.dataset.mode === 'tilt' && !(await enableTilt(true))) return;
  S.steerMode = b.dataset.mode; store.set('steerMode', S.steerMode); renderSteerSettings();
}));
document.querySelectorAll('#sensSeg button').forEach((b) => (b.onclick = () => { S.sens = +b.dataset.s; store.set('sens', S.sens); renderSteerSettings(); }));
$('invertTilt').onchange = (e) => { S.invert = e.target.checked; store.set('invert', S.invert); };
$('autoGas').onchange = (e) => { S.autoGas = e.target.checked; store.set('autoGas', S.autoGas); renderSteerSettings(); };
$('recenter').onclick = () => { recenter(true); buzz(15); };

// ------------------------------------------------------------------ tilt (gyro)
// We read the gravity vector from the accelerometer and measure how far the phone is rotated
// in its own screen plane (like a steering wheel), relative to a calibrated "straight" pose.
const tilt = { ok: false, gx: 0, gy: 0, angle: 0, neutral: null, last: 0 };
async function enableTilt(fromTap) {
  if (!window.isSecureContext) {
    tiltNote('Tilt needs the secure (https) link from the big screen. Using touch steering.', true);
    if (!S.steerMode || S.steerMode === 'tilt') S.steerMode = 'touch';
    setAim('pad', 'Pointing needs the secure (https) link from the big screen — using the touchpad.');
    renderSteerSettings();
    return false;
  }
  try {
    if (fromTap && typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      const r = await DeviceMotionEvent.requestPermission();
      if (r !== 'granted') throw new Error('denied');
    }
    if (fromTap && typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      const r = await DeviceOrientationEvent.requestPermission();
      if (r !== 'granted') throw new Error('denied');
    }
  } catch {
    tiltNote('Motion access was blocked. Using touch steering.', true);
    S.steerMode = 'touch'; renderSteerSettings();
    setAim('pad', 'Motion access was blocked — using the touchpad instead.');
    return false;
  }
  if (!enableTilt.listening) {
    enableTilt.listening = true;
    addEventListener('devicemotion', onMotion);
    addEventListener('deviceorientation', onOrientation);
  }
  if (!S.steerMode) S.steerMode = 'tilt';
  renderSteerSettings();
  setTimeout(() => {
    if (!tilt.ok && S.steerMode === 'tilt') { tiltNote('No motion sensor found — switched to touch steering.', true); S.steerMode = 'touch'; renderSteerSettings(); }
    if (!ori.ok && S.aim === 'air') setAim('pad', 'No motion sensor found — using the touchpad instead.');
  }, 1500);
  return true;
}
function tiltNote(t, warn) { const n = $('tiltNote'); n.textContent = t; n.classList.toggle('warn', !!warn); }
function onMotion(e) {
  const g = e.accelerationIncludingGravity;
  if (!g || g.x == null) return;
  shakeCheck(e);
  tilt.ok = true;
  const k = 0.35; // low-pass to ignore bumps
  tilt.gx += (g.x - tilt.gx) * k;
  tilt.gy += (g.y - tilt.gy) * k;
  tilt.angle = Math.atan2(tilt.gx, tilt.gy);
  if (tilt.neutral == null) recenter(false);
}
function recenter(force) {
  if (!tilt.ok) return;
  if (force || tilt.neutral == null) {
    // snap "straight" to the nearest landscape/portrait pose so a slightly-tilted grip still reads as centre
    const a = tilt.angle;
    const q = Math.round(a / (Math.PI / 2)) * (Math.PI / 2);
    tilt.neutral = Math.abs(a - q) < 0.35 ? q : a;
  }
}
function tiltSteer() {
  if (!tilt.ok || tilt.neutral == null) return 0;
  let d = tilt.angle - tilt.neutral;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  let s = -d / ((S.sens * Math.PI) / 180);
  if (S.invert) s = -s;
  if (Math.abs(s) < 0.06) s = 0; // small dead-zone
  return Math.max(-1, Math.min(1, s));
}

// ------------------------------------------------------------------ touch pad
const input = { steer: 0, gas: 0, brake: 0, drift: 0 };
let touchSteer = 0, steerPointer = null, steerOrigin = 0;
const zone = $('steerZone');
zone.addEventListener('pointerdown', (e) => {
  if (S.steerMode === 'tilt') return;
  steerPointer = e.pointerId; steerOrigin = e.clientX;
  zone.setPointerCapture(e.pointerId);
  zone.classList.add('active');
  buzz(6);
});
zone.addEventListener('pointermove', (e) => {
  if (e.pointerId !== steerPointer) return;
  const range = Math.min(110, zone.clientWidth * 0.3);
  let dx = (e.clientX - steerOrigin) / range;
  if (Math.abs(dx) > 1) { steerOrigin += (dx - Math.sign(dx)) * range; dx = Math.sign(dx); } // origin follows the thumb
  touchSteer = dx;
});
const endSteer = (e) => { if (e.pointerId !== steerPointer) return; steerPointer = null; touchSteer = 0; zone.classList.remove('active'); };
zone.addEventListener('pointerup', endSteer);
zone.addEventListener('pointercancel', endSteer);

function hold(btn, key) {
  const on = (e) => { e.preventDefault(); try { btn.setPointerCapture(e.pointerId); } catch {} btn.classList.add('down'); input[key] = 1; buzz(8); tick(true); };
  const off = () => { btn.classList.remove('down'); input[key] = 0; tick(true); };
  btn.addEventListener('pointerdown', on);
  btn.addEventListener('pointerup', off);
  btn.addEventListener('pointercancel', off);
  btn.addEventListener('lostpointercapture', off);
}
hold($('driftBtn'), 'drift');
hold($('brakeBtn'), 'brake');
hold($('brakeBtnL'), 'brake');
hold($('gasBtn'), 'gas');
for (const b of [$('itemBtn'), $('itemBtnL')]) {
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.classList.add('down'); if (S.item) { send({ t: 'use' }); buzz(25); } });
  b.addEventListener('pointerup', () => b.classList.remove('down'));
  b.addEventListener('pointercancel', () => b.classList.remove('down'));
}
document.addEventListener('contextmenu', (e) => e.preventDefault());

// ------------------------------------------------------------------ input loop
let lastSent = '', lastTime = 0;
function tick(force) {
  const steer = S.steerMode === 'tilt' ? tiltSteer() : touchSteer;
  input.steer = Math.round(steer * 100) / 100;
  const gas = S.autoGas ? (input.brake ? 0 : 1) : input.gas;
  const msg = { t: 'in', s: input.steer, g: gas, b: input.brake, d: input.drift };
  const key = JSON.stringify(msg);
  const now = performance.now();
  if (S.screen === 'race' && (force === true || key !== lastSent || now - lastTime > 250)) { send(msg); lastSent = key; lastTime = now; }
  // visuals
  $('wheel').style.transform = `rotate(${input.steer * 100}deg)`;
  $('tiltWheel').style.transform = `rotate(${tiltSteer() * 100}deg)`;
  const range = Math.min(110, zone.clientWidth * 0.3);
  $('knob').style.transform = `translateX(${touchSteer * range}px)`;
  zone.querySelector('.chev.l').classList.toggle('lit', touchSteer < -0.15);
  zone.querySelector('.chev.r').classList.toggle('lit', touchSteer > 0.15);
}
setInterval(tick, 33);

// ------------------------------------------------------------------ race HUD
function onHud(m) {
  if (m.game) return remoteHud(m);
  $('rPos').textContent = ordinal(m.pos);
  $('rOf').textContent = '/' + m.total;
  $('rLap').textContent = `LAP ${m.lap}/${m.laps}`;
  $('rCoins').innerHTML = `<i class="coin"></i>${m.coins}`;
  const dm = $('driftBar').parentElement;
  dm.classList.toggle('on', m.drift >= 0);
  dm.dataset.l = Math.max(0, m.drift);
  $('driftBar').style.width = (Math.max(0, m.drift) + 1) * 25 + '%';
  const rolling = m.item === '?';
  const item = rolling ? null : m.item;
  if (item && item !== S.item) buzz([20, 30, 20]);
  S.item = item; S.rolling = rolling; S.count = m.count;
  renderItem();
  const d = $('driftBtn');
  d.classList.remove('l1', 'l2', 'l3');
  if (m.drift > 0) d.classList.add('l' + m.drift);
}
function renderItem() {
  for (const b of [$('itemBtn'), $('itemBtnL')]) {
    b.classList.toggle('has', !!S.item);
    b.classList.toggle('rolling', S.rolling);
    b.querySelector('.ic').innerHTML = (S.rolling ? ITEM_SVG.mystery : S.item ? ITEM_SVG[S.item] : '') + (S.item && S.count > 1 ? `<em>×${S.count}</em>` : '');
  }
}
function setOverlay(html) {
  const o = $('raceOverlay');
  if (!html) return o.classList.add('hidden');
  o.innerHTML = html; o.classList.remove('hidden');
}

// ------------------------------------------------------------------ results
function showResults(m) {
  show('results');
  const R = m.results, rows = R.rows || [];
  const mine = rows.find((x) => x.human && x.name === m.you.name && x.color === m.you.color);
  const head = mine?.place ? `${['🥇', '🥈', '🥉'][mine.place - 1] || ''}${ordinal(mine.place)}` : (R.title || 'DONE');
  $('resPlace').innerHTML = `${head}<small>${esc(mine?.value ?? '')}</small>`;
  $('resList').innerHTML = (R.summary ? `<li class="sum">${R.summary}</li>` : '') + rows.map((x) => `<li class="${x === mine ? 'me' : ''}" style="--c:${x.color}"><b>${x.place ? ordinal(x.place) : ''}</b><i></i><span>${esc(x.name)}</span><span>${esc(x.value ?? '')}</span></li>`).join('');
  $('resHost').classList.toggle('hidden', !m.leader);
  $('resWait').classList.toggle('hidden', m.leader);
}

// ------------------------------------------------------------------ remote (Wii-style pointer)
// We take the phone's absolute orientation, work out which way it's pointing in the room (the top edge when
// held like a TV remote, or the back when held upright like a camera), and map that direction onto the screen
// relative to a calibrated "centre". Turn right → cursor right, tilt up → cursor up, on iOS and Android alike.
const aim = { dx: 0, dy: 0, shakeT: 0, testX: 0.5, testY: 0.5 };
const ori = { ok: false, h0: null, p0: null, axis: 'top', x: 0.5, y: 0.5, sx: 0.5, sy: 0.5, lastSent: 0, lx: -1, ly: -1 };
const D2R = Math.PI / 180;
function pointing(e, axis) {
  const a = e.alpha * D2R, b = e.beta * D2R, g = e.gamma * D2R;
  // R = Rz(alpha) · Rx(beta) · Ry(gamma) (W3C device orientation), applied to the pointing axis
  let [x, y, z] = axis === 'top' ? [0, 1, 0] : [0, 0, -1];
  [x, z] = [x * Math.cos(g) + z * Math.sin(g), -x * Math.sin(g) + z * Math.cos(g)];
  [y, z] = [y * Math.cos(b) - z * Math.sin(b), y * Math.sin(b) + z * Math.cos(b)];
  [x, y] = [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
  return { heading: Math.atan2(x, y), pitch: Math.asin(Math.max(-1, Math.min(1, z))), level: Math.abs(z) };
}
function onOrientation(e) {
  if (e.alpha == null || e.beta == null) return;
  ori.ok = true;
  if (ori.h0 == null) {
    // calibrate: use whichever axis is closer to level right now, and call this direction "centre"
    const top = pointing(e, 'top'), back = pointing(e, 'back');
    ori.axis = top.level <= back.level ? 'top' : 'back';
    const v = ori.axis === 'top' ? top : back;
    ori.h0 = v.heading; ori.p0 = v.pitch;
  }
  const v = pointing(e, ori.axis);
  const rangeH = (48 / S.aimSpeed) * D2R, rangeV = (28 / S.aimSpeed) * D2R;
  let dh = v.heading - ori.h0; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
  let x = 0.5 + dh / rangeH * (S.flipX ? -1 : 1);
  let y = 0.5 - (v.pitch - ori.p0) / rangeV * (S.flipY ? -1 : 1);
  // pushing past an edge drags the centre along, so the cursor never gets "lost" off-screen
  if (x > 1) { ori.h0 += (x - 1) * rangeH * (S.flipX ? -1 : 1); x = 1; }
  if (x < 0) { ori.h0 += x * rangeH * (S.flipX ? -1 : 1); x = 0; }
  if (y > 1) { ori.p0 -= (y - 1) * rangeV * (S.flipY ? -1 : 1); y = 1; }
  if (y < 0) { ori.p0 -= y * rangeV * (S.flipY ? -1 : 1); y = 0; }
  ori.sx += (x - ori.sx) * 0.55; ori.sy += (y - ori.sy) * 0.55;
  if (S.aim !== 'air') return;
  if (S.screen === 'remote') {
    const now = performance.now();
    if (now - ori.lastSent > 15 && (Math.abs(ori.sx - ori.lx) > 0.001 || Math.abs(ori.sy - ori.ly) > 0.001)) {
      ori.lastSent = now; ori.lx = ori.sx; ori.ly = ori.sy;
      send({ t: 'pa', x: +ori.sx.toFixed(4), y: +ori.sy.toFixed(4) });
    }
  } else { aim.testX = ori.sx; aim.testY = ori.sy; }
}
function recalibrate() { ori.h0 = null; ori.x = ori.y = ori.sx = ori.sy = 0.5; }
function shakeCheck(e) {
  const a = e.acceleration;
  if (!a || a.x == null) return;
  const now = performance.now(), mag = Math.hypot(a.x, a.y, a.z);
  if (mag > 13 && now - aim.shakeT > 90) { aim.shakeT = now; if (S.screen === 'remote') send({ t: 'shake', v: Math.min(2, mag / 20) }); }
}
function setAim(mode, note) {
  S.aim = mode; store.set('aim', mode);
  if (note) { $('aimNote').textContent = note; $('aimNote').classList.add('warn'); }
  else { $('aimNote').textContent = mode === 'air' ? 'Point the top of your phone at the big screen like a TV remote and tap Center. Then aim around — the dot follows you:' : 'Slide a finger on your phone to move your cursor. Try it here:'; $('aimNote').classList.remove('warn'); }
  document.querySelectorAll('#aimSeg button').forEach((b) => b.classList.toggle('on', b.dataset.aim === mode));
  document.querySelectorAll('#aimSpeed button').forEach((b) => b.classList.toggle('on', +b.dataset.v === S.aimSpeed));
  $('remote').classList.toggle('pad', mode === 'pad');
}
document.querySelectorAll('#aimSeg button').forEach((b) => (b.onclick = async () => {
  if (b.dataset.aim === 'air' && !(await enableTilt(true))) return;
  setAim(b.dataset.aim);
  recalibrate();
}));
document.querySelectorAll('#aimSpeed button').forEach((b) => (b.onclick = () => { S.aimSpeed = +b.dataset.v; store.set('aimSpeed', S.aimSpeed); setAim(S.aim); }));
$('flipX').checked = S.flipX; $('flipY').checked = S.flipY;
$('flipX').onchange = (e) => { S.flipX = e.target.checked; store.set('flipX2', S.flipX); };
$('flipY').onchange = (e) => { S.flipY = e.target.checked; store.set('flipY2', S.flipY); };
$('aimCenter').onclick = () => { recalibrate(); aim.testX = aim.testY = 0.5; buzz(10); };
$('rmCenter').onclick = () => { recalibrate(); send({ t: 'center' }); buzz(10); };

// touchpad (on the lobby test screen and the in-game pad)
function touchpad(el, onMove) {
  let id = null, lx = 0, ly = 0;
  el.addEventListener('pointerdown', (e) => { if (S.aim !== 'pad' && el.id !== 'testScreen') return; id = e.pointerId; lx = e.clientX; ly = e.clientY; try { el.setPointerCapture(e.pointerId); } catch {} el.classList.add('touching'); move(e); });
  const move = (e) => { const r = el.getBoundingClientRect(); const d = $('rmTouchDot'); if (el.id === 'rmPad') { d.style.left = e.clientX - r.left + 'px'; d.style.top = e.clientY - r.top + 'px'; } };
  el.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    const r = el.getBoundingClientRect();
    onMove((e.clientX - lx) / r.width * 1.25 * S.aimSpeed, (e.clientY - ly) / r.height * 1.5 * S.aimSpeed);
    lx = e.clientX; ly = e.clientY; move(e);
  });
  const up = (e) => { if (e.pointerId !== id) return; id = null; el.classList.remove('touching'); };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
}
touchpad($('rmPad'), (dx, dy) => { aim.dx += dx; aim.dy += dy; flushAim(); });
touchpad($('testScreen'), (dx, dy) => { aim.testX += dx; aim.testY += dy; });

// GRAB button
{
  const A = $('rmA');
  const on = (e) => { e.preventDefault(); try { A.setPointerCapture(e.pointerId); } catch {} A.classList.add('down'); send({ t: 'btn', a: 1 }); buzz(12); };
  const off = () => { if (!A.classList.contains('down')) return; A.classList.remove('down'); send({ t: 'btn', a: 0 }); };
  A.addEventListener('pointerdown', on); A.addEventListener('pointerup', off); A.addEventListener('pointercancel', off); A.addEventListener('lostpointercapture', off);
}

// stream pointer deltas (≤ ~60/s) straight from the sensor/touch events; a timer mops up leftovers
let lastAimSend = 0;
function flushAim(force) {
  if (S.screen !== 'remote' || !(aim.dx || aim.dy)) return;
  const now = performance.now();
  if (!force && now - lastAimSend < 15) return;
  lastAimSend = now;
  send({ t: 'pt', dx: +aim.dx.toFixed(4), dy: +aim.dy.toFixed(4) });
  aim.dx = aim.dy = 0;
}
setInterval(() => {
  if (S.screen === 'remote') flushAim(true);
  else {
    aim.dx = aim.dy = 0;
    aim.testX = Math.max(0, Math.min(1, aim.testX)); aim.testY = Math.max(0, Math.min(1, aim.testY));
    const d = $('testDot'); d.style.left = aim.testX * 100 + '%'; d.style.top = aim.testY * 100 + '%';
  }
}, 16);

function startRemote(m) {
  document.documentElement.style.setProperty('--pc', m.color);
  const R = $('remote');
  R.dataset.game = m.game;
  $('rmTitle').textContent = m.remote?.title || '';
  $('rmHint').textContent = m.remote?.hint || 'Point at the TV';
  $('rmALabel').textContent = m.remote?.a || 'GRAB';
  $('rmStatus').innerHTML = '';
  setAim(S.aim);
  aim.dx = aim.dy = 0;
  recalibrate(); // whatever direction you're holding at the start is the centre of the screen
  show('remote');
  setOverlay(null);
  const o = $('rmOverlay'); o.innerHTML = m.game === 'fruit' ? 'READY?' : 'OPENING…'; o.classList.remove('hidden');
  setTimeout(() => o.classList.add('hidden'), 3200);
}
function remoteHud(m) {
  const st = $('rmStatus');
  if (m.game === 'fruit') {
    st.innerHTML = `<span class="big">${ordinal(m.rank)}</span><span>⭐ ${m.score}</span><span>⏱ ${m.time}s</span>`;
    const was = $('remote').classList.contains('stun');
    $('remote').classList.toggle('stun', !!m.stun);
    if (m.stun && !was) buzz([200, 80, 200]);
  } else if (m.game === 'pizza') {
    st.innerHTML = `<span class="big">$${m.money}</span><span>${'★'.repeat(m.stars)}${'☆'.repeat(3 - m.stars)} next $${m.goal}</span><span>${'❤'.repeat(Math.max(0, m.hearts))}</span><span>⏱ ${Math.floor(m.time / 60)}:${String(m.time % 60).padStart(2, '0')}</span>${m.held ? `<span>✋ ${esc(m.held)}</span>` : ''}`;
  }
}

// ------------------------------------------------------------------ niceties
function buzz(p) { try { navigator.vibrate?.(p); } catch {} }
let lock = null;
async function wakeLock() { try { if (!lock && navigator.wakeLock) { lock = await navigator.wakeLock.request('screen'); lock.onrelease = () => (lock = null); } } catch {} }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { wakeLock(); if (S.joined) connect(); } });
function fullscreen() { const d = document.documentElement; if (!document.fullscreenElement && d.requestFullscreen) d.requestFullscreen({ navigationUI: 'hide' }).then(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {}); }
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

if (!S.steerMode) S.steerMode = window.isSecureContext ? 'tilt' : 'touch';
if (!S.aim) S.aim = window.isSecureContext ? 'air' : 'pad';
setAim(S.aim);
renderSteerSettings();
renderKart(false);
$('roomPill').textContent = S.code;
// Returning players with a remembered room jump straight back in
if (params.get('room') && S.name && store.get('lastRoom', '') === S.code) {
  if (S.steerMode === 'tilt' || S.aim === 'air') enableTilt(false); // iOS may need a tap to re-grant motion access
  connect();
}
store.set('lastRoom', S.code);

// Party hub (big screen): lobby with a game picker, phone networking, local keyboard/mouse/gamepad players,
// and the run loop for whichever game is active.
import * as THREE from 'three';
import { loadAssets } from './assets.js';
import { KART_TYPES, COLORS, GAMES, ordinal } from './shared.js';
import { escapeHtml } from './hud.js';
import { initAudio, sfx, stopMusic, toggleMusic } from './audio.js';
import kart from './games/kart.js';
import fruit from './games/fruit.js';
import pizza from './games/pizza.js';

const MODULES = { kart, fruit, pizza };
const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------------ renderer
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.localClippingEnabled = true;

// ------------------------------------------------------------------ state
const state = {
  screen: 'loading',
  gameId: 'kart',
  settings: {},       // { [gameId]: { [key]: optionIndex } }
  players: [],        // { id, source, pid?, name, slot, color, connected, input, ptr, kartType }
  active: null,       // running game or lobby demo
  results: null,
  room: null,
};
for (const [id, m] of Object.entries(MODULES)) state.settings[id] = Object.fromEntries(m.settings.map((s) => [s.key, s.def]));
try {
  const saved = JSON.parse(localStorage.getItem('pp-settings') || '{}');
  if (saved.gameId && MODULES[saved.gameId]) state.gameId = saved.gameId;
  for (const id in saved.settings || {}) if (state.settings[id]) Object.assign(state.settings[id], saved.settings[id]);
} catch {}
const save = () => { try { localStorage.setItem('pp-settings', JSON.stringify({ gameId: state.gameId, settings: state.settings })); } catch {} };
const mod = () => MODULES[state.gameId];
const gameInfo = () => GAMES.find((g) => g.id === state.gameId);
// setting indices -> values
const settingValues = (id = state.gameId) => Object.fromEntries(MODULES[id].settings.map((s) => [s.key, s.options[Math.min(s.options.length - 1, state.settings[id][s.key] ?? s.def)]]));

const newInput = () => ({ steer: 0, gas: 0, brake: 0, drift: false, useCount: 0 });
const newPointer = () => ({ x: 0.5, y: 0.5, a: false, b: false, aPresses: 0, shake: 0, seen: 0 });
const byId = (id) => state.players.find((p) => p.id === id);
const leader = () => state.players.filter((p) => p.connected).sort((a, b) => a.slot - b.slot)[0];

function freeSlot() {
  for (let s = 0; s < 4; s++) if (!state.players.some((p) => p.slot === s)) return s;
  return -1;
}
function addPlayer(p) {
  const slot = freeSlot();
  if (slot < 0) { toast('The party is full (4 players)'); return null; }
  const pl = { input: newInput(), ptr: newPointer(), connected: true, kartType: slot % KART_TYPES.length, ...p, slot, color: COLORS[slot].hex };
  state.players.push(pl);
  sfx.join();
  toast(`<i style="--pc:${pl.color}"></i>${escapeHtml(pl.name)} joined!`);
  renderLobby();
  return pl;
}
function removePlayer(id) {
  state.players = state.players.filter((p) => p.id !== id);
  renderLobby();
  syncPhones();
}

// ------------------------------------------------------------------ networking
let ws = null;
let joinBase = location.origin;
async function connect() {
  try {
    const info = await fetch('/api/info').then((r) => r.json());
    const isLocal = ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
    const host = isLocal && info.ips[0] ? info.ips[0] : location.hostname;
    if (location.protocol === 'https:') joinBase = location.origin;
    else if (info.httpsPort) joinBase = `https://${host}:${info.httpsPort}`;
    else joinBase = `${location.protocol}//${host}${location.port ? ':' + location.port : ''}`;
    if (!info.httpsPort || location.protocol === 'https:') $('certHint').textContent = 'Same Wi-Fi as this screen. Your phone becomes the controller.';
  } catch {}
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen = () => ws.send(JSON.stringify({ t: 'host', code: state.room }));
  ws.onmessage = (e) => onMessage(JSON.parse(e.data));
  ws.onclose = () => { setTimeout(connect, 1500); };
}
const sendTo = (pid, msg) => { if (ws?.readyState === 1) ws.send(JSON.stringify({ ...msg, to: pid })); };
const sendPlayer = (p, msg) => {
  if (msg?.t === 'phase' && p) p.lastPhase = msg; // replayed if the phone reconnects mid-game
  if (p?.source === 'phone' && p.connected) sendTo(p.pid, msg);
};

function onMessage(m) {
  if (m.t === 'room') {
    state.room = m.code;
    const url = `${joinBase}/play?room=${m.code}`;
    $('roomCode').textContent = m.code;
    $('joinUrl').textContent = url.replace(/^https?:\/\//, '');
    $('qr').src = '/api/qr?data=' + encodeURIComponent(url);
    return;
  }
  const id = 'phone:' + m.pid;
  let p = byId(id);
  switch (m.t) {
    case 'join':
      if (p) { p.connected = true; p.name = m.name; toast(`${escapeHtml(p.name)} reconnected`); }
      else p = addPlayer({ id, source: 'phone', pid: m.pid, name: m.name });
      if (p) {
        sendTo(m.pid, { t: 'thumbs', thumbs: kart.thumbs() });
        syncPhones();
        if (state.screen === 'game' && p.lastPhase) sendTo(m.pid, p.lastPhase);
      }
      else sendTo(m.pid, { t: 'error', msg: 'The party is full (4 players max).' });
      renderLobby();
      break;
    case 'leave':
      if (!p) return;
      if (state.screen === 'lobby') { toast(`${escapeHtml(p.name)} left`); removePlayer(id); }
      else { p.connected = false; p.input = newInput(); p.ptr.a = false; renderLobby(); }
      break;
    // kart controls
    case 'in':
      if (!p) return;
      p.input.steer = Math.max(-1, Math.min(1, +m.s || 0));
      p.input.gas = m.g ? 1 : 0;
      p.input.brake = m.b ? 1 : 0;
      p.input.drift = !!m.d;
      break;
    case 'use': if (p) p.input.useCount++; break;
    // remote (pointer) controls
    case 'pt':
      if (!p) return;
      p.ptr.x = Math.max(0, Math.min(1, p.ptr.x + (+m.dx || 0)));
      p.ptr.y = Math.max(0, Math.min(1, p.ptr.y + (+m.dy || 0)));
      p.ptr.seen = performance.now();
      break;
    case 'pa': // absolute pointer from the phone's orientation
      if (!p) return;
      p.ptr.x = Math.max(0, Math.min(1, +m.x || 0));
      p.ptr.y = Math.max(0, Math.min(1, +m.y || 0));
      p.ptr.seen = performance.now();
      break;
    case 'btn':
      if (!p) return;
      if (m.a != null) { if (m.a && !p.ptr.a) p.ptr.aPresses++; p.ptr.a = !!m.a; }
      if (m.b != null) p.ptr.b = !!m.b;
      break;
    case 'shake': if (p) p.ptr.shake = Math.min(3, p.ptr.shake + (+m.v || 1)); break;
    case 'center': if (p) { p.ptr.x = 0.5; p.ptr.y = 0.5; } break;
    // lobby
    case 'kart':
      if (!p) return;
      p.kartType = ((m.type % KART_TYPES.length) + KART_TYPES.length) % KART_TYPES.length;
      sfx.click(); renderLobby(); syncPhones();
      break;
    case 'set': if (p && p === leader()) changeSetting(m.key, m.d); break;
    case 'start': if (p && p === leader() && state.screen === 'lobby') startGame(); break;
    case 'again': if (p && p === leader() && state.screen === 'results') startGame(); break;
    case 'next': if (p && p === leader() && state.screen === 'results') nextRound(); break;
    case 'menu': if (p && p === leader()) toLobby(); break;
  }
}

function lobbyPayload(p) {
  const M = mod(), s = state.settings[state.gameId];
  return {
    t: 'lobby', screen: state.screen,
    you: { name: p.name, color: p.color, type: p.kartType, slot: p.slot },
    leader: p === leader(),
    leaderName: leader()?.name,
    players: state.players.filter((x) => x.connected).map((x) => ({ name: x.name, color: x.color })),
    game: gameInfo(),
    games: GAMES.map((g) => g.name),
    settings: M.settings.map((d) => ({ key: d.key, label: d.label, value: String(d.options[s[d.key]]) })),
    startLabel: M.startLabel || 'START',
    hasNext: !!M.nextSetting,
    results: state.screen === 'results' ? state.results : null,
  };
}
function syncPhones() {
  for (const p of state.players) sendPlayer(p, lobbyPayload(p));
}

// ------------------------------------------------------------------ local input: keyboard, mouse, gamepads
const keys = new Set();
const KB = {
  kb1: { left: 'KeyA', right: 'KeyD', gas: 'KeyW', brake: 'KeyS', drift: 'Space', item: 'KeyE', alt: 'ShiftLeft', up: 'KeyW', down: 'KeyS', grab: 'Space' },
  kb2: { left: 'ArrowLeft', right: 'ArrowRight', gas: 'ArrowUp', brake: 'ArrowDown', drift: 'Slash', item: 'Period', alt: 'ShiftRight', up: 'ArrowUp', down: 'ArrowDown', grab: 'Slash' },
};
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  initAudio();
  keys.add(e.code);
  for (const [src, map] of Object.entries(KB)) {
    const p = byId(src);
    if (!p) continue;
    if (e.code === map.item || e.code === map.alt) p.input.useCount++;
    if (e.code === map.grab) p.ptr.aPresses++;
  }
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Slash', 'Tab'].includes(e.code)) e.preventDefault();

  if (state.screen === 'lobby') {
    if (e.code === 'Digit1') toggleLocal('kb1', 'Keys 1');
    if (e.code === 'Digit2') toggleLocal('kb2', 'Keys 2');
    if (e.code === 'Enter') startGame();
    if (e.code === 'KeyQ' || e.code === 'KeyE' || e.code === 'Tab') changeSetting('game', e.code === 'KeyQ' ? -1 : 1);
    const k1 = byId('kb1'), k2 = byId('kb2');
    if (k1 && (e.code === 'KeyA' || e.code === 'KeyD')) cycleChar(k1, e.code === 'KeyD' ? 1 : -1);
    if (k2 && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) cycleChar(k2, e.code === 'ArrowRight' ? 1 : -1);
  } else if (state.screen === 'results') {
    if (e.code === 'Enter') startGame();
    if (e.code === 'KeyN' && mod().nextSetting) nextRound();
    if (e.code === 'Escape') toLobby();
  } else if (state.screen === 'game') {
    if (e.code === 'Escape') toLobby();
  }
  if (e.code === 'KeyM') toggleMusicBtn();
  if (e.code === 'KeyF') toggleFullscreen();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

// the mouse drives keyboard player 1's pointer in pointer games
const mouse = { x: 0.5, y: 0.5, down: false, moved: false };
addEventListener('pointermove', (e) => { mouse.x = e.clientX / innerWidth; mouse.y = e.clientY / innerHeight; mouse.moved = true; });
canvas.addEventListener('pointerdown', (e) => { mouse.down = true; const p = byId('kb1'); if (p) p.ptr.aPresses++; initAudio(); });
addEventListener('pointerup', () => { mouse.down = false; });
$('hud').addEventListener('pointerdown', (e) => { if (state.screen === 'game') { mouse.down = true; const p = byId('kb1'); if (p) p.ptr.aPresses++; } });
addEventListener('contextmenu', (e) => { if (state.screen === 'game') e.preventDefault(); });

function toggleLocal(src, name) {
  if (byId(src)) removePlayer(src);
  else addPlayer({ id: src, source: src, name });
}
function cycleChar(p, d) {
  if (mod().cycle?.(p, d)) { sfx.click(); renderLobby(); syncPhones(); }
}

const padPrev = {};
function pollLocal(dt) {
  for (const [src, map] of Object.entries(KB)) {
    const p = byId(src);
    if (!p) continue;
    const i = p.input;
    const target = (keys.has(map.right) ? 1 : 0) - (keys.has(map.left) ? 1 : 0);
    i.steer += (target - i.steer) * 0.35;
    if (Math.abs(i.steer) < 0.02) i.steer = 0;
    i.gas = keys.has(map.gas) ? 1 : 0;
    i.brake = keys.has(map.brake) ? 1 : 0;
    i.drift = keys.has(map.drift);
    // pointer: mouse for kb1, keys for kb2 (and kb1 when the mouse hasn't moved)
    if (src === 'kb1' && mouse.moved) { p.ptr.x = mouse.x; p.ptr.y = mouse.y; p.ptr.a = mouse.down || keys.has(map.grab); }
    else {
      const sp = 0.9 * dt;
      p.ptr.x = Math.max(0, Math.min(1, p.ptr.x + ((keys.has(map.right) ? 1 : 0) - (keys.has(map.left) ? 1 : 0)) * sp));
      p.ptr.y = Math.max(0, Math.min(1, p.ptr.y + ((keys.has(map.down) ? 1 : 0) - (keys.has(map.up) ? 1 : 0)) * sp * 1.6));
      p.ptr.a = keys.has(map.grab);
    }
  }
  const pads = navigator.getGamepads ? [...navigator.getGamepads()] : [];
  pads.forEach((gp, n) => {
    if (!gp) return;
    const id = 'pad' + n;
    let p = byId(id);
    const btn = (b) => gp.buttons[b]?.pressed;
    const prev = (padPrev[id] ||= {});
    const edge = (b) => btn(b) && !prev[b];
    if (!p && edge(0) && state.screen === 'lobby') p = addPlayer({ id, source: 'pad', name: 'Pad ' + (n + 1) });
    if (p) {
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      p.input.steer = Math.abs(ax) < 0.12 ? (btn(15) ? 1 : btn(14) ? -1 : 0) : ax;
      p.input.gas = btn(7) || btn(0) ? 1 : 0;
      p.input.brake = btn(6) || (btn(1) && !btn(0)) ? 1 : 0;
      p.input.drift = btn(5) || btn(4);
      if (edge(2) || edge(3)) p.input.useCount++;
      const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v);
      p.ptr.x = Math.max(0, Math.min(1, p.ptr.x + dz(ax) * dt * 1.2));
      p.ptr.y = Math.max(0, Math.min(1, p.ptr.y + dz(ay) * dt * 1.6));
      if (edge(0)) p.ptr.aPresses++;
      p.ptr.a = btn(0); p.ptr.b = btn(1);
      if (state.screen === 'lobby') {
        if (edge(15)) cycleChar(p, 1);
        if (edge(14)) cycleChar(p, -1);
        if (edge(5)) changeSetting('game', 1);
        if (edge(4)) changeSetting('game', -1);
        if (edge(9)) startGame();
        if (edge(8)) removePlayer(id);
      } else if (state.screen === 'results') {
        if (edge(9)) startGame();
      }
    }
    gp.buttons.forEach((b, k) => (prev[k] = b.pressed));
  });
}

// ------------------------------------------------------------------ lobby UI
function renderGames() {
  $('games').innerHTML = GAMES.map((g) => `
    <button class="game-card ${g.id === state.gameId ? 'on' : ''}" data-game="${g.id}" style="--gc:${g.color}">
      <span class="gicon">${g.icon}</span>
      <span class="gtext"><b>${g.name}</b><small>${g.tagline}</small><em>${g.mode}</em></span>
    </button>`).join('');
  document.querySelectorAll('.game-card').forEach((b) => (b.onclick = () => { initAudio(); selectGame(b.dataset.game); }));
}

function renderLobby() {
  const M = mod();
  const slots = $('slots');
  const lead = leader();
  let html = '';
  for (let s = 0; s < 4; s++) {
    const p = state.players.find((x) => x.slot === s);
    if (!p) {
      html += `<div class="slot empty"><div class="num">P${s + 1}</div>Scan the code<br>to join</div>`;
      continue;
    }
    const dev = p.source === 'phone' ? '📱' : p.source === 'pad' ? '🎮' : p.source === 'kb1' ? '🖱️' : '⌨️';
    const body = M.slotHTML ? M.slotHTML(p) : `<div class="avatar"><span style="background:${p.color}"></span></div><div class="pname">${escapeHtml(p.name)}</div><div class="kname">${M.roleOf ? M.roleOf(p) : 'Ready!'}</div>`;
    html += `<div class="slot filled ${p.connected ? '' : 'offline'}" style="--pc:${p.color}">
      ${p === lead ? '<span class="lead">HOST</span>' : ''}<span class="dev">${dev}</span>${body}</div>`;
  }
  slots.innerHTML = html;
  $('playerCount').textContent = `${state.players.length}/4`;

  const s = state.settings[state.gameId];
  $('setupTitle').textContent = gameInfo().name;
  $('settingsList').innerHTML = M.settings.map((d) => `
    <div class="setting"><label>${d.label}</label>
      <div class="stepper"><button data-set="${d.key}" data-d="-1">‹</button><span>${d.options[s[d.key]]}</span><button data-set="${d.key}" data-d="1">›</button></div>
      ${d.hints ? `<small>${d.hints[s[d.key]]}</small>` : ''}
    </div>`).join('');
  document.querySelectorAll('#settingsList [data-set]').forEach((b) => (b.onclick = () => { initAudio(); changeSetting(b.dataset.set, +b.dataset.d); }));
  const humans = state.players.length;
  $('startBtn').innerHTML = humans ? `${M.startLabel || 'START'} <kbd>Enter</kbd>` : 'WAITING FOR PLAYERS';
  $('startBtn').disabled = !humans;
  $('startBtn').style.opacity = humans ? 1 : 0.5;
  $('soloBtn').textContent = state.gameId === 'kart' ? 'Solo vs bots on keyboard' : 'Play solo with the mouse';
  $('keyHint').innerHTML = state.gameId === 'kart'
    ? 'No phone? Press <kbd>1</kbd> for keyboard (WASD) · <kbd>2</kbd> for arrows · or press <kbd>A</kbd> on a gamepad'
    : 'No phone? Press <kbd>1</kbd> to play with the mouse · <kbd>2</kbd> for arrows + <kbd>/</kbd> · or <kbd>A</kbd> on a gamepad';
}

let demoTimer = null;
function selectGame(id) {
  if (id === state.gameId) return;
  state.gameId = id;
  save(); sfx.click();
  renderGames(); renderLobby(); syncPhones();
  if (state.screen === 'lobby') { clearTimeout(demoTimer); demoTimer = setTimeout(startDemo, 200); }
}
function changeSetting(key, d) {
  if (key === 'game') {
    const i = GAMES.findIndex((g) => g.id === state.gameId);
    return selectGame(GAMES[(i + d + GAMES.length) % GAMES.length].id);
  }
  const def = mod().settings.find((s) => s.key === key);
  if (!def) return;
  const s = state.settings[state.gameId], n = def.options.length;
  s[key] = def.wrap ? (s[key] + d + n) % n : Math.max(0, Math.min(n - 1, s[key] + d));
  save(); sfx.click();
  renderLobby(); syncPhones();
  if (def.rebuildsDemo !== false && def.key === (mod().demoSetting || mod().nextSetting) && state.screen === 'lobby') {
    clearTimeout(demoTimer); demoTimer = setTimeout(startDemo, 350);
  }
}
$('startBtn').onclick = () => { initAudio(); startGame(); };
$('soloBtn').onclick = () => {
  initAudio();
  if (!state.players.length) addPlayer({ id: 'kb1', source: 'kb1', name: 'You' });
  if (state.gameId === 'kart' && state.settings.kart.bots === 0) state.settings.kart.bots = 5;
  startGame();
};
$('againBtn').onclick = () => startGame();
$('nextBtn').onclick = () => nextRound();
$('menuBtn').onclick = () => toLobby();
$('musicBtn').onclick = () => { initAudio(); toggleMusicBtn(); };
$('fsBtn').onclick = () => toggleFullscreen();
function toggleMusicBtn() { const on = toggleMusic(); $('musicBtn').textContent = on ? '♫ Music' : '♫ Muted'; }
function toggleFullscreen() { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(() => {}); }
addEventListener('pointerdown', () => initAudio());

function toast(html) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = html;
  $('toasts').appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

// ------------------------------------------------------------------ screens / game flow
function show(name) {
  state.screen = name;
  for (const s of ['loading', 'lobby', 'results']) $(s).classList.toggle('hidden', s !== name);
  document.body.dataset.screen = name;
  document.body.dataset.game = state.gameId;
}
function disposeActive() {
  if (state.active) { state.active.dispose(); state.active = null; }
  $('hud').innerHTML = '';
  $('hud').className = '';
}

const ctx = {
  renderer,
  hudRoot: $('hud'),
  get W() { return innerWidth; },
  get H() { return innerHeight; },
  send: sendPlayer,
  buzz: (p, pattern) => sendPlayer(p, { t: 'buzz', p: pattern }),
  input: (id) => byId(id)?.input || newInput(),
  pointer: (id) => byId(id)?.ptr || newPointer(),
  end: (results) => showResults(results),
  toast,
};

function startDemo() {
  disposeActive();
  state.active = mod().demo(ctx, settingValues());
  state.active.resize?.(innerWidth, innerHeight);
}

function toLobby() {
  show('lobby');
  state.players = state.players.filter((p) => p.connected);
  renderGames();
  renderLobby();
  startDemo();
  syncPhones();
}

function startGame() {
  if (!state.players.length) { toast('Join with a phone, or press 1 for keyboard/mouse'); return; }
  initAudio();
  disposeActive();
  const humans = state.players.filter((p) => p.connected).sort((a, b) => a.slot - b.slot);
  for (const p of humans) { p.input = newInput(); p.ptr = { ...newPointer(), x: 0.25 + 0.5 * (p.slot / 3) }; p.lastPhase = null; }
  show('game');
  state.active = mod().start(ctx, humans, settingValues());
  state.active.resize?.(innerWidth, innerHeight);
  hudCache.clear();
}

function nextRound() {
  const key = mod().nextSetting;
  if (key) {
    const def = mod().settings.find((s) => s.key === key);
    const s = state.settings[state.gameId];
    s[key] = def.wrap ? (s[key] + 1) % def.options.length : Math.min(def.options.length - 1, s[key] + 1);
    save();
  }
  startGame();
}

function showResults(results) {
  state.results = results;
  $('resTitle').textContent = results.title || 'RESULTS';
  $('resSummary').innerHTML = results.summary || '';
  $('resultList').innerHTML = results.rows.map((r, i) => `
    <li class="${r.human ? 'human' : ''}" style="--pc:${r.color}; animation-delay:${i * 0.06}s">
      <span class="pl">${r.place ? ordinal(r.place) : ''}</span><span class="dot"></span>
      <span class="nm">${escapeHtml(r.name)}<small>${r.sub || ''}</small></span>
      <span class="tm">${r.extra || ''}</span><span class="tm val">${r.value ?? ''}</span>
    </li>`).join('');
  $('nextBtn').classList.toggle('hidden', !mod().nextSetting);
  $('nextBtn').innerHTML = `${mod().nextLabel || 'Next track'} <kbd>N</kbd>`;
  show('results');
  stopMusic();
  syncPhones();
}

// phone HUD sync (only when something changed)
const hudCache = new Map();
let hudClock = 0;
function syncPhoneHud(dt) {
  hudClock += dt;
  if (hudClock < 0.1) return;
  hudClock = 0;
  if (state.screen !== 'game' || !state.active?.phoneHud) return;
  for (const p of state.players) {
    if (p.source !== 'phone' || !p.connected) continue;
    const msg = state.active.phoneHud(p);
    if (!msg) continue;
    const key = JSON.stringify(msg);
    if (hudCache.get(p.id) !== key) { hudCache.set(p.id, key); sendTo(p.pid, msg); }
  }
}

// ------------------------------------------------------------------ main loop
let last = performance.now();
function step(dt) {
  pollLocal(dt);
  if (state.active) state.active.update(dt);
  syncPhoneHud(dt);
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  step(dt);
  state.active?.render(dt);
}

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight, false);
  state.active?.resize?.(innerWidth, innerHeight);
});

async function boot() {
  try { await Promise.all([document.fonts.load('40px "Lilita One"'), document.fonts.load('800 20px Nunito')]); } catch {}
  await loadAssets((f) => { $('loadbar').style.width = Math.round(f * 100) + '%'; });
  $('loadtext').textContent = 'Setting the table…';
  await new Promise((r) => setTimeout(r, 30));
  kart.thumbs();
  connect();
  toLobby();
  requestAnimationFrame(frame);
}
boot().catch((e) => { console.error(e); $('loadtext').textContent = 'Failed to load: ' + e.message; });

// debugging helpers
window.kp = {
  state, startGame, toLobby, selectGame, addPlayer, byId,
  // step the simulation without rAF (works in a hidden tab): kp.sim(seconds)
  sim(seconds, dt = 1 / 60) {
    for (let t = 0; t < seconds; t += dt) { step(dt); state.active?.updateCameras?.(dt); }
    state.active?.render(dt);
  },
  // dev: render and upload a frame (server must run with KP_DEV_SHOTS)
  async shot(name = 'shot') {
    state.active?.render(1 / 60);
    const data = renderer.domElement.toDataURL('image/jpeg', 0.85);
    return fetch('/api/devshot?name=' + name, { method: 'POST', body: data }).then((r) => r.text());
  },
};

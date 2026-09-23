// Pizza Party — co-op pizzeria. Point your phone at the TV like a Wii remote, hold GRAB to carry things,
// scrub sauce & cheese onto the dough, add toppings, bake (don't burn it!) and serve the right customer.
// The view is from behind the counter: prep station in front of you, customers across the service counter.
import * as THREE from 'three';
import { model, character, PEOPLE } from '../assets.js';
import { Particles } from '../particles.js';
import { sfx, startMusic } from '../audio.js';
import { escapeHtml } from '../hud.js';

// ------------------------------------------------------------------ data
const TOPPINGS = [
  { id: 'pepperoni', name: 'Pepperoni' },
  { id: 'mushroom', name: 'Mushroom' },
  { id: 'pepper', name: 'Pepper' },
  { id: 'onion', name: 'Onion' },
  { id: 'tomato', name: 'Tomato' },
];
const TOP_ICON = {
  pepperoni: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="#d63a2f" stroke="#7a1a12" stroke-width="2"/><circle cx="9" cy="10" r="1.6" fill="#f4a08a"/><circle cx="14" cy="14" r="1.4" fill="#f4a08a"/><circle cx="15" cy="8" r="1" fill="#f4a08a"/></svg>',
  mushroom: '<svg viewBox="0 0 24 24"><path d="M3 12a9 7 0 0 1 18 0z" fill="#c9a27a" stroke="#6b4a2a" stroke-width="2"/><rect x="9" y="12" width="6" height="8" rx="2" fill="#f1e2c8" stroke="#6b4a2a" stroke-width="2"/></svg>',
  pepper: '<svg viewBox="0 0 24 24"><path d="M12 4c5 0 8 4 7 9s-4 7-7 7-6-2-7-7 2-9 7-9z" fill="none" stroke="#2f8f3a" stroke-width="3"/><path d="M12 4V1" stroke="#6b4a2a" stroke-width="2"/></svg>',
  onion: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="#b56bd6" stroke-width="2.5"/><circle cx="12" cy="12" r="5.5" fill="none" stroke="#d6a0ec" stroke-width="2.5"/></svg>',
  tomato: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="#ff5a4a" stroke="#a8261a" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="#ffb0a0"/></svg>',
};
const PIZZA_ICON = '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="21" fill="#f0b86a" stroke="#8a5a2a" stroke-width="3"/><circle cx="24" cy="24" r="16" fill="#e8402f"/><path d="M11 20c3 3 8 1 10 5s7 2 9-1 6-1 7 2c-1 6-7 11-13 11S12 32 11 26z" fill="#ffd54a"/></svg>';
const DAYS = [
  { spawn: 20, patience: 90, max: 1, min: 0, cap: 2, tops: ['pepperoni', 'mushroom'], goal: [40, 70, 100] },
  { spawn: 15, patience: 70, max: 2, min: 0, cap: 3, tops: ['pepperoni', 'mushroom', 'pepper'], goal: [70, 120, 170] },
  { spawn: 11, patience: 58, max: 2, min: 1, cap: 3, tops: ['pepperoni', 'mushroom', 'pepper', 'onion'], goal: [90, 150, 210] },
  { spawn: 9, patience: 50, max: 3, min: 1, cap: 4, tops: ['pepperoni', 'mushroom', 'pepper', 'onion', 'tomato'], goal: [110, 180, 250] },
  { spawn: 7.5, patience: 44, max: 3, min: 2, cap: 4, tops: ['pepperoni', 'mushroom', 'pepper', 'onion', 'tomato'], goal: [130, 210, 290] },
];
const BAKE_DONE = 7, BAKE_WARN = 12, BAKE_BURNT = 16;
const TOP_Y = 1.25;          // counter top height (interaction plane)
const PIZZA_R = 0.95;
const FRONT_Z = 2.8;         // prep counter line
const SERVE_Z = -1.0;        // service counter line
const WALL_Z = -6.5;
const OVEN_FLOOR = 1.2;      // where pizzas sit inside the oven

// ------------------------------------------------------------------ textures
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
const noiseDots = (g, w, h, n, a) => { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * a})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); } };
const cache = {};
const once = (k, f) => cache[k] || (cache[k] = f());
const TEX = {
  floor: () => once('floor', () => canvasTex(256, 256, (g) => { for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = (x + y) % 2 ? '#efe4cf' : '#c4573e'; g.fillRect(x * 64, y * 64, 64, 64); } noiseDots(g, 256, 256, 3000, 0.06); g.strokeStyle = 'rgba(0,0,0,0.12)'; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 256); g.moveTo(0, i * 64); g.lineTo(256, i * 64); g.stroke(); } }, [16, 16])),
  marble: () => once('marble', () => canvasTex(512, 256, (g, w, h) => { g.fillStyle = '#f6f3ee'; g.fillRect(0, 0, w, h); for (let i = 0; i < 14; i++) { g.strokeStyle = `rgba(120,110,130,${0.08 + Math.random() * 0.12})`; g.lineWidth = 1 + Math.random() * 2; g.beginPath(); let x = Math.random() * w, y = 0; g.moveTo(x, y); while (y < h) { x += (Math.random() - 0.5) * 40; y += 20; g.lineTo(x, y); } g.stroke(); } noiseDots(g, w, h, 2000, 0.04); }, [3, 1])),
  wood: () => once('wood', () => canvasTex(256, 256, (g) => { for (let x = 0; x < 256; x += 32) { g.fillStyle = `hsl(30, 48%, ${40 + Math.random() * 8}%)`; g.fillRect(x, 0, 32, 256); g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x, 0, 2, 256); for (let i = 0; i < 6; i++) { g.strokeStyle = 'rgba(80,40,10,0.15)'; g.beginPath(); const y = Math.random() * 256; g.moveTo(x, y); g.bezierCurveTo(x + 10, y + 8, x + 20, y - 8, x + 32, y + 4); g.stroke(); } } noiseDots(g, 256, 256, 2500, 0.06); }, [2, 2])),
  peel: () => once('peel', () => canvasTex(256, 256, (g) => { g.fillStyle = '#c8894a'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(120,60,20,${0.1 + Math.random() * 0.15})`; g.lineWidth = 1 + Math.random() * 2; g.beginPath(); const y = Math.random() * 256; g.moveTo(0, y); g.bezierCurveTo(80, y + 10, 170, y - 10, 256, y + 5); g.stroke(); } noiseDots(g, 256, 256, 2000, 0.06); })),
  brick: () => once('brick', () => canvasTex(256, 256, (g) => { g.fillStyle = '#6a3a2a'; g.fillRect(0, 0, 256, 256); for (let y = 0; y < 8; y++) for (let x = -1; x < 5; x++) { g.fillStyle = `hsl(${10 + Math.random() * 10}, 55%, ${38 + Math.random() * 12}%)`; g.fillRect(x * 64 + (y % 2) * 32 + 3, y * 32 + 3, 58, 26); } noiseDots(g, 256, 256, 3000, 0.08); }, [3, 2])),
  wall: () => once('wall', () => canvasTex(512, 512, (g) => { g.fillStyle = '#f7e6c4'; g.fillRect(0, 0, 512, 512); noiseDots(g, 512, 512, 6000, 0.04); for (let y = 0; y < 330; y += 40) { g.fillStyle = 'rgba(200,120,80,0.08)'; g.fillRect(0, y, 512, 2); } g.fillStyle = '#2f6b4f'; g.fillRect(0, 330, 512, 182); g.fillStyle = '#e8d6b0'; g.fillRect(0, 322, 512, 12); for (let x = 0; x < 512; x += 64) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x, 334, 3, 178); } }, [4, 1])),
  counterFront: () => once('cf', () => canvasTex(512, 128, (g) => { g.fillStyle = '#c9202a'; g.fillRect(0, 0, 512, 128); for (let x = 0; x < 512; x += 64) { g.fillStyle = '#e8303a'; g.fillRect(x + 6, 16, 52, 96); g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x + 6, 16, 52, 5); g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(x + 32, 64, 5, 0, 7); g.fill(); } g.fillStyle = '#ffd23f'; g.fillRect(0, 0, 512, 7); }, [4, 1])),
  sign: () => once('sign', () => canvasTex(1024, 256, (g) => { g.fillStyle = '#1b1340'; g.beginPath(); g.roundRect(0, 0, 1024, 256, 40); g.fill(); g.font = '400 150px "Lilita One", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = '#ff4d8d'; g.shadowBlur = 30; g.fillStyle = '#ffd6ea'; g.fillText('PIZZA PARTY', 512, 138); g.shadowBlur = 0; g.strokeStyle = '#ff4d8d'; g.lineWidth = 3; g.strokeText('PIZZA PARTY', 512, 138); })),
  menu: () => once('menu', () => canvasTex(512, 384, (g) => { g.fillStyle = '#23302a'; g.fillRect(0, 0, 512, 384); g.strokeStyle = '#8a5a2a'; g.lineWidth = 18; g.strokeRect(9, 9, 494, 366); g.fillStyle = '#f4f1e6'; g.font = '400 54px "Lilita One", sans-serif'; g.textAlign = 'center'; g.fillText('MENU', 256, 78); g.font = '800 30px Nunito, sans-serif'; g.textAlign = 'left'; [['Margherita', '$10'], ['+ each topping', '$4'], ['Happy customer', 'TIP!']].forEach(([a, b], i) => { g.fillText(a, 50, 150 + i * 62); g.textAlign = 'right'; g.fillText(b, 462, 150 + i * 62); g.textAlign = 'left'; }); g.strokeStyle = 'rgba(255,255,255,0.3)'; g.lineWidth = 2; g.setLineDash([6, 8]); g.beginPath(); g.moveTo(50, 110); g.lineTo(462, 110); g.stroke(); })),
  fire: () => once('fire', () => canvasTex(128, 128, (g) => { const r = g.createRadialGradient(64, 90, 5, 64, 80, 70); r.addColorStop(0, 'rgba(255,255,200,1)'); r.addColorStop(0.3, 'rgba(255,190,60,0.95)'); r.addColorStop(0.6, 'rgba(255,90,20,0.7)'); r.addColorStop(1, 'rgba(255,40,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); })),
  block: () => once('block', () => canvasTex(512, 256, (g) => { for (let x = 0; x < 512; x += 24) { g.fillStyle = `hsl(${28 + Math.random() * 6}, ${45 + Math.random() * 10}%, ${50 + Math.random() * 10}%)`; g.fillRect(x, 0, 24, 256); g.fillStyle = 'rgba(80,40,10,0.25)'; g.fillRect(x, 0, 1.5, 256); for (let i = 0; i < 5; i++) { g.strokeStyle = 'rgba(90,45,15,0.12)'; g.beginPath(); const y = Math.random() * 256; g.moveTo(x, y); g.lineTo(x + 24, y + (Math.random() - 0.5) * 20); g.stroke(); } } noiseDots(g, 512, 256, 3000, 0.05); }, [4, 1])),
  flour: () => once('flour', () => canvasTex(256, 256, (g) => { for (let i = 0; i < 90; i++) { const r = g.createRadialGradient(0, 0, 0, 0, 0, 30); r.addColorStop(0, 'rgba(255,255,255,0.35)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.save(); g.translate(Math.random() * 256, Math.random() * 256); g.fillStyle = r; g.beginPath(); g.arc(0, 0, 30, 0, 7); g.fill(); g.restore(); } })),
  pepperoni: () => once('pep', () => canvasTex(64, 64, (g) => { g.fillStyle = '#b8261c'; g.beginPath(); g.arc(32, 32, 32, 0, 7); g.fill(); g.fillStyle = '#d63a2f'; g.beginPath(); g.arc(32, 32, 27, 0, 7); g.fill(); g.fillStyle = '#f2a28c'; for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(12 + Math.random() * 40, 12 + Math.random() * 40, 1.5 + Math.random() * 2.5, 0, 7); g.fill(); } })),
  label: () => once('label', () => canvasTex(256, 64, (g) => { g.fillStyle = '#fff6e6'; g.fillRect(0, 0, 256, 64); g.fillStyle = '#e8303a'; g.font = '400 38px "Lilita One", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; for (const x of [64, 192]) g.fillText('SAUCE', x, 34); })),
};

function labelTex(text) {
  return once('tag:' + text, () => canvasTex(256, 70, (g) => {
    g.fillStyle = '#26352e'; g.beginPath(); g.roundRect(0, 0, 256, 70, 12); g.fill();
    g.strokeStyle = '#c89a5a'; g.lineWidth = 6; g.beginPath(); g.roundRect(3, 3, 250, 64, 10); g.stroke();
    g.fillStyle = '#f4f1e6'; g.font = '400 38px "Lilita One", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 38);
  }));
}

// ------------------------------------------------------------------ props & topping pieces
const MAT = {};
const mat = (k, o) => MAT[k] || (MAT[k] = new THREE.MeshStandardMaterial(o));
function toppingPiece(id) {
  let m;
  if (id === 'pepperoni') {
    m = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.045, 20), [mat('pepSide', { color: 0x8a1a12, roughness: 0.5 }), mat('pepTop', { map: TEX.pepperoni(), roughness: 0.45 }), mat('pepSide', {})]);
  } else if (id === 'pepper') {
    m = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.035, 6, 16, 5.4), mat('pepper', { color: 0x3fae4a, roughness: 0.35 }));
    m.rotation.x = Math.PI / 2;
    const g = new THREE.Group(); g.add(m); return g;
  } else if (id === 'onion') {
    const g = new THREE.Group();
    for (const [r, c] of [[0.15, 0xc98ad8], [0.09, 0xe9c8f2]]) { const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.02, 5, 20), mat('onion' + c, { color: c, roughness: 0.4 })); t.rotation.x = Math.PI / 2; g.add(t); }
    return g;
  } else if (id === 'mushroom') {
    m = model('food:mushroom-half', { size: 0.34, fit: 'max' });
    m.rotation.z = Math.PI / 2;
    const g = new THREE.Group(); m.position.y = 0.05; g.add(m); return g;
  } else {
    m = model('food:tomato-slice', { size: 0.36, fit: 'max' });
  }
  const g = new THREE.Group(); g.add(m); return g;
}
function lathe(points, material, segs = 32) {
  const m = new THREE.Mesh(new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), segs), material);
  m.castShadow = m.receiveShadow = true;
  return m;
}
function sauceBottle() {
  const g = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: 0xd8261c, roughness: 0.25, metalness: 0.05 });
  const body = lathe([[0, 0], [0.3, 0], [0.33, 0.05], [0.33, 0.8], [0.28, 0.95], [0.14, 1.05], [0.12, 1.1], [0, 1.1]], red);
  const label = new THREE.Mesh(new THREE.CylinderGeometry(0.335, 0.335, 0.34, 32, 1, true), new THREE.MeshStandardMaterial({ map: TEX.label(), roughness: 0.6 }));
  label.position.y = 0.42;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.12, 16), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }));
  cap.position.y = 1.15;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 12), cap.material);
  tip.position.y = 1.32;
  g.add(body, label, cap, tip);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function cheeseBowl() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ map: TEX.wood(), roughness: 0.7 });
  g.add(lathe([[0, 0], [0.45, 0], [0.62, 0.12], [0.72, 0.36], [0.68, 0.38], [0.58, 0.16], [0, 0.1]], wood));
  const shred = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.035, 0.035), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }), 90);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
  for (let i = 0; i < 90; i++) {
    const a = Math.random() * 7, r = Math.sqrt(Math.random()) * 0.55;
    const h = 0.14 + (0.55 - r) * 0.5 + Math.random() * 0.08;
    q.setFromEuler(new THREE.Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3));
    shred.setMatrixAt(i, m4.compose(new THREE.Vector3(Math.cos(a) * r, h, Math.sin(a) * r), q, new THREE.Vector3(1, 1, 1)));
    shred.setColorAt(i, c.setHSL(0.13 + Math.random() * 0.03, 0.9, 0.55 + Math.random() * 0.15));
  }
  shred.castShadow = true;
  g.add(shred);
  return g;
}
function toppingBowl(id) {
  const g = new THREE.Group();
  const bowl = lathe([[0, 0], [0.3, 0], [0.45, 0.08], [0.52, 0.3], [0.48, 0.31], [0.4, 0.1], [0, 0.07]], mat('bowl', { color: 0xfaf6ee, roughness: 0.25 }));
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.025, 6, 32), mat('rim', { color: 0x2f6b4f }));
  rim.rotation.x = Math.PI / 2; rim.position.y = 0.3;
  g.add(bowl, rim);
  for (let i = 0; i < 12; i++) {
    const p = toppingPiece(id);
    const a = Math.random() * 7, r = Math.sqrt(Math.random()) * 0.3;
    p.position.set(Math.cos(a) * r, 0.1 + (0.3 - r) * 0.5 + Math.random() * 0.08, Math.sin(a) * r);
    p.rotation.set((Math.random() - 0.5) * 0.8, Math.random() * 7, (Math.random() - 0.5) * 0.8);
    g.add(p);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function doughTray() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ map: TEX.wood(), roughness: 0.8 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.1, 1.5), wood); base.position.y = 0.05;
  g.add(base);
  for (const [w, d, x, z] of [[1.7, 0.08, 0, 0.71], [1.7, 0.08, 0, -0.71], [0.08, 1.5, 0.81, 0], [0.08, 1.5, -0.81, 0]]) { const e = new THREE.Mesh(new THREE.BoxGeometry(w, 0.22, d), wood); e.position.set(x, 0.14, z); g.add(e); }
  const flour = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 1.35).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: TEX.flour(), transparent: true, depthWrite: false }));
  flour.position.y = 0.11; g.add(flour);
  const dough = mat('dough', { color: 0xf5e6c8, roughness: 0.95 });
  for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 12), dough); b.scale.set(1, 0.72, 1); b.position.set(-0.46 + (i % 3) * 0.46, 0.28, -0.3 + Math.floor(i / 3) * 0.6); b.rotation.y = Math.random() * 3; g.add(b); }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
function peel() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ map: TEX.peel(), roughness: 0.7 });
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.08, 1.08, 0.06, 40), wood);
  disc.position.y = 0.03;
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.06, 0.9), wood);
  handle.position.set(0, 0.03, 1.4);
  g.add(disc, handle);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// ------------------------------------------------------------------ the wood-fired oven
function stoneTex() {
  return once('stone', () => canvasTex(256, 256, (g) => {
    g.fillStyle = '#6e6258'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 70; i++) {
      const x = Math.random() * 256, y = Math.random() * 256, w = 26 + Math.random() * 30, h = 18 + Math.random() * 18;
      g.fillStyle = `hsl(${25 + Math.random() * 15}, ${12 + Math.random() * 12}%, ${58 + Math.random() * 18}%)`;
      g.beginPath(); g.roundRect(x - w / 2, y - h / 2, w, h, 7); g.fill();
    }
    noiseDots(g, 256, 256, 3000, 0.07);
  }, [2, 1]));
}
function mosaicTex() {
  return once('mosaic', () => canvasTex(512, 256, (g) => {
    const cols = ['#b5452a', '#c9602f', '#d8783a', '#8a3320', '#e8a24a', '#a8392a'];
    g.fillStyle = '#3a2418'; g.fillRect(0, 0, 512, 256);
    for (let y = 0; y < 256; y += 10) for (let x = (y / 10) % 2 * 5; x < 512; x += 10) {
      g.fillStyle = y % 60 < 10 ? '#f2c14e' : cols[Math.floor(Math.random() * cols.length)];
      g.fillRect(x + 1, y + 1, 8, 8);
    }
  }, [3, 2]));
}
function buildOven(K, ox, oz) {
  const g = new THREE.Group();
  g.position.set(ox, 0, oz);
  const shadowy = (m) => { m.castShadow = m.receiveShadow = true; return m; };
  const brick = new THREE.MeshStandardMaterial({ map: TEX.brick(), roughness: 0.9 });
  const stone = new THREE.MeshStandardMaterial({ map: stoneTex(), roughness: 0.85 });
  // base with a log store
  g.add(shadowy(new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.12, 3.0), brick))).children.at(-1).position.set(0, 0.56, -0.4);
  const store = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.7), new THREE.MeshBasicMaterial({ color: 0x1a0d08 }));
  store.position.set(0, 0.45, 1.11); g.add(store);
  const logMat = new THREE.MeshStandardMaterial({ color: 0x7a4a2a, roughness: 0.9 });
  const cut = new THREE.MeshStandardMaterial({ color: 0xd8a870, roughness: 0.9 });
  for (let r = 0; r < 2; r++) for (let i = 0; i < 6 - r; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.5, 10), [logMat, cut, cut]);
    log.rotation.x = Math.PI / 2; log.position.set(-1.05 + i * 0.4 + r * 0.2, 0.22 + r * 0.24, 1.0);
    g.add(shadowy(log));
  }
  // domed back with mosaic tiles
  // (a wedge is left open at the front so the dome never covers the arch)
  const dome = shadowy(new THREE.Mesh(new THREE.SphereGeometry(2.1, 40, 20, Math.PI / 2 + 0.75, Math.PI * 2 - 1.5, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ map: mosaicTex(), roughness: 0.45, metalness: 0.1 })));
  dome.scale.set(1.02, 1.05, 0.78); dome.position.set(0, 1.12, -0.55);
  g.add(dome);
  // stone facade with a real arched opening
  const W = 4.3, H = 2.8, archW = 2.8, archH = 1.45;
  const shape = new THREE.Shape();
  shape.moveTo(-W / 2, 0); shape.lineTo(W / 2, 0); shape.lineTo(W / 2, H * 0.7); shape.quadraticCurveTo(W / 2, H, 0, H); shape.quadraticCurveTo(-W / 2, H, -W / 2, H * 0.7); shape.lineTo(-W / 2, 0);
  const hole = new THREE.Path();
  hole.moveTo(-archW / 2, 0.05); hole.lineTo(-archW / 2, archH - archW / 2 * 0.6);
  hole.absellipse(0, archH - archW / 2 * 0.6, archW / 2, archW / 2 * 0.6, Math.PI, 0, true);
  hole.lineTo(archW / 2, 0.05); hole.lineTo(-archW / 2, 0.05);
  shape.holes.push(hole);
  const facade = shadowy(new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.45, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2, curveSegments: 24 }), stone));
  facade.geometry.computeBoundingBox();
  const uv = facade.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.3, uv.getY(i) * 0.3);
  facade.position.set(0, 1.12, 0.62);
  g.add(facade);
  // voussoir stones around the arch + keystone
  const vMat = new THREE.MeshStandardMaterial({ color: 0xe8dcc8, roughness: 0.7 });
  const cy = 1.12 + archH - archW / 2 * 0.6;
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI - (i / 10) * Math.PI;
    const v = shadowy(new THREE.Mesh(new THREE.BoxGeometry(i === 5 ? 0.42 : 0.3, 0.34, 0.56), i === 5 ? new THREE.MeshStandardMaterial({ color: 0xf2c14e, roughness: 0.5, metalness: 0.3 }) : vMat));
    v.position.set(Math.cos(a) * (archW / 2 + 0.16), cy + Math.sin(a) * (archW / 2 * 0.6 + 0.16), 1.12);
    v.rotation.z = a - Math.PI / 2;
    g.add(v);
  }
  // FORNO plaque
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.42), new THREE.MeshStandardMaterial({ map: canvasTex(256, 72, (c) => { c.fillStyle = '#2f6b4f'; c.beginPath(); c.roundRect(0, 0, 256, 72, 14); c.fill(); c.strokeStyle = '#f2c14e'; c.lineWidth = 5; c.beginPath(); c.roundRect(4, 4, 248, 64, 11); c.stroke(); c.fillStyle = '#fff6e0'; c.font = '400 46px "Lilita One", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('FORNO', 128, 40); }), roughness: 0.5 }));
  plaque.position.set(0, 3.52, 1.14);
  g.add(plaque);
  // interior: glowing tunnel, hot floor, logs and flames at the back
  const tunnel = new THREE.Mesh(new THREE.CylinderGeometry(archW / 2, archW / 2, 2.2, 24, 1, true, -Math.PI / 2, Math.PI), new THREE.MeshStandardMaterial({ color: 0x3a1a10, emissive: 0x6a2008, emissiveIntensity: 0.9, side: THREE.BackSide, roughness: 1 }));
  tunnel.rotation.x = -Math.PI / 2; tunnel.scale.set(1, 1, 1.04); tunnel.position.set(0, OVEN_FLOOR - 0.02, -0.4);
  g.add(tunnel);
  const back = new THREE.Mesh(new THREE.CircleGeometry(archW / 2, 24, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0x3a1a10, emissive: 0x8a2a08, emissiveIntensity: 1, roughness: 1 })); back.scale.y = 1.04; back.position.set(0, OVEN_FLOOR - 0.02, -1.45); g.add(back);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(archW, 2.2).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8a4a2a, emissive: 0x5a1a05, emissiveIntensity: 0.6, roughness: 1 }));
  floor.position.set(0, OVEN_FLOOR - 0.01, -0.4); g.add(floor);
  for (const [x, r] of [[-0.15, 0.4], [0.2, -0.5], [0, 0]]) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.1, 8), new THREE.MeshStandardMaterial({ color: 0x2a140a, emissive: 0xff4a10, emissiveIntensity: 0.35, roughness: 1 }));
    log.rotation.set(Math.PI / 2, 0, r); log.position.set(x, OVEN_FLOOR + 0.1, -1.15); g.add(log);
  }
  K.flames = [];
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.1), new THREE.MeshBasicMaterial({ map: TEX.fire(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    f.userData.s = 0.8 + Math.random() * 0.5;
    f.position.set(-0.6 + i * 0.4, OVEN_FLOOR + 0.45, -1.2 + (i % 2) * 0.1);
    g.add(f); K.flames.push(f);
  }
  K.ovenLight = new THREE.PointLight(0xff7a2a, 14, 7, 1.3);
  K.ovenLight.position.set(ox, OVEN_FLOOR + 0.8, oz - 0.6);
  K.scene.add(K.ovenLight);
  // copper flue on top
  const copper = new THREE.MeshStandardMaterial({ color: 0xc87a3a, metalness: 0.85, roughness: 0.3 });
  const flue = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 2.4, 20), copper)); flue.position.set(0.75, 4.1, -0.9); g.add(flue);
  const capF = shadowy(new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.45, 20), copper)); capF.position.set(0.75, 5.5, -0.9); g.add(capF);
  return g;
}

// ------------------------------------------------------------------ pizza entity
let pizzaIds = 0;
class Pizza {
  constructor(scene) {
    this.id = ++pizzaIds;
    this.sauce = 0; this.cheese = 0; this.toppings = new Set(); this.bake = 0;
    this.where = null;
    const g = (this.g = new THREE.Group());
    this.doughMat = new THREE.MeshStandardMaterial({ color: 0xf3dcb0, roughness: 0.85 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(PIZZA_R + 0.04, PIZZA_R + 0.08, 0.12, 40), this.doughMat);
    base.position.y = 0.06;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(PIZZA_R + 0.01, 0.13, 10, 40).rotateX(Math.PI / 2), this.doughMat);
    rim.position.y = 0.14;
    this.canvas = document.createElement('canvas'); this.canvas.width = this.canvas.height = 256;
    this.ctx2d = this.canvas.getContext('2d');
    this.ctx2d.fillStyle = '#f3dcb0'; this.ctx2d.fillRect(0, 0, 256, 256);
    this.tex = new THREE.CanvasTexture(this.canvas); this.tex.colorSpace = THREE.SRGBColorSpace;
    this.topMat = new THREE.MeshStandardMaterial({ map: this.tex, roughness: 0.6 });
    const top = new THREE.Mesh(new THREE.CircleGeometry(PIZZA_R, 40).rotateX(-Math.PI / 2), this.topMat);
    top.position.y = 0.125;
    this.tops = new THREE.Group(); this.tops.position.y = 0.14;
    g.add(base, rim, top, this.tops);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.grid = { sauce: new Uint8Array(144), cheese: new Uint8Array(144) };
    this.cells = 0;
    for (let i = 0; i < 144; i++) { const cx = (i % 12) + 0.5 - 6, cy = Math.floor(i / 12) + 0.5 - 6; if (cx * cx + cy * cy < 30) this.cells++; }
    scene.add(g);
  }
  paint(kind, lx, lz, radius = 0.3) {
    if (this.bake > 0) return false;
    if (Math.hypot(lx, lz) > PIZZA_R + 0.1) return false;
    const s = 128 / PIZZA_R, u = 128 + lx * s, v = 128 + lz * s, rr = radius * s;
    const g = this.ctx2d;
    g.save(); g.beginPath(); g.arc(128, 128, 118, 0, 7); g.clip();
    if (kind === 'sauce') {
      g.fillStyle = '#d42d1c'; g.beginPath(); g.arc(u, v, rr, 0, 7); g.fill();
      g.fillStyle = 'rgba(150,20,10,0.3)'; g.beginPath(); g.arc(u + rr * 0.25, v + rr * 0.2, rr * 0.45, 0, 7); g.fill();
      g.fillStyle = 'rgba(255,120,90,0.25)'; g.beginPath(); g.arc(u - rr * 0.3, v - rr * 0.3, rr * 0.25, 0, 7); g.fill();
    } else {
      for (let i = 0; i < 9; i++) {
        const a = Math.random() * 7, dd = Math.random() * rr;
        g.fillStyle = ['#ffd54a', '#fff0a0', '#ffe27a'][i % 3];
        g.beginPath(); g.ellipse(u + Math.cos(a) * dd, v + Math.sin(a) * dd, 6 + Math.random() * 8, 3 + Math.random() * 3, Math.random() * 3, 0, 7); g.fill();
      }
    }
    g.restore();
    this.tex.needsUpdate = true;
    const grid = this.grid[kind];
    const cr = radius / PIZZA_R * 6 + 0.35, gx = lx / PIZZA_R * 6, gy = lz / PIZZA_R * 6;
    for (let i = 0; i < 144; i++) {
      const cx = (i % 12) + 0.5 - 6, cy = Math.floor(i / 12) + 0.5 - 6;
      if (cx * cx + cy * cy >= 30) continue;
      if ((cx - gx) ** 2 + (cy - gy) ** 2 < cr * cr) grid[i] = 1;
    }
    this[kind] = Math.min(1, grid.reduce((a, b) => a + b, 0) / this.cells);
    return true;
  }
  addTopping(id, pieces = 7) {
    this.toppings.add(id);
    for (let i = 0; i < pieces; i++) {
      const m = toppingPiece(id);
      const a = (i / pieces) * Math.PI * 2 + Math.random() * 0.6, r = i === 0 ? 0 : 0.3 + Math.random() * 0.42;
      m.position.set(Math.cos(a) * r, 0.01 * this.toppings.size, Math.sin(a) * r);
      m.rotation.y = Math.random() * 7;
      this.tops.add(m);
    }
  }
  get state() { return this.bake >= BAKE_BURNT ? 'burnt' : this.bake >= BAKE_DONE ? 'baked' : this.bake > 0 ? 'baking' : 'raw'; }
  updateLook() {
    const b = this.bake;
    const raw = new THREE.Color(0xf3dcb0), gold = new THREE.Color(0xe39a50), burnt = new THREE.Color(0x3a2418);
    this.doughMat.color.copy(b < BAKE_DONE ? raw.clone().lerp(gold, b / BAKE_DONE) : b < BAKE_BURNT ? gold.clone().lerp(burnt, Math.max(0, (b - BAKE_WARN) / (BAKE_BURNT - BAKE_WARN))) : burnt);
    const t = new THREE.Color(1, 1, 1);
    if (b > 0) t.lerp(new THREE.Color(0xffe0b0), Math.min(1, b / BAKE_DONE));
    if (b > BAKE_WARN) t.lerp(new THREE.Color(0x3a2a20), Math.min(1, (b - BAKE_WARN) / (BAKE_BURNT - BAKE_WARN)));
    this.topMat.color.copy(t);
    this.tops.visible = true;
    if (b > BAKE_BURNT && !this.charred) { this.charred = true; this.tops.traverse((o) => { if (o.isMesh) o.material = mat('char', { color: 0x2a1a12, roughness: 1 }); }); }
  }
  dispose(scene) { scene.remove(this.g); this.tex.dispose(); }
}

// ------------------------------------------------------------------ the pizzeria
class Pizzeria {
  constructor(ctx, { day = 0, players = 1, demo = false } = {}) {
    this.ctx = ctx; this.demo = demo;
    this.D = DAYS[day]; this.dayIndex = day; this.nPlayers = players;
    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color(0x2a1a3a);
    this.camera = new THREE.PerspectiveCamera(46, ctx.W / ctx.H, 0.1, 200);
    this.camera.position.set(0, 7.2, 11.5);
    this.camera.lookAt(0, 1.9, -1.5);
    ctx.renderer.toneMappingExposure = 1.0;
    this.particles = new Particles(2500);
    this.particles.addTo(scene);
    this.time = 0;
    this.buildRoom();
    this.buildStations();
    this.pizzas = [];
    this.customers = [];
    this.timers = [];
    this.raycaster = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -TOP_Y);
  }

  buildRoom() {
    const S = this.scene;
    const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.8, ...o });
    const shadowy = (m) => { m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); return m; };
    S.add(new THREE.HemisphereLight(0xfff1dc, 0x5a3a2a, 1.25));
    const sun = new THREE.DirectionalLight(0xfff0dd, 2.0);
    sun.position.set(-6, 14, 12); sun.target.position.set(0, 0, -1);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 10, bottom: -10, near: 1, far: 50 });
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
    S.add(sun, sun.target);
    // floor & walls
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 30).rotateX(-Math.PI / 2), std({ map: TEX.floor() }));
    floor.receiveShadow = true; S.add(floor);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(40, 14), std({ map: TEX.wall() }));
    back.position.set(0, 7, WALL_Z); back.receiveShadow = true; S.add(back);
    for (const sx of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(24, 14), std({ map: TEX.wall() }));
      side.position.set(sx * 13, 7, 4); side.rotation.y = -sx * Math.PI / 2; S.add(side);
    }
    // street windows either side of the neon sign
    const view = canvasTex(256, 256, (g) => { const s = g.createLinearGradient(0, 0, 0, 256); s.addColorStop(0, '#6fb8ff'); s.addColorStop(0.65, '#d4ecff'); s.addColorStop(0.65, '#f0d8b0'); s.addColorStop(1, '#d8b88a'); g.fillStyle = s; g.fillRect(0, 0, 256, 256); g.fillStyle = '#fff'; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(60 + i * 70, 50 + i * 12, 18, 0, 7); g.arc(80 + i * 70, 44 + i * 12, 22, 0, 7); g.fill(); } g.fillStyle = '#e8a060'; g.fillRect(20, 120, 60, 50); g.fillStyle = '#9ad0e0'; g.fillRect(150, 110, 70, 60); });
    for (const x of [-7.5, 7.5]) {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(4.8, 3.6, 0.3), std({ color: 0x5a3a24 }));
      frame.position.set(x, 4.9, WALL_Z + 0.1); S.add(frame);
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 3.0), new THREE.MeshBasicMaterial({ map: view }));
      glass.position.set(x, 4.9, WALL_Z + 0.28); S.add(glass);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.14, 3.0, 0.1), std({ color: 0x5a3a24 })); bar.position.set(x, 4.9, WALL_Z + 0.35); S.add(bar);
      const awn = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.25, 0.8), std({ color: 0xe8303a })); awn.position.set(x, 6.85, WALL_Z + 0.4); S.add(awn);
    }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5), new THREE.MeshBasicMaterial({ map: TEX.sign(), transparent: true }));
    sign.position.set(0, 5.35, WALL_Z + 0.2); S.add(sign);
    this.signLight = new THREE.PointLight(0xff4d8d, 5, 10, 1.5); this.signLight.position.set(0, 5.3, WALL_Z + 1.3); S.add(this.signLight);
    const menu = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.1), std({ map: TEX.menu() }));
    menu.position.set(-3.9, 4.9, WALL_Z + 0.2); menu.scale.setScalar(0.72);
    const clock = new THREE.Group();
    clock.add(new THREE.Mesh(new THREE.CircleGeometry(0.75, 32), std({ color: 0xfff8ea })), (() => { const r = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.08, 8, 32), std({ color: 0x5a3a24 })); return r; })());
    this.hands2 = [0.5, 0.35].map((len, i) => { const h = new THREE.Mesh(new THREE.BoxGeometry(0.06, len, 0.02), std({ color: 0x1b1340 })); h.geometry.translate(0, len / 2, 0.02); clock.add(h); return h; });
    clock.position.set(3.9, 4.9, WALL_Z + 0.2); S.add(clock); S.add(menu);
    // back plants and a tall fridge by the kitchen
    const furn = (n, size, x, z, ry = 0) => { const m = model('furniture:' + n, { size, fit: 'height' }); m.position.set(x, 0, z); m.rotation.y = ry; S.add(shadowy(m)); return m; };
    furn('pottedPlant', 3.4, -11.3, WALL_Z + 1.2); furn('pottedPlant', 3.4, 11.3, WALL_Z + 1.2);
    furn('kitchenFridgeLarge', 4.2, -11.4, 2.2, Math.PI / 2);
    // hanging lamps over the service counter
    for (const x of [-5.3, -1.5, 2.3]) {
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 3, 6), std({ color: 0x222222 })); cord.position.set(x, 9.7, SERVE_Z - 0.6); S.add(cord);
      const shade = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.55, 20, 1, true), std({ color: 0x2f6b4f, side: THREE.DoubleSide })); shade.position.set(x, 8.1, SERVE_Z - 0.6); S.add(shade);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff1c0 })); bulb.position.set(x, 7.85, SERVE_Z - 0.6); S.add(bulb);
      const l = new THREE.PointLight(0xffd9a0, 4, 8, 1.6); l.position.set(x, 7.6, SERVE_Z - 0.6); S.add(l);
    }
    // prep counter (in front of you)
    const cf = std({ map: TEX.counterFront() });
    const body = new THREE.Mesh(new THREE.BoxGeometry(20, 1.12, 2.5), [cf, cf, std({ color: 0xc9202a }), std({ color: 0xc9202a }), cf, cf]);
    body.position.set(0, 0.56, FRONT_Z);
    const top = new THREE.Mesh(new THREE.BoxGeometry(20.3, 0.14, 2.8), std({ map: TEX.marble(), roughness: 0.3 }));
    top.position.set(0, 1.18, FRONT_Z);
    S.add(shadowy(body), shadowy(top));
    // service counter (customers stand behind it)
    const svc = new THREE.Mesh(new THREE.BoxGeometry(13.4, 1.12, 1.3), cf);
    svc.position.set(-2.3, 0.56, SERVE_Z);
    const svcTop = new THREE.Mesh(new THREE.BoxGeometry(13.7, 0.14, 1.6), std({ map: TEX.wood(), roughness: 0.55 }));
    svcTop.position.set(-2.3, 1.18, SERVE_Z);
    S.add(shadowy(svc), shadowy(svcTop));
    // bell, napkins and a register on the service counter
    const reg = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.6), std({ color: 0x2f6b4f, roughness: 0.4 }));
    reg.position.set(-8.3, 1.5, SERVE_Z); S.add(shadowy(reg));
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 8, 0, 7, 0, Math.PI / 2), std({ color: 0xffd23f, metalness: 0.8, roughness: 0.25 }));
    bell.position.set(3.7, 1.26, SERVE_Z); S.add(bell);
  }

  buildStations() {
    const S = this.scene;
    const st = (this.stations = []);
    const add = (o) => { st.push(o); return o; };
    const put = (g, x, z) => { g.position.set(x, TOP_Y, z); S.add(g); return g; };
    add({ id: 'trash', type: 'trash', x: -7.6, z: FRONT_Z, r: 0.75, label: 'Trash', g: put((() => { const m = model('furniture:trashcan', { size: 1.1, fit: 'height' }); m.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.lerp(new THREE.Color(0x2f6b4f), 0.6); } }); return m; })(), -7.6, FRONT_Z) });
    add({ id: 'dough', type: 'dough', x: -6.4, z: FRONT_Z, r: 0.95, label: 'Dough', g: put(doughTray(), -6.4, FRONT_Z) });
    this.boards = [-4.2, -1.9, 0.4].map((x, i) => add({ id: 'board' + i, type: 'board', i, x, z: FRONT_Z - 0.2, r: 1.15, pizza: null, label: 'Peel', g: put(peel(), x, FRONT_Z - 0.2) }));
    const sb = sauceBottle();
    add({ id: 'sauce', type: 'sauce', x: 2.3, z: FRONT_Z, r: 0.6, label: 'Sauce', g: put(sb, 2.3, FRONT_Z), home: new THREE.Vector3(2.3, TOP_Y, FRONT_Z) });
    const cb = cheeseBowl();
    add({ id: 'cheese', type: 'cheese', x: 3.6, z: FRONT_Z, r: 0.7, label: 'Cheese', g: put(cb, 3.6, FRONT_Z), home: new THREE.Vector3(3.6, TOP_Y, FRONT_Z) });
    const trayPos = [[4.95, FRONT_Z + 0.55], [6.1, FRONT_Z + 0.55], [7.25, FRONT_Z + 0.55], [5.5, FRONT_Z - 0.55], [6.65, FRONT_Z - 0.55]];
    this.trays = TOPPINGS.map((T, i) => add({ id: 'top-' + T.id, type: 'topping', topping: T.id, x: trayPos[i][0], z: trayPos[i][1], r: 0.55, label: T.name, g: put(toppingBowl(T.id), ...trayPos[i]) }));

    // wood-fired oven between the counters on the right
    const OV = (this.ovenPos = { x: 7.0, z: -1.7 });
    S.add(buildOven(this, OV.x, OV.z));
    this.ovenSlots = [OV.x - 0.68, OV.x + 0.68].map((x, i) => add({ id: 'oven' + i, type: 'oven', i, x, z: OV.z + 0.55, r: 0.8, pizza: null, label: 'Oven', y: OVEN_FLOOR }));
    // four service spots along the counter
    this.spots = [-7.0, -4.3, -1.6, 1.1].map((x, i) => add({ id: 'spot' + i, type: 'spot', i, x, z: SERVE_Z, r: 1.25, customer: null, pizza: null, label: 'Serve' }));
  }

  pointerToWorld(px, py) {
    this.raycaster.setFromCamera(new THREE.Vector2(px * 2 - 1, 1 - py * 2), this.camera);
    const hit = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.plane, hit) ? hit : null;
  }
  stationAt(x, z) {
    let best = null, bd = 1e9;
    for (const s of this.stations) {
      // the view is shallow, so be generous front-to-back
      const d = Math.hypot(x - s.x, (z - s.z) * 0.7);
      if (d < s.r && d < bd) { bd = d; best = s; }
    }
    return best;
  }
  toScreen(v) {
    const p = v.clone().project(this.camera);
    return { x: (p.x + 1) / 2 * this.ctx.W, y: (1 - p.y) / 2 * this.ctx.H, behind: p.z > 1 };
  }
  placePizza(pz, s) {
    pz.where = s;
    if (s.type === 'board' || s.type === 'oven' || s.type === 'spot') s.pizza = pz;
    const y = s.type === 'oven' ? OVEN_FLOOR : s.type === 'board' ? TOP_Y + 0.06 : TOP_Y;
    pz.g.position.set(s.x, y, s.type === 'spot' ? s.z + 0.1 : s.z);
    pz.g.rotation.set(0, 0, 0);
    pz.g.scale.setScalar(s.type === 'spot' ? 0.72 : s.type === 'oven' ? 0.6 : 1);
  }
  freePizza(pz) { if (pz.where?.pizza === pz) pz.where.pizza = null; pz.where = null; pz.g.scale.setScalar(1); }

  // ------------------------------------------------------------------ customers
  spawnCustomer() {
    const free = this.spots.filter((s) => !s.customer);
    if (!free.length) return;
    const spot = free[Math.floor(Math.random() * free.length)];
    const who = PEOPLE[Math.floor(Math.random() * PEOPLE.length)];
    const c = character('people:' + who, 3.5);
    c.root.position.set(-12.5, 0, -3.6);
    this.scene.add(c.root);
    const D = this.D;
    const n = D.min + Math.floor(Math.random() * (D.max - D.min + 1));
    const order = [...D.tops].sort(() => Math.random() - 0.5).slice(0, n);
    const patience = D.patience * (this.demo ? 3 : 1) * (1 + (this.nPlayers - 1) * 0.08);
    const cust = { c, spot, order, patience, max: patience, state: 'walking', path: [{ x: spot.x, z: -3.8 }, { x: spot.x, z: SERVE_Z - 1.5 }], id: Math.random() };
    spot.customer = cust;
    c.play('walk');
    this.customers.push(cust);
    this.onCustomer?.('arrive', cust);
    return cust;
  }
  leave(cust, happy) {
    cust.state = 'leaving';
    cust.spot.customer = null;
    cust.path = [{ x: cust.spot.x, z: -3.8 }, { x: 13, z: -3.8 }];
    cust.happy = happy;
    cust.c.play(happy ? 'emote-yes' : 'emote-no', 0.2, true);
    cust.waitT = 1.1;
  }
  stepCustomers(dt) {
    for (const cu of this.customers) {
      cu.c.mixer.update(dt);
      const r = cu.c.root;
      if (cu.waitT > 0) { cu.waitT -= dt; if (cu.waitT <= 0) cu.c.play('walk'); continue; }
      if (cu.path.length) {
        const tgt = cu.path[0];
        const dx = tgt.x - r.position.x, dz = tgt.z - r.position.z, d = Math.hypot(dx, dz);
        const sp = 4.2 * dt;
        r.rotation.y = Math.atan2(dx, dz);
        if (d < sp) { r.position.x = tgt.x; r.position.z = tgt.z; cu.path.shift(); }
        else { r.position.x += (dx / d) * sp; r.position.z += (dz / d) * sp; }
        if (!cu.path.length) {
          if (cu.state === 'walking') { cu.state = 'waiting'; cu.c.play('idle'); r.rotation.y = 0; }
          else if (cu.state === 'leaving') { cu.gone = true; this.scene.remove(r); }
        }
      } else if (cu.state === 'waiting') {
        cu.patience -= dt;
        r.rotation.y = Math.sin(this.time * 1.5 + cu.id * 10) * 0.15;
        if (cu.patience <= 0) { this.leave(cu, false); this.onCustomer?.('angry', cu); }
      }
    }
    this.customers = this.customers.filter((c) => !c.gone);
  }
  judge(pz, order) {
    const why = [];
    if (pz.state === 'raw' || pz.state === 'baking') why.push('not baked yet');
    if (pz.state === 'burnt') why.push('it’s burnt!');
    if (pz.sauce < 0.6) why.push('needs more sauce');
    if (pz.cheese < 0.5) why.push('needs more cheese');
    const want = new Set(order);
    for (const t of want) if (!pz.toppings.has(t)) why.push('missing ' + t);
    for (const t of pz.toppings) if (!want.has(t)) why.push('I didn’t order ' + t);
    return why;
  }

  later(t, fn) { this.timers.push({ at: this.time + t, fn }); }
  step(dt) {
    this.time += dt;
    for (const t of this.timers.filter((t) => t.at <= this.time)) t.fn();
    this.timers = this.timers.filter((t) => t.at > this.time);
    for (const s of this.ovenSlots) {
      const pz = s.pizza;
      if (!pz) continue;
      const before = pz.state;
      pz.bake += dt;
      pz.updateLook();
      if (before !== pz.state) this.onBake?.(pz, pz.state);
      if (pz.bake > BAKE_WARN && Math.random() < dt * (pz.bake > BAKE_BURNT ? 20 : 8)) {
        this.particles.emit(s.x + (Math.random() - 0.5) * 0.5, OVEN_FLOOR + 1.1, s.z + 0.8, (Math.random() - 0.5) * 0.6, 1.5 + Math.random(), 0.6, { life: 1.6, size: 0.9, size1: 2.6, color: pz.bake > BAKE_BURNT ? [0.15, 0.15, 0.15] : [0.55, 0.55, 0.58], alpha: 0.6, additive: false, drag: 0.8 });
      }
    }
    const fl = 0.85 + Math.sin(this.time * 17) * 0.08 + Math.sin(this.time * 7.3) * 0.07 + (Math.random() - 0.5) * 0.06;
    this.ovenLight.intensity = 14 * fl;
    this.flames.forEach((f, i) => { const t = this.time * (7 + i * 2.3) + i * 2; f.scale.set(f.userData.s * (1 + Math.sin(t) * 0.12), f.userData.s * (0.85 + Math.sin(t * 1.7) * 0.2 + fl * 0.2), 1); f.material.opacity = 0.75 + Math.sin(t * 2.1) * 0.2; });
    const O = this.ovenPos;
    if (Math.random() < dt * 22) this.particles.emit(O.x + (Math.random() - 0.5) * 1.4, OVEN_FLOOR + 0.3, O.z - 0.7, (Math.random() - 0.5) * 0.5, 0.8 + Math.random() * 1.2, 0.25, { life: 0.5 + Math.random() * 0.4, size: 0.18, size1: 0.03, color: [1, 0.55 + Math.random() * 0.3, 0.15], gravity: -0.5 });
    if (Math.random() < dt * 3) this.particles.emit(O.x + 0.75, 5.6, O.z - 0.9, (Math.random() - 0.5) * 0.3, 1.1, 0, { life: 3, size: 0.9, size1: 3, color: [0.82, 0.82, 0.85], alpha: 0.28, additive: false, drag: 0.4 });
    this.signLight.intensity = 5 + Math.sin(this.time * 3) * 0.6;
    this.hands2[0].rotation.z = -this.time * 0.6; this.hands2[1].rotation.z = -this.time * 0.05;
    this.stepCustomers(dt);
    this.particles.update(dt);
  }
  render() {
    const r = this.ctx.renderer;
    r.setScissorTest(false);
    r.setViewport(0, 0, this.ctx.W, this.ctx.H);
    r.shadowMap.needsUpdate = true;
    this.particles.setViewportHeight(this.ctx.H * r.getPixelRatio() / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)) / 0.9);
    r.render(this.scene, this.camera);
  }
  resize(w, h) {
    const aspect = w / h;
    this.camera.aspect = aspect;
    // keep the full counter in view on narrower screens
    this.camera.fov = aspect < 1.78 ? THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(23)) * 1.78 / aspect)) : 46;
    this.camera.updateProjectionMatrix();
  }
  dispose() { for (const p of this.pizzas) p.tex.dispose(); }
}

// ------------------------------------------------------------------ the chef hands (one per player, plus demo ghosts)
function makeHands(K, players, ctx, hud, opts = {}) {
  const hands = players.map((p) => ({
    p, held: null, heldObj: null, lastPt: null, downAt: 0, toggle: false, lastA: false, lastPresses: 0,
    served: 0, made: 0, toppings: 0, painted: 0,
    el: null, ring: null,
  }));
  const layer = document.createElement('div');
  layer.className = 'pz-hands';
  hud.appendChild(layer);
  for (const h of hands) {
    h.el = document.createElement('div');
    h.el.className = 'pz-hand';
    h.el.style.setProperty('--pc', h.p.color);
    h.el.innerHTML = `<svg viewBox="0 0 32 32"><path d="M9 17V7a2 2 0 1 1 4 0v8-10a2 2 0 1 1 4 0v10-8a2 2 0 1 1 4 0v9-5a2 2 0 1 1 4 0v9c0 6-4 10-9 10h-2c-4 0-6-2-8-5l-4-6a2 2 0 0 1 3-2z" fill="var(--pc)" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg><span>${escapeHtml(h.p.name)}</span><em></em>`;
    layer.appendChild(h.el);
    // hover ring in 3D
    h.ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.05, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: h.p.color, transparent: true, opacity: 0.8, depthWrite: false }));
    h.ring.visible = false;
    K.scene.add(h.ring);
  }

  const heldVisual = (kind) => {
    if (kind === 'dough') { const m = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 10), mat('dough', { color: 0xf5e6c8, roughness: 0.95 })); m.scale.y = 0.75; m.castShadow = true; return m; }
    if (kind.startsWith('topping:')) {
      const g = new THREE.Group();
      for (let i = 0; i < 5; i++) { const m = toppingPiece(kind.slice(8)); m.position.set((Math.random() - 0.5) * 0.35, i * 0.05, (Math.random() - 0.5) * 0.35); m.rotation.set(Math.random(), Math.random() * 7, Math.random()); g.add(m); }
      g.scale.setScalar(1.3);
      return g;
    }
    return null;
  };

  const pick = (h, s) => {
    if (!s) return;
    const busy = (thing) => hands.some((o) => o !== h && o.held === thing);
    if (s.type === 'dough') { h.held = 'dough'; h.heldObj = heldVisual('dough'); K.scene.add(h.heldObj); }
    else if (s.type === 'sauce' || s.type === 'cheese') { if (busy(s.type)) return; h.held = s.type; h.heldObj = s.g; }
    else if (s.type === 'topping') { h.held = 'topping:' + s.topping; h.heldObj = heldVisual(h.held); K.scene.add(h.heldObj); }
    else if ((s.type === 'board' || s.type === 'oven' || s.type === 'spot') && s.pizza) {
      const pz = s.pizza;
      if (s.type === 'spot' && s.customer && !pz.rejected) return;
      h.held = pz; h.heldObj = pz.g; h.from = s;
      K.freePizza(pz);
      if (s.type === 'oven' && !opts.demo) sfx.place();
    } else return;
    if (!opts.demo) sfx.pick();
    return true;
  };

  const drop = (h, s) => {
    const held = h.held;
    h.held = null;
    if (held === 'dough') {
      K.scene.remove(h.heldObj);
      if (s?.type === 'board' && !s.pizza) {
        const pz = new Pizza(K.scene);
        K.pizzas.push(pz);
        K.placePizza(pz, s);
        h.made++;
        if (!opts.demo) sfx.place();
      }
    } else if (held === 'sauce' || held === 'cheese') {
      const st = K.stations.find((x) => x.type === held);
      st.g.position.copy(st.home); st.g.rotation.set(0, 0, 0);
    } else if (typeof held === 'string' && held.startsWith('topping:')) {
      K.scene.remove(h.heldObj);
      const pz = s?.pizza;
      if (pz && s.type === 'board' && pz.bake === 0) {
        pz.addTopping(held.slice(8));
        h.toppings++;
        if (!opts.demo) sfx.place();
        for (let i = 0; i < 8; i++) K.particles.emit(s.x, TOP_Y + 0.4, s.z, (Math.random() - 0.5) * 3, 2, (Math.random() - 0.5) * 3, { life: 0.4, size: 0.3, size1: 0.05, color: [1, 0.9, 0.6], gravity: 8 });
      }
    } else if (held instanceof Pizza) {
      const pz = held;
      if (s?.type === 'trash') { pz.dispose(K.scene); K.pizzas = K.pizzas.filter((x) => x !== pz); if (!opts.demo) sfx.trash(); opts.onTrash?.(h, pz); }
      else if ((s?.type === 'board' || s?.type === 'oven') && !s.pizza) {
        K.placePizza(pz, s);
        if (s.type === 'oven' && !opts.demo) { sfx.sizzle(); }
        else if (!opts.demo) sfx.place();
      } else if (s?.type === 'spot' && !s.pizza) {
        K.placePizza(pz, s);
        opts.onServe?.(h, pz, s);
      } else {
        // snap back to where it came from (or any free board)
        const back = h.from && !h.from.pizza ? h.from : K.boards.find((b) => !b.pizza) || K.ovenSlots.find((o) => !o.pizza);
        if (back) K.placePizza(pz, back); else { pz.dispose(K.scene); K.pizzas = K.pizzas.filter((x) => x !== pz); }
      }
    }
    h.heldObj = null; h.from = null;
  };

  return {
    hands, pick, drop,
    update(dt, getPtr) {
      for (const h of hands) {
        const ptr = getPtr(h);
        const w = K.pointerToWorld(ptr.x, ptr.y);
        h.el.style.transform = `translate(${ptr.x * ctx.W}px, ${ptr.y * ctx.H}px)`;
        if (!w) continue;
        const s = K.stationAt(w.x, w.z);
        // press / release (hold to carry; a quick tap toggles "sticky" carrying)
        const pressed = ptr.aPresses !== h.lastPresses;
        h.lastPresses = ptr.aPresses;
        const down = ptr.a || (pressed && !ptr.a);
        if (pressed && !h.held) { if (pick(h, s)) { h.downAt = K.time; h.downPos = { x: ptr.x, y: ptr.y }; h.toggle = false; } }
        else if (pressed && h.held && h.toggle) { drop(h, s); h.toggle = false; }
        if (h.held && !ptr.a && !pressed && h.lastA) {
          const still = h.downPos && Math.hypot(ptr.x - h.downPos.x, ptr.y - h.downPos.y) < 0.025;
          if (K.time - h.downAt < 0.28 && still) h.toggle = true; else if (!h.toggle) drop(h, s);
        }
        h.lastA = ptr.a || pressed;
        // carried object follows
        if (h.heldObj) {
          const target = new THREE.Vector3(w.x, TOP_Y + (h.held instanceof Pizza ? 0.8 : h.held === 'sauce' ? 1.5 : 0.6), w.z);
          h.heldObj.position.lerp(target, 1 - Math.exp(-dt * 25));
          if (h.held === 'sauce') h.heldObj.rotation.set(Math.PI * 0.72, 0, Math.sin(K.time * 6) * 0.1);
          if (h.held === 'cheese') h.heldObj.rotation.set(0.9 + Math.sin(K.time * 20) * 0.1 * (ptr.shake > 0.2 ? 1 : 0), 0, 0);
        }
        // painting sauce / cheese onto a pizza on a board
        if ((h.held === 'sauce' || h.held === 'cheese') && s?.type === 'board' && s.pizza) {
          const pz = s.pizza, lx = w.x - s.x, lz = w.z - s.z;
          const last = h.lastPt;
          const moved = last ? Math.hypot(w.x - last.x, w.z - last.z) : 0;
          const shake = h.held === 'cheese' ? ptr.shake : 0;
          if (moved > 0.02 || shake > 0.15) {
            const steps = Math.max(1, Math.ceil(moved / 0.15));
            for (let k = 1; k <= steps; k++) {
              const fx = last ? last.x + (w.x - last.x) * (k / steps) - s.x : lx, fz = last ? last.z + (w.z - last.z) * (k / steps) - s.z : lz;
              if (pz.paint(h.held, fx, fz, h.held === 'sauce' ? 0.32 : 0.36)) h.painted++;
            }
            if (shake > 0.15) for (let k = 0; k < 3; k++) { const a = Math.random() * 7, r = Math.random() * 0.8; pz.paint('cheese', Math.cos(a) * r, Math.sin(a) * r, 0.3); }
            const col = h.held === 'sauce' ? [0.85, 0.15, 0.1] : [1, 0.85, 0.3];
            if (Math.random() < 0.7) K.particles.emit(w.x, TOP_Y + 0.5, w.z, (Math.random() - 0.5), -2, (Math.random() - 0.5), { life: 0.3, size: 0.18, size1: 0.1, color: col, additive: false, gravity: 10 });
            if (!opts.demo && Math.random() < dt * 8) (h.held === 'sauce' ? sfx.squirt : sfx.sprinkle)();
          }
          const cov = pz[h.held];
          h.el.querySelector('em').textContent = `${h.held === 'sauce' ? 'SAUCE' : 'CHEESE'} ${Math.round(Math.min(1, cov / (h.held === 'sauce' ? 0.6 : 0.5)) * 100)}%`;
        } else h.el.querySelector('em').textContent = h.held ? (h.held instanceof Pizza ? 'PIZZA' : typeof h.held === 'string' ? h.held.replace('topping:', '').toUpperCase() : '') : '';
        ptr.shake = Math.max(0, (ptr.shake || 0) - dt * 3);
        h.lastPt = { x: w.x, z: w.z };
        // hover ring
        const target = s && (h.held ? true : s.type !== 'spot' || s.pizza) ? s : null;
        h.ring.visible = !!target;
        if (target) { h.ring.position.set(target.x, (target.y ?? TOP_Y) + 0.03, target.z); h.ring.scale.setScalar(target.r * 0.95); }
        h.el.classList.toggle('holding', !!h.held);
      }
    },
    dispose() { layer.remove(); for (const h of hands) K.scene.remove(h.ring); },
  };
}

// ------------------------------------------------------------------ chef bot (lobby demo + automated testing)
// Works through the same hand/pointer interface a player uses: pick a customer, build their pizza, bake, serve.
function botPlanner(K, hand, ptr) {
  let plan = [], wait = 0;
  const go = (x, z) => ({ move: [x, z] });
  const at = (s) => go(s.x, s.z);
  const scrub = (b) => { const out = []; for (let i = 0; i < 30; i++) { const a = i * 0.95, r = 0.12 + (i % 8) * 0.11; out.push(go(b.x + Math.cos(a) * r, b.z + Math.sin(a) * r)); } return out; };
  const claimed = () => new Set(K.pizzas.map((p) => p.forCust).filter(Boolean));
  const makePlan = () => {
    const waiting = K.customers.filter((c) => c.state === 'waiting');
    // 1) rejected / orphan pizzas on the counter go in the bin
    const orphan = K.spots.find((s) => s.pizza && s.pizza.rejected);
    if (orphan) return [at(orphan), { press: true }, at(K.stations.find((x) => x.type === 'trash')), { release: true }];
    // 2) serve anything that's baked
    const done = K.ovenSlots.find((o) => o.pizza && o.pizza.state !== 'baking' && o.pizza.state !== 'raw');
    if (done) {
      const pz = done.pizza;
      const cust = waiting.find((c) => c === pz.forCust && !c.spot.pizza) || waiting.find((c) => !c.spot.pizza && !K.judge(pz, c.order).length);
      const dest = pz.state === 'burnt' || !cust ? K.stations.find((x) => x.type === 'trash') : cust.spot;
      return [at(done), { press: true }, at(dest), { release: true }];
    }
    // 3) finish pizzas on the peels
    for (const b of K.boards) {
      const pz = b.pizza;
      if (!pz || pz.bake > 0) continue;
      if (!pz.forCust || pz.forCust.state !== 'waiting') { const taken = claimed(); pz.forCust = waiting.find((c) => !taken.has(c)) || null; }
      if (!pz.forCust) continue;
      if (pz.sauce < 0.6) return [at(K.stations.find((x) => x.type === 'sauce')), { press: true }, ...scrub(b), { release: true }];
      if (pz.cheese < 0.5) return [at(K.stations.find((x) => x.type === 'cheese')), { press: true }, ...scrub(b), { release: true }];
      const need = pz.forCust.order.filter((t) => !pz.toppings.has(t));
      if (need.length) return [at(K.trays.find((t) => t.topping === need[0])), { press: true }, at(b), { release: true }];
      const oven = K.ovenSlots.find((o) => !o.pizza);
      if (oven) return [at(b), { press: true }, at(oven), { release: true }];
    }
    // 4) start a new pizza for an unclaimed customer
    const taken = claimed();
    const free = K.boards.find((b) => !b.pizza);
    if (free && waiting.some((c) => !taken.has(c))) return [at(K.stations.find((x) => x.type === 'dough')), { press: true }, at(free), { release: true }];
    return [{ wait: 0.5 }];
  };
  return (dt) => {
    if (wait > 0) { wait -= dt; return; }
    if (!plan.length) plan = makePlan();
    const st = plan[0];
    if (st.move) {
      const sp = K.toScreen(new THREE.Vector3(st.move[0], TOP_Y, st.move[1]));
      const tx = sp.x / K.ctx.W, ty = sp.y / K.ctx.H;
      const dx = tx - ptr.x, dy = ty - ptr.y, d = Math.hypot(dx, dy), v = 1.5 * dt;
      if (d < v) { ptr.x = tx; ptr.y = ty; plan.shift(); } else { ptr.x += (dx / d) * v; ptr.y += (dy / d) * v; }
    } else if (st.press) { ptr.a = true; ptr.aPresses++; plan.shift(); wait = 0.12; }
    else if (st.release) { ptr.a = false; plan.shift(); wait = 0.15; }
    else if (st.wait) { wait = st.wait; plan.shift(); }
  };
}

// ------------------------------------------------------------------ module
export default {
  id: 'pizza',
  settings: [
    { key: 'day', label: 'Day', options: [1, 2, 3, 4, 5], hints: ['Pepperoni & mushroom', 'Peppers join the menu', 'Onions! Busier lunch', 'Tomatoes & big orders', 'Dinner rush!'], def: 0 },
    { key: 'len', label: 'Shift', options: ['2 min', '3 min', '4 min'], def: 1 },
  ],
  nextSetting: 'day',
  _botPlanner: botPlanner, // used by automated tests
  nextLabel: 'Next day',
  startLabel: 'OPEN THE SHOP',
  roleOf: () => 'Chef 👨‍🍳',

  demo(ctx) {
    const K = new Pizzeria(ctx, { day: 1, demo: true });
    const ghosts = [{ id: 'g1', color: '#ff4d5e', name: 'Chef Bot' }, { id: 'g2', color: '#3d8bff', name: 'Sous Bot' }];
    const ptrs = ghosts.map(() => ({ x: 0.5, y: 0.5, a: false, aPresses: 0, shake: 0 }));
    const hud = document.createElement('div');
    ctx.hudRoot.appendChild(hud);
    hud.className = 'pz-demo';
    const H = makeHands(K, ghosts.map((g) => ({ ...g })), ctx, hud, {
      demo: true,
      onServe: (h, pz, s) => { const c = s.customer; if (c && !K.judge(pz, c.order).length) { K.leave(c, true); K.later(0.6, () => { s.pizza = null; pz.dispose(K.scene); K.pizzas = K.pizzas.filter((x) => x !== pz); }); } else { K.freePizza(pz); pz.dispose(K.scene); K.pizzas = K.pizzas.filter((x) => x !== pz); } },
    });
    const bots = H.hands.map((h, i) => botPlanner(K, h, ptrs[i]));
    let spawnT = 1;
    startMusic('pizza');
    return {
      update(dt) {
        K.step(dt);
        spawnT -= dt;
        if (spawnT <= 0) { K.spawnCustomer(); spawnT = 7; }
        bots.forEach((b) => b(dt));
        H.update(dt, (h) => ptrs[H.hands.indexOf(h)]);
      },
      render() { K.render(); },
      resize(w, h) { K.resize(w, h); },
      dispose() { H.dispose(); K.dispose(); },
    };
  },

  start(ctx, players, s) {
    const day = s.day - 1;
    const K = new Pizzeria(ctx, { day, players: players.length });
    const D = K.D;
    const scale = 1 + (players.length - 1) * 0.45;
    const goals = D.goal.map((g) => Math.round(g * scale / 5) * 5);
    const shift = parseInt(s.len, 10) * 60;
    const G = { money: 0, served: 0, angry: 0, wrong: 0, hearts: 5, wasted: 0, tips: 0 };
    let phase = 'countdown', clock = 3.5, remaining = shift, ended = false, spawnT = 1.5;
    const hud = ctx.hudRoot;
    hud.className = 'pizza-hud';
    hud.innerHTML = `
      <div class="pz-top">
        <div class="pz-day"><b>DAY ${s.day}</b><span class="pz-time">3:00</span></div>
        <div class="pz-money"><div class="pz-coin"></div><b>0</b><div class="pz-goal"><i></i>${goals.map((g, k) => `<span style="left:${(g / goals[2]) * 100}%" data-k="${k}">★</span>`).join('')}</div></div>
        <div class="pz-hearts">${'<i>❤</i>'.repeat(5)}</div>
      </div>
      <div class="pz-orders"></div><div class="pz-ovens"></div><div class="pz-pops"></div><div class="pz-center"></div>`;
    const $ = (q) => hud.querySelector(q);
    const moneyEl = $('.pz-money b'), goalBar = $('.pz-goal i'), timeEl = $('.pz-time'), heartsEl = $('.pz-hearts'), ordersEl = $('.pz-orders'), ovensEl = $('.pz-ovens'), popsEl = $('.pz-pops'), centerEl = $('.pz-center');
    const center = (html, ms = 1000) => { centerEl.innerHTML = `<div>${html}</div>`; clearTimeout(center.t); if (ms) center.t = setTimeout(() => (centerEl.innerHTML = ''), ms); };
    const pop = (v3, html, cls = '') => {
      const sp = K.toScreen(v3);
      const e = document.createElement('div'); e.className = 'pz-pop ' + cls; e.style.left = sp.x + 'px'; e.style.top = sp.y + 'px'; e.innerHTML = html;
      popsEl.appendChild(e); setTimeout(() => e.remove(), 1400);
    };
    const orderEls = new Map();
    const ovenEls = K.ovenSlots.map(() => { const e = document.createElement('div'); e.className = 'pz-oven'; ovensEl.appendChild(e); return e; });

    const loseHeart = () => {
      G.hearts--;
      heartsEl.innerHTML = Array.from({ length: 5 }, (_, i) => `<i class="${i < G.hearts ? '' : 'lost'}">❤</i>`).join('');
      if (G.hearts <= 0 && phase === 'play') { phase = 'over'; clock = 2; center('<b class="big bad">OUT OF HEARTS!</b>', 0); }
    };
    K.onCustomer = (ev, c) => {
      if (ev === 'arrive') sfx.bell();
      if (ev === 'angry') { G.angry++; sfx.angry(); pop(c.c.root.position.clone().add(new THREE.Vector3(0, 3.2, 0)), '<b>😡</b>', 'bad'); loseHeart(); for (const h of H.hands) ctx.buzz(h.p, [100, 50, 100]); }
    };
    K.onBake = (pz, st) => {
      if (st === 'baked') sfx.ding();
      if (st === 'burnt') sfx.alarm();
    };
    const H = makeHands(K, players, ctx, hud, {
      onTrash: (h, pz) => { G.wasted++; },
      onServe: (h, pz, spot) => {
        const c = spot.customer;
        if (!c || c.state !== 'waiting') { pz.rejected = true; sfx.place(); return; }
        const why = K.judge(pz, c.order);
        const head = c.c.root.position.clone().add(new THREE.Vector3(0, 3.1, 0));
        if (why.length) {
          pz.rejected = true;
          G.wrong++;
          c.patience = Math.max(1, c.patience - 5);
          sfx.angry();
          pop(head, `<b>Not my order!</b><small>${why[0]}</small>`, 'bad');
          ctx.buzz(h.p, [80, 40, 80]);
          return;
        }
        const base = 10 + c.order.length * 4;
        const tip = Math.round((c.patience / c.max) * 10);
        G.money += base + tip; G.tips += tip; G.served++; h.served++;
        sfx.cash();
        pop(head, `<b>+$${base}</b>${tip ? `<small>+$${tip} tip</small>` : ''}`, 'good');
        for (let i = 0; i < 16; i++) K.particles.emit(spot.x, TOP_Y + 1, spot.z, (Math.random() - 0.5) * 5, 3 + Math.random() * 4, (Math.random() - 0.5) * 3, { life: 0.8, size: 0.4, size1: 0.1, color: [1, 0.85, 0.25], gravity: 10 });
        for (const q of H.hands) ctx.buzz(q.p, 30);
        K.leave(c, true);
        K.later(0.5, () => { if (spot.pizza === pz) spot.pizza = null; pz.dispose(K.scene); K.pizzas = K.pizzas.filter((x) => x !== pz); });
      },
    });
    startMusic('pizza');
    for (const p of players) ctx.send(p, { t: 'phase', phase: 'play', game: 'pizza', controller: 'remote', color: p.color, name: p.name,
      remote: { title: 'PIZZA CHEF', hint: 'Point at the TV. Hold GRAB to carry. Scrub sauce & cheese onto the dough — shake your phone to sprinkle cheese!', a: 'GRAB' } });

    const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    return {
      K, H, G,
      update(dt) {
        if (phase === 'countdown') {
          const before = Math.ceil(clock);
          clock -= dt;
          const n = Math.ceil(clock);
          if (n !== before && n > 0) { center(`<b class="big">${n}</b>`, 800); sfx.beep(); }
          if (clock <= 0) { phase = 'play'; center('<b class="big go">OPEN!</b>', 900); sfx.bell(); K.spawnCustomer(); }
        } else if (phase === 'play') {
          remaining -= dt;
          spawnT -= dt;
          // keep the shop busy but never above the day's cap (Day 1 is gentle: 1–2 customers at a time)
          const present = K.customers.filter((c) => c.state !== 'leaving').length;
          const cap = D.cap + Math.floor((players.length - 1) * 0.7);
          if ((spawnT <= 0 || present === 0) && present < cap && remaining > 15) { K.spawnCustomer(); spawnT = D.spawn / scale * (0.85 + Math.random() * 0.3); }
          if (remaining <= 0) { phase = 'over'; clock = 2.5; center('<b class="big">CLOSING TIME!</b>', 0); sfx.finish(); }
        } else if (phase === 'over') {
          clock -= dt;
          if (clock <= 0 && !ended) {
            ended = true;
            const stars = goals.filter((g) => G.money >= g).length;
            if (stars) sfx.star();
            ctx.end({
              title: `DAY ${s.day} ${stars ? 'COMPLETE' : 'OVER'}`,
              summary: `<div class="stars">${[0, 1, 2].map((i) => `<i class="${i < stars ? 'on' : ''}" style="animation-delay:${0.3 + i * 0.25}s">⭐</i>`).join('')}</div>
                <div class="big">$${G.money}</div><p>${G.served} served · ${G.angry} angry · $${G.tips} in tips${G.wasted ? ` · ${G.wasted} binned` : ''}</p>`,
              rows: [...H.hands].sort((a, b) => b.served - a.served).map((h) => ({ name: h.p.name, color: h.p.color, human: true, humanId: h.p.id,
                sub: `${h.made} dough · ${h.toppings} toppings`, extra: '', value: `${h.served} 🍕` })),
            });
          }
        }
        K.step(phase === 'countdown' ? dt * 0.5 : dt);
        H.update(dt, (h) => ctx.pointer(h.p.id));

        // HUD
        moneyEl.textContent = '$' + G.money;
        goalBar.style.width = Math.min(100, (G.money / goals[2]) * 100) + '%';
        hud.querySelectorAll('.pz-goal span').forEach((e, k) => e.classList.toggle('got', G.money >= goals[k]));
        timeEl.textContent = fmt(Math.max(0, remaining));
        timeEl.classList.toggle('hurry', remaining < 20 && phase === 'play');
        // order bubbles above customers
        const live = new Set();
        for (const c of K.customers) {
          if (c.state === 'leaving') continue;
          live.add(c);
          let e = orderEls.get(c);
          if (!e) {
            e = document.createElement('div'); e.className = 'pz-order';
            e.innerHTML = `<div class="pz-bub">${PIZZA_ICON}<div class="pz-tops">${c.order.map((t) => `<span>${TOP_ICON[t]}</span>`).join('') || '<small>just cheese!</small>'}</div></div><div class="pz-pat"><i></i></div>`;
            ordersEl.appendChild(e); orderEls.set(c, e);
          }
          const sp = K.toScreen(c.c.root.position.clone().add(new THREE.Vector3(0, 4.0, 0)));
          e.style.transform = `translate(${sp.x}px, ${sp.y}px)`;
          const f = Math.max(0, c.patience / c.max);
          e.querySelector('.pz-pat i').style.width = f * 100 + '%';
          e.classList.toggle('low', f < 0.3);
          e.classList.toggle('arriving', c.state === 'walking');
        }
        for (const [c, e] of orderEls) if (!live.has(c)) { e.remove(); orderEls.delete(c); }
        // oven timers
        K.ovenSlots.forEach((slot, i) => {
          const e = ovenEls[i], pz = slot.pizza;
          if (!pz) { e.style.display = 'none'; return; }
          e.style.display = '';
          const sp = K.toScreen(new THREE.Vector3(slot.x, TOP_Y + 2.4, slot.z));
          e.style.transform = `translate(${sp.x}px, ${sp.y}px)`;
          const st = pz.state;
          const prog = st === 'baking' || st === 'raw' ? pz.bake / BAKE_DONE : st === 'baked' ? Math.min(1, (pz.bake - BAKE_DONE) / (BAKE_BURNT - BAKE_DONE)) : 1;
          e.dataset.st = pz.bake > BAKE_WARN && st !== 'burnt' ? 'warn' : st;
          e.style.setProperty('--p', prog);
          e.innerHTML = st === 'burnt' ? '💀' : st === 'baked' ? (pz.bake > BAKE_WARN ? '🔥' : '✓') : '';
        });
      },
      render() { K.render(); },
      resize(w, h) { K.resize(w, h); },
      dispose() { H.dispose(); K.dispose(); },
      phoneHud(p) {
        const h = H.hands.find((x) => x.p.id === p.id);
        if (!h) return null;
        const held = h.held instanceof Pizza ? 'Pizza' : h.held ? String(h.held).replace('topping:', '') : '';
        const next = goals.find((g) => G.money < g);
        return { t: 'hud', game: 'pizza', money: G.money, goal: next ?? goals[2], stars: goals.filter((g) => G.money >= g).length, hearts: G.hearts, time: Math.max(0, Math.ceil(remaining)), held };
      },
    };
  },
};

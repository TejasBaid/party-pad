// Fruit Frenzy — everyone slices the same fruit storm by swinging their phone (or swiping / using the mouse).
import * as THREE from 'three';
import { model, FRUITS } from '../assets.js';
import { Particles } from '../particles.js';
import { sfx, startMusic } from '../audio.js';
import { escapeHtml } from '../hud.js';
import { ordinal } from '../shared.js';

const INFO = {
  watermelon: { size: 2.0, flesh: '#ff4d5e', rind: '#2f8f3a', juice: [1, 0.2, 0.3], seeds: true },
  apple: { size: 1.3, flesh: '#fff3c4', rind: '#e8303a', juice: [1, 0.9, 0.55], seeds: true },
  banana: { size: 1.9, flesh: '#fff2b0', rind: '#ffd23f', juice: [1, 0.95, 0.6], cap: 0.32 },
  pineapple: { size: 2.0, flesh: '#ffd23f', rind: '#c98a2a', juice: [1, 0.85, 0.2] },
  orange: { size: 1.35, flesh: '#ffa030', rind: '#ff7a00', juice: [1, 0.6, 0.1], segments: true },
  lemon: { size: 1.25, flesh: '#fff15a', rind: '#ffd400', juice: [1, 1, 0.35], segments: true },
  pear: { size: 1.45, flesh: '#f7f5d0', rind: '#9acd32', juice: [0.9, 1, 0.6], seeds: true },
  strawberry: { size: 1.15, flesh: '#ff6b7a', rind: '#e8203a', juice: [1, 0.2, 0.3] },
  coconut: { size: 1.45, flesh: '#ffffff', rind: '#6b4226', juice: [1, 1, 1] },
  grapes: { size: 1.4, flesh: '#c9a0ff', rind: '#7b3fd6', juice: [0.6, 0.3, 1], cap: 0.6 },
  cherries: { size: 1.2, flesh: '#d6284a', rind: '#a0102a', juice: [0.8, 0.1, 0.2], cap: 0.5 },
  avocado: { size: 1.35, flesh: '#d8f08a', rind: '#2f5a1a', juice: [0.7, 0.9, 0.3], pit: true },
  pumpkin: { size: 1.8, flesh: '#ffb04a', rind: '#ff7a1a', juice: [1, 0.6, 0.2], seeds: true },
};
const GRAVITY = 15;

// ------------------------------------------------------------------ painted backdrop
function backdropTexture() {
  const c = document.createElement('canvas'); c.width = 2048; c.height = 1152;
  const g = c.getContext('2d');
  // wooden planks
  for (let x = 0; x < 2048; x += 128) {
    const l = 26 + Math.random() * 8;
    g.fillStyle = `hsl(24, 45%, ${l}%)`;
    g.fillRect(x, 0, 128, 1152);
    for (let i = 0; i < 40; i++) {
      g.strokeStyle = `rgba(0,0,0,${0.04 + Math.random() * 0.06})`; g.lineWidth = 1 + Math.random() * 2;
      g.beginPath(); const y = Math.random() * 1152; g.moveTo(x, y); g.bezierCurveTo(x + 40, y + 20, x + 90, y - 20, x + 128, y + 10); g.stroke();
    }
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x, 0, 4, 1152);
  }
  // moon-gate window with a sunset
  const cx = 1024, cy = 520, R = 400;
  g.save(); g.beginPath(); g.arc(cx, cy, R, 0, 7); g.clip();
  const sky = g.createLinearGradient(0, cy - R, 0, cy + R);
  sky.addColorStop(0, '#2a1a6e'); sky.addColorStop(0.45, '#ff6b9d'); sky.addColorStop(0.75, '#ffb070'); sky.addColorStop(1, '#ffd89a');
  g.fillStyle = sky; g.fillRect(cx - R, cy - R, R * 2, R * 2);
  g.fillStyle = '#fff4c8'; g.beginPath(); g.arc(cx + 90, cy + 90, 90, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,244,200,0.25)'; g.beginPath(); g.arc(cx + 90, cy + 90, 140, 0, 7); g.fill();
  // mountains
  g.fillStyle = '#6b3a7a';
  g.beginPath(); g.moveTo(cx - R, cy + R); g.lineTo(cx - 260, cy + 110); g.lineTo(cx - 120, cy + 220); g.lineTo(cx + 40, cy + 60); g.lineTo(cx + 260, cy + 230); g.lineTo(cx + R, cy + 150); g.lineTo(cx + R, cy + R); g.fill();
  g.fillStyle = '#4a2560';
  g.beginPath(); g.moveTo(cx - R, cy + R); g.lineTo(cx - 200, cy + 260); g.lineTo(cx + 120, cy + 300); g.lineTo(cx + R, cy + 250); g.lineTo(cx + R, cy + R); g.fill();
  g.restore();
  g.lineWidth = 34; g.strokeStyle = '#3a1f10'; g.beginPath(); g.arc(cx, cy, R + 12, 0, 7); g.stroke();
  g.lineWidth = 8; g.strokeStyle = '#c98a4a'; g.beginPath(); g.arc(cx, cy, R + 30, 0, 7); g.stroke();
  // cherry blossom branch
  g.strokeStyle = '#3a1f10'; g.lineCap = 'round';
  const branch = (x, y, a, len, w) => {
    if (w < 1.5) return;
    const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
    g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
    for (let i = 0; i < 3; i++) { g.fillStyle = ['#ffb7d0', '#ff8fb8', '#ffd6e6'][i]; g.beginPath(); g.arc(x2 + (Math.random() - 0.5) * 40, y2 + (Math.random() - 0.5) * 40, 10 + Math.random() * 14, 0, 7); g.fill(); }
    branch(x2, y2, a + 0.4 + Math.random() * 0.3, len * 0.72, w * 0.7);
    branch(x2, y2, a - 0.3 - Math.random() * 0.3, len * 0.7, w * 0.65);
  };
  branch(0, 180, 0.1, 190, 22);
  branch(2048, 120, Math.PI - 0.15, 170, 20);
  // vignette
  const v = g.createRadialGradient(1024, 576, 300, 1024, 576, 1250);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(10,4,20,0.7)');
  g.fillStyle = v; g.fillRect(0, 0, 2048, 1152);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const capCache = {};
function capTexture(kind) {
  if (capCache[kind]) return capCache[kind];
  const I = INFO[kind];
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = I.rind; g.beginPath(); g.arc(64, 64, 64, 0, 7); g.fill();
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 58);
  grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.25, I.flesh); grd.addColorStop(1, I.flesh);
  g.fillStyle = grd; g.beginPath(); g.arc(64, 64, 56, 0, 7); g.fill();
  if (I.segments) { g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 3; for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.cos(a) * 54, 64 + Math.sin(a) * 54); g.stroke(); } }
  if (I.seeds) { g.fillStyle = '#2a1a10'; for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2, r = kind === 'watermelon' ? 34 : 14; g.beginPath(); g.ellipse(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, 3, 5, a, 0, 7); g.fill(); } }
  if (I.pit) { g.fillStyle = '#8a5a2a'; g.beginPath(); g.arc(64, 64, 24, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return (capCache[kind] = t);
}

function splatTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 576;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return { c, g: c.getContext('2d'), t };
}

// ------------------------------------------------------------------ scene shared by the game and the lobby demo
class FruitScene {
  constructor(ctx, { bombs = true, rain = 1, demo = false } = {}) {
    this.ctx = ctx;
    this.demo = demo;
    this.bombsOn = bombs;
    this.rain = rain;
    const scene = (this.scene = new THREE.Scene());
    this.camera = new THREE.PerspectiveCamera(40, ctx.W / ctx.H, 0.1, 200);
    this.camera.position.set(0, 0, 17);
    this.camera.lookAt(0, 0, 0);
    ctx.renderer.toneMappingExposure = 1.0;

    // backdrop + splat layer
    const back = new THREE.Mesh(new THREE.PlaneGeometry(64, 36), new THREE.MeshBasicMaterial({ map: backdropTexture() }));
    back.position.z = -10;
    scene.add(back);
    this.splat = splatTexture();
    const splatPlane = new THREE.Mesh(new THREE.PlaneGeometry(64, 36), new THREE.MeshBasicMaterial({ map: this.splat.t, transparent: true, depthWrite: false }));
    splatPlane.position.z = -9.9;
    scene.add(splatPlane);

    scene.add(new THREE.HemisphereLight(0xffe8d0, 0x402040, 1.6));
    const key = new THREE.DirectionalLight(0xfff0dd, 2.6); key.position.set(-6, 10, 14); scene.add(key);
    const rim = new THREE.DirectionalLight(0xff8fb8, 1.6); rim.position.set(8, -4, -6); scene.add(rim);

    this.particles = new Particles(3000);
    this.particles.addTo(scene);
    this.fruits = [];
    this.halves = [];
    this.time = 0;
    this.spawnT = 1.2;
    this.slowT = 0; this.frenzyT = 0;
    this.queue = [];
    this.petals = this.makePetals();
    this.tmpV = new THREE.Vector3();
  }

  makePetals() {
    const N = 120, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) pos.set([(Math.random() - 0.5) * 50, (Math.random() - 0.5) * 30, -6 + Math.random() * 10], i * 3);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d');
    g.fillStyle = '#ffc0d8'; g.beginPath(); g.ellipse(16, 16, 12, 7, 0.6, 0, 7); g.fill();
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.5, map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    this.scene.add(pts);
    return { pts, geo, N };
  }

  // world extents of the play plane (z = 0)
  get halfH() { return Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.position.z; }
  get halfW() { return this.halfH * this.camera.aspect; }
  toWorld(px, py) { return { x: (px * 2 - 1) * this.halfW, y: (1 - py * 2) * this.halfH }; }
  toScreen(x, y) { return { x: (x / this.halfW + 1) / 2 * this.ctx.W, y: (1 - y / this.halfH) / 2 * this.ctx.H }; }

  spawn(opts = {}) {
    const hw = this.halfW, hh = this.halfH;
    let special = opts.special || null;
    let kind = opts.kind || FRUITS[Math.floor(Math.random() * FRUITS.length)];
    const g = new THREE.Group();
    let r;
    if (special === 'bomb') {
      r = 0.85;
      const body = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), new THREE.MeshStandardMaterial({ color: 0x1a1a24, roughness: 0.3, metalness: 0.6 }));
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.3, 12), new THREE.MeshStandardMaterial({ color: 0x555566, metalness: 0.8, roughness: 0.3 }));
      cap.position.y = r * 0.95;
      const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 6), new THREE.MeshStandardMaterial({ color: 0xc8a060 }));
      fuse.position.set(0.1, r + 0.35, 0); fuse.rotation.z = -0.4;
      const glow = new THREE.Mesh(new THREE.SphereGeometry(r * 1.35, 20, 12), new THREE.MeshBasicMaterial({ color: 0xff2030, transparent: true, opacity: 0.18, depthWrite: false }));
      g.add(body, cap, fuse, glow);
      g.userData.glow = glow;
    } else {
      const I = INFO[kind];
      const m = model('food:' + kind, { size: I.size * 1.25, fit: 'max' });
      const sz = m.userData.size;
      m.position.y = -sz.y / 2;
      if (special === 'gold') m.traverse((o) => { if (o.isMesh) o.material = new THREE.MeshStandardMaterial({ color: 0xffc933, metalness: 1, roughness: 0.2, emissive: 0x7a4a00, emissiveIntensity: 0.5 }); });
      g.add(m);
      r = Math.max(sz.x, sz.y, sz.z) * 0.5 * 0.9;
      if (special === 'frenzy' || special === 'freeze') {
        const aura = new THREE.Mesh(new THREE.SphereGeometry(r * 1.4, 20, 12), new THREE.MeshBasicMaterial({ color: special === 'freeze' ? 0x6fd8ff : 0xff5ea8, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending }));
        g.add(aura);
        g.userData.glow = aura;
      }
    }
    // launch from below with an apex somewhere on screen
    const side = opts.side || 0;
    let x, vx, y = -hh - 2, vy;
    const apex = (opts.apex ?? (0.1 + Math.random() * 0.75)) * hh * 2 - hh;
    vy = Math.sqrt(2 * GRAVITY * (apex - y));
    if (side) { x = side * (hw + 2); y = -hh * 0.2 + Math.random() * hh * 0.6; vy = 4 + Math.random() * 6; vx = -side * (9 + Math.random() * 7); }
    else { x = (Math.random() * 2 - 1) * hw * 0.7; const tx = (Math.random() * 2 - 1) * hw * 0.5; vx = (tx - x) / (vy / GRAVITY * 2) ; }
    g.position.set(x, y, (Math.random() - 0.5) * 1.5);
    g.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    this.scene.add(g);
    const f = { g, kind, special, r, vx, vy, spin: new THREE.Vector3((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5), alive: true };
    this.fruits.push(f);
    if (special === 'bomb' && !this.demo) sfx.fuse();
    return f;
  }

  // Cut a fruit along a line in the screen plane (dir = swipe direction)
  slice(f, dirX, dirY, color) {
    f.alive = false;
    this.scene.remove(f.g);
    if (f.special === 'bomb') return this.explode(f);
    const I = INFO[f.kind];
    const len = Math.hypot(dirX, dirY) || 1;
    const n = new THREE.Vector3(-dirY / len, dirX / len, 0); // cut plane normal (perpendicular to the swipe)
    for (const s of [1, -1]) {
      const h = f.g.clone(true);
      h.userData = {};
      const local = n.clone().multiplyScalar(s).applyQuaternion(f.g.quaternion.clone().invert());
      const plane = new THREE.Plane();
      h.traverse((o) => {
        if (!o.isMesh) return;
        o.material = o.material.clone();
        o.material.clippingPlanes = [plane];
        o.material.side = THREE.DoubleSide;
        if (o.material.transparent) o.visible = false; // drop auras
      });
      // flesh cap on the cut face
      const capR = f.r * (I.cap ?? 0.85);
      const cap = new THREE.Mesh(new THREE.CircleGeometry(capR, 24), new THREE.MeshStandardMaterial({ map: f.special === 'gold' ? null : capTexture(f.kind), color: f.special === 'gold' ? 0xffe070 : 0xffffff, roughness: 0.5, emissive: 0x221108, side: THREE.DoubleSide }));
      cap.lookAt(local.clone().multiplyScalar(-1));
      cap.position.copy(local).multiplyScalar(-0.01);
      h.add(cap);
      this.scene.add(h);
      const push = 3.2 + Math.random() * 1.5;
      this.halves.push({ g: h, plane, local, vx: f.vx * 0.6 + n.x * s * push, vy: Math.max(f.vy * 0.4, 2) + n.y * s * push, spin: new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, s * (2 + Math.random() * 4)) });
    }
    // juice!
    const p = f.g.position, [r, g, b] = I.juice;
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * 9;
      this.particles.emit(p.x, p.y, p.z + 0.5, Math.cos(a) * sp, Math.sin(a) * sp + 2, (Math.random() - 0.5) * 3, { life: 0.5 + Math.random() * 0.4, size: 0.35 + Math.random() * 0.4, size1: 0.1, color: [r, g, b], alpha: 0.95, additive: false, gravity: 18, drag: 1.2 });
    }
    for (let i = 0; i < 8; i++) this.particles.emit(p.x, p.y, p.z + 0.6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, 0, { life: 0.35, size: 0.9, size1: 0.1, color: [1, 1, 1], alpha: 0.9 });
    if (f.special === 'gold') for (let i = 0; i < 30; i++) { const a = Math.random() * 7, sp = 4 + Math.random() * 10; this.particles.emit(p.x, p.y, p.z + 0.6, Math.cos(a) * sp, Math.sin(a) * sp, 0, { life: 0.8, size: 0.5, size1: 0.1, color: [1, 0.85, 0.3], gravity: 6 }); }
    this.paintSplat(p.x, p.y, I.juice, f.r);
  }

  paintSplat(x, y, [r, g, b], size) {
    // project the fruit onto the back wall (z = -10) through the camera
    const k = (this.camera.position.z + 9.9) / this.camera.position.z;
    const wx = x * k, wy = y * k;
    const u = (wx / 64 + 0.5) * 1024, v = (0.5 - wy / 36) * 576;
    const G = this.splat.g, col = `rgba(${r * 255 | 0},${g * 255 | 0},${b * 255 | 0},`;
    const s = 7 + size * 9;
    const blob = (x, y, rad, a) => { const grd = G.createRadialGradient(x, y, 0, x, y, rad); grd.addColorStop(0, col + a + ')'); grd.addColorStop(0.7, col + a * 0.8 + ')'); grd.addColorStop(1, col + '0)'); G.fillStyle = grd; G.beginPath(); G.arc(x, y, rad, 0, 7); G.fill(); };
    blob(u, v, s * 1.3, 0.55);
    for (let i = 0; i < 9; i++) {
      const a = Math.random() * 7, d = s * (0.9 + Math.random() * 1.3);
      blob(u + Math.cos(a) * d, v + Math.sin(a) * d, 2 + Math.random() * s * 0.35, 0.5);
    }
    // a couple of thin drips running down the wall
    G.strokeStyle = col + '0.35)'; G.lineCap = 'round';
    for (let i = 0; i < 2; i++) { const x = u + (Math.random() - 0.5) * s; G.lineWidth = 2 + Math.random() * 2; G.beginPath(); G.moveTo(x, v); G.lineTo(x, v + s * (1 + Math.random() * 2.5)); G.stroke(); }
    this.splat.t.needsUpdate = true;
  }

  explode(f) {
    const p = f.g.position;
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * 7, sp = 5 + Math.random() * 16;
      this.particles.emit(p.x, p.y, p.z + 0.5, Math.cos(a) * sp, Math.sin(a) * sp, (Math.random() - 0.5) * 4, { life: 0.5 + Math.random() * 0.5, size: 1.2, size1: 0.2, color: Math.random() < 0.5 ? [1, 0.55, 0.1] : [1, 0.9, 0.3], drag: 2.5 });
    }
    for (let i = 0; i < 20; i++) this.particles.emit(p.x, p.y, p.z, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, 0, { life: 1.4, size: 2.2, size1: 4.5, color: [0.25, 0.22, 0.28], alpha: 0.6, additive: false, drag: 1.5 });
    const G = this.splat.g, k = (this.camera.position.z + 9.9) / this.camera.position.z;
    const u = ((p.x * k) / 64 + 0.5) * 1024, v = (0.5 - (p.y * k) / 36) * 576;
    const grd = G.createRadialGradient(u, v, 5, u, v, 90);
    grd.addColorStop(0, 'rgba(20,10,10,0.8)'); grd.addColorStop(1, 'rgba(20,10,10,0)');
    G.fillStyle = grd; G.beginPath(); G.arc(u, v, 90, 0, 7); G.fill();
    this.splat.t.needsUpdate = true;
    sfx.explode();
  }

  step(dt) {
    const tdt = this.slowT > 0 ? dt * 0.4 : dt;
    this.time += dt;
    this.slowT = Math.max(0, this.slowT - dt);
    const hh = this.halfH;
    while (this.queue.length && this.queue[0].at <= this.time) this.spawn(this.queue.shift().opts);
    for (const f of this.fruits) {
      if (!f.alive) continue;
      f.vy -= GRAVITY * tdt;
      f.g.position.x += f.vx * tdt; f.g.position.y += f.vy * tdt;
      f.g.rotation.x += f.spin.x * tdt; f.g.rotation.y += f.spin.y * tdt; f.g.rotation.z += f.spin.z * tdt;
      if (f.g.userData.glow) f.g.userData.glow.material.opacity = 0.15 + Math.sin(this.time * 12) * 0.08;
      if (f.special === 'bomb' && Math.random() < 0.6) {
        const fp = f.g.localToWorld(this.tmpV.set(0.25, f.r + 0.65, 0));
        this.particles.emit(fp.x, fp.y, fp.z, (Math.random() - 0.5) * 3, 2 + Math.random() * 2, 0, { life: 0.25, size: 0.35, size1: 0.05, color: [1, 0.8, 0.3], gravity: 5 });
      }
      if (f.g.position.y < -hh - 4 && f.vy < 0) { f.alive = false; this.scene.remove(f.g); }
    }
    this.fruits = this.fruits.filter((f) => f.alive);
    for (const h of this.halves) {
      h.vy -= GRAVITY * tdt;
      h.g.position.x += h.vx * tdt; h.g.position.y += h.vy * tdt;
      h.g.rotation.x += h.spin.x * tdt; h.g.rotation.y += h.spin.y * tdt; h.g.rotation.z += h.spin.z * tdt;
      h.g.updateMatrixWorld();
      const worldN = h.local.clone().applyQuaternion(h.g.quaternion);
      h.plane.setFromNormalAndCoplanarPoint(worldN, h.g.position);
    }
    for (const h of this.halves) if (h.g.position.y < -hh - 5) { this.scene.remove(h.g); h.dead = true; }
    this.halves = this.halves.filter((h) => !h.dead);
    this.particles.update(tdt);
    // petals drift
    const pp = this.petals.geo.attributes.position.array;
    for (let i = 0; i < this.petals.N; i++) {
      pp[i * 3] += (1.2 + Math.sin(this.time + i) * 0.8) * dt; pp[i * 3 + 1] -= (0.8 + (i % 5) * 0.2) * dt;
      if (pp[i * 3 + 1] < -18) { pp[i * 3 + 1] = 18; pp[i * 3] = (Math.random() - 0.5) * 50; }
      if (pp[i * 3] > 26) pp[i * 3] = -26;
    }
    this.petals.geo.attributes.position.needsUpdate = true;
    // slowly fade the juice on the wall
    this.fadeT = (this.fadeT || 0) + dt;
    if (this.fadeT > 0.25) {
      this.fadeT = 0;
      const G = this.splat.g; G.save(); G.globalCompositeOperation = 'destination-out'; G.fillStyle = 'rgba(0,0,0,0.02)'; G.fillRect(0, 0, 1024, 576); G.restore();
      this.splat.t.needsUpdate = true;
    }
  }

  // how many fruit to throw per wave, as the round goes on
  autoSpawn(dt, intensity, players = 1) {
    this.spawnT -= dt;
    if (this.frenzyT > 0) {
      this.frenzyT -= dt;
      if (Math.random() < dt * 9) this.spawn({ side: Math.random() < 0.5 ? -1 : 1 });
    }
    if (this.spawnT > 0) return;
    const scale = 1 + (players - 1) * 0.35;
    const count = Math.max(1, Math.round((1 + Math.random() * (1.5 + intensity * 3.5)) * scale * this.rain));
    const pattern = Math.random();
    for (let i = 0; i < count; i++) {
      const roll = Math.random();
      let special = null;
      if (this.bombsOn && roll < 0.06 + intensity * 0.12) special = 'bomb';
      else if (roll > 0.975) special = 'gold';
      else if (roll > 0.955 && !this.demo) special = Math.random() < 0.5 ? 'frenzy' : 'freeze';
      this.queue.push({ at: this.time + (pattern < 0.3 ? i * 0.09 : i * 0.22), opts: { special, kind: special === 'frenzy' ? 'banana' : special === 'gold' ? 'apple' : special === 'freeze' ? 'grapes' : undefined, apex: pattern < 0.3 ? 0.55 + i * 0.04 : undefined } });
    }
    this.spawnT = (1.9 - intensity * 1.0) + Math.random() * 0.6;
  }

  render() {
    const r = this.ctx.renderer;
    r.setScissorTest(false);
    r.setViewport(0, 0, this.ctx.W, this.ctx.H);
    this.particles.setViewportHeight(this.ctx.H * r.getPixelRatio() / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)) / 0.9);
    r.render(this.scene, this.camera);
  }

  resize(w, h) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }

  dispose() { this.splat.t.dispose(); }
}

// ------------------------------------------------------------------ blades
class Blade {
  constructor(scene, color) {
    this.color = new THREE.Color(color);
    this.pts = [];
    const MAX = 24;
    this.MAX = MAX;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 2 * 3);
    this.col = new Float32Array(MAX * 2 * 4);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    const idx = [];
    for (let i = 0; i < MAX - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setIndex(idx);
    this.geo = geo;
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
    scene.add(this.mesh);
    this.tip = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshBasicMaterial({ color: this.color, transparent: true, opacity: 0.9, depthTest: false }));
    this.tip.renderOrder = 21;
    scene.add(this.tip);
  }
  push(x, y, t) { this.pts.push({ x, y, t }); while (this.pts.length > this.MAX) this.pts.shift(); }
  update(t, stunned) {
    this.pts = this.pts.filter((p) => t - p.t < 0.16);
    const n = this.pts.length;
    const white = new THREE.Color(1, 1, 1);
    for (let i = 0; i < this.MAX; i++) {
      const p = this.pts[Math.min(i, n - 1)] || { x: 0, y: -999 };
      const q = this.pts[Math.min(i + 1, n - 1)] || p, o = this.pts[Math.max(i - 1, 0)] || p;
      let dx = q.x - o.x, dy = q.y - o.y; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const f = n > 1 ? Math.min(i, n - 1) / (n - 1) : 0; // 0 tail .. 1 head
      const w = (stunned ? 0.06 : 0.26) * f;
      this.pos.set([p.x - dy * w, p.y + dx * w, 2, p.x + dy * w, p.y - dx * w, 2], i * 6);
      const c = stunned ? new THREE.Color(0.3, 0.3, 0.3) : this.color.clone().lerp(white, f * f * 0.35);
      const a = n > 1 ? f : 0;
      this.col.set([c.r, c.g, c.b, a, c.r, c.g, c.b, a], i * 8);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    const head = this.pts[n - 1];
    if (head) this.tip.position.set(head.x, head.y, 2.1);
    this.tip.material.color.copy(stunned ? new THREE.Color(0.4, 0.4, 0.4) : this.color);
  }
  dispose(scene) { scene.remove(this.mesh, this.tip); }
}

// segment/circle hit test in the play plane
function segHit(ax, ay, bx, by, cx, cy, r) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1e-6;
  const t = Math.max(0, Math.min(1, ((cx - ax) * dx + (cy - ay) * dy) / l2));
  const px = ax + dx * t - cx, py = ay + dy * t - cy;
  return px * px + py * py < r * r;
}

// ------------------------------------------------------------------ module
export default {
  id: 'fruit',
  settings: [
    { key: 'time', label: 'Round', options: ['60s', '90s', '120s'], def: 1 },
    { key: 'bombs', label: 'Bombs', options: ['On', 'Off'], def: 0 },
    { key: 'rain', label: 'Fruit', options: ['Normal', 'Lots', 'Chaos'], def: 0 },
  ],
  startLabel: 'START SLICING',
  roleOf: () => 'Sword ready ⚔️',

  demo(ctx) {
    const S = new FruitScene(ctx, { demo: true });
    const ghosts = ['#ff4d5e', '#3d8bff'].map((c) => ({ blade: new Blade(S.scene, c), target: null, t: 0, from: null }));
    startMusic('fruit');
    return {
      update(dt) {
        S.step(dt);
        S.autoSpawn(dt, 0.35, 1);
        for (const gh of ghosts) {
          gh.t += dt;
          if (!gh.target || gh.t > 0.22) {
            const cand = S.fruits.filter((f) => f.alive && f.special !== 'bomb' && f.vy < 3 && f.g.position.y > -S.halfH * 0.5);
            gh.target = cand[Math.floor(Math.random() * cand.length)] || null;
            gh.t = 0;
            if (gh.target) { const a = Math.random() * 7; gh.dir = { x: Math.cos(a), y: Math.sin(a) }; }
          }
          if (gh.target?.alive) {
            const k = gh.t / 0.22, p = gh.target.g.position;
            const x = p.x + gh.dir.x * (k - 0.5) * 7, y = p.y + gh.dir.y * (k - 0.5) * 7;
            const prev = gh.blade.pts[gh.blade.pts.length - 1];
            gh.blade.push(x, y, S.time);
            if (prev && segHit(prev.x, prev.y, x, y, p.x, p.y, gh.target.r)) S.slice(gh.target, gh.dir.x, gh.dir.y);
          }
          gh.blade.update(S.time, false);
        }
      },
      render() { S.render(); },
      resize(w, h) { S.resize(w, h); },
      dispose() { S.dispose(); },
    };
  },

  start(ctx, players, s) {
    const S = new FruitScene(ctx, { bombs: s.bombs === 'On', rain: { Normal: 1, Lots: 1.5, Chaos: 2.2 }[s.rain] });
    const duration = parseInt(s.time, 10);
    const P = players.map((p) => ({
      p, blade: new Blade(S.scene, p.color), score: 0, sliced: 0, bestCombo: 0, combo: 0, comboT: 0, comboPts: [],
      stunT: 0, fastT: 0, last: null, bombs: 0,
    }));
    let phase = 'countdown', clock = 3.5, remaining = duration, ended = false;
    const hud = ctx.hudRoot;
    hud.className = 'fruit-hud';
    hud.innerHTML = `
      <div class="fr-top"><div class="fr-timer"><b>${duration}</b><small>SECONDS</small></div></div>
      <div class="fr-scores">${P.map((q) => `<div class="fr-score" style="--pc:${q.p.color}"><i></i><span>${escapeHtml(q.p.name)}</span><b>0</b></div>`).join('')}</div>
      <div class="fr-cursors">${P.map((q) => `<div class="fr-cursor" style="--pc:${q.p.color}"><i></i><span>${escapeHtml(q.p.name)}</span></div>`).join('')}</div>
      <div class="fr-center"></div><div class="fr-flash"></div><div class="fr-pops"></div>`;
    const timerEl = hud.querySelector('.fr-timer b'), centerEl = hud.querySelector('.fr-center'), flashEl = hud.querySelector('.fr-flash'), popsEl = hud.querySelector('.fr-pops');
    const scoreEls = [...hud.querySelectorAll('.fr-score')], cursorEls = [...hud.querySelectorAll('.fr-cursor')];
    const center = (html, ms = 900, cls = '') => { centerEl.innerHTML = `<div class="${cls}">${html}</div>`; clearTimeout(center.t); if (ms) center.t = setTimeout(() => (centerEl.innerHTML = ''), ms); };
    const pop = (x, y, html, color) => {
      const sp = S.toScreen(x, y);
      const e = document.createElement('div');
      e.className = 'fr-pop'; e.style.left = sp.x + 'px'; e.style.top = sp.y + 'px'; e.style.setProperty('--pc', color);
      e.innerHTML = html; popsEl.appendChild(e);
      setTimeout(() => e.remove(), 1100);
    };
    startMusic('fruit');
    for (const q of P) ctx.send(q.p, { t: 'phase', phase: 'play', game: 'fruit', controller: 'remote', color: q.p.color, name: q.p.name,
      remote: { title: 'SWING TO SLICE', hint: 'Point at the TV and swing your phone like a sword. Don’t hit the bombs!', a: null } });

    const finishCombo = (q) => {
      if (q.combo >= 3) {
        const bonus = q.combo;
        q.score += bonus;
        const c = q.comboPts[q.comboPts.length - 1];
        pop(c.x, c.y + 1.2, `<b>${q.combo} FRUIT COMBO</b><em>+${bonus}</em>`, q.p.color);
        sfx.combo(q.combo);
        ctx.buzz(q.p, [30, 30, 30]);
      }
      q.bestCombo = Math.max(q.bestCombo, q.combo);
      q.combo = 0; q.comboPts = [];
    };

    return {
      update(dt) {
        const t = S.time;
        if (phase === 'countdown') {
          const before = Math.ceil(clock);
          clock -= dt;
          const n = Math.ceil(clock);
          if (n !== before && n > 0) { center(`<b class="big">${n}</b>`, 800); sfx.beep(); }
          if (clock <= 0) { phase = 'play'; center('<b class="big go">SLICE!</b>', 900); sfx.go(); }
        } else if (phase === 'play') {
          remaining -= dt;
          const intensity = Math.min(1, 1 - remaining / duration);
          S.autoSpawn(dt, 0.2 + intensity * 0.8, P.length);
          if (Math.ceil(remaining) <= 5 && Math.ceil(remaining) !== this._beep && remaining > 0) { this._beep = Math.ceil(remaining); sfx.beep(); }
          if (remaining <= 0) { phase = 'over'; clock = 2.5; center('<b class="big">TIME!</b>', 0); sfx.finish(); }
        } else if (phase === 'over') {
          clock -= dt;
          if (clock <= 0 && !ended) {
            ended = true;
            for (const q of P) finishCombo(q);
            const ranked = [...P].sort((a, b) => b.score - a.score);
            ctx.end({
              title: 'FRUIT FRENZY',
              summary: `<div class="big">${escapeHtml(ranked[0].p.name)} wins!</div><p>${ranked.reduce((a, q) => a + q.sliced, 0)} fruit sliced together</p>`,
              rows: ranked.map((q, i) => ({ place: i + 1, name: q.p.name, color: q.p.color, human: true, humanId: q.p.id,
                sub: `${q.sliced} fruit · best combo ${q.bestCombo}${q.bombs ? ` · ${q.bombs} 💣` : ''}`, value: q.score })),
            });
          }
        }
        timerEl.textContent = Math.max(0, Math.ceil(remaining));
        timerEl.parentElement.classList.toggle('hurry', remaining <= 10 && phase === 'play');

        S.step(dt);

        // blades
        const canSlice = phase === 'play' || phase === 'over';
        P.forEach((q, i) => {
          const ptr = ctx.pointer(q.p.id);
          const w = S.toWorld(ptr.x, ptr.y);
          q.stunT = Math.max(0, q.stunT - dt);
          const last = q.last;
          q.blade.push(w.x, w.y, t);
          if (last && canSlice && q.stunT <= 0) {
            const dx = w.x - last.x, dy = w.y - last.y, speed = Math.hypot(dx, dy) / Math.max(dt, 1e-3);
            if (speed > S.halfH * 1.7) {
              if (q.fastT <= 0) sfx.swish();
              q.fastT = 0.12;
              for (const f of S.fruits) {
                if (!f.alive) continue;
                const fp = f.g.position;
                if (!segHit(last.x, last.y, w.x, w.y, fp.x, fp.y, f.r + 0.15)) continue;
                if (f.special === 'bomb') {
                  S.slice(f, dx, dy);
                  q.score = Math.max(0, q.score - 10); q.bombs++; q.stunT = 1.6; q.combo = 0;
                  pop(fp.x, fp.y, '<b>BOOM!</b><em>−10</em>', '#ff3b3b');
                  flashEl.classList.remove('on'); void flashEl.offsetWidth; flashEl.classList.add('on');
                  ctx.buzz(q.p, [200, 80, 300]);
                  continue;
                }
                S.slice(f, dx, dy, q.p.color);
                const pts = f.special === 'gold' ? 5 : 1;
                q.score += pts; q.sliced++;
                q.combo++; q.comboPts.push({ x: fp.x, y: fp.y });
                sfx.slice(0.8 + Math.random() * 0.5);
                ctx.buzz(q.p, 18);
                pop(fp.x, fp.y, `<em>+${pts}</em>`, q.p.color);
                if (f.special === 'gold') { sfx.special(); pop(fp.x, fp.y + 1.3, '<b>GOLDEN!</b>', '#ffd23f'); }
                if (f.special === 'frenzy') { S.frenzyT = 5; sfx.special(); center('<b class="big frenzy">FRUIT FRENZY!</b>', 1400); }
                if (f.special === 'freeze') { S.slowT = 4.5; sfx.special(); center('<b class="big freeze">SLOW-MO!</b>', 1400); }
              }
            } else {
              q.fastT -= dt;
              if (q.fastT <= 0 && q.combo) finishCombo(q);
            }
          }
          q.last = w;
          q.blade.update(t, q.stunT > 0);
          // HTML cursor + score
          const el = cursorEls[i];
          el.style.transform = `translate(${ptr.x * ctx.W}px, ${ptr.y * ctx.H}px)`;
          el.classList.toggle('stun', q.stunT > 0);
          scoreEls[i].querySelector('b').textContent = q.score;
        });
        const top = Math.max(...P.map((q) => q.score));
        P.forEach((q, i) => scoreEls[i].classList.toggle('lead', top > 0 && q.score === top));
      },
      render() { S.render(); },
      resize(w, h) { S.resize(w, h); },
      dispose() { for (const q of P) q.blade.dispose(S.scene); S.dispose(); },
      phoneHud(p) {
        const q = P.find((x) => x.p.id === p.id);
        if (!q) return null;
        const rank = [...P].sort((a, b) => b.score - a.score).indexOf(q) + 1;
        return { t: 'hud', game: 'fruit', score: q.score, rank, total: P.length, time: Math.max(0, Math.ceil(remaining)), stun: q.stunT > 0 };
      },
    };
  },
};

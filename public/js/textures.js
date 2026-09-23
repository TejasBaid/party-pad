// Procedural canvas textures (road, curbs, ground detail, decals, sprites).
import * as THREE from 'three';

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function tex(c, { repeat = true, srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}
function noise(ctx, w, h, amount, alpha = 0.08) {
  for (let i = 0; i < amount; i++) {
    const v = Math.random() < 0.5 ? 0 : 255;
    ctx.fillStyle = `rgba(${v},${v},${v},${Math.random() * alpha})`;
    const s = 1 + Math.random() * 2;
    ctx.fillRect(Math.random() * w, Math.random() * h, s, s);
  }
}

// Road: u runs across the road (0 = right edge, 1 = left edge), v along it.
export function roadTexture() {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#4a4d57';
  g.fillRect(0, 0, 512, 512);
  noise(g, 512, 512, 26000, 0.12);
  // subtle tyre-worn lanes
  for (const x of [150, 362]) {
    const grd = g.createLinearGradient(x - 60, 0, x + 60, 0);
    grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(0.5, 'rgba(0,0,0,0.13)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(x - 60, 0, 120, 512);
  }
  // edge lines
  g.fillStyle = '#f4f4f0';
  g.fillRect(14, 0, 10, 512);
  g.fillRect(488, 0, 10, 512);
  // centre dashes
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.fillRect(251, 40, 10, 180);
  g.fillRect(251, 296, 10, 180);
  return tex(c);
}

export function curbTexture() {
  const [c, g] = canvas(64, 128);
  g.fillStyle = '#e8303a'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#f7f7f7'; g.fillRect(0, 64, 64, 64);
  g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(0, 0, 6, 128);
  return tex(c);
}

export function checkerTexture(cols = 12, rows = 2) {
  const [c, g] = canvas(cols * 32, rows * 32);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    g.fillStyle = (x + y) % 2 ? '#111' : '#fafafa';
    g.fillRect(x * 32, y * 32, 32, 32);
  }
  const t = tex(c, { repeat: false });
  t.magFilter = THREE.NearestFilter;
  return t;
}

export function boostPadTexture() {
  const [c, g] = canvas(128, 256);
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#ff7a00'); grd.addColorStop(1, '#ffd000');
  g.fillStyle = '#2a1a3a'; g.fillRect(0, 0, 128, 256);
  g.fillStyle = grd;
  for (let i = 0; i < 2; i++) {
    const y = i * 128;
    g.beginPath();
    g.moveTo(14, y + 100); g.lineTo(64, y + 40); g.lineTo(114, y + 100); g.lineTo(114, y + 124); g.lineTo(64, y + 64); g.lineTo(14, y + 124);
    g.closePath(); g.fill();
  }
  const t = tex(c);
  return t;
}

// Ground detail (tiling, multiplied by vertex colours on the terrain)
export function groundTexture(kind) {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256);
  if (kind === 'grass') {
    for (let i = 0; i < 5000; i++) {
      const l = 70 + Math.random() * 30;
      g.strokeStyle = `hsla(${90 + Math.random() * 30}, 40%, ${l}%, ${0.35 + Math.random() * 0.4})`;
      g.lineWidth = 1 + Math.random();
      const x = Math.random() * 256, y = Math.random() * 256;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 4, y - 3 - Math.random() * 5); g.stroke();
    }
  } else if (kind === 'sand') {
    noise(g, 256, 256, 9000, 0.14);
    g.strokeStyle = 'rgba(120,70,30,0.10)'; g.lineWidth = 3;
    for (let y = 0; y < 256; y += 22) { g.beginPath(); for (let x = 0; x <= 256; x += 8) g.lineTo(x, y + Math.sin(x / 20) * 5); g.stroke(); }
  } else {
    noise(g, 256, 256, 6000, 0.06);
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(170,200,230,${Math.random() * 0.25})`; g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 3, 0, 7); g.fill(); }
  }
  return tex(c);
}

export function waterTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 2;
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * 256, y = Math.random() * 256, w = 8 + Math.random() * 24;
    g.strokeStyle = `rgba(200,235,255,${0.3 + Math.random() * 0.5})`;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + w / 2, y - 3, x + w, y); g.stroke();
  }
  return tex(c);
}

export function softDot() {
  const [c, g] = canvas(64);
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.8)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return tex(c, { repeat: false });
}

export function nameplateTexture(name, color) {
  const [c, g] = canvas(256, 64);
  g.font = '800 34px Nunito, sans-serif';
  const w = Math.min(240, g.measureText(name).width + 36);
  const x = 128 - w / 2;
  g.fillStyle = 'rgba(20,14,40,0.72)';
  g.beginPath(); g.roundRect(x, 10, w, 44, 22); g.fill();
  g.fillStyle = color;
  g.beginPath(); g.arc(x + 20, 32, 8, 0, 7); g.fill();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(name, 128 + 8, 34, w - 44);
  return tex(c, { repeat: false });
}

export function ringTexture() {
  const [c, g] = canvas(128);
  const grd = g.createRadialGradient(64, 64, 20, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.7, 'rgba(255,255,255,0.55)');
  grd.addColorStop(0.85, 'rgba(255,255,255,0.9)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  return tex(c, { repeat: false });
}

// Painted concrete barrier: alternating colour blocks on top, weathered concrete below
export function wallTexture([a, b]) {
  const [c, g] = canvas(256, 128);
  g.fillStyle = '#c9ccd2'; g.fillRect(0, 0, 256, 128);
  noise(g, 256, 128, 3000, 0.1);
  for (let i = 0; i < 2; i++) { g.fillStyle = i ? b : a; g.fillRect(i * 128, 0, 128, 78); }
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, 78, 256, 4);
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 118, 256, 10);
  g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(0, 0, 256, 5);
  return tex(c);
}

export function bannerTexture(text, bg, fg, { w = 1024, h = 128, stripe = null } = {}) {
  const [c, g] = canvas(w, h);
  const grd = g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, bg[0]); grd.addColorStop(1, bg[1]);
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  if (stripe) { g.fillStyle = stripe; g.fillRect(0, 0, w, h * 0.1); g.fillRect(0, h * 0.9, w, h * 0.1); }
  g.font = `400 ${Math.round(h * 0.62)}px "Lilita One", Impact, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const reps = Math.max(1, Math.round(w / (g.measureText(text).width + h * 1.4)));
  for (let i = 0; i < reps; i++) {
    const x = ((i + 0.5) / reps) * w;
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillText(text, x + 3, h / 2 + 5);
    g.fillStyle = fg; g.fillText(text, x, h / 2 + 2);
  }
  return tex(c, { repeat: false });
}

export function itemBoxTexture() {
  const [c, g] = canvas(256);
  const grd = g.createLinearGradient(0, 0, 256, 256);
  ['#ff5ea8', '#ffb347', '#fff36b', '#6bffb0', '#5ed1ff', '#b07cff'].forEach((col, i, a) => grd.addColorStop(i / (a.length - 1), col));
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(22, 22, 212, 212);
  g.clearRect(34, 34, 188, 188);
  g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(34, 34, 188, 188);
  g.font = '400 170px "Lilita One", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 12; g.strokeStyle = 'rgba(40,20,90,0.55)'; g.strokeText('?', 128, 142);
  g.fillStyle = '#ffffff'; g.fillText('?', 128, 142);
  return tex(c, { repeat: false });
}

export function coinTexture() {
  const [c, g] = canvas(128);
  const grd = g.createRadialGradient(50, 45, 5, 64, 64, 64);
  grd.addColorStop(0, '#fff7c0'); grd.addColorStop(0.5, '#ffc933'); grd.addColorStop(1, '#d88a00');
  g.fillStyle = grd; g.beginPath(); g.arc(64, 64, 64, 0, 7); g.fill();
  g.strokeStyle = '#b36b00'; g.lineWidth = 8; g.beginPath(); g.arc(64, 64, 52, 0, 7); g.stroke();
  g.fillStyle = '#fff3a6';
  g.beginPath();
  for (let i = 0; i < 10; i++) { const r = i % 2 ? 16 : 34, a = -Math.PI / 2 + (i * Math.PI) / 5; g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); }
  g.closePath(); g.fill();
  return tex(c, { repeat: false });
}

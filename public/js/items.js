// Item boxes, coins, bananas and homing rockets.
import * as THREE from 'three';
import { model } from './assets.js';
import { itemBoxTexture, coinTexture } from './textures.js';
import { ITEMS } from './shared.js';
import { KART_RADIUS } from './kart.js';

const BOX_RESPAWN = 3.5, COIN_RESPAWN = 10;

function buildRocket() {
  const g = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: 0xff3b4e, roughness: 0.35, metalness: 0.3 });
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.6, 12).rotateX(Math.PI / 2), white);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.7, 12).rotateX(Math.PI / 2), red);
  nose.position.z = 1.15;
  g.add(body, nose);
  for (let i = 0; i < 4; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.5), red);
    fin.position.set(Math.cos((i * Math.PI) / 2) * 0.4, Math.sin((i * Math.PI) / 2) * 0.4, -0.6);
    fin.rotation.z = (i * Math.PI) / 2;
    g.add(fin);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export class ItemSystem {
  constructor(race) {
    this.race = race;
    const tr = race.track;
    this.scene = race.scene;
    this.boxes = [];
    this.coins = [];
    this.bananas = [];
    this.rockets = [];

    // shared visuals
    const boxTex = itemBoxTexture();
    const boxMat = new THREE.MeshStandardMaterial({ map: boxTex, emissive: 0xffffff, emissiveMap: boxTex, emissiveIntensity: 0.55, transparent: true, opacity: 0.88, roughness: 0.2, side: THREE.DoubleSide, depthWrite: false });
    const coreMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6c8, emissiveIntensity: 1.2, roughness: 0.3 });
    const boxGeo = new THREE.BoxGeometry(2, 2, 2), coreGeo = new THREE.IcosahedronGeometry(0.45, 0);
    const coinTex = coinTexture();
    const coinFace = new THREE.MeshStandardMaterial({ map: coinTex, metalness: 0.85, roughness: 0.25, emissive: 0x8a5a00, emissiveIntensity: 0.35 });
    const coinEdge = new THREE.MeshStandardMaterial({ color: 0xe0a100, metalness: 0.9, roughness: 0.3, emissive: 0x5a3a00, emissiveIntensity: 0.3 });
    const coinGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.2, 28).rotateX(Math.PI / 2);

    for (const f of tr.def.itemRows) {
      const idx = tr.wrap(Math.round(f * tr.N));
      for (const lat of [-6.5, -2.2, 2.2, 6.5]) {
        const p = tr.point(idx, lat);
        const m = new THREE.Group();
        const cube = new THREE.Mesh(boxGeo, boxMat);
        const core = new THREE.Mesh(coreGeo, coreMat);
        cube.renderOrder = 5;
        m.add(core, cube);
        m.position.set(p.x, p.y + 1.6, p.z);
        this.scene.add(m);
        this.boxes.push({ x: p.x, z: p.z, y: p.y, mesh: m, cube, core, t: 0, phase: Math.random() * 6 });
      }
    }
    for (const [f, lat] of tr.def.coinLines) {
      const base = Math.round(f * tr.N);
      for (let k = 0; k < 5; k++) {
        const p = tr.point(base + k * 5, lat);
        const m = new THREE.Mesh(coinGeo, [coinEdge, coinFace, coinFace]);
        m.castShadow = true;
        m.position.set(p.x, p.y + 1.1, p.z);
        this.scene.add(m);
        this.coins.push({ x: p.x, z: p.z, y: p.y, mesh: m, t: 0, phase: k * 0.5 });
      }
    }
  }

  roll(kart) {
    const ranked = this.race.ranking;
    const n = ranked.length;
    const r = n > 1 ? ranked.indexOf(kart) / (n - 1) : 0.5; // 0 leader .. 1 last
    const w = {
      banana: 3.2 - 2.4 * r,
      shield: 1.6 - 0.6 * r,
      turbo: 1.2 + 1.6 * r,
      triple: 0.1 + 2.6 * r * r,
      rocket: 0.3 + 2.4 * r,
    };
    if (r === 0) w.rocket = 0.15;
    let total = 0;
    for (const k in w) total += w[k];
    let x = Math.random() * total;
    for (const k in w) { x -= w[k]; if (x <= 0) return k; }
    return 'turbo';
  }

  use(kart) {
    if (!kart.item || kart.rollT > 0 || kart.spinT > 0) return;
    const it = kart.item;
    const ev = this.race.events;
    if (it === 'turbo' || it === 'triple') {
      kart.giveBoost(1.25, true);
      ev.emit('boost', kart);
    } else if (it === 'banana') {
      const fx = Math.sin(kart.heading), fz = Math.cos(kart.heading);
      this.dropBanana(kart.x - fx * 3.2, kart.z - fz * 3.2, kart);
      ev.emit('drop', kart);
    } else if (it === 'rocket') {
      this.fireRocket(kart);
      ev.emit('launch', kart);
    } else if (it === 'shield') {
      kart.shieldT = 9;
      ev.emit('shield', kart);
    }
    kart.itemCount--;
    if (kart.itemCount <= 0) { kart.item = null; kart.itemCount = 0; }
    ev.emit('itemchange', kart);
  }

  dropBanana(x, z, owner) {
    const m = model('banana', { size: 1.6, fit: 'height' });
    const tr = this.race.track, i = tr.nearest(x, z, owner.idx, 20);
    m.position.set(x, tr.heightAt(i, tr.along(x, z, i)) + 0.08, z);
    m.rotation.y = Math.random() * 6;
    this.scene.add(m);
    this.bananas.push({ x, z, mesh: m, owner, grace: 0.8 });
  }

  fireRocket(kart) {
    const ranked = this.race.ranking;
    const i = ranked.indexOf(kart);
    const target = i > 0 ? ranked[i - 1] : null;
    const m = buildRocket();
    this.scene.add(m);
    const tr = this.race.track;
    this.rockets.push({
      mesh: m, owner: kart, target, idx: kart.idx + 3, lat: kart.lat, prog: kart.progress + 3,
      x: kart.x, z: kart.z, life: target ? 9 : 3.5, grace: 0.3, tr,
    });
  }

  update(dt, t) {
    const race = this.race, karts = race.karts, ev = race.events, ps = race.particles;
    // boxes
    for (const b of this.boxes) {
      if (b.t > 0) {
        b.t -= dt;
        b.mesh.scale.setScalar(b.t > 0.35 ? 0.001 : Math.max(0.001, 1 - b.t / 0.35));
        continue;
      }
      b.mesh.scale.setScalar(1);
      b.cube.rotation.set(0.6 + Math.sin(t * 0.9 + b.phase) * 0.2, t * 1.2 + b.phase, 0.4);
      b.core.rotation.set(t * 2, t * 3, 0);
      b.mesh.position.y = b.y + 1.7 + Math.sin(t * 2.5 + b.phase) * 0.25;
      for (const k of karts) {
        if ((k.x - b.x) ** 2 + (k.z - b.z) ** 2 < (KART_RADIUS + 1.3) ** 2 && k.y < 2.5) {
          b.t = BOX_RESPAWN;
          for (let i = 0; i < 18; i++) {
            const c = [[0.4, 0.8, 1], [1, 0.5, 0.9], [1, 0.9, 0.3]][i % 3];
            ps.emit(b.x, b.y + 1.6, b.z, (Math.random() - 0.5) * 12, Math.random() * 8, (Math.random() - 0.5) * 12, { life: 0.6, size: 0.7, size1: 0.1, color: c, gravity: 10 });
          }
          if (!k.item && k.rollT <= 0) {
            k.rollT = 1.3;
            k.pending = this.roll(k);
            ev.emit('rolling', k);
          }
          break;
        }
      }
    }
    // item roulette
    for (const k of karts) {
      if (k.rollT > 0) {
        k.rollT -= dt;
        if (k.rollT <= 0) {
          k.item = k.pending; k.itemCount = ITEMS[k.item].count || 1;
          ev.emit('itemchange', k);
        }
      }
    }
    // coins
    for (const c of this.coins) {
      if (c.t > 0) { c.t -= dt; c.mesh.visible = c.t <= 0; continue; }
      c.mesh.rotation.y = t * 3 + c.phase;
      for (const k of karts) {
        if ((k.x - c.x) ** 2 + (k.z - c.z) ** 2 < (KART_RADIUS + 0.8) ** 2 && k.y < 2) {
          c.t = COIN_RESPAWN; c.mesh.visible = false;
          if (k.coins < 10) k.coins++;
          ev.emit('coin', k);
          for (let i = 0; i < 8; i++) ps.emit(c.x, c.y + 1, c.z, (Math.random() - 0.5) * 6, 3 + Math.random() * 4, (Math.random() - 0.5) * 6, { life: 0.5, size: 0.5, size1: 0.1, color: [1, 0.85, 0.2], gravity: 12 });
          break;
        }
      }
    }
    // bananas
    for (let i = this.bananas.length - 1; i >= 0; i--) {
      const b = this.bananas[i];
      b.grace -= dt;
      for (const k of karts) {
        if (k === b.owner && b.grace > 0) continue;
        if ((k.x - b.x) ** 2 + (k.z - b.z) ** 2 < (KART_RADIUS + 0.5) ** 2 && k.y < 1) {
          k.hit('banana');
          this.scene.remove(b.mesh);
          this.bananas.splice(i, 1);
          break;
        }
      }
    }
    // rockets
    const tr = this.race.track;
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.life -= dt; r.grace -= dt;
      const tgt = r.target && !r.target.finished ? r.target : null;
      let nx, nz;
      const close = tgt && Math.hypot(tgt.x - r.x, tgt.z - r.z) < 16;
      if (close) {
        const dx = tgt.x - r.x, dz = tgt.z - r.z, d = Math.hypot(dx, dz) || 1;
        nx = r.x + (dx / d) * 75 * dt; nz = r.z + (dz / d) * 75 * dt;
        r.idx = tr.nearest(nx, nz, Math.round(r.idx), 10);
      } else {
        r.idx += 68 * dt;
        if (tgt) r.lat += (tgt.lat - r.lat) * Math.min(1, dt * 1.5);
        const p = tr.point(r.idx, r.lat);
        nx = p.x; nz = p.z;
      }
      const hd = Math.atan2(nx - r.x, nz - r.z);
      r.x = nx; r.z = nz;
      const ry = tr.heightAt(Math.round(r.idx)) + 1.3;
      r.mesh.position.set(r.x, ry + Math.sin(t * 20) * 0.05, r.z);
      r.mesh.rotation.set(0, hd, t * 6);
      ps.emit(r.x - Math.sin(hd) * 1.2, ry, r.z - Math.cos(hd) * 1.2, (Math.random() - 0.5) * 2, 0.5, (Math.random() - 0.5) * 2, { life: 0.35, size: 0.9, size1: 0.2, color: [1, 0.6, 0.2], drag: 2 });
      ps.emit(r.x - Math.sin(hd) * 1.4, ry, r.z - Math.cos(hd) * 1.4, 0, 0.8, 0, { life: 1.1, size: 0.8, size1: 2.2, color: [0.85, 0.85, 0.88], alpha: 0.35, additive: false, drag: 1 });
      let boom = r.life <= 0;
      for (const k of karts) {
        if (k === r.owner && r.grace > 0) continue;
        if ((k.x - r.x) ** 2 + (k.z - r.z) ** 2 < (KART_RADIUS + 0.9) ** 2) { k.hit('rocket'); boom = true; break; }
      }
      for (let j = this.bananas.length - 1; j >= 0 && !boom; j--) {
        const b = this.bananas[j];
        if ((b.x - r.x) ** 2 + (b.z - r.z) ** 2 < 4) { this.scene.remove(b.mesh); this.bananas.splice(j, 1); boom = true; }
      }
      if (boom) {
        this.explode(r.x, r.z, ry);
        this.scene.remove(r.mesh);
        this.rockets.splice(i, 1);
      }
    }
  }

  explode(x, z, y = 0) {
    const ps = this.race.particles;
    for (let i = 0; i < 40; i++) {
      const c = Math.random() < 0.5 ? [1, 0.55, 0.1] : [1, 0.85, 0.3];
      ps.emit(x, y, z, (Math.random() - 0.5) * 18, Math.random() * 12, (Math.random() - 0.5) * 18, { life: 0.5 + Math.random() * 0.3, size: 1.4, size1: 0.2, color: c, drag: 3, gravity: 6 });
    }
    for (let i = 0; i < 14; i++) ps.emit(x, y, z, (Math.random() - 0.5) * 6, 2 + Math.random() * 3, (Math.random() - 0.5) * 6, { life: 1.4, size: 2, size1: 5, color: [0.4, 0.4, 0.45], alpha: 0.45, additive: false, drag: 1.5 });
    this.race.events.emit('explode', x, z);
  }
}

// Arcade kart physics + visuals.
import * as THREE from 'three';
import { kartMesh } from './assets.js';
import { KART_TYPES } from './shared.js';
import { ROAD_HALF_WIDTH as HW, CURB_WIDTH, WALL_DIST } from './tracks.js';
import { nameplateTexture } from './textures.js';

export const KART_RADIUS = 1.35;

// Stats (1–5) -> physics. Each stat is a trade: all karts total 15 points.
export function kartPhysics(stats) {
  const [sp, ac, ha, dr, we] = stats.map((s) => s - 3); // -2..+2
  return {
    maxSpeed: 34 + sp * 0.9,       // top speed
    accel: 20 + ac * 4.5,          // how fast you get there
    turn: 2.15 + ha * 0.1,         // steering rate (rad/s)
    grip: 10 + ha * 1.8,           // lateral grip
    // speed lost while cornering / drifting: handling (or drift) and momentum (weight) keep speed up
    scrub: (0.5 - ha * 0.12) * (1 - we * 0.16),
    driftScrub: (0.5 - dr * 0.12) * (1 - we * 0.16),
    driftTurn: 1.0 + dr * 0.06,    // drift tightness
    driftCharge: 1.0 + dr * 0.2,   // mini-turbo charge rate
    driftBoost: 1.0 + dr * 0.08,   // mini-turbo length
    mass: 1 + we * 0.32,           // bumping power
    offroad: 0.55 + we * 0.035,    // grass penalty (heavier ploughs through)
    spinTime: 1.15 - we * 0.12,    // recovery after a hit
    recover: 1 + ac * 0.12,        // (accel karts bounce back faster)
  };
}

const tmpV = new THREE.Vector3();

export class Kart {
  constructor({ index, name, color, type, isAI = false, human = null }, race) {
    this.index = index;
    this.name = name;
    this.color = color;
    this.type = KART_TYPES[type] || KART_TYPES[0];
    this.typeIndex = type;
    this.phys = kartPhysics(this.type.stats);
    this.isAI = isAI;
    this.human = human; // { viewIndex, source }
    this.race = race;
    this.track = race.track;

    // state
    this.x = 0; this.z = 0; this.y = 0; this.vy = 0; this.gy = 0; this.slope = 0;
    this.heading = 0; this.vx = 0; this.vz = 0; this.vf = 0; this.vl = 0;
    this.idx = 0; this.lat = 0; this.lap = 0; this.progress = 0;
    this.surface = 'road';
    this.steerVis = 0;
    this.drifting = false; this.driftDir = 0; this.driftCharge = 0; this.driftLevel = 0;
    this.boostT = 0; this.spinT = 0; this.spinAngle = 0; this.shieldT = 0; this.flashT = 0;
    this.item = null; this.itemCount = 0; this.rollT = 0;
    this.coins = 0;
    this.finished = false; this.finishTime = 0; this.place = 0;
    this.wrongWayT = 0; this.control = false;
    this.prevDrift = false; this.prevUse = false;
    this.speedMul = 1;
    this.lastLapTime = 0;
    this.wallCooldown = 0;

    this.buildMesh();
  }

  buildMesh() {
    const g = (this.group = new THREE.Group());
    this.body = new THREE.Group();
    g.add(this.body);
    const km = kartMesh(this.type.id, this.color);
    this.dims = km;
    this.body.add(km.group);
    this.wheels = km.wheels.map((w) => ({ node: w.node, front: w.front, radius: w.radius, q0: w.node.quaternion.clone() }));
    this.wheelR = this.wheels.length ? this.wheels.reduce((a, w) => a + w.radius, 0) / this.wheels.length : 0.4;

    // name tag (hidden from its own driver's camera via layers)
    // (skipped for CPU karts in the attract-mode demo)
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameplateTexture(this.name, this.color), depthTest: true, transparent: true, sizeAttenuation: false }));
    sp.scale.set(0.16, 0.04, 1); // constant on-screen size
    sp.position.y = 3.4;
    sp.layers.set(1 + this.index);
    if (!this.race.demo) g.add(sp);

    // shield bubble
    this.shield = new THREE.Mesh(new THREE.SphereGeometry(2.2, 24, 16), new THREE.MeshStandardMaterial({
      color: 0x7fd6ff, emissive: 0x3aa8ff, emissiveIntensity: 0.6, transparent: true, opacity: 0.28, depthWrite: false, roughness: 0.1,
    }));
    this.shield.position.y = 1.0;
    this.shield.visible = false;
    g.add(this.shield);
  }

  placeAt(slot) {
    this.x = slot.x; this.z = slot.z; this.heading = slot.heading;
    this.idx = slot.idx; this.vx = this.vz = this.vf = this.vl = 0;
    this.lap = 0; this.progress = this.idx;
    this.gy = this.track.py[this.idx];
    this.updateVisual(0, 0);
  }

  get fwdX() { return Math.sin(this.heading); }
  get fwdZ() { return Math.cos(this.heading); }
  get speed() { return Math.hypot(this.vx, this.vz); }

  giveBoost(t, strong = false) {
    this.boostT = Math.max(this.boostT, t);
    if (strong) this.vf = Math.max(this.vf, this.phys.maxSpeed * 1.2);
  }

  hit(kind) {
    if (this.finished) return false;
    if (this.shieldT > 0) { this.shieldT = 0; this.race.events.emit('shieldpop', this); return false; }
    this.spinT = this.phys.spinTime * (kind === 'rocket' ? 1.35 : 1);
    this.drifting = false; this.driftCharge = 0; this.boostT = 0;
    if (kind === 'rocket') this.vy = 9;
    const lost = Math.min(this.coins, 3);
    this.coins -= lost;
    this.race.events.emit('hit', this, kind, lost);
    return true;
  }

  step(dt, inp) {
    const P = this.phys, tr = this.track;
    const canDrive = this.control && this.spinT <= 0;
    const steer = canDrive ? inp.steer : 0;
    const gas = canDrive ? inp.gas : this.finished ? 0.5 : 0;
    const brake = canDrive ? inp.brake : 0;

    // --- timers
    this.boostT = Math.max(0, this.boostT - dt);
    this.shieldT = Math.max(0, this.shieldT - dt);
    this.wallCooldown = Math.max(0, this.wallCooldown - dt);
    if (this.spinT > 0) { this.spinT -= dt; this.spinAngle += dt * 13; }
    else this.spinAngle = 0;

    // --- where are we?
    const absLat = Math.abs(this.lat);
    this.surface = absLat < HW ? 'road' : absLat < HW + CURB_WIDTH ? 'curb' : 'grass';
    const grounded = this.y <= 0.001;

    // --- longitudinal
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const rx = -fz, rz = fx; // right
    let vf = this.vx * fx + this.vz * fz;
    let vl = this.vx * rx + this.vz * rz;
    let maxS = P.maxSpeed * (1 + this.coins * 0.012) * this.speedMul;
    const offroad = this.surface === 'grass' && this.boostT <= 0;
    if (offroad) maxS *= P.offroad;
    if (this.boostT > 0) maxS *= 1.38;

    // hills: climbing costs speed, descending adds it
    this.slope = tr.grade(this.idx) * (fx * tr.tx[this.idx] + fz * tr.tz[this.idx]);
    vf -= 13 * this.slope * dt;

    if (this.spinT > 0) vf *= Math.exp(-2.4 * dt);
    else if (this.boostT > 0) vf = Math.min(maxS, vf + 55 * dt);
    else if (brake > 0 && !gas) vf = vf > 0.5 ? vf - 40 * dt : Math.max(-11, vf - 16 * dt);
    else if (gas > 0) {
      if (vf < maxS) {
        const a = P.accel * (vf < 0 ? 2 : 1 - 0.62 * Math.max(0, vf) / maxS) * (brake ? 0 : gas);
        vf = Math.min(maxS, vf + a * dt);
      }
    } else vf -= Math.sign(vf) * Math.min(Math.abs(vf), 8 * dt);
    if (vf > maxS) vf = Math.max(maxS, vf - (vf - maxS) * (offroad ? 3.5 : 1.3) * dt);

    // --- drifting
    const driftPressed = canDrive && inp.drift;
    if (driftPressed && !this.prevDrift && grounded) this.vy = 4.2; // hop
    if (driftPressed && !this.drifting && Math.abs(steer) > 0.3 && vf > 13 && (grounded || this.vy < 0)) {
      this.drifting = true; this.driftDir = Math.sign(steer); this.driftCharge = 0; this.driftLevel = 0;
    }
    if (this.drifting && (!driftPressed || vf < 9)) {
      if (this.driftLevel > 0 && driftPressed === false && this.spinT <= 0) {
        this.giveBoost([0, 0.55, 0.95, 1.45][this.driftLevel] * P.driftBoost);
        this.race.events.emit('miniturbo', this, this.driftLevel);
      }
      this.drifting = false; this.driftLevel = 0; this.driftCharge = 0;
    }
    this.prevDrift = driftPressed;

    // --- steering
    const spd01 = Math.min(1, Math.abs(vf) / 9);
    let yaw;
    if (this.drifting) {
      const s = this.driftDir * (0.95 + 0.6 * steer * this.driftDir);
      yaw = -s * P.turn * 0.97 * P.driftTurn;
      this.driftCharge += dt * P.driftCharge * (0.55 + 0.45 * Math.abs(steer));
      const lvl = this.driftCharge > 2.9 ? 3 : this.driftCharge > 1.7 ? 2 : this.driftCharge > 0.75 ? 1 : 0;
      if (lvl > this.driftLevel) { this.driftLevel = lvl; this.race.events.emit('driftlevel', this, lvl); }
    } else {
      yaw = -steer * P.turn * spd01 * (1 - 0.3 * Math.min(1, Math.abs(vf) / P.maxSpeed)) * (vf < -0.5 ? -1 : 1);
    }
    if (this.surface === 'grass') yaw *= 0.9;
    // cornering costs momentum — handling (or drift, while sliding) decides how much
    if (vf > 5 && this.boostT <= 0) vf *= Math.exp(-(this.drifting ? P.driftScrub : P.scrub * Math.abs(steer)) * spd01 * dt);

    // --- lateral grip
    const grip = this.drifting ? 2.2 : this.spinT > 0 ? 1.5 : P.grip * (this.surface === 'grass' ? 0.7 : 1);
    vl *= Math.exp(-grip * dt);

    this.vx = fx * vf + rx * vl;
    this.vz = fz * vf + rz * vl;
    this.vf = vf; this.vl = vl;
    this.heading += yaw * dt;
    this.steerVis += ((this.drifting ? this.driftDir * 0.6 + steer * 0.4 : steer) - this.steerVis) * Math.min(1, dt * 12);

    // --- integrate
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.vy -= 30 * dt;
    this.y = Math.max(0, this.y + this.vy * dt);
    if (this.y === 0 && this.vy < 0) this.vy = 0;

    // --- track bookkeeping + walls
    const prev = this.idx;
    this.idx = tr.nearest(this.x, this.z, this.idx, 12);
    this.lat = tr.lateral(this.x, this.z, this.idx);
    const lim = WALL_DIST - KART_RADIUS + 0.3;
    if (Math.abs(this.lat) > lim) {
      const s = Math.sign(this.lat), nx = tr.nx[this.idx] * s, nz = tr.nz[this.idx] * s;
      const over = Math.abs(this.lat) - lim;
      this.x -= nx * over; this.z -= nz * over;
      this.lat = s * lim;
      const vn = this.vx * nx + this.vz * nz;
      if (vn > 0) {
        this.vx -= nx * vn * 1.35; this.vz -= nz * vn * 1.35;
        const tang = this.vx * tr.tx[this.idx] + this.vz * tr.tz[this.idx];
        const damp = Math.max(0.55, 1 - vn / 60);
        this.vx *= damp; this.vz *= damp;
        if (vn > 5 && this.wallCooldown <= 0) { this.wallCooldown = 0.35; this.race.events.emit('wall', this, vn, nx, nz); }
        // align heading a little with the wall so you don't get stuck
        if (Math.abs(tang) > 5 && this.spinT <= 0) {
          const want = Math.atan2(tr.tx[this.idx] * Math.sign(tang), tr.tz[this.idx] * Math.sign(tang));
          let d = want - this.heading; d = Math.atan2(Math.sin(d), Math.cos(d));
          this.heading += d * Math.min(1, dt * 2.5);
        }
      }
    }
    const N = tr.N;
    if (prev > N * 0.75 && this.idx < N * 0.25) this.race.onCrossLine(this, +1);
    else if (prev < N * 0.25 && this.idx > N * 0.75) this.race.onCrossLine(this, -1);
    const along = tr.along(this.x, this.z, this.idx);
    this.progress = this.lap * N + this.idx + along;
    this.gy = tr.heightAt(this.idx, along);

    // wrong way?
    const vt = this.vx * tr.tx[this.idx] + this.vz * tr.tz[this.idx];
    const faceT = fx * tr.tx[this.idx] + fz * tr.tz[this.idx];
    this.wrongWayT = (faceT < -0.4 && vt < 1 && this.control && !this.finished) ? this.wrongWayT + dt : 0;
  }

  updateVisual(dt, t) {
    const g = this.group;
    g.position.set(this.x, this.gy + this.y, this.z);
    g.rotation.order = 'YXZ';
    g.rotation.y = this.heading + this.spinAngle;
    g.rotation.x += (-Math.atan(this.slope) - g.rotation.x) * Math.min(1, dt * 10);
    const drift = this.drifting ? this.driftDir : 0;
    const b = this.body;
    const k = Math.min(1, dt * 10);
    b.rotation.y += (-drift * 0.42 - b.rotation.y) * k;
    const spd = this.speed;
    const lean = -this.steerVis * Math.min(1, spd / 25) * 0.07;
    b.rotation.z += (lean - b.rotation.z) * k;
    const bump = this.surface === 'curb' || this.surface === 'grass' ? Math.sin(t * 60 + this.index) * 0.03 * Math.min(1, spd / 10) : 0;
    b.position.y = bump + Math.sin(t * 22 + this.index) * 0.01 * Math.min(1, spd / 10);
    b.rotation.x += ((this.boostT > 0 ? -0.05 : 0) - b.rotation.x) * k;

    // wheels
    this.wheelSpin = (this.wheelSpin || 0) + (this.vf * dt) / this.wheelR;
    const qs = new THREE.Quaternion(), qy = new THREE.Quaternion();
    for (const w of this.wheels) {
      qs.setFromAxisAngle(tmpV.set(1, 0, 0), this.wheelSpin);
      qy.setFromAxisAngle(tmpV.set(0, 1, 0), w.front ? -this.steerVis * 0.45 : 0);
      w.node.quaternion.copy(qy).multiply(qs).multiply(w.q0);
    }
    this.shield.visible = this.shieldT > 0;
    if (this.shield.visible) this.shield.material.opacity = 0.22 + Math.sin(t * 8) * 0.06 + (this.shieldT < 1.5 ? (Math.sin(t * 30) > 0 ? 0.1 : -0.1) : 0);
  }

  emitParticles(ps, dt, theme) {
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading), rx = -fz, rz = fx;
    const spd = this.speed, gy = this.gy;
    const hl = this.dims.L * 0.4, hw = this.dims.W * 0.38;
    const rear = (side) => ({ x: this.x - fx * hl + rx * side * hw, z: this.z - fz * hl + rz * side * hw });
    if (this.drifting && this.y < 0.2) {
      const cols = [[1, 0.95, 0.7], [0.35, 0.7, 1], [1, 0.55, 0.12], [0.85, 0.35, 1]];
      const c = cols[this.driftLevel];
      for (const side of [-1, 1]) {
        const p = rear(side);
        const n = this.driftLevel ? 3 : 1;
        for (let i = 0; i < n; i++) {
          ps.emit(p.x, gy + 0.3, p.z, (Math.random() - 0.5) * 6 - fx * 4, 2 + Math.random() * 4, (Math.random() - 0.5) * 6 - fz * 4,
            { life: 0.25 + Math.random() * 0.2, size: this.driftLevel ? 0.55 : 0.3, size1: 0.05, color: c, gravity: 14, drag: 2 });
        }
        if (Math.random() < 0.5) ps.emit(p.x, gy + 0.4, p.z, -fx * 2, 1.2, -fz * 2, { life: 0.9, size: 0.9, size1: 2.6, color: [0.92, 0.92, 0.95], alpha: 0.35, additive: false, drag: 1.5 });
      }
    }
    if (this.boostT > 0) {
      const ex = this.x - fx * this.dims.L * 0.52, ez = this.z - fz * this.dims.L * 0.52;
      for (let i = 0; i < 3; i++) {
        ps.emit(ex + (Math.random() - 0.5) * 0.4, gy + this.dims.H * 0.35 + Math.random() * 0.2, ez + (Math.random() - 0.5) * 0.4,
          -fx * (8 + Math.random() * 6) + this.vx * 0.6, 0.5 + Math.random(), -fz * (8 + Math.random() * 6) + this.vz * 0.6,
          { life: 0.22 + Math.random() * 0.1, size: 1.1, size1: 0.2, color: Math.random() < 0.5 ? [1, 0.6, 0.15] : [1, 0.9, 0.4], drag: 3 });
      }
    }
    if (this.surface === 'grass' && spd > 8 && Math.random() < 0.5) {
      const p = rear(Math.random() < 0.5 ? -1 : 1);
      const c = (this._dust ||= new THREE.Color(theme.ground[1]).lerp(new THREE.Color(0xf2ead8), 0.55));
      ps.emit(p.x, gy + 0.3, p.z, (Math.random() - 0.5) * 3, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 3,
        { life: 0.6, size: 0.6, size1: 1.6, color: [c.r, c.g, c.b], alpha: 0.3, additive: false, drag: 2, gravity: 2 });
    }
    if (this.spinT > 0 && Math.random() < 0.6) {
      ps.emit(this.x, gy + 1.5, this.z, (Math.random() - 0.5) * 3, 3, (Math.random() - 0.5) * 3, { life: 0.6, size: 0.5, size1: 0.1, color: [1, 1, 0.5], gravity: 4 });
    }
  }
}

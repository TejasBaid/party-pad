// One race: world, karts, items, AI, split-screen cameras and HUD.
import * as THREE from 'three';
import { Track, buildWorld } from './world.js';
import { WALL_DIST } from './tracks.js';
import { Kart } from './kart.js';
import { ItemSystem } from './items.js';
import { AIDriver } from './ai.js';
import { Particles } from './particles.js';
import { HUD } from './hud.js';
import { sfx, Engine, startMusic } from './audio.js';
import { ordinal } from './shared.js';

class Emitter {
  constructor() { this.h = {}; }
  on(n, f) { (this.h[n] ||= []).push(f); }
  emit(n, ...a) { (this.h[n] || []).forEach((f) => f(...a)); }
}
const lerpAngle = (a, b, t) => { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * t; };
const COUNTDOWN = 4;

export class Race {
  /**
   * racers: [{ name, color, type, human?: { id } }]
   */
  constructor({ renderer, trackDef, racers, laps = 3, difficulty = 'normal', demo = false, hudRoot, onEvent = () => {}, onFinish = () => {} }) {
    this.renderer = renderer;
    this.laps = laps;
    this.demo = demo;
    this.onEvent = onEvent;
    this.onFinish = onFinish;
    this.events = new Emitter();
    this.time = 0; this.raceTime = 0;
    this.phase = 'countdown';
    this.ended = false;

    this.track = new Track(trackDef);
    this.theme = trackDef.theme;
    this.world = buildWorld(this.track, renderer);
    this.scene = this.world.scene;
    renderer.toneMappingExposure = trackDef.theme.exposure;
    this.particles = new Particles(5000);
    this.particles.addTo(this.scene);

    // grid: bots in front, humans at the back (classic kart-racer start)
    const bots = racers.filter((r) => !r.human), humans = racers.filter((r) => r.human);
    const order = [...bots.sort(() => Math.random() - 0.5), ...humans];
    this.karts = order.map((r, i) => {
      const k = new Kart({ index: i, name: r.name, color: r.color, type: r.type, isAI: !r.human, human: r.human || null }, this);
      k.placeAt(this.track.gridSlot(i));
      this.scene.add(k.group);
      return k;
    });
    this.humans = this.karts.filter((k) => !k.isAI).sort((a, b) => a.human.slot - b.human.slot);
    this.ais = new Map(this.karts.filter((k) => k.isAI).map((k) => [k, new AIDriver(k, difficulty)]));
    this.ranking = [...this.karts];
    this.items = new ItemSystem(this);

    this.hud = new HUD(hudRoot);
    this.hud.drawMapBackground(this.track);
    this.hud.mapWrap.style.display = demo ? 'none' : '';
    hudRoot.classList.toggle('demo', demo);

    this.views = this.humans.map((k) => this.makeView(k));
    if (this.views.length === 3 || this.views.length === 0) this.views.push(this.makeView(null));
    this.engines = demo ? [] : this.humans.map((k, i) => new Engine(0.9 + i * 0.08));
    this.wire();
  }

  makeView(kart) {
    const cam = new THREE.PerspectiveCamera(70, 1, 0.3, 4000);
    cam.layers.enableAll();
    if (kart) cam.layers.disable(1 + kart.index);
    const v = { cam, kart, h: kart ? kart.heading : 0, pos: new THREE.Vector3(), fov: 70, cine: { mode: 0, t: 0, target: null, anchor: null } };
    if (kart) {
      v.pos.set(kart.x - Math.sin(kart.heading) * 8, kart.gy + 3.3, kart.z - Math.cos(kart.heading) * 8);
    }
    return v;
  }

  wire() {
    const E = this.events, ps = this.particles;
    const human = (k) => k && !k.isAI && !this.demo;
    const msg = (k, html, t = 1.6) => { k.msg = html; k.msgT = t; };
    E.on('wall', (k, vn, nx, nz) => {
      for (let i = 0; i < 12; i++) ps.emit(k.x + nx * 1.3, k.gy + 0.8, k.z + nz * 1.3, (Math.random() - 0.5) * 10 - nx * 4, Math.random() * 6, (Math.random() - 0.5) * 10 - nz * 4, { life: 0.35, size: 0.4, size1: 0.05, color: [1, 0.8, 0.4], gravity: 16 });
      if (human(k)) { sfx.wall(); this.onEvent('buzz', k, Math.min(120, 30 + vn * 4)); }
    });
    E.on('hit', (k, kind) => {
      if (human(k)) { sfx.spin(); k.flashT = 0.5; this.onEvent('buzz', k, [120, 60, 200]); msg(k, `<span class="warn">${kind === 'rocket' ? 'KABOOM!' : 'SPLAT!'}</span>`, 1.1); }
    });
    E.on('shieldpop', (k) => { if (human(k)) sfx.shield(); for (let i = 0; i < 20; i++) ps.emit(k.x, k.gy + 1.2, k.z, (Math.random() - 0.5) * 10, Math.random() * 6, (Math.random() - 0.5) * 10, { life: 0.5, size: 0.6, size1: 0.1, color: [0.5, 0.85, 1] }); });
    E.on('miniturbo', (k, lvl) => { if (human(k)) { sfx.miniturbo(lvl); this.onEvent('buzz', k, 25); } });
    E.on('driftlevel', (k, lvl) => { if (human(k)) this.onEvent('buzz', k, 15 + lvl * 5); });
    E.on('boost', (k) => { if (human(k)) sfx.boost(); });
    E.on('pad', (k) => { if (human(k)) { sfx.boost(); this.onEvent('buzz', k, 30); } });
    E.on('coin', (k) => { if (human(k)) sfx.coin(); });
    E.on('rolling', (k) => { if (human(k)) this.onEvent('item', k); });
    E.on('itemchange', (k) => { if (human(k)) { if (k.item && k.rollT <= 0) sfx.item(); this.onEvent('item', k); } });
    E.on('launch', (k) => { if (human(k)) sfx.launch(); });
    E.on('drop', (k) => { if (human(k)) sfx.drop(); });
    E.on('shield', (k) => { if (human(k)) sfx.shield(); });
    E.on('explode', () => { if (!this.demo) sfx.explode(); });
    E.on('bump', (a, b, j) => {
      if ((human(a) || human(b)) && j > 6) sfx.bump();
      for (const k of [a, b]) if (human(k)) this.onEvent('buzz', k, 40);
    });
    E.on('lap', (k) => { if (human(k)) { sfx.lap(); msg(k, `<span class="big">LAP ${k.lap}</span>`); } });
    E.on('finallap', (k) => { if (human(k)) { sfx.finalLap(); msg(k, '<span class="big final">FINAL LAP!</span>', 2.2); startMusic(true); } });
    E.on('finish', (k) => {
      if (human(k)) { sfx.finish(); this.onEvent('buzz', k, [80, 60, 80, 60, 300]); }
      this.onEvent('finish', k);
    });
  }

  placeOf(k) { return this.ranking.indexOf(k) + 1; }

  setLights(n, color = 0xff2030) {
    this.world.startLights.forEach((m, i) => {
      m.material.emissive.setHex(color);
      m.material.emissiveIntensity = i < n ? 3 : 0;
    });
  }

  onCrossLine(k, dir) {
    if (!this.demo && this.phase === 'countdown') return;
    k.lap += dir;
    if (dir < 0) return;
    k.maxLap = k.maxLap || 0;
    if (k.lap <= k.maxLap) return;
    k.maxLap = k.lap;
    if (k.lap > this.laps) return this.finishKart(k);
    if (k.lap === this.laps && this.laps > 1) this.events.emit('finallap', k);
    else if (k.lap > 1) this.events.emit('lap', k);
    this.onEvent('lap', k);
  }

  finishKart(k) {
    if (k.finished) return;
    k.finished = true;
    k.finishTime = this.raceTime;
    k.place = this.karts.filter((x) => x.finished).length;
    if (!k.isAI) {
      // autopilot takes over for the victory lap
      this.ais.set(k, new AIDriver(k, 'easy'));
      if (!this.firstHumanFinish) this.firstHumanFinish = this.raceTime;
    }
    this.events.emit('finish', k);
  }

  // ------------------------------------------------------------ update
  update(dt, getInput) {
    dt = Math.min(dt, 1 / 20);
    this.time += dt;
    if (this.phase === 'countdown') {
      const t = this.time;
      const n = Math.ceil(COUNTDOWN - t);
      if (!this.demo) {
        if (n !== this.lastN && n <= 3 && n >= 1) { this.lastN = n; sfx.beep(); this.setLights(4 - n, 0xff2030); this.hud.showCountdown(`<div class="lights">${[3, 2, 1].map((i) => `<i class="${i >= n ? 'on' : ''}"></i>`).join('')}</div><b>${n}</b>`, 'pop'); this.onEvent('countdown', null, n); }
        else if (n > 3 && this.lastN == null) this.hud.showCountdown(`<div class="lights"><i></i><i></i><i></i></div><b class="ready">GET READY</b>`, 'pop');
      }
      if (t >= COUNTDOWN || this.demo) {
        this.phase = 'race';
        for (const k of this.karts) k.control = true;
        if (!this.demo) {
          sfx.go();
          this.setLights(3, 0x20ff60);
          setTimeout(() => this.setLights(0), 2500);
          this.hud.showCountdown('<div class="lights go"><i class="on"></i><i class="on"></i><i class="on"></i></div><b class="go">GO!</b>', 'pop go');
          setTimeout(() => this.hud.hideCountdown(), 900);
          this.onEvent('go');
          // rocket start: holding gas at GO
          for (const k of this.humans) { if (getInput(k.human.id).gas) k.giveBoost(0.5); }
        }
      }
    }
    if (this.phase === 'race') this.raceTime += dt;

    // physics substeps
    const steps = Math.ceil(dt / (1 / 120));
    const h = dt / steps;
    const inputs = new Map();
    for (const k of this.karts) {
      const ai = this.ais.get(k);
      let inp;
      if (ai) inp = ai.update(dt, this);
      else inp = getInput(k.human.id);
      inputs.set(k, inp);
      // item use: counters for humans, pulses for AI
      const uses = ai ? (inp.use ? (k.aiUse = (k.aiUse || 0) + 1) : k.aiUse || 0) : inp.useCount || 0;
      if (k.lastUse == null) k.lastUse = uses;
      if (uses !== k.lastUse) { k.lastUse = uses; if (this.phase === 'race' && !k.finished) this.items.use(k); }
    }
    for (let s = 0; s < steps; s++) {
      for (const k of this.karts) k.step(h, inputs.get(k));
      this.collideKarts();
    }
    this.checkPads(dt);
    this.items.update(dt, this.time);

    // ranking
    this.ranking.sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      return b.progress - a.progress;
    });

    for (const k of this.karts) {
      k.updateVisual(dt, this.time);
      k.emitParticles(this.particles, dt, this.theme);
      if (k.msgT > 0) k.msgT -= dt;
    }
    this.particles.update(dt);
    this.world.update(this.time, dt);

    this.humans.forEach((k, i) => this.engines[i]?.set(Math.min(1, k.speed / 40), getInput(k.human.id).gas && k.control ? 1 : 0, k.boostT > 0));

    // end of race
    if (!this.demo && !this.ended && this.humans.length) {
      const allDone = this.humans.every((k) => k.finished);
      const timeout = this.firstHumanFinish && this.raceTime - this.firstHumanFinish > 35;
      if (allDone || timeout) {
        this.ended = true;
        setTimeout(() => this.onFinish(this.results()), allDone ? 3500 : 500);
      }
    }
    if (this.demo && this.ranking[0].lap > this.laps) this.demoDone = true;
  }

  results() {
    return this.ranking.map((k, i) => ({
      place: i + 1, name: k.name, color: k.color, kart: k.type.name, ai: k.isAI, humanId: k.human?.id,
      time: k.finished ? k.finishTime : null, coins: k.coins,
    }));
  }

  // Each kart is two circles (nose and tail) so long karts don't overlap end-to-end.
  collideKarts() {
    const ks = this.karts, R = 1.05;
    const pts = ks.map((k) => {
      const o = Math.max(0, k.dims.L / 2 - R), fx = Math.sin(k.heading) * o, fz = Math.cos(k.heading) * o;
      return [[k.x + fx, k.z + fz], [k.x - fx, k.z - fz]];
    });
    for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) {
      const a = ks[i], b = ks[j];
      if (Math.abs(a.y - b.y) > 1.5 || (a.x - b.x) ** 2 + (a.z - b.z) ** 2 > 36) continue;
      let best = null;
      for (const pa of pts[i]) for (const pb of pts[j]) {
        const dx = pb[0] - pa[0], dz = pb[1] - pa[1], d2 = dx * dx + dz * dz;
        if (d2 < 4 * R * R && d2 > 1e-6 && (!best || d2 < best.d2)) best = { dx, dz, d2 };
      }
      if (!best) continue;
      const d = Math.sqrt(best.d2), nx = best.dx / d, nz = best.dz / d, over = 2 * R - d;
      const ma = a.phys.mass, mb = b.phys.mass, tot = ma + mb;
      a.x -= nx * over * (mb / tot); a.z -= nz * over * (mb / tot);
      b.x += nx * over * (ma / tot); b.z += nz * over * (ma / tot);
      const vrel = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
      if (vrel < 0) {
        const j2 = (-(1 + 0.6) * vrel) / (1 / ma + 1 / mb);
        a.vx -= (j2 / ma) * nx; a.vz -= (j2 / ma) * nz;
        b.vx += (j2 / mb) * nx; b.vz += (j2 / mb) * nz;
        if (-vrel > 4) {
          this.events.emit('bump', a, b, -vrel);
          const cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2;
          for (let s = 0; s < 8; s++) this.particles.emit(cx, (a.gy + b.gy) / 2 + 0.9, cz, (Math.random() - 0.5) * 8, Math.random() * 5, (Math.random() - 0.5) * 8, { life: 0.3, size: 0.4, size1: 0.05, color: [1, 0.9, 0.5], gravity: 14 });
        }
      }
    }
  }

  checkPads(dt) {
    const N = this.track.N;
    for (const k of this.karts) {
      k.padCool = Math.max(0, (k.padCool || 0) - dt);
      if (k.padCool > 0 || k.y > 0.5) continue;
      for (const p of this.world.pads) {
        let di = k.idx - p.idx; di = ((di % N) + N + N / 2) % N - N / 2;
        if (Math.abs(di) < p.halfLen && Math.abs(k.lat - p.lat) < p.halfW) {
          k.giveBoost(1.1, true); k.padCool = 0.6;
          this.events.emit('pad', k);
        }
      }
    }
  }

  // ------------------------------------------------------------ cameras
  updateCameras(dt) {
    for (const v of this.views) {
      if (v.kart) this.chaseCam(v, dt);
      else this.cinemaCam(v, dt);
    }
  }

  chaseCam(v, dt) {
    const k = v.kart, cam = v.cam, track = this.track;
    if (k.finished && this.raceTime - k.finishTime > 1.2) {
      v.orbit = (v.orbit ?? k.heading + Math.PI) + dt * 0.35;
      const want = new THREE.Vector3(k.x + Math.sin(v.orbit) * 9, k.gy + 3.6, k.z + Math.cos(v.orbit) * 9);
      v.pos.lerp(want, 1 - Math.exp(-dt * 3));
      cam.position.copy(v.pos);
      cam.lookAt(k.x, k.gy + 1.2, k.z);
      return;
    }
    // Everything the camera follows is low-pass filtered so bumps, wall scrapes and crests don't shake the view.
    v.h = lerpAngle(v.h, k.heading, 1 - Math.exp(-dt * (k.spinT > 0 ? 1.2 : 6.5)));
    v.gy = v.gy == null ? k.gy : v.gy + (k.gy - v.gy) * (1 - Math.exp(-dt * 5));
    const spd = k.speed;
    const dist = 6.6 + Math.min(1, spd / 40) * 1.2 + (k.boostT > 0 ? 0.8 : 0);
    const fx = Math.sin(v.h), fz = Math.cos(v.h);
    const want = new THREE.Vector3(k.x - fx * dist, v.gy + 2.9 + k.y * 0.3, k.z - fz * dist);
    const lookWant = new THREE.Vector3(k.x + fx * 4.5, v.gy + 1.3 + track.grade(k.idx) * 4.5, k.z + fz * 4.5);
    // intro swoop during the countdown
    if (this.phase === 'countdown') {
      const e = Math.min(1, this.time / (COUNTDOWN - 0.6));
      const ease = 1 - Math.pow(1 - e, 3);
      const a = k.heading + (1 - ease) * 2.4;
      const r = dist + (1 - ease) * 10;
      want.set(k.x - Math.sin(a) * r, k.gy + 2.9 + (1 - ease) * 9, k.z - Math.cos(a) * r);
      v.pos.copy(want);
      v.look = lookWant.clone();
    } else {
      v.pos.lerp(want, 1 - Math.exp(-dt * 9));
      v.look = v.look ? v.look.lerp(lookWant, 1 - Math.exp(-dt * 12)) : lookWant.clone();
    }
    cam.position.copy(v.pos);
    cam.lookAt(v.look);
    const fovT = 68 + Math.min(1, spd / 38) * 7 + (k.boostT > 0 ? 9 : 0);
    v.fov += (fovT - v.fov) * (1 - Math.exp(-dt * 4));
    cam.fov = v.fov;
  }

  cinemaCam(v, dt) {
    const c = v.cine, cam = v.cam, tr = this.track;
    c.t -= dt;
    if (c.t <= 0 || !c.target) {
      c.mode = (c.mode + 1) % 4;
      c.t = 5 + Math.random() * 3;
      const pool = this.demo ? this.karts : this.ranking.filter((k) => !k.finished);
      c.target = this.demo ? pool[Math.floor(Math.random() * pool.length)] : pool[0] || this.ranking[0];
      const k = c.target;
      const ahead = tr.wrap(k.idx + 55 + Math.floor(Math.random() * 30));
      const side = Math.random() < 0.5 ? -1 : 1;
      const p = tr.point(ahead, side * (WALL_DIST + 5));
      c.anchor = new THREE.Vector3(p.x, p.y + 2.5 + Math.random() * 5, p.z);
      c.side = side;
      v.pos.set(k.x - Math.sin(k.heading) * 12, k.gy + 6, k.z - Math.cos(k.heading) * 12);
      v.h = k.heading;
    }
    const k = c.target;
    v.h = lerpAngle(v.h, k.heading, 1 - Math.exp(-dt * 3));
    const fx = Math.sin(v.h), fz = Math.cos(v.h), rx = -fz, rz = fx;
    let want, look = new THREE.Vector3(k.x, k.gy + 1.2, k.z), fov = 55; const gy = k.gy;
    if (c.mode === 0) { want = new THREE.Vector3(k.x - fx * 12, gy + 5.5, k.z - fz * 12); look.set(k.x + fx * 6, gy + 1.5, k.z + fz * 6); fov = 62; }
    else if (c.mode === 1) { want = new THREE.Vector3(k.x + rx * 7 * c.side + fx * 2, gy + 1.8, k.z + rz * 7 * c.side + fz * 2); fov = 50; }
    else if (c.mode === 2) { want = c.anchor; fov = 34; }
    else { want = new THREE.Vector3(k.x - fx * 22, gy + 16, k.z - fz * 22); look.set(k.x + fx * 10, gy, k.z + fz * 10); fov = 55; }
    if (c.mode === 2) v.pos.copy(want); else v.pos.lerp(want, 1 - Math.exp(-dt * 5));
    cam.position.copy(v.pos);
    cam.lookAt(look);
    cam.fov += (fov - cam.fov) * (1 - Math.exp(-dt * 3));
  }

  // ------------------------------------------------------------ rendering
  layout(w, h) {
    const n = this.views.length;
    let rects;
    if (n <= 1) rects = [{ x: 0, y: 0, w, h }];
    else if (n === 2) rects = [{ x: 0, y: 0, w, h: h / 2 }, { x: 0, y: h / 2, w, h: h / 2 }];
    else rects = [0, 1, 2, 3].map((i) => ({ x: (i % 2) * (w / 2), y: Math.floor(i / 2) * (h / 2), w: w / 2, h: h / 2 }));
    this.rects = rects.map((r) => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) }));
    this.hud.setViews(this.rects, this.views.map((v) => v.kart));
    this.hud.placeMinimap(n <= 1 ? 1 : n === 2 ? 2 : 4, w, h);
    this.W = w; this.H = h;
  }

  render(dt) {
    const r = this.renderer;
    if (!this.rects) return;
    this.updateCameras(dt);
    r.setScissorTest(true);
    r.shadowMap.needsUpdate = true;
    const pr = r.getPixelRatio();
    this.views.forEach((v, i) => {
      const rc = this.rects[i];
      if (!rc) return;
      const y = this.H - rc.y - rc.h;
      r.setViewport(rc.x, y, rc.w, rc.h);
      r.setScissor(rc.x, y, rc.w, rc.h);
      v.cam.aspect = rc.w / rc.h;
      v.cam.updateProjectionMatrix();
      this.particles.setViewportHeight(rc.h * pr / (2 * Math.tan(THREE.MathUtils.degToRad(v.cam.fov) / 2)) / 0.9);
      r.render(this.scene, v.cam);
    });
    r.setScissorTest(false);
    if (!this.demo) this.hud.mapWrap.style.opacity = this.phase === 'countdown' ? 0 : 1;
    this.hud.update(this);
    if (!this.demo) this.hud.drawMap(this.karts);
  }

  dispose() {
    for (const e of this.engines) e.stop();
    this.hud.destroy();
    this.world.dispose();
  }
}

export { ordinal };

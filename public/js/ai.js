// CPU drivers: follow a racing line with a personal lane offset, drift big corners, use items sensibly.
import { ROAD_HALF_WIDTH as HW } from './tracks.js';

const DIFFICULTY = {
  easy:   { speed: 0.86, drift: 0.2, itemDelay: 2.5, noise: 0.25 },
  normal: { speed: 0.95, drift: 0.6, itemDelay: 1.2, noise: 0.12 },
  hard:   { speed: 1.0,  drift: 1.0, itemDelay: 0.5, noise: 0.05 },
};

export class AIDriver {
  constructor(kart, difficulty = 'normal') {
    this.kart = kart;
    this.cfg = DIFFICULTY[difficulty] || DIFFICULTY.normal;
    this.lane = (Math.random() * 2 - 1) * HW * 0.4;
    this.laneTarget = this.lane;
    this.laneTimer = 2 + Math.random() * 3;
    this.itemTimer = 0;
    this.wobble = Math.random() * 10;
    this.input = { steer: 0, gas: 1, brake: 0, drift: false };
    this.driftHold = 0;
  }

  update(dt, race) {
    const k = this.kart, tr = race.track, cfg = this.cfg;
    const inp = this.input;

    // rubber-banding relative to the human leader (keeps races close, never cheats hard)
    const humans = race.karts.filter((x) => !x.isAI);
    let band = 1;
    if (humans.length) {
      const lead = Math.max(...humans.map((h) => h.progress));
      const gap = k.progress - lead; // + ahead of best human
      band = gap > 60 ? 0.93 : gap < -120 ? 1.06 : 1;
    }
    k.speedMul = cfg.speed * band;

    // lane changes, and dodge bananas
    this.laneTimer -= dt;
    if (this.laneTimer <= 0) { this.laneTarget = (Math.random() * 2 - 1) * HW * 0.5; this.laneTimer = 2 + Math.random() * 4; }
    for (const b of race.items.bananas) {
      const bi = tr.nearest(b.x, b.z, k.idx, 40);
      const ahead = tr.wrap(bi - k.idx);
      if (ahead > 2 && ahead < 30) {
        const bl = tr.lateral(b.x, b.z, bi);
        if (Math.abs(bl - this.laneTarget) < 3.5) this.laneTarget = bl + (bl > 0 ? -5 : 5);
      }
    }
    this.lane += (this.laneTarget - this.lane) * Math.min(1, dt * 1.2);

    // take corners on the inside
    const curvAhead = tr.curv[tr.wrap(k.idx + 18)];
    const inside = Math.max(-1, Math.min(1, curvAhead * 1.6)) * HW * 0.45;

    const look = 9 + Math.max(0, k.vf) * 0.45;
    const ti = tr.wrap(Math.round(k.idx + look));
    const p = tr.point(ti, this.lane * 0.6 + inside);
    const dx = p.x - k.x, dz = p.z - k.z;
    const fx = Math.sin(k.heading), fz = Math.cos(k.heading);
    const side = dx * -fz + dz * fx; // right-hand
    const fwd = dx * fx + dz * fz;
    const ang = Math.atan2(side, fwd);
    this.wobble += dt;
    let steer = ang * 2.4 + Math.sin(this.wobble * 1.3) * cfg.noise * 0.3;

    // drift through long bends
    const sharp = Math.abs(curvAhead);
    if (!inp.drift && sharp > 0.55 && k.vf > 22 && Math.random() < cfg.drift * dt * 6) {
      inp.drift = true; this.driftHold = 0.8 + Math.random() * 1.6;
    }
    if (inp.drift) {
      this.driftHold -= dt;
      if (this.driftHold <= 0 || sharp < 0.2 || Math.abs(ang) > 0.9) inp.drift = false;
    }
    inp.steer = Math.max(-1, Math.min(1, steer));
    inp.gas = 1;
    inp.brake = Math.abs(ang) > 1.1 && k.vf > 18 ? 1 : 0;
    if (Math.abs(ang) > 1.6) { inp.brake = 0; } // turn around rather than stop

    // items
    inp.use = false;
    if (k.item && k.rollT <= 0) {
      this.itemTimer += dt;
      if (this.itemTimer > cfg.itemDelay) {
        const ranked = race.ranking, i = ranked.indexOf(k);
        let use = false;
        if (k.item === 'turbo' || k.item === 'triple') use = sharp < 0.35 && k.surface !== 'grass' || k.surface === 'grass';
        else if (k.item === 'rocket') use = i > 0;
        else if (k.item === 'banana') {
          const behind = ranked[i + 1];
          use = (behind && k.progress - behind.progress < 25) || this.itemTimer > 8;
        } else if (k.item === 'shield') use = this.itemTimer > 3;
        if (use) { inp.use = true; this.itemTimer = 0; }
      }
    } else this.itemTimer = 0;
    return inp;
  }
}

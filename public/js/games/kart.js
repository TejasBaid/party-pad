// Kart Party as a hub game module.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Race } from '../race.js';
import { TRACKS } from '../tracks.js';
import { KART_TYPES, COLORS, STAT_NAMES } from '../shared.js';
import { kartMesh } from '../assets.js';
import { formatTime, escapeHtml } from '../hud.js';
import { startMusic } from '../audio.js';

const BOT_NAMES = ['Turbo', 'Nitro', 'Sparky', 'Drifty', 'Axel', 'Blaze', 'Zoomer', 'Rusty', 'Pixel', 'Comet'];
const DIFFS = { Chill: 'easy', Normal: 'normal', Spicy: 'hard' };
const trackOf = (name) => TRACKS.find((t) => t.name === name) || TRACKS[0];

let thumbCache = null;
function makeThumbs() {
  if (thumbCache) return thumbCache;
  const W = 320, H = 240;
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setSize(W, H);
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.1;
  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6655aa, 1.4));
  const dl = new THREE.DirectionalLight(0xffffff, 2.2); dl.position.set(3, 5, 4); scene.add(dl);
  const cam = new THREE.PerspectiveCamera(30, W / H, 0.1, 100);
  cam.position.set(4.6, 3.1, 5.6); cam.lookAt(0, 0.75, 0);
  thumbCache = KART_TYPES.map((kt, i) => {
    const m = kartMesh(kt.id, COLORS[i].hex).group;
    m.rotation.y = 0.35;
    scene.add(m);
    r.render(scene, cam);
    const url = r.domElement.toDataURL('image/png');
    scene.remove(m);
    return url;
  });
  r.dispose();
  return thumbCache;
}

export default {
  id: 'kart',
  settings: [
    { key: 'track', label: 'Track', options: TRACKS.map((t) => t.name), hints: TRACKS.map((t) => t.blurb), def: 0, wrap: true },
    { key: 'laps', label: 'Laps', options: [1, 2, 3, 4, 5, 6, 7, 8, 9], def: 2 },
    { key: 'bots', label: 'Bots', options: [0, 1, 2, 3, 4, 5, 6, 7], def: 5 },
    { key: 'diff', label: 'Bot skill', options: ['Chill', 'Normal', 'Spicy'], def: 1 },
  ],
  nextSetting: 'track',
  startLabel: 'START RACE',

  thumbs: makeThumbs,

  slotHTML(p) {
    const kt = KART_TYPES[p.kartType];
    const thumbs = makeThumbs();
    const help = p.source === 'kb1' ? 'A/D pick kart' : p.source === 'kb2' ? '←/→ pick kart' : p.source === 'pad' ? 'D-pad picks kart' : '';
    return `<img src="${thumbs[p.kartType]}" alt="">
      <div class="pname">${escapeHtml(p.name)}</div>
      <div class="kname">${kt.name}</div>
      <div class="stats">${kt.stats.map((v, i) => `<div class="stat">${STAT_NAMES[i]}<div class="pips">${[1, 2, 3, 4, 5].map((n) => `<i class="${n <= v ? 'on' : ''}"></i>`).join('')}</div></div>`).join('')}</div>
      ${help ? `<div class="kb">${help}</div>` : ''}`;
  },
  cycle(p, d) { p.kartType = (p.kartType + d + KART_TYPES.length) % KART_TYPES.length; return true; },

  demo(ctx, s) {
    let race;
    const make = () => {
      race?.dispose();
      const racers = Array.from({ length: 7 }, (_, i) => ({ name: BOT_NAMES[i], color: COLORS[i % COLORS.length].hex, type: i % KART_TYPES.length }));
      race = new Race({ renderer: ctx.renderer, trackDef: trackOf(s.track), racers, laps: 99, difficulty: 'hard', demo: true, hudRoot: ctx.hudRoot });
      race.layout(ctx.W, ctx.H);
    };
    make();
    startMusic('kart');
    return {
      update(dt) { race.update(dt, () => ({})); if (race.demoDone) make(); },
      render(dt) { race.render(dt); },
      resize(w, h) { race.layout(w, h); },
      dispose() { race.dispose(); },
    };
  },

  start(ctx, players, s) {
    const humans = players;
    const racers = humans.map((p) => ({ name: p.name, color: p.color, type: p.kartType, human: { id: p.id, slot: p.slot } }));
    const botCount = Math.min(s.bots, 8 - humans.length);
    const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    for (let i = 0; i < botCount; i++) racers.push({ name: names[i], color: COLORS[4 + (i % 4)].hex, type: Math.floor(Math.random() * KART_TYPES.length) });
    const byId = (id) => humans.find((p) => p.id === id);

    const race = new Race({
      renderer: ctx.renderer, trackDef: trackOf(s.track), racers, laps: s.laps, difficulty: DIFFS[s.diff] || 'normal', hudRoot: ctx.hudRoot,
      onEvent(name, kart, arg) {
        const p = kart && byId(kart.human?.id);
        if (name === 'buzz' && p) ctx.buzz(p, arg);
        if (name === 'go') for (const q of humans) ctx.send(q, { t: 'phase', phase: 'race' });
        if (name === 'finish' && p) ctx.send(p, { t: 'finish', place: kart.place, time: formatTime(kart.finishTime) });
      },
      onFinish(results) {
        ctx.end({
          title: 'RESULTS',
          rows: results.map((r) => ({
            place: r.place, name: r.name, color: r.color, human: !r.ai, humanId: r.humanId,
            sub: r.kart + (r.ai ? ' · CPU' : ''), extra: '🪙 ' + r.coins, value: r.time != null ? formatTime(r.time) : '—',
          })),
        });
      },
    });
    race.layout(ctx.W, ctx.H);
    startMusic('kart');
    for (const p of humans) ctx.send(p, { t: 'phase', phase: 'countdown', game: 'kart', controller: 'kart', color: p.color, name: p.name, laps: s.laps, track: trackOf(s.track).name });

    return {
      race,
      update(dt) { race.update(dt, ctx.input); },
      render(dt) { race.render(dt); },
      updateCameras(dt) { race.updateCameras(dt); },
      resize(w, h) { race.layout(w, h); },
      dispose() { race.dispose(); },
      phoneHud(p) {
        const k = race.humans.find((x) => x.human.id === p.id);
        if (!k) return null;
        return { t: 'hud', pos: race.placeOf(k), total: race.karts.length, lap: Math.max(1, Math.min(race.laps, k.lap)), laps: race.laps, item: k.rollT > 0 ? '?' : k.item, count: k.itemCount, coins: k.coins, drift: k.drifting ? k.driftLevel : -1 };
      },
    };
  },
};

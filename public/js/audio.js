// Tiny synthesized sound engine: engines, SFX and a chiptune loop. No audio files needed.
let ctx = null, master = null, sfxBus = null, musicBus = null, noiseBuf = null;
let musicTimer = null, musicOn = true;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain(); master.gain.value = 0.8;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp).connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
  musicBus = ctx.createGain(); musicBus.gain.value = 0.16; musicBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
export const audioReady = () => !!ctx && ctx.state === 'running';

function tone(freq, dur, { type = 'square', vol = 0.2, slide = 0, delay = 0, bus = sfxBus } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus);
  o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur, { vol = 0.3, freq = 1200, q = 1, type = 'bandpass', sweep = 0, delay = 0 } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq + sweep), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(sfxBus);
  s.start(t); s.stop(t + dur + 0.05);
}

export const sfx = {
  beep: () => tone(520, 0.25, { type: 'square', vol: 0.18 }),
  go: () => { tone(1040, 0.6, { type: 'square', vol: 0.2 }); tone(1560, 0.6, { type: 'triangle', vol: 0.12 }); },
  item: () => [660, 880, 1100, 1320].forEach((f, i) => tone(f, 0.09, { type: 'triangle', vol: 0.14, delay: i * 0.05 })),
  roulette: () => tone(900 + Math.random() * 500, 0.05, { type: 'square', vol: 0.05 }),
  boost: () => { noise(0.7, { vol: 0.35, freq: 400, sweep: 3000, q: 0.8 }); tone(180, 0.5, { type: 'sawtooth', vol: 0.12, slide: 400 }); },
  miniturbo: (lvl) => tone(500 + lvl * 250, 0.25, { type: 'square', vol: 0.12, slide: 500 }),
  coin: () => { tone(1320, 0.08, { type: 'square', vol: 0.1 }); tone(1760, 0.2, { type: 'square', vol: 0.1, delay: 0.07 }); },
  bump: () => noise(0.18, { vol: 0.4, freq: 300, q: 1.5 }),
  wall: () => { noise(0.25, { vol: 0.35, freq: 600, q: 2 }); tone(90, 0.2, { type: 'sine', vol: 0.3, slide: -40 }); },
  spin: () => { tone(700, 0.6, { type: 'sawtooth', vol: 0.12, slide: -550 }); noise(0.5, { vol: 0.2, freq: 900 }); },
  launch: () => noise(0.5, { vol: 0.3, freq: 2000, sweep: -1500, q: 1 }),
  explode: () => { noise(0.8, { vol: 0.6, freq: 800, sweep: -700, q: 0.7, type: 'lowpass' }); tone(70, 0.5, { type: 'sine', vol: 0.4, slide: -30 }); },
  drop: () => tone(300, 0.15, { type: 'triangle', vol: 0.2, slide: -150 }),
  shield: () => [440, 660, 990].forEach((f, i) => tone(f, 0.3, { type: 'sine', vol: 0.15, delay: i * 0.06 })),
  lap: () => [784, 988, 1175].forEach((f, i) => tone(f, 0.18, { type: 'square', vol: 0.12, delay: i * 0.1 })),
  finalLap: () => [659, 784, 988, 1319].forEach((f, i) => tone(f, 0.22, { type: 'square', vol: 0.14, delay: i * 0.12 })),
  finish: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.3, { type: 'square', vol: 0.14, delay: i * 0.13 })),
  join: () => { tone(660, 0.1, { type: 'triangle', vol: 0.15 }); tone(990, 0.2, { type: 'triangle', vol: 0.15, delay: 0.08 }); },
  click: () => tone(1200, 0.04, { type: 'square', vol: 0.06 }),
  // fruit
  swish: () => noise(0.16, { vol: 0.12, freq: 2500, sweep: -1800, q: 0.6 }),
  slice: (pitch = 1) => { noise(0.12, { vol: 0.35, freq: 3000 * pitch, sweep: -2200, q: 1.2 }); noise(0.2, { vol: 0.25, freq: 500, q: 0.8, type: 'lowpass', delay: 0.02 }); },
  combo: (n) => [0, 4, 7, 12].slice(0, Math.min(4, n - 1)).forEach((s2, i) => tone(660 * Math.pow(2, s2 / 12), 0.12, { type: 'square', vol: 0.12, delay: i * 0.06 })),
  special: () => [0, 7, 12, 19].forEach((s2, i) => tone(880 * Math.pow(2, s2 / 12), 0.15, { type: 'triangle', vol: 0.15, delay: i * 0.05 })),
  fuse: () => noise(0.3, { vol: 0.08, freq: 5000, q: 2 }),
  // pizza
  pick: () => tone(520, 0.07, { type: 'triangle', vol: 0.15, slide: 200 }),
  place: () => { tone(300, 0.08, { type: 'triangle', vol: 0.15, slide: -80 }); noise(0.06, { vol: 0.12, freq: 900 }); },
  squirt: () => noise(0.12, { vol: 0.1, freq: 600, sweep: 300, q: 3 }),
  sprinkle: () => noise(0.08, { vol: 0.07, freq: 6000, q: 1 }),
  sizzle: () => noise(0.9, { vol: 0.08, freq: 4000, q: 0.5 }),
  ding: () => { tone(1568, 0.5, { type: 'sine', vol: 0.2 }); tone(2093, 0.6, { type: 'sine', vol: 0.12, delay: 0.08 }); },
  alarm: () => [0, 1, 2].forEach((i) => tone(880, 0.1, { type: 'square', vol: 0.1, delay: i * 0.15 })),
  cash: () => { tone(1320, 0.08, { type: 'square', vol: 0.12 }); tone(1760, 0.3, { type: 'square', vol: 0.12, delay: 0.08 }); noise(0.2, { vol: 0.1, freq: 7000, delay: 0.05 }); },
  angry: () => { tone(220, 0.3, { type: 'sawtooth', vol: 0.12, slide: -80 }); tone(207, 0.35, { type: 'sawtooth', vol: 0.1, delay: 0.12, slide: -60 }); },
  bell: () => { tone(1245, 0.4, { type: 'sine', vol: 0.15 }); tone(1661, 0.5, { type: 'sine', vol: 0.1, delay: 0.1 }); },
  trash: () => noise(0.25, { vol: 0.25, freq: 400, q: 1 }),
  star: () => [0, 4, 7, 12, 16].forEach((s2, i) => tone(784 * Math.pow(2, s2 / 12), 0.2, { type: 'triangle', vol: 0.14, delay: i * 0.08 })),
};

// ------------------------------------------------------------- engines
export class Engine {
  constructor(pitch = 1) {
    this.ok = !!ctx;
    if (!ctx) return;
    this.pitch = pitch;
    this.o1 = ctx.createOscillator(); this.o1.type = 'sawtooth';
    this.o2 = ctx.createOscillator(); this.o2.type = 'square';
    this.f = ctx.createBiquadFilter(); this.f.type = 'lowpass'; this.f.frequency.value = 600; this.f.Q.value = 2;
    this.g = ctx.createGain(); this.g.gain.value = 0;
    this.o1.connect(this.f); this.o2.connect(this.f); this.f.connect(this.g).connect(sfxBus);
    this.o1.start(); this.o2.start();
  }
  set(speed01, throttle, boost) {
    if (!this.ok) return;
    const t = ctx.currentTime;
    const f = (55 + speed01 * 120 + (boost ? 30 : 0)) * this.pitch;
    this.o1.frequency.setTargetAtTime(f, t, 0.06);
    this.o2.frequency.setTargetAtTime(f * 0.502, t, 0.06);
    this.f.frequency.setTargetAtTime(400 + speed01 * 1400 + throttle * 400, t, 0.08);
    this.g.gain.setTargetAtTime(0.035 + throttle * 0.03 + speed01 * 0.02, t, 0.1);
  }
  stop() {
    if (!this.ok) return;
    this.g.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    setTimeout(() => { try { this.o1.stop(); this.o2.stop(); } catch {} }, 300);
  }
}

// ------------------------------------------------------------- music
// Three little loops: a bouncy kart tune, a taiko-ish fruit beat and a tarantella for the pizzeria.
const SONGS = {
  kart: {
    bpm: 132, steps: 8,
    chords: [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]],
    melody: [72, 0, 76, 79, 0, 76, 74, 72, 69, 0, 72, 76, 0, 74, 72, 69, 65, 0, 69, 72, 0, 74, 72, 69, 67, 71, 74, 0, 79, 77, 76, 74],
  },
  fruit: {
    bpm: 150, steps: 8, taiko: true,
    chords: [[57, 60, 64], [57, 60, 64], [53, 57, 60], [55, 59, 62]],
    melody: [69, 0, 72, 0, 74, 76, 0, 74, 72, 0, 69, 0, 67, 69, 0, 0, 69, 0, 72, 74, 0, 76, 79, 0, 76, 74, 72, 0, 74, 72, 69, 0],
  },
  pizza: {
    bpm: 168, steps: 6, // 6/8 tarantella
    chords: [[57, 60, 64], [57, 60, 64], [52, 56, 59], [57, 60, 64]],
    melody: [76, 76, 76, 77, 76, 74, 72, 72, 72, 74, 72, 71, 69, 71, 72, 74, 76, 77, 76, 74, 72, 71, 69, 68],
  },
};
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export function startMusic(song = 'kart', intense = false) {
  if (song === true || song === false) { intense = song; song = 'kart'; }
  stopMusic();
  if (!ctx || !musicOn) return;
  const S = SONGS[song] || SONGS.kart, steps = S.steps;
  const step = 60 / (intense ? S.bpm + 12 : S.bpm) / 2;
  let n = 0, next = ctx.currentTime + 0.1;
  musicTimer = setInterval(() => {
    while (next < ctx.currentTime + 0.3) {
      const bar = Math.floor(n / steps) % 4, beat = n % steps;
      const chord = S.chords[bar];
      const d = next - ctx.currentTime;
      if (steps === 6) {
        // oom-pah-pah
        if (beat === 0 || beat === 3) tone(mtof(chord[0] - 24), step * 1.4, { type: 'triangle', vol: 0.5, delay: d, bus: musicBus });
        else tone(mtof(chord[beat % 3] - 12), step * 0.6, { type: 'square', vol: 0.06, delay: d, bus: musicBus });
        const mel = S.melody[n % S.melody.length];
        if (mel) tone(mtof(mel), step * 0.9, { type: 'square', vol: intense ? 0.12 : 0.08, delay: d, bus: musicBus });
        if (beat === 0) noiseHat(d);
      } else {
        if (beat % 2 === 0) tone(mtof(chord[0] - 24), step * 1.6, { type: 'triangle', vol: 0.5, delay: d, bus: musicBus });
        tone(mtof(chord[beat % 3] + (beat > 3 ? 12 : 0)), step * 0.8, { type: 'square', vol: 0.08, delay: d, bus: musicBus });
        const mel = S.melody[n % 32];
        if (mel && (intense || S.taiko || n % 64 >= 32)) tone(mtof(mel), step * 1.5, { type: S.taiko ? 'triangle' : 'square', vol: S.taiko ? 0.16 : 0.11, delay: d, bus: musicBus });
        if (S.taiko && (beat === 0 || beat === 3 || beat === 6)) drum(d, beat === 0 ? 1 : 0.6);
        if (beat % 2 === 1) noiseHat(d);
      }
      n++; next += step;
    }
  }, 60);
}
function drum(delay, v) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.25);
  g.gain.setValueAtTime(0.9 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  o.connect(g).connect(musicBus); o.start(t); o.stop(t + 0.35);
}
function noiseHat(delay) {
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
  const g = ctx.createGain(); g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  s.connect(f).connect(g).connect(musicBus); s.start(t); s.stop(t + 0.06);
}
export function stopMusic() { clearInterval(musicTimer); musicTimer = null; }
export function toggleMusic() {
  musicOn = !musicOn;
  if (musicBus) musicBus.gain.value = musicOn ? 0.16 : 0;
  return musicOn;
}

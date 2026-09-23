// Data shared by the big screen and the phone controller.

// Every kart has exactly 15 stat points spread over five stats (1–5 each),
// so each one is strong somewhere and pays for it somewhere else.
export const STAT_NAMES = ['Speed', 'Accel', 'Handling', 'Drift', 'Weight'];

export const KART_TYPES = [
  { id: 'bolt',   model: 'bolt',   yaw: 90, length: 3.7, name: 'Bolt',   blurb: 'Blistering top speed, slow off the line.',       stats: [5, 2, 3, 3, 2],
    credit: 'Racing car by scaranto (CC0)' },
  { id: 'zippy',  model: 'zippy',  yaw: 0,  length: 3.1, name: 'Zippy',  blurb: 'Rockets off the line and recovers fast.',        stats: [2, 5, 3, 3, 2],
    credit: 'Go Kart by Zsky (CC-BY 3.0)' },
  { id: 'brick',  model: 'brick',  yaw: 90, length: 3.4, name: 'Brick',  blurb: 'Heavy bruiser. Bumps others, shrugs off hits.', stats: [4, 2, 3, 1, 5],
    credit: 'Buggy by Nick Slough (CC-BY 3.0)' },
  { id: 'nimble', model: 'nimble', yaw: 90, length: 3.1, name: 'Nimble', blurb: 'Razor-sharp turning and grip.',                 stats: [3, 3, 5, 2, 2],
    credit: 'Go kart by Poly by Google (CC-BY 3.0)' },
  { id: 'slide',  model: 'slide',  yaw: 90, length: 3.3, name: 'Slide',  blurb: 'Drift king. Charges mini-turbos fastest.',      stats: [3, 3, 2, 5, 2],
    credit: 'Kart by scaranto (CC0)' },
];

// Player colours (humans get the first four; bots use the rest)
export const COLORS = [
  { name: 'Red',    hex: '#ff4d5e' },
  { name: 'Blue',   hex: '#3d8bff' },
  { name: 'Yellow', hex: '#ffc83d' },
  { name: 'Green',  hex: '#35d97c' },
  { name: 'Purple', hex: '#a66bff' },
  { name: 'Orange', hex: '#ff8a3d' },
  { name: 'Pink',   hex: '#ff6bc6' },
  { name: 'Teal',   hex: '#2fd6d0' },
];

export const ITEMS = {
  turbo:  { icon: '⚡', name: 'Turbo' },
  triple: { icon: '⚡', name: 'Triple Turbo', count: 3 },
  banana: { icon: '🍌', name: 'Banana' },
  rocket: { icon: '🚀', name: 'Rocket' },
  shield: { icon: '🛡️', name: 'Shield' },
};

export const ordinal = (n) => n + (['st', 'nd', 'rd'][((n + 90) % 100 - 10) % 10 - 1] || 'th');

// Crisp item icons (used on the big screen HUD and on phones)
const bolt = (x = 0, y = 0, s = 1) => `<path transform="translate(${x} ${y}) scale(${s})" d="M36 4 14 36h14l-6 24 28-36H34l6-20z" fill="#ffd23f" stroke="#1b1340" stroke-width="4" stroke-linejoin="round"/>`;
export const ITEM_SVG = {
  turbo: `<svg viewBox="0 0 64 64">${bolt()}<path d="M33 10 20 30h7" fill="none" stroke="#fff7c0" stroke-width="3" stroke-linecap="round"/></svg>`,
  triple: `<svg viewBox="0 0 64 64">${bolt(-6, 10, 0.62)}${bolt(26, 10, 0.62)}${bolt(10, -4, 0.62)}</svg>`,
  banana: `<svg viewBox="0 0 64 64"><path d="M14 12c-4 18 4 38 26 44 8 2 14-2 14-6-18 0-30-14-30-36z" fill="#ffd93b" stroke="#1b1340" stroke-width="4" stroke-linejoin="round"/><path d="M20 18c0 16 8 28 24 32" fill="none" stroke="#e8a800" stroke-width="3" stroke-linecap="round"/><path d="M12 12l4-6 6 4-4 4z" fill="#6b4a1e" stroke="#1b1340" stroke-width="3" stroke-linejoin="round"/></svg>`,
  rocket: `<svg viewBox="0 0 64 64"><path d="M10 54l6-14 8 8z" fill="#ff9f1c" stroke="#1b1340" stroke-width="3" stroke-linejoin="round"/><path d="M20 44 44 20c6-6 12-8 14-8 0 2-2 8-8 14L26 50z" fill="#fff" stroke="#1b1340" stroke-width="4" stroke-linejoin="round"/><path d="M44 20c6-6 12-8 14-8 0 2-2 8-8 14z" fill="#ff4d5e" stroke="#1b1340" stroke-width="4" stroke-linejoin="round"/><circle cx="40" cy="30" r="4" fill="#3de0ff" stroke="#1b1340" stroke-width="3"/><path d="M20 44l-8-2 10-10M26 50l2 8 10-10" fill="#ff4d5e" stroke="#1b1340" stroke-width="3" stroke-linejoin="round"/></svg>`,
  shield: `<svg viewBox="0 0 64 64"><path d="M32 6 10 14v16c0 14 10 24 22 28 12-4 22-14 22-28V14z" fill="#3d8bff" stroke="#1b1340" stroke-width="4" stroke-linejoin="round"/><path d="M32 12v40c8-4 16-10 16-22V18z" fill="#7cc4ff"/><path d="M18 20v8" stroke="#fff" stroke-width="4" stroke-linecap="round"/></svg>`,
  mystery: `<svg viewBox="0 0 64 64"><defs><linearGradient id="rb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff5ea8"/><stop offset=".5" stop-color="#fff36b"/><stop offset="1" stop-color="#5ed1ff"/></linearGradient></defs><rect x="8" y="8" width="48" height="48" rx="10" fill="url(#rb)" stroke="#1b1340" stroke-width="4"/><text x="32" y="46" text-anchor="middle" font-family="Lilita One, Impact, sans-serif" font-size="36" fill="#fff" stroke="#1b1340" stroke-width="2">?</text></svg>`,
};

// ---------------------------------------------------------------- games in the party hub
// controller: which phone UI the game uses — 'kart' (steering pad) or 'remote' (point & swing like a Wii remote)
export const GAMES = [
  { id: 'kart', name: 'Kart Party', tagline: 'Race karts, drift, throw bananas', mode: 'Versus · 1–4 + bots', controller: 'kart', color: '#ff4d8d', icon: '🏎️' },
  { id: 'fruit', name: 'Fruit Frenzy', tagline: 'Swing your phone like a sword', mode: 'Versus · 1–4', controller: 'remote', color: '#35d97c', icon: '🍉' },
  { id: 'pizza', name: 'Pizza Party', tagline: 'Run a pizzeria together', mode: 'Co-op · 1–4', controller: 'remote', color: '#ff8a3d', icon: '🍕' },
];

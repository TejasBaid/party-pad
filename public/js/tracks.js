// Track layouts (closed loops; each point is [x, z, height]) and their visual themes.
// Race direction follows the point order; the start/finish line sits on the first point.

export const ROAD_HALF_WIDTH = 10;
export const CURB_WIDTH = 1.6;
export const WALL_DIST = 16.5;

export const TRACKS = [
  {
    id: 'meadow',
    name: 'Meadow Loop',
    blurb: 'Rolling green hills and sweeping bends',
    points: [[-40, 75, 0], [60, 78, 0], [130, 62, 3], [172, 20, 8], [168, -38, 11], [130, -70, 8], [82, -50, 4], [38, -82, 2], [-30, -118, 6], [-104, -104, 10], [-152, -54, 7], [-160, 14, 2], [-122, 60, 0]],
    boostPads: [0.2, 0.47, 0.8],
    itemRows: [0.1, 0.38, 0.62, 0.88],
    coinLines: [[0.28, -4], [0.53, 4], [0.72, 0], [0.95, -3]],
    theme: {
      sky: { top: 0x2f7fe0, horizon: 0xcbe8ff, bottom: 0x9cc7a0, sun: 0xfff2d0, elevation: 42, azimuth: 150 },
      exposure: 1.0,
      fogNear: 280, fogFar: 1500,
      sun: 0xfff1d6, sunIntensity: 2.6, hemiSky: 0xcfe8ff, hemiGround: 0x4f7a34, hemiIntensity: 1.1,
      ground: [0x4f9e3a, 0x6fbf45, 0x3f8a34], groundDetail: 'grass', verge: 0x5a9a3c,
      mountains: [0x5f9150, 0x7aa868], snowCaps: true,
      wall: ['#e8303a', '#f7f7f7'],
      flora: {
        trees: [['tree1', 16, 0.35], ['tree3', 17, 0.35], ['tree4', 16, 0.3]], treeCount: 240,
        bushes: [['bush', 3.2, 0.2], ['bushflowers', 3.4, 0.5], ['fern', 2.4, 0.3]], bushCount: 260,
        ground: [['grass', 1.3, 0.45], ['tallgrass', 1.8, 0.2], ['flowers1', 1.4, 0.18], ['flowers2', 1.5, 0.17]], groundCount: 2600,
        rocks: [['rock1', 4, 0.5], ['rock2', 3.5, 0.5]], rockCount: 40,
      },
      water: true, clouds: 26, balloons: 5,
    },
  },
  {
    id: 'canyon',
    name: 'Sunset Canyon',
    blurb: 'Desert switchbacks and big drops at golden hour',
    points: [[0, 88, 0], [92, 96, 2], [152, 58, 8], [150, -6, 14], [96, -26, 17], [66, -72, 12], [102, -122, 6], [52, -170, 2], [-52, -160, 4], [-104, -110, 10], [-64, -84, 15], [-60, -44, 13], [-104, -18, 8], [-136, 40, 3], [-76, 94, 0]],
    boostPads: [0.12, 0.42, 0.71],
    itemRows: [0.06, 0.33, 0.58, 0.84],
    coinLines: [[0.2, 3], [0.5, -4], [0.66, 0], [0.92, 4]],
    theme: {
      sky: { top: 0x3b3f8f, horizon: 0xffb070, bottom: 0xd88a55, sun: 0xffd08a, elevation: 9, azimuth: 235 },
      exposure: 1.0,
      fogNear: 240, fogFar: 1300,
      sun: 0xffb070, sunIntensity: 3.0, hemiSky: 0xffc9a0, hemiGround: 0x8a4a2a, hemiIntensity: 1.0,
      ground: [0xd08a4e, 0xe3a266, 0xb96f3c], groundDetail: 'sand', verge: 0xc27a45,
      mountains: [0xb0552f, 0xcc6f3f], snowCaps: false, mesas: true,
      wall: ['#ffb000', '#3a2a5a'],
      flora: {
        trees: [['dead1', 13, 0.6], ['twisted1', 12, 0.4]], treeCount: 70,
        bushes: [['bush', 2.6, 1]], bushCount: 70,
        ground: [['grass', 1.1, 0.6], ['tallgrass', 1.5, 0.4]], groundCount: 900,
        rocks: [['rock1', 6, 0.5], ['rock2', 5, 0.5]], rockCount: 150,
      },
      tint: { leaves: 0xd08a3a, grass: 0xc8a050, rock: 0xd98a5a },
      water: false, clouds: 10, balloons: 4,
    },
  },
  {
    id: 'frost',
    name: 'Frosty Peaks',
    blurb: 'Snowy pine forest with a mountain climb',
    points: [[-110, 84, 0], [-30, 104, 2], [40, 86, 6], [68, 54, 9], [98, 44, 11], [132, 62, 9], [176, 22, 5], [168, -52, 2], [96, -82, 4], [24, -60, 8], [-36, -104, 11], [-112, -86, 7], [-150, -20, 3], [-150, 44, 0]],
    boostPads: [0.15, 0.5, 0.78],
    itemRows: [0.08, 0.36, 0.6, 0.86],
    coinLines: [[0.25, 0], [0.45, -4], [0.7, 4], [0.93, 0]],
    theme: {
      sky: { top: 0x4f9ef0, horizon: 0xe6f2ff, bottom: 0xd8e6f2, sun: 0xffffff, elevation: 26, azimuth: 120 },
      exposure: 0.95,
      fogNear: 260, fogFar: 1400,
      sun: 0xffffff, sunIntensity: 2.6, hemiSky: 0xe0efff, hemiGround: 0x9fb2c6, hemiIntensity: 1.2,
      ground: [0xeef4fb, 0xffffff, 0xd6e3f0], groundDetail: 'snow', verge: 0xdfe9f4,
      mountains: [0x8aa0b8, 0xa7bad0], snowCaps: true,
      wall: ['#2f7fe0', '#ffffff'],
      flora: {
        trees: [['pine1', 18, 0.35], ['pine3', 16, 0.35], ['pine4', 17, 0.3]], treeCount: 320,
        bushes: [['bush', 2.6, 1]], bushCount: 60,
        ground: [['tallgrass', 1.3, 1]], groundCount: 500,
        rocks: [['rock1', 4.5, 0.5], ['rock2', 4, 0.5]], rockCount: 50,
      },
      tint: { leaves: 0x2f6f5a, grass: 0x9fb8a0 },
      water: false, clouds: 18, snowfall: true, balloons: 3,
    },
  },
];

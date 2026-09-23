// Track geometry (for physics) and the full 3D environment around it.
import * as THREE from 'three';
import { ROAD_HALF_WIDTH as HW, CURB_WIDTH, WALL_DIST } from './tracks.js';
import * as TX from './textures.js';
import { model, instanced } from './assets.js';

// ------------------------------------------------------------------ helpers
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash2 = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, z) => vnoise(x, z) * 0.5 + vnoise(x * 2.1, z * 2.1) * 0.3 + vnoise(x * 4.3, z * 4.3) * 0.2;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function radiusAt(P, i, k = 6) {
  const N = P.length, a = P[(i - k + N) % N], b = P[i], d = P[(i + k) % N];
  const ab = Math.hypot(b.x - a.x, b.z - a.z), bd = Math.hypot(d.x - b.x, d.z - b.z), ad = Math.hypot(d.x - a.x, d.z - a.z);
  const area = Math.abs((b.x - a.x) * (d.z - a.z) - (b.z - a.z) * (d.x - a.x)) / 2;
  return area < 1e-9 ? 1e9 : (ab * bd * ad) / (4 * area);
}
function resample(P, step = 1) {
  const N = P.length, cum = [0];
  for (let i = 1; i <= N; i++) { const a = P[i - 1], b = P[i % N]; cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.z - a.z)); }
  const L = cum[N], M = Math.round(L / step), out = [];
  let j = 0;
  for (let k = 0; k < M; k++) {
    const s = (k * L) / M;
    while (cum[j + 1] < s) j++;
    const t = (s - cum[j]) / (cum[j + 1] - cum[j] || 1), a = P[j], b = P[(j + 1) % N];
    out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, y: a.y + (b.y - a.y) * t });
  }
  return out;
}
// Catmull-Rom through the control points, relax any corner tighter than RMIN, and smooth the height profile
function buildCenterline(points, RMIN = 24) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, z, y = 0]) => new THREE.Vector3(x, y, z)), true, 'centripetal');
  let P = resample(curve.getSpacedPoints(2000).slice(0, 2000).map((p) => ({ x: p.x, z: p.z, y: p.y })), 1);
  for (let it = 0; it < 400; it++) {
    let bad = 0;
    const N = P.length, Q = P.map((p) => ({ ...p }));
    for (let i = 0; i < N; i++) {
      if (radiusAt(P, i) >= RMIN) continue;
      bad++;
      for (let o = -6; o <= 6; o++) {
        const j = (i + o + N) % N, a = P[(j - 1 + N) % N], b = P[(j + 1) % N];
        Q[j].x = Q[j].x * 0.5 + (a.x + b.x) * 0.25; Q[j].z = Q[j].z * 0.5 + (a.z + b.z) * 0.25;
      }
    }
    P = Q;
    if (!bad) break;
    if (it % 10 === 9) P = resample(P, 1);
  }
  P = resample(P, 1);
  const N = P.length;
  for (let pass = 0; pass < 4; pass++) {
    const ys = P.map((p) => p.y);
    for (let i = 0; i < N; i++) {
      let s = 0;
      for (let o = -18; o <= 18; o++) s += ys[(i + o + N) % N];
      P[i].y = s / 37;
    }
  }
  return P;
}

// ------------------------------------------------------------------ Track (physics data)
export class Track {
  constructor(def) {
    this.def = def;
    const P = buildCenterline(def.points);
    const N = (this.N = P.length);
    this.px = new Float32Array(N); this.pz = new Float32Array(N); this.py = new Float32Array(N);
    this.tx = new Float32Array(N); this.tz = new Float32Array(N);
    this.nx = new Float32Array(N); this.nz = new Float32Array(N);
    this.curv = new Float32Array(N);
    for (let i = 0; i < N; i++) { this.px[i] = P[i].x; this.pz[i] = P[i].z; this.py[i] = P[i].y; }
    for (let i = 0; i < N; i++) {
      const a = P[(i - 1 + N) % N], b = P[(i + 1) % N];
      const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
      this.tx[i] = dx / l; this.tz[i] = dz / l;
      this.nx[i] = -this.tz[i]; this.nz[i] = this.tx[i]; // right-hand side
    }
    // signed curvature (turn angle over ±8 samples); >0 = turning right
    for (let i = 0; i < N; i++) {
      const a = this.wrap(i - 8), b = this.wrap(i + 8);
      const cross = this.tx[a] * this.tz[b] - this.tz[a] * this.tx[b];
      const dot = this.tx[a] * this.tx[b] + this.tz[a] * this.tz[b];
      this.curv[i] = Math.atan2(cross, dot);
    }
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (const p of P) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
    this.bounds = { minX, maxX, minZ, maxZ, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, r: Math.hypot(maxX - minX, maxZ - minZ) / 2 };
  }
  wrap(i) { const N = this.N; return ((i % N) + N) % N; }
  heading(i) { i = this.wrap(i); return Math.atan2(this.tx[i], this.tz[i]); }
  point(i, lateral = 0) {
    i = this.wrap(Math.round(i));
    return { x: this.px[i] + this.nx[i] * lateral, z: this.pz[i] + this.nz[i] * lateral, y: this.py[i] };
  }
  heightAt(i, along = 0) {
    const a = this.wrap(i), b = this.wrap(i + (along >= 0 ? 1 : -1)), t = Math.min(1, Math.abs(along));
    return this.py[a] + (this.py[b] - this.py[a]) * t;
  }
  grade(i) { return (this.py[this.wrap(i + 2)] - this.py[this.wrap(i - 2)]) / 4; }
  lateral(x, z, i) { return (x - this.px[i]) * this.nx[i] + (z - this.pz[i]) * this.nz[i]; }
  along(x, z, i) { return (x - this.px[i]) * this.tx[i] + (z - this.pz[i]) * this.tz[i]; }
  nearest(x, z, hint = -1, range = 30) {
    let best = -1, bd = 1e18;
    if (hint >= 0) {
      for (let o = -range; o <= range; o++) {
        const i = this.wrap(hint + o), dx = x - this.px[i], dz = z - this.pz[i], d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = i; }
      }
      if (bd < 40 * 40) return best;
    }
    for (let i = 0; i < this.N; i++) {
      const dx = x - this.px[i], dz = z - this.pz[i], d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  /** distance to the centre line and the nearest sample index */
  closest(x, z, step = 3) {
    let bd = 1e18, bi = 0;
    for (let i = 0; i < this.N; i += step) {
      const dx = x - this.px[i], dz = z - this.pz[i], d = dx * dx + dz * dz;
      if (d < bd) { bd = d; bi = i; }
    }
    for (let o = -step; o <= step; o++) {
      const i = this.wrap(bi + o), dx = x - this.px[i], dz = z - this.pz[i], d = dx * dx + dz * dz;
      if (d < bd) { bd = d; bi = i; }
    }
    return { d: Math.sqrt(bd), i: bi };
  }
  distTo(x, z, step = 3) { return this.closest(x, z, step).d; }
  // Starting grid slot k (0 = pole)
  gridSlot(k) {
    const row = Math.floor(k / 2), col = k % 2;
    const i = this.wrap(-10 - row * 8 - col * 3);
    const p = this.point(i, col ? 4.6 : -4.6);
    return { x: p.x, z: p.z, heading: this.heading(i), idx: i };
  }
}

// ------------------------------------------------------------------ geometry builders
function ribbon(track, off0, off1, y, vPerUnit) {
  const count = track.N + 1;
  const pos = new Float32Array(count * 6), uv = new Float32Array(count * 4), nor = new Float32Array(count * 6);
  const reps = Math.max(1, Math.round(track.N * vPerUnit)), vScale = reps / track.N;
  for (let k = 0; k < count; k++) {
    const i = track.wrap(k);
    const x = track.px[i], z = track.pz[i], h = track.py[i] + y, nx = track.nx[i], nz = track.nz[i];
    pos.set([x + nx * off0, h, z + nz * off0, x + nx * off1, h, z + nz * off1], k * 6);
    uv.set([0, k * vScale, 1, k * vScale], k * 4);
    nor.set([0, 1, 0, 0, 1, 0], k * 6);
  }
  return strip(pos, uv, nor, count);
}
// vertical strip (a wall face) at a lateral offset; `side` picks which way the face points
function wallStrip(track, off, y0, y1, vPerUnit, facing) {
  const count = track.N + 1;
  const pos = new Float32Array(count * 6), uv = new Float32Array(count * 4), nor = new Float32Array(count * 6);
  const reps = Math.max(1, Math.round(track.N * vPerUnit)), vScale = reps / track.N;
  for (let k = 0; k < count; k++) {
    const i = track.wrap(k);
    const x = track.px[i] + track.nx[i] * off, z = track.pz[i] + track.nz[i] * off, h = track.py[i];
    // vertex order decides the winding: [top, bottom] faces +n, [bottom, top] faces -n
    const a = facing > 0 ? [x, h + y1, z, x, h + y0, z] : [x, h + y0, z, x, h + y1, z];
    pos.set(a, k * 6);
    uv.set(facing > 0 ? [k * vScale, 1, k * vScale, 0] : [k * vScale, 0, k * vScale, 1], k * 4);
    const nx = track.nx[i] * facing, nz = track.nz[i] * facing;
    nor.set([nx, 0, nz, nx, 0, nz], k * 6);
  }
  return strip(pos, uv, nor, count);
}
function strip(pos, uv, nor, count) {
  const idx = [];
  for (let k = 0; k < count - 1; k++) { const a = k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}
const placeMatrix = (x, y, z, yaw, s = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(s, s, s));

// ------------------------------------------------------------------ sky
const SKY_VERT = `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`;
const SKY_FRAG = `
  uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunColor; uniform vec3 sunDir;
  varying vec3 vDir;
  void main(){
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 c = h > 0.0 ? mix(horizon, top, pow(smoothstep(0.0, 1.0, h), 0.6)) : mix(horizon, bottom, smoothstep(0.0, -0.2, h));
    float s = max(dot(d, normalize(sunDir)), 0.0);
    c += sunColor * (pow(s, 900.0) * 6.0 + pow(s, 40.0) * 0.35 + pow(s, 6.0) * 0.12);
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
function makeSky(theme, sunDir, radius = 5000) {
  const s = theme.sky;
  return new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), new THREE.ShaderMaterial({
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(s.top) }, horizon: { value: new THREE.Color(s.horizon) }, bottom: { value: new THREE.Color(s.bottom) },
      sunColor: { value: new THREE.Color(s.sun) }, sunDir: { value: sunDir.clone() },
    },
  }));
}

// ------------------------------------------------------------------ world
export function buildWorld(track, renderer) {
  const theme = track.def.theme;
  const rand = mulberry32(track.def.id.length * 9973 + track.N);
  const scene = new THREE.Scene();
  const B = track.bounds;
  const animated = [];

  // --- sky, fog, lights
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - theme.sky.elevation), THREE.MathUtils.degToRad(theme.sky.azimuth));
  const sky = makeSky(theme, sunDir);
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  scene.add(sky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(makeSky(theme, sunDir, 100));
  const envRT = pmrem.fromScene(envScene, 0.02);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.7;
  pmrem.dispose();
  scene.fog = new THREE.Fog(theme.sky.horizon, theme.fogNear, theme.fogFar);

  scene.add(new THREE.HemisphereLight(theme.hemiSky, theme.hemiGround, theme.hemiIntensity));
  const sun = new THREE.DirectionalLight(theme.sun, theme.sunIntensity);
  const ext = B.r + 50;
  sun.position.set(B.cx + sunDir.x * 500, Math.max(sunDir.y, 0.3) * 500, B.cz + sunDir.z * 500);
  sun.target.position.set(B.cx, 0, B.cz);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 50, far: 1400 });
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.4;
  scene.add(sun, sun.target);

  // --- terrain height: follows the road near the track, rolls into hills further out
  const lake = theme.water ? findLake(track, rand) : null;
  const terrainH = (x, z) => {
    const { d, i } = track.closest(x, z, 4);
    const base = track.py[i];
    const bank = base - 0.4 + smooth(WALL_DIST + 1, WALL_DIST + 26, d) * 2.5;
    const far = smooth(WALL_DIST + 20, WALL_DIST + 170, d);
    const hills = fbm(x / 130, z / 130) * 60 - 6 + far * 18;
    let h = bank + (Math.max(hills, bank) - bank) * far;
    if (lake) {
      const ld = Math.hypot(x - lake.x, z - lake.z);
      h = h * smooth(lake.r - 6, lake.r + 30, ld) + (-2.5) * (1 - smooth(lake.r - 6, lake.r + 4, ld));
    }
    return h;
  };

  const SIZE = 2600, SEG = 200;
  const tg = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  tg.rotateX(-Math.PI / 2);
  tg.translate(B.cx, 0, B.cz);
  const tp = tg.attributes.position;
  const colors = new Float32Array(tp.count * 3);
  const gc = theme.ground.map((c) => new THREE.Color(c));
  const snow = new THREE.Color(0xf6f9ff), tmpC = new THREE.Color();
  for (let i = 0; i < tp.count; i++) {
    const x = tp.getX(i), z = tp.getZ(i);
    const near = Math.hypot(x - B.cx, z - B.cz) < B.r + 320;
    const h = near ? terrainH(x, z) : fbm(x / 130, z / 130) * 60 + 12;
    tp.setY(i, h);
    const n = fbm(x / 60, z / 60);
    tmpC.copy(gc[0]).lerp(gc[1], smooth(0.35, 0.75, n)).lerp(gc[2], smooth(0.55, 0.9, fbm(x / 23 + 7, z / 23)) * 0.6);
    if (theme.snowCaps && theme.groundDetail !== 'snow') tmpC.lerp(snow, smooth(40, 62, h));
    colors.set([tmpC.r, tmpC.g, tmpC.b], i * 3);
  }
  tg.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  tg.computeVertexNormals();
  const gTex = TX.groundTexture(theme.groundDetail);
  gTex.repeat.set(SIZE / 14, SIZE / 14);
  const terrain = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ map: gTex, vertexColors: true, roughness: 0.95, metalness: 0 }));
  terrain.receiveShadow = true;
  scene.add(terrain);

  if (lake) {
    const wt = TX.waterTexture(); wt.repeat.set(6, 6);
    const water = new THREE.Mesh(new THREE.CircleGeometry(lake.r + 34, 48).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x2c8ad0, map: wt, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.9 }));
    water.position.set(lake.x, -0.6, lake.z);
    scene.add(water);
    animated.push((t) => wt.offset.set(t * 0.01, t * 0.006));
  }

  // --- road, curbs, verge, walls
  const road = new THREE.Mesh(ribbon(track, -HW, HW, 0.06, 1 / 12), new THREE.MeshStandardMaterial({ map: TX.roadTexture(), roughness: 0.78 }));
  road.receiveShadow = true;
  scene.add(road);
  const curbMat = new THREE.MeshStandardMaterial({ map: TX.curbTexture(), roughness: 0.6 });
  for (const [a, b] of [[-HW - CURB_WIDTH, -HW], [HW, HW + CURB_WIDTH]]) {
    const m = new THREE.Mesh(ribbon(track, a, b, 0.1, 1 / 5), curbMat);
    m.receiveShadow = true; scene.add(m);
  }
  const vergeMat = new THREE.MeshStandardMaterial({ color: theme.verge, map: gTex.clone(), roughness: 1 });
  vergeMat.map.repeat.set(2, 1);
  for (const [a, b] of [[-WALL_DIST - 0.6, -HW - CURB_WIDTH], [HW + CURB_WIDTH, WALL_DIST + 0.6]]) {
    const m = new THREE.Mesh(ribbon(track, a, b, 0.04, 1 / 8), vergeMat);
    m.receiveShadow = true; scene.add(m);
  }
  const wallTex = TX.wallTexture(theme.wall);
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.7 });
  const capMat = new THREE.MeshStandardMaterial({ color: 0xe9ebef, roughness: 0.6 });
  const WALL_H = 1.25;
  for (const side of [-1, 1]) {
    const off = side * (WALL_DIST + 0.4);
    const inner = new THREE.Mesh(wallStrip(track, off, -0.6, WALL_H, 1 / 8, -side), wallMat);
    const outer = new THREE.Mesh(wallStrip(track, off + side * 0.6, -0.6, WALL_H, 1 / 8, side), wallMat);
    const cap = new THREE.Mesh(ribbon(track, Math.min(off, off + side * 0.6), Math.max(off, off + side * 0.6), WALL_H, 1 / 8), capMat);
    for (const m of [inner, outer, cap]) { m.castShadow = true; m.receiveShadow = true; scene.add(m); }
  }

  // --- start line + grid
  const startLine = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2, 3).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: TX.checkerTexture(14, 2), roughness: 0.6 }));
  startLine.position.set(track.px[0], track.py[0] + 0.12, track.pz[0]);
  startLine.rotation.y = track.heading(0);
  startLine.receiveShadow = true;
  scene.add(startLine);
  const gridMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  for (let k = 0; k < 8; k++) {
    const s = track.gridSlot(k);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.35).rotateX(-Math.PI / 2), gridMat);
    const f = { x: Math.sin(s.heading), z: Math.cos(s.heading) };
    m.position.set(s.x + f.x * 2.4, track.py[s.idx] + 0.12, s.z + f.z * 2.4);
    m.rotation.y = s.heading;
    scene.add(m);
  }

  // --- boost pads
  const padTex = TX.boostPadTexture(); padTex.repeat.set(1, 2);
  const padMat = new THREE.MeshStandardMaterial({ map: padTex, emissive: 0xffffff, emissiveMap: padTex, emissiveIntensity: 0.9, roughness: 0.4 });
  const pads = track.def.boostPads.map((f, k) => {
    const idx = track.wrap(Math.round(f * track.N));
    const lat = k % 2 ? 4.5 : -4.5;
    const p = track.point(idx, lat);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(6, 9).rotateX(-Math.PI / 2), padMat);
    m.position.set(p.x, p.y + 0.13, p.z);
    // chevrons point in the race direction
    m.rotation.order = 'YXZ';
    m.rotation.y = track.heading(idx) + Math.PI;
    m.rotation.x = Math.atan(track.grade(idx));
    scene.add(m);
    return { idx, lat, halfLen: 4.5, halfW: 3.2 };
  });
  animated.push((t) => { padTex.offset.y = -t * 1.6; });

  // --- start arch with countdown lights
  const startLights = buildArch(scene, track);

  // --- overhead sponsor banners
  const BANNERS = [
    ['KART PARTY', ['#ff4d8d', '#c9245f'], '#ffffff'], ['TURBO', ['#ffd23f', '#ff9f1c'], '#2a1650'],
    ['DRIFT ZONE', ['#3d8bff', '#1c4fd6'], '#ffffff'], ['FULL THROTTLE', ['#35d97c', '#169a50'], '#ffffff'],
  ];
  [0.27, 0.52, 0.76].forEach((f, k) => {
    let i = Math.round(f * track.N);
    // keep banners on straights
    for (let o = 0; o < 60 && Math.abs(track.curv[track.wrap(i)]) > 0.25; o++) i++;
    buildOverheadBanner(scene, track, track.wrap(i), BANNERS[(k + 1) % BANNERS.length]);
  });

  // --- trackside props (Kenney racing kit)
  const faceTrack = (i, side) => Math.atan2(-track.nx[i] * side, -track.nz[i] * side);
  const put = (name, i, lateral, opts, yawOffset = 0) => {
    i = track.wrap(i);
    const p = track.point(i, lateral);
    const m = model(name, opts);
    m.position.set(p.x, terrainH(p.x, p.z) - 0.1, p.z);
    m.rotation.y = faceTrack(i, Math.sign(lateral)) + yawOffset;
    scene.add(m);
    return m;
  };
  for (let k = -5; k <= 4; k++) put('grandStandCovered', k * 11 - 4, WALL_DIST + 8.5, { size: 11, fit: 'width' });
  for (let k = -3; k <= 2; k++) put('pitsGarage', k * 12 - 6, -(WALL_DIST + 8), { size: 12, fit: 'width' });
  for (let k = -3; k <= 3; k++) put('lightPostLarge', k * 18, -(WALL_DIST + 2.4), { size: 9, fit: 'height' }, Math.PI);
  put('radarEquipment', -80, -(WALL_DIST + 10), { size: 7, fit: 'height' });
  for (let k = 1; k < 12; k++) {
    const i = Math.round((k / 12) * track.N);
    const side = track.curv[i] > 0 ? -1 : 1;
    put(k % 2 ? 'bannerTowerRed' : 'bannerTowerGreen', i, side * (WALL_DIST + 3.5), { size: 8, fit: 'height' });
  }
  for (let k = 0; k < 5; k++) {
    const i = Math.round(((k + 0.5) / 5) * track.N) + 20;
    const side = track.curv[track.wrap(i)] > 0 ? -1 : 1;
    put(k % 2 ? 'billboard' : 'billboardLow', i, side * (WALL_DIST + 8), { size: 12, fit: 'width' }, Math.PI / 2);
  }
  for (let k = 0; k < 4; k++) put(k % 2 ? 'tent' : 'tentLong', Math.round(track.N * 0.55) + k * 12, WALL_DIST + 10, { size: 8, fit: 'width' });

  // --- nature (Quaternius Stylized Nature MegaKit)
  scatterFlora(scene, track, theme, rand, terrainH, lake);

  // --- far scenery
  scene.add(buildMountains(B, theme, rand));
  if (theme.mesas) scene.add(buildMesas(track, theme, rand, terrainH));
  const clouds = buildClouds(B, theme, rand);
  scene.add(clouds);
  animated.push((t, dt) => clouds.children.forEach((c) => { c.position.x += dt * c.userData.v; if (c.position.x > B.cx + 900) c.position.x = B.cx - 900; }));
  const balloons = buildBalloons(B, theme, rand);
  scene.add(balloons);
  animated.push((t) => balloons.children.forEach((b, k) => { b.position.y = b.userData.y + Math.sin(t * 0.3 + k) * 4; b.rotation.y = t * 0.05 + k; }));
  if (theme.snowfall) { const s = buildSnow(B); scene.add(s.points); animated.push(s.update); }

  return {
    scene, sun, pads, startLights, terrainH,
    update(t, dt) { for (const f of animated) f(t, dt); },
    dispose() { envRT.dispose(); scene.traverse((o) => { if (o.isInstancedMesh) o.dispose(); }); },
  };
}

// ------------------------------------------------------------------ pieces
function buildArch(scene, track) {
  const i = 0, p = track.point(i, 0), yaw = track.heading(i);
  const g = new THREE.Group();
  g.position.set(p.x, p.y, p.z);
  g.rotation.y = yaw;
  const span = HW * 2 + 5;
  const checker = TX.checkerTexture(2, 12);
  checker.wrapS = checker.wrapT = THREE.RepeatWrapping;
  const pillarMat = new THREE.MeshStandardMaterial({ map: checker, roughness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1340, roughness: 0.4, metalness: 0.3 });
  for (const s of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.6, 10, 1.6), pillarMat);
    pillar.position.set((s * span) / 2, 5, 0);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.8, 2.4), dark);
    foot.position.set((s * span) / 2, 0.4, 0);
    g.add(pillar, foot);
  }
  const bannerTex = TX.bannerTexture('KART PARTY', ['#2a1a6e', '#1b1340'], '#ffd23f', { w: 1024, h: 128, stripe: '#ff4d8d' });
  const beamMats = [dark, dark, dark, dark, new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.5, emissive: 0xffffff, emissiveMap: bannerTex, emissiveIntensity: 0.25 }), null];
  beamMats[5] = beamMats[4];
  const beam = new THREE.Mesh(new THREE.BoxGeometry(span + 1.6, 2.6, 1.2), beamMats);
  beam.position.y = 10.6;
  g.add(beam);
  // three countdown lights facing the grid (-z side)
  const lights = [];
  for (let k = 0; k < 3; k++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 12), new THREE.MeshStandardMaterial({ color: 0x331111, emissive: 0xff2030, emissiveIntensity: 0 }));
    m.position.set((k - 1) * 1.6, 8.4, -0.5);
    const housing = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 0.5), dark);
    housing.position.set((k - 1) * 1.6, 8.4, -0.2);
    g.add(housing, m);
    lights.push(m);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(g);
  return lights;
}

function buildOverheadBanner(scene, track, i, [text, bg, fg]) {
  const p = track.point(i, 0);
  const g = new THREE.Group();
  g.position.set(p.x, p.y, p.z);
  g.rotation.y = track.heading(i);
  const span = (WALL_DIST + 1.2) * 2;
  const pole = new THREE.MeshStandardMaterial({ color: 0xdde2ea, roughness: 0.35, metalness: 0.6 });
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 9.5, 10), pole);
    m.position.set((s * span) / 2, 4.75, 0);
    g.add(m);
  }
  const t = TX.bannerTexture(text, bg, fg, { w: 1024, h: 96 });
  // two single-sided faces so the text reads correctly from both directions
  const mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 });
  const banner = new THREE.Group();
  for (const flip of [0, Math.PI]) {
    const face = new THREE.Mesh(new THREE.PlaneGeometry(span, 2.3), mat);
    face.rotation.y = flip;
    face.position.z = flip ? 0.03 : -0.03;
    banner.add(face);
  }
  banner.position.y = 8.3;
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, span, 8).rotateZ(Math.PI / 2), pole);
  bar.position.y = 9.5;
  g.add(banner, bar);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(g);
}

function scatterFlora(scene, track, theme, rand, terrainH, lake) {
  const F = theme.flora, B = track.bounds, R = B.r + 230;
  const tint = theme.tint || null;
  const pick = (list) => { let x = rand() * list.reduce((a, l) => a + l[2], 0); for (const l of list) { x -= l[2]; if (x <= 0) return l; } return list[0]; };
  const buckets = new Map();
  const add = (entry, x, z, scaleJitter) => {
    const [name, size] = entry;
    const y = terrainH(x, z);
    if (!buckets.has(name)) buckets.set(name, { size, list: [] });
    buckets.get(name).list.push(placeMatrix(x, y - 0.15, z, rand() * Math.PI * 2, 0.75 + rand() * scaleJitter));
  };
  const inLake = (x, z, pad) => lake && Math.hypot(x - lake.x, z - lake.z) < lake.r + pad;
  const scatter = (count, list, dMin, dMax, clump, jitter) => {
    let n = 0, tries = 0;
    while (n < count && tries++ < count * 30) {
      let x, z;
      if (dMax < 80) {
        // near the track: pick a sample and push outwards
        const i = Math.floor(rand() * track.N), side = rand() < 0.5 ? -1 : 1, off = dMin + rand() * (dMax - dMin);
        x = track.px[i] + track.nx[i] * off * side; z = track.pz[i] + track.nz[i] * off * side;
      } else { x = B.cx + (rand() * 2 - 1) * R; z = B.cz + (rand() * 2 - 1) * R; }
      const d = track.distTo(x, z, 3);
      if (d < dMin || d > dMax || inLake(x, z, 4)) continue;
      if (clump && fbm(x / 45, z / 45) < clump) continue;
      add(pick(list), x, z, jitter);
      n++;
    }
  };
  scatter(F.treeCount, F.trees, WALL_DIST + 9, R, 0.42, 0.6);
  scatter(F.bushCount, F.bushes, WALL_DIST + 2.5, 70, 0.3, 0.6);
  scatter(F.groundCount, F.ground, WALL_DIST + 1.4, 60, 0.25, 0.7);
  scatter(F.rockCount, F.rocks, WALL_DIST + 6, R, 0, 1.2);
  // a few big hero trees framing the start straight
  for (let k = -3; k <= 3; k++) {
    const i = track.wrap(k * 26 - 40), side = k % 2 ? 1 : -1, off = WALL_DIST + 16 + rand() * 6;
    add(F.trees[0], track.px[i] + track.nx[i] * off * side, track.pz[i] + track.nz[i] * off * side, 0.5);
  }
  for (const [name, { size, list }] of buckets) {
    const g = instanced(name, list, { size, fit: 'height', tint, castShadow: size > 2, chunk: 220 });
    scene.add(g);
  }
}

function findLake(track, rand) {
  const B = track.bounds;
  let best = null;
  for (let k = 0; k < 400; k++) {
    const x = B.cx + (rand() * 2 - 1) * (B.r + 60), z = B.cz + (rand() * 2 - 1) * (B.r + 60);
    const d = track.distTo(x, z, 3);
    if (!best || d > best.d) best = { x, z, d };
    if (d > 85) break;
  }
  return { x: best.x, z: best.z, r: Math.min(55, best.d - WALL_DIST - 22) };
}

function buildMountains(B, theme, rand) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 });
  const c0 = new THREE.Color(theme.mountains[0]), c1 = new THREE.Color(theme.mountains[1]), snow = new THREE.Color(0xf6f9ff);
  for (let k = 0; k < 44; k++) {
    const a = (k / 44) * Math.PI * 2 + rand() * 0.1;
    const dist = 820 + rand() * 360;
    const h = 150 + rand() * 260, r = 120 + rand() * 170;
    const geo = new THREE.ConeGeometry(r, h, 7 + Math.floor(rand() * 3), 4);
    const p = geo.attributes.position;
    const cols = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) + h / 2, jitter = y < h * 0.95 ? 1 : 0;
      p.setX(i, p.getX(i) + (hash2(i, k) - 0.5) * r * 0.25 * jitter);
      p.setZ(i, p.getZ(i) + (hash2(k, i) - 0.5) * r * 0.25 * jitter);
      const c = c0.clone().lerp(c1, hash2(i * 3, k));
      if (theme.snowCaps && y / h > 0.62) c.lerp(snow, 0.9);
      cols.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    m.position.set(B.cx + Math.cos(a) * dist, h / 2 - 20, B.cz + Math.sin(a) * dist);
    g.add(m);
  }
  return g;
}

// sandstone mesas with stripes for the canyon
function buildMesas(track, theme, rand, terrainH) {
  const g = new THREE.Group(), B = track.bounds;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 });
  const bands = [0xc2572f, 0xe08a4f, 0xb04a2a, 0xeaa36a].map((c) => new THREE.Color(c));
  let placed = 0, tries = 0;
  while (placed < 26 && tries++ < 2000) {
    const a = rand() * Math.PI * 2, dist = B.r * 0.6 + rand() * 480;
    const x = B.cx + Math.cos(a) * dist, z = B.cz + Math.sin(a) * dist;
    const r = 18 + rand() * 45;
    if (track.distTo(x, z, 4) < r + WALL_DIST + 30) continue;
    const h = 35 + rand() * 70;
    const geo = new THREE.CylinderGeometry(r * (0.75 + rand() * 0.15), r, h, 7 + Math.floor(rand() * 4), 6);
    const p = geo.attributes.position, cols = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      p.setX(i, p.getX(i) * (0.9 + hash2(i, placed) * 0.2)); p.setZ(i, p.getZ(i) * (0.9 + hash2(placed, i) * 0.2));
      const c = bands[Math.max(0, Math.floor(((p.getY(i) + h / 2) / h) * 5.99)) % bands.length];
      cols.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, terrainH(x, z) + h / 2 - 3, z);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    placed++;
  }
  return g;
}

function buildClouds(B, theme, rand) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xe6eef8, emissiveIntensity: 0.75, flatShading: true, fog: false });
  const geo = new THREE.IcosahedronGeometry(1, 1);
  for (let k = 0; k < theme.clouds; k++) {
    const c = new THREE.Group();
    const n = 5 + Math.floor(rand() * 5);
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(geo, mat);
      const s = 12 + rand() * 18;
      m.scale.set(s * 1.4, s * 0.75, s);
      m.position.set(i * 16 - n * 8 + rand() * 6, rand() * 8, rand() * 16);
      c.add(m);
    }
    c.position.set(B.cx + (rand() * 2 - 1) * 900, 180 + rand() * 140, B.cz + (rand() * 2 - 1) * 900);
    c.userData.v = 2 + rand() * 3;
    g.add(c);
  }
  return g;
}

function buildBalloons(B, theme, rand) {
  const g = new THREE.Group();
  const palettes = [[0xff4d5e, 0xffd23f], [0x3d8bff, 0xffffff], [0x35d97c, 0xffd23f], [0xa66bff, 0xff6bc6], [0xff8a3d, 0x2fd6d0]];
  for (let k = 0; k < (theme.balloons || 0); k++) {
    const [a, b] = palettes[k % palettes.length].map((c) => new THREE.Color(c));
    const geo = new THREE.SphereGeometry(9, 16, 12);
    const p = geo.attributes.position, cols = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const ang = Math.atan2(p.getZ(i), p.getX(i));
      if (p.getY(i) < 0) p.setY(i, p.getY(i) * 1.35);
      const c = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 12) % 2 ? a : b;
      cols.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    const bal = new THREE.Group();
    bal.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 })));
    const basket = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.2, 1.6, 8), new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.9 }));
    basket.position.y = -17;
    bal.add(basket);
    const ang = rand() * Math.PI * 2, dist = B.r * 0.5 + 60 + rand() * 260;
    bal.position.set(B.cx + Math.cos(ang) * dist, 0, B.cz + Math.sin(ang) * dist);
    bal.userData.y = 70 + rand() * 60;
    g.add(bal);
  }
  return g;
}

function buildSnow(B) {
  const COUNT = 7000, W = B.r * 2 + 120, H = 80;
  const pos = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) pos.set([B.cx + (Math.random() - 0.5) * W, Math.random() * H, B.cz + (Math.random() - 0.5) * W], i * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.35, map: TX.softDot(), transparent: true, depthWrite: false, opacity: 0.9 }));
  points.frustumCulled = false;
  return {
    points,
    update(t, dt) {
      const p = geo.attributes.position.array;
      for (let i = 0; i < COUNT; i++) {
        p[i * 3 + 1] -= dt * (3 + (i % 5));
        p[i * 3] += Math.sin(t + i) * dt * 0.8;
        if (p[i * 3 + 1] < -5) p[i * 3 + 1] += H;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}

// Loads the GLB models and hands out normalised clones, instanced batches and paintable karts.
//   karts/*   – Poly Pizza karts (see KART_TYPES credits)
//   nature/*  – Quaternius "Stylized Nature MegaKit" (CC0)
//   racing/*, toy/*, car/* – Kenney kits (CC0)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { KART_TYPES } from './shared.js';

const MODELS = { banana: 'toy/item-banana.glb', cone: 'car/cone.glb' };
for (const k of KART_TYPES) MODELS['kart:' + k.id] = `karts/${k.model}.glb`;
for (const n of ['tree1', 'tree3', 'tree4', 'pine1', 'pine3', 'pine4', 'twisted1', 'dead1', 'bush', 'bushflowers', 'flowers1', 'flowers2',
  'grass', 'tallgrass', 'fern', 'rock1', 'rock2']) MODELS[n] = `nature/${n}.glb`;
for (const n of ['grandStandCovered', 'bannerTowerRed', 'bannerTowerGreen', 'lightPostLarge', 'flagCheckers', 'tent', 'tentLong',
  'pitsGarage', 'billboard', 'billboardLow', 'radarEquipment']) MODELS[n] = `racing/${n}.glb`;
export const FRUITS = ['watermelon', 'apple', 'banana', 'pineapple', 'orange', 'lemon', 'pear', 'strawberry', 'coconut', 'grapes', 'cherries', 'avocado', 'pumpkin'];
for (const n of [...FRUITS, 'cheese', 'sausage-half', 'mushroom-half', 'paprika-slice', 'onion-half', 'tomato-slice', 'bottle-ketchup', 'cutting-board-round',
  'pizza-box', 'pizza', 'bowl', 'rollingPin', 'soda-can', 'cup-coffee']) MODELS['food:' + n] = `food/${n}.glb`;
export const PEOPLE = ['character-female-a', 'character-female-b', 'character-female-c', 'character-female-d', 'character-male-a', 'character-male-b', 'character-male-c', 'character-male-d'];
for (const n of PEOPLE) MODELS['people:' + n] = `people/${n}.glb`;
for (const n of ['kitchenCabinet', 'kitchenCabinetDrawer', 'kitchenBar', 'kitchenBarEnd', 'kitchenFridgeLarge', 'kitchenCabinetUpper', 'kitchenCabinetUpperDouble',
  'hoodLarge', 'kitchenSink', 'trashcan', 'plantSmall1', 'plantSmall2', 'pottedPlant', 'lampSquareCeiling', 'stoolBar', 'tableRound', 'chair', 'kitchenCoffeeMachine']) MODELS['furniture:' + n] = `furniture/${n}.glb`;

const cache = {};
const kartTemplates = {};
const animCache = {};

export async function loadAssets(onProgress = () => {}) {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const names = Object.keys(MODELS);
  let done = 0;
  await Promise.all(names.map((name) => loader.loadAsync('/assets/' + MODELS[name]).then((g) => {
    const root = g.scene;
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      for (const m of [].concat(o.material)) {
        if (m.map) m.map.anisotropy = 4;
        m.metalness = Math.min(m.metalness ?? 0, 0.25);
        if (m.transparent && m.map) { m.alphaTest = 0.45; m.transparent = false; m.depthWrite = true; m.side = THREE.DoubleSide; } // foliage cards
        // Quaternius nature models keep wind/AO data (with zero alpha) in vertex colours — not meant as colour
        if (MODELS[name].startsWith('nature/')) { m.vertexColors = false; m.roughness = 0.85; }
      }
    });
    cache[name] = root;
    if (g.animations?.length) animCache[name] = g.animations;
    onProgress(++done / names.length);
  })));
  for (const k of KART_TYPES) kartTemplates[k.id] = buildKartTemplate(cache['kart:' + k.id], k);
}

/**
 * A normalised clone: bottom-centre on the origin, scaled so that `size` matches
 * the chosen dimension ('height', 'width' (x), 'length' (z) or 'max').
 */
export function model(name, { size = 1, fit = 'max', center = true } = {}) {
  const src = cache[name];
  if (!src) throw new Error('Model not loaded: ' + name);
  const inner = src.clone(true);
  const box = new THREE.Box3().setFromObject(inner);
  const dim = box.getSize(new THREE.Vector3());
  const ref = fit === 'height' ? dim.y : fit === 'width' ? dim.x : fit === 'length' ? dim.z : Math.max(dim.x, dim.y, dim.z);
  const s = size / (ref || 1);
  const c = box.getCenter(new THREE.Vector3());
  inner.position.set(center ? -c.x : 0, -box.min.y, center ? -c.z : 0);
  const outer = new THREE.Group();
  outer.add(inner);
  outer.scale.setScalar(s);
  const wrap = new THREE.Group();
  wrap.add(outer);
  wrap.userData.size = dim.clone().multiplyScalar(s);
  return wrap;
}

/** Many copies of one model as InstancedMeshes. transforms: Matrix4[] */
// opts.chunk (world units) splits the copies into spatial cells so each camera can frustum-cull them.
export function instanced(name, transforms, opts = {}) {
  const proto = model(name, opts);
  proto.updateMatrixWorld(true);
  const group = new THREE.Group();
  if (!transforms.length) return group;
  const cells = new Map();
  for (const m of transforms) {
    const key = opts.chunk ? `${Math.floor(m.elements[12] / opts.chunk)},${Math.floor(m.elements[14] / opts.chunk)}` : 'all';
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(m);
  }
  const tmp = new THREE.Matrix4();
  proto.traverse((o) => {
    if (!o.isMesh) return;
    let material = o.material;
    if (opts.tint) material = tintMaterial(material, opts.tint);
    for (const list of cells.values()) {
      const im = new THREE.InstancedMesh(o.geometry, material, list.length);
      list.forEach((m, i) => im.setMatrixAt(i, tmp.multiplyMatrices(m, o.matrixWorld)));
      im.castShadow = opts.castShadow !== false;
      im.receiveShadow = true;
      if (opts.chunk) im.computeBoundingSphere(); else im.frustumCulled = false;
      group.add(im);
    }
  });
  return group;
}

function tintMaterial(material, tint) {
  const list = [].concat(material);
  const out = list.map((m) => {
    const key = Object.keys(tint).find((k) => m.name.toLowerCase().includes(k));
    if (!key) return m;
    const c = m.clone();
    c.color = new THREE.Color(tint[key]);
    return c;
  });
  return Array.isArray(material) ? out : out[0];
}

export function has(name) { return !!cache[name]; }

/** Animated character clone (skinned meshes need SkeletonUtils). Returns { root, mixer, actions, play(name, fade) } */
export function character(name, height = 1.7) {
  const src = cache[name];
  const inner = SkeletonUtils.clone(src);
  inner.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  const box = new THREE.Box3().setFromObject(src);
  const s = height / (box.max.y - box.min.y || 1);
  inner.scale.setScalar(s);
  const root = new THREE.Group();
  root.add(inner);
  const mixer = new THREE.AnimationMixer(inner);
  const actions = {};
  for (const clip of animCache[name] || []) actions[clip.name] = mixer.clipAction(clip);
  let current = null;
  return {
    root, mixer, actions,
    play(clipName, fade = 0.25, once = false) {
      const a = actions[clipName];
      if (!a || a === current) return a;
      a.reset();
      a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      a.clampWhenFinished = once;
      a.fadeIn(fade).play();
      if (current) current.fadeOut(fade);
      current = a;
      return a;
    },
  };
}

// ------------------------------------------------------------------ karts
// The downloaded karts are mostly single merged meshes. To animate wheels we split every mesh into
// connected pieces, find the round pieces touching the ground at the four corners (tyres), and pull
// out everything nested inside them (rims, hubs) as separate wheel groups.

function subset(geo, keep) {
  // keep: Uint8Array per triangle
  const out = new THREE.BufferGeometry();
  const tris = keep.reduce((a, b) => a + b, 0);
  for (const [name, attr] of Object.entries(geo.attributes)) {
    const size = attr.itemSize;
    const arr = new Float32Array(tris * 3 * size);
    let w = 0;
    for (let t = 0; t < keep.length; t++) {
      if (!keep[t]) continue;
      for (let v = 0; v < 3; v++) for (let c = 0; c < size; c++) arr[w++] = attr.getComponent(t * 3 + v, c);
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  return out;
}

function components(geo) {
  const pos = geo.attributes.position, triCount = pos.count / 3;
  const parent = new Int32Array(triCount).map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const seen = new Map();
  for (let v = 0; v < pos.count; v++) {
    const key = `${Math.round(pos.getX(v) * 2000)},${Math.round(pos.getY(v) * 2000)},${Math.round(pos.getZ(v) * 2000)}`;
    const t = (v / 3) | 0;
    if (seen.has(key)) { const a = find(seen.get(key)), b = find(t); if (a !== b) parent[a] = b; }
    else seen.set(key, t);
  }
  const groups = new Map();
  for (let t = 0; t < triCount; t++) {
    const r = find(t);
    if (!groups.has(r)) groups.set(r, { tris: [], box: new THREE.Box3() });
    const g = groups.get(r);
    g.tris.push(t);
    for (let v = 0; v < 3; v++) g.box.expandByPoint(new THREE.Vector3().fromBufferAttribute(pos, t * 3 + v));
  }
  return [...groups.values()];
}

function buildKartTemplate(src, type) {
  const wrap = new THREE.Group();
  const root = src.clone(true);
  root.rotation.y = THREE.MathUtils.degToRad(type.yaw);
  wrap.add(root);
  wrap.updateMatrixWorld(true);

  // bake every mesh into kart space
  const parts = [];
  wrap.traverse((o) => {
    if (!o.isMesh) return;
    let geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'color', 'uv'].includes(k)) geo.deleteAttribute(k);
    // de-quantize to plain floats
    for (const k of Object.keys(geo.attributes)) {
      const a = geo.attributes[k];
      if (!(a.array instanceof Float32Array) || a.normalized) {
        const f = new Float32Array(a.count * a.itemSize);
        for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) f[i * a.itemSize + c] = a.getComponent(i, c);
        geo.setAttribute(k, new THREE.BufferAttribute(f, a.itemSize));
      }
    }
    geo.applyMatrix4(o.matrixWorld);
    parts.push({ geo, material: o.material });
  });
  const box = new THREE.Box3();
  for (const p of parts) { p.geo.computeBoundingBox(); box.union(p.geo.boundingBox); }
  const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const s = type.length / size.z;
  for (const p of parts) { p.geo.translate(-c.x, -box.min.y, -c.z); p.geo.scale(s, s, s); }
  const L = size.z * s, W = size.x * s, H = size.y * s;

  // --- find tyres
  const comps = [];
  parts.forEach((p, pi) => components(p.geo).forEach((cm) => comps.push({ ...cm, part: pi })));
  const tyres = comps.filter(({ box: b }) => {
    const d = b.getSize(new THREE.Vector3()), ctr = b.getCenter(new THREE.Vector3());
    return b.min.y < H * 0.12 && d.y > Math.max(0.25, H * 0.2) && Math.abs(d.y - d.z) < 0.35 * Math.max(d.y, d.z) && d.x < d.y * 1.4 && Math.abs(ctr.x) > W * 0.15;
  }).sort((a, b) => b.box.max.y - a.box.max.y);
  const wheels = [];
  for (const t of tyres) {
    const ctr = t.box.getCenter(new THREE.Vector3());
    if (wheels.some((w) => w.center.distanceTo(ctr) < w.radius)) continue;
    const d = t.box.getSize(new THREE.Vector3());
    wheels.push({ center: ctr, radius: d.y / 2, box: t.box.clone().expandByScalar(0.03), members: [] });
  }
  const ok = wheels.length >= 3 && wheels.length <= 6;
  const inWheel = parts.map((p) => new Uint8Array(p.geo.attributes.position.count / 3));
  if (ok) {
    for (const cm of comps) {
      const w = wheels.find((w) => w.box.containsBox(cm.box));
      if (!w) continue;
      w.members.push(cm);
      for (const t of cm.tris) inWheel[cm.part][t] = 1;
    }
  }

  // --- body meshes + paint detection
  const body = [];
  const areaByMat = new Map();
  parts.forEach((p, pi) => {
    const keep = inWheel[pi].map((v) => 1 - v);
    if (!keep.some(Boolean)) return;
    const g = subset(p.geo, keep);
    g.computeBoundingSphere();
    body.push({ geo: g, material: p.material });
    const pos = g.attributes.position, a = new THREE.Vector3(), b = new THREE.Vector3(), cc = new THREE.Vector3();
    let area = 0;
    for (let i = 0; i < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1).sub(a); cc.fromBufferAttribute(pos, i + 2).sub(a);
      area += b.cross(cc).length() / 2;
    }
    areaByMat.set(p.material, (areaByMat.get(p.material) || 0) + area);
  });
  const hsl = {};
  const sat = [...areaByMat.entries()].filter(([m]) => {
    m.color.getHSL(hsl);
    return !m.map && hsl.s > 0.3 && hsl.l > 0.12 && hsl.l < 0.85;
  }).sort((a, b) => b[1] - a[1]);
  const paint = new Map();
  if (sat.length) {
    const main = sat[0][0].color.getHSL({});
    for (const [m] of sat) {
      const h = m.color.getHSL({});
      const dh = Math.min(Math.abs(h.h - main.h), 1 - Math.abs(h.h - main.h));
      if (dh < 0.08) paint.set(m, h.l / main.l); // same colour family → repaint, keeping relative shade
    }
  }

  const wheelDefs = ok ? wheels.map((w) => {
    const geos = new Map();
    for (const cm of w.members) {
      const keep = new Uint8Array(parts[cm.part].geo.attributes.position.count / 3);
      for (const t of cm.tris) keep[t] = 1;
      const g = subset(parts[cm.part].geo, keep);
      g.translate(-w.center.x, -w.center.y, -w.center.z);
      const m = parts[cm.part].material;
      geos.set(m, [...(geos.get(m) || []), g]);
    }
    return { center: w.center, radius: w.radius, front: w.center.z > 0, meshes: [...geos.entries()] };
  }) : [];
  return { body, wheels: wheelDefs, paint, L, W, H };
}

const matCache = new Map();
function kartMaterial(m, paintRatio, hex) {
  const key = m.uuid + (paintRatio ? hex : '');
  if (matCache.has(key)) return matCache.get(key);
  const color = paintRatio ? new THREE.Color(hex).multiplyScalar(Math.min(1.25, paintRatio)) : m.color.clone();
  const out = new THREE.MeshPhysicalMaterial({
    color, map: m.map || null, vertexColors: !!m.vertexColors, side: m.side,
    roughness: paintRatio ? 0.32 : Math.max(0.45, m.roughness ?? 0.6), metalness: paintRatio ? 0.1 : Math.min(0.3, m.metalness ?? 0),
    clearcoat: paintRatio ? 1 : 0.2, clearcoatRoughness: 0.18,
  });
  matCache.set(key, out);
  return out;
}

/** A fresh kart mesh in the given paint colour. Returns { group, wheels:[{node, front, radius}], L, W, H } */
export function kartMesh(typeId, hex) {
  const T = kartTemplates[typeId];
  const group = new THREE.Group();
  for (const { geo, material } of T.body) {
    const mesh = new THREE.Mesh(geo, kartMaterial(material, T.paint.get(material), hex));
    mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);
  }
  const wheels = T.wheels.map((w) => {
    const node = new THREE.Group();
    node.position.copy(w.center);
    for (const [material, geos] of w.meshes) for (const g of geos) {
      const mesh = new THREE.Mesh(g, kartMaterial(material, 0, hex));
      mesh.castShadow = true;
      node.add(mesh);
    }
    group.add(node);
    return { node, front: w.front, radius: w.radius };
  });
  return { group, wheels, L: T.L, W: T.W, H: T.H };
}
export const kartInfo = (typeId) => { const T = kartTemplates[typeId]; return { wheels: T.wheels.length, painted: T.paint.size, L: T.L, W: T.W, H: T.H }; };

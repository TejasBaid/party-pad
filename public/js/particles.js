// A single pooled GPU point cloud for sparks, smoke, dust and boost flames.
import * as THREE from 'three';
import { softDot } from './textures.js';

const VERT = /* glsl */`
  attribute float aSize;
  attribute vec4 aColor;
  varying vec4 vColor;
  uniform float uScale;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / max(0.1, -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
const FRAG = /* glsl */`
  uniform sampler2D uMap;
  varying vec4 vColor;
  void main() {
    vec4 t = texture2D(uMap, gl_PointCoord);
    gl_FragColor = vec4(vColor.rgb, vColor.a * t.a);
    if (gl_FragColor.a < 0.01) discard;
  }`;

export class Particles {
  constructor(max = 4000) {
    this.max = max;
    this.p = new Float32Array(max * 3);
    this.v = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size0 = new Float32Array(max);
    this.size1 = new Float32Array(max);
    this.col = new Float32Array(max * 4);
    this.drag = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.cursor = 0;

    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    this.aColor = new THREE.BufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos);
    geo.setAttribute('aSize', this.aSize);
    geo.setAttribute('aColor', this.aColor);
    this.uniforms = { uMap: { value: softDot() }, uScale: { value: 400 } };
    const mk = (blending) => new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending });
    // Two layers share buffers: additive (glowy) and normal (smoke). Colour alpha < 0 marks "normal" particles.
    this.points = new THREE.Points(geo, mk(THREE.AdditiveBlending));
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    this.smokeGeo = new THREE.BufferGeometry();
    this.sPos = new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.sSize = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    this.sColor = new THREE.BufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.smokeGeo.setAttribute('position', this.sPos);
    this.smokeGeo.setAttribute('aSize', this.sSize);
    this.smokeGeo.setAttribute('aColor', this.sColor);
    this.smoke = new THREE.Points(this.smokeGeo, mk(THREE.NormalBlending));
    this.smoke.frustumCulled = false;
    this.smoke.renderOrder = 9;
    this.additive = new Uint8Array(max);
  }

  addTo(scene) { scene.add(this.points, this.smoke); }

  setViewportHeight(h) { this.uniforms.uScale.value = h * 0.9; }

  /** emit one particle */
  emit(x, y, z, vx, vy, vz, { life = 0.6, size = 0.6, size1 = size, color = [1, 1, 1], alpha = 1, drag = 1, gravity = 0, additive = true } = {}) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.p.set([x, y, z], i * 3);
    this.v.set([vx, vy, vz], i * 3);
    this.life[i] = life; this.maxLife[i] = life;
    this.size0[i] = size; this.size1[i] = size1;
    this.col.set([color[0], color[1], color[2], alpha], i * 4);
    this.drag[i] = drag; this.grav[i] = gravity;
    this.additive[i] = additive ? 1 : 0;
  }

  update(dt) {
    const { p, v, life, maxLife } = this;
    const ap = this.aPos.array, as = this.aSize.array, ac = this.aColor.array;
    const sp = this.sPos.array, ss = this.sSize.array, sc = this.sColor.array;
    for (let i = 0; i < this.max; i++) {
      if (life[i] <= 0) { as[i] = 0; ss[i] = 0; continue; }
      life[i] -= dt;
      const k = Math.exp(-this.drag[i] * dt);
      v[i * 3] *= k; v[i * 3 + 1] = v[i * 3 + 1] * k - this.grav[i] * dt; v[i * 3 + 2] *= k;
      p[i * 3] += v[i * 3] * dt; p[i * 3 + 1] += v[i * 3 + 1] * dt; p[i * 3 + 2] += v[i * 3 + 2] * dt;
      const t = Math.max(0, life[i] / maxLife[i]);
      const size = this.size1[i] + (this.size0[i] - this.size1[i]) * t;
      const a = this.col[i * 4 + 3] * Math.min(1, t * 2.5);
      const [P, S, C] = this.additive[i] ? [ap, as, ac] : [sp, ss, sc];
      const [P2, S2] = this.additive[i] ? [sp, ss] : [ap, as];
      S2[i] = 0; P2[i * 3 + 1] = -1000;
      P[i * 3] = p[i * 3]; P[i * 3 + 1] = p[i * 3 + 1]; P[i * 3 + 2] = p[i * 3 + 2];
      S[i] = life[i] > 0 ? size : 0;
      C[i * 4] = this.col[i * 4]; C[i * 4 + 1] = this.col[i * 4 + 1]; C[i * 4 + 2] = this.col[i * 4 + 2]; C[i * 4 + 3] = a;
    }
    for (const a of [this.aPos, this.aSize, this.aColor, this.sPos, this.sSize, this.sColor]) a.needsUpdate = true;
  }
}

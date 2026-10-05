import * as THREE from 'three';

// A small, fast particle system for smoke and puffs: tyre smoke, snow spray,
// nitro sparks, breath clouds in the cold, chimney smoke.
//
// All particles live in ONE THREE.Points object (1 draw call). A small custom
// shader gives every particle its own size, transparency, colour and spin,
// draws it as a soft wispy puff (not a flat disc), lets it fade into the fog,
// and darkens it at night (smoke isn't a light: it's lit by the sky).

const VERT = /* glsl */`
  attribute float size;
  attribute float alpha;
  attribute vec3 tint;
  attribute float rot;
  varying float vAlpha;
  varying vec3 vTint;
  varying float vRot;
  #include <fog_pars_vertex>
  void main() {
    vAlpha = alpha;
    vTint = tint;
    vRot = rot;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * (300.0 / -mvPosition.z);   // shrink with distance
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const FRAG = /* glsl */`
  uniform sampler2D puff;
  uniform vec3 ambient;
  varying float vAlpha;
  varying vec3 vTint;
  varying float vRot;
  #include <fog_pars_fragment>
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float s = sin(vRot), k = cos(vRot);
    c = vec2(k * c.x - s * c.y, s * c.x + k * c.y);
    float a = vAlpha * texture2D(puff, c + 0.5).a;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vTint * ambient, a);
    #include <fog_fragment>
  }
`;

/** A soft, lumpy puff of smoke (white, with the shape in the alpha). */
let puffTex = null;
function getPuffTexture() {
  if (puffTex) return puffTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  let seed = 3;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  // Overlapping soft blobs make a cloudy shape...
  for (let i = 0; i < 14; i++) {
    const a = rnd() * Math.PI * 2, r = rnd() * 12;
    const x = 32 + Math.cos(a) * r, y = 32 + Math.sin(a) * r, rad = 10 + rnd() * 12;
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, 'rgba(255,255,255,0.32)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  // ...faded out towards the edge so it never shows a square
  g.globalCompositeOperation = 'destination-in';
  const edge = g.createRadialGradient(32, 32, 10, 32, 32, 31);
  edge.addColorStop(0, 'rgba(255,255,255,1)');
  edge.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = edge;
  g.fillRect(0, 0, 64, 64);
  puffTex = new THREE.CanvasTexture(c);
  return puffTex;
}

export class ParticleSystem {
  constructor(scene, max = 300) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.tint = new Float32Array(max * 3);
    this.rot = new Float32Array(max);
    this.spin = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.drag = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.startAlpha = new Float32Array(max);
    this.fadeIn = new Float32Array(max);
    this.next = 0;

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('tint', new THREE.BufferAttribute(this.tint, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('rot', new THREE.BufferAttribute(this.rot, 1).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { puff: { value: null }, ambient: { value: new THREE.Color(1, 1, 1) } }]),
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, fog: true,
    }));
    this.points.material.uniforms.puff.value = getPuffTexture();
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  /**
   * How much light falls on the smoke: 0 = night, 1 = day. Smoke at night is
   * a dim blue-grey; by day it's bright.
   */
  setDaylight(day) {
    const a = this.points.material.uniforms.ambient.value;
    a.setRGB(0.32 + day * 0.68, 0.34 + day * 0.66, 0.42 + day * 0.58);
  }

  /** Spawn one particle. glow: ignore the light (sparks, flames). */
  emit(x, y, z, { vx = 0, vy = 1, vz = 0, size = 1.5, grow = 2, life = 1.5, alpha = 0.5, color = [0.6, 0.6, 0.6], drag = 0, spin = null, fadeIn = 0.12, glow = false } = {}) {
    const i = this.next;
    this.next = (this.next + 1) % this.max; // reuse the oldest particle
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.size[i] = size;
    this.grow[i] = grow;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.startAlpha[i] = alpha;
    this.drag[i] = drag;
    this.fadeIn[i] = Math.min(fadeIn, life * 0.5);
    this.rot[i] = Math.random() * Math.PI * 2;
    this.spin[i] = spin ?? (Math.random() - 0.5) * 1.2;
    // (Glowing particles are brightened so the night darkening cancels out)
    const k = glow ? 2.6 : 1;
    this.tint[i * 3] = color[0] * k; this.tint[i * 3 + 1] = color[1] * k; this.tint[i * 3 + 2] = color[2] * k;
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const age = this.maxLife[i] - this.life[i];
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      const d = this.drag[i] ? Math.exp(-this.drag[i] * dt) : 1;
      this.vel[i * 3] *= d; this.vel[i * 3 + 1] *= d; this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = Math.max(0.02, this.size[i] + this.grow[i] * dt);
      this.rot[i] += this.spin[i] * dt;
      // Fade in quickly, then out (softly at the end)
      const fin = this.fadeIn[i] > 0 ? Math.min(1, age / this.fadeIn[i]) : 1;
      this.alpha[i] = this.startAlpha[i] * fin * k * (2 - k);
    }
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = true;
    a.size.needsUpdate = true;
    a.alpha.needsUpdate = true;
    a.tint.needsUpdate = true;
    a.rot.needsUpdate = true;
  }

  /** Remove every particle. */
  clear() {
    this.life.fill(0);
    this.alpha.fill(0);
  }

  dispose() {
    this.points.parent?.remove(this.points);
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}

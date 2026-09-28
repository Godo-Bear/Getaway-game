import * as THREE from 'three';

// A small, fast particle system for smoke (engine damage, tyre smoke).
//
// All particles live in ONE THREE.Points object (1 draw call). A tiny custom
// shader lets every particle have its own size and transparency, which the
// built-in PointsMaterial can't do.

const VERT = /* glsl */`
  attribute float size;
  attribute float alpha;
  attribute vec3 tint;
  varying float vAlpha;
  varying vec3 vTint;
  void main() {
    vAlpha = alpha;
    vTint = tint;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * (300.0 / -mv.z);   // shrink with distance
    gl_Position = projectionMatrix * mv;
  }
`;
const FRAG = /* glsl */`
  varying float vAlpha;
  varying vec3 vTint;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float soft = smoothstep(0.5, 0.0, d);   // soft round puff
    gl_FragColor = vec4(vTint, vAlpha * soft);
  }
`;

export class ParticleSystem {
  constructor(scene, max = 300) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.tint = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.startAlpha = new Float32Array(max);
    this.next = 0;

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('tint', new THREE.BufferAttribute(this.tint, 3).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(g, new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  /** Spawn one particle. */
  emit(x, y, z, { vx = 0, vy = 1, vz = 0, size = 1.5, grow = 2, life = 1.5, alpha = 0.5, color = [0.6, 0.6, 0.6] } = {}) {
    const i = this.next;
    this.next = (this.next + 1) % this.max; // reuse the oldest particle
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.size[i] = size;
    this.grow[i] = grow;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.startAlpha[i] = alpha;
    this.tint[i * 3] = color[0]; this.tint[i * 3 + 1] = color[1]; this.tint[i * 3 + 2] = color[2];
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      this.alpha[i] = this.startAlpha[i] * k;
    }
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = true;
    a.size.needsUpdate = true;
    a.alpha.needsUpdate = true;
    a.tint.needsUpdate = true;
  }

  dispose() {
    this.points.parent?.remove(this.points);
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}

import * as THREE from 'three';
import { makeRng } from '../core/utils.js';

// Night-time lighting setup: a gradient sky dome (city glow at the horizon,
// deep blue overhead), fog for depth, soft ambient light, a moon that casts
// shadows, stars, and storm clouds + lightning when the weather calls for it.
//
// Real-time lights are expensive, so the city "light" mostly comes from
// emissive textures (lit windows, lamp heads, neon). Only a handful of real
// lights are used, and the shadow-casting moon follows the player so its
// shadow map only has to cover the area you can actually see up close.

export const SKY_COLOR = 0x0b0f1c;
const HORIZON_COLOR = 0x2a2238;   // purple-orange glow of city lights on the haze

const SkyShader = {
  uniforms: {
    zenith: { value: new THREE.Color(0x05070f) },
    horizon: { value: new THREE.Color(HORIZON_COLOR) },
    glow: { value: new THREE.Color(0x6a3a2a) },   // warm sodium band just above the skyline
    moonDir: { value: new THREE.Vector3(-0.4, 0.8, 0.3).normalize() },
    storm: { value: 0 },       // 0 = clear, 1 = heavy clouds
    flash: { value: 0 },       // lightning inside the clouds
    time: { value: 0 },
  },
  vertexShader: /* glsl */`
    varying vec3 vDir;
    void main() {
      vDir = normalize(position);
      vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      gl_Position = p.xyww; // always at the far plane
    }`,
  fragmentShader: /* glsl */`
    uniform vec3 zenith, horizon, glow, moonDir;
    uniform float storm, flash, time;
    varying vec3 vDir;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
    }
    float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.1; a *= 0.5; } return v; }
    void main() {
      vec3 d = normalize(vDir);
      float h = clamp(d.y, 0.0, 1.0);
      vec3 col = mix(horizon, zenith, pow(h, 0.45));
      col += glow * exp(-h * 14.0) * 0.8;                   // warm band at the skyline
      // Moon halo
      float m = max(dot(d, moonDir), 0.0);
      col += vec3(0.55, 0.62, 0.9) * (pow(m, 60.0) * 0.35 + pow(m, 900.0) * 3.0) * (1.0 - storm * 0.85);
      // Storm clouds: drifting noise, lit from below by the city and by lightning
      if (storm > 0.0) {
        vec2 uv = d.xz / (d.y + 0.15) * 1.6 + vec2(time * 0.02, time * 0.008);
        float c = smoothstep(0.35, 0.8, fbm(uv));
        vec3 cloud = mix(vec3(0.05, 0.05, 0.08), vec3(0.16, 0.12, 0.14), exp(-h * 3.0));
        col = mix(col, cloud + vec3(0.6, 0.65, 0.8) * flash * c, c * storm * smoothstep(0.0, 0.08, d.y));
        col = mix(col, horizon * 0.8, storm * 0.3);
      }
      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
    }`,
};

/** Lighting options for a graphics quality setting ('low' | 'medium' | 'high'). */
export function lightingForQuality(q) {
  return { shadows: q !== 'low', mapSize: q === 'high' ? 2048 : 1024 };
}

export class NightLighting {
  constructor(scene, { shadows = true, mapSize = 2048 } = {}) {
    this.scene = scene;
    scene.background = new THREE.Color(SKY_COLOR);
    // Linear fog: fully clear up to 60 m, fully fogged by 320 m. Its colour
    // sits between the sky and the horizon glow so distant buildings melt
    // into the haze instead of into black.
    scene.fog = new THREE.Fog(0x15131f, 60, 320);

    // Sky dome (drawn behind everything, follows the camera)
    this.skyMat = new THREE.ShaderMaterial({ ...SkyShader, uniforms: THREE.UniformsUtils.clone(SkyShader.uniforms),
      side: THREE.BackSide, depthWrite: false, fog: false });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(800, 32, 16), this.skyMat);
    this.sky.renderOrder = -1;
    this.sky.frustumCulled = false;
    scene.add(this.sky);

    // Sky/ground ambient: cool blue from above, warm sodium bounce from the streets below.
    this.hemi = new THREE.HemisphereLight(0x8094d8, 0x5a3818, 2.6);
    this.hemiBase = 2.6;
    scene.add(this.hemi);

    // Moonlight: the only shadow-casting light.
    this.moon = new THREE.DirectionalLight(0xb4c2ff, 2.2);
    this.moonOffset = new THREE.Vector3(-40, 80, 30);
    this.moon.castShadow = shadows;
    if (shadows) {
      const s = this.moon.shadow;
      s.mapSize.set(mapSize, mapSize);
      s.camera.left = -35;
      s.camera.right = 35;
      s.camera.top = 35;
      s.camera.bottom = -35;
      s.camera.near = 1;
      s.camera.far = 220;
      s.bias = -0.0006;
      s.normalBias = 0.04;
    }
    scene.add(this.moon);
    scene.add(this.moon.target);
    this.skyMat.uniforms.moonDir.value.copy(this.moonOffset).normalize();

    this._addStars();
  }

  _addStars() {
    const rng = makeRng(9);
    const n = 900, R = 700;
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = rng() * Math.PI * 2;
      const ph = rng() * Math.PI * 0.42; // upper part of the sky only
      p[i * 3] = Math.cos(th) * Math.sin(ph) * R;
      p[i * 3 + 1] = Math.cos(ph) * R;
      p[i * 3 + 2] = Math.sin(th) * Math.sin(ph) * R;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({
      color: 0xcfd6ff, size: 1.6, sizeAttenuation: false, fog: false,
    }));
    this.scene.add(this.stars);
  }

  /**
   * Storm look: 0 = clear night, 1 = heavy storm (clouds hide the moon and
   * stars, the fog closes in, the moonlight dims).
   */
  setStorm(k) {
    this.storm = k;
    this.skyMat.uniforms.storm.value = k;
    this.stars.visible = k < 0.5;
    this.moon.intensity = 2.2 * (1 - k * 0.6);
    this.scene.fog.near = 60 - k * 25;
    this.scene.fog.far = 320 - k * 110;
    this.scene.fog.color.setHex(k > 0 ? 0x12121a : 0x15131f);
  }

  /** Called every frame: sky animation and lightning brightness (0..1). */
  update(dt, flash = 0) {
    this.skyMat.uniforms.time.value += dt;
    this.skyMat.uniforms.flash.value = flash;
    this.hemi.intensity = this.hemiBase + flash * 6;
  }

  /** Keep the moon's shadow box centred on the player. */
  follow(pos) {
    this.sky.position.copy(pos);
    // Snap to a 1 m grid so shadow edges don't "swim" as you move.
    const x = Math.round(pos.x), y = Math.round(pos.y), z = Math.round(pos.z);
    this.moon.target.position.set(x, y, z);
    this.moon.position.set(x + this.moonOffset.x, y + this.moonOffset.y, z + this.moonOffset.z);
    this.stars.position.set(pos.x, 0, pos.z); // stars stay "infinitely" far away
  }
}

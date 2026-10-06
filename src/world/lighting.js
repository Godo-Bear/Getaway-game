import * as THREE from 'three';
import { makeRng } from '../core/utils.js';
import { getMaterials } from './materials.js';
import { paintEnvMap, setShaftNight } from './atmosphere.js';

// Lighting for any time of day: a gradient sky dome, fog for depth, soft
// ambient light, one shadow-casting "sky light" (the moon at night, the sun
// in the day), stars, and storm clouds + lightning when the weather calls
// for it.
//
// The time of day is an hour (0-24). A few key times (night, dawn, day,
// dusk) have hand-picked colours, and any hour in between blends the two
// nearest ones, so Free Run's day/night cycle fades smoothly.
//
// Real-time lights are expensive, so the city "light" mostly comes from
// emissive textures (lit windows, lamp heads, neon). Only a handful of real
// lights are used, and the shadow-casting light follows the player so its
// shadow map only has to cover the area you can actually see up close.

export const SKY_COLOR = 0x0b0f1c;

/** Named times for story parts and the Time of day setting. */
export const TIMES = { night: 0, dawn: 6.6, morning: 9, day: 13, afternoon: 15.5, dusk: 18.9 };

// zen/hor/glow: sky colours; fog; hs/hg/hi: ambient sky/ground colour + strength;
// lc/li: sun or moon colour + strength; stars; win: lit-window glow;
// halo: street-lamp glow on the ground; bloom; sun: 0 = moon, 1 = sun.
const NIGHT = { zen: 0x05070f, hor: 0x2a2238, glow: 0x6a3a2a, fog: 0x15131f, hs: 0x8094d8, hg: 0x5a3818, hi: 2.6, lc: 0xb4c2ff, li: 2.2, stars: 1, win: 1.4, halo: 1, bloom: 1, sun: 0, exp: 1.15 };
const DAWN = { zen: 0x3a5a90, hor: 0xf0a684, glow: 0xff8a4a, fog: 0xa89098, hs: 0xb0bce6, hg: 0x7a5a48, hi: 2.1, lc: 0xffb680, li: 2.6, stars: 0, win: 0.45, halo: 0.35, bloom: 0.55, sun: 1, exp: 1.0 };
const DAY = { zen: 0x2f6fd0, hor: 0xc4dcf0, glow: 0xfff4e4, fog: 0xb0c8de, hs: 0xd8e6ff, hg: 0x9a8c76, hi: 2.9, lc: 0xfff2dc, li: 3.5, stars: 0, win: 0.08, halo: 0, bloom: 0.3, sun: 1, exp: 0.95 };
const DUSK = { zen: 0x2a3068, hor: 0xff8c58, glow: 0xff5a2a, fog: 0x7c5a6c, hs: 0xa096cc, hg: 0x6a3c28, hi: 2.2, lc: 0xff9a58, li: 2.4, stars: 0.2, win: 1.0, halo: 0.7, bloom: 0.75, sun: 1, exp: 1.05 };
const KEYS = [[0, NIGHT], [5, NIGHT], [TIMES.dawn, DAWN], [9, DAY], [16.5, DAY], [TIMES.dusk, DUSK], [20.6, NIGHT], [24, NIGHT]];

const _a = new THREE.Color(), _b = new THREE.Color();
/** The blended look for an hour. Colours come back as THREE.Color. */
function lookAt(hour) {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && h > KEYS[i + 1][0]) i++;
  const [h0, A] = KEYS[i], [h1, B] = KEYS[i + 1];
  const t = h1 > h0 ? THREE.MathUtils.clamp((h - h0) / (h1 - h0), 0, 1) : 0;
  const k = t * t * (3 - 2 * t);
  const out = {};
  for (const key of Object.keys(A)) {
    if (['zen', 'hor', 'glow', 'fog', 'hs', 'hg', 'lc'].includes(key)) out[key] = new THREE.Color().copy(_a.setHex(A[key])).lerp(_b.setHex(B[key]), k);
    else out[key] = A[key] + (B[key] - A[key]) * k;
  }
  return out;
}

/** Where the sun is at an hour: rises in the east at 6, sets in the west at 18. */
function sunOffset(hour, out) {
  const a = ((hour - 6) / 12) * Math.PI;
  return out.set(Math.cos(a) * 85, Math.max(Math.sin(a), 0.2) * 95, 30).normalize().multiplyScalar(110);
}

// Clouds, shared by the sky and the stars (so clouds hide the stars behind
// them). cloudAt() says how much cloud there is in a direction: 0 = clear
// sky, 1 = solid cloud. cover: 0 = a few wisps .. 1 = overcast. Two layers
// of noise drift with the wind at different speeds, so the clouds slowly
// change shape as they move instead of sliding past like a picture.
const CLOUD_GLSL = /* glsl */`
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.1; a *= 0.5; } return v; }
  float cloudAt(vec3 d, float cover, float time) {
    if (cover <= 0.0 || d.y <= 0.0) return 0.0;
    vec2 uv = d.xz / (d.y + 0.12);          // (a flat layer of cloud overhead, squashed towards the horizon)
    vec2 wind = vec2(time * 0.018, time * 0.007);
    #ifdef CHEAP_CLOUDS
      float shape = fbm(uv * 2.2 + wind);   // (Low graphics: one layer)
    #else
      float shape = fbm(uv * 2.2 + wind) * 0.72 + fbm(uv * 5.0 - wind * 1.6 + 7.3) * 0.28;
    #endif
    float lo = mix(0.62, 0.26, cover);
    return smoothstep(lo, lo + 0.22, shape) * smoothstep(0.0, 0.1, d.y);
  }`;

const SkyShader = {
  uniforms: {
    zenith: { value: new THREE.Color(0x05070f) },
    horizon: { value: new THREE.Color(0x2a2238) },
    glow: { value: new THREE.Color(0x6a3a2a) },   // warm band just above the skyline
    moonDir: { value: new THREE.Vector3(-0.4, 0.8, 0.3).normalize() },
    sun: { value: 0 },         // 0 = moon, 1 = sun
    sunColor: { value: new THREE.Color(0xfff2dc) },
    storm: { value: 0 },       // 0 = clear, 1 = heavy clouds
    clouds: { value: 0.32 },   // fair-weather clouds: 0 = none, 1 = overcast
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
    uniform vec3 zenith, horizon, glow, moonDir, sunColor;
    uniform float storm, clouds, flash, time, sun;
    varying vec3 vDir;
    ${CLOUD_GLSL}
    void main() {
      vec3 d = normalize(vDir);
      float h = clamp(d.y, 0.0, 1.0);
      vec3 col = mix(horizon, zenith, pow(h, 0.45));
      col += glow * exp(-h * 14.0) * mix(0.8, 0.25, sun);  // warm band at the skyline
      // Sunrise and sunset: when the sun is low, the sky round it burns
      // orange, and the opposite side of the sky turns pink and violet.
      float low = sun * (1.0 - smoothstep(0.08, 0.5, moonDir.y));
      vec2 sx = moonDir.xz / max(length(moonDir.xz), 0.001);
      float facing = max(dot(d.xz, sx) / max(length(d.xz), 0.001), 0.0);
      col += glow * low * pow(facing, 3.0) * exp(-h * 4.5) * 0.9;
      col += vec3(0.22, 0.1, 0.2) * low * (1.0 - facing) * exp(-h * 3.0) * 0.45;
      // Moon (small, cold) or sun (bigger, warm) halo; a low sun is big and red
      float m = max(dot(d, moonDir), 0.0);
      vec3 moonC = vec3(0.55, 0.62, 0.9) * (pow(m, 60.0) * 0.35 + pow(m, 900.0) * 3.0);
      vec3 sunC = sunColor * (pow(m, 8.0) * 0.25 + pow(m, 80.0) * 0.6 + pow(m, 1400.0) * 6.0);
      sunC += glow * low * (pow(m, 30.0) * 0.5 + pow(m, 500.0) * 2.0);
      // Clouds drift across, and hide the sun or moon when they pass in front
      float cover = max(clouds, storm);
      float c = cloudAt(d, cover, time);
      col += mix(moonC, sunC, sun) * (1.0 - storm * 0.85) * (1.0 - c * 0.9);
      // Cloud colour. At night: dark, lit orange from below by the city.
      // By day: white tops and grey bellies, hazy near the horizon.
      vec3 cloud = mix(vec3(0.045, 0.05, 0.075), vec3(0.2, 0.14, 0.13), exp(-h * 3.0));
      vec3 day = mix(vec3(1.25, 1.25, 1.28), vec3(0.62, 0.66, 0.74), c * 0.75);
      day = mix(day, horizon, (1.0 - smoothstep(0.0, 0.3, h)) * 0.5);
      cloud = mix(cloud, day, sun);
      // ...glowing orange and pink at sunrise and sunset, brightest towards the sun
      cloud = mix(cloud, glow * 1.15 + vec3(0.14, 0.05, 0.12), low * (0.3 + 0.7 * facing) * 0.85);
      // ...with bright edges round the sun or the moon
      cloud += mix(vec3(0.28, 0.32, 0.45), sunColor, sun) * pow(m, 12.0) * (1.0 - c) * 0.9;
      // Storm clouds are heavy and grey, and light up with the lightning
      cloud = mix(cloud, mix(cloud * 0.55, horizon * 0.75, sun), storm * 0.85);
      cloud += vec3(0.6, 0.65, 0.8) * flash;
      col = mix(col, cloud, c * mix(0.85, 1.0, storm));
      col = mix(col, horizon * 0.8, storm * 0.3);
      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
    }`,
};

/**
 * Which time of day to use: a story part can ask for one; otherwise the
 * Time of day setting decides ('night', 'dawn', 'day', 'dusk', 'random',
 * or 'cycle' = a full day in 12 minutes, which starts at dusk).
 */
export function pickTime(settings, wanted) {
  if (wanted != null) return { hour: typeof wanted === 'string' ? TIMES[wanted] ?? 0 : wanted, cycle: false };
  const t = settings.timeOfDay || 'night';
  if (t === 'cycle') return { hour: TIMES.dusk, cycle: true };
  if (t === 'random') return { hour: [TIMES.night, TIMES.dawn, TIMES.day, TIMES.afternoon, TIMES.dusk][Math.floor(Math.random() * 5)], cycle: false };
  return { hour: TIMES[t] ?? 0, cycle: false };
}

/** Lighting options for a graphics quality setting ('low' | 'medium' | 'high'). */
export function lightingForQuality(q) {
  return { shadows: q !== 'low', mapSize: q === 'high' ? 2048 : 1024, cheapSky: q === 'low' };
}

export class NightLighting {
  constructor(scene, { shadows = true, mapSize = 2048, cheapSky = false } = {}) {
    this.scene = scene;
    this.hour = 0;
    this.storm = 0;
    scene.userData.lighting = this; // (PostFx reads the exposure and bloom from here)
    scene.background = new THREE.Color(SKY_COLOR);
    // Linear fog: fully clear up to 60 m, fully fogged by 320 m. Its colour
    // sits between the sky and the horizon glow so distant buildings melt
    // into the haze instead of into black.
    scene.fog = new THREE.Fog(0x15131f, 60, 320);

    // Sky dome (drawn behind everything, follows the camera)
    this.cheapSky = cheapSky;
    this.skyMat = new THREE.ShaderMaterial({ ...SkyShader, uniforms: THREE.UniformsUtils.clone(SkyShader.uniforms),
      defines: cheapSky ? { CHEAP_CLOUDS: '' } : {}, side: THREE.BackSide, depthWrite: false, fog: false });
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
    this._apply();
  }

  /**
   * Stars: each one has its own size, colour (blue-white to warm) and
   * twinkle, and they go out behind the clouds as the clouds drift past.
   */
  _addStars() {
    const rng = makeRng(9);
    const n = 1100, R = 700;
    const p = new Float32Array(n * 3), size = new Float32Array(n), phase = new Float32Array(n), tint = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = rng() * Math.PI * 2;
      const ph = Math.acos(1 - rng() * 0.93); // spread evenly over the upper sky
      p[i * 3] = Math.cos(th) * Math.sin(ph) * R;
      p[i * 3 + 1] = Math.cos(ph) * R;
      p[i * 3 + 2] = Math.sin(th) * Math.sin(ph) * R;
      const r = rng();
      size[i] = 1.1 + r * r * r * 2.6; // mostly small, a few bright ones
      phase[i] = rng() * 100;
      const w = rng();
      tint.set(w < 0.15 ? [1, 0.86, 0.7] : w < 0.4 ? [0.78, 0.86, 1] : [0.95, 0.96, 1], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('size', new THREE.BufferAttribute(size, 1));
    g.setAttribute('phase', new THREE.BufferAttribute(phase, 1));
    g.setAttribute('tint', new THREE.BufferAttribute(tint, 3));
    this.starMat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, amount: { value: 1 }, cover: { value: 0 }, pixel: { value: Math.min(2, window.devicePixelRatio || 1) } },
      vertexShader: /* glsl */`
        attribute float size;
        attribute float phase;
        attribute vec3 tint;
        uniform float time, amount, cover, pixel;
        varying float vA;
        varying vec3 vTint;
        ${CLOUD_GLSL}
        void main() {
          vec3 d = normalize(position);
          float tw = 0.65 + 0.35 * sin(time * (1.3 + fract(phase) * 2.2) + phase) * sin(time * 0.7 + phase * 1.7);
          vA = amount * tw * (1.0 - cloudAt(d, cover, time)) * smoothstep(0.02, 0.18, d.y);
          vTint = tint;
          gl_PointSize = size * pixel;
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww; // (on the far plane, like the sky)
          if (vA < 0.01) gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // hidden: skip it
        }`,
      fragmentShader: /* glsl */`
        varying float vA;
        varying vec3 vTint;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float a = vA * smoothstep(0.5, 0.1, length(c));
          gl_FragColor = vec4(vTint * a, 1.0);
        }`,
      defines: this.cheapSky ? { CHEAP_CLOUDS: '' } : {},
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    });
    this.stars = new THREE.Points(g, this.starMat);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -1;
    this.scene.add(this.stars);
  }

  /** Fair-weather clouds: 0 = clear sky .. 1 = overcast (the weather sets it). */
  setClouds(k) {
    this.clouds = k;
    this._apply();
  }

  /**
   * Storm look: 0 = clear, 1 = heavy storm (clouds hide the moon/sun and
   * stars, the fog closes in, the light dims).
   */
  setStorm(k) {
    this.storm = k;
    this._apply();
  }

  /**
   * Time of day: an hour 0-24, or a name from TIMES ('night', 'dawn', 'day',
   * 'dusk'...). Call it after the world is built so the street-lamp glows
   * can fade in daylight.
   */
  setTime(t) {
    this.hour = typeof t === 'string' ? (TIMES[t] ?? 0) : (t || 0);
    this._apply();
  }

  /** Snow on the roofs and roads (Frostvale). blizzard: thick whiteout fog too. */
  setSnow(on, blizzard = false) {
    this.snow = !!on;
    this.blizzard = !!blizzard;
    this._apply();
  }

  /** Fog (Free Run's weather): the city fades into a grey mist. */
  setMist(on) {
    this.mist = !!on;
    this._apply();
  }

  /** 0 at night, 1 in full daylight. */
  get daylight() { return 1 - this.look.win / NIGHT.win; }

  _apply() {
    const L = this.look = lookAt(this.hour);
    const k = this.storm || 0;
    const u = this.skyMat.uniforms;
    const grey = (c, amount) => { const l = c.r * 0.3 + c.g * 0.55 + c.b * 0.15; return c.lerp(_a.setRGB(l, l, l * 1.05), amount); };
    u.zenith.value.copy(L.zen); u.horizon.value.copy(L.hor); u.glow.value.copy(L.glow);
    if (k > 0) { grey(u.zenith.value, k * 0.8 * L.sun); grey(u.horizon.value, k * 0.7 * L.sun); u.zenith.value.multiplyScalar(1 - k * 0.35 * L.sun); }
    u.sun.value = L.sun;
    u.sunColor.value.copy(L.lc);
    u.storm.value = k;
    // Sun or moon: which way the light comes from
    const moon = this.moonOffset.set(-40, 80, 30);
    if (L.sun > 0) moon.lerp(sunOffset(this.hour, new THREE.Vector3()), L.sun);
    u.moonDir.value.copy(moon).normalize();
    this.moon.color.copy(L.lc);
    this.moon.intensity = L.li * (1 - k * 0.6);
    this.hemi.color.copy(L.hs);
    this.hemi.groundColor.copy(L.hg);
    this.hemiBase = L.hi * (1 - k * 0.15 * L.sun);
    this.hemi.intensity = this.hemiBase;
    // Stars: hidden by day and in storms, and behind the clouds
    const clouds = this.clouds ?? 0.32;
    u.clouds.value = clouds;
    this.stars.visible = L.stars > 0.05 && k < 0.6;
    this.starMat.uniforms.amount.value = L.stars;
    this.starMat.uniforms.cover.value = Math.max(clouds, k);
    const fog = this.scene.fog;
    fog.color.copy(L.fog);
    if (k > 0) grey(fog.color, k * 0.6).multiplyScalar(1 - k * 0.2);
    fog.near = (L.sun > 0.5 ? 80 : 60) - k * 25;
    fog.far = (L.sun > 0.5 ? 380 : 320) - k * 110;
    if (this.mist && !this.blizzard) {
      fog.color.lerp(_a.setRGB(0.5, 0.52, 0.56).multiplyScalar(0.25 + L.sun * 0.85), 0.7);
      fog.near = 8;
      fog.far = 120;
    }
    if (this.blizzard) {
      // Whiteout: everything past a few car lengths disappears into the snow
      fog.color.lerp(_a.setRGB(0.42, 0.46, 0.52).multiplyScalar(0.35 + L.sun * 0.9), 0.75);
      fog.near = 6;
      fog.far = 70;
    }
    this.scene.background.copy(fog.color);
    // Lit windows and street-lamp glows fade out in daylight
    const mats = getMaterials();
    mats.wall.emissiveIntensity = L.win;
    mats.wall.map = L.win < 0.6 ? mats.facade.dayMap : mats.facade.map;
    // Sunlit tarmac is paler than tarmac at night
    const day = 1 - L.win / NIGHT.win;
    mats.asphalt.color.setScalar(1 + day * 1.1);
    mats.concrete.color.setScalar(1 + day * 0.15);
    mats.roof.color.setScalar(1);
    if (this.snow) {
      // Snow: roofs, pavements and roads go white (the textures show through a little)
      mats.roof.color.setRGB(2.0, 2.1, 2.3);
      mats.asphalt.color.setRGB(2.3, 2.4, 2.7);
      mats.concrete.color.setRGB(1.55, 1.6, 1.75);
    }
    // Snow reflects a lot of light: turn the exposure and the glow down so it isn't blinding
    this.exposure = this.snow ? L.exp * 0.8 : L.exp;
    this.bloom = this.snow ? L.bloom * 0.3 : L.bloom;
    this._fadeNightGlows(L.halo);
    // Reflections in glass and paint follow the sky; light beams show in the dark
    paintEnvMap(L, { snow: this.snow, sunDir: u.moonDir.value });
    setShaftNight(L.halo);
  }

  _fadeNightGlows(amount) {
    if (!this._glows || this._glowsFor !== this.scene.children.length) {
      this._glowsFor = this.scene.children.length;
      this._glows = new Set();
      this.scene.traverse((o) => { if (o.material?.userData?.nightGlow) this._glows.add(o.material); });
      for (const m of this._glows) m.userData.baseOpacity ??= m.opacity;
    }
    for (const m of this._glows) { m.opacity = m.userData.baseOpacity * amount; m.visible = amount > 0.02; }
  }

  /** Called every frame: sky animation and lightning brightness (0..1). */
  update(dt, flash = 0) {
    this.skyMat.uniforms.time.value += dt;
    this.starMat.uniforms.time.value = this.skyMat.uniforms.time.value;
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

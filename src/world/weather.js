import * as THREE from 'three';
import { audio } from '../core/audio.js';
import { getMaterials } from './materials.js';

// Weather: rain and thunderstorms.
//
//  - Rain: a few thousand short streaks in a box that follows the camera.
//    Each drop falls, and when it drops below the box it wraps back to the
//    top, so the same drops are reused forever (no new objects while playing).
//  - Lightning (storms only): every so often the sky, the ambient light and
//    the whole screen flash white; the thunder follows a moment later, like
//    real thunder (sound is slower than light).
//  - Wet surfaces: roads and roofs switch to a shiny material that reflects
//    the sky glow and catches headlights and street lamps.
//
//  - Snow (Chapter 8): slow white flakes drifting down, an overcast sky, and
//    snow on the roofs and roads (see NightLighting.setSnow).
//
//  - Blizzard (Frostvale): snow blowing sideways, and a whiteout fog that
//    hides everything past a few car lengths (for you and the police).
//
// kind: 'clear' | 'rain' | 'storm' | 'snow' | 'blizzard'

const BOX = { x: 70, y: 40, z: 70 };
const FALL_SPEED = 28;          // m/s
const WIND = [3.5, 0, 1.5];     // m/s sideways drift
const STREAK = 0.9;             // length of a rain streak (m)
const DROPS = { low: 600, medium: 1200, high: 2400 };

export class Weather {
  /**
   * @param {THREE.Scene} scene
   * @param {import('./lighting.js').NightLighting} lighting
   * @param {object} post - game.post (for the lightning flash)
   * @param {{kind:string, quality:string}} opts
   */
  constructor(scene, lighting, post, { kind = 'clear', quality = 'high' } = {}) {
    this.scene = scene;
    this.lighting = lighting;
    this.post = post;
    this.kind = kind;
    this.flash = 0;
    this.nextStrike = 6 + Math.random() * 6;
    this.thunderIn = -1;
    this.rain = null;
    lighting.setSnow?.(kind === 'snow' || kind === 'blizzard', kind === 'blizzard');
    if (kind === 'clear') return;
    if (kind === 'snow' || kind === 'blizzard') { this._makeSnow(scene, lighting, quality, kind === 'blizzard'); return; }

    lighting.setStorm(kind === 'storm' ? 1 : 0.55);
    // Shiny wet surfaces cost more to draw: only on high graphics.
    if (quality === 'high') this._makeWet(post?.renderer, lighting);
    const n = DROPS[quality] ?? DROPS.medium;
    this.count = n;
    // Each drop is a line: 2 points. We store the drop's position once and
    // write both ends of its streak every frame.
    this.drops = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      this.drops[i * 3] = (Math.random() - 0.5) * BOX.x;
      this.drops[i * 3 + 1] = Math.random() * BOX.y;
      this.drops[i * 3 + 2] = (Math.random() - 0.5) * BOX.z;
    }
    const pos = new Float32Array(n * 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
      color: 0x9fb4d8, transparent: true, opacity: kind === 'storm' ? 0.42 : 0.3, depthWrite: false, fog: true,
    }));
    this.rain.frustumCulled = false;
    scene.add(this.rain);
    this.origin = new THREE.Vector3();
  }

  /**
   * Swap the dry asphalt / roof materials for shiny wet ones. The shine
   * reflects a blurred copy of the sky (a "PMREM" environment map made once
   * from the sky dome) so the orange city glow shows up in the puddles.
   */
  _makeWet(renderer, lighting) {
    const mats = getMaterials();
    let env = null;
    if (renderer) {
      const pm = new THREE.PMREMGenerator(renderer);
      const skyScene = new THREE.Scene();
      const sky = lighting.sky.clone();
      sky.position.set(0, 0, 0);
      skyScene.add(sky);
      env = pm.fromScene(skyScene, 0.02).texture;
      pm.dispose();
      this.env = env;
    }
    const wet = (dry, roughness, metalness, tint) => new THREE.MeshStandardMaterial({
      map: dry.map, vertexColors: true, color: tint, roughness, metalness, envMap: env, envMapIntensity: 1.6,
    });
    this.swap = new Map([
      [mats.asphalt, wet(mats.asphalt, 0.22, 0.45, 0xa4a4ae)],
      [mats.roof, wet(mats.roof, 0.42, 0.08, 0xd0d0d8)],
      [mats.concrete, wet(mats.concrete, 0.6, 0.04, 0xd4d4da)],
    ]);
    this.scene.traverse((o) => {
      if (o.isMesh && this.swap.has(o.material)) o.material = this.swap.get(o.material);
    });
  }

  /** Snowflakes: points in a box round the camera, falling slowly and swaying. */
  _makeSnow(scene, lighting, quality, blizzard = false) {
    lighting.setStorm(blizzard ? 0.6 : 0.3);
    this.blizzard = blizzard;
    const n = ({ low: 700, medium: 1400, high: 2400 }[quality] ?? 1400) * (blizzard ? 1.8 : 1);
    this.count = n;
    this.flakes = new Float32Array(n * 3);
    this.sway = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.flakes[i * 3] = (Math.random() - 0.5) * BOX.x;
      this.flakes[i * 3 + 1] = Math.random() * BOX.y;
      this.flakes[i * 3 + 2] = (Math.random() - 0.5) * BOX.z;
      this.sway[i] = Math.random() * Math.PI * 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
    this.snow = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.16, transparent: true, opacity: 0.85, depthWrite: false }));
    this.snow.frustumCulled = false;
    scene.add(this.snow);
    this.t = 0;
  }

  _updateSnow(dt, center) {
    this.t += dt;
    const n = this.count, f = this.flakes, p = this.snow.geometry.attributes.position.array;
    const hx = BOX.x / 2, hz = BOX.z / 2, oy = center.y - BOX.y * 0.35;
    for (let i = 0; i < n; i++) {
      const k = i * 3;
      f[k + 1] -= (this.blizzard ? 3.2 : 1.6) * dt;
      if (f[k + 1] < 0) f[k + 1] += BOX.y;
      f[k] += Math.sin(this.t * 0.8 + this.sway[i]) * 0.6 * dt + (this.blizzard ? 9 : 0.4) * dt; // (a blizzard blows sideways)
      let x = f[k] - center.x, z = f[k + 2] - center.z;
      x = ((((x + hx) % BOX.x) + BOX.x) % BOX.x) - hx;
      z = ((((z + hz) % BOX.z) + BOX.z) % BOX.z) - hz;
      p[k] = center.x + x; p[k + 1] = oy + f[k + 1]; p[k + 2] = center.z + z;
    }
    this.snow.geometry.attributes.position.needsUpdate = true;
  }

  /** How loud the rain loop should be (0..1). */
  get rainVolume() {
    return this.kind === 'storm' ? 0.55 : this.kind === 'rain' ? 0.35 : 0;
  }

  /** @param {number} dt @param {THREE.Vector3} center - usually the camera position */
  update(dt, center) {
    if (this.snow) { this._updateSnow(dt, center); this.lighting.update(dt, 0); return; }
    if (!this.rain) { this.lighting.update(dt, 0); return; }
    const n = this.count, d = this.drops;
    const fall = FALL_SPEED * dt;
    // Streak direction = velocity direction
    const vx = WIND[0] / FALL_SPEED, vz = WIND[2] / FALL_SPEED;
    const p = this.rain.geometry.attributes.position.array;
    // Drops live in "box space" around a point that follows the camera.
    this.origin.copy(center);
    const ox = center.x, oy = center.y - BOX.y * 0.35, oz = center.z;
    const hx = BOX.x / 2, hz = BOX.z / 2;
    for (let i = 0; i < n; i++) {
      const k = i * 3;
      d[k] += WIND[0] * dt;
      d[k + 1] -= fall;
      d[k + 2] += WIND[2] * dt;
      if (d[k + 1] < 0) d[k + 1] += BOX.y;
      // Wrap around the moving centre so the rain always surrounds you.
      let x = d[k] - ox, z = d[k + 2] - oz;
      x = ((((x + hx) % BOX.x) + BOX.x) % BOX.x) - hx;
      z = ((((z + hz) % BOX.z) + BOX.z) % BOX.z) - hz;
      const wx = ox + x, wy = oy + d[k + 1], wz = oz + z;
      const j = i * 6;
      p[j] = wx; p[j + 1] = wy; p[j + 2] = wz;
      p[j + 3] = wx - vx * STREAK; p[j + 4] = wy + STREAK; p[j + 5] = wz - vz * STREAK;
    }
    this.rain.geometry.attributes.position.needsUpdate = true;

    // Lightning
    if (this.kind === 'storm') {
      this.nextStrike -= dt;
      if (this.nextStrike <= 0) {
        this.nextStrike = 7 + Math.random() * 12;
        const strength = 0.6 + Math.random() * 0.4;
        this.flash = strength;
        this.post?.lightning(strength * 0.55);
        this.thunderIn = 0.4 + Math.random() * 1.6;
        this.thunderVol = strength;
        // A quick double flicker, like real lightning
        this.flicker = 0.12;
      }
      if (this.flicker > 0) {
        this.flicker -= dt;
        if (this.flicker <= 0) { this.flash = Math.max(this.flash, 0.7); this.post?.lightning(0.35); }
      }
      if (this.thunderIn > 0) {
        this.thunderIn -= dt;
        if (this.thunderIn <= 0) audio.sfx('thunder', { vol: this.thunderVol });
      }
    }
    this.flash = Math.max(0, this.flash - dt * 3);
    this.lighting.update(dt, this.flash);
  }

  dispose() {
    if (this.snow) { this.scene.remove(this.snow); this.snow.geometry.dispose(); this.snow.material.dispose(); }
    this.env?.dispose();
    for (const m of this.swap?.values() || []) m.dispose();
    if (this.rain) {
      this.scene.remove(this.rain);
      this.rain.geometry.dispose();
      this.rain.material.dispose();
    }
  }
}

/**
 * Which weather to use: the story part can ask for one ('storm' in Chapter 4);
 * the Weather setting can force rain everywhere, or turn it off.
 */
export function pickWeather(settings, wanted = 'clear') {
  if (wanted === 'indoor') return 'clear';
  if (wanted === 'snow' || wanted === 'blizzard') return wanted; // (the mountains always have snow)
  if (settings.weather === 'off') return 'clear';
  if (settings.weather === 'rain' && wanted === 'clear') return 'rain';
  return wanted;
}

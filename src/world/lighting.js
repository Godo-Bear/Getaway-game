import * as THREE from 'three';
import { makeRng } from '../core/utils.js';

// Night-time lighting setup: dark blue sky, fog for depth, soft ambient light,
// a moon that casts shadows, and a starfield.
//
// Real-time lights are expensive, so the city "light" mostly comes from
// emissive textures (lit windows, lamp heads, neon). Only a handful of real
// lights are used, and the shadow-casting moon follows the player so its
// shadow map only has to cover the area you can actually see up close.

export const SKY_COLOR = 0x0b0f1c;

/** Lighting options for a graphics quality setting ('low' | 'medium' | 'high'). */
export function lightingForQuality(q) {
  return { shadows: q !== 'low', mapSize: q === 'high' ? 2048 : 1024 };
}

export class NightLighting {
  constructor(scene, { shadows = true, mapSize = 2048 } = {}) {
    this.scene = scene;
    scene.background = new THREE.Color(SKY_COLOR);
    // Linear fog: fully clear up to 60 m, fully fogged by 320 m.
    scene.fog = new THREE.Fog(SKY_COLOR, 60, 320);

    // Sky/ground ambient: cool blue from above, warm sodium bounce from the streets below.
    this.hemi = new THREE.HemisphereLight(0x8094d8, 0x5a3818, 2.6);
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

  /** Keep the moon's shadow box centred on the player. */
  follow(pos) {
    // Snap to a 1 m grid so shadow edges don't "swim" as you move.
    const x = Math.round(pos.x), y = Math.round(pos.y), z = Math.round(pos.z);
    this.moon.target.position.set(x, y, z);
    this.moon.position.set(x + this.moonOffset.x, y + this.moonOffset.y, z + this.moonOffset.z);
    this.stars.position.set(pos.x, 0, pos.z); // stars stay "infinitely" far away
  }
}

import * as THREE from 'three';
import { getGlowTexture, makeGlowMaterial } from '../world/materials.js';
import { addReflections } from '../world/atmosphere.js';
import { audio } from '../core/audio.js';

// Throw a coin to distract the guards (right click, Z, LT, or the Coin
// button on a phone).
//
// The coin flies in an arc where you're looking, spinning, and clinks down
// where it lands. A ring of sound spreads out from there: every guard inside
// it hears the coin, turns, and walks over to look (GuardSquad.hear), which
// is your chance to sneak past or come up behind them. Coins are free, but
// you can only throw one every couple of seconds.

const COOLDOWN = 1.6;   // s between throws
const SPEED = 13;       // m/s
const GRAVITY = 16;     // m/s²
const LIFE = 7;         // s a coin lies on the ground before it's gone
export const COIN_HEAR = 14; // m: how far away the guards hear it
const _dir = new THREE.Vector3();

let coinGeo = null, coinMat = null;
function coinParts() {
  if (!coinGeo) {
    coinGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.016, 16);
    coinMat = addReflections(new THREE.MeshPhongMaterial({ color: 0xe8b830, emissive: 0x3a2800, specular: 0xffffff, shininess: 90 }), 0.35);
  }
  return [coinGeo, coinMat];
}

export class CoinThrow {
  /**
   * @param {THREE.Object3D} parent - the scene
   * @param {import('../core/collision.js').CollisionWorld} world
   * @param {(pos: THREE.Vector3) => void} onLand - called where a coin lands (wake the guards)
   */
  constructor(parent, world, onLand) {
    this.parent = parent;
    this.world = world;
    this.onLand = onLand;
    this.cool = 0;
    this.coins = [];
    this.rings = [];
  }

  get ready() { return this.cool <= 0; }

  /** Throw a coin from `from` along `dir` (normalised; where you're looking). */
  throw(from, dir) {
    if (this.cool > 0) return false;
    this.cool = COOLDOWN;
    const [geo, mat] = coinParts();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(from);
    // A little glint so you can follow it in the dark
    const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0xffd36a, transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    glint.scale.setScalar(0.45);
    mesh.add(glint);
    this.parent.add(mesh);
    const up = Math.max(-0.2, dir.y); // (aim up for a longer throw; it never flies straight down)
    const v = new THREE.Vector3(dir.x, 0, dir.z).normalize().multiplyScalar(SPEED * Math.cos(Math.asin(Math.min(0.9, up))));
    v.y = SPEED * up + 3.2;
    this.coins.push({ mesh, glint, v, flying: true, life: LIFE, spin: 18 + Math.random() * 8 });
    audio.sfx('flick', { vol: 0.6 });
    return true;
  }

  update(dt) {
    if (this.cool > 0) this.cool -= dt;
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i], m = c.mesh, p = m.position;
      if (c.flying) {
        c.v.y -= GRAVITY * dt;
        // Walls: check the sideways part of the move (bounce off and drop)
        const hx = c.v.x * dt, hz = c.v.z * dt, hl = Math.hypot(hx, hz);
        if (hl > 1e-5) {
          _dir.set(hx / hl, 0, hz / hl);
          const hit = this.world.raycast(p, _dir, hl + 0.08);
          if (hit < hl + 0.08) {
            p.x += _dir.x * Math.max(0, hit - 0.1);
            p.z += _dir.z * Math.max(0, hit - 0.1);
            c.v.x *= -0.15;
            c.v.z *= -0.15;
          } else {
            p.x += hx;
            p.z += hz;
          }
        }
        // The floor (or a box top) below
        const g = this.world.groundHeight(p.x, p.z, p.y + 0.3);
        const ground = Number.isFinite(g) && g > -1 ? g : 0; // (no box below: the street at y = 0)
        p.y += c.v.y * dt;
        m.rotation.x += c.spin * dt;
        if (p.y <= ground + 0.012 && c.v.y <= 0) {
          // Landed: lie flat, clink, and send out the sound
          p.y = ground + 0.012;
          m.rotation.set(0, Math.random() * Math.PI, 0);
          c.flying = false;
          this._ring(p);
          this.onLand?.(p.clone());
        }
      } else {
        c.life -= dt;
        c.glint.material.opacity = 0.35 + Math.sin(c.life * 6) * 0.25; // (twinkles on the ground)
      }
      if (c.life <= 0) {
        this.parent.remove(m);
        c.glint.material.dispose();
        this.coins.splice(i, 1);
      }
    }
    // The ring of sound grows and fades
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      const k = Math.min(1, r.t / 0.8);
      r.mesh.scale.setScalar(0.5 + (COIN_HEAR - 0.5) * (1 - (1 - k) * (1 - k)));
      r.mesh.material.opacity = 0.55 * (1 - k);
      if (k >= 1) { this.parent.remove(r.mesh); r.mesh.material.dispose(); this.rings.splice(i, 1); }
    }
  }

  /** The ring of sound spreading out from where a coin landed. */
  _ring(p) {
    this.ringGeo ||= new THREE.RingGeometry(0.93, 1, 48).rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(this.ringGeo, makeGlowMaterial(0xffd23a, 0.55));
    mesh.position.set(p.x, p.y + 0.05, p.z);
    mesh.renderOrder = 3;
    this.parent.add(mesh);
    this.rings.push({ mesh, t: 0 });
    audio.sfx('coin');
  }

  dispose() {
    for (const c of this.coins) { this.parent.remove(c.mesh); c.glint.material.dispose(); }
    for (const r of this.rings) { this.parent.remove(r.mesh); r.mesh.material.dispose(); }
    this.coins = [];
    this.rings = [];
  }
}

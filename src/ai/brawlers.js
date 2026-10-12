import * as THREE from 'three';
import { PlayerModel } from '../player/playerModel.js';
import { audio } from '../core/audio.js';
import { diff } from '../core/difficulty.js';
import { clamp } from '../core/utils.js';

// Fighters who come at you and fight back (Chapter 24: the Jackals in the
// turbine hall and on the dam). Unlike guards and police, they don't hide
// or chase: they walk up, and swing.
//
//   approach -> WIND-UP (arms up, a red "!" over the head: your cue to step
//   back out of reach, or hit them first: a punch interrupts it) -> SWING
//   (if you're still in reach and in front of them, you're hit) -> recover
//   (open: hit them now) -> round again.
//
// Your punches (jab, cross, then the big uppercut) knock them back; out of
// hit points, they go down and stay down. A mode owns your hit points: the
// squad tells it when you're hit (onHit).

const MARK = (() => {
  let tex = null;
  return () => {
    if (tex) return tex;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.font = '900 54px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 9; g.strokeStyle = 'rgba(0,0,0,0.85)'; g.strokeText('!', 32, 35);
    g.fillStyle = '#ff3a2a'; g.fillText('!', 32, 35);
    tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };
})();

export class Brawlers {
  /** @param {{x0:number,x1:number,z0:number,z1:number}} bounds - where they can walk */
  constructor(parent, bounds, { circles = [] } = {}) {
    this.parent = parent;
    this.bounds = bounds;
    this.circles = circles; // ([x, z, r]: round things they walk round, e.g. the turbines)
    this.units = [];
  }

  /** A fighter at (x, z). */
  add(x, z, { look, hp = 3, speed = 2.7, reach = 1.75, damage = 1, windup = 0.62, recover = 0.9, style = {} } = {}) {
    const model = new PlayerModel(look, { bag: false, style: { ...(look?.style || {}), ...style } });
    this.parent.add(model.root);
    const mark = new THREE.Sprite(new THREE.SpriteMaterial({ map: MARK(), transparent: true, depthWrite: false, fog: false }));
    mark.scale.setScalar(0.6);
    mark.position.y = 2.35;
    mark.visible = false;
    model.root.add(mark);
    const body = { pos: new THREE.Vector3(x, 0, z), vel: new THREE.Vector3(), facing: 0, state: 'ground', horizontalSpeed: 0, mantleProgress: 0, stateTime: 0, stumbleTimer: 0, mantle: null, wallRun: null };
    const u = { model, mark, body, hp, maxHp: hp, speed, reach, damage, windup, recover, st: 'approach', t: 0, cd: 0.6 + Math.random() * 1.2, knock: new THREE.Vector3() };
    model.update(0, body);
    this.units.push(u);
    return u;
  }

  get alive() { return this.units.filter((u) => u.st !== 'down').length; }

  clear() {
    for (const u of this.units) this.parent.remove(u.model.root);
    this.units = [];
  }

  /**
   * @param {object} player - the PlayerController
   * @param {(damage:number, fromX:number, fromZ:number) => void} onHit
   */
  update(dt, player, onHit, { y = 0 } = {}) {
    const p = player.pos, B = this.bounds, k = diff().officerSpeed || 1;
    for (const u of this.units) {
      const b = u.body;
      if (u.st === 'down') { b.horizontalSpeed = 0; u.model.update(dt, b); continue; }
      const dx = p.x - b.pos.x, dz = p.z - b.pos.z, d = Math.hypot(dx, dz) || 0.001;
      u.t += dt;
      u.cd -= dt;
      let move = 0;
      if (u.st === 'stagger') {
        b.pos.addScaledVector(u.knock, dt * 4);
        u.knock.multiplyScalar(Math.max(0, 1 - dt * 6));
        if (u.t > 0.5) { u.st = 'approach'; u.t = 0; u.cd = Math.max(u.cd, 0.35); }
      } else if (u.st === 'windup') {
        b.facing = Math.atan2(dx, dz);
        if (u.t > u.windup) {
          u.st = 'swing';
          u.t = 0;
          u.model.punch(Math.random() < 0.5 ? 'cross' : 'jab');
          audio.sfx('whoosh', { vol: 0.5 });
          const ahead = (dx * Math.sin(b.facing) + dz * Math.cos(b.facing)) / d;
          if (d < u.reach + 0.25 && ahead > 0.5 && Math.abs(p.y - (y + b.pos.y)) < 1.4) onHit(u.damage, b.pos.x, b.pos.z);
        }
      } else if (u.st === 'swing') {
        if (u.t > 0.25) { u.st = 'recover'; u.t = 0; }
      } else if (u.st === 'recover') {
        if (u.t > u.recover) { u.st = 'approach'; u.t = 0; u.cd = 0.5 + Math.random() * 1.1; }
      } else {
        // walk up to you (not into you), and start a swing when you're in reach
        b.facing = Math.atan2(dx, dz);
        if (d > u.reach - 0.25) move = u.speed * k;
        if (d < u.reach && u.cd <= 0) { u.st = 'windup'; u.t = 0; u.model.block(u.windup); }
      }
      if (move) { b.pos.x += (dx / d) * move * dt; b.pos.z += (dz / d) * move * dt; }
      // keep apart from each other
      for (const o of this.units) {
        if (o === u || o.st === 'down') continue;
        const ox = b.pos.x - o.body.pos.x, oz = b.pos.z - o.body.pos.z, od = Math.hypot(ox, oz);
        if (od < 1.0 && od > 0.001) { b.pos.x += (ox / od) * (1.0 - od) * 0.5; b.pos.z += (oz / od) * (1.0 - od) * 0.5; }
      }
      for (const [cx, cz, cr] of this.circles) {
        const ox = b.pos.x - cx, oz = b.pos.z - cz, od = Math.hypot(ox, oz), r = cr + 0.4;
        if (od < r) {
          // (out of it, and round it: sideways, towards you)
          const nx = od > 0.001 ? ox / od : 1, nz = od > 0.001 ? oz / od : 0;
          b.pos.x = cx + nx * r; b.pos.z = cz + nz * r;
          const side = (dx * -nz + dz * nx) > 0 ? 1 : -1;
          b.pos.x += -nz * side * u.speed * dt; b.pos.z += nx * side * u.speed * dt;
        }
      }
      b.pos.x = clamp(b.pos.x, B.x0, B.x1);
      b.pos.z = clamp(b.pos.z, B.z0, B.z1);
      b.pos.y = y;
      b.horizontalSpeed = move;
      u.mark.visible = u.st === 'windup';
      u.model.update(dt, b);
    }
  }

  /** You threw a punch: hit the first one in front of you. Returns 'ko', 'hit' or null. */
  punch({ inFront, heavy, fx, fz }) {
    for (const u of this.units) {
      if (u.st === 'down' || !inFront(u.body.pos)) continue;
      u.hp -= heavy ? 2 : 1;
      if (u.hp <= 0) {
        u.st = 'down';
        u.mark.visible = false;
        u.model.knockDown({ upIn: Infinity });
        return 'ko';
      }
      u.st = 'stagger';
      u.t = 0;
      u.knock.set(fx, 0, fz).multiplyScalar(heavy ? 0.9 : 0.5);
      u.model.hit(0.3);
      return 'hit';
    }
    return null;
  }
}

/**
 * Your hit points in a fight: hearts in the panel, a knock back and a moment
 * when you can't be hit again. (A mode makes one and calls hurt() from the
 * squad's onHit.)
 */
export class Hearts {
  constructor(state, max = 5) {
    this.state = state;
    this.max = max;
    this.reset();
  }
  reset() { this.n = this.max; this.safe = 0; }
  update(dt) { this.safe = Math.max(0, this.safe - dt); }
  /** Returns true when you're out of hearts. */
  hurt(dmg, fromX, fromZ) {
    if (this.safe > 0) return false;
    const s = this.state, p = s.player;
    this.n = Math.max(0, this.n - dmg);
    this.safe = 0.9;
    const dx = p.pos.x - fromX, dz = p.pos.z - fromZ, d = Math.hypot(dx, dz) || 1;
    p.vel.x += (dx / d) * 7;
    p.vel.z += (dz / d) * 7;
    s.model.hit(0.35);
    s.cam.addLandingDip?.(6);
    audio.sfx('uppercut', { vol: 0.9 });
    return this.n <= 0;
  }
  get html() { return `<span${this.n <= 1 ? ' class="warn"' : ''}>Health <b style="color:#ff5a6a">${'❤'.repeat(this.n)}${'♡'.repeat(this.max - this.n)}</b></span>`; }
}

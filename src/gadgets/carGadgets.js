import * as THREE from 'three';
import { GadgetSlot } from './gadgetSlot.js';
import { makeGlowMaterial, getGlowTexture } from '../world/materials.js';
import { audio } from '../core/audio.js';

// Car gadgets (press F while driving):
//   Oil Slick     - an oil patch behind you; police cars that hit it spin out
//   EMP Blast     - a shockwave that knocks out every cruiser within 45 m
//   Signal Jammer - the police radio goes dead: they lose you on the spot

const OIL_TIME = 14, OIL_RADIUS = 5.5, SPIN_TIME = 2.2;
const EMP_RADIUS = 45, EMP_TIME = 5;
const JAM_TIME = 8;

export class CarGadgets {
  /** @param {import('../states/drivingState.js').DrivingState} state */
  constructor(state) {
    this.state = state;
    this.slot = new GadgetSlot(state.game, 'car');
    this.slicks = [];   // { mesh, pos, t }
    this.waves = [];    // expanding rings (EMP / jammer effects)
  }

  use() {
    if (this.state.mode.ghost) return; // no police in ghost mode
    if (!this.slot.ready) { this.slot.explainNotReady(); return; }
    const id = this.slot.gadget.id;
    if (id === 'oil') this._oil();
    else if (id === 'emp') this._emp();
    else this._jammer();
    this.slot.used();
  }

  // ---------------------------------------------------------------- Oil
  _oil() {
    const p = this.state.player;
    const pos = new THREE.Vector3(p.pos.x - p.fwdX * 6, 0.06, p.pos.z - p.fwdZ * 6);
    // A glossy black puddle with a purple-green oily sheen on top
    const g = new THREE.Group();
    const puddle = new THREE.Mesh(new THREE.CircleGeometry(OIL_RADIUS, 28), new THREE.MeshStandardMaterial({ color: 0x050508, roughness: 0.08, metalness: 0.6 }));
    puddle.rotation.x = -Math.PI / 2;
    const sheen = new THREE.Mesh(new THREE.RingGeometry(OIL_RADIUS * 0.3, OIL_RADIUS * 0.9, 28), makeGlowMaterial(0x4a2a8a, 0.07));
    sheen.rotation.x = -Math.PI / 2;
    sheen.position.y = 0.01;
    g.add(puddle, sheen);
    g.position.copy(pos);
    g.scale.setScalar(0.2);
    this.state.scene.add(g);
    this.slicks.push({ mesh: g, sheen, pos, t: 0 });
    audio.sfx('whoosh', { vol: 0.8 });
    this.state.game.hud.toast('Oil slick!', 'Cops that drive over it will spin out.', '#8a5cff', 2);
  }

  // ---------------------------------------------------------------- EMP
  _emp() {
    const s = this.state, p = s.player;
    let hit = 0;
    for (const u of s.police.units) {
      if (Math.hypot(u.car.pos.x - p.pos.x, u.car.pos.z - p.pos.z) < EMP_RADIUS) {
        u.stunned = EMP_TIME;
        u.emp = true;
        u.spinDir = 0;
        hit++;
        this._spark(u.car.pos);
      }
    }
    this._wave(p.pos, 0x3d9bff, EMP_RADIUS);
    s.game.post?.lightning(0.35);
    audio.sfx('thunder', { vol: 0.5 });
    s.game.hud.toast('EMP!', hit ? `${hit} police car${hit > 1 ? 's' : ''} knocked out for ${EMP_TIME} seconds. Go!` : 'No police cars were close enough.', '#3d9bff', 3);
  }

  _spark(pos) {
    for (let i = 0; i < 14; i++) {
      this.state.particles.emit(pos.x, pos.y + 1.2, pos.z, {
        vx: (Math.random() - 0.5) * 6, vy: 2 + Math.random() * 4, vz: (Math.random() - 0.5) * 6,
        size: 0.35, grow: 0, life: 0.6, alpha: 1, color: [0.5, 0.8, 1.6],
      });
    }
  }

  // ---------------------------------------------------------------- Jammer
  _jammer() {
    const s = this.state, p = s.player, police = s.police;
    police.jammed = JAM_TIME;
    if (police.everSeen) {
      // They think you went the other way: the search starts 150 m off.
      const a = Math.random() * Math.PI * 2;
      police.lastKnown.set(p.pos.x + Math.cos(a) * 150, 0, p.pos.z + Math.sin(a) * 150);
      police.searching = true;
      police.timeSinceSeen = 0;
      for (const u of police.units) { u.targetNode = null; u.patrolGoal = null; u.searchGoal = null; }
    }
    this._wave(p.pos, 0xff3a6a, 60);
    audio.sfx('sting', { vol: 0.5 });
    s.game.hud.toast('Radio jammed!', `The police lost your trail. They can't call you in for ${JAM_TIME} seconds.`, '#ff3a6a', 3);
  }

  /** An expanding glowing ring on the ground. */
  _wave(pos, color, radius) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 64), makeGlowMaterial(color, 0.9));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, 0.3, pos.z);
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    flash.position.set(pos.x, 1.5, pos.z);
    flash.scale.setScalar(12);
    this.state.scene.add(ring, flash);
    this.waves.push({ ring, flash, t: 0, radius });
  }

  // ---------------------------------------------------------------- Per step / frame
  /** Physics step: police cars that drive onto oil spin out. */
  simulate(dt) {
    for (const sl of this.slicks) {
      for (const u of this.state.police.units) {
        if (u.stunned > 0) continue;
        const c = u.car;
        if (Math.hypot(c.pos.x - sl.pos.x, c.pos.z - sl.pos.z) < OIL_RADIUS && c.speed > 4) {
          u.stunned = SPIN_TIME;
          u.emp = false;
          u.spinDir = Math.random() < 0.5 ? -1 : 1;
          c.gripFactor = 0.15;
          c.yawRate += u.spinDir * 3;
        }
      }
    }
  }

  update(dt) {
    this.slot.update(dt);
    this.slicks = this.slicks.filter((sl) => {
      sl.t += dt;
      sl.mesh.scale.setScalar(Math.min(1, 0.2 + sl.t * 3));
      sl.sheen.rotation.z += dt * 0.4;
      sl.sheen.material.opacity = 0.06 + Math.sin(sl.t * 2) * 0.03; // a faint oily shimmer
      if (sl.t > OIL_TIME) { this.state.scene.remove(sl.mesh); return false; }
      return true;
    });
    this.waves = this.waves.filter((w) => {
      w.t += dt;
      const k = Math.min(1, w.t / 0.7);
      w.ring.scale.setScalar(1 + k * w.radius);
      w.ring.material.opacity = 0.9 * (1 - k);
      w.flash.material.opacity = Math.max(0, 1 - w.t * 3);
      if (k >= 1) { this.state.scene.remove(w.ring, w.flash); return false; }
      return true;
    });
  }

  reset() {
    for (const sl of this.slicks) this.state.scene.remove(sl.mesh);
    for (const w of this.waves) this.state.scene.remove(w.ring, w.flash);
    this.slicks = [];
    this.waves = [];
    this.slot.cooldown = 0;
  }

  dispose() {
    this.reset();
    this.slot.hide();
  }
}

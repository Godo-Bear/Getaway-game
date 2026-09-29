import * as THREE from 'three';
import { GadgetSlot } from './gadgetSlot.js';
import { makeGlowMaterial, getGlowTexture } from '../world/materials.js';
import { audio } from '../core/audio.js';

// Car gadgets (press F while driving):
//   Oil Slick     - an oil patch behind you; police cars that hit it spin out
//   EMP Blast     - a shockwave that knocks out every cruiser within 45 m
//   Signal Jammer - the police radio goes dead: they lose you on the spot
//   Spike Drop    - a spike strip behind you; cops that cross it crawl along
//   Smoke Screen  - thick exhaust smoke: cops behind you can't see you

const OIL_TIME = 14, OIL_RADIUS = 5.5, SPIN_TIME = 2.2;
const EMP_RADIUS = 45, EMP_TIME = 5;
const JAM_TIME = 8;
const SPIKE_TIME = 18, SPIKE_HALF = 3.4, FLAT_TIME = 10;
const SCREEN_TIME = 7;

export class CarGadgets {
  /** @param {import('../states/drivingState.js').DrivingState} state */
  constructor(state) {
    this.state = state;
    this.slot = new GadgetSlot(state.game, 'car');
    this.slicks = [];   // { mesh, pos, t }
    this.waves = [];    // expanding rings (EMP / jammer effects)
    this.strips = [];   // { mesh, x, z, ax, az, t, hit:Set }
    this.screen = 0;    // smoke screen time left
  }

  use() {
    if (this.state.mode.ghost) return; // no police in ghost mode
    if (!this.slot.ready) { this.slot.explainNotReady(); return; }
    const id = this.slot.gadget.id;
    if (id === 'oil') this._oil();
    else if (id === 'emp') this._emp();
    else if (id === 'spikes') this._spikes();
    else if (id === 'screen') this._screen();
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

  // ---------------------------------------------------------------- Spike Drop
  _spikes() {
    const p = this.state.player;
    const x = p.pos.x - p.fwdX * 6, z = p.pos.z - p.fwdZ * 6;
    // Across the road: along the car's right-hand direction
    const ax = -p.fwdZ, az = p.fwdX;
    const g = new THREE.Group();
    const bar = new THREE.Mesh(new THREE.BoxGeometry(SPIKE_HALF * 2, 0.08, 0.5), new THREE.MeshStandardMaterial({ color: 0x2a2d33, metalness: 0.6, roughness: 0.4 }));
    bar.position.y = 0.05;
    g.add(bar);
    const spikeGeo = new THREE.ConeGeometry(0.07, 0.28, 5);
    const spikeMat = new THREE.MeshStandardMaterial({ color: 0xd8dde4, metalness: 0.9, roughness: 0.25, emissive: 0x3a2a10 });
    const spikes = new THREE.InstancedMesh(spikeGeo, spikeMat, 24);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 24; i++) {
      m.makeTranslation(-SPIKE_HALF + 0.15 + (i % 12) * ((SPIKE_HALF * 2 - 0.3) / 11), 0.22, i < 12 ? -0.12 : 0.12);
      spikes.setMatrixAt(i, m);
    }
    g.add(spikes);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(SPIKE_HALF * 2 + 0.6, 1.1), makeGlowMaterial(0xff9a3d, 0.25));
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.02;
    g.add(glow);
    g.position.set(x, 0, z);
    g.rotation.y = Math.atan2(ax, az) - Math.PI / 2;
    this.state.scene.add(g);
    this.strips.push({ mesh: g, glow, x, z, ax, az, t: 0, hit: new Set() });
    audio.sfx('spike', { vol: 0.6 });
    this.state.game.hud.toast('Spike strip down!', 'Cops that drive over it burst their tyres.', '#ff9a3d', 2);
  }

  // ---------------------------------------------------------------- Smoke Screen
  _screen() {
    this.screen = SCREEN_TIME;
    this.state.police.smoked = SCREEN_TIME;
    audio.sfx('whoosh', { vol: 1 });
    this.state.game.hud.toast('Smoke screen!', `Cops behind you can't see through it for ${SCREEN_TIME} seconds. Break away!`, '#9aa2ae', 3);
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
    for (const st of this.strips) {
      for (const u of this.state.police.units) {
        if (st.hit.has(u)) continue;
        const c = u.car, dx = c.pos.x - st.x, dz = c.pos.z - st.z;
        const along = dx * st.ax + dz * st.az;          // across the road
        const across = Math.abs(dx * st.az - dz * st.ax); // distance from the strip
        if (Math.abs(along) < SPIKE_HALF + 0.6 && across < 1.4 && c.speed > 3) {
          st.hit.add(u);
          u.flat = FLAT_TIME;
          this._spark(c.pos);
          audio.sfx('spike', { vol: 0.4 });
        }
      }
    }
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
    this.strips = this.strips.filter((st) => {
      st.t += dt;
      st.glow.material.opacity = 0.18 + Math.sin(st.t * 5) * 0.07;
      if (st.t > SPIKE_TIME) { this.state.scene.remove(st.mesh); return false; }
      return true;
    });
    // Smoke screen: grey clouds pour out of the exhaust
    if (this.screen > 0) {
      this.screen -= dt;
      const p = this.state.player;
      // (the particle pool is shared with tyre smoke, so keep it to ~1 puff a frame)
      this.state.particles.emit(p.pos.x - p.fwdX * 2.4 + (Math.random() - 0.5) * 1.5, 0.8 + Math.random(), p.pos.z - p.fwdZ * 2.4 + (Math.random() - 0.5) * 1.5, {
        vx: -p.fwdX * 2 + (Math.random() - 0.5) * 3, vy: 0.6 + Math.random(), vz: -p.fwdZ * 2 + (Math.random() - 0.5) * 3,
        size: 3.2, grow: 4.5, life: 2, alpha: 0.6, color: [0.55, 0.58, 0.63],
      });
    }
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
    for (const st of this.strips) this.state.scene.remove(st.mesh);
    this.strips = [];
    this.screen = 0;
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

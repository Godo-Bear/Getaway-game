import * as THREE from 'three';
import { audio } from '../core/audio.js';
import { admin } from '../core/admin.js';
import { makeGlowMaterial } from '../world/materials.js';

// HACK THE CITY (while driving).
//
// Just after you drive through a junction with the police behind you, press
// E (X on a gamepad, the Hack button on a phone): every light at that
// junction turns red and steel bollards shoot up out of the road on every
// side except the way you left. Police cars that reach it pile up behind
// the bollards for a few seconds; traffic stops at the red lights.
// Then the hack has to recharge.

const RANGE = 34;       // how far past a junction you can still hack it (m)
const LOCK_TIME = 7;    // seconds the bollards stay up
const COOLDOWN = 22;    // seconds before you can hack again
const BOLLARDS = 7;     // per road
const STOP_RADIUS = 17; // cops this close to a locked junction (on a blocked side) are stopped

export class CityHack {
  /** @param {import('../states/drivingState.js').DrivingState} state */
  constructor(state) {
    this.state = state;
    const city = state.city;
    this.road = 18;
    this.cooldown = 0;
    this.lock = null; // { node, exit: 'x+'|'x-'|'z+'|'z-', t, boxes }
    // Bollards: one instanced mesh, 3 roads x BOLLARDS, moved into place when used
    const geo = new THREE.CylinderGeometry(0.22, 0.26, 1.15, 10);
    geo.translate(0, 0.575, 0);
    this.bollards = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xd8dde4 }), BOLLARDS * 3);
    this.caps = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.23, 0.23, 0.12, 10), makeGlowMaterial(0xff3346, 0.9), BOLLARDS * 3);
    this.bollards.visible = this.caps.visible = false;
    state.scene.add(this.bollards, this.caps);
    this.world = city.world;
    this.graph = city.graph;
    this.lights = city.trafficLights;
    // Red lights at a hacked junction: wrap the lights' state()
    const lights = this.lights, orig = lights.state.bind(lights);
    lights.state = (node, axis) => (node.hackedUntil > lights.time ? 'red' : orig(node, axis));
  }

  reset() {
    this._release();
    this.cooldown = 0;
  }

  /** The junction you could hack right now, or null. */
  _target() {
    const p = this.state.player;
    if (this.lock || this.cooldown > 0) return null;
    const cops = this.state.police.units.some((u) => Math.hypot(u.car.pos.x - p.pos.x, u.car.pos.z - p.pos.z) < 160);
    if (!cops) return null;
    let best = null, bd = RANGE;
    for (const n of this.graph.nodes) {
      const dx = p.pos.x - n.x, dz = p.pos.z - n.z, d = Math.hypot(dx, dz);
      if (d > bd || d < this.road / 2) continue;
      // Only junctions you've just left (behind you), not ones ahead
      if (dx * p.fwdX + dz * p.fwdZ < 0) continue;
      bd = d; best = n;
    }
    return best;
  }

  update(dt) {
    const s = this.state;
    if (this.cooldown > 0) this.cooldown -= dt * (admin.flag('noCooldowns') ? 20 : 1);
    if (this.lock) {
      const L = this.lock;
      L.t -= dt;
      const rise = Math.min(1, (LOCK_TIME - L.t) * 4), sink = Math.min(1, L.t * 2);
      this._place(Math.min(rise, sink));
      // Police cars arriving from a blocked side stop at the bollards
      for (const u of s.police.units) {
        const dx = u.car.pos.x - L.node.x, dz = u.car.pos.z - L.node.z;
        if (Math.hypot(dx, dz) > STOP_RADIUS || this._side(dx, dz) === L.exit) continue;
        if (!(u.stunned > 0)) { u.stunned = Math.max(1.2, L.t + 0.6); u.emp = false; u.spinDir = 0; }
      }
      if (L.t <= 0) this._release();
    }
    const target = this._target();
    this.available = !!target;
    return target;
  }

  /** Which side of a junction a point is on. */
  _side(dx, dz) {
    return Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'x+' : 'x-') : (dz > 0 ? 'z+' : 'z-');
  }

  /** Hack the junction you just drove through. */
  trigger() {
    const node = this._target();
    if (!node) return false;
    const p = this.state.player.pos;
    const exit = this._side(p.x - node.x, p.z - node.z);
    this.lock = { node, exit, t: LOCK_TIME, boxes: [] };
    node.hackedUntil = this.lights.time + LOCK_TIME;
    this.lights._timer = 0; // repaint the lights now
    const h = this.road / 2 + 1.5;
    for (const side of ['x+', 'x-', 'z+', 'z-']) {
      if (side === exit) continue;
      const alongX = side[0] === 'x';
      const sign = side[1] === '+' ? 1 : -1;
      const cx = node.x + (alongX ? sign * h : 0), cz = node.z + (alongX ? 0 : sign * h);
      this.lock.boxes.push(this.world.addBox(cx - (alongX ? 0.3 : this.road / 2), 0, cz - (alongX ? this.road / 2 : 0.3),
        cx + (alongX ? 0.3 : this.road / 2), 1.15, cz + (alongX ? this.road / 2 : 0.3), { tag: 'bollards' }));
    }
    this.cooldown = COOLDOWN;
    audio.sfx('spike', { vol: 0.9 });
    audio.sfx('click');
    this.state.game.hud.toast('Junction hacked!', 'Red lights and bollards behind you: the police are stuck for a few seconds.', 'var(--cyan)', 3);
    return true;
  }

  _place(k) {
    const L = this.lock, m = new THREE.Matrix4();
    const h = this.road / 2 + 1.5;
    let i = 0;
    for (const side of ['x+', 'x-', 'z+', 'z-']) {
      if (side === L.exit) continue;
      const alongX = side[0] === 'x', sign = side[1] === '+' ? 1 : -1;
      for (let b = 0; b < BOLLARDS; b++) {
        const t = (b / (BOLLARDS - 1) - 0.5) * (this.road - 1.5);
        const x = L.node.x + (alongX ? sign * h : t), z = L.node.z + (alongX ? t : sign * h);
        m.makeTranslation(x, -1.15 * (1 - k), z);
        this.bollards.setMatrixAt(i, m);
        m.makeTranslation(x, 1.15 * k - 1.15 + 1.2, z);
        this.caps.setMatrixAt(i, m);
        i++;
      }
    }
    this.bollards.count = this.caps.count = i;
    this.bollards.instanceMatrix.needsUpdate = this.caps.instanceMatrix.needsUpdate = true;
    this.bollards.visible = this.caps.visible = true;
  }

  _release() {
    if (!this.lock) return;
    for (const b of this.lock.boxes) b.disabled = true;
    this.lock.node.hackedUntil = 0;
    this.lock = null;
    this.bollards.visible = this.caps.visible = false;
  }

  /** HUD text: ready, recharging or in use. */
  get status() {
    if (this.lock) return 'Hack: bollards up';
    if (this.cooldown > 0) return `Hack: ${Math.ceil(this.cooldown)}s`;
    return 'Hack: ready';
  }

  dispose() {
    this._release();
    this.state.scene?.remove(this.bollards, this.caps);
  }
}

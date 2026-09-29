import * as THREE from 'three';
import { PlayerModel } from '../player/playerModel.js';
import { makeGlowMaterial } from '../world/materials.js';

// Security guards for indoor heists (the casino).
//
// Each guard walks a loop of waypoints, pausing at each one to look around.
// They see in a cone in front of them (drawn on the floor): if you're inside
// it and nothing blocks the view, you're seen. Walls, slot machines and
// (when you crouch, C) low cover like card tables hide you.
//
// No pathfinding needed: routes are laid out along open floor.
// After the alarm they go on ALERT: faster, and they see further.
//
// A guard also looks like an "officer" to the gadgets: it has .pc.pos and
// .stunned (Flashbang), so the same gadget code works on it.

const WALK = 1.9, ALERT_WALK = 3.2;   // m/s
const HALF_ANGLE = 0.5;               // radians either side (about 57 degrees wide)
const RANGE = 9, ALERT_RANGE = 12.5;  // metres
const PAUSE = 1.3;                    // seconds at each waypoint
const _from = new THREE.Vector3(), _dir = new THREE.Vector3();

export class GuardSquad {
  /**
   * @param {THREE.Scene|THREE.Group} parent
   * @param {CollisionWorld} world
   * @param {{route:number[][]}[]} defs - route = [[x, z], ...] (a loop)
   * @param {{sight?:number}} opts - sight multiplies the view range (difficulty)
   */
  constructor(parent, world, defs, { sight = 1 } = {}) {
    this.parent = parent;
    this.world = world;
    this.sight = sight;
    this.alert = false;
    this.units = defs.map((d, i) => this._make(d, i));
  }

  _make(def, i) {
    const model = new PlayerModel({ hoodie: 0x1c1f28, trousers: 0x14161c, mask: 0xc4946f, skin: 0xc4946f, gloves: 0x1c1f28, shoes: 0x0a0a0a }, { bag: false });
    this.parent.add(model.root);
    // Vision cone on the floor (a fan)
    const geo = new THREE.CircleGeometry(1, 24, -HALF_ANGLE, HALF_ANGLE * 2);
    geo.rotateX(-Math.PI / 2);
    geo.rotateY(Math.PI / 2); // fan points along +Z (the way the model faces)
    const cone = new THREE.Mesh(geo, makeGlowMaterial(0xffd23a, 0.16));
    cone.position.y = 0.04;
    this.parent.add(cone);
    const [x, z] = def.route[0];
    const body = {
      pos: new THREE.Vector3(x, 0, z), vel: new THREE.Vector3(), facing: 0, state: 'ground', horizontalSpeed: 0,
      mantleProgress: 0, stateTime: 0, stumbleTimer: 0, mantle: null, wallRun: null,
    };
    const [nx, nz] = def.route[1 % def.route.length];
    body.facing = Math.atan2(nx - x, nz - z);
    return { route: def.route, leg: 0, wait: PAUSE * (i % 2), look: 0, baseFacing: body.facing, model, cone, pc: body, stunned: 0, waitTimer: 0, seesPlayer: false };
  }

  /** Back to their starting posts (after a restart). */
  reset() {
    this.alert = false;
    this.units.forEach((u, i) => {
      const [x, z] = u.route[0];
      u.pc.pos.set(x, 0, z);
      const [nx, nz] = u.route[1 % u.route.length];
      u.pc.facing = u.baseFacing = Math.atan2(nx - x, nz - z);
      u.leg = 0;
      u.wait = PAUSE * (i % 2);
      u.stunned = 0;
      u.seesPlayer = false;
    });
  }

  setAlert(on) {
    this.alert = on;
    for (const u of this.units) u.cone.material.color.setHex(on ? 0xff3346 : 0xffd23a);
  }

  get range() {
    return (this.alert ? ALERT_RANGE : RANGE) * this.sight;
  }

  /**
   * Move everyone along their routes and check who can see the target.
   * @param {object} player - the PlayerController (pos, height)
   * @param {boolean} hidden - smoke bomb / invisibility: nobody can see
   * @returns {boolean} true if any guard sees the player
   */
  update(dt, player, hidden = false) {
    let seen = false;
    for (const u of this.units) {
      const b = u.pc;
      if (u.stunned > 0) {
        // Dazed by a flashbang: stand still, cone off
        u.stunned -= dt;
        b.horizontalSpeed = 0;
        u.cone.visible = false;
        u.model.update(dt, b);
        continue;
      }
      u.cone.visible = true;
      if (u.wait > 0) {
        // Paused at a waypoint: look left and right
        u.wait -= dt;
        u.look += dt;
        b.horizontalSpeed = 0;
        b.facing = u.baseFacing + Math.sin(u.look * 1.6) * 0.7;
      } else {
        const next = u.route[(u.leg + 1) % u.route.length];
        const dx = next[0] - b.pos.x, dz = next[1] - b.pos.z, d = Math.hypot(dx, dz);
        const step = (this.alert ? ALERT_WALK : WALK) * dt;
        if (d <= step) {
          b.pos.set(next[0], 0, next[1]);
          u.leg = (u.leg + 1) % u.route.length;
          u.wait = this.alert ? PAUSE * 0.4 : PAUSE;
          u.look = 0;
          u.baseFacing = Math.atan2(dx, dz);
        } else {
          b.pos.x += (dx / d) * step;
          b.pos.z += (dz / d) * step;
          b.facing = Math.atan2(dx, dz);
          u.baseFacing = b.facing;
        }
        b.horizontalSpeed = this.alert ? ALERT_WALK : WALK;
      }
      u.model.update(dt, b);
      u.cone.position.set(b.pos.x, 0.04, b.pos.z);
      u.cone.rotation.y = b.facing;
      const r = this.range;
      u.cone.scale.setScalar(r);
      u.seesPlayer = !hidden && this._sees(u, player, r);
      if (u.seesPlayer) seen = true;
    }
    return seen;
  }

  /** Can this guard see the player? (cone, range, and a clear line of sight) */
  _sees(u, player, range) {
    const b = u.pc, p = player.pos;
    const dx = p.x - b.pos.x, dz = p.z - b.pos.z, d = Math.hypot(dx, dz);
    if (d > range || Math.abs(p.y - b.pos.y) > 3) return false;
    // Angle between where the guard faces and the player
    let a = Math.atan2(dx, dz) - b.facing;
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    if (Math.abs(a) > HALF_ANGLE && d > 1.2) return false; // (right next to them, they notice anyway)
    // Line of sight from the guard's eyes to your chest - or your head if
    // you're crouching, which is how low cover (card tables) hides you.
    const crouched = player.height < 1.3;
    _from.set(b.pos.x, 1.65, b.pos.z);
    _dir.set(p.x, p.y + (crouched ? 0.75 : 1.3), p.z).sub(_from);
    const len = _dir.length();
    _dir.divideScalar(len);
    return !(this.world.raycast(_from, _dir, len - 0.35) < len - 0.35);
  }

  dispose() {
    for (const u of this.units) { this.parent.remove(u.model.root); this.parent.remove(u.cone); }
    this.units = [];
  }
}

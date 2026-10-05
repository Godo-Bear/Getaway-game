import * as THREE from 'three';
import { PlayerController } from '../player/playerController.js';
import { PlayerModel } from '../player/playerModel.js';
import { POLICE_LOOK } from '../player/people.js';

// Police officers who chase you across the rooftops on foot.
//
// Each officer is driven by the SAME PlayerController as you (so they obey
// the same physics: gaps, ledges, walls), just with a slower top speed. The
// AI "presses the buttons" for them:
//   - run straight at the player
//   - at a roof edge: jump if there's a roof to land on, otherwise stop
//   - blocked by a wall/ledge: jump (the controller turns that into a climb)
// They can't wall-run or ride zip lines, so those are your escape routes.
// Hide (inside a stairwell hut or under a water tower) and they lose you:
// they run to where they last saw you and search around there instead.
// Officers that fall or get left far behind come back out of a stairwell
// near you a few seconds later.

const CATCH_DIST = 1.25;
const STEP = 1 / 60;

export class OfficerSquad {
  /**
   * @param {THREE.Scene} scene
   * @param {import('../core/collision.js').CollisionWorld} world
   * @param {THREE.Vector3[]} spawns - where officers come out (stairwell huts)
   * @param {{count:number, speed?:number}} opts - speed = fraction of your speed
   */
  constructor(scene, world, spawns, { count = 2, speed = 0.86 } = {}) {
    this.scene = scene;
    this.world = world;
    this.spawns = spawns;
    this.units = [];
    for (let i = 0; i < count; i++) {
      const pc = new PlayerController(world);
      pc.speedScale = speed;
      const model = new PlayerModel(POLICE_LOOK, { bag: false, style: { build: 1 + i * 0.06 } });
      scene.add(model.root);
      model.root.visible = false; // appears when the officer comes out of a stairwell
      const ctl = { moveX: 0, moveZ: 0, jumpPressed: false, jumpHeld: false, sprint: true, crouch: false,
        camForward: new THREE.Vector3(0, 0, -1), camRight: new THREE.Vector3(1, 0, 0) };
      this.units.push({ pc, model, ctl, waitTimer: 1 + i * 1.5, jumpCooldown: 0, blockedTime: 0, lastPos: new THREE.Vector3() });
    }
    this.acc = 0;
    this.lastKnown = new THREE.Vector3();
    this.searchTimer = 0;
  }

  /** Put every officer back at a spawn point (e.g. after the player respawns). */
  scatter(playerPos) {
    this.units.forEach((u, i) => { u.waitTimer = 2 + i * 1.5; this._spawn(u, playerPos); });
  }

  _spawn(u, playerPos) {
    // A spawn point 20-70 m from the player (not right on top of them)
    const options = this.spawns.filter((sp) => {
      const d = Math.hypot(sp.x - playerPos.x, sp.z - playerPos.z);
      return d > 20 && d < 70;
    });
    const list = options.length ? options : this.spawns;
    const sp = list[Math.floor(Math.random() * list.length)];
    u.pc.teleport(sp.x + (Math.random() - 0.5), sp.y + 0.05, sp.z + (Math.random() - 0.5), 0);
    u.model.root.visible = false;
  }

  /**
   * @param {number} dt
   * @param {PlayerController} player
   * @param {boolean} hidden - the player is in a hiding spot (or in gadget smoke)
   * @param {THREE.Vector3|null} lure - a holo-decoy: the officers run there instead
   * @returns {'caught'|null}
   */
  update(dt, player, hidden = false, lure = null) {
    let result = null;
    if (lure) this.lastKnown.copy(lure);
    else if (!hidden) this.lastKnown.copy(player.pos);
    this.searchTimer -= dt;
    for (const u of this.units) {
      if (u.waitTimer > 0) {
        u.waitTimer -= dt;
        if (u.waitTimer <= 0) { this._spawn(u, player.pos); u.model.root.visible = true; }
        continue;
      }
      // Stunned by a flashbang (gadget): stand still, dazed.
      if (u.stunned > 0) {
        u.stunned -= dt;
        u.ctl.moveX = u.ctl.moveZ = 0;
        u.ctl.sprint = false;
        u.pc.update(dt, u.ctl);
        u.pc.events.length = 0;
        u.model.update(dt, u.pc);
        // Punched or tackled (on foot): the model falls, lies there and gets up as the stun wears off
        if (u.floored && u.stunned <= 0) u.floored = false;
        continue;
      }
      // Fixed small steps, like the player
      let t = dt;
      while (t > 1e-4) {
        const h = Math.min(STEP, t);
        this._think(u, lure || (hidden ? this._searchPoint(u) : player.pos), h);
        u.pc.update(h, u.ctl);
        u.pc.events.length = 0;
        u.ctl.jumpPressed = false;
        t -= h;
      }
      u.model.update(dt, u.pc);
      const p = u.pc.pos;
      const dx = player.pos.x - p.x, dz = player.pos.z - p.z;
      const catchDist = hidden ? 0.7 : CATCH_DIST; // they'd have to walk right into your hiding spot
      if (Math.hypot(dx, dz) < catchDist && Math.abs(player.pos.y - p.y) < 1.4 && player.state !== 'zip') result = 'caught';
      // Fell off, or hopelessly behind: come back out of a stairwell soon.
      if (p.y < 2 || Math.hypot(dx, dz) > 90) { u.waitTimer = 3; u.model.root.visible = false; }
    }
    return result;
  }

  /** While you're hidden: run to where they last saw you, then poke around nearby. */
  _searchPoint(u) {
    if (!u.search || Math.hypot(u.search.x - u.pc.pos.x, u.search.z - u.pc.pos.z) < 1.2 || this.searchTimer <= 0) {
      if (this.searchTimer <= 0) this.searchTimer = 4;
      const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 9;
      u.search = new THREE.Vector3(this.lastKnown.x + Math.cos(a) * r, this.lastKnown.y, this.lastKnown.z + Math.sin(a) * r);
    }
    return u.search;
  }

  /** Decide which "buttons" the officer presses this step (running toward `target`). */
  _think(u, target, dt) {
    const pc = u.pc, c = u.ctl;
    const player = { pos: target };
    const dx = player.pos.x - pc.pos.x, dz = player.pos.z - pc.pos.z;
    const dist = Math.hypot(dx, dz) || 1;
    const fx = dx / dist, fz = dz / dist;
    c.camForward.set(fx, 0, fz);
    c.camRight.set(-fz, 0, fx);
    c.moveZ = dist > 0.6 ? 1 : 0;
    c.sprint = true;
    u.jumpCooldown -= dt;
    if (!pc.grounded || u.jumpCooldown > 0) return;

    const y = pc.pos.y;
    // Roof edge ahead?
    const edgeX = pc.pos.x + fx * 1.1, edgeZ = pc.pos.z + fz * 1.1;
    const below = this.world.groundHeight(edgeX, edgeZ, y + 0.5);
    if (below < y - 1.5) {
      // Is there somewhere to land within jumping range?
      let landing = false;
      for (const reach of [3, 4.5, 6]) {
        const g = this.world.groundHeight(pc.pos.x + fx * reach, pc.pos.z + fz * reach, y + 2.5);
        if (g > y - 3 && g < y + 2) { landing = true; break; }
      }
      if (landing && pc.horizontalSpeed > 5) {
        c.jumpPressed = true;
        c.jumpHeld = true;
        u.jumpCooldown = 0.5;
      } else {
        c.moveZ = 0; // don't run off the roof
      }
      return;
    }
    // Blocked by something (a wall or ledge): try jumping / climbing.
    const moved = Math.hypot(pc.pos.x - u.lastPos.x, pc.pos.z - u.lastPos.z);
    u.lastPos.copy(pc.pos);
    u.blockedTime = moved < 0.02 && c.moveZ > 0 ? u.blockedTime + dt : 0;
    if (u.blockedTime > 0.25 || player.pos.y > y + 1.5 && dist < 5) {
      c.jumpPressed = true;
      c.jumpHeld = true;
      u.jumpCooldown = 0.6;
      u.blockedTime = 0;
    }
  }

  dispose() {
    for (const u of this.units) this.scene.remove(u.model.root);
    this.units = [];
  }
}

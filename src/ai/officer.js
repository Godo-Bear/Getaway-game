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
//
// streets: they chase you down on the street too (Free Run). If you climb up
// or drop down and they can't follow, they come back out near your level a
// few seconds later: a rooftop stairwell, or a doorway on the street.

const CATCH_DIST = 1.25;

/**
 * Where police on foot come out in a rooftop city: its stairwell huts (and
 * water towers) up on the roofs, and doorways along every street.
 */
export function rooftopCitySpawns(city) {
  const street = [];
  for (let i = 0; i < city.blockCenters.length - 1; i++) {
    const st = city.blockCenters[i] + city.pitch / 2;
    for (const along of city.blockCenters) street.push(new THREE.Vector3(st, 0, along), new THREE.Vector3(along, 0, st));
  }
  return [...(city.hideSpots || []), ...street];
}

/** Is this spot inside a stairwell hut or under a water tower? */
export function inHideSpot(city, pos) {
  return (city.hideSpots || []).some((h) => Math.hypot(h.x - pos.x, h.z - pos.z) < 1.5 && Math.abs(h.y - pos.y) < 1);
}
const STEP = 1 / 60;
const _from = new THREE.Vector3(), _dir = new THREE.Vector3();

export class OfficerSquad {
  /**
   * @param {THREE.Scene} scene
   * @param {import('../core/collision.js').CollisionWorld} world
   * @param {THREE.Vector3[]} spawns - where officers come out (stairwell huts)
   * @param {{count:number, speed?:number}} opts - speed = fraction of your speed
   */
  constructor(scene, world, spawns, { count = 2, speed = 0.86, streets = false } = {}) {
    this.streets = streets;
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
    this.tipT = 12; // (when they're called out, dispatch tells them where you are)
    this.searchTimer = 0;
  }

  /** Put every officer back at a spawn point (e.g. after the player respawns). */
  scatter(playerPos) {
    this.tipT = 12;
    this.units.forEach((u, i) => { u.waitTimer = 2 + i * 1.5; this._spawn(u, playerPos); });
  }

  _spawn(u, playerPos) {
    // A spawn point 20-70 m from the player (not right on top of them)
    const options = this.spawns.filter((sp) => {
      const d = Math.hypot(sp.x - playerPos.x, sp.z - playerPos.z);
      return d > 20 && d < 70;
    });
    // (on the streets: come out at your level, on the roofs or down on the street)
    const level = this.streets ? options.filter((sp) => Math.abs(sp.y - playerPos.y) < 3) : [];
    const list = level.length ? level : options.length ? options : this.spawns;
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
    // Who can see you? (a clear line of sight, not too far away). If anyone
    // can, they radio it in: everyone knows where you are. If no one can,
    // they head for where you were last seen, then search round there.
    this._sightT = (this._sightT || 0) - dt;
    if (this._sightT <= 0) {
      this._sightT = 0.2;
      for (const u of this.units) u.sees = !hidden && !(u.waitTimer > 0) && !u.inactive && !(u.stunned > 0) && this._canSee(u, player.pos);
    }
    const seen = this.units.some((u) => u.sees);
    if (seen && !this.seesPlayer) this.spottedAt = performance.now();
    this.seesPlayer = seen;
    // (a tip-off - dispatch, an alarm - tells them where you are for a few seconds)
    if (this.tipT > 0) this.tipT -= dt;
    if (lure) this.lastKnown.copy(lure);
    else if (seen || (this.tipT > 0 && !hidden)) { this.lastKnown.copy(player.pos); this.lostFor = 0; } else this.lostFor = (this.lostFor || 0) + dt;
    this.searchTimer -= dt;
    // Climbing a ladder in a stairwell: the nearest officer waits at its door
    const L = player.state === 'ladder' ? player.ladder : null;
    const door = L ? new THREE.Vector3(L.x + L.nx * 2.2, L.y0, L.z + L.nz * 2.2) : null;
    let guard = null;
    if (door) {
      let bd = Infinity;
      for (const u of this.units) {
        if (u.waitTimer > 0 || u.inactive) continue;
        const d = Math.hypot(u.pc.pos.x - door.x, u.pc.pos.z - door.z);
        if (d < bd) { bd = d; guard = u; }
      }
    }
    for (const u of this.units) {
      if (u.inactive) continue;
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
        // (just lost you: run to where you were seen; after that, search round there)
        const target = lure || (u === guard ? door : seen || this.tipT > 0 ? player.pos : this.lostFor < 4 ? this.lastKnown : this._searchPoint(u));
        this._think(u, target, h);
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
      // (On the streets they follow you down; if you're a floor or more above or
      // below them for a while, they come back out near your level.)
      u.offLevel = this.streets && Math.abs(player.pos.y - p.y) > 4 ? (u.offLevel || 0) + dt : 0;
      if ((p.y < 2 && !this.streets) || p.y < -3 || Math.hypot(dx, dz) > 90 || u.offLevel > 5) { u.waitTimer = 3; u.offLevel = 0; u.model.root.visible = false; }
    }
    return result;
  }

  /** An alarm or a 999 call: they know where you are for a while. */
  alert(seconds = 10) {
    this.tipT = Math.max(this.tipT, seconds);
  }

  /** A clear line from the officer's eyes to you, within 45 m? */
  _canSee(u, pos) {
    const e = u.pc.pos;
    const dx = pos.x - e.x, dy = (pos.y + 1.2) - (e.y + 1.6), dz = pos.z - e.z;
    const d = Math.hypot(dx, dy, dz);
    if (d > 45) return false;
    if (d < 2) return true;
    _from.set(e.x, e.y + 1.6, e.z);
    _dir.set(dx / d, dy / d, dz / d);
    return this.world.raycast(_from, _dir, d - 0.4) >= d - 0.4;
  }

  /**
   * How many officers are out (the rest wait, out of sight). More come out as
   * the wanted level goes up.
   */
  setActive(n) {
    this.units.forEach((u, i) => {
      const on = i < n;
      if (on && u.inactive) { u.inactive = false; u.waitTimer = 2 + i * 1.5; this.tipT = Math.max(this.tipT, 10); }
      else if (!on && !u.inactive) { u.inactive = true; u.model.root.visible = false; u.sees = false; }
    });
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

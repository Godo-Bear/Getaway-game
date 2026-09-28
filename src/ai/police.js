import * as THREE from 'three';
import { Car, CAR_SPECS } from '../vehicles/car.js';
import { makeCarMesh, updateSirens } from '../vehicles/carModel.js';
import { driveToward, handleStuck, makeAiState } from './driver.js';

// Police pursuit AI.
//
// PoliceForce = "dispatch": it owns all the cruisers and shares what they
// know. If ANY cop can see you, every cop knows where you are.
//
// Each cruiser picks one of three behaviours every tick:
//   PURSUE   - it can see you on the same street: drive straight at you
//              (aiming a little ahead of where you're going)
//   NAVIGATE - it knows roughly where you are but can't see you: follow the
//              road graph, at each intersection turning toward you
//   SEARCH   - the trail has gone cold: cruise to random intersections
//              near where you were last seen
//
// Cops never stay stuck: they reverse out, and if that fails (or they end up
// far behind) they are quietly respawned somewhere off-screen.

const SIGHT_RANGE = 130;
const _v = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _frustum = new THREE.Frustum();
const _projScreen = new THREE.Matrix4();

export class PoliceUnit {
  constructor(scene) {
    this.mesh = makeCarMesh({ kind: 'police' });
    scene.add(this.mesh);
    this.car = new Car(CAR_SPECS.police, this.mesh);
    this.car.active = true;
    this.car.isPolice = true;
    this.car.unit = this;
    this.ai = makeAiState();
    this.targetNode = null;
    this.prevNode = null;
    this.seesPlayer = false;
    this.mode = 'navigate';
    this.farTimer = 0;
  }
}

export class PoliceForce {
  constructor(scene, city, rng) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.units = [];
    this.lastKnown = new THREE.Vector3();
    this.timeSinceSeen = 0;
    this.searching = false;
    this.anySees = false;
    this.time = 0;
  }

  get cars() {
    return this.units.map((u) => u.car);
  }

  /** Make sure there are `count` cruisers, spawning new ones off-screen. */
  setCount(count, player, camera) {
    while (this.units.length < count) {
      const u = new PoliceUnit(this.scene);
      this.units.push(u);
      this.respawn(u, player, camera);
    }
    while (this.units.length > count) {
      const u = this.units.pop();
      this.scene.remove(u.mesh);
    }
  }

  clear() {
    for (const u of this.units) this.scene.remove(u.mesh);
    this.units = [];
    this.everSeen = false;   // have they spotted the player at all yet?
    this.justReacquired = false;
  }

  /** Line of sight at car-roof height, blocked by buildings. */
  canSee(from, to) {
    _dir.set(to.x - from.x, 0, to.z - from.z);
    const d = _dir.length();
    if (d > SIGHT_RANGE) return false;
    if (d < 0.01) return true;
    _dir.divideScalar(d);
    _v.set(from.x, from.y + 1.2, from.z);
    return this.city.world.raycast(_v, _dir, d) >= d;
  }

  /** Put a unit on an intersection away from the player and out of view. */
  respawn(unit, player, camera, { minDist = 80, maxDist = 170 } = {}) {
    const nodes = this.city.graph.nodes;
    let candidates = nodes.filter((n) => {
      const d = Math.hypot(n.x - player.pos.x, n.z - player.pos.z);
      return d > minDist && d < maxDist;
    });
    if (camera) {
      camera.updateMatrixWorld();
      _projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      _frustum.setFromProjectionMatrix(_projScreen);
      const hidden = candidates.filter((n) => !_frustum.containsPoint(_v.set(n.x, 1, n.z)));
      if (hidden.length) candidates = hidden;
    }
    // Don't spawn on top of another car
    candidates = candidates.filter((n) => !this.units.some((u) => u !== unit && Math.hypot(u.car.pos.x - n.x, u.car.pos.z - n.z) < 8));
    if (!candidates.length) candidates = nodes;
    const node = candidates[Math.floor(this.rng() * candidates.length)];
    const heading = Math.atan2(player.pos.x - node.x, player.pos.z - node.z);
    // Snap the heading to the nearest road direction
    const snapped = Math.round(heading / (Math.PI / 2)) * (Math.PI / 2);
    unit.car.place(node.x, node.z, snapped);
    unit.car.health = 1;
    unit.targetNode = null;
    unit.prevNode = node;
    unit.ai = makeAiState();
    unit.farTimer = 0;
  }

  /**
   * @param {number} dt
   * @param {Car} player
   * @param {{speedFactor:number, aggression:number}} heat
   * @param {THREE.Camera} camera (to respawn out of view)
   * @param {{hideBonus:boolean}} opts
   */
  update(dt, player, heat, camera) {
    this.time += dt;
    this.anySees = false;
    for (const u of this.units) {
      u.seesPlayer = this.canSee(u.car.pos, player.pos);
      if (u.seesPlayer) this.anySees = true;
    }
    if (this.anySees) {
      this.everSeen = true;
      if (this.searching) this.justReacquired = true; // the game shows a message
      this.lastKnown.copy(player.pos);
      this.timeSinceSeen = 0;
      this.searching = false;
    } else {
      this.timeSinceSeen += dt;
    }

    for (const u of this.units) {
      const car = u.car;
      car.speedFactor = heat.speedFactor;
      if (!this.searching && u.seesPlayer && Math.hypot(player.pos.x - car.pos.x, player.pos.z - car.pos.z) < 110) {
        // --- PURSUE: aim a little ahead of the player
        u.mode = 'pursue';
        const dist = Math.hypot(player.pos.x - car.pos.x, player.pos.z - car.pos.z);
        const lead = Math.min(1.2, dist / 35);
        const tx = player.pos.x + player.vel.x * lead;
        const tz = player.pos.z + player.vel.z * lead;
        // Far away: full speed. Close to a slow player: match their speed
        // and box them in rather than bouncing off them.
        const want = dist < 16 ? Math.max(player.speed + dist * 0.5, 3) : 60;
        driveToward(car, tx, tz, want, { allowDrift: true });
        u.targetNode = null;
      } else {
        // --- NAVIGATE (towards last known position) or SEARCH (random nearby)
        u.mode = this.searching ? 'search' : 'navigate';
        const graph = this.city.graph;
        if (!u.targetNode) this._chooseFirstNode(u);
        const reached = Math.hypot(u.targetNode.x - car.pos.x, u.targetNode.z - car.pos.z) < 9;
        if (reached) {
          const from = u.targetNode;
          let next;
          if (this.searching) {
            // SEARCH PATTERN: each cruiser picks an intersection inside the
            // search area, drives there, then picks another. The area grows
            // the longer you stay hidden, so they fan out.
            if (!u.searchGoal || u.searchGoal === from) u.searchGoal = this._pickSearchGoal(from);
            next = graph.bestNeighbourToward(from, u.searchGoal.x, u.searchGoal.z, u.prevNode);
          } else {
            u.searchGoal = null;
            next = graph.bestNeighbourToward(from, this.lastKnown.x, this.lastKnown.z, u.prevNode);
          }
          u.prevNode = from;
          u.targetNode = next;
        }
        // Aim for the right-hand lane (not the centre line) so cruisers going
        // opposite ways don't meet head-on.
        const tn = u.targetNode;
        const dx = tn.x - car.pos.x, dz = tn.z - car.pos.z;
        const len = Math.hypot(dx, dz) || 1;
        const lane = len > 14 ? 3.2 : 0; // near the junction, aim at its centre to turn
        driveToward(car, tn.x - (dz / len) * lane, tn.z + (dx / len) * lane, this.searching ? 16 : 45, { allowDrift: true });
      }

      // A cop pressed up against you isn't stuck, it's boxing you in: hold position.
      const pinning = Math.hypot(player.pos.x - car.pos.x, player.pos.z - car.pos.z) < 8 && !this.searching;
      if (pinning) u.ai.stuckTimer = 0;
      else if (handleStuck(car, u.ai, dt)) this.respawn(u, player, camera);

      // Too far away and can't see you: bring them back into play.
      const far = Math.hypot(player.pos.x - car.pos.x, player.pos.z - car.pos.z) > 220 && !u.seesPlayer;
      u.farTimer = far ? u.farTimer + dt : 0;
      if (u.farTimer > 3 && !this.searching) this.respawn(u, player, camera);
    }
  }

  /** Radius (m) of the area the cops are searching, centred on lastKnown. */
  get searchRadius() {
    return Math.min(240, 60 + this.timeSinceSeen * 5);
  }

  _pickSearchGoal(from) {
    const r = this.searchRadius;
    const nodes = this.city.graph.nodes.filter((n) => n !== from &&
      Math.hypot(n.x - this.lastKnown.x, n.z - this.lastKnown.z) < r);
    if (!nodes.length) return this.city.graph.nearestNode(this.lastKnown.x, this.lastKnown.z);
    return nodes[Math.floor(this.rng() * nodes.length)];
  }

  /** From mid-block, pick whichever end of the current road helps most. */
  _chooseFirstNode(u) {
    const graph = this.city.graph;
    const car = u.car;
    const near = graph.nearestNode(car.pos.x, car.pos.z);
    // Candidate: the nearest node and its neighbours; prefer ones roughly in front of us.
    let best = near, bestScore = Infinity;
    for (const n of [near, ...near.neighbours]) {
      const dCar = Math.hypot(n.x - car.pos.x, n.z - car.pos.z);
      if (dCar > graph.pitch * 1.2) continue;
      const dGoal = Math.hypot(n.x - this.lastKnown.x, n.z - this.lastKnown.z);
      const ahead = (n.x - car.pos.x) * car.fwdX + (n.z - car.pos.z) * car.fwdZ;
      const score = dGoal + dCar * 0.5 + (ahead < 0 ? 40 : 0);
      if (score < bestScore) { bestScore = score; best = n; }
    }
    u.targetNode = best;
  }

  syncMeshes(time) {
    for (const u of this.units) {
      u.car.syncMesh();
      updateSirens(u.mesh, time + u.car.pos.x * 0.01, true);
    }
  }
}

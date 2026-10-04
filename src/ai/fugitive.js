import * as THREE from 'three';
import { PlayerModel } from '../player/playerModel.js';
import { crewLook } from '../player/people.js';
import { Car, CAR_SPECS } from '../vehicles/car.js';
import { makeCarMesh } from '../vehicles/carModel.js';
import { driveToward, handleStuck, makeAiState } from './driver.js';

// Fugitives: people you have to CATCH.
//
// FugitiveRunner - someone running away on foot along a fixed parkour route
//   (a list of points; some legs are jumps or zip lines). They run a little
//   slower than your sprint, speed up when you get close, and slow down if
//   you fall far behind so the chase stays tense. At the end of the route
//   they're cornered.
//
// FugitiveCar - a car fleeing through the city to a destination. It picks
//   turns that head for the destination, with the odd random detour.

const RUNNER_BAGS = { vince: 0x2a2a2a, marla: 0x3a2a1a };

export class FugitiveRunner {
  /**
   * @param {THREE.Scene} scene
   * @param {Array<THREE.Vector3 & {jump?:boolean, zip?:boolean}>} path - feet positions
   * @param {{speed?:number, triggerDist?:number}} opts
   */
  constructor(scene, path, { speed = 8.6, triggerDist = 30, colors = 'vince' } = {}) {
    this.scene = scene;
    this.path = path;
    this.baseSpeed = speed;
    this.triggerDist = triggerDist;
    this.lengths = [0];
    for (let i = 1; i < path.length; i++) this.lengths.push(this.lengths[i - 1] + path[i].distanceTo(path[i - 1]));
    this.total = this.lengths[this.lengths.length - 1];
    this.s = 0;               // distance travelled along the path
    this.running = false;
    this.pos = path[0].clone();
    this.model = new PlayerModel(crewLook(colors, { bag: RUNNER_BAGS[colors] ?? 0x2a2a2a }), { bag: true });
    scene.add(this.model.root);
    // A fake "controller" the animation code can read
    this.body = { pos: this.pos, vel: new THREE.Vector3(), facing: 0, state: 'ground', horizontalSpeed: 0,
      mantleProgress: 0, stateTime: 0, stumbleTimer: 0, mantle: null, wallRun: null };
  }

  get cornered() {
    return this.s >= this.total - 0.01;
  }

  distanceTo(p) {
    return Math.hypot(p.x - this.pos.x, p.z - this.pos.z) + Math.max(0, Math.abs(p.y - this.pos.y) - 1);
  }

  /** After the player respawns at a checkpoint: put the fugitive a bit ahead of it. */
  resetNear(p) {
    let best = 0, bd = Infinity;
    this.path.forEach((q, i) => { const d = q.distanceTo(p); if (d < bd) { bd = d; best = i; } });
    this.s = Math.min(this.total, this.lengths[best] + 22);
    this.running = false;
  }

  update(dt, playerPos, ghost) {
    this.model.root.visible = !ghost;
    if (ghost) return;
    const d = this.distanceTo(playerPos);
    if (!this.running && d < this.triggerDist) this.running = true;
    let speed = 0;
    if (this.running && !this.cornered) {
      // Rubber band: pull away when you're close, wait when you're far.
      speed = d < 10 ? this.baseSpeed + 1.0 : d > 38 ? this.baseSpeed * 0.55 : this.baseSpeed;
      this.s = Math.min(this.total, this.s + speed * dt);
    }
    // Where on the path are we?
    let k = 1;
    while (k < this.lengths.length - 1 && this.lengths[k] < this.s) k++;
    const a = this.path[k - 1], b = this.path[k];
    const seg = Math.max(1e-6, this.lengths[k] - this.lengths[k - 1]);
    const u = Math.min(1, Math.max(0, (this.s - this.lengths[k - 1]) / seg));
    const prev = this.pos.clone();
    this.pos.lerpVectors(a, b, u);
    let state = 'ground';
    if (b.jump) { this.pos.y += Math.sin(Math.PI * u) * 1.4; state = u > 0.02 && u < 0.98 ? 'air' : 'ground'; }
    if (b.zip) state = u < 0.99 ? 'zip' : 'ground';
    const body = this.body;
    body.state = state;
    body.vel.copy(this.pos).sub(prev).divideScalar(Math.max(dt, 1e-4));
    body.horizontalSpeed = speed;
    if (b.x !== a.x || b.z !== a.z) body.facing = Math.atan2(b.x - a.x, b.z - a.z);
    if (this.cornered) body.facing = Math.atan2(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
    this.model.update(dt, body);
    // In a zip line the feet hang below the cable; our path stores feet positions.
  }

  dispose() {
    this.scene.remove(this.model.root);
  }
}

export class FugitiveCar {
  /**
   * @param {THREE.Scene} scene
   * @param {object} city - from generateStreetCity
   * @param {object} dest - road graph node to flee to
   * @param {Function} rng
   * @param {number} color - paint colour (Vince's brown sedan by default)
   */
  constructor(scene, city, dest, rng, color = 0x5a3a22) {
    this.city = city;
    this.dest = dest;
    this.rng = rng;
    this.mesh = makeCarMesh({ kind: 'civilian', color });
    scene.add(this.mesh);
    this.scene = scene;
    this.car = new Car({ ...CAR_SPECS.police, maxSpeed: 36 }, this.mesh);
    this.car.active = true;
    this.car.isFugitive = true;
    this.ai = makeAiState();
    this.target = null;
    this.prev = null;
    // Big arrow above the car so you can always see it
    const marker = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.2, 4), new THREE.MeshBasicMaterial({ color: 0xffb020, toneMapped: false }));
    marker.rotation.x = Math.PI;
    marker.position.y = 3.2;
    this.mesh.add(marker);
    this.marker = marker;
  }

  place(node, heading) {
    this.car.place(node.x, node.z, heading);
    this.target = null;
    this.prev = node;
  }

  /** @returns {'escaped'|null} */
  update(dt) {
    const car = this.car, graph = this.city.graph;
    if (Math.hypot(car.pos.x - this.dest.x, car.pos.z - this.dest.z) < 14) return 'escaped';
    if (!this.target) this.target = graph.bestNeighbourToward(graph.nearestNode(car.pos.x, car.pos.z), this.dest.x, this.dest.z, this.prev);
    if (Math.hypot(this.target.x - car.pos.x, this.target.z - car.pos.z) < 10) {
      const from = this.target;
      let next = graph.bestNeighbourToward(from, this.dest.x, this.dest.z, this.prev);
      // Every so often, take a detour to shake you off.
      if (this.rng() < 0.3) {
        const alt = from.neighbours.filter((n) => n !== this.prev && n !== next);
        if (alt.length) next = alt[Math.floor(this.rng() * alt.length)];
      }
      this.prev = from;
      this.target = next;
    }
    // Right-hand lane toward the next junction
    const t = this.target;
    const dx = t.x - car.pos.x, dz = t.z - car.pos.z, len = Math.hypot(dx, dz) || 1;
    const lane = len > 14 ? 3.2 : 0;
    driveToward(car, t.x - (dz / len) * lane, t.z + (dx / len) * lane, 40, { allowDrift: true });
    if (handleStuck(car, this.ai, dt)) {
      // Hopelessly stuck: nudge back onto the nearest junction
      const n = graph.nearestNode(car.pos.x, car.pos.z);
      this.place(n, car.heading);
    }
    this.marker.rotation.y += dt * 3;
    return null;
  }

  dispose() {
    this.scene.remove(this.mesh);
  }
}

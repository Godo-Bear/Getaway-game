import * as THREE from 'three';
import { Car, CAR_SPECS } from './car.js';
import { makeCarMesh, CIVILIAN_COLORS } from './carModel.js';
import { driveToward, handleStuck, makeAiState } from '../ai/driver.js';
import { LANE_OFFSETS } from '../world/streetCity.js';

// Civilian traffic.
//
// Each civilian drives along one edge of the road graph in the right-hand
// lane, then picks a random new direction at the next intersection. They:
//   - stop at red (and yellow) lights
//   - brake for cars in front of them
//   - swerve to the side and slow down when you honk behind them
//   - get knocked about if you hit them, then are recycled off-screen

const CRUISE = 11;     // m/s (~40 km/h)
const _v = new THREE.Vector3();
const _frustum = new THREE.Frustum();
const _m = new THREE.Matrix4();

class Civilian {
  constructor(scene, rng) {
    const kind = rng() < 0.15 ? 'van' : rng() < 0.2 ? 'taxi' : 'civilian';
    const color = kind === 'taxi' ? 0xe8b820 : kind === 'van' ? 0x9a9c9f : CIVILIAN_COLORS[Math.floor(rng() * CIVILIAN_COLORS.length)];
    this.mesh = makeCarMesh({ kind, color });
    scene.add(this.mesh);
    this.car = new Car(CAR_SPECS.civilian, this.mesh);
    this.car.active = true;
    this.car.isCivilian = true;
    this.car.unit = this;
    this.ai = makeAiState();
    this.from = null;
    this.to = null;
    this.lane = LANE_OFFSETS[rng() < 0.5 ? 0 : 1];
    this.swerve = 0;       // extra sideways offset while swerving
    this.swerveTimer = 0;
    this.knockedTimer = 0; // > 0 after being hit: just rolls to a stop
  }
}

export class Traffic {
  constructor(scene, city, rng, count = 22) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.civs = [];
    for (let i = 0; i < count; i++) this.civs.push(new Civilian(scene, rng));
  }

  get cars() {
    return this.civs.map((c) => c.car);
  }

  /** Place every car on a random road (used at the start). */
  scatter(player) {
    for (const c of this.civs) this.respawn(c, player, null, 25, 260);
  }

  respawn(c, player, camera, minD = 90, maxD = 200) {
    const graph = this.city.graph;
    if (camera) {
      camera.updateMatrixWorld();
      _m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      _frustum.setFromProjectionMatrix(_m);
    }
    for (let tries = 0; tries < 30; tries++) {
      const a = graph.nodes[Math.floor(this.rng() * graph.nodes.length)];
      const b = a.neighbours[Math.floor(this.rng() * a.neighbours.length)];
      const t = 0.3 + this.rng() * 0.4;
      const p = graph.lanePoint(a, b, t, c.lane, _v);
      const d = Math.hypot(p.x - player.pos.x, p.z - player.pos.z);
      if (d < minD || d > maxD) continue;
      if (camera && _frustum.containsPoint(_v.set(p.x, 1, p.z))) continue;
      if (this.civs.some((o) => o !== c && Math.hypot(o.car.pos.x - p.x, o.car.pos.z - p.z) < 10)) continue;
      c.from = a;
      c.to = b;
      c.car.place(p.x, p.z, Math.atan2(b.x - a.x, b.z - a.z));
      c.car.health = 1;
      c.knockedTimer = 0;
      c.swerve = 0;
      c.ai = makeAiState();
      return;
    }
  }

  /** Honk: civilians in front of the player within 35 m pull aside. */
  honk(player) {
    const fx = Math.sin(player.heading), fz = Math.cos(player.heading);
    for (const c of this.civs) {
      const dx = c.car.pos.x - player.pos.x, dz = c.car.pos.z - player.pos.z;
      const ahead = dx * fx + dz * fz;
      const side = Math.abs(-dx * fz + dz * fx);
      if (ahead > 0 && ahead < 35 && side < 8) {
        c.swerveTimer = 2.5;
      }
    }
  }

  update(dt, player, camera, otherCars) {
    const graph = this.city.graph;
    const lights = this.city.trafficLights;
    for (const c of this.civs) {
      const car = c.car;

      // Knocked by a collision: coast to a stop, then get recycled.
      if (car.lastImpact > 7 && c.knockedTimer <= 0) c.knockedTimer = 5;
      car.lastImpact = 0;
      if (c.knockedTimer > 0) {
        c.knockedTimer -= dt;
        car.controls.throttle = 0;
        car.controls.steer = 0;
        car.controls.handbrake = true;
        if (c.knockedTimer <= 0) this.respawn(c, player, camera);
        continue;
      }

      const a = c.from, b = c.to;
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const fx = (b.x - a.x) / len, fz = (b.z - a.z) / len;
      // How far along the edge are we? (0 = at a, len = at b)
      const along = (car.pos.x - a.x) * fx + (car.pos.z - a.z) * fz;

      // Reached the end of this road: pick a new direction.
      if (along > len - 6) {
        c.from = b;
        c.to = graph.randomNeighbour(b, this.rng, a);
        continue;
      }

      // Swerve (after a honk): shift to the kerb and slow down.
      c.swerveTimer = Math.max(0, c.swerveTimer - dt);
      c.swerve += ((c.swerveTimer > 0 ? 2.2 : 0) - c.swerve) * Math.min(1, dt * 3);

      // Look ahead along the lane
      const t = Math.min(1, (along + 10) / len);
      const target = graph.lanePoint(a, b, t, c.lane + c.swerve, _v);
      let speed = c.swerveTimer > 0 ? 4 : CRUISE;

      // Traffic light at the far intersection
      const axis = Math.abs(fx) > 0.5 ? 'x' : 'z';
      const stopLine = len - this.city.roadWidth / 2 - 4;
      const light = lights.state(b, axis);
      if (light !== 'green' && along < stopLine && along > stopLine - 25) {
        const distToLine = stopLine - along;
        speed = Math.min(speed, Math.max(0, (distToLine - 1) * 0.8));
      }

      // Don't drive into cars in front
      for (const o of otherCars) {
        if (o === car) continue;
        const dx = o.pos.x - car.pos.x, dz = o.pos.z - car.pos.z;
        const ahead = dx * car.fwdX + dz * car.fwdZ;
        if (ahead <= 0 || ahead > 14) continue;
        const side = Math.abs(-dx * car.fwdZ + dz * car.fwdX);
        if (side < 2.4) speed = Math.min(speed, Math.max(0, (ahead - 6) * 1.2));
      }

      driveToward(car, target.x, target.z, speed);
      if (speed < 0.5) {
        car.controls.throttle = car.forwardSpeed > 0.3 ? -1 : 0;
      }
      if (handleStuck(car, c.ai, dt)) this.respawn(c, player, camera);
    }

    // Recycle cars that are far from the player so traffic stays around you.
    for (const c of this.civs) {
      const d = Math.hypot(c.car.pos.x - player.pos.x, c.car.pos.z - player.pos.z);
      if (d > 260) this.respawn(c, player, camera);
    }
  }

  syncMeshes() {
    for (const c of this.civs) {
      c.car.syncMesh();
      // Brake lights
      const braking = c.car.controls.throttle < 0 || c.car.speed < 0.5;
      c.mesh.userData.tailMat.color.setHex(braking ? 0xff2030 : 0x881018);
    }
  }

  clear() {
    for (const c of this.civs) this.scene.remove(c.mesh);
    this.civs = [];
  }
}

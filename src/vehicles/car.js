import * as THREE from 'three';
import { clamp, damp, lerp } from '../core/utils.js';

// Arcade car physics, shared by the player, police and civilian traffic.
//
// Not a simulation - it's tuned to FEEL good:
//   - speed is split into "forward" and "sideways" parts
//   - sideways speed is killed quickly by tyre grip, so the car goes where
//     it points... unless you pull the handbrake, which drops grip and lets
//     the back slide out (a drift)
//   - steering is sharp at low speed and gentler at high speed
//   - nitro adds acceleration and raises the top speed
//
// Each car is driven by setting `controls` (from the keyboard for the player,
// from the AI for everyone else) and calling step(dt) every physics tick.
//
// Heading convention: heading 0 faces +Z, forward = (sin h, cos h).

export const CAR_SPECS = {
  player: {
    maxSpeed: 42, accel: 17, brake: 40, reverseMax: 13,
    grip: 10, driftGrip: 1.5, steerLow: 2.7, steerHigh: 1.15,
    nitroAccel: 20, nitroMaxFactor: 1.32, mass: 1,
  },
  police: {
    maxSpeed: 38, accel: 15, brake: 40, reverseMax: 12,
    grip: 9, driftGrip: 2, steerLow: 2.5, steerHigh: 1.1,
    nitroAccel: 0, nitroMaxFactor: 1, mass: 1.1,
  },
  civilian: {
    maxSpeed: 20, accel: 9, brake: 30, reverseMax: 6,
    grip: 10, driftGrip: 2, steerLow: 2.2, steerHigh: 1.2,
    nitroAccel: 0, nitroMaxFactor: 1, mass: 0.9,
  },
};

const GRAVITY = 24;
export const CAR_RADIUS = 1.1;         // collision circle radius
export const CAR_CIRCLES = [-1.2, 1.2]; // circle centres along the car's length

export class Car {
  constructor(spec, mesh) {
    this.spec = { ...spec };
    this.mesh = mesh;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.heading = 0;
    this.yawRate = 0;
    this.vy = 0;
    this.airborne = false;
    this.airTime = 0;
    this.forwardSpeed = 0;
    this.lateralSpeed = 0;
    this.drifting = false;
    this.boosting = false;
    this.pitch = 0;          // visual tilt
    this.roll = 0;
    this.wheelSpin = 0;
    this.lastImpact = 0;     // biggest collision this step (m/s)
    this.speedFactor = 1;    // top speed multiplier (heat level for AI, burst tyres for the player)
    this.gripFactor = 1;     // tyre grip multiplier (burst tyres slide more)
    this.controls = { throttle: 0, steer: 0, handbrake: false, nitro: false };
    this._groundVy = 0;
  }

  get speed() {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  /** Forward unit vector (x, z). */
  get fwdX() { return Math.sin(this.heading); }
  get fwdZ() { return Math.cos(this.heading); }

  place(x, z, heading) {
    this.pos.set(x, 0, z);
    this.vel.set(0, 0, 0);
    this.heading = heading;
    this.yawRate = 0;
    this.vy = 0;
    this.airborne = false;
    this.syncMesh();
  }

  step(dt, groundHeight) {
    const s = this.spec, c = this.controls;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const rx = -fz, rz = fx; // right-hand side of the car
    let vF = this.vel.x * fx + this.vel.z * fz;
    let vL = this.vel.x * rx + this.vel.z * rz;

    this.boosting = false;
    if (!this.airborne) {
      const maxF = s.maxSpeed * this.speedFactor * (c.nitro ? s.nitroMaxFactor : 1);

      // --- Throttle / brake / reverse
      if (c.throttle > 0) {
        if (vF < -0.5) vF += s.brake * dt;             // pressing gas while rolling back = brake
        else {
          const k = clamp(vF / maxF, 0, 1);
          vF += s.accel * c.throttle * (1 - k * k) * dt; // strong at low speed, fades near top speed
        }
      } else if (c.throttle < 0) {
        if (vF > 0.5) vF -= s.brake * -c.throttle * dt;
        else vF = Math.max(vF - s.accel * 0.6 * -c.throttle * dt, -s.reverseMax);
      } else {
        vF -= Math.sign(vF) * Math.min(Math.abs(vF), 5 * dt); // coasting drag
      }
      if (vF > maxF) vF = damp(vF, maxF, 2, dt);          // e.g. after nitro ends

      // --- Nitro
      if (c.nitro && s.nitroAccel > 0 && vF > -1 && vF < maxF) {
        vF += s.nitroAccel * dt * (1 - clamp(vF / maxF, 0, 1) * 0.5);
        this.boosting = true;
      }

      // --- Handbrake slows you a little and kills grip
      if (c.handbrake) vF -= Math.sign(vF) * Math.min(Math.abs(vF), 7 * dt);

      // --- Tyre grip: bleed off sideways speed
      let grip = (c.handbrake ? s.driftGrip : s.grip) * this.gripFactor;
      if (!c.handbrake && Math.abs(vL) > 5) grip *= 0.45; // a slide takes a moment to recover
      vL *= Math.exp(-grip * dt);

      // --- Steering: tight at low speed, gentle at high speed.
      const sp = Math.abs(vF);
      const speedK = clamp(sp / 4, 0, 1);                 // can't turn on the spot
      let steerRate = lerp(s.steerLow, s.steerHigh, clamp(sp / s.maxSpeed, 0, 1)) * speedK;
      if (c.handbrake) steerRate *= 1.45;
      const targetYaw = -c.steer * steerRate * Math.sign(vF || 1);
      this.yawRate = damp(this.yawRate, targetYaw, 10, dt);
    } else {
      // In the air: no grip, no steering (just a little spin)
      this.yawRate = damp(this.yawRate, -c.steer * 0.4, 2, dt);
    }

    this.heading += this.yawRate * dt;
    // Rebuild velocity from the NEW heading. Forward speed turns with the car
    // (arcade feel), sideways speed stays behind = the drift.
    const nfx = Math.sin(this.heading), nfz = Math.cos(this.heading);
    const nrx = -nfz, nrz = nfx;
    this.vel.x = nfx * vF + nrx * vL;
    this.vel.z = nfz * vF + nrz * vL;
    this.forwardSpeed = vF;
    this.lateralSpeed = vL;
    this.drifting = !this.airborne && Math.abs(vL) > 3.5 && Math.abs(vF) > 8;

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;

    // --- Vertical: ramps and jumps
    const ground = groundHeight(this.pos.x, this.pos.z);
    if (this.airborne) {
      this.airTime += dt;
      this.vy -= GRAVITY * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= ground) {
        this.lastLanding = -this.vy;
        this.pos.y = ground;
        this.vy = 0;
        this.airborne = false;
      }
    } else {
      const prevY = this.pos.y;
      if (ground < prevY - 0.25) {
        // The road dropped away under us (end of a ramp): take off!
        this.airborne = true;
        this.airTime = 0;
        this.vy = this._groundVy;
      } else {
        this.pos.y = ground;
        this._groundVy = (ground - prevY) / dt;
      }
    }

    // --- Visual tilt and wheel spin
    const targetPitch = this.airborne ? clamp(-this.vy * 0.03, -0.35, 0.35) : clamp(-this._groundVy * 0.08, -0.3, 0.3);
    this.pitch = damp(this.pitch, targetPitch, 8, dt);
    this.roll = damp(this.roll, clamp(vL * 0.015 + this.yawRate * vF * 0.004, -0.12, 0.12), 6, dt);
    this.wheelSpin += vF * dt / 0.42;
  }

  syncMesh() {
    if (!this.mesh) return;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.set(this.pitch, this.heading, this.roll, 'YXZ');
    if (this.mesh.userData.wheels) {
      for (const w of this.mesh.userData.wheels) w.rotation.x = this.wheelSpin;
    }
  }
}

// ----------------------------------------------------------------------
// Collisions
// ----------------------------------------------------------------------

const _hits = [];

/**
 * Push a car out of static boxes (buildings, walls, trees).
 * The car is approximated by two circles along its length.
 * Returns the hardest impact speed (m/s) so the caller can apply damage.
 */
export function collideCarWithWorld(car, world) {
  let maxImpact = 0;
  const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
  for (const off of CAR_CIRCLES) {
    const cx = car.pos.x + fx * off, cz = car.pos.z + fz * off;
    const r = CAR_RADIUS;
    world.query(cx - r, car.pos.y + 0.3, cz - r, cx + r, car.pos.y + 1.5, cz + r, _hits);
    for (const b of _hits) {
      // Closest point on the box (in the ground plane) to the circle centre
      const px = clamp(cx, b.min.x, b.max.x), pz = clamp(cz, b.min.z, b.max.z);
      let nx = cx - px, nz = cz - pz;
      let d = Math.hypot(nx, nz);
      let pen;
      if (d < 1e-5) {
        // Centre is inside the box: push out the shortest way.
        const opts = [
          [cx - b.min.x, -1, 0], [b.max.x - cx, 1, 0],
          [cz - b.min.z, 0, -1], [b.max.z - cz, 0, 1],
        ].sort((a, q) => a[0] - q[0]);
        nx = opts[0][1]; nz = opts[0][2];
        pen = opts[0][0] + r;
      } else {
        if (d >= r) continue;
        nx /= d; nz /= d;
        pen = r - d;
      }
      car.pos.x += nx * pen;
      car.pos.z += nz * pen;
      const vn = car.vel.x * nx + car.vel.z * nz;
      if (vn < 0) {
        // Remove the speed going into the wall, with a little bounce.
        car.vel.x -= nx * vn * 1.25;
        car.vel.z -= nz * vn * 1.25;
        maxImpact = Math.max(maxImpact, -vn);
        // Glancing blows scrub some speed along the wall too
        car.vel.x *= 0.985;
        car.vel.z *= 0.985;
      }
    }
  }
  car.lastImpact = Math.max(car.lastImpact, maxImpact);
  return maxImpact;
}

/**
 * Car-vs-car collisions for a list of cars. Calls onHit(a, b, impact) for
 * each collision so the game can apply damage, heat, etc.
 */
export function collideCars(cars, onHit) {
  const r2 = CAR_RADIUS * 2;
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i];
    if (!a.active) continue;
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j];
      if (!b.active) continue;
      const dx0 = b.pos.x - a.pos.x, dz0 = b.pos.z - a.pos.z;
      if (dx0 * dx0 + dz0 * dz0 > 36) continue; // far apart: skip quickly
      if (Math.abs(a.pos.y - b.pos.y) > 1.5) continue; // one is jumping over the other
      const afx = Math.sin(a.heading), afz = Math.cos(a.heading);
      const bfx = Math.sin(b.heading), bfz = Math.cos(b.heading);
      let best = null;
      for (const oa of CAR_CIRCLES) {
        for (const ob of CAR_CIRCLES) {
          const ax = a.pos.x + afx * oa, az = a.pos.z + afz * oa;
          const bx = b.pos.x + bfx * ob, bz = b.pos.z + bfz * ob;
          const dx = bx - ax, dz = bz - az;
          const d = Math.hypot(dx, dz);
          if (d < r2 && (!best || d < best.d)) best = { d, dx, dz };
        }
      }
      if (!best) continue;
      const d = best.d || 0.001;
      const nx = best.dx / d, nz = best.dz / d;
      const pen = r2 - d;
      const ma = a.spec.mass, mb = b.spec.mass, total = ma + mb;
      a.pos.x -= nx * pen * (mb / total);
      a.pos.z -= nz * pen * (mb / total);
      b.pos.x += nx * pen * (ma / total);
      b.pos.z += nz * pen * (ma / total);
      // Relative speed along the collision normal
      const rv = (b.vel.x - a.vel.x) * nx + (b.vel.z - a.vel.z) * nz;
      if (rv < 0) {
        const jImp = (-(1 + 0.3) * rv) / (1 / ma + 1 / mb);
        a.vel.x -= (jImp / ma) * nx; a.vel.z -= (jImp / ma) * nz;
        b.vel.x += (jImp / mb) * nx; b.vel.z += (jImp / mb) * nz;
        onHit?.(a, b, -rv);
      }
    }
  }
}

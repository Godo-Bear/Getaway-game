import * as THREE from 'three';
import { Car, CAR_SPECS, collideCarWithWorld, collideCars } from '../../vehicles/car.js';
import { makeCarMesh, updateSirens, CIVILIAN_COLORS } from '../../vehicles/carModel.js';
import { driveToward } from '../../ai/driver.js';
import { makeRng, clamp, wrapAngle } from '../../core/utils.js';
import { audio } from '../../core/audio.js';

// Free Run on foot: the streets have traffic.
//
//  - Cars drive round the block grid (keeping to the right), stop for you
//    and for each other, and now and then pull over and park for a while.
//    A parked (or stopped) car can be stolen.
//  - Police cars (sirens on) come out when you're wanted, and head for you.
//    On foot they radio the officers where you are; in a car you've stolen
//    they chase you, and boxing you in when you've stopped = busted.
//  - Stealing: you drive the car right here in this city (no loading). E
//    to get out again.
//
// The streets: the lines between the blocks (13 m wide: 2.5 m pavements
// and an 8 m road, one lane each way).

const LANE = 1.15;      // lane centre, from the road's centre line
const KERB = 3.0;       // where cars pull over and park
const CRUISE = 11;      // m/s
const COP_SPEED = 19;
const STOLEN = { ...CAR_SPECS.player, maxSpeed: 32, accel: 15, slip: 0.45 };
const ground = () => 0;
const _v = new THREE.Vector3();
const _frustum = new THREE.Frustum(), _m = new THREE.Matrix4();

/** The street grid of a rooftop city: the lines between the blocks, and their crossings. */
export function streetGrid(city) {
  const lines = [];
  for (let k = 0; k <= city.blockCenters.length; k++) lines.push(city.blockCenters[0] - city.pitch / 2 + k * city.pitch);
  const n = lines.length, nodes = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) nodes.push({ i, j, x: lines[i], z: lines[j], nb: [] });
  const at = (i, j) => (i >= 0 && j >= 0 && i < n && j < n ? nodes[i * n + j] : null);
  for (const o of nodes) for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const q = at(o.i + di, o.j + dj); if (q) o.nb.push(q); }
  const near = (x, z) => {
    let best = null, bd = Infinity;
    for (const o of nodes) { const d = Math.hypot(o.x - x, o.z - z); if (d < bd) { bd = d; best = o; } }
    return best;
  };
  return { lines, nodes, near, min: lines[0], max: lines[n - 1] };
}

export class FootTraffic {
  constructor(mode, { count = 9 } = {}) {
    this.mode = mode;
    this.city = mode.city;
    this.grid = streetGrid(this.city);
    this.rng = makeRng(mode.map.foot.seed * 5 + 9);
    this.cars = [];
    this.cops = [];
    this.time = 0;
    for (let i = 0; i < count; i++) this.cars.push(this._make(false));
    this.placed = false;
  }

  _make(police) {
    const r = this.rng();
    const kind = police ? 'police' : r < 0.1 ? 'taxi' : r < 0.2 ? 'van' : 'civilian';
    const mesh = makeCarMesh({ kind, color: CIVILIAN_COLORS[Math.floor(this.rng() * CIVILIAN_COLORS.length)] });
    this.city.group.add(mesh);
    const car = new Car(police ? { ...CAR_SPECS.police, maxSpeed: 26 } : { ...CAR_SPECS.civilian, maxSpeed: 15 }, mesh);
    car.active = true;
    return { car, mesh, police, from: null, to: null, state: 'drive', parkIn: 15 + this.rng() * 35, wait: 0, horn: 0 };
  }

  /** Put a car on a street somewhere near (out of sight), heading along it. */
  _spawn(t, p, near = 70, far = 140) {
    const cam = this.mode.state.camera;
    cam.updateMatrixWorld();
    _m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_m);
    let cands = this.grid.nodes.filter((o) => { const d = Math.hypot(o.x - p.pos.x, o.z - p.pos.z); return d > near && d < far; });
    const hidden = cands.filter((o) => !_frustum.containsPoint(_v.set(o.x, 1, o.z)));
    if (hidden.length) cands = hidden;
    cands = cands.filter((o) => ![...this.cars, ...this.cops].some((c) => c !== t && Math.hypot(c.car.pos.x - o.x, c.car.pos.z - o.z) < 12));
    if (!cands.length) cands = this.grid.nodes;
    const a = cands[Math.floor(this.rng() * cands.length)], b = a.nb[Math.floor(this.rng() * a.nb.length)];
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz), fx = dx / len, fz = dz / len;
    const h = Math.atan2(fx, fz);
    t.car.place(a.x + fx * 8 - fz * LANE, a.z + fz * 8 + fx * LANE, h);
    t.from = a; t.to = b; t.state = 'drive'; t.wait = 0;
    t.car.syncMesh();
  }

  /** All the moving cars (for collisions). */
  get all() { return [...this.cars, ...this.cops]; }

  /** A stopped car you could steal (not a police car), or null. */
  stealable(p) {
    if (p.pos.y > 1.5) return null;
    return this.cars.find((t) => t.car.speed < 1.2 && Math.hypot(t.car.pos.x - p.pos.x, t.car.pos.z - p.pos.z) < 3.4) || null;
  }

  /** Take a car out of the traffic (you stole it). */
  take(t) {
    this.cars = this.cars.filter((c) => c !== t);
    return t;
  }

  /** Give a car back to the traffic (you got out: it sits there, parked). */
  give(car, mesh) {
    car.spec = { ...CAR_SPECS.civilian, maxSpeed: 15 };
    const t = { car, mesh, police: false, from: null, to: null, state: 'abandoned', parkIn: 9999, wait: 0, horn: 0 };
    this.cars.push(t);
  }

  update(dt, { wanted = 0, target = null, driving = null } = {}) {
    const s = this.mode.state, p = s.player;
    this.time += dt;
    if (!this.placed) { this.placed = true; for (const t of this.cars) this._spawn(t, p, 25, 150); }
    // Police cars: as many as your wanted level calls for
    const wantCops = wanted >= 3 ? 2 : wanted >= 1 ? 1 : 0;
    while (this.cops.length < wantCops) { const c = this._make(true); this.cops.push(c); this._spawn(c, p, 80, 150); }
    for (const c of this.cops) c.leaving = this.cops.indexOf(c) >= wantCops;
    const focus = driving ? driving.pos : p.pos;
    // Drive
    for (const t of this.all) {
      const car = t.car;
      const d = Math.hypot(car.pos.x - focus.x, car.pos.z - focus.z);
      if (d > 170 && t.state !== 'abandoned') {
        if (t.police && t.leaving) { this._remove(t); continue; }
        this._spawn(t, { pos: focus });
        continue;
      }
      if (t.state === 'abandoned') { car.controls.throttle = 0; car.controls.handbrake = true; car.controls.steer = 0; continue; }
      if (t.police) this._cop(t, dt, target, driving, focus); else this._civilian(t, dt, driving);
    }
    // Physics
    const cars = this.all.map((t) => t.car);
    if (driving) cars.push(driving);
    for (const t of this.all) { t.car.step(dt, ground); collideCarWithWorld(t.car, this.city.world); }
    collideCars(cars, (a, b, impact) => {
      if ((a === driving || b === driving) && impact > 6) { audio.sfx(impact > 12 ? 'crash1' : 'crash0', { vol: Math.min(1, impact / 18) }); this.onBump?.(a === driving ? b : a, impact); }
    });
    for (const t of this.all) {
      t.car.syncMesh();
      if (t.police) updateSirens(t.mesh, this.time + t.car.pos.x * 0.01, true);
    }
  }

  _remove(t) {
    this.city.group.remove(t.mesh);
    this.cops = this.cops.filter((c) => c !== t);
    this.cars = this.cars.filter((c) => c !== t);
  }

  /** Is something in front of this car (another car, you, your car)? */
  _blocked(t, driving) {
    const car = t.car, fx = car.fwdX, fz = car.fwdZ, p = this.mode.state.player;
    const ahead = (x, z, reach) => {
      const dx = x - car.pos.x, dz = z - car.pos.z, along = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
      return along > 0 && along < reach && side < 1.9;
    };
    for (const o of this.all) if (o !== t && ahead(o.car.pos.x, o.car.pos.z, 9)) return 'car';
    if (driving && ahead(driving.pos.x, driving.pos.z, 10)) return 'you';
    if (!driving && p.pos.y < 1.6 && ahead(p.pos.x, p.pos.z, 8)) return 'you';
    return null;
  }

  _civilian(t, dt, driving) {
    const car = t.car, c = car.controls;
    // Pulling over to park for a while, then off again
    t.parkIn -= dt;
    if (t.state === 'drive' && t.parkIn <= 0) {
      const toEnd = Math.hypot(t.to.x - car.pos.x, t.to.z - car.pos.z);
      if (toEnd > 30) {
        const dx = t.to.x - t.from.x, dz = t.to.z - t.from.z, len = Math.hypot(dx, dz), fx = dx / len, fz = dz / len;
        // (a spot at the kerb a little ahead: rx/rz is the right-hand side)
        const rx = -fz, rz = fx, base = (car.pos.x - t.from.x) * fx + (car.pos.z - t.from.z) * fz + 14;
        t.spot = { x: t.from.x + fx * base + rx * KERB, z: t.from.z + fz * base + rz * KERB, fx, fz };
        t.state = 'park';
        t.parkT = 0;
      } else t.parkIn = 5;
    }
    if (t.state === 'park') {
      driveToward(car, t.spot.x + t.spot.fx * 6, t.spot.z + t.spot.fz * 6, 5);
      const left = (t.spot.x - car.pos.x) * t.spot.fx + (t.spot.z - car.pos.z) * t.spot.fz;
      if (left < 0.5 || (t.parkT += dt) > 7) { t.state = 'parked'; t.wait = 15 + this.rng() * 20; }
      return;
    }
    if (t.state === 'parked') {
      c.throttle = car.forwardSpeed > 0.3 ? -1 : 0; c.steer = 0; c.handbrake = true;
      if ((t.wait -= dt) <= 0) { t.state = 'drive'; t.parkIn = 25 + this.rng() * 40; }
      return;
    }
    this._follow(t, CRUISE);
    const block = this._blocked(t, driving);
    if (block) {
      c.throttle = car.forwardSpeed > 0.4 ? -1 : 0; c.handbrake = false;
      if (block === 'you' && (t.horn -= dt) <= 0) { t.horn = 2.5; audio.sfx('horn', { vol: 0.35 }); }
    }
  }

  /** Follow the lane along t.from -> t.to, turning at the end of the block. */
  _follow(t, speed) {
    const car = t.car;
    const dx = t.to.x - t.from.x, dz = t.to.z - t.from.z, len = Math.hypot(dx, dz), fx = dx / len, fz = dz / len;
    const rx = -fz, rz = fx; // (right-hand side of the direction of travel)
    const along = (car.pos.x - t.from.x) * fx + (car.pos.z - t.from.z) * fz;
    if (along > len - 5) {
      // At the crossing: on to the next street (not straight back)
      const opts = t.to.nb.filter((o) => o !== t.from);
      const next = opts.length ? opts[Math.floor(this.rng() * opts.length)] : t.from;
      t.from = t.to; t.to = next;
      return this._follow(t, speed);
    }
    const look = Math.min(len, along + 9);
    const tx = t.from.x + fx * look + rx * LANE, tz = t.from.z + fz * look + rz * LANE;
    const turning = Math.abs(wrapAngle(Math.atan2(tx - car.pos.x, tz - car.pos.z) - car.heading)) > 0.4;
    driveToward(car, tx, tz, turning ? 6 : speed);
  }

  /** A police car: head for you (or where you were last seen); sirens on. */
  _cop(t, dt, target, driving, focus) {
    const car = t.car;
    if (t.leaving || !target) { this._follow(t, CRUISE); return; }
    const d = Math.hypot(target.x - car.pos.x, target.z - car.pos.z);
    // Close, and on the same street: straight at you
    const sameStreet = Math.abs(target.x - car.pos.x) < 4 || Math.abs(target.z - car.pos.z) < 4;
    if (d < 45 && (sameStreet || d < 14)) {
      const lead = driving ? Math.min(1, d / 30) : 0;
      const want = driving ? (d < 10 ? Math.max(driving.speed + d * 0.5, 3) : COP_SPEED) : (d < 9 ? 0 : 10);
      driveToward(car, target.x + (driving ? driving.vel.x * lead : 0), target.z + (driving ? driving.vel.z * lead : 0), want, { allowDrift: true });
      if (want === 0) { car.controls.throttle = car.forwardSpeed > 0.3 ? -1 : 0; car.controls.handbrake = true; }
      return;
    }
    // Otherwise, round the blocks toward you (at each crossing, the street that gets closest)
    const dx = t.to.x - t.from.x, dz = t.to.z - t.from.z, len = Math.hypot(dx, dz);
    const along = (car.pos.x - t.from.x) * (dx / len) + (car.pos.z - t.from.z) * (dz / len);
    if (along > len - 6) {
      let best = null, bd = Infinity;
      for (const o of t.to.nb) { if (o === t.from && t.to.nb.length > 1) continue; const dd = Math.hypot(o.x - target.x, o.z - target.z); if (dd < bd) { bd = dd; best = o; } }
      t.from = t.to; t.to = best;
    }
    this._follow(t, COP_SPEED);
    void focus; void dt;
  }

  dispose() {
    for (const t of this.all) this.city.group.remove(t.mesh);
    this.cars = []; this.cops = [];
  }
}

/**
 * Keep someone on foot out of the cars (pushed aside), and knocked over by
 * one that's going fast. Returns the car that hit them hard, if any.
 */
export function pushFromCars(p, cars) {
  if (p.pos.y > 1.6) return null;
  let hit = null;
  for (const car of cars) {
    const fx = car.fwdX, fz = car.fwdZ;
    const dx = p.pos.x - car.pos.x, dz = p.pos.z - car.pos.z;
    const along = dx * fx + dz * fz, side = dx * fz - dz * fx; // (side: + = left of the car)
    const hl = 2.4 + 0.35, hw = 1.05 + 0.35;
    if (Math.abs(along) > hl || Math.abs(side) > hw) continue;
    // Out the nearest way
    const pa = hl - Math.abs(along), ps = hw - Math.abs(side);
    if (ps < pa) { const k = Math.sign(side) * ps; p.pos.x += fz * k; p.pos.z += -fx * k; }
    else { const k = Math.sign(along) * pa; p.pos.x += fx * k; p.pos.z += fz * k; }
    if (car.speed > 6) hit = car;
  }
  return hit;
}

/**
 * Drive a car right here on foot's streets (a car you stole): your controls
 * drive it, you ride inside it, and the camera swings round behind it.
 */
export class FootDrive {
  constructor(mode, car, mesh) {
    this.mode = mode;
    this.car = car;
    this.mesh = mesh;
    car.spec = STOLEN;
    car.active = true;
    car.isPlayer = true;
    mesh.traverse((o) => { if (o.material && o.visible === false) o.visible = true; }); // (lights on)
    const s = mode.state;
    s.model.root.visible = false;
    this.camDist = s.cam.distance;
    s.cam.distance = Math.max(s.cam.distance, 7.5);
    this.stopped = 0;
  }

  update(dt) {
    const s = this.mode.state, input = s.game.input, car = this.car, c = car.controls, city = this.mode.city;
    c.throttle = input.axis('back', 'forward');
    c.steer = input.axis('left', 'right');
    c.handbrake = input.isDown('sprint') || input.isDown('drift');
    c.nitro = false;
    car.step(dt, ground);
    collideCarWithWorld(car, city.world);
    // (keep inside the city)
    const lim = (city.bounds || 300) - 2;
    if (Math.abs(car.pos.x) > lim || Math.abs(car.pos.z) > lim) {
      car.pos.x = clamp(car.pos.x, -lim, lim); car.pos.z = clamp(car.pos.z, -lim, lim);
      car.vel.multiplyScalar(-0.3);
    }
    car.syncMesh();
    // You ride along: the player sits in the car (hidden), the camera behind it
    const p = s.player;
    p.teleport(car.pos.x, 0.05, car.pos.z, car.heading);
    const want = car.heading + Math.PI;
    s.cam.yaw += wrapAngle(want - s.cam.yaw) * Math.min(1, dt * (car.speed > 3 ? 3 : 0.8));
    this.stopped = car.speed < 2.5 ? this.stopped + dt : 0;
  }

  /** Get out: on the street beside the car (the car stays there, parked). */
  exit() {
    const s = this.mode.state, car = this.car;
    const side = -1; // (the left-hand door)
    const rx = -car.fwdZ, rz = car.fwdX;
    const x = car.pos.x - rx * 2.3 * side, z = car.pos.z - rz * 2.3 * side;
    s.model.root.visible = true;
    s.cam.distance = this.camDist;
    car.controls.throttle = 0; car.controls.steer = 0; car.controls.handbrake = true;
    car.isPlayer = false;
    s.placePlayer(new THREE.Vector3(x, 0.05, z), car.heading + Math.PI);
  }
}

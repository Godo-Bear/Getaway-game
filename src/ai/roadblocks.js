import * as THREE from 'three';
import { makeCarMesh, updateSirens } from '../vehicles/carModel.js';

// Roadblocks and spike strips (high heat only).
//
// Both are placed on the road AHEAD of the player, one intersection further
// on, so you get a moment to react: turn off at the junction, or thread the
// gap. They're removed once they're far behind you.
//
//  ROADBLOCK: two police cars parked across the road plus concrete barriers,
//    with one lane-wide gap to squeeze through. Solid (added to the
//    collision world, and removed again when the roadblock goes).
//  SPIKE STRIP: a strip across half the road. Drive over it and your tyres
//    burst: less grip and a lower top speed for a while.

const LIFETIME_BEHIND = 160;   // remove once this far away
const GAP = 4.6;               // width of the gap in a roadblock

const _v = new THREE.Vector3();

export class Roadblocks {
  constructor(scene, city, rng) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.items = [];
    this.cooldown = 8;
    this.time = 0;
    this.barrierMat = new THREE.MeshLambertMaterial({ color: 0xd8d4c8 });
    this.stripeMat = new THREE.MeshBasicMaterial({ color: 0xff3a2a, toneMapped: false });
    this.spikeMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2e });
    this.spikeTipMat = new THREE.MeshBasicMaterial({ color: 0xc8ccd4, toneMapped: false });
  }

  clear() {
    for (const it of this.items) this._remove(it);
    this.items = [];
    this.cooldown = 8;
  }

  _remove(it) {
    this.scene.remove(it.group);
    for (const b of it.boxes) b.disabled = true; // CollisionWorld skips disabled boxes
  }

  /**
   * @param {number} dt
   * @param {import('../vehicles/car.js').Car} player
   * @param {{roadblockEvery:number, spikes:boolean}|null} rules - null = none at this heat
   * @returns {'spiked'|null}
   */
  update(dt, player, rules) {
    this.time += dt;
    let result = null;

    // Remove old ones far away
    this.items = this.items.filter((it) => {
      const far = Math.hypot(it.pos.x - player.pos.x, it.pos.z - player.pos.z) > LIFETIME_BEHIND;
      if (far) this._remove(it);
      return !far;
    });

    // Spawn new ones ahead of the player
    if (rules) {
      this.cooldown -= dt;
      if (this.cooldown <= 0 && this.items.length < 3 && player.speed > 8) {
        const spikes = rules.spikes && this.rng() < 0.45;
        if (this._spawnAhead(player, spikes ? 'spikes' : 'block')) {
          this.cooldown = rules.roadblockEvery;
        } else {
          this.cooldown = 1; // try again soon
        }
      }
    }

    // Spike strips: check the player's tyres
    for (const it of this.items) {
      if (it.type !== 'spikes' || it.used) continue;
      const r = it.rect;
      const x = player.pos.x, z = player.pos.z;
      if (x > r.x0 - 1 && x < r.x1 + 1 && z > r.z0 - 1 && z < r.z1 + 1 && !player.airborne) {
        it.used = true;
        result = 'spiked';
      }
    }

    // Flash the roadblock cars' lights
    for (const it of this.items) for (const m of it.cars) updateSirens(m, this.time + m.position.x * 0.1);
    return result;
  }

  /** Find the road segment beyond the next intersection ahead of the player. */
  _spawnAhead(player, type) {
    const graph = this.city.graph;
    const half = this.city.roadWidth / 2;
    const road = graph.roadAt(player.pos.x, player.pos.z, half);
    if (!road || road.axis === 'both') return false;
    // Direction of travel along the road (+1 or -1)
    const v = road.axis === 'x' ? player.vel.x : player.vel.z;
    if (Math.abs(v) < 5) return false;
    const dir = Math.sign(v);
    const along = road.axis === 'x' ? player.pos.x : player.pos.z;
    // Next intersection ahead (at least 40 m away), then the middle of the block after it.
    // (the crossing roads along this road: x = roadX(k) for a road running along X)
    const R = road.axis === 'x' ? graph.roadX : graph.roadZ;
    let idx = 0;
    while (idx < graph.n && R(idx) <= along) idx++;  // (the first crossing road past us, going +)
    if (dir < 0) idx -= 1;                              // (going -: the last one behind that point)
    if ((R(idx) - along) * dir < 40) idx += dir;
    if (idx < 0 || idx >= graph.n || idx + dir < 0 || idx + dir >= graph.n) return false;
    const at = (R(idx) + R(idx + dir)) / 2;
    const line = road.axis === 'x' ? road.lineZ : road.lineX;
    // Don't stack two things on the same spot
    const px = road.axis === 'x' ? at : line, pz = road.axis === 'x' ? line : at;
    if (this.items.some((it) => Math.hypot(it.pos.x - px, it.pos.z - pz) < 20)) return false;

    if (type === 'spikes') this._makeSpikes(road.axis, at, line, half);
    else this._makeRoadblock(road.axis, at, line, half);
    return true;
  }

  /**
   * Build a roadblock across a road.
   * axis: which way the ROAD runs; at: position along it; line: its centre line.
   */
  _makeRoadblock(axis, at, line, half) {
    const g = new THREE.Group();
    const boxes = [];
    const cars = [];
    // Pick which lane is left open
    const gapCentre = (this.rng() < 0.5 ? -1 : 1) * (this.rng() < 0.5 ? 2.3 : 6.2);
    // Occupied spans across the road (offsets from the centre line)
    const spans = [[-half, gapCentre - GAP / 2], [gapCentre + GAP / 2, half]].filter(([a, b]) => b - a > 0.5);
    const world = this.city.world;
    // helper: an axis-aligned piece, `u` = across the road, `w` = along it
    const place = (u0, u1, w0, w1, h) => {
      const [x0, x1, z0, z1] = axis === 'x' ? [at + w0, at + w1, line + u0, line + u1] : [line + u0, line + u1, at + w0, at + w1];
      boxes.push(world.addBox(x0, 0, z0, x1, h, z1, { tag: 'roadblock' }));
      return { x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 };
    };
    let first = true;
    for (const [a, b] of spans) {
      let u = a;
      // A police car first (4.4 m across the road), then barriers fill the rest
      if (b - a > 4.6 && (first || this.rng() < 0.7)) {
        const c = place(u, u + 4.4, -1.05, 1.05, 1.6);
        const mesh = makeCarMesh({ kind: 'police' });
        mesh.position.set(c.x, 0, c.z);
        mesh.rotation.y = axis === 'x' ? 0 : Math.PI / 2; // car lies across the road
        g.add(mesh);
        cars.push(mesh);
        u += 4.4;
        first = false;
      }
      while (u < b - 0.2) {
        const len = Math.min(2.2, b - u);
        const c = place(u, u + len, -0.35, 0.35, 1.0);
        const bar = new THREE.Mesh(new THREE.BoxGeometry(c.w, 1.0, c.d), this.barrierMat);
        bar.position.set(c.x, 0.5, c.z);
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(c.w + 0.02, 0.2, c.d + 0.02), this.stripeMat);
        stripe.position.set(c.x, 0.75, c.z);
        g.add(bar, stripe);
        u += len;
      }
    }
    this.scene.add(g);
    const pos = axis === 'x' ? new THREE.Vector3(at, 0, line) : new THREE.Vector3(line, 0, at);
    this.items.push({ type: 'block', group: g, boxes, cars, pos });
  }

  _makeSpikes(axis, at, line, half) {
    const g = new THREE.Group();
    const side = this.rng() < 0.5 ? -1 : 1;
    // Covers half the road (both lanes going one way), 1.2 m deep.
    const u0 = side < 0 ? -half : 0, u1 = side < 0 ? 0 : half;
    const [x0, x1, z0, z1] = axis === 'x' ? [at - 0.6, at + 0.6, line + u0, line + u1] : [line + u0, line + u1, at - 0.6, at + 0.6];
    const base = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.06, z1 - z0), this.spikeMat);
    base.position.set((x0 + x1) / 2, 0.04, (z0 + z1) / 2);
    g.add(base);
    // Spikes as a row of tiny pyramids (one instanced mesh)
    const n = 40;
    const spikes = new THREE.InstancedMesh(new THREE.ConeGeometry(0.08, 0.22, 4), this.spikeTipMat, n);
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const x = axis === 'x' ? (x0 + x1) / 2 + (i % 2 ? 0.25 : -0.25) : x0 + (x1 - x0) * t;
      const z = axis === 'x' ? z0 + (z1 - z0) * t : (z0 + z1) / 2 + (i % 2 ? 0.25 : -0.25);
      spikes.setMatrixAt(i, m.makeTranslation(x, 0.17, z));
    }
    g.add(spikes);
    // Warning cone at the kerb end so it's visible from a distance
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.8, 8), this.stripeMat);
    cone.position.set(axis === 'x' ? at : line + (side < 0 ? -half + 0.4 : half - 0.4), 0.4,
      axis === 'x' ? line + (side < 0 ? -half + 0.4 : half - 0.4) : at);
    g.add(cone);
    this.scene.add(g);
    this.items.push({
      type: 'spikes', group: g, boxes: [], cars: [], used: false,
      rect: { x0, x1, z0, z1 }, pos: _v.set((x0 + x1) / 2, 0, (z0 + z1) / 2).clone(),
    });
  }
}

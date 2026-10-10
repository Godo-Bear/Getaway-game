import * as THREE from 'three';
import { CollisionWorld } from '../../core/collision.js';
import { makeGlowMaterial } from '../materials.js';
import { MovingPlatform } from '../movingPlatform.js';
import { CLASSIC_TINTS, ZINC, riverMaterial, buildIronTower } from '../lumiere.js';
import { makeRng } from '../../core/utils.js';

// ======================================================================
//  Chapter 21, Part 3: up the Iron Tower (it stands at the origin, 120 m).
//
//   ground  ──▶ a zig-zag stair up the west leg ──▶ DECK 1 (y 27.2, 23 m
//   square, two police on it) ──▶ the lift on its east side ──▶ DECK 2
//   (y 59.2) ──▶ four ladders, each up the edge of a little maintenance
//   platform (they get smaller as the tower narrows), round the four sides
//   ──▶ DECK 3 (y 105.2) ──▶ the rope ladder under Juno's helicopter.
//   Up high the wind gusts: crouch (or hold a ladder) or it blows you off.
// ======================================================================

export const DECKS = [{ y: 27.2, w: 11.5 }, { y: 59.2, w: 5.6 }, { y: 105.2, w: 1.9 }];
/** The maintenance platforms between deck 2 and deck 3 (each a little smaller), and which side its ladder is on. */
export const SLABS = [{ y: 70.2, w: 4.2, side: [1, 0] }, { y: 81.2, w: 3.45, side: [0, 1] }, { y: 92.2, w: 2.7, side: [-1, 0] }];
export const LIFT = { x: 7.5, z: 0, bottom: 27.25, top: 59.25 };
export const ROPE = new THREE.Vector3(0.6, 0, 0.4);   // the bottom of Juno's rope ladder hangs here, over deck 3
/** Police walking the park round the tower (ground), and the two on deck 1. */
export const PARK_ROUTES = [
  [[0, 92], [0, 34]],                    // up and down the long path
  [[-27, 20], [-27, -20]],               // the west side, by the stair
  [[27, -20], [27, 20]],                 // the east side
  [[-10, 24], [10, 24]],                 // across the front, between the legs
  [[-40, 60], [-40, 30], [-20, 30]],     // the west lawn
];
export const DECK1_ROUTES = [[[-9, -9], [9, -9]], [[9, 9], [-9, 9]]];
export const PARK_START = new THREE.Vector3(6, 0.05, 118);

/** A helicopter (body, tail, rotors, skids). */
export function buildHeli(body = 0x1c2230, stripe = 0xd8d8d8) {
  const g = new THREE.Group();
  const m = (c) => new THREE.MeshLambertMaterial({ color: c });
  const add = (geo, mat, x, y, z) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); g.add(o); return o; };
  add(new THREE.BoxGeometry(2.4, 1.8, 4.4), m(body), 0, 0, 0);
  add(new THREE.BoxGeometry(2.45, 0.3, 4.45), m(stripe), 0, -0.2, 0);
  add(new THREE.BoxGeometry(2.0, 1.0, 1.2), m(0x0a1020), 0, 0.2, -2.3);
  add(new THREE.BoxGeometry(0.4, 0.4, 4.6), m(body), 0, 0.35, 4.3);
  add(new THREE.BoxGeometry(0.15, 1.3, 0.8), m(body), 0, 0.9, 6.4);
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.12, 0.12, 4.2), m(0x2a2b31), s * 1.1, -1.35, 0);
  const rotor = new THREE.Group();
  rotor.add(new THREE.Mesh(new THREE.BoxGeometry(11, 0.08, 0.35), m(0x0d0f14)), new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.08, 11), m(0x0d0f14)));
  rotor.position.y = 1.05;
  g.add(rotor);
  g.userData.rotor = rotor;
  return g;
}

export function buildChapter21Tower() {
  const group = new THREE.Group();
  const world = new CollisionWorld(8);
  const rng = makeRng(2131);
  const ladders = [];
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });
  const steel = mat(0x6a5a3a, { metalness: 0.5, roughness: 0.5 }), deckMat = mat(0x5a4a32), rail = mat(0x3a3020, { metalness: 0.6 });
  const solid = (x0, y0, z0, x1, y1, z1, material, tag = 'roof') => {
    if (material) {
      const o = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), material);
      o.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      group.add(o);
    }
    return world.addBox(x0, y0, z0, x1, y1, z1, { tag });
  };
  const ladder = (x, z, nx, nz, y0, y1) => {
    const g = new THREE.Group();
    for (const s of [-0.28, 0.28]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.06, y1 - y0, 0.06), rail); r.position.set(nz ? s : 0, (y1 - y0) / 2, nx ? s : 0); g.add(r); }
    for (let y = 0.3; y < y1 - y0; y += 0.4) { const rung = new THREE.Mesh(new THREE.BoxGeometry(nz ? 0.56 : 0.05, 0.05, nx ? 0.56 : 0.05), rail); rung.position.y = y; g.add(rung); }
    g.position.set(x + nx * 0.08, y0, z + nz * 0.08);
    group.add(g);
    ladders.push({ x, z, nx, nz, y0, y1, back: true }); // (back: free-standing, so walking into it from behind grabs it too)
  };

  // ---------------------------------------------------------------- the park round the tower, the river, the city
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), mat(0x5a7a42, { roughness: 1 }));
  grass.rotation.x = -Math.PI / 2;
  group.add(grass);
  world.addBox(-300, -1, -300, 300, 0, 300, { tag: 'roof' });
  const path = new THREE.Mesh(new THREE.PlaneGeometry(26, 300), mat(0xc8b890));
  path.rotation.x = -Math.PI / 2;
  path.position.set(0, 0.02, 150);
  group.add(path);
  const river = new THREE.Mesh(new THREE.PlaneGeometry(600, 34), riverMaterial());
  river.rotation.x = -Math.PI / 2;
  river.position.set(0, 0.03, -70);
  group.add(river);
  // the city all round (blocks of cream stone and zinc roofs)
  const nB = 220, blds = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat(0xffffff, { roughness: 0.9 }), nB);
  const roofs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.62, 0.72, 1, 4), mat(ZINC, { metalness: 0.4 }), nB);
  const o = new THREE.Object3D(), col = new THREE.Color();
  let n = 0;
  for (let k = 0; k < 600 && n < nB; k++) {
    const x = (rng() - 0.5) * 560, z = (rng() - 0.5) * 560;
    if (Math.abs(x) < 70 && z > -100 && z < 280) continue;  // (the park)
    if (Math.abs(z + 70) < 30) continue;                     // (the river)
    const h = 18 + rng() * 8, w = 16 + rng() * 10, d = 16 + rng() * 10;
    o.position.set(x, h / 2, z); o.rotation.set(0, 0, 0); o.scale.set(w, h, d); o.updateMatrix();
    blds.setMatrixAt(n, o.matrix);
    blds.setColorAt(n, col.setHex(CLASSIC_TINTS[Math.floor(rng() * CLASSIC_TINTS.length)]));
    o.position.y = h + 2; o.rotation.set(0, Math.PI / 4, 0); o.scale.set(w * 0.95, 4, d * 0.95); o.updateMatrix();
    roofs.setMatrixAt(n++, o.matrix);
  }
  blds.count = roofs.count = n;
  group.add(blds, roofs);
  // the park: hedges along the lawns (crouch behind them), plane trees, benches, a carousel
  const hedgeM = mat(0x3a6a2e, { roughness: 1 });
  const hedge = (x0, z0, x1, z1) => solid(x0, 0, z0, x1, 1.3, z1, hedgeM, 'wall');
  for (const sx of [-1, 1]) {
    for (let z = 34; z < 104; z += 14) hedge(sx * 15 - 0.6, z, sx * 15 + 0.6, z + 10);    // along the path
    for (let z = 40; z < 100; z += 20) hedge(sx * 34, z, sx * 34 + sx * 9, z + 1.2);      // across the lawns
    hedge(sx * 22 - 4, 28, sx * 22 + 4, 29.2);
  }
  for (const [x, z] of [[-46, 44], [-48, 74], [46, 50], [44, 82], [-22, 108], [24, 104], [-56, 18], [58, 14], [-38, -34], [40, -36]]) {
    solid(x - 0.35, 0, z - 0.35, x + 0.35, 4, z + 0.35, mat(0x5a4632), 'tree');
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(3.6, 1), mat(0x4a7a3a, { flatShading: true }));
    crown.position.set(x, 6.5, z);
    group.add(crown);
  }
  for (const [x, z, r] of [[-9, 60, 0], [9, 70, 0], [-9, 86, 0], [9, 46, 0]]) {
    solid(x - 1, 0, z - 0.35, x + 1, 0.55, z + 0.35, mat(0x2f5a3a), 'wall');
  }
  const carousel = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 4, 16), mat(0xe8d0a0));
  carousel.position.set(-30, 2, 86);
  const capM = new THREE.Mesh(new THREE.ConeGeometry(5.6, 2.4, 16), mat(0xc0283a));
  capM.position.set(-30, 5.2, 86);
  group.add(carousel, capM);
  world.addBox(-34, 0, 82, -26, 4, 90, { tag: 'wall' });
  // police cars round the base, lights flashing
  const cars = [];
  for (const [x, z, r] of [[-30, 26, 0.4], [-22, 34, -0.3], [28, 30, 0.2], [34, -24, 1.4], [-34, -20, -1.2]]) {
    const car = new THREE.Group();
    const bodyM = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.1, 4.4), mat(0x1c2a48));
    bodyM.position.y = 0.75;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 2.2), mat(0xe8e8e8));
    roof.position.y = 1.55;
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.3), new THREE.MeshBasicMaterial({ color: 0xff2030, toneMapped: false }));
    red.position.set(-0.35, 1.95, 0);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.3), new THREE.MeshBasicMaterial({ color: 0x2060ff, toneMapped: false }));
    blue.position.set(0.35, 1.95, 0);
    car.add(bodyM, roof, red, blue);
    car.position.set(x, 0, z);
    car.rotation.y = r;
    group.add(car);
    cars.push({ red, blue });
  }

  // ---------------------------------------------------------------- the tower itself (the lattice is for show; decks, stairs, lift and ladders are what you stand on)
  const tower = buildIronTower(0, 0);
  group.add(tower.group);
  for (const [lx0, lz0, lx1, lz1] of tower.legs) world.addBox(lx0, 0, lz0, lx1, 6, lz1, { tag: 'wall' });
  for (const d of DECKS) {
    world.addBox(-d.w, d.y - 1.4, -d.w, d.w, d.y, d.w, { tag: 'roof' });
    // railings round the edge (low: you can see over them, but they don't stop you)
    for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(sz ? 2 * d.w : 0.06, 0.06, sx ? 2 * d.w : 0.06), rail);
      r.position.set(sx * d.w, d.y + 1, sz * d.w);
      group.add(r);
    }
  }

  // --- the stair up the west leg: eight flights of eight steps, zig-zagging
  const RISE = 27.2 / 64, RUN = 0.6;
  const XE = -12.9, XW = XE - 1.6 - 8 * RUN - 1.6;  // east and west ends (landings 1.6 m)
  const LANES = [[-1.7, -0.1], [0.1, 1.7]]; // (between the legs, on the west side)
  let y = 0;
  for (let f = 0; f < 8; f++) {
    const [z0, z1] = LANES[f % 2], west = f % 2 === 0; // (flight 1 goes west, flight 2 back east...)
    for (let k = 0; k < 8; k++) {
      const top = y + (k + 1) * RISE;
      const xa = west ? XE - 1.6 - (k + 1) * RUN : XW + 1.6 + k * RUN;
      solid(xa, top - 0.2, z0, xa + RUN, top, z1, steel);
    }
    y += 8 * RISE;
    // the landing at the end of the flight (both lanes, so you can turn round)
    const lx0 = west ? XW : XE - 1.6, lx1 = west ? XW + 1.6 : XE;
    solid(lx0, y - 0.25, LANES[0][0], lx1, y, LANES[1][1], steel);
  }
  // (the last flight ends at the east landing: a walkway onto deck 1)
  solid(XE, 27.2 - 0.25, LANES[0][0], -DECKS[0].w + 0.1, 27.2, LANES[1][1], steel);
  // railings: both sides of every flight and round the landings, so you can't fall off. You see a
  // handrail and balusters; what stops you is a taller wall you can't see (too high to climb or vault over)
  const RAIL = 1.0, STOP = 2.9;
  const stop = (x0, y0, z0, x1, z1) => world.addBox(x0, y0, z0, x1, y0 + STOP, z1, { tag: 'wall' });
  const balusters = [];
  const bar = (ax, ay, az, bx, by, bz) => { // a handrail from a to b
    const len = Math.hypot(bx - ax, by - ay, bz - az);
    const o = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, len), rail);
    o.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    o.lookAt(bx, by, bz);
    group.add(o);
  };
  y = 0;
  for (let f = 0; f < 8; f++) {
    const [z0, z1] = LANES[f % 2], west = f % 2 === 0;
    for (const ez of [z0 - 0.03, z1 + 0.03]) {
      for (let k = 0; k < 8; k++) {
        const top = y + (k + 1) * RISE;
        const xa = west ? XE - 1.6 - (k + 1) * RUN : XW + 1.6 + k * RUN;
        stop(xa, top, ez - 0.05, xa + RUN, ez + 0.05);
        balusters.push([xa + RUN / 2, top, ez]);
      }
      const xs = west ? XE - 1.6 : XW + 1.6, xe = west ? XW + 1.6 : XE - 1.6;
      bar(xs, y + RISE + RAIL, ez, xe, y + 8 * RISE + RAIL, ez);
    }
    y += 8 * RISE;
    // round the landing: its two long sides, and the far end (not the top one: that's the way onto deck 1)
    const lx0 = west ? XW : XE - 1.6, lx1 = west ? XW + 1.6 : XE;
    for (const ez of [LANES[0][0] - 0.03, LANES[1][1] + 0.03]) {
      stop(lx0, y, ez - 0.05, lx1, ez + 0.05);
      bar(lx0, y + RAIL, ez, lx1, y + RAIL, ez);
      balusters.push([lx0 + 0.4, y, ez], [lx1 - 0.4, y, ez]);
    }
    if (f < 7) {
      const ex = west ? XW - 0.03 : XE + 0.03;
      stop(ex - 0.05, y, LANES[0][0], ex + 0.05, LANES[1][1]);
      bar(ex, y + RAIL, LANES[0][0], ex, y + RAIL, LANES[1][1]);
      for (const bz of [-1.2, -0.4, 0.4, 1.2]) balusters.push([ex, y, bz]);
    }
  }
  // the walkway from the top of the stair onto deck 1
  for (const ez of [LANES[0][0] - 0.03, LANES[1][1] + 0.03]) {
    stop(XE, 27.2, ez - 0.05, -DECKS[0].w, ez + 0.05);
    bar(XE, 27.2 + RAIL, ez, -DECKS[0].w, 27.2 + RAIL, ez);
  }
  const bal = new THREE.InstancedMesh(new THREE.BoxGeometry(0.04, RAIL, 0.04), rail, balusters.length);
  const bo = new THREE.Object3D();
  balusters.forEach(([bx, by, bz], i) => { bo.position.set(bx, by + RAIL / 2, bz); bo.updateMatrix(); bal.setMatrixAt(i, bo.matrix); });
  group.add(bal);
  // thin columns holding the stair up, outside the corners
  for (const [x, z] of [[XW - 0.2, -1.95], [XW - 0.2, 1.95], [XE + 0.2, -1.95], [XE + 0.2, 1.95]]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 27.2, 0.14), steel);
    post.position.set(x, 13.6, z);
    group.add(post);
  }

  // --- the lift, on the east side of deck 1, up to deck 2
  const liftG = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.3, 2.6), deckMat);
  floor.position.y = -0.15;
  liftG.add(floor);
  for (const [px, pz] of [[-1.25, -1.25], [1.25, -1.25], [1.25, 1.25], [-1.25, 1.25]]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.3, 0.08), rail);
    post.position.set(px, 1.15, pz);
    liftG.add(post);
  }
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 2.6), rail);
  top.position.y = 2.3;
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd060, toneMapped: false }));
  lamp.position.y = 2.2;
  liftG.add(top, lamp);
  group.add(liftG);
  const lift = new MovingPlatform(world, liftG, [[-1.3, -0.3, -1.3, 1.3, 0, 1.3]], new THREE.Vector3(LIFT.x, LIFT.bottom, LIFT.z));
  // its track (a girder up beside it)
  const track = new THREE.Mesh(new THREE.BoxGeometry(0.4, LIFT.top - LIFT.bottom + 3, 0.4), steel);
  track.position.set(LIFT.x + 1.6, (LIFT.top + LIFT.bottom) / 2 + 1, LIFT.z);
  group.add(track);

  // --- the maintenance platforms and ladders, from deck 2 to deck 3
  let prevY = DECKS[1].y;
  const levels = [...SLABS, { y: DECKS[2].y, w: DECKS[2].w, side: [0, -1], deck: true }];
  for (const s of levels) {
    if (!s.deck) {
      solid(-s.w, s.y - 0.3, -s.w, s.w, s.y, s.w, deckMat);
      const ring = new THREE.Mesh(new THREE.BoxGeometry(2 * s.w, 0.05, 2 * s.w), makeGlowMaterial(0xffc030, 0.08));
      ring.position.y = s.y + 0.03;
      group.add(ring);
    }
    // the ladder up the edge of this one, from the one below
    const [sx, sz] = s.side;
    ladder(sx * s.w, sz * s.w, sx, sz, prevY, s.y);
    prevY = s.y;
  }

  // ---------------------------------------------------------------- the helicopters: Juno's (white and pink), waiting over the top, and the police one
  const juno = buildHeli(0xf2eef0, 0xff8ac8);
  juno.position.set(ROPE.x, DECKS[2].y + 9, ROPE.z);
  group.add(juno);
  const rope = new THREE.Group();
  for (const s of [-0.22, 0.22]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 7, 4), mat(0xd8c8a0)); r.position.set(s, 3.5, 0); rope.add(r); }
  for (let ry = 0.3; ry < 7; ry += 0.45) { const rung = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.05, 0.05), mat(0x8a6a3a)); rung.position.y = ry; rope.add(rung); }
  rope.position.set(ROPE.x, DECKS[2].y + 1.1, ROPE.z);
  group.add(rope);
  const police = buildHeli();
  group.add(police);

  return {
    group, world, ladders, lift, liftG, juno, rope, police, cars, tower,
    spawn: new THREE.Vector3(-11.5, 0.05, -0.9), stairStart: new THREE.Vector3(-14, 0, -0.9), checkpoints: [], hideSpots: [], buildings: [],
  };
}

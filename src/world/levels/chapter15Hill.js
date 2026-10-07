import * as THREE from 'three';
import { CollisionWorld } from '../../core/collision.js';
import { makeTextTexture, makeGlowMaterial } from '../materials.js';
import { makeRng } from '../../core/utils.js';

// ======================================================================
//  Chapter 15, Part 2: the funicular up Monte Sereno, at night.
//
//  Seen from the side (uphill = north = -Z; the hill rises 1 m for every
//  2 m along):
//
//        top station (Varga waits here)  ── y = 65, z = -130
//                 ╱╱  two cars on two tracks: yours goes up while the
//               ╱╱    other comes down; they pass halfway (and slow down)
//             ╱╱      the stairs run up beside the tracks (east)
//   bottom station ── the quay ── Juno's seaplane on the water (south)
//
//  The cars are stepped: two compartments, the uphill one 1.5 m higher.
//  Their inner sides (facing each other) are open: that's where you jump.
// ======================================================================

export const G = 0.5;        // the slope (rise per metre along)
export const H = 130;        // how far along the track goes (horizontal m)
export const TRACK_X = 2.2;  // the two tracks: x = -2.2 (your car) and +2.2 (the other)

/** Height of the track line at z (z = 0 at the bottom, -H at the top). */
export const trackY = (z) => clamp01(-z / H) * H * G;
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

/** The car's collision boxes (relative to its reference point on the track line). side = -1 (left car) / +1 (right car). */
export function carBoxes(side) {
  const ox = side; // outer side
  return [
    [-1.4, -1.6, 0, 1.4, 0.9, 3],          // the lower compartment's floor (downhill end, open for boarding)
    [-1.4, 0, -3, 1.4, 2.4, 0],             // the upper compartment's floor
    ox < 0 ? [-1.55, 0.9, 0, -1.4, 1.9, 3] : [1.4, 0.9, 0, 1.55, 1.9, 3],   // outer side rail
    ox < 0 ? [-1.55, 2.4, -3, -1.4, 3.4, 0] : [1.4, 2.4, -3, 1.55, 3.4, 0],
    [-1.5, 2.4, -3.2, 1.5, 4.6, -3],       // the uphill end wall
    [-1.5, 4.6, -3.2, 1.5, 4.8, 3.1],      // the roof
  ];
}

function buildCar(side, color, num) {
  const g = new THREE.Group();
  const mat = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, ...extra });
  const body = mat(color), dark = mat(0x2a2b31), wood = mat(0x8a5a32, { roughness: 0.8 });
  const add = (geo, m, x, y, z) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); g.add(mesh); return mesh; };
  // the stepped underframe and floors
  add(new THREE.BoxGeometry(2.8, 2.5, 3), body, 0, -0.35, 1.5);
  add(new THREE.BoxGeometry(2.8, 2.4, 3), body, 0, 1.2, -1.5);
  add(new THREE.BoxGeometry(2.7, 0.06, 2.9), wood, 0, 0.93, 1.5);
  add(new THREE.BoxGeometry(2.7, 0.06, 2.9), wood, 0, 2.43, -1.5);
  // the roof, posts at the corners, the uphill end wall with windows
  add(new THREE.BoxGeometry(3.1, 0.22, 6.4), body, 0, 4.7, 0);
  for (const x of [-1.42, 1.42]) for (const z of [-3, 0, 2.95]) add(new THREE.BoxGeometry(0.1, z > 0 ? 3.8 : 2.3, 0.1), dark, x, z > 0 ? 2.75 : 3.5, z);
  add(new THREE.BoxGeometry(3, 2.2, 0.15), body, 0, 3.5, -3.1);
  const glass = new THREE.MeshStandardMaterial({ color: 0x2a3a48, emissive: 0xffd890, emissiveIntensity: 0.35, transparent: true, opacity: 0.55, roughness: 0.1 });
  add(new THREE.PlaneGeometry(2.2, 1.0), glass, 0, 3.7, -3.0);
  // the outer side: a rail and glass
  const ox = side * 1.48;
  add(new THREE.BoxGeometry(0.12, 0.12, 3), dark, ox, 1.9, 1.5);
  add(new THREE.BoxGeometry(0.12, 0.12, 3), dark, ox, 3.4, -1.5);
  const sg = add(new THREE.PlaneGeometry(2.9, 1.3), glass, ox, 3.0, 1.5); sg.rotation.y = Math.PI / 2;
  // the open inner side: a yellow-and-black edge so you can see where to jump
  const stripe = new THREE.MeshBasicMaterial({ color: 0xffd040 });
  add(new THREE.BoxGeometry(0.08, 0.06, 2.9), stripe, -side * 1.42, 0.97, 1.5);
  add(new THREE.BoxGeometry(0.08, 0.06, 2.9), stripe, -side * 1.42, 2.47, -1.5);
  // a lamp inside, the number on the side, wheels
  const lamp = add(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff0c8 }), 0, 4.4, 0);
  const lg = add(new THREE.SphereGeometry(0.6, 8, 6), makeGlowMaterial(0xffe0a0, 0.2), 0, 4.35, 0);
  void lamp; void lg;
  const tex = makeTextTexture(String(num), { color: '#1a1b20', width: 128, height: 128, font: 'bold 110px "Bebas Neue", Impact, sans-serif', glow: false });
  const n = add(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: tex, transparent: true }), side * 1.41, 0.2, 1.5);
  n.rotation.y = side * Math.PI / 2;
  for (const z of [-2.4, 2.4]) for (const x of [-0.7, 0.7]) {
    const w = add(new THREE.CylinderGeometry(0.35, 0.35, 0.2, 12), dark, x, z < 0 ? 0.0 : -1.55, z);
    w.rotation.z = Math.PI / 2;
  }
  return g;
}

export function buildChapter15Hill() {
  const group = new THREE.Group();
  const world = new CollisionWorld(8);
  const rng = makeRng(1516);
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
  const M = { stone: mat(0xb8ab94), dark: mat(0x1c1e22), grass: mat(0x2a3a22), concrete: mat(0x8a8478), white: mat(0xe8e4dc), wood: mat(0x6a4a2a), roof: mat(0xb0503a), rail: mat(0x9aa0a8, { metalness: 0.6, roughness: 0.4 }) };
  const block = (x, y, z, w, h, d, material, solid = true, tag = 'wall') => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y + h / 2, z);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    if (solid) world.addBlock(x, y, z, w, h, d, { tag });
    return m;
  };
  const box = (x0, z0, x1, z1, h, material, y = 0, solid = true, tag) => block((x0 + x1) / 2, y, (z0 + z1) / 2, x1 - x0, h, z1 - z0, material, solid, tag);
  const SLOPE = Math.atan(G), LEN = Math.hypot(H, H * G);

  // ------------------------------------------------------------------ the hillside
  const hill = new THREE.Mesh(new THREE.PlaneGeometry(220, LEN + 20), M.grass);
  hill.rotation.x = -Math.PI / 2 + SLOPE;
  hill.position.set(0, H * G / 2 - 1.2, -H / 2);
  group.add(hill);
  // the track bed (a concrete ramp) and the four rails
  const bed = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.6, LEN), M.concrete);
  bed.rotation.x = SLOPE;
  bed.position.set(0, H * G / 2 - 1.75, -H / 2);
  group.add(bed);
  for (const tx of [-TRACK_X, TRACK_X]) for (const dx of [-0.75, 0.75]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, LEN), M.rail);
    r.rotation.x = SLOPE;
    r.position.set(tx + dx, H * G / 2 - 1.42, -H / 2);
    group.add(r);
  }
  // the hauling cable pulleys at the passing loop
  for (const sx of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.2, 12), M.dark);
    p.position.set(sx * 0.2, trackY(-H / 2) - 1.3, -H / 2);
    group.add(p);
  }

  // ------------------------------------------------------------------ the stairs up beside the tracks (east)
  const STEP_RUN = 0.8, STEP_RISE = STEP_RUN * G;
  const steps = Math.ceil(H / STEP_RUN);
  const stepGeo = new THREE.BoxGeometry(2.6, 1, STEP_RUN);
  const stepMesh = new THREE.InstancedMesh(stepGeo, M.stone, steps);
  const o = new THREE.Object3D();
  for (let k = 0; k < steps; k++) {
    const z1 = -k * STEP_RUN, z0 = z1 - STEP_RUN, top = (k + 1) * STEP_RISE;
    world.addBox(6, top - 3, z0, 8.6, top, z1, { tag: 'roof' });
    o.position.set(7.3, top - 0.5, (z0 + z1) / 2);
    o.updateMatrix();
    stepMesh.setMatrixAt(k, o.matrix);
  }
  group.add(stepMesh);
  for (let z = -6; z > -H; z -= 12) {
    const y = trackY(z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.2, 6), M.dark);
    pole.position.set(9, y + 1.6, z);
    const lampM = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe0a0 }));
    lampM.position.set(9, y + 3.3, z);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 6), makeGlowMaterial(0xffc870, 0.2));
    glow.position.copy(lampM.position);
    group.add(pole, lampM, glow);
  }

  // ------------------------------------------------------------------ houses on the hillside, lights in the windows
  const TINTS = [0xf0e0c0, 0xe8c8a0, 0xd88a6a, 0xf0d070, 0xe8e4dc, 0x9ac0d8, 0xe8a8a0];
  const winMat = new THREE.MeshBasicMaterial({ color: 0xffd890 });
  for (let i = 0; i < 46; i++) {
    const side = rng() < 0.5 ? -1 : 1;
    const x = side * (13 + rng() * 60), z = -6 - rng() * (H - 14);
    const w = 6 + rng() * 6, d = 6 + rng() * 5, h = 5 + rng() * 6, base = trackY(z) - 4;
    block(x, base, z, w, h + 4, d, mat(TINTS[Math.floor(rng() * TINTS.length)]), false);
    const r = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.72, 2.6, 4), M.roof);
    r.position.set(x, base + h + 4 + 1.3, z);
    r.rotation.y = Math.PI / 4;
    group.add(r);
    for (let k = 0; k < 3; k++) {
      if (rng() < 0.35) continue;
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.1), winMat);
      win.position.set(x - w / 2 + 1.2 + k * (w - 2.4) / 2, base + 4 + h * 0.55, z + d / 2 + 0.02);
      group.add(win);
    }
  }

  // ------------------------------------------------------------------ the bottom station, the quay, the sea
  box(-60, 0, 70, 40, 1, M.stone, -1, true, 'roof');                  // the quay (top at 0)
  box(-4.5, 3, 4.5, 13, 0.9, M.stone);                               // the platform (level with the cars' floors)
  box(-4.5, 13, 4.5, 14.2, 0.45, M.stone);                           // a step down
  box(-4.6, -2, -4, 13, 5, M.white); box(4, -2, 4.6, 13, 5, M.white); // the station's side walls
  box(-4.8, -3, 4.8, 13.4, 0.3, M.roof, 5.2, false);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.1), new THREE.MeshBasicMaterial({ map: makeTextTexture('FUNICULAR', { color: '#ffd070', width: 512, height: 96, font: 'bold 64px "Bebas Neue", Impact, sans-serif' }), transparent: true }));
  sign.position.set(0, 4.6, 13.45);
  group.add(sign);
  // bollards, crates and a parked van on the quay (cover)
  for (const [x, z, w, h, d] of [[-14, 22, 2.2, 1.3, 2.2], [12, 26, 2.4, 1.2, 1.6], [-4, 30, 1.6, 1.0, 1.6], [26, 20, 2, 2.4, 4.6], [-24, 30, 2, 2.4, 4.6]]) block(x, 0, z, w, h, d, M.wood, true, 'prop');
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(900, 400), new THREE.MeshStandardMaterial({ color: 0x0a1c2a, roughness: 0.25, metalness: 0.35 }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -1.6, 240);
  group.add(sea);
  // a jetty and Juno's seaplane
  box(19, 36, 25, 48, 0.3, M.wood, 0);
  const plane = new THREE.Group();
  const white = mat(0xe8e4dc, { roughness: 0.4 }), red = mat(0xc0283a, { roughness: 0.4 });
  const fus = new THREE.Mesh(new THREE.CapsuleGeometry(0.9, 6, 6, 12), white);
  fus.rotation.z = Math.PI / 2;
  fus.position.set(0, 2.2, 0);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.15, 12), red);
  wing.position.set(0.5, 3.1, 0);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.6, 0.12), red);
  tail.position.set(-3.6, 3.0, 0);
  const tailW = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 3.4), red);
  tailW.position.set(-3.6, 2.4, 0);
  const prop = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.2, 0.2), M.dark);
  prop.position.set(3.95, 2.2, 0);
  plane.add(fus, wing, tail, tailW, prop);
  for (const sz of [-1.6, 1.6]) {
    const fl = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 4.4, 4, 10), white);
    fl.rotation.z = Math.PI / 2;
    fl.position.set(0.3, 0.2, sz);
    plane.add(fl);
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.6, 0.1), M.dark);
    strut.position.set(0.3, 1.1, sz);
    plane.add(strut);
  }
  plane.position.set(30, -1.4, 44);
  plane.rotation.y = Math.PI;
  group.add(plane);

  // ------------------------------------------------------------------ the top station (Varga's waiting)
  const TOPY = H * G;
  box(-30, -175, 30, -133, 6, M.stone, TOPY - 6 + 2.4, true, 'roof');  // the plateau, level with the upper floor
  box(-4.5, -146, 4.5, -140, 4, M.white, TOPY + 2.4);
  const church = new THREE.Mesh(new THREE.BoxGeometry(14, 12, 10), M.white);
  church.position.set(-14, TOPY + 2.4 + 6, -160);
  const tower = new THREE.Mesh(new THREE.BoxGeometry(4, 20, 4), M.white);
  tower.position.set(-20, TOPY + 2.4 + 10, -158);
  group.add(church, tower);
  // police cars at the top, lights flashing (the mode flashes them)
  const flashers = [];
  for (const x of [10, 16]) {
    const car = new THREE.Mesh(new THREE.BoxGeometry(2, 1.4, 4.4), mat(0x1d3566));
    car.position.set(x, TOPY + 2.4 + 0.7, -142);
    const r = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 6), makeGlowMaterial(0xff2030, 0.5));
    r.position.set(x - 0.4, TOPY + 2.4 + 1.7, -142);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 6), makeGlowMaterial(0x2060ff, 0.5));
    b.position.set(x + 0.4, TOPY + 2.4 + 1.7, -142);
    group.add(car, r, b);
    flashers.push([r, b]);
  }

  // ------------------------------------------------------------------ the cars
  const carA = buildCar(-1, 0xe8c040, 1);
  const carB = buildCar(1, 0xd8642c, 2);
  group.add(carA, carB);

  const V = (x, z, y = 0.05) => new THREE.Vector3(x, y, z);
  const goal = new THREE.Vector3(22, 0.35, 44);
  const goalGlow = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.1, 32), makeGlowMaterial(0x4dffa6, 0.85));
  goalGlow.rotation.x = -Math.PI / 2;
  goalGlow.position.set(goal.x, 0.36, goal.z);
  const goalBeam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 30, 16, 1, true), makeGlowMaterial(0x4dffa6, 0.15));
  goalBeam.position.set(goal.x, 15, goal.z);
  group.add(goalGlow, goalBeam);
  return {
    group, world, carA, carB, flashers, goal, goalGlow, goalBeam, plane, topY: TOPY,
    quayRoutes: [[[-8, 18], [16, 18]], [[30, 16], [30, 32], [14, 34]], [[-20, 26], [-6, 36]]],
    vargaSpot: new THREE.Vector3(-2.2, TOPY + 2.45, -137),
    junoSpot: new THREE.Vector3(22, 0.35, 46.5),
    spawn: V(-2.2, 8, 0.95),
    checkpoints: [
      { name: 'The bottom station', spawn: V(-2.2, 8, 0.95), yaw: 0 },
      { name: 'Back down at the bottom', spawn: V(2.2, 7, 0.95), yaw: Math.PI },
    ],
    buildings: [], ladders: [], hideSpots: [],
  };
}

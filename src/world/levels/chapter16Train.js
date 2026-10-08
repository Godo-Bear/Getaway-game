import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CollisionWorld } from '../../core/collision.js';
import { makeTextTexture, makeGlowMaterial } from '../materials.js';
import { makeRng } from '../../core/utils.js';

// ======================================================================
//  Chapter 16, Part 2: inside the Silver Arrow, a bullet train at 300 km/h.
//
//  The train stands still here and the world rushes past outside (the mode
//  moves the scenery and switches to the tunnels). It runs towards -Z.
//
//    front ◄──────────────────────────────────────────────────────► rear
//    [ FIRST CLASS ]=[ BUFFET ]=[ STANDARD A ]=[ STANDARD B ]=[ LUGGAGE ]
//     z -126..-102   -100.5..   -75..-51       -49.5..-25.5   -24..0
//     the courier,    -76.5     police, passengers,            the coupling
//     his case,                 empty seats to sit in          release lever
//     2 bodyguards
//
//  Floor at y = 0, ceiling at 2.5, the aisle down the middle (x -0.5..0.5).
// ======================================================================

export const HALF = 1.75;      // inside half-width
export const CEIL = 2.5;
const CAR_LEN = 24, PITCH = 25.5;
/** Carriage r (0 = the luggage car at the back): its z range. */
export const carZ = (r) => ({ z1: -r * PITCH, z0: -r * PITCH - CAR_LEN });
export const CARS = ['luggage', 'standardB', 'standardA', 'buffet', 'first'];

/** Collects coloured boxes into one mesh (one draw call per carriage). */
class Boxes {
  constructor() { this.geos = []; }
  add(x0, y0, z0, x1, y1, z1, color) {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    const c = new THREE.Color(color), n = g.attributes.position.count, cols = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    g.deleteAttribute('uv');
    this.geos.push(g);
  }
  build(emissive = false) {
    const geo = mergeGeometries(this.geos);
    for (const g of this.geos) g.dispose();
    const m = new THREE.Mesh(geo, emissive ? new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }) : new THREE.MeshLambertMaterial({ vertexColors: true }));
    m.receiveShadow = !emissive;
    return m;
  }
}

export function buildChapter16Train() {
  const group = new THREE.Group();
  const front = new THREE.Group();   // carriages 1-4 (they pull away when you uncouple)
  const rear = new THREE.Group();    // the luggage car (yours)
  group.add(front, rear);
  const world = new CollisionWorld(6);
  const rng = makeRng(1616);
  const solid = (x0, y0, z0, x1, y1, z1, tag = 'wall') => world.addBox(x0, y0, z0, x1, y1, z1, { tag });

  // ------------------------------------------------------------------ the shell
  solid(-2.4, -1, -127, 2.4, 0, 1, 'roof');                   // floor
  solid(-2.4, CEIL, -127, 2.4, CEIL + 0.4, 1);               // ceiling
  solid(-2.2, 0, -127, -HALF, CEIL, 1); solid(HALF, 0, -127, 2.2, CEIL, 1); // sides
  solid(-2.2, 0, -126.6, 2.2, CEIL, -126); solid(-2.2, 0, 0, 2.2, CEIL, 0.6); // the two ends
  const doors = [];
  const sitSpots = [];
  const passengers = [];
  const lights = [];
  const strips = [];

  for (let r = 0; r < 5; r++) {
    const { z0, z1 } = carZ(r), kind = CARS[r];
    const B = new Boxes(), E = new Boxes();
    const parent = r === 0 ? rear : front;
    // floor, walls, ceiling (inside faces)
    const floorCol = kind === 'first' ? 0x6a1a2a : kind === 'buffet' ? 0x5a4a3a : kind === 'luggage' ? 0x4a4c52 : 0x2a3a5a;
    B.add(-HALF, -0.02, z0, HALF, 0.01, z1, floorCol);
    for (const sx of [-1, 1]) {
      B.add(sx < 0 ? -HALF - 0.05 : HALF, 0, z0, sx < 0 ? -HALF : HALF + 0.05, 0.95, z1, 0xd8d4cc);          // below the windows
      B.add(sx < 0 ? -HALF - 0.05 : HALF, 1.95, z0, sx < 0 ? -HALF : HALF + 0.05, CEIL, z1, 0xe8e4dc);        // above them
      B.add(sx * 1.2 - 0.3, 2.05, z0 + 0.3, sx * 1.2 + 0.3, 2.1, z1 - 0.3, 0x9aa0a8);                        // luggage racks
    }
    B.add(-HALF, CEIL - 0.02, z0, HALF, CEIL, z1, 0xf0ece4);
    E.add(-0.18, CEIL - 0.05, z0 + 0.5, 0.18, CEIL - 0.02, z1 - 0.5, kind === 'first' ? 0xffd8a0 : 0xe8f4ff); // the ceiling light strip
    // the end walls with their doors (a gap in the middle; the door slides)
    for (const [zw, dir] of [[z0, -1], [z1, 1]]) {
      if ((r === 4 && dir < 0) || (r === 0 && dir > 0)) { B.add(-HALF, 0, zw - (dir < 0 ? 0 : 0.15), HALF, CEIL, zw + (dir < 0 ? 0.15 : 0), 0xc8c4bc); continue; }
      const a = dir < 0 ? zw : zw - 0.15, b = dir < 0 ? zw + 0.15 : zw;
      B.add(-HALF, 0, a, -0.55, CEIL, b, 0xc8c4bc); B.add(0.55, 0, a, HALF, CEIL, b, 0xc8c4bc); B.add(-0.55, 2.15, a, 0.55, CEIL, b, 0xc8c4bc);
      solid(-HALF, 0, a, -0.55, CEIL, b); solid(0.55, 0, a, HALF, CEIL, b); solid(-0.55, 2.15, a, 0.55, CEIL, b);
      const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.15, 0.06), new THREE.MeshLambertMaterial({ color: 0xb8bcc4 }));
      door.position.set(0, 1.075, (a + b) / 2);
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.8), new THREE.MeshBasicMaterial({ color: 0x0a0e18 }));
      win.position.set(0, 0.45, 0.035);
      door.add(win);
      parent.add(door);
      doors.push({ mesh: door, z: (a + b) / 2, open: 0 });
    }
    // the windows: dark glass between the seat rows (the world goes by outside)
    // (left as gaps in the wall: the mode's scenery shows through them)
    // ---------------------------------------------------------------- inside each kind of carriage
    if (kind === 'standardA' || kind === 'standardB') {
      // 2 + 2 seats in rows, facing forward (-Z); the aisle down the middle
      for (let z = z0 + 1.6; z < z1 - 1; z += 1.15) {
        for (const sx of [-1, 1]) {
          const xa = sx < 0 ? -1.65 : 0.5, xb = sx < 0 ? -0.5 : 1.65;
          B.add(xa, 0.38, z - 0.25, xb, 0.48, z + 0.25, 0x3a5a9a);       // the seat
          B.add(xa, 0.48, z + 0.22, xb, 1.2, z + 0.32, 0x2a4a8a);        // its back
          B.add(xa + 0.05, 1.05, z + 0.2, xb - 0.05, 1.2, z + 0.34, 0xe8e4dc); // headrest covers
          B.add(xa + 0.1, 0, z - 0.1, xb - 0.1, 0.38, z + 0.1, 0x2a2b31); // the frame
          solid(xa, 0, z - 0.3, xb, 1.2, z + 0.34, 'prop');
          // two seats: the aisle one and the window one
          for (const [x, aisle] of [[sx * 0.82, true], [sx * 1.35, false]]) {
            const taken = rng() < (aisle ? 0.45 : 0.55);
            if (taken) passengers.push({ x, z, face: Math.PI });
            else if (aisle) sitSpots.push({ x, z, aisleX: sx * 0.15 });
          }
        }
      }
    } else if (kind === 'first') {
      // wide single seats each side (1 + 1), every 1.6 m
      for (let z = z0 + 1.8; z < z1 - 1.2; z += 1.6) {
        for (const sx of [-1, 1]) {
          const xa = sx < 0 ? -1.6 : 0.6, xb = sx < 0 ? -0.6 : 1.6;
          B.add(xa, 0.38, z - 0.3, xb, 0.5, z + 0.3, 0x8a2a3a);
          B.add(xa, 0.5, z + 0.26, xb, 1.3, z + 0.4, 0x7a1a2a);
          B.add(xa - 0.05, 0.5, z - 0.3, xa + 0.05, 0.7, z + 0.3, 0xd8a830); B.add(xb - 0.05, 0.5, z - 0.3, xb + 0.05, 0.7, z + 0.3, 0xd8a830); // gold armrests
          solid(xa, 0, z - 0.35, xb, 1.3, z + 0.4, 'prop');
          if (rng() < 0.4) passengers.push({ x: sx * 1.1, z, face: Math.PI, rich: true });
          else sitSpots.push({ x: sx * 1.1, z, aisleX: sx * 0.15 });
        }
      }
    } else if (kind === 'buffet') {
      // a long counter on the right, tall tables on the left, a bartender
      B.add(0.65, 0, z0 + 4, 1.7, 1.05, z1 - 4, 0x5a3418);
      B.add(0.6, 1.05, z0 + 4, 1.72, 1.1, z1 - 4, 0xd8a830);
      solid(0.65, 0, z0 + 4, 1.7, 1.1, z1 - 4, 'prop');
      for (let z = z0 + 5; z < z1 - 4; z += 3.4) {
        B.add(-1.4, 0, z - 0.05, -1.3, 1.0, z + 0.05, 0x2a2b31);
        B.add(-1.65, 1.0, z - 0.4, -1.05, 1.05, z + 0.4, 0xd8d4cc);
        solid(-1.65, 0, z - 0.4, -1.05, 1.05, z + 0.4, 'prop');
      }
      for (let z = z0 + 4.5; z < z1 - 4; z += 0.8) E.add(1.55, 1.12, z - 0.05, 1.65, 1.3, z + 0.05, [0xff3fa4, 0x2fe0ff, 0xffd040][Math.floor(rng() * 3)]); // bottles
      passengers.push({ x: 1.25, z: (z0 + z1) / 2, face: -Math.PI / 2, stand: true, staff: true }); // (behind the counter: the bartender)
      for (const z of [z0 + 8.4, z0 + 15.2]) passengers.push({ x: -0.85, z, face: -Math.PI / 2, stand: true });
    } else {
      // the luggage car: racks of suitcases on both sides, the coupling release at the front
      for (let z = z0 + 2.5; z < z1 - 1.5; z += 3) {
        for (const sx of [-1, 1]) {
          const xa = sx < 0 ? -HALF : 0.7, xb = sx < 0 ? -0.7 : HALF;
          B.add(xa, 0, z - 1.2, xb, 0.05, z + 1.2, 0x5a5f6a);
          B.add(xa, 1.0, z - 1.2, xb, 1.05, z + 1.2, 0x5a5f6a);
          solid(xa, 0, z - 1.2, xb, 1.9, z + 1.2, 'prop');
          for (let k = 0; k < 3; k++) {
            const c = [0xc0283a, 0x3a6ea8, 0xe8c040, 0x2f8a4c, 0x1a1b20, 0xe87ab0][Math.floor(rng() * 6)];
            const y = k < 2 ? 0.05 : 1.05, zz = z - 0.8 + (k % 2) * 1.0;
            B.add(xa + 0.1, y, zz - 0.35, xb - 0.1, y + 0.75, zz + 0.35, c);
          }
        }
      }
    }
    const strip = E.build(true);
    parent.add(B.build(), strip);
    strips.push(strip);
    const light = new THREE.PointLight(kind === 'first' ? 0xffd8a0 : 0xe8f0ff, 12, 22, 1.4);
    light.position.set(0, CEIL - 0.4, (z0 + z1) / 2);
    parent.add(light);
    lights.push(light);
    // a sign over the doors at the front of the carriage
    const label = { first: 'FIRST CLASS', buffet: 'BUFFET', standardA: 'CAR 3', standardB: 'CAR 4', luggage: 'LUGGAGE' }[kind];
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.3), new THREE.MeshBasicMaterial({ map: makeTextTexture(label, { color: '#ff7a2a', width: 512, height: 96, font: 'bold 64px "Bebas Neue", Impact, sans-serif' }), transparent: true, toneMapped: false }));
    sign.position.set(0, 2.32, z0 + 0.17);
    parent.add(sign);
  }
  // the gangways between carriages (narrow, dark)
  for (let r = 0; r < 4; r++) {
    const zr = carZ(r).z0, zf = carZ(r + 1).z1;
    const g = new Boxes();
    g.add(-0.55, -0.02, zf, 0.55, 0.01, zr, 0x3a3c42);
    g.add(-0.6, 0, zf, -0.55, 2.15, zr, 0x2a2b31); g.add(0.55, 0, zf, 0.6, 2.15, zr, 0x2a2b31);
    (r === 0 ? rear : front).add(g.build());
    solid(-0.7, 0, zf, -0.55, CEIL, zr); solid(0.55, 0, zf, 0.7, CEIL, zr);
  }

  // ------------------------------------------------------------------ the courier and his case
  const courierSeat = sitSpots.filter((s) => s.z < -110 && s.x > 0).sort((a, b) => a.z - b.z)[0] || { x: 1.1, z: -114 };
  sitSpots.splice(sitSpots.indexOf(courierSeat), 1);
  const caseMesh = new THREE.Group();
  const cb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.36, 0.14), new THREE.MeshStandardMaterial({ color: 0xd8dce4, metalness: 0.9, roughness: 0.25 }));
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.015, 4, 10, Math.PI), new THREE.MeshStandardMaterial({ color: 0x2a2b31 }));
  handle.position.y = 0.18;
  caseMesh.add(cb, handle);
  caseMesh.position.set(1.2, 2.3, courierSeat.z);
  caseMesh.rotation.set(Math.PI / 2, 0, 0);
  front.add(caseMesh);
  const caseGlow = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.6, 24), makeGlowMaterial(0xff7a2a, 0.8));
  caseGlow.rotation.x = -Math.PI / 2;
  caseGlow.position.set(0.2, 0.03, courierSeat.z);
  front.add(caseGlow);
  // the coupling release (front wall of the luggage car, on the right)
  const lever = new THREE.Group();
  const leverBox = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 0.15), new THREE.MeshStandardMaterial({ color: 0xc0283a }));
  const leverArm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.06), new THREE.MeshStandardMaterial({ color: 0xffd040 }));
  leverArm.position.set(0, 0.3, 0.1);
  lever.add(leverBox, leverArm);
  lever.position.set(1.2, 1.2, carZ(0).z0 + 0.25);
  rear.add(lever);

  const V = (x, z, y = 0.05) => new THREE.Vector3(x, y, z);
  return {
    group, front, rear, world, doors, sitSpots, passengers, lights, strips, caseMesh, caseGlow, lever, leverArm,
    courier: { x: courierSeat.x, z: courierSeat.z },
    spots: {
      swap: V(0.2, courierSeat.z),
      lever: V(0.9, carZ(0).z0 + 1.1),
    },
    guardRoutes: [
      [[0, -28], [0, -48.5]],                        // railway police, car 4
      [[0, -73.5], [0, -52]],                        // railway police, car 3
      [[0, -78], [0, -99]],                          // the conductor, buffet
      [[0, -103.5], [0, -110]],                      // bodyguard, first class (near the door)
      [[0.1, courierSeat.z - 3.2]],                  // bodyguard next to the courier
    ],
    spawn: V(0, -8), checkpoints: [
      { name: 'The luggage car', spawn: V(0, -8), yaw: 0 },
      { name: 'The buffet', spawn: V(0, -79), yaw: 0 },
      { name: 'Behind first class', spawn: V(0, -101.2), yaw: Math.PI },
    ],
    buildings: [], ladders: [], hideSpots: [],
  };
}

/**
 * The world outside, rushing past: the ground, the overhead line's masts,
 * the city's towers (then hills and mountains), and the tunnels.
 */
export function buildScenery() {
  const group = new THREE.Group();
  const rng = makeRng(161);
  // the ground (a strip of track bed, and dark fields beyond)
  const bedTex = (() => {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#2a2826'; g.fillRect(0, 0, 64, 256);
    for (let y = 0; y < 256; y += 16) { g.fillStyle = '#4a4440'; g.fillRect(0, y, 64, 5); }
    g.fillStyle = '#8a8f9c'; g.fillRect(14, 0, 4, 256); g.fillRect(46, 0, 4, 256);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1, 60);
    return t;
  })();
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(6, 900), new THREE.MeshLambertMaterial({ map: bedTex }));
  bed.rotation.x = -Math.PI / 2;
  bed.position.set(0, -1.15, -60);
  const fields = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), new THREE.MeshLambertMaterial({ color: 0x1a2418 }));
  fields.rotation.x = -Math.PI / 2;
  fields.position.y = -1.3;
  group.add(bed, fields);
  // the masts of the overhead line, every 40 m both sides
  const masts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.25, 7, 0.25).translate(0, 2.3, 0), new THREE.MeshLambertMaterial({ color: 0x5a5f6a }), 46);
  // the city's towers (and later the hills), with lit windows
  const winC = document.createElement('canvas');
  winC.width = 32; winC.height = 64;
  const wg = winC.getContext('2d');
  wg.fillStyle = '#000'; wg.fillRect(0, 0, 32, 64);
  for (let y = 2; y < 64; y += 6) for (let x = 2; x < 32; x += 6) if (rng() < 0.5) { wg.fillStyle = rng() < 0.8 ? '#ffd890' : '#7ad8ff'; wg.fillRect(x, y, 3, 3); }
  const winTex = new THREE.CanvasTexture(winC);
  winTex.colorSpace = THREE.SRGBColorSpace;
  const towers = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: 0x2a2c36, emissive: 0xffffff, emissiveMap: winTex }), 70);
  const neon = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), 70);
  const hills = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 6).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: 0x1c2a22, flatShading: true }), 40);
  group.add(masts, towers, neon, hills);
  const items = [];
  for (let i = 0; i < 46; i++) items.push({ kind: 'mast', im: masts, i, x: i % 2 ? 3.6 : -3.6, z: -800 + Math.floor(i / 2) * 40, w: 1, h: 1, d: 1 });
  for (let i = 0; i < 70; i++) {
    const side = rng() < 0.5 ? -1 : 1;
    items.push({ kind: 'tower', im: towers, i, x: side * (14 + rng() * 140), z: -900 + rng() * 1000, w: 8 + rng() * 14, h: 20 + rng() * 90, d: 8 + rng() * 14 });
  }
  for (let i = 0; i < 40; i++) {
    const side = rng() < 0.5 ? -1 : 1;
    items.push({ kind: 'hill', im: hills, i, x: side * (80 + rng() * 300), z: -900 + rng() * 1000, w: 60 + rng() * 120, h: 40 + rng() * 120, d: 60 + rng() * 120 });
  }
  const col = new THREE.Color();
  const NEONS = [0xff3fa4, 0x2fe0ff, 0xb46cff, 0xffd040];
  items.filter((it) => it.kind === 'tower').forEach((it, k) => neon.setColorAt(k, col.setHex(NEONS[k % NEONS.length])));
  // the tunnel: a long dark tube with lights along the walls
  const tunnel = new THREE.Group();
  const tube = new THREE.Mesh(new THREE.BoxGeometry(11, 9, 900), new THREE.MeshLambertMaterial({ color: 0x24262a, side: THREE.BackSide }));
  tube.position.set(0, 3, -60);
  tunnel.add(tube);
  const tl = new THREE.InstancedMesh(new THREE.BoxGeometry(0.15, 0.15, 1.6), new THREE.MeshBasicMaterial({ color: 0xffb060, toneMapped: false }), 60);
  tunnel.add(tl);
  tunnel.visible = false;
  group.add(tunnel);
  for (let i = 0; i < 60; i++) items.push({ kind: 'tlight', im: tl, i, x: i % 2 ? 5.3 : -5.3, z: -800 + Math.floor(i / 2) * 30, w: 1, h: 1, d: 1, y: 2.2 });

  const o = new THREE.Object3D();
  let towerK = 0;
  const place = (it) => {
    o.position.set(it.x, it.kind === 'tower' || it.kind === 'hill' ? -1.3 : it.y ?? -1.2, it.z);
    o.scale.set(it.w, it.h, it.d);
    o.updateMatrix();
    it.im.setMatrixAt(it.i, o.matrix);
    if (it.kind === 'tower') {
      o.position.set(it.x - Math.sign(it.x) * (it.w / 2 + 0.1), -1.3 + it.h * 0.7, it.z);
      o.scale.set(0.2, it.h * 0.25, 2);
      o.updateMatrix();
      neon.setMatrixAt(it.ni ?? (it.ni = towerK++), o.matrix);
    }
  };
  for (const it of items) place(it);
  return {
    group, tunnel, bedTex,
    /** Move everything past the train (dist = metres travelled this frame). city 0..1 = towers vs hills. */
    update(dist, inTunnel, city) {
      bedTex.offset.y += dist / 15;
      for (const it of items) {
        it.z += dist;
        const span = it.kind === 'mast' ? 920 : it.kind === 'tlight' ? 900 : 1000;
        if (it.z > 120) {
          it.z -= span;
          if (it.kind === 'tower') { it.hidden = rng() > city; }
        }
        if (it.kind === 'tower' && it.hidden) { o.position.set(0, -500, 0); o.scale.set(0.01, 0.01, 0.01); o.updateMatrix(); it.im.setMatrixAt(it.i, o.matrix); neon.setMatrixAt(it.ni, o.matrix); continue; }
        place(it);
      }
      for (const im of [masts, towers, neon, hills, tl]) im.instanceMatrix.needsUpdate = true;
      tunnel.visible = inTunnel;
      towers.visible = neon.visible = hills.visible = fields.visible = masts.visible = !inTunnel;
    },
  };
}

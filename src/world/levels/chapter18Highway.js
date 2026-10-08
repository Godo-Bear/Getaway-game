import * as THREE from 'three';
import { CollisionWorld } from '../../core/collision.js';
import { makeTextTexture, makeGlowMaterial } from '../materials.js';
import { buildNeonDressing, NEON_TINTS, NEON_GLASS } from '../neon.js';
import { makeCarMesh } from '../../vehicles/carModel.js';
import { makeRng } from '../../core/utils.js';

// ======================================================================
//  Chapter 18: the Silver Dragons' convoy on the Kōji Expressway, at night.
//
//  Everything here moves "relative to the convoy": the trucks stay roughly
//  where they are (each drifts forward and back a little, so the gaps
//  between them open and close), while the road, the city and the
//  overhead sign gantries rush past towards +Z at the convoy's speed.
//  Forward is -Z.
//
//    lanes (x):  -5.25   -1.75    1.75    5.25
//                          ┌──┐
//      z = -60             │E │ car transporter (the gold car, upper deck)
//      z = -40     ┌──┐    └──┘
//                  │D │
//      z = -24             ┌──┐
//                          │C │  box truck  ◄ checkpoint
//      z =  -6                     ┌──┐
//                                  │B │ flatbed with containers
//      z = +12             ┌──┐    └──┘
//                          │A │  box truck
//      z = +26             [van]  Juno's van (you start on its roof)
// ======================================================================

export const LANES = [-5.25, -1.75, 1.75, 5.25];
export const ROAD_HALF = 7.6;          // the deck's half-width (barriers at the edges)
export const GANTRY_Y = 5.4;           // the underside of the overhead signs
export const CITY_Y = -34;             // the streets far below the elevated road

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...extra });

/** A truck's collision boxes (relative to its position: the centre of its trailer, on the road). */
function truckBoxes(kind) {
  if (kind === 'van') return [[-1.0, 0.4, -2.5, 1.0, 2.4, 2.5]];
  if (kind === 'flatbed') {
    return [
      [-1.25, 0.9, -6, 1.25, 1.3, 6],             // the bed
      [-1.2, 1.3, -5.8, 1.2, 3.9, -0.3],          // container 1
      [-1.2, 1.3, 0.3, 1.2, 3.9, 5.8],            // container 2
      [-1.2, 0.5, -9.2, 1.2, 3.2, -6.5],          // the cab
    ];
  }
  if (kind === 'transporter') {
    return [
      [-1.3, 0.8, -8, 1.3, 1.2, 8],               // lower deck
      [-1.3, 3.4, -8, 1.3, 3.8, 8],               // upper deck
      [-1.3, 1.2, -8, -1.15, 3.4, 8],             // side frames
      [1.15, 1.2, -8, 1.3, 3.4, 8],
      [-1.2, 0.5, -11.2, 1.2, 3.2, -8.5],         // the cab
    ];
  }
  return [
    [-1.25, 0.8, -6, 1.25, 4.0, 6],               // box trailer
    [-1.2, 0.5, -9.2, 1.2, 3.2, -6.5],            // the cab
  ];
}

function buildTruck(kind, color) {
  const g = new THREE.Group();
  const add = (w, h, d, x, y, z, m) => { const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); mesh.position.set(x, y, z); g.add(mesh); return mesh; };
  const dark = mat(0x1a1b20), chrome = mat(0x9aa0aa, { metalness: 0.8, roughness: 0.3 });
  const wheel = new THREE.CylinderGeometry(0.5, 0.5, 0.35, 12).rotateZ(Math.PI / 2);
  const wheels = (zs) => { for (const z of zs) for (const x of [-1.15, 1.15]) { const w = new THREE.Mesh(wheel, dark); w.position.set(x, 0.5, z); g.add(w); } };
  if (kind === 'van') {
    add(2.0, 2.0, 5, 0, 1.4, 0, mat(0xff7a2a));
    add(2.02, 0.6, 1.2, 0, 2.0, -2.0, new THREE.MeshStandardMaterial({ color: 0x0a1420, emissive: 0x1a3048 }));
    wheels([-1.7, 1.7]);
    return g;
  }
  // the cab (all of them have one, at the front)
  const cabColor = kind === 'transporter' ? 0xe8e8ec : color;
  add(2.4, 2.7, 2.7, 0, 1.85, kind === 'transporter' ? -9.85 : -7.85, mat(cabColor, { metalness: 0.3 }));
  add(2.42, 0.9, 0.1, 0, 2.4, kind === 'transporter' ? -11.2 : -9.2, new THREE.MeshStandardMaterial({ color: 0x0a1420, emissive: 0x203850 }));
  for (const x of [-0.8, 0.8]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.05), new THREE.MeshBasicMaterial({ color: 0xfff0c0, toneMapped: false }));
    l.position.set(x, 1.0, kind === 'transporter' ? -11.23 : -9.23);
    g.add(l);
  }
  if (kind === 'flatbed') {
    add(2.5, 0.4, 12, 0, 1.1, 0, dark);
    add(2.4, 2.6, 5.5, 0, 2.6, -3.05, mat(color, { roughness: 0.6 }));
    add(2.4, 2.6, 5.5, 0, 2.6, 3.05, mat(0x2a6ab0, { roughness: 0.6 }));
    wheels([-8.2, 2.5, 4.2]);
  } else if (kind === 'transporter') {
    add(2.6, 0.4, 16, 0, 1.0, 0, chrome);
    add(2.6, 0.4, 16, 0, 3.6, 0, chrome);
    for (const z of [-7.5, -2.5, 2.5, 7.5]) for (const x of [-1.22, 1.22]) add(0.12, 2.6, 0.12, x, 2.3, z, chrome);
    wheels([-10, 4.5, 6.5]);
  } else {
    add(2.5, 3.2, 12, 0, 2.4, 0, mat(color, { roughness: 0.6 }));
    wheels([-8.2, 3.5, 5.0]);
  }
  // red tail lights
  for (const x of [-1.0, 1.0]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.05), new THREE.MeshBasicMaterial({ color: 0xff2030, toneMapped: false }));
    t.position.set(x, 1.0, kind === 'transporter' ? 8.03 : 6.03);
    g.add(t);
  }
  return g;
}

/** A painted name on a truck's side (the Silver Dragons' trucks). */
function dragonDecal(g, len, y) {
  const tex = makeTextTexture('SILVER DRAGON', { color: '#d8dcec', width: 1024, height: 128, font: 'bold 96px "Bebas Neue", Impact, sans-serif' });
  for (const sx of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len * 0.8, len * 0.1), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    m.position.set(sx * 1.27, y, 0);
    m.rotation.y = sx * Math.PI / 2;
    g.add(m);
  }
}

export function buildChapter18Highway() {
  const group = new THREE.Group();
  const world = new CollisionWorld(8);
  const rng = makeRng(1818);

  // ------------------------------------------------------------------ the road (an elevated expressway)
  const roadTex = (() => {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#1c1d22'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`; g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
    g.fillStyle = '#d8d8d0';
    for (const x of [-3.5, 0, 3.5]) g.fillRect(128 + (x / ROAD_HALF) * 128 - 2, 0, 4, 128);   // dashed lane lines
    g.fillStyle = '#e8c040';
    for (const x of [-7, 7]) g.fillRect(128 + (x / ROAD_HALF) * 128 - 2, 0, 4, 256);           // edge lines
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1, 40);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, 480), new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.55, metalness: 0.2 }));
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0, -80);
  group.add(road);
  world.addBox(-ROAD_HALF - 2, -2, -400, ROAD_HALF + 2, 0, 200, { tag: 'roof' });
  // concrete barriers (they don't move: the same all the way along)
  for (const sx of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.0, 480), mat(0x8a8c92));
    b.position.set(sx * (ROAD_HALF + 0.25), 0.5, -80);
    group.add(b);
    world.addBox(sx > 0 ? ROAD_HALF : -ROAD_HALF - 0.5, 0, -400, sx > 0 ? ROAD_HALF + 0.5 : -ROAD_HALF, 1.0, 200, { tag: 'wall' });
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 480), new THREE.MeshBasicMaterial({ color: 0x2fe0ff, toneMapped: false }));
    strip.position.set(sx * (ROAD_HALF + 0.52), 0.8, -80);
    group.add(strip);
  }
  const under = new THREE.Mesh(new THREE.BoxGeometry(ROAD_HALF * 2 + 1, 1.6, 480), mat(0x4a4c52));
  under.position.set(0, -0.8, -80);
  group.add(under);

  // ------------------------------------------------------------------ the city rushing past (chunks that wrap round)
  const CHUNK = 160, CHUNKS = 4;
  const chunks = [];
  const winTex = (() => {
    const c = document.createElement('canvas');
    c.width = 32; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, 32, 64);
    for (let y = 2; y < 64; y += 5) for (let x = 2; x < 32; x += 5) if (rng() < 0.4) { g.fillStyle = rng() < 0.7 ? '#ffd890' : '#8ad8ff'; g.fillRect(x, y, 3, 3); }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  for (let k = 0; k < CHUNKS; k++) {
    const cg = new THREE.Group();
    const buildings = [];
    for (let i = 0; i < 9; i++) {
      const side = i % 2 ? 1 : -1;
      const w = 14 + rng() * 18, d = 14 + rng() * 22, h = 30 + rng() * 90;
      const x0 = side > 0 ? 16 + rng() * 40 : -16 - rng() * 40 - w, z0 = -CHUNK / 2 + rng() * (CHUNK - d);
      const tex = winTex.clone();
      tex.needsUpdate = true;
      tex.repeat.set(Math.max(1, Math.round(w / 6)), Math.max(1, Math.round((h - CITY_Y) / 8)));
      const tint = rng() < 0.5 ? NEON_GLASS[Math.floor(rng() * 4)] : NEON_TINTS[Math.floor(rng() * 8)];
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h - CITY_Y, d), new THREE.MeshStandardMaterial({ color: tint, roughness: 0.6, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.75 }));
      m.position.set(x0 + w / 2, (h + CITY_Y) / 2, z0 + d / 2);
      cg.add(m);
      buildings.push({ x0, x1: x0 + w, z0, z1: z0 + d, h });
    }
    cg.add(buildNeonDressing(buildings, makeRng(1820 + k), { signChance: 0.75, minY: 6 }));
    // the streets far below: lamps in lines
    const lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffc870, toneMapped: false }), 24);
    const o = new THREE.Object3D();
    for (let i = 0; i < 24; i++) { o.position.set([-12, 12][i % 2], CITY_Y + 5, -CHUNK / 2 + (i >> 1) * (CHUNK / 12)); o.updateMatrix(); lamps.setMatrixAt(i, o.matrix); }
    cg.add(lamps);
    // the expressway's own lights on tall posts
    for (let z = -CHUNK / 2; z < CHUNK / 2; z += 32) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 9, 6), mat(0x6a6c72));
      post.position.set(0, 4.5 + 2.5, z);
      const head = new THREE.Mesh(new THREE.BoxGeometry(4, 0.2, 0.5), new THREE.MeshBasicMaterial({ color: 0xffe8c0, toneMapped: false }));
      head.position.set(0, 11.5, z);
      cg.add(head);
      // (the posts stand on the barriers, not in the middle of the road)
      for (const sx of [-1, 1]) { const p2 = post.clone(); p2.position.x = sx * (ROAD_HALF + 0.25); p2.position.y = 5.5; cg.add(p2); }
      const arm = new THREE.Mesh(new THREE.BoxGeometry(ROAD_HALF * 2 + 0.5, 0.15, 0.15), mat(0x6a6c72));
      arm.position.set(0, 11.6, z);
      cg.add(arm);
    }
    cg.position.z = -240 + k * CHUNK;
    group.add(cg);
    chunks.push(cg);
  }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), mat(0x101218, { roughness: 0.4, metalness: 0.3 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = CITY_Y;
  group.add(ground);

  // ------------------------------------------------------------------ overhead sign gantries (they sweep over the convoy)
  const gantries = [];
  for (let i = 0; i < 2; i++) {
    const g = new THREE.Group();
    const steel = mat(0x5a5d66, { metalness: 0.6 });
    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, GANTRY_Y + 2.4, 0.5), steel);
      leg.position.set(sx * (ROAD_HALF + 0.6), (GANTRY_Y + 2.4) / 2, 0);
      g.add(leg);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(ROAD_HALF * 2 + 1.6, 0.5, 0.6), steel);
    beam.position.y = GANTRY_Y + 0.25;
    g.add(beam);
    const signTex = makeTextTexture(i ? 'KŌJI PORT 4 km' : 'AIRPORT 9 km', { color: '#ffffff', width: 1024, height: 192, font: 'bold 120px "Bebas Neue", Impact, sans-serif' });
    for (const [x, w] of [[-3.6, 6.4], [3.6, 6.4]]) {
      const sign = new THREE.Mesh(new THREE.BoxGeometry(w, 1.9, 0.2), new THREE.MeshStandardMaterial({ color: 0x1a7a3a, roughness: 0.6 }));
      sign.position.set(x, GANTRY_Y + 1.45, 0);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.4, 1.3), new THREE.MeshBasicMaterial({ map: signTex, transparent: true }));
      face.position.set(x, GANTRY_Y + 1.45, 0.11);
      g.add(sign, face);
      const back = face.clone();
      back.rotation.y = Math.PI;
      back.position.z = -0.11;
      g.add(back);
    }
    // a red warning light that flashes as it comes
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3040, toneMapped: false }));
    lamp.position.set(0, GANTRY_Y + 0.1, 0.4);
    g.add(lamp);
    g.position.z = -400;
    g.visible = false;
    group.add(g);
    gantries.push({ g, lamp, z: -400, active: false });
  }

  // ------------------------------------------------------------------ the convoy
  const defs = [
    { id: 'van', kind: 'van', lane: 2, z: 26, amp: 1.2, period: 9, phase: 0 },
    { id: 'A', kind: 'box', lane: 2, z: 12, amp: 2.5, period: 11, phase: 1.2, color: 0xd8d8dc },
    { id: 'B', kind: 'flatbed', lane: 3, z: -6, amp: 4, period: 13, phase: 0.4, color: 0xc03020 },
    { id: 'C', kind: 'box', lane: 2, z: -26, amp: 3.5, period: 12, phase: 2.6, color: 0xd8d8dc },
    { id: 'D', kind: 'box', lane: 1, z: -42, amp: 4, period: 15, phase: 4.0, color: 0x2a2c36 },
    { id: 'E', kind: 'transporter', lane: 2, z: -62, amp: 3, period: 14, phase: 1.0 },
  ];
  const trucks = defs.map((d) => {
    const mesh = buildTruck(d.kind, d.color);
    if (d.kind === 'box') dragonDecal(mesh, 12, 2.6);
    group.add(mesh);
    return { ...d, mesh, x: LANES[d.lane], boxes: truckBoxes(d.kind) };
  });
  // the gold car on the transporter's upper deck (at the back), and two more cars
  const E = trucks.find((t) => t.id === 'E');
  const goldCar = makeCarMesh({ kind: 'player', color: 0xffc020, style: { body: 'muscle', stripe: 0x151515, rims: 0xd8d8d8, spoiler: true, tint: null, glow: null } });
  goldCar.position.set(0, 3.8, 4.4);   // (nose towards the back of the truck: it'll drive straight off the ramp)
  E.mesh.add(goldCar);
  const goldGlow = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.1, 32), makeGlowMaterial(0xffd040, 0.8));
  goldGlow.rotation.x = -Math.PI / 2;
  goldGlow.position.set(0, 3.85, 4.4);
  E.mesh.add(goldGlow);
  for (const [z, c] of [[-4.5, 0x8a1a2a], [-1.0, 0x2a6ab0]]) {
    const car = makeCarMesh({ kind: 'civilian', color: c });
    car.position.set(0, 1.2, z);
    car.rotation.y = Math.PI;
    E.mesh.add(car);
  }
  E.boxes.push([-1.0, 3.8, 2.3, 1.0, 5.0, 6.5]);   // (the gold car itself: you climb onto the deck beside it)

  // Ryu's white car, out in front of the convoy, and two Dragon bikers alongside
  const ryu = makeCarMesh({ kind: 'civilian', color: 0xf0f0f4 });
  ryu.position.set(LANES[1], 0, -92);
  ryu.rotation.y = Math.PI;
  group.add(ryu);
  const bikers = [];
  for (const [lane, z] of [[0, -14], [3, -48]]) {
    const b = makeCarMesh({ kind: 'player', color: 0xd8dcec, style: { body: 'bike', stripe: 0x151515, rims: 0x777777, spoiler: false, tint: null, glow: null } });
    b.position.set(LANES[lane], 0, z);
    b.rotation.y = Math.PI;
    group.add(b);
    bikers.push({ mesh: b, lane, z, t: rng() * 6 });
  }

  return {
    group, world, trucks, chunks, chunkLen: CHUNK, roadTex, gantries, goldCar, goldGlow, ryu, bikers,
    spawn: new THREE.Vector3(LANES[2], 2.45, 26.5), checkpoints: [], ladders: [], hideSpots: [], buildings: [],
  };
}

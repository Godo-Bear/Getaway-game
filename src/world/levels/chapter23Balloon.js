import * as THREE from 'three';
import { CollisionWorld } from '../../core/collision.js';
import { makeGlowMaterial, getGlowTexture } from '../materials.js';
import { buildCacti, buildMesa, DESERT_GLASS } from '../desert.js';
import { buildBalloon } from '../../vehicles/balloon.js';
import { makeRng, clamp } from '../../core/utils.js';

// ======================================================================
//  Chapter 23, Part 2: by hot-air balloon from the Balloon Fiesta field
//  (the origin, on the desert north of Mirage Springs) to the top of the
//  Coyote Mountains, where the Silver Crown mine's old ventilation shaft
//  comes out (SUMMIT). The mountain is a height function (terrainH): a big
//  round mountain with a flat top and a long ridge either side.
//
//  The wind blows a different way at different heights (LAYERS): that's
//  the only way to steer. Three Jackal lookouts on the slopes sweep the sky
//  with searchlights.
// ======================================================================

export const SUMMIT = new THREE.Vector3(220, 0, -820);   // the shaft
export const PLATEAU = 150;                              // the flat top of the mountain
export const LANDING = new THREE.Vector3(SUMMIT.x - 16, PLATEAU, SUMMIT.z + 9); // land here (beside the headframe)
export const LANDING_R = 10;
/** The winds, by height (y): which way they blow (x, z) and how fast (m/s). */
export const LAYERS = [
  { y0: -1e9, y1: 40, dir: [1, 0], speed: 3 },
  { y0: 40, y1: 100, dir: [-0.5, -0.866], speed: 7 },
  { y0: 100, y1: 165, dir: [0.6, -0.8], speed: 7.5 },
  { y0: 165, y1: 240, dir: [0, 1], speed: 7 },
  { y0: 240, y1: 1e9, dir: [-1, 0], speed: 5 },
];
/** The lookouts: where they stand (x, z), and how their searchlights sweep. */
export const LOOKOUTS = [
  { x: 30, z: -560, speed: 0.35, phase: 0 },
  { x: 430, z: -650, speed: -0.3, phase: 2 },
  { x: 140, z: -1050, speed: 0.4, phase: 4 },
];

/** The ground's height at (x, z). */
export function terrainH(x, z) {
  const dx = x - SUMMIT.x, dz = z - SUMMIT.z, d2 = dx * dx + dz * dz;
  let h = 178 * Math.exp(-d2 / (2 * 140 * 140));
  const ridge = 95 * Math.exp(-((dz + dx * 0.18) ** 2) / (2 * 60 * 60)) * Math.exp(-(dx * dx) / (2 * 420 * 420));
  h = Math.max(h, ridge);
  if (h > PLATEAU) h = PLATEAU + (h - PLATEAU) * 0.04; // (the flat top)
  const rocky = clamp((PLATEAU - h) / 12, 0.05, 1) * Math.min(1, h / 40);
  const rock = (Math.sin(x / 17) * Math.sin(z / 13) * 4 + Math.sin(x / 41 + z / 37) * 6) * rocky;
  const dunes = 1.2 * Math.sin(x / 50) * Math.sin(z / 37);
  return Math.max(0, h + rock) + dunes;
}

/** The wind at height y: { x, z } in m/s (it blends over a few metres between layers). */
export function windAt(y, out = { x: 0, z: 0 }) {
  let i = LAYERS.findIndex((L) => y < L.y1);
  if (i < 0) i = LAYERS.length - 1;
  const L = LAYERS[i];
  out.x = L.dir[0] * L.speed;
  out.z = L.dir[1] * L.speed;
  // (near a boundary, blend with the next layer)
  const B = 6;
  const next = y > L.y1 - B ? LAYERS[i + 1] : y < L.y0 + B ? LAYERS[i - 1] : null;
  if (next) {
    const edge = y > L.y1 - B ? L.y1 : L.y0, k = 0.5 * (1 - Math.abs(y - edge) / B);
    out.x += (next.dir[0] * next.speed - out.x) * k;
    out.z += (next.dir[1] * next.speed - out.z) * k;
  }
  return out;
}

const BALLOON_COLORS = [
  ['#e8302a', '#ffd040', '#ffffff'], ['#2a7ae8', '#ffffff', '#ffd040'], ['#2ac86a', '#ffe8a0', '#1a5a3a'], ['#ff7ac8', '#ffffff', '#7a2ac8'],
  ['#ff8a20', '#2a2a40', '#ffd040'], ['#30c8e8', '#e8302a', '#ffffff'], ['#ffd040', '#e8302a', '#2a7ae8'], ['#a8e830', '#2a7ae8', '#ffffff'],
];

export function buildChapter23Balloon() {
  const group = new THREE.Group();
  const world = new CollisionWorld(20);
  const rng = makeRng(2302);
  const lam = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

  // ---------------------------------------------------------------- the desert and the mountain
  const SIZE = 2600, SEG = 220, CX = 150, CZ = -520;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, cols = new Float32Array(pos.count * 3);
  const sand = new THREE.Color(0xc89a62), rock = new THREE.Color(0x8a4a2e), top = new THREE.Color(0x6a4030), tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + CX, z = pos.getZ(i) + CZ, h = terrainH(x, z);
    pos.setXYZ(i, x, h, z);
    const k = clamp((h - 6) / 50, 0, 1);
    tmp.copy(sand).lerp(rock, k);
    if (h > PLATEAU - 2) tmp.lerp(top, 0.6);
    tmp.multiplyScalar(0.9 + ((i * 7919) % 100) / 1000);
    cols[i * 3] = tmp.r; cols[i * 3 + 1] = tmp.g; cols[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  group.add(new THREE.Mesh(geo, lam(0xffffff, { vertexColors: true, flatShading: true })));
  const far = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), lam(0xb88a58));
  far.rotation.x = -Math.PI / 2;
  far.position.set(CX, -0.4, CZ);
  group.add(far);
  for (let k = 0; k < 18; k++) { // mesas on the horizon
    const a = (k / 18) * Math.PI * 2, r = 1500 + rng() * 500;
    group.add(buildMesa(CX + Math.cos(a) * r, CZ + Math.sin(a) * r, 60 + rng() * 80, 50 + rng() * 70, rng));
  }
  const cacti = [];
  for (let i = 0; i < 160; i++) {
    const x = -500 + rng() * 1300, z = 250 - rng() * 1500;
    if (terrainH(x, z) > 8 || Math.hypot(x, z) < 40) continue;
    cacti.push([x, z, 0.6 + rng() * 0.6, rng() * 6]);
  }
  group.add(buildCacti(cacti));

  // ---------------------------------------------------------------- the fiesta field: balloons on the ground, string lights, trucks
  const field = new THREE.Mesh(new THREE.PlaneGeometry(160, 120), lam(0x9a8a5a));
  field.rotation.x = -Math.PI / 2;
  field.position.set(0, 0.05, 30);
  group.add(field);
  const parked = [];
  for (let i = 0; i < 9; i++) {
    const b = buildBalloon({ colors: BALLOON_COLORS[i % BALLOON_COLORS.length], scale: 0.9 + rng() * 0.2 });
    b.position.set(-60 + (i % 5) * 28 + rng() * 6, 0, 30 + Math.floor(i / 5) * 34 + rng() * 6);
    group.add(b);
    parked.push(b);
  }
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.18, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffd890, toneMapped: false }), 120);
  const o = new THREE.Object3D();
  for (let i = 0; i < 120; i++) { o.position.set(-75 + (i % 60) * 2.5, 3 + Math.sin(i * 0.5) * 0.4, i < 60 ? -25 : 85); o.updateMatrix(); bulbs.setMatrixAt(i, o.matrix); }
  group.add(bulbs);

  // ---------------------------------------------------------------- Mirage Springs behind you (south, +z): lit towers
  const winTex = (() => {
    const c = document.createElement('canvas'); c.width = 32; c.height = 64;
    const g = c.getContext('2d'); g.fillStyle = '#100c08'; g.fillRect(0, 0, 32, 64);
    for (let y = 2; y < 64; y += 6) for (let x = 2; x < 32; x += 6) { if (Math.random() < 0.6) { g.fillStyle = Math.random() < 0.7 ? '#ffd890' : '#ff9ad0'; g.fillRect(x, y, 3, 3); } }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  for (let i = 0; i < 26; i++) {
    const h = 20 + rng() * (i % 4 === 0 ? 130 : 40), w = 14 + rng() * 18, t = winTex.clone();
    t.needsUpdate = true; t.repeat.set(w / 8, h / 10);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), new THREE.MeshStandardMaterial({ color: i % 4 === 0 ? DESERT_GLASS[i % 4] : 0x6a5040, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.9, roughness: 0.6 }));
    m.position.set(-420 + i * 34 + rng() * 10, h / 2, 520 + rng() * 260);
    group.add(m);
  }

  // ---------------------------------------------------------------- the summit: the headframe over the shaft, a shed, the landing ring
  const iron = new THREE.MeshStandardMaterial({ color: 0x4a3a30, metalness: 0.6, roughness: 0.6 });
  const hf = new THREE.Group();
  hf.position.set(SUMMIT.x, PLATEAU, SUMMIT.z);
  for (const [x, z] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.4, 14, 0.4), iron);
    leg.position.set(x * 0.7, 7, z * 0.7);
    leg.rotation.set(z * 0.035, 0, -x * 0.035);
    hf.add(leg);
  }
  for (const y of [4, 8, 12]) { const ring = new THREE.Mesh(new THREE.BoxGeometry(4.4 - y * 0.12, 0.25, 4.4 - y * 0.12), iron); ring.position.y = y; hf.add(ring); }
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.12, 6, 18), iron);
  wheel.position.y = 14.2;
  hf.add(wheel);
  const hole = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({ color: 0x050403 }));
  hole.rotation.x = -Math.PI / 2;
  hole.position.y = 0.1;
  hf.add(hole);
  group.add(hf);
  const shed = new THREE.Mesh(new THREE.BoxGeometry(6, 3.2, 4), lam(0x7a5a3a));
  shed.position.set(SUMMIT.x + 12, PLATEAU + 1.6, SUMMIT.z - 8);
  group.add(shed);
  const ring = new THREE.Mesh(new THREE.RingGeometry(LANDING_R - 0.8, LANDING_R, 40), makeGlowMaterial(0x4dffa6, 0.8));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(LANDING.x, terrainH(LANDING.x, LANDING.z) + 0.3, LANDING.z);
  group.add(ring);
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 60, 6, 1, true), makeGlowMaterial(0x4dffa6, 0.25));
  beacon.position.set(LANDING.x, ring.position.y + 30, LANDING.z);
  group.add(beacon);

  // ---------------------------------------------------------------- the lookouts and their searchlights
  const lookouts = LOOKOUTS.map((L) => {
    const y = terrainH(L.x, L.z);
    const tower = new THREE.Group();
    tower.position.set(L.x, y, L.z);
    for (const [x, z] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 7, 0.25), lam(0x5a4030)); leg.position.set(x, 3.5, z); tower.add(leg); }
    const deck = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.3, 3.2), lam(0x5a4030));
    deck.position.y = 7;
    const hut = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2, 2.4), lam(0x6a4a30));
    hut.position.y = 8.2;
    const lamp = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0xfff2c0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    lamp.position.y = 9.6;
    lamp.scale.setScalar(5);
    tower.add(deck, hut, lamp);
    group.add(tower);
    // the beam: a long cone of light from the lamp
    const coneGeo = new THREE.CylinderGeometry(0.4, 1, 1, 18, 1, true);
    coneGeo.translate(0, 0.5, 0);
    coneGeo.rotateX(Math.PI / 2); // (points along +z, from the lamp)
    const beam = new THREE.Mesh(coneGeo, makeGlowMaterial(0xfff2c0, 0.13));
    beam.frustumCulled = false;
    beam.position.set(L.x, y + 9.6, L.z);
    group.add(beam);
    return { ...L, origin: new THREE.Vector3(L.x, y + 9.6, L.z), beam, dir: new THREE.Vector3(0, 0, 1) };
  });

  // ---------------------------------------------------------------- the other balloons, up in the different winds (they show you which way each one blows)
  const fliers = [];
  for (let i = 0; i < 16; i++) {
    const b = buildBalloon({ colors: BALLOON_COLORS[(i + 3) % BALLOON_COLORS.length], scale: 0.85 + rng() * 0.3 });
    const layer = LAYERS[i % 4 + (i % 9 === 8 ? 1 : 0)];
    const y = clamp(Math.max(layer.y0, 12) + 8 + rng() * (Math.min(layer.y1, 300) - Math.max(layer.y0, 12) - 16), 12, 300);
    b.position.set(-500 + rng() * 1200, y, 200 - rng() * 1400);
    group.add(b);
    fliers.push({ mesh: b, y, t: rng() * 10 });
  }

  const spawn = new THREE.Vector3(0, 1.2, 0);
  spawn.yaw = 0;
  return { group, world, spawn, ladders: [], lookouts, fliers, parked, ring, beacon };
}

import * as THREE from 'three';
import { makeRng } from '../core/utils.js';
import { CollisionWorld } from '../core/collision.js';
import { MeshBatcher } from './meshBatcher.js';
import { getMaterials, getGlowTexture, makeTextTexture, FACADE_UV } from './materials.js';
import { RoadGraph } from '../ai/roadGraph.js';

// Street-level city for the driving modes.
//
//  - A grid of roads. Every crossing is an intersection (a node in the road
//    graph the police use to navigate).
//  - Blocks between roads hold buildings, parks (drive straight through them,
//    watch the trees!) and alleys (narrow cut-throughs, good for hiding).
//  - Parking garages: drive in and the cops can't see you from the street
//    (a hiding spot: they lose you much faster in there).
//  - Ramps in the parks launch the car into the air.
//  - Street lamps, lane markings and working traffic lights.
//
// Like the rooftop city, everything static is merged or instanced so the
// whole city costs only a few dozen draw calls.

const ROAD = 18;           // road width (two lanes each way)
const BLOCK = 50;          // block size between roads
const PITCH = ROAD + BLOCK;
export const LANE_OFFSETS = [2.3, 6.2]; // lane centres, measured from the road centre line
const SIDEWALK = 3;

/** Special buildings story chapters can place on a block (forceKinds). */
const LANDMARKS = {
  safehouse: { height: 8, tint: 0x6d6a64, door: 0x1f9a58 },
  anchor: { height: 10, tint: 0x5a4a3a, door: 0x8a5a10, sign: 'THE ANCHOR', signColor: '#ffb020' },
  terminal: { height: 9, tint: 0xa8a49a, door: 0x2a70a8, sign: 'FERRY TERMINAL', signColor: '#39e6ff' },
  hq: { height: 30, tint: 0x6a7080, door: 0x2a4aa0, sign: 'POLICE', signColor: '#3d7bff', windows: true },
  airfield: { height: 11, tint: 0x7a7e86, door: 0x2a90c8, sign: 'NORTH AIRFIELD', signColor: '#39e6ff' },
  freightyard: { height: 7, tint: 0x6a5a48, door: 0xc0551e, sign: 'FREIGHT YARD', signColor: '#ff8a3d' },
};

const WALL_TINTS = [0x8a8f9c, 0x9c8a80, 0x7f8f9a, 0x9a9690, 0x8c8496, 0xa09080, 0x7c8580, 0x6f7a8a];

/**
 * @param {object} opts
 * @param {number} opts.seed
 * @param {number} opts.blocks - blocks per side
 * @param {Object<string,string>} opts.forceKinds - e.g. { '4,4': 'park', '7,0': 'safehouse' }
 *        to force what goes on a block (story levels need fixed landmarks)
 */
export function generateStreetCity({ seed = 7, blocks = 8, forceKinds = {} } = {}) {
  const rng = makeRng(seed);
  const world = new CollisionWorld(16);
  const batch = new MeshBatcher();
  const mats = getMaterials();
  const group = new THREE.Group();

  const n = blocks + 1;                // roads per direction
  const half = (blocks * PITCH) / 2;
  const roadC = (k) => k * PITCH - half; // centre line of road k
  const graph = new RoadGraph(n, roadC);

  const ramps = [];     // { x0,x1,z0,z1, axis:'x'|'z', dir:+1|-1, height }
  const alleys = [];    // rectangles where you're "hidden"
  const parks = [];
  const garages = [];   // covered car parks you can hide in
  const lamps = [];
  const trees = [];
  const buildingsList = [];
  const minimapShapes = []; // for drawing the minimap: { type, x0, z0, x1, z1 }

  const outer = roadC(0) - ROAD / 2, outerMax = roadC(n - 1) + ROAD / 2;

  // --- Ground (asphalt everywhere) ---------------------------------------
  batch.addBox({ x: outer - 400, y: -0.5, z: outer - 400 }, { x: outerMax + 400, y: 0, z: outerMax + 400 },
    { side: null, top: 'asphalt', topScale: [10, 10] });

  // --- City boundary wall -------------------------------------------------
  const wallT = 1.5, wallH = 2.2;
  const edge = (x0, z0, x1, z1) => {
    world.addBox(x0, 0, z0, x1, wallH, z1, { tag: 'wall' });
    batch.addBox({ x: x0, y: 0, z: z0 }, { x: x1, y: wallH, z: z1 },
      { side: 'concrete', top: 'concrete', color: 0x9a9a9a, uvScale: [4, 4], topScale: [4, 4] });
  };
  edge(outer - wallT, outer - wallT, outerMax + wallT, outer);
  edge(outer - wallT, outerMax, outerMax + wallT, outerMax + wallT);
  edge(outer - wallT, outer, outer, outerMax);
  edge(outerMax, outer, outerMax + wallT, outerMax);
  // Hazard stripes on top of the wall so you can see it at night
  // Filler skyline outside the wall (visual only: no collision, so these must
  // never end up inside the city, or you'd drive straight through them)
  for (let i = 0; i < 70; i++) {
    const a = rng() * Math.PI * 2;
    const r = half + ROAD + rng.range(20, 140);
    let x = Math.cos(a) * r, z = Math.sin(a) * r;
    const w = rng.range(14, 30), d = rng.range(14, 30), h = rng.range(15, 70);
    // The city is a square but this ring is a circle: near the corners the
    // circle dips inside the square. Push those buildings back out past the wall.
    const need = outerMax + wallT + 6 + Math.max(w, d) / 2;
    const m = Math.max(Math.abs(x), Math.abs(z));
    if (m < need) { x *= need / m; z *= need / m; }
    batch.addBlock(x, 0, z, w, h, d, { side: 'wall', top: 'roof', color: rng.pick(WALL_TINTS), uvScale: FACADE_UV, uvOffset: [rng(), 0], topScale: [6, 6] });
  }

  // --- Blocks ------------------------------------------------------------
  const blockKinds = [];
  for (let i = 0; i < blocks; i++) {
    for (let j = 0; j < blocks; j++) {
      const r = rng();
      blockKinds.push(r < 0.14 ? 'park' : r < 0.34 ? 'alley' : r < 0.56 ? 'garage' : 'buildings');
    }
  }
  // Guarantee plenty of garages to hide in (about one block in six or more)
  for (let k = 0, tries = 0; blockKinds.filter((b) => b === 'garage').length < 10 && tries < 80; tries++) {
    k = Math.floor(rng() * blockKinds.length);
    if (blockKinds[k] === 'buildings') blockKinds[k] = 'garage';
  }
  // Guarantee at least two parks
  if (blockKinds.filter((k) => k === 'park').length < 2) {
    blockKinds[Math.floor(blocks * blocks * 0.3)] = 'park';
    blockKinds[Math.floor(blocks * blocks * 0.7)] = 'park';
  }
  for (const [key, kind] of Object.entries(forceKinds)) {
    const [i, j] = key.split(',').map(Number);
    blockKinds[i * blocks + j] = kind;
  }
  const landmarks = {};
  const extraSigns = [];

  for (let i = 0; i < blocks; i++) {
    for (let j = 0; j < blocks; j++) {
      const x0 = roadC(i) + ROAD / 2, x1 = roadC(i + 1) - ROAD / 2;
      const z0 = roadC(j) + ROAD / 2, z1 = roadC(j + 1) - ROAD / 2;
      const kind = blockKinds[i * blocks + j];

      if (kind === 'park') {
        landmarks[`${i},${j}`] = makePark(x0, z0, x1, z1);
        continue;
      }
      if (LANDMARKS[kind]) {
        landmarks[`${i},${j}`] = makeLandmark(x0, z0, x1, z1, LANDMARKS[kind]);
        continue;
      }
      // Sidewalk slab (visual only - too low to block the car)
      batch.addBox({ x: x0, y: 0, z: z0 }, { x: x1, y: 0.15, z: z1 },
        { side: 'concrete', top: 'concrete', color: 0x70707a, uvScale: [3, 3], topScale: [3, 3] });

      const ix0 = x0 + SIDEWALK, ix1 = x1 - SIDEWALK, iz0 = z0 + SIDEWALK, iz1 = z1 - SIDEWALK;
      if (kind === 'garage') {
        makeGarage(x0, z0, x1, z1, ix0, iz0, ix1, iz1);
        continue;
      }
      if (kind === 'alley') {
        // Split the block in two with a 7 m alley running through it.
        const alongX = rng() < 0.5;
        const w = 7;
        if (alongX) {
          const mz = (z0 + z1) / 2 + rng.range(-6, 6);
          fillBuildings(ix0, iz0, ix1, mz - w / 2);
          fillBuildings(ix0, mz + w / 2, ix1, iz1);
          alleys.push({ x0, x1, z0: mz - w / 2, z1: mz + w / 2 });
          batch.addBox({ x: x0, y: 0.01, z: mz - w / 2 }, { x: x1, y: 0.02, z: mz + w / 2 }, { side: null, top: 'asphalt', color: 0x777777, topScale: [6, 6] });
        } else {
          const mx = (x0 + x1) / 2 + rng.range(-6, 6);
          fillBuildings(ix0, iz0, mx - w / 2, iz1);
          fillBuildings(mx + w / 2, iz0, ix1, iz1);
          alleys.push({ x0: mx - w / 2, x1: mx + w / 2, z0, z1 });
          batch.addBox({ x: mx - w / 2, y: 0.01, z: z0 }, { x: mx + w / 2, y: 0.02, z: z1 }, { side: null, top: 'asphalt', color: 0x777777, topScale: [6, 6] });
        }
      } else {
        fillBuildings(ix0, iz0, ix1, iz1);
      }
    }
  }

  function fillBuildings(x0, z0, x1, z1) {
    // Split an area into 1-3 x 1-3 buildings, tightly packed.
    const cols = (x1 - x0) > 30 ? rng.int(1, 3) : 1;
    const rows = (z1 - z0) > 30 ? rng.int(1, 3) : 1;
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const bx0 = x0 + ((x1 - x0) * c) / cols, bx1 = x0 + ((x1 - x0) * (c + 1)) / cols;
        const bz0 = z0 + ((z1 - z0) * r) / rows, bz1 = z0 + ((z1 - z0) * (r + 1)) / rows;
        const h = rng() < 0.15 ? rng.range(40, 75) : rng.range(12, 34);
        world.addBox(bx0, 0, bz0, bx1, h, bz1, { tag: 'building' });
        batch.addBox({ x: bx0, y: 0, z: bz0 }, { x: bx1, y: h, z: bz1 },
          { side: 'wall', top: 'roof', color: rng.pick(WALL_TINTS), uvScale: FACADE_UV, uvOffset: [rng(), Math.floor(rng() * 8) / 8], topScale: [6, 6] });
        // Glowing shop front along the bottom
        if (rng() < 0.5) {
          const glow = rng.pick([0xffa040, 0xff4fa0, 0x40d0ff, 0x60ff90, 0xffe070]);
          batch.addBox({ x: bx0 - 0.05, y: 0.4, z: bz0 - 0.05 }, { x: bx1 + 0.05, y: 2.8, z: bz1 + 0.05 },
            { side: 'glow', top: null, color: new THREE.Color(glow).multiplyScalar(0.35).getHex() });
        }
        buildingsList.push({ x0: bx0, x1: bx1, z0: bz0, z1: bz1, h });
        minimapShapes.push({ type: 'building', x0: bx0, z0: bz0, x1: bx1, z1: bz1 });
      }
    }
  }

  /**
   * A parking garage on the block's west side: open at the front (facing the
   * road), walls on the other three sides and a roof. Buildings fill the rest.
   */
  function makeGarage(x0, z0, x1, z1, ix0, iz0, ix1, iz1) {
    const depth = 22, half = 8, H = 5, t = 0.6;
    const cz = (z0 + z1) / 2;
    const gx1 = x0 + depth;
    const look = { side: 'concrete', top: 'concrete', color: 0x8c8c90, uvScale: [3, 3], topScale: [3, 3] };
    const solid = (ax0, ay0, az0, ax1, ay1, az1, lk = look) => {
      world.addBox(ax0, ay0, az0, ax1, ay1, az1, { tag: 'building' });
      batch.addBox({ x: ax0, y: ay0, z: az0 }, { x: ax1, y: ay1, z: az1 }, lk);
    };
    solid(x0 + 1, 0, cz - half - t, gx1, H, cz - half);      // north wall
    solid(x0 + 1, 0, cz + half, gx1, H, cz + half + t);      // south wall
    solid(gx1 - t, 0, cz - half, gx1, H, cz + half);         // back wall
    // Roof and two more parking decks above (visual; too high for the car)
    solid(x0 + 1, H, cz - half - t, gx1, H + 0.5, cz + half + t);
    batch.addBox({ x: x0 + 1, y: H + 0.5, z: cz - half - t }, { x: gx1, y: H * 3, z: cz + half + t },
      { side: 'wall', top: 'roof', color: 0x77777c, uvScale: FACADE_UV, topScale: [4, 4] });
    world.addBox(x0 + 1, H + 0.5, cz - half - t, gx1, H * 3, cz + half + t, { tag: 'building' });
    // Dim floor, a blue light strip over the entrance and a "P" sign
    batch.addBox({ x: x0 + 1, y: 0.02, z: cz - half }, { x: gx1 - t, y: 0.03, z: cz + half }, { side: null, top: 'asphalt', color: 0x55555c, topScale: [6, 6] });
    batch.addBox({ x: x0 + 0.9, y: H - 0.35, z: cz - half }, { x: x0 + 1, y: H, z: cz + half }, { side: 'glow', top: null, color: 0x1a4a9a });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3, 3),
      new THREE.MeshBasicMaterial({ map: makeTextTexture('P', { color: '#ffffff', bg: '#2a5ad8', width: 128, height: 128, font: 'bold 110px Arial, sans-serif' }), toneMapped: false }));
    sign.position.set(x0 + 0.95, H + 2, cz);
    sign.rotation.y = -Math.PI / 2;
    extraSigns.push(sign);
    garages.push({ x0: x0 + 1, x1: gx1 - t, z0: cz - half, z1: cz + half });
    minimapShapes.push({ type: 'garage', x0: x0 + 1, z0: cz - half - t, x1: gx1, z1: cz + half + t });
    // Pavement and buildings around it
    batch.addBox({ x: x0, y: 0, z: z0 }, { x: x1, y: 0.15, z: cz - half - t }, { side: 'concrete', top: 'concrete', color: 0x70707a, uvScale: [3, 3], topScale: [3, 3] });
    batch.addBox({ x: x0, y: 0, z: cz + half + t }, { x: x1, y: 0.15, z: z1 }, { side: 'concrete', top: 'concrete', color: 0x70707a, uvScale: [3, 3], topScale: [3, 3] });
    fillBuildings(ix0, iz0, gx1, cz - half - t - 1);
    fillBuildings(ix0, cz + half + t + 1, gx1, iz1);
    fillBuildings(gx1 + 1.5, iz0, ix1, iz1);
  }

  function makePark(x0, z0, x1, z1) {
    parks.push({ x0, x1, z0, z1 });
    minimapShapes.push({ type: 'park', x0, z0, x1, z1 });
    batch.addBox({ x: x0, y: 0, z: z0 }, { x: x1, y: 0.06, z: z1 },
      { side: 'plain', top: 'plain', color: 0x1d3a22 });
    // Paths in a cross
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    batch.addBox({ x: cx - 3, y: 0.06, z: z0 }, { x: cx + 3, y: 0.08, z: z1 }, { side: null, top: 'concrete', color: 0x6a6258, topScale: [3, 3] });
    batch.addBox({ x: x0, y: 0.06, z: cz - 3 }, { x: x1, y: 0.08, z: cz + 3 }, { side: null, top: 'concrete', color: 0x6a6258, topScale: [3, 3] });
    // Trees (with small colliders around the trunks), avoiding the paths
    for (let k = 0; k < 18; k++) {
      const x = rng.range(x0 + 3, x1 - 3), z = rng.range(z0 + 3, z1 - 3);
      if (Math.abs(x - cx) < 6 || Math.abs(z - cz) < 6) continue;
      trees.push([x, z, rng.range(0.8, 1.3)]);
      world.addBox(x - 0.35, 0, z - 0.35, x + 0.35, 4, z + 0.35, { tag: 'tree' });
    }
    // A ramp on one of the paths
    const alongX = rng() < 0.5;
    const dir = rng() < 0.5 ? 1 : -1;
    const len = 9, width = 6, height = 2.2;
    if (alongX) {
      const rx = cx + dir * 8;
      ramps.push(makeRamp(rx - len / 2, cz - width / 2, rx + len / 2, cz + width / 2, 'x', dir, height));
    } else {
      const rz = cz + dir * 8;
      ramps.push(makeRamp(cx - width / 2, rz - len / 2, cx + width / 2, rz + len / 2, 'z', dir, height));
    }
    // Fountain in the middle? A low statue base is a nice obstacle.
    world.addBox(cx - 1.2, 0, cz - 1.2, cx + 1.2, 1.2, cz + 1.2, { tag: 'statue' });
    batch.addBlock(cx, 0, cz, 2.4, 1.2, 2.4, { side: 'concrete', top: 'concrete', color: 0xb0aaa0, uvScale: [2, 2] });
    batch.addBlock(cx, 1.2, cz, 0.8, 2.6, 0.8, { side: 'plain', top: 'plain', color: 0x4a6a60 });
    return { center: new THREE.Vector3(cx, 0, cz), block: { x0, x1, z0, z1 } };
  }

  /**
   * A landmark building (safehouse, bar, ferry terminal, police HQ): a low
   * building with a glowing door facing the road on the block's west side
   * (-X), and a sign. Returns where the car should stop and the nearest junction.
   */
  function makeLandmark(x0, z0, x1, z1, L) {
    batch.addBox({ x: x0, y: 0, z: z0 }, { x: x1, y: 0.15, z: z1 },
      { side: 'concrete', top: 'concrete', color: 0x70707a, uvScale: [3, 3], topScale: [3, 3] });
    // Neighbouring buildings on the rest of the block
    fillBuildings(x0 + SIDEWALK, z0 + SIDEWALK, x1 - SIDEWALK, z0 + 16);
    fillBuildings(x0 + SIDEWALK, z1 - 16, x1 - SIDEWALK, z1 - SIDEWALK);
    const wx0 = x0 + SIDEWALK, wx1 = x1 - SIDEWALK - 10, wz0 = z0 + 18, wz1 = z1 - 18;
    world.addBox(wx0, 0, wz0, wx1, L.height, wz1, { tag: 'building' });
    batch.addBox({ x: wx0, y: 0, z: wz0 }, { x: wx1, y: L.height, z: wz1 },
      { side: L.windows ? 'wall' : 'concrete', top: 'roof', color: L.tint, uvScale: L.windows ? FACADE_UV : [4, 4], topScale: [6, 6] });
    // Glowing door / entrance
    const cz = (wz0 + wz1) / 2;
    batch.addBox({ x: wx0 - 0.08, y: 0.1, z: cz - 3.2 }, { x: wx0, y: 4.4, z: cz + 3.2 }, { side: 'glow', top: null, color: L.door });
    batch.addBox({ x: wx0 - 0.3, y: 4.4, z: cz - 3.6 }, { x: wx0, y: 4.8, z: cz + 3.6 }, { side: 'plain', top: 'plain', color: 0x2a2c30 });
    if (L.sign) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.5),
        new THREE.MeshBasicMaterial({ map: makeTextTexture(L.sign, { color: L.signColor }), transparent: true, toneMapped: false, depthWrite: false }));
      sign.position.set(wx0 - 0.1, Math.min(L.height - 1.2, 7), cz);
      sign.rotation.y = -Math.PI / 2;
      extraSigns.push(sign);
    }
    minimapShapes.push({ type: 'building', x0: wx0, z0: wz0, x1: wx1, z1: wz1 });
    const door = new THREE.Vector3(x0 - 4, 0, cz);
    return { door, node: graph.nearestNode(door.x, door.z), block: { x0, x1, z0, z1 } };
  }

  function makeRamp(x0, z0, x1, z1, axis, dir, height) {
    return { x0, z0, x1, z1, axis, dir, height };
  }

  // --- Road markings ----------------------------------------------------
  const dashes = []; // [x, z, rotY, length, width, color]
  for (let k = 0; k < n; k++) {
    for (let s = 0; s < blocks; s++) {
      const a = roadC(s) + ROAD / 2 + 2, b = roadC(s + 1) - ROAD / 2 - 2;
      for (let t = a; t < b; t += 6) {
        const len = Math.min(3, b - t);
        const mid = t + len / 2;
        // Roads along X (at z = roadC(k)): centre line (yellow) and lane dividers (white)
        dashes.push([mid, roadC(k), 0, len, 0.25, 0xd9a520]);
        dashes.push([mid, roadC(k) + 4.3, 0, len, 0.18, 0xd8d8d8]);
        dashes.push([mid, roadC(k) - 4.3, 0, len, 0.18, 0xd8d8d8]);
        // Roads along Z
        dashes.push([roadC(k), mid, Math.PI / 2, len, 0.25, 0xd9a520]);
        dashes.push([roadC(k) + 4.3, mid, Math.PI / 2, len, 0.18, 0xd8d8d8]);
        dashes.push([roadC(k) - 4.3, mid, Math.PI / 2, len, 0.18, 0xd8d8d8]);
      }
    }
  }
  {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff }), dashes.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3(), c = new THREE.Color();
    dashes.forEach(([x, z, r, len, w, col], i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r);
      m.compose(pos.set(x, 0.03, z), q, sc.set(len, 1, w));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, c.set(col));
    });
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // Street lamps along every road (both sides), skipping intersections
  for (let k = 0; k < n; k++) {
    for (let s = 0; s < blocks; s++) {
      for (let t = roadC(s) + ROAD / 2 + 8; t < roadC(s + 1) - ROAD / 2 - 4; t += 22) {
        lamps.push([t, roadC(k) - ROAD / 2 - 0.8, 1], [t, roadC(k) + ROAD / 2 + 0.8, -1]);
      }
    }
  }

  // --- Elevated railway ("the El") over one avenue -------------------------
  // Pillars stand along both kerbs, the deck runs 8 m up. Driving underneath
  // helps you lose the police, like alleys and parks.
  const elK = Math.floor(n / 2) - 1;
  const elZ = roadC(elK);
  const EL_HALF = 6.5, EL_Y = 8;
  const pillarLook = { side: 'plain', top: 'plain', color: 0x3b4048 };
  for (let x = outer + 6; x < outerMax - 6; x += 17) {
    const nearNode = Math.abs(x - roadC(Math.round((x - roadC(0)) / PITCH))) < ROAD / 2 + 3;
    if (nearNode) continue;
    for (const side of [-1, 1]) {
      const pz = elZ + side * (ROAD / 2 - 0.55);
      world.addBox(x - 0.4, 0, pz - 0.4, x + 0.4, EL_Y, pz + 0.4, { tag: 'pillar' });
      batch.addBox({ x: x - 0.4, y: 0, z: pz - 0.4 }, { x: x + 0.4, y: EL_Y, z: pz + 0.4 }, pillarLook);
    }
  }
  world.addBox(outer, EL_Y, elZ - EL_HALF, outerMax, EL_Y + 1.2, elZ + EL_HALF, { tag: 'bridge' });
  batch.addBox({ x: outer, y: EL_Y, z: elZ - EL_HALF }, { x: outerMax, y: EL_Y + 1.2, z: elZ + EL_HALF },
    { side: 'metal', top: 'concrete', bottom: 'plain', color: 0x5a6068, uvScale: [2, 1.2], topScale: [4, 4] });
  for (const side of [-1, 1]) {
    // Side girders and the rails
    batch.addBox({ x: outer, y: EL_Y + 1.2, z: elZ + side * EL_HALF - 0.25 }, { x: outerMax, y: EL_Y + 2.0, z: elZ + side * EL_HALF + 0.25 }, pillarLook);
    for (const r of [-0.75, 0.75]) {
      const rz = elZ + side * 2.8 + r;
      batch.addBox({ x: outer, y: EL_Y + 1.2, z: rz - 0.07 }, { x: outerMax, y: EL_Y + 1.35, z: rz + 0.07 }, { side: 'plain', top: 'plain', color: 0x8a8f96 });
    }
  }
  minimapShapes.push({ type: 'bridge', x0: outer, z0: elZ - EL_HALF, x1: outerMax, z1: elZ + EL_HALF });

  // --- Build batched meshes ------------------------------------------------
  group.add(batch.build(mats));
  group.add(buildRampMeshes(ramps));
  group.add(buildTrees(trees));
  group.add(buildLamps(lamps));
  const trafficLights = new TrafficLights(graph, ROAD);
  group.add(trafficLights.group);

  // Neon signs on some buildings facing the road
  const signGroup = new THREE.Group();
  const signTex = [['THE ANCHOR', '#ffb020'], ['MOTEL', '#ff3fa4'], ['DINER', '#2fe0ff'], ['PAWN', '#4dffa6'], ['BAR', '#ff5a3a'], ['GARAGE', '#c070ff']]
    .map(([t, c]) => makeTextTexture(t, { color: c }));
  for (const b of buildingsList) {
    if (rng() > 0.12) continue;
    const mat = new THREE.MeshBasicMaterial({ map: rng.pick(signTex), transparent: true, toneMapped: false, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.75), mat);
    mesh.position.set((b.x0 + b.x1) / 2, Math.min(b.h - 2, rng.range(5, 9)), b.z0 - 0.1);
    mesh.rotation.y = Math.PI;
    signGroup.add(mesh);
  }
  group.add(signGroup);
  for (const sgn of extraSigns) group.add(sgn);

  /** Height of the drivable surface at (x, z): 0 on roads, sloped on ramps. */
  function groundHeight(x, z) {
    for (const r of ramps) {
      if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1) continue;
      // t = 0 at the low end, 1 at the high (launch) end
      let t = r.axis === 'x' ? (x - r.x0) / (r.x1 - r.x0) : (z - r.z0) / (r.z1 - r.z0);
      if (r.dir < 0) t = 1 - t;
      return t * r.height;
    }
    return 0;
  }

  const train = new ElevatedTrain(outer, outerMax, elZ + 2.8, EL_Y + 1.35);
  group.add(train.group);

  const inRect = (x, z, r, pad = 0) => x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad;

  return {
    group, world, graph, ramps, parks, alleys, trafficLights, minimapShapes, landmarks,
    bounds: { min: outer, max: outerMax },
    roadWidth: ROAD,
    groundHeight,
    isInAlley: (x, z) => alleys.some((a) => inRect(x, z, a)),
    isInPark: (x, z) => parks.some((p) => inRect(x, z, p)),
    isInGarage: (x, z) => garages.some((g) => inRect(x, z, g)),
    garages,
    isUnderBridge: (x, z) => Math.abs(z - elZ) < EL_HALF && x > outer && x < outerMax,
    train,
  };
}

// ----------------------------------------------------------------------
// Visual helpers
// ----------------------------------------------------------------------

function buildRampMeshes(ramps) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0xb05a20 });
  const stripeMat = new THREE.MeshBasicMaterial({ color: 0xffd040, toneMapped: false });
  for (const r of ramps) {
    // A wedge: build it along +X from 0..len, rising to `height`, then rotate.
    const len = r.axis === 'x' ? r.x1 - r.x0 : r.z1 - r.z0;
    const w = r.axis === 'x' ? r.z1 - r.z0 : r.x1 - r.x0;
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(len, 0);
    shape.lineTo(len, r.height);
    shape.lineTo(0, 0);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
    geo.translate(-len / 2, 0, -w / 2);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = mesh.receiveShadow = true;
    // Orientation: wedge rises toward +X. Rotate so it rises toward the ramp's direction.
    let rot = 0;
    if (r.axis === 'x') rot = r.dir > 0 ? 0 : Math.PI;
    else rot = r.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
    mesh.rotation.y = rot;
    mesh.position.set((r.x0 + r.x1) / 2, 0, (r.z0 + r.z1) / 2);
    g.add(mesh);
    // Glowing edge at the lip so you can see it at night
    const lip = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, w), stripeMat);
    lip.position.set(len / 2, r.height, 0);
    mesh.add(lip);
  }
  return g;
}

function buildTrees(trees) {
  const g = new THREE.Group();
  if (!trees.length) return g;
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.3, 3, 6);
  trunkGeo.translate(0, 1.5, 0);
  const leafGeo = new THREE.IcosahedronGeometry(2.2, 0);
  leafGeo.translate(0, 4.2, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x3a2a1c }), trees.length);
  const leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshLambertMaterial({ color: 0x1f4a2a, flatShading: true }), trees.length);
  const m = new THREE.Matrix4();
  trees.forEach(([x, z, s], i) => {
    m.makeScale(s, s, s).setPosition(x, 0, z);
    trunks.setMatrixAt(i, m);
    leaves.setMatrixAt(i, m);
  });
  trunks.castShadow = leaves.castShadow = true;
  g.add(trunks, leaves);
  return g;
}

function buildLamps(lamps) {
  const g = new THREE.Group();
  const n = lamps.length;
  const poleGeo = new THREE.BoxGeometry(0.2, 7, 0.2);
  poleGeo.translate(0, 3.5, 0);
  const armGeo = new THREE.BoxGeometry(0.12, 0.12, 2.2);
  armGeo.translate(0, 7, 1.0);
  const headGeo = new THREE.BoxGeometry(0.5, 0.18, 0.8);
  headGeo.translate(0, 6.9, 2.0);
  const poolGeo = new THREE.PlaneGeometry(13, 13);
  poolGeo.rotateX(-Math.PI / 2);
  poolGeo.translate(0, 0.05, 2.5);

  const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshLambertMaterial({ color: 0x2a2c30 }), n);
  const arms = new THREE.InstancedMesh(armGeo, poles.material, n);
  const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshBasicMaterial({ color: 0xffc070, toneMapped: false }), n);
  const pools = new THREE.InstancedMesh(poolGeo, new THREE.MeshBasicMaterial({
    map: getGlowTexture(), color: 0xff9a3a, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }), n);
  pools.material.userData.nightGlow = true; // (fades out in daylight)
  const m = new THREE.Matrix4();
  lamps.forEach(([x, z, facing], i) => {
    // Lamps along X-roads lean over the road toward +Z or -Z
    m.makeRotationY(facing > 0 ? 0 : Math.PI).setPosition(x, 0, z);
    poles.setMatrixAt(i, m);
    arms.setMatrixAt(i, m);
    heads.setMatrixAt(i, m);
    pools.setMatrixAt(i, m);
  });
  g.add(poles, arms, heads, pools);
  // Lamps along Z-roads: same set rotated 90 degrees around the city centre
  // (the grid is square and symmetric, so this lines up exactly).
  const g2 = g.clone();
  g2.rotation.y = Math.PI / 2;
  const out = new THREE.Group();
  out.add(g, g2);
  return out;
}

// ----------------------------------------------------------------------
// Traffic lights: one light head per approach at every intersection.
// A simple global cycle: roads along Z get green, then roads along X.
// Neighbouring intersections are offset a little so it doesn't look robotic.
// ----------------------------------------------------------------------
const CYCLE = 18;       // seconds for the full cycle
const GREEN = 7;        // green time per direction
const YELLOW = 2;

export class TrafficLights {
  constructor(graph, roadWidth) {
    this.graph = graph;
    this.time = 0;
    this.group = new THREE.Group();
    const nodes = graph.nodes;
    const count = nodes.length * 4;
    const poleGeo = new THREE.BoxGeometry(0.2, 4.5, 0.2);
    poleGeo.translate(0, 2.25, 0);
    const headGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    headGeo.translate(0, 4.6, 0);
    this.poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshLambertMaterial({ color: 0x222428 }), count);
    this.heads = new THREE.InstancedMesh(headGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), count);
    this.approach = []; // for each instance: 'x' or 'z' (which road it controls)
    const m = new THREE.Matrix4();
    const o = roadWidth / 2 + 0.6;
    let i = 0;
    for (const node of nodes) {
      // Corner positions; the light at each corner faces cars on one road.
      const corners = [[o, o, 'z'], [-o, -o, 'z'], [-o, o, 'x'], [o, -o, 'x']];
      for (const [dx, dz, axis] of corners) {
        m.makeTranslation(node.x + dx, 0, node.z + dz);
        this.poles.setMatrixAt(i, m);
        this.heads.setMatrixAt(i, m);
        this.approach.push({ node, axis });
        i++;
      }
    }
    this.group.add(this.poles, this.heads);
    this._c = new THREE.Color();
    this._timer = 0;
    this.update(0);
  }

  /** 'green' | 'yellow' | 'red' for traffic travelling along `axis` at `node`. */
  state(node, axis) {
    const t = (this.time + node.phaseOffset) % CYCLE;
    const half = CYCLE / 2;
    const local = axis === 'z' ? t : (t + half) % CYCLE;
    if (local < GREEN) return 'green';
    if (local < GREEN + YELLOW) return 'yellow';
    return 'red';
  }

  update(dt) {
    this.time += dt;
    this._timer -= dt;
    if (this._timer > 0) return; // colours only need refreshing a few times a second
    this._timer = 0.25;
    const colors = { green: 0x30ff70, yellow: 0xffc020, red: 0xff2a2a };
    this.approach.forEach((a, i) => {
      this.heads.setColorAt(i, this._c.set(colors[this.state(a.node, a.axis)]));
    });
    this.heads.instanceColor.needsUpdate = true;
  }
}

// ----------------------------------------------------------------------
// A three-car train that runs back and forth along the elevated line.
// Pure decoration: it has no collider (nothing can reach it anyway).
// ----------------------------------------------------------------------
class ElevatedTrain {
  constructor(minX, maxX, z, y) {
    this.minX = minX + 30;
    this.maxX = maxX - 30;
    this.x = this.minX;
    this.dir = 1;
    this.wait = 0;
    this.group = new THREE.Group();
    this.group.position.set(this.x, y, z);
    const body = new THREE.MeshLambertMaterial({ color: 0x9aa3ad });
    const glow = new THREE.MeshBasicMaterial({ color: 0xfff0c0, toneMapped: false });
    const carGeo = new THREE.BoxGeometry(14, 3.2, 3);
    const winGeo = new THREE.BoxGeometry(12, 0.9, 3.05);
    for (let i = 0; i < 3; i++) {
      const car = new THREE.Mesh(carGeo, body);
      car.position.set(-i * 14.6, 1.8, 0);
      const win = new THREE.Mesh(winGeo, glow);
      win.position.set(-i * 14.6, 2.2, 0);
      this.group.add(car, win);
    }
  }

  update(dt) {
    if (this.wait > 0) { this.wait -= dt; return; }
    this.x += this.dir * 18 * dt;
    if (this.x > this.maxX || this.x < this.minX) {
      this.x = Math.max(this.minX, Math.min(this.maxX, this.x));
      this.dir *= -1;
      this.wait = 4;
      this.group.rotation.y = this.dir > 0 ? 0 : Math.PI;
    }
    this.group.position.x = this.x;
  }
}

import * as THREE from 'three';
import { makeRng } from '../core/utils.js';
import { CollisionWorld } from '../core/collision.js';
import { MeshBatcher } from './meshBatcher.js';
import { getMaterials, getGlowTexture, makeTextTexture, FACADE_UV } from './materials.js';
import { RoadGraph } from '../ai/roadGraph.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeShaftMaterial, lampShaftGeometry } from './atmosphere.js';
import { Shopfronts, addShopsToBuildings } from './shopfronts.js';

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
//
// alpine: a snowy mountain town instead (Frostvale): low wooden chalets
// with snow on their pitched roofs, pine trees, snowbanks along the kerbs,
// warm shop windows, a pine forest outside the town and mountains all round.
// No elevated railway.

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
  tunnel: { height: 12, tint: 0x4a4c52, door: 0xffd040, sign: 'HIGHWAY NORTH', signColor: '#ffd040' },
  cabin: { height: 6, tint: 0x6b5236, door: 0x1f9a58, sign: 'PINE LODGE', signColor: '#7dff8a' },
  // Frostvale (Chapters 9-12)
  hotel: { height: 14, tint: 0xd2c4aa, door: 0xffb020, sign: 'SUMMIT HOTEL', signColor: '#ffd070', windows: true },
  pass: { height: 10, tint: 0x55606e, door: 0xffd040, sign: 'MOUNTAIN PASS', signColor: '#ffd040' },
  sentinel: { height: 12, tint: 0x2a2e36, door: 0xff3040, sign: 'SENTINEL', signColor: '#ff4050' },
  church: { height: 16, tint: 0xe0d6c4, door: 0x7dff8a, sign: 'ST. ANNA', signColor: '#9fd4ff' },
  airstrip: { height: 7, tint: 0x6a7480, door: 0x39e6ff, sign: 'LAKE AIRSTRIP', signColor: '#39e6ff' },
};

const WALL_TINTS = [0x8a8f9c, 0x9c8a80, 0x7f8f9a, 0x9a9690, 0x8c8496, 0xa09080, 0x7c8580, 0x6f7a8a];
const ALPINE_TINTS = [0x8a5a3a, 0x6e4a30, 0xd2c4aa, 0xc8b89a, 0x9a6a44, 0xe0d6c4, 0x7a5236, 0xb8a080];
const SNOW = 0xe8eef5;
const SHOP_TINTS = [0xc8b49a, 0xa8584a, 0x6a8a8a, 0xd8cfc0, 0x8a6a9a, 0x5a7a5a, 0xb88a5a, 0x4a5a7a];

/**
 * @param {object} opts
 * @param {number} opts.seed
 * @param {number} opts.blocks - blocks per side
 * @param {Object<string,string>} opts.forceKinds - e.g. { '4,4': 'park', '7,0': 'safehouse' }
 *        to force what goes on a block (story levels need fixed landmarks)
 * @param {boolean} [opts.alpine] - a snowy mountain town (see above)
 * @param {number} [opts.parkShare] - share of the blocks that are parks
 */
export function generateStreetCity({ seed = 7, blocks = 8, forceKinds = {}, alpine = false, parkShare = 0.14 } = {}) {
  const rng = makeRng(seed);
  const world = new CollisionWorld(16);
  const batch = new MeshBatcher();
  const batch2 = new MeshBatcher(); // (alpine snowbanks)
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
  const roofs = [];     // alpine: pitched roofs to put on the buildings [x0, z0, x1, z1, h]
  const banks = [];     // alpine: snowbanks along the kerbs
  const chimneys = [];  // alpine: chimney tops [x, y, z] (they smoke)
  const minimapShapes = []; // for drawing the minimap: { type, x0, z0, x1, z1 }
  const kerbs = [];     // pavement edges (see addKerbs)
  const drng = makeRng(seed * 13 + 5); // (decoration: its own random numbers, so the layout never changes)
  const shopRng = makeRng(seed * 5 + 11); // (which blocks get a row of shops, and what they look like)
  const shops = new Shopfronts({ alpine });
  const tanks = [];     // water tanks on the roofs [x, y, z, scale]
  const beacons = [];   // red warning lights on the towers

  const outer = roadC(0) - ROAD / 2, outerMax = roadC(n - 1) + ROAD / 2;

  // --- Ground (asphalt everywhere) ---------------------------------------
  batch.addBox({ x: outer - 400, y: -0.5, z: outer - 400 }, { x: outerMax + 400, y: 0, z: outerMax + 400 },
    { side: null, top: 'asphalt', topScale: [10, 10] });

  // --- City boundary wall -------------------------------------------------
  const wallT = 1.5, wallH = 2.2;
  const edge = (x0, z0, x1, z1) => {
    world.addBox(x0, 0, z0, x1, wallH, z1, { tag: 'wall' });
    batch.addBox({ x: x0, y: 0, z: z0 }, { x: x1, y: wallH, z: z1 }, alpine
      ? { side: 'plain', top: 'plain', color: SNOW } // (a bank of snow)
      : { side: 'concrete', top: 'concrete', color: 0x9a9a9a, uvScale: [4, 4], topScale: [4, 4] });
  };
  edge(outer - wallT, outer - wallT, outerMax + wallT, outer);
  edge(outer - wallT, outerMax, outerMax + wallT, outerMax + wallT);
  edge(outer - wallT, outer, outer, outerMax);
  edge(outerMax, outer, outerMax + wallT, outerMax);
  // Hazard stripes on top of the wall so you can see it at night
  // Filler skyline outside the wall (visual only: no collision, so these must
  // never end up inside the city, or you'd drive straight through them)
  for (let i = 0; i < (alpine ? 0 : 70); i++) {
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

  // Alpine: a pine forest outside the wall and mountains all round (visual only)
  const forest = [];
  if (alpine) {
    for (let i = 0; i < 420; i++) {
      const a = rng() * Math.PI * 2, r = outerMax + wallT + rng.range(6, 120);
      let x = Math.cos(a) * r, z = Math.sin(a) * r;
      const m = Math.max(Math.abs(x), Math.abs(z)), need = outerMax + wallT + 4;
      if (m < need) { x *= need / m; z *= need / m; }
      forest.push([x, z, rng.range(1.1, 2.2)]);
    }
    group.add(buildMountains(rng, outerMax));
  }

  // --- Blocks ------------------------------------------------------------
  const blockKinds = [];
  for (let i = 0; i < blocks; i++) {
    for (let j = 0; j < blocks; j++) {
      const r = rng();
      blockKinds.push(r < parkShare ? 'park' : r < 0.2 + parkShare ? 'alley' : r < 0.42 + parkShare ? 'garage' : 'buildings');
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
  // Spread the parks out: never two parks next to each other (not even
  // corner to corner); a park that is gets moved somewhere on its own.
  {
    const spread = makeRng(seed * 3 + 17);
    const at = (i, j) => (i >= 0 && j >= 0 && i < blocks && j < blocks ? blockKinds[i * blocks + j] : null);
    const lonely = (i, j) => { for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) if ((di || dj) && at(i + di, j + dj) === 'park') return false; return true; };
    let moved = 0;
    for (let i = 0; i < blocks; i++) for (let j = 0; j < blocks; j++) {
      if (at(i, j) === 'park' && !lonely(i, j)) { blockKinds[i * blocks + j] = 'buildings'; moved++; }
    }
    for (let tries = 0; moved > 0 && tries < 400; tries++) {
      const i = Math.floor(spread() * blocks), j = Math.floor(spread() * blocks);
      if (at(i, j) === 'buildings' && lonely(i, j)) { blockKinds[i * blocks + j] = 'park'; moved--; }
    }
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
        addKerbs(x0, z0, x1, z1, { west: [[z0 + 14, z1 - 14]] }); // (keep the door clear)
        continue;
      }
      // Sidewalk slab (visual only - too low to block the car)
      batch.addBox({ x: x0, y: 0, z: z0 }, { x: x1, y: 0.15, z: z1 },
        { side: 'concrete', top: 'concrete', color: 0x70707a, uvScale: [3, 3], topScale: [3, 3] });
      if (alpine) banks.push([x0, z0, x1, z1]);

      const ix0 = x0 + SIDEWALK, ix1 = x1 - SIDEWALK, iz0 = z0 + SIDEWALK, iz1 = z1 - SIDEWALK;
      if (kind === 'garage') {
        makeGarage(x0, z0, x1, z1, ix0, iz0, ix1, iz1);
        const cz = (z0 + z1) / 2;
        addKerbs(x0, z0, x1, z1, { west: [[cz - 11, cz + 11]] }); // (keep the way in clear)
        continue;
      }
      if (kind === 'alley') {
        // Split the block in two with a 7 m alley running through it.
        const alongX = rng() < 0.5;
        const w = 7;
        if (alongX) {
          const mz = (z0 + z1) / 2 + rng.range(-6, 6);
          addKerbs(x0, z0, x1, z1, { west: [[mz - 6, mz + 6]], east: [[mz - 6, mz + 6]] });
          fillBuildings(ix0, iz0, ix1, mz - w / 2);
          fillBuildings(ix0, mz + w / 2, ix1, iz1);
          alleys.push({ x0, x1, z0: mz - w / 2, z1: mz + w / 2 });
          batch.addBox({ x: x0, y: 0.01, z: mz - w / 2 }, { x: x1, y: 0.02, z: mz + w / 2 }, { side: null, top: 'asphalt', color: 0x777777, topScale: [6, 6] });
        } else {
          const mx = (x0 + x1) / 2 + rng.range(-6, 6);
          addKerbs(x0, z0, x1, z1, { north: [[mx - 6, mx + 6]], south: [[mx - 6, mx + 6]] });
          fillBuildings(ix0, iz0, mx - w / 2, iz1);
          fillBuildings(mx + w / 2, iz0, ix1, iz1);
          alleys.push({ x0: mx - w / 2, x1: mx + w / 2, z0, z1 });
          batch.addBox({ x: mx - w / 2, y: 0.01, z: z0 }, { x: mx + w / 2, y: 0.02, z: z1 }, { side: null, top: 'asphalt', color: 0x777777, topScale: [6, 6] });
        }
      } else {
        // Some blocks: a row of small shops round the edge, the tall buildings in the middle
        if (!alpine && shopRng() < 0.4) shopRows(ix0, iz0, ix1, iz1);
        else fillBuildings(ix0, iz0, ix1, iz1);
        addKerbs(x0, z0, x1, z1, {});
      }
    }
  }

  /**
   * The four pavement edges of a block, for the street life (people walking,
   * parked cars, bins and benches). `a`-`b` runs along the kerb, `n` points
   * out to the road; `keepClear` lists stretches (along the side, in world
   * x or z) where nothing may be parked or put down (alley mouths, doors).
   */
  function addKerbs(x0, z0, x1, z1, clear) {
    kerbs.push(
      { a: [x0, z0], b: [x1, z0], n: [0, -1], keepClear: clear.north || [] },
      { a: [x0, z1], b: [x1, z1], n: [0, 1], keepClear: clear.south || [] },
      { a: [x0, z0], b: [x0, z1], n: [-1, 0], keepClear: clear.west || [] },
      { a: [x1, z0], b: [x1, z1], n: [1, 0], keepClear: clear.east || [] },
    );
  }

  /**
   * Harbor City: little one-storey shops (rooms behind the glass, awnings,
   * a lit sign band) round the edge of a block, with the big buildings in
   * the middle behind them.
   */
  function shopRows(x0, z0, x1, z1) {
    const D = 10, H = 5.2;
    const rows = [
      [x0, x1, z0, [0, -1]], [x0, x1, z1, [0, 1]], [z0 + D, z1 - D, x0, [-1, 0]], [z0 + D, z1 - D, x1, [1, 0]],
    ];
    for (const [a0, a1, f, [nx, nz]] of rows) {
      const count = Math.max(1, Math.round((a1 - a0) / (8 + shopRng() * 3)));
      for (let k = 0; k < count; k++) {
        const s0 = a0 + ((a1 - a0) * k) / count, s1 = a0 + ((a1 - a0) * (k + 1)) / count;
        const r = nz ? (nz < 0 ? [s0, f, s1, f + D] : [s0, f - D, s1, f]) : (nx < 0 ? [f, s0, f + D, s1] : [f - D, s0, f, s1]);
        const h = H + shopRng() * 0.8;
        world.addBox(r[0], 0, r[1], r[2], h, r[3], { tag: 'building' });
        batch.addBox({ x: r[0], y: 0, z: r[1] }, { x: r[2], y: h, z: r[3] }, { side: 'plain', top: 'roof', color: SHOP_TINTS[Math.floor(shopRng() * SHOP_TINTS.length)], topScale: [6, 6] });
        // a parapet along the front
        const fx = nx ? f : (s0 + s1) / 2, fz = nz ? f : (s0 + s1) / 2;
        batch.addBlock(fx, h, fz, nx ? 0.3 : s1 - s0, 0.6, nz ? 0.3 : s1 - s0, { side: 'concrete', top: 'concrete', color: 0xb8b2a6 });
        shops.add({ x: fx, z: fz, nx, nz, width: s1 - s0 - 1.2, seed: shopRng(), awning: shopRng() < 0.7 });
        minimapShapes.push({ type: 'building', x0: r[0], z0: r[1], x1: r[2], z1: r[3] });
      }
    }
    fillBuildings(x0 + D + 1.5, z0 + D + 1.5, x1 - D - 1.5, z1 - D - 1.5);
  }

  function fillBuildings(x0, z0, x1, z1) {
    // Split an area into 1-3 x 1-3 buildings, tightly packed.
    const cols = (x1 - x0) > 30 ? rng.int(1, 3) : 1;
    const rows = (z1 - z0) > 30 ? rng.int(1, 3) : 1;
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const bx0 = x0 + ((x1 - x0) * c) / cols, bx1 = x0 + ((x1 - x0) * (c + 1)) / cols;
        const bz0 = z0 + ((z1 - z0) * r) / rows, bz1 = z0 + ((z1 - z0) * (r + 1)) / rows;
        const h = alpine ? rng.range(6, 10.5) : rng() < 0.15 ? rng.range(40, 75) : rng.range(12, 34);
        world.addBox(bx0, 0, bz0, bx1, h, bz1, { tag: 'building' });
        batch.addBox({ x: bx0, y: 0, z: bz0 }, { x: bx1, y: h, z: bz1 },
          { side: 'wall', top: 'roof', color: rng.pick(alpine ? ALPINE_TINTS : WALL_TINTS), uvScale: FACADE_UV, uvOffset: [rng(), Math.floor(rng() * 8) / 8], topScale: [6, 6] });
        if (alpine) {
          roofs.push([bx0, bz0, bx1, bz1, h]);
          if (rng() < 0.5) { // a stone chimney
            const cx = rng.range(bx0 + 2, bx1 - 2), cz = rng.range(bz0 + 2, bz1 - 2);
            const chH = Math.min(bx1 - bx0, bz1 - bz0) * 0.45 + 1.5;
            batch.addBlock(cx, h, cz, 1.2, chH, 1.2, { side: 'concrete', top: 'plain', color: 0x7a7470, uvScale: [1, 2] });
            chimneys.push([cx, h + chH, cz]);
          }
        }
        // (The old glowing shop band drew two random numbers here: keep drawing
        // them so every city is laid out exactly as before. Shops come later.)
        if (rng() < (alpine ? 0.4 : 0.5)) rng.pick(alpine ? [0, 0, 0] : [0, 0, 0, 0, 0]);
        if (!alpine) dressBuilding(bx0, bz0, bx1, bz1, h);
        buildingsList.push({ x0: bx0, x1: bx1, z0: bz0, z1: bz1, h });
        minimapShapes.push({ type: 'building', x0: bx0, z0: bz0, x1: bx1, z1: bz1 });
      }
    }
  }

  /**
   * Harbor City: make a plain box look like a building. A cornice round the
   * top, a ledge over the shop floor, and things on the roof: water tanks,
   * air-con units, and on the towers a stepped crown with an aerial and a
   * red warning light.
   */
  function dressBuilding(x0, z0, x1, z1, h) {
    const trim = { side: 'concrete', top: 'concrete', color: 0xb8b2a6, uvScale: [2, 1], topScale: [2, 2] };
    const ring = (y0, y1, o, i, look) => {
      batch.addBox({ x: x0 - o, y: y0, z: z0 - o }, { x: x1 + o, y: y1, z: z0 + i }, look);
      batch.addBox({ x: x0 - o, y: y0, z: z1 - i }, { x: x1 + o, y: y1, z: z1 + o }, look);
      batch.addBox({ x: x0 - o, y: y0, z: z0 + i }, { x: x0 + i, y: y1, z: z1 - i }, look);
      batch.addBox({ x: x1 - i, y: y0, z: z0 + i }, { x: x1 + o, y: y1, z: z1 - i }, look);
    };
    ring(h - 0.5, h + 0.35, 0.3, 0.45, trim);   // cornice and parapet
    if (h > 10) ring(4.05, 4.3, 0.18, 0.1, trim); // ledge over the shops
    if (h > 26 && drng() < 0.6) ring(h * 0.62, h * 0.62 + 0.3, 0.15, 0.1, trim); // a band higher up
    const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    if (h > 40) {
      // A stepped crown, an aerial and its warning light
      batch.addBlock(cx, h, cz, w * 0.62, 5, d * 0.62, { side: 'wall', top: 'roof', color: 0x8a8f9c, uvScale: FACADE_UV, topScale: [3, 3] });
      batch.addBlock(cx, h + 5, cz, w * 0.3, 3, d * 0.3, { side: 'concrete', top: 'concrete', color: 0x9a968e });
      batch.addBlock(cx, h + 8, cz, 0.25, 9, 0.25, { side: 'plain', top: 'plain', color: 0x3a3c40 });
      beacons.push([cx, h + 17.2, cz]);
      return;
    }
    // Roof clutter (kept away from the edges)
    if (w > 9 && d > 9 && drng() < 0.45) tanks.push([drng.range(x0 + 3, x1 - 3), h, drng.range(z0 + 3, z1 - 3), drng.range(0.8, 1.15)]);
    for (let k = drng.int(0, 3); k > 0; k--) {
      batch.addBlock(drng.range(x0 + 2, x1 - 2), h, drng.range(z0 + 2, z1 - 2), drng.range(1.2, 2.2), drng.range(0.8, 1.3), drng.range(1, 1.6),
        { side: 'metal', top: 'metal', color: 0x9aa0a8, uvScale: [1, 1] });
    }
    if (drng() < 0.4) batch.addBlock(drng.range(x0 + 2, x1 - 2), h, drng.range(z0 + 2, z1 - 2), 2.4, 2.4, 2.4, { side: 'concrete', top: 'concrete', color: 0x8a8680 }); // stair hut
  }

  /**
   * A parking garage on the block's west side: open at the front (facing the
   * road), walls on the other three sides and a roof. Buildings fill the rest.
   */
  function makeGarage(x0, z0, x1, z1, ix0, iz0, ix1, iz1) {
    const depth = 22, half = 8, H = 5, t = 0.6;
    const cz = (z0 + z1) / 2;
    const gx1 = x0 + depth;
    const look = alpine ? { side: 'plain', top: 'plain', color: 0x6b5236 } // (a big wooden barn)
      : { side: 'concrete', top: 'concrete', color: 0x8c8c90, uvScale: [3, 3], topScale: [3, 3] };
    const solid = (ax0, ay0, az0, ax1, ay1, az1, lk = look) => {
      world.addBox(ax0, ay0, az0, ax1, ay1, az1, { tag: 'building' });
      batch.addBox({ x: ax0, y: ay0, z: az0 }, { x: ax1, y: ay1, z: az1 }, lk);
    };
    solid(x0 + 1, 0, cz - half - t, gx1, H, cz - half);      // north wall
    solid(x0 + 1, 0, cz + half, gx1, H, cz + half + t);      // south wall
    solid(gx1 - t, 0, cz - half, gx1, H, cz + half);         // back wall
    // Roof and two more parking decks above (visual; too high for the car)
    solid(x0 + 1, H, cz - half - t, gx1, H + 0.5, cz + half + t);
    const deckTop = alpine ? H * 1.6 : H * 3;
    batch.addBox({ x: x0 + 1, y: H + 0.5, z: cz - half - t }, { x: gx1, y: deckTop, z: cz + half + t },
      { side: 'wall', top: 'roof', color: alpine ? 0x7a5236 : 0x77777c, uvScale: FACADE_UV, topScale: [4, 4] });
    world.addBox(x0 + 1, H + 0.5, cz - half - t, gx1, deckTop, cz + half + t, { tag: 'building' });
    if (alpine) roofs.push([x0 + 1, cz - half - t, gx1, cz + half + t, deckTop]);
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
      { side: 'plain', top: 'plain', color: alpine ? SNOW : 0x1d3a22 });
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
    if (alpine) roofs.push([wx0, wz0, wx1, wz1, L.height]);
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
  const elZ = alpine ? 1e6 : roadC(elK); // (no railway in the mountains)
  const EL_HALF = 6.5, EL_Y = 8;
  if (!alpine) {
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
  }

  // Where the street lamps stand (world x, z), so nothing is parked on them.
  // The lamps on the Z roads are the same set turned 90 degrees (buildLamps).
  const lampSpots = [];
  for (const [x, z] of lamps) lampSpots.push([x, z], [z, -x]);

  // --- Shop fronts with rooms behind the glass, on the street faces ----------
  const _q = [];
  const isOpen = (x, z) => !world.query(x - 0.1, 0.5, z - 0.1, x + 0.1, 1.5, z + 0.1, _q).length
    && !garages.some((g) => x > g.x0 - 1 && x < g.x1 + 1 && z > g.z0 - 1 && z < g.z1 + 1);
  // (Frostvale's chalets are small: they get shop fronts at street level. In
  // Harbor City the shops are their own little buildings: see shopRows.)
  if (alpine) addShopsToBuildings(shops, buildingsList, isOpen, { chance: 0.55 }, makeRng(seed * 31 + 7)); // (own random numbers)
  group.add(shops.build());
  // Frostvale: wooden balconies over the street
  if (alpine) {
    const wood = { side: 'plain', top: 'plain', color: 0x5a3e28 }, snowTop = { side: 'plain', top: 'plain', color: SNOW };
    for (const b of buildingsList) {
      if (b.h < 7.5) continue;
      for (const [nx, nz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        if (drng() > 0.35) continue;
        const alongX = nz !== 0, len = alongX ? b.x1 - b.x0 : b.z1 - b.z0;
        if (len < 8) continue;
        const fx = nx < 0 ? b.x0 : nx > 0 ? b.x1 : (b.x0 + b.x1) / 2, fz = nz < 0 ? b.z0 : nz > 0 ? b.z1 : (b.z0 + b.z1) / 2;
        if (!isOpen(fx + nx * 1.2, fz + nz * 1.2)) continue;
        const half = len * 0.3, y = 4.4, dep = 1.1;
        const span = (o0, o1, y0, y1, look) => alongX
          ? batch2.addBox({ x: fx - half, y: y0, z: Math.min(fz + nz * o0, fz + nz * o1) }, { x: fx + half, y: y1, z: Math.max(fz + nz * o0, fz + nz * o1) }, look)
          : batch2.addBox({ x: Math.min(fx + nx * o0, fx + nx * o1), y: y0, z: fz - half }, { x: Math.max(fx + nx * o0, fx + nx * o1), y: y1, z: fz + half }, look);
        span(0, dep, y, y + 0.18, wood);              // the floor
        span(dep - 0.08, dep, y + 0.18, y + 1.05, wood); // the railing (solid boards)
        span(dep - 0.12, dep + 0.04, y + 1.05, y + 1.18, snowTop); // snow on the rail
      }
    }
  }
  // Water tanks on the roofs (instanced) and red lights on the towers
  if (tanks.length) {
    const body = new THREE.CylinderGeometry(1.3, 1.3, 2.6, 12); body.translate(0, 2.9, 0);
    const cap = new THREE.ConeGeometry(1.42, 0.9, 12); cap.translate(0, 4.65, 0);
    const legs = mergeGeometries([[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]].map(([x, z]) => new THREE.BoxGeometry(0.16, 1.6, 0.16).translate(x, 0.8, z)), false);
    const meshes = [
      new THREE.InstancedMesh(body, new THREE.MeshLambertMaterial({ color: 0x7a5a3e }), tanks.length),
      new THREE.InstancedMesh(cap, new THREE.MeshLambertMaterial({ color: 0x3a3c40 }), tanks.length),
      new THREE.InstancedMesh(legs, new THREE.MeshLambertMaterial({ color: 0x2a2c30 }), tanks.length),
    ];
    const m = new THREE.Matrix4();
    tanks.forEach(([x, y, z, sc], i) => { m.makeScale(sc, sc, sc).setPosition(x, y, z); for (const im of meshes) im.setMatrixAt(i, m); });
    for (const im of meshes) { im.castShadow = true; group.add(im); }
  }
  if (beacons.length) {
    const red = new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0xff2020, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    for (const [x, y, z] of beacons) {
      const sp = new THREE.Sprite(red);
      sp.position.set(x, y, z);
      sp.scale.setScalar(3);
      group.add(sp);
    }
  }

  // --- Build batched meshes ------------------------------------------------
  group.add(batch.build(mats));
  group.add(buildRampMeshes(ramps));
  group.add(buildTrees(trees, alpine));
  if (alpine) {
    group.add(buildTrees(forest, true));
    group.add(buildRoofs(roofs));
    // Snowbanks along the kerbs (low, visual only), broken at the corners
    for (const [x0, z0, x1, z1] of banks) {
      const look = { side: 'plain', top: 'plain', color: SNOW };
      batch2.addBox({ x: x0 + 4, y: 0.15, z: z0 + 0.1 }, { x: x1 - 4, y: 0.6, z: z0 + 0.9 }, look);
      batch2.addBox({ x: x0 + 4, y: 0.15, z: z1 - 0.9 }, { x: x1 - 4, y: 0.6, z: z1 - 0.1 }, look);
      batch2.addBox({ x: x0 + 0.1, y: 0.15, z: z0 + 4 }, { x: x0 + 0.9, y: 0.6, z: z1 - 4 }, look);
      batch2.addBox({ x: x1 - 0.9, y: 0.15, z: z0 + 4 }, { x: x1 - 0.1, y: 0.6, z: z1 - 4 }, look);
    }
    group.add(batch2.build(mats));
  }
  group.add(buildLamps(lamps));
  const trafficLights = new TrafficLights(graph, ROAD);
  group.add(trafficLights.group);

  // Neon signs on some buildings facing the road
  const signGroup = new THREE.Group();
  const signTex = (alpine
    ? [['SKI HIRE', '#39e6ff'], ['HOTEL', '#ffb020'], ['CAFE', '#ff9ad5'], ['BAKERY', '#ffd070'], ['FONDUE', '#ff8a3d'], ['LIFT PASS', '#7dff8a']]
    : [['THE ANCHOR', '#ffb020'], ['MOTEL', '#ff3fa4'], ['DINER', '#2fe0ff'], ['PAWN', '#4dffa6'], ['BAR', '#ff5a3a'], ['GARAGE', '#c070ff']])
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

  const train = alpine ? { group: new THREE.Group(), update() {} } : new ElevatedTrain(outer, outerMax, elZ + 2.8, EL_Y + 1.35);
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
    chimneys,
    kerbs, lampSpots, alpine, elZ, sidewalk: SIDEWALK,
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

function buildTrees(trees, alpine = false) {
  const g = new THREE.Group();
  if (!trees.length) return g;
  if (alpine) {
    // Snowy pines: a trunk, two layers of branches and snow on the top
    const trunk = new THREE.CylinderGeometry(0.2, 0.28, 2, 6); trunk.translate(0, 1, 0);
    const low = new THREE.ConeGeometry(2.0, 3.4, 7); low.translate(0, 3.2, 0);
    const high = new THREE.ConeGeometry(1.45, 2.8, 7); high.translate(0, 5.0, 0);
    const snow = new THREE.ConeGeometry(0.75, 1.3, 7); snow.translate(0, 6.0, 0);
    const branches = mergeGeometries([low, high], false);
    const meshes = [
      new THREE.InstancedMesh(trunk, new THREE.MeshLambertMaterial({ color: 0x3a2a1c }), trees.length),
      new THREE.InstancedMesh(branches, new THREE.MeshLambertMaterial({ color: 0x1c3a2a, flatShading: true }), trees.length),
      new THREE.InstancedMesh(snow, new THREE.MeshLambertMaterial({ color: 0xf0f4f8, flatShading: true }), trees.length),
    ];
    const m = new THREE.Matrix4();
    trees.forEach(([x, z, s], i) => { m.makeScale(s, s, s).setPosition(x, 0, z); for (const im of meshes) im.setMatrixAt(i, m); });
    for (const im of meshes) { im.castShadow = true; g.add(im); }
    return g;
  }
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
  // Soft beams of light under each lamp (only in rain and snow at night)
  const shaftGeo = lampShaftGeometry(6.7, 0.28, 3.4);
  shaftGeo.translate(0, 6.8, 2.0);
  const shafts = new THREE.InstancedMesh(shaftGeo, makeShaftMaterial(0xffb060, 0.32), n);
  const m = new THREE.Matrix4();
  lamps.forEach(([x, z, facing], i) => {
    // Lamps along X-roads lean over the road toward +Z or -Z
    m.makeRotationY(facing > 0 ? 0 : Math.PI).setPosition(x, 0, z);
    poles.setMatrixAt(i, m);
    arms.setMatrixAt(i, m);
    heads.setMatrixAt(i, m);
    pools.setMatrixAt(i, m);
    shafts.setMatrixAt(i, m);
  });
  g.add(poles, arms, heads, pools, shafts);
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

/** Alpine: pitched roofs with snow on them (the gable ends are wood). */
function buildRoofs(roofs) {
  const pos = [], col = [];
  const snow = new THREE.Color(0xf2f6fa), wood = new THREE.Color(0x5a3e28), eave = new THREE.Color(0x3a2a1c);
  const tri = (a, b, c, color) => { pos.push(...a, ...b, ...c); for (let i = 0; i < 3; i++) col.push(color.r, color.g, color.b); };
  const quad = (a, b, c, d, color) => { tri(a, b, c, color); tri(a, c, d, color); };
  for (const [bx0, bz0, bx1, bz1, h] of roofs) {
    const o = 0.7, x0 = bx0 - o, x1 = bx1 + o, z0 = bz0 - o, z1 = bz1 + o;
    const alongX = (bx1 - bx0) >= (bz1 - bz0);
    const rise = Math.min(5, Math.min(bx1 - bx0, bz1 - bz0) * 0.38);
    const y = h, top = h + rise;
    if (alongX) {
      const zm = (z0 + z1) / 2;
      quad([x0, y, z0], [x0, top, zm], [x1, top, zm], [x1, y, z0], snow);  // north slope
      quad([x1, y, z1], [x1, top, zm], [x0, top, zm], [x0, y, z1], snow);  // south slope
      tri([x0, y, z1], [x0, top, zm], [x0, y, z0], wood);                   // gables
      tri([x1, y, z0], [x1, top, zm], [x1, y, z1], wood);
    } else {
      const xm = (x0 + x1) / 2;
      quad([x1, y, z0], [xm, top, z0], [xm, top, z1], [x1, y, z1], snow);
      quad([x0, y, z1], [xm, top, z1], [xm, top, z0], [x0, y, z0], snow);
      tri([x0, y, z0], [xm, top, z0], [x1, y, z0], wood);
      tri([x1, y, z1], [xm, top, z1], [x0, y, z1], wood);
    }
    quad([x0, y - 0.25, z0], [x1, y - 0.25, z0], [x1, y - 0.25, z1], [x0, y - 0.25, z1], eave); // underside of the eaves
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

/** Alpine: rocky mountains with snowy tops all round the town (visual only). */
function buildMountains(rng, outerMax) {
  const rockGeo = new THREE.ConeGeometry(1, 1, 7); rockGeo.translate(0, 0.5, 0);
  const capGeo = new THREE.ConeGeometry(0.43, 0.43, 7); capGeo.translate(0, 1 - 0.43 / 2 + 0.003, 0);
  const n = 26;
  const rock = new THREE.InstancedMesh(rockGeo, new THREE.MeshLambertMaterial({ color: 0x55606e, flatShading: true }), n);
  const cap = new THREE.InstancedMesh(capGeo, new THREE.MeshLambertMaterial({ color: 0xf2f6fa, flatShading: true }), n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng.range(-0.1, 0.1);
    const r = rng.range(90, 170), h = rng.range(110, 230);
    const d = outerMax * 1.42 + r * 0.7 + rng.range(20, 110);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * 6.3);
    m.compose(p.set(Math.cos(a) * d, -2, Math.sin(a) * d), q, sc.set(r, h, r));
    rock.setMatrixAt(i, m);
    cap.setMatrixAt(i, m);
  }
  const g = new THREE.Group();
  g.add(rock, cap);
  return g;
}

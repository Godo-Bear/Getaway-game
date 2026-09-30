import * as THREE from 'three';
import { RooftopKit } from '../world/rooftopKit.js';
import { makeGlowMaterial } from '../world/materials.js';

// Your own levels (the Level Editor).
//
// A level is a square grid of cells seen from above. Each cell has a height:
//   0 = street, 1 = a low wall (1 m, vault over it), 2-9 = a building, each
//   step 2.5 m taller than the last (so you can always climb one step up).
// Plus a start, a finish, cash bags, zip lines (roof to roof), gliders
// (pick one up to glide: jump again in mid-air and hold), beams to walk
// across between buildings, and parkour pieces on single squares: ducts to
// slide under, crates to climb, stairwell huts and water towers to hide in
// from the helicopter, gold bar stacks, and red lasers you crouch under.
// The floor can be street, water, grass, sand, vault floor or casino carpet,
// and the world around the map can be city or open ocean (an island). Plus an optional
// police helicopter and a time of day.
//
// SHARE CODES: the level as compact JSON (runs of equal cells squashed),
// then base64. "GW1-..." - paste it into the editor to play a friend's level.

export const GRID = 32;          // cells per side
export const CELL = 3;           // metres per cell
export const MAX_CASH = 20;
export const MAX_ZIPS = 6;
export const MAX_GLIDERS = 6;
export const MAX_BEAMS = 12;
export const MAX_PROPS = 60;
/** Parkour pieces that sit on one square (on a roof or the street). */
export const PROP_TYPES = ['duct', 'crate', 'hut', 'tower', 'gold', 'laser'];
/**
 * What the ground is made of, square by square (under buildings it doesn't
 * matter). Water is real: fall in and you're sent back to dry land.
 */
export const FLOORS = ['street', 'water', 'grass', 'sand', 'vault', 'carpet'];
const FLOOR_LOOK = {
  street: { side: 'concrete', top: 'asphalt', color: 0xffffff, topScale: [4, 4] },
  grass: { side: 'plain', top: 'plain', color: 0x3f7a3a },
  sand: { side: 'plain', top: 'plain', color: 0xa88c58 },
  vault: { side: 'plain', top: 'plain', color: 0x7f8896 },
  carpet: { side: 'plain', top: 'plain', color: 0x6a1f3a },
};
const PREFIX = 'GW1-';

/** Height of a cell value, in metres. */
export const cellHeight = (v) => (v <= 0 ? 0 : v === 1 ? 1 : (v - 1) * 2.5);
/** World position of a cell's centre. */
export const cellPos = (i, j) => [(i - GRID / 2 + 0.5) * CELL, (j - GRID / 2 + 0.5) * CELL];

/** A small starter level: a row of roofs to run across. */
export function newLevel(name = 'My level') {
  const cells = new Array(GRID * GRID).fill(0);
  const rect = (i0, j0, i1, j1, v) => { for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) cells[j * GRID + i] = v; };
  rect(4, 13, 8, 18, 3);
  rect(10, 13, 14, 18, 4);
  rect(16, 12, 20, 19, 4);
  rect(22, 13, 26, 18, 5);
  rect(12, 21, 13, 21, 1);
  return { v: 1, name, cells, start: [5, 15], finish: [25, 15], cash: [[12, 15], [18, 16]], zips: [], gliders: [], beams: [], props: [], floor: new Array(GRID * GRID).fill(0), outside: 'city', heli: false, time: 'night' };
}

// ------------------------------------------------------------------ share codes
/** Run-length: "3x12" = twelve cells of 3; single cells stay as a digit */
function rle(arr) {
  const runs = [];
  for (let k = 0; k < arr.length;) {
    let n = 1;
    while (k + n < arr.length && arr[k + n] === arr[k]) n++;
    runs.push(n > 1 ? `${arr[k]}x${n}` : `${arr[k]}`);
    k += n;
  }
  return runs.join('.');
}
function unrle(str, max) {
  const out = [];
  for (const r of String(str || '').split('.')) {
    const [v, n = '1'] = r.split('x');
    const val = Math.max(0, Math.min(max, parseInt(v, 10) || 0)), cnt = Math.min(GRID * GRID, parseInt(n, 10) || 1);
    for (let k = 0; k < cnt && out.length < GRID * GRID; k++) out.push(val);
  }
  while (out.length < GRID * GRID) out.push(0);
  return out;
}

export function encodeLevel(L) {
  const floor = L.floor && L.floor.some((x) => x) ? rle(L.floor) : undefined;
  const json = JSON.stringify({ v: 1, n: L.name.slice(0, 40), c: rle(L.cells), fl: floor, o: L.outside === 'ocean' ? 'ocean' : undefined, s: L.start, f: L.finish, $: L.cash, z: L.zips, g: L.gliders || [], b: L.beams || [], p: L.props || [], h: L.heli ? 1 : 0, t: L.time });
  const b64 = btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return PREFIX + b64;
}

/** @returns {object|null} the level, or null if the code isn't a valid level */
export function decodeLevel(code) {
  try {
    const s = String(code).trim().replace(/\s+/g, '');
    if (!s.startsWith(PREFIX)) return null;
    let b64 = s.slice(PREFIX.length).replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const o = JSON.parse(decodeURIComponent(escape(atob(b64))));
    const cells = unrle(o.c, 9);
    const floor = unrle(o.fl, FLOORS.length - 1);
    const cellOk = (p) => Array.isArray(p) && p.length >= 2 && p.every((x) => Number.isInteger(x) && x >= 0 && x < GRID);
    return {
      v: 1, name: String(o.n || 'Shared level').slice(0, 40), cells, floor, outside: o.o === 'ocean' ? 'ocean' : 'city',
      start: cellOk(o.s) ? o.s : [1, 1], finish: cellOk(o.f) ? o.f : [GRID - 2, GRID - 2],
      cash: (Array.isArray(o.$) ? o.$ : []).filter(cellOk).slice(0, MAX_CASH),
      zips: (Array.isArray(o.z) ? o.z : []).filter((z) => cellOk(z.slice(0, 2)) && cellOk(z.slice(2, 4))).slice(0, MAX_ZIPS),
      gliders: (Array.isArray(o.g) ? o.g : []).filter(cellOk).slice(0, MAX_GLIDERS),
      beams: (Array.isArray(o.b) ? o.b : []).filter((b) => cellOk(b.slice(0, 2)) && cellOk(b.slice(2, 4)) && (b[0] === b[2] || b[1] === b[3])).slice(0, MAX_BEAMS),
      props: (Array.isArray(o.p) ? o.p : []).filter((p) => cellOk(p.slice(0, 2)) && PROP_TYPES.includes(p[2])).slice(0, MAX_PROPS),
      heli: !!o.h, time: ['night', 'dawn', 'day', 'dusk'].includes(o.t) ? o.t : 'night',
    };
  } catch {
    return null;
  }
}

/** Walking height of a beam between two roofs (at most 2.2 m to climb at either end). */
export function beamHeight(ha, hb) {
  const low = Math.min(ha, hb), high = Math.max(ha, hb);
  let y = Math.max(low, high - 2.2);
  if (y - low > 2.2) y = (low + high) / 2;
  return Math.max(0.3, y);
}

/** A short id for a level's layout (best times are saved per layout). */
export function levelId(L) {
  const s = encodeLevel({ ...L, name: '' });
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// ------------------------------------------------------------------ building it
/**
 * Turn a level into a playable on-foot level (same shape as the story levels).
 */
export function buildCustomLevel(L) {
  const kit = new RooftopKit({ seed: 4242 });
  const half = (GRID / 2) * CELL;
  const floorOf = (i, j) => FLOORS[(L.floor || [])[j * GRID + i] || 0];
  // Around the map: city streets, or open ocean (your map is an island)
  const far = half + 150;
  if (L.outside === 'ocean') {
    kit.water(-far - 200, -far - 200, far + 200, far + 200);
  } else {
    kit.street(-far, -far, far, -half);
    kit.street(-far, half, far, far);
    kit.street(-far, -half, -half, half);
    kit.street(half, -half, far, half);
  }
  // The map's own floor, merged into rectangles of the same kind
  const fdone = new Uint8Array(GRID * GRID);
  const fv = (i, j) => (L.floor || [])[j * GRID + i] || 0;
  let hasWater = false;
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      if (fdone[j * GRID + i]) continue;
      const kind = fv(i, j);
      let w = 1;
      while (i + w < GRID && fv(i + w, j) === kind && !fdone[j * GRID + i + w]) w++;
      let d = 1;
      fgrow: while (j + d < GRID) {
        for (let k = 0; k < w; k++) if (fv(i + k, j + d) !== kind || fdone[(j + d) * GRID + i + k]) break fgrow;
        d++;
      }
      for (let jj = j; jj < j + d; jj++) for (let ii = i; ii < i + w; ii++) fdone[jj * GRID + ii] = 1;
      const x0 = (i - GRID / 2) * CELL, z0 = (j - GRID / 2) * CELL, x1 = x0 + w * CELL, z1 = z0 + d * CELL;
      const name = FLOORS[kind];
      if (name === 'water') { hasWater = true; if (L.outside !== 'ocean') kit.water(x0, z0, x1, z1); continue; }
      kit.world.addBox(x0, -2, z0, x1, 0, z1, { tag: 'street' });
      kit.batch.addBox({ x: x0, y: -0.5, z: z0 }, { x: x1, y: 0, z: z1 }, FLOOR_LOOK[name]);
    }
  }
  // Bright water surface on top of the dark harbour water, so it reads as water
  if (hasWater || L.outside === 'ocean') {
    const sea = { side: null, top: 'glow', color: 0x14507e };
    if (L.outside === 'ocean') kit.batch.addBox({ x: -far - 200, y: -0.32, z: -far - 200 }, { x: far + 200, y: -0.3, z: far + 200 }, sea);
    else for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) if (floorOf(i, j) === 'water') {
      const x0 = (i - GRID / 2) * CELL, z0 = (j - GRID / 2) * CELL;
      kit.batch.addBox({ x: x0, y: -0.32, z: z0 }, { x: x0 + CELL, y: -0.3, z: z0 + CELL }, sea);
    }
  }
  // A low kerb round the edge of the map, so it reads as "the level"
  const kerb = { side: 'plain', top: 'plain', color: 0xffb020 };
  kit.batch.addBox({ x: -half - 0.3, y: 0, z: -half - 0.3 }, { x: half + 0.3, y: 0.06, z: -half }, kerb);
  kit.batch.addBox({ x: -half - 0.3, y: 0, z: half }, { x: half + 0.3, y: 0.06, z: half + 0.3 }, kerb);
  kit.batch.addBox({ x: -half - 0.3, y: 0, z: -half }, { x: -half, y: 0.06, z: half }, kerb);
  kit.batch.addBox({ x: half, y: 0, z: -half }, { x: half + 0.3, y: 0.06, z: half }, kerb);

  // Merge equal cells into rectangles (fewer, bigger buildings)
  const v = (i, j) => L.cells[j * GRID + i];
  const done = new Uint8Array(GRID * GRID);
  const tints = [0x9a8f86, 0x8a93a0, 0xa08a78, 0x7f8a7a, 0x9c9aa6];
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const val = v(i, j);
      if (!val || done[j * GRID + i]) continue;
      let w = 1;
      while (i + w < GRID && v(i + w, j) === val && !done[j * GRID + i + w]) w++;
      let d = 1;
      grow: while (j + d < GRID) {
        for (let k = 0; k < w; k++) if (v(i + k, j + d) !== val || done[(j + d) * GRID + i + k]) break grow;
        d++;
      }
      for (let jj = j; jj < j + d; jj++) for (let ii = i; ii < i + w; ii++) done[jj * GRID + ii] = 1;
      const x0 = (i - GRID / 2) * CELL, z0 = (j - GRID / 2) * CELL, x1 = x0 + w * CELL, z1 = z0 + d * CELL;
      const h = cellHeight(val);
      if (val === 1) kit.solid(x0, 0, z0, x1, h, z1, { side: 'concrete', top: 'concrete', color: 0x8a8a88, uvScale: [3, 3], topScale: [3, 3] }, 'wall');
      else kit.building(x0, z0, x1, z1, h, { lips: false, tint: tints[(i * 7 + j * 3) % tints.length], windows: h >= 5 });
    }
  }
  // Zip lines: 2.3 m above a roof at each end (ride them either way)
  for (const [i0, j0, i1, j1] of L.zips) {
    const [ax, az] = cellPos(i0, j0), [bx, bz] = cellPos(i1, j1);
    const ha = cellHeight(v(i0, j0)), hb = cellHeight(v(i1, j1));
    kit.zipLine(ax, ha + 2.3, az, bx, hb + 2.3, bz, { startRoof: ha, endRoof: hb }); // (ride it either way)
  }
  // Beams between buildings (in a straight line), at a height you can step onto from both ends
  for (const [i0, j0, i1, j1] of L.beams || []) {
    const y = beamHeight(cellHeight(v(i0, j0)), cellHeight(v(i1, j1)));
    const [ax, az] = cellPos(i0, j0), [bx, bz] = cellPos(i1, j1);
    if (j0 === j1) kit.beam('x', ax, bx, az, y, 1.0, 'crane');
    else kit.beam('z', az, bz, ax, y, 1.0, 'crane');
  }
  // Parkour pieces on single squares
  const lasers = [];
  for (const [i, j, type] of L.props || []) {
    const [x, z] = cellPos(i, j), h = cellHeight(v(i, j));
    if (type === 'duct') kit.duct(x - CELL / 2, z - CELL / 2, x + CELL / 2, z + CELL / 2, h);
    else if (type === 'crate') kit.crate(x, h, z);
    else if (type === 'hut') kit.hut(x, h, z, 0, 2.8);
    else if (type === 'tower') kit.waterTower(x, h, z);
    else if (type === 'gold') {
      // A stack of gold bars on a pallet (low cover: crouch behind it)
      kit.block(x, h, z, 1.6, 0.15, 1.2, { side: 'plain', top: 'plain', color: 0x6b5236 });
      for (let layer = 0; layer < 3; layer++) for (let n = 0; n < 3 - layer; n++) {
        kit.batch.addBlock(x - 0.45 + n * 0.45 + layer * 0.22, h + 0.15 + layer * 0.2, z, 0.4, 0.2, 0.9, { side: 'glow', top: 'glow', color: 0xc9a227 });
      }
      kit.world.addBlock(x, h, z, 1.6, 0.75, 1.2, { tag: 'prop' });
    } else if (type === 'laser') {
      // A waist-high red laser across the square (crouch or slide under it)
      lasers.push({ x0: x - CELL / 2, x1: x + CELL / 2, z0: z - CELL / 2, z1: z + CELL / 2, y: h + 1.05 });
      for (const sx of [-1, 1]) kit.block(x + sx * (CELL / 2 - 0.1), h, z, 0.18, 1.3, 0.18, { side: 'plain', top: 'plain', color: 0x2a2c32 });
    }
  }
  const group = kit.finish();
  // Laser beams (glowing lines that the mode checks each frame)
  const laserMat = new THREE.MeshBasicMaterial({ color: 0xff2030, toneMapped: false });
  for (const las of lasers) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(las.x1 - las.x0 - 0.2, 0.07, 0.07), laserMat);
    beam.position.set((las.x0 + las.x1) / 2, las.y, (las.z0 + las.z1) / 2);
    group.add(beam);
  }

  const at = ([i, j], lift = 0.05) => { const [x, z] = cellPos(i, j); return new THREE.Vector3(x, cellHeight(v(i, j)) + lift, z); };
  const spawn = at(L.start);
  const goalPos = at(L.finish, 0);
  // Finish: a green beam and ring
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 60, 18, 1, true), makeGlowMaterial(0x4dffa6, 0.22));
  beam.position.copy(goalPos).setY(goalPos.y + 30);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.9, 32), makeGlowMaterial(0x4dffa6, 0.85));
  ring.rotation.x = -Math.PI / 2;
  ring.position.copy(goalPos).setY(goalPos.y + 0.06);
  group.add(beam, ring);

  return {
    group, world: kit.world, buildings: kit.buildings, hideSpots: kit.hideSpots, ladders: kit.ladders, zipLines: kit.zipLines,
    spawn, goalPos, finishRing: ring, lasers, cash: L.cash.map((c) => at(c, 0.05)), gliders: (L.gliders || []).map((c) => at(c, 0.05)),
    checkpoints: [{ name: 'Start', spawn: spawn.clone(), yaw: 0 }],
  };
}

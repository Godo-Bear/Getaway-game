import * as THREE from 'three';
import { RooftopKit } from '../world/rooftopKit.js';
import { makeGlowMaterial } from '../world/materials.js';

// Your own levels (the Level Editor).
//
// A level is a square grid of cells seen from above. Each cell has a height:
//   0 = street, 1 = a low wall (1 m, vault over it), 2-9 = a building, each
//   step 2.5 m taller than the last (so you can always climb one step up).
// Plus a start, a finish, cash bags, zip lines (roof to roof), an optional
// police helicopter and a time of day.
//
// SHARE CODES: the level as compact JSON (runs of equal cells squashed),
// then base64. "GW1-..." - paste it into the editor to play a friend's level.

export const GRID = 32;          // cells per side
export const CELL = 3;           // metres per cell
export const MAX_CASH = 20;
export const MAX_ZIPS = 6;
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
  return { v: 1, name, cells, start: [5, 15], finish: [25, 15], cash: [[12, 15], [18, 16]], zips: [], heli: false, time: 'night' };
}

// ------------------------------------------------------------------ share codes
export function encodeLevel(L) {
  // Run-length: "3x12" = twelve cells of height 3; single cells stay as a digit
  const runs = [];
  for (let k = 0; k < L.cells.length;) {
    let n = 1;
    while (k + n < L.cells.length && L.cells[k + n] === L.cells[k]) n++;
    runs.push(n > 1 ? `${L.cells[k]}x${n}` : `${L.cells[k]}`);
    k += n;
  }
  const json = JSON.stringify({ v: 1, n: L.name.slice(0, 40), c: runs.join('.'), s: L.start, f: L.finish, $: L.cash, z: L.zips, h: L.heli ? 1 : 0, t: L.time });
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
    const cells = [];
    for (const r of String(o.c).split('.')) {
      const [v, n = '1'] = r.split('x');
      const val = Math.max(0, Math.min(9, parseInt(v, 10) || 0)), cnt = Math.min(GRID * GRID, parseInt(n, 10) || 1);
      for (let k = 0; k < cnt && cells.length < GRID * GRID; k++) cells.push(val);
    }
    while (cells.length < GRID * GRID) cells.push(0);
    const cellOk = (p) => Array.isArray(p) && p.length >= 2 && p.every((x) => Number.isInteger(x) && x >= 0 && x < GRID);
    return {
      v: 1, name: String(o.n || 'Shared level').slice(0, 40), cells,
      start: cellOk(o.s) ? o.s : [1, 1], finish: cellOk(o.f) ? o.f : [GRID - 2, GRID - 2],
      cash: (Array.isArray(o.$) ? o.$ : []).filter(cellOk).slice(0, MAX_CASH),
      zips: (Array.isArray(o.z) ? o.z : []).filter((z) => cellOk(z.slice(0, 2)) && cellOk(z.slice(2, 4))).slice(0, MAX_ZIPS),
      heli: !!o.h, time: ['night', 'dawn', 'day', 'dusk'].includes(o.t) ? o.t : 'night',
    };
  } catch {
    return null;
  }
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
  kit.street(-half - 150, -half - 150, half + 150, half + 150);
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
  // Zip lines: from 2.3 m above one roof to 2.2 m above another
  for (const [i0, j0, i1, j1] of L.zips) {
    const [ax, az] = cellPos(i0, j0), [bx, bz] = cellPos(i1, j1);
    const ha = cellHeight(v(i0, j0)), hb = cellHeight(v(i1, j1));
    kit.zipLine(ax, ha + 2.3, az, bx, Math.min(hb + 2.2, ha + 2.3 - 0.5), bz, { startRoof: ha, endRoof: hb });
  }
  const group = kit.finish();

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
    spawn, goalPos, finishRing: ring, cash: L.cash.map((c) => at(c, 0.05)),
    checkpoints: [{ name: 'Start', spawn: spawn.clone(), yaw: 0 }],
  };
}

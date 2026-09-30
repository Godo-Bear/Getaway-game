// Ready-made levels to start from in the Level Editor, plus a "can you
// actually get everywhere?" check for the editor's checklist.

import { GRID, cellHeight, newLevel } from './customLevel.js';

const blankCells = () => new Array(GRID * GRID).fill(0);

/** Fill a rectangle of cells (inclusive) with a height. */
function rect(cells, i0, j0, i1, j1, v) {
  for (let i = Math.max(0, i0); i <= Math.min(GRID - 1, i1); i++)
    for (let j = Math.max(0, j0); j <= Math.min(GRID - 1, j1); j++) cells[j * GRID + i] = v;
}

export const TEMPLATES = [
  {
    id: 'blank', name: 'Empty map', text: 'Just the street, a start and a finish. Build everything yourself.',
    make: () => ({ v: 1, name: 'My level', cells: blankCells(), start: [4, 16], finish: [27, 16], cash: [], zips: [], heli: false, time: 'day' }),
  },
  { id: 'starter', name: 'Rooftop run', text: 'A row of roofs to jump across. A good one to change.', make: () => newLevel() },
  {
    id: 'stairs', name: 'The tower', text: 'Climb a staircase of buildings to the top of a tall tower.',
    make: () => {
      const c = blankCells();
      [2, 3, 4, 5, 6, 7, 8].forEach((v, k) => rect(c, 6 + k * 3, 14, 8 + k * 3, 18, v));
      rect(c, 27, 13, 29, 19, 9);
      return { v: 1, name: 'The tower', cells: c, start: [3, 16], finish: [28, 16], cash: [[10, 16], [19, 16], [25, 16]], zips: [], heli: false, time: 'dusk' };
    },
  },
  {
    id: 'zips', name: 'Zip line city', text: 'Start on a tall roof and ride zip lines down across the city.',
    make: () => {
      const c = blankCells();
      rect(c, 3, 3, 8, 8, 8); rect(c, 14, 4, 18, 9, 6); rect(c, 23, 5, 27, 10, 4);
      rect(c, 22, 18, 27, 23, 3); rect(c, 12, 20, 17, 25, 2); rect(c, 4, 22, 8, 27, 3);
      return {
        v: 1, name: 'Zip line city', cells: c, start: [4, 4], finish: [6, 24],
        cash: [[16, 6], [25, 7], [24, 20], [14, 22]],
        zips: [[7, 6, 15, 6], [17, 7, 24, 7], [25, 9, 25, 19], [23, 21, 16, 22]], heli: false, time: 'night',
      };
    },
  },
  {
    id: 'heli', name: 'Chopper chase', text: 'A maze of roofs with the police helicopter after you.',
    make: () => {
      const c = blankCells();
      for (let bi = 0; bi < 4; bi++) for (let bj = 0; bj < 4; bj++) rect(c, 3 + bi * 7, 3 + bj * 7, 7 + bi * 7, 7 + bj * 7, 3 + ((bi + bj) % 2));
      return { v: 1, name: 'Chopper chase', cells: c, start: [4, 4], finish: [26, 26], cash: [[12, 5], [5, 19], [19, 12], [26, 5], [12, 26]], zips: [], heli: true, time: 'night' };
    },
  },
  { id: 'random', name: 'Surprise me', text: 'A random city every time. Press it again for another one.', make: () => randomLevel() },
];

/** A random but playable level: roofs of mixed heights with a few cash bags. */
export function randomLevel() {
  const c = blankCells();
  const r = () => Math.random();
  const n = 9 + Math.floor(r() * 6);
  for (let k = 0; k < n; k++) {
    const w = 3 + Math.floor(r() * 5), d = 3 + Math.floor(r() * 5);
    const i0 = 2 + Math.floor(r() * (GRID - w - 4)), j0 = 2 + Math.floor(r() * (GRID - d - 4));
    rect(c, i0, j0, i0 + w - 1, j0 + d - 1, 2 + Math.floor(r() * 5));
  }
  const free = [], roofs = [];
  for (let j = 1; j < GRID - 1; j++) for (let i = 1; i < GRID - 1; i++) (c[j * GRID + i] ? roofs : free).push([i, j]);
  const pick = (arr) => arr.splice(Math.floor(r() * arr.length), 1)[0];
  const L = { v: 1, name: 'Surprise level', cells: c, start: pick(free), finish: roofs.length ? pick(roofs) : pick(free), cash: [], zips: [], heli: r() < 0.4, time: ['night', 'dawn', 'day', 'dusk'][Math.floor(r() * 4)] };
  for (let k = 0; k < 4 && roofs.length; k++) L.cash.push(pick(roofs));
  // Keep only what you can actually reach
  const reach = reachable(L);
  L.cash = L.cash.filter(([i, j]) => reach[j * GRID + i]);
  if (!reach[L.finish[1] * GRID + L.finish[0]]) L.finish = free.length ? pick(free) : L.finish;
  return L;
}

/**
 * Which cells you can get to from the start (a rough copy of the parkour
 * rules): walk onto anything up to one step (2.7 m) higher, drop down any
 * height, climb a building's ladder from the street, jump a one-cell gap to
 * a roof no higher than yours, and ride zip lines.
 * @returns {Uint8Array} 1 = reachable
 */
export function reachable(L) {
  const h = (i, j) => cellHeight(L.cells[j * GRID + i]);
  const seen = new Uint8Array(GRID * GRID);
  const queue = [L.start];
  seen[L.start[1] * GRID + L.start[0]] = 1;
  const zipsFrom = new Map();
  for (const [a, b, c, d] of L.zips) zipsFrom.set(b * GRID + a, [...(zipsFrom.get(b * GRID + a) || []), [c, d]]);
  const go = (i, j) => {
    if (i < 0 || j < 0 || i >= GRID || j >= GRID || seen[j * GRID + i]) return;
    seen[j * GRID + i] = 1;
    queue.push([i, j]);
  };
  while (queue.length) {
    const [i, j] = queue.shift();
    const here = h(i, j);
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= GRID || nj >= GRID) continue;
      const there = h(ni, nj);
      if (there - here <= 2.7 || (here === 0 && there >= 5)) go(ni, nj); // (from the street: ladders)
      // Jump a one-cell gap to a roof that's no higher
      const fi = i + di * 2, fj = j + dj * 2;
      if (here >= 2.5 && there < here - 1 && fi >= 0 && fj >= 0 && fi < GRID && fj < GRID && h(fi, fj) <= here + 0.3) go(fi, fj);
    }
    for (const [ti, tj] of zipsFrom.get(j * GRID + i) || []) go(ti, tj);
  }
  return seen;
}

// The game's maps: one Harbor City and one Frostvale, the SAME in every mode.
//
// Free Run, Rooftop Run, Street Chase and the story all use these, so the
// city you roam is the city the story happens in. (Story parts only add
// their own special places on top: a safehouse, a bank, a cafe...)
//
// On foot (the rooftop city) the blocks are laid out by hand so the parks
// are spread evenly round the city, with shop blocks in between:
//   P = park, S = shops, . = apartments. Rows are bi (x), columns bj (z).

const layout = (rows) => {
  const kinds = {};
  rows.forEach((row, bi) => [...row].forEach((ch, bj) => {
    if (ch === 'P') kinds[`${bi},${bj}`] = 'park';
    else if (ch === 'S') kinds[`${bi},${bj}`] = 'shops';
    else if (ch === 'W') kinds[`${bi},${bj}`] = 'water';
  }));
  return kinds;
};

/**
 * Harbor City, downtown (7 x 7 blocks). The story's Chapter 5 streets are
 * the middle blocks (its own 5 x 5 grid sits at 1..5 here), so the blocks
 * it uses stay apartments.
 */
export const DOWNTOWN_FOOT = {
  seed: 1234, blocks: 7,
  // (no trees where Chapter 5 puts its own things: the bus stop, Cafe Luna's
  // tables, the pawn shop's safe)
  treeAvoid: [[32.7, -53, 3.5], [-2, 22.3, 7], [59, -22.3, 3]],
  kinds: layout([
    '.S..P.S',
    '.P..S.P',
    '.S...S.',
    'P...P.S',
    'S....S.',
    '.P.S.P.',
    'S..P..S',
  ]),
};

/**
 * Frostvale (6 x 6 blocks). The story's town (Chapters 8-12, a 4 x 4 grid)
 * is the middle (1..4 here), so the blocks it uses stay chalets.
 */
export const FROSTVALE_FOOT = {
  seed: 8080, blocks: 6, alpine: true,
  // (no shop front over Pine Lodge's door or on St. Anna's church)
  shopAvoid: [[82.5, 103.5, 4], [-82.5, -103.5, 5]],
  // (no trees where the story puts its own things on the pavement: the ski
  // rack, the snowmobiles, the porches)
  treeAvoid: [[-27.5, -5.2, 4], [-82.5, 106, 5], [-58.5, -39.5, 3], [-13.5, 3.5, 3], [58.5, 39.5, 3], [15.5, -3.5, 3]],
  kinds: layout([
    'P.S.S.',
    '...P..',
    'S....P',
    '.S....',
    '.PS..S',
    '..S.P.',
  ]),
};

/**
 * The streets you drive (story chases add their landmarks on top). Every
 * place has its own street plan: block sizes along x and along z, and a few
 * pairs of blocks joined into one big block or park where a road is left out
 * (layout.merge: [i, j, 'x' | 'z', kind]: block i,j and the next one along).
 * The joins never touch a block or a starting road a story part uses there.
 * Harbor City keeps the even grid where it all started.
 */
export const DOWNTOWN_CAR = { seed: 777, blocks: 8 };
// Frostvale: a mountain village, blocks every which size, a market park; no El
export const FROSTVALE_CAR = { seed: 1313, blocks: 8, alpine: true, el: null, layout: {
  x: [36, 72, 40, 64, 36, 78, 42, 52], z: [56, 46, 70, 46, 60, 44, 66, 48],
  merge: [[2, 3, 'z', 'park'], [6, 3, 'z'], [0, 2, 'z'], [4, 0, 'x'], [7, 2, 'z']],
} };

// Porto Sereno (Chapters 13-15): a sunny harbour town abroad. Low pastel and
// whitewashed buildings, terracotta roofs, palm trees, trams, the sea to the south.
export const PORTO_FOOT = { seed: 1717, blocks: 6, coastal: true, parks: 0.2, shopBlocks: 0.42 };
// (smaller blocks down towards the sea; trams instead of the El)
export const PORTO_CAR = { seed: 1919, blocks: 8, coastal: true, parkShare: 0.16, el: null, layout: {
  x: [70, 38, 52, 40, 74, 36, 60, 50], z: [72, 64, 58, 50, 46, 44, 44, 44],
  merge: [[0, 2, 'z', 'park'], [4, 1, 'x'], [2, 6, 'z'], [4, 3, 'z', 'park']],
} };

// Neon Kōji (Chapters 16-18): a huge city on the other side of the world.
// Dark towers covered in neon, giant billboards, cherry trees, rain.
// (a bigger city on foot: 8 x 8 bigger blocks, lots of towers)
export const NEON_FOOT = { seed: 1616, blocks: 8, block: 48, towers: 0.22, neon: true, parks: 0.1, shopBlocks: 0.42 };
// (narrow streets between mega-blocks)
export const NEON_CAR = { seed: 2626, blocks: 8, neon: true, parkShare: 0.1, layout: {
  x: [36, 36, 80, 36, 40, 80, 46, 46], z: [74, 44, 44, 46, 74, 44, 44, 46],
  merge: [[5, 0, 'x'], [3, 5, 'z'], [6, 3, 'z'], [0, 3, 'x'], [4, 6, 'x']],
} };

// Lumière (Chapters 19-21): a grand old European capital. Cream stone
// buildings with zinc mansard roofs, cafés, plane trees, a river with
// bridges through the middle, and the Iron Tower.
// (on foot: 7 x 7 grand blocks, the river through the middle (W), a long park down the middle (the esplanade))
export const LUMIERE_FOOT = { seed: 1919, blocks: 7, block: 46, classic: true, kinds: layout([
  'S..P.WS',
  '.S...WP',
  'P.S..W.',
  '.PPP.W.',
  'S....WP',
  '.P.S.W.',
  'S...SW.',
]) };
// (grand blocks, the river (row 5), a great park in the middle where the Iron Tower stands; the El crosses further north)
export const LUMIERE_CAR = { seed: 2929, blocks: 8, classic: true, parkShare: 0.14, el: 2, layout: {
  x: [64, 44, 40, 72, 72, 40, 44, 64], z: [48, 52, 46, 56, 50, 70, 48, 52],
  merge: [[3, 3, 'z', 'park'], [5, 1, 'x'], [0, 3, 'z'], [6, 3, 'z'], [3, 6, 'x']],
} };

// Mirage Springs (Chapters 22-24): a desert city of casinos.
// (on foot: 7 x 7 big blocks, an oasis park in the middle, the casino row of shops)
export const MIRAGE_FOOT = { seed: 2222, blocks: 7, block: 52, desert: true, towers: 0.16, kinds: layout([
  '..S...P',
  'P..S...',
  '.S.SS..',
  '..SPS..',
  '...S..S',
  '.P.S.P.',
  'S......',
]) };
// (the Strip: a row of wide casino blocks, where the roads between them are
// joined; motels and small blocks round the edges; no elevated railway)
export const MIRAGE_CAR = { seed: 2222, blocks: 8, desert: true, parkShare: 0.08, el: null, layout: {
  x: [40, 56, 68, 44, 68, 56, 40, 62], z: [44, 58, 40, 78, 40, 58, 44, 52],
  merge: [[1, 3, 'x'], [4, 3, 'x'], [6, 3, 'x'], [2, 5, 'z', 'park']],
} };


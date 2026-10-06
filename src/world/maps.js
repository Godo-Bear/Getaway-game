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

/** The streets you drive (story chases add their landmarks on top). */
export const DOWNTOWN_CAR = { seed: 777, blocks: 8 };
export const FROSTVALE_CAR = { seed: 1313, blocks: 8, alpine: true };

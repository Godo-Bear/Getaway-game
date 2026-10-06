// Elevated roads for the driving city: more than one level to drive on.
//
//  - The Skyway: a ring road 9 m up, all the way round the outside of the
//    city (the map is bigger now). On-ramps climb up to it from the end of
//    a street on each side (through a gap in the city wall).
//  - The El: the elevated railway joins the Skyway at both ends, so you can
//    drive along the train tracks right across the city (watch out for the
//    train!).
//  - The Highline: a higher overpass, 18 m up, across the middle of the
//    city, over the railway. Ramps climb to it from the Skyway, north and
//    south.
//
// Everything here is a "surface": a flat deck or a straight ramp. The city's
// groundHeight(x, z, y) gives the highest surface under a car that it can
// reach from where it is (so a car under a bridge stays on the street, and
// a car on the bridge stays on the bridge). Rails (solid) along every edge
// keep you from driving off.

export const SKY_Y = 9.2;   // the Skyway and the El (top of the railway deck)
export const HIGH_Y = 18;   // the Highline
const GAP = 60;             // from the city wall to the Skyway
const SW = 16;              // Skyway width
const RW = 12;              // on-ramp width
const HW = 12;              // Highline width
const DECK = 1.0;           // deck thickness
const RAIL_H = 1.0;
const RAIL_T = 0.5;
const STEP = 1.0;
export const SKYWAY_REACH = GAP + SW; // (how far out past the city wall it goes)           // a car can "see" a surface this far above it (climbing a ramp)

/**
 * @param {object} o
 * @param {import('./meshBatcher.js').MeshBatcher} o.batch
 * @param {import('../core/collision.js').CollisionWorld} o.world
 * @returns {{ surfaces, gaps, heightAt, outerEdge, highX, under, rampAt, minimap }}
 */
export function buildElevated({ batch, world, outer, outerMax, roadC, n, road, elZ, elHalf, alpine, wallT }) {
  const surfaces = [];
  const shapes = [];
  const skyIn = outer - GAP, skyOut = skyIn - SW;
  const skyInMax = outerMax + GAP, skyOutMax = skyInMax + SW;
  const hasEl = !alpine && elZ < 1e5;
  const elK = Math.round((elZ - roadC(0)) / (roadC(1) - roadC(0)));
  const pick = (cands, avoid) => cands.find((k) => k >= 1 && k <= n - 2 && !avoid.includes(k)) ?? null;
  const kN = pick([2, 1, 3], []);
  const kS = pick([n - 3, n - 2, n - 4], [kN]);
  const kE = pick([2, 1, 3, 4], hasEl ? [elK] : []);
  const kW = pick([n - 3, n - 2, n - 4], hasEl ? [elK, kE] : [kE]);
  const kH = pick([n - 4, n - 5, 3, 4], [kN, kS]);
  const highX = kH != null ? roadC(kH) : 1e6;

  // Looks
  const C = alpine ? { side: 'concrete', color: 0xb8bcc4 } : { side: 'concrete', color: 0x8a8e96 };
  const railLook = { side: 'concrete', top: alpine ? 'plain' : 'concrete', color: alpine ? 0xe8eef5 : 0x9a9ea6, uvScale: [4, 4], topScale: [4, 4] };
  const pillarLook = { side: 'plain', top: 'plain', color: alpine ? 0x6a6e76 : 0x3b4048 };
  const glowCol = alpine ? 0x9fd4ff : 0xffb020;

  // ---------------------------------------------------------------- helpers
  const deck = (x0, z0, x1, z1, y, label) => {
    surfaces.push({ kind: 'deck', x0, z0, x1, z1, y, label });
    batch.addBox({ x: x0, y: y - DECK, z: z0 }, { x: x1, y, z: z1 },
      { side: C.side, top: 'asphalt', bottom: 'plain', color: C.color, uvScale: [4, 4], topScale: [10, 10] });
    shapes.push({ type: 'elevated', x0, z0, x1, z1, level: y });
  };
  // A rail along a deck edge (solid), with a glowing strip on top
  const rail = (x0, z0, x1, z1, y) => {
    if (x1 - x0 < 0.05 || z1 - z0 < 0.05) return;
    world.addBox(x0, y, z0, x1, y + RAIL_H, z1, { tag: 'rail' });
    batch.addBox({ x: x0, y, z: z0 }, { x: x1, y: y + RAIL_H, z: z1 }, railLook);
    batch.addBox({ x: x0 + 0.1, y: y + RAIL_H, z: z0 + 0.1 }, { x: x1 - 0.1, y: y + RAIL_H + 0.06, z: z1 - 0.1 }, { side: 'glow', top: 'glow', color: glowCol });
  };
  // A rail along one edge of a deck, leaving gaps [a0, a1] (along the edge) open
  const railWithGaps = (axis, fixed, a0, a1, y, gaps, side) => {
    const cuts = gaps.filter(([g0, g1]) => g1 > a0 && g0 < a1).sort((p, q) => p[0] - q[0]);
    let s = a0;
    for (const [g0, g1] of [...cuts, [a1, a1]]) {
      if (g0 > s) {
        const t0 = side < 0 ? fixed : fixed - RAIL_T, t1 = t0 + RAIL_T;
        if (axis === 'x') rail(s, t0, g0, t1, y); else rail(t0, s, t1, g0, y);
      }
      s = Math.max(s, g1);
    }
  };
  const pillar = (x, z, top, w = 1.2, solid = false) => {
    if (top < 1) return;
    batch.addBox({ x: x - w / 2, y: 0, z: z - w / 2 }, { x: x + w / 2, y: top, z: z + w / 2 }, pillarLook);
    if (solid) world.addBox(x - w / 2, 0, z - w / 2, x + w / 2, top, z + w / 2, { tag: 'pillar' });
  };

  /**
   * A straight ramp. axis: which way it runs ('x' or 'z'); a0..a1 along it,
   * c0..c1 across; y rises from yLo at end `lo` ('min' = a0, 'max' = a1) to yHi.
   */
  const ramp = (axis, a0, a1, c0, c1, lo, yLo, yHi, label) => {
    const r = axis === 'x' ? { x0: a0, x1: a1, z0: c0, z1: c1 } : { x0: c0, x1: c1, z0: a0, z1: a1 };
    Object.assign(r, { kind: 'ramp', axis, lo, y0: yLo, y1: yHi, label });
    surfaces.push(r);
    shapes.push({ type: 'elevated', x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1, level: (yLo + yHi) / 2 });
    const yAt = (a) => yLo + (yHi - yLo) * (lo === 'min' ? (a - a0) / (a1 - a0) : (a1 - a) / (a1 - a0));
    // The road surface (a sloped slab)
    slopedSlab(batch, 'asphalt', C.side, axis, a0, a1, c0, c1, yAt(a0), yAt(a1), DECK, C.color);
    // Rails both sides: sloped to look at, solid in short steps
    for (const [r0, r1] of [[c0, c0 + RAIL_T], [c1 - RAIL_T, c1]]) {
      slopedSlab(batch, 'concrete', 'concrete', axis, a0, a1, r0, r1, yAt(a0) + RAIL_H, yAt(a1) + RAIL_H, RAIL_H, railLook.color);
      slopedSlab(batch, 'glow', null, axis, a0, a1, r0 + 0.1, r1 - 0.1, yAt(a0) + RAIL_H + 0.06, yAt(a1) + RAIL_H + 0.06, 0.06, glowCol);
      for (let a = a0; a < a1 - 0.01; a += 3) {
        const b = Math.min(a1, a + 3), top = Math.max(yAt(a), yAt(b)) + RAIL_H;
        if (axis === 'x') world.addBox(a, 0, r0, b, top, r1, { tag: 'rail' });
        else world.addBox(r0, 0, a, r1, top, b, { tag: 'rail' });
      }
    }
    // Pillars under it
    for (let a = a0 + 6; a < a1 - 2; a += 12) {
      const c = (c0 + c1) / 2;
      if (axis === 'x') pillar(a, c, yAt(a) - DECK, 1.4); else pillar(c, a, yAt(a) - DECK, 1.4);
    }
    return r;
  };

  // ---------------------------------------------------------------- the Skyway
  // Gaps in its inner rail where the ramps and the railway join it
  const gapN = [], gapS = [], gapW = [], gapE = [];
  if (kN != null) gapN.push([roadC(kN) - RW / 2, roadC(kN) + RW / 2]);
  if (kS != null) gapS.push([roadC(kS) - RW / 2, roadC(kS) + RW / 2]);
  if (kW != null) gapW.push([roadC(kW) - RW / 2, roadC(kW) + RW / 2]);
  if (kE != null) gapE.push([roadC(kE) - RW / 2, roadC(kE) + RW / 2]);
  if (kH != null) { gapN.push([highX - HW / 2, highX + HW / 2]); gapS.push([highX - HW / 2, highX + HW / 2]); }
  if (hasEl) { gapW.push([elZ - elHalf, elZ + elHalf]); gapE.push([elZ - elHalf, elZ + elHalf]); }

  deck(skyOut, skyOut, skyOutMax, skyIn, SKY_Y, 'Skyway');        // north
  deck(skyOut, skyInMax, skyOutMax, skyOutMax, SKY_Y, 'Skyway');  // south
  deck(skyOut, skyIn, skyIn, skyInMax, SKY_Y, 'Skyway');          // west
  deck(skyInMax, skyIn, skyOutMax, skyInMax, SKY_Y, 'Skyway');    // east
  // Outer rails (all the way round) and inner rails (with the gaps)
  rail(skyOut, skyOut, skyOutMax, skyOut + RAIL_T, SKY_Y);
  rail(skyOut, skyOutMax - RAIL_T, skyOutMax, skyOutMax, SKY_Y);
  rail(skyOut, skyOut + RAIL_T, skyOut + RAIL_T, skyOutMax - RAIL_T, SKY_Y);
  rail(skyOutMax - RAIL_T, skyOut + RAIL_T, skyOutMax, skyOutMax - RAIL_T, SKY_Y);
  railWithGaps('x', skyIn, skyIn, skyInMax, SKY_Y, gapN, 1);
  railWithGaps('x', skyInMax, skyIn, skyInMax, SKY_Y, gapS, -1);
  railWithGaps('z', skyIn, skyIn, skyInMax, SKY_Y, gapW, 1);
  railWithGaps('z', skyInMax, skyIn, skyInMax, SKY_Y, gapE, -1);
  // Pillars down the middle
  const mid = skyIn - SW / 2, midMax = skyInMax + SW / 2;
  for (let t = skyOut + 10; t < skyOutMax - 6; t += 24) {
    pillar(t, mid, SKY_Y - DECK, 1.6); pillar(t, midMax, SKY_Y - DECK, 1.6);
    pillar(mid, t, SKY_Y - DECK, 1.6); pillar(midMax, t, SKY_Y - DECK, 1.6);
  }

  // ---------------------------------------------------------------- on-ramps (street -> Skyway)
  // Each one carries on from the end of a street, through a gap in the wall
  const gaps = { N: [], S: [], W: [], E: [] }; // (gaps to leave in the city wall)
  const rampLabel = 'Skyway ramp';
  if (kN != null) { const x = roadC(kN); ramp('z', skyIn, outer, x - RW / 2, x + RW / 2, 'max', 0, SKY_Y, rampLabel); gaps.N.push([x - RW / 2, x + RW / 2]); }
  if (kS != null) { const x = roadC(kS); ramp('z', outerMax, skyInMax, x - RW / 2, x + RW / 2, 'min', 0, SKY_Y, rampLabel); gaps.S.push([x - RW / 2, x + RW / 2]); }
  if (kW != null) { const z = roadC(kW); ramp('x', skyIn, outer, z - RW / 2, z + RW / 2, 'max', 0, SKY_Y, rampLabel); gaps.W.push([z - RW / 2, z + RW / 2]); }
  if (kE != null) { const z = roadC(kE); ramp('x', outerMax, skyInMax, z - RW / 2, z + RW / 2, 'min', 0, SKY_Y, rampLabel); gaps.E.push([z - RW / 2, z + RW / 2]); }

  // ---------------------------------------------------------------- the El (railway) joins the Skyway
  if (hasEl) {
    // (the deck over the city is built with the railway; this is the rest of it, out to the Skyway)
    surfaces.push({ kind: 'deck', x0: skyIn, z0: elZ - elHalf, x1: skyInMax, z1: elZ + elHalf, y: SKY_Y, label: 'the railway' });
    for (const [x0, x1] of [[skyIn, outer], [outerMax, skyInMax]]) {
      batch.addBox({ x: x0, y: SKY_Y - 1.2, z: elZ - elHalf }, { x: x1, y: SKY_Y, z: elZ + elHalf },
        { side: 'metal', top: 'concrete', bottom: 'plain', color: 0x5a6068, uvScale: [2, 1.2], topScale: [4, 4] });
      for (let x = x0 + 8; x < x1 - 4; x += 17) for (const s of [-1, 1]) pillar(x, elZ + s * (elHalf - 1), SKY_Y - 1.2, 0.8);
      rail(x0, elZ - elHalf, x1, elZ - elHalf + RAIL_T, SKY_Y);
      rail(x0, elZ + elHalf - RAIL_T, x1, elZ + elHalf, SKY_Y);
    }
    shapes.push({ type: 'elevated', x0: skyIn, z0: elZ - elHalf, x1: skyInMax, z1: elZ + elHalf, level: SKY_Y, rail: true });
  }

  // ---------------------------------------------------------------- the Highline
  if (kH != null) {
    const zA = outer - 4, zB = outerMax + 4; // (the deck: over the city wall to over the wall)
    const x0 = highX - HW / 2, x1 = highX + HW / 2;
    deck(x0, zA, x1, zB, HIGH_Y, 'the Highline');
    rail(x0, zA, x0 + RAIL_T, zB, HIGH_Y);
    rail(x1 - RAIL_T, zA, x1, zB, HIGH_Y);
    ramp('z', skyIn, zA, x0, x1, 'min', SKY_Y, HIGH_Y, 'Highline ramp');
    ramp('z', zB, skyInMax, x0, x1, 'max', SKY_Y, HIGH_Y, 'Highline ramp');
    // Pillars at the kerbs (skipping the crossings and the railway), with a beam across
    const kerb = road / 2 - 0.55;
    const step = roadC(1) - roadC(0);
    for (let z = outer + 6; z < outerMax - 6; z += 17) {
      const nearNode = Math.abs(z - roadC(Math.round((z - roadC(0)) / step))) < road / 2 + 3;
      if (nearNode || (hasEl && Math.abs(z - elZ) < elHalf + 3)) continue;
      pillar(highX - kerb, z, HIGH_Y - DECK, 0.9, true);
      pillar(highX + kerb, z, HIGH_Y - DECK, 0.9, true);
      batch.addBox({ x: highX - kerb - 0.5, y: HIGH_Y - DECK - 0.8, z: z - 0.5 }, { x: highX + kerb + 0.5, y: HIGH_Y - DECK, z: z + 0.5 }, pillarLook);
    }
  }

  // ---------------------------------------------------------------- queries
  /** Height of the surface at (x, z) a car at height y is on (or would land on), or -Infinity. */
  function heightAt(x, z, y) {
    let best = -Infinity;
    for (const s of surfaces) {
      if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) continue;
      let h;
      if (s.kind === 'deck') h = s.y;
      else {
        const a = s.axis === 'x' ? x : z, a0 = s.axis === 'x' ? s.x0 : s.z0, a1 = s.axis === 'x' ? s.x1 : s.z1;
        const t = s.lo === 'min' ? (a - a0) / (a1 - a0) : (a1 - a) / (a1 - a0);
        h = s.y0 + (s.y1 - s.y0) * t;
      }
      if (h <= y + STEP && h > best) best = h;
    }
    return best;
  }
  /** Is (x, z, y) under a deck (out of sight from above)? */
  const under = (x, z, y) => surfaces.some((s) => s.kind === 'deck' && y < s.y - 3 && x > s.x0 && x < s.x1 && z > s.z0 && z < s.z1);
  /** The surface (deck or ramp) you're on, if any (for the HUD). */
  const onSurface = (x, z, y) => surfaces.find((s) => x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1 && Math.abs(heightAt(x, z, y) - y) < 0.6 && y > 0.5) || null;

  return { surfaces, gaps, heightAt, under, onSurface, highX, shapes, outerEdge: skyOutMax, minEdge: skyOut, wallT };
}

/**
 * A sloped slab: runs along `axis` from a0 to a1 (top at yA0 -> yA1), across
 * c0..c1, `thick` deep. Faces go straight into the batcher (topKey on top,
 * sideKey for the sides and the ends; null = skip).
 */
function slopedSlab(batch, topKey, sideKey, axis, a0, a1, c0, c1, yA0, yA1, thick, color) {
  const P = (a, c, y) => (axis === 'x' ? [a, y, c] : [c, y, a]);
  const quad = (key, A, B, D, want, uv) => {
    let U = sub(B, A), V = sub(D, A), nrm = cross(U, V);
    if (dot(nrm, want) < 0) { [U, V] = [V, U]; nrm = cross(U, V); }
    batch.addQuad(key, A, U, V, norm(nrm), color, uv);
  };
  const topUV = (x, y, z) => [x / 10, z / 10];
  const sideUV = axis === 'x' ? (x, y, z) => [x / 4, y / 4] : (x, y, z) => [z / 4, y / 4];
  const endUV = axis === 'x' ? (x, y, z) => [z / 4, y / 4] : (x, y, z) => [x / 4, y / 4];
  const up = [0, 1, 0];
  // Top and bottom
  quad(topKey, P(a0, c0, yA0), P(a1, c0, yA1), P(a0, c1, yA0), up, topUV);
  if (sideKey) {
    quad(sideKey, P(a0, c0, yA0 - thick), P(a1, c0, yA1 - thick), P(a0, c1, yA0 - thick), [0, -1, 0], topUV);
    // The two long sides
    const sideN = axis === 'x' ? [0, 0, -1] : [-1, 0, 0];
    quad(sideKey, P(a0, c0, yA0 - thick), P(a1, c0, yA1 - thick), P(a0, c0, yA0), sideN, sideUV);
    quad(sideKey, P(a0, c1, yA0 - thick), P(a1, c1, yA1 - thick), P(a0, c1, yA0), sideN.map((v) => -v), sideUV);
    // The two ends
    const endN = axis === 'x' ? [-1, 0, 0] : [0, 0, -1];
    quad(sideKey, P(a0, c0, yA0 - thick), P(a0, c1, yA0 - thick), P(a0, c0, yA0), endN, endUV);
    quad(sideKey, P(a1, c0, yA1 - thick), P(a1, c1, yA1 - thick), P(a1, c0, yA1), endN.map((v) => -v), endUV);
  }
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

import * as THREE from 'three';
import { Shopfronts, addShopsToBuildings } from './shopfronts.js';
import { makeRng } from '../core/utils.js';
import { CityDresser, SHOP_H } from './cityBlocks.js';
import { RooftopKit, LIP } from './rooftopKit.js';
import { COASTAL_TINTS } from './palms.js';
import { NEON_TINTS, buildNeonDressing } from './neon.js';
import { DESERT_TINTS, DESERT_WORDS, DESERT_COLORS, DESERT_SLOGANS, buildDesertRim } from './desert.js';
import { CLASSIC_TINTS, buildIronTower, riverMaterial, buildRiverBoat } from './lumiere.js';

// Procedural rooftop city for Free Run and Rooftop Run.
//
// Layout: a grid of city blocks separated by wide streets (too wide to jump).
// Each block is cut into several buildings separated by narrow alleys
// (1.6-3.6 m, jumpable). Streets are crossed on crane beams / planks.
// Every roof gets random props from the RooftopKit.

const BLOCK = 42;          // block size (m)
const STREET = 13;         // street width (m) - too far to jump
const PITCH = BLOCK + STREET;

// alpine: a small mountain town instead of the city (low wooden and plaster
// chalets, no towers, no roof props or bridges, no ladders: the level adds
// pitched snowy roofs on top, see chapter8Town.js).
const ALPINE_TINTS = [0x8a5a3a, 0x6e4a30, 0xd2c4aa, 0xc8b89a, 0x9a6a44, 0xe0d6c4, 0x7a5236];

/**
 * @param {object} o
 * @param {Object<string,string>} [o.kinds] - what goes on each block ('bi,bj' -> 'apartments' | 'shops' | 'park');
 *        blocks not listed are apartments. Leave it out for a random mix (Free Run, Rooftop Run).
 * @param {number} [o.parks] - share of park blocks in a random mix
 * @param {number} [o.shopBlocks] - share of shop blocks in a random mix
 * @param {boolean} [o.lowRise] - an old town: lower apartments, no towers
 * @param {number[][]} [o.treeAvoid] - [x, z, radius]: no street trees here (where a story level puts its own things)
 */
export function generateRooftopCity({ seed = 1, blocks = 6, alpine = false, coastal = false, neon = false, classic = false, desert = false, shopAvoid = [], kinds = null, parks = 0.16, shopBlocks = 0.32, lowRise = false, treeAvoid = [], block = 42, towers = 0.09 } = {}) {
  // (each map has its own block size: the streets between stay the same, too far to jump)
  const BLOCK = block, PITCH = BLOCK + STREET;
  if (coastal || classic || desert) lowRise = true; // (Porto Sereno: low, sunny, no towers; Lumière: six storeys, all much the same)
  const tintRng = makeRng(seed * 23 + 5);
  const tint = () => (coastal ? tintRng.pick(COASTAL_TINTS) : neon ? tintRng.pick(NEON_TINTS) : classic ? tintRng.pick(CLASSIC_TINTS) : desert ? tintRng.pick(DESERT_TINTS) : undefined);
  const kit = new RooftopKit({ seed });
  if (alpine) kit.noLadders = true;
  const rng = kit.rng;
  const half = ((blocks - 1) / 2) * PITCH;
  const blockCenter = (i) => i * PITCH - half;
  const extent = half + PITCH;

  kit.street(-extent - 200, -extent - 200, extent + 200, extent + 200);

  // What goes on each block: apartments, a ring of small shops, or a park.
  // (Their own random numbers: the apartment blocks come out as before.)
  const dress = new CityDresser(kit, { alpine, coastal: coastal || desert, neon, rng: makeRng(seed * 17 + 1), treeAvoid }); // (palms in Mirage Springs too)
  const kindRng = makeRng(seed * 7 + 3);
  const mid = Math.floor(blocks / 2);
  const kindOf = {};
  if (kinds) {
    for (let bi = 0; bi < blocks; bi++) for (let bj = 0; bj < blocks; bj++) kindOf[`${bi},${bj}`] = kinds[`${bi},${bj}`] || 'apartments';
  } else {
    // A random mix, with the parks spread out: never two parks next to each
    // other (not even corner to corner), so there's green all over the city
    const all = [];
    for (let bi = 0; bi < blocks; bi++) for (let bj = 0; bj < blocks; bj++) { kindOf[`${bi},${bj}`] = 'apartments'; all.push([bi, bj]); }
    for (let k = all.length - 1; k > 0; k--) { const r = Math.floor(kindRng() * (k + 1)); [all[k], all[r]] = [all[r], all[k]]; }
    const isPark = (i, j) => kindOf[`${i},${j}`] === 'park';
    let want = Math.round(all.length * parks);
    for (const [bi, bj] of all) {
      if (want <= 0) break;
      if (bi === mid && bj === mid) continue; // (you start on a roof in the middle)
      let near = false;
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) if (isPark(bi + di, bj + dj)) near = true;
      if (near) continue;
      kindOf[`${bi},${bj}`] = 'park';
      want--;
    }
    let shops = Math.round(all.length * shopBlocks);
    for (const [bi, bj] of all) {
      if (shops <= 0) break;
      if (kindOf[`${bi},${bj}`] !== 'apartments' || (bi === mid && bj === mid)) continue;
      kindOf[`${bi},${bj}`] = 'shops';
      shops--;
    }
  }

  const waterMeshes = [], waterRects = [];
  // --- Blocks and buildings
  for (let bi = 0; bi < blocks; bi++) {
    for (let bj = 0; bj < blocks; bj++) {
      const cx = blockCenter(bi), cz = blockCenter(bj);
      const x0 = cx - BLOCK / 2, z0 = cz - BLOCK / 2;
      kit.sidewalk(x0 - 2.5, z0 - 2.5, x0 + BLOCK + 2.5, z0 + BLOCK + 2.5);
      const kind = kindOf[`${bi},${bj}`];
      dress.streetTrees(x0, z0, x0 + BLOCK, z0 + BLOCK);
      for (let t = 4; t < BLOCK; t += 14) {
        kit.lamps.push([x0 + t, z0 - 2], [x0 + t, z0 + BLOCK + 2], [x0 - 2, z0 + t], [x0 + BLOCK + 2, z0 + t]);
      }
      if (kind === 'park') { dress.park(x0, z0, x0 + BLOCK, z0 + BLOCK); continue; }
      if (kind === 'water') { waterBlock(x0, z0, bi); continue; }
      if (kind === 'shops') {
        // Small shops round the edge, a block of flats in the middle (climb its
        // fire escape from the shop roofs)
        const inner = dress.shopBlock(x0, z0, x0 + BLOCK, z0 + BLOCK);
        const h = alpine ? Math.round(rng.range(8, 10.5) * 2) / 2 : lowRise ? Math.round(rng.range(10, 13) * 2) / 2 : Math.round(rng.range(16, 22) * 2) / 2;
        const b = alpine ? kit.building(inner.x0, inner.z0, inner.x1, inner.z1, h, { lips: false, tint: rng.pick(ALPINE_TINTS) })
          : kit.building(inner.x0, inner.z0, inner.x1, inner.z1, h, { tint: tint() });
        b.noLadder = true;
        if (!alpine) {
          addRoofProps(kit, b);
          if (!dress.fireEscape(b, 0, -1, SHOP_H)) dress.fireEscape(b, 0, 1, SHOP_H);
          dress.fireEscape(b, 1, 0, SHOP_H);
        }
        continue;
      }
      const first = kit.buildings.length;
      const xs = splitSpan(rng, x0, BLOCK, rng.int(2, 3));
      const zs = splitSpan(rng, z0, BLOCK, rng.int(2, 3));
      for (const [lx0, lx1] of xs) {
        for (const [lz0, lz1] of zs) {
          if (alpine) {
            kit.building(lx0, lz0, lx1, lz1, Math.round(rng.range(7, 10.5) * 2) / 2, { lips: false, tint: rng.pick(ALPINE_TINTS) });
            continue;
          }
          const tower = rng() < towers && (!lowRise || desert); // (Mirage Springs: low adobe, and casino towers)
          // Normal roofs stay within a 4.5 m band so routes are always climbable.
          const h = tower ? rng.range(28, 36) : lowRise ? Math.round(rng.range(9.5, 13) * 2) / 2 : Math.round(rng.range(15, 19.5) * 2) / 2;
          const b = kit.building(lx0, lz0, lx1, lz1, h, { tower, lips: !tower, tint: tint() });
          if (!tower) addRoofProps(kit, b);
          if (rng() < 0.12) kit.sign(b, rng.int(0, 3));
        }
      }
      // Fire escapes up some of the walls that face the street, and a few roof gardens
      for (const b of kit.buildings.slice(first)) {
        if (alpine || b.tower) continue;
        if (dress.rng() < 0.4) {
          const faces = [[0, -1, b.minZ <= z0 + 0.01], [0, 1, b.maxZ >= z0 + BLOCK - 0.01], [-1, 0, b.minX <= x0 + 0.01], [1, 0, b.maxX >= x0 + BLOCK - 0.01]].filter((f) => f[2]);
          if (faces.length) { const [fx, fz] = faces[Math.floor(dress.rng() * faces.length)]; dress.fireEscape(b, fx, fz, 0); }
        }
        if (dress.rng() < 0.2) dress.roofGarden(b);
      }
    }
  }

  /**
   * A block of water (Lumière's river): water filling the block, a stone
   * parapet round it (the streets round it are the quays and bridges), and
   * now and then a boat. Climb over the parapet and you fall in: splash,
   * back to safety (see city.water, the on-foot state).
   */
  function waterBlock(x0, z0, bi) {
    const stone = { side: 'concrete', top: 'concrete', color: 0xc8bca4 }, T = 0.45, H = 1.1, x1 = x0 + BLOCK, z1 = z0 + BLOCK;
    for (const [a, b, c, d] of [[x0, z0, x1, z0 + T], [x0, z1 - T, x1, z1], [x0, z0, x0 + T, z1], [x1 - T, z0, x1, z1]]) kit.solid(a, 0, b, c, H, d, stone);
    const w = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK - T * 2, BLOCK - T * 2), riverMaterial());
    w.rotation.x = -Math.PI / 2;
    w.position.set((x0 + x1) / 2, 0.06, (z0 + z1) / 2);
    waterMeshes.push(w);
    if (bi % 2 === 0) {
      const boat = buildRiverBoat(bi % 4 ? 0xf2f2ee : 0xe8d8b0);
      boat.position.set((x0 + x1) / 2 + (bi % 4 ? 6 : -6), 0.1, (z0 + z1) / 2);
      waterMeshes.push(boat);
    }
    waterRects.push({ x0, z0, x1, z1 });
  }

  // --- Bridges across the streets
  const findBuilding = (x, z) => kit.buildings.find((b) => !b.shop &&
    x > b.minX + 0.8 && x < b.maxX - 0.8 && z > b.minZ + 0.8 && z < b.maxZ - 0.8);

  for (let bi = 0; bi < (alpine ? 0 : blocks); bi++) {
    for (let bj = 0; bj < blocks; bj++) {
      if (bi < blocks - 1) tryBridges('x', blockCenter(bi) + BLOCK / 2, blockCenter(bj));
      if (bj < blocks - 1) tryBridges('z', blockCenter(bj) + BLOCK / 2, blockCenter(bi));
    }
  }

  function tryBridges(axis, edge, across) {
    const count = rng() < 0.55 ? 2 : 1;
    let made = 0;
    for (let tries = 0; tries < 10 && made < count; tries++) {
      const t = across + rng.range(-BLOCK / 2 + 3, BLOCK / 2 - 3);
      const a = axis === 'x' ? findBuilding(edge - 1.5, t) : findBuilding(t, edge - 1.5);
      const b = axis === 'x' ? findBuilding(edge + STREET + 1.5, t) : findBuilding(t, edge + STREET + 1.5);
      if (!a || !b || a.tower || b.tower) continue;
      makeBridge(axis, edge, t, a, b);
      made++;
    }
  }

  function makeBridge(axis, edge, t, a, b) {
    const lowH = Math.min(a.h, b.h), highH = Math.max(a.h, b.h);
    // Pick a beam height so each end is at most ~2.2 m of climbing.
    let y = Math.max(lowH, highH - 2.2);
    if (y - lowH > 2.2) y = (lowH + highH) / 2;
    y = Math.round(y * 10) / 10;
    const crane = rng() < 0.5;
    const width = crane ? 0.8 : 1.2;
    const overlap = 1.4;
    const a0 = edge - overlap, a1 = edge + STREET + overlap;
    kit.beam(axis, a0, a1, t, y, width, crane ? 'crane' : 'plank');
    // Supports under any end that floats above its roof
    const thick = crane ? 0.45 : 0.25;
    const support = { side: 'plain', top: 'plain', color: 0x4a4a4e };
    for (const [bld, s0, s1] of [[a, a0, edge], [b, edge + STREET, a1]]) {
      if (y - thick > bld.h + LIP + 0.05) {
        if (axis === 'x') kit.solid(s0, bld.h, t - width / 2, s1, y - thick, t + width / 2, support);
        else kit.solid(t - width / 2, bld.h, s0, t + width / 2, y - thick, s1, support);
      }
    }
  }

  const group = kit.finish();
  for (const w of waterMeshes) group.add(w);
  // Neon Kōji: neon signs, roof outlines and billboards (own random numbers)
  if (neon) group.add(buildNeonDressing(kit.buildings.filter((b) => !b.shop).map((b) => ({ x0: b.minX, x1: b.maxX, z0: b.minZ, z1: b.maxZ, h: b.h })), makeRng(seed * 41 + 3), { signChance: 0.3, minY: 5 }));
  // Mirage Springs: casino neon, and the desert out to the mesas
  if (desert) {
    group.add(buildNeonDressing(kit.buildings.filter((b) => !b.shop).map((b) => ({ x0: b.minX, x1: b.maxX, z0: b.minZ, z1: b.maxZ, h: b.h })), makeRng(seed * 41 + 3), { signChance: 0.2, minY: 5, words: DESERT_WORDS, colors: DESERT_COLORS, slogans: DESERT_SLOGANS }));
    group.add(buildDesertRim(-extent - 200, extent + 200, seed));
  }

  // The shops, parks, trees and signs
  group.add(dress.build());
  // Lumière: the Iron Tower, in the park nearest the middle (its legs stand on the lawn)
  if (classic) {
    const pk = Object.entries(kindOf).filter(([, k]) => k === 'park').map(([key]) => key.split(',').map(Number))
      .sort((a, b) => Math.hypot(blockCenter(a[0]), blockCenter(a[1])) - Math.hypot(blockCenter(b[0]), blockCenter(b[1])))[0];
    if (pk) {
      const tw = buildIronTower(blockCenter(pk[0]), blockCenter(pk[1]), 96);
      group.add(tw.group);
      for (const [lx0, lz0, lx1, lz1] of tw.legs) kit.world.addBox(lx0, 0, lz0, lx1, 6, lz1, { tag: 'building' });
    }
  }

  // Frostvale: shop fronts (rooms behind the glass) on the street side of
  // the chalets too, at ground level. Only faces on a block's edge (not the
  // alleys), and not over a ladder or a place the level dresses itself
  // (shopAvoid: [x, z, radius]).
  if (alpine) {
    const shops = new Shopfronts({ alpine });
    const nearestBlock = (v) => Math.round((v + half) / PITCH) * PITCH - half;
    const isOpen = (x, z) => Math.abs(x - nearestBlock(x)) > BLOCK / 2 || Math.abs(z - nearestBlock(z)) > BLOCK / 2;
    const avoid = (x, z, r) => kit.ladders.some((l) => Math.abs(l.x - x) < r && Math.abs(l.z - z) < r)
      || shopAvoid.some(([ax, az, ar]) => Math.hypot(ax - x, az - z) < ar + r);
    addShopsToBuildings(shops, kit.buildings.filter((b) => !b.shop && b.h < 60).map((b) => ({ x0: b.minX, x1: b.maxX, z0: b.minZ, z1: b.maxZ })), isOpen,
      { chance: 0.6, avoid }, makeRng(seed * 31 + 7)); // (own random numbers: the rest of the city stays as it was)
    group.add(shops.build());
  }

  // Spawn on a normal building near the middle.
  const spawnB = kit.buildings
    .filter((b) => !b.tower && !b.shop)
    .sort((p, q) => Math.hypot((p.minX + p.maxX) / 2, (p.minZ + p.maxZ) / 2) -
                    Math.hypot((q.minX + q.maxX) / 2, (q.minZ + q.maxZ) / 2))[0];
  const spawn = findClearRoofSpot(kit.world, spawnB, rng) ||
    new THREE.Vector3((spawnB.minX + spawnB.maxX) / 2, spawnB.h + 0.05, (spawnB.minZ + spawnB.maxZ) / 2);

  // Street centre lines (for parking the Free Run car at street level)
  const blockCenters = Array.from({ length: blocks }, (_, i) => blockCenter(i));
  return { coastal, neon, classic, desert, block: BLOCK, water: waterRects, group, world: kit.world, buildings: kit.buildings, hideSpots: kit.hideSpots, ladders: kit.ladders, spawn, bounds: extent, blockCenters, pitch: PITCH,
    shops: dress.shops, parks: dress.parks, walks: dress.walks, blockKinds: kindOf,
    // (spots for hidden collectibles: the tops of towers, huts, upper roof levels, fire escapes, gazebos)
    perches: [...kit.perches, ...dress.perches, ...kit.buildings.filter((b) => b.tower).map((b) => new THREE.Vector3((b.minX + b.maxX) / 2, b.h, (b.minZ + b.maxZ) / 2))] };
}

function splitSpan(rng, start, length, parts) {
  // Returns [[a0,a1], [b0,b1], ...] with alley gaps between the parts.
  const gaps = [];
  for (let i = 0; i < parts - 1; i++) gaps.push(rng.range(1.6, 3.6));
  const usable = length - gaps.reduce((a, b) => a + b, 0);
  const weights = Array.from({ length: parts }, () => rng.range(0.7, 1.3));
  const wsum = weights.reduce((a, b) => a + b, 0);
  const out = [];
  let p = start;
  for (let i = 0; i < parts; i++) {
    const size = (weights[i] / wsum) * usable;
    out.push([p, p + size]);
    p += size + (gaps[i] || 0);
  }
  return out;
}

/** Random props on a roof, placed so they don't overlap each other. */
function addRoofProps(kit, b) {
  const rng = kit.rng;
  const used = [];
  const w = b.maxX - b.minX, d = b.maxZ - b.minZ;
  const y = b.h;
  const place = (fw, fd, margin = 1.2) => {
    for (let tries = 0; tries < 12; tries++) {
      const x = rng.range(b.minX + margin + fw / 2, b.maxX - margin - fw / 2);
      const z = rng.range(b.minZ + margin + fd / 2, b.maxZ - margin - fd / 2);
      if (Number.isNaN(x) || Number.isNaN(z)) return null;
      const r = { x0: x - fw / 2 - 0.9, x1: x + fw / 2 + 0.9, z0: z - fd / 2 - 0.9, z1: z + fd / 2 + 0.9 };
      if (used.some((u) => r.x0 < u.x1 && r.x1 > u.x0 && r.z0 < u.z1 && r.z1 > u.z0)) continue;
      used.push(r);
      return { x, z };
    }
    return null;
  };

  if (w > 12 && d > 12 && rng() < 0.25) {
    const sw = w * 0.45, sd = d * 0.45;
    const p = place(sw, sd, 2.5);
    if (p) {
      kit.setback(p.x, y, p.z, sw, sd);
      kit.crate(p.x - sw / 2 - 0.8, y, p.z); // rise 1.4 then 1.8 to the top
      used.push({ x0: p.x - sw / 2 - 1.6, x1: p.x - sw / 2, z0: p.z - 0.8, z1: p.z + 0.8 });
    }
  }
  if (rng() < 0.55) {
    const p = place(3.2, 3.2);
    if (p) kit.hut(p.x, y, p.z, rng.int(0, 3));
  }
  if (rng() < 0.3) {
    const p = place(3.6, 3.6);
    if (p) kit.waterTower(p.x, y, p.z);
  }
  const acCount = rng.int(0, 3);
  for (let i = 0; i < acCount; i++) {
    const p = place(1.7, 1.3, 1.0);
    if (p) kit.ac(p.x, y, p.z);
  }
  if (rng() < 0.35) {
    const p = place(2.4, 1.6, 1.0);
    if (p) kit.skylight(p.x, y, p.z);
  }
}

/** Find a spot on a roof with nothing on it (for spawning things). */
export function findClearRoofSpot(world, b, rng, clearance = 0.8) {
  for (let i = 0; i < 20; i++) {
    const x = rng.range(b.minX + 1.5, b.maxX - 1.5);
    const z = rng.range(b.minZ + 1.5, b.maxZ - 1.5);
    const top = world.groundHeight(x, z, b.h + 0.5);
    if (Math.abs(top - b.h) > 0.01) continue;
    if (world.overlaps(x - clearance, b.h + 0.05, z - clearance, x + clearance, b.h + 2, z + clearance)) continue;
    return new THREE.Vector3(x, b.h + 0.05, z);
  }
  return null;
}

export const CITY_CONSTANTS = { BLOCK, STREET, PITCH };

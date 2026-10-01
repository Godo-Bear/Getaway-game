import * as THREE from 'three';
import { RooftopKit, LIP } from './rooftopKit.js';

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

export function generateRooftopCity({ seed = 1, blocks = 6, alpine = false } = {}) {
  const kit = new RooftopKit({ seed });
  if (alpine) kit.noLadders = true;
  const rng = kit.rng;
  const half = ((blocks - 1) / 2) * PITCH;
  const blockCenter = (i) => i * PITCH - half;
  const extent = half + PITCH;

  kit.street(-extent - 200, -extent - 200, extent + 200, extent + 200);

  // --- Blocks and buildings
  for (let bi = 0; bi < blocks; bi++) {
    for (let bj = 0; bj < blocks; bj++) {
      const cx = blockCenter(bi), cz = blockCenter(bj);
      const x0 = cx - BLOCK / 2, z0 = cz - BLOCK / 2;
      kit.sidewalk(x0 - 2.5, z0 - 2.5, x0 + BLOCK + 2.5, z0 + BLOCK + 2.5);
      const xs = splitSpan(rng, x0, BLOCK, rng.int(2, 3));
      const zs = splitSpan(rng, z0, BLOCK, rng.int(2, 3));
      for (const [lx0, lx1] of xs) {
        for (const [lz0, lz1] of zs) {
          if (alpine) {
            kit.building(lx0, lz0, lx1, lz1, Math.round(rng.range(7, 10.5) * 2) / 2, { lips: false, tint: rng.pick(ALPINE_TINTS) });
            continue;
          }
          const tower = rng() < 0.09;
          // Normal roofs stay within a 4.5 m band so routes are always climbable.
          const h = tower ? rng.range(28, 36) : Math.round(rng.range(15, 19.5) * 2) / 2;
          const b = kit.building(lx0, lz0, lx1, lz1, h, { tower, lips: !tower });
          if (!tower) addRoofProps(kit, b);
          if (rng() < 0.12) kit.sign(b, rng.int(0, 3));
        }
      }
      for (let t = 4; t < BLOCK; t += 14) {
        kit.lamps.push([x0 + t, z0 - 2], [x0 + t, z0 + BLOCK + 2], [x0 - 2, z0 + t], [x0 + BLOCK + 2, z0 + t]);
      }
    }
  }

  // --- Bridges across the streets
  const findBuilding = (x, z) => kit.buildings.find((b) =>
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

  // Spawn on a normal building near the middle.
  const spawnB = kit.buildings
    .filter((b) => !b.tower)
    .sort((p, q) => Math.hypot((p.minX + p.maxX) / 2, (p.minZ + p.maxZ) / 2) -
                    Math.hypot((q.minX + q.maxX) / 2, (q.minZ + q.maxZ) / 2))[0];
  const spawn = findClearRoofSpot(kit.world, spawnB, rng) ||
    new THREE.Vector3((spawnB.minX + spawnB.maxX) / 2, spawnB.h + 0.05, (spawnB.minZ + spawnB.maxZ) / 2);

  // Street centre lines (for parking the Free Run car at street level)
  const blockCenters = Array.from({ length: blocks }, (_, i) => blockCenter(i));
  return { group, world: kit.world, buildings: kit.buildings, hideSpots: kit.hideSpots, ladders: kit.ladders, spawn, bounds: extent, blockCenters, pitch: PITCH };
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

import * as THREE from 'three';
import { makeRng } from '../core/utils.js';
import { CollisionWorld } from '../core/collision.js';
import { MeshBatcher } from './meshBatcher.js';
import { getMaterials, makeGlowMaterial, makeTextTexture, getGlowTexture, FACADE_UV } from './materials.js';

// Procedural rooftop city for the on-foot modes.
//
// Layout: a grid of city blocks separated by wide streets (too wide to jump).
// Each block is cut into several buildings separated by narrow alleys
// (1.5-3.5 m, jumpable). Streets are crossed on crane beams / planks.
//
// Every building's roof gets props: AC units (vault over them), stairwell huts
// and water towers (hide from the helicopter), skylights, and sometimes a
// taller "setback" level with a crate to climb up.
//
// All static geometry goes through MeshBatcher so the whole city is drawn in
// a handful of draw calls.

const BLOCK = 42;          // block size (m)
const STREET = 13;         // street width (m) - too far to jump
const PITCH = BLOCK + STREET;
const LIP = 0.35;          // height of the little roof-edge lip (auto step-up)

const WALL_TINTS = [0x8a8f9c, 0x9c8a80, 0x7f8f9a, 0x9a9690, 0x8c8496, 0xa09080, 0x7c8580];

export function generateRooftopCity({ seed = 1, blocks = 6 } = {}) {
  const rng = makeRng(seed);
  const world = new CollisionWorld(12);
  const batch = new MeshBatcher();
  const mats = getMaterials();
  const group = new THREE.Group();

  const buildings = [];   // { minX, maxX, minZ, maxZ, h, tower }
  const hideSpots = [];   // centres of good hiding places (for AI/hints)
  const waterTanks = [];  // positions for instanced cylinders
  const lamps = [];       // street lamp positions
  const signs = [];

  const half = ((blocks - 1) / 2) * PITCH;
  const blockCenter = (i) => i * PITCH - half;

  // ----------------------------------------------------------------------
  // Streets (ground level). One big box for collision; if the player touches
  // it they fell off the roofs.
  // ----------------------------------------------------------------------
  const extent = half + PITCH;
  world.addBox(-extent - 200, -2, -extent - 200, extent + 200, 0, extent + 200, { tag: 'street' });
  batch.addBox({ x: -extent - 200, y: -0.5, z: -extent - 200 }, { x: extent + 200, y: 0, z: extent + 200 },
    { side: null, top: 'asphalt', color: 0xffffff, topScale: [8, 8] });

  // ----------------------------------------------------------------------
  // Blocks and buildings
  // ----------------------------------------------------------------------
  for (let bi = 0; bi < blocks; bi++) {
    for (let bj = 0; bj < blocks; bj++) {
      const cx = blockCenter(bi), cz = blockCenter(bj);
      const x0 = cx - BLOCK / 2, z0 = cz - BLOCK / 2;

      // Sidewalk slab around the block
      batch.addBox({ x: x0 - 2.5, y: 0, z: z0 - 2.5 }, { x: x0 + BLOCK + 2.5, y: 0.15, z: z0 + BLOCK + 2.5 },
        { side: 'concrete', top: 'concrete', color: 0x6a6a70, uvScale: [4, 4], topScale: [4, 4] });

      // Split the block into columns and rows of lots with alleys between.
      const xs = splitSpan(rng, x0, BLOCK, rng.int(2, 3));
      const zs = splitSpan(rng, z0, BLOCK, rng.int(2, 3));
      for (const [lx0, lx1] of xs) {
        for (const [lz0, lz1] of zs) {
          const b = addBuilding(lx0, lx1, lz0, lz1);
          buildings.push(b);
        }
      }

      // Street lamps along this block's sidewalks
      for (let t = 4; t < BLOCK; t += 14) {
        lamps.push([x0 + t, z0 - 2], [x0 + t, z0 + BLOCK + 2], [x0 - 2, z0 + t], [x0 + BLOCK + 2, z0 + t]);
      }
    }
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

  function addBuilding(x0, x1, z0, z1) {
    const tower = rng() < 0.09;
    // Normal roofs stay within a 4.5 m band so routes are always climbable.
    const h = tower ? rng.range(28, 36) : Math.round(rng.range(15, 19.5) * 2) / 2;
    const tint = rng.pick(WALL_TINTS);
    const uvOff = [rng(), Math.floor(rng() * 8) / 8];

    world.addBox(x0, 0, z0, x1, h, z1, { tag: 'building' });
    batch.addBox({ x: x0, y: 0, z: z0 }, { x: x1, y: h, z: z1 },
      { side: 'wall', top: 'roof', color: tint, uvScale: FACADE_UV, uvOffset: uvOff, topScale: [6, 6] });

    const b = { minX: x0, maxX: x1, minZ: z0, maxZ: z1, h, tower };
    if (!tower) {
      addLips(b);
      addRoofProps(b);
    }
    // Occasional neon sign on a street-facing wall
    if (rng() < 0.12) signs.push({ b, side: rng.int(0, 3) });
    return b;
  }

  /** Small lips along the roof edges (walked over automatically). */
  function addLips(b) {
    const t = 0.3, y = b.h;
    const add = (ax0, az0, ax1, az1) => {
      world.addBox(ax0, y, az0, ax1, y + LIP, az1, { tag: 'lip' });
      batch.addBox({ x: ax0, y, z: az0 }, { x: ax1, y: y + LIP, z: az1 },
        { side: 'concrete', top: 'concrete', color: 0x9a9a9a, uvScale: [3, 3], topScale: [3, 3] });
    };
    add(b.minX, b.minZ, b.maxX, b.minZ + t);
    add(b.minX, b.maxZ - t, b.maxX, b.maxZ);
    add(b.minX, b.minZ + t, b.minX + t, b.maxZ - t);
    add(b.maxX - t, b.minZ + t, b.maxX, b.maxZ - t);
  }

  function addRoofProps(b) {
    const used = []; // footprints already taken on this roof
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
    const solid = (x, z, fw, fh, fd, opts, y0 = y) => {
      world.addBlock(x, y0, z, fw, fh, fd, { tag: opts.tag || 'prop' });
      batch.addBlock(x, y0, z, fw, fh, fd, opts);
    };

    // Setback: a taller upper level on bigger roofs, with a crate to climb.
    if (w > 12 && d > 12 && rng() < 0.25) {
      const sw = w * 0.45, sd = d * 0.45, sh = 3.2;
      const p = place(sw, sd, 2.5);
      if (p) {
        solid(p.x, p.z, sw, sh, sd, { side: 'wall', top: 'roof', color: 0x8a8f9c, uvScale: FACADE_UV, topScale: [6, 6] });
        // crate in front of one side (rise 1.4 then 1.8 to the top)
        solid(p.x - sw / 2 - 0.8, p.z, 1.4, 1.4, 1.4, { side: 'plain', top: 'plain', color: 0x7a5a36 });
        used.push({ x0: p.x - sw / 2 - 1.6, x1: p.x - sw / 2, z0: p.z - 0.8, z1: p.z + 0.8 });
      }
    }

    // Stairwell hut: hollow with a doorway (step inside to hide).
    if (rng() < 0.55) {
      const p = place(3.2, 3.2);
      if (p) {
        addHut(p.x, y, p.z, rng.int(0, 3));
        hideSpots.push(new THREE.Vector3(p.x, y, p.z));
      }
    }

    // Water tower: tank on legs (stand underneath to hide).
    if (rng() < 0.3) {
      const p = place(3.6, 3.6);
      if (p) {
        const legH = 2.3, tankH = 3.2, r = 1.7;
        for (const [ox, oz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) {
          solid(p.x + ox, p.z + oz, 0.22, legH, 0.22, { side: 'plain', top: 'plain', color: 0x3a2e24 });
        }
        // Tank collider is a box; the visible tank is an instanced cylinder.
        world.addBlock(p.x, y + legH, p.z, r * 2, tankH, r * 2, { tag: 'tank' });
        batch.addBlock(p.x, y + legH - 0.15, p.z, 3.8, 0.15, 3.8, { side: 'plain', top: 'plain', color: 0x3a2e24 });
        waterTanks.push(new THREE.Vector3(p.x, y + legH, p.z));
        hideSpots.push(new THREE.Vector3(p.x, y, p.z));
      }
    }

    // AC units: low boxes to vault over.
    const acCount = rng.int(0, 3);
    for (let i = 0; i < acCount; i++) {
      const p = place(1.7, 1.3, 1.0);
      if (p) {
        solid(p.x, p.z, 1.7, 1.1, 1.3, { side: 'metal', top: 'metal', color: 0xc0c4cc, uvScale: [1.7, 1.1] });
        batch.addBlock(p.x, y + 1.1, p.z, 0.9, 0.05, 0.9, { side: null, top: 'plain', color: 0x222222 }); // fan grille
      }
    }

    // Skylight: low glass box (glowing from inside).
    if (rng() < 0.35) {
      const p = place(2.4, 1.6, 1.0);
      if (p) {
        solid(p.x, p.z, 2.4, 0.6, 1.6, { side: 'concrete', top: null, color: 0x777777 });
        batch.addBlock(p.x, y + 0.6, p.z, 2.2, 0.02, 1.4, { side: null, top: 'glow', color: 0x6a88a8 });
      }
    }
  }

  function addHut(x, y, z, doorSide) {
    const s = 3.0, h = 2.6, t = 0.2, door = 1.3, doorH = 2.2;
    const wallOpts = { side: 'concrete', top: 'concrete', color: 0x8d8a84, uvScale: [3, 3] };
    const wall = (ax0, az0, ax1, az1, y0 = y, y1 = y + h) => {
      world.addBox(ax0, y0, az0, ax1, y1, az1, { tag: 'hut' });
      batch.addBox({ x: ax0, y: y0, z: az0 }, { x: ax1, y: y1, z: az1 }, wallOpts);
    };
    const x0 = x - s / 2, x1 = x + s / 2, z0 = z - s / 2, z1 = z + s / 2;
    // Each side is either a full wall or a wall with a doorway gap.
    const sides = [
      // [along-axis, fixed coordinate(s)]
      () => wallWithDoor('x', x0, x1, z0, z0 + t, doorSide === 0),
      () => wallWithDoor('x', x0, x1, z1 - t, z1, doorSide === 1),
      () => wallWithDoor('z', z0 + t, z1 - t, x0, x0 + t, doorSide === 2),
      () => wallWithDoor('z', z0 + t, z1 - t, x1 - t, x1, doorSide === 3),
    ];
    function wallWithDoor(axis, a0, a1, f0, f1, hasDoor) {
      const mk = (p0, p1, y0, y1) => (axis === 'x' ? wall(p0, f0, p1, f1, y0, y1) : wall(f0, p0, f1, p1, y0, y1));
      if (!hasDoor) return mk(a0, a1);
      const mid = (a0 + a1) / 2;
      mk(a0, mid - door / 2);
      mk(mid + door / 2, a1);
      mk(mid - door / 2, mid + door / 2, y + doorH, y + h); // lintel
    }
    sides.forEach((f) => f());
    // Roof slab
    world.addBox(x0, y + h, z0, x1, y + h + 0.2, z1, { tag: 'hut' });
    batch.addBox({ x: x0 - 0.1, y: y + h, z: z0 - 0.1 }, { x: x1 + 0.1, y: y + h + 0.2, z: z1 + 0.1 },
      { side: 'concrete', top: 'roof', color: 0x77746e, uvScale: [3, 3], topScale: [3, 3] });
    // Dim door light
    batch.addBlock(x, y + 0.02, z, 1.2, 0.01, 1.2, { side: null, top: 'glow', color: 0x3a2a12 });
  }

  // ----------------------------------------------------------------------
  // Bridges across the streets (crane beams and planks)
  // ----------------------------------------------------------------------
  const findBuilding = (x, z) => buildings.find((b) =>
    x > b.minX + 0.8 && x < b.maxX - 0.8 && z > b.minZ + 0.8 && z < b.maxZ - 0.8);

  for (let bi = 0; bi < blocks; bi++) {
    for (let bj = 0; bj < blocks; bj++) {
      // Bridge east (to block bi+1) and south (to block bj+1)
      if (bi < blocks - 1) tryBridges('x', blockCenter(bi) + BLOCK / 2, blockCenter(bj));
      if (bj < blocks - 1) tryBridges('z', blockCenter(bj) + BLOCK / 2, blockCenter(bi));
    }
  }

  function tryBridges(axis, edge, across) {
    // `edge` = coordinate where the street starts along `axis`.
    // `across` = centre of the block along the other axis.
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
    // Pick a beam height so each end is at most ~2.3 m of climbing.
    let y = Math.max(lowH, highH - 2.3);
    if (y - lowH > 2.3) y = (lowH + highH) / 2;
    y = Math.round(y * 10) / 10;
    const width = rng() < 0.5 ? 1.2 : 0.8; // narrower planks = harder
    const thick = 0.35;
    const crane = width < 1;
    const overlap = 1.4;
    const a0 = edge - overlap, a1 = edge + STREET + overlap;
    const box = (p0, p1, y0, y1) => (axis === 'x'
      ? [{ x: p0, y: y0, z: t - width / 2 }, { x: p1, y: y1, z: t + width / 2 }]
      : [{ x: t - width / 2, y: y0, z: p0 }, { x: t + width / 2, y: y1, z: p1 }]);
    const add = (p0, p1, y0, y1, opts) => {
      const [mn, mx] = box(p0, p1, y0, y1);
      world.addBox(mn.x, mn.y, mn.z, mx.x, mx.y, mx.z, { tag: 'bridge' });
      batch.addBox(mn, mx, opts);
    };
    const beamOpts = crane
      ? { side: 'plain', top: 'metal', color: 0xc0551e, uvScale: [1, 1] }
      : { side: 'plain', top: 'plain', color: 0x6b5236 };
    add(a0, a1, y - thick, y, beamOpts);
    // Supports under any end that floats above its roof
    for (const [bld, s0, s1] of [[a, a0, edge], [b, edge + STREET, a1]]) {
      if (y - thick > bld.h + LIP + 0.05) {
        add(s0, s1, bld.h, y - thick, { side: 'plain', top: 'plain', color: 0x4a4a4e });
      }
    }
  }

  // ----------------------------------------------------------------------
  // Build meshes
  // ----------------------------------------------------------------------
  group.add(batch.build(mats));

  // Water tanks: one InstancedMesh for all of them (1 draw call).
  if (waterTanks.length) {
    const geo = new THREE.CylinderGeometry(1.7, 1.7, 3.2, 14);
    geo.translate(0, 1.6, 0);
    const tankMat = new THREE.MeshLambertMaterial({ color: 0x6b4a32 });
    const tanks = new THREE.InstancedMesh(geo, tankMat, waterTanks.length);
    const m = new THREE.Matrix4();
    waterTanks.forEach((p, i) => tanks.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z)));
    tanks.castShadow = true;
    tanks.receiveShadow = true;
    group.add(tanks);
    // Conical roofs
    const capGeo = new THREE.ConeGeometry(1.85, 1.0, 14);
    capGeo.translate(0, 3.7, 0);
    const caps = new THREE.InstancedMesh(capGeo, new THREE.MeshLambertMaterial({ color: 0x3e3e44 }), waterTanks.length);
    waterTanks.forEach((p, i) => caps.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z)));
    caps.castShadow = true;
    group.add(caps);
  }

  group.add(buildStreetLamps(lamps));
  group.add(buildSigns(signs, rng));

  // Spawn on a normal (non-tower) building near the middle.
  const spawnB = buildings
    .filter((b) => !b.tower)
    .sort((p, q) => Math.hypot((p.minX + p.maxX) / 2, (p.minZ + p.maxZ) / 2) -
                    Math.hypot((q.minX + q.maxX) / 2, (q.minZ + q.maxZ) / 2))[0];
  const spawn = findClearRoofSpot(world, spawnB, rng) ||
    new THREE.Vector3((spawnB.minX + spawnB.maxX) / 2, spawnB.h + 0.05, (spawnB.minZ + spawnB.maxZ) / 2);

  return { group, world, buildings, hideSpots, spawn, bounds: extent };
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

/** Instanced street lamps: poles, glowing heads and fake light pools. */
function buildStreetLamps(lamps) {
  const g = new THREE.Group();
  const n = lamps.length;
  const m = new THREE.Matrix4();

  const poleGeo = new THREE.BoxGeometry(0.18, 6, 0.18);
  poleGeo.translate(0, 3, 0);
  const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshLambertMaterial({ color: 0x2a2c30 }), n);

  const headGeo = new THREE.BoxGeometry(0.7, 0.2, 0.4);
  headGeo.translate(0, 6, 0);
  const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshBasicMaterial({ color: 0xffc070, toneMapped: false }), n);

  // Pool of amber light on the ground (additive disc, no real light needed).
  const poolGeo = new THREE.PlaneGeometry(11, 11);
  poolGeo.rotateX(-Math.PI / 2);
  poolGeo.translate(0, 0.2, 0);
  const poolMat = new THREE.MeshBasicMaterial({
    map: getGlowTexture(), color: 0xff9a3a, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  const pools = new THREE.InstancedMesh(poolGeo, poolMat, n);

  // Halo around the lamp head (visible from rooftops)
  const haloGeo = new THREE.PlaneGeometry(2.4, 2.4);
  haloGeo.rotateX(-Math.PI / 2);
  haloGeo.translate(0, 5.85, 0);
  const halos = new THREE.InstancedMesh(haloGeo, poolMat.clone(), n);
  halos.material.opacity = 0.9;

  lamps.forEach(([x, z], i) => {
    m.makeTranslation(x, 0, z);
    poles.setMatrixAt(i, m);
    heads.setMatrixAt(i, m);
    pools.setMatrixAt(i, m);
    halos.setMatrixAt(i, m);
  });
  g.add(poles, heads, pools, halos);
  return g;
}

const SIGN_TEXTS = [
  ['THE ANCHOR', '#ffb020'], ['HOTEL', '#ff3fa4'], ['24H DINER', '#2fe0ff'],
  ['PAWN', '#4dffa6'], ['LIQUOR', '#ff5a3a'], ['HARBOR TRUST', '#ffd27a'], ['KARAOKE', '#c070ff'],
];

function buildSigns(signs, rng) {
  const g = new THREE.Group();
  const textures = SIGN_TEXTS.map(([t, c]) => makeTextTexture(t, { color: c }));
  for (const { b, side } of signs) {
    const i = rng.int(0, SIGN_TEXTS.length - 1);
    const mat = new THREE.MeshBasicMaterial({
      map: textures[i], transparent: true, toneMapped: false, depthWrite: false, side: THREE.DoubleSide,
    });
    const w = 8, h = 2;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    const y = Math.min(b.h - 3, 8 + rng() * 5);
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    if (side === 0) { mesh.position.set(cx, y, b.minZ - 0.08); mesh.rotation.y = Math.PI; }
    if (side === 1) { mesh.position.set(cx, y, b.maxZ + 0.08); }
    if (side === 2) { mesh.position.set(b.minX - 0.08, y, cz); mesh.rotation.y = -Math.PI / 2; }
    if (side === 3) { mesh.position.set(b.maxX + 0.08, y, cz); mesh.rotation.y = Math.PI / 2; }
    g.add(mesh);
  }
  return g;
}

export const CITY_CONSTANTS = { BLOCK, STREET, PITCH };

import * as THREE from 'three';
import { makeRng } from '../core/utils.js';
import { CollisionWorld } from '../core/collision.js';
import { MeshBatcher } from './meshBatcher.js';
import { getMaterials, makeGlowMaterial, makeTextTexture, getGlowTexture, FACADE_UV } from './materials.js';

// RooftopKit: a toolbox of rooftop building pieces.
//
// Both the procedural city (Free Run / Rooftop Run) and hand-made story
// levels are built with these same pieces, so they look and play the same.
// Every piece does two things:
//   1. adds solid boxes to the CollisionWorld (so you can stand on/bump into it)
//   2. adds geometry to the MeshBatcher (so you can see it)
// Call finish() at the end to get one THREE.Group with everything merged.

export const LIP = 0.35; // roof-edge lip height (low enough to walk over)
export const WALL_TINTS = [0x8a8f9c, 0x9c8a80, 0x7f8f9a, 0x9a9690, 0x8c8496, 0xa09080, 0x7c8580];

const SIGN_TEXTS = [
  ['THE ANCHOR', '#ffb020'], ['HOTEL', '#ff3fa4'], ['24H DINER', '#2fe0ff'],
  ['PAWN', '#4dffa6'], ['LIQUOR', '#ff5a3a'], ['KARAOKE', '#c070ff'],
];

export class RooftopKit {
  constructor({ seed = 1 } = {}) {
    this.rng = makeRng(seed);
    this.world = new CollisionWorld(12);
    this.batch = new MeshBatcher();
    this.buildings = [];   // { minX, maxX, minZ, maxZ, h, tower }
    this.hideSpots = [];
    this.tanks = [];       // water tank positions (drawn as instanced cylinders)
    this.lamps = [];       // street lamps [x, z]
    this.signs = [];       // neon signs { b, side, text? }
    this.extra = new THREE.Group(); // one-off meshes (crane towers, big signs...)
    this.zipLines = [];    // [{ a, b }] handed to the player controller
  }

  /** A solid box: collider + visible geometry. */
  solid(x0, y0, z0, x1, y1, z1, look, tag = 'prop') {
    this.world.addBox(x0, y0, z0, x1, y1, z1, { tag });
    this.batch.addBox({ x: x0, y: y0, z: z0 }, { x: x1, y: y1, z: z1 }, look);
  }

  /** Solid box from centre-bottom and size. */
  block(x, y, z, w, h, d, look, tag) {
    this.solid(x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2, look, tag);
  }

  // ------------------------------------------------------------------
  // Ground level
  // ------------------------------------------------------------------

  /** The street: one huge box. Touching it = you fell. */
  street(minX, minZ, maxX, maxZ) {
    this.world.addBox(minX, -2, minZ, maxX, 0, maxZ, { tag: 'street' });
    this.batch.addBox({ x: minX, y: -0.5, z: minZ }, { x: maxX, y: 0, z: maxZ },
      { side: null, top: 'asphalt', topScale: [8, 8] });
  }

  sidewalk(x0, z0, x1, z1) {
    this.batch.addBox({ x: x0, y: 0, z: z0 }, { x: x1, y: 0.15, z: z1 },
      { side: 'concrete', top: 'concrete', color: 0x6a6a70, uvScale: [4, 4], topScale: [4, 4] });
  }

  // ------------------------------------------------------------------
  // Buildings
  // ------------------------------------------------------------------

  /**
   * A building from the street up to height h.
   * opts.lips  - add the little edge lips on the roof (default true)
   * opts.tint  - wall colour
   * opts.windows - false = plain concrete (garages, the bank)
   */
  building(x0, z0, x1, z1, h, { tint, lips = true, windows = true, tower = false, top = 'roof' } = {}) {
    const rng = this.rng;
    this.world.addBox(x0, 0, z0, x1, h, z1, { tag: 'building' });
    this.batch.addBox({ x: x0, y: 0, z: z0 }, { x: x1, y: h, z: z1 },
      windows
        ? { side: 'wall', top, color: tint ?? rng.pick(WALL_TINTS), uvScale: FACADE_UV, uvOffset: [rng(), Math.floor(rng() * 8) / 8], topScale: [6, 6] }
        : { side: 'concrete', top, color: tint ?? 0x8a8a88, uvScale: [4, 4], topScale: [6, 6] });
    const b = { minX: x0, maxX: x1, minZ: z0, maxZ: z1, h, tower };
    this.buildings.push(b);
    if (lips) this.lips(b);
    return b;
  }

  /** Small lips along the roof edges (walked over automatically). */
  lips(b, t = 0.3) {
    const y = b.h;
    const look = { side: 'concrete', top: 'concrete', color: 0x9a9a9a, uvScale: [3, 3], topScale: [3, 3] };
    this.solid(b.minX, y, b.minZ, b.maxX, y + LIP, b.minZ + t, look, 'lip');
    this.solid(b.minX, y, b.maxZ - t, b.maxX, y + LIP, b.maxZ, look, 'lip');
    this.solid(b.minX, y, b.minZ + t, b.minX + t, y + LIP, b.maxZ - t, look, 'lip');
    this.solid(b.maxX - t, y, b.minZ + t, b.maxX, y + LIP, b.maxZ - t, look, 'lip');
  }

  // ------------------------------------------------------------------
  // Roof props
  // ------------------------------------------------------------------

  /** AC unit: 1.1 m tall, vault over it. */
  ac(x, y, z, rotated = false) {
    const w = rotated ? 1.3 : 1.7, d = rotated ? 1.7 : 1.3;
    this.block(x, y, z, w, 1.1, d, { side: 'metal', top: 'metal', color: 0xc0c4cc, uvScale: [1.7, 1.1] });
    this.batch.addBlock(x, y + 1.1, z, 0.9, 0.05, 0.9, { side: null, top: 'plain', color: 0x222222 });
  }

  /** Wooden crate: a step up to something higher. */
  crate(x, y, z, size = 1.4) {
    this.block(x, y, z, size, size, size, { side: 'plain', top: 'plain', color: 0x7a5a36 });
  }

  /** Skylight: low glowing glass box. */
  skylight(x, y, z, w = 2.4, d = 1.6) {
    this.block(x, y, z, w, 0.6, d, { side: 'concrete', top: null, color: 0x777777 });
    this.batch.addBlock(x, y + 0.6, z, w - 0.2, 0.02, d - 0.2, { side: null, top: 'glow', color: 0x6a88a8 });
  }

  /** Water tower: tank on legs. Standing underneath hides you from the helicopter. */
  waterTower(x, y, z) {
    const legH = 2.3, tankH = 3.2, r = 1.7;
    for (const [ox, oz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) {
      this.block(x + ox, y, z + oz, 0.22, legH, 0.22, { side: 'plain', top: 'plain', color: 0x3a2e24 });
    }
    this.world.addBlock(x, y + legH, z, r * 2, tankH, r * 2, { tag: 'tank' });
    this.batch.addBlock(x, y + legH - 0.15, z, 3.8, 0.15, 3.8, { side: 'plain', top: 'plain', color: 0x3a2e24 });
    this.tanks.push(new THREE.Vector3(x, y + legH, z));
    this.hideSpots.push(new THREE.Vector3(x, y, z));
  }

  /**
   * Stairwell hut: hollow with a doorway. Step inside to hide.
   * doorSide: 0 = -Z, 1 = +Z, 2 = -X, 3 = +X
   */
  hut(x, y, z, doorSide = 0, size = 3.0) {
    const s = size, h = 2.6, t = 0.2, door = 1.3, doorH = 2.2;
    const look = { side: 'concrete', top: 'concrete', color: 0x8d8a84, uvScale: [3, 3] };
    const wall = (ax0, az0, ax1, az1, y0 = y, y1 = y + h) => this.solid(ax0, y0, az0, ax1, y1, az1, look, 'hut');
    const x0 = x - s / 2, x1 = x + s / 2, z0 = z - s / 2, z1 = z + s / 2;
    const wallWithDoor = (axis, a0, a1, f0, f1, hasDoor) => {
      const mk = (p0, p1, y0, y1) => (axis === 'x' ? wall(p0, f0, p1, f1, y0, y1) : wall(f0, p0, f1, p1, y0, y1));
      if (!hasDoor) return mk(a0, a1);
      const mid = (a0 + a1) / 2;
      mk(a0, mid - door / 2);
      mk(mid + door / 2, a1);
      mk(mid - door / 2, mid + door / 2, y + doorH, y + h); // lintel
    };
    wallWithDoor('x', x0, x1, z0, z0 + t, doorSide === 0);
    wallWithDoor('x', x0, x1, z1 - t, z1, doorSide === 1);
    wallWithDoor('z', z0 + t, z1 - t, x0, x0 + t, doorSide === 2);
    wallWithDoor('z', z0 + t, z1 - t, x1 - t, x1, doorSide === 3);
    this.world.addBox(x0, y + h, z0, x1, y + h + 0.2, z1, { tag: 'hut' });
    this.batch.addBox({ x: x0 - 0.1, y: y + h, z: z0 - 0.1 }, { x: x1 + 0.1, y: y + h + 0.2, z: z1 + 0.1 },
      { side: 'concrete', top: 'roof', color: 0x77746e, uvScale: [3, 3], topScale: [3, 3] });
    this.batch.addBlock(x, y + 0.02, z, 1.2, 0.01, 1.2, { side: null, top: 'glow', color: 0x3a2a12 });
    this.hideSpots.push(new THREE.Vector3(x, y, z));
  }

  /** A taller upper level on a roof (climb it from a crate or AC unit). */
  setback(x, y, z, w, d, h = 3.2, tint = 0x8a8f9c) {
    this.block(x, y, z, w, h, d, { side: 'wall', top: 'roof', color: tint, uvScale: FACADE_UV, topScale: [6, 6] }, 'building');
  }

  /**
   * Beam across a gap along `axis` ('x' or 'z'), from a0 to a1, centred on
   * `t` on the other axis, with its walking surface at height y.
   * style: 'crane' (orange steel girder) or 'plank' (wood)
   */
  beam(axis, a0, a1, t, y, width = 1.0, style = 'crane') {
    const thick = style === 'crane' ? 0.45 : 0.25;
    const look = style === 'crane'
      ? { side: 'plain', top: 'metal', color: 0xc0551e, uvScale: [1, 1] }
      : { side: 'plain', top: 'plain', color: 0x6b5236 };
    if (axis === 'x') this.solid(Math.min(a0, a1), y - thick, t - width / 2, Math.max(a0, a1), y, t + width / 2, look, 'bridge');
    else this.solid(t - width / 2, y - thick, Math.min(a0, a1), t + width / 2, y, Math.max(a0, a1), look, 'bridge');
  }

  /** A flat platform (fire-escape landing, catwalk...). */
  platform(x0, z0, x1, z1, y, thick = 0.15, color = 0x2c2f35) {
    this.solid(x0, y - thick, z0, x1, y, z1, { side: 'plain', top: 'metal', color, uvScale: [1, 1] }, 'platform');
  }

  /**
   * Fire escape on a wall: zig-zagging landings you climb by mantling from
   * one to the next (each 2.2-2.4 m higher and shifted sideways).
   * wallZ: the wall's z coordinate; out = +1/-1 which side of the wall.
   * xs: array of [x0, x1, y] for each landing.
   */
  fireEscapeZ(wallZ, out, landings, depth = 1.5) {
    const z0 = out > 0 ? wallZ : wallZ - depth;
    const z1 = out > 0 ? wallZ + depth : wallZ;
    const railZ = out > 0 ? z1 - 0.05 : z0 + 0.05;
    for (const [x0, x1, y] of landings) {
      this.platform(x0, z0, x1, z1, y, 0.15, 0x2a2c31);
      // Thin handrail (visual only, so it never blocks a jump)
      this.batch.addBox({ x: x0, y: y + 0.95, z: railZ - 0.03 }, { x: x1, y: y + 1.0, z: railZ + 0.03 }, { side: 'plain', top: 'plain', color: 0x1d1f23 });
      for (let x = x0 + 0.1; x <= x1; x += 1.0) {
        this.batch.addBox({ x: x - 0.03, y, z: railZ - 0.03 }, { x: x + 0.03, y: y + 0.95, z: railZ + 0.03 }, { side: 'plain', top: null, color: 0x1d1f23 });
      }
    }
  }

  /**
   * Fire-escape staircase running along +X against a wall at z = wallZ,
   * sticking out `depth` metres toward +Z (over an alley).
   * parts: [{ landing: length } | { steps: count }] in order, starting at x0, height y0.
   * Steps are 0.4 m high and 0.6 m deep, low enough to walk up without jumping.
   */
  fireEscapeStairsZ(wallZ, depth, x0, y0, parts) {
    const z0 = wallZ, z1 = wallZ + depth;
    const look = { side: 'plain', top: 'metal', color: 0x2a2c31, uvScale: [1, 1] };
    const rail = { side: 'plain', top: 'plain', color: 0x1d1f23 };
    const RISE = 0.4, RUN = 0.6, base = y0 - 0.15;
    let x = x0, y = y0;
    for (const part of parts) {
      if (part.landing) {
        this.solid(x, base, z0, x + part.landing, y, z1, look, 'platform');
        this.batch.addBox({ x, y: y + 0.95, z: z1 - 0.08 }, { x: x + part.landing, y: y + 1.0, z: z1 - 0.02 }, rail);
        x += part.landing;
      } else {
        for (let i = 0; i < part.steps; i++) {
          y += RISE;
          this.solid(x, base, z0, x + RUN, y, z1, look, 'platform');
          this.batch.addBox({ x, y: y + 0.95, z: z1 - 0.08 }, { x: x + RUN, y: y + 1.0, z: z1 - 0.02 }, rail);
          x += RUN;
        }
      }
    }
    return { x, y };
  }

  /** Billboard with a walkable catwalk in front (a high, hard-to-reach spot). */
  billboard(x, y, z, width, text, color, facing = 1) {
    // Catwalk (collider) and the board itself (collider, too tall to climb)
    const cz = z + facing * 0.9;
    this.solid(x - width / 2, y - 0.15, cz - 0.6, x + width / 2, y, cz + 0.6, { side: 'plain', top: 'metal', color: 0x3a3c42, uvScale: [1, 1] }, 'platform');
    this.solid(x - width / 2, y + 0.3, z - 0.15, x + width / 2, y + 4.8, z + 0.15, { side: 'plain', top: 'plain', color: 0x222428 }, 'sign');
    // Support posts down to the roof
    for (const px of [x - width / 2 + 0.3, x + width / 2 - 0.3]) {
      this.batch.addBox({ x: px - 0.12, y: y - 4.6, z: z - 0.12 }, { x: px + 0.12, y: y + 0.3, z: z + 0.12 }, { side: 'plain', top: null, color: 0x2a2c30 });
    }
    // Printed face (lit by little lamps = MeshBasic)
    const tex = makeTextTexture(text, { color, bg: '#101318', width: 1024, height: 256, font: 'bold 150px "Bebas Neue", Impact, sans-serif' });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(width - 0.2, 4.3), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    face.position.set(x, y + 2.55, z + facing * 0.16);
    if (facing < 0) face.rotation.y = Math.PI;
    this.extra.add(face);
  }

  /** Decorative construction crane: a lattice mast from the street. */
  craneMast(x, z, h, armDir = 1, armLen = 18) {
    const look = { side: 'plain', top: 'plain', color: 0xc9861e };
    this.world.addBox(x - 1, 0, z - 1, x + 1, h, z + 1, { tag: 'crane' });
    for (const [ox, oz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) {
      this.batch.addBox({ x: x + ox - 0.12, y: 0, z: z + oz - 0.12 }, { x: x + ox + 0.12, y: h, z: z + oz + 0.12 }, look);
    }
    for (let y = 3; y < h; y += 3) {
      this.batch.addBox({ x: x - 1, y, z: z - 1 }, { x: x + 1, y: y + 0.18, z: z + 1 }, { side: 'plain', top: null, color: 0xa86a14 });
    }
    // Jib arm and red warning light
    this.batch.addBox({ x: Math.min(x, x + armDir * armLen), y: h, z: z - 0.8 }, { x: Math.max(x, x + armDir * armLen), y: h + 1.4, z: z + 0.8 }, look);
    this.batch.addBlock(x, h + 1.4, z, 2.4, 2, 2.4, { side: 'plain', top: 'plain', color: 0xd0d0d0 });
    const light = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0xff2020, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    light.position.set(x + armDir * armLen, h + 1.8, z);
    light.scale.setScalar(2.5);
    this.extra.add(light);
  }

  // ------------------------------------------------------------------
  // Chapter 2 / 3 pieces
  // ------------------------------------------------------------------

  /**
   * Zip line from (ax,ay,az) [high end] to (bx,by,bz). The y values are the
   * CABLE heights: put them ~2.3 m above the roof you start from and ~2.2 m
   * above the roof you land on (you hang 2 m below the cable).
   */
  zipLine(ax, ay, az, bx, by, bz, { startRoof = ay - 2.3, endRoof = by - 2.2 } = {}) {
    const a = new THREE.Vector3(ax, ay, az), b = new THREE.Vector3(bx, by, bz);
    this.zipLines.push({ a, b });
    // Anchor posts (visual only, so they never block the ride)
    const post = { side: 'plain', top: 'plain', color: 0x3a3c42 };
    this.batch.addBox({ x: ax - 0.12, y: startRoof, z: az - 0.12 }, { x: ax + 0.12, y: ay + 0.4, z: az + 0.12 }, post);
    this.batch.addBox({ x: bx - 0.12, y: endRoof, z: bz - 0.12 }, { x: bx + 0.12, y: by + 0.4, z: bz + 0.12 }, post);
    // Cable: a thin cylinder from a to b
    const len = a.distanceTo(b);
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, len, 6), new THREE.MeshLambertMaterial({ color: 0x9aa0a8 }));
    cable.position.copy(a).add(b).multiplyScalar(0.5);
    cable.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    this.extra.add(cable);
    // A yellow handle hanging at the start, so it's easy to spot
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.08), new THREE.MeshBasicMaterial({ color: 0xffd040, toneMapped: false }));
    handle.position.set(ax, ay - 0.35, az);
    this.extra.add(handle);
  }

  /**
   * A duct / pipe run across a roof with a gap underneath that's only
   * slide-height (1.1 m). The duct itself is tall, so you can't climb over it.
   */
  duct(x0, z0, x1, z1, roofY, gap = 1.1, height = 3.4) {
    const look = { side: 'metal', top: 'metal', color: 0x8f959e, uvScale: [1.5, 1.5] };
    this.solid(x0, roofY + gap, z0, x1, roofY + height, z1, look, 'duct');
    // Warning stripe along the bottom edge
    this.batch.addBox({ x: x0, y: roofY + gap - 0.02, z: z0 - 0.02 }, { x: x1, y: roofY + gap + 0.12, z: z1 + 0.02 }, { side: 'glow', top: null, color: 0x8a6a10 });
  }

  /** A shipping container (12.2 x 2.6 x 2.44 m), along X or Z. */
  container(x, y, z, alongX = true, color = 0xb04a2a) {
    const w = alongX ? 12.2 : 2.44, d = alongX ? 2.44 : 12.2;
    this.block(x, y, z, w, 2.6, d, { side: 'metal', top: 'metal', color, uvScale: [0.6, 2.6] }, 'container');
  }

  /** A stack of containers filling a rectangle, `levels` high. Returns its top height. */
  containerStack(x0, z0, x1, z1, levels, y0 = 0, alongX = true) {
    const colors = [0xb04a2a, 0x2a6ab0, 0x3a8a4a, 0xc0a030, 0x8a2a6a, 0x5a6a7a];
    const w = alongX ? 12.2 : 2.44, d = alongX ? 2.44 : 12.2;
    for (let l = 0; l < levels; l++) {
      for (let x = x0 + w / 2; x <= x1 - w / 2 + 0.01; x += w) {
        for (let z = z0 + d / 2; z <= z1 - d / 2 + 0.01; z += d) {
          this.container(x, y0 + l * 2.6, z, alongX, colors[Math.floor(this.rng() * colors.length)]);
        }
      }
    }
    const top = y0 + levels * 2.6;
    this.buildings.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, h: top });
    return top;
  }

  /** Harbour water: touching it counts as falling. */
  water(minX, minZ, maxX, maxZ) {
    this.world.addBox(minX, -3, minZ, maxX, 0, maxZ, { tag: 'street' });
    this.batch.addBox({ x: minX, y: -0.4, z: minZ }, { x: maxX, y: -0.3, z: maxZ }, { side: null, top: 'plain', color: 0x0c1a2c });
  }

  /** A quay / pier deck at ground level (drop onto it = "ground units spot you"). */
  quay(minX, minZ, maxX, maxZ, y = 0.4) {
    this.world.addBox(minX, -2, minZ, maxX, y, maxZ, { tag: 'street' });
    this.batch.addBox({ x: minX, y: -0.5, z: minZ }, { x: maxX, y, z: maxZ }, { side: 'concrete', top: 'asphalt', color: 0x8a8a8a, uvScale: [4, 4], topScale: [8, 8] });
  }

  /**
   * A tall, thin mural wall along one axis: perfect for wall-running.
   * axis 'z': the wall runs along Z at x = t.
   */
  muralWall(axis, a0, a1, t, y0, height, text, color) {
    const look = { side: 'concrete', top: 'concrete', color: 0x6a6e78, uvScale: [4, 4] };
    const th = 0.4;
    if (axis === 'z') this.solid(t - th / 2, y0, Math.min(a0, a1), t + th / 2, y0 + height, Math.max(a0, a1), look, 'wall');
    else this.solid(Math.min(a0, a1), y0, t - th / 2, Math.max(a0, a1), y0 + height, t + th / 2, look, 'wall');
    const len = Math.abs(a1 - a0);
    const tex = makeTextTexture(text, { color, bg: 'rgba(0,0,0,0)', width: 1024, height: 256, font: 'bold 150px "Bebas Neue", Impact, sans-serif' });
    for (const side of [-1, 1]) {
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(len * 0.9, Math.min(height * 0.5, len * 0.22)),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
      const mid = (a0 + a1) / 2;
      if (axis === 'z') { plane.position.set(t + side * (th / 2 + 0.02), y0 + height * 0.55, mid); plane.rotation.y = side * Math.PI / 2; }
      else { plane.position.set(mid, y0 + height * 0.55, t + side * (th / 2 + 0.02)); plane.rotation.y = side > 0 ? 0 : Math.PI; }
      this.extra.add(plane);
    }
  }

  /** Neon sign on a building face. side: 0 = -Z face, 1 = +Z, 2 = -X, 3 = +X */
  sign(b, side, text, color, y = null) {
    this.signs.push({ b, side, text, color, y });
  }

  // ------------------------------------------------------------------
  // Finish: build all meshes
  // ------------------------------------------------------------------
  finish() {
    const group = new THREE.Group();
    group.add(this.batch.build(getMaterials()));
    if (this.tanks.length) group.add(buildTanks(this.tanks));
    if (this.lamps.length) group.add(buildStreetLamps(this.lamps));
    group.add(buildSigns(this.signs, this.rng));
    group.add(this.extra);
    return group;
  }
}

// ----------------------------------------------------------------------
// Instanced / special meshes
// ----------------------------------------------------------------------

function buildTanks(tanksPos) {
  const g = new THREE.Group();
  const m = new THREE.Matrix4();
  const geo = new THREE.CylinderGeometry(1.7, 1.7, 3.2, 14);
  geo.translate(0, 1.6, 0);
  const tanks = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0x6b4a32 }), tanksPos.length);
  const capGeo = new THREE.ConeGeometry(1.85, 1.0, 14);
  capGeo.translate(0, 3.7, 0);
  const caps = new THREE.InstancedMesh(capGeo, new THREE.MeshLambertMaterial({ color: 0x3e3e44 }), tanksPos.length);
  tanksPos.forEach((p, i) => {
    m.makeTranslation(p.x, p.y, p.z);
    tanks.setMatrixAt(i, m);
    caps.setMatrixAt(i, m);
  });
  tanks.castShadow = tanks.receiveShadow = caps.castShadow = true;
  g.add(tanks, caps);
  return g;
}

/** Instanced street lamps: poles, glowing heads and fake light pools. */
export function buildStreetLamps(lamps) {
  const g = new THREE.Group();
  const n = lamps.length;
  const m = new THREE.Matrix4();
  const poleGeo = new THREE.BoxGeometry(0.18, 6, 0.18);
  poleGeo.translate(0, 3, 0);
  const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshLambertMaterial({ color: 0x2a2c30 }), n);
  const headGeo = new THREE.BoxGeometry(0.7, 0.2, 0.4);
  headGeo.translate(0, 6, 0);
  const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshBasicMaterial({ color: 0xffc070, toneMapped: false }), n);
  const poolGeo = new THREE.PlaneGeometry(11, 11);
  poolGeo.rotateX(-Math.PI / 2);
  poolGeo.translate(0, 0.2, 0);
  const poolMat = new THREE.MeshBasicMaterial({
    map: getGlowTexture(), color: 0xff9a3a, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  const pools = new THREE.InstancedMesh(poolGeo, poolMat, n);
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

function buildSigns(signs, rng) {
  const g = new THREE.Group();
  const texCache = new Map();
  for (const s of signs) {
    const [text, color] = s.text ? [s.text, s.color] : SIGN_TEXTS[Math.floor(rng() * SIGN_TEXTS.length)];
    const key = text + color;
    if (!texCache.has(key)) texCache.set(key, makeTextTexture(text, { color }));
    const mat = new THREE.MeshBasicMaterial({
      map: texCache.get(key), transparent: true, toneMapped: false, depthWrite: false, side: THREE.DoubleSide,
    });
    const b = s.b;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), mat);
    const y = s.y ?? Math.min(b.h - 3, 8 + rng() * 5);
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    if (s.side === 0) { mesh.position.set(cx, y, b.minZ - 0.08); mesh.rotation.y = Math.PI; }
    if (s.side === 1) { mesh.position.set(cx, y, b.maxZ + 0.08); }
    if (s.side === 2) { mesh.position.set(b.minX - 0.08, y, cz); mesh.rotation.y = -Math.PI / 2; }
    if (s.side === 3) { mesh.position.set(b.maxX + 0.08, y, cz); mesh.rotation.y = Math.PI / 2; }
    g.add(mesh);
  }
  return g;
}

export { makeGlowMaterial };

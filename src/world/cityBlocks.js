import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeTextTexture } from './materials.js';

// Life for the rooftop city (Free Run, Rooftop Run, and the story levels
// built on it): the things that make it feel like a real city.
//
//  - Shop blocks: rows of small one-storey shops round the edge of the
//    block (with a big apartment block in the middle). Walk in through the
//    door: shelves, a counter, lights, and a till you can rob (Free Run).
//    Every kind has its own inside: a mini mart, a cafe, a clothes shop,
//    a phone shop and a pawn shop. The roofs are low: climb up from the
//    ladder on the corner shop, then up the fire escape on the apartments.
//  - Parks: grass, paths, hedges, trees, benches, a fountain and a gazebo
//    (hide under it from the helicopter; climb on it from the planter).
//  - Street trees along the pavements and gardens on some roofs.
//  - Fire escapes on the apartment blocks: zig-zag landings you climb by
//    pulling yourself up from one to the next.
//
// Uses its own random numbers, so the rest of the city is unchanged.

export const SHOP_H = 4.6;     // shop roof height
export const SHOP_D = 9;       // how deep the shop rows are
const T = 0.22;                // wall thickness
const DOOR_W = 1.8, DOOR_H = 2.7, SILL = 0.5, GLASS_TOP = 3.0;

const KINDS = {
  grocer: { names: ['MINI MART', 'CORNER SHOP', 'GROCER'], sign: '#7dff8a', floor: 0xb8b4aa },
  cafe: { names: ['CAFE', 'COFFEE', 'BAKERY'], sign: '#ffd28a', floor: 0x8a5a36 },
  clothes: { names: ['BOUTIQUE', 'FASHION', 'DENIM'], sign: '#ff9ad5', floor: 0xc8c0b0 },
  tech: { names: ['PHONES', 'TECH STORE', 'GAMES'], sign: '#39e6ff', floor: 0x9a9ea6 },
  pawn: { names: ['PAWN', 'GOLD & PAWN', 'LOANS'], sign: '#ffb020', floor: 0x6a5a48 },
};
const KIND_LIST = Object.keys(KINDS);
const WALLS = [0xc8b49a, 0xa8584a, 0x6a8a8a, 0xd8cfc0, 0x8a6a9a, 0x5a7a5a, 0xb88a5a, 0x4a5a7a];
const ALPINE_WALLS = [0x7a5236, 0x8a5a3a, 0xd2c4aa, 0x6e4a30];
const PRODUCTS = [0xd8382a, 0x2a6ad8, 0xe8b820, 0x2a9a5a, 0xf2ece0, 0xe86a1a, 0x8a3ab0, 0x1aa8a8];

export class CityDresser {
  /**
   * @param {import('./rooftopKit.js').RooftopKit} kit
   * @param {{alpine?: boolean, rng: () => number}} opts
   */
  constructor(kit, { alpine = false, rng }) {
    this.kit = kit;
    this.alpine = alpine;
    this.rng = rng;
    this.trees = [];     // [x, y, z, scale]
    this.glass = [];     // quads [x0,y0,z0, x1,y1,z1] (vertical, axis aligned)
    this.signs = new Map(); // text -> list of { x, y, z, rotY, w }
    this.shops = [];     // { kind, name, min, max, door, till, inside(x, z) }
    this.parks = [];     // { x0, z0, x1, z1, center }
    this.walks = [];     // { a: [x, z], b: [x, z] } where people can walk
  }

  _range(a, b) { return a + this.rng() * (b - a); }
  _pick(list) { return list[Math.floor(this.rng() * list.length)]; }

  // ------------------------------------------------------------------ shops

  /**
   * A block of shops: a row of small shops round the edge (doors on the
   * street) and an apartment block in the middle. Returns the middle area
   * for the caller to put the apartments in.
   */
  shopBlock(x0, z0, x1, z1) {
    const D = SHOP_D;
    const rows = [
      { a0: x0, a1: x1, f: z0, n: [0, -1] },          // north row (full width)
      { a0: x0, a1: x1, f: z1, n: [0, 1] },           // south row (full width)
      { a0: z0 + D, a1: z1 - D, f: x0, n: [-1, 0] },  // west row (between them)
      { a0: z0 + D, a1: z1 - D, f: x1, n: [1, 0] },   // east row
    ];
    for (const row of rows) {
      const len = row.a1 - row.a0;
      const count = Math.max(1, Math.round(len / this._range(7.5, 10)));
      for (let i = 0; i < count; i++) {
        const s0 = row.a0 + (len * i) / count, s1 = row.a0 + (len * (i + 1)) / count;
        const [nx, nz] = row.n;
        // the shop's rectangle
        let r;
        if (nz) r = nz < 0 ? [s0, row.f, s1, row.f + D] : [s0, row.f - D, s1, row.f];
        else r = nx < 0 ? [row.f, s0, row.f + D, s1] : [row.f - D, s0, row.f, s1];
        const corner = nz !== 0 && (i === 0 || i === count - 1);
        this.shop(r[0], r[1], r[2], r[3], nx, nz, { cornerSide: corner ? (i === 0 ? -1 : 1) : 0 });
      }
    }
    return { x0: x0 + D, z0: z0 + D, x1: x1 - D, z1: z1 - D };
  }

  /**
   * One shop you can walk into. (x0..x1, z0..z1) is its footprint; (nx, nz)
   * points out of the front (to the street).
   * cornerSide: on a corner shop, which end (-1/+1 along the front) faces the
   * side street: a ladder goes up that wall to the roof.
   */
  shop(x0, z0, x1, z1, nx, nz, { cornerSide = 0, kind = null } = {}) {
    const kit = this.kit, rng = this.rng;
    kind ||= this._pick(KIND_LIST);
    const K = KINDS[kind];
    const alongX = nz !== 0;
    const W = alongX ? x1 - x0 : z1 - z0, D = alongX ? z1 - z0 : x1 - x0;
    const tx = -nz, tz = nx;                         // along the front (u)
    const fcx = (x0 + x1) / 2 + nx * D / 2, fcz = (z0 + z1) / 2 + nz * D / 2; // middle of the front
    const ox = fcx - tx * W / 2, oz = fcz - tz * W / 2; // front-left corner (u = 0, v = 0)
    const P = (u, v) => [ox + tx * u - nx * v, oz + tz * u - nz * v];
    const rect = (u0, v0, u1, v1) => {
      const [ax, az] = P(u0, v0), [bx, bz] = P(u1, v1);
      return [Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz)];
    };
    // A box in shop coordinates: solid (a collider too) or just seen
    const B = (u0, v0, u1, v1, y0, y1, look, tag = 'shop') => {
      const [ax, az, bx, bz] = rect(u0, v0, u1, v1);
      if (tag) kit.solid(ax, y0, az, bx, y1, bz, look, tag);
      else kit.batch.addBox({ x: ax, y: y0, z: az }, { x: bx, y: y1, z: bz }, look);
    };
    const plain = (color) => ({ side: 'plain', top: 'plain', color });
    const wallC = this.alpine ? this._pick(ALPINE_WALLS) : this._pick(WALLS);
    const wall = { side: 'plain', top: 'plain', color: wallC };
    const frame = plain(this.alpine ? 0x3a2a1c : 0x1c1e22);
    const H = SHOP_H;

    // --- The shell: back and side walls, the front with its door and windows, the roof
    B(0, D - T, W, D, 0, H, wall);
    B(0, 0, T, D - T, 0, H, wall);
    B(W - T, 0, W, D - T, 0, H, wall);
    const du = W * this._range(0.3, 0.7);
    const dl = du - DOOR_W / 2, dr = du + DOOR_W / 2;
    for (const [a, b] of [[T, dl], [dr, W - T]]) {
      if (b - a < 0.3) { B(a, 0, b, T, 0, H, wall); continue; }
      B(a, 0, b, T, 0, SILL, frame);                    // the riser under the glass
      B(a, 0, b, T, GLASS_TOP, H, wall);                // above the glass
      const [gx0, gz0, gx1, gz1] = rect(a, T / 2, b, T / 2);
      kit.world.addBox(gx0 - (alongX ? 0 : 0.06), SILL, gz0 - (alongX ? 0.06 : 0), gx1 + (alongX ? 0 : 0.06), GLASS_TOP, gz1 + (alongX ? 0.06 : 0), { tag: 'glass' });
      this.glass.push([gx0, SILL, gz0, gx1, GLASS_TOP, gz1]);
      for (const u of [a, b]) B(u - 0.05, -0.02, u + 0.05, T + 0.02, SILL, GLASS_TOP, frame, null); // window frames
    }
    B(dl, 0, dr, T, DOOR_H, H, wall);                   // over the door
    B(dl - 0.08, -0.04, dl, T + 0.04, 0, DOOR_H, frame, null);
    B(dr, -0.04, dr + 0.08, T + 0.04, 0, DOOR_H, frame, null);
    // Roof: walkable, low lips, a light ceiling underneath
    const [rx0, rz0, rx1, rz1] = rect(0, 0, W, D);
    kit.solid(rx0, H - 0.3, rz0, rx1, H, rz1, { side: 'plain', top: 'roof', bottom: 'plain', color: this.alpine ? 0xd2dae6 : 0xd8d4cc, topScale: [6, 6] }, 'building');
    const bld = { minX: rx0, maxX: rx1, minZ: rz0, maxZ: rz1, h: H, shop: true, noLadder: true };
    kit.buildings.push(bld);
    if (!this.alpine) kit.lips(bld, 0.25);
    // A sign band over the front
    const sign = this._pick(K.names);
    const [sx, sz] = P(W / 2, -0.03);
    this._sign(sign, K.sign, sx, (GLASS_TOP + H) / 2 + 0.05, sz, Math.atan2(nx, nz), Math.min(W * 0.75, 6));
    // An awning over the door
    B(dl - 0.4, -1.1, dr + 0.4, 0, DOOR_H + 0.25, DOOR_H + 0.37, plain(this._pick([0xc8302a, 0x1f6a3a, 0x2a4a9a, 0xd89a1a])), null);
    // A ladder up the side wall of a corner shop (the way up to the roofs)
    if (cornerSide) {
      const lu = cornerSide < 0 ? 0 : W, [lx, lz] = P(lu, D * 0.55);
      kit.ladders.push({ x: lx, z: lz, nx: cornerSide < 0 ? -tx : tx, nz: cornerSide < 0 ? -tz : tz, y0: 0, y1: H });
    }

    // --- Inside: floor, lights, and what this kind of shop sells
    B(T, T, W - T, D - T, 0.15, 0.17, plain(K.floor), null);
    for (let k = 0; k < Math.max(1, Math.round(W / 3.5)); k++) {
      const u = T + ((W - 2 * T) * (k + 0.5)) / Math.max(1, Math.round(W / 3.5));
      B(u - 0.5, D * 0.3, u + 0.5, D * 0.3 + 0.35, H - 0.36, H - 0.3, { side: 'glow', top: null, bottom: 'glow', color: 0xfff2d8 }, null);
      B(u - 0.5, D * 0.68, u + 0.5, D * 0.68 + 0.35, H - 0.36, H - 0.3, { side: 'glow', top: null, bottom: 'glow', color: 0xfff2d8 }, null);
    }
    // The counter and its till (on the left or right, away from the door)
    const left = du > W / 2;
    const cu0 = left ? T + 0.4 : W - T - 2.6, cu1 = cu0 + 2.2, cv = D * 0.55;
    const counterC = kind === 'tech' ? 0xe8e8ec : kind === 'pawn' ? 0x3a3020 : 0x7a5236;
    B(cu0, cv, cu1, cv + 0.7, 0, 1.0, plain(counterC));
    B(cu0 + 0.8, cv + 0.15, cu0 + 1.3, cv + 0.55, 1.0, 1.28, plain(0x2a2c30), null); // the till
    B(cu0 + 0.85, cv + 0.12, cu0 + 1.25, cv + 0.14, 1.12, 1.24, { side: 'glow', top: null, color: 0x40ff90 }, null);
    const [tillX, tillZ] = P(cu0 + 1.05, cv - 0.6); // (where you stand to rob it)
    const [kpX, kpZ] = P(cu0 + 1.05, cv + 1.25);    // (where the shopkeeper stands)

    if (kind === 'grocer') {
      // Aisles of shelves running back from the front, fridges along the back
      for (const su of (left ? [W * 0.55, W * 0.78] : [W * 0.22, W * 0.45])) {
        if (Math.abs(su - du) < 1.3) continue;
        B(su - 0.35, 1.6, su + 0.35, D - 2.0, 0, 1.75, plain(0x8a8e96));
        for (const y of [0.35, 0.8, 1.25]) {
          for (let v = 1.7; v < D - 2.2; v += 0.62) {
            for (const s of [-1, 1]) {
              const c = this._pick(PRODUCTS);
              B(su + s * 0.35 - (s > 0 ? 0 : 0.18), v, su + s * 0.35 + (s > 0 ? 0.18 : 0), v + 0.55, y, y + 0.3 + rng() * 0.1, plain(c), null);
            }
          }
        }
      }
      B(left ? W * 0.45 : T + 0.1, D - T - 0.75, left ? W - T - 0.1 : W * 0.55, D - T, 0, 2.2, plain(0xd8dce4));
      B(left ? W * 0.45 + 0.1 : T + 0.2, D - T - 0.77, left ? W - T - 0.2 : W * 0.55 - 0.1, D - T - 0.75, 0.2, 2.0, { side: 'glow', top: null, color: 0x8ad8ff }, null);
    } else if (kind === 'cafe') {
      // Tables and chairs, a menu board, a cake cabinet on the counter
      for (let k = 0; k < 3; k++) {
        const u = left ? W * (0.5 + k * 0.17) : W * (0.18 + k * 0.17), v = 1.6 + (k % 2) * 1.6;
        if (Math.abs(u - du) < 1.2 && v < 2.2) continue;
        B(u - 0.4, v - 0.4, u + 0.4, v + 0.4, 0, 0.75, plain(0x5a3a22));
        for (const s of [-1, 1]) B(u - 0.2, v + s * 0.75 - 0.2, u + 0.2, v + s * 0.75 + 0.2, 0, 0.45, plain(0x2a2c30), null);
      }
      B(W * 0.3, D - T - 0.05, W * 0.7, D - T, 1.9, 2.7, { side: 'glow', top: null, color: 0x203028 }, null);
      B(cu0 + 1.4, cv + 0.1, cu1 - 0.1, cv + 0.6, 1.0, 1.45, { side: 'glow', top: 'glow', color: 0xffd8a8 }, null);
    } else if (kind === 'clothes') {
      // Rails of clothes along the walls, a table of folded jumpers, a mirror
      for (const side of [0, 1]) {
        const u = side ? W - T - 0.45 : T + 0.45;
        if ((left && side === 0) || (!left && side === 1)) continue; // (the counter's on that side)
        B(u - 0.03, 1.0, u + 0.03, D - 1.4, 1.65, 1.7, plain(0x8a8f96), null);
        for (let v = 1.1; v < D - 1.5; v += 0.22) B(u - 0.25, v, u + 0.25, v + 0.07, 0.75, 1.62, plain(this._pick(PRODUCTS)), null);
        kit.world.addBox(...(() => { const [a, b, c, d] = rect(u - 0.3, 1.0, u + 0.3, D - 1.4); return [a, 0, b, c, 1.7, d]; })(), { tag: 'shop' });
      }
      B(W / 2 - 0.7, D * 0.42, W / 2 + 0.7, D * 0.42 + 0.9, 0, 0.85, plain(0x6a4a30));
      for (let k = 0; k < 4; k++) B(W / 2 - 0.6 + k * 0.32, D * 0.42 + 0.2, W / 2 - 0.35 + k * 0.32, D * 0.42 + 0.7, 0.85, 0.97, plain(this._pick(PRODUCTS)), null);
      B(W / 2 - 0.8, D - T - 0.04, W / 2 + 0.8, D - T, 0.3, 2.3, { side: 'metal', top: null, color: 0xc8d0d8 }, null);
    } else if (kind === 'tech') {
      // A wall of glowing screens, display tables with phones
      for (let a = 0; a < 4; a++) {
        for (let b = 0; b < 2; b++) {
          const u = W * 0.15 + a * (W * 0.7) / 4;
          B(u, D - T - 0.05, u + W * 0.15, D - T, 1.2 + b * 0.75, 1.75 + b * 0.75, { side: 'glow', top: null, color: this._pick([0x39a8ff, 0x7dff8a, 0xff9ad5, 0xffd070]) }, null);
        }
      }
      for (const u of (left ? [W * 0.62] : [W * 0.3])) {
        B(u - 0.6, 2.2, u + 0.6, 3.4, 0, 0.9, plain(0xf2f2f4));
        for (let k = 0; k < 3; k++) B(u - 0.4 + k * 0.3, 2.5, u - 0.25 + k * 0.3, 2.8, 0.9, 0.93, { side: 'glow', top: 'glow', color: 0x39a8ff }, null);
      }
    } else {
      // Pawn: a glass counter of gold, guitars and TVs on the shelves, a safe
      B(cu0, cv + 0.05, cu1, cv + 0.65, 1.0, 1.04, { side: 'glow', top: 'glow', color: 0xd8a830 }, null);
      const su = left ? W - T - 0.4 : T + 0.4;
      B(su - 0.35, 1.0, su + 0.35, D - 1.2, 0, 2.2, plain(0x5a4a38));
      for (const y of [0.5, 1.2, 1.8]) for (let v = 1.2; v < D - 1.4; v += 0.9) B(su - 0.3, v, su + 0.3, v + 0.6, y, y + 0.35, plain(this._pick([0x2a2c30, 0xd8a830, 0x8a3a20, 0xc8c8c8])), null);
      const [sfx, sfz] = P(left ? W - T - 0.7 : T + 0.7, D - T - 0.7);
      kit.block(sfx, 0, sfz, 0.9, 1.1, 0.9, plain(0x3a3e44), 'shop');
    }

    const [cx0, cz0, cx1, cz1] = rect(T, T, W - T, D - T);
    const [dx, dz] = P(du, 0);
    const shop = {
      kind, name: sign,
      door: new THREE.Vector3(dx, 0, dz), out: [nx, nz],
      till: new THREE.Vector3(tillX, 0.05, tillZ),
      keeper: { pos: new THREE.Vector3(kpX, 0.05, kpZ), facing: Math.atan2(nx, nz) },
      inside: (x, z) => x > cx0 && x < cx1 && z > cz0 && z < cz1,
      center: new THREE.Vector3((cx0 + cx1) / 2, 0, (cz0 + cz1) / 2),
    };
    this.shops.push(shop);
    return shop;
  }

  _sign(text, color, x, y, z, rotY, w) {
    if (!this.signs.has(text)) this.signs.set(text, { color, list: [] });
    this.signs.get(text).list.push({ x, y, z, rotY, w });
  }

  // ------------------------------------------------------------------ parks

  /** A park filling a block: grass, paths, hedges, trees, benches, a fountain, a gazebo. */
  park(x0, z0, x1, z1) {
    const kit = this.kit, A = this.alpine;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const grass = { side: 'plain', top: 'plain', color: A ? 0xe8eef5 : 0x3a6a2c };
    const path = { side: 'plain', top: 'concrete', color: A ? 0xb8c0cc : 0xb0a898, topScale: [3, 3] };
    kit.batch.addBox({ x: x0 + 0.6, y: 0.15, z: z0 + 0.6 }, { x: x1 - 0.6, y: 0.2, z: z1 - 0.6 }, grass);
    // Paths: a cross through the middle and a loop round the fountain
    kit.batch.addBox({ x: cx - 1.6, y: 0.2, z: z0 + 0.6 }, { x: cx + 1.6, y: 0.22, z: z1 - 0.6 }, path);
    kit.batch.addBox({ x: x0 + 0.6, y: 0.2, z: cz - 1.6 }, { x: x1 - 0.6, y: 0.22, z: cz + 1.6 }, path);
    for (const [ax, az, bx, bz] of [[cx - 7, cz - 7, cx + 7, cz - 5.4], [cx - 7, cz + 5.4, cx + 7, cz + 7], [cx - 7, cz - 7, cx - 5.4, cz + 7], [cx + 5.4, cz - 7, cx + 7, cz + 7]]) {
      kit.batch.addBox({ x: ax, y: 0.2, z: az }, { x: bx, y: 0.22, z: bz }, path);
    }
    // Hedges round the edge (gaps where the paths come in)
    const hedge = { side: 'plain', top: 'plain', color: A ? 0x2a4a3a : 0x2a5a24 };
    const hedgeRun = (ax0, az0, ax1, az1) => kit.solid(ax0, 0, az0, ax1, 1.0, az1, hedge, 'hedge');
    const inset = 1.0, th = 0.7, gap = 2.4;
    hedgeRun(x0 + inset, z0 + inset, cx - gap, z0 + inset + th); hedgeRun(cx + gap, z0 + inset, x1 - inset, z0 + inset + th);
    hedgeRun(x0 + inset, z1 - inset - th, cx - gap, z1 - inset); hedgeRun(cx + gap, z1 - inset - th, x1 - inset, z1 - inset);
    hedgeRun(x0 + inset, z0 + inset + th, x0 + inset + th, cz - gap); hedgeRun(x0 + inset, cz + gap, x0 + inset + th, z1 - inset - th);
    hedgeRun(x1 - inset - th, z0 + inset + th, x1 - inset, cz - gap); hedgeRun(x1 - inset - th, cz + gap, x1 - inset, z1 - inset - th);
    // The fountain: a low stone ring with water, a column in the middle
    const stone = { side: 'concrete', top: 'concrete', color: A ? 0x9aa0a8 : 0xb8b0a0, uvScale: [2, 2] };
    const R = 3.2, rw = 0.5, rh = 0.6;
    kit.solid(cx - R, 0, cz - R, cx + R, rh, cz - R + rw, stone, 'fountain');
    kit.solid(cx - R, 0, cz + R - rw, cx + R, rh, cz + R, stone, 'fountain');
    kit.solid(cx - R, 0, cz - R + rw, cx - R + rw, rh, cz + R - rw, stone, 'fountain');
    kit.solid(cx + R - rw, 0, cz - R + rw, cx + R, rh, cz + R - rw, stone, 'fountain');
    kit.batch.addBox({ x: cx - R + rw, y: 0.2, z: cz - R + rw }, { x: cx + R - rw, y: 0.42, z: cz + R - rw }, { side: null, top: A ? 'plain' : 'glow', color: A ? 0xc8e4f4 : 0x2a6a9a });
    kit.block(cx, 0, cz, 0.9, 1.8, 0.9, stone, 'fountain');
    kit.block(cx, 1.8, cz, 1.8, 0.3, 1.8, stone, 'fountain');
    // Trees (not on the paths or the fountain)
    for (let k = 0; k < 16; k++) {
      const x = this._range(x0 + 3, x1 - 3), z = this._range(z0 + 3, z1 - 3);
      if (Math.abs(x - cx) < 3.2 || Math.abs(z - cz) < 3.2 || (Math.abs(x - cx) < 8.5 && Math.abs(z - cz) < 8.5)) continue;
      this.tree(x, 0.2, z, this._range(0.9, 1.35));
    }
    // Benches along the paths, facing them
    for (const [bx, bz, along] of [[cx - 3, z0 + 9, false], [cx + 3, z1 - 9, false], [x0 + 9, cz - 3, true], [x1 - 9, cz + 3, true]]) {
      this.bench(bx, bz, along);
    }
    // A gazebo in one corner (hide under it; climb onto it from the planter)
    const gx = cx + (this.rng() < 0.5 ? -1 : 1) * 12, gz = cz + (this.rng() < 0.5 ? -1 : 1) * 12;
    const post = { side: 'plain', top: 'plain', color: A ? 0x4a3222 : 0xf0ece4 };
    for (const [ox, oz] of [[-1.7, -1.7], [1.7, -1.7], [-1.7, 1.7], [1.7, 1.7]]) kit.block(gx + ox, 0, gz + oz, 0.22, 2.5, 0.22, post, 'gazebo');
    kit.solid(gx - 2.3, 2.5, gz - 2.3, gx + 2.3, 2.75, gz + 2.3, { side: 'plain', top: 'roof', color: A ? 0xd2dae6 : 0x7a3a2a, topScale: [3, 3] }, 'gazebo');
    kit.block(gx, 2.75, gz, 2.4, 0.5, 2.4, { side: 'plain', top: 'roof', color: A ? 0xd2dae6 : 0x7a3a2a, topScale: [3, 3] }, 'gazebo');
    kit.block(gx + 2.9, 0, gz, 1.2, 0.6, 1.6, { side: 'plain', top: 'plain', color: 0x7a5a3a }, 'planter'); // (step up)
    kit.batch.addBlock(gx + 2.9, 0.6, gz, 1.0, 0.25, 1.4, { side: 'plain', top: 'plain', color: A ? 0xe8eef5 : 0xd84a7a });
    kit.hideSpots.push(new THREE.Vector3(gx, 0.05, gz));
    // Flower beds
    if (!A) {
      for (const [fx, fz] of [[cx - 12, cz], [cx + 12, cz], [cx, cz - 12], [cx, cz + 12]]) {
        if (Math.hypot(fx - gx, fz - gz) < 5) continue;
        kit.batch.addBlock(fx, 0.2, fz, 2.4, 0.25, 2.4, { side: 'plain', top: 'plain', color: 0x5a3a22 });
        for (let k = 0; k < 6; k++) kit.batch.addBlock(fx + this._range(-0.9, 0.9), 0.45, fz + this._range(-0.9, 0.9), 0.35, 0.25, 0.35, { side: 'plain', top: 'plain', color: this._pick([0xe84a5a, 0xf2d040, 0xd87ad8, 0xf2f2f2]) });
      }
    }
    // Lamps along the cross paths
    for (const t of [-14, 14]) kit.lamps.push([cx + 2.4, cz + t], [cx + t, cz - 2.4]);
    // Where people stroll
    this.walks.push({ a: [cx, z0 + 2], b: [cx, z1 - 2] }, { a: [x0 + 2, cz], b: [x1 - 2, cz] },
      { a: [cx - 6.2, cz - 6.2], b: [cx + 6.2, cz - 6.2] }, { a: [cx + 6.2, cz + 6.2], b: [cx - 6.2, cz + 6.2] });
    this.parks.push({ x0, z0, x1, z1, center: new THREE.Vector3(cx, 0, cz) });
  }

  bench(x, z, alongZ) {
    const kit = this.kit;
    const wood = { side: 'plain', top: 'plain', color: this.alpine ? 0x5a3e28 : 0x8a5a30 };
    const w = alongZ ? 0.5 : 1.8, d = alongZ ? 1.8 : 0.5;
    kit.block(x, 0, z, w, 0.5, d, wood, 'bench');
    kit.batch.addBlock(x + (alongZ ? 0.22 : 0), 0.5, z + (alongZ ? 0 : 0.22), alongZ ? 0.06 : 1.8, 0.4, alongZ ? 1.8 : 0.06, wood);
  }

  /** A tree with a trunk you bump into (its leaves are just for looks). */
  tree(x, y, z, s = 1) {
    this.trees.push([x, y, z, s]);
    this.kit.world.addBox(x - 0.25 * s, y, z - 0.25 * s, x + 0.25 * s, y + 2.6 * s, z + 0.25 * s, { tag: 'tree' });
  }

  // ------------------------------------------------------------------ apartments

  /**
   * Street trees along a block's pavements (between the lamps), on the
   * side of the pavement away from the walls.
   */
  streetTrees(x0, z0, x1, z1) {
    const out = 2.05; // from the block edge, out onto the pavement (near the kerb)
    for (const t of [11, 25]) {
      if (this.rng() < 0.25) continue;
      this.tree(x0 + t + this._range(-1, 1), 0.15, z0 - out, this._range(0.75, 0.95));
      this.tree(x1 - t + this._range(-1, 1), 0.15, z1 + out, this._range(0.75, 0.95));
      this.tree(x0 - out, 0.15, z1 - t + this._range(-1, 1), this._range(0.75, 0.95));
      this.tree(x1 + out, 0.15, z0 + t + this._range(-1, 1), this._range(0.75, 0.95));
    }
    // People walk the pavements round every block
    const p = 1.0;
    this.walks.push({ a: [x0 - p, z0 - p], b: [x1 + p, z0 - p] }, { a: [x1 + p, z1 + p], b: [x0 - p, z1 + p] },
      { a: [x0 - p, z1 + p], b: [x0 - p, z0 - p] }, { a: [x1 + p, z0 - p], b: [x1 + p, z1 + p] });
  }

  /**
   * A fire escape up one wall of a building: zig-zag landings 2.3 m apart,
   * from `fromY` (the ground, or a shop roof) to just under the roof.
   * face: { nx, nz } out of the wall; the wall is the building's side on that face.
   */
  fireEscape(b, nx, nz, fromY = 0) {
    const kit = this.kit;
    const alongX = nz !== 0;
    const wall = alongX ? (nz < 0 ? b.minZ : b.maxZ) : (nx < 0 ? b.minX : b.maxX);
    const lo = alongX ? b.minX : b.minZ, hi = alongX ? b.maxX : b.maxZ;
    if (hi - lo < 7 || b.h - fromY < 5) return false;
    const mid = this._range(lo + 3.5, hi - 3.5);
    const depth = 1.45, out = alongX ? nz : nx;
    const ys = [];
    for (let y = fromY + 2.3; y < b.h - 0.3; y += 2.3) ys.push(y);
    if (!ys.length) return false;
    if (b.h - ys[ys.length - 1] > 2.4) ys.push(b.h - 2.2); // (the last pull-up onto the roof)
    // A box out from the wall (along the wall a0..a1, heights y0..y1)
    const box = (a0, a1, y0, y1, from = 0) => {
      const n0 = Math.min(wall + out * from, wall + out * depth), n1 = Math.max(wall + out * from, wall + out * depth);
      return alongX ? [a0, y0, n0, a1, y1, n1] : [n0, y0, a0, n1, y1, a1];
    };
    // Nothing in the way (lamps, signs, other buildings)?
    if (kit.world.query(...box(mid - 3, mid + 3, fromY + 0.3, b.h, 0.05), []).length) return false;
    const rail = { side: 'plain', top: 'plain', color: 0x1d1f23 };
    ys.forEach((y, i) => {
      const a0 = mid + (i % 2 ? -0.2 : -2.6), a1 = a0 + 2.8;
      const [x0, , z0, x1, , z1] = box(a0, a1, y - 0.15, y);
      kit.platform(x0, z0, x1, z1, y, 0.15, 0x2a2c31);
      // the outer handrail (visual)
      const [rx0, , rz0, rx1, , rz1] = alongX ? [a0, 0, wall + out * (depth - 0.05) - 0.03, a1, 0, wall + out * (depth - 0.05) + 0.03]
        : [wall + out * (depth - 0.05) - 0.03, 0, a0, wall + out * (depth - 0.05) + 0.03, 0, a1];
      kit.batch.addBox({ x: rx0, y: y + 0.9, z: rz0 }, { x: rx1, y: y + 0.95, z: rz1 }, rail);
    });
    return true;
  }

  /** A garden on a roof: a grass patch and planters with small trees. */
  roofGarden(b) {
    const kit = this.kit;
    const w = b.maxX - b.minX, d = b.maxZ - b.minZ;
    if (w < 9 || d < 9) return;
    const gx = this._range(b.minX + 3, b.maxX - 3), gz = this._range(b.minZ + 3, b.maxZ - 3);
    const q = [];
    if (kit.world.query(gx - 2.4, b.h + 0.05, gz - 2.4, gx + 2.4, b.h + 2, gz + 2.4, q).length) return;
    kit.batch.addBox({ x: gx - 2.3, y: b.h, z: gz - 2.3 }, { x: gx + 2.3, y: b.h + 0.04, z: gz + 2.3 }, { side: 'plain', top: 'plain', color: 0x3a6a2c });
    for (const [ox, oz] of [[-1.6, -1.6], [1.6, 1.6]]) {
      kit.block(gx + ox, b.h, gz + oz, 1.1, 0.6, 1.1, { side: 'plain', top: 'plain', color: 0x7a5a3a }, 'planter');
      this.trees.push([gx + ox, b.h + 0.6, gz + oz, 0.45]);
    }
  }

  // ------------------------------------------------------------------ build

  /** Meshes for the trees, glass and signs (a handful of draw calls). */
  build() {
    const g = new THREE.Group();
    if (this.trees.length) g.add(buildTrees(this.trees, this.alpine));
    if (this.glass.length) {
      const pos = [];
      for (const [x0, y0, z0, x1, y1, z1] of this.glass) {
        // a vertical pane between two corners (one of x/z is the same at both)
        const a = [x0, y0, z0], b2 = [x1, y0, z1], c = [x1, y1, z1], d = [x0, y1, z0];
        pos.push(...a, ...b2, ...c, ...a, ...c, ...d);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.computeVertexNormals();
      g.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0xa8c8dc, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })));
    }
    for (const [text, { color, list }] of this.signs) {
      const geos = list.map(({ x, y, z, rotY, w }) => {
        const p = new THREE.PlaneGeometry(w, w / 4);
        p.rotateY(rotY);
        p.translate(x, y, z);
        return p;
      });
      const mat = new THREE.MeshBasicMaterial({ map: makeTextTexture(text, { color, bg: 'rgba(12,14,22,0.92)', width: 512, height: 128 }), toneMapped: false });
      g.add(new THREE.Mesh(mergeGeometries(geos, false), mat));
    }
    return g;
  }
}

/** Instanced trees: round leafy ones in the city, snowy pines in the mountains. */
export function buildTrees(trees, alpine) {
  const g = new THREE.Group();
  const m = new THREE.Matrix4();
  if (alpine) {
    const trunk = new THREE.CylinderGeometry(0.2, 0.28, 2, 6); trunk.translate(0, 1, 0);
    const low = new THREE.ConeGeometry(1.8, 3.2, 7); low.translate(0, 3.0, 0);
    const high = new THREE.ConeGeometry(1.3, 2.6, 7); high.translate(0, 4.7, 0);
    const snow = new THREE.ConeGeometry(0.7, 1.2, 7); snow.translate(0, 5.6, 0);
    const meshes = [
      new THREE.InstancedMesh(trunk, new THREE.MeshLambertMaterial({ color: 0x3a2a1c }), trees.length),
      new THREE.InstancedMesh(mergeGeometries([low, high], false), new THREE.MeshLambertMaterial({ color: 0x1c3a2a, flatShading: true }), trees.length),
      new THREE.InstancedMesh(snow, new THREE.MeshLambertMaterial({ color: 0xf0f4f8, flatShading: true }), trees.length),
    ];
    trees.forEach(([x, y, z, s], i) => { m.makeScale(s, s, s).setPosition(x, y, z); for (const im of meshes) im.setMatrixAt(i, m); });
    for (const im of meshes) { im.castShadow = true; g.add(im); }
    return g;
  }
  const trunk = new THREE.CylinderGeometry(0.16, 0.24, 2.8, 6); trunk.translate(0, 1.4, 0);
  const leaves = mergeGeometries([
    new THREE.IcosahedronGeometry(1.7, 1).translate(0, 3.6, 0),
    new THREE.IcosahedronGeometry(1.25, 1).translate(0.9, 3.1, 0.4),
    new THREE.IcosahedronGeometry(1.2, 1).translate(-0.8, 3.2, -0.5),
  ], false);
  const tm = new THREE.InstancedMesh(trunk, new THREE.MeshLambertMaterial({ color: 0x4a3424 }), trees.length);
  const lm = new THREE.InstancedMesh(leaves, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), trees.length);
  const greens = [0x2f6a2a, 0x3a7a30, 0x285a26, 0x4a7a2a, 0x356a3a];
  const c = new THREE.Color(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  trees.forEach(([x, y, z, s], i) => {
    m.compose(p.set(x, y, z), q.setFromAxisAngle(up, (x * 7.13 + z * 3.7) % 6.28), sc.set(s, s, s));
    tm.setMatrixAt(i, m);
    lm.setMatrixAt(i, m);
    lm.setColorAt(i, c.set(greens[Math.abs(Math.floor(x * 3 + z * 7)) % greens.length]));
  });
  tm.castShadow = lm.castShadow = true;
  g.add(tm, lm);
  return g;
}

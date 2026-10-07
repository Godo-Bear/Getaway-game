import * as THREE from 'three';
import { CollisionWorld } from '../../core/collision.js';
import { makeTextTexture, makeGlowMaterial } from '../materials.js';
import { buildSpeedboat, buildRowboat } from '../../vehicles/boats.js';

// ======================================================================
//  Chapter 14, Part 1: the Bella Fortuna, a casino ship anchored in the
//  bay off Porto Sereno, at night.
//
//  Seen from above (bow = north = -Z; the main deck is at y = 0 and the
//  sea is 8 m below it):
//
//                     ▲ bow (foredeck, a searchlight on the bridge)
//                ┌── BRIDGE ──┐                       z = -52..-40
//            ┌───┤ VAULT      ├───┐  (counting room: crack the dial)  z = -40..-28
//    port    │   │ STAFF HALL │   │  starboard        z = -28..-14 (hack the door)
//  promenade │   │  CASINO    │   │ promenade         z = -14..20
//  (Paz's    │   │ (side doors│at z=0)
//  speedboat │   └── doors ───┘   │
//  waits off │   STERN DECK: pool, bar, deck chairs   z = 20..56
//  this side)│      (searchlight on a mast)        rope ladder ◄── Paz's
//            └────────────────────┘                rowing boat (start)
//
//  The casino's roof is a sun deck (ladder at the back) with an open
//  skylight you can drop through.
// ======================================================================

export const SEA_Y = -8;

/** The ship's outline (x, z), bow pointing to -Z. */
const OUTLINE = [[13, 56], [13, -40], [11, -55], [7, -67], [0, -78], [-7, -67], [-11, -55], [-13, -40], [-13, 56]];

function outlineGeo(scale, h) {
  const s = new THREE.Shape();
  OUTLINE.forEach(([x, z], i) => (i ? s.lineTo(x * scale, -z * scale) : s.moveTo(x * scale, -z * scale)));
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  return g;
}

/**
 * @param {{distant?: boolean}} [opts] distant: just the outside of the ship
 *   (no interior, no lights), for seeing it from far away.
 */
export function buildChapter14Ship({ distant = false } = {}) {
  const group = new THREE.Group();
  const world = new CollisionWorld(8);
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });
  const M = {
    white: mat(0xf0ece4, { roughness: 0.55 }), navy: mat(0x1a2440, { roughness: 0.5 }), gold: mat(0xd8a830, { metalness: 0.7, roughness: 0.3 }),
    teak: mat(0xa8784a, { roughness: 0.9 }), rail: mat(0xe8e8e8, { metalness: 0.4, roughness: 0.4 }), red: mat(0xa81c2a),
    felt: mat(0x1f6a3a, { roughness: 1 }), wood: mat(0x5a3418, { roughness: 0.6 }), steel: mat(0x8a929c, { metalness: 0.7, roughness: 0.3 }),
    dark: mat(0x1c1e22), carpet: mat(0x6a1422, { roughness: 1 }), floor: mat(0x5a5f6a), orange: mat(0xe8743a),
    window: new THREE.MeshStandardMaterial({ color: 0x3a2a10, emissive: 0xffc870, emissiveIntensity: 0.9, roughness: 0.3 }),
    water: new THREE.MeshStandardMaterial({ color: 0x1aa0c8, emissive: 0x0a6a8a, transparent: true, opacity: 0.8, roughness: 0.1 }),
  };
  const block = (x, y, z, w, h, d, material, solid = true, tag = 'wall') => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y + h / 2, z);
    m.castShadow = m.receiveShadow = !distant;
    group.add(m);
    if (solid) world.addBlock(x, y, z, w, h, d, { tag });
    return m;
  };
  const box = (x0, z0, x1, z1, h, material, y = 0, solid = true, tag) => block((x0 + x1) / 2, y, (z0 + z1) / 2, x1 - x0, h, z1 - z0, material, solid, tag);
  const solidBox = (x0, y0, z0, x1, y1, z1, tag = 'wall') => world.addBox(x0, y0, z0, x1, y1, z1, { tag });

  // ------------------------------------------------------------------ the hull
  const lower = new THREE.Mesh(outlineGeo(1, 4), M.navy); lower.position.y = -10;
  const upper = new THREE.Mesh(outlineGeo(1, 5.7), M.white); upper.position.y = -6;
  const stripe = new THREE.Mesh(outlineGeo(1.004, 0.25), M.gold); stripe.position.y = -6.1;
  const deckTop = new THREE.Mesh(outlineGeo(0.985, 0.3), M.teak); deckTop.position.y = -0.3;
  group.add(lower, upper, stripe, deckTop);
  // Solid deck and hull
  solidBox(-13, -10, -40, 13, 0, 56, 'roof');
  solidBox(-11, -10, -55, 11, 0, -40, 'roof');
  solidBox(-7, -10, -67, 7, 0, -55, 'roof');
  solidBox(-3, -10, -75, 3, 0, -67, 'roof');
  // Lit portholes along both sides, the ship's name near the bow
  const holes = new THREE.InstancedMesh(new THREE.CircleGeometry(0.32, 10), M.window, 120);
  let n = 0;
  const o = new THREE.Object3D();
  for (const sx of [-1, 1]) {
    for (let z = -36; z <= 52; z += 3) {
      o.position.set(sx * 13.02, -3.2, z);
      o.rotation.set(0, sx * Math.PI / 2, 0);
      o.updateMatrix();
      holes.setMatrixAt(n++, o.matrix);
    }
  }
  holes.count = n;
  group.add(holes);
  const nameTex = makeTextTexture('BELLA FORTUNA', { color: '#ffd070', width: 1024, height: 128, font: 'bold 92px "Bebas Neue", Impact, sans-serif' });
  for (const sx of [-1, 1]) {
    const t = new THREE.Mesh(new THREE.PlaneGeometry(13, 1.6), new THREE.MeshBasicMaterial({ map: nameTex, transparent: true }));
    t.position.set(sx * 12.1, -2.6, -47);
    t.rotation.y = sx * (Math.PI / 2 - 0.13);
    group.add(t);
  }
  // The anchor chain down into the sea at the bow
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 14, 6), M.dark);
  chain.position.set(-4.5, -5, -70);
  chain.rotation.x = 0.55;
  group.add(chain);

  // ------------------------------------------------------------------ rails
  // A rail all round the deck (1.05 m: run at it and you vault over it).
  // Gaps: where the rope ladder comes up (starboard, by the stern deck).
  const railMat = M.rail;
  const rail = (x0, z0, x1, z1, y = 0) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, ang = Math.atan2(x1 - x0, z1 - z0);
    for (const h of [0.5, 1.02]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, len), railMat);
      bar.position.set(cx, y + h, cz);
      bar.rotation.y = ang;
      group.add(bar);
    }
    const posts = Math.max(1, Math.round(len / 2.5));
    for (let i = 0; i <= posts; i++) {
      const t = i / posts;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.05, 5), railMat);
      post.position.set(x0 + (x1 - x0) * t, y + 0.52, z0 + (z1 - z0) * t);
      group.add(post);
    }
    // collision: thin boxes along it (axis-aligned pieces for the slanted bits)
    const steps = Math.max(1, Math.ceil(len / 1.5));
    for (let i = 0; i < steps; i++) {
      const ax = x0 + ((x1 - x0) * i) / steps, az = z0 + ((z1 - z0) * i) / steps;
      const bx = x0 + ((x1 - x0) * (i + 1)) / steps, bz = z0 + ((z1 - z0) * (i + 1)) / steps;
      world.addBox(Math.min(ax, bx) - 0.1, y, Math.min(az, bz) - 0.1, Math.max(ax, bx) + 0.1, y + 1.05, Math.max(az, bz) + 0.1, { tag: 'rail' });
    }
  };
  rail(13, 56, 13, 41); rail(13, 38, 13, -40);      // starboard (gap for the rope ladder at z 38..41)
  rail(-13, 56, -13, -40);                           // port
  rail(-13, 56, 13, 56);                             // stern
  for (const sx of [-1, 1]) { rail(sx * 13, -40, sx * 11, -55); rail(sx * 11, -55, sx * 7, -67); rail(sx * 7, -67, 0, -78); }
  // fairy lights along the rails
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffe0a0 }), 120);
  n = 0;
  for (const sx of [-1, 1]) for (let z = -38; z <= 54; z += 2.2) { o.position.set(sx * 13, 1.15, z); o.rotation.set(0, 0, 0); o.updateMatrix(); bulbs.setMatrixAt(n++, o.matrix); }
  for (let x = -12; x <= 12; x += 2.4) { o.position.set(x, 1.15, 56); o.updateMatrix(); bulbs.setMatrixAt(n++, o.matrix); }
  bulbs.count = n;
  group.add(bulbs);

  // ------------------------------------------------------------------ the casino hall (superstructure)
  const WH = 7; // wall height (the roof deck is on top, at 7.4)
  // outer walls, with the doors: stern doors (x -2.5..2.5), side doors (z -2..2)
  box(-9, -40, -8.6, -2, WH, M.white); box(-9, 2, -8.6, 20, WH, M.white); box(-9, -2, -8.6, 2, WH - 3, M.white, 3);
  box(8.6, -40, 9, -2, WH, M.white); box(8.6, 2, 9, 20, WH, M.white); box(8.6, -2, 9, 2, WH - 3, M.white, 3);
  box(-9, 19.6, -2.5, 20, WH, M.white); box(2.5, 19.6, 9, 20, WH, M.white); box(-2.5, 19.6, 2.5, 20, WH - 3, M.white, 3);
  box(-9, -40, 9, -39.6, WH, M.white);
  // lit windows along the outside, a gold trim, the CASINO sign over the stern doors
  for (const sx of [-1, 1]) {
    for (const [z0, z1] of [[-38, -3], [3, 18.5]]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(z1 - z0, 2.2), M.window);
      w.position.set(sx * 9.02, 2.9, (z0 + z1) / 2);
      w.rotation.y = sx * Math.PI / 2;
      group.add(w);
    }
  }
  for (const [x0, x1] of [[-8.5, -3], [3, 8.5]]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, 2.2), M.window);
    w.position.set((x0 + x1) / 2, 2.9, 20.02);
    group.add(w);
  }
  box(-9.05, -40, 9.05, 20.05, 0.35, M.gold, 6.6, false);
  const casinoTex = makeTextTexture('CASINO', { color: '#ff4fd8', width: 512, height: 128 });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.25), new THREE.MeshBasicMaterial({ map: casinoTex, transparent: true }));
  sign.position.set(0, 4.9, 20.08);
  group.add(sign);
  // the roof: a sun deck, with an open skylight over the casino (x -2..2, z -6..-2)
  const roofY = WH;
  box(-9, -40, 9, -6, 0.4, M.white, roofY);
  box(-9, -2, 9, 20, 0.4, M.white, roofY);
  box(-9, -6, -2, -2, 0.4, M.white, roofY);
  box(2, -6, 9, -2, 0.4, M.white, roofY);
  const RT = roofY + 0.4;
  for (const [x0, z0, x1, z1] of [[-2.1, -6.1, 2.1, -5.9], [-2.1, -2.1, 2.1, -1.9], [-2.1, -6.1, -1.9, -1.9], [1.9, -6.1, 2.1, -1.9]]) box(x0, z0, x1, z1, 0.25, M.gold, RT, false);
  rail(-9, 20, -9, -40, RT); rail(9, 20, 9, -40, RT); rail(-9, 20, 9, 20, RT); rail(-9, -40, 9, -40, RT);
  // on the roof: the funnel, deck chairs, a mast with the stern searchlight
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.3, 6, 16), M.red);
  funnel.position.set(0, RT + 3, -30);
  const ftop = new THREE.Mesh(new THREE.CylinderGeometry(2.02, 2.02, 1, 16), M.dark);
  ftop.position.set(0, RT + 5.6, -30);
  group.add(funnel, ftop);
  world.addBlock(0, RT, -30, 4.4, 6, 4.4, { tag: 'wall' });
  for (const [x, z] of [[-6, 8], [-6, 12], [6, 8], [6, 12], [-6, -16], [6, -16]]) block(x, RT, z, 1, 0.45, 2, M.teak, true, 'prop');
  block(0, RT, 16, 0.5, 6.6, 0.5, M.steel, true, 'tower');                // the mast
  // the ladder up to the roof (outside, at the back, on the right)
  const ladderMesh = (x, z, nx, nz, y0, y1, material = M.steel) => {
    const L = new THREE.Group();
    const h = y1 - y0;
    for (const s of [-0.28, 0.28]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.06, h, 0.06), material);
      side.position.set(s, h / 2, 0);
      L.add(side);
    }
    for (let y = 0.3; y < h; y += 0.35) {
      const rung = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.04, 0.04), material);
      rung.position.set(0, y, 0);
      L.add(rung);
    }
    L.position.set(x + nx * 0.08, y0, z + nz * 0.08);
    L.rotation.y = Math.atan2(nx, nz);
    group.add(L);
  };
  const ladders = [];
  ladders.push({ x: 7, z: 20, nx: 0, nz: 1, y0: 0, y1: RT });
  ladderMesh(7, 20, 0, 1, 0, RT);

  // ------------------------------------------------------------------ the bridge (at the bow end)
  box(-7, -52, 7, -40, 10, M.white);
  for (const [w, x, z, ry] of [[12, 0, -52.02, Math.PI], [10, -7.02, -46, -Math.PI / 2], [10, 7.02, -46, Math.PI / 2]]) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(w, 1.6), new THREE.MeshStandardMaterial({ color: 0x0a1420, emissive: 0x2a4a68, roughness: 0.2 }));
    win.position.set(x, 8.2, z);
    win.rotation.y = ry;
    group.add(win);
  }
  block(0, 10, -46, 0.6, 1.4, 0.6, M.steel, true, 'tower');

  // ------------------------------------------------------------------ the stern deck: pool, bar, deck chairs
  // the pool: raised, with a wide white edge (vault over it, or walk round)
  for (const [x0, z0, x1, z1] of [[-5.5, 29.5, 5.5, 30.1], [-5.5, 39.9, 5.5, 40.5], [-5.5, 29.5, -4.9, 40.5], [4.9, 29.5, 5.5, 40.5]]) box(x0, z0, x1, z1, 0.75, M.white);
  box(-4.9, 30.1, 4.9, 39.9, 0.3, mat(0x2a90b0), 0, false);
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(9.8, 9.8), M.water);
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0, 0.62, 35);
  group.add(pool);
  if (!distant) {
    const poolLight = new THREE.PointLight(0x40d0ff, 6, 14, 1.5);
    poolLight.position.set(0, 1.4, 35);
    group.add(poolLight);
  }
  // the bar (cover), with stools and bottles
  box(7, 44, 11.5, 45.2, 1.1, M.wood);
  box(11.4, 44, 12.2, 50, 2.2, M.wood);
  for (let k = 0; k < 6; k++) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.32, 6), new THREE.MeshStandardMaterial({ color: [0x2f8a4c, 0xc0283a, 0xe8c040][k % 3], emissive: [0x0a3018, 0x3a0a10, 0x3a3010][k % 3] }));
    b.position.set(11.8, 2.4, 44.5 + k * 0.9);
    group.add(b);
  }
  for (const [x, z] of [[-9, 26], [-9, 44], [-9, 48], [-4, 47], [0, 47], [4, 47], [-9, 30], [-9, 34]]) block(x, 0, z, 1.0, 0.45, 2.0, M.teak, true, 'prop');
  // stacks of crates and a luggage trolley (cover)
  for (const [x, z, w, h, d] of [[9, 26, 2, 1.3, 1.6], [-10.5, 52, 2.2, 1.3, 2.2], [8, 53, 2.4, 1.2, 1.6], [-4.5, 23.5, 1.6, 1.2, 1.6]]) block(x, 0, z, w, h, d, M.wood, true, 'prop');
  // lifeboats hanging outboard along both sides (out past the rails)
  for (const sx of [-1, 1]) {
    for (const z of [-30, -12, 8]) {
      const lb = new THREE.Mesh(new THREE.CapsuleGeometry(1.0, 4.5, 4, 10), M.orange);
      lb.rotation.x = Math.PI / 2;
      lb.scale.set(1, 1, 0.7);
      lb.position.set(sx * 14.6, 1.6, z);
      const cover = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.3, 5.6), M.white);
      cover.position.set(sx * 14.6, 2.25, z);
      group.add(lb, cover);
      for (const dz of [-2.2, 2.2]) {
        const dav = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.15, 0.15), M.steel);
        dav.position.set(sx * 13.8, 3.0, z + dz);
        group.add(dav);
      }
    }
  }
  // a few deck lamps
  for (const [x, z] of [[-11.5, 22], [11.5, 22], [-11.5, -20], [11.5, -20], [0, 54]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 5), M.dark);
    pole.position.set(x, 1.3, z);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff0c8 }));
    lamp.position.set(x, 2.7, z);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 6), makeGlowMaterial(0xffd890, 0.22));
    glow.position.copy(lamp.position);
    group.add(pole, lamp, glow);
  }

  // ------------------------------------------------------------------ inside: the casino floor
  const guests = [];
  let staffDoor = null, staffDoorBox = null, vaultDoorPivot = null, vaultDoorBox = null, panel = null;
  const cash = [];
  if (!distant) {
    const carpet = new THREE.Mesh(new THREE.PlaneGeometry(17.2, 33.6), M.carpet);
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.set(0, 0.012, 2.8);
    group.add(carpet);
    const corridorFloor = new THREE.Mesh(new THREE.PlaneGeometry(17.2, 25.6), M.floor);
    corridorFloor.rotation.x = -Math.PI / 2;
    corridorFloor.position.set(0, 0.012, -27);
    group.add(corridorFloor);
    // the walls inside: deep red wallpaper, a gold rail, wall lamps
    const paper = mat(0x4a1020, { roughness: 0.9 });
    const panelIn = (w, cx, cz, ry, h = WH) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), paper);
      m.position.set(cx, h / 2, cz);
      m.rotation.y = ry;
      group.add(m);
      const rail2 = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.12), M.gold);
      rail2.position.set(cx + Math.sin(ry) * 0.01, 3.4, cz + Math.cos(ry) * 0.01);
      rail2.rotation.y = ry;
      group.add(rail2);
    };
    for (const sx of [-1, 1]) {
      panelIn(11.2, sx * 8.58, -8.4, -sx * Math.PI / 2);   // (z -13.8..-2.6... the side walls, either side of the side doors)
      panelIn(17, sx * 8.58, 11.1, -sx * Math.PI / 2);
      for (const z of [-8, 7, 15]) {
        const sc = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe0a0 }));
        sc.position.set(sx * 8.4, 4.4, z);
        const g = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 6), makeGlowMaterial(0xffc870, 0.2));
        g.position.copy(sc.position);
        group.add(sc, g);
      }
    }
    panelIn(6.1, -5.55, 19.58, Math.PI); panelIn(6.1, 5.55, 19.58, Math.PI);   // the stern wall, either side of the doors
    panelIn(7.4, -4.9, -13.78, 0); panelIn(7.4, 4.9, -13.78, 0);               // the staff wall
    // the ceiling inside (the underside of the roof deck), dark red with gold
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(17.2, 59.6), mat(0x3a0a14));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, WH - 0.01, -10);
    group.add(ceil);
    // roulette tables
    for (const x of [-3.8, 3.8]) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.1, 0.9, 20), M.wood);
      t.position.set(x, 0.45, 8);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.04, 20), M.felt);
      top.position.set(x, 0.92, 8);
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.15, 18), M.gold);
      wheel.position.set(x, 1.0, 8);
      wheel.userData.spin = true;
      group.add(t, top, wheel);
      world.addBlock(x, 0, 8, 2.4, 0.95, 2.4, { tag: 'prop' });
    }
    // card tables
    for (const [x, z] of [[-3.8, 1.5], [3.8, 1.5], [-3.8, -5], [3.8, -5]]) {
      block(x, 0, z, 2.6, 0.8, 1.5, M.wood, true, 'prop');
      block(x, 0.8, z, 2.4, 0.05, 1.3, M.felt, false);
    }
    // rows of slot machines along the walls (screens glow)
    const slotScreen = new THREE.MeshStandardMaterial({ color: 0x101018, emissive: 0xff4fd8, emissiveIntensity: 0.8 });
    const slotScreen2 = new THREE.MeshStandardMaterial({ color: 0x101018, emissive: 0x39e6ff, emissiveIntensity: 0.8 });
    for (const sx of [-1, 1]) {
      for (const [z0, z1] of [[-12.5, -3], [3, 13]]) {
        world.addBox(sx > 0 ? 7.7 : -8.6, 0, z0 - 0.4, sx > 0 ? 8.6 : -7.7, 1.9, z1 + 0.4, { tag: 'prop' });
        for (let z = z0; z <= z1; z += 1.6) {
          const m = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.85, 0.75), M.dark);
          m.position.set(sx * 8.15, 0.92, z);
          const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.5), (z * 7) % 2 ? slotScreen : slotScreen2);
          scr.position.set(sx * 7.72, 1.3, z);
          scr.rotation.y = -sx * Math.PI / 2;
          group.add(m, scr);
        }
      }
    }
    // the bar inside, by the stern doors
    box(-7.8, 15.5, -3.4, 16.8, 1.1, M.wood);
    box(-7.9, 15.4, -3.3, 16.9, 0.06, M.gold, 1.1, false);
    // chandeliers
    for (const z of [10, -2]) {
      const c = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff0c0 }));
      c.position.set(0, WH - 1.2, z);
      const g = new THREE.Mesh(new THREE.SphereGeometry(2.2, 10, 8), makeGlowMaterial(0xffd890, 0.18));
      g.position.copy(c.position);
      group.add(c, g);
    }
    const hallLight = new THREE.PointLight(0xffd8a0, 45, 34, 1.4);
    hallLight.position.set(0, WH - 1.4, 4);
    group.add(hallLight);
    // where the guests stand (the mode puts people there)
    for (const [x, z, face] of [[-3.8, 9.7, Math.PI], [-2.1, 8.2, -Math.PI / 2], [3.8, 6.3, 0], [5.5, 8.0, Math.PI / 2], [-3.8, 2.6, Math.PI], [3.8, 0.4, 0], [-5.5, 16.1, Math.PI], [-4.4, 16.1, Math.PI], [3.8, -6.1, 0]]) {
      guests.push({ x, z, face });
    }

    // ---------------------------------------------------------------- the staff hall (behind the staff door)
    box(-8.6, -14.2, -1.2, -13.8, WH, M.white);
    box(1.2, -14.2, 8.6, -13.8, WH, M.white);
    box(-1.2, -14.2, 1.2, -13.8, WH - 2.6, M.white, 2.6);
    staffDoor = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.6, 0.15), mat(0x6a3a1a, { roughness: 0.5 }));
    staffDoor.position.set(0, 1.3, -14);
    group.add(staffDoor);
    staffDoorBox = world.addBox(-1.2, 0, -14.2, 1.2, 2.6, -13.8, { tag: 'wall' });
    const staffTex = makeTextTexture('STAFF ONLY', { color: '#ffd070', width: 512, height: 96, font: 'bold 60px "Bebas Neue", Impact, sans-serif' });
    const st = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.45), new THREE.MeshBasicMaterial({ map: staffTex, transparent: true }));
    st.position.set(0, 2.95, -13.78);
    group.add(st);
    panel = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.55, 0.1), new THREE.MeshStandardMaterial({ color: 0x1a1b20, emissive: 0xff3030, emissiveIntensity: 0.8 }));
    panel.position.set(1.85, 1.4, -13.72);
    group.add(panel);
    // lockers and a security desk with monitors (cover)
    for (let z = -26.5; z < -15.5; z += 1.1) block(-8.2, 0, z, 0.7, 2.1, 1.0, M.steel, true, 'prop');
    block(6.2, 0, -21, 2.6, 1.0, 1.2, M.dark, true, 'prop');
    for (const dx of [-0.6, 0.6]) {
      const mon = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.08), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, emissive: 0x2a8a5a, emissiveIntensity: 0.8 }));
      mon.position.set(6.2 + dx, 1.45, -21.5);
      group.add(mon);
    }
    for (const z of [-17, -24]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(14, 0.06, 0.25), new THREE.MeshBasicMaterial({ color: 0xe8f0ff }));
      strip.position.set(0, WH - 0.05, z);
      group.add(strip);
    }

    // ---------------------------------------------------------------- the counting room (the vault)
    box(-8.6, -28.2, -1.6, -27.8, WH, M.steel);
    box(1.6, -28.2, 8.6, -27.8, WH, M.steel);
    box(-1.6, -28.2, 1.6, -27.8, WH - 3.2, M.steel, 3.2);
    vaultDoorPivot = new THREE.Group();
    vaultDoorPivot.position.set(-1.6, 0, -28);
    const door = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.55, 0.45, 24), M.steel);
    door.rotation.x = Math.PI / 2;
    door.position.set(1.6, 1.6, 0);
    const wheelD = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 6, 16), M.gold);
    wheelD.position.set(1.6, 1.6, 0.3);
    const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 14), M.dark);
    dial.rotation.x = Math.PI / 2;
    dial.position.set(2.5, 2.3, 0.3);
    vaultDoorPivot.add(door, wheelD, dial);
    group.add(vaultDoorPivot);
    vaultDoorBox = world.addBox(-1.6, 0, -28.25, 1.6, 3.2, -27.75, { tag: 'wall' });
    // shelves of cash, a counting table, a money-counter
    block(0, 0, -34, 3, 0.9, 1.6, M.wood, true, 'prop');
    const money = new THREE.MeshStandardMaterial({ color: 0x5fae5a, roughness: 0.8 });
    for (const [x, z] of [[-6.5, -31], [6.5, -31], [-6.5, -37.5], [6.5, -37.5]]) {
      block(x, 0, z, 2.2, 1.0, 1.6, M.steel, true, 'prop');
      const stack = new THREE.Group();
      for (let k = 0; k < 8; k++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.32), money);
        b.position.set(-0.6 + (k % 4) * 0.4, 0.09 + Math.floor(k / 4) * 0.18, 0);
        stack.add(b);
      }
      stack.position.set(x, 1.0, z);
      group.add(stack);
      cash.push({ pos: new THREE.Vector3(x + (x < 0 ? 1.9 : -1.9), 0, z), stack });
    }
    const vaultLight = new THREE.PointLight(0xc8ffe0, 18, 20, 1.5);
    vaultLight.position.set(0, 5, -34);
    group.add(vaultLight);
  }

  // ------------------------------------------------------------------ the sea, the boats
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), new THREE.MeshStandardMaterial({ color: 0x0a1c2a, roughness: 0.25, metalness: 0.35 }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = SEA_Y;
  if (!distant) group.add(sea);
  // Paz's rowing boat against the starboard side, under the rope ladder
  const rowboat = buildRowboat();
  rowboat.position.set(14.6, SEA_Y + 0.2, 39.5);
  if (!distant) group.add(rowboat);
  const ROW = { x0: 13.2, x1: 16.2, z0: 37.4, z1: 41.6, y: SEA_Y + 0.6 };
  if (!distant) world.addBox(ROW.x0, ROW.y - 0.5, ROW.z0, ROW.x1, ROW.y, ROW.z1, { tag: 'roof' });
  // the rope ladder up the hull
  if (!distant) {
    ladders.push({ x: 13, z: 39.5, nx: 1, nz: 0, y0: ROW.y, y1: 0 });
    ladderMesh(13, 39.5, 1, 0, ROW.y, 0.2, mat(0xc8b48a, { roughness: 1 }));
  }
  // the speedboat that comes for you (off the port side, by the side door)
  const speedboat = buildSpeedboat();
  speedboat.position.set(-19.5, SEA_Y + 0.15, 0);
  speedboat.visible = false;
  if (!distant) group.add(speedboat);
  const escapeGlow = new THREE.Mesh(new THREE.RingGeometry(5, 6, 40), makeGlowMaterial(0x4dffa6, 0.8));
  escapeGlow.rotation.x = -Math.PI / 2;
  escapeGlow.position.set(-19.5, SEA_Y + 0.05, 0);
  const escapeBeam = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 30, 16, 1, true), makeGlowMaterial(0x4dffa6, 0.16));
  escapeBeam.position.set(-19.5, SEA_Y + 15, 0);
  escapeGlow.visible = escapeBeam.visible = false;
  if (!distant) group.add(escapeGlow, escapeBeam);

  // ------------------------------------------------------------------ guards, searchlights, places
  const guardRoutes = [
    [[-10, 25], [10, 25], [10, 51], [-10, 51]],          // round the stern deck
    [[11, 18], [11, -36]],                               // starboard promenade
    [[-11, -36], [-11, 18]],                             // port promenade
    [[-6, 13], [6, 13], [6, -10.5], [-6, -10.5]],        // the casino floor
    [[-6.5, -20], [5, -18]],                             // the staff hall
  ];
  const towers = [
    { x: 0, z: 16, h: RT + 6.6, path: [[-9, 27], [9, 28], [10, 50], [-9, 52], [0, 38]] },     // the mast over the stern deck
    { x: 0, z: -46, h: 11.6, path: [[0, -58], [-5, -66], [5, -66], [0, -72]] },              // the bridge: the foredeck
  ];
  const V = (x, z, y = 0.05) => new THREE.Vector3(x, y, z);
  const spots = {
    ladderTop: V(12, 39.5),
    panel: V(1.9, -12.9),
    dial: V(0.6, -26.8),
    boat: new THREE.Vector3(-19.5, SEA_Y, 0),
    jumpFrom: V(-12, 0),
    paz: new THREE.Vector3(15.2, ROW.y, 40.6),
  };
  const checkpoints = [
    { name: 'Paz\'s rowing boat', spawn: V(15, 39.5, ROW.y + 0.05), yaw: Math.PI / 2 },
    { name: 'The stern deck', spawn: V(10.5, 40), yaw: 0.4 },
    { name: 'The casino floor', spawn: V(0, 17.5), yaw: 0 },
    { name: 'The staff hall', spawn: V(0, -16), yaw: 0 },
    { name: 'The counting room', spawn: V(0, -30.5), yaw: Math.PI },
  ];

  return {
    group, world, spawn: checkpoints[0].spawn, checkpoints, buildings: [], ladders, hideSpots: [],
    guardRoutes, towers, spots, guests, staffDoor, staffDoorBox, panel, vaultDoorPivot, vaultDoorBox, cash,
    speedboat, rowboat, escapeGlow, escapeBeam, sea, roofY: RT,
  };
}

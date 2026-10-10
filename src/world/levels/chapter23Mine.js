import * as THREE from 'three';
import { CollisionWorld } from '../../core/collision.js';
import { makeGlowMaterial, getGlowTexture } from '../materials.js';
import { makeRng } from '../../core/utils.js';

// ======================================================================
//  Chapter 23, Part 4: level 9 of the Silver Crown mine, by lantern light.
//
//  One character per cell (CELL metres square), row = z, column = x:
//    #  rock                S  the bottom of the ventilation shaft (start)
//    .  tunnel              V  Sable's vault (a big room full of loot)
//    L  a lantern           B  a bag of loot (in the vault)
//    C  the ore cart, at the loading bay (where the line out of the mine starts)
//    E  the bottom of the main shaft (the lift: Sable comes down it later)
// ======================================================================

export const CELL = 4, HEIGHT = 3.6;
export const MAP = [
  '#################',
  '#S...L....#....E#',
  '#.###.###.#.###.#',
  '#...#...#.L.#...#',
  '###.###.#####.#.#',
  '#V..L.......L.#.#',
  '#VV.#####.###.#.#',
  '#BV.#.L.#.#...#.#',
  '#VB.#.#.#.#.###.#',
  '#BV.L.#.LC#.L...#',
  '#################',
];
export const cellPos = (r, c, y = 0) => new THREE.Vector3(c * CELL, y, r * CELL);
/** The Jackals' rounds (cells, walked in order and round again). */
export const ROUTES = [
  [[5, 5], [5, 11]],
  [[9, 5], [7, 5], [7, 7], [9, 7], [7, 7], [7, 5]],
  [[5, 9], [8, 9]],
  [[3, 13], [3, 15], [9, 15], [9, 11], [7, 11], [7, 13], [5, 13]],
  [[1, 4], [1, 9]],
];

function rockTexture(rng, tint = '#5a4436') {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = tint; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 260; i++) {
    const v = 50 + rng() * 60;
    g.fillStyle = `rgba(${v + 30},${v + 10},${v - 10},0.3)`;
    g.beginPath(); g.arc(rng() * 128, rng() * 128, 2 + rng() * 10, 0, Math.PI * 2); g.fill();
  }
  // a seam of silver ore
  g.strokeStyle = 'rgba(200,205,215,0.35)'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(0, 40 + rng() * 40); g.bezierCurveTo(40, 30, 80, 100, 128, 60 + rng() * 30); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildChapter23Mine() {
  const group = new THREE.Group();
  const world = new CollisionWorld(6);
  const rng = makeRng(2304);
  const H = MAP.length, W = MAP[0].length;
  const at = (r, c) => (r < 0 || c < 0 || r >= H || c >= W ? '#' : MAP[r][c]);
  const open = (r, c) => at(r, c) !== '#';
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra });
  const timber = std(0x6a4a2c), iron = std(0x4a4a50, { metalness: 0.6, roughness: 0.5 });

  // ---------------------------------------------------------------- rock, floor, ceiling
  const walls = [];
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (!open(r, c)) walls.push([r, c]);
  const wallMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL, HEIGHT, CELL), std(0xffffff, { map: rockTexture(rng) }), walls.length);
  const o = new THREE.Object3D();
  walls.forEach(([r, c], i) => { o.position.copy(cellPos(r, c, HEIGHT / 2)); o.updateMatrix(); wallMesh.setMatrixAt(i, o.matrix); });
  group.add(wallMesh);
  for (const [r, c] of walls) {
    const p = cellPos(r, c);
    world.addBox(p.x - CELL / 2, 0, p.z - CELL / 2, p.x + CELL / 2, HEIGHT, p.z + CELL / 2, { tag: 'wall' });
  }
  const span = new THREE.Vector3((W - 1) * CELL, 0, (H - 1) * CELL);
  const floorTex = rockTexture(rng, '#3a2e26');
  floorTex.repeat.set(W, H);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W * CELL, H * CELL), std(0x8a7a64, { map: floorTex }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(span.x / 2, 0, span.z / 2);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W * CELL, H * CELL), std(0x2a2018));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(span.x / 2, HEIGHT, span.z / 2);
  group.add(floor, ceil);
  world.addBox(-CELL, -1, -CELL, W * CELL, 0, H * CELL, { tag: 'roof' });
  world.addBox(-CELL, HEIGHT, -CELL, W * CELL, HEIGHT + 1, H * CELL, { tag: 'wall' });

  // ---------------------------------------------------------------- timber sets along the tunnels (posts and a cap), rails on the main drifts
  const posts = [], caps = [];
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    if (!open(r, c) || 'VB'.includes(at(r, c))) continue;
    const p = cellPos(r, c);
    const ns = !open(r - 1, c) && !open(r + 1, c), ew = !open(r, c - 1) && !open(r, c + 1);
    if (ns) { posts.push([p.x, p.z - CELL / 2 + 0.2], [p.x, p.z + CELL / 2 - 0.2]); caps.push([p.x, p.z, 0]); }
    else if (ew) { posts.push([p.x - CELL / 2 + 0.2, p.z], [p.x + CELL / 2 - 0.2, p.z]); caps.push([p.x, p.z, Math.PI / 2]); }
  }
  const postMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.28, HEIGHT, 0.28), timber, posts.length);
  posts.forEach(([x, z], i) => { o.position.set(x, HEIGHT / 2, z); o.rotation.set(0, 0, 0); o.updateMatrix(); postMesh.setMatrixAt(i, o.matrix); });
  const capMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.3, CELL), timber, caps.length);
  caps.forEach(([x, z, ry], i) => { o.position.set(x, HEIGHT - 0.2, z); o.rotation.set(0, ry, 0); o.updateMatrix(); capMesh.setMatrixAt(i, o.matrix); });
  group.add(postMesh, capMesh);
  const railCells = [];
  for (let c = 3; c <= 13; c++) railCells.push([5, c, 'x']);
  for (let r = 6; r <= 9; r++) railCells.push([r, 9, 'z']);
  const railMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 0.1, CELL), iron, railCells.length * 2);
  const sleeperMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 0.08, 0.22), timber, railCells.length * 4);
  railCells.forEach(([r, c, a], i) => {
    const p = cellPos(r, c);
    for (const [k, s] of [[0, -0.45], [1, 0.45]]) {
      o.position.set(p.x + (a === 'z' ? s : 0), 0.05, p.z + (a === 'x' ? s : 0)); o.rotation.set(0, a === 'x' ? Math.PI / 2 : 0, 0); o.updateMatrix(); railMesh.setMatrixAt(i * 2 + k, o.matrix);
    }
    for (let k = 0; k < 4; k++) {
      const t = -CELL / 2 + (k + 0.5) * CELL / 4;
      o.position.set(p.x + (a === 'x' ? t : 0), 0.04, p.z + (a === 'z' ? t : 0)); o.rotation.set(0, a === 'x' ? Math.PI / 2 : 0, 0); o.updateMatrix(); sleeperMesh.setMatrixAt(i * 4 + k, o.matrix);
    }
  });
  group.add(railMesh, sleeperMesh);

  // ---------------------------------------------------------------- the lanterns (you can blow them out)
  const lanterns = [];
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    if (at(r, c) !== 'L') continue;
    const p = cellPos(r, c);
    // hang it on a wall of its cell
    const [dr, dc] = [[-1, 0], [1, 0], [0, -1], [0, 1]].find(([a, b]) => !open(r + a, c + b)) || [0, 0];
    const pos = new THREE.Vector3(p.x + dc * (CELL / 2 - 0.35), 2.3, p.z + dr * (CELL / 2 - 0.35));
    const g = new THREE.Group();
    g.position.copy(pos);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.32, 8), iron);
    const glass = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffc070, toneMapped: false }));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0xffb060, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    halo.scale.setScalar(1.8);
    const light = new THREE.PointLight(0xffb060, 16, 9, 1.5);
    g.add(body, glass, halo, light);
    group.add(g);
    lanterns.push({ pos, on: true, glass, halo, light, relight: 0, cell: [r, c] });
  }

  // ---------------------------------------------------------------- Sable's vault: gold, crates, paintings, a safe, the bags
  const vaultLamp = new THREE.PointLight(0xffd090, 22, 12, 1.4);
  vaultLamp.position.copy(cellPos(7, 1.5, 3));
  group.add(vaultLamp);
  const vaultBulb = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe0a0, toneMapped: false }));
  vaultBulb.position.copy(vaultLamp.position);
  group.add(vaultBulb);
  const gold = new THREE.MeshStandardMaterial({ color: 0xd8b040, metalness: 0.9, roughness: 0.25 });
  const silver = new THREE.MeshStandardMaterial({ color: 0xc8ccd4, metalness: 0.9, roughness: 0.3 });
  for (const [r, c, mat] of [[5, 1, gold], [6, 1, silver], [6, 2, gold], [8, 1, silver]]) {
    const p = cellPos(r, c);
    for (let k = 0; k < 6; k++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.25), mat);
      bar.position.set(p.x - 1.2 + (k % 3) * 0.55, 0.09 + Math.floor(k / 3) * 0.18, p.z - 1.3 + (k % 2) * 0.1);
      group.add(bar);
    }
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1, 0.8, 0.9), std(0x7a5a3a));
    crate.position.set(p.x + 1.1, 0.4, p.z + 1.1);
    group.add(crate);
    world.addBox(p.x + 0.6, 0, p.z + 0.65, p.x + 1.6, 0.8, p.z + 1.55, { tag: 'wall' });
  }
  const safe = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.4, 1), std(0x2a3a2a, { metalness: 0.5 }));
  const sp = cellPos(9, 2);
  safe.position.set(sp.x + 1.2, 0.7, sp.z + 1.3);
  group.add(safe);
  world.addBox(sp.x + 0.65, 0, sp.z + 0.8, sp.x + 1.75, 1.4, sp.z + 1.8, { tag: 'wall' });
  for (const [r, c, col] of [[5, 2, 0x6a3a8a], [7, 2, 0x2a5a8a]]) { // paintings leaning on the rock
    const p = cellPos(r, c);
    const f = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 0.06), std(col));
    f.position.set(p.x, 1.4, p.z - CELL / 2 + 0.1 + (r === 7 ? CELL - 0.2 : 0));
    group.add(f);
  }
  const bags = [];
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    if (at(r, c) !== 'B') continue;
    const g = new THREE.Group();
    const sack = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), std(0x8a6a3a));
    sack.scale.set(1, 0.85, 1);
    sack.position.y = 0.34;
    const tie = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 0.2, 8), std(0x5a4024));
    tie.position.y = 0.72;
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), gold);
    glint.position.set(0.2, 0.62, 0.15);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.75, 24), makeGlowMaterial(0xffb020, 0.7));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    g.add(sack, tie, glint, ring);
    g.position.copy(cellPos(r, c));
    group.add(g);
    bags.push({ home: cellPos(r, c), group: g, ring, done: false });
  }

  // ---------------------------------------------------------------- the ore cart at the loading bay, the line out of the mine
  const cartPos = (() => { for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (at(r, c) === 'C') return cellPos(r, c); return cellPos(1, 1); })();
  const cart = buildOreCart();
  cart.position.copy(cartPos);
  group.add(cart);
  world.addBox(cartPos.x - 0.8, 0, cartPos.z - 1.1, cartPos.x + 0.8, 1.3, cartPos.z + 1.1, { tag: 'wall' });
  const mouth = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshBasicMaterial({ color: 0x080504 }));
  mouth.position.set(cartPos.x + CELL / 2 - 0.02, 1.5, cartPos.z);
  mouth.rotation.y = -Math.PI / 2;
  group.add(mouth);
  const dropRing = new THREE.Mesh(new THREE.RingGeometry(1.6, 2, 32), makeGlowMaterial(0x4dffa6, 0.7));
  dropRing.rotation.x = -Math.PI / 2;
  dropRing.position.set(cartPos.x - 1.6, 0.04, cartPos.z);
  group.add(dropRing);

  // ---------------------------------------------------------------- the lift at the main shaft, the rope down the ventilation shaft
  const lift = cellPos(1, 15);
  const cage = new THREE.Group();
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const bar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3, 0.1), iron); bar.position.set(x, 1.5, z); cage.add(bar); }
  const cageTop = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.15, 2.2), iron);
  cageTop.position.y = 3;
  cage.add(cageTop);
  cage.position.copy(lift);
  group.add(cage);
  const start = (() => { for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (at(r, c) === 'S') return cellPos(r, c, 0.05); return cellPos(1, 1, 0.05); })();
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, HEIGHT, 5), std(0xd8c8a0));
  rope.position.set(start.x + 0.6, HEIGHT / 2, start.z + 0.6);
  group.add(rope);

  return {
    group, world, lanterns, bags, cart, cartPos, dropRing, liftPos: lift,
    spawn: start, checkpoints: [], ladders: [], hideSpots: [], buildings: [],
  };
}

/** An old ore cart: a riveted iron hopper on four small wheels. */
export function buildOreCart(color = 0x5a4a40) {
  const g = new THREE.Group();
  const iron = new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.55 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2420, metalness: 0.5, roughness: 0.6 });
  // a hopper: wider at the top (four sloped sides and a floor)
  const floor = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 1.8), iron);
  floor.position.y = 0.45;
  g.add(floor);
  for (const [w, d, x, z, rx, rz] of [[1.4, 0.08, 0, 0.98, -0.2, 0], [1.4, 0.08, 0, -0.98, 0.2, 0], [0.08, 2.0, 0.68, 0, 0, 0.2], [0.08, 2.0, -0.68, 0, 0, -0.2]]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(w, 0.8, d), iron);
    side.position.set(x, 0.85, z);
    side.rotation.set(rx, 0, rz);
    g.add(side);
  }
  const rim = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.06, 2.15), dark);
  rim.position.y = 1.26;
  g.add(rim);
  const wheels = [];
  for (const [x, z] of [[-0.45, 0.6], [0.45, 0.6], [-0.45, -0.6], [0.45, -0.6]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 10), dark);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.2, z);
    g.add(w);
    wheels.push(w);
  }
  g.userData.wheels = wheels;
  return g;
}

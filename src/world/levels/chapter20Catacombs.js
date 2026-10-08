import * as THREE from 'three';
import { CollisionWorld } from '../../core/collision.js';
import { makeGlowMaterial } from '../materials.js';
import { makeRng } from '../../core/utils.js';

// ======================================================================
//  Chapter 20: the catacombs under Lumière (tunnels lined with bones),
//  pitch dark, on the way to the power station's cable vault.
//
//  One character per cell (CELL metres square), row = z, column = x:
//    #  rock (or a wall of bones)        S  where you come down the shaft
//    .  tunnel                           B  a spare battery for your torch
//    C  the cable vault (the three big cables run along its walls)
// ======================================================================

export const CELL = 3.4, HEIGHT = 3.2;
export const MAP = [
  '###################',
  '#S....#.....#....C#',
  '#.###.#.###.#.###.#',
  '#.#B#...#...#.#B..#',
  '#.#.#####.###.#.###',
  '#...#.....#...#...#',
  '###.#.###.#.#####.#',
  '#...#.#B#.#.....#.#',
  '#.###.#.#.#####.#.#',
  '#.....#...#.....#.#',
  '#.#########.#####.#',
  '#.................#',
  '###################',
];
/** Centre of cell (row r, column c) in the world. */
export const cellPos = (r, c, y = 0) => new THREE.Vector3(c * CELL, y, r * CELL);

/** The guards' rounds, as [row, col] cells (they walk back and forth). */
export const GUARD_ROUTES = [
  [[11, 1], [11, 9]],
  [[11, 17], [11, 11]],
  [[5, 5], [5, 9]],
  [[5, 17], [9, 17]],
  [[1, 13], [1, 16]],
];

function stoneTexture(rng, bones) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bones ? '#6a5e4a' : '#4a4640';
  g.fillRect(0, 0, 128, 128);
  if (bones) {
    // rows of skulls between rows of stacked long bones
    for (let y = 0; y < 128; y += 32) {
      g.fillStyle = '#c8bca0';
      for (let x = 0; x < 128; x += 6) g.fillRect(x, y + 2, 5, 9);        // bone ends
      for (let x = 6; x < 128; x += 21) {
        g.fillStyle = '#d8ccb0'; g.beginPath(); g.arc(x, y + 21, 8, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#2a2418'; g.fillRect(x - 5, y + 18, 3, 3); g.fillRect(x + 2, y + 18, 3, 3); g.fillRect(x - 1, y + 23, 2, 3);
      }
    }
  } else {
    for (let i = 0; i < 70; i++) {
      g.fillStyle = `rgba(${rng() < 0.5 ? '255,255,255' : '0,0,0'},${0.05 + rng() * 0.08})`;
      g.fillRect(rng() * 128, rng() * 128, 6 + rng() * 26, 4 + rng() * 14);
    }
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2;
    for (let y = 0; y < 128; y += 22) { g.beginPath(); g.moveTo(0, y); g.lineTo(128, y + (rng() - 0.5) * 6); g.stroke(); }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildChapter20Catacombs() {
  const group = new THREE.Group();
  const world = new CollisionWorld(6);
  const rng = makeRng(2020);
  const H = MAP.length, W = MAP[0].length;
  const at = (r, c) => (r < 0 || c < 0 || r >= H || c >= W ? '#' : MAP[r][c]);

  // the rock and the bone walls (two instanced meshes), floor and ceiling
  const walls = [];
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (at(r, c) === '#') walls.push([r, c]);
  const boneCells = walls.filter(() => rng() < 0.35);
  const rockCells = walls.filter((w) => !boneCells.includes(w));
  const box = new THREE.BoxGeometry(CELL, HEIGHT, CELL);
  for (const [cells, bones] of [[rockCells, false], [boneCells, true]]) {
    const im = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ map: stoneTexture(rng, bones), roughness: 0.95 }), cells.length);
    const o = new THREE.Object3D();
    cells.forEach(([r, c], i) => { o.position.copy(cellPos(r, c, HEIGHT / 2)); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
    group.add(im);
  }
  for (const [r, c] of walls) {
    const p = cellPos(r, c);
    world.addBox(p.x - CELL / 2, 0, p.z - CELL / 2, p.x + CELL / 2, HEIGHT, p.z + CELL / 2, { tag: 'wall' });
  }
  const span = new THREE.Vector3((W - 1) * CELL, 0, (H - 1) * CELL);
  const floorTex = stoneTexture(rng, false);
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(W, H);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W * CELL, H * CELL), new THREE.MeshStandardMaterial({ map: floorTex, color: 0x8a7a64, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(span.x / 2, 0, span.z / 2);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W * CELL, H * CELL), new THREE.MeshStandardMaterial({ color: 0x2a2620, roughness: 1 }));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(span.x / 2, HEIGHT, span.z / 2);
  group.add(floor, ceil);
  world.addBox(-CELL, -1, -CELL, W * CELL, 0, H * CELL, { tag: 'roof' });
  world.addBox(-CELL, HEIGHT, -CELL, W * CELL, HEIGHT + 1, H * CELL, { tag: 'wall' });

  // puddles that catch the light, candles left by the old quarrymen (a faint glow), a few rats
  for (let k = 0; k < 9; k++) {
    let r, c; do { r = 1 + Math.floor(rng() * (H - 2)); c = 1 + Math.floor(rng() * (W - 2)); } while (at(r, c) === '#');
    const pud = new THREE.Mesh(new THREE.CircleGeometry(0.6 + rng() * 0.6, 16), new THREE.MeshStandardMaterial({ color: 0x101418, roughness: 0.05, metalness: 0.8 }));
    pud.rotation.x = -Math.PI / 2;
    pud.position.copy(cellPos(r, c, 0.02)).add(new THREE.Vector3((rng() - 0.5) * 1.6, 0, (rng() - 0.5) * 1.6));
    group.add(pud);
  }
  const candles = [[5, 7], [9, 3], [11, 13], [3, 11], [7, 15]];
  for (const [r, c] of candles) {
    const p = cellPos(r, c);
    const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.25, 6), new THREE.MeshStandardMaterial({ color: 0xe8e0c8 }));
    wick.position.set(p.x + 1.2, 0.12, p.z + 1.2);
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffb050, toneMapped: false }));
    flame.position.set(p.x + 1.2, 0.3, p.z + 1.2);
    const glow = new THREE.PointLight(0xff9a40, 1.6, 6, 1.5);
    glow.position.set(p.x + 1.2, 0.6, p.z + 1.2);
    group.add(wick, flame, glow);
  }
  const rats = [];
  for (const [r0, c0, r1, c1] of [[9, 1, 9, 5], [7, 11, 7, 15], [11, 3, 11, 8]]) {
    const rat = new THREE.Group();
    const bodyM = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.3), new THREE.MeshStandardMaterial({ color: 0x3a3430 }));
    bodyM.position.y = 0.06;
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.3), bodyM.material);
    tail.position.set(0, 0.04, -0.28);
    rat.add(bodyM, tail);
    group.add(rat);
    rats.push({ g: rat, a: cellPos(r0, c0).add(new THREE.Vector3(1.3, 0, 1.3)), b: cellPos(r1, c1).add(new THREE.Vector3(1.3, 0, 1.3)), t: rng() * 10 });
  }

  // batteries for your torch
  const batteries = [];
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    if (at(r, c) !== 'B') continue;
    const g = new THREE.Group();
    const cell = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.36, 10), new THREE.MeshStandardMaterial({ color: 0x2a6ab0, metalness: 0.6, roughness: 0.3, emissive: 0x0a2a50 }));
    cell.position.y = 0.3;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.55, 20), makeGlowMaterial(0x5ab4ff, 0.6));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    g.add(cell, ring);
    g.position.copy(cellPos(r, c));
    group.add(g);
    batteries.push({ pos: g.position.clone(), mesh: g, taken: false });
  }

  // the cable vault: three fat cables come down the walls into junction boxes
  const [vr, vc] = (() => { for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (at(r, c) === 'C') return [r, c]; return [1, 1]; })();
  const cables = [];
  for (const [r, c, dx, dz] of [[vr, vc, 1, 0], [vr + 1, vc, 1, 0], [vr + 2, vc, 1, 0]]) {
    const p = cellPos(r, c);
    const wx = p.x + dx * (CELL / 2 - 0.25), wz = p.z + dz * (CELL / 2 - 0.25);
    const g = new THREE.Group();
    const boxM = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.9, 0.7), new THREE.MeshStandardMaterial({ color: 0x5a5d66, metalness: 0.6, roughness: 0.4 }));
    boxM.position.y = 1.2;
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, HEIGHT - 1.6, 8), new THREE.MeshStandardMaterial({ color: 0x1a1b20 }));
    cable.position.y = 1.6 + (HEIGHT - 1.6) / 2;
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0x4dff6a, toneMapped: false }));
    lamp.position.set(-0.16, 1.5, 0);
    const warn = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.3), new THREE.MeshBasicMaterial({ color: 0xffd040, toneMapped: false }));
    warn.position.set(-0.16, 1.15, 0);
    warn.rotation.y = -Math.PI / 2;
    g.add(boxM, cable, lamp, warn);
    g.position.set(wx, 0, wz);
    group.add(g);
    cables.push({ pos: new THREE.Vector3(wx - dx * 0.9, 0, wz), lamp, cut: false, t: 0 });
  }
  // the way out: a ladder up a shaft to a manhole
  const exit = cellPos(vr + 2, vc - 1);
  const ladder = new THREE.Group();
  const lm = new THREE.MeshStandardMaterial({ color: 0x6a6c72, metalness: 0.6 });
  for (const s of [-0.28, 0.28]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, HEIGHT, 0.06), lm); rail.position.set(s, HEIGHT / 2, 0); ladder.add(rail); }
  for (let y = 0.3; y < HEIGHT; y += 0.4) { const rung = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.05, 0.05), lm); rung.position.y = y; ladder.add(rung); }
  ladder.position.set(exit.x, 0, exit.z - CELL / 2 + 0.1);
  group.add(ladder);
  const exitGlow = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.2, 24), makeGlowMaterial(0x4dffa6, 0.8));
  exitGlow.rotation.x = -Math.PI / 2;
  exitGlow.position.set(exit.x, 0.04, exit.z - CELL / 2 + 0.9);
  exitGlow.visible = false;
  group.add(exitGlow);

  const start = (() => { for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (at(r, c) === 'S') return cellPos(r, c, 0.05); return cellPos(1, 1, 0.05); })();
  return {
    group, world, batteries, cables, rats, exit: new THREE.Vector3(exit.x, 0, exit.z - CELL / 2 + 0.9), exitGlow,
    vault: cellPos(vr + 1, vc),
    spawn: start, checkpoints: [], ladders: [], hideSpots: [], buildings: [],
  };
}

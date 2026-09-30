import * as THREE from 'three';
import { CollisionWorld } from '../../core/collision.js';
import { makeTextTexture, makeGlowMaterial, getGlowTexture } from '../materials.js';

// ======================================================================
//  Chapter 6, Part 3: Blackwater Prison, on its island, at night.
//
//  Seen from above (north = -Z), 92 x 82 m inside the walls:
//
//   z=-41 ┌──────────────────── D BLOCK (cells along the back) ─────────┐
//         │  T1 ●                corridor, Ricky's cell (east end)   ● T2 │
//   z=-22 │           ───────────door──────────                         ║ stairs up
//         │                                                              ║ the east wall
//         │   crates, barriers, laundry carts      guard patrols        ║ -> zip line
//         │                                                              │ over the sea
//         │  T3 ●                                                  ● T4  │ to Mags's boat
//         │   COAL WAGON (you arrive)   DOCK OFFICE (uniform)   bus      │
//   z=41  └──gate──────────────────────────────────────────────────────┘
//        x=-46                                                        x=46
// ======================================================================

export const WALL_H = 6.5;

export function buildChapter6Prison() {
  const group = new THREE.Group();
  const world = new CollisionWorld(8);
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
  const M = {
    wall: mat(0x6c6a66), dark: mat(0x2a2c30), block: mat(0x7a7870), concrete: mat(0x55565a), bars: mat(0x3a3e46, { metalness: 0.7, roughness: 0.4 }),
    crate: mat(0x7a5a36), orange: mat(0xe0701c), bus: mat(0xd8d2c2), rust: mat(0x6a3a22), tower: mat(0x3a3a3c), wood: mat(0x6b5236),
    laundry: mat(0x8a9aa8), rock: mat(0x3a3834),
  };
  const block = (x, y, z, w, h, d, material, solid = true, tag = 'wall') => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y + h / 2, z);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    if (solid) world.addBlock(x, y, z, w, h, d, { tag });
    return m;
  };
  const box = (x0, z0, x1, z1, h, material, y = 0) => block((x0 + x1) / 2, y, (z0 + z1) / 2, x1 - x0, h, z1 - z0, material);

  // ------------------------------------------------------------------ ground, sea, walls
  const yard = new THREE.Mesh(new THREE.PlaneGeometry(92, 82), mat(0x4a4b4e));
  yard.rotation.x = -Math.PI / 2;
  yard.receiveShadow = true;
  group.add(yard);
  world.addBox(-46, -2, -41, 46, 0, 41, { tag: 'ground' });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshLambertMaterial({ color: 0x0b2033 }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -1.2;
  group.add(sea);
  // Rocks round the island just outside the walls
  box(-50, -45, 50, -41, 0.6, M.rock, -1.2); box(-50, 41, 50, 45, 0.6, M.rock, -1.2);
  box(-50, -41, -46, 41, 0.6, M.rock, -1.2); box(46, -41, 50, 41, 0.6, M.rock, -1.2);
  // Perimeter walls (south wall has the rail gate at x -33..-27)
  box(-46.5, -41.5, 46.5, -40.5, WALL_H, M.wall);
  box(-46.5, 40.5, -33, 41.5, WALL_H, M.wall); box(-27, 40.5, 46.5, 41.5, WALL_H, M.wall);
  box(-46.5, -40.5, -45.5, 40.5, WALL_H, M.wall); box(45.5, -40.5, 46.5, 40.5, WALL_H, M.wall);
  box(-33, 40.5, -27, 41.5, 1.2, M.dark, WALL_H - 1.2); // (gate lintel)
  // Rails in through the gate
  for (const sx of [-30.75, -29.25]) block(sx, 0, 30, 0.12, 0.12, 24, M.bars, false);

  // ------------------------------------------------------------------ the coal wagon you arrived in
  box(-31.5, 23, -28.5, 35, 0.5, M.dark, 0.7);                       // floor (top 1.2)
  box(-31.5, 23, -31.3, 35, 1.6, M.bars, 1.2); box(-28.7, 23, -28.5, 35, 1.6, M.bars, 1.2);
  box(-31.5, 34.8, -28.5, 35, 1.6, M.bars, 1.2);
  box(-31.5, 23, -28.5, 23.2, 1.6, M.bars, 1.2);
  block(-30, 0, 27, 2.8, 0.7, 3, M.dark, false); block(-30, 0, 32, 2.8, 0.7, 3, M.dark, false);

  // ------------------------------------------------------------------ dock office (guard uniform inside)
  // walls with a doorway facing the yard (north side, x -15..-12)
  box(-18, 25.8, -15, 26.2, 3.4, M.block); box(-12, 25.8, -8, 26.2, 3.4, M.block);
  box(-18, 33.8, -8, 34.2, 3.4, M.block); box(-18.2, 25.8, -17.8, 34.2, 3.4, M.block); box(-8.2, 25.8, -7.8, 34.2, 3.4, M.block);
  box(-18.2, 25.8, -7.8, 34.2, 0.3, M.dark, 3.4);                    // roof
  block(-10.5, 0, 32.9, 2.2, 0.08, 0.5, M.bars, false).position.y = 1.9; // clothes rail
  for (let i = 0; i < 3; i++) block(-11.3 + i * 0.6, 0.75, 32.9, 0.45, 1.05, 0.3, mat(0x24324a), false);
  const officeSign = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), new THREE.MeshBasicMaterial({ map: makeTextTexture('DOCK OFFICE', { color: '#ffd28a', bg: 'rgba(12,14,22,0.9)', width: 512, height: 128 }), toneMapped: false }));
  officeSign.position.set(-13, 3.0, 25.7);
  officeSign.rotation.y = Math.PI;
  group.add(officeSign);

  // ------------------------------------------------------------------ the yard: cover
  const crates = [[-24, 8, 2], [-22.4, 8, 1], [-10, -4, 1], [-11.4, -4, 2], [4, 2, 1], [16, -6, 2], [17.4, -6, 1], [28, 6, 1], [-34, -8, 2], [-2, 14, 1], [30, -12, 2], [22, 16, 1]];
  for (const [x, z, n] of crates) for (let k = 0; k < n; k++) block(x, k * 1.4, z, 1.4, 1.4, 1.4, M.crate);
  // low concrete barriers (crouch behind them)
  for (const [x0, z0, x1, z1] of [[-30, -2, -22, -1.2], [-16, 18, -8, 18.8], [6, -16, 14, -15.2], [20, 2, 20.8, 10], [-18, -14, -10, -13.2], [32, 22, 40, 22.8]]) box(x0, z0, x1, z1, 1.0, M.concrete);
  // laundry carts
  for (const [x, z] of [[-4, 24], [0, 24], [10, -2], [-26, 18]]) block(x, 0, z, 1.4, 1.2, 1.0, M.laundry);
  // the prison bus
  block(18, 0, 30, 11, 2.9, 2.8, M.bus);
  const busSign = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.8), new THREE.MeshBasicMaterial({ map: makeTextTexture('BLACKWATER CORRECTIONS', { color: '#222', bg: '#d8d2c2', width: 1024, height: 128, font: 'bold 70px "Bebas Neue", Impact, sans-serif', glow: false }) }));
  busSign.position.set(18, 2.2, 28.58);
  busSign.rotation.y = Math.PI;
  group.add(busSign);

  // ------------------------------------------------------------------ watchtowers (searchlights)
  const towers = [
    { x: -40, z: -34, h: 12, path: [[-26, -14], [-6, -18], [-14, 2], [-30, -4]] },
    { x: 40, z: -34, h: 12, path: [[26, -16], [8, -20], [16, 0], [34, -6]] },
    { x: -40, z: 16, h: 12, path: [[-24, 6], [-8, 12], [-20, 22], [-34, 12]] },
    { x: 40, z: 16, h: 12, path: [[28, 4], [8, 10], [14, 22], [34, 18]] },
  ];
  for (const t of towers) {
    for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) block(t.x + ox, 0, t.z + oz, 0.3, t.h - 1, 0.3, M.tower);
    block(t.x, t.h - 1.6, t.z, 3.4, 0.25, 3.4, M.tower);
    block(t.x, t.h - 1.35, t.z, 3.4, 1.0, 0.1, M.tower, false);
    world.addBlock(t.x, 0, t.z, 2.4, t.h - 1, 2.4, { tag: 'tower' });
  }
  // yard floodlights (just glows: the real light is the moon)
  for (const [x, z] of [[-45, 0], [45, 0], [0, 40.5], [0, -21.5]]) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0xffe6b0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0.8 }));
    s.position.set(x, WALL_H + 0.8, z);
    s.scale.setScalar(5);
    group.add(s);
  }

  // ------------------------------------------------------------------ D Block
  // outer walls (the back is the prison's north wall), door gap in the front at x -2..2
  box(-24, -22.5, -2, -21.5, 6, M.block); box(2, -22.5, 24, -21.5, 6, M.block);
  box(-24.5, -40.5, -23.5, -21.5, 6, M.block); box(23.5, -40.5, 24.5, -21.5, 6, M.block);
  box(-24.5, -40.5, 24.5, -21.5, 0.4, M.dark, 6);                    // roof
  box(-2, -22.5, 2, -21.5, 1.4, M.dark, 4.6);                         // lintel over the door
  const dSign = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.2), new THREE.MeshBasicMaterial({ map: makeTextTexture('D BLOCK', { color: '#ff6a3a', bg: 'rgba(12,14,22,0.92)', width: 512, height: 128 }), toneMapped: false }));
  dSign.position.set(0, 5.2, -21.45);
  group.add(dSign);
  // cells along the back: dividers, and bars along the front (z -31) with a door in each
  const cellXs = [-20, -12, -4, 4, 12, 20]; // cell centres (8 m wide)
  for (let k = 0; k <= cellXs.length; k++) box(-24 + k * 8 - 0.2, -40.5, -24 + k * 8 + 0.2, -31, 3.2, M.block);
  let cellDoor = null, cellDoorBox = null;
  for (const cx of cellXs) {
    // bars either side of the door
    for (let x = cx - 3.8; x <= cx + 3.8; x += 0.35) if (Math.abs(x - cx) > 1.05) block(x, 0, -31, 0.08, 3.2, 0.08, M.bars, false);
    world.addBox(cx - 4, 0, -31.1, cx - 1, 3.2, -30.9, { tag: 'bars' });
    world.addBox(cx + 1, 0, -31.1, cx + 4, 3.2, -30.9, { tag: 'bars' });
    const door = new THREE.Group();
    for (let x = -0.9; x <= 0.9; x += 0.35) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.08, 3.2, 0.08), M.bars); b.position.set(x, 1.6, 0); door.add(b); }
    door.position.set(cx, 0, -31);
    group.add(door);
    const doorBox = world.addBox(cx - 1, 0, -31.1, cx + 1, 3.2, -30.9, { tag: 'bars' });
    if (cx === 12) { cellDoor = door; cellDoorBox = doorBox; }
    block(cx - 2.5, 0, -39, 2.2, 0.5, 1, M.wood, false);             // bunk
  }
  // Ricky's cell keypad (on the corridor side)
  const keypad = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.5, 0.08), new THREE.MeshStandardMaterial({ color: 0x1a1c22, emissive: 0xff3030, emissiveIntensity: 1 }));
  keypad.position.set(14, 1.4, -30.8);
  group.add(keypad);
  // strip lights in the corridor
  for (let x = -20; x <= 20; x += 8) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 0.3), new THREE.MeshBasicMaterial({ color: 0xfff2c8, toneMapped: false }));
    l.position.set(x, 5.9, -26);
    group.add(l);
  }
  const corridorLight = new THREE.PointLight(0xfff0d0, 30, 30, 1.6);
  corridorLight.position.set(0, 5, -26);
  group.add(corridorLight);

  // ------------------------------------------------------------------ the way out: stairs up the east wall, zip line to the boat
  for (let k = 0; k < 8; k++) box(42.5, -2 - k * 1.3 - 1.3, 45.5, -2 - k * 1.3, (k + 1) * 0.8, M.concrete);
  box(42.5, -16, 45.5, -12.4, 6.8, M.concrete);                      // landing at the top (6.8)
  // the pier and Mags's boat outside
  box(62, -24, 82, -4, 1.4, M.wood, -0.4);                           // pier (top 1.0)
  const boat = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(3, 1.2, 8), mat(0xe8e8e8));
  hull.position.y = 0.2;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 2.4), mat(0x2a70a8));
  deck.position.set(0, 1.2, 1);
  boat.add(hull, deck);
  boat.position.set(86, -0.6, -14);
  group.add(boat);
  const pierGlow = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.8, 32), makeGlowMaterial(0x4dffa6, 0.8));
  pierGlow.rotation.x = -Math.PI / 2;
  pierGlow.position.set(74, 1.05, -14);
  group.add(pierGlow);
  // zip line: from above the landing, over the wall, down to the pier
  const zip = { a: new THREE.Vector3(44, 6.8 + 2.4, -14.2), b: new THREE.Vector3(70, 1.0 + 2.2, -14) };
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, zip.a.distanceTo(zip.b), 6), new THREE.MeshLambertMaterial({ color: 0x9aa0a8 }));
  cable.position.copy(zip.a).add(zip.b).multiplyScalar(0.5);
  cable.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), zip.b.clone().sub(zip.a).normalize());
  group.add(cable);
  for (const p of [zip.a, zip.b]) {
    block(p.x, p.y - 2.6, p.z, 0.25, 3, 0.25, M.dark, false);
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.08), new THREE.MeshBasicMaterial({ color: 0xffd040, toneMapped: false }));
    h.position.set(p.x, p.y - 0.35, p.z);
    group.add(h);
  }

  // ------------------------------------------------------------------ people and places
  const guardRoutes = [
    [[-32, 10], [-6, 10], [-6, -12], [-32, -12]],                   // west yard loop
    [[6, -14], [32, -14], [32, 12], [6, 12]],                        // east yard loop
    [[-20, -26], [20, -26]],                                         // D Block corridor
    [[-2, 20], [-2, 36], [12, 36], [12, 20]],                        // by the dock office
  ];
  const spots = {
    uniform: new THREE.Vector3(-10.5, 0, 31.9),
    keypad: new THREE.Vector3(14, 0, -29.6),
    cell: new THREE.Vector3(12, 0, -35),
    landing: new THREE.Vector3(44, 6.8, -14.2),
    pier: new THREE.Vector3(74, 1.0, -14),
  };
  const checkpoints = [
    { name: 'The rail dock', spawn: new THREE.Vector3(-26, 0.05, 30), yaw: 0 },
    { name: 'D Block', spawn: new THREE.Vector3(0, 0.05, -24), yaw: Math.PI / 2 },
    { name: 'Ricky\'s cell', spawn: new THREE.Vector3(12, 0.05, -28), yaw: -Math.PI / 2 },
  ];
  // Other prisoners in their cells (scenery)
  const inmates = [[-20, -36], [-4, -37], [20, -35.5]];

  return {
    group, world, spawn: checkpoints[0].spawn, checkpoints, buildings: [], ladders: [], hideSpots: [],
    towers, guardRoutes, spots, cellDoor, cellDoorBox, keypad, zip, pierGlow, inmates,
  };
}

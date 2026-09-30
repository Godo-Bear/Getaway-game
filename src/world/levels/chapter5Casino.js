import * as THREE from 'three';
import { CollisionWorld } from '../../core/collision.js';
import { makeTextTexture, makeGlowMaterial } from '../materials.js';

// ======================================================================
//  Chapter 5, Part 2: the Lucky Star casino (on foot, indoors).
//
//  64 x 48 m, seen from above (north = -Z):
//
//   z=-24 ┌─────────────┬──────────────────────────────┬────────────┐
//         │  VAULT      │  VAULT CORRIDOR  (lasers)     │  CASHIER   │
//         │  cash       ◉ dial      <- walk west        ▯ door CAGE  │
//   z=-16 ├──shutter────┴───────────────────────▯keycard┴──door──────┤
//         │ EXIT                                                     │
//         │ (garage)     CASINO FLOOR                                │
//         │   slot machine rows (west)      card tables (east)       │
//   z=10  ├───────────────┬──────door─────────┬──────────────────────┤
//         │ SECURITY      door   LOUNGE      door   STAFF ROOM       │
//         │ OFFICE        │   (guard, sofas)  │   (you start here)   │
//   z=24  └───────────────┴───────────────────┴──────────────────────┘
//        x=-32          x=-12               x=8                    x=32
//
//  Order of play: hack the security terminal (cameras off) -> keycard from
//  the cashier's cage -> the vault corridor (lasers) -> crack the vault
//  dial -> grab the cash -> ALARM -> out through the shutter to the garage.
// ======================================================================

export const WALL_H = 5;

export function buildChapter5Casino() {
  const group = new THREE.Group();
  const world = new CollisionWorld(8);
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra });
  const M = {
    wall: mat(0x3a2440),            // deep plum walls
    staff: mat(0x6a6f78),           // plain grey back-of-house walls
    trim: mat(0xc9a44a, { metalness: 0.6, roughness: 0.35 }),
    steel: mat(0x9aa0aa, { metalness: 0.8, roughness: 0.3 }),
    dark: mat(0x1a1c22),
    felt: mat(0x0f5a3a),
    wood: mat(0x4a2a18, { roughness: 0.5 }),
    sofa: mat(0x7a1f2e),
    machine: mat(0x2a2d38, { metalness: 0.4, roughness: 0.45 }),
    cash: mat(0x3f8a4a, { emissive: 0x14381a, emissiveIntensity: 0.6 }),
    locker: mat(0x5a6b7a, { metalness: 0.5 }),
  };
  const block = (x, y, z, w, h, d, material, solid = true, props) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y + h / 2, z);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    if (solid) world.addBlock(x, y, z, w, h, d, props || { tag: 'wall' });
    return m;
  };
  const wall = (x1, z1, x2, z2, material = M.wall) => {
    const w = Math.max(0.4, Math.abs(x2 - x1)), d = Math.max(0.4, Math.abs(z2 - z1));
    block((x1 + x2) / 2, 0, (z1 + z2) / 2, w, WALL_H, d, material);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, 0.14, d + 0.04), M.trim);
    trim.position.set((x1 + x2) / 2, 3.2, (z1 + z2) / 2);
    group.add(trim);
  };

  // ------------------------------------------------------------------ floor & ceiling
  const carpet = new THREE.Mesh(new THREE.PlaneGeometry(64, 48), new THREE.MeshStandardMaterial({ map: carpetTexture(), roughness: 0.95 }));
  carpet.material.map.wrapS = carpet.material.map.wrapT = THREE.RepeatWrapping;
  carpet.material.map.repeat.set(16, 12);
  carpet.rotation.x = -Math.PI / 2;
  carpet.receiveShadow = true;
  group.add(carpet);
  world.addBox(-33, -1, -25, 33, 0, 25, { tag: 'floor' });
  // Back-of-house floors: plain concrete
  for (const [x0, z0, x1, z1] of [[-32, 10, 32, 24], [-32, -24, 32, -16]]) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat(0x55585e, { roughness: 0.9 }));
    f.rotation.x = -Math.PI / 2;
    f.position.set((x0 + x1) / 2, 0.01, (z0 + z1) / 2);
    f.receiveShadow = true;
    group.add(f);
  }
  const ceil = new THREE.Mesh(new THREE.BoxGeometry(66, 0.3, 50), mat(0x120c16));
  ceil.position.y = WALL_H + 0.15;
  ceil.castShadow = true;
  group.add(ceil);
  world.addBox(-33, WALL_H, -25, 33, WALL_H + 1, 25, { tag: 'ceiling' });

  // ------------------------------------------------------------------ walls
  wall(-32, -24, 32, -24); wall(-32, 24, 32, 24); wall(-32, -24, -32, -6); wall(-32, -2, -32, 24); wall(32, -24, 32, 24);
  world.addBox(-34, 0, -6, -32.4, WALL_H, -2, { tag: 'wall' }); // (outside the garage exit)
  // z = 10: back of house / casino floor (one door from the lounge, x -4..0)
  wall(-32, 10, -4, 10, M.staff); wall(0, 10, 32, 10, M.staff);
  wall(8, 10, 8, 15, M.staff); wall(8, 18, 8, 24, M.staff);       // staff room | lounge (door z 15..18)
  wall(-12, 10, -12, 18, M.staff); wall(-12, 21, -12, 24, M.staff); // lounge | security office (door z 18..21)
  // z = -16: casino floor / north strip
  wall(-32, -16, -26, -16); wall(-22, -16, 9, -16); wall(13, -16, 20, -16); wall(23, -16, 32, -16);
  wall(-16, -24, -16, -22, M.steel); wall(-16, -18, -16, -16, M.steel); // vault | corridor (vault door z -22..-18)
  wall(14, -24, 14, -16, M.staff);                                      // corridor | cashier's cage
  // Doors that open during the heist
  const keycardDoor = block(11, 0, -16, 4, WALL_H, 0.5, mat(0x2a2d38, { metalness: 0.6, emissive: 0x4a0000, emissiveIntensity: 0.6 }), true);
  const keycardDoorBox = world.boxes[world.boxes.length - 1];
  const shutter = block(-24, 0, -16, 4, WALL_H, 0.4, mat(0x5a5f68, { metalness: 0.7 }), true);
  const shutterBox = world.boxes[world.boxes.length - 1];
  const vaultDoorPivot = new THREE.Group();
  vaultDoorPivot.position.set(-16, 0, -22);
  group.add(vaultDoorPivot);
  const vd = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 0.6, 40), M.steel);
  vd.rotation.z = Math.PI / 2;
  vd.position.set(0, 2.2, 2);
  vaultDoorPivot.add(vd);
  const dialMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.15, 24), mat(0xd8c070, { metalness: 0.9, roughness: 0.2 }));
  dialMesh.rotation.z = Math.PI / 2;
  dialMesh.position.set(0.35, 2.2, 2);
  vaultDoorPivot.add(dialMesh);
  world.addBox(-16.35, 0, -22, -15.65, WALL_H, -18, { tag: 'wall' });
  const vaultDoorBox = world.boxes[world.boxes.length - 1];

  // ------------------------------------------------------------------ staff room (start)
  for (let i = 0; i < 8; i++) block(10 + i * 1.1, 0, 23.4, 1, 2.1, 0.7, M.locker);
  block(22, 0, 13, 5, 0.5, 1.2, M.wood);
  block(28.5, 0, 17, 1.2, 1, 4, M.wood);

  // ------------------------------------------------------------------ lounge (guard, sofas = low cover, vending = tall)
  block(-4.5, 0, 16.5, 2.2, 2.1, 1, mat(0x8a1a2a, { emissive: 0x3a0610, emissiveIntensity: 0.5 })); // vending machines
  block(-6.9, 0, 16.5, 2.2, 2.1, 1, mat(0x1a3a8a, { emissive: 0x06103a, emissiveIntensity: 0.5 }));
  block(2.5, 0, 19.5, 3.2, 1.0, 1.1, M.sofa);
  block(-10, 0, 12.1, 1.1, 1.0, 3.2, M.sofa);
  block(3, 0, 12.4, 3, 1.0, 1, M.sofa);
  // A clothes rail with staff uniforms (the disguise)
  block(-10.6, 0, 22.9, 2.2, 0.08, 0.5, M.steel, false).position.y = 1.9;
  for (let i = 0; i < 4; i++) block(-11.4 + i * 0.5, 0.75, 22.9, 0.42, 1.05, 0.3, mat(0x7a1f2e), false);

  // ------------------------------------------------------------------ security office
  block(-22, 0, 22.8, 10, 1, 1.4, M.dark); // desk under the monitor wall
  const monitors = [];
  for (let i = 0; i < 6; i++) {
    const mon = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.85, 0.08), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x2a6cff, emissiveIntensity: 1.2 }));
    mon.position.set(-26.5 + i * 1.8, 2.1 + (i % 2) * 0.95, 23.55);
    group.add(mon);
    monitors.push(mon);
  }
  block(-28, 0, 13, 1.2, 2.2, 3, M.locker);
  const terminal = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.3, 0.6), new THREE.MeshStandardMaterial({ color: 0x1a1c22, emissive: 0xff3030, emissiveIntensity: 0.9 }));
  terminal.position.set(-18, 0.65, 13);
  group.add(terminal);
  world.addBlock(-18, 0, 13, 0.9, 1.3, 0.6, { tag: 'wall' });

  // ------------------------------------------------------------------ casino floor
  // Slot machines (tall cover) in rows on the west side, as instanced meshes
  const slotSpots = [];
  for (const z of [-9, -2.5, 4]) {
    for (let x = -28.5; x <= -8; x += 1.3) {
      if (Math.abs(x + 18) < 1.4) continue; // a gap in each row to walk through
      slotSpots.push([x, z]);
    }
  }
  const slots = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 1.9, 0.9), M.machine, slotSpots.length);
  const screens = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.8, 0.55), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), slotSpots.length * 2);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), c = new THREE.Color();
  const neon = [0xff3fa4, 0x39e6ff, 0xffd23a, 0x7dff8a, 0xb48cff];
  slotSpots.forEach(([x, z], i) => {
    m4.makeTranslation(x, 0.95, z);
    slots.setMatrixAt(i, m4);
    for (const side of [-1, 1]) {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), side > 0 ? 0 : Math.PI);
      m4.compose(new THREE.Vector3(x, 1.35, z + side * 0.46), q, sc);
      const k = i * 2 + (side > 0 ? 0 : 1);
      screens.setMatrixAt(k, m4);
      screens.setColorAt(k, c.setHex(neon[(i + (side > 0 ? 0 : 2)) % neon.length]));
    }
  });
  slots.castShadow = true;
  group.add(slots, screens);
  // one collider per run of machines
  for (const z of [-9, -2.5, 4]) {
    world.addBox(-29.1, 0, z - 0.45, -19.3, 1.9, z + 0.45, { tag: 'wall' });
    world.addBox(-16.7, 0, z - 0.45, -7.4, 1.9, z + 0.45, { tag: 'wall' });
  }
  // Card tables (low cover: crouch behind them) on the east side
  const tableSpots = [];
  for (const x of [5, 11, 17, 23, 28]) for (const z of [-8, -1.5, 5]) tableSpots.push([x, z]);
  for (const [x, z] of tableSpots) {
    block(x, 0, z, 2.6, 0.95, 1.5, M.wood);
    const felt = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.04, 1.2), M.felt);
    felt.position.set(x, 0.97, z);
    group.add(felt);
  }
  // A big roulette wheel in the middle
  const roulette = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 1, 28), M.wood);
  roulette.position.set(-1, 0.5, -3);
  group.add(roulette);
  world.addBlock(-1, 0, -3, 3.2, 1, 3.2, { tag: 'wall' });
  const wheel = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.08, 24), new THREE.MeshStandardMaterial({ color: 0xaa1122, emissive: 0x440008, metalness: 0.3 }));
  wheel.position.set(-1, 1.04, -3);
  group.add(wheel);
  // Neon sign over the floor
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.8), new THREE.MeshBasicMaterial({
    map: makeTextTexture('LUCKY STAR', { color: '#ff3fa4', bg: 'rgba(0,0,0,0)', width: 1024, height: 180, font: 'bold 130px "Bebas Neue", Impact, sans-serif' }),
    transparent: true, toneMapped: false }));
  sign.position.set(0, 4.1, 9.7);
  sign.rotation.y = Math.PI;
  group.add(sign);

  // ------------------------------------------------------------------ cashier's cage (keycard)
  for (let x = 15; x < 32; x += 1.5) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 3, 0.06), M.trim);
    bar.position.set(x, 1.5, -16.6);
    group.add(bar);
  }
  block(28, 0, -22.5, 6, 1.1, 1.2, M.wood);

  // ------------------------------------------------------------------ the vault
  const cashPiles = [[-29, -22], [-24, -22.5], [-28, -18.5]].map(([x, z]) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const pal = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.3, 1.3), M.wood);
    pal.position.y = 0.15;
    const stack = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.9, 1.0), M.cash);
    stack.position.y = 0.75;
    g.add(pal, stack);
    group.add(g);
    return { group: g, pos: new THREE.Vector3(x, 0, z) };
  });
  for (let i = 0; i < 5; i++) block(-30 + i * 2.6, 0, -23.6, 2.4, 3.4, 0.5, M.steel, false);

  // ------------------------------------------------------------------ lasers (vault corridor, walking west)
  // pulse: on/off on a timer; low: always on, waist height (crouch or slide under)
  const lasers = [
    { x: 6, type: 'pulse', phase: 0 },
    { x: 2, type: 'low' },
    { x: -2, type: 'pulse', phase: 1.3 },
    { x: -6, type: 'low' },
    { x: -10, type: 'pulse', phase: 0.6 },
  ].map((L) => {
    const heights = L.type === 'low' ? [1.15] : [0.45, 1.15, 1.85];
    const beams = heights.map((y) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 8), makeGlowMaterial(0xff2030, 0.95));
      b.position.set(L.x, y, -20);
      group.add(b);
      return b;
    });
    const emit = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.2, 0.3), M.dark);
    emit.position.set(L.x, 1.1, -23.75);
    group.add(emit);
    return { ...L, heights, beams };
  });

  // ------------------------------------------------------------------ chips to grab (bonus cash)
  const chipSpots = [[14, 20], [-3, 22], [-26, 17], [-18, -5.8], [-12, 1], [20, -4.8], [26, 1.8], [-4, -13], [31, -12], [-20, 7]];
  const chipMat = new THREE.MeshStandardMaterial({ color: 0xffd23a, emissive: 0x6a4a00, emissiveIntensity: 0.8, metalness: 0.5 });
  const chips = chipSpots.map(([x, z]) => {
    const g = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const chip = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 14), chipMat);
      chip.position.set((k % 2) * 0.28 - 0.14, 0.9 + Math.floor(k / 2) * 0.07, 0);
      g.add(chip);
    }
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 20), makeGlowMaterial(0xffd23a, 0.7));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    g.add(ring);
    g.position.set(x, 0, z);
    group.add(g);
    return { group: g, pos: new THREE.Vector3(x, 0, z), ring };
  });

  // ------------------------------------------------------------------ lights
  const lights = [];
  for (const [x, z, col, int] of [[-18, 0, 0xff5ab4, 34], [16, 0, 0xffc27a, 34], [0, -6, 0xb48cff, 20], [-22, 17, 0xa0c4ff, 22], [18, 17, 0xfff0d0, 22], [-2, 17, 0xffd9a0, 18], [-2, -20, 0xff6060, 18], [-25, -20, 0xffe0a0, 22]]) {
    const l = new THREE.PointLight(col, int, 24, 1.5);
    l.position.set(x, WALL_H - 0.5, z);
    group.add(l);
    lights.push(l);
  }
  group.add(new THREE.AmbientLight(0xffd6f0, 0.3));
  const alarmLight = new THREE.PointLight(0xff2020, 0, 70, 1.2);
  alarmLight.position.set(0, 4, -4);
  group.add(alarmLight);
  // Glowing strips along the floor's ceiling
  for (let x = -28; x <= 28; x += 8) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(5, 0.06, 0.25), new THREE.MeshBasicMaterial({ color: neon[(x / 8 + 4) % neon.length | 0], toneMapped: false }));
    strip.position.set(x, WALL_H - 0.08, -3);
    group.add(strip);
  }
  const exitSign = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.6), new THREE.MeshBasicMaterial({
    map: makeTextTexture('GARAGE', { color: '#ffffff', bg: '#1b7a3a', width: 256, height: 80, font: 'bold 56px "Bebas Neue", Impact, sans-serif', glow: false }), toneMapped: false }));
  exitSign.position.set(-31.75, 3.4, -4);
  exitSign.rotation.y = Math.PI / 2;
  group.add(exitSign);

  // ------------------------------------------------------------------ security cameras (on the floor)
  const cams = [
    secCam(group, 31.5, 4.2, 9.5, Math.PI / 4, 0),           // south-east corner, looking north-west
    secCam(group, -31.5, 4.2, -15.5, -Math.PI * 0.75, 1.5),  // north-west corner, looking south-east
    secCam(group, 4, 4.2, -15.5, Math.PI, 3),                // north wall, looking south
  ];

  const spots = {
    terminal: new THREE.Vector3(-18, 0, 14.4),
    keycard: new THREE.Vector3(27, 0, -20),
    corridor: new THREE.Vector3(11, 0, -14.6),
    dial: new THREE.Vector3(-14.8, 0, -20),
    uniform: new THREE.Vector3(-10.6, 0, 21.6),
    exit: new THREE.Vector3(-30.8, 0, -4),
  };
  // Where you respawn after getting caught (the last one you reached)
  const checkpoints = [
    { name: 'Staff room', spawn: new THREE.Vector3(26, 0.05, 19), yaw: Math.PI / 2 },
    // (checkpoint 0 changes with the heist plan's way in: see ENTRIES below)
    { name: 'Security office', spawn: new THREE.Vector3(-18, 0.05, 16), yaw: Math.PI },
    { name: 'Cashier\'s cage', spawn: new THREE.Vector3(26, 0.05, -21), yaw: 0 },
    { name: 'Vault corridor', spawn: new THREE.Vector3(11.5, 0.05, -20), yaw: Math.PI / 2 },
    { name: 'The vault', spawn: new THREE.Vector3(-26, 0.05, -20), yaw: -Math.PI / 2 },
  ];
  // Guard patrol loops (along open floor)
  const guardRoutes = [
    [[-9.5, 14.2], [5, 14.2], [5, 21.5], [-9.5, 21.5]],          // lounge
    [[-30.6, -12], [-6.3, -12], [-6.3, 7.5], [-30.6, 7.5]],       // west floor, around the slots
    [[3, -11.5], [30, -11.5], [30, 7.5], [3, 7.5]],               // east floor, around the tables
    [[18, -13.5], [2, -13.5]],                                    // by the cage and vault doors
  ];

  // The heist plan's ways in (checkpoint 0)
  const entries = {
    staff: checkpoints[0],
    vent: { name: 'Security office', spawn: new THREE.Vector3(-27, 0.05, 17.5), yaw: -Math.PI / 2 },
    front: { name: 'Casino floor', spawn: new THREE.Vector3(-24, 0.05, 0.7), yaw: -Math.PI / 2 },
  };

  return {
    group, world, spawn: checkpoints[0].spawn, checkpoints, entries, buildings: [], ladders: [], hideSpots: [],
    cams, lasers, chips, cashPiles, spots, guardRoutes, lights, alarmLight, monitors, terminal, dialMesh, wheel,
    keycardDoor, keycardDoorBox, shutter, shutterBox, vaultDoorPivot, vaultDoorBox,
    clues: [{ id: 'badge', pos: new THREE.Vector3(-24, 0.05, 20.2) }],
  };
}

/** A ceiling camera that sweeps side to side, with a red view cone. */
function secCam(group, x, y, z, yaw, phase) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const tilt = new THREE.Group();
  tilt.rotation.x = -0.4;
  g.add(tilt);
  tilt.add(new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.35, 0.75), new THREE.MeshStandardMaterial({ color: 0xdedede })));
  const lens = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020, toneMapped: false }));
  lens.position.z = -0.4;
  tilt.add(lens);
  const range = 13;
  const cg = new THREE.ConeGeometry(range * Math.tan(0.4), range, 20, 1, true);
  cg.translate(0, -range / 2, 0);
  cg.rotateX(Math.PI / 2);
  const cone = new THREE.Mesh(cg, makeGlowMaterial(0xff2a2a, 0.08));
  tilt.add(cone);
  group.add(g);
  return { g, x, z, base: yaw, yaw, phase, range, cone, lens };
}

/** Casino carpet: dark red with a gold diamond pattern. */
function carpetTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#3a0c1a';
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(214,168,74,0.55)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(32, 4); g.lineTo(60, 32); g.lineTo(32, 60); g.lineTo(4, 32); g.closePath();
  g.stroke();
  g.fillStyle = 'rgba(57,230,255,0.35)';
  g.fillRect(30, 30, 4, 4);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

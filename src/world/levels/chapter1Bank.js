import * as THREE from 'three';
import { CollisionWorld } from '../../core/collision.js';
import { makeTextTexture, makeGlowMaterial } from '../materials.js';

// ======================================================================
//  Chapter 1, Part 1: the heist, inside the Harbor Trust bank.
//
//  One floor, 40 x 40 m, seen from above (north = -Z):
//
//     z=-20 ┌──────────────────────────┬───────────────────┐
//           │ ROOF STAIRS (-17,-19)    │  VAULT            │
//           │                          │  4 cash pallets   │
//           │        LOBBY             ├──────┤door├───────┤ z=-8
//           │  pillars, counter        │ corridor     cam1 │
//           │                          ├───────┐     HALL  │ z=-2
//           │                          │OFFICE │door       │
//           │                          │ note  │           │
//           │                          ├───────┤           │ z=10
//           │                          │SECURITY door      │
//           │                          │ panel │           │
//     z=20  └──────────────────────────┴───────┴──┤back├───┘
//          x=-20                      x=2     x=10  door  x=20
//
//  You come in through the back door (bottom right). Order of play:
//  cameras off (security room) -> vault code (office) -> open the vault
//  -> grab the cash -> the alarm goes off -> run to the roof stairs.
// ======================================================================

export const WALL_H = 4.6;

export function buildChapter1Bank() {
  const group = new THREE.Group();
  const world = new CollisionWorld(8);
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...extra });
  const M = {
    wall: mat(0xd8cbb0),
    trim: mat(0x6a5334, { roughness: 0.5 }),
    vault: mat(0x5e636b, { metalness: 0.4, roughness: 0.5 }),
    steel: mat(0x9aa0aa, { metalness: 0.8, roughness: 0.3 }),
    wood: mat(0x5a3a22, { roughness: 0.6 }),
    dark: mat(0x22252c),
    cash: mat(0x3f8a4a, { emissive: 0x14381a, emissiveIntensity: 0.6 }),
    pillar: mat(0xe8dcc4, { roughness: 0.45 }),
    ceiling: mat(0x1d1e22),
  };

  /** A box that is both drawn and solid. y = bottom. */
  const block = (x, y, z, w, h, d, material, solid = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y + h / 2, z);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    if (solid) world.addBlock(x, y, z, w, h, d, { tag: 'wall' });
    return m;
  };
  /** A wall from (x1,z1) to (x2,z2) (axis aligned). */
  const wall = (x1, z1, x2, z2, material = M.wall) => {
    const w = Math.max(0.4, Math.abs(x2 - x1)), d = Math.max(0.4, Math.abs(z2 - z1));
    const m = block((x1 + x2) / 2, 0, (z1 + z2) / 2, w, WALL_H, d, material);
    // Dark skirting board along the bottom
    const sk = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, 0.22, d + 0.04), M.trim);
    sk.position.set((x1 + x2) / 2, 0.11, (z1 + z2) / 2);
    group.add(sk);
    return m;
  };

  // ------------------------------------------------------------------ floor & ceiling
  const floorTex = marbleTexture();
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(10, 10);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.3, metalness: 0.05 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);
  world.addBox(-21, -1, -21, 21, 0, 21, { tag: 'floor' });
  const ceil = new THREE.Mesh(new THREE.BoxGeometry(41, 0.3, 41), M.ceiling);
  ceil.position.y = WALL_H + 0.15;
  ceil.castShadow = true; // keeps the moonlight out
  group.add(ceil);
  world.addBox(-21, WALL_H, -21, 21, WALL_H + 1, 21, { tag: 'ceiling' });
  // Vault floor: bare steel plate
  const vf = new THREE.Mesh(new THREE.PlaneGeometry(18, 12), M.vault);
  vf.rotation.x = -Math.PI / 2;
  vf.position.set(11, 0.01, -14);
  vf.receiveShadow = true;
  group.add(vf);

  // ------------------------------------------------------------------ walls
  wall(-20, -20, 20, -20);              // north
  wall(-20, 20, 10, 20);                // south, west of the back door
  wall(14, 20, 20, 20);                 // south, east of the back door
  wall(-20, -20, -20, 20);              // west
  wall(20, -20, 20, 20);                // east
  world.addBox(10, 0, 20.2, 14, WALL_H, 21, { tag: 'wall' }); // (the night outside)
  const outside = new THREE.Mesh(new THREE.PlaneGeometry(4, WALL_H), new THREE.MeshBasicMaterial({ color: 0x0a1020 }));
  outside.position.set(12, WALL_H / 2, 20.6);
  outside.rotation.y = Math.PI;
  group.add(outside);
  const backDoor = block(14.6, 0, 18.6, 0.12, 3.3, 3.4, M.dark, false); // hanging open
  backDoor.rotation.y = 1.2;

  wall(10, 15, 10, 20);                 // hall west wall, with doors into the
  wall(10, 4, 10, 13);                  // security room (z 13-15) and
  wall(10, -2, 10, 2);                  // the office (z 2-4)
  wall(2, -2, 2, 20);                   // rooms' west wall
  wall(2, 10, 10, 10);                  // between security room and office
  wall(2, -2, 10, -2);                  // office north wall
  wall(2, -8, 13, -8, M.vault);         // vault front, west of the door
  wall(17, -8, 20, -8, M.vault);        // vault front, east of the door
  wall(2, -20, 2, -8, M.vault);         // vault west wall

  // Door frames (dark trim) for the two side rooms
  for (const z of [14, 3]) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 2.2), M.trim);
    f.position.set(10, 3.4, z);
    group.add(f);
  }

  // ------------------------------------------------------------------ the vault door
  const doorPivot = new THREE.Group();
  doorPivot.position.set(13, 0, -8);
  group.add(doorPivot);
  const vd = new THREE.Mesh(new THREE.CylinderGeometry(2.05, 2.05, 0.7, 40), M.steel);
  vd.rotation.x = Math.PI / 2;
  vd.position.set(2, 2.2, 0);
  vd.castShadow = true;
  doorPivot.add(vd);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.1, 8, 28), mat(0xc9ccd2, { metalness: 0.9, roughness: 0.2 }));
  wheel.position.set(2, 2.2, 0.42);
  doorPivot.add(wheel);
  for (let i = 0; i < 3; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.08), wheel.material);
    spoke.position.set(2, 2.2, 0.42);
    spoke.rotation.z = (i * Math.PI) / 3;
    doorPivot.add(spoke);
  }
  const vaultDoorBox = world.addBox(13, 0, -8.35, 17, WALL_H, -7.65, { tag: 'wall' });
  // Heavy steel frame around the opening
  block(12.8, 0, -8, 0.4, WALL_H, 0.9, M.steel, false);
  block(17.2, 0, -8, 0.4, WALL_H, 0.9, M.steel, false);
  const keypad = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.1),
    new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xff3030, emissiveIntensity: 1.2 }));
  keypad.position.set(18.2, 1.6, -7.7);
  group.add(keypad);

  // ------------------------------------------------------------------ cash pallets (in the vault)
  const cashPiles = [[5, -17], [9, -17], [14, -18], [18.5, -14]].map(([x, z]) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const pal = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.3, 1.3), M.wood);
    pal.position.y = 0.15;
    g.add(pal);
    const bundles = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.28, 0.34), M.cash, 12);
    const m = new THREE.Matrix4();
    for (let k = 0; k < 12; k++) {
      m.makeTranslation(-0.55 + (k % 3) * 0.55, 0.44 + Math.floor(k / 6) * 0.29, -0.3 + (Math.floor(k / 3) % 2) * 0.55);
      bundles.setMatrixAt(k, m);
    }
    bundles.castShadow = true;
    g.add(bundles);
    group.add(g);
    return { group: g, pos: new THREE.Vector3(x, 0, z) };
  });
  // Deposit boxes along the vault walls
  for (let i = 0; i < 6; i++) block(3 + i * 2.6, 0, -19.5, 2.4, 3.2, 0.6, M.steel);

  // ------------------------------------------------------------------ security room
  block(6, 0, 18.6, 4, 1, 1.2, M.wood);
  for (let k = 0; k < 3; k++) {
    const mon = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.55, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x2a6cff, emissiveIntensity: 1.1 }));
    mon.position.set(5.1 + k * 0.9, 1.45, 18.3);
    group.add(mon);
  }
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1, 1.4),
    new THREE.MeshStandardMaterial({ color: 0x2b2f38, emissive: 0xff3030, emissiveIntensity: 1 }));
  panel.position.set(2.3, 1.6, 14);
  group.add(panel);

  // ------------------------------------------------------------------ manager's office
  block(6, 0, 3, 3, 1, 1.4, M.wood);
  block(6, 0, 1.4, 0.9, 0.5, 0.9, M.dark); // chair
  block(3, 0, 8.6, 1.6, 2, 0.6, M.wood);   // filing cabinet
  const note = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.35), new THREE.MeshBasicMaterial({ color: 0xfff2b0 }));
  note.rotation.x = -Math.PI / 2;
  note.position.set(6, 1.02, 3);
  group.add(note);

  // ------------------------------------------------------------------ lobby
  block(-9, 0, 6, 12, 1.2, 1.1, M.wood);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(12, 0.9, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x9fc4d9, transparent: true, opacity: 0.25, roughness: 0.05 }));
  glass.position.set(-9, 1.65, 6);
  group.add(glass);
  for (const [x, z] of [[-14, -10], [-6, -10], [-14, 14], [-6, 14]]) block(x, 0, z, 1.1, WALL_H, 1.1, M.pillar);
  for (const [x, z] of [[-18, 17], [-3, 17], [-18, -4]]) { // potted plants
    block(x, 0, z, 0.8, 0.7, 0.8, M.dark);
    const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 0), mat(0x2f6a3a));
    leaves.position.set(x, 1.3, z);
    group.add(leaves);
  }
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.4), new THREE.MeshBasicMaterial({
    map: makeTextTexture('HARBOR TRUST', { color: '#ffd27a', bg: '#0c1220', width: 1024, height: 160, font: 'bold 110px "Bebas Neue", Impact, sans-serif' }), transparent: true, toneMapped: false }));
  logo.position.set(-19.78, 3, 0);
  logo.rotation.y = Math.PI / 2;
  group.add(logo);

  // Roof stairs door (north-west corner)
  block(-17, 0, -19.75, 2.2, 3.2, 0.12, mat(0x7a2a24), false);
  const roofSign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), new THREE.MeshBasicMaterial({
    map: makeTextTexture('ROOF', { color: '#ffffff', bg: '#1b7a3a', width: 256, height: 80, font: 'bold 56px "Bebas Neue", Impact, sans-serif', glow: false }), toneMapped: false }));
  roofSign.position.set(-17, 3.6, -19.7);
  group.add(roofSign);

  // ------------------------------------------------------------------ lights
  // Warm ceiling lights (a handful of real lights, the rest are just glowing panels)
  const fixMat = new THREE.MeshBasicMaterial({ color: 0xfff1d0, toneMapped: false });
  const lights = [];
  for (const [x, z, real] of [[-10, 0, true], [15, 10, true], [6, 6, false], [15, -14, true], [6, 15, false], [-10, -14, true], [-10, 14, false], [15, 0, false]]) {
    const fix = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.5), fixMat);
    fix.position.set(x, WALL_H - 0.05, z);
    group.add(fix);
    if (real) {
      const l = new THREE.PointLight(0xffd9a0, 26, 22, 1.6);
      l.position.set(x, WALL_H - 0.4, z);
      group.add(l);
      lights.push(l);
    }
  }
  group.add(new THREE.AmbientLight(0xffe2b8, 0.35));
  const alarmLight = new THREE.PointLight(0xff2020, 0, 60, 1.2);
  alarmLight.position.set(4, 4, -4);
  group.add(alarmLight);
  const alarmBoxes = [[19.6, 0], [-19.6, -6], [2.3, -12], [12, 19.6], [-19.6, 12]].map(([x, z]) => {
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshBasicMaterial({ color: 0x551010, toneMapped: false }));
    a.position.set(x, 4, z);
    group.add(a);
    return a;
  });

  // ------------------------------------------------------------------ security cameras
  const cams = [
    secCam(group, 15, 4, -7.45, Math.PI, 0),   // hall: watches the corridor to the office
    secCam(group, -10, 4, -19.5, Math.PI, 2),  // lobby
    secCam(group, 19.5, 4, 8, Math.PI / 2, 1), // hall, east wall
  ];

  // Spots you stand on to do things (a glowing ring on the floor)
  const spots = {
    cameras: new THREE.Vector3(3.3, 0, 14),
    note: new THREE.Vector3(6, 0, 4.2),
    keypad: new THREE.Vector3(18.2, 0, -6.7),
    roof: new THREE.Vector3(-17, 0, -18.4),
  };

  const spawn = new THREE.Vector3(12, 0.05, 17);
  return {
    group, world, spawn,
    checkpoints: [{ name: 'Back door', spawn, yaw: 0, roof: { minX: 0, maxX: 0, minZ: 0, maxZ: 0, h: -99 } }],
    buildings: [], ladders: [], hideSpots: [],
    cams, cashPiles, spots, panel, note, keypad, doorPivot, vaultDoorBox, alarmLight, alarmBoxes, lights,
  };
}

/** A ceiling camera that sweeps side to side, with a red view cone. */
function secCam(group, x, y, z, yaw, phase) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const tilt = new THREE.Group();
  tilt.rotation.x = -0.32;
  g.add(tilt);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.35, 0.75), new THREE.MeshStandardMaterial({ color: 0xdedede }));
  tilt.add(body);
  const lens = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020, toneMapped: false }));
  lens.position.z = -0.4;
  tilt.add(lens);
  const range = 11;
  const cg = new THREE.ConeGeometry(range * Math.tan(0.4), range, 20, 1, true);
  cg.translate(0, -range / 2, 0);
  cg.rotateX(Math.PI / 2);
  const cone = new THREE.Mesh(cg, makeGlowMaterial(0xff2a2a, 0.1));
  tilt.add(cone);
  group.add(g);
  return { g, x, z, base: yaw, yaw, phase, range, cone, lens };
}

/** A pale marble floor tile (one tile with a darker grout line). */
function marbleTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#d8d0c0';
  g.fillRect(0, 0, 128, 128);
  // soft veins
  g.strokeStyle = 'rgba(150,140,125,0.35)';
  g.lineWidth = 1.2;
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    let x = Math.random() * 128, y = 0;
    g.moveTo(x, y);
    while (y < 128) { x += (Math.random() - 0.5) * 24; y += 10 + Math.random() * 16; g.lineTo(x, y); }
    g.stroke();
  }
  g.fillStyle = 'rgba(80,70,60,0.5)';
  g.fillRect(0, 0, 128, 2);
  g.fillRect(0, 0, 2, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

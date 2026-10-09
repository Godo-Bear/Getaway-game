import * as THREE from 'three';
import { CollisionWorld } from '../../core/collision.js';
import { makeGlowMaterial, makeTextTexture } from '../materials.js';
import { buildCacti } from '../desert.js';
import { makeRng } from '../../core/utils.js';

// ======================================================================
//  Chapter 22, Part 3: Dry Gulch, the old silver town where the Jackals
//  live, in a sandstorm.
//
//  One main street running north-south (x -9..9), from the town gate (the
//  north end, z = 58: where you come in) to the railway station at the
//  south end (the track runs east-west at z = -113). Wooden false-front
//  buildings on both sides, with boardwalks and awnings; back alleys
//  behind them; the canyon walls beyond.
//
//   - The BANK (east side, brick): in through the front door (or the back
//     door from the east alley), past the teller counter, and the old round
//     vault door in the north-east corner. Hold E to open it; the Star is
//     on a shelf inside.
//   - The street is full of things to hide behind: wagons, barrels,
//     troughs, crates, hay bales, an old truck.
//   - The station at the far end, and the handcar on the track: the goal.
// ======================================================================

export const TRACK_Z = -113.5;
export const HANDCAR = new THREE.Vector3(4, 0, TRACK_Z);
export const BANK = { x0: 11.5, x1: 24, z0: -6, z1: 14 };
export const VAULT_DOOR = new THREE.Vector3(21.5, 0, 8);       // (in the vault room's south wall)
export const STAR_SPOT = new THREE.Vector3(21.5, 1.15, 13.1);
export const START = new THREE.Vector3(0, 0.05, 60);
export const WIND = new THREE.Vector3(-1, 0, 0.35).normalize(); // the storm blows from the east

// The Jackals' rounds
export const GULCH_ROUTES = [
  [[0, 44], [0, 20]],                                  // the north end of the street
  [[-2, 14], [5, 14], [5, -22], [-2, -22]],            // the middle of the street
  [[7.5, 6], [7.5, -1]],                               // outside the bank
  [[14, 10.5], [14, -3.5]],                            // inside the bank, in front of the counter
  [[-29, 40], [-29, -52]],                             // the west back alley
  [[31.5, 34], [31.5, -44]],                           // the east back alley
  [[-5, -58], [5, -58], [5, -88], [-5, -88]],          // the south end
  [[-24, -108.3], [8, -108.3]],                        // the station platform
];

const PLANK_COLS = [0x8a6a4a, 0x9a7a58, 0x7a5a3a, 0xa08060, 0x8a8478, 0x6a5040, 0x9a8a70];

/** Weathered planks (vertical), with a few dark gaps. */
function plankTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 128);
  const rng = makeRng(31);
  for (let x = 0; x < 128; x += 16) {
    g.fillStyle = `rgba(0,0,0,${0.04 + rng() * 0.1})`;
    g.fillRect(x, 0, 16, 128);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(x, 0, 1.5, 128);
    for (let k = 0; k < 3; k++) { g.fillStyle = 'rgba(40,20,0,0.25)'; g.fillRect(x + 4 + rng() * 8, rng() * 128, 2, 2); } // (nail heads, knots)
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Red brick (the bank). */
function brickTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#d8c8b0';
  g.fillRect(0, 0, 128, 128);
  const rng = makeRng(5);
  for (let y = 0, r = 0; y < 128; y += 8, r++) {
    for (let x = (r % 2) * -8; x < 128; x += 16) {
      const k = 0.75 + rng() * 0.25;
      g.fillStyle = `rgb(${Math.round(168 * k)},${Math.round(84 * k)},${Math.round(58 * k)})`;
      g.fillRect(x + 1, y + 1, 14, 6);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The dirt street: wheel ruts and hoof prints. */
function dirtTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 256);
  const rng = makeRng(9);
  for (let i = 0; i < 2200; i++) {
    g.fillStyle = `rgba(${rng() < 0.5 ? '90,60,30' : '255,245,225'},${0.05 + rng() * 0.1})`;
    g.fillRect(rng() * 256, rng() * 256, 2 + rng() * 3, 2 + rng() * 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildChapter22Gulch() {
  const group = new THREE.Group();
  const world = new CollisionWorld(8);
  const rng = makeRng(2203);
  const lam = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
  const planks = plankTexture(), bricks = brickTexture();
  const box = (x0, y0, z0, x1, y1, z1, material, solid = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), material);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    group.add(m);
    if (solid) world.addBox(x0, y0, z0, x1, y1, z1, { tag: 'wall' });
    return m;
  };
  const wood = PLANK_COLS.map((c) => { const t = planks.clone(); t.needsUpdate = true; t.repeat.set(2, 2); return lam(c, { map: t }); });
  const dark = lam(0x1e1a16), boardMat = lam(0x6a5038), glassDark = lam(0x2a2a30);

  // ---------------------------------------------------------------- the ground, the canyon
  const dirt = dirtTexture();
  dirt.repeat.set(14, 40);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 280), lam(0xc0986a, { map: dirt }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, -20);
  group.add(ground);
  world.addBox(-60, -2, -160, 60, 0, 90, { tag: 'floor' });
  const rock = [lam(0xa85a34, { flatShading: true }), lam(0xb8683e, { flatShading: true }), lam(0x9a5030, { flatShading: true })];
  for (const s of [-1, 1]) {
    for (let z = 85; z > -150; z -= 16) {
      const h = 22 + rng() * 16, x0 = s * (40 + rng() * 4);
      box(Math.min(x0, s * 60), 0, z - 8.5, Math.max(x0, s * 60), h, z + 8.5, rock[Math.floor(rng() * 3)]);
    }
  }
  box(-60, 0, 86, 60, 26, 100, rock[0]);     // the cliff behind the gate (the road bends away)
  box(-60, 0, -152, 60, 30, -130, rock[1]);  // the cliff beyond the railway

  // ---------------------------------------------------------------- the false-front buildings
  /** A wooden building facing the street (side -1: west row, facade at x0 = -11.5; side 1: east row). */
  const building = (side, z0, z1, h, sign, signColor, opts = {}) => {
    const face = side < 0 ? -11.5 : 11.5, back = side < 0 ? -23 : 23;
    const x0 = Math.min(face, back), x1 = Math.max(face, back);
    const mat = wood[Math.floor(rng() * wood.length)];
    box(x0, 0, z0, x1, h, z1, mat);
    // the tall false front, with the sign on it
    const ff = h + 2.6;
    const fx = face - side * 0.15;
    box(fx - 0.15, h, z0, fx + 0.15, ff, z1, mat, false);
    const signM = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(z1 - z0 - 1.5, sign.length * 1.1 + 2), 1.5),
      new THREE.MeshBasicMaterial({ map: makeTextTexture(sign, { color: signColor, bg: '#3a2a1c', width: 512, height: 96 }) }));
    signM.position.set(face - side * 0.32, h + 1.2, (z0 + z1) / 2);
    signM.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    group.add(signM);
    // windows and a door on the facade (dark, some boarded up)
    const fz = face - side * 0.06;
    const n = Math.max(2, Math.floor((z1 - z0) / 4.5));
    for (let k = 0; k < n; k++) {
      const z = z0 + (k + 0.5) * (z1 - z0) / n;
      const door = k === Math.floor(n / 2);
      box(fz - 0.06, door ? 0 : 1.1, z - (door ? 0.8 : 0.7), fz + 0.06, door ? 2.4 : 2.4, z + (door ? 0.8 : 0.7), door ? dark : glassDark, false);
      if (!door && rng() < 0.5) for (const y of [1.45, 2.0]) box(fz - side * 0.05 - 0.04, y, z - 0.85, fz - side * 0.05 + 0.04, y + 0.2, z + 0.85, boardMat, false);
      if (h > 6.5) box(fz - 0.06, 4.3, z - 0.6, fz + 0.06, 5.8, z + 0.6, glassDark, false); // (upstairs)
    }
    // the boardwalk and its awning on posts
    const bx0 = side < 0 ? -11.5 : 9, bx1 = side < 0 ? -9 : 11.5;
    box(bx0, 0, z0, bx1, 0.32, z1, boardMat);
    if (opts.balcony) {
      box(bx0, 3.3, z0, bx1, 3.5, z1, boardMat, false);
      box(side < 0 ? -9.15 : 9.05, 3.5, z0, side < 0 ? -9.05 : 9.15, 4.4, z1, boardMat, false); // (the rail)
    } else {
      const aw = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.12, z1 - z0), mat);
      aw.position.set((bx0 + bx1) / 2, 3.1, (z0 + z1) / 2);
      aw.rotation.z = side * 0.12;
      group.add(aw);
    }
    for (let z = z0 + 0.3; z <= z1 - 0.2; z += Math.max(3, (z1 - z0 - 0.6) / Math.ceil((z1 - z0) / 4.5))) {
      const px = side < 0 ? -9.25 : 9.25;
      box(px - 0.1, 0, z - 0.1, px + 0.1, 3.4, z + 0.1, boardMat);
    }
  };
  // the west side, north to south
  building(-1, 32, 45, 5.5, 'GENERAL STORE', '#f0e0b0');
  building(-1, 12, 30, 8, 'SALOON', '#ffd070', { balcony: true });
  building(-1, -14, 6, 8.5, 'GRAND HOTEL', '#f0e0b0', { balcony: true });
  building(-1, -26, -16, 5, 'BARBER', '#e8c8c8');
  building(-1, -50, -32, 7, 'LIVERY STABLE', '#f0e0b0');
  building(-1, -78, -60, 6, 'ASSAY OFFICE', '#d8d0a0');
  // the east side
  building(1, 33, 45, 5.5, 'SHERIFF', '#f0e0b0');
  building(1, 20, 31, 6, 'DRY GOODS', '#f0e0b0');
  building(1, -18, -8, 5, 'UNDERTAKER', '#c8c8c8');
  building(1, -62, -46, 6, 'BLACKSMITH', '#f0e0b0');

  // ---------------------------------------------------------------- the bank: brick, with a vault
  const bt = bricks.clone(); bt.needsUpdate = true; bt.repeat.set(3, 2);
  const brick = lam(0xffffff, { map: bt });
  const W = 0.4, BH = 7, B = BANK;
  // the facade (street side, x0), with the front door (z 2..4.4)
  box(B.x0, 0, B.z0, B.x0 + W, BH, 2, brick);
  box(B.x0, 0, 4.4, B.x0 + W, BH, B.z1, brick);
  box(B.x0, 2.6, 2, B.x0 + W, BH, 4.4, brick);
  // the back wall (east alley), with the back door (z -3..-1.2)
  box(B.x1 - W, 0, B.z0, B.x1, BH, -3, brick);
  box(B.x1 - W, 0, -1.2, B.x1, BH, B.z1, brick);
  box(B.x1 - W, 2.4, -3, B.x1, BH, -1.2, brick);
  // the side walls and the roof
  box(B.x0, 0, B.z0 - W, B.x1, BH, B.z0, brick);
  box(B.x0, 0, B.z1, B.x1, BH, B.z1 + W, brick);
  box(B.x0, BH - 0.3, B.z0 - W, B.x1, BH, B.z1 + W, lam(0x5a4a3a));
  // the floor inside, and a lamp (the power's long gone: an oil lamp the Jackals left)
  box(B.x0 + W, 0, B.z0, B.x1 - W, 0.05, B.z1, lam(0x6a4a30), false);
  const lamp = new THREE.PointLight(0xffb060, 18, 14, 1.6);
  lamp.position.set(17, 3.2, 3);
  group.add(lamp);
  const lampGlow = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd090, toneMapped: false }));
  lampGlow.position.copy(lamp.position);
  group.add(lampGlow);
  // the teller counter (with a gap at the north end to walk through)
  box(16.2, 0, B.z0, 16.8, 1.15, 5.2, lam(0x5a3a22));
  box(16.2, 1.15, B.z0, 16.8, 2.6, 5.2, lam(0x3a3a3a, { transparent: true, opacity: 0.5 }), false); // (the bars over it)
  // the vault room in the north-east corner: brick walls, a round steel door
  box(19, 0, 8 - W, 20.4, BH, 8, brick);        // (the south wall, either side of the door)
  box(22.6, 0, 8 - W, B.x1 - W, BH, 8, brick);
  box(20.4, 2.4, 8 - W, 22.6, BH, 8, brick);
  box(19 - W, 0, 8 - W, 19, BH, B.z1, brick);    // (the west wall)
  const steel = new THREE.MeshStandardMaterial({ color: 0x8a8e96, metalness: 0.8, roughness: 0.35 });
  const vaultHinge = new THREE.Group();
  vaultHinge.position.set(20.4, 0, 8 - W / 2);
  const vaultDoor = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.35, 24), steel);
  vaultDoor.rotation.x = Math.PI / 2;
  vaultDoor.position.set(1.1, 1.2, -0.3);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.05, 6, 16), new THREE.MeshStandardMaterial({ color: 0xc8a040, metalness: 0.8, roughness: 0.3 }));
  wheel.position.set(1.1, 1.2, -0.52);
  vaultHinge.add(vaultDoor, wheel);
  group.add(vaultHinge);
  const vaultBox = world.addBox(20.4, 0, 7.2, 22.6, 2.4, 8, { tag: 'wall' });
  // the shelf inside, and the Star's case
  box(20, 0, 12.8, 23.2, 0.9, 13.5, lam(0x5a3a22));
  const caseM = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.32, 0.4), new THREE.MeshStandardMaterial({ color: 0xc8c8cc, metalness: 0.85, roughness: 0.3 }));
  caseM.position.copy(STAR_SPOT).setY(1.06);
  group.add(caseM);
  const starGlow = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), makeGlowMaterial(0x9ad8ff, 0.5));
  starGlow.position.copy(STAR_SPOT).setY(1.3);
  group.add(starGlow);
  // gold bars and money bags on the floor of the vault (twenty years of the Jackals' takings? no: that's in the mine)
  for (let i = 0; i < 4; i++) box(19.4 + i * 0.6, 0, 8.4, 19.9 + i * 0.6, 0.2, 8.8, new THREE.MeshStandardMaterial({ color: 0xd8b040, metalness: 0.9, roughness: 0.25 }), false);
  // the bank's sign
  const bs = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.6), new THREE.MeshBasicMaterial({ map: makeTextTexture('BANK', { color: '#ffd070', bg: '#2a1a14', width: 512, height: 96 }) }));
  bs.position.set(B.x0 - 0.05, 5.4, 4);
  bs.rotation.y = -Math.PI / 2;
  group.add(bs);
  box(9, 0, B.z0, 11.5, 0.32, B.z1, boardMat); // (the boardwalk)

  // ---------------------------------------------------------------- the church, the water tower
  box(-24, 0, -95, -12, 7, -81, wood[4]);
  const steeple = box(-20, 7, -90, -16, 15, -86, wood[4], false);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(2.2, 5, 4), lam(0x4a3a2a));
  spire.position.set(-18, 17.5, -88);
  spire.rotation.y = Math.PI / 4;
  group.add(spire, steeple);
  const tower = new THREE.Group();
  tower.position.set(17, 0, -36);
  for (const [x, z] of [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 8, 0.3), boardMat);
    leg.position.set(x, 4, z);
    tower.add(leg);
    world.addBox(17 + x - 0.2, 0, -36 + z - 0.2, 17 + x + 0.2, 8, -36 + z + 0.2, { tag: 'wall' });
  }
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.8, 4, 16), wood[2]);
  tank.position.y = 10;
  const tankRoof = new THREE.Mesh(new THREE.ConeGeometry(3.1, 1.6, 16), lam(0x5a4a3a));
  tankRoof.position.y = 12.8;
  tower.add(tank, tankRoof);
  group.add(tower);

  // ---------------------------------------------------------------- the station, the track, the handcar
  box(-30, 0, -110, 12, 0.5, -106.5, boardMat);              // the platform
  box(-26, 0, -106.5, -10, 5, -97, wood[1]);                 // the station building
  const ss = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.4), new THREE.MeshBasicMaterial({ map: makeTextTexture('DRY GULCH', { color: '#f0e0b0', bg: '#3a2a1c', width: 512, height: 96 }) }));
  ss.position.set(-18, 4, -106.55);
  ss.rotation.y = Math.PI;
  group.add(ss);
  const rail = lam(0x6a6a70);
  for (const dz of [-0.72, 0.72]) box(-70, 0, TRACK_Z + dz - 0.05, 70, 0.18, TRACK_Z + dz + 0.05, rail, false);
  const sleepers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.12, 2.3), lam(0x4a3626), 140);
  const o = new THREE.Object3D();
  for (let i = 0; i < 140; i++) { o.position.set(-70 + i, 0.06, TRACK_Z); o.updateMatrix(); sleepers.setMatrixAt(i, o.matrix); }
  group.add(sleepers);
  const handcar = buildHandcar();
  handcar.position.copy(HANDCAR);
  handcar.rotation.y = Math.PI / 2;
  group.add(handcar);
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.4, 3, 32), makeGlowMaterial(0x4dffa6, 0.75));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(HANDCAR.x, 0.08, HANDCAR.z);
  ring.visible = false;
  group.add(ring);

  // ---------------------------------------------------------------- the gate at the north end
  for (const x of [-10, 10]) box(x - 0.3, 0, 63.7, x + 0.3, 7, 64.3, boardMat);
  const gate = new THREE.Mesh(new THREE.PlaneGeometry(14, 1.6), new THREE.MeshBasicMaterial({ map: makeTextTexture('DRY GULCH', { color: '#f0e0b0', bg: '#3a2a1c', width: 512, height: 96 }), side: THREE.DoubleSide }));
  gate.position.set(0, 6.4, 64);
  group.add(gate);
  box(-12, 0, 70, 12, 3, 72, rock[2]); // (the road bends away behind you: rocks)

  // ---------------------------------------------------------------- things to hide behind
  const wagon = (x, z, r) => {
    const g = new THREE.Group();
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.9, 3.6), wood[0]);
    bed.position.y = 1.05;
    g.add(bed);
    for (const [wx, wz] of [[-1, 1.2], [1, 1.2], [-1, -1.2], [1, -1.2]]) {
      const w = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.06, 6, 14), boardMat);
      w.rotation.y = Math.PI / 2;
      w.position.set(wx, 0.6, wz);
      g.add(w);
    }
    if (r) { const cover = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 3.4, 12, 1, true, -Math.PI / 2, Math.PI), lam(0xe0d8c0, { side: THREE.DoubleSide })); cover.rotation.x = Math.PI / 2; cover.rotation.y = Math.PI / 2; cover.rotation.z = 0; cover.position.y = 1.5; cover.rotation.set(Math.PI / 2, 0, 0); g.add(cover); }
    g.position.set(x, 0, z);
    group.add(g);
    world.addBox(x - 1, 0, z - 1.85, x + 1, r ? 2.5 : 1.5, z + 1.85, { tag: 'wall' });
  };
  wagon(-5, 30, true); wagon(5.5, 22, false); wagon(-4, -6, true); wagon(4.5, -40, false); wagon(-5.5, -70, true); wagon(-25.6, 10, false); wagon(25.5, -18, true);
  const barrelGeo = new THREE.CylinderGeometry(0.42, 0.42, 1.1, 10), barrelMat = lam(0x6a4a2c);
  const crateMat = lam(0x9a7a4a), hayMat = lam(0xd8b860);
  const prop = (kind, x, z) => {
    if (kind === 'barrels') {
      for (const [dx, dz] of [[0, 0], [0.9, 0.1], [0.4, 0.8]]) { const b = new THREE.Mesh(barrelGeo, barrelMat); b.position.set(x + dx, 0.55, z + dz); group.add(b); }
      world.addBox(x - 0.45, 0, z - 0.45, x + 1.35, 1.1, z + 1.25, { tag: 'wall' });
    } else if (kind === 'crates') {
      box(x, 0, z, x + 1.2, 1.2, z + 1.2, crateMat); box(x + 1.2, 0, z + 0.1, x + 2.2, 1.0, z + 1.1, crateMat); box(x + 0.2, 1.2, z + 0.2, x + 1.1, 2.0, z + 1.1, crateMat);
    } else if (kind === 'trough') {
      box(x - 0.5, 0, z - 1.4, x + 0.5, 0.8, z + 1.4, wood[2]);
    } else if (kind === 'hay') {
      box(x - 0.8, 0, z - 0.6, x + 0.8, 1.1, z + 0.6, hayMat); box(x - 0.7, 1.1, z - 0.5, x + 0.7, 2.0, z + 0.5, hayMat);
    }
  };
  for (const [k, x, z] of [['barrels', -7.6, 40], ['trough', 7.6, 38], ['crates', 6, 10], ['barrels', -7.5, 4], ['hay', -6.5, -18], ['trough', 7.6, -24], ['crates', -7.8, -30],
    ['barrels', 6.5, -54], ['hay', -6, -48], ['crates', 5.5, -76], ['barrels', -7, -84], ['trough', 7.6, -92], ['crates', -2, -100], ['barrels', 8, -101],
    ['crates', -25.2, 30], ['barrels', -25.4, -12], ['hay', -32, -30], ['crates', 25, 18], ['barrels', 25, 6], ['crates', 25.5, -28], ['hay', 31, -52], ['barrels', 25, -6.8]]) prop(k, x, z);
  // an old truck, rusting in the middle of the street
  const truck = new THREE.Group();
  const tb = new THREE.Mesh(new THREE.BoxGeometry(2, 1.1, 4.6), lam(0x7a4a32));
  tb.position.y = 1.1;
  const tc = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.9, 1.6), lam(0x7a4a32));
  tc.position.set(0, 2.1, 0.8);
  truck.add(tb, tc);
  truck.position.set(1.5, 0, -32);
  truck.rotation.y = 0.3;
  group.add(truck);
  world.addBox(0.1, 0, -34.6, 2.9, 2.5, -29.4, { tag: 'wall' });
  // a few cacti round the edge of town
  const cacti = [];
  for (let i = 0; i < 26; i++) {
    const s = rng() < 0.5 ? -1 : 1, x = s * (31 + rng() * 7), z = 60 - rng() * 170;
    cacti.push([x, z, 0.5 + rng() * 0.4, rng() * 6]);
  }
  group.add(buildCacti(cacti));

  // ---------------------------------------------------------------- tumbleweeds (they roll in the wind)
  const tumbleGeo = new THREE.IcosahedronGeometry(0.6, 1);
  const tumbleMat = new THREE.MeshLambertMaterial({ color: 0x8a6a3a, wireframe: true });
  const tumbleweeds = [];
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(tumbleGeo, tumbleMat);
    m.position.set(-20 + rng() * 40, 0.6, 50 - rng() * 150);
    group.add(m);
    tumbleweeds.push({ m, v: 2 + rng() * 3, hop: rng() * 6 });
  }

  const spawn = START.clone();
  spawn.yaw = 0;
  return {
    group, world, spawn, ladders: [],
    vault: { hinge: vaultHinge, box: vaultBox, open: 0 }, caseM, starGlow, ring, lamp, tumbleweeds, handcar,
  };
}

/** The railway handcar: a flat wooden deck on four iron wheels, with the see-saw pump handle in the middle. */
export function buildHandcar() {
  const g = new THREE.Group();
  const deckMat = new THREE.MeshLambertMaterial({ color: 0x6a4a30 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x3a3a40, metalness: 0.6, roughness: 0.5 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.16, 2.8), deckMat);
  deck.position.y = 0.72;
  g.add(deck);
  const wheels = [];
  for (const [x, z] of [[-0.72, 0.95], [0.72, 0.95], [-0.72, -0.95], [0.72, -0.95]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.1, 14), iron);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.42, z);
    g.add(w);
    wheels.push(w);
  }
  // the A-frame and the see-saw handle
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.1, 0.1), iron);
    post.position.set(s * 0.3, 1.35, 0);
    g.add(post);
  }
  const pump = new THREE.Group();
  pump.position.set(0, 1.9, 0);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 2.3), iron);
  pump.add(beam);
  for (const z of [-1.1, 1.1]) {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.3, 6), iron);
    bar.rotation.z = Math.PI / 2;
    bar.position.z = z;
    pump.add(bar);
  }
  g.add(pump);
  g.userData.wheels = wheels;
  g.userData.pump = pump;
  return g;
}

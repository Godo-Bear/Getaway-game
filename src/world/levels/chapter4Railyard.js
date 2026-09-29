import * as THREE from 'three';
import { RooftopKit } from '../rooftopKit.js';
import { makeGlowMaterial, getGlowTexture } from '../materials.js';
import { makeCarMesh } from '../../vehicles/carModel.js';

// ======================================================================
//  Chapter 4, Part 2: the rail yard
//  A storm. Marla has ditched her car at the yard gate and is running across
//  the parked freight trains toward the hangars, where her plane is waiting.
//  Catch her before she reaches it.
//
//  Tracks run north (-Z). T1 x=0, T2 x=5, T3 x=10, T4 x=15.
//    Loading dock (6 m) -> T1 boxcars (4.4) -> across to T2 (tank car 3.8)  [CP 1 on T2]
//    T2 -> climb the signal gantry (6.8) -> walk east -> drop onto T4
//    T4 boxcars                                                            [CP 2]
//    T4 -> container stack (5.2) -> hangar 1 roof (7.6)                    [CP 3]
//    Hangar 1 -> ZIP LINE down to hangar 2 (5 m) -> Marla is cornered at the edge
//  Clues: map (dock), phone log (T3 hoppers, off the path), lawyer's card
//  (T4), car keys (hangar 1 roof).
// ======================================================================

const CAR = 14, GAP = 1.4, PITCH = CAR + GAP;
const RUST = [0x7a2e1e, 0x5a3a26, 0x2e4a6a, 0x3a5a3a, 0x6a5a3a, 0x7a4a2a];

export function buildChapter4Railyard() {
  const kit = new RooftopKit({ seed: 4404 });
  const rng = kit.rng;
  kit.street(-400, -400, 400, 400);

  // --- Tracks
  for (const x of [-20, 0, 5, 10, 15, 26]) kit.track(x, 20, -215);

  // --- Start: the loading dock
  const dock = kit.building(-13, -12, -4, 2, 6, { windows: false, tint: 0x6e6a62 });
  kit.hut(-11.5, 6, 0.3, 3);
  kit.ac(-7, 6, -9);

  // --- T1 (x=0): three boxcars, then the line is empty
  const t1 = [];
  for (let i = 0; i < 3; i++) t1.push(kit.boxcar(0, -4 - i * PITCH, -4 - i * PITCH - CAR, RUST[i % RUST.length]));

  // --- T2 (x=5): boxcar, tank car, boxcar, boxcar
  const t2z = (i) => -30 - i * PITCH;
  kit.boxcar(5, t2z(0), t2z(0) - CAR, RUST[3]);
  kit.tankCar(5, t2z(1), t2z(1) - CAR, 0x2a2e36);
  const t2cp = kit.boxcar(5, t2z(2), t2z(2) - CAR, RUST[1]);
  kit.boxcar(5, t2z(3), t2z(3) - CAR, RUST[5]);

  // --- T3 (x=10): open hopper cars (side route, a clue up there)
  for (let i = 0; i < 4; i++) kit.hopperCar(10, -2 - i * PITCH, -2 - i * PITCH - CAR, i % 2 ? 0x3a3028 : 0x4a3a2a);

  // --- Crossing plates: steel plates the yard crew lay between cars. Walk
  //     straight across instead of making a risky jump onto a narrow roof.
  const plate = (x0, x1, z0, z1, y) => {
    kit.solid(x0, y - 0.12, z0, x1, y, z1, { side: 'metal', top: 'metal', color: 0x8a8a90, uvScale: [1, 1] }, 'plate');
    kit.batch.addBox({ x: x0, y: y, z: z0 }, { x: x1, y: y + 0.02, z: z0 + 0.12 }, { side: 'glow', top: 'glow', color: 0x6a5010 });
    kit.batch.addBox({ x: x0, y: y, z: z1 - 0.12 }, { x: x1, y: y + 0.02, z: z1 }, { side: 'glow', top: 'glow', color: 0x6a5010 });
  };
  plate(1.4, 3.7, -47.6, -45.8, 4.4);   // T1 -> T2 tank car (Marla's way)
  plate(6.4, 8.6, -41.6, -40.2, 4.4);   // T2 -> T3 hoppers (the phone log)

  // --- Signal gantry across all four tracks
  kit.gantry(-3, 19, -66.75, 6.8, [[0, 0xff2020], [5, 0xff2020], [10, 0x20ff60], [15, 0xff2020]]);

  // --- T4 (x=15): three boxcars
  const t4z = (i) => -58 - i * PITCH;
  kit.boxcar(15, t4z(0), t4z(0) - CAR, RUST[2]);
  kit.boxcar(15, t4z(1), t4z(1) - CAR, RUST[4]);
  const t4cp = kit.boxcar(15, t4z(2), t4z(2) - CAR, RUST[0]);

  // --- Container stack and the hangars
  const s1top = kit.containerStack(8.8, -110.88, 21, -106, 2);
  const h1 = kit.building(8, -140, 34, -114, 7.6, { windows: false, tint: 0x7a7e86 });
  kit.skylight(26, 7.6, -122, 3, 2);
  kit.skylight(26, 7.6, -132, 3, 2);
  kit.ac(14, 7.6, -120);
  kit.waterTower(30, 7.6, -118);
  kit.hut(12, 7.6, -134, 3);
  kit.zipLine(21, 9.9, -137.2, 32, 7.2, -168, { startRoof: 7.6, endRoof: 5 });
  const h2 = kit.building(20, -185, 44, -160, 5, { windows: false, tint: 0x8a8e96 });
  kit.ac(38, 5, -165);
  kit.sign(h1, 1, 'HANGAR 1', '#ffd27a', 6.2);
  kit.sign(h2, 1, 'HANGAR 2', '#ffd27a', 3.4);

  // --- Parked trains on the far tracks (scenery, and more roofs to run on)
  for (let i = 0; i < 8; i++) kit.boxcar(-20, 10 - i * PITCH, 10 - i * PITCH - CAR, RUST[(i + 2) % RUST.length]);
  for (let i = 0; i < 5; i++) {
    const z = -8 - i * PITCH;
    if (i % 2) kit.tankCar(26, z, z - CAR, 0x3a2a2a); else kit.boxcar(26, z, z - CAR, RUST[i % RUST.length]);
  }

  // --- Floodlights, sheds, container stacks around the edge
  for (const [x, z] of [[-8, -40], [22, -30], [-8, -100], [22, -90], [48, -150], [-10, -160]]) kit.floodlight(x, z, 18);
  for (const [x0, z0, lv] of [[-40, -30, 3], [-40, -70, 2], [36, -60, 3], [36, -100, 2], [-40, -120, 3]]) {
    kit.containerStack(x0, z0 - 4.88, x0 + 12.2, z0, lv);
  }
  const shed = kit.building(-44, 0, -28, 14, 7, { windows: false, tint: 0x5a5650 });
  kit.sign(shed, 1, 'NORTH RAIL YARD', '#39e6ff', 5.2);
  for (let z = 20; z >= -200; z -= 26) kit.lamps.push([-10, z], [20, z]);

  // --- The city beyond the yard: a skyline of lit windows through the rain
  for (let gx = -150; gx <= 170; gx += 26) {
    for (let gz = 80; gz >= -300; gz -= 26) {
      if (gx > -75 && gx < 90 && gz < 60 && gz > -240) continue; // keep the yard open
      const w = rng.range(14, 20), d = rng.range(14, 20);
      const h = rng() < 0.3 ? rng.range(35, 70) : rng.range(12, 30);
      const b = kit.building(gx - w / 2, gz - d / 2, gx + w / 2, gz + d / 2, h, { lips: false });
      b.noLadder = true; // too far away to matter
      if (rng() < 0.1) kit.sign(b, rng.int(0, 3));
    }
  }

  const group = kit.finish();

  // --- The plane on the apron, engines running (nav lights blink in animate())
  const plane = buildPlane();
  plane.position.set(32, 0, -205);
  plane.rotation.y = Math.PI;
  group.add(plane);

  // --- Marla's car at the gate, police arriving
  const mcar = makeCarMesh({ kind: 'civilian', color: 0x1f6a4a });
  mcar.position.set(-16, 0.4, 8);
  mcar.rotation.y = 0.9;
  group.add(mcar);
  const policeCars = [];
  for (const [x, z, r] of [[-26, 24, 0.4], [-30, 16, -0.6]]) {
    const m = makeCarMesh({ kind: 'police' });
    m.position.set(x, 0.4, z);
    m.rotation.y = r;
    group.add(m);
    policeCars.push(m);
  }

  // --- A freight train rolling slowly through on the far track (scenery only)
  const freight = new THREE.Group();
  const loco = new THREE.Mesh(new THREE.BoxGeometry(3.2, 4.6, 18), new THREE.MeshLambertMaterial({ color: 0x2a3a5a }));
  loco.position.y = 2.6;
  freight.add(loco);
  const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0xfff2c0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  head.position.set(0, 3.8, -9.2);
  head.scale.setScalar(5);
  freight.add(head);
  const carMat = new THREE.MeshLambertMaterial({ color: 0x5a3a26 });
  for (let i = 1; i <= 7; i++) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(3, 4, 14), carMat);
    c.position.set(0, 2.4, i * 15.4);
    freight.add(c);
  }
  freight.position.set(-34, 0, 60);
  group.add(freight);

  const J = (x, y, z) => Object.assign(new THREE.Vector3(x, y, z), { jump: true });
  const Z = (x, y, z) => Object.assign(new THREE.Vector3(x, y, z), { zip: true });
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const fugitivePath = [
    V(0, 4.4, -9), V(0, 4.4, -17.4),
    J(0, 4.4, -20.4), V(0, 4.4, -32.8),
    J(0, 4.4, -35.8), V(0, 4.4, -45),
    V(2.6, 4.4, -46.7), V(5, 3.8, -47.5), V(5, 3.8, -58.6),
    J(5, 4.4, -61.6), V(5, 4.4, -64.6),
    J(5, 6.8, -66.75), V(15, 6.8, -66.75),
    J(15, 4.4, -69.5), V(15, 4.4, -71.6),
    J(15, 4.4, -74.4), V(15, 4.4, -87),
    J(15, 4.4, -89.8), V(15, 4.4, -102.2),
    J(15, s1top, -107), V(15, s1top, -110.4),
    J(15, 7.6, -115.2), V(21, 7.6, -128), V(21, 7.6, -136.8),
    Z(32, 5, -168), V(32, 5, -183.2),
  ];

  const checkpoints = [
    { name: 'Loading dock', roof: dock, spawn: new THREE.Vector3(-7, 6.05, -7), yaw: 0 },
    { name: 'Checkpoint 1', roof: t2cp, spawn: new THREE.Vector3(5, 4.45, -63), yaw: 0 },
    { name: 'Checkpoint 2', roof: t4cp, spawn: new THREE.Vector3(15, 4.45, -92), yaw: 0 },
    { name: 'Checkpoint 3', roof: h1, spawn: new THREE.Vector3(21, 7.65, -117.5), yaw: 0 },
  ];
  const clues = [
    { id: 'vinceMap', pos: new THREE.Vector3(-11.5, 6, -10), onPath: false },
    { id: 'cellCall', pos: new THREE.Vector3(10, 3.6, -40), onPath: false },
    { id: 'lawyerCard', pos: new THREE.Vector3(15, 4.4, -80), onPath: true },
    { id: 'dexKeys', pos: new THREE.Vector3(29, 7.6, -127), onPath: false },
  ];
  const guides = [[-6, 6, -10, -0.5], [0, 4.4, -40, 0], [5, 4.4, -63.5, 0], [15, 4.4, -95, 0], [18, 7.6, -124, 0]];

  let t = 0;
  return {
    group, world: kit.world, buildings: kit.buildings, hideSpots: kit.hideSpots, ladders: kit.ladders, zipLines: kit.zipLines,
    checkpoints, clues, guides, fugitivePath, policeCars,
    goalPos: new THREE.Vector3(32, 5, -183.2),
    heliStart: new THREE.Vector3(40, 0, 50),
    fallTitle: 'You fell',
    officerSpawns: [],
    /** Per-frame scenery animation: the freight train and the plane's lights. */
    animate(dt) {
      t += dt;
      freight.position.z -= dt * 6;
      if (freight.position.z < -330) freight.position.z = 120;
      plane.userData.blink(t);
    },
  };
}

/** A small private jet: white fuselage, swept wings, blinking nav lights. */
function buildPlane() {
  const g = new THREE.Group();
  const white = new THREE.MeshLambertMaterial({ color: 0xe8e8ec });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.1, 16, 16), white);
  body.rotation.x = Math.PI / 2;
  body.position.y = 2.2;
  const nose = new THREE.Mesh(new THREE.SphereGeometry(1.3, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), white);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 2.2, 8);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(17, 0.25, 3.2), white);
  wing.position.set(0, 1.7, 0.5);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.6, 2.4), white);
  tail.position.set(0, 4.2, -7);
  const stab = new THREE.Mesh(new THREE.BoxGeometry(6, 0.2, 1.6), white);
  stab.position.set(0, 5.8, -7.4);
  const windows = new THREE.Mesh(new THREE.BoxGeometry(2.66, 0.35, 9), new THREE.MeshBasicMaterial({ color: 0xffd890, toneMapped: false }));
  windows.position.set(0, 2.6, 1);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.64, 0.2, 15), new THREE.MeshLambertMaterial({ color: 0x1f6a4a }));
  stripe.position.set(0, 1.8, 0);
  g.add(body, nose, wing, tail, stab, windows, stripe);
  for (const [x, z] of [[-1.6, -4], [1.6, -4]]) {
    const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 2.6, 12), new THREE.MeshLambertMaterial({ color: 0x9a9aa2 }));
    eng.rotation.x = Math.PI / 2;
    eng.position.set(x, 3.1, z);
    g.add(eng);
  }
  const lamp = (color, x, y, z, s = 2.2) => {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    m.position.set(x, y, z);
    m.scale.setScalar(s);
    g.add(m);
    return m;
  };
  const left = lamp(0xff2030, -8.5, 1.8, 0.5), right = lamp(0x20ff60, 8.5, 1.8, 0.5), beacon = lamp(0xff3030, 0, 6.1, -7.6, 3);
  // Landing light shining forward onto the wet tarmac
  const pool = new THREE.Mesh(new THREE.CircleGeometry(6, 24), makeGlowMaterial(0xfff0d0, 0.25));
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0, 0.05, 14);
  g.add(pool);
  g.userData.blink = (t) => {
    const on = Math.floor(t * 1.5) % 2 === 0;
    beacon.visible = on;
    left.material.opacity = right.material.opacity = 0.6 + Math.sin(t * 6) * 0.3;
  };
  return g;
}

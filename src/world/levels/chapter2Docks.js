import * as THREE from 'three';
import { RooftopKit } from '../rooftopKit.js';
import { makeGlowMaterial, makeTextTexture } from '../materials.js';
import { makeCarMesh } from '../../vehicles/carModel.js';

// ======================================================================
//  Chapter 2, Part 2: the docks
//  Vince has ditched his car at the container terminal and is running for
//  the ferry pier. Chase him across warehouse roofs and container stacks.
//  Dropping to the quay = the ground units see you (back to a checkpoint).
//
//  Route runs NORTH (-Z), then north-east down a zip line:
//    W1 warehouse (12 m) -> S1 containers (13) -> S2 (10.4)          [CP 1]
//    S2 -> S3: 9 m gap. WALL-RUN along the mural wall on the left,
//              or walk the narrow plank on the right.
//    S3 -> W2 warehouse (10.4): SLIDE under the ventilation duct   [CP 2]
//    W2: crate -> upper level -> ZIP LINE down to W3 on the pier     [CP 3]
//    W3 -> W4 ticket office (6): Vince is cornered there.
//  Clues: note (W1 corner), IOU (S2), photo (side stack), badge (W3).
// ======================================================================

export function buildChapter2Docks() {
  const kit = new RooftopKit({ seed: 2202 });
  const rng = kit.rng;

  // Ground: quay (land) and the harbour beyond the pier
  kit.quay(-120, -137, 140, 60);
  kit.quay(22, -165, 40, -137);
  kit.water(-400, -400, 400, -137);

  const warehouse = { windows: false, tint: 0x7a7064 };
  const w1 = kit.building(-10, -20, 10, 0, 12, warehouse);
  const s1top = kit.containerStack(-6.1, -30.32, 6.1, -23, 5);
  const s1 = kit.buildings[kit.buildings.length - 1];
  const s2top = kit.containerStack(-6.1, -40.06, 6.1, -32.74, 4);
  const s2 = kit.buildings[kit.buildings.length - 1];
  kit.containerStack(-6.1, -56.4, 6.1, -49.08, 4);
  const s3 = kit.buildings[kit.buildings.length - 1];
  // Side stack east of S2 (the photo clue is up there)
  kit.containerStack(7.9, -40.06, 20.1, -35.18, 4);
  const w2 = kit.building(-12, -85, 12, -59, 10.4, warehouse);
  const w3 = kit.building(22, -135, 40, -114, 8, warehouse);
  const w4 = kit.building(26, -150, 36, -140, 6, { windows: false, tint: 0x9a8a6a });

  // W1: a few props
  kit.ac(-5, 12, -8);
  kit.skylight(5, 12, -12);
  kit.hut(-6, 12, -16, 1);

  // S2 -> S3: the wall-run wall (left) and the plank (right)
  kit.muralWall('z', -38.4, -51, -6.45, 0, 17, '>>> HARBOR LINES >>>', '#39e6ff');
  kit.beam('z', -39.6, -49.5, 5, 10.4, 0.6, 'plank');

  // W2: the duct you have to slide under, then the crate + upper level
  kit.duct(-12, -66.6, 12, -65.4, 10.4);
  kit.setback(0, 10.4, -80, 8, 8, 3.2, 0x7a7064);   // top 13.6, z -84..-76
  kit.crate(0, 10.4, -74.9);
  kit.ac(-8, 10.4, -72);
  kit.ac(8, 10.4, -78, true);

  // The zip line from the upper level down to the pier warehouse
  kit.zipLine(0, 15.9, -82.5, 29, 10.2, -118, { startRoof: 13.6, endRoof: 8 });

  // W3 and the ticket office
  kit.ac(36, 8, -120);
  kit.hut(25, 8, -128, 3);
  kit.sign(w4, 1, 'FERRY TICKETS', '#ffd27a', 4.2);
  kit.sign(w1, 1, 'PIER 9', '#39e6ff', 9);

  // Cranes (decoration) and filler container stacks
  kit.craneMast(20, -52, 36, -1, 26);
  kit.craneMast(-24, -100, 30, 1, 22);
  const keepout = [
    { x0: -14, x1: 24, z0: -90, z1: 4 },
    { x0: -4, x1: 44, z0: -140, z1: -80 },
  ];
  for (let gx = -70; gx <= 80; gx += 16) {
    for (let gz = 20; gz >= -130; gz -= 12) {
      const x = gx + rng.range(-2, 2), z = gz + rng.range(-2, 2);
      const r = { x0: x - 6.1, x1: x + 6.1, z0: z - 3.66, z1: z + 3.66 };
      if (keepout.some((k) => r.x0 < k.x1 && r.x1 > k.x0 && r.z0 < k.z1 && r.z1 > k.z0)) continue;
      if (rng() < 0.35) continue;
      kit.containerStack(r.x0, r.z0, r.x1, r.z1, rng.int(1, 4));
    }
  }
  for (let x = -60; x <= 60; x += 18) kit.lamps.push([x, 8], [x, -95]);

  const group = kit.finish();

  // The ferry, lit up at the end of the pier
  const ferry = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(14, 5, 40), new THREE.MeshLambertMaterial({ color: 0xe8e4dc }));
  hull.position.y = 1;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(12, 4, 26), new THREE.MeshLambertMaterial({ color: 0x2a3a5a }));
  deck.position.set(0, 5.5, -2);
  const windows = new THREE.Mesh(new THREE.BoxGeometry(12.1, 1.2, 24), new THREE.MeshBasicMaterial({ color: 0xffe0a0, toneMapped: false }));
  windows.position.set(0, 5.8, -2);
  ferry.add(hull, deck, windows);
  ferry.position.set(52, 0, -170);
  group.add(ferry);
  // Vince's abandoned car at the start
  const vcar = makeCarMesh({ kind: 'civilian', color: 0x5a3a22 });
  vcar.position.set(-14, 0.4, -6);
  vcar.rotation.y = 0.6;
  group.add(vcar);
  const policeCars = [];
  for (const [x, z, r] of [[-22, 6, 0.3], [-18, 14, -0.8]]) {
    const m = makeCarMesh({ kind: 'police' });
    m.position.set(x, 0.4, z);
    m.rotation.y = r;
    group.add(m);
    policeCars.push(m);
  }

  const J = (x, y, z) => Object.assign(new THREE.Vector3(x, y, z), { jump: true });
  const Z = (x, y, z) => Object.assign(new THREE.Vector3(x, y, z), { zip: true });
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const fugitivePath = [
    V(0, 12, -9), V(0, 12, -19.3),
    J(0, s1top, -24), V(0, s1top, -29.8),
    J(2, s2top, -34), V(4.6, s2top, -38.5), V(5, 10.4, -40),
    V(5, 10.4, -49.5), V(4, 10.4, -55.5),
    J(2, 10.4, -60.5), V(0, 10.4, -64.5), V(0, 10.4, -67.5), V(0, 10.4, -73.4),
    J(0, 11.8, -74.9), J(0, 13.6, -77), V(0, 13.6, -82.5),
    Z(29, 8.2, -118), V(31, 8, -133.5),
    J(31, 6, -141.5), V(31, 6, -147),
  ];

  const checkpoints = [
    { name: 'Pier 9 warehouse', roof: w1, spawn: new THREE.Vector3(0, 12.05, -4), yaw: 0 },
    { name: 'Checkpoint 1', roof: s2, spawn: new THREE.Vector3(-2, s2top + 0.05, -36), yaw: 0 },
    { name: 'Checkpoint 2', roof: w2, spawn: new THREE.Vector3(0, 10.45, -61), yaw: 0 },
    { name: 'Checkpoint 3', roof: w3, spawn: new THREE.Vector3(30, 8.05, -121), yaw: 0 },
  ];
  const clues = [
    { id: 'marlaNote', pos: new THREE.Vector3(8, 12, -2), onPath: false },
    { id: 'vinceIOU', pos: new THREE.Vector3(-3, s2top, -37), onPath: true },
    { id: 'dexPhoto', pos: new THREE.Vector3(17, s2top, -37.6), onPath: false },
    { id: 'hqBadge', pos: new THREE.Vector3(34, 8, -130), onPath: true },
  ];
  const guides = [
    [0, 12, -16, 0], [0, s1top, -27, 0], [-5.4, s2top, -38, 0], [0, 10.4, -62, 0],
    [0, 10.4, -71, 0], [0, 13.6, -80, 0], [31, 8, -126, 0],
  ];

  return {
    group, world: kit.world, buildings: kit.buildings, hideSpots: kit.hideSpots, zipLines: kit.zipLines,
    checkpoints, clues, guides, fugitivePath, policeCars,
    goalPos: new THREE.Vector3(31, 6, -147),
    fallTitle: 'Ground units spotted you',
    officerSpawns: [],
  };
}

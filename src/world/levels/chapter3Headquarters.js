import * as THREE from 'three';
import { RooftopKit } from '../rooftopKit.js';
import { makeGlowMaterial, makeTextTexture } from '../materials.js';
import { makeCarMesh } from '../../vehicles/carModel.js';
import { playerCarColour } from '../../vehicles/carColours.js';

// ======================================================================
//  Chapter 3, Part 1: police headquarters
//  Get onto the roof of police HQ, find Det. Hale's ledger (it's hidden by
//  the skylight above Hale's office), then zip-line down to the car on the
//  parking garage behind. Officers come out of the stairwell huts and chase
//  you on foot; later the helicopter joins in.
//
//    O1 office roof (25 m) -> ZIP LINE across to the HQ roof (24)    [CP 1]
//    HQ roof: a tall comms tower in the middle. East side: SLIDE under the
//             duct to reach Hale's skylight (the ledger). West side: open.
//    HQ north edge -> ZIP LINE down to the garage (14) -> the car.
// ======================================================================

export function buildChapter3Headquarters() {
  const kit = new RooftopKit({ seed: 3303 });
  const rng = kit.rng;
  kit.street(-400, -400, 400, 400);

  const o1 = kit.building(-10, -18, 10, 0, 25, { tint: 0x7f8f9a });
  const hq = kit.building(-24, -78, 24, -30, 24, { tint: 0x6a7080 });
  const garage = kit.building(-15, -112, 15, -86, 14, { windows: false, tint: 0x7d7d80 });

  // O1: start roof
  kit.ac(-5, 25, -6);
  kit.hut(6, 25, -6, 0);
  kit.zipLine(0, 27.3, -15.5, 0, 26.2, -38, { startRoof: 25, endRoof: 24 });

  // HQ: comms tower in the middle (too tall to climb)
  kit.setback(0, 24, -52, 12, 12, 12, 0x5a6070);
  kit.craneMast(0, -52, 50, 1, 0); // radio mast on top of the tower (decor + red light)
  // Stairwell huts: where the officers come out
  const huts = [[-18, -36, 1], [18, -36, 1], [-18, -72, 0], [18, -72, 0]];
  for (const [x, z, door] of huts) kit.hut(x, 24, z, door);
  // East side: the duct you slide under, then Hale's skylight
  kit.duct(6, -52.6, 24, -51.4, 24);
  kit.skylight(19, 24, -62, 3, 2.2);
  kit.ac(12, 24, -44);
  kit.ac(12, 24, -70, true);
  // West side: vaults and a skylight
  kit.ac(-12, 24, -44);
  kit.ac(-12, 24, -52, true);
  kit.skylight(-12, 24, -62, 3, 2.2);
  kit.waterTower(-20, 24, -52);

  // Escape: zip line from the HQ's north edge down to the garage
  kit.zipLine(0, 26.3, -75, 2, 16.2, -98, { startRoof: 24, endRoof: 14 });

  // Garage deck walls
  const deck = { side: 'concrete', top: 'concrete', color: 0x9a9a9a, uvScale: [3, 3], topScale: [3, 3] };
  kit.solid(-15, 14, -112, 15, 15, -111.6, deck);
  kit.solid(14.6, 14, -112, 15, 15, -86, deck);
  kit.solid(-15, 14, -112, -14.6, 15, -86, deck);

  kit.sign(hq, 1, 'POLICE', '#3d7bff', 18);
  kit.sign(o1, 3, 'HOTEL', '#ff3fa4', 14);

  // Filler city
  const route = [o1, hq, garage];
  const keepout = route.map((b) => ({ x0: b.minX - 6, x1: b.maxX + 6, z0: b.minZ - 6, z1: b.maxZ + 6 }));
  keepout.push({ x0: -8, x1: 8, z0: -40, z1: -10 });
  for (let gx = -110; gx <= 110; gx += 24) {
    for (let gz = 60; gz >= -200; gz -= 24) {
      const w = rng.range(12, 18), d = rng.range(12, 18);
      const x = gx + rng.range(-2, 2), z = gz + rng.range(-2, 2);
      const r = { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 };
      if (keepout.some((k) => r.x0 < k.x1 && r.x1 > k.x0 && r.z0 < k.z1 && r.z1 > k.z0)) continue;
      const h = rng() < 0.25 ? rng.range(30, 50) : rng.range(10, 26);
      const b = kit.building(r.x0, r.z0, r.x1, r.z1, h, { lips: false });
      if (rng() < 0.12) kit.sign(b, rng.int(0, 3));
    }
  }
  for (let z = -120; z <= 20; z += 16) kit.lamps.push([-30, z], [30, z]);

  const group = kit.finish();

  // Police cars in front of HQ, the getaway car on the garage
  const policeCars = [];
  for (const [x, z, r] of [[-20, -24, 0.2], [-8, -22, -0.3], [8, -23, 0.4], [22, -25, 1.3], [28, -50, 1.6], [-28, -60, -1.5]]) {
    const m = makeCarMesh({ kind: 'police' });
    m.position.set(x, 0, z);
    m.rotation.y = r;
    group.add(m);
    policeCars.push(m);
  }
  const carPos = new THREE.Vector3(6, 14, -106);
  const car = makeCarMesh({ kind: 'player', color: playerCarColour() });
  car.position.copy(carPos);
  car.rotation.y = Math.PI;
  group.add(car);
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 90, 20, 1, true), makeGlowMaterial(0xffb020, 0.16));
  beacon.position.set(carPos.x, carPos.y + 45, carPos.z);
  group.add(beacon);

  const checkpoints = [
    { name: 'Hotel roof', roof: o1, spawn: new THREE.Vector3(0, 25.05, -4), yaw: 0 },
    { name: 'HQ roof', roof: hq, spawn: new THREE.Vector3(0, 24.05, -37), yaw: 0 },
  ];
  const clues = [
    { id: 'marlaEmail', pos: new THREE.Vector3(-6, 25, -12), onPath: true },
    { id: 'ledger', pos: new THREE.Vector3(19, 24, -65), onPath: true },
    { id: 'dexPhone', pos: new THREE.Vector3(-21, 24, -62), onPath: false },
    { id: 'vinceTicket', pos: new THREE.Vector3(-5, 24, -74), onPath: true },
  ];
  const guides = [[0, 25, -10, 0], [15, 24, -46, 0], [15, 24, -58, 0], [4, 24, -72, 0]];

  return {
    group, world: kit.world, buildings: kit.buildings, hideSpots: kit.hideSpots, ladders: kit.ladders, zipLines: kit.zipLines,
    checkpoints, clues, guides, policeCars, beacon,
    goalPos: carPos,
    heliStart: new THREE.Vector3(0, 0, 60),
    officerSpawns: huts.map(([x, z]) => new THREE.Vector3(x, 24, z)),
  };
}

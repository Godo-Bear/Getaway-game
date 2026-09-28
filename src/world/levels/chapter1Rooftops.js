import * as THREE from 'three';
import { RooftopKit } from '../rooftopKit.js';
import { makeTextTexture, makeGlowMaterial } from '../materials.js';
import { makeCarMesh } from '../../vehicles/carModel.js';
import { playerCarColour } from '../../vehicles/carColours.js';

// ======================================================================
//  Chapter 1, Part 1: the rooftop escape
//  From the Harbor Trust bank roof to the getaway car on top of the
//  Pier Street parking garage.
//
//  The route runs NORTH (-Z) then EAST (+X). Numbers to remember while
//  editing (from the player controller):
//    - running jump clears ~4.5 m, sprint jump ~7 m (level to level)
//    - you can climb ledges up to 2.7 m above where you last stood
//    - vault: anything up to 1.3 m high, automatically at speed
//
//  MAIN PATH
//    Bank (22 m) -> B1 (22) : 3 m gap, running jump
//    B1 -> B2 (24.2)        : 2.5 m gap up onto a higher roof (ledge grab)  [CP 1]
//    B2 -> B3 (24.2)        : crane beam across Harbor Street
//    B3 -> B4 (21)          : 3.5 m gap, dropping down                      [CP 2]
//    B4 -> B5 (26)          : fire escape: three landings up the wall        [CP 3]
//    B5 -> B6 (25)          : narrow plank across Pier Street                [CP 4]
//    B6 -> B7 (21) -> garage stair tower (17) -> garage deck (13) -> the car
//
//  SHORTCUTS / SECRETS
//    - West detour off B2: drop to a lower roof for the torn floor plan,
//      then take the stairs and plank back up.
//    - On B4: AC unit -> stairwell hut roof -> leap to B5, skipping the
//      fire escape (hard).
//    - On B5: AC -> hut roof for the matchbook (the billboard catwalk above is a bonus climb).
// ======================================================================

export function buildChapter1Rooftops() {
  const kit = new RooftopKit({ seed: 2024 });
  const rng = kit.rng;

  kit.street(-400, -400, 400, 400);

  // ------------------------------------------------------------------
  // Route buildings
  // ------------------------------------------------------------------
  const bank = kit.building(-12, -10, 12, 10, 22, { windows: false, tint: 0xcdbfa3 });
  const b1 = kit.building(-9, -26, 9, -13, 22);
  const b2 = kit.building(-9, -44, 9, -28.5, 24.2);
  const b2w = kit.building(-22, -46, -11.5, -30, 20.5);
  const b3 = kit.building(22, -46, 38, -30, 24.2);
  const b4 = kit.building(22, -66, 36, -49.5, 21);
  const b5 = kit.building(20, -92, 40, -70, 26);
  const b6 = kit.building(53, -94, 68, -72, 25);
  const b7 = kit.building(52, -114, 68, -97.5, 21);
  const garage = kit.building(48, -142, 76, -118, 13, { windows: false, tint: 0x7d7d80 });
  const route = [bank, b1, b2, b2w, b3, b4, b5, b6, b7, garage];

  // --- Bank roof (start): the stairwell you came out of, the vault skylight, AC units
  kit.hut(-6, 22, 5, 1);
  kit.skylight(4, 22, 2, 4, 3);
  kit.ac(-5, 22, -5);
  kit.ac(5, 22, -6);

  // --- B1: vault the AC units, water tower to hide under
  kit.ac(-3, 22, -18);
  kit.ac(3, 22, -21.5, true);
  kit.waterTower(-5.5, 22, -23);

  // --- B2: checkpoint 1, hut
  kit.hut(-5, 24.2, -40, 3);
  kit.ac(4, 24.2, -31.5);

  // --- B2 west detour (torn floor plan clue)
  // A staircase up to a plank that leads back across to B2 (no tricky jumps).
  kit.fireEscapeStairsZ(-36.5, 2, -18.5, 20.5, [{ steps: 9 }, { landing: 1.6 }]); // top at 24.1
  kit.beam('x', -11.5, -7.6, -35.5, 24.2, 1.2, 'plank');
  kit.ac(-15, 20.5, -43);

  // --- Crane beam B2 -> B3 across Harbor Street (and the crane itself)
  kit.beam('x', 7.6, 23.4, -37, 24.2, 1.0, 'crane');
  kit.craneMast(15.5, -49, 34, -1, 16);

  // --- B3: skylights, AC, water tower
  kit.skylight(27, 24.2, -34);
  kit.skylight(33, 24.2, -34);
  kit.ac(30, 24.2, -42);
  kit.waterTower(34.5, 24.2, -41.5);

  // --- B4: checkpoint 2. The shortcut: AC -> hut roof -> leap to B5.
  kit.hut(33, 21, -64.1, 2, 3.4);               // roof at 23.8, north edge at -65.8
  kit.ac(33, 21, -61.3);                        // AC top 22.1 -> hut roof (+1.7)
  kit.ac(25, 21, -54);

  // --- Fire escape up the south wall of B5: a metal staircase over the alley.
  // Short 1.8 m hop from B4 onto the bottom landing, then just run up the
  // steps (each 0.4 m, walked up automatically) and step onto the roof.
  kit.fireEscapeStairsZ(-70, 2.2, 22.5, 21.0, [
    { landing: 4.0 },            // bottom landing (you land here from B4)
    { steps: 7 },                // up to 23.8
    { landing: 2.0 },
    { steps: 6 },                // up to 26.2
    { landing: 2.2 },            // top: the roof edge is right beside you
  ]);

  // --- B5: checkpoint 3. Hiding spots, and the billboard secret.
  kit.waterTower(36, 26, -75.5);
  kit.waterTower(23.5, 26, -80);
  kit.hut(30, 26, -86, 1);                      // roof at 28.8
  kit.ac(27.4, 26, -86);                        // AC -> hut roof (+1.7)
  kit.billboard(30, 30.5, -90.8, 10, 'THE ANCHOR  COLD BEER', '#ffb020', 1); // catwalk at 30.5

  // --- Plank B5 -> B6 across Pier Street
  kit.beam('x', 38.6, 54.4, -82, 26, 0.8, 'plank');
  kit.solid(53, 25, -82.4, 54.4, 25.75, -81.6, { side: 'plain', top: 'plain', color: 0x4a4a4e });

  // --- B6: checkpoint 4
  kit.skylight(62, 25, -78);
  kit.ac(58, 25, -88);
  kit.hut(64, 25, -90, 0);

  // --- B7
  kit.ac(56, 21, -104);
  kit.waterTower(64, 21, -103);

  // --- Parking garage: stair tower, parapet walls, parking lines, parked cars
  kit.solid(54, 13, -122, 60, 17, -118, { side: 'concrete', top: 'roof', color: 0x8a8a8a, uvScale: [4, 4], topScale: [4, 4] }, 'building');
  const deck = { side: 'concrete', top: 'concrete', color: 0x9a9a9a, uvScale: [3, 3], topScale: [3, 3] };
  kit.solid(48, 13, -142, 76, 14, -141.6, deck);
  kit.solid(75.6, 13, -142, 76, 14, -118, deck);
  kit.solid(48, 13, -142, 48.4, 14, -118, deck);
  for (let x = 51; x < 75; x += 3) {
    kit.batch.addBox({ x: x - 0.08, y: 13.01, z: -140 }, { x: x + 0.08, y: 13.02, z: -135 }, { side: null, top: 'glow', color: 0x8a8a70 });
  }
  const parked = [];
  for (const [x, z, color] of [[52.5, -137.5, 0x1f3f8a], [58.5, -137.5, 0x8a1c1c], [70.5, -137.5, 0x2e2e33]]) {
    kit.world.addBox(x - 1.05, 13, z - 2.2, x + 1.05, 14.6, z + 2.2, { tag: 'car' });
    parked.push([x, z, color]);
  }
  const carPos = new THREE.Vector3(64.5, 13, -130);

  // Neon: Vince's bar sign where you'll see it from the route
  kit.sign(b4, 3, 'THE ANCHOR', '#ffb020', 12);
  kit.sign(b3, 1, 'PIER ST GARAGE >', '#39e6ff', 14);

  // ------------------------------------------------------------------
  // Filler city around the route (keeps the route's gaps clear)
  // ------------------------------------------------------------------
  const keepout = route.map((b) => ({ x0: b.minX - 6, x1: b.maxX + 6, z0: b.minZ - 6, z1: b.maxZ + 6 }));
  keepout.push({ x0: -30, x1: 30, z0: 8, z1: 45 });      // plaza in front of the bank (police cars)
  keepout.push({ x0: 5, x1: 26, z0: -55, z1: -25 });     // Harbor Street under the crane
  keepout.push({ x0: 36, x1: 56, z0: -95, z1: -70 });    // Pier Street under the plank
  for (let gx = -110; gx <= 150; gx += 24) {
    for (let gz = -200; gz <= 70; gz += 24) {
      const w = rng.range(12, 18), d = rng.range(12, 18);
      const x = gx + rng.range(-2, 2), z = gz + rng.range(-2, 2);
      const r = { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 };
      if (keepout.some((k) => r.x0 < k.x1 && r.x1 > k.x0 && r.z0 < k.z1 && r.z1 > k.z0)) continue;
      const h = rng() < 0.2 ? rng.range(30, 48) : rng.range(10, 24);
      const b = kit.building(r.x0, r.z0, r.x1, r.z1, h, { lips: false });
      if (rng() < 0.3 && h < 30) kit.waterTower(x + rng.range(-3, 3), h, z + rng.range(-3, 3));
      if (rng() < 0.15) kit.sign(b, rng.int(0, 3));
    }
  }

  // Street lamps along the main streets
  for (let z = -150; z <= 40; z += 16) {
    kit.lamps.push([15.5, z], [46, z]);
  }
  for (let x = -40; x <= 90; x += 16) kit.lamps.push([x, 14]);

  const group = kit.finish();

  // ------------------------------------------------------------------
  // One-off visuals: bank front, parked cars, getaway car, police outside
  // ------------------------------------------------------------------
  const bankSign = new THREE.Mesh(new THREE.PlaneGeometry(16, 3),
    new THREE.MeshBasicMaterial({ map: makeTextTexture('HARBOR TRUST', { color: '#ffd27a', bg: '#0c1220', width: 1024, height: 192, font: 'bold 120px Georgia, serif', glow: false }), toneMapped: false }));
  bankSign.position.set(0, 17.5, 10.06);
  group.add(bankSign);
  const colMat = new THREE.MeshLambertMaterial({ color: 0xe0d6c0 });
  for (let x = -9; x <= 9; x += 3.6) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 12, 12), colMat);
    col.position.set(x, 6, 10.9);
    group.add(col);
  }

  for (const [x, z, color] of parked) {
    const m = makeCarMesh({ kind: 'civilian', color });
    m.position.set(x, 13, z);
    group.add(m);
  }
  const car = makeCarMesh({ kind: 'player', color: playerCarColour() });
  car.position.copy(carPos);
  car.rotation.y = Math.PI;
  group.add(car);
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 90, 20, 1, true), makeGlowMaterial(0xffb020, 0.16));
  beacon.position.set(carPos.x, carPos.y + 45, carPos.z);
  group.add(beacon);

  const policeCars = [];
  for (const [x, z, r] of [[-7, 16, 0.4], [2, 21, -0.5], [14, 18, 1.2], [-15, 24, 2.4], [8, 30, 1.6]]) {
    const m = makeCarMesh({ kind: 'police' });
    m.position.set(x, 0, z);
    m.rotation.y = r;
    group.add(m);
    policeCars.push(m);
  }

  // ------------------------------------------------------------------
  // Gameplay data
  // ------------------------------------------------------------------
  // Checkpoints: reached when you stand on that roof. `spawn` is where you
  // restart, `yaw` is the camera direction on respawn (0 = looking north / -Z).
  const checkpoints = [
    { name: 'Bank roof', roof: bank, spawn: new THREE.Vector3(0, 22.05, 5), yaw: 0 },
    { name: 'Checkpoint 1', roof: b2, spawn: new THREE.Vector3(0, 24.25, -33), yaw: -Math.PI / 2 },
    { name: 'Checkpoint 2', roof: b4, spawn: new THREE.Vector3(29, 21.05, -54), yaw: 0 },
    { name: 'Checkpoint 3', roof: b5, spawn: new THREE.Vector3(27, 26.05, -76), yaw: -Math.PI / 2 },
    { name: 'Checkpoint 4', roof: b6, spawn: new THREE.Vector3(60, 25.05, -80), yaw: 0 },
  ];

  // Clue pickups (ids match CHAPTER1.clues)
  const clues = [
    { id: 'phone', pos: new THREE.Vector3(5.5, 24.2, -41), onPath: true },
    { id: 'floorplan', pos: new THREE.Vector3(-19.5, 20.5, -43), onPath: false },
    { id: 'earpiece', pos: new THREE.Vector3(26, 21, -61), onPath: true },
    { id: 'matchbook', pos: new THREE.Vector3(30, 28.8, -86), onPath: false }, // on the hut roof
  ];

  // Orange arrows painted on the roofs showing the main path: [x, y, z, yaw]
  // (yaw 0 = arrow points toward -Z / north, -PI/2 = east)
  const guides = [
    [0, 22, -6, 0], [0, 22, -24, 0], [5, 24.2, -37, -Math.PI / 2], [29, 24.2, -44, 0],
    [25, 21, -64, 0], [34, 26, -82, -Math.PI / 2], [60, 25, -91, 0], [59, 21, -112, 0], [57, 17, -121, 0],
  ];

  return {
    group, world: kit.world, buildings: kit.buildings, hideSpots: kit.hideSpots, ladders: kit.ladders,
    spawn: checkpoints[0].spawn, checkpoints, clues, guides, carPos, beacon, policeCars,
    goalPos: carPos, heliStart: new THREE.Vector3(0, 0, 70),
  };
}

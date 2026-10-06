import * as THREE from 'three';
import { generateRooftopCity } from '../rooftopCity.js';
import { makeCarMesh } from '../../vehicles/carModel.js';
import { playerCarColour, playerCarStyle } from '../../vehicles/carColours.js';
import { DOWNTOWN_FOOT } from '../maps.js';
import { makeTextTexture } from '../materials.js';

// ======================================================================
//  Chapter 5, Part 1: a new crew. DAYTIME, ON THE GROUND.
//  A sunny afternoon in the city. Walk the streets to meet three people:
//  Nova at a pavement cafe, Mags outside a pawn shop and Theo at a bus
//  stop, then Ricky with the car. You're a famous face now: police officers
//  walk the pavements (yellow vision cones). Blend into the crowd (walk
//  right next to people), crouch behind parked cars, or climb a ladder and
//  take the roofs. If a cop gets a good look at you: back to the last
//  checkpoint.
//
//  The blocks are 42 m wide with 13 m streets between them; the pavement
//  runs round every block, 21-23.5 m from its centre.
// ======================================================================

const BLOCKS = 5;
const PITCH = 55;
const C = (i) => (i - (BLOCKS - 1) / 2) * PITCH;   // block centre
const ST = (i) => C(i) + PITCH / 2;                // street centre (after block i)
const PAV = 22.3;                                   // pavement line from a block centre

export function buildChapter5Recruit() {
  // Harbor City downtown: the same city as Free Run (this chapter's 5 x 5
  // blocks are the middle of it)
  const city = generateRooftopCity(DOWNTOWN_FOOT);
  const w = city.world;
  const g = city.group;
  const lambert = (color) => new THREE.MeshLambertMaterial({ color });
  const box = (x, y, z, sx, sy, sz, color, solid = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), lambert(color));
    m.position.set(x, y + sy / 2, z);
    m.castShadow = true;
    g.add(m);
    if (solid) w.addBlock(x, y, z, sx, sy, sz, { tag: 'prop' });
    return m;
  };
  const sign = (text, x, y, z, rotY, color, width = 5) => {
    const mat = new THREE.MeshBasicMaterial({ map: makeTextTexture(text, { color, bg: 'rgba(12,14,22,0.92)', width: 512, height: 128 }), toneMapped: false });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 4), mat);
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    g.add(m);
  };
  const car = (x, z, heading, kind, color) => {
    const m = makeCarMesh({ kind, color, style: kind === 'player' ? playerCarStyle() : null });
    m.position.set(x, 0, z);
    m.rotation.y = heading;
    g.add(m);
    const along = Math.abs(Math.sin(heading)) > 0.5;
    w.addBlock(x, 0, z, along ? 4.4 : 2, 1.3, along ? 2 : 4.4, { tag: 'car' });
    return m;
  };

  // --- The start: west side of the middle block row
  const spawn = new THREE.Vector3(C(1) + PAV, 0.05, C(2) + 8);

  // --- Nova: a pavement cafe (south side of the centre block)
  const cafe = { x: C(2) - 2, z: C(2) + PAV };
  box(cafe.x, 3.4, C(2) + 21.9, 12, 0.18, 2.6, 0xd9493c, false);            // awning
  sign('CAFE LUNA', cafe.x, 4.3, C(2) + 21.05, 0, '#ffd28a', 6);
  for (const dx of [-4, 0, 4]) {
    box(cafe.x + dx, 0, cafe.z, 0.9, 0.78, 0.9, 0xe8e2d6);                   // tables (low cover)
    box(cafe.x + dx - 0.9, 0, cafe.z, 0.45, 0.5, 0.45, 0x3a3a40, false);
  }
  const laptopMesh = box(cafe.x + 4, 0.78, cafe.z, 0.4, 0.03, 0.3, 0x2a2e38, false);
  laptopMesh.material = new THREE.MeshBasicMaterial({ color: 0x39e6ff });

  // --- Mags: outside a pawn shop (north side of the block to the east)
  const pawn = { x: C(3) + 4, z: C(2) - PAV };
  sign('PAWN & LOAN', pawn.x, 4.2, C(2) - 21.05, Math.PI, '#ffb020', 6);
  box(pawn.x + 1.6, 0, pawn.z - 0.2, 0.9, 1.1, 0.9, 0x4a4f58);               // the old safe

  // --- Theo: a bus stop (west side of the block to the north-east)
  const bus = { x: C(3) - PAV, z: C(1) + 2 };
  box(bus.x - 0.2, 2.5, bus.z, 1.6, 0.12, 4.2, 0x2c3440, false);            // shelter roof
  for (const dz of [-2, 2]) box(bus.x - 0.2, 0, bus.z + dz, 1.4, 2.5, 0.08, 0x9fc4dc, false);
  box(bus.x + 0.3, 0, bus.z, 0.5, 0.45, 2.6, 0x5a3a28);                      // bench
  sign('BUS 42', bus.x - 0.25, 3.1, bus.z, -Math.PI / 2, '#39e6ff', 3);

  // --- Ricky's car: on the street north of the centre block
  const carSpot = { x: C(2) + 6, z: ST(1) + 4 };
  const ricky = car(carSpot.x, carSpot.z, Math.PI / 2, 'player', playerCarColour());
  const goalPos = new THREE.Vector3(carSpot.x, 0, carSpot.z);

  // Parked cars along the kerbs: cover to crouch behind
  const civ = [0x8a2a2a, 0x2a5a8a, 0xd8d8d8, 0x3a3a3a, 0x6a8a3a, 0xc8a040];
  [[C(2) + 12, C(2) + 25.2, Math.PI / 2], [C(2) - 14, C(2) + 25.2, Math.PI / 2], [C(3) - 10, C(2) - 25.2, Math.PI / 2],
    [C(3) + 16, C(2) - 25.2, Math.PI / 2], [C(3) - 25.2, C(1) - 10, 0], [C(3) - 25.2, C(1) + 14, 0],
    [C(2) - 8, ST(1) + 4, Math.PI / 2], [ST(2) - 3.2, C(2) + 2, 0], [ST(2) + 3.2, C(2) - 12, 0]]
    .forEach(([x, z, h], i) => car(x, z, h, i % 4 === 3 ? 'van' : i % 5 === 2 ? 'taxi' : 'civilian', civ[i % civ.length]));

  // --- Where people stand
  const meetingSpots = {
    nova: new THREE.Vector3(cafe.x + 4.9, 0.05, cafe.z),
    mags: new THREE.Vector3(pawn.x, 0.05, pawn.z),
    theo: new THREE.Vector3(bus.x + 0.6, 0.05, bus.z - 3),
    ricky: new THREE.Vector3(carSpot.x, 0.05, carSpot.z - 1.8),
  };

  // --- Clues: a short detour from each meeting
  const clues = [
    { id: 'laptop', pos: new THREE.Vector3(ST(2) - 0.5, 0.05, C(2) + 16) },        // dropped in the street by the cafe
    { id: 'schedule', pos: new THREE.Vector3(C(3) - PAV, 0.05, C(1) - 16) },        // blown along from the bus stop
  ];

  // --- Checkpoints (ground rectangles around each meeting)
  const area = (x, z, r = 5) => ({ minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r, h: 0 });
  const checkpoints = [
    { name: 'The start', spawn: spawn.clone(), yaw: -Math.PI / 2, roof: area(spawn.x, spawn.z) },
    { name: 'Cafe Luna', spawn: new THREE.Vector3(cafe.x - 6, 0.05, cafe.z), yaw: -Math.PI / 2, roof: area(cafe.x, cafe.z, 7) },
    { name: 'The pawn shop', spawn: new THREE.Vector3(pawn.x - 4, 0.05, pawn.z), yaw: -Math.PI / 2, roof: area(pawn.x, pawn.z) },
    { name: 'The bus stop', spawn: new THREE.Vector3(bus.x, 0.05, bus.z + 5), yaw: 0, roof: area(bus.x, bus.z) },
  ];

  // --- Police on the beat (they walk these loops) and the crowd's pavements
  const patrolRoutes = [
    [[C(2) - 16, C(2) + 23], [C(2) + 14, C(2) + 23]],                                  // past the cafe
    [[ST(2), C(2) + 20], [ST(2), C(2) - 20]],                                          // down the middle of the street
    [[C(3) - 16, C(2) - 23], [C(3) + 16, C(2) - 23]],                                  // past the pawn shop
    [[C(3) - 27, C(1) + 18], [C(3) - 27, C(1) - 18]],                                  // up the street past the bus stop
    [[C(2) - 16, ST(1) - 1], [C(2) + 20, ST(1) - 1]],                                  // the street where Ricky waits
  ];
  const crowdLanes = [
    { a: [C(1) + PAV, C(2) - 18], b: [C(1) + PAV, C(2) + 18] },
    { a: [C(2) - 18, C(2) + PAV + 0.4], b: [C(2) + 18, C(2) + PAV + 0.4] },
    { a: [C(2) + PAV, C(2) + 18], b: [C(2) + PAV, C(2) - 18] },
    { a: [C(3) - 18, C(2) - PAV - 0.4], b: [C(3) + 18, C(2) - PAV - 0.4] },
    { a: [C(3) - PAV - 0.4, C(1) + 18], b: [C(3) - PAV - 0.4, C(1) - 18] },
    { a: [C(2) - 18, C(1) + PAV], b: [C(2) + 18, C(1) + PAV] },
  ];

  return {
    ...city,
    groundLevel: true,       // played in the street (no "you fell" / ladder help)
    spawn, checkpoints, clues, goalPos, meetingSpots, patrolRoutes, crowdLanes, rickyCar: ricky,
    meetingCheckpoint: { nova: 1, mags: 2, theo: 3 },
  };
}

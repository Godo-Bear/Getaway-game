import * as THREE from 'three';
import { generateRooftopCity } from '../rooftopCity.js';
import { makeTextTexture, makeGlowMaterial } from '../materials.js';

// ======================================================================
//  Chapter 8, Part 2: Frostvale, a small town under the mountains.
//  Snowy daytime, played down in the street. Meet Juno at the ski hire
//  shop, then take recon photos of the job (the Glacier Bank's cable car,
//  its security hut, its town office), then go to your new home: the cabin.
//  Bounty hunters walk the streets (your faces are on every wanted poster):
//  blend into the crowd, crouch behind parked cars, or take the roofs.
// ======================================================================

const BLOCKS = 4;
const PITCH = 55;
const C = (i) => (i - (BLOCKS - 1) / 2) * PITCH;   // block centre
const ST = (i) => C(i) + PITCH / 2;                // street centre (after block i)
const PAV = 22.3;                                   // pavement line from a block centre

export function buildChapter8Town() {
  const city = generateRooftopCity({ seed: 8080, blocks: BLOCKS });
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
  const sign = (text, x, y, z, rotY, color, width = 6) => {
    const mat = new THREE.MeshBasicMaterial({ map: makeTextTexture(text, { color, bg: 'rgba(12,14,22,0.92)', width: 1024, height: 128, font: 'bold 80px "Bebas Neue", Impact, sans-serif' }), toneMapped: false });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 8), mat);
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    g.add(m);
  };
  // Snowdrifts along the kerbs and snowy pine trees in the streets' corners (scenery)
  const pine = (x, z, s = 1) => {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 1.6, 6), lambert(0x3a2a1c)); t.position.set(x, 0.8, z);
    const c1 = new THREE.Mesh(new THREE.ConeGeometry(1.6 * s, 3.4 * s, 7), lambert(0x1d3a2a)); c1.position.set(x, 2.6 * s + 0.6, z);
    const c2 = new THREE.Mesh(new THREE.ConeGeometry(1.0 * s, 1.4 * s, 7), lambert(0xeef2f8)); c2.position.set(x, 3.9 * s + 0.6, z);
    g.add(t, c1, c2);
    w.addBlock(x, 0, z, 0.6, 2, 0.6, { tag: 'prop' });
  };
  for (let i = 0; i < BLOCKS - 1; i++) for (let j = 0; j < BLOCKS - 1; j++) pine(ST(i) + 5.5, ST(j) + 5.5, 0.9 + ((i + j) % 3) * 0.15);

  const spawn = new THREE.Vector3(C(0) + PAV, 0.05, C(1) - 8);

  // --- Juno: the ski hire shop (south side of block 1,1)
  const shop = { x: C(1), z: C(1) + PAV };
  sign('FROSTVALE SKI HIRE', shop.x, 4.2, C(1) + 21.05, 0, '#ff9ad5');
  for (const dx of [-3, -2.2, -1.4]) box(shop.x + dx, 0, shop.z + 0.4, 0.15, 1.8, 0.15, 0xff9ad5, false); // skis in a rack
  box(shop.x - 2.2, 0.9, shop.z + 0.4, 2, 0.1, 0.25, 0x6b5236, false);

  // --- Recon targets
  // the cable car base station: a big building with the cable going up into the clouds
  const station = { x: C(2) + PAV, z: C(1) };
  sign('GLACIER BANK · CABLE CAR', C(2) + 21.05, 5.5, station.z, -Math.PI / 2, '#9fd4ff', 9);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 420, 6), lambert(0x22252a));
  cable.position.set(C(2) + 100, 120, station.z - 120);
  cable.lookAt(C(2) + 200, 240, station.z - 240);
  cable.rotateX(Math.PI / 2);
  g.add(cable);
  // the bank's security hut (in the street by the station)
  const hut = { x: ST(2) - 3, z: C(1) + 14 };
  box(hut.x, 0, hut.z, 3, 2.6, 3, 0x6a6f78);
  box(hut.x, 2.6, hut.z, 3.4, 0.2, 3.4, 0xeef2f8, false);
  sign('BANK SECURITY', hut.x - 1.55, 2.1, hut.z, -Math.PI / 2, '#ffd040', 3);
  // the bank's town office (north side of block 1,2)
  const office = { x: C(1) + 6, z: C(2) - PAV };
  sign('GLACIER BANK', office.x, 4.4, C(2) - 21.05, Math.PI, '#ffd040', 6);
  box(office.x + 2.5, 0, office.z - 0.4, 0.8, 1.6, 0.4, 0x2a3a5a); // (the armoured van timetable board)

  // --- Your new home: the cabin at the edge of town
  const cabin = { x: C(3), z: C(3) + PAV + 0.4 };
  sign('PINE LODGE', cabin.x, 4.2, C(3) + 21.05, 0, '#7dff8a', 5);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(2, 3), makeGlowMaterial(0x4dffa6, 0.6));
  door.position.set(cabin.x, 1.5, C(3) + 21.02);
  g.add(door);
  const goalPos = new THREE.Vector3(cabin.x, 0, cabin.z);

  // Parked cars with snow on their roofs: cover to crouch behind
  const car = (x, z, heading, color) => {
    const along = Math.abs(Math.sin(heading)) > 0.5;
    box(x, 0.25, z, along ? 4.2 : 1.9, 1.1, along ? 1.9 : 4.2, color);
    box(x, 1.35, z, along ? 2.4 : 1.7, 0.55, along ? 1.7 : 2.4, color);
    box(x, 1.9, z, along ? 2.3 : 1.6, 0.12, along ? 1.6 : 2.3, 0xeef2f8, false);
  };
  [[C(1) + 10, C(1) + 25.2, Math.PI / 2, 0x8a2a2a], [C(1) - 12, C(1) + 25.2, Math.PI / 2, 0x2a5a8a], [ST(2) + 3.2, C(1) - 8, 0, 0x3a3a3a],
    [C(2) - 6, C(2) - 25.2, Math.PI / 2, 0x6a8a3a], [C(3) - 10, C(3) + 25.2, Math.PI / 2, 0xc8a040], [ST(1) - 3.2, C(2) + 10, 0, 0xd8d8d8]]
    .forEach(([x, z, h, c]) => car(x, z, h, c));

  const meetingSpots = { juno: new THREE.Vector3(shop.x + 2, 0.05, shop.z) };
  const reconSpots = {
    station: new THREE.Vector3(station.x - 0.5, 0.05, station.z + 4),
    hut: new THREE.Vector3(hut.x - 3, 0.05, hut.z),
    office: new THREE.Vector3(office.x, 0.05, office.z),
  };

  const area = (x, z, r = 5) => ({ minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r, h: 0 });
  const checkpoints = [
    { name: 'The bus stop', spawn: spawn.clone(), yaw: Math.PI, roof: area(spawn.x, spawn.z) },
    { name: 'The ski hire shop', spawn: new THREE.Vector3(shop.x - 5, 0.05, shop.z), yaw: -Math.PI / 2, roof: area(shop.x, shop.z, 6) },
  ];
  const patrolRoutes = [
    [[C(1) - 16, C(1) + 23], [C(1) + 16, C(1) + 23]],          // past the ski shop
    [[ST(2), C(1) - 18], [ST(2), C(1) + 22]],                   // up the street by the station
    [[C(1) - 14, C(2) - 23], [C(1) + 18, C(2) - 23]],           // past the bank office
    [[C(3) - 18, C(3) + 23], [C(3) + 14, C(3) + 23]],           // in front of the cabin
  ];
  const crowdLanes = [
    { a: [C(0) + PAV, C(1) - 18], b: [C(0) + PAV, C(1) + 18] },
    { a: [C(1) - 18, C(1) + PAV + 0.4], b: [C(1) + 18, C(1) + PAV + 0.4] },
    { a: [C(2) + PAV + 0.4, C(1) - 18], b: [C(2) + PAV + 0.4, C(1) + 18] },
    { a: [C(1) - 18, C(2) - PAV - 0.4], b: [C(1) + 18, C(2) - PAV - 0.4] },
    { a: [C(3) - 18, C(3) + PAV + 0.4], b: [C(3) + 18, C(3) + PAV + 0.4] },
    { a: [C(2) - PAV, C(2) - 18], b: [C(2) - PAV, C(2) + 18] },
  ];

  return {
    ...city,
    groundLevel: true,
    spawn, checkpoints, clues: [], goalPos, meetingSpots, reconSpots, patrolRoutes, crowdLanes,
    meetingCheckpoint: { juno: 1 },
  };
}

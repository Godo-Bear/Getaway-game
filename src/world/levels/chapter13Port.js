import * as THREE from 'three';
import { generateRooftopCity } from '../rooftopCity.js';
import { makeCarMesh } from '../../vehicles/carModel.js';
import { PORTO_FOOT } from '../maps.js';
import { makeTextTexture } from '../materials.js';
import { buildPalms } from '../palms.js';

// ======================================================================
//  Chapter 13, Part 1: Porto Sereno, a sunny harbour town abroad.
//  The crew's plane has landed on a little private airstrip at the east
//  edge of town. Your gear (three heavy bags) has to get past the customs
//  officers at the gate and into Paz's van in the car park outside.
//
//    x ~ 160  the town's east street        x 200  the fence (gate in the
//    x ~ 182  the car park and the van               middle, customs booths)
//    x 215-260  the airstrip: runway, the plane, a luggage cart, the hangar
//    z > 205  the promenade, the beach and the sea (south)
//
//  Carrying a bag you're slower and can't climb (so it's the gate or
//  nothing); without one you can climb the fence. Walk with the other
//  passengers through the gate and the officers don't notice you.
// ======================================================================

export function buildChapter13Port() {
  const city = generateRooftopCity(PORTO_FOOT);
  const w = city.world, g = city.group;
  const lambert = (color) => new THREE.MeshLambertMaterial({ color });
  const box = (x, y, z, sx, sy, sz, color, solid = true, tag = 'prop') => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), lambert(color));
    m.position.set(x, y + sy / 2, z);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    if (solid) w.addBlock(x, y, z, sx, sy, sz, { tag });
    return m;
  };
  const sign = (text, x, y, z, rotY, color, width = 6, bg = 'rgba(12,14,22,0.92)') => {
    const mat = new THREE.MeshBasicMaterial({ map: makeTextTexture(text, { color, bg, width: 1024, height: 128, font: 'bold 72px "Bebas Neue", Impact, sans-serif' }), toneMapped: false });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 8), mat);
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    g.add(m);
  };
  const flat = (x0, z0, x1, z1, y, color) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), lambert(color));
    m.rotation.x = -Math.PI / 2;
    m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    m.receiveShadow = true;
    g.add(m);
    return m;
  };

  // ------------------------------------------------------------------ the airstrip
  flat(212, -175, 266, 175, 0.02, 0x8a8a84);          // the apron
  flat(232, -175, 256, 175, 0.03, 0x5a5a58);          // the runway
  for (let z = -165; z < 170; z += 14) flat(243.6, z, 244.4, z + 7, 0.04, 0xf2f2ee); // centre line
  // The plane: a little twin-prop, door open, steps down
  const plane = new THREE.Group();
  const white = lambert(0xf2f2ee), blue = lambert(0x1a5a9a), dark = lambert(0x2a2c30);
  const add = (geo, mat, x, y, z, rx = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); m.castShadow = true; plane.add(m); return m; };
  add(new THREE.CylinderGeometry(1.2, 1.0, 13, 12), white, 0, 2.1, 0, Math.PI / 2);
  add(new THREE.ConeGeometry(1.0, 2.2, 12), white, 0, 2.1, 7.6, Math.PI / 2);
  add(new THREE.BoxGeometry(16, 0.25, 2.2), white, 0, 2.6, 0.5);
  add(new THREE.BoxGeometry(5, 0.2, 1.4), white, 0, 2.6, -6);
  add(new THREE.BoxGeometry(0.2, 2.6, 1.8), blue, 0, 3.8, -6.2);
  add(new THREE.BoxGeometry(2.42, 0.3, 13), blue, 0, 1.6, 0);
  for (const x of [-4.2, 4.2]) { add(new THREE.CylinderGeometry(0.45, 0.45, 2.2, 10), dark, x, 2.4, 1.6, Math.PI / 2); add(new THREE.BoxGeometry(0.1, 2.6, 0.2), dark, x, 2.4, 2.75); }
  plane.position.set(238, 0, -18);
  g.add(plane);
  w.addBlock(238, 0.9, -18, 2.6, 2.4, 14, { tag: 'plane' });
  box(236.2, 0, -16, 1.2, 0.9, 1.6, 0xd8d8d0, true);   // the steps
  // A luggage cart and some crates (cover)
  box(226, 0, 4, 3.2, 1.2, 1.6, 0x4a5a6a);
  box(221, 0, -30, 1.8, 1.6, 1.8, 0x7a5a36);
  box(223.5, 0, -31, 1.4, 1.2, 1.4, 0x7a5a36);
  box(217, 0, 22, 2.2, 1.5, 4.4, 0xd8a028);            // a fuel bowser
  // The hangar: open at the front (west), the third bag inside
  const hx = 246, hz = 46;
  box(hx + 11, 0, hz, 0.6, 9, 22, 0xb8b2a6);           // back wall
  box(hx, 0, hz - 11, 22, 9, 0.6, 0xb8b2a6);           // side walls
  box(hx, 0, hz + 11, 22, 9, 0.6, 0xb8b2a6);
  box(hx, 9, hz, 22.6, 0.5, 22.6, 0x8a8e96, false);    // roof
  sign('HANGAR 2', hx - 11.05, 7.4, hz, -Math.PI / 2, '#ffd070', 6);
  box(hx + 4, 0, hz - 6, 2.4, 1.4, 4, 0x6a6a70);       // a workbench (cover)
  // The fence along x = 200 (the gate in the middle), and round the airstrip
  const fence = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const m = new THREE.Mesh(new THREE.BoxGeometry(alongX ? len : 0.08, 2.4, alongX ? 0.08 : len), new THREE.MeshLambertMaterial({ color: 0x9aa0a8, transparent: true, opacity: 0.45 }));
    m.position.set(cx, 1.2, cz);
    g.add(m);
    w.addBlock(cx, 0, cz, alongX ? len : 0.3, 2.4, alongX ? 0.3 : len, { tag: 'fence' });
    for (let t = 0; t <= len; t += 5) {
      const px = alongX ? x0 + Math.sign(x1 - x0) * t : x0, pz = alongX ? z0 : z0 + Math.sign(z1 - z0) * t;
      box(px, 0, pz, 0.12, 2.6, 0.12, 0x6a6e76, false);
    }
  };
  fence(200, -175, 200, -7); fence(200, 7, 200, 175);
  fence(200, -175, 268, -175); fence(200, 175, 268, 175); fence(268, -175, 268, 175);
  // The customs gate: two booths, a barrier arm (up), signs
  box(200, 0, -9.5, 3, 2.8, 4, 0xf2ece0); box(200, 2.8, -9.5, 3.6, 0.3, 4.6, 0x1a2440, false);
  box(200, 0, 9.5, 3, 2.8, 4, 0xf2ece0); box(200, 2.8, 9.5, 3.6, 0.3, 4.6, 0x1a2440, false);
  const arm = box(200, 1.3, -1, 0.15, 0.15, 12, 0xd82a2a, false);
  arm.rotation.x = 1.2;
  sign('ALFÂNDEGA · CUSTOMS', 198.4, 3.6, 0, -Math.PI / 2, '#ffffff', 8, 'rgba(26,36,64,0.95)');
  sign('ALFÂNDEGA · CUSTOMS', 201.6, 3.6, 0, Math.PI / 2, '#ffffff', 8, 'rgba(26,36,64,0.95)');

  // ------------------------------------------------------------------ the car park and Paz's van
  flat(174, -60, 198, 90, 0.025, 0x4a4a4e);
  for (let z = -54; z < 88; z += 6) flat(176, z, 182, z + 0.15, 0.03, 0xe8e8e0);
  const car = (x, z, h, kind, color) => {
    const m = makeCarMesh({ kind, color, parked: true });
    m.position.set(x, 0, z);
    m.rotation.y = h;
    g.add(m);
    w.addBlock(x, 0, z, Math.abs(Math.sin(h)) > 0.5 ? 4.4 : 2, 1.3, Math.abs(Math.sin(h)) > 0.5 ? 2 : 4.4, { tag: 'car' });
  };
  const van = { x: 186, z: 30 };
  car(van.x, van.z, 0, 'van', 0xf2ece0);
  sign('PEIXE FRESCO · PAZ', van.x - 1.06, 1.6, van.z, -Math.PI / 2, '#1a5a9a', 3.2, 'rgba(242,236,224,0.98)');
  [[179, -40, 0x8a2a2a], [179, -22, 0x2a5a8a], [179, 52, 0xd8a868], [179, 70, 0x3a3a3a], [192, -10, 0x6a8a3a], [192, 62, 0xc8a040]]
    .forEach(([x, z, c], i) => car(x, z, 0, i === 3 ? 'taxi' : 'civilian', c));

  // ------------------------------------------------------------------ the promenade, the beach and the sea (south)
  const edge = city.bounds;
  flat(-edge - 60, edge + 4, edge + 80, edge + 18, 0.03, 0xe8dcc0);     // promenade
  flat(-edge - 60, edge + 18, edge + 80, edge + 46, 0.03, 0xead6a2);    // sand
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1400, 900), new THREE.MeshPhongMaterial({ color: 0x1a7a9a, shininess: 90, specular: 0x88ccee }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.04, edge + 46 + 450);
  g.add(sea);
  box(0, 0, edge + 46.5, edge * 2 + 160, 1.4, 1, 0xd8cfc0);              // sea wall
  const palms = [];
  for (let x = -edge - 40; x < edge + 70; x += 16) palms.push([x, 0, edge + 11, 1 + ((x * 7) % 3) * 0.08]);
  for (let z = -160; z < 170; z += 22) palms.push([206, 0, z + 5, 0.95]);
  g.add(buildPalms(palms));
  for (const [x, , z] of palms) w.addBlock(x, 0, z, 0.5, 3, 0.5, { tag: 'tree' });

  // ------------------------------------------------------------------ the bags, the route, the people
  const V = (x, z) => new THREE.Vector3(x, 0.05, z);
  const carrySpots = { bag1: V(234.5, -21), bag2: V(226, 6.5), bag3: V(hx + 4, hz + 2) };
  const dropPos = V(van.x - 3, van.z);
  const spawn = V(234, -12);
  const area = (x, z, r = 5) => ({ minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r, h: 0 });
  const checkpoints = [
    { name: 'The plane', spawn: spawn.clone(), yaw: Math.PI / 2, roof: area(spawn.x, spawn.z) },
    { name: 'Paz\'s van', spawn: V(van.x - 4, van.z + 4), yaw: -Math.PI / 2, roof: area(van.x - 3, van.z, 3) },
  ];
  // Customs officers: along the fence inside, round the plane, by the hangar, and in the car park
  const patrolRoutes = [
    [[207, -50], [207, 50]],
    [[220, -38], [250, -38]],
    [[224, 18], [224, 66]],
    [[192, -30], [192, 80]],
  ];
  // Passengers walking from the plane to the gate and on into town (blend in with them)
  const crowdLanes = [
    { a: [230, -10], b: [204, -1.5] },
    { a: [204, 1.5], b: [178, 1.5] },
    { a: [178, -1.5], b: [204, -1.5] },
    { a: [196, 4], b: [230, 6] },
  ];
  return {
    ...city,
    groundLevel: true,
    spawn, checkpoints, clues: [], goalPos: new THREE.Vector3(van.x - 3, 0, van.z), patrolRoutes, crowdLanes,
    carrySpots, dropPos, dropLabel: 'Paz\'s van', dropCheckpoint: 1,
  };
}

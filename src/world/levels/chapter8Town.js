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
//
//  Chapters 9-12 come back here with different options (opts):
//    spawnAt / goalAt - named places: busStop, cabin, shop, station, office,
//                       hotel, shed, church, palace
//    meet             - { who: place } people to meet (default: Juno at the shop)
//    festival         - the Winter Festival: lanterns over every street, a
//                       big tree, the Ice Palace, a fireworks stage
//    lootSpots        - cash bags hidden round the festival (Chapter 11)
//    avalanche        - the route for the avalanche run (Chapter 10)
// ======================================================================

const BLOCKS = 4;
const PITCH = 55;
const C = (i) => (i - (BLOCKS - 1) / 2) * PITCH;   // block centre
const ST = (i) => C(i) + PITCH / 2;                // street centre (after block i)
const PAV = 22.3;                                   // pavement line from a block centre

export function buildChapter8Town(opts = {}) {
  const city = generateRooftopCity({ seed: 8080, blocks: BLOCKS, alpine: true });
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
    const c2 = new THREE.Mesh(new THREE.ConeGeometry(1.0 * s, 1.4 * s, 7), lambert(0xd2dae6)); c2.position.set(x, 3.9 * s + 0.6, z);
    g.add(t, c1, c2);
    w.addBlock(x, 0, z, 0.6, 2, 0.6, { tag: 'prop' });
  };
  for (let i = 0; i < BLOCKS - 1; i++) for (let j = 0; j < BLOCKS - 1; j++) pine(ST(i) + 5.5, ST(j) + 5.5, 0.9 + ((i + j) % 3) * 0.15);

  buildAlpineTown(city, g, w);

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
  box(hut.x, 2.6, hut.z, 3.4, 0.2, 3.4, 0xd2dae6, false);
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
    box(x, 1.9, z, along ? 2.3 : 1.6, 0.12, along ? 1.6 : 2.3, 0xd2dae6, false);
  };
  [[C(1) + 10, C(1) + 25.2, Math.PI / 2, 0x8a2a2a], [C(1) - 12, C(1) + 25.2, Math.PI / 2, 0x2a5a8a], [ST(2) + 3.2, C(1) - 8, 0, 0x3a3a3a],
    [C(2) - 6, C(2) - 25.2, Math.PI / 2, 0x6a8a3a], [C(3) - 10, C(3) + 25.2, Math.PI / 2, 0xc8a040], [ST(1) - 3.2, C(2) + 10, 0, 0xd8d8d8]]
    .forEach(([x, z, h, c]) => car(x, z, h, c));

  // --- More places in town (Chapters 9-12)
  const hotel = { x: C(2), z: C(2) + PAV };
  sign('SUMMIT HOTEL', hotel.x, 4.4, C(2) + 21.05, 0, '#ffd070', 6);
  const shed = { x: C(0), z: C(3) + PAV };
  sign('SNOWMOBILE HIRE', shed.x, 4.2, C(3) + 21.05, 0, '#39e6ff', 6);
  for (const dx of [-3, 0, 3]) box(shed.x + dx, 0, shed.z + 1.2, 1.1, 0.9, 2.4, [0xff9f1a, 0xc0182a, 0x1f5fd1][dx / 3 + 1]); // snowmobiles out front
  const church = { x: C(0), z: C(0) - PAV };
  sign('ST. ANNA', church.x, 5.2, C(0) - 21.05, Math.PI, '#9fd4ff', 4);
  const palace = { x: ST(1), z: ST(1) };
  // Covered porches: shelter from a helicopter's searchlight (hide under them)
  const hideSpots = [];
  const porch = (x, z) => {
    for (const [dx, dz] of [[-1.3, -1.1], [1.3, -1.1], [-1.3, 1.1], [1.3, 1.1]]) box(x + dx, 0, z + dz, 0.18, 2.6, 0.18, 0x4a3222, false);
    box(x, 2.6, z, 3.2, 0.25, 2.8, 0x4a3222);
    box(x, 2.85, z, 3.4, 0.2, 3, 0xd2dae6, false);
    hideSpots.push(new THREE.Vector3(x, 0.05, z));
  };
  porch(ST(0) - 3.5, C(1) - 12); porch(C(1) + 14, ST(1) + 3.5); porch(ST(2) + 3.5, C(2) + 12); porch(C(2) - 12, ST(2) - 3.5);

  const places = {
    busStop: { pos: spawn, yaw: Math.PI },
    cabin: { pos: new THREE.Vector3(cabin.x - 6, 0.05, cabin.z), yaw: -Math.PI / 2 },
    shop: { pos: new THREE.Vector3(shop.x - 5, 0.05, shop.z), yaw: -Math.PI / 2 },
    station: { pos: new THREE.Vector3(station.x - 0.5, 0.05, station.z + 6), yaw: Math.PI },
    office: { pos: new THREE.Vector3(office.x, 0.05, office.z), yaw: 0 },
    hotel: { pos: new THREE.Vector3(hotel.x, 0.05, hotel.z + 0.4), yaw: 0 },
    shed: { pos: new THREE.Vector3(shed.x + 6, 0.05, shed.z), yaw: Math.PI / 2 },
    church: { pos: new THREE.Vector3(church.x, 0.05, church.z - 0.4), yaw: Math.PI },
    palace: { pos: new THREE.Vector3(palace.x + 6, 0.05, palace.z + 6), yaw: 0 },
  };
  const place = (name) => places[name] || places.busStop;

  const meetingSpots = {};
  for (const [who, where] of Object.entries(opts.meet || { juno: 'shopFront' })) {
    meetingSpots[who] = where === 'shopFront' ? new THREE.Vector3(shop.x + 2, 0.05, shop.z) : place(where).pos.clone().add(new THREE.Vector3(2, 0, 0));
  }
  const reconSpots = {
    station: new THREE.Vector3(station.x - 0.5, 0.05, station.z + 4),
    hut: new THREE.Vector3(hut.x - 3, 0.05, hut.z),
    office: new THREE.Vector3(office.x, 0.05, office.z),
    palace: new THREE.Vector3(palace.x + 5.5, 0.05, palace.z),
    stage: new THREE.Vector3(ST(2) - 5, 0.05, ST(2)),
    van: new THREE.Vector3(C(2) - 6, 0.05, C(2) - 21.5),
  };
  if (opts.festival) buildFestival(g, w, box, sign);

  const area = (x, z, r = 5) => ({ minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r, h: 0 });
  const start = place(opts.spawnAt || 'busStop');
  const checkpoints = opts.spawnAt || opts.goalAt
    ? [{ name: 'Start', spawn: start.pos.clone(), yaw: start.yaw, roof: area(start.pos.x, start.pos.z) },
      ...(opts.checkpoints || []).map(([name, x, z, yaw]) => ({ name, spawn: new THREE.Vector3(x, 0.05, z), yaw, roof: area(x, z, 6) }))]
    : [
      { name: 'The bus stop', spawn: spawn.clone(), yaw: Math.PI, roof: area(spawn.x, spawn.z) },
      { name: 'The ski hire shop', spawn: new THREE.Vector3(shop.x - 5, 0.05, shop.z), yaw: -Math.PI / 2, roof: area(shop.x, shop.z, 6) },
    ];
  const goal = opts.goalAt ? place(opts.goalAt).pos.clone().setY(0) : goalPos;
  // Cash bags hidden round the festival (the streets between the blocks)
  const lootSpots = {
    a: new THREE.Vector3(ST(0), 0.05, C(0) + 4), b: new THREE.Vector3(ST(1) + 3, 0.05, C(2) + 6), c: new THREE.Vector3(ST(2), 0.05, C(3) - 5),
    d: new THREE.Vector3(C(1) - 6, 0.05, ST(2) + 3), e: new THREE.Vector3(C(3), 0.05, ST(0)), f: new THREE.Vector3(C(0) + 8, 0.05, ST(1) - 2),
  };
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
    spawn, checkpoints, clues: [], goalPos: goal, meetingSpots, reconSpots, patrolRoutes, crowdLanes, lootSpots, hideSpots,
    meetingCheckpoint: opts.meet ? {} : { juno: 1 },
    heliStart: new THREE.Vector3(0, 0, -150),
    places: Object.fromEntries(Object.entries(places).map(([k, v]) => [k, v.pos.clone()])),
    fireworksAt: new THREE.Vector3(ST(2), 0, ST(2)),
  };
}

// ----------------------------------------------------------------------
//  A mountain town, not the city with snow on it: pitched snowy roofs and
//  chimneys on every chalet, snow on the ground, drifts along the kerbs,
//  a pine forest round the edge of town, mountains all round the valley,
//  and the Glacier Bank's cable car climbing the big peak.
// ----------------------------------------------------------------------
function buildAlpineTown(city, g, w) {
  const SNOW = 0xd2dae6; // (a soft blue-grey white: pure white snow is blinding in daylight)
  const snowMat = new THREE.MeshLambertMaterial({ color: SNOW });
  const woodMat = new THREE.MeshLambertMaterial({ color: 0x4a3222 });
  const stoneMat = new THREE.MeshLambertMaterial({ color: 0x6a6660 });
  let seed = 8;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

  // --- Pitched roofs (one merged mesh), wooden eaves, chimneys
  city.chimneys = []; // chimney tops [x, y, z]: they smoke (onFootState)
  const tri = [];
  const quad = (a, b, c, d) => tri.push(...a, ...b, ...c, ...a, ...c, ...d);
  const eaves = [];
  for (const b of city.buildings) {
    const o = 0.7, x0 = b.minX - o, x1 = b.maxX + o, z0 = b.minZ - o, z1 = b.maxZ + o, h = b.h;
    const alongX = (b.maxX - b.minX) >= (b.maxZ - b.minZ);
    const span = alongX ? b.maxZ - b.minZ : b.maxX - b.minX;
    const rise = Math.min(5, span * 0.38);
    const top = h + rise;
    if (alongX) {
      const zc = (z0 + z1) / 2;
      quad([x0, h, z1], [x1, h, z1], [x1, top, zc], [x0, top, zc]);   // south slope
      quad([x1, h, z0], [x0, h, z0], [x0, top, zc], [x1, top, zc]);   // north slope
      tri.push(x0, h, z0, x0, h, z1, x0, top, zc, x1, h, z1, x1, h, z0, x1, top, zc); // gable ends
    } else {
      const xc = (x0 + x1) / 2;
      quad([x1, h, z1], [x1, h, z0], [xc, top, z0], [xc, top, z1]);
      quad([x0, h, z0], [x0, h, z1], [xc, top, z1], [xc, top, z0]);
      tri.push(x0, h, z1, x1, h, z1, xc, top, z1, x1, h, z0, x0, h, z0, xc, top, z0);
    }
    eaves.push([x0, z0, x1, z1, h]);
    // stepped collision under the slopes (nobody stands inside a roof)
    for (let k = 0; k < 3; k++) {
      const f = (k + 1) / 4, y0 = h + rise * (k / 3), y1 = h + rise * ((k + 1) / 3);
      if (alongX) w.addBox(b.minX, y0, b.minZ + span * f / 2, b.maxX, y1, b.maxZ - span * f / 2, { tag: 'building' });
      else w.addBox(b.minX + span * f / 2, y0, b.minZ, b.maxX - span * f / 2, y1, b.maxZ, { tag: 'building' });
    }
    // a stone chimney on most houses
    if (rnd() < 0.7) {
      const cx = alongX ? x0 + (x1 - x0) * (0.25 + rnd() * 0.5) : (x0 + x1) / 2 + span * 0.18;
      const cz = alongX ? (z0 + z1) / 2 + span * 0.18 : z0 + (z1 - z0) * (0.25 + rnd() * 0.5);
      const ch = new THREE.Mesh(new THREE.BoxGeometry(1, rise + 1.4, 1), stoneMat);
      ch.position.set(cx, h + (rise + 1.4) / 2, cz);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.25, 1.25), snowMat);
      cap.position.set(cx, h + rise + 1.5, cz);
      g.add(ch, cap);
      city.chimneys.push([cx, h + rise + 1.6, cz]);
    }
  }
  const roofGeo = new THREE.BufferGeometry();
  roofGeo.setAttribute('position', new THREE.Float32BufferAttribute(tri, 3));
  roofGeo.computeVertexNormals();
  const roofs = new THREE.Mesh(roofGeo, new THREE.MeshLambertMaterial({ color: SNOW, side: THREE.DoubleSide }));
  roofs.castShadow = roofs.receiveShadow = true;
  g.add(roofs);
  const eaveMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), woodMat, eaves.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  eaves.forEach(([x0, z0, x1, z1, h], i) => eaveMesh.setMatrixAt(i, m4.compose(v.set((x0 + x1) / 2, h - 0.15, (z0 + z1) / 2), q, sc.set(x1 - x0, 0.3, z1 - z0))));
  g.add(eaveMesh);

  // --- Snow on the ground (the roads keep a little of their colour: tyre tracks)
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshLambertMaterial({ color: 0xc4cedc, transparent: true, opacity: 0.66 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.012;
  ground.receiveShadow = true;
  g.add(ground);
  const field = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), new THREE.MeshLambertMaterial({ color: 0xc4cedc }));
  field.rotation.x = -Math.PI / 2;
  field.position.y = -0.02;
  g.add(field);

  // --- Snowdrifts along the kerbs (between the junctions)
  const drifts = [];
  for (let i = 0; i < BLOCKS; i++) {
    for (let j = 0; j < BLOCKS; j++) {
      for (const side of [-1, 1]) {
        for (let t = -16; t <= 16; t += 8) {
          drifts.push([C(i) + t + rnd() * 3, C(j) + side * 23.6, true]);
          drifts.push([C(i) + side * 23.6, C(j) + t + rnd() * 3, false]);
        }
      }
    }
  }
  const driftMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 6), snowMat, drifts.length);
  drifts.forEach(([x, z, alongX], i) => {
    const len = 2 + rnd() * 2.5;
    driftMesh.setMatrixAt(i, m4.compose(v.set(x, 0, z), q, sc.set(alongX ? len : 0.9, 0.45 + rnd() * 0.25, alongX ? 0.9 : len)));
  });
  g.add(driftMesh);

  // --- A pine forest round the town
  const ext = ((BLOCKS - 1) / 2) * PITCH + PITCH / 2 + 12;
  const pines = [];
  for (let k = 0; k < 520; k++) {
    const x = (rnd() * 2 - 1) * 330, z = (rnd() * 2 - 1) * 330;
    if (Math.abs(x) < ext && Math.abs(z) < ext) continue;
    pines.push([x, z, 0.9 + rnd() * 1.4]);
  }
  const green = new THREE.InstancedMesh(new THREE.ConeGeometry(2.2, 7, 7), new THREE.MeshLambertMaterial({ color: 0x1f3d2c }), pines.length);
  const tips = new THREE.InstancedMesh(new THREE.ConeGeometry(1.2, 2.6, 7), snowMat, pines.length);
  pines.forEach(([x, z, s], i) => {
    green.setMatrixAt(i, m4.compose(v.set(x, 4.2 * s, z), q, sc.set(s, s, s)));
    tips.setMatrixAt(i, m4.compose(v.set(x, 7.2 * s, z), q, sc.set(s, s, s)));
  });
  g.add(green, tips);

  // --- Mountains all round the valley (not fogged: they're the view)
  const rock = new THREE.MeshLambertMaterial({ color: 0x7c889c, fog: false });
  const cap = new THREE.MeshLambertMaterial({ color: 0xdfe6f0, fog: false });
  const mountain = (x, z, r, h) => {
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), rock);
    m.position.set(x, h / 2 - 20, z);
    m.rotation.y = rnd() * 3;
    const c = new THREE.Mesh(new THREE.ConeGeometry(r * 0.48, h * 0.48, 7), cap);
    c.position.set(x, h - h * 0.24 - 20 + 0.5, z);
    c.rotation.y = m.rotation.y;
    g.add(m, c);
  };
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2 + rnd() * 0.2, r = 430 + rnd() * 120;
    mountain(Math.cos(a) * r, Math.sin(a) * r, 120 + rnd() * 80, 180 + rnd() * 140);
  }
  mountain(C(2) + 330, C(1) - 330, 220, 420); // the Glacier Bank's mountain (the cable car goes up it)

  // --- The cable car's pylons and cabins, climbing towards the summit
  const st = { x: C(2), z: C(1) };
  for (let t = 40; t < 300; t += 52) {
    const py = new THREE.Mesh(new THREE.BoxGeometry(0.8, t, 0.8), new THREE.MeshLambertMaterial({ color: 0x3a3e46 }));
    py.position.set(st.x + t, t / 2, st.z - t);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(3, 0.4, 0.4), py.material);
    arm.position.set(st.x + t, t + 0.2, st.z - t);
    arm.rotation.y = Math.PI / 4;
    g.add(py, arm);
  }
  for (let t = 70; t < 300; t += 75) {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2, 2), new THREE.MeshLambertMaterial({ color: 0xc8302a }));
    cab.position.set(st.x + t, t - 2.2, st.z - t);
    g.add(cab);
  }

  // --- Snowmen and a welcome sign
  const snowman = (x, z) => {
    for (const [y, r] of [[0.55, 0.6], [1.35, 0.42], [1.95, 0.28]]) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), snowMat);
      b.position.set(x, y, z);
      g.add(b);
    }
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.3, 6), new THREE.MeshLambertMaterial({ color: 0xff7a1a }));
    nose.rotation.x = Math.PI / 2;
    nose.position.set(x, 1.97, z + 0.32);
    g.add(nose);
    w.addBlock(x, 0, z, 1.1, 2.2, 1.1, { tag: 'prop' });
  };
  snowman(ST(0) - 5, ST(0) - 5);
  snowman(ST(1) + 5, ST(2) - 5);
  snowman(ST(2) - 5, ST(0) + 5);
  const welcome = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.6), new THREE.MeshBasicMaterial({ map: makeTextTexture('WELCOME TO FROSTVALE · 1,840 M', { color: '#7dff8a', bg: 'rgba(40,26,16,0.95)', width: 1024, height: 200, font: 'bold 96px "Bebas Neue", Impact, sans-serif' }), toneMapped: false, side: THREE.DoubleSide }));
  welcome.position.set(C(0) + 26.5, 3.4, C(1) - 14);
  welcome.rotation.y = Math.PI / 2;
  g.add(welcome);
  for (const dz of [-3.2, 3.2]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 4.2, 0.25), woodMat);
    post.position.set(C(0) + 26.5, 2.1, C(1) - 14 + dz);
    g.add(post);
  }
}

// ----------------------------------------------------------------------
//  The Winter Festival (Chapter 11): strings of coloured lanterns over
//  every street, a huge lit tree, the Ice Palace in the middle of town
//  (glowing blue ice blocks), and the stage the fireworks go up from.
// ----------------------------------------------------------------------
function buildFestival(g, w, box, sign) {
  const colors = [0xff4d6a, 0xffc040, 0x4dffa6, 0x39b8ff, 0xff8ad8];
  const lanterns = [];
  const ext = ((BLOCKS - 1) / 2) * PITCH + 20;
  for (let i = 0; i < BLOCKS - 1; i++) {
    for (let t = -ext; t <= ext; t += 1.7) {
      const sag = 5.6 - Math.abs(Math.sin(t / 7)) * 0.9; // (strung between poles, sagging a bit)
      lanterns.push([ST(i) - 3, sag, t], [ST(i) + 3, sag, t], [t, sag, ST(i) - 3], [t, sag, ST(i) + 3]); // (a string down each side of the street)
    }
  }
  const lm = new THREE.InstancedMesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshBasicMaterial({ toneMapped: false }), lanterns.length);
  const m4 = new THREE.Matrix4(), c = new THREE.Color();
  lanterns.forEach(([x, y, z], k) => { lm.setMatrixAt(k, m4.makeTranslation(x, y, z)); lm.setColorAt(k, c.setHex(colors[k % colors.length]).multiplyScalar(1.6)); });
  g.add(lm);
  // The big tree, with lights spiralling up it
  const tx = ST(2), tz = ST(0);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 2, 8), new THREE.MeshLambertMaterial({ color: 0x3a2a1c }));
  trunk.position.set(tx, 1, tz);
  g.add(trunk);
  for (const [r, h, y] of [[4, 6, 4], [3, 5, 7.5], [1.8, 4, 10.5]]) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 9), new THREE.MeshLambertMaterial({ color: 0x1d4a2c }));
    cone.position.set(tx, y, tz);
    g.add(cone);
  }
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.6), new THREE.MeshBasicMaterial({ color: 0xffd040, toneMapped: false }));
  star.position.set(tx, 13, tz);
  g.add(star);
  const tl = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 6, 4), new THREE.MeshBasicMaterial({ toneMapped: false }), 60);
  for (let k = 0; k < 60; k++) {
    const f = k / 60, a = f * Math.PI * 10, y = 2.2 + f * 10, r = 4 * (1 - f) + 0.4;
    tl.setMatrixAt(k, m4.makeTranslation(tx + Math.cos(a) * r, y, tz + Math.sin(a) * r));
    tl.setColorAt(k, c.setHex(colors[k % colors.length]).multiplyScalar(1.6));
  }
  g.add(tl);
  w.addBlock(tx, 0, tz, 1, 3, 1, { tag: 'prop' });
  // The Ice Palace: blue glowing ice blocks and towers in the middle of town
  const ice = new THREE.MeshLambertMaterial({ color: 0x9fd4ff, emissive: 0x2a6aa8, emissiveIntensity: 0.6, transparent: true, opacity: 0.88 });
  const px = ST(1), pz = ST(1);
  const iceBlock = (x, y, z, sx, sy, sz) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), ice);
    m.position.set(x, y + sy / 2, z);
    g.add(m);
    w.addBlock(x, y, z, sx, sy, sz, { tag: 'prop' });
  };
  iceBlock(px, 0, pz - 3, 6, 3, 0.8); iceBlock(px, 0, pz + 3, 6, 3, 0.8); iceBlock(px - 3, 0, pz, 0.8, 3, 6);
  iceBlock(px + 3, 0, pz - 2.2, 0.8, 3, 1.6); iceBlock(px + 3, 0, pz + 2.2, 0.8, 3, 1.6); // (the gate faces east)
  for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) {
    iceBlock(px + dx, 0, pz + dz, 1.4, 5, 1.4);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.6, 6), ice);
    cap.position.set(px + dx, 5.8, pz + dz);
    g.add(cap);
  }
  sign('ICE PALACE', px + 3.45, 3.6, pz, Math.PI / 2, '#9fd4ff', 4);
  // The fireworks stage: a platform with rocket tubes
  const sx = ST(2), sz = ST(2);
  box(sx, 0, sz, 4, 0.6, 4, 0x3a3e46);
  for (let k = 0; k < 6; k++) box(sx - 1.2 + (k % 3) * 1.2, 0.6, sz - 0.6 + Math.floor(k / 3) * 1.2, 0.3, 1.2, 0.3, 0xc0182a, false);
  sign('FIREWORKS · STAND BACK', sx, 2.6, sz - 2.05, Math.PI, '#ffc040', 4);
}

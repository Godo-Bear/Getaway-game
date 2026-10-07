import * as THREE from 'three';
import { CollisionWorld } from '../../core/collision.js';
import { makeTextTexture, makeGlowMaterial } from '../materials.js';
import { buildPalms } from '../palms.js';
import { makeRng } from '../../core/utils.js';

// ======================================================================
//  Chapter 15, Part 1: the Festa de São Sereno, at night.
//
//  Rua Alta, the old town's main street, runs from the harbour (south, +Z)
//  to the cathedral square (north, -Z). The parade comes up the middle of
//  it: a band float, the golden galleon (Varga's money is in its chest) and
//  a giant fish, with dancers in big carnival heads all round. Crowds watch
//  from the pavements behind barriers; police walk the pavements.
//
//      z = -160  CATHEDRAL ─ bell tower
//                square ............ FUNICULAR station (east) ◄ goal
//      z = -112  ────────┐       ┌────────
//                 houses │ road  │ houses     lantern strings across
//                        │ x±6   │            the street every 12 m
//      z =  125  ────────┘       └────────
//                       the harbour (where the parade starts)
// ======================================================================

export const ROAD = 6, WALK = 9.5;

export function buildChapter15Festival() {
  const group = new THREE.Group();
  const world = new CollisionWorld(8);
  const rng = makeRng(1515);
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
  const M = {
    road: mat(0x4a4540), cobble: mat(0x6a6258), stone: mat(0xb8ab94), white: mat(0xe8e4dc), dark: mat(0x1c1e22),
    wood: mat(0x6a4a2a), gold: mat(0xd8a830, { metalness: 0.7, roughness: 0.3 }), red: mat(0xa81c2a), barrier: mat(0xc8ccd4, { metalness: 0.5, roughness: 0.4 }),
    roof: mat(0xb0503a),
  };
  const block = (x, y, z, w, h, d, material, solid = true, tag = 'wall') => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y + h / 2, z);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    if (solid) world.addBlock(x, y, z, w, h, d, { tag });
    return m;
  };
  const box = (x0, z0, x1, z1, h, material, y = 0, solid = true, tag) => block((x0 + x1) / 2, y, (z0 + z1) / 2, x1 - x0, h, z1 - z0, material, solid, tag);

  // ------------------------------------------------------------------ the ground
  box(-60, -175, 60, 150, 1, M.cobble, -1, true, 'roof');
  const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD * 2, 240), M.road);
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.01, 6);
  group.add(road);
  // a painted line of petals down the middle of the road (the parade route)
  const petals = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 236), new THREE.MeshBasicMaterial({ color: 0xd8344e }));
  petals.rotation.x = -Math.PI / 2;
  petals.position.set(0, 0.02, 6);
  group.add(petals);

  // ------------------------------------------------------------------ the houses along Rua Alta
  const TINTS = [0xf0e0c0, 0xe8c8a0, 0xd88a6a, 0xf0d070, 0xe8e4dc, 0x9ac0d8, 0xe8a8a0, 0xc8d8a0, 0xf0b8a0];
  const winMat = new THREE.MeshStandardMaterial({ color: 0x3a2a10, emissive: 0xffc870, emissiveIntensity: 0.9, roughness: 0.4 });
  const winDark = new THREE.MeshStandardMaterial({ color: 0x14100a, roughness: 0.6 });
  const windows = [];
  const flagCols = [0xc0283a, 0x2f8a4c, 0xe8c040, 0x3a6ea8, 0xe87ab0];
  const sideStreets = [[34, 46], [-46, -34]]; // z ranges with no houses (side streets)
  for (const sx of [-1, 1]) {
    let z = 125;
    while (z > -112) {
      const len = 10 + rng() * 7;
      const z1 = Math.max(-112, z - len);
      const side = sideStreets.find(([a, b]) => z1 < b && z > a);
      if (side) { z = side[0]; continue; }
      const h = 9 + Math.floor(rng() * 3) * 3;
      const x0 = sx * WALK, x1 = sx * 26;
      const b = box(Math.min(x0, x1), z1, Math.max(x0, x1), z, h, mat(TINTS[Math.floor(rng() * TINTS.length)]));
      b.userData.house = true;
      // a terracotta roof edge, windows on each floor, a balcony with a flag
      box(Math.min(x0, x1) - 0.2, z1 - 0.2, Math.max(x0, x1) + 0.2, z + 0.2, 0.5, M.roof, h, false);
      for (let fy = 1; fy * 3 < h - 1; fy++) {
        for (let wz = z1 + 2; wz < z - 1.5; wz += 3) {
          const lit = rng() < 0.75;
          const w = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.6), lit ? winMat : winDark);
          w.position.set(sx * (WALK - 0.02), fy * 3 + 0.6, wz);
          w.rotation.y = -sx * Math.PI / 2;
          group.add(w);
          if (lit) windows.push(w);
        }
      }
      const bz = (z + z1) / 2;
      block(sx * (WALK - 0.5), 4, bz, 1, 0.15, 3, M.stone, false);
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.2), new THREE.MeshStandardMaterial({ color: flagCols[Math.floor(rng() * flagCols.length)], side: THREE.DoubleSide }));
      fl.position.set(sx * (WALK - 0.35), 3, bz);
      fl.rotation.y = Math.PI / 2;
      group.add(fl);
      z = z1;
    }
  }
  // the side streets end in walls (the old town is a maze: this way's the square)
  for (const sx of [-1, 1]) for (const [a, b] of sideStreets) box(sx > 0 ? 26 : -30, a, sx > 0 ? 30 : -26, b, 6, M.stone);
  // the harbour end: a sea wall, the sea, a few palms
  box(-30, 140, 30, 141, 1.1, M.stone);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(800, 300), new THREE.MeshStandardMaterial({ color: 0x0a1c2a, roughness: 0.25, metalness: 0.35 }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -2, 300);
  group.add(sea);
  group.add(buildPalms([[-20, 0, 132, 1], [20, 0, 132, 1.1], [-12, 0, 136, 0.9], [12, 0, 136, 1]]));

  // ------------------------------------------------------------------ crowd barriers and street lamps
  for (const sx of [-1, 1]) {
    for (let z = 110; z > -104; z -= 30) {
      const z1 = z - 26;  // (a 4 m gap every 30 m)
      box(sx * ROAD - 0.08, z1, sx * ROAD + 0.08, z, 1.0, M.barrier, 0, true, 'prop');
    }
    for (let z = 116; z > -110; z -= 16) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 4.2, 6), M.dark);
      pole.position.set(sx * (WALK - 0.6), 2.1, z);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe0a0 }));
      lamp.position.set(sx * (WALK - 0.6), 4.3, z);
      const glow = new THREE.Mesh(new THREE.SphereGeometry(1.4, 8, 6), makeGlowMaterial(0xffc870, 0.2));
      glow.position.copy(lamp.position);
      group.add(pole, lamp, glow);
      windows.push(lamp, glow);
    }
  }

  // ------------------------------------------------------------------ strings of lanterns across the street
  const bulbGeo = new THREE.SphereGeometry(0.16, 8, 6);
  const strings = [];
  for (let z = 112; z > -108; z -= 12) strings.push(z);
  const perString = 15;
  const lanterns = new THREE.InstancedMesh(bulbGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), strings.length * perString);
  const o = new THREE.Object3D(), col = new THREE.Color();
  const LCOLS = [0xff4a5a, 0xffd040, 0x4dffa6, 0x5ab4ff, 0xff7ad8, 0xffa040];
  let n = 0;
  for (const z of strings) {
    for (let i = 0; i < perString; i++) {
      const t = i / (perString - 1);
      const x = -WALK + t * WALK * 2;
      const y = 7.2 - Math.sin(t * Math.PI) * 1.4;
      o.position.set(x, y, z);
      o.updateMatrix();
      lanterns.setMatrixAt(n, o.matrix);
      lanterns.setColorAt(n, col.setHex(LCOLS[(i + Math.round(z)) % LCOLS.length]));
      n++;
    }
  }
  group.add(lanterns);

  // ------------------------------------------------------------------ the cathedral square
  const SQ = { z0: -170, z1: -112 };
  // houses round the square (west and east sides), leaving the funicular station
  box(-60, -170, -26, -112, 12, mat(0xe8c8a0));
  box(26, -112, 60, -126, 12, mat(0xf0e0c0));
  box(46, -156, 60, -126, 12, mat(0xd88a6a));
  box(26, -170, 60, -156, 12, mat(0xe8e4dc));
  // the cathedral, with its bell tower and lit rose window
  box(-22, -175, 22, -162, 20, M.stone);
  block(-17, 0, -168, 8, 36, 8, M.stone);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(5.2, 10, 4), M.roof);
  spire.position.set(-17, 41, -168);
  spire.rotation.y = Math.PI / 4;
  group.add(spire);
  const rose = new THREE.Mesh(new THREE.CircleGeometry(3.2, 24), new THREE.MeshStandardMaterial({ color: 0x3a1020, emissive: 0xff8a3a, emissiveIntensity: 0.9 }));
  rose.position.set(2, 13, -161.95);
  group.add(rose);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(5, 7), new THREE.MeshStandardMaterial({ color: 0x2a1a0a, emissive: 0x6a3a10, emissiveIntensity: 0.6 }));
  door.position.set(2, 3.5, -161.95);
  group.add(door);
  // a fountain in the middle of the square (cover)
  const fount = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.2, 0.9, 20), M.stone);
  fount.position.set(-6, 0.45, -138);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.7, 0.05, 20), new THREE.MeshStandardMaterial({ color: 0x1aa0c8, emissive: 0x0a5a7a }));
  water.position.set(-6, 0.86, -138);
  const fcol = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 2.6, 10), M.stone);
  fcol.position.set(-6, 1.3, -138);
  group.add(fount, water, fcol);
  world.addBlock(-6, 0, -138, 5.8, 0.9, 5.8, { tag: 'prop' });
  world.addBlock(-6, 0, -138, 1, 2.6, 1, { tag: 'prop' });
  // the funicular's bottom station (east side of the square): the way out
  box(36, -156, 46, -126, 0.4, M.stone);
  const stTex = makeTextTexture('FUNICULAR', { color: '#ffd070', width: 512, height: 96, font: 'bold 64px "Bebas Neue", Impact, sans-serif' });
  const st = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.3), new THREE.MeshBasicMaterial({ map: stTex, transparent: true }));
  st.position.set(35.9, 5.5, -141);
  st.rotation.y = -Math.PI / 2;
  group.add(st);
  box(36, -156, 36.6, -144, 5, M.white); box(36, -138, 36.6, -126, 5, M.white); box(36, -144, 36.6, -138, 1.2, M.white, 3.8);
  box(36, -156, 46, -155.4, 5, M.white); box(36, -126.6, 46, -126, 5, M.white);
  box(35.8, -157, 46.4, -125, 0.4, M.roof, 5);
  const goal = new THREE.Vector3(40, 0.4, -141);
  const goalGlow = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.1, 32), makeGlowMaterial(0x4dffa6, 0.85));
  goalGlow.rotation.x = -Math.PI / 2;
  goalGlow.position.set(goal.x, 0.45, goal.z);
  const goalBeam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 40, 16, 1, true), makeGlowMaterial(0x4dffa6, 0.15));
  goalBeam.position.set(goal.x, 20, goal.z);
  group.add(goalGlow, goalBeam);
  // the square's own strings of lights
  const sqLights = new THREE.InstancedMesh(bulbGeo, new THREE.MeshBasicMaterial({ color: 0xffe0a0 }), 60);
  n = 0;
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    o.position.set(-6 + Math.cos(a) * 16, 6.5 - Math.abs(Math.sin(a * 3)) * 1.2, -138 + Math.sin(a) * 16);
    o.updateMatrix();
    sqLights.setMatrixAt(n++, o.matrix);
  }
  group.add(sqLights);

  // ------------------------------------------------------------------ the floats (the mode moves them)
  const gold = M.gold;
  const floats = [];
  // The band float (front of the parade)
  {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(4, 1.2, 8), mat(0x2f8a4c));
    base.position.y = 0.6;
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.3, 8.2), gold);
    skirt.position.y = 1.15;
    g.add(base, skirt);
    for (const [x, z] of [[-1, -2], [1, -2], [0, 1.5]]) {
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.7, 14), mat(0xc0283a));
      drum.position.set(x, 1.55, z);
      g.add(drum);
    }
    const arch = new THREE.Mesh(new THREE.TorusGeometry(2, 0.12, 6, 20, Math.PI), gold);
    arch.position.set(0, 1.2, 3.6);
    g.add(arch);
    floats.push({ id: 'band', group: g, boxes: [[-2, 0, -4, 2, 1.2, 4]], start: 40, end: -126, players: [[-1, 1.2, -1.2], [1, 1.2, -1.2], [0, 1.2, 2.4]] });
  }
  // The golden galleon: Varga's money is in the chest by the mast
  {
    const g = new THREE.Group();
    const hullShape = new THREE.Shape();
    [[-2.3, 5.5], [2.3, 5.5], [2.3, -3.5], [1.2, -5.8], [0, -6.4], [-1.2, -5.8], [-2.3, -3.5]].forEach(([x, z], i) => (i ? hullShape.lineTo(x, -z) : hullShape.moveTo(x, -z)));
    const hullGeo = new THREE.ExtrudeGeometry(hullShape, { depth: 2.2, bevelEnabled: false });
    hullGeo.rotateX(-Math.PI / 2);
    const hull = new THREE.Mesh(hullGeo, mat(0x6a3a1a, { roughness: 0.6 }));
    const trim = new THREE.Mesh(new THREE.BoxGeometry(4.7, 0.25, 11.2), gold);
    trim.position.set(0, 2.1, 0.1);
    g.add(hull, trim);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.06, 10.8), mat(0xa8784a));
    deck.position.set(0, 2.21, 0.1);
    g.add(deck);
    for (const [z0, z1] of [[-5.4, -3.6], [3.6, 5.5]]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1.0, z1 - z0), mat(0x8a4a22));
      c.position.set(0, 2.7, (z0 + z1) / 2);
      g.add(c);
    }
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 7.5, 8), M.wood);
    mast.position.set(0, 5.9, 0);
    g.add(mast);
    for (const [y, w, h] of [[8.0, 3.8, 2.6]]) { // (one sail, high up: it never gets in front of the camera)
      const sail = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 6, 2), new THREE.MeshStandardMaterial({ color: 0xf0e8d8, side: THREE.DoubleSide, roughness: 0.9 }));
      sail.position.set(0, y, -0.3);
      const p = sail.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) p.setZ(i, -Math.cos((p.getX(i) / w) * Math.PI) * 0.4);
      sail.geometry.computeVertexNormals();
      g.add(sail);
      const cross = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.04), mat(0xc0283a));
      cross.position.set(0, y, -0.1);
      g.add(cross);
    }
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.7), new THREE.MeshStandardMaterial({ color: 0xc0283a, side: THREE.DoubleSide }));
    flag.position.set(0.6, 9.9, 0);
    g.add(flag);
    // the chest (Varga's money), with a gold lock
    const chest = new THREE.Group();
    const cb = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.6, 0.7), mat(0x4a2a10));
    cb.position.y = 0.3;
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.0, 10, 1, false, 0, Math.PI), mat(0x5a3418));
    lid.rotation.z = Math.PI / 2;
    lid.position.y = 0.6;
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.06), gold);
    lock.position.set(0, 0.55, 0.37);
    chest.add(cb, lid, lock);
    chest.position.set(0, 2.22, 1.3);
    g.add(chest);
    // gold lanterns at the corners
    for (const [x, z] of [[-2.1, -3.4], [2.1, -3.4], [-2.1, 5.3], [2.1, 5.3]]) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd070 }));
      l.position.set(x, 3.6, z);
      const lg = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 6), makeGlowMaterial(0xffc040, 0.25));
      lg.position.copy(l.position);
      g.add(l, lg);
    }
    floats.push({
      id: 'galleon', group: g, start: 62, end: -104, chest: new THREE.Vector3(0, 2.2, 2.2),
      boxes: [[-2.3, 0, -5.5, 2.3, 2.2, 5.5], [-1.2, 0, -6.4, 1.2, 2.2, -5.5], [-2.25, 2.2, -5.4, 2.25, 3.2, -3.6], [-2.25, 2.2, 3.6, 2.25, 3.2, 5.5], [-0.2, 2.2, -0.2, 0.2, 9.5, 0.2], [-0.5, 2.2, 0.95, 0.5, 2.85, 1.65]],
      lookouts: [{ x: 0, y: 3.2, z: -4.5, face: 0 }, { x: 0, y: 3.2, z: 4.6, face: Math.PI }],
    });
  }
  // The giant fish (the back of the parade): you can climb on its base
  {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(4, 1.4, 8), mat(0x3a6ea8));
    base.position.y = 0.7;
    const waves = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.3, 8.2), mat(0xe8e8e8));
    waves.position.y = 1.35;
    const fish = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), mat(0x39b6e8, { roughness: 0.4, metalness: 0.3 }));
    fish.scale.set(1.2, 1.5, 3.2);
    fish.position.set(0, 3.2, 0);
    fish.rotation.x = -0.15;
    const tail = new THREE.Mesh(new THREE.ConeGeometry(1.4, 2, 4), mat(0x39b6e8));
    tail.rotation.x = -Math.PI / 2;
    tail.scale.set(0.3, 1, 1);
    tail.position.set(0, 3.8, 3.4);
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), mat(0xffffff));
      eye.position.set(sx * 0.9, 3.7, -2);
      const pup = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), mat(0x111111));
      pup.position.set(sx * 1.15, 3.7, -2.1);
      g.add(eye, pup);
    }
    g.add(base, waves, fish, tail);
    floats.push({ id: 'fish', group: g, boxes: [[-2, 0, -4, 2, 1.4, 4], [-1.2, 1.4, -3, 1.2, 4.6, 3]], start: 86, end: -80 });
  }
  for (const f of floats) group.add(f.group);

  // ------------------------------------------------------------------ people, police, places
  const V = (x, z, y = 0.05) => new THREE.Vector3(x, y, z);
  return {
    group, world, floats, windows, lanterns, sqLights, goal, goalGlow, goalBeam, square: SQ,
    crowdLanes: [
      { a: [-7.6, 116], b: [-7.6, -104] }, { a: [-8.6, 112], b: [-8.6, -100] },
      { a: [7.6, -104], b: [7.6, 116] }, { a: [8.6, -100], b: [8.6, 112] },
      { a: [-24, -118], b: [20, -118] },
    ],
    patrolRoutes: [
      [[-7.9, 96], [-7.9, 30]], [[7.9, 30], [7.9, 96]],
      [[-7.9, -20], [-7.9, -96]], [[7.9, -96], [7.9, -20]],
      [[12, -124], [30, -124], [30, -150], [12, -150]],
      [[-22, -128], [-2, -128], [-2, -152]],
    ],
    spawn: V(0, 112), checkpoints: [{ name: 'The harbour end of Rua Alta', spawn: V(0, 112), yaw: 0 }],
    buildings: [], ladders: [], hideSpots: [],
  };
}

import * as THREE from 'three';
import { CollisionWorld } from '../../core/collision.js';
import { makeGlowMaterial } from '../materials.js';
import { buildChapter14Ship } from './chapter14Ship.js';
import { makeRng } from '../../core/utils.js';

// ======================================================================
//  Chapter 14, Part 2: across the bay at night, in Paz's speedboat.
//
//  The sea is at y = 0 (boats drive on it like cars on a road).
//
//        ═════════ PORTO SERENO (the town's lights, north) ═════════
//          harbour ▓▓▓ breakwater + lighthouse     (police launches
//     CLIFFS                                        come out of here)
//     (west)        THE TEETH (a reef of rocks with
//      ║ sea cave    narrow gaps: your little boat fits
//      ║ ◄── goal    through, the big police launches don't)
//      ║                                   BELLA FORTUNA (you start
//      ║                                   alongside her, east)
//                       open sea (south)
// ======================================================================

export const BAY = 300; // the sea goes out to ±BAY

export function buildChapter14Bay() {
  const group = new THREE.Group();
  const world = new CollisionWorld(10);
  const rng = makeRng(1407);
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
  const M = {
    rock: mat(0x3a3530), rockDark: mat(0x2a2622), sand: mat(0x8a7a5a), stone: mat(0x7a7468),
    white: mat(0xe8e4dc), red: mat(0xa81c2a), dark: mat(0x1c1e22), wood: mat(0x6a4a2a),
  };
  const solid = (x, z, w, d, h = 8, y = -3) => world.addBlock(x, y, z, w, h, d, { tag: 'wall' });

  // ------------------------------------------------------------------ the sea
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400, 1, 1), new THREE.MeshStandardMaterial({ color: 0x0b2030, roughness: 0.22, metalness: 0.4 }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -0.05;
  group.add(sea);
  // the moon and its path on the water
  const moon = new THREE.Mesh(new THREE.CircleGeometry(18, 24), new THREE.MeshBasicMaterial({ color: 0xfff6dc, fog: false }));
  moon.position.set(-150, 160, 700);
  moon.lookAt(0, 0, 0);
  const moonGlow = new THREE.Mesh(new THREE.CircleGeometry(60, 24), makeGlowMaterial(0xfff0c8, 0.18));
  moonGlow.position.copy(moon.position).multiplyScalar(1.01);
  moonGlow.lookAt(0, 0, 0);
  group.add(moon, moonGlow);
  const moonPath = new THREE.Mesh(new THREE.PlaneGeometry(26, 900), makeGlowMaterial(0xfff0c8, 0.07));
  moonPath.rotation.x = -Math.PI / 2;
  moonPath.position.set(-75, 0.02, 300);
  moonPath.rotation.z = Math.atan2(-150, 700) * 0.6;
  group.add(moonPath);

  // ------------------------------------------------------------------ the town along the north shore
  const shoreZ = -240;
  const land = new THREE.Mesh(new THREE.BoxGeometry(900, 8, 220), M.stone);
  land.position.set(0, -2, shoreZ - 110);
  group.add(land);
  solid(0, shoreZ - 110, 900, 220, 14, -6);
  const winTex = (() => {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, 64, 64);
    for (let y = 4; y < 64; y += 16) for (let x = 4; x < 64; x += 12) { if (rng() < 0.55) { g.fillStyle = rng() < 0.7 ? '#ffd890' : '#ffeec8'; g.fillRect(x, y, 6, 8); } }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const TINTS = [0xf0e0c0, 0xe8c8a0, 0xd88a6a, 0xf0d070, 0xe8e4dc, 0x9ac0d8, 0xe8a8a0, 0xc8d8a0];
  for (let x = -280; x < 290; x += 11 + rng() * 6) {
    if (x > 40 && x < 90) continue; // (the harbour)
    for (const row of [0, 1]) {
      const w = 8 + rng() * 6, h = 6 + rng() * 10 + row * 8, d = 10;
      const tint = TINTS[Math.floor(rng() * TINTS.length)];
      const tex = winTex.clone();
      tex.needsUpdate = true;
      tex.repeat.set(Math.max(1, Math.round(w / 5)), Math.max(1, Math.round(h / 4)));
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: tint, roughness: 0.9, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.85 }));
      b.position.set(x, 2 + h / 2 + row * 3, shoreZ - 8 - row * 16);
      group.add(b);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.72, 3, 4), mat(0xb0503a));
      roof.position.set(x, 2 + h + row * 3 + 1.5, shoreZ - 8 - row * 16);
      roof.rotation.y = Math.PI / 4;
      group.add(roof);
    }
  }
  // street lamps along the seafront, with their reflections on the water
  for (let x = -270; x <= 270; x += 18) {
    if (x > 40 && x < 90) continue;
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffd890 }));
    lamp.position.set(x, 6, shoreZ + 1);
    const refl = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 26), makeGlowMaterial(0xffc870, 0.13));
    refl.rotation.x = -Math.PI / 2;
    refl.position.set(x, 0.03, shoreZ + 14);
    group.add(lamp, refl);
  }
  // the harbour: a breakwater with a lighthouse at the end, moored fishing boats
  for (const [x0, z0, x1, z1] of [[40, -240, 46, -160], [84, -240, 90, -175]]) {
    const bw = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 4, z1 - z0), M.stone);
    bw.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
    group.add(bw);
    solid((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0);
  }
  const lh = new THREE.Group();
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.2, 16, 12), M.white);
  tower.position.y = 8;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.95, 3, 12), M.red);
  band.position.y = 8;
  const top = new THREE.Mesh(new THREE.SphereGeometry(1.3, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff4c0 }));
  top.position.y = 17;
  const beam = new THREE.Mesh(new THREE.ConeGeometry(6, 70, 16, 1, true), makeGlowMaterial(0xfff4c0, 0.09));
  beam.rotation.z = Math.PI / 2;
  beam.position.set(35, 0, 0);
  const beamPivot = new THREE.Group();
  beamPivot.position.y = 17;
  beamPivot.add(beam);
  lh.add(tower, band, top, beamPivot);
  lh.position.set(43, 2, -160);
  group.add(lh);
  solid(43, -160, 5, 5, 20);
  for (const [x, z, r] of [[60, -225, 0.2], [70, -215, -0.1], [55, -205, 0.3], [-30, -232, 1.4], [120, -232, 1.6], [-110, -230, 1.5]]) {
    const fb = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3, 1.6, 9), mat([0x3a6ea8, 0xc0283a, 0x2f8a4c][Math.floor(rng() * 3)]));
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.8, 2.6), M.white);
    cab.position.set(0, 1.6, -1.5);
    fb.add(hull, cab);
    fb.position.set(x, 0.3, z);
    fb.rotation.y = r;
    group.add(fb);
    solid(x, z, 5, 9);
  }

  // ------------------------------------------------------------------ the cliffs (west) and the sea cave
  const CAVE = { x: -240, z: 60, w: 12 };
  const cliffX = -240;
  for (let z = -240; z < 260; z += 20) {
    if (z + 20 > CAVE.z - CAVE.w / 2 && z < CAVE.z + CAVE.w / 2) {
      // around the cave mouth: rock either side, an arch over the top
      const a0 = z, a1 = CAVE.z - CAVE.w / 2, b0 = CAVE.z + CAVE.w / 2, b1 = z + 20;
      for (const [z0, z1] of [[a0, a1], [b0, b1]]) {
        if (z1 - z0 < 0.5) continue;
        const r = new THREE.Mesh(new THREE.BoxGeometry(60, 40, z1 - z0), M.rock);
        r.position.set(cliffX - 30, 14, (z0 + z1) / 2);
        group.add(r);
        solid(cliffX - 30, (z0 + z1) / 2, 60, z1 - z0, 46, -6);
      }
      const arch = new THREE.Mesh(new THREE.BoxGeometry(60, 26, CAVE.w), M.rockDark);
      arch.position.set(cliffX - 30, 21, CAVE.z);
      group.add(arch);
      continue;
    }
    const h = 34 + rng() * 18;
    const r = new THREE.Mesh(new THREE.BoxGeometry(60 + rng() * 8, h, 20.5), rng() < 0.5 ? M.rock : M.rockDark);
    r.position.set(cliffX - 30 - rng() * 4, h / 2 - 6, z + 10);
    group.add(r);
    solid(cliffX - 30, z + 10, 60, 20, h + 6, -6);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(14 + rng() * 6, 10 + rng() * 10, 6), M.rockDark);
    cap.position.set(cliffX - 34, h - 6 + 4, z + 10);
    group.add(cap);
  }
  // inside the cave: a dark channel to a grotto, with lanterns and a jetty
  const caveFloor = new THREE.Mesh(new THREE.BoxGeometry(56, 1, CAVE.w + 18), mat(0x0a1418));
  caveFloor.position.set(cliffX - 30, -0.6, CAVE.z);
  group.add(caveFloor);
  for (const sz of [-1, 1]) solid(cliffX - 40, CAVE.z + sz * (CAVE.w / 2 + 6), 40, 8, 30, -6); // the grotto's walls (inside)
  solid(cliffX - 62, CAVE.z, 6, CAVE.w + 4, 30, -6);
  const jetty = new THREE.Mesh(new THREE.BoxGeometry(14, 0.6, 3), M.wood);
  jetty.position.set(cliffX - 48, 0.6, CAVE.z + 4);
  group.add(jetty);
  const caveGlow = [];
  for (const dx of [-14, -26, -40]) {
    const lant = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffb050 }));
    lant.position.set(cliffX + dx, 3.5, CAVE.z + (dx % 2 ? 4 : -4));
    const g = new THREE.Mesh(new THREE.SphereGeometry(2.4, 8, 6), makeGlowMaterial(0xffa040, 0.25));
    g.position.copy(lant.position);
    group.add(lant, g);
    caveGlow.push(g);
  }
  const caveLight = new THREE.PointLight(0xffa040, 14, 40, 1.6);
  caveLight.position.set(cliffX - 30, 6, CAVE.z);
  group.add(caveLight);
  const goalGlow = new THREE.Mesh(new THREE.RingGeometry(5, 6, 40), makeGlowMaterial(0x4dffa6, 0.8));
  goalGlow.rotation.x = -Math.PI / 2;
  goalGlow.position.set(cliffX - 6, 0.06, CAVE.z);
  const goalBeam = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 60, 16, 1, true), makeGlowMaterial(0x4dffa6, 0.14));
  goalBeam.position.set(cliffX + 4, 30, CAVE.z);
  group.add(goalGlow, goalBeam);

  // ------------------------------------------------------------------ THE TEETH: a reef with narrow gaps
  // A wall of rocks from z = -150 to z = 170 at x ≈ -140, curving a little.
  // Gaps every so often are 5 m wide: room for the speedboat, not a launch.
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rocks = [];
  const addRock = (x, z, s, hgt = 1) => {
    const m = new THREE.Mesh(rockGeo, rng() < 0.5 ? M.rock : M.rockDark);
    m.position.set(x, s * 0.25 * hgt, z);
    m.scale.set(s * 0.62, s * 0.55 * hgt, s * 0.62);
    m.rotation.set(rng() * 3, rng() * 3, rng() * 3);
    group.add(m);
    solid(x, z, s * 0.95, s * 0.95);
    rocks.push({ x, z, r: s * 0.5 });
  };
  const gaps = [];
  let z = -150;
  let gapIn = 22 + rng() * 18;
  while (z < 170) {
    const x = -140 + Math.sin(z / 60) * 14;
    if (gapIn <= 0) {
      gaps.push(new THREE.Vector3(x, 0, z + 2.5));
      z += 5.2;          // the gap
      gapIn = 26 + rng() * 22;
      continue;
    }
    const s = 4 + rng() * 2.5;
    addRock(x + (rng() - 0.5) * 2, z + s * 0.5, s, 1 + rng() * 0.8);
    z += s * 0.85;
    gapIn -= s * 0.85;
  }
  // more rocks and little islands scattered over the bay
  for (let i = 0; i < 40; i++) {
    const x = -220 + rng() * 460, zz = -190 + rng() * 460;
    if (Math.hypot(x - 60, zz - 60) < 70) continue;   // (clear of the ship)
    if (Math.abs(x + 140) < 20) continue;             // (clear of the reef line)
    if (x < -200 && Math.abs(zz - CAVE.z) < 40) continue; // (clear of the cave mouth)
    addRock(x, zz, 3 + rng() * 6, 0.8 + rng());
  }
  // red and green channel buoys, bobbing (the mode bobs them)
  const buoys = [];
  for (const [x, zz, c] of [[30, -120, 0xff3030], [55, -120, 0x30ff60], [10, -60, 0xff3030], [-60, 0, 0x30ff60], [-180, 40, 0xff3030], [-180, 80, 0x30ff60], [-100, -100, 0xff3030], [-80, 140, 0x30ff60]]) {
    const b = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 2, 8), mat(c === 0xff3030 ? 0xa81c2a : 0x1f6a3a));
    body.position.y = 0.6;
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 4), new THREE.MeshBasicMaterial({ color: c }));
    light.position.y = 1.8;
    const glow = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 6), makeGlowMaterial(c, 0.3));
    glow.position.y = 1.8;
    b.add(body, light, glow);
    b.position.set(x, 0, zz);
    group.add(b);
    solid(x, zz, 1.2, 1.2, 5);
    buoys.push(b);
  }

  // ------------------------------------------------------------------ the Bella Fortuna, anchored (where you start)
  const ship = buildChapter14Ship({ distant: true });
  ship.group.position.set(60, 8, 60);
  group.add(ship.group);
  solid(60, 60 - 11, 26, 120, 14, -6);  // (the hull, roughly)
  solid(60, -16, 14, 24, 14, -6);       // (the bow)
  // the edge of the bay: soft walls far out (the mode turns you back before them)

  const V = (x, zz) => new THREE.Vector3(x, 0, zz);
  return {
    group, world, rocks, gaps, buoys, beamPivot, caveGlow, goalGlow, goalBeam,
    cave: { x: cliffX, z: CAVE.z, w: CAVE.w, inside: V(cliffX - 30, CAVE.z) },
    harbour: V(65, -150),
    starts: [
      { pos: V(42, 70), heading: -Math.PI / 2 * 1.0 },     // alongside the ship's port side, nose west
      { pos: V(-170, 40), heading: -Math.PI / 2 },         // past the reef
    ],
    spawn: new THREE.Vector3(42, 0.05, 70), checkpoints: [], buildings: [], ladders: [], hideSpots: [],
  };
}

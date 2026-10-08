import * as THREE from 'three';
import { CollisionWorld } from '../../core/collision.js';
import { makeTextTexture, makeGlowMaterial } from '../materials.js';
import { CLASSIC_TINTS, ZINC, riverMaterial, buildIronTower, buildRiverBoat } from '../lumiere.js';
import { PlayerModel, STATUE_POSES } from '../../player/playerModel.js';
import { makeRng } from '../../core/utils.js';

// ======================================================================
//  Chapter 19: the Grand Musée, Lumière, at night.
//
//  Seen from above (north = -Z):
//
//                    ┌──────── ROTUNDA ────────┐  round hall, 24 m across,
//                    │   the Star of Lumière   │  a glass dome on top (the
//                    │   on its pedestal (0,0) │  oculus at the very top,
//                    └───────────┬─────────────┘  24.6 m up), lasers inside
//                                │ arch
//                    ┌───────────┴─────────────┐
//                    │  HALL OF STATUES        │  x -6..6, z 12.6..60:
//                    │  plinths down both      │  statues on plinths in two
//                    │  sides, guards in the   │  rows (half of them empty),
//                    │  middle                 │  8 m high, flat roof (part 2
//                    └───────────┬─────────────┘  starts up there)
//                                │ river door (z 60)
//                     the quay, and Paz's boat on the river (z 66+)
//
//  Part 2 (the dome): over the hall's roof (two guards), up the ladder onto
//  the terrace round the dome, up the maintenance mast, along the gantry
//  over the glass to the catwalk round the oculus. Clip on and drop in.
//  Part 3 (the statues): from the rotunda floor down the Hall of Statues to
//  the river door.
// ======================================================================

export const DOME = { r: 12, base: 14, apex: 24.6, oculus: 2.0 };
export const ANCHOR = new THREE.Vector3(0, 25.2, 0);   // where the rope is clipped on
export const PEDESTAL_TOP = 1.5;
export const LASER_LAYERS = [
  { y: 19, kind: 'blink', on: 2.0, off: 1.5, phase: 0 },
  { y: 14.5, kind: 'sweepX', speed: 0.9, amp: 1.25, gap: 0.65 },
  { y: 10, kind: 'blink', on: 1.6, off: 1.2, phase: 1.1 },
  { y: 6, kind: 'sweepZ', speed: 1.1, amp: 1.25, gap: 0.65, phase: 1 },
];
export const PLINTHS = [];
for (const sx of [-1, 1]) for (let k = 0; k < 9; k++) PLINTHS.push({ x: sx * 3.8, z: 17 + k * 5, statue: (k + (sx > 0 ? 1 : 0)) % 2 === 0 });
export const PLINTH_TOP = 1.0;

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });

/** A brilliant-cut diamond (crown and pavilion), glowing a little. */
export function buildStar(size = 1) {
  const pts = [[0, -0.36], [0.44, 0], [0.32, 0.12], [0.2, 0.17], [0, 0.17]].map(([x, y]) => new THREE.Vector2(x * size, y * size));
  const geo = new THREE.LatheGeometry(pts, 8);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xf4fbff, roughness: 0.04, metalness: 0.2, emissive: 0x9ad0ff, emissiveIntensity: 0.55, flatShading: true }));
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.75 * size, 12, 8), makeGlowMaterial(0xbfe6ff, 0.25));
  const g = new THREE.Group();
  g.add(m, glow);
  return g;
}

function windowsTexture(rng) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 64, 64);
  for (let y = 4; y < 60; y += 12) for (let x = 3; x < 64; x += 8) if (rng() < 0.4) { g.fillStyle = rng() < 0.8 ? '#ffd48a' : '#9ad0ff'; g.fillRect(x, y, 4, 7); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A framed painting for the walls. */
function painting(w, h, seed) {
  const c = document.createElement('canvas');
  c.width = 96; c.height = Math.round(96 * h / w);
  const g = c.getContext('2d'), rng = makeRng(seed);
  const hues = [[40, 50], [200, 40], [20, 60], [120, 30], [280, 30]][seed % 5];
  const grd = g.createLinearGradient(0, 0, 0, c.height);
  grd.addColorStop(0, `hsl(${hues[0]}, ${hues[1]}%, 55%)`);
  grd.addColorStop(1, `hsl(${hues[0] + 30}, ${hues[1]}%, 22%)`);
  g.fillStyle = grd; g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 9; i++) { g.fillStyle = `hsla(${(hues[0] + rng() * 120) | 0}, 50%, ${30 + rng() * 40}%, 0.7)`; g.beginPath(); g.arc(rng() * c.width, rng() * c.height, 4 + rng() * 18, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const grp = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, h + 0.3, 0.1), mat(0xc8a040, { metalness: 0.7, roughness: 0.4 }));
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }));
  pic.position.z = 0.06;
  grp.add(frame, pic);
  return grp;
}

export function buildChapter19Museum() {
  const group = new THREE.Group();
  const world = new CollisionWorld(8);
  const rng = makeRng(1919);
  const ladders = [];
  const solid = (x0, y0, z0, x1, y1, z1, material, tag = 'wall') => {
    if (material) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), material);
      m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      group.add(m);
    }
    return world.addBox(x0, y0, z0, x1, y1, z1, { tag });
  };
  const stone = mat(0xe2d6bc), stoneDark = mat(0xb8ab90), marble = mat(0xece6da, { roughness: 0.35 }), zinc = mat(ZINC, { metalness: 0.5, roughness: 0.5 });
  const ladderMesh = (x, z, nx, nz, y0, y1) => {
    const g = new THREE.Group(), m = mat(0x5a5d66, { metalness: 0.6 });
    for (const s of [-0.28, 0.28]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.06, y1 - y0, 0.06), m); r.position.set(nz ? s : 0, (y1 - y0) / 2, nx ? s : 0); g.add(r); }
    for (let y = 0.3; y < y1 - y0; y += 0.4) { const rung = new THREE.Mesh(new THREE.BoxGeometry(nz ? 0.56 : 0.05, 0.05, nx ? 0.56 : 0.05), m); rung.position.y = y; g.add(rung); }
    g.position.set(x + nx * 0.08, y0, z + nz * 0.08);
    group.add(g);
    ladders.push({ x, z, nx, nz, y0, y1 });
  };

  // ------------------------------------------------------------------ the ground, the quay, the river
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), mat(0x5a5650, { roughness: 0.9 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, -200);
  group.add(ground);
  world.addBox(-450, -2, -650, 450, 0, 66, { tag: 'roof' });
  const quay = new THREE.Mesh(new THREE.BoxGeometry(900, 0.2, 6), mat(0xb8ae98));
  quay.position.set(0, 0.0, 63.4);
  group.add(quay);
  solid(-450, -3, 65.8, 450, 0, 66.4, stoneDark, 'wall');            // the quay wall down to the water
  const river = new THREE.Mesh(new THREE.PlaneGeometry(900, 260), riverMaterial());
  river.rotation.x = -Math.PI / 2;
  river.position.set(0, -1.6, 196);
  group.add(river);
  world.addBox(-450, -8, 66.4, 450, -2.2, 330, { tag: 'water' });
  const farBank = new THREE.Mesh(new THREE.BoxGeometry(900, 3, 30), mat(0xb8ae98));
  farBank.position.set(0, -0.2, 340);
  group.add(farBank);
  // quay lamps
  const lampGlow = new THREE.MeshBasicMaterial({ color: 0xffd8a0, toneMapped: false });
  for (let x = -90; x <= 90; x += 15) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 4, 6), mat(0x2a2c30, { metalness: 0.6 }));
    post.position.set(x, 2, 65.2);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), lampGlow);
    head.position.set(x, 4.2, 65.2);
    group.add(post, head);
  }
  // a bridge across the river to the east, and tourist boats
  solid(52, -0.6, 66.4, 66, 0.4, 330, mat(0xc8bca4));
  for (const x of [52.2, 65.8]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1, 264), mat(0xd8ccb2)); b.position.set(x, 0.9, 198); group.add(b); }
  for (let z = 90; z < 330; z += 40) { const arch = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 14, 16, 1, false, 0, Math.PI), mat(0x9a8e78)); arch.rotation.z = Math.PI / 2; arch.position.set(59, -1.6, z); group.add(arch); }
  const boat = buildRiverBoat();
  boat.position.set(-40, -1.5, 92);
  boat.rotation.y = Math.PI / 2;
  group.add(boat);
  // Paz's little boat at the bottom of the quay steps, and the steps
  const pazBoat = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 5.5), mat(0x2a5a8a));
  hull.position.y = -1.3;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(2, 0.1, 5), mat(0xc8a070));
  deck.position.y = -0.85;
  pazBoat.add(hull, deck);
  pazBoat.position.set(0, 0, 69.5);
  group.add(pazBoat);
  const boatRing = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.1, 32), makeGlowMaterial(0x4dffa6, 0.85));
  boatRing.rotation.x = -Math.PI / 2;
  boatRing.position.set(0, 0.12, 64.2);
  const boatBeam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 40, 16, 1, true), makeGlowMaterial(0x4dffa6, 0.14));
  boatBeam.position.set(0, 20, 64.2);
  group.add(boatRing, boatBeam);

  // ------------------------------------------------------------------ the city round the museum
  const winTex = windowsTexture(rng);
  const city = [];
  for (let i = 0; i < 26; i++) {
    const side = i % 2 ? 1 : -1;
    const w = 18 + rng() * 14, d = 16 + rng() * 14, h = 16 + rng() * 6;
    const x = side * (24 + rng() * 60) + (side > 0 ? 0 : -w), z = -110 + rng() * 165;
    if (x < 14 && x + w > -14 && z < 62 && z + d > -24) continue; // (not on the museum)
    if (z + d > 60) continue;
    const t = winTex.clone();
    t.needsUpdate = true;
    t.repeat.set(Math.round(w / 5), Math.round(h / 4));
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: CLASSIC_TINTS[i % 8], roughness: 0.85, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.5 }));
    m.position.set(x + w / 2, h / 2, z + d / 2);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w - 2, 3, d - 2), zinc);
    roof.position.set(x + w / 2, h + 1.5, z + d / 2);
    group.add(m, roof);
    world.addBox(x, 0, z, x + w, h, z + d, { tag: 'building' });
    city.push({ x, z, w, d, h });
  }
  const tower = buildIronTower(-150, -240, 120);
  group.add(tower.group);

  // ------------------------------------------------------------------ the rotunda (round hall, 24 m across)
  // its walls (square for collision; round to look at)
  solid(-12.6, 0, -12.6, 12.6, 14, -12, null);
  solid(12, 0, -12.6, 12.6, 14, 12.6, null);
  solid(-12.6, 0, -12.6, -12, 14, 12.6, null);
  solid(-12.6, 0, 12, -2.5, 14, 12.6, null);
  solid(2.5, 0, 12, 12.6, 14, 12.6, null);
  solid(-2.5, 6, 12, 2.5, 14, 12.6, null);                             // over the arch
  // (the round walls leave a gap for the arch to the hall: south is angle 0 on a cylinder)
  const GAP = 0.21, inMat = new THREE.MeshStandardMaterial({ color: 0xe8dcc4, roughness: 0.7, side: THREE.BackSide });
  for (const [r, m] of [[12, inMat], [12.6, stone]]) {
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 14, 48, 1, true, GAP, Math.PI * 2 - GAP * 2), m);
    wall.position.y = 7;
    const over = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 8, 6, 1, true, -GAP, GAP * 2), m);
    over.position.y = 10;
    group.add(wall, over);
  }
  // the floor: a marble star pattern
  const floorTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#e8e0d0'; g.fillRect(0, 0, 256, 256);
    g.translate(128, 128);
    for (let k = 0; k < 16; k++) { g.rotate(Math.PI / 8); g.fillStyle = k % 2 ? '#2a2c36' : '#9a7a4a'; g.beginPath(); g.moveTo(0, 0); g.lineTo(10, 120); g.lineTo(-10, 120); g.fill(); }
    g.beginPath(); g.arc(0, 0, 18, 0, Math.PI * 2); g.fillStyle = '#c8a040'; g.fill();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const floor = new THREE.Mesh(new THREE.CircleGeometry(12, 48), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.25, metalness: 0.15 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.02;
  group.add(floor);
  // columns round the wall, a gilded cornice, paintings between the columns
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    if (Math.abs(Math.sin(a) - 1) < 0.05) continue; // (none in the arch)
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 12, 12), marble);
    col.position.set(Math.cos(a) * 11.2, 6, Math.sin(a) * 11.2);
    group.add(col);
    if (k % 2) {
      const p = painting(2.6, 2.0, k);
      const a2 = a + Math.PI / 16;
      p.position.set(Math.cos(a2) * 11.9, 4.5, Math.sin(a2) * 11.9);
      p.lookAt(0, 4.5, 0);
      group.add(p);
    }
  }
  const cornice = new THREE.Mesh(new THREE.TorusGeometry(11.85, 0.3, 6, 48), mat(0xc8a040, { metalness: 0.6, roughness: 0.4 }));
  cornice.rotation.x = Math.PI / 2;
  cornice.position.y = 13.6;
  group.add(cornice);
  // the pedestal and the Star of Lumière
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, PEDESTAL_TOP, 16), mat(0x2a2c36, { roughness: 0.3, metalness: 0.4 }));
  ped.position.y = PEDESTAL_TOP / 2;
  const cushion = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.15, 0.8), mat(0x7a1a2a));
  cushion.position.y = PEDESTAL_TOP + 0.07;
  group.add(ped, cushion);
  world.addBox(-0.6, 0, -0.6, 0.6, PEDESTAL_TOP, 0.6, { tag: 'prop' });
  const star = buildStar(1);
  star.position.set(0, PEDESTAL_TOP + 0.5, 0);
  group.add(star);
  const starLight = new THREE.PointLight(0xbfe6ff, 6, 10, 1.5);
  starLight.position.set(0, PEDESTAL_TOP + 1.5, 0);
  group.add(starLight);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.7), new THREE.MeshBasicMaterial({ map: makeTextTexture('L\'ÉTOILE DE LUMIÈRE', { color: '#c8a040', width: 1024, height: 160, font: 'bold 90px "Bebas Neue", Impact, sans-serif' }), transparent: true }));
  sign.position.set(0, 0.6, 0.72);
  group.add(sign);
  // the glass dome (an open hole at the top: the oculus)
  const domeGeo = new THREE.SphereGeometry(DOME.r, 40, 14, 0, Math.PI * 2, 0.17, Math.PI / 2 - 0.17);
  domeGeo.scale(1, 0.88, 1);
  const dome = new THREE.Mesh(domeGeo, new THREE.MeshStandardMaterial({ color: 0x9ad0ff, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.6, side: THREE.DoubleSide, depthWrite: false }));
  dome.position.y = DOME.base;
  const ribs = new THREE.Mesh(domeGeo, new THREE.MeshBasicMaterial({ color: 0x3a3c44, wireframe: true, transparent: true, opacity: 0.6 }));
  ribs.position.y = DOME.base;
  group.add(dome, ribs);
  // (the dome's glass, as steps you can climb over; it stops below the oculus)
  for (const [r, y0, y1] of [[11.5, 14, 17], [10, 17, 19.8], [8, 19.8, 21.9], [6, 21.9, 23.0]]) world.addBox(-r, y0, -r, r, y1, r, { tag: 'roof' });
  // the terrace round the dome (a square ring, with corner pieces), its balustrade
  for (const [x0, z0, x1, z1] of [[-14.6, -14.6, 14.6, -12], [-14.6, 12, 14.6, 14.6], [-14.6, -12, -12, 12], [12, -12, 14.6, 12],
    [-12, -12, -8.5, -8.5], [8.5, -12, 12, -8.5], [-12, 8.5, -8.5, 12], [8.5, 8.5, 12, 12]]) solid(x0, 13.6, z0, x1, 14, z1, stoneDark, 'roof');
  for (const [x0, z0, x1, z1] of [[-14.6, -14.6, 14.6, -14.2], [-14.6, 14.2, -1.2, 14.6], [1.2, 14.2, 14.6, 14.6], [-14.6, -14.2, -14.2, 14.2], [14.2, -14.2, 14.6, 14.2]]) solid(x0, 14, z0, x1, 15, z1, stone);
  // the maintenance mast (ladder) and the gantry over the glass to the catwalk round the oculus
  const steel = mat(0x5a5d66, { metalness: 0.6, roughness: 0.4 });
  solid(-0.4, 14, 11.6, 0.4, 24.9, 12.2, steel, 'prop');
  ladderMesh(0, 12.2, 0, 1, 14, 24.9);
  solid(-0.7, 24.6, 3.2, 0.7, 24.9, 12.2, steel, 'roof');
  for (const sx of [-1, 1]) solid(sx * 0.75 - 0.04, 24.9, 3.2, sx * 0.75 + 0.04, 25.9, 11.6, steel);
  for (const [x0, z0, x1, z1] of [[-3.2, -3.2, 3.2, -1.9], [-3.2, 1.9, -0.7, 3.2], [0.7, 1.9, 3.2, 3.2], [-0.7, 1.9, 0.7, 3.2], [-3.2, -1.9, -1.9, 1.9], [1.9, -1.9, 3.2, 1.9]]) solid(x0, 24.6, z0, x1, 24.9, z1, steel, 'roof');
  const davit = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 3.4), steel);
  davit.position.set(0, ANCHOR.y + 0.2, 0);
  group.add(davit);
  const pulley = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.05, 6, 12), steel);
  pulley.position.copy(ANCHOR);
  group.add(pulley);
  // moonlight down through the dome
  const moon = new THREE.SpotLight(0xb8d0ff, 60, 40, 0.5, 0.6, 1.2);
  moon.position.set(0, 30, 0);
  moon.target.position.set(0, 0, 0);
  group.add(moon, moon.target);

  // ------------------------------------------------------------------ the lasers (four layers across the rotunda)
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xff2030, toneMapped: false, transparent: true, opacity: 0.9 });
  const lasers = LASER_LAYERS.map((L) => {
    const n = L.kind === 'blink' ? 18 : 48;
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.035, 0.035), beamMat.clone(), n);
    im.frustumCulled = false;
    group.add(im);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(11.95, 0.06, 4, 48), new THREE.MeshBasicMaterial({ color: 0xff3040, toneMapped: false }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = L.y;
    group.add(ring);
    return { ...L, mesh: im, ring, n };
  });

  // ------------------------------------------------------------------ the Hall of Statues
  const H = { x0: -6, x1: 6, z0: 12.6, z1: 60, h: 8 };
  solid(-6.6, 0, H.z0, -6, H.h, 60.6, stone);
  solid(6, 0, H.z0, 6.6, H.h, 60.6, stone);
  solid(-6.6, 0, 60, -1.5, H.h, 60.6, stone);
  solid(1.5, 0, 60, 6.6, H.h, 60.6, stone);
  solid(-1.5, 3.2, 60, 1.5, H.h, 60.6, stone);
  // inside: a warm stone wall face, a coffered ceiling, a parquet floor, paintings
  const hallFloor = new THREE.Mesh(new THREE.PlaneGeometry(12, H.z1 - H.z0), mat(0x6a4a30, { roughness: 0.5 }));
  hallFloor.rotation.x = -Math.PI / 2;
  hallFloor.position.set(0, 0.02, (H.z0 + H.z1) / 2);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(12, H.z1 - H.z0), mat(0xd8ccb2));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, H.h - 0.02, (H.z0 + H.z1) / 2);
  group.add(hallFloor, ceil);
  for (let z = 15; z < 59; z += 6) for (const sx of [-1, 1]) {
    const p = painting(2.4, 1.8, Math.round(z * 3 + sx));
    p.position.set(sx * 5.94, 4.4, z + 2.5);
    p.rotation.y = -sx * Math.PI / 2;
    group.add(p);
  }
  // the roof: zinc, a low parapet, skylights down the middle (cover from the roof guards)
  solid(-6.6, H.h, H.z0, 6.6, H.h + 0.4, 60.6, zinc, 'roof');
  const roofY = H.h + 0.4;
  for (const sx of [-1, 1]) solid(sx > 0 ? 6.2 : -6.6, roofY, H.z0 + 2, sx > 0 ? 6.6 : -6.2, roofY + 0.8, 60.6, stone);
  solid(-6.6, roofY, 60.2, 6.6, roofY + 0.8, 60.6, stone);
  const skyMat = new THREE.MeshStandardMaterial({ color: 0x9ad0ff, transparent: true, opacity: 0.35, roughness: 0.1, metalness: 0.5 });
  for (const z of [22, 31, 40, 49]) solid(-1.6, roofY, z - 2, 1.6, roofY + 1.3, z + 2, skyMat, 'prop');
  // the drum's south wall above the hall roof, and its ladder up to the terrace
  solid(-14.6, roofY, 12.6, 14.6, 13.6, 14.6, stone);
  ladderMesh(0, 14.6, 0, 1, roofY, 14);
  // the plinths and the stone statues on half of them
  const plinthMat = mat(0xd8d0c0, { roughness: 0.4 });
  const STONE = { hoodie: 0xd8d4cc, trousers: 0xd0ccc4, shoes: 0xc8c4bc, gloves: 0xd8d4cc, skin: 0xd8d4cc, hair: 0xd0ccc4, shirt: 0xd8d4cc, hat: 0xd0ccc4 };
  const statues = [];
  for (const [i, P] of PLINTHS.entries()) {
    solid(P.x - 0.7, 0, P.z - 0.7, P.x + 0.7, PLINTH_TOP, P.z + 0.7, plinthMat, 'prop');
    if (!P.statue) continue;
    const m = new PlayerModel(STONE, { bag: false, style: { top: ['tee', 'suit', 'hoodie', 'jacket'][i % 4], hair: ['short', 'long', 'curly', 'bun'][i % 4], beard: i % 3 ? null : 'beard' } });
    m.statue = i % STATUE_POSES.length;
    m.pose = { pos: new THREE.Vector3(P.x, PLINTH_TOP, P.z), vel: new THREE.Vector3(), facing: P.x > 0 ? -Math.PI / 2 : Math.PI / 2, state: 'ground', horizontalSpeed: 0, mantleProgress: 0, stateTime: 0, stumbleTimer: 0, mantle: null, wallRun: null };
    m.update(0, m.pose);
    group.add(m.root);
    world.addBox(P.x - 0.35, PLINTH_TOP, P.z - 0.35, P.x + 0.35, PLINTH_TOP + 1.8, P.z + 0.35, { tag: 'prop' });
    statues.push(m);
  }
  // moonlight in the hall (through the skylights)
  for (const z of [22, 40]) { const l = new THREE.PointLight(0x9ab8ff, 7, 22, 1.5); l.position.set(0, H.h - 0.5, z); group.add(l); }
  const doorGlow = new THREE.Mesh(new THREE.PlaneGeometry(3, 3.2), makeGlowMaterial(0x4dffa6, 0.18));
  doorGlow.position.set(0, 1.6, 59.95);
  group.add(doorGlow);

  return {
    group, world, ladders, lasers, star, starLight, statues, boatRing, boatBeam, pazBoat, hall: H, roofY, city,
    goal: new THREE.Vector3(0, 0, 64.2),
    oculus: new THREE.Vector3(0, 24.9, 0),
    checkpoints: [], hideSpots: [], buildings: [],
    spawn: new THREE.Vector3(0, roofY, 57.5),
  };
}

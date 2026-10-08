import * as THREE from 'three';
import { CollisionWorld } from '../../core/collision.js';
import { makeTextTexture, makeGlowMaterial } from '../materials.js';
import { buildNeonDressing, NEON_TINTS, NEON_GLASS } from '../neon.js';
import { makeRng } from '../../core/utils.js';

// ======================================================================
//  Chapter 17: Kurogane Tower, Neon Kōji's tallest, at night.
//
//  Seen from above (north = -Z):
//
//    z = -380  KUROGANE TOWER (220 m; the sky vault is on the 88th floor,
//              y 196-201, on its east side; a window-cleaning gondola
//              hangs on the east face; Kitsu's van waits in the street east)
//                ▲
//    the AVENUE: a canyon of skyscrapers (x -25..25 is open sky), with
//    a sky bridge across it at z = -120 (y 200-206), steam updrafts over
//    the lower towers, boost rings, and security drones
//                │
//    z = +320  Juno's helicopter (where you jump), 330 m up
//
//  The streets are far below (y = 0).
// ======================================================================

export const KURO = { x0: -22, x1: 22, z0: -402, z1: -358, h: 220 };
export const VAULT_Y = 196;            // the vault floor (88th)
export const VAULT = { x0: 6, x1: 21.5, z0: -390, z1: -370 };

export function buildChapter17Tower({ withVault = true } = {}) {
  const group = new THREE.Group();
  const world = new CollisionWorld(12);
  const rng = makeRng(1717);
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });
  const winTex = (() => {
    const c = document.createElement('canvas');
    c.width = 32; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, 32, 64);
    for (let y = 2; y < 64; y += 5) for (let x = 2; x < 32; x += 5) if (rng() < 0.45) { g.fillStyle = rng() < 0.75 ? '#ffd890' : '#8ad8ff'; g.fillRect(x, y, 3, 3); }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const towerMat = (tint, w, h) => {
    const tex = winTex.clone();
    tex.needsUpdate = true;
    tex.repeat.set(Math.max(1, Math.round(w / 6)), Math.max(1, Math.round(h / 8)));
    return new THREE.MeshStandardMaterial({ color: tint, roughness: 0.6, metalness: 0.2, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.8 });
  };
  const towers = [];
  const tower = (x0, z0, x1, z1, h, tint) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, h, z1 - z0), towerMat(tint, Math.max(x1 - x0, z1 - z0), h));
    m.position.set((x0 + x1) / 2, h / 2, (z0 + z1) / 2);
    group.add(m);
    world.addBox(x0, 0, z0, x1, h, z1, { tag: 'roof' });
    towers.push({ x0, x1, z0, z1, h });
    return m;
  };
  const solid = (x0, y0, z0, x1, y1, z1, material, tag = 'wall') => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), material);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    group.add(m);
    world.addBox(x0, y0, z0, x1, y1, z1, { tag });
    return m;
  };

  // ------------------------------------------------------------------ the streets far below
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), mat(0x14161c, { roughness: 0.4, metalness: 0.3 }));
  ground.rotation.x = -Math.PI / 2;
  group.add(ground);
  world.addBox(-1200, -2, -1200, 1200, 0, 1200, { tag: 'roof' });
  // street lights in lines (one instanced mesh)
  const lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.8, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffc870, toneMapped: false }), 400);
  const o = new THREE.Object3D();
  let n = 0;
  for (let i = 0; i < 400; i++) {
    const along = -700 + (i % 100) * 14, line = [-30, 30, 90, -90][Math.floor(i / 100)];
    o.position.set(line, 6, along);
    o.updateMatrix();
    lamps.setMatrixAt(n++, o.matrix);
  }
  group.add(lamps);

  // ------------------------------------------------------------------ the skyscrapers
  // the avenue's walls: towers on both sides from the helicopter to Kurogane
  for (const side of [-1, 1]) {
    for (let z = 300; z > -330; z -= 0) {
      const d = 34 + rng() * 26;
      const z1 = z, z0 = z - d;
      const low = rng() < 0.22;               // a lower one (with steam vents on its roof)
      const h = low ? 130 + rng() * 30 : 200 + rng() * 110;
      const x0 = side < 0 ? -28 - 30 - rng() * 14 : 28, x1 = side < 0 ? -28 : 28 + 30 + rng() * 14;
      tower(x0, z0, x1, z1, h, rng() < 0.5 ? NEON_GLASS[Math.floor(rng() * 4)] : NEON_TINTS[Math.floor(rng() * 8)]);
      if (low) towers[towers.length - 1].low = true;
      z = z0 - (4 + rng() * 10);
    }
  }
  // more towers further out (the skyline)
  for (let i = 0; i < 60; i++) {
    const side = rng() < 0.5 ? -1 : 1;
    const x = side * (110 + rng() * 380), z = -600 + rng() * 1000, w = 30 + rng() * 40, h = 120 + rng() * 260;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), towerMat(NEON_TINTS[i % 8], w, h));
    m.position.set(x, h / 2, z);
    group.add(m);
  }

  // ------------------------------------------------------------------ Kurogane Tower
  const K = KURO;
  const kMat = towerMat(0x1a1c24, 44, 220);
  // solid below and above the vault floor; the vault floor itself has a room on the east side
  solid(K.x0, 0, K.z0, K.x1, VAULT_Y, K.z1, kMat, 'roof');
  solid(K.x0, VAULT_Y + 5, K.z0, K.x1, K.h, K.z1, kMat, 'roof');
  const wallMat = mat(0x2a2c36);
  solid(K.x0, VAULT_Y, K.z0, VAULT.x0, VAULT_Y + 5, K.z1, wallMat);                       // the west part of the floor (solid)
  solid(VAULT.x0, VAULT_Y, K.z0, K.x1, VAULT_Y + 5, VAULT.z0, wallMat);                   // south of the room
  solid(VAULT.x0, VAULT_Y, VAULT.z1, K.x1, VAULT_Y + 5, K.z1, wallMat);                   // north of the room
  // the east wall of the room, with the big window (cut it from the gondola)
  solid(VAULT.x1, VAULT_Y, VAULT.z0, K.x1, VAULT_Y + 5, -383, wallMat);
  solid(VAULT.x1, VAULT_Y, -377, K.x1, VAULT_Y + 5, VAULT.z1, wallMat);
  const windowBox = world.addBox(VAULT.x1, VAULT_Y, -383, K.x1, VAULT_Y + 5, -377, { tag: 'wall' });
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(6, 5), new THREE.MeshStandardMaterial({ color: 0x6ab8e8, transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.6, side: THREE.DoubleSide }));
  glass.position.set(K.x1 + 0.02, VAULT_Y + 2.5, -380);
  glass.rotation.y = Math.PI / 2;
  group.add(glass);
  // the crown: a lit band, the name, a spire
  const band = new THREE.Mesh(new THREE.BoxGeometry(45, 3, 45), new THREE.MeshBasicMaterial({ color: 0xff3040, toneMapped: false }));
  band.position.set(0, K.h - 6, (K.z0 + K.z1) / 2);
  group.add(band);
  const name = new THREE.Mesh(new THREE.PlaneGeometry(36, 6), new THREE.MeshBasicMaterial({ map: makeTextTexture('KUROGANE', { color: '#ff3040', width: 1024, height: 160, font: 'bold 130px "Bebas Neue", Impact, sans-serif' }), transparent: true, toneMapped: false }));
  name.position.set(0, K.h - 18, K.z1 + 0.2);
  group.add(name);
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 1.2, 40, 8), mat(0x8a8f9c, { metalness: 0.8 }));
  spire.position.set(-14, K.h + 20, -392);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2030 }));
  tip.position.set(-14, K.h + 40.5, -392);
  group.add(spire, tip);
  world.addBox(-15, K.h, -393, -13, K.h + 40, -391, { tag: 'wall' });
  // the roof: a helipad, machinery (cover), a low parapet (not at the gondola's dock)
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 0.15, 32), mat(0x2a2c36));
  pad.position.set(0, K.h + 0.08, -372);
  group.add(pad);
  const H = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({ map: makeTextTexture('H', { color: '#ffd040', width: 128, height: 128, font: 'bold 110px "Bebas Neue", Impact, sans-serif' }), transparent: true, toneMapped: false }));
  H.rotation.x = -Math.PI / 2;
  H.position.set(0, K.h + 0.17, -372);
  group.add(H);
  const padRing = new THREE.Mesh(new THREE.RingGeometry(7, 8, 40), makeGlowMaterial(0x4dffa6, 0.8));
  padRing.rotation.x = -Math.PI / 2;
  padRing.position.set(0, K.h + 0.2, -372);
  group.add(padRing);
  for (const [x, z, w, h, d] of [[-14, -396, 8, 3, 6], [12, -396, 6, 2.5, 6], [-16, -365, 4, 2, 4], [14, -364, 5, 3, 3]]) solid(x - w / 2, K.h, z - d / 2, x + w / 2, K.h + h, z + d / 2, mat(0x4a4c52), 'prop');
  const par = mat(0x3a3c44);
  solid(K.x0, K.h, K.z0, K.x1, K.h + 1.1, K.z0 + 0.4, par); solid(K.x0, K.h, K.z1 - 0.4, K.x1, K.h + 1.1, K.z1, par);
  solid(K.x0, K.h, K.z0, K.x0 + 0.4, K.h + 1.1, K.z1, par);
  solid(K.x1 - 0.4, K.h, K.z0, K.x1, K.h + 1.1, -383); solid(K.x1 - 0.4, K.h, -377, K.x1, K.h + 1.1, K.z1, par);

  // ------------------------------------------------------------------ the window-cleaning gondola (east face)
  const gondola = new THREE.Group();
  const gMat = mat(0xd8d4cc, { metalness: 0.5 });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.2, 5), gMat);
  floor.position.y = -0.1;
  gondola.add(floor);
  for (const [x, z, w, d] of [[0.75, 0, 0.1, 5], [0, -2.45, 1.6, 0.1], [0, 2.45, 1.6, 0.1]]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(w, 1.0, d), gMat);
    r.position.set(x, 0.5, z);
    gondola.add(r);
  }
  for (const z of [-2.3, 2.3]) {
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 30, 4), mat(0x2a2b31));
    cable.position.set(0.2, 15, z);
    gondola.add(cable);
  }
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.5), new THREE.MeshStandardMaterial({ color: 0x1a1b20, emissive: 0xffd040, emissiveIntensity: 0.6 }));
  panel.position.set(0.72, 1.1, 1.6);
  gondola.add(panel);
  group.add(gondola);
  // the davit on the roof it hangs from
  solid(K.x1 - 1, K.h, -381, K.x1, K.h + 3.4, -379, mat(0x8a8f9c, { metalness: 0.6 }), 'prop');
  const arm = new THREE.Mesh(new THREE.BoxGeometry(4, 0.3, 0.4), mat(0x8a8f9c, { metalness: 0.6 }));
  arm.position.set(K.x1 + 1, K.h + 3.4, -380);
  group.add(arm);

  // ------------------------------------------------------------------ the sky vault (88th floor, east side)
  const tiles = [];
  let pedestal = null, gold = null, vaultDoorZ = VAULT.z1;
  if (withVault) {
    const V = VAULT, y = VAULT_Y;
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(V.x1 - V.x0, V.z1 - V.z0), mat(0x101218, { roughness: 0.3, metalness: 0.5 }));
    fl.rotation.x = -Math.PI / 2;
    fl.position.set((V.x0 + V.x1) / 2, y + 0.01, (V.z0 + V.z1) / 2);
    group.add(fl);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(V.x1 - V.x0, V.z1 - V.z0), mat(0x1a1c24));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set((V.x0 + V.x1) / 2, y + 4.99, (V.z0 + V.z1) / 2);
    group.add(ceil);
    // the pressure-tile floor: 6 x 8 tiles of 2 m (x 8..20, z -388..-372)
    const tileGeo = new THREE.PlaneGeometry(1.86, 1.86).rotateX(-Math.PI / 2);
    for (let c = 0; c < 6; c++) {
      for (let r = 0; r < 8; r++) {
        const m = new THREE.Mesh(tileGeo, new THREE.MeshBasicMaterial({ color: 0x1a2a3a, toneMapped: false }));
        m.position.set(8 + c * 2 + 1, y + 0.03, -388 + r * 2 + 1);
        group.add(m);
        tiles.push({ c, r, m, x: m.position.x, z: m.position.z });
      }
    }
    // the gold on its pedestal (west end)
    pedestal = new THREE.Vector3(7, y, -380);
    const ped = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1, 1.6), mat(0x2a2c36, { metalness: 0.6 }));
    ped.position.set(pedestal.x, y + 0.5, pedestal.z);
    group.add(ped);
    world.addBox(6.4, y, -380.8, 7.6, y + 1, -379.2, { tag: 'prop' });
    gold = new THREE.Group();
    const gm = mat(0xe8c040, { metalness: 0.9, roughness: 0.25, emissive: 0x3a2a00 });
    for (let k = 0; k < 6; k++) { const bar = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.7), gm); bar.position.set(-0.2 + (k % 2) * 0.4, 0.08 + Math.floor(k / 2) * 0.16, 0); gold.add(bar); }
    gold.position.set(pedestal.x, y + 1, pedestal.z);
    group.add(gold);
    const caseGlass = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, 1.5), new THREE.MeshStandardMaterial({ color: 0x9ad0ff, transparent: true, opacity: 0.2 }));
    caseGlass.position.set(pedestal.x, y + 1.45, pedestal.z);
    group.add(caseGlass);
    // red light strips round the room, a door (where the guards come in)
    for (const z of [V.z0 + 0.05, V.z1 - 0.05]) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(V.x1 - V.x0, 0.06, 0.06), new THREE.MeshBasicMaterial({ color: 0xff3040, toneMapped: false }));
      s.position.set((V.x0 + V.x1) / 2, y + 4.7, z);
      group.add(s);
    }
    const door = new THREE.Mesh(new THREE.PlaneGeometry(2, 2.6), mat(0x4a4c52, { metalness: 0.5 }));
    door.position.set(13, y + 1.3, V.z1 - 0.06);
    door.rotation.y = Math.PI;
    group.add(door);
    vaultDoorZ = V.z1 - 1;
    const roomLight = new THREE.PointLight(0x9ad0ff, 8, 18, 1.5);
    roomLight.position.set(14, y + 4, -380);
    group.add(roomLight);
  }

  // ------------------------------------------------------------------ the flight: sky bridge, updrafts, rings, drones
  // the sky bridge across the avenue (fly under it, or over)
  solid(-30, 200, -126, 30, 206, -114, mat(0x3a3e48, { metalness: 0.4 }));
  const bridgeLights = new THREE.Mesh(new THREE.BoxGeometry(60, 0.3, 0.3), new THREE.MeshBasicMaterial({ color: 0x2fe0ff, toneMapped: false }));
  bridgeLights.position.set(0, 200, -114);
  group.add(bridgeLights);
  // steam updrafts over the lower towers' roofs (and two in the avenue itself)
  const updrafts = [];
  for (const t of towers.filter((tw) => tw.low)) updrafts.push({ x: (t.x0 + t.x1) / 2, z: (t.z0 + t.z1) / 2, r: 9, y0: t.h, y1: t.h + 170 });
  updrafts.push({ x: 0, z: 40, r: 8, y0: 0, y1: 320 }, { x: 6, z: -230, r: 8, y0: 0, y1: 300 });
  for (const u of updrafts) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(u.r, u.r, u.y1 - u.y0, 16, 1, true), makeGlowMaterial(0xc8e8ff, 0.07));
    col.position.set(u.x, (u.y0 + u.y1) / 2, u.z);
    group.add(col);
    u.mesh = col;
  }
  // boost rings along the way
  const rings = [];
  for (const [x, y, z] of [[0, 300, 200], [-8, 280, 80], [10, 262, -40], [0, 196, -120], [-6, 240, -200], [4, 236, -290]]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(5, 0.35, 8, 32), new THREE.MeshBasicMaterial({ color: 0xff7a2a, toneMapped: false }));
    ring.position.set(x, y, z);
    group.add(ring);
    rings.push({ x, y, z, mesh: ring, taken: false });
  }
  // security drones: they fly loops across the avenue with a spotlight pointing ahead and down
  const drones = [];
  const droneDefs = [
    { path: [[-20, 290, 120], [20, 280, 120], [20, 290, 40], [-20, 280, 40]], speed: 9 },
    { path: [[22, 255, -20], [-22, 265, -20], [-22, 255, -80], [22, 265, -80]], speed: 10 },
    { path: [[-18, 230, -170], [18, 240, -170], [18, 230, -240], [-18, 240, -240]], speed: 11 },
    { path: [[0, 245, -300], [16, 240, -330], [-16, 240, -330]], speed: 8 },
  ];
  for (const d of droneDefs) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 1.2), mat(0x1a1b20, { metalness: 0.6 }));
    g.add(body);
    for (const [x, z] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) {
      const rot = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.04, 12), new THREE.MeshBasicMaterial({ color: 0x8a8f9c, transparent: true, opacity: 0.5 }));
      rot.position.set(x, 0.25, z);
      g.add(rot);
    }
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2030 }));
    eye.position.set(0, -0.2, 0.6);
    g.add(eye);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(14, 60, 20, 1, true), makeGlowMaterial(0xdfe8ff, 0.08));
    cone.geometry.translate(0, -30, 0);
    g.add(cone);
    g.position.set(...d.path[0]);
    group.add(g);
    drones.push({ ...d, g, cone, leg: 0, pos: g.position, dir: new THREE.Vector3(0, -1, 0) });
  }

  // ------------------------------------------------------------------ Juno's helicopter (where you jump) and Kitsu's van
  const heli = new THREE.Group();
  const hb = new THREE.Mesh(new THREE.CapsuleGeometry(1.4, 3.4, 6, 12), mat(0x1a1b20, { metalness: 0.5 }));
  hb.rotation.x = Math.PI / 2;
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 5), mat(0x1a1b20));
  tail.position.set(0, 0.3, 4.2);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(11, 0.06, 0.4), mat(0x2a2b31));
  rotor.position.y = 1.7;
  heli.add(hb, tail, rotor);
  heli.position.set(0, 336, 330);
  group.add(heli);
  const van = new THREE.Group();
  const vb = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, 5), mat(0xff7a2a));
  vb.position.y = 1.3;
  const vw = new THREE.Mesh(new THREE.BoxGeometry(2.24, 0.7, 1.4), new THREE.MeshStandardMaterial({ color: 0x0a1420, emissive: 0x1a3048 }));
  vw.position.set(0, 1.9, 1.7);
  van.add(vb, vw);
  van.position.set(48, 0, -366);
  group.add(van);
  world.addBox(46.9, 0, -368.5, 49.1, 2.4, -363.5, { tag: 'prop' });
  const vanRing = new THREE.Mesh(new THREE.RingGeometry(5, 6, 40), makeGlowMaterial(0x4dffa6, 0.85));
  vanRing.rotation.x = -Math.PI / 2;
  vanRing.position.set(44, 0.05, -366);
  const vanBeam = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 160, 16, 1, true), makeGlowMaterial(0x4dffa6, 0.12));
  vanBeam.position.set(44, 80, -366);
  group.add(vanRing, vanBeam);

  // ------------------------------------------------------------------ neon on the skyscrapers (at flying height)
  group.add(buildNeonDressing(towers, makeRng(1718), { signChance: 0.8, minY: 150 }));

  return {
    group, world, towers, updrafts, rings, drones, heli, padRing, gondola, glass, windowBox, tiles, pedestal, gold, van, vanRing, vanBeam, vaultDoorZ,
    pad: new THREE.Vector3(0, K.h, -372),
    vanSpot: new THREE.Vector3(44, 0, -366),
    jump: new THREE.Vector3(0, 330, 322),
    spawn: new THREE.Vector3(0, 330, 322), checkpoints: [], buildings: [], ladders: [], hideSpots: [],
  };
}

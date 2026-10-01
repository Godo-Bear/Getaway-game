import * as THREE from 'three';
import { CollisionWorld } from '../../core/collision.js';
import { makeTextTexture, makeGlowMaterial } from '../materials.js';

// ======================================================================
//  Chapter 8, Part 3: the Glacier Vault, at the top of the mountain, at night.
//
//  Seen from above (north = -Z):
//
//            ┌──────── the mountain (rock) ────────┐
//            │   VAULT (gold)                      │
//   z=-86    │   ── round vault door (dial) ──     │
//            │   ICE TUNNEL (lasers)               │
//   z=-50    │  ═══ steel door (hack the panel) ═══│
//            └─────────────────────────────────────┘
//      snowy summit plateau: guards, 2 searchlight masts, rocks, snowcats
//                                                         ──► the cliff edge (east):
//      CABLE CAR TOP STATION (you arrive, south)              glide down to Juno
//                                                             on the ledge far below
//  The plateau is at y = 0; the drop all around goes down into the clouds.
// ======================================================================

export function buildChapter8Vault() {
  const group = new THREE.Group();
  const world = new CollisionWorld(8);
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
  const M = {
    snow: mat(0xc8d0dc, { roughness: 1 }), rock: mat(0x4a4d55), rockDark: mat(0x34363c), ice: mat(0xa8d8f0, { roughness: 0.15, metalness: 0.1 }),
    steel: mat(0x8a929c, { metalness: 0.7, roughness: 0.3 }), dark: mat(0x1c1e22), gold: mat(0xe8c040, { metalness: 0.9, roughness: 0.25, emissive: 0x3a2a00 }),
    wood: mat(0x6b5236), orange: mat(0xd8641c), station: mat(0x5a6070),
  };
  const block = (x, y, z, w, h, d, material, solid = true, tag = 'wall') => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y + h / 2, z);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    if (solid) world.addBlock(x, y, z, w, h, d, { tag });
    return m;
  };
  const box = (x0, z0, x1, z1, h, material, y = 0) => block((x0 + x1) / 2, y, (z0 + z1) / 2, x1 - x0, h, z1 - z0, material);

  // ------------------------------------------------------------------ the summit plateau
  box(-42, -52, 42, 32, 4, M.snow, -4);                               // snowy ground (top 0), a cliff all round
  box(-42, -52, 42, 32, 60, M.rockDark, -64);                         // the mountain below it
  // the mountain behind (north), with the tunnel cut into it
  // (solid rock, leaving the tunnel (x -4..4, z -86..-50) and the vault room (x -10.5..10.5, z -104..-86) hollow)
  box(-60, -120, -10.5, -50, 34, M.rock); box(10.5, -120, 60, -50, 34, M.rock);
  box(-10.5, -86, -4, -50, 34, M.rock); box(4, -86, 10.5, -50, 34, M.rock);
  box(-4, -86, 4, -50, 28, M.rock, 4.6);                              // rock above the tunnel
  box(-10.5, -104, 10.5, -86, 28, M.rock, 7.2);                       // the vault's ceiling
  box(-10.5, -120, 10.5, -104, 34, M.rock);                           // behind the vault
  box(-60, -130, 60, -120, 34, M.rock);
  const peak = new THREE.Mesh(new THREE.ConeGeometry(70, 90, 7), M.rock);
  peak.position.set(0, 40, -110);
  group.add(peak);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(30, 34, 7), M.snow);
  cap.position.set(0, 71, -110);
  group.add(cap);
  // rocks and snowcats on the plateau (cover)
  for (const [x, z, w, h, d] of [[-24, -10, 5, 2.4, 4], [-8, 6, 3, 1.6, 3], [14, -14, 6, 2.8, 4], [26, 10, 4, 1.8, 5], [-30, 14, 4, 2.2, 3], [6, -32, 5, 1.6, 3], [-16, -36, 4, 2.4, 4]]) {
    block(x, 0, z, w, h, d, M.rock);
    block(x, h, z, w * 0.8, 0.3, d * 0.8, M.snow, false);
  }
  for (const [x, z, rot] of [[-4, -20, 0], [20, -2, 1]]) {
    const cat = new THREE.Group();
    const b = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.6, 4.4), M.orange); b.position.y = 1.3;
    const c = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 2), mat(0x2a3a4a)); c.position.set(0, 2.6, -0.4);
    const t1 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 4.8), M.dark); t1.position.set(-1.3, 0.4, 0);
    const t2 = t1.clone(); t2.position.x = 1.3;
    cat.add(b, c, t1, t2);
    cat.position.set(x, 0, z);
    cat.rotation.y = rot * Math.PI / 2;
    group.add(cat);
    world.addBlock(x, 0, z, rot ? 4.8 : 3.2, 3.1, rot ? 3.2 : 4.8, { tag: 'prop' });
  }

  // ------------------------------------------------------------------ the cable car top station (start)
  box(-14, 22, 2, 32, 0.4, M.station, 0);                             // platform deck
  box(-14, 31.6, 2, 32, 5, M.station); box(-14.3, 22, -14, 32, 5, M.station);
  box(-14.3, 22, 2.3, 22.4, 0.3, M.dark, 5);                          // canopy
  box(-14.3, 22, 2.3, 32, 0.3, M.dark, 5);
  const cabin = new THREE.Group();                                    // the cable car you rode up on
  const cb = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 3), mat(0xc8302a)); cb.position.y = 1.9;
  const win = new THREE.Mesh(new THREE.BoxGeometry(4.05, 1, 3.05), mat(0x9fd4ff, { emissive: 0x204060 })); win.position.y = 2.4;
  cabin.add(cb, win);
  cabin.position.set(-6, 0.4, 28.5);
  group.add(cabin);
  world.addBlock(-6, 0.4, 28.5, 4, 3.3, 3, { tag: 'prop' });
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 300, 6), mat(0x22252a));
  cable.position.set(-6, -40, 140);
  cable.rotation.x = 1.13;
  group.add(cable);
  const stSign = new THREE.Mesh(new THREE.PlaneGeometry(7, 0.9), new THREE.MeshBasicMaterial({ map: makeTextTexture('GLACIER BANK · SUMMIT', { color: '#9fd4ff', bg: 'rgba(12,14,22,0.92)', width: 1024, height: 128, font: 'bold 80px "Bebas Neue", Impact, sans-serif' }), toneMapped: false }));
  stSign.position.set(-6, 4.4, 21.9);
  stSign.rotation.y = Math.PI;
  group.add(stSign);

  // ------------------------------------------------------------------ the tunnel door (hack the panel)
  const tunnelDoor = block(0, 0, -50, 8, 4.6, 0.4, M.steel);
  const tunnelDoorBox = world.boxes[world.boxes.length - 1];
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.1), new THREE.MeshStandardMaterial({ color: 0x1a1c22, emissive: 0xff3030, emissiveIntensity: 1 }));
  panel.position.set(5.2, 1.4, -49.6);
  group.add(panel);
  const doorSign = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.8), new THREE.MeshBasicMaterial({ map: makeTextTexture('AUTHORISED STAFF ONLY', { color: '#ffd040', bg: 'rgba(12,14,22,0.92)', width: 1024, height: 128, font: 'bold 80px "Bebas Neue", Impact, sans-serif' }), toneMapped: false }));
  doorSign.position.set(0, 5.2, -49.75);
  group.add(doorSign);

  // ------------------------------------------------------------------ the ice tunnel (z -50 .. -86)
  const iceFloor = new THREE.Mesh(new THREE.PlaneGeometry(8, 36), M.ice);
  iceFloor.rotation.x = -Math.PI / 2;
  iceFloor.position.set(0, 0.01, -68);
  group.add(iceFloor);
  world.addBox(-4, -2, -86, 4, 0, -50, { tag: 'ground' });
  for (let z = -54; z > -86; z -= 8) {                                  // blue strip lights
    const l = new THREE.Mesh(new THREE.BoxGeometry(6, 0.06, 0.3), new THREE.MeshBasicMaterial({ color: 0xbfe6ff, toneMapped: false }));
    l.position.set(0, 4.5, z);
    group.add(l);
  }
  const tunnelLight = new THREE.PointLight(0xbfe6ff, 25, 40, 1.5);
  tunnelLight.position.set(0, 4, -68);
  group.add(tunnelLight);
  // icicles (scenery)
  for (let k = 0; k < 18; k++) {
    const ic = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.8 + (k % 3) * 0.3, 6), M.ice);
    ic.rotation.x = Math.PI;
    ic.position.set(-3.6 + (k % 2) * 7.2, 4.2, -52 - k * 1.9);
    group.add(ic);
  }
  // lasers across the tunnel (beams along X; the mode switches them on and off)
  const lasers = [
    { z: -58, type: 'pulse', heights: [0.45, 1.15, 1.85], phase: 0 },
    { z: -64, type: 'low', heights: [1.15] },
    { z: -70, type: 'pulse', heights: [0.45, 1.15, 1.85], phase: 0.45 },
    { z: -76, type: 'low', heights: [1.15] },
    { z: -81, type: 'pulse', heights: [0.45, 1.15, 1.85], phase: 0.2 },
  ];
  for (const las of lasers) {
    las.beams = las.heights.map((y) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(7.8, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: 0xff2030, toneMapped: false, transparent: true }));
      b.position.set(0, y, las.z);
      group.add(b);
      return b;
    });
    for (const x of [-3.9, 3.9]) block(x, 0, las.z, 0.2, 2.2, 0.2, M.dark, false);
  }

  // ------------------------------------------------------------------ the vault (z -86 .. -104)
  box(-10, -104, 10, -86, 0.01, M.steel, -0.01);
  world.addBox(-10, -2, -104, 10, 0, -86, { tag: 'ground' });
  box(-10.5, -86.5, -4, -86, 6, M.rockDark); box(4, -86.5, 10.5, -86, 6, M.rockDark); // front wall either side of the door
  box(-4, -86.5, 4, -86, 1.6, M.rockDark, 5.6);
  const vaultDoorPivot = new THREE.Group();
  vaultDoorPivot.position.set(-3.2, 0, -86.2);
  group.add(vaultDoorPivot);
  const vd = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 0.7, 40), M.steel);
  vd.rotation.x = Math.PI / 2;
  vd.position.set(3.2, 2.8, 0);
  vaultDoorPivot.add(vd);
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.2, 24), mat(0xd8c070, { metalness: 0.9, roughness: 0.2 }));
  dial.rotation.x = Math.PI / 2;
  dial.position.set(3.2, 2.8, 0.45);
  vaultDoorPivot.add(dial);
  world.addBox(-4, 0, -86.6, 4, 5.6, -85.8, { tag: 'wall' });
  const vaultDoorBox = world.boxes[world.boxes.length - 1];
  // gold on shelves
  const gold = [];
  for (const [x, z] of [[-7, -92], [7, -92], [-7, -99], [7, -99]]) {
    block(x, 0, z, 2.4, 0.9, 1.4, M.wood, true, 'prop');
    const stack = new THREE.Group();
    for (let k = 0; k < 6; k++) { const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.9), M.gold); bar.position.set(-0.6 + (k % 3) * 0.6, 0.1 + Math.floor(k / 3) * 0.2, 0); stack.add(bar); }
    stack.position.set(x, 0.9, z);
    group.add(stack);
    gold.push({ pos: new THREE.Vector3(x + (x < 0 ? 1.8 : -1.8), 0, z), stack });
  }
  const vaultLight = new THREE.PointLight(0xffe6a0, 30, 30, 1.5);
  vaultLight.position.set(0, 5, -95);
  group.add(vaultLight);

  // ------------------------------------------------------------------ the glide down
  // the jump point on the east edge, and Juno's ledge far below
  box(38, -14, 46, -6, 0.6, M.wood, -0.6);                           // a little wooden jump deck past the edge
  const jumpGlow = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.1, 32), makeGlowMaterial(0xff9ad5, 0.8));
  jumpGlow.rotation.x = -Math.PI / 2;
  jumpGlow.position.set(43, 0.05, -10);
  group.add(jumpGlow);
  const LEDGE = { x: 160, y: -24, z: -10 };   // (a held glide from the deck comes down right on it)
  box(LEDGE.x - 18, LEDGE.z - 18, LEDGE.x + 18, LEDGE.z + 18, 4, M.snow, LEDGE.y - 4);
  box(LEDGE.x - 18, LEDGE.z - 18, LEDGE.x + 18, LEDGE.z + 18, 40, M.rockDark, LEDGE.y - 44);
  const landGlow = new THREE.Mesh(new THREE.RingGeometry(5, 6, 40), makeGlowMaterial(0x4dffa6, 0.85));
  landGlow.rotation.x = -Math.PI / 2;
  landGlow.position.set(LEDGE.x, LEDGE.y + 0.06, LEDGE.z);
  group.add(landGlow);
  const landBeam = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 120, 16, 1, true), makeGlowMaterial(0x4dffa6, 0.18));
  landBeam.position.set(LEDGE.x, LEDGE.y + 60, LEDGE.z);
  group.add(landBeam);
  // snowmobile waiting on the ledge
  const sled = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1, 2.8), M.orange);
  sled.position.set(LEDGE.x + 4, LEDGE.y + 0.5, LEDGE.z);
  group.add(sled);
  // clouds below (a soft white floor far down)
  const clouds = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshLambertMaterial({ color: 0xb8c4d4, transparent: true, opacity: 0.85 }));
  clouds.rotation.x = -Math.PI / 2;
  clouds.position.y = -70;
  group.add(clouds);
  // mountains in the distance
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2, r = 380;
    const mtn = new THREE.Mesh(new THREE.ConeGeometry(90 + (k % 3) * 30, 160 + (k % 4) * 40, 6), M.rock);
    mtn.position.set(Math.cos(a) * r, -10, Math.sin(a) * r);
    const sc = new THREE.Mesh(new THREE.ConeGeometry(34 + (k % 3) * 10, 60, 6), M.snow);
    sc.position.set(mtn.position.x, mtn.position.y + (160 + (k % 4) * 40) / 2 - 22, mtn.position.z);
    group.add(mtn, sc);
  }

  // ------------------------------------------------------------------ guards, searchlights, places
  const guardRoutes = [
    [[-30, 2], [-10, 2], [-10, -24], [-30, -24]],
    [[8, -24], [32, -24], [32, 4], [8, 4]],
    [[-12, -44], [12, -44]],                      // in front of the tunnel door
    [[0, -60], [0, -80]],                         // in the ice tunnel (only after you open the door... he's in there)
  ];
  const towers = [
    { x: -38, z: -46, h: 11, path: [[-24, -30], [-6, -40], [-20, -12], [-32, -2]] },
    { x: 38, z: -46, h: 11, path: [[22, -30], [6, -40], [24, -8], [34, -18]] },
  ];
  for (const t of towers) {
    block(t.x, 0, t.z, 0.4, t.h - 0.6, 0.4, M.dark, false);
    world.addBlock(t.x, 0, t.z, 1, t.h - 0.6, 1, { tag: 'tower' });
  }
  const spots = {
    panel: new THREE.Vector3(5.2, 0, -48.6),
    dial: new THREE.Vector3(0, 0, -84.6),
    jump: new THREE.Vector3(43, 0, -10),
    ledge: new THREE.Vector3(LEDGE.x, LEDGE.y, LEDGE.z),
  };
  const V = (x, z, y = 0.05) => new THREE.Vector3(x, y, z);
  const checkpoints = [
    { name: 'The cable car station', spawn: V(-6, 25.5, 0.45), yaw: 0 },
    { name: 'The ice tunnel', spawn: V(0, -53), yaw: 0 },
    { name: 'The vault', spawn: V(0, -90), yaw: 0 },
    { name: 'The plateau', spawn: V(0, -46), yaw: -Math.PI / 2 },
  ];

  return {
    group, world, spawn: checkpoints[0].spawn, checkpoints, buildings: [], ladders: [], hideSpots: [],
    tunnelDoor, tunnelDoorBox, panel, lasers, vaultDoorPivot, vaultDoorBox, gold, guardRoutes, towers, spots, landGlow, jumpGlow,
  };
}

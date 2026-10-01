import * as THREE from 'three';
import { CollisionWorld } from '../../core/collision.js';
import { makeGlowMaterial } from '../materials.js';

// ======================================================================
//  Chapter 6, Part 2: the prison supply train, moving at night.
//
//  THE TRICK: the train never moves. It sits still along the Z axis (front
//  = -Z) and the countryside scrolls past it towards +Z (see TrainMode), so
//  the player controller, the guards and the collisions all work exactly
//  like on a normal level. Low bridges are scenery that scrolls along the
//  train: TrainMode knocks you off if one reaches you while you're standing
//  on a roof.
//
//  Wagons, rear to front:
//   caboose (start, rear platform) · boxcar · flatcar with crates · MAIL CAR ·
//   tanker (narrow walkway) · boxcar · container flatcar · COAL WAGON (the
//   goal: drop inside and hide under the tarp) · locomotive
// ======================================================================

export const TRAIN_SPEED = 20;       // m/s the scenery scrolls past
export const WIDTH = 3.0;            // wagon width

export function buildChapter6Train() {
  const group = new THREE.Group();
  const world = new CollisionWorld(8);
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...extra });
  const M = {
    red: mat(0x7a2e1e), rust: mat(0x6a3a22), grey: mat(0x5a5f68, { metalness: 0.4 }), dark: mat(0x1c1e22),
    tank: mat(0x2a2e36, { metalness: 0.5, roughness: 0.4 }), wood: mat(0x6b5236), crate: mat(0x7a5a36),
    container: mat(0x1f5a8a), loco: mat(0xc9a227, { metalness: 0.3 }), tarp: mat(0x2f4a2a, { roughness: 0.95 }),
    coal: mat(0x151515, { roughness: 1 }),
  };
  const block = (x, y, z, w, h, d, material, solid = true, tag = 'train') => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y + h / 2, z);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    if (solid) world.addBlock(x, y, z, w, h, d, { tag });
    return m;
  };
  const wheels = (z0, z1) => {
    for (const z of [z0 - 1.6, z1 + 1.6]) {
      block(0, 0.3, z, WIDTH - 0.3, 0.7, 2.6, M.dark, false);
      for (const sx of [-1.1, 1.1]) for (const dz of [-0.7, 0.7]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.2, 14), M.dark);
        w.rotation.z = Math.PI / 2;
        w.position.set(sx, 0.45, z + dz);
        group.add(w);
      }
    }
  };

  // The ground under the train: you land on it if you fall off (TrainMode
  // then sends you back). The visible ground is scenery (it scrolls).
  world.addBox(-400, -2, -400, 400, 0, 400, { tag: 'ground' });

  const wagons = [];
  let z = 0;
  const add = (kind, len, gap, build) => {
    const z0 = z, z1 = z - len; // z0 = rear end, z1 = front end
    wheels(z0, z1);
    const info = build(z0, z1, (z0 + z1) / 2) || {};
    wagons.push({ kind, z0, z1, ...info });
    z = z1 - gap;
    // coupler across the gap
    if (gap > 0) block(0, 0.9, z1 - gap / 2, 0.3, 0.3, gap, M.dark, false);
  };

  // Caboose + rear platform (you climb on here)
  const platformZ = 2.6;
  block(0, 0.8, platformZ / 2, WIDTH, 0.5, platformZ, M.grey);                   // platform deck (top 1.3)
  block(0, 1.3, 0.45, 1.1, 1.2, 0.8, M.crate);                                   // a crate to step up on (against the caboose)
  add('caboose', 10, 1.8, (z0, z1, zc) => {
    block(0, 0.8, zc, WIDTH, 3.2, z0 - z1, M.red);                               // roof at 4.0
    block(0, 4.0, zc, 1.8, 0.9, 3, M.red);                                        // lookout cupola
    return { roof: 4.0 };
  });
  add('boxcar', 14, 2.2, (z0, z1, zc) => { block(0, 0.8, zc, WIDTH, 3.4, z0 - z1, M.rust); return { roof: 4.2 }; });
  add('flatcar', 14, 1.8, (z0, z1, zc) => {
    block(0, 0.8, zc, WIDTH, 0.6, z0 - z1, M.wood);                               // deck (top 1.4)
    block(-0.6, 1.4, z0 - 2.5, 1.4, 1.4, 1.4, M.crate);                           // crates to climb back up
    block(0.6, 1.4, z1 + 3.2, 1.4, 1.4, 1.4, M.crate);
    block(0.6, 2.8, z1 + 1.5, 1.4, 1.4, 1.4, M.crate);
    block(0.6, 1.4, z1 + 1.5, 1.4, 1.4, 1.4, M.crate);
    return { roof: 1.4, low: true };
  });
  // The MAIL CAR: closed, with a hatch in the roof (drop in), the prison's
  // safe at the front end (gate pass + payroll) and a guard inside.
  add('mail', 16, 1.8, (z0, z1, zc) => {
    const len = z0 - z1, steel = mat(0x8a929c, { metalness: 0.7, roughness: 0.3 });
    block(0, 0.8, zc, WIDTH, 0.4, len, M.dark);                                     // floor (top 1.2)
    for (const sx of [-1, 1]) block(sx * (WIDTH / 2 - 0.075), 1.2, zc, 0.15, 3.0, len, M.red); // side walls
    block(0, 1.2, z0 - 0.075, WIDTH, 3.0, 0.15, M.red);
    block(0, 1.2, z1 + 0.075, WIDTH, 3.0, 0.15, M.red);
    const hz0 = z0 - 2.0, hz1 = z0 - 3.8;                                           // the hatch (1.8 m long)
    block(0, 4.0, (z0 + hz0) / 2, WIDTH, 0.2, z0 - hz0, M.red);
    block(0, 4.0, (hz1 + z1) / 2, WIDTH, 0.2, hz1 - z1, M.red);
    for (const sx of [-1, 1]) block(sx * 1.15, 4.0, (hz0 + hz1) / 2, 0.7, 0.2, hz0 - hz1, M.red);
    const rim = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 4, 1), makeGlowMaterial(0xffd040, 0.7));
    rim.rotation.set(-Math.PI / 2, 0, Math.PI / 4);
    rim.scale.set(1, 1.15, 1);
    rim.position.set(0, 4.22, (hz0 + hz1) / 2);
    group.add(rim);
    // mail sacks, and the safe at the front
    for (const [x, z] of [[-0.9, zc + 2], [0.9, zc - 1], [-0.9, zc - 3]]) block(x, 1.2, z, 0.9, 0.7, 1.2, M.crate, true, 'prop');
    block(0, 1.2, z1 + 0.6, 1.2, 1.3, 0.8, steel);
    const lamp = new THREE.PointLight(0xffd8a0, 8, 12, 1.6);
    lamp.position.set(0, 3.6, zc);
    group.add(lamp);
    return { roof: 4.2, hatch: new THREE.Vector3(0, 4.2, (hz0 + hz1) / 2), safe: new THREE.Vector3(0, 1.2, z1 + 1.7), inside: { z0: z0 - 0.3, z1: z1 + 0.3 } };
  });
  add('tanker', 12, 2.0, (z0, z1, zc) => {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, z0 - z1, 20), M.tank);
    t.rotation.x = Math.PI / 2;
    t.position.set(0, 2.2, zc);
    t.castShadow = true;
    group.add(t);
    world.addBlock(0, 0.8, zc, 2.2, 2.8, z0 - z1, { tag: 'train' });
    block(0, 3.6, zc, 1.3, 0.08, z0 - z1 - 1, M.grey);                            // walkway on top (3.68)
    return { roof: 3.68 };
  });
  add('boxcar', 14, 2.6, (z0, z1, zc) => { block(0, 0.8, zc, WIDTH, 3.4, z0 - z1, M.rust); return { roof: 4.2 }; });
  add('container', 13, 2.0, (z0, z1, zc) => {
    block(0, 0.8, zc, WIDTH, 0.6, z0 - z1, M.wood);
    block(0, 1.4, zc, 2.6, 2.6, z0 - z1 - 1, M.container);                      // roof at 4.0
    return { roof: 4.0 };
  });
  add('coal', 12, 1.6, (z0, z1, zc) => {
    block(0, 0.8, zc, WIDTH, 0.4, z0 - z1, M.dark);                               // floor (top 1.2)
    block(-WIDTH / 2 + 0.1, 1.2, zc, 0.2, 1.6, z0 - z1, M.grey);                  // side walls (top 2.8)
    block(WIDTH / 2 - 0.1, 1.2, zc, 0.2, 1.6, z0 - z1, M.grey);
    block(0, 1.2, z0 - 0.1, WIDTH, 1.6, 0.2, M.grey);
    block(0, 1.2, z1 + 0.1, WIDTH, 1.6, 0.2, M.grey);
    block(0, 1.2, zc - 2.5, WIDTH - 0.4, 0.5, 5, M.coal, false);                  // coal heap (front half)
    const tarp = block(0, 2.75, zc - 2.8, WIDTH + 0.2, 0.08, 6, M.tarp, false);  // tarp over the front half
    tarp.rotation.x = 0.04;
    return { roof: 1.2, goal: true };
  });
  add('loco', 16, 0, (z0, z1, zc) => {
    block(0, 0.8, zc, WIDTH, 2.2, z0 - z1, M.loco);
    block(0, 3.0, z0 - 3.5, WIDTH, 1.6, 6, M.loco);                               // cab (roof 4.6)
    const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.4, 16), new THREE.MeshBasicMaterial({ color: 0xfff2c0, toneMapped: false }));
    lamp.position.set(0, 2.4, z1 - 0.01);
    lamp.rotation.y = Math.PI;
    group.add(lamp);
    return { roof: 3.0 };
  });

  // The head lamp lights the track ahead
  const head = new THREE.SpotLight(0xfff0d0, 200, 120, 0.4, 0.5, 1.2);
  const front = wagons[wagons.length - 1].z1;
  head.position.set(0, 3, front);
  head.target.position.set(0, 0, front - 60);
  group.add(head, head.target);

  // Rails under the train (they don't need to move: steel looks the same)
  for (const sx of [-0.75, 0.75]) block(sx, 0, -200, 0.12, 0.14, 800, M.grey, false);

  const byKind = (k) => wagons.filter((w) => w.kind === k);
  const coal = byKind('coal')[0];
  const [box1, box3] = byKind('boxcar');
  const flat = byKind('flatcar')[0];
  const mail = byKind('mail')[0];
  // Part A: from the back of the train to the mail car. Part B: from the
  // mail car's roof to the coal wagon at the front.
  const checkpointsA = [
    { name: 'The back of the train', spawn: new THREE.Vector3(0, 1.35, 1.4), yaw: 0, z: 1 },
    { name: 'The crate wagon', spawn: new THREE.Vector3(0, 1.45, (flat.z0 + flat.z1) / 2), yaw: 0, z: (flat.z0 + flat.z1) / 2 },
    { name: 'Inside the mail car', spawn: new THREE.Vector3(0, 1.25, mail.hatch.z - 2.4), yaw: 0, z: mail.hatch.z - 1 },
  ];
  const checkpointsB = [
    { name: 'On the mail car', spawn: new THREE.Vector3(0, 4.25, mail.z1 + 3), yaw: 0, z: mail.z1 + 4 },
    { name: 'The container wagon', spawn: new THREE.Vector3(0, 4.25, (box3.z0 + box3.z1) / 2), yaw: 0, z: (box3.z0 + box3.z1) / 2 },
  ];
  const checkpoints = checkpointsA;
  // Payroll bags along the train (on roofs and decks)
  const bagAt = (w, t, dx = 0) => new THREE.Vector3(dx, w.roof + 0.05, w.z0 + (w.z1 - w.z0) * t);
  const tanker = byKind('tanker')[0], cont = byKind('container')[0];
  const bags = [bagAt(box1, 0.7, 0.8), bagAt(flat, 0.45, -0.7), bagAt(mail, 0.75, -0.8), bagAt(tanker, 0.6), bagAt(box3, 0.8, 0.8), bagAt(cont, 0.5, -0.7)];
  // Guards with torches pace up and down two roofs
  const guardRoutes = [
    [[0, box1.z0 - 2], [0, box1.z1 + 2]],
    [[0, box3.z0 - 2], [0, box3.z1 + 2]],
  ];
  // Where you hide: the covered half of the coal wagon
  const hide = { minX: -1.3, maxX: 1.3, minZ: (coal.z0 + coal.z1) / 2 - 5.5, maxZ: (coal.z0 + coal.z1) / 2 + 0.5, maxY: 2.4 };
  const hideGlow = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 5), makeGlowMaterial(0x4dffa6, 0.25));
  hideGlow.rotation.x = -Math.PI / 2;
  hideGlow.position.set(0, 1.23, (hide.minZ + hide.maxZ) / 2);
  group.add(hideGlow);

  return {
    group, world, spawn: checkpoints[0].spawn, checkpoints, buildings: [], ladders: [], hideSpots: [],
    wagons, bags, guardRoutes, hide, hideGlow, front, back: platformZ, mail, checkpointsA, checkpointsB,
    mailGuardRoute: [[0, mail.hatch.z - 2.5], [0, mail.z1 + 3]],
    goalPos: new THREE.Vector3(0, 1.3, (hide.minZ + hide.maxZ) / 2),
  };
}

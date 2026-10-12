import * as THREE from 'three';
import { CollisionWorld } from '../../core/collision.js';
import { makeGlowMaterial, makeTextTexture, getGlowTexture } from '../materials.js';

// ======================================================================
//  Chapter 24, Part 4: the turbine hall, deep inside the Coyote Dam. A long
//  hall with three great turbines down the middle (yellow generator tops,
//  their shafts turning), steam vents in the floor, doors either side where
//  the Jackals come in, and at the far end a cage: Ricky's in it.
// ======================================================================

export const HALL = { x0: -21, x1: 21, z0: -9.5, z1: 9.5 };
export const TURBINES = [[-10, 0], [0, 0], [10, 0]];
export const TURBINE_R = 2.7;
export const VENTS = [[-15, -5.5], [-5, 5.5], [5, -5.5], [15, 5.5], [-5, -6.2], [5, 6.2]];
export const VENT_R = 1.35;
export const DOORS = [[-3, -9.5], [7, 9.5], [-12, 9.5], [13, -9.5]];
export const CAGE = { x: 18.6, z: 0 };

export function buildChapter24Turbines() {
  const group = new THREE.Group();
  const world = new CollisionWorld(6);
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });
  const box = (x0, y0, z0, x1, y1, z1, mat, solid = true, tag = 'wall') => {
    if (mat) { const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); group.add(m); }
    if (solid) world.addBox(x0, y0, z0, x1, y1, z1, { tag });
  };
  const H = HALL;

  // ---------------------------------------------------------------- the hall: floor, walls, ceiling
  const floorTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#5a5e5a'; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2;
    for (let i = 0; i <= 128; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(128, i); g.stroke(); }
    for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`; g.fillRect(Math.random() * 128, Math.random() * 128, 4, 4); }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(12, 6);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  box(H.x0 - 1, -1, H.z0 - 1, H.x1 + 1, 0, H.z1 + 1, std(0xffffff, { map: floorTex }), true, 'roof');
  const wallMat = std(0x8a8478);
  box(H.x0 - 1.5, 0, H.z0 - 1.5, H.x1 + 1.5, 14, H.z0, wallMat);
  box(H.x0 - 1.5, 0, H.z1, H.x1 + 1.5, 14, H.z1 + 1.5, wallMat);
  box(H.x0 - 1.5, 0, H.z0, H.x0, 14, H.z1, wallMat);
  box(H.x1, 0, H.z0, H.x1 + 1.5, 14, H.z1, wallMat);
  box(H.x0 - 1.5, 14, H.z0 - 1.5, H.x1 + 1.5, 15, H.z1 + 1.5, std(0x4a4640), false);
  // a yellow-and-black safety stripe round the walls
  const stripe = (() => {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 16;
    const g = c.getContext('2d');
    for (let i = -16; i < 144; i += 16) { g.fillStyle = (i / 16) % 2 ? '#1a1a1a' : '#e8b020'; g.beginPath(); g.moveTo(i, 16); g.lineTo(i + 8, 0); g.lineTo(i + 16, 0); g.lineTo(i + 8, 16); g.fill(); }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  for (const [len, x, z, ry] of [[H.x1 - H.x0, 0, H.z0 + 0.02, 0], [H.x1 - H.x0, 0, H.z1 - 0.02, Math.PI], [H.z1 - H.z0, H.x0 + 0.02, 0, Math.PI / 2], [H.z1 - H.z0, H.x1 - 0.02, 0, -Math.PI / 2]]) {
    const t = stripe.clone();
    t.needsUpdate = true;
    t.repeat.set(len / 1.2, 1);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.4), new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 }));
    m.position.set(x, 1.1, z);
    m.rotation.y = ry;
    group.add(m);
  }
  // the crane rails along the top and the big pipes
  for (const z of [H.z0 + 0.6, H.z1 - 0.6]) box(H.x0, 10.5, z - 0.3, H.x1, 11.1, z + 0.3, std(0xc8a020, { metalness: 0.4 }), false);
  box(-6, 10.3, H.z0 + 0.6, -4.6, 11.4, H.z1 - 0.6, std(0xc8a020, { metalness: 0.4 }), false);
  for (const z of [H.z0 + 1.4, H.z1 - 1.4]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, H.x1 - H.x0, 14), std(0x3a5a6a, { metalness: 0.5, roughness: 0.5 }));
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(0, 7.5, z);
    group.add(pipe);
  }

  // ---------------------------------------------------------------- the turbines
  const shafts = [];
  for (const [x, z] of TURBINES) {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(TURBINE_R, TURBINE_R + 0.3, 1.1, 28), std(0x6a6a70, { metalness: 0.5 }));
    base.position.set(x, 0.55, z);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(TURBINE_R - 0.5, TURBINE_R - 0.2, 1.4, 28), std(0xe8b020, { metalness: 0.3, roughness: 0.5 }));
    top.position.set(x, 1.8, z);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.2, 0.6, 16), std(0x2a2a30, { metalness: 0.6 }));
    cap.position.set(x, 2.8, z);
    const shaft = new THREE.Group();
    shaft.position.set(x, 3.1, z);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.6, 12), std(0x9a9aa0, { metalness: 0.8, roughness: 0.3 }));
    hub.position.y = 0.3;
    shaft.add(hub);
    for (let k = 0; k < 4; k++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 0.2), std(0xd8302a));
      fin.position.set(Math.cos((k * Math.PI) / 2) * 0.75, 0.35, Math.sin((k * Math.PI) / 2) * 0.75);
      fin.rotation.y = -(k * Math.PI) / 2;
      shaft.add(fin);
    }
    shafts.push(shaft);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.5), new THREE.MeshBasicMaterial({ map: makeTextTexture(`UNIT ${TURBINES.findIndex((t) => t[0] === x) + 1}`, { color: '#1a1a1a', bg: '#e8b020', width: 256, height: 64, font: 'bold 44px Impact, sans-serif', glow: false }) }));
    label.position.set(x, 1.8, z + TURBINE_R - 0.33);
    label.rotation.x = -0.12;
    group.add(base, top, cap, shaft, label);
    // (you can't walk through one: an octagon of boxes)
    const r = TURBINE_R * 0.92;
    world.addBox(x - r, 0, z - r * 0.42, x + r, 2.5, z + r * 0.42, { tag: 'wall' });
    world.addBox(x - r * 0.42, 0, z - r, x + r * 0.42, 2.5, z + r, { tag: 'wall' });
    world.addBox(x - r * 0.72, 0, z - r * 0.72, x + r * 0.72, 2.5, z + r * 0.72, { tag: 'wall' });
  }

  // ---------------------------------------------------------------- steam vents (grates in the floor)
  const vents = VENTS.map(([x, z]) => {
    const grate = new THREE.Mesh(new THREE.CircleGeometry(VENT_R, 20), std(0x2a2a2e, { metalness: 0.6 }));
    grate.rotation.x = -Math.PI / 2;
    grate.position.set(x, 0.02, z);
    const glow = new THREE.Mesh(new THREE.RingGeometry(VENT_R - 0.15, VENT_R, 24), makeGlowMaterial(0xffa020, 0.0));
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(x, 0.03, z);
    const plume = new THREE.Mesh(new THREE.CylinderGeometry(VENT_R * 0.9, VENT_R * 0.7, 1, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xe8eef2, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }));
    plume.geometry.translate(0, 0.5, 0);
    plume.position.set(x, 0, z);
    plume.scale.y = 0.01;
    plume.visible = false;
    const puffs = [];
    for (let k = 0; k < 5; k++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0xdfe6ea, transparent: true, opacity: 0.6, depthWrite: false }));
      s.visible = false;
      group.add(s);
      puffs.push(s);
    }
    group.add(grate, glow, plume);
    return { x, z, glow, plume, puffs };
  });

  // ---------------------------------------------------------------- doors the Jackals come in by
  for (const [x, z] of DOORS) {
    const s = Math.sign(z);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.2, 0.3), std(0x3a3a40, { metalness: 0.5 }));
    frame.position.set(x, 1.6, z - s * 0.05);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.2), makeGlowMaterial(0xff3a2a, 0.9));
    lamp.position.set(x, 3.5, z - s * 0.12);
    group.add(frame, lamp);
  }

  // ---------------------------------------------------------------- the cage (Ricky)
  const cage = new THREE.Group();
  cage.position.set(CAGE.x, 0, CAGE.z);
  const barMat = std(0x2a2a2e, { metalness: 0.7, roughness: 0.4 });
  const bars = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 6), barMat, 40);
  const o = new THREE.Object3D();
  let n = 0;
  for (let i = 0; i <= 8; i++) { o.position.set(-1.3, 1.3, -1.4 + i * 0.35); o.updateMatrix(); bars.setMatrixAt(n++, o.matrix); }
  for (const zz of [-1.4, 1.4]) for (let i = 1; i < 8; i++) { o.position.set(-1.3 + i * 0.33, 1.3, zz); o.updateMatrix(); bars.setMatrixAt(n++, o.matrix); }
  bars.count = n;
  cage.add(bars);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.1, 3), barMat);
  roof.position.y = 2.6;
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.3, 0.15), std(0xc8a030, { metalness: 0.8 }));
  lock.position.set(-1.38, 1.2, 0);
  cage.add(roof, lock);
  group.add(cage);
  world.addBox(CAGE.x - 1.4, 0, CAGE.z - 1.5, H.x1, 2.7, CAGE.z + 1.5, { tag: 'wall' });

  // ---------------------------------------------------------------- lights
  for (const x of [-14, 0, 14]) {
    const lamp = new THREE.PointLight(0xffe0b0, 40, 26, 1.5);
    lamp.position.set(x, 9, 0);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.7, 0.5, 12, 1, true), std(0x2a2a2e, { side: THREE.DoubleSide }));
    shade.position.set(x, 9.5, 0);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0xffe0b0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    glow.position.set(x, 9.2, 0);
    glow.scale.setScalar(2.4);
    group.add(lamp, shade, glow);
  }
  const red = new THREE.PointLight(0xff4030, 12, 10, 1.6);
  red.position.set(CAGE.x - 1, 3.5, 0);
  group.add(red);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.2), new THREE.MeshBasicMaterial({ map: makeTextTexture('COYOTE DAM · POWER HOUSE', { color: '#ffd070', bg: '#2a2420', width: 1024, height: 128, font: 'bold 72px Impact, sans-serif' }) }));
  sign.position.set(-H.x0 > 0 ? H.x0 + 0.05 : 0, 6, 0);
  sign.rotation.y = Math.PI / 2;
  group.add(sign);

  const spawn = new THREE.Vector3(-18, 0.05, 0);
  spawn.yaw = -Math.PI / 2; // (looking down the hall, +x)
  return { group, world, spawn, ladders: [], shafts, vents, cage, lock };
}

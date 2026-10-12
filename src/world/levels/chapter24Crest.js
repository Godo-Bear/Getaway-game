import * as THREE from 'three';
import { CollisionWorld } from '../../core/collision.js';
import { makeGlowMaterial, makeTextTexture, getGlowTexture } from '../materials.js';
import { buildMesa } from '../desert.js';
import { makeRng } from '../../core/utils.js';

// ======================================================================
//  Chapter 24, Part 5: the top of the Coyote Dam, in a storm: the plaza on
//  the crest where Sable is waiting (the final fight). The lake is behind
//  the dam (-z, a few metres down), the canyon in front of it (+z, sixty
//  metres down). Railings along both sides (you can't go over them),
//  gatehouses at both ends, four crates (Sable can charge into them), the
//  floodgate control house.
// ======================================================================

export const ARENA = { x0: -16.5, x1: 16.5, z0: -11.2, z1: 11.2 };
export const CRATES = [[-9, -5.5], [10, -6], [-8.5, 5.5], [9, 6]];
export const CRATE_HALF = 0.8;

function concreteTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#8a8680'; g.fillRect(0, 0, 128, 128);
  const rng = makeRng(24);
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(${rng() < 0.5 ? '0,0,0' : '255,255,255'},${0.03 + rng() * 0.05})`; g.fillRect(rng() * 128, rng() * 128, 3, 3); }
  g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2;
  for (let x = 0; x <= 128; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 128); g.stroke(); g.beginPath(); g.moveTo(0, x); g.lineTo(128, x); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildChapter24Crest() {
  const group = new THREE.Group();
  const world = new CollisionWorld(6);
  const rng = makeRng(2405);
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
  const box = (x0, y0, z0, x1, y1, z1, mat, solid = true) => {
    if (mat) { const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); group.add(m); }
    if (solid) world.addBox(x0, y0, z0, x1, y1, z1, { tag: 'wall' });
  };

  // ---------------------------------------------------------------- the crest: a wide concrete plaza, a long road either side
  const ct = concreteTexture();
  ct.repeat.set(10, 7);
  const deck = std(0xffffff, { map: ct });
  box(-60, -3, -13, 60, 0, 13, deck, false);
  world.addBox(-60, -3, -13, 60, 0, 13, { tag: 'roof' });
  // the helipad
  const pad = new THREE.Mesh(new THREE.CircleGeometry(5, 40), std(0x3a3a40));
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.02;
  const h = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({ map: makeTextTexture('H', { color: '#f2f2f2', bg: 'rgba(0,0,0,0)', width: 128, height: 128, font: 'bold 120px Impact, sans-serif', glow: false }), transparent: true }));
  h.rotation.x = -Math.PI / 2;
  h.position.y = 0.03;
  const ring = new THREE.Mesh(new THREE.RingGeometry(4.6, 5, 40), makeGlowMaterial(0xffd040, 0.5));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  group.add(pad, h, ring);
  // railings: a rail you can see, and a wall you can't (too high to vault)
  const rail = std(0x6a6a72, { metalness: 0.6, roughness: 0.4 });
  for (const z of [ARENA.z0 - 0.6, ARENA.z1 + 0.6]) {
    box(-60, 0, z - 0.1, 60, 3.2, z + 0.1, null);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(120, 0.08, 0.08), rail);
    bar.position.set(0, 1.1, z);
    group.add(bar);
    const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 1.1, 0.08), rail, 61);
    const o = new THREE.Object3D();
    for (let i = 0; i < 61; i++) { o.position.set(-60 + i * 2, 0.55, z); o.updateMatrix(); posts.setMatrixAt(i, o.matrix); }
    group.add(posts);
  }
  // the gatehouses at both ends (the plaza's ends), with their floodlights
  for (const s of [-1, 1]) {
    box(s * 17.5 - 2.5, 0, -13, s * 17.5 + 2.5, 8, -4, std(0x9a948a));
    box(s * 17.5 - 2.5, 0, 4, s * 17.5 + 2.5, 8, 13, std(0x9a948a));
    box(s * 17.5 - 2.5, 6, -4, s * 17.5 + 2.5, 8, 4, std(0x9a948a), false); // (the arch over the road)
    box(s * 18.3, 0, -4, s * 18.3 + s * 0.3, 6, 4, null); // (a barrier across the road: the fight stays on the plaza)
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 8), std(0xd8302a));
    bar.position.set(s * 18.3, 1.1, 0);
    group.add(bar);
    const lamp = new THREE.PointLight(0xfff0d0, 50, 40, 1.4);
    lamp.position.set(s * 15.5, 7, 0);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0xfff0d0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    glow.position.copy(lamp.position);
    glow.scale.setScalar(3);
    group.add(lamp, glow);
  }
  // the crates
  const crates = CRATES.map(([x, z]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(CRATE_HALF * 2, 1.5, CRATE_HALF * 2), std(0x8a6a3a));
    m.position.set(x, 0.75, z);
    group.add(m);
    world.addBox(x - CRATE_HALF, 0, z - CRATE_HALF, x + CRATE_HALF, 1.5, z + CRATE_HALF, { tag: 'wall' });
    return { x, z, mesh: m };
  });
  // the floodgate control house, on the lake side
  box(-3, 0, -13.5, 3, 3.2, -11.6, std(0x6a6058), false);
  const lever = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.2, 0.15), std(0xd8302a));
  lever.position.set(0, 1.6, -11.4);
  lever.rotation.x = 0.4;
  group.add(lever);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.8), new THREE.MeshBasicMaterial({ map: makeTextTexture('COYOTE DAM', { color: '#ffd070', bg: '#2a2420', width: 512, height: 96 }) }));
  sign.position.set(0, 2.7, -11.55);
  group.add(sign);

  // ---------------------------------------------------------------- the lake behind, the canyon in front, the dam face going down
  const lake = new THREE.Mesh(new THREE.PlaneGeometry(1200, 600), new THREE.MeshStandardMaterial({ color: 0x0e1e2a, roughness: 0.15, metalness: 0.6 }));
  lake.rotation.x = -Math.PI / 2;
  lake.position.set(0, -4, -313);
  group.add(lake);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(120, 64), std(0x7a766e, { map: ct }));
  face.position.set(0, -32, 13.05);
  group.add(face);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1200, 800), std(0x3a2a20));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -62, 400);
  group.add(floor);
  const river = new THREE.Mesh(new THREE.PlaneGeometry(26, 800), new THREE.MeshStandardMaterial({ color: 0x1a3a4a, roughness: 0.2, metalness: 0.5 }));
  river.rotation.x = -Math.PI / 2;
  river.position.set(0, -61.8, 413);
  group.add(river);
  for (const s of [-1, 1]) { // the canyon walls and the mountains the dam is built between
    const wall = new THREE.Mesh(new THREE.BoxGeometry(200, 140, 900), std(0x8a4a2e, { flatShading: true }));
    wall.position.set(s * 160, -10, 200);
    group.add(wall);
  }
  for (let k = 0; k < 10; k++) {
    const a = rng() * Math.PI * 2, r = 500 + rng() * 300;
    group.add(buildMesa(Math.cos(a) * r, Math.sin(a) * r, 60 + rng() * 60, 60 + rng() * 60, rng));
  }

  const spawn = new THREE.Vector3(0, 0.05, 8.5);
  spawn.yaw = 0;
  return { group, world, spawn, ladders: [], crates, ring };
}

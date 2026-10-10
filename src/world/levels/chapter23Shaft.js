import * as THREE from 'three';
import { CollisionWorld } from '../../core/collision.js';
import { makeGlowMaterial, getGlowTexture } from '../materials.js';
import { makeRng } from '../../core/utils.js';

// ======================================================================
//  Chapter 23, Part 3: the old ventilation shaft of the Silver Crown mine,
//  straight down from the top of the mountain (y = 0) to level 9 (BOTTOM).
//  It's 6 m square (x, z from -HALF to HALF). On the way down (OBSTACLES):
//    beam    a timber right across the shaft (along x or along z)
//    planks  a broken landing that covers part of the shaft
//    fan     the old ventilation fan, still turning: four blades
//    cables  live cables hanging down, swaying and sparking
//    rocks   loose rock: stones fall where you are
//    guard   level 7: a Jackal comes and holds his lantern into the shaft
//    grate   a grating with one hole in the corner
//  An opening onto each level, every 18 m, on one wall or another.
// ======================================================================

export const HALF = 3, BOTTOM = -160, R = 0.35;   // R: how big you are, seen from above
export const LEVEL_Y = (k) => -18 * k;
export const OBSTACLES = [
  { kind: 'beam', y: -14, axis: 'x', at: 0 },
  { kind: 'planks', y: -24, cover: { x0: -HALF, x1: 0.6, z0: -HALF, z1: HALF } },
  { kind: 'beam', y: -34, axis: 'z', at: 0 },
  { kind: 'planks', y: -44, cover: { x0: -HALF, x1: HALF, z0: -0.8, z1: HALF } },
  { kind: 'fan', y: -58, speed: 0.9 },
  { kind: 'cables', y: -72, y1: -90 },
  { kind: 'planks', y: -96, cover: { x0: -0.7, x1: HALF, z0: -HALF, z1: HALF } },
  { kind: 'rocks', y: -100, y1: -118 },
  { kind: 'guard', y: -126, side: 1 },
  { kind: 'beam', y: -138, axis: 'x', at: 0 },
  { kind: 'beam', y: -138.01, axis: 'z', at: 0 },
  { kind: 'grate', y: -150, hole: { x0: 1.4, z0: 1.4 } },
];
export const CABLES = [[-1.6, -1.4], [1.5, -1.2], [1.4, 1.6], [-1.3, 1.5], [0.1, 0.2]];
export const CHECKPOINTS = [{ y: -1.5, name: 'The top' }, { y: -64, name: 'Level 4' }, { y: -120, name: 'Level 7' }];

function rockTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#5a4436'; g.fillRect(0, 0, 128, 128);
  const rng = makeRng(23);
  for (let i = 0; i < 300; i++) {
    const v = 50 + rng() * 60;
    g.fillStyle = `rgba(${v + 30},${v + 10},${v - 10},0.35)`;
    g.beginPath(); g.arc(rng() * 128, rng() * 128, 2 + rng() * 9, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < 6; i++) { g.strokeStyle = 'rgba(20,10,5,0.5)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(rng() * 128, 0); g.lineTo(rng() * 128, 128); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A tunnel opening on the wall: dark, with a little lantern light far down it. */
function tunnelTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 36, 1, 32, 36, 30);
  gr.addColorStop(0, '#6a4a2a'); gr.addColorStop(0.25, '#1c120c'); gr.addColorStop(1, '#050302');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildChapter23Shaft() {
  const group = new THREE.Group();
  const world = new CollisionWorld(8);
  const rng = makeRng(2303);
  const lam = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
  const timber = lam(0x6a4a2c), iron = lam(0x4a4a50);

  // ---------------------------------------------------------------- the shaft: rock walls, timber frames every 3 m
  const tex = rockTexture();
  tex.repeat.set(2, 54);
  const wallMat = lam(0xffffff, { map: tex });
  for (const [px, pz, ry] of [[0, -HALF, 0], [0, HALF, Math.PI], [-HALF, 0, Math.PI / 2], [HALF, 0, -Math.PI / 2]]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(2 * HALF, -BOTTOM + 2), wallMat);
    w.position.set(px, BOTTOM / 2 + 0.5, pz);
    w.rotation.y = ry;
    group.add(w);
  }
  const nRings = Math.floor(-BOTTOM / 3);
  const frames = new THREE.InstancedMesh(new THREE.BoxGeometry(2 * HALF, 0.3, 0.3), timber, nRings * 4);
  const o = new THREE.Object3D();
  let n = 0;
  for (let k = 1; k <= nRings; k++) {
    const y = -k * 3;
    for (const [px, pz, ry] of [[0, HALF - 0.15, 0], [0, -HALF + 0.15, 0], [HALF - 0.15, 0, Math.PI / 2], [-HALF + 0.15, 0, Math.PI / 2]]) {
      o.position.set(px, y, pz); o.rotation.set(0, ry, 0); o.updateMatrix(); frames.setMatrixAt(n++, o.matrix);
    }
  }
  group.add(frames);
  // the openings onto the levels, and their lanterns
  const tunnelMat = new THREE.MeshBasicMaterial({ map: tunnelTexture() });
  const openings = [];
  for (let k = 1; k <= 8; k++) {
    const y = LEVEL_Y(k), side = k === 7 ? 1 : [1, -1, 1, -1][k % 4], alongX = k % 2 === 0 && k !== 7;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.4), tunnelMat);
    if (alongX) { m.position.set(0, y - 1.3, side * (HALF - 0.02)); m.rotation.y = side > 0 ? Math.PI : 0; }
    else { m.position.set(side * (HALF - 0.02), y - 1.3, 0); m.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2; }
    group.add(m);
    const lamp = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0xffb060, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    lamp.position.copy(m.position).add(new THREE.Vector3(alongX ? 1.6 : 0, 1.3, alongX ? 0 : 1.6));
    lamp.position.x = THREE.MathUtils.clamp(lamp.position.x, -HALF + 0.2, HALF - 0.2);
    lamp.position.z = THREE.MathUtils.clamp(lamp.position.z, -HALF + 0.2, HALF - 0.2);
    lamp.scale.setScalar(1.4);
    group.add(lamp);
    openings.push({ k, y, side, alongX, mesh: m });
  }

  // ---------------------------------------------------------------- the obstacles
  const fanGroup = new THREE.Group();
  const cableMeshes = [], sparks = [];
  for (const ob of OBSTACLES) {
    if (ob.kind === 'beam') {
      const m = new THREE.Mesh(new THREE.BoxGeometry(ob.axis === 'x' ? 2 * HALF : 0.55, 0.5, ob.axis === 'x' ? 0.55 : 2 * HALF), timber);
      m.position.set(ob.axis === 'z' ? ob.at : 0, ob.y, ob.axis === 'x' ? ob.at : 0);
      group.add(m);
    } else if (ob.kind === 'planks') {
      const c = ob.cover, w = c.x1 - c.x0, d = c.z1 - c.z0;
      const count = 6;
      for (let i = 0; i < count; i++) {
        // planks running along the longer side, a few broken short at the ragged edge
        const alongX = w >= d, len = (alongX ? w : d) * (0.75 + rng() * 0.25), wid = (alongX ? d : w) / count;
        const m = new THREE.Mesh(new THREE.BoxGeometry(alongX ? len : wid - 0.04, 0.12, alongX ? wid - 0.04 : len), lam(0x7a5a3a));
        if (alongX) m.position.set((c.x0 === -HALF ? c.x0 + len / 2 : c.x1 - len / 2), ob.y + (rng() - 0.5) * 0.08, c.z0 + (i + 0.5) * wid);
        else m.position.set(c.x0 + (i + 0.5) * wid, ob.y + (rng() - 0.5) * 0.08, (c.z0 === -HALF ? c.z0 + len / 2 : c.z1 - len / 2));
        m.rotation.z = (rng() - 0.5) * 0.06;
        group.add(m);
      }
      // (the edge you have to get past is the real one: OBSTACLES says where)
    } else if (ob.kind === 'fan') {
      fanGroup.position.y = ob.y;
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.6, 12), iron);
      fanGroup.add(hub);
      for (let i = 0; i < 4; i++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.08, 2.9), lam(0x6a6a70));
        blade.position.set(Math.sin(i * Math.PI / 2) * 1.75, 0, Math.cos(i * Math.PI / 2) * 1.75);
        blade.rotation.y = i * Math.PI / 2;
        blade.rotation.z = 0.25;
        fanGroup.add(blade);
      }
      // the frame it hangs in
      for (const a of ['x', 'z']) { const m = new THREE.Mesh(new THREE.BoxGeometry(a === 'x' ? 2 * HALF : 0.2, 0.2, a === 'x' ? 0.2 : 2 * HALF), iron); m.position.y = ob.y + 0.8; group.add(m); }
      group.add(fanGroup);
    } else if (ob.kind === 'cables') {
      for (const [cx, cz] of CABLES) {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, ob.y - ob.y1, 5), lam(0x1a1a1a));
        m.position.set(cx, (ob.y + ob.y1) / 2, cz);
        group.add(m);
        cableMeshes.push({ m, x: cx, z: cz });
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0x9ad8ff, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
        sp.scale.setScalar(0.9);
        group.add(sp);
        sparks.push(sp);
      }
    } else if (ob.kind === 'grate') {
      const bars = [];
      for (let i = 0; i <= 12; i++) {
        const t = -HALF + i * 0.5;
        // (bars along x at z = t, and along z at x = t; none across the hole in the corner)
        const lx = t > ob.hole.z0 ? ob.hole.x0 + HALF : 2 * HALF, lz = t > ob.hole.x0 ? ob.hole.z0 + HALF : 2 * HALF;
        const gx = new THREE.BoxGeometry(lx, 0.08, 0.08); gx.translate(-HALF + lx / 2, ob.y, t); bars.push(gx);
        const gz = new THREE.BoxGeometry(0.08, 0.08, lz); gz.translate(t, ob.y, -HALF + lz / 2); bars.push(gz);
      }
      for (const g of bars) group.add(new THREE.Mesh(g, iron));
    }
  }

  // ---------------------------------------------------------------- the guard at level 7
  const guardLamp = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0xffc070, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  guardLamp.scale.setScalar(2.6);
  guardLamp.position.set(HALF - 0.3, LEVEL_Y(7) - 1.2, 0.5);
  guardLamp.visible = false;
  group.add(guardLamp);
  const guardCone = new THREE.Mesh(new THREE.ConeGeometry(4.2, 5.6, 16, 1, true), makeGlowMaterial(0xffd890, 0.12));
  guardCone.rotation.z = -Math.PI / 2;  // (pointing into the shaft, -x)
  guardCone.position.set(HALF - 2.8, LEVEL_Y(7) - 1.6, 0);
  guardCone.visible = false;
  group.add(guardCone);

  // ---------------------------------------------------------------- the top (the summit, the headframe) and the bottom (level 9)
  const topMat = lam(0x5a3a2a);
  for (const [x0, x1, z0, z1] of [[-20, -HALF, -20, 20], [HALF, 20, -20, 20], [-HALF, HALF, -20, -HALF], [-HALF, HALF, HALF, 20]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 1, z1 - z0), topMat);
    m.position.set((x0 + x1) / 2, 0.5, (z0 + z1) / 2);
    group.add(m);
  }
  for (const [x, z] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 12, 0.3), iron); leg.position.set(x, 7, z); group.add(leg); }
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.1, 6, 16), iron);
  wheel.position.y = 12.5;
  group.add(wheel);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(2 * HALF, 0.5, 2 * HALF), lam(0x3a2a20));
  floor.position.y = BOTTOM - 0.25;
  group.add(floor);
  const lantern = new THREE.PointLight(0xffb060, 14, 12, 1.6);
  lantern.position.set(-HALF + 0.5, BOTTOM + 2.2, 0);
  group.add(lantern);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.6, 32), makeGlowMaterial(0x4dffa6, 0.6));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = BOTTOM + 0.05;
  group.add(ring);

  const spawn = new THREE.Vector3(0, CHECKPOINTS[0].y, 0);
  spawn.yaw = 0;
  return { group, world, spawn, ladders: [], fanGroup, cableMeshes, sparks, guardLamp, guardCone, openings, ring };
}

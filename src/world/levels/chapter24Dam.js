import * as THREE from 'three';
import { CollisionWorld } from '../../core/collision.js';
import { makeGlowMaterial, makeTextTexture, getGlowTexture } from '../materials.js';
import { buildMesa } from '../desert.js';
import { makeRng } from '../../core/utils.js';

// ======================================================================
//  Chapter 24, Part 3: the downstream face of the Coyote Dam, at midnight,
//  in a storm. The face goes up in great concrete steps (TIERS), each twelve
//  metres tall with a walkway on top; an iron ladder up each step, at a
//  different place every time, so you walk along every walkway. Four
//  SPILLWAY chutes pour down the face when their gates open (a lamp up top
//  goes amber, then red). At the top walkway: the door into the dam's
//  inspection gallery.
//     x: along the dam (-60..60);  y: up;  z: +z is downstream (the river)
// ======================================================================

export const TIER_H = 12, STEP = 2.6, TIERS = 4;
export const faceZ = (k) => -k * STEP;                 // the front of step k
export const ledgeY = (k) => TIER_H * k;               // walkway k (0 = the apron at the bottom)
export const LADDER_X = [-50, 28, -30, 50];            // the ladder up step k
export const CHUTES = [-40, -15, 15, 40];              // the spillways (centre x)
export const CHUTE_HALF = 3;
export const GAPS = [null, null, [-4.5, -1.5], [5, 8]];// a broken bit of walkway k (jump it)
export const DOOR = { x: 0, y: ledgeY(4), z: faceZ(4) };
export const TOP = 64;                                  // the crest

function concrete(seed) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#8c877e'; g.fillRect(0, 0, 256, 256);
  const rng = makeRng(seed);
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${rng() < 0.5 ? '0,0,0' : '255,255,255'},${0.02 + rng() * 0.05})`; g.fillRect(rng() * 256, rng() * 256, 3, 3); }
  // pour lines and water stains
  g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 2;
  for (let y = 0; y <= 256; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
  for (let i = 0; i < 18; i++) { const x = rng() * 256; const grd = g.createLinearGradient(0, 0, 0, 256); grd.addColorStop(0, 'rgba(40,36,30,0.18)'); grd.addColorStop(1, 'rgba(40,36,30,0)'); g.fillStyle = grd; g.fillRect(x, 0, 3 + rng() * 6, 120 + rng() * 136); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function waterTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(200,225,240,0.55)'; g.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * 64, y = Math.random() * 256, h = 30 + Math.random() * 90;
    g.fillStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.5})`;
    g.fillRect(x, y, 1 + Math.random() * 2, h);
    g.fillRect(x, y - 256, 1 + Math.random() * 2, h);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildChapter24Dam() {
  const group = new THREE.Group();
  const world = new CollisionWorld(8);
  const rng = makeRng(2403);
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra });
  const box = (x0, y0, z0, x1, y1, z1, mat, tag = 'wall', solid = true) => {
    if (mat) { const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); group.add(m); }
    if (solid) world.addBox(x0, y0, z0, x1, y1, z1, { tag });
  };
  const ct = concrete(24);
  const ladders = [];
  const X0 = -62, X1 = 62;

  // ---------------------------------------------------------------- the steps of the dam
  for (let k = 0; k <= TIERS; k++) {
    const y0 = ledgeY(k), y1 = k === TIERS ? TOP : ledgeY(k + 1);
    const tex = ct.clone();
    tex.needsUpdate = true;
    tex.repeat.set((X1 - X0) / 16, (y1 - y0) / 16);
    const mat = std(0xffffff, { map: tex });
    // each step: a back part, and the front slab (its top is the walkway), broken where there's a gap
    const top = k === TIERS ? null : GAPS[k + 1];
    if (k === TIERS || !top) box(X0, y0, faceZ(k) - 30, X1, y1, faceZ(k), mat);
    else {
      box(X0, y0, faceZ(k) - 30, X1, y1, faceZ(k + 1), mat);
      for (const [a, b] of [[X0, top[0]], [top[1], X1]]) box(a, y0, faceZ(k + 1), b, y1, faceZ(k), mat);
      // (in the gap: broken concrete a long way down)
      box(top[0], y0, faceZ(k + 1), top[1], y0 + 1.2, faceZ(k), std(0x5a564e));
    }
  }
  // the apron at the bottom
  box(X0, -2, 0, X1, 0, 12, std(0x6a665e), 'roof');

  // ---------------------------------------------------------------- railings along the front of every walkway (gaps at the ladder tops)
  const rail = std(0x4a4a50, { metalness: 0.6, roughness: 0.4 });
  for (let k = 1; k <= TIERS; k++) {
    const z = faceZ(k - 1) - 0.12, y = ledgeY(k);
    const cuts = [[LADDER_X[k - 1] - 0.9, LADDER_X[k - 1] + 0.9]];
    if (GAPS[k]) cuts.push([GAPS[k][0] - 0.2, GAPS[k][1] + 0.2]);
    cuts.sort((a, b) => a[0] - b[0]);
    let x = X0;
    for (const [a, b] of [...cuts, [X1, X1]]) {
      if (a > x + 0.2) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(a - x, 0.07, 0.07), rail);
        bar.position.set((a + x) / 2, y + 1.05, z);
        group.add(bar);
        const n = Math.max(2, Math.round((a - x) / 2));
        const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 1.05, 0.07), rail, n + 1);
        const o = new THREE.Object3D();
        for (let i = 0; i <= n; i++) { o.position.set(x + ((a - x) * i) / n, y + 0.52, z); o.updateMatrix(); posts.setMatrixAt(i, o.matrix); }
        group.add(posts);
        world.addBox(x, y, z - 0.1, a, y + 2.6, z + 0.1, { tag: 'wall' });
      }
      x = b;
    }
  }
  // the ends of the walkways: the canyon walls
  for (const s of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(40, 160, 600), std(0x8a4a2e, { flatShading: true }));
    wall.position.set(s * (X1 + 20), 40, 200);
    group.add(wall);
    world.addBox(s > 0 ? X1 - 0.5 : X0 - 40, -10, -40, s > 0 ? X1 + 40 : X0 + 0.5, 120, 40, { tag: 'wall' });
  }

  // ---------------------------------------------------------------- ladders (iron, up the face of each step)
  const ironMat = std(0x3a3a40, { metalness: 0.7, roughness: 0.4 });
  for (let k = 0; k < TIERS; k++) {
    const x = LADDER_X[k], z = faceZ(k), y0 = ledgeY(k), y1 = ledgeY(k + 1);
    const lg = new THREE.Group();
    for (const s of [-0.28, 0.28]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.06, y1 - y0 + 1, 0.06), ironMat);
      r.position.set(x + s, (y0 + y1 + 1) / 2, z + 0.16);
      lg.add(r);
    }
    const rungs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.56, 0.04, 0.04), ironMat, Math.ceil((y1 - y0) / 0.35));
    const o = new THREE.Object3D();
    for (let i = 0; i < rungs.count; i++) { o.position.set(x, y0 + 0.3 + i * 0.35, z + 0.16); o.updateMatrix(); rungs.setMatrixAt(i, o.matrix); }
    lg.add(rungs);
    // (a yellow cage round the ladder, so you can see it from far off)
    const hoopMat = std(0xe8b020, { metalness: 0.4 });
    for (let yy = y0 + 2.4; yy < y1; yy += 1.4) {
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.025, 4, 16, Math.PI), hoopMat);
      hoop.position.set(x, yy, z + 0.16);
      hoop.rotation.x = Math.PI / 2;
      hoop.rotation.z = Math.PI;
      lg.add(hoop);
    }
    group.add(lg);
    ladders.push({ x, z, nx: 0, nz: 1, y0, y1 });
    // a little lamp over the bottom, so you can find it
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0xffd070, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    glow.position.set(x, y0 + 3.2, z + 0.3);
    glow.scale.setScalar(1.4);
    group.add(glow);
  }

  // ---------------------------------------------------------------- the spillways: water, gates, lamps
  const wt = waterTexture();
  const chutes = CHUTES.map((cx) => {
    const sheets = [];
    for (let k = 0; k <= TIERS; k++) {
      // a curtain down the face of each step, and a sheet over the walkway in front of it
      const y0 = ledgeY(k), y1 = k === TIERS ? TOP - 8 : ledgeY(k + 1);
      const tex = wt.clone();
      tex.needsUpdate = true;
      tex.repeat.set(1, (y1 - y0) / 14);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0.85, fog: true });
      const curtain = new THREE.Mesh(new THREE.PlaneGeometry(CHUTE_HALF * 2, 1), mat);
      curtain.geometry.translate(0, 0.5, 0);
      curtain.position.set(cx, y0, faceZ(k) + 0.55);
      const flat = new THREE.Mesh(new THREE.PlaneGeometry(CHUTE_HALF * 2, STEP + 0.6), mat);
      flat.rotation.x = -Math.PI / 2;
      flat.position.set(cx, y0 + 0.08, k === 0 ? 3 : faceZ(k - 1) - STEP / 2 + 0.3);
      if (k === 0) flat.scale.y = 6 / (STEP + 0.6);
      group.add(curtain, flat);
      sheets.push({ curtain, flat, y0, y1, tex });
    }
    // the gate, up under the crest, and its lamp
    box(cx - CHUTE_HALF - 0.4, TOP - 8, faceZ(TIERS) - 0.2, cx + CHUTE_HALF + 0.4, TOP - 7, faceZ(TIERS) + 0.8, std(0x4a4a50, { metalness: 0.5 }), 'wall', false);
    const lampMat = new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0x4dffa6, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const lamp = new THREE.Sprite(lampMat);
    lamp.position.set(cx, TOP - 5.5, faceZ(TIERS) + 0.6);
    lamp.scale.setScalar(4);
    group.add(lamp);
    // and a lamp on every walkway, either side of the chute
    const small = [];
    for (let k = 1; k <= TIERS; k++) for (const s of [-1, 1]) {
      const sp = new THREE.Sprite(lampMat);
      sp.position.set(cx + s * (CHUTE_HALF + 0.3), ledgeY(k) + 2.4, faceZ(k) + 0.25);
      sp.scale.setScalar(0.9);
      group.add(sp);
      small.push(sp);
    }
    // the edges of the chute painted on the walkways
    for (let k = 1; k <= TIERS; k++) for (const s of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.25, STEP), new THREE.MeshBasicMaterial({ color: 0xe8b020 }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(cx + s * CHUTE_HALF, ledgeY(k) + 0.02, faceZ(k) + STEP / 2);
      group.add(m);
    }
    const spray = [];
    for (let i = 0; i < 6; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0xe8f4ff, transparent: true, opacity: 0.5, depthWrite: false }));
      sp.visible = false;
      group.add(sp);
      spray.push(sp);
    }
    return { x: cx, sheets, lamp, lampMat, small, spray };
  });

  // ---------------------------------------------------------------- the gallery door at the top walkway
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 2.6), std(0x2a3a4a, { metalness: 0.5 }));
  door.position.set(DOOR.x, DOOR.y + 1.3, DOOR.z + 0.02);
  const doorLight = new THREE.PointLight(0x4dffa6, 14, 12, 1.6);
  doorLight.position.set(DOOR.x, DOOR.y + 3.2, DOOR.z + 1);
  const doorSign = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.55), new THREE.MeshBasicMaterial({ map: makeTextTexture('INSPECTION GALLERY', { color: '#4dffa6', bg: '#14181c', width: 512, height: 72, font: 'bold 52px Impact, sans-serif' }) }));
  doorSign.position.set(DOOR.x, DOOR.y + 3.0, DOOR.z + 0.03);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.25, 32), makeGlowMaterial(0x4dffa6, 0.7));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(DOOR.x, DOOR.y + 0.05, DOOR.z + 1.2);
  group.add(door, doorLight, doorSign, ring);
  // the crest: railings, lamps, a Jackal truck's lights
  for (let x = -55; x <= 55; x += 22) {
    const lamp = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0xfff0c8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    lamp.position.set(x, TOP + 4, faceZ(TIERS) - 1);
    lamp.scale.setScalar(3);
    group.add(lamp);
  }
  const crestLight = new THREE.PointLight(0xfff0c8, 30, 60, 1.4);
  crestLight.position.set(0, TOP + 6, 6);
  group.add(crestLight);
  for (const k of [1, 3]) {
    const l = new THREE.PointLight(0xffe0a0, 16, 40, 1.5);
    l.position.set(k === 1 ? -20 : 25, ledgeY(k) + 6, faceZ(k) + 8);
    group.add(l);
  }

  // ---------------------------------------------------------------- the river, the canyon
  const river = new THREE.Mesh(new THREE.PlaneGeometry(130, 800), new THREE.MeshStandardMaterial({ color: 0x1a3a4a, roughness: 0.15, metalness: 0.5 }));
  river.rotation.x = -Math.PI / 2;
  river.position.set(0, -3, 412);
  group.add(river);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1000), std(0x3a2a20));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -6, 300);
  group.add(floor);
  for (let k = 0; k < 10; k++) {
    const a = Math.PI * (0.1 + rng() * 0.8), r = 380 + rng() * 300;
    group.add(buildMesa(Math.cos(a) * r, Math.sin(a) * r, 60 + rng() * 60, 70 + rng() * 60, rng));
  }

  // a floodlight over the apron, where you start
  const flood = new THREE.PointLight(0xfff0d0, 30, 50, 1.4);
  flood.position.set(-36, 7, 9);
  group.add(flood);

  const spawn = new THREE.Vector3(-22, 0.05, 6);
  spawn.yaw = Math.PI / 2; // (looking along the bottom of the dam, towards the first ladder)
  return { group, world, spawn, ladders, chutes, ring };
}

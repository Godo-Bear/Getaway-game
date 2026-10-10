import * as THREE from 'three';
import { CollisionWorld } from '../../core/collision.js';
import { makeGlowMaterial, makeTextTexture, getGlowTexture } from '../materials.js';
import { buildOreCart } from './chapter23Mine.js';
import { makeRng } from '../../core/utils.js';

// ======================================================================
//  Chapter 23, Part 5: the old ore cart line, down through the mountain
//  from level 9 to the mine's bottom entrance on the mountainside.
//
//  The line is a tree of SEGMENTS, each laid out by a "turtle": straights
//  and curves (positive angle = a left turn), each dropping a little. At
//  the end of a segment, a fork (next: [left, right]) or the end (dead: a
//  cave-in; exit: out onto the mountainside). Parts marked 'cave' run
//  through a big cavern over an underground lake (no tunnel round them);
//  the 'out' part is outside, under the night sky.
// ======================================================================

export const SEGMENTS = {
  s0: { cmds: [['S', 30, 1], ['C', 40, 40, 3], ['S', 25, 2], ['C', -50, 35, 3], ['S', 40, 4]], next: ['a', 's1'], good: 'right' },
  a: { cmds: [['C', 25, 50, 1], ['S', 45, 2]], dead: true },
  s1: { cmds: [['C', -25, 50, 2], ['S', 20, 6], ['S', 30, 10, 'cave'], ['C', 70, 30, 2, 'cave'], ['S', 50, 0, 'cave'], ['C', -30, 45, 2], ['S', 30, 2]], next: ['s2', 'b'], good: 'left' },
  b: { cmds: [['C', -25, 50, 1], ['S', 45, 2]], dead: true },
  s2: { cmds: [['C', 25, 50, 2], ['S', 30, 5], ['C', -45, 30, 4], ['C', 50, 30, 4], ['C', -45, 30, 4], ['S', 40, 4]], next: ['c', 's3'], good: 'right' },
  c: { cmds: [['C', 25, 50, 1], ['S', 40, 1]], dead: true },
  s3: { cmds: [['C', -25, 50, 2], ['S', 50, 3], ['S', 34, 0.5, 'out']], exit: true },
};
export const FIRST = 's0';
export const TUNNEL_R = 2.6;

/** Lay out every segment: points along it, where its cave and outside parts are, and its curve. */
function layout() {
  const segs = {};
  const run = (id, pos, heading) => {
    const def = SEGMENTS[id], pts = [pos.clone()], flags = [''];
    const p = pos.clone();
    let h = heading;
    for (const [kind, a, b, c, d] of def.cmds) {
      const flag = (kind === 'S' ? c : d) || '';
      if (kind === 'S') {
        const n = Math.max(1, Math.ceil(a / 2.5));
        for (let i = 0; i < n; i++) { p.x += Math.cos(h) * a / n; p.z += Math.sin(h) * a / n; p.y -= b / n; pts.push(p.clone()); flags.push(flag); }
      } else {
        const ang = a * Math.PI / 180, arc = Math.abs(ang) * b, n = Math.max(2, Math.ceil(arc / 2.5));
        for (let i = 0; i < n; i++) { h -= ang / n; p.x += Math.cos(h) * arc / n; p.z += Math.sin(h) * arc / n; p.y -= c / n; pts.push(p.clone()); flags.push(flag); }
      }
    }
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const len = curve.getLength();
    segs[id] = { id, ...def, pts, flags, curve, len, end: { pos: p.clone(), heading: h } };
    if (def.next) for (const n of def.next) run(n, p, h);
  };
  run(FIRST, new THREE.Vector3(0, 0, 0), 0);
  return segs;
}

function rockTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#4a3a30'; g.fillRect(0, 0, 128, 128);
  const rng = makeRng(29);
  for (let i = 0; i < 260; i++) { const v = 40 + rng() * 60; g.fillStyle = `rgba(${v + 30},${v + 12},${v - 8},0.3)`; g.beginPath(); g.arc(rng() * 128, rng() * 128, 2 + rng() * 10, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildChapter23Cart() {
  const group = new THREE.Group();
  const world = new CollisionWorld(10);
  const rng = makeRng(2305);
  const segs = layout();
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
  const rockTex = rockTexture();
  rockTex.repeat.set(30, 2);
  const tubeMat = std(0xffffff, { map: rockTex, side: THREE.BackSide });
  const timber = std(0x6a4a2c), iron = std(0x6a6a72, { metalness: 0.7, roughness: 0.4 });
  const up = new THREE.Vector3(0, 1, 0), T = new THREE.Vector3(), Rv = new THREE.Vector3(), Pv = new THREE.Vector3();

  const lanternSprites = [];
  let caveCentre = null, caveLow = 0, outStart = null;
  for (const seg of Object.values(segs)) {
    const { curve, len } = seg;
    // the tunnel round each stretch that isn't in the cavern or outside
    const N = Math.max(4, Math.ceil(len / 2));
    let runPts = [];
    const flush = () => {
      if (runPts.length > 2) {
        const c = new THREE.CatmullRomCurve3(runPts);
        const tube = new THREE.Mesh(new THREE.TubeGeometry(c, Math.ceil(c.getLength() / 2), TUNNEL_R, 9, false), tubeMat);
        tube.position.y = 1.1; // (the rails run along the bottom of the tube)
        group.add(tube);
      }
      runPts = [];
    };
    for (let i = 0; i <= N; i++) {
      const u = i / N, p = curve.getPointAt(u), fi = Math.min(seg.flags.length - 1, Math.round(u * (seg.flags.length - 1))), f = seg.flags[fi];
      if (f === 'cave') {
        flush();
        caveCentre ||= new THREE.Vector3();
        caveCentre.add(p); caveCentre.n = (caveCentre.n || 0) + 1;
        caveLow = Math.min(caveLow, p.y);
      } else if (f === 'out') { flush(); outStart ||= p.clone(); } else runPts.push(p.clone());
    }
    flush();
    // rails, sleepers, timber frames, lanterns
    const railL = [], railR = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      curve.getPointAt(u, Pv);
      curve.getTangentAt(u, T);
      Rv.crossVectors(T, up).normalize();
      railL.push(Pv.clone().addScaledVector(Rv, -0.5).setY(Pv.y + 0.08));
      railR.push(Pv.clone().addScaledVector(Rv, 0.5).setY(Pv.y + 0.08));
    }
    for (const r of [railL, railR]) group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(r), N * 2, 0.05, 4, false), iron));
    const nSl = Math.floor(len);
    const sl = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, 0.1, 0.24), timber, nSl);
    const nFr = Math.floor(len / 5);
    const fr = new THREE.InstancedMesh(new THREE.BoxGeometry(0.25, 2.8, 0.25), timber, nFr * 2);
    const caps = new THREE.InstancedMesh(new THREE.BoxGeometry(3.6, 0.25, 0.25), timber, nFr);
    const o = new THREE.Object3D();
    for (let i = 0; i < nSl; i++) {
      const u = (i + 0.5) / len;
      curve.getPointAt(u, Pv); curve.getTangentAt(u, T);
      o.position.copy(Pv); o.lookAt(Pv.x + T.x, Pv.y, Pv.z + T.z); o.updateMatrix(); sl.setMatrixAt(i, o.matrix);
    }
    for (let i = 0; i < nFr; i++) {
      const u = (i + 0.5) * 5 / len, fi = Math.min(seg.flags.length - 1, Math.round(u * (seg.flags.length - 1)));
      curve.getPointAt(u, Pv); curve.getTangentAt(u, T);
      Rv.crossVectors(T, up).normalize();
      const hide = seg.flags[fi] !== '' ? -500 : 0; // (no frames in the cavern or outside)
      for (const [k, s] of [[0, -1.75], [1, 1.75]]) { o.position.copy(Pv).addScaledVector(Rv, s); o.position.y += 1.4 + hide; o.rotation.set(0, 0, 0); o.updateMatrix(); fr.setMatrixAt(i * 2 + k, o.matrix); }
      o.position.copy(Pv); o.position.y += 2.8 + hide; o.lookAt(Pv.x + Rv.x, Pv.y + 2.8 + hide, Pv.z + Rv.z); o.rotateY(Math.PI / 2); o.updateMatrix(); caps.setMatrixAt(i, o.matrix);
      if (i % 5 === 2 && !seg.dead && hide === 0) {
        const lamp = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0xffb060, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
        lamp.position.copy(Pv).addScaledVector(Rv, 1.5).setY(Pv.y + 2.3);
        lamp.scale.setScalar(1.5);
        group.add(lamp);
        lanternSprites.push(lamp);
      }
    }
    group.add(sl, fr, caps);
    // a dead end: boards with a red X across the tunnel, and a pile of rubble behind
    if (seg.dead) {
      curve.getPointAt(1, Pv); curve.getTangentAt(1, T);
      const rubble = new THREE.Mesh(new THREE.DodecahedronGeometry(2.4, 0), std(0x6a5040, { flatShading: true }));
      rubble.position.copy(Pv).addScaledVector(T, 1.5).setY(Pv.y + 1);
      group.add(rubble);
      curve.getPointAt(Math.min(1, 6 / len), Pv); curve.getTangentAt(Math.min(1, 6 / len), T);
      const boards = new THREE.Group();
      boards.position.copy(Pv).setY(Pv.y + 1.6);
      boards.lookAt(Pv.x - T.x, Pv.y + 1.6, Pv.z - T.z);
      for (const [y, r] of [[-0.6, 0.1], [0.1, -0.08], [0.8, 0.05]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.25, 0.08), std(0x7a5a3a)); b.position.y = y; b.rotation.z = r; boards.add(b); }
      const x = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), new THREE.MeshBasicMaterial({ map: makeTextTexture('X', { color: '#e8302a', bg: 'rgba(0,0,0,0)', width: 128, height: 128, font: 'bold 120px Impact, sans-serif' }), transparent: true }));
      x.position.z = 0.06;
      boards.add(x);
      group.add(boards);
    }
  }
  // the EXIT signs: at the start of every right branch... no: on whichever branch is the way out
  for (const seg of Object.values(segs)) {
    if (!seg.next) continue;
    const good = segs[seg.good === 'left' ? seg.next[0] : seg.next[1]];
    good.curve.getPointAt(Math.min(1, 8 / good.len), Pv); good.curve.getTangentAt(Math.min(1, 8 / good.len), T);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.9), new THREE.MeshBasicMaterial({ map: makeTextTexture('EXIT →', { color: '#ffffff', bg: '#2a6a3a', width: 256, height: 96 }), side: THREE.DoubleSide }));
    sign.position.copy(Pv).setY(Pv.y + 2.9);
    sign.lookAt(Pv.x - T.x, Pv.y + 2.9, Pv.z - T.z);
    group.add(sign);
    const lamp = new THREE.PointLight(0x9affb0, 10, 14, 1.6);
    lamp.position.copy(Pv).setY(Pv.y + 2.4);
    group.add(lamp);
  }

  // ---------------------------------------------------------------- the cavern and its lake, the trestle
  if (caveCentre) {
    caveCentre.divideScalar(caveCentre.n);
    const cave = new THREE.Mesh(new THREE.SphereGeometry(48, 20, 14), std(0xffffff, { map: rockTex, side: THREE.BackSide }));
    cave.position.copy(caveCentre);
    cave.scale.y = 0.55;
    group.add(cave);
    const lake = new THREE.Mesh(new THREE.CircleGeometry(40, 32), new THREE.MeshStandardMaterial({ color: 0x0a2a3a, roughness: 0.05, metalness: 0.6, emissive: 0x062030, emissiveIntensity: 0.6 }));
    lake.rotation.x = -Math.PI / 2;
    lake.position.set(caveCentre.x, caveLow - 9, caveCentre.z);
    group.add(lake);
    const glow = new THREE.PointLight(0x4ad8ff, 30, 70, 1.2);
    glow.position.set(caveCentre.x, caveLow - 5, caveCentre.z);
    group.add(glow);
    // trestle legs down to the water under the cave part of the line
    const s1 = segs.s1;
    for (let d = 0; d < s1.len; d += 5) {
      const u = d / s1.len, fi = Math.min(s1.flags.length - 1, Math.round(u * (s1.flags.length - 1)));
      if (s1.flags[fi] !== 'cave') continue;
      s1.curve.getPointAt(u, Pv);
      const h = Pv.y - (caveLow - 9);
      if (h < 1) continue;
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.4, h, 0.4), timber);
      leg.position.set(Pv.x, Pv.y - h / 2, Pv.z);
      group.add(leg);
    }
    // stalactites
    const stal = new THREE.InstancedMesh(new THREE.ConeGeometry(0.7, 5, 6), std(0x5a4a3a, { flatShading: true }), 40);
    const o = new THREE.Object3D();
    for (let i = 0; i < 40; i++) {
      const a = rng() * Math.PI * 2, r = rng() * 36;
      o.position.set(caveCentre.x + Math.cos(a) * r, caveCentre.y + 20 + rng() * 4, caveCentre.z + Math.sin(a) * r);
      o.rotation.set(Math.PI, 0, 0); o.scale.set(1, 0.6 + rng(), 1); o.updateMatrix(); stal.setMatrixAt(i, o.matrix);
    }
    group.add(stal);
  }

  // ---------------------------------------------------------------- outside: the mountainside, the buffers, the desert, the van
  const endSeg = Object.values(segs).find((s) => s.exit);
  const end = endSeg.end.pos;
  if (outStart) {
    const slope = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), std(0x6a4a34));
    slope.rotation.x = -Math.PI / 2;
    slope.position.set(end.x, end.y - 0.3, end.z);
    group.add(slope);
    const cliff = new THREE.Mesh(new THREE.BoxGeometry(200, 120, 20), std(0x7a4a30, { flatShading: true }));
    endSeg.curve.getTangentAt(0.9, T);
    cliff.position.copy(outStart).addScaledVector(T, -12).setY(outStart.y + 58);
    cliff.lookAt(outStart.x, outStart.y + 58, outStart.z);
    group.add(cliff);
    const portal = new THREE.Mesh(new THREE.BoxGeometry(6, 0.6, 0.6), timber);
    portal.position.copy(outStart).setY(outStart.y + 3.3);
    portal.lookAt(outStart.x + T.z, outStart.y + 3.3, outStart.z - T.x);
    group.add(portal);
  }
  endSeg.curve.getTangentAt(1, T);
  const buffer = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 0.6), std(0x8a2a1a));
  buffer.position.copy(end).addScaledVector(T, 1.5).setY(end.y + 0.6);
  buffer.lookAt(end.x, end.y + 0.6, end.z);
  const sand = new THREE.Mesh(new THREE.SphereGeometry(3.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(0xc8a070));
  sand.position.copy(end).addScaledVector(T, 4).setY(end.y - 0.2);
  group.add(buffer, sand);
  const van = new THREE.Group();
  const vb = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, 5), std(0x2a3a5a));
  vb.position.y = 1.4;
  van.add(vb);
  van.position.copy(end).addScaledVector(T, 14).setY(end.y - 0.3);
  group.add(van);
  for (let i = 0; i < 24; i++) { // Mirage Springs, far off across the desert, all lit up
    const tw = new THREE.Mesh(new THREE.BoxGeometry(10, 20 + rng() * 80, 10), new THREE.MeshBasicMaterial({ color: i % 3 ? 0x3a2a1a : 0xffd070 }));
    tw.position.copy(end).addScaledVector(T, 700 + rng() * 100).add(new THREE.Vector3((rng() - 0.5) * 300, 0, (rng() - 0.5) * 300));
    tw.position.y = end.y - 100 + tw.geometry.parameters.height / 2;
    group.add(tw);
  }

  const spawn = new THREE.Vector3(0, 0.6, 0);
  spawn.yaw = 0;
  return { group, world, spawn, ladders: [], segs, lanternSprites, cart: buildOreCart(), jackalCart: buildOreCart(0x3a2a2a), outStart, end };
}

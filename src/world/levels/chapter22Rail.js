import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CollisionWorld } from '../../core/collision.js';
import { makeGlowMaterial, makeTextTexture, getGlowTexture } from '../materials.js';
import { buildCacti, buildMesa, DESERT_GLASS } from '../desert.js';
import { makeCarMesh } from '../../vehicles/carModel.js';
import { buildHandcar } from './chapter22Gulch.js';
import { makeRng, clamp } from '../../core/utils.js';

// ======================================================================
//  Chapter 22, Part 4: the old railway out of Dry Gulch, on a handcar.
//
//  The line runs from the ghost town's station (s = 0) towards -z, with
//  gentle bends, to the level crossing on Highway 9 (s = LINE_END), where
//  Ricky waits with the van. s is the distance along the line; the track
//  is at y = 0 everywhere (on a trestle bridge over the dry wash).
//   - Water towers beside the line, their spouts swung out over the track
//     at head height: DUCK.
//   - A tunnel through a mesa: the Jackals' bikes can't follow you in.
//   - The trestle bridge over the wash: low cross-beams overhead (duck),
//     and the bikes can't follow you across.
// ======================================================================

export const LINE_END = 1250;
export const TUNNEL = { s0: 520, s1: 600 };
export const BRIDGE = { s0: 855, s1: 945 };
/** Things over the track to duck under (s), and what they are. */
export const LOW = [
  { s: 180, kind: 'spout' }, { s: 430, kind: 'spout' }, { s: 760, kind: 'spout' },
  { s: 878, kind: 'beam' }, { s: 900, kind: 'beam' }, { s: 922, kind: 'beam' },
  { s: 1080, kind: 'spout' },
];
export const LOW_Y = 2.05;       // the underside of what's over the track
export const WASH_Y = -8;

/** The line's sideways bends: x at a given z (z = -s, near enough). */
export function trackX(z) {
  const t = -z;
  return 11 * Math.sin(t / 150) + 4 * Math.sin(t / 61 + 0.6);
}

/** Where the track is at distance s along it: { x, z, heading }. */
export function trackAt(s, out = { x: 0, z: 0, heading: Math.PI }) {
  const z = -s;
  out.x = trackX(z);
  out.z = z;
  const dx = (trackX(z - 0.5) - trackX(z + 0.5)); // (going -z: x change per metre travelled)
  out.heading = Math.atan2(dx, -1);
  return out;
}

/** The ground's height (the dry wash under the bridge is lower). */
export function railGround(x, z) {
  const t = -z;
  if (t < BRIDGE.s0 - 4 || t > BRIDGE.s1 + 4) return 0;
  const k = Math.min(t - (BRIDGE.s0 - 4), (BRIDGE.s1 + 4) - t) / 14;
  return WASH_Y * clamp(k, 0, 1);
}

export function buildChapter22Rail() {
  const group = new THREE.Group();
  const world = new CollisionWorld(10);
  const rng = makeRng(2204);
  const lam = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
  const wood = lam(0x6a4a30), iron = lam(0x5a5a62), rockM = [lam(0xa85a34, { flatShading: true }), lam(0xb8683e, { flatShading: true }), lam(0x9a5030, { flatShading: true })];
  const P = { x: 0, z: 0, heading: 0 };
  const along = (s, side, out = new THREE.Vector3()) => { trackAt(s, P); return out.set(P.x - Math.cos(P.heading) * side, 0, P.z + Math.sin(P.heading) * side); };

  // ---------------------------------------------------------------- the ground, and the wash under the bridge
  const sand = lam(0xd2a46c);
  const W = 3000;
  const north = new THREE.Mesh(new THREE.PlaneGeometry(W, 1600), sand);
  north.rotation.x = -Math.PI / 2;
  north.position.set(0, 0, -(BRIDGE.s0 - 4) + 800);
  const south = new THREE.Mesh(new THREE.PlaneGeometry(W, 1600), sand);
  south.rotation.x = -Math.PI / 2;
  south.position.set(0, 0, -(BRIDGE.s1 + 4) - 800);
  group.add(north, south);
  // the wash: sloping banks down to a dry, pebbly riverbed
  const quad = (pts, color) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
    g.setIndex([0, 2, 1, 1, 2, 3]);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, lam(color, { side: THREE.DoubleSide }));
    group.add(m);
    return m;
  };
  const zA = -(BRIDGE.s0 - 4), zB = -(BRIDGE.s0 + 10), zC = -(BRIDGE.s1 - 10), zD = -(BRIDGE.s1 + 4);
  quad([[-W / 2, 0, zA], [W / 2, 0, zA], [-W / 2, WASH_Y, zB], [W / 2, WASH_Y, zB]], 0xb88a58);
  quad([[-W / 2, WASH_Y, zC], [W / 2, WASH_Y, zC], [-W / 2, 0, zD], [W / 2, 0, zD]], 0xb88a58);
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(W, BRIDGE.s1 - BRIDGE.s0 - 20), lam(0xa88a68));
  bed.rotation.x = -Math.PI / 2;
  bed.position.set(0, WASH_Y, -(BRIDGE.s0 + BRIDGE.s1) / 2);
  group.add(bed);

  // ---------------------------------------------------------------- the track: rails, sleepers
  const railParts = [];
  for (let s = 0; s < LINE_END + 60; s += 4) {
    trackAt(s + 2, P);
    for (const side of [-0.72, 0.72]) {
      const g = new THREE.BoxGeometry(0.1, 0.16, 4.05);
      g.rotateY(P.heading);
      g.translate(P.x - Math.cos(P.heading) * side, 0.1, P.z + Math.sin(P.heading) * side);
      railParts.push(g);
    }
  }
  group.add(new THREE.Mesh(mergeGeometries(railParts, false), lam(0x7a7a82)));
  const nSl = LINE_END + 60;
  const sleepers = new THREE.InstancedMesh(new THREE.BoxGeometry(2.4, 0.12, 0.3), lam(0x4a3626), nSl);
  const o = new THREE.Object3D();
  for (let i = 0; i < nSl; i++) {
    trackAt(i, P);
    o.position.set(P.x, 0.03, P.z);
    o.rotation.set(0, P.heading, 0);
    o.updateMatrix();
    sleepers.setMatrixAt(i, o.matrix);
  }
  group.add(sleepers);
  // the gravel bed the track sits on
  const ballast = [];
  for (let s = 0; s < LINE_END + 60; s += 8) {
    if (s > BRIDGE.s0 - 2 && s < BRIDGE.s1 + 2) continue;
    trackAt(s + 4, P);
    const g = new THREE.BoxGeometry(3.4, 0.08, 8.1);
    g.rotateY(P.heading);
    g.translate(P.x, 0.0, P.z);
    ballast.push(g);
  }
  group.add(new THREE.Mesh(mergeGeometries(ballast, false), lam(0x8a7a6a)));

  // ---------------------------------------------------------------- the canyon round Dry Gulch, at the start
  for (let s = -30; s < 150; s += 16) {
    for (const side of [-1, 1]) {
      const c = along(s, side * (24 + rng() * 6));
      const h = 18 + rng() * 14;
      const m = new THREE.Mesh(new THREE.BoxGeometry(30, h, 17), rockM[Math.floor(rng() * 3)]);
      m.position.set(c.x + side * 12, h / 2, c.z);
      group.add(m);
    }
  }
  // the old station behind you
  const st = new THREE.Mesh(new THREE.BoxGeometry(16, 5, 9), lam(0x8a6a4a));
  st.position.set(-12, 2.5, 8);
  group.add(st);

  // ---------------------------------------------------------------- telegraph poles along the line
  const nPoles = Math.floor(LINE_END / 40);
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.13, 0.16, 7, 6), wood, nPoles);
  const arms = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, 0.12, 0.12), wood, nPoles);
  for (let i = 0; i < nPoles; i++) {
    const s = i * 40 + 20;
    if (s > TUNNEL.s0 - 5 && s < TUNNEL.s1 + 5) { o.position.set(0, -50, 0); o.updateMatrix(); poles.setMatrixAt(i, o.matrix); arms.setMatrixAt(i, o.matrix); continue; }
    const c = along(s, -4.6);
    const y0 = railGround(c.x, c.z);
    o.position.set(c.x, y0 + 3.5, c.z); o.rotation.set(0, P.heading, 0); o.updateMatrix(); poles.setMatrixAt(i, o.matrix);
    o.position.y = y0 + 6.6; o.updateMatrix(); arms.setMatrixAt(i, o.matrix);
  }
  group.add(poles, arms);

  // ---------------------------------------------------------------- water towers, their spouts swung out over the track
  const spoutMat = lam(0x3a3a40);
  for (const L of LOW.filter((q) => q.kind === 'spout')) {
    const c = along(L.s, 5.5), hd = P.heading;
    const t = new THREE.Group();
    t.position.copy(c);
    t.rotation.y = hd;
    for (const [x, z] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.28, 7, 0.28), wood);
      leg.position.set(x, 3.5, z);
      t.add(leg);
    }
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 3.6, 14), lam(0x7a5a3a));
    tank.position.y = 8.8;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.7, 1.4, 14), lam(0x4a3a2a));
    roof.position.y = 11.3;
    t.add(tank, roof);
    // the spout: down from the tank, then out over the track at head height
    // (the tower stands to the right of the line: local +x points back at the track)
    const down = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 5.2, 8), spoutMat);
    down.position.set(1.2, 4.6, 0);
    down.rotation.z = 0.35;
    const out = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 5, 8), spoutMat);
    out.rotation.z = Math.PI / 2;
    out.position.set(4.1, LOW_Y + 0.2, 0);
    const drip = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.12, 0.5, 8), spoutMat);
    drip.position.set(5.5, LOW_Y + 0.05, 0);
    t.add(down, out, drip);
    group.add(t);
  }

  // ---------------------------------------------------------------- the tunnel through the mesa
  const tunnelMat = new THREE.MeshBasicMaterial({ color: 0x2a1c12, side: THREE.BackSide }); // (dark inside: the sun doesn't get in)
  for (let s = TUNNEL.s0; s < TUNNEL.s1; s += 10) {
    const c = along(s + 5, 0), hd = P.heading;
    const seg = new THREE.Group();
    seg.position.copy(c);
    seg.rotation.y = hd;
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(30, 22, 10.2), rockM[(s / 10) % 3]);
      wall.position.set(side * 17.6, 11, 0);
      seg.add(wall);
      world.addBox(c.x + side * 2.6 + (side < 0 ? -30 : 0), 0, c.z - 5.1, c.x + side * 2.6 + (side > 0 ? 30 : 0), 22, c.z + 5.1, { tag: 'wall' });
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(5.2, 17, 10.2), rockM[(s / 10 + 1) % 3]);
    roof.position.set(0, 4.7 + 8.5, 0);
    seg.add(roof);
    world.addBox(c.x - 2.6, 4.7, c.z - 5.1, c.x + 2.6, 22, c.z + 5.1, { tag: 'wall' });
    // the inside of the tunnel: dark rock
    const inner = new THREE.Mesh(new THREE.BoxGeometry(5.0, 4.6, 10.3), tunnelMat);
    inner.position.set(0, 2.32, 0);
    seg.add(inner);
    group.add(seg);
  }
  // the mesa over the tunnel, and its portal timbers
  const mesaC = along((TUNNEL.s0 + TUNNEL.s1) / 2, 0);
  group.add(buildMesa(mesaC.x, mesaC.z, 52, 20, rng));
  for (const s of [TUNNEL.s0, TUNNEL.s1]) {
    const c = along(s, 0);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.6, 0.6), wood);
    beam.position.set(c.x, 5, c.z);
    beam.rotation.y = P.heading;
    group.add(beam);
  }
  const lamps = [];
  for (let s = TUNNEL.s0 + 20; s < TUNNEL.s1; s += 30) {
    const c = along(s, -2.2);
    const l = new THREE.PointLight(0xffb060, 10, 16, 1.6);
    l.position.set(c.x, 3.6, c.z);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd090, toneMapped: false }));
    bulb.position.copy(l.position);
    group.add(l, bulb);
    lamps.push(l);
  }

  // ---------------------------------------------------------------- the trestle bridge over the wash
  for (let s = BRIDGE.s0 - 2; s <= BRIDGE.s1 + 2; s += 6) {
    const c = along(s, 0), hd = P.heading, g = railGround(c.x, c.z);
    const bent = new THREE.Group();
    bent.position.copy(c);
    bent.rotation.y = hd;
    for (const x of [-1.3, 1.3]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, -g + 0.1, 0.3), wood);
      post.position.set(x * (1 + (-g) * 0.03), g / 2 - 0.05, 0);
      post.rotation.z = -x * 0.04;
      bent.add(post);
    }
    if (g < -2) {
      for (const y of [g * 0.33, g * 0.7]) { const brace = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.2, 0.2), wood); brace.position.y = y; bent.add(brace); }
    }
    const cap = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.25, 0.4), wood);
    cap.position.y = -0.15;
    bent.add(cap);
    group.add(bent);
  }
  // the deck under the rails, and the low cross-beams overhead
  {
    const parts = [];
    for (let s = BRIDGE.s0 - 4; s < BRIDGE.s1 + 4; s += 4) {
      trackAt(s + 2, P);
      const g = new THREE.BoxGeometry(3.0, 0.14, 4.05);
      g.rotateY(P.heading);
      g.translate(P.x, -0.02, P.z);
      parts.push(g);
    }
    group.add(new THREE.Mesh(mergeGeometries(parts, false), wood));
  }
  for (const L of LOW.filter((q) => q.kind === 'beam')) {
    const c = along(L.s, 0);
    const frame = new THREE.Group();
    frame.position.copy(c);
    frame.rotation.y = P.heading;
    for (const x of [-1.9, 1.9]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, LOW_Y + 0.35, 0.25), wood);
      post.position.set(x, (LOW_Y + 0.35) / 2, 0);
      frame.add(post);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(4.1, 0.3, 0.3), wood);
    beam.position.y = LOW_Y + 0.15;
    frame.add(beam);
    group.add(frame);
  }

  // ---------------------------------------------------------------- the desert: cacti, rocks, mesas, the sunset city
  const cacti = [];
  for (let i = 0; i < 160; i++) {
    const s = rng() * LINE_END, side = (rng() < 0.5 ? -1 : 1) * (9 + rng() * 120);
    if (s > BRIDGE.s0 - 20 && s < BRIDGE.s1 + 20) continue;
    if (s > TUNNEL.s0 - 30 && s < TUNNEL.s1 + 30 && Math.abs(side) < 60) continue;
    const c = along(s, side);
    cacti.push([c.x, c.z, 0.6 + rng() * 0.6, rng() * 6]);
  }
  group.add(buildCacti(cacti));
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), rockM[0], 70);
  for (let i = 0; i < 70; i++) {
    const s = rng() * LINE_END, c = along(s, (rng() < 0.5 ? -1 : 1) * (7 + rng() * 90));
    o.position.set(c.x, railGround(c.x, c.z), c.z); o.rotation.set(rng(), rng(), rng()); o.scale.setScalar(0.5 + rng() * 2.2); o.updateMatrix();
    rocks.setMatrixAt(i, o.matrix);
  }
  group.add(rocks);
  for (let k = 0; k < 14; k++) {
    const side = k % 2 ? 1 : -1, s = 100 + k * 90;
    const c = along(s, side * (160 + rng() * 200));
    group.add(buildMesa(c.x, c.z, 40 + rng() * 50, 30 + rng() * 50, rng));
  }
  for (let i = 0; i < 9; i++) { // Mirage Springs on the horizon, its towers catching the last of the sun
    const h = 60 + rng() * 120, w = 14 + rng() * 14;
    const t = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), new THREE.MeshStandardMaterial({ color: DESERT_GLASS[i % 4], roughness: 0.25, metalness: 0.7, emissive: 0x6a4a20, emissiveIntensity: 0.35 }));
    t.position.set(-200 + i * 50 + rng() * 20, h / 2, -LINE_END - 900 - rng() * 200);
    group.add(t);
  }

  // ---------------------------------------------------------------- the level crossing, and Ricky's van
  const end = along(LINE_END, 0), endHd = P.heading;
  const road = new THREE.Mesh(new THREE.PlaneGeometry(2400, 11), lam(0x3a3a3e));
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.04, end.z - 4);
  group.add(road);
  for (let x = -1190; x < 1200; x += 14) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.3), new THREE.MeshBasicMaterial({ color: 0xe8c040 }));
    d.rotation.x = -Math.PI / 2;
    d.position.set(x, 0.06, end.z - 4);
    group.add(d);
  }
  const flashers = [];
  for (const side of [-1, 1]) {
    const c = along(LINE_END - 3, side * 3.4);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.6, 6), lam(0xe8e8e8));
    post.position.set(c.x, 1.8, c.z);
    const x = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.2, 0.05), lam(0xf0f0f0));
    x.position.set(c.x, 3.3, c.z); x.rotation.set(0, endHd, 0.6);
    const x2 = x.clone(); x2.rotation.set(0, endHd, -0.6);
    const lamp = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0xff2020, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    lamp.position.set(c.x, 2.6, c.z);
    lamp.scale.setScalar(1.4);
    group.add(post, x, x2, lamp);
    flashers.push(lamp);
  }
  const van = makeCarMesh({ kind: 'van', color: 0x2a3a5a, parked: true });
  van.position.set(end.x + 7, 0, end.z - 4);
  van.rotation.y = Math.PI / 2;
  group.add(van);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.6), new THREE.MeshBasicMaterial({ map: makeTextTexture('HIGHWAY 9', { color: '#ffffff', bg: '#2a6a3a', width: 512, height: 128 }) }));
  sign.position.set(end.x - 9, 3.4, end.z - 10.5);
  group.add(sign);
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.4, 3, 32), makeGlowMaterial(0x4dffa6, 0.75));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(end.x, 0.1, end.z);
  group.add(ring);

  const spawn = new THREE.Vector3(0, 0.05, 0);
  spawn.yaw = 0;
  return { group, world, spawn, ladders: [], handcar: buildHandcar(), lamps, flashers, ring, van };
}

import * as THREE from 'three';
import { CollisionWorld } from '../../core/collision.js';
import { makeTextTexture } from '../materials.js';
import { buildCacti, buildMesa, DESERT_GLASS } from '../desert.js';
import { makeRng, clamp } from '../../core/utils.js';

// ======================================================================
//  Chapter 22, Part 1: across the dunes after Sable, in a dune buggy.
//
//  Juno's plane lands on a dry lake (flat, cracked mud, round z = 0). The
//  chase runs towards -z, a kilometre and a half to the highway into
//  Mirage Springs:
//    - the small dunes, then bigger ones: long gentle slopes up the
//      windward side, a sharp crest, and a steep slip face down the other
//      side. Over a crest at speed, you fly.
//    - the canyon: a dry wash between two mesas, flat, with boulders.
//    - the big dunes.
//    - the cactus flats.
//    - the highway (z = -1650), and the city's towers far off beyond it.
//  The ground is a height function (duneHeight), not boxes: the buggies
//  follow it, and the camera keeps above it. Boxes are only for the solid
//  things: the canyon walls, boulders, cacti, the plane.
// ======================================================================

export const START_Z = 0;
export const END_Z = -1640;      // the highway: Sable mustn't get there
export const HIGHWAY_Z = -1656;
export const CANYON = { z0: -745, z1: -535 };
const CANYON_T0 = -CANYON.z1, CANYON_T1 = -CANYON.z0;
export const CHECKPOINTS = [
  { z: -20, name: 'The dry lake' },
  { z: -540, name: 'The canyon' },
  { z: -1080, name: 'The big dunes' },
];

const P = 60;            // a dune every 60 m
const CREST = 0.82;      // where the crest is in each dune (the slip face is the last 18%)
// how big the dunes are along the way (distance from the lake, height)
const AMP = [[0, 0], [90, 0], [160, 3.2], [480, 4.8], [530, 0], [755, 0], [810, 5.8], [1220, 6.6], [1270, 1.1], [1540, 1.1], [1585, 0], [3000, 0]];

/** Where the racing line is (x) at z: Sable's way through. */
export function routeX(z) {
  const t = -z;
  return 30 * Math.sin(t / 190) + 18 * Math.sin(t / 83 + 1) - 15;
}

function ampAt(t) {
  if (t <= 0) return 0;
  for (let i = 1; i < AMP.length; i++) {
    if (t <= AMP[i][0]) {
      const [t0, a0] = AMP[i - 1], [t1, a1] = AMP[i];
      const k = (t - t0) / (t1 - t0), s = k * k * (3 - 2 * k);
      return a0 + (a1 - a0) * s;
    }
  }
  return 0;
}

/** The height of the sand at (x, z). */
export function duneHeight(x, z) {
  const t = -z;
  if (t < 85) return 0; // (the dry lake: flat)
  const ax = Math.abs(x);
  const edge = clamp((236 - ax) / 30, 0, 1);
  if (edge <= 0) return 0;
  const a = ampAt(t);
  // a gentle roll over everything, so the flat bits aren't flat
  const roll = 0.45 * Math.sin(x / 13 + 1) * Math.sin(t / 19) * clamp((t - 85) / 40, 0, 1) * (t > CANYON_T0 && t < CANYON_T1 ? 0.3 : 1);
  if (a < 0.01) return roll * edge;
  // the ridges bend across the desert
  const phi = (t + 14 * Math.sin(x / 41) + 8 * Math.sin(x / 17 + 1.3)) / P;
  const n = Math.floor(phi), f = phi - n;
  const prof = f < CREST ? Math.pow(f / CREST, 1.8) : Math.pow(1 - (f - CREST) / (1 - CREST), 1.25);
  // each ridge has low saddles in different places; away from the line the dunes get bigger
  const saddle = 0.6 + 0.4 * Math.sin(x / 23 + n * 2.1);
  const d = Math.abs(x - routeX(z));
  const side = 1 + clamp((d - 80) / 50, 0, 1.4);
  return (a * saddle * side * prof + roll) * edge;
}
/** Rippled sand. */
function sandTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 256);
  const rng = makeRng(7);
  for (let i = 0; i < 1400; i++) { // grains
    g.fillStyle = `rgba(${rng() < 0.5 ? '120,90,50' : '255,250,240'},${0.05 + rng() * 0.08})`;
    g.fillRect(rng() * 256, rng() * 256, 2, 2);
  }
  g.lineWidth = 3;
  for (let y = 0; y < 256; y += 16) { // wind ripples
    g.strokeStyle = 'rgba(140,100,60,0.16)';
    g.beginPath();
    for (let x = 0; x <= 256; x += 8) g.lineTo(x, y + Math.sin(x / 256 * Math.PI * 4 + y) * 4);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Cracked mud on the dry lake. */
function mudTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#d4c2a2';
  g.fillRect(0, 0, 256, 256);
  const rng = makeRng(11);
  g.strokeStyle = 'rgba(110,90,60,0.55)';
  g.lineWidth = 2;
  // a rough grid of plates, each edge wobbly
  const pts = [];
  for (let j = 0; j <= 6; j++) for (let i = 0; i <= 6; i++) pts.push([i * 256 / 6 + (i % 6 ? (rng() - 0.5) * 22 : 0), j * 256 / 6 + (j % 6 ? (rng() - 0.5) * 22 : 0)]);
  const at = (i, j) => pts[j * 7 + i];
  for (let j = 0; j <= 6; j++) for (let i = 0; i <= 6; i++) {
    for (const [di, dj] of [[1, 0], [0, 1]]) {
      if (i + di > 6 || j + dj > 6) continue;
      const a = at(i, j), b = at(i + di, j + dj);
      g.beginPath();
      g.moveTo(a[0], a[1]);
      g.lineTo((a[0] + b[0]) / 2 + (rng() - 0.5) * 8, (a[1] + b[1]) / 2 + (rng() - 0.5) * 8);
      g.lineTo(b[0], b[1]);
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Juno's cargo plane: a high wing, two propellers, the ramp down at the back. */
export function buildCargoPlane() {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xe4e4e0, roughness: 0.55 });
  const grey = new THREE.MeshStandardMaterial({ color: 0x6a6e76, roughness: 0.6, metalness: 0.3 });
  const pink = new THREE.MeshStandardMaterial({ color: 0xff8ac8, roughness: 0.5 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 17, 14), white);
  body.rotation.x = Math.PI / 2;
  body.position.set(0, 3, 0.5);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(2.1, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), white);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 3, 9);
  const cockpit = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.7, 1.4), new THREE.MeshStandardMaterial({ color: 0x1a2430, roughness: 0.2, metalness: 0.5 }));
  cockpit.position.set(0, 4.3, 9.2);
  cockpit.rotation.x = -0.4;
  const tailcone = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 0.6, 6, 14, 1, true), white);
  tailcone.rotation.x = -Math.PI / 2 + 0.25;
  tailcone.position.set(0, 4, -10.5);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5, 3.2), pink);
  fin.position.set(0, 7, -12.2);
  const stab = new THREE.Mesh(new THREE.BoxGeometry(9, 0.25, 2.2), white);
  stab.position.set(0, 5.4, -12.6);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(30, 0.4, 3.6), white);
  wing.position.set(0, 5.3, 1.5);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(4.24, 0.35, 17), pink);
  stripe.position.set(0, 2.4, 0.5);
  g.add(body, nose, cockpit, tailcone, fin, stab, wing, stripe);
  for (const s of [-1, 1]) {
    const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.7, 4, 12), grey);
    eng.rotation.x = Math.PI / 2;
    eng.position.set(s * 6, 4.6, 3);
    const prop = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4.2, 0.1), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
    prop.position.set(s * 6, 4.6, 5.1);
    prop.rotation.z = s * 0.6;
    g.add(eng, prop);
    // the wheels under the body
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.5, 12), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(s * 1.6, 0.6, -1);
    g.add(wheel);
  }
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(3, 0.2, 5), grey);
  ramp.position.set(0, 1.0, -9.6);
  ramp.rotation.x = -0.4;
  g.add(ramp);
  return g;
}

/** A Jackal pickup truck: dusty black, a red jackal on the door, a light bar. */
export function buildPickup(color = 0x1e1f24) {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.4 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x111216, roughness: 0.3, metalness: 0.4 });
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  add(new THREE.BoxGeometry(2.1, 0.8, 5.2), paint, 0, 0.95, 0);
  add(new THREE.BoxGeometry(1.9, 0.75, 2.0), paint, 0, 1.72, 0.55);
  add(new THREE.BoxGeometry(1.95, 0.5, 1.9), dark, 0, 1.8, 0.55);
  add(new THREE.BoxGeometry(1.9, 0.5, 2.1), new THREE.MeshStandardMaterial({ color: 0x2a2b2e }), 0, 1.4, -1.5); // (the bed)
  add(new THREE.BoxGeometry(1.7, 0.18, 0.25), new THREE.MeshBasicMaterial({ color: 0xff8a20, toneMapped: false }), 0, 2.2, 0.9);
  for (const s of [-1.06, 1.06]) add(new THREE.BoxGeometry(0.04, 0.4, 0.9), new THREE.MeshBasicMaterial({ color: 0xc8202a }), s, 1.05, 0.5);
  const wheels = [];
  const tyre = new THREE.CylinderGeometry(0.5, 0.5, 0.4, 12);
  tyre.rotateZ(Math.PI / 2);
  for (const [x, z] of [[-1, 1.6], [1, 1.6], [-1, -1.7], [1, -1.7]]) {
    const w = new THREE.Mesh(tyre, new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 }));
    w.position.set(x, 0.5, z);
    g.add(w);
    wheels.push(w);
  }
  g.userData.wheels = wheels;
  return g;
}

export function buildChapter22Dunes() {
  const group = new THREE.Group();
  const world = new CollisionWorld(10);
  const rng = makeRng(2201);
  const mat = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

  // ---------------------------------------------------------------- the dunes (chunks along the way)
  const X0 = -240, X1 = 240, Z0 = -85, Z1 = -1740, DX = 3, DZ = 1.6;
  const sandMat = new THREE.MeshLambertMaterial({ map: sandTexture(), vertexColors: true });
  const nx = Math.round((X1 - X0) / DX);
  const totalRows = Math.round((Z0 - Z1) / DZ), CH = 7, rowsPer = Math.ceil(totalRows / CH);
  const c0 = new THREE.Color(0xd4a86c), cLow = new THREE.Color(0xb88450), cHigh = new THREE.Color(0xeccb92), tmp = new THREE.Color();
  for (let ch = 0; ch < CH; ch++) {
    const r0 = ch * rowsPer, r1 = Math.min(totalRows, r0 + rowsPer), rows = r1 - r0;
    if (rows <= 0) break;
    const verts = (nx + 1) * (rows + 1);
    const pos = new Float32Array(verts * 3), nor = new Float32Array(verts * 3), uv = new Float32Array(verts * 2), col = new Float32Array(verts * 3);
    let k = 0;
    for (let j = 0; j <= rows; j++) {
      const z = Z0 - (r0 + j) * DZ;
      for (let i = 0; i <= nx; i++, k++) {
        const x = X0 + i * DX, h = duneHeight(x, z);
        pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
        // the normal from the slope (the same either side of a chunk's edge: no seams)
        const hx = duneHeight(x + 0.5, z) - duneHeight(x - 0.5, z), hz = duneHeight(x, z + 0.5) - duneHeight(x, z - 0.5);
        const l = Math.hypot(hx, 1, hz);
        nor[k * 3] = -hx / l; nor[k * 3 + 1] = 1 / l; nor[k * 3 + 2] = -hz / l;
        uv[k * 2] = x / 7; uv[k * 2 + 1] = z / 7;
        // crests paler, hollows a little redder
        const amp = Math.max(1, ampAt(-z) * 1.2);
        tmp.copy(c0).lerp(h > amp * 0.5 ? cHigh : cLow, clamp(Math.abs(h - amp * 0.5) / amp, 0, 1) * 0.8);
        // the steep slip faces (falling away to -z) in their own shadow
        tmp.multiplyScalar(1 - clamp(hz * 0.9, 0, 0.32));
        col[k * 3] = tmp.r; col[k * 3 + 1] = tmp.g; col[k * 3 + 2] = tmp.b;
      }
    }
    const idx = [];
    for (let j = 0; j < rows; j++) for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    group.add(new THREE.Mesh(geo, sandMat));
  }
  // the dry lake, and flat sand out to the horizon all round
  const lake = new THREE.Mesh(new THREE.PlaneGeometry(480, 260), new THREE.MeshLambertMaterial({ map: mudTexture() }));
  lake.material.map.repeat.set(480 / 14, 260 / 14);
  lake.rotation.x = -Math.PI / 2;
  lake.position.set(0, 0, Z0 + 130);
  group.add(lake);
  const far = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), mat(0xe2c08a));
  far.rotation.x = -Math.PI / 2;
  far.position.set(0, -0.08, -800);
  group.add(far);

  // ---------------------------------------------------------------- the canyon: two mesas, a dry wash between
  const rock = [mat(0xb0623a, { flatShading: true }), mat(0xc07448, { flatShading: true }), mat(0xa85a34, { flatShading: true })];
  const boulderGeo = new THREE.DodecahedronGeometry(1, 0);
  for (let z = CANYON.z1 + 10; z > CANYON.z0 - 10; z -= 14) {
    const rx = routeX(z), half = 21 + Math.sin(z / 23) * 3;
    for (const s of [-1, 1]) {
      const inner = rx + s * half, outer = rx + s * (half + 55);
      const x0 = Math.min(inner, outer), x1 = Math.max(inner, outer), h = 24 + rng() * 14;
      world.addBox(x0, -2, z - 7.5, x1, h, z + 7.5, { tag: 'wall' });
      // the cliff: layers of red rock, each stepped back a little
      for (let k = 0; k < 3; k++) {
        const w = x1 - x0 - k * 2.5, lh = h / 3;
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, lh, 15.4 + rng() * 1.5), rock[(k + Math.floor(-z / 14)) % 3]);
        m.position.set((x0 + x1) / 2 + s * k * 1.25, lh * (k + 0.5), z);
        group.add(m);
      }
    }
  }
  // the mesa tops beyond the cliffs, and a couple more out in the desert
  group.add(buildMesa(routeX(-640) - 95, -640, 70, 40, rng), buildMesa(routeX(-640) + 95, -640, 70, 38, rng));
  // boulders in the wash (never on the line)
  const boulders = new THREE.InstancedMesh(boulderGeo, rock[0], 40);
  const o = new THREE.Object3D();
  let nb = 0;
  for (let z = CANYON.z1 - 12; z > CANYON.z0 + 12 && nb < 40; z -= 9 + rng() * 8) {
    const s = rng() < 0.5 ? -1 : 1, x = routeX(z) + s * (7 + rng() * 11), r = 1.2 + rng() * 1.6;
    o.position.set(x, r * 0.5, z);
    o.rotation.set(rng(), rng(), rng());
    o.scale.set(r, r * 0.8, r);
    o.updateMatrix();
    boulders.setMatrixAt(nb++, o.matrix);
    world.addBox(x - r * 0.8, -1, z - r * 0.8, x + r * 0.8, r * 1.3, z + r * 0.8, { tag: 'wall' });
  }
  boulders.count = nb;
  group.add(boulders);

  // ---------------------------------------------------------------- cacti (solid) and rocks (just looks)
  const cacti = [];
  const plant = (x, z, s) => {
    const y = duneHeight(x, z);
    cacti.push([x, z, s, rng() * Math.PI, y - 0.25]);
    world.addBox(x - 0.55 * s, y - 1, z - 0.55 * s, x + 0.55 * s, y + 6 * s, z + 0.55 * s, { tag: 'wall' });
  };
  // the cactus flats: a forest of them, with gaps
  for (let i = 0; i < 260; i++) {
    const z = -1255 - rng() * 300, rx = routeX(z), x = rx + (rng() - 0.5) * 220;
    if (Math.abs(x - rx) < 6.5) continue;
    plant(x, z, 0.7 + rng() * 0.6);
  }
  // a few in the dunes' hollows, away from the line
  for (let i = 0; i < 90; i++) {
    const z = -120 - rng() * 1100, rx = routeX(z), x = rx + (rng() < 0.5 ? -1 : 1) * (14 + rng() * 120);
    if (z < CANYON.z1 + 20 && z > CANYON.z0 - 20) continue;
    if (duneHeight(x, z) > 1.2) continue;
    plant(x, z, 0.6 + rng() * 0.5);
  }
  const cm = buildCacti(cacti);
  // (buildCacti stands them at y 0: lift each onto the sand)
  cacti.forEach(([x, z, s, r, y], i) => { o.position.set(x, y, z); o.rotation.set(0, r, 0); o.scale.setScalar(s); o.updateMatrix(); cm.setMatrixAt(i, o.matrix); });
  cm.instanceMatrix.needsUpdate = true;
  group.add(cm);
  const pebbles = new THREE.InstancedMesh(boulderGeo, mat(0xa87a54, { flatShading: true }), 120);
  for (let i = 0; i < 120; i++) {
    const z = -100 - rng() * 1550, x = routeX(z) + (rng() < 0.5 ? -1 : 1) * (10 + rng() * 150), r = 0.3 + rng() * 0.6;
    o.position.set(x, duneHeight(x, z) + r * 0.2, z);
    o.rotation.set(rng(), rng(), rng());
    o.scale.setScalar(r);
    o.updateMatrix();
    pebbles.setMatrixAt(i, o.matrix);
  }
  group.add(pebbles);

  // ---------------------------------------------------------------- the dry lake: Juno's plane, the crew's trucks
  const plane = buildCargoPlane();
  plane.position.set(-34, 0, 40);
  plane.rotation.y = -0.5;
  group.add(plane);
  world.addBox(-38, 0, 30, -30, 6, 50, { tag: 'wall' });
  // tyre tracks: where the Jackals came in
  const tracks = new THREE.Mesh(new THREE.PlaneGeometry(3, 160), new THREE.MeshBasicMaterial({ color: 0x8a7050, transparent: true, opacity: 0.22, depthWrite: false }));
  tracks.rotation.x = -Math.PI / 2;
  tracks.position.set(14, 0.02, -10);
  tracks.rotation.z = 0.15;
  group.add(tracks);

  // ---------------------------------------------------------------- the highway, the poles, the sign, the city far off
  const road = new THREE.Mesh(new THREE.PlaneGeometry(1600, 12), mat(0x3a3a3e));
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.03, HIGHWAY_Z);
  group.add(road);
  for (let x = -790; x < 800; x += 14) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.3), new THREE.MeshBasicMaterial({ color: 0xe8c040 }));
    d.rotation.x = -Math.PI / 2;
    d.position.set(x, 0.05, HIGHWAY_Z);
    group.add(d);
  }
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.18, 9, 6), mat(0x5a4632), 40);
  for (let i = 0; i < 40; i++) { o.position.set(-560 + i * 28, 4.5, HIGHWAY_Z - 9); o.rotation.set(0, 0, 0); o.scale.setScalar(1); o.updateMatrix(); poles.setMatrixAt(i, o.matrix); }
  group.add(poles);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.4), new THREE.MeshBasicMaterial({
    map: makeTextTexture('MIRAGE SPRINGS  12', { color: '#ffffff', bg: '#2a6a3a', width: 512, height: 128 }) }));
  sign.position.set(routeX(HIGHWAY_Z) + 30, 4.2, HIGHWAY_Z + 7);
  group.add(sign);
  // the casino towers on the horizon: gold, and very tall
  for (let i = 0; i < 9; i++) {
    const h = 60 + rng() * 120, w = 14 + rng() * 14;
    const t = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), new THREE.MeshStandardMaterial({ color: DESERT_GLASS[i % DESERT_GLASS.length], roughness: 0.25, metalness: 0.7 }));
    t.position.set(-180 + i * 45 + rng() * 20, h / 2, -2450 - rng() * 200);
    group.add(t);
  }

  // ---------------------------------------------------------------- mesas on the horizon all round
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2 + rng() * 0.3, r = 900 + rng() * 300;
    group.add(buildMesa(Math.cos(a) * r * 0.6, -800 + Math.sin(a) * r, 50 + rng() * 60, 40 + rng() * 60, rng));
  }

  // ---------------------------------------------------------------- Sable's way: a point every 25 m
  const route = [];
  for (let t = 10; t <= -END_Z + 60; t += 25) {
    const z = -t;
    route.push(new THREE.Vector3(routeX(z), 0, z));
  }

  const spawn = new THREE.Vector3(routeX(-20), 0, -20);
  spawn.yaw = 0;
  return { group, world, spawn, ladders: [], route, plane };
}

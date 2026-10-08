import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeGlowMaterial, getGlowTexture } from '../world/materials.js';
import { PlayerModel } from '../player/playerModel.js';
import { addReflections, makeShaftMaterial, headlightShaftGeometry } from '../world/atmosphere.js';
import { currentLook } from '../player/outfits.js';
import { POLICE_LOOK } from '../player/people.js';
import { save } from '../core/save.js';

// Car meshes (the player's getaway car, police cruisers, traffic, vans, taxis).
// Cars face +Z: headlights at +Z, tail lights at -Z.
//
// Each body is a side profile (bumpers, hood, wheel arches, boot) extruded
// across the car with rounded edges, with a glass "greenhouse" on top that
// narrows towards the roof, framed by pillars. Then the details: slanted
// headlights, a tail-light bar, grille, mirrors, door lines, side skirts,
// exhausts, number plates, and wheels with tyres and spoked rims.
//
// Materials are cached and shared between cars of the same colour, shapes
// are built once per kind, and after building, the static pieces that share
// a material are merged into one mesh (a car is ~10 draw calls).

const geoCache = new Map();
const matCache = new Map();

function geo(key, make) {
  if (!geoCache.has(key)) geoCache.set(key, make());
  return geoCache.get(key);
}
function mat(key, make) {
  if (!matCache.has(key)) matCache.set(key, make());
  return matCache.get(key);
}
const lambert = (color) => mat(`l${color}`, () => new THREE.MeshLambertMaterial({ color }));
/** Shiny car paint: a sharp highlight, and the sky and city lights reflected in it. */
const paintMat = (color) => addReflections(new THREE.MeshPhongMaterial({ color, specular: 0x5a5a5a, shininess: 70 }), 0.14);
const paint = (color) => mat(`p${color}`, () => paintMat(color));
const glassMat = (tint) => mat(`g${tint}`, () => addReflections(new THREE.MeshPhongMaterial({ color: tint ?? 0x18222f, specular: 0x9aaabb, shininess: 110 }), 0.5));
const TRIM = 0x121316;
const trim = () => lambert(TRIM);
const chrome = () => mat('chrome', () => addReflections(new THREE.MeshPhongMaterial({ color: 0xb8bec8, specular: 0xffffff, shininess: 120 }), 0.7));
/** Headlight beams (only show at night in rain and snow): one shared material. */
const headBeam = () => mat('headBeam', () => makeShaftMaterial(0xfff0d0, 0.2));
const HEADLIGHTS = { bike: [[0, 0.98, 0.92]], dirt: [[0, 1.12, 0.86]], muscle: [[-0.64, 0.8, 2.32], [0.64, 0.8, 2.32]], rally: [[-0.6, 0.86, 2.02], [0.6, 0.86, 2.02]], coupe: [[-0.62, 0.84, 2.2], [0.62, 0.84, 2.2]], sedan: [[-0.62, 0.88, 2.24], [0.62, 0.88, 2.24]], van: [[-0.72, 0.98, 2.6], [0.72, 0.98, 2.6]], bus: [[-0.9, 0.85, 5.52], [0.9, 0.85, 5.52]], truck: [[-0.85, 1.05, 4.12], [0.85, 1.05, 4.12]], sled: [[0, 0.64, 1.46]] };
function addHeadlightBeams(g, key) {
  const geo2 = geo(`beams:${key}`, () => mergeGeometries(HEADLIGHTS[key].map(([x, y, z]) => headlightShaftGeometry(15, 0.12, 2.6).translate(x, y, z)), false)); // (keeps the uvs: the beam fades along them)
  const m = new THREE.Mesh(geo2, headBeam());
  m.renderOrder = 2;
  g.add(m);
  return m;
}
const plate = () => lambert(0xe8e6dc);

const { PI } = Math;
const BEVEL = 0.06;
const WHEEL_R = 0.42;

// ---------------------------------------------------------------- body shapes
// Side profiles: [z, y] points from the bottom of the rear bumper, over the
// top, down the nose. Arches are cut out of the bottom. (BEVEL is added all round.)
const PROFILES = {
  coupe: {
    width: 2.05, wheelZ: 1.4, wheelX: 0.98, arch: 0.53,
    top: [[-2.18, 0.4], [-2.24, 0.62], [-2.2, 0.9], [-1.95, 0.97], [-1.35, 0.99], [0.72, 0.99], [1.55, 0.92], [2.02, 0.84], [2.22, 0.72], [2.24, 0.5], [2.18, 0.4]],
    cabin: [[0.74, 0.97], [-0.06, 1.48], [-0.66, 1.5], [-1.5, 0.98]],
    taper: 0.32, cabinW: 1.74,
    lights: { headY: 0.8, headZ: 2.12, tailY: 0.82, tailZ: -2.27 },
    doors: [0.62, -0.55],
  },
  sedan: {
    width: 2.05, wheelZ: 1.42, wheelX: 0.98, arch: 0.53,
    top: [[-2.2, 0.4], [-2.26, 0.62], [-2.22, 1.0], [-1.6, 1.06], [0.8, 1.04], [1.65, 0.97], [2.08, 0.9], [2.25, 0.74], [2.26, 0.5], [2.2, 0.4]],
    cabin: [[0.82, 1.02], [0.04, 1.64], [-0.95, 1.66], [-1.6, 1.04]],
    taper: 0.26, cabinW: 1.78,
    lights: { headY: 0.84, headZ: 2.16, tailY: 0.88, tailZ: -2.29 },
    doors: [0.7, -0.25, -1.12],
  },
  // Unlockable getaway cars (Your car > Car)
  muscle: { // long bonnet, low roof set well back, short boot
    width: 2.1, wheelZ: 1.5, wheelX: 1.0, arch: 0.55,
    top: [[-2.3, 0.42], [-2.36, 0.64], [-2.32, 0.86], [-2.0, 0.92], [-1.5, 0.94], [0.4, 0.96], [1.4, 0.93], [2.1, 0.86], [2.34, 0.74], [2.36, 0.52], [2.3, 0.42]],
    cabin: [[0.4, 0.94], [-0.35, 1.38], [-0.95, 1.4], [-1.6, 0.94]],
    taper: 0.34, cabinW: 1.72,
    lights: { headY: 0.78, headZ: 2.26, tailY: 0.8, tailZ: -2.39 },
    doors: [0.3, -0.85],
  },
  rally: { // short and tall, a hatchback with a roof spoiler
    width: 1.95, wheelZ: 1.28, wheelX: 0.94, arch: 0.52,
    top: [[-1.9, 0.42], [-1.96, 0.66], [-1.95, 1.0], [-1.85, 1.08], [-1.6, 1.1], [0.7, 1.06], [1.45, 0.98], [1.9, 0.88], [2.02, 0.72], [2.04, 0.5], [1.98, 0.42]],
    cabin: [[0.72, 1.06], [-0.05, 1.55], [-1.5, 1.57], [-1.82, 1.1]],
    taper: 0.22, cabinW: 1.7,
    lights: { headY: 0.84, headZ: 1.96, tailY: 1.0, tailZ: -1.99 },
    doors: [0.6, -0.5],
    spoiler: { z: -1.58, y: 1.27 }, // (on the roof, over the hatch)
  },
};

/** A profile (list of [z, y]) with wheel arches cut out of the bottom, as a THREE.Shape. */
function bodyShape(p) {
  const s = new THREE.Shape();
  const pts = p.top;
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  // Along the bottom from the front to the back, over each wheel
  const y = WHEEL_R;
  for (const wz of [p.wheelZ, -p.wheelZ]) {
    s.lineTo(wz + p.arch, y - 0.02);
    s.absarc(wz, y - 0.02, p.arch, 0, PI, false);
  }
  s.lineTo(pts[0][0], pts[0][1]);
  return s;
}

/** Extrude a [z, y] shape across the car (along x), centred, with rounded edges. */
function extrudeAcross(shape, width, bevel = BEVEL, segs = 2) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: segs, curveSegments: 10 });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.rotateY(-PI / 2); // shape x -> car z (forward), extrusion -> car x
  g.deleteAttribute('uv');
  return g;
}

/** Narrow the top of a greenhouse: x shrinks the higher it goes (tumblehome). */
function taper(g, yBase, k) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y > yBase) p.setX(i, p.getX(i) * (1 - (y - yBase) * k));
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

/** A thin bar from a to b ([z, y] points) at side position x, pushed `out` from the surface (front-to-back order). */
function bar(a, b, x, thick, wide, out = 0) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const dz = (b[0] - a[0]) / len, dy = (b[1] - a[1]) / len;
  const g = new THREE.BoxGeometry(wide, thick, len);
  g.rotateX(-Math.atan2(dy, dz));
  g.translate(x, (a[1] + b[1]) / 2 - dz * out, (a[0] + b[0]) / 2 + dy * out);
  return g;
}

const box = (w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) => {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
  g.translate(x, y, z);
  return g;
};

/** Merge geometries (dropping uvs so everything matches). */
function merge(list) {
  for (const g of list) { if (g.attributes.uv) g.deleteAttribute('uv'); }
  const nonIdx = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const m = mergeGeometries(nonIdx, false);
  return m;
}

/** Everything for one body style, built once and shared (by every car of that kind). */
function bodyParts(kindKey) {
  return geo(`body:${kindKey}`, () => {
    const p = PROFILES[kindKey];
    const W = p.width, hw = W / 2;
    const out = {};
    out.shell = extrudeAcross(bodyShape(p), W);

    // Greenhouse (glass) and its frame: roof and pillars, narrowing upwards
    const c = p.cabin;
    const cs = new THREE.Shape();
    cs.moveTo(c[0][0], c[0][1]);
    for (let i = 1; i < c.length; i++) cs.lineTo(c[i][0], c[i][1]);
    cs.lineTo(c[0][0], c[0][1]);
    const yBase = c[0][1];
    out.glass = taper(extrudeAcross(cs, p.cabinW, 0.03, 1), yBase, p.taper);
    const fw = p.cabinW / 2 + 0.012; // frame sits just outside the glass
    const frame = [];
    for (const sx of [-1, 1]) {
      frame.push(bar(c[0], c[1], sx * (fw - 0.04), 0.07, 0.1, 0.02)); // A pillar
      frame.push(bar(c[2], c[3], sx * (fw - 0.05), 0.08, 0.13, 0.02)); // C pillar
      const bz = (c[1][0] + c[2][0]) / 2 + (p.doors.length > 2 ? 0.1 : -0.15);
      frame.push(bar([bz + 0.05, yBase], [bz - 0.02, c[1][1]], sx * (fw - 0.02), 0.08, 0.05)); // B pillar
      frame.push(bar([c[0][0] - 0.05, yBase + 0.1], [c[3][0] + 0.05, yBase + 0.1], sx * (fw - 0.02), 0.06, 0.05)); // window sill
    }
    const roofLen = Math.hypot(c[2][0] - c[1][0], c[2][1] - c[1][1]);
    frame.push(bar([c[1][0] + 0.06, c[1][1] + 0.02], [c[2][0] - 0.06, c[2][1] + 0.02], 0, 0.06, p.cabinW + 0.02));
    out.frame = taper(merge(frame), yBase, p.taper);
    out.roofLen = roofLen;

    // Dark trim: grille, splitter, diffuser, side skirts, door lines, mirrors' backs, wheel wells
    const L = p.lights, t = [];
    const noseZ = p.top[p.top.length - 2][0] + BEVEL * 0.8;
    const rearZ = p.top[1][0] - BEVEL * 0.8;
    t.push(box(1.05, 0.16, 0.06, 0, 0.58, noseZ - 0.005));                // grille
    t.push(box(1.9, 0.06, 0.16, 0, 0.36, noseZ - 0.08));                  // front splitter
    t.push(box(1.5, 0.12, 0.06, 0, 0.44, rearZ + 0.005));                 // rear diffuser
    for (const sx of [-1, 1]) {
      t.push(box(0.06, 0.08, 2 * p.wheelZ - 2 * p.arch - 0.05, sx * (hw + 0.02), 0.38, 0)); // side skirt
      for (const dz of p.doors) t.push(box(0.012, 0.5, 0.014, sx * (hw + 0.003), 0.7, dz));     // door seams
      t.push(box(0.03, 0.03, 0.13, sx * (hw + 0.012), 0.92, p.doors[1] + 0.25));            // door handle
    }
    out.trim = merge(t);

    // Wheel wells: dark half-tubes inside the arches, so you can't see through the car
    const wells = [];
    for (const wz of [p.wheelZ, -p.wheelZ]) {
      const w = new THREE.CylinderGeometry(p.arch - 0.01, p.arch - 0.01, W - 0.1, 12, 1, true, -PI / 2, PI);
      w.rotateZ(PI / 2);
      w.translate(0, WHEEL_R - 0.02, wz);
      wells.push(w);
    }
    out.wells = merge(wells);

    // Head and tail lights: slanted lenses on the nose, a light bar at the back
    const head = [], tail = [];
    const slope = Math.atan2(p.top[p.top.length - 4][1] - p.top[p.top.length - 3][1], p.top[p.top.length - 3][0] - p.top[p.top.length - 4][0]);
    for (const sx of [-1, 1]) {
      head.push(box(0.46, 0.035, 0.24, sx * 0.62, L.headY + 0.03, L.headZ, slope, sx * 0.12, 0));
      tail.push(box(0.5, 0.13, 0.04, sx * 0.66, L.tailY, L.tailZ - 0.02));
    }
    tail.push(box(0.8, 0.04, 0.03, 0, L.tailY + 0.03, L.tailZ - 0.03));
    out.head = merge(head);
    out.tail = merge(tail);
    out.plates = merge([box(0.5, 0.13, 0.02, 0, 0.5, noseZ + 0.02), box(0.5, 0.13, 0.02, 0, 0.62, rearZ - 0.02)]);
    out.exhaust = merge([-0.55, 0.55].map((x) => { const e = new THREE.CylinderGeometry(0.055, 0.055, 0.14, 10, 1, true); e.rotateX(PI / 2); e.translate(x, 0.42, rearZ - 0.03); return e; }));
    // Wing mirrors: body-coloured housings on little stalks, the glass facing back
    out.mirrors = merge([-1, 1].flatMap((sx) => [box(0.2, 0.11, 0.09, sx * (hw + 0.1), yBase + 0.12, c[0][0] - 0.2, 0, sx * -0.15, 0),
      box(0.1, 0.03, 0.04, sx * (hw + 0.03), yBase + 0.08, c[0][0] - 0.2)]));
    out.mirrorGlass = merge([-1, 1].map((sx) => box(0.16, 0.08, 0.01, sx * (hw + 0.1), yBase + 0.12, c[0][0] - 0.25, 0, sx * -0.15, 0)));
    out.p = p;
    out.noseZ = noseZ;
    out.rearZ = rearZ;
    return out;
  });
}

/** Racing stripes over the boot, roof and bonnet (not over the glass). */
function stripeGeo(kindKey) {
  return geo(`stripe:${kindKey}`, () => {
    const b = bodyParts(kindKey), p = b.p, c = p.cabin, lift = BEVEL * 0.8 + 0.006;
    const pts = p.top;
    const segs = [];
    for (const x of [-0.24, 0.24]) {
      for (let i = 2; i < pts.length - 2; i++) {
        const a = pts[i], bb = pts[i + 1];
        if (a[0] > c[3][0] && bb[0] < c[0][0]) continue; // (under the greenhouse)
        segs.push(bar([a[0], a[1] + lift], [bb[0], bb[1] + lift], x, 0.012, 0.24));
      }
      segs.push(bar([c[1][0], c[1][1] + 0.055], [c[2][0], c[2][1] + 0.055], x * (1 - (c[1][1] - c[0][1]) * p.taper), 0.012, 0.24));
    }
    return merge(segs);
  });
}

/** A wheel: rounded tyre and a five-spoke rim (shared by every car with that rim colour). */
function wheelGeo(spokes) {
  return geo(`wheel:${spokes}`, () => {
    // Tyre: a rounded cross-section spun round the axle
    const prof = [];
    const r = WHEEL_R, w = 0.15;
    for (let i = 0; i <= 6; i++) {
      const a = -PI / 2 + (i / 6) * PI;
      prof.push(new THREE.Vector2(r - 0.05 + Math.cos(a) * 0.05, w * Math.sin(a) * 0.95));
    }
    prof.unshift(new THREE.Vector2(0.27, -w * 0.95));
    prof.push(new THREE.Vector2(0.27, w * 0.95));
    const tyre = new THREE.LatheGeometry(prof, 18);
    tyre.rotateZ(PI / 2);
    tyre.deleteAttribute('uv');
    // Rim (on the outside face, +x): a dish, spokes and a centre cap
    const rim = [];
    const dish = new THREE.CylinderGeometry(0.28, 0.28, 0.04, 18, 1, false);
    dish.rotateZ(PI / 2);
    dish.translate(0.1, 0, 0);
    rim.push(dish);
    if (spokes) {
      for (let i = 0; i < 5; i++) {
        const s = new THREE.BoxGeometry(0.03, 0.24, 0.06);
        s.translate(0, 0.13, 0);
        s.rotateX((i / 5) * PI * 2);
        s.translate(0.13, 0, 0);
        rim.push(s);
      }
    }
    const cap = new THREE.CylinderGeometry(0.06, 0.07, 0.04, 10);
    cap.rotateZ(PI / 2);
    cap.translate(0.14, 0, 0);
    rim.push(cap);
    const rimGeo = merge(rim);
    // Traffic wheels: tyre and rim in one mesh, coloured per vertex (one draw call)
    const tNI = tyre.toNonIndexed();
    const paintVerts = (g, hex) => {
      const c = new THREE.Color(hex), a = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(a, 3));
      return g;
    };
    const solid = mergeGeometries([paintVerts(tNI, 0x141414), paintVerts(rimGeo.clone(), spokes ? 0x2a2c30 : 0x8a8e94)], false);
    return { tyre, rim: rimGeo, solid };
  });
}

// ---------------------------------------------------------------- underglow
/** A soft glow the shape of the car's footprint, fading out on the road. */
const POOL_W = 3.9, POOL_L = 6.6;
let underglowTex = null;
function getUnderglowTexture() {
  if (underglowTex) return underglowTex;
  const w = 96, h = 160;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  // Brightness from the distance (in metres) to a rounded rectangle just
  // inside the car's footprint: full under the car, then a soft falloff.
  const hx = 0.82, hz = 1.95, r = 0.45;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = ((i + 0.5) / w - 0.5) * POOL_W, z = ((j + 0.5) / h - 0.5) * POOL_L;
      const dx = Math.max(Math.abs(x) - (hx - r), 0), dz = Math.max(Math.abs(z) - (hz - r), 0);
      const d = Math.hypot(dx, dz) - r;
      const v = d <= 0 ? 1 : Math.exp(-((d / 0.38) ** 2)) * 0.8 + Math.exp(-d / 0.5) * 0.2;
      const k = (j * w + i) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = 255;
      img.data[k + 3] = Math.round(Math.min(1, v) * 255);
    }
  }
  g.putImageData(img, 0, 0);
  underglowTex = new THREE.CanvasTexture(c);
  underglowTex.colorSpace = THREE.SRGBColorSpace;
  return underglowTex;
}

function addUnderglow(g, color, p) {
  const glow = new THREE.Group();
  // Light on the road
  const pool = new THREE.Mesh(
    geo('underglowPool', () => { const pl = new THREE.PlaneGeometry(POOL_W, POOL_L); pl.rotateX(-PI / 2); return pl; }),
    new THREE.MeshBasicMaterial({ map: getUnderglowTexture(), color, transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  );
  pool.position.y = 0.04;
  pool.renderOrder = 1;
  glow.add(pool);
  // Neon tubes under the sills and bumpers (they glow with the bloom)
  const tubeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.2), toneMapped: false });
  const tubes = geo(`tubes:${p.wheelZ}`, () => {
    const list = [];
    for (const sx of [-1, 1]) {
      const t = new THREE.CapsuleGeometry(0.025, 2 * p.wheelZ - 2 * p.arch - 0.2, 2, 6);
      t.rotateX(PI / 2);
      t.translate(sx * 0.9, 0.3, 0);
      list.push(t);
    }
    for (const z of [1.95, -1.95]) {
      const t = new THREE.CapsuleGeometry(0.025, 1.2, 2, 6);
      t.rotateZ(PI / 2);
      t.translate(0, 0.3, z);
      list.push(t);
    }
    return merge(list);
  });
  glow.add(new THREE.Mesh(tubes, tubeMat));
  g.add(glow);
  return { group: glow, pool };
}

// ---------------------------------------------------------------- the car
function addMesh(parent, geometry, material, { shadow = true } = {}) {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = shadow;
  parent.add(m);
  return m;
}

/** A van: tall box body with a sloping bonnet and windscreen. */
function buildVan(body, bodyMat) {
  const p = { wheelZ: 1.7, wheelX: 1.05, arch: 0.53, top: [[-2.48, 0.42], [-2.5, 2.25], [-2.42, 2.36], [0.95, 2.36], [1.75, 1.45], [2.4, 1.18], [2.5, 0.95], [2.5, 0.48], [2.45, 0.42]] };
  const parts = geo('body:van', () => {
    const W = 2.2, hw = W / 2;
    const out = { shell: extrudeAcross(bodyShape(p), W) };
    out.glass = merge([ // windscreen and the front side windows
      bar([1.0, 2.26], [1.7, 1.52], 0, 0.03, 1.9, -0.05),
      ...[-1, 1].map((sx) => box(0.03, 0.6, 0.9, sx * (hw + 0.01), 1.85, 1.05)),
    ]);
    out.trim = merge([box(1.3, 0.2, 0.06, 0, 0.75, 2.56), box(2.1, 0.08, 0.2, 0, 0.4, 2.5), box(2.1, 0.1, 0.1, 0, 0.45, -2.56),
      ...[-1, 1].map((sx) => box(0.02, 1.5, 0.02, sx * (hw + 0.004), 1.3, 0.35)),
      ...[-1, 1].map((sx) => box(0.2, 0.14, 0.06, sx * (hw + 0.1), 1.65, 1.6))]);
    const wells = [];
    for (const wz of [p.wheelZ, -p.wheelZ]) {
      const w = new THREE.CylinderGeometry(p.arch - 0.01, p.arch - 0.01, W - 0.1, 12, 1, true, -PI / 2, PI);
      w.rotateZ(PI / 2);
      w.translate(0, WHEEL_R - 0.02, wz);
      wells.push(w);
    }
    out.wells = merge(wells);
    out.head = merge([-1, 1].map((sx) => box(0.42, 0.16, 0.05, sx * 0.72, 0.98, 2.56)));
    out.tail = merge([-1, 1].map((sx) => box(0.14, 0.42, 0.05, sx * 0.95, 1.0, -2.58)));
    out.plates = merge([box(0.5, 0.13, 0.02, 0, 0.6, 2.6), box(0.5, 0.13, 0.02, 0, 0.75, -2.6)]);
    return out;
  });
  addMesh(body, parts.shell, bodyMat);
  addMesh(body, parts.glass, glassMat(null));
  addMesh(body, parts.trim, trim());
  addMesh(body, parts.wells, mat('well', () => new THREE.MeshLambertMaterial({ color: 0x08080a, side: THREE.DoubleSide })), { shadow: false });
  addMesh(body, parts.plates, plate());
  return { p, parts };
}

/** A city bus: long and tall, a row of lit windows down each side. */
function buildBus(body, bodyMat) {
  const p = { wheelZ: 3.6, wheelX: 1.12, arch: 0.55, top: [[-5.45, 0.4], [-5.5, 3.0], [-5.35, 3.15], [5.25, 3.15], [5.5, 2.95], [5.55, 0.5], [5.5, 0.4]] };
  const parts = geo('body:bus', () => {
    const W = 2.5, hw = W / 2;
    const out = { shell: extrudeAcross(bodyShape(p), W, 0.08) };
    out.glass = merge([
      box(2.2, 1.45, 0.04, 0, 2.05, 5.56),                                       // big windscreen
      ...[-1, 1].map((sx) => box(0.03, 0.95, 9.4, sx * (hw + 0.01), 2.25, -0.35)), // side windows
      box(1.8, 0.7, 0.04, 0, 2.4, -5.51),                                         // back window
      box(0.05, 2.3, 1.1, -(hw + 0.015), 1.6, 4.45), box(0.05, 2.3, 1.1, -(hw + 0.015), 1.6, -0.4), // glass doors (on the kerb side)
    ]);
    out.trim = merge([
      ...[-1, 1].flatMap((sx) => [box(0.03, 0.16, 10.6, sx * (hw + 0.012), 1.15, 0), // a band along the sides
        ...[-3.6, -1.2, 1.2, 3.6].map((z) => box(0.04, 0.95, 0.12, sx * (hw + 0.02), 2.25, z - 0.35))]), // window pillars
      box(2.3, 0.16, 0.08, 0, 0.5, 5.56), box(2.3, 0.16, 0.08, 0, 0.5, -5.52),     // bumpers
      box(1.6, 0.35, 2.4, 0, 3.3, -1.5),                                           // air-con on the roof
      ...[-1, 1].map((sx) => box(0.08, 0.5, 0.08, sx * (hw + 0.25), 2.4, 5.2)),     // mirror arms
    ]);
    const wells = [];
    for (const wz of [p.wheelZ, -p.wheelZ]) {
      const w = new THREE.CylinderGeometry(p.arch - 0.01, p.arch - 0.01, W - 0.1, 12, 1, true, -PI / 2, PI);
      w.rotateZ(PI / 2);
      w.translate(0, WHEEL_R - 0.02, wz);
      wells.push(w);
    }
    out.wells = merge(wells);
    out.head = merge([-1, 1].map((sx) => box(0.36, 0.2, 0.05, sx * 0.9, 0.85, 5.56)));
    out.tail = merge([-1, 1].map((sx) => box(0.16, 0.5, 0.05, sx * 1.05, 1.0, -5.53)));
    out.plates = merge([box(0.5, 0.13, 0.02, 0, 0.75, 5.57), box(0.5, 0.13, 0.02, 0, 0.75, -5.55)]);
    out.sign = box(1.6, 0.26, 0.05, 0, 2.92, 5.57); // the route sign
    return out;
  });
  addMesh(body, parts.shell, bodyMat);
  addMesh(body, parts.glass, mat('busGlass', () => new THREE.MeshLambertMaterial({ color: 0x1c2630, emissive: 0x8a6a2c })), { shadow: false });
  addMesh(body, parts.trim, trim());
  addMesh(body, parts.wells, mat('well', () => new THREE.MeshLambertMaterial({ color: 0x08080a, side: THREE.DoubleSide })), { shadow: false });
  addMesh(body, parts.plates, plate(), { shadow: false });
  addMesh(body, parts.sign, mat('busSign', () => new THREE.MeshBasicMaterial({ color: 0xffa020, toneMapped: false })), { shadow: false });
  return { p, parts };
}

/** A box truck: a cab up front and a big cargo box behind. */
function buildTruck(body, bodyMat, boxColor) {
  const p = { wheelZ: 2.7, wheelX: 1.08, arch: 0.55, top: [[-4.1, 0.45], [-4.1, 1.05], [1.75, 1.05], [1.85, 2.75], [2.95, 2.8], [3.85, 1.65], [4.1, 1.3], [4.12, 0.5], [4.05, 0.45]] };
  const parts = geo('body:truck', () => {
    const W = 2.35, hw = W / 2;
    const out = { shell: extrudeAcross(bodyShape(p), W) };
    out.box = box(2.45, 2.45, 5.75, 0, 2.3, -1.2);
    out.glass = merge([bar([2.95, 2.72], [3.8, 1.7], 0, 0.03, 2.0, -0.04), ...[-1, 1].map((sx) => box(0.03, 0.62, 0.8, sx * (hw + 0.01), 2.2, 2.45))]);
    out.trim = merge([box(2.3, 0.18, 0.1, 0, 0.5, 4.12), box(2.4, 0.12, 0.12, 0, 0.6, -4.12), box(1.4, 0.4, 0.06, 0, 1.05, 4.1),
      box(2.47, 0.08, 5.77, 0, 1.12, -1.2), box(2.47, 0.08, 5.77, 0, 3.5, -1.2),                       // box rails
      ...[-1, 1].map((sx) => box(0.08, 0.6, 0.08, sx * (hw + 0.22), 2.2, 3.0))]);                         // mirrors
    const wells = [];
    for (const wz of [p.wheelZ, -p.wheelZ]) {
      const w = new THREE.CylinderGeometry(p.arch - 0.01, p.arch - 0.01, W - 0.1, 12, 1, true, -PI / 2, PI);
      w.rotateZ(PI / 2);
      w.translate(0, WHEEL_R - 0.02, wz);
      wells.push(w);
    }
    out.wells = merge(wells);
    out.head = merge([-1, 1].map((sx) => box(0.38, 0.18, 0.05, sx * 0.85, 1.05, 4.13)));
    out.tail = merge([-1, 1].map((sx) => box(0.16, 0.36, 0.05, sx * 1.05, 0.85, -4.14)));
    out.plates = merge([box(0.5, 0.13, 0.02, 0, 0.75, 4.14), box(0.5, 0.13, 0.02, 0, 0.75, -4.15)]);
    return out;
  });
  addMesh(body, parts.shell, bodyMat);
  addMesh(body, parts.box, lambert(boxColor));
  addMesh(body, parts.glass, glassMat(null), { shadow: false });
  addMesh(body, parts.trim, trim());
  addMesh(body, parts.wells, mat('well', () => new THREE.MeshLambertMaterial({ color: 0x08080a, side: THREE.DoubleSide })), { shadow: false });
  addMesh(body, parts.plates, plate(), { shadow: false });
  return { p, parts };
}

export const BUS_COLORS = [0xd8382a, 0x2a6ad8, 0xe8b820, 0x2a9a5a];
export const TRUCK_BOXES = [0xe8e6e0, 0xd8d0c0, 0x3a6aa8, 0xc8402a];

/**
 * @param {object} opts
 * @param {'player'|'police'|'civilian'|'van'|'taxi'|'bus'|'truck'} opts.kind
 * @param {number} [opts.boxColor] - a truck's cargo box
 * @param {number} opts.color
 * @param {object} [opts.style] - the player's car: { stripe, rims, spoiler, tint, glow }
 */
export function makeCarMesh({ kind = 'civilian', color = 0x888888, style = null, parked = false, boxColor = 0xe8e6e0 } = {}) {
  if (kind === 'player' && style?.body === 'bike') return makeBikeMesh({ color, style, parked }); // (the Street Bike)
  if (kind === 'player' && style?.body === 'dirt') return makeDirtBikeMesh({ color, style, parked }); // (the Dirt Bike)
  const st = style || { stripe: 0x151515, rims: 0x777777, spoiler: true, tint: null, glow: null };
  const g = new THREE.Group();
  const body = new THREE.Group(); // tilts for pitch/roll without moving wheels' parent
  g.add(body);
  const isVan = kind === 'van';
  const isPlayer = kind === 'player';
  // The player's paint gets its own material so the colour can change live.
  const bodyMat = isPlayer ? paintMat(color) : kind === 'police' ? paint(0x111317) : paint(color);
  const headMat = mat('head', () => new THREE.MeshBasicMaterial({ color: 0xfff1c4, toneMapped: false }));
  const tailMat = new THREE.MeshBasicMaterial({ color: 0x881018, toneMapped: false });

  let p, parts;
  if (isVan) {
    ({ p, parts } = buildVan(body, bodyMat));
  } else if (kind === 'bus') {
    ({ p, parts } = buildBus(body, bodyMat));
  } else if (kind === 'truck') {
    ({ p, parts } = buildTruck(body, bodyMat, boxColor));
  } else {
    const key = isPlayer ? (PROFILES[st.body] ? st.body : 'coupe') : 'sedan';
    parts = bodyParts(key);
    p = parts.p;
    addMesh(body, parts.shell, bodyMat);
    addMesh(body, parts.glass, glassMat(isPlayer ? st.tint : null), { shadow: false });
    addMesh(body, parts.frame, kind === 'police' ? paint(0xf2f2f2) : bodyMat);
    addMesh(body, parts.trim, trim());
    addMesh(body, parts.wells, mat('well', () => new THREE.MeshLambertMaterial({ color: 0x08080a, side: THREE.DoubleSide })), { shadow: false });
    addMesh(body, parts.plates, plate(), { shadow: false });
    addMesh(body, parts.exhaust, chrome(), { shadow: false });
    addMesh(body, parts.mirrors, kind === 'police' ? paint(0xf2f2f2) : bodyMat);
    addMesh(body, parts.mirrorGlass, chrome(), { shadow: false });

    if (kind === 'police') {
      // Black and white: white doors, a push bar on the front, a gold star on the doors
      const doors = geo('policeDoors', () => {
        const hw = p.width / 2 + 0.05;
        const list = [];
        for (const sx of [-1, 1]) list.push(box(0.012, 0.46, 1.75, sx * (hw - 0.046), 0.72, -0.25));
        return merge(list);
      });
      addMesh(body, doors, paint(0xf2f2f2), { shadow: false });
      const star = geo('policeStar', () => merge([-1, 1].map((sx) => { const s = new THREE.CylinderGeometry(0.11, 0.11, 0.01, 5); s.rotateZ(PI / 2); s.translate(sx * (p.width / 2 + 0.012), 0.74, -0.2); return s; })));
      addMesh(body, star, mat('gold', () => new THREE.MeshBasicMaterial({ color: 0xd8a830 })), { shadow: false });
      const push = geo('pushBar', () => merge([box(1.2, 0.08, 0.08, 0, 0.62, parts.noseZ + 0.14), box(1.0, 0.08, 0.08, 0, 0.42, parts.noseZ + 0.14),
        box(0.08, 0.32, 0.08, -0.45, 0.52, parts.noseZ + 0.14), box(0.08, 0.32, 0.08, 0.45, 0.52, parts.noseZ + 0.14)]));
      addMesh(body, push, trim());
    }
    if (kind === 'taxi') {
      // A checker band along the sides and the TAXI sign on the roof
      const check = geo('taxiCheck', () => {
        const list = [];
        for (const sx of [-1, 1]) for (let i = 0; i < 14; i++) list.push(box(0.012, 0.06, 0.12, sx * (p.width / 2 + 0.005), 0.9 + (i % 2) * 0.06, -1.3 + i * 0.2));
        return merge(list);
      });
      addMesh(body, check, trim(), { shadow: false });
      const sign = new THREE.Mesh(geo('taxiSign', () => box(0.7, 0.2, 0.28, 0, p.cabin[1][1] + 0.16, -0.45)), mat('taxiSign', () => new THREE.MeshBasicMaterial({ color: 0xfff2a0, toneMapped: false })));
      body.add(sign);
    }
    if (isPlayer) {
      if (st.stripe != null) addMesh(body, stripeGeo(key), lambert(st.stripe), { shadow: false });
      if (st.spoiler) {
        const wing = geo(`spoiler:${key}`, () => {
          const z = p.spoiler?.z ?? -1.95, y = p.spoiler?.y ?? p.top[3][1] + BEVEL;
          const blade = new THREE.Shape();
          blade.moveTo(0.2, 0); blade.quadraticCurveTo(0.05, 0.06, -0.2, 0.03); blade.lineTo(-0.2, -0.01); blade.quadraticCurveTo(0.05, 0.01, 0.2, 0);
          const b = new THREE.ExtrudeGeometry(blade, { depth: 1.8, bevelEnabled: false, curveSegments: 6 });
          b.translate(0, 0, -0.9);
          b.rotateY(-PI / 2);
          b.translate(0, y + 0.32, z);
          b.deleteAttribute('uv');
          const list = [b];
          for (const sx of [-1, 1]) {
            list.push(box(0.04, 0.32, 0.12, sx * 0.62, y + 0.16, z));          // struts
            list.push(box(0.03, 0.14, 0.44, sx * 0.91, y + 0.33, z - 0.02)); // end plates
          }
          return merge(list);
        });
        addMesh(body, wing, lambert(st.stripe ?? 0x151515));
      }
    }
  }
  addMesh(body, parts.head, headMat, { shadow: false });
  const tail = addMesh(body, parts.tail, tailMat, { shadow: false });
  void tail;

  // Fake headlight beams on the road (additive glow, no real light needed)
  const beamGeo = geo('beam', () => {
    const pl = new THREE.PlaneGeometry(4.5, 12);
    pl.rotateX(-PI / 2);
    pl.translate(0, 0.06, 8.5);
    return pl;
  });
  const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({
    map: getGlowTexture(), color: 0xfff0c0, transparent: true, opacity: 0.35,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  beam.material.userData.nightGlow = true;
  beam.position.z = kind === 'bus' ? 3.3 : kind === 'truck' ? 1.9 : 0; // (from the front of the long ones)
  g.add(beam);
  addHeadlightBeams(g, isVan ? 'van' : HEADLIGHTS[kind] ? kind : isPlayer ? (HEADLIGHTS[st.body] ? st.body : 'coupe') : 'sedan');

  // Police light bar
  let sirens = null;
  if (kind === 'police') {
    const red = new THREE.MeshBasicMaterial({ color: 0xff2233, toneMapped: false });
    const blue = new THREE.MeshBasicMaterial({ color: 0x2266ff, toneMapped: false });
    const y = p.cabin[1][1] + 0.12, z = (p.cabin[1][0] + p.cabin[2][0]) / 2;
    const base = new THREE.Mesh(geo('sirenBase', () => box(1.3, 0.06, 0.32, 0, y - 0.06, z)), trim());
    body.add(base);
    const r = new THREE.Mesh(geo('sirenL', () => box(0.58, 0.14, 0.28, -0.32, y + 0.03, z)), red);
    const b = new THREE.Mesh(geo('sirenR', () => box(0.58, 0.14, 0.28, 0.32, y + 0.03, z)), blue);
    body.add(r, b);
    // Big soft glows so the lights read from far away
    const glowR = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0xff2030, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    const glowB = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0x2060ff, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    glowR.position.set(-0.4, y + 0.15, z);
    glowB.position.set(0.4, y + 0.15, z);
    glowR.scale.setScalar(4);
    glowB.scale.setScalar(4);
    body.add(glowR, glowB);
    sirens = { r, b, glowR, glowB, red, blue };
  }

  // Wheels (spin with speed; the front ones steer). Left wheels are mirrored
  // so the rims face outwards on both sides.
  const wheels = [];
  const steer = [];
  const rimHex = st.rims ?? 0x777777;
  const wg = wheelGeo(isPlayer || kind === 'police');
  const rimMat = isPlayer ? addReflections(new THREE.MeshPhongMaterial({ color: rimHex, specular: 0xcccccc, shininess: 90 }), 0.45) : null;
  for (const [x, z] of [[-p.wheelX, -p.wheelZ], [p.wheelX, -p.wheelZ], [-p.wheelX, p.wheelZ], [p.wheelX, p.wheelZ]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, WHEEL_R, z);
    const w = new THREE.Group();
    if (x < 0) w.scale.x = -1;
    if (isPlayer) {
      const tyreMesh = new THREE.Mesh(wg.tyre, mat('tyre', () => new THREE.MeshLambertMaterial({ color: 0x141414 })));
      tyreMesh.castShadow = true;
      w.add(tyreMesh, new THREE.Mesh(wg.rim, rimMat));
    } else {
      const m = new THREE.Mesh(wg.solid, mat('wheelVC', () => new THREE.MeshLambertMaterial({ vertexColors: true })));
      m.castShadow = true;
      w.add(m);
    }
    pivot.add(w);
    g.add(pivot);
    wheels.push(w);
    if (z > 0) steer.push(pivot);
  }

  // Underglow (the player's car)
  let underglow = null;
  if (isPlayer && st.glow != null) underglow = addUnderglow(g, st.glow, p);

  // Nitro flames (only visible while boosting)
  let flames = null;
  if (isPlayer) {
    flames = new THREE.Group();
    for (const s of [-0.55, 0.55]) {
      const f = new THREE.Mesh(geo('flame', () => {
        const c = new THREE.ConeGeometry(0.16, 1.2, 8);
        c.rotateX(-PI / 2);
        c.translate(0, 0, -0.6);
        return c;
      }), makeGlowMaterial(0x40b0ff, 0.85));
      f.position.set(s, 0.42, parts.rearZ - 0.05);
      flames.add(f);
    }
    flames.visible = false;
    g.add(flames);
  }

  // Performance: merge the static body pieces that share a material.
  const keep = new Set([tailMat, sirens?.red, sirens?.blue].filter(Boolean));
  mergeStatic(body, keep);

  g.userData = { wheels, steer, sirens, flames, body, beam, tailMat, underglow, paint: isPlayer ? bodyMat : null };
  return g;
}

/** Merge the plain Mesh children of `group` by material (except `keep`). */
function mergeStatic(group, keep) {
  const byMat = new Map();
  for (const child of [...group.children]) {
    if (!child.isMesh || keep.has(child.material)) continue;
    child.updateMatrix();
    let gg = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
    if (gg.attributes.uv) gg.deleteAttribute('uv');
    gg = gg.applyMatrix4(child.matrix);
    if (!byMat.has(child.material)) byMat.set(child.material, { geos: [], shadow: false });
    const e = byMat.get(child.material);
    e.geos.push(gg);
    e.shadow ||= child.castShadow;
    group.remove(child);
  }
  for (const [m, { geos, shadow }] of byMat) {
    const merged = mergeGeometries(geos, false);
    geos.forEach((x) => x.dispose());
    const mesh = new THREE.Mesh(merged, m);
    mesh.castShadow = shadow;
    mesh.renderOrder = m.depthTest === false ? 10 : 0;
    group.add(mesh);
  }
}

/** Flash police lights. Call every frame with the running time. */
export function updateSirens(mesh, time, on = true) {
  const s = mesh.userData.sirens;
  if (!s) return;
  const phase = Math.floor(time * 6) % 2 === 0;
  s.glowR.visible = on && phase;
  s.glowB.visible = on && !phase;
  s.red.color.setHex(on && phase ? 0xff2233 : 0x330008);
  s.blue.color.setHex(on && !phase ? 0x2266ff : 0x000833);
}

/** Underglow: a gentle shimmer, and it fades when the car leaves the ground. */
export function updateUnderglow(mesh, time, airborne = false) {
  const u = mesh.userData.underglow;
  if (!u) return;
  const target = airborne ? 0.12 : 0.72 + Math.sin(time * 3.1) * 0.05 + Math.sin(time * 7.3) * 0.025;
  u.pool.material.opacity += (target - u.pool.material.opacity) * 0.2;
}

export const CIVILIAN_COLORS = [0x8a1c1c, 0x1f3f8a, 0xd8d4cc, 0x2e2e33, 0x5a6a3a, 0x9a9a9a, 0x6b2f4a, 0x2f6b6b];

// ---------------------------------------------------------------- snowmobile
/**
 * A snowmobile (Frostvale): a sled body with a windscreen and handlebars, a
 * rubber track at the back, two skis at the front that steer, and you riding
 * it (in your own look). Same userData as a car, so the driving code doesn't
 * care which one you're on.
 * @param {{color:number, style?:object, look?:object}} opts
 */
/**
 * A motorbike with its rider: your Street Bike, or a police bike (police: true).
 * The bike leans into corners (userData.lean, set by Car.syncMesh). parked:
 * nobody on it.
 */
export function makeBikeMesh({ color = 0xff9f1a, style = null, police = false, parked = false } = {}) {
  const st = style || { stripe: 0x151515, rims: 0x777777 };
  const g = new THREE.Group();
  const lean = new THREE.Group(); // tips over in the corners
  g.add(lean);
  const body = new THREE.Group();
  lean.add(body);
  const paintC = police ? 0xf2f2f2 : color;
  const bodyMat = police ? paint(paintC) : paintMat(paintC);
  const dark = trim();
  const parts = geo('bike', () => {
    const tank = new THREE.CapsuleGeometry(0.2, 0.42, 4, 10); tank.rotateX(PI / 2); tank.scale(1, 0.85, 1); tank.translate(0, 0.98, 0.18);
    const tail = merge([box(0.3, 0.14, 0.5, 0, 0.98, -0.62, 0.18, 0, 0), box(0.22, 0.1, 0.2, 0, 1.0, -0.92, 0.3, 0, 0)]);
    const fairing = merge([box(0.42, 0.42, 0.18, 0, 1.0, 0.72, -0.5, 0, 0), box(0.5, 0.12, 0.5, 0, 0.62, 0.05)]); // nose and belly pan
    const frame = merge([box(0.12, 0.12, 1.0, 0, 0.66, -0.2, 0.35, 0, 0), box(0.1, 0.5, 0.1, 0, 0.62, 0.48, -0.35, 0, 0), box(0.34, 0.3, 0.42, 0, 0.55, -0.05)]); // spine, head tube, engine
    const seat = box(0.28, 0.08, 0.62, 0, 1.06, -0.32, 0.08, 0, 0);
    const pipe = new THREE.CylinderGeometry(0.06, 0.08, 0.7, 8); pipe.rotateX(PI / 2 - 0.25); pipe.translate(0.2, 0.62, -0.6);
    const head = box(0.2, 0.12, 0.05, 0, 0.98, 0.84, -0.4, 0, 0);
    const tailL = box(0.18, 0.06, 0.04, 0, 0.98, -1.03);
    const stripe = merge([-1, 1].map((sx) => box(0.012, 0.06, 0.4, sx * 0.205, 1.0, 0.18)));
    // Front: fork, mudguard and handlebars (they turn with the steering)
    const fork = merge([-1, 1].map((sx) => box(0.05, 0.62, 0.05, sx * 0.1, 0.62, 0.02, -0.35, 0, 0)));
    const bars = merge([box(0.62, 0.04, 0.04, 0, 1.1, -0.08), box(0.05, 0.22, 0.05, 0, 1.0, -0.04)]);
    const guard = box(0.16, 0.04, 0.42, 0, 0.72, 0.02);
    // A wheel: a fat tyre round a disc
    const tyre = new THREE.TorusGeometry(0.28, 0.08, 8, 22); tyre.rotateY(PI / 2);
    const rim = merge([new THREE.CylinderGeometry(0.2, 0.2, 0.05, 16).rotateZ(PI / 2), ...[0, 1, 2].map((i) => box(0.04, 0.42, 0.05, 0, 0, 0, i * PI / 3, 0, 0))]);
    return { tank, tail, fairing, frame, seat, pipe, head, tailL, stripe, fork, bars, guard, tyre, rim };
  });
  addMesh(body, parts.tank, bodyMat);
  addMesh(body, parts.tail, bodyMat);
  addMesh(body, parts.fairing, bodyMat);
  addMesh(body, parts.frame, dark);
  addMesh(body, parts.seat, mat('bikeSeat', () => new THREE.MeshLambertMaterial({ color: 0x141416 })));
  addMesh(body, parts.pipe, chrome());
  addMesh(body, parts.stripe, police ? paint(0x1d3566) : lambert(st.stripe ?? 0x151515), { shadow: false });
  const headMat = mat('head', () => new THREE.MeshBasicMaterial({ color: 0xfff1c4, toneMapped: false }));
  const tailMat = new THREE.MeshBasicMaterial({ color: 0x881018, toneMapped: false });
  addMesh(body, parts.head, headMat, { shadow: false });
  addMesh(body, parts.tailL, tailMat, { shadow: false });

  // Wheels and the steering front end
  const wheels = [], steer = [];
  const rimMat = police ? chrome() : lambert(st.rims ?? 0x777777);
  const wheel = (parent, z) => {
    const w = new THREE.Group();
    w.position.set(0, 0.36, z);
    const t = new THREE.Mesh(parts.tyre, mat('bikeTyre', () => new THREE.MeshLambertMaterial({ color: 0x141416 })));
    const r = new THREE.Mesh(parts.rim, rimMat);
    t.castShadow = true;
    w.add(t, r);
    parent.add(w);
    wheels.push(w);
  };
  wheel(lean, -0.72);
  const front = new THREE.Group();
  front.position.set(0, 0, 0.74);
  front.add(new THREE.Mesh(parts.fork, dark), new THREE.Mesh(parts.bars, dark), new THREE.Mesh(parts.guard, bodyMat));
  wheel(front, 0);
  lean.add(front);
  steer.push(front);

  // Police: red and blue lights on the back
  let sirens = null;
  if (police) {
    const red = new THREE.MeshBasicMaterial({ color: 0xff2233, toneMapped: false });
    const blue = new THREE.MeshBasicMaterial({ color: 0x2266ff, toneMapped: false });
    const r = new THREE.Mesh(geo('bikeSirenL', () => box(0.1, 0.12, 0.1, -0.16, 1.2, -0.85)), red);
    const b = new THREE.Mesh(geo('bikeSirenR', () => box(0.1, 0.12, 0.1, 0.16, 1.2, -0.85)), blue);
    body.add(r, b);
    const glowR = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0xff2030, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    const glowB = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0x2060ff, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    glowR.position.set(-0.2, 1.25, -0.85);
    glowB.position.set(0.2, 1.25, -0.85);
    glowR.scale.setScalar(2.6);
    glowB.scale.setScalar(2.6);
    body.add(glowR, glowB);
    sirens = { r, b, glowR, glowB, red, blue };
  }

  // The rider: crouched over the tank, hands on the bars
  let rider = null;
  if (!parked) {
    rider = new PlayerModel(police ? POLICE_LOOK : undefined);
    if (!police) rider.setLook(currentLook(save.data.settings));
    const p = rider.pose;
    p.hipL = p.hipR = -1.25; p.kneeL = p.kneeR = 1.85;
    p.shL = p.shR = -1.25; p.elL = p.elR = -0.45; p.shLz = -0.18; p.shRz = 0.18;
    p.lean = 0.55; p.headPitch = -0.35;
    rider._apply({ state: 'ground', gliding: false });
    rider.root.position.set(0, 0.32, -0.42);
    lean.add(rider.root);
  }

  // Headlight on the road, nitro flame from the exhaust
  const beam = new THREE.Mesh(geo('bikeBeam', () => { const pl = new THREE.PlaneGeometry(3.5, 11); pl.rotateX(-PI / 2); pl.translate(0, 0.06, 7.5); return pl; }),
    new THREE.MeshBasicMaterial({ map: getGlowTexture(), color: 0xfff0c0, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  beam.material.userData.nightGlow = true;
  g.add(beam);
  addHeadlightBeams(lean, 'bike');
  const flames = new THREE.Group();
  const fl = new THREE.Mesh(geo('flame', () => { const c = new THREE.ConeGeometry(0.16, 1.2, 8); c.rotateX(-PI / 2); c.translate(0, 0, -0.6); return c; }), makeGlowMaterial(0x40b0ff, 0.85));
  fl.position.set(0.2, 0.55, -0.92);
  flames.add(fl);
  flames.visible = false;
  lean.add(flames);

  mergeStatic(body, new Set([tailMat, sirens?.red, sirens?.blue].filter(Boolean)));
  g.userData = { wheels, steer, sirens, flames, body, beam, tailMat, underglow: null, paint: police ? null : bodyMat, rider, lean, bike: true };
  return g;
}

/**
 * The Dirt Bike: tall and light, knobbly tyres, high mudguards, long forks
 * and a race number on the front. Same rig as the Street Bike (it leans into
 * corners and the front turns), plus a `wheelie` group that the driving state
 * tips up round the back axle (userData.wheelie.pivot) when you hold Space.
 */
export function makeDirtBikeMesh({ color = 0xff6a1a, style = null, parked = false } = {}) {
  const st = style || { stripe: 0x151515, rims: 0x777777 };
  const g = new THREE.Group();
  const lean = new THREE.Group();
  g.add(lean);
  const wheelie = new THREE.Group();
  lean.add(wheelie);
  const body = new THREE.Group();
  wheelie.add(body);
  const bodyMat = paintMat(color);
  const dark = trim();
  const R = 0.36; // wheel radius (bigger than the Street Bike's)
  const parts = geo('dirtbike', () => {
    const tank = box(0.3, 0.2, 0.5, 0, 1.08, 0.2, -0.12, 0, 0);
    const side = merge([-1, 1].map((sx) => box(0.03, 0.22, 0.42, sx * 0.17, 0.9, -0.3, 0.1, 0, 0)));     // number boards on the sides
    const seat = box(0.24, 0.08, 0.9, 0, 1.16, -0.32, 0.06, 0, 0);
    const rearGuard = box(0.2, 0.04, 0.6, 0, 1.08, -0.92, -0.35, 0, 0);
    const frame = merge([box(0.08, 0.08, 0.95, 0, 0.82, -0.2, 0.3, 0, 0), box(0.08, 0.62, 0.08, 0, 0.74, 0.46, -0.35, 0, 0), box(0.28, 0.32, 0.36, 0, 0.6, -0.04)]); // spine, head tube, engine
    const swing = merge([-1, 1].map((sx) => box(0.05, 0.06, 0.72, sx * 0.1, 0.5, -0.42, -0.12, 0, 0)));
    const shock = box(0.07, 0.48, 0.07, 0, 0.78, -0.42, -0.5, 0, 0);
    const pipe = new THREE.CylinderGeometry(0.045, 0.07, 0.75, 8); pipe.rotateX(PI / 2 - 0.35); pipe.translate(0.18, 0.86, -0.62);
    const head = box(0.16, 0.1, 0.05, 0, 1.12, 0.88, -0.3, 0, 0);
    const tailL = box(0.12, 0.05, 0.04, 0, 1.05, -1.2);
    const stripe = merge([-1, 1].map((sx) => box(0.012, 0.05, 0.44, sx * 0.155, 1.1, 0.2, -0.12, 0, 0)));
    // Front: long forks, a high mudguard, wide bars and the number plate
    const fork = merge([-1, 1].map((sx) => box(0.055, 0.9, 0.055, sx * 0.1, 0.78, 0.0, -0.32, 0, 0)));
    const bars = merge([box(0.78, 0.04, 0.04, 0, 1.28, -0.12), box(0.05, 0.22, 0.05, 0, 1.18, -0.08)]);
    const guard = box(0.18, 0.04, 0.55, 0, 0.88, 0.06, 0.12, 0, 0);
    const plate = box(0.3, 0.26, 0.03, 0, 1.06, 0.2, -0.32, 0, 0);
    // A knobbly tyre: a tyre round a spoked rim, with blocks all round the tread
    const tyre = new THREE.TorusGeometry(R - 0.06, 0.085, 8, 24); tyre.rotateY(PI / 2);
    const knobs = merge(Array.from({ length: 18 }, (_, i) => { const a = (i / 18) * PI * 2; return box(0.15, 0.05, 0.06, 0, Math.cos(a) * (R + 0.01), Math.sin(a) * (R + 0.01), -a, 0, 0); }));
    const rim = merge([new THREE.CylinderGeometry(R - 0.12, R - 0.12, 0.04, 16, 1, true).rotateZ(PI / 2), ...[0, 1, 2, 3].map((i) => box(0.02, (R - 0.12) * 2, 0.02, 0, 0, 0, i * PI / 4, 0, 0))]);
    return { tank, side, seat, rearGuard, frame, swing, shock, pipe, head, tailL, stripe, fork, bars, guard, plate, tyre, knobs, rim };
  });
  addMesh(body, parts.tank, bodyMat);
  addMesh(body, parts.side, lambert(0xf0f0e8));
  addMesh(body, parts.rearGuard, bodyMat);
  addMesh(body, parts.frame, dark);
  addMesh(body, parts.swing, chrome());
  addMesh(body, parts.shock, mat('dirtShock', () => new THREE.MeshLambertMaterial({ color: 0xffc020 })));
  addMesh(body, parts.seat, mat('bikeSeat', () => new THREE.MeshLambertMaterial({ color: 0x141416 })));
  addMesh(body, parts.pipe, chrome());
  addMesh(body, parts.stripe, lambert(st.stripe ?? 0x151515), { shadow: false });
  const headMat = mat('head', () => new THREE.MeshBasicMaterial({ color: 0xfff1c4, toneMapped: false }));
  const tailMat = new THREE.MeshBasicMaterial({ color: 0x881018, toneMapped: false });
  addMesh(body, parts.head, headMat, { shadow: false });
  addMesh(body, parts.tailL, tailMat, { shadow: false });

  // Wheels and the steering front end
  const wheels = [], steer = [];
  const tyreMat = mat('bikeTyre', () => new THREE.MeshLambertMaterial({ color: 0x141416 }));
  const rimMat = lambert(st.rims ?? 0x777777);
  const wheel = (parent, z) => {
    const w = new THREE.Group();
    w.position.set(0, R, z);
    const t = new THREE.Mesh(parts.tyre, tyreMat), k = new THREE.Mesh(parts.knobs, tyreMat), r = new THREE.Mesh(parts.rim, rimMat);
    t.castShadow = true;
    w.add(t, k, r);
    parent.add(w);
    wheels.push(w);
  };
  wheel(wheelie, -0.72);
  const front = new THREE.Group();
  front.position.set(0, 0, 0.76);
  front.add(new THREE.Mesh(parts.fork, chrome()), new THREE.Mesh(parts.bars, dark), new THREE.Mesh(parts.guard, bodyMat), new THREE.Mesh(parts.plate, lambert(0xf0f0e8)));
  // the race number on the front plate
  const num = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.18), new THREE.MeshBasicMaterial({ map: numberTexture('13'), transparent: true }));
  num.position.set(0, 1.07, 0.222);
  num.rotation.x = -0.32;
  front.add(num);
  wheel(front, 0);
  wheelie.add(front);
  steer.push(front);

  // The rider: up on the pegs, elbows out (dirt bike style)
  let rider = null;
  if (!parked) {
    rider = new PlayerModel();
    rider.setLook(currentLook(save.data.settings));
    const p = rider.pose;
    p.hipL = p.hipR = -0.85; p.kneeL = p.kneeR = 1.3;
    p.shL = p.shR = -1.1; p.elL = p.elR = -0.55; p.shLz = -0.35; p.shRz = 0.35;
    p.lean = 0.42; p.headPitch = -0.25;
    rider._apply({ state: 'ground', gliding: false });
    rider.root.position.set(0, 0.36, -0.36);
    wheelie.add(rider.root);
  }

  // Headlight on the road, a nitro flame (the Dirt Bike doesn't use nitro, but the flame keeps the shared code simple)
  const beam = new THREE.Mesh(geo('bikeBeam', () => { const pl = new THREE.PlaneGeometry(3.5, 11); pl.rotateX(-PI / 2); pl.translate(0, 0.06, 7.5); return pl; }),
    new THREE.MeshBasicMaterial({ map: getGlowTexture(), color: 0xfff0c0, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  beam.material.userData.nightGlow = true;
  g.add(beam);
  addHeadlightBeams(wheelie, 'dirt');
  const flames = new THREE.Group();
  flames.visible = false;
  wheelie.add(flames);

  mergeStatic(body, new Set([tailMat]));
  g.userData = { wheels, steer, sirens: null, flames, body, beam, tailMat, underglow: null, paint: bodyMat, rider, lean, bike: true,
    wheelie: { group: wheelie, pivot: new THREE.Vector3(0, R, -0.72) } };
  return g;
}

/** A race number, black on white. */
function numberTexture(text) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#111'; x.font = 'bold 50px "Bebas Neue", Impact, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, 32, 36);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makeSnowmobileMesh({ color = 0xff9f1a, style = null, look = null } = {}) {
  const st = style || { stripe: 0x151515, rims: 0x777777, glow: null };
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const bodyMat = paintMat(color);
  const dark = trim();
  // Sled body: a side profile extruded across, rounded edges
  const parts = geo('sled', () => {
    const prof = new THREE.Shape();
    const pts = [[-1.25, 0.32], [-1.3, 0.62], [-0.15, 0.7], [0.3, 0.86], [0.95, 0.82], [1.45, 0.48], [1.32, 0.3]];
    prof.moveTo(pts[0][0], pts[0][1]);
    for (const [z, y] of pts.slice(1)) prof.lineTo(z, y);
    prof.lineTo(pts[0][0], pts[0][1]);
    const shell = extrudeAcross(prof, 1.05, 0.08, 2);
    const seat = new THREE.CapsuleGeometry(0.24, 0.95, 3, 8); seat.rotateX(PI / 2); seat.scale(1.05, 0.55, 1); seat.translate(0, 0.86, -0.6);
    const track = merge([box(0.72, 0.36, 1.75, 0, 0.24, -0.55), ...Array.from({ length: 9 }, (_, i) => box(0.74, 0.05, 0.06, 0, 0.06, -1.35 + i * 0.2))]);
    const bars = merge([box(0.9, 0.05, 0.05, 0, 1.12, 0.2), box(0.05, 0.3, 0.05, 0, 0.98, 0.28),
      ...[-1, 1].map((sx) => box(0.08, 0.08, 0.14, sx * 0.45, 1.12, 0.2))]);
    const struts = merge([-1, 1].flatMap((sx) => [box(0.06, 0.35, 0.06, sx * 0.52, 0.32, 0.95, 0.3, 0, 0), box(0.4, 0.05, 0.06, sx * 0.35, 0.42, 0.95)]));
    const shield = new THREE.PlaneGeometry(0.9, 0.42); shield.rotateX(-0.75); shield.translate(0, 1.05, 0.55);
    const stripe = merge([-1, 1].map((sx) => box(0.012, 0.08, 1.6, sx * 0.535, 0.62, 0.2)));
    const lights = box(0.5, 0.1, 0.05, 0, 0.62, 1.44, 0.6, 0, 0);
    const tail = box(0.5, 0.08, 0.04, 0, 0.58, -1.33);
    return { shell, seat, track, bars, struts, shield, stripe, lights, tail };
  });
  addMesh(body, parts.shell, bodyMat);
  addMesh(body, parts.seat, dark);
  addMesh(body, parts.track, mat('track', () => new THREE.MeshLambertMaterial({ color: 0x1a1a1c })));
  addMesh(body, parts.bars, chrome());
  addMesh(body, parts.struts, dark);
  addMesh(body, parts.stripe, lambert(st.stripe ?? 0x151515), { shadow: false });
  const shield = new THREE.Mesh(parts.shield, mat('shield', () => addReflections(new THREE.MeshPhongMaterial({ color: 0x2a3a50, specular: 0xaabbcc, shininess: 100, transparent: true, opacity: 0.55, side: THREE.DoubleSide }), 0.4)));
  body.add(shield);
  const headMat = mat('head', () => new THREE.MeshBasicMaterial({ color: 0xfff1c4, toneMapped: false }));
  const tailMat = new THREE.MeshBasicMaterial({ color: 0x881018, toneMapped: false });
  addMesh(body, parts.lights, headMat, { shadow: false });
  addMesh(body, parts.tail, tailMat, { shadow: false });

  // Skis (steer with the handlebars)
  const steer = [];
  const skiGeo = geo('ski', () => merge([box(0.2, 0.05, 1.5, 0, 0.03, 0), box(0.2, 0.05, 0.3, 0, 0.1, 0.82, -0.6, 0, 0)]));
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.52, 0, 0.95);
    const ski = new THREE.Mesh(skiGeo, dark);
    ski.castShadow = true;
    pivot.add(ski);
    g.add(pivot);
    steer.push(pivot);
  }
  // Track wheels (spin with speed; you see them through the gaps)
  const wheels = [];
  const wGeo = geo('trackWheel', () => { const c = new THREE.CylinderGeometry(0.16, 0.16, 0.76, 10); c.rotateZ(PI / 2); return c; });
  for (const z of [-1.2, -0.55, 0.1]) {
    const w = new THREE.Mesh(wGeo, chrome());
    w.position.set(0, 0.2, z);
    g.add(w);
    wheels.push(w);
  }

  // You, riding it: sitting on the seat, hands on the bars
  const rider = new PlayerModel();
  if (look) rider.setLook(look);
  const p = rider.pose;
  p.hipL = p.hipR = -1.35; p.kneeL = p.kneeR = 1.5;
  p.shL = p.shR = -1.05; p.elL = p.elR = -0.35; p.shLz = -0.3; p.shRz = 0.3;
  p.lean = 0.25;
  rider._apply({ state: 'ground', gliding: false });
  rider.root.position.set(0, 0.08, -0.62);
  body.add(rider.root);

  // Headlight beam on the snow, nitro flames, underglow
  const beam = new THREE.Mesh(geo('beam', () => { const pl = new THREE.PlaneGeometry(4.5, 12); pl.rotateX(-PI / 2); pl.translate(0, 0.06, 8.5); return pl; }),
    new THREE.MeshBasicMaterial({ map: getGlowTexture(), color: 0xfff0c0, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  beam.material.userData.nightGlow = true;
  g.add(beam);
  addHeadlightBeams(g, 'sled');
  const flames = new THREE.Group();
  const f = new THREE.Mesh(geo('flame', () => { const c = new THREE.ConeGeometry(0.16, 1.2, 8); c.rotateX(-PI / 2); c.translate(0, 0, -0.6); return c; }), makeGlowMaterial(0x40b0ff, 0.85));
  f.position.set(0, 0.5, -1.35);
  flames.add(f);
  flames.visible = false;
  g.add(flames);
  let underglow = null;
  if (st.glow != null) underglow = addUnderglow(g, st.glow, { wheelZ: 1.0, arch: 0.25 });

  mergeStatic(body, new Set([tailMat, shield.material]));
  g.userData = { wheels, steer, sirens: null, flames, body, beam, tailMat, underglow, paint: bodyMat, rider };
  return g;
}

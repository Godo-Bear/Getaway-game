import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// The shapes that make up a person (see playerModel.js for the rig).
//
// Every joint of the rig carries ONE mesh: all the little pieces on it (the
// sleeve, the cuff, the glove, the thumb...) are merged into a single
// geometry, and each vertex remembers which "slot" it belongs to (top,
// trousers, skin, hair, hat...). The model then colours the vertices from its
// own colours, so one geometry can be shared by everyone with the same style
// and recolouring someone (a disguise) is just rewriting the colours. That
// keeps a whole crowd cheap to draw on phones.
//
// Sizes are in metres. The model faces +Z; +Y is up.

export const SLOTS = [
  'hoodie', 'accent', 'shirt', 'tie', 'trousers', 'shoes', 'sole', 'skin', 'mask', 'gloves',
  'hair', 'stubble', 'hat', 'hatBand', 'metal', 'gold', 'belt', 'eyeWhite', 'pupil', 'mouth',
  'lens', 'bag', 'strap', 'cash', 'patch', 'cover',
];
const SLOT = Object.fromEntries(SLOTS.map((s, i) => [s, i]));

const { PI } = Math;
const WZ = 0.62; // how deep the body is compared to how wide

// ---------------------------------------------------------------- shapes
const SPH = new THREE.SphereGeometry(1, 10, 7);
const SPH_LO = new THREE.SphereGeometry(1, 7, 5);
const BOX = new THREE.BoxGeometry(1, 1, 1);
const cyl = (rt, rb, h, seg = 12, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
const band = (r, h, seg = 14) => new THREE.CylinderGeometry(r, r, h, seg, 1, true);
const cap = (r, len, seg = 8) => new THREE.CapsuleGeometry(r, len, 3, seg);
/** A cube with rounded corners and edges (a sphere pushed out towards a cube), 2 x 2 x 2. */
const ROUNDED = (() => {
  const g = new THREE.SphereGeometry(1, 8, 6);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const m = Math.max(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)) || 1;
    v.lerp(v.clone().divideScalar(m), 0.72);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
})();
/** A rounded box w x h x d (r is just a hint: the corners scale with the box). */
const rbox = (w, h, d) => ROUNDED.clone().scale(w / 2, h / 2, d / 2);
/** The top part of a sphere (hair, hats). theta = how far down it comes, from the top. */
const dome = (theta, seg = 16) => new THREE.SphereGeometry(1, seg, 10, 0, PI * 2, 0, theta);
/** Half a disc, sticking out in front (a cap's brim). */
const brim = (r, h) => new THREE.CylinderGeometry(r, r, h, 14, 1, false, -PI / 2, PI);

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
function matrix(p = [0, 0, 0], r = [0, 0, 0], s = 1) {
  const sc = typeof s === 'number' ? [s, s, s] : s;
  const rr = typeof r === 'number' ? [0, 0, 0] : r; // (0 = no rotation)
  return new THREE.Matrix4().compose(_p.set(p[0], p[1], p[2]), _q.setFromEuler(_e.set(rr[0], rr[1], rr[2])), _s.set(sc[0], sc[1], sc[2]));
}

/** Collects pieces (each with a slot) and merges them into one geometry. */
class Part {
  constructor() { this.geos = []; this.slots = []; this.frame = null; }
  /** Place a piece. p = position, r = rotation (radians), s = scale (a number or [x, y, z]). */
  add(geo, slot, p, r, s) {
    const g = geo.clone();
    g.deleteAttribute('uv');
    if (g.attributes.uv1) g.deleteAttribute('uv1');
    _m.copy(matrix(p, r, s));
    if (this.frame) _m.premultiply(this.frame);
    g.applyMatrix4(_m);
    this.geos.push(g);
    this.slots.push([SLOT[slot], g.attributes.position.count]);
    return this;
  }
  /** Add the pieces placed inside fn() relative to a frame (e.g. a tilted hat). */
  inFrame(p, r, s, fn) {
    const prev = this.frame;
    this.frame = prev ? prev.clone().multiply(matrix(p, r, s)) : matrix(p, r, s);
    fn();
    this.frame = prev;
    return this;
  }
  build() {
    const geo = mergeGeometries(this.geos);
    const slots = new Uint8Array(geo.attributes.position.count);
    let i = 0;
    for (const [slot, n] of this.slots) { slots.fill(slot, i, i + n); i += n; }
    for (const g of this.geos) g.dispose();
    geo.computeBoundingSphere();
    return { geo, slots };
  }
}

// ---------------------------------------------------------------- the body
// Rig sizes (playerModel.js uses the same numbers for its joints)
export const RIG = {
  hipY: 0.95, hipX: 0.13, thigh: 0.46, shin: 0.44,
  shoulderX: 0.32, shoulderY: 0.6, upperArm: 0.32, foreArm: 0.3,
  headY: 0.69,
};

/** Chest radius at height y on the torso (it widens up to the shoulders). */
const chestR = (y, b) => (y < 0.32 ? 0.19 : 0.185 + ((y - 0.32) / 0.3) * 0.06) * b;
/** How far forward the front of the torso is at height y. */
const frontZ = (y, b, puff = 0) => (chestR(y, b) + puff) * WZ;

const heavyTop = (top) => top === 'ski' || top === 'trench';
const sleeveCuff = (top) => top === 'hoodie' || top === 'sweater' || top === 'ski' || top === 'jacket' || top === 'leather' || top === 'tracksuit' || top === 'trench';
/** Tops with short sleeves (bare forearms). vest: no sleeves at all. */
const shortSleeve = (top) => top === 'tee' || top === 'hawaiian';
const bareArms = (top) => shortSleeve(top) || top === 'vest';
/** Face coverings: the whole face is hidden (counts as a mask). */
export const MASK_FACES = ['mask', 'hockey', 'bandana'];

/** Hips: the top of the trousers (stays upright while the torso leans). */
function buildHips({ b }) {
  const P = new Part();
  P.add(SPH, 'trousers', [0, -0.03, 0], 0, [0.2 * b, 0.13, 0.135]);
  P.add(cyl(0.19 * b, 0.2 * b, 0.13), 'trousers', [0, 0.0, 0], 0, [1, 1, 0.68]);
  return P.build();
}

/** Torso: chest, belly, shoulders and the clothes on them. */
function buildTorso({ b, top, bag, badge, tie }) {
  const P = new Part();
  const puff = heavyTop(top) ? 0.025 : 0;
  const T = 'hoodie';
  // Body
  P.add(cyl(0.185 * b + puff, 0.19 * b + puff, 0.32, 12), T, [0, 0.17, 0], 0, [1, 1, WZ + 0.05]);
  P.add(cyl(0.245 * b + puff, 0.185 * b + puff, 0.3, 12), T, [0, 0.47, 0], 0, [1, 1, WZ]);
  P.add(cap(0.095 + puff * 0.6, 0.34 * b), T, [0, 0.59, 0], [0, 0, PI / 2], [1, 1, 0.85]);
  P.add(SPH, T, [0, 0.61, 0], 0, [0.2 * b, 0.07, 0.13]);
  const slope = 0.12; // the chest leans forward a little: things on it tilt to match
  const onChest = (y, extra = 0.004) => frontZ(y, b, puff) + extra;

  // Belt (hidden under hoodies, jumpers and coats)
  const belt = top === 'tee' || top === 'uniform' || top === 'jacket' || top === 'leather' || top === 'vest' || top === 'hawaiian';
  if (belt) {
    P.add(band(0.197 * b, 0.065), 'belt', [0, 0.03, 0], 0, [1, 1, 0.7]);
    P.add(rbox(0.065, 0.05, 0.02, 0.008), 'metal', [0, 0.03, 0.197 * b * 0.7 + 0.004]);
  }

  switch (top) {
    case 'hoodie': {
      // The hood bunched up behind the neck, the front pocket, the drawstrings
      P.add(cap(0.065, 0.16), T, [0, 0.655, -0.095], [0, 0, PI / 2], [1, 1, 0.9]);
      P.add(SPH, T, [0, 0.6, -0.12], 0, [0.16 * b, 0.09, 0.06]);
      P.add(rbox(0.25 * b, 0.12, 0.03, 0.012), 'accent', [0, 0.16, onChest(0.16, 0.0)], [0.03, 0, 0]);
      P.add(band(0.195 * b + 0.004, 0.06), 'accent', [0, 0.04, 0], 0, [1, 1, 0.72]);
      for (const sx of [-1, 1]) P.add(cyl(0.008, 0.008, 0.13, 5), 'shirt', [sx * 0.045, 0.55, onChest(0.55, 0.006)], [slope, 0, sx * 0.08]);
      break;
    }
    case 'jacket': {
      // Open front with a T-shirt underneath, a zip on each side, the collar up
      P.add(rbox(0.11 * b, 0.36, 0.02, 0.008), 'shirt', [0, 0.44, onChest(0.44, -0.002)], [slope, 0, 0]);
      for (const sx of [-1, 1]) {
        P.add(BOX, 'accent', [sx * 0.06 * b, 0.42, onChest(0.42, 0.006)], [slope, 0, 0], [0.012, 0.42, 0.012]);
        P.add(rbox(0.07, 0.055, 0.02, 0.008), 'accent', [sx * 0.11 * b, 0.15, onChest(0.15, 0.008)]);
      }
      P.add(band(0.105, 0.075, 12), T, [0, 0.655, -0.005], 0, [1, 1, 0.92]);
      P.add(band(0.2 * b + 0.006, 0.06), T, [0, 0.07, 0], 0, [1, 1, 0.72]);
      break;
    }
    case 'tee': {
      P.add(band(0.085, 0.03, 12), 'accent', [0, 0.645, 0], 0, [1, 1, 0.95]);
      P.add(rbox(0.13 * b, 0.1, 0.012, 0.01), 'accent', [0, 0.47, onChest(0.47, 0.002)], [slope, 0, 0]); // a print
      break;
    }
    case 'sweater': {
      P.add(band(0.088, 0.04, 12), 'accent', [0, 0.645, 0], 0, [1, 1, 0.95]);
      P.add(band(0.195 * b + 0.004, 0.07), 'accent', [0, 0.04, 0], 0, [1, 1, 0.72]);
      for (const y of [0.4, 0.46]) P.add(band(chestR(y, b) + 0.003, 0.02), 'accent', [0, y, 0], 0, [1, 1, WZ]);
      break;
    }
    case 'suit': {
      // White shirt and tie in the V, lapels, a pocket square
      P.add(rbox(0.13 * b, 0.24, 0.02, 0.006), 'shirt', [0, 0.5, onChest(0.5, -0.004)], [slope, 0, 0]);
      P.add(BOX, 'tie', [0, 0.47, onChest(0.47, 0.008)], [slope, 0, 0], [0.04, 0.22, 0.012]);
      P.add(BOX, 'tie', [0, 0.6, onChest(0.6, 0.006)], [slope, 0, 0], [0.05, 0.035, 0.02]);
      for (const sx of [-1, 1]) P.add(BOX, 'accent', [sx * 0.075 * b, 0.5, onChest(0.5, 0.006)], [slope, 0, sx * 0.3], [0.045, 0.27, 0.012]);
      P.add(BOX, 'shirt', [0.13 * b, 0.5, onChest(0.5, 0.006)], [slope, 0, 0], [0.05, 0.02, 0.01]);
      P.add(band(0.2 * b + 0.006, 0.06), T, [0, 0.04, 0], 0, [1, 1, 0.72]);
      P.add(band(0.085, 0.04, 12), 'shirt', [0, 0.65, 0], 0, [1, 1, 0.95]);
      break;
    }
    case 'uniform': {
      // Shirt pockets, epaulettes, a radio, a duty belt with pouches (and a badge)
      for (const sx of [-1, 1]) {
        P.add(rbox(0.075, 0.07, 0.016, 0.006), 'accent', [sx * 0.095 * b, 0.45, onChest(0.45, 0.004)], [slope, 0, 0]);
        P.add(BOX, 'accent', [sx * 0.095 * b, 0.49, onChest(0.49, 0.008)], [slope, 0, 0], [0.08, 0.02, 0.012]);
        P.add(rbox(0.11, 0.025, 0.07, 0.008), 'accent', [sx * 0.2 * b, 0.655, 0]);
        P.add(rbox(0.06, 0.07, 0.05, 0.01), 'belt', [sx * 0.17 * b, 0.02, 0.06]);
      }
      P.add(band(0.09, 0.035, 12), 'accent', [0, 0.645, 0], 0, [1, 1, 0.95]);
      P.add(band(0.2 * b + 0.002, 0.075), 'belt', [0, 0.03, 0], 0, [1, 1, 0.72]);
      P.add(rbox(0.05, 0.07, 0.03, 0.01), 'belt', [-0.1 * b, 0.56, onChest(0.56, 0.012)], [slope, 0, 0]); // radio
      P.add(cyl(0.006, 0.006, 0.07, 4), 'belt', [-0.115 * b, 0.62, onChest(0.6, 0.012)]);
      if (tie) P.add(BOX, 'tie', [0, 0.5, onChest(0.5, 0.006)], [slope, 0, 0], [0.035, 0.2, 0.01]);
      if (badge) {
        P.add(rbox(0.05, 0.06, 0.012, 0.012), 'gold', [0.1 * b, 0.53, onChest(0.53, 0.012)], [slope, 0, 0]);
        P.add(SPH_LO, 'gold', [0.1 * b, 0.565, onChest(0.56, 0.012)], 0, [0.016, 0.016, 0.006]);
      }
      break;
    }
    case 'jumpsuit': {
      // One piece: zip down the front, collar flaps, a number patch
      P.add(BOX, 'accent', [0, 0.38, onChest(0.38, 0.004)], [slope, 0, 0], [0.012, 0.5, 0.01]);
      for (const sx of [-1, 1]) P.add(BOX, 'accent', [sx * 0.05, 0.63, onChest(0.62, 0.012)], [0.5, 0, sx * 0.5], [0.07, 0.06, 0.012]);
      P.add(rbox(0.09, 0.06, 0.012, 0.006), 'patch', [0.1 * b, 0.48, onChest(0.48, 0.004)], [slope, 0, 0]);
      P.add(rbox(0.22 * b, 0.12, 0.012, 0.01), 'patch', [0, 0.45, -onChest(0.45, 0.004)], [-slope, 0, 0]);
      break;
    }
    case 'ski': {
      // Puffy coat: quilted bands, a stripe across the chest, a high collar
      for (const y of [0.2, 0.33]) P.add(band(chestR(y, b) + puff + 0.004, 0.02), 'accent', [0, y, 0], 0, [1, 1, WZ + 0.05]);
      P.add(band(chestR(0.47, b) + puff + 0.004, 0.05), 'shirt', [0, 0.47, 0], 0, [1, 1, WZ]);
      P.add(cyl(0.11, 0.125, 0.11, 12, true), T, [0, 0.67, 0], 0, [1, 1, 0.95]);
      P.add(band(0.21 * b + puff, 0.06), 'accent', [0, 0.04, 0], 0, [1, 1, 0.75]);
      P.add(BOX, 'metal', [0, 0.38, onChest(0.38, 0.006)], [slope, 0, 0], [0.012, 0.5, 0.01]);
      break;
    }
    case 'leather': {
      // Biker jacket: an off-centre zip, wide lapels, snap collar, zipped pockets
      P.add(rbox(0.09 * b, 0.3, 0.02, 0.008), 'shirt', [-0.02, 0.47, onChest(0.47, -0.002)], [slope, 0, 0]);
      P.add(BOX, 'metal', [0.05 * b, 0.36, onChest(0.36, 0.006)], [slope, 0, -0.18], [0.01, 0.5, 0.01]);
      for (const sx of [-1, 1]) {
        P.add(BOX, T, [sx * 0.09 * b, 0.56, onChest(0.56, 0.008)], [slope + 0.1, 0, sx * 0.55], [0.07, 0.14, 0.014]);
        P.add(BOX, 'metal', [sx * 0.1 * b, 0.22, onChest(0.22, 0.006)], [0, 0, sx * 0.5], [0.08, 0.008, 0.008]);
        P.add(SPH_LO, 'metal', [sx * 0.15 * b, 0.6, onChest(0.6, 0.012)], 0, 0.009);
      }
      P.add(band(0.105, 0.06, 12), T, [0, 0.655, -0.005], 0, [1, 1, 0.92]);
      P.add(band(0.2 * b + 0.006, 0.07), T, [0, 0.08, 0], 0, [1, 1, 0.72]);
      break;
    }
    case 'tracksuit': {
      // Zip-up track top: white stripes down the sides and arms, a high collar
      P.add(BOX, 'metal', [0, 0.38, onChest(0.38, 0.004)], [slope, 0, 0], [0.012, 0.5, 0.01]);
      for (const sx of [-1, 1]) P.add(BOX, 'patch', [sx * chestR(0.4, b) * 0.98, 0.36, 0], 0, [0.012, 0.56, 0.05]);
      P.add(band(0.098, 0.07, 12), T, [0, 0.66, 0], 0, [1, 1, 0.95]);
      P.add(band(0.195 * b + 0.004, 0.06), 'accent', [0, 0.04, 0], 0, [1, 1, 0.72]);
      P.add(rbox(0.05, 0.035, 0.012, 0.008), 'patch', [0.1 * b, 0.52, onChest(0.52, 0.004)], [slope, 0, 0]);
      break;
    }
    case 'vest': {
      // Sleeveless vest: a scoop neck, a little chain
      P.add(band(0.088, 0.025, 12), 'accent', [0, 0.645, 0], 0, [1, 1, 0.95]);
      P.add(cyl(0.004, 0.004, 0.16, 4), 'gold', [0, 0.6, onChest(0.58, 0.01)], [slope + PI / 2 - 0.9, 0, 0]);
      P.add(SPH_LO, 'gold', [0, 0.53, onChest(0.53, 0.012)], 0, 0.014);
      break;
    }
    case 'hawaiian': {
      // Loud holiday shirt: an open collar, buttons, big flowers
      P.add(BOX, 'accent', [0, 0.38, onChest(0.38, 0.004)], [slope, 0, 0], [0.014, 0.5, 0.01]);
      for (const sx of [-1, 1]) P.add(BOX, T, [sx * 0.05, 0.62, onChest(0.62, 0.012)], [0.5, 0, sx * 0.55], [0.08, 0.07, 0.012]);
      P.add(rbox(0.05, 0.1, 0.012, 0.01), 'skin', [0, 0.6, onChest(0.6, -0.002)], [slope, 0, 0]);
      const flowers = [[0.11, 0.48, 1], [-0.1, 0.36, 1], [0.06, 0.22, 1], [-0.12, 0.15, 1], [0.13, 0.32, -1], [-0.06, 0.52, -1], [0.0, 0.3, -1], [0.1, 0.12, -1]];
      for (const [x, y, side] of flowers) {
        const z = side * onChest(y, 0.002);
        P.add(SPH_LO, 'patch', [x * b, y, z], 0, [0.032, 0.032, 0.006]);
        P.add(SPH_LO, 'gold', [x * b, y, z + side * 0.004], 0, [0.011, 0.011, 0.004]);
      }
      break;
    }
    case 'trench': {
      // Long belted coat: double row of buttons, wide lapels, a belt with a buckle
      for (const sx of [-1, 1]) {
        for (const y of [0.25, 0.37, 0.49]) P.add(SPH_LO, 'accent', [sx * 0.07 * b, y, onChest(y, 0.008)], 0, 0.013);
        P.add(BOX, 'accent', [sx * 0.08 * b, 0.55, onChest(0.55, 0.01)], [slope, 0, sx * 0.45], [0.06, 0.18, 0.012]);
      }
      P.add(rbox(0.08 * b, 0.12, 0.02, 0.006), 'shirt', [0, 0.57, onChest(0.57, -0.004)], [slope, 0, 0]);
      P.add(band(0.21 * b + 0.01, 0.055), 'accent', [0, 0.1, 0], 0, [1, 1, 0.75]);
      P.add(rbox(0.06, 0.05, 0.015, 0.006), 'metal', [0, 0.1, (0.21 * b + 0.01) * 0.75 + 0.004]);
      P.add(cyl(0.12, 0.13, 0.09, 12, true), T, [0, 0.66, -0.01], [-0.15, 0, 0], [1, 1, 0.95]); // turned-up collar
      // The coat's skirt, flaring out over the hips
      P.add(cyl(0.215 * b + 0.01, 0.25 * b, 0.36, 14, true), T, [0, -0.13, 0], 0, [1, 1, 0.78]);
      P.add(BOX, 'accent', [0, -0.13, (0.24 * b) * 0.78 + 0.002], 0, [0.01, 0.34, 0.01]);
      break;
    }
    default: break;
  }

  // Cash bag strap across the chest
  if (bag) P.add(BOX, 'strap', [0, 0.36, 0.158], [slope, 0, 0.7], [0.05, 0.78, 0.016]);
  return P.build();
}

/** The skull's shape: everything on the head is placed around it. */
const SK = { y: 0.215, rx: 0.142, ry: 0.158, rz: 0.152 };

/** Hair: a cap over the skull, plus extras for some styles. withHat: skip what a hat would hide. */
function addHair(P, hair, withHat) {
  if (!hair || hair === 'bald') return;
  const capOn = (scale, theta, tilt, slot = 'hair') => P.add(dome(theta), slot, [0, SK.y, 0], [tilt, 0, 0], [SK.rx * scale, SK.ry * scale, SK.rz * scale]);
  switch (hair) {
    case 'buzz': capOn(1.03, 1.38, -0.3); break;
    case 'bob': capOn(1.08, 1.8, -0.62); break;
    case 'long':
      capOn(1.07, 1.35, -0.38);
      P.add(rbox(0.27, 0.27, 0.1, 0.045), 'hair', [0, 0.13, -0.09]);
      for (const sx of [-1, 1]) P.add(rbox(0.05, 0.2, 0.11, 0.022), 'hair', [sx * 0.13, 0.15, -0.025]);
      break;
    case 'ponytail':
      capOn(1.06, 1.35, -0.38);
      P.add(SPH, 'hair', [0, 0.25, -0.165], 0, 0.045);
      P.add(cap(0.034, 0.13), 'hair', [0, 0.15, -0.19], [0.35, 0, 0]);
      break;
    case 'bun':
      capOn(1.06, 1.35, -0.38);
      if (!withHat) P.add(SPH, 'hair', [0, 0.355, -0.07], 0, 0.068);
      break;
    case 'curly': {
      capOn(1.1, 1.45, -0.35);
      if (withHat) break;
      const spots = [[0, 0.95], [0.9, 0.7], [1.8, 0.75], [2.7, 0.7], [3.6, 0.75], [4.5, 0.7], [5.4, 0.72], [0.4, 0.35], [2.5, 0.35], [4.4, 0.35]];
      for (const [a, t] of spots) {
        const x = Math.sin(a) * Math.sin(t), y = Math.cos(t), z = Math.cos(a) * Math.sin(t);
        if (z > 0.55 && t > 0.6) continue; // keep the forehead clear
        P.add(SPH_LO, 'hair', [x * SK.rx * 1.08, SK.y + 0.02 + y * SK.ry * 1.08, z * SK.rz * 1.06 - 0.015], 0, 0.055);
      }
      break;
    }
    case 'mohawk':
      capOn(1.02, 1.4, -0.3, 'stubble');
      if (withHat) break;
      for (let i = 0; i < 6; i++) {
        const t = -0.55 + i * 0.32; // from the forehead over to the back
        P.add(rbox(0.035, 0.09, 0.07, 0.015), 'hair', [0, SK.y + Math.cos(t) * SK.ry * 1.1, Math.sin(-t) * SK.rz * 1.1], [-t, 0, 0]);
      }
      break;
    case 'spiky': {
      capOn(1.06, 1.35, -0.35);
      if (withHat) break;
      const cone = cyl(0, 0.04, 0.09, 5);
      for (const [a, t] of [[0, 0.3], [1.3, 0.55], [-1.3, 0.55], [2.6, 0.6], [-2.6, 0.6], [PI, 0.4], [0.5, 0.85], [-0.5, 0.85]]) {
        const dir = new THREE.Vector3(Math.sin(a) * Math.sin(t), Math.cos(t), Math.cos(a) * Math.sin(t) - 0.15).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        const e = new THREE.Euler().setFromQuaternion(q);
        P.add(cone, 'hair', [dir.x * SK.rx * 1.05, SK.y + dir.y * SK.ry * 1.05, dir.z * SK.rz * 1.05], [e.x, e.y, e.z]);
      }
      break;
    }
    case 'afro': {
      capOn(1.1, 1.5, -0.35);
      if (withHat) break;
      P.add(SPH, 'hair', [0, SK.y + 0.06, -0.03], 0, [SK.rx * 1.6, SK.ry * 1.35, SK.rz * 1.45]);
      break;
    }
    case 'braids':
      capOn(1.05, 1.4, -0.36);
      for (let i = -2; i <= 2; i++) P.add(BOX, 'stubble', [i * 0.045, SK.y + 0.1, 0], [0, 0, 0], [0.008, 0.01, 0.3 * (1 - Math.abs(i) * 0.12)]); // the rows
      for (const sx of [-1, 1]) {
        for (const k of [0, 1]) P.add(cap(0.022, 0.24, 6), 'hair', [sx * (0.05 + k * 0.05), 0.07, -0.13 + k * 0.02], [0.22, 0, sx * 0.08]);
      }
      break;
    case 'dreads':
      capOn(1.08, 1.4, -0.36);
      for (let i = 0; i < 9; i++) {
        const a = PI * 0.35 + (i / 8) * PI * 1.3; // round the back and sides
        const x = Math.sin(a) * 0.13, z = Math.cos(a) * 0.125;
        P.add(cap(0.022, 0.2, 6), 'hair', [x, 0.13, z - 0.01], [-z * 1.6, 0, x * 1.6]);
      }
      break;
    case 'slick':
      // Slicked straight back, shiny, with a little wave at the back
      capOn(1.05, 1.32, -0.42);
      if (!withHat) P.add(SPH, 'hair', [0, 0.31, 0.06], [-0.3, 0, 0], [0.12, 0.04, 0.08]);
      P.add(SPH_LO, 'hair', [0, 0.2, -0.145], 0, [0.11, 0.05, 0.03]);
      break;
    case 'undercut':
      capOn(1.02, 1.4, -0.3, 'stubble');
      if (!withHat) {
        P.add(dome(0.9), 'hair', [0, SK.y + 0.02, 0.0], [-0.35, 0, 0], [SK.rx * 1.06, SK.ry * 1.14, SK.rz * 1.1]);
        P.add(SPH, 'hair', [0.03, 0.33, 0.1], [-0.6, 0, -0.3], [0.09, 0.04, 0.05]); // swept over to one side
      }
      break;
    default: // 'short'
      capOn(1.06, 1.3, -0.36);
      if (!withHat) P.add(SPH, 'hair', [0.02, 0.335, 0.085], [-0.5, 0, -0.2], [0.1, 0.035, 0.055]); // a fringe
      break;
  }
}

function addBeard(P, beard) {
  if (!beard) return;
  const jaw = (k, slot) => P.add(new THREE.SphereGeometry(1, 14, 8, 0, PI, 1.45, PI - 1.45), slot, [0, 0.14, 0.02], 0, [0.11 * k, 0.09 * k, 0.115 * k]);
  if (beard === 'stubble') jaw(1.03, 'stubble');
  if (beard === 'beard') {
    jaw(1.1, 'hair');
    P.add(SPH, 'hair', [0, 0.085, 0.075], 0, [0.075, 0.06, 0.06]);
    P.add(rbox(0.09, 0.022, 0.03, 0.01), 'hair', [0, 0.163, 0.14]);
  }
  if (beard === 'chops') for (const sx of [-1, 1]) P.add(rbox(0.035, 0.1, 0.07, 0.015), 'hair', [sx * 0.118, 0.16, 0.05], [0, 0, sx * 0.12]);
  if (beard === 'moustache') P.add(rbox(0.085, 0.024, 0.03, 0.011), 'hair', [0, 0.162, 0.14]);
  if (beard === 'goatee') {
    P.add(SPH, 'hair', [0, 0.1, 0.11], 0, [0.04, 0.045, 0.035]);
    P.add(rbox(0.07, 0.02, 0.025, 0.009), 'hair', [0, 0.162, 0.14]);
  }
}

function addHat(P, hat) {
  if (!hat) return;
  const domeOn = (scale, theta, tilt) => P.add(dome(theta), 'hat', [0, SK.y, 0], [tilt, 0, 0], [SK.rx * scale, SK.ry * scale, SK.rz * scale]);
  switch (hat) {
    case 'beanie':
    case 'bobble': {
      domeOn(1.15, 1.42, -0.22);
      // The folded cuff round the bottom, following the tilt
      P.inFrame([0, SK.y, 0], [-0.22, 0, 0], 1, () => {
        const y = Math.cos(1.42) * SK.ry * 1.15;
        P.add(cyl(1, 1.02, 0.07, 16, true), 'hatBand', [0, y + 0.03, 0], 0, [SK.rx * 1.16, 1, SK.rz * 1.16]);
        if (hat === 'bobble') P.add(SPH, 'hatBand', [0, SK.ry * 1.15 + 0.02, 0], 0, 0.05);
      });
      break;
    }
    case 'cap': {
      domeOn(1.11, 1.3, -0.12);
      P.add(brim(0.16, 0.016), 'hat', [0, 0.275, 0.06], [0.12, 0, 0], [1, 1, 1.05]);
      P.add(SPH_LO, 'hatBand', [0, SK.y + SK.ry * 1.1, -0.02], 0, 0.016);
      break;
    }
    case 'fedora': {
      // Pinched crown, a ribbon, a wide brim all round
      P.inFrame([0, 0.33, -0.005], [-0.1, 0, 0], 1, () => {
        P.add(cyl(0.135, 0.158, 0.13, 14), 'hat', [0, 0.04, 0], 0, [1, 1, 1.12]);
        P.add(BOX, 'hat', [0, 0.11, 0], 0, [0.04, 0.02, 0.2]);
        P.add(band(0.159, 0.035, 14), 'hatBand', [0, -0.005, 0], 0, [1, 1, 1.12]);
        P.add(cyl(0.27, 0.27, 0.012, 18), 'hat', [0, -0.025, 0], 0, [1, 1, 1.05]);
      });
      break;
    }
    case 'bucket': {
      domeOn(1.13, 1.35, -0.12);
      P.add(cyl(0.18, 0.22, 0.06, 16, true), 'hat', [0, 0.27, 0.005], [-0.12, 0, 0], [1, 1, 1.06]);
      P.add(band(0.165, 0.025, 16), 'hatBand', [0, 0.31, 0.0], [-0.12, 0, 0], [1, 1, 1.06]);
      break;
    }
    case 'beret': {
      P.add(SPH, 'hat', [0.03, 0.34, -0.01], [0, 0, -0.22], [0.18, 0.05, 0.17]);
      P.add(band(0.15, 0.025, 14), 'hatBand', [0, 0.315, 0], [-0.1, 0, -0.1], [1, 1, 1.05]);
      P.add(cyl(0.004, 0.006, 0.025, 4), 'hat', [0.04, 0.39, -0.01]);
      break;
    }
    case 'headphones': {
      // Big headphones: a band over the top, two cushioned cups
      P.add(new THREE.TorusGeometry(0.168, 0.014, 6, 16, PI), 'hat', [0, SK.y + 0.01, 0], [0, PI / 2, 0], [1, 1.02, 1]);
      for (const sx of [-1, 1]) {
        P.add(cyl(0.055, 0.055, 0.04, 12), 'hat', [sx * 0.165, 0.2, 0], [0, 0, PI / 2]);
        P.add(cyl(0.035, 0.035, 0.012, 10), 'hatBand', [sx * 0.188, 0.2, 0], [0, 0, PI / 2]);
      }
      break;
    }
    case 'bighead': {
      // A carnival "cabeçudo": a huge papier-mâché head over your own, with a
      // painted face, a big red nose, rosy cheeks and a crown of curls
      const C = [0, 0.3, 0.02];
      P.add(SPH, 'hat', C, 0, [0.34, 0.37, 0.33]);
      P.add(SPH, 'hat', [0, 0.06, 0.03], 0, [0.17, 0.08, 0.15]);              // the chin/neck of the head
      for (const sx of [-1, 1]) {
        P.add(SPH, 'eyeWhite', [sx * 0.12, 0.36, 0.3], 0, [0.075, 0.085, 0.04]);
        P.add(SPH_LO, 'pupil', [sx * 0.115, 0.355, 0.335], 0, [0.035, 0.042, 0.02]);
        P.add(BOX, 'pupil', [sx * 0.12, 0.47, 0.31], [0.25, 0, sx * -0.2], [0.12, 0.025, 0.03]);  // eyebrows
        P.add(SPH_LO, 'tie', [sx * 0.2, 0.25, 0.27], 0, [0.06, 0.045, 0.025]);  // rosy cheeks
        P.add(SPH, 'hatBand', [sx * 0.31, 0.38, -0.03], 0, [0.08, 0.13, 0.12]); // curls over the ears
      }
      P.add(SPH, 'tie', [0, 0.28, 0.35], 0, [0.075, 0.07, 0.07]);              // the nose
      P.add(rbox(0.16, 0.04, 0.03, 0.01), 'mouth', [0, 0.16, 0.31], [-0.25, 0, 0]);
      P.add(dome(1.1), 'hatBand', [0, 0.32, -0.02], [-0.25, 0, 0], [0.36, 0.38, 0.35]); // the hair
      break;
    }
    case 'police':
    case 'guard': {
      // Peaked cap: a crown, a band, a shiny peak, a badge at the front
      P.add(cyl(0.178, 0.156, 0.075, 16), 'hat', [0, 0.37, -0.005], [-0.08, 0, 0], [1, 1, 1.08]);
      P.add(cyl(0.157, 0.152, 0.06, 16), 'hatBand', [0, 0.31, 0], [-0.05, 0, 0], [1, 1, 1.07]);
      P.add(brim(0.13, 0.014), 'belt', [0, 0.288, 0.07], [0.38, 0, 0], [1.1, 1, 1]);
      P.add(rbox(0.045, 0.05, 0.012, 0.01), 'gold', [0, 0.33, 0.162], [-0.05, 0, 0]);
      break;
    }
    default: break;
  }
}

/** Head: neck, skull, face, hair, beard, hat, sunglasses / balaclava. (The eyes are separate, so they can blink.) */
function buildHead({ face, hair, beard, hat }) {
  const P = new Part();
  const masked = face === 'mask';
  const S = masked ? 'mask' : 'skin';
  const showHair = !masked; // (hockey masks and bandanas still show your hair)
  P.add(cyl(0.066, 0.072, 0.16, 10), S, [0, 0.04, 0]);
  P.add(SPH, S, [0, SK.y, 0], 0, [SK.rx, SK.ry, SK.rz]);
  P.add(SPH, S, [0, 0.14, 0.02], 0, [0.11, 0.09, 0.115]); // jaw and chin
  for (const sx of [-1, 1]) P.add(SPH_LO, S, [sx * 0.142, 0.2, -0.005], 0, [0.022, 0.04, 0.03]); // ears
  P.add(SPH_LO, S, [0, 0.2, 0.15], [-0.15, 0, 0], [0.024, 0.042, 0.03]); // nose
  P.add(SPH_LO, S, [0, 0.178, 0.157], 0, [0.028, 0.022, 0.025]);
  if (masked) {
    // Balaclava: two eye holes and a mouth hole, a knitted ridge on top
    for (const sx of [-1, 1]) P.add(SPH, 'skin', [sx * 0.055, 0.236, 0.139], 0, [0.044, 0.032, 0.014]);
    P.add(SPH, 'skin', [0, 0.14, 0.131], 0, [0.036, 0.019, 0.01]);
    P.add(rbox(0.05, 0.01, 0.01, 0.004), 'mouth', [0, 0.139, 0.139]);
    P.add(SPH_LO, 'mask', [0, SK.y + SK.ry - 0.005, 0], 0, [0.05, 0.02, 0.05]);
  } else {
    for (const sx of [-1, 1]) P.add(BOX, 'hair', [sx * 0.056, 0.277, 0.141], [0, 0, sx * -0.1], [0.066, 0.016, 0.02]); // eyebrows
    P.add(rbox(0.06, 0.013, 0.012, 0.005), 'mouth', [0, 0.133, 0.128]);
    if (showHair) addHair(P, hair, !!hat && hat !== 'headphones');
    if (face !== 'hockey' && face !== 'bandana') addBeard(P, beard);
  }
  if (face === 'bandana') {
    // A scarf tied over the nose and mouth, the knot at the back
    P.add(new THREE.SphereGeometry(1, 14, 8, -PI * 0.12, PI * 1.24, 1.25, 1.2), 'cover', [0, 0.17, 0.0], 0, [0.152, 0.14, 0.168]);
    P.add(cyl(0.004, 0.11, 0.1, 3), 'cover', [0, 0.06, 0.12], [0.35, 0, 0], [1, 1, 0.3]);
    P.add(SPH_LO, 'cover', [0, 0.2, -0.155], 0, [0.03, 0.025, 0.02]);
    for (const sx of [-1, 1]) P.add(cap(0.012, 0.05, 4), 'cover', [sx * 0.025, 0.16, -0.17], [0.3, 0, sx * 0.4]);
  }
  if (face === 'hockey') {
    // A white goalie mask: eye holes, breathing holes, a red stripe, straps
    P.add(new THREE.SphereGeometry(1, 14, 10, 0, PI, 0.35, 2.2), 'cover', [0, 0.2, 0.012], 0, [0.15, 0.17, 0.162]);
    const onMask = (x, y) => 0.015 + 0.162 * Math.sqrt(Math.max(0, 1 - (x / 0.15) ** 2 - ((y - 0.2) / 0.17) ** 2));
    for (const sx of [-1, 1]) P.add(rbox(0.048, 0.028, 0.012, 0.01), 'pupil', [sx * 0.052, 0.238, onMask(sx * 0.052, 0.238)], [0, sx * 0.3, 0]);
    for (const [x, y] of [[-0.03, 0.16], [0, 0.155], [0.03, 0.16], [-0.015, 0.125], [0.015, 0.125], [0, 0.095]]) P.add(SPH_LO, 'pupil', [x, y, onMask(x, y)], 0, [0.007, 0.007, 0.004]);
    P.add(BOX, 'tie', [0, 0.3, onMask(0, 0.3) - 0.004], [-0.75, 0, 0], [0.024, 0.11, 0.008]);
    for (const sx of [-1, 1]) P.add(BOX, 'belt', [sx * 0.145, 0.24, 0.02], 0, [0.01, 0.018, 0.25]);
  }
  if (face === 'aviators') {
    // Gold-rimmed teardrop lenses
    for (const sx of [-1, 1]) {
      P.add(SPH, 'lens', [sx * 0.054, 0.232, 0.157], [0, 0, sx * 0.25], [0.034, 0.03, 0.01]);
      P.add(new THREE.TorusGeometry(0.034, 0.004, 4, 14), 'gold', [sx * 0.054, 0.232, 0.161], [0, 0, 0], [1, 0.88, 1]);
      P.add(BOX, 'gold', [sx * 0.143, 0.245, 0.07], 0, [0.006, 0.006, 0.16]);
    }
    P.add(BOX, 'gold', [0, 0.258, 0.16], 0, [0.05, 0.006, 0.006]);
  }
  if (face === 'shades') {
    for (const sx of [-1, 1]) {
      P.add(rbox(0.064, 0.04, 0.014, 0.01), 'lens', [sx * 0.053, 0.238, 0.158]);
      P.add(BOX, 'lens', [sx * 0.143, 0.245, 0.07], 0, [0.008, 0.008, 0.16]);
    }
    P.add(BOX, 'lens', [0, 0.248, 0.16], 0, [0.04, 0.008, 0.008]);
  }
  addHat(P, hat);
  return P.build();
}

/** Both eyes (whites and pupils), centred on the eye line so they can blink. */
function buildEyes() {
  const P = new Part();
  for (const sx of [-1, 1]) {
    P.add(SPH, 'eyeWhite', [sx * 0.054, 0, 0.141], 0, [0.025, 0.02, 0.016]);
    P.add(SPH_LO, 'pupil', [sx * 0.053, -0.001, 0.153], 0, [0.012, 0.014, 0.008]);
  }
  return P.build();
}

/** Upper arm (hangs down from the shoulder). sx: which side (-1 / +1). */
function buildUpperArm({ top, sx }) {
  const P = new Part();
  const puff = heavyTop(top) ? 0.014 : 0;
  const L = RIG.upperArm;
  P.add(SPH, top === 'vest' ? 'skin' : 'hoodie', [0, -0.025, 0], 0, [0.076 + puff, 0.085 + puff, 0.078 + puff]); // shoulder
  if (top === 'vest') {
    P.add(cap(0.059, L - 0.08), 'skin', [0, -L / 2 - 0.01, 0]);
  } else if (shortSleeve(top)) {
    P.add(cap(0.059, L - 0.08), 'skin', [0, -L / 2 - 0.01, 0]);
    P.add(cyl(0.079, 0.074, 0.15, 10, true), 'hoodie', [0, -0.07, 0]); // short sleeve
    if (top === 'hawaiian') P.add(SPH_LO, 'patch', [sx * 0.074, -0.08, 0.02], 0, [0.006, 0.03, 0.03]);
  } else {
    if (top === 'tracksuit') P.add(BOX, 'patch', [sx * 0.07, -L / 2, 0], 0, [0.01, L - 0.02, 0.02]);
    P.add(cap(0.068 + puff, L - 0.09), 'hoodie', [0, -L / 2 - 0.01, 0]);
    if (top === 'uniform') P.add(rbox(0.012, 0.06, 0.05, 0.004), 'accent', [sx * 0.066, -0.08, 0]); // shoulder patch
  }
  return P.build();
}

/** Forearm and hand. sx: which side the arm is on (the thumb points inwards). */
function buildForeArm({ top, sx }) {
  const P = new Part();
  const puff = heavyTop(top) ? 0.012 : 0;
  const L = RIG.foreArm;
  const bare = bareArms(top);
  P.add(cap(0.06 + puff, L - 0.08), bare ? 'skin' : 'hoodie', [0, -L / 2 + 0.005, 0]);
  if (top === 'tracksuit') P.add(BOX, 'patch', [sx * 0.058, -L / 2 + 0.005, 0], 0, [0.01, L - 0.06, 0.02]);
  if (sleeveCuff(top)) P.add(band(0.064 + puff, 0.045, 10), top === 'jacket' || top === 'leather' ? 'hoodie' : 'accent', [0, -L + 0.035, 0]);
  if (top === 'suit') P.add(band(0.058, 0.03, 10), 'shirt', [0, -L + 0.01, 0]);
  // Hand: palm, curled fingers, thumb
  const y = -L - 0.045;
  P.add(rbox(0.075, 0.1, 0.095), 'gloves', [0, y, 0.005]);
  P.add(rbox(0.072, 0.055, 0.07), 'gloves', [0, y - 0.065, 0.025], [0.45, 0, 0]);
  P.add(cap(0.02, 0.04, 6), 'gloves', [-sx * 0.038, y + 0.0, 0.042], [0.4, 0, sx * 0.5]);
  return P.build();
}

function buildThigh() {
  const P = new Part();
  const L = RIG.thigh;
  P.add(cap(0.095, L - 0.13), 'trousers', [0, -L / 2 - 0.005, 0], 0, [1, 1, 1.06]);
  return P.build();
}

function buildShin({ top }) {
  const P = new Part();
  const L = RIG.shin;
  P.add(cap(0.077, L - 0.11), 'trousers', [0, -L / 2 + 0.01, 0]);
  if (top === 'tracksuit') P.add(BOX, 'patch', [0.074, -L / 2 + 0.03, 0], 0, [0.01, L - 0.12, 0.02]);
  if (top !== 'jumpsuit' && top !== 'suit' && top !== 'uniform' && top !== 'tracksuit') P.add(band(0.079, 0.035, 10), 'trousers', [0, -L + 0.07, 0]); // turn-ups
  // Shoe: the upper and a sole
  P.add(rbox(0.13, 0.08, 0.27, 0.035), 'shoes', [0, -L + 0.0, 0.05]);
  P.add(rbox(0.136, 0.028, 0.278, 0.012), 'sole', [0, -L - 0.047, 0.05]);
  P.add(BOX, 'sole', [0, -L + 0.012, 0.155], [0.5, 0, 0], [0.09, 0.012, 0.03]); // laces / toe cap line
  return P.build();
}

/** The duffel bag of cash, worn on the back. */
function buildBag() {
  const P = new Part();
  P.inFrame([0, 0, 0], [0, 0, 0.18], 1, () => {
    P.add(cyl(0.15, 0.15, 0.56, 14), 'bag', [0, 0, 0], [0, 0, PI / 2], [1, 1, 0.92]);
    for (const sx of [-1, 1]) {
      P.add(cyl(0.154, 0.154, 0.04, 14), 'strap', [sx * 0.27, 0, 0], [0, 0, PI / 2], [1, 1, 0.94]);
      P.add(new THREE.TorusGeometry(0.06, 0.013, 6, 10, PI), 'strap', [sx * 0.1, 0.14, 0]);
    }
    P.add(BOX, 'strap', [0, 0.14, 0], 0, [0.5, 0.02, 0.035]);
    P.add(rbox(0.17, 0.05, 0.1, 0.01), 'cash', [0.08, 0.16, 0.02], [0, 0.2, 0.1]);
    P.add(rbox(0.15, 0.04, 0.09, 0.01), 'cash', [-0.04, 0.155, -0.01], [0, -0.3, -0.05]);
  });
  return P.build();
}

// ---------------------------------------------------------------- cache
const BUILDERS = {
  hips: buildHips, torso: buildTorso, head: buildHead, eyes: buildEyes,
  upperArm: buildUpperArm, foreArm: buildForeArm, thigh: buildThigh, shin: buildShin, bag: buildBag,
};
const cache = new Map();

/** The shared geometry (and vertex slots) for a body part with these options. */
export function partGeometry(name, opts) {
  const key = `${name}|${JSON.stringify(opts)}`;
  let hit = cache.get(key);
  if (!hit) { hit = BUILDERS[name](opts); cache.set(key, hit); }
  return hit;
}

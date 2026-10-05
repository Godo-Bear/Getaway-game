import * as THREE from 'three';
import { lookColors, lookStyle } from './outfits.js';
import { damp, clamp } from '../core/utils.js';
import { partGeometry, SLOTS, RIG } from './bodyParts.js';

// A person: you, the crew, guards, police, people on the street. Rounded
// limbs, a face with eyes that blink, hair, beards, hats and clothes
// (bodyParts.js builds the shapes). Everyone shares this rig and animation.
//
// Rig hierarchy (each joint is a THREE.Group we rotate):
//
//   root (position = feet, rotation.y = facing)
//    └ tumble (pivot at hip height; rotates for the roll)
//       └ hips (bobs up and down while running)
//          ├ torso (leans forward when sprinting, twists with the arms)
//          │   ├ head (+ eyes)
//          │   ├ shoulderL ─ elbowL      (arms)
//          │   ├ shoulderR ─ elbowR
//          │   └ bag (duffel, swings a little)
//          ├ hipL ─ kneeL                (legs)
//          └ hipR ─ kneeR
//
// Animation = every frame we pick a target angle for each joint based on the
// controller's state (idle, walk, run, air, mantle, roll) and smoothly blend
// toward it. Blending (instead of snapping) makes pose changes look natural.
//
// Rotation sign reminder (model faces +Z):
//   rotation.x NEGATIVE swings a leg/arm FORWARD, POSITIVE swings it back.
//
// Looks: new PlayerModel(colors, { style }) where colors can set any of
// hoodie (the top), trousers, shoes, skin, gloves, hair, hat, accent, shirt,
// tie, bag... and style picks the shapes: top (hoodie, jacket, tee, sweater,
// suit, uniform, jumpsuit, ski), hair, beard, hat, face (mask, face, shades),
// build and height. people.js has the crew, uniforms and random passers-by.

const DEFAULTS = {
  hoodie: 0x24252b, trousers: 0x1a1e2a, shoes: 0x0f0f10, mask: 0x111318,
  hair: 0x2a1c14, hat: 0x2a2b31, shirt: 0xe6e2da, tie: 0x7a1f2e,
  metal: 0xb8bcc4, gold: 0xe8b830, belt: 0x18181a, eyeWhite: 0xeeeae2, pupil: 0x23170f,
  lens: 0x0c0d10, bag: 0x3b4a2a, strap: 0x1d1f16, cash: 0x5fae5a, patch: 0xe8e8e8,
};
const PUNCH_TIME = 0.32;
const UPPER_TIME = 0.42; // (the uppercut that ends a combo is slower and bigger)
const FALL_TIME = 0.42;  // s to topple over when knocked down
const GETUP_TIME = 1.0;  // s to get back up
const STYLE = { top: 'hoodie', hair: 'short', beard: null, hat: null, face: 'face', build: 1, height: 1, badge: false, tie: false };

const blend = (a, b, t) => a + (b - a) * t;
/** 0 below a, 1 above b, a smooth S-curve between. */
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

const _c = new THREE.Color();
const lum = (hex) => { _c.setHex(hex); return 0.2126 * _c.r + 0.7152 * _c.g + 0.0722 * _c.b; };
const shade = (hex, k) => _c.setHex(hex).multiplyScalar(k).getHex();
const mix = (a, b, k) => _c.setHex(a).lerp(new THREE.Color(b), k).getHex();

/**
 * Fill in every colour slot. Older callers describe faces with `mask`: a dark
 * mask is a balaclava, a skin-coloured one is just the face.
 */
function resolve(colors, style) {
  const c = { ...DEFAULTS, ...colors };
  const s = { ...STYLE, ...style };
  if (!style.face) s.face = colors.mask != null && lum(colors.mask) < 0.06 ? 'mask' : 'face';
  c.skin = colors.skin ?? (colors.mask != null && s.face !== 'mask' ? colors.mask : 0xc4946f);
  c.gloves = colors.gloves ?? (s.face === 'mask' ? 0x151515 : c.skin);
  c.accent = colors.accent ?? shade(c.hoodie, lum(c.hoodie) < 0.02 ? 1.9 : 0.68);
  c.sole = colors.sole ?? (lum(c.shoes) > 0.4 ? 0xf2f2ee : shade(c.shoes, 0.55));
  c.hatBand = colors.hatBand ?? (s.hat === 'police' ? 0x0e0e12 : s.hat === 'guard' ? shade(c.hat, 0.6) : shade(c.hat, 0.78));
  c.mouth = mix(c.skin, 0x6a2a2a, 0.35);
  c.stubble = mix(c.skin, c.hair, 0.55);
  return { colors: c, style: s };
}

export class PlayerModel {
  /**
   * @param {object} [colors] - any colour slots (and optionally `style`): see above
   * @param {{bag?:boolean, style?:object}} [opts]
   */
  constructor(colors = {}, { bag = true, style = {} } = {}) {
    const { style: colorStyle, ...cols } = colors;
    this.base = { colors: cols, style: { ...colorStyle, ...style, bag } };
    this.own = null; // your own clothes (setLook); disguises go on top

    this.root = new THREE.Group();
    this.root.rotation.order = 'YXZ'; // (falls tip over along the way you face, whichever way that is)
    this.tumble = new THREE.Group();
    this.tumble.position.y = 0.55;
    this.root.add(this.tumble);
    this.hips = new THREE.Group();
    this.hips.position.y = RIG.hipY - 0.55;
    this.tumble.add(this.hips);
    this.torso = new THREE.Group();
    this.hips.add(this.torso);
    this.head = new THREE.Group();
    this.head.position.y = RIG.headY;
    this.torso.add(this.head);
    this.eyes = new THREE.Group();
    this.eyes.position.y = 0.236;
    this.head.add(this.eyes);

    const joint = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
    this.shoulderL = joint(this.torso, -RIG.shoulderX, RIG.shoulderY, 0);
    this.shoulderR = joint(this.torso, RIG.shoulderX, RIG.shoulderY, 0);
    this.elbowL = joint(this.shoulderL, 0, -RIG.upperArm, 0);
    this.elbowR = joint(this.shoulderR, 0, -RIG.upperArm, 0);
    this.hipL = joint(this.hips, -RIG.hipX, 0, 0);
    this.hipR = joint(this.hips, RIG.hipX, 0, 0);
    this.kneeL = joint(this.hipL, 0, -RIG.thigh, 0);
    this.kneeR = joint(this.hipR, 0, -RIG.thigh, 0);
    this.bag = joint(this.torso, 0, 0.42, -0.27);

    // One material for the whole person (the colours are in the vertices)
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.meshes = {};
    this._apply_look(resolve(this.base.colors, this.base.style));

    // Current joint angles (blended toward targets each frame)
    this.pose = {
      hipL: 0, hipR: 0, kneeL: 0, kneeR: 0,
      shL: 0, shR: 0, elL: 0, elR: 0,
      shLz: 0, shRz: 0,  // arms out to the side
      lean: 0, bob: 0, headPitch: 0, bagSwing: 0, sideLean: 0,
      twist: 0, sway: 0, headYaw: 0,
    };
    this.runPhase = Math.random() * 6;
    this.time = Math.random() * 10;
    this.blink = 1 + Math.random() * 3;
    this.lookAround = true; // glance around while standing still
    this.punchT = 0;        // > 0 while throwing a punch
    this.punchSide = 1;
    this.punchKind = 'jab';
    this.punchLen = PUNCH_TIME;
    this.blockT = 0;        // > 0: forearms up, blocking (guards)
    this.hitT = 0;          // > 0: rocked back by a punch
    this.reachT = 0;        // > 0: a quick hand into someone's pocket
    this.fallen = null;     // knocked down: { t, forward, upAt }
    this.lookT = 0;         // > 0: looking at something (lookYaw, head turned)
    this.lookYaw = 0;
    this.flinchT = 0;       // > 0: startled
  }

  /**
   * Knocked down: topple over (backwards, or on your face when hit from
   * behind), bounce, lie there, and get back up after `upIn` seconds
   * (Infinity: stay down, out cold, until getUp()).
   */
  knockDown({ forward = false, upIn = Infinity } = {}) {
    if (this.fallen && this.fallen.t < this.fallen.upAt) return; // (already down)
    this.fallen = { t: 0, forward, upAt: upIn };
  }

  /** Start getting up (if down). */
  getUp() {
    const f = this.fallen;
    if (f && f.t < f.upAt) f.upAt = Math.max(f.t, FALL_TIME + 0.2);
  }

  /** Straight back on their feet (a level restart). */
  standUp() {
    this.fallen = null;
    this.root.rotation.x = 0;
  }

  /** On the floor, or still getting up. */
  get isDown() { return !!this.fallen; }

  /** Turn the head toward a point for a moment (heard something). */
  glance(x, z, dur = 1.5) {
    const f = this.root.rotation.y, dx = x - this.root.position.x, dz = z - this.root.position.z;
    const lx = dx * Math.cos(f) - dz * Math.sin(f), lz = dx * Math.sin(f) + dz * Math.cos(f);
    this.lookYaw = clamp(Math.atan2(lx, lz), -1.3, 1.3);
    this.lookT = dur;
  }

  /** Startled (someone sprinted right past): flinch away with the hands up, and look. */
  flinch(x, z) {
    this.glance(x, z, 1.3);
    this.flinchT = this.flinchLen = 0.55;
    this.flinchSide = this.lookYaw >= 0 ? 1 : -1;
  }

  /**
   * Throw a punch. kind: 'jab' (left), 'cross' (right) or 'upper' (a big
   * rising uppercut, the end of a combo). No kind: left and right in turn.
   */
  punch(kind = null) {
    this.punchKind = kind || (this.punchSide > 0 ? 'jab' : 'cross');
    this.punchSide = this.punchKind === 'cross' ? 1 : -1;
    this.punchT = this.punchLen = this.punchKind === 'upper' ? UPPER_TIME : PUNCH_TIME;
  }

  /** Forearms up in front of the face for a moment (a guard blocking a punch). */
  block(dur = 0.8) { this.blockT = dur; }

  /** Rocked back by a punch. */
  hit(dur = 0.3) { this.hitT = this.hitLen = dur; }

  /** A quick, low hand into someone's pocket. */
  reach(dur = 0.45) { this.reachT = this.reachLen = dur; }

  /** Build (or rebuild) the meshes for a resolved look, and colour them. */
  _apply_look({ colors, style }) {
    this.colors = colors;
    this.style = style;
    const b = Math.round((style.build || 1) * 20) / 20;
    const top = style.top;
    const parts = [
      ['hips', this.hips, { b }],
      ['torso', this.torso, { b, top, bag: !!style.bag, badge: !!style.badge, tie: !!style.tie }],
      ['head', this.head, { face: style.face, hair: style.hair, beard: style.beard, hat: style.hat }],
      ['eyes', this.eyes, {}],
      ['upperArm', this.shoulderL, { top, sx: -1 }], ['upperArm', this.shoulderR, { top, sx: 1 }],
      ['foreArm', this.elbowL, { top, sx: -1 }], ['foreArm', this.elbowR, { top, sx: 1 }],
      ['thigh', this.hipL, {}], ['thigh', this.hipR, {}],
      ['shin', this.kneeL, { top }], ['shin', this.kneeR, { top }],
      ['bag', this.bag, {}],
    ];
    // Linear RGB for each slot
    const rgb = new Float32Array(SLOTS.length * 3);
    SLOTS.forEach((slot, i) => { _c.setHex(colors[slot] ?? 0xff00ff); rgb[i * 3] = _c.r; rgb[i * 3 + 1] = _c.g; rgb[i * 3 + 2] = _c.b; });
    parts.forEach(([name, parent, opts], i) => {
      const shared = partGeometry(name, opts);
      let mesh = this.meshes[i];
      if (!mesh || mesh.userData.shared !== shared) {
        const geo = new THREE.BufferGeometry();
        geo.setIndex(shared.geo.index);
        geo.setAttribute('position', shared.geo.attributes.position);
        geo.setAttribute('normal', shared.geo.attributes.normal);
        geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(shared.slots.length * 3), 3));
        geo.boundingSphere = shared.geo.boundingSphere;
        if (mesh) mesh.geometry = geo;
        else {
          mesh = new THREE.Mesh(geo, this.material);
          mesh.castShadow = name !== 'eyes';
          parent.add(mesh);
          this.meshes[i] = mesh;
        }
        mesh.userData.shared = shared;
      }
      const col = mesh.geometry.attributes.color;
      const slots = shared.slots;
      for (let v = 0; v < slots.length; v++) {
        const k = slots[v] * 3;
        col.array[v * 3] = rgb[k]; col.array[v * 3 + 1] = rgb[k + 1]; col.array[v * 3 + 2] = rgb[k + 2];
      }
      col.needsUpdate = true;
    });
    this.bag.visible = !!style.bag;
    this.eyes.visible = style.face !== 'shades';
    this.onLook?.(colors, style); // (e.g. the first-person arms follow your clothes)
    this.root.scale.setScalar(style.height || 1);
  }

  /** Your own look (outfits.js): clothes, face, hair, hat, and whether you carry the cash bag. */
  setLook(look) {
    this.own = { colors: lookColors(look), style: lookStyle(look) };
    this.setOutfit(null);
  }

  /**
   * Wear different clothes on top of your own (a casino staff uniform, a
   * guard's uniform): colours for hoodie, trousers, gloves... plus an
   * optional style (top, hat). The balaclava comes off; your own face, skin
   * and hair stay. null = back to your own clothes.
   */
  setOutfit(colors = null) {
    const own = this.own || this.base;
    if (!colors) { this._apply_look(resolve(own.colors, own.style)); return; }
    const { style = {}, mask, ...cols } = colors;
    const mine = resolve(own.colors, own.style);
    const face = mine.style.face === 'mask' ? 'face' : mine.style.face;
    this._apply_look(resolve(
      { ...own.colors, ...cols, skin: mine.colors.skin, gloves: cols.gloves ?? mine.colors.skin },
      { ...own.style, hat: null, ...style, face },
    ));
  }

  /**
   * @param {number} dt
   * @param {import('./playerController.js').PlayerController} pc
   */
  update(dt, pc) {
    this.time += dt;
    // Blink every few seconds
    this.blink -= dt;
    if (this.blink < 0) this.blink = 1.5 + Math.random() * 3.5;
    this.eyes.scale.y = this.blink < 0.12 ? 0.15 : 1;
    this.root.position.copy(pc.pos);
    this.root.rotation.y = pc.facing;

    const speed = pc.horizontalSpeed;
    const target = this._targetPose(dt, pc, speed);

    // Blend every joint toward its target. Mantles/rolls (and punches) blend faster.
    if (this.punchT > 0) this.punchT -= dt;
    if (this.blockT > 0) this.blockT -= dt;
    if (this.hitT > 0) this.hitT -= dt;
    if (this.reachT > 0) this.reachT -= dt;
    if (this.lookT > 0) this.lookT -= dt;
    if (this.flinchT > 0) this.flinchT -= dt;
    const fast = this.punchT > 0 || this.blockT > 0 || this.hitT > 0 || this.flinchT > 0 || !!this.fallen;
    const rate = fast ? 30 : pc.state === 'mantle' || pc.state === 'roll' ? 22 : 14;
    for (const k in target) this.pose[k] = damp(this.pose[k], target[k], rate, dt);
    this._apply(pc);
    if (this.fallen) this._fallTilt(dt, pc);
  }

  /** Knocked down: tip the whole body over (and back up again). */
  _fallTilt(dt, pc) {
    const f = this.fallen;
    f.t += dt;
    let tilt; // 0 standing .. 1 flat on the floor
    if (f.t < f.upAt) {
      const k = Math.min(1, f.t / FALL_TIME);
      tilt = k * k; // (slow, then fast: gravity)
      const b = f.t - FALL_TIME; // a little bounce when they hit the ground
      if (b > 0 && b < 0.3) tilt -= Math.sin((b / 0.3) * Math.PI) * 0.06;
    } else {
      const k = (f.t - f.upAt) / GETUP_TIME;
      if (k >= 1) { this.standUp(); return; }
      tilt = 1 - smooth(0.12, 0.95, k);
    }
    this.root.rotation.x = (f.forward ? 1 : -1) * tilt * Math.PI / 2;
    this.root.position.y += Math.sin(tilt * Math.PI / 2) * 0.22; // (lying: the body is off the floor by its thickness)
  }

  /** A delta-wing hang glider, attached above the shoulders (hidden until used). */
  _buildWing() {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.9);      // nose (forward)
    shape.lineTo(1.7, -0.55);  // right tip
    shape.lineTo(0, -0.3);     // tail notch
    shape.lineTo(-1.7, -0.55); // left tip
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2); // lie flat, nose towards +Z (the way the model faces)
    geo.scale(1, 1, -1);
    const sail = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xff8a3d, emissive: 0x5a2208, roughness: 0.6, side: THREE.DoubleSide }));
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.03, 0.06), new THREE.MeshBasicMaterial({ color: 0xffd27a, toneMapped: false }));
    stripe.position.set(0, 0.02, -0.35);
    const spar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 1.3), new THREE.MeshStandardMaterial({ color: 0x2a2d33, metalness: 0.7 }));
    spar.position.set(0, -0.01, 0.2);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.04), spar.material);
    bar.position.set(0, -0.55, 0.15);
    const strutL = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.6, 0.03), spar.material);
    strutL.position.set(-0.42, -0.27, 0.15);
    const strutR = strutL.clone();
    strutR.position.x = 0.42;
    this.wing = new THREE.Group();
    this.wing.add(sail, stripe, spar, bar, strutL, strutR);
    this.wing.position.set(0, 2.3, 0.15);
    this.wing.visible = false;
    this.root.add(this.wing); // on the root, so it stays level while the body leans
  }

  _targetPose(dt, pc, speed) {
    const t = {
      hipL: 0, hipR: 0, kneeL: 0.05, kneeR: 0.05,
      shL: 0.05, shR: 0.05, elL: -0.25, elR: -0.25,
      shLz: -0.08, shRz: 0.08,
      lean: 0, bob: 0, headPitch: 0, bagSwing: 0, sideLean: 0,
      twist: 0, sway: 0, headYaw: 0,
    };

    switch (pc.state) {
      case 'slide': {
        // Feet first, leaning back, one hand trailing on the ground.
        t.hipL = -1.5; t.kneeL = 0.2;
        t.hipR = -1.2; t.kneeR = 1.0;
        t.lean = -0.9;
        t.bob = -0.45;
        t.shL = 0.9; t.elL = -0.2; t.shLz = -0.5;
        t.shR = -0.6; t.elR = -0.8;
        t.bagSwing = 0.3;
        break;
      }
      case 'crouch': {
        this.runPhase += dt * speed * 1.2;
        const sw = Math.sin(this.runPhase) * Math.min(1, speed / 3) * 0.5;
        t.hipL = -1.2 - sw; t.hipR = -1.2 + sw;
        t.kneeL = t.kneeR = 1.6;
        t.bob = -0.4;
        t.lean = 0.5;
        t.shL = t.shR = -0.4;
        t.elL = t.elR = -1.0;
        break;
      }
      case 'wallrun': {
        // Running along the wall, leaning away from it.
        this.runPhase += dt * speed * 1.45;
        const sn = Math.sin(this.runPhase), cs = Math.cos(this.runPhase);
        t.hipL = -sn; t.hipR = sn;
        t.kneeL = 0.2 + Math.max(0, cs) * 1.4;
        t.kneeR = 0.2 + Math.max(0, -cs) * 1.4;
        t.shL = sn * 0.8; t.shR = -sn * 0.8;
        t.elL = t.elR = -1.2;
        t.lean = 0.2;
        // Which side is the wall? Lean the other way.
        if (pc.wallRun) {
          const n = pc.wallRun.normal;
          const rightX = -Math.cos(pc.facing), rightZ = Math.sin(pc.facing); // model's right
          t.sideLean = (n.x * rightX + n.z * rightZ) > 0 ? -0.35 : 0.35;
        }
        break;
      }
      case 'ladder': {
        // Climbing: arms reach up in turn, knees lift in turn.
        const c = Math.sin(pc.climbPhase || 0);
        t.shL = -2.4 + c * 0.5; t.shR = -2.4 - c * 0.5;
        t.elL = -0.6 - c * 0.3; t.elR = -0.6 + c * 0.3;
        t.hipL = -0.9 - c * 0.5; t.hipR = -0.9 + c * 0.5;
        t.kneeL = 1.2 + c * 0.4; t.kneeR = 1.2 - c * 0.4;
        t.lean = 0.1;
        break;
      }
      case 'grapple': // hanging from the grapple cable, same as a zip line
      case 'zip': {
        // Hanging from the cable: both arms up, legs dangling.
        t.shL = t.shR = -3.0;
        t.elL = t.elR = 0;
        t.shLz = 0.1; t.shRz = -0.1;
        t.hipL = -0.4; t.kneeL = 0.5;
        t.hipR = -0.1; t.kneeR = 0.3;
        t.lean = 0.1;
        t.bagSwing = Math.sin(this.time * 3) * 0.3;
        break;
      }
      case 'ground': {
        // One gait that blends smoothly from standing to walking to running
        // to sprinting: the legs keep the same rhythm through the change
        // (strides per second grow with speed), so nothing jumps.
        const runK = smooth(2.6, 4.4, speed);   // 0 walking .. 1 running
        const moveK = smooth(0.1, 0.6, speed);  // 0 standing .. 1 moving
        const freq = blend(0.55 + 0.3 * Math.min(speed, 3.6), 1 + 0.12 * speed, runK); // strides per second
        if (speed > 0.05) this.runPhase += dt * freq * Math.PI * 2;
        const s = Math.sin(this.runPhase), c = Math.cos(this.runPhase);
        // Walking: shorter steps, the knee bends as the leg swings through,
        // arms swing gently, shoulders twist against the hips.
        const wa = clamp(speed / 1.4, 0.3, 1);
        // Running: legs swing opposite to each other, arms opposite to legs.
        const sprint = clamp((speed - 6) / 4, 0, 1);
        const ra = clamp(speed / 6.5, 0.3, 1) * (0.75 + sprint * 0.35);
        const W = this._gW || (this._gW = {}), R = this._gR || (this._gR = {}), I = this._gI || (this._gI = {});
        W.hipL = -s * 0.42 * wa; W.hipR = s * 0.42 * wa;
        W.kneeL = 0.08 + Math.max(0, c) * 0.55 * wa; W.kneeR = 0.08 + Math.max(0, -c) * 0.55 * wa;
        W.shL = s * 0.34 * wa; W.shR = -s * 0.34 * wa;
        W.elL = -0.22 - Math.max(0, -s) * 0.25; W.elR = -0.22 - Math.max(0, s) * 0.25;
        W.lean = 0.04; W.bob = (Math.abs(c) - 0.5) * 0.035 * wa;
        W.twist = s * 0.1 * wa; W.sway = c * 0.035 * wa; W.bagSwing = s * 0.08;
        W.headPitch = 0; W.headYaw = 0;
        R.hipL = -s * ra; R.hipR = s * ra;
        R.kneeL = 0.15 + Math.max(0, c) * ra * 1.5; R.kneeR = 0.15 + Math.max(0, -c) * ra * 1.5; // (most bend while that leg swings forward)
        R.shL = s * ra * 0.9; R.shR = -s * ra * 0.9;
        R.elL = R.elR = -1.1 - sprint * 0.3;
        R.lean = 0.12 + sprint * 0.22; R.bob = Math.abs(c) * 0.07 * ra;
        R.twist = s * 0.16 * ra; R.sway = 0; R.bagSwing = s * 0.12;
        R.headPitch = 0; R.headYaw = 0;
        // Standing: breathing, shifting weight, looking around now and then.
        I.hipL = Math.sin(this.time * 0.6) * 0.04; I.hipR = 0;
        I.kneeL = 0.05; I.kneeR = 0.05 + Math.max(0, Math.sin(this.time * 0.6)) * 0.12;
        I.shL = I.shR = 0.04 + Math.sin(this.time * 2) * 0.02;
        I.elL = I.elR = -0.25;
        I.lean = 0; I.bob = Math.sin(this.time * 2) * 0.008;
        I.twist = 0; I.sway = Math.sin(this.time * 0.6) * 0.025; I.bagSwing = 0;
        I.headPitch = Math.sin(this.time * 0.7) * 0.05;
        I.headYaw = this.lookAround ? Math.sin(this.time * 0.31) * Math.sin(this.time * 0.17) * 0.7 : 0;
        for (const k in W) t[k] = blend(I[k], blend(W[k], R[k], runK), moveK);
        if (pc.stumbleTimer > 0) {
          // Hard landing without a roll: crouch down.
          t.kneeL = t.kneeR = 1.4;
          t.hipL = t.hipR = -1.0;
          t.bob = -0.3;
          t.lean = 0.5;
        }
        break;
      }
      case 'air': {
        if (pc.gliding) {
          // Glider Wing: hanging under the wing, both hands on the bar, legs trailing.
          t.shL = t.shR = -2.9;
          t.elL = t.elR = -0.1;
          t.shLz = -0.35; t.shRz = 0.35;
          t.hipL = t.hipR = 0.25;
          t.kneeL = t.kneeR = 0.35;
          t.lean = 0.95;
          t.headPitch = -0.6;
          t.bagSwing = 0.4;
          break;
        }
        // Tuck on the way up, legs reach for the ground on the way down
        // (blended through the top of the jump, so there's no snap)
        const up = smooth(-2.5, 2.5, pc.vel.y);
        t.hipL = blend(-0.5, -1.1, up);
        t.kneeL = blend(0.6, 1.5, up);
        t.hipR = blend(0.1, 0.3, up);
        t.kneeR = blend(0.4, 0.7, up);
        t.shL = -0.9;
        t.shR = 0.5;
        t.shLz = -0.5;
        t.shRz = 0.7;
        t.elL = -0.6;
        t.elR = -0.4;
        t.lean = 0.15;
        t.bagSwing = blend(0.25, -0.2, up);
        break;
      }
      case 'mantle': {
        const k = pc.mantleProgress;
        const vault = pc.mantle?.vault;
        if (vault) {
          // Vault: one hand on the obstacle, legs swing through to the side.
          t.shL = -1.4; t.elL = -0.2;
          t.shR = -0.6; t.elR = -0.8;
          t.hipL = -1.3; t.kneeL = 1.2;
          t.hipR = -1.1; t.kneeR = 1.4;
          t.lean = 0.35;
        } else {
          // Climb: arms up on the ledge pulling with the legs tucked, then
          // pushing up and stepping over (blended, not switched)
          const m = smooth(0.4, 0.7, k);
          t.shL = t.shR = blend(-2.8 + k * 1.5, 0.2, m);
          t.elL = t.elR = blend(-0.3 - k, -0.3, m);
          t.hipL = blend(-1.2, -0.8, m); t.kneeL = blend(1.6, 1.2, m);
          t.hipR = blend(-0.4, 0.2, m); t.kneeR = blend(1.2, 0.4, m);
          t.lean = blend(0.45, 0.5, m);
        }
        break;
      }
      case 'roll': {
        // Tucked in a ball; the tumble group spins (see _apply).
        t.hipL = t.hipR = -2.0;
        t.kneeL = t.kneeR = 2.2;
        t.shL = t.shR = -1.6;
        t.elL = t.elR = -1.6;
        t.lean = 0.9;
        t.bob = -0.25;
        break;
      }
    }
    if (this.punchT > 0 && this.punchKind === 'upper') {
      // Uppercut: the left fist drives up from the hip, the body rises into it
      const k = this.punchT / this.punchLen; // 1 -> 0
      const out = k > 0.25 ? 1 : k / 0.25;
      const rise = Math.min(1, (1 - k) / 0.45);
      // (from down by the hip to up under the chin; angles found by fitting the fist's path)
      t.shL = 0.05 + (0.25 - 1.3 * rise - 0.05) * out;
      t.elL = -0.25 + (-0.95 - 0.35 * rise + 0.25) * out;
      t.shLz = -0.08 + (0.05 + 0.4 * rise + 0.08) * out;
      t.shR = -0.65; t.elR = -1.85; t.shRz = -0.85; // (right fist guarding the face)
      t.twist += 0.55 * rise * out;
      t.lean += (0.2 - 0.32 * rise) * out;
      t.bob += 0.07 * rise * out;
      t.kneeL = t.kneeR = 0.35 * (1 - rise);
    } else if (this.punchT > 0) {
      // Punch: the arm shoots straight out in front, the shoulders turn into it
      const k = this.punchT / this.punchLen; // 1 -> 0
      const out = k > 0.35 ? 1 : k / 0.35;  // (pulls back at the end)
      const r = this.punchSide > 0;
      if (r) { t.shR = -1.55 * out; t.elR = -0.08; t.shRz = 0.12 * out; t.shL = 0.3; t.elL = -1.6; }
      else { t.shL = -1.55 * out; t.elL = -0.08; t.shLz = -0.12 * out; t.shR = 0.3; t.elR = -1.6; }
      t.twist += (r ? -0.45 : 0.45) * out;
      t.lean += 0.12 * out;
    }
    if (this.reachT > 0) {
      // Pickpocket: the right hand dips forward and low, then back
      const k = this.reachT / this.reachLen;
      const out = Math.sin(k * Math.PI);
      t.shR = -0.75 * out; t.elR = -0.15; t.shRz = -0.1 * out;
      t.lean += 0.18 * out; t.headPitch += 0.25 * out;
    }
    if (this.blockT > 0) {
      // Blocking: both forearms up in front of the face, leaning back a little
      t.shL = t.shR = -0.65; t.elL = t.elR = -1.85;
      t.shLz = 0.85; t.shRz = -0.85; // (fists in front of the face, elbows tucked in)
      t.lean -= 0.12; t.headPitch += 0.15;
    }
    if (this.hitT > 0) {
      // Rocked back by a punch: head snaps back, body leans away
      const k = this.hitT / this.hitLen;
      t.lean -= 0.4 * k; t.headPitch -= 0.45 * k; t.bob -= 0.04 * k;
      t.shL += 0.3 * k; t.shR += 0.3 * k;
    }
    if (this.lookT > 0) {
      // Looking at something: head (and shoulders a little) turned toward it
      t.headYaw = this.lookYaw;
      t.twist += this.lookYaw * 0.25;
    }
    if (this.flinchT > 0) {
      // Startled: lean away, hands up
      const k = Math.sin((1 - this.flinchT / this.flinchLen) * Math.PI); // 0 -> 1 -> 0
      t.lean -= 0.18 * k;
      t.sideLean += this.flinchSide * 0.2 * k;
      t.shL = blend(t.shL, -1.1, k); t.shR = blend(t.shR, -1.1, k);
      t.elL = blend(t.elL, -1.7, k); t.elR = blend(t.elR, -1.7, k);
      t.shLz = blend(t.shLz, 0.5, k); t.shRz = blend(t.shRz, -0.5, k);
    }
    if (this.fallen) {
      const f = this.fallen;
      if (f.t < f.upAt) {
        // Falling and lying there: arms flung out, legs loose, head lolling
        const k = Math.min(1, f.t / FALL_TIME);
        t.shL = t.shR = (f.forward ? -2.5 : -1.0) * k; // (forward: hands out to break the fall)
        t.shLz = -0.9 * k; t.shRz = 0.9 * k;
        t.elL = t.elR = -0.45;
        t.hipL = -0.3; t.hipR = 0.1; t.kneeL = 0.55; t.kneeR = 0.2;
        t.lean = t.twist = t.bob = t.sway = t.sideLean = 0;
        t.headPitch = f.forward ? -0.4 : 0.25; t.headYaw = 0.5;
      } else {
        // Getting up: knees tuck under, hands push off the floor, then stand
        const k = clamp((f.t - f.upAt) / GETUP_TIME, 0, 1);
        const c = Math.sin(Math.min(1, k * 1.15) * Math.PI); // 0 -> 1 -> 0
        t.hipL = t.hipR = -1.3 * c; t.kneeL = t.kneeR = 1.7 * c;
        t.shL = t.shR = 0.5 * c; t.elL = t.elR = -0.3;
        t.shLz = -0.35 * c; t.shRz = 0.35 * c;
        t.lean = 0.35 * c; t.bob = -0.22 * c;
        t.headYaw = 0;
      }
    }
    return t;
  }

  _apply(pc) {
    const p = this.pose;
    this.hipL.rotation.x = p.hipL;
    this.hipR.rotation.x = p.hipR;
    this.kneeL.rotation.x = p.kneeL;
    this.kneeR.rotation.x = p.kneeR;
    this.shoulderL.rotation.set(p.shL, 0, p.shLz);
    this.shoulderR.rotation.set(p.shR, 0, p.shRz);
    this.elbowL.rotation.x = p.elL;
    this.elbowR.rotation.x = p.elR;
    this.torso.rotation.set(p.lean, p.twist, 0);
    this.head.rotation.set(p.headPitch - p.lean * 0.6, p.headYaw - p.twist, 0); // keep eyes up while leaning
    this.hips.position.y = 0.4 + p.bob;
    this.hips.rotation.z = p.sway;
    this.bag.rotation.x = p.bagSwing;
    this.tumble.rotation.z = p.sideLean;

    // Glider Wing (gadget): unfolds above your shoulders while gliding.
    if (pc.gliding && !this.wing) this._buildWing();
    if (this.wing) {
      const open = pc.gliding ? 1 : 0;
      this.wingOpen = damp(this.wingOpen || 0, open, 10, 1 / 60);
      this.wing.visible = this.wingOpen > 0.03;
      this.wing.scale.set(this.wingOpen, 1, 0.4 + this.wingOpen * 0.6);
    }

    // Roll: one full forward somersault over the roll duration.
    if (pc.state === 'roll') {
      const k = clamp(pc.stateTime / 0.5, 0, 1);
      this.tumble.rotation.x = k * Math.PI * 2;
    } else {
      this.tumble.rotation.x = 0;
    }
  }
}

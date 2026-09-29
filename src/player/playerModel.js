import * as THREE from 'three';
import { damp, clamp } from '../core/utils.js';

// The player's visible character: a simple "box person" rig with a duffel
// bag of cash on their back.
//
// Rig hierarchy (each joint is a THREE.Group we rotate):
//
//   root (position = feet, rotation.y = facing)
//    └ tumble (pivot at hip height; rotates for the roll)
//       └ hips (bobs up and down while running)
//          ├ torso (leans forward when sprinting)
//          │   ├ head
//          │   ├ shoulderL ─ elbowL      (arms)
//          │   ├ shoulderR ─ elbowR
//          │   └ bag (duffel, swings a little)
//          ├ hipL ─ kneeL                (legs)
//          └ hipR ─ kneeR
//
// Animation = every frame we pick a target angle for each joint based on the
// controller's state (idle, run, air, mantle, roll) and smoothly blend toward
// it. Blending (instead of snapping) makes pose changes look natural.
//
// Rotation sign reminder (model faces +Z):
//   rotation.x NEGATIVE swings a leg/arm FORWARD, POSITIVE swings it back.

const COLORS = {
  hoodie: 0x24252b,
  trousers: 0x1a1e2a,
  shoes: 0x0f0f10,
  skin: 0xc4946f,
  mask: 0x111318,
  gloves: 0x151515,
  bag: 0x3b4a2a,
  strap: 0x1d1f16,
  cash: 0x5fae5a,
};

function box(w, h, d, color, y = 0, x = 0, z = 0) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color }),
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

/** A joint: an empty group at a pivot point, holding one hanging limb box. */
function limb(parent, x, y, z, w, len, d, color) {
  const joint = new THREE.Group();
  joint.position.set(x, y, z);
  joint.add(box(w, len, d, color, -len / 2)); // hangs down from the pivot
  parent.add(joint);
  return joint;
}

export class PlayerModel {
  /**
   * @param {object} [colors] - override any of COLORS (police officers, Vince...)
   * @param {{bag?:boolean}} [opts]
   */
  constructor(colors = {}, { bag = true } = {}) {
    const C = { ...COLORS, ...colors };
    this.root = new THREE.Group();
    this.tumble = new THREE.Group();
    this.tumble.position.y = 0.55;
    this.root.add(this.tumble);

    this.hips = new THREE.Group();
    this.hips.position.y = 0.95 - 0.55;
    this.tumble.add(this.hips);

    // --- Torso + head
    this.torso = new THREE.Group();
    this.hips.add(this.torso);
    this.torso.add(box(0.5, 0.62, 0.28, C.hoodie, 0.34));
    this.torso.add(box(0.44, 0.12, 0.26, C.trousers, 0.02)); // belt line
    this.head = new THREE.Group();
    this.head.position.y = 0.72;
    this.torso.add(this.head);
    this.head.add(box(0.1, 0.08, 0.1, C.skin, 0.03)); // neck
    this.head.add(box(0.28, 0.3, 0.28, C.mask, 0.2)); // balaclava
    this.head.add(box(0.22, 0.06, 0.02, C.skin, 0.24, 0, 0.14)); // eye slit
    this.head.add(box(0.3, 0.07, 0.3, 0x2a2b31, 0.36)); // beanie rim

    // --- Arms (shoulder -> elbow)
    const armLen = 0.32, foreLen = 0.3;
    this.shoulderL = limb(this.torso, -0.32, 0.6, 0, 0.14, armLen, 0.15, C.hoodie);
    this.shoulderR = limb(this.torso, 0.32, 0.6, 0, 0.14, armLen, 0.15, C.hoodie);
    this.elbowL = limb(this.shoulderL, 0, -armLen, 0, 0.12, foreLen, 0.13, C.hoodie);
    this.elbowR = limb(this.shoulderR, 0, -armLen, 0, 0.12, foreLen, 0.13, C.hoodie);
    this.elbowL.add(box(0.13, 0.1, 0.14, C.gloves, -foreLen - 0.04));
    this.elbowR.add(box(0.13, 0.1, 0.14, C.gloves, -foreLen - 0.04));

    // --- Legs (hip -> knee)
    const thigh = 0.46, shin = 0.44;
    this.hipL = limb(this.hips, -0.13, 0, 0, 0.18, thigh, 0.2, C.trousers);
    this.hipR = limb(this.hips, 0.13, 0, 0, 0.18, thigh, 0.2, C.trousers);
    this.kneeL = limb(this.hipL, 0, -thigh, 0, 0.16, shin, 0.18, C.trousers);
    this.kneeR = limb(this.hipR, 0, -thigh, 0, 0.16, shin, 0.18, C.trousers);
    this.kneeL.add(box(0.17, 0.08, 0.28, C.shoes, -shin - 0.02, 0, 0.05));
    this.kneeR.add(box(0.17, 0.08, 0.28, C.shoes, -shin - 0.02, 0, 0.05));

    // --- Duffel bag of cash, slung across the back
    this.bag = new THREE.Group();
    this.bag.position.set(0, 0.42, -0.26);
    this.bag.visible = bag;
    this.torso.add(this.bag);
    const bagBody = box(0.62, 0.3, 0.3, C.bag, 0);
    bagBody.rotation.z = 0.18;
    this.bag.add(bagBody);
    // End caps and a zip line make it read as a duffel from a distance
    this.bag.add(box(0.05, 0.31, 0.31, C.strap, 0.055, -0.3));
    this.bag.add(box(0.05, 0.31, 0.31, C.strap, -0.055, 0.3));
    const cash = box(0.18, 0.06, 0.1, C.cash, 0.17, 0.08, 0.02); // bills poking out
    cash.rotation.z = 0.18;
    this.bag.add(cash);
    // Strap diagonally across the chest
    const strap = box(0.06, 0.8, 0.02, C.strap, 0.36, 0, 0.15);
    strap.rotation.z = 0.7;
    strap.visible = bag;
    this.torso.add(strap);

    // Current joint angles (blended toward targets each frame)
    this.pose = {
      hipL: 0, hipR: 0, kneeL: 0, kneeR: 0,
      shL: 0, shR: 0, elL: 0, elR: 0,
      shLz: 0, shRz: 0,  // arms out to the side
      lean: 0, bob: 0, headPitch: 0, bagSwing: 0, sideLean: 0,
    };
    this.runPhase = 0;
    this.time = 0;
  }

  /**
   * @param {number} dt
   * @param {import('./playerController.js').PlayerController} pc
   */
  update(dt, pc) {
    this.time += dt;
    this.root.position.copy(pc.pos);
    this.root.rotation.y = pc.facing;

    const speed = pc.horizontalSpeed;
    const target = this._targetPose(dt, pc, speed);

    // Blend every joint toward its target. Mantles/rolls blend faster.
    const rate = pc.state === 'mantle' || pc.state === 'roll' ? 22 : 14;
    for (const k in target) this.pose[k] = damp(this.pose[k], target[k], rate, dt);
    this._apply(pc);
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
        if (speed > 0.3) {
          // Running cycle: legs swing opposite to each other, arms opposite to legs.
          const sprint = clamp((speed - 6) / 4, 0, 1);
          const amp = clamp(speed / 6.5, 0.3, 1) * (0.75 + sprint * 0.35);
          this.runPhase += dt * speed * 1.45;
          const s = Math.sin(this.runPhase), c = Math.cos(this.runPhase);
          t.hipL = -s * amp;
          t.hipR = s * amp;
          // Knee bends most while that leg swings forward (recovery phase).
          t.kneeL = 0.15 + Math.max(0, c) * amp * 1.5;
          t.kneeR = 0.15 + Math.max(0, -c) * amp * 1.5;
          t.shL = s * amp * 0.9;
          t.shR = -s * amp * 0.9;
          t.elL = -1.1 - sprint * 0.3;
          t.elR = -1.1 - sprint * 0.3;
          t.lean = 0.12 + sprint * 0.22;
          t.bob = Math.abs(c) * 0.07 * amp;
          t.bagSwing = s * 0.12;
        } else {
          // Idle: gentle breathing.
          t.bob = Math.sin(this.time * 2) * 0.01;
          t.headPitch = Math.sin(this.time * 0.7) * 0.05;
        }
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
        const rising = pc.vel.y > 0;
        // Tuck on the way up, legs reach for the ground on the way down.
        t.hipL = rising ? -1.1 : -0.5;
        t.kneeL = rising ? 1.5 : 0.6;
        t.hipR = rising ? 0.3 : 0.1;
        t.kneeR = rising ? 0.7 : 0.4;
        t.shL = -0.9;
        t.shR = 0.5;
        t.shLz = -0.5;
        t.shRz = 0.7;
        t.elL = -0.6;
        t.elR = -0.4;
        t.lean = 0.15;
        t.bagSwing = rising ? -0.2 : 0.25;
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
        } else if (k < 0.55) {
          // Climb phase 1: arms up on the ledge, pulling, legs tucked.
          t.shL = t.shR = -2.8 + k * 1.5;
          t.elL = t.elR = -0.3 - k;
          t.hipL = -1.2; t.kneeL = 1.6;
          t.hipR = -0.4; t.kneeR = 1.2;
          t.lean = 0.45;
        } else {
          // Climb phase 2: pushing up and stepping over.
          t.shL = t.shR = 0.2;
          t.elL = t.elR = -0.3;
          t.hipL = -0.8; t.kneeL = 1.2;
          t.hipR = 0.2; t.kneeR = 0.4;
          t.lean = 0.5;
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
    this.torso.rotation.x = p.lean;
    this.head.rotation.x = p.headPitch - p.lean * 0.6; // keep eyes up while leaning
    this.hips.position.y = 0.4 + p.bob;
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

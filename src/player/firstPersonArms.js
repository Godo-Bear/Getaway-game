import * as THREE from 'three';
import { damp } from '../core/utils.js';

// First-person arms: two sleeves with gloves, attached to the camera so they
// always sit in the bottom corners of the screen.
//
// They're drawn on top of everything (depthTest off) so they never poke
// through a wall you're pressed against. The pose follows the player's
// movement state: pumping while running, reaching up while climbing.

export class FirstPersonArms {
  constructor(camera) {
    this.group = new THREE.Group();
    this.group.visible = false;
    camera.add(this.group);

    this.sleeveMat = new THREE.MeshLambertMaterial({ color: 0x2c2d34, depthTest: false });
    this.cuffMat = new THREE.MeshLambertMaterial({ color: 0x1c1d22, depthTest: false });
    this.gloveMat = new THREE.MeshLambertMaterial({ color: 0x151515, depthTest: false });
    const sleeveGeo = new THREE.CapsuleGeometry(0.065, 0.42, 3, 10).rotateX(Math.PI / 2);
    const cuffGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.05, 12, 1, true).rotateX(Math.PI / 2);
    const handGeo = new THREE.SphereGeometry(1, 10, 8).scale(0.06, 0.05, 0.075);
    const thumbGeo = new THREE.CapsuleGeometry(0.018, 0.04, 2, 6).rotateX(Math.PI / 2);
    this.arms = [-1, 1].map((side) => {
      const arm = new THREE.Group();
      const sleeve = new THREE.Mesh(sleeveGeo, this.sleeveMat);
      sleeve.position.z = -0.22;
      const cuff = new THREE.Mesh(cuffGeo, this.cuffMat);
      cuff.position.z = -0.47;
      const glove = new THREE.Mesh(handGeo, this.gloveMat);
      glove.position.z = -0.55;
      const thumb = new THREE.Mesh(thumbGeo, this.gloveMat);
      thumb.position.set(-side * 0.045, 0.02, -0.53);
      thumb.rotation.y = side * 0.5;
      [sleeve, cuff, glove, thumb].forEach((m, i) => { m.renderOrder = 10 + i; });
      arm.add(sleeve, cuff, glove, thumb);
      this.group.add(arm);
      return { arm, side, x: side * 0.28, y: -0.32, z: -0.28, rx: 0.15 };
    });
    this.time = 0;
  }

  setVisible(on) {
    this.group.visible = on;
  }

  /** Match your body's colours (PlayerModel.colors): sleeves, cuffs and gloves (or bare hands). */
  setColors(colors, style) {
    const bare = style?.top === 'tee';
    this.sleeveMat.color.setHex(bare ? colors.skin : colors.hoodie);
    this.cuffMat.color.setHex(bare ? colors.skin : style?.top === 'suit' ? colors.shirt : colors.accent);
    this.gloveMat.color.setHex(colors.gloves);
  }

  /**
   * @param {number} dt
   * @param {import('./playerController.js').PlayerController} pc
   * @param {number} runPhase - from the body animation, so arms match the legs
   */
  update(dt, pc, runPhase) {
    if (!this.group.visible) return;
    this.time += dt;
    const speed = pc.horizontalSpeed;
    for (const a of this.arms) {
      const s = a.side;
      let x = s * 0.3, y = -0.38, z = -0.3, rx = 0.15;
      if (pc.state === 'ground' && speed > 0.5) {
        // Arms pump opposite to each other while running
        const amp = Math.min(1, speed / 9);
        const swing = Math.sin(runPhase) * s;
        y += Math.abs(Math.cos(runPhase)) * 0.03 * amp;
        z += swing * 0.12 * amp;
        rx += swing * 0.35 * amp;
      } else if (pc.state === 'air') {
        y += 0.05;
        x += s * 0.06;
        rx = 0.5;
      } else if (pc.state === 'mantle') {
        // Hands reach up onto the ledge, then push down
        const k = pc.mantleProgress;
        y = k < 0.5 ? -0.05 : -0.2 - (k - 0.5) * 0.3;
        z = -0.4;
        rx = k < 0.5 ? 1.0 : 0.2;
      } else if (pc.state === 'ladder') {
        // Hand over hand up the rungs
        const c = Math.sin((pc.climbPhase || 0) + (s > 0 ? Math.PI : 0));
        x = s * 0.2; y = 0.05 + c * 0.12; z = -0.35; rx = 1.2;
      } else if (pc.state === 'zip' || pc.state === 'grapple') {
        // Both hands up on the zip line handle
        x = s * 0.12; y = 0.18; z = -0.35; rx = 1.4;
      } else if (pc.state === 'slide') {
        // Hands back, bracing
        y = -0.5; x = s * 0.4; rx = -0.4;
      } else if (pc.state === 'wallrun') {
        const swing = Math.sin(runPhase) * s;
        z += swing * 0.12;
        rx += swing * 0.35;
      } else if (pc.state === 'roll') {
        y = -0.6; // tucked away out of view
      } else {
        y += Math.sin(this.time * 2) * 0.006; // idle breathing
      }
      a.x = damp(a.x, x, 18, dt);
      a.y = damp(a.y, y, 18, dt);
      a.z = damp(a.z, z, 18, dt);
      a.rx = damp(a.rx, rx, 18, dt);
      a.arm.position.set(a.x, a.y, a.z);
      a.arm.rotation.set(a.rx, -s * 0.12, 0);
    }
  }
}

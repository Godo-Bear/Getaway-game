import * as THREE from 'three';
import { damp, dampAngle, makeRng } from '../core/utils.js';
import { getGlowTexture, makeGlowMaterial } from '../world/materials.js';

// Police helicopter with a searchlight.
//
// Two separate things move here:
//   1. the SPOT - the circle of light on the rooftops. This is what hunts you.
//      It slides toward you at `spotSpeed`, which is slower than sprinting,
//      so a sprinting player can always outrun it (for a while...).
//   2. the HELICOPTER body - it hovers above and a little behind the spot,
//      lazily following it, so the beam comes in at an angle.
//
// The helicopter can only chase what it can SEE. Every frame we cast a ray
// from the light to the player; if a wall, water tank or hut roof is in the
// way, you're hidden and the spot starts searching around where it last saw you.

const SPOT_RADIUS = 4.2;
const HOVER_HEIGHT = 24;   // metres above the roof under the spot
const HOVER_BACK = 11;     // metres the helicopter hangs back from the spot

const _dir = new THREE.Vector3();
const _chest = new THREE.Vector3();

export class Helicopter {
  constructor(scene, world, { id = 0, startPos } = {}) {
    this.scene = scene;
    this.world = world;
    this.id = id;
    this.rng = makeRng(100 + id * 17);

    this.spot = new THREE.Vector3(startPos.x, 0, startPos.z); // where the light lands (x/z)
    this.pos = new THREE.Vector3(startPos.x, 60, startPos.z + 30);
    this.heading = 0;
    this.seesPlayer = false;
    this.lastSeen = new THREE.Vector3().copy(startPos);
    this.searchTimer = 0;
    this.searchTarget = new THREE.Vector3().copy(startPos);
    this.time = this.rng() * 10;
    // Each helicopter approaches from its own angle so they don't stack up.
    this.orbitAngle = id * 2.1;

    this._buildMesh();
    this._buildLight();
  }

  _buildMesh() {
    const g = new THREE.Group();
    const dark = new THREE.MeshLambertMaterial({ color: 0x1c2230 });
    const stripe = new THREE.MeshLambertMaterial({ color: 0xd8d8d8 });
    const add = (geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      g.add(m);
      return m;
    };
    add(new THREE.BoxGeometry(2.4, 1.8, 4.4), dark, 0, 0, 0);
    add(new THREE.BoxGeometry(2.45, 0.3, 4.45), stripe, 0, -0.2, 0);
    add(new THREE.BoxGeometry(2.0, 1.0, 1.2), new THREE.MeshLambertMaterial({ color: 0x0a1020 }), 0, 0.2, -2.3); // cockpit
    add(new THREE.BoxGeometry(0.4, 0.4, 4.6), dark, 0, 0.35, 4.3); // tail boom
    add(new THREE.BoxGeometry(0.15, 1.3, 0.8), dark, 0, 0.9, 6.4); // tail fin
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.12, 0.12, 4.2), dark, s * 1.1, -1.35, 0); // skids
    this.rotor = add(new THREE.BoxGeometry(11, 0.08, 0.35), new THREE.MeshLambertMaterial({ color: 0x0d0f14 }), 0, 1.05, 0);
    this.rotor2 = add(new THREE.BoxGeometry(0.35, 0.08, 11), this.rotor.material, 0, 1.05, 0);
    this.tailRotor = add(new THREE.BoxGeometry(0.06, 1.6, 0.2), this.rotor.material, 0.25, 0.9, 6.5);
    // Blinking nav lights
    this.navRed = add(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 }), -1.25, 0, 0);
    this.navGreen = add(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0x20ff60 }), 1.25, 0, 0);
    this.lamp = add(new THREE.SphereGeometry(0.3, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), 0, -1.0, -1.8);
    this.mesh = g;
    this.scene.add(g);
  }

  _buildLight() {
    // Real spotlight: lights up the roofs and the player.
    this.light = new THREE.SpotLight(0xdfe8ff, 2500, 120, 0.2, 0.4, 1.6);
    this.light.castShadow = false;
    this.scene.add(this.light, this.light.target);

    // Visible beam: an open cone stretched from the helicopter to the roof.
    const coneGeo = new THREE.CylinderGeometry(0.35, SPOT_RADIUS, 1, 24, 1, true);
    coneGeo.translate(0, -0.5, 0); // top at origin, extends down 1 unit
    this.beam = new THREE.Mesh(coneGeo, makeGlowMaterial(0xcfe0ff, 0.1));
    this.beam.frustumCulled = false;
    this.scene.add(this.beam);

    // Bright disc where the light hits.
    const discGeo = new THREE.PlaneGeometry(SPOT_RADIUS * 2.6, SPOT_RADIUS * 2.6);
    discGeo.rotateX(-Math.PI / 2);
    this.disc = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({
      map: getGlowTexture(), color: 0xdfe8ff, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    this.scene.add(this.disc);
    // Crisp ring at the exact edge of the danger zone, so you can judge it.
    const ringGeo = new THREE.RingGeometry(SPOT_RADIUS - 0.15, SPOT_RADIUS, 48);
    ringGeo.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(ringGeo, makeGlowMaterial(0xe8f0ff, 0.55));
    this.scene.add(this.ring);
  }

  get spotRadius() {
    return SPOT_RADIUS;
  }

  /** Can the helicopter see a point? (nothing solid between the lamp and it) */
  canSee(target) {
    const from = this.lamp.getWorldPosition(_dir.clone());
    _dir.copy(target).sub(from);
    const dist = _dir.length();
    _dir.divideScalar(dist);
    return this.world.raycast(from, _dir, dist - 0.4) >= dist - 0.4;
  }

  /**
   * @param {number} dt
   * @param {{pos:THREE.Vector3, vel:THREE.Vector3}} player
   * @param {{spotSpeed:number, lead:number}} params
   */
  update(dt, player, params) {
    this.time += dt;
    _chest.set(player.pos.x, player.pos.y + 1.2, player.pos.z);
    this.seesPlayer = this.canSee(_chest);

    // --- Where should the spot go?
    let target;
    if (this.seesPlayer) {
      this.lastSeen.copy(player.pos);
      this.searchTimer = 0;
      // Later helicopters aim ahead of you to cut you off.
      target = _dir.set(
        player.pos.x + player.vel.x * params.lead,
        0,
        player.pos.z + player.vel.z * params.lead,
      );
    } else {
      // Search pattern: sweep random points around the last sighting,
      // spreading wider the longer you stay hidden.
      this.searchTimer -= dt;
      if (this.searchTimer <= 0) {
        this.searchTimer = 1.6;
        const r = 4 + Math.min(18, this.rng() * 14);
        const a = this.rng() * Math.PI * 2;
        this.searchTarget.set(this.lastSeen.x + Math.cos(a) * r, 0, this.lastSeen.z + Math.sin(a) * r);
      }
      target = this.searchTarget;
    }
    const speed = this.seesPlayer ? params.spotSpeed : params.spotSpeed * 0.6;
    const dx = target.x - this.spot.x, dz = target.z - this.spot.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.01) {
      const step = Math.min(d, speed * dt);
      this.spot.x += (dx / d) * step;
      this.spot.z += (dz / d) * step;
    }

    // --- Surface height under the spot (roof or street)
    const ground = Math.max(0, this.world.groundHeight(this.spot.x, this.spot.z, 200));
    this.spot.y = damp(this.spot.y || ground, ground, 10, dt);

    // --- Helicopter body hovers back from the spot, slowly circling
    this.orbitAngle += dt * 0.12;
    const hx = this.spot.x + Math.cos(this.orbitAngle) * HOVER_BACK;
    const hz = this.spot.z + Math.sin(this.orbitAngle) * HOVER_BACK;
    const hy = Math.max(ground, 16) + HOVER_HEIGHT + Math.sin(this.time * 0.8) * 0.6;
    this.pos.x = damp(this.pos.x, hx, 1.2, dt);
    this.pos.z = damp(this.pos.z, hz, 1.2, dt);
    this.pos.y = damp(this.pos.y, hy, 0.8, dt);

    // Face the spot, bank a little when moving
    const wantHeading = Math.atan2(-(this.spot.x - this.pos.x), -(this.spot.z - this.pos.z));
    this.heading = dampAngle(this.heading, wantHeading, 1.5, dt);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.set(0.08, this.heading, Math.sin(this.time * 0.6) * 0.05, 'YXZ');

    this.rotor.rotation.y += dt * 28;
    this.rotor2.rotation.y = this.rotor.rotation.y;
    this.tailRotor.rotation.x += dt * 40;
    const blink = Math.sin(this.time * 6) > 0.7;
    this.navRed.visible = blink;
    this.navGreen.visible = !blink;

    // --- Light, beam and disc
    const lampPos = this.lamp.getWorldPosition(_dir);
    this.light.position.copy(lampPos);
    this.light.target.position.set(this.spot.x, this.spot.y, this.spot.z);
    this.disc.position.set(this.spot.x, this.spot.y + 0.08, this.spot.z);
    this.ring.position.set(this.spot.x, this.spot.y + 0.1, this.spot.z);

    const bx = this.spot.x - lampPos.x, by = this.spot.y - lampPos.y, bz = this.spot.z - lampPos.z;
    const len = Math.hypot(bx, by, bz);
    this.beam.position.copy(lampPos);
    this.beam.scale.set(1, len, 1);
    // Point the cone's -Y axis at the spot
    this.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(bx / len, by / len, bz / len));
    this.beam.material.opacity = this.seesPlayer ? 0.13 : 0.08;
  }

  /** Is the player standing in this helicopter's light (and visible)? */
  isPlayerLit(playerPos) {
    if (!this.seesPlayer) return false;
    return Math.hypot(playerPos.x - this.spot.x, playerPos.z - this.spot.z) < SPOT_RADIUS;
  }

  dispose() {
    this.scene.remove(this.mesh, this.light, this.light.target, this.beam, this.disc, this.ring);
  }
}

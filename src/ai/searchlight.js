import * as THREE from 'three';
import { makeGlowMaterial } from '../world/materials.js';

// A searchlight on a prison watchtower. The spot sweeps slowly between a few
// points on the ground; if you're inside the bright circle and nothing blocks
// the view from the lamp, you're lit. Stand behind cover (crates, the bus,
// walls) and the tower can't see you even inside the circle.
// After the alarm they sweep faster and drift towards you.

const RADIUS = 4.2;
const _from = new THREE.Vector3(), _dir = new THREE.Vector3();

export class Searchlight {
  /**
   * @param {THREE.Object3D} parent
   * @param {CollisionWorld} world
   * @param {{x:number, z:number, h:number, path:number[][]}} def - tower position, lamp height, sweep points [x, z]
   */
  constructor(parent, world, def) {
    this.parent = parent;
    this.world = world;
    this.lamp = new THREE.Vector3(def.x, def.h, def.z);
    this.path = def.path;
    this.leg = 0;
    this.spot = new THREE.Vector3(def.path[0][0], 0, def.path[0][1]);
    this.speed = 4.2;
    this.alert = false;
    // The light cone (from the lamp to the ground) and the bright circle
    this.cone = new THREE.Mesh(new THREE.ConeGeometry(RADIUS, 1, 24, 1, true), makeGlowMaterial(0xdfe8ff, 0.1));
    this.disc = new THREE.Mesh(new THREE.CircleGeometry(RADIUS, 32), makeGlowMaterial(0xeef4ff, 0.35));
    this.disc.rotation.x = -Math.PI / 2;
    this.head = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 0.9, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
    this.head.position.copy(this.lamp);
    parent.add(this.cone, this.disc, this.head);
  }

  reset() {
    this.leg = 0;
    this.alert = false;
    this.spot.set(this.path[0][0], 0, this.path[0][1]);
  }

  /** @param {THREE.Vector3|null} chase - after the alarm: drift towards this point */
  update(dt, chase = null) {
    const speed = this.speed * (this.alert ? 1.6 : 1);
    let tx, tz;
    if (chase && this.alert && Math.hypot(chase.x - this.spot.x, chase.z - this.spot.z) < 22) { tx = chase.x; tz = chase.z; }
    else { [tx, tz] = this.path[(this.leg + 1) % this.path.length]; }
    const dx = tx - this.spot.x, dz = tz - this.spot.z, d = Math.hypot(dx, dz);
    const step = speed * dt;
    if (d <= step) { if (!(chase && this.alert)) this.leg = (this.leg + 1) % this.path.length; this.spot.x = tx; this.spot.z = tz; }
    else { this.spot.x += (dx / d) * step; this.spot.z += (dz / d) * step; }
    this.spot.y = Math.max(0, this.world.groundHeight(this.spot.x, this.spot.z, 3));
    // Cone from the lamp down to the spot
    const len = this.lamp.distanceTo(this.spot);
    this.cone.scale.set(1, len, 1);
    this.cone.position.copy(this.lamp).lerp(this.spot, 0.5);
    this.cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), _dir.copy(this.spot).sub(this.lamp).normalize());
    this.disc.position.set(this.spot.x, this.spot.y + 0.05, this.spot.z);
    this.head.lookAt(this.spot);
  }

  /** Is the player standing in the light (and in view of the lamp)? */
  lights(pos, height) {
    if (Math.hypot(pos.x - this.spot.x, pos.z - this.spot.z) > RADIUS) return false;
    _from.copy(this.lamp);
    _dir.set(pos.x, pos.y + Math.min(1.2, height * 0.7), pos.z).sub(_from);
    const len = _dir.length();
    _dir.divideScalar(len);
    return !(this.world.raycast(_from, _dir, len - 0.3) < len - 0.3);
  }

  dispose() {
    this.parent.remove(this.cone, this.disc, this.head);
  }
}

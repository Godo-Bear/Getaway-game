import * as THREE from 'three';

// Something you can stand on that moves: a parade float, a funicular car.
//
// Its collision boxes are moved in the world every frame (CollisionWorld
// .moveBox), its meshes move with its group, and whoever is standing on it
// is carried along. Anyone it drives into (not standing on it) is shoved out
// of the way, so it can't swallow you.

const R = 0.35;     // the player's radius (near enough)
const _d = new THREE.Vector3();

export class MovingPlatform {
  /**
   * @param {import('../core/collision.js').CollisionWorld} world
   * @param {THREE.Object3D} group - the meshes (moved with it)
   * @param {number[][]} boxes - [minX, minY, minZ, maxX, maxY, maxZ] relative to the platform's position
   */
  constructor(world, group, boxes, pos = new THREE.Vector3()) {
    this.world = world;
    this.group = group;
    this.pos = pos.clone();
    this.boxes = boxes.map((b) => world.addBox(b[0] + pos.x, b[1] + pos.y, b[2] + pos.z, b[3] + pos.x, b[4] + pos.y, b[5] + pos.z, { tag: 'roof', moving: true }));
    group.position.copy(this.pos);
    this.riding = false;
  }

  /** Is this player standing on top of one of its boxes? */
  carries(p) {
    if (!p.grounded) return false;
    for (const b of this.boxes) {
      if (Math.abs(p.pos.y - b.max.y) > 0.12) continue;
      if (p.pos.x > b.min.x - R && p.pos.x < b.max.x + R && p.pos.z > b.min.z - R && p.pos.z < b.max.z + R) return true;
    }
    return false;
  }

  /** Move to `to`, carrying (or shoving) the player. */
  moveTo(to, player = null) {
    _d.subVectors(to, this.pos);
    if (_d.lengthSq() === 0) return;
    const ride = player && this.carries(player);
    this.riding = ride;
    for (const b of this.boxes) this.world.moveBox(b, _d.x, _d.y, _d.z);
    this.pos.copy(to);
    this.group.position.copy(to);
    if (!player) return;
    if (ride) { player.pos.add(_d); return; }
    // Driven into you: pushed along with it
    const p = player.pos, h = player.height || 1.8;
    for (const b of this.boxes) {
      if (p.y + h <= b.min.y || p.y >= b.max.y - 0.05) continue;
      if (p.x > b.min.x - R && p.x < b.max.x + R && p.z > b.min.z - R && p.z < b.max.z + R) {
        p.x += _d.x; p.z += _d.z;
        // and out to the nearest side
        const out = [[b.min.x - R - p.x, 0], [b.max.x + R - p.x, 0], [0, b.min.z - R - p.z], [0, b.max.z + R - p.z]].sort((a, c) => Math.hypot(a[0], a[1]) - Math.hypot(c[0], c[1]))[0];
        p.x += out[0]; p.z += out[1];
      }
    }
  }
}

import * as THREE from 'three';
import { PlayerModel } from '../player/playerModel.js';
import { randomPerson } from '../player/people.js';
import { makeRng } from '../core/utils.js';

// Pedestrians for daytime streets.
//
// Each person walks back and forth along a straight stretch of pavement,
// with a random outfit and pace. They're scenery, plus one mechanic:
// BLENDING IN. Walk (don't sprint) right next to someone and police
// patrols can't pick you out of the crowd.

const BLEND_RADIUS = 2.4;

export class Crowd {
  /**
   * @param {THREE.Object3D} parent
   * @param {CollisionWorld} world
   * @param {{a:number[], b:number[]}[]} lanes - pavement stretches [x, z] -> [x, z]
   * @param {{perLane?:number, seed?:number, cold?:boolean}} opts - cold: dressed for snow
   */
  constructor(parent, world, lanes, { perLane = 2, seed = 3, cold = false } = {}) {
    const rng = makeRng(seed);
    this.parent = parent;
    this.people = [];
    for (const lane of lanes) {
      for (let i = 0; i < perLane; i++) {
        const model = new PlayerModel(randomPerson(rng, { cold }), { bag: rng() < 0.12 });
        parent.add(model.root);
        const t = rng();
        const pos = new THREE.Vector3(lane.a[0] + (lane.b[0] - lane.a[0]) * t, 0, lane.a[1] + (lane.b[1] - lane.a[1]) * t);
        const g = world.groundHeight(pos.x, pos.z, 1.2);
        pos.y = Number.isFinite(g) ? g : 0;
        const body = { pos, vel: new THREE.Vector3(), facing: 0, state: 'ground', horizontalSpeed: 0, mantleProgress: 0, stateTime: 0, stumbleTimer: 0, mantle: null, wallRun: null };
        this.people.push({ lane, t, dir: rng() < 0.5 ? 1 : -1, speed: 1.1 + rng() * 0.6, pause: 0, model, body });
      }
    }
  }

  /** Pickpocketed: a moment later they stop, turn round and look behind them. */
  robbed(p) {
    p.robbed = true;
    p.noticeIn = 1.2;
  }

  /** Punched: they fall over backwards, then get up and carry on. */
  knockDown(p, fx, fz) {
    p.knock = 2.4;
    p.body.pos.x += fx * 0.7;
    p.body.pos.z += fz * 0.7;
    p.body.facing = Math.atan2(-fx, -fz); // (facing you as they fall)
  }

  update(dt) {
    for (const p of this.people) {
      if (p.knock > 0) {
        p.knock -= dt;
        p.body.horizontalSpeed = 0;
        p.model.update(dt, p.body);
        const down = p.knock > 0.6;
        p.model.root.rotation.x = down ? -Math.PI / 2 : 0;
        p.model.root.position.y = p.body.pos.y + (down ? 0.25 : 0);
        if (p.knock <= 0) p.pause = 0.6; // (dust themselves off)
        continue;
      }
      if (p.noticeIn > 0 && (p.noticeIn -= dt) <= 0) {
        // "Hey... where's my wallet?" They stop and look back the way they came
        p.pause = 2.6;
        p.body.facing += Math.PI;
      }
      const { a, b } = p.lane;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      if (p.pause > 0) {
        p.pause -= dt;
        p.body.horizontalSpeed = 0;
      } else {
        p.t += (p.dir * p.speed * dt) / len;
        if (p.t > 1 || p.t < 0) {
          p.t = Math.min(1, Math.max(0, p.t));
          p.dir = -p.dir;
          p.pause = 0.8 + Math.random() * 2;
        }
        p.body.pos.x = a[0] + (b[0] - a[0]) * p.t;
        p.body.pos.z = a[1] + (b[1] - a[1]) * p.t;
        p.body.facing = Math.atan2((b[0] - a[0]) * p.dir, (b[1] - a[1]) * p.dir);
        p.body.horizontalSpeed = p.speed;
      }
      p.model.update(dt, p.body);
    }
  }

  /** Is this point right next to somebody in the crowd? */
  blendsIn(pos) {
    for (const p of this.people) {
      const q = p.body.pos;
      if (Math.abs(q.x - pos.x) < BLEND_RADIUS && Math.abs(q.z - pos.z) < BLEND_RADIUS && Math.abs(q.y - pos.y) < 1.5
        && Math.hypot(q.x - pos.x, q.z - pos.z) < BLEND_RADIUS) return true;
    }
    return false;
  }

  dispose() {
    for (const p of this.people) this.parent.remove(p.model.root);
    this.people = [];
  }
}

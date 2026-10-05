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
//
// They react to you: sprint right past and they flinch and step out of
// your way; a coin landing nearby makes them look; punched or tackled,
// they fall over and get back up.

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
        this.people.push({ lane, t, dir: rng() < 0.5 ? 1 : -1, speed: 1.1 + rng() * 0.6, pause: 0, model, body, dodge: 0, flinchCool: 0 });
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
    // Knocked back 0.7 m (along the pavement, and across it)
    const lx = p.lane.b[0] - p.lane.a[0], lz = p.lane.b[1] - p.lane.a[1], len = Math.hypot(lx, lz) || 1;
    p.t = Math.min(1, Math.max(0, p.t + ((fx * lx + fz * lz) / len) * 0.7 / len));
    p.dodge += ((fx * -lz + fz * lx) / len) * 0.7;
    p.dodgeTo = 0;
    p.body.facing = Math.atan2(-fx, -fz); // (facing you as they fall)
    p.model.knockDown({ upIn: 1.1 });
  }

  /** A coin landed: the people nearby look at it. */
  hear(pos, radius = 10) {
    for (const p of this.people) {
      if (p.knock > 0) continue;
      const d = Math.hypot(p.body.pos.x - pos.x, p.body.pos.z - pos.z);
      if (d < radius) p.model.glance(pos.x, pos.z, 1.6 + Math.random() * 0.8);
    }
  }

  /** @param {object} [player] - the PlayerController (they flinch when you sprint past) */
  update(dt, player = null) {
    for (const p of this.people) {
      const { a, b } = p.lane;
      const lx = b[0] - a[0], lz = b[1] - a[1], len = Math.hypot(lx, lz) || 1;
      if (p.knock > 0) {
        // On the floor (the model falls over and gets up by itself)
        p.knock -= dt;
        p.body.horizontalSpeed = 0;
        if (p.knock <= 0) p.pause = 0.6; // (dust themselves off)
      } else {
        // Someone sprinting right past: flinch, look, and step out of the way
        if (p.flinchCool > 0) p.flinchCool -= dt;
        if (player && !(p.flinchCool > 0) && player.horizontalSpeed > 6) {
          const dx = player.pos.x - p.body.pos.x, dz = player.pos.z - p.body.pos.z;
          if (Math.abs(dx) < 2.2 && Math.abs(dz) < 2.2 && Math.abs(player.pos.y - p.body.pos.y) < 1.5 && Math.hypot(dx, dz) < 2.2) {
            p.model.flinch(player.pos.x, player.pos.z);
            p.flinchCool = 2.5;
            p.pause = Math.max(p.pause, 0.7);
            p.dodgeTo = ((dx * -lz + dz * lx) / len > 0 ? -1 : 1) * 0.8; // (across the pavement, away from you)
          }
        }
        if (p.noticeIn > 0 && (p.noticeIn -= dt) <= 0) {
          // "Hey... where's my wallet?" They stop and look back the way they came
          p.pause = 2.6;
          p.body.facing += Math.PI;
        }
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
          p.body.facing = Math.atan2(lx * p.dir, lz * p.dir);
          p.body.horizontalSpeed = p.speed;
        }
      }
      // A quick sidestep, then they drift back to their line
      if (p.dodgeTo) {
        p.dodge += (p.dodgeTo - p.dodge) * Math.min(1, dt * 8);
        if (Math.abs(p.dodgeTo - p.dodge) < 0.02) p.dodgeTo = 0;
      } else if (p.dodge && !(p.knock > 0)) p.dodge *= Math.exp(-dt * 0.8);
      p.body.pos.x = a[0] + lx * p.t - (lz / len) * p.dodge;
      p.body.pos.z = a[1] + lz * p.t + (lx / len) * p.dodge;
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

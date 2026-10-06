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
//
// pool: a number of people spread over EVERY pavement and park path in the
// city, who keep being moved (out of sight) to wherever you are, so the
// streets round you are always busy without hundreds of people to animate.

const BLEND_RADIUS = 2.4;

export class Crowd {
  /**
   * @param {THREE.Object3D} parent
   * @param {CollisionWorld} world
   * @param {{a:number[], b:number[]}[]} lanes - pavement stretches [x, z] -> [x, z]
   * @param {{perLane?:number, seed?:number, cold?:boolean}} opts - cold: dressed for snow
   */
  constructor(parent, world, lanes, { perLane = 2, seed = 3, cold = false, pool = null } = {}) {
    const rng = makeRng(seed);
    this.parent = parent;
    this.world = world;
    this.rng = rng;
    this.people = [];
    const add = (lane, t, pooled) => {
      const model = new PlayerModel(randomPerson(rng, { cold }), { bag: rng() < 0.12 });
      parent.add(model.root);
      const body = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), facing: 0, state: 'ground', horizontalSpeed: 0, mantleProgress: 0, stateTime: 0, stumbleTimer: 0, mantle: null, wallRun: null };
      const p = { lane, t, dir: rng() < 0.5 ? 1 : -1, speed: 1.1 + rng() * 0.6, pause: 0, model, body, dodge: 0, flinchCool: 0, pooled };
      this._ground(p);
      this.people.push(p);
    };
    for (const lane of lanes) for (let i = 0; i < perLane; i++) add(lane, rng(), false);
    // A pool of people round the whole city (pool.lanes: every pavement and
    // park path): they're moved, out of sight, to wherever you are.
    this.pool = pool?.lanes?.length ? pool : null;
    if (this.pool) {
      for (let i = 0; i < pool.count; i++) {
        add(this.pool.lanes[Math.floor(rng() * this.pool.lanes.length)], rng(), true);
        this.people[this.people.length - 1].home = null; // (placed near you on the first update)
      }
    }
  }

  _ground(p) {
    const { a, b } = p.lane;
    p.body.pos.set(a[0] + (b[0] - a[0]) * p.t, 0, a[1] + (b[1] - a[1]) * p.t);
    const g = this.world.groundHeight(p.body.pos.x, p.body.pos.z, 1.2);
    p.body.pos.y = Number.isFinite(g) ? g : 0;
  }

  /** Move a pooled person to a pavement near `pos` (not right in front of you). */
  _relocate(p, pos, facing, minD = 18, maxD = 60) {
    const lanes = this.pool.lanes, fx = Math.sin(facing), fz = Math.cos(facing);
    for (let tries = 0; tries < 30; tries++) {
      const lane = lanes[Math.floor(this.rng() * lanes.length)];
      const t = this.rng();
      const x = lane.a[0] + (lane.b[0] - lane.a[0]) * t, z = lane.a[1] + (lane.b[1] - lane.a[1]) * t;
      const dx = x - pos.x, dz = z - pos.z, d = Math.hypot(dx, dz);
      if (d < minD || d > maxD) continue;
      if (d < 40 && (dx * fx + dz * fz) / d > 0.35 && tries < 25) continue; // (not popping up where you're looking)
      Object.assign(p, { lane, t, dir: this.rng() < 0.5 ? 1 : -1, pause: 0, dodge: 0, dodgeTo: 0, knock: 0, robbed: false, noticeIn: 0 });
      this._ground(p);
      if (p.model.isDown) p.model.standUp?.();
      return true;
    }
    return false;
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
    // share: how many of the pooled people are out (fewer at night, all at rush hour)
    const poolN = this.pool ? this.pool.count : 0, out = Math.round(poolN * (this.share ?? 1));
    let k = 0;
    for (const p of this.people) {
      if (p.pooled && k++ >= out) {
        // At home: out of sight and out of the way
        if (!p.off) { p.off = true; p.model.root.visible = false; p.body.pos.y = -100; p.home = false; }
        continue;
      }
      if (p.off) { p.off = false; p.home = false; }
      // Pooled people far away from you come and walk somewhere near you instead
      if (p.pooled && player) {
        const d = Math.hypot(p.body.pos.x - player.pos.x, p.body.pos.z - player.pos.z);
        if (!p.home || d > 75) {
          p.home = true;
          this._relocate(p, player.pos, player.facing ?? 0, p.homeOnce ? 30 : 6, 60);
          p.homeOnce = true;
        }
        const far = d > 70;
        p.model.root.visible = !far;
        if (far) continue;
      }
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

/**
 * Shopkeepers: someone behind the counter of the shops near you (a few
 * people, moved to whichever shops you're closest to). Rob the till and
 * they flinch away from you.
 */
export class Shopkeepers {
  /**
   * @param {THREE.Object3D} parent
   * @param {{keeper: {pos: THREE.Vector3, facing: number}}[]} shops
   */
  constructor(parent, shops, { count = 3, seed = 9, cold = false } = {}) {
    const rng = makeRng(seed);
    this.shops = shops;
    this.parent = parent;
    this.staff = [];
    for (let i = 0; i < Math.min(count, shops.length); i++) {
      const model = new PlayerModel(randomPerson(rng, { cold }), { bag: false });
      model.root.visible = false;
      parent.add(model.root);
      const body = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), facing: 0, state: 'ground', horizontalSpeed: 0, mantleProgress: 0, stateTime: 0, stumbleTimer: 0, mantle: null, wallRun: null };
      this.staff.push({ model, body, shop: null });
    }
    this._t = 0;
  }

  /** The till was robbed: whoever's behind that counter flinches. */
  scare(shop, from) {
    const k = this.staff.find((s) => s.shop === shop);
    if (k) k.model.flinch(from.x, from.z);
  }

  update(dt, player) {
    // Every half second: man the nearest shops
    if ((this._t -= dt) <= 0) {
      this._t = 0.5;
      const near = this.shops
        .map((sh) => ({ sh, d: Math.hypot(sh.keeper.pos.x - player.pos.x, sh.keeper.pos.z - player.pos.z) }))
        .filter((o) => o.d < 45).sort((a, b) => a.d - b.d).slice(0, this.staff.length).map((o) => o.sh);
      for (const k of this.staff) if (k.shop && !near.includes(k.shop)) k.shop = null;
      for (const sh of near) {
        if (this.staff.some((k) => k.shop === sh)) continue;
        const k = this.staff.find((x) => !x.shop);
        if (!k) break;
        k.shop = sh;
        k.body.pos.copy(sh.keeper.pos);
        k.body.facing = sh.keeper.facing;
      }
    }
    for (const k of this.staff) {
      k.model.root.visible = !!k.shop;
      if (!k.shop) continue;
      // Watch you while you're in the shop
      const sh = k.shop;
      if (sh.inside(player.pos.x, player.pos.z) && !(k.lookT > 0)) { k.model.glance(player.pos.x, player.pos.z, 1.2); k.lookT = 1.4; }
      if (k.lookT > 0) k.lookT -= dt;
      k.body.horizontalSpeed = 0;
      k.model.update(dt, k.body);
    }
  }

  dispose() {
    for (const k of this.staff) this.parent.remove(k.model.root);
    this.staff = [];
  }
}

import * as THREE from 'three';
import { PlayerModel } from '../player/playerModel.js';
import { GUARD_LOOK } from '../player/people.js';
import { makeGlowMaterial } from '../world/materials.js';
import { admin } from '../core/admin.js';
import { owns } from '../gadgets/gadgets.js';
import { audio } from '../core/audio.js';

// Security guards for indoor heists (the casino).
//
// Each guard walks a loop of waypoints, pausing at each one to look around.
// They see in a cone in front of them (drawn on the floor): if you're inside
// it and nothing blocks the view, you're seen. Walls, slot machines and
// (when you crouch, C) low cover like card tables hide you.
//
// No pathfinding needed: routes are laid out along open floor.
// After the alarm they go on ALERT: faster, and they see further.
//
// A guard also looks like an "officer" to the gadgets: it has .pc.pos and
// .stunned (Flashbang), so the same gadget code works on it.
//
// SNEAK TAKEDOWNS: walk up behind a guard (outside their cone) and press
// the action key to knock them out. They stay down, but if another guard
// sees the body, the squad reports it (bodyFound) and the mode can raise the
// alarm. The same squad is used for police patrols in the street (uniform
// colours, and they stand on the pavement: y follows the ground).
//
// COINS: throw a coin and the guards who hear it land walk over to look
// (a "?" over their heads), look round for a few seconds, then go back to
// their rounds. Guards who hold their posts (train roofs) just turn to look.
// A "!" means they've seen you and they're hunting.
//
// FIGHTING: punched from the front, a guard sometimes BLOCKS (forearms up)
// and shoves you back; the uppercut at the end of a three-punch combo breaks
// through. A slide tackle knocks them off their feet.

const WALK = 1.9, ALERT_WALK = 3.2;   // m/s
const HALF_ANGLE = 0.5;               // radians either side (about 57 degrees wide)
const RANGE = 9, ALERT_RANGE = 12.5;  // metres
const PAUSE = 1.3;                    // seconds at each waypoint
const DISGUISE_RANGE = 3.2;           // in disguise, they only recognise you this close
// THE HUNT: the moment any of them sees you, every guard nearby turns to look
// and runs to where you were last seen. Break line of sight and stay hidden
// for HUNT_TIME seconds and they give up and go back to their rounds.
const HUNT_TIME = 8, HUNT_RADIUS = 70, HUNT_RUN = 4.3; // s, m, m/s (you can outrun them sprinting)
const HUNT_COLOR = 0xff7a1a;
const HEAR_RADIUS = 14;        // m: how far away a coin landing is heard
const LOOK_TIME = 3.5;         // s: looking round where it landed
const INVESTIGATE_WALK = 2.5;  // m/s
const BLOCK_TIME = 0.9;        // s: forearms up after blocking a punch
const _from = new THREE.Vector3(), _dir = new THREE.Vector3();

/** Turn angle a toward angle b by at most `step` radians (the short way round). */
function turnTo(a, b, step) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + Math.max(-step, Math.min(step, d));
}

/** "?" and "!" over a guard's head (drawn once, shared). */
let markTex = null;
function markTextures() {
  if (markTex) return markTex;
  const make = (ch, color) => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.font = '900 52px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 9;
    g.strokeStyle = 'rgba(0,0,0,0.8)';
    g.strokeText(ch, 32, 35);
    g.fillStyle = color;
    g.fillText(ch, 32, 35);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  markTex = { '?': make('?', '#ffd23a'), '!': make('!', '#ff7a1a') };
  return markTex;
}

export class GuardSquad {
  /**
   * @param {THREE.Scene|THREE.Group} parent
   * @param {CollisionWorld} world
   * @param {{route:number[][]}[]} defs - route = [[x, z], ...] (a loop)
   * @param {{sight?:number}} opts - sight multiplies the view range (difficulty)
   */
  constructor(parent, world, defs, { sight = 1, look = null, range = RANGE, alertRange = ALERT_RANGE, groundFrom = 1.2, chase = true } = {}) {
    this.chase = chase;   // false: they hold their posts (guards on train roofs)
    this.hunt = null;     // { pos, t }: where they last saw you, and how long ago
    this.groundFrom = groundFrom; // (how high to look for the floor: raise it for guards on train roofs)
    this.parent = parent;
    this.world = world;
    this.sight = sight;
    this.look = look;
    this.baseRange = range;
    this.alertRange = alertRange;
    this.alert = false;
    this.bodyFound = null;
    this.units = defs.map((d, i) => this._make(d, i));
  }

  _make(def, i) {
    // (each guard gets a different face and build)
    const SKIN = [0xc4946f, 0xe0b090, 0x8d5a3b, 0xf0c8a8, 0x5a3a24], HAIR = [0x1a1410, 0x3a2416, 0x6a4422, 0x8a8680];
    const look = this.look || GUARD_LOOK;
    const model = new PlayerModel({ skin: SKIN[i % 5], hair: HAIR[(i * 3) % 4], ...look }, {
      bag: false, style: { beard: [null, 'moustache', null, 'stubble'][i % 4], hair: ['short', 'buzz', 'short', 'bald'][(i * 7) % 4], build: 0.96 + ((i * 37) % 5) * 0.04, ...look.style },
    });
    this.parent.add(model.root);
    // Vision cone on the floor (a fan)
    const geo = new THREE.CircleGeometry(1, 24, -HALF_ANGLE, HALF_ANGLE * 2);
    geo.rotateX(-Math.PI / 2);
    geo.rotateY(-Math.PI / 2); // fan points along +Z (the way the model faces)
    const cone = new THREE.Mesh(geo, makeGlowMaterial(0xffd23a, 0.16));
    cone.position.y = 0.04;
    this.parent.add(cone);
    // "?" (heard something) or "!" (seen you) over their head
    const mark = new THREE.Sprite(new THREE.SpriteMaterial({ map: markTextures()['?'], transparent: true, depthWrite: false, fog: false }));
    mark.scale.setScalar(0.55);
    mark.position.y = 2.3;
    mark.visible = false;
    model.root.add(mark);
    const [x, z] = def.route[0];
    const body = {
      pos: new THREE.Vector3(x, this._y(x, z), z), vel: new THREE.Vector3(), facing: 0, state: 'ground', horizontalSpeed: 0,
      mantleProgress: 0, stateTime: 0, stumbleTimer: 0, mantle: null, wallRun: null,
    };
    const [nx, nz] = def.route[1 % def.route.length];
    body.facing = Math.atan2(nx - x, nz - z);
    return { route: def.route, leg: 0, wait: PAUSE * (i % 2), look: 0, baseFacing: body.facing, model, cone, mark, pc: body, stunned: 0, waitTimer: 0, seesPlayer: false,
      investigate: null, block: 0, counter: 0, trip: 0 };
  }

  /** Floor height under a point (0 indoors; the pavement outside). */
  _y(x, z) {
    const g = this.world.groundHeight(x, z, this.groundFrom);
    return Number.isFinite(g) && g > -1 ? g : 0;
  }

  /** Back to their starting posts (after a restart). Knocked-out guards get up. */
  reset() {
    this.alert = false;
    this.bodyFound = null;
    this._endHunt();
    this.units.forEach((u, i) => {
      const [x, z] = u.route[0];
      u.pc.pos.set(x, this._y(x, z), z);
      u.down = false;
      u.found = false;
      u.model.root.rotation.set(0, 0, 0);
      const [nx, nz] = u.route[1 % u.route.length];
      u.pc.facing = u.baseFacing = Math.atan2(nx - x, nz - z);
      u.leg = 0;
      u.wait = PAUSE * (i % 2);
      u.stunned = 0;
      u.seesPlayer = false;
      u.investigate = null;
      u.block = u.counter = u.trip = 0;
      this._mark(u, null);
    });
  }

  setAlert(on) {
    this.alert = on;
    this._coneColors();
  }

  _coneColors() {
    for (const u of this.units) u.cone.material.color.setHex(this.alert ? 0xff3346 : u.hunting ? HUNT_COLOR : 0xffd23a);
  }

  /** Are they hunting for you right now? (any of them saw you in the last few seconds) */
  get hunting() { return !!this.hunt; }
  /** Seconds until they give up (0 if they aren't hunting). */
  get huntLeft() { return this.hunt ? Math.max(0, HUNT_TIME - this.hunt.t) : 0; }

  /**
   * Something saw you at `pos` (one of them, a searchlight, a camera): everyone
   * within range drops their rounds and comes running.
   */
  alarmAt(pos) {
    if (!this.chase) return;
    const fresh = !this.hunt;
    this.hunt ||= { pos: new THREE.Vector3(), t: 0 };
    this.hunt.pos.copy(pos);
    this.hunt.t = 0;
    if (fresh) this.huntStarted = true; // (the mode shows a warning once)
    for (const u of this.units) {
      if (u.down || u.hunting) continue;
      if (Math.hypot(u.pc.pos.x - pos.x, u.pc.pos.z - pos.z) < HUNT_RADIUS) { u.hunting = true; u.wait = 0; u.stuck = 0; u.investigate = null; }
    }
    this._coneColors();
  }

  _endHunt() {
    this.hunt = null;
    for (const u of this.units) { u.hunting = false; u.homing = false; }
    this._coneColors?.();
  }

  /** Walk toward (tx, tz), sliding along walls instead of walking through them. Returns metres moved. */
  _step(u, tx, tz, dist) {
    const b = u.pc.pos, dx = tx - b.x, dz = tz - b.z, d = Math.hypot(dx, dz);
    if (d < 0.05) return 0;
    const sx = (dx / d) * Math.min(dist, d), sz = (dz / d) * Math.min(dist, d);
    const free = (x, z) => !this.world.query(x - 0.3, b.y + 0.4, z - 0.3, x + 0.3, b.y + 1.6, z + 0.3, this._q || (this._q = [])).some((q) => !q.disabled);
    const x0 = b.x, z0 = b.z;
    if (free(b.x + sx, b.z)) b.x += sx;
    if (free(b.x, b.z + sz)) b.z += sz;
    const g = this._y(b.x, b.z);
    if (Math.abs(g - b.y) < 1.2) b.y = g; else { b.x = x0; b.z = z0; } // (no walking off ledges)
    return Math.hypot(b.x - x0, b.z - z0);
  }

  get range() {
    return (this.alert ? this.alertRange : this.baseRange) * this.sight * (owns('quiet') ? 0.75 : 1); // (Ninja Kit)
  }

  /**
   * The guard you could knock out right now: close, standing, not stunned,
   * and you're behind them (outside their view). Or null.
   */
  takedownTarget(player) {
    const p = player.pos;
    for (const u of this.units) {
      if (u.down) continue;
      const b = u.pc, dx = p.x - b.pos.x, dz = p.z - b.pos.z, d = Math.hypot(dx, dz);
      if (d > 1.9 || Math.abs(p.y - b.pos.y) > 1.2) continue;
      let a = Math.atan2(dx, dz) - b.facing;
      while (a > Math.PI) a -= Math.PI * 2;
      while (a < -Math.PI) a += Math.PI * 2;
      if (Math.abs(a) > 1.9 || u.stunned > 0) return u; // behind them (or dazed by a flashbang)
    }
    return null;
  }

  /** Knock a guard out: they drop and stay down until the level restarts. */
  takedown(u) {
    u.down = true;
    u.seesPlayer = false;
    u.cone.visible = false;
    u.investigate = null;
    u.block = u.counter = u.trip = 0;
    this._mark(u, null);
    u.pc.horizontalSpeed = 0;
    u.model.update(0, u.pc);
    u.model.root.rotation.x = -Math.PI / 2; // (lying on the floor)
    u.model.root.position.y = u.pc.pos.y + 0.25;
  }

  get downCount() { return this.units.filter((u) => u.down).length; }

  /** Is `pos` behind this guard (outside their view)? */
  isBehind(u, pos) {
    let a = Math.atan2(pos.x - u.pc.pos.x, pos.z - u.pc.pos.z) - u.pc.facing;
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return Math.abs(a) > 1.9;
  }

  /**
   * A noise at `pos` (a coin landing): the guards who hear it walk over to
   * look (guards who hold their posts just turn to look). Returns how many heard.
   */
  hear(pos, radius = HEAR_RADIUS) {
    let n = 0;
    for (const u of this.units) {
      if (u.down || u.hunting) continue;
      const d = Math.hypot(u.pc.pos.x - pos.x, u.pc.pos.z - pos.z);
      if (d > radius || Math.abs(u.pc.pos.y - pos.y) > 3.5) continue;
      u.investigate = { pos: pos.clone(), t: 0, react: 0.3 + Math.random() * 0.35, arrived: false, look: 0, stay: !this.chase, stuck: 0, base: null };
      u.homing = false;
      n++;
    }
    return n;
  }

  /**
   * You punched this guard. behind: a sneak hit from behind; heavy: the
   * uppercut at the end of a combo; blockChance: how often they block.
   * Returns 'ko' (out cold), 'stun' (dazed: hit again to finish), 'block',
   * or 'break' (the uppercut smashed through their block: dazed).
   */
  punched(u, { behind = false, heavy = false, blockChance = 0.35 } = {}) {
    if (behind || u.stunned > 0) { this.takedown(u); return 'ko'; }
    if (u.block > 0) {
      if (!heavy) { u.block = Math.max(u.block, 0.4); u.model.block(u.block); return 'block'; }
      u.block = u.counter = 0;
      u.model.blockT = 0;
      u.stunned = 2.4;
      u.model.hit(0.4);
      return 'break';
    }
    if (Math.random() < blockChance * (this.alert || u.hunting ? 1.35 : 1)) {
      u.block = BLOCK_TIME;
      u.model.block(BLOCK_TIME);
      u.counter = 0.32; // (then they shove you back)
      return 'block';
    }
    u.stunned = Math.max(u.stunned || 0, heavy ? 2.8 : 2.3);
    u.model.hit(0.3);
    return 'stun';
  }

  /** Slide-tackled: knocked off their feet, then dazed. From behind: out cold. */
  trip(u, behind) {
    if (behind) { this.takedown(u); return 'ko'; }
    u.block = u.counter = 0;
    u.investigate = null;
    u.stunned = Math.max(u.stunned || 0, 2.8);
    u.trip = 1.2;
    return 'trip';
  }

  _mark(u, ch) {
    if (!ch) { if (u.mark.visible) u.mark.visible = false; return; }
    u.mark.visible = true;
    const tex = markTextures()[ch];
    if (u.mark.material.map !== tex) { u.mark.material.map = tex; u.mark.material.needsUpdate = true; }
  }

  /** Heard a coin: turn toward it, walk over, look round, then back to work. */
  _investigate(u, dt) {
    const b = u.pc, iv = u.investigate;
    const want = Math.atan2(iv.pos.x - b.pos.x, iv.pos.z - b.pos.z);
    const d = Math.hypot(iv.pos.x - b.pos.x, iv.pos.z - b.pos.z);
    iv.t += dt;
    b.horizontalSpeed = 0;
    if (iv.react > 0) { iv.react -= dt; b.facing = turnTo(b.facing, want, 7 * dt); return; } // (a moment to react)
    if (!iv.arrived && !iv.stay && d > 1.2 && iv.t < 14) {
      const moved = this._step(u, iv.pos.x, iv.pos.z, INVESTIGATE_WALK * dt);
      b.facing = turnTo(b.facing, want, 8 * dt);
      b.horizontalSpeed = moved > 0.001 ? INVESTIGATE_WALK : 0;
      iv.stuck = moved < INVESTIGATE_WALK * dt * 0.25 ? iv.stuck + dt : 0;
      if (iv.stuck > 1.2) iv.arrived = true; // (can't get there: look from here)
      return;
    }
    if (!iv.arrived || iv.base == null) { iv.arrived = true; iv.base = iv.stay || d > 1.2 ? want : b.facing; }
    iv.look += dt;
    b.facing = turnTo(b.facing, iv.base + Math.sin(iv.look * 1.9) * (iv.stay ? 0.35 : 1.1), 6 * dt);
    if (iv.look > LOOK_TIME) {
      u.investigate = null;
      if (iv.stay) { u.wait = PAUSE; u.look = 0; } // (back to watching from their post)
      else { u.homing = true; u.stuck = 0; }
    }
  }

  /**
   * Move everyone along their routes and check who can see the target.
   * @param {object} player - the PlayerController (pos, height)
   * @param {boolean} hidden - smoke bomb / invisibility: nobody can see
   * @param {{closeOnly?:boolean}} opts - closeOnly: you're in disguise, so
   *   they only notice you close up (they know every face on the staff)
   * @returns {boolean} true if any guard sees the player
   */
  update(dt, player, hidden = false, { closeOnly = false } = {}) {
    let seen = false;
    if (this.hunt && (this.hunt.t += dt) > HUNT_TIME) {
      for (const u of this.units) if (u.hunting) { u.hunting = false; u.homing = !u.down; u.stuck = 0; }
      this.hunt = null;
      this.huntEnded = true; // (the mode can say "they've given up")
      this._coneColors();
    }
    for (const u of this.units) {
      const b = u.pc;
      if (u.down) continue;
      if (u.stunned > 0) {
        // Dazed (a punch, a flashbang): stand still, cone off
        u.stunned -= dt;
        b.horizontalSpeed = 0;
        u.cone.visible = false;
        u.model.update(dt, b);
        if (u.trip > 0) {
          // Slide-tackled: on the floor for a moment, then back up
          u.trip -= dt;
          const down = u.trip > 0.35;
          u.model.root.rotation.x = down ? -Math.PI / 2 : 0;
          u.model.root.position.y = b.pos.y + (down ? 0.25 : 0);
        }
        this._mark(u, null);
        continue;
      }
      u.cone.visible = true;
      if (u.block > 0) u.block -= dt;
      if (u.counter > 0 && (u.counter -= dt) <= 0) {
        // After blocking: a shove (the mode pushes you back if you're still close)
        u.model.punch('cross');
        this.shove = u;
      }
      if (u.block > 0 || u.counter > 0) {
        // Blocking: stand and face you
        b.horizontalSpeed = 0;
        b.facing = turnTo(b.facing, Math.atan2(player.pos.x - b.pos.x, player.pos.z - b.pos.z), 10 * dt);
      } else if (u.hunting && this.hunt) {
        // Running to where you were last seen, then looking around for you
        const h = this.hunt.pos, d = Math.hypot(h.x - b.pos.x, h.z - b.pos.z);
        if (d > 1.2) {
          const moved = this._step(u, h.x, h.z, HUNT_RUN * dt);
          b.facing = Math.atan2(h.x - b.pos.x, h.z - b.pos.z);
          b.horizontalSpeed = moved > 0.001 ? HUNT_RUN : 0;
          if (moved < HUNT_RUN * dt * 0.2) { u.look += dt; b.facing += Math.sin(u.look * 2.2) * 0.9; } // (blocked: look around)
        } else {
          u.look += dt;
          b.horizontalSpeed = 0;
          b.facing = (u.baseFacing ?? b.facing) + Math.sin(u.look * 1.8) * 1.4;
        }
        u.baseFacing = d > 1.2 ? b.facing : u.baseFacing;
      } else if (u.investigate) {
        this._investigate(u, dt);
      } else if (u.homing) {
        // Hunt over: back to their rounds (if they get stuck, they just reappear at their post)
        const [hx, hz] = u.route[u.leg];
        const moved = this._step(u, hx, hz, WALK * 1.3 * dt);
        b.facing = Math.atan2(hx - b.pos.x, hz - b.pos.z);
        b.horizontalSpeed = WALK * 1.3;
        u.stuck = moved < WALK * dt * 0.3 ? (u.stuck || 0) + dt : 0;
        if (Math.hypot(hx - b.pos.x, hz - b.pos.z) < 0.5 || u.stuck > 2.5) {
          b.pos.set(hx, this._y(hx, hz), hz);
          u.homing = false;
          u.wait = PAUSE;
        }
      } else if (u.wait > 0) {
        // Paused at a waypoint: look left and right
        u.wait -= dt;
        u.look += dt;
        b.horizontalSpeed = 0;
        b.facing = u.baseFacing + Math.sin(u.look * 1.6) * 0.7;
      } else {
        const next = u.route[(u.leg + 1) % u.route.length];
        const dx = next[0] - b.pos.x, dz = next[1] - b.pos.z, d = Math.hypot(dx, dz);
        const step = (this.alert ? ALERT_WALK : WALK) * dt;
        if (d <= step) {
          b.pos.set(next[0], this._y(next[0], next[1]), next[1]);
          u.leg = (u.leg + 1) % u.route.length;
          u.wait = this.alert ? PAUSE * 0.4 : PAUSE;
          u.look = 0;
          u.baseFacing = Math.atan2(dx, dz);
        } else {
          b.pos.x += (dx / d) * step;
          b.pos.z += (dz / d) * step;
          b.pos.y = this._y(b.pos.x, b.pos.z);
          b.facing = Math.atan2(dx, dz);
          u.baseFacing = b.facing;
        }
        b.horizontalSpeed = this.alert ? ALERT_WALK : WALK;
      }
      u.model.update(dt, b);
      u.cone.position.set(b.pos.x, b.pos.y + 0.04, b.pos.z);
      u.cone.rotation.y = b.facing;
      const r = this.range;
      u.cone.scale.setScalar(r);
      u.seesPlayer = !hidden && !admin.flag('unseen') && this._sees(u, player, closeOnly ? Math.min(r, DISGUISE_RANGE) : r);
      if (u.seesPlayer) { seen = true; this.alarmAt(player.pos); }
      this._mark(u, u.hunting && this.hunt ? '!' : u.investigate ? '?' : null);
      // Spotting a knocked-out colleague
      for (const o of this.units) {
        if (o.down && !o.found && this._sees(u, { pos: o.pc.pos, height: 0.5 }, r)) { o.found = true; this.bodyFound = o; }
      }
    }
    return seen;
  }

  /** Can this guard see the player? (cone, range, and a clear line of sight) */
  _sees(u, player, range) {
    const b = u.pc, p = player.pos;
    const dx = p.x - b.pos.x, dz = p.z - b.pos.z, d = Math.hypot(dx, dz);
    if (d > range || Math.abs(p.y - b.pos.y) > 3) return false;
    // Angle between where the guard faces and the player
    let a = Math.atan2(dx, dz) - b.facing;
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    if (Math.abs(a) > HALF_ANGLE && d > 1.2) return false; // (right next to them, they notice anyway)
    // Line of sight from the guard's eyes to your chest - or your head if
    // you're crouching, which is how low cover (card tables) hides you.
    const crouched = player.height < 1.3;
    _from.set(b.pos.x, b.pos.y + 1.65, b.pos.z);
    _dir.set(p.x, p.y + (crouched ? 0.75 : 1.3), p.z).sub(_from);
    const len = _dir.length();
    _dir.divideScalar(len);
    return !(this.world.raycast(_from, _dir, len - 0.35) < len - 0.35);
  }

  dispose() {
    for (const u of this.units) { this.parent.remove(u.model.root); this.parent.remove(u.cone); }
    this.units = [];
  }
}

/**
 * The hunt's messages for a mode: a warning when it starts, "they gave up" when
 * it ends, and (while it's on) a line for the meter. Returns that line, or null.
 * @param {GuardSquad} squad
 * @param {string} who - 'guards', 'police', 'bounty hunters'...
 */
export function huntMessages(squad, hud, who = 'guards') {
  if (!squad) return null;
  if (squad.huntStarted) {
    squad.huntStarted = false;
    hud.toast('You\'ve been seen!', `All the ${who} nearby are coming. Break line of sight and hide: they give up after ${HUNT_TIME} seconds.`, 'var(--red)', 4);
    audio.sfx('sting', { vol: 0.45 });
  }
  if (squad.huntEnded) {
    squad.huntEnded = false;
    hud.toast('They gave up', `The ${who} are going back to their rounds.`, 'var(--safe)', 2.5);
  }
  return squad.hunting ? `They're looking for you! Stay hidden: ${Math.ceil(squad.huntLeft)}s` : null;
}

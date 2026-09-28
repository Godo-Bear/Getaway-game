import * as THREE from 'three';
import { clamp, easeOutCubic, easeInOut, dampAngle } from '../core/utils.js';

// The on-foot player controller: movement physics and parkour moves.
//
// The player's body is an invisible upright box ("collider"):
//   - `pos` is the centre of the FEET
//   - width = 2 * RADIUS, height = HEIGHT
// Every physics step we move the box one axis at a time (X, then Z, then Y)
// and push it back out of anything it ends up inside. Moving one axis at a
// time is what lets you slide smoothly along walls.
//
// The controller is a small state machine:
//   ground -> air (jump / walk off an edge)
//   ground/air -> mantle (climb a ledge, or vault a low obstacle)
//   air -> roll (hard landing while moving)

/** All the numbers that define how movement feels. Tweak these! */
export const TUNING = {
  radius: 0.32,
  height: 1.8,

  runSpeed: 6.5,       // m/s
  sprintSpeed: 10.5,   // m/s (the helicopter will be slower than this)
  backSpeedFactor: 0.75,
  groundAccel: 55,     // how quickly you reach full speed (m/s^2)
  groundDecel: 45,     // how quickly you stop when you let go
  turnAccel: 90,       // extra grip when changing direction sharply
  airAccel: 16,        // air control: small, so jumps still commit you

  gravity: 26,         // m/s^2 (a bit more than real life = snappier jumps)
  jumpSpeed: 9.4,      // initial upward speed -> about 1.7 m high jump
  maxFallSpeed: 45,
  jumpCutFactor: 0.55, // releasing jump early cuts the jump short (variable height)

  coyoteTime: 0.12,    // can still jump this long after running off an edge
  jumpBuffer: 0.15,    // jump pressed this early before landing still counts

  stepHeight: 0.45,    // small steps (kerbs, roof edges) are walked up automatically

  mantleMinRise: 0.5,  // ledge must be at least this high to need a mantle
  mantleMaxRise: 2.7,  // highest ledge you can climb from standing
  airGrabMaxRise: 2.1, // highest ledge (above feet) you can catch mid-air
  vaultMaxRise: 1.3,   // obstacles lower than this are vaulted automatically at speed
  vaultMinSpeed: 5.5,

  rollImpactSpeed: 13, // fall speed (m/s) that counts as a hard landing (~3.3 m drop)
  rollDuration: 0.55,
  stumbleDuration: 0.35,
};

const T = TUNING;
const EPS = 0.001;

export class PlayerController {
  constructor(world) {
    this.world = world;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.facing = 0;        // yaw the character model faces (radians)
    this.state = 'air';     // ground | air | mantle | roll
    this.grounded = false;
    this.sprinting = false;

    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.jumpHeld = false;
    this.stateTime = 0;     // seconds spent in the current state
    this.stumbleTimer = 0;
    this.lastGroundY = 0;   // height of the last surface we stood on

    this.mantle = null;     // { from, to, duration, t, vault, keepSpeed }

    // Events for other systems (camera dip, sounds, animation) to react to.
    // Filled during update(), read and cleared by whoever owns the player.
    this.events = [];

    this._wish = new THREE.Vector3();
    this._facing = new THREE.Vector3();
    this._hits = [];
  }

  /** Place the player (e.g. at a checkpoint) and reset all motion. */
  teleport(x, y, z, facing = 0) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.facing = facing;
    this.state = 'air';
    this.grounded = false;
    this.mantle = null;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.stumbleTimer = 0;
    this.lastGroundY = y;
  }

  get horizontalSpeed() {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  _setState(s) {
    if (this.state !== s) {
      this.state = s;
      this.stateTime = 0;
    }
  }

  /**
   * One physics step.
   * @param {number} dt - seconds (small, e.g. 1/120)
   * @param {object} ctl - { moveX, moveZ (-1..1, camera-relative), camForward, camRight,
   *                        jumpPressed, jumpHeld, sprint }
   */
  update(dt, ctl) {
    this.stateTime += dt;

    // --- Timers for forgiving jumps -------------------------------------
    if (ctl.jumpPressed) this.jumpBufferTimer = T.jumpBuffer;
    else this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);
    this.coyoteTimer = this.grounded ? T.coyoteTime : Math.max(0, this.coyoteTimer - dt);
    this.stumbleTimer = Math.max(0, this.stumbleTimer - dt);

    // --- Which way does the player want to go? (camera-relative) --------
    const wish = this._wish
      .copy(ctl.camForward).multiplyScalar(ctl.moveZ)
      .addScaledVector(ctl.camRight, ctl.moveX);
    let wishLen = wish.length();
    if (wishLen > 1) { wish.divideScalar(wishLen); wishLen = 1; }
    this.sprinting = ctl.sprint && wishLen > 0.1 && ctl.moveZ > -0.1;

    if (this.state === 'mantle') {
      this._updateMantle(dt);
      return;
    }

    // --- Horizontal movement ----------------------------------------------
    let targetSpeed = this.sprinting ? T.sprintSpeed : T.runSpeed;
    if (ctl.moveZ < -0.1 && Math.abs(ctl.moveX) < 0.5) targetSpeed *= T.backSpeedFactor;
    if (this.stumbleTimer > 0) targetSpeed *= 0.35;

    const onGround = this.grounded;
    if (onGround && this.state !== 'roll') {
      this._accelerate(wish, wishLen, targetSpeed, dt, true);
    } else if (this.state === 'roll') {
      // Rolling keeps your momentum; you can only steer a little.
      this._accelerate(wish, wishLen, Math.max(targetSpeed, this.horizontalSpeed), dt * 0.3, false);
      if (this.stateTime > T.rollDuration) this._setState('ground');
    } else {
      // Air control: steer, but never lose momentum you already have.
      const airTarget = Math.max(targetSpeed, this.horizontalSpeed);
      this._accelerate(wish, wishLen, airTarget, dt, false);
    }

    // --- Parkour checks (before jumping, so jump-into-wall climbs instead) --
    // If there's no stick input, use the way the character is facing
    // (so pressing jump while standing at a ledge still climbs it).
    const moveDir = wishLen > 0.2 ? wish : this._facingDir();
    if (this._tryParkour(moveDir, wishLen, ctl)) return;

    // --- Jumping ----------------------------------------------------------
    if (this.jumpBufferTimer > 0 && this.coyoteTimer > 0 && this.state !== 'roll') {
      this.vel.y = T.jumpSpeed;
      this.grounded = false;
      this.coyoteTimer = 0;
      this.jumpBufferTimer = 0;
      this.jumpHeld = true;
      this._setState('air');
      this.events.push({ type: 'jump' });
    }
    // Variable jump height: let go of jump early and you start falling sooner.
    if (this.jumpHeld && !ctl.jumpHeld) {
      if (this.vel.y > 0) this.vel.y *= T.jumpCutFactor;
      this.jumpHeld = false;
    }

    // --- Gravity ------------------------------------------------------------
    this.vel.y = Math.max(this.vel.y - T.gravity * dt, -T.maxFallSpeed);

    // --- Move and collide, one axis at a time --------------------------------
    const fallSpeed = -this.vel.y;
    const wasGrounded = this.grounded;
    this._moveAxis('x', this.vel.x * dt);
    this._moveAxis('z', this.vel.z * dt);
    this._moveY(this.vel.y * dt);

    if (this.grounded && !wasGrounded) this._onLand(fallSpeed);
    if (this.grounded) this.lastGroundY = this.pos.y;
    if (!this.grounded && this.state === 'ground') this._setState('air');

    // --- Turn the character to face where it's going ------------------------
    if (this.horizontalSpeed > 0.6) {
      const target = Math.atan2(this.vel.x, this.vel.z);
      this.facing = dampAngle(this.facing, target, onGround ? 14 : 5, dt);
    }
  }

  _facingDir() {
    return this._facing.set(Math.sin(this.facing), 0, Math.cos(this.facing));
  }

  /** Accelerate horizontal velocity toward wish * speed. */
  _accelerate(wish, wishLen, speed, dt, onGround) {
    const tx = wish.x * speed, tz = wish.z * speed;
    let dx = tx - this.vel.x, dz = tz - this.vel.z;
    let rate;
    if (onGround) {
      if (wishLen < 0.05) rate = T.groundDecel;
      else {
        // Turning sharply (target opposes current velocity) gets extra grip.
        const dot = this.vel.x * wish.x + this.vel.z * wish.z;
        rate = dot < 0 ? T.turnAccel : T.groundAccel;
      }
    } else {
      if (wishLen < 0.05) return; // no input in the air = keep momentum
      rate = T.airAccel;
    }
    const len = Math.hypot(dx, dz);
    const max = rate * dt;
    if (len > max) { dx *= max / len; dz *= max / len; }
    this.vel.x += dx;
    this.vel.z += dz;
  }

  // ---------------------------------------------------------------------
  // Collision
  // ---------------------------------------------------------------------

  /** Query boxes overlapping the player's collider at position p (optional height). */
  _overlapsAt(x, y, z, height = T.height, shrink = 0) {
    const r = T.radius - shrink;
    return this.world.query(x - r, y + shrink, z - r, x + r, y + height - shrink, z + r, this._hits);
  }

  _moveAxis(axis, amount) {
    if (amount === 0) return;
    const p = this.pos;
    p[axis] += amount;
    const hits = this._overlapsAt(p.x, p.y, p.z);
    if (hits.length === 0) return;

    // Step up small ledges (kerbs, roof lips) automatically while walking.
    if (this.grounded || this.coyoteTimer > 0) {
      let top = -Infinity;
      for (const b of hits) top = Math.max(top, b.max.y);
      const rise = top - p.y;
      if (rise > 0 && rise <= T.stepHeight &&
          this._overlapsAt(p.x, top + EPS, p.z).length === 0) {
        p.y = top + EPS;
        return;
      }
    }

    // Otherwise push back out of every box we're now inside.
    for (const b of this._overlapsAt(p.x, p.y, p.z).slice()) {
      if (amount > 0) p[axis] = Math.min(p[axis], b.min[axis] - T.radius - EPS);
      else p[axis] = Math.max(p[axis], b.max[axis] + T.radius + EPS);
    }
    this.vel[axis] = 0;
  }

  _moveY(amount) {
    const p = this.pos;
    p.y += amount;
    this.grounded = false;
    const hits = this._overlapsAt(p.x, p.y, p.z);
    if (hits.length === 0) {
      // Tiny "ground probe": if we're walking and the ground is just below,
      // stick to it (stops you bouncing off when walking down small steps).
      return;
    }
    for (const b of hits.slice()) {
      if (amount <= 0) {
        p.y = Math.max(p.y, b.max.y);
        this.grounded = true;
      } else {
        p.y = Math.min(p.y, b.min.y - T.height - EPS);
      }
    }
    this.vel.y = 0;
  }

  _onLand(impact) {
    this.events.push({ type: 'land', impact });
    if (impact > T.rollImpactSpeed) {
      if (this.horizontalSpeed > 3) {
        // Parkour roll: turn the impact into forward momentum.
        this._setState('roll');
        const s = this.horizontalSpeed;
        const keep = Math.min(s * 1.05, T.sprintSpeed);
        this.vel.x *= keep / s;
        this.vel.z *= keep / s;
        this.events.push({ type: 'roll' });
        return;
      }
      // Standing still when you hit the ground hard: short stumble.
      this.stumbleTimer = T.stumbleDuration;
      this.events.push({ type: 'stumble' });
    }
    this._setState('ground');
  }

  // ---------------------------------------------------------------------
  // Parkour: mantle (climb up) and vault (hop over)
  // ---------------------------------------------------------------------

  /**
   * Look for a ledge just in front of the player in direction `dir`.
   * Returns { top, target } or null.
   *   top    - height of the ledge surface
   *   target - where the feet will end up after climbing
   */
  findLedge(dir, minRise, maxRise) {
    const p = this.pos;
    const reach = T.radius + 0.35;
    const px = p.x + dir.x * reach, pz = p.z + dir.z * reach;

    // A thin vertical "probe" column in front of the player, from knee
    // height up to the highest ledge we could reach.
    const hits = this.world.query(
      px - 0.12, p.y + 0.05, pz - 0.12,
      px + 0.12, p.y + maxRise + 0.6, pz + 0.12, this._hits);
    if (hits.length === 0) return null;

    // The ledge is the top of whatever is in front. If it's too tall
    // (a wall that keeps going up) we can't climb it.
    let top = -Infinity;
    for (const b of hits) top = Math.max(top, b.max.y);
    const rise = top - p.y;
    if (rise < minRise || rise > maxRise) return null;

    // Nothing overhead blocking the climb (e.g. a beam just above your head).
    const r = T.radius - 0.05;
    if (this.world.query(p.x - r, p.y + T.height, p.z - r,
      p.x + r, top + T.height, p.z + r, this._hits).length > 0) {
      return null;
    }

    // Is there room to stand on top? Try a little way in first, then further.
    for (const inset of [0.55, 0.85]) {
      const tx = p.x + dir.x * (T.radius + inset);
      const tz = p.z + dir.z * (T.radius + inset);
      if (this._overlapsAt(tx, top + 0.02, tz, T.height, 0.02).length > 0) continue;
      // Safety: never auto-climb over something with a big drop behind it
      // (like a parapet at the edge of a roof). To leap a gap, you jump.
      const below = this.world.groundHeight(tx, tz, top + 0.05);
      if (below < top - 3.5) return null;
      // Is there a big drop just beyond the ledge? (e.g. a thin parapet on a
      // roof edge). Then we may climb onto it, but never auto-vault over it.
      const ahead = this.world.groundHeight(tx + dir.x * 0.9, tz + dir.z * 0.9, top + 0.05);
      const dropAhead = ahead < top - 3.5;
      return { top, target: new THREE.Vector3(tx, top + 0.02, tz), rise, dropAhead };
    }
    return null;
  }

  _tryParkour(dir, wishLen, ctl) {
    if (this.state === 'roll') return false;
    const moving = wishLen > 0.5;
    const inAir = !this.grounded;

    // 1) Vault: running fast into a low obstacle hops over/onto it automatically.
    if (!inAir && moving && this.horizontalSpeed > T.vaultMinSpeed) {
      const ledge = this.findLedge(dir, T.stepHeight + 0.01, T.vaultMaxRise);
      if (ledge && !ledge.dropAhead) {
        this._startMantle(ledge, { vault: true, dir });
        return true;
      }
    }

    // 2) Mantle from the ground: press jump facing a ledge up to 2.7 m.
    if (!inAir && this.jumpBufferTimer > 0) {
      const ledge = this.findLedge(dir, T.mantleMinRise, T.mantleMaxRise);
      if (ledge) {
        this._startMantle(ledge, { vault: false, dir });
        return true;
      }
    }

    // 3) Ledge grab in the air: moving toward a ledge within arm's reach.
    if (inAir && moving && this.vel.y < 6) {
      const ledge = this.findLedge(dir, 0.35, T.airGrabMaxRise);
      // Limit: you can't jump-then-grab your way up a wall taller than a
      // standing mantle (measured from where you last stood).
      if (ledge && ledge.top - this.lastGroundY <= T.mantleMaxRise + 0.15) {
        this._startMantle(ledge, { vault: false, dir, fromAir: true });
        return true;
      }
    }
    return false;
  }

  _startMantle(ledge, { vault, dir, fromAir = false }) {
    const speed = this.horizontalSpeed;
    // Bigger climbs take longer; vaults are quick.
    const duration = vault ? 0.2 + ledge.rise * 0.08 : 0.28 + ledge.rise * 0.1;
    this.mantle = {
      from: this.pos.clone(),
      to: ledge.target,
      duration,
      t: 0,
      vault,
      // After a vault you keep running; after a climb you start slower.
      // (and if there's a drop right after the ledge, stop dead on top of it).
      exitSpeed: ledge.dropAhead ? 0 : vault ? Math.max(speed, T.runSpeed) : Math.min(speed, T.runSpeed) * 0.6,
      dirX: dir.x,
      dirZ: dir.z,
    };
    this.facing = Math.atan2(dir.x, dir.z);
    this.vel.set(0, 0, 0);
    this.grounded = false;
    this.jumpBufferTimer = 0;
    this.coyoteTimer = 0;
    this._setState('mantle');
    this.events.push({ type: vault ? 'vault' : 'mantle', rise: ledge.rise, fromAir });
  }

  _updateMantle(dt) {
    const m = this.mantle;
    m.t += dt;
    const k = clamp(m.t / m.duration, 0, 1);
    // Two overlapping phases: rise up first, then move forward over the edge.
    const up = easeOutCubic(clamp(k / 0.65, 0, 1));
    const fwd = easeInOut(clamp((k - 0.25) / 0.75, 0, 1));
    this.pos.set(
      m.from.x + (m.to.x - m.from.x) * fwd,
      m.from.y + (m.to.y - m.from.y) * up,
      m.from.z + (m.to.z - m.from.z) * fwd,
    );
    if (k >= 1) {
      this.mantle = null;
      this.vel.set(m.dirX * m.exitSpeed, 0, m.dirZ * m.exitSpeed);
      this.grounded = true;
      this.lastGroundY = this.pos.y;
      this.coyoteTimer = T.coyoteTime;
      this._setState('ground');
    }
  }

  /** 0..1 progress through the current mantle (for animation). */
  get mantleProgress() {
    return this.mantle ? clamp(this.mantle.t / this.mantle.duration, 0, 1) : 0;
  }
}

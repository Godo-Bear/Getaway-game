import * as THREE from 'three';
import { clamp, damp, easeOutCubic, easeInOut, dampAngle } from '../core/utils.js';

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
//   ground -> slide (crouch while sprinting: shorter body, slips under pipes)
//   ground -> crouch (crouch while slow, or stuck under something low)
//   air -> wallrun (jump alongside a tall wall: run along it, jump off it)
//   any -> zip (jump into a zip line cable: ride it either way, like Fortnite)
//   ground -> ladder (walk into a ladder on a building: climb up to the roof)

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

  crouchHeight: 0.95,  // body height while sliding / crouching
  crouchSpeed: 2.8,
  slideMinSpeed: 6,    // need to be running this fast to slide
  slideFriction: 5,    // m/s lost per second while sliding
  slideMaxTime: 1.1,

  wallRunMinSpeed: 5.5,
  wallRunTime: 1.15,   // max seconds on a wall
  wallRunGravity: 7,   // much lighter gravity while wall-running
  wallJumpOut: 6.5,    // push away from the wall when jumping off
  wallJumpUp: 8.5,

  zipGrab: 1.1,        // how close your hands must be to the cable
  zipHang: 2.0,        // feet hang this far below the cable
  zipMinSpeed: 9,       // the cable pulls you along, even uphill
  zipMaxSpeed: 20,

  ladderSpeed: 3.6,    // m/s climbing (faster while sprinting)
  ladderSprintSpeed: 5.5,
  ladderReach: 3,      // you can only grab a ladder near its bottom (from the street)

  glideFallSpeed: 2.2, // Glider Wing gadget: gliding fall speed (m/s, settles a little above this)
  glideSpeed: 11,      // ... and the forward speed it settles to
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
    this.height = T.height; // current body height (lower while sliding)
    this.speedScale = 1;    // AI runners (police officers) can be slower
    // Shop gadgets (set by the on-foot state)
    this.jumpScale = 1;     // Spring Boots: higher jumps
    this.wallRunScale = 1;  // Gecko Gloves: longer wall-runs
    this.canGlide = false;  // Glider Wing: hold jump in the air to glide
    this.canRocket = false; // Rocket Boots (admin): jump again in mid-air, any number of times
    this.gliding = false;
    this.zipLines = [];     // set by the level: [{ a: Vector3, b: Vector3 }] (a = high end)
    this.zip = null;        // { line, t, len, speed, dir } while riding a zip line (dir +1 = towards b)
    this.zipCooldown = 0;
    this.wallRun = null;    // { normal, tangent, speed } while wall-running
    this.usedWallNormal = null; // can't wall-run the same wall twice in one jump
    this.ladders = [];      // set by the level: [{ x, z, nx, nz, y0, y1 }] (n = out of the wall)
    this.ladder = null;     // the ladder we're on
    this.ladderCooldown = 0;

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
    this.height = T.height;
    this.zip = null;
    this.wallRun = null;
    this.usedWallNormal = null;
    this.ladder = null;
    this.grappleMove = null;
    this.gliding = false;
    this.glideArmed = false;
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
   *                        jumpPressed, jumpHeld, sprint, crouch }
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

    this.zipCooldown = Math.max(0, this.zipCooldown - dt);
    this.ladderCooldown = Math.max(0, this.ladderCooldown - dt);
    if (this.state === 'grapple') {
      this._updateGrapple(dt);
      return;
    }
    if (this.state === 'ladder') {
      this._updateLadder(dt, ctl);
      return;
    }
    if (this.state === 'mantle') {
      this._updateMantle(dt);
      return;
    }
    if (this.state === 'zip') {
      this._updateZip(dt, ctl);
      return;
    }
    if (this.state === 'wallrun') {
      this._updateWallRun(dt, ctl);
      return;
    }

    // --- Slide / crouch -----------------------------------------------------
    this._updateCrouch(ctl);

    // --- Horizontal movement ----------------------------------------------
    let targetSpeed = (this.sprinting ? T.sprintSpeed : T.runSpeed) * this.speedScale;
    if (ctl.moveZ < -0.1 && Math.abs(ctl.moveX) < 0.5) targetSpeed *= T.backSpeedFactor;
    if (this.stumbleTimer > 0) targetSpeed *= 0.35;
    if (this.state === 'crouch') targetSpeed = T.crouchSpeed;

    const onGround = this.grounded;
    if (this.state === 'slide') {
      // Sliding: keep going the way you were going, slowly losing speed.
      const s = this.horizontalSpeed;
      const ns = Math.max(0, s - T.slideFriction * dt);
      if (s > 0.01) { this.vel.x *= ns / s; this.vel.z *= ns / s; }
      this._accelerate(wish, wishLen, ns, dt * 0.15, false); // a little steering
    } else if (onGround && this.state !== 'roll') {
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
    if (this._tryLadder(wish, wishLen)) return;
    if (this.state !== 'slide' && this.state !== 'crouch' && this._tryParkour(moveDir, wishLen, ctl)) return;
    if (this._tryZip()) return;
    if (!this.grounded && wishLen > 0.3 && this._tryWallRun(wish)) return;

    // --- Jumping ----------------------------------------------------------
    const lowBody = this.state === 'slide' || this.state === 'crouch';
    if (this.jumpBufferTimer > 0 && this.coyoteTimer > 0 && this.state !== 'roll' && (!lowBody || this._canStand())) {
      if (lowBody) this.height = T.height; // slide-jump: pop back up and keep the speed
      this.vel.y = T.jumpSpeed * this.jumpScale;
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

    // --- Rocket Boots (admin gadget): jump again in mid-air, as often as you like
    if (this.canRocket && ctl.jumpPressed && !this.grounded && this.state === 'air' && this.coyoteTimer <= 0 && this.stateTime > 0.08) {
      this.vel.y = Math.max(this.vel.y, T.jumpSpeed * this.jumpScale);
      this.jumpHeld = true;
      this.jumpBufferTimer = 0;
      this.events.push({ type: 'jump' });
    }

    // --- Glider Wing (gadget): press jump again in mid-air, and hold it -----
    if (this.grounded || this.state !== 'air') this.glideArmed = false;
    else if (ctl.jumpPressed && this.coyoteTimer <= 0 && this.stateTime > 0.08) this.glideArmed = true;
    const wasGliding = this.gliding;
    this.gliding = this.canGlide && this.glideArmed && ctl.jumpHeld && !this.grounded &&
      this.state === 'air' && this.vel.y < 0.5;
    if (this.gliding && !wasGliding) this.events.push({ type: 'glide' });

    // --- Gravity ------------------------------------------------------------
    this.vel.y = Math.max(this.vel.y - T.gravity * dt, -T.maxFallSpeed);
    if (this.gliding) {
      // The wing cancels most of gravity and brakes a fast fall down to a
      // gentle glide; it also carries you forward at gliding speed.
      this.vel.y += T.gravity * dt * 0.9;
      if (this.vel.y < -T.glideFallSpeed) this.vel.y = damp(this.vel.y, -T.glideFallSpeed, 5, dt);
      const dir = wishLen > 0.2 ? wish : this._facingDir();
      const s = this.horizontalSpeed;
      const want = Math.max(T.glideSpeed, s * 0.995);
      this.vel.x = damp(this.vel.x, dir.x * want, 1.6, dt);
      this.vel.z = damp(this.vel.z, dir.z * want, 1.6, dt);
    }

    // --- Move and collide, one axis at a time --------------------------------
    const fallSpeed = -this.vel.y;
    const wasGrounded = this.grounded;
    this._moveAxis('x', this.vel.x * dt);
    this._moveAxis('z', this.vel.z * dt);
    this._moveY(this.vel.y * dt);

    if (this.grounded && !wasGrounded) this._onLand(fallSpeed);
    if (this.grounded) {
      this.lastGroundY = this.pos.y;
      this.usedWallNormal = null;
    }
    if (!this.grounded && (this.state === 'ground' || this.state === 'crouch')) {
      this.height = T.height;
      this._setState('air');
    }
    if (!this.grounded && this.state === 'slide' && this.stateTime > 0.15) {
      // Slid off an edge: stand up in the air (if there's room).
      if (this._canStand()) { this.height = T.height; this._setState('air'); }
    }

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
  _overlapsAt(x, y, z, height = this.height, shrink = 0) {
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
        p.y = Math.min(p.y, b.min.y - this.height - EPS);
      }
    }
    this.vel.y = 0;
  }

  _onLand(impact) {
    this.events.push({ type: 'land', impact });
    if (this.state === 'slide' || this.state === 'crouch') return;
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
    if (this.state === 'roll' || this.noClimb) return false; // (noClimb: e.g. carrying a heavy bag)
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

  // ---------------------------------------------------------------------
  // Slide and crouch
  // ---------------------------------------------------------------------

  /** Is there room to stand up (full height) where we are? */
  _canStand() {
    return this._overlapsAt(this.pos.x, this.pos.y + 0.02, this.pos.z, T.height, 0.02).length === 0;
  }

  _updateCrouch(ctl) {
    const wantLow = !!ctl.crouch;
    if (this.state === 'ground' && wantLow && this.grounded) {
      if (this.horizontalSpeed > T.slideMinSpeed) {
        // SLIDE: a little burst of speed, body drops to crouch height.
        this._setState('slide');
        this.height = T.crouchHeight;
        const s = this.horizontalSpeed, boost = Math.min(s * 1.12, T.sprintSpeed + 1.5);
        this.vel.x *= boost / s;
        this.vel.z *= boost / s;
        this.events.push({ type: 'slide' });
      } else {
        this._setState('crouch');
        this.height = T.crouchHeight;
      }
      return;
    }
    if (this.state === 'slide') {
      const done = (this.stateTime > T.slideMaxTime || this.horizontalSpeed < 3.5) &&
        (!wantLow || this.horizontalSpeed < 3.5);
      if (done) {
        if (this._canStand()) { this.height = T.height; this._setState('ground'); }
        else this._setState('crouch'); // stuck under something: crawl out
      }
      return;
    }
    if (this.state === 'crouch' && !wantLow && this._canStand()) {
      this.height = T.height;
      this._setState('ground');
    }
  }

  // ---------------------------------------------------------------------
  // Wall-run
  // ---------------------------------------------------------------------

  /**
   * Is there a tall wall right beside us (left or right of our movement)?
   * Returns { normal, tangent } for that wall face, or null.
   */
  _findRunWall(dir) {
    const p = this.pos;
    for (const side of [1, -1]) {
      // Perpendicular to the movement direction
      const sx = -dir.z * side, sz = dir.x * side;
      const px = p.x + sx * (T.radius + 0.6), pz = p.z + sz * (T.radius + 0.6);
      const hits = this.world.query(px - 0.08, p.y + 0.6, pz - 0.08, px + 0.08, p.y + 1.6, pz + 0.08, this._hits);
      const tall = hits.find((b) => b.max.y > p.y + 2.2);
      if (!tall) continue;
      // Snap to the wall's actual face: the wall normal points back toward us.
      const normal = Math.abs(sx) > Math.abs(sz) ? new THREE.Vector3(-Math.sign(sx), 0, 0) : new THREE.Vector3(0, 0, -Math.sign(sz));
      if (this.usedWallNormal && this.usedWallNormal.dot(normal) > 0.9) continue; // same wall again
      const tangent = new THREE.Vector3(-normal.z, 0, normal.x);
      if (tangent.dot(dir) < 0) tangent.negate();
      // Must be moving mostly along the wall, not into it.
      if (tangent.dot(dir) < 0.55) continue;
      return { normal, tangent };
    }
    return null;
  }

  _tryWallRun(wish) {
    if (this.state !== 'air' || this.horizontalSpeed < T.wallRunMinSpeed || this.vel.y < -7) return false;
    const dir = this._wish.clone().set(this.vel.x, 0, this.vel.z).normalize();
    const wall = this._findRunWall(dir);
    if (!wall || wish.dot(wall.tangent) < 0.3) return false;
    const speed = Math.max(this.horizontalSpeed, 7.5);
    this.wallRun = { ...wall, speed };
    // Keep a little lift, but a wall-run is for crossing gaps, not climbing.
    this.vel.set(wall.tangent.x * speed, clamp(this.vel.y, 1.5, 3.2), wall.tangent.z * speed);
    this.facing = Math.atan2(wall.tangent.x, wall.tangent.z);
    this._setState('wallrun');
    this.events.push({ type: 'wallrun' });
    return true;
  }

  _updateWallRun(dt, ctl) {
    const w = this.wallRun;
    // Jump off the wall: away from it and up. Can then wall-run the opposite wall.
    if (ctl.jumpPressed || this.jumpBufferTimer > 0) {
      this.jumpBufferTimer = 0;
      this.vel.set(w.tangent.x * w.speed * 0.85 + w.normal.x * T.wallJumpOut, T.wallJumpUp,
        w.tangent.z * w.speed * 0.85 + w.normal.z * T.wallJumpOut);
      this._endWallRun();
      this.events.push({ type: 'walljump' });
      return;
    }
    this.vel.y -= T.wallRunGravity * dt;
    // Hug the wall a little so collisions keep us against it.
    this.vel.x = w.tangent.x * w.speed - w.normal.x * 0.5;
    this.vel.z = w.tangent.z * w.speed - w.normal.z * 0.5;
    const fall = -this.vel.y;
    this._moveAxis('x', this.vel.x * dt);
    this._moveAxis('z', this.vel.z * dt);
    this._moveY(this.vel.y * dt);
    if (this.grounded) { this._endWallRun(); this._onLand(fall); return; }
    // Ran out of time, or out of wall?
    const stillWall = this._findRunWallFace(w.normal);
    if (this.stateTime > T.wallRunTime * this.wallRunScale || !stillWall) {
      this.vel.x = w.tangent.x * w.speed;
      this.vel.z = w.tangent.z * w.speed;
      this._endWallRun();
    }
  }

  /** Is the wall face with this normal still beside us? */
  _findRunWallFace(normal) {
    const p = this.pos;
    const px = p.x - normal.x * (T.radius + 0.6), pz = p.z - normal.z * (T.radius + 0.6);
    return this.world.query(px - 0.08, p.y + 0.6, pz - 0.08, px + 0.08, p.y + 1.6, pz + 0.08, this._hits).length > 0;
  }

  _endWallRun() {
    this.usedWallNormal = this.wallRun.normal;
    this.wallRun = null;
    this._setState('air');
  }

  // ---------------------------------------------------------------------
  // Zip lines
  // ---------------------------------------------------------------------

  /** Grab a zip line if our hands are near the cable (jumping or falling into it). */
  _tryZip() {
    if (!this.zipLines.length || this.zipCooldown > 0) return false;
    if (this.grounded && this.jumpBufferTimer <= 0) return false; // on the ground: press jump to grab
    const hx = this.pos.x, hy = this.pos.y + T.zipHang, hz = this.pos.z;
    for (const line of this.zipLines) {
      const ax = line.a.x, ay = line.a.y, az = line.a.z;
      const dx = line.b.x - ax, dy = line.b.y - ay, dz = line.b.z - az;
      const len2 = dx * dx + dy * dy + dz * dz;
      const t = clamp(((hx - ax) * dx + (hy - ay) * dy + (hz - az) * dz) / len2, 0, 1);
      const cx = ax + dx * t, cy = ay + dy * t, cz = az + dz * t;
      if (Math.hypot(hx - cx, hy - cy, hz - cz) > T.zipGrab) continue;
      const len = Math.sqrt(len2);
      // Which way? Away from the end you're standing at; otherwise the way
      // you're facing (or moving).
      const flat = Math.hypot(dx, dz) || 1;
      const face = (Math.sin(this.facing) * dx + Math.cos(this.facing) * dz) / flat;
      const move = (this.vel.x * dx + this.vel.z * dz) / flat;
      let dir = Math.abs(move) > 2 ? Math.sign(move) : face >= 0 ? 1 : -1;
      if (t < 0.04) dir = 1;
      else if (t > 0.96) dir = -1;
      const along = Math.abs((this.vel.x * dx + this.vel.y * dy + this.vel.z * dz) / len);
      this.zip = { line, t, len, dir, speed: Math.max(T.zipMinSpeed, Math.min(along, T.zipMaxSpeed)), turnLatch: true };
      this.grounded = false;
      this.jumpBufferTimer = 0;
      this._setState('zip');
      this.events.push({ type: 'zip' });
      return true;
    }
    return false;
  }

  _updateZip(dt, ctl) {
    const z = this.zip, l = z.line;
    // Pull back (S / stick down) to turn round on the cable
    const back = ctl.moveZ < -0.6;
    if (back && !z.turnLatch) { z.dir = -z.dir; z.speed = T.zipMinSpeed; this.events.push({ type: 'zip' }); }
    z.turnLatch = back;
    const dx = ((l.b.x - l.a.x) / z.len) * z.dir, dy = ((l.b.y - l.a.y) / z.len) * z.dir, dz = ((l.b.z - l.a.z) / z.len) * z.dir;
    // The cable pulls you along either way; going downhill builds extra speed, uphill slows you to the pull speed.
    z.speed = clamp(z.speed + (-dy * 20 - 0.02 * z.speed * z.speed * 0.2) * dt, T.zipMinSpeed, T.zipMaxSpeed);
    z.t += (z.speed * dt * z.dir) / z.len;
    const done = z.t >= 1 || z.t <= 0;
    z.t = clamp(z.t, 0, 1);
    this.pos.set(l.a.x + (l.b.x - l.a.x) * z.t, l.a.y + (l.b.y - l.a.y) * z.t - T.zipHang, l.a.z + (l.b.z - l.a.z) * z.t);
    this.vel.set(dx * z.speed, dy * z.speed, dz * z.speed);
    this.facing = Math.atan2(dx, dz);
    if (done || ctl.jumpPressed) {
      // Let go: keep the momentum (a little hop if you let go early). At the
      // end, step off onto the roof gently.
      if (!done) this.vel.y += 3;
      else this.vel.multiplyScalar(0.35).setY(Math.max(this.vel.y, 0) + 1.5);
      this.zip = null;
      this.zipCooldown = 0.5;
      this._setState('air');
      this.events.push({ type: 'zipEnd' });
    }
  }

  // ---------------------------------------------------------------------
  // Ladders (on the side of buildings, to get back up from the street)
  // ---------------------------------------------------------------------

  /** Walking into the bottom of a ladder grabs it. */
  _tryLadder(wish, wishLen) {
    if (this.noClimb || !this.ladders.length || this.ladderCooldown > 0 || wishLen < 0.3) return false;
    const p = this.pos;
    for (const L of this.ladders) {
      if (p.y < L.y0 - 0.5 || p.y > L.y0 + T.ladderReach) continue;
      const dx = p.x - L.x, dz = p.z - L.z;
      const out = dx * L.nx + dz * L.nz;         // distance out from the wall
      const side = dx * -L.nz + dz * L.nx;       // distance along the wall from the ladder's centre
      if (out < -0.05 || out > T.radius + 0.45 || Math.abs(side) > 0.6) continue;
      const into = -(wish.x * L.nx + wish.z * L.nz); // pushing towards the wall?
      if (into < 0.45) continue;
      this.ladder = L;
      p.x = L.x + L.nx * (T.radius + 0.03);
      p.z = L.z + L.nz * (T.radius + 0.03);
      this.vel.set(0, 0, 0);
      this.facing = Math.atan2(-L.nx, -L.nz);
      this.grounded = false;
      this.height = T.height;
      this._setState('ladder');
      this.events.push({ type: 'ladder' });
      return true;
    }
    return false;
  }

  /** Forward = climb up, back = climb down, jump = let go. */
  _updateLadder(dt, ctl) {
    const L = this.ladder;
    const climb = clamp(ctl.moveZ, -1, 1);
    const speed = ctl.sprint ? T.ladderSprintSpeed : T.ladderSpeed;
    this.vel.set(0, climb * speed, 0);
    this.pos.y += climb * speed * dt;
    this.facing = Math.atan2(-L.nx, -L.nz);
    this.climbPhase = (this.climbPhase || 0) + climb * speed * dt * 3.2;

    const letGo = (vx, vy, vz) => {
      this.ladder = null;
      this.ladderCooldown = 0.5;
      this.vel.set(vx, vy, vz);
      this._setState('air');
    };
    if (ctl.jumpPressed) {
      // Push off the ladder, away from the wall.
      letGo(L.nx * 4, 4.5, L.nz * 4);
      this.events.push({ type: 'jump' });
      return;
    }
    if (this.pos.y <= L.y0 && climb < 0) {
      this.pos.y = L.y0;
      this.ladder = null;
      this.ladderCooldown = 0.5;
      this.grounded = true;
      this._setState('ground');
      return;
    }
    // Near the top: climb over onto the roof (the same move as a mantle).
    if (this.pos.y >= L.y1 - 1.4) {
      const dir = new THREE.Vector3(-L.nx, 0, -L.nz);
      const ledge = this.findLedge(dir, 0.2, T.mantleMaxRise);
      this.ladder = null;
      if (ledge) {
        this._startMantle(ledge, { vault: false, dir });
        this.mantle.exitSpeed = 0;
      } else letGo(0, 0, 0);
    }
  }

  // ---------------------------------------------------------------------
  // Grapple gun (a shop gadget): get pulled along a cable onto a roof
  // ---------------------------------------------------------------------

  /** Start a grapple pull to `target` (feet position on a roof). */
  grapple(target) {
    const d = this.pos.distanceTo(target);
    // (long pulls - infinite range - are capped in time and arc higher over the rooftops)
    this.grappleMove = { from: this.pos.clone(), to: target.clone(), t: 0, duration: Math.min(2.4, 0.35 + d * 0.03), arc: Math.max(1.5, d * 0.12) };
    this.vel.set(0, 0, 0);
    this.grounded = false;
    this.ladder = null;
    this.zip = null;
    this.wallRun = null;
    this.mantle = null;
    this.height = T.height;
    this.facing = Math.atan2(target.x - this.pos.x, target.z - this.pos.z);
    this._setState('grapple');
    this.events.push({ type: 'zip' });
  }

  _updateGrapple(dt) {
    const g = this.grappleMove;
    g.t += dt;
    const k = clamp(g.t / g.duration, 0, 1);
    const e = easeInOut(k);
    // Straight line, lifted a little in the middle so you arc over the roof edge.
    this.pos.set(
      g.from.x + (g.to.x - g.from.x) * e,
      g.from.y + (g.to.y - g.from.y) * e + Math.sin(Math.PI * k) * g.arc,
      g.from.z + (g.to.z - g.from.z) * e,
    );
    if (k >= 1) {
      this.grappleMove = null;
      this.vel.set(0, 0, 0);
      this.grounded = true;
      this.lastGroundY = this.pos.y;
      this._setState('ground');
      this.events.push({ type: 'land', impact: 3 });
    }
  }

  /** 0..1 progress through the current mantle (for animation). */
  get mantleProgress() {
    return this.mantle ? clamp(this.mantle.t / this.mantle.duration, 0, 1) : 0;
  }
}

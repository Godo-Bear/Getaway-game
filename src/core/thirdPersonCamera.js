import * as THREE from 'three';
import { clamp, damp } from './utils.js';

// Third-person "orbit" camera that follows a target (the player).
//
//  - yaw/pitch are the camera's angles around the player (mouse controls these)
//  - the camera sits `distance` metres behind a pivot point at head height
//  - a ray from the pivot to the camera checks the collision world, and if a
//    wall is in the way the camera slides forward so it never clips inside it
//  - extra effects: landing "dip", speed-based field of view

const PIVOT_HEIGHT = 1.55;   // metres above the player's feet
const DEFAULT_DISTANCE = 4.6;
const MIN_DISTANCE = 0.6;
const WALL_PADDING = 0.25;   // stay this far away from walls
const MIN_PITCH = -1.25;     // looking down (radians)
const MAX_PITCH = 0.6;       // looking up

export class ThirdPersonCamera {
  constructor(camera, collisionWorld) {
    this.camera = camera;
    this.world = collisionWorld;
    this.yaw = 0;
    this.pitch = -0.25;
    this.distance = DEFAULT_DISTANCE;     // what the player wants
    this.currentDistance = DEFAULT_DISTANCE; // after wall collision + smoothing
    this.sensitivity = 0.0022;
    this.invertY = false;

    this.pivot = new THREE.Vector3();
    this._pivotY = null;
    this.dip = 0;          // current landing dip offset (metres)
    this.dipVelocity = 0;  // spring velocity for the dip
    this.baseFov = 68;

    this._dir = new THREE.Vector3();
  }

  /** Called when the player lands hard: `impact` is the fall speed in m/s. */
  addLandingDip(impact) {
    this.dipVelocity -= Math.min(impact * 0.12, 2.2);
  }

  /** Mouse look. dx/dy are raw pixels of mouse movement. */
  applyMouse(dx, dy) {
    this.yaw -= dx * this.sensitivity;
    this.pitch -= dy * this.sensitivity * (this.invertY ? -1 : 1);
    this.pitch = clamp(this.pitch, MIN_PITCH, MAX_PITCH);
  }

  /** Keyboard turning (arrow keys, or A/D in no-pointer-lock mode). */
  applyTurn(amount, dt) {
    this.yaw -= amount * 2.6 * dt;
  }

  /** Snap straight behind a direction (used on respawn). */
  snapBehind(yaw) {
    this.yaw = yaw;
    this.pitch = -0.25;
    this._pivotY = null;
  }

  /** Forward direction on the ground plane (for camera-relative movement). */
  getForward(out) {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }
  getRight(out) {
    return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  /**
   * @param {number} dt
   * @param {THREE.Vector3} targetPos - player's feet position
   * @param {number} speed - player's horizontal speed (for FOV)
   */
  update(dt, targetPos, speed = 0) {
    // --- Landing dip: a simple damped spring pulling `dip` back to 0.
    const stiffness = 90, dampingK = 14;
    this.dipVelocity += (-stiffness * this.dip - dampingK * this.dipVelocity) * dt;
    this.dip += this.dipVelocity * dt;

    // --- Pivot: follow the player. Vertical follow is smoothed so small
    // steps and mantles don't jerk the camera.
    const wantY = targetPos.y + PIVOT_HEIGHT;
    this._pivotY = this._pivotY === null ? wantY : damp(this._pivotY, wantY, 14, dt);
    this.pivot.set(targetPos.x, this._pivotY + this.dip, targetPos.z);

    // --- Direction from pivot to the camera (opposite of view direction).
    const cp = Math.cos(this.pitch);
    this._dir.set(Math.sin(this.yaw) * cp, -Math.sin(this.pitch), Math.cos(this.yaw) * cp);

    // --- Wall collision: shorten the boom if something is in the way.
    const hit = this.world.raycast(this.pivot, this._dir, this.distance + WALL_PADDING);
    const allowed = clamp(hit - WALL_PADDING, MIN_DISTANCE, this.distance);
    // Pull in instantly (never show the inside of a wall), ease back out slowly.
    this.currentDistance = allowed < this.currentDistance
      ? allowed
      : damp(this.currentDistance, allowed, 5, dt);

    this.camera.position.copy(this.pivot).addScaledVector(this._dir, this.currentDistance);
    this.camera.lookAt(this.pivot);

    // --- Field of view widens a little at speed (sense of velocity).
    const targetFov = this.baseFov + clamp((speed - 6) / 5, 0, 1) * 8;
    if (Math.abs(this.camera.fov - targetFov) > 0.01) {
      this.camera.fov = damp(this.camera.fov, targetFov, 4, dt);
      this.camera.updateProjectionMatrix();
    }
  }
}

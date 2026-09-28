import { clamp, wrapAngle } from '../core/utils.js';

// Low-level AI driving: "get this car to that point at this speed".
// Both police and civilian traffic use it; they only differ in how they
// choose the point to drive to.

/**
 * Set car.controls to drive toward (tx, tz).
 * @returns {number} the angle (radians) between the car's heading and the target
 */
export function driveToward(car, tx, tz, desiredSpeed, { allowDrift = false } = {}) {
  const dx = tx - car.pos.x, dz = tz - car.pos.z;
  const want = Math.atan2(dx, dz);
  const diff = wrapAngle(want - car.heading);
  const c = car.controls;
  // Heading increases to the LEFT, and steer +1 means turn RIGHT, hence the minus.
  c.steer = clamp(-diff * 2.2, -1, 1);

  const speed = car.forwardSpeed;
  const turnSharpness = Math.abs(diff);
  // Slow down for sharp turns so we don't overshoot the corner.
  let target = desiredSpeed;
  if (turnSharpness > 0.5) target = Math.min(target, 9 + (1.6 - Math.min(turnSharpness, 1.6)) * 12);

  if (speed < target - 0.5) c.throttle = 1;
  else if (speed > target + 3) c.throttle = -0.6;
  else c.throttle = 0.15;

  c.handbrake = allowDrift && turnSharpness > 0.9 && speed > 14;
  c.nitro = false;
  return diff;
}

/**
 * Stuck detection + recovery. Call every tick after driveToward().
 * If the car has been trying to move but isn't, it reverses for a moment with
 * the wheels turned the other way. Returns true if the car is hopelessly
 * stuck (the caller should respawn it somewhere else).
 */
export function handleStuck(car, ai, dt) {
  if (ai.reverseTimer > 0) {
    ai.reverseTimer -= dt;
    car.controls.throttle = -1;
    car.controls.steer = -ai.reverseSteer;
    car.controls.handbrake = false;
    return false;
  }
  const trying = car.controls.throttle > 0.5;
  if (trying && Math.abs(car.forwardSpeed) < 1.2) ai.stuckTimer += dt;
  else ai.stuckTimer = Math.max(0, ai.stuckTimer - dt * 0.5);

  if (ai.stuckTimer > 0.9) {
    ai.stuckTimer = 0;
    ai.stuckCount++;
    ai.reverseTimer = 1.1;
    // Reverse with the wheels turned hard, so we back out at an angle
    // instead of straight back into the same obstacle.
    const st = car.controls.steer;
    ai.reverseSteer = Math.abs(st) > 0.2 ? Math.sign(st) : (Math.random() < 0.5 ? -1 : 1);
  }
  // Decay the counter slowly; lots of stuck events in a short time = give up.
  ai.stuckCount = Math.max(0, ai.stuckCount - dt * 0.15);
  return ai.stuckCount >= 3;
}

export function makeAiState() {
  return { stuckTimer: 0, stuckCount: 0, reverseTimer: 0, reverseSteer: 1 };
}

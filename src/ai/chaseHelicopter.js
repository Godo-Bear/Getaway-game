import { Helicopter } from './helicopter.js';

// The police helicopter in a car chase (it joins when the heat gets high).
//
// It flies after your car and lights it up with its searchlight. While you're
// in the light the police on the ground always know where you are, so you
// can't lose them. It's a little slower than your car flat out, so a long
// straight with nitro leaves it behind; or duck into a parking garage or
// under the elevated railway where it can't see you. An EMP or the Signal
// Jammer blinds the crew for a few seconds.

const SPOT_SPEED = 27;  // m/s (your car tops out around 42)
const LEAD = 0.45;      // s: how far ahead of you it aims

export class ChaseHelicopter extends Helicopter {
  constructor(scene, world, startPos) {
    super(scene, world, { id: 3, startPos });
    this.lostFor = 0;
  }

  /**
   * @param {number} dt
   * @param {import('../vehicles/car.js').Car} car - your car
   * @param {number} speedScale - difficulty
   * @returns {boolean} true while your car is in its light (the police know where you are)
   */
  chase(dt, car, speedScale = 1) {
    this.update(dt, car, { spotSpeed: SPOT_SPEED * speedScale, lead: LEAD });
    const lit = this.isPlayerLit(car.pos);
    this.lostFor = lit ? 0 : this.lostFor + dt;
    return lit;
  }
}

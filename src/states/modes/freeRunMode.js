import { generateRooftopCity } from '../../world/rooftopCity.js';
import { formatTime } from '../../core/utils.js';

// Free Run: the procedural rooftop city with nothing chasing you.
// A place to practise vaults, climbs and gap jumps.

export class FreeRunMode {
  constructor(state) {
    this.state = state;
    this.hudSections = ['tl', 'meter', 'controls'];
  }

  build() {
    return generateRooftopCity({ seed: 1234, blocks: 6 });
  }

  start() {
    const hud = this.state.game.hud;
    hud.setPhase('Free Run');
    hud.setObjective('Explore the rooftops');
  }

  update() {
    const s = this.state;
    s.game.hud.setStats(`<span>Time <b>${formatTime(s.time)}</b></span><span>Falls <b>${s.falls}</b></span>`);
  }
}

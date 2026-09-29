import { formatTime } from '../../core/utils.js';
import { audio } from '../../core/audio.js';
import { freeSession, switchFreeRoam, freeEarn, freeRoamPauseButtons } from './freeRoam.js';

// Free Run, in the car: cruise the city. The other half of a Free Run
// session (FreeRunMode is the rooftops).
//
//  - Cash drops (green beam) and near misses earn cash; so do long drifts
//  - Park in a garage (blue P on the minimap) and stop to head up to the
//    rooftops
//  - Police (optional, pause menu): two patrol cars. Busted = back on the
//    road somewhere else; it never ends the run. Losing them pays.

const DROP_CASH = 40;
const PARK_TIME = 1.2; // seconds stopped in a garage before you get out

export class FreeDriveMode {
  constructor(state) {
    this.state = state;
    this.police = freeSession(state.game).police;
    this.hudSections = this.police ? ['tl', 'map', 'speedo', 'meter', 'controls', 'marker'] : ['tl', 'map', 'speedo', 'controls', 'marker'];
    this.heat = this.police ? 2 : 1;
  }

  cityOptions() {
    return { seed: 777, blocks: 8 };
  }

  get pursuitPaused() {
    return !this.police;
  }

  copCount() {
    return this.police ? 2 : 0;
  }

  start() {
    const s = this.state, g = s.city.graph;
    const n = g.node(Math.floor(g.n / 2), Math.floor(g.n / 2));
    s.placePlayer(n.x, n.z - 20, 0);
    this.parkT = 0;
    this.driftT = 0;
    this._placeDrop();
    const hud = s.game.hud;
    hud.setPhase(`Free Run · the streets${this.police ? ' · police on' : ''}`);
    hud.setObjective('Cruise the city');
    hud.toast('Free Run: the streets', 'Drive through cash drops (green beam), drift and near-miss for more. Stop in a garage (blue P) to head up to the rooftops.', 'var(--amber)', 6);
  }

  pauseButtons() {
    return freeRoamPauseButtons(this.state, 'car');
  }

  _placeDrop() {
    const s = this.state, p = s.player.pos;
    const nodes = s.city.graph.nodes.filter((n) => {
      const d = Math.hypot(n.x - p.x, n.z - p.z);
      return d > 120 && d < 300;
    });
    const n = nodes[Math.floor(s.rng() * nodes.length)] || s.city.graph.nodes[0];
    s.beacon.set(n.x, n.z, 'Cash drop', 0x4dffa6);
  }

  onNearMiss() {
    freeEarn(this.state.game, 5, 'Near miss!', '');
  }

  onEvade() {
    audio.sfx('checkpoint');
    freeEarn(this.state.game, 60, 'Cops lost!', 'They\'re searching the area.');
  }

  onBusted() {
    // Never game over in Free Run: back on the road somewhere else.
    const s = this.state, g = s.city.graph, p = s.player.pos;
    const far = g.nodes.filter((n) => Math.hypot(n.x - p.x, n.z - p.z) > 200);
    const n = far[Math.floor(s.rng() * far.length)] || g.nodes[0];
    s.placePlayer(n.x, n.z, 0);
    s.police.clear();
    s.police.searching = false;
    s.police.everSeen = false;
    s.game.hud.toast('Busted!', 'They let you off with a warning... this time. Back on the road.', 'var(--red)', 3);
  }

  update(dt) {
    const s = this.state, p = s.player, hud = s.game.hud;

    // Cash drop
    const b = s.beacon.pos;
    if (Math.hypot(b.x - p.pos.x, b.z - p.pos.z) < 7) {
      freeEarn(s.game, DROP_CASH * (this.police ? 2 : 1), 'Cash drop!');
      this._placeDrop();
    }

    // Long drifts pay a little
    if (p.drifting && p.speed > 10) {
      this.driftT += dt;
      if (this.driftT > 2.5) { this.driftT = 0; freeEarn(s.game, 10, 'Drift!', ''); }
    } else this.driftT = Math.max(0, this.driftT - dt * 2);

    // Park in a garage and stop: head up to the rooftops
    if (s.inGarage && p.speed < 1.5) {
      this.parkT += dt;
      hud.setMeter(this.parkT / PARK_TIME, 'Parking... heading up to the rooftops', 'var(--cyan)');
      if (this.parkT >= PARK_TIME) { switchFreeRoam(s, 'foot'); return; }
    } else if (this.parkT > 0) {
      this.parkT = 0;
      hud.setMeter(0, '');
    }
    if (s.inGarage && !this._garageTip) {
      this._garageTip = true;
      hud.toast('Garage', 'Stop here to park and head up to the rooftops.', 'var(--blue)', 3);
    }
    if (!s.inGarage) this._garageTip = false;

    hud.setStats(`<span>Time <b>${formatTime(s.time)}</b></span><span>Cash this session <b style="color:var(--safe)">$${freeSession(s.game).cash}</b></span>` +
      (this.police && s.police.searching ? '<span><b>SEARCHING</b></span>' : ''));
  }
}

import { formatTime } from '../../core/utils.js';
import { audio } from '../../core/audio.js';
import { freeSession, freeMap, switchFreeRoam, freeEarn, freeRoamPauseButtons } from './freeRoam.js';

// Free Run, in the car: cruise the city. The other half of a Free Run
// session (FreeRunMode is the rooftops).
//
//  - Cash drops (green beam) and near misses earn cash; so do long drifts
//  - Press T (or the "Get out and walk" button) to get out and go on foot;
//    slowing down in a garage (blue P on the minimap) parks you too
//  - Police (optional, pause menu): two patrol cars. Busted = back on the
//    road somewhere else; it never ends the run. Losing them pays.

const DROP_CASH = 40;
const PARK_SPEED = 5; // m/s: slow down inside a garage and you park straight away

export class FreeDriveMode {
  constructor(state) {
    this.state = state;
    this.police = freeSession(state.game).police;
    this.hudSections = this.police ? ['tl', 'map', 'speedo', 'meter', 'controls', 'marker'] : ['tl', 'map', 'speedo', 'controls', 'marker'];
    this.heat = this.police ? 2 : 1;
    this.map = freeMap(state.game);          // (which city: picked in the Free Run menu)
    this.weather = this.map.snow ? 'snow' : undefined;
  }

  cityOptions() {
    return this.map.car;
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
    this.driftT = 0;
    this._placeDrop();
    const hud = s.game.hud;
    hud.setPhase(`Free Run · ${this.map.name} streets${this.police ? ' · police on' : ''}`);
    hud.setObjective('Cruise the city');
    hud.toast('Free Run: the streets', 'Drive through cash drops (green beam), drift and near-miss for more. Press T (or "Get out and walk") to go on foot.', 'var(--amber)', 6);
    this._walkButton();
  }

  /** A button on screen that gets you out of the car (T on a keyboard). */
  _walkButton() {
    this.walkBtn?.remove();
    const b = document.createElement('button');
    b.className = 'free-car-btn below-map';
    b.innerHTML = '🚶 Get out and walk <kbd>T</kbd>';
    const go = (e) => { e.preventDefault(); e.stopPropagation(); this.toFoot = true; };
    b.addEventListener('pointerdown', go);
    b.addEventListener('click', (e) => e.stopPropagation());
    document.body.appendChild(b);
    this.walkBtn = b;
  }

  teardown() {
    this.walkBtn?.remove();
    this.walkBtn = null;
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

    // T (or the button): out of the car, on foot
    if (this.toFoot || s.game.input.wasPressed('car')) {
      this.toFoot = false;
      switchFreeRoam(s, 'foot');
      return;
    }

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

    // Slow down in a garage: park and head up to the rooftops (no waiting)
    if (s.inGarage && p.speed < PARK_SPEED) { switchFreeRoam(s, 'foot'); return; }
    if (s.inGarage && !this._garageTip) {
      this._garageTip = true;
      hud.toast('Garage', 'Slow down in here to park and head up to the rooftops.', 'var(--blue)', 3);
    }
    if (!s.inGarage) this._garageTip = false;

    hud.setStats(`<span>Time <b>${formatTime(s.time)}</b></span><span>Cash this session <b style="color:var(--safe)">$${freeSession(s.game).cash}</b></span>` +
      (this.police && s.police.searching ? '<span><b>SEARCHING</b></span>' : ''));
  }
}

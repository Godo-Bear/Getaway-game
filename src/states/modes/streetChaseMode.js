import { save } from '../../core/save.js';
import { earn } from '../../gadgets/gadgets.js';
import { formatTime } from '../../core/utils.js';
import { audio } from '../../core/audio.js';
import { diff } from '../../core/difficulty.js';

// Street Chase: endless driving survival.
//
//  - The longer you keep driving, the more points you earn (faster = more).
//  - Heat (1-5 stars) rises every 35 seconds and when you ram police cars.
//  - Break line of sight for long enough and the cops lose you (bonus!).
//    A patrol picks up your trail again after a while.
//  - Drive through the green cash drops for big bonuses.

const HEAT_TIME = 35;    // seconds per heat level
const SEARCH_TIME = 16;  // seconds before they pick up the trail again

export class StreetChaseMode {
  constructor(state) {
    this.state = state;
    this.hudSections = ['tl', 'score', 'map', 'speedo', 'meter', 'controls', 'marker'];
    this.heat = 1;
  }

  cityOptions() {
    return { seed: (Math.random() * 1e9) | 0, blocks: 8 };
  }

  start() {
    const s = this.state;
    const graph = s.city.graph;
    const startNode = graph.node(Math.floor(graph.n / 2), Math.floor(graph.n / 2));
    s.placePlayer(startNode.x, startNode.z - 20, 0);
    this.score = 0;
    this.heatProgress = 0;
    this.heat = 1;
    this.evades = 0;
    this.nearMisses = 0;
    this.cashDrops = 0;
    this.cashEarned = 0;
    this._placeCashDrop();
    const hud = s.game.hud;
    hud.setPhase('Street Chase');
    hud.setObjective('Lose the cops. Keep driving.');
    hud.toast('Drive!', 'Every second you stay free earns points. Space for nitro, Shift to drift. Drive through blue canisters to refill nitro.', 'var(--amber)');
  }

  _placeCashDrop() {
    const s = this.state;
    const p = s.player.pos;
    const nodes = s.city.graph.nodes.filter((n) => {
      const d = Math.hypot(n.x - p.x, n.z - p.z);
      return d > 150 && d < 320;
    });
    const n = nodes[Math.floor(s.rng() * nodes.length)] || s.city.graph.nodes[0];
    s.beacon.set(n.x, n.z, 'Cash drop', 0x4dffa6);
  }

  /** Roadblocks from heat 4, more often at heat 5. Spike strips too. */
  roadblockRules() {
    if (this.heat < 4) return null;
    return { roadblockEvery: this.heat === 4 ? 26 : 18, spikes: true };
  }

  onPoliceRam() {
    this.heatProgress += 4; // ramming the police makes them angrier
  }

  onEvade() {
    this.evades++;
    const bonus = 500 * this.heat;
    this.score += bonus;
    const cash = earn(this.state.game, 40 * this.heat, '', { quiet: true });
    this.cashEarned += cash;
    audio.sfx('checkpoint');
    this.state.game.hud.toast('Cops lost!', `+${bonus} points, +$${cash}. They're searching the area... keep your head down.`, 'var(--safe)');
  }

  onNearMiss() {
    this.nearMisses++;
    this.score += 40 * this.heat;
    this.state.game.hud.toast('Near miss!', `+${40 * this.heat} and nitro`, 'var(--cyan)');
  }

  update(dt) {
    const s = this.state;
    const p = s.player;
    const hud = s.game.hud;
    const police = s.police;

    // Heat level
    this.heatProgress += dt;
    const newHeat = Math.min(5, 1 + Math.floor(this.heatProgress / (HEAT_TIME * diff().heatTime)));
    if (newHeat > this.heat) {
      this.heat = newHeat;
      hud.toast(`Heat level ${this.heat}`, 'More cruisers are joining the chase.', 'var(--red)');
    }

    // After a while in hiding, a patrol calls in your position again.
    if (police.searching && police.timeSinceSeen > SEARCH_TIME) {
      police.searching = false;
      police.lastKnown.copy(p.pos);
      police.timeSinceSeen = 0;
      hud.toast('Trail picked up', 'A patrol called in your position.', 'var(--red)');
    }

    // Score: always ticking while you're free. Faster = more.
    let rate = (4 + p.speed * 3.6 * 0.06) * this.heat;
    if (police.searching) rate *= 0.5;
    if (p.drifting) rate += 12 * this.heat;
    this.score += rate * dt;

    // Cash drops
    const b = s.beacon.pos;
    if (Math.hypot(b.x - p.pos.x, b.z - p.pos.z) < 7) {
      const bonus = 750 * this.heat;
      this.score += bonus;
      this.cashDrops++;
      const shopCash = earn(s.game, 120 + 30 * this.heat, '', { quiet: true });
      this.cashEarned += shopCash;
      hud.toast(`Cash drop! +${bonus} points, +$${shopCash}`, 'Cash for the Shop.', 'var(--safe)');
      audio.sfx('cash');
      this._placeCashDrop();
    }

    const stars = '★'.repeat(this.heat) + '☆'.repeat(5 - this.heat);
    hud.setScore(this.score, `HEAT <span class="heat">${stars}</span>${police.searching ? ' &nbsp;<b>SEARCHING</b>' : ''}`);
    hud.setStats(`<span>Time <b>${formatTime(s.time)}</b></span><span>Evaded <b>${this.evades}</b></span>` +
      `<span>Near misses <b>${this.nearMisses}</b></span><span>Earned <b style="color:var(--safe)">$${this.cashEarned}</b></span>`);
  }

  onBusted() {
    const s = this.state;
    const score = Math.floor(this.score);
    const isBest = save.submitBest('streetChase', score);
    s.gameOver(`
      <h2>Busted!</h2>
      <p class="sub">They boxed you in. Next time keep moving, and use nitro to break away.</p>
      <div class="stat-grid">
        <div><span>Score</span><b>${score.toLocaleString('en-US')}</b></div>
        <div><span>Best (${diff().name})</span><b>${save.bestScore('streetChase').toLocaleString('en-US')}</b></div>
        <div><span>Time survived</span><b>${formatTime(s.time)}</b></div>
        <div><span>Heat reached</span><b>${this.heat}</b></div>
        <div><span>Times evaded</span><b>${this.evades}</b></div>
        <div><span>Near misses</span><b>${this.nearMisses}</b></div>
        <div><span>Cash for the Shop</span><b style="color:var(--safe)">+$${this.cashEarned + earn(s.game, score / 10, '', { quiet: true })}</b></div>
      </div>
      ${isBest ? '<p class="new-best">New best score!</p>' : ''}`);
  }
}

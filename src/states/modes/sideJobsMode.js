import { formatTime } from '../../core/utils.js';
import { audio } from '../../core/audio.js';
import { diff } from '../../core/difficulty.js';
import { FROSTVALE_CAR } from '../../world/maps.js';
import { earn } from '../../gadgets/gadgets.js';

// Frostvale side jobs: quick jobs round town for cash, between the big ones
// (Free Run menu > Frostvale side jobs; it opens once the crew reaches
// Frostvale in the story). One job after another:
//
//  - Race: a street race through checkpoints before the clock runs out.
//  - Smash and grab: pull up at a shop and stop while the crew empties the
//    till, then Sentinel comes after you: get back to Pine Lodge.
//  - Hot delivery: a crate for Ingrid at the lake airstrip, on a timer,
//    and the Sentinel trucks are already out looking for it.
//
// Every job pays cash (for gadgets and new cars). Busted or out of time =
// no pay, and the next job comes up.

const CITY = {
  ...FROSTVALE_CAR, // (Frostvale's streets, the same as Free Run and the story)
  forceKinds: { '6,6': 'cabin', '4,4': 'hotel', '2,2': 'church', '1,7': 'sentinel', '0,7': 'airstrip', '3,3': 'park', '5,2': 'park', '2,5': 'park' },
};
const KINDS = ['race', 'grab', 'delivery'];
const NAMES = { race: 'Street race', grab: 'Smash and grab', delivery: 'Hot delivery' };
const GRAB_TIME = 2.5; // s stopped at the shop

export class SideJobsMode {
  constructor(state) {
    this.state = state;
    this.hudSections = ['tl', 'map', 'speedo', 'meter', 'controls', 'marker'];
    this.weather = 'snow';
    this.heat = 2;
    this.job = null;
    this.done = 0;
    this.earned = 0;
    this.next = 0;
  }

  cityOptions() { return CITY; }

  /** The police only come out during the getaway part of a job. */
  get pursuitPaused() { return !this.job?.cops; }
  copCount() { return this.job?.cops ? 2 : 0; }

  start(first) {
    const s = this.state, home = this._door('6,6');
    const n = s.city.graph.nearestNode(home.x, home.z);
    s.placePlayer(n.x, n.z, 0);
    s.game.hud.setPhase('Frostvale · side jobs');
    if (first) s.game.hud.toast('Side jobs', 'Quick jobs round town for cash: races, smash and grabs, deliveries. One after another. Pause to stop.', 'var(--amber)', 6);
    this._newJob();
  }

  pauseButtons() {
    return [{ label: 'Skip this job', sub: 'A different one instead', onClick: () => { this.state.resume(); this._fail('Skipped', 'Here\'s another one.'); } }];
  }

  _door(key) {
    const lm = this.state.city.landmarks[key];
    return lm?.door || lm?.node || { x: 0, z: 0 };
  }

  /** A road junction between `min` and `max` metres from (x, z). */
  _nodeAway(x, z, min, max) {
    const nodes = this.state.city.graph.nodes;
    const ok = nodes.filter((n) => { const d = Math.hypot(n.x - x, n.z - z); return d > min && d < max; });
    const list = ok.length ? ok : nodes;
    return list[Math.floor(this.state.rng() * list.length)];
  }

  _newJob() {
    const s = this.state, p = s.player.pos, kind = KINDS[this.next++ % KINDS.length];
    s.police.clear();
    s.police.searching = false;
    s.police.everSeen = false;
    const T = diff().timer;
    if (kind === 'race') {
      const cps = [];
      let at = p, dist = 0;
      for (let i = 0; i < 4; i++) {
        const n = this._nodeAway(at.x, at.z, 110, 230);
        dist += Math.hypot(n.x - at.x, n.z - at.z);
        cps.push(n);
        at = n;
      }
      this.job = { kind, cps, i: 0, timeLeft: (dist / 16 + 12) * T, pay: 220 };
    } else if (kind === 'grab') {
      const n = this._nodeAway(p.x, p.z, 150, 300);
      this.job = { kind, shop: n, held: 0, stage: 'drive', pay: 450 };
    } else {
      const strip = this._door('0,7');
      const n = s.city.graph.nearestNode(strip.x, strip.z);
      this.job = { kind, dest: n, timeLeft: (Math.hypot(n.x - p.x, n.z - p.z) / 15 + 15) * T, cops: true, pay: 380 };
    }
    this._beacon();
    audio.sfx('checkpoint', { vol: 0.6 });
    const how = { race: 'Hit the 4 checkpoints before the clock runs out.', grab: 'Drive to the shop and stop there while the crew grabs the till. Then lose Sentinel on the way home.', delivery: 'Get the crate to Ingrid\'s plane at the lake airstrip before she takes off. Sentinel is already out looking.' }[kind];
    s.game.hud.toast(`New job: ${NAMES[kind]}`, how, 'var(--amber)', 5);
  }

  _beacon() {
    const s = this.state, j = this.job;
    if (j.kind === 'race') { const c = j.cps[j.i]; s.beacon.set(c.x, c.z, `Checkpoint ${j.i + 1}/4`, 0x39e6ff); }
    else if (j.kind === 'grab' && j.stage !== 'home') s.beacon.set(j.shop.x, j.shop.z, 'The shop', 0xffb020);
    else if (j.kind === 'grab') { const d = this._door('6,6'); s.beacon.set(d.x, d.z, 'Pine Lodge', 0x7dff8a); }
    else s.beacon.set(j.dest.x, j.dest.z, 'Lake airstrip', 0x39e6ff);
  }

  _pay(title) {
    const j = this.job, s = this.state;
    const bonus = j.timeLeft != null ? Math.round(Math.max(0, j.timeLeft)) * 4 : 0;
    const got = earn(s.game, j.pay + bonus, '', { quiet: true });
    this.earned += got;
    this.done++;
    audio.sfx('cash', { vol: 0.7 });
    s.game.hud.toast(`${title} +$${got}`, bonus ? `Including $${bonus} for the time you had left.` : 'Cash for gadgets and new cars.', 'var(--safe)', 4);
    this.job = null;
    this.wait = 3;
    s.beacon.hide();
  }

  _fail(title, text) {
    const s = this.state;
    s.game.hud.toast(title, text, 'var(--red)', 4);
    audio.sfx('caught', { vol: 0.6 });
    this.job = null;
    this.wait = 2.5;
    s.beacon.hide();
    s.police.clear();
  }

  onBusted() {
    const s = this.state, n = this._nodeAway(s.player.pos.x, s.player.pos.z, 150, 400);
    s.placePlayer(n.x, n.z, 0);
    this._fail('Busted!', 'Sentinel took the goods. No pay for that one.');
  }

  onEvade() {
    if (this.job?.cops) this.state.game.hud.toast('Lost them', this.job.kind === 'grab' ? 'Get back to Pine Lodge.' : 'Get to the airstrip!', 'var(--safe)', 2.5);
  }

  update(dt) {
    const s = this.state, p = s.player, hud = s.game.hud;
    if (!this.job) {
      if ((this.wait -= dt) <= 0) this._newJob();
    } else {
      const j = this.job, at = (n, r = 9) => Math.hypot(n.x - p.pos.x, n.z - p.pos.z) < r;
      if (j.timeLeft != null && (j.timeLeft -= dt) <= 0) {
        this._fail('Out of time', j.kind === 'race' ? 'Too slow. Try the next one.' : 'Ingrid had to take off without it.');
      } else if (j.kind === 'race' && at(j.cps[j.i])) {
        audio.sfx('checkpoint', { vol: 0.7 });
        if (++j.i >= j.cps.length) this._pay('Race won!');
        else this._beacon();
      } else if (j.kind === 'grab' && j.stage === 'drive' && at(j.shop, 10)) {
        // Stop at the shop while the crew grabs the till
        if (p.speed < 3) j.held += dt;
        else j.held = Math.max(0, j.held - dt);
        if (j.held >= GRAB_TIME) {
          j.stage = 'home';
          j.cops = true;
          this._beacon();
          audio.sfx('alarm', { vol: 0.6 });
          hud.toast('Got the till!', 'Alarm! Sentinel is coming: get back to Pine Lodge.', 'var(--red)', 3.5);
        }
      } else if (j.kind === 'grab' && j.stage === 'home' && at(this._door('6,6'), 10)) {
        this._pay('Smash and grab!');
      } else if (j.kind === 'delivery' && at(j.dest, 10)) {
        this._pay('Delivered!');
      }
    }
    const j = this.job;
    const what = !j ? 'Next job coming up...'
      : j.kind === 'race' ? `${NAMES.race}: checkpoint ${j.i + 1} of 4`
        : j.kind === 'grab' ? (j.stage === 'home' ? 'Get back to Pine Lodge' : j.held > 0 ? `Grabbing the till... ${Math.ceil(GRAB_TIME - j.held)}` : 'Drive to the shop and stop there')
          : 'Get the crate to the lake airstrip';
    hud.setObjective(what);
    const timer = j?.timeLeft != null ? `<span class="${j.timeLeft < 15 ? 'warn' : ''}">Time left <b>${formatTime(Math.max(0, j.timeLeft))}</b></span>` : '';
    hud.setStats(`<span>Jobs done <b>${this.done}</b></span>${timer}<span>Earned <b style="color:var(--safe)">$${this.earned}</b></span>`);
  }
}

import { playerCarBody } from '../../vehicles/carColours.js';
import * as THREE from 'three';
import { makeGlowMaterial } from '../../world/materials.js';
import { CHAPTERS } from '../../story/chapters.js';
import { SUSPECTS } from '../../story/crew.js';
import { getChapterRun } from '../../story/chapterRun.js';
import { finishPart } from '../../story/chapterFlow.js';
import { FugitiveCar } from '../../ai/fugitive.js';
import { save } from '../../core/save.js';
import { formatTime, clamp } from '../../core/utils.js';
import { audio } from '../../core/audio.js';
import { DOWNTOWN_CAR, FROSTVALE_CAR, PORTO_CAR, NEON_CAR, LUMIERE_CAR } from '../../world/maps.js';
import { diff } from '../../core/difficulty.js';

// A story part played in a car (any chapter). The part's data decides:
//
//   goal.type 'safehouse' - get to a door, but lose the police first
//             'reach'     - get to a place (optionally before a timer runs out)
//             'chase'     - catch a fleeing car before it reaches its destination
//             'stops'     - pull up at each of goal.stops in turn ({ block,
//                           label, title, text, heat }), then the goal
//                           (goal.driveBy: just drive past them, no stopping)
//             'race'      - beat a rival car (part.fugitive) to the goal
//             'tail'      - follow a car (part.fugitive) to wherever it's
//                           going without being seen: not closer than
//                           goal.near, not further than goal.far
//   noPolice   - no police cars at all (a quiet errand, or a tail)
//   fragile    - { label, after }: something breakable in the car (from the
//                stop number `after` on): every crash chips it, a big one
//                smashes it (and the part)
//   clue       - one clue hidden in a park (amber dot on the minimap)
//   heat       - { start, max, riseEvery }: police pressure over time
//   roadblocks - { fromHeat, every, spikes }: roadblocks / spike strips ahead
//
// GHOST MODE (G, the pause menu or the ghost button on touch screens):
// the police vanish and the clock stops, so you can drive around freely.
// Nothing you do counts while it's on: clues can't be picked up and the goal
// won't finish. Turning it off puts you back where you turned it on.

const ARRIVE_RADIUS = 11;
const ARRIVE_SPEED = 18;       // m/s: you have to actually pull up
const COP_CLEAR_RADIUS = 45;   // no cop this close and watching = you can slip into the safehouse
const CLUE_RADIUS = 7;
const CATCH_RADIUS = 16;   // (generous: stay roughly on their bumper)

export class ChapterDriveMode {
  constructor(state, params) {
    this.state = state;
    this.chapter = CHAPTERS[params.chapterId || 'chapter1'];
    this.partIndex = params.part ?? this.chapter.parts.findIndex((p) => p.kind === 'drive');
    this.part = this.chapter.parts[this.partIndex];
    this.startGhost = !!params.ghost;
    this.ghost = false;
    this.ghostSnap = null;
    this.weather = this.part.weather || 'clear'; // 'clear' | 'rain' | 'storm'
    this.time = this.part.time || 'night';       // 'night' | 'dawn' | 'day' | 'afternoon' | 'dusk' (or an hour)
    this.hudSections = ['tl', 'map', 'speedo', 'meter', 'controls', 'marker'];
    this.heat = this.part.heat?.start ?? 2;
    this.fugitive = null;
  }

  /** 'car', 'snowmobile' or 'dirtbike' (the part decides). */
  get vehicle() { return this.part.vehicle || 'car'; }

  /** A particular car the story puts you in ({ body, color }), instead of your own. */
  get storyCar() { return this.part.car || null; }

  cityOptions() {
    // Harbor City's or Frostvale's streets (the same as Free Run): the part
    // only adds its own landmarks (forceKinds) on top
    const base = this.part.city.classic ? LUMIERE_CAR : this.part.city.neon ? NEON_CAR : this.part.city.coastal ? PORTO_CAR : this.part.city.alpine ? FROSTVALE_CAR : DOWNTOWN_CAR;
    return { ...this.part.city, seed: base.seed, blocks: base.blocks, layout: base.layout, el: base.el }; // (the place's own street plan)
  }

  build() {
    const s = this.state;
    const lm = s.city.landmarks;
    const goal = this.part.goal;
    this.goalPos = goal.block ? lm[goal.block].door : null;
    this.stops = (goal.stops || []).map((st) => ({ ...st, pos: lm[st.block].door }));
    this.race = goal.type === 'race';
    this.tail = goal.type === 'tail';
    // Clue in a park
    const c = this.part.clue;
    if (c) {
      this.cluePos = lm[c.park].center.clone().add(new THREE.Vector3(c.offset[0], 0, c.offset[1]));
      const g = new THREE.Group();
      g.position.copy(this.cluePos);
      const card = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.6),
        new THREE.MeshLambertMaterial({ color: 0xd8dde8, emissive: 0x404860, emissiveIntensity: 0.6 }));
      card.position.y = 0.15;
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.6), new THREE.MeshBasicMaterial({ color: 0xffc34d, toneMapped: false }));
      gem.position.y = 2.2;
      const ring = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.1, 32), makeGlowMaterial(0xffb020, 0.7));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.12;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 30, 8, 1, true), makeGlowMaterial(0xffb020, 0.3));
      beam.position.y = 15;
      g.add(card, gem, ring, beam);
      s.scene.add(g);
      this.clue = { group: g, gem, ring };
    }
  }

  start(first) {
    const s = this.state;
    const part = this.part;
    this.run = getChapterRun(s.game, this.chapter.id);
    this.ghost = false;
    this.ghostSnap = null;
    this.ghostWarn = 0;
    const g = s.city.graph;
    const st = part.start;
    const n = g.node(st.node[0], st.node[1]);
    s.placePlayer(n.x + st.offset[0], n.z + st.offset[1], st.heading);
    this.heat = part.heat?.start ?? 2;
    this.heatTimer = 0;
    this.warnTimer = 0;
    this.done = false;
    this.catchMeter = 0;
    this.timeLeft = part.goal.timer != null ? part.goal.timer * diff().timer : null;
    this.stopIndex = 0;
    this.intact = 1;          // (fragile cargo: how much of it is left)
    this.crashCool = 0;
    this.suspicion = 0;
    this.lost = 0;
    s.player.gripFactor = part.ice ? (part.vehicle === 'snowmobile' ? 0.9 : playerCarBody().iceGrip ?? 0.62) : 1; // (snow and ice on the roads: the car slides; skis and the Rally Hatch grip)
    this.clueFound = part.clue ? this.run.clues.has(part.clue.id) : true;
    if (this.clue) this.clue.group.visible = !this.clueFound;

    // The fleeing car (chase parts)
    this.fugitive?.dispose();
    this.fugitive = null;
    const f = part.fugitive;
    if (f) {
      const dest = s.city.landmarks[part.goal.block].node;
      this.fugitive = new FugitiveCar(s.scene, s.city, dest, s.rng, f.color, f.kind, f.style);
      const fn = g.node(f.startNode[0], f.startNode[1]);
      this.fugitive.place(fn, f.heading ?? Math.PI);
      this.fugitiveSpeed = diff().fugitive * (f.speed ?? (this.race ? 0.92 : this.tail ? 0.7 : 0.9));
      this.fugitive.car.speedFactor = this.fugitiveSpeed;
    }

    this._setBeacon();

    const hud = s.game.hud;
    hud.setPhase(`${this.chapter.title} · Part ${this.partIndex + 1}: ${part.title}`);
    hud.setObjective(part.objective);
    this._updateStats();

    if (first && !s.game.speedrun) s.showStoryCards(part.intro, part.startLabel || 'Drive', () => { if (this.startGhost) this.setGhost(true); });
    else hud.toast('Go!', part.objective, 'var(--amber)');
  }

  /** The light you drive to: the next stop, or the goal. */
  _setBeacon() {
    const s = this.state, goal = this.part.goal, st = this.stops[this.stopIndex];
    if (this.tail) s.beacon.hide(); // (you don't know where they're going: that's why you're following)
    else if (st) s.beacon.set(st.pos.x, st.pos.z, `${st.label} (${this.stopIndex + 1}/${this.stops.length})`, st.color ?? 0xffb020);
    else if (this.goalPos) s.beacon.set(this.goalPos.x, this.goalPos.z, goal.label, goal.color ?? 0x4dffa6);
    else s.beacon.hide();
  }

  /** Something fragile on board? (from the stop it's picked up at) */
  get carrying() { return !!this.part.fragile && this.stopIndex >= (this.part.fragile.after ?? 0); }

  /** The drive state reports every crash: chip the fragile cargo. */
  onCrash(impact) {
    if (!this.carrying || this.done || this.ghost || impact < 4.5 || this.crashCool > 0) return;
    this.crashCool = 0.6; // (one knock counts once, not every frame you scrape along)
    const loss = Math.min(1, (impact - 3.5) * 0.045);
    this.intact = Math.max(0, this.intact - loss);
    const f = this.part.fragile, hud = this.state.game.hud;
    audio.sfx('glass', { vol: 0.7 });
    if (this.intact <= 0) { this._failed(f.brokenTitle || 'Smashed!', f.brokenText || `${f.label} broke. Try again: brake early, take the corners slowly and keep clear of the traffic.`); return; }
    hud.toast(loss > 0.25 ? 'CRACK!' : 'Clink...', `${f.label}: ${Math.round(this.intact * 100)}% left`, loss > 0.25 ? 'var(--red)' : 'var(--amber)', 1.6);
  }

  /** Reached a stop: the next one (or the goal) lights up. */
  _reachStop(st) {
    const s = this.state, hud = s.game.hud;
    this.stopIndex++;
    audio.sfx('checkpoint');
    if (st.heat) { this.heat = Math.max(this.heat, st.heat); this.heatTimer = 0; }
    hud.toast(st.title || st.label, st.text || '', 'var(--amber)', st.text ? 5 : 2);
    this._setBeacon();
  }

  /**
   * Ghost mode on/off. On: remember where you are, clear the police and
   * roadblocks, freeze the fleeing car and the clock. Off: back to that spot,
   * and the police pick up where they left off.
   */
  setGhost(on) {
    const s = this.state;
    if (on === this.ghost || this.done) return;
    const p = s.player, police = s.police, hud = s.game.hud;
    if (on) {
      this.ghostSnap = {
        x: p.pos.x, z: p.pos.z, heading: p.heading,
        everSeen: police.everSeen, searching: police.searching,
        lastKnown: police.lastKnown.clone(), timeSinceSeen: police.timeSinceSeen,
      };
      this.ghost = true;
      police.setCount(0, p, s.camera);
      s.roadblocks.clear();
      s.busted = 0;
      if (this.fugitive) this.fugitive.car.mesh.visible = false;
      hud.setMeter(0, '');
      hud.setObjective('Ghost mode: drive anywhere');
      hud.toast('Ghost mode on', 'No police and the clock is stopped. Nothing counts while it\'s on: turn it off to go back to where you were.', 'var(--cyan)', 5);
    } else {
      const g = this.ghostSnap;
      this.ghost = false;
      this.ghostSnap = null;
      s.placePlayer(g.x, g.z, g.heading);
      p.vel.set(0, 0, 0);
      police.everSeen = g.everSeen;
      police.searching = g.searching;
      police.lastKnown.copy(g.lastKnown);
      police.timeSinceSeen = g.timeSinceSeen;
      if (this.fugitive) this.fugitive.car.mesh.visible = true;
      hud.setObjective(this.part.objective);
      hud.toast('Ghost mode off', 'Back where you left off. The police are back too.', 'var(--amber)', 4);
    }
    this._updateStats();
  }

  // --- hooks the driving state calls ------------------------------------
  copCount() {
    return this.ghost || this.part.noPolice ? 0 : null; // null = use the heat level's normal count
  }

  /** The drive state skips losing/finding the cops while in ghost mode. */
  get pursuitPaused() {
    return this.ghost;
  }

  roadblockRules() {
    const r = this.part.roadblocks;
    if (!r || this.ghost || this.heat < r.fromHeat) return null;
    return { roadblockEvery: r.every, spikes: r.spikes };
  }

  extraCars() {
    return this.fugitive && !this.ghost ? [this.fugitive.car] : [];
  }

  simulate(dt) {
    if (!this.fugitive || this.done || this.ghost) return;
    if (this.fugitive.update(dt) === 'escaped') {
      if (this.tail) this._complete(); // (you followed them all the way)
      else this._failed(this.part.fugitive.escapeTitle, this.part.fugitive.escapeText);
    }
  }

  syncMeshes() {
    this.fugitive?.car.syncMesh();
  }

  minimapDots() {
    const dots = [];
    if (!this.clueFound && this.cluePos) dots.push({ x: this.cluePos.x, z: this.cluePos.z, color: '#ffb020', size: 1.6 });
    if (this.fugitive && !this.ghost) dots.push({ x: this.fugitive.car.pos.x, z: this.fugitive.car.pos.z, color: '#ffffff', size: 1.8 });
    return dots;
  }

  get copsOnYou() {
    const police = this.state.police;
    return police.everSeen && !police.searching;
  }

  onPoliceRam() {
    this.heatTimer += 8;
  }

  onEvade() {
    if (this.ghost) return;
    audio.sfx('checkpoint');
    this.state.game.hud.toast('Cops lost!', this.part.goal.loseCops ? 'They\'re searching the area. Get to the green light before they find you again.' : 'They\'re searching the area.', 'var(--safe)');
  }

  onBusted() {
    const s = this.state;
    this.run.caught++;
    s.gameOver(`
      <h2>Busted!</h2>
      <p class="sub">They boxed you in. Keep moving, use nitro to break away, and cut through parks, alleys and under the elevated railway to lose them.</p>
      <p>This counts as being caught in your chapter rating.</p>`,
    [], { retryLabel: `Try ${this.part.title} again` });
  }

  _failed(title, text) {
    if (this.done) return;
    this.done = true;
    audio.sfx('caught');
    this.state.gameOver(`<h2>${title}</h2><p class="sub">${text}</p>`, [], { retryLabel: 'Try again' });
  }

  update(dt) {
    if (this.done) return;
    const s = this.state;
    const p = s.player;
    const hud = s.game.hud;
    const part = this.part;

    this.ghostWarn -= dt;
    if (this.crashCool > 0) this.crashCool -= dt;
    if (this.carrying && !this.ghost) hud.setMeter(this.intact, `${part.fragile.label}: ${Math.round(this.intact * 100)}%`, this.intact > 0.5 ? '#9ad0ff' : this.intact > 0.25 ? 'var(--amber)' : 'var(--red)');
    // Heat rises over time (or sooner if you ram cops), up to the part's max.
    if (!this.ghost) this.heatTimer += dt;
    const h = part.heat;
    if (h && this.heat < h.max && this.heatTimer > h.riseEvery * diff().heatTime) {
      this.heatTimer = 0;
      this.heat++;
      hud.toast(`Heat level ${this.heat}`, this.heat >= (part.roadblocks?.fromHeat ?? 9) ? 'Roadblocks and spike strips ahead!' : 'More cruisers are joining the chase.', 'var(--red)');
    }

    // Clue
    if (!this.clueFound && this.cluePos) {
      this.clue.gem.rotation.y += dt * 2;
      this.clue.ring.rotation.z -= dt;
      if (Math.hypot(p.pos.x - this.cluePos.x, p.pos.z - this.cluePos.z) < CLUE_RADIUS && this.ghost) {
        this._ghostNotice('Turn ghost mode off to pick up this clue.');
      } else if (Math.hypot(p.pos.x - this.cluePos.x, p.pos.z - this.cluePos.z) < CLUE_RADIUS) {
        this.clueFound = true;
        this.clue.group.visible = false;
        const id = part.clue.id;
        this.run.clues.add(id);
        save.addClue(this.chapter.id, id);
        const info = this.chapter.clues[id];
        audio.sfx('clue');
        hud.toast(`Clue: ${info.name}`, info.text, 'var(--amber)', 7);
      }
    }

    // Timer
    if (this.timeLeft != null && !this.ghost) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) { this._failed(part.goal.timeoutTitle, part.goal.timeoutText); return; }
    }

    // Race: the rival is a little quicker when you're ahead, a little slower when you're far behind
    if (this.race && this.fugitive && !this.ghost && this.goalPos) {
      const fc = this.fugitive.car, G = this.goalPos;
      const lead = Math.hypot(fc.pos.x - G.x, fc.pos.z - G.z) - Math.hypot(p.pos.x - G.x, p.pos.z - G.z);
      this.raceLead = lead;
      fc.speedFactor = this.fugitiveSpeed * (lead < -90 ? 0.8 : lead < -40 ? 0.9 : lead > 60 ? 1.08 : 1);
    }
    // Tail: keep them in sight, but don't get close enough for them to notice you
    if (this.tail && this.fugitive && !this.ghost) {
      const fc = this.fugitive.car, g = part.goal;
      const d = Math.hypot(fc.pos.x - p.pos.x, fc.pos.z - p.pos.z);
      const near = g.near ?? 14, far = g.far ?? 75;
      this.suspicion = clamp(this.suspicion + (d < near ? dt / (2.6 / diff().fill) : -dt * 0.25), 0, 1);
      this.lost = clamp(this.lost + (d > far ? dt / 7 : -dt * 0.5), 0, 1);
      if (fc.lastImpact > 2 && d < 8) this.suspicion = 1; // (you hit them!)
      fc.lastImpact = 0;
      if (this.suspicion > 0.01 && this.suspicion >= this.lost) hud.setMeter(this.suspicion, 'TOO CLOSE! Drop back', 'var(--red)');
      else if (this.lost > 0.01) hud.setMeter(this.lost, `Losing ${part.fugitive.name}! Catch up`, 'var(--amber)');
      else hud.setMeter(0, d < near * 1.6 ? 'Careful: not too close' : '', 'var(--amber)');
      if (this.suspicion >= 1) { this._failed(g.spottedTitle || 'Spotted', g.spottedText || 'They saw you following them. Hang back further.'); return; }
      if (this.lost >= 1) { this._failed(g.lostTitle || 'Lost them', g.lostText || 'They got away. Keep them in sight.'); return; }
    }
    // Chase: stay close to the fugitive (or ram them) to fill the catch meter.
    if (this.fugitive && !this.ghost && !this.race && !this.tail) {
      const fc = this.fugitive.car;
      const d = Math.hypot(fc.pos.x - p.pos.x, fc.pos.z - p.pos.z);
      if (fc.lastImpact > 3 && d < 8) this.catchMeter += 0.25; // a good ram counts for a lot
      fc.lastImpact = 0;
      // Fall far behind and they ease off (traffic, nerves), so you can always catch up
      fc.speedFactor = this.fugitiveSpeed * (d > 80 ? 0.7 : d > 45 ? 0.82 : 1);
      this.catchMeter = clamp(this.catchMeter + (d < CATCH_RADIUS ? dt * 0.48 * diff().catchRate : -dt * 0.035), 0, 1);
      if (this.catchMeter > 0.01 || d < CATCH_RADIUS * 2) {
        hud.setMeter(this.catchMeter, d < CATCH_RADIUS ? `Run ${part.fugitive.name} off the road!` : `Catch ${part.fugitive.name}`, 'var(--amber)');
      }
      if (this.catchMeter >= 1) { this._complete(); return; }
    }

    // Arrival
    this.warnTimer -= dt;
    const stop = this.stops[this.stopIndex];
    if (stop && !this.ghost) {
      const d = Math.hypot(p.pos.x - stop.pos.x, p.pos.z - stop.pos.z);
      if (d < ARRIVE_RADIUS && (part.goal.driveBy || p.speed < ARRIVE_SPEED)) this._reachStop(stop);
      else if (d < ARRIVE_RADIUS && this.warnTimer <= 0) { this.warnTimer = 3; hud.toast('Slow down', 'Pull up at the light.', 'var(--amber)'); }
    } else if (this.goalPos && (!this.fugitive || this.race) && !this.tail) {
      const d = Math.hypot(p.pos.x - this.goalPos.x, p.pos.z - this.goalPos.z);
      if (d < ARRIVE_RADIUS && this.ghost) {
        this._ghostNotice('Turn ghost mode off to finish this part.');
      } else if (d < ARRIVE_RADIUS) {
        if (part.goal.loseCops && this.copsWatching) {
          if (this.warnTimer <= 0) {
            this.warnTimer = 4;
            hud.toast('Not while they can see you!', 'Get out of their sight and a block away from them, then pull in.', 'var(--red)');
          }
        } else if (p.speed > ARRIVE_SPEED) {
          if (this.warnTimer <= 0) {
            this.warnTimer = 3;
            hud.toast('Slow down', 'Pull up at the light.', 'var(--amber)');
          }
        } else {
          this._complete();
          return;
        }
      }
    }

    const next = this.stops[this.stopIndex];
    if (!this.ghost) hud.setObjective(next ? next.objective || part.objective : part.goal.loseCops && this.copsOnYou ? 'Lose the cops' : part.goal.finalObjective || part.objective);
    this._updateStats();
  }

  /**
   * Can the cops see you pull into the safehouse? Only if they're chasing
   * you AND one of them is close by or has you in sight right now. Out of
   * sight and far enough away, you can slip in even mid-chase.
   */
  get copsWatching() {
    if (!this.copsOnYou) return false;
    const s = this.state, p = s.player.pos;
    return s.police.units.some((u) => u.seesPlayer ||
      Math.hypot(u.car.pos.x - p.x, u.car.pos.z - p.z) < COP_CLEAR_RADIUS);
  }

  _ghostNotice(text) {
    if (this.ghostWarn > 0) return;
    this.ghostWarn = 4;
    this.state.game.hud.toast('Ghost mode', text, 'var(--cyan)');
  }

  /** Where the on-screen marker points (the fugitive while chasing). */
  markerTarget() {
    if (!this.fugitive || this.ghost) return null;
    const fc = this.fugitive.car;
    return { pos: fc.pos.clone().setY(3), label: this.part.fugitive.name, color: SUSPECTS[this.part.fugitive.who]?.color || '#ff4050' };
  }

  _updateStats() {
    const s = this.state;
    const total = Object.keys(this.chapter.clues).length;
    const found = this.run.clues.size;
    const police = s.police;
    const status = this.ghost ? '<span><b style="color:var(--cyan)">GHOST MODE</b></span>'
      : !police.everSeen ? '' : police.searching
        ? '<span><b style="color:var(--safe)">SEARCHING</b></span>'
        : '<span class="warn"><b>PURSUIT</b></span>';
    const timer = this.timeLeft != null && !this.ghost
      ? `<span class="${this.timeLeft < 30 ? 'warn' : ''}">${this.part.goal.timerLabel || 'Time left'} <b>${formatTime(Math.max(0, this.timeLeft))}</b></span>` : '';
    const stops = this.stops.length ? `<span>Stops <b>${Math.min(this.stopIndex, this.stops.length)}/${this.stops.length}</b></span>` : '';
    const race = this.race && this.raceLead != null && !this.ghost
      ? `<span class="${this.raceLead < 0 ? 'warn' : ''}">${this.raceLead >= 0 ? 'You\'re ahead' : `${this.part.fugitive.name} is ahead`} <b>${Math.round(Math.abs(this.raceLead))} m</b></span>` : '';
    s.game.hud.setStats(`<span>Time <b>${formatTime(s.time)}</b></span>` + timer + stops + race +
      (total ? `<span>Clues <b>${found}/${total}</b></span>` : '') +
      (this.ghost ? '' : `<span${this.run.caught ? ' class="warn"' : ''}>Caught <b>${this.run.caught}</b></span>` +
      (this.part.noPolice ? '' : `<span>Heat <b style="color:var(--red)">${'★'.repeat(this.heat)}</b></span>`)) + status);
  }

  _complete() {
    this.done = true;
    audio.sfx(this.fugitive && !this.race && !this.tail ? 'crash' : 'door');
    this.state.game.hud.setMeter(0, '');
    finishPart(this.state, this);
  }

  /** Admin: finish this part right now. */
  adminSkip() {
    if (!this.done) this._complete();
  }

  teardown() {
    this.fugitive?.dispose();
    this.fugitive = null;
  }
}

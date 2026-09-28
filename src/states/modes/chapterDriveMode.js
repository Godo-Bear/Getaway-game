import * as THREE from 'three';
import { makeGlowMaterial } from '../../world/materials.js';
import { CHAPTERS } from '../../story/chapters.js';
import { SUSPECTS } from '../../story/crew.js';
import { getChapterRun } from '../../story/chapterRun.js';
import { finishPart, knownClues } from '../../story/chapterFlow.js';
import { FugitiveCar } from '../../ai/fugitive.js';
import { save } from '../../core/save.js';
import { formatTime, clamp } from '../../core/utils.js';
import { audio } from '../../core/audio.js';

// A story part played in a car (any chapter). The part's data decides:
//
//   goal.type 'safehouse' - get to a door, but lose the police first
//             'reach'     - get to a place (optionally before a timer runs out)
//             'chase'     - catch a fleeing car before it reaches its destination
//   clue       - one clue hidden in a park (amber dot on the minimap)
//   heat       - { start, max, riseEvery }: police pressure over time
//   roadblocks - { fromHeat, every, spikes }: roadblocks / spike strips ahead
//
// GHOST MODE (clue hunt): no police, no chase, no timer. Just find the clue.

const ARRIVE_RADIUS = 9;
const ARRIVE_SPEED = 15;       // m/s: you have to actually pull up
const CLUE_RADIUS = 7;
const CATCH_RADIUS = 11;

export class ChapterDriveMode {
  constructor(state, params) {
    this.state = state;
    this.chapter = CHAPTERS[params.chapterId || 'chapter1'];
    this.partIndex = params.part ?? this.chapter.parts.findIndex((p) => p.kind === 'drive');
    this.part = this.chapter.parts[this.partIndex];
    this.ghost = !!params.ghost;
    this.hudSections = ['tl', 'map', 'speedo', 'meter', 'controls', 'marker'];
    this.heat = this.part.heat?.start ?? 2;
    this.fugitive = null;
  }

  cityOptions() {
    return this.part.city;
  }

  build() {
    const s = this.state;
    const lm = s.city.landmarks;
    const goal = this.part.goal;
    this.goalPos = goal.block ? lm[goal.block].door : null;
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
    this.run = getChapterRun(s.game, this.chapter.id, { ghost: this.ghost });
    const g = s.city.graph;
    const st = part.start;
    const n = g.node(st.node[0], st.node[1]);
    s.placePlayer(n.x + st.offset[0], n.z + st.offset[1], st.heading);
    this.heat = part.heat?.start ?? 2;
    this.heatTimer = 0;
    this.warnTimer = 0;
    this.done = false;
    this.catchMeter = 0;
    this.timeLeft = part.goal.timer ?? null;
    const known = this.ghost ? knownClues(s.game, this.chapter.id) : this.run.clues;
    this.clueFound = part.clue ? known.has(part.clue.id) : true;
    if (this.clue) this.clue.group.visible = !this.clueFound;

    // The fleeing car (chase parts)
    this.fugitive?.dispose();
    this.fugitive = null;
    const f = part.fugitive;
    if (f && !this.ghost) {
      const dest = s.city.landmarks[part.goal.block].node;
      this.fugitive = new FugitiveCar(s.scene, s.city, dest, s.rng);
      const fn = g.node(f.startNode[0], f.startNode[1]);
      this.fugitive.place(fn, f.heading ?? Math.PI);
    }

    if (this.goalPos) s.beacon.set(this.goalPos.x, this.goalPos.z, part.goal.label, part.goal.color ?? 0x4dffa6);
    else s.beacon.hide();

    const hud = s.game.hud;
    hud.setPhase(`${this.chapter.title} · Part ${this.partIndex + 1}: ${part.title}`);
    hud.setObjective(this.ghost ? 'Clue hunt: find the missing clue' : part.objective);
    this._updateStats();

    if (first) {
      if (this.ghost) {
        s.showStoryCards([{ kicker: 'Clue hunt', title: part.title, lines: [
          'No police, no chase, no clock. The amber dot on the minimap marks the clue. Drive to the green light when you\'re done.',
        ] }], 'Drive');
      } else s.showStoryCards(part.intro, part.startLabel || 'Drive');
    } else hud.toast('Go!', part.objective, 'var(--amber)');
  }

  // --- hooks the driving state calls ------------------------------------
  copCount() {
    return this.ghost ? 0 : null; // null = use the heat level's normal count
  }

  roadblockRules() {
    const r = this.part.roadblocks;
    if (!r || this.ghost || this.heat < r.fromHeat) return null;
    return { roadblockEvery: r.every, spikes: r.spikes };
  }

  extraCars() {
    return this.fugitive ? [this.fugitive.car] : [];
  }

  simulate(dt) {
    if (!this.fugitive || this.done) return;
    if (this.fugitive.update(dt) === 'escaped') this._failed(this.part.fugitive.escapeTitle, this.part.fugitive.escapeText);
  }

  syncMeshes() {
    this.fugitive?.car.syncMesh();
  }

  minimapDots() {
    const dots = [];
    if (!this.clueFound && this.cluePos) dots.push({ x: this.cluePos.x, z: this.cluePos.z, color: '#ffb020', size: 1.6 });
    if (this.fugitive) dots.push({ x: this.fugitive.car.pos.x, z: this.fugitive.car.pos.z, color: '#ffffff', size: 1.8 });
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

    // Heat rises over time (or sooner if you ram cops), up to the part's max.
    this.heatTimer += dt;
    const h = part.heat;
    if (h && this.heat < h.max && this.heatTimer > h.riseEvery) {
      this.heatTimer = 0;
      this.heat++;
      hud.toast(`Heat level ${this.heat}`, this.heat >= (part.roadblocks?.fromHeat ?? 9) ? 'Roadblocks and spike strips ahead!' : 'More cruisers are joining the chase.', 'var(--red)');
    }

    // Clue
    if (!this.clueFound && this.cluePos) {
      this.clue.gem.rotation.y += dt * 2;
      this.clue.ring.rotation.z -= dt;
      if (Math.hypot(p.pos.x - this.cluePos.x, p.pos.z - this.cluePos.z) < CLUE_RADIUS) {
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

    // Chase: stay close to the fugitive (or ram them) to fill the catch meter.
    if (this.fugitive) {
      const fc = this.fugitive.car;
      const d = Math.hypot(fc.pos.x - p.pos.x, fc.pos.z - p.pos.z);
      if (fc.lastImpact > 5 && d < 6) this.catchMeter += 0.12;
      fc.lastImpact = 0;
      this.catchMeter = clamp(this.catchMeter + (d < CATCH_RADIUS ? dt * 0.3 : -dt * 0.08), 0, 1);
      if (this.catchMeter > 0.01 || d < CATCH_RADIUS * 2) {
        hud.setMeter(this.catchMeter, d < CATCH_RADIUS ? `Run ${part.fugitive.name} off the road!` : `Catch ${part.fugitive.name}`, 'var(--amber)');
      }
      if (this.catchMeter >= 1) { this._complete(); return; }
    }

    // Arrival
    this.warnTimer -= dt;
    if (this.goalPos && !this.fugitive) {
      const d = Math.hypot(p.pos.x - this.goalPos.x, p.pos.z - this.goalPos.z);
      if (d < ARRIVE_RADIUS) {
        if (part.goal.loseCops && this.copsOnYou && !this.ghost) {
          if (this.warnTimer <= 0) {
            this.warnTimer = 4;
            hud.toast('Not with cops on your tail!', 'Lose them first. Don\'t lead them here.', 'var(--red)');
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

    if (!this.ghost) hud.setObjective(part.goal.loseCops && this.copsOnYou ? 'Lose the cops' : part.objective);
    this._updateStats();
  }

  /** Where the on-screen marker points (the fugitive while chasing). */
  markerTarget() {
    if (!this.fugitive) return null;
    const fc = this.fugitive.car;
    return { pos: fc.pos.clone().setY(3), label: this.part.fugitive.name, color: SUSPECTS[this.part.fugitive.who].color };
  }

  _updateStats() {
    const s = this.state;
    const total = Object.keys(this.chapter.clues).length;
    const found = this.ghost ? knownClues(s.game, this.chapter.id).size : this.run.clues.size;
    const police = s.police;
    const status = this.ghost ? '<span><b style="color:var(--cyan)">CLUE HUNT</b></span>'
      : !police.everSeen ? '' : police.searching
        ? '<span><b style="color:var(--safe)">SEARCHING</b></span>'
        : '<span class="warn"><b>PURSUIT</b></span>';
    const timer = this.timeLeft != null && !this.ghost
      ? `<span class="${this.timeLeft < 30 ? 'warn' : ''}">${this.part.goal.timerLabel || 'Time left'} <b>${formatTime(Math.max(0, this.timeLeft))}</b></span>` : '';
    s.game.hud.setStats(`<span>Time <b>${formatTime(s.time)}</b></span>` + timer +
      `<span>Clues <b>${found}/${total}</b></span>` +
      (this.ghost ? '' : `<span${this.run.caught ? ' class="warn"' : ''}>Caught <b>${this.run.caught}</b></span>` +
      `<span>Heat <b style="color:var(--red)">${'★'.repeat(this.heat)}</b></span>`) + status);
  }

  _complete() {
    this.done = true;
    audio.sfx(this.fugitive ? 'crash' : 'door');
    finishPart(this.state, this);
  }

  teardown() {
    this.fugitive?.dispose();
    this.fugitive = null;
  }
}

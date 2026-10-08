import * as THREE from 'three';
import { buildChapter18Highway, GANTRY_Y, LANES } from '../../world/levels/chapter18Highway.js';
import { MovingPlatform } from '../../world/movingPlatform.js';
import { CHAPTERS } from '../../story/chapters.js';
import { getChapterRun } from '../../story/chapterRun.js';
import { finishPart } from '../../story/chapterFlow.js';
import { earn } from '../../gadgets/gadgets.js';
import { admin } from '../../core/admin.js';
import { diff } from '../../core/difficulty.js';
import { formatTime, clamp } from '../../core/utils.js';
import { audio } from '../../core/audio.js';

// Chapter 18, Part 2: the Silver Dragons' convoy on the Kōji Expressway.
//
//  Ryu lost the race, but her crew had already taken the gold from the Fox
//  Den: it's in a yellow car on the top deck of a car transporter, at the
//  front of a convoy of Dragon trucks doing 90 km/h out of the city. Juno
//  drives the van right up behind the last truck, and you climb out.
//  JUMP from roof to roof, truck to truck, to the transporter. The trucks
//  drift forward and back in their lanes, so the gaps open and close: wait
//  for a short one. LOW BRIDGES: overhead sign gantries sweep over the
//  convoy every so often; when the warning comes, crouch (C) flat on the
//  roof, or you're swept off. Fall onto the road and Juno picks you up
//  (back to the last checkpoint). Get into the gold car on the transporter.

const SPEED = 26;            // m/s: how fast the road and the city rush past
const GANTRY_EVERY = 13;     // seconds between low bridges
const WARN = 2.6;            // seconds of warning before one reaches you
const TIME = 150;            // before the convoy turns off into the Dragons' docks
const CASH = 1200;
const _v = new THREE.Vector3();

export class HighwayMode {
  constructor(state, params) {
    this.state = state;
    this.chapter = CHAPTERS[params.chapterId || 'chapter18'];
    this.partIndex = params.part ?? 1;
    this.part = this.chapter.parts[this.partIndex];
    this.hudSections = ['tl', 'meter', 'controls', 'marker'];
    this.weather = 'clear';
    this.weatherForced = true;
    this.time = 'night';
    this.indoors = true;   // (no crowd, no traffic: it's a convoy on an expressway)
  }

  get fallY() { return -30; }

  build() {
    const L = buildChapter18Highway();
    this.level = L;
    this.t = 0;
    this.platforms = L.trucks.map((t) => new MovingPlatform(L.world, t.mesh, t.boxes, this._truckPos(t, 0, new THREE.Vector3())));
    L.checkpoints = [
      { truck: 'van', local: new THREE.Vector3(0, 2.45, 0.8), yaw: 0 },
      { truck: 'C', local: new THREE.Vector3(0, 4.05, 2.5), yaw: 0 },
    ];
    L.spawn = L.spawn.clone();
    L.spawn.yaw = 0;
    return L;
  }

  _truckPos(t, time, out) {
    return out.set(t.x, 0, t.z + t.amp * Math.sin((time / t.period) * Math.PI * 2 + t.phase));
  }

  _truck(id) { return this.level.trucks.findIndex((t) => t.id === id); }

  start(first) {
    const s = this.state;
    this.run = getChapterRun(s.game, this.chapter.id);
    this.done = false;
    this.cp = 0;
    this._toCheckpoint(null);
    const hud = s.game.hud;
    hud.setPhase(`${this.chapter.title} · Part ${this.partIndex + 1}: ${this.part.title}`);
    hud.setObjective(this.part.objective);
    if (first && !s.game.speedrun) s.showStoryCards(this.part.intro, this.part.startLabel || 'Go');
  }

  /** Back to a checkpoint: the convoy as it was, you on that truck's roof. */
  _toCheckpoint(title, msg, color = 'var(--amber)') {
    const s = this.state, L = this.level, cp = L.checkpoints[this.cp];
    this.t = 0;
    L.trucks.forEach((t, i) => this.platforms[i].moveTo(this._truckPos(t, 0, _v)));
    const i = this._truck(cp.truck);
    const pos = this.platforms[i].pos.clone().add(cp.local);
    s.placePlayer(pos, cp.yaw);
    this.timeLeft = (this.cp === 0 ? TIME : TIME * 0.65) * diff().timer;
    this.nextGantry = 7;
    for (const g of L.gantries) { g.active = false; g.g.visible = false; }
    this.warned = false;
    if (title) s.flash(title, msg, color);
  }

  onRespawnKey() { this._toCheckpoint('Checkpoint', 'Back to the last checkpoint.', 'var(--cyan)'); }
  onFall() { this._fell(); }

  _fell() {
    this._toCheckpoint('Off the truck!', 'You hit the road and rolled. Juno swerves in, scoops you up and puts you back on the convoy. Wait for the gap to close before you jump.');
  }

  audioMix() {
    return { wind: 0.9, city: 0.1, engine: 0.45, siren: 0, music: 0.6, intensity: 0.75 + (this.warned ? 0.2 : 0) };
  }

  update(dt) {
    if (this.done) return;
    const s = this.state, L = this.level, p = s.player, pos = p.pos, hud = s.game.hud, input = s.game.input;
    this.t += dt;
    audio.engine(55, 0.35);

    // --- The convoy: each truck drifts forward and back in its lane (carrying you)
    L.trucks.forEach((t, i) => this.platforms[i].moveTo(this._truckPos(t, this.t, _v), p));
    // --- The world rushes past
    const span = L.chunkLen * L.chunks.length;
    for (const c of L.chunks) { c.position.z += SPEED * dt; if (c.position.z > 240) c.position.z -= span; }
    L.roadTex.offset.y += (SPEED * dt) / 12;
    for (const b of L.bikers) { b.t += dt; b.mesh.position.x = LANES[b.lane] + Math.sin(b.t * 0.7) * 0.8; b.mesh.position.z = b.z + Math.sin(b.t * 0.31) * 6; b.mesh.rotation.z = -Math.cos(b.t * 0.7) * 0.12; }
    L.ryu.position.x = LANES[1] + Math.sin(this.t * 0.2) * 1.2;
    L.goldGlow.material.opacity = 0.6 + Math.sin(this.t * 4) * 0.25;

    // --- Low bridges
    this.nextGantry -= dt;
    if (this.nextGantry <= 0) {
      const g = L.gantries.find((x) => !x.active);
      if (g) { g.active = true; g.z = -260; g.g.visible = true; }
      this.nextGantry = GANTRY_EVERY * (0.85 + Math.random() * 0.3);
    }
    let soon = Infinity;
    for (const g of L.gantries) {
      if (!g.active) continue;
      const prev = g.z;
      g.z += SPEED * dt;
      g.g.position.z = g.z;
      g.lamp.visible = Math.sin(this.t * 14) > 0;
      if (g.z < pos.z) soon = Math.min(soon, (pos.z - g.z) / SPEED);
      // it reaches you: standing up on a roof, it sweeps you off
      if (prev < pos.z && g.z >= pos.z && pos.y + p.height > GANTRY_Y + 0.05 && !admin.flag('god')) {
        audio.sfx('land', { vol: 1 });
        this._toCheckpoint('Low bridge!', 'The sign gantry swept you right off the roof. When the warning comes, crouch (C) flat on the roof until it\'s gone over.', 'var(--red)');
        return;
      }
      if (g.z > 140) { g.active = false; g.g.visible = false; }
    }
    if (soon < WARN && pos.y > 2) {
      if (!this.warned) { this.warned = true; audio.sfx('alarm', { vol: 0.35, rate: 1.5 }); }
      hud.setMeter(1 - soon / WARN, `LOW BRIDGE in ${soon.toFixed(1)}s: CROUCH (C)!`, 'var(--red)');
    } else {
      if (soon === Infinity) this.warned = false;
      hud.setMeter(0, '');
    }

    // --- Off the trucks, onto the road
    if (pos.y < 0.6 && p.grounded) { this._fell(); return; }

    // --- Checkpoint: the middle truck
    const onTruck = (id) => this.platforms[this._truck(id)].carries(p);
    if (this.cp === 0 && onTruck('C')) { this.cp = 1; audio.sfx('checkpoint', { vol: 0.5 }); hud.toast('Checkpoint', 'Halfway along the convoy.', 'var(--cyan)', 2); }

    // --- The gold car on the transporter's upper deck
    const E = this.platforms[this._truck('E')];
    const atCar = pos.y > E.pos.y + 3.6 && Math.abs(pos.x - E.pos.x) < 1.6 && pos.z > E.pos.z + 1.2 && pos.z < E.pos.z + 7.5;
    s.setAction(atCar ? 'Get in the gold car' : null);
    if (atCar && input.wasPressed('interact')) { this._finish(); return; }

    // --- The clock: the convoy turns off for the Dragons' docks
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.cp = 0;
      this._toCheckpoint('They got away', 'The convoy turned off into the Dragons\' docks and the gates shut. Try again: don\'t wait too long at each gap.', 'var(--red)');
      return;
    }

    _v.set(E.pos.x, E.pos.y + 6.2, E.pos.z + 4.4);
    hud.setMarker(_v, s.camera, 'The gold car', 'var(--amber)', Math.hypot(_v.x - pos.x, _v.z - pos.z));
    hud.setStats(`<span class="${this.timeLeft < 30 ? 'warn' : ''}">Docks in <b>${formatTime(Math.max(0, this.timeLeft))}</b></span>` +
      `<span>Speed <b>${Math.round(SPEED * 3.6)}</b> km/h</span><span>Time <b>${formatTime(s.time)}</b></span><span${this.run.caught ? ' class="warn"' : ''}>Caught <b>${this.run.caught}</b></span>`);
  }

  _finish() {
    if (this.done) return;
    this.done = true;
    const s = this.state;
    s.setAction(null);
    s.game.hud.setMeter(0, '');
    earn(s.game, CASH, '', { quiet: true });
    audio.sfx('win');
    finishPart(s, this);
  }

  adminSkip() { this._finish(); }

  teardown() {
    this.state.setAction?.(null);
  }
}

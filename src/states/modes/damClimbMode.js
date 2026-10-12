import * as THREE from 'three';
import { buildChapter24Dam, TIERS, ledgeY, faceZ, LADDER_X, CHUTE_HALF, DOOR, TOP } from '../../world/levels/chapter24Dam.js';
import { CHAPTERS } from '../../story/chapters.js';
import { getChapterRun } from '../../story/chapterRun.js';
import { finishPart } from '../../story/chapterFlow.js';
import { admin } from '../../core/admin.js';
import { diff } from '../../core/difficulty.js';
import { formatTime, clamp } from '../../core/utils.js';
import { audio } from '../../core/audio.js';
import { rumble } from '../../core/haptics.js';

// Chapter 24, Part 3: THE SPILLWAY (part id 'spillway').
//
// Climb the face of the Coyote Dam, at midnight, in a storm: up the iron
// ladders from walkway to walkway (each ladder is somewhere else along the
// dam, so you walk every walkway), jump the broken bits, and get to the door
// of the inspection gallery at the top.
//   - THE SPILLWAYS: four chutes down the face. Every few seconds a gate opens
//     and the water comes thundering down the chute. Its lamp (and the little
//     lamps either side of it on every walkway) goes AMBER first, then RED.
//     Caught in it: you're washed off, back to the last walkway you reached.
//     Green: run across.

const OPEN = 3.4, WARN = 1.7, PERIOD = 9.2;  // s
const FALL = 26;                             // m/s: how fast the water comes down the face
const GATE_Y = TOP - 8;
const _v = new THREE.Vector3();
const GREEN = new THREE.Color(0x4dffa6), AMBER = new THREE.Color(0xffa020), RED = new THREE.Color(0xff2a1a);

export class DamClimbMode {
  constructor(state, params) {
    this.state = state;
    this.chapter = CHAPTERS[params.chapterId || 'chapter24'];
    this.partIndex = params.part ?? 2;
    this.part = this.chapter.parts[this.partIndex];
    this.hudSections = ['tl', 'meter', 'controls', 'marker'];
    this.weather = this.part.weather || 'storm';
    this.weatherForced = true;
    this.time = this.part.time || 'night';
  }

  get fallY() { return -2.5; }

  build() {
    const L = buildChapter24Dam();
    this.level = L;
    return L;
  }

  start(first) {
    const s = this.state;
    this.run = getChapterRun(s.game, this.chapter.id);
    this.done = false;
    this.t = 0;
    this.cp = 0;
    this.told = {};
    this.washT = 0;
    this.washed = 0;
    // each spillway runs on its own clock (easier on Easy: longer gaps between)
    this.period = PERIOD * (diff().id === 'easy' ? 1.25 : diff().id === 'hard' ? 0.9 : 1);
    this.level.chutes.forEach((c, i) => { c.front = c.tail = GATE_Y; c.phase = [0.15, 0.55, 0.3, 0.75][i] * this.period; });
    const hud = s.game.hud;
    if (first) hud.showControls(`<kbd>WASD</kbd> move &nbsp; <kbd>Space</kbd> jump &nbsp; walk into a ladder and hold <kbd>W</kbd> to climb<br>Spillway lamps: green = go, amber = it\'s coming, red = water &nbsp; <kbd>R</kbd> last walkway &nbsp; <kbd>P</kbd> pause`);
    hud.setPhase(`${this.chapter.title} · Part ${this.partIndex + 1}: ${this.part.title}`);
    hud.setObjective(this.part.objective);
    if (first && !s.game.speedrun) s.showStoryCards(this.part.intro, this.part.startLabel || 'Climb');
  }

  get inputLocked() { return this.washT > 0; }

  /** Where walkway k's checkpoint is: by the top of the ladder you came up. */
  _cpSpawn(k) {
    if (k === 0) return { pos: this.level.spawn, yaw: this.level.spawn.yaw };
    const x = LADDER_X[k - 1], next = k < TIERS ? LADDER_X[k] : DOOR.x;
    return { pos: new THREE.Vector3(x, ledgeY(k) + 0.05, faceZ(k - 1) - 1.3), yaw: next > x ? -Math.PI / 2 : Math.PI / 2 };
  }

  _toCheckpoint(title, msg, color) {
    const s = this.state, c = this._cpSpawn(this.cp);
    s.player.ladder = null;
    s.placePlayer(c.pos, c.yaw);
    s.flash(title, msg, color);
  }

  onRespawnKey() { this._toCheckpoint('Checkpoint', 'Back to the last walkway.', 'var(--cyan)'); }

  onFall() {
    audio.sfx('splash');
    this._toCheckpoint('Splash!', 'Into the river. Back to the last walkway.', 'var(--cyan)');
  }

  audioMix() {
    const near = Math.min(...this.level.chutes.map((c) => (c.tail > c.front ? Math.abs(c.x - this.state.player.pos.x) : 99)));
    return { wind: 0.45, city: 0, engine: 0, siren: 0, music: 0.4, intensity: 0.45 + (near < 12 ? 0.25 : 0) };
  }

  _tell(key, title, text, color = 'var(--amber)', t = 4) {
    if (this.told[key]) return;
    this.told[key] = true;
    this.state.game.hud.toast(title, text, color, t);
  }

  /** A chute's state now: 'dry', 'warn' (s to go) or 'open'. */
  _phase(c) {
    const t = (this.t + c.phase) % this.period, openAt = this.period - OPEN;
    if (t >= openAt) return { st: 'open', left: this.period - t };
    if (t >= openAt - WARN) return { st: 'warn', left: openAt - t };
    return { st: 'dry', left: openAt - WARN - t };
  }

  update(dt) {
    if (this.done) return;
    const s = this.state, p = s.player, pos = p.pos, hud = s.game.hud, L = this.level;
    this.t += dt;

    // --- washed off: carried away for a moment, then back to the walkway
    if (this.washT > 0) {
      this.washT -= dt;
      if (this.washT <= 0) this._toCheckpoint('Washed off!', 'The spillway caught you. Wait for its lamps to go green, then run.', 'var(--red)');
    }

    // --- the spillways
    let hitBy = null;
    for (const c of L.chutes) {
      const ph = this._phase(c);
      c.ph = ph;
      if (ph.st === 'open') {
        if (c.tail < GATE_Y) { c.front = c.tail = GATE_Y; } // (a fresh start)
        c.front = Math.max(-1, c.front - FALL * dt);
        if (!c.roared) { c.roared = true; if (Math.abs(c.x - pos.x) < 30) audio.sfx('splash', { vol: 0.8 }); }
      } else {
        c.roared = false;
        if (c.front < GATE_Y) { c.tail -= FALL * dt; if (c.tail <= c.front || c.tail < -1) c.front = c.tail = GATE_Y; }
      }
      const col = ph.st === 'open' ? RED : ph.st === 'warn' ? (Math.sin(this.t * 18) > 0 ? AMBER : GREEN) : GREEN;
      c.lampMat.color.copy(col);
      const wet = c.tail > c.front + 0.1;
      for (const sh of c.sheets) {
        const lo = Math.max(sh.y0, c.front), hi = Math.min(sh.y1, c.tail);
        sh.curtain.visible = wet && hi > lo + 0.05;
        if (sh.curtain.visible) { sh.curtain.position.y = lo; sh.curtain.scale.y = hi - lo; }
        sh.flat.visible = wet && c.front <= sh.y0 + 0.5 && c.tail >= sh.y0;
        sh.tex.offset.y += dt * 1.8;
      }
      // spray where it lands
      c.spray.forEach((sp, i) => {
        sp.visible = wet;
        if (!wet) return;
        const k = (this.t * 1.3 + i / c.spray.length) % 1;
        const floorY = Math.max(0, Math.floor(c.front / 12) * 12);
        sp.position.set(c.x + Math.sin(i * 2.3 + this.t) * 2.4, floorY + 0.3 + k * 2.4, faceZ(Math.min(TIERS, floorY / 12)) + 1.2 + k);
        sp.scale.setScalar(1.6 + k * 2);
        sp.material.opacity = 0.45 * (1 - k);
      });
      if (wet && this.washT <= 0 && Math.abs(pos.x - c.x) < CHUTE_HALF + 0.2 && pos.y + 1.6 > c.front && pos.y < c.tail) hitBy = c;
    }
    if (hitBy && !admin.flag('god')) {
      this.washT = 0.75;
      this.washed++;
      p.ladder = null;
      p._setState('air');
      p.vel.set(0, -2, 9);
      audio.sfx('splash', { vol: 1 });
      s.cam.addLandingDip?.(6);
      rumble(0.8, 300);
    }

    // --- checkpoints: every walkway you reach
    for (let k = TIERS; k > this.cp; k--) {
      if (p.grounded && Math.abs(pos.y - ledgeY(k)) < 0.6 && pos.z < faceZ(k - 1) + 0.3 && pos.z > faceZ(k) - 0.3) {
        this.cp = k;
        audio.sfx('checkpoint', { vol: 0.5 });
        hud.toast(`Walkway ${k} of ${TIERS}`, k === 1 ? 'Checkpoint. Now along the walkway to the next ladder, past the spillways.' : k === TIERS ? 'The top walkway! The gallery door is in the middle of the dam.' : 'Checkpoint.', 'var(--cyan)', 3);
        break;
      }
    }
    // fell off (down a gap)?
    if (this.washT <= 0 && p.state !== 'ladder' && pos.y < ledgeY(this.cp) - 4) {
      audio.sfx('land', { vol: 0.8 });
      this._toCheckpoint('You fell', 'Take a run at the broken bits of walkway, and jump.', 'var(--amber)');
    }

    // --- the door at the top
    if (this.cp === TIERS && Math.hypot(pos.x - DOOR.x, pos.z - (DOOR.z + 1.2)) < 1.5 && Math.abs(pos.y - DOOR.y) < 1) { this._finish(); return; }
    L.ring.rotation.z += dt;

    // --- the panel, the meter (the spillway nearest you, where you're going), the marker
    const goalX = this.cp < TIERS ? LADDER_X[this.cp] : DOOR.x;
    let near = null, nd = 14;
    for (const c of L.chutes) {
      const ahead = (c.x - pos.x) * Math.sign(goalX - pos.x || 1);
      const d = Math.abs(c.x - pos.x);
      if ((ahead > -CHUTE_HALF - 1 || d < CHUTE_HALF + 1) && d < nd) { nd = d; near = c; }
    }
    if (this.washT > 0) hud.setMeter(1, 'WASHED OFF!', 'var(--red)');
    else if (near) {
      const ph = near.ph;
      if (ph.st === 'open' || near.tail > near.front + 0.1) hud.setMeter(1, 'SPILLWAY OPEN: wait for green', 'var(--red)');
      else if (ph.st === 'warn') hud.setMeter(ph.left / WARN, 'Spillway opening! Stay out', '#ffa020');
      else hud.setMeter(ph.left / (this.period - OPEN - WARN), `Spillway closed: GO! (${Math.ceil(ph.left)} s)`, 'var(--safe)');
      this._tell('chute', 'The spillways', 'When a spillway\'s lamps go amber, the water is coming. Wait for green, then run across.', 'var(--amber)', 4.5);
    } else hud.setMeter(0, '');
    if (this.cp < TIERS) hud.setMarker(_v.set(goalX, ledgeY(this.cp) + 2.5, faceZ(this.cp) + 0.4), s.camera, 'Ladder', 'var(--amber)', Math.hypot(goalX - pos.x, ledgeY(this.cp) - pos.y));
    else hud.setMarker(_v.set(DOOR.x, DOOR.y + 2.2, DOOR.z + 1), s.camera, 'Gallery door', 'var(--safe)', Math.abs(DOOR.x - pos.x));
    hud.setStats(`<span>Walkway <b>${this.cp}/${TIERS}</b></span><span>Height <b>${Math.max(0, Math.round(pos.y))} m</b></span>` +
      `<span>Washed off <b>${this.washed}</b></span><span>Time <b>${formatTime(s.time)}</b></span>`);
  }

  _finish() {
    if (this.done) return;
    this.done = true;
    const s = this.state;
    s.game.hud.setMeter(0, '');
    s.game.hud.setMarker(null);
    audio.sfx('win');
    finishPart(s, this);
  }

  adminSkip() { this._finish(); }

  teardown() {}
}

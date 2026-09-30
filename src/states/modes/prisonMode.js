import * as THREE from 'three';
import { buildChapter6Prison } from '../../world/levels/chapter6Prison.js';
import { makeGlowMaterial } from '../../world/materials.js';
import { GuardSquad } from '../../ai/guards.js';
import { Searchlight } from '../../ai/searchlight.js';
import { PlayerModel } from '../../player/playerModel.js';
import { MiniGame } from '../../ui/miniGame.js';
import { CHAPTERS } from '../../story/chapters.js';
import { SUSPECTS } from '../../story/crew.js';
import { getChapterRun } from '../../story/chapterRun.js';
import { finishPart } from '../../story/chapterFlow.js';
import { admin } from '../../core/admin.js';
import { diff } from '../../core/difficulty.js';
import { formatTime, clamp } from '../../core/utils.js';
import { audio } from '../../core/audio.js';

// Chapter 6, Part 3: the breakout from Blackwater Prison.
//
//   Searchlights - four watchtowers sweep bright circles across the yard.
//                  In a circle AND in view of the tower = spotted fast. Cover
//                  (crates, barriers, the bus) blocks the tower's view.
//   Guards       - torches (yellow cones); knock them out from behind (E).
//   Uniform      - a guard uniform in the dock office: guards only notice you
//                  close up (the searchlights still check everyone).
//   The cell     - hack Ricky's cell keypad (mini-game). Then the ALARM:
//                  guards on alert, searchlights faster and hunting, and a
//                  lockdown countdown.
//   Ricky        - follows you once he's out (he keeps up, don't worry).
//   The way out  - up the stairs to the top of the east wall, onto Mags's
//                  zip line, down to her boat at the pier.

const LOCKDOWN = 80;       // seconds after the alarm (x difficulty)
const UNIFORM = { hoodie: 0x24324a, trousers: 0x1a2130, mask: 0xc4946f, gloves: 0x1a2130 };
const JUMPSUIT = { hoodie: 0xe0701c, trousers: 0xe0701c, mask: 0x8d5a3b, skin: 0x8d5a3b, gloves: 0x8d5a3b, shoes: 0x222222 };

export class PrisonMode {
  constructor(state, params) {
    this.state = state;
    this.chapter = CHAPTERS[params.chapterId || 'chapter6'];
    this.partIndex = params.part || 0;
    this.part = this.chapter.parts[this.partIndex];
    this.hudSections = ['tl', 'meter', 'controls', 'marker'];
    this.weather = 'clear';
    this.time = 'night';
    this.indoors = true;
    this.mini = null;
  }

  get inputLocked() { return !!this.mini; }
  /** Guards, as far as the Flashbang is concerned */
  get officers() { return this.guards; }

  build() {
    const L = buildChapter6Prison();
    L.spawn.yaw = L.checkpoints[0].yaw;
    this.level = L;
    this.lights = L.towers.map((t) => new Searchlight(L.group, L.world, t));
    this.guards = new GuardSquad(L.group, L.world, L.guardRoutes.map((route) => ({ route })), { sight: diff().guardSight, look: { hoodie: 0x24324a, trousers: 0x1a2130, mask: 0xc4946f, gloves: 0x1a2130 } });
    const ring = (pos, color, r = 1.1) => {
      const m = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.25, 32), makeGlowMaterial(color, 0.8));
      m.rotation.x = -Math.PI / 2;
      m.position.set(pos.x, pos.y + 0.04, pos.z);
      L.group.add(m);
      return m;
    };
    this.uniformRing = ring(L.spots.uniform, 0x8ab4ff, 0.9);
    this.keypadRing = ring(L.spots.keypad, 0x39e6ff);
    this.landingRing = ring(L.spots.landing, 0xffd040, 1.2);
    // Prisoners in the other cells (scenery), and Ricky
    for (const [x, z] of L.inmates) {
      const m = new PlayerModel(JUMPSUIT, { bag: false });
      m.update(0, { pos: new THREE.Vector3(x, 0, z), vel: new THREE.Vector3(), facing: 0, state: 'ground', horizontalSpeed: 0, mantleProgress: 0, stateTime: 0, stumbleTimer: 0, mantle: null, wallRun: null });
      L.group.add(m.root);
    }
    this.ricky = new PlayerModel({ ...JUMPSUIT, skin: 0xc4946f, mask: 0xc4946f }, { bag: false });
    this.rickyBody = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), facing: 0, state: 'ground', horizontalSpeed: 0, mantleProgress: 0, stateTime: 0, stumbleTimer: 0, mantle: null, wallRun: null };
    L.group.add(this.ricky.root);
    return L;
  }

  afterBuild() {
    this.state.player.zipLines = []; // (Mags's zip line only counts once Ricky is with you)
  }

  start(first) {
    const s = this.state, L = this.level;
    this.run = getChapterRun(s.game, this.chapter.id);
    this.done = false;
    this.cp = 0;
    this.spotted = 0;
    this.freed = false;
    this.alarm = false;
    this.lockdown = 0;
    this.warnT = 0;
    this.trail = [];
    this._closeMini();
    this.miniBlocked = false;
    this._setDisguise(false);
    L.cellDoorBox.disabled = false;
    L.cellDoor.position.x = 12;
    L.keypad.material.emissive.setHex(0xff3030);
    this.rickyBody.pos.copy(L.spots.cell);
    this.rickyBody.facing = 0;
    s.player.zipLines = [];
    this.guards.reset();
    this.guards.setAlert(false);
    for (const l of this.lights) l.reset();
    const hud = s.game.hud;
    hud.setPhase(`${this.chapter.title} · Part ${this.partIndex + 1}: ${this.part.title}`);
    hud.setObjective(this.part.objective);
    if (first && !s.game.speedrun) s.showStoryCards(this.part.intro, this.part.startLabel || 'Go');
  }

  _setDisguise(on) {
    this.disguised = on;
    this.state.model?.setOutfit(on ? UNIFORM : null);
  }

  _toCheckpoint(title, msg, color = 'var(--red)') {
    const s = this.state, cp = this.level.checkpoints[this.cp];
    this._closeMini();
    s.placePlayer(cp.spawn, cp.yaw);
    s.flash(title, msg, color);
    this.spotted = 0;
    this.trail = [];
    if (this.freed) this.rickyBody.pos.copy(cp.spawn).add(new THREE.Vector3(1.2, 0, 1.2));
    this.guards.reset();
    this.guards.setAlert(this.alarm);
    for (const l of this.lights) { l.reset(); l.alert = this.alarm; }
  }

  _caught(title, msg) {
    if (admin.flag('god')) { this.spotted = 0; return; }
    this.run.caught++;
    audio.sfx('caught');
    if (this.disguised) { this._setDisguise(false); msg += ' (They took the uniform.)'; }
    if (this.alarm) this.lockdown = LOCKDOWN * diff().timer;
    this._toCheckpoint(title, msg);
  }

  onRespawnKey() { this._toCheckpoint('Checkpoint', 'Back to the last checkpoint.', 'var(--cyan)'); }
  onFall() { this._toCheckpoint('Splash!', 'You fell in the sea. Back to the last checkpoint.', 'var(--cyan)'); }

  audioMix() {
    return { siren: this.alarm ? 0.3 : 0, wind: 0.15, city: 0, music: 0.5, intensity: this.alarm ? 0.85 : 0.3 + this.spotted * 0.6 };
  }

  update(dt) {
    if (this.done) return;
    const s = this.state, L = this.level, p = s.player, pos = p.pos, hud = s.game.hud, input = s.game.input, d = diff();
    const near = (v, r = 1.6) => Math.hypot(pos.x - v.x, pos.z - v.z) < r && Math.abs(pos.y - v.y) < 2;

    // --- The uniform
    if (!this.disguised && near(L.spots.uniform, 1.4)) {
      this._setDisguise(true);
      audio.sfx('clue', { vol: 0.5 });
      hud.toast('Guard uniform', 'Guards only notice you close up now (walk, don\'t run). The searchlights still check everyone.', '#8ab4ff', 5);
    }
    this.uniformRing.visible = !this.disguised;

    // --- Searchlights and guards
    for (const l of this.lights) l.update(dt, this.alarm ? pos : null);
    const lit = !s.concealed && this.lights.some((l) => l.lights(pos, p.height));
    const blending = this.disguised && p.horizontalSpeed < 5 && p.height > 1.3;
    const seenByGuard = this.guards.update(dt, p, s.concealed, { closeOnly: blending });
    if (this.guards.bodyFound && !this.guards.alert) {
      this.guards.setAlert(true);
      hud.toast('Guard down!', 'A guard found the one you knocked out. They\'re all on alert.', 'var(--red)', 4);
    }
    const fill = (lit ? dt / 0.6 : 0) + (seenByGuard ? dt / 0.8 : 0);
    this.spotted = clamp(this.spotted + (fill ? fill * d.fill : -dt * 0.5), 0, 1);
    if (this.spotted > 0.01 && !this.mini) hud.setMeter(this.spotted, lit ? 'SEARCHLIGHT! Get into cover' : seenByGuard ? 'A guard can see you!' : 'Hidden', lit || seenByGuard ? 'var(--red)' : '#8a8f9c');
    else if (!this.mini) hud.setMeter(0, '');
    if (this.spotted >= 1) {
      this._caught('Spotted!', lit ? 'A searchlight caught you. Keep crates, walls or the bus between you and the towers.' : 'A guard saw you. Stay out of the torch beams.');
      return;
    }

    // --- Sneak takedowns
    const target = !this.mini ? this.guards.takedownTarget(p) : null;
    s.setAction(target ? 'Knock out' : null);
    if (target && input.wasPressed('interact')) {
      this.guards.takedown(target);
      s.setAction(null);
      audio.sfx('land', { vol: 1 });
      hud.toast('Knocked out', '', 'var(--amber)', 1.5);
    }

    // --- Checkpoints
    if (this.cp < 1 && pos.z < -22.5 && Math.abs(pos.x) < 24) { this.cp = 1; hud.toast('Checkpoint', 'D Block', 'var(--cyan)', 2); audio.sfx('checkpoint', { vol: 0.6 }); }

    // --- Ricky's cell: hack the keypad
    if (this.mini) {
      if (input.wasPressed('crouch')) { this._closeMini(); this.miniBlocked = true; }
      else {
        const r = this.mini.update(dt, input.wasPressed('jump'));
        if (r === 'miss') this.spotted = Math.min(0.95, this.spotted + 0.1);
        if (r === 'done') { this._closeMini(); this._freeRicky(); }
      }
    } else if (!this.freed) {
      const at = near(L.spots.keypad, 1.5);
      if (!at) this.miniBlocked = false;
      else if (!this.miniBlocked) this.mini = new MiniGame({ type: 'hack', title: 'Opening Ricky\'s cell', hint: 'Jump (Space / A / tap) when it lines up · C to step away' });
    }
    this.keypadRing.visible = !this.freed;

    // --- Ricky: in his cell, then following you
    this._updateRicky(dt);

    // --- The way out
    this.landingRing.visible = this.freed;
    if (!this.freed && near(L.spots.landing, 2.5)) {
      this.warnT -= dt;
      if (this.warnT <= 0) { this.warnT = 4; hud.toast('Not without Ricky!', 'He\'s in D Block, the cell at the east end of the corridor.', 'var(--amber)'); }
    }
    if (this.freed && pos.x > 62 && pos.y > 0.4) { this._escape(); return; }

    // --- Lockdown countdown after the alarm
    if (this.alarm) {
      this.lockdown -= dt;
      if (this.lockdown <= 0) { this._caught('Lockdown', 'The guards sealed the yard. As soon as Ricky\'s out, run for the east wall stairs.'); return; }
    }

    this._updateMarker(pos);
    hud.setStats(`<span>Time <b>${formatTime(s.time)}</b></span>` +
      (this.disguised ? '<span><b style="color:#8ab4ff">IN UNIFORM</b></span>' : '') +
      (this.alarm ? `<span class="warn">Lockdown in <b>${formatTime(Math.max(0, this.lockdown))}</b></span>` : `<span${this.run.caught ? ' class="warn"' : ''}>Caught <b>${this.run.caught}</b></span>`));
  }

  _freeRicky() {
    const s = this.state, L = this.level, hud = s.game.hud;
    this.freed = true;
    L.cellDoorBox.disabled = true;
    L.cellDoor.position.x = 12 - 2.1; // (slides open)
    L.keypad.material.emissive.setHex(0x30ff70);
    this.cp = 2;
    audio.sfx('door');
    // The alarm (a cell opening without a guard's key card sets it off)
    this.alarm = true;
    this.lockdown = LOCKDOWN * diff().timer;
    this.guards.setAlert(true);
    for (const l of this.lights) l.alert = true;
    s.player.zipLines = [L.zip];
    audio.sfx('sting');
    hud.setObjective('Get Ricky over the east wall');
    hud.toast('Ricky is out!', `${SUSPECTS.ricky.name}: "About time! Somebody hit the alarm... that was me opening the door, wasn't it. RUN! East wall, I'm right behind you."`, 'var(--red)', 7);
  }

  _updateRicky(dt) {
    const b = this.rickyBody, p = this.state.player.pos;
    if (!this.freed) {
      b.horizontalSpeed = 0;
      b.facing = Math.atan2(p.x - b.pos.x, p.z - b.pos.z);
      this.ricky.update(dt, b);
      return;
    }
    // Remember where you've been; Ricky follows a few steps behind
    const last = this.trail[this.trail.length - 1];
    if (!last || Math.hypot(last.x - p.x, last.z - p.z, last.y - p.y) > 0.35) {
      this.trail.push(p.clone());
      if (this.trail.length > 60) this.trail.shift();
    }
    const target = this.trail[Math.max(0, this.trail.length - 7)] || p;
    const dx = target.x - b.pos.x, dy = target.y - b.pos.y, dz = target.z - b.pos.z, dist = Math.hypot(dx, dz);
    if (Math.hypot(p.x - b.pos.x, p.z - b.pos.z) > 16) {
      b.pos.copy(target); // (fell behind: catch up)
    } else if (dist > 0.05) {
      const step = Math.min(dist, 9.5 * dt);
      b.pos.x += (dx / dist) * step;
      b.pos.z += (dz / dist) * step;
      b.pos.y += dy * Math.min(1, dt * 10);
      b.facing = Math.atan2(dx, dz);
    }
    b.horizontalSpeed = dist > 0.3 ? Math.min(9, dist * 3) : 0;
    this.ricky.update(dt, b);
  }

  _escape() {
    this.done = true;
    const s = this.state;
    s.setAction(null);
    s.game.hud.setMeter(0, '');
    this.rickyBody.pos.copy(s.player.pos).add(new THREE.Vector3(1.2, 0, 0.8));
    audio.sfx('win');
    finishPart(s, this);
  }

  _updateMarker(pos) {
    const s = this.state, hud = s.game.hud, S = this.level.spots;
    let t, label, color = 'var(--cyan)';
    if (!this.freed) {
      if (pos.z > -22.5) { t = new THREE.Vector3(0, 0, -22); label = 'D Block'; }
      else { t = S.keypad; label = 'Ricky\'s cell'; }
    } else if (pos.x < 42 || pos.y < 6) { t = S.landing; label = 'East wall: zip line'; color = 'var(--amber)'; }
    else { t = S.pier; label = 'Mags\'s boat'; color = 'var(--safe)'; }
    this._mk ||= new THREE.Vector3();
    this._mk.set(t.x, t.y + 1.8, t.z);
    hud.setMarker(this._mk, s.camera, label, color, Math.hypot(t.x - pos.x, t.z - pos.z));
  }

  _closeMini() {
    this.mini?.close();
    this.mini = null;
  }

  adminSkip() {
    if (!this.done) { if (!this.freed) this._freeRicky(); this._escape(); }
  }

  teardown() {
    this._closeMini();
    this.state.setAction?.(null);
    this.state.model?.setOutfit(null);
    this.guards?.dispose();
    for (const l of this.lights || []) l.dispose();
  }
}

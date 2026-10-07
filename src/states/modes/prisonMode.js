import * as THREE from 'three';
import { buildChapter6Prison } from '../../world/levels/chapter6Prison.js';
import { makeGlowMaterial } from '../../world/materials.js';
import { GuardSquad, huntMessages } from '../../ai/guards.js';
import { Searchlight } from '../../ai/searchlight.js';
import { PlayerModel } from '../../player/playerModel.js';
import { crewLook, JUMPSUIT_LOOK, GUARD_LOOK } from '../../player/people.js';
import { MiniGame } from '../../ui/miniGame.js';
import { CHAPTERS } from '../../story/chapters.js';
import { SUSPECTS } from '../../story/crew.js';
import { getChapterRun } from '../../story/chapterRun.js';
import { finishPart } from '../../story/chapterFlow.js';
import { admin } from '../../core/admin.js';
import { diff } from '../../core/difficulty.js';
import { formatTime, clamp } from '../../core/utils.js';
import { noteCaught } from '../../core/jail.js';
import { audio } from '../../core/audio.js';

// Chapter 7: the breakout from Blackwater Prison, in three stages (the
// part's prison.stage):
//   'yard'     - climb the north-west watchtower for the night guard's
//                keycard, then get into D Block.
//   'dblock'   - past the corridor lasers to Ricky's cell, open it (the alarm
//                goes), then back out of D Block with him.
//   'lockdown' - across the yard with the alarm on, up the east wall stairs,
//                down Mags's zip line to her boat.
//
//   Searchlights - four watchtowers sweep bright circles across the yard.
//                  In a circle AND in view of the tower = spotted fast. Cover
//                  (crates, barriers, the bus) blocks the tower's view.
//   Guards       - torches (yellow cones); knock them out from behind (E).
//   Uniform      - a guard uniform in the dock office: guards only notice you
//                  close up (the searchlights still check everyone).
//   The cell     - hack Ricky's cell keypad (mini-game). Then the ALARM:
//                  a lockdown countdown. The escape is kinder than the way
//                  in (lasers off, searchlights keep to their sweeps,
//                  slower to be spotted: see ESCAPE_NOTICE).
//   Ricky        - follows you once he's out (he keeps up, don't worry).
//   The way out  - up the stairs to the top of the east wall, onto Mags's
//                  zip line, down to her boat at the pier.

const LOCKDOWN = 150;      // seconds after the alarm (x difficulty)
// The escape (once Ricky is out) is kinder than the way in: the alarm cuts the
// power to the corridor lasers, the searchlights keep to their sweeps instead
// of chasing you, the guards aren't on extra alert, and it takes twice as long
// to be spotted.
const ESCAPE_NOTICE = 0.5;
const PRISON_GUARD = { ...GUARD_LOOK, hoodie: 0x24324a, trousers: 0x1a2130, hat: 0x1a2130 };
const UNIFORM = { hoodie: 0x24324a, trousers: 0x1a2130, gloves: 0x1a2130, hat: 0x1a2130, style: { top: 'uniform', hat: 'guard', badge: true } };
const INMATE_SKINS = [0x8d5a3b, 0xe0b090, 0xc4946f, 0x5a3a24, 0xf0c8a8], INMATE_HAIR = ['buzz', 'bald', 'short', 'curly', 'buzz'];

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
    this.stage = this.part.prison?.stage || 'yard';
  }

  get inputLocked() { return !!this.mini; }
  /** Guards, as far as the Flashbang is concerned */
  get officers() { return this.guards; }

  build() {
    const L = buildChapter6Prison();
    const V = (x, z) => new THREE.Vector3(x, 0.05, z);
    L.checkpoints = {
      yard: [{ name: 'The rail dock', spawn: V(-26, 30), yaw: 0 }, { name: 'The watchtower', spawn: V(-37, 20), yaw: 0 }],
      dblock: [{ name: 'Inside D Block', spawn: V(0, -24), yaw: -Math.PI / 2 }, { name: 'Ricky\'s cell', spawn: V(12, -28), yaw: Math.PI / 2 }],
      lockdown: [{ name: 'Outside D Block', spawn: V(0, -19), yaw: -Math.PI / 2 }, { name: 'The east wall stairs', spawn: V(40, 0), yaw: 0 }],
    }[this.stage];
    L.spawn = L.checkpoints[0].spawn.clone();
    L.spawn.yaw = L.checkpoints[0].yaw;
    this.level = L;
    this.lights = L.towers.map((t) => new Searchlight(L.group, L.world, t));
    this.guards = new GuardSquad(L.group, L.world, L.guardRoutes.map((route) => ({ route })), { sight: diff().guardSight, look: PRISON_GUARD });
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
    // The night guard's keycard on top of the north-west watchtower
    this.keycardMesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.32, 0.03), new THREE.MeshStandardMaterial({ color: 0xffd23a, emissive: 0x7a5a00, metalness: 0.7 }));
    this.keycardMesh.position.set(L.spots.keycard.x, L.spots.keycard.y + 1.1, L.spots.keycard.z);
    L.group.add(this.keycardMesh);
    // Prisoners in the other cells (scenery), and Ricky
    L.inmates.forEach(([x, z], i) => {
      const m = new PlayerModel({ ...JUMPSUIT_LOOK, skin: INMATE_SKINS[i % 5], style: { ...JUMPSUIT_LOOK.style, hair: INMATE_HAIR[i % 5], beard: i % 3 === 1 ? 'beard' : null, build: 0.95 + (i % 4) * 0.06 } }, { bag: false });
      m.update(0, { pos: new THREE.Vector3(x, 0, z), vel: new THREE.Vector3(), facing: 0, state: 'ground', horizontalSpeed: 0, mantleProgress: 0, stateTime: 0, stumbleTimer: 0, mantle: null, wallRun: null });
      L.group.add(m.root);
    });
    this.ricky = new PlayerModel(crewLook('ricky', { ...JUMPSUIT_LOOK, style: { top: 'jumpsuit' } }), { bag: false });
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
    this.run.flags ||= {};
    this.done = false;
    this.cp = 0;
    this.spotted = 0;
    this.freed = this.stage === 'lockdown';
    this.alarm = this.stage === 'lockdown';
    this.lockdown = LOCKDOWN * diff().timer;
    this.keycard = this.stage !== 'yard';
    this.prevX = null;
    this.doorWarn = 0;
    this.warnT = 0;
    this.trail = [];
    this._closeMini();
    this.miniBlocked = false;
    this._setDisguise(this.stage !== 'yard' && !!this.run.flags.uniform); // (the uniform stays on from the yard)
    L.cellDoorBox.disabled = this.freed;
    L.cellDoor.position.x = this.freed ? 12 - 2.1 : 12;
    L.keypad.material.emissive.setHex(this.freed ? 0x30ff70 : 0xff3030);
    L.dbDoorBox.disabled = this.keycard;
    L.dbDoor.userData.open = this.keycard;
    L.dbDoor.position.x = this.keycard ? 3.9 : 0; // (slides into the wall)
    L.reader.material.emissive.setHex(this.keycard ? 0x30ff70 : 0xff3030);
    this.keycardMesh.visible = !this.keycard;
    if (this.freed) this.rickyBody.pos.copy(L.checkpoints[0].spawn).add(new THREE.Vector3(1.2, 0, 1.2));
    else this.rickyBody.pos.copy(L.spots.cell);
    this.rickyBody.facing = 0;
    s.player.zipLines = this.freed ? [L.zip] : [];
    this.guards.reset();
    this.guards.setAlert(false);
    for (const l of this.lights) { l.reset(); l.alert = false; }
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
    this.guards.setAlert(false);
    for (const l of this.lights) { l.reset(); l.alert = false; }
  }

  _caught(title, msg) {
    if (admin.flag('god')) { this.spotted = 0; return; }
    if (noteCaught(this.state)) return; // (the third time: off to jail)
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
    const dd = this.level?.dbDoor;
    if (dd) dd.position.x += ((dd.userData.open ? 3.9 : 0) - dd.position.x) * Math.min(1, dt * 3);
    if (this.done) return;
    const s = this.state, L = this.level, p = s.player, pos = p.pos, hud = s.game.hud, input = s.game.input, d = diff();
    const near = (v, r = 1.6) => Math.hypot(pos.x - v.x, pos.z - v.z) < r && Math.abs(pos.y - v.y) < 2;

    // --- The uniform
    if (!this.disguised && near(L.spots.uniform, 1.4)) {
      this._setDisguise(true);
      this.run.flags.uniform = true;
      audio.sfx('clue', { vol: 0.5 });
      hud.toast('Guard uniform', 'Guards only notice you close up now (walk, don\'t run). The searchlights still check everyone.', '#8ab4ff', 5);
    }
    this.uniformRing.visible = !this.disguised;

    // --- Searchlights and guards
    for (const l of this.lights) l.update(dt, null);
    const lit = !s.concealed && this.lights.some((l) => l.lights(pos, p.height));
    const blending = this.disguised && p.horizontalSpeed < 5 && p.height > 1.3;
    const seenByGuard = this.guards.update(dt, p, s.concealed, { closeOnly: blending });
    if (this.guards.bodyFound && !this.guards.alert) {
      this.guards.setAlert(true);
      hud.toast('Guard down!', 'A guard found the one you knocked out. They\'re all on alert.', 'var(--red)', 4);
    }
    if (lit) this.guards.alarmAt(pos); // (the tower radios the guards)
    const searching = huntMessages(this.guards, hud, 'guards');
    const fill = (lit ? dt / 0.6 : 0) + (seenByGuard ? dt / 0.8 : 0);
    this.spotted = clamp(this.spotted + (fill ? fill * d.fill * (this.freed ? ESCAPE_NOTICE : 1) : -dt * 0.5), 0, 1);
    if (!lit && !seenByGuard && searching && !this.mini) hud.setMeter(this.spotted, searching, '#ff7a1a');
    else if (this.spotted > 0.01 && !this.mini) hud.setMeter(this.spotted, lit ? 'SEARCHLIGHT! Get into cover' : seenByGuard ? 'A guard can see you!' : 'Hidden', lit || seenByGuard ? 'var(--red)' : '#8a8f9c');
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

    // --- Stage 1: the keycard on the watchtower, then D Block's door
    if (this.stage === 'yard') {
      if (!this.keycard) {
        this.keycardMesh.rotation.y += dt * 2.5;
        if (near(L.spots.keycard, 1.6)) {
          this.keycard = true;
          this.keycardMesh.visible = false;
          this.cp = 1;
          audio.sfx('clue', { vol: 0.7 });
          hud.toast('Guard keycard', 'Now D Block: the building at the far end of the yard.', 'var(--amber)', 4);
          hud.setObjective('Get into D Block');
        }
      }
      if (Math.hypot(pos.x - L.spots.dbDoor.x, pos.z - L.spots.dbDoor.z) < 3) {
        if (this.keycard && !L.dbDoorBox.disabled) {
          L.dbDoorBox.disabled = true;
          L.dbDoor.userData.open = true; // (slides open: see update)
          L.reader.material.emissive.setHex(0x30ff70);
          audio.sfx('door');
        } else if (!this.keycard && (this.doorWarn -= dt) <= 0) {
          this.doorWarn = 4;
          hud.toast('Locked', 'The door needs a guard keycard: it\'s on top of the north-west watchtower (climb the yellow ladder).', 'var(--amber)', 4);
        }
      }
      if (this.keycard && pos.z < -22.8 && Math.abs(pos.x) < 3) { this._finish(); return; }
    }

    // --- Stage 2: the corridor lasers (pulse on and off; the low one you crouch under)
    if (this.stage === 'dblock') {
      const cycle = 1.2 + 2.0 * d.timer;
      const px = this.prevX ?? pos.x;
      for (const las of L.corridorLasers) {
        const powerCut = this.freed && !this.lasersStayOn; // (Ricky's cell alarm cut the power to the lasers; a quiet escape doesn't)
        let on = !powerCut;
        for (const b of las.beams) if (powerCut) b.visible = false;
        if (on && las.type === 'pulse') {
          const k = (s.time + las.phase * cycle) % cycle;
          on = k < 1.2;
          const warn = !on && k > cycle - 0.35;
          for (const b of las.beams) { b.visible = on || (warn && Math.random() < 0.5); b.material.opacity = on ? 0.95 : 0.35; }
        }
        const crossed = (px - las.x) * (pos.x - las.x) <= 0 || Math.abs(pos.x - las.x) < 0.4;
        if (on && crossed && !admin.flag('noLasers') && pos.z > -30.9 && pos.z < -22.6 && las.heights.some((y) => y > pos.y + 0.02 && y < pos.y + p.height)) {
          this.prevX = null;
          s.laserAlarm();
          this._caught('ALARM!', las.type === 'low' ? 'You touched a laser. Crouch (C) or slide under the low beam.' : 'You touched a laser. Wait for the beams to switch off, then go.');
          return;
        }
      }
      this.prevX = pos.x;
      if (this.freed && pos.z > -21.3) { this._finish(); return; }
    }

    // --- Ricky's cell: hack the keypad
    if (this.mini) {
      if (input.wasPressed('crouch')) { this._closeMini(); this.miniBlocked = true; }
      else {
        const r = this.mini.update(dt, input.wasPressed('jump'));
        if (r === 'miss') this.spotted = Math.min(0.95, this.spotted + 0.1);
        if (r === 'done') { this._closeMini(); this._freeRicky(); }
      }
    } else if (!this.freed && this.stage === 'dblock') {
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
      if (this.warnT <= 0) { this.warnT = 4; hud.toast('Not without Ricky!', 'He\'s in D Block.', 'var(--amber)'); }
    }
    if (this.stage === 'lockdown' && pos.x > 62 && pos.y > 0.4) { this._escape(); return; }
    if (this.stage === 'lockdown' && this.cp < 1 && pos.x > 38) { this.cp = 1; audio.sfx('checkpoint', { vol: 0.6 }); }

    // --- Lockdown countdown (stage 3)
    if (this.stage === 'lockdown') {
      this.lockdown -= dt;
      if (this.lockdown <= 0) { this._caught('Lockdown', 'The guards sealed the yard. As soon as Ricky\'s out, run for the east wall stairs.'); return; }
    }

    this._updateMarker(pos);
    hud.setStats(`<span>Time <b>${formatTime(s.time)}</b></span>` +
      (this.disguised ? '<span><b style="color:#8ab4ff">IN UNIFORM</b></span>' : '') +
      (this.stage === 'lockdown' ? `<span class="warn">Lockdown in <b>${formatTime(Math.max(0, this.lockdown))}</b></span>` : `<span${this.run.caught ? ' class="warn"' : ''}>Caught <b>${this.run.caught}</b></span>`));
  }

  _freeRicky() {
    const s = this.state, L = this.level, hud = s.game.hud;
    this.freed = true;
    L.cellDoorBox.disabled = true;
    L.cellDoor.position.x = 12 - 2.1; // (slides open)
    L.keypad.material.emissive.setHex(0x30ff70);
    this.cp = 1;
    audio.sfx('door');
    // The alarm (a cell opening without a guard's key card sets it off)
    this.alarm = true;
    this.lockdown = LOCKDOWN * diff().timer;
    s.player.zipLines = [L.zip];
    audio.sfx('sting');
    hud.setObjective('Get back out of D Block with Ricky');
    hud.toast('Ricky is out!', `${SUSPECTS.ricky.name}: "About time! That set off every alarm on the island, and it blew the power to the lasers. Lead the way, I'm right behind you."`, 'var(--red)', 6);
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
    this.rickyBody.pos.copy(this.state.player.pos).add(new THREE.Vector3(1.2, 0, 0.8));
    this._finish();
  }

  _finish() {
    if (this.done) return;
    this.done = true;
    const s = this.state;
    this._closeMini();
    s.setAction(null);
    s.game.hud.setMeter(0, '');
    audio.sfx('win');
    finishPart(s, this);
  }

  _updateMarker(pos) {
    const s = this.state, hud = s.game.hud, S = this.level.spots;
    let t, label, color = 'var(--cyan)';
    if (this.stage === 'yard') {
      if (!this.keycard) { t = S.keycard; label = 'Keycard (watchtower)'; color = 'var(--amber)'; }
      else { t = new THREE.Vector3(0, 0, -22); label = 'D Block'; }
    } else if (this.stage === 'dblock') {
      if (!this.freed) { t = S.keypad; label = 'Ricky\'s cell'; }
      else { t = new THREE.Vector3(0, 0, -21); label = 'Way out'; color = 'var(--amber)'; }
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
    this._finish();
  }

  teardown() {
    this._closeMini();
    this.state.setAction?.(null);
    this.state.model?.setOutfit(null);
    this.guards?.dispose();
    for (const l of this.lights || []) l.dispose();
  }
}

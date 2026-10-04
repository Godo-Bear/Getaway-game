import * as THREE from 'three';
import { buildChapter5Casino } from '../../world/levels/chapter5Casino.js';
import { makeGlowMaterial } from '../../world/materials.js';
import { GuardSquad, huntMessages } from '../../ai/guards.js';
import { CASINO_SECURITY } from '../../player/people.js';
import { MiniGame } from '../../ui/miniGame.js';
import { CHAPTERS } from '../../story/chapters.js';
import { SUSPECTS } from '../../story/crew.js';
import { getChapterRun } from '../../story/chapterRun.js';
import { finishPart } from '../../story/chapterFlow.js';
import { save } from '../../core/save.js';
import { earn } from '../../gadgets/gadgets.js';
import { admin } from '../../core/admin.js';
import { diff } from '../../core/difficulty.js';
import { formatTime, clamp } from '../../core/utils.js';
import { audio } from '../../core/audio.js';
import { defaultPlan } from '../../ui/planBoard.js';

// Chapter 5, Part 2: the heist inside the Lucky Star casino (on foot).
//
// NEW MECHANICS
//   Guards    - patrol loops with vision cones on the floor. Stay out of the
//               cones, or crouch (C / Slide) behind low cover like card tables.
//   Cameras   - off once you hack the security terminal... until someone
//               switches them back on.
//   Lasers    - in the vault corridor: red beams that pulse on and off (time
//               your run), and waist-high beams you crouch or slide under.
//   Hacking / safe-cracking - one-button mini-games (see ui/miniGame.js).
//   Chips     - run over the gold chip stacks for bonus cash.
//   Planning board - before you start: a way in (staff door / roof vent /
//               front door in disguise) and one thing to bring (easier
//               mini-games / slower to be noticed / more escape time).
//   Disguise  - a staff uniform (in the lounge, or from the front-door
//               plan): guards only notice you close up, or if you run or
//               crouch; cameras ignore you. Not in staff-only rooms (the
//               security office and the vault corridor). Lost if caught.
//   Takedowns - sneak up behind a guard and press E (X / the touch button)
//               to knock them out. If another guard finds them: alert.
//
// Seen by a guard or camera long enough, or touching a laser: caught, back
// to the last checkpoint (you keep what you've done). Everything you pick up
// happens the moment you run over it.

const ALARM_TIME = 70;
const RING = 2.0;       // how close counts as "at" something
const CHIP_CASH = 20;
const PULSE_ON = 1.2;   // seconds a pulsing laser stays on
const PULSE_OFF = 2.0;  // ... and off (longer on Easy): plenty of time to run through
const VENT_NOISE = 20;  // seconds the guards stay on alert after the roof-vent drop
// Casino staff: burgundy waistcoat-and-tie uniform with white gloves
const UNIFORM = { hoodie: 0x7a1f2e, trousers: 0x141418, gloves: 0xe8e2d6, tie: 0x141418, style: { top: 'suit' } };

export class CasinoHeistMode {
  constructor(state, params) {
    this.state = state;
    this.chapter = CHAPTERS[params.chapterId || 'chapter5'];
    this.partIndex = params.part || 0;
    this.part = this.chapter.parts[this.partIndex];
    this.hudSections = ['tl', 'meter', 'controls', 'marker'];
    this.weather = 'indoor';
    this.time = 'night';
    this.indoors = true;
    this.mini = null;
  }

  /** Stand still while a mini-game is on (Jump is for the mini-game). */
  get inputLocked() {
    return !!this.mini;
  }

  /** The guards, as far as the gadgets are concerned (Flashbang stuns them). */
  get officers() {
    return this.guards;
  }

  build() {
    const L = buildChapter5Casino();
    L.spawn.yaw = L.checkpoints[0].yaw;
    this.level = L;
    this.rings = {};
    for (const [id, pos] of Object.entries(L.spots)) {
      const color = id === 'exit' ? 0x4dffa6 : id === 'keycard' ? 0xffd23a : 0x39e6ff;
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.35, 36), makeGlowMaterial(color, 0.8));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(pos.x, 0.03, pos.z);
      L.group.add(ring);
      this.rings[id] = ring;
    }
    // The keycard itself: a spinning gold card
    this.keycardMesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.32, 0.03), new THREE.MeshStandardMaterial({ color: 0xffd23a, emissive: 0x7a5a00, metalness: 0.7 }));
    this.keycardMesh.position.set(L.spots.keycard.x, 1.1, L.spots.keycard.z);
    L.group.add(this.keycardMesh);
    for (const c of L.cashPiles) {
      c.ring = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.65, 36), makeGlowMaterial(0x4dffa6, 0.8));
      c.ring.rotation.x = -Math.PI / 2;
      c.ring.position.set(c.pos.x, 0.03, c.pos.z);
      L.group.add(c.ring);
    }
    // Clues: a card and a tall amber beam
    this.clueObjs = L.clues.map((c) => {
      const g = new THREE.Group();
      g.position.copy(c.pos);
      const card = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.3), new THREE.MeshLambertMaterial({ color: 0xe8e0cc, emissive: 0x5a4a20, emissiveIntensity: 0.5 }));
      card.position.y = 0.05;
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.3), new THREE.MeshBasicMaterial({ color: 0xffc34d, toneMapped: false }));
      gem.position.y = 1.2;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 5, 8, 1, true), makeGlowMaterial(0xffb020, 0.3));
      beam.position.y = 2.5;
      g.add(card, gem, beam);
      L.group.add(g);
      return { ...c, group: g, gem };
    });
    this.guards = new GuardSquad(L.group, L.world, L.guardRoutes.map((route) => ({ route })), { sight: diff().guardSight, look: CASINO_SECURITY });
    // The staff uniform on the rail in the lounge
    this.uniformRing = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.1, 32), makeGlowMaterial(0xff7a9a, 0.8));
    this.uniformRing.rotation.x = -Math.PI / 2;
    this.uniformRing.position.set(L.spots.uniform.x, 0.03, L.spots.uniform.z);
    L.group.add(this.uniformRing);
    return L;
  }

  /** Apply the heist plan: where you start, and what you brought. */
  _applyPlan() {
    const L = this.level, plan = this.plan;
    L.checkpoints[0] = L.entries[plan.entry] || L.entries.staff;
    this.ease = plan.kit === 'toolkit' ? 1.4 : 1;
    this.noticeScale = plan.kit === 'earpiece' ? 0.7 : 1;
    this.alarmTime = ALARM_TIME * diff().timer * (plan.kit === 'engine' ? 1.5 : 1);
  }

  /** Put the uniform on (or take it off). */
  _setDisguise(on) {
    this.disguised = on;
    this.state.model.setOutfit(on ? UNIFORM : null);
  }

  /** Staff-only rooms, where a uniform doesn't help. */
  _restricted(pos) {
    return (pos.x < -12 && pos.z > 10) || pos.z < -16;
  }

  start(first) {
    const s = this.state, L = this.level;
    this.run = getChapterRun(s.game, this.chapter.id);
    this.run.plans ||= {};
    this.plan = this.run.plans[this.part.id] || defaultPlan(this.part.plan);
    this.done = false;
    this.cp = 0;
    this.hacked = false;
    this.keycard = false;
    this.corridorOpen = false;
    this.safeOpen = false;
    this.doorAngle = 0;
    this.cash = 0;
    this.chipsTaken = 0;
    this.alarm = false;
    this.alarmT = this.alarmTime;
    this.spotted = 0;
    this.t = 0;
    this._closeMini();
    this.miniBlocked = {};
    for (const c of L.cashPiles) { c.taken = false; c.group.visible = true; }
    for (const c of L.chips) { c.taken = false; c.group.visible = true; }
    for (const c of this.clueObjs) c.group.visible = !this.run.clues.has(c.id);
    L.keycardDoorBox.disabled = false; L.keycardDoor.visible = true;
    L.shutterBox.disabled = false; L.shutter.visible = true;
    L.vaultDoorBox.disabled = false; L.vaultDoorPivot.rotation.y = 0;
    this.keycardMesh.visible = true;
    L.terminal.material.emissive.setHex(0xff3030);
    L.alarmLight.intensity = 0;
    for (const c of L.cams) { c.cone.visible = true; c.lens.material.color.setHex(0xff2020); }
    if (s.lighting?.hemi) s.lighting.hemi.intensity = 0.7;
    this._beginPlan(); // (the way in, disguise, guards back at their posts)

    const hud = s.game.hud;
    hud.setPhase(`${this.chapter.title} · Part ${this.partIndex + 1}: ${this.part.title}`);
    this._objective();
    if (first && !s.game.speedrun) {
      s.showStoryCards(this.part.intro, this.part.startLabel || 'Go', () => {
        s.showPlanBoard(this.part.plan, { ...this.plan }, (choice) => {
          this.run.plans[this.part.id] = choice;
          this.plan = choice;
          this._beginPlan();
        });
      });
    }
  }

  /** Start (or restart) with the current plan: place the player at the way in. */
  _beginPlan() {
    const s = this.state;
    this._applyPlan();
    const cp = this.level.checkpoints[0];
    s.placePlayer(cp.spawn, cp.yaw);
    this.cp = 0;
    this.alarmT = this.alarmTime;
    this._setDisguise(this.plan.entry === 'front');
    this.ventNoise = this.plan.entry === 'vent' ? VENT_NOISE : 0;
    this.guards.reset();
    this.guards.setAlert(this.ventNoise > 0);
    this.bodyAlert = false;
  }

  get camsOn() {
    return !this.hacked || this.alarm; // (switched back on during the alarm: sabotage)
  }

  _objective() {
    const hud = this.state.game.hud;
    if (this.alarm) hud.setObjective('Get out to the garage!');
    else if (!this.hacked) hud.setObjective('Hack the security terminal');
    else if (!this.keycard) hud.setObjective('Get the vault keycard from the cashier\'s cage');
    else if (!this.corridorOpen) hud.setObjective('Open the vault corridor');
    else if (!this.safeOpen) hud.setObjective('Get past the lasers and crack the vault');
    else hud.setObjective(`Grab the cash (${this.cash} of 3)`);
  }

  onRespawnKey() {
    this._toCheckpoint('Checkpoint', 'Back to the last checkpoint.', 'var(--cyan)');
  }

  _toCheckpoint(title, msg, color) {
    const s = this.state, cp = this.level.checkpoints[this.cp];
    this._closeMini();
    s.placePlayer(cp.spawn, cp.yaw);
    s.flash(title, msg, color);
    this.spotted = 0;
    this.prevX = null;
    // Guards back to their posts (and up again), so nobody is standing on the checkpoint
    this.guards.reset();
    this.bodyAlert = false;
    this.guards.setAlert(this.alarm);
  }

  _caught(title, msg) {
    if (admin.flag('god')) { this.spotted = 0; return; } // admin god mode
    this.run.caught++;
    audio.sfx('caught');
    if (this.alarm) this.alarmT = this.alarmTime;
    if (this.disguised) { this._setDisguise(false); msg += ' (They took your uniform.)'; }
    this._toCheckpoint(title, msg, 'var(--red)');
  }

  _reachCheckpoint(i) {
    if (i <= this.cp) return;
    this.cp = i;
    audio.sfx('checkpoint', { vol: 0.6 });
  }

  audioMix() {
    return { siren: this.alarm ? 0.22 : 0, city: 0.02, wind: 0, music: 0.5, intensity: this.alarm ? 0.85 : 0.3 + this.spotted * 0.6 };
  }

  update(dt) {
    if (this.done) return;
    const s = this.state, L = this.level, p = s.player, pos = p.pos, hud = s.game.hud, input = s.game.input, d = diff();
    this.t += dt;

    // --- The roof-vent drop was loud: the guards calm down after a while
    if (this.ventNoise > 0) {
      this.ventNoise -= dt;
      if (this.ventNoise <= 0 && !this.alarm && !this.bodyAlert) { this.guards.setAlert(false); hud.toast('The guards calm down', '', 'var(--cyan)', 2); }
    }

    // --- Disguise: guards only notice a "member of staff" close up, or
    // one who runs or crouches; cameras ignore them. Not in staff-only rooms.
    const restricted = this._restricted(pos);
    const blending = this.disguised && !restricted && p.horizontalSpeed < 5 && p.height > 1.3;
    if (!this.disguised && !this.alarm && Math.hypot(pos.x - L.spots.uniform.x, pos.z - L.spots.uniform.z) < 1.5) {
      this._setDisguise(true);
      audio.sfx('clue', { vol: 0.5 });
      hud.toast('Disguised', 'A Lucky Star staff uniform. Walk, don\'t run, and keep your distance from the guards. It won\'t help in staff-only rooms.', '#ff7a9a', 6);
    }
    this.uniformRing.visible = !this.disguised && !this.alarm;
    this.uniformRing.rotation.z += dt;

    // --- Who can see you: guards and (if on) cameras
    const hidden = s.concealed; // smoke bomb / invisibility cloak
    let seen = this.guards.update(dt, p, hidden, { closeOnly: blending });
    if (this.guards.bodyFound && !this.bodyAlert && !this.alarm) {
      this.bodyAlert = true;
      this.guards.setAlert(true);
      hud.toast('Guard down!', 'A guard found the one you knocked out. They\'re all on alert now.', 'var(--red)', 5);
    }
    const camsOn = this.camsOn;
    for (const c of L.cams) {
      c.yaw = c.base + Math.sin(this.t * 0.45 + c.phase) * 0.6;
      c.g.rotation.y = c.yaw;
      c.cone.visible = camsOn;
      if (!camsOn || hidden || blending) continue;
      if (this._camSees(c, pos, p.height)) { seen = true; this.guards.alarmAt(pos); } // (the camera calls the guards)
    }
    this.spotted = clamp(this.spotted + (seen ? (dt / 0.8) * d.fill * this.noticeScale : -dt * 0.5), 0, 1);
    const searching = huntMessages(this.guards, hud, 'guards');
    if (!seen && searching) hud.setMeter(this.spotted, searching, '#ff7a1a');
    else if (this.spotted > 0.01) hud.setMeter(this.spotted, seen ? (this.guards.units.some((u) => u.seesPlayer) ? (this.disguised ? 'A guard recognised you!' : 'A guard can see you!') : 'A camera can see you!') : 'Hidden', seen ? 'var(--red)' : '#8a8f9c');
    else if (!this.mini) hud.setMeter(0, '');
    if (this.spotted >= 1) {
      this._caught('Spotted!', this.alarm ? 'Security grabbed you. Back to the vault.' : 'Security saw you. Back to the last checkpoint: stay out of the yellow cones, and crouch (C) behind tables.');
      return;
    }

    // --- Sneak takedown: behind a guard, press E (X on a gamepad, the button on a phone)
    const target = !this.mini ? this.guards.takedownTarget(p) : null;
    s.setAction(target ? 'Knock out' : null);
    if (target && input.wasPressed('interact')) {
      this.guards.takedown(target);
      s.setAction(null);
      audio.sfx('land', { vol: 1 });
      hud.toast('Knocked out', 'If another guard finds them, everyone goes on alert.', 'var(--amber)', 3);
    }

    // --- Lasers
    for (const las of L.lasers) {
      let on = true;
      if (las.type === 'pulse') {
        const cycle = PULSE_ON + PULSE_OFF * d.timer;
        const k = (this.t + las.phase * cycle) % cycle;
        on = k < PULSE_ON;
        const warn = !on && k > cycle - 0.35; // flicker just before it comes back on
        for (const b of las.beams) { b.visible = on || (warn && Math.random() < 0.5); b.material.opacity = on ? 0.95 : 0.35; }
      }
      // (crossed the beam since last frame, or standing in it: a slow frame can't skip a laser)
      const px = this.prevX ?? pos.x;
      const crossed = (px - las.x) * (pos.x - las.x) <= 0 || Math.abs(pos.x - las.x) < 0.4;
      if (on && crossed && pos.z > -24 && pos.z < -16 && !admin.flag('noLasers')) {
        if (las.heights.some((y) => y > pos.y + 0.02 && y < pos.y + p.height)) {
          s.laserAlarm();
          this._caught('ALARM!', las.type === 'low' ? 'You touched a laser. Crouch (C) or slide under the waist-high beams.' : 'You touched a laser. Wait for the pulsing beams to switch off, then run.');
          return;
        }
      }
    }

    this.prevX = pos.x;

    // --- Mini-game in progress
    if (this.mini) {
      if (input.wasPressed('crouch')) { this._closeMini(true); }
      else {
        const r = this.mini.update(dt, input.wasPressed('jump'));
        if (r === 'miss') this.spotted = Math.min(0.95, this.spotted + 0.12); // a wrong move makes noise
        if (r === 'done') { const done = this.miniDone; this._closeMini(); done(); }
      }
    }

    // --- Things you walk over
    const near = (v, r = RING) => Math.hypot(pos.x - v.x, pos.z - v.z) < r;
    for (const id of Object.keys(this.miniBlocked)) if (!near(L.spots[id], RING + 0.8)) delete this.miniBlocked[id];
    if (!this.mini) {
      if (!this.hacked && near(L.spots.terminal)) this._startMini('terminal', 'hack', 'Hacking the security system', () => this._hacked());
      else if (this.corridorOpen && !this.safeOpen && near(L.spots.dial)) this._startMini('dial', 'safe', 'Cracking the vault', () => this._vaultOpen());
    }
    if (!this.keycard && near(L.spots.keycard)) this._gotKeycard();
    if (this.keycard && !this.corridorOpen && near(L.spots.corridor, 2.6)) this._openCorridor();
    if (!this.keycard) this.keycardMesh.rotation.y += dt * 2.5;
    if (this.corridorOpen && pos.z < -16.5 && pos.x > -15.5) this._reachCheckpoint(3);
    if (this.safeOpen && pos.x < -16.5 && pos.z < -16) this._reachCheckpoint(4);
    if (this.safeOpen && this.doorAngle < 1.7) { this.doorAngle = Math.min(1.7, this.doorAngle + dt * 0.9); L.vaultDoorPivot.rotation.y = -this.doorAngle; }
    if (this.safeOpen && !this.alarm) {
      for (const c of L.cashPiles) if (!c.taken && near(c.pos, 2.2)) this._grab(c);
    }
    for (const c of L.chips) {
      if (c.taken) continue;
      c.group.rotation.y += dt * 1.5;
      if (near(c.pos, 1.5)) {
        c.taken = true;
        c.group.visible = false;
        this.chipsTaken++;
        const got = earn(s.game, CHIP_CASH, '', { quiet: true });
        hud.toast(`Chips! +$${got}`, '', 'var(--amber)', 1.2);
        audio.sfx('cash', { vol: 0.5 });
      }
    }
    for (const c of this.clueObjs) {
      if (!c.group.visible) continue;
      if (this.run.clues.has(c.id)) { c.group.visible = false; continue; }
      c.gem.rotation.y += dt * 1.8;
      if (near(c.pos, 2.4)) this._pickUpClue(c);
    }
    if (this.alarm && near(L.spots.exit)) { this._escape(); return; }

    // --- Alarm: red lights and a countdown
    if (this.alarm) {
      this.alarmT -= dt;
      const pulse = (Math.sin(this.t * 8) + 1) / 2;
      L.alarmLight.intensity = 36 * pulse;
      if (this.alarmT <= 0) { this._caught('Locked in', 'The police sealed the building. As soon as the alarm goes, run for the garage.'); return; }
    }

    // --- Rings: only the ones that matter now
    const active = {
      terminal: !this.hacked, keycard: this.hacked && !this.keycard, corridor: this.keycard && !this.corridorOpen,
      dial: this.corridorOpen && !this.safeOpen, exit: this.alarm,
    };
    for (const [id, ring] of Object.entries(this.rings)) {
      ring.visible = !!active[id];
      ring.rotation.z += dt;
      ring.material.opacity = 0.55 + Math.sin(this.t * 5) * 0.3;
    }
    for (const c of L.cashPiles) c.ring.visible = this.safeOpen && !c.taken;
    L.wheel.rotation.y += dt * 1.2; // the roulette wheel spins

    this._updateMarker(pos);
    this._objective();
    const total = Object.keys(this.chapter.clues).length;
    hud.setStats(`<span>Take <b>$${(this.cash * 400000).toLocaleString('en-US')}</b></span>` +
      `<span>Clues <b>${this.run.clues.size}/${total}</b></span><span>Chips <b>${this.chipsTaken}</b></span>` +
      (this.alarm ? `<span class="warn">Lockdown in <b>${formatTime(Math.max(0, this.alarmT))}</b></span>` : `<span>Time <b>${formatTime(s.time)}</b></span>`));
  }

  /** Line of sight from a ceiling camera to the player. */
  _camSees(c, pos, height) {
    const dx = pos.x - c.x, dz = pos.z - c.z, dist = Math.hypot(dx, dz);
    if (dist > c.range * diff().guardSight) return false;
    const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw);
    if (Math.acos(clamp((dx * fx + dz * fz) / Math.max(dist, 1e-3), -1, 1)) > 0.42) return false;
    const from = new THREE.Vector3(c.x, 4, c.z);
    const dir = new THREE.Vector3(pos.x, pos.y + (height < 1.3 ? 0.7 : 1.3), pos.z).sub(from);
    const len = dir.length();
    dir.divideScalar(len);
    return !(this.state.world.raycast(from, dir, len - 0.3) < len - 0.3);
  }

  // ---------------------------------------------------------------- mini-games
  _startMini(id, type, title, onDone) {
    if (this.miniBlocked[id]) return; // you stepped away: walk out of the ring and back in to try again
    this.miniId = id;
    this.miniDone = onDone;
    this.mini = new MiniGame({ type, title, hint: 'Jump (Space / A / tap) when it lines up · C to step away', ease: this.ease });
  }

  _closeMini(cancelled = false) {
    if (!this.mini) return;
    this.mini.close();
    this.mini = null;
    if (cancelled) this.miniBlocked[this.miniId] = true;
    this.state.game.hud.setMeter(0, '');
  }

  _hacked() {
    const L = this.level;
    this.hacked = true;
    L.terminal.material.emissive.setHex(0x30ff70);
    for (const m of L.monitors) m.material.emissive.setHex(0x0a3a14);
    for (const c of L.cams) c.lens.material.color.setHex(0x222222);
    this._reachCheckpoint(1);
    this.state.game.hud.toast('Cameras off', 'Now the vault keycard: it\'s in the cashier\'s cage, across the casino floor. Mind the guards.', 'var(--cyan)', 5);
  }

  _gotKeycard() {
    this.keycard = true;
    this.keycardMesh.visible = false;
    audio.sfx('clue', { vol: 0.6 });
    this._reachCheckpoint(2);
    this.state.game.hud.toast('Vault keycard', 'Now the vault corridor door (next to the cage).', 'var(--amber)');
  }

  _openCorridor() {
    const L = this.level;
    this.corridorOpen = true;
    L.keycardDoorBox.disabled = true;
    L.keycardDoor.visible = false;
    audio.sfx('door');
    const n = SUSPECTS.nova;
    this.state.game.hud.toast('Lasers!', `${n.name}, on the radio: "Pulsing beams switch off every few seconds. The low ones: crouch (C) or slide under."`, 'var(--red)', 6);
  }

  _vaultOpen() {
    this.safeOpen = true;
    this.level.vaultDoorBox.disabled = true;
    for (let i = 0; i < 3; i++) setTimeout(() => audio.sfx('click'), i * 120);
    setTimeout(() => audio.sfx('vault'), 450);
    this.state.game.hud.toast('Vault open', 'Grab all three pallets.', 'var(--amber)');
  }

  _grab(c) {
    c.taken = true;
    c.group.visible = false;
    this.cash++;
    const got = earn(this.state.game, 75, '', { quiet: true });
    audio.sfx('cash');
    const left = 3 - this.cash;
    this.state.game.hud.toast(`+$400,000  (+$${got} for you)`, left ? `${left} more to go.` : '', 'var(--safe)');
    if (!left) this._triggerAlarm();
  }

  /** The alarm... and the cameras come back on. Somebody on the crew did that. */
  _triggerAlarm() {
    const L = this.level;
    this.alarm = true;
    this.alarmT = this.alarmTime;
    this.spotted = 0;
    this.guards.setAlert(true);
    for (const c of L.cams) c.lens.material.color.setHex(0xff2020);
    L.shutterBox.disabled = true;
    L.shutter.visible = false;
    audio.sfx('sting');
    const m = SUSPECTS.mags;
    this.state.game.hud.toast('ALARM! The cameras are back on',
      `${m.name}, on the radio: "Somebody switched the cameras back on from outside. That wasn't me. The shutter's open: out through the casino to the garage, now!"`, 'var(--red)', 8);
  }

  _escape() {
    this.done = true;
    this.state.game.hud.setMeter(0, '');
    audio.sfx('door');
    finishPart(this.state, this);
  }

  /** Admin: finish the heist right now. */
  adminSkip() {
    if (!this.done) this._escape();
  }

  _pickUpClue(c) {
    this.run.clues.add(c.id);
    c.group.visible = false;
    save.addClue(this.chapter.id, c.id);
    const info = this.chapter.clues[c.id];
    audio.sfx('clue');
    const got = earn(this.state.game, 100, '', { quiet: true });
    this.state.game.hud.toast(`Clue: ${info.name}  (+$${got})`, info.text, 'var(--amber)', 7);
  }

  _updateMarker(pos) {
    const s = this.state, hud = s.game.hud, S = this.level.spots;
    let target = null, label = '';
    // A clue close by? Point at it.
    for (const c of this.clueObjs) {
      if (c.group.visible && Math.hypot(c.pos.x - pos.x, c.pos.z - pos.z) < 14) { target = c.pos; label = 'Clue'; }
    }
    if (!target) {
      if (this.alarm) { target = S.exit; label = 'Garage exit'; }
      else if (!this.hacked) { target = S.terminal; label = 'Security terminal'; }
      else if (!this.keycard) { target = S.keycard; label = 'Keycard'; }
      else if (!this.corridorOpen) { target = S.corridor; label = 'Vault corridor'; }
      else if (!this.safeOpen) { target = S.dial; label = 'Vault'; }
      else {
        let bd = Infinity;
        for (const c of this.level.cashPiles) {
          if (c.taken) continue;
          const dd = Math.hypot(c.pos.x - pos.x, c.pos.z - pos.z);
          if (dd < bd) { bd = dd; target = c.pos; }
        }
        label = 'Cash';
      }
    }
    if (!target) { hud.setMarker(null); return; }
    this._mk ||= new THREE.Vector3();
    this._mk.set(target.x, 1.6, target.z);
    hud.setMarker(this._mk, s.camera, label, label === 'Clue' ? 'var(--amber)' : this.alarm ? 'var(--safe)' : 'var(--cyan)', Math.hypot(target.x - pos.x, target.z - pos.z));
  }

  teardown() {
    this._closeMini();
    this.state.model?.setOutfit(null);
    this.guards?.dispose();
  }
}

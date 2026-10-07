import * as THREE from 'three';
import { buildChapter14Ship, SEA_Y } from '../../world/levels/chapter14Ship.js';
import { makeGlowMaterial } from '../../world/materials.js';
import { GuardSquad, huntMessages } from '../../ai/guards.js';
import { Searchlight } from '../../ai/searchlight.js';
import { PlayerModel } from '../../player/playerModel.js';
import { crewLook, randomPerson } from '../../player/people.js';
import { MiniGame } from '../../ui/miniGame.js';
import { CHAPTERS } from '../../story/chapters.js';
import { getChapterRun } from '../../story/chapterRun.js';
import { finishPart } from '../../story/chapterFlow.js';
import { earn } from '../../gadgets/gadgets.js';
import { admin } from '../../core/admin.js';
import { diff } from '../../core/difficulty.js';
import { formatTime, clamp, makeRng } from '../../core/utils.js';
import { noteCaught } from '../../core/jail.js';
import { audio } from '../../core/audio.js';

// Chapter 14, Part 1: aboard the Bella Fortuna, the casino ship in the bay.
//   1. Paz rows you up to the ship's side: climb the rope ladder.
//   2. Across the stern deck (a searchlight on the mast, guards round the
//      pool), into the casino (or up the ladder to the sun deck and down
//      through the open skylight).
//   3. Hack the STAFF ONLY door, cross the staff hall, crack the counting
//      room's vault dial and take the four piles of cash.
//   4. The alarm: run out of the side door, vault the port rail and jump
//      into the sea next to Paz's speedboat.
//
//  THE SWELL: every 15-20 seconds a big swell rolls the ship. A warning
//  comes first; then for a few seconds the deck tips, and anyone standing
//  up slides towards the low side (crouch, C, to hold on). The guards grab
//  the rail too: their torches go off, so a swell is the moment to slip
//  past them or knock them out.

const ESCAPE = 80;        // seconds after the alarm (x difficulty)
const CASH = 140;         // per pile
const WARN = 2.4, ROLL = 4.6;
const SECURITY_LOOK = { hoodie: 0x1a1b20, trousers: 0x1a1b20, gloves: 0x1a1b20, shirt: 0xe8e8e8, tie: 0x1a1b20, hat: 0x1a1b20, style: { top: 'suit', badge: true } };
const PAZ_LOOK = crewLook('paz');

const standing = (x, y, z, facing) => ({ pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(), facing, state: 'ground', horizontalSpeed: 0, mantleProgress: 0, stateTime: 0, stumbleTimer: 0, mantle: null, wallRun: null });

export class ShipMode {
  constructor(state, params) {
    this.state = state;
    this.chapter = CHAPTERS[params.chapterId || 'chapter14'];
    this.partIndex = params.part || 0;
    this.part = this.chapter.parts[this.partIndex];
    this.hudSections = ['tl', 'meter', 'controls', 'marker'];
    this.weather = 'clear';
    this.weatherForced = true;
    this.time = 'night';
    this.indoors = true; // (no "down on the street" ladder hints)
    this.mini = null;
  }

  get inputLocked() { return !!this.mini; }
  get officers() { return this.guards; }
  /** Below the deck = in the sea (before you're aboard, the rowing boat is lower still). */
  get fallY() { return this.cp === 0 ? SEA_Y - 0.8 : -4.5; }

  build() {
    const L = buildChapter14Ship();
    L.spawn = L.checkpoints[0].spawn.clone();
    L.spawn.yaw = L.checkpoints[0].yaw;
    this.level = L;
    this.lights = L.towers.map((t) => new Searchlight(L.group, L.world, t));
    this.guards = new GuardSquad(L.group, L.world, L.guardRoutes.map((route) => ({ route })), { sight: diff().guardSight, look: SECURITY_LOOK });
    const ring = (pos, color, r = 1.1) => {
      const m = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.25, 32), makeGlowMaterial(color, 0.8));
      m.rotation.x = -Math.PI / 2;
      m.position.set(pos.x, pos.y + 0.04, pos.z);
      L.group.add(m);
      return m;
    };
    this.panelRing = ring(L.spots.panel, 0x39e6ff);
    this.dialRing = ring(L.spots.dial, 0xffd040);
    for (const c of L.cash) c.ring = ring(c.pos, 0x4dffa6, 0.8);
    // The guests at the tables, dressed up for the night
    const rng = makeRng(1414);
    this.guests = L.guests.map((g, i) => {
      const look = randomPerson(rng);
      look.style.top = ['suit', 'suit', 'jacket', 'leather', 'trench', 'suit'][i % 6];
      look.style.hat = i % 4 === 1 ? 'fedora' : null;
      const m = new PlayerModel(look, { bag: false, style: look.style });
      m.pose = standing(g.x, 0, g.z, g.face);
      m.update(0, m.pose);
      L.group.add(m.root);
      return m;
    });
    // Paz: in the rowing boat at the start, at the wheel of the speedboat at the end
    this.paz = new PlayerModel(PAZ_LOOK, { bag: false });
    this.pazPose = standing(L.spots.paz.x, L.spots.paz.y, L.spots.paz.z, -Math.PI / 2);
    this.paz.update(0, this.pazPose);
    L.group.add(this.paz.root);
    this.wheels = [];
    L.group.traverse((o) => { if (o.userData.spin) this.wheels.push(o); });
    return L;
  }

  start(first) {
    const s = this.state, L = this.level;
    this.run = getChapterRun(s.game, this.chapter.id);
    this.done = false;
    this.cp = 0;
    this.spotted = 0;
    this.doorOpen = false;
    this.vaultOpen = false;
    this.alarm = false;
    this.escape = ESCAPE * diff().timer;
    this.taken = 0;
    this.miniBlocked = false;
    this.lockWarn = 0;
    this.swells = 0;
    this.sw = { phase: 'calm', t: 0, next: 9, dir: 1 };
    this._closeMini();
    for (const c of L.cash) { c.taken = false; c.stack.visible = true; }
    this._setDoor(false);
    this._setVault(false);
    this._setBoat(false);
    this.guards.reset();
    this.guards.setAlert(false);
    for (const l of this.lights) { l.reset(); l.alert = false; }
    s.player.drift.set(0, 0, 0);
    const hud = s.game.hud;
    hud.setPhase(`${this.chapter.title} · Part ${this.partIndex + 1}: ${this.part.title}`);
    hud.setObjective(this.part.objective);
    if (first && !s.game.speedrun) s.showStoryCards(this.part.intro, this.part.startLabel || 'Go');
  }

  _setDoor(open) {
    const L = this.level;
    this.doorOpen = open;
    L.staffDoorBox.disabled = open;
    L.staffDoor.position.x = open ? 2.3 : 0; // (it slides into the wall)
    L.panel.material.emissive.setHex(open ? 0x30ff70 : 0xff3030);
  }

  _setVault(open) {
    const L = this.level;
    this.vaultOpen = open;
    L.vaultDoorBox.disabled = open;
    L.vaultDoorPivot.rotation.y = open ? 1.75 : 0;
  }

  /** Paz and the speedboat, waiting off the port side (after the alarm). */
  _setBoat(on) {
    const L = this.level;
    L.speedboat.visible = on;
    L.escapeGlow.visible = L.escapeBeam.visible = on;
    L.rowboat.visible = !on;
    if (on) this.pazPose.pos.set(L.spots.boat.x + 0.45, L.spots.boat.y + 0.75, L.spots.boat.z - 0.9);
    else this.pazPose.pos.copy(L.spots.paz);
    this.pazPose.facing = on ? Math.PI / 2 : -Math.PI / 2;
    this.paz.update(0, this.pazPose);
  }

  _toCheckpoint(title, msg, color = 'var(--red)') {
    const s = this.state, cp = this.level.checkpoints[this.cp];
    this._closeMini();
    s.player.drift.set(0, 0, 0);
    s.placePlayer(cp.spawn, cp.yaw);
    s.flash(title, msg, color);
    this.spotted = 0;
    if (this.alarm) this.escape = ESCAPE * diff().timer;
    this.guards.reset();
    this.guards.setAlert(this.alarm);
    for (const l of this.lights) { l.reset(); l.alert = this.alarm; }
  }

  _caught(title, msg) {
    if (admin.flag('god')) { this.spotted = 0; return; }
    if (noteCaught(this.state)) return; // (the third time: off to jail)
    this.run.caught++;
    audio.sfx('caught');
    this._toCheckpoint(title, msg);
  }

  onRespawnKey() { this._toCheckpoint('Checkpoint', 'Back to the last checkpoint.', 'var(--cyan)'); }

  /** Into the sea: next to Paz's speedboat after the alarm = away! Anywhere else = man overboard. */
  onFall() {
    const s = this.state, p = s.player.pos, B = this.level.spots.boat;
    audio.sfx('splash');
    if (this.alarm && Math.hypot(p.x - B.x, p.z - B.z) < 11) { this._finish(); return; }
    if (this.cp === 0) { this._toCheckpoint('Splash!', 'You fell in. Paz hauls you back into the rowing boat. Walk to the hull and climb the rope ladder (hold forward).', 'var(--cyan)'); return; }
    this._toCheckpoint('Man overboard!', this.alarm
      ? 'Wrong side! Paz is waiting off the PORT side (the green light), by the casino\'s side door.'
      : 'You went over the rail. Mind the swells: crouch (C) to hold on when the deck tips.', 'var(--cyan)');
  }

  audioMix() {
    return { siren: this.alarm ? 0.22 : 0, wind: 0.3, city: 0.02, music: 0.5, intensity: this.alarm ? 0.85 : 0.3 + this.spotted * 0.6 };
  }

  // ---------------------------------------------------------------- the swell
  _swell(dt) {
    const s = this.state, p = s.player, w = this.sw, hud = s.game.hud;
    // a gentle rock all the time, then the big ones
    let k = 0;
    if (this.cp >= 1 && !this.done) {
      w.t += dt;
      if (w.phase === 'calm' && w.t > w.next) {
        w.phase = 'warn'; w.t = 0; w.dir = Math.random() < 0.5 ? -1 : 1;
        this.swells++;
        audio.sfx('whoosh', { vol: 0.5, rate: 0.45 });
        const side = w.dir > 0 ? 'starboard (right)' : 'port (left)';
        if (this.swells <= 2) hud.toast('A big swell!', `The ship's about to roll to ${side}. Crouch (C) to hold on, or you'll slide. The guards grab the rail too: their torches go off. Move!`, '#5ab4ff', 4.5);
        else hud.toast('Swell!', 'Crouch to hold on... or use it: the guards can\'t look.', '#5ab4ff', 2.2);
      } else if (w.phase === 'warn' && w.t > WARN) { w.phase = 'roll'; w.t = 0; audio.sfx('thunder', { vol: 0.18, rate: 0.6 }); }
      else if (w.phase === 'roll' && w.t > ROLL) { w.phase = 'calm'; w.t = 0; w.next = (14 + Math.random() * 6) / Math.max(0.6, diff().timer); }
      k = w.phase === 'roll' ? Math.sin(Math.PI * w.t / ROLL) : w.phase === 'warn' ? -0.18 * Math.sin(Math.PI * w.t / WARN) : 0;
    }
    const roll = w.dir * k * 0.085 + 0.012 * Math.sin(s.time * 0.75);
    s.cam.roll = roll * Math.cos(s.cam.yaw);
    // the push: standing on the deck while it tips
    const holding = s.ctl.crouch || p.state === 'crouch' || p.state === 'ladder' || !p.grounded || this.mini;
    const push = w.phase === 'roll' && !holding ? w.dir * 3.6 * k : 0;
    p.drift.set(push, 0, 0);
    // the guards hold on
    if (w.phase === 'roll' && k > 0.25) for (const u of this.guards.units) if (!u.down) u.stunned = Math.max(u.stunned || 0, 0.2);
    // the rowing boat and the speedboat bob on the water
    const L = this.level;
    L.rowboat.position.y = SEA_Y + 0.2 + Math.sin(s.time * 1.3) * 0.12;
    L.rowboat.rotation.z = Math.sin(s.time * 1.1) * 0.05;
    L.speedboat.position.y = SEA_Y + 0.15 + Math.sin(s.time * 1.5 + 1) * 0.1;
    L.speedboat.rotation.z = Math.sin(s.time * 1.2) * 0.04;
  }

  update(dt) {
    if (this.done) return;
    const s = this.state, L = this.level, p = s.player, pos = p.pos, hud = s.game.hud, input = s.game.input, d = diff();
    const near = (v, r = 1.6) => Math.hypot(pos.x - v.x, pos.z - v.z) < r && Math.abs(pos.y - v.y) < 2;

    this._swell(dt);
    for (const w of this.wheels) w.rotation.y += dt * (this.sw.phase === 'roll' ? 5 : 2.2);
    // Paz and the guests (just breathing and shifting about)
    this.paz.update(dt, this.pazPose);
    for (const g of this.guests) g.update(dt, g.pose);

    // --- Aboard? (off the rope ladder onto the deck)
    if (this.cp === 0 && pos.y > -0.3 && p.grounded) {
      this.cp = 1;
      audio.sfx('checkpoint', { vol: 0.6 });
      hud.setObjective('Get into the casino, to the STAFF ONLY door at the far end');
      hud.toast('Aboard', 'Mags, on the radio: "The counting room is at the front, behind the staff door. Stay out of the searchlight and the torch beams."', 'var(--cyan)', 5);
    }
    if (this.cp === 1 && pos.y > -0.5 && pos.y < 3 && Math.abs(pos.x) < 8.6 && pos.z < 19.6 && pos.z > -13.8) { this.cp = 2; audio.sfx('checkpoint', { vol: 0.5 }); }

    // --- Searchlights and guards
    for (const l of this.lights) l.update(dt, this.alarm ? pos : null);
    const lit = !s.concealed && pos.y > -1 && this.lights.some((l) => l.lights(pos, p.height));
    const seenByGuard = this.guards.update(dt, p, s.concealed);
    if (this.guards.bodyFound && !this.guards.alert) {
      this.guards.setAlert(true);
      hud.toast('Man down!', 'A guard found the one you knocked out. Security is on alert.', 'var(--red)', 4);
    }
    if (lit) this.guards.alarmAt(pos);
    const searching = huntMessages(this.guards, hud, 'guards');
    const fill = (lit ? dt / 0.7 : 0) + (seenByGuard ? dt / 0.8 : 0);
    this.spotted = clamp(this.spotted + (fill ? fill * d.fill : -dt * 0.5), 0, 1);
    if (!lit && !seenByGuard && searching && !this.mini) hud.setMeter(this.spotted, searching, '#ff7a1a');
    else if (this.spotted > 0.01 && !this.mini) hud.setMeter(this.spotted, lit ? 'SEARCHLIGHT! Get out of the light' : seenByGuard ? 'Security can see you!' : 'Hidden', lit || seenByGuard ? 'var(--red)' : '#8a8f9c');
    else if (!this.mini) hud.setMeter(0, '');
    if (this.spotted >= 1) {
      this._caught('Spotted!', lit ? 'The searchlight on the mast caught you. Wait for it to sweep past, or keep to the shadows by the crates.' : 'Security saw you. Wait for a swell (they grab the rail and look away), or knock them out from behind (E).');
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

    // --- Mini-games: the staff door panel and the vault dial
    if (this.mini) {
      if (input.wasPressed('crouch')) { this._closeMini(); this.miniBlocked = true; }
      else {
        const r = this.mini.update(dt, input.wasPressed('jump'));
        if (r === 'miss') this.spotted = Math.min(0.95, this.spotted + 0.1);
        if (r === 'done') {
          const which = this.miniFor;
          this._closeMini();
          if (which === 'door') this._openDoor(); else this._openVault();
        }
      }
    } else {
      const atPanel = !this.doorOpen && near(L.spots.panel, 1.4);
      const atDial = this.doorOpen && !this.vaultOpen && near(L.spots.dial, 1.5);
      if (!atPanel && !atDial) this.miniBlocked = false;
      else if (!this.miniBlocked) {
        this.miniFor = atPanel ? 'door' : 'vault';
        this.mini = atPanel
          ? new MiniGame({ type: 'hack', title: 'Hacking the staff door', hint: 'Jump (Space / A / tap) when it lines up · C to step away' })
          : new MiniGame({ type: 'safe', title: 'Cracking the counting room', hint: 'Jump (Space / A / tap) on each click · C to step away' });
      }
    }
    if (!this.doorOpen && !this.mini && Math.abs(pos.x) < 2 && pos.z < -12 && pos.z > -13.6 && (this.lockWarn -= dt) <= 0) {
      this.lockWarn = 4;
      hud.toast('Locked', 'Hack the panel on the right of the door (blue ring).', 'var(--amber)', 3);
    }
    this.panelRing.visible = !this.doorOpen;
    this.dialRing.visible = this.doorOpen && !this.vaultOpen;

    // --- The cash
    for (const c of L.cash) {
      c.ring.visible = this.vaultOpen && !c.taken;
      if (this.vaultOpen && !c.taken && near(c.pos, 1.6)) this._grab(c);
    }
    if (this.alarm) {
      this.escape -= dt;
      if (this.escape <= 0) {
        this._caught('Harbour police', 'The police launch got there first. After the last pile of cash, run straight out of the side door and jump over the port rail.');
        return;
      }
      if (this.cp < 4 && pos.z > -27) { this.cp = 4; }
    }

    this._updateMarker(pos);
    hud.setStats(`<span>Cash <b>${this.taken}/${L.cash.length}</b></span><span>Time <b>${formatTime(s.time)}</b></span>` +
      (this.alarm ? `<span class="warn">Police launch <b>${formatTime(Math.max(0, this.escape))}</b></span>` : `<span${this.run.caught ? ' class="warn"' : ''}>Caught <b>${this.run.caught}</b></span>`));
  }

  _openDoor() {
    const hud = this.state.game.hud;
    this._setDoor(true);
    this.cp = 3;
    audio.sfx('door');
    hud.setObjective('Through the staff hall to the counting room');
    hud.toast('Door open', 'A guard walks the staff hall. The round steel door at the end is the counting room.', 'var(--cyan)', 4);
  }

  _openVault() {
    const hud = this.state.game.hud;
    this._setVault(true);
    this.cp = 4;
    audio.sfx('door');
    hud.setObjective(`Take the cash (0 of ${this.level.cash.length})`);
    hud.toast('The counting room', 'Tonight\'s takings, in neat piles. The last pile is on a scale: lift it and the alarm goes.', '#4dffa6', 5);
  }

  _grab(c) {
    const s = this.state, hud = s.game.hud;
    c.taken = true;
    c.stack.visible = false;
    this.taken++;
    earn(s.game, CASH, '', { quiet: true });
    audio.sfx('cash', { vol: 0.8 });
    const n = this.level.cash.length;
    if (this.taken < n) { hud.setObjective(`Take the cash (${this.taken} of ${n})`); return; }
    // The alarm
    this.alarm = true;
    this.escape = ESCAPE * diff().timer;
    this.guards.setAlert(true);
    for (const l of this.lights) l.alert = true;
    this._setBoat(true);
    audio.sfx('sting');
    hud.setObjective('Out of the side door, over the port rail, into the sea by Paz\'s speedboat');
    hud.toast('ALARM!', 'Paz, on the radio: "I see the police launch leaving the harbour! I\'m off the LEFT side, by the side door. Jump over the rail, I\'ll fish you out!"', 'var(--red)', 7);
  }

  _finish() {
    if (this.done) return;
    this.done = true;
    const s = this.state;
    this._closeMini();
    s.setAction(null);
    s.cam.roll = 0;
    s.player.drift.set(0, 0, 0);
    s.game.hud.setMeter(0, '');
    audio.sfx('win');
    finishPart(s, this);
  }

  _updateMarker(pos) {
    const s = this.state, hud = s.game.hud, L = this.level, S = L.spots;
    let t, label, color = 'var(--cyan)';
    if (this.cp === 0) { t = S.ladderTop; label = 'Rope ladder'; color = 'var(--amber)'; }
    else if (!this.doorOpen) { t = S.panel; label = 'Staff door'; }
    else if (!this.vaultOpen) { t = S.dial; label = 'Counting room'; color = 'var(--amber)'; }
    else if (!this.alarm) {
      t = L.cash.filter((c) => !c.taken).sort((a, b) => a.pos.distanceToSquared(pos) - b.pos.distanceToSquared(pos))[0].pos;
      label = 'Cash'; color = '#4dffa6';
    } else if (pos.x > -9.5) { t = S.jumpFrom; label = 'Side door, then jump!'; color = 'var(--safe)'; }
    else { t = S.boat; label = 'Paz\'s speedboat'; color = 'var(--safe)'; }
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
    const s = this.state;
    s.setAction?.(null);
    if (s.cam) s.cam.roll = 0;
    s.player?.drift.set(0, 0, 0);
    this.guards?.dispose();
    for (const l of this.lights || []) l.dispose();
  }
}

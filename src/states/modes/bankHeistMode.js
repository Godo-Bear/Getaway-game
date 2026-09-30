import * as THREE from 'three';
import { buildChapter1Bank } from '../../world/levels/chapter1Bank.js';
import { makeGlowMaterial } from '../../world/materials.js';
import { CHAPTERS } from '../../story/chapters.js';
import { SUSPECTS } from '../../story/crew.js';
import { getChapterRun } from '../../story/chapterRun.js';
import { finishPart } from '../../story/chapterFlow.js';
import { earn } from '../../gadgets/gadgets.js';
import { formatTime, clamp } from '../../core/utils.js';
import { admin } from '../../core/admin.js';
import { diff } from '../../core/difficulty.js';
import { audio } from '../../core/audio.js';

// Chapter 1, Part 1: the heist inside the Harbor Trust bank (on foot).
//
//   1. Kill the security cameras (security room)   - until then, a camera
//      that sees you for about a second locks the building down
//   2. Find the vault code (manager's office)
//   3. Open the vault (keypad)
//   4. Grab the four pallets of cash               - the last one trips the alarm
//   5. Get to the roof stairs before the police storm in (75 seconds)
//
// To do something, just walk or run over its glowing ring: it happens
// straight away (no extra key and no waiting, so it works the same with a
// keyboard, a gamepad or a touch screen).

const ALARM_TIME = 75;
const USE_RADIUS = 2.0; // generous, so running past a ring still counts

export class BankHeistMode {
  constructor(state, params) {
    this.state = state;
    this.chapter = CHAPTERS[params.chapterId || 'chapter1'];
    this.partIndex = params.part || 0;
    this.part = this.chapter.parts[this.partIndex];
    this.hudSections = ['tl', 'meter', 'controls', 'marker'];
    this.weather = 'indoor';
    this.time = 'night';
    this.indoors = true; // no "down on the street" ladder help in here
  }

  build() {
    const level = buildChapter1Bank();
    level.spawn.yaw = 0;
    this.level = level;
    // Glowing rings on the floor where you do things
    this.rings = {};
    for (const [id, pos] of Object.entries(level.spots)) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.35, 36), makeGlowMaterial(id === 'roof' ? 0x4dffa6 : 0x39e6ff, 0.8));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(pos.x, 0.03, pos.z);
      level.group.add(ring);
      this.rings[id] = ring;
    }
    for (const c of level.cashPiles) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.65, 36), makeGlowMaterial(0x4dffa6, 0.8));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(c.pos.x, 0.03, c.pos.z);
      level.group.add(ring);
      c.ring = ring;
    }
    return level;
  }

  start(first) {
    const s = this.state, L = this.level;
    this.run = getChapterRun(s.game, this.chapter.id);
    this.done = false;
    this.camsOff = false;
    this.hasCode = false;
    this.vaultOpen = false;
    this.doorAngle = 0;
    this.alarm = false;
    this.alarmT = ALARM_TIME * diff().timer;
    this.spotted = 0;
    this.cash = 0;
    this.camTime = 0;
    for (const c of L.cashPiles) { c.taken = false; c.group.visible = true; }
    L.vaultDoorBox.disabled = false;
    this._setVaultDoor(0);
    L.panel.material.emissive.setHex(0xff3030);
    L.keypad.material.emissive.setHex(0xff3030);
    L.note.visible = true;
    L.alarmLight.intensity = 0;
    for (const c of L.cams) { c.cone.visible = true; c.lens.material.color.setHex(0xff2020); }
    // Indoors: soften the outdoor night light, the ceiling lights do the work
    if (s.lighting?.hemi) s.lighting.hemi.intensity = 0.9;

    const hud = s.game.hud;
    hud.setPhase(`${this.chapter.title} · Part ${this.partIndex + 1}: ${this.part.title}`);
    this._objective();
    if (first && !s.game.speedrun) s.showStoryCards(this.part.intro, this.part.startLabel || 'Go');
  }

  _setVaultDoor(a) {
    this.doorAngle = a;
    this.level.doorPivot.rotation.y = a;
  }

  _objective() {
    const hud = this.state.game.hud;
    if (!this.camsOff) hud.setObjective('Kill the security cameras');
    else if (!this.hasCode) hud.setObjective('Find the vault code');
    else if (!this.vaultOpen) hud.setObjective('Open the vault');
    else if (!this.alarm) hud.setObjective(`Grab the cash (${this.cash} of 4)`);
    else hud.setObjective('Get to the roof stairs!');
  }

  onRespawnKey() {
    this._backToDoor('Back to the door', 'Back where you came in.', 'var(--cyan)');
  }

  /** Caught: back to the back door (or to the vault if the alarm is on). */
  _backToDoor(title, msg, color) {
    const s = this.state;
    const pos = this.alarm ? new THREE.Vector3(11, 0.05, -12) : this.level.spawn;
    s.placePlayer(pos, this.alarm ? Math.PI / 2 : 0);
    s.flash(title, msg, color);
    this.spotted = 0;
  }

  _caught(title, msg) {
    if (admin.flag('god')) { this.spotted = 0; this.alarmT = Math.max(this.alarmT, 10); return; } // admin god mode
    this.run.caught++;
    audio.sfx('caught');
    if (this.alarm) this.alarmT = ALARM_TIME * diff().timer;
    this._backToDoor(title, msg, 'var(--red)');
  }

  audioMix() {
    return {
      siren: this.alarm ? 0.2 : 0,
      city: 0.02,
      wind: 0,
      music: 0.45,
      intensity: this.alarm ? 0.8 : 0.25 + this.spotted * 0.6,
    };
  }

  update(dt) {
    if (this.done) return;
    const s = this.state, L = this.level, p = s.player.pos, hud = s.game.hud;
    this.camTime += dt;

    // --- Security cameras sweep; one that sees you fills the meter
    let seen = false;
    for (const c of L.cams) {
      c.yaw = c.base + Math.sin(this.camTime * 0.5 + c.phase) * 0.65;
      c.g.rotation.y = c.yaw;
      c.cone.visible = !this.camsOff;
      if (this.camsOff || this.alarm) continue;
      const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz);
      if (d > c.range) continue;
      const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw);
      const ang = Math.acos(clamp((dx * fx + dz * fz) / Math.max(d, 1e-3), -1, 1));
      if (ang < 0.42 && !this._blocked(c.x, c.z, p.x, p.z)) seen = true;
    }
    if (!this.camsOff && !this.alarm) {
      this.spotted = clamp(this.spotted + (seen ? (dt / 1.1) * diff().fill : -dt * 0.45), 0, 1);
      hud.setMeter(this.spotted, seen ? 'A camera can see you!' : 'Camera', 'var(--red)');
      if (this.spotted >= 1) {
        this._caught('Caught on camera', 'The guards saw you and locked the doors. Kill the cameras in the security room first.');
        return;
      }
    }

    // --- Vault door swings open
    if (this.vaultOpen && this.doorAngle < 1.65) this._setVaultDoor(Math.min(1.65, this.doorAngle + dt * 0.8));

    // --- Things to do: walk over a ring and it happens straight away
    const act = this._actionHere(p);
    if (act) { act(); if (this.done) return; }

    // --- Alarm: flashing red lights and a countdown
    if (this.alarm) {
      this.alarmT -= dt;
      const pulse = (Math.sin(this.camTime * 8) + 1) / 2;
      L.alarmLight.intensity = 30 * pulse;
      for (const b of L.alarmBoxes) b.material.color.setHex(pulse > 0.5 ? 0xff2020 : 0x551010);
      if (this.alarmT <= 0) {
        this._caught('Busted', 'The police stormed the building. As soon as the alarm goes, run for the roof stairs.');
        return;
      }
    }

    // --- Rings pulse; the next one is brightest
    const next = this._nextSpot();
    for (const [id, ring] of Object.entries(this.rings)) {
      const active = this._spotActive(id);
      ring.visible = active;
      ring.material.opacity = id === next ? 0.6 + Math.sin(this.camTime * 5) * 0.3 : 0.35;
      ring.rotation.z += dt * (id === next ? 1.2 : 0.3);
    }
    for (const c of L.cashPiles) {
      c.ring.visible = this.vaultOpen && !c.taken;
      c.ring.rotation.z += dt;
    }

    // --- Marker + HUD
    this._updateMarker(p);
    this._objective();
    const clues = Object.keys(this.chapter.clues).length;
    hud.setStats(`<span>Take <b>$${(this.cash * 250000).toLocaleString('en-US')}</b></span>` +
      `<span>Clues <b>${this.run.clues.size}/${clues}</b></span>` +
      (this.alarm ? `<span class="warn">Police inside in <b>${formatTime(Math.max(0, this.alarmT))}</b></span>` : `<span>Time <b>${formatTime(s.time)}</b></span>`));
  }

  _spotActive(id) {
    if (id === 'cameras') return !this.camsOff;
    if (id === 'note') return !this.hasCode;
    if (id === 'keypad') return !this.vaultOpen;
    if (id === 'roof') return this.alarm;
    return false;
  }

  _nextSpot() {
    if (!this.camsOff) return 'cameras';
    if (!this.hasCode) return 'note';
    if (!this.vaultOpen) return 'keypad';
    if (this.alarm) return 'roof';
    return null;
  }

  /** What happens where the player is standing? (a function to call, or null) */
  _actionHere(p) {
    const near = (v, r = USE_RADIUS) => Math.hypot(p.x - v.x, p.z - v.z) < r;
    const S = this.level.spots;
    if (!this.camsOff && near(S.cameras)) return () => this._camerasOff();
    if (!this.hasCode && near(S.note)) return () => this._gotCode();
    if (!this.vaultOpen && near(S.keypad)) {
      if (!this.hasCode) {
        if (!this._lockedMsg) { this._lockedMsg = true; this.state.game.hud.toast('Locked', 'You need the vault code. Try the manager\'s office.', 'var(--muted)'); audio.sfx('locked'); }
        return null;
      }
      return () => this._openVault();
    }
    this._lockedMsg = this._lockedMsg && near(S.keypad, USE_RADIUS + 1);
    if (this.vaultOpen) {
      for (const c of this.level.cashPiles) {
        if (!c.taken && near(c.pos, 2.2)) return () => this._grab(c);
      }
    }
    if (this.alarm && near(S.roof)) return () => this._toRoof();
    return null;
  }

  _camerasOff() {
    const L = this.level;
    this.camsOff = true;
    this.spotted = 0;
    this.state.game.hud.setMeter(0, '');
    L.panel.material.emissive.setHex(0x30ff70);
    for (const c of L.cams) c.lens.material.color.setHex(0x222222);
    audio.sfx('checkpoint');
    this.state.game.hud.toast('Cameras off', 'Now find the vault code. The manager keeps it in his office.', 'var(--cyan)');
  }

  _gotCode() {
    this.hasCode = true;
    this.level.note.visible = false;
    audio.sfx('clue', { vol: 0.6 });
    this.state.game.hud.toast('Vault code: 0417', 'A sticky note under the keyboard. Classic.', 'var(--amber)');
  }

  _openVault() {
    this.vaultOpen = true;
    this.level.vaultDoorBox.disabled = true;
    this.level.keypad.material.emissive.setHex(0x30ff70);
    for (let i = 0; i < 4; i++) setTimeout(() => audio.sfx('click'), i * 110);
    setTimeout(() => audio.sfx('vault'), 500);
    this.state.game.hud.toast('Vault open', 'Grab all four pallets of cash.', 'var(--amber)');
  }

  _grab(c) {
    c.taken = true;
    c.group.visible = false;
    this.cash++;
    const shop = earn(this.state.game, 50, '', { quiet: true });
    audio.sfx('cash');
    const left = 4 - this.cash;
    this.state.game.hud.toast(`+$250,000  (+$${shop} for you)`, left ? `${left} more to go.` : '', 'var(--safe)');
    if (!left) this._triggerAlarm();
  }

  _triggerAlarm() {
    this.alarm = true;
    this.alarmT = ALARM_TIME * diff().timer;
    this.state.game.hud.setMeter(0, '');
    audio.sfx('sting');
    const v = SUSPECTS.vince;
    this.state.game.hud.toast('ALARM!', `${v.name}, on the radio: "Cops! Forget the van. Take the stairs to the roof, your car is on the Pier Street garage roof." Run!`, 'var(--red)', 7);
  }

  /** Admin: finish the heist right now. */
  adminSkip() {
    if (!this.done) this._toRoof();
  }

  _toRoof() {
    this.done = true;
    this.state.game.hud.setMeter(0, '');
    audio.sfx('door');
    finishPart(this.state, this);
  }

  /** Is the line between two points blocked by a wall? (for camera sight) */
  _blocked(ax, az, bx, bz) {
    const w = this.state.world;
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
    const from = { x: ax, y: 1.6, z: az }, dir = { x: dx / len, y: 0, z: dz / len };
    return w.raycast(from, dir, len - 0.6) < len - 0.6;
  }

  _updateMarker(p) {
    const s = this.state, hud = s.game.hud, S = this.level.spots;
    let target = null, label = '';
    if (!this.camsOff) { target = S.cameras; label = 'Security room'; }
    else if (!this.hasCode) { target = S.note; label = 'Manager\'s office'; }
    else if (!this.vaultOpen) { target = S.keypad; label = 'Vault keypad'; }
    else if (!this.alarm) {
      let bd = Infinity;
      for (const c of this.level.cashPiles) {
        if (c.taken) continue;
        const d = Math.hypot(c.pos.x - p.x, c.pos.z - p.z);
        if (d < bd) { bd = d; target = c.pos; }
      }
      label = 'Cash';
    } else { target = S.roof; label = 'Roof stairs'; }
    if (!target) { hud.setMarker(null); return; }
    this._mk ||= new THREE.Vector3();
    this._mk.set(target.x, 1.6, target.z);
    hud.setMarker(this._mk, s.camera, label, this.alarm ? 'var(--safe)' : 'var(--cyan)', Math.hypot(target.x - p.x, target.z - p.z));
  }

  teardown() {}
}

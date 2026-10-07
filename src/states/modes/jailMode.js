import * as THREE from 'three';
import { PrisonMode } from './prisonMode.js';
import { MiniGame } from '../../ui/miniGame.js';
import { showCard, hideCard } from '../../ui/menus.js';
import { leaveJail } from '../../core/jail.js';
import { diff } from '../../core/difficulty.js';
import { JUMPSUIT_LOOK } from '../../player/people.js';
import { audio } from '../../core/audio.js';

// Jail: you were caught three times, and now you're in a cell on Blackwater
// (the island prison). Break out:
//   1. Pick your cell's lock (at the door, from inside: a mini-game).
//      That sets off the alarm: a lockdown countdown starts, and the alarm
//      cuts the power to the corridor lasers.
//   2. Out of D Block, across the yard (searchlights and guards: get seen
//      and it's back to your cell, but it doesn't count as being caught),
//      up the east wall stairs and down the zip line to a waiting boat.
//   3. Free: back to wherever you were caught.
// It's the Chapter 7 prison (PrisonMode) with its own start and finish.

const LOCK = new THREE.Vector3(12, 0, -31.9); // (inside your cell, by the door)

export class JailMode extends PrisonMode {
  constructor(state, params) {
    super(state, { chapterId: 'chapter7', part: 0 });
    this.isJail = true;
    this.stage = 'dblock';
    this.chapter = { id: 'jail', title: 'Jail' };
    this.part = { title: 'Break out', objective: 'Pick the lock on your cell door' };
    this.partIndex = 0;
    void params;
  }

  build() {
    const L = super.build();
    const V = (x, z) => new THREE.Vector3(x, 0.05, z);
    L.checkpoints = [
      { name: 'Your cell', spawn: V(12, -36), yaw: Math.PI },
      { name: 'Outside D Block', spawn: V(0, -19), yaw: Math.PI / 2 },
      { name: 'The east wall stairs', spawn: V(40, 0), yaw: 0 },
    ];
    L.spawn = L.checkpoints[0].spawn.clone();
    L.spawn.yaw = Math.PI;
    this.ricky.root.visible = false;
    return L;
  }

  start() {
    const s = this.state, L = this.level;
    this.stage = 'dblock';
    const keep = s.game.chapterRun; // (don't lose the story chapter you were caught in)
    super.start(false);
    s.game.chapterRun = keep;
    this.run = { caught: 0, flags: {} };
    this.cp = 0;
    // The way out of D Block is open from inside; your cell isn't
    L.dbDoorBox.disabled = true;
    L.dbDoor.userData.open = true;
    L.dbDoor.position.x = 3.9;
    L.reader.material.emissive.setHex(0x30ff70);
    this.keycard = true;
    this.keycardMesh.visible = false;
    this.ricky.root.visible = false;
    s.placePlayer(L.checkpoints[0].spawn, Math.PI);
    const hud = s.game.hud;
    hud.setPhase('Jail · Blackwater');
    hud.setObjective('Pick the lock on your cell door');
    hud.toast('In jail', 'Caught three times, and they brought you to Blackwater. Pick your cell door\'s lock (walk up to it), then get out over the east wall.', 'var(--red)', 7);
  }

  _caught(title, msg) {
    // (being caught in here sends you back, but doesn't count)
    if (this.disguised) { this._setDisguise(false); msg += ' (They took the uniform.)'; }
    audio.sfx('caught');
    if (this.alarm) this.lockdown = 150 * diff().timer;
    this._toCheckpoint(title, msg);
  }

  update(dt) {
    if (this.done) return;
    const s = this.state, p = s.player.pos, input = s.game.input;
    // Your cell's lock (from inside, at the door)
    if (!this.freed && !this.mini) {
      const at = Math.hypot(p.x - LOCK.x, p.z - LOCK.z) < 1.7;
      if (!at) this.miniBlocked = false;
      else if (!this.miniBlocked) this.mini = new MiniGame({ type: 'hack', title: 'Picking the lock', hint: 'Jump (Space / A / tap) when it lines up · C to step away' });
    }
    if (this.mini && !this.freed) {
      if (input.wasPressed('crouch')) { this._closeMini(); this.miniBlocked = true; }
      else {
        const r = this.mini.update(dt, input.wasPressed('jump'));
        if (r === 'done') { this._closeMini(); this._freeRicky(); }
      }
      this._updateMarker(p);
      return;
    }
    super.update(dt);
    // Lockdown: past the stairs is a checkpoint
    if (this.stage === 'lockdown' && this.cp < 2 && p.x > 38) this.cp = 2;
  }

  // (opening your own cell)
  _freeRicky() {
    const s = this.state, L = this.level, hud = s.game.hud;
    this.freed = true;
    L.cellDoorBox.disabled = true;
    L.cellDoor.position.x = 12 - 2.1;
    L.keypad.material.emissive.setHex(0x30ff70);
    audio.sfx('door');
    this.alarm = true;
    this.lockdown = 150 * diff().timer;
    s.player.zipLines = [L.zip];
    audio.sfx('sting');
    hud.setObjective('Get out of D Block, then over the east wall');
    hud.toast('The door\'s open!', 'And the alarm\'s going: the lasers are off, but you\'ve got until the lockdown. Out of D Block, then up the east wall stairs to the zip line.', 'var(--red)', 6);
  }

  _updateRicky() {}

  // (in a prison jumpsuit, unless you've got the guard uniform on)
  _setDisguise(on) {
    super._setDisguise(on);
    if (!on) this.state.model?.setOutfit({ hoodie: JUMPSUIT_LOOK.hoodie, trousers: JUMPSUIT_LOOK.trousers, style: { top: 'jumpsuit' } });
  }

  _updateMarker(pos) {
    const s = this.state, hud = s.game.hud, S = this.level.spots;
    let t, label, color = 'var(--cyan)';
    if (!this.freed) { t = LOCK; label = 'Your cell door'; color = 'var(--amber)'; }
    else if (this.stage === 'dblock') { t = new THREE.Vector3(0, 0, -21); label = 'Way out'; color = 'var(--amber)'; }
    else if (pos.x < 42 || pos.y < 6) { t = S.landing; label = 'East wall: zip line'; color = 'var(--amber)'; }
    else { t = S.pier; label = 'The boat'; color = 'var(--safe)'; }
    this._mk ||= new THREE.Vector3();
    this._mk.set(t.x, (t.y || 0) + 1.8, t.z);
    hud.setMarker(this._mk, s.camera, label, color, Math.hypot(t.x - pos.x, t.z - pos.z));
  }

  _finish() {
    if (this.done) return;
    // Out of D Block: on to the yard and the wall (same level, next stage)
    if (this.stage === 'dblock') {
      this.stage = 'lockdown';
      this.cp = 1;
      audio.sfx('checkpoint', { vol: 0.6 });
      this.state.game.hud.setObjective('Up the east wall stairs, down the zip line to the boat');
      return;
    }
    this.done = true;
    const s = this.state;
    this._closeMini();
    s.setAction(null);
    s.game.hud.setMeter(0, '');
    audio.sfx('win');
    s.over = true;
    s.inCard = true;
    s.game.input.exitPointerLock?.();
    showCard('<p class="sub kicker">Jail</p><h2>You broke out!</h2><p class="sub">Over the wall and away on the boat. Back to it, and try not to get caught again.</p>', [
      { label: 'Carry on', primary: true, onClick: () => { hideCard(); s.inCard = false; leaveJail(s.game); } },
    ]);
  }

  adminSkip() { this.stage = 'lockdown'; this._finish(); }
}

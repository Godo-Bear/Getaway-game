import * as THREE from 'three';
import { buildChapter8Vault } from '../../world/levels/chapter8Vault.js';
import { makeGlowMaterial } from '../../world/materials.js';
import { GuardSquad } from '../../ai/guards.js';
import { Searchlight } from '../../ai/searchlight.js';
import { PlayerModel } from '../../player/playerModel.js';
import { MiniGame } from '../../ui/miniGame.js';
import { CHAPTERS } from '../../story/chapters.js';
import { getChapterRun } from '../../story/chapterRun.js';
import { finishPart } from '../../story/chapterFlow.js';
import { earn } from '../../gadgets/gadgets.js';
import { admin } from '../../core/admin.js';
import { diff } from '../../core/difficulty.js';
import { formatTime, clamp } from '../../core/utils.js';
import { audio } from '../../core/audio.js';

// Chapter 8: the Glacier Vault, on top of the mountain, at night in the snow.
//   1. Off the cable car, across the summit plateau: two searchlight masts
//      sweep the snow and guards walk loops (rocks and snowcats are cover;
//      knock guards out from behind with E).
//   2. Hack the panel by the steel door (mini-game): the door slides up.
//   3. The ice tunnel: laser fences across it. The pulsing ones switch off
//      every few seconds; the low ones you crouch or slide under.
//   4. The round vault door: crack the dial (mini-game).
//   5. Grab the four gold stacks. The last one sets off the alarm: guards
//      on alert, searchlights hunting, the lasers drop, and the bank's
//      helicopter is on its way (a countdown).
//   6. Run to the jump deck on the east edge, jump off the mountain and glide
//      (Juno's wingsuit: jump again in the air and HOLD) down to her ledge.

const ESCAPE = 75;      // seconds after the alarm (x difficulty)
const GOLD_CASH = 120;  // per gold stack
const GUARD_LOOK = { hoodie: 0x2a3440, trousers: 0x1c2228, mask: 0xd8b48c, gloves: 0x1c2228 };
const JUNO_LOOK = { hoodie: 0xff9ad5, trousers: 0x2a2a3a, mask: 0xe8c4a0, skin: 0xe8c4a0, gloves: 0x2a2a3a };

export class GlacierMode {
  constructor(state, params) {
    this.state = state;
    this.chapter = CHAPTERS[params.chapterId || 'chapter8'];
    this.partIndex = params.part || 0;
    this.part = this.chapter.parts[this.partIndex];
    this.hudSections = ['tl', 'meter', 'controls', 'marker'];
    this.weather = 'snow';
    this.time = 'night';
    this.indoors = true;
    this.mini = null;
  }

  get inputLocked() { return !!this.mini; }
  get officers() { return this.guards; }
  /** Off the plateau = a fall; once you have the wingsuit, the drop to Juno's ledge is allowed. */
  get fallY() { return this.alarm ? -45 : -6; }

  build() {
    const L = buildChapter8Vault();
    L.spawn = L.checkpoints[0].spawn.clone();
    L.spawn.yaw = L.checkpoints[0].yaw;
    this.level = L;
    this.lights = L.towers.map((t) => new Searchlight(L.group, L.world, t));
    this.guards = new GuardSquad(L.group, L.world, L.guardRoutes.map((route) => ({ route })), { sight: diff().guardSight, look: GUARD_LOOK });
    const ring = (pos, color, r = 1.1) => {
      const m = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.25, 32), makeGlowMaterial(color, 0.8));
      m.rotation.x = -Math.PI / 2;
      m.position.set(pos.x, pos.y + 0.04, pos.z);
      L.group.add(m);
      return m;
    };
    this.panelRing = ring(L.spots.panel, 0x39e6ff);
    this.dialRing = ring(L.spots.dial, 0xffd040);
    for (const g of L.gold) g.ring = ring(g.pos, 0xffd040, 0.8);
    // Juno, waiting on the ledge far below with the snowmobile
    this.juno = new PlayerModel(JUNO_LOOK, { bag: false });
    const S = L.spots.ledge;
    this.juno.update(0, { pos: new THREE.Vector3(S.x + 2, S.y, S.z + 2), vel: new THREE.Vector3(), facing: -Math.PI / 2, state: 'ground', horizontalSpeed: 0, mantleProgress: 0, stateTime: 0, stumbleTimer: 0, mantle: null, wallRun: null });
    L.group.add(this.juno.root);
    return L;
  }

  afterBuild() {
    this.hadGlider = this.state.player.canGlide;
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
    this.prevZ = null;
    this.miniBlocked = false;
    this.lockWarn = 0;
    this.toldGlide = false;
    this._closeMini();
    for (const g of L.gold) { g.taken = false; g.stack.visible = true; }
    this._setDoor(false);
    this._setVault(false);
    s.player.canGlide = this.hadGlider;
    this.guards.reset();
    this.guards.setAlert(false);
    for (const l of this.lights) { l.reset(); l.alert = false; }
    const hud = s.game.hud;
    hud.setPhase(`${this.chapter.title} · Part ${this.partIndex + 1}: ${this.part.title}`);
    hud.setObjective(this.part.objective);
    if (first && !s.game.speedrun) s.showStoryCards(this.part.intro, this.part.startLabel || 'Go');
  }

  _setDoor(open) {
    const L = this.level;
    this.doorOpen = open;
    L.tunnelDoorBox.disabled = open;
    L.tunnelDoor.position.y = open ? 6.6 : 2.3;
    L.panel.material.emissive.setHex(open ? 0x30ff70 : 0xff3030);
  }

  _setVault(open) {
    const L = this.level;
    this.vaultOpen = open;
    L.vaultDoorBox.disabled = open;
    L.vaultDoorPivot.rotation.y = open ? 1.7 : 0;
  }

  _toCheckpoint(title, msg, color = 'var(--red)') {
    const s = this.state, cp = this.level.checkpoints[this.cp];
    this._closeMini();
    s.placePlayer(cp.spawn, cp.yaw);
    s.flash(title, msg, color);
    this.spotted = 0;
    this.prevZ = null;
    if (this.alarm) this.escape = ESCAPE * diff().timer;
    this.guards.reset();
    this.guards.setAlert(this.alarm);
    for (const l of this.lights) { l.reset(); l.alert = this.alarm; }
  }

  _caught(title, msg) {
    if (admin.flag('god')) { this.spotted = 0; return; }
    this.run.caught++;
    audio.sfx('caught');
    this._toCheckpoint(title, msg);
  }

  onRespawnKey() { this._toCheckpoint('Checkpoint', 'Back to the last checkpoint.', 'var(--cyan)'); }
  onFall() {
    this._toCheckpoint('Into the clouds', this.alarm
      ? 'Too low! Jump off the deck, then press jump again and HOLD it to glide. Steer for the green light.'
      : 'You slipped off the mountain. Back to the last checkpoint.', 'var(--cyan)');
  }

  audioMix() {
    return { siren: this.alarm ? 0.25 : 0, wind: 0.45, city: 0, music: 0.5, intensity: this.alarm ? 0.85 : 0.3 + this.spotted * 0.6 };
  }

  update(dt) {
    if (this.done) return;
    const s = this.state, L = this.level, p = s.player, pos = p.pos, hud = s.game.hud, input = s.game.input, d = diff();
    const near = (v, r = 1.6) => Math.hypot(pos.x - v.x, pos.z - v.z) < r && Math.abs(pos.y - v.y) < 2;
    const inTunnel = Math.abs(pos.x) < 4.2 && pos.z < -50 && pos.z > -86.5;

    // --- Searchlights and guards (out on the plateau and in the tunnel)
    for (const l of this.lights) l.update(dt, this.alarm ? pos : null);
    const lit = !s.concealed && pos.y > -3 && this.lights.some((l) => l.lights(pos, p.height));
    const seenByGuard = this.guards.update(dt, p, s.concealed);
    if (this.guards.bodyFound && !this.guards.alert) {
      this.guards.setAlert(true);
      hud.toast('Guard down!', 'A guard found the one you knocked out. They\'re all on alert.', 'var(--red)', 4);
    }
    const fill = (lit ? dt / 0.7 : 0) + (seenByGuard ? dt / 0.8 : 0);
    this.spotted = clamp(this.spotted + (fill ? fill * d.fill : -dt * 0.5), 0, 1);
    if (this.spotted > 0.01 && !this.mini) hud.setMeter(this.spotted, lit ? 'SEARCHLIGHT! Get behind a rock' : seenByGuard ? 'A guard can see you!' : 'Hidden', lit || seenByGuard ? 'var(--red)' : '#8a8f9c');
    else if (!this.mini) hud.setMeter(0, '');
    if (this.spotted >= 1) {
      this._caught('Spotted!', lit ? 'A searchlight caught you. Keep the rocks and snowcats between you and the masts.' : 'A guard saw you. Stay out of the torch beams, or knock them out from behind (E).');
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

    // --- The ice tunnel lasers (off once the alarm is going: the bank shuts them down to let its guards through)
    const cycle = 1.2 + 2.0 * d.timer;
    const pz = this.prevZ ?? pos.z;
    for (const las of L.lasers) {
      let on = !this.alarm;
      if (on && las.type === 'pulse') {
        const k = (s.time + las.phase * cycle) % cycle;
        on = k < 1.2;
        const warn = !on && k > cycle - 0.35;
        for (const b of las.beams) { b.visible = on || (warn && Math.random() < 0.5); b.material.opacity = on ? 0.95 : 0.35; }
      } else for (const b of las.beams) b.visible = on;
      const crossed = (pz - las.z) * (pos.z - las.z) <= 0 || Math.abs(pos.z - las.z) < 0.3;
      if (on && inTunnel && crossed && las.heights.some((y) => y > pos.y + 0.02 && y < pos.y + p.height)) {
        this.prevZ = null;
        this._caught('Laser tripped!', las.type === 'low' ? 'Crouch (C) or slide under the low beam.' : 'Wait for the beams to switch off (they flicker just before they come back), then go.');
        return;
      }
    }
    this.prevZ = pos.z;

    // --- Mini-games: the door panel and the vault dial
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
      const atPanel = !this.doorOpen && near(L.spots.panel, 1.5);
      const atDial = this.doorOpen && !this.vaultOpen && near(L.spots.dial, 1.6);
      if (!atPanel && !atDial) this.miniBlocked = false;
      else if (!this.miniBlocked) {
        this.miniFor = atPanel ? 'door' : 'vault';
        this.mini = atPanel
          ? new MiniGame({ type: 'hack', title: 'Hacking the door panel', hint: 'Jump (Space / A / tap) when it lines up · C to step away' })
          : new MiniGame({ type: 'safe', title: 'Cracking the vault dial', hint: 'Jump (Space / A / tap) on each click · C to step away' });
      }
    }
    if (!this.doorOpen && !this.mini && Math.abs(pos.x) < 4 && pos.z < -46 && pos.z > -50 && (this.lockWarn -= dt) <= 0) {
      this.lockWarn = 4;
      hud.toast('Locked', 'Hack the panel on the right of the door (blue ring).', 'var(--amber)', 3);
    }
    this.panelRing.visible = !this.doorOpen;
    this.dialRing.visible = this.doorOpen && !this.vaultOpen;

    // --- The gold
    for (const g of L.gold) {
      g.ring.visible = this.vaultOpen && !g.taken;
      if (this.vaultOpen && !g.taken && near(g.pos, 1.6)) this._grab(g);
    }
    if (this.alarm) this.escape -= dt;
    if (this.alarm && this.escape <= 0) {
      this._caught('The helicopter', 'The bank\'s helicopter landed and the guards boxed you in. After the last gold stack, run straight for the jump deck on the east edge.');
      return;
    }

    // --- The jump, and the glide down to Juno
    if (this.alarm && this.cp < 3 && pos.z > -50) { this.cp = 3; audio.sfx('checkpoint', { vol: 0.6 }); }
    L.jumpGlow.visible = this.alarm;
    L.landGlow.visible = this.alarm;
    const S = L.spots.ledge;
    if (this.alarm && p.grounded && pos.y < S.y + 2 && Math.hypot(pos.x - S.x, pos.z - S.z) < 19) { this._finish(); return; }
    if (this.alarm && !this.toldGlide && near(L.spots.jump, 3)) {
      this.toldGlide = true;
      hud.toast('Jump!', 'Run off the deck, press jump again in the air and HOLD it to glide. Steer for the green light.', '#ff9ad5', 5);
    }

    this._updateMarker(pos);
    hud.setStats(`<span>Gold <b>${this.taken}/${L.gold.length}</b></span><span>Time <b>${formatTime(s.time)}</b></span>` +
      (this.alarm ? `<span class="warn">Helicopter in <b>${formatTime(Math.max(0, this.escape))}</b></span>` : `<span${this.run.caught ? ' class="warn"' : ''}>Caught <b>${this.run.caught}</b></span>`));
  }

  _openDoor() {
    const hud = this.state.game.hud;
    this._setDoor(true);
    this.cp = 1;
    audio.sfx('door');
    hud.setObjective('Through the ice tunnel to the vault');
    hud.toast('Door open', 'Lasers ahead. The flashing ones switch off every few seconds; crouch or slide under the low ones.', 'var(--cyan)', 5);
  }

  _openVault() {
    const hud = this.state.game.hud;
    this._setVault(true);
    this.cp = 2;
    audio.sfx('door');
    hud.setObjective(`Grab the gold (0 of ${this.level.gold.length})`);
    hud.toast('The Glacier Vault', 'Gold. Shelves of it. The last stack is on a pressure plate: grab it, then RUN.', '#ffd040', 5);
  }

  _grab(g) {
    const s = this.state, hud = s.game.hud;
    g.taken = true;
    g.stack.visible = false;
    this.taken++;
    earn(s.game, GOLD_CASH, '', { quiet: true });
    audio.sfx('cash', { vol: 0.8 });
    const n = this.level.gold.length;
    if (this.taken < n) { hud.setObjective(`Grab the gold (${this.taken} of ${n})`); return; }
    // The alarm
    this.alarm = true;
    this.escape = ESCAPE * diff().timer;
    this.guards.setAlert(true);
    for (const l of this.lights) l.alert = true;
    s.player.canGlide = true;
    audio.sfx('sting');
    hud.setObjective('Run to the jump deck on the east edge and glide down to Juno');
    hud.toast('ALARM!', 'Juno, on the radio: "Helicopter\'s coming up the valley! Run to the wooden deck on the east edge and JUMP. Press jump again in the air and hold it: the wingsuit does the rest."', 'var(--red)', 7);
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
    const s = this.state, hud = s.game.hud, L = this.level, S = L.spots;
    let t, label, color = 'var(--cyan)';
    if (!this.doorOpen) { t = S.panel; label = 'Door panel'; }
    else if (!this.vaultOpen) { t = S.dial; label = 'Vault door'; color = 'var(--amber)'; }
    else if (!this.alarm) {
      t = L.gold.filter((g) => !g.taken).sort((a, b) => a.pos.distanceToSquared(pos) - b.pos.distanceToSquared(pos))[0].pos;
      label = 'Gold'; color = '#ffd040';
    } else if (pos.y > -2 && pos.x < 42) { t = S.jump; label = 'Jump deck'; color = '#ff9ad5'; }
    else { t = S.ledge; label = 'Juno'; color = 'var(--safe)'; }
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
    if (this.state.player) this.state.player.canGlide = this.hadGlider;
    this.guards?.dispose();
    for (const l of this.lights || []) l.dispose();
  }
}

import * as THREE from 'three';
import { buildChapter23Mine, ROUTES, cellPos, CELL } from '../../world/levels/chapter23Mine.js';
import { GuardSquad, huntMessages } from '../../ai/guards.js';
import { JACKAL_LOOK } from '../../player/people.js';
import { CHAPTERS } from '../../story/chapters.js';
import { getChapterRun } from '../../story/chapterRun.js';
import { finishPart } from '../../story/chapterFlow.js';
import { admin } from '../../core/admin.js';
import { diff } from '../../core/difficulty.js';
import { formatTime, clamp } from '../../core/utils.js';
import { noteCaught } from '../../core/jail.js';
import { audio } from '../../core/audio.js';

// Chapter 23, Part 4: LEVEL 9 (part id 'level9').
//
// The bottom of the mine, by lantern light. Carry the three bags of loot from
// Sable's vault to the ore cart at the loading bay, one at a time (heavy:
// you're slower, and you can't climb).
//   - LIGHT AND DARK: in a lantern's light the Jackals see you as far as
//     ever; in the dark only close up (closer still if you crouch). The
//     panel says which you're in.
//   - Blow a lantern out (E) to make more dark. A Jackal who walks past a
//     dark lantern lights it again.
//   - Knock Jackals out from behind (E). Throw a coin to send one to look.
//   - Caught: back to the last checkpoint (the bag you were carrying goes
//     back to the vault; the ones in the cart stay there).

const LIGHT_R = 7.5;        // how far a lantern lights you
const DARK_SIGHT = 0.38, DARK_CROUCH = 0.26;
const RELIGHT = 1.3;        // s a Jackal stands by a dark lantern before he lights it
const _v = new THREE.Vector3(), _d = new THREE.Vector3();
const P = (r, c) => { const p = cellPos(r, c); return [p.x, p.z]; };

export class MineMode {
  constructor(state, params) {
    this.state = state;
    this.chapter = CHAPTERS[params.chapterId || 'chapter23'];
    this.partIndex = params.part ?? 3;
    this.part = this.chapter.parts[this.partIndex];
    this.hudSections = ['tl', 'meter', 'controls', 'marker'];
    this.weather = 'clear';
    this.weatherForced = true;
    this.time = this.part.time || 'night';
    this.indoors = true;
  }

  get officers() { return this.guards; }
  get fallY() { return -10; }

  build() {
    const L = buildChapter23Mine();
    this.level = L;
    this.guards = new GuardSquad(L.group, L.world, ROUTES.map((route) => ({ route: route.map(([r, c]) => P(r, c)) })), { sight: diff().guardSight, look: JACKAL_LOOK, range: 11, alertRange: 14 });
    L.checkpoints = [
      { spawn: L.spawn.clone(), yaw: 0, name: 'The shaft' },
      { spawn: new THREE.Vector3(L.cartPos.x - 2, 0.05, L.cartPos.z), yaw: Math.PI / 2, name: 'The ore cart' },
    ];
    return L;
  }

  start(first) {
    const s = this.state, L = this.level;
    s.lighting.dark = 0.86;
    this.run = getChapterRun(s.game, this.chapter.id);
    this.done = false;
    this.cp = 0;
    this.told = {};
    this.t = 0;
    for (const b of L.bags) { b.done = false; b.group.visible = true; b.group.position.copy(b.home); }
    this.delivered = 0;
    this._reset();
    const hud = s.game.hud;
    if (first) hud.showControls(`<kbd>WASD</kbd> move &nbsp; <kbd>C</kbd> crouch &nbsp; <kbd>E</kbd> blow out a lantern / knock out from behind<br>Keep to the dark &nbsp; walk over a bag to pick it up &nbsp; <kbd>P</kbd> pause`);
    hud.setPhase(`${this.chapter.title} · Part ${this.partIndex + 1}: ${this.part.title}`);
    hud.setObjective(this.part.objective);
    if (first && !s.game.speedrun) s.showStoryCards(this.part.intro, this.part.startLabel || 'Go');
  }

  _reset() {
    const s = this.state, L = this.level;
    this.spotted = 0;
    this.guards.reset();
    this._drop(true);
    for (const l of L.lanterns) this._setLantern(l, true);
    this.light = 0;
  }

  _setLantern(l, on) {
    l.on = on;
    l.relight = 0;
    l.glass.visible = l.halo.visible = on;
    l.light.intensity = on ? 16 : 0;
  }

  /** Put down the bag you're carrying (home: back in the vault). */
  _drop(home) {
    const c = this.carrying;
    if (!c) return;
    c.carryMesh?.parent?.remove(c.carryMesh);
    c.group.visible = !c.done;
    if (home) c.group.position.copy(c.home);
    this.carrying = null;
    this.state.player.noClimb = false;
  }

  _caught(title, msg) {
    if (admin.flag('god')) { this.spotted = 0; return; }
    if (noteCaught(this.state)) return; // (the third time: off to jail)
    this.run.caught++;
    audio.sfx('caught');
    const s = this.state, cp = this.level.checkpoints[this.cp];
    this._reset();
    s.placePlayer(cp.spawn, cp.yaw);
    s.flash(title, msg, 'var(--red)');
  }

  onRespawnKey() {
    const s = this.state, cp = this.level.checkpoints[this.cp];
    this._reset();
    s.placePlayer(cp.spawn, cp.yaw);
    s.flash('Checkpoint', 'Back to the last checkpoint.', 'var(--cyan)');
  }

  audioMix() {
    return { wind: 0.06, city: 0, engine: 0, siren: 0, music: 0.35, intensity: 0.3 + this.spotted * 0.6 + (this.carrying ? 0.12 : 0) };
  }

  _tell(key, title, text, color = 'var(--amber)', t = 4) {
    if (this.told[key]) return;
    this.told[key] = true;
    this.state.game.hud.toast(title, text, color, t);
  }

  /** How lit you are (0 dark .. 1 right under a lantern): the lanterns that can see you, and the vault's lamp. */
  _lightAt(pos) {
    const L = this.level, w = L.world;
    let best = 0;
    _v.set(pos.x, pos.y + 1.1, pos.z);
    for (const l of L.lanterns) {
      if (!l.on) continue;
      const d = l.pos.distanceTo(_v);
      if (d > LIGHT_R) continue;
      _d.copy(_v).sub(l.pos).normalize();
      if (w.raycast(l.pos, _d, d - 0.3) < d - 0.3) continue; // (rock in the way)
      best = Math.max(best, 1 - d / LIGHT_R);
    }
    // the vault is lit by its own lamp
    if (pos.x < 2.5 * CELL && pos.z > 4.5 * CELL) best = Math.max(best, 0.8);
    return best;
  }

  update(dt) {
    if (this.done) return;
    const s = this.state, L = this.level, p = s.player, pos = p.pos, hud = s.game.hud, input = s.game.input, d = diff();
    this.t += dt;

    // --- Light and dark
    this.light = this._lightAt(pos);
    const lit = this.light > 0.12;
    this.guards.sight = d.guardSight * (lit ? 1 : p.height < 1.3 ? DARK_CROUCH : DARK_SIGHT);

    // --- The Jackals: they see you (maybe), and light the lanterns they pass
    const seen = this.guards.update(dt, p, s.concealed);
    const searching = huntMessages(this.guards, hud, 'Jackals');
    for (const u of this.guards.units) {
      if (u.down || u.stunned > 0) continue;
      for (const l of L.lanterns) {
        if (l.on || Math.hypot(u.pc.pos.x - l.pos.x, u.pc.pos.z - l.pos.z) > 2.2) continue;
        l.relight += dt;
        if (l.relight > RELIGHT) {
          this._setLantern(l, true);
          audio.sfx('flick', { vol: 0.4 });
          this._tell('relit', 'Lit again', 'A Jackal walked past a dark lantern and lit it. They always will: blow it out again once he\'s gone.', 'var(--amber)', 3.5);
        }
      }
    }
    if (this.guards.bodyFound) { this.guards.bodyFound = null; this.guards.setAlert(true); hud.toast('Man down!', 'A Jackal found the one you knocked out. They\'re all on the lookout now.', 'var(--red)', 4); }
    this.spotted = clamp(this.spotted + (seen ? (dt / 0.85) * d.fill : -dt * 0.5), 0, 1);
    if (this.spotted >= 1) {
      this._caught('Caught', lit ? 'A Jackal saw you in the lantern light. Keep to the dark, and blow lanterns out (E) to make more of it.' : 'A Jackal walked right into you in the dark. Crouch (C) when one comes close, or go round.');
      return;
    }

    // --- What you can do: knock out, blow out a lantern
    let action = null;
    const ko = this.guards.takedownTarget(p);
    const lamp = !ko && L.lanterns.find((l) => l.on && Math.hypot(l.pos.x - pos.x, l.pos.z - pos.z) < 2.0);
    if (ko) {
      action = 'Knock out';
      if (input.wasPressed('interact')) { this.guards.takedown(ko); action = null; audio.sfx('land', { vol: 1 }); hud.toast('Knocked out', 'If another Jackal finds him, they\'ll all be on the lookout.', 'var(--amber)', 2.5); }
    } else if (lamp) {
      action = 'Blow out the lantern';
      if (input.wasPressed('interact')) { this._setLantern(lamp, false); action = null; audio.sfx('whoosh', { vol: 0.35, rate: 1.6 }); this._tell('blown', 'Dark', 'The lantern\'s out. In the dark the Jackals only see you close up.', 'var(--safe)', 3); }
    }
    s.setAction(action);

    // --- The loot: pick a bag up, carry it to the cart
    if (this.carrying) {
      p.speedScale *= 0.72; // (every frame: the game resets it)
      p.noClimb = true;
      s.model.carrying = true;
      if (Math.hypot(pos.x - (L.cartPos.x - 1.6), pos.z - L.cartPos.z) < 2.3) this._deliver();
      if (this.done) return;
    } else {
      const b = L.bags.find((x) => !x.done && x.group.visible && Math.hypot(x.group.position.x - pos.x, x.group.position.z - pos.z) < 1.3);
      if (b) this._pickUp(b);
    }
    for (const b of L.bags) if (b.group.visible) b.ring.rotation.z += dt;
    L.dropRing.visible = !!this.carrying;
    L.dropRing.rotation.z += dt;

    // --- The meter, the marker
    if (this.spotted > 0.01) hud.setMeter(this.spotted, seen ? 'A JACKAL CAN SEE YOU!' : searching || 'Hidden', seen ? 'var(--red)' : '#ff7a1a');
    else if (searching) hud.setMeter(0, searching, '#ff7a1a');
    else hud.setMeter(this.light, lit ? 'In the light: they can see you' : 'In the dark', lit ? '#ffb040' : 'var(--safe)');
    let t, label;
    if (this.carrying) { t = _v.set(L.cartPos.x, 1.5, L.cartPos.z); label = 'The ore cart'; }
    else { const b = L.bags.find((x) => !x.done); t = _v.set(b.home.x, 1, b.home.z); label = 'Sable\'s loot'; }
    hud.setMarker(t, s.camera, label, 'var(--amber)', Math.hypot(t.x - pos.x, t.z - pos.z));
    const out = L.lanterns.filter((l) => !l.on).length;
    hud.setStats(`<span>In the cart <b>${this.delivered}/3</b></span>${this.carrying ? '<span><b style="color:#ffb020">CARRYING</b></span>' : ''}` +
      `<span>${lit ? '<b style="color:#ffb040">IN THE LIGHT</b>' : '<b style="color:#4dffa6">In the dark</b>'}</span><span>Lanterns out <b>${out}</b></span>` +
      `<span>Time <b>${formatTime(s.time)}</b></span><span${this.run.caught ? ' class="warn"' : ''}>Caught <b>${this.run.caught}</b></span>`);
  }

  _pickUp(b) {
    const s = this.state;
    this.carrying = b;
    b.group.visible = false;
    const m = b.group.children[0].clone();
    m.scale.multiplyScalar(0.8);
    m.position.set(0.05, -0.35, 0.05);
    b.carryMesh = m;
    (s.model.elbowR || s.model.root).add(m);
    audio.sfx('coin', { vol: 0.6 });
    s.game.hud.toast('A bag of loot', 'Heavy! You\'re slower, and you can\'t climb with it. Take it to the ore cart (the green ring at the loading bay).', 'var(--amber)', 4);
  }

  _deliver() {
    const s = this.state, L = this.level, b = this.carrying;
    b.done = true;
    this._drop(false);
    this.delivered++;
    audio.sfx('checkpoint', { vol: 0.6 });
    if (this.cp === 0) this.cp = 1;
    if (this.delivered >= L.bags.length) { this._finish(); return; }
    s.game.hud.toast(`In the cart: ${this.delivered} of ${L.bags.length}`, this.delivered === 1 ? 'Kitsu: "Lovely. Two more." (This is your checkpoint now.)' : 'Kitsu: "One more! Then get in the cart."', 'var(--safe)', 3);
  }

  _finish() {
    if (this.done) return;
    this.done = true;
    const s = this.state;
    s.setAction(null);
    s.game.hud.setMeter(0, '');
    audio.sfx('win');
    finishPart(s, this);
  }

  adminSkip() { this._finish(); }

  teardown() {
    const s = this.state;
    this._drop(true);
    if (s.lighting) s.lighting.dark = 0;
  }
}

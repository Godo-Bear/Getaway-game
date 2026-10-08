import * as THREE from 'three';
import { buildChapter20Opera, bridgeY, BRIDGE_X, GALLERY_Y, UPPER_Y, STAGE_X, PROSC_Z } from '../../world/levels/chapter20Opera.js';
import { GuardSquad, huntMessages } from '../../ai/guards.js';
import { Searchlight } from '../../ai/searchlight.js';
import { CHAPTERS } from '../../story/chapters.js';
import { getChapterRun } from '../../story/chapterRun.js';
import { finishPart } from '../../story/chapterFlow.js';
import { earn } from '../../gadgets/gadgets.js';
import { admin } from '../../core/admin.js';
import { diff } from '../../core/difficulty.js';
import { formatTime, clamp } from '../../core/utils.js';
import { noteCaught } from '../../core/jail.js';
import { audio } from '../../core/audio.js';

// Chapter 20, Part 3: THE OPÉRA (part id 'opera').
//
//  Valcourt took the Star and didn't pay. He's watching the gala from Box 5,
//  with the Star in its case on the little table beside him. Take it back:
//
//   1. Up the ladder in the left wing to the fly gallery. You're dressed in
//      stage blacks like the stagehands, so they only notice a stranger
//      close up.
//   2. Across the stage, high above the show, on the flying bridges: they
//      go up and down on their ropes, so wait for the next one to come level
//      and jump. Low down, the follow spots can catch you through the arch
//      (the audience would see you!); up high, the arch hides you. Fall onto
//      the stage and it's back to the last checkpoint.
//   3. Through the little door off the right gallery into Box 5. Valcourt's
//      bodyguard paces the back of the box, watching the door; Valcourt
//      keeps turning round in his seat to admire the Star. Take it (E) while
//      he's watching the show.
//   4. Everyone knows now: back over the bridges, riding them UP to the top
//      gallery on the left, and out through the hatch in the roof.

const CASH = 3500;
const RADIUS = 4.2;            // the follow spots' circles
const GAZE_EVERY = 7, GAZE_FOR = 2.4;
const SHOW_F = -1.9;           // Valcourt watching the stage
const BLACKS = { hoodie: 0x18181c, trousers: 0x18181c, gloves: 0x18181c, shoes: 0x0a0a0a, style: { top: 'tracksuit', bag: true, hat: 'beanie' } };
const STAGEHAND = { hoodie: 0x1c1c22, trousers: 0x1c1c22, hat: 0x1c1c22, shoes: 0x0a0a0a, style: { top: 'tracksuit', hat: 'headphones' } };
const BODYGUARD = { hoodie: 0x16161a, trousers: 0x16161a, shoes: 0x0a0a0a, tie: 0x16161a, style: { top: 'suit', face: 'shades', build: 1.15 } };
const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _c = new THREE.Vector3();
const yawTo = (from, to) => Math.atan2(to[0] - from.x, to[1] - from.z) - Math.PI;
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

export class OperaMode {
  constructor(state, params) {
    this.state = state;
    this.chapter = CHAPTERS[params.chapterId || 'chapter20'];
    this.partIndex = params.part ?? 2;
    this.part = this.chapter.parts[this.partIndex];
    this.hudSections = ['tl', 'meter', 'controls', 'marker'];
    this.weather = 'clear';
    this.weatherForced = true;
    this.time = 'night';
    this.indoors = true;
  }

  get officers() { return this.guards; }
  get fallY() { return -4; }

  build() {
    const L = buildChapter20Opera();
    this.level = L;
    const cp = (x, y, z, look) => { const v = new THREE.Vector3(x, y, z); return { spawn: v, yaw: yawTo(v, look) }; };
    L.checkpoints = [
      cp(-15.6, 0.05, -3, [-13, -6.5]),                    // the left wing, by the ladder
      cp(17.3, GALLERY_Y + 0.05, 6.5, [15, 8]),             // the right gallery, by Box 5's door
      cp(17.2, GALLERY_Y + 0.05, -7.6, [0, -1]),            // (with the Star) the right gallery, back end
    ];
    L.spawn = L.checkpoints[0].spawn.clone();
    L.spawn.yaw = L.checkpoints[0].yaw;
    // the stagehands on the lower galleries
    this.guards = new GuardSquad(L.group, L.world, [
      [[-15.4, -8], [-15.4, 6.6]],
      [[15.6, 2], [15.6, -8]],
    ].map((route) => ({ route })), { sight: diff().guardSight, look: STAGEHAND, range: 9, alertRange: 12, groundFrom: GALLERY_Y + 1 });
    // Valcourt's bodyguard, pacing the back of the box
    this.patrols = new GuardSquad(L.group, L.world, [[[16.9, 12.4], [16.9, 9.6]]].map((route) => ({ route })),
      { sight: diff().guardSight, look: BODYGUARD, range: 6.5, alertRange: 9, groundFrom: GALLERY_Y + 1 });
    // the follow spots, from the back of the auditorium
    this.spots = [
      { x: -7, path: [[-8, 2], [7, -2], [-3, -5], [6, 4], [-9, -2]] },
      { x: 7, path: [[6, -4], [-7, 3], [2, 5], [-9, -4], [8, 1]] },
    ].map((d) => {
      const sl = new Searchlight(L.group, L.world, { x: d.x, z: 36, h: 12.5, path: d.path });
      sl.speed = 3.6;
      const light = new THREE.SpotLight(0xfff4e0, 260, 60, 0.13, 0.5, 1.2);
      light.position.copy(sl.lamp);
      L.group.add(light, light.target);
      return { sl, light };
    });
    return L;
  }

  start(first) {
    const s = this.state;
    this.run = getChapterRun(s.game, this.chapter.id);
    this.done = false;
    this.cp = 0;
    this.hasStar = false;
    this.t = 0;
    this.gazeT = 0;
    s.lighting.dark = 0.6;
    s.model.setOutfit(BLACKS);
    const L = this.level;
    L.star.visible = L.starGlow.visible = true;
    L.hatchGlow.visible = false;
    L.valcourt.seated = true;
    L.vBody.facing = SHOW_F;
    this._reset();
    const hud = s.game.hud;
    if (first) hud.showControls(`<kbd>WASD</kbd> move &nbsp; <kbd>Space</kbd> jump &nbsp; <kbd>C</kbd> crouch &nbsp; <kbd>E</kbd> take / knock out<br>
      Wait for a bridge to come level, then jump &nbsp; <kbd>P</kbd> pause`);
    hud.setPhase(`${this.chapter.title} · Part ${this.partIndex + 1}: ${this.part.title}`);
    hud.setObjective(this.part.objective);
    if (first && !s.game.speedrun) s.showStoryCards(this.part.intro, this.part.startLabel || 'Go');
  }

  _reset() {
    this.spotted = 0;
    this.guards.reset();
    this.patrols.reset();
    this.guards.setAlert(this.hasStar);
    this.patrols.setAlert(this.hasStar);
    for (const f of this.spots) { f.sl.reset(); f.sl.alert = this.hasStar; }
  }

  _caught(title, msg) {
    if (admin.flag('god')) { this.spotted = 0; return; }
    if (noteCaught(this.state)) return; // (the third time: off to jail)
    this.run.caught++;
    audio.sfx('caught');
    this._toCheckpoint(title, msg);
  }

  _toCheckpoint(title, msg, color = 'var(--red)') {
    const s = this.state, cp = this.level.checkpoints[this.cp];
    this._reset();
    s.placePlayer(cp.spawn, cp.yaw);
    s.flash(title, msg, color);
  }

  onRespawnKey() { this._toCheckpoint('Checkpoint', 'Back to the last checkpoint.', 'var(--cyan)'); }
  onFall() { this._toCheckpoint('Whoa', 'Back to the last checkpoint.', 'var(--cyan)'); }

  audioMix() {
    return { wind: 0, city: 0, engine: 0, siren: 0, music: 0.6, intensity: 0.3 + this.spotted * 0.6 + (this.hasStar ? 0.25 : 0) };
  }

  update(dt) {
    if (this.done) return;
    const s = this.state, L = this.level, p = s.player, pos = p.pos, hud = s.game.hud, input = s.game.input, d = diff();
    s.lighting.dark = 0.6;
    this.t += dt;

    // --- The flying bridges (and their ropes up to the grid)
    L.bridges.forEach((b, i) => {
      const y = bridgeY(i, this.t);
      b.plat.moveTo(_v.set(b.x, y, -1), p);
      for (const r of b.ropes.children) { r.scale.y = 24 - y; r.position.y = (24 - y) / 2; }
    });
    // --- The show goes on
    for (const sg of L.singers) {
      sg.t += dt;
      const k = Math.sin(sg.t * 0.3), b = sg.body;
      const nx = (sg === L.singers[0] ? -2.5 : 2.5) + k * 2.2;
      b.vel.set((nx - b.pos.x) / Math.max(dt, 1e-3), 0, 0);
      b.horizontalSpeed = Math.min(1.2, Math.abs(b.vel.x));
      b.pos.set(nx, 0, 2.2 + Math.cos(sg.t * 0.3) * 0.8);
      b.facing = 0.4 * Math.sign(b.vel.x);
      sg.model.update(dt, b);
    }

    // --- Off the edge: onto the stage (in front of everyone), or into the stalls
    if (pos.y < 0.6 && Math.abs(pos.x) < STAGE_X && pos.z > -9 && pos.z < 8.3) {
      this._toCheckpoint('On stage!', 'You dropped onto the stage in the middle of the aria. The tenor didn\'t miss a note, but you\'d better try that again. Wait for the next bridge to come level before you jump.', 'var(--amber)');
      return;
    }
    if (pos.z > 8.3 && pos.y < 3) { this._toCheckpoint('In the stalls!', 'You landed in the front row. Back to the last checkpoint.', 'var(--amber)'); return; }

    // --- Who can see you: stagehands (only close up while you're in stage blacks), the bodyguard, the follow spots, Valcourt
    const seenHands = this.guards.update(dt, p, s.concealed, { closeOnly: !this.hasStar });
    const seenGuard = this.patrols.update(dt, p, s.concealed);
    if (seenGuard) this.guards.alarmAt(pos);
    let lit = false;
    for (const f of this.spots) {
      f.sl.update(dt, this.hasStar ? pos : null);
      f.light.target.position.copy(f.sl.spot);
      if (!lit && !s.concealed && this._lit(f.sl, p)) lit = true;
    }
    const seenValcourt = this._valcourt(dt, p);
    const searching = huntMessages(this.patrols, hud, 'bodyguards') || huntMessages(this.guards, hud, 'stagehands');
    const seen = seenHands || seenGuard || lit || seenValcourt;
    this.spotted = clamp(this.spotted + (seen ? (dt / (lit ? 0.55 : 0.8)) * d.fill : -dt * 0.5), 0, 1);
    if (this.spotted > 0.01) hud.setMeter(this.spotted, lit ? 'IN THE FOLLOW SPOT! Get up high' : seenValcourt ? 'Valcourt is looking right at you!' : seenGuard ? 'The bodyguard can see you!' : seenHands ? 'A stagehand can see you!' : searching || 'Hidden', seen ? 'var(--red)' : '#ff7a1a');
    else if (searching) hud.setMeter(0, searching, '#ff7a1a');
    else if (this.inBox && !this.hasStar && this.gazeSoon) hud.setMeter(1 - this.gazeSoon / 1.2, 'Valcourt is about to turn round...', 'var(--amber)');
    else hud.setMeter(0, '');
    if (this.spotted >= 1) {
      this._caught('Caught', lit ? 'A follow spot caught you over the stage, and two thousand people saw a burglar. Low over the stage the spots can reach you through the arch: stay high, or move when they\'re away.'
        : seenValcourt ? 'Valcourt turned round to admire his Star and found you instead. Wait until he\'s watching the show again (the meter warns you).'
        : seenGuard ? 'Valcourt\'s bodyguard saw you. He watches the door when he walks towards it: go in behind his back, or knock him out from behind (E).'
        : 'A stagehand got a good look at you. In stage blacks they only notice you close up: keep your distance.');
      return;
    }

    // --- Checkpoints
    if (this.cp === 0 && pos.x > 13.2 && pos.y > GALLERY_Y - 0.5 && pos.y < GALLERY_Y + 2 && pos.z < PROSC_Z) {
      this.cp = 1; audio.sfx('checkpoint', { vol: 0.5 });
      hud.toast('Checkpoint', 'The right gallery. Box 5 is through the little door at the end.', 'var(--cyan)', 3);
    }

    // --- What you can do: take the Star, knock someone out
    let action = null;
    const atStar = !this.hasStar && Math.hypot(pos.x - L.starPos.x, pos.z - L.starPos.z) < 1.5 && Math.abs(pos.y - GALLERY_Y) < 1;
    const ko = !atStar && (this.patrols.takedownTarget(p) || this.guards.takedownTarget(p));
    if (atStar) {
      action = 'Take the Star';
      if (input.wasPressed('interact')) { this._grab(); action = null; }
    } else if (ko) {
      action = 'Knock out';
      if (input.wasPressed('interact')) {
        (this.patrols.units.includes(ko) ? this.patrols : this.guards).takedown(ko);
        action = null;
        audio.sfx('land', { vol: 1 });
        hud.toast('Knocked out', '', 'var(--amber)', 1.5);
      }
    }
    s.setAction(action);

    // --- Out through the roof hatch (with the Star)
    if (this.hasStar) {
      L.hatchGlow.material.opacity = 0.5 + Math.sin(s.time * 4) * 0.25;
      if (Math.hypot(pos.x - L.hatch.x, pos.z - (L.hatch.z + 0.4)) < 1.4 && Math.abs(pos.y - UPPER_Y) < 1.2) { this._finish(); return; }
    }
    this._marker(pos, hud);
    this._stats();
  }

  /** Is this follow spot's beam on you (and nothing in the way, like the wall over the arch)? */
  _lit(sl, p) {
    if (admin.flag('unseen')) return false;
    _c.set(p.pos.x, p.pos.y + Math.min(1.2, p.height * 0.7), p.pos.z);
    _d.copy(sl.spot).sub(sl.lamp);
    const len = _d.length();
    _d.divideScalar(len);
    _v.copy(_c).sub(sl.lamp);
    const along = _v.dot(_d);
    if (along < 0 || along > len + 1) return false;
    const off = _v.addScaledVector(_d, -along).length();
    if (off > RADIUS * 0.85 * (along / len)) return false;
    _v.copy(_c).sub(sl.lamp);
    const dist = _v.length();
    _v.divideScalar(dist);
    return !(this.level.world.raycast(sl.lamp, _v, dist - 0.3) < dist - 0.3);
  }

  /** Valcourt, in Box 5: every few seconds he turns round in his seat to gaze at the Star. Does he see you? */
  _valcourt(dt, p) {
    const L = this.level, b = L.vBody, pos = p.pos;
    const gazeF = Math.atan2(L.starPos.x - b.pos.x, L.starPos.z - b.pos.z);
    this.inBox = pos.z > PROSC_Z + 0.5 && pos.y > GALLERY_Y - 1;
    let want;
    if (this.hasStar) want = Math.atan2(pos.x - b.pos.x, pos.z - b.pos.z); // (on his feet, glaring after you)
    else {
      this.gazeT += dt;
      const k = this.gazeT % GAZE_EVERY, gazeAt = GAZE_EVERY - GAZE_FOR;
      this.gazing = k > gazeAt;
      this.gazeSoon = !this.gazing && k > gazeAt - 1.2 ? gazeAt - k : 0;
      want = this.gazing ? gazeF : SHOW_F;
    }
    const step = 3.2 * dt, dd = angDiff(want, b.facing);
    b.facing += Math.max(-step, Math.min(step, dd));
    b.horizontalSpeed = 0;
    L.valcourt.update(dt, b);
    if (this.hasStar || !this.gazing || s_unseen()) return false;
    // he's turned round: anyone near the table in front of him
    const dx = pos.x - b.pos.x, dz = pos.z - b.pos.z, dist = Math.hypot(dx, dz);
    return dist < 4.8 && Math.abs(pos.y - GALLERY_Y) < 2 && Math.abs(angDiff(Math.atan2(dx, dz), b.facing)) < 0.7;
  }

  _grab() {
    const s = this.state, L = this.level, hud = s.game.hud;
    this.hasStar = true;
    this.cp = 2;
    L.star.visible = L.starGlow.visible = false;
    L.hatchGlow.visible = true;
    L.valcourt.seated = false;
    earn(s.game, CASH, '', { quiet: true });
    audio.sfx('sting', { vol: 0.8 });
    this.guards.setAlert(true);
    this.patrols.setAlert(true);
    this.patrols.alarmAt(s.player.pos);
    for (const f of this.spots) f.sl.alert = true;
    hud.setObjective('Up to the top gallery on the left, and out through the roof hatch');
    hud.toast('Got it!', 'Valcourt leaps up: "THIEF!" Kitsu: "Over the bridges, ride them UP to the top gallery on the left. There\'s a hatch to the roof. Go!"', '#9ad0ff', 5);
  }

  _marker(pos, hud) {
    const s = this.state, L = this.level;
    let t, label, color = 'var(--amber)';
    if (this.hasStar) { t = _v.copy(L.hatch).setY(UPPER_Y + 1.5); label = 'The roof hatch'; color = 'var(--safe)'; }
    else if (this.cp === 0 && pos.y < GALLERY_Y - 0.5) { t = _v.set(-13.2, 3, -6.5); label = 'The ladder'; }
    else if (pos.x < 12.8) { t = _v.set(15.6, GALLERY_Y + 1, 0); label = 'Across the bridges'; }
    else if (!this.inBox) { t = _v.set(15, GALLERY_Y + 1.2, 8); label = 'Box 5'; }
    else { t = _v.copy(L.starPos).setY(GALLERY_Y + 1.2); label = 'The Star'; color = '#9ad0ff'; }
    hud.setMarker(t, s.camera, label, color, Math.hypot(t.x - pos.x, t.z - pos.z));
  }

  _stats() {
    const s = this.state;
    s.game.hud.setStats((this.hasStar ? '<span><b style="color:#9ad0ff">THE STAR</b></span>' : '') +
      `<span>Time <b>${formatTime(s.time)}</b></span><span${this.run.caught ? ' class="warn"' : ''}>Caught <b>${this.run.caught}</b></span>`);
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
    s.setAction?.(null);
    if (s.lighting) s.lighting.dark = 0;
    if (s.model) s.model.setOutfit(null);
    this.guards?.dispose();
    this.patrols?.dispose();
    for (const f of this.spots || []) f.sl.dispose();
  }
}

const s_unseen = () => admin.flag('unseen');

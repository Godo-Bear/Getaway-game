import * as THREE from 'three';
import { buildChapter19Museum, ANCHOR, PEDESTAL_TOP, PLINTHS, PLINTH_TOP, buildStar } from '../../world/levels/chapter19Museum.js';
import { GuardSquad, huntMessages } from '../../ai/guards.js';
import { PlayerModel } from '../../player/playerModel.js';
import { makeGlowMaterial } from '../../world/materials.js';
import { CHAPTERS } from '../../story/chapters.js';
import { getChapterRun } from '../../story/chapterRun.js';
import { finishPart } from '../../story/chapterFlow.js';
import { earn } from '../../gadgets/gadgets.js';
import { admin } from '../../core/admin.js';
import { diff } from '../../core/difficulty.js';
import { formatTime, clamp } from '../../core/utils.js';
import { noteCaught } from '../../core/jail.js';
import { audio } from '../../core/audio.js';

// Chapter 19, Parts 2 and 3: the Grand Musée at night.
//
//  Part 2, THE DOME (part id 'dome'):
//   Over the hall's roof past two guards (the skylights are cover), up the
//   ladder to the terrace round the dome, up the mast, along the gantry to
//   the catwalk round the oculus. Clip on (E) and drop in on a rope:
//     Jump (hold)   let the rope out (down)
//     Crouch (hold) climb back up
//     move          swing (a metre or so each way)
//   Four layers of lasers cross the rotunda: two blink on and off (go
//   through when they're off), two have a gap that slides to and fro (swing
//   into the gap). Touch a beam and the alarm beeps: Kitsu resets it and you
//   go back up to the top. A night guard walks through the rotunda every so
//   often with his torch: when he comes, be up high, in the dark. At the
//   bottom, swap the Star for the glass copy (E).
//
//  Part 3, THE STATUES (part id 'statues'):
//   The winch jammed: out the slow way, down the Hall of Statues to the
//   river door. Guards walk the hall with torches. Hop onto an empty plinth
//   and hold still: you freeze in a statue's pose (you're wearing marble
//   grey) and nobody looks twice. Move, and you're a person again.

const LEN_MIN = 0.6, LEN_MAX = ANCHOR.y - 2.2 - (PEDESTAL_TOP + 0.4);
const DOWN = 2.6, UP = 2.1, SWING = 1.4;
const ROUND = 26, ROUND_IN = 8;      // the night guard's round: every 26 s he spends 8 s in the rotunda
const CASH = 2500;
const BLACK = { hoodie: 0x1a1b22, trousers: 0x1a1b22, gloves: 0x1a1b22, shoes: 0x1a1b22, style: { top: 'tracksuit', bag: true, hat: 'beanie' } };
const MARBLE = { hoodie: 0xd8d4cc, trousers: 0xd8d4cc, gloves: 0xd8d4cc, shoes: 0xd0ccc4, skin: 0xd4d0c8, hair: 0xc8c4bc, mask: 0xd4d0c8, style: { top: 'tracksuit', bag: false, hat: null } };
const MUSEUM_GUARD = { hoodie: 0x2a2c3a, trousers: 0x1c1e28, hat: 0x1c1e28, shirt: 0xe8e8e8, tie: 0x1c1e28, style: { top: 'uniform', hat: 'guard', badge: true } };
const _v = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3();
const body = (pos, facing) => ({ pos: pos.clone(), vel: new THREE.Vector3(), facing, state: 'ground', horizontalSpeed: 0, mantleProgress: 0, stateTime: 0, stumbleTimer: 0, mantle: null, wallRun: null });

export class MuseumMode {
  constructor(state, params) {
    this.state = state;
    this.chapter = CHAPTERS[params.chapterId || 'chapter19'];
    this.partIndex = params.part ?? 1;
    this.part = this.chapter.parts[this.partIndex];
    this.dome = this.part.id === 'dome';
    this.hudSections = ['tl', 'meter', 'controls', 'marker'];
    this.weather = 'clear';
    this.weatherForced = true;
    this.time = 'night';
    this.indoors = true;
  }

  /** On the rope, your walking controls are off (Jump lowers you, Crouch climbs, moving swings you). */
  get inputLocked() { return !!this.rope; }
  get officers() { return this.guards; }
  get fallY() { return -8; }

  build() {
    const L = buildChapter19Museum();
    this.level = L;
    if (this.dome) {
      L.checkpoints = [
        { spawn: L.spawn.clone(), yaw: 0 },                                     // the hall's roof (south end)
        { spawn: new THREE.Vector3(2.2, 14, 13.3), yaw: Math.PI },              // the terrace by the mast
      ];
      // the roof guards
      this.guards = new GuardSquad(L.group, L.world, [
        [[-4.5, 54], [-4.5, 18], [4.5, 18], [4.5, 54]],
        [[4.2, 36], [-4.2, 36]],
      ].map((route) => ({ route })), { sight: diff().guardSight, look: MUSEUM_GUARD, range: 13, alertRange: 17, groundFrom: L.roofY + 1.2 });
      // the night guard who walks through the rotunda, and his torch beam (pointing up)
      this.nightGuard = new PlayerModel(MUSEUM_GUARD, { bag: false, style: MUSEUM_GUARD.style });
      this.nightGuard.pose = body(new THREE.Vector3(2.5, 0, 11), Math.PI);
      L.group.add(this.nightGuard.root);
      this.torch = new THREE.Group();   // (a cone: narrow at the torch, wide at the top)
      const cone = new THREE.Mesh(new THREE.ConeGeometry(4.2, 13, 20, 1, true), makeGlowMaterial(0xfff2c0, 0.12));
      cone.position.y = 6.5 + 1.5;
      cone.rotation.x = Math.PI;
      this.torch.add(cone);
      L.group.add(this.torch);
      // the rope (a thin line from the pulley to your hands), and the copy of the Star you swap in
      this.ropeMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 6), new THREE.MeshStandardMaterial({ color: 0x1a1b20 }));
      this.ropeMesh.visible = false;
      L.group.add(this.ropeMesh);
      this.copyStar = buildStar(1);
      this.copyStar.position.copy(L.star.position);
      this.copyStar.visible = false;
      L.group.add(this.copyStar);
    } else {
      L.checkpoints = [
        { spawn: new THREE.Vector3(0, 0, 3.2), yaw: Math.PI },                  // the rotunda floor, by the Star
        { spawn: new THREE.Vector3(5.2, 0, 34.5), yaw: Math.PI },               // halfway down the hall, behind the plinths
      ];
      this.guards = new GuardSquad(L.group, L.world, [
        [[0, 16], [0, 57]],
        [[-1.5, 56], [-1.5, 19]],
        [[1.5, 28], [1.5, 52]],
      ].map((route) => ({ route })), { sight: diff().guardSight, look: MUSEUM_GUARD, range: 11, alertRange: 15 });
      L.star.visible = true; // (the copy, on its pedestal: nobody will ever know)
      L.lasers.forEach((ls) => { ls.mesh.visible = false; ls.ring.visible = false; });
    }
    L.spawn = L.checkpoints[0].spawn.clone();
    L.spawn.yaw = L.checkpoints[0].yaw;
    return L;
  }

  start(first) {
    const s = this.state;
    this.run = getChapterRun(s.game, this.chapter.id);
    this.done = false;
    this.cp = 0;
    this.alarms = 0;
    s.model.setOutfit(this.dome ? BLACK : MARBLE);
    this._reset();
    const hud = s.game.hud;
    if (first && this.dome) hud.showControls(`<kbd>WASD</kbd> move &nbsp; <kbd>E</kbd> clip on to the rope<br>
      On the rope: hold <kbd>Space</kbd> to go down, hold <kbd>C</kbd> to climb, <kbd>WASD</kbd> to swing &nbsp; <kbd>P</kbd> pause`);
    hud.setPhase(`${this.chapter.title} · Part ${this.partIndex + 1}: ${this.part.title}`);
    hud.setObjective(this.part.objective);
    if (first && !s.game.speedrun) s.showStoryCards(this.part.intro, this.part.startLabel || 'Go');
  }

  _reset() {
    const s = this.state;
    this.spotted = 0;
    this.statueT = 0;
    this.plinth = null;
    this.guards.reset();
    if (this.dome) {
      this._unrope();
      this.swapped = false;
      this.roundT = 4;          // (the night guard's first round comes quite soon)
      this.lasersT = 0;
    }
    s.model.statue = null;
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
  onFall() { this._toCheckpoint('Whoa', 'You fell. Back to the last checkpoint.', 'var(--cyan)'); }

  audioMix() {
    return { wind: this.dome && !this.rope ? 0.35 : 0.05, city: this.dome && !this.rope ? 0.2 : 0, engine: 0, siren: 0, music: 0.5, intensity: 0.35 + this.spotted * 0.6 + (this.rope ? 0.15 : 0) };
  }

  update(dt) {
    if (this.done) return;
    if (this.dome) this._updateDome(dt);
    else this._updateStatues(dt);
  }

  // ================================================================== Part 2: the dome
  _updateDome(dt) {
    const s = this.state, L = this.level, p = s.player, pos = p.pos, hud = s.game.hud, input = s.game.input, d = diff();
    this.lasersT += dt;
    this._animateLasers();
    this._nightRound(dt);

    if (this.rope) { this._updateRope(dt, input, hud); return; }

    // --- On the roofs: the guards
    const seen = this.guards.update(dt, p, s.concealed);
    const searching = huntMessages(this.guards, hud, 'guards');
    this.spotted = clamp(this.spotted + (seen ? (dt / 0.9) * d.fill : -dt * 0.5), 0, 1);
    hud.setMeter(this.spotted, this.spotted > 0.01 ? (seen ? 'SEEN! Get behind a skylight' : searching || 'Hidden') : '', 'var(--red)');
    if (this.spotted >= 1) { this._caught('Caught', 'A guard on the roof saw you. Keep the skylights between you and their torches, and crouch behind them.'); return; }
    // fell off the roof (down to the street)
    if (pos.y < 2 && pos.z < 66) { this._toCheckpoint('Whoa', 'You fell off the roof. Back to the last checkpoint.', 'var(--cyan)'); return; }
    // checkpoint: up on the terrace
    if (this.cp === 0 && pos.y > 13.5) { this.cp = 1; audio.sfx('checkpoint', { vol: 0.5 }); hud.toast('Checkpoint', 'The terrace round the dome. Up the mast, along the gantry.', 'var(--cyan)', 3); }
    // the oculus: clip on
    const atOculus = Math.hypot(pos.x - L.oculus.x, pos.z - L.oculus.z) < 3.2 && pos.y > 22.5; // (on the catwalk, or on the glass right by the hole)
    s.setAction(atOculus ? 'Clip on and drop in' : null);
    if (atOculus && input.wasPressed('interact')) this._clipOn();
    // the marker
    let t, label;
    if (pos.y < 13.5) { t = _v.set(0, L.roofY + 2.5, 14.6); label = 'The ladder up to the dome'; }
    else if (pos.y < 24.4) { t = _v.set(0, 25.5, 12.2); label = 'Up the mast'; }
    else { t = _v.set(0, 25.6, 0); label = 'The oculus'; }
    hud.setMarker(t, s.camera, label, 'var(--amber)', Math.hypot(t.x - pos.x, t.z - pos.z));
    this._stats();
  }

  _clipOn() {
    const s = this.state, hud = s.game.hud;
    this.rope = { len: LEN_MIN, dx: 0, dz: 0 };
    s.model.flying = 'rope';
    this.camD ??= s.cam.distance;
    s.cam.distance = Math.max(this.camD, 6.5); // (pulled back a bit: you can see the layers of lasers below)
    this.ropeMesh.visible = true;
    s.setAction(null);
    s.cam.pitch = -0.95; // (looking down past you at the lasers and the Star)
    audio.sfx('clang', { vol: 0.5 });
    hud.setObjective('Down through the lasers to the Star');
    hud.toast('Clipped on', 'Hold Jump to let the rope out, hold Crouch to climb, move to swing. Don\'t touch a beam!', 'var(--cyan)', 5);
  }

  _unrope() {
    const s = this.state;
    this.rope = null;
    if (s.model) s.model.flying = null;
    if (this.camD != null && s.cam) { s.cam.distance = this.camD; this.camD = null; }
    if (s.cam) s.cam.noCollide = false;
    if (this.ropeMesh) this.ropeMesh.visible = false;
  }

  _updateRope(dt, input, hud) {
    const s = this.state, L = this.level, p = s.player, r = this.rope;
    // up and down
    if (!this.swapped) {
      if (input.isDown('jump')) r.len = Math.min(LEN_MAX, r.len + DOWN * dt);
      if (input.isDown('crouch')) r.len = Math.max(LEN_MIN, r.len - UP * dt);
    } else r.len = Math.max(LEN_MIN, r.len - 4 * dt); // (the winch pulls you up)
    // swing (camera-relative)
    s.cam.getForward(_f); s.cam.getRight(_r);
    const ax = input.axis('left', 'right'), ay = input.axis('back', 'forward');
    let tx = (_r.x * ax + _f.x * ay) * SWING, tz = (_r.z * ax + _f.z * ay) * SWING;
    const k = Math.min(1, dt * 3);
    r.dx += (tx - r.dx) * k; r.dz += (tz - r.dz) * k;
    // place yourself on the end of the rope
    const feet = ANCHOR.y - r.len - 2.2;
    p.teleport(ANCHOR.x + r.dx, feet, ANCHOR.z + r.dz, p.facing);
    // (inside the rotunda the camera can't hit anything: its dome is solid only from
    // the outside. Up by the oculus it can: the gantry and the catwalk are real)
    s.cam.noCollide = feet < 19;
    const handY = feet + 2.15;
    this.ropeMesh.position.set((ANCHOR.x + p.pos.x) / 2, (ANCHOR.y + handY) / 2, (ANCHOR.z + p.pos.z) / 2);
    this.ropeMesh.scale.y = Math.max(0.01, ANCHOR.y - handY);
    this.ropeMesh.lookAt(ANCHOR);
    this.ropeMesh.rotateX(Math.PI / 2);

    // the lasers
    if (!this.swapped && !admin.flag('god')) {
      for (const ly of L.lasers) {
        if (ly.y < feet + 0.05 || ly.y > feet + 2.1) continue;
        if (this._beamAt(ly, p.pos.x, p.pos.z)) { this._alarm(); return; }
      }
    }
    // the night guard's torch: low down in the rotunda while he's there = seen
    const lit = this.roundIn && feet < 12.5 && !this.swapped;
    this.spotted = clamp(this.spotted + (lit ? dt / 0.8 * diff().fill : -dt * 0.5), 0, 1);
    if (this.spotted > 0.01) hud.setMeter(this.spotted, 'IN THE GUARD\'S TORCH! Climb up (C)', 'var(--red)');
    else if (this.roundSoon) hud.setMeter(1 - this.roundSoon / 5, 'Guard coming! Climb up into the dark', 'var(--amber)');
    else hud.setMeter(0, '');
    if (this.spotted >= 1) { this._unrope(); this._caught('Spotted', 'The night guard\'s torch found you on the rope. When Kitsu warns you he\'s coming, climb up high (above the second layer of lasers) until he\'s gone.'); return; }

    // the bottom: swap the Star
    const atStar = r.len > LEN_MAX - 0.3 && Math.hypot(r.dx, r.dz) < 0.7 && !this.swapped;
    s.setAction(atStar ? 'Swap the Star' : null);
    if (atStar && input.wasPressed('interact')) this._swap();
    if (this.swapped && (this.swapT += dt) > 1.6) { this._finish(); return; }

    // the marker: straight down to the Star
    if (!this.swapped) hud.setMarker(_v.set(0, PEDESTAL_TOP + 1, 0), s.camera, 'The Star of Lumière', '#9ad0ff', Math.max(0, feet - PEDESTAL_TOP));
    this._stats();
  }

  /** Is there a beam at (x, z) in this layer right now? */
  _beamAt(ly, x, z) {
    const t = this.lasersT;
    if (ly.kind === 'blink') return ((t + ly.phase) % (ly.on + ly.off)) < ly.on;
    const g = Math.sin(t * ly.speed + (ly.phase || 0)) * ly.amp;
    return ly.kind === 'sweepX' ? Math.abs(x - g) > ly.gap : Math.abs(z - g) > ly.gap;
  }

  _animateLasers() {
    const t = this.lasersT, o = new THREE.Object3D();
    for (const ly of this.level.lasers) {
      let n = 0;
      if (ly.kind === 'blink') {
        const on = this._beamAt(ly, 0, 0);
        ly.mesh.material.opacity = on ? 0.9 : 0.08;
        for (const along of ['x', 'z']) {
          for (let k = -4; k <= 4; k++) {
            const c = k * 2.4, len = 2 * Math.sqrt(Math.max(0, 144 - c * c));
            o.position.set(along === 'x' ? 0 : c, ly.y, along === 'x' ? c : 0);
            o.rotation.set(0, along === 'x' ? 0 : Math.PI / 2, 0);
            o.scale.set(len, 1, 1);
            o.updateMatrix();
            ly.mesh.setMatrixAt(n++, o.matrix);
          }
        }
      } else {
        const g = Math.sin(t * ly.speed + (ly.phase || 0)) * ly.amp;
        for (let k = 0; k < ly.n; k++) {
          const c = -11.75 + k * 0.5;
          const show = Math.abs(c - g) > ly.gap;
          const len = 2 * Math.sqrt(Math.max(0, 144 - c * c));
          o.position.set(ly.kind === 'sweepX' ? c : 0, ly.y, ly.kind === 'sweepX' ? 0 : c);
          o.rotation.set(0, ly.kind === 'sweepX' ? Math.PI / 2 : 0, 0);
          o.scale.set(show ? len : 0.0001, 1, 1);
          o.updateMatrix();
          ly.mesh.setMatrixAt(n++, o.matrix);
        }
      }
      ly.mesh.count = n;
      ly.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  _alarm() {
    const s = this.state;
    this.alarms++;
    this.rope.len = LEN_MIN;
    this.rope.dx = this.rope.dz = 0;
    audio.sfx('alarm', { vol: 0.5, rate: 1.4 });
    s.flash('Beep!', 'You touched a beam. Kitsu killed the alarm just in time and winched you back up. Blinking layers: go through when they\'re off. Sliding layers: swing into the gap.', 'var(--amber)');
  }

  /** The night guard's round: every so often he walks through the rotunda with his torch pointing up. */
  _nightRound(dt) {
    const g = this.nightGuard, hud = this.state.game.hud;
    this.roundT += dt;
    const t = this.roundT % ROUND, inT = t - (ROUND - ROUND_IN);
    this.roundIn = inT > 0;
    this.roundSoon = !this.roundIn && inT > -5 ? -inT : 0;
    if (this.roundSoon && !this.warned && this.rope) { this.warned = true; hud.toast('Guard coming!', 'Kitsu: "Night guard, coming through in five seconds. Get up high, in the dark, and stay still."', 'var(--amber)', 4); }
    if (!this.roundIn) { this.warned = this.roundSoon ? this.warned : false; g.root.visible = false; this.torch.visible = false; return; }
    // in from the arch, round the pedestal, and back out
    const k = inT / ROUND_IN, z = 11 - Math.sin(k * Math.PI) * 18, x = 2.6 * Math.cos(k * Math.PI);
    g.root.visible = this.torch.visible = true;
    g.pose.pos.set(x, 0, z);
    g.pose.facing = k < 0.5 ? Math.PI : 0;
    g.pose.horizontalSpeed = 1.6;
    g.pose.vel.set(0, 0, k < 0.5 ? -2 : 2);
    g.update(dt, g.pose);
    this.torch.position.set(x, 0, z);
  }

  _swap() {
    const s = this.state, L = this.level, hud = s.game.hud;
    this.swapped = true;
    this.swapT = 0;
    L.star.visible = false;
    this.copyStar.visible = true;
    earn(s.game, CASH, '', { quiet: true });
    audio.sfx('cash', { vol: 0.8 });
    s.setAction(null);
    hud.toast('Swapped!', 'The real Star goes in your pocket, the glass one onto the velvet. Nobody will ever know.', '#9ad0ff', 4);
  }

  // ================================================================== Part 3: the Hall of Statues
  _updateStatues(dt) {
    const s = this.state, L = this.level, p = s.player, pos = p.pos, hud = s.game.hud, d = diff();
    // on an empty plinth, holding still: a statue
    const pl = PLINTHS.find((P) => !P.statue && Math.abs(pos.x - P.x) < 0.75 && Math.abs(pos.z - P.z) < 0.75 && Math.abs(pos.y - PLINTH_TOP) < 0.2);
    if (pl !== this.plinth) { this.plinth = pl; this.statueT = 0; this.statuePose = Math.floor(Math.random() * 4); }
    const still = pl && p.grounded && p.horizontalSpeed < 0.35;
    this.statueT = still ? this.statueT + dt : 0;
    const statue = this.statueT > 0.2;
    s.model.statue = statue ? this.statuePose : null;
    if (statue && !this.toldStatue) { this.toldStatue = true; hud.toast('A statue', 'Frozen on a plinth in marble grey, you\'re just another statue. Don\'t move while a torch is on you!', 'var(--cyan)', 4); }

    const seen = this.guards.update(dt, p, statue || s.concealed);
    const searching = huntMessages(this.guards, hud, 'guards');
    this.spotted = clamp(this.spotted + (seen ? (dt / 0.8) * d.fill : -dt * 0.5), 0, 1);
    hud.setMeter(this.spotted > 0.01 ? this.spotted : statue ? 1 : 0, this.spotted > 0.01 ? (seen ? 'SEEN! Freeze on a plinth!' : searching || 'Hidden') : statue ? 'A statue: hold still' : '', this.spotted > 0.01 ? 'var(--red)' : '#d8d4cc');
    if (this.spotted >= 1) { this._caught('Caught', 'A guard saw you move. Hop onto an empty plinth and hold still when their torches turn your way: you\'re a statue.'); return; }

    if (this.cp === 0 && pos.z > 34) { this.cp = 1; audio.sfx('checkpoint', { vol: 0.5 }); }
    // out of the river door, onto Paz's boat
    L.boatBeam.material.opacity = 0.12 + Math.sin(s.time * 3) * 0.04;
    if (Math.hypot(pos.x - L.goal.x, pos.z - L.goal.z) < 2.3) { this._finish(); return; }
    const t = pos.z < 59 ? _v.set(0, 2.2, 60) : _v.copy(L.goal).setY(1.5);
    hud.setMarker(t, s.camera, pos.z < 59 ? 'The river door' : 'Paz\'s boat', 'var(--safe)', Math.hypot(t.x - pos.x, t.z - pos.z));
    this._stats();
  }

  _stats() {
    const s = this.state;
    s.game.hud.setStats((this.dome ? `<span>Alarms <b>${this.alarms}</b></span>` : '') +
      `<span>Time <b>${formatTime(s.time)}</b></span><span${this.run.caught ? ' class="warn"' : ''}>Caught <b>${this.run.caught}</b></span>`);
  }

  _finish() {
    if (this.done) return;
    this.done = true;
    const s = this.state;
    s.setAction(null);
    this._unrope?.();
    s.model.statue = null;
    s.game.hud.setMeter(0, '');
    audio.sfx('win');
    finishPart(s, this);
  }

  adminSkip() { this._finish(); }

  teardown() {
    const s = this.state;
    s.setAction?.(null);
    if (s.model) { s.model.flying = null; s.model.statue = null; s.model.setOutfit(null); }
    this.guards?.dispose();
  }
}

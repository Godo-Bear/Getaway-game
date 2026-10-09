import * as THREE from 'three';
import { buildChapter22Rail, trackAt, railGround, LINE_END, TUNNEL, BRIDGE, LOW } from '../../world/levels/chapter22Rail.js';
import { makeDirtBikeMesh } from '../../vehicles/carModel.js';
import { PlayerModel } from '../../player/playerModel.js';
import { crewLook, JACKAL_LOOK } from '../../player/people.js';
import { currentLook } from '../../player/outfits.js';
import { CHAPTERS } from '../../story/chapters.js';
import { getChapterRun } from '../../story/chapterRun.js';
import { finishPart } from '../../story/chapterFlow.js';
import { admin } from '../../core/admin.js';
import { diff } from '../../core/difficulty.js';
import { formatTime, clamp, damp, dampAngle } from '../../core/utils.js';
import { audio } from '../../core/audio.js';

// Chapter 22, Part 4: THE HANDCAR (part id 'handcar').
//
// Out of Dry Gulch down the old railway on a handcar, you on one end of the
// see-saw pump handle and Theo on the other, to Ricky's van at the level
// crossing on Highway 9.
//   - PUMP: press Left and Right in turn (A then D then A...: on a phone,
//     the two Pump buttons, or swipe the stick from side to side). Each
//     stroke pushes you on; a steady rhythm is fastest. Mashing, or the same
//     side twice, doesn't work.
//   - DUCK (C, or the Duck button) under the water-tower spouts and the
//     bridge's low beams, or you bang your head and stop dead.
//   - The Jackals ride up alongside on dirt bikes and kick at the handcar:
//     PUNCH them off (E or click, or the action button) when they're close.
//     They can't follow you through the tunnel or over the bridge.
//   - Let them kick you too often and they stop the handcar.

const VMAX = 15;              // m/s, pumping flat out
const STROKE = 1.75;          // m/s a good stroke adds (less near top speed)
const FRICTION = 0.32, DRAG = 0.011;
const RHYTHM = 0.2;           // s: strokes closer together than this are mashing
const KICK_EVERY = 1.9;       // s alongside before a Jackal kicks
const KICK = 0.24;            // how much of the Jackals meter a kick fills
const REACH = 3.2;            // m: how close a biker must be to punch
const CHECKPOINTS = [{ s: 0, name: 'Dry Gulch station' }, { s: 495, name: 'The mesa' }, { s: 955, name: 'Over the bridge' }];
const WAVES = [{ at: 35, n: 2 }, { at: 290, n: 2 }, { at: 630, n: 3 }, { at: 975, n: 2 }, { at: 1110, n: 2 }];
const BLOCKED = [[TUNNEL.s0 - 6, TUNNEL.s1 + 4], [BRIDGE.s0 - 8, BRIDGE.s1 + 6]];
const _v = new THREE.Vector3();
const pose = (x, y, z, facing) => ({ pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(), facing, state: 'ground', horizontalSpeed: 0, mantleProgress: 0, stateTime: 0, stumbleTimer: 0, mantle: null, wallRun: null });

export class HandcarMode {
  constructor(state, params) {
    this.state = state;
    this.chapter = CHAPTERS[params.chapterId || 'chapter22'];
    this.partIndex = params.part ?? 3;
    this.part = this.chapter.parts[this.partIndex];
    this.hudSections = ['tl', 'meter', 'controls', 'marker'];
    this.weather = 'clear';
    this.weatherForced = true;
    this.time = this.part.time || 'dusk';
    this.indoors = true;
  }

  get touchMode() { return 'driving'; }
  get inputLocked() { return true; }
  get fallY() { return -60; }

  build() {
    const L = buildChapter22Rail();
    this.level = L;
    this.car = L.handcar;
    L.group.add(this.car);
    // you at the back end of the handle, Theo at the front
    this.me = new PlayerModel();
    this.me.setLook(currentLook(this.state.game.settings));
    this.mePose = pose(0, 0.8, -1.45, 0);
    this.theo = new PlayerModel(crewLook('theo'), { bag: false });
    this.theoPose = pose(0, 0.8, 1.45, Math.PI);
    this.car.add(this.me.root, this.theo.root);
    // the Jackals' dirt bikes
    this.bikes = [];
    for (let i = 0; i < 4; i++) {
      const mesh = makeDirtBikeMesh({ color: i % 2 ? 0xc8202a : 0x1e1f24 });
      mesh.userData.rider?.setLook?.(JACKAL_LOOK);
      mesh.visible = false;
      L.group.add(mesh);
      this.bikes.push({ mesh, state: 'off', s: 0, side: 1, t: 0, v: 0 });
    }
    return L;
  }

  _setupCamera() {
    const s = this.state;
    this.wasFirstPerson = s.cam.firstPerson;
    if (this.wasFirstPerson) s.setFirstPerson(false);
    s.model.root.visible = false;
    this.camDist = s.cam.distance;
    s.cam.distance = 7.5;
    s.cam.groundFn = railGround;
    const t = s.game.touch;
    t?.setLabel?.('a', 'Pump ▶'); // (the Drift button sits on the right, Nitro to its left)
    t?.setLabel?.('b', 'Pump ◀');
    t?.setLabel?.('d', 'Duck');
    this._camSet = true;
  }

  start(first) {
    const s = this.state;
    if (!this._camSet) this._setupCamera();
    this.run = getChapterRun(s.game, this.chapter.id);
    this.done = false;
    this.cp = 0;
    this.told = {};
    this.downed = 0;
    this._placeAt(0);
    const hud = s.game.hud;
    if (first) hud.showControls(`<kbd>A</kbd> then <kbd>D</kbd> then <kbd>A</kbd>... pump in a steady rhythm &nbsp; <kbd>C</kbd> duck<br>
      <kbd>E</kbd> or click: punch the Jackals off their bikes &nbsp; <kbd>R</kbd> checkpoint &nbsp; <kbd>P</kbd> pause`);
    hud.setPhase(`${this.chapter.title} · Part ${this.partIndex + 1}: ${this.part.title}`);
    hud.setObjective(this.part.objective);
    if (first && !s.game.speedrun) s.showStoryCards(this.part.intro, this.part.startLabel || 'Go');
  }

  _placeAt(cp) {
    const s = this.state;
    this.s = CHECKPOINTS[cp].s;
    this.v = 0;
    this.jackals = 0;
    this.lastStroke = 0;
    this.lastStrokeT = -9;
    this.pump = 0;
    this.pumpWant = 0;
    this.t = 0;
    this.mash = 0;
    this.bonked = new Set();
    this.prevSide = 0;
    for (const b of this.bikes) { b.state = 'off'; b.mesh.visible = false; }
    this.waves = new Set(WAVES.filter((w) => w.at < this.s).map((w) => w.at)); // (the ones behind you have been and gone)
    this._placeCar();
    s.cam.yaw = this.heading + Math.PI;
    s.cam.pitch = -0.2;
  }

  _placeCar() {
    const P = trackAt(this.s);
    this.heading = P.heading;
    this.car.position.set(P.x, 0, P.z);
    this.car.rotation.y = P.heading;
  }

  _fail(title, msg) {
    if (admin.flag('god')) { this.jackals = 0; return; }
    this.run.caught++;
    audio.sfx('caught');
    this._placeAt(this.cp);
    this.state.flash(title, msg, 'var(--red)');
  }

  onRespawnKey() {
    this._placeAt(this.cp);
    this.state.flash('Checkpoint', 'Back to the last checkpoint.', 'var(--cyan)');
  }

  audioMix() {
    return { engine: 0, siren: 0, wind: 0.2 + (this.v / VMAX) * 0.35, city: 0, music: 0.55, intensity: 0.5 + this.jackals * 0.4 };
  }

  _tell(key, title, text, color = 'var(--amber)', t = 4) {
    if (this.told[key]) return;
    this.told[key] = true;
    this.state.game.hud.toast(title, text, color, t);
  }

  update(dt) {
    if (this.done) return;
    const s = this.state, input = s.game.input, hud = s.game.hud;
    this.t += dt;

    // --- Pumping: Left and Right in turn (keys, the Pump buttons, or the stick side to side)
    const ax = input.axis('left', 'right');
    const side = ax < -0.5 ? -1 : ax > 0.5 ? 1 : 0;
    let stroke = 0;
    if (input.wasPressed('drift')) stroke = 1;
    else if (input.wasPressed('nitro')) stroke = -1;
    else if (side && side !== this.prevSide) stroke = side;
    this.prevSide = side;
    if (stroke) {
      const gap = this.t - this.lastStrokeT;
      if (stroke === this.lastStroke) {
        this._tell('same', 'Left, then right', 'Theo: "Other side! Left, right, left, right!"', 'var(--amber)', 2.5);
      } else {
        let push = STROKE * (1 - clamp(this.v / VMAX, 0, 1) * 0.85);
        if (gap < RHYTHM) { push *= 0.3; this.mash += 1; if (this.mash > 6) this._tell('mash', 'In rhythm!', 'Theo: "Not so fast! Nice and steady: we push together!"', 'var(--amber)', 2.5); }
        else this.mash = Math.max(0, this.mash - 2);
        this.v += push;
        this.lastStroke = stroke;
        this.lastStrokeT = this.t;
        this.pumpWant = stroke * 0.38;
        audio.sfx('step', { vol: 0.45, rate: 0.55 });
      }
    }
    this.v = Math.max(0, this.v - (FRICTION + DRAG * this.v * this.v) * dt);
    if (this.v < 0.15 && !stroke) this.v = 0;
    this.s += this.v * dt;
    this._placeCar();
    const ducking = input.isDown('crouch') || input.isDown('horn');

    // --- The handcar, the pump, you and Theo
    this.pump = damp(this.pump, this.pumpWant, 9, dt);
    this.car.userData.pump.rotation.x = this.pump;
    for (const w of this.car.userData.wheels) w.rotation.x -= this.v * dt / 0.36;
    const bob = Math.sin(this.pump) * 0.32;
    this.mePose.pos.y = 0.8 + (ducking ? -0.05 : -bob * 0.5);
    this.theoPose.pos.y = 0.8 + (ducking ? -0.05 : bob * 0.5);
    this.mePose.state = this.theoPose.state = ducking ? 'crouch' : 'ground';
    this.me.update(dt, this.mePose);
    this.theo.update(dt, this.theoPose);
    const P = this.car.position;
    s.player.teleport(P.x, 0.85, P.z, this.heading);
    s.cam.yaw = dampAngle(s.cam.yaw, this.heading + Math.PI, 2.5, dt);

    // --- Things over the track: duck!
    let duckWarn = null;
    for (const lo of LOW) {
      const ahead = lo.s - this.s;
      if (ahead > -1 && ahead < 28) duckWarn = [clamp(1 - ahead / 28, 0, 1), ducking ? 'Ducking: keep holding C' : lo.kind === 'spout' ? 'WATER SPOUT! Hold C (or Duck) to duck' : 'LOW BEAM! Hold C (or Duck) to duck', ducking ? 'var(--safe)' : 'var(--amber)'];
      if (Math.abs(ahead) < 0.9 && !ducking && this.v > 0.5 && !this.bonked.has(lo) && !admin.flag('god')) {
        this.bonked.add(lo);
        this.v *= 0.15;
        this.jackals = Math.min(0.95, this.jackals + 0.1);
        audio.sfx('clang', { vol: 1, rate: 0.7 });
        s.cam.addLandingDip?.(6);
        hud.toast('BONK!', lo.kind === 'spout' ? 'Right into the water spout. Hold C (or the Duck button) to duck under them.' : 'Right into the beam. Hold C (or the Duck button) to duck under them.', 'var(--red)', 3);
      }
      if (ahead < -20) this.bonked.delete(lo);
    }
    if (this.s > TUNNEL.s0 - 60 && this.s < TUNNEL.s0) this._tell('tunnel', 'The tunnel', 'Theo: "In there! Their bikes can\'t follow us through the mesa!"', 'var(--safe)', 3);
    if (this.s > BRIDGE.s0 - 70 && this.s < BRIDGE.s0) this._tell('bridge', 'The bridge', 'Theo: "Low beams on the bridge! Heads down!"', 'var(--amber)', 3);
    const flick = 0.85 + Math.sin(this.t * 11) * 0.1;
    for (const l of this.level.lamps) l.intensity = 10 * flick;

    // --- The Jackals
    this._bikes(dt, input, hud);
    this.jackals = Math.max(0, this.jackals - dt * 0.025);
    if (this.jackals >= 1) {
      this._fail('Stopped', 'The Jackals kicked the handcar until it jumped the rails. Punch them off (E, or click) as soon as they ride up beside you.');
      return;
    }
    if (this.jackals > 0.04) hud.setMeter(this.jackals, 'JACKALS! Punch them off (E)', 'var(--red)');
    else if (duckWarn) hud.setMeter(...duckWarn);
    else hud.setMeter(this.v / VMAX, this.v < 2 ? 'Pump! A, then D, then A...' : 'Speed', 'var(--cyan)');

    // --- Checkpoints, the crossing
    for (let i = this.cp + 1; i < CHECKPOINTS.length; i++) {
      if (this.s > CHECKPOINTS[i].s) { this.cp = i; audio.sfx('checkpoint', { vol: 0.5 }); hud.toast('Checkpoint', CHECKPOINTS[i].name, 'var(--cyan)', 2.5); }
    }
    const L = this.level, on = Math.floor(this.t * 2.5) % 2 === 0;
    L.flashers[0].visible = on; L.flashers[1].visible = !on;
    L.ring.rotation.z += dt;
    if (this.s >= LINE_END - 1.5) { this._finish(); return; }
    const end = trackAt(LINE_END);
    hud.setMarker(_v.set(end.x, 2, end.z), s.camera, 'Ricky\'s van', 'var(--safe)', LINE_END - this.s);
    hud.setStats(`<span>Speed <b>${Math.round(this.v * 3.6)} km/h</b></span><span>Crossing <b>${Math.round(Math.max(0, LINE_END - this.s))} m</b></span>` +
      `<span>Jackals down <b>${this.downed}</b></span><span>Time <b>${formatTime(s.time)}</b></span><span${this.run.caught ? ' class="warn"' : ''}>Stopped <b>${this.run.caught}</b></span>`);
  }

  /** The bikers: they come up from behind, ride alongside and kick; punch them off. */
  _bikes(dt, input, hud) {
    const s = this.state;
    // new waves
    for (const w of WAVES) {
      if (this.waves.has(w.at) || this.s < w.at) continue;
      this.waves.add(w.at);
      let n = 0;
      for (const b of this.bikes) {
        if (b.state !== 'off' || n >= w.n) continue;
        b.state = 'ride';
        b.side = n % 2 ? -1 : 1;
        b.s = this.s - 34 - n * 9;
        b.v = this.v + 6;
        b.t = 0;
        b.lean = 0;
        b.mesh.visible = true;
        b.mesh.userData.rider && (b.mesh.userData.rider.root.rotation.z = 0);
        n++;
      }
      if (n) hud.toast('Jackals!', 'Theo: "Bikes behind us! Here they come!"', 'var(--red)', 3);
    }
    const punch = input.wasPressed('punch') || input.wasPressed('interact');
    let target = null, best = REACH;
    for (const b of this.bikes) {
      if (b.state === 'ride') {
        const gap = this.s + 0.4 - b.s; // (how far behind your end of the handle it is)
        b.v = damp(b.v, clamp(this.v + gap * 1.6, 0, 24) * (diff().fugitive || 1), 3, dt);
        b.s += b.v * dt;
        // the tunnel and the bridge: they can't follow
        const z = BLOCKED.find(([a, c]) => b.s > a && b.s < c);
        if (z) { b.s = z[0]; b.state = 'stopped'; b.v = 0; continue; }
        const d = Math.abs(b.s - this.s);
        if (d < best) { best = d; target = b; }
        if (d < 2.2) {
          b.t += dt;
          if (b.t > KICK_EVERY) {
            b.t = 0;
            this.v *= 0.55;
            this.jackals = Math.min(1, this.jackals + KICK * (diff().bust || 1));
            audio.sfx('crash', { vol: 0.6 });
            s.cam.addLandingDip?.(4);
            this._tell('kick', 'Kicked!', 'A Jackal kicks the handcar and it lurches. Theo: "Hit him! E!"', 'var(--red)', 2.5);
          }
        } else b.t = Math.max(0, b.t - dt);
      } else if (b.state === 'down') {
        // over and over in the sand
        b.v = Math.max(0, b.v - dt * 14);
        b.s += b.v * dt;
        b.lean = Math.min(1.45, b.lean + dt * 4);
        b.drift += dt * 3 * Math.max(0, b.v / 10);
      }
      if (b.state === 'off') continue;
      // where it is: beside the track
      const P = trackAt(b.s), off = b.side * (3.1 + (b.drift || 0));
      b.mesh.position.set(P.x - Math.cos(P.heading) * off, railGround(P.x, P.z), P.z + Math.sin(P.heading) * off);
      b.mesh.rotation.set(0, P.heading, 0);
      if (b.mesh.userData.lean) b.mesh.userData.lean.rotation.z = b.state === 'down' ? -b.side * b.lean : Math.sin(this.t * 3 + b.side) * 0.05;
      for (const w of b.mesh.userData.wheels || []) w.rotation.x += b.v * dt / 0.36;
      if (b.s < this.s - 120 || (b.state === 'stopped' && b.s < this.s - 40)) { b.state = 'off'; b.mesh.visible = false; }
    }
    s.setAction(target ? 'Punch' : null);
    if (punch) {
      this.me.punch(Math.random() < 0.5 ? 'jab' : 'cross');
      if (target) {
        target.state = 'down';
        target.lean = 0;
        target.drift = 0;
        target.v = Math.max(target.v, this.v);
        this.downed++;
        this.jackals = Math.max(0, this.jackals - 0.1);
        audio.sfx('crash', { vol: 0.8 });
        hud.toast('Off he goes!', ['Theo: "Ha! Nice one!"', 'Theo: "Bye!"', 'Theo: "And stay down!"'][this.downed % 3], 'var(--safe)', 1.6);
      }
    }
  }

  _finish() {
    if (this.done) return;
    this.done = true;
    const s = this.state;
    s.game.hud.setMeter(0, '');
    s.setAction(null);
    audio.sfx('win');
    finishPart(s, this);
  }

  adminSkip() { this._finish(); }

  teardown() {
    const s = this.state;
    if (s.model) s.model.root.visible = !s.cam?.firstPerson;
    if (s.cam) { s.cam.groundFn = null; if (this.camDist) s.cam.distance = this.camDist; }
    if (this.wasFirstPerson) s.setFirstPerson?.(true);
    const t = s.game.touch;
    for (const k of ['a', 'b', 'd']) t?.setLabel?.(k, null);
  }
}

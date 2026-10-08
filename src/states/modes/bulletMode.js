import * as THREE from 'three';
import { buildChapter16Train, buildScenery, carZ } from '../../world/levels/chapter16Train.js';
import { GuardSquad, huntMessages } from '../../ai/guards.js';
import { PlayerModel } from '../../player/playerModel.js';
import { randomPerson, POLICE_LOOK } from '../../player/people.js';
import { CHAPTERS } from '../../story/chapters.js';
import { getChapterRun } from '../../story/chapterRun.js';
import { finishPart } from '../../story/chapterFlow.js';
import { earn } from '../../gadgets/gadgets.js';
import { admin } from '../../core/admin.js';
import { diff } from '../../core/difficulty.js';
import { formatTime, clamp, makeRng } from '../../core/utils.js';
import { noteCaught } from '../../core/jail.js';
import { audio } from '../../core/audio.js';

// Chapter 16, Part 2: aboard the Silver Arrow at 300 km/h.
//
//  You board at the back (the luggage car) and work forward to first class,
//  where a courier sits with a silver case on the rack above him.
//  SIT DOWN: press E by an empty aisle seat and you're just another
//  passenger: the railway police and the conductor walk right past you.
//  THE TUNNELS: every 20-odd seconds the train dives into a tunnel and the
//  carriages go dark for a few seconds. That's the only time you can swap
//  the courier's case for Kitsu's copy without him seeing.
//  THE GETAWAY: a little later he opens it (and finds comics). Run back to
//  the luggage car and pull the coupling release: Kitsu uncouples your
//  carriage and the rest of the train rushes off without you.

const SPEED = 83;                 // m/s (300 km/h)
const OPEN = 21, TUNNEL = 6.5;    // seconds in the open, then in a tunnel
const DISCOVER = 26;              // seconds after the swap before he opens the case
const CASH = 900;
const BODYGUARD = { hoodie: 0x1a1b20, trousers: 0x1a1b20, gloves: 0x1a1b20, shirt: 0xe8e8e8, tie: 0x1a1b20, style: { top: 'suit', face: 'shades', hair: 'buzz' } };
const COURIER = { hoodie: 0x8a8f9c, trousers: 0x3a3d45, shirt: 0xe8e8e8, tie: 0x7a1f2e, skin: 0xe0b090, hair: 0x1a1410, style: { top: 'suit', face: 'aviators', hair: 'slick' } };
const RAIL_POLICE = { ...POLICE_LOOK, hoodie: 0x24324a, style: { ...POLICE_LOOK.style, top: 'uniform', hat: 'police', badge: true } };
const body = (x, y, z, facing) => ({ pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(), facing, state: 'ground', horizontalSpeed: 0, mantleProgress: 0, stateTime: 0, stumbleTimer: 0, mantle: null, wallRun: null });
const _v = new THREE.Vector3();

export class BulletMode {
  constructor(state, params) {
    this.state = state;
    this.chapter = CHAPTERS[params.chapterId || 'chapter16'];
    this.partIndex = params.part ?? 1;
    this.part = this.chapter.parts[this.partIndex];
    this.hudSections = ['tl', 'meter', 'controls', 'marker'];
    this.weather = 'clear';
    this.weatherForced = true;  // (no rain inside the train)
    this.time = 'night';
    this.indoors = true;
  }

  /** Sitting in a seat: you can't walk about (press E, or push the stick, to stand up). */
  get inputLocked() { return !!this.seat; }
  get officers() { return this.police; }
  get fallY() { return -5; }

  build() {
    const L = buildChapter16Train();
    L.spawn = L.checkpoints[0].spawn.clone();
    L.spawn.yaw = L.checkpoints[0].yaw;
    this.level = L;
    this.scenery = buildScenery();
    L.group.add(this.scenery.group);
    const rng = makeRng(16);
    // the passengers (seated, still: drawn once), the bartender
    this.people = L.passengers.map((p) => {
      const look = randomPerson(rng);
      if (p.rich) look.style.top = 'suit';
      if (p.staff) { look.hoodie = 0xe8e8e8; look.style.top = 'vest'; look.style.hat = null; }
      const m = new PlayerModel(look, { bag: false, style: look.style });
      m.seated = !p.stand;
      m.pose = body(p.x, 0, p.z, p.face);
      m.update(0, m.pose);
      (p.z < carZ(0).z0 ? L.front : L.rear).add(m.root);
      return m;
    });
    // the courier, under his case
    this.courier = new PlayerModel(COURIER, { bag: false });
    this.courier.seated = true;
    this.courier.pose = body(L.courier.x, 0, L.courier.z, Math.PI);
    this.courier.update(0, this.courier.pose);
    L.front.add(this.courier.root);
    // railway police and the conductor; the courier's two bodyguards
    this.police = new GuardSquad(L.front, L.world, L.guardRoutes.slice(0, 3).map((route) => ({ route })), { sight: diff().guardSight, look: RAIL_POLICE, range: 9, alertRange: 13 });
    this.guards = new GuardSquad(L.front, L.world, L.guardRoutes.slice(3).map((route) => ({ route })), { sight: diff().guardSight, look: BODYGUARD, range: 8, alertRange: 12 });
    // the case in your hand, after the swap
    this.handCase = L.caseMesh.clone();
    this.handCase.rotation.set(0, Math.PI / 2, 0);
    this.handCase.position.set(0.02, -0.5, 0.05);
    return L;
  }

  start(first) {
    const s = this.state;
    this.run = getChapterRun(s.game, this.chapter.id);
    this.done = false;
    this.cp = 0;
    this.swapped = false;
    this.alarm = false;
    this._resetRun();
    const hud = s.game.hud;
    hud.setPhase(`${this.chapter.title} · Part ${this.partIndex + 1}: ${this.part.title}`);
    hud.setObjective(this.part.objective);
    if (first && !s.game.speedrun) s.showStoryCards(this.part.intro, this.part.startLabel || 'Go');
  }

  /** (start, and after being caught) the timers, the guards, the doors */
  _resetRun() {
    const s = this.state, L = this.level;
    this.t = 0;
    this.tunnelT = OPEN * 0.7;     // the first tunnel comes quite soon
    this.inTunnel = false;
    this.spotted = 0;
    this.stare = 0;
    this.seat = null;
    this.pull = 0;
    this.decouple = 0;
    this.speed = SPEED;
    this.discover = this.swapped ? DISCOVER * diff().timer : 0;
    L.front.position.z = 0;
    this.police.reset(); this.guards.reset();
    this.police.setAlert(this.alarm); this.guards.setAlert(this.alarm);
    this._setDark(false);
    this._holdCase(this.swapped);
    s.model.seated = false;
  }

  _setDark(dark) {
    const L = this.level;
    this.dark = dark;
    for (const l of L.lights) l.intensity = dark ? 1.2 : 12;
    for (const st of L.strips) st.material.color.setHex(dark ? 0x1a2848 : 0xffffff);
    this.state.lighting.under = dark ? 0.9 : 0.35;
    const sight = diff().guardSight * (dark ? 0.35 : 1);
    this.police.sight = sight;
    this.guards.sight = sight;
  }

  _holdCase(on) {
    const m = this.state.model;
    if (on && this.handCase.parent !== (m.elbowR || m.root)) (m.elbowR || m.root).add(this.handCase);
    if (!on) this.handCase.parent?.remove(this.handCase);
    this.level.caseGlow.visible = !on;
  }

  _caught(title, msg) {
    if (admin.flag('god')) { this.spotted = 0; this.stare = 0; return; }
    if (noteCaught(this.state)) return; // (the third time: off to jail)
    this.run.caught++;
    audio.sfx('caught');
    this._toCheckpoint(title, msg);
  }

  _toCheckpoint(title, msg, color = 'var(--red)') {
    const s = this.state, cp = this.level.checkpoints[this.cp];
    this._resetRun();
    s.placePlayer(cp.spawn, cp.yaw);
    s.flash(title, msg, color);
  }

  onRespawnKey() { this._toCheckpoint('Checkpoint', 'Back to the last checkpoint.', 'var(--cyan)'); }

  audioMix() {
    return { wind: this.inTunnel ? 0.55 : 0.3, city: 0, engine: 0.18, siren: this.alarm ? 0.15 : 0, music: 0.5, intensity: this.alarm ? 0.9 : 0.35 + this.spotted * 0.5 };
  }

  update(dt) {
    if (this.done) return;
    const s = this.state, L = this.level, p = s.player, pos = p.pos, hud = s.game.hud, input = s.game.input, d = diff();
    this.t += dt;

    // --- The train: the world rushes past, tunnels come and go
    if (this.decouple > 0) this.speed = Math.max(0, this.speed - dt * 30);
    this.tunnelT -= dt;
    if (this.tunnelT <= 0) {
      this.inTunnel = !this.inTunnel;
      this.tunnelT = this.inTunnel ? TUNNEL * (d.timer > 1.2 ? 1.25 : 1) : OPEN;
      this._setDark(this.inTunnel);
      audio.sfx('whoosh', { vol: 0.8, rate: 0.6 });
      if (this.inTunnel && !this.toldDark) { this.toldDark = true; hud.toast('Tunnel!', 'Kitsu: "Lights out for a few seconds. That\'s your window for the case."', '#ff7a2a', 3); }
    }
    const cityK = clamp(1 - this.t / 70, 0.08, 1);
    this.scenery.update(this.speed * dt, this.inTunnel, cityK);
    audio.engine(40 + this.speed * 0.3, 0.3);
    // the carriage sways a little
    s.cam.roll = Math.sin(this.t * 1.7) * 0.006 + Math.sin(this.t * 7.3) * 0.002 * (this.speed / SPEED);
    // after uncoupling: the rest of the train pulls away
    if (this.decouple > 0) {
      this.decouple += dt;
      L.front.position.z -= (SPEED - this.speed) * dt;
      if (this.decouple > 3.2) { this._finish(); return; }
    }

    // --- Doors slide open when someone comes up to them
    const walkers = [pos, ...this.police.units.map((u) => u.pc.pos), ...this.guards.units.map((u) => u.pc.pos)];
    for (const door of L.doors) {
      const near = walkers.some((w) => Math.abs(w.z - door.z) < 2.2 && Math.abs(w.x) < 1.2);
      door.open += ((near ? 1 : 0) - door.open) * Math.min(1, dt * 8);
      door.mesh.position.x = door.open * 1.05;
    }

    // --- Sitting down / standing up
    let stoodUp = false;
    if (this.seat) {
      const st = this.seat;
      p.teleport(st.x, 0.05, st.z, Math.PI);
      s.model.seated = true;
      s.setAction('Stand up');
      if (input.wasPressed('interact') || (this.t - this.seatT > 0.4 && (Math.abs(input.axis('back', 'forward')) > 0.5 || Math.abs(input.axis('left', 'right')) > 0.5))) {
        this.seat = null;
        s.model.seated = false;
        stoodUp = true; // (so the same press doesn't sit you straight back down)
        p.teleport(st.aisleX, 0.05, st.z, Math.PI);
      }
    }

    // --- The guards (sitting in a seat, you're just a passenger)
    const hidden = !!this.seat || s.concealed;
    const seen = this.police.update(dt, p, hidden) | this.guards.update(dt, p, hidden && !this.alarm);
    for (const sq of [this.police, this.guards]) {
      if (sq.bodyFound && !sq.alert) { this.police.setAlert(true); this.guards.setAlert(true); hud.toast('Man down!', 'Someone found the one you knocked out. Everyone\'s on alert.', 'var(--red)', 4); }
    }
    const searching = huntMessages(this.police, hud, 'railway police');
    // the courier himself: hang about at his seat with the lights on and he notices
    const atCourier = !this.swapped && Math.abs(pos.z - L.courier.z) < 1.6 && pos.x > -0.3 && !this.seat;
    this.stare = clamp(this.stare + (atCourier && !this.dark ? dt / (2.4 * d.fill) : -dt), 0, 1);
    this.spotted = clamp(this.spotted + (seen ? (dt / 0.85) * d.fill : -dt * 0.5), 0, 1);
    const meter = Math.max(this.spotted, this.stare);
    if (this.pull > 0) hud.setMeter(this.pull, 'Releasing the coupling...', '#ff7a2a');
    else if (meter > 0.01) hud.setMeter(meter, this.stare > this.spotted ? 'THE COURIER IS LOOKING AT YOU' : seen ? 'SEEN! Sit down, or get out of sight' : searching || 'Hidden', 'var(--red)');
    else hud.setMeter(0, this.dark ? 'Dark!' : searching || '', this.dark ? '#ff7a2a' : '#8a8f9c');
    if (this.spotted >= 1 || this.stare >= 1) {
      this._caught(this.stare >= 1 ? 'The courier' : 'Caught', this.stare >= 1
        ? 'He looked up and saw you fiddling with the rack. Only swap the case in a tunnel, when the lights go out.'
        : this.alarm ? 'They grabbed you before you reached the luggage car. Sit down in an empty seat to let them pass.' : 'The railway police caught you. When they walk your way, sit down in an empty seat (E): you\'re just another passenger.');
      return;
    }

    // --- What you can do here (E)
    let action = this.seat ? 'Stand up' : null;
    if (!this.seat && !this.decouple && !stoodUp) {
      const spot = L.sitSpots.find((st) => Math.abs(pos.z - st.z) < 0.6 && Math.abs(pos.x - st.x) < 1.25 && Math.abs(pos.x) < 0.7);
      const atSwap = !this.swapped && Math.hypot(pos.x - L.spots.swap.x, pos.z - L.spots.swap.z) < 1.1;
      const atLever = this.swapped && Math.hypot(pos.x - L.spots.lever.x, pos.z - L.spots.lever.z) < 1.4;
      const ko = this.police.takedownTarget(p) || this.guards.takedownTarget(p);
      if (atSwap) action = this.dark ? 'Swap the case' : 'Wait for a tunnel';
      else if (atLever) action = 'Uncouple (hold)';
      else if (ko) action = 'Knock out';
      else if (spot) action = 'Sit down';
      if (input.wasPressed('interact')) {
        if (atSwap && this.dark) this._swap();
        else if (atSwap) hud.toast('Not with the lights on', 'He\'d see you. Wait for the next tunnel, when the carriage goes dark.', 'var(--amber)', 3);
        else if (ko && !atLever) { (this.police.units.includes(ko) ? this.police : this.guards).takedown(ko); audio.sfx('land', { vol: 1 }); }
        else if (spot && !atLever) { this.seat = spot; this.seatT = this.t; s.model.seated = true; audio.sfx('step', { vol: 0.6 }); }
      }
      if (atLever && input.isDown('interact')) {
        this.pull += dt / 1.6;
        L.leverArm.rotation.x = -this.pull * 1.2;
        if (this.pull >= 1) this._uncouple();
      } else if (!atLever) this.pull = 0;
    }
    s.setAction(action);

    // --- Checkpoints, the courier finding out
    if (this.cp === 0 && pos.z < -77) { this.cp = 1; audio.sfx('checkpoint', { vol: 0.5 }); }
    if (this.swapped && !this.alarm) {
      this.discover -= dt;
      if (this.discover <= 0) {
        this.alarm = true;
        this.police.setAlert(true); this.guards.setAlert(true);
        audio.sfx('alarm');
        hud.setObjective('Back to the luggage car and pull the coupling release!');
        hud.toast('He opened it!', 'The courier stares at a case full of comics, then screams. Kitsu: "RUN! The luggage car, at the back. Pull the red release, I\'ll do the rest!"', 'var(--red)', 6);
      }
    }
    if (this.swapped) s.model.carrying = true;
    this._updateMarker();
    hud.setStats(`<span>${this.inTunnel ? `<b>Dark</b> ${Math.ceil(this.tunnelT)}s` : `Next tunnel <b>${Math.ceil(this.tunnelT)}s</b>`}</span>` +
      (this.swapped && !this.alarm ? `<span class="warn">He opens it in <b>${Math.ceil(this.discover)}s</b></span>` : '') +
      `<span>Time <b>${formatTime(s.time)}</b></span><span${this.run.caught ? ' class="warn"' : ''}>Caught <b>${this.run.caught}</b></span>`);
  }

  _swap() {
    const s = this.state, hud = s.game.hud;
    this.swapped = true;
    this.cp = 2;
    this.discover = DISCOVER * diff().timer;
    this._holdCase(true);
    earn(s.game, CASH, '', { quiet: true });
    audio.sfx('cash', { vol: 0.7 });
    hud.setObjective('Get back to the luggage car before he opens the case');
    hud.toast('Swapped!', 'In the dark, his case goes into your hand and Kitsu\'s copy goes up on the rack. Kitsu: "Now walk, don\'t run. He\'ll open it in a minute or so."', 'var(--safe)', 5);
  }

  _uncouple() {
    const s = this.state, hud = s.game.hud;
    this.decouple = 0.01;
    this.pull = 0;
    s.setAction(null);
    audio.sfx('clang', { vol: 1 });
    hud.toast('Uncoupled!', 'A bang, a jolt, and the lights of the Silver Arrow pull away into the night without you.', '#ff7a2a', 4);
  }

  _finish() {
    if (this.done) return;
    this.done = true;
    const s = this.state;
    s.setAction(null);
    s.cam.roll = 0;
    s.game.hud.setMeter(0, '');
    audio.sfx('win');
    finishPart(s, this);
  }

  _updateMarker() {
    const s = this.state, hud = s.game.hud, pos = s.player.pos, L = this.level;
    const t = this.swapped ? _v.copy(L.spots.lever).setY(1.6) : _v.set(1.2, 2.3, L.courier.z);
    hud.setMarker(t, s.camera, this.swapped ? 'Coupling release' : 'The silver case', this.swapped ? '#ff7a2a' : 'var(--amber)', Math.abs(t.z - pos.z));
  }

  adminSkip() { this._finish(); }

  teardown() {
    const s = this.state;
    s.setAction?.(null);
    if (s.cam) s.cam.roll = 0;
    if (s.lighting) s.lighting.under = 0;
    if (s.model) s.model.seated = false;
    this.handCase?.parent?.remove(this.handCase);
    this.police?.dispose();
    this.guards?.dispose();
  }
}

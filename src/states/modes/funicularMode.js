import * as THREE from 'three';
import { buildChapter15Hill, carBoxes, trackY, H, TRACK_X } from '../../world/levels/chapter15Hill.js';
import { MovingPlatform } from '../../world/movingPlatform.js';
import { GuardSquad, huntMessages } from '../../ai/guards.js';
import { PlayerModel } from '../../player/playerModel.js';
import { crewLook, POLICE_LOOK } from '../../player/people.js';
import { CHAPTERS } from '../../story/chapters.js';
import { getChapterRun } from '../../story/chapterRun.js';
import { finishPart } from '../../story/chapterFlow.js';
import { admin } from '../../core/admin.js';
import { diff } from '../../core/difficulty.js';
import { formatTime, clamp } from '../../core/utils.js';
import { noteCaught } from '../../core/jail.js';
import { audio } from '../../core/audio.js';

// Chapter 15, Part 2: the funicular up Monte Sereno.
//
//  Two cars on one cable: as yours (1, yellow) goes up, the other (2,
//  orange) comes down, and they pass each other halfway, slowing down as
//  they do. Varga is waiting at the top station. So: ride up, and as the
//  other car comes alongside, jump across through the open sides (they
//  face each other, edged in yellow). Ride it back down, then get past
//  Varga's officers on the quay to Juno's seaplane.

const SPEED = 3.8, SLOW = 1.3, SLOW_ZONE = 13;
const VARGA_LOOK = { hoodie: 0x6a5a40, trousers: 0x2a2b31, shirt: 0xe8e8e8, tie: 0x8a1a2a, hat: 0x3a3d45, style: { top: 'trench', hat: 'fedora', beard: 'moustache' } };
const body = (p, facing) => ({ pos: p.clone(), vel: new THREE.Vector3(), facing, state: 'ground', horizontalSpeed: 0, mantleProgress: 0, stateTime: 0, stumbleTimer: 0, mantle: null, wallRun: null });
const _v = new THREE.Vector3();

export class FunicularMode {
  constructor(state, params) {
    this.state = state;
    this.chapter = CHAPTERS[params.chapterId || 'chapter15'];
    this.partIndex = params.part || 1;
    this.part = this.chapter.parts[this.partIndex];
    this.hudSections = ['tl', 'meter', 'controls', 'marker'];
    this.weather = 'clear';
    this.weatherForced = true;
    this.time = 'night';
    this.indoors = true;
  }

  get officers() { return this.patrols; }
  get fallY() { return -8; }

  build() {
    const L = buildChapter15Hill();
    L.spawn = L.checkpoints[0].spawn.clone();
    L.spawn.yaw = L.checkpoints[0].yaw;
    this.level = L;
    this.carA = new MovingPlatform(L.world, L.carA, carBoxes(-1), this._carPos(-1, 0));
    this.carB = new MovingPlatform(L.world, L.carB, carBoxes(1), this._carPos(1, H));
    // Varga and his men at the top; Juno on the jetty
    this.varga = new PlayerModel(VARGA_LOOK, { bag: false });
    this.varga.pose = body(L.vargaSpot, Math.PI * 0);
    L.group.add(this.varga.root);
    this.topCops = [-1.6, 1.6].map((dx) => {
      const m = new PlayerModel(POLICE_LOOK, { bag: false });
      m.pose = body(L.vargaSpot.clone().add(new THREE.Vector3(dx, 0, -1.2)), 0);
      L.group.add(m.root);
      return m;
    });
    this.juno = new PlayerModel(crewLook('juno'), { bag: false });
    this.juno.pose = body(L.junoSpot, Math.PI);
    L.group.add(this.juno.root);
    this.patrols = new GuardSquad(L.group, L.world, L.quayRoutes.map((route) => ({ route })), { sight: diff().guardSight, look: POLICE_LOOK, range: 12, alertRange: 16 });
    return L;
  }

  /** Where a car's reference point is when it's travelled h metres up (along the ground). */
  _carPos(side, h) {
    const z = -h;
    return new THREE.Vector3(side * TRACK_X, trackY(z), z);
  }

  start(first) {
    const s = this.state;
    this.run = getChapterRun(s.game, this.chapter.id);
    this.done = false;
    this.cp = 0;
    this._reset();
    s.model.setOutfit({ hoodie: 0xe8743a, trousers: 0x24324a, style: { top: 'hawaiian', bag: true } });
    const hud = s.game.hud;
    hud.setPhase(`${this.chapter.title} · Part ${this.partIndex + 1}: ${this.part.title}`);
    hud.setObjective(this.part.objective);
    if (first && !s.game.speedrun) s.showStoryCards(this.part.intro, this.part.startLabel || 'Go');
  }

  /** Cars back to their stations (or, after the swap, the other car parked at the bottom). */
  _reset() {
    this.h = this.cp === 0 ? 0 : H;
    this.phase = this.cp === 0 ? 'wait' : 'down';
    this.waitT = 0;
    this.boardT = 0;
    this.spotted = 0;
    this.leaveT = 22 * diff().timer;  // before Varga's cars reach the bottom station
    this.toldJump = false;
    this.swapped = this.cp > 0;
    this.carA.moveTo(this._carPos(-1, this.h));
    this.carB.moveTo(this._carPos(1, H - this.h));
    this.patrols.reset();
    this.patrols.setAlert(this.cp > 0);
    for (const u of this.patrols.units) u.model.root.visible = u.cone.visible = this.cp > 0; // (they're up at the top until you come back down)
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
  onFall() { this._toCheckpoint('Fell!', 'Off the funicular. Jump across only while the other car is right alongside.', 'var(--cyan)'); }

  audioMix() {
    return { siren: this.phase === 'up' && this.h > H * 0.4 ? 0.3 : 0.1, wind: 0.25, city: 0.08, music: 0.6, intensity: this.phase === 'wait' ? 0.5 : 0.8 };
  }

  update(dt) {
    if (this.done) return;
    const s = this.state, p = s.player, pos = p.pos, hud = s.game.hud, L = this.level;
    const inA = this.carA.carries(p) || this._inside(this.carA, pos);
    const inB = this.carB.carries(p) || this._inside(this.carB, pos);

    // --- The cars
    if (this.phase === 'wait') {
      this.leaveT -= dt;
      if (inA) {
        this.boardT += dt;
        if (this.boardT > 1.4) { this.phase = 'up'; audio.sfx('door'); hud.setObjective('Halfway up, jump across to car 2 as it passes'); hud.toast('Doors closing', 'Paz, on the radio: "The operator owes me one. Up you go!"', 'var(--cyan)', 3); }
      }
      if (this.leaveT <= 0) {
        this._caught('Varga\'s men', 'Their cars pulled up at the bottom station. Get into car 1 (the yellow one) straight away.');
        return;
      }
    } else if (this.phase === 'up' || this.phase === 'down') {
      const mid = H / 2, d = Math.abs(this.h - mid);
      const v = d < SLOW_ZONE ? SLOW + (SPEED - SLOW) * (d / SLOW_ZONE) ** 2 : SPEED;
      this.h = Math.min(H, this.h + v * dt);
      if (this.h >= H) this.phase = 'stopped';
    }
    this.carA.moveTo(this._carPos(-1, this.h), p);
    this.carB.moveTo(this._carPos(1, H - this.h), p);

    // --- The passing loop
    const gap = Math.abs(this.carA.pos.z - this.carB.pos.z);
    if (!this.toldJump && this.phase === 'up' && gap < 20) {
      this.toldJump = true;
      audio.sfx('sting', { vol: 0.6 });
      hud.toast('JUMP!', 'Ricky: "Varga\'s at the top station, I can see his hat! When car 2 comes alongside, jump across: the open sides with the yellow edges."', 'var(--amber)', 6);
    }
    if (!this.swapped && inB && p.grounded) {
      this.swapped = true;
      audio.sfx('checkpoint', { vol: 0.7 });
      hud.setObjective('Ride car 2 down, then get to Juno\'s seaplane at the end of the jetty');
      hud.toast('Made it!', 'Up at the top, Varga throws his hat on the ground. "THE OTHER CAR! Get down there!"', 'var(--safe)', 5);
    }
    // the top station: still in car 1 = straight into Varga's arms
    if (this.phase === 'stopped' && inA && !this.swapped) {
      this._caught('Varga!', 'Varga was waiting at the top station. Jump across to car 2 as it passes you halfway (the cars slow right down there).');
      return;
    }
    // back down at the bottom: the quay
    if (this.swapped && this.cp === 0 && this.phase === 'stopped') {
      this.cp = 1;
      for (const u of this.patrols.units) u.model.root.visible = u.cone.visible = true;
      this.patrols.setAlert(true);
      hud.toast('The bottom station', 'Juno: "Two of Varga\'s men are on the quay! I\'m at the end of the jetty, engine running. Stay behind the crates!"', 'var(--amber)', 5);
    }
    // off the track: fell between the cars
    if (!inA && !inB && !p.grounded && pos.z < -4 && Math.abs(pos.x) < 4.5 && pos.y < trackY(pos.z) - 1.5) { this.onFall(); return; }

    // --- Varga and his men watch from the top; police flashers
    const flash = Math.floor(s.time * 4) % 2 === 0;
    for (const [r, b] of L.flashers) { r.visible = flash; b.visible = !flash; }
    this.varga.pose.facing = Math.atan2(pos.x - this.varga.pose.pos.x, pos.z - this.varga.pose.pos.z);
    this.varga.update(dt, this.varga.pose);
    for (const c of this.topCops) c.update(dt, c.pose);
    this.juno.update(dt, this.juno.pose);

    // --- The officers on the quay (once you're back down)
    if (this.cp > 0) {
      const seen = this.patrols.update(dt, p, s.concealed);
      this.spotted = clamp(this.spotted + (seen ? (dt / 0.8) * diff().fill : -dt * 0.5), 0, 1);
      const searching = huntMessages(this.patrols, hud, 'police');
      hud.setMeter(this.spotted, seen ? 'SEEN! Get behind the crates' : searching || 'Sneak past them to the jetty', seen ? 'var(--red)' : searching ? '#ff7a1a' : '#8a8f9c');
      if (this.spotted >= 1) { this._caught('Caught on the quay', 'Varga\'s officers got you. Keep the crates and the vans between you and them.'); return; }
      const target = this.patrols.takedownTarget(p);
      s.setAction(target ? 'Knock out' : null);
      if (target && s.game.input.wasPressed('interact')) { this.patrols.takedown(target); s.setAction(null); audio.sfx('land', { vol: 1 }); }
    } else hud.setMeter(this.phase === 'wait' && !inA ? clamp(1 - this.leaveT / (22 * diff().timer), 0, 1) : 0, this.phase === 'wait' && !inA ? 'Varga\'s cars are coming: get in car 1!' : '', 'var(--amber)');

    // --- Juno's seaplane
    const G = L.goal;
    L.goalGlow.visible = L.goalBeam.visible = this.swapped;
    if (this.swapped && Math.hypot(pos.x - G.x, pos.z - G.z) < 2.6 && Math.abs(pos.y - G.y) < 1.5) { this._finish(); return; }

    this._updateMarker(inA, inB);
    hud.setStats(`<span>Car 1 <b>${Math.round((this.h / H) * 100)}%</b> up</span><span>Time <b>${formatTime(s.time)}</b></span><span${this.run.caught ? ' class="warn"' : ''}>Caught <b>${this.run.caught}</b></span>`);
  }

  /** Inside a car (standing on its floor, or jumping about in it)? */
  _inside(car, pos) {
    const c = car.pos;
    return Math.abs(pos.x - c.x) < 1.6 && pos.z > c.z - 3.2 && pos.z < c.z + 3.2 && pos.y > c.y - 1.7 && pos.y < c.y + 4.6;
  }

  _updateMarker(inA, inB) {
    const s = this.state, hud = s.game.hud, pos = s.player.pos;
    let t, label, color = 'var(--amber)';
    if (this.phase === 'wait' && !inA) { t = _v.copy(this.carA.pos).add(new THREE.Vector3(0, 2.2, 1.5)); label = 'Car 1'; }
    else if (!this.swapped) { t = _v.copy(this.carB.pos).add(new THREE.Vector3(0, 2.6, 0)); label = 'Car 2: jump across!'; }
    else if (inB && this.phase !== 'stopped') { t = _v.copy(this.level.goal).setY(2.4); label = 'Juno\'s seaplane'; color = 'var(--safe)'; }
    else { t = _v.copy(this.level.goal).setY(2.4); label = 'Juno\'s seaplane'; color = 'var(--safe)'; }
    hud.setMarker(t, s.camera, label, color, Math.hypot(t.x - pos.x, t.z - pos.z));
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
    s.model?.setOutfit(null);
    this.patrols?.dispose();
  }
}

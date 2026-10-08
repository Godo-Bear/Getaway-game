import * as THREE from 'three';
import { buildChapter17Tower, KURO } from '../../world/levels/chapter17Tower.js';
import { CHAPTERS } from '../../story/chapters.js';
import { getChapterRun } from '../../story/chapterRun.js';
import { finishPart } from '../../story/chapterFlow.js';
import { earn } from '../../gadgets/gadgets.js';
import { admin } from '../../core/admin.js';
import { diff } from '../../core/difficulty.js';
import { formatTime, clamp, damp, dampAngle } from '../../core/utils.js';
import { noteCaught } from '../../core/jail.js';
import { audio } from '../../core/audio.js';

// Chapter 17, Part 1: the wingsuit drop onto Kurogane Tower.
//
//  Juno hovers the helicopter 330 m over the end of the avenue; you jump,
//  and fly the whole length of the canyon of skyscrapers to the roof of
//  Kurogane Tower, 700 m away and 110 m lower.
//   A / D       steer (you bank into the turn)
//   W           dive: faster, but you drop fast
//   S           flare: slow down and float
//  Steam UPDRAFTS over the lower towers lift you back up; orange RINGS
//  give a burst of speed (and cash); the security DRONES sweep the avenue
//  with searchlights: stay out of the beams. Touch down anywhere on
//  Kurogane's roof (the helipad is a bonus). Hit a wall, or drop below the
//  roof, and you start again from the last checkpoint. Land on another roof
//  by mistake? Run and jump off its edge: the wingsuit opens again.

const SPEED = 24, DIVE = 34, FLARE = 15;
const SINK = 3.0, DIVE_SINK = 10, FLARE_SINK = 1.4;
const LIFT = 6.5;                    // an updraft pushes you up this fast
const TURN = 1.5;                    // rad/s at full steer
const BEAM_LEN = 62, BEAM_ANGLE = 0.24, BEAM_TILT = 0.35;
const RING_CASH = 60;
const _v = new THREE.Vector3(), _a = new THREE.Vector3();

export class SkyDropMode {
  constructor(state, params) {
    this.state = state;
    this.chapter = CHAPTERS[params.chapterId || 'chapter17'];
    this.partIndex = params.part ?? 0;
    this.part = this.chapter.parts[this.partIndex];
    this.hudSections = ['tl', 'meter', 'controls', 'marker'];
    this.weather = 'clear';
    this.weatherForced = true;
    this.time = 'night';
    this.indoors = true;   // (no city crowd or traffic: this is all sky)
  }

  /** While you fly, your own walking controls are off: A/D/W/S fly the wingsuit instead. */
  get inputLocked() { return this.flying; }
  get fallY() { return -10; }

  build() {
    const L = buildChapter17Tower({ withVault: false });
    L.spawn = L.jump.clone();
    L.spawn.yaw = 0;   // (camera yaw 0 looks along -Z: down the avenue, towards Kurogane)
    L.checkpoints = [
      { spawn: L.jump.clone(), yaw: 0 },
      { spawn: new THREE.Vector3(0, 262, -134), yaw: 0 },   // past the sky bridge
    ];
    this.level = L;
    // a green beam over the helipad (seen from far off, through the haze)
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 160, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x4dffa6, transparent: true, opacity: 0.16, depthWrite: false, fog: false, side: THREE.DoubleSide }));
    beam.position.set(L.pad.x, KURO.h + 80, L.pad.z);
    L.group.add(beam);
    this.padBeam = beam;
    return L;
  }

  start(first) {
    const s = this.state;
    this.run = getChapterRun(s.game, this.chapter.id);
    this.done = false;
    this.cp = 0;
    if (!this._camSet) {
      this._camSet = true;
      this.wasFirstPerson = s.cam.firstPerson;
      if (this.wasFirstPerson) s.setFirstPerson(false);
      this.camDist = s.cam.distance;
    }
    s.model.setOutfit({ hoodie: 0x1a1b22, trousers: 0x1a1b22, gloves: 0xff7a2a, style: { top: 'tracksuit', bag: true, hat: 'beanie' } });
    for (const r of this.level.rings) { r.taken = false; r.mesh.visible = true; }
    this._launch();
    const hud = s.game.hud;
    if (first) hud.showControls(`<kbd>A</kbd>/<kbd>D</kbd> steer &nbsp; <kbd>W</kbd> dive (faster) &nbsp; <kbd>S</kbd> flare (slow, float)<br>
      On a roof: walk, and jump off the edge to fly again &nbsp; <kbd>R</kbd> checkpoint &nbsp; <kbd>P</kbd> pause`);
    hud.setPhase(`${this.chapter.title} · Part ${this.partIndex + 1}: ${this.part.title}`);
    hud.setObjective(this.part.objective);
    if (first && !s.game.speedrun) s.showStoryCards(this.part.intro, this.part.startLabel || 'Jump');
  }

  /** (start, and after a crash) out of the helicopter, or from the checkpoint past the bridge */
  _launch() {
    const s = this.state, cp = this.level.checkpoints[this.cp];
    s.placePlayer(cp.spawn, cp.yaw);
    this.heading = cp.yaw + Math.PI;   // (the way you face: sin/cos of it is your direction)
    this.speed = 18;
    this.boostT = 0;
    this.spotted = 0;
    this.crashT = 0;
    this.flyT = 0;
    this.bank = 0;
    this.pitch = 0;
    this.flying = true;
    this.lastPos = s.player.pos.clone();
    this.groundT = 0;
    this.toldRoof = false;
    s.model.flying = 'wingsuit';
    s.cam.distance = 6.5;
    for (const d of this.level.drones) { d.leg = 0; d.pos.set(...d.path[0]); d.hot = 0; }
  }

  _caught(title, msg) {
    if (admin.flag('god')) { this.spotted = 0; return; }
    if (noteCaught(this.state)) return; // (the third time: off to jail)
    this.run.caught++;
    audio.sfx('caught');
    this._restart(title, msg);
  }

  _restart(title, msg, color = 'var(--red)') {
    this._launch();
    this.state.flash(title, msg, color);
  }

  onRespawnKey() { this._restart('Checkpoint', 'Back to the last checkpoint.', 'var(--cyan)'); }

  onFall() { this._restart('Too low', 'You dropped into the streets. Keep above Kurogane\'s roof: flare (S) to float, and ride the steam updrafts to climb.'); }

  audioMix() {
    const k = this.flying ? clamp(this.speed / DIVE, 0, 1) : 0.1;
    return { wind: 0.25 + k * 0.7, city: this.flying ? 0.05 : 0.15, engine: 0, siren: 0, music: 0.55, intensity: 0.45 + this.spotted * 0.5 + (this.boostT > 0 ? 0.2 : 0) };
  }

  update(dt) {
    if (this.done) return;
    const s = this.state, L = this.level, p = s.player, pos = p.pos, hud = s.game.hud, input = s.game.input, d = diff();
    this.flyT += dt;

    // --- Juno's helicopter (rotor spinning, it peels away after you jump)
    L.heli.children[2].rotation.y += dt * 30;
    L.heli.position.x = Math.min(60, L.heli.position.x + dt * (this.flyT > 2 ? 6 : 0));
    this.padBeam.material.opacity = 0.12 + Math.sin(this.flyT * 3) * 0.04;
    for (const r of L.rings) r.mesh.rotation.y += dt * 0.6;

    // --- The drones fly their loops; their beams point ahead and down
    for (const dr of L.drones) {
      const tgt = dr.path[(dr.leg + 1) % dr.path.length];
      _v.set(tgt[0] - dr.pos.x, tgt[1] - dr.pos.y, tgt[2] - dr.pos.z);
      const dist = _v.length();
      if (dist < 0.5) dr.leg = (dr.leg + 1) % dr.path.length;
      else {
        _v.multiplyScalar(Math.min(dist, dr.speed * dt) / dist);
        dr.pos.add(_v);
        dr.g.rotation.y = dampAngle(dr.g.rotation.y, Math.atan2(_v.x, _v.z), 3, dt);
      }
      dr.cone.rotation.x = BEAM_TILT;
      for (const c of dr.g.children) if (c.geometry?.type === 'CylinderGeometry') c.rotation.y += dt * 40;
    }

    if (this.flying) this._fly(dt, input, d);
    else {
      // On a roof: walk about; step off an edge and the wingsuit opens again
      if (p.state === 'air' && p.vel.y < -5 && pos.y > KURO.h - 10) {
        this.flying = true;
        this.heading = p.facing;
        this.speed = Math.max(14, p.horizontalSpeed);
        s.model.flying = 'wingsuit';
        audio.sfx('whoosh', { vol: 0.8 });
      }
      s.cam.distance = damp(s.cam.distance, this.camDist || 4, 2, dt);
    }
    if (this.done) return;

    // --- Too low: you'll never make the roof now
    if (pos.y < KURO.h - 25 && !admin.flag('god')) { this._restart('Too low', 'You can\'t reach Kurogane\'s roof from down here. Flare (S) to float longer, and ride the steam updrafts to climb.'); return; }

    // --- Checkpoint past the sky bridge
    if (this.cp === 0 && pos.z < -134 && this.flying) { this.cp = 1; audio.sfx('checkpoint', { vol: 0.5 }); hud.toast('Checkpoint', 'Past the sky bridge.', 'var(--cyan)', 2); }

    // --- HUD
    const dist = Math.hypot(pos.x - L.pad.x, pos.z - L.pad.z);
    hud.setMarker(_a.copy(L.pad).setY(KURO.h + 2), s.camera, 'Kurogane: the roof', 'var(--safe)', dist);
    hud.setStats(`<span>Height <b class="${pos.y - KURO.h < 15 ? 'warn' : ''}">${Math.round(pos.y - KURO.h)} m</b> above the roof</span>` +
      `<span>Speed <b>${Math.round((this.flying ? this.speed : p.horizontalSpeed) * 3.6)}</b> km/h</span>` +
      `<span>Time <b>${formatTime(s.time)}</b></span><span${this.run.caught ? ' class="warn"' : ''}>Caught <b>${this.run.caught}</b></span>`);
  }

  _fly(dt, input, d) {
    const s = this.state, L = this.level, p = s.player, pos = p.pos, hud = s.game.hud;
    const steer = input.axis('left', 'right');
    const pitchIn = input.axis('back', 'forward');   // + = dive (W), - = flare (S)
    this.heading -= steer * TURN * dt;
    this.bank = damp(this.bank, -steer * 0.65, 5, dt);
    this.pitch = damp(this.pitch, pitchIn > 0 ? 0.3 * pitchIn : 0.4 * pitchIn, 4, dt);
    s.model.flyBank = this.bank;
    s.model.flyPitch = this.pitch;
    this.boostT = Math.max(0, this.boostT - dt);
    let want = pitchIn > 0 ? SPEED + (DIVE - SPEED) * pitchIn : SPEED + (FLARE - SPEED) * -pitchIn;
    if (this.boostT > 0) want += 14;
    this.speed = damp(this.speed, want, pitchIn < 0 ? 0.8 : 0.6, dt);
    // sink: a dive drops you fast; a flare floats, until you're too slow and stall
    let sink = pitchIn > 0 ? SINK + (DIVE_SINK - SINK) * pitchIn : SINK + (FLARE_SINK - SINK) * -pitchIn;
    if (this.speed < 16) sink += (16 - this.speed) * 0.9;
    if (this.boostT > 0) sink *= 0.5;
    let vy = -sink;
    // updrafts: steam from the towers' vents lifts you
    let inDraft = false;
    for (const u of L.updrafts) {
      if (pos.y > u.y0 && pos.y < u.y1 && Math.hypot(pos.x - u.x, pos.z - u.z) < u.r) { vy = LIFT; inDraft = true; break; }
    }
    if (inDraft && !this.toldDraft) { this.toldDraft = true; hud.toast('Updraft!', 'Warm air from the vents lifts you up.', 'var(--cyan)', 2); }
    this.vy = damp(this.vy ?? vy, vy, inDraft ? 2.5 : 4, dt);
    // boost rings
    for (const r of L.rings) {
      if (r.taken || Math.hypot(pos.x - r.x, pos.y + 0.6 - r.y, pos.z - r.z) > 5.4) continue;
      r.taken = true;
      r.mesh.visible = false;
      this.boostT = 2.5;
      earn(s.game, RING_CASH, '', { quiet: true });
      audio.sfx('whoosh', { vol: 1, rate: 1.3 });
      audio.sfx('cash', { vol: 0.4 });
      hud.toast('Boost!', `+$${RING_CASH}`, '#ff7a2a', 1.4);
    }
    // move: set the velocity the physics step will use (it does the collisions)
    p.vel.set(Math.sin(this.heading) * this.speed, this.vy, Math.cos(this.heading) * this.speed);
    p.facing = this.heading;
    s.cam.yaw = dampAngle(s.cam.yaw, this.heading + Math.PI, 3.2, dt);
    s.cam.pitch = damp(s.cam.pitch, -0.22 - this.pitch * 0.4, 2, dt);
    s.cam.distance = damp(s.cam.distance, 6.5 + (this.speed - SPEED) * 0.06, 2, dt);
    s.cam.roll = this.bank * 0.12;

    // --- Crashed into a wall? (you moved much less than you meant to)
    const moved = Math.hypot(pos.x - this.lastPos.x, pos.z - this.lastPos.z);
    const expect = this.speed * dt;
    this.lastPos.copy(pos);
    if (this.flyT > 0.3 && !p.grounded && moved < expect * 0.35 && p.state !== 'mantle') {
      this.crashT += dt;
      if (this.crashT > 0.08) {
        audio.sfx('land', { vol: 1 });
        if (admin.flag('god')) { this.heading += Math.PI; this.crashT = 0; return; }
        this._restart('Splat!', 'You flew into a building. Steer with A and D, and keep to the open sky down the middle of the avenue.');
        return;
      }
    } else this.crashT = 0;

    // --- Landed?
    if (p.grounded || p.state === 'mantle' || p.state === 'ground') {
      this.flying = false;
      s.model.flying = null;
      s.cam.roll = 0;
      p.vel.multiplyScalar(0.3);
      const onKuro = pos.x > KURO.x0 - 0.5 && pos.x < KURO.x1 + 0.5 && pos.z > KURO.z0 - 0.5 && pos.z < KURO.z1 + 0.5 && pos.y > KURO.h - 1.5;
      if (onKuro) { this._finish(Math.hypot(pos.x - L.pad.x, pos.z - L.pad.z) < 8); return; }
      audio.sfx('land', { vol: 0.8 });
      if (!this.toldRoof) { this.toldRoof = true; hud.toast('Wrong roof!', 'Run and jump off the edge: the wingsuit opens again as you fall. Or press R for the checkpoint.', 'var(--amber)', 5); }
      return;
    }

    // --- The drones' searchlights
    let lit = false;
    for (const dr of L.drones) {
      _v.subVectors(pos, dr.pos);
      const len = _v.length();
      if (len > BEAM_LEN || len < 0.5) continue;
      const yaw = dr.g.rotation.y;
      _a.set(Math.sin(yaw) * Math.sin(BEAM_TILT), -Math.cos(BEAM_TILT), Math.cos(yaw) * Math.sin(BEAM_TILT));
      if (_v.dot(_a) / len > Math.cos(BEAM_ANGLE)) { lit = true; dr.hot = 1; }
    }
    for (const dr of L.drones) {
      dr.hot = Math.max(0, (dr.hot || 0) - dt * 2);
      dr.cone.material.color.setHex(dr.hot > 0.2 ? 0xff4050 : 0xdfe8ff);
    }
    this.spotted = clamp(this.spotted + (lit ? (dt / 0.8) * d.fill : -dt * 0.6), 0, 1);
    if (lit && !this.toldBeam) { this.toldBeam = true; hud.toast('A drone!', 'Get out of the searchlight before it gets a good look at you.', 'var(--red)', 3); }
    hud.setMeter(this.spotted, this.spotted > 0.01 ? 'IN THE SEARCHLIGHT! Get out of the beam' : this.boostT > 0 ? 'Boost!' : '', this.spotted > 0.01 ? 'var(--red)' : '#ff7a2a');
    if (this.spotted >= 1) this._caught('Spotted', 'A Kurogane drone got a good look at you and the whole tower went on alert. Steer round the searchlight beams.');
  }

  _finish(bullseye) {
    if (this.done) return;
    this.done = true;
    const s = this.state;
    s.model.flying = null;
    s.cam.roll = 0;
    s.game.hud.setMeter(0, '');
    if (bullseye) { earn(s.game, 300, '', { quiet: true }); s.game.hud.toast('Bullseye!', 'Right on the helipad: +$300', 'var(--safe)', 3); }
    audio.sfx('win');
    finishPart(s, this);
  }

  adminSkip() { this._finish(false); }

  teardown() {
    const s = this.state;
    if (s.model) { s.model.flying = null; s.model.setOutfit(null); }
    if (s.cam) {
      s.cam.roll = 0;
      if (this.camDist) s.cam.distance = this.camDist;
    }
    if (this.wasFirstPerson) s.setFirstPerson?.(true);
  }
}

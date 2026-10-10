import * as THREE from 'three';
import { buildChapter23Balloon, terrainH, windAt, LAYERS, LANDING, LANDING_R, PLATEAU } from '../../world/levels/chapter23Balloon.js';
import { buildBalloon, setBurner } from '../../vehicles/balloon.js';
import { PlayerModel } from '../../player/playerModel.js';
import { crewLook } from '../../player/people.js';
import { currentLook } from '../../player/outfits.js';
import { CHAPTERS } from '../../story/chapters.js';
import { getChapterRun } from '../../story/chapterRun.js';
import { finishPart } from '../../story/chapterFlow.js';
import { admin } from '../../core/admin.js';
import { diff } from '../../core/difficulty.js';
import { formatTime, clamp, damp } from '../../core/utils.js';
import { audio } from '../../core/audio.js';

// Chapter 23, Part 2: THE BALLOON (part id 'balloon').
//
// Fly Juno's hot-air balloon from the fiesta field to the flat top of the
// mountain and land by the old ventilation shaft. You can't steer a
// balloon: you can only go up (the burner: W or Jump) or down (the vent: S
// or C, or just let the air cool). But the wind blows a different way at
// each height (LAYERS), so you pick where to go by picking a height. The
// panel shows each layer's wind as an arrow, as seen from where you're
// looking; the other balloons drift with their layer too.
//   - Hit the mountainside and you stop against it: go up.
//   - Three Jackal lookouts sweep the sky with searchlights: stay in a
//     beam and the meter fills. Full = spotted (back to the checkpoint).
//   - Gas runs out if you burn all the time. Land too hard and you bounce.
//   - Drift too far off and Juno turns back (back to the checkpoint).

const HEAT_UP = 0.32, COOL = 0.055, VENT = 0.3;   // per second
const CLIMB = 12;          // m/s of climb (or sink) per unit of heat away from 0.5
const GAS = 95;            // seconds of burner in a full tank
const BEAM_LEN = 420, BEAM_HALF = 0.085;
const HARD = 3.6;          // touch down faster than this (m/s) = a bump
const _v = new THREE.Vector3(), _w = { x: 0, z: 0 }, _f = new THREE.Vector3(), _r = new THREE.Vector3();
const stand = (x, z, facing) => ({ pos: new THREE.Vector3(x, 0.08, z), vel: new THREE.Vector3(), facing, state: 'ground', horizontalSpeed: 0, mantleProgress: 0, stateTime: 0, stumbleTimer: 0, mantle: null, wallRun: null });

export class BalloonMode {
  constructor(state, params) {
    this.state = state;
    this.chapter = CHAPTERS[params.chapterId || 'chapter23'];
    this.partIndex = params.part ?? 1;
    this.part = this.chapter.parts[this.partIndex];
    this.hudSections = ['tl', 'meter', 'controls', 'marker'];
    this.weather = 'clear';
    this.weatherForced = true;
    this.time = this.part.time || 'dusk';
    this.indoors = true;
  }

  get inputLocked() { return true; }
  get fallY() { return -60; }

  build() {
    const L = buildChapter23Balloon();
    this.level = L;
    this.balloon = buildBalloon({ colors: ['#7a2ac8', '#ffc030', '#e8e0f0'] });
    L.group.add(this.balloon);
    this.me = new PlayerModel();
    this.me.setLook(currentLook(this.state.game.settings));
    this.mePose = stand(0.38, -0.1, Math.PI);
    this.juno = new PlayerModel(crewLook('juno'), { bag: false });
    this.junoPose = stand(-0.38, 0.1, Math.PI);
    this.balloon.add(this.me.root, this.juno.root);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    return L;
  }

  _setupCamera() {
    const s = this.state;
    this.wasFirstPerson = s.cam.firstPerson;
    if (this.wasFirstPerson) s.setFirstPerson(false);
    s.model.root.visible = false;
    this.camDist = s.cam.distance;
    s.cam.distance = 24;
    s.cam.groundFn = terrainH;
    this._camSet = true;
  }

  start(first) {
    const s = this.state;
    if (!this._camSet) this._setupCamera();
    this.run = getChapterRun(s.game, this.chapter.id);
    this.done = false;
    this.cp = 0;
    this.cpState = null;
    this.told = {};
    this.t = 0;
    this._placeAt(0);
    // look towards the mountain
    s.cam.yaw = Math.atan2(-LANDING.x, -LANDING.z);
    s.cam.pitch = -0.1;
    const hud = s.game.hud;
    if (first) hud.showControls(`Hold <kbd>W</kbd> or <kbd>Space</kbd>: burner (go up) &nbsp; hold <kbd>S</kbd> or <kbd>C</kbd>: vent (go down)<br>
      Pick a height where the wind blows towards the mountain &nbsp; mouse: look round &nbsp; <kbd>R</kbd> checkpoint &nbsp; <kbd>P</kbd> pause`);
    hud.setPhase(`${this.chapter.title} · Part ${this.partIndex + 1}: ${this.part.title}`);
    hud.setObjective(this.part.objective);
    if (first && !s.game.speedrun) s.showStoryCards(this.part.intro, this.part.startLabel || 'Go');
  }

  _placeAt(cp) {
    const c = cp ? this.cpState : null;
    if (c) { this.pos.copy(c.pos); this.fuel = c.fuel; this.heat = 0.5; }
    else { this.pos.set(0, terrainH(0, 0), 0); this.fuel = 1; this.heat = 0.35; }
    this.vel.set(0, 0, 0);
    this.vy = 0;
    this.spotted = 0;
    this.far = 0;
    this.landedT = 0;
    this.grounded = !c;
    this.burning = false;
  }

  _fail(title, msg) {
    if (admin.flag('god') && title !== 'Out of gas') { this.spotted = 0; this.far = 0; return; }
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
    return { engine: 0, siren: 0, wind: 0.25 + (this.burning ? 0.55 : 0), city: 0.08, music: 0.5, intensity: 0.35 + this.spotted * 0.55 };
  }

  _tell(key, title, text, color = 'var(--amber)', t = 4) {
    if (this.told[key]) return;
    this.told[key] = true;
    this.state.game.hud.toast(title, text, color, t);
  }

  update(dt) {
    if (this.done) return;
    const s = this.state, input = s.game.input, hud = s.game.hud, L = this.level, pos = this.pos;
    this.t += dt;

    // --- Burner and vent
    const burn = (input.isDown('forward') || input.isDown('jump')) && this.fuel > 0;
    const vent = input.isDown('back') || input.isDown('crouch');
    if (burn && !this.burning) audio.sfx('whoosh', { vol: 0.5, rate: 0.45 });
    this.burning = burn;
    if (burn) { this.heat += HEAT_UP * dt; this.fuel = Math.max(0, this.fuel - dt / GAS); } else this.heat -= COOL * dt;
    if (vent) this.heat -= VENT * dt;
    this.heat = clamp(this.heat, 0, 1);
    this.vy = damp(this.vy, (this.heat - 0.5) * CLIMB, 0.9, dt);
    if (pos.y > 380) this.vy = Math.min(this.vy, 0);

    // --- The wind takes you (on the ground, you sit still)
    windAt(pos.y, _w);
    this.vel.x = damp(this.vel.x, this.grounded ? 0 : _w.x, this.grounded ? 4 : 0.45, dt);
    this.vel.z = damp(this.vel.z, this.grounded ? 0 : _w.z, this.grounded ? 4 : 0.45, dt);
    const ox = pos.x, oz = pos.z;
    pos.x += this.vel.x * dt;
    pos.z += this.vel.z * dt;
    // the mountainside stops you (you can't scrape your way up it)
    let g = terrainH(pos.x, pos.z);
    if (g > pos.y + 0.4 && !this.grounded) {
      pos.x = ox; pos.z = oz;
      this.vel.x = this.vel.z = 0;
      g = terrainH(pos.x, pos.z);
      this._tell('slope', 'The mountain!', 'Juno: "We\'re scraping the mountainside! Burner! Up, up!"', 'var(--amber)', 3);
    }
    pos.y += this.vy * dt;
    const wasGround = this.grounded;
    if (pos.y <= g) {
      if (!wasGround && this.vy < -HARD && !admin.flag('god')) {
        audio.sfx('land', { vol: 1 });
        s.cam.addLandingDip?.(6);
        this.vy = 1.6;
        this.heat = Math.max(this.heat, 0.45);
        hud.toast('Bump!', 'Juno: "Ow! Gently! Vent a little at a time and come down slowly."', 'var(--amber)', 2.5);
        pos.y = g + 0.05;
        this.grounded = false;
      } else {
        pos.y = g;
        this.vy = Math.max(0, this.vy);
        this.grounded = this.heat < 0.52;
      }
    } else this.grounded = false;

    // --- The balloon, you and Juno in the basket
    this.balloon.position.copy(pos);
    this.balloon.rotation.z = damp(this.balloon.rotation.z, clamp(-this.vel.x * 0.006, -0.05, 0.05), 2, dt);
    setBurner(this.balloon, burn ? 1 : 0, this.t);
    this.me.update(dt, this.mePose);
    this.juno.update(dt, this.junoPose);
    s.player.teleport(pos.x, pos.y + 7, pos.z, 0);

    // --- The other balloons: drifting with their winds (and their burners flaring now and then)
    for (const f of L.fliers) {
      windAt(f.y, _w);
      f.mesh.position.x += _w.x * dt;
      f.mesh.position.z += _w.z * dt;
      f.mesh.position.y = f.y + Math.sin(this.t * 0.4 + f.t) * 1.2;
      if (f.mesh.position.x > 800) f.mesh.position.x -= 1400; else if (f.mesh.position.x < -600) f.mesh.position.x += 1400;
      if (f.mesh.position.z > 350) f.mesh.position.z -= 1700; else if (f.mesh.position.z < -1350) f.mesh.position.z += 1700;
      setBurner(f.mesh, Math.sin(this.t * 0.7 + f.t * 3) > 0.93 ? 1 : 0, this.t);
    }
    for (const [i, b] of L.parked.entries()) setBurner(b, Math.sin(this.t * 0.9 + i * 1.7) > 0.95 ? 1 : 0, this.t);

    // --- The searchlights
    let lit = false;
    for (const lk of L.lookouts) {
      const yaw = lk.phase + this.t * lk.speed, pitch = 0.42 + 0.3 * Math.sin(this.t * 0.45 + lk.phase);
      lk.dir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
      lk.beam.lookAt(_v.copy(lk.origin).add(lk.dir));
      const r = Math.tan(BEAM_HALF) * BEAM_LEN;
      lk.beam.scale.set(r, r, BEAM_LEN);
      _v.set(pos.x, pos.y + 11, pos.z).sub(lk.origin);
      const d = _v.length();
      if (d < BEAM_LEN && Math.acos(clamp(_v.dot(lk.dir) / d, -1, 1)) < BEAM_HALF + 6.5 / d) lit = true;
    }
    if (admin.flag('unseen')) lit = false;
    this.spotted = clamp(this.spotted + (lit ? (dt / 1.6) * diff().fill : -dt * 0.4), 0, 1);
    if (this.spotted >= 1) {
      this._fail('Spotted', 'A lookout held the balloon in its searchlight, and the whole mountain knows you\'re coming. Change height to get out of a beam (they sweep round: wait for them to pass).');
      return;
    }

    // --- Off course?
    const lx = LANDING.x, lz = LANDING.z, len2 = lx * lx + lz * lz;
    const k = clamp((pos.x * lx + pos.z * lz) / len2, 0, 1);
    const off = Math.hypot(pos.x - lx * k, pos.z - lz * k);
    if (off > 600 || pos.z > 230) this.far += dt; else this.far = Math.max(0, this.far - dt);
    if (this.far > 7) { this._fail('Too far', 'Juno: "We\'ve drifted miles off. I\'m taking us back." Pick a height where the wind blows towards the mountain (the panel shows it).'); return; }

    // --- Gas
    if (this.fuel <= 0) {
      this._tell('nogas', 'Out of gas!', 'Juno: "That\'s the last of the gas! We\'re coming down wherever we are..."', 'var(--red)', 3);
      if (this.grounded && Math.hypot(pos.x - lx, pos.z - lz) > LANDING_R) { this._fail('Out of gas', 'The gas ran out and the balloon came down in the desert. Don\'t burn all the time: a short burst, then let it float.'); return; }
    } else if (this.fuel < 0.2) this._tell('lowgas', 'Low on gas', 'Juno: "Not much gas left. Short bursts!"', 'var(--amber)', 3);

    // --- Checkpoint, landing
    const toGoal = Math.hypot(pos.x - lx, pos.z - lz);
    if (this.cp === 0 && toGoal < 380) {
      this.cp = 1;
      this.cpState = { pos: new THREE.Vector3(pos.x, Math.max(pos.y, terrainH(pos.x, pos.z) + 15), pos.z), fuel: Math.max(this.fuel, 0.5) };
      audio.sfx('checkpoint', { vol: 0.5 });
      hud.toast('Checkpoint', 'Nearly there: the mountain.', 'var(--cyan)', 2.5);
    }
    L.ring.rotation.z += dt * 0.5;
    if (this.grounded && toGoal < LANDING_R) {
      this.landedT += dt;
      if (this.landedT > 1.1) { this._finish(); return; }
    } else this.landedT = 0;
    if (this.grounded && pos.y > PLATEAU - 3 && toGoal >= LANDING_R) this._tell('ring', 'Not here', 'Juno: "Over there, by the shaft! The green ring." (A little burner, and let the wind carry you.)', 'var(--amber)', 3.5);

    // --- The meter: spotted > drifting off > heat
    if (this.spotted > 0.02) hud.setMeter(this.spotted, lit ? 'IN A SEARCHLIGHT! Change height' : 'Out of the light', lit ? 'var(--red)' : '#8a8f9c');
    else if (this.far > 0.2) hud.setMeter(this.far / 7, 'DRIFTING OFF COURSE! Find another wind', 'var(--red)');
    else hud.setMeter(this.heat, burn ? 'Burner: going up' : vent ? 'Vent open: going down' : this.vy > 0.3 ? 'Rising' : this.vy < -0.3 ? 'Sinking' : 'Floating', burn ? '#ffb040' : 'var(--cyan)');

    hud.setMarker(_v.set(lx, LANDING.y + 4, lz), s.camera, 'The shaft', 'var(--safe)', toGoal);
    this._stats(pos, toGoal);
  }

  /** The panel: height, gas, and every wind layer as an arrow (as seen from where the camera looks). */
  _stats(pos, toGoal) {
    const s = this.state;
    s.cam.getForward(_f); s.cam.getRight(_r);
    const gx = LANDING.x - pos.x, gz = LANDING.z - pos.z, gl = Math.hypot(gx, gz) || 1;
    const here = LAYERS.findIndex((Lr) => pos.y < Lr.y1);
    const layers = LAYERS.map((Lr, i) => {
      const [wx, wz] = Lr.dir;
      const ang = Math.atan2(wx * _r.x + wz * _r.z, wx * _f.x + wz * _f.z) * 180 / Math.PI;
      const good = (wx * gx + wz * gz) / gl > 0.8;
      const label = i === 0 ? 'low' : `${Lr.y0} m`;
      const me = i === here;
      return `<span style="${me ? 'outline:1px solid #ffd070;' : ''}${good ? 'color:#4dffa6' : ''}"><b style="display:inline-block;transform:rotate(${Math.round(ang)}deg)">↑</b> ${label}${me ? ' (you)' : ''}</span>`;
    }).reverse().join('');
    const agl = Math.max(0, pos.y - terrainH(pos.x, pos.z));
    s.game.hud.setStats(`<span>Height <b>${Math.round(pos.y)} m</b></span><span>Above ground <b>${Math.round(agl)} m</b></span>` +
      `<span${this.fuel < 0.2 ? ' class="warn"' : ''}>Gas <b>${Math.round(this.fuel * 100)}%</b></span><span>Shaft <b>${Math.round(toGoal)} m</b></span>` +
      `<span>Time <b>${formatTime(s.time)}</b></span>${layers}`);
  }

  _finish() {
    if (this.done) return;
    this.done = true;
    const s = this.state;
    setBurner(this.balloon, 0);
    s.game.hud.setMeter(0, '');
    audio.sfx('win');
    finishPart(s, this);
  }

  adminSkip() { this._finish(); }

  teardown() {
    const s = this.state;
    if (s.model) s.model.root.visible = !s.cam?.firstPerson;
    if (s.cam) { s.cam.groundFn = null; if (this.camDist) s.cam.distance = this.camDist; }
    if (this.wasFirstPerson) s.setFirstPerson?.(true);
  }
}

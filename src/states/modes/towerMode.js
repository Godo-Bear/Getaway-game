import * as THREE from 'three';
import { buildChapter21Tower, DECKS, SLABS, LIFT, ROPE, PARK_ROUTES, DECK1_ROUTES, PARK_START } from '../../world/levels/chapter21Tower.js';
import { GuardSquad, huntMessages } from '../../ai/guards.js';
import { Searchlight } from '../../ai/searchlight.js';
import { POLICE_LOOK } from '../../player/people.js';
import { makeGlowMaterial } from '../../world/materials.js';
import { CHAPTERS } from '../../story/chapters.js';
import { getChapterRun } from '../../story/chapterRun.js';
import { finishPart } from '../../story/chapterFlow.js';
import { admin } from '../../core/admin.js';
import { diff } from '../../core/difficulty.js';
import { formatTime, clamp, dampAngle } from '../../core/utils.js';
import { noteCaught } from '../../core/jail.js';
import { audio } from '../../core/audio.js';

// Chapter 21, the Iron Tower. Two parts:
//
//  THE PARK (part id 'park'): the park round the tower is full of police.
//   Sneak up through it (the hedges hide you if you crouch behind them; the
//   police helicopter's searchlight sweeps the lawns), up the zig-zag stair
//   in the west leg, past the two officers on deck 1, and ride the lift up
//   to deck 2.
//
//  THE TOWER (part id 'tower'): from deck 2 to the top. Four ladders, each up
//   the edge of a little maintenance platform, round the four sides as the
//   tower narrows. Up here the WIND gusts: when it's coming, crouch (C) or
//   hang on to a ladder, or it blows you off the platform. The police
//   helicopter's searchlight hunts up and down the tower: keep out of it.
//   At the top, grab the rope ladder under Juno's helicopter (E).

const GUST_EVERY = [6, 10], GUST_WARN = 1.6, GUST_FOR = 2.4;
const BEAM_R = 3.6;           // the helicopter's beam: how wide it is at the tower
const FALL = 7;               // drop further than this and it's back to the checkpoint
const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _c = new THREE.Vector3();
const yawTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z) - Math.PI;

export class TowerMode {
  constructor(state, params) {
    this.state = state;
    this.chapter = CHAPTERS[params.chapterId || 'chapter21'];
    this.partIndex = params.part ?? 4;
    this.part = this.chapter.parts[this.partIndex];
    this.park = this.part.id === 'park';
    this.hudSections = ['tl', 'meter', 'controls', 'marker'];
    this.weather = 'clear';
    this.weatherForced = true;
    this.time = this.part.time || 'dusk';
    this.indoors = true; // (no "climb back up to the roofs" ladder helper: the marker shows the way)
  }

  get officers() { return this.guards; }
  get fallY() { return -10; }

  build() {
    const L = buildChapter21Tower();
    this.level = L;
    const cp = (pos, yaw, name) => ({ spawn: pos, yaw, name });
    if (this.park) {
      L.checkpoints = [
        cp(PARK_START.clone(), yawTo(PARK_START, new THREE.Vector3(0, 0, 0)), 'The park'),
        cp(new THREE.Vector3(-10.4, DECKS[0].y + 0.05, 0), -Math.PI / 2, 'Deck 1'),
      ];
      this.guards = new GuardSquad(L.group, L.world, PARK_ROUTES.map((route) => ({ route })), { sight: diff().guardSight, look: POLICE_LOOK, range: 13, alertRange: 17 });
      this.patrols = new GuardSquad(L.group, L.world, DECK1_ROUTES.map((route) => ({ route })), { sight: diff().guardSight, look: POLICE_LOOK, range: 10, alertRange: 13, groundFrom: DECKS[0].y + 1.3 });
      // the police helicopter's searchlight, sweeping the lawns
      this.sweep = new Searchlight(L.group, L.world, { x: 0, z: 70, h: 45, path: [[-30, 60], [20, 90], [35, 40], [-10, 30], [-45, 85], [10, 105], [30, 70], [-25, 45]] });
      this.sweep.speed = 5;
    } else {
      if (L.tower.dots) L.tower.dots.visible = false; // (the lights along the edges: lovely from the park, blinding up close)
      L.checkpoints = [
        cp(new THREE.Vector3(5.2, DECKS[1].y + 0.05, 0.6), Math.PI / 2, 'Deck 2'),
        cp(new THREE.Vector3(-3.05, SLABS[1].y + 0.05, 0), -Math.PI / 2, 'Halfway up'),
      ];
      // the police helicopter's beam: a cone from the helicopter to the tower
      const coneGeo = new THREE.CylinderGeometry(0.3, BEAM_R, 1, 20, 1, true);
      coneGeo.translate(0, -0.5, 0);
      this.beam = new THREE.Mesh(coneGeo, makeGlowMaterial(0xdfe8ff, 0.12));
      this.beam.frustumCulled = false;
      L.group.add(this.beam);
      this.beamLight = new THREE.SpotLight(0xdfe8ff, 900, 90, 0.12, 0.4, 1.4);
      L.group.add(this.beamLight, this.beamLight.target);
      // wind streaks (thin white lines that fly past during a gust)
      this.streaks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.03, 0.03, 2.6), makeGlowMaterial(0xffffff, 0.35), 24);
      this.streaks.frustumCulled = false;
      this.streaks.count = 0;
      L.group.add(this.streaks);
      this.streakPos = Array.from({ length: 24 }, () => new THREE.Vector3());
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
    this.t = 0;
    this._reset();
    const hud = s.game.hud;
    if (first) {
      hud.showControls(this.park
        ? `<kbd>WASD</kbd> move &nbsp; <kbd>C</kbd> crouch (behind the hedges) &nbsp; <kbd>E</kbd> knock out from behind<br>Walk into the lift and wait &nbsp; <kbd>P</kbd> pause`
        : `<kbd>WASD</kbd> move &nbsp; walk into a ladder to climb &nbsp; <kbd>C</kbd> crouch: brace against the wind<br><kbd>E</kbd> grab the rope ladder &nbsp; <kbd>P</kbd> pause`);
    }
    hud.setPhase(`${this.chapter.title} · Part ${this.partIndex + 1}: ${this.part.title}`);
    hud.setObjective(this.part.objective);
    if (first && !s.game.speedrun) s.showStoryCards(this.part.intro, this.part.startLabel || 'Go');
  }

  _reset() {
    const s = this.state;
    this.spotted = 0;
    this.peakY = null;
    this.guards?.reset();
    this.patrols?.reset();
    this.sweep?.reset();
    this.gust = null;
    this.nextGust = 4;
    this.beamY = 70;
    this.beamGoal = 70;
    this.beamHold = 0;
    s.player.drift.set(0, 0, 0);
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
    const high = clamp((this.state.player.pos.y - 20) / 80, 0, 1);
    return { wind: 0.2 + high * 0.5 + (this.gust?.on ? 0.4 : 0), city: 0.35 * (1 - high), engine: 0, siren: 0.15, music: 0.5, intensity: 0.4 + this.spotted * 0.5 };
  }

  update(dt) {
    if (this.done) return;
    const s = this.state, L = this.level, p = s.player, pos = p.pos, hud = s.game.hud, input = s.game.input;
    this.t += dt;
    this._lift(dt);
    this._scenery(dt);

    // --- Falls: drop too far and it's back to the last checkpoint
    if (!p.grounded && p.state !== 'ladder') this.peakY = Math.max(this.peakY ?? pos.y, pos.y);
    else {
      if (this.peakY != null && this.peakY - pos.y > FALL && !admin.flag('god')) { this._toCheckpoint('You fell!', this.park ? 'Back to the last checkpoint.' : 'The wind took you. When a gust is coming, crouch (C) or hold on to a ladder.', 'var(--amber)'); return; }
      this.peakY = null;
    }

    if (this.park) this._updatePark(dt, p, pos, hud, input);
    else this._updateTower(dt, p, pos, hud, input);
  }

  // ================================================================== the park and deck 1
  _updatePark(dt, p, pos, hud, input) {
    const s = this.state, L = this.level, d = diff();
    // the helicopter flies its searchlight round the lawns
    this.sweep.update(dt);
    const a = this.t * 0.25;
    this.sweep.lamp.set(this.sweep.spot.x + Math.cos(a) * 18, 45, this.sweep.spot.z + Math.sin(a) * 18);
    this.sweep.head.position.copy(this.sweep.lamp);
    L.police.position.copy(this.sweep.lamp).add(_v.set(0, 2, 0));
    L.police.rotation.y = a + Math.PI / 2;
    L.police.userData.rotor.rotation.y += dt * 30;
    const lit = !s.concealed && this.sweep.lights(pos, p.height);
    const seenG = this.guards.update(dt, p, s.concealed);
    const seenD = this.patrols.update(dt, p, s.concealed);
    if (lit) this.guards.alarmAt(pos);
    const searching = huntMessages(this.guards, hud, 'police') || huntMessages(this.patrols, hud, 'police');
    const seen = lit || seenG || seenD;
    this.spotted = clamp(this.spotted + (seen ? (dt / (lit ? 0.9 : 0.8)) * d.fill : -dt * 0.5), 0, 1);
    if (this.spotted > 0.01) hud.setMeter(this.spotted, lit ? 'IN THE SEARCHLIGHT!' : seen ? 'A police officer can see you!' : searching || 'Hidden', seen ? 'var(--red)' : '#ff7a1a');
    else if (searching) hud.setMeter(0, searching, '#ff7a1a');
    else hud.setMeter(0, '');
    if (this.spotted >= 1) { this._caught('Caught', lit ? 'The helicopter\'s searchlight found you. Keep off the open lawns when it\'s near, or get behind a hedge or a tree.' : 'A police officer saw you. Crouch (C) behind the hedges and wait for them to turn away, or knock one out from behind (E).'); return; }

    // checkpoint: up on deck 1
    if (this.cp === 0 && p.grounded && pos.y > DECKS[0].y - 0.5 && pos.y < DECKS[0].y + 2) { this.cp = 1; audio.sfx('checkpoint', { vol: 0.5 }); hud.toast('Checkpoint', 'Deck 1. Two police up here. The lift is on the far (east) side.', 'var(--cyan)', 3.5); }
    // knock someone out
    const ko = this.guards.takedownTarget(p) || this.patrols.takedownTarget(p);
    s.setAction(ko ? 'Knock out' : null);
    if (ko && input.wasPressed('interact')) {
      (this.guards.units.includes(ko) ? this.guards : this.patrols).takedown(ko);
      s.setAction(null);
      audio.sfx('land', { vol: 1 });
      hud.toast('Knocked out', '', 'var(--amber)', 1.5);
    }
    // done: off the lift onto deck 2
    if (pos.y > DECKS[1].y - 0.6 && p.grounded) { this._finish(); return; }
    // the marker
    let t, label;
    if (pos.y < DECKS[0].y - 1) { t = _v.copy(L.stairStart).setY(1.5); label = 'The stair up the west leg'; }
    else if (L.lift.carries(p)) { t = _v.set(LIFT.x, DECKS[1].y + 1.5, LIFT.z); label = 'Going up...'; }
    else { t = _v.set(LIFT.x, L.lift.pos.y + 1.2, LIFT.z); label = L.lift.pos.y > DECKS[0].y + 1 ? 'The lift (wait for it)' : 'The lift'; }
    hud.setMarker(t, s.camera, label, 'var(--amber)', Math.hypot(t.x - pos.x, t.z - pos.z));
    this._stats();
  }

  // ================================================================== the climb
  _updateTower(dt, p, pos, hud, input) {
    const s = this.state, L = this.level, d = diff();
    // on a ladder: the camera swings round behind you (you may have walked into it from the other side)
    if (p.state === 'ladder' && p.ladder) s.cam.yaw = dampAngle(s.cam.yaw, Math.atan2(p.ladder.nx, p.ladder.nz), 4, dt);
    // --- The wind
    const g = this._wind(dt, p, pos, hud);
    // --- The police helicopter's beam, hunting up and down the tower
    const lit = this._beam(dt, p, pos);
    this.spotted = clamp(this.spotted + (lit ? (dt / 1.1) * d.fill : -dt * 0.5), 0, 1);
    if (this.spotted > 0.01) hud.setMeter(this.spotted, 'IN THE HELICOPTER\'S LIGHT! Climb out of it', 'var(--red)');
    else if (g) hud.setMeter(g.k, g.label, g.color);
    else hud.setMeter(0, '');
    if (this.spotted >= 1) { this._caught('Spotted', 'The helicopter held its light on you and told the police where you were. Keep moving up or down out of the beam when it comes your way.'); return; }

    // --- Checkpoint halfway
    if (this.cp === 0 && p.grounded && Math.abs(pos.y - SLABS[1].y) < 0.6) { this.cp = 1; audio.sfx('checkpoint', { vol: 0.5 }); hud.toast('Checkpoint', 'Halfway up. Two more ladders.', 'var(--cyan)', 2.5); }

    // --- The rope ladder at the top
    const atRope = Math.hypot(pos.x - ROPE.x, pos.z - ROPE.z) < 1.5 && pos.y > DECKS[2].y - 0.5;
    s.setAction(atRope ? 'Grab the rope ladder' : null);
    if (atRope && input.wasPressed('interact')) { this._finish(); return; }

    // --- The marker: the next ladder, or the rope
    const lv = [{ y: DECKS[1].y }, ...SLABS, DECKS[2]];
    let next = lv.findIndex((x, i) => i > 0 && pos.y < x.y - 0.6);
    let t, label;
    if (next < 0) { t = _v.copy(ROPE).setY(DECKS[2].y + 1.5); label = 'Juno\'s rope ladder'; }
    else {
      const sl = next <= SLABS.length ? SLABS[next - 1] : { w: DECKS[2].w, side: [0, -1] };
      const [sx, sz] = sl.side ?? [0, -1];
      t = _v.set(sx * (sl.w + 0.4), lv[next - 1].y + 1.2, sz * (sl.w + 0.4));
      label = next === lv.length - 1 ? 'The last ladder' : 'The next ladder';
    }
    hud.setMarker(t, s.camera, label, 'var(--amber)', Math.hypot(t.x - pos.x, t.z - pos.z));
    this._stats();
  }

  /** The wind: every few seconds a gust (with a warning first). Returns what the meter should say, or null. */
  _wind(dt, p, pos, hud) {
    const s = this.state, high = clamp((pos.y - 50) / 50, 0, 1);
    if (!this.gust) {
      this.nextGust -= dt;
      if (this.nextGust <= 0) {
        const a = Math.random() * Math.PI * 2;
        this.gust = { dir: new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), t: 0, on: false };
        audio.sfx('whoosh', { vol: 0.5, rate: 0.6 });
      }
    }
    let out = null;
    const braced = p.height < 1.3 || s.game.input.isDown('crouch') || p.state === 'ladder' || p.state === 'mantle'; // (holding crouch counts at once)
    if (this.gust) {
      const G = this.gust;
      G.t += dt;
      G.on = G.t > GUST_WARN;
      if (!this.toldWind) { this.toldWind = true; hud.toast('Wind!', 'Kitsu: "It\'s blowing hard up there. When a gust is coming, crouch (C) or hang on to a ladder!"', 'var(--amber)', 4); }
      // which way it'll push you, on screen (relative to where you're looking)
      s.camera.getWorldDirection(_d);
      const rel = Math.atan2(G.dir.x, G.dir.z) - Math.atan2(_d.x, _d.z);
      const arrow = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'][((Math.round(-rel / (Math.PI / 4)) % 8) + 8) % 8];
      if (!G.on) out = { k: G.t / GUST_WARN, label: `GUST COMING ${arrow} Crouch (C)!`, color: 'var(--amber)' };
      else out = { k: 1 - (G.t - GUST_WARN) / GUST_FOR, label: braced ? `Gust ${arrow}: braced` : `GUST ${arrow} CROUCH!`, color: braced ? 'var(--safe)' : 'var(--red)' };
      if (G.on && !braced && !admin.flag('god')) {
        const k = Math.sin(clamp((G.t - GUST_WARN) / GUST_FOR, 0, 1) * Math.PI);
        p.drift.copy(G.dir).multiplyScalar((2 + 6.5 * high) * k);
      } else p.drift.set(0, 0, 0);
      if (G.t > GUST_WARN + GUST_FOR) { this.gust = null; this.nextGust = GUST_EVERY[0] + Math.random() * (GUST_EVERY[1] - GUST_EVERY[0]); p.drift.set(0, 0, 0); }
    }
    // streaks flying past
    const on = this.gust?.on;
    this.streaks.count = on ? 24 : 0;
    if (on) {
      const o = new THREE.Object3D(), dir = this.gust.dir;
      this.streakPos.forEach((sp, i) => {
        if (sp.distanceTo(pos) > 14 || this.gust.t - GUST_WARN < dt * 1.5) sp.set(pos.x - dir.x * 10 + (Math.random() - 0.5) * 12, pos.y + Math.random() * 6 - 1, pos.z - dir.z * 10 + (Math.random() - 0.5) * 12);
        sp.addScaledVector(dir, dt * 26);
        o.position.copy(sp);
        o.rotation.set(0, Math.atan2(dir.x, dir.z), 0);
        o.updateMatrix();
        this.streaks.setMatrixAt(i, o.matrix);
      });
      this.streaks.instanceMatrix.needsUpdate = true;
    }
    return out;
  }

  /** The police helicopter circles, holding its light at one height then moving it to another. Are you in it? */
  _beam(dt, p, pos) {
    const L = this.level;
    if ((this.beamHold -= dt) <= 0 && Math.abs(this.beamY - this.beamGoal) < 0.5) {
      this.beamHold = 1.6 + Math.random() * 1.6;
      // (mostly somewhere near you: it's looking for you)
      this.beamGoal = clamp(pos.y + 1 + (Math.random() - 0.5) * 30, DECKS[1].y, DECKS[2].y + 3);
    }
    if (this.beamHold <= 0) this.beamY += clamp(this.beamGoal - this.beamY, -7 * dt, 7 * dt);
    const a = this.t * 0.22, R = 34;
    const heli = _v.set(Math.cos(a) * R, this.beamY + 10, Math.sin(a) * R);
    L.police.position.copy(heli).add(_d.set(0, 1.5, 0));
    L.police.rotation.y = -a;
    L.police.userData.rotor.rotation.y += dt * 30;
    const target = _c.set(0, this.beamY, 0);
    const len = heli.distanceTo(target) + 6;
    _d.copy(target).sub(heli).normalize();
    this.beam.position.copy(heli);
    this.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), _d);
    this.beam.scale.set(1, len, 1);
    this.beamLight.position.copy(heli);
    this.beamLight.target.position.copy(target);
    if (admin.flag('unseen') || this.state.concealed) return false;
    // inside the cone?
    const chest = new THREE.Vector3(pos.x, pos.y + Math.min(1.2, p.height * 0.7), pos.z);
    const rel = chest.clone().sub(heli), along = rel.dot(_d);
    if (along < 0 || along > len) return false;
    const off = rel.addScaledVector(_d, -along).length();
    if (off > BEAM_R * (along / (len - 6))) return false;
    // nothing in the way? (the platforms shade you)
    const to = chest.clone().sub(heli), dist = to.length();
    to.divideScalar(dist);
    return !(L.world.raycast(heli, to, dist - 0.4) < dist - 0.4);
  }

  /** The lift: waits at the bottom, goes up, waits at the top, comes down. */
  _lift(dt) {
    const L = this.level, cyc = 24, k = (this.t + 2) % cyc;
    let f;
    if (k < 3) f = 0;
    else if (k < 12) f = (1 - Math.cos(((k - 3) / 9) * Math.PI)) / 2;
    else if (k < 15) f = 1;
    else f = (1 + Math.cos(((k - 15) / 9) * Math.PI)) / 2;
    L.lift.moveTo(_v.set(LIFT.x, LIFT.bottom + (LIFT.top - LIFT.bottom) * f, LIFT.z), this.state.player);
  }

  _scenery(dt) {
    const L = this.level, on = Math.floor(this.t * 4) % 2 === 0;
    for (const c of L.cars) { c.red.visible = on; c.blue.visible = !on; }
    L.juno.userData.rotor.rotation.y += dt * 32;
    L.juno.position.y = DECKS[2].y + 9 + Math.sin(this.t * 1.3) * 0.25;
    L.rope.rotation.z = Math.sin(this.t * 1.1) * 0.04;
  }

  _stats() {
    const s = this.state;
    s.game.hud.setStats(`<span>Height <b>${Math.round(Math.max(0, s.player.pos.y))} m</b></span><span>Time <b>${formatTime(s.time)}</b></span>` +
      `<span${this.run.caught ? ' class="warn"' : ''}>Caught <b>${this.run.caught}</b></span>`);
  }

  _finish() {
    if (this.done) return;
    this.done = true;
    const s = this.state;
    s.setAction(null);
    s.player.drift.set(0, 0, 0);
    s.game.hud.setMeter(0, '');
    audio.sfx('win');
    finishPart(s, this);
  }

  adminSkip() { this._finish(); }

  teardown() {
    const s = this.state;
    s.setAction?.(null);
    s.player?.drift.set(0, 0, 0);
    this.guards?.dispose();
    this.patrols?.dispose();
    this.sweep?.dispose();
  }
}

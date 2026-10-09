import * as THREE from 'three';
import { buildChapter22Dunes, duneHeight, routeX, CHECKPOINTS, END_Z } from '../../world/levels/chapter22Dunes.js';
import { Car, collideCarWithWorld, collideCars } from '../../vehicles/car.js';
import { buildBuggy, BUGGY_SPEC } from '../../vehicles/buggy.js';
import { ParticleSystem } from '../../vehicles/particles.js';
import { PlayerModel } from '../../player/playerModel.js';
import { crewLook, JACKAL_LOOK } from '../../player/people.js';
import { currentLook } from '../../player/outfits.js';
import { CHAPTERS } from '../../story/chapters.js';
import { getChapterRun } from '../../story/chapterRun.js';
import { finishPart } from '../../story/chapterFlow.js';
import { admin } from '../../core/admin.js';
import { diff } from '../../core/difficulty.js';
import { formatTime, clamp, wrapAngle, dampAngle, damp } from '../../core/utils.js';
import { audio } from '../../core/audio.js';

// Chapter 22, Part 1: THE DUNES (part id 'dunes').
//
// The Jackals took the Star off you the moment Juno's plane touched down on
// the dry lake, and their leader, Sable, is away across the dunes with it
// in a dune buggy. After her, in the crew's buggy, with Theo beside you.
//   - The dunes: a gentle slope up, a sharp crest, a steep drop. Hit a
//     crest at speed and you fly (big air fills your boost).
//   - Ram Sable's buggy (RAMS_NEEDED times) to wreck it before she gets to
//     the highway into Mirage Springs.
//   - Two Jackal buggies ride with her: they swing in to knock you away.
//     Hit one hard and it spins out for a while.
//   - Fall too far behind (LOSE metres for a few seconds) and she's gone.

const RAMS_NEEDED = 4;
const LOSE = 140;          // this far behind her, for LOSE_TIME seconds = lost her
const LOSE_TIME = 6;
const SLOPE_PULL = 9;      // uphill slows you, downhill speeds you up
const SABLE_SPEC = { ...BUGGY_SPEC, maxSpeed: 34, grip: 2.6 };
const ESCORT_SPEC = { ...BUGGY_SPEC, maxSpeed: 33, mass: 1.0 };
const _v = new THREE.Vector3();
const seat = (x) => ({ pos: new THREE.Vector3(x, 0.62, -0.5), vel: new THREE.Vector3(), facing: 0, state: 'ground', horizontalSpeed: 0, mantleProgress: 0, stateTime: 0, stumbleTimer: 0, mantle: null, wallRun: null });
const ground = (x, z) => duneHeight(x, z);

export class DuneMode {
  constructor(state, params) {
    this.state = state;
    this.chapter = CHAPTERS[params.chapterId || 'chapter22'];
    this.partIndex = params.part ?? 0;
    this.part = this.chapter.parts[this.partIndex];
    this.hudSections = ['tl', 'meter', 'controls', 'marker'];
    this.weather = 'clear';
    this.weatherForced = true;
    this.time = this.part.time || 'day';
    this.indoors = true;
  }

  get touchMode() { return 'driving'; }
  get inputLocked() { return true; }
  get fallY() { return -60; }

  build() {
    const L = buildChapter22Dunes();
    this.level = L;
    const buggy = (color, frame, spec, driverLook, passengerLook) => {
      const mesh = buildBuggy({ color, frame });
      L.group.add(mesh);
      const car = new Car(spec, mesh);
      car.active = true;
      const B = { car, mesh, people: [], wp: 0, dust: 0, knocked: 0, gv: null };
      for (const [look, x] of [[driverLook, 0.34], [passengerLook, -0.34]]) {
        if (!look) continue;
        const m = new PlayerModel(look, { bag: false });
        m.seated = true;
        const pose = seat(x);
        mesh.add(m.root);
        B.people.push({ m, pose });
      }
      return B;
    };
    this.you = buggy(0xff7a1a, 0x2a2b31, BUGGY_SPEC, currentLook(this.state.game.settings), crewLook('theo'));
    this.sable = buggy(0xc8202a, 0x16171b, SABLE_SPEC, crewLook('sable'), null);
    // the Star's case, strapped in beside her
    const caseM = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.6), new THREE.MeshStandardMaterial({ color: 0xc8c8cc, metalness: 0.8, roughness: 0.3 }));
    caseM.position.set(-0.34, 1.3, -0.35);
    this.sable.mesh.add(caseM);
    this.escorts = [0, 1].map(() => buggy(0x1e1f24, 0xc8202a, ESCORT_SPEC, JACKAL_LOOK, null));
    this.dust = new ParticleSystem(L.group, 700);
    this.dust.setDaylight(1);
    // the rest of the crew by the plane, watching you go
    this.crew = ['mags', 'ricky', 'juno'].map((who, i) => {
      const m = new PlayerModel(crewLook(who), { bag: false });
      m.update(0, { ...seat(0), pos: new THREE.Vector3(-22 + i * 1.6, 0, 26 - i), facing: Math.PI * 0.85 });
      L.group.add(m.root);
      return m;
    });
    return L;
  }

  _setupCamera() {
    const s = this.state;
    this.wasFirstPerson = s.cam.firstPerson;
    if (this.wasFirstPerson) s.setFirstPerson(false);
    s.model.root.visible = false;
    this.camDist = s.cam.distance;
    s.cam.distance = 9.5;
    s.cam.groundFn = ground;
    s.lighting.setSand(true);
    this._camSet = true;
  }

  start(first) {
    const s = this.state;
    if (!this._camSet) this._setupCamera();
    this.run = getChapterRun(s.game, this.chapter.id);
    this.done = false;
    this.wreck = 0;
    this.wreckRoll = 0;
    this.cp = 0;
    this.rams = 0;
    this.told = {};
    this._placeAt(0);
    const hud = s.game.hud;
    if (first) hud.showControls(`<kbd>W</kbd>/<kbd>S</kbd> throttle &nbsp; <kbd>A</kbd>/<kbd>D</kbd> steer &nbsp; <kbd>Space</kbd> boost &nbsp; <kbd>Shift</kbd> slide<br>
      Ram Sable's buggy ${RAMS_NEEDED} times &nbsp; <kbd>R</kbd> checkpoint &nbsp; <kbd>P</kbd> pause`);
    hud.setPhase(`${this.chapter.title} · Part ${this.partIndex + 1}: ${this.part.title}`);
    hud.setObjective(this.part.objective);
    if (first && !s.game.speedrun) s.showStoryCards(this.part.intro, this.part.startLabel || 'Go');
  }

  /** Put a buggy on the sand at (x, z), facing down the way. */
  _put(B, x, z) {
    const h = Math.atan2(routeX(z - 10) - routeX(z), -10);
    B.car.place(x, z, h);
    B.car.pos.y = ground(x, z);
    B.car.vel.set(0, 0, 0);
    B.car.speedFactor = 1;
    B.car.pitch = B.car.roll = 0;
    B.car.syncMesh();
    B.gv = null;
    B.knocked = 0;
    B.wp = this.level.route.findIndex((p) => p.z < z - 8);
    if (B.wp < 0) B.wp = this.level.route.length - 1;
  }

  /** Start (again) at a checkpoint: Sable ahead of you, her two Jackals beside her. */
  _placeAt(cp) {
    const s = this.state, z = CHECKPOINTS[cp].z, rx = routeX(z);
    this._put(this.you, rx, z);
    this._put(this.sable, routeX(z - 38), z - 38);
    this._put(this.escorts[0], routeX(z - 26) - 6, z - 26);
    this._put(this.escorts[1], routeX(z - 30) + 6, z - 30);
    this.fuel = 1;
    this.lost = 0;
    this.elapsed = 0;
    this.ramCool = 0;
    this.dust.clear();
    s.cam.yaw = this.you.car.heading + Math.PI;
    s.cam.pitch = -0.28;
  }

  _fail(title, msg) {
    if (admin.flag('god')) { this.lost = 0; return; }
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
    return { engine: 0.6, siren: 0, wind: 0.45, city: 0, music: 0.55, intensity: 0.6 + clamp(this.rams / RAMS_NEEDED, 0, 1) * 0.3 };
  }

  _tell(key, title, text, color = 'var(--amber)', t = 4) {
    if (this.told[key]) return;
    this.told[key] = true;
    this.state.game.hud.toast(title, text, color, t);
  }

  /**
   * One buggy's physics on the sand: drive, follow the dunes, take off over
   * a sharp crest (when the ground drops away faster than you could fall),
   * slow down uphill and speed up down.
   */
  _stepBuggy(B, dt) {
    const car = B.car;
    car.step(dt, ground);
    if (!car.airborne) {
      const gv = car._groundVy;
      if (B.gv !== null && car.speed > 10 && B.gv > -1 && (gv - B.gv) / dt < -30) {
        // over the crest: fly
        car.pos.y = B.y + B.gv * dt;
        car.airborne = true;
        car.airTime = 0;
        car.vy = B.gv;
      }
      B.gv = car.airborne ? null : gv;
      B.y = car.pos.y;
    } else B.gv = null;
    collideCarWithWorld(car, this.level.world);
    car.pos.x = clamp(car.pos.x, -205, 205);
    if (!car.airborne) {
      // lean with the slope, and let it pull you
      const fx = car.fwdX, fz = car.fwdZ, x = car.pos.x, z = car.pos.z;
      const up = (ground(x + fx * 1.2, z + fz * 1.2) - ground(x - fx * 1.2, z - fz * 1.2)) / 2.4;
      const side = (ground(x + fz * 0.9, z - fx * 0.9) - ground(x - fz * 0.9, z + fx * 0.9)) / 1.8;
      car.pitch = damp(car.pitch, -Math.atan(up), 14, dt);
      car.roll = damp(car.roll, Math.atan(side) + clamp(car.lateralSpeed * 0.012, -0.08, 0.08), 12, dt);
      car.vel.x -= fx * up * SLOPE_PULL * dt;
      car.vel.z -= fz * up * SLOPE_PULL * dt;
    }
    car.syncMesh();
    // the sand spray (a little: it's right in front of the camera)
    if (!car.airborne && car.speed > 8) {
      B.dust += dt * (1.5 + car.speed * 0.2);
      while (B.dust > 1) {
        B.dust -= 1;
        const side = Math.random() < 0.5 ? -1 : 1, back = 1.4;
        this.dust.emit(car.pos.x - car.fwdX * back + car.fwdZ * side * 0.95, car.pos.y + 0.25, car.pos.z - car.fwdZ * back - car.fwdX * side * 0.95, {
          vx: -car.vel.x * 0.1 + (Math.random() - 0.5) * 1.5, vy: 0.6 + Math.random(), vz: -car.vel.z * 0.1 + (Math.random() - 0.5) * 1.5,
          size: 0.9 + car.speed * 0.02, grow: 1.8, life: 0.8, alpha: 0.16, color: [0.8, 0.64, 0.44], drag: 2 });
      }
    }
    if (car.lastLanding) {
      const hard = car.lastLanding;
      car.lastLanding = 0;
      for (let i = 0; i < Math.min(10, hard * 0.6); i++) {
        const a = Math.random() * Math.PI * 2;
        this.dust.emit(car.pos.x + Math.cos(a) * 1.6, car.pos.y + 0.2, car.pos.z + Math.sin(a) * 1.6, {
          vx: Math.cos(a) * 4, vy: 0.8 + Math.random(), vz: Math.sin(a) * 4, size: 1.4, grow: 2.5, life: 1.0, alpha: 0.25, color: [0.8, 0.64, 0.44], drag: 2.5 });
      }
      return hard;
    }
    return 0;
  }

  update(dt) {
    if (this.done) return;
    const s = this.state, input = s.game.input, hud = s.game.hud, me = this.you.car, c = me.controls;
    this.elapsed += dt;
    this.ramCool -= dt;

    // --- You
    c.throttle = input.axis('back', 'forward');
    c.steer = input.axis('left', 'right');
    c.handbrake = input.isDown('drift');
    c.nitro = (input.isDown('jump') || input.isDown('nitro')) && this.fuel > 0.02;
    this.fuel = clamp(this.fuel + (c.nitro ? -dt / 3 : dt / 10), 0, 1);
    const airBefore = me.airTime;
    const landed = this._stepBuggy(this.you, dt);
    if (landed) {
      s.cam.addLandingDip?.(Math.min(14, landed));
      audio.sfx('land', { vol: clamp(landed / 16, 0.3, 1) });
      if (airBefore > 0.55) {
        this.fuel = clamp(this.fuel + airBefore * 0.3, 0, 1);
        if (airBefore > 1.05) hud.toast('Big air!', `${airBefore.toFixed(1)} s in the air: boost refilled.`, 'var(--cyan)', 1.6);
      }
      if (landed > 15) { me.vel.multiplyScalar(0.85); this._tell('landing', 'Ouch', 'Theo: "Easy! Hit the slopes straighter, or slower!"', 'var(--amber)', 2.5); }
    }
    audio.engine(me.speed * 1.05, Math.max(0, c.throttle));
    for (const { m, pose } of this.you.people) m.update(dt, pose);
    s.player.teleport(me.pos.x, me.pos.y + 0.05, me.pos.z, me.heading);
    s.cam.yaw = dampAngle(s.cam.yaw, me.heading + Math.PI, me.speed > 3 ? 2.6 : 0.8, dt);
    s.cam.pitch = damp(s.cam.pitch, me.airborne ? -0.4 : -0.28, 3, dt);

    // --- Sable and the Jackals
    this._sable(dt);
    for (const E of this.escorts) this._escort(E, dt);
    const cars = [me, this.sable.car, ...this.escorts.map((E) => E.car)];
    collideCars(cars, (a, b, impact) => {
      const other = a === me ? b : b === me ? a : null;
      if (!other) return;
      if (other === this.sable.car) {
        if (impact > 3.5 && this.ramCool <= 0 && !this.wreck) this._ram(impact);
        return;
      }
      const E = this.escorts.find((q) => q.car === other);
      if (E && impact > 5) {
        audio.sfx('crash', { vol: clamp(impact / 14, 0.3, 0.9) });
        s.cam.addLandingDip?.(4);
        // a hard knock spins the Jackal out for a while
        E.knocked = 2.6;
        E.car.yawRate = (Math.random() < 0.5 ? -1 : 1) * 4;
        this._tell('spun', 'Spun out!', 'Theo: "Ha! One down. It\'ll be back, though."', 'var(--safe)', 2.5);
      }
    });

    if (this.wreck) {
      this.wreck += dt;
      if (this.wreck > 2.2) this._finish();
      hud.setMeter(1, 'WRECKED!', 'var(--safe)');
      return;
    }

    // --- Keep up with her
    const gap = Math.hypot(this.sable.car.pos.x - me.pos.x, this.sable.car.pos.z - me.pos.z);
    if (gap > LOSE) this.lost += dt;
    else this.lost = Math.max(0, this.lost - dt * 2);
    if (this.lost > LOSE_TIME) {
      this._fail('She got away', 'Sable vanished into the dunes. Keep closer: boost (Space) on the straights, and take the crests straight on.');
      return;
    }
    if (this.sable.car.pos.z < END_Z) {
      this._fail('She made it', 'Sable got to the highway, and the Jackals\' pickup. Ram her buggy before she gets there.');
      return;
    }
    if (this.lost > 0.2) hud.setMeter(this.lost / LOSE_TIME, 'LOSING HER! Catch up', 'var(--red)');
    else hud.setMeter(this.rams / RAMS_NEEDED, `Rams ${this.rams} / ${RAMS_NEEDED}`, 'var(--amber)');

    // --- Places along the way
    if (me.pos.z < -560 && me.pos.z > -600) this._tell('canyon', 'The canyon', 'Theo: "Rocks! Stay on her line!"', 'var(--amber)', 2.5);
    if (me.pos.z < -1250) this._tell('cacti', 'The cactus flats', 'Theo: "Don\'t hit the cactuses! Cacti! Whatever!"', 'var(--amber)', 2.5);
    if (this.sable.car.pos.z < END_Z + 160) this._tell('road', 'The highway!', 'Kitsu: "She\'s nearly at the highway. If she gets on it, she\'s gone!"', 'var(--red)', 3);
    for (let i = this.cp + 1; i < CHECKPOINTS.length; i++) {
      if (me.pos.z < CHECKPOINTS[i].z) {
        this.cp = i;
        audio.sfx('checkpoint', { vol: 0.5 });
        hud.toast('Checkpoint', CHECKPOINTS[i].name, 'var(--cyan)', 2.5);
      }
    }

    this.dust.update(dt);
    const sp = this.sable.car.pos;
    hud.setMarker(_v.set(sp.x, sp.y + 2.4, sp.z), s.camera, 'Sable', '#ff5a4a', gap);
    hud.setStats(`<span>Boost <b>${Math.round(this.fuel * 100)}%</b></span><span>Rams <b>${this.rams}/${RAMS_NEEDED}</b></span>` +
      `<span${gap > 90 ? ' class="warn"' : ''}>Sable <b>${Math.round(gap)} m</b></span><span>Highway <b>${Math.round(Math.max(0, sp.z - END_Z))} m</b></span>` +
      `<span>Time <b>${formatTime(s.time)}</b></span>`);
  }

  _ram(impact) {
    const s = this.state, hud = s.game.hud;
    this.rams++;
    this.ramCool = 0.9;
    audio.sfx('crash', { vol: clamp(impact / 10, 0.5, 1) });
    s.cam.addLandingDip?.(6);
    const sc = this.sable.car;
    for (let i = 0; i < 12; i++) this.dust.emit(sc.pos.x, sc.pos.y + 1, sc.pos.z, { vx: (Math.random() - 0.5) * 6, vy: 2 + Math.random() * 2, vz: (Math.random() - 0.5) * 6, size: 1.2, grow: 2, life: 0.9, alpha: 0.5, color: [0.3, 0.28, 0.26], drag: 2 });
    if (this.rams >= RAMS_NEEDED) {
      // her buggy flips over in the sand
      this.wreck = 0.001;
      sc.airborne = true;
      sc.vy = 7;
      sc.controls.throttle = 0;
      audio.sfx('crash', { vol: 1 });
      hud.toast('Wrecked!', 'Sable\'s buggy flips over in a fountain of sand!', 'var(--safe)', 3);
      return;
    }
    const lines = ['Theo: "Again! Hit her again!"', 'Sable, over her shoulder: "Is that all you\'ve got?"', 'Theo: "Her buggy\'s smoking! One more!"'];
    hud.toast(`Ram ${this.rams} of ${RAMS_NEEDED}!`, lines[this.rams - 1] || '', 'var(--amber)', 2.2);
  }

  /** Sable: flat out along her line, weaving when you're right behind her; she eases off if you fall far behind. */
  _sable(dt) {
    const B = this.sable, car = B.car, me = this.you.car, route = this.level.route;
    if (this.wreck) {
      car.controls.throttle = 0;
      car.controls.steer = 0;
      this._stepBuggy(B, dt);
      // (rolling over, and over)
      this.wreckRoll = (this.wreckRoll || 0) + dt * 7 * Math.max(0, 1 - this.wreck / 1.4);
      car.roll = this.wreckRoll;
      car.syncMesh();
      return;
    }
    while (B.wp < route.length - 1 && route[B.wp].z > car.pos.z - 6) B.wp++;
    const t = route[B.wp];
    const behind = me.pos.z - car.pos.z; // (how far she's ahead of you)
    const close = Math.hypot(me.pos.x - car.pos.x, me.pos.z - car.pos.z);
    const weave = close < 22 ? Math.sin(this.elapsed * 1.6) * 7 : 0;
    const want = Math.atan2(t.x + weave - car.pos.x, t.z - car.pos.z);
    const d = wrapAngle(want - car.heading);
    car.controls.steer = clamp(-d * 2.4, -1, 1);
    car.controls.throttle = 1;
    car.controls.handbrake = false;
    // (after a ram she floors it for a moment; close behind her, she boosts now and then)
    car.controls.nitro = this.ramCool > -1.6 || (close < 18 && Math.floor(this.elapsed / 2.5) % 2 === 0);
    car.speedFactor = (behind > 90 ? 0.8 : behind > 55 ? 0.9 : close < 20 ? 1.03 : 1) * (diff().fugitive || 1);
    this._stepBuggy(B, dt);
    for (const { m, pose } of B.people) m.update(dt, pose);
    if (this.rams >= 2 && Math.random() < dt * 12) {
      this.dust.emit(car.pos.x - car.fwdX * 1.6, car.pos.y + 1.1, car.pos.z - car.fwdZ * 1.6, { vy: 1.5, size: 1, grow: 2.5, life: 1.2, alpha: 0.4, color: [0.18, 0.17, 0.16], drag: 1 });
    }
  }

  /** A Jackal: rides beside Sable, then swings in to knock you away; spins out if you hit it hard. */
  _escort(E, dt) {
    const car = E.car, me = this.you.car, route = this.level.route, i = this.escorts.indexOf(E);
    while (E.wp < route.length - 1 && route[E.wp].z > car.pos.z - 6) E.wp++;
    let tx, tz;
    const dMe = Math.hypot(me.pos.x - car.pos.x, me.pos.z - car.pos.z);
    if (E.knocked > 0) {
      E.knocked -= dt;
      car.controls.throttle = 0.2;
      car.controls.steer = 0;
      car.controls.handbrake = true;
    } else {
      // take turns: one attacks while the other rides with Sable
      const attack = dMe < 45 && Math.floor(this.elapsed / 6 + i * 0.5) % 2 === i % 2;
      if (attack) { tx = me.pos.x + me.vel.x * 0.4; tz = me.pos.z + me.vel.z * 0.4; } else {
        const sc = this.sable.car;
        tx = sc.pos.x + (i ? 7 : -7);
        tz = sc.pos.z + 10;
        if (car.pos.z < tz) { const r = route[E.wp]; tx = r.x + (i ? 7 : -7); tz = r.z; }
      }
      const want = Math.atan2(tx - car.pos.x, tz - car.pos.z), d = wrapAngle(want - car.heading);
      car.controls.steer = clamp(-d * 2.2, -1, 1);
      car.controls.throttle = Math.abs(d) > 1.8 ? 0.4 : 1;
      car.controls.handbrake = Math.abs(d) > 1.2 && car.speed > 15;
      // keep up: quicker when it's behind you
      car.speedFactor = car.pos.z > me.pos.z + 20 ? 1.18 : 1;
    }
    car.controls.nitro = false;
    this._stepBuggy(E, dt);
    for (const { m, pose } of E.people) m.update(dt, pose);
    // left far behind: it comes back from the side, out of sight
    if (car.pos.z - me.pos.z > 160) this._put(E, routeX(me.pos.z - 60) + (i ? 40 : -40), me.pos.z - 60);
  }

  _finish() {
    if (this.done) return;
    this.done = true;
    const s = this.state;
    this.you.car.controls.throttle = 0;
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

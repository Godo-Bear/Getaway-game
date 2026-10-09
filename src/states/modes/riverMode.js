import * as THREE from 'three';
import { buildChapter21River, HALF, GOAL, LOW_BRIDGES, BRIDGES, START_Z, END_Z } from '../../world/levels/chapter21River.js';
import { Car, collideCarWithWorld, collideCars } from '../../vehicles/car.js';
import { buildSpeedboat, buildPoliceBoat } from '../../vehicles/boats.js';
import { Wake } from './bayMode.js';
import { PlayerModel } from '../../player/playerModel.js';
import { crewLook } from '../../player/people.js';
import { currentLook } from '../../player/outfits.js';
import { CHAPTERS } from '../../story/chapters.js';
import { getChapterRun } from '../../story/chapterRun.js';
import { finishPart } from '../../story/chapterFlow.js';
import { admin } from '../../core/admin.js';
import { diff } from '../../core/difficulty.js';
import { formatTime, clamp, wrapAngle, dampAngle } from '../../core/utils.js';
import { noteCaught } from '../../core/jail.js';
import { audio } from '../../core/audio.js';

// Chapter 21, Part 2: THE RIVER (part id 'river').
//
// Down the river through the middle of Lumière in Paz's speedboat, with
// Inspector Delacroix's police launches after you, to the Iron Tower.
//   - Boost: Jump / Nitro (it refills).
//   - The stone bridges: steer through the arches. The narrow side arches
//     of the five-arch bridges fit your boat but not a police launch, and at
//     two of them the police have blocked the middle arch.
//   - The low iron footbridges: hold Crouch (C, or the Drift button) to
//     DUCK as you go under, or you bang your head and lose all your speed.
//     The police launches are too tall to get under: they're stuck behind
//     (new ones come out further down the river).
//   - A launch right alongside you for long = caught.

const SPEEDBOAT = { maxSpeed: 36, accel: 15, brake: 22, reverseMax: 7, grip: 2.6, driftGrip: 0.9, steerLow: 2.4, steerHigh: 1.35,
  nitroAccel: 18, nitroMaxFactor: 1.3, mass: 1, slip: 0.9 };
const LAUNCH = { maxSpeed: 32, accel: 12, brake: 22, reverseMax: 6, grip: 3, driftGrip: 1, steerLow: 2.0, steerHigh: 1.15,
  nitroAccel: 0, nitroMaxFactor: 1, mass: 1.6, slip: 0.6 };
const LAUNCH_R = 2.4;      // police launches are wide: the narrow arches stop them
const CLOSE = 11;          // alongside: the busted meter fills
const water = () => 0;
// where you start again: the boat (z), and where the police come from
const CHECKPOINTS = [
  { z: START_Z - 6, name: 'The quay' },
  { z: -330, name: 'Past the Passerelle Saint-Louis' },
  { z: -665, name: 'Past the Pont Marie' },
];
// police launches waiting further down the river: they come out as you get near
const AMBUSH = [
  { at: -280, z: -440, x: [-11, 11] },
  { at: -600, z: -760, x: [-9] },
  { at: -760, z: -900, x: [-10, 10] },
];
const _v = new THREE.Vector3(), _d = new THREE.Vector3();
const standing = (x, y, z, facing) => ({ pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(), facing, state: 'ground', horizontalSpeed: 0, mantleProgress: 0, stateTime: 0, stumbleTimer: 0, mantle: null, wallRun: null });

export class RiverMode {
  constructor(state, params) {
    this.state = state;
    this.chapter = CHAPTERS[params.chapterId || 'chapter21'];
    this.partIndex = params.part ?? 1;
    this.part = this.chapter.parts[this.partIndex];
    this.hudSections = ['tl', 'meter', 'controls', 'marker'];
    this.weather = 'clear';
    this.weatherForced = true;
    this.time = this.part.time || 'dawn';
    this.indoors = true;
  }

  get touchMode() { return 'driving'; }
  get inputLocked() { return true; }
  get fallY() { return -60; }

  build() {
    const L = buildChapter21River();
    this.level = L;
    L.spawn.yaw = 0;
    this.boatMesh = buildSpeedboat();
    L.group.add(this.boatMesh);
    this.boat = new Car(SPEEDBOAT, this.boatMesh);
    this.boat.active = true;
    this.driver = new PlayerModel();
    this.driver.setLook(currentLook(this.state.game.settings));
    this.driverPose = standing(0.45, 0.62, -0.9, 0);
    this.boatMesh.add(this.driver.root);
    this.paz = new PlayerModel(crewLook('paz'), { bag: false });
    this.pazPose = standing(-0.45, 0.62, -0.9, 0);
    this.boatMesh.add(this.paz.root);
    this.police = [];
    for (let i = 0; i < 6; i++) {
      const mesh = buildPoliceBoat();
      mesh.visible = false;
      L.group.add(mesh);
      const car = new Car(LAUNCH, mesh);
      car.active = false;
      const P = { car, mesh, on: false, target: new THREE.Vector3(), stuck: 0, behind: null };
      if (i === 0) { // (Delacroix herself, standing at the front of the first launch)
        P.who = new PlayerModel(crewLook('delacroix'), { bag: false });
        P.whoPose = standing(0, 0.7, 2.2, 0);
        mesh.add(P.who.root);
      }
      this.police.push(P);
    }
    this.wake = new Wake(L.group);
    return L;
  }

  _setupCamera() {
    const s = this.state;
    this.wasFirstPerson = s.cam.firstPerson;
    if (this.wasFirstPerson) s.setFirstPerson(false);
    s.model.root.visible = false;
    this.camDist = s.cam.distance;
    s.cam.distance = 10;
    this._camSet = true;
  }

  start(first) {
    const s = this.state;
    if (!this._camSet) this._setupCamera();
    this.run = getChapterRun(s.game, this.chapter.id);
    this.done = false;
    this.cp = 0;
    this.told = {};
    this._placeAt(0);
    const hud = s.game.hud;
    if (first) hud.showControls(`<kbd>W</kbd>/<kbd>S</kbd> throttle &nbsp; <kbd>A</kbd>/<kbd>D</kbd> steer &nbsp; <kbd>Space</kbd> boost<br>
      Hold <kbd>C</kbd> (or Drift) to DUCK under the low bridges &nbsp; <kbd>R</kbd> checkpoint &nbsp; <kbd>P</kbd> pause`);
    hud.setPhase(`${this.chapter.title} · Part ${this.partIndex + 1}: ${this.part.title}`);
    hud.setObjective(this.part.objective);
    if (first && !s.game.speedrun) s.showStoryCards(this.part.intro, this.part.startLabel || 'Go');
  }

  /** Start (again) at a checkpoint: you, the police behind you, the ambushes ahead. */
  _placeAt(cp) {
    const s = this.state, z = CHECKPOINTS[cp].z;
    this.boat.place(0, z, Math.PI);
    this.boat.vel.set(0, 0, 0);
    this.fuel = 1;
    this.busted = 0;
    this.elapsed = 0;
    this.bonked = new Set();
    this.wake.clear();
    s.cam.yaw = 0;
    for (const P of this.police) { P.on = false; P.car.active = false; P.mesh.visible = false; P.behind = null; P.stuck = 0; }
    this._launch(0, -4, z + 45, Math.PI);
    this._launch(1, 6, z + 60, Math.PI);
    this.ambushed = new Set(AMBUSH.filter((a) => a.at > z).map((a) => a.at)); // (the ones behind you already came out)
  }

  _launch(i, x, z, heading) {
    const P = this.police[i];
    if (!P) return;
    P.car.place(x, z, heading);
    P.car.vel.set(0, 0, 0);
    P.car.active = true;
    P.on = true;
    P.mesh.visible = true;
    P.stuck = 0;
    P.behind = null;
  }

  _caught(title, msg) {
    if (admin.flag('god')) { this.busted = 0; return; }
    if (noteCaught(this.state)) return; // (the third time: off to jail)
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
    const near = this.police.some((P) => P.on && P.car.pos.distanceTo(this.boat.pos) < 70);
    return { engine: 0.55, siren: near ? 0.4 : 0.1, wind: 0.3, city: 0.25, music: 0.5, intensity: 0.55 + this.busted * 0.4 };
  }

  _tell(key, title, text, color = 'var(--amber)', t = 4) {
    if (this.told[key]) return;
    this.told[key] = true;
    this.state.game.hud.toast(title, text, color, t);
  }

  update(dt) {
    if (this.done) return;
    const s = this.state, L = this.level, input = s.game.input, hud = s.game.hud, boat = this.boat, c = boat.controls;
    this.elapsed += dt;

    // --- Drive (Crouch / Drift is DUCK on this river, not a handbrake)
    c.throttle = input.axis('back', 'forward');
    c.steer = input.axis('left', 'right');
    c.handbrake = false;
    const ducking = input.isDown('crouch') || input.isDown('drift');
    c.nitro = (input.isDown('jump') || input.isDown('nitro')) && this.fuel > 0.02;
    this.fuel = clamp(this.fuel + (c.nitro ? -dt / 3.2 : dt / 8), 0, 1);
    boat.step(dt, water);
    collideCarWithWorld(boat, L.world);
    boat.pitch = -clamp(boat.forwardSpeed / 120, 0, 0.12) + Math.sin(this.elapsed * 3.1) * 0.015;
    boat.syncMesh();
    this.boatMesh.position.y = Math.sin(this.elapsed * 2.3) * 0.05;
    // you and Paz duck down in the boat
    this.driverPose.pos.y = this.pazPose.pos.y = ducking ? -0.25 : 0.62;
    this.driverPose.state = this.pazPose.state = ducking ? 'crouch' : 'ground';
    this.driver.update(dt, this.driverPose);
    this.paz.update(dt, this.pazPose);
    this.wake.emit(boat, dt);
    this.wake.update(dt);
    audio.engine(boat.speed * 1.1, Math.max(0, c.throttle));
    const p = s.player;
    p.teleport(boat.pos.x, 0.05, boat.pos.z, boat.heading);
    s.cam.yaw = dampAngle(s.cam.yaw, boat.heading + Math.PI, boat.speed > 3 ? 2.6 : 0.8, dt);

    // --- The tourist boats chug up and down
    for (const b of L.bateaux) {
      b.t += dt;
      const span = Math.abs(b.zb - b.za), k = (1 - Math.cos((b.t * b.speed / span) * Math.PI)) / 2;
      const z = b.za + (b.zb - b.za) * k, dz = z - b.z;
      L.world.moveBox(b.box, 0, 0, dz);
      b.z = z;
      b.mesh.position.set(b.x, 0, z);
      if (Math.abs(dz) > 1e-4) b.mesh.rotation.y = dz < 0 ? Math.PI : 0;
    }

    // --- The low footbridges: duck!
    let lowWarn = null;
    for (const lb of LOW_BRIDGES) {
      const ahead = boat.pos.z - lb.z; // (you're heading -z: positive = it's ahead)
      if (ahead > -2 && ahead < 55 && boat.fwdZ < 0) lowWarn = [clamp(1 - ahead / 55, 0, 1), ducking ? 'Ducking: keep holding C' : 'LOW BRIDGE! Hold C (or Drift) to duck', ducking ? 'var(--safe)' : 'var(--amber)'];
      if (Math.abs(ahead) < 2.4 && !ducking && !this.bonked.has(lb) && !admin.flag('god')) {
        this.bonked.add(lb);
        boat.vel.multiplyScalar(0.2);
        this.busted = Math.min(0.95, this.busted + 0.3);
        audio.sfx('clang', { vol: 1, rate: 0.8 });
        s.cam.addLandingDip?.(6);
        hud.toast('BONK!', 'You hit your head on the footbridge. Hold C (or the Drift button) to duck under the low bridges.', 'var(--red)', 3.5);
      }
      if (Math.abs(ahead) > 30) this.bonked.delete(lb);
    }

    // --- The police
    this._police(dt);
    collideCars([boat, ...this.police.filter((P) => P.on).map((P) => P.car)], (a, b, impact) => {
      if (impact > 7 && (a === boat || b === boat)) { this.busted = Math.min(0.95, this.busted + 0.15); audio.sfx('crash', { vol: 0.7 }); }
    });
    let close = Infinity;
    for (const P of this.police) if (P.on) close = Math.min(close, P.car.pos.distanceTo(boat.pos));
    if (close < CLOSE) {
      this.busted += dt * (boat.speed < 9 ? 0.5 : 0.17) * diff().fill;
      this._tell('megaphone', 'Delacroix', 'Through a megaphone: "Stop the boat! There is nowhere to go!"', '#d8b070', 3);
    } else this.busted = Math.max(0, this.busted - dt * 0.3);
    if (this.busted >= 1) {
      this._caught('Caught!', 'A police launch pulled alongside and they jumped aboard. Keep your speed up (Jump = boost), use the narrow side arches, and duck under the low bridges: the launches can\'t follow.');
      return;
    }
    if (this.busted > 0.02) hud.setMeter(this.busted, 'POLICE ALONGSIDE! Get away', 'var(--red)');
    else if (lowWarn) hud.setMeter(...lowWarn);
    else hud.setMeter(0, '');

    // --- Warnings: the blocked arches
    for (const b of BRIDGES) {
      if (b.block && boat.pos.z - b.z < 140 && boat.pos.z > b.z) this._tell(`block${b.z}`, `The ${b.name}`, 'Kitsu: "They\'ve blocked the middle arch! Take one of the narrow side arches: we fit, they don\'t."', 'var(--amber)', 4);
    }

    // --- Checkpoints
    for (let i = this.cp + 1; i < CHECKPOINTS.length; i++) {
      if (boat.pos.z < CHECKPOINTS[i].z) {
        this.cp = i;
        audio.sfx('checkpoint', { vol: 0.5 });
        hud.toast('Checkpoint', CHECKPOINTS[i].name, 'var(--cyan)', 2.5);
      }
    }

    // --- The landing stage under the Iron Tower
    L.goalRing.rotation.z += dt;
    if (Math.hypot(boat.pos.x - GOAL.x, boat.pos.z - GOAL.z) < 9) { this._finish(); return; }

    hud.setMarker(_v.set(GOAL.x, 3, GOAL.z), s.camera, 'The Iron Tower', 'var(--safe)', Math.hypot(GOAL.x - boat.pos.x, GOAL.z - boat.pos.z));
    const chasing = this.police.filter((P) => P.on && !P.behind).length;
    hud.setStats(`<span>Boost <b>${Math.round(this.fuel * 100)}%</b></span><span${chasing ? ' class="warn"' : ''}>Launches <b>${chasing}</b></span>` +
      `<span>Tower <b>${Math.round(Math.max(0, boat.pos.z - GOAL.z))} m</b></span><span>Time <b>${formatTime(s.time)}</b></span>` +
      `<span${this.run.caught ? ' class="warn"' : ''}>Caught <b>${this.run.caught}</b></span>`);
  }

  _police(dt) {
    const boat = this.boat, hud = this.state.game.hud;
    // ambushes: launches waiting further down come out as you get close
    for (const a of AMBUSH) {
      if (this.ambushed.has(a.at) || boat.pos.z > a.at) continue;
      this.ambushed.add(a.at);
      for (const x of a.x) {
        const i = this.police.findIndex((P, k) => k > 0 && (!P.on || P.behind));
        if (i > 0) this._launch(i, x, a.z, 0);
      }
      hud.toast('More police!', 'Paz: "Launches ahead, coming up the river at us!"', 'var(--red)', 3);
    }
    for (const P of this.police) {
      if (!P.on) continue;
      const car = P.car;
      // too tall for the footbridges: stuck behind one once it's between you
      for (const lb of LOW_BRIDGES) {
        const side = Math.sign(car.pos.z - lb.z);
        if (Math.abs(car.pos.z - lb.z) < 4.5 + 2.6) {
          car.pos.z = lb.z + side * (4.5 + 2.6);
          car.vel.z *= -0.2;
          if (!P.behind && Math.sign(boat.pos.z - lb.z) !== side) {
            P.behind = lb;
            if (P.who) this._tell('stuck', 'Too tall!', 'Paz: "Ha! Delacroix\'s launch can\'t get under the footbridge!"', 'var(--safe)', 3.5);
            else this._tell(`stuck${lb.z}`, 'Stuck!', 'Paz: "They can\'t get under it!"', 'var(--safe)', 2.5);
          }
        }
      }
      if (P.behind && Math.sign(boat.pos.z - P.behind.z) === Math.sign(car.pos.z - P.behind.z)) P.behind = null; // (you came back)
      // chase you (aiming a little ahead of you), or sit and wait behind the bridge
      if (P.behind) { P.target.set(car.pos.x, 0, P.behind.z + Math.sign(car.pos.z - P.behind.z) * 12); }
      else {
        const dist = car.pos.distanceTo(boat.pos), lead = clamp(dist / 30, 0.2, 1.2);
        P.target.set(boat.pos.x + boat.vel.x * lead, 0, boat.pos.z + boat.vel.z * lead);
      }
      this._steer(P, dt);
      car.step(dt, water);
      this._pushOut(car);
      car.pos.x = clamp(car.pos.x, -HALF + 2.4, HALF - 2.4);
      car.pos.z = clamp(car.pos.z, END_Z + 4, START_Z + 56);
      car.syncMesh();
      P.mesh.position.y = Math.sin(this.elapsed * 2 + car.pos.x) * 0.08;
      const lt = P.mesh.userData.lights, on = Math.floor(this.elapsed * 5) % 2 === 0;
      if (lt) { lt.red.visible = lt.glowR.visible = on; lt.blue.visible = lt.glowB.visible = !on; }
      if (P.who) P.who.update(dt, P.whoPose);
      // far behind and out of it: back to the pool (an ambush can use it)
      if (P.behind && car.pos.z - boat.pos.z > 200) { P.on = false; car.active = false; P.mesh.visible = false; }
    }
  }

  /** Steer a launch at its target, round the piers and the tourist boats. */
  _steer(P, dt) {
    const car = P.car, c = car.controls, w = this.level.world;
    let want = Math.atan2(P.target.x - car.pos.x, P.target.z - car.pos.z);
    const probe = (ang, d) => {
      const x = car.pos.x + Math.sin(ang) * d, z = car.pos.z + Math.cos(ang) * d;
      return w.query(x - LAUNCH_R, 0, z - LAUNCH_R, x + LAUNCH_R, 2, z + LAUNCH_R, []).length > 0;
    };
    const look = 8 + car.speed * 0.6;
    if (probe(car.heading, look)) {
      const l = probe(car.heading + 0.6, look), r = probe(car.heading - 0.6, look);
      want = car.heading + (l && !r ? -1.0 : !l && r ? 1.0 : (P.side ||= Math.random() < 0.5 ? 1 : -1) * 1.2);
    }
    const diffA = wrapAngle(want - car.heading);
    const near = Math.hypot(P.target.x - car.pos.x, P.target.z - car.pos.z);
    c.steer = clamp(-diffA * 2.2, -1, 1);
    c.throttle = P.behind && near < 6 ? 0 : Math.abs(diffA) > 1.6 ? 0.4 : 1;
    c.handbrake = Math.abs(diffA) > 1.1 && car.speed > 14;
    P.stuck = car.speed < 2 && !P.behind ? P.stuck + dt : 0;
    if (P.stuck > 1.2) { c.throttle = -1; c.steer = -c.steer; if (P.stuck > 2.6) P.stuck = 0; }
  }

  /** Police launches are wide: push them out of piers with a bigger circle (so the narrow arches stop them). */
  _pushOut(car) {
    const w = this.level.world, hits = [];
    for (const off of [-1.6, 1.6]) {
      const cx = car.pos.x + car.fwdX * off, cz = car.pos.z + car.fwdZ * off;
      w.query(cx - LAUNCH_R, 0, cz - LAUNCH_R, cx + LAUNCH_R, 2, cz + LAUNCH_R, hits);
      for (const b of hits) {
        const px = clamp(cx, b.min.x, b.max.x), pz = clamp(cz, b.min.z, b.max.z);
        let nx = cx - px, nz = cz - pz;
        const d = Math.hypot(nx, nz);
        if (d >= LAUNCH_R) continue;
        if (d < 1e-4) { nx = car.pos.x - (b.min.x + b.max.x) / 2; nz = car.pos.z - (b.min.z + b.max.z) / 2; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l; } else { nx /= d; nz /= d; }
        const pen = LAUNCH_R - d;
        car.pos.x += nx * pen;
        car.pos.z += nz * pen;
        const vn = car.vel.x * nx + car.vel.z * nz;
        if (vn < 0) { car.vel.x -= vn * nx * 1.3; car.vel.z -= vn * nz * 1.3; }
      }
      hits.length = 0;
    }
  }

  _finish() {
    if (this.done) return;
    this.done = true;
    const s = this.state;
    this.boat.controls.throttle = 0;
    s.game.hud.setMeter(0, '');
    audio.sfx('win');
    finishPart(s, this);
  }

  adminSkip() { this._finish(); }

  teardown() {
    const s = this.state;
    if (s.model) s.model.root.visible = !s.cam?.firstPerson;
    if (s.cam && this.camDist) s.cam.distance = this.camDist;
    if (this.wasFirstPerson) s.setFirstPerson?.(true);
  }
}

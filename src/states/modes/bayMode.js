import * as THREE from 'three';
import { buildChapter14Bay, BAY } from '../../world/levels/chapter14Bay.js';
import { Car, collideCarWithWorld, collideCars } from '../../vehicles/car.js';
import { buildSpeedboat, buildPoliceBoat } from '../../vehicles/boats.js';
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
import { CONTROLS } from '../../ui/menus.js';

// Chapter 14, Part 2: across the bay in Paz's speedboat, at night.
//
// You drive the speedboat (the same arcade handling as the cars, but on
// water: it slides a lot more). Jump (Space / the Jump button) is the boost.
// Harbour police launches come out after you: they're nearly as fast, and
// if one stays right on you (worse if you slow down) you're caught.
// They can only chase what they can see: get a rock or an island between
// you and them, or thread the narrow gaps in THE TEETH (the reef): your
// boat fits, theirs don't. Once nobody has seen you for a few seconds
// you've lost them, and you can slip into the sea cave in the western
// cliffs where Paz's friends are waiting.

// The speedboat: quick and slidey. Police launches: a bit slower, wider.
const SPEEDBOAT = { maxSpeed: 36, accel: 15, brake: 22, reverseMax: 7, grip: 2.6, driftGrip: 0.9, steerLow: 2.4, steerHigh: 1.35,
  nitroAccel: 18, nitroMaxFactor: 1.3, mass: 1, slip: 0.9 };
const LAUNCH = { maxSpeed: 33, accel: 12, brake: 22, reverseMax: 6, grip: 3, driftGrip: 1, steerLow: 2.0, steerHigh: 1.15,
  nitroAccel: 0, nitroMaxFactor: 1, mass: 1.6, slip: 0.6 };
const SIGHT = 95;        // how far the police can see you at night (m)
const LOSE = 7;          // seconds out of sight = lost them
const LAUNCH_R = 2.4;    // police launches are wide: they don't fit through the reef's gaps
const water = () => 0;   // the sea is flat (y = 0)

const _v = new THREE.Vector3(), _d = new THREE.Vector3();
const standing = (x, y, z, facing) => ({ pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(), facing, state: 'ground', horizontalSpeed: 0, mantleProgress: 0, stateTime: 0, stumbleTimer: 0, mantle: null, wallRun: null });

/** A foamy wake behind a boat: a pool of flat white patches that fade and spread. */
class Wake {
  constructor(parent, n = 70) {
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.items = [];
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x9ab8cc, transparent: true, opacity: 0, depthWrite: false }));
      m.visible = false;
      parent.add(m);
      this.items.push({ m, t: 9 });
    }
    this.i = 0;
    this.acc = 0;
  }
  emit(boat, dt) {
    const sp = boat.speed;
    if (sp < 3) return;
    this.acc += dt * (5 + sp * 0.25);
    while (this.acc > 1) {
      this.acc -= 1;
      const it = this.items[this.i];
      this.i = (this.i + 1) % this.items.length;
      const back = 4.2 + Math.random() * 1.5, side = (Math.random() - 0.5) * 1.2;
      it.m.position.set(boat.pos.x - boat.fwdX * back - boat.fwdZ * side, 0.04, boat.pos.z - boat.fwdZ * back + boat.fwdX * side);
      it.m.rotation.y = boat.heading;
      it.t = 0;
      it.s = 0.9 + sp * 0.025;
      it.m.visible = true;
    }
  }
  update(dt) {
    for (const it of this.items) {
      if (it.t > 2.4) { if (it.m.visible) it.m.visible = false; continue; }
      it.t += dt;
      const k = it.t / 2.4;
      it.m.scale.set(it.s * (1 + k * 2.2), 1, it.s * (1 + k));
      it.m.material.opacity = 0.16 * (1 - k) * (1 - k);
    }
  }
  clear() { for (const it of this.items) { it.t = 9; it.m.visible = false; } }
}

export class BayMode {
  constructor(state, params) {
    this.state = state;
    this.chapter = CHAPTERS[params.chapterId || 'chapter14'];
    this.partIndex = params.part || 1;
    this.part = this.chapter.parts[this.partIndex];
    this.hudSections = ['tl', 'meter', 'controls', 'marker'];
    this.weather = 'clear';
    this.weatherForced = true;
    this.time = 'night';
    this.indoors = true;
  }

  /** Phone buttons: the driving ones (Drift, Nitro). */
  get touchMode() { return 'driving'; }
  /** Your hands are on the wheel: the on-foot controls don't move you. */
  get inputLocked() { return true; }
  get fallY() { return -60; }

  build() {
    const L = buildChapter14Bay();
    this.level = L;
    L.spawn = L.starts[0].pos.clone().setY(0.05);
    L.spawn.yaw = 0;
    // your speedboat, with you at the wheel and Paz beside you
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
    // the police launches (they join the chase over time)
    this.police = [];
    for (let i = 0; i < 4; i++) {
      const mesh = buildPoliceBoat();
      mesh.visible = false;
      L.group.add(mesh);
      const car = new Car(LAUNCH, mesh);
      car.active = false;
      this.police.push({ car, mesh, on: false, target: new THREE.Vector3(), wander: 0, stuck: 0 });
    }
    this.wake = new Wake(L.group);
    return L;
  }

  /** (once the camera exists) third person, behind the boat; your own body is hidden: you're in the boat */
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
    this.time0 = 0;
    this.caveWarn = 0;
    this.edgeWarn = 0;
    this._placeAt(0);
    const hud = s.game.hud;
    if (first) hud.showControls(CONTROLS.boat);
    hud.setPhase(`${this.chapter.title} · Part ${this.partIndex + 1}: ${this.part.title}`);
    hud.setObjective(this.part.objective);
    if (first && !s.game.speedrun) s.showStoryCards(this.part.intro, this.part.startLabel || 'Go');
  }

  /** Start (again) from a checkpoint: the boat, the police, the timers. */
  _placeAt(cp) {
    const s = this.state, L = this.level, st = L.starts[cp];
    this.boat.place(st.pos.x, st.pos.z, st.heading);
    this.boat.vel.set(0, 0, 0);
    this.fuel = 1;
    this.busted = 0;
    this.elapsed = 0;
    this.lastSeen = 0;          // (they know where you are when it starts)
    this.lastKnown = st.pos.clone();
    this.wake.clear();
    s.cam.yaw = st.heading + Math.PI;
    for (const P of this.police) { P.on = false; P.car.active = false; P.mesh.visible = false; }
    if (cp === 0) {
      this._launch(0, 65, -150, Math.PI);
      this._launch(1, 92, -146, Math.PI * 0.9);
      this.nextLaunch = 22;
    } else {
      // past the reef: they're searching on the far side of it
      this._launch(0, -95, 20, -Math.PI / 2);
      this._launch(1, -100, 110, -Math.PI / 2);
      this.lastSeen = -LOSE * 0.6;
      this.nextLaunch = 30;
    }
    this.launched = 2;
  }

  _launch(i, x, z, heading) {
    const P = this.police[i];
    P.car.place(x, z, heading);
    P.car.active = true;
    P.on = true;
    P.mesh.visible = true;
    P.wander = 0;
    P.stuck = 0;
  }

  get hot() { return this.elapsed - this.lastSeen < LOSE; }

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
    const near = this.police.some((P) => P.on && P.car.pos.distanceTo(this.boat.pos) < 80);
    return { engine: 0.55, siren: near ? 0.35 : 0.08, wind: 0.35, city: 0, music: 0.5, intensity: this.hot ? 0.9 : 0.45 };
  }

  update(dt) {
    if (this.done) return;
    const s = this.state, L = this.level, input = s.game.input, hud = s.game.hud, boat = this.boat, c = boat.controls;
    this.elapsed += dt;

    // --- Drive the speedboat
    c.throttle = input.axis('back', 'forward');
    c.steer = input.axis('left', 'right');
    c.handbrake = input.isDown('crouch') || input.isDown('drift');
    const wantBoost = input.isDown('jump') || input.isDown('nitro');
    c.nitro = wantBoost && this.fuel > 0.02;
    this.fuel = clamp(this.fuel + (c.nitro ? -dt / 3.2 : dt / 9), 0, 1);
    boat.step(dt, water);
    collideCarWithWorld(boat, L.world);
    // the edge of the bay
    const lim = BAY - 12;
    if (Math.abs(boat.pos.x) > lim || Math.abs(boat.pos.z) > lim) {
      boat.pos.x = clamp(boat.pos.x, -lim, lim);
      boat.pos.z = clamp(boat.pos.z, -lim, lim);
      boat.vel.multiplyScalar(0.6);
      if ((this.edgeWarn -= dt) <= 0) { this.edgeWarn = 4; hud.toast('Too far out', 'Paz: "Not the open sea! The cave is in the cliffs to the WEST."', 'var(--amber)', 3); }
    }
    // a little bob and pitch on the waves
    boat.pitch = -clamp(boat.forwardSpeed / 120, 0, 0.12) + Math.sin(this.elapsed * 3.1) * 0.02;
    boat.syncMesh();
    this.boatMesh.position.y = Math.sin(this.elapsed * 2.3) * 0.08;
    this.driver.update(dt, this.driverPose);
    this.paz.update(dt, this.pazPose);
    this.wake.emit(boat, dt);
    this.wake.update(dt);
    audio.engine(boat.speed * 1.1, Math.max(0, c.throttle));

    // you ride along: the (hidden) player sits in the boat, the camera behind it
    const p = s.player;
    p.teleport(boat.pos.x, 0.05, boat.pos.z, boat.heading);
    s.cam.yaw = dampAngle(s.cam.yaw, boat.heading + Math.PI, boat.speed > 3 ? 2.6 : 0.8, dt);

    // --- The police launches
    this._police(dt);
    collideCars([boat, ...this.police.filter((P) => P.on).map((P) => P.car)], (a, b, impact) => {
      if (impact > 7 && (a === boat || b === boat)) { this.busted = Math.min(0.95, this.busted + 0.18); audio.sfx('crash', { vol: 0.7 }); }
    });
    // caught: a launch right on you (much quicker if you're slow)
    let close = Infinity;
    for (const P of this.police) if (P.on) close = Math.min(close, P.car.pos.distanceTo(boat.pos));
    if (close < 11) this.busted += dt * (boat.speed < 9 ? 0.55 : 0.2) * diff().fill;
    else this.busted = Math.max(0, this.busted - dt * 0.35);
    if (this.busted >= 1) {
      this._caught('Caught!', 'A police launch pulled alongside. Keep your speed up (Jump = boost), and use the rocks: the police can only chase what they can see.');
      return;
    }
    if (this.busted > 0.02) hud.setMeter(this.busted, 'POLICE ALONGSIDE! Get away', 'var(--red)');
    else if (this.hot) hud.setMeter(0, '');
    else hud.setMeter(0, '');

    // --- Past the reef: a checkpoint
    if (this.cp === 0 && boat.pos.x < -165) {
      this.cp = 1;
      audio.sfx('checkpoint', { vol: 0.6 });
      hud.toast('Past the Teeth', 'Paz: "Bravo! Now, the cave: in the cliffs, the green light. But only once they\'ve lost us!"', 'var(--safe)', 4);
    }

    // --- The sea cave
    const inCave = boat.pos.x < L.cave.x - 2 && Math.abs(boat.pos.z - L.cave.z) < L.cave.w / 2 + 3;
    if (inCave && !this.hot) { this._finish(); return; }
    if (inCave && this.hot && (this.caveWarn -= dt) <= 0) {
      this.caveWarn = 4;
      hud.toast('They\'re right behind you!', 'Paz: "Not with them watching! Lose them out in the bay first: the gaps in the Teeth are too narrow for their launches."', 'var(--red)', 4);
    }
    L.goalGlow.visible = L.goalBeam.visible = true;
    L.goalGlow.material.opacity = this.hot ? 0.3 : 0.85;

    // --- The bay comes alive: the lighthouse turns, buoys bob
    L.beamPivot.rotation.y += dt * 0.6;
    for (let i = 0; i < L.buoys.length; i++) {
      const b = L.buoys[i];
      b.position.y = Math.sin(this.elapsed * 1.6 + i) * 0.15;
      b.rotation.z = Math.sin(this.elapsed * 1.2 + i * 2) * 0.08;
    }

    this._updateMarker();
    const chasing = this.police.filter((P) => P.on).length;
    hud.setStats(`<span${this.hot ? ' class="warn"' : ''}>Police <b>${this.hot ? 'chasing' : 'searching'}</b></span>` +
      `<span>Boost <b>${Math.round(this.fuel * 100)}%</b></span><span>Launches <b>${chasing}</b></span><span>Time <b>${formatTime(s.time)}</b></span>`);
  }

  /** Police launches: chase what they can see, search where they last saw you. */
  _police(dt) {
    const L = this.level, boat = this.boat;
    // a new launch joins the chase every so often
    this.nextLaunch -= dt;
    if (this.nextLaunch <= 0 && this.launched < this.police.length) {
      const spots = [[60, 270, Math.PI], [-60, -200, 0]];
      const [x, z, h] = spots[(this.launched - 2) % spots.length];
      this._launch(this.launched, x, z, h);
      this.launched++;
      this.nextLaunch = 28;
      this.state.game.hud.toast('Another launch', 'Paz: "More police, coming out to join them!"', 'var(--amber)', 2.5);
    }
    let seen = false;
    for (const P of this.police) {
      if (!P.on) continue;
      const car = P.car;
      // can they see you? (close enough, nothing in the way)
      _d.set(boat.pos.x - car.pos.x, 0, boat.pos.z - car.pos.z);
      const dist = _d.length();
      let sees = dist < SIGHT * (admin.flag('unseen') ? 0 : 1);
      if (sees && dist > 6) {
        _v.set(car.pos.x, 2, car.pos.z);
        _d.normalize();
        sees = L.world.raycast(_v, _d, dist - 2) >= dist - 2;
      }
      if (sees) { seen = true; this.lastSeen = this.elapsed; this.lastKnown.copy(boat.pos); }
      // where to go
      if (this.hot) {
        const lead = clamp(dist / 30, 0.2, 1.2);
        P.target.set(boat.pos.x + boat.vel.x * lead, 0, boat.pos.z + boat.vel.z * lead);
      } else {
        // searching: to where they last saw you, then cast about round it
        if (P.target.distanceTo(car.pos) < 12 || (P.wander -= dt) <= 0) {
          P.wander = 8;
          const a = Math.random() * Math.PI * 2, r = 20 + Math.random() * 50;
          P.target.set(this.lastKnown.x + Math.cos(a) * r, 0, this.lastKnown.z + Math.sin(a) * r);
        }
      }
      this._steer(P, dt);
      car.step(dt, water);
      this._pushOut(car);
      car.syncMesh();
      P.mesh.position.y = Math.sin(this.elapsed * 2 + car.pos.x) * 0.1;
      // flashing lights
      const lt = P.mesh.userData.lights, on = Math.floor(this.elapsed * 5) % 2 === 0;
      lt.red.visible = lt.glowR.visible = on;
      lt.blue.visible = lt.glowB.visible = !on;
    }
    if (seen && !this.wasSeen && this.elapsed > 3) this.state.game.hud.toast('Spotted!', 'A police launch has you in sight.', 'var(--red)', 2);
    if (!this.hot && this.wasHot) { audio.sfx('checkpoint', { vol: 0.5 }); this.state.game.hud.toast('Lost them!', 'Paz: "They can\'t see us! Quick, to the cave, before they find us again."', 'var(--safe)', 3.5); }
    this.wasSeen = seen;
    this.wasHot = this.hot;
  }

  /** Steer a launch at its target, swerving round rocks it's about to hit. */
  _steer(P, dt) {
    const car = P.car, c = car.controls, w = this.level.world;
    let want = Math.atan2(P.target.x - car.pos.x, P.target.z - car.pos.z);
    // feelers: straight ahead, and a little to each side
    const probe = (ang, d) => {
      const x = car.pos.x + Math.sin(ang) * d, z = car.pos.z + Math.cos(ang) * d;
      return w.query(x - LAUNCH_R, 0, z - LAUNCH_R, x + LAUNCH_R, 2, z + LAUNCH_R, []).length > 0;
    };
    const look = 8 + car.speed * 0.6;
    if (probe(car.heading, look)) {
      const l = probe(car.heading + 0.7, look), r = probe(car.heading - 0.7, look);
      want = car.heading + (l && !r ? -1.2 : !l && r ? 1.2 : (P.side ||= Math.random() < 0.5 ? 1 : -1) * 1.4);
    }
    const diffA = wrapAngle(want - car.heading);
    c.steer = clamp(-diffA * 2.2, -1, 1);
    c.throttle = Math.abs(diffA) > 1.6 ? 0.4 : 1;
    c.handbrake = Math.abs(diffA) > 1.1 && car.speed > 14;
    // stuck on a rock: back off and turn
    P.stuck = car.speed < 2 ? P.stuck + dt : 0;
    if (P.stuck > 1.2) { c.throttle = -1; c.steer = -c.steer; if (P.stuck > 2.6) P.stuck = 0; }
  }

  /** Police launches are wide: push them out of rocks with a bigger circle. */
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

  _updateMarker() {
    const s = this.state, hud = s.game.hud, L = this.level, b = this.boat.pos;
    const t = _v.set(L.cave.x - 4, 3, L.cave.z);
    hud.setMarker(t, s.camera, this.hot ? 'Sea cave (lose them first!)' : 'Sea cave', this.hot ? 'var(--amber)' : 'var(--safe)', Math.hypot(t.x - b.x, t.z - b.z));
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

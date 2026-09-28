import * as THREE from 'three';
import { PlayState } from './playState.js';
import { NightLighting } from '../world/lighting.js';
import { generateStreetCity } from '../world/streetCity.js';
import { makeGlowMaterial } from '../world/materials.js';
import { Car, CAR_SPECS, collideCarWithWorld, collideCars } from '../vehicles/car.js';
import { makeCarMesh } from '../vehicles/carModel.js';
import { Traffic } from '../vehicles/traffic.js';
import { ParticleSystem } from '../vehicles/particles.js';
import { PoliceForce } from '../ai/police.js';
import { Minimap } from '../ui/minimap.js';
import { CONTROLS } from '../ui/menus.js';
import { save } from '../core/save.js';
import { clamp, damp, formatTime, makeRng } from '../core/utils.js';

// Street Chase: endless driving survival.
//
//  - The longer you keep driving, the more points you earn (faster = more).
//  - Heat (1-5 stars) rises every 35 seconds and when you ram police cars.
//    Higher heat = more cruisers, and faster ones.
//  - Stop or crawl near a cop and the BUSTED meter fills. Full = game over.
//  - Break line of sight for long enough and the cops lose you (bonus!).
//    Parks and alleys help you disappear faster. They'll pick up your trail
//    again after a while, though.
//  - Shift = nitro. It recharges while drifting, jumping and near-missing
//    other cars.
//  - Drive through the green cash drops for big bonuses.

const HEAT_TIME = 35; // seconds per heat level
const HEAT = [
  { cops: 2, speedFactor: 0.8 },
  { cops: 3, speedFactor: 0.88 },
  { cops: 4, speedFactor: 0.96 },
  { cops: 6, speedFactor: 1.04 },
  { cops: 8, speedFactor: 1.12 },
];
const BUST_RADIUS = 9;
const EVADE_TIME = 9;         // seconds out of sight to lose the cops
const EVADE_TIME_HIDDEN = 5;  // ... when in an alley or park
const SEARCH_TIME = 16;       // seconds before they pick up the trail again
const NEAR_MISS_DIST = 4.4;

export class DrivingState extends PlayState {
  constructor(game) {
    super(game, { needsPointerLock: false });
    this.camMode = 0;
  }

  buildWorld(params) {
    this.mode = params.mode || 'survival';
    const game = this.game;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 900);
    this.lighting = new NightLighting(this.scene, { shadows: game.settings.graphics !== 'low' });
    this.lighting.moon.shadow.camera.left = -50;
    this.lighting.moon.shadow.camera.right = 50;
    this.lighting.moon.shadow.camera.top = 50;
    this.lighting.moon.shadow.camera.bottom = -50;

    this.seed = (Math.random() * 1e9) | 0;
    this.rng = makeRng(this.seed);
    this.city = generateStreetCity({ seed: this.seed, blocks: 8 });
    this.scene.add(this.city.group);

    // Player car + a real headlight (the only moving real light)
    this.playerMesh = makeCarMesh({ kind: 'player', color: 0xff9f1a });
    this.scene.add(this.playerMesh);
    this.player = new Car(CAR_SPECS.player, this.playerMesh);
    this.player.active = true;
    this.player.isPlayer = true;
    const head = new THREE.SpotLight(0xfff0d0, 120, 60, 0.55, 0.6, 1.2);
    head.position.set(0, 1.0, 2.0);
    head.target.position.set(0, 0, 14);
    this.playerMesh.add(head, head.target);

    this.police = new PoliceForce(this.scene, this.city, this.rng);
    this.traffic = new Traffic(this.scene, this.city, this.rng, 22);
    this.particles = new ParticleSystem(this.scene, 320);
    this.minimap = new Minimap(game.hud.el.map, this.city);
    this._buildBeacon();

    game.hud.show(['tl', 'score', 'map', 'speedo', 'meter', 'controls', 'marker']);
    game.hud.showControls(CONTROLS.driving);
    this.restart();
  }

  _buildBeacon() {
    const g = new THREE.Group();
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 120, 20, 1, true), makeGlowMaterial(0x4dffa6, 0.14));
    beam.position.y = 60;
    const ring = new THREE.Mesh(new THREE.RingGeometry(5, 6.2, 40), makeGlowMaterial(0x4dffa6, 0.7));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.1;
    g.add(beam, ring);
    this.beacon = { group: g, ring, pos: new THREE.Vector3() };
    this.scene.add(g);
  }

  _placeBeacon() {
    const p = this.player.pos;
    const nodes = this.city.graph.nodes.filter((n) => {
      const d = Math.hypot(n.x - p.x, n.z - p.z);
      return d > 150 && d < 320;
    });
    const n = nodes[Math.floor(this.rng() * nodes.length)] || this.city.graph.nodes[0];
    this.beacon.pos.set(n.x, 0, n.z);
    this.beacon.group.position.copy(this.beacon.pos);
  }

  restart() {
    const graph = this.city.graph;
    const start = graph.node(Math.floor(graph.n / 2), Math.floor(graph.n / 2));
    this.player.place(start.x, start.z - 20, 0);
    this.player.health = 1;
    this.nitro = 1;
    this.time = 0;
    this.score = 0;
    this.heatProgress = 0;
    this.heat = 1;
    this.busted = 0;
    this.evades = 0;
    this.nearMisses = 0;
    this.cashDrops = 0;
    this.nearTrack = new Map();
    this.camPos = null;
    this.police.clear();
    this.police.lastKnown.copy(this.player.pos);
    this.police.searching = false;
    this.police.timeSinceSeen = 0;
    this.traffic.scatter(this.player);
    this._placeBeacon();
    const hud = this.game.hud;
    hud.setPhase('Street Chase');
    hud.setObjective('Lose the cops. Keep driving.');
    hud.setMeter(0, '');
    hud.toast('Drive!', 'Every second you stay free earns points. Shift for nitro, Space to drift.', 'var(--amber)');
    this._syncCamera(1, true);
  }

  readInput() {
    const input = this.game.input;
    const c = this.player.controls;
    c.throttle = input.axis('back', 'forward');
    c.steer = input.axis('left', 'right');
    c.handbrake = input.isDown('jump');
    c.nitro = input.isDown('sprint') && this.nitro > 0.02;
    if (input.wasPressed('horn')) this.traffic.honk(this.player);
    if (input.wasPressed('camera')) this.camMode = (this.camMode + 1) % 2;
    if (input.wasPressed('respawn')) this._unstick();
  }

  _unstick() {
    if (this.player.speed > 4) return;
    const n = this.city.graph.nearestNode(this.player.pos.x, this.player.pos.z);
    const snapped = Math.round(this.player.heading / (Math.PI / 2)) * (Math.PI / 2);
    this.player.place(n.x, n.z, snapped);
    this.game.hud.toast('Back on the road', '', 'var(--cyan)');
  }

  simulate(dt) {
    const p = this.player;
    const heat = HEAT[this.heat - 1];
    const ground = this.city.groundHeight;

    // --- AI decisions
    this.police.setCount(heat.cops, p, this.camera);
    this.police.update(dt, p, heat, this.camera);
    const civCars = this.traffic.cars;
    const copCars = this.police.cars;
    const all = [p, ...copCars, ...civCars];
    this.traffic.update(dt, p, this.camera, all);

    // --- Physics
    for (const car of all) car.step(dt, ground);
    for (const car of all) {
      const impact = collideCarWithWorld(car, this.city.world);
      if (car === p && impact > 5) this._damage((impact - 5) * 0.012, impact);
    }
    collideCars(all, (a, b, impact) => {
      a.lastImpact = Math.max(a.lastImpact, impact);
      b.lastImpact = Math.max(b.lastImpact, impact);
      if (a !== p && b !== p) return;
      const other = a === p ? b : a;
      const rec = this.nearTrack.get(other);
      if (rec) rec.hit = true;
      if (impact > 4) this._damage((impact - 4) * 0.008, impact);
      if (other.isPolice && impact > 6) {
        this.heatProgress += 4; // ramming the police makes them angrier
      }
    });

    // --- Nitro
    if (p.boosting) this.nitro = Math.max(0, this.nitro - dt * 0.32);
    if (p.drifting) this.nitro = Math.min(1, this.nitro + dt * 0.16);
    if (p.airborne) this.nitro = Math.min(1, this.nitro + dt * 0.25);
  }

  _damage(amount, impact) {
    const before = this.player.health;
    this.player.health = Math.max(0, this.player.health - amount);
    if (before > 0.5 && this.player.health <= 0.5) this.game.hud.toast('Engine damaged', 'Your car is slowing down.', 'var(--red)');
    if (impact > 14) this.game.hud.toast('Crash!', '', 'var(--red)');
  }

  frameUpdate(dt, frozen) {
    const p = this.player;
    const hud = this.game.hud;
    if (!frozen) {
      this.time += dt;
      this._updateSurvival(dt);
      this._updateEffects(dt);
    }
    // Meshes follow physics bodies
    p.syncMesh();
    this.police.syncMeshes(this.time);
    this.traffic.syncMeshes();
    this.city.trafficLights.update(frozen ? 0 : dt);
    this.playerMesh.userData.flames.visible = p.boosting;
    this.playerMesh.userData.tailMat.color.setHex(p.controls.throttle < 0 ? 0xff2030 : 0x881018);

    this._syncCamera(dt, false);
    this.lighting.follow(p.pos);
    this.particles.update(frozen ? 0 : dt);

    // HUD
    hud.setSpeedo(p.speed * 3.6, this.nitro, p.health);
    const dots = this.police.units.map((u) => ({
      x: u.car.pos.x, z: u.car.pos.z,
      color: Math.floor(this.time * 4 + u.car.pos.x) % 2 ? '#ff3346' : '#3d7bff',
    }));
    this.minimap.draw({ x: p.pos.x, z: p.pos.z, heading: p.heading }, dots, this.beacon.pos, this.time);
    const bd = Math.hypot(this.beacon.pos.x - p.pos.x, this.beacon.pos.z - p.pos.z);
    hud.setMarker(this.beacon.pos.clone().setY(4), this.camera, 'Cash drop', 'var(--safe)', bd);

    if (this.game.showDebug) {
      hud.setDebug(`${this.game.fps.toFixed(0)} fps\ncalls ${this.game.renderer.info.render.calls}\n` +
        this.police.units.map((u) => u.mode[0]).join('') + ` seen ${this.police.timeSinceSeen.toFixed(1)}s`);
    } else hud.setDebug('');
  }

  _updateSurvival(dt) {
    const p = this.player;
    const hud = this.game.hud;
    const police = this.police;

    // --- Heat level
    this.heatProgress += dt;
    const newHeat = Math.min(5, 1 + Math.floor(this.heatProgress / HEAT_TIME));
    if (newHeat > this.heat) {
      this.heat = newHeat;
      hud.toast(`Heat level ${this.heat}`, 'More cruisers are joining the chase.', 'var(--red)');
    }

    // --- Losing the cops
    const hidden = this.city.isInAlley(p.pos.x, p.pos.z) || this.city.isInPark(p.pos.x, p.pos.z);
    if (!police.searching) {
      const need = hidden ? EVADE_TIME_HIDDEN : EVADE_TIME;
      if (police.timeSinceSeen > need) {
        police.searching = true;
        this.evades++;
        const bonus = 500 * this.heat;
        this.score += bonus;
        hud.toast('Cops lost!', `+${bonus}. They're searching the area... keep your head down.`, 'var(--safe)');
      }
    } else if (police.timeSinceSeen > SEARCH_TIME) {
      // A patrol spotted you somewhere: the chase is back on.
      police.searching = false;
      police.lastKnown.copy(p.pos);
      police.timeSinceSeen = 0;
      hud.toast('Trail picked up', 'A patrol called in your position.', 'var(--red)');
    }

    if (police.justReacquired) {
      police.justReacquired = false;
      hud.toast('Spotted!', 'They\'re back on your tail.', 'var(--red)');
    }

    // --- Busted meter: cops close and you're (nearly) stopped
    let close = 0;
    for (const u of police.units) {
      if (Math.hypot(u.car.pos.x - p.pos.x, u.car.pos.z - p.pos.z) < BUST_RADIUS) close++;
    }
    if (close > 0 && p.speed < 6) this.busted += dt * (0.35 + close * 0.15);
    else this.busted -= dt * (p.speed > 12 ? 0.5 : 0.2);
    this.busted = clamp(this.busted, 0, 1);
    hud.setMeter(this.busted, this.busted > 0.01 && close ? 'BUSTED! Get moving!' : 'Busted', 'var(--blue)');

    // --- Near misses
    for (const car of [...police.cars, ...this.traffic.cars]) {
      const d = Math.hypot(car.pos.x - p.pos.x, car.pos.z - p.pos.z);
      let rec = this.nearTrack.get(car);
      if (d < NEAR_MISS_DIST) {
        if (!rec) this.nearTrack.set(car, (rec = { hit: false, fast: false }));
        const rel = Math.hypot(car.vel.x - p.vel.x, car.vel.z - p.vel.z);
        if (p.speed > 15 && rel > 10) rec.fast = true;
      } else if (rec && d > NEAR_MISS_DIST + 1) {
        if (rec.fast && !rec.hit) {
          this.nearMisses++;
          this.nitro = Math.min(1, this.nitro + 0.15);
          this.score += 40 * this.heat;
          hud.toast('Near miss!', `+${40 * this.heat} and nitro`, 'var(--cyan)');
        }
        this.nearTrack.delete(car);
      }
    }

    // --- Score: always ticking while you're free. Faster = more.
    const kmh = p.speed * 3.6;
    let rate = (4 + kmh * 0.06) * this.heat;
    if (police.searching) rate *= 0.5;
    if (p.drifting) rate += 12 * this.heat;
    this.score += rate * dt;

    // --- Cash drops
    const bd = Math.hypot(this.beacon.pos.x - p.pos.x, this.beacon.pos.z - p.pos.z);
    this.beacon.ring.rotation.z += dt;
    if (bd < 7) {
      const bonus = 750 * this.heat;
      this.score += bonus;
      this.cashDrops++;
      hud.toast(`Cash drop! +${bonus}`, '', 'var(--safe)');
      this._placeBeacon();
    }

    const stars = '★'.repeat(this.heat) + '☆'.repeat(5 - this.heat);
    hud.setScore(this.score, `HEAT <span class="heat">${stars}</span>${police.searching ? ' &nbsp;<b>SEARCHING</b>' : ''}`);
    hud.setStats(`<span>Time <b>${formatTime(this.time)}</b></span><span>Evaded <b>${this.evades}</b></span>` +
      `<span>Near misses <b>${this.nearMisses}</b></span>`);

    if (this.busted >= 1) this._bustedOver();
  }

  _updateEffects(dt) {
    const p = this.player;
    const fx = p.fwdX, fz = p.fwdZ;
    // Tyre smoke when drifting
    if (p.drifting && Math.random() < 0.8) {
      for (const side of [-0.95, 0.95]) {
        const x = p.pos.x - fx * 1.4 - fz * side, z = p.pos.z - fz * 1.4 + fx * side;
        this.particles.emit(x, p.pos.y + 0.3, z, { vx: (Math.random() - 0.5), vy: 0.6, vz: (Math.random() - 0.5), size: 1.2, grow: 3, life: 1.1, alpha: 0.35, color: [0.75, 0.75, 0.78] });
      }
    }
    // Engine smoke when damaged (darker and thicker the worse it gets)
    if (p.health < 0.5 && Math.random() < (0.6 - p.health) * 1.5) {
      const dark = 0.15 + p.health * 0.6;
      this.particles.emit(p.pos.x + fx * 1.8, p.pos.y + 1.1, p.pos.z + fz * 1.8, { vx: (Math.random() - 0.5) * 0.6, vy: 1.8, vz: (Math.random() - 0.5) * 0.6, size: 1.0, grow: 2.2, life: 1.6, alpha: 0.55, color: [dark, dark, dark] });
    }
  }

  _syncCamera(dt, snap) {
    const p = this.player;
    const dist = this.camMode === 0 ? 8.5 : 13;
    const height = this.camMode === 0 ? 3.1 : 5.5;
    // Look along the direction of travel a little during drifts
    const fx = p.fwdX, fz = p.fwdZ;
    const want = new THREE.Vector3(p.pos.x - fx * dist, p.pos.y + height, p.pos.z - fz * dist);

    // Camera collision: don't go inside buildings.
    const pivot = new THREE.Vector3(p.pos.x, p.pos.y + 1.8, p.pos.z);
    const dir = want.clone().sub(pivot);
    const len = dir.length();
    dir.divideScalar(len);
    const hit = this.city.world.raycast(pivot, dir, len + 0.3);
    if (hit < len + 0.3) want.copy(pivot).addScaledVector(dir, Math.max(1.5, hit - 0.4));

    if (snap || !this.camPos) this.camPos = want.clone();
    else {
      this.camPos.x = damp(this.camPos.x, want.x, 7, dt);
      this.camPos.y = damp(this.camPos.y, want.y, 5, dt);
      this.camPos.z = damp(this.camPos.z, want.z, 7, dt);
    }
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(p.pos.x + fx * 4, p.pos.y + 1.2, p.pos.z + fz * 4);

    const fov = 65 + clamp(p.speed / 42, 0, 1.3) * 12 + (p.boosting ? 6 : 0);
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov = damp(this.camera.fov, fov, 4, snap ? 1 : dt);
      this.camera.updateProjectionMatrix();
    }
  }

  _bustedOver() {
    const score = Math.floor(this.score);
    const isBest = save.submitBest('streetChase', score);
    this.game.hud.setMeter(0, '');
    this.gameOver(`
      <h2>Busted!</h2>
      <p class="sub">They boxed you in. Next time keep moving, and use nitro to break away.</p>
      <div class="stat-grid">
        <div><span>Score</span><b>${score.toLocaleString('en-US')}</b></div>
        <div><span>Best</span><b>${save.data.best.streetChase.toLocaleString('en-US')}</b></div>
        <div><span>Time survived</span><b>${formatTime(this.time)}</b></div>
        <div><span>Heat reached</span><b>${this.heat}</b></div>
        <div><span>Times evaded</span><b>${this.evades}</b></div>
        <div><span>Near misses</span><b>${this.nearMisses}</b></div>
      </div>
      ${isBest ? '<p class="new-best">New best score!</p>' : ''}`);
  }

  renderFrame(renderer) {
    renderer.render(this.scene, this.camera);
  }

  resize(w, h) {
    if (!this.camera) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  teardown() {
    this.police?.clear();
    this.traffic?.clear();
    this.particles?.dispose();
    this.scene?.traverse((o) => {
      if (o.geometry && !o.isInstancedMesh) o.geometry.dispose();
    });
    this.scene = null;
    this.game.hud.hideAll();
  }
}

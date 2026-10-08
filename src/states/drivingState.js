import * as THREE from 'three';
import { PlayState } from './playState.js';
import { NightLighting, lightingForQuality, pickTime } from '../world/lighting.js';
import { Weather, pickWeather } from '../world/weather.js';
import { generateStreetCity } from '../world/streetCity.js';
import { makeGlowMaterial } from '../world/materials.js';
import { Car, CAR_SPECS, collideCarWithWorld, collideCars } from '../vehicles/car.js';
import { makeCarMesh, makeSnowmobileMesh, updateUnderglow } from '../vehicles/carModel.js';
import { currentLook } from '../player/outfits.js';
import { Traffic } from '../vehicles/traffic.js';
import { ParticleSystem } from '../vehicles/particles.js';
import { PoliceForce } from '../ai/police.js';
import { Roadblocks } from '../ai/roadblocks.js';
import { Minimap } from '../ui/minimap.js';
import { BigMap } from '../ui/bigMap.js';
import { save } from '../core/save.js';
import { NitroPickups } from '../vehicles/nitroPickups.js';
import { owns, earn } from '../gadgets/gadgets.js';
import { admin } from '../core/admin.js';
import { diff } from '../core/difficulty.js';
import { CityHack } from '../vehicles/cityHack.js';
import { CarGadgets } from '../gadgets/carGadgets.js';
import { CONTROLS } from '../ui/menus.js';
import { clamp, damp, makeRng } from '../core/utils.js';
import { audio } from '../core/audio.js';
import { noteCaught } from '../core/jail.js';
import { showGarage } from '../ui/customise.js';
import { playerCarColour, playerCarStyle, playerCarSpecs, playerCarBody, CAR_BODIES } from '../vehicles/carColours.js';
import { StreetChaseMode } from './modes/streetChaseMode.js';
import { ChapterDriveMode } from './modes/chapterDriveMode.js';
import { FreeDriveMode } from './modes/freeDriveMode.js';
import { SideJobsMode } from './modes/sideJobsMode.js';
import { ChaseHelicopter } from '../ai/chaseHelicopter.js';
import { StreetLife } from '../world/streetLife.js';
import { rumble } from '../core/haptics.js';
import { addStat } from '../core/stats.js';
import { setShopDaylight } from '../world/shopfronts.js';

// Driving game state: everything the driving modes share.
//   - the street city, the player's car, police, traffic, smoke particles
//   - physics (fixed steps), collisions, damage, nitro
//   - the chase camera, minimap and speedometer
//   - pursuit rules: losing the cops, the Busted meter, near misses
//
// What you're DOING is decided by a mode object (like the on-foot modes):
//   survival -> StreetChaseMode   (endless, score, heat rises over time)
//   story    -> ChapterDriveMode  (story: drive to the safehouse, chases...)
//   free     -> FreeDriveMode     (Free Run in the car: no score, optional police)
//
// A mode can implement:
//   cityOptions()      -> { seed, blocks }
//   hudSections
//   start(first)       -> place the car, set heat, show messages
//   heat               -> current heat level (1-5), read every tick
//   update(dt)         -> per-frame game logic (score, goals...)
//   onEvade(), onReacquire(), onNearMiss(), onBusted(), onPoliceRam()

// Cruisers per heat level. Kept low on purpose: only the two nearest ever
// close in on you (see PoliceForce), the rest hang back and follow.
export const HEAT = [
  { cops: 1, speedFactor: 0.8 },
  { cops: 2, speedFactor: 0.88 },
  { cops: 3, speedFactor: 0.96 },
  { cops: 4, speedFactor: 1.04 },
  { cops: 5, speedFactor: 1.1 },
];
const BUST_RADIUS = 9;
const EVADE_TIME = 9;         // seconds out of sight to lose the cops
const EVADE_TIME_HIDDEN = 5;  // ... when in an alley or park
const EVADE_TIME_GARAGE = 3;  // ... when parked in a garage
const NEAR_MISS_DIST = 4.4;

const MODES = { survival: StreetChaseMode, story: ChapterDriveMode, chapter1: ChapterDriveMode, free: FreeDriveMode, jobs: SideJobsMode };

export class DrivingState extends PlayState {
  constructor(game) {
    super(game, { needsPointerLock: false });
    this.camMode = 0;
  }

  buildWorld(params) {
    const game = this.game;
    const ModeClass = MODES[params.mode] || StreetChaseMode;
    this.mode = new ModeClass(this, params);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 900);
    this.lighting = new NightLighting(this.scene, lightingForQuality(game.settings.graphics));
    const sc = this.lighting.moon.shadow.camera;
    sc.left = sc.bottom = -50;
    sc.right = sc.top = 50;

    const opts = this.mode.cityOptions();
    this.rng = makeRng(opts.seed);
    this.city = generateStreetCity(opts);
    this.scene.add(this.city.group);

    // Player car + a real headlight (the only moving real light)
    this.playerMesh = this._makePlayerMesh();
    this.scene.add(this.playerMesh);
    this.player = new Car(this._specs(), this.playerMesh); // (your car's own handling)
    this.player.active = true;
    this.player.isPlayer = true;
    this._setDirt();
    const head = new THREE.SpotLight(0xfff0d0, 120, 60, 0.55, 0.6, 1.2);
    head.position.set(0, 1.0, 2.0);
    head.target.position.set(0, 0, 14);
    this.playerMesh.add(head, head.target);

    this.police = new PoliceForce(this.scene, this.city, this.rng);
    // Fewer civilian cars on lower graphics settings.
    const trafficCount = { low: 12, medium: 18, high: 22 }[game.settings.graphics] ?? 18;
    this.traffic = new Traffic(this.scene, this.city, this.rng, trafficCount);
    this.particles = new ParticleSystem(this.scene, 700);
    // People on the pavements, parked cars, bins and benches, steaming drains
    this.life = new StreetLife(this.scene, this.city, this.rng, { graphics: game.settings.graphics, particles: this.particles });
    // Chimney smoke over the rooftops (the snowy mountain town)
    this.chimneySmoke = this.city.chimneys?.length ? new ParticleSystem(this.scene, 900) : null;
    this.chimneyT = 0;
    this.roadblocks = new Roadblocks(this.scene, this.city, this.rng);
    this.minimap = new Minimap(game.hud.el.map, this.city);
    this.bigMap = new BigMap(this.minimap);
    // Tap / click the minimap to open the big map (phones have no M key).
    this._onMapTap = (e) => { e.preventDefault(); this.openMap(); };
    game.hud.el.map.addEventListener('pointerdown', this._onMapTap);
    this.nitroPickups = new NitroPickups(this.scene, this.city, this.rng);
    this.carGadgets = new CarGadgets(this); // shop gadgets (F)
    this.cityHack = new CityHack(this);     // hack a junction behind you (E)
    this.beacon = this._buildBeacon();
    // Pink light beam at your waypoint
    this.waypointBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 70, 16, 1, true), makeGlowMaterial(0xff5ad0, 0.28));
    this.waypointBeam.visible = false;
    this.scene.add(this.waypointBeam);
    this.mode.build?.();
    // Time of day (the story part decides; otherwise the Time of day setting)
    const tod = pickTime(game.settings, this.mode.time);
    this.lighting.setTime(tod.hour);
    this.timeCycle = tod.cycle || !!this.mode.timeCycle; // (Free Run: day and night come round)
    this.police.sightScale = (1 + 0.3 * this.lighting.daylight) * (this.mode.weather === 'blizzard' ? 0.5 : 1); // cops see further in daylight, much less in a blizzard
    // Rain / storm (the story part decides; the Weather setting can override)
    this.weather = new Weather(this.scene, this.lighting, game.post, { kind: pickWeather(game.settings, this.mode.weather, this.mode.weatherForced), quality: game.settings.graphics });
    this.weather.addPuddles(this.city.world); // (puddles round you while it rains)

    game.hud.show(this.mode.hudSections);
    game.hud.showControls(CONTROLS.driving);
    this.firstStart = true;
    this.restart();
  }

  /** Tall light beam + ring on the road marking where to go. */
  _buildBeacon() {
    const g = new THREE.Group();
    const mat = makeGlowMaterial(0x4dffa6, 0.14);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 120, 20, 1, true), mat);
    beam.position.y = 60;
    const ringMat = makeGlowMaterial(0x4dffa6, 0.7);
    const ring = new THREE.Mesh(new THREE.RingGeometry(5, 6.2, 40), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.1;
    g.add(beam, ring);
    this.scene.add(g);
    return {
      group: g, ring, beam, pos: new THREE.Vector3(), label: '', color: '#4dffa6',
      set(x, z, label, color = 0x4dffa6) {
        this.pos.set(x, 0, z);
        g.position.copy(this.pos);
        this.label = label;
        this.color = `#${new THREE.Color(color).getHexString()}`;
        mat.color.set(color);
        ringMat.color.set(color);
        g.visible = true;
      },
      hide() { g.visible = false; },
    };
  }

  restart() {
    this.heli?.dispose();
    this.heli = null;
    this.flatTyres = 0;
    this.player.speedFactor = 1;
    this.player.gripFactor = 1;
    this.roadblocks.clear();
    this.nitro = 1;
    this.time = 0;
    this.busted = 0;
    this.nearTrack = new Map();
    this.camPos = null;
    this.police.clear();
    this.police.lastKnown.copy(this.player.pos);
    this.police.searching = false;
    this.police.timeSinceSeen = 0;
    this.game.hud.setMeter(0, '');
    this.mode.start(this.firstStart);
    this.firstStart = false;
    this.police.lastKnown.copy(this.player.pos);
    this.traffic.scatter(this.player);
    this.life.scatter(this.player);
    this.nitroPickups.scatter(this.player);
    this.carGadgets.reset();
    this.cityHack.reset();
    this.setWaypoint(null);
    this._syncCamera(1, true);
    // The chimneys are already smoking when you arrive
    if (this.chimneySmoke) {
      this.chimneySmoke.clear();
      for (let i = 0; i < 360; i++) { this._chimneyPuffs(1 / 60); this.chimneySmoke.update(1 / 60); }
    }
  }

  /** Put the player's car somewhere (used by modes at the start). */
  placePlayer(x, z, heading) {
    this.player.place(x, z, heading);
    this.camPos = null;
  }

  readInput(dt = 1 / 60) {
    const input = this.game.input;
    const c = this.player.controls;
    c.throttle = input.axis('back', 'forward');
    c.steer = input.axis('left', 'right');
    c.handbrake = input.isDown('drift');                       // Shift
    c.nitro = input.isDown('nitro') && this.nitro > 0.02;      // Space
    // The Dirt Bike: Space is the wheelie (hold), and letting go pops it into a jump
    if (this.dirt) { this.wheelieHeld = input.isDown('nitro'); c.nitro = false; }
    if (input.wasPressed('horn')) {
      this.traffic.honk(this.player);
      this.life.honk(this.player);
      audio.sfx('horn');
    }
    if (input.wasPressed('camera')) this.camMode = (this.camMode + 1) % 2;
    if (input.wasPressed('respawn')) this._unstick();
    if (input.wasPressed('map')) this.openMap();
    if (input.wasPressed('gadget')) this.carGadgets.use();
    for (let i = 0; i < 3; i++) if (input.wasPressed(`gadget${i + 1}`)) this.carGadgets.use(i);
    if (input.wasPressed('interact')) this.cityHack.trigger();
    const zoom = input.consumeZoom();
    if (zoom) {
      const st = this.game.settings;
      st.carZoom = clamp((st.carZoom || 1) * (1 + zoom * 0.12), 0.55, 2);
      this._zoomSave = 1; // saved a moment later, not on every scroll tick
    }
    if (this._zoomSave > 0 && (this._zoomSave -= dt) <= 0) save.write();
  }

  get respawnLabel() { return 'Unstick the car (back on the road)'; }
  respawnKey() { this._unstick(); }

  /** The big city map (M): the game waits while it's open. Click it to set a waypoint. */
  /**
   * The big map. pick: { title, hint, onPick } = choose one spot instead of
   * setting a waypoint (the Teleporter). Returns false if it can't open now.
   */
  openMap(pick = null) {
    if (this.over || this.inCard || this.paused || this.bigMap.isOpen) return false;
    this.inCard = true;
    this._mapJustOpened = true;
    this.game.input.exitPointerLock();
    this._updateClickPrompt();
    const p = this.player;
    this.bigMap.open({
      player: { x: p.pos.x, z: p.pos.z, heading: p.heading },
      dots: [...this.police.units.map((u) => ({ x: u.car.pos.x, z: u.car.pos.z, color: '#ff3346' })), ...(this.mode.minimapDots?.() ?? [])],
      target: this.beacon.group.visible ? this.beacon.pos : null,
      targetColor: this.beacon.color,
      waypoint: this.waypoint,
    }, pick ? pick.onPick : (w) => this.setWaypoint(w), () => { this.inCard = false; this._afterResume(); },
    pick ? { title: pick.title, hint: pick.hint, once: true } : undefined);
    return true;
  }

  /** Set (or clear, with null) the waypoint you picked on the big map. */
  setWaypoint(w) {
    this.waypoint = w ? { x: w.x, z: w.z } : null;
    this.waypointBeam.visible = !!w;
    if (w) this.waypointBeam.position.set(w.x, 35, w.z);
    if (!w) this.game.hud.setWaypoint(null);
  }

  /**
   * The Dirt Bike (one fixed step): hold Space for a wheelie (the front lifts,
   * a little extra pull), let go after a moment and it pops into a jump. Big
   * air and long wheelies get a cheer (and a little cash).
   */
  _dirtBike(dt) {
    const p = this.player, hud = this.game.hud;
    const can = !p.airborne && p.speed > 2.5;
    if (this.wheelieHeld && can) {
      this.wheelieT = (this.wheelieT || 0) + dt;
      p.speedFactor *= 1.05;
      if (this.wheelieT > 3 && !this.toldWheelie) { this.toldWheelie = true; hud.toast('Wheelie!', '3 seconds on one wheel', '#ffd040', 1.5); earn(this.game, 10, '', { quiet: true }); }
    } else {
      // let go: POP (a bunny hop, higher the faster you go)
      if (!this.wheelieHeld && (this.wheelieT || 0) > 0.25 && can) {
        p.airborne = true;
        p.airTime = 0;
        p.vy = 6.2 + Math.min(p.speed, 32) * 0.09;
        audio.sfx('jump', { vol: 0.9 });
      }
      this.wheelieT = 0;
      this.toldWheelie = false;
    }
    const want = p.airborne ? 0.1 : this.wheelieHeld && can ? 0.48 + Math.sin(this.time * 4) * 0.05 : 0;
    this.wheelieA = damp(this.wheelieA || 0, want, this.wheelieHeld ? 5 : 9, dt);
    // big air: a cheer when you land
    if (p.airborne) this.dirtAir = Math.max(this.dirtAir || 0, p.airTime);
    else if (this.dirtAir > 0.9) { hud.toast('Big air!', `${this.dirtAir.toFixed(1)} s off the ground`, '#ffd040', 1.5); earn(this.game, Math.round(this.dirtAir * 10), '', { quiet: true }); this.dirtAir = 0; }
    else this.dirtAir = 0;
  }

  /** How your vehicle handles: a stolen car, a snowmobile, the Dirt Bike (a part can put you on one), or your own car. */
  _specs() {
    if (this.mode.stolen) return stolenSpecs();
    if (this.mode.vehicle === 'snowmobile') return CAR_SPECS.snowmobile;
    if (this.mode.vehicle === 'dirtbike') return { ...CAR_SPECS.player, ...CAR_BODIES.find((b) => b.id === 'dirt').specs };
    if (this.mode.storyCar) return { ...CAR_SPECS.player, ...(CAR_BODIES.find((b) => b.id === this.mode.storyCar.body)?.specs || {}) };
    return playerCarSpecs(CAR_SPECS.player);
  }

  /** Are you on the Dirt Bike? (Space is then the wheelie; the phone's Nitro button says so.) */
  _setDirt() {
    this.dirt = this.mode.vehicle === 'dirtbike' || this.mode.storyCar?.body === 'dirt' || (!this.mode.stolen && !this.mode.storyCar && this.mode.vehicle !== 'snowmobile' && !!playerCarBody().dirt);
    this.game.touch?.setLabel?.('b', this.dirt ? 'Wheelie' : null);
  }

  /** Tip the Dirt Bike up round its back axle (the wheelie), after the physics placed it. */
  _dirtPose() {
    const w = this.playerMesh.userData.wheelie;
    if (!w) return;
    const a = this.dirt ? (this.wheelieA || 0) : 0, th = -a, P = w.pivot;
    w.group.rotation.x = th;
    w.group.position.set(0, P.y - (P.y * Math.cos(th) - P.z * Math.sin(th)), P.z - (P.y * Math.sin(th) + P.z * Math.cos(th)));
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
    const d = diff();
    const base = HEAT[this.mode.heat - 1];
    const heat = { ...base, speedFactor: base.speedFactor * d.copSpeed }; // (difficulty)
    const ground = this.city.groundHeight;

    // --- AI decisions (difficulty: one cop fewer on Easy, one more on Hard)
    const want = this.mode.copCount?.() ?? heat.cops;
    const cops = want > 0 ? Math.max(1, want + d.cops) : 0;
    this.police.setCount(cops, p, this.camera);
    this.police.update(dt, p, heat, this.camera);
    this.carGadgets.simulate(dt);
    this._helicopter(dt, cops);
    this.mode.simulate?.(dt);
    const all = [p, ...this.police.cars, ...this.traffic.cars, ...this.life.cars, ...(this.mode.extraCars?.() ?? [])];
    this.traffic.update(dt, p, this.camera, all, this.police.units);
    this.life.update(dt, p, this.camera, [p, ...this.police.cars]);

    // --- Admin: super speed and infinite nitro
    if (!(this.flatTyres > 0)) p.speedFactor = admin.flag('superSpeed') ? 1.35 : 1;
    if (admin.flag('infiniteNitro')) this.nitro = 1;

    // --- The Dirt Bike: wheelies and jumps
    if (this.dirt) this._dirtBike(dt);

    // --- Physics
    for (const car of all) car.step(dt, ground);
    for (const car of all) {
      const impact = collideCarWithWorld(car, this.city.world);
      if (car === p && impact > 5) this._damage((impact - 5) * 0.012, impact);
    }
    this._subway(dt);
    collideCars(all, (a, b, impact) => {
      a.lastImpact = Math.max(a.lastImpact, impact);
      b.lastImpact = Math.max(b.lastImpact, impact);
      if (a !== p && b !== p) return;
      const other = a === p ? b : a;
      const rec = this.nearTrack.get(other);
      if (rec) rec.hit = true;
      if (impact > 4) this._damage((impact - 4) * 0.008, impact);
      // A police motorbike goes down with one good knock
      const bikeUnit = other.isPolice && other.unit?.bike && impact > 5 && !(other.unit.stunned > 0) ? other.unit : null;
      if (bikeUnit) {
        bikeUnit.stunned = 4;
        bikeUnit.emp = false;
        bikeUnit.spinDir = Math.random() < 0.5 ? -1 : 1;
        other.gripFactor = 0.2;
        other.yawRate += bikeUnit.spinDir * 4;
        this.game.hud.toast('Bike down!', 'That police bike is out of the chase for a moment.', '#ff5a5a', 1.5);
      }
      if (other.isPolice && impact > 6) {
        this.mode.onPoliceRam?.();
        // Ram Plating (gadget): a hard hit spins the cruiser out.
        const u = (owns('ram') || owns('plough')) && this.police.units.find((x) => x.car === other);
        if (u && !(u.stunned > 0) && impact > 8) {
          u.stunned = 3;
          u.emp = false;
          u.spinDir = Math.random() < 0.5 ? -1 : 1;
          other.gripFactor = 0.2;
          other.yawRate += u.spinDir * 3;
          this.game.hud.toast('Rammed!', 'That cruiser is out of the chase for a moment.', '#ff5a5a', 1.5);
        }
      }
    });

    // --- Nitro: used by boosting, refilled by drifting and big air
    // (Turbo Tank gadget: lasts longer and refills faster)
    const tank = owns('tank');
    const dbl = admin.flag('doubleAll') ? 2 : 1; // (admin: Double everything)
    if (p.boosting) this.nitro = Math.max(0, this.nitro - dt * (tank ? 0.23 : 0.32) / dbl);
    if (p.drifting) this.nitro = Math.min(1, this.nitro + dt * (tank ? 0.24 : 0.16) * dbl);
    if (p.airborne) this.nitro = Math.min(1, this.nitro + dt * (tank ? 0.37 : 0.25) * dbl);
  }

  /** Looping sounds: engine, tyres, nitro, sirens (louder when close), music. */
  audioMix() {
    const p = this.player;
    const c = p.controls;
    audio.engine(p.speed, Math.max(0, c.throttle));
    let nearest = Infinity;
    for (const u of this.police.units) nearest = Math.min(nearest, Math.hypot(u.car.pos.x - p.pos.x, u.car.pos.z - p.pos.z));
    audio.sirenDistance(nearest);
    if (p.boosting && !this._wasBoosting) audio.sfx('nitroStart');
    this._wasBoosting = p.boosting;
    const chased = this.police.everSeen && !this.police.searching;
    const skid = p.airborne ? 0 : clamp(Math.abs(p.lateralSpeed) / 14, 0, 1) * (p.speed > 6 ? 1 : 0);
    return {
      engine: 0.35 + Math.max(0, c.throttle) * 0.2,
      screech: skid * 0.45,
      nitro: p.boosting ? 0.3 : 0,
      siren: this.police.units.length ? clamp(1 - nearest / 160, 0.03, 1) * 0.55 : 0,
      rotor: this.heli ? clamp(1 - Math.hypot(this.heli.pos.x - p.pos.x, this.heli.pos.z - p.pos.z) / 160, 0.05, 1) * 0.5 : 0,
      city: 0.07,
      music: 0.55,
      intensity: chased ? 0.85 + clamp(1 - nearest / 60, 0, 0.15) : 0.35,
    };
  }

  applySettings() {
    this.playerMesh.userData.paint?.color.setHex(playerCarColour());
  }

  /** Pause menu: customise your car (it changes right there on the road). */
  pauseButtons() {
    return [{ label: 'Your car', sub: 'Paint, stripes, wheels, underglow', onClick: () => showGarage(this.game, () => { this.paused = false; this.pause(); }, () => this.rebuildCar()) }];
  }

  /** Your car (or, in Frostvale, a snowmobile with you riding it). */
  _makePlayerMesh() {
    if (this.mode.stolen) return makeCarMesh({ kind: this.mode.stolen.kind, color: this.mode.stolen.color }); // (Free Run: a car you stole)
    const color = playerCarColour(), style = playerCarStyle();
    if (this.mode.vehicle === 'dirtbike') return makeCarMesh({ kind: 'player', color, style: { ...style, body: 'dirt' } }); // (the story puts you on the Dirt Bike)
    if (this.mode.storyCar) return makeCarMesh({ kind: 'player', color: this.mode.storyCar.color ?? color, style: { ...style, body: this.mode.storyCar.body } }); // (e.g. the gold car)
    return this.mode.vehicle === 'snowmobile'
      ? makeSnowmobileMesh({ color, style, look: currentLook(this.game.settings) })
      : makeCarMesh({ kind: 'player', color, style });
  }

  /** Your car changed (Your car): swap in a newly built car, same place, same headlight. */
  rebuildCar() {
    const old = this.playerMesh;
    if (!old) return;
    const mesh = this._makePlayerMesh();
    mesh.position.copy(old.position);
    mesh.rotation.copy(old.rotation);
    for (const c of [...old.children]) if (c.isLight || c === old.children.find((x) => x.isLight)?.target || c.type === 'Object3D') mesh.add(c);
    this.scene.remove(old);
    this.scene.add(mesh);
    this.playerMesh = mesh;
    this.player.mesh = mesh;
    if (!this.mode.stolen) this.player.spec = this._specs(); // (a different car drives differently)
    this._setDirt();
  }

  /** Crashes: a bang (and a message for big ones), but no damage: the car has no health. */
  _damage(amount, impact) {
    this.mode.onCrash?.(impact); // (a story part can care: something fragile in the car)
    if (impact > 5) { audio.sfx('crash', { vol: clamp(impact / 20, 0.3, 1) }); rumble(clamp(impact / 22, 0.3, 1), 90 + impact * 6); }
    if (impact > 14) this.game.hud.toast('Crash!', '', 'var(--red)');
  }

  frameUpdate(dt, frozen) {
    const p = this.player;
    const hud = this.game.hud;
    // Distance driven (Stats)
    if (!frozen && this._statPos) {
      const d = Math.hypot(p.pos.x - this._statPos.x, p.pos.z - this._statPos.z);
      if (d < 10) this._driven = (this._driven || 0) + d;
      if (this._driven > 60) { addStat(this.game, 'carM', this._driven); this._driven = 0; }
    }
    (this._statPos ||= p.pos.clone()).copy(p.pos);
    // M (or Esc) again closes the big map
    const input = this.game.input;
    // (not on the same frame it opened, or one press would open AND close it)
    if (this.bigMap.isOpen && !this._mapJustOpened && (input.wasPressed('map') || input.wasPressed('pause'))) this.bigMap.close();
    this._mapJustOpened = false;
    if (!frozen) {
      this.time += dt;
      this._updatePursuit(dt);
      this._updateBusted(dt);
      this._updateNearMisses();
      this._updateRoadblocks(dt);
      if (this.nitroPickups.update(dt, p)) {
        this.nitro = 1;
        audio.sfx('nitroStart');
        hud.toast('Nitro refilled!', 'Hold Space (or the Nitro button) to boost.', 'var(--cyan)', 2);
      }
      if (this.waypoint && Math.hypot(this.waypoint.x - p.pos.x, this.waypoint.z - p.pos.z) < 14) {
        this.setWaypoint(null);
        hud.toast('Waypoint reached', '', '#ff5ad0', 2);
      }
      this.carGadgets.update(dt);
      this.setAction(this.cityHack.update(dt) && !this.mode.ghost ? 'Hack junction' : null);
      this.mode.update(dt);
      this._updateEffects(dt);
    }
    // Meshes follow physics bodies
    p.syncMesh();
    this.police.syncMeshes(this.time);
    this.traffic.syncMeshes();
    this.life.syncMeshes();
    this.mode.syncMeshes?.();
    this.city.trafficLights.update(frozen ? 0 : dt);
    this.city.train.update(frozen ? 0 : dt);
    this.city.subway?.update(frozen ? 0 : dt);
    this.city.trams?.update(frozen ? 0 : dt);
    if (this.playerMesh.userData.flames) this.playerMesh.userData.flames.visible = p.boosting;
    this._dirtPose();
    updateUnderglow(this.playerMesh, this.time, p.airborne);
    this.playerMesh.userData.tailMat.color.setHex(p.controls.throttle < 0 ? 0xff2030 : 0x881018);
    this.beacon.ring.rotation.z += dt;

    this._syncCamera(dt, false);
    this.lighting.follow(p.pos);
    if (!frozen) this.tickTimeOfDay(dt);
    if (!frozen) this.weather.update(dt, this.camera.position);
    this.particles.update(frozen ? 0 : dt);
    this.particles.setDaylight(this.lighting.daylight);
    setShopDaylight(this.lighting.daylight);
    if (this.chimneySmoke) { this.chimneySmoke.update(frozen ? 0 : dt); this.chimneySmoke.setDaylight(this.lighting.daylight); }

    // HUD: speedometer, minimap, beacon marker
    if (this.dirt) hud.setSpeedo(p.speed * 3.6, clamp((this.wheelieA || 0) / 0.5, 0, 1), 'Wheelie'); // (the Dirt Bike: how far up the front wheel is)
    else hud.setSpeedo(p.speed * 3.6, this.nitro);
    const dots = this.police.units.map((u) => ({
      x: u.car.pos.x, z: u.car.pos.z,
      color: Math.floor(this.time * 4 + u.car.pos.x) % 2 ? '#ff3346' : '#3d7bff',
    }));
    if (this.mode.minimapDots) dots.push(...this.mode.minimapDots());
    dots.push(...this.nitroPickups.minimapDots());
    const target = this.beacon.group.visible ? this.beacon.pos : null;
    const police = this.police;
    const search = police.searching ? { x: police.lastKnown.x, z: police.lastKnown.z, r: police.searchRadius } : null;
    // The minimap only needs ~30 updates a second.
    this._mapTimer = (this._mapTimer || 0) - dt;
    if (this._mapTimer <= 0) {
      this._mapTimer = 1 / 30;
      this.minimap.draw({ x: p.pos.x, z: p.pos.z, heading: p.heading }, dots, target, this.time, this.beacon.color, search, this.waypoint);
    }
    if (this.waypoint) {
      this._wpVec = (this._wpVec || new THREE.Vector3()).set(this.waypoint.x, 4, this.waypoint.z);
      hud.setWaypoint(this._wpVec, this.camera, Math.hypot(this.waypoint.x - p.pos.x, this.waypoint.z - p.pos.z));
    }
    const mt = this.mode.markerTarget?.();
    if (mt) {
      hud.setMarker(mt.pos, this.camera, mt.label, mt.color, Math.hypot(mt.pos.x - p.pos.x, mt.pos.z - p.pos.z));
    } else if (target) {
      const bd = Math.hypot(target.x - p.pos.x, target.z - p.pos.z);
      hud.setMarker(target.clone().setY(4), this.camera, this.beacon.label, this.beacon.color, bd);
    } else hud.setMarker(null);

    if (this.game.showDebug) {
      hud.setDebug(`${this.game.fps.toFixed(0)} fps\ncalls ${this.game.renderer.info.render.calls}\n` +
        this.police.units.map((u) => u.mode[0]).join('') + ` seen ${this.police.timeSinceSeen.toFixed(1)}s`);
    } else hud.setDebug('');
  }

  /**
   * The police helicopter: it joins a chase when the heat is high (3 stars and
   * up). While your car is in its light the cops always know where you are.
   * It goes home when they've lost you for a while.
   */
  _helicopter(dt, cops) {
    const police = this.police, p = this.player;
    const chasing = cops > 0 && police.everSeen && !police.searching && !this.mode.pursuitPaused && !this.mode.ghost;
    if (!this.heli) {
      if (!chasing || this.mode.heat < 3 || this.mode.noHelicopter || !(this.time > 4)) return;
      const a = Math.random() * Math.PI * 2;
      this.heli = new ChaseHelicopter(this.scene, this.city.world, { x: p.pos.x + Math.cos(a) * 140, z: p.pos.z + Math.sin(a) * 140 });
      this.game.hud.toast('Police helicopter!', 'In its searchlight you can\'t lose the cops. Outrun it on a straight with nitro, or hide in a garage or under the railway.', 'var(--red)', 5);
      return;
    }
    if (this.time && police.jammed > 0) this.heli.blinded = Math.max(this.heli.blinded || 0, 0.2); // (radio jammed: they can't call you in)
    const lit = this.heli.chase(dt, p, diff().copSpeed) && !this.inGarage && !this.city.subway?.isUnder(p.pos.y); // (it can't see into the subway)
    if (lit) {
      police.lastKnown.copy(p.pos);
      police.timeSinceSeen = 0;
      if (police.searching) { police.searching = false; police.justReacquired = true; }
      police.everSeen = true;
    }
    // Lost you for a good while: it flies off home
    if (this.heli.lostFor > 25 || cops === 0 || this.mode.pursuitPaused) {
      this.heli.dispose();
      this.heli = null;
      if (cops > 0) this.game.hud.toast('The helicopter gave up', 'It\'s flying back to base.', 'var(--safe)', 2.5);
    }
  }

  /** Is the player somewhere the cops struggle to see (alley, park, under the El, a garage, the subway)? */
  get playerHidden() {
    const p = this.player.pos;
    return this.inGarage || this.city.isInAlley(p.x, p.z) || this.city.isInPark(p.x, p.z) || this.city.isUnderBridge(p.x, p.z, p.y) || !!this.city.subway?.isUnder(p.y);
  }

  /**
   * The subway: the trains knock you aside if you're on their track, the
   * light dims as you go down, and the first time you're down there it says so.
   */
  _subway(dt) {
    const sub = this.city.subway, p = this.player;
    if (!sub) return;
    const tram = this.city.trams?.hit(p.pos);
    const hit = sub.hit(p.pos) || tram;
    if (hit) {
      if (hit.axis === 'x') { p.pos.z += hit.push; p.vel.z = p.vel.z * 0.3 + hit.side * 7; p.vel.x = p.vel.x * 0.4 + hit.speed * 0.8; }
      else { p.pos.x += hit.push; p.vel.x = p.vel.x * 0.3 + hit.side * 7; p.vel.z = p.vel.z * 0.4 + hit.speed * 0.8; }
      p.syncMesh();
      if (!(this._trainHitT > 0)) {
        this._trainHitT = 2;
        this._damage(0.12, 22);
        audio.sfx('crash1', { vol: 0.9 });
        if (tram) this.game.hud.toast('Hit by a tram!', 'They don\'t stop for anyone: watch the tracks.', 'var(--red)', 2);
        else this.game.hud.toast('Hit by a subway train!', 'Keep off the track (the yellow line marks it).', 'var(--red)', 2);
      }
    }
    if (this._trainHitT > 0) this._trainHitT -= dt;
    // Darker down there (eases in and out on the ramps)
    const under = Math.min(1, Math.max(0, -p.pos.y / 5));
    this.lighting.under = (this.lighting.under || 0) + (under - (this.lighting.under || 0)) * Math.min(1, dt * 4);
    if (under > 0.9 && !this._subwaySaid) {
      this._subwaySaid = true;
      this.game.hud.toast('The subway', 'Tunnels under two avenues, with stations. The police can follow you down, but they lose sight of you easily. Mind the trains!', 'var(--cyan)', 4);
    }
  }

  get inGarage() {
    return this.city.isInGarage(this.player.pos.x, this.player.pos.z);
  }

  /** Losing the cops: stay out of sight long enough and they start searching. */
  _updatePursuit() {
    const police = this.police;
    if (this.mode.pursuitPaused) return; // ghost mode: no cops to lose
    // First time in a garage: explain what it's for.
    const inGarage = this.inGarage;
    if (inGarage && !this._wasInGarage) {
      this.game.hud.toast('Hiding spot', police.everSeen && !police.searching
        ? 'Stay in here, out of sight. The cops lose you fast in a garage.' : 'Parking garages hide you from the cops (blue P on the minimap).', 'var(--blue)', 4);
    }
    this._wasInGarage = inGarage;
    // You can't "lose" cops that haven't found you yet.
    if (!police.searching && police.everSeen) {
      // (Garage Keycard gadget: garages, parks and alleys lose them faster)
      const key = owns('keycard');
      const need = (this.inGarage ? (key ? 1 : EVADE_TIME_GARAGE) : this.playerHidden ? (key ? 3.5 : EVADE_TIME_HIDDEN) : EVADE_TIME) * diff().evade;
      if (police.timeSinceSeen > need) {
        police.searching = true;
        this.mode.onEvade?.();
        addStat(this.game, 'escapes');
      }
    }
    if (police.justReacquired) {
      police.justReacquired = false;
      this.game.hud.toast('Spotted!', 'They\'re back on your tail.', 'var(--red)');
      this.mode.onReacquire?.();
    }
  }

  /** Busted meter: fills when a cop is close and you're (nearly) stopped. */
  _updateBusted(dt) {
    const p = this.player;
    if (admin.flag('god')) { this.busted = 0; this.game.hud.setMeter(0, ''); return; } // admin god mode
    let close = 0;
    for (const u of this.police.units) {
      if (Math.hypot(u.car.pos.x - p.pos.x, u.car.pos.z - p.pos.z) < BUST_RADIUS) close++;
    }
    // About 3-4 seconds nearly stopped next to cops gets you busted; driving
    // off drains it quickly, so squeezing past them is fine.
    if (close > 0 && p.speed < 4) this.busted += dt * (0.2 + close * 0.06) * diff().bust;
    else this.busted -= dt * (p.speed > 10 ? 0.6 : 0.3);
    this.busted = clamp(this.busted, 0, 1);
    this.game.hud.setMeter(this.busted, this.busted > 0.01 && close ? 'BUSTED! Get moving!' : 'Busted', 'var(--blue)');
    if (this.busted >= 1) {
      this.busted = 0;
      if (noteCaught(this)) return; // (the third time: off to jail)
      audio.sfx('caught');
      this.game.hud.setMeter(0, '');
      this.mode.onBusted();
    }
  }

  /** Roadblocks and spike strips (only when the mode's rules allow them). */
  _updateRoadblocks(dt) {
    const p = this.player;
    const r = this.mode.roadblockRules?.() ?? null;
    const rules = r && { ...r, roadblockEvery: r.roadblockEvery * diff().roadblocks }; // (difficulty)
    if (this.roadblocks.update(dt, p, rules) === 'spiked') {
      this.flatTyres = 10;
      this.game.hud.toast('Tyres burst!', 'Spike strip. Less grip and a lower top speed for 10 seconds.', 'var(--red)');
      audio.sfx('spike');
      for (let i = 0; i < 30; i++) {
        this.particles.emit(p.pos.x, 0.4, p.pos.z, { vx: (Math.random() - 0.5) * 8, vy: 2 + Math.random() * 3, vz: (Math.random() - 0.5) * 8, size: 0.35, grow: -0.2, life: 0.5, alpha: 1, color: [1, 0.7, 0.2], glow: true });
      }
    }
    if (this.flatTyres > 0) {
      this.flatTyres -= dt;
      p.speedFactor = 0.6;
      p.gripFactor = 0.45;
      // Sparks from the rims
      if (p.speed > 5 && Math.random() < 0.5) {
        this.particles.emit(p.pos.x - p.fwdX * 1.4, 0.2, p.pos.z - p.fwdZ * 1.4, { vx: -p.vel.x * 0.2 + (Math.random() - 0.5) * 3, vy: 1.5, vz: -p.vel.z * 0.2 + (Math.random() - 0.5) * 3, size: 0.3, grow: -0.2, life: 0.35, alpha: 1, color: [1, 0.75, 0.3], glow: true });
      }
      if (this.flatTyres <= 0) {
        p.speedFactor = 1;
        p.gripFactor = this.mode.part?.ice ? 0.62 : 1; // (back to icy if the roads are)
        this.game.hud.toast('Tyres re-inflated', 'Run-flat foam did its job.', 'var(--safe)');
      }
    }
  }

  /** Near misses: pass close to another car at speed without touching it. */
  _updateNearMisses() {
    const p = this.player;
    for (const car of [...this.police.cars, ...this.traffic.cars]) {
      const d = Math.hypot(car.pos.x - p.pos.x, car.pos.z - p.pos.z);
      let rec = this.nearTrack.get(car);
      if (d < NEAR_MISS_DIST) {
        if (!rec) this.nearTrack.set(car, (rec = { hit: false, fast: false }));
        const rel = Math.hypot(car.vel.x - p.vel.x, car.vel.z - p.vel.z);
        if (p.speed > 15 && rel > 10) rec.fast = true;
      } else if (rec && d > NEAR_MISS_DIST + 1) {
        if (rec.fast && !rec.hit) {
          this.nitro = Math.min(1, this.nitro + (owns('tank') ? 0.22 : 0.15));
          audio.sfx('whoosh');
          this.mode.onNearMiss?.();
        }
        this.nearTrack.delete(car);
      }
    }
  }

  /**
   * Smoke and spray from the wheels. Drifting (or spinning the wheels from a
   * standstill) puffs smoke out of both back tyres; on snow it's a spray of
   * powder instead, and a snowmobile throws snow up behind it at speed.
   */
  _updateEffects(dt) {
    const p = this.player;
    const fx = p.fwdX, fz = p.fwdZ;
    const sled = this.mode.vehicle === 'snowmobile';
    const snowy = sled || this.lighting.snow; // (snow on the roads)
    const spin = p.controls.throttle > 0.6 && p.speed < 7 && p.speed > 0.3; // (wheelspin pulling away)
    if (p.drifting || spin) {
      const rearZ = sled ? 1.25 : 1.4, sides = sled ? [-0.3, 0.3] : [-0.98, 0.98];
      for (const side of sides) {
        if (Math.random() > (spin && !p.drifting ? 0.45 : 0.85)) continue;
        const x = p.pos.x - fx * rearZ - fz * side, z = p.pos.z - fz * rearZ + fx * side;
        const kick = (Math.random() - 0.5) * 1.4;
        if (snowy) {
          this.particles.emit(x, p.pos.y + 0.25, z, { vx: -p.vel.x * 0.25 + kick, vy: 1.6 + Math.random(), vz: -p.vel.z * 0.25 + kick,
            size: 0.7, grow: 2.6, life: 1.1, alpha: 0.6, color: [0.95, 0.97, 1.0], drag: 1.8 });
        } else {
          this.particles.emit(x, p.pos.y + 0.3, z, { vx: -p.vel.x * 0.12 + kick, vy: 0.45 + Math.random() * 0.4, vz: -p.vel.z * 0.12 + kick,
            size: 1.1, grow: 3.4, life: 2.4, alpha: 0.36, color: [0.8, 0.8, 0.83], drag: 1.2 });
        }
      }
    }
    // A snowmobile throws powder up behind its track
    if (sled && p.speed > 6 && Math.random() < Math.min(0.9, p.speed / 30)) {
      const x = p.pos.x - fx * 1.35, z = p.pos.z - fz * 1.35;
      this.particles.emit(x + (Math.random() - 0.5) * 0.6, p.pos.y + 0.2, z + (Math.random() - 0.5) * 0.6, { vx: -fx * 2 + (Math.random() - 0.5), vy: 1.4 + Math.random() * 0.8, vz: -fz * 2 + (Math.random() - 0.5),
        size: 0.5, grow: 2, life: 0.8, alpha: 0.5, color: [0.95, 0.97, 1.0], drag: 2 });
    }
    if (this.chimneySmoke) this._chimneyPuffs(dt);
  }

  /** Chimney smoke: the chimneys near you puff now and then. */
  _chimneyPuffs(dt) {
    this.chimneyT += dt;
    if (this.chimneyT < 0.12) return;
    this.chimneyT = 0;
    const c = this.player.pos;
    for (const ch of this.city.chimneys) {
      if (Math.abs(ch[0] - c.x) > 150 || Math.abs(ch[2] - c.z) > 150 || Math.random() > 0.3) continue;
      this.chimneySmoke.emit(ch[0] + (Math.random() - 0.5) * 0.4, ch[1] + 0.2, ch[2] + (Math.random() - 0.5) * 0.4, {
        vx: 0.7 + Math.random() * 0.4, vy: 1.1 + Math.random() * 0.5, vz: 0.25, size: 1.4, grow: 2.2, life: 6.5, alpha: 0.36,
        color: [0.7, 0.72, 0.76], drag: 0.15, fadeIn: 0.8 });
    }
  }

  _syncCamera(dt, snap) {
    const p = this.player;
    // Scroll wheel / pinch zooms the chase camera (0.55x - 2x, remembered).
    const z = this.game.settings.carZoom || 1;
    const dist = (this.camMode === 0 ? 8.5 : 13) * z;
    const height = (this.camMode === 0 ? 3.1 : 5.5) * (0.6 + z * 0.4);
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

  renderFrame(renderer) {
    this.game.post.render(this.scene, this.camera, this.game.dt);
  }

  resize(w, h) {
    if (!this.camera) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  teardown() {
    this.heli?.dispose();
    this.heli = null;
    this.mode?.teardown?.();
    this.weather?.dispose();
    this.weather = null;
    this.bigMap?.close();
    this.game.hud.el.map.removeEventListener('pointerdown', this._onMapTap);
    this.nitroPickups?.clear();
    this.carGadgets?.dispose();
    this.cityHack?.dispose();
    this.roadblocks?.clear();
    this.police?.clear();
    this.traffic?.clear();
    this.life?.dispose();
    this.particles?.dispose();
    this.chimneySmoke?.dispose();
    this.scene?.traverse((o) => {
      if (o.geometry && !o.isInstancedMesh) o.geometry.dispose();
    });
    this.scene = null;
    this.game.hud.hideAll();
  }
}

/** A stolen car: an ordinary car, a bit slower than yours. */
function stolenSpecs() {
  return { ...CAR_SPECS.player, maxSpeed: CAR_SPECS.player.maxSpeed * 0.85, accel: CAR_SPECS.player.accel * 0.85 };
}

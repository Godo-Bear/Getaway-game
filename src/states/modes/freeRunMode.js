import * as THREE from 'three';
import { generateRooftopCity, findClearRoofSpot } from '../../world/rooftopCity.js';
import { makeGlowMaterial } from '../../world/materials.js';
import { Helicopter } from '../../ai/helicopter.js';
import { OfficerSquad, rooftopCitySpawns, inHideSpot } from '../../ai/officer.js';
import { formatTime, makeRng, clamp } from '../../core/utils.js';
import { noteCaught } from '../../core/jail.js';
import { audio } from '../../core/audio.js';
import { admin } from '../../core/admin.js';
import { diff } from '../../core/difficulty.js';
import { Crowd, Shopkeepers } from '../../ai/crowd.js';
import { FootMap } from '../../ui/footMap.js';
import { CrewTags } from '../../world/crewTags.js';
import { addStat, maxStat } from '../../core/stats.js';
import { save } from '../../core/save.js';
import { FreeJobs, Challenges, openCounter } from './freeActivities.js';
import { ParkedCars, BikeDocks, CrewFollower, Safehouse, CREW } from './freeGetAround.js';
import { FootTraffic, FootDrive, pushFromCars } from './freeTraffic.js';
import { Car } from '../../vehicles/car.js';
import { freeSession, freeMap, switchFreeRoam, freeEarn, freeRoamPauseButtons, applyFreeSky, busyness, isRushHour } from './freeRoam.js';
import { dressAlpineTown } from '../../world/levels/chapter8Town.js';

// Free Run, on foot: roam the rooftops. One half of a Free Run session
// (the other half is FreeDriveMode, in the car).
//
//  - Cash bags on the roofs (green beams) earn cash for the Shop
//  - People walk the pavements and the parks (walk with them and the
//    police on foot lose you in the crowd)
//  - Walk into the little shops at street level and rob the tills
//    (police on: the alarm brings them running)
//  - Press T (or "Get in a car") to drive the city; park in a garage there
//    to come back up here. (Your own car isn't parked on the street.)
//  - Getting around (freeGetAround.js): steal parked cars, ride bikes and
//    e-scooters from the docks, bring a crew member along, and the safehouse
//    (lay low and save, garage, wardrobe, gadgets, start here)
//  - Traffic (freeTraffic.js): cars driving round the blocks, pulling over
//    to park; police cars when you're wanted. Steal a parked or stopped car
//    and drive it right here (no loading); E to get out.
//  - Police (optional, pause menu): one helicopter. Caught = back to safety
//    and a few dollars lighter; it never ends the run.

const BAG_CASH = 25;
const BAG_COUNT = 3;
const ESCAPE_TIME = 20; // seconds out of the light (police on) for an escape bonus

export class FreeRunMode {
  constructor(state, params = {}) {
    this.state = state;
    this.fromCar = !!params.fromCar; // (just got out of the car: start next to it)
    this.police = freeSession(state.game).police;
    this.map = freeMap(state.game);          // (which city: picked in the Free Run menu)
    applyFreeSky(this, state.game, this.map); // (the time and weather you picked; the clock keeps going)
    this.hudSections = ['tl', 'map', 'meter', 'controls', 'marker'];
    this.heli = null;
  }

  build() {
    const city = generateRooftopCity(this.map.foot);
    this.city = city;
    if (this.map.foot.alpine) {
      // Frostvale: snowy pitched roofs, chimneys, the forest and the mountains.
      // The chalets' roofs are steep, so it's played down in the streets.
      dressAlpineTown(city, this.map.foot.blocks);
      city.groundLevel = true;
      const mid = city.walks.slice().sort((a, b) => Math.hypot(...a.a) - Math.hypot(...b.a))[0];
      city.spawn = new THREE.Vector3(mid.a[0], 0.05, mid.a[1]);
    }
    this.rng = makeRng(99);
    this._buildBags();
    this._buildCars();
    // People on every pavement and park path near you, and staff in the shops
    const n = { low: 8, medium: 14, high: 20 }[this.state.game.settings.graphics] ?? 14;
    const cold = !!this.map.snow; // (winter coats in Frostvale)
    this.crowd = new Crowd(city.group, city.world, [], { pool: { lanes: city.walks, count: n }, seed: 21, cold });
    this.keepers = new Shopkeepers(city.group, city.shops, { count: 3, cold });
    // Police on foot: up to six (how many are out depends on the police
    // setting and your wanted level)
    this.officers = new OfficerSquad(this.state.scene, city.world, rooftopCitySpawns(city), { count: 6, speed: 0.84 * diff().officerSpeed, streets: true });
    this.officers.setActive(0);
    // Hidden crew tags to collect (remembered per map)
    this.tags = new CrewTags(city.group, city, this.map.id, { seed: this.map.foot.seed });
    // Jobs from contacts, parkour challenges, and what you've bought
    this.jobs = new FreeJobs(this);
    this.challenges = new Challenges(this);
    this.buffs = { speed: 0 };
    // Getting around: parked cars to steal, bike docks, the safehouse
    this.parked = new ParkedCars(this);
    this.docks = new BikeDocks(this);
    this.safehouse = new Safehouse(this);
    this.traffic = new FootTraffic(this, { count: { low: 6, medium: 9, high: 12 }[this.state.game.settings.graphics] ?? 9 });
    this.drive = null;
    this.heat = 0;
    this.calm = 0;
    return city;
  }

  // ---------------------------------------------------------------- cash bags
  _buildBags() {
    this.bags = [];
    for (let i = 0; i < BAG_COUNT; i++) {
      const g = new THREE.Group();
      const bag = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.4), new THREE.MeshLambertMaterial({ color: 0x3b4a2a, emissive: 0x2a5a20, emissiveIntensity: 0.6 }));
      bag.position.y = 0.9;
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.0, 28), makeGlowMaterial(0x4dffa6, 0.8));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.05;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 50, 10, 1, true), makeGlowMaterial(0x4dffa6, 0.1));
      beam.position.y = 25;
      g.add(bag, ring, beam);
      this.city.group.add(g);
      this.bags.push({ group: g, bag, ring, pos: new THREE.Vector3() });
    }
  }

  _placeBag(b) {
    const p = this.state.player?.pos || this.city.spawn;
    if (this.city.groundLevel) {
      // (Frostvale: on the pavements and in the parks)
      for (let i = 0; i < 20; i++) {
        const w = this.city.walks[Math.floor(this.rng() * this.city.walks.length)], t = this.rng();
        const x = w.a[0] + (w.b[0] - w.a[0]) * t, z = w.a[1] + (w.b[1] - w.a[1]) * t, d = Math.hypot(x - p.x, z - p.z);
        if (d < 25 || d > 110 || this.bags.some((o) => o !== b && o.group.visible && Math.hypot(o.pos.x - x, o.pos.z - z) < 20)) continue;
        b.pos.set(x, 0.05, z); b.group.position.copy(b.pos); b.group.visible = true; return;
      }
      b.group.visible = false;
      return;
    }
    const candidates = this.city.buildings.filter((bd) => {
      if (bd.tower) return false;
      const d = Math.hypot((bd.minX + bd.maxX) / 2 - p.x, (bd.minZ + bd.maxZ) / 2 - p.z);
      return d > 25 && d < 110 && !this.bags.some((o) => o !== b && o.group.visible && Math.hypot(o.pos.x - (bd.minX + bd.maxX) / 2, o.pos.z - (bd.minZ + bd.maxZ) / 2) < 20);
    });
    for (let i = 0; i < 10 && candidates.length; i++) {
      const bd = candidates[Math.floor(this.rng() * candidates.length)];
      const spot = findClearRoofSpot(this.city.world, bd, this.rng);
      if (spot) { b.pos.copy(spot); b.group.position.copy(spot); b.group.visible = true; return; }
    }
    b.group.visible = false;
  }

  // ---------------------------------------------------------------- the car
  /**
   * Where you step out when you get out of your car (spots on the streets near
   * the start). Your own car isn't parked on the street any more: press T
   * (or "Get in a car") to drive. The street has everyone else's cars.
   */
  _buildCars() {
    const c = this.city, w = c.world, sp = c.spawn;
    const spots = [];
    for (let i = 0; i < c.blockCenters.length - 1; i++) {
      const street = c.blockCenters[i] + c.pitch / 2;
      for (const along of c.blockCenters) {
        spots.push({ x: street, z: along, heading: 0 });   // streets running north-south
        spots.push({ x: along, z: street, heading: Math.PI / 2 }); // east-west
      }
    }
    const clear = (s) => w.query(s.x - 1.6, 0.3, s.z - 2.6, s.x + 1.6, 3, s.z + 2.6, []).length === 0 && w.groundHeight(s.x, s.z, 3) < 1;
    const picked = spots.filter(clear)
      .sort((a, b) => Math.hypot(a.x - sp.x, a.z - sp.z) - Math.hypot(b.x - sp.x, b.z - sp.z))
      .slice(0, 5);
    this.carSpots = picked.map((s) => ({ pos: new THREE.Vector3(s.x, w.groundHeight(s.x, s.z, 3), s.z), heading: s.heading }));
    this.cars = []; // (no car of yours parked here)
  }

  // ---------------------------------------------------------------- run
  start() {
    const s = this.state, hud = s.game.hud;
    this.spotted = 0;
    this.outOfLight = 0;
    this.heli?.dispose();
    this.heli = null;
    this.heat = 0;
    this.calm = 0;
    this.map2 ||= new FootMap(s, this.city); // (the minimap, and M for the big map)
    for (const b of this.bags) this._placeBag(b);
    hud.setPhase(`Free Run · ${this.map.name}${this.police ? ' · police on' : ''}`);
    hud.setObjective(this.city.groundLevel ? `Explore ${this.map.name}` : 'Explore the rooftops');
    this._carButton();
    this.setCrew(freeSession(s.game).crew || null, { quiet: true });
    if (this.fromCar && this.carSpots.length) {
      // Out of the car: on the street beside it, facing the way it's parked
      this.fromCar = false;
      const c = this.carSpots[0], h = c.heading;
      s.placePlayer(new THREE.Vector3(c.pos.x + Math.cos(h) * 2.4, c.pos.y, c.pos.z - Math.sin(h) * 2.4), h - Math.PI);
      hud.toast('On foot', 'Climb the yellow ladders to the rooftops and grab the cash bags. Press T (or "Get in a car") to drive again.', 'var(--amber)', 5);
      return;
    }
    if (save.data.freeStart?.[this.map.id]) {
      // (Start here: at the safehouse door)
      const sp = this.safehouse.startPos;
      s.placePlayer(sp, Math.atan2(this.safehouse.out.x, this.safehouse.out.z));
      this.follower?.pc.teleport(sp.x - 1.5, sp.y + 0.05, sp.z - 1.5, 0);
    }
    hud.toast('Free Run', 'Grab the cash bags (green beams). Want to drive? Press "Get in a car" (T): no need to find it.', 'var(--amber)', 6);
  }

  /** A button on screen that puts you straight in your car (no walking to find it). */
  _carButton() {
    this.carBtn?.remove();
    const b = document.createElement('button');
    b.className = 'free-car-btn below-map';
    b.innerHTML = '🚗 Get in a car <kbd>T</kbd>';
    const go = (e) => { e.preventDefault(); e.stopPropagation(); this.toCar = true; };
    b.addEventListener('pointerdown', go);
    b.addEventListener('click', (e) => e.stopPropagation());
    document.body.appendChild(b);
    this.carBtn = b;
  }

  pauseButtons() {
    const crew = freeSession(this.state.game).crew || null;
    const next = { null: 'mags', mags: 'theo', theo: 'ricky', ricky: null }[crew];
    return [...freeRoamPauseButtons(this.state, 'foot'),
      { label: `Crew: ${crew ? CREW[crew] : 'nobody'}`, sub: next ? `Bring ${CREW[next]} along instead` : 'Go alone', onClick: () => { this.setCrew(next); this.state.resume(); } }];
  }

  /** Bring a crew member along (or nobody): they follow you everywhere. */
  setCrew(who, { quiet = false } = {}) {
    freeSession(this.state.game).crew = who;
    this.follower?.dispose();
    this.follower = who ? new CrewFollower(this, who) : null;
    if (who && !quiet) this.state.game.hud.toast(`${CREW[who]} is with you`, 'Your crew follows you everywhere and knocks down police who get too close.', 'var(--cyan)', 3);
  }

  /** Riding a bike: your legs stay still (the bike does the work). */
  poseFor(p) {
    if (!this.docks?.ride || p.state !== 'ground') return p;
    const pose = Object.create(p);
    Object.defineProperty(pose, 'horizontalSpeed', { value: 0 });
    return pose;
  }

  audioMix() {
    if (!this.heli) return { music: 0.3, intensity: 0.2 };
    const p = this.state.player.pos;
    const d = Math.hypot(this.heli.pos.x - p.x, this.heli.pos.z - p.z);
    return { rotor: clamp(1 - d / 110, 0.05, 1) * 0.5, music: 0.45, intensity: 0.3 + this.spotted * 0.6 };
  }

  /** Driving a stolen car: you don't walk (your controls drive it). */
  get inputLocked() { return !!this.drive; }

  update(dt) {
    const s = this.state, p = s.player, hud = s.game.hud, t = s.time;
    // In a car you stole: drive it (E to get out)
    if (this.drive) this._driving(dt);
    // The traffic (and police cars when you're wanted)
    this.traffic.update(dt, { wanted: this.stars, target: this.stars ? (this.officers?.seesPlayer || this.drive ? p.pos : (this.officers?.lastKnown || p.pos)) : null, driving: this.drive?.car || null });
    if (!this.drive) {
      const hit = pushFromCars(p, this.traffic.all.map((c) => c.car));
      if (hit && !(this._hitT > 0)) {
        this._hitT = 2;
        p.stumbleTimer = 1.1;
        p.vel.x += hit.vel.x * 0.6; p.vel.z += hit.vel.z * 0.6;
        audio.sfx('crash0', { vol: 0.5 });
        hud.toast('Watch the traffic!', '', 'var(--red)', 1.5);
      }
      if (this._hitT > 0) this._hitT -= dt;
    }

    // Cash bags
    for (const b of this.bags) {
      if (!b.group.visible) continue;
      b.bag.rotation.y += dt * 2;
      b.ring.rotation.z += dt;
      if (p.pos.distanceTo(b.pos) < 2.2) { // running past it picks it up
        freeEarn(s.game, BAG_CASH * (this.police ? 2 : 1) * (this.charm ? 2 : 1), 'Cash bag!');
        this._placeBag(b);
      }
    }

    // The "Get in a car" button (or T): straight into the car, wherever you are
    if (this.toCar || s.game.input.wasPressed('car')) {
      this.toCar = false;
      audio.sfx('door', { vol: 0.6 });
      switchFreeRoam(s, 'car');
      return;
    }

    // The clock (carries on in the car) and how busy the streets are
    const hour = s.lighting.hour;
    freeSession(s.game).hour = hour;
    this.crowd.share = busyness(hour);
    const rush = isRushHour(hour);
    if (rush && !this._rush && this.timeCycle) hud.toast('Rush hour', 'The pavements are packed: easy to get lost in the crowd.', 'var(--cyan)', 3);
    this._rush = rush;
    this.crowd.update(dt, p);
    this.keepers.update(dt, p);
    // Crew tags
    const tag = this.tags.update(dt, p);
    if (tag) {
      const n = this.tags.found, all = this.tags.total;
      addStat(s.game, 'tags');
      freeEarn(s.game, 25, `Crew tag ${n}/${all}!`, n < all ? 'Hidden on the hardest roofs (and gazebos, fire escapes...). Find them all for a big bonus.' : '');
      audio.sfx('checkpoint', { vol: 0.8 });
      if (n === all) { freeEarn(s.game, 1000, `Every crew tag in ${this.map.name}!`, 'The whole city knows your crew now.'); audio.sfx('win'); }
    }

    // Shops: walk in through the door; rob the till (once a shop)
    const inShop = p.pos.y < 2 ? this.city.shops?.find((sh) => sh.inside(p.pos.x, p.pos.z)) : null;
    if (inShop !== this.inShop) {
      this.inShop = inShop;
      if (inShop && !inShop.visited) {
        inShop.visited = true;
        hud.toast(inShop.name, inShop.robbed ? 'Already cleaned out.' : 'Walk round the counter to the till to rob it. Duck behind the counter to hide from the police.', 'var(--amber)', 3);
      }
    }
    const atTill = inShop && !inShop.robbed && Math.hypot(inShop.till.x - p.pos.x, inShop.till.z - p.pos.z) < 1.6 ? inShop : null;
    const contact = atTill ? null : this.jobs.nearContact(p);
    const dock = atTill || contact ? null : this.docks.nearDock(p);
    const riding = !!this.docks.ride;
    const busy = atTill || contact || dock || riding || this.drive;
    const steal = busy ? null : this.parked.update(dt, p) || this.traffic.stealable(p);
    if (busy) this.parked.update(dt, { pos: { x: p.pos.x, y: 99, z: p.pos.z } }); // (keep the cars near you)
    const home = !busy && !steal && this.safehouse.near(p);
    s.setAction(this.drive ? 'Get out' : atTill ? 'Shop counter' : contact ? 'Take a job' : riding ? 'Get off' : dock ? (dock.scooter ? 'Ride an e-scooter' : 'Ride a bike')
      : steal ? 'Steal car' : home ? 'Safehouse' : null);
    if (s.game.input.wasPressed('interact') && !this._exitedNow) {
      if (atTill) { openCounter(this, atTill); return; } // (buy something, or rob it)
      if (contact) this.jobs.start(contact);
      else if (riding || dock) this.docks.toggle(dock);
      else if (steal) { this._steal(steal); return; }
      else if (home) { this.safehouse.open(); return; }
    }
    this.docks.update(dt, p);
    this.follower?.update(dt);
    // What you bought (running faster for a while), or riding
    if (this.buffs.speed > 0) this.buffs.speed -= dt;
    p.speedScale = Math.max(this.buffs.speed > 0 ? 1.15 : 1, this.docks.speed);
    // Jobs and challenges (they point the marker while they're on)
    const job = this.jobs.update(dt);
    const race = this.challenges.update(dt);
    this._shutters(dt);
    // Behind a shop counter: out of sight
    const behindCounter = !!inShop && Math.hypot(inShop.keeper.pos.x - p.pos.x, inShop.keeper.pos.z - p.pos.z) < 1.7;
    if (behindCounter && !this._counterTip) { this._counterTip = true; hud.toast('Behind the counter', 'The police can\'t see you back here.', 'var(--safe)', 2); }
    if (!behindCounter) this._counterTip = false;

    // The police: the session's police setting, plus your wanted level
    this._police(dt, inShop, behindCounter);

    // Marker: a waypoint you set on the map, the nearest cash bag, or the car when you're down on the street
    let best = null, bd = Infinity;
    for (const b of this.bags) {
      if (!b.group.visible) continue;
      const d = p.pos.distanceTo(b.pos);
      if (d < bd) { bd = d; best = b; }
    }
    const dots = [
      ...this.bags.filter((b) => b.group.visible).map((b) => ({ x: b.pos.x, z: b.pos.z, color: '#4dffa6' })),
      ...(this.officers?.units || []).filter((u) => !u.inactive && u.model.root.visible).map((u) => ({ x: u.pc.pos.x, z: u.pc.pos.z, color: '#ff3346' })),
      ...(this.heli ? [{ x: this.heli.pos.x, z: this.heli.pos.z, color: '#ff3346', size: 1.8 }] : []),
    ];
    for (const c of this.jobs.contacts) if (!this.jobs.job) dots.push({ x: c.pos.x, z: c.pos.z, color: '#ffb020', size: 1.3 });
    for (const d of this.docks.docks) dots.push({ x: d.pos.x, z: d.pos.z, color: d.scooter ? '#7dff8a' : '#39a8ff', size: 0.8 });
    dots.push({ x: this.safehouse.door.x, z: this.safehouse.door.z, color: '#4dffa6', size: 1.6 });
    if (this.follower) dots.push({ x: this.follower.pc.pos.x, z: this.follower.pc.pos.z, color: '#39e6ff', size: 1 });
    for (const c of this.challenges.courses) if (!this.challenges.run) dots.push({ x: c.pts[0].x, z: c.pts[0].z, color: '#39e6ff', size: 1.2 });
    if (this.tagScan) for (const tg of this.tags.tags) if (!tg.found) dots.push({ x: tg.pos.x, z: tg.pos.z, color: '#ffd040', size: 0.8 });
    const goal = job?.pos || race?.pos || null;
    const way = this.map2.update(dots, goal || (best ? best.pos : null), goal ? (race ? '#39e6ff' : '#ffb020') : '#4dffa6');
    if (goal) {
      hud.setMarker(goal.clone().setY(goal.y + 1.6), s.camera, job ? job.label : race.label, race ? '#39e6ff' : '#ffb020', p.pos.distanceTo(goal));
    } else if (way) {
      hud.setMarker(new THREE.Vector3(way.x, 2, way.z), s.camera, 'Waypoint', '#ff5ad0', Math.hypot(way.x - p.pos.x, way.z - p.pos.z));
    } else if (best) hud.setMarker(best.pos.clone().setY(best.pos.y + 1.5), s.camera, 'Cash', 'var(--safe)', bd);
    else hud.setMarker(null);
    const stars = this.stars;
    const doing = job ? `<span>${job.name} <b style="color:${job.left < 15 ? 'var(--red)' : '#ffb020'}">${formatTime(Math.max(0, job.left))}</b></span>`
      : race ? `<span>${race.name} <b style="color:#39e6ff">${formatTime(race.t)}</b>${race.best ? ` · best ${formatTime(race.best)}` : ''}</span>` : '';
    hud.setStats(`${doing}${this.drive ? `<span>Speed <b>${Math.round(this.drive.car.speed * 3.6)} km/h</b></span>` : ''}<span>Time <b>${formatTime(t)}</b></span><span>Cash this session <b style="color:var(--safe)">$${freeSession(s.game).cash}</b></span>` +
      `<span>Wanted <b style="color:${stars ? '#ffd040' : '#6a6f7c'};letter-spacing:1px">${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}</b></span>` +
      `<span>Tags <b style="color:#ffd040">${this.tags.found}/${this.tags.total}</b></span>`);
  }

  // ---------------------------------------------------------------- stolen cars

  /**
   * Break in and drive off, right here (no loading). A parked car's owner
   * calls it in; pulling a driver out of a stopped car is worse.
   */
  _steal(what) {
    const s = this.state, hud = s.game.hud;
    let car, mesh, jacked = false;
    if (what.spot) { // (a parked car)
      mesh = this.parked.takeMesh(what);
      car = new Car({}, mesh);
      car.place(mesh.position.x, mesh.position.z, mesh.rotation.y);
    } else { // (a car in the traffic: stopped at the lights, or pulled over)
      this.traffic.take(what);
      car = what.car; mesh = what.mesh;
      jacked = what.state !== 'abandoned';
    }
    this.drive = new FootDrive(this, car, mesh);
    this.onCrime(jacked ? 'assault' : 'theft');
    if (jacked) this.onCrime('theft');
    addStat(s.game, 'carsStolen');
    audio.sfx('glass', { vol: 0.5 });
    audio.sfx('door', { vol: 0.6 });
    hud.toast(jacked ? 'Carjacked!' : 'Stolen car!', 'Drive it right here: E to get out. The owner\'s calling the police.', 'var(--red)', 3.5);
  }

  /** Driving the car you stole. */
  _driving(dt) {
    const s = this.state, d = this.drive, hud = s.game.hud;
    d.update(dt);
    this._exitedNow = false;
    // Knock over anyone in the way (that's assault)
    if (d.car.speed > 5) {
      for (const c of this.crowd.people) {
        if (c.knock > 0 || c.model.root.visible === false) continue;
        if (Math.hypot(c.body.pos.x - d.car.pos.x, c.body.pos.z - d.car.pos.z) < 2) {
          this.crowd.knockDown(c, d.car.fwdX, d.car.fwdZ);
          audio.sfx('punch', { vol: 0.5 });
          if (!(this._runOver > 0)) { this._runOver = 3; this.onCrime('assault'); }
        }
      }
    }
    if (this._runOver > 0) this._runOver -= dt;
    // Boxed in by a police car while stopped: busted
    const cop = this.traffic.cops.find((c) => Math.hypot(c.car.pos.x - d.car.pos.x, c.car.pos.z - d.car.pos.z) < 7.5);
    this._boxed = cop && d.stopped > 0.5 ? (this._boxed || 0) + dt : 0;
    if (this._boxed > 0) hud.setMeter(Math.min(1, this._boxed / 2.5), 'BUSTED! Get moving!', 'var(--blue)');
    if (this._boxed >= 2.5 && !admin.flag('god')) {
      this._boxed = 0;
      this._getOut();
      this._caught('Busted! The police boxed you in. Back to safety.');
      return;
    }
    if (s.game.input.wasPressed('interact')) { this._getOut(); this._exitedNow = true; }
  }

  _getOut() {
    const d = this.drive;
    if (!d) return;
    d.exit();
    this.traffic.give(d.car, d.mesh);
    this.drive = null;
    this.state.game.hud.setMeter(0, '');
    audio.sfx('door', { vol: 0.6 });
  }

  // ---------------------------------------------------------------- crime and the police

  /** Wanted level, 0-5 stars. */
  get stars() {
    return Math.min(5, Math.ceil(this.heat - 0.01));
  }

  /**
   * A crime (from here or onFootState): it raises your wanted level. More
   * stars = more police on foot; three or more and the helicopter comes.
   */
  onCrime(kind) {
    const before = this.stars;
    const add = { till: 1, officer: 1, assault: 0.5, pickpocket: 0.34, theft: 0.5 }[kind] ?? 0.5;
    this.heat = Math.min(5, this.heat + add);
    this.calm = 0;
    if (kind === 'till' || kind === 'officer') this.officers?.alert(10);
    maxStat(this.state.game, 'maxWanted', this.stars);
    if (this.stars > before) {
      audio.sfx('sting', { vol: 0.35 });
      this.state.game.hud.toast(`Wanted ${'★'.repeat(this.stars)}`, this.stars >= 3 ? 'The helicopter\'s coming. Lose them: get out of sight, hide in a stairwell, a shop or a crowd.' : 'The police are after you. Get out of sight and lay low to lose them.', '#ffd040', 3);
    }
  }

  _robTill(shop) {
    const s = this.state, p = s.player;
    shop.robbed = true;
    shop.robbedAt = s.time;
    s.setAction(null);
    this.keepers.scare(shop, p.pos);
    audio.sfx('alarm', { vol: 0.5 });
    freeEarn(s.game, (30 + Math.floor(this.rng() * 31)) * (this.police ? 2 : 1), 'Till robbed!', 'The alarm\'s going: get out before the shutters come down!');
    this.onCrime('till');
    addStat(s.game, 'tills');
    this.jobs.onRob(shop);
    if (this.heli) { this.heli.lastSeen.copy(p.pos); this.heli.spot.set(p.pos.x + 12, 0, p.pos.z + 12); }
  }

  /**
   * After a robbery: the shopkeeper calls the police (a few seconds later),
   * and once you're out, the metal shutters roll down: that shop's closed.
   */
  _shutters(dt) {
    const s = this.state, p = s.player.pos;
    for (const sh of this.city.shops || []) {
      if (!sh.robbed) continue;
      if (!sh.called && s.time - sh.robbedAt > 4) {
        sh.called = true;
        this.heat = Math.min(5, this.heat + 0.5);
        this.officers?.alert(12);
        s.game.hud.toast('The shopkeeper called the police!', 'They know where you are for a while. Keep moving.', 'var(--red)', 2.5);
      }
      if (!sh.shutter && s.time - sh.robbedAt > 3 && !sh.inside(p.x, p.z) && Math.hypot(sh.door.x - p.x, sh.door.z - p.z) > 3) {
        const f = sh.front, alongX = Math.abs(f.x1 - f.x0) > Math.abs(f.z1 - f.z0);
        const geo = new THREE.BoxGeometry(alongX ? f.width + 0.1 : 0.08, 1, alongX ? 0.08 : f.width + 0.1);
        geo.translate(0, -0.5, 0); // (hangs from its top edge)
        const mesh = new THREE.Mesh(geo, shutterMaterial());
        mesh.position.set((f.x0 + f.x1) / 2, f.top, (f.z0 + f.z1) / 2);
        mesh.scale.y = 0.01;
        this.city.group.add(mesh);
        sh.shutter = { mesh, t: 0 };
        audio.sfx('block', { vol: 0.5 });
      }
      if (sh.shutter && sh.shutter.t < 1) {
        sh.shutter.t = Math.min(1, sh.shutter.t + dt / 1.6);
        sh.shutter.mesh.scale.y = sh.shutter.t * sh.front.top;
        if (sh.shutter.t >= 1) {
          // Closed: a solid wall now
          const f = sh.front;
          this.city.world.addBox(Math.min(f.x0, f.x1) - 0.05, 0, Math.min(f.z0, f.z1) - 0.05, Math.max(f.x0, f.x1) + 0.05, f.top, Math.max(f.z0, f.z1) + 0.05, { tag: 'shutter' });
        }
      }
    }
  }

  /**
   * Police on foot (and the helicopter): with police on in the menu they're
   * always out; otherwise only while you're wanted. They chase you over the
   * rooftops and down on the street. Lose them: out of sight, a stairwell,
   * behind a shop counter, in a crowd. Punch or tackle them to slow them.
   */
  _police(dt, inShop, behindCounter) {
    const s = this.state, p = s.player, hud = s.game.hud, t = s.time;
    const stars = this.stars;
    // How many officers are out
    const want = this.police ? Math.min(6, Math.max(3, stars + 2)) : stars ? Math.min(6, stars + 1) : 0;
    this.officers.setActive(want);
    if (want && !this.officersAnnounced && this.officers.units.some((u) => !u.inactive && u.waitTimer <= 0)) {
      this.officersAnnounced = true;
      hud.toast('Police on foot!', 'They chase you over the roofs and down on the street. Get out of their sight to lose them; one will wait at a stairwell door if you climb its ladder.', 'var(--red)', 5);
      audio.sfx('sting', { vol: 0.4 });
    }
    // (walking along with people: you're just another face in the crowd)
    const hidden = inHideSpot(this.city, p.pos) || behindCounter || (p.horizontalSpeed < 4.6 && p.grounded && this.crowd.blendsIn(p.pos));
    const lure = s.gadgets?.lure ? s.gadgets.lure.pos : null;
    if (want && this.officers.update(dt, p, hidden || s.concealed, lure) === 'caught' && !admin.flag('god') && !this.drive) this._caught('Caught by the police! Back to safety.');
    // A police car that gets close tells the officers on foot where you are
    if (want && this.traffic.cops.some((c) => Math.hypot(c.car.pos.x - p.pos.x, c.car.pos.z - p.pos.z) < 25) && !(this._radioT > 0)) { this._radioT = 4; this.officers.alert(6); }
    if (this._radioT > 0) this._radioT -= dt;

    // The helicopter (police on, or three stars and up)
    const needHeli = this.police || stars >= 3;
    if (needHeli && !this.heli && t > 3) {
      const a = this.rng() * Math.PI * 2;
      this.heli = new Helicopter(s.scene, s.world, { startPos: new THREE.Vector3(p.pos.x + Math.cos(a) * 60, 0, p.pos.z + Math.sin(a) * 60) });
      hud.toast('Police helicopter!', 'Stay out of the spotlight. Hide in a stairwell, a shop, under a water tower or in a hut.', 'var(--red)', 4);
    } else if (!needHeli && this.heli) {
      this.heli.dispose();
      this.heli = null;
      this.spotted = 0;
      hud.setMeter(0, '');
    }
    let lit = false;
    if (this.heli) {
      const params = { spotSpeed: 6.2 * diff().spot * (1 + Math.max(0, stars - 3) * 0.12), fill: 0.5 * diff().fill, lead: 0.2 };
      this.heli.update(dt, s.policeTarget, params);
      lit = this.heli.isPlayerLit(p.pos) && !s.concealed && !inShop && !inHideSpot(this.city, p.pos); // (it can't see into a shop or a stairwell)
      this.spotted = clamp(this.spotted + (lit ? dt * params.fill : -dt * 0.6), 0, 1);
      hud.setMeter(this.spotted, lit ? 'SPOTTED! Get out of the light' : 'Spotted', lit ? 'var(--red)' : '#8a8f9c');
      this.outOfLight = lit ? 0 : this.outOfLight + dt;
      if (this.police && this.outOfLight > ESCAPE_TIME && this.heli.seesPlayer === false && this._lostOnce !== Math.floor(t / ESCAPE_TIME)) {
        this._lostOnce = Math.floor(t / ESCAPE_TIME);
        freeEarn(s.game, 20, 'Kept out of sight!', 'The helicopter can\'t find you.');
        this.outOfLight = 0;
      }
      if (this.spotted >= 1 && admin.flag('god')) this.spotted = 0; // admin god mode
      if (this.spotted >= 1) {
        this._caught('Caught by the helicopter! Back to safety.');
        const a = this.rng() * Math.PI * 2;
        this.heli.spot.set(p.pos.x + Math.cos(a) * 45, 0, p.pos.z + Math.sin(a) * 45);
        this.heli.lastSeen.copy(this.heli.spot);
      }
    }

    // Out of sight for a while: the wanted level drops a star at a time
    const seen = (want && this.officers.seesPlayer) || lit;
    this.calm = seen ? 0 : this.calm + dt;
    if (this.heat > 0 && this.calm > 14) {
      this.calm = 0;
      this.heat = Math.max(0, Math.ceil(this.heat - 0.01) - 1);
      if (this.heat > 0) hud.toast(`Wanted ${'★'.repeat(this.stars)}`, 'They\'re losing track of you. Stay out of sight.', 'var(--safe)', 2);
      else {
        hud.toast('Lost them!', this.police ? 'Back to the usual patrols.' : 'The police have given up. You\'re free.', 'var(--safe)', 3);
        addStat(s.game, 'escapes');
        audio.sfx('checkpoint', { vol: 0.5 });
        if (!this.police) freeEarn(s.game, 15, 'Escaped!', '');
      }
    }
  }

  /** Something you bought at a shop counter. */
  onBuy(id, name) {
    const hud = this.state.game.hud;
    if (id === 'energy' || id === 'coffee') { this.buffs.speed = 60; hud.toast(name, 'You\'re running 15% faster for a minute.', 'var(--safe)', 2.5); }
    else if (id === 'disguise') {
      this.heat = Math.max(0, Math.ceil(this.heat - 0.01) - 2);
      this.officers.tipT = 0; this.officers.lostFor = 99; this.calm = 0;
      hud.toast('New look', this.heat ? `Wanted ${'★'.repeat(this.stars)}: they've lost track of you.` : 'Nobody recognises you now.', 'var(--safe)', 3);
    } else if (id === 'burner') {
      this.heat = Math.max(0, Math.ceil(this.heat - 0.01) - 1);
      this.officers.tipT = 0;
      hud.toast('A fake tip, called in', this.heat ? `Wanted ${'★'.repeat(this.stars)}.` : 'The police are off chasing nothing.', 'var(--safe)', 3);
    } else if (id === 'scanner') { this.tagScan = true; hud.toast('Tag finder', 'The crew tags you haven\'t found show on your minimap (yellow).', 'var(--safe)', 3); }
    else if (id === 'charm') { this.charm = true; hud.toast('Lucky charm', 'Cash bags pay double for the rest of this session.', 'var(--safe)', 3); }
    else hud.toast(name, 'Enjoy.', 'var(--safe)', 2);
  }

  _caught(msg) {
    const s = this.state;
    if (noteCaught(this.state)) return; // (the third time: off to jail)
    this.jobs.fail();
    audio.sfx('caught');
    this.spotted = 0;
    this.heat = 0;
    this.calm = 0;
    s.respawnToSafety(msg);
    this.officers.scatter(s.player.pos);
  }

  /** Frostvale is played in the streets: no "climb back up" help. */
  get indoors() {
    return !!this.city?.groundLevel;
  }

  /** When on the street, the "ladder" helper steps aside for the car marker. */
  get streetMarker() {
    return true;
  }

  teardown() {
    this.crowd?.dispose();
    this.keepers?.dispose();
    this.crowd = this.keepers = null;
    this.heli?.dispose();
    this.heli = null;
    this.officers?.dispose();
    this.officers = null;
    this.map2?.dispose();
    this.map2 = null;
    this.tags?.dispose();
    this.jobs?.dispose();
    this.challenges?.dispose();
    this.parked?.dispose();
    if (this.drive) { this.state.model.root.visible = true; this.drive = null; }
    this.traffic?.dispose();
    this.docks?.dispose();
    this.follower?.dispose();
    this.follower = null;
    if (this.state.player) this.state.player.speedScale = 1;
    this.carBtn?.remove();
    this.carBtn = null;
  }
}

/** Corrugated metal for the shop shutters (grey with ridges). */
let _shutterMat = null;
function shutterMaterial() {
  if (_shutterMat) return _shutterMat;
  const c = document.createElement('canvas');
  c.width = 16; c.height = 64;
  const g = c.getContext('2d');
  for (let y = 0; y < 64; y += 8) {
    g.fillStyle = '#9aa0a8'; g.fillRect(0, y, 16, 5);
    g.fillStyle = '#6a7078'; g.fillRect(0, y + 5, 16, 3);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 6);
  tex.colorSpace = THREE.SRGBColorSpace;
  _shutterMat = new THREE.MeshLambertMaterial({ map: tex });
  return _shutterMat;
}

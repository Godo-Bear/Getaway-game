import * as THREE from 'three';
import { generateRooftopCity, findClearRoofSpot } from '../../world/rooftopCity.js';
import { makeGlowMaterial } from '../../world/materials.js';
import { makeCarMesh } from '../../vehicles/carModel.js';
import { playerCarColour, playerCarStyle } from '../../vehicles/carColours.js';
import { Helicopter } from '../../ai/helicopter.js';
import { OfficerSquad, rooftopCitySpawns, inHideSpot } from '../../ai/officer.js';
import { formatTime, makeRng, clamp } from '../../core/utils.js';
import { audio } from '../../core/audio.js';
import { admin } from '../../core/admin.js';
import { diff } from '../../core/difficulty.js';
import { Crowd, Shopkeepers } from '../../ai/crowd.js';
import { FootMap } from '../../ui/footMap.js';
import { CrewTags } from '../../world/crewTags.js';
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
//  - Your car is parked down on the street (blue beams): walk up to it to
//    drive the city. Park in a garage there to come back up here.
//  - Police (optional, pause menu): one helicopter. Caught = back to safety
//    and a few dollars lighter; it never ends the run.

const CAR_RADIUS = 3.2;
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
  /** Park the getaway car at a few spots on the streets near the start. */
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
    const color = playerCarColour();
    this.cars = picked.map((s) => {
      const g = new THREE.Group();
      const mesh = makeCarMesh({ kind: 'player', color, style: playerCarStyle(), parked: true });
      mesh.rotation.y = s.heading;
      g.add(mesh);
      const ring = new THREE.Mesh(new THREE.RingGeometry(3.4, 3.9, 36), makeGlowMaterial(0x39a8ff, 0.7));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.06;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 60, 14, 1, true), makeGlowMaterial(0x39a8ff, 0.12));
      beam.position.y = 30;
      g.add(ring, beam);
      g.position.set(s.x, w.groundHeight(s.x, s.z, 3), s.z);
      this.city.group.add(g);
      w.addBlock(s.x, g.position.y, s.z, s.heading ? 4.4 : 2, 1.3, s.heading ? 2 : 4.4, { tag: 'car' });
      return { group: g, ring, pos: g.position, heading: s.heading };
    });
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
    if (this.fromCar && this.cars.length) {
      // Out of the car: on the street beside it, facing the way it's parked
      this.fromCar = false;
      this.leftCar = true; // (walk away from it first, or you'd climb straight back in)
      const c = this.cars[0], h = c.heading;
      s.placePlayer(new THREE.Vector3(c.pos.x + Math.cos(h) * 2.4, c.pos.y, c.pos.z - Math.sin(h) * 2.4), h - Math.PI);
      hud.toast('On foot', 'Climb the yellow ladders to the rooftops and grab the cash bags. Press T (or "Get in a car") to drive again.', 'var(--amber)', 5);
      return;
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
    return freeRoamPauseButtons(this.state, 'foot');
  }

  audioMix() {
    if (!this.heli) return { music: 0.3, intensity: 0.2 };
    const p = this.state.player.pos;
    const d = Math.hypot(this.heli.pos.x - p.x, this.heli.pos.z - p.z);
    return { rotor: clamp(1 - d / 110, 0.05, 1) * 0.5, music: 0.45, intensity: 0.3 + this.spotted * 0.6 };
  }

  update(dt) {
    const s = this.state, p = s.player, hud = s.game.hud, t = s.time;

    // Cash bags
    for (const b of this.bags) {
      if (!b.group.visible) continue;
      b.bag.rotation.y += dt * 2;
      b.ring.rotation.z += dt;
      if (p.pos.distanceTo(b.pos) < 2.2) { // running past it picks it up
        freeEarn(s.game, BAG_CASH * (this.police ? 2 : 1), 'Cash bag!');
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

    // Your car: walk up to it (at street level) to drive
    let nearCar = null, carD = Infinity;
    for (const c of this.cars) {
      c.ring.rotation.z += dt * 0.8;
      const d = Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z);
      if (d < carD) { carD = d; nearCar = c; }
    }
    if (this.leftCar && carD > CAR_RADIUS + 1.5) this.leftCar = false;
    if (nearCar && carD < CAR_RADIUS && !this.leftCar && Math.abs(p.pos.y - nearCar.pos.y) < 2) {
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
    s.setAction(atTill ? 'Rob the till' : null);
    if (atTill && s.game.input.wasPressed('interact')) this._robTill(atTill);
    this._shutters(dt);
    // Behind a shop counter: out of sight
    const behindCounter = !!inShop && Math.hypot(inShop.keeper.pos.x - p.pos.x, inShop.keeper.pos.z - p.pos.z) < 1.7;
    if (behindCounter && !this._counterTip) { this._counterTip = true; hud.toast('Behind the counter', 'The police can\'t see you back here.', 'var(--safe)', 2); }
    if (!behindCounter) this._counterTip = false;

    // The police: the session's police setting, plus your wanted level
    this._police(dt, inShop, behindCounter);

    // Marker: a waypoint you set on the map, the nearest cash bag, or the car when you're down on the street
    const onStreet = p.pos.y < 1.5;
    let best = null, bd = Infinity;
    for (const b of this.bags) {
      if (!b.group.visible) continue;
      const d = p.pos.distanceTo(b.pos);
      if (d < bd) { bd = d; best = b; }
    }
    const dots = [
      ...this.bags.filter((b) => b.group.visible).map((b) => ({ x: b.pos.x, z: b.pos.z, color: '#4dffa6' })),
      ...this.cars.map((c) => ({ x: c.pos.x, z: c.pos.z, color: '#39a8ff', size: 1.3 })),
      ...(this.officers?.units || []).filter((u) => !u.inactive && u.model.root.visible).map((u) => ({ x: u.pc.pos.x, z: u.pc.pos.z, color: '#ff3346' })),
      ...(this.heli ? [{ x: this.heli.pos.x, z: this.heli.pos.z, color: '#ff3346', size: 1.8 }] : []),
    ];
    const way = this.map2.update(dots, best ? best.pos : null);
    if (way) {
      hud.setMarker(new THREE.Vector3(way.x, 2, way.z), s.camera, 'Waypoint', '#ff5ad0', Math.hypot(way.x - p.pos.x, way.z - p.pos.z));
    } else if (onStreet && nearCar && !this.city.groundLevel) {
      hud.setMarker(nearCar.pos.clone().setY(nearCar.pos.y + 2.2), s.camera, 'Your car', '#39a8ff', carD);
    } else if (best) hud.setMarker(best.pos.clone().setY(best.pos.y + 1.5), s.camera, 'Cash', 'var(--safe)', bd);
    else hud.setMarker(null);
    const stars = this.stars;
    hud.setStats(`<span>Time <b>${formatTime(t)}</b></span><span>Cash this session <b style="color:var(--safe)">$${freeSession(s.game).cash}</b></span>` +
      `<span>Wanted <b style="color:${stars ? '#ffd040' : '#6a6f7c'};letter-spacing:1px">${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}</b></span>` +
      `<span>Tags <b style="color:#ffd040">${this.tags.found}/${this.tags.total}</b></span><span>Car <b>${Math.round(carD)} m</b></span>`);
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
    const add = { till: 1, officer: 1, assault: 0.5, pickpocket: 0.34 }[kind] ?? 0.5;
    this.heat = Math.min(5, this.heat + add);
    this.calm = 0;
    if (kind === 'till' || kind === 'officer') this.officers?.alert(10);
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
    if (want && this.officers.update(dt, p, hidden || s.concealed, lure) === 'caught' && !admin.flag('god')) this._caught('Caught by the police! Back to safety.');

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
        audio.sfx('checkpoint', { vol: 0.5 });
        if (!this.police) freeEarn(s.game, 15, 'Escaped!', '');
      }
    }
  }

  _caught(msg) {
    const s = this.state;
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

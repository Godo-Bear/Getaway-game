import * as THREE from 'three';
import { generateRooftopCity, findClearRoofSpot } from '../../world/rooftopCity.js';
import { makeGlowMaterial } from '../../world/materials.js';
import { makeCarMesh } from '../../vehicles/carModel.js';
import { playerCarColour } from '../../vehicles/carColours.js';
import { Helicopter } from '../../ai/helicopter.js';
import { formatTime, makeRng, clamp } from '../../core/utils.js';
import { audio } from '../../core/audio.js';
import { admin } from '../../core/admin.js';
import { freeSession, switchFreeRoam, freeEarn, freeRoamPauseButtons } from './freeRoam.js';

// Free Run, on foot: roam the rooftops. One half of a Free Run session
// (the other half is FreeDriveMode, in the car).
//
//  - Cash bags on the roofs (green beams) earn cash for the Shop
//  - Your car is parked down on the street (blue beams): walk up to it to
//    drive the city. Park in a garage there to come back up here.
//  - Police (optional, pause menu): one helicopter. Caught = back to safety
//    and a few dollars lighter; it never ends the run.

const CAR_RADIUS = 3.2;
const BAG_CASH = 25;
const BAG_COUNT = 3;
const ESCAPE_TIME = 20; // seconds out of the light (police on) for an escape bonus

export class FreeRunMode {
  constructor(state) {
    this.state = state;
    this.police = freeSession(state.game).police;
    this.hudSections = this.police ? ['tl', 'meter', 'controls', 'marker'] : ['tl', 'controls', 'marker'];
    this.heli = null;
  }

  build() {
    const city = generateRooftopCity({ seed: 1234, blocks: 6 });
    this.city = city;
    this.rng = makeRng(99);
    this._buildBags();
    this._buildCars();
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
      const mesh = makeCarMesh({ kind: 'player', color });
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
      return { group: g, ring, pos: g.position };
    });
  }

  // ---------------------------------------------------------------- run
  start() {
    const s = this.state, hud = s.game.hud;
    this.spotted = 0;
    this.outOfLight = 0;
    this.heli?.dispose();
    this.heli = null;
    for (const b of this.bags) this._placeBag(b);
    hud.setPhase(`Free Run${this.police ? ' · police on' : ''}`);
    hud.setObjective('Explore the rooftops');
    hud.toast('Free Run', 'Grab the cash bags (green beams). Your car is parked on the street (blue beams): walk up to it to drive. Pause for more options.', 'var(--amber)', 6);
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
      if (p.pos.distanceTo(b.pos) < 1.7) {
        freeEarn(s.game, BAG_CASH * (this.police ? 2 : 1), 'Cash bag!');
        this._placeBag(b);
      }
    }

    // Your car: walk up to it (at street level) to drive
    let nearCar = null, carD = Infinity;
    for (const c of this.cars) {
      c.ring.rotation.z += dt * 0.8;
      const d = Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z);
      if (d < carD) { carD = d; nearCar = c; }
    }
    if (nearCar && carD < CAR_RADIUS && Math.abs(p.pos.y - nearCar.pos.y) < 2) {
      switchFreeRoam(s, 'car');
      return;
    }

    // Police helicopter (optional)
    if (this.police) {
      if (!this.heli && t > 3) {
        const a = this.rng() * Math.PI * 2;
        this.heli = new Helicopter(s.scene, s.world, { startPos: new THREE.Vector3(p.pos.x + Math.cos(a) * 60, 0, p.pos.z + Math.sin(a) * 60) });
        hud.toast('Police helicopter!', 'Stay out of the spotlight. Hide under water towers or in stairwell huts.', 'var(--red)', 4);
      }
      if (this.heli) {
        const params = { spotSpeed: 6.2, fill: 0.5, lead: 0.2 };
        this.heli.update(dt, s.policeTarget, params);
        const lit = this.heli.isPlayerLit(p.pos) && !s.concealed;
        this.spotted = clamp(this.spotted + (lit ? dt * params.fill : -dt * 0.6), 0, 1);
        hud.setMeter(this.spotted, lit ? 'SPOTTED! Get out of the light' : 'Spotted', lit ? 'var(--red)' : '#8a8f9c');
        this.outOfLight = lit ? 0 : this.outOfLight + dt;
        if (this.outOfLight > ESCAPE_TIME && this.heli.seesPlayer === false && this._lostOnce !== Math.floor(t / ESCAPE_TIME)) {
          this._lostOnce = Math.floor(t / ESCAPE_TIME);
          freeEarn(s.game, 20, 'Kept out of sight!', 'The helicopter can\'t find you.');
          this.outOfLight = 0;
        }
        if (this.spotted >= 1 && admin.flag('god')) this.spotted = 0; // admin god mode
        if (this.spotted >= 1) {
          audio.sfx('caught');
          this.spotted = 0;
          s.respawnToSafety('Caught by the helicopter! Back to safety.');
          const a = this.rng() * Math.PI * 2;
          this.heli.spot.set(p.pos.x + Math.cos(a) * 45, 0, p.pos.z + Math.sin(a) * 45);
          this.heli.lastSeen.copy(this.heli.spot);
        }
      }
    }

    // Marker: the nearest cash bag, or the car when you're down on the street
    const onStreet = p.pos.y < 1.5;
    if (onStreet && nearCar) {
      hud.setMarker(nearCar.pos.clone().setY(nearCar.pos.y + 2.2), s.camera, 'Your car', '#39a8ff', carD);
    } else if (!onStreet) {
      let best = null, bd = Infinity;
      for (const b of this.bags) {
        if (!b.group.visible) continue;
        const d = p.pos.distanceTo(b.pos);
        if (d < bd) { bd = d; best = b; }
      }
      if (best) hud.setMarker(best.pos.clone().setY(best.pos.y + 1.5), s.camera, 'Cash', 'var(--safe)', bd);
      else hud.setMarker(null);
    }
    hud.setStats(`<span>Time <b>${formatTime(t)}</b></span><span>Cash this session <b style="color:var(--safe)">$${freeSession(s.game).cash}</b></span>` +
      `<span>Car <b>${Math.round(carD)} m</b></span>`);
  }

  /** When on the street, the "ladder" helper steps aside for the car marker. */
  get streetMarker() {
    return true;
  }

  teardown() {
    this.heli?.dispose();
    this.heli = null;
  }
}

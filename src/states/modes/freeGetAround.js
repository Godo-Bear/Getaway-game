import * as THREE from 'three';
import { makeRng } from '../../core/utils.js';
import { makeGlowMaterial, makeTextTexture } from '../../world/materials.js';
import { makeCarMesh, CIVILIAN_COLORS } from '../../vehicles/carModel.js';
import { PlayerController } from '../../player/playerController.js';
import { PlayerModel } from '../../player/playerModel.js';
import { CREW_LOOKS } from '../../player/people.js';
import { OfficerSquad } from '../../ai/officer.js';
import { audio } from '../../core/audio.js';
import { save } from '../../core/save.js';
import { currentLook } from '../../player/outfits.js';
import { showCard, hideCard } from '../../ui/menus.js';
import { showGarage, showLookEditor } from '../../ui/customise.js';
import { showShop } from '../../ui/shop.js';
import { freeSession } from './freeRoam.js';
import { addStat } from '../../core/stats.js';

// Getting around in Free Run on foot:
//
//  - Parked cars along the kerbs: walk up to one and press E to steal it
//    (you drive off in it; the owner calls it in, so the police come).
//  - Bike and e-scooter docks (by the parks and on corners): E to ride,
//    E again to get off. Much faster than running; climbing puts it down.
//  - Your crew: bring Mags, Theo or Ricky along (pause menu, or the
//    safehouse). They follow you over the roofs and down the streets, and
//    knock down police officers who get too close.
//  - The safehouse (a green door): lay low (your wanted level goes) and save,
//    the garage (your car), the wardrobe (your look), the gadget locker, and
//    "start here" for next time.

const glow = (color, h, r) => {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.8, r, 28), makeGlowMaterial(color, 0.7));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.07;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.45, r * 0.45, h, 10, 1, true), makeGlowMaterial(color, 0.1));
  beam.position.y = h / 2;
  g.add(ring, beam);
  return g;
};

// ======================================================================
//  Parked cars you can steal
// ======================================================================
export class ParkedCars {
  constructor(mode, { pool = 8 } = {}) {
    this.mode = mode;
    const city = mode.city, rng = makeRng(mode.map.foot.seed * 13 + 3);
    const half = ((city.blockCenters.length - 1) / 2) * city.pitch, B = 42;
    // Spots along the kerbs (4.2 m out from the block, on the street), not by your own car
    this.spots = [];
    for (const cx of city.blockCenters) {
      for (const cz of city.blockCenters) {
        for (const t of [-12, 0, 12]) {
          for (const [x, z, h] of [[cx + t, cz - B / 2 - 4.2, Math.PI / 2], [cx + t, cz + B / 2 + 4.2, Math.PI / 2], [cx - B / 2 - 4.2, cz + t, 0], [cx + B / 2 + 4.2, cz + t, 0]]) {
            if (Math.abs(x) > half + 30 || Math.abs(z) > half + 30 || rng() < 0.35) continue;
            if (mode.cars.some((c) => Math.hypot(c.pos.x - x, c.pos.z - z) < 8)) continue;
            // (not in front of a shop door, a ladder or a stairwell door)
            if ((city.shops || []).some((sh) => Math.hypot(sh.door.x - x, sh.door.z - z) < 6.5)) continue;
            if ((city.ladders || []).some((l) => Math.hypot(l.x - x, l.z - z) < 6.5)) continue;
            this.spots.push({ x, z, h: h + (rng() < 0.5 ? Math.PI : 0), kind: rng() < 0.15 ? 'van' : rng() < 0.12 ? 'taxi' : 'civilian', color: CIVILIAN_COLORS[Math.floor(rng() * CIVILIAN_COLORS.length)] });
          }
        }
      }
    }
    // A few car meshes, moved to the spots nearest you
    this.cars = [];
    for (let i = 0; i < pool; i++) this.cars.push({ spot: null, mesh: null, box: null });
    this.t = 0;
  }

  _place(car, spot) {
    const city = this.mode.city;
    if (car.mesh) city.group.remove(car.mesh);
    if (car.box) city.world.removeBox(car.box);
    car.spot = spot;
    car.mesh = car.box = null;
    if (!spot) return;
    car.mesh = makeCarMesh({ kind: spot.kind, color: spot.color, parked: true });
    car.mesh.traverse((o) => { if (o.material?.userData?.nightGlow || o.material?.blending === THREE.AdditiveBlending) o.visible = false; }); // (lights off)
    car.mesh.position.set(spot.x, 0, spot.z);
    car.mesh.rotation.y = spot.h;
    city.group.add(car.mesh);
    const along = Math.abs(Math.sin(spot.h)) > 0.5;
    car.box = city.world.addBlock(spot.x, 0, spot.z, along ? 4.6 : 2.1, 1.5, along ? 2.1 : 4.6, { tag: 'car' });
  }

  /** Returns the parked car you're next to (to steal), or null. */
  update(dt, p) {
    if ((this.t -= dt) <= 0) {
      this.t = 1;
      const near = this.spots.filter((s) => !s.stolen).map((s) => ({ s, d: Math.hypot(s.x - p.pos.x, s.z - p.pos.z) }))
        .filter((o) => o.d < 80).sort((a, b) => a.d - b.d).slice(0, this.cars.length).map((o) => o.s);
      for (const c of this.cars) if (c.spot && !near.includes(c.spot)) this._place(c, null);
      for (const s of near) {
        if (this.cars.some((c) => c.spot === s)) continue;
        const free = this.cars.find((c) => !c.spot);
        if (free) this._place(free, s);
      }
    }
    if (p.pos.y > 1.5) return null;
    return this.cars.find((c) => c.spot && Math.hypot(c.spot.x - p.pos.x, c.spot.z - p.pos.z) < 3.2) || null;
  }

  /** You drove off in it: it's gone from here. */
  steal(car) {
    car.spot.stolen = true;
    const what = { kind: car.spot.kind, color: car.spot.color };
    this._place(car, null);
    return what;
  }

  dispose() { for (const c of this.cars) this._place(c, null); }
}

// ======================================================================
//  Bike and e-scooter docks
// ======================================================================
function bikeMesh(scooter) {
  const g = new THREE.Group();
  const metal = new THREE.MeshLambertMaterial({ color: scooter ? 0x2a2c30 : 0x2a8ad8 });
  const black = new THREE.MeshLambertMaterial({ color: 0x141416 });
  const wheels = [];
  for (const z of scooter ? [-0.42, 0.42] : [-0.5, 0.5]) {
    const w = new THREE.Mesh(new THREE.TorusGeometry(scooter ? 0.12 : 0.33, scooter ? 0.04 : 0.035, 6, 14), black);
    w.rotation.y = Math.PI / 2;
    w.position.set(0, scooter ? 0.12 : 0.34, z);
    g.add(w);
    wheels.push(w);
  }
  const bar = (x, y, z, w, h, d, m = metal) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); g.add(b); return b; };
  if (scooter) {
    bar(0, 0.16, 0, 0.16, 0.05, 0.9);           // the deck
    bar(0, 0.62, 0.42, 0.05, 0.95, 0.05);       // the stem
    bar(0, 1.08, 0.42, 0.5, 0.04, 0.04, black); // the handlebar
  } else {
    bar(0, 0.5, 0, 0.05, 0.05, 0.85);           // the top tube
    bar(0, 0.42, 0.25, 0.05, 0.45, 0.05).rotation.x = 0.5;
    bar(0, 0.42, -0.22, 0.05, 0.45, 0.05).rotation.x = -0.4;
    bar(0, 0.72, 0.45, 0.05, 0.4, 0.05);        // the stem
    bar(0, 0.92, 0.45, 0.55, 0.04, 0.04, black); // the handlebar
    bar(0, 0.78, -0.3, 0.16, 0.05, 0.24, black); // the saddle
  }
  g.userData.wheels = wheels;
  return g;
}

export class BikeDocks {
  constructor(mode) {
    this.mode = mode;
    const city = mode.city;
    this.docks = [];
    // By each park's north entrance, and a few on corners
    const spots = (city.parks || []).map((pk) => new THREE.Vector3((pk.x0 + pk.x1) / 2 + 4, 0.05, pk.z0 - 1.3));
    for (const cx of city.blockCenters.filter((_, i) => i % 2 === 1)) for (const cz of city.blockCenters.filter((_, j) => j % 3 === 1)) spots.push(new THREE.Vector3(cx + 15, 0.05, cz - 21 - 1.3));
    spots.forEach((pos, i) => {
      const scooter = i % 2 === 1;
      const g = new THREE.Group();
      for (const dx of [-1.2, 0, 1.2]) {
        const m = bikeMesh(scooter);
        m.position.set(dx, 0, 0);
        g.add(m);
      }
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.4, 0.15), new THREE.MeshLambertMaterial({ color: scooter ? 0x7dff8a : 0x39a8ff }));
      post.position.set(-2.1, 0.7, 0);
      g.add(post);
      g.position.copy(pos);
      city.group.add(g);
      this.docks.push({ pos, scooter, group: g });
    });
    this.ride = null;
  }

  nearDock(p) {
    if (this.ride || p.pos.y > 1.5) return null;
    return this.docks.find((d) => Math.hypot(d.pos.x - p.pos.x, d.pos.z - p.pos.z) < 2.6) || null;
  }

  /** Get on (at a dock) or off. */
  toggle(dock) {
    const s = this.mode.state;
    if (this.ride) {
      s.model.root.remove(this.ride.mesh);
      if (this.ride.slot) this.ride.slot.visible = true; // (back in its dock)
      this.ride = null;
      s.game.hud.toast('Off the bike', '', 'var(--cyan)', 1.5);
      return;
    }
    const mesh = bikeMesh(dock.scooter);
    s.model.root.add(mesh);
    const slot = dock.group.children.find((c) => c.userData.wheels && c.visible) || null;
    if (slot) slot.visible = false; // (one fewer in the dock)
    this.ride = { mesh, scooter: dock.scooter, slot };
    audio.sfx('click');
    s.game.hud.toast(dock.scooter ? 'E-scooter' : 'Bike', `${dock.scooter ? 'Zippy' : 'Fast'}: much quicker than running. E to get off (climbing puts it down).`, 'var(--cyan)', 3);
  }

  /** Speed while riding (1 = on foot). */
  get speed() { return this.ride ? (this.ride.scooter ? 1.55 : 1.85) : 1; }

  update(dt, p) {
    if (!this.ride) return;
    // Climbing, ladders, zip lines: the bike stays behind
    if (['mantle', 'ladder', 'zip', 'wallrun', 'grapple'].includes(p.state)) { this.toggle(); return; }
    for (const w of this.ride.mesh.userData.wheels) w.rotation.x += (p.horizontalSpeed / (this.ride.scooter ? 0.12 : 0.33)) * dt;
    if ((this.rode = (this.rode || 0) + p.horizontalSpeed * dt) > 25) { addStat(this.mode.state.game, 'bikeM', this.rode); this.rode = 0; }
  }

  dispose() {
    if (this.ride) this.mode.state.model.root.remove(this.ride.mesh);
    for (const d of this.docks) d.group.parent?.remove(d.group);
  }
}

// ======================================================================
//  A crew member who comes along
// ======================================================================
export const CREW = { mags: 'Mags', theo: 'Theo', ricky: 'Ricky' };

export class CrewFollower {
  constructor(mode, who) {
    this.mode = mode;
    this.who = who;
    const s = mode.state, p = s.player;
    this.pc = new PlayerController(s.world);
    this.pc.speedScale = 1.05;
    this.pc.ladders = s.player.ladders; // (they use the stairwell ladders too)
    this.model = new PlayerModel(CREW_LOOKS[who], { bag: false });
    s.scene.add(this.model.root);
    this.u = { pc: this.pc, ctl: { moveX: 0, moveZ: 0, jumpPressed: false, jumpHeld: false, sprint: true, crouch: false, camForward: new THREE.Vector3(0, 0, -1), camRight: new THREE.Vector3(1, 0, 0) }, jumpCooldown: 0, blockedTime: 0, lastPos: new THREE.Vector3() };
    this.pc.teleport(p.pos.x - 2, p.pos.y + 0.05, p.pos.z - 2, 0);
    this.cool = 0;
    this.away = 0;
  }

  update(dt) {
    const s = this.mode.state, p = s.player, pc = this.pc;
    // Too far behind (or stuck a floor away): catch up out of sight
    const d = Math.hypot(p.pos.x - pc.pos.x, p.pos.z - pc.pos.z);
    this.away = d > 18 || Math.abs(p.pos.y - pc.pos.y) > 4 ? this.away + dt : 0;
    if (d > 60 || this.away > 5 || pc.pos.y < -2) {
      const back = new THREE.Vector3(-Math.sin(p.facing) * 2.5, 0, -Math.cos(p.facing) * 2.5);
      pc.teleport(p.pos.x + back.x, p.pos.y + 0.05, p.pos.z + back.z, p.facing);
      this.away = 0;
    }
    // Follow a couple of metres behind you
    const target = new THREE.Vector3(p.pos.x - Math.sin(p.facing) * 2.2, p.pos.y, p.pos.z - Math.cos(p.facing) * 2.2);
    let t = dt;
    while (t > 1e-4) {
      const h = Math.min(1 / 60, t);
      OfficerSquad.prototype._think.call({ world: s.world }, this.u, target, h);
      if (Math.hypot(target.x - pc.pos.x, target.z - pc.pos.z) < 1.4) this.u.ctl.moveZ = 0;
      this.u.ctl.sprint = d > 5;
      pc.update(h, this.u.ctl);
      pc.events.length = 0;
      this.u.ctl.jumpPressed = false;
      t -= h;
    }
    this.model.update(dt, pc);
    // Police on foot too close: knock them down
    if ((this.cool -= dt) <= 0) {
      for (const u of this.mode.officers?.units || []) {
        if (u.inactive || u.waitTimer > 0 || u.floored || !u.model.root.visible) continue;
        if (u.pc.pos.distanceTo(pc.pos) > 2.4) continue;
        u.stunned = 3; u.floored = true;
        u.model.knockDown({ upIn: 1.9 });
        this.model.punch?.('cross');
        audio.sfx('uppercut', { vol: 0.7 });
        s.game.hud.toast(`${CREW[this.who]} knocked an officer down!`, 'Run!', 'var(--amber)', 2);
        this.cool = 5;
        break;
      }
    }
  }

  dispose() { this.mode.state.scene?.remove(this.model.root); }
}

// ======================================================================
//  The safehouse
// ======================================================================
export class Safehouse {
  constructor(mode) {
    this.mode = mode;
    const city = mode.city;
    // A stairwell door near the middle of the city (or, in Frostvale, a door on a chalet)
    const L = (city.ladders || []).filter((l) => city.buildings.some((b) => b.stairwell && l.x > b.minX + 0.1 && l.x < b.maxX - 0.1 && l.z > b.minZ + 0.1 && l.z < b.maxZ - 0.1))
      .sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
    if (L) {
      this.door = new THREE.Vector3(L.x + L.nx * 1.7, 0.05, L.z + L.nz * 1.7);
      this.out = new THREE.Vector3(L.nx, 0, L.nz);
    } else {
      const c = city.blockCenters[Math.floor(city.blockCenters.length / 2)];
      this.door = new THREE.Vector3(c, 0.05, c - 21);
      this.out = new THREE.Vector3(0, 0, -1);
      const door = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.4), makeGlowMaterial(0x4dffa6, 0.5));
      door.position.set(this.door.x, 1.2, this.door.z - 0.02);
      door.rotation.y = Math.PI;
      city.group.add(door);
    }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), new THREE.MeshBasicMaterial({ map: makeTextTexture('SAFEHOUSE', { color: '#4dffa6' }), transparent: true, toneMapped: false, depthWrite: false }));
    sign.position.copy(this.door).add(this.out.clone().multiplyScalar(0.12)).setY(3.1);
    sign.rotation.y = Math.atan2(this.out.x, this.out.z);
    const g = glow(0x4dffa6, 22, 1.1);
    g.position.copy(this.door).add(this.out.clone().multiplyScalar(1.4));
    city.group.add(sign, g);
    this.marker = g;
  }

  /** Where you come out when you start here. */
  get startPos() { return this.door.clone().add(this.out.clone().multiplyScalar(2.2)); }

  near(p) { return Math.hypot(this.door.x - p.pos.x, this.door.z - p.pos.z) < 2.4 && p.pos.y < 2; }

  open() {
    const m = this.mode, s = m.state, game = s.game;
    s.inCard = true;
    game.input.exitPointerLock();
    const ses = freeSession(game), key = m.map.id;
    const close = () => { hideCard(); s.inCard = false; s._afterResume?.(); };
    const reopen = () => this.open();
    const startHere = save.data.freeStart?.[key];
    const crew = ses.crew || null;
    const nextCrew = { null: 'mags', mags: 'theo', theo: 'ricky', ricky: null }[crew];
    showCard(`<p class="sub kicker">${m.map.name}</p><h2>The safehouse</h2><p class="sub">Lay low, change your car or your look, pick your gadgets.${m.stars ? ` You're wanted: ${'★'.repeat(m.stars)}.` : ''}</p>`, [
      { label: 'Lay low and save', sub: m.stars ? 'Your wanted level goes, and the game is saved' : 'Save the game', primary: true, onClick: () => {
        m.heat = 0; m.calm = 0; m.officers?.setActive(m.police ? 3 : 0);
        save.write();
        close();
        game.hud.toast('Saved', 'Laid low for a while: nobody\'s looking for you.', 'var(--safe)', 2.5);
      } },
      { label: 'Garage: your car', sub: 'Pick your car, paint and wheels', onClick: () => showGarage(game, reopen) },
      { label: 'Wardrobe: your look', sub: 'Clothes, hair, colours', onClick: () => showLookEditor(game, reopen, () => s.model.setLook(currentLook(game.settings))) },
      { label: 'Gadget locker', sub: 'Buy and equip gadgets', onClick: () => showShop(reopen) },
      { label: `Crew: ${crew ? CREW[crew] : 'nobody'}`, sub: `Bring ${nextCrew ? CREW[nextCrew] : 'nobody'} instead`, onClick: () => { m.setCrew(nextCrew); reopen(); } },
      { label: startHere ? 'Start here: ON' : 'Start here: off', sub: 'Begin Free Run at the safehouse next time', onClick: () => { (save.data.freeStart ||= {})[key] = !startHere; save.write(); reopen(); } },
      { label: 'Leave', onClick: close },
    ]);
  }
}

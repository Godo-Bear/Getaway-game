import * as THREE from 'three';
import { GadgetSlot } from './gadgetSlot.js';
import { Locator, LOCATOR_TIME } from './locator.js';
import { makeGlowMaterial, getGlowTexture } from '../world/materials.js';
import { audio } from '../core/audio.js';
import { admin } from '../core/admin.js';

/** A gadget effect's length (the admin's "Double power-ups" ability doubles them all). */
const T = (t) => t * (admin.flag('doublePower') || admin.flag('doubleAll') ? 2 : 1);

// Car gadgets (press F while driving):
//   Oil Slick     - an oil patch behind you; police cars that hit it spin out
//   EMP Blast     - a shockwave that knocks out every cruiser within 45 m
//   Signal Jammer - the police radio goes dead: they lose you on the spot
//   Spike Drop    - a spike strip behind you; cops that cross it crawl along
//   Smoke Screen  - thick exhaust smoke: cops behind you can't see you
//   Paint Shifter - new paint and plates: the police lose your trail
//   Blackout Mode - lights off, engine quiet: only seen from close up

const OIL_TIME = 14, OIL_RADIUS = 5.5, SPIN_TIME = 2.2;
const EMP_RADIUS = 45, EMP_TIME = 5;
const JAM_TIME = 8;
const SPIKE_TIME = 18, SPIKE_HALF = 3.4, FLAT_TIME = 10;
const SCREEN_TIME = 7;
const PLATES_TIME = 20, BLACKOUT_TIME = 8;
const DISGUISE_PAINTS = [0xe8e6e0, 0x2a5a2a, 0x6a1a8a, 0x8a8f9c, 0xd8c040, 0x3a2a1a];

export class CarGadgets {
  /** @param {import('../states/drivingState.js').DrivingState} state */
  constructor(state) {
    this.state = state;
    this.slot = new GadgetSlot(state.game, 'car');
    this.slicks = [];   // { mesh, pos, t }
    this.waves = [];    // expanding rings (EMP / jammer effects)
    this.strips = [];   // { mesh, x, z, ax, az, t, hit:Set }
    this.screen = 0;    // smoke screen time left
    this.timed = {};    // freeze / emp / jammer: { left, total }
  }

  /** Use a gadget: the one in slot i (0-2), or the one you used last. */
  use(i = null) {
    if (this.state.mode.ghost) return; // no police in ghost mode
    if (i != null && !this.slot.select(i)) return;
    if (!this.slot.ready) { this.slot.explainNotReady(); return; }
    const id = this.slot.gadget.id;
    if (id === 'oil') this._oil();
    else if (id === 'emp') this._emp();
    else if (id === 'spikes') this._spikes();
    else if (id === 'net') this._spikes({ net: true });
    else if (id === 'surge') this._emp({ radius: 80, time: 4, title: 'Power surge!', color: 0x8a5cff });
    else if (id === 'paint') this._emp({ radius: 45, time: 5, title: 'Paint bomb!', color: 0xff6ad0 });
    else if (id === 'tow') { if (!this._tow()) return; }
    else if (id === 'radar') this._radar();
    else if (id === 'screen') this._screen();
    else if (id === 'freeze') this._freeze();
    else if (id === 'plates') this._plates();
    else if (id === 'blackout') this._blackout();
    else if (id === 'teleport') { this._teleportPick(); return; } // (used up once you've picked a spot)
    else this._jammer();
    // Effects with a set length, for the countdown under the gadget badge
    const len = { freeze: T(10), emp: T(EMP_TIME), jammer: T(JAM_TIME) }[id];
    if (len) this.timed[id] = { left: len, total: len };
    this.slot.used();
  }

  // ---------------------------------------------------------------- Oil
  /** A trail of three puddles behind the car (harder for the cops to miss). */
  _oil() {
    for (const d of [6, 11, 16]) this._oilAt(d);
    audio.sfx('whoosh', { vol: 0.8 });
    this.state.game.hud.toast('Oil slick!', 'A trail of oil behind you: cops that drive over it spin out.', '#8a5cff', 2);
  }

  _oilAt(back) {
    const p = this.state.player;
    const pos = new THREE.Vector3(p.pos.x - p.fwdX * back, 0.06, p.pos.z - p.fwdZ * back);
    // A glossy black puddle with a purple-green oily sheen on top
    const g = new THREE.Group();
    const puddle = new THREE.Mesh(new THREE.CircleGeometry(OIL_RADIUS, 28), new THREE.MeshStandardMaterial({ color: 0x050508, roughness: 0.08, metalness: 0.6 }));
    puddle.rotation.x = -Math.PI / 2;
    const sheen = new THREE.Mesh(new THREE.RingGeometry(OIL_RADIUS * 0.3, OIL_RADIUS * 0.9, 28), makeGlowMaterial(0x4a2a8a, 0.07));
    sheen.rotation.x = -Math.PI / 2;
    sheen.position.y = 0.01;
    g.add(puddle, sheen);
    g.position.copy(pos);
    g.scale.setScalar(0.2);
    this.state.scene.add(g);
    this.slicks.push({ mesh: g, sheen, pos, t: 0 });
  }

  // ---------------------------------------------------------------- Spike Drop
  _spikes({ net = false } = {}) {
    const p = this.state.player;
    const x = p.pos.x - p.fwdX * 6, z = p.pos.z - p.fwdZ * 6;
    // Across the road: along the car's right-hand direction
    const ax = -p.fwdZ, az = p.fwdX;
    const g = new THREE.Group();
    const bar = new THREE.Mesh(new THREE.BoxGeometry(SPIKE_HALF * 2, net ? 0.04 : 0.08, net ? 2.4 : 0.5), new THREE.MeshStandardMaterial({ color: net ? 0x3a9a8a : 0x2a2d33, metalness: net ? 0 : 0.6, roughness: net ? 0.9 : 0.4, wireframe: net }));
    bar.position.y = 0.05;
    g.add(bar);
    const spikeGeo = new THREE.ConeGeometry(0.07, 0.28, 5);
    const spikeMat = new THREE.MeshStandardMaterial({ color: 0xd8dde4, metalness: 0.9, roughness: 0.25, emissive: 0x3a2a10 });
    const spikes = new THREE.InstancedMesh(spikeGeo, spikeMat, net ? 0 : 24); // (a net: no spikes, floats and weights)
    const m = new THREE.Matrix4();
    for (let i = 0; i < 24; i++) {
      m.makeTranslation(-SPIKE_HALF + 0.15 + (i % 12) * ((SPIKE_HALF * 2 - 0.3) / 11), 0.22, i < 12 ? -0.12 : 0.12);
      spikes.setMatrixAt(i, m);
    }
    g.add(spikes);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(SPIKE_HALF * 2 + 0.6, 1.1), makeGlowMaterial(0xff9a3d, 0.25));
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.02;
    g.add(glow);
    g.position.set(x, 0, z);
    g.rotation.y = Math.atan2(ax, az) - Math.PI / 2;
    this.state.scene.add(g);
    this.strips.push({ mesh: g, glow, x, z, ax, az, t: 0, hit: new Set() });
    audio.sfx(net ? 'whoosh' : 'spike', { vol: 0.6 });
    if (net) this.state.game.hud.toast('Net out!', 'Police cars that drive into it get tangled and crawl along.', '#3a9a8a', 2);
    else this.state.game.hud.toast('Spike strip down!', 'Cops that drive over it burst their tyres.', '#ff9a3d', 2);
  }

  // ---------------------------------------------------------------- Smoke Screen
  _screen() {
    this.screen = T(SCREEN_TIME);
    this.state.police.smoked = T(SCREEN_TIME);
    audio.sfx('whoosh', { vol: 1 });
    this.state.game.hud.toast('Smoke screen!', `Cops behind you can't see through it for ${T(SCREEN_TIME)} seconds. Break away!`, '#9aa2ae', 3);
  }

  // ---------------------------------------------------------------- Admin: Police Freeze
  _freeze() {
    const s = this.state, police = s.police;
    for (const u of police.units) {
      u.stunned = T(10);
      u.emp = true; // lights off while frozen
      u.spinDir = 0;
      this._spark(u.car.pos);
    }
    police.jammed = T(10);
    if (police.everSeen) { police.searching = true; police.timeSinceSeen = 0; }
    this._wave(s.player.pos, 0x8af4ff, 120);
    audio.sfx('thunder', { vol: 0.4 });
    s.game.hud.toast('Police frozen!', `Every cruiser is stuck for ${T(10)} seconds.`, '#8af4ff', 3);
  }

  // ---------------------------------------------------------------- Admin: Teleporter
  /** Teleporter: the city map opens; tap a spot and the car beams there. */
  _teleportPick() {
    this.state.openMap({
      title: 'Teleport', hint: 'Tap anywhere on the map: your car beams straight there',
      onPick: (p) => { this._teleport(p); this.slot.used(); },
    });
  }

  _teleport(target) {
    const s = this.state;
    const n = s.city.graph.nearestNode(target.x, target.z);
    const dx = target.x - n.x, dz = target.z - n.z;
    s.player.place(n.x, n.z, Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? Math.PI / 2 : -Math.PI / 2) : (dz > 0 ? 0 : Math.PI));
    s.player.vel.set(0, 0, 0);
    s.camPos = null;
    this._wave(s.player.pos, 0xffe04d, 20);
    audio.sfx('whoosh', { vol: 1 });
    s.game.hud.toast('Teleported!', '', '#ffe04d', 1.5);
    return true;
  }

  // ---------------------------------------------------------------- EMP
  _emp({ radius = EMP_RADIUS, time = EMP_TIME, title = 'EMP!', color = 0x3d9bff } = {}) {
    const EMP_RADIUS = radius, EMP_TIME = time; // (the Power Surge is a bigger, shorter one)
    const s = this.state, p = s.player;
    let hit = 0;
    for (const u of s.police.units) {
      if (admin.flag('infiniteRange') || Math.hypot(u.car.pos.x - p.pos.x, u.car.pos.z - p.pos.z) < EMP_RADIUS) {
        u.stunned = T(EMP_TIME);
        u.emp = true;
        u.spinDir = 0;
        hit++;
        this._spark(u.car.pos);
      }
    }
    if (s.heli) s.heli.blinded = T(EMP_TIME); // (the helicopter's searchlight cuts out too)
    // ...and it shorts out the roadblocks nearby (barriers and spike strips gone)
    const rb = s.roadblocks, far = admin.flag('infiniteRange') ? 1e9 : EMP_RADIUS;
    let blocks = 0;
    if (rb) rb.items = rb.items.filter((it) => { const near = Math.hypot(it.pos.x - p.pos.x, it.pos.z - p.pos.z) < far; if (near) { rb._remove(it); this._spark(it.pos); blocks++; } return !near; });
    this._wave(p.pos, color, admin.flag('infiniteRange') ? 150 : EMP_RADIUS);
    s.game.post?.lightning(0.35);
    audio.sfx('thunder', { vol: 0.5 });
    const what = [hit ? `${hit} police car${hit > 1 ? 's' : ''} knocked out for ${T(EMP_TIME)} seconds` : '', blocks ? `${blocks} roadblock${blocks > 1 ? 's' : ''} shorted out` : ''].filter(Boolean).join(', ');
    s.game.hud.toast(title, what ? `${what}. Go!` : 'No police cars or roadblocks were close enough.', '#' + color.toString(16).padStart(6, '0'), 3);
  }

  // ---------------------------------------------------------------- Tow Hook
  /** Hook the nearest police car behind you: it spins out and stalls. */
  _tow() {
    const s = this.state, p = s.player;
    let best = null, bd = 45;
    for (const u of s.police.units) {
      const dx = u.car.pos.x - p.pos.x, dz = u.car.pos.z - p.pos.z, d = Math.hypot(dx, dz);
      const behind = dx * p.fwdX + dz * p.fwdZ < 2;
      if (d < bd && behind && !(u.stunned > 0)) { bd = d; best = u; }
    }
    if (!best) { s.game.hud.toast('Nothing to hook', 'No police car close behind you (45 m).', 'var(--muted)', 2); return false; }
    best.stunned = T(5);
    best.spinDir = Math.random() < 0.5 ? -1 : 1;
    best.car.gripFactor = 0.2;
    best.car.yawRate += best.spinDir * 5;
    this._spark(best.car.pos);
    audio.sfx('crash0', { vol: 0.7 });
    s.game.hud.toast('Hooked!', 'That police car spins out and stalls for 5 seconds.', '#d8a028', 2.5);
    return true;
  }

  _spark(pos) {
    for (let i = 0; i < 14; i++) {
      this.state.particles.emit(pos.x, pos.y + 1.2, pos.z, {
        vx: (Math.random() - 0.5) * 6, vy: 2 + Math.random() * 4, vz: (Math.random() - 0.5) * 6,
        size: 0.35, grow: 0, life: 0.6, alpha: 1, color: [0.5, 0.8, 1.6], glow: true,
      });
    }
  }

  // ---------------------------------------------------------------- Jammer
  // ---------------------------------------------------------------- Paint Shifter
  _plates() {
    const s = this.state, p = s.player, police = s.police, paint = s.playerMesh.userData.paint;
    this.shifted = T(PLATES_TIME);
    if (paint) paint.color.setHex(DISGUISE_PAINTS[Math.floor(Math.random() * DISGUISE_PAINTS.length)]);
    if (police.everSeen) {
      // They're looking for a different car now: the search restarts somewhere else
      const a = Math.random() * Math.PI * 2;
      police.lastKnown.set(p.pos.x + Math.cos(a) * 140, 0, p.pos.z + Math.sin(a) * 140);
      police.searching = true;
      police.timeSinceSeen = 0;
      police.jammed = Math.max(police.jammed || 0, 3);
      for (const u of police.units) { u.targetNode = null; u.patrolGoal = null; u.searchGoal = null; }
    }
    this._wave(p.pos, 0xff7ad9, 30);
    audio.sfx('whoosh', { vol: 1 });
    s.game.hud.toast('New paint, new plates!', `The police are looking for a different car for ${T(PLATES_TIME)} seconds.`, '#ff7ad9', 3);
  }

  // ---------------------------------------------------------------- Blackout Mode
  _blackout() {
    const s = this.state;
    s.police.blackout = T(BLACKOUT_TIME);
    this.dark = T(BLACKOUT_TIME);
    s.playerMesh.userData.beam.visible = false;
    for (const c of s.playerMesh.children) if (c.isLight) c.visible = false;
    audio.sfx('click', { vol: 1 });
    s.game.hud.toast('Blackout!', `Lights off: the police only see you from close up for ${T(BLACKOUT_TIME)} seconds.`, '#5a6a8a', 3);
  }

  _jammer() {
    const s = this.state, p = s.player, police = s.police;
    police.jammed = T(JAM_TIME);
    if (s.heli) s.heli.blinded = T(JAM_TIME);
    if (s.roadblocks) s.roadblocks.cooldown = Math.max(s.roadblocks.cooldown, T(JAM_TIME) + 4); // (nobody can call in a roadblock either)
    if (police.everSeen) {
      // They think you went the other way: the search starts 150 m off.
      const a = Math.random() * Math.PI * 2;
      police.lastKnown.set(p.pos.x + Math.cos(a) * 150, 0, p.pos.z + Math.sin(a) * 150);
      police.searching = true;
      police.timeSinceSeen = 0;
      for (const u of police.units) { u.targetNode = null; u.patrolGoal = null; u.searchGoal = null; }
    }
    this._wave(p.pos, 0xff3a6a, 60);
    audio.sfx('sting', { vol: 0.5 });
    s.game.hud.toast('Radio jammed!', `The police lost your trail. They can't call you in for ${T(JAM_TIME)} seconds.`, '#ff3a6a', 3);
  }

  /** An expanding glowing ring on the ground. */
  _wave(pos, color, radius) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 64), makeGlowMaterial(color, 0.9));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, 0.3, pos.z);
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    flash.position.set(pos.x, 1.5, pos.z);
    flash.scale.setScalar(12);
    this.state.scene.add(ring, flash);
    this.waves.push({ ring, flash, t: 0, radius });
  }

  // ---------------------------------------------------------------- Per step / frame
  /** Physics step: police cars that drive onto oil spin out. */
  simulate(dt) {
    for (const st of this.strips) {
      for (const u of this.state.police.units) {
        if (st.hit.has(u)) continue;
        const c = u.car, dx = c.pos.x - st.x, dz = c.pos.z - st.z;
        const along = dx * st.ax + dz * st.az;          // across the road
        const across = Math.abs(dx * st.az - dz * st.ax); // distance from the strip
        if (Math.abs(along) < SPIKE_HALF + 0.6 && across < 1.4 && c.speed > 3) {
          st.hit.add(u);
          u.flat = T(FLAT_TIME);
          this._spark(c.pos);
          audio.sfx('spike', { vol: 0.4 });
        }
      }
    }
    for (const sl of this.slicks) {
      for (const u of this.state.police.units) {
        if (u.stunned > 0) continue;
        const c = u.car;
        if (Math.hypot(c.pos.x - sl.pos.x, c.pos.z - sl.pos.z) < OIL_RADIUS && c.speed > 4) {
          u.stunned = T(SPIN_TIME);
          u.emp = false;
          u.spinDir = Math.random() < 0.5 ? -1 : 1;
          c.gripFactor = 0.15;
          c.yawRate += u.spinDir * 3;
        }
      }
    }
  }

  /** What's running right now, and for how long (shown under the gadget badge). */
  _effects() {
    const fx = [];
    const names = { freeze: 'Police frozen', emp: 'Cruisers knocked out', jammer: 'Radio jammed' };
    for (const [id, t] of Object.entries(this.timed)) fx.push({ name: names[id], left: t.left, total: t.total });
    if (this.screen > 0) fx.push({ name: 'Smoke screen', left: this.screen, total: T(SCREEN_TIME) });
    if (this.shifted > 0) fx.push({ name: 'New paint', left: this.shifted, total: T(PLATES_TIME) });
    if (this.dark > 0) fx.push({ name: 'Blackout', left: this.dark, total: T(BLACKOUT_TIME) });
    if (this.locator?.on) fx.push({ name: 'Radar', left: this.locator.t, total: this.locator.total });
    const last = (list, total, name) => {
      if (!list.length) return;
      const left = Math.max(...list.map((x) => total - x.t));
      fx.push({ name: list.length > 1 ? `${name} ×${list.length}` : name, left, total });
    };
    last(this.slicks, T(OIL_TIME), 'Oil slick');
    last(this.strips, T(SPIKE_TIME), 'Spike strip');
    return fx;
  }

  /** Radar Locator: mark the police cars, the helicopter and the goal for 10 s. */
  _radar() {
    this.locator ||= new Locator(this.state, { driving: true });
    const n = this.locator.start(T(LOCATOR_TIME));
    audio.sfx('whoosh', { vol: 0.7 });
    this.state.game.hud.toast('Radar ping!', n ? `${n} marked for ${T(LOCATOR_TIME)} seconds.` : 'Nothing close by right now.', '#5ab4ff', 2.5);
  }

  update(dt) {
    this.slot.update(dt);
    this.locator?.update(dt);
    for (const [id, t] of Object.entries(this.timed)) { t.left -= dt; if (t.left <= 0) delete this.timed[id]; }
    this.slot.showEffects(this._effects());
    if (this.shifted > 0) {
      this.shifted -= dt;
      if (this.shifted <= 0) { this.state.applySettings?.(); this.state.game.hud.toast('Paint back to normal', '', 'var(--muted)', 1.5); }
    }
    if (this.dark > 0) {
      this.dark -= dt;
      if (this.dark <= 0) this._lightsOn();
    }
    this.strips = this.strips.filter((st) => {
      st.t += dt;
      st.glow.material.opacity = 0.18 + Math.sin(st.t * 5) * 0.07;
      if (st.t > T(SPIKE_TIME)) { this.state.scene.remove(st.mesh); return false; }
      return true;
    });
    // Smoke screen: grey clouds pour out of the exhaust
    if (this.screen > 0) {
      this.screen -= dt;
      const p = this.state.player;
      // (the particle pool is shared with tyre smoke, so keep it to ~1 puff a frame)
      this.state.particles.emit(p.pos.x - p.fwdX * 2.4 + (Math.random() - 0.5) * 1.5, 0.8 + Math.random(), p.pos.z - p.fwdZ * 2.4 + (Math.random() - 0.5) * 1.5, {
        vx: -p.fwdX * 2 + (Math.random() - 0.5) * 3, vy: 0.6 + Math.random(), vz: -p.fwdZ * 2 + (Math.random() - 0.5) * 3,
        size: 3.2, grow: 4.5, life: 2, alpha: 0.6, color: [0.55, 0.58, 0.63],
      });
    }
    this.slicks = this.slicks.filter((sl) => {
      sl.t += dt;
      sl.mesh.scale.setScalar(Math.min(1, 0.2 + sl.t * 3));
      sl.sheen.rotation.z += dt * 0.4;
      sl.sheen.material.opacity = 0.06 + Math.sin(sl.t * 2) * 0.03; // a faint oily shimmer
      if (sl.t > T(OIL_TIME)) { this.state.scene.remove(sl.mesh); return false; }
      return true;
    });
    this.waves = this.waves.filter((w) => {
      w.t += dt;
      const k = Math.min(1, w.t / 0.7);
      w.ring.scale.setScalar(1 + k * w.radius);
      w.ring.material.opacity = 0.9 * (1 - k);
      w.flash.material.opacity = Math.max(0, 1 - w.t * 3);
      if (k >= 1) { this.state.scene.remove(w.ring, w.flash); return false; }
      return true;
    });
  }

  _lightsOn() {
    const m = this.state.playerMesh;
    if (!m) return;
    m.userData.beam.visible = true;
    for (const c of m.children) if (c.isLight) c.visible = true;
  }

  reset() {
    if (this.shifted > 0) this.state.applySettings?.();
    if (this.dark > 0) this._lightsOn();
    this.shifted = 0;
    this.dark = 0;
    this.timed = {};
    for (const st of this.strips) this.state.scene.remove(st.mesh);
    this.strips = [];
    this.screen = 0;
    for (const sl of this.slicks) this.state.scene.remove(sl.mesh);
    for (const w of this.waves) this.state.scene.remove(w.ring, w.flash);
    this.slicks = [];
    this.waves = [];
    this.locator?.stop();
    this.slot.cooldown = 0;
  }

  dispose() {
    this.reset();
    this.slot.hide();
  }
}

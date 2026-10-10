import * as THREE from 'three';
import { GadgetSlot } from './gadgetSlot.js';
import { makeGlowMaterial, getGlowTexture } from '../world/materials.js';
import { audio } from '../core/audio.js';
import { admin } from '../core/admin.js';

/** A gadget effect's length (the admin's "Double power-ups" ability doubles them all). */
const T = (t) => t * (admin.flag('doublePower') || admin.flag('doubleAll') ? 2 : 1);

// Your CAR gadgets, in the story parts where you're in some other vehicle
// while on foot (the speedboats, the dune buggy, the handcar, the balloon,
// the ore cart). Same loadout and recharge timers as in the car; the same
// gadgets, aimed at whatever is chasing you there.
//
// A mode that uses these says so (get vehicle() { return true; }) and can
// give:
//   gadgetVehicle()   { pos, fwdX, fwdZ }: where you are and which way you face
//   gadgetTargets()   [{ pos, hit(time, how) }]: what's chasing you; how is
//                     'stall' (engine dead, brakes on), 'spin' (spun out and
//                     stalled) or 'slow' (burst tyres, tangled in a net)
//   gadgetHide(time)  they can't see you for a while (smoke, jammer, new paint,
//                     blackout; the EMPs too, where there's nothing to stall)
//   gadgetEffect(id, gadgets)  handle a gadget in its own way (return true)
// carTarget(car) makes a target out of a Car (see Car.held / Car.slowT).

const OIL_TIME = 14, OIL_RADIUS = 5.5, SPIN_TIME = 2.2;
const EMP_RADIUS = 45, EMP_TIME = 5;
const SPIKE_TIME = 18, SPIKE_HALF = 3.4, FLAT_TIME = 10;
const HIDE = { screen: 7, jammer: 8, plates: 12, blackout: 8 };

/** A Car (the chasers' launches and buggies) as a gadget target. */
export function carTarget(car) {
  return {
    pos: car.pos,
    hit(time, how) {
      if (how === 'slow') { car.slowT = Math.max(car.slowT || 0, time); return; }
      car.held = Math.max(car.held || 0, time);
      if (how === 'spin') { car.yawRate += (Math.random() < 0.5 ? -1 : 1) * 4; car.gripFactor = 0.3; car.regrip = time; }
    },
  };
}

export class VehicleGadgets {
  constructor(state) {
    this.state = state;
    this.slot = new GadgetSlot(state.game, 'car');
    this.slicks = [];
    this.strips = [];
    this.waves = [];
    this.marks = [];
    this.timed = {};
  }

  get concealed() { return false; }
  get lure() { return null; }

  _me() {
    const m = this.state.mode, v = m.gadgetVehicle?.();
    if (v) return v;
    const p = this.state.player;
    return { pos: p.pos, fwdX: Math.sin(p.facing || 0), fwdZ: Math.cos(p.facing || 0) };
  }
  _targets() { return this.state.mode.gadgetTargets?.() || []; }

  /** Use a gadget: the one in slot i (0-2), or the one you used last. */
  use(i = null) {
    if (i != null && !this.slot.select(i)) return;
    if (!this.slot.ready) { this.slot.explainNotReady(); return; }
    const id = this.slot.gadget.id;
    if (this._use(id)) this.slot.used();
  }

  _use(id) {
    const s = this.state, m = s.mode, hud = s.game.hud, me = this._me();
    const own = m.gadgetEffect?.(id, this);
    if (own === true || own === false) return own; // (the mode handled it: used, or not used)
    if (id === 'teleport') { hud.toast('Not here', 'The Teleporter only works in the city.', 'var(--muted)', 2); return false; }
    if (id === 'oil') {
      for (const d of [6, 11, 16]) this._oilAt(me, d);
      audio.sfx('whoosh', { vol: 0.8 });
      hud.toast('Oil slick!', 'A trail of oil behind you: anything chasing you that goes over it spins out.', '#8a5cff', 2);
      return true;
    }
    if (id === 'spikes' || id === 'net') { this._strip(me, id === 'net'); return true; }
    if (id === 'radar') { this._radar(); return true; }
    if (id === 'tow') {
      let best = null, bd = 45;
      for (const t of this._targets()) {
        const dx = t.pos.x - me.pos.x, dz = t.pos.z - me.pos.z, d = Math.hypot(dx, dz);
        if (d < bd && dx * me.fwdX + dz * me.fwdZ < 2) { bd = d; best = t; }
      }
      if (!best) { hud.toast('Nothing to hook', 'Nothing close behind you (45 m).', 'var(--muted)', 2); return false; }
      best.hit(T(5), 'spin');
      this._spark(best.pos);
      audio.sfx('crash', { vol: 0.7 });
      hud.toast('Hooked!', 'It spins out and stalls for 5 seconds.', '#d8a028', 2.5);
      return true;
    }
    const emp = { emp: [EMP_RADIUS, EMP_TIME, 'EMP!', 0x3d9bff], surge: [80, 4, 'Power surge!', 0x8a5cff], paint: [45, 5, 'Paint bomb!', 0xff6ad0],
      tumble: [55, 5, 'Tumbleweeds!', 0xc8a070], freeze: [1e9, 10, 'Frozen!', 0x8af4ff] }[id];
    if (emp) {
      const [radius, time, title, color] = emp;
      let hit = 0;
      for (const t of this._targets()) {
        if (admin.flag('infiniteRange') || Math.hypot(t.pos.x - me.pos.x, t.pos.z - me.pos.z) < radius) { t.hit(T(time), 'stall'); this._spark(t.pos); hit++; }
      }
      const hid = m.gadgetHide?.(T(time), title);
      this._wave(me.pos, color, Math.min(radius, 150));
      s.game.post?.lightning?.(0.3);
      audio.sfx('thunder', { vol: 0.5 });
      this.timed[id] = { left: T(time), total: T(time), name: hit ? 'Chasers knocked out' : title.replace('!', '') };
      hud.toast(title, hit ? `${hit} of them knocked out for ${T(time)} seconds. Go!` : hid ? `Nobody can see you for ${T(time)} seconds.` : 'Nothing was close enough.', '#' + color.toString(16).padStart(6, '0'), 3);
      return true;
    }
    if (HIDE[id] || id) {
      // smoke screen, radio jammer, new paint, blackout (and anything else): they lose sight of you
      const time = T(HIDE[id] || 6);
      const names = { screen: 'Smoke screen!', jammer: 'Radio jammed!', plates: 'New paint, new plates!', blackout: 'Blackout!' };
      const hid = m.gadgetHide?.(time, names[id]);
      for (const t of this._targets()) t.hit(Math.min(time, 3), 'stall'); // (they hesitate: where did you go?)
      if (id === 'screen') this.smoke = time;
      this._wave(me.pos, id === 'jammer' ? 0xff3a6a : id === 'plates' ? 0xff7ad9 : 0x9aa2ae, 30);
      audio.sfx(id === 'jammer' ? 'sting' : 'whoosh', { vol: 0.8 });
      this.timed[id] = { left: time, total: time, name: (names[id] || 'Hidden').replace(/[!,].*$/, '') };
      hud.toast(names[id] || 'Gadget!', hid ? `They can't see you for ${time} seconds. Get away!` : `Whatever's chasing you loses you for a moment.`, '#9aa2ae', 3);
      return true;
    }
    return false;
  }

  _oilAt(me, back) {
    const pos = new THREE.Vector3(me.pos.x - me.fwdX * back, (me.pos.y || 0) + 0.06, me.pos.z - me.fwdZ * back);
    const g = new THREE.Group();
    const puddle = new THREE.Mesh(new THREE.CircleGeometry(OIL_RADIUS, 28), new THREE.MeshStandardMaterial({ color: 0x050508, roughness: 0.08, metalness: 0.6, transparent: true, opacity: 0.92 }));
    puddle.rotation.x = -Math.PI / 2;
    const sheen = new THREE.Mesh(new THREE.RingGeometry(OIL_RADIUS * 0.3, OIL_RADIUS * 0.9, 28), makeGlowMaterial(0x4a2a8a, 0.07));
    sheen.rotation.x = -Math.PI / 2;
    sheen.position.y = 0.01;
    g.add(puddle, sheen);
    g.position.copy(pos);
    g.scale.setScalar(0.2);
    this.state.scene.add(g);
    this.slicks.push({ mesh: g, sheen, pos, t: 0, hit: new Set() });
  }

  _strip(me, net) {
    const x = me.pos.x - me.fwdX * 6, z = me.pos.z - me.fwdZ * 6, ax = -me.fwdZ, az = me.fwdX;
    const g = new THREE.Group();
    const bar = new THREE.Mesh(new THREE.BoxGeometry(SPIKE_HALF * 2, net ? 0.04 : 0.08, net ? 2.4 : 0.5), new THREE.MeshStandardMaterial({ color: net ? 0x3a9a8a : 0x2a2d33, metalness: net ? 0 : 0.6, roughness: 0.5, wireframe: net }));
    bar.position.y = 0.05;
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(SPIKE_HALF * 2 + 0.6, 1.1), makeGlowMaterial(0xff9a3d, 0.25));
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.02;
    g.add(bar, glow);
    g.position.set(x, (me.pos.y || 0) + 0.02, z);
    g.rotation.y = Math.atan2(ax, az) - Math.PI / 2;
    this.state.scene.add(g);
    this.strips.push({ mesh: g, glow, x, z, ax, az, t: 0, hit: new Set() });
    audio.sfx(net ? 'whoosh' : 'spike', { vol: 0.6 });
    this.state.game.hud.toast(net ? 'Net out!' : 'Spike strip down!', 'Anything chasing you that goes over it is slowed right down.', '#ff9a3d', 2);
  }

  /** Radar: a marker over everything chasing you, for 10 seconds. */
  _radar() {
    this._clearMarks();
    for (const t of this._targets()) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0xff3346, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, toneMapped: false }));
      sp.scale.setScalar(3);
      sp.renderOrder = 10;
      this.state.scene.add(sp);
      this.marks.push({ sp, t });
    }
    this.radarT = T(10);
    audio.sfx('whoosh', { vol: 0.7 });
    this.state.game.hud.toast('Radar ping!', this.marks.length ? `${this.marks.length} chaser${this.marks.length > 1 ? 's' : ''} marked for ${T(10)} seconds.` : 'Nothing chasing you right now.', '#5ab4ff', 2.5);
  }
  _clearMarks() { for (const mk of this.marks) this.state.scene.remove(mk.sp); this.marks = []; }

  _spark(pos) {
    const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0x8ad0ff, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    f.position.set(pos.x, pos.y + 1.5, pos.z);
    f.scale.setScalar(5);
    this.state.scene.add(f);
    this.waves.push({ flash: f, t: 0, radius: 0 });
  }

  _wave(pos, color, radius) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 64), makeGlowMaterial(color, 0.9));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, (pos.y || 0) + 0.3, pos.z);
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    flash.position.set(pos.x, (pos.y || 0) + 1.5, pos.z);
    flash.scale.setScalar(12);
    this.state.scene.add(ring, flash);
    this.waves.push({ ring, flash, t: 0, radius });
  }

  _effects() {
    const fx = Object.values(this.timed).map((t) => ({ name: t.name, left: t.left, total: t.total }));
    if (this.radarT > 0) fx.push({ name: 'Radar', left: this.radarT, total: T(10) });
    const last = (list, total, name) => {
      if (!list.length) return;
      fx.push({ name: list.length > 1 ? `${name} ×${list.length}` : name, left: Math.max(...list.map((x) => total - x.t)), total });
    };
    last(this.slicks, T(OIL_TIME), 'Oil slick');
    last(this.strips, T(SPIKE_TIME), 'Spike strip');
    return fx;
  }

  update(dt) {
    this.slot.update(dt);
    for (const [id, t] of Object.entries(this.timed)) { t.left -= dt; if (t.left <= 0) delete this.timed[id]; }
    this.slot.showEffects(this._effects());
    const targets = this.slicks.length || this.strips.length ? this._targets() : [];
    this.slicks = this.slicks.filter((sl) => {
      sl.t += dt;
      sl.mesh.scale.setScalar(Math.min(1, 0.2 + sl.t * 3));
      sl.sheen.rotation.z += dt * 0.4;
      for (const t of targets) {
        if (sl.hit.has(t.pos) || Math.hypot(t.pos.x - sl.pos.x, t.pos.z - sl.pos.z) > OIL_RADIUS) continue;
        sl.hit.add(t.pos);
        t.hit(T(SPIN_TIME), 'spin');
      }
      if (sl.t > T(OIL_TIME)) { this.state.scene.remove(sl.mesh); return false; }
      return true;
    });
    this.strips = this.strips.filter((st) => {
      st.t += dt;
      st.glow.material.opacity = 0.18 + Math.sin(st.t * 5) * 0.07;
      for (const t of targets) {
        if (st.hit.has(t.pos)) continue;
        const dx = t.pos.x - st.x, dz = t.pos.z - st.z;
        if (Math.abs(dx * st.ax + dz * st.az) < SPIKE_HALF + 0.6 && Math.abs(dx * st.az - dz * st.ax) < 1.4) {
          st.hit.add(t.pos);
          t.hit(T(FLAT_TIME), 'slow');
          this._spark(t.pos);
          audio.sfx('spike', { vol: 0.4 });
        }
      }
      if (st.t > T(SPIKE_TIME)) { this.state.scene.remove(st.mesh); return false; }
      return true;
    });
    if (this.radarT > 0) {
      this.radarT -= dt;
      for (const mk of this.marks) mk.sp.position.set(mk.t.pos.x, mk.t.pos.y + 4, mk.t.pos.z);
      if (this.radarT <= 0) this._clearMarks();
    }
    if (this.smoke > 0) {
      this.smoke -= dt;
      const me = this._me();
      if (Math.random() < dt * 14) this._puff(me);
    }
    this.waves = this.waves.filter((w) => {
      w.t += dt;
      const k = Math.min(1, w.t / 0.7);
      if (w.ring) { w.ring.scale.setScalar(1 + k * w.radius); w.ring.material.opacity = 0.9 * (1 - k); }
      w.flash.material.opacity = Math.max(0, 1 - w.t * 3);
      if (k >= 1) { if (w.ring) this.state.scene.remove(w.ring); this.state.scene.remove(w.flash); return false; }
      return true;
    });
  }

  /** A grey puff of smoke behind you (the smoke screen). */
  _puff(me) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0x9aa2ae, transparent: true, opacity: 0.55, depthWrite: false }));
    sp.position.set(me.pos.x - me.fwdX * 3 + (Math.random() - 0.5) * 2, (me.pos.y || 0) + 1 + Math.random(), me.pos.z - me.fwdZ * 3 + (Math.random() - 0.5) * 2);
    sp.scale.setScalar(4);
    this.state.scene.add(sp);
    this.waves.push({ flash: sp, t: -1.2, radius: 0 }); // (fades out over a couple of seconds)
  }

  reset() {
    for (const sl of this.slicks) this.state.scene.remove(sl.mesh);
    for (const st of this.strips) this.state.scene.remove(st.mesh);
    for (const w of this.waves) { if (w.ring) this.state.scene.remove(w.ring); this.state.scene.remove(w.flash); }
    this._clearMarks();
    this.slicks = []; this.strips = []; this.waves = [];
    this.timed = {};
    this.smoke = 0;
    this.radarT = 0;
    this.slot.cooldown = 0;
  }

  dispose() {
    this.reset();
    this.slot.hide();
  }
}

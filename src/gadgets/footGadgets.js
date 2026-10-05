import * as THREE from 'three';
import { GadgetSlot } from './gadgetSlot.js';
import { getGlowTexture } from '../world/materials.js';
import { PlayerModel } from '../player/playerModel.js';
import { audio } from '../core/audio.js';
import { admin } from '../core/admin.js';

/** A gadget effect's length (the admin's "Double power-ups" ability doubles them all). */
const T = (t) => t * (admin.flag('doublePower') || admin.flag('doubleAll') ? 2 : 1);

// On-foot gadgets (press F):
//   Smoke Bomb  - a cloud at your feet; inside it the police can't see you
//   Holo-Decoy  - a hologram of you that the spotlights and officers chase
//   Grapple Gun - aim at a building and get pulled up onto its roof
//   Flashbang   - blinds helicopter crews and stuns nearby officers
//
// The on-foot modes ask this object two things:
//   concealed  - is the player hidden by smoke right now?
//   lure       - a fake "player" (the decoy) for the police to chase, or null

const SMOKE_TIME = 6, SMOKE_RADIUS = 5;
const DECOY_TIME = 8;
const GRAPPLE_RANGE = 24, GRAPPLE_MAX_RISE = 18; // enough to get from the street onto most roofs
const FAR = 600; // "infinite range" ability (admin): as far as you can see
const FLASH_BLIND = 5, FLASH_RADIUS = 15;
const CLOAK_TIME = 15;
const BLINK_RANGE = 16; // m (60 with the admin's infinite range)
const DECOY_RUN = 5.5;  // m/s: the hologram runs off the way you were looking
const MIRAGE_TIME = 7, CHAMELEON_TIME = 12, BOX_TIME = 30;

const _v = new THREE.Vector3(), _dir = new THREE.Vector3();

export class FootGadgets {
  /** @param {import('../states/onFootState.js').OnFootState} state */
  constructor(state) {
    this.state = state;
    this.slot = new GadgetSlot(state.game, 'foot');
    this.smoke = null;   // { group, puffs, t, pos }
    this.decoy = null;   // { model, t, body }
    this.cable = null;
  }

  get concealed() {
    if (this.cloak > 0) return true; // Invisibility Cloak (admin) / Mirage Cloak
    const pc = this.state.player;
    if (this.box && pc.horizontalSpeed < 3.6) return true;          // Cardboard Box: still, or creeping
    if (this.cham > 0 && pc.horizontalSpeed < 5.2) return true;     // Chameleon Suit: walking
    const s = this.smoke;
    return !!s && s.t < T(SMOKE_TIME) && (admin.flag('infiniteRange') || this.state.player.pos.distanceTo(s.pos) < SMOKE_RADIUS);
  }

  /** The decoy, shaped like the player object the police AI expects. */
  get lure() {
    return this.decoy ? this.decoy.body : null;
  }

  use() {
    if (this.state.mode.ghost) return; // no police to fool in ghost mode
    if (this.box) { this._clearBox('You throw the box off.'); return; } // (press again to get out)
    if (!this.slot.ready) { this.slot.explainNotReady(); return; }
    const id = this.slot.gadget.id;
    const ok = id === 'smoke' ? this._smoke() : id === 'decoy' ? this._decoy() : id === 'flash' ? this._flash()
      : id === 'cloak' ? this._cloak() : id === 'mirage' ? this._cloak(T(MIRAGE_TIME), 'Mirage Cloak!')
      : id === 'box' ? this._box() : id === 'chameleon' ? this._chameleon() : id === 'blink' ? this._blink() : this._grapple();
    if (ok) this.slot.used();
  }

  // ---------------------------------------------------------------- Smoke
  _smoke() {
    this._clearSmoke();
    const p = this.state.player.pos;
    const group = new THREE.Group();
    const tex = getGlowTexture();
    const puffs = [];
    for (let i = 0; i < 18; i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0x9aa2ae, transparent: true, opacity: 0, depthWrite: false }));
      const a = Math.random() * Math.PI * 2, r = Math.random() * 2.2;
      m.position.set(Math.cos(a) * r, 0.4 + Math.random() * 1.6, Math.sin(a) * r);
      puffs.push({ m, vx: Math.cos(a) * (1 + Math.random()), vz: Math.sin(a) * (1 + Math.random()), vy: 0.3 + Math.random() * 0.6, s: 2 + Math.random() * 2 });
      group.add(m);
    }
    group.position.copy(p);
    this.state.scene.add(group);
    this.smoke = { group, puffs, t: 0, pos: p.clone() };
    audio.sfx('whoosh', { vol: 1 });
    this.state.game.hud.toast('Smoke bomb!', 'Stay inside the cloud: the police can\'t see you for 6 seconds.', '#b8c0cc', 3);
    return true;
  }

  _clearSmoke() {
    if (!this.smoke) return;
    this.state.scene.remove(this.smoke.group);
    for (const p of this.smoke.puffs) p.m.material.dispose();
    this.smoke = null;
  }

  // ---------------------------------------------------------------- Decoy
  _decoy() {
    this._clearDecoy();
    const pc = this.state.player;
    const model = new PlayerModel({ hoodie: 0x39e6ff, trousers: 0x1a8aa8, mask: 0x39e6ff, skin: 0x8af4ff, gloves: 0x39e6ff, shoes: 0x1a8aa8, hair: 0x1a8aa8, hat: 0x1a8aa8 },
      { bag: true, style: { ...this.state.model?.style } }); // (shaped like you)
    model.root.traverse((o) => {
      if (o.isMesh) {
        o.material = o.material.clone();
        o.material.transparent = true;
        o.material.opacity = 0.6;
        o.material.emissive?.setHex(0x1aa8c8);
        o.castShadow = false;
      }
    });
    // A glowing ring at the hologram's feet
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.8, 28), new THREE.MeshBasicMaterial({ color: 0x39e6ff, transparent: true, opacity: 0.8, toneMapped: false, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    model.root.add(ring);
    this.state.scene.add(model.root);
    // It runs off the way you're looking
    const look = this.state.camera.getWorldDirection(new THREE.Vector3());
    const facing = Math.atan2(look.x, look.z);
    const body = {
      pos: pc.pos.clone(), vel: new THREE.Vector3(), facing, state: 'ground', horizontalSpeed: DECOY_RUN,
      mantleProgress: 0, stateTime: 0, stumbleTimer: 0, mantle: null, wallRun: null,
      isLure: true, // the helicopter always spots it
    };
    this.decoy = { model, t: 0, body, ring };
    audio.sfx('checkpoint', { vol: 0.6 });
    this.state.game.hud.toast('Holo-decoy!', 'Your hologram runs off and the police chase it for 8 seconds. Go the other way!', '#39e6ff', 3);
    return true;
  }

  _clearDecoy() {
    if (!this.decoy) return;
    this.state.scene.remove(this.decoy.model.root);
    this.decoy = null;
  }

  /** The hologram runs on; at a wall it turns aside (and stops at a drop). */
  _runDecoy(d, dt) {
    const b = d.body, w = this.state.world;
    if (b.horizontalSpeed <= 0) return;
    for (let tries = 0; tries < 4; tries++) {
      const fx = Math.sin(b.facing), fz = Math.cos(b.facing);
      _v.set(b.pos.x, b.pos.y + 0.8, b.pos.z);
      _dir.set(fx, 0, fz);
      const step = DECOY_RUN * dt;
      const g = w.groundHeight(b.pos.x + fx * 0.8, b.pos.z + fz * 0.8, b.pos.y + 0.6);
      const ground = Number.isFinite(g) && g > -1 ? g : 0;
      if (!(w.raycast(_v, _dir, 0.8) < 0.8) && Math.abs(ground - b.pos.y) < 0.7) {
        b.pos.x += fx * step;
        b.pos.z += fz * step;
        b.pos.y = ground;
        return;
      }
      b.facing += (tries % 2 ? -1 : 1) * (Math.PI / 2) * (tries + 1); // (try right, then left...)
    }
    b.horizontalSpeed = 0; // (boxed in: it stands there)
  }

  // ---------------------------------------------------------------- Blink
  /** Where Blink would take you right now (the spot under the crosshair), or null. */
  _blinkTarget() {
    const s = this.state, pc = s.player;
    const range = admin.flag('infiniteRange') ? 60 : BLINK_RANGE;
    const from = _v.copy(s.camera.position);
    s.camera.getWorldDirection(_dir);
    const startD = Math.max(0, Math.hypot(from.x - pc.pos.x, from.z - pc.pos.z) - 0.5); // (start at you, not behind you)
    const hit = s.world.raycast(from, _dir, range + startD);
    const d = Math.min(hit < range + startD ? hit - 0.45 : range + startD, range + startD);
    if (d - startD < 1.5) return null;
    const x = from.x + _dir.x * d, z = from.z + _dir.z * d, y = from.y + _dir.y * d;
    const g = s.world.groundHeight(x, z, y + 0.6);
    const top = Number.isFinite(g) && g > -1 ? g : 0;
    if (y - top > 30) return null; // (nothing under it)
    const clear = s.world.query(x - 0.3, top + 0.05, z - 0.3, x + 0.3, top + 1.8, z + 0.3, []).every((q) => q.disabled);
    return clear ? new THREE.Vector3(x, top, z) : null;
  }

  _blink() {
    const s = this.state, pc = s.player, t = this._blinkTarget();
    if (!t) {
      s.game.hud.toast('Can\'t blink there', 'Aim at open ground or a roof (the ring shows where you\'ll land).', 'var(--muted)', 2);
      return false;
    }
    const from = pc.pos.clone();
    pc.teleport(t.x, t.y + 0.05, t.z, pc.facing);
    // A flash where you were and where you land
    for (const p of [from, t]) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0x8af4ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      m.position.set(p.x, p.y + 1, p.z);
      m.scale.setScalar(3.5);
      s.scene.add(m);
      this.flashes = this.flashes || [];
      this.flashes.push({ m, t: 0 });
    }
    audio.sfx('whoosh', { vol: 1 });
    return true;
  }

  /** While Blink is ready, a ring shows where it would take you. */
  _blinkAim(dt) {
    const id = this.slot.gadget?.id, pc = this.state.player;
    const show = (id === 'blink' || id === 'grapple') && this.slot.ready && !this.state.mode.ghost && !this.state.mode.inputLocked && pc.state !== 'grapple' && pc.state !== 'zip';
    const t = !show ? null : id === 'blink' ? this._blinkTarget() : this._grappleTarget().target || null;
    if (!this.blinkRing) {
      this.blinkRing = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.6, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0x8af4ff, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }));
      this.blinkRing.renderOrder = 4;
      this.state.scene.add(this.blinkRing);
    }
    this.blinkRing.visible = !!t;
    this.blinkRing.material.color.setHex(id === 'grapple' ? 0xffb020 : 0x8af4ff); // (orange: the grapple's anchor)
    if (t) { this.blinkRing.position.set(t.x, t.y + 0.06, t.z); this.blinkRing.rotation.y += dt * 2; }
    for (const f of this.flashes || []) {
      f.t += dt;
      f.m.material.opacity = Math.max(0, 1 - f.t / 0.5);
      f.m.scale.setScalar(3.5 + f.t * 6);
      if (f.t > 0.5) { this.state.scene.remove(f.m); f.m.material.dispose(); }
    }
    if (this.flashes) this.flashes = this.flashes.filter((f) => f.t <= 0.5);
  }

  // ---------------------------------------------------------------- Invisibility Cloak (admin)
  _cloak(time = T(CLOAK_TIME), title = 'Invisible!') {
    this.cloak = time;
    this.cloakTotal = time;
    this.cloakName = title === 'Invisible!' ? 'Invisible' : title.replace('!', '');
    this._setSeeThrough(true);
    audio.sfx('whoosh', { vol: 0.8 });
    this.state.game.hud.toast(title, `Nobody can see you for ${time} seconds.`, '#b48cff', 3);
    return true;
  }

  /** Make the player's body see-through (or solid again). */
  _setSeeThrough(on, opacity = 0.22) {
    const root = this.state.model?.root;
    root?.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      o.material.transparent = on;
      o.material.opacity = on ? opacity : 1;
      o.material.needsUpdate = true;
    });
  }

  // ---------------------------------------------------------------- Chameleon Suit
  _chameleon() {
    this.cham = T(CHAMELEON_TIME);
    this.chamTotal = this.cham;
    this._setSeeThrough(true, 0.4);
    audio.sfx('whoosh', { vol: 0.6 });
    this.state.game.hud.toast('Chameleon suit!', `Walk, don't sprint: nobody can see you for ${T(CHAMELEON_TIME)} seconds.`, '#6affb0', 3);
    return true;
  }

  // ---------------------------------------------------------------- Cardboard Box
  _box() {
    const pc = this.state.player;
    if (pc.state !== 'ground') { this.state.game.hud.toast('Not in mid-air', 'Stand on something first.', 'var(--muted)', 2); return false; }
    const mat = new THREE.MeshLambertMaterial({ color: 0xb88a52 });
    const mesh = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.05, 1.1), mat);
    body.position.y = 0.525;
    body.castShadow = true;
    const tape = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.06, 0.22), new THREE.MeshLambertMaterial({ color: 0xd8c8a0 }));
    tape.position.y = 1.03;
    mesh.add(body, tape);
    this.state.scene.add(mesh);
    this.box = { mesh, t: 0 };
    this.state.model.root.visible = false;
    audio.sfx('land', { vol: 0.6 });
    this.state.game.hud.toast('Cardboard box', 'Stand still or creep along: nobody looks twice at a box. Sprint, or press the gadget button again, to throw it off.', '#c8a46a', 4);
    return true;
  }

  _clearBox(msg) {
    if (!this.box) return;
    this.state.scene.remove(this.box.mesh);
    this.box = null;
    if (this.state.model) this.state.model.root.visible = !this.state.cam?.firstPerson;
    if (msg) this.state.game.hud.toast(msg, '', 'var(--muted)', 1.5);
  }

  // ---------------------------------------------------------------- Flashbang
  _flash() {
    const s = this.state, mode = s.mode, p = s.player.pos;
    let blinded = 0, stunned = 0;
    for (const h of [mode.heli, ...(mode.helis || [])]) {
      if (!h) continue;
      h.blinded = T(FLASH_BLIND);
      // The spotlight swings away from you while the crew can't see
      const a = Math.random() * Math.PI * 2;
      h.lastSeen.set(p.x + Math.cos(a) * 35, p.y, p.z + Math.sin(a) * 35);
      blinded++;
    }
    const units = new Set([...(mode.officers?.units || []), ...(mode.patrols?.units || []), ...(mode.guards?.units || []), ...(mode.mailGuard?.units || [])]);
    for (const u of units) {
      if (u.waitTimer > 0 || u.down) continue;
      if (admin.flag('infiniteRange') || u.pc.pos.distanceTo(p) < FLASH_RADIUS) { u.stunned = T(FLASH_BLIND); u.model?.hit?.(0.5); u.investigate = null; stunned++; }
    }
    // A white burst at your feet
    const burst = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0xfff6c8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    burst.position.set(p.x, p.y + 1.5, p.z);
    s.scene.add(burst);
    this.burst = { sprite: burst, t: 0 };
    s.game.post?.lightning?.(0.8);
    audio.sfx('thunder', { vol: 0.35 });
    if (blinded || stunned) { this.dazed = T(FLASH_BLIND); this.dazedTotal = this.dazed; }
    const what = [blinded ? `${blinded > 1 ? 'Helicopters' : 'The helicopter'} blinded` : '', stunned ? `${stunned} ${stunned > 1 ? 'people' : 'person'} stunned` : ''].filter(Boolean).join(', ');
    s.game.hud.toast('Flashbang!', what ? `${what} for ${T(FLASH_BLIND)} seconds. Go!` : 'Nobody was close enough to be dazzled.', '#fff3a0', 3);
    return true;
  }

  // ---------------------------------------------------------------- Grapple
  _grapple() {
    const s = this.state, pc = s.player;
    if (pc.state === 'zip' || pc.state === 'grapple') return false;
    const aim = this._grappleTarget();
    if (aim.why) { s.game.hud.toast(aim.why[0], aim.why[1], 'var(--muted)', 2); return false; }
    const { target, top } = aim;
    pc.grapple(target);
    // The cable: a bright line from your hands to the anchor point
    this._clearCable();
    const geo = new THREE.BufferGeometry().setFromPoints([pc.pos.clone(), target.clone().setY(top + 0.3)]);
    this.cable = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffb020, toneMapped: false }));
    this.cable.userData.anchor = target.clone().setY(top + 0.3);
    s.scene.add(this.cable);
    audio.sfx('whoosh', { vol: 1.2 });
    return true;
  }

  /** Where the Grapple Gun would pull you up to: { target, top }, or { why: [title, text] }. */
  _grappleTarget() {
    const s = this.state, pc = s.player;
    const from = _v.set(pc.pos.x, pc.pos.y + 1.4, pc.pos.z);
    s.camera.getWorldDirection(_dir);
    // Aim a little upwards: players usually look at the wall, not the roof edge.
    _dir.y = Math.max(_dir.y, -0.15) + 0.12;
    _dir.normalize();
    const far = admin.flag('infiniteRange');
    const range = far ? FAR : GRAPPLE_RANGE, maxRise = far ? FAR : GRAPPLE_MAX_RISE;
    const hit = s.world.raycast(from, _dir, range);
    if (!(hit < range)) return { why: ['Nothing to grab', far ? 'Aim the crosshair at a building.' : 'Aim the camera at a building within 24 m.'] };
    // The roof just past where the cable hit
    const hx = from.x + _dir.x * (hit + 0.9), hz = from.z + _dir.z * (hit + 0.9);
    const top = s.world.groundHeight(hx, hz, pc.pos.y + maxRise + 0.5);
    const rise = top - pc.pos.y;
    const clear = s.world.query(hx - 0.3, top + 0.05, hz - 0.3, hx + 0.3, top + 1.8, hz + 0.3, []).length === 0;
    if (rise > maxRise || rise < (far ? -60 : -4) || !clear || top < 1) return { why: ['Can\'t reach that', 'Aim at a building up to 18 m higher, with room on the roof.'] };
    return { target: new THREE.Vector3(hx, top + 0.02, hz), top };
  }

  _clearCable() {
    if (!this.cable) return;
    this.state.scene.remove(this.cable);
    this.cable.geometry.dispose();
    this.cable = null;
  }

  // ---------------------------------------------------------------- Per frame
  /** What's running right now, and for how long (shown under the gadget badge). */
  _effects() {
    const fx = [];
    if (this.cloak > 0) fx.push({ name: this.cloakName || 'Invisible', left: this.cloak, total: this.cloakTotal || this.cloak });
    if (this.cham > 0) fx.push({ name: 'Chameleon suit', left: this.cham, total: this.chamTotal || this.cham });
    if (this.box) fx.push({ name: 'Cardboard box', left: T(BOX_TIME) - this.box.t, total: T(BOX_TIME) });
    if (this.smoke) fx.push({ name: 'Smoke', left: T(SMOKE_TIME) - this.smoke.t, total: T(SMOKE_TIME) });
    if (this.decoy) fx.push({ name: 'Decoy', left: T(DECOY_TIME) - this.decoy.t, total: T(DECOY_TIME) });
    if (this.dazed > 0) fx.push({ name: 'Police dazed', left: this.dazed, total: this.dazedTotal });
    return fx;
  }

  update(dt) {
    this.slot.update(dt);
    this._blinkAim(dt);
    if (this.dazed > 0) this.dazed -= dt;
    this.slot.showEffects(this._effects());
    if (this.box) {
      const pc = this.state.player, b = this.box;
      b.t += dt;
      b.mesh.position.set(pc.pos.x, pc.pos.y, pc.pos.z);
      b.mesh.rotation.y = pc.facing;
      b.mesh.position.y += pc.horizontalSpeed > 0.5 ? Math.abs(Math.sin(b.t * 9)) * 0.05 : 0; // (shuffling along)
      this.state.model.root.visible = false;
      if (pc.horizontalSpeed > 6 || pc.state !== 'ground' && pc.state !== 'air') this._clearBox('Box off!');
      else if (b.t > T(BOX_TIME)) this._clearBox('The box falls apart.');
    }
    if (this.cham > 0) {
      this.cham -= dt;
      if (this.cham <= 0) { this._setSeeThrough(false); this.state.game.hud.toast('Suit off', '', 'var(--muted)', 1.5); }
    }
    if (this.cloak > 0) {
      this.cloak -= dt;
      if (this.cloak <= 0) {
        this._setSeeThrough(false);
        this.state.game.hud.toast('Visible again', '', 'var(--muted)', 1.5);
      }
    }
    if (this.burst) {
      const b = this.burst;
      b.t += dt;
      b.sprite.scale.setScalar(4 + b.t * 60);
      b.sprite.material.opacity = Math.max(0, 1 - b.t * 2.5);
      if (b.t > 0.4) { this.state.scene.remove(b.sprite); b.sprite.material.dispose(); this.burst = null; }
    }
    const s = this.smoke;
    if (s) {
      s.t += dt;
      const fadeIn = Math.min(1, s.t * 3), fadeOut = Math.max(0, 1 - Math.max(0, s.t - T(SMOKE_TIME) + 1.5) / 1.5);
      for (const p of s.puffs) {
        p.m.position.x += p.vx * dt * Math.max(0, 1 - s.t / 2);
        p.m.position.z += p.vz * dt * Math.max(0, 1 - s.t / 2);
        p.m.position.y += p.vy * dt * 0.4;
        p.m.scale.setScalar(p.s + s.t * 0.9);
        p.m.material.opacity = 0.75 * fadeIn * fadeOut;
      }
      // Guards caught in the cloud can't see a thing: they stop and cough
      const m = this.state.mode;
      for (const sq of [m.guards, m.patrols, m.mailGuard]) {
        for (const u of sq?.units || []) {
          if (!u.down && u.pc.pos.distanceTo(s.pos) < SMOKE_RADIUS + 0.5) { u.stunned = Math.max(u.stunned || 0, 0.6); u.investigate = null; }
        }
      }
      if (s.t > T(SMOKE_TIME)) this._clearSmoke();
    }
    const d = this.decoy;
    if (d) {
      d.t += dt;
      this._runDecoy(d, dt);
      d.model.update(dt, d.body);
      // Hologram flicker, stronger as it runs out
      const flick = Math.random() < (d.t > T(DECOY_TIME) - 2 ? 0.25 : 0.05) ? 0.15 : 0.6;
      d.model.root.traverse((o) => { if (o.isMesh && o.material.transparent) o.material.opacity = flick; });
      d.ring.rotation.z += dt * 3;
      if (d.t > T(DECOY_TIME)) this._clearDecoy();
    }
    if (this.cable) {
      if (this.state.player.state !== 'grapple') this._clearCable();
      else {
        const pos = this.cable.geometry.attributes.position;
        const p = this.state.player.pos;
        pos.setXYZ(0, p.x, p.y + 1.6, p.z);
        pos.needsUpdate = true;
      }
    }
  }

  /** Clear any active effects (on restart / respawn). */
  reset() {
    if (this.cloak > 0 || this.cham > 0) this._setSeeThrough(false);
    this.cloak = 0;
    this.cham = 0;
    this.dazed = 0;
    this._clearBox();
    this._clearSmoke();
    this._clearDecoy();
    this._clearCable();
    this.slot.cooldown = 0;
  }

  dispose() {
    this.reset();
    this.slot.hide();
  }
}

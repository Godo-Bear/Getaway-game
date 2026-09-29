import * as THREE from 'three';
import { GadgetSlot } from './gadgetSlot.js';
import { getGlowTexture } from '../world/materials.js';
import { PlayerModel } from '../player/playerModel.js';
import { audio } from '../core/audio.js';

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
const FLASH_BLIND = 5, FLASH_RADIUS = 15;
const CLOAK_TIME = 15;

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
    if (this.cloak > 0) return true; // Invisibility Cloak (admin)
    const s = this.smoke;
    return !!s && s.t < SMOKE_TIME && this.state.player.pos.distanceTo(s.pos) < SMOKE_RADIUS;
  }

  /** The decoy, shaped like the player object the police AI expects. */
  get lure() {
    return this.decoy ? this.decoy.body : null;
  }

  use() {
    if (this.state.mode.ghost) return; // no police to fool in ghost mode
    if (!this.slot.ready) { this.slot.explainNotReady(); return; }
    const id = this.slot.gadget.id;
    const ok = id === 'smoke' ? this._smoke() : id === 'decoy' ? this._decoy() : id === 'flash' ? this._flash()
      : id === 'cloak' ? this._cloak() : this._grapple();
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
    const model = new PlayerModel({ hoodie: 0x39e6ff, trousers: 0x1a8aa8, mask: 0x39e6ff, skin: 0x8af4ff, gloves: 0x39e6ff, shoes: 0x1a8aa8 }, { bag: true });
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
    const body = {
      pos: pc.pos.clone(), vel: new THREE.Vector3(), facing: pc.facing, state: 'ground', horizontalSpeed: 0,
      mantleProgress: 0, stateTime: 0, stumbleTimer: 0, mantle: null, wallRun: null,
      isLure: true, // the helicopter always spots it
    };
    this.decoy = { model, t: 0, body, ring };
    audio.sfx('checkpoint', { vol: 0.6 });
    this.state.game.hud.toast('Holo-decoy!', 'The police will chase the hologram for 8 seconds. Run!', '#39e6ff', 3);
    return true;
  }

  _clearDecoy() {
    if (!this.decoy) return;
    this.state.scene.remove(this.decoy.model.root);
    this.decoy = null;
  }

  // ---------------------------------------------------------------- Invisibility Cloak (admin)
  _cloak() {
    this.cloak = CLOAK_TIME;
    this._setSeeThrough(true);
    audio.sfx('whoosh', { vol: 0.8 });
    this.state.game.hud.toast('Invisible!', `Nobody can see you for ${CLOAK_TIME} seconds.`, '#b48cff', 3);
    return true;
  }

  /** Make the player's body see-through (or solid again). */
  _setSeeThrough(on) {
    const root = this.state.model?.root;
    root?.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      o.material.transparent = on;
      o.material.opacity = on ? 0.22 : 1;
      o.material.needsUpdate = true;
    });
  }

  // ---------------------------------------------------------------- Flashbang
  _flash() {
    const s = this.state, mode = s.mode, p = s.player.pos;
    let blinded = 0, stunned = 0;
    for (const h of [mode.heli, ...(mode.helis || [])]) {
      if (!h) continue;
      h.blinded = FLASH_BLIND;
      // The spotlight swings away from you while the crew can't see
      const a = Math.random() * Math.PI * 2;
      h.lastSeen.set(p.x + Math.cos(a) * 35, p.y, p.z + Math.sin(a) * 35);
      blinded++;
    }
    for (const u of mode.officers?.units || []) {
      if (u.waitTimer > 0) continue;
      if (u.pc.pos.distanceTo(p) < FLASH_RADIUS) { u.stunned = FLASH_BLIND; stunned++; }
    }
    // A white burst at your feet
    const burst = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0xfff6c8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    burst.position.set(p.x, p.y + 1.5, p.z);
    s.scene.add(burst);
    this.burst = { sprite: burst, t: 0 };
    s.game.post?.lightning?.(0.8);
    audio.sfx('thunder', { vol: 0.35 });
    const what = [blinded ? `${blinded > 1 ? 'Helicopters' : 'The helicopter'} blinded` : '', stunned ? `${stunned} officer${stunned > 1 ? 's' : ''} stunned` : ''].filter(Boolean).join(', ');
    s.game.hud.toast('Flashbang!', what ? `${what} for ${FLASH_BLIND} seconds. Go!` : 'Nobody was close enough to be dazzled.', '#fff3a0', 3);
    return true;
  }

  // ---------------------------------------------------------------- Grapple
  _grapple() {
    const s = this.state, pc = s.player;
    if (pc.state === 'zip' || pc.state === 'grapple') return false;
    const from = _v.set(pc.pos.x, pc.pos.y + 1.4, pc.pos.z);
    s.camera.getWorldDirection(_dir);
    // Aim a little upwards: players usually look at the wall, not the roof edge.
    _dir.y = Math.max(_dir.y, -0.15) + 0.12;
    _dir.normalize();
    const hit = s.world.raycast(from, _dir, GRAPPLE_RANGE);
    if (!(hit < GRAPPLE_RANGE)) {
      s.game.hud.toast('Nothing to grab', 'Aim the camera at a building within 24 m.', 'var(--muted)', 2);
      return false;
    }
    // The roof just past where the cable hit
    const hx = from.x + _dir.x * (hit + 0.9), hz = from.z + _dir.z * (hit + 0.9);
    const top = s.world.groundHeight(hx, hz, pc.pos.y + GRAPPLE_MAX_RISE + 0.5);
    const rise = top - pc.pos.y;
    const clear = s.world.query(hx - 0.3, top + 0.05, hz - 0.3, hx + 0.3, top + 1.8, hz + 0.3, []).length === 0;
    if (rise > GRAPPLE_MAX_RISE || rise < -4 || !clear || top < 1) {
      s.game.hud.toast('Can\'t reach that', 'Aim at a building up to 18 m higher, with room on the roof.', 'var(--muted)', 2);
      return false;
    }
    const target = new THREE.Vector3(hx, top + 0.02, hz);
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

  _clearCable() {
    if (!this.cable) return;
    this.state.scene.remove(this.cable);
    this.cable.geometry.dispose();
    this.cable = null;
  }

  // ---------------------------------------------------------------- Per frame
  update(dt) {
    this.slot.update(dt);
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
      const fadeIn = Math.min(1, s.t * 3), fadeOut = Math.max(0, 1 - Math.max(0, s.t - SMOKE_TIME + 1.5) / 1.5);
      for (const p of s.puffs) {
        p.m.position.x += p.vx * dt * Math.max(0, 1 - s.t / 2);
        p.m.position.z += p.vz * dt * Math.max(0, 1 - s.t / 2);
        p.m.position.y += p.vy * dt * 0.4;
        p.m.scale.setScalar(p.s + s.t * 0.9);
        p.m.material.opacity = 0.75 * fadeIn * fadeOut;
      }
      if (s.t > SMOKE_TIME) this._clearSmoke();
    }
    const d = this.decoy;
    if (d) {
      d.t += dt;
      d.model.update(dt, d.body);
      // Hologram flicker, stronger as it runs out
      const flick = Math.random() < (d.t > DECOY_TIME - 2 ? 0.25 : 0.05) ? 0.15 : 0.6;
      d.model.root.traverse((o) => { if (o.isMesh && o.material.transparent) o.material.opacity = flick; });
      d.ring.rotation.z += dt * 3;
      if (d.t > DECOY_TIME) this._clearDecoy();
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
    if (this.cloak > 0) this._setSeeThrough(false);
    this.cloak = 0;
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

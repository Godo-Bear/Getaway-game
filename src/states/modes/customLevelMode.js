import * as THREE from 'three';
import { buildCustomLevel, levelId } from '../../editor/customLevel.js';
import { makeGlowMaterial } from '../../world/materials.js';
import { Helicopter } from '../../ai/helicopter.js';
import { save } from '../../core/save.js';
import { admin } from '../../core/admin.js';
import { diff } from '../../core/difficulty.js';
import { formatTime, clamp } from '../../core/utils.js';
import { noteCaught } from '../../core/jail.js';
import { audio } from '../../core/audio.js';
import { owns } from '../../gadgets/gadgets.js';

// Playing a level from the Level Editor (on foot): grab every cash bag,
// then reach the finish, as fast as you can. Optional police helicopter
// (caught = back to the start). Best times are saved per level layout.
// Nothing here pays out Shop cash (you could build a level full of it!).

const PICKUP_R = 1.6;

export class CustomLevelMode {
  constructor(state, params) {
    this.state = state;
    this.data = params.custom;
    this.fromEditor = !!params.fromEditor;
    this.hudSections = ['tl', 'meter', 'controls', 'marker'];
    this.time = this.data.time || 'night';
    this.indoors = true; // (the street is part of the level: no "climb back up" help)
    this.heli = null;
  }

  build() {
    const L = buildCustomLevel(this.data);
    this.level = L;
    L.spawn.yaw = 0;
    this.bags = L.cash.map((pos) => {
      const g = new THREE.Group();
      const bag = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.4), new THREE.MeshLambertMaterial({ color: 0x3b4a2a, emissive: 0x2a5a20, emissiveIntensity: 0.6 }));
      bag.position.y = 0.9;
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.0, 28), makeGlowMaterial(0x4dffa6, 0.8));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.05;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 30, 10, 1, true), makeGlowMaterial(0x4dffa6, 0.14));
      beam.position.y = 15;
      g.add(bag, ring, beam);
      g.position.copy(pos);
      L.group.add(g);
      return { pos, group: g, bag, taken: false };
    });
    // Gliders: a little blue wing on a stand. Pick one up to glide.
    const wingMat = new THREE.MeshBasicMaterial({ color: 0x39e6ff, toneMapped: false, side: THREE.DoubleSide });
    this.gliders = L.gliders.map((pos) => {
      const g = new THREE.Group();
      const wing = new THREE.Group();
      const left = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0.3), new THREE.Vector3(-1.1, 0.15, -0.2), new THREE.Vector3(0, 0, -0.35)]), wingMat);
      const right = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0.3), new THREE.Vector3(0, 0, -0.35), new THREE.Vector3(1.1, 0.15, -0.2)]), wingMat);
      wing.add(left, right);
      wing.position.y = 1.2;
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.0, 28), makeGlowMaterial(0x39e6ff, 0.8));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.05;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 24, 10, 1, true), makeGlowMaterial(0x39e6ff, 0.14));
      beam.position.y = 12;
      g.add(wing, ring, beam);
      g.position.copy(pos);
      L.group.add(g);
      return { pos, group: g, wing, taken: false };
    });
    return L;
  }

  afterBuild() {
    this.state.player.zipLines = this.level.zipLines || [];
  }

  start() {
    const s = this.state, hud = s.game.hud;
    this.done = false;
    this.spotted = 0;
    this.caught = 0;
    for (const b of this.bags) { b.taken = false; b.group.visible = true; }
    for (const gl of this.gliders) { gl.taken = false; gl.group.visible = true; }
    s.player.canGlide = owns('glider'); // (a glider in the level lends you one)
    this.heli?.dispose();
    this.heli = this.data.heli ? new Helicopter(s.scene, s.world, { id: 0, startPos: this.level.spawn.clone().add(new THREE.Vector3(-50, 0, 40)) }) : null;
    hud.setPhase(`Your level · ${this.data.name}`);
    hud.setObjective(this.bags.length ? 'Grab the cash, then reach the finish' : 'Reach the finish');
    hud.toast(this.data.name, this.bags.length ? `Grab all ${this.bags.length} cash bags, then get to the green finish beam.` : 'Get to the green finish beam.', 'var(--amber)', 4);
  }

  get bagsLeft() {
    return this.bags.filter((b) => !b.taken).length;
  }

  audioMix() {
    const p = this.state.player.pos;
    const d = this.heli ? Math.hypot(this.heli.pos.x - p.x, this.heli.pos.z - p.z) : Infinity;
    return { rotor: this.heli ? clamp(1 - d / 110, 0.05, 1) * 0.55 : 0, music: 0.5, intensity: 0.3 + this.spotted * 0.6 };
  }

  update(dt) {
    if (this.done) return;
    const s = this.state, p = s.player, hud = s.game.hud, t = s.time;
    // Cash bags
    for (const b of this.bags) {
      if (b.taken) continue;
      b.bag.rotation.y += dt * 1.5;
      if (Math.hypot(p.pos.x - b.pos.x, p.pos.z - b.pos.z) < PICKUP_R && Math.abs(p.pos.y - b.pos.y) < 2.2) {
        b.taken = true;
        b.group.visible = false;
        audio.sfx('cash', { vol: 0.7 });
        const left = this.bagsLeft;
        hud.toast(left ? `Cash! ${left} to go` : 'All the cash!', left ? '' : 'Now get to the finish.', 'var(--safe)', 1.5);
      }
    }
    // Lasers: pulse on (1.2 s) and off (2 s, longer on Easy). Crossing one
    // while it's on and you're standing up = back to the start. (We check
    // whether you crossed the beam since the last frame, so a slow frame
    // can't skip it.)
    const prevZ = this.prevZ ?? p.pos.z;
    this.prevZ = p.pos.z;
    const cycle = 1.2 + 2.0 * diff().timer;
    for (const las of this.level.lasers) {
      const k = (t + las.phase * cycle) % cycle;
      const on = k < 1.2, warn = !on && k > cycle - 0.35;
      las.beam.visible = on || (warn && Math.random() < 0.5);
      las.beam.material.opacity = on ? 1 : 0.4;
      las.beam.material.transparent = !on;
      const crossed = (prevZ - las.z) * (p.pos.z - las.z) <= 0 || Math.abs(p.pos.z - las.z) < 0.4;
      if (on && crossed && !admin.flag('noLasers') && p.pos.x > las.x0 && p.pos.x < las.x1
        && las.y > p.pos.y + 0.02 && las.y < p.pos.y + p.height && !admin.flag('god')) {
        this.prevZ = null;
        this.caught++;
        s.laserAlarm();
        s.placePlayer(this.level.spawn, 0);
        s.flash('ALARM!', 'You touched a laser. Wait for it to switch off, or crouch (C) / slide under it. Back to the start.', 'var(--red)');
        return;
      }
    }
    // Gliders
    for (const gl of this.gliders) {
      if (gl.taken) continue;
      gl.wing.rotation.y += dt * 1.8;
      gl.wing.position.y = 1.2 + Math.sin(t * 2.5) * 0.12;
      if (Math.hypot(p.pos.x - gl.pos.x, p.pos.z - gl.pos.z) < PICKUP_R && Math.abs(p.pos.y - gl.pos.y) < 2.2) {
        gl.taken = true;
        gl.group.visible = false;
        p.canGlide = true;
        audio.sfx('clue', { vol: 0.7 });
        hud.toast('Glider!', 'Jump off something high, then jump again in mid-air and HOLD jump to glide.', 'var(--cyan)', 5);
      }
    }
    // Helicopter (after a few seconds)
    if (this.heli && t > 6) {
      const d = diff();
      const params = { spotSpeed: (5.4 + Math.min(1.5, t / 80)) * d.spot, fill: 0.45 * d.fill, lead: 0.2 };
      this.heli.update(dt, s.policeTarget, params);
      // (inside a hideout hut or under a water tower: hidden)
      const hidden = (this.level.hideSpots || []).some((h) => Math.hypot(h.x - p.pos.x, h.z - p.pos.z) < 1.5 && Math.abs(h.y - p.pos.y) < 1);
      const lit = this.heli.isPlayerLit(p.pos) && !s.concealed && !hidden;
      this.spotted = clamp(this.spotted + (lit ? dt * params.fill : -dt * 0.55), 0, 1);
      hud.setMeter(this.spotted, lit ? 'SPOTTED! Get out of the light' : hidden ? 'Hiding' : 'Hidden', lit ? 'var(--red)' : '#8a8f9c');
      if (this.spotted >= 1 && !admin.flag('god')) {
        if (noteCaught(s)) return; // (the third time: off to jail)
        this.caught++;
        this.spotted = 0;
        audio.sfx('caught');
        s.placePlayer(this.level.spawn, 0);
        s.flash('Caught!', 'Back to the start.', 'var(--red)');
      }
    }
    // Finish
    const g = this.level.goalPos, left = this.bagsLeft;
    this.level.finishRing.rotation.z += dt;
    if (Math.hypot(p.pos.x - g.x, p.pos.z - g.z) < 2.2 && Math.abs(p.pos.y - g.y) < 2.5) {
      if (left) {
        if (!this._warned) { this._warned = true; hud.toast('Not yet!', `${left} cash bag${left > 1 ? 's' : ''} left.`, 'var(--amber)', 2); }
      } else { this._finish(); return; }
    } else this._warned = false;
    // Marker: nearest bag, then the finish
    let target = null, bd = Infinity;
    for (const b of this.bags) {
      if (b.taken) continue;
      const d = p.pos.distanceTo(b.pos);
      if (d < bd) { bd = d; target = b.pos; }
    }
    if (target) hud.setMarker(target.clone().setY(target.y + 1.4), s.camera, 'Cash', 'var(--safe)', bd);
    else hud.setMarker(g.clone().setY(g.y + 2), s.camera, 'Finish', 'var(--amber)', p.pos.distanceTo(g));
    hud.setStats(`<span>Time <b>${formatTime(t)}</b></span>` +
      (this.bags.length ? `<span>Cash <b>${this.bags.length - left}/${this.bags.length}</b></span>` : '') +
      ((this.heli || this.level.lasers.length) ? `<span${this.caught ? ' class="warn"' : ''}>Caught <b>${this.caught}</b></span>` : ''));
  }

  _finish() {
    this.done = true;
    const s = this.state, t = s.time;
    audio.sfx('win');
    const id = levelId(this.data), best = save.data.levels.best;
    const prev = best[id];
    const record = !prev || t < prev;
    if (record) { best[id] = t; save.write(); }
    const edit = { label: this.fromEditor ? 'Back to the editor' : 'Open in the editor', onClick: () => s.game.sm.change('title', { editor: this.data }) };
    s.gameOver(`
      <p class="kicker">${this.data.name}</p>
      <h2>Finished!</h2>
      <p class="sub">Time <b>${formatTime(t)}</b>${this.heli ? ` · caught ${this.caught} time${this.caught === 1 ? '' : 's'}` : ''}</p>
      <p class="sub">${record ? (prev ? `New best! (was ${formatTime(prev)})` : 'Your first finish: that\'s the time to beat.') : `Best: ${formatTime(prev)}`}</p>`,
    [edit], { retryLabel: 'Play again' });
  }

  /** Fell in the water (or off the world): back to dry land. */
  onFall() {
    this.state.respawnToSafety('Splash! Back to dry land.');
  }

  adminSkip() {
    if (!this.done) this._finish();
  }

  teardown() {
    this.heli?.dispose();
    this.heli = null;
  }
}

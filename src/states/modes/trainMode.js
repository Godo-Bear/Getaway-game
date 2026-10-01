import * as THREE from 'three';
import { buildChapter6Train, TRAIN_SPEED } from '../../world/levels/chapter6Train.js';
import { makeGlowMaterial } from '../../world/materials.js';
import { GuardSquad } from '../../ai/guards.js';
import { Helicopter } from '../../ai/helicopter.js';
import { MiniGame } from '../../ui/miniGame.js';
import { CHAPTERS } from '../../story/chapters.js';
import { getChapterRun } from '../../story/chapterRun.js';
import { finishPart } from '../../story/chapterFlow.js';
import { earn } from '../../gadgets/gadgets.js';
import { admin } from '../../core/admin.js';
import { diff } from '../../core/difficulty.js';
import { formatTime, clamp, makeRng } from '../../core/utils.js';
import { audio } from '../../core/audio.js';

// Chapter 6: on top of the moving prison supply train. Two stages (the
// part's train.stage):
//   'mail'   - from the back of the train to the MAIL CAR: drop in through
//              the roof hatch, get past the guard inside and crack the
//              prison's safe (the gate pass and the payroll).
//   'bridge' - from the mail car's roof to the COAL WAGON at the front,
//              across the long sea bridge: a police helicopter searches the
//              train with its spotlight (hide inside the mail car or behind
//              cover) and wind gusts try to blow you off (crouch!).
//
// The train stands still; the world scrolls past it (see chapter6Train.js).
//   - Run forward along the roofs, jumping the gaps between wagons.
//   - LOW BRIDGES come down the line every so often: a warning, the horn,
//     then the bridge sweeps along the whole train. Standing on a roof when
//     it reaches you = knocked off (back to the checkpoint). Crouch, or be
//     down on a flat wagon.
//   - Two guards with torches pace the roofs (cones). Sneak up behind them
//     and knock them out (E), like the casino.
//   - Green payroll bags: bonus cash.
//   - Get into the covered half of the coal wagon at the front before the
//     train reaches the prison gate. Near the end it crosses the long rail
//     bridge over the sea.

const JOURNEY = 150;         // seconds to the prison gate (x difficulty)
const BRIDGE_BOTTOM = 5.4;   // underside of a low bridge (standing on a roof = hit; crouching = fine)
const BRIDGE_DEPTH = 6;
const WARN_DIST = 75;        // metres ahead of you the warning starts
const BAG_CASH = 40;
const LOOP = 900;            // scenery wraps round every this-many metres

export class TrainMode {
  constructor(state, params) {
    this.state = state;
    this.chapter = CHAPTERS[params.chapterId || 'chapter6'];
    this.partIndex = params.part || 0;
    this.part = this.chapter.parts[this.partIndex];
    this.hudSections = ['tl', 'meter', 'controls', 'marker'];
    this.weather = 'clear';
    this.time = 'night';
    this.indoors = true; // (no "climb back up to the roofs" help)
    this.stage = this.part.train?.stage || 'mail';
    this.mini = null;
  }

  /** Stand still while cracking the safe */
  get inputLocked() {
    return !!this.mini;
  }

  /** The guards, as far as the gadgets are concerned (Flashbang stuns them). */
  get officers() {
    return this.guards;
  }

  build() {
    const L = buildChapter6Train();
    L.checkpoints = this.stage === 'bridge' ? L.checkpointsB : L.checkpointsA;
    L.spawn = L.checkpoints[0].spawn.clone();
    L.spawn.yaw = 0;
    this.level = L;
    this._buildScenery();
    // Payroll bags
    this.bags = L.bags.map((pos) => {
      const g = new THREE.Group();
      const bag = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.4), new THREE.MeshLambertMaterial({ color: 0x3b5a2a, emissive: 0x2a5a20, emissiveIntensity: 0.7 }));
      bag.position.y = 0.3;
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.8, 24), makeGlowMaterial(0x4dffa6, 0.8));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.03;
      g.add(bag, ring);
      g.position.copy(pos);
      L.group.add(g);
      return { pos, group: g, bag, taken: false };
    });
    this.guards = new GuardSquad(L.group, L.world, L.guardRoutes.map((route) => ({ route })), { sight: diff().guardSight, groundFrom: 8, range: 8, alertRange: 11 });
    // The guard inside the mail car (stage 1 only)
    this.mailGuard = this.stage === 'mail' ? new GuardSquad(L.group, L.world, [{ route: L.mailGuardRoute }], { sight: diff().guardSight, groundFrom: 3, range: 7 }) : null;
    // The safe in the mail car
    if (this.stage === 'mail') {
      this.safeRing = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.0, 32), makeGlowMaterial(0x39e6ff, 0.8));
      this.safeRing.rotation.x = -Math.PI / 2;
      this.safeRing.position.set(L.mail.safe.x, L.mail.safe.y + 0.03, L.mail.safe.z);
      L.group.add(this.safeRing);
    }
    return L;
  }

  // ------------------------------------------------------------------ scenery
  _buildScenery() {
    const g = this.scenery = new THREE.Group();
    this.level.group.add(g);
    const rng = makeRng(66);
    // Ground: one long strip with a track bed down the middle; its texture scrolls
    const c = document.createElement('canvas');
    c.width = 128; c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = '#26301f'; x.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 900; i++) { x.fillStyle = ['#1f281a', '#2e3a25', '#34402a', '#222b1c'][i % 4]; x.fillRect(rng() * 128, rng() * 256, 2 + rng() * 3, 2 + rng() * 3); }
    x.fillStyle = '#4a4540'; x.fillRect(52, 0, 24, 256);                         // ballast
    for (let v = 0; v < 256; v += 16) { x.fillStyle = '#3a2a1e'; x.fillRect(50, v, 28, 6); } // sleepers
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 40);
    this.groundTex = tex;
    this.groundMat = new THREE.MeshLambertMaterial({ map: tex });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 800), this.groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0.01, -200);
    ground.receiveShadow = true;
    g.add(ground);
    // The sea (for the last stretch, over the rail bridge)
    this.sea = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), new THREE.MeshLambertMaterial({ color: 0x0c2238 }));
    this.sea.rotation.x = -Math.PI / 2;
    this.sea.position.set(0, -0.6, -200);
    this.sea.visible = false;
    g.add(this.sea);

    const lambert = (color) => new THREE.MeshLambertMaterial({ color });
    const pole = { geo: new THREE.BoxGeometry(0.25, 7, 0.25), mat: lambert(0x3a2e24) };
    const arm = new THREE.BoxGeometry(2.4, 0.15, 0.15);
    const trunk = new THREE.CylinderGeometry(0.2, 0.3, 2.2, 6), crown = new THREE.ConeGeometry(1.8, 5, 7);
    const trunkMat = lambert(0x3a2a1c), crownMat = lambert(0x1d3a22);
    this.items = [];
    const place = (obj, z, land = true) => { obj.position.z = z; g.add(obj); this.items.push({ obj, land }); };
    // Telegraph poles on the left, every 30 m
    for (let z = 100; z > 100 - LOOP; z -= 30) {
      const o = new THREE.Group();
      const p = new THREE.Mesh(pole.geo, pole.mat); p.position.y = 3.5;
      const a = new THREE.Mesh(arm, pole.mat); a.position.y = 6.5;
      o.add(p, a); o.position.x = -6;
      place(o, z);
    }
    // Trees on both sides
    for (let z = 100; z > 100 - LOOP; z -= 9) {
      const side = rng() < 0.5 ? -1 : 1;
      const o = new THREE.Group();
      const t = new THREE.Mesh(trunk, trunkMat); t.position.y = 1.1;
      const cr = new THREE.Mesh(crown, crownMat); cr.position.y = 4.4;
      o.add(t, cr);
      o.position.x = side * (9 + rng() * 18);
      o.scale.setScalar(0.8 + rng() * 0.7);
      place(o, z + rng() * 6);
    }
    // Bridge girders along both sides (only over the sea)
    const girderMat = lambert(0x5a2a1a);
    for (let z = 100; z > 100 - LOOP; z -= 10) {
      const o = new THREE.Group();
      for (const sx of [-2.6, 2.6]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 6.5, 0.3), girderMat); post.position.set(sx, 2.6, 0);
        const diag = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 11), girderMat); diag.position.set(sx, 2.6, 0); diag.rotation.x = 0.55;
        o.add(post, diag);
      }
      const top = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.3, 0.3), girderMat); top.position.y = 5.9;
      o.add(top);
      o.visible = false;
      place(o, z, false);
    }
    // Low bridges (overpasses): a pool of two
    const deckMat = lambert(0x6a6a66), pierMat = lambert(0x55554f);
    this.bridges = [0, 1].map(() => {
      const o = new THREE.Group();
      const deck = new THREE.Mesh(new THREE.BoxGeometry(40, 1.1, BRIDGE_DEPTH), deckMat);
      deck.position.y = BRIDGE_BOTTOM + 0.55;
      deck.castShadow = true;
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(40, 0.25, BRIDGE_DEPTH + 0.05), new THREE.MeshBasicMaterial({ color: 0xffb020, toneMapped: false }));
      stripe.position.y = BRIDGE_BOTTOM + 0.12;
      o.add(deck, stripe);
      for (const sx of [-5, 5]) {
        const pier = new THREE.Mesh(new THREE.BoxGeometry(1.2, BRIDGE_BOTTOM, BRIDGE_DEPTH - 1), pierMat);
        pier.position.set(sx, BRIDGE_BOTTOM / 2, 0);
        o.add(pier);
      }
      o.visible = false;
      g.add(o);
      return { obj: o, z: 0, active: false, warned: false };
    });
  }

  _scroll(dt) {
    const d = TRAIN_SPEED * dt;
    this.groundTex.offset.y += (d * this.groundTex.repeat.y) / 800;
    const sea = this.stage === 'bridge'; // (stage 2 is all on the sea bridge)
    for (const it of this.items) {
      it.obj.position.z += d;
      if (it.obj.position.z > 100) it.obj.position.z -= LOOP;
      it.obj.visible = it.land ? !sea : sea;
    }
    for (const b of this.bridges) {
      if (!b.active) continue;
      b.z += d;
      b.obj.position.z = b.z;
      if (b.z > this.level.back + 40) { b.active = false; b.obj.visible = false; }
    }
  }

  _launchBridge() {
    const b = this.bridges.find((x) => !x.active);
    if (!b) return;
    b.active = true;
    b.warned = false;
    b.z = this.level.front - 320;
    b.obj.position.z = b.z;
    b.obj.visible = true;
  }

  // ------------------------------------------------------------------ run
  start(first) {
    const s = this.state;
    this.run = getChapterRun(s.game, this.chapter.id);
    this.done = false;
    this.cp = 0;
    this.spotted = 0;
    const bridge = this.stage === 'bridge';
    this.timeLeft = (bridge ? 110 : JOURNEY) * diff().timer;
    this.nextBridge = 12;
    this.nextGust = 7;
    this.gust = null;
    this.cash = 0;
    this._closeMini();
    this.miniBlocked = false;
    for (const b of this.bags) { b.taken = false; b.group.visible = true; }
    for (const b of this.bridges) { b.active = false; b.obj.visible = false; }
    this.guards.reset();
    this.mailGuard?.reset();
    // Over the sea from the start of stage 2
    this.sea.visible = bridge;
    this.groundMat.visible = !bridge;
    this.heli?.dispose();
    this.heli = bridge ? new Helicopter(s.scene, s.world, { id: 0, startPos: new THREE.Vector3(60, 0, -80) }) : null;
    const hud = s.game.hud;
    hud.setPhase(`${this.chapter.title} · Part ${this.partIndex + 1}: ${this.part.title}`);
    hud.setObjective(this.part.objective);
    if (first && !s.game.speedrun) s.showStoryCards(this.part.intro, this.part.startLabel || 'Go');
  }

  _closeMini() {
    this.mini?.close();
    this.mini = null;
  }

  _toCheckpoint(title, msg, color = 'var(--red)') {
    const s = this.state, cp = this.level.checkpoints[this.cp];
    this._closeMini();
    this.mailGuard?.reset();
    s.placePlayer(cp.spawn, cp.yaw);
    s.flash(title, msg, color);
    this.spotted = 0;
    this.guards.reset();
  }

  _caught(title, msg) {
    if (admin.flag('god')) { this.spotted = 0; return; }
    this.run.caught++;
    audio.sfx('caught');
    this._toCheckpoint(title, msg);
  }

  onRespawnKey() {
    this._toCheckpoint('Checkpoint', 'Back to the last checkpoint.', 'var(--cyan)');
  }

  onFall() {
    this._toCheckpoint('You fell off!', 'Back to the last checkpoint.', 'var(--cyan)');
  }

  audioMix() {
    const near = this.bridges.some((b) => b.active && b.z > this.state.player.pos.z - WARN_DIST);
    return { wind: 0.45, city: 0, siren: 0, music: 0.5, intensity: 0.45 + this.spotted * 0.5 + (near ? 0.2 : 0) };
  }

  update(dt) {
    if (this.done) return;
    const s = this.state, p = s.player, pos = p.pos, hud = s.game.hud, input = s.game.input, L = this.level;
    this.timeLeft -= dt;
    this._scroll(dt);

    // Fell off the side (onto the tracks / the grass)
    if (pos.y < 0.9) { this.onFall(); return; }

    // Checkpoints: pass them going forward
    for (let i = this.cp + 1; i < L.checkpoints.length; i++) {
      if (pos.z < L.checkpoints[i].z) { this.cp = i; hud.toast('Checkpoint', L.checkpoints[i].name, 'var(--cyan)', 2); audio.sfx('checkpoint', { vol: 0.6 }); }
    }

    // Low bridges (over land only)
    this.nextBridge -= dt;
    if (this.stage === 'mail' && this.nextBridge <= 0) {
      this._launchBridge();
      this.nextBridge = (20 + Math.random() * 10) * diff().timer;
    }
    let warn = null;
    for (const b of this.bridges) {
      if (!b.active) continue;
      const ahead = pos.z - b.z; // metres until it reaches you
      if (ahead > 0 && ahead < WARN_DIST) {
        warn = ahead;
        if (!b.warned) { b.warned = true; audio.sfx('horn', { vol: 1 }); hud.toast('BRIDGE!', 'Crouch (C / hold Slide) or get down onto a flat wagon!', 'var(--amber)', 2.5); }
      }
      if (Math.abs(ahead) < BRIDGE_DEPTH / 2 + 0.3 && pos.y > 2.5 && pos.y + p.height > BRIDGE_BOTTOM) {
        this._caught('Knocked off!', 'A low bridge hit you. Crouch (C, or hold Slide) when you hear the horn.');
        return;
      }
    }

    // Wind gusts on the sea bridge: crouch or get blown sideways
    if (this.stage === 'bridge') {
      this.nextGust -= dt;
      if (!this.gust && this.nextGust <= 0) {
        this.gust = { warn: 1.6, blow: 1.3, dir: Math.random() < 0.5 ? -1 : 1 };
        hud.toast('WIND!', 'A gust is coming: crouch (C / hold Slide)!', '#9fd4ff', 1.6);
      }
      if (this.gust) {
        const gst = this.gust;
        if (gst.warn > 0) gst.warn -= dt;
        else {
          gst.blow -= dt;
          if (pos.y > 3 && p.height > 1.3) pos.x += gst.dir * 2.4 * dt; // (crouching = you hold on)
          if (gst.blow <= 0) { this.gust = null; this.nextGust = (8 + Math.random() * 6) * diff().timer; }
        }
      }
    }

    // Guards with torches (and sneak takedowns); the helicopter on the bridge
    let seen = this.guards.update(dt, p, s.concealed);
    if (this.mailGuard?.update(dt, p, s.concealed)) seen = true;
    let lit = false;
    if (this.heli) {
      const d = diff();
      this.heli.update(dt, s.policeTarget, { spotSpeed: 6 * d.spot, fill: 0.5 * d.fill, lead: 0.15 });
      lit = this.heli.isPlayerLit(pos) && !s.concealed;
    }
    this.spotted = clamp(this.spotted + (seen ? (dt / 0.8) * diff().fill : 0) + (lit ? dt * 0.55 * diff().fill : 0) - (seen || lit ? 0 : dt * 0.5), 0, 1);
    if (warn != null) hud.setMeter(1 - warn / WARN_DIST, `BRIDGE in ${Math.ceil(warn)} m: DUCK!`, 'var(--amber)');
    else if (this.gust && this.gust.warn <= 0) hud.setMeter(1, 'WIND! Crouch!', '#9fd4ff');
    else if (!this.mini) hud.setMeter(this.spotted, lit ? 'The helicopter\'s light! Get under cover' : seen ? 'A guard can see you!' : 'Hidden', seen || lit ? 'var(--red)' : '#8a8f9c');
    if (this.spotted >= 1) { this._caught('Spotted!', lit ? 'The helicopter pinned you. Duck into the mail car or behind something tall until it moves on.' : 'A guard saw you. Stay out of the torch beams, or sneak up behind them.'); return; }
    const target = this.mini ? null : (this.guards.takedownTarget(p) || this.mailGuard?.takedownTarget(p));
    s.setAction(target ? 'Knock out' : null);
    if (target && input.wasPressed('interact')) {
      (this.guards.units.includes(target) ? this.guards : this.mailGuard).takedown(target);
      s.setAction(null);
      audio.sfx('land', { vol: 1 });
      hud.toast('Knocked out', '', 'var(--amber)', 1.5);
    }

    // Payroll bags
    for (const b of this.bags) {
      if (b.taken) continue;
      b.bag.rotation.y += dt * 1.5;
      if (Math.hypot(pos.x - b.pos.x, pos.z - b.pos.z) < 1.5 && Math.abs(pos.y - b.pos.y) < 1.6) {
        b.taken = true;
        b.group.visible = false;
        this.cash++;
        const got = earn(s.game, BAG_CASH, '', { quiet: true });
        audio.sfx('cash', { vol: 0.7 });
        hud.toast(`Payroll! +$${got}`, '', 'var(--safe)', 1.2);
      }
    }

    // Stage 1: crack the safe in the mail car
    if (this.stage === 'mail') {
      const S = L.mail.safe;
      this.safeRing.rotation.z += dt;
      if (this.mini) {
        if (input.wasPressed('crouch')) { this._closeMini(); this.miniBlocked = true; }
        else {
          const r = this.mini.update(dt, input.wasPressed('jump'));
          if (r === 'miss') this.spotted = Math.min(0.95, this.spotted + 0.1);
          if (r === 'done') { this._closeMini(); this._complete(); return; }
        }
      } else {
        const at = Math.hypot(pos.x - S.x, pos.z - S.z) < 1.4 && Math.abs(pos.y - S.y) < 1.2;
        if (!at) this.miniBlocked = false;
        else if (!this.miniBlocked) this.mini = new MiniGame({ type: 'safe', title: 'Cracking the prison\'s safe', hint: 'Jump (Space / A / tap) when the needle hits the notch · C to step away' });
      }
      this._marker(pos, pos.z > L.mail.inside.z0 || pos.y > 3.5 ? L.mail.hatch : S, pos.z > L.mail.inside.z0 || pos.y > 3.5 ? 'Roof hatch: drop in' : 'The safe');
      hud.setStats(`<span>Payroll <b>${this.cash}/${this.bags.length}</b></span><span>Time <b>${formatTime(s.time)}</b></span>`);
      return;
    }

    // Stage 2: hidden under the tarp = done
    const H = L.hide;
    L.hideGlow.material.opacity = 0.18 + Math.sin(s.time * 4) * 0.08;
    if (pos.x > H.minX && pos.x < H.maxX && pos.z > H.minZ && pos.z < H.maxZ && pos.y < H.maxY) { this._complete(); return; }
    // Reached the gate on the roof: the gate guards see you
    if (this.timeLeft <= 0) {
      this.timeLeft = 60 * diff().timer;
      this._caught('The gate guards saw you', 'Get into the coal wagon at the front before the train reaches the gate.');
      return;
    }

    this._marker(pos, L.goalPos, 'Hide under the tarp');
    const km = Math.max(0, (this.timeLeft * TRAIN_SPEED) / 1000).toFixed(1);
    hud.setStats(`<span class="${this.timeLeft < 30 ? 'warn' : ''}">Blackwater in <b>${km} km</b></span>` +
      `<span>Payroll <b>${this.cash}/${this.bags.length}</b></span><span>Time <b>${formatTime(s.time)}</b></span>`);
  }

  /** Point at a nearby payroll bag, or else at the objective. */
  _marker(pos, goal, goalLabel) {
    const s = this.state;
    let mk = goal, label = goalLabel;
    for (const b of this.bags) if (!b.taken && Math.hypot(pos.x - b.pos.x, pos.z - b.pos.z) < 12 && Math.abs(pos.y - b.pos.y) < 3) { mk = b.pos; label = 'Payroll'; }
    this._mk ||= new THREE.Vector3();
    this._mk.set(mk.x, mk.y + 1.4, mk.z);
    s.game.hud.setMarker(this._mk, s.camera, label, label === 'Payroll' ? 'var(--safe)' : 'var(--amber)', Math.hypot(mk.x - pos.x, mk.z - pos.z));
  }

  _complete() {
    if (this.done) return;
    this.done = true;
    const s = this.state;
    s.setAction(null);
    s.game.hud.setMeter(0, '');
    audio.sfx(this.stage === 'mail' ? 'vault' : 'win');
    finishPart(s, this);
  }

  adminSkip() {
    this._complete();
  }

  teardown() {
    this._closeMini();
    this.state.setAction?.(null);
    this.guards?.dispose();
    this.mailGuard?.dispose();
    this.heli?.dispose();
    this.heli = null;
  }
}

import * as THREE from 'three';
import { buildChapter23Shaft, OBSTACLES, CABLES, CHECKPOINTS, HALF, BOTTOM, R, LEVEL_Y } from '../../world/levels/chapter23Shaft.js';
import { CHAPTERS } from '../../story/chapters.js';
import { getChapterRun } from '../../story/chapterRun.js';
import { finishPart } from '../../story/chapterFlow.js';
import { makeGlowMaterial } from '../../world/materials.js';
import { admin } from '../../core/admin.js';
import { diff } from '../../core/difficulty.js';
import { formatTime, clamp, damp } from '../../core/utils.js';
import { noteCaught } from '../../core/jail.js';
import { audio } from '../../core/audio.js';

// Chapter 23, Part 3: THE SHAFT (part id 'shaft').
//
// Abseil 160 m down the old ventilation shaft. The rope pays out by itself
// (slowly); hold Jump to slide down fast, Crouch to stop. WASD (the stick)
// moves you round the shaft. The camera looks down past your feet.
//   - Beams, broken planks and the grating are solid: you stop on them
//     (hit one going fast and it hurts). Move to the open part to go on.
//   - The fan: its blades knock you about. Wait above it, then drop through
//     a gap, fast.
//   - Live cables: keep clear of them.
//   - Loose rock: stones fall where you are (a red ring warns you): move.
//   - Level 7: now and then a Jackal holds his lantern into the shaft. Don't
//     be level with the opening while he's looking.
//   - The bottom: slow down, or it's a hard landing.
// Three bumps and you're back at the last checkpoint.

const DOWN = 2.6, FAST = 9, MOVE = 2.8, HP = 3;
const SOLID = new Set(['beam', 'planks', 'grate']);
const LIM = HALF - R - 0.05;
const BLADE = { r0: 0.4, r1: 4.0, half: 0.55 };
const GUARD_AWAY = 3.4, GUARD_LOOK = 3.6;
const ROCK_EVERY = 2.0, ROCK_WARN = 1.1;
const _v = new THREE.Vector3();

/** Does an obstacle's footprint (seen from above) cover a circle of radius R at (x, z)? (t: time, for the fan) */
function blocks(ob, x, z, fanAngle) {
  if (ob.kind === 'beam') return ob.axis === 'x' ? Math.abs(z - ob.at) < 0.28 + R : Math.abs(x - ob.at) < 0.28 + R;
  if (ob.kind === 'planks') {
    const c = ob.cover;
    return x > c.x0 - R && x < c.x1 + R && z > c.z0 - R && z < c.z1 + R;
  }
  if (ob.kind === 'grate') return !(x > ob.hole.x0 + R * 0.6 && z > ob.hole.z0 + R * 0.6);
  if (ob.kind === 'hub') return Math.hypot(x, z) < 0.5 + R;
  if (ob.kind === 'fan') {
    for (let i = 0; i < 4; i++) {
      const a = fanAngle + i * Math.PI / 2, dx = Math.sin(a), dz = Math.cos(a);
      const s = x * dx + z * dz;
      if (s < BLADE.r0 - R || s > BLADE.r1) continue;
      if (Math.abs(x * dz - z * dx) < BLADE.half + R) return true;
    }
    return Math.hypot(x, z) < 0.5 + R;
  }
  return false;
}

export class ShaftMode {
  constructor(state, params) {
    this.state = state;
    this.chapter = CHAPTERS[params.chapterId || 'chapter23'];
    this.partIndex = params.part ?? 2;
    this.part = this.chapter.parts[this.partIndex];
    this.hudSections = ['tl', 'meter', 'controls', 'marker'];
    this.weather = 'clear';
    this.weatherForced = true;
    this.time = this.part.time || 'night';
    this.indoors = true;
  }

  get inputLocked() { return true; }
  get fallY() { return -400; }

  build() {
    const L = buildChapter23Shaft();
    this.level = L;
    // the rope, your head torch
    this.rope = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 5), new THREE.MeshLambertMaterial({ color: 0xd8c8a0 }));
    L.group.add(this.rope);
    this.torch = new THREE.SpotLight(0xfff2d8, 60, 30, 0.75, 0.5, 1.2);
    this.spill = new THREE.PointLight(0xffe0b0, 6, 7, 1.6);
    L.group.add(this.torch, this.torch.target, this.spill);
    // falling stones, and the red ring that warns you where
    this.rocks = [];
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.35, 0), new THREE.MeshLambertMaterial({ color: 0x7a5a44, flatShading: true }));
      const warn = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.8, 24), makeGlowMaterial(0xff4030, 0.7));
      warn.rotation.x = -Math.PI / 2;
      m.visible = warn.visible = false;
      L.group.add(m, warn);
      this.rocks.push({ m, warn, on: false, x: 0, z: 0, t: 0 });
    }
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    return L;
  }

  start(first) {
    const s = this.state;
    if (!this._setup) {
      this.wasFirstPerson = s.cam.firstPerson;
      if (this.wasFirstPerson) s.setFirstPerson(false);
      this._setup = true;
    }
    s.lighting.dark = 0.6;
    s.model.flying = 'rope';
    this.run = getChapterRun(s.game, this.chapter.id);
    this.done = false;
    this.cp = 0;
    this.told = {};
    this.t = 0;
    this._placeAt(0);
    const hud = s.game.hud;
    if (first) hud.showControls(`<kbd>WASD</kbd> move round the shaft &nbsp; hold <kbd>Space</kbd>: slide down fast &nbsp; hold <kbd>C</kbd>: stop<br>
      Drop through the fan's gaps fast &nbsp; slow down before the bottom &nbsp; <kbd>R</kbd> checkpoint &nbsp; <kbd>P</kbd> pause`);
    hud.setPhase(`${this.chapter.title} · Part ${this.partIndex + 1}: ${this.part.title}`);
    hud.setObjective(this.part.objective);
    if (first && !s.game.speedrun) s.showStoryCards(this.part.intro, this.part.startLabel || 'Go');
  }

  _placeAt(cp) {
    this.pos.set(0, CHECKPOINTS[cp].y, 0);
    this.vel.set(0, 0, 0);
    this.vDown = 0;
    this.hp = HP;
    this.stun = 0;
    this.spotted = 0;
    this.guardT = 0;
    this.rockT = 1.4;
    for (const r of this.rocks) { r.on = false; r.m.visible = r.warn.visible = false; }
  }

  _fail(title, msg, police = false) {
    if (admin.flag('god')) { this.hp = HP; this.spotted = 0; return; }
    if (police && noteCaught(this.state)) return;
    this.run.caught++;
    audio.sfx('caught');
    this._placeAt(this.cp);
    this.state.flash(title, msg, 'var(--red)');
  }

  onRespawnKey() {
    this._placeAt(this.cp);
    this.state.flash('Checkpoint', 'Back to the last checkpoint.', 'var(--cyan)');
  }

  audioMix() {
    return { wind: 0.12 + Math.min(1, this.vDown / FAST) * 0.4, city: 0, engine: 0, siren: 0, music: 0.35, intensity: 0.3 + this.spotted * 0.6 + (this.hp < HP ? 0.15 : 0) };
  }

  _tell(key, title, text, color = 'var(--amber)', t = 4) {
    if (this.told[key]) return;
    this.told[key] = true;
    this.state.game.hud.toast(title, text, color, t);
  }

  /** A bump: lose one of your three; you bounce and can't move for a moment. */
  _hit(title, text) {
    if (admin.flag('god')) return;
    this.hp--;
    this.stun = 0.7;
    this.vDown = 0;
    audio.sfx('land', { vol: 1 });
    this.state.cam.addLandingDip?.(5);
    if (this.hp <= 0) { this._fail('Too many bumps', `${text} Back to the last checkpoint.`); return true; }
    this.state.game.hud.toast(title, text, 'var(--red)', 2.5);
    return false;
  }

  update(dt) {
    if (this.done) return;
    const s = this.state, L = this.level, input = s.game.input, hud = s.game.hud, pos = this.pos;
    this.t += dt;
    const fanAngle = this.t * OBSTACLES.find((o) => o.kind === 'fan').speed;
    L.fanGroup.rotation.y = fanAngle;

    // --- Move round the shaft (the camera looks down from above: W = away from it)
    if (this.stun > 0) this.stun -= dt;
    const mx = this.stun > 0 ? 0 : input.axis('left', 'right'), mz = this.stun > 0 ? 0 : -input.axis('back', 'forward');
    this.vel.x = damp(this.vel.x, mx * MOVE, 6, dt);
    this.vel.z = damp(this.vel.z, mz * MOVE, 6, dt);
    const nx = clamp(pos.x + this.vel.x * dt, -LIM, LIM), nz = clamp(pos.z + this.vel.z * dt, -LIM, LIM);
    // (you can't move sideways into something you're level with)
    const level = (ob) => ob.y + 0.3 > pos.y && ob.y - 0.3 < pos.y + 1.8;
    const sideBlocked = OBSTACLES.some((ob) => SOLID.has(ob.kind) && level(ob) && blocks(ob, nx, nz) && !blocks(ob, pos.x, pos.z));
    if (!sideBlocked) { pos.x = nx; pos.z = nz; } else this.vel.set(0, 0, 0);

    // --- Down the rope
    const fast = input.isDown('jump'), brake = input.isDown('crouch');
    const want = this.stun > 0 || brake ? 0 : fast ? FAST : DOWN;
    this.vDown = damp(this.vDown, want, brake ? 7 : 3, dt);
    const prevY = pos.y;
    pos.y -= this.vDown * dt;

    // --- Solid things: you stop on top of them (and going fast, it hurts)
    for (const ob of OBSTACLES) {
      if (!SOLID.has(ob.kind)) continue;
      const top = ob.y + 0.25;
      if (prevY >= top && pos.y < top && blocks(ob, pos.x, pos.z)) {
        pos.y = top;
        if (this.vDown > 5.5) { if (this._hit('Ouch!', ob.kind === 'grate' ? 'Straight onto the grating. Slow down (C) and find the hole in the corner.' : 'You hit it hard. Slow down near the beams and planks, and move to the open side.')) return; }
        this.vDown = 0;
        this._tell(`on${ob.y}`, ob.kind === 'grate' ? 'A grating' : 'In the way', ob.kind === 'grate' ? 'Kitsu: "There\'s a hole in one corner."' : 'Move round it (WASD) to the open part of the shaft.', 'var(--amber)', 2.5);
      }
    }
    // the fan's hub is solid too; its blades knock you about
    const fan = OBSTACLES.find((o) => o.kind === 'fan');
    if (prevY >= fan.y + 0.3 && pos.y < fan.y + 0.3 && Math.hypot(pos.x, pos.z) < 0.5 + R) { pos.y = fan.y + 0.3; this.vDown = 0; }
    if (level(fan) && blocks(fan, pos.x, pos.z, fanAngle)) {
      pos.y = fan.y + 0.35;
      if (this._hit('The fan!', 'A blade knocked you about. Wait above the fan (C), then drop through a gap fast (Space).')) return;
    }
    // live cables
    const cab = OBSTACLES.find((o) => o.kind === 'cables');
    if (pos.y + 1.8 > cab.y1 && pos.y < cab.y) {
      this._tell('cables', 'Live cables', 'Kitsu: "Don\'t touch the cables! They\'re sparking."', 'var(--amber)', 3);
      CABLES.forEach(([cx, cz], i) => {
        const sx = cx + Math.sin(this.t * 0.9 + i * 1.7) * 0.4, sz = cz + Math.cos(this.t * 0.7 + i) * 0.3;
        if (Math.hypot(pos.x - sx, pos.z - sz) < 0.45 + R * 0.6 && this.stun <= 0) {
          const dx = pos.x - sx, dz = pos.z - sz, d = Math.hypot(dx, dz) || 1;
          pos.x = clamp(pos.x + (dx / d) * 0.8, -LIM, LIM); pos.z = clamp(pos.z + (dz / d) * 0.8, -LIM, LIM);
          audio.sfx('flick', { vol: 0.9, rate: 2.2 });
          if (this._hit('ZAP!', 'A live cable. Keep clear of them.')) return;
        }
      });
    }
    L.cableMeshes.forEach((c, i) => {
      const sx = c.x + Math.sin(this.t * 0.9 + i * 1.7) * 0.4, sz = c.z + Math.cos(this.t * 0.7 + i) * 0.3;
      c.m.position.x = sx; c.m.position.z = sz;
      const sp = L.sparks[i];
      sp.visible = Math.random() < 0.5;
      sp.position.set(sx, clamp(pos.y + 0.5 + (Math.random() - 0.5) * 3, cab.y1, cab.y), sz);
    });

    // --- Loose rock
    const rk = OBSTACLES.find((o) => o.kind === 'rocks');
    const inRocks = pos.y < rk.y + 2 && pos.y > rk.y1;
    if (inRocks) {
      this._tell('rocks', 'Loose rock!', 'Stones are falling. When a red ring shows where one will land, move!', 'var(--amber)', 3);
      this.rockT -= dt;
      if (this.rockT <= 0) {
        this.rockT = ROCK_EVERY * (0.8 + Math.random() * 0.4);
        const r = this.rocks.find((q) => !q.on);
        if (r) { r.on = true; r.t = 0; r.x = pos.x; r.z = pos.z; audio.sfx('step', { vol: 0.5, rate: 0.6 }); }
      }
    }
    for (const r of this.rocks) {
      if (!r.on) continue;
      r.t += dt;
      const k = r.t / ROCK_WARN;
      r.m.visible = true;
      r.m.position.set(r.x, pos.y + 1.8 + (1 - k) * 14, r.z);
      r.m.rotation.x += dt * 5;
      r.warn.visible = k < 1;
      r.warn.position.set(r.x, pos.y + 0.05, r.z);
      if (k >= 1 && !r.hitDone) {
        r.hitDone = true;
        if (Math.hypot(pos.x - r.x, pos.z - r.z) < 0.85) { if (this._hit('Rock!', 'A falling stone hit you. Move away from the red rings.')) return; }
      }
      if (k > 1.4) { r.on = false; r.hitDone = false; r.m.visible = r.warn.visible = false; }
    }

    // --- The Jackal at level 7
    const gy = LEVEL_Y(7);
    this.guardT += dt;
    const cycle = GUARD_AWAY + GUARD_LOOK, gt = this.guardT % cycle, looking = gt > GUARD_AWAY;
    L.guardLamp.visible = L.guardCone.visible = looking;
    const nearOpening = pos.y < gy + 1.2 && pos.y + 1.8 > gy - 4;
    if (pos.y < gy + 22 && pos.y > gy) this._tell('guard', 'Level 7', 'Kitsu: "A Jackal keeps looking into the shaft at level 7. Wait above until his light goes away, then drop past, fast."', 'var(--amber)', 4.5);
    const seen = looking && nearOpening && !admin.flag('unseen');
    this.spotted = clamp(this.spotted + (seen ? (dt / 0.5) * diff().fill : -dt * 0.8), 0, 1);
    if (this.spotted >= 1) { this._fail('Seen!', 'The Jackal at level 7 saw you in his lantern light. Wait above until his light goes, then slide past fast (Space).', true); return; }

    // --- Checkpoints, the bottom
    for (let i = this.cp + 1; i < CHECKPOINTS.length; i++) {
      if (pos.y < CHECKPOINTS[i].y) { this.cp = i; audio.sfx('checkpoint', { vol: 0.5 }); hud.toast('Checkpoint', CHECKPOINTS[i].name, 'var(--cyan)', 2); }
    }
    if (pos.y <= BOTTOM) {
      pos.y = BOTTOM;
      if (prevY > BOTTOM && this.vDown > 4.5) {
        pos.y = BOTTOM + 1.2;
        if (this._hit('Hard landing!', 'Slow down (C) before the bottom!')) return;
      } else { this._finish(); return; }
    }
    if (pos.y < BOTTOM + 25) this._tell('bottom', 'Nearly there', 'Kitsu: "Slow down! The bottom\'s coming up!"', 'var(--amber)', 2.5);

    // --- You, the rope, your torch
    s.player.teleport(pos.x, pos.y, pos.z, 0);
    const hy = pos.y + 2.05, top = 12.5;
    this.rope.position.set(pos.x / 2, (hy + top) / 2, pos.z / 2);
    this.rope.scale.y = top - hy;
    this.rope.rotation.set(Math.atan2(pos.z, top - hy) * -1, 0, Math.atan2(pos.x, top - hy));
    this.torch.position.set(pos.x, pos.y + 1.7, pos.z);
    this.torch.target.position.set(pos.x * 0.5, pos.y - 8, pos.z * 0.5);
    this.spill.position.set(pos.x, pos.y + 1.2, pos.z);
    L.ring.rotation.z += dt;

    // --- The meter
    const depth = Math.round(-pos.y);
    if (this.spotted > 0.02) hud.setMeter(this.spotted, 'THE JACKAL CAN SEE YOU!', 'var(--red)');
    else if (looking && pos.y < gy + 14 && pos.y > gy - 3) hud.setMeter(1, 'A lantern at level 7: wait!', 'var(--amber)');
    else if (Math.abs(pos.y - fan.y) < 10 && pos.y > fan.y) hud.setMeter(0.5 + Math.sin(fanAngle * 4) * 0.5, 'The fan: drop through a gap, fast', 'var(--amber)');
    else hud.setMeter(-pos.y / -BOTTOM, `Depth ${depth} m`, 'var(--cyan)');
    hud.setMarker(_v.set(0, BOTTOM + 1, 0), s.camera, 'Level 9', 'var(--safe)', pos.y - BOTTOM);
    hud.setStats(`<span>Depth <b>${depth} m</b></span><span>Speed <b>${this.vDown.toFixed(1)} m/s</b></span>` +
      `<span${this.hp < HP ? ' class="warn"' : ''}>Bumps left <b>${'●'.repeat(Math.max(0, this.hp))}${'○'.repeat(HP - Math.max(0, this.hp))}</b></span>` +
      `<span>Time <b>${formatTime(s.time)}</b></span><span${this.run.caught ? ' class="warn"' : ''}>Caught <b>${this.run.caught}</b></span>`);
  }

  /** The camera hangs above you, looking down the shaft past your feet. */
  cameraUpdate(dt, camera) {
    const p = this.pos;
    camera.position.set(p.x * 0.35, p.y + 6.2, p.z * 0.35 + 1.7);
    camera.lookAt(p.x, p.y - 4.5, p.z);
  }

  _finish() {
    if (this.done) return;
    this.done = true;
    const s = this.state;
    s.game.hud.setMeter(0, '');
    audio.sfx('win');
    finishPart(s, this);
  }

  adminSkip() { this._finish(); }

  teardown() {
    const s = this.state;
    if (s.lighting) s.lighting.dark = 0;
    if (s.model) s.model.flying = null;
    if (this.wasFirstPerson) s.setFirstPerson?.(true);
  }
}

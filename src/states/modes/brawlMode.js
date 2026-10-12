import * as THREE from 'three';
import { buildChapter24Turbines, HALL, TURBINES, TURBINE_R, VENT_R, DOORS, CAGE } from '../../world/levels/chapter24Turbines.js';
import { Brawlers, Hearts } from '../../ai/brawlers.js';
import { PlayerModel } from '../../player/playerModel.js';
import { crewLook, JACKAL_LOOK } from '../../player/people.js';
import { CHAPTERS } from '../../story/chapters.js';
import { getChapterRun } from '../../story/chapterRun.js';
import { finishPart } from '../../story/chapterFlow.js';
import { admin } from '../../core/admin.js';
import { diff } from '../../core/difficulty.js';
import { formatTime, clamp } from '../../core/utils.js';
import { audio } from '../../core/audio.js';

// Chapter 24, Part 4: THE POWER HOUSE (part id 'turbines').
//
// Ricky is in a cage at the far end of the dam's turbine hall, and the
// Jackals come at you in waves through the side doors. A fight:
//   - They walk up and swing. A red "!" over a Jackal's head: he's about to
//     punch. Step back out of reach, or hit him first (a punch stops it).
//   - Three quick punches end in an UPPERCUT (it hits twice as hard).
//   - THE STEAM VENTS: every few seconds a grate in the floor glows orange,
//     hisses, and blows a column of steam. It knocks you back, and it
//     knocks a Jackal flat: lure them over the grates.
//   - The second wave brings the Big Jackal: slow, but he hits twice as hard.
// Out of hearts: that wave again. When they're all down, break the lock on
// the cage (hold E).

const WAVES = [
  { title: 'Wave 1', jackals: 3 },
  { title: 'Wave 2', jackals: 3, big: true },
];
const VENT_EVERY = 6.5, VENT_WARN = 1.2, VENT_BLOW = 1.3;
const LOCK_TIME = 1.8;
const _v = new THREE.Vector3();

export class BrawlMode {
  constructor(state, params) {
    this.state = state;
    this.chapter = CHAPTERS[params.chapterId || 'chapter24'];
    this.partIndex = params.part ?? 3;
    this.part = this.chapter.parts[this.partIndex];
    this.hudSections = ['tl', 'meter', 'controls', 'marker'];
    this.weather = 'clear';
    this.weatherForced = true;
    this.time = this.part.time || 'night';
    this.indoors = true;
  }

  get fallY() { return -10; }

  build() {
    const L = buildChapter24Turbines();
    this.level = L;
    this.brawlers = new Brawlers(L.group, { x0: HALL.x0 + 0.6, x1: CAGE.x - 2, z0: HALL.z0 + 0.6, z1: HALL.z1 - 0.6 }, { circles: TURBINES.map(([x, z]) => [x, z, TURBINE_R]) });
    // Ricky, in the cage
    this.ricky = new PlayerModel(crewLook('ricky'), { bag: false, style: crewLook('ricky').style });
    this.rickyBody = { pos: new THREE.Vector3(CAGE.x + 0.2, 0, CAGE.z), vel: new THREE.Vector3(), facing: -Math.PI / 2, state: 'ground', horizontalSpeed: 0, mantleProgress: 0, stateTime: 0, stumbleTimer: 0, mantle: null, wallRun: null };
    L.group.add(this.ricky.root);
    return L;
  }

  start(first) {
    const s = this.state;
    this.run = getChapterRun(s.game, this.chapter.id);
    this.done = false;
    this.t = 0;
    this.told = {};
    this.hearts = new Hearts(s, diff().id === 'easy' ? 7 : diff().id === 'hard' ? 4 : 5);
    this.freed = false;
    this.lockT = 0;
    this.level.lock.visible = true;
    this.rickyBody.pos.set(CAGE.x + 0.2, 0, CAGE.z);
    this.rickyBody.facing = -Math.PI / 2;
    this._startWave(0);
    const hud = s.game.hud;
    if (first) hud.showControls(`<kbd>WASD</kbd> move &nbsp; <kbd>Click</kbd> / <kbd>B</kbd> punch (three quick ones: the third is an UPPERCUT)<br>Red <b>!</b>: step back &nbsp; orange grate: steam's coming (lure them onto it) &nbsp; <kbd>P</kbd> pause`);
    hud.setPhase(`${this.chapter.title} · Part ${this.partIndex + 1}: ${this.part.title}`);
    hud.setObjective(this.part.objective);
    if (first && !s.game.speedrun) s.showStoryCards(this.part.intro, this.part.startLabel || 'Fight');
  }

  _startWave(i) {
    const s = this.state, W = WAVES[i];
    this.wave = i;
    this.between = 0;
    this.hearts.reset();
    this.brawlers.clear();
    s.placePlayer(this.level.spawn, this.level.spawn.yaw);
    const doors = DOORS.slice().sort(() => Math.random() - 0.5);
    for (let k = 0; k < W.jackals; k++) {
      const [x, z] = doors[k % doors.length];
      this.brawlers.add(x + (k >= doors.length ? 1.2 : 0), z - Math.sign(z) * 1.2, { look: JACKAL_LOOK, hp: 3, speed: 2.5 + Math.random() * 0.4 });
    }
    if (W.big) {
      const u = this.brawlers.add(14, 0, { look: { ...JACKAL_LOOK, hoodie: 0x6a1a16 }, hp: 7, speed: 2.0, reach: 2.0, damage: 2, windup: 0.95, recover: 1.2, style: { build: 1.35, beard: 'full' } });
      u.big = true;
    }
    for (const u of this.brawlers.units) u.cd += 1.2; // (a moment to get ready)
    this.ventT = 0;
  }

  _hurt(dmg, x, z) {
    if (admin.flag('god') || this.done) return;
    if (!this.hearts.hurt(dmg, x, z)) return;
    this.run.caught++;
    audio.sfx('caught');
    const i = this.wave;
    this._startWave(i);
    this.state.flash('Knocked down', i === 0 ? 'Step back when you see the red !, then hit them while they get their breath back. And lure them onto the steam vents.' : 'This wave again. Keep away from the Big Jackal\'s fists: let the steam do the work.', 'var(--red)');
  }

  audioMix() {
    return { wind: 0.04, city: 0, engine: 0.12, siren: 0, music: 0.45, intensity: this.freed ? 0.4 : 0.8 };
  }

  onRespawnKey() {
    this.state.game.hud.toast('No way out', 'Ricky\'s at the end of the hall, and the Jackals are between you.', 'var(--amber)', 2.5);
  }

  _tell(key, title, text, color = 'var(--amber)', t = 4) {
    if (this.told[key]) return;
    this.told[key] = true;
    this.state.game.hud.toast(title, text, color, t);
  }

  onPunch({ inFront, heavy, fx, fz, hit }) {
    if (this.done) return false;
    const r = this.brawlers.punch({ inFront, heavy, fx, fz });
    if (!r) return false;
    hit(heavy || r === 'ko');
    if (r === 'ko') {
      audio.sfx('uppercut', { vol: 0.6 });
      this._tell('ko', 'Out cold!', 'One down.', 'var(--amber)', 1.8);
    }
    return true;
  }

  update(dt) {
    if (this.done) return;
    const s = this.state, p = s.player, pos = p.pos, hud = s.game.hud, input = s.game.input, L = this.level;
    this.t += dt;
    this.hearts.update(dt);
    for (const sh of L.shafts) sh.rotation.y += dt * 2.2;

    // a soft lock-on: a punch turns you to the nearest Jackal
    if (input.wasPressed('punch')) {
      let best = null, bd = 3.4;
      for (const u of this.brawlers.units) { if (u.st === 'down') continue; const d = Math.hypot(u.body.pos.x - pos.x, u.body.pos.z - pos.z); if (d < bd) { bd = d; best = u.body.pos; } }
      if (best) p.facing = Math.atan2(best.x - pos.x, best.z - pos.z);
    }

    this.brawlers.update(dt, p, (dmg, x, z) => this._hurt(dmg, x, z));
    if (this.brawlers.units.some((u) => u.st === 'windup')) this._tell('bang', 'Red !', 'He\'s about to swing: step back out of reach, then hit him while he recovers.', 'var(--red)', 3.5);
    this._vents(dt);

    // --- the waves
    if (!this.freed && this.brawlers.alive === 0) {
      if (this.wave < WAVES.length - 1) {
        this.between += dt;
        if (this.between > 0.05 && this.between - dt <= 0.05) hud.toast('Wave cleared', 'Ricky, from the cage: "Behind you! More of them!"', 'var(--safe)', 2.5);
        if (this.between > 2.2) {
          const keep = this.hearts.n;
          this.wave++;
          this.brawlers.clear();
          const W = WAVES[this.wave];
          const doors = DOORS.slice().sort(() => Math.random() - 0.5);
          for (let k = 0; k < W.jackals; k++) { const [x, z] = doors[k % doors.length]; this.brawlers.add(x, z - Math.sign(z) * 1.2, { look: JACKAL_LOOK, hp: 3, speed: 2.5 + Math.random() * 0.4 }); }
          const u = this.brawlers.add(14, 0, { look: { ...JACKAL_LOOK, hoodie: 0x6a1a16 }, hp: 7, speed: 2.0, reach: 2.0, damage: 2, windup: 0.95, recover: 1.2, style: { build: 1.35, beard: 'full' } });
          u.big = true;
          for (const b of this.brawlers.units) b.cd += 1;
          this.hearts.n = Math.min(this.hearts.max, keep + 2); // (a breather: two hearts back)
          audio.sfx('alarm', { vol: 0.4 });
          hud.toast('The Big Jackal', 'Slow, but he hits twice as hard. Don\'t trade punches: lure him onto the steam vents.', 'var(--red)', 4.5);
        }
      } else {
        // all down: the cage
        const d = Math.hypot(pos.x - (CAGE.x - 1.9), pos.z - CAGE.z);
        this._tell('cage', 'All down!', 'Break the lock on Ricky\'s cage (hold E).', 'var(--safe)', 3);
        if (d < 1.8) {
          s.setAction('Break the lock (hold)');
          if (input.isDown('interact')) {
            this.lockT += dt;
            if (Math.floor(this.lockT * 3) !== Math.floor((this.lockT - dt) * 3)) audio.sfx('clang', { vol: 0.6 });
            if (this.lockT >= LOCK_TIME) this._free();
          } else this.lockT = Math.max(0, this.lockT - dt);
        } else { s.setAction(null); this.lockT = Math.max(0, this.lockT - dt); }
      }
    } else s.setAction(null);

    // Ricky
    if (this.freed) {
      this.freeT += dt;
      const b = this.rickyBody;
      const tx = CAGE.x - 2.4;
      b.horizontalSpeed = b.pos.x > tx ? 2 : 0;
      b.pos.x = Math.max(tx, b.pos.x - dt * 2);
      b.facing = -Math.PI / 2;
      if (this.freeT > 2.2) { this._finish(); return; }
    } else {
      // he rattles the bars
      this.rickyBody.horizontalSpeed = 0;
      this.rickyBody.facing = Math.atan2(pos.x - this.rickyBody.pos.x, pos.z - this.rickyBody.pos.z);
    }
    this.ricky.update(dt, this.rickyBody);
    this._hud();
  }

  _vents(dt) {
    const s = this.state, p = s.player, L = this.level;
    this.ventT += dt;
    L.vents.forEach((v, i) => {
      // each vent has its turn: warn (glows, hisses), then BLOWS
      const t = (this.ventT + i * (VENT_EVERY / L.vents.length) * 2.3) % VENT_EVERY;
      const warn = t > VENT_EVERY - VENT_BLOW - VENT_WARN && t < VENT_EVERY - VENT_BLOW;
      const blow = t >= VENT_EVERY - VENT_BLOW;
      v.glow.material.opacity = warn ? 0.4 + 0.4 * Math.sin(this.t * 20) : blow ? 0.6 : 0;
      if (warn && !v.hissed) { v.hissed = true; if (Math.hypot(v.x - p.pos.x, v.z - p.pos.z) < 14) audio.sfx('whoosh', { vol: 0.25, rate: 1.8 }); }
      if (!warn && !blow) v.hissed = false;
      v.plume.visible = blow;
      if (blow && !v.blowing) { v.burst = (v.burst || 0) + 1; audio.sfx('whoosh', { vol: 0.7, rate: 0.6 }); }
      v.blowing = blow;
      const k = blow ? Math.min(1, (t - (VENT_EVERY - VENT_BLOW)) / 0.2) * (1 - Math.max(0, (t - VENT_EVERY + 0.25) / 0.25)) : 0;
      v.plume.scale.set(1, Math.max(0.01, k * 6), 1);
      v.plume.material.opacity = 0.45 * k;
      v.puffs.forEach((sp, j) => {
        sp.visible = blow || warn;
        const ph = (this.t * (blow ? 1.6 : 0.5) + j / v.puffs.length) % 1;
        sp.position.set(v.x + Math.sin(j * 2.1 + this.t) * 0.3, (blow ? 6.5 : 1.2) * ph + 0.2, v.z + Math.cos(j * 1.7 + this.t) * 0.3);
        sp.scale.setScalar((blow ? 2.2 : 0.7) * (0.5 + ph));
        sp.material.opacity = (blow ? 0.55 : 0.3) * (1 - ph);
      });
      if (!blow || k < 0.6) return;
      // anyone on the grate
      if (Math.hypot(p.pos.x - v.x, p.pos.z - v.z) < VENT_R + 0.25 && p.pos.y < 1.5) {
        this._hurt(1, v.x, v.z);
        this._tell('steam', 'Ow! Steam!', 'When a grate glows orange, get off it. And get the Jackals onto it instead.', 'var(--red)', 3);
      }
      for (const u of this.brawlers.units) {
        const key = i * 1000 + v.burst;
        if (u.st === 'down' || u.steamed === key) continue;
        if (Math.hypot(u.body.pos.x - v.x, u.body.pos.z - v.z) < VENT_R + 0.3) {
          u.steamed = key;
          u.hp -= u.big ? 4 : 3;
          if (u.hp <= 0) { u.st = 'down'; u.mark.visible = false; u.model.knockDown({ upIn: Infinity }); s.game.hud.toast('Steamed!', u.big ? 'The Big Jackal goes down in a cloud of steam!' : 'Knocked flat by the steam.', 'var(--safe)', 2.5); }
          else { u.st = 'stagger'; u.t = 0; u.knock.set(0, 0, 0); u.model.hit(0.5); s.game.hud.toast('Steamed!', 'Again! He can\'t take much more.', 'var(--safe)', 2); }
          audio.sfx('uppercut', { vol: 0.6 });
        }
      }
    });
  }

  _free() {
    const s = this.state;
    this.freed = true;
    this.freeT = 0;
    this.level.lock.visible = false;
    s.setAction(null);
    audio.sfx('clang', { vol: 1 });
    audio.sfx('checkpoint', { vol: 0.7 });
    s.game.hud.toast('Ricky!', '"Took your time!" He grins, and rubs his wrists. "Where\'s Sable?"', 'var(--safe)', 3);
  }

  _hud() {
    const s = this.state, hud = s.game.hud, pos = s.player.pos;
    const left = this.brawlers.alive;
    const W = WAVES[this.wave];
    hud.setStats(`${this.hearts.html}<span>${W.title} of ${WAVES.length}</span><span>Jackals left <b>${left}</b></span>` +
      `<span>Time <b>${formatTime(s.time)}</b></span><span${this.run.caught ? ' class="warn"' : ''}>Knocked down <b>${this.run.caught}</b></span>`);
    if (this.lockT > 0 && !this.freed) hud.setMeter(this.lockT / LOCK_TIME, 'Breaking the lock...', 'var(--amber)');
    else if (this.brawlers.units.some((u) => u.st === 'windup' && Math.hypot(u.body.pos.x - pos.x, u.body.pos.z - pos.z) < 3)) hud.setMeter(1, 'He\'s going to swing: STEP BACK!', 'var(--red)');
    else hud.setMeter(0, '');
    if (left === 0 && this.wave === WAVES.length - 1 && !this.freed) hud.setMarker(_v.set(CAGE.x - 1.4, 2.2, CAGE.z), s.camera, 'Ricky', 'var(--safe)', Math.hypot(CAGE.x - pos.x, CAGE.z - pos.z));
    else if (left > 0) {
      let best = null, bd = Infinity;
      for (const u of this.brawlers.units) { if (u.st === 'down') continue; const d = Math.hypot(u.body.pos.x - pos.x, u.body.pos.z - pos.z); if (d < bd) { bd = d; best = u; } }
      if (best && bd > 6) hud.setMarker(_v.set(best.body.pos.x, 2.4, best.body.pos.z), s.camera, 'Jackal', '#ff5a4a', bd); else hud.setMarker(null);
    } else hud.setMarker(null);
  }

  _finish() {
    if (this.done) return;
    this.done = true;
    const s = this.state;
    s.setAction(null);
    s.game.hud.setMeter(0, '');
    s.game.hud.setMarker(null);
    audio.sfx('win');
    finishPart(s, this);
  }

  adminSkip() { this._finish(); }

  teardown() {}
}

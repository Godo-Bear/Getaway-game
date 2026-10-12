import * as THREE from 'three';
import { buildChapter24Crest, ARENA, CRATES, CRATE_HALF } from '../../world/levels/chapter24Crest.js';
import { Brawlers, Hearts } from '../../ai/brawlers.js';
import { PlayerModel } from '../../player/playerModel.js';
import { crewLook, JACKAL_LOOK } from '../../player/people.js';
import { CHAPTERS } from '../../story/chapters.js';
import { getChapterRun } from '../../story/chapterRun.js';
import { finishPart } from '../../story/chapterFlow.js';
import { makeGlowMaterial, getGlowTexture } from '../../world/materials.js';
import { admin } from '../../core/admin.js';
import { diff } from '../../core/difficulty.js';
import { formatTime, clamp } from '../../core/utils.js';
import { audio } from '../../core/audio.js';
import { rumble } from '../../core/haptics.js';

// Chapter 24, Part 5: SABLE (part id 'sable'). The final boss.
//
// The top of the Coyote Dam, at midnight, in a storm. Sable fights you
// herself. Watch her, and answer:
//   - THE COMBO: she raises her fists (a red "!") and throws three punches.
//     Step back out of reach, then hit her while she gets her breath back.
//   - THE CHARGE: she lowers her head and a red line shows where she's
//     going. Get out of the line. If she runs into a crate or the railings,
//     she's DIZZY for a moment: hit her as hard as you can.
//   - Her guard: from the front she blocks jabs. The uppercut (the third
//     punch of a quick combo) breaks through; so does hitting her from
//     behind.
//   - At 60% she calls her Jackals (punch them out); at 30% she starts
//     throwing DYNAMITE (red rings on the ground: get out of them. The blast
//     knocks over anyone in it, Sable and the Jackals too).
// Out of hearts: you start that round again (her health goes back to where
// the round began).

const SWINGS = [0.72, 1.0, 1.28];   // s into the combo when each punch lands
const COMBO_END = 1.55, OPEN = 1.5; // ... and how long she's open after it
const AIM = 1.05, CHARGE_SPEED = 15, CHARGE_LEN = 17, DIZZY = 2.8;
const FUSE = 1.7, BLAST_R = 2.7;
const _v = new THREE.Vector3();

function starSprite() {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0xffe040, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    s.scale.setScalar(0.32);
    g.add(s);
  }
  g.position.y = 2.15;
  g.visible = false;
  return g;
}

export class BossMode {
  constructor(state, params) {
    this.state = state;
    this.chapter = CHAPTERS[params.chapterId || 'chapter24'];
    this.partIndex = params.part ?? 4;
    this.part = this.chapter.parts[this.partIndex];
    this.hudSections = ['tl', 'meter', 'controls', 'marker'];
    this.weather = this.part.weather || 'storm';
    this.weatherForced = true;
    this.time = this.part.time || 'night';
  }

  get fallY() { return -10; }

  build() {
    const L = buildChapter24Crest();
    this.level = L;
    // Sable
    const model = new PlayerModel(crewLook('sable'), { bag: false, style: crewLook('sable').style });
    L.group.add(model.root);
    this.stars = starSprite();
    model.root.add(this.stars);
    this.mark = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._markTex(), transparent: true, depthWrite: false, fog: false }));
    this.mark.scale.setScalar(0.7);
    this.mark.position.y = 2.45;
    model.root.add(this.mark);
    const body = { pos: new THREE.Vector3(0, 0, -6), vel: new THREE.Vector3(), facing: 0, state: 'ground', horizontalSpeed: 0, mantleProgress: 0, stateTime: 0, stumbleTimer: 0, mantle: null, wallRun: null };
    this.boss = { model, body };
    // the red line before a charge
    const line = new THREE.Mesh(new THREE.PlaneGeometry(1.3, CHARGE_LEN), makeGlowMaterial(0xff2a1a, 0.42));
    line.geometry.rotateX(-Math.PI / 2);
    line.geometry.translate(0, 0, CHARGE_LEN / 2);
    line.position.y = 0.06;
    line.visible = false;
    L.group.add(line);
    this.line = line;
    // her Jackals
    this.brawlers = new Brawlers(L.group, { x0: ARENA.x0 + 0.5, x1: ARENA.x1 - 0.5, z0: ARENA.z0 + 0.5, z1: ARENA.z1 - 0.5 });
    // dynamite
    this.sticks = [];
    this.stickMat = new THREE.MeshStandardMaterial({ color: 0xc8261a, roughness: 0.6 });
    this.ringMat = makeGlowMaterial(0xff2a1a, 0.5);
    this.flashMat = new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0xffa040, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.blasts = [];
    return L;
  }

  _markTex() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.font = '900 54px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 9; g.strokeStyle = 'rgba(0,0,0,0.85)'; g.strokeText('!', 32, 35);
    g.fillStyle = '#ff3a2a'; g.fillText('!', 32, 35);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  start(first) {
    const s = this.state;
    this.run = getChapterRun(s.game, this.chapter.id);
    this.done = false;
    this.t = 0;
    this.told = {};
    const id = diff().id;
    this.maxHp = Math.round(30 * (id === 'easy' ? 0.75 : id === 'hard' ? 1.2 : 1));
    this.hearts = new Hearts(s, id === 'easy' ? 6 : id === 'hard' ? 4 : 5);
    this.round = 0;
    this._bar(true);
    this._startRound(0, true);
    const hud = s.game.hud;
    if (first) hud.showControls(`<kbd>WASD</kbd> move &nbsp; <kbd>Click</kbd> / <kbd>B</kbd> punch (three quick ones: the third is an UPPERCUT)<br>Red <b>!</b>: step back &nbsp; red line: get out of the way &nbsp; red ring: run &nbsp; <kbd>P</kbd> pause`);
    hud.setPhase(`${this.chapter.title} · Part ${this.partIndex + 1}: ${this.part.title}`);
    hud.setObjective(this.part.objective);
    if (first && !s.game.speedrun) s.showStoryCards(this.part.intro, this.part.startLabel || 'Fight');
  }

  /** Start round 0, 1 or 2 (from the beginning, from 60%, from 30%). */
  _startRound(r, quiet = false) {
    const s = this.state, B = this.boss, L = this.level;
    this.round = r;
    this.hp = Math.round(this.maxHp * [1, 0.6, 0.3][r]);
    this.hearts.reset();
    B.st = 'intro';
    B.t = quiet ? -0.6 : 0;
    B.cd = 1.2;
    B.chargeCd = r === 0 ? 5 : 2.5;
    B.throwCd = 1.5;
    B.taken = 0;
    B.body.pos.set(0, 0, -6);
    B.body.facing = 0;
    B.model.standUp?.();
    B.model.root.visible = true;
    this.line.visible = false;
    this.mark.visible = false;
    this.stars.visible = false;
    for (const st of this.sticks) L.group.remove(st.mesh, st.ring);
    this.sticks = [];
    this.brawlers.clear();
    if (r >= 1) this._callJackals(r === 1 ? 2 : 1, true);
    s.placePlayer(L.spawn, 0);
  }

  _callJackals(n, quiet) {
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1;
      this.brawlers.add(side * (ARENA.x1 - 1.2), (i < 2 ? 0 : 2.5) * side, { look: JACKAL_LOOK, hp: 3, speed: 2.6, windup: 0.7 });
    }
    if (!quiet) audio.sfx('horn', { vol: 0.5 });
  }

  // ---------------------------------------------------------------- the boss health bar (a bar across the top of the screen)
  _bar(on) {
    if (!on) { this.barEl?.remove(); this.barEl = null; return; }
    if (this.barEl) return;
    const el = document.createElement('div');
    el.className = 'boss-bar';
    el.style.cssText = 'position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom) + 72px);transform:translateX(-50%);width:min(56vw,420px);z-index:30;pointer-events:none;font:700 12px system-ui,sans-serif;color:#ffd8c8;text-shadow:0 1px 2px #000;letter-spacing:0.08em;text-align:center';
    el.innerHTML = '<div class="bn">SABLE</div><div style="height:10px;margin-top:3px;background:rgba(0,0,0,0.6);border:1px solid rgba(255,120,90,0.6);border-radius:6px;overflow:hidden;position:relative"><div class="bt" style="position:absolute;inset:0;transform-origin:left;background:#ffd040;opacity:0.55"></div><div class="bf" style="position:absolute;inset:0;transform-origin:left;background:linear-gradient(90deg,#ff2a1a,#ff7a3a)"></div><div style="position:absolute;top:0;bottom:0;left:30%;width:2px;background:rgba(0,0,0,0.7)"></div><div style="position:absolute;top:0;bottom:0;left:60%;width:2px;background:rgba(0,0,0,0.7)"></div></div>';
    document.body.appendChild(el);
    this.barEl = el;
    this.barTrail = 1;
  }

  _updateBar(dt) {
    const el = this.barEl;
    if (!el) return;
    const f = clamp(this.hp / this.maxHp, 0, 1);
    this.barTrail = Math.max(f, this.barTrail - dt * 0.35);
    el.querySelector('.bf').style.transform = `scaleX(${f})`;
    el.querySelector('.bt').style.transform = `scaleX(${this.barTrail})`;
    const B = this.boss;
    el.querySelector('.bn').textContent = B.st === 'dizzy' ? 'SABLE · DIZZY!' : B.st === 'recover' ? 'SABLE · OPEN!' : 'SABLE';
  }

  _tell(key, title, text, color = 'var(--amber)', t = 4) {
    if (this.told[key]) return;
    this.told[key] = true;
    this.state.game.hud.toast(title, text, color, t);
  }

  audioMix() {
    return { wind: 0.35, city: 0, engine: 0, siren: 0, music: 0.45, intensity: 0.75 + (2 - (this.hp / this.maxHp) * 2) * 0.12 };
  }

  onRespawnKey() {
    this.state.game.hud.toast('No way out', 'The only way off this dam is past Sable.', 'var(--amber)', 2.5);
  }

  // ---------------------------------------------------------------- you're hit
  _hurt(dmg, fx, fz) {
    if (admin.flag('god') || this.done) return;
    if (!this.hearts.hurt(dmg, fx, fz)) { rumble(0.6, 160); return; }
    // out of hearts: this round again
    this.run.caught++;
    audio.sfx('caught');
    rumble(1, 300);
    const r = this.round;
    this._startRound(r);
    this.state.flash('Knocked down', r === 0 ? 'Sable: "Is that it?" Watch her: step back from the red !, out of the red line, and hit her when she\'s open.' : `Sable: "Again?" You start this round again (she\'s back to ${r === 1 ? '60' : '30'}%).`, 'var(--red)');
  }

  // ---------------------------------------------------------------- your punches
  onPunch({ inFront, heavy, fx, fz, hit }) {
    if (this.done) return false;
    const s = this.state, hud = s.game.hud;
    // her Jackals first (whoever's in front of you)
    const r = this.brawlers.punch({ inFront, heavy, fx, fz });
    if (r) {
      hit(heavy || r === 'ko');
      if (r === 'ko') this._tell('jko', 'Jackal down!', 'He\'s not getting up. Now Sable.', 'var(--amber)', 2.5);
      return true;
    }
    const B = this.boss;
    if (B.st === 'down' || B.st === 'intro' || !inFront(B.body.pos)) return false;
    const p = s.player.pos, b = B.body;
    // from behind? (her back to you)
    const ax = p.x - b.pos.x, az = p.z - b.pos.z, ad = Math.hypot(ax, az) || 1;
    const facingYou = (ax * Math.sin(b.facing) + az * Math.cos(b.facing)) / ad > 0.2;
    const open = B.st === 'dizzy' || B.st === 'recover' || B.st === 'stagger' || B.st === 'aim';
    if (facingYou && !open && !heavy && B.st !== 'charge') {
      // she blocks (and after a few, she shoves you off)
      audio.sfx('block');
      B.model.block(0.35);
      s.cam.addLandingDip?.(2);
      B.blocks = (B.blocks || 0) + 1;
      this._tell('block', 'Blocked!', 'From the front she blocks your jabs. Throw three quick punches (the UPPERCUT breaks her guard), or wait for her to be open.', 'var(--amber)', 4);
      if (B.blocks >= 3) { B.blocks = 0; this._shove(); }
      return true;
    }
    // a hit
    B.blocks = 0;
    const dmg = (heavy ? 2 : 1) + (B.st === 'dizzy' ? 1 : 0);
    this.hp = Math.max(0, this.hp - dmg);
    hit(heavy || B.st === 'dizzy');
    B.model.hit(0.3);
    if (this.hp <= 0) { this._beaten(); return true; }
    this._checkRound();
    if (B.st === 'dizzy') { B.knock = 0; return true; } // (she stays dizzy)
    B.taken++;
    if (heavy && facingYou && B.st !== 'recover') hud.toast('Guard broken!', '', 'var(--amber)', 1.2);
    B.st = 'stagger';
    B.t = 0;
    B.kx = fx * (heavy ? 1.2 : 0.6);
    B.kz = fz * (heavy ? 1.2 : 0.6);
    return true;
  }

  /** Too close for too long: she shoves you off, and goes on. */
  _shove() {
    const s = this.state, p = s.player, b = this.boss.body;
    const dx = p.pos.x - b.pos.x, dz = p.pos.z - b.pos.z, d = Math.hypot(dx, dz) || 1;
    p.vel.x += (dx / d) * 9;
    p.vel.z += (dz / d) * 9;
    this.boss.model.punch('cross');
    audio.sfx('block', { vol: 1 });
    s.cam.addLandingDip?.(4);
  }

  _checkRound() {
    const f = this.hp / this.maxHp, hud = this.state.game.hud;
    if (this.round === 0 && f <= 0.6) {
      this.round = 1;
      this._callJackals(2);
      hud.toast('Sable: "JACKALS!"', 'Two of her Jackals come over the barriers. Punch them out (three punches each) and keep away from Sable while you do.', 'var(--red)', 4.5);
    } else if (this.round === 1 && f <= 0.3) {
      this.round = 2;
      this._callJackals(1);
      this.boss.throwCd = 0.8;
      hud.toast('Sable: "Enough!"', 'She\'s got DYNAMITE. Red ring on the ground: get out of it before it goes off. (It knocks HER over too...)', 'var(--red)', 5);
    }
  }

  _beaten() {
    const s = this.state, B = this.boss;
    B.st = 'down';
    B.t = 0;
    this.line.visible = this.mark.visible = this.stars.visible = false;
    B.model.knockDown({ upIn: Infinity });
    for (const u of this.brawlers.units) if (u.st !== 'down') { u.st = 'down'; u.mark.visible = false; u.model.knockDown({ upIn: Infinity }); }
    for (const st of this.sticks) this.level.group.remove(st.mesh, st.ring);
    this.sticks = [];
    audio.sfx('uppercut', { vol: 1 });
    audio.sfx('thunder', { vol: 0.8 });
    rumble(1, 400);
    s.game.hud.toast('Sable is down!', 'And this time she\'s staying down.', 'var(--safe)', 4);
  }

  // ---------------------------------------------------------------- every frame
  update(dt) {
    if (this.done) return;
    const s = this.state, p = s.player, hud = s.game.hud, input = s.game.input, B = this.boss, b = B.body;
    this.t += dt;
    this.hearts.update(dt);
    this._updateBar(dt);
    s.setAction(null);

    // Punching: turn to face the nearest fighter (a soft lock-on)
    if (input.wasPressed('punch')) {
      let best = null, bd = 3.4;
      const cand = [B.st !== 'down' ? b.pos : null, ...this.brawlers.units.filter((u) => u.st !== 'down').map((u) => u.body.pos)];
      for (const q of cand) { if (!q) continue; const d = Math.hypot(q.x - p.pos.x, q.z - p.pos.z); if (d < bd) { bd = d; best = q; } }
      if (best) p.facing = Math.atan2(best.x - p.pos.x, best.z - p.pos.z);
    }

    // her Jackals
    this.brawlers.update(dt, p, (dmg, x, z) => this._hurt(dmg, x, z));
    // Sable
    if (B.st === 'down') {
      B.t += dt;
      b.horizontalSpeed = 0;
      B.model.update(dt, b);
      if (B.t > 2.6) this._finish();
      this._hud();
      return;
    }
    this._boss(dt);
    this._dynamite(dt);
    this._hud();
  }

  _boss(dt) {
    const s = this.state, p = s.player, B = this.boss, b = B.body, hud = s.game.hud;
    const k = diff().officerSpeed || 1;
    const dx = p.pos.x - b.pos.x, dz = p.pos.z - b.pos.z, d = Math.hypot(dx, dz) || 0.001;
    B.t += dt;
    B.cd -= dt;
    B.chargeCd -= dt;
    B.throwCd -= dt;
    let move = 0;
    this.mark.visible = false;
    this.stars.visible = false;
    if (B.st === 'intro') {
      b.facing = Math.atan2(dx, dz);
      if (B.t > 1.2) { B.st = 'approach'; B.t = 0; this._tell('how', 'Sable', 'Watch her. Red ! over her head: she\'s about to throw three punches: step BACK. Then hit her while she gets her breath back.', 'var(--amber)', 5); }
    } else if (B.st === 'approach') {
      b.facing = Math.atan2(dx, dz);
      if (d > 1.6) move = 3.3 * k;
      if (this.round === 2 && B.throwCd <= 0 && d > 3) { B.st = 'throw'; B.t = 0; B.model.reach(0.5); }
      else if (B.chargeCd <= 0 && d > 5.5) { B.st = 'aim'; B.t = 0; B.model.block(AIM); audio.sfx('sting', { vol: 0.4 }); }
      else if (d < 2.3 && B.cd <= 0) { B.st = 'combo'; B.t = 0; B.swing = 0; B.model.block(SWINGS[0]); }
    } else if (B.st === 'combo') {
      // the wind-up (the red !), then three punches, each with a step forward
      if (B.t < SWINGS[0]) { b.facing = Math.atan2(dx, dz); this.mark.visible = true; }
      if (B.swing < 3 && B.t >= SWINGS[B.swing]) {
        B.model.punch(['jab', 'cross', 'upper'][B.swing]);
        audio.sfx('whoosh', { vol: 0.55 });
        b.facing += clamp(((Math.atan2(dx, dz) - b.facing + Math.PI * 3) % (Math.PI * 2)) - Math.PI, -0.35, 0.35); // (she turns a little after you)
        b.pos.x += Math.sin(b.facing) * 0.45;
        b.pos.z += Math.cos(b.facing) * 0.45;
        const ahead = (dx * Math.sin(b.facing) + dz * Math.cos(b.facing)) / d;
        if (d < 2.15 && ahead > 0.35) this._hurt(1, b.pos.x, b.pos.z);
        B.swing++;
      }
      if (B.t > COMBO_END) {
        B.st = 'recover';
        B.t = 0;
        this._tell('open', 'She\'s open!', 'Sable is getting her breath back: hit her NOW.', 'var(--safe)', 2.5);
      }
    } else if (B.st === 'recover') {
      if (B.t > OPEN) { B.st = 'approach'; B.t = 0; B.cd = 0.9 + Math.random() * 0.8; }
    } else if (B.st === 'stagger') {
      b.pos.x += B.kx * dt * 4;
      b.pos.z += B.kz * dt * 4;
      if (B.t > 0.32) {
        // after a few hits in a row she breaks away and comes again
        if (B.taken >= 4) { B.taken = 0; this._shove(); B.st = d > 3 ? 'aim' : 'combo'; B.t = 0; B.swing = 0; if (B.st === 'aim') B.model.block(AIM); else B.model.block(SWINGS[0]); }
        else { B.st = 'approach'; B.t = 0; B.cd = Math.max(B.cd, 0.4); }
      }
    } else if (B.st === 'aim') {
      // the red line: where she's going to run
      if (B.t < AIM * 0.7) b.facing = Math.atan2(dx, dz);
      this.line.visible = true;
      this.line.position.set(b.pos.x, 0.06, b.pos.z);
      this.line.rotation.y = b.facing;
      this.line.material.opacity = 0.25 + 0.3 * (0.5 + 0.5 * Math.sin(B.t * 22));
      if (B.t > AIM) {
        B.st = 'charge';
        B.t = 0;
        B.ran = 0;
        this.line.visible = false;
        audio.sfx('whoosh', { vol: 0.9, rate: 0.7 });
        this._tell('charge', 'CHARGE!', 'Get out of the red line! If she runs into a crate or the railings, she\'s dizzy: that\'s your moment.', 'var(--red)', 4);
      }
    } else if (B.st === 'charge') {
      const step = CHARGE_SPEED * k * dt;
      const fx = Math.sin(b.facing), fz = Math.cos(b.facing);
      b.pos.x += fx * step;
      b.pos.z += fz * step;
      B.ran += step;
      move = CHARGE_SPEED;
      // into you?
      if (Math.hypot(p.pos.x - b.pos.x, p.pos.z - b.pos.z) < 1.05) { this._hurt(2, b.pos.x - fx, b.pos.z - fz); B.st = 'recover'; B.t = 0.4; }
      // her Jackals in the way go flying
      for (const u of this.brawlers.units) if (u.st !== 'down' && Math.hypot(u.body.pos.x - b.pos.x, u.body.pos.z - b.pos.z) < 1.0) { u.hp = 0; u.st = 'down'; u.mark.visible = false; u.model.knockDown({ upIn: Infinity }); audio.sfx('crash', { vol: 0.5 }); }
      // into a crate, or the railings: dizzy
      const crate = this.level.crates.find((c) => Math.abs(b.pos.x - c.x) < CRATE_HALF + 0.35 && Math.abs(b.pos.z - c.z) < CRATE_HALF + 0.35);
      const wall = b.pos.x < ARENA.x0 + 0.3 || b.pos.x > ARENA.x1 - 0.3 || b.pos.z < ARENA.z0 + 0.3 || b.pos.z > ARENA.z1 - 0.3;
      if (crate || wall) {
        b.pos.x -= fx * 0.5;
        b.pos.z -= fz * 0.5;
        B.st = 'dizzy';
        B.t = 0;
        B.model.hit(0.5);
        audio.sfx('crash', { vol: 1 });
        s.cam.addLandingDip?.(5);
        rumble(0.7, 200);
        if (crate) { crate.shake = 0.5; }
        hud.toast('Dizzy!', 'She ran into the ' + (crate ? 'crate' : 'railings') + '. Hit her now: every punch counts double.', 'var(--safe)', 2.5);
        B.chargeCd = this.round === 0 ? 6 : 4;
      } else if (B.ran > CHARGE_LEN) { B.st = 'recover'; B.t = OPEN - 0.7; B.chargeCd = this.round === 0 ? 6 : 4; }
    } else if (B.st === 'dizzy') {
      this.stars.visible = true;
      this.stars.rotation.y += dt * 6;
      this.stars.children.forEach((c, i) => { const a = this.t * 5 + (i * Math.PI * 2) / 3; c.position.set(Math.cos(a) * 0.35, Math.sin(this.t * 7 + i) * 0.05, Math.sin(a) * 0.35); });
      if (B.t > DIZZY) { B.st = 'approach'; B.t = 0; B.cd = 0.5; }
    } else if (B.st === 'throw') {
      b.facing = Math.atan2(dx, dz);
      if (B.t > 0.5 && !B.thrown) {
        B.thrown = true;
        B.model.punch('cross');
        audio.sfx('whoosh', { vol: 0.6 });
        const n = 3;
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2, r = i === 0 ? 0 : 2.2 + Math.random() * 2;
          // (one where you are, the others round you; a bit ahead of where you're going)
          const tx = clamp(p.pos.x + p.vel.x * 0.4 + Math.cos(a) * r, ARENA.x0 + 1, ARENA.x1 - 1);
          const tz = clamp(p.pos.z + p.vel.z * 0.4 + Math.sin(a) * r, ARENA.z0 + 1, ARENA.z1 - 1);
          this._throwStick(b.pos.x, b.pos.z, tx, tz, i * 0.12);
        }
      }
      if (B.t > 1.0) { B.st = 'approach'; B.t = 0; B.thrown = false; B.throwCd = 4.2 + Math.random() * 1.5; B.cd = 0.6; }
    }
    // keep her on the plaza and out of the crates
    b.pos.x = clamp(b.pos.x, ARENA.x0, ARENA.x1);
    b.pos.z = clamp(b.pos.z, ARENA.z0, ARENA.z1);
    if (B.st !== 'charge') {
      for (const c of this.level.crates) {
        const ox = b.pos.x - c.x, oz = b.pos.z - c.z, e = CRATE_HALF + 0.4;
        if (Math.abs(ox) < e && Math.abs(oz) < e) {
          if (e - Math.abs(ox) < e - Math.abs(oz)) b.pos.x = c.x + Math.sign(ox || 1) * e; else b.pos.z = c.z + Math.sign(oz || 1) * e;
        }
      }
    }
    if (move && B.st === 'approach') { b.pos.x += (dx / d) * move * dt; b.pos.z += (dz / d) * move * dt; }
    // and not inside you
    const pd = Math.hypot(p.pos.x - b.pos.x, p.pos.z - b.pos.z);
    if (pd < 0.9 && pd > 0.001 && B.st !== 'charge') { b.pos.x -= ((p.pos.x - b.pos.x) / pd) * (0.9 - pd); b.pos.z -= ((p.pos.z - b.pos.z) / pd) * (0.9 - pd); }
    b.pos.y = 0;
    b.horizontalSpeed = move;
    B.model.update(dt, b);
    // the crates shake when she hits them
    for (const c of this.level.crates) {
      if (!(c.shake > 0)) continue;
      c.shake = Math.max(0, c.shake - dt);
      c.mesh.position.x = c.x + Math.sin(c.shake * 60) * c.shake * 0.12;
    }
  }

  // ---------------------------------------------------------------- dynamite
  _throwStick(fx, fz, tx, tz, delay) {
    const G = this.level.group;
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.42, 8), this.stickMat);
    const spark = new THREE.Sprite(this.flashMat);
    spark.scale.setScalar(0.3);
    spark.position.y = 0.25;
    mesh.add(spark);
    mesh.visible = false;
    const ring = new THREE.Mesh(new THREE.RingGeometry(BLAST_R - 0.18, BLAST_R, 40), this.ringMat.clone());
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(tx, 0.07, tz);
    const fill = new THREE.Mesh(new THREE.CircleGeometry(BLAST_R, 40), makeGlowMaterial(0xff2a1a, 0.12));
    ring.add(fill);
    fill.position.z = -0.005;
    G.add(mesh, ring);
    this.sticks.push({ mesh, ring, fill, fx, fz, tx, tz, t: -delay, fly: 0.75 });
  }

  _dynamite(dt) {
    const s = this.state, p = s.player, G = this.level.group, B = this.boss;
    for (let i = this.sticks.length - 1; i >= 0; i--) {
      const st = this.sticks[i];
      st.t += dt;
      if (st.t < 0) { st.ring.visible = false; continue; }
      st.ring.visible = true;
      st.mesh.visible = true;
      const f = Math.min(1, st.t / st.fly);
      st.mesh.position.set(st.fx + (st.tx - st.fx) * f, 1.6 + f * (1 - f) * 7 - 1.45 * f, st.fz + (st.tz - st.fz) * f);
      st.mesh.rotation.z += dt * 9;
      const lit = (st.t - st.fly) / FUSE; // (0..1 once it's landed)
      st.ring.material.opacity = 0.35 + 0.4 * (0.5 + 0.5 * Math.sin(st.t * (10 + Math.max(0, lit) * 30)));
      st.fill.scale.setScalar(Math.max(0.02, clamp(lit, 0, 1)));
      if (lit < 1) continue;
      // BANG
      G.remove(st.mesh, st.ring);
      this.sticks.splice(i, 1);
      audio.sfx('crash', { vol: 1 });
      audio.sfx('thunder', { vol: 0.5 });
      s.cam.addLandingDip?.(5);
      const flash = new THREE.Sprite(this.flashMat);
      flash.position.set(st.tx, 1, st.tz);
      flash.scale.setScalar(BLAST_R * 2.6);
      G.add(flash);
      this.blasts.push({ flash, t: 0 });
      if (Math.hypot(p.pos.x - st.tx, p.pos.z - st.tz) < BLAST_R + 0.2) this._hurt(1, st.tx, st.tz);
      for (const u of this.brawlers.units) if (u.st !== 'down' && Math.hypot(u.body.pos.x - st.tx, u.body.pos.z - st.tz) < BLAST_R) { u.hp = 0; u.st = 'down'; u.mark.visible = false; u.model.knockDown({ upIn: Infinity }); }
      if (B.st !== 'down' && Math.hypot(B.body.pos.x - st.tx, B.body.pos.z - st.tz) < BLAST_R) {
        this.hp = Math.max(1, this.hp - 3);
        B.st = 'dizzy';
        B.t = 0;
        B.model.hit(0.5);
        s.game.hud.toast('Ha!', 'Sable got caught in her own dynamite. She\'s dizzy: hit her!', 'var(--safe)', 3);
      }
    }
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const x = this.blasts[i];
      x.t += dt;
      x.flash.material = this.flashMat;
      x.flash.scale.setScalar(BLAST_R * 2.6 * (1 - x.t * 2.5));
      if (x.t > 0.35) { G.remove(x.flash); this.blasts.splice(i, 1); }
    }
  }

  _hud() {
    const s = this.state, hud = s.game.hud, B = this.boss, b = B.body;
    const round = ['Round 1', 'Round 2: her Jackals', 'Round 3: dynamite'][this.round];
    hud.setStats(`${this.hearts.html}<span>${round}</span><span>Sable <b>${Math.ceil((this.hp / this.maxHp) * 100)}%</b></span>` +
      `<span>Time <b>${formatTime(s.time)}</b></span><span${this.run.caught ? ' class="warn"' : ''}>Knocked down <b>${this.run.caught}</b></span>`);
    const st = B.st;
    if (st === 'dizzy') hud.setMeter(1 - B.t / DIZZY, 'SHE\'S DIZZY: HIT HER!', 'var(--safe)');
    else if (st === 'recover') hud.setMeter(1 - B.t / OPEN, 'She\'s open: hit her!', 'var(--safe)');
    else if (st === 'aim') hud.setMeter(B.t / AIM, 'She\'s going to CHARGE: get out of the red line!', 'var(--red)');
    else if (st === 'combo' && B.t < SWINGS[0]) hud.setMeter(B.t / SWINGS[0], 'Step back!', 'var(--red)');
    else if (this.sticks.length) hud.setMeter(1, 'DYNAMITE: out of the red rings!', 'var(--red)');
    else hud.setMeter(0, '');
    if (st !== 'down') hud.setMarker(_v.set(b.pos.x, 2.6, b.pos.z), s.camera, 'Sable', '#ff5a4a', Math.hypot(b.pos.x - s.player.pos.x, b.pos.z - s.player.pos.z));
    else hud.setMarker(null);
  }

  _finish() {
    if (this.done) return;
    this.done = true;
    const s = this.state;
    s.setAction(null);
    s.game.hud.setMeter(0, '');
    s.game.hud.setMarker(null);
    this._bar(false);
    audio.sfx('win');
    finishPart(s, this);
  }

  adminSkip() { this._finish(); }

  teardown() {
    this._bar(false);
  }
}

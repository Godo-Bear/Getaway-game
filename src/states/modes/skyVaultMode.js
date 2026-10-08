import * as THREE from 'three';
import { buildChapter17Tower, KURO, VAULT, VAULT_Y } from '../../world/levels/chapter17Tower.js';
import { MovingPlatform } from '../../world/movingPlatform.js';
import { GuardSquad } from '../../ai/guards.js';
import { makeGlowMaterial } from '../../world/materials.js';
import { CHAPTERS } from '../../story/chapters.js';
import { getChapterRun } from '../../story/chapterRun.js';
import { finishPart } from '../../story/chapterFlow.js';
import { earn } from '../../gadgets/gadgets.js';
import { admin } from '../../core/admin.js';
import { diff } from '../../core/difficulty.js';
import { formatTime, clamp, damp, dampAngle } from '../../core/utils.js';
import { noteCaught } from '../../core/jail.js';
import { audio } from '../../core/audio.js';

// Chapter 17, Part 2: the sky vault, 88 floors up.
//
//  1. THE GONDOLA: from the roof, step into the window cleaners' gondola on
//     the east face and lower it (E) to the vault's window. A drone sweeps
//     up and down the glass: crouch (C) below the gondola's rail when its
//     light comes your way.
//  2. THE WINDOW: hold E to cut the glass.
//  3. THE FLOOR: the vault's floor is 48 pressure tiles. Only one path
//     across is safe, and Kitsu (hacked into the floor) lights it up for a
//     few seconds: remember it. Step on a wrong tile and the floor clicks:
//     back to the window (the terminal there shows the path again).
//  4. THE GOLD: grab it (E) and the alarm goes off. Kurogane's guards burst
//     in through the door, steel shutters start coming down over the window,
//     and Kitsu sends the gondola back up to the roof (so they think you
//     went up). You don't go up. You JUMP: the parachute opens by itself.
//     Steer it down to Kitsu's van in the street.

const GONDOLA_X = KURO.x1 + 1.2, GONDOLA_Z = -380;
const TOP = KURO.h, BOTTOM = VAULT_Y;
const LOWER_SPEED = 1.6, RAISE_SPEED = 2.2;
const CUT_TIME = 2.2;
const SHUTTER_TIME = 20;     // seconds after the grab before the window's shutters are down
const GOLD_CASH = 1500;
const CHUTE = 8, CHUTE_DIVE = 12, CHUTE_FLARE = 4.5;
const CHUTE_SINK = 6, CHUTE_DIVE_SINK = 9, CHUTE_FLARE_SINK = 3.2;
const KURO_GUARD = { hoodie: 0x16171c, trousers: 0x16171c, gloves: 0x16171c, shirt: 0xe8e8e8, tie: 0xc02030, style: { top: 'suit', face: 'shades', hair: 'buzz' } };
const _v = new THREE.Vector3(), _a = new THREE.Vector3();

export class SkyVaultMode {
  constructor(state, params) {
    this.state = state;
    this.chapter = CHAPTERS[params.chapterId || 'chapter17'];
    this.partIndex = params.part ?? 1;
    this.part = this.chapter.parts[this.partIndex];
    this.hudSections = ['tl', 'meter', 'controls', 'marker'];
    this.weather = 'clear';
    this.weatherForced = true;
    this.time = 'night';
    this.indoors = true;
  }

  get inputLocked() { return this.chuting; }
  get fallY() { return -10; }
  get officers() { return this.guards; }

  build() {
    const L = buildChapter17Tower({ withVault: true });
    const yW = Math.PI / 2;   // (camera yaw that looks west, -X)
    L.checkpoints = [
      { spawn: new THREE.Vector3(0, TOP, -372), yaw: -Math.PI / 2 },        // the roof (looking east, at the gondola)
      { spawn: new THREE.Vector3(GONDOLA_X - 0.2, BOTTOM + 0.05, GONDOLA_Z), yaw: yW },  // in the gondola at the window
      { spawn: new THREE.Vector3(20.8, BOTTOM, -380), yaw: yW },            // inside, on the windowsill
      { spawn: new THREE.Vector3(8.6, BOTTOM, -380), yaw: -Math.PI / 2 },   // the gold in your bag
    ];
    L.spawn = L.checkpoints[0].spawn.clone();
    L.spawn.yaw = L.checkpoints[0].yaw;
    this.level = L;
    // the gondola (it moves: a moving platform)
    this.gondola = new MovingPlatform(L.world, L.gondola, [
      [-0.8, -0.25, -2.5, 0.8, 0, 2.5],      // floor
      [0.7, 0, -2.5, 0.8, 1.0, 2.5],         // the outer rail
      [-0.8, 0, -2.5, 0.8, 1.0, -2.4],       // end rails
      [-0.8, 0, 2.4, 0.8, 1.0, 2.5],
    ], new THREE.Vector3(GONDOLA_X, TOP, GONDOLA_Z));
    // display cases along the vault's north and south walls (so the tiles are the only way across), a gap at the door
    const caseMat = new THREE.MeshStandardMaterial({ color: 0x9ad0ff, transparent: true, opacity: 0.18, roughness: 0.05 });
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x2a2c36, metalness: 0.5 });
    for (const [x0, x1, z0, z1] of [[8, 20, VAULT.z0, -388], [8, 12, -372, VAULT.z1], [14, 20, -372, VAULT.z1]]) {
      const base = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 1, z1 - z0), baseMat);
      base.position.set((x0 + x1) / 2, BOTTOM + 0.5, (z0 + z1) / 2);
      const glass = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 1.4, z1 - z0), caseMat);
      glass.position.set((x0 + x1) / 2, BOTTOM + 1.7, (z0 + z1) / 2);
      L.group.add(base, glass);
      L.world.addBox(x0, BOTTOM, z0, x1, BOTTOM + 2.4, z1, { tag: 'prop' });
      for (let x = x0 + 1; x < x1; x += 2) {   // treasures in the cases
        const t = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), new THREE.MeshStandardMaterial({ color: [0xe8c040, 0x4dffa6, 0xff3040, 0x9ad0ff][Math.floor(x) % 4], metalness: 0.8, roughness: 0.2, emissive: 0x201000 }));
        t.position.set(x, BOTTOM + 1.3, (z0 + z1) / 2);
        L.group.add(t);
      }
    }
    // the terminal on the sill (Kitsu shows the path again)
    this.terminal = new THREE.Vector3(21, BOTTOM, -386.5);
    const term = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.1, 0.6), new THREE.MeshStandardMaterial({ color: 0x1a1b20, emissive: 0x39e6ff, emissiveIntensity: 0.5 }));
    term.position.set(this.terminal.x, BOTTOM + 0.55, this.terminal.z);
    L.group.add(term);
    L.world.addBox(20.75, BOTTOM, -386.8, 21.25, BOTTOM + 1.1, -386.2, { tag: 'prop' });
    // the steel shutter over the window (inside), rolled up until the alarm
    const sh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 5, 6).translate(0, -2.5, 0), new THREE.MeshStandardMaterial({ color: 0x5a5d66, metalness: 0.7, roughness: 0.4 }));
    sh.position.set(21.4, BOTTOM + 5, -380);
    sh.scale.y = 0.001;
    L.group.add(sh);
    this.shutter = sh;
    // the alarm light (red, flashing)
    this.alarmLight = new THREE.PointLight(0xff2030, 0, 22, 1.5);
    this.alarmLight.position.set(14, BOTTOM + 4, -380);
    L.group.add(this.alarmLight);
    // the drone that sweeps the east face
    const fd = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 1.2), new THREE.MeshStandardMaterial({ color: 0x1a1b20, metalness: 0.6 }));
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2030 }));
    eye.position.set(-0.6, -0.2, 0);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(4.5, 16, 20, 1, true).translate(0, -8, 0), makeGlowMaterial(0xdfe8ff, 0.1));
    cone.rotation.z = -(Math.PI / 2 - 0.45);   // pointing at the glass, a little down
    fd.add(body, eye, cone);
    L.group.add(fd);
    this.faceDrone = { g: fd, cone, z: -420, dir: 1 };
    // Kurogane's guards (they come in through the door when the alarm goes)
    this.guards = new GuardSquad(L.group, L.world, [[[13, -371], [13, -375]], [[12.4, -371.2], [10, -376]], [[13.6, -371.2], [17, -376]]].map((route) => ({ route })),
      { sight: diff().guardSight, look: KURO_GUARD, range: 14, alertRange: 20, groundFrom: BOTTOM + 1.2 });
    this.path = this._makePath();
    return L;
  }

  /** A random safe way across the tiles: from the window side (column 5) to the gold (column 0). */
  _makePath() {
    const path = [];
    let c = 5, r = 2 + Math.floor(Math.random() * 4), lastDir = 0, side = 0;
    const seen = new Set();
    const add = () => { path.push([c, r]); seen.add(`${c},${r}`); };
    add();
    while (c > 0) {
      const dir = lastDir || (Math.random() < 0.5 ? -1 : 1);
      const nr = r + dir;
      if (side < 2 && Math.random() < 0.5 && nr >= 0 && nr <= 7 && !seen.has(`${c},${nr}`)) { r = nr; lastDir = dir; side++; }
      else { c--; side = 0; lastDir = Math.random() < 0.5 ? -lastDir || 1 : 0; }
      add();
    }
    this.safe = seen;
    return path;
  }

  start(first) {
    const s = this.state;
    this.run = getChapterRun(s.game, this.chapter.id);
    this.done = false;
    this.cp = 0;
    this.wrongSteps = 0;
    if (!this._camSet) { this._camSet = true; this.camDist = s.cam.distance; }
    s.model.setOutfit({ hoodie: 0x1a1b22, trousers: 0x1a1b22, gloves: 0xff7a2a, style: { top: 'tracksuit', bag: true, hat: 'beanie' } });
    this._reset();
    const hud = s.game.hud;
    hud.setPhase(`${this.chapter.title} · Part ${this.partIndex + 1}: ${this.part.title}`);
    hud.setObjective(this.part.objective);
    if (first && !s.game.speedrun) s.showStoryCards(this.part.intro, this.part.startLabel || 'Go');
  }

  /** Everything as it should be for the current checkpoint. */
  _reset() {
    const s = this.state, L = this.level, cp = this.cp;
    this.phase = ['roof', 'window', 'tiles', 'grabbed'][cp];
    this.gondolaY = cp === 0 ? TOP : BOTTOM;
    this.lowering = false;
    this.gondola.moveTo(_v.set(GONDOLA_X, this.gondolaY, GONDOLA_Z));
    this.cut = cp >= 2 ? 1 : 0;
    L.windowBox.disabled = cp >= 2;
    L.glass.visible = cp < 2;
    this.gold = cp >= 3;
    L.gold.visible = !this.gold;
    this.spotted = 0;
    this.grab = 0;
    this.alarmT = 0;
    this.chuting = false;
    this.landed = false;
    this.showT = cp === 2 ? 0.01 : 0;
    this.showCool = 0;
    this.redT = 0;
    this.faceDrone.z = -420;
    this.faceDrone.dir = 1;
    this.faceDrone.g.visible = cp < 1;
    this.shutter.scale.y = 0.001;
    this.alarmLight.intensity = 0;
    this.guards.reset();
    this.guards.setAlert(cp >= 3);
    for (const u of this.guards.units) u.model.root.visible = u.cone.visible = cp >= 3;
    this.guardsIn = cp >= 3 ? 2.5 : -1;   // (seconds until they come through the door)
    s.model.flying = null;
    s.cam.roll = 0;
    for (const t of L.tiles) { t.lit = 0; t.stepped = false; }
    this._paintTiles(0);
    if (cp >= 3) this._alarmOn(true);
  }

  _caught(title, msg) {
    if (admin.flag('god')) { this.spotted = 0; this.grab = 0; return; }
    if (noteCaught(this.state)) return; // (the third time: off to jail)
    this.run.caught++;
    audio.sfx('caught');
    this._toCheckpoint(title, msg);
  }

  _toCheckpoint(title, msg, color = 'var(--red)') {
    const s = this.state, cp = this.level.checkpoints[this.cp];
    this._reset();
    s.placePlayer(cp.spawn, cp.yaw);
    s.flash(title, msg, color);
  }

  onRespawnKey() { this._toCheckpoint('Checkpoint', 'Back to the last checkpoint.', 'var(--cyan)'); }

  onFall() { this._toCheckpoint('Missed', 'Back up you go.', 'var(--cyan)'); }

  audioMix() {
    const alarm = this.phase === 'grabbed';
    return { wind: this.phase === 'roof' || this.phase === 'down' || this.chuting ? 0.6 : 0.1, city: this.landed ? 0.4 : 0.1, engine: 0, siren: alarm ? 0.25 : 0, music: 0.5, intensity: alarm ? 0.95 : 0.4 + this.spotted * 0.5 };
  }

  update(dt) {
    if (this.done) return;
    const s = this.state, L = this.level, p = s.player, pos = p.pos, hud = s.game.hud, input = s.game.input, d = diff();
    const inGondola = Math.abs(pos.x - GONDOLA_X) < 0.95 && Math.abs(pos.z - GONDOLA_Z) < 2.6 && pos.y > this.gondolaY - 0.5 && pos.y < this.gondolaY + 2.5;
    let action = null;

    // --- The gondola: lowering (carrying you), or Kitsu sending it back up after the alarm
    if (this.lowering) {
      this.gondolaY = Math.max(BOTTOM, this.gondolaY - LOWER_SPEED * dt);
      if (this.gondolaY <= BOTTOM) {
        this.lowering = false;
        this.phase = 'window';
        this.cp = Math.max(this.cp, 1);
        this.faceDrone.g.visible = false;
        audio.sfx('clang', { vol: 0.5 });
        hud.setObjective('Cut the window (hold E)');
        hud.toast('The vault window', 'Kitsu: "I\'ve looped that drone\'s camera. Cut the glass, quietly."', 'var(--cyan)', 4);
      }
    } else if (this.phase === 'grabbed' && this.gondolaY < TOP) this.gondolaY = Math.min(TOP, this.gondolaY + RAISE_SPEED * dt);
    this.gondola.moveTo(_v.set(GONDOLA_X, this.gondolaY, GONDOLA_Z), p);

    // --- The drone on the east face (until you reach the window)
    if (this.faceDrone.g.visible) this._faceDrone(dt, inGondola, d);

    // --- What you can do
    if (this.phase === 'roof' && inGondola && p.grounded) {
      action = 'Lower the gondola';
      if (input.wasPressed('interact')) {
        this.phase = 'down';
        this.lowering = true;
        audio.sfx('clang', { vol: 0.7 });
        hud.setObjective('Ride down to the vault (crouch when the drone looks your way)');
        hud.toast('Going down', 'Kitsu: "A drone sweeps that side of the tower. When its light comes your way, crouch (C) below the rail."', 'var(--amber)', 5);
      }
    } else if (this.phase === 'window') {
      const atWindow = inGondola && pos.x < GONDOLA_X + 0.2;
      if (atWindow || this.cut > 0) {
        action = atWindow ? 'Cut the glass (hold)' : null;
        if (atWindow && input.isDown('interact')) {
          this.cut += dt / CUT_TIME;
          if (Math.random() < dt * 8) audio.sfx('step', { vol: 0.25, rate: 2.2 });
          if (this.cut >= 1) this._windowCut();
        }
      }
      hud.setMeter(this.cut, this.cut > 0 ? 'Cutting the glass...' : '', 'var(--cyan)');
    } else if (this.phase === 'tiles') {
      this._tiles(dt, input, hud);
      const atTerm = Math.hypot(pos.x - this.terminal.x, pos.z - this.terminal.z) < 1.4;
      const atGold = Math.hypot(pos.x - L.pedestal.x, pos.z - L.pedestal.z) < 1.7 && pos.y < BOTTOM + 1;
      if (atGold) {
        action = 'Grab the gold';
        if (input.wasPressed('interact')) this._grab();
      } else if (atTerm) {
        action = this.showCool > 0 ? `Path again in ${Math.ceil(this.showCool)}s` : 'Show the path again';
        if (input.wasPressed('interact') && this.showCool <= 0) this._showPath();
      }
    } else if (this.phase === 'grabbed') {
      this._alarm(dt, d, hud);
      if (this.done) return;
    }
    if (this.done) return;
    s.setAction(action);

    // --- Falling off before you've got the gold: back to the checkpoint
    if (this.phase !== 'grabbed' && pos.y < BOTTOM - 6) { this._toCheckpoint('Whoa', 'Careful up there. Back to the last checkpoint.', 'var(--cyan)'); return; }

    // --- The parachute (after the grab: jump!)
    if (this.phase === 'grabbed') this._parachute(dt, input, hud);
    if (this.done) return;

    this._updateMarker(inGondola);
    const stats = [];
    if (this.phase === 'tiles') stats.push(`<span>Wrong steps <b>${this.wrongSteps}</b></span>`);
    if (this.phase === 'grabbed' && pos.x < VAULT.x1 + 0.4 && pos.y > BOTTOM - 1) stats.push(`<span class="warn">Shutters down in <b>${Math.max(0, Math.ceil(SHUTTER_TIME * d.timer - this.alarmT))}s</b></span>`);
    if (this.chuting) stats.push(`<span>Height <b>${Math.round(pos.y)} m</b></span>`);
    stats.push(`<span>Time <b>${formatTime(s.time)}</b></span><span${this.run.caught ? ' class="warn"' : ''}>Caught <b>${this.run.caught}</b></span>`);
    hud.setStats(stats.join(''));
  }

  _faceDrone(dt, inGondola, d) {
    const s = this.state, p = s.player, pos = p.pos, hud = s.game.hud, fd = this.faceDrone;
    fd.z += fd.dir * 9 * dt;
    if (fd.z > -340) fd.dir = -1;
    if (fd.z < -420) fd.dir = 1;
    fd.g.position.set(KURO.x1 + 9, this.gondolaY + 3.2, fd.z);
    fd.g.rotation.y = 0;
    for (const c of fd.g.children) c.rotation.y += c.geometry?.type === 'CylinderGeometry' ? dt * 40 : 0;
    // is the beam on you? (crouching below the rail hides you)
    _v.subVectors(pos, fd.g.position);
    _v.y += 0.9;
    const len = _v.length();
    _a.set(-Math.cos(0.45), -Math.sin(0.45), 0);
    const inBeam = len < 17 && _v.dot(_a) / len > Math.cos(0.3);
    const crouched = p.state === 'crouch' || p.state === 'slide';
    const lit = inBeam && !(inGondola && crouched) && this.phase !== 'roof';
    fd.cone.material.color.setHex(lit ? 0xff4050 : 0xdfe8ff);
    if (inBeam && inGondola && !this.toldDuck) { this.toldDuck = true; hud.toast('Duck!', 'Crouch (C) below the rail while the light passes.', 'var(--amber)', 3); }
    this.spotted = clamp(this.spotted + (lit ? (dt / 0.9) * d.fill : -dt * 0.6), 0, 1);
    if (this.phase === 'down' || this.phase === 'roof') hud.setMeter(this.spotted, this.spotted > 0.01 ? 'IN THE DRONE\'S LIGHT! Crouch (C)' : inBeam ? 'Hidden' : '', 'var(--red)');
    if (this.spotted >= 1) this._caught('Spotted', 'The drone saw you on the gondola. When its light sweeps your way, crouch (C) below the rail.');
  }

  _windowCut() {
    const s = this.state, L = this.level, hud = s.game.hud;
    L.windowBox.disabled = true;
    L.glass.visible = false;
    this.cut = 1;
    this.phase = 'tiles';
    this.cp = 2;
    hud.setMeter(0, '');
    audio.sfx('checkpoint', { vol: 0.6 });
    hud.setObjective('Cross the pressure floor on the safe tiles, and grab the gold');
    hud.toast('You\'re in', 'Kitsu: "Don\'t step on the floor yet! It\'s pressure tiles. I\'ll show you the safe way across. Watch."', 'var(--cyan)', 4);
    this.showT = 0.01;
  }

  _showPath() {
    this.showT = 0.01;
    this.showCool = 8;
    audio.sfx('checkpoint', { vol: 0.3, rate: 1.4 });
  }

  /** The pressure floor: the path lights up (one tile after another), stepping on a wrong tile clicks. */
  _tiles(dt, input, hud) {
    const s = this.state, L = this.level, p = s.player, pos = p.pos;
    this.showCool = Math.max(0, this.showCool - dt);
    const n = this.path.length;
    const showFor = 3.2 + n * 0.22;
    if (this.showT > 0) {
      this.showT += dt;
      if (this.showT > showFor + 0.6) this.showT = 0;
    }
    if (this.redT > 0) this.redT -= dt;
    // which tile are you on?
    if (p.grounded && pos.y < BOTTOM + 0.3 && this.redT <= 0) {
      const c = Math.floor((pos.x - 8) / 2), r = Math.floor((pos.z + 388) / 2);
      if (c >= 0 && c < 6 && r >= 0 && r < 8) {
        const t = L.tiles[c * 8 + r];
        if (this.safe.has(`${c},${r}`)) {
          if (!t.stepped) { t.stepped = true; audio.sfx('step', { vol: 0.5, rate: 1.6 }); }
        } else if (!admin.flag('god')) {
          this.wrongSteps++;
          this.redT = 1;
          this.redTile = t;
          audio.sfx('alarm', { vol: 0.5 });
          this.cp = 2;
          const cp = L.checkpoints[2];
          s.placePlayer(cp.spawn, cp.yaw);
          for (const tt of L.tiles) tt.stepped = false;
          this.showT = 0.01;
          s.flash('Click!', 'Wrong tile! Kitsu reset the floor just in time. Watch the safe path again, and follow it exactly.', 'var(--amber)');
        }
      }
    }
    this._paintTiles(showFor);
    if (this.showT > 0) hud.setMeter(clamp(1 - this.showT / showFor, 0, 1), 'Remember the path!', '#4dffa6');
    else hud.setMeter(0, '');
  }

  _paintTiles(showFor) {
    const L = this.level;
    const order = new Map(this.path.map(([c, r], i) => [`${c},${r}`, i]));
    for (const t of L.tiles) {
      const key = `${t.c},${t.r}`;
      let col = 0x1a2a3a;
      if (this.phase === 'grabbed') col = 0x3a1018;
      else if (this.redT > 0 && t === this.redTile) col = 0xff2030;
      else if (this.showT > 0 && order.has(key) && this.showT > order.get(key) * 0.22 && this.showT < showFor) col = 0x4dffa6;
      else if (t.stepped) col = 0x1f5a44;
      t.m.material.color.setHex(col);
    }
  }

  _grab() {
    const s = this.state, L = this.level, hud = s.game.hud;
    this.gold = true;
    L.gold.visible = false;
    this.cp = 3;
    earn(s.game, GOLD_CASH, '', { quiet: true });
    audio.sfx('cash', { vol: 0.8 });
    this._alarmOn(false);
    this.phase = 'grabbed';
    this.alarmT = 0;
    this.guardsIn = 2.5;
    this._paintTiles(0);
    hud.setObjective('Out of the window and JUMP: the parachute opens by itself');
    hud.toast('ALARM!', 'Kitsu: "They know! Guards at the door, shutters coming down. I\'m sending the gondola up so they think you went to the roof. You\'re not going to the roof. Run for the window and JUMP!"', 'var(--red)', 7);
  }

  _alarmOn(quiet) {
    if (!quiet) audio.sfx('alarm');
    this.phase = 'grabbed';
    this.alarmLight.intensity = 10;
  }

  _alarm(dt, d, hud) {
    const s = this.state, p = s.player, pos = p.pos;
    this.alarmT += dt;
    this.alarmLight.intensity = 6 + Math.sin(this.alarmT * 10) * 6;
    const inside = pos.x < VAULT.x1 + 0.4 && pos.y > BOTTOM - 1;
    // the shutters come down
    const k = clamp(this.alarmT / (SHUTTER_TIME * d.timer), 0, 1);
    this.shutter.scale.y = Math.max(0.001, k);
    if (k >= 1 && inside) { this._caught('Shut in', 'The steel shutters came down over the window. As soon as you have the gold, run for the window and jump!'); return; }
    // the guards come in
    if (this.guardsIn > 0 && (this.guardsIn -= dt) <= 0) {
      for (const u of this.guards.units) u.model.root.visible = u.cone.visible = true;
      audio.sfx('clang', { vol: 0.8 });
    }
    if (this.guardsIn > 0) return;
    if (!inside) { for (const u of this.guards.units) u.cone.visible = false; return; }
    this.guards.update(dt, p, false);
    let near = false;
    for (const u of this.guards.units) if (!u.down && !(u.stunned > 0) && u.pc.pos.distanceTo(pos) < 1.3) near = true;
    this.grab = clamp(this.grab + (near ? dt / 0.6 : -dt), 0, 1);
    hud.setMeter(this.grab, this.grab > 0.01 ? 'THEY\'VE GOT HOLD OF YOU! Break free' : '', 'var(--red)');
    if (this.grab >= 1) this._caught('Caught', 'Kurogane\'s guards grabbed you. Punch your way past, or run round them, and jump out of the window.');
  }

  _parachute(dt, input, hud) {
    const s = this.state, L = this.level, p = s.player, pos = p.pos;
    if (!this.chuting && p.state === 'air' && p.vel.y < -6 && pos.y < BOTTOM - 3 && pos.y > 8) {
      this.chuting = true;
      this.landed = false;
      this.heading = p.facing;
      this.chuteSpeed = CHUTE;
      this.vy = p.vel.y;
      s.model.flying = 'chute';
      audio.sfx('whoosh', { vol: 1, rate: 0.7 });
      hud.setObjective('Steer the parachute down to Kitsu\'s orange van');
      hud.toast('Parachute!', 'A / D steer, W faster, S slower. Land by the orange van in the street.', '#ff7a2a', 4);
      for (const u of this.guards.units) u.cone.visible = false;
    }
    if (this.chuting) {
      const steer = input.axis('left', 'right'), pitchIn = input.axis('back', 'forward');
      this.heading -= steer * 1.3 * dt;
      const want = pitchIn > 0 ? CHUTE + (CHUTE_DIVE - CHUTE) * pitchIn : CHUTE + (CHUTE_FLARE - CHUTE) * -pitchIn;
      const sink = pitchIn > 0 ? CHUTE_SINK + (CHUTE_DIVE_SINK - CHUTE_SINK) * pitchIn : CHUTE_SINK + (CHUTE_FLARE_SINK - CHUTE_SINK) * -pitchIn;
      this.chuteSpeed = damp(this.chuteSpeed, want, 1.5, dt);
      this.vy = damp(this.vy, -sink, 2.5, dt);
      p.vel.set(Math.sin(this.heading) * this.chuteSpeed, this.vy, Math.cos(this.heading) * this.chuteSpeed);
      p.facing = this.heading;
      s.model.flyBank = damp(s.model.flyBank || 0, -steer * 0.5, 4, dt);
      s.cam.yaw = dampAngle(s.cam.yaw, this.heading + Math.PI, 2.5, dt);
      s.cam.distance = damp(s.cam.distance, 7, 2, dt);
      if (p.grounded || p.state === 'ground' || p.state === 'mantle') {
        this.chuting = false;
        this.landed = true;
        s.model.flying = null;
        s.model.flyBank = 0;
        p.vel.multiplyScalar(0.2);
        audio.sfx('land', { vol: 0.8 });
        if (pos.y < 2) hud.setObjective('Run to Kitsu\'s van');
        else hud.toast('On a roof', 'Run and jump off the edge: the parachute opens again.', 'var(--amber)', 4);
      }
    } else if (this.landed) s.cam.distance = damp(s.cam.distance, this.camDist || 4, 2, dt);
    // the van
    L.vanBeam.material.opacity = 0.12 + Math.sin(s.time * 3) * 0.04;
    if (this.landed && pos.y < 3 && Math.hypot(pos.x - L.vanSpot.x, pos.z - L.vanSpot.z) < 5.5) this._finish();
  }

  _updateMarker(inGondola) {
    const s = this.state, L = this.level, hud = s.game.hud, pos = s.player.pos;
    let t, label, color = 'var(--amber)';
    if (this.phase === 'roof' && !inGondola) { t = _v.set(GONDOLA_X, TOP + 1.5, GONDOLA_Z); label = 'The gondola'; }
    else if (this.phase === 'roof' || this.phase === 'down') { t = _v.set(GONDOLA_X, BOTTOM + 2.5, GONDOLA_Z); label = 'The vault window'; }
    else if (this.phase === 'window') { t = _v.set(KURO.x1, BOTTOM + 2.5, -380); label = 'Cut the glass'; color = 'var(--cyan)'; }
    else if (this.phase === 'tiles') { t = _v.set(L.pedestal.x, BOTTOM + 1.6, L.pedestal.z); label = 'The gold'; }
    else if (this.phase === 'grabbed' && pos.y > BOTTOM - 1 && pos.x < KURO.x1 + 0.5) { t = _v.set(KURO.x1, BOTTOM + 2, -380); label = 'The window: JUMP!'; color = 'var(--red)'; }
    else { t = _v.copy(L.vanSpot).setY(2); label = 'Kitsu\'s van'; color = 'var(--safe)'; }
    hud.setMarker(t, s.camera, label, color, Math.hypot(t.x - pos.x, t.z - pos.z));
  }

  _finish() {
    if (this.done) return;
    this.done = true;
    const s = this.state;
    s.setAction(null);
    s.model.flying = null;
    s.game.hud.setMeter(0, '');
    audio.sfx('win');
    finishPart(s, this);
  }

  adminSkip() { this._finish(); }

  teardown() {
    const s = this.state;
    s.setAction?.(null);
    if (s.model) { s.model.flying = null; s.model.setOutfit(null); }
    if (s.cam) { s.cam.roll = 0; if (this.camDist) s.cam.distance = this.camDist; }
    this.guards?.dispose();
  }
}

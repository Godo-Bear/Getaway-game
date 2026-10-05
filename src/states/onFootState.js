import * as THREE from 'three';
import { PlayState } from './playState.js';
import { PlayerController } from '../player/playerController.js';
import { PlayerModel } from '../player/playerModel.js';
import { FirstPersonArms } from '../player/firstPersonArms.js';
import { save } from '../core/save.js';
import { currentLook, faceShowing } from '../player/outfits.js';
import { showLookEditor } from '../ui/customise.js';
import { audio } from '../core/audio.js';
import { ThirdPersonCamera } from '../core/thirdPersonCamera.js';
import { NightLighting, lightingForQuality, pickTime } from '../world/lighting.js';
import { Weather, pickWeather } from '../world/weather.js';
import { FootGadgets } from '../gadgets/footGadgets.js';
import { ParticleSystem } from '../vehicles/particles.js';
import { owns, earn } from '../gadgets/gadgets.js';
import { CoinThrow } from '../player/coins.js';
import { diff } from '../core/difficulty.js';
import { admin } from '../core/admin.js';
import { CONTROLS } from '../ui/menus.js';
import { damp, clamp } from '../core/utils.js';
import { FreeRunMode } from './modes/freeRunMode.js';
import { RooftopRunMode } from './modes/rooftopRunMode.js';
import { ChapterFootMode } from './modes/chapterFootMode.js';
import { BankHeistMode } from './modes/bankHeistMode.js';
import { CasinoHeistMode } from './modes/casinoHeistMode.js';
import { CustomLevelMode } from './modes/customLevelMode.js';
import { TrainMode } from './modes/trainMode.js';
import { PrisonMode } from './modes/prisonMode.js';
import { GlacierMode } from './modes/glacierMode.js';

// On-foot game state: everything the on-foot modes have in common.
//   - the player (physics + animated model) and the third-person camera
//   - turning keyboard/mouse input into movement
//   - falling to the street (walk to a ladder to climb back up), falling
//     into the water (respawn), and remembering safe places to respawn
//
// What you're actually DOING on the rooftops is decided by a "mode" object:
//   free     -> FreeRunMode         (explore, practise)
//   survival -> RooftopRunMode      (endless helicopter chase, score)
//   story    -> ChapterFootMode     (story level: checkpoints, clues, goals)
//   heist    -> BankHeistMode       (Chapter 1's opening, inside the bank)
//
// A mode can implement:
//   build()          -> { group, world, spawn }  the level to play in
//   hudSections      -> which HUD parts to show
//   start()          -> (re)start the run
//   update(dt)       -> per-frame game logic
//   onFall()         -> the player fell into the water / off the map
//   onRespawnKey()   -> the player pressed R
//   teardown()

const MODES = { free: FreeRunMode, survival: RooftopRunMode, story: ChapterFootMode, chapter1: ChapterFootMode, heist: BankHeistMode, casino: CasinoHeistMode, custom: CustomLevelMode, train: TrainMode, prison: PrisonMode, glacier: GlacierMode };

export class OnFootState extends PlayState {
  constructor(game) {
    super(game, { needsPointerLock: true });
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this.ctl = {
      moveX: 0, moveZ: 0, jumpPressed: false, jumpHeld: false, sprint: false,
      camForward: this._fwd, camRight: this._right,
    };
  }

  buildWorld(params) {
    const game = this.game;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 900);
    this.lighting = new NightLighting(this.scene, lightingForQuality(game.settings.graphics));

    const ModeClass = MODES[params.mode] || FreeRunMode;
    this.mode = new ModeClass(this, params);
    this.level = this.mode.build();
    this.scene.add(this.level.group);
    this.world = this.level.world;

    this.player = new PlayerController(this.world);
    this.player.ladders = this.level.ladders || [];
    // Movement gadgets from the Shop (always on once bought)
    this.player.canGlide = owns('glider');
    this.player.jumpScale = owns('springs') ? 1.2 : 1;
    this.player.wallRunScale = owns('grips') ? 2 : 1;
    this.model = new PlayerModel();
    this.model.setLook(currentLook(game.settings));
    this.scene.add(this.model.root);
    this.mode.afterBuild?.();
    this.gadgets = new FootGadgets(this); // shop gadgets (F)
    // Time of day (the story part decides; otherwise the Time of day setting)
    const tod = pickTime(game.settings, this.mode.time);
    this.lighting.setTime(tod.hour);
    this.timeCycle = tod.cycle;
    // Rain / storm (the story part decides; the Weather setting can override)
    this.weather = new Weather(this.scene, this.lighting, game.post, { kind: pickWeather(game.settings, this.mode.weather), quality: game.settings.graphics });
    // In the cold, everyone's breath clouds; chimneys smoke over the rooftops
    this.cold = this.weather.kind === 'snow' || this.weather.kind === 'blizzard';
    this.chimneys = this.level?.chimneys || null;
    this.puffs = this.cold || this.chimneys?.length ? new ParticleSystem(this.scene, 900) : null;
    this.chimneyT = 0;
    // Coins to throw: the guards who hear one land go to look
    this.coins = new CoinThrow(this.scene, this.world, (pos) => this._coinLanded(pos));
    this.cam = new ThirdPersonCamera(this.camera, this.world);
    const s = game.settings;
    this.cam.sensitivity = 0.0022 * s.mouseSensitivity;
    this.cam.invertY = s.invertY;
    if (s.footZoom) this.cam.distance = this.cam.currentDistance = s.footZoom;
    // First-person arms hang off the camera, so the camera joins the scene.
    this.scene.add(this.camera);
    this.arms = new FirstPersonArms(this.camera);
    this.arms.setColors(this.model.colors, this.model.style);
    this.model.onLook = (colors, style) => this.arms.setColors(colors, style); // (disguises, Your look)
    this.setFirstPerson(!!s.firstPerson);

    this.sprintOn = false;
    this._showHud();
    game.hud.showControls(game.input.pointerLockFailed ? CONTROLS.onFootNoLock : CONTROLS.onFoot);
    this.firstStart = true;
    this.restart();
  }

  _showHud() {
    const cross = this.game.settings.crosshair !== false;
    this.game.hud.show(cross ? [...this.mode.hudSections, 'cross'] : this.mode.hudSections);
  }

  /** Switch view: first person hides the body and shows the arms. */
  setFirstPerson(on) {
    this.cam.setFirstPerson(on);
    this.model.root.visible = !on;
    this.arms.setVisible(on);
  }

  toggleView() {
    const on = !this.cam.firstPerson;
    this.setFirstPerson(on);
    this.game.settings.firstPerson = on;
    save.write();
    this.game.hud.toast(on ? 'First person' : 'Third person', 'Press V to switch view.', 'var(--cyan)');
  }

  /** Reset the run (also used by "Try again"). */
  restart() {
    this.time = 0;
    this.falls = 0;
    this.safePositions = [];
    this.safeTimer = 0;
    this.game.hud.setMeter(0, '');
    this.game.hud.setMarker(null);
    const sp = this.level.spawn;
    this.placePlayer(sp, sp.yaw ?? 0);
    this.gadgets.reset();
    this.mode.start(this.firstStart);
    this.firstStart = false;
    // The chimneys are already smoking when you arrive
    if (this.puffs && this.chimneys?.length) {
      this.puffs.clear();
      for (let i = 0; i < 360; i++) { this._chimneyPuffs(1 / 60); this.puffs.update(1 / 60); }
    }
  }

  /**
   * Put the player at `pos`, with the camera looking along `yaw`
   * (yaw 0 = looking north / -Z).
   */
  placePlayer(pos, yaw = 0) {
    // The model faces +Z at facing 0, the camera looks -Z at yaw 0,
    // so the model's facing is the camera yaw + PI.
    this.player.teleport(pos.x, pos.y, pos.z, yaw + Math.PI);
    this.cam.snapBehind(yaw);
  }

  // ------------------------------------------------------------------
  // Input -> control struct (once per frame, before the physics steps)
  // ------------------------------------------------------------------
  readInput(dt) {
    const input = this.game.input;
    const c = this.ctl;
    // Admin: super speed and Rocket Boots (can change mid-game from the pause menu)
    this.player.speedScale = admin.flag('superSpeed') ? 1.6 : 1;
    this.player.jumpScale = (owns('springs') ? 1.2 : 1) * (admin.flag('moonJump') ? 1.9 : 1);
    if (admin.flag('alwaysGlide')) this.player.canGlide = true;
    this.model.head.scale.setScalar(admin.flag('bigHead') ? 2.1 : 1);
    this.player.canRocket = owns('rocket');
    const mouse = input.consumeMouse();
    this.cam.applyMouse(mouse.x, mouse.y);
    this.cam.applyTurn(input.axis('turnLeft', 'turnRight'), dt); // arrows / Q E

    c.moveZ = input.axis('back', 'forward');
    if (input.pointerLocked || input.noMouseNeeded) {
      // Mouse lock, gamepad or touch: left/right strafes, the camera turns separately.
      c.moveX = input.axis('left', 'right');
    } else {
      // No mouse lock: A/D turn instead of strafing.
      c.moveX = 0;
      this.cam.applyTurn(input.axis('left', 'right'), dt);
    }
    c.jumpPressed = input.wasPressed('jump');
    c.jumpHeld = input.isDown('jump');
    // Sprint: tap once to keep sprinting, tap again to stop (or hold it,
    // if "Sprint stays on" is switched off in Settings).
    if (this.game.settings.sprintToggle !== false) {
      if (input.wasPressed('sprint')) this.sprintOn = !this.sprintOn;
      c.sprint = this.sprintOn;
    } else {
      this.sprintOn = false;
      c.sprint = input.isDown('sprint');
    }
    this.game.hud.setSprint(this.sprintOn);
    this.game.touch?.setOn?.('b', this.sprintOn);
    c.crouch = input.isDown('crouch');
    this.cam.getForward(this._fwd);
    this.cam.getRight(this._right);
    // A mini-game (hacking, a safe) is on: stand still, Jump is for the mini-game.
    if (this.mode.inputLocked) {
      c.moveX = c.moveZ = 0;
      c.jumpPressed = c.jumpHeld = false;
      c.crouch = false;
    }

    if (input.wasPressed('view')) this.toggleView();
    if (input.wasPressed('respawn')) this.respawnKey();
    if (input.wasPressed('gadget')) this.gadgets.use();

    // Scroll wheel / pinch: move the camera closer or further away (remembered).
    const zoom = input.consumeZoom();
    if (zoom && !this.cam.firstPerson) {
      this.cam.distance = clamp(this.cam.distance * (1 + zoom * 0.15), 1.8, 11);
      this.game.settings.footZoom = this.cam.distance;
      this._zoomSave = 1; // written to the save a moment later (not every scroll tick)
    }
    if (this._zoomSave > 0 && (this._zoomSave -= dt) <= 0) save.write();
  }

  get respawnLabel() {
    return this.mode.onRespawnKey ? 'Back to the last checkpoint' : 'Back to safety';
  }

  respawnKey() {
    if (this.mode.onRespawnKey) this.mode.onRespawnKey();
    else this.respawnToSafety('Back to safety.');
  }

  simulate(dt) {
    this.player.update(dt, this.ctl);
    this.ctl.jumpPressed = false; // a press only counts for one physics step
  }

  frameUpdate(dt, frozen) {
    const p = this.player;
    const hud = this.game.hud;

    // React to movement events (landing dip etc.)
    for (const e of p.events) {
      if (e.type === 'land' && e.impact > 6) {
        this.cam.addLandingDip(e.impact);
        audio.sfx('land', { vol: Math.min(1, e.impact / 18) });
      } else if (e.type === 'land' && e.impact > 2) audio.sfx('step');
      if (e.type === 'jump') audio.sfx('jump');
      if (e.type === 'vault' || e.type === 'mantle') audio.sfx('step', { vol: 1.2 });
      if (e.type === 'slide') audio.sfx('whoosh', { vol: 0.5 });
      if (e.type === 'wallrun' || e.type === 'walljump') audio.sfx('step', { vol: 1.3 });
      if (e.type === 'zip') audio.sfx('whoosh', { vol: 0.8 });
      if (e.type === 'glide') audio.sfx('whoosh', { vol: 0.7 });
      if (e.type === 'zipEnd') audio.sfx('land', { vol: 0.5 });
      if (e.type === 'roll') {
        hud.toast('Roll!', '', 'var(--cyan)');
        audio.sfx('whoosh', { vol: 0.6 });
      }
    }
    p.events.length = 0;

    if (!frozen) {
      this.time += dt;
      this._trackSafety(dt);
      if (p.pos.y < (this.mode.fallY ?? -1.5)) { // (a mode can allow a long drop, e.g. gliding off a mountain)
        // In the water (or off the edge of the world): back to safety.
        this.falls++;
        if (this.mode.onFall) this.mode.onFall();
        else this.respawnToSafety('You fell.');
      }
      this.gadgets.update(dt);
      this.mode.update(dt);
      this._punch();
      this._throwCoin();
      this.coins.update(dt);
      this._fightExtras();
      this._streetHelp(dt);
    }
    const m = this.mode;
    this.game.touch?.setCoin(!!(m.guards || m.patrols || m.mailGuard) && !m.inputLocked, this.coins.ready);

    this.model.update(frozen ? 0 : dt, p);
    this._updatePuffs(frozen ? 0 : dt);
    // On snow, every footstep crunches (one step per half stride)
    if (audio.surface === 'snow') {
      const step = Math.floor(this.model.runPhase / Math.PI);
      if (step !== this._lastStep) {
        this._lastStep = step;
        if (!frozen && p.state === 'ground' && p.horizontalSpeed > 1.2) audio.sfx('snowstep', { vol: Math.min(1, 0.45 + p.horizontalSpeed / 14) });
      }
    }
    // Head bob in first person: follows the running cycle of the (hidden) body.
    const running = p.state === 'ground' && p.horizontalSpeed > 0.5 && !frozen;
    const bobTarget = running ? Math.abs(Math.sin(this.model.runPhase)) * 0.06 * Math.min(1, p.horizontalSpeed / 8) - 0.03 : 0;
    this.cam.bob = damp(this.cam.bob, bobTarget, 20, dt);
    this.cam.update(dt, p.pos, p.horizontalSpeed);
    this.arms.update(frozen ? 0 : dt, p, this.model.runPhase);
    this.lighting.follow(p.pos);
    if (!frozen) this.tickTimeOfDay(dt);
    if (!frozen) this.weather.update(dt, this.camera.position);

    if (this.game.showDebug) {
      hud.setDebug(`${this.game.fps.toFixed(0)} fps\n${p.state} ${p.horizontalSpeed.toFixed(1)} m/s\n` +
        `pos ${p.pos.x.toFixed(1)} ${p.pos.y.toFixed(1)} ${p.pos.z.toFixed(1)}\n` +
        `calls ${this.game.renderer.info.render.calls}`);
    } else hud.setDebug('');
  }

  /** Looping sounds for this frame: rooftop wind + whatever the mode adds. */
  audioMix() {
    const p = this.player;
    const high = Math.min(1, Math.max(0, (p.pos.y - 8) / 16));
    audio.windSpeed(0);
    return {
      wind: high * 0.03,
      city: 0.05 + (1 - high) * 0.08,
      music: 0.35,
      intensity: 0.25,
      ...(this.mode.audioMix?.() ?? {}),
    };
  }

  /** Settings changed in the pause menu: apply what can change live. */
  applySettings() {
    const s = this.game.settings;
    this.cam.sensitivity = 0.0022 * s.mouseSensitivity;
    this.cam.invertY = s.invertY;
    if (!!s.firstPerson !== this.cam.firstPerson) this.setFirstPerson(!!s.firstPerson);
    this._showHud();
  }

  /** Remember recent positions on solid roofs so a fall can send you back. */
  /** Down on the street? Point at the nearest ladder so you can climb back up. */
  _streetHelp(dt) {
    const p = this.player;
    const onStreet = !this.mode.indoors && p.pos.y < 1.5 && (p.grounded || p.state === 'ladder');
    if (!onStreet) {
      this._streetTipShown = false;
      if (this._streetMarker) { this._streetMarker = false; this.game.hud.setMarker(null); }
      return;
    }
    if (!this._streetTipShown && p.state !== 'ladder') {
      this._streetTipShown = true;
      this.game.hud.toast('Down on the street', 'Every building has a yellow ladder. Walk into it and hold forward to climb back up (or press R).', 'var(--cyan)', 5);
    }
    if (p.state === 'ladder' || this.mode.streetMarker) return;
    let best = null, bd = Infinity;
    for (const L of p.ladders) {
      const d = Math.hypot(L.x - p.pos.x, L.z - p.pos.z);
      if (d < bd) { bd = d; best = L; }
    }
    if (best) {
      this._ladderTarget = this._ladderTarget || new THREE.Vector3();
      this._ladderTarget.set(best.x + best.nx * 0.5, best.y0 + 2.5, best.z + best.nz * 0.5);
      this.game.hud.setMarker(this._ladderTarget, this.camera, 'Ladder', 'var(--amber)', bd);
      this._streetMarker = true;
    }
  }

  _trackSafety(dt) {
    const p = this.player;
    this.safeTimer -= dt;
    if (p.grounded && p.state === 'ground' && p.pos.y > 10 && this.safeTimer <= 0) {
      this.safeTimer = 0.4;
      this.safePositions.push({ pos: p.pos.clone(), facing: p.facing });
      if (this.safePositions.length > 8) this.safePositions.shift();
    }
  }

  /** Respawn ~1.5 s back along your path (so you don't land on the edge again). */
  respawnToSafety(message) {
    const list = this.safePositions;
    const entry = list.length > 3 ? list[list.length - 4] : list[0];
    if (entry) this.placePlayer(entry.pos.clone().setY(entry.pos.y + 0.05), entry.facing - Math.PI);
    else this.placePlayer(this.level.spawn, this.level.spawn.yaw ?? 0);
    this.safePositions.length = Math.max(0, list.length - 3);
    this.flash('Back to safety', message);
  }

  /** Quick fade + message, used for any respawn. */
  /** A laser was touched: alarm bell, the screen edges pulse red for a moment. */
  laserAlarm() {
    audio.sfx('alarm');
    document.body.classList.add('alarm-on');
    clearTimeout(this._alarmT);
    this._alarmT = setTimeout(() => document.body.classList.remove('alarm-on'), 2300);
  }

  /** In everyday clothes (not the balaclava)? Street patrols notice you later. */
  get streetClothes() {
    return faceShowing(currentLook(this.game.settings));
  }

  /** Pause menu: change your look. */
  pauseButtons() {
    const marker = this.game.hud.markerPos;
    return [
      { label: 'Your look', sub: 'Face, hair and clothes', onClick: () => this.showWardrobe() },
      ...(admin.on && marker ? [{ label: 'Admin: teleport to the marker', sub: 'Jump straight to the objective', onClick: () => { this.resume(); this.adminTeleport(marker); } }] : []),
    ];
  }

  /** Admin: straight to the objective marker (it floats a little above the spot). */
  adminTeleport(m) {
    const top = this.world.groundHeight(m.x, m.z, m.y + 0.5);
    const y = Number.isFinite(top) && top > m.y - 6 ? top + 0.05 : m.y - 1.2;
    this.player.zip = null;
    this.placePlayer(new THREE.Vector3(m.x, y, m.z), this.cam.yaw);
    if (this.game.speedrun) this.game.speedrun.adminUsed = true;
  }

  /**
   * Punch (left click, B, RT, or the Punch button on a phone) whoever is in
   * front of you. A guard hit from behind is knocked out; from the front
   * they're stunned for a moment (hit them again to knock them down).
   * Rooftop police go down for a few seconds; people on the street fall
   * over and get back up.
   */
  _punch() {
    const p = this.player, hud = this.game.hud;
    if (!this.game.input.wasPressed('punch') || this.mode.inputLocked || this.model.punchT > 0.12) return;
    if (p.state !== 'ground' && p.state !== 'air') return;
    // Punches in quick succession make a combo: jab, cross, then a big UPPERCUT
    const now = performance.now() / 1000;
    this.combo = this.combo && now - this.comboAt < 0.7 ? (this.combo % 3) + 1 : 1;
    this.comboAt = now;
    const heavy = this.combo === 3;
    this.model.punch(['jab', 'cross', 'upper'][this.combo - 1]);
    audio.sfx('whoosh', { vol: heavy ? 0.6 : 0.45 });
    const fx = Math.sin(p.facing), fz = Math.cos(p.facing);
    const reach = (heavy ? 2 : 1.8) + Math.min(0.8, p.horizontalSpeed * 0.08); // (a running punch reaches further)
    const inFront = (q) => {
      const dx = q.x - p.pos.x, dz = q.z - p.pos.z, d = Math.hypot(dx, dz);
      return d < reach && Math.abs(q.y - p.pos.y) < 1.3 && (d < 0.6 || (dx * fx + dz * fz) / d > 0.5);
    };
    const hit = (big = heavy) => { audio.sfx(big ? 'uppercut' : 'land', { vol: 1 }); this.cam.addLandingDip?.(big ? 7 : 4); };
    const m = this.mode;
    // Guards, police patrols, bounty hunters (they sometimes block)
    for (const sq of [m.guards, m.patrols, m.mailGuard].filter(Boolean)) {
      for (const u of sq.units) {
        if (u.down || !inFront(u.pc.pos)) continue;
        const r = sq.punched(u, { behind: sq.isBehind(u, p.pos), heavy, blockChance: diff().guardBlock ?? 0.35 });
        if (r === 'block') {
          audio.sfx('block');
          this.cam.addLandingDip?.(2);
          this.blocked = (this.blocked || 0) + 1;
          hud.toast('Blocked!', this.blocked <= 2 ? 'Throw three quick punches: the uppercut at the end breaks through. Or get behind them.' : '', 'var(--amber)', this.blocked <= 2 ? 3.5 : 1.2);
          return;
        }
        hit(heavy || r === 'break');
        if (r === 'ko') hud.toast(heavy ? 'Uppercut! Out cold' : 'Knocked out!', 'Keep moving: if someone finds them, everyone goes on alert.', 'var(--amber)', 3);
        else if (r === 'break') hud.toast('Guard broken!', 'They\'re dazed: hit them again.', 'var(--amber)', 2.5);
        else hud.toast('Stunned!', 'Hit them again before they shake it off.', 'var(--amber)', 2.5);
        return;
      }
    }
    // Rooftop police chasing you
    if (m.officers && m.officers !== m.guards && m.officers !== m.patrols) { // (some modes call their guards "officers" for the gadgets)
      for (const u of m.officers.units) {
        if (u.waitTimer > 0 || !u.model.root.visible || !inFront(u.pc.pos)) continue;
        hit();
        u.stunned = 3;
        u.floored = true;
        u.model.knockDown({ upIn: 1.9 });
        hud.toast('Officer down!', 'Run: they\'ll be back up in a few seconds.', 'var(--amber)', 2.5);
        return;
      }
    }
    // People on the street
    if (m.crowd) {
      for (const c of m.crowd.people) {
        if (c.knock > 0 || !inFront(c.body.pos)) continue;
        hit();
        m.crowd.knockDown(c, fx, fz);
        return;
      }
    }
  }

  /** Throw a coin where you're looking (right click, Z, LT, or the Coin button). */
  _throwCoin() {
    if (!this.game.input.wasPressed('throw') || this.mode.inputLocked || !this.coins.ready) return;
    const p = this.player;
    if (!['ground', 'air', 'crouch', 'slide'].includes(p.state)) return; // (not while climbing or on a zip line)
    const dir = this.camera.getWorldDirection(this._aim || (this._aim = new THREE.Vector3()));
    const from = this._throwFrom || (this._throwFrom = new THREE.Vector3());
    if (this.cam.firstPerson) {
      from.copy(this.camera.position).addScaledVector(dir, 0.4);
      from.y -= 0.2;
    } else {
      // Turn to face the throw and toss it from the right hand
      p.facing = Math.atan2(dir.x, dir.z);
      this.model.punch('cross');
      from.set(p.pos.x + dir.x * 0.5, p.pos.y + 1.45, p.pos.z + dir.z * 0.5);
    }
    this.coins.throw(from, dir);
  }

  /** A coin landed: every guard who heard it goes to look. */
  _coinLanded(pos) {
    const m = this.mode;
    let heard = 0;
    for (const sq of [m.guards, m.patrols, m.mailGuard]) if (sq?.hear) heard += sq.hear(pos);
    m.crowd?.hear(pos); // (people nearby look round at it too)
    if (heard && !this.coinTip) {
      this.coinTip = true;
      this.game.hud.toast(heard === 1 ? 'Someone heard it' : `${heard} of them heard it`, 'They\'re going to look. Sneak past while they\'re busy, or come up behind them.', 'var(--amber)', 3.5);
    }
  }

  /**
   * The rest of the fighting: a guard who blocked your punch shoves you
   * back; sliding into someone knocks them off their feet (slide tackle);
   * and behind someone in the street you can pickpocket them (E).
   */
  _fightExtras() {
    const p = this.player, hud = this.game.hud, m = this.mode;
    const squads = [m.guards, m.patrols, m.mailGuard].filter(Boolean);
    for (const sq of squads) {
      const u = sq.shove;
      if (!u) continue;
      sq.shove = null;
      const dx = p.pos.x - u.pc.pos.x, dz = p.pos.z - u.pc.pos.z, d = Math.hypot(dx, dz);
      if (d < 2.4 && d > 0.01) {
        p.vel.x += (dx / d) * 6;
        p.vel.z += (dz / d) * 6;
        audio.sfx('block', { vol: 0.8 });
        this.cam.addLandingDip?.(3);
      }
    }
    // Slide tackle
    if (p.state === 'slide' && p.horizontalSpeed > 4) {
      const fx = Math.sin(p.facing), fz = Math.cos(p.facing);
      const ahead = (q) => {
        const dx = q.x - p.pos.x, dz = q.z - p.pos.z, d = Math.hypot(dx, dz);
        return d < 1.3 && Math.abs(q.y - p.pos.y) < 1.2 && (d < 0.5 || (dx * fx + dz * fz) / d > 0.3);
      };
      for (const sq of squads) {
        for (const u of sq.units) {
          if (u.down || u.trip > 0 || !ahead(u.pc.pos)) continue;
          const r = sq.trip(u, sq.isBehind(u, p.pos));
          audio.sfx('land', { vol: 1 });
          this.cam.addLandingDip?.(5);
          hud.toast(r === 'ko' ? 'Slide tackle! Out cold' : 'Slide tackle!', r === 'ko' ? '' : 'They\'re down: hit them before they get up.', 'var(--amber)', 2.5);
        }
      }
      if (m.crowd) {
        for (const c of m.crowd.people) if (!(c.knock > 0) && ahead(c.body.pos)) { m.crowd.knockDown(c, fx, fz); audio.sfx('land', { vol: 0.8 }); }
      }
      if (m.officers && m.officers !== m.guards && m.officers !== m.patrols) {
        for (const u of m.officers.units) {
          if (u.waitTimer > 0 || u.floored || !u.model.root.visible || !ahead(u.pc.pos)) continue;
          u.stunned = 3;
          u.floored = true;
          u.model.knockDown({ upIn: 1.9 });
          audio.sfx('land', { vol: 1 });
          hud.toast('Slide tackle!', 'Officer down. Run!', 'var(--amber)', 2.5);
        }
      }
    }
    // Pickpocket: walk (don't sprint) up behind someone in the street
    this.pickTarget = null;
    if (m.crowd && p.state === 'ground' && p.horizontalSpeed < 6 && !m.inputLocked) {
      for (const c of m.crowd.people) {
        if (c.robbed || c.knock > 0) continue;
        const q = c.body.pos, dx = p.pos.x - q.x, dz = p.pos.z - q.z, d = Math.hypot(dx, dz);
        if (d > 1.6 || Math.abs(p.pos.y - q.y) > 1.2) continue;
        let a = Math.atan2(dx, dz) - c.body.facing;
        while (a > Math.PI) a -= Math.PI * 2;
        while (a < -Math.PI) a += Math.PI * 2;
        if (Math.abs(a) > 1.9) { this.pickTarget = c; break; }
      }
    }
    super.setAction(this._modeAction ?? (this.pickTarget ? 'Pickpocket' : null));
    if (this.pickTarget && this._modeAction == null && this.game.input.wasPressed('interact')) this._pickpocket(this.pickTarget);
  }

  /** Lift a wallet: a little cash, and the police come running if they saw you. */
  _pickpocket(c) {
    const m = this.mode;
    m.crowd.robbed(c);
    this.model.reach();
    const got = earn(this.game, 10 + Math.round(Math.random() * 12) * 5, '', { quiet: true });
    audio.sfx('cash', { vol: 0.5 });
    this.game.hud.toast(`Pickpocketed! +$${got}`, 'A wallet for the Shop. Don\'t let the police see you do it.', 'var(--safe)', 2.5);
    for (const sq of [m.patrols, m.guards].filter(Boolean)) if (sq.units.some((u) => u.seesPlayer)) sq.alarmAt(this.player.pos);
  }

  /** Modes show their action (Knock out, ...); with none, behind someone it's Pickpocket. */
  setAction(label) {
    this._modeAction = label;
    super.setAction(label ?? (this.pickTarget ? 'Pickpocket' : null));
  }

  /** Your look: mix and match, shown live on your character (and in the card's preview). */
  showWardrobe() {
    const back = () => { document.body.classList.remove('wardrobe'); this.paused = false; this.pause(); };
    this.player.facing = Math.atan2(this.camera.position.x - this.player.pos.x, this.camera.position.z - this.player.pos.z);
    this.model.update(0, this.player);
    document.body.classList.add('wardrobe'); // (hides the controls help; the card shows a preview of you)
    showLookEditor(this.game, back, (look) => { this.model.setLook(look); this.mode.onLookChanged?.(); });
  }

  flash(title, message, color = 'var(--cyan)') {
    const hud = this.game.hud;
    hud.toast(title, message, color);
    hud.setFade(true);
    setTimeout(() => hud.setFade(false), 120);
  }

  renderFrame(renderer) {
    this.game.post.render(this.scene, this.camera, this.game.dt);
  }

  resize(w, h) {
    if (!this.camera) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** What the police should chase: the player, or a holo-decoy if one is out. */
  get policeTarget() {
    return this.gadgets?.lure || this.player;
  }

  /** Hidden by a smoke bomb right now? */
  get concealed() {
    return !!this.gadgets?.concealed;
  }

  /** Everyone whose breath shows in the cold: you, the crew, guards, police, the crowd. */
  _breathers() {
    const m = this.mode, out = [this.model];
    const add = (list, get) => { if (list) for (const x of list) { const pm = get(x); if (pm?.head) out.push(pm); } };
    add(m.npcs, (n) => n.model);
    add(m.patrols?.units, (u) => u.model);
    add(m.guards?.units, (u) => u.model);
    add(m.officers?.units, (u) => u.model);
    add(m.crowd?.people, (c) => c.model);
    for (const extra of [m.juno, m.ricky]) if (extra?.head) out.push(extra);
    return out;
  }

  /** Breath clouds (in the snow) and chimney smoke. */
  _updatePuffs(dt) {
    if (!this.puffs) return;
    this.puffs.update(dt);
    this.puffs.setDaylight(this.lighting.daylight);
    if (!dt) return;
    const cam = this.camera.position;
    if (this.cold) {
      const v = this._puffV ||= new THREE.Vector3();
      for (const pm of this._breathers()) {
        const r = pm.root;
        if (!r.visible || (pm === this.model && this.cam.firstPerson)) continue;
        const dx = r.position.x - cam.x, dz = r.position.z - cam.z;
        if (dx * dx + dz * dz > 1600) continue;
        pm.breathT = (pm.breathT ?? Math.random() * 2) - dt;
        if (pm.breathT > 0) continue;
        const fast = pm === this.model && this.player.horizontalSpeed > 7;
        pm.breathT = (fast ? 0.65 : 1.7) + Math.random() * 0.8;
        pm.head.localToWorld(v.set(0, 0.14, 0.2)); // (just in front of the mouth)
        const f = r.rotation.y, fx = Math.sin(f), fz = Math.cos(f);
        this.puffs.emit(v.x, v.y, v.z, { vx: fx * 0.5, vy: 0.12, vz: fz * 0.5, size: 0.24, grow: 1.1, life: 1.5, alpha: 0.5,
          color: [0.94, 0.96, 1], drag: 1.2, fadeIn: 0.08 });
      }
    }
    if (this.chimneys?.length) this._chimneyPuffs(dt);
  }

  /** Chimney smoke: the chimneys near you puff now and then. */
  _chimneyPuffs(dt) {
    this.chimneyT += dt;
    if (this.chimneyT < 0.12) return;
    this.chimneyT = 0;
    const c = this.player.pos;
    for (const ch of this.chimneys) {
      if (Math.abs(ch[0] - c.x) > 140 || Math.abs(ch[2] - c.z) > 140 || Math.random() > 0.3) continue;
      this.puffs.emit(ch[0] + (Math.random() - 0.5) * 0.4, ch[1] + 0.2, ch[2] + (Math.random() - 0.5) * 0.4, {
        vx: 0.6 + Math.random() * 0.4, vy: 1.0 + Math.random() * 0.5, vz: 0.25, size: 1.2, grow: 1.9, life: 6, alpha: 0.36,
        color: [0.7, 0.72, 0.76], drag: 0.15, fadeIn: 0.8 });
    }
  }

  teardown() {
    document.body.classList.remove('wardrobe'); // (in case you left from the wardrobe)
    this.puffs?.dispose();
    this.puffs = null;
    this.coins?.dispose();
    this.coins = null;
    this.pickTarget = null;
    this.game.touch?.setCoin(false);
    this.gadgets?.dispose();
    this.weather?.dispose();
    this.weather = null;
    this.mode?.teardown?.();
    this.scene?.traverse((o) => {
      if (o.geometry && !o.isInstancedMesh) o.geometry.dispose();
    });
    this.scene = null;
    this.game.hud.hideAll();
  }
}

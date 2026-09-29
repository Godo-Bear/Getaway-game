import * as THREE from 'three';
import { PlayState } from './playState.js';
import { PlayerController } from '../player/playerController.js';
import { PlayerModel } from '../player/playerModel.js';
import { FirstPersonArms } from '../player/firstPersonArms.js';
import { save } from '../core/save.js';
import { audio } from '../core/audio.js';
import { ThirdPersonCamera } from '../core/thirdPersonCamera.js';
import { NightLighting, lightingForQuality } from '../world/lighting.js';
import { Weather, pickWeather } from '../world/weather.js';
import { CONTROLS } from '../ui/menus.js';
import { damp } from '../core/utils.js';
import { FreeRunMode } from './modes/freeRunMode.js';
import { RooftopRunMode } from './modes/rooftopRunMode.js';
import { ChapterFootMode } from './modes/chapterFootMode.js';

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
//
// A mode can implement:
//   build()          -> { group, world, spawn }  the level to play in
//   hudSections      -> which HUD parts to show
//   start()          -> (re)start the run
//   update(dt)       -> per-frame game logic
//   onFall()         -> the player fell into the water / off the map
//   onRespawnKey()   -> the player pressed R
//   teardown()

const MODES = { free: FreeRunMode, survival: RooftopRunMode, story: ChapterFootMode, chapter1: ChapterFootMode };

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
    this.model = new PlayerModel();
    this.scene.add(this.model.root);
    this.mode.afterBuild?.();
    // Rain / storm (the story part decides; the Weather setting can override)
    this.weather = new Weather(this.scene, this.lighting, game.post, { kind: pickWeather(game.settings, this.mode.weather), quality: game.settings.graphics });
    this.cam = new ThirdPersonCamera(this.camera, this.world);
    const s = game.settings;
    this.cam.sensitivity = 0.0022 * s.mouseSensitivity;
    this.cam.invertY = s.invertY;
    // First-person arms hang off the camera, so the camera joins the scene.
    this.scene.add(this.camera);
    this.arms = new FirstPersonArms(this.camera);
    this.setFirstPerson(!!s.firstPerson);

    game.hud.show(this.mode.hudSections);
    game.hud.showControls(game.input.pointerLockFailed ? CONTROLS.onFootNoLock : CONTROLS.onFoot);
    this.firstStart = true;
    this.restart();
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
    this.mode.start(this.firstStart);
    this.firstStart = false;
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
    c.sprint = input.isDown('sprint');
    c.crouch = input.isDown('crouch');
    this.cam.getForward(this._fwd);
    this.cam.getRight(this._right);

    if (input.wasPressed('view')) this.toggleView();
    if (input.wasPressed('respawn')) this.respawnKey();
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
      if (p.pos.y < -1.5) {
        // In the water (or off the edge of the world): back to safety.
        this.falls++;
        if (this.mode.onFall) this.mode.onFall();
        else this.respawnToSafety('You fell.');
      }
      this.mode.update(dt);
      this._streetHelp(dt);
    }

    this.model.update(frozen ? 0 : dt, p);
    // Footsteps: one every half cycle of the running animation.
    const stepIndex = Math.floor(this.model.runPhase / Math.PI);
    if (stepIndex !== this._lastStep) {
      this._lastStep = stepIndex;
      if (!frozen && p.state === 'ground' && p.horizontalSpeed > 1.5) audio.sfx('step', { vol: Math.min(1, p.horizontalSpeed / 9) });
    }
    // Head bob in first person: follows the running cycle of the (hidden) body.
    const running = p.state === 'ground' && p.horizontalSpeed > 0.5 && !frozen;
    const bobTarget = running ? Math.abs(Math.sin(this.model.runPhase)) * 0.06 * Math.min(1, p.horizontalSpeed / 8) - 0.03 : 0;
    this.cam.bob = damp(this.cam.bob, bobTarget, 20, dt);
    this.cam.update(dt, p.pos, p.horizontalSpeed);
    this.arms.update(frozen ? 0 : dt, p, this.model.runPhase);
    this.lighting.follow(p.pos);
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
    audio.windSpeed(p.horizontalSpeed);
    return {
      wind: high * (0.05 + Math.min(0.1, p.horizontalSpeed * 0.01)),
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
  }

  /** Remember recent positions on solid roofs so a fall can send you back. */
  /** Down on the street? Point at the nearest ladder so you can climb back up. */
  _streetHelp(dt) {
    const p = this.player;
    const onStreet = p.pos.y < 1.5 && (p.grounded || p.state === 'ladder');
    if (!onStreet) {
      this._streetTipShown = false;
      if (this._streetMarker) { this._streetMarker = false; this.game.hud.setMarker(null); }
      return;
    }
    if (!this._streetTipShown && p.state !== 'ladder') {
      this._streetTipShown = true;
      this.game.hud.toast('Down on the street', 'Every building has a yellow ladder. Walk into it and hold forward to climb back up (or press R).', 'var(--cyan)', 5);
    }
    if (p.state === 'ladder') return;
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

  teardown() {
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

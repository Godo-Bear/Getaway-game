import * as THREE from 'three';
import { PlayState } from './playState.js';
import { PlayerController } from '../player/playerController.js';
import { PlayerModel } from '../player/playerModel.js';
import { FirstPersonArms } from '../player/firstPersonArms.js';
import { save } from '../core/save.js';
import { ThirdPersonCamera } from '../core/thirdPersonCamera.js';
import { NightLighting } from '../world/lighting.js';
import { CONTROLS } from '../ui/menus.js';
import { damp } from '../core/utils.js';
import { FreeRunMode } from './modes/freeRunMode.js';
import { RooftopRunMode } from './modes/rooftopRunMode.js';
import { ChapterRooftopsMode } from './modes/chapterRooftopsMode.js';

// On-foot game state: everything the on-foot modes have in common.
//   - the player (physics + animated model) and the third-person camera
//   - turning keyboard/mouse input into movement
//   - falling off the roofs, and remembering safe places to respawn
//
// What you're actually DOING on the rooftops is decided by a "mode" object:
//   free     -> FreeRunMode         (explore, practise)
//   survival -> RooftopRunMode      (endless helicopter chase, score)
//   chapter1 -> ChapterRooftopsMode (story level: checkpoints, clues, car)
//
// A mode can implement:
//   build()          -> { group, world, spawn }  the level to play in
//   hudSections      -> which HUD parts to show
//   start()          -> (re)start the run
//   update(dt)       -> per-frame game logic
//   onFall()         -> the player fell to the street
//   onRespawnKey()   -> the player pressed R
//   teardown()

const MODES = { free: FreeRunMode, survival: RooftopRunMode, chapter1: ChapterRooftopsMode };

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
    this.lighting = new NightLighting(this.scene, { shadows: game.settings.graphics !== 'low' });

    const ModeClass = MODES[params.mode] || FreeRunMode;
    this.mode = new ModeClass(this);
    this.level = this.mode.build();
    this.scene.add(this.level.group);
    this.world = this.level.world;

    this.player = new PlayerController(this.world);
    this.model = new PlayerModel();
    this.scene.add(this.model.root);
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
    if (input.pointerLocked) {
      c.moveX = input.axis('left', 'right');
    } else {
      // No mouse lock: A/D turn instead of strafing.
      c.moveX = 0;
      this.cam.applyTurn(input.axis('left', 'right'), dt);
    }
    c.jumpPressed = input.wasPressed('jump');
    c.jumpHeld = input.isDown('jump');
    c.sprint = input.isDown('sprint');
    this.cam.getForward(this._fwd);
    this.cam.getRight(this._right);

    if (input.wasPressed('view')) this.toggleView();
    if (input.wasPressed('respawn')) {
      if (this.mode.onRespawnKey) this.mode.onRespawnKey();
      else this.respawnToSafety('Back to safety.');
    }
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
      if (e.type === 'land' && e.impact > 6) this.cam.addLandingDip(e.impact);
      if (e.type === 'roll') hud.toast('Roll!', '', 'var(--cyan)');
    }
    p.events.length = 0;

    if (!frozen) {
      this.time += dt;
      this._trackSafety(dt);
      if (p.pos.y < 2) {
        this.falls++;
        if (this.mode.onFall) this.mode.onFall();
        else this.respawnToSafety('You fell to the street.');
      }
      this.mode.update(dt);
    }

    this.model.update(frozen ? 0 : dt, p);
    // Head bob in first person: follows the running cycle of the (hidden) body.
    const running = p.state === 'ground' && p.horizontalSpeed > 0.5 && !frozen;
    const bobTarget = running ? Math.abs(Math.sin(this.model.runPhase)) * 0.06 * Math.min(1, p.horizontalSpeed / 8) - 0.03 : 0;
    this.cam.bob = damp(this.cam.bob, bobTarget, 20, dt);
    this.cam.update(dt, p.pos, p.horizontalSpeed);
    this.arms.update(frozen ? 0 : dt, p, this.model.runPhase);
    this.lighting.follow(p.pos);

    if (this.game.showDebug) {
      hud.setDebug(`${this.game.fps.toFixed(0)} fps\n${p.state} ${p.horizontalSpeed.toFixed(1)} m/s\n` +
        `pos ${p.pos.x.toFixed(1)} ${p.pos.y.toFixed(1)} ${p.pos.z.toFixed(1)}\n` +
        `calls ${this.game.renderer.info.render.calls}`);
    } else hud.setDebug('');
  }

  /** Remember recent positions on solid roofs so a fall can send you back. */
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
    renderer.render(this.scene, this.camera);
  }

  resize(w, h) {
    if (!this.camera) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  teardown() {
    this.mode?.teardown?.();
    this.scene?.traverse((o) => {
      if (o.geometry && !o.isInstancedMesh) o.geometry.dispose();
    });
    this.scene = null;
    this.game.hud.hideAll();
  }
}

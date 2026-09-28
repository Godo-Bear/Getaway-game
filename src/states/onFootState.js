import * as THREE from 'three';
import { PlayState } from './playState.js';
import { PlayerController } from '../player/playerController.js';
import { PlayerModel } from '../player/playerModel.js';
import { ThirdPersonCamera } from '../core/thirdPersonCamera.js';
import { NightLighting } from '../world/lighting.js';
import { generateRooftopCity, findClearRoofSpot } from '../world/rooftopCity.js';
import { getGlowTexture, makeGlowMaterial } from '../world/materials.js';
import { Helicopter } from '../ai/helicopter.js';
import { CONTROLS } from '../ui/menus.js';
import { save } from '../core/save.js';
import { formatTime, makeRng, clamp } from '../core/utils.js';

// On-foot game mode. Two flavours:
//
//   mode: 'free'     - Free Run. Explore the rooftops, practise parkour.
//   mode: 'survival' - Rooftop Run. Police helicopters hunt you with
//                      spotlights. Survive as long as you can: points tick up
//                      every second, cash bags give bonuses, and every 30 s
//                      the "wanted level" goes up (faster lights, more helis).
//
// Stand in a spotlight and the Spotted meter fills. Full = caught = game over.
// Break line of sight (hide under a water tower or inside a stairwell hut)
// and the helicopter has to search for you, but you don't earn points while
// hiding, so you can't camp forever.

const LEVEL_TIME = 30;        // seconds per wanted level
const MAX_LEVEL = 6;

/** Difficulty settings for each wanted level (index 0 = level 1). */
const LEVELS = [
  { helis: 1, spotSpeed: 5.6, fill: 0.55, lead: 0.0 },
  { helis: 1, spotSpeed: 6.4, fill: 0.62, lead: 0.2 },
  { helis: 2, spotSpeed: 6.8, fill: 0.68, lead: 0.3 },
  { helis: 2, spotSpeed: 7.6, fill: 0.75, lead: 0.45 },
  { helis: 3, spotSpeed: 8.2, fill: 0.85, lead: 0.55 },
  { helis: 3, spotSpeed: 9.0, fill: 1.0, lead: 0.7 },
];

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
    this.mode = params.mode || 'free';
    const survival = this.mode === 'survival';
    const game = this.game;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 900);
    this.lighting = new NightLighting(this.scene, { shadows: game.settings.graphics !== 'low' });

    // Free run uses a fixed city; survival gets a new layout every run.
    this.seed = survival ? (Math.random() * 1e9) | 0 : 1234;
    this.city = generateRooftopCity({ seed: this.seed, blocks: 6 });
    this.scene.add(this.city.group);
    this.world = this.city.world;

    this.player = new PlayerController(this.world);
    this.model = new PlayerModel();
    this.scene.add(this.model.root);
    this.cam = new ThirdPersonCamera(this.camera, this.world);
    this._applySettings();

    this.rng = makeRng(this.seed ^ 0x5bd1);
    this.helis = [];
    this._buildPickup();

    game.hud.show(survival ? ['tl', 'score', 'meter', 'controls', 'marker'] : ['tl', 'meter', 'controls']);
    const lockOk = !game.input.pointerLockFailed;
    game.hud.showControls(lockOk ? CONTROLS.onFoot : CONTROLS.onFootNoLock);
    this.restart();
  }

  _applySettings() {
    const s = this.game.settings;
    this.cam.sensitivity = 0.0022 * s.mouseSensitivity;
    this.cam.invertY = s.invertY;
  }

  /** Reset the run (also used by "Try again"). */
  restart() {
    const sp = this.city.spawn;
    // facing PI = model looks toward -Z, which is where camera yaw 0 looks.
    this.player.teleport(sp.x, sp.y, sp.z, Math.PI);
    this.cam.snapBehind(0);
    this.safePositions = [];
    this.safeTimer = 0;
    this.time = 0;
    this.score = 0;
    this.level = 1;
    this.spotted = 0;
    this.falls = 0;
    this.cashCollected = 0;
    this.hidden = false;
    this.respawnFade = 0;

    for (const h of this.helis) h.dispose();
    this.helis = [];

    const hud = this.game.hud;
    hud.setMeter(0, '');
    if (this.mode === 'survival') {
      hud.setPhase('Rooftop Run');
      hud.setObjective('Stay out of the spotlights');
      hud.toast('Run!', 'The police helicopter is coming. Keep moving, grab the cash, hide under water towers or in stairwell huts to break its line of sight.', 'var(--amber)');
      this._placePickup();
    } else {
      hud.setPhase('Free Run');
      hud.setObjective('Explore the rooftops');
      this.pickup.group.visible = false;
    }
  }

  _spawnHelicopter() {
    const p = this.player.pos;
    const a = this.rng() * Math.PI * 2;
    const start = new THREE.Vector3(p.x + Math.cos(a) * 60, 0, p.z + Math.sin(a) * 60);
    const heli = new Helicopter(this.scene, this.world, { id: this.helis.length, startPos: start });
    this.helis.push(heli);
    if (this.helis.length > 1) this.game.hud.toast('Another helicopter!', '', 'var(--red)');
  }

  // ------------------------------------------------------------------
  // Cash pickups (survival bonus)
  // ------------------------------------------------------------------
  _buildPickup() {
    const g = new THREE.Group();
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.4), new THREE.MeshLambertMaterial({
      color: 0x3b4a2a, emissive: 0x2a5a20, emissiveIntensity: 0.6 }));
    bag.position.y = 0.9;
    g.add(bag);
    const bills = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.2), new THREE.MeshBasicMaterial({ color: 0x7dff80 }));
    bills.position.set(0.1, 1.13, 0);
    g.add(bills);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.0, 28), makeGlowMaterial(0x4dffa6, 0.8));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    g.add(ring);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 60, 12, 1, true), makeGlowMaterial(0x4dffa6, 0.12));
    beam.position.y = 30;
    g.add(beam);
    this.pickup = { group: g, bag, bills, ring, pos: new THREE.Vector3() };
    this.scene.add(g);
  }

  _placePickup() {
    // Somewhere 35-90 m away on a normal roof.
    const p = this.player.pos;
    const candidates = this.city.buildings.filter((b) => {
      if (b.tower) return false;
      const d = Math.hypot((b.minX + b.maxX) / 2 - p.x, (b.minZ + b.maxZ) / 2 - p.z);
      return d > 35 && d < 90;
    });
    for (let i = 0; i < 10 && candidates.length; i++) {
      const b = candidates[Math.floor(this.rng() * candidates.length)];
      const spot = findClearRoofSpot(this.world, b, this.rng);
      if (spot) {
        this.pickup.pos.copy(spot);
        this.pickup.group.position.copy(spot);
        this.pickup.group.visible = true;
        return;
      }
    }
    this.pickup.group.visible = false;
  }

  // ------------------------------------------------------------------
  // Per-frame input -> control struct for the physics steps
  // ------------------------------------------------------------------
  readInput(dt) {
    const input = this.game.input;
    const c = this.ctl;
    const mouse = input.consumeMouse();
    this.cam.applyMouse(mouse.x, mouse.y);

    // Arrow keys / Q E always turn the camera.
    this.cam.applyTurn(input.axis('turnLeft', 'turnRight'), dt);

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

    if (input.wasPressed('respawn')) this._respawn('Back to safety.');
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
      // Fell to the street?
      if (p.pos.y < 2) {
        this.falls++;
        this._respawn(this.mode === 'survival' ? 'You fell. The helicopter gets a head start.' : 'You fell to the street.');
        if (this.mode === 'survival') this.spotted = Math.max(this.spotted, 0.4);
      }
      if (this.mode === 'survival') this._updateSurvival(dt);
    }

    this.model.update(frozen ? 0 : dt, p);
    this.cam.update(dt, p.pos, p.horizontalSpeed);
    this.lighting.follow(p.pos);

    if (this.mode === 'free') {
      hud.setStats(`<span>Time <b>${formatTime(this.time)}</b></span><span>Falls <b>${this.falls}</b></span>`);
    }
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

  _respawn(message) {
    // Go back ~1.5 s (a few samples) so you don't land right on the edge again.
    const list = this.safePositions;
    const entry = list.length > 3 ? list[list.length - 4] : list[0];
    if (entry) {
      this.player.teleport(entry.pos.x, entry.pos.y + 0.05, entry.pos.z, entry.facing);
      this.cam.snapBehind(entry.facing + Math.PI);
    } else {
      const sp = this.city.spawn;
      this.player.teleport(sp.x, sp.y, sp.z, Math.PI);
      this.cam.snapBehind(0);
    }
    this.safePositions.length = Math.max(0, list.length - 3);
    this.game.hud.toast('Back to safety', message, 'var(--cyan)');
    this.game.hud.setFade(true);
    setTimeout(() => this.game.hud.setFade(false), 120);
  }

  // ------------------------------------------------------------------
  // Survival: helicopters, score, difficulty
  // ------------------------------------------------------------------
  _updateSurvival(dt) {
    const p = this.player;
    const hud = this.game.hud;

    // Wanted level rises every LEVEL_TIME seconds.
    const newLevel = Math.min(MAX_LEVEL, 1 + Math.floor(this.time / LEVEL_TIME));
    if (newLevel > this.level) {
      this.level = newLevel;
      hud.toast(`Wanted level ${this.level}`, 'The spotlights are getting faster.', 'var(--red)');
    }
    const L = LEVELS[this.level - 1];
    // Helicopters arrive after a 2.5 s head start, then as the level demands.
    if (this.time > 2.5 && this.helis.length < L.helis) this._spawnHelicopter();

    // Update helicopters and work out if we're lit / hidden.
    let lit = false;
    let seen = false;
    for (const h of this.helis) {
      h.update(dt, p, L);
      if (h.seesPlayer) seen = true;
      if (h.isPlayerLit(p.pos)) lit = true;
    }
    this.hidden = this.helis.length > 0 && !seen;

    // Spotted meter
    if (lit) this.spotted += dt * L.fill;
    else this.spotted -= dt * 0.35;
    this.spotted = clamp(this.spotted, 0, 1);
    hud.setMeter(this.spotted, lit ? 'SPOTTED! Get out of the light' : this.hidden ? 'Hidden' : 'Spotted',
      lit ? 'var(--red)' : '#8a8f9c');

    // Score: points every second you're out in the open, more at higher levels.
    if (!this.hidden) this.score += dt * 10 * this.level;

    // Cash pickup
    const pk = this.pickup;
    if (pk.group.visible) {
      pk.bag.rotation.y += dt * 2;
      pk.bills.rotation.y = pk.bag.rotation.y;
      pk.ring.rotation.z += dt;
      const d = p.pos.distanceTo(pk.pos);
      if (d < 1.6) {
        const bonus = 250 * this.level;
        this.score += bonus;
        this.cashCollected++;
        hud.toast(`+${bonus} cash!`, '', 'var(--safe)');
        this._placePickup();
      }
      hud.setMarker(pk.pos.clone().setY(pk.pos.y + 1.5), this.camera, 'Cash', 'var(--safe)', d);
    }

    hud.setScore(this.score, `WANTED <span class="heat">${'★'.repeat(this.level)}${'☆'.repeat(MAX_LEVEL - this.level)}</span>`);
    hud.setStats(`<span>Time <b>${formatTime(this.time)}</b></span><span>Cash bags <b>${this.cashCollected}</b></span>` +
      (this.hidden ? '<span><b>Hidden</b> (no points)</span>' : ''));

    if (this.spotted >= 1) this._caught();
  }

  _caught() {
    const score = Math.floor(this.score);
    const isBest = save.submitBest('rooftopRun', score);
    this.game.hud.setMeter(0, '');
    this.gameOver(`
      <h2>Caught!</h2>
      <p class="sub">The helicopter pinned you down and the ground units closed in.</p>
      <div class="stat-grid">
        <div><span>Score</span><b>${score.toLocaleString('en-US')}</b></div>
        <div><span>Best</span><b>${save.data.best.rooftopRun.toLocaleString('en-US')}</b></div>
        <div><span>Time survived</span><b>${formatTime(this.time)}</b></div>
        <div><span>Wanted level</span><b>${this.level}</b></div>
      </div>
      ${isBest ? '<p class="new-best">New best score!</p>' : ''}`);
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
    for (const h of this.helis) h.dispose();
    this.helis = [];
    // Free GPU memory used by this level's geometry.
    this.scene?.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    this.scene = null;
    this.game.hud.hideAll();
  }
}

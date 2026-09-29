import * as THREE from 'three';
import { generateRooftopCity, findClearRoofSpot } from '../../world/rooftopCity.js';
import { makeGlowMaterial } from '../../world/materials.js';
import { Helicopter } from '../../ai/helicopter.js';
import { save } from '../../core/save.js';
import { earn } from '../../gadgets/gadgets.js';
import { formatTime, makeRng, clamp } from '../../core/utils.js';
import { audio } from '../../core/audio.js';

// Rooftop Run: endless helicopter survival.
//
// Police helicopters hunt you with spotlights. Points tick up every second
// you're out in the open; cash bags give bonuses; every 30 s the wanted level
// rises (faster spotlights, more helicopters). Stand in a spotlight and the
// Spotted meter fills; full = caught = game over. Hide under water towers or
// inside stairwell huts to break line of sight (but you earn nothing hidden).

const LEVEL_TIME = 30;
const MAX_LEVEL = 6;

/** Difficulty for each wanted level (index 0 = level 1). */
const LEVELS = [
  { helis: 1, spotSpeed: 5.6, fill: 0.45, lead: 0.0 },
  { helis: 1, spotSpeed: 6.4, fill: 0.5, lead: 0.2 },
  { helis: 2, spotSpeed: 6.8, fill: 0.55, lead: 0.3 },
  { helis: 2, spotSpeed: 7.4, fill: 0.62, lead: 0.4 },
  { helis: 3, spotSpeed: 8.0, fill: 0.7, lead: 0.5 },
  { helis: 3, spotSpeed: 8.6, fill: 0.8, lead: 0.6 },
];

export class RooftopRunMode {
  constructor(state) {
    this.state = state;
    this.hudSections = ['tl', 'score', 'meter', 'controls', 'marker'];
    this.helis = [];
  }

  build() {
    // A new city layout every run.
    this.seed = (Math.random() * 1e9) | 0;
    this.rng = makeRng(this.seed ^ 0x5bd1);
    const city = generateRooftopCity({ seed: this.seed, blocks: 6 });
    this.city = city;
    this._buildPickup();
    return city;
  }

  start() {
    this.score = 0;
    this.level = 1;
    this.spotted = 0;
    this.cashCollected = 0;
    this.hidden = false;
    for (const h of this.helis) h.dispose();
    this.helis = [];
    const hud = this.state.game.hud;
    hud.setPhase('Rooftop Run');
    hud.setObjective('Stay out of the spotlights');
    hud.toast('Run!', 'The police helicopter is coming. Keep moving, grab the cash, hide under water towers or in stairwell huts to break its line of sight.', 'var(--amber)');
    this._placePickup();
  }

  onFall() {
    this.state.respawnToSafety('You fell. The helicopter gets a head start.');
    this.spotted = Math.max(this.spotted, 0.4);
  }

  audioMix() {
    const p = this.state.player.pos;
    let d = Infinity;
    for (const h of this.helis) d = Math.min(d, Math.hypot(h.pos.x - p.x, h.pos.z - p.z));
    return {
      rotor: this.helis.length ? clamp(1 - d / 110, 0.05, 1) * 0.55 : 0,
      siren: 0.06,
      music: 0.5,
      intensity: 0.3 + this.spotted * 0.7 + this.level * 0.03,
    };
  }

  _spawnHelicopter() {
    const p = this.state.player.pos;
    const a = this.rng() * Math.PI * 2;
    const start = new THREE.Vector3(p.x + Math.cos(a) * 60, 0, p.z + Math.sin(a) * 60);
    this.helis.push(new Helicopter(this.state.scene, this.state.world, { id: this.helis.length, startPos: start }));
    if (this.helis.length > 1) this.state.game.hud.toast('Another helicopter!', '', 'var(--red)');
  }

  // --- Cash pickups -----------------------------------------------------
  _buildPickup() {
    const g = new THREE.Group();
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.4), new THREE.MeshLambertMaterial({
      color: 0x3b4a2a, emissive: 0x2a5a20, emissiveIntensity: 0.6 }));
    bag.position.y = 0.9;
    const bills = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.2), new THREE.MeshBasicMaterial({ color: 0x7dff80 }));
    bills.position.set(0.1, 1.13, 0);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.0, 28), makeGlowMaterial(0x4dffa6, 0.8));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 60, 12, 1, true), makeGlowMaterial(0x4dffa6, 0.12));
    beam.position.y = 30;
    g.add(bag, bills, ring, beam);
    this.pickup = { group: g, bag, bills, ring, pos: new THREE.Vector3() };
    this.city.group.add(g);
  }

  _placePickup() {
    const p = this.state.player.pos;
    const candidates = this.city.buildings.filter((b) => {
      if (b.tower) return false;
      const d = Math.hypot((b.minX + b.maxX) / 2 - p.x, (b.minZ + b.maxZ) / 2 - p.z);
      return d > 35 && d < 90;
    });
    for (let i = 0; i < 10 && candidates.length; i++) {
      const b = candidates[Math.floor(this.rng() * candidates.length)];
      const spot = findClearRoofSpot(this.city.world, b, this.rng);
      if (spot) {
        this.pickup.pos.copy(spot);
        this.pickup.group.position.copy(spot);
        this.pickup.group.visible = true;
        return;
      }
    }
    this.pickup.group.visible = false;
  }

  update(dt) {
    const s = this.state;
    const p = s.player;
    const hud = s.game.hud;

    const newLevel = Math.min(MAX_LEVEL, 1 + Math.floor(s.time / LEVEL_TIME));
    if (newLevel > this.level) {
      this.level = newLevel;
      hud.toast(`Wanted level ${this.level}`, 'The spotlights are getting faster.', 'var(--red)');
    }
    const L = LEVELS[this.level - 1];
    if (s.time > 2.5 && this.helis.length < L.helis) this._spawnHelicopter();

    // Gadgets: a holo-decoy draws the spotlights away; smoke hides you.
    const target = s.policeTarget, fooled = target !== p || s.concealed;
    let lit = false, seen = false;
    for (const h of this.helis) {
      h.update(dt, target, L);
      if (h.seesPlayer && !fooled) seen = true;
      if (h.isPlayerLit(p.pos) && !s.concealed) lit = true;
    }
    this.hidden = this.helis.length > 0 && !seen;

    // Out of the light, the meter drains quickly (faster still when hidden).
    this.spotted = clamp(this.spotted + (lit ? dt * L.fill : -dt * (this.hidden ? 0.9 : 0.6)), 0, 1);
    hud.setMeter(this.spotted, lit ? 'SPOTTED! Get out of the light' : this.hidden ? 'Hidden' : 'Spotted',
      lit ? 'var(--red)' : '#8a8f9c');

    if (!this.hidden) this.score += dt * 10 * this.level;

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
        const shopCash = earn(s.game, 50, '', { quiet: true });
        hud.toast(`+${bonus} points, +$${shopCash}!`, 'Cash for the Shop.', 'var(--safe)');
        audio.sfx('cash');
        this._placePickup();
      }
      hud.setMarker(pk.pos.clone().setY(pk.pos.y + 1.5), s.camera, 'Cash', 'var(--safe)', d);
    }

    hud.setScore(this.score, `WANTED <span class="heat">${'★'.repeat(this.level)}${'☆'.repeat(MAX_LEVEL - this.level)}</span>`);
    hud.setStats(`<span>Time <b>${formatTime(s.time)}</b></span><span>Cash bags <b>${this.cashCollected}</b></span>` +
      (this.hidden ? '<span><b>Hidden</b> (no points)</span>' : ''));

    if (this.spotted >= 1) this._caught();
  }

  _caught() {
    const s = this.state;
    const score = Math.floor(this.score);
    const isBest = save.submitBest('rooftopRun', score);
    audio.sfx('caught');
    s.game.hud.setMeter(0, '');
    s.gameOver(`
      <h2>Caught!</h2>
      <p class="sub">The helicopter pinned you down and the ground units closed in.</p>
      <div class="stat-grid">
        <div><span>Score</span><b>${score.toLocaleString('en-US')}</b></div>
        <div><span>Best</span><b>${save.data.best.rooftopRun.toLocaleString('en-US')}</b></div>
        <div><span>Time survived</span><b>${formatTime(s.time)}</b></div>
        <div><span>Wanted level</span><b>${this.level}</b></div>
        <div><span>Cash for the Shop</span><b style="color:var(--safe)">+$${earn(s.game, score / 25, '', { quiet: true })}</b></div>
      </div>
      ${isBest ? '<p class="new-best">New best score!</p>' : ''}`);
  }

  teardown() {
    for (const h of this.helis) h.dispose();
    this.helis = [];
  }
}

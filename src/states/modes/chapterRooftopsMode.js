import * as THREE from 'three';
import { buildChapter1Rooftops } from '../../world/levels/chapter1Rooftops.js';
import { makeGlowMaterial } from '../../world/materials.js';
import { updateSirens } from '../../vehicles/carModel.js';
import { Helicopter } from '../../ai/helicopter.js';
import { CHAPTER1 } from '../../story/chapter1.js';
import { save } from '../../core/save.js';
import { formatTime, clamp } from '../../core/utils.js';
import { newChapterRun } from '../../story/chapterRun.js';
import { audio } from '../../core/audio.js';
import { SUSPECTS } from '../../story/crew.js';

// Chapter 1, Part 1: the rooftop escape (a hand-built story level).
//
//  - Follow the orange arrows and blue checkpoint beams to the getaway car.
//  - One police helicopter hunts you. Get caught in its light and you're
//    sent back to the last checkpoint (it counts against your rating).
//  - Falling to the street also sends you back to the last checkpoint.
//  - Four clues are hidden on the roofs: two on the main path, two off it.

const HELI_DELAY = 5;       // seconds before the helicopter joins the hunt
const CAR_RADIUS = 3.5;     // how close to the car counts as "reached"
const PICKUP_RADIUS = 1.6;

export class ChapterRooftopsMode {
  constructor(state) {
    this.state = state;
    this.hudSections = ['tl', 'meter', 'controls', 'marker'];
    this.heli = null;
    this.chapter = CHAPTER1;
  }

  // ------------------------------------------------------------------
  // Level
  // ------------------------------------------------------------------
  build() {
    const level = buildChapter1Rooftops();
    level.spawn.yaw = level.checkpoints[0].yaw;
    this.level = level;
    this._buildCheckpointMarkers();
    this._buildClues();
    this._buildGuides();
    return level;
  }

  _buildCheckpointMarkers() {
    this.cpMarks = this.level.checkpoints.map((cp, i) => {
      if (i === 0) return null;
      const g = new THREE.Group();
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 80, 18, 1, true), makeGlowMaterial(0x39e6ff, 0.2));
      beam.position.y = 40;
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.8, 2.4, 32), makeGlowMaterial(0x39e6ff, 0.7));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.06;
      g.add(beam, ring);
      g.position.copy(cp.spawn);
      this.level.group.add(g);
      return { beam, ring };
    });
  }

  _buildClues() {
    const gemGeo = new THREE.OctahedronGeometry(0.32);
    const gemMat = new THREE.MeshBasicMaterial({ color: 0xffc34d, toneMapped: false });
    const paperMat = new THREE.MeshLambertMaterial({ color: 0xe8e0cc, emissive: 0x5a4a20, emissiveIntensity: 0.5 });
    this.clueObjs = this.level.clues.map((c) => {
      const g = new THREE.Group();
      g.position.copy(c.pos);
      const item = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.3), paperMat);
      item.position.y = 0.05;
      const gem = new THREE.Mesh(gemGeo, gemMat);
      gem.position.y = 1.2;
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.85, 24), makeGlowMaterial(0xffb020, 0.7));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.04;
      // Tall amber beam so clues can be spotted from several roofs away.
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 30, 8, 1, true), makeGlowMaterial(0xffb020, 0.35));
      beam.position.y = 15;
      g.add(item, gem, ring, beam);
      this.level.group.add(g);
      return { ...c, group: g, gem };
    });
  }

  _buildGuides() {
    // Glowing orange arrows painted on the roofs (one instanced mesh).
    const geo = new THREE.CircleGeometry(0.9, 3);
    geo.rotateX(-Math.PI / 2);
    geo.rotateY(Math.PI / 2); // triangle points to -Z (north) at yaw 0
    const guides = this.level.guides;
    const mesh = new THREE.InstancedMesh(geo, makeGlowMaterial(0xffb020, 0.55), guides.length * 2);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
    guides.forEach(([x, y, z, yaw], i) => {
      q.setFromAxisAngle(up, yaw);
      // two arrows in a row: >>
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      m.compose(new THREE.Vector3(x, y + 0.04, z), q, one);
      mesh.setMatrixAt(i * 2, m);
      m.compose(new THREE.Vector3(x + fx * 1.4, y + 0.04, z + fz * 1.4), q, one);
      mesh.setMatrixAt(i * 2 + 1, m);
    });
    this.level.group.add(mesh);
  }

  // ------------------------------------------------------------------
  // Run
  // ------------------------------------------------------------------
  start(first) {
    const s = this.state;
    // The rooftops are the start of a chapter, so every attempt is a new run.
    s.game.chapterRun = newChapterRun(this.chapter.id);
    this.cp = 0;
    this.caught = 0;
    this.spotted = 0;
    this.found = new Set();
    this.done = false;
    for (const c of this.clueObjs) c.group.visible = true;

    this.heli?.dispose();
    this.heli = new Helicopter(s.scene, s.world, { id: 0, startPos: new THREE.Vector3(0, 0, 70) });
    this.heliAnnounced = false;

    const hud = s.game.hud;
    hud.setPhase(`${this.chapter.title} · Part 1: The rooftops`);
    hud.setObjective(this.chapter.rooftopObjective);

    if (first) s.showStoryCards(this.chapter.prologue, 'Start the escape');
  }

  audioMix() {
    const p = this.state.player.pos;
    const heliOn = this.state.time > HELI_DELAY && this.heli;
    const d = heliOn ? Math.hypot(this.heli.pos.x - p.x, this.heli.pos.z - p.z) : Infinity;
    audio.sirenDistance(90); // police cars down on the street
    return {
      rotor: heliOn ? clamp(1 - d / 110, 0.05, 1) * 0.55 : 0,
      siren: 0.12,
      music: 0.5,
      intensity: 0.35 + this.spotted * 0.65,
    };
  }

  get checkpoint() {
    return this.level.checkpoints[this.cp];
  }

  /** Back to the last checkpoint (after falling or getting caught). */
  _respawnAtCheckpoint(title, message, color) {
    const s = this.state;
    const cp = this.checkpoint;
    s.placePlayer(cp.spawn, cp.yaw);
    s.flash(title, message, color);
    this.spotted = 0;
    // Move the searchlight away so you get a fair restart.
    const a = Math.random() * Math.PI * 2;
    this.heli.spot.set(cp.spawn.x + Math.cos(a) * 40, cp.spawn.y, cp.spawn.z + Math.sin(a) * 40);
    this.heli.lastSeen.copy(this.heli.spot);
  }

  onFall() {
    this._respawnAtCheckpoint('You fell', 'Back to the last checkpoint.', 'var(--cyan)');
  }

  onRespawnKey() {
    this._respawnAtCheckpoint('Checkpoint', 'Back to the last checkpoint.', 'var(--cyan)');
  }

  update(dt) {
    if (this.done) return;
    const s = this.state;
    const p = s.player;
    const hud = s.game.hud;
    const t = s.time;

    // --- Checkpoints: stand on the checkpoint's roof to reach it
    if (p.grounded) {
      const cps = this.level.checkpoints;
      for (let i = this.cp + 1; i < cps.length; i++) {
        const r = cps[i].roof;
        if (p.pos.x > r.minX && p.pos.x < r.maxX && p.pos.z > r.minZ && p.pos.z < r.maxZ && Math.abs(p.pos.y - r.h) < 1) {
          this.cp = i;
          hud.toast('Checkpoint reached', cps[i].name, 'var(--cyan)');
          audio.sfx('checkpoint');
        }
      }
    }
    this._updateCheckpointMarkers(t, dt);

    // --- Clues
    for (const c of this.clueObjs) {
      if (this.found.has(c.id)) continue;
      c.gem.rotation.y += dt * 1.8;
      c.gem.position.y = 1.2 + Math.sin(t * 2.4 + c.pos.x) * 0.15;
      const dx = p.pos.x - c.pos.x, dy = p.pos.y - c.pos.y, dz = p.pos.z - c.pos.z;
      if (Math.hypot(dx, dz) < PICKUP_RADIUS && Math.abs(dy) < 1.5) this._pickUpClue(c);
    }

    // --- Helicopter
    if (t > HELI_DELAY) {
      if (!this.heliAnnounced) {
        this.heliAnnounced = true;
        // Det. Hale on the helicopter loudspeaker (with a subtitle)
        const c = this.chapter.heliCallout;
        hud.toast(`${SUSPECTS[c.who].name}, on the loudspeaker`, `"${c.line}" Stay out of the spotlight: hide under water towers or in stairwell huts.`, SUSPECTS[c.who].color, 7);
        audio.voice(c.voice);
      }
      const params = { spotSpeed: 5.8 + Math.min(1.2, t / 90), fill: 0.6, lead: 0.15 };
      this.heli.update(dt, p, params);
      const lit = this.heli.isPlayerLit(p.pos);
      const hidden = !this.heli.seesPlayer;
      this.spotted = clamp(this.spotted + (lit ? dt * params.fill : -dt * 0.35), 0, 1);
      hud.setMeter(this.spotted, lit ? 'SPOTTED! Get out of the light' : hidden ? 'Hidden' : 'Spotted',
        lit ? 'var(--red)' : '#8a8f9c');
      if (this.spotted >= 1) {
        this.caught++;
        audio.sfx('caught');
        this._respawnAtCheckpoint('Caught!', 'The helicopter pinned you. Back to the last checkpoint.', 'var(--red)');
      }
    }

    // --- Street-level police lights
    for (const m of this.level.policeCars) updateSirens(m, t + m.position.x * 0.1);
    this.level.beacon.material.opacity = 0.12 + Math.sin(t * 3) * 0.04;

    // --- Where to go next
    const next = this.level.checkpoints[this.cp + 1];
    if (next) {
      hud.setMarker(next.spawn.clone().setY(next.spawn.y + 1.5), s.camera, next.name, 'var(--cyan)', p.pos.distanceTo(next.spawn));
    } else {
      const car = this.level.carPos;
      hud.setMarker(car.clone().setY(car.y + 2), s.camera, 'Getaway car', 'var(--amber)', p.pos.distanceTo(car));
    }

    hud.setStats(`<span>Time <b>${formatTime(t)}</b></span>` +
      `<span>Clues <b>${this.found.size}/${this.clueObjs.length}</b></span>` +
      `<span${this.caught ? ' class="warn"' : ''}>Caught <b>${this.caught}</b></span>`);

    // --- Reached the car?
    const car = this.level.carPos;
    if (Math.hypot(p.pos.x - car.x, p.pos.z - car.z) < CAR_RADIUS && Math.abs(p.pos.y - car.y) < 2) {
      this._complete();
    }
  }

  _updateCheckpointMarkers(t, dt) {
    this.cpMarks.forEach((m, i) => {
      if (!m) return;
      const done = i <= this.cp, next = i === this.cp + 1;
      const col = done ? 0x4dffa6 : 0x39e6ff;
      m.beam.material.color.setHex(col);
      m.ring.material.color.setHex(col);
      m.beam.material.opacity = done ? 0.05 : next ? 0.24 + Math.sin(t * 4) * 0.08 : 0.08;
      m.ring.material.opacity = done ? 0.3 : next ? 0.9 : 0.35;
      m.ring.rotation.z += dt * (next ? 1.5 : 0.3);
    });
  }

  _pickUpClue(c) {
    this.found.add(c.id);
    c.group.visible = false;
    save.addClue(this.chapter.id, c.id);
    const info = this.chapter.clues[c.id];
    audio.sfx('clue');
    this.state.game.hud.toast(`Clue: ${info.name}`, info.text, 'var(--amber)', 7);
  }

  /** Rating for this part: gold / silver / bronze. */
  _rating(time) {
    const clues = this.found.size;
    if (time < 150 && clues >= 3 && this.caught === 0) return 'gold';
    if (time < 240 && clues >= 2 && this.caught <= 2) return 'silver';
    return 'bronze';
  }

  _complete() {
    this.done = true;
    audio.sfx('win');
    const s = this.state;
    const time = s.time;
    const key = `${this.chapter.id}.rooftops`;
    const isBest = save.submitTime(key, time);
    const best = save.data.progress.bestTimes[key];
    const rating = this._rating(time);
    const clueList = this.clueObjs.map((c) => {
      const info = this.chapter.clues[c.id];
      return this.found.has(c.id)
        ? `<div class="clue"><strong>${info.name}</strong><span>${info.text}</span></div>`
        : `<div class="clue missed"><strong>??? (not found${c.onPath ? '' : ', off the main path'})</strong></div>`;
    }).join('');
    // Carry this part's results into the chapter run (used by the drive).
    const run = s.game.chapterRun;
    run.parts.rooftops = time;
    run.caught += this.caught;
    for (const id of this.found) run.clues.add(id);
    s.game.hud.setMeter(0, '');
    s.game.hud.setMarker(null);
    s.gameOver(`
      <p class="sub" style="color:var(--amber);margin-bottom:4px">Part 1 complete</p>
      <h2>Made it to the car</h2>
      <p>The engine catches on the first try. Down below, the street is a wall of flashing lights. Time to drive.</p>
      <span class="rank ${rating}">${rating.toUpperCase()}</span>
      <div class="stat-grid">
        <div><span>Time</span><b>${formatTime(time)}</b></div>
        <div><span>Best time</span><b>${formatTime(best)}</b></div>
        <div><span>Clues found</span><b>${this.found.size}/${this.clueObjs.length}</b></div>
        <div><span>Times caught</span><b>${this.caught}</b></div>
      </div>
      ${isBest ? '<p class="new-best">New best time!</p>' : ''}
      <p class="sub" style="margin-top:8px">Clues</p>
      ${clueList}
      <p class="sub" style="margin-top:14px">Gold for this part: under 2:30, 3+ clues, never caught.</p>`,
    [{ label: 'Continue: Part 2, the drive', primary: true, onClick: () => s.game.sm.change('driving', { mode: 'chapter1' }) }],
    { retryLabel: 'Replay the rooftops', extraFirst: true });
  }

  teardown() {
    this.heli?.dispose();
    this.heli = null;
  }
}

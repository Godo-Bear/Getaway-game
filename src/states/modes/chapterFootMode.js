import * as THREE from 'three';
import { LEVELS } from '../../world/levels/index.js';
import { makeGlowMaterial } from '../../world/materials.js';
import { updateSirens } from '../../vehicles/carModel.js';
import { Helicopter } from '../../ai/helicopter.js';
import { OfficerSquad } from '../../ai/officer.js';
import { FugitiveRunner } from '../../ai/fugitive.js';
import { CHAPTERS } from '../../story/chapters.js';
import { SUSPECTS } from '../../story/crew.js';
import { getChapterRun } from '../../story/chapterRun.js';
import { finishPart } from '../../story/chapterFlow.js';
import { save } from '../../core/save.js';
import { earn, owns } from '../../gadgets/gadgets.js';
import { admin } from '../../core/admin.js';
import { formatTime, clamp } from '../../core/utils.js';
import { audio } from '../../core/audio.js';

// A story part played on foot (any chapter). What happens is set by the
// part's data in the chapter file (src/story/chapterN.js):
//
//   level     - which hand-built level to load (src/world/levels/)
//   heli      - a police helicopter with a spotlight (caught = checkpoint)
//   officers  - police officers who chase you across the roofs on foot
//   fugitive  - someone running away along a path: catch them to win
//   goal      - { type: 'reach' } get to the level's goal point (e.g. the car)
//               { type: 'catch' } catch the fugitive
//   requiredClue - a clue you must pick up before the goal counts
//
// GHOST MODE (G, the pause menu or the ghost button on touch screens):
// the helicopter and officers vanish so you can roam freely. A marker points
// at the nearest clue you haven't found. Nothing counts while it's on (no
// clues, checkpoints or finishing); turning it off puts you back where you
// turned it on.

const CAR_RADIUS = 3.5;
const PICKUP_RADIUS = 2.6;  // generous: running past a clue picks it up
const CLUE_HINT = 30;       // the marker points at any clue closer than this (m)

export class ChapterFootMode {
  constructor(state, params) {
    this.state = state;
    this.chapter = CHAPTERS[params.chapterId || 'chapter1'];
    this.partIndex = params.part || 0;
    this.part = this.chapter.parts[this.partIndex];
    this.startGhost = !!params.ghost;
    this.ghost = false;
    this.ghostSnap = null;
    this.weather = this.part.weather || 'clear'; // 'clear' | 'rain' | 'storm'
    this.hudSections = ['tl', 'meter', 'controls', 'marker'];
    this.heli = null;
    this.officers = null;
    this.fugitive = null;
  }

  // ------------------------------------------------------------------
  // Level
  // ------------------------------------------------------------------
  build() {
    const level = LEVELS[this.part.level]();
    level.spawn = level.checkpoints[0].spawn.clone();
    level.spawn.yaw = level.checkpoints[0].yaw;
    this.level = level;
    this._buildCheckpointMarkers();
    this._buildClues();
    this._buildGuides();
    return level;
  }

  /** Called once the player exists: give it this level's zip lines. */
  afterBuild() {
    this.state.player.zipLines = this.level.zipLines || [];
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
    const guides = this.level.guides || [];
    if (!guides.length) return;
    const geo = new THREE.CircleGeometry(0.9, 3);
    geo.rotateX(-Math.PI / 2);
    geo.rotateY(Math.PI / 2); // triangle points to -Z (north) at yaw 0
    const mesh = new THREE.InstancedMesh(geo, makeGlowMaterial(0xffb020, 0.55), guides.length * 2);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
    guides.forEach(([x, y, z, yaw], i) => {
      q.setFromAxisAngle(up, yaw);
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
    const part = this.part;
    this.run = getChapterRun(s.game, this.chapter.id);
    this.hasMagnet = owns('magnet');
    this.ghost = false;
    this.ghostSnap = null;
    this.ghostWarn = 0;
    this.cp = 0;
    this.caughtHere = 0;
    this.spotted = 0;
    this.done = false;
    this.warnTimer = 0;
    for (const c of this.clueObjs) c.group.visible = !this.run.clues.has(c.id);

    this._spawnPolice();
    this.heliAnnounced = false;
    this.fugitive?.dispose();
    this.fugitive = null;
    if (part.fugitive) {
      this.fugitive = new FugitiveRunner(s.scene, this.level.fugitivePath, part.fugitive);
    }

    const hud = s.game.hud;
    hud.setPhase(`${this.chapter.title} · Part ${this.partIndex + 1}: ${part.title}`);
    hud.setObjective(part.objective);

    if (first && !s.game.speedrun) s.showStoryCards(part.intro, part.startLabel || 'Go', () => { if (this.startGhost) this.setGhost(true); });
  }

  /** (Re)create the helicopter and officers this part uses. */
  _spawnPolice() {
    const s = this.state, part = this.part;
    this.heli?.dispose();
    this.heli = null;
    if (part.heli) {
      this.heli = new Helicopter(s.scene, s.world, { id: 0, startPos: this.level.heliStart || new THREE.Vector3(0, 0, 70) });
    }
    this.officers?.dispose();
    this.officers = null;
    if (part.officers) {
      this.officers = new OfficerSquad(s.scene, s.world, this.level.officerSpawns, part.officers);
    }
  }

  /**
   * Ghost mode on/off. On: remember where you are and send the police away.
   * Off: back to that spot, and the police come back.
   */
  setGhost(on) {
    const s = this.state, p = s.player, hud = s.game.hud;
    if (on === this.ghost || this.done) return;
    if (on) {
      // Remember a safe spot: where you stand, or the checkpoint if mid-air.
      const cp = this.checkpoint;
      this.ghostSnap = p.grounded
        ? { pos: p.pos.clone(), yaw: p.facing, heliSpot: this.heli?.spot.clone() }
        : { pos: cp.spawn.clone(), yaw: cp.yaw, heliSpot: this.heli?.spot.clone() };
      this.ghost = true;
      this.heli?.dispose();
      this.officers?.dispose();
      this.heli = this.officers = null;
      this.spotted = 0;
      hud.setMeter(0, '');
      hud.setObjective('Ghost mode: explore freely');
      hud.toast('Ghost mode on', 'No police. The marker shows the nearest clue you haven\'t found. Nothing counts while it\'s on: turn it off to go back to where you were.', 'var(--cyan)', 6);
    } else {
      const g = this.ghostSnap;
      this.ghost = false;
      this.ghostSnap = null;
      s.placePlayer(g.pos, g.yaw);
      this._spawnPolice();
      if (this.heli && g.heliSpot) { this.heli.spot.copy(g.heliSpot); this.heli.lastSeen.copy(g.heliSpot); }
      this.officers?.scatter(p.pos);
      hud.setObjective(this.part.objective);
      hud.toast('Ghost mode off', 'Back where you left off. The police are back too.', 'var(--amber)', 4);
    }
  }

  /** Standing in a stairwell hut or under a water tower? */
  _inHideSpot(pos) {
    for (const h of this.level.hideSpots || []) {
      if (Math.hypot(h.x - pos.x, h.z - pos.z) < 1.5 && Math.abs(h.y - pos.y) < 1) return true;
    }
    return false;
  }

  _ghostNotice(text) {
    if (this.ghostWarn > 0) return;
    this.ghostWarn = 4;
    this.state.game.hud.toast('Ghost mode', text, 'var(--cyan)');
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
    if (this.heli) {
      const a = Math.random() * Math.PI * 2;
      this.heli.spot.set(cp.spawn.x + Math.cos(a) * 40, cp.spawn.y, cp.spawn.z + Math.sin(a) * 40);
      this.heli.lastSeen.copy(this.heli.spot);
    }
    this.officers?.scatter(s.player.pos);
    this.fugitive?.resetNear(cp.spawn);
  }

  _caught(message) {
    if (admin.flag('god')) { this.spotted = 0; return; } // admin god mode
    this.caughtHere++;
    this.run.caught++;
    audio.sfx('caught');
    this._respawnAtCheckpoint('Caught!', message, 'var(--red)');
  }

  onFall() {
    this._respawnAtCheckpoint(this.level.fallTitle || 'You fell', 'Back to the last checkpoint.', 'var(--cyan)');
  }

  onRespawnKey() {
    this._respawnAtCheckpoint('Checkpoint', 'Back to the last checkpoint.', 'var(--cyan)');
  }

  audioMix() {
    const p = this.state.player.pos;
    const heliOn = this.heli && this.state.time > this.part.heli?.delay;
    const d = heliOn ? Math.hypot(this.heli.pos.x - p.x, this.heli.pos.z - p.z) : Infinity;
    audio.sirenDistance(this.officers ? 40 : 90);
    const chase = this.fugitive || this.officers ? 0.3 : 0;
    return {
      rotor: heliOn ? clamp(1 - d / 110, 0.05, 1) * 0.55 : 0,
      siren: this.ghost ? 0 : 0.12,
      music: 0.5,
      intensity: this.ghost ? 0.15 : 0.35 + chase + this.spotted * 0.6,
    };
  }

  update(dt) {
    if (this.done) return;
    const s = this.state;
    const p = s.player;
    const hud = s.game.hud;
    const t = s.time;
    const part = this.part;

    this.ghostWarn -= dt;
    // --- Hiding: under a water tower or inside a stairwell hut
    this.hidden = !this.ghost && this._inHideSpot(p.pos);

    // --- Checkpoints: stand on the checkpoint's roof to reach it
    if (p.grounded && !this.ghost) {
      const cps = this.level.checkpoints;
      for (let i = this.cp + 1; i < cps.length; i++) {
        const r = cps[i].roof;
        if (p.pos.x > r.minX && p.pos.x < r.maxX && p.pos.z > r.minZ && p.pos.z < r.maxZ && Math.abs(p.pos.y - r.h) < 1.5) {
          this.cp = i;
          hud.toast('Checkpoint reached', cps[i].name, 'var(--cyan)');
          audio.sfx('checkpoint');
        }
      }
    }
    this._updateCheckpointMarkers(t, dt);

    // --- Clues
    for (const c of this.clueObjs) {
      if (!c.group.visible) continue;
      c.gem.rotation.y += dt * 1.8;
      c.gem.position.y = 1.2 + Math.sin(t * 2.4 + c.pos.x) * 0.15;
      // (Clue Magnet gadget: grab clues from much further away)
      const magnet = this.hasMagnet, r = magnet ? PICKUP_RADIUS * 3 : PICKUP_RADIUS, dy = p.pos.y - c.pos.y;
      if (Math.hypot(p.pos.x - c.pos.x, p.pos.z - c.pos.z) < r && dy > (magnet ? -4 : -1) && dy < (magnet ? 6 : 2.5)) {
        if (this.ghost) this._ghostNotice('Found it! Turn ghost mode off, then come back here to pick it up.');
        else this._pickUpClue(c);
      }
    }

    // --- Helicopter
    if (this.heli && t > part.heli.delay) {
      if (!this.heliAnnounced) {
        this.heliAnnounced = true;
        const c = part.heli.callout;
        if (c) {
          hud.toast(`${SUSPECTS[c.who].name}, on the loudspeaker`, `"${c.line}" Stay out of the spotlight: hide under water towers or in stairwell huts.`, SUSPECTS[c.who].color, 7);
        } else hud.toast('Police helicopter!', 'Stay out of the spotlight.', 'var(--red)');
      }
      const params = { spotSpeed: part.heli.spotSpeed + Math.min(1.2, t / 90), fill: part.heli.fill, lead: part.heli.lead };
      // Gadgets: a holo-decoy draws the spotlight away; smoke hides you.
      this.heli.update(dt, s.policeTarget, params);
      const lit = this.heli.isPlayerLit(p.pos) && !s.concealed;
      this.spotted = clamp(this.spotted + (lit ? dt * params.fill : -dt * 0.55), 0, 1);
      const hiddenNow = !this.heli.seesPlayer || s.concealed || s.policeTarget !== p;
      hud.setMeter(this.spotted, lit ? 'SPOTTED! Get out of the light' : hiddenNow ? 'Hidden' : 'Spotted',
        lit ? 'var(--red)' : '#8a8f9c');
      if (this.spotted >= 1) this._caught('The helicopter pinned you. Back to the last checkpoint.');
    }

    // --- Officers on foot
    if (this.officers && t > (part.officers.delay ?? 4)) {
      if (!this.officersAnnounced) {
        this.officersAnnounced = true;
        hud.toast('Officers on the roof!', 'They\'re slower than you when you sprint, but they don\'t give up. Zip lines lose them.', 'var(--red)', 5);
      }
      const lure = s.policeTarget !== p ? s.policeTarget.pos : null;
      const r = this.officers.update(dt, p, this.hidden || s.concealed || !!lure, lure);
      if (r === 'caught') this._caught('An officer tackled you. Back to the last checkpoint.');
    }

    // --- Fugitive
    if (this.fugitive) {
      this.fugitive.update(dt, p.pos, this.ghost);
      if (!this.ghost && this.fugitive.distanceTo(p.pos) < 1.9) { this._complete(); return; }
    }


    // --- Decor: moving scenery, police lights in the street
    this.level.animate?.(dt);
    for (const m of this.level.policeCars || []) updateSirens(m, t + m.position.x * 0.1);
    if (this.level.beacon) this.level.beacon.material.opacity = 0.12 + Math.sin(t * 3) * 0.04;

    // --- Where to go next
    this._updateMarker();
    const total = Object.keys(this.chapter.clues).length;
    const found = this.run.clues.size;
    hud.setStats(`<span>Time <b>${formatTime(t)}</b></span>` +
      `<span>Clues <b>${found}/${total}</b></span>` +
      (this.ghost ? '<span><b style="color:var(--cyan)">GHOST MODE</b></span>' : `<span${this.run.caught ? ' class="warn"' : ''}>Caught <b>${this.run.caught}</b></span>`) +
      (this.hidden ? '<span><b style="color:var(--safe)">HIDDEN</b></span>' : ''));

    // --- Reached the goal?
    if (part.goal.type === 'reach') {
      const g = this.level.goalPos;
      if (Math.hypot(p.pos.x - g.x, p.pos.z - g.z) < CAR_RADIUS && Math.abs(p.pos.y - g.y) < 2.5) {
        if (this.ghost) this._ghostNotice('Turn ghost mode off to finish this part.');
        else if (part.requiredClue && !this.run.clues.has(part.requiredClue)) {
          this.warnTimer -= dt;
          if (this.warnTimer <= 0) {
            this.warnTimer = 4;
            hud.toast('Not yet!', part.requiredText || 'You still need to find something here.', 'var(--amber)');
          }
        } else this._complete();
      }
    }
  }

  _updateMarker() {
    const s = this.state, p = s.player.pos, hud = s.game.hud;
    if (this.ghost) {
      // Nearest clue we haven't found yet
      let best = null, bd = Infinity;
      for (const c of this.clueObjs) {
        if (!c.group.visible) continue;
        const d = p.distanceTo(c.pos);
        if (d < bd) { bd = d; best = c; }
      }
      if (best) { hud.setMarker(best.pos.clone().setY(best.pos.y + 1.5), s.camera, 'Missing clue', 'var(--amber)', bd); return; }
    }
    const req = this.part.requiredClue;
    if (req && !this.run.clues.has(req)) {
      const c = this.clueObjs.find((x) => x.id === req);
      if (c && this.cp >= (this.part.requiredAfterCheckpoint ?? 0)) {
        hud.setMarker(c.pos.clone().setY(c.pos.y + 1.5), s.camera, this.part.requiredLabel || 'Objective', 'var(--amber)', p.distanceTo(c.pos));
        return;
      }
    }
    // A clue close by? Point at it so it's easy to grab on the way.
    // (the Clue Scanner gadget points to the nearest clue from anywhere)
    let near = null, nd = owns('scanner') ? Infinity : CLUE_HINT;
    for (const c of this.clueObjs) {
      if (!c.group.visible) continue;
      const d = p.distanceTo(c.pos);
      if (d < nd) { nd = d; near = c; }
    }
    if (near) {
      hud.setMarker(near.pos.clone().setY(near.pos.y + 1.5), s.camera, 'Clue', 'var(--amber)', nd);
      return;
    }
    if (this.fugitive && !this.ghost) {
      const f = this.fugitive.pos;
      hud.setMarker(f.clone().setY(f.y + 2.2), s.camera, this.part.fugitive.name, SUSPECTS[this.part.fugitive.who].color, p.distanceTo(f));
      return;
    }
    const next = this.level.checkpoints[this.cp + 1];
    if (next) {
      hud.setMarker(next.spawn.clone().setY(next.spawn.y + 1.5), s.camera, next.name, 'var(--cyan)', p.distanceTo(next.spawn));
    } else {
      const g = this.level.goalPos;
      hud.setMarker(g.clone().setY(g.y + 2), s.camera, this.part.goal.label, 'var(--amber)', p.distanceTo(g));
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
    this.run.clues.add(c.id);
    c.group.visible = false;
    save.addClue(this.chapter.id, c.id);
    const info = this.chapter.clues[c.id];
    audio.sfx('clue');
    const cash = earn(this.state.game, 100, '', { quiet: true });
    this.state.game.hud.toast(`Clue: ${info.name}  (+$${cash})`, info.text, 'var(--amber)', 7);
  }

  _complete() {
    this.done = true;
    audio.sfx('win');
    finishPart(this.state, this);
  }

  /** Admin: finish this part right now. */
  adminSkip() {
    if (!this.done) this._complete();
  }

  teardown() {
    this.heli?.dispose();
    this.officers?.dispose();
    this.fugitive?.dispose();
    this.heli = this.officers = this.fugitive = null;
  }
}

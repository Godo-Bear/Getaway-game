import * as THREE from 'three';
import { LEVELS } from '../../world/levels/index.js';
import { makeGlowMaterial } from '../../world/materials.js';
import { updateSirens } from '../../vehicles/carModel.js';
import { Helicopter } from '../../ai/helicopter.js';
import { OfficerSquad } from '../../ai/officer.js';
import { FugitiveRunner } from '../../ai/fugitive.js';
import { GuardSquad, huntMessages } from '../../ai/guards.js';
import { Crowd } from '../../ai/crowd.js';
import { PlayerModel } from '../../player/playerModel.js';
import { crewLook, POLICE_LOOK, HUNTER_LOOK } from '../../player/people.js';
import { MiniGame } from '../../ui/miniGame.js';
import { CHAPTERS } from '../../story/chapters.js';
import { SUSPECTS } from '../../story/crew.js';
import { getChapterRun } from '../../story/chapterRun.js';
import { finishPart } from '../../story/chapterFlow.js';
import { save } from '../../core/save.js';
import { earn, owns } from '../../gadgets/gadgets.js';
import { admin } from '../../core/admin.js';
import { diff } from '../../core/difficulty.js';
import { formatTime, clamp } from '../../core/utils.js';
import { audio } from '../../core/audio.js';

// A story part played on foot (any chapter). What happens is set by the
// part's data in the chapter file (src/story/chapterN.js):
//
//   level     - which hand-built level to load (src/world/levels/)
//   heli      - a police helicopter with a spotlight (caught = checkpoint)
//   officers  - police officers who chase you across the roofs on foot
//   fugitive  - someone running away along a path: catch them to win
//   patrols   - police officers walking the pavements (the level's
//               patrolRoutes) with vision cones; a crowd (crowdLanes) you
//               can blend into. Sneak up behind one to knock them out (E).
//               patrols: 'hunters' = bounty hunters (orange parkas) instead.
//   recon     - [{ id, label, text }]: walk up to each of the level's
//               reconSpots to take a photo of the job (planning, not
//               detective work). goal.requireRecon: all photos first.
//   goal      - { type: 'reach' } get to the level's goal point (e.g. the car)
//               { type: 'catch' } catch the fugitive
//   requiredClue - a clue you must pick up before the goal counts
//   meetings  - people to meet on the way (Chapter 5): walk up to them, talk,
//               and maybe pass their test (a hacking or safe mini-game).
//               goal.requireMeetings: meet everyone before the goal counts.
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
    this.time = this.part.time || 'night';       // 'night' | 'dawn' | 'day' | 'afternoon' | 'dusk' (or an hour)
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
    this._buildPeople();
    this._buildRecon();
    this.crowd = level.crowdLanes ? new Crowd(level.group, level.world, level.crowdLanes, { perLane: 3, seed: 11, cold: this.weather === 'snow' }) : null;
    return level;
  }

  /** Recon photo spots: a cyan ring and beam at each. */
  _buildRecon() {
    this.recon = [];
    for (const r of this.part.recon || []) {
      const pos = this.level.reconSpots?.[r.id];
      if (!pos) continue;
      const g = new THREE.Group();
      g.position.copy(pos);
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.4, 32), makeGlowMaterial(0x39e6ff, 0.8));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.05;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 24, 10, 1, true), makeGlowMaterial(0x39e6ff, 0.18));
      beam.position.y = 12;
      g.add(ring, beam);
      this.level.group.add(g);
      this.recon.push({ ...r, pos, group: g, ring, taken: false });
    }
  }

  /** Ground-level parts are played in the street: no "climb back up" help. */
  get indoors() {
    return !!this.level?.groundLevel;
  }

  /** People standing around to meet (the level says where, the part says what they say). */
  _buildPeople() {
    this.npcs = [];
    const spots = this.level.meetingSpots;
    if (!spots) return;
    for (const [who, pos] of Object.entries(spots)) {
      const col = parseInt(SUSPECTS[who].color.slice(1), 16);
      const model = new PlayerModel(crewLook(who), { bag: false });
      const body = { pos: pos.clone(), vel: new THREE.Vector3(), facing: 0, state: 'ground', horizontalSpeed: 0, mantleProgress: 0, stateTime: 0, stumbleTimer: 0, mantle: null, wallRun: null };
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 40, 12, 1, true), makeGlowMaterial(col, 0.14));
      beam.position.copy(pos).setY(pos.y + 20);
      this.level.group.add(model.root, beam);
      const def = this.part.meetings?.find((m) => m.who === who) || null;
      this.npcs.push({ id: who, model, body, beam, pos, def, talked: false });
    }
  }

  /** Stand still while a mini-game is on. */
  get inputLocked() {
    return !!this.mini;
  }

  /** The goal is down on the street (Ricky's car): point at it, not at a ladder. */
  get streetMarker() {
    return !!this.level && this.level.goalPos.y < 1.5 && !this._nextMeeting();
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
    this.met = new Set();
    this.meetBlocked = null;
    this._closeMini();
    for (const n of this.npcs) { n.talked = false; n.beam.visible = !!n.def; }
    for (const r of this.recon) { r.taken = false; r.group.visible = true; }

    this._spawnPolice();
    this.heliAnnounced = false;
    this.fugitive?.dispose();
    this.fugitive = null;
    if (part.fugitive) {
      const f = part.fugitive;
      this.fugitive = new FugitiveRunner(s.scene, this.level.fugitivePath, { ...f, speed: (f.speed ?? 8.6) * diff().fugitive });
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
      const o = part.officers;
      this.officers = new OfficerSquad(s.scene, s.world, this.level.officerSpawns, { ...o, speed: (o.speed ?? 0.86) * diff().officerSpeed });
    }
    this.patrols?.dispose();
    this.patrols = null;
    if (part.patrols && this.level.patrolRoutes) {
      this.patrols = new GuardSquad(s.scene, s.world, this.level.patrolRoutes.map((route) => ({ route })),
        { sight: diff().guardSight, look: part.patrols === 'hunters' ? HUNTER_LOOK : POLICE_LOOK, range: 11, alertRange: 15 });
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
      this.patrols?.dispose();
      this.heli = this.officers = this.patrols = null;
      s.setAction(null);
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
    this.patrols?.reset();
    this.fugitive?.resetNear(cp.spawn);
  }

  _caught(message) {
    if (admin.flag('god')) { this.spotted = 0; return; } // admin god mode
    this._closeMini();
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
      if (this.run.clues.has(c.id)) { c.group.visible = false; continue; } // bought on the Case Board
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
      const d = diff();
      const params = { spotSpeed: (part.heli.spotSpeed + Math.min(1.2, t / 90)) * d.spot, fill: part.heli.fill * d.fill, lead: part.heli.lead };
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

    // --- Police on the beat (and the crowd you can hide in)
    this.crowd?.update(dt);
    this.blending = false;
    if (this.patrols) this._updatePatrols(dt);

    // --- People to meet (and their mini-game tests)
    if (this.npcs.length) this._updateMeetings(dt);

    // --- Recon photos (just walk up to the spot)
    for (const r of this.recon) {
      if (r.taken) continue;
      r.ring.rotation.z += dt;
      if (!this.ghost && Math.hypot(p.pos.x - r.pos.x, p.pos.z - r.pos.z) < 2.2 && Math.abs(p.pos.y - r.pos.y) < 2.5) {
        r.taken = true;
        r.group.visible = false;
        audio.sfx('click', { vol: 1 });
        const left = this.recon.filter((x) => !x.taken).length;
        hud.toast(`Photo: ${r.label}`, `${r.text}${left ? ` (${left} more to take)` : ' That\'s every photo.'}`, 'var(--cyan)', 5);
      }
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
      (total ? `<span>Clues <b>${found}/${total}</b></span>` : '') +
      (this.ghost ? '<span><b style="color:var(--cyan)">GHOST MODE</b></span>' : `<span${this.run.caught ? ' class="warn"' : ''}>Caught <b>${this.run.caught}</b></span>`) +
      (this.hidden ? '<span><b style="color:var(--safe)">HIDDEN</b></span>' : '') +
      (this.blending ? '<span><b style="color:var(--safe)">IN THE CROWD</b></span>' : ''));

    // --- Reached the goal?
    if (part.goal.type === 'reach') {
      const g = this.level.goalPos;
      if (Math.hypot(p.pos.x - g.x, p.pos.z - g.z) < CAR_RADIUS && Math.abs(p.pos.y - g.y) < 2.5) {
        if (this.ghost) this._ghostNotice('Turn ghost mode off to finish this part.');
        else if (part.goal.requireRecon && this.recon.some((r) => !r.taken)) {
          this.warnTimer -= dt;
          if (this.warnTimer <= 0) { this.warnTimer = 4; hud.toast('Not yet!', 'Take all the recon photos first (the cyan beams).', 'var(--amber)'); }
        } else if (part.goal.requireMeetings && this._nextMeeting()) {
          this.warnTimer -= dt;
          if (this.warnTimer <= 0) {
            this.warnTimer = 4;
            hud.toast('Not yet!', `You still need to meet ${SUSPECTS[this._nextMeeting().id].name}.`, 'var(--amber)');
          }
        } else if (part.requiredClue && !this.run.clues.has(part.requiredClue)) {
          this.warnTimer -= dt;
          if (this.warnTimer <= 0) {
            this.warnTimer = 4;
            hud.toast('Not yet!', part.requiredText || 'You still need to find something here.', 'var(--amber)');
          }
        } else this._complete();
      }
    }
  }

  _updatePatrols(dt) {
    const s = this.state, p = s.player, hud = s.game.hud;
    // Walking (not sprinting) right next to people: you're just another face in the crowd
    this.blending = !!this.crowd && p.horizontalSpeed < 4.6 && p.grounded && this.crowd.blendsIn(p.pos);
    // In everyday clothes in daylight, they only recognise you closer up (a balaclava gets noticed)
    const daylight = (s.lighting?.daylight ?? 0) > 0.5, plain = daylight && s.streetClothes;
    this.patrols.sight = diff().guardSight * (plain ? 0.55 : 1);
    if (daylight && !s.streetClothes && !this.lookTip && s.time > 4) {
      this.lookTip = true;
      hud.toast('Broad daylight', 'A balaclava gets noticed. Pause and pick "Your look" to change into everyday clothes: police only recognise you up close.', 'var(--amber)', 6);
    }
    const seen = this.patrols.update(dt, p, this.hidden || s.concealed || !!this.mini || this.blending);
    if (this.patrols.bodyFound && !this.patrols.alert) {
      this.patrols.setAlert(true);
      hud.toast('Officer down!', 'Another cop found the officer you knocked out. They\'re all on alert now: they see further and walk faster.', 'var(--red)', 6);
    }
    const d = diff();
    this.spotted = clamp(this.spotted + (seen ? (dt / 0.9) * d.fill : -dt * 0.5), 0, 1);
    const searching = huntMessages(this.patrols, hud, this.part.patrols === 'hunters' ? 'bounty hunters' : 'police');
    hud.setMeter(this.spotted, seen ? 'SEEN! Get out of sight' : searching || 'Keep a low profile', seen ? 'var(--red)' : searching ? '#ff7a1a' : '#8a8f9c');
    if (this.spotted >= 1) { this._caught('A police officer recognised you. Back to the last checkpoint.'); return; }
    // Sneak takedown: behind an officer, press E (X on a gamepad, the button on a phone)
    const target = !this.mini ? this.patrols.takedownTarget(p) : null;
    s.setAction(target ? 'Knock out' : null);
    if (target && s.game.input.wasPressed('interact')) {
      this.patrols.takedown(target);
      s.setAction(null);
      audio.sfx('land', { vol: 1 });
      hud.toast('Knocked out', 'Keep moving: if another officer finds them, the whole squad goes on alert.', 'var(--amber)', 4);
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
    const meet = !this.ghost && this._nextMeeting();
    if (meet) {
      hud.setMarker(meet.pos.clone().setY(meet.pos.y + 2.4), s.camera, `Meet ${SUSPECTS[meet.id].name}`, SUSPECTS[meet.id].color, p.distanceTo(meet.pos));
      return;
    }
    if (!this.ghost && this.recon.some((r) => !r.taken)) {
      let best = null, bd = Infinity;
      for (const r of this.recon) { if (r.taken) continue; const d = p.distanceTo(r.pos); if (d < bd) { bd = d; best = r; } }
      hud.setMarker(best.pos.clone().setY(best.pos.y + 2.4), s.camera, `Photo: ${best.label}`, 'var(--cyan)', bd);
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

  // ------------------------------------------------------------------
  // Meetings
  // ------------------------------------------------------------------
  /** The next person you still have to meet (in order), or null. */
  _nextMeeting() {
    return this.npcs.find((n) => n.def && !this.met.has(n.id)) || null;
  }

  _updateMeetings(dt) {
    const s = this.state, p = s.player.pos, input = s.game.input;
    for (const n of this.npcs) {
      // Face you when you're close; idle otherwise
      if (Math.hypot(p.x - n.pos.x, p.z - n.pos.z) < 12) n.body.facing = Math.atan2(p.x - n.pos.x, p.z - n.pos.z);
      n.model.update(dt, n.body);
    }
    if (this.mini) {
      if (input.wasPressed('crouch')) { this.meetBlocked = this.miniFor; this._closeMini(); return; }
      const r = this.mini.update(dt, input.wasPressed('jump'));
      if (r === 'done') { const n = this.miniFor; this._closeMini(); this._metDone(n); }
      return;
    }
    const next = this._nextMeeting();
    if (!next || this.ghost) return;
    const d = Math.hypot(p.x - next.pos.x, p.z - next.pos.z), near = d < 2.6 && Math.abs(p.y - next.pos.y) < 2;
    if (this.meetBlocked === next) { if (d > 4) this.meetBlocked = null; return; }
    if (!near) return;
    if (next.talked || s.game.speedrun) { this._afterTalk(next); return; }
    next.talked = true;
    s.showStoryCards(next.def.pages, next.def.task ? 'Show me' : 'Welcome aboard', () => this._afterTalk(next));
  }

  _afterTalk(n) {
    n.talked = true;
    if (n.def.task) {
      this.miniFor = n;
      this.mini = new MiniGame({ type: n.def.task, title: n.def.taskTitle, hint: 'Jump (Space / A / tap) when it lines up · C to step away' });
    } else this._metDone(n);
  }

  _metDone(n) {
    this.met.add(n.id);
    n.beam.visible = false;
    const cp = this.level.meetingCheckpoint?.[n.id];
    if (cp != null && cp > this.cp) this.cp = cp;
    audio.sfx('checkpoint');
    this.state.game.hud.toast(`${SUSPECTS[n.id].name} is in`, n.def.joinText || '', SUSPECTS[n.id].color, 5);
  }

  _closeMini() {
    this.mini?.close();
    this.mini = null;
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
    this._closeMini();
    this.heli?.dispose();
    this.officers?.dispose();
    this.fugitive?.dispose();
    this.patrols?.dispose();
    this.crowd?.dispose();
    this.heli = this.officers = this.fugitive = this.patrols = this.crowd = null;
  }
}

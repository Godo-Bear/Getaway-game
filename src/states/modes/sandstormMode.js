import * as THREE from 'three';
import { buildChapter22Gulch, GULCH_ROUTES, VAULT_DOOR, STAR_SPOT, HANDCAR, START, WIND, BANK } from '../../world/levels/chapter22Gulch.js';
import { GuardSquad, huntMessages } from '../../ai/guards.js';
import { ParticleSystem } from '../../vehicles/particles.js';
import { JACKAL_LOOK } from '../../player/people.js';
import { CHAPTERS } from '../../story/chapters.js';
import { getChapterRun } from '../../story/chapterRun.js';
import { finishPart } from '../../story/chapterFlow.js';
import { admin } from '../../core/admin.js';
import { diff } from '../../core/difficulty.js';
import { formatTime, clamp, lerp } from '../../core/utils.js';
import { noteCaught } from '../../core/jail.js';
import { audio } from '../../core/audio.js';

// Chapter 22, Part 3: DRY GULCH (part id 'gulch').
//
// The Jackals' ghost town, in a sandstorm. Into the old bank, open the vault
// (hold E), take the Star, and get to the handcar at the railway station.
//
// THE STORM comes and goes, round and round:
//   calm (a few seconds: the Jackals can see a long way; the meter counts
//   down to the next gust) -> a gust coming (a couple of seconds' warning)
//   -> the GUST (the air goes thick with sand: you can hardly see, and nor
//   can they: their view shrinks to a few metres) -> it dies down again.
// So: move in the gusts, hide when it clears. Knock Jackals out from behind
// (E). Once you have the Star, they know someone's been in the bank: they go
// on alert (they walk faster and see further, when they can see at all).

const VAULT_TIME = 3.2;      // s holding E at the vault door
const CALM = [6.5, 9.5], RISE = 2.2, GUST = [6, 8], EASE = 2.8;
const SKY = new THREE.Color(0xc89a68), SKY_GUST = new THREE.Color(0x8a6440);
const _v = new THREE.Vector3(), _c = new THREE.Color();
const rand = ([a, b]) => a + Math.random() * (b - a);
const yawTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z) - Math.PI;

export class SandstormMode {
  constructor(state, params) {
    this.state = state;
    this.chapter = CHAPTERS[params.chapterId || 'chapter22'];
    this.partIndex = params.part ?? 2;
    this.part = this.chapter.parts[this.partIndex];
    this.hudSections = ['tl', 'meter', 'controls', 'marker'];
    this.weather = 'clear';
    this.weatherForced = true;
    this.time = this.part.time || 'afternoon';
    this.indoors = true; // (no street ladder helper: the marker shows the way)
  }

  get officers() { return this.guards; }
  get fallY() { return -10; }

  build() {
    const L = buildChapter22Gulch();
    this.level = L;
    const vaultSpot = new THREE.Vector3(18, 0.05, 6.4);
    L.checkpoints = [
      { spawn: START.clone(), yaw: 0, name: 'The gate' },
      { spawn: vaultSpot, yaw: yawTo(vaultSpot, HANDCAR), name: 'The vault' },
    ];
    this.guards = new GuardSquad(L.group, L.world, GULCH_ROUTES.map((route) => ({ route })), { sight: diff().guardSight, look: JACKAL_LOOK, range: 13, alertRange: 16.5 });
    this.sand = new ParticleSystem(L.group, 900);
    L.spawn = START.clone();
    L.spawn.yaw = 0;
    return L;
  }

  start(first) {
    const s = this.state;
    this.run = getChapterRun(s.game, this.chapter.id);
    this.done = false;
    this.cp = 0;
    this.hasStar = false;
    this.t = 0;
    this.told = {};
    // the storm starts calm, with the first gust soon
    this.storm = { phase: 'calm', t: 0, dur: 5 };
    this.dens = 0.05;
    this.sunBase ??= s.lighting.moon.intensity;
    this.hemiBase ??= s.lighting.hemi.intensity;
    this._reset();
    const hud = s.game.hud;
    if (first) hud.showControls(`<kbd>WASD</kbd> move &nbsp; <kbd>C</kbd> crouch (behind cover) &nbsp; <kbd>E</kbd> knock out from behind<br>Hold <kbd>E</kbd> at the vault door &nbsp; move in the GUSTS &nbsp; <kbd>P</kbd> pause`);
    hud.setPhase(`${this.chapter.title} · Part ${this.partIndex + 1}: ${this.part.title}`);
    hud.setObjective(this.part.objective);
    if (first && !s.game.speedrun) s.showStoryCards(this.part.intro, this.part.startLabel || 'Go');
  }

  _reset() {
    const L = this.level;
    this.spotted = 0;
    this.guards.reset();
    this.guards.setAlert(this.hasStar);
    this.state.player.drift.set(0, 0, 0);
    if (!this.hasStar) {
      // (the vault shut again, if you'd opened it)
      this.vaultT = 0;
      this.vaultOpen = false;
      L.vault.hinge.rotation.y = 0;
      if (!L.vault.box) L.vault.box = L.world.addBox(20.4, 0, 7.2, 22.6, 2.4, 8, { tag: 'wall' });
      L.caseM.visible = L.starGlow.visible = true;
      L.ring.visible = false;
    }
  }

  _caught(title, msg) {
    if (admin.flag('god')) { this.spotted = 0; return; }
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

  audioMix() {
    return { wind: 0.3 + this.dens * 0.7, city: 0, engine: 0, siren: 0, music: 0.4, intensity: 0.35 + this.spotted * 0.55 + (this.hasStar ? 0.15 : 0) };
  }

  _tell(key, title, text, color = 'var(--amber)', t = 4) {
    if (this.told[key]) return;
    this.told[key] = true;
    this.state.game.hud.toast(title, text, color, t);
  }

  /** The storm, round and round. Returns { label, color, k } for the meter. */
  _storm(dt) {
    const st = this.storm;
    st.t += dt;
    if (st.t >= st.dur) {
      st.t = 0;
      st.phase = { calm: 'rise', rise: 'gust', gust: 'ease', ease: 'calm' }[st.phase];
      st.dur = { calm: rand(CALM), rise: RISE, gust: rand(GUST), ease: EASE }[st.phase];
      if (st.phase === 'rise') audio.sfx('whoosh', { vol: 0.6, rate: 0.5 });
      if (st.phase === 'gust') this._tell('gust', 'A gust!', 'Kitsu: "Now! They can\'t see a thing. Move!"', 'var(--safe)', 3);
      if (st.phase === 'ease') this._tell('ease', 'It\'s clearing', 'Kitsu: "The gust is dying down. Find somewhere to hide."', 'var(--amber)', 3);
    }
    const k = st.t / st.dur;
    const want = st.phase === 'calm' ? 0.05 : st.phase === 'rise' ? lerp(0.05, 1, k * k) : st.phase === 'gust' ? 1 : lerp(1, 0.05, Math.sqrt(k));
    this.dens = want;
    if (st.phase === 'calm') return { label: `Clear: they can see you. Next gust in ${Math.ceil(st.dur - st.t)}s`, color: '#c8a070', k: k * 0.9 };
    if (st.phase === 'rise') return { label: 'A GUST IS COMING...', color: 'var(--amber)', k: 0.9 + k * 0.1 };
    if (st.phase === 'gust') return { label: 'GUST! They can hardly see: MOVE', color: 'var(--safe)', k: 1 - k };
    return { label: 'It\'s clearing: get behind something', color: 'var(--amber)', k: 0 };
  }

  /** What the storm looks like: thick sand fog, a brown sky, less sun, sand flying past, tumbleweeds. */
  _weather(dt) {
    const s = this.state, d = this.dens, L = this.level, lt = s.lighting;
    const fog = s.scene.fog;
    _c.copy(SKY).lerp(SKY_GUST, d);
    fog.color.copy(_c).multiplyScalar(lt.daylight * 0.75 + 0.25);
    fog.near = lerp(26, 0.5, d);
    fog.far = lerp(130, 13, d);
    s.scene.background?.copy(fog.color);
    if (lt.sky) lt.sky.visible = false; // (no blue sky, no clouds: just the brown air)
    lt.moon.intensity = this.sunBase * (1 - 0.6 * d);
    lt.hemi.intensity = this.hemiBase * (1 - 0.3 * d);
    // sand flying past (upwind of the camera)
    const cam = s.camera.position, n = (25 + 170 * d) * dt;
    this.sandAcc = (this.sandAcc || 0) + n;
    const speed = 9 + 15 * d;
    while (this.sandAcc > 1) {
      this.sandAcc -= 1;
      const x = cam.x - WIND.x * 14 + (Math.random() - 0.5) * 30, z = cam.z - WIND.z * 14 + (Math.random() - 0.5) * 30;
      this.sand.emit(x, 0.3 + Math.random() * 6, z, {
        vx: WIND.x * speed, vy: (Math.random() - 0.4) * 1.2, vz: WIND.z * speed,
        size: 1.6 + Math.random() * 2.6, grow: 1.5, life: 1.8, alpha: 0.08 + 0.2 * d, color: [0.78, 0.6, 0.4], drag: 0, fadeIn: 0.3 });
    }
    this.sand.setDaylight(lt.daylight * 0.8 + 0.2);
    this.sand.update(dt);
    // tumbleweeds bounce along in the wind, and come round again
    for (const tw of L.tumbleweeds) {
      const v = tw.v * (1 + 2.2 * d);
      tw.m.position.x += WIND.x * v * dt;
      tw.m.position.z += WIND.z * v * dt;
      tw.hop += dt * (2 + v * 0.4);
      tw.m.position.y = 0.6 + Math.abs(Math.sin(tw.hop)) * (0.3 + d * 0.8);
      tw.m.rotation.z += v * dt / 0.6;
      if (tw.m.position.x < -36) { tw.m.position.x = 34; tw.m.position.z = 55 - Math.random() * 160; }
    }
    // in a gust, the wind leans on you a little (outdoors)
    s.player.drift.copy(WIND).multiplyScalar(this.inside ? 0 : 1.4 * d * d);
  }

  update(dt) {
    if (this.done) return;
    const s = this.state, L = this.level, p = s.player, pos = p.pos, hud = s.game.hud, input = s.game.input, d = diff();
    this.t += dt;
    this.inside = pos.x > BANK.x0 && pos.x < BANK.x1 && pos.z > BANK.z0 && pos.z < BANK.z1;
    const meter = this._storm(dt);
    this._weather(dt);
    // the storm shrinks how far the Jackals can see
    this.guards.sight = d.guardSight * lerp(1, 0.2, this.dens);

    // --- Seen?
    const seen = this.guards.update(dt, p, s.concealed);
    const searching = huntMessages(this.guards, hud, 'Jackals');
    this.spotted = clamp(this.spotted + (seen ? (dt / 0.85) * d.fill : -dt * 0.5), 0, 1);
    if (this.spotted >= 1) {
      this._caught('Caught', this.hasStar
        ? 'The Jackals got you, and the Star. Wait for a gust before you cross the open street, and keep behind the wagons and the barrels when it clears.'
        : 'A Jackal saw you. Move when a GUST blows through (the meter shows it), and hide behind something (C to crouch) when it clears.');
      return;
    }
    if (this.spotted > 0.01) hud.setMeter(this.spotted, seen ? 'A JACKAL CAN SEE YOU!' : searching || 'Hidden', seen ? 'var(--red)' : '#ff7a1a');
    else if (searching) hud.setMeter(0, searching, '#ff7a1a');
    else hud.setMeter(meter.k, meter.label, meter.color);

    // --- What you can do: knock someone out, open the vault, take the Star
    let action = null;
    const ko = this.guards.takedownTarget(p);
    const atVault = !this.vaultOpen && Math.abs(pos.x - VAULT_DOOR.x) < 1.4 && pos.z < VAULT_DOOR.z && pos.z > VAULT_DOOR.z - 1.8 && pos.y < 1;
    const atStar = this.vaultOpen && !this.hasStar && Math.hypot(pos.x - STAR_SPOT.x, pos.z - STAR_SPOT.z) < 1.7;
    if (ko) {
      action = 'Knock out';
      if (input.wasPressed('interact')) {
        this.guards.takedown(ko);
        action = null;
        audio.sfx('land', { vol: 1 });
        hud.toast('Knocked out', '', 'var(--amber)', 1.5);
      }
    } else if (atVault) {
      action = 'Open the vault (hold)';
      if (input.isDown('interact')) {
        this.vaultT += dt / VAULT_TIME;
        if (Math.random() < dt * 6) audio.sfx('step', { vol: 0.35, rate: 2.2 });
        if (this.vaultT >= 1) this._openVault();
      }
      if (this.spotted <= 0.01) hud.setMeter(this.vaultT, 'Turning the old dial...', '#ffd070');
    } else if (atStar) {
      action = 'Take the Star';
      if (input.wasPressed('interact')) this._takeStar();
    }
    s.setAction(action);
    // the vault door swings open
    if (this.vaultOpen) L.vault.hinge.rotation.y += (1.9 - L.vault.hinge.rotation.y) * Math.min(1, dt * 3);
    L.lamp.intensity = 18 * (0.85 + Math.sin(this.t * 13) * 0.08 + Math.sin(this.t * 7.3) * 0.07); // (an oil lamp flickers)
    if (L.starGlow.visible) L.starGlow.material.opacity = 0.35 + Math.sin(this.t * 4) * 0.15;

    // --- Out: the handcar at the station
    if (this.hasStar) {
      L.ring.rotation.z += dt;
      if (Math.hypot(pos.x - HANDCAR.x, pos.z - HANDCAR.z) < 3) { this._finish(); return; }
    }

    // --- Where next
    const inBank = this.inside;
    let t, label;
    if (this.hasStar) { t = _v.copy(HANDCAR).setY(1.5); label = 'The handcar'; }
    else if (this.vaultOpen) { t = _v.copy(STAR_SPOT).setY(1.6); label = 'The Star'; }
    else if (inBank) { t = _v.copy(VAULT_DOOR).setY(1.4); label = 'The vault'; }
    else { t = _v.set(BANK.x0 - 0.5, 1.6, 3.2); label = 'The bank'; }
    hud.setMarker(t, s.camera, label, 'var(--amber)', Math.hypot(t.x - pos.x, t.z - pos.z));
    if (pos.z < 30) this._tell('bank', 'The bank', 'Mags: "Front door, or round the back from the alley. One of them is inside."', 'var(--amber)', 3.5);
    hud.setStats(`<span>Star <b>${this.hasStar ? 'got it' : 'no'}</b></span><span>Storm <b>${this.storm.phase === 'gust' ? 'GUST' : this.storm.phase === 'calm' ? 'clear' : '...'}</b></span>` +
      `<span>Time <b>${formatTime(s.time)}</b></span><span${this.run.caught ? ' class="warn"' : ''}>Caught <b>${this.run.caught}</b></span>`);
  }

  _openVault() {
    const L = this.level;
    this.vaultOpen = true;
    if (L.vault.box) { L.world.removeBox(L.vault.box); L.vault.box = null; }
    audio.sfx('clang', { vol: 0.9, rate: 0.7 });
    this.state.game.hud.toast('It\'s open', 'The old door swings out with a long, rusty groan. And there, on the shelf: the silver case.', '#ffd070', 3);
  }

  _takeStar() {
    const s = this.state, L = this.level, hud = s.game.hud;
    this.hasStar = true;
    L.caseM.visible = L.starGlow.visible = false;
    L.ring.visible = true;
    this.cp = 1;
    this.guards.setAlert(true);
    audio.sfx('pickup');
    hud.setObjective('Get to the handcar at the station');
    hud.toast('The Star!', 'Sable, on a Jackal\'s radio, somewhere out in the storm: "Somebody\'s in the bank! Find them!"', 'var(--red)', 4);
  }

  _finish() {
    if (this.done) return;
    this.done = true;
    const s = this.state;
    s.player.drift.set(0, 0, 0);
    s.game.hud.setMeter(0, '');
    audio.sfx('win');
    finishPart(s, this);
  }

  adminSkip() { this._finish(); }

  teardown() {
    const s = this.state;
    s.player?.drift.set(0, 0, 0);
    if (s.lighting?.sky) s.lighting.sky.visible = true;
    s.lighting?.setTime?.(s.lighting.hour); // (the fog and the sky back to normal)
  }
}

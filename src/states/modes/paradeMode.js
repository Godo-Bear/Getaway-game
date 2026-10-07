import * as THREE from 'three';
import { buildChapter15Festival } from '../../world/levels/chapter15Festival.js';
import { MovingPlatform } from '../../world/movingPlatform.js';
import { makeGlowMaterial } from '../../world/materials.js';
import { GuardSquad, huntMessages } from '../../ai/guards.js';
import { Crowd } from '../../ai/crowd.js';
import { PlayerModel } from '../../player/playerModel.js';
import { POLICE_LOOK } from '../../player/people.js';
import { CHAPTERS } from '../../story/chapters.js';
import { getChapterRun } from '../../story/chapterRun.js';
import { finishPart } from '../../story/chapterFlow.js';
import { earn } from '../../gadgets/gadgets.js';
import { admin } from '../../core/admin.js';
import { diff } from '../../core/difficulty.js';
import { formatTime, clamp, makeRng } from '../../core/utils.js';
import { noteCaught } from '../../core/jail.js';
import { audio } from '../../core/audio.js';

// Chapter 15, Part 1: the Festa de São Sereno.
//
//  THE COSTUME: you're dressed as a "cabeçudo", a dancer in a giant
//  papier-mâché head, like the dancers in the parade. Keep with the parade
//  (near a dancer or a float) and don't sprint, and the police on the
//  pavements can't tell you from the rest.
//  THE GALLEON: Varga's money rides in a chest on the golden galleon float.
//  Climb aboard while it moves (it carries you), and pick the chest's lock:
//  hold E. Two of Varga's men stand at the bow and the stern, turning
//  between watching the street and watching the deck (their cones show
//  which): pick only while both look away.
//  THE BLACKOUT: once you have the money, Theo cuts the power. Every
//  lantern on the street goes out: the police are alert but half blind for
//  half a minute. Run up to the funicular station on the cathedral square.

const SPEED = 1.25;             // the parade's walking pace (m/s)
const PICK = 4.2;               // seconds of lock picking
const BLACKOUT = 32;            // seconds of darkness
const CASH = 700;
const VARGA_LOOK = { hoodie: 0x2a2b31, trousers: 0x1a1b20, gloves: 0x1a1b20, shirt: 0xe8e8e8, tie: 0x8a1a2a, hat: 0x1a1b20, style: { top: 'leather', hat: 'cap' } };
const COSTUME = { hoodie: 0xe8743a, trousers: 0x24324a, hat: 0xf0c8a0, hatBand: 0x5a2a10, tie: 0xd8344e, style: { top: 'hawaiian', hat: 'bighead', bag: false } };
const SHIRTS = [0xe8743a, 0x3aa3a0, 0xe8c040, 0xe87ab0, 0x7ab8e8, 0x5ac87a, 0xc0283a, 0xa86ae8];
const FACES = [0xf0c8a0, 0xe0b090, 0xc4946f, 0x8d5a3b, 0xf0d0b8];
const HAIRS = [0x5a2a10, 0x1a1410, 0xe8c040, 0xc0283a, 0x3a2416, 0xe8e4dc];

const body = (x, y, z, facing, speed = 0) => ({ pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(), facing, state: 'ground', horizontalSpeed: speed, mantleProgress: 0, stateTime: 0, stumbleTimer: 0, mantle: null, wallRun: null });
const _v = new THREE.Vector3();

/** Confetti: little paper squares fired from the floats, fluttering down. */
class Confetti {
  constructor(parent, n = 160) {
    const geo = new THREE.PlaneGeometry(0.12, 0.08);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }), n);
    this.mesh.frustumCulled = false;
    this.bits = [];
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      this.bits.push({ p: new THREE.Vector3(0, -50, 0), v: new THREE.Vector3(), r: Math.random() * 6, s: 1 + Math.random() * 3 });
      this.mesh.setColorAt(i, c.setHex(SHIRTS[i % SHIRTS.length]));
    }
    this.i = 0;
    this.o = new THREE.Object3D();
    parent.add(this.mesh);
  }
  burst(x, y, z, count = 40) {
    for (let k = 0; k < count; k++) {
      const b = this.bits[this.i];
      this.i = (this.i + 1) % this.bits.length;
      b.p.set(x, y, z);
      const a = Math.random() * Math.PI * 2, up = 5 + Math.random() * 5;
      b.v.set(Math.cos(a) * (1 + Math.random() * 3), up, Math.sin(a) * (1 + Math.random() * 3));
    }
  }
  update(dt, t) {
    const o = this.o;
    this.bits.forEach((b, i) => {
      if (b.p.y > -10) {
        b.v.y = Math.max(-1.2, b.v.y - 9 * dt);
        b.v.x *= 1 - dt * 1.5; b.v.z *= 1 - dt * 1.5;
        b.p.addScaledVector(b.v, dt);
        b.p.x += Math.sin(t * b.s + i) * dt * 0.6;
        if (b.p.y < 0.03) { b.p.y = 0.03; b.v.set(0, 0, 0); b.ground = (b.ground || 0) + dt; if (b.ground > 6) { b.p.y = -50; b.ground = 0; } }
      }
      o.position.copy(b.p);
      o.rotation.set(t * b.s + i, t * b.s * 0.7, 0);
      o.updateMatrix();
      this.mesh.setMatrixAt(i, o.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export class ParadeMode {
  constructor(state, params) {
    this.state = state;
    this.chapter = CHAPTERS[params.chapterId || 'chapter15'];
    this.partIndex = params.part || 0;
    this.part = this.chapter.parts[this.partIndex];
    this.hudSections = ['tl', 'meter', 'controls', 'marker'];
    this.weather = 'clear';
    this.weatherForced = true;
    this.time = 'night';
    this.indoors = true;
  }

  get officers() { return this.patrols; }

  build() {
    const L = buildChapter15Festival();
    L.spawn = L.checkpoints[0].spawn.clone();
    L.spawn.yaw = L.checkpoints[0].yaw;
    this.level = L;
    const rng = makeRng(77);
    // the floats (moving platforms), with their riders
    this.floats = L.floats.map((f) => {
      const plat = new MovingPlatform(L.world, f.group, f.boxes, new THREE.Vector3(0, 0, f.start));
      const F = { ...f, plat, z: f.start, riders: [] };
      for (const [x, y, z] of f.players || []) {
        const m = new PlayerModel(this._costume(rng), { bag: false, style: { top: 'tee', hat: 'cap' } });
        m.pose = body(x, y, z, Math.PI);
        f.group.add(m.root);
        F.riders.push(m);
      }
      return F;
    });
    this.galleon = this.floats.find((f) => f.id === 'galleon');
    // Varga's two lookouts on the galleon, and their view cones
    this.lookouts = this.galleon.lookouts.map((d, i) => {
      const m = new PlayerModel(VARGA_LOOK, { bag: false });
      const deckFace = d.z < 0 ? 0 : Math.PI;     // looking along the deck
      const outFace = deckFace + Math.PI;           // looking out at the street
      m.pose = body(d.x, d.y, d.z, outFace);
      this.galleon.group.add(m.root);
      const cone = new THREE.Mesh(new THREE.CircleGeometry(8, 20, -0.95, 1.9).rotateX(-Math.PI / 2), makeGlowMaterial(0xffd040, 0.22));
      cone.position.set(d.x, 2.28, d.z);
      this.galleon.group.add(cone);
      return { ...d, model: m, cone, deckFace, outFace, deck: false, t: i ? 2.2 : 0, turning: 0 };
    });
    // the chest's lid opens when you've got it
    this.chestRing = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.9, 28), makeGlowMaterial(0x4dffa6, 0.85));
    this.chestRing.rotation.x = -Math.PI / 2;
    this.chestRing.position.set(this.galleon.chest.x, 2.25, this.galleon.chest.z);
    this.galleon.group.add(this.chestRing);
    // dancers in big heads, all along the parade
    this.dancers = [];
    for (const f of this.floats) {
      for (const [dx, dz] of [[-3.6, -7], [3.6, -7], [-3.4, 0], [3.4, 0], [-3.6, 7], [3.6, 7], [0, 9]]) {
        const m = new PlayerModel(this._costume(rng), { bag: false });
        L.group.add(m.root);
        m.pose = body(0, 0, 0, Math.PI, SPEED);
        this.dancers.push({ m, f, dx, dz, ph: rng() * 6 });
      }
    }
    this.crowd = new Crowd(L.group, L.world, L.crowdLanes, { perLane: 5, seed: 15 });
    this.patrols = new GuardSquad(L.group, L.world, L.patrolRoutes.map((route) => ({ route })), { sight: diff().guardSight, look: POLICE_LOOK, range: 11, alertRange: 15 });
    this.confetti = new Confetti(L.group);
    return L;
  }

  _costume(rng) {
    const pick = (a) => a[Math.floor(rng() * a.length)];
    return { hoodie: pick(SHIRTS), trousers: pick([0x24324a, 0x1a1b20, 0xe8e8e8, 0x3a3d45]), hat: pick(FACES), hatBand: pick(HAIRS), tie: 0xd8344e, skin: pick(FACES),
      style: { top: pick(['hawaiian', 'tee', 'vest', 'hawaiian']), hat: 'bighead' } };
  }

  start(first) {
    const s = this.state;
    this.run = getChapterRun(s.game, this.chapter.id);
    this.done = false;
    this.cp = 0;
    this._resetParade();
    this.patrols.reset();
    this.patrols.setAlert(false);
    this.patrols.sight = diff().guardSight;
    s.model.setOutfit(COSTUME);
    const hud = s.game.hud;
    hud.setPhase(`${this.chapter.title} · Part ${this.partIndex + 1}: ${this.part.title}`);
    hud.setObjective(this.part.objective);
    if (first && !s.game.speedrun) s.showStoryCards(this.part.intro, this.part.startLabel || 'Go');
  }

  _resetParade() {
    this.t = 0;
    this.spotted = 0;
    this.deckSeen = 0;
    this.pick = 0;
    this.haveMoney = false;
    this.alarm = false;
    this.dark = 0;
    this.burstT = 1;
    this.lateWarn = false;
    this._setLights(true);
    for (const f of this.floats) { f.z = f.start; f.plat.moveTo(_v.set(0, 0, f.start)); }
    for (const l of this.lookouts) { l.deck = false; l.t = l.z < 0 ? 0 : 2.2; l.turning = 0; }
    this.galleon.group.children.forEach((c) => { if (c.userData.lid) c.rotation.x = 0; });
    this.chestRing.visible = true;
  }

  _setLights(on) {
    const L = this.level;
    L.lanterns.visible = on;
    L.sqLights.visible = on;
    for (const w of L.windows) w.visible = on;
    this.state.lighting.under = on ? 0 : 0.65;
  }

  _caught(title, msg) {
    if (admin.flag('god')) { this.spotted = 0; this.deckSeen = 0; return; }
    if (noteCaught(this.state)) return; // (the third time: off to jail)
    this.run.caught++;
    audio.sfx('caught');
    this._toCheckpoint(title, msg);
  }

  _toCheckpoint(title, msg, color = 'var(--red)') {
    const s = this.state;
    this.spotted = 0;
    this.deckSeen = 0;
    this.patrols.reset();
    if (this.cp === 0) {
      // start the parade again
      this._resetParade();
      this.patrols.setAlert(false);
      s.placePlayer(this.level.checkpoints[0].spawn, 0);
    } else {
      // after the grab: back in the side street, the blackout starting again
      this.dark = BLACKOUT * diff().timer;
      this._setLights(false);
      this.patrols.setAlert(true);
      s.placePlayer(this.cpSpawn, this.cpYaw);
    }
    s.flash(title, msg, color);
  }

  onRespawnKey() { this._toCheckpoint('Checkpoint', this.cp ? 'Back to where you got off the galleon.' : 'The parade starts again.', 'var(--cyan)'); }
  onFall() { this.onRespawnKey(); }

  audioMix() {
    return { siren: this.alarm ? 0.2 : 0, wind: 0.05, city: 0.35, music: 0.65, intensity: this.alarm ? 0.85 : 0.35 + this.spotted * 0.5 };
  }

  update(dt) {
    if (this.done) return;
    const s = this.state, p = s.player, pos = p.pos, hud = s.game.hud, input = s.game.input, d = diff();
    this.t += dt;

    // --- The parade moves up the street (the floats carry whoever's on them)
    for (const f of this.floats) {
      f.z = Math.max(f.end, f.start - this.t * SPEED);
      f.plat.moveTo(_v.set(0, 0, f.z), p);
      for (const r of f.riders) { r.pose.horizontalSpeed = 0; r.update(dt, r.pose); r.root.position.y += Math.abs(Math.sin(this.t * 4 + r.pose.pos.x)) * 0.12; }
    }
    const moving = this.galleon.z > this.galleon.end;
    for (const dn of this.dancers) {
      const pz = dn.f.z + dn.dz;
      dn.m.pose.pos.set(dn.dx + Math.sin(this.t * 1.3 + dn.ph) * 0.8, 0, pz);
      dn.m.pose.facing = Math.PI + Math.sin(this.t * 2 + dn.ph) * 0.6;
      dn.m.pose.horizontalSpeed = dn.f.z > dn.f.end ? SPEED + 0.4 : 0;
      dn.m.update(dt, dn.m.pose);
      dn.m.root.position.y = Math.abs(Math.sin(this.t * 5 + dn.ph)) * 0.18; // (a little hop to the drums)
    }
    // confetti from the floats every so often
    if ((this.burstT -= dt) <= 0) {
      this.burstT = 1.6 + Math.random() * 1.8;
      const f = this.floats[Math.floor(Math.random() * this.floats.length)];
      this.confetti.burst((Math.random() - 0.5) * 3, 4, f.z, 30);
    }
    this.confetti.update(dt, this.t);
    this.crowd.update(dt, p);

    // --- Varga's lookouts on the galleon: watch the street, turn, watch the deck
    const g = this.galleon;
    const onDeck = pos.y > 1.9 && Math.abs(pos.x) < 2.8 && pos.z > g.z - 6.8 && pos.z < g.z + 6;
    let deckSeen = false;
    for (const l of this.lookouts) {
      l.t += dt;
      const outFor = (l.z < 0 ? 5.5 : 4.6) / Math.max(0.7, d.timer), deckFor = l.z < 0 ? 3.2 : 2.8;
      if (!l.deck && l.t > outFor) { l.deck = true; l.t = 0; }
      else if (l.deck && l.t > deckFor) { l.deck = false; l.t = 0; }
      const warn = !l.deck && l.t > outFor - 0.9; // (turning round: a moment's warning)
      const want = l.deck ? l.deckFace : warn ? l.outFace + 0.9 * Math.sign(l.z) : l.outFace;
      l.model.pose.facing += (want - l.model.pose.facing) * Math.min(1, dt * 8);
      l.model.update(dt, l.model.pose);
      l.cone.rotation.y = l.model.pose.facing - Math.PI / 2;
      l.cone.material.color.setHex(l.deck ? 0xff3030 : warn ? 0xff9a20 : 0xffd040);
      l.cone.material.opacity = l.deck ? 0.3 : 0.18;
      // can he see you on the deck?
      if (l.deck && onDeck && !this.haveMoney) {
        const lx = pos.x - l.x, lz = pos.z - (g.z + l.z);
        const dist = Math.hypot(lx, lz);
        const fx = Math.sin(l.model.pose.facing), fz = Math.cos(l.model.pose.facing);
        if (dist < 8.5 && (lx * fx + lz * fz) / Math.max(dist, 0.01) > Math.cos(0.95) && !s.concealed && !admin.flag('unseen')) deckSeen = true;
      }
    }
    this.deckSeen = clamp(this.deckSeen + (deckSeen ? dt / 0.55 * d.fill : -dt * 0.6), 0, 1);
    if (this.deckSeen >= 1) {
      this._caught('Varga\'s men!', 'A lookout turned round and saw you at the chest. Watch their cones: pick the lock only while both are yellow (looking out at the street). Orange means he\'s about to turn.');
      return;
    }

    // --- The chest: hold E to pick the lock
    const C = _v.set(g.chest.x, g.chest.y, g.z + g.chest.z);
    const atChest = !this.haveMoney && onDeck && Math.hypot(pos.x - C.x, pos.z - C.z) < 1.5;
    s.setAction(atChest ? 'Pick the lock (hold)' : null);
    if (atChest && input.isDown('interact')) {
      this.pick += dt / (PICK * (d.timer > 1.2 ? 0.85 : 1));
      if (Math.floor(this.t * 4) !== Math.floor((this.t - dt) * 4)) audio.sfx('click', { vol: 0.35 });
      if (this.pick >= 1) this._grab();
    }
    this.chestRing.visible = !this.haveMoney;

    // --- The police on the pavements (you blend in with the parade)
    const nearParade = this.dancers.some((dn) => Math.hypot(dn.m.pose.pos.x - pos.x, dn.m.pose.pos.z - pos.z) < 6)
      || this.floats.some((f) => Math.abs(pos.x) < 7 && Math.abs(pos.z - f.z) < 9);
    this.blending = !this.haveMoney && nearParade && !p.sprinting && (p.grounded || onDeck);
    if (this.dark > 0) {
      this.dark -= dt;
      this.patrols.sight = d.guardSight * 0.45;
      if (this.dark <= 0) { this._setLights(true); this.patrols.sight = d.guardSight; hud.toast('The lights are back!', 'Theo: "That\'s all the dark I could buy you! Run!"', 'var(--amber)', 3); }
    }
    const seen = this.patrols.update(dt, p, s.concealed || this.blending || onDeck);
    if (this.patrols.bodyFound && !this.patrols.alert) {
      this.patrols.setAlert(true);
      hud.toast('Officer down!', 'Another officer found the one you knocked out. They\'re all on alert.', 'var(--red)', 4);
    }
    this.spotted = clamp(this.spotted + (seen ? (dt / 0.9) * d.fill : -dt * 0.5), 0, 1);
    const searching = huntMessages(this.patrols, hud, 'police');
    if (atChest && this.pick > 0 && this.deckSeen < 0.05 && this.spotted < 0.05) hud.setMeter(this.pick, 'Picking the lock...', 'var(--cyan)');
    else if (this.deckSeen > 0.01) hud.setMeter(this.deckSeen, 'A LOOKOUT SEES YOU!', 'var(--red)');
    else hud.setMeter(this.spotted, seen ? 'SEEN! Get back in the parade' : searching || (this.blending ? 'Dancing with the parade' : 'Keep with the parade, don\'t sprint'), seen ? 'var(--red)' : searching ? '#ff7a1a' : this.blending ? 'var(--safe)' : '#8a8f9c');
    if (this.spotted >= 1) {
      this._caught('Recognised!', this.haveMoney ? 'An officer caught you in the dark. Keep to the shadows and away from the officers\' torches.' : 'An officer picked you out of the crowd. Stay with the dancers and the floats, and don\'t sprint.');
      return;
    }
    // takedowns (not at the chest)
    const target = !atChest ? this.patrols.takedownTarget(p) : null;
    if (target) s.setAction('Knock out');
    if (target && input.wasPressed('interact')) {
      this.patrols.takedown(target);
      s.setAction(null);
      audio.sfx('land', { vol: 1 });
    }

    // --- Too late: the galleon reaches the cathedral
    if (!this.haveMoney && !moving) {
      this._toCheckpoint('Too late', 'The galleon reached the cathedral and Varga\'s men carried the chest inside. The parade starts again: get aboard sooner.', 'var(--amber)');
      return;
    }
    if (!this.haveMoney && !this.lateWarn && g.z < -60) { this.lateWarn = true; hud.toast('Hurry!', 'Mags: "The galleon\'s nearly at the square. Once it\'s there, the money goes inside!"', 'var(--amber)', 4); }

    // --- The way out: the funicular station
    const G = this.level.goal;
    if (this.haveMoney && Math.hypot(pos.x - G.x, pos.z - G.z) < 2.4) { this._finish(); return; }
    this.level.goalGlow.visible = this.level.goalBeam.visible = this.haveMoney;

    this._updateMarker(onDeck);
    hud.setStats(`<span>${this.haveMoney ? 'Money <b>got it</b>' : `Galleon <b>${Math.max(0, Math.round((g.z - g.end) / SPEED))}s</b> from the square`}</span>` +
      (this.dark > 0 ? `<span class="warn">Blackout <b>${Math.ceil(this.dark)}s</b></span>` : '') +
      `<span>Time <b>${formatTime(s.time)}</b></span><span${this.run.caught ? ' class="warn"' : ''}>Caught <b>${this.run.caught}</b></span>`);
  }

  _grab() {
    const s = this.state, hud = s.game.hud, p = s.player;
    this.haveMoney = true;
    this.cp = 1;
    this.cpSpawn = new THREE.Vector3(-8.4, 0.05, this.galleon.z);
    this.cpYaw = 0;
    earn(s.game, CASH, '', { quiet: true });
    audio.sfx('cash');
    s.model.setOutfit({ ...COSTUME, style: { ...COSTUME.style, bag: true } });
    s.setAction(null);
    // the alarm, then the blackout
    this.alarm = true;
    this.patrols.setAlert(true);
    this.dark = BLACKOUT * diff().timer;
    this._setLights(false);
    this.confetti.burst(p.pos.x, p.pos.y + 2, p.pos.z, 60);
    audio.sfx('sting');
    hud.setObjective('Run to the funicular station on the cathedral square (east side)');
    hud.toast('Got it!', 'A lookout yells. Then every light on Rua Alta goes out. Theo, on the radio: "Lights out! You\'ve got half a minute of dark. The funicular: east side of the square. GO!"', 'var(--safe)', 6);
  }

  _finish() {
    if (this.done) return;
    this.done = true;
    const s = this.state;
    s.setAction(null);
    s.game.hud.setMeter(0, '');
    audio.sfx('win');
    finishPart(s, this);
  }

  _updateMarker(onDeck) {
    const s = this.state, hud = s.game.hud, pos = s.player.pos, g = this.galleon;
    let t, label, color = 'var(--amber)';
    if (!this.haveMoney) {
      t = _v.set(g.chest.x, g.chest.y + 1.6, g.z + g.chest.z);
      label = onDeck ? (s.game.input.touchMode ? 'The chest (hold the button)' : 'The chest (hold E)') : 'The galleon float';
    } else { const G = this.level.goal; t = _v.set(G.x, 2.2, G.z); label = 'Funicular'; color = 'var(--safe)'; }
    hud.setMarker(t, s.camera, label, color, Math.hypot(t.x - pos.x, t.z - pos.z));
  }

  adminSkip() { this._finish(); }

  teardown() {
    const s = this.state;
    s.setAction?.(null);
    s.model?.setOutfit(null);
    if (s.lighting) s.lighting.under = 0;
    this.patrols?.dispose();
    this.crowd?.dispose();
  }
}

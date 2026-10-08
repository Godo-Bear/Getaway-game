import * as THREE from 'three';
import { buildChapter20Catacombs, cellPos, GUARD_ROUTES } from '../../world/levels/chapter20Catacombs.js';
import { GuardSquad, huntMessages } from '../../ai/guards.js';
import { makeGlowMaterial } from '../../world/materials.js';
import { CHAPTERS } from '../../story/chapters.js';
import { getChapterRun } from '../../story/chapterRun.js';
import { finishPart } from '../../story/chapterFlow.js';
import { earn } from '../../gadgets/gadgets.js';
import { admin } from '../../core/admin.js';
import { diff } from '../../core/difficulty.js';
import { formatTime, clamp } from '../../core/utils.js';
import { noteCaught } from '../../core/jail.js';
import { audio } from '../../core/audio.js';

// Chapter 20, Part 1: THE CATACOMBS (part id 'catacombs').
//
//  Under Lumière: miles of old quarry tunnels, walls of stacked bones, and
//  no light at all but the torch in your hand. Find your way through the
//  maze to the cable vault under the power station and cut the three big
//  cables (hold E at each one): the whole city goes dark.
//
//   - Your torch (E when there's nothing else to do, or L) runs on
//     batteries: about 45 seconds from full. Spare batteries lie about in
//     the tunnels (walk over them). Flat: no torch until you find one.
//   - The power company's night patrol walks the tunnels with torches. In
//     their beam (the yellow fan on the floor) you're seen. And with YOUR
//     torch on, any of them with a clear line to you sees its light, even
//     from behind: switch it off when one is near, and feel your way along
//     in the dark (their torches and the old candles help).
//   - After the cut they go on alert. Out up the ladder by the vault.

const DRAIN = 1 / 45;        // a full torch lasts 45 s
const BATTERY = 0.5;         // each spare battery: half a torch
const CUT_TIME = 1.4;        // s holding E at each cable
const SEE_TORCH = 15;        // m: a guard sees your torch this far away, whichever way they face
const CASH = 1200;
const TORCH_I = 70;          // the torch's brightness
const DARK = 0.9;            // how dark it is down there (1 = black): just enough to make out the walls
const CAVER = { hoodie: 0x4a4234, trousers: 0x2e2a24, gloves: 0x2a2620, shoes: 0x2a2218, style: { top: 'tracksuit', bag: true, hat: 'beanie' } };
const PATROL = { hoodie: 0x1c2a44, trousers: 0x1a2030, hat: 0x1c2a44, shirt: 0xd8d8e0, tie: 0x1a2030, style: { top: 'uniform', hat: 'guard', badge: true } };
// where you go back to when caught: [row, col] to stand on, the way to look, and
// the cells that count as reaching it (the tunnels branch, so a few each)
const CHECKPOINTS = [
  { cell: [1, 1], yaw: Math.PI, near: [] },
  { cell: [7, 2], yaw: Math.PI / 2, near: [[7, 2], [7, 1], [8, 1], [9, 3]] },
  { cell: [9, 13], yaw: Math.PI / 2, near: [[11, 10], [11, 11], [10, 11], [9, 13], [7, 13]] },
  { cell: [3, 16], yaw: -Math.PI / 2, near: [[3, 16], [3, 17], [2, 17], [1, 17]] },
];
const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _from = new THREE.Vector3();

export class CatacombMode {
  constructor(state, params) {
    this.state = state;
    this.chapter = CHAPTERS[params.chapterId || 'chapter20'];
    this.partIndex = params.part ?? 0;
    this.part = this.chapter.parts[this.partIndex];
    this.hudSections = ['tl', 'meter', 'controls', 'marker'];
    this.weather = 'clear';
    this.weatherForced = true;
    this.time = 'night';
    this.indoors = true;
  }

  get officers() { return this.guards; }
  get fallY() { return -6; }

  build() {
    const L = buildChapter20Catacombs();
    this.level = L;
    L.checkpoints = CHECKPOINTS.map((c) => ({ spawn: cellPos(c.cell[0], c.cell[1], 0.05), yaw: c.yaw, near: c.near.map(([r, k]) => cellPos(r, k)) }));
    L.spawn = L.checkpoints[0].spawn.clone();
    L.spawn.yaw = L.checkpoints[0].yaw;
    this.guards = new GuardSquad(L.group, L.world, GUARD_ROUTES.map((route) => ({
      route: route.map(([r, c]) => { const p = cellPos(r, c); return [p.x, p.z]; }),
    })), { sight: diff().guardSight, look: PATROL, range: 9, alertRange: 12 });
    // the guards' torches: a faint beam each, and the two nearest you really light the walls
    const beamGeo = new THREE.ConeGeometry(1.5, 8, 16, 1, true);
    beamGeo.rotateX(-Math.PI / 2);
    beamGeo.translate(0, 0, 4);
    this.beams = this.guards.units.map(() => {
      const b = new THREE.Mesh(beamGeo, makeGlowMaterial(0xfff0c0, 0.06));
      b.material.side = THREE.DoubleSide;
      b.rotation.order = 'YXZ';
      L.group.add(b);
      return b;
    });
    this.guardLights = [0, 1].map(() => {
      const l = new THREE.SpotLight(0xffe8b8, 40, 14, 0.42, 0.6, 1.4);
      L.group.add(l, l.target);
      return l;
    });
    // your torch (in the level, not on the model: the model hides in first person)
    this.torch = new THREE.SpotLight(0xfff4e0, 0, 24, 0.5, 0.55, 1.3);
    L.group.add(this.torch, this.torch.target);
    // ...and the light it spills back onto you and the walls close by
    this.spill = new THREE.PointLight(0xfff0d8, 0, 5, 1.6);
    L.group.add(this.spill);
    // sparks while you cut a cable
    this.spark = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), makeGlowMaterial(0x9ad8ff, 0.9));
    this.spark.visible = false;
    L.group.add(this.spark);
    return L;
  }

  start(first) {
    const s = this.state;
    this.run = getChapterRun(s.game, this.chapter.id);
    this.done = false;
    this.cp = 0;
    s.lighting.dark = DARK;
    s.model.setOutfit(CAVER);
    this.charge = 1;
    this.level.batteries.forEach((b) => { b.taken = false; b.mesh.visible = true; });
    this.level.cables.forEach((c) => { c.cut = false; c.t = 0; c.lamp.material.color.setHex(0x4dff6a); });
    this.level.exitGlow.visible = false;
    this.cutAll = false;
    this._reset(true);
    const hud = s.game.hud;
    if (first) hud.showControls(`<kbd>WASD</kbd> move &nbsp; <kbd>E</kbd> or <kbd>L</kbd> torch on/off &nbsp; <kbd>C</kbd> crouch<br>
      Hold <kbd>E</kbd> at a cable to cut it &nbsp; <kbd>E</kbd> behind a guard: knock out &nbsp; <kbd>P</kbd> pause`);
    hud.setPhase(`${this.chapter.title} · Part ${this.partIndex + 1}: ${this.part.title}`);
    hud.setObjective(this.part.objective);
    if (first && !s.game.speedrun) s.showStoryCards(this.part.intro, this.part.startLabel || 'Go');
  }

  _reset(torch) {
    this.spotted = 0;
    this.torchOn = torch;
    this.guards.reset();
    if (this.cutAll) this.guards.setAlert(true);
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
    this._reset(this.cp === 0); // (further in, you come back with the torch off: there are guards about)
    s.placePlayer(cp.spawn, cp.yaw);
    s.flash(title, msg + (this.cp > 0 ? ' Your torch is off.' : ''), color);
  }

  onRespawnKey() { this._toCheckpoint('Checkpoint', 'Back to the last checkpoint.', 'var(--cyan)'); }
  onFall() { this._toCheckpoint('Whoa', 'Back to the last checkpoint.', 'var(--cyan)'); }

  audioMix() {
    return { wind: 0.04, city: 0, engine: 0, siren: 0, music: 0.35, intensity: 0.25 + this.spotted * 0.65 + (this.cutAll ? 0.2 : 0) };
  }

  _toggleTorch() {
    const hud = this.state.game.hud;
    if (!this.torchOn && this.charge <= 0) { hud.toast('Flat', 'The torch is dead. Find a spare battery (they glow blue).', 'var(--amber)', 2.5); return; }
    this.torchOn = !this.torchOn;
    audio.sfx('flick', { vol: 0.6, rate: 0.7 });
  }

  update(dt) {
    if (this.done) return;
    const s = this.state, L = this.level, p = s.player, pos = p.pos, hud = s.game.hud, input = s.game.input, d = diff();
    s.lighting.dark = DARK;
    const fog = s.scene.fog;
    fog.color.setRGB(0.004, 0.004, 0.006);
    fog.near = 3;
    fog.far = 30;
    s.scene.background?.copy(fog.color);

    // --- The torch: drains while it's on; flickers when it's nearly flat
    if (input.wasPressed('lights')) this._toggleTorch();
    if (this.torchOn) {
      this.charge = Math.max(0, this.charge - dt * DRAIN * (admin.flag('god') ? 0 : 1));
      if (this.charge <= 0) { this.torchOn = false; audio.sfx('flick', { vol: 0.5, rate: 0.5 }); hud.toast('The torch died', 'Find a spare battery (they glow blue), or feel your way in the dark.', 'var(--amber)', 3.5); }
    }
    const flicker = this.charge < 0.15 ? (Math.random() < 0.12 ? 0.25 : 0.85) : 1;
    this.torch.intensity = this.torchOn ? TORCH_I * flicker : 0;
    s.camera.getWorldDirection(_d);
    const fp = s.cam.firstPerson;
    this.torch.position.set(pos.x, pos.y + (p.height < 1.3 ? 0.9 : 1.45), pos.z);
    if (!fp) this.torch.position.addScaledVector(_d.set(_d.x, 0, _d.z).normalize(), 0.35);
    s.camera.getWorldDirection(_d);
    this.torch.target.position.copy(this.torch.position).addScaledVector(_d, 10);
    this.spill.position.copy(this.torch.position).addScaledVector(_d, 0.7);
    this.spill.intensity = this.torchOn ? 2.2 * flicker : 0;

    // --- Batteries: walk over them
    for (const b of L.batteries) {
      if (b.taken) { continue; }
      b.mesh.rotation.y += dt * 1.5;
      if (Math.hypot(pos.x - b.pos.x, pos.z - b.pos.z) < 1.1) {
        b.taken = true;
        b.mesh.visible = false;
        this.charge = Math.min(1, this.charge + BATTERY);
        audio.sfx('coin', { vol: 0.6 });
        hud.toast('Battery', `Torch at ${Math.round(this.charge * 100)}%.`, '#5ab4ff', 2);
      }
    }
    // --- The rats (they scurry along the walls)
    for (const r of L.rats) {
      r.t += dt * 0.35;
      const k = (Math.sin(r.t) + 1) / 2, dir = Math.cos(r.t) >= 0 ? 1 : -1;
      r.g.position.lerpVectors(r.a, r.b, k);
      r.g.rotation.y = Math.atan2(r.b.x - r.a.x, r.b.z - r.a.z) + (dir > 0 ? 0 : Math.PI);
    }

    // --- The guards
    const seenCone = this.guards.update(dt, p, s.concealed);
    const seenTorch = this.torchOn && this.torch.intensity > 0 && !s.concealed && !admin.flag('unseen') && this.guards.units.some((u) => this._seesTorch(u, p));
    if (seenTorch) this.guards.alarmAt(pos);
    this._guardTorches(pos);
    const searching = huntMessages(this.guards, hud, 'guards');
    const seen = seenCone || seenTorch;
    this.spotted = clamp(this.spotted + (seen ? (dt / 0.85) * d.fill : -dt * 0.45), 0, 1);
    if (this.spotted > 0.01) hud.setMeter(this.spotted, seenTorch ? 'They can see your torch! Switch it off' : seenCone ? 'In a guard\'s torch!' : searching || 'Hidden', seen ? 'var(--red)' : '#ff7a1a');
    else if (searching) hud.setMeter(0, searching, '#ff7a1a');
    else hud.setMeter(this.torchOn ? this.charge : 0, this.torchOn ? `Torch ${Math.round(this.charge * 100)}%` : '', this.charge < 0.2 ? 'var(--amber)' : '#fff4d0');
    if (this.spotted >= 1) {
      this._caught('Caught', seenTorch ? 'A guard saw your torch. Switch it off (E) when one of them is near, and feel your way in the dark.' : 'A guard\'s torch found you. Keep out of the yellow fans, or knock them out from behind (E).');
      return;
    }

    // --- Checkpoints
    for (let i = this.cp + 1; i < L.checkpoints.length; i++) {
      if (L.checkpoints[i].near.some((q) => Math.hypot(pos.x - q.x, pos.z - q.z) < 1.6)) { this.cp = i; audio.sfx('checkpoint', { vol: 0.4 }); break; }
    }

    // --- What you can do: knock out a guard, cut a cable, or the torch
    let action = null;
    const ko = this.guards.takedownTarget(p);
    const cable = !ko && L.cables.find((c) => !c.cut && Math.hypot(pos.x - c.pos.x, pos.z - c.pos.z) < 1.4);
    this.spark.visible = false;
    if (ko) {
      action = 'Knock out';
      if (input.wasPressed('interact')) {
        this.guards.takedown(ko);
        action = null;
        audio.sfx('land', { vol: 1 });
        hud.toast('Knocked out', '', 'var(--amber)', 1.5);
      }
    } else if (cable) {
      action = `Cut the cable (hold) ${L.cables.filter((c) => c.cut).length + 1}/3`;
      if (input.isDown('interact')) {
        cable.t += dt / CUT_TIME;
        this.spark.visible = Math.random() < 0.7;
        this.spark.position.set(cable.pos.x + 0.6, 1.2 + Math.random() * 0.5, cable.pos.z + (Math.random() - 0.5) * 0.5);
        this.spark.scale.setScalar(0.5 + Math.random());
        if (Math.random() < dt * 9) audio.sfx('step', { vol: 0.3, rate: 2.6 });
        if (cable.t >= 1) this._cut(cable);
      }
      hud.setMeter(cable.t, 'Cutting...', '#9ad8ff');
    } else {
      action = this.torchOn ? 'Torch off' : 'Torch on';
      if (input.wasPressed('interact')) this._toggleTorch();
    }
    s.setAction(action);

    // --- Out: up the ladder by the vault
    if (this.cutAll) {
      L.exitGlow.material.opacity = 0.5 + Math.sin(s.time * 4) * 0.25;
      if (Math.hypot(pos.x - L.exit.x, pos.z - L.exit.z) < 1.3) { this._finish(); return; }
    }

    // --- The marker
    if (!this.cutAll) hud.setMarker(_v.copy(L.vault).setY(1.6), s.camera, 'The cable vault', 'var(--amber)', Math.hypot(L.vault.x - pos.x, L.vault.z - pos.z));
    else hud.setMarker(_v.copy(L.exit).setY(1.6), s.camera, 'The ladder out', 'var(--safe)', Math.hypot(L.exit.x - pos.x, L.exit.z - pos.z));
    this._stats();
  }

  /** With your torch on: can this guard see its light? (a clear line, close enough, whichever way they face) */
  _seesTorch(u, p) {
    if (u.down || u.stunned > 0) return false;
    const b = u.pc.pos, dx = p.pos.x - b.x, dz = p.pos.z - b.z, dist = Math.hypot(dx, dz);
    if (dist > SEE_TORCH * this.guards.sight || Math.abs(p.pos.y - b.y) > 3) return false;
    _from.set(b.x, b.y + 1.6, b.z);
    _d.set(p.pos.x, p.pos.y + 1.3, p.pos.z).sub(_from);
    const len = _d.length();
    _d.divideScalar(len);
    return !(this.level.world.raycast(_from, _d, len - 0.3) < len - 0.3);
  }

  /** The guards' beams follow where they look; the two closest to you light the tunnel for real. */
  _guardTorches(pos) {
    const units = this.guards.units;
    units.forEach((u, i) => {
      const b = this.beams[i], up = !u.down && !(u.stunned > 0);
      b.visible = up;
      if (!up) return;
      b.position.set(u.pc.pos.x, u.pc.pos.y + 1.35, u.pc.pos.z);
      b.rotation.set(0.14, u.pc.facing, 0);
    });
    const near = units.filter((u) => !u.down && !(u.stunned > 0))
      .sort((a, b) => Math.hypot(a.pc.pos.x - pos.x, a.pc.pos.z - pos.z) - Math.hypot(b.pc.pos.x - pos.x, b.pc.pos.z - pos.z));
    this.guardLights.forEach((l, i) => {
      const u = near[i];
      l.intensity = u ? 40 : 0;
      if (!u) return;
      const f = u.pc.facing;
      l.position.set(u.pc.pos.x + Math.sin(f) * 0.3, u.pc.pos.y + 1.4, u.pc.pos.z + Math.cos(f) * 0.3);
      l.target.position.set(u.pc.pos.x + Math.sin(f) * 7, u.pc.pos.y + 0.3, u.pc.pos.z + Math.cos(f) * 7);
    });
  }

  _cut(cable) {
    const s = this.state, L = this.level, hud = s.game.hud;
    cable.cut = true;
    cable.lamp.material.color.setHex(0xff2a2a);
    this.spark.visible = false;
    audio.sfx('clang', { vol: 0.8, rate: 0.7 });
    const left = L.cables.filter((c) => !c.cut).length;
    if (left > 0) { hud.toast(`Cable cut (${3 - left}/3)`, left === 2 ? 'Kitsu: "Half the city just flickered. Two more."' : 'Kitsu: "The lights are dimming all over town. One more!"', '#9ad8ff', 3); return; }
    this.cutAll = true;
    earn(s.game, CASH, '', { quiet: true });
    audio.sfx('sting', { vol: 0.7 });
    this.guards.setAlert(true);
    L.exitGlow.visible = true;
    hud.setObjective('Up the ladder by the vault to the street');
    hud.toast('Lights out!', 'Kitsu: "That\'s it! Lumière just went dark. All of it. The patrol knows something\'s up: get out, up the ladder by the vault!"', 'var(--safe)', 5);
  }

  _stats() {
    const s = this.state, cut = this.level.cables.filter((c) => c.cut).length;
    s.game.hud.setStats(`<span${this.charge < 0.2 ? ' class="warn"' : ''}>Torch <b>${Math.round(this.charge * 100)}%</b></span><span>Cables <b>${cut}/3</b></span>` +
      `<span>Time <b>${formatTime(s.time)}</b></span><span${this.run.caught ? ' class="warn"' : ''}>Caught <b>${this.run.caught}</b></span>`);
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

  adminSkip() { this._finish(); }

  teardown() {
    const s = this.state;
    s.setAction?.(null);
    if (s.lighting) s.lighting.dark = 0;
    if (s.model) s.model.setOutfit(null);
    this.guards?.dispose();
  }
}

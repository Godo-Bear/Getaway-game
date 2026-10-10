import * as THREE from 'three';
import { buildChapter23Cart, FIRST } from '../../world/levels/chapter23Cart.js';
import { PlayerModel } from '../../player/playerModel.js';
import { crewLook, JACKAL_LOOK } from '../../player/people.js';
import { currentLook } from '../../player/outfits.js';
import { CHAPTERS } from '../../story/chapters.js';
import { getChapterRun } from '../../story/chapterRun.js';
import { finishPart } from '../../story/chapterFlow.js';
import { admin } from '../../core/admin.js';
import { diff } from '../../core/difficulty.js';
import { formatTime, clamp, damp } from '../../core/utils.js';
import { audio } from '../../core/audio.js';

// Chapter 23, Part 5: THE ORE CART (part id 'cart').
//
// Down the old line through the mountain in an ore cart, with Sable's
// Jackals in another one behind you.
//   - It rolls downhill by itself; S brakes.
//   - FORKS: before each one, press A (left tunnel) or D (right tunnel).
//     The way out has a lantern and an EXIT sign; boards with a red X mean
//     a cave-in (you crash into it and lose time: back before the fork).
//   - BENDS: the faster you take a bend, the more the cart wants to tip:
//     lean into it (A on a left bend, D on a right one), and brake for the
//     tight ones. Tip over and it's back to the last checkpoint.
//   - The Jackals' cart: if it catches you, they jump in. Your car gadgets
//     work on it (the EMP stalls it, oil spins it out...).

const G = 9.8, MAXV = 26, MINV = 3, BRAKE = 9;
const TIP = 8, TIP_LEAN = 9;          // m/s² sideways before it tips (leaning into the bend adds TIP_LEAN)
const FORK_ZONE = 45;                  // m before a fork: pick a tunnel
const _p = new THREE.Vector3(), _t = new THREE.Vector3(), _t2 = new THREE.Vector3(), _c = new THREE.Vector3();
const crouch = (x, z, facing) => ({ pos: new THREE.Vector3(x, 0.5, z), vel: new THREE.Vector3(), facing, state: 'crouch', horizontalSpeed: 0, mantleProgress: 0, stateTime: 0, stumbleTimer: 0, mantle: null, wallRun: null });

export class CartMode {
  constructor(state, params) {
    this.state = state;
    this.chapter = CHAPTERS[params.chapterId || 'chapter23'];
    this.partIndex = params.part ?? 4;
    this.part = this.chapter.parts[this.partIndex];
    this.hudSections = ['tl', 'meter', 'controls', 'marker'];
    this.weather = 'clear';
    this.weatherForced = true;
    this.time = this.part.time || 'night';
    this.indoors = true;
  }

  get touchMode() { return 'driving'; }
  get inputLocked() { return true; }
  get fallY() { return -400; }
  /** A vehicle: your car gadgets work here, on the Jackals' cart. */
  get vehicle() { return true; }
  gadgetVehicle() { return { pos: this.pos, fwdX: this.tan.x, fwdZ: this.tan.z }; }
  gadgetTargets() {
    return [{ pos: this.jPos, hit: (t, how) => { this.jHeld = Math.max(this.jHeld, t + (how === 'spin' ? 1.5 : 0)); } }];
  }

  build() {
    const L = buildChapter23Cart();
    this.level = L;
    // the correct way down, in order (the Jackals know it)
    this.route = [];
    for (let id = FIRST; id;) {
      const seg = L.segs[id];
      this.route.push(seg);
      id = seg.next ? (seg.good === 'left' ? seg.next[0] : seg.next[1]) : null;
    }
    this.cum = [];
    let acc = 0;
    for (const seg of this.route) { this.cum.push(acc); acc += seg.len; }
    this.cart = L.cart;
    this.jcart = L.jackalCart;
    L.group.add(this.cart, this.jcart);
    this.me = new PlayerModel();
    this.me.setLook(currentLook(this.state.game.settings));
    this.mePose = crouch(0.3, -0.45, 0);
    this.theo = new PlayerModel(crewLook('theo'), { bag: false });
    this.theoPose = crouch(-0.3, 0.4, 0);
    this.cart.add(this.me.root, this.theo.root);
    this.jackals = [0, 1].map((i) => {
      const m = new PlayerModel(JACKAL_LOOK, { bag: false });
      this.jcart.add(m.root);
      return { m, pose: crouch(i ? -0.3 : 0.3, i ? 0.35 : -0.35, 0) };
    });
    this.lamp = new THREE.SpotLight(0xfff0d0, 70, 40, 0.6, 0.5, 1.2);
    this.spill = new THREE.PointLight(0xffd8a0, 6, 8, 1.6);
    this.jLamp = new THREE.PointLight(0xff9a50, 8, 10, 1.6);
    L.group.add(this.lamp, this.lamp.target, this.spill, this.jLamp);
    this.pos = new THREE.Vector3();
    this.tan = new THREE.Vector3(1, 0, 0);
    this.jPos = new THREE.Vector3();
    return L;
  }

  start(first) {
    const s = this.state;
    if (!this._setup) {
      this.wasFirstPerson = s.cam.firstPerson;
      if (this.wasFirstPerson) s.setFirstPerson(false);
      s.model.root.visible = false;
      this._setup = true;
    }
    this.run = getChapterRun(s.game, this.chapter.id);
    this.done = false;
    this.told = {};
    this.t = 0;
    this.crashes = 0;
    this.cp = { seg: this.route[0], s: 0 };
    this._placeAt(this.cp.seg, this.cp.s, 4);
    const hud = s.game.hud;
    if (first) hud.showControls(`<kbd>A</kbd>/<kbd>D</kbd> lean into the bends, and pick a tunnel at each fork &nbsp; <kbd>S</kbd> brake<br>
      Follow the EXIT signs, not the red X &nbsp; <kbd>R</kbd> checkpoint &nbsp; <kbd>P</kbd> pause`);
    hud.setPhase(`${this.chapter.title} · Part ${this.partIndex + 1}: ${this.part.title}`);
    hud.setObjective(this.part.objective);
    if (first && !s.game.speedrun) s.showStoryCards(this.part.intro, this.part.startLabel || 'Go');
  }

  /** Put the cart at s on a segment (going v), and the Jackals some way behind. */
  _placeAt(seg, s, v = 8) {
    this.seg = seg;
    this.s = s;
    this.v = v;
    this.lean = 0;
    this.tipT = 0;
    this.choice = null;
    this.jHeld = 0;
    this.catchT = 0;
    this.crashT = 0;
    const prog = this._progress(seg, s);
    this.jProg = prog - 32; // (at the very start they're still back in the loading bay, behind the first rail)
    this.jv = v;
    this.gap = 32;
  }

  /** How far along the way out (the correct route) a point is. */
  _progress(seg, s) {
    const i = this.route.indexOf(seg);
    if (i >= 0) return this.cum[i] + s;
    // (on a dead end: you're stuck at its fork)
    const parent = this.route.find((r) => r.next?.includes(seg.id));
    const pi = this.route.indexOf(parent);
    return this.cum[pi] + parent.len;
  }

  /** The point and direction at a distance along the correct route. */
  _routeAt(prog, outP, outT) {
    if (prog < 0) { // (behind the start of the line: carry straight on back)
      this.route[0].curve.getPointAt(0, outP);
      this.route[0].curve.getTangentAt(0, outT);
      outP.addScaledVector(outT, prog);
      return this.route[0];
    }
    let i = this.cum.findIndex((c, k) => prog < c + this.route[k].len);
    if (i < 0) i = this.route.length - 1;
    const seg = this.route[i], u = clamp((prog - this.cum[i]) / seg.len, 0, 1);
    seg.curve.getPointAt(u, outP);
    seg.curve.getTangentAt(u, outT);
    return seg;
  }

  _crash(title, msg, back) {
    if (admin.flag('god') && !back) { this.tipT = 0; this.catchT = 0; return; }
    this.crashes++;
    this.run.caught++;
    audio.sfx('crash', { vol: 1 });
    if (back) this._placeAt(back.seg, back.s, 6);
    else this._placeAt(this.cp.seg, this.cp.s, 6);
    this.state.flash(title, msg, 'var(--red)');
  }

  onRespawnKey() {
    this._placeAt(this.cp.seg, this.cp.s, 6);
    this.state.flash('Checkpoint', 'Back to the last checkpoint.', 'var(--cyan)');
  }

  audioMix() {
    return { engine: 0, siren: 0, wind: 0.15 + (this.v / MAXV) * 0.5, city: 0, music: 0.55, intensity: 0.55 + clamp(1 - this.gap / 40, 0, 1) * 0.35 };
  }

  _tell(key, title, text, color = 'var(--amber)', t = 4) {
    if (this.told[key]) return;
    this.told[key] = true;
    this.state.game.hud.toast(title, text, color, t);
  }

  update(dt) {
    if (this.done) return;
    const s = this.state, L = this.level, input = s.game.input, hud = s.game.hud;
    this.t += dt;
    const seg = this.seg;

    // --- Lean / pick a tunnel; brake
    const li = input.axis('left', 'right');
    this.lean = damp(this.lean, li, 8, dt);
    const toFork = seg.next ? seg.len - this.s : Infinity;
    if (toFork < FORK_ZONE && Math.abs(li) > 0.5) {
      const c = li < 0 ? 'left' : 'right';
      if (c !== this.choice) { this.choice = c; audio.sfx('clang', { vol: 0.35, rate: 1.6 }); }
    }
    const brake = input.isDown('back') || input.isDown('drift');

    // --- Downhill, friction, brakes
    const u = clamp(this.s / seg.len, 0, 1);
    seg.curve.getPointAt(u, this.pos);
    seg.curve.getTangentAt(u, this.tan);
    let a = -G * this.tan.y * 0.95 - (0.25 + 0.006 * this.v * this.v);
    if (brake) a -= BRAKE;
    this.v = clamp(this.v + a * dt, MINV, MAXV);
    this.s += this.v * dt;

    // --- The end of a segment: a fork, a cave-in, or out
    if (this.s >= seg.len - (seg.dead ? 2 : 0)) {
      if (seg.next) {
        const pick = this.choice || 'right';
        const next = L.segs[pick === 'left' ? seg.next[0] : seg.next[1]];
        this.s -= seg.len;
        this.seg = next;
        this.choice = null;
        if (!next.dead) { this.cp = { seg: next, s: 0 }; audio.sfx('checkpoint', { vol: 0.4 }); }
        else this._tell(`deadfork${seg.id}`, 'Boards!', 'Theo: "That\'s the wrong tunnel! The X! The X!"', 'var(--red)', 2.5);
      } else if (seg.dead) {
        const parent = Object.values(L.segs).find((q) => q.next?.includes(seg.id));
        this._crash('Caved in!', 'The tunnel was blocked: boards with a red X mean a cave-in. At a fork, follow the lantern and the EXIT sign (A = left, D = right).', { seg: parent, s: Math.max(0, parent.len - FORK_ZONE - 15) });
        return;
      } else { this._finish(); return; }
    }

    // --- Bends: lean into them, or tip over
    const seg2 = this.seg, u2 = clamp(this.s / seg2.len, 0, 1), du = Math.min(1, u2 + 2 / seg2.len);
    seg2.curve.getTangentAt(u2, _t);
    seg2.curve.getTangentAt(du, _t2);
    const turn = (_t.z * _t2.x - _t.x * _t2.z) / Math.max(0.5, (du - u2) * seg2.len); // (1/m: + = a left bend)
    const lat = this.v * this.v * turn;                                            // m/s² sideways
    const into = clamp(-Math.sign(turn) * this.lean, -1, 1);                        // + = leaning into the bend
    const limit = TIP + TIP_LEAN * clamp(into, 0, 1) - 3 * clamp(-into, 0, 1);
    const danger = Math.abs(lat) / limit;
    this.tipT = danger > 1 ? this.tipT + dt : Math.max(0, this.tipT - dt * 2);
    if (this.tipT > 0.45) {
      this._crash('Tipped over!', 'Too fast round the bend. Lean into the bends (A on a left one, D on a right one), and brake (S) for the tight ones.');
      return;
    }
    if (danger > 0.6 && Math.abs(turn) > 0.004) this._tell('lean', 'Lean!', 'Lean into the bend: A for a left bend, D for a right one. Too fast? Brake (S).', 'var(--amber)', 3);

    // --- The Jackals' cart
    const prog = this._progress(this.seg, this.s);
    if (this.jHeld > 0) { this.jHeld -= dt; this.jv = damp(this.jv, 0, 2, dt); }
    else {
      const gapNow = prog - this.jProg;
      const want = this.v + (gapNow > 40 ? 5 : gapNow > 18 ? 2 : gapNow < 8 ? -0.5 : 1);
      this.jv = damp(this.jv, clamp(want, 4, MAXV) * (diff().fugitive || 1), 2, dt);
    }
    this.jProg = Math.min(this.jProg + this.jv * dt, prog);
    this.gap = prog - this.jProg;
    this._routeAt(this.jProg, this.jPos, _c);
    if (this.gap < 3.5 && this.route.includes(this.seg) && !admin.flag('god')) this.catchT += dt; else this.catchT = Math.max(0, this.catchT - dt);
    if (this.catchT > 1.3) { this._crash('Caught!', 'The Jackals\' cart caught you and they jumped in. Keep your speed up, and use your car gadgets on them (the EMP stalls their cart).'); return; }
    if (this.gap < 15) this._tell('close', 'Right behind you!', 'Theo: "They\'re catching up! Faster! Or use a gadget!"', 'var(--red)', 2.5);

    // --- The carts, you and Theo, the lights
    this._placeMesh(this.cart, this.pos, this.tan, this.lean * 0.18 + (danger > 0.8 ? Math.sin(this.t * 40) * 0.04 : 0));
    this._placeMesh(this.jcart, this.jPos, _c, 0);
    for (const w of this.cart.userData.wheels) w.rotation.x -= this.v * dt / 0.2;
    for (const w of this.jcart.userData.wheels) w.rotation.x -= this.jv * dt / 0.2;
    this.mePose.pos.x = 0.3 - this.lean * 0.15;
    this.theoPose.pos.x = -0.3 - this.lean * 0.15;
    this.me.update(dt, this.mePose);
    this.theo.update(dt, this.theoPose);
    for (const j of this.jackals) j.m.update(dt, j.pose);
    this.lamp.position.copy(this.pos).add(_p.set(0, 1.6, 0));
    this.lamp.target.position.copy(this.pos).addScaledVector(this.tan, 12);
    this.spill.position.copy(this.pos).add(_p.set(0, 2, 0));
    this.jLamp.position.copy(this.jPos).add(_p.set(0, 1.8, 0));
    s.player.teleport(this.pos.x, this.pos.y + 0.5, this.pos.z, 0);
    // outside at last: the night sky
    const outside = this.seg.exit && this.seg.flags[Math.min(this.seg.flags.length - 1, Math.round(u2 * (this.seg.flags.length - 1)))] === 'out';
    s.lighting.dark = damp(s.lighting.dark || 0, outside ? 0 : 0.78, 3, dt);
    if (outside) this._tell('out', 'Outside!', 'The cart bursts out of the mountain into the night. The buffers! Hold on!', 'var(--safe)', 2.5);

    // --- The meter, the panel
    if (danger > 0.55 && Math.abs(turn) > 0.004) hud.setMeter(clamp(danger, 0, 1), `TIPPING! Lean ${turn > 0 ? 'LEFT (A)' : 'RIGHT (D)'}${danger > 0.9 ? ', brake (S)' : ''}`, 'var(--red)');
    else if (this.catchT > 0.05) hud.setMeter(this.catchT / 1.3, 'THE JACKALS ARE ON YOU!', 'var(--red)');
    else if (toFork < FORK_ZONE && this.seg.next) hud.setMeter(1 - toFork / FORK_ZONE, `FORK! ${this.choice ? `Going ${this.choice.toUpperCase()}` : 'A = left tunnel, D = right tunnel'}`, this.choice ? 'var(--cyan)' : 'var(--amber)');
    else hud.setMeter(this.v / MAXV, brake ? 'Braking' : 'Speed', 'var(--cyan)');
    if (toFork < FORK_ZONE) this._tell(`fork${seg.id}`, 'A fork!', 'Pick a tunnel: A = left, D = right. Look for the lantern and the EXIT sign. Boards with a red X = a cave-in.', 'var(--amber)', 3.5);
    const total = this.cum[this.cum.length - 1] + this.route[this.route.length - 1].len;
    hud.setMarker(null);
    hud.setStats(`<span>Speed <b>${Math.round(this.v * 3.6)} km/h</b></span><span${this.gap < 15 ? ' class="warn"' : ''}>Jackals <b>${Math.round(this.gap)} m behind</b></span>` +
      `<span>Way out <b>${Math.round(Math.max(0, total - prog))} m</b></span><span>Time <b>${formatTime(s.time)}</b></span><span${this.crashes ? ' class="warn"' : ''}>Crashes <b>${this.crashes}</b></span>`);
  }

  _placeMesh(mesh, pos, tan, roll) {
    mesh.position.copy(pos);
    mesh.lookAt(pos.x + tan.x, pos.y + tan.y, pos.z + tan.z);
    mesh.rotateZ(roll);
  }

  /** The camera rides behind the cart, low, looking down the line. */
  cameraUpdate(dt, camera) {
    const p = this.pos, t = this.tan;
    _p.copy(p).addScaledVector(t, -5.2);
    _p.y = Math.max(_p.y, p.y) + 2.2;
    camera.position.lerp(_p, Math.min(1, dt * 10) || 1);
    camera.lookAt(p.x + t.x * 7, p.y + t.y * 7 + 0.9, p.z + t.z * 7);
  }

  _finish() {
    if (this.done) return;
    this.done = true;
    const s = this.state;
    audio.sfx('crash', { vol: 0.8 });
    s.game.hud.setMeter(0, '');
    audio.sfx('win');
    finishPart(s, this);
  }

  adminSkip() { this._finish(); }

  teardown() {
    const s = this.state;
    if (s.lighting) s.lighting.dark = 0;
    if (s.model) s.model.root.visible = !s.cam?.firstPerson;
    if (this.wasFirstPerson) s.setFirstPerson?.(true);
  }
}

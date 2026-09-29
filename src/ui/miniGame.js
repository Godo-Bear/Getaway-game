// Mini-games for heists: one button, so they work the same with a keyboard
// (Space), a gamepad (A) or a touch screen (the Jump button, or tap the panel).
//
//   hack - a marker slides back and forth along a bar: press while it's in
//          the green zone. Three hits and you're in (the zone shrinks each time).
//   safe - a dial spins: press when the needle points at the notch. Three
//          numbers and the safe opens.
//
// A miss knocks you back one step (and the mode can make it noisy). The game
// keeps running while you play, so guards can still walk in on you.
//
// Use: const mg = new MiniGame({ type, title }); each frame
//      const r = mg.update(dt, pressed); // 'done' when finished
//      mg.close() when you're finished with it.

import { diff } from '../core/difficulty.js';
import { audio } from '../core/audio.js';

const ROUNDS = 3;

export class MiniGame {
  constructor({ type = 'hack', title = 'Hacking...', hint = '' } = {}) {
    this.type = type;
    this.hits = 0;
    this.t = 0;
    this.pos = 0;        // hack: 0..1 along the bar; safe: needle angle (radians)
    this.dir = 1;
    this.flash = 0;
    this.tapped = false;
    this._newTarget();
    this.el = document.createElement('div');
    this.el.className = `mini mini-${type}`;
    this.el.innerHTML = `
      <div class="mini-title">${title}</div>
      ${type === 'hack'
        ? '<div class="mini-track"><div class="mini-zone"></div><div class="mini-cursor"></div></div>'
        : `<svg class="mini-dial" viewBox="-60 -60 120 120"><circle r="52" class="dial-face"/>
             ${Array.from({ length: 24 }, (_, i) => `<line class="dial-tick" x1="0" y1="-52" x2="0" y2="${i % 6 ? -46 : -42}" transform="rotate(${i * 15})"/>`).join('')}
             <path class="dial-target" d=""/><line class="dial-needle" x1="0" y1="6" x2="0" y2="-44"/><circle r="6" class="dial-hub"/></svg>`}
      <div class="mini-dots">${'<i></i>'.repeat(ROUNDS)}</div>
      <div class="mini-hint">${hint || 'Press Jump (Space) or tap here when it lines up'}</div>`;
    this.el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.tapped = true; });
    document.body.appendChild(this.el);
    this._draw();
  }

  /** Size of the target: shrinks each round; bigger on Easy. */
  get _zone() {
    const d = diff();
    return this.type === 'hack'
      ? Math.max(0.1, (0.24 - this.hits * 0.035) * d.miniZone)
      : Math.max(0.16, (0.42 - this.hits * 0.06) * d.miniZone); // radians either side... (half-width)
  }

  _newTarget() {
    if (this.type === 'hack') this.target = 0.2 + Math.random() * 0.6; // zone centre along the bar
    else this.target = Math.random() * Math.PI * 2;                     // notch angle
  }

  /** Is the marker on target right now? */
  get _onTarget() {
    if (this.type === 'hack') return Math.abs(this.pos - this.target) < this._zone / 2;
    let a = (this.pos - this.target) % (Math.PI * 2);
    if (a > Math.PI) a -= Math.PI * 2;
    if (a < -Math.PI) a += Math.PI * 2;
    return Math.abs(a) < this._zone / 2;
  }

  /** @returns {'done'|'miss'|'hit'|null} */
  update(dt, pressed) {
    const d = diff();
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt);
    if (this.type === 'hack') {
      this.pos += this.dir * dt * (0.9 + this.hits * 0.18) * d.miniSpeed;
      if (this.pos > 1) { this.pos = 1; this.dir = -1; }
      if (this.pos < 0) { this.pos = 0; this.dir = 1; }
    } else {
      this.pos += this.dir * dt * (1.9 + this.hits * 0.35) * d.miniSpeed;
    }
    let result = null;
    if (pressed || this.tapped) {
      this.tapped = false;
      if (this._onTarget) {
        this.hits++;
        result = this.hits >= ROUNDS ? 'done' : 'hit';
        audio.sfx(result === 'done' ? 'checkpoint' : 'click', { vol: 0.8 });
        this._newTarget();
        if (this.type === 'safe') this.dir = -this.dir; // the next number turns the other way
      } else {
        this.hits = Math.max(0, this.hits - 1);
        this.flash = 0.35;
        result = 'miss';
        audio.sfx('locked', { vol: 0.6 });
      }
    }
    this._draw();
    return result;
  }

  _draw() {
    const el = this.el;
    if (!el) return;
    el.classList.toggle('miss', this.flash > 0);
    el.querySelectorAll('.mini-dots i').forEach((dot, i) => dot.classList.toggle('on', i < this.hits));
    if (this.type === 'hack') {
      const z = this._zone;
      const zone = el.querySelector('.mini-zone');
      zone.style.left = `${(this.target - z / 2) * 100}%`;
      zone.style.width = `${z * 100}%`;
      el.querySelector('.mini-cursor').style.left = `${this.pos * 100}%`;
      zone.classList.toggle('on', this._onTarget);
    } else {
      const deg = (a) => (a * 180) / Math.PI;
      el.querySelector('.dial-needle').setAttribute('transform', `rotate(${deg(this.pos)})`);
      // the target: a wedge of the dial's rim
      const half = this._zone / 2, r = 52;
      const a0 = this.target - half - Math.PI / 2, a1 = this.target + half - Math.PI / 2;
      const p = (a) => `${(Math.cos(a) * r).toFixed(1)} ${(Math.sin(a) * r).toFixed(1)}`;
      const t = el.querySelector('.dial-target');
      t.setAttribute('d', `M0 0 L${p(a0)} A${r} ${r} 0 0 1 ${p(a1)} Z`);
      t.classList.toggle('on', this._onTarget);
    }
  }

  close() {
    this.el?.remove();
    this.el = null;
  }
}

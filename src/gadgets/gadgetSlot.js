import { equipped } from './gadgets.js';

// The equipped gadget for one "slot" (on foot or in the car): which gadget
// it is, its recharge timer, and the little HUD badge that shows it
// (icon, name, and a bar that fills back up while it recharges).

export class GadgetSlot {
  /** @param {'foot'|'car'} kind */
  constructor(game, kind) {
    this.game = game;
    this.kind = kind;
    this.gadget = equipped(kind);
    this.cooldown = 0;
    this.el = document.getElementById('hud-gadget');
    this._last = '';
    if (this.gadget) {
      this.el.hidden = false;
      this.el.style.setProperty('--gc', this.gadget.color);
      this.el.querySelector('.g-icon').textContent = this.gadget.icon;
      this.el.querySelector('.g-name').textContent = this.gadget.name;
    } else this.el.hidden = true;
  }

  get ready() {
    return this.gadget && this.cooldown <= 0;
  }

  /** Start the recharge (call after a successful use). */
  used() {
    this.cooldown = this.gadget.cooldown;
  }

  update(dt) {
    if (!this.gadget) return;
    this.cooldown = Math.max(0, this.cooldown - dt);
    const k = 1 - this.cooldown / this.gadget.cooldown;
    const txt = this.cooldown > 0 ? `${Math.ceil(this.cooldown)}s` : 'READY · F';
    if (txt !== this._last) {
      this._last = txt;
      this.el.querySelector('.g-state').textContent = txt;
      this.el.classList.toggle('ready', this.cooldown <= 0);
    }
    this.el.querySelector('.g-bar > div').style.width = `${(k * 100).toFixed(0)}%`;
  }

  /** Pressed F with nothing equipped, or while recharging. */
  explainNotReady() {
    const hud = this.game.hud;
    if (!this.gadget) hud.toast('No gadget', 'Buy gadgets in the Shop on the title screen, then equip one.', 'var(--muted)', 3);
    else hud.toast(`${this.gadget.name} recharging`, `Ready in ${Math.ceil(this.cooldown)} s.`, 'var(--muted)', 1.5);
  }

  hide() {
    this.el.hidden = true;
  }
}

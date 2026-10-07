import { equippedList } from './gadgets.js';
import { admin } from '../core/admin.js';

// Your gadget slots for one kind (on foot or in the car): up to three
// gadgets, each with its own recharge timer, and the HUD badges that show
// them (number key, icon, name, and a bar that fills back up while it
// recharges). Press 1, 2 or 3 to use that slot; F uses the one you picked
// last. On a phone each slot gets its own button.
//
// `gadget`, `ready`, `cooldown` and `used()` are about the picked slot, so
// the gadget code just picks a slot (select) and then uses it as before.

export class GadgetSlot {
  /** @param {'foot'|'car'} kind */
  constructor(game, kind) {
    this.game = game;
    this.kind = kind;
    this.slots = equippedList(kind).map((g) => ({ gadget: g, cooldown: 0, full: 0 }));
    this.pick = Math.max(0, this.slots.findIndex((s) => s.gadget));
    this.el = document.getElementById('hud-gadget');
    // Active effects (cloak, smoke, jammer...) with how long each has left
    this.fx = this.el.querySelector('.g-effects');
    if (!this.fx) { this.fx = document.createElement('div'); this.fx.className = 'g-effects'; this.el.appendChild(this.fx); }
    this.fx.innerHTML = '';
    this._fxKey = '';
    for (const r of this.el.querySelectorAll('.g-row')) r.remove();
    this.rows = this.slots.map((s, i) => {
      if (!s.gadget) return null;
      const r = document.createElement('div');
      r.className = 'g-row';
      r.style.setProperty('--gc', s.gadget.color);
      r.innerHTML = `<div class="g-key">${i + 1}</div><div class="g-icon">${s.gadget.icon}</div><div class="g-text"><div class="g-name">${s.gadget.name}</div><div class="g-state"></div><div class="g-bar"><div></div></div></div>`;
      this.el.appendChild(r);
      return { el: r, state: r.querySelector('.g-state'), bar: r.querySelector('.g-bar > div'), last: '' };
    });
    this.el.hidden = !this.slots.some((s) => s.gadget);
    this._touch();
  }

  get cur() { return this.slots[this.pick] || { gadget: null, cooldown: 0, full: 0 }; }
  get gadget() { return this.cur.gadget; }
  /** (swap the gadget in the picked slot: the admin tools and tests use this) */
  set gadget(g) {
    if (this.slots[this.pick]) this.slots[this.pick].gadget = g;
    else this.slots[this.pick] = { gadget: g, cooldown: 0, full: 0 };
  }
  get cooldown() { return this.cur.cooldown; }
  /** (setting it, e.g. to 0 on a restart, sets every slot) */
  set cooldown(v) { for (const s of this.slots) s.cooldown = v; }
  get ready() { return !!this.gadget && this.cur.cooldown <= 0; }

  /** Pick slot i (0-2) to use. Returns false if there's nothing in it. */
  select(i) {
    if (!this.slots[i]?.gadget) {
      this.game.hud.toast(`Slot ${i + 1} is empty`, i >= this.slots.length ? 'Buy more gadget slots in the Shop on the title screen.' : 'Put a gadget in it in the Shop on the title screen.', 'var(--muted)', 2.5);
      return false;
    }
    this.pick = i;
    return true;
  }

  /** Start the recharge (call after a successful use). */
  used() {
    const c = this.cur;
    if (!c.gadget) return;
    c.cooldown = admin.flag('noCooldowns') ? 0 : c.gadget.cooldown * (admin.flag('doubleAll') ? 0.5 : 1);
    c.full = c.cooldown || c.gadget.cooldown;
  }

  update(dt) {
    this.slots.forEach((s, i) => {
      if (!s.gadget) return;
      s.cooldown = Math.max(0, s.cooldown - dt);
      const row = this.rows[i];
      if (!row) return;
      const k = 1 - s.cooldown / (s.full || s.gadget.cooldown);
      const txt = s.cooldown > 0 ? `${Math.ceil(s.cooldown)}s` : `READY · ${i + 1}`;
      const key = `${txt}|${i === this.pick}`;
      if (key !== row.last) {
        row.last = key;
        row.state.textContent = txt;
        row.el.classList.toggle('ready', s.cooldown <= 0);
        row.el.classList.toggle('picked', i === this.pick && this.slots.filter((x) => x.gadget).length > 1);
      }
      row.bar.style.width = `${(k * 100).toFixed(0)}%`;
    });
    this._touch();
  }

  /** The phone's gadget buttons: one per slot, with the gadget's icon. */
  _touch() {
    const t = this.game.touch;
    if (!t?.setGadgets) return;
    t.setGadgets(this.slots.map((s) => (s.gadget ? { icon: s.gadget.icon, color: s.gadget.color, ready: s.cooldown <= 0 } : null)));
  }

  /**
   * Show the effects that are running and how long each has left.
   * @param {{name:string, left:number, total:number}[]} list
   */
  showEffects(list) {
    const live = list.filter((e) => e.left > 0.05);
    const key = live.map((e) => `${e.name}|${Math.ceil(e.left)}`).join(',');
    if (key !== this._fxKey) {
      this._fxKey = key;
      this.fx.innerHTML = live.map((e) =>
        `<div class="g-fx${e.left < 3 ? ' ending' : ''}"><span>${e.name}</span><b>${Math.ceil(e.left)}s</b><i><u></u></i></div>`).join('');
    }
    const bars = this.fx.querySelectorAll('u');
    live.forEach((e, i) => { if (bars[i]) bars[i].style.width = `${Math.max(0, Math.min(1, e.left / e.total)) * 100}%`; });
  }

  /** Pressed a gadget key with nothing equipped, or while recharging. */
  explainNotReady() {
    const hud = this.game.hud;
    if (!this.slots.length) hud.toast('No gadget slots', 'Buy a gadget slot (and a gadget to put in it) in the Shop on the title screen.', 'var(--muted)', 3);
    else if (!this.gadget) hud.toast('No gadget', 'Buy gadgets in the Shop on the title screen, then put one in a slot.', 'var(--muted)', 3);
    else hud.toast(`${this.gadget.name} recharging`, `Ready in ${Math.ceil(this.cur.cooldown)} s.`, 'var(--muted)', 1.5);
  }

  hide() {
    this.el.hidden = true;
    this.fx.innerHTML = '';
    this._fxKey = '';
    this.game.touch?.setGadgets?.([]);
  }
}

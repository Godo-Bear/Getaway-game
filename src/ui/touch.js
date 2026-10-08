// Touch controls for phones and tablets.
//
//  - Left thumb: a virtual joystick (move on foot; steer + gas/brake driving)
//  - Right side: drag anywhere to look around (on foot)
//  - Buttons on the right: the two main actions, a view/camera button, and
//    the horn when driving. A pause button sits in the top-right corner.
//  - Story parts: a ghost mode button on its own on the left edge (far from
//    the other buttons, so you don't hit it by accident).
//
// They appear the first time the screen is touched, and write into
// input.touch, which the Input class reads exactly like keys and gamepads.
//
// MOVABLE: Settings > "Move phone buttons" lets you drag the joystick and
// every button where your thumbs want them, and pick a size. The layout is
// saved (settings.touchLayout: each control's centre as a fraction of the
// screen, so it fits when the screen turns) and applied on every start.

import { save } from '../core/save.js';

const LABELS = {
  onFoot: { a: 'Jump', b: 'Sprint', c: 'View', d: 'Slide', f: 'Coin' },
  driving: { a: 'Drift', b: 'Nitro', c: 'Cam', d: 'Horn', f: null },
  none: { a: null, b: null, c: null, d: null, f: null },
};
const ACTIONS = {
  onFoot: { a: 'jump', b: 'sprint', c: 'view', d: 'crouch', g1: 'gadget1', g2: 'gadget2', g3: 'gadget3', f: 'throw' },
  driving: { a: 'drift', b: 'nitro', c: 'camera', d: 'horn', g1: 'gadget1', g2: 'gadget2', g3: 'gadget3' },
  none: {},
};
const RADIUS = 55; // joystick throw in pixels

export class TouchControls {
  constructor(input) {
    this.input = input;
    this.mode = null; // setMode() below applies the first real mode
    this.root = document.createElement('div');
    this.root.id = 'touch';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="t-look"></div>
      <div class="t-stick"><div class="t-knob"></div></div>
      <div class="t-buttons">
        <button data-b="c" class="t-small"></button>
        <button data-b="d" class="t-small"></button>
        <button data-b="b"></button>
        <button data-b="a" class="t-main"></button>
      </div>
      <div class="t-gadgets">${[1, 2, 3].map((n) => `<button data-b="g${n}" data-g="${n}" data-n="${n}" hidden></button>`).join('')}</div>
      <button data-b="f" class="t-coin" hidden></button>
      <button class="t-pause" aria-label="Pause">II</button>
      <button class="t-act" hidden></button>
      <button class="t-ghost" hidden>Ghost</button>`;
    document.body.appendChild(this.root);
    this.stick = this.root.querySelector('.t-stick');
    this.ghostBtn = this.root.querySelector('.t-ghost');
    this.knob = this.root.querySelector('.t-knob');
    this._bindStick();
    this._bindLook();
    this._bindButtons();
    this.applyLayout();
    window.addEventListener('resize', () => this.applyLayout());
    // Show the controls as soon as the screen is touched.
    window.addEventListener('touchstart', () => this.enable(), { once: true, passive: true });
  }

  enable() {
    this.input.touchMode = true;
    this.root.hidden = false;
    document.body.classList.add('touch-mode');
  }

  /** 'onFoot' | 'driving' | 'none' - changes button labels. */
  setMode(mode) {
    if (this.editing) { this._wantMode = mode; return; }
    if (mode === this.mode) return;
    this.mode = mode;
    this._latch = {};
    this.root.classList.toggle('t-hidden', mode === 'none');
    for (const btn of this.root.querySelectorAll('[data-b]')) {
      if (btn.dataset.g) continue; // (the gadget buttons: setGadgets)
      const label = (mode === 'driving' && this._labels?.[btn.dataset.b]) || LABELS[mode][btn.dataset.b];
      btn.textContent = label || '';
      btn.hidden = !label || (btn.dataset.b === 'f' && !this._coinOn);
      btn.classList.remove('latched');
    }
    this.setAction(this._actLabel ?? null);
  }

  /** The Coin button: only where there are guards to distract; dimmed while it reloads. */
  setCoin(on, ready = true) {
    if (this.editing) return;
    const b = this.coinBtn || (this.coinBtn = this.root.querySelector('[data-b="f"]'));
    this._coinOn = on;
    const hide = !on || this.mode !== 'onFoot';
    if (b.hidden !== hide) b.hidden = hide;
    b.classList.toggle('cooling', !ready);
  }

  /**
   * The gadget buttons: one per slot with a gadget in it, showing its icon
   * (dimmed while it recharges). list: [{icon, color, ready} | null, ...]
   */
  setGadgets(list) {
    if (this.editing) return;
    const key = list.map((g) => (g ? `${g.icon}${g.ready ? 1 : 0}` : '-')).join('|');
    if (key === this._gKey) return;
    this._gKey = key;
    this.root.querySelectorAll('[data-g]').forEach((b, i) => {
      const g = list[i];
      b.hidden = !g;
      if (!g) return;
      b.textContent = g.icon;
      b.style.setProperty('--gc', g.color);
      b.classList.toggle('cooling', !g.ready);
    });
  }

  /** Rename a driving button (null = back to normal), e.g. Nitro -> Wheelie on the Dirt Bike. */
  setLabel(key, text) {
    (this._labels ||= {})[key] = text;
    if (this.mode === 'driving' && !this.editing) {
      const btn = this.root.querySelector(`[data-b="${key}"]`);
      if (btn) btn.textContent = text || LABELS.driving[key] || '';
    }
  }

  /** Light a button up while its action is switched on (e.g. sprint). */
  setOn(key, on) {
    if (this._latch?.[key] === on) return;
    (this._latch ||= {})[key] = on;
    this.root.querySelector(`[data-b="${key}"]`)?.classList.toggle('latched', on);
  }

  /** A big contextual button for the action you can do right now (null hides it). */
  setAction(label) {
    this._actLabel = label;
    if (this.editing) return;
    const b = this.actBtn || (this.actBtn = this.root.querySelector('.t-act'));
    // On foot with nothing to do here, the same button punches
    const punch = !label && this.mode === 'onFoot';
    const text = label || (punch ? 'Punch' : null);
    if (b.hidden !== !text) b.hidden = !text;
    if (text && b.textContent !== text) b.textContent = text;
    b.classList.toggle('punch', punch);
  }

  /** Show/hide the ghost mode button and light it up while ghost mode is on. */
  setGhost(available, on) {
    if (this.ghostBtn.hidden !== !available) this.ghostBtn.hidden = !available;
    this.ghostBtn.classList.toggle('on', on);
    const label = on ? 'Ghost ON' : 'Ghost';
    if (this.ghostBtn.textContent !== label) this.ghostBtn.textContent = label;
  }

  /** The controls you can move: the joystick and every button. */
  _layoutEls() {
    const q = (sel) => this.root.querySelector(sel);
    return { stick: q('.t-stick'), a: q('[data-b="a"]'), b: q('[data-b="b"]'), c: q('[data-b="c"]'), d: q('[data-b="d"]'),
      e: q('.t-gadgets'), f: q('[data-b="f"]'), act: q('.t-act') };
  }

  /** Put the controls where the saved layout says (or where they start). */
  applyLayout() {
    const L = save.data.settings?.touchLayout, scale = L?.scale ?? 1;
    for (const [k, el] of Object.entries(this._layoutEls())) {
      const p = L?.pos?.[k];
      if (!p) {
        Object.assign(el.style, { position: '', left: '', top: '', right: '', bottom: '', margin: '' });
        el.style.transform = scale !== 1 ? `scale(${scale})` : '';
        continue;
      }
      Object.assign(el.style, { position: 'fixed', left: `${p[0] * window.innerWidth}px`, top: `${p[1] * window.innerHeight}px`,
        right: 'auto', bottom: 'auto', margin: '0', transform: `translate(-50%, -50%) scale(${scale})` });
    }
  }

  /**
   * Edit the layout: every control shows, drag them about, pick a size,
   * Reset or Done (saved). onDone() runs afterwards (back to Settings).
   */
  editLayout(onDone) {
    const els = this._layoutEls();
    const before = { hidden: this.root.hidden, mode: this.mode, labels: new Map() };
    this.root.hidden = false;
    this.root.classList.remove('t-hidden');
    this._wantMode = this.mode;
    this.mode = null;
    this.setMode('onFoot'); // (the on-foot labels: they're the most buttons)
    this.editing = true;
    for (const el of Object.values(els)) { before.labels.set(el, [el.hidden, el.textContent]); el.hidden = false; }
    els.f.textContent = 'Coin';
    this.root.querySelectorAll('[data-g]').forEach((b, i) => { before.labels.set(b, [b.hidden, b.textContent]); b.hidden = false; b.textContent = ['🧰', '🧰', '🧰'][i]; });
    els.act.textContent = 'Punch';
    const S = save.data.settings;
    const pos = { ...(S.touchLayout?.pos || {}) };
    let scale = S.touchLayout?.scale ?? 1;
    const capture = () => {
      for (const [k, el] of Object.entries(els)) {
        if (pos[k]) continue;
        const r = el.getBoundingClientRect();
        pos[k] = [(r.left + r.width / 2) / window.innerWidth, (r.top + r.height / 2) / window.innerHeight];
      }
    };
    const apply = () => { S.touchLayout = { pos, scale }; this.applyLayout(); };
    capture();
    apply();
    this.root.classList.add('editing');
    const bar = document.createElement('div');
    bar.className = 't-editbar';
    bar.innerHTML = `<b>Drag the buttons where you want them</b>
      <span class="seg">${[['Small', 0.82], ['Normal', 1], ['Big', 1.2]].map(([l, v]) => `<button class="chip${Math.abs(scale - v) < 0.01 ? ' on' : ''}" data-s="${v}">${l}</button>`).join('')}</span>
      <button class="btn" data-x="reset">Reset</button><button class="btn primary" data-x="done">Done</button>`;
    document.body.appendChild(bar); // (outside #touch, so it keeps normal button styles)
    let drag = null;
    const down = (e) => {
      if (bar.contains(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      const k = Object.keys(els).find((key) => els[key].contains(e.target));
      if (!k) return;
      drag = { k, id: e.pointerId };
      els[k].classList.add('dragging');
    };
    const move = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      e.preventDefault();
      e.stopPropagation();
      pos[drag.k] = [Math.min(0.96, Math.max(0.04, e.clientX / window.innerWidth)), Math.min(0.94, Math.max(0.06, e.clientY / window.innerHeight))];
      apply();
    };
    const up = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      els[drag.k].classList.remove('dragging');
      drag = null;
    };
    this.root.addEventListener('pointerdown', down, true);
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    bar.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.s) {
        scale = Number(b.dataset.s);
        bar.querySelectorAll('[data-s]').forEach((x) => x.classList.toggle('on', x === b));
        apply();
      } else if (b.dataset.x === 'reset') {
        for (const k of Object.keys(pos)) delete pos[k];
        scale = 1;
        bar.querySelectorAll('[data-s]').forEach((x) => x.classList.toggle('on', x.dataset.s === '1'));
        S.touchLayout = null;
        this.applyLayout();
        capture();
        apply();
      } else if (b.dataset.x === 'done') {
        this.root.removeEventListener('pointerdown', down, true);
        window.removeEventListener('pointermove', move, true);
        window.removeEventListener('pointerup', up, true);
        window.removeEventListener('pointercancel', up, true);
        bar.remove();
        this.root.classList.remove('editing');
        save.write();
        this.editing = false;
        for (const [el, [hidden, text]] of before.labels) { el.hidden = hidden; el.textContent = text; }
        this._gKey = null;
        this.mode = null;
        this.setMode(this._wantMode ?? before.mode ?? 'none');
        this.root.hidden = before.hidden;
        onDone?.();
      }
    });
  }

  _bindStick() {
    let id = null, cx = 0, cy = 0;
    const set = (x, y) => {
      const len = Math.hypot(x, y);
      if (len > RADIUS) { x *= RADIUS / len; y *= RADIUS / len; }
      this.knob.style.transform = `translate(${x}px, ${y}px)`;
      this.input.touch.x = x / RADIUS;
      this.input.touch.y = -y / RADIUS; // up on screen = forward
    };
    this.stick.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      id = e.pointerId;
      const r = this.stick.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
      this.stick.setPointerCapture(id);
      set(e.clientX - cx, e.clientY - cy);
    });
    this.stick.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e.clientX - cx, e.clientY - cy); });
    const end = (e) => { if (e.pointerId === id) { id = null; set(0, 0); } };
    this.stick.addEventListener('pointerup', end);
    this.stick.addEventListener('pointercancel', end);
  }

  _bindLook() {
    const look = this.root.querySelector('.t-look');
    let id = null, lx = 0, ly = 0;
    // Two fingers on the look area = pinch to zoom the camera.
    const fingers = new Map();
    let pinch = 0;
    const spread = () => { const [a, b] = [...fingers.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
    look.addEventListener('pointerdown', (e) => {
      fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      look.setPointerCapture(e.pointerId);
      if (fingers.size === 2) { pinch = spread(); id = null; return; }
      id = e.pointerId; lx = e.clientX; ly = e.clientY;
    });
    look.addEventListener('pointermove', (e) => {
      if (fingers.has(e.pointerId)) fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (fingers.size === 2) {
        const d = spread();
        this.input.zoom += (pinch - d) / 60; // fingers apart = zoom in
        pinch = d;
        return;
      }
      if (e.pointerId !== id) return;
      this.input.mouseDX += (e.clientX - lx) * 1.4;
      this.input.mouseDY += (e.clientY - ly) * 1.4;
      lx = e.clientX;
      ly = e.clientY;
    });
    const end = (e) => { fingers.delete(e.pointerId); if (e.pointerId === id) id = null; };
    look.addEventListener('pointerup', end);
    look.addEventListener('pointercancel', end);
  }

  _bindButtons() {
    for (const btn of this.root.querySelectorAll('[data-b]')) {
      const action = () => ACTIONS[this.mode][btn.dataset.b];
      const on = (e) => {
        e.preventDefault();
        const a = action();
        if (!a) return;
        this.input.touch.buttons.add(a);
        this.input.touch.pressed.add(a);
        btn.classList.add('on');
        try { btn.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      };
      const off = () => {
        const a = action();
        if (a) this.input.touch.buttons.delete(a);
        btn.classList.remove('on');
      };
      btn.addEventListener('pointerdown', on);
      btn.addEventListener('pointerup', off);
      btn.addEventListener('pointercancel', off);
      btn.addEventListener('lostpointercapture', off);
    }
    const act = this.root.querySelector('.t-act');
    act.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const a = e.currentTarget.classList.contains('punch') ? 'punch' : 'interact';
      this.input.touch.pressed.add(a);
      if (a === 'interact') this.input.touch.buttons.add('interact'); // (held: e.g. picking a lock)
      try { act.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    });
    const actUp = () => this.input.touch.buttons.delete('interact');
    act.addEventListener('pointerup', actUp);
    act.addEventListener('pointercancel', actUp);
    act.addEventListener('lostpointercapture', actUp);
    this.root.querySelector('.t-pause').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.input.touch.pressed.add('pause');
    });
    this.ghostBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.input.touch.pressed.add('ghost');
    });
  }
}

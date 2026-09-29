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

const LABELS = {
  onFoot: { a: 'Jump', b: 'Sprint', c: 'View', d: 'Slide', e: 'Gadget' },
  driving: { a: 'Drift', b: 'Nitro', c: 'Cam', d: 'Horn', e: 'Gadget' },
  none: { a: null, b: null, c: null, d: null, e: null },
};
const ACTIONS = {
  onFoot: { a: 'jump', b: 'sprint', c: 'view', d: 'crouch', e: 'gadget' },
  driving: { a: 'drift', b: 'nitro', c: 'camera', d: 'horn', e: 'gadget' },
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
      <button data-b="e" class="t-gadget"></button>
      <button class="t-pause" aria-label="Pause">II</button>
      <button class="t-ghost" hidden>Ghost</button>`;
    document.body.appendChild(this.root);
    this.stick = this.root.querySelector('.t-stick');
    this.ghostBtn = this.root.querySelector('.t-ghost');
    this.knob = this.root.querySelector('.t-knob');
    this._bindStick();
    this._bindLook();
    this._bindButtons();
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
    if (mode === this.mode) return;
    this.mode = mode;
    this.root.classList.toggle('t-hidden', mode === 'none');
    for (const btn of this.root.querySelectorAll('[data-b]')) {
      const label = LABELS[mode][btn.dataset.b];
      btn.textContent = label || '';
      btn.hidden = !label;
    }
  }

  /** Show/hide the ghost mode button and light it up while ghost mode is on. */
  setGhost(available, on) {
    if (this.ghostBtn.hidden !== !available) this.ghostBtn.hidden = !available;
    this.ghostBtn.classList.toggle('on', on);
    const label = on ? 'Ghost ON' : 'Ghost';
    if (this.ghostBtn.textContent !== label) this.ghostBtn.textContent = label;
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

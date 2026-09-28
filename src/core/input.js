// Input: keyboard + mouse, gamepad and touch, all turned into named "actions".
//
// Game code never asks "is the W key down?". It asks "is `forward` down?".
// Keyboard keys, gamepad buttons and on-screen touch buttons all feed the
// same actions, so the player and car code work with any of them.
//
// Analog input (sticks, triggers, the touch joystick) comes through axis():
// axis('left', 'right') and axis('back', 'forward') return -1..1.
// Camera look from the right stick or a touch drag is added to the same
// "mouse movement" the mouse uses, so cameras don't care where it came from.

/** Which keys trigger which action. Several keys can share an action. */
export const BINDINGS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA'],
  right: ['KeyD'],
  turnLeft: ['ArrowLeft', 'KeyQ'],
  turnRight: ['ArrowRight', 'KeyE'],
  jump: ['Space'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  crouch: ['KeyC', 'ControlLeft'],
  respawn: ['KeyR'],
  view: ['KeyV'],           // on foot: first / third person
  caseBoard: ['Tab'],       // story: open the Case Board
  horn: ['KeyQ'],           // driving: honk so traffic moves aside
  camera: ['KeyC', 'KeyV'], // driving: change camera
  pause: ['KeyP', 'Escape'],
  help: ['KeyH'],
  debug: ['F3', 'Backquote'],
};

/** Standard-layout gamepad buttons for each action (Xbox names). */
export const PAD_BINDINGS = {
  jump: [0],          // A: jump / handbrake
  crouch: [1],        // B: slide / crouch
  sprint: [5, 10],    // RB or left stick click: sprint / nitro
  horn: [2],          // X
  view: [3],          // Y: first/third person
  camera: [3],        // Y: driving camera
  respawn: [13],      // d-pad down
  caseBoard: [8],     // View / Back
  pause: [9],         // Menu / Start
  help: [12],         // d-pad up
};
const DEADZONE = 0.18;
const deadzone = (v) => (Math.abs(v) < DEADZONE ? 0 : (v - Math.sign(v) * DEADZONE) / (1 - DEADZONE));

// Keys whose default browser behaviour (scrolling, etc.) we block while playing.
const BLOCK_DEFAULT = new Set(['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F3', 'Backquote']);

export class Input {
  /** @param {HTMLElement} target - the element to lock the mouse to (the canvas). */
  constructor(target) {
    this.target = target;
    this.down = new Set();     // keys currently held
    this.pressed = new Set();  // keys that went down this frame
    this.mouseDX = 0;          // mouse movement since last frame
    this.mouseDY = 0;

    // Pointer lock hides the cursor and gives us raw mouse movement,
    // which is what makes mouse-look feel good. Some browsers/iframes
    // refuse it, so we remember whether it works and fall back if not.
    this.pointerLockSupported = 'requestPointerLock' in target;
    this.pointerLocked = false;
    this.pointerLockFailed = !this.pointerLockSupported;

    // Touch controls (ui/touch.js writes into this) and gamepad state (poll()).
    this.touchMode = false;
    this.touch = { x: 0, y: 0, buttons: new Set(), pressed: new Set() };
    this.pad = { x: 0, y: 0, lt: 0, rt: 0, down: new Set(), pressed: new Set(), active: false };
    this.everLocked = false;
    this._dragging = false;

    this._bind();
  }

  _bind() {
    window.addEventListener('keydown', (e) => {
      // (Tab still moves between buttons while a menu is open.)
      const menuOpen = document.getElementById('overlay')?.hidden === false;
      if (BLOCK_DEFAULT.has(e.code) && !(e.code === 'Tab' && menuOpen)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    // If the window loses focus we never get the keyup, so clear everything.
    window.addEventListener('blur', () => this.down.clear());

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.target;
      if (this.pointerLocked) {
        this.pointerLockFailed = false;
        this.everLocked = true;
        // Browsers often report one big bogus jump right after locking. Skip it.
        this._skipMoves = 2;
        this.mouseDX = this.mouseDY = 0;
      }
    });
    document.addEventListener('pointerlockerror', () => {
      // Only give up on mouse lock if it has NEVER worked. (Browsers also
      // refuse re-locking for a moment after Esc, which isn't a real failure.)
      if (!this.everLocked) this.pointerLockFailed = true;
    });

    document.addEventListener('mousemove', (e) => {
      // Locked: every movement turns the camera.
      // Unlocked fallback: only while a mouse button is held (drag to look).
      if (this._skipMoves > 0) { this._skipMoves--; return; }
      if (this.pointerLocked || this._dragging) {
        this.mouseDX += e.movementX || 0;
        this.mouseDY += e.movementY || 0;
      }
    });
    this.target.addEventListener('mousedown', () => {
      if (!this.pointerLocked) this._dragging = true;
    });
    window.addEventListener('mouseup', () => (this._dragging = false));
  }

  /** Ask the browser to lock the mouse. Must be called from a click. */
  requestPointerLock() {
    if (!this.pointerLockSupported || this.pointerLocked || this.lockDisabled) return;
    try {
      const result = this.target.requestPointerLock();
      // Newer browsers return a promise that rejects on failure.
      if (result && result.catch) result.catch(() => { if (!this.everLocked) this.pointerLockFailed = true; });
    } catch {
      if (!this.everLocked) this.pointerLockFailed = true;
    }
  }

  exitPointerLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** True while any key / button bound to `action` is held. */
  isDown(action) {
    const keys = BINDINGS[action];
    for (let i = 0; i < keys.length; i++) if (this.down.has(keys[i])) return true;
    if (this.touch.buttons.has(action)) return true;
    const pb = PAD_BINDINGS[action];
    if (pb) for (const b of pb) if (this.pad.down.has(b)) return true;
    return false;
  }

  /** True only on the frame a key / button bound to `action` was pressed. */
  wasPressed(action) {
    const keys = BINDINGS[action];
    for (let i = 0; i < keys.length; i++) if (this.pressed.has(keys[i])) return true;
    if (this.touch.pressed.has(action)) return true;
    const pb = PAD_BINDINGS[action];
    if (pb) for (const b of pb) if (this.pad.pressed.has(b)) return true;
    return false;
  }

  /**
   * -1..1 axis from two opposing actions, e.g. axis('left', 'right').
   * Keyboard wins if pressed; otherwise the touch joystick, then the gamepad.
   */
  axis(negative, positive) {
    const keys = (this.isDown(positive) ? 1 : 0) - (this.isDown(negative) ? 1 : 0);
    if (keys) return keys;
    if (negative === 'left' && positive === 'right') return this.touch.x || this.pad.x;
    if (negative === 'back' && positive === 'forward') {
      if (this.touch.y) return this.touch.y;
      const triggers = this.pad.rt - this.pad.lt; // driving: RT gas, LT brake
      return Math.abs(triggers) > 0.05 ? triggers : this.pad.y;
    }
    return 0;
  }

  /** Read and reset the look movement collected since the last call. */
  consumeMouse() {
    const d = { x: this.mouseDX, y: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return d;
  }

  /** A gamepad or touch screen is in use (so mouse lock isn't needed). */
  get noMouseNeeded() {
    return this.touchMode || this.pad.active;
  }

  /** Call once at the start of every frame: reads the gamepad. */
  poll(dt) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = [...pads].find((p) => p && p.connected);
    const pad = this.pad;
    if (!gp) { pad.x = pad.y = pad.rt = pad.lt = 0; pad.down.clear(); return; }
    const prev = pad.down;
    const now = new Set();
    gp.buttons.forEach((b, i) => { if (b.pressed) now.add(i); });
    for (const b of now) if (!prev.has(b)) pad.pressed.add(b);
    pad.down = now;
    pad.x = deadzone(gp.axes[0] || 0);
    pad.y = -deadzone(gp.axes[1] || 0);
    pad.lt = gp.buttons[6]?.value || 0;
    pad.rt = gp.buttons[7]?.value || 0;
    const lookX = deadzone(gp.axes[2] || 0), lookY = deadzone(gp.axes[3] || 0);
    // Right stick looks around: full tilt is like moving the mouse 800 px/s.
    this.mouseDX += lookX * 800 * dt;
    this.mouseDY += lookY * 800 * dt;
    if (now.size || pad.x || pad.y || lookX || lookY || pad.rt > 0.1) pad.active = true;
    this._menuNavigation(pad);
  }

  /** Let the gamepad drive menus: d-pad / stick to move, A to press, B to go back. */
  _menuNavigation(pad) {
    const overlay = document.getElementById('overlay');
    if (!overlay || overlay.hidden) return;
    const buttons = [...overlay.querySelectorAll('button:not([disabled])')];
    if (!buttons.length) return;
    const idx = buttons.indexOf(document.activeElement);
    const stickDown = pad.y < -0.6, stickUp = pad.y > 0.6;
    const now = performance.now();
    const repeatOk = now - (this._navAt || 0) > 220;
    let move = 0;
    if (pad.pressed.has(13) || pad.pressed.has(15) || (stickDown && repeatOk)) move = 1;
    if (pad.pressed.has(12) || pad.pressed.has(14) || (stickUp && repeatOk)) move = -1;
    if (move) {
      this._navAt = now;
      const next = buttons[(Math.max(0, idx) + move + buttons.length) % buttons.length];
      next.focus({ preventScroll: false });
    }
    if (pad.pressed.has(0)) (document.activeElement && buttons.includes(document.activeElement) ? document.activeElement : buttons[0]).click();
    if (pad.pressed.has(1)) buttons.find((b) => /^(Back|Resume)/.test(b.textContent))?.click();
    // Menu presses shouldn't also count as game input this frame.
    if (pad.pressed.has(0) || pad.pressed.has(1)) pad.pressed.clear();
  }

  /** Call once at the very end of every frame. */
  endFrame() {
    this.pressed.clear();
    this.touch.pressed.clear();
    this.pad.pressed.clear();
  }
}

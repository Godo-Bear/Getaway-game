// Input: keyboard + mouse, turned into named "actions".
//
// Game code never asks "is the W key down?". It asks "is `forward` down?".
// That way we can add gamepad and touch controls later (Milestone 6) by
// feeding the same actions, without touching the player or car code.

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
  horn: ['KeyQ'],          // driving: honk so traffic moves aside
  camera: ['KeyC', 'KeyV'], // driving: change camera
  pause: ['KeyP', 'Escape'],
  help: ['KeyH'],
  debug: ['F3', 'Backquote'],
};

// Keys whose default browser behaviour (scrolling, etc.) we block while playing.
const BLOCK_DEFAULT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F3', 'Backquote']);

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
    this.everLocked = false;
    this._dragging = false;

    this._bind();
  }

  _bind() {
    window.addEventListener('keydown', (e) => {
      if (BLOCK_DEFAULT.has(e.code)) e.preventDefault();
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

  /** True while any key bound to `action` is held. */
  isDown(action) {
    const keys = BINDINGS[action];
    for (let i = 0; i < keys.length; i++) if (this.down.has(keys[i])) return true;
    return false;
  }

  /** True only on the frame a key bound to `action` was pressed. */
  wasPressed(action) {
    const keys = BINDINGS[action];
    for (let i = 0; i < keys.length; i++) if (this.pressed.has(keys[i])) return true;
    return false;
  }

  /** -1..1 axis from two opposing actions, e.g. axis('left', 'right'). */
  axis(negative, positive) {
    return (this.isDown(positive) ? 1 : 0) - (this.isDown(negative) ? 1 : 0);
  }

  /** Read and reset the mouse movement collected since the last call. */
  consumeMouse() {
    const d = { x: this.mouseDX, y: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return d;
  }

  /** Call once at the very end of every frame. */
  endFrame() {
    this.pressed.clear();
  }
}

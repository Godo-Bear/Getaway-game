// A tiny state machine for the game's top-level modes
// (title screen, on foot, driving, deduction...).
//
// Each state is a plain object/class with optional methods:
//   enter(params)  - called when the state becomes active
//   exit()         - called when leaving the state
//   update(dt)     - called every frame
//   render(renderer)
//
// Only one state is active at a time, which keeps each mode's code separate.

export class StateMachine {
  constructor() {
    this.states = new Map();
    this.current = null;
    this.currentName = null;
    // Optional loading screen for states that take a moment to build (levels):
    // { heavy: Set of state names, show(name, params), hide() }
    this.loader = null;
    this.pending = null; // a level waiting for the loading screen to appear
  }

  add(name, state) {
    this.states.set(name, state);
    return this;
  }

  change(name, params = {}) {
    if (!this.states.get(name)) throw new Error(`Unknown state: ${name}`);
    if (!this.loader?.heavy.has(name)) {
      this.pending = null; // (a quick switch cancels a level that was waiting)
      this._switch(name, params);
      return;
    }
    // A level: show the loading screen, wait until it has been drawn (building a
    // level blocks the page, so it would never appear otherwise), then build.
    const waiting = !!this.pending;
    this.pending = { name, params }; // (asked twice? the latest one wins)
    if (waiting) return;
    this.loader.show(name, params);
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => {
      const p = this.pending;
      this.pending = null;
      if (p) this._switch(p.name, p.params);
      requestAnimationFrame(() => this.loader.hide());
    }, 0)));
  }

  _switch(name, params) {
    const next = this.states.get(name);
    this.current?.exit?.();
    this.current = next;
    this.currentName = name;
    next.enter?.(params);
  }

  update(dt) {
    if (this.pending) return; // (hold still while the next level loads)
    this.current?.update?.(dt);
  }

  render(renderer) {
    this.current?.render?.(renderer);
  }

  resize(width, height) {
    for (const state of this.states.values()) state.resize?.(width, height);
  }
}

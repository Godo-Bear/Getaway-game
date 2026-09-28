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
  }

  add(name, state) {
    this.states.set(name, state);
    return this;
  }

  change(name, params = {}) {
    const next = this.states.get(name);
    if (!next) throw new Error(`Unknown state: ${name}`);
    this.current?.exit?.();
    this.current = next;
    this.currentName = name;
    next.enter?.(params);
  }

  update(dt) {
    this.current?.update?.(dt);
  }

  render(renderer) {
    this.current?.render?.(renderer);
  }

  resize(width, height) {
    for (const state of this.states.values()) state.resize?.(width, height);
  }
}

// Automatic graphics: if the game runs slowly while you're playing, step the
// graphics setting down (high -> medium -> low) so it stays smooth.
//
// It only measures while you're actually playing (not in menus, story cards
// or the pause screen), averages over a few seconds so one hiccup doesn't
// count, and never raises the setting again by itself. Turn it off in
// Settings ("Lower graphics automatically").

import { save } from './save.js';

const WINDOW = 4;        // seconds of play to average over
const SLOW_FPS = 40;     // below this on average = too slow
const COOLDOWN = 8;      // seconds to wait after a change before measuring again
const STEPS = { high: 'medium', medium: 'low' };

export class AutoQuality {
  constructor(game) {
    this.game = game;
    this.time = 0;
    this.frames = 0;
    this.cooldown = COOLDOWN;
  }

  /** Call every frame with the frame's dt (seconds). */
  update(dt) {
    const g = this.game, s = g.sm.current;
    const playing = (g.sm.currentName === 'onFoot' || g.sm.currentName === 'driving') &&
      s && !s.paused && !s.over && !s.inCard && !s.waitingForLock && document.visibilityState === 'visible';
    if (!playing || g.settings.autoGraphics === false || !STEPS[g.settings.graphics] || dt > 0.25) {
      this.time = this.frames = 0; // start the measurement again
      return;
    }
    if (this.cooldown > 0) { this.cooldown -= dt; return; }
    this.time += dt;
    this.frames++;
    if (this.time < WINDOW) return;
    const fps = this.frames / this.time;
    this.time = this.frames = 0;
    if (fps >= SLOW_FPS) return;
    const next = STEPS[g.settings.graphics];
    g.settings.graphics = next;
    save.write();
    g.applySettings();
    this.cooldown = COOLDOWN;
    g.hud.toast('Graphics lowered', `Switched to ${next} to keep the game smooth (it was running at ${Math.round(fps)} fps). You can change this in Settings.`, 'var(--cyan)', 6);
  }
}

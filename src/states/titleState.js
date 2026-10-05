import * as THREE from 'three';
import { NightLighting } from '../world/lighting.js';
import { showTitle, hideCard } from '../ui/menus.js';
import { showSettings } from '../ui/settings.js';
import { audio } from '../core/audio.js';
import { startPart } from '../story/chapterFlow.js';
import { showSpeedrunMenu } from '../story/speedrun.js';
import { startFreeRoam } from './modes/freeRoam.js';
import { showLevelEditor } from '../ui/levelEditor.js';

// Title screen: the menu on the left, the neon GETAWAY sign (ui/neonLogo.js),
// and behind it the rainy neon city from the app icon: a painted backdrop
// (src/assets/title/keyart.webp, rendered from a 3D scene) that slowly drifts,
// with rain falling in front of it. No 3D city to build or draw, so the title
// opens fast and doesn't drain phone batteries.

export class TitleState {
  constructor(game) {
    this.game = game;
    this.time = 0;
  }

  enter(params = {}) {
    audio.setPlace('harbor');
    audio.surface = null;
    if (!this.scene) {
      this.scene = new THREE.Scene();
      this.lighting = new NightLighting(this.scene, { shadows: false });
    }
    this.lighting.setTime(0); // (puts the shared materials back to night, no snow)
    this.bg = document.getElementById('title-bg');
    this.rainCanvas = document.getElementById('tb-rain');
    this.bg.hidden = false;
    this.calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    this.game.hud.hideAll();
    this.game.speedrun = null;
    this.game.freeRoam = null;
    const actions = {
      game: this.game,
      settings: (back) => showSettings(this.game, back),
      speedrun: (back) => showSpeedrunMenu(this.game, back),
      story: (chapterId, part = 0, ghost = false) => startPart(this.game, chapterId, part, { ghost, fresh: true }),
      rooftopRun: () => this.game.sm.change('onFoot', { mode: 'survival' }),
      freeRun: (opts) => startFreeRoam(this.game, opts),
      streetChase: () => this.game.sm.change('driving', { mode: 'survival' }),
      sideJobs: () => this.game.sm.change('driving', { mode: 'jobs' }),
      editor: (level = null) => showLevelEditor(this.game, {
        level,
        onPlay: (L) => this.game.sm.change('onFoot', { mode: 'custom', custom: L, fromEditor: true }),
        onBack: () => showTitle(actions),
      }),
    };
    if ('editor' in params) actions.editor(params.editor || null);
    else showTitle(actions);
  }

  exit() {
    hideCard();
    if (this.bg) this.bg.hidden = true;
  }

  update(dt) {
    this.time += dt;
    audio.setMix({ music: 0.45, intensity: 0.15, city: 0.06, rain: 0.14 });
    if (!this.calm) this._rain(Math.min(dt, 0.05));
  }

  /** Rain streaks falling over the backdrop (a light 2D canvas). */
  _rain(dt) {
    const c = this.rainCanvas;
    const k = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.round(window.innerWidth * k), h = Math.round(window.innerHeight * k);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const g = c.getContext('2d');
    g.clearRect(0, 0, w, h);
    if (!this.drops) this.drops = Array.from({ length: 150 }, () => this._drop(Math.random()));
    g.lineCap = 'round';
    for (const d of this.drops) {
      d.y += d.v * dt;
      if (d.y > 1.08) Object.assign(d, this._drop(-0.08));
      const x = (d.x - d.y * 0.16) * w, y = d.y * h, len = d.l * h;
      g.strokeStyle = `rgba(196, 214, 255, ${d.a})`;
      g.lineWidth = d.wd * k;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + len * 0.16, y - len); g.stroke();
    }
  }

  _drop(y) {
    const near = Math.random() < 0.15; // a few big, close drops
    return { x: Math.random() * 1.3, y, v: near ? 1.7 + Math.random() * 0.6 : 1.0 + Math.random() * 0.7, l: near ? 0.07 + Math.random() * 0.05 : 0.025 + Math.random() * 0.03,
      a: near ? 0.16 + Math.random() * 0.1 : 0.07 + Math.random() * 0.09, wd: near ? 1.6 : 0.9 };
  }

  render() {
    // (nothing 3D on the title: the backdrop is a picture and the rain a 2D canvas)
  }
}

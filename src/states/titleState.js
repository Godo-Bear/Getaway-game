import * as THREE from 'three';
import { NightLighting } from '../world/lighting.js';
import { generateRooftopCity } from '../world/rooftopCity.js';
import { showTitle, hideCard } from '../ui/menus.js';

// Title screen: the menu card on the left, and behind it a slow camera
// fly-around of the night-time rooftops.

export class TitleState {
  constructor(game) {
    this.game = game;
    this.time = 0;
  }

  enter() {
    if (!this.scene) {
      // Built once and kept, so returning to the title is instant.
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 900);
      this.lighting = new NightLighting(this.scene, { shadows: false });
      const city = generateRooftopCity({ seed: 99, blocks: 5 });
      this.scene.add(city.group);
    }
    this.game.hud.hideAll();
    showTitle({
      story: (chapterId, part) => {
        this.game.chapterRun = null;
        if (part === 'drive') this.game.sm.change('driving', { mode: chapterId });
        else this.game.sm.change('onFoot', { mode: chapterId });
      },
      rooftopRun: () => this.game.sm.change('onFoot', { mode: 'survival' }),
      freeRun: () => this.game.sm.change('onFoot', { mode: 'free' }),
      streetChase: () => this.game.sm.change('driving', { mode: 'survival' }),
    });
  }

  exit() {
    hideCard();
  }

  update(dt) {
    this.time += dt;
    const a = this.time * 0.04;
    this.camera.position.set(Math.cos(a) * 90, 52, Math.sin(a) * 90);
    this.camera.lookAt(Math.cos(a + 0.9) * 20, 18, Math.sin(a + 0.9) * 20);
    this.lighting.follow(this.camera.position);
  }

  render(renderer) {
    renderer.render(this.scene, this.camera);
  }

  resize(w, h) {
    if (!this.camera) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}

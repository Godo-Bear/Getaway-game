import * as THREE from 'three';
import { Minimap } from './minimap.js';
import { BigMap } from './bigMap.js';

// The minimap and the big map on foot (Free Run, Rooftop Run): the same ones
// as in the car, drawn from the rooftop city: buildings, the little shops
// (brown), parks (green) and the stairwell doors with ladders (yellow).
// M (or tap the minimap) opens the big map; click it to set a waypoint.

/** A rooftop city in the shape the minimap wants. */
export function footMapCity(city) {
  const shapes = [];
  for (const p of city.parks || []) shapes.push({ type: 'park', x0: p.x0, z0: p.z0, x1: p.x1, z1: p.z1 });
  for (const w of city.water || []) shapes.push({ type: 'water', ...w });
  for (const b of city.buildings) shapes.push({ type: b.shop ? 'shop' : 'building', x0: b.minX, z0: b.minZ, x1: b.maxX, z1: b.maxZ });
  for (const L of city.ladders || []) shapes.push({ type: 'ladder', x0: L.x - 1.1, z0: L.z - 1.1, x1: L.x + 1.1, z1: L.z + 1.1 });
  const e = city.bounds + 10;
  return { bounds: { min: -e, max: e }, minimapShapes: shapes, alleys: [] };
}

const _v = new THREE.Vector3();

export class FootMap {
  constructor(state, city) {
    this.state = state;
    this.minimap = new Minimap(state.game.hud.el.map, footMapCity(city));
    this.bigMap = new BigMap(this.minimap);
    this.waypoint = null;
    this._tap = (e) => { e.preventDefault(); this.open(); };
    state.game.hud.el.map.addEventListener('pointerdown', this._tap);
    this._key = (e) => { if (this.bigMap.isOpen && (e.code === 'KeyM' || e.code === 'Escape')) { e.stopPropagation(); this.bigMap.close(); } };
    window.addEventListener('keydown', this._key, true);
  }

  _heading() {
    this.state.camera.getWorldDirection(_v);
    return Math.atan2(_v.x, _v.z);
  }

  open() {
    const s = this.state;
    if (s.over || s.inCard || s.paused || this.bigMap.isOpen) return;
    s.inCard = true;
    s.game.input.exitPointerLock();
    const p = s.player.pos;
    this.bigMap.open({ player: { x: p.x, z: p.z, heading: this._heading() }, dots: this.dots || [], target: this.target, targetColor: this.targetColor, waypoint: this.waypoint },
      (w) => { this.waypoint = w ? { x: w.x, z: w.z } : null; },
      () => { s.inCard = false; s._afterResume?.(); },
      { title: 'City map', hint: 'Click or tap anywhere to set a waypoint' });
  }

  /**
   * Every frame. dots: [{x, z, color, size}], target: {x, z} or null.
   * Returns the waypoint (or null) so the mode can point at it.
   */
  update(dots, target = null, targetColor = '#4dffa6') {
    const s = this.state, p = s.player.pos;
    this.dots = dots;
    this.target = target;
    this.targetColor = targetColor;
    if (s.game.input.wasPressed('map')) this.open();
    if (this.waypoint && Math.hypot(this.waypoint.x - p.x, this.waypoint.z - p.z) < 5) {
      this.waypoint = null;
      s.game.hud.toast('Waypoint reached', '', '#ff5ad0', 2);
    }
    this.minimap.draw({ x: p.x, z: p.z, heading: this._heading() }, dots, target, s.time, targetColor, null, this.waypoint);
    return this.waypoint;
  }

  dispose() {
    this.bigMap.close();
    this.state.game.hud.el.map.removeEventListener('pointerdown', this._tap);
    window.removeEventListener('keydown', this._key, true);
  }
}

import * as THREE from 'three';
import { makeRng } from '../core/utils.js';
import { getGlowTexture } from './materials.js';
import { save } from '../core/save.js';

// Crew tags: hidden collectibles in Free Run. Spray-painted crew emblems on
// the hardest places to get to: the tops of the towers, stairwell huts and
// upper roof levels, the top landings of fire escapes, gazebo roofs. In
// Frostvale (played in the streets): on the gazebos and fountains, and on the
// shop counters. Each one found is remembered (per map) and pays a little;
// finding them all pays a lot.

const COUNT = 25;
const SHOW = 70; // m: they only show (and glint) when you're this close

let _tex = null;
function tagTexture() {
  if (_tex) return _tex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ffd040';
  g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#16141c';
  g.beginPath(); g.arc(64, 64, 50, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#ff4fa0'; g.lineWidth = 10; g.lineCap = 'round';
  g.beginPath(); g.arc(64, 64, 32, Math.PI * 0.25, Math.PI * 1.9); g.stroke(); // a G
  g.beginPath(); g.moveTo(64, 66); g.lineTo(96, 66); g.stroke();
  g.fillStyle = '#39e6ff';
  for (const [x, y] of [[28, 30], [100, 98], [96, 28]]) { g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill(); } // (paint drips)
  _tex = new THREE.CanvasTexture(c);
  _tex.colorSpace = THREE.SRGBColorSpace;
  return _tex;
}

export class CrewTags {
  /**
   * @param {THREE.Object3D} parent
   * @param {object} city - a rooftop city (perches, parks, shops)
   * @param {string} mapId - which Free Run map (what's found is saved per map)
   */
  constructor(parent, city, mapId, { seed = 1 } = {}) {
    this.mapId = mapId;
    const rng = makeRng(seed * 91 + 7);
    // Where they can go
    let spots = city.groundLevel
      ? [...(city.parks || []).flatMap((p) => [new THREE.Vector3(p.center.x, 2.15, p.center.z)]),
        ...(city.perches || []).filter((v) => v.y < 5),
        ...(city.shops || []).map((sh) => new THREE.Vector3(sh.till.x, 1.05, sh.till.z).lerp(sh.keeper.pos, 0.5).setY(1.05))]
      : (city.perches || []).map((v) => v.clone());
    // Shuffle (the same way every time for a map), then keep them spread out
    for (let i = spots.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [spots[i], spots[j]] = [spots[j], spots[i]]; }
    const picked = [];
    for (const minD of [45, 30, 18, 0]) {
      for (const sp of spots) {
        if (picked.length >= COUNT) break;
        if (picked.includes(sp) || picked.some((q) => Math.hypot(q.x - sp.x, q.z - sp.z) < minD)) continue;
        picked.push(sp);
      }
    }
    this.total = picked.length;
    const found = new Set(save.data.tags?.[mapId] || []);
    const discGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.05, 24);
    discGeo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ map: tagTexture(), toneMapped: false });
    const glowMat = new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0xffd040, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0.6 });
    this.tags = picked.map((pos, i) => {
      const g = new THREE.Group();
      const disc = new THREE.Mesh(discGeo, mat);
      disc.position.y = 0.9;
      const glow = new THREE.Sprite(glowMat);
      glow.position.y = 0.9;
      glow.scale.setScalar(2.2);
      g.add(disc, glow);
      g.position.copy(pos);
      g.visible = false;
      parent.add(g);
      return { i, pos, g, disc, found: found.has(i) };
    });
    this.parent = parent;
  }

  get found() { return this.tags.filter((t) => t.found).length; }

  /** Spin the near ones; returns the tag you just picked up (or null). */
  update(dt, player) {
    let got = null;
    for (const t of this.tags) {
      if (t.found) { t.g.visible = false; continue; }
      const d = Math.hypot(t.pos.x - player.pos.x, t.pos.z - player.pos.z);
      t.g.visible = d < SHOW;
      if (!t.g.visible) continue;
      t.disc.rotation.y += dt * 2.2;
      t.disc.position.y = 0.9 + Math.sin(performance.now() / 400 + t.i) * 0.1;
      if (d < 1.6 && Math.abs(player.pos.y - t.pos.y) < 1.8) {
        t.found = true;
        const list = (save.data.tags ||= {})[this.mapId] ||= [];
        if (!list.includes(t.i)) list.push(t.i);
        save.write();
        got = t;
      }
    }
    return got;
  }

  dispose() {
    for (const t of this.tags) this.parent.remove(t.g);
    this.tags = [];
  }
}

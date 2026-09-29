import * as THREE from 'three';
import { getGlowTexture, makeGlowMaterial } from '../world/materials.js';

// Nitro canisters lying on the road: drive through one to refill your nitro.
//
// A handful are always around you (60-260 m away, on the roads). Collected
// ones, and ones you've left far behind, are moved to a new spot ahead, so
// there's always nitro somewhere nearby. They show as cyan dots on the minimap.

const COUNT = 7;
const PICKUP_RADIUS = 4.5;
const MIN_DIST = 60, MAX_DIST = 260, FORGET_DIST = 380;

export class NitroPickups {
  constructor(scene, city, rng) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.items = [];
    const canGeo = new THREE.CylinderGeometry(0.45, 0.45, 1.3, 14);
    const canMat = new THREE.MeshBasicMaterial({ color: 0x39c8ff, toneMapped: false });
    const capGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.25, 12);
    const capMat = new THREE.MeshLambertMaterial({ color: 0xd8dde8 });
    const ringGeo = new THREE.RingGeometry(2.4, 2.9, 32);
    for (let i = 0; i < COUNT; i++) {
      const g = new THREE.Group();
      const can = new THREE.Mesh(canGeo, canMat);
      can.position.y = 1.3;
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.y = 0.75; // on top of the can
      can.add(cap);
      const ring = new THREE.Mesh(ringGeo, makeGlowMaterial(0x39c8ff, 0.7));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.1;
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0x39c8ff, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0.7 }));
      halo.position.y = 1.3;
      halo.scale.setScalar(4);
      g.add(can, ring, halo);
      scene.add(g);
      this.items.push({ group: g, can, ring, pos: new THREE.Vector3(), placed: false });
    }
  }

  /** Put every canister somewhere new around the player (at the start of a run). */
  scatter(player) {
    for (const it of this.items) this._place(it, player);
  }

  _place(it, player) {
    const g = this.city.graph;
    const p = player.pos;
    // A random road segment whose middle is a good distance away
    for (let tries = 0; tries < 30; tries++) {
      const n = g.nodes[Math.floor(this.rng() * g.nodes.length)];
      const m = n.neighbours[Math.floor(this.rng() * n.neighbours.length)];
      if (!m) continue;
      const t = 0.3 + this.rng() * 0.4;
      const x = n.x + (m.x - n.x) * t, z = n.z + (m.z - n.z) * t;
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < MIN_DIST || d > MAX_DIST) continue;
      if (this.items.some((o) => o !== it && o.placed && Math.hypot(o.pos.x - x, o.pos.z - z) < 40)) continue;
      // Sit in one of the lanes, not on the centre line
      const len = Math.hypot(m.x - n.x, m.z - n.z) || 1;
      const lane = (this.rng() < 0.5 ? -1 : 1) * 4.2;
      it.pos.set(x + ((m.z - n.z) / len) * lane, 0, z - ((m.x - n.x) / len) * lane);
      it.group.position.copy(it.pos);
      it.group.visible = true;
      it.placed = true;
      return;
    }
    it.group.visible = false;
    it.placed = false;
  }

  /** @returns {boolean} true if the player drove through one this frame */
  update(dt, player) {
    let got = false;
    for (const it of this.items) {
      if (!it.placed) { this._place(it, player); continue; }
      it.can.rotation.y += dt * 2.5;
      it.ring.rotation.z -= dt * 1.5;
      it.can.position.y = 1.3 + Math.sin(performance.now() / 300 + it.pos.x) * 0.15;
      const d = Math.hypot(it.pos.x - player.pos.x, it.pos.z - player.pos.z);
      if (d < PICKUP_RADIUS && !player.airborne) {
        got = true;
        this._place(it, player);
      } else if (d > FORGET_DIST) {
        this._place(it, player);
      }
    }
    return got;
  }

  /** Cyan dots for the minimap. */
  minimapDots() {
    return this.items.filter((it) => it.placed).map((it) => ({ x: it.pos.x, z: it.pos.z, color: '#39c8ff', size: 1.1 }));
  }

  clear() {
    for (const it of this.items) this.scene.remove(it.group);
    this.items = [];
  }
}

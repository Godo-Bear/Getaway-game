import * as THREE from 'three';
import { admin } from '../core/admin.js';

// The Locator (on foot) and the Radar Locator (in the car): for 10 seconds
// everything useful nearby gets a marker on screen, even through walls:
// police, guards and their cars (red), cash and loot (green), bags to carry
// (amber), cars you could take (yellow) and where you're going (blue). Each
// marker shows how far away it is; ones off the edge of the screen sit on
// the edge, pointing the way.

export const LOCATOR_TIME = 10;
const RANGE = 70; // m

const _v = new THREE.Vector3();

/** Everything worth marking around you right now. Positions are read live (things move). */
function gather(state, driving) {
  const m = state.mode || {};
  const out = [];
  const add = (get, icon, label, color) => out.push({ get, icon, label, color });
  // Police and guards on foot
  const seen = new Set();
  for (const [list, label] of [[m.officers?.units, 'Police'], [m.patrols?.units, 'Guard'], [m.guards?.units, 'Guard'], [m.mailGuard?.units, 'Guard']]) {
    for (const u of list || []) {
      if (seen.has(u) || u.inactive) continue;
      seen.add(u);
      add(() => (u.inactive ? null : u.pc.pos), '!', label, '#ff4a5a');
    }
  }
  // Police cars (driving) and the helicopter
  for (const u of state.police?.units || []) add(() => u.car.pos, '!', 'Police car', '#ff4a5a');
  for (const h of [m.heli, state.heli, ...(m.helis || [])]) if (h?.pos) add(() => h.pos, '!', 'Helicopter', '#ff4a5a');
  // Street traffic on foot: cars to take, police cars
  if (m.traffic?.cars) {
    for (const t of m.traffic.cars) add(() => t.car.pos, '🚗', 'Car', '#ffd040');
    for (const t of m.traffic.cops || []) add(() => (t.leaving ? null : t.car.pos), '!', 'Police car', '#ff4a5a');
  }
  // Cash, loot, bags to carry
  for (const l of [...(m.loot || []), ...(m.bags || [])]) {
    add(() => (l.taken || l.group?.visible === false ? null : l.pos || l.group?.position), '$', 'Cash', '#4dffa6');
  }
  for (const c of m.carry || []) add(() => (c.done || c.group?.visible === false ? null : c.home), '▣', 'Bag', '#ffb020');
  // Where you're going
  if (m.goalPos) add(() => m.goalPos, '★', 'Goal', '#5ab4ff');
  // Anything else the mode puts on its minimap (side jobs, drop-offs...)
  if (driving || !out.length) {
    for (const d of m.minimapDots?.() || []) {
      if (d.color === '#ff3346') continue; // (police: marked above)
      const p = new THREE.Vector3(d.x, (state.player?.pos?.y ?? state.car?.pos?.y ?? 0), d.z);
      add(() => p, '◆', 'Here', d.color || '#5ab4ff');
    }
  }
  return out;
}

export class Locator {
  constructor(state, { driving = false } = {}) {
    this.state = state;
    this.driving = driving;
    this.t = 0;
    this.things = [];
    this.layer = null;
    this.ring = null;
  }

  get on() { return this.t > 0; }

  /** Switch it on: mark everything nearby for LOCATOR_TIME seconds. Returns how many things it found. */
  start(time = LOCATOR_TIME) {
    this.stop();
    this.t = time;
    this.total = time;
    this.things = gather(this.state, this.driving);
    this.layer = document.createElement('div');
    this.layer.className = 'locator';
    document.body.appendChild(this.layer);
    for (const th of this.things) {
      th.el = document.createElement('div');
      th.el.className = 'loc-mark';
      th.el.style.setProperty('--lc', th.color);
      th.el.innerHTML = `<i>${th.icon}</i><span>${th.label}</span><b></b>`;
      th.dist = th.el.querySelector('b');
      this.layer.appendChild(th.el);
    }
    // A ping: a ring that sweeps out across the ground
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 64).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x5ab4ff, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    this.ring.renderOrder = 4;
    this.state.scene.add(this.ring);
    this.ringT = 0;
    return this.near().length;
  }

  /** The things within range right now. */
  near() {
    const me = this._me();
    if (!me) return [];
    return this.things.filter((th) => { const p = th.get(); return p && (admin.flag('infiniteRange') || p.distanceTo(me) < RANGE); });
  }

  _me() { return this.state.player?.pos || this.state.car?.pos || null; }

  update(dt) {
    if (this.t <= 0) return;
    this.t = Math.max(0, this.t - dt);
    if (this.t <= 0) { this.stop(); return; }
    const me = this._me();
    const cam = this.state.camera;
    if (!me || !cam) return;
    // The ping ring
    if (this.ring) {
      this.ringT += dt;
      const k = Math.min(1, this.ringT / 1.2);
      this.ring.position.set(me.x, me.y + 0.15, me.z);
      this.ring.scale.setScalar(1 + k * RANGE);
      this.ring.material.opacity = 0.8 * (1 - k);
      if (k >= 1) { this.state.scene.remove(this.ring); this.ring.material.dispose(); this.ring.geometry.dispose(); this.ring = null; }
    }
    const hud = this.state.game.hud, W = hud.viewW || window.innerWidth, H = hud.viewH || window.innerHeight, pad = 34; // (the fitted screen size: right just after the phone turns)
    const fade = this.t < 1.5 ? this.t / 1.5 : 1;
    for (const th of this.things) {
      const p = th.get();
      const d = p ? p.distanceTo(me) : Infinity;
      if (!p || (d > RANGE && !admin.flag('infiniteRange'))) { th.el.hidden = true; continue; }
      th.el.hidden = false;
      _v.set(p.x, p.y + (th.label === 'Helicopter' ? 0 : 2.1), p.z).project(cam);
      let x = (_v.x * 0.5 + 0.5) * W, y = (-_v.y * 0.5 + 0.5) * H;
      const behind = _v.z > 1;
      if (behind) { x = W - x; y = H - pad; }
      const edge = behind || x < pad || x > W - pad || y < pad || y > H - pad;
      x = Math.min(W - pad, Math.max(pad, x));
      y = Math.min(H - pad, Math.max(pad, y));
      th.el.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px) translate(-50%, -100%)`;
      th.el.classList.toggle('edge', edge);
      th.el.style.opacity = (fade * (d < 25 ? 1 : 0.75)).toFixed(2);
      const txt = `${Math.round(d)} m`;
      if (th.dist.textContent !== txt) th.dist.textContent = txt;
    }
  }

  stop() {
    this.t = 0;
    this.layer?.remove();
    this.layer = null;
    this.things = [];
    if (this.ring) { this.state.scene.remove(this.ring); this.ring.material.dispose(); this.ring.geometry.dispose(); this.ring = null; }
  }
}

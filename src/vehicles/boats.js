import * as THREE from 'three';
import { makeGlowMaterial, makeTextTexture } from '../world/materials.js';

// Boats (Chapter 14, Porto Sereno's bay): Paz's speedboat, the harbour
// police launches and a little rowing boat. Each faces +Z (heading 0, like
// the cars) and sits with its waterline at y = 0, so the same arcade physics
// as the cars (Car with a boat spec) can drive it across a flat sea.

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });

/** A boat hull: tapered to a point at the front (+Z), flat at the back. */
function hullGeo(L, w, h, nose = 0.42) {
  const s = new THREE.Shape();
  const pts = [[-w / 2, -L / 2], [w / 2, -L / 2], [w / 2, L * 0.12], [w * 0.32, L * nose], [0, L / 2], [-w * 0.32, L * nose], [-w / 2, L * 0.12]];
  pts.forEach(([x, z], i) => (i ? s.lineTo(x, -z) : s.moveTo(x, -z)));
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  return g;
}

/** Paz's speedboat: long, low and fast, with a windscreen and a big outboard. */
export function buildSpeedboat({ color = 0xe8e4dc, stripe = 0xc0283a } = {}) {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(hullGeo(7.2, 2.5, 0.95), mat(color, { roughness: 0.35 }));
  hull.position.y = -0.35;
  const band = new THREE.Mesh(hullGeo(7.25, 2.54, 0.22), mat(stripe, { roughness: 0.4 }));
  band.position.y = 0.2;
  const keel = new THREE.Mesh(hullGeo(6.6, 2.1, 0.35), mat(0x1a2a3a));
  keel.position.y = -0.6;
  g.add(keel, hull, band);
  // the deck, the cockpit and its seats, the windscreen
  const deck = new THREE.Mesh(hullGeo(6.9, 2.3, 0.06), mat(0xa87a4a, { roughness: 0.8 }));
  deck.position.y = 0.6;
  g.add(deck);
  const cock = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.35, 2.2), mat(0x24324a));
  cock.position.set(0, 0.55, -0.9);
  g.add(cock);
  for (const sx of [-0.45, 0.45]) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.6), mat(0xf0e0b0));
    seat.position.set(sx, 0.9, -0.9);
    g.add(seat);
  }
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.55), new THREE.MeshStandardMaterial({ color: 0x9ad0ff, transparent: true, opacity: 0.45, roughness: 0.1, metalness: 0.4, side: THREE.DoubleSide }));
  glass.position.set(0, 1.05, 0.35);
  glass.rotation.x = -0.6;
  g.add(glass);
  // the outboard engine at the back
  const eng = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.0, 0.6), mat(0x1a1b20, { roughness: 0.4 }));
  eng.position.set(0, 0.55, -3.75);
  const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.9, 0.25), mat(0x2a2b31));
  leg.position.set(0, -0.2, -3.85);
  g.add(eng, leg);
  // navigation lights: red on the left, green on the right, white at the back
  const nav = (c, x, y, z) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), new THREE.MeshBasicMaterial({ color: c })); m.position.set(x, y, z); g.add(m); };
  nav(0xff3030, 1.0, 0.75, 2.0); nav(0x30ff60, -1.0, 0.75, 2.0); nav(0xffffff, 0, 1.1, -3.7);
  g.userData.kind = 'speedboat';
  return g;
}

/** A harbour police launch: bigger, a cabin with a light bar, POLICE on the side. */
export function buildPoliceBoat() {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(hullGeo(8.6, 3.0, 1.2), mat(0x1c2a48, { roughness: 0.4 }));
  hull.position.y = -0.5;
  const band = new THREE.Mesh(hullGeo(8.65, 3.04, 0.3), mat(0xe8e8e8));
  band.position.y = 0.35;
  const fend = new THREE.Mesh(hullGeo(8.8, 3.2, 0.25), mat(0xe8743a, { roughness: 0.9 })); // orange rubber fender
  fend.position.y = 0.05;
  g.add(fend, hull, band);
  const deck = new THREE.Mesh(hullGeo(8.3, 2.8, 0.06), mat(0x5a5f6a));
  deck.position.y = 0.66;
  g.add(deck);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 2.6), mat(0xe8e8e8, { roughness: 0.4 }));
  cabin.position.set(0, 1.4, -0.6);
  const win = new THREE.Mesh(new THREE.BoxGeometry(2.24, 0.45, 2.0), new THREE.MeshStandardMaterial({ color: 0x0a1420, emissive: 0x1a3048, roughness: 0.2 }));
  win.position.set(0, 1.7, -0.5);
  g.add(cabin, win);
  // the light bar (the mode flashes them)
  const red = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.3), new THREE.MeshBasicMaterial({ color: 0xff2030 }));
  const blue = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.3), new THREE.MeshBasicMaterial({ color: 0x2060ff }));
  red.position.set(-0.4, 2.2, -0.6); blue.position.set(0.4, 2.2, -0.6);
  g.add(red, blue);
  const glowR = new THREE.Mesh(new THREE.SphereGeometry(1.2, 10, 8), makeGlowMaterial(0xff2030, 0.35));
  const glowB = new THREE.Mesh(new THREE.SphereGeometry(1.2, 10, 8), makeGlowMaterial(0x2060ff, 0.35));
  glowR.position.copy(red.position); glowB.position.copy(blue.position);
  g.add(glowR, glowB);
  // POLICE on both sides of the hull
  const tex = makeTextTexture('POLICE', { color: '#ffffff', width: 256, height: 64, font: 'bold 50px "Bebas Neue", Impact, sans-serif', glow: false });
  for (const sx of [-1, 1]) {
    const t = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    t.position.set(sx * 1.52, 0.05, 0.6);
    t.rotation.y = sx * Math.PI / 2;
    g.add(t);
  }
  g.userData.kind = 'police';
  g.userData.lights = { red, blue, glowR, glowB };
  return g;
}

/** A little wooden rowing boat (with its oars). */
export function buildRowboat() {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(hullGeo(4.2, 1.7, 0.75, 0.38), mat(0x8a5a32, { roughness: 0.9 }));
  hull.position.y = -0.35;
  const rim = new THREE.Mesh(hullGeo(4.25, 1.74, 0.1, 0.38), mat(0x3a6ea8));
  rim.position.y = 0.38;
  g.add(hull, rim);
  for (const z of [-0.6, 0.6]) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.35), mat(0x6a4a2a));
    seat.position.set(0, 0.2, z);
    g.add(seat);
  }
  for (const sx of [-1, 1]) {
    const oar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.6, 5), mat(0xc8b48a));
    oar.position.set(sx * 1.1, 0.25, 0.1);
    oar.rotation.set(0.15, 0, sx * 1.25);
    g.add(oar);
  }
  return g;
}

import * as THREE from 'three';

// A dune buggy (Chapter 22): an open tube frame with a roll cage, a bucket
// seat, a big engine at the back and fat knobbly tyres on long springs.
// Faces +Z like the cars; userData.wheels spin, userData.steer turn.

export const BUGGY_SPEC = { maxSpeed: 34, accel: 17, brake: 24, reverseMax: 8, grip: 2.3, driftGrip: 0.85, steerLow: 2.5, steerHigh: 1.45,
  nitroAccel: 20, nitroMaxFactor: 1.3, mass: 0.9, slip: 1.0 };

export function buildBuggy({ color = 0xff7a1a, frame = 0x2a2b31 } = {}) {
  const g = new THREE.Group();
  const m = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, ...o });
  const tube = m(frame, { metalness: 0.6, roughness: 0.4 });
  const add = (geo, mat, x, y, z, rx = 0, rz = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.rotation.set(rx, 0, rz); g.add(o); return o; };
  // the floor pan and the nose
  add(new THREE.BoxGeometry(1.5, 0.18, 3.0), m(color, { metalness: 0.3, roughness: 0.4 }), 0, 0.55, 0);
  const nose = add(new THREE.BoxGeometry(1.2, 0.35, 0.9), m(color, { metalness: 0.3, roughness: 0.4 }), 0, 0.72, 1.55);
  nose.rotation.x = -0.25;
  // the engine at the back, with exhausts
  add(new THREE.BoxGeometry(1.1, 0.55, 0.8), m(0x3a3c42, { metalness: 0.7 }), 0, 0.9, -1.25);
  for (const s of [-0.3, 0.3]) add(new THREE.CylinderGeometry(0.06, 0.06, 0.6, 6), tube, s, 1.0, -1.75, Math.PI / 2);
  // the roll cage: two hoops and rails
  const hoop = (z, h, w) => {
    for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.045, 0.045, h, 6), tube, s * w, 0.62 + h / 2, z);
    add(new THREE.CylinderGeometry(0.045, 0.045, 2 * w, 6), tube, 0, 0.62 + h, z, 0, Math.PI / 2);
  };
  hoop(-0.55, 1.15, 0.68);
  hoop(0.55, 0.95, 0.66);
  for (const s of [-0.66, 0.66]) add(new THREE.CylinderGeometry(0.045, 0.045, 1.15, 6), tube, s, 1.67, 0, Math.PI / 2);
  // two bucket seats (driver on the left, a passenger on the right) and a spare tyre
  for (const s of [-0.34, 0.34]) add(new THREE.BoxGeometry(0.46, 0.5, 0.5), m(0x1a1b20), s, 0.85, -0.35);
  add(new THREE.TorusGeometry(0.32, 0.14, 6, 12), m(0x1a1a1a), 0, 1.25, -1.05, Math.PI / 2);
  // big knobbly wheels on long arms
  const wheels = [], steer = [];
  const tyre = new THREE.CylinderGeometry(0.48, 0.48, 0.42, 12);
  tyre.rotateZ(Math.PI / 2);
  const hub = new THREE.CylinderGeometry(0.2, 0.2, 0.44, 8);
  hub.rotateZ(Math.PI / 2);
  for (const [x, z, front] of [[-0.98, 1.15, true], [0.98, 1.15, true], [-1.02, -1.15, false], [1.02, -1.15, false]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.48, z);
    const w = new THREE.Group();
    w.add(new THREE.Mesh(tyre, m(0x1a1a1a, { roughness: 0.95 })), new THREE.Mesh(hub, m(0xc8c8c8, { metalness: 0.7 })));
    pivot.add(w);
    g.add(pivot);
    wheels.push(w);
    if (front) steer.push(pivot);
    // the suspension arm
    add(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 5), tube, x * 0.72, 0.55, z, 0, Math.PI / 2);
  }
  // headlights on the cage
  for (const s of [-0.3, 0.3]) add(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff2c0, toneMapped: false }), s, 1.75, 0.6);
  g.userData.wheels = wheels;
  g.userData.steer = steer;
  return g;
}

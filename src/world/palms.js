import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Palm trees (Porto Sereno): a tall, slightly leaning trunk with a crown of
// drooping fronds and a few coconuts. Instanced, like the other trees.
// trees: [[x, y, z, scale], ...]

let _geo = null;
function palmGeometry() {
  if (_geo) return _geo;
  // The trunk: a few stacked, tapering segments, each leaning a little more
  const segs = [];
  let x = 0, y = 0;
  for (let k = 0; k < 5; k++) {
    const h = 1.35, r0 = 0.26 - k * 0.03, r1 = 0.24 - k * 0.03;
    const s = new THREE.CylinderGeometry(r1, r0, h, 7);
    s.translate(0, h / 2, 0);
    s.rotateZ(-0.05 * (k + 1));
    s.translate(x, y, 0);
    segs.push(s);
    x += Math.sin(0.05 * (k + 1)) * h;
    y += Math.cos(0.05 * (k + 1)) * h;
  }
  const trunk = mergeGeometries(segs, false);
  // The fronds: long thin leaves arching out and down from the top
  const fronds = [];
  for (let k = 0; k < 8; k++) {
    const leaf = new THREE.BoxGeometry(0.55, 0.06, 2.8);
    leaf.translate(0, 0, 1.4);
    leaf.rotateX(0.35 + (k % 2) * 0.25); // (droop)
    leaf.rotateY((k / 8) * Math.PI * 2);
    leaf.translate(x, y + 0.1, 0);
    fronds.push(leaf);
  }
  const crown = mergeGeometries(fronds, false);
  const nuts = mergeGeometries([0, 1, 2].map((k) => new THREE.SphereGeometry(0.16, 6, 5).translate(x + Math.cos(k * 2.1) * 0.25, y - 0.2, Math.sin(k * 2.1) * 0.25)), false);
  _geo = { trunk, crown, nuts };
  return _geo;
}

export function buildPalms(trees) {
  const g = new THREE.Group();
  if (!trees.length) return g;
  const { trunk, crown, nuts } = palmGeometry();
  const meshes = [
    new THREE.InstancedMesh(trunk, new THREE.MeshLambertMaterial({ color: 0x8a6a4a, flatShading: true }), trees.length),
    new THREE.InstancedMesh(crown, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, side: THREE.DoubleSide }), trees.length),
    new THREE.InstancedMesh(nuts, new THREE.MeshLambertMaterial({ color: 0x5a4020 }), trees.length),
  ];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
  const greens = [0x3a8a3a, 0x4a9a3a, 0x2f7a3a, 0x5a9a2a];
  trees.forEach(([x, y, z, s], i) => {
    m.compose(p.set(x, y, z), q.setFromAxisAngle(up, (x * 7.13 + z * 3.7) % 6.28), sc.set(s, s * 1.1, s));
    for (const im of meshes) im.setMatrixAt(i, m);
    meshes[1].setColorAt(i, c.set(greens[Math.abs(Math.floor(x * 3 + z * 7)) % greens.length]));
  });
  for (const im of meshes) { im.castShadow = true; g.add(im); }
  return g;
}

// Porto Sereno's buildings: whitewash, sand, ochre, terracotta and pastels
export const COASTAL_TINTS = [0xf2ece0, 0xe8d8b8, 0xd8a868, 0xc87850, 0xe8c0b0, 0xa8c8d8, 0xf0e0a0, 0xd8e0c8];

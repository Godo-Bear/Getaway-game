import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeRng } from '../core/utils.js';

// Mirage Springs (Chapters 22-24): a city of casinos in the middle of the
// desert. Sandstone and adobe walls, flat roofs, gold-glass casino towers
// covered in neon (the Strip), palm trees, and all round the city: sand,
// cacti, and red mesas on the horizon. Both cities (the streets you drive
// and the rooftops) use this.

/** Sandstone, adobe and stucco (8, like the other places' lists). */
export const DESERT_TINTS = [0xe0b884, 0xd8a870, 0xe8c89a, 0xc89060, 0xdcae7a, 0xf0d0a8, 0xc8a078, 0xe4bc8c];
/** The casino towers' gold and bronze glass. */
export const DESERT_GLASS = [0xc8a040, 0xb88a30, 0xd8b050, 0x9a7034];
/** The neon on the casinos and the motels. */
export const DESERT_WORDS = ['CASINO', 'MOTEL', 'JACKPOT', 'SALOON', 'OASIS', 'DINER', 'SLOTS', 'CHAPEL', 'BINGO', 'MIRAGE', 'WIN', 'GOLD'];
export const DESERT_COLORS = ['#ffd040', '#ff3a3a', '#ff7ac8', '#ffa020', '#4dffa6', '#2fe0ff'];
export const DESERT_SLOGANS = ['GOLDEN MIRAGE', 'LUCKY SEVEN', 'JACKPOT CITY', 'DESERT ROSE'];
/** Signs over the shops (and their colours). */
export const DESERT_SIGNS = [['CASINO', '#ffd040'], ['MOTEL', '#ff3a3a'], ['DINER', '#2fe0ff'], ['SALOON', '#ffa020'], ['JACKPOT', '#ff7ac8'], ['OASIS', '#4dffa6']];
export const SAND = 0xe2c08a;

let cactusGeo = null;
/** A saguaro: a ribbed trunk with two arms bent up. */
function cactusGeometry() {
  if (cactusGeo) return cactusGeo;
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.42, 0.5, 6, 8);
  trunk.translate(0, 3, 0);
  parts.push(trunk);
  for (const [s, y, h] of [[1, 2.2, 2.2], [-1, 3, 1.8]]) {
    const out = new THREE.CylinderGeometry(0.3, 0.3, 1.2, 7);
    out.rotateZ(Math.PI / 2);
    out.translate(s * 0.9, y, 0);
    const up = new THREE.CylinderGeometry(0.28, 0.3, h, 7);
    up.translate(s * 1.45, y + h / 2 - 0.1, 0);
    parts.push(out, up);
  }
  cactusGeo = mergeGeometries(parts, false);
  return cactusGeo;
}

/**
 * Cacti: [[x, z, scale, turn], ...] (instanced).
 */
export function buildCacti(list) {
  const m = new THREE.InstancedMesh(cactusGeometry(), new THREE.MeshLambertMaterial({ color: 0x4a7a3a, flatShading: true }), Math.max(1, list.length));
  const o = new THREE.Object3D();
  list.forEach(([x, z, s, r], i) => { o.position.set(x, 0, z); o.rotation.set(0, r, 0); o.scale.setScalar(s); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
  m.count = list.length;
  return m;
}

/** A mesa: a flat-topped red rock with sloping sides and stripes of rock. */
export function buildMesa(x, z, w, h, rng) {
  const g = new THREE.Group();
  const layers = 3;
  for (let k = 0; k < layers; k++) {
    const r0 = w * (1 - k * 0.12), r1 = w * (0.9 - k * 0.12);
    const geo = new THREE.CylinderGeometry(r1, r0, h / layers, 7 + Math.floor(rng() * 3));
    const col = [0xb0623a, 0xc07448, 0xa85a34][k];
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: col, flatShading: true }));
    m.position.y = (k + 0.5) * (h / layers);
    m.rotation.y = rng() * Math.PI;
    m.scale.z = 0.6 + rng() * 0.5;
    g.add(m);
  }
  g.position.set(x, 0, z);
  return g;
}

/**
 * The desert round the city: sand out to the horizon, cacti and rocks near
 * the edge of town, red mesas far off. (outer..outerMax: the city's edges)
 */
export function buildDesertRim(outer, outerMax, seed = 22) {
  const g = new THREE.Group();
  const rng = makeRng(seed);
  const mid = (outer + outerMax) / 2, size = outerMax - outer;
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(size + 2400, size + 2400), new THREE.MeshLambertMaterial({ color: SAND }));
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(mid, -0.06, mid);
  g.add(sand);
  // dunes: long low humps of sand
  const dune = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const dm = new THREE.InstancedMesh(dune, new THREE.MeshLambertMaterial({ color: 0xe8c890 }), 40);
  const o = new THREE.Object3D();
  for (let k = 0; k < 40; k++) {
    const a = rng() * Math.PI * 2, r = size / 2 + 90 + rng() * 260;
    o.position.set(mid + Math.cos(a) * r, -0.5, mid + Math.sin(a) * r);
    o.rotation.set(0, rng() * Math.PI, 0);
    o.scale.set(20 + rng() * 40, 3 + rng() * 6, 8 + rng() * 14);
    o.updateMatrix();
    dm.setMatrixAt(k, o.matrix);
  }
  g.add(dm);
  // cacti and rocks just outside town
  const cacti = [];
  for (let k = 0; k < 160; k++) {
    const a = rng() * Math.PI * 2, r = size / 2 + 25 + rng() * 220;
    cacti.push([mid + Math.cos(a) * r, mid + Math.sin(a) * r, 0.7 + rng() * 0.6, rng() * Math.PI]);
  }
  g.add(buildCacti(cacti));
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0xa87a54, flatShading: true }), 60);
  for (let k = 0; k < 60; k++) {
    const a = rng() * Math.PI * 2, r = size / 2 + 20 + rng() * 200;
    o.position.set(mid + Math.cos(a) * r, 0, mid + Math.sin(a) * r);
    o.rotation.set(rng(), rng(), rng());
    o.scale.setScalar(0.6 + rng() * 2.2);
    o.updateMatrix();
    rocks.setMatrixAt(k, o.matrix);
  }
  g.add(rocks);
  // mesas on the horizon (the haze softens them)
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2 + rng() * 0.3, r = size / 2 + 240 + rng() * 120;
    g.add(buildMesa(mid + Math.cos(a) * r, mid + Math.sin(a) * r, 40 + rng() * 50, 40 + rng() * 50, rng));
  }
  return g;
}

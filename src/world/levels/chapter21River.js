import * as THREE from 'three';
import { CollisionWorld } from '../../core/collision.js';
import { makeGlowMaterial, makeTextTexture } from '../materials.js';
import { CLASSIC_TINTS, ZINC, riverMaterial, buildIronTower, buildRiverBoat } from '../lumiere.js';
import { buildPoliceBoat } from '../../vehicles/boats.js';
import { makeRng } from '../../core/utils.js';

// ======================================================================
//  Chapter 21, Part 2: down the river through Lumière in Paz's speedboat.
//
//  The river runs from the quay where you got in (z = 0) towards -z, a
//  kilometre to the Iron Tower. The water is at y = 0, the quays are stone
//  walls up to the streets (y = 4.5) on both sides.
//
//   - Stone bridges: most have three wide arches. The five-arch ones have
//     narrow side arches (4 m): your boat fits, the police launches don't.
//     At two of them the police have moored launches across the middle arch.
//   - Two low iron footbridges: your boat fits under, but you have to DUCK.
//     The police launches are too tall: they're stuck behind.
//   - An island in the middle, with the cathedral on it.
//   - Tourist boats going up and down.
//   - The landing stage under the Iron Tower at the end.
// ======================================================================

export const HALF = 17;          // the river is 34 m wide (x -17..17)
export const QUAY_Y = 4.5;       // the streets are up here
export const START_Z = 0, END_Z = -1080;
export const LOW_UNDER = 2.0;    // the footbridges' underside: your boat (1.4) fits, a police launch (2.5) doesn't
export const BRIDGES = [
  { z: -110, arches: 3, name: 'Pont des Arts' },
  { z: -230, arches: 5, name: 'Pont Royal', block: true },
  { z: -380, arches: 3, name: 'Pont Neuf' },
  { z: -640, arches: 5, name: 'Pont Marie', block: true },
  { z: -800, arches: 3, name: 'Pont de l\'Alma' },
  { z: -930, arches: 5, name: 'Pont d\'Iéna' },
];
export const LOW_BRIDGES = [{ z: -305, name: 'Passerelle Saint-Louis' }, { z: -720, name: 'Passerelle des Lumières' }];
export const ISLAND = { x0: -6, x1: 6, z0: -590, z1: -470 };
export const GOAL = new THREE.Vector3(12.5, 0, -1040);

/** Where the piers stand (x ranges) for a bridge with 3 or 5 arches. */
export function piersOf(arches) {
  return arches === 5 ? [[-12.5, -10.5], [-6.5, -4.5], [4.5, 6.5], [10.5, 12.5]] : [[-7.5, -5], [5, 7.5]];
}

function facadeTexture(rng) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#e8e0cc'; g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 21) { g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(0, y + 18, 128, 3); }
  for (let fy = 0; fy < 6; fy++) for (let fx = 0; fx < 5; fx++) {
    const x = 6 + fx * 25, y = 4 + fy * 21;
    g.fillStyle = rng() < 0.25 ? '#ffd890' : '#2a3442';
    g.fillRect(x, y, 12, 14);
    g.fillStyle = '#3a3a3a'; g.fillRect(x - 1, y + 13, 14, 2); // (iron balconies)
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildChapter21River() {
  const group = new THREE.Group();
  const world = new CollisionWorld(10);
  const rng = makeRng(2121);
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
  const stone = mat(0xcfc3a6), stoneDark = mat(0x9a8e74), iron = mat(0x2a2c30, { metalness: 0.6, roughness: 0.5 });
  const solid = (x0, y0, z0, x1, y1, z1, material) => {
    if (material) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), material);
      m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      group.add(m);
    }
    return world.addBox(x0, y0, z0, x1, y1, z1, { tag: 'wall' });
  };
  const len = START_Z + 60 - END_Z, midZ = (START_Z + 60 + END_Z) / 2;

  // ---------------------------------------------------------------- the water, the quays, the streets
  const water = new THREE.Mesh(new THREE.PlaneGeometry(2 * HALF + 4, len), riverMaterial());
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0, midZ);
  group.add(water);
  for (const s of [-1, 1]) {
    solid(s < 0 ? -HALF - 2.5 : HALF, -2, END_Z, s < 0 ? -HALF : HALF + 2.5, QUAY_Y, START_Z + 60, stone);   // the quay wall
    const street = new THREE.Mesh(new THREE.PlaneGeometry(64, len), mat(0x8a8478));
    street.rotation.x = -Math.PI / 2;
    street.position.set(s * (HALF + 34.5), QUAY_Y, midZ);
    group.add(street);
    // the parapet along the top, and the green booksellers' boxes on it
    const par = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, len), stone);
    par.position.set(s * (HALF + 2.2), QUAY_Y + 0.45, midZ);
    group.add(par);
  }
  solid(-HALF, -2, END_Z - 3, HALF, QUAY_Y, END_Z, stoneDark);           // the weir at the far end
  solid(-HALF, -2, START_Z + 60, HALF, QUAY_Y, START_Z + 63, stoneDark); // the lock behind you
  // the booksellers' boxes, lamps and plane trees along both quays
  const nBooks = 120, books = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.7, 2.2), mat(0x2f6a3a), nBooks);
  const nLamps = 80, lamps = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.1, 4.2, 6), iron, nLamps);
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.28, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe0a0, toneMapped: false }), nLamps);
  const nTrees = 110, trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.35, 5, 6), mat(0x5a4632), nTrees);
  const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(3.2, 1), mat(0x4a7a3a, { flatShading: true }), nTrees);
  const o = new THREE.Object3D();
  let nb = 0, nl = 0, nt = 0;
  for (let z = START_Z + 50; z > END_Z + 10; z -= 18) {
    for (const s of [-1, 1]) {
      if (nb < nBooks && rng() < 0.6) { o.position.set(s * (HALF + 2.2), QUAY_Y + 1.25, z + rng() * 6); o.rotation.set(0, 0, 0); o.scale.setScalar(1); o.updateMatrix(); books.setMatrixAt(nb++, o.matrix); }
      if (nl < nLamps && Math.round(z / 18) % 2 === 0) {
        o.position.set(s * (HALF + 3.4), QUAY_Y + 2.1, z); o.updateMatrix(); lamps.setMatrixAt(nl, o.matrix);
        o.position.y = QUAY_Y + 4.3; o.updateMatrix(); heads.setMatrixAt(nl++, o.matrix);
      }
      if (nt < nTrees) {
        const tz = z + 9;
        o.position.set(s * (HALF + 8), QUAY_Y + 2.5, tz); o.updateMatrix(); trunks.setMatrixAt(nt, o.matrix);
        o.position.y = QUAY_Y + 6.5; o.scale.set(1, 0.85 + rng() * 0.3, 1); o.updateMatrix(); crowns.setMatrixAt(nt++, o.matrix); o.scale.setScalar(1);
      }
    }
  }
  books.count = nb; lamps.count = heads.count = nl; trunks.count = crowns.count = nt;
  group.add(books, lamps, heads, trunks, crowns);

  // ---------------------------------------------------------------- the buildings along the quays
  const towerX = 60, towerZ = END_Z + 20;
  const facade = new THREE.MeshStandardMaterial({ map: facadeTexture(rng), roughness: 0.9 });
  const nBld = 150, bld = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), facade, nBld);
  const roofs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.62, 0.72, 1, 4, 1), mat(ZINC, { metalness: 0.4, roughness: 0.55 }), nBld);
  let n = 0;
  const col = new THREE.Color();
  for (const s of [-1, 1]) {
    for (let z = START_Z + 55; z > END_Z; z -= 16) {
      if (s > 0 && z < towerZ + 70) continue; // (the tower's park, by the end)
      const h = 18 + rng() * 6, w = 15.2, d = 18;
      const x = s * (HALF + 34 + d / 2);
      o.position.set(x, QUAY_Y + h / 2, z); o.rotation.set(0, 0, 0); o.scale.set(d, h, w); o.updateMatrix();
      bld.setMatrixAt(n, o.matrix);
      bld.setColorAt(n, col.setHex(CLASSIC_TINTS[Math.floor(rng() * CLASSIC_TINTS.length)]));
      o.position.set(x, QUAY_Y + h + 2, z); o.rotation.set(0, Math.PI / 4, 0); o.scale.set(d * 0.95, 4, w * 0.95); o.updateMatrix();
      roofs.setMatrixAt(n++, o.matrix);
      if (n >= nBld) break;
    }
  }
  bld.count = roofs.count = n;
  group.add(bld, roofs);

  // ---------------------------------------------------------------- the stone bridges
  for (const b of BRIDGES) {
    const piers = piersOf(b.arches);
    const shape = new THREE.Shape();
    shape.moveTo(-HALF - 2.5, -2); shape.lineTo(HALF + 2.5, -2); shape.lineTo(HALF + 2.5, 8.6); shape.lineTo(-HALF - 2.5, 8.6); shape.lineTo(-HALF - 2.5, -2);
    const edges = [-HALF, ...piers.flat(), HALF];
    for (let k = 0; k < edges.length; k += 2) {
      const xa = edges[k], xb = edges[k + 1], r = (xb - xa) / 2, cx = (xa + xb) / 2, spring = 6.6 - r;
      const hole = new THREE.Path();
      hole.moveTo(xa, -1.5); hole.lineTo(xb, -1.5); hole.lineTo(xb, spring);
      hole.absarc(cx, spring, r, 0, Math.PI, false);
      hole.lineTo(xa, -1.5);
      shape.holes.push(hole);
    }
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 10, bevelEnabled: false });
    geo.translate(0, 0, -5);
    const m = new THREE.Mesh(geo, stone);
    m.position.z = b.z;
    group.add(m);
    // the parapets and the lamps on top
    for (const e of [-5.2, 5.2]) {
      const par = new THREE.Mesh(new THREE.BoxGeometry(2 * HALF + 5, 1, 0.5), stone);
      par.position.set(0, 9.1, b.z + e);
      group.add(par);
    }
    // the piers, with pointed cutwaters (they're what you can hit)
    for (const [xa, xb] of piers) {
      solid(xa, -2, b.z - 5, xb, 6.6, b.z + 5, null);
      for (const e of [-1, 1]) {
        const cut = new THREE.Mesh(new THREE.BoxGeometry((xb - xa) / Math.SQRT2, 6, (xb - xa) / Math.SQRT2), stoneDark);
        cut.position.set((xa + xb) / 2, 1, b.z + e * 5);
        cut.rotation.y = Math.PI / 4;
        group.add(cut);
        world.addBox(xa + 0.3, -2, b.z + e * 5 - 0.7, xb - 0.3, 4, b.z + e * 5 + 0.7, { tag: 'wall' });
      }
    }
    // a name plaque
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.8), new THREE.MeshBasicMaterial({ map: makeTextTexture(b.name.toUpperCase(), { color: '#3a3428', bg: '#e8dfca' }), toneMapped: false }));
    sign.position.set(0, 7.6, b.z + 5.05);
    group.add(sign);
  }

  // ---------------------------------------------------------------- the police blockades (launches across the middle arch)
  const blockades = [];
  for (const b of BRIDGES.filter((x) => x.block)) {
    const z = b.z + 9;
    for (const [x, h] of [[-2.2, 0.15], [2.2, -0.15]]) {
      const boat = buildPoliceBoat();
      boat.position.set(x, 0, z);
      boat.rotation.y = Math.PI / 2 + h;
      group.add(boat);
      blockades.push(boat);
    }
    solid(-4.6, -1, z - 2.2, 4.6, 3, z + 2.2, null);
    // an orange floating boom across the arch
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 9.2, 8), mat(0xff7a1a));
    boom.rotation.z = Math.PI / 2;
    boom.position.set(0, 0.15, z + 3);
    group.add(boom);
  }

  // ---------------------------------------------------------------- the low iron footbridges
  const lowSign = makeTextTexture('LOW BRIDGE: DUCK!', { color: '#1a1a1a', bg: '#ffd040' });
  for (const lb of LOW_BRIDGES) {
    const deck = new THREE.Mesh(new THREE.BoxGeometry(2 * HALF + 5, 0.5, 4), iron);
    deck.position.set(0, LOW_UNDER + 0.25, lb.z);
    group.add(deck);
    // hazard stripes along its edge, and a sign
    const stripes = new THREE.Mesh(new THREE.BoxGeometry(2 * HALF + 5, 0.22, 4.04), new THREE.MeshBasicMaterial({ color: 0xffd040, toneMapped: false }));
    stripes.position.set(0, LOW_UNDER + 0.1, lb.z);
    group.add(stripes);
    for (const e of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(2 * HALF + 5, 1.1, 0.08), iron);
      rail.position.set(0, LOW_UNDER + 1.05, lb.z + e * 1.95);
      group.add(rail);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(5, 0.7), new THREE.MeshBasicMaterial({ map: lowSign, toneMapped: false }));
      sign.position.set(0, LOW_UNDER + 1.2, lb.z + e * 2.05);
      if (e < 0) sign.rotation.y = Math.PI;
      group.add(sign);
    }
  }

  // ---------------------------------------------------------------- the island, with its cathedral
  const I = ISLAND;
  solid(I.x0, -2, I.z0, I.x1, QUAY_Y, I.z1, stone);
  for (const [z, s] of [[I.z1, 1], [I.z0, -1]]) { // (pointed ends)
    const tip = new THREE.Mesh(new THREE.BoxGeometry(8.5, QUAY_Y + 2, 8.5), stone);
    tip.position.set(0, QUAY_Y / 2 - 1, z + s * 0.5);
    tip.rotation.y = Math.PI / 4;
    group.add(tip);
    world.addBox(-3, -2, s > 0 ? z : z - 5, 3, QUAY_Y, s > 0 ? z + 5 : z, { tag: 'wall' });
  }
  const cath = mat(0xd8ccb0);
  const nave = new THREE.Mesh(new THREE.BoxGeometry(7, 14, 50), cath);
  nave.position.set(0, QUAY_Y + 7, (I.z0 + I.z1) / 2 - 8);
  const navRoof = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 5, 6, 4), mat(ZINC));
  navRoof.scale.set(1, 1, 7);
  navRoof.rotation.y = Math.PI / 4;
  navRoof.position.set(0, QUAY_Y + 17, nave.position.z);
  group.add(nave, navRoof);
  for (const x of [-2.6, 2.6]) {
    const tw = new THREE.Mesh(new THREE.BoxGeometry(5, 26, 6), cath);
    tw.position.set(x, QUAY_Y + 13, nave.position.z + 27);
    group.add(tw);
  }
  const spire = new THREE.Mesh(new THREE.ConeGeometry(1.2, 16, 6), mat(ZINC));
  spire.position.set(0, QUAY_Y + 22, nave.position.z - 4);
  group.add(spire);

  // ---------------------------------------------------------------- the Iron Tower, and the landing stage under it
  const tower = buildIronTower(towerX, towerZ);
  group.add(tower.group);
  const stage = new THREE.Mesh(new THREE.BoxGeometry(5, 0.5, 14), mat(0x6a5a42));
  stage.position.set(HALF - 2.5, 0.35, GOAL.z);
  group.add(stage);
  const goalRing = new THREE.Mesh(new THREE.RingGeometry(4, 5, 32), makeGlowMaterial(0x4dffa6, 0.8));
  goalRing.rotation.x = -Math.PI / 2;
  goalRing.position.set(GOAL.x, 0.08, GOAL.z);
  const goalBeam = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 60, 16, 1, true), makeGlowMaterial(0x4dffa6, 0.18));
  goalBeam.position.set(GOAL.x, 30, GOAL.z);
  group.add(goalRing, goalBeam);

  // ---------------------------------------------------------------- tourist boats, chugging up and down between the bridges
  const bateaux = [
    [-20, -95, 3], [-130, -215, -2.5], [-250, -290, 3], [-320, -365, -3], [-660, -705, 2.5], [-740, -785, -2.5], [-820, -915, 2],
  ].map(([za, zb, x], i) => {
    const mesh = buildRiverBoat(i % 2 ? 0xf2f2ee : 0xe8d8b8);
    group.add(mesh);
    const box = world.addBox(x - 2.1, -1, za - 9, x + 2.1, 2.5, za + 9, { tag: 'wall', moving: true });
    return { mesh, box, x, za, zb, t: rng() * 10, speed: 2.2 + rng() * 1.2, z: za };
  });

  return {
    group, world, bateaux, blockades, tower, goalRing, goalBeam,
    spawn: new THREE.Vector3(0, 0.05, START_Z - 6), checkpoints: [], ladders: [], hideSpots: [], buildings: [],
  };
}

import * as THREE from 'three';

// Lumière (Chapters 19-21): a grand old European capital. Cream limestone
// buildings six or seven storeys high, grey zinc mansard roofs with chimney
// pots, wrought-iron balconies, cafés with awnings, plane trees, a river
// with stone quays and bridges through the middle of the city, tourist
// boats on it, and the Iron Tower over everything.

/** Limestone, a little warmer or greyer from building to building (8 of them). */
export const CLASSIC_TINTS = [0xe4d9c0, 0xd9ccb0, 0xe8dfca, 0xcfc0a2, 0xdcd2bc, 0xd4c6a8, 0xe0d4b8, 0xc8b898];
/** The signs over the shops (and their colours). */
export const CLASSIC_WORDS = [['CAFÉ', '#ffd070'], ['BOULANGERIE', '#ffb020'], ['BISTRO', '#ff6a5a'], ['PHARMACIE', '#4dffa6'], ['LIBRAIRIE', '#9ad0ff'], ['HÔTEL', '#ffd9a0']];
export const ZINC = 0x5f6b78;

let waterMat = null;
/** The river's water (one material for every stretch of it). */
export function riverMaterial() {
  return (waterMat ||= new THREE.MeshStandardMaterial({ color: 0x1c3a52, roughness: 0.12, metalness: 0.55, emissive: 0x06121c }));
}

/** A lattice texture for the tower: crossed iron girders, see-through between them. */
function latticeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 64, 64);
  g.strokeStyle = '#3a3428';
  g.lineWidth = 5;
  g.strokeRect(2, 2, 60, 60);
  g.lineWidth = 3;
  g.beginPath(); g.moveTo(0, 0); g.lineTo(64, 64); g.moveTo(64, 0); g.lineTo(0, 64); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * The Iron Tower: a lattice tower on four splayed legs, 120 m high, lit up
 * gold at night. Returns { group, legs } (legs = collision boxes [x0,z0,x1,z1]).
 */
export function buildIronTower(x, z, height = 120) {
  const group = new THREE.Group();
  const tex = latticeTexture();
  const mat = (rep) => {
    const t = tex.clone();
    t.needsUpdate = true;
    t.repeat.set(rep[0], rep[1]);
    return new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, color: 0xd8b070, emissive: 0x6a4a18, emissiveIntensity: 0.9, roughness: 0.7 });
  };
  // four tiers: a wide base on legs, a first platform, a tall middle, the needle
  const tiers = [
    [0, 26, 17, 10.5],     // y0, y1, half-width at the bottom, at the top
    [28, 58, 9.5, 5.0],
    [60, 104, 4.6, 1.6],
    [104, height, 1.4, 0.3],
  ];
  for (const [y0, y1, w0, w1] of tiers) {
    // a square frustum (4 sides), rotated so its faces line up with the axes
    const geo = new THREE.CylinderGeometry(w1 * Math.SQRT2, w0 * Math.SQRT2, y1 - y0, 4, 1, true);
    geo.rotateY(Math.PI / 4);
    const m = new THREE.Mesh(geo, mat([Math.max(1, Math.round(w0 / 2)), Math.max(1, Math.round((y1 - y0) / 4))]));
    m.position.set(x, (y0 + y1) / 2, z);
    group.add(m);
  }
  // the platforms (solid decks) and the great arch between the legs
  const deck = new THREE.MeshStandardMaterial({ color: 0x5a4a32, emissive: 0x2a1a08, roughness: 0.8 });
  for (const [y, w] of [[26.5, 11.5], [58.5, 5.6], [104.5, 1.9]]) {
    const d = new THREE.Mesh(new THREE.BoxGeometry(w * 2, 1.4, w * 2), deck);
    d.position.set(x, y, z);
    group.add(d);
  }
  // lights: warm dots up the edges (one instanced mesh) and a beacon on top
  const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.35, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffe0a0, toneMapped: false }), 120);
  const o = new THREE.Object3D();
  let n = 0;
  for (const [y0, y1, w0, w1] of tiers) {
    for (let k = 0; k <= 7 && n < 116; k++) {
      const t = k / 7, y = y0 + (y1 - y0) * t, w = w0 + (w1 - w0) * t;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        o.position.set(x + sx * w, y, z + sz * w);
        o.updateMatrix();
        dots.setMatrixAt(n++, o.matrix);
      }
    }
  }
  dots.count = n;
  group.add(dots);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff2c0, toneMapped: false }));
  beacon.position.set(x, height + 0.6, z);
  group.add(beacon);
  // the four legs (where it touches the ground: they block you)
  const legs = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => {
    const cx = x + sx * 14.5, cz = z + sz * 14.5;
    return [cx - 2.5, cz - 2.5, cx + 2.5, cz + 2.5];
  });
  return { group, legs, beacon, dots };
}

/** A long low tourist boat with a glass roof (a "bateau"), lit from inside. */
export function buildRiverBoat(color = 0xf2f2ee) {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.3, 18), new THREE.MeshStandardMaterial({ color, roughness: 0.5 }));
  hull.position.y = 0.4;
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(4.24, 0.2, 18.04), new THREE.MeshStandardMaterial({ color: 0x1a3a7a }));
  stripe.position.y = 0.75;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.4, 13), new THREE.MeshStandardMaterial({ color: 0x9ad0ff, transparent: true, opacity: 0.45, roughness: 0.1, emissive: 0xffd9a0, emissiveIntensity: 0.35 }));
  cabin.position.set(0, 1.75, -0.5);
  g.add(hull, stripe, cabin);
  return g;
}

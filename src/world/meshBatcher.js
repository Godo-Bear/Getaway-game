import * as THREE from 'three';

// MeshBatcher: builds lots of boxes into a FEW big meshes.
//
// Why? Every separate THREE.Mesh costs a "draw call", and draw calls are the
// main thing that slows WebGL down. A city with 2,000 boxes as 2,000 meshes
// would struggle; the same boxes merged into ~6 meshes (one per material) is
// easy for any laptop. The trade-off: merged boxes can't move individually,
// which is fine for buildings and props.
//
// Usage:
//   const batch = new MeshBatcher();
//   batch.addBox(min, max, { side: 'wall', top: 'roof', color: 0x888888 });
//   scene.add(batch.build(materials));   // materials = { wall: Material, ... }
//
// UVs are generated in *world units* (metres / uvScale), so a texture repeats
// at the same size on every building no matter how big the box is.

const _c = new THREE.Color();

export class MeshBatcher {
  constructor() {
    this.buckets = new Map(); // materialKey -> { pos:[], nrm:[], uv:[], col:[] }
  }

  _bucket(key) {
    let b = this.buckets.get(key);
    if (!b) this.buckets.set(key, (b = { pos: [], nrm: [], uv: [], col: [] }));
    return b;
  }

  /**
   * Add one flat rectangle.
   * origin + U + V describe it; normal is U x V (counter-clockwise front face).
   * `uvFn(x, y, z)` returns [u, v] for each corner.
   */
  addQuad(key, o, U, V, n, color, uvFn) {
    const b = this._bucket(key);
    const corners = [
      [o[0], o[1], o[2]],
      [o[0] + U[0], o[1] + U[1], o[2] + U[2]],
      [o[0] + U[0] + V[0], o[1] + U[1] + V[1], o[2] + U[2] + V[2]],
      [o[0] + V[0], o[1] + V[1], o[2] + V[2]],
    ];
    _c.set(color);
    // Two triangles: (0,1,2) and (0,2,3)
    for (const i of [0, 1, 2, 0, 2, 3]) {
      const p = corners[i];
      b.pos.push(p[0], p[1], p[2]);
      b.nrm.push(n[0], n[1], n[2]);
      const uv = uvFn(p[0], p[1], p[2], i);
      b.uv.push(uv[0], uv[1]);
      b.col.push(_c.r, _c.g, _c.b);
    }
  }

  /**
   * Add any flat four-sided face: corners a, b, c, d in order round it, with
   * normal n (the caller makes sure the winding matches).
   */
  addPoly(key, a, b, c, d, n, color, uvFn) {
    const bk = this._bucket(key);
    const corners = [a, b, c, d];
    _c.set(color);
    for (const i of [0, 1, 2, 0, 2, 3]) {
      const p = corners[i];
      bk.pos.push(p[0], p[1], p[2]);
      bk.nrm.push(n[0], n[1], n[2]);
      const uv = uvFn(p[0], p[1], p[2], i);
      bk.uv.push(uv[0], uv[1]);
      bk.col.push(_c.r, _c.g, _c.b);
    }
  }

  /**
   * Add an axis-aligned box.
   * opts:
   *   side   - material key for the four walls (null = skip walls)
   *   top    - material key for the top face (null = skip)
   *   bottom - material key for the bottom face (default: skip, never seen)
   *   color  - tint (multiplied with the texture via vertex colours)
   *   uvScale - [metres per texture repeat horizontally, vertically]
   *   uvOffset - [u, v] shift so neighbouring buildings don't look identical
   */
  addBox(min, max, opts = {}) {
    const { side = 'wall', top = side, bottom = null, color = 0xffffff,
            uvScale = [1, 1], uvOffset = [0, 0], topScale = uvScale } = opts;
    const [x0, y0, z0] = [min.x, min.y, min.z];
    const [x1, y1, z1] = [max.x, max.y, max.z];
    const w = x1 - x0, h = y1 - y0, d = z1 - z0;
    const [su, sv] = uvScale;
    const [ou, ov] = uvOffset;

    if (side) {
      // Each wall: u runs along the wall, v runs up (world Y).
      // +X face
      this.addQuad(side, [x1, y0, z1], [0, 0, -d], [0, h, 0], [1, 0, 0], color,
        (x, y, z) => [(-z) / su + ou, y / sv + ov]);
      // -X face
      this.addQuad(side, [x0, y0, z0], [0, 0, d], [0, h, 0], [-1, 0, 0], color,
        (x, y, z) => [z / su + ou, y / sv + ov]);
      // +Z face
      this.addQuad(side, [x0, y0, z1], [w, 0, 0], [0, h, 0], [0, 0, 1], color,
        (x, y, z) => [x / su + ou, y / sv + ov]);
      // -Z face
      this.addQuad(side, [x1, y0, z0], [-w, 0, 0], [0, h, 0], [0, 0, -1], color,
        (x, y, z) => [(-x) / su + ou, y / sv + ov]);
    }
    if (top) {
      this.addQuad(top, [x0, y1, z1], [w, 0, 0], [0, 0, -d], [0, 1, 0], color,
        (x, y, z) => [x / topScale[0], z / topScale[1]]);
    }
    if (bottom) {
      this.addQuad(bottom, [x0, y0, z0], [w, 0, 0], [0, 0, d], [0, -1, 0], color,
        (x, y, z) => [x / topScale[0], z / topScale[1]]);
    }
  }

  /** Same as addBox but from centre-bottom position and size. */
  addBlock(x, y, z, w, h, d, opts) {
    this.addBox({ x: x - w / 2, y, z: z - d / 2 }, { x: x + w / 2, y: y + h, z: z + d / 2 }, opts);
  }

  /**
   * Turn everything added so far into meshes (one per material key).
   * @param {Object<string, THREE.Material>} materials
   * @returns {THREE.Group}
   */
  build(materials, { castShadow = true, receiveShadow = true } = {}) {
    const group = new THREE.Group();
    for (const [key, b] of this.buckets) {
      const mat = materials[key];
      if (!mat) {
        console.warn(`MeshBatcher: no material named "${key}"`);
        continue;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.nrm, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = `batch:${key}`;
      mesh.castShadow = castShadow;
      mesh.receiveShadow = receiveShadow;
      group.add(mesh);
    }
    this.buckets.clear();
    return group;
  }
}

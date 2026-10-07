// Axis-aligned box (AABB) collision world.
//
// Every solid thing the player can stand on or bump into is stored here as a
// box: { min: {x,y,z}, max: {x,y,z} }. Boxes never rotate, which keeps the
// maths simple and fast - good enough for buildings, AC units, crates, etc.
//
// To stay fast with thousands of boxes (a whole city later on) we use a
// "spatial hash": the ground is split into square cells and each box is
// listed in every cell it touches. A query then only checks boxes in the
// few cells near the player instead of every box in the world.

export class CollisionWorld {
  constructor(cellSize = 12) {
    this.cellSize = cellSize;
    this.boxes = [];
    this.cells = new Map();
    this._stamp = 0; // used to avoid testing the same box twice per query
  }

  _key(ix, iz) {
    // Pack two cell indices into one number (fast Map key).
    return (ix + 32768) * 65536 + (iz + 32768);
  }

  /**
   * Add a solid box. `props` can hold extra info (e.g. { tag: 'roof' }).
   * Returns the stored box so callers can keep a reference.
   */
  addBox(minX, minY, minZ, maxX, maxY, maxZ, props = {}) {
    const box = {
      min: { x: minX, y: minY, z: minZ },
      max: { x: maxX, y: maxY, z: maxZ },
      _stamp: 0,
      ...props,
    };
    this.boxes.push(box);
    const cs = this.cellSize;
    const x0 = Math.floor(minX / cs), x1 = Math.floor(maxX / cs);
    const z0 = Math.floor(minZ / cs), z1 = Math.floor(maxZ / cs);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const k = this._key(ix, iz);
        let list = this.cells.get(k);
        if (!list) this.cells.set(k, (list = []));
        list.push(box);
      }
    }
    return box;
  }

  /** Take a box out again (e.g. to cut a stairwell into a building). */
  removeBox(box) {
    const i = this.boxes.indexOf(box);
    if (i >= 0) this.boxes.splice(i, 1);
    for (const list of this.cells.values()) {
      const k = list.indexOf(box);
      if (k >= 0) list.splice(k, 1);
    }
  }

  /**
   * Move a box that's already in the world (a moving platform: a parade
   * float, a funicular car). Only the grid cells it leaves or enters change.
   */
  moveBox(box, dx, dy, dz) {
    const cs = this.cellSize;
    const ox0 = Math.floor(box.min.x / cs), ox1 = Math.floor(box.max.x / cs);
    const oz0 = Math.floor(box.min.z / cs), oz1 = Math.floor(box.max.z / cs);
    box.min.x += dx; box.max.x += dx;
    box.min.y += dy; box.max.y += dy;
    box.min.z += dz; box.max.z += dz;
    const nx0 = Math.floor(box.min.x / cs), nx1 = Math.floor(box.max.x / cs);
    const nz0 = Math.floor(box.min.z / cs), nz1 = Math.floor(box.max.z / cs);
    if (ox0 === nx0 && ox1 === nx1 && oz0 === nz0 && oz1 === nz1) return;
    for (let ix = ox0; ix <= ox1; ix++) {
      for (let iz = oz0; iz <= oz1; iz++) {
        const list = this.cells.get(this._key(ix, iz));
        const k = list ? list.indexOf(box) : -1;
        if (k >= 0) list.splice(k, 1);
      }
    }
    for (let ix = nx0; ix <= nx1; ix++) {
      for (let iz = nz0; iz <= nz1; iz++) {
        const key = this._key(ix, iz);
        let list = this.cells.get(key);
        if (!list) this.cells.set(key, (list = []));
        list.push(box);
      }
    }
  }

  /** Convenience: add a box from its centre-bottom position and size. */
  addBlock(x, y, z, w, h, d, props) {
    return this.addBox(x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2, props);
  }

  clear() {
    this.boxes.length = 0;
    this.cells.clear();
  }

  /**
   * Find every box overlapping the given region.
   * Results are written into `out` (reused array = no garbage per frame).
   */
  query(minX, minY, minZ, maxX, maxY, maxZ, out = []) {
    out.length = 0;
    const stamp = ++this._stamp;
    const cs = this.cellSize;
    const x0 = Math.floor(minX / cs), x1 = Math.floor(maxX / cs);
    const z0 = Math.floor(minZ / cs), z1 = Math.floor(maxZ / cs);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const list = this.cells.get(this._key(ix, iz));
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const b = list[i];
          if (b._stamp === stamp) continue;
          b._stamp = stamp;
          if (b.disabled) continue;
          // Strict overlap: boxes that only touch faces do NOT count,
          // so standing exactly on a roof isn't reported as "inside" it.
          if (b.min.x < maxX && b.max.x > minX &&
              b.min.y < maxY && b.max.y > minY &&
              b.min.z < maxZ && b.max.z > minZ) {
            out.push(b);
          }
        }
      }
    }
    return out;
  }

  /** True if anything overlaps the region. */
  overlaps(minX, minY, minZ, maxX, maxY, maxZ) {
    return this.query(minX, minY, minZ, maxX, maxY, maxZ, this._tmp || (this._tmp = [])).length > 0;
  }

  /**
   * Cast a ray from `origin` along normalised `dir` up to `maxDist`.
   * Returns the distance to the first box hit, or Infinity.
   * Uses the classic "slab" test for ray-vs-box.
   */
  raycast(origin, dir, maxDist) {
    const ex = origin.x + dir.x * maxDist;
    const ey = origin.y + dir.y * maxDist;
    const ez = origin.z + dir.z * maxDist;
    const hits = this.query(
      Math.min(origin.x, ex), Math.min(origin.y, ey), Math.min(origin.z, ez),
      Math.max(origin.x, ex), Math.max(origin.y, ey), Math.max(origin.z, ez),
      this._rayTmp || (this._rayTmp = []),
    );
    let best = Infinity;
    for (const b of hits) {
      let tMin = 0, tMax = maxDist;
      let miss = false;
      for (const axis of ['x', 'y', 'z']) {
        const o = origin[axis], d = dir[axis];
        if (Math.abs(d) < 1e-9) {
          if (o < b.min[axis] || o > b.max[axis]) { miss = true; break; }
        } else {
          let t1 = (b.min[axis] - o) / d;
          let t2 = (b.max[axis] - o) / d;
          if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
          if (t1 > tMin) tMin = t1;
          if (t2 < tMax) tMax = t2;
          if (tMin > tMax) { miss = true; break; }
        }
      }
      if (!miss && tMin < best) best = tMin;
    }
    return best;
  }

  /** Highest solid surface directly below (x, z) starting from `fromY`. */
  groundHeight(x, z, fromY = 1e6) {
    const hits = this.query(x - 0.01, -1e6, z - 0.01, x + 0.01, fromY, z + 0.01, this._gTmp || (this._gTmp = []));
    let top = -Infinity;
    for (const b of hits) if (b.max.y <= fromY + 0.01 && b.max.y > top) top = b.max.y;
    return top;
  }
}

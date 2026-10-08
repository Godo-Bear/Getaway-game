import * as THREE from 'three';

// Road graph: every intersection is a node, every road segment between two
// neighbouring intersections is an edge. On our grid each node connects to
// up to 4 neighbours (north/south/east/west).
//
// AI drivers use it to plan: "I'm heading to node A; from A, which neighbour
// gets me closest to the player?" That simple greedy choice is enough for
// convincing pursuit on a grid city.

export class RoadGraph {
  /**
   * @param {number} n - number of roads in each direction (nodes = n * n)
   * @param {(k:number)=>number} roadX - x of road k (the roads running along Z)
   * @param {(k:number)=>number} [roadZ] - z of road k (the roads running along X); the same as roadX if not given
   *   (each place's streets have their own block sizes, so the roads aren't evenly spaced)
   */
  constructor(n, roadX, roadZ = roadX) {
    this.n = n;
    this.roadX = roadX;
    this.roadZ = roadZ;
    this.roadC = roadX; // (old name)
    this.nodes = [];
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        this.nodes.push({
          id: i * n + j, i, j,
          x: roadX(i), z: roadZ(j),
          neighbours: [],
          // Offset for traffic light timing so the city doesn't flip all at once
          phaseOffset: ((i + j) % 3) * 1.5,
        });
      }
    }
    for (const node of this.nodes) {
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = node.i + di, nj = node.j + dj;
        if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
        node.neighbours.push(this.nodes[ni * n + nj]);
      }
    }
    this.pitch = (roadX(n - 1) - roadX(0)) / (n - 1); // (the average distance between roads)
  }

  /** Index of the road nearest to v along one axis ('x': the roads at x = roadX(k)). */
  nearestRoad(axis, v) {
    const f = axis === 'x' ? this.roadX : this.roadZ;
    let best = 0, bd = Infinity;
    for (let k = 0; k < this.n; k++) { const d = Math.abs(f(k) - v); if (d < bd) { bd = d; best = k; } }
    return best;
  }

  node(i, j) {
    return this.nodes[i * this.n + j];
  }

  /** Take out the road between two neighbouring junctions (two blocks joined into one). */
  removeEdge(a, b) {
    a.neighbours = a.neighbours.filter((x) => x !== b);
    b.neighbours = b.neighbours.filter((x) => x !== a);
  }

  /** Closest intersection to a world position. */
  nearestNode(x, z) {
    return this.node(this.nearestRoad('x', x), this.nearestRoad('z', z));
  }

  /**
   * Which road (if any) is the point on?
   * Returns { axis: 'x' | 'z' | 'both', along, offset } or null.
   *  - axis 'x' means a road running along the X axis
   *  - offset = distance from the centre line
   */
  roadAt(x, z, halfWidth) {
    const nearZ = this.roadZ(this.nearestRoad('z', z));
    const nearX = this.roadX(this.nearestRoad('x', x));
    const onX = Math.abs(z - nearZ) < halfWidth; // on a road running along X
    const onZ = Math.abs(x - nearX) < halfWidth;
    if (onX && onZ) return { axis: 'both', lineX: nearX, lineZ: nearZ };
    if (onX) return { axis: 'x', lineZ: nearZ, offset: z - nearZ };
    if (onZ) return { axis: 'z', lineX: nearX, offset: x - nearX };
    return null;
  }

  /** Neighbour of `from` that is closest to (tx, tz), never going back to `avoid` if possible. */
  bestNeighbourToward(from, tx, tz, avoid = null) {
    let best = null, bestD = Infinity;
    for (const nb of from.neighbours) {
      if (nb === avoid && from.neighbours.length > 1) continue;
      const d = Math.hypot(nb.x - tx, nb.z - tz);
      if (d < bestD) { bestD = d; best = nb; }
    }
    return best;
  }

  randomNeighbour(from, rng, avoid = null) {
    const opts = from.neighbours.filter((n) => n !== avoid);
    const list = opts.length ? opts : from.neighbours;
    return list[Math.floor(rng() * list.length)];
  }

  /**
   * World position of a lane on the edge a -> b, `t` (0..1) along it.
   * Right-hand traffic: the lane is on the right of the direction of travel.
   */
  lanePoint(a, b, t, laneOffset, out = new THREE.Vector3()) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    const fx = dx / len, fz = dz / len;
    // Right of travel (facing +Z, right is -X): right = (-fz, fx)
    const rx = -fz, rz = fx;
    return out.set(a.x + dx * t + rx * laneOffset, 0, a.z + dz * t + rz * laneOffset);
  }
}

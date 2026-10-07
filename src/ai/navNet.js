// A route map over the whole driving city: the street junctions (the road
// graph) plus the subway (its tunnels and the ramps down to it). The police
// use it when you're on a different level from them (they follow you down
// the ramps), or when they're down in the tunnels themselves.
//
// next(from, goal) gives the next stop on the shortest way from one node to
// another (Dijkstra from the goal, cached for a moment).

const LEVEL = -2.5; // below this you're down in the subway

export const underground = (y) => y < LEVEL;

export class NavNet {
  constructor(city) {
    this.graph = city.graph;
    const nav = city.subway?.nav || { nodes: [], roadLinks: new Map() };
    this.extra = nav.nodes;
    this.roadLinks = nav.roadLinks;
    this.all = [...this.graph.nodes, ...this.extra];
    this._cache = new Map();
    this._cacheT = 0;
  }

  get active() { return this.extra.length > 0; }

  links(n) {
    return n.links || [...n.neighbours, ...(this.roadLinks.get(n) || [])];
  }

  /** The nearest node to a position, on the same level. */
  nearest(pos) {
    if (!underground(pos.y) || !this.extra.length) return this.graph.nearestNode(pos.x, pos.z);
    let best = null, bd = Infinity;
    for (const n of this.extra) {
      const d = Math.hypot(n.x - pos.x, n.z - pos.z) + Math.abs(n.y - pos.y) * 4;
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  /** Shortest distance from every node to `goal`. */
  _dist(goal) {
    if (this._cache.has(goal)) return this._cache.get(goal);
    const dist = new Map([[goal, 0]]);
    const open = [goal];
    while (open.length) {
      let bi = 0;
      for (let k = 1; k < open.length; k++) if (dist.get(open[k]) < dist.get(open[bi])) bi = k;
      const n = open.splice(bi, 1)[0], dn = dist.get(n);
      for (const m of this.links(n)) {
        const d = dn + Math.hypot(m.x - n.x, (m.y || 0) - (n.y || 0), m.z - n.z);
        if (d < (dist.get(m) ?? Infinity)) { if (!dist.has(m)) open.push(m); dist.set(m, d); }
      }
    }
    if (this._cache.size > 24) this._cache.clear();
    this._cache.set(goal, dist);
    return dist;
  }

  /** The next node to drive to, from `from` toward `goal` (null when there). */
  next(from, goal) {
    if (!from || !goal || from === goal) return null;
    const dist = this._dist(goal);
    let best = null, bd = Infinity;
    for (const m of this.links(from)) {
      const d = Math.hypot(m.x - from.x, (m.y || 0) - (from.y || 0), m.z - from.z) + (dist.get(m) ?? Infinity);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }

  /** Forget cached routes (call now and then: the goal moves). */
  tick(dt) {
    this._cacheT += dt;
    if (this._cacheT > 2) { this._cacheT = 0; this._cache.clear(); }
  }
}

import * as THREE from 'three';

// Porto Sereno's trams: old yellow trams that run up and down two of the
// avenues on rails set into the road, under their overhead wires. They don't
// stop for anyone: get out of the way (hit(pos) knocks your car aside).

const TRAM_LEN = 11, TRAM_W = 2.6;

export class Trams {
  /**
   * lines: [{ axis: 'x' | 'z', c, a0, a1 }]: each runs along one avenue
   * (axis = the direction it runs; c = the avenue's centre line).
   */
  constructor(lines, { offset = 1.6 } = {}) {
    this.group = new THREE.Group();
    this.lines = lines;
    this.trams = [];
    const rail = new THREE.MeshLambertMaterial({ color: 0x9aa0a8 });
    const wire = new THREE.MeshBasicMaterial({ color: 0x1a1b20 });
    const pole = new THREE.MeshLambertMaterial({ color: 0x3a3c40 });
    const body = new THREE.MeshLambertMaterial({ color: 0xf2c418 });
    const trim = new THREE.MeshLambertMaterial({ color: 0xf2ece0 });
    const glass = new THREE.MeshBasicMaterial({ color: 0xffe9b0, toneMapped: false });
    const dark = new THREE.MeshLambertMaterial({ color: 0x2a2c30 });
    lines.forEach((L, li) => {
      const len = L.a1 - L.a0, mid = (L.a0 + L.a1) / 2;
      const along = (a, c, y, sa, sy, sc, mat) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(L.axis === 'x' ? sa : sc, sy, L.axis === 'x' ? sc : sa), mat);
        m.position.set(L.axis === 'x' ? a : c, y, L.axis === 'x' ? c : a);
        this.group.add(m);
        return m;
      };
      // The tracks (one each way) and the wires over them
      for (const side of [-1, 1]) {
        const c = L.c + side * offset;
        for (const r of [-0.72, 0.72]) along(mid, c + r, 0.035, len, 0.05, 0.12, rail);
        along(mid, c, 6.2, len, 0.04, 0.04, wire);
      }
      for (let a = L.a0 + 10; a < L.a1; a += 30) {
        for (const side of [-1, 1]) along(a, L.c + side * (offset + 3.6), 3.2, 0.18, 6.4, 0.18, pole);
        along(a, L.c, 6.35, 0.08, 0.08, (offset + 3.6) * 2, pole);
      }
      // Two trams on each line, one each way
      for (const k of [0, 1]) {
        const g = new THREE.Group();
        const b = new THREE.Mesh(new THREE.BoxGeometry(TRAM_W, 2.6, TRAM_LEN), body); b.position.y = 1.65;
        const s = new THREE.Mesh(new THREE.BoxGeometry(TRAM_W + 0.02, 0.5, TRAM_LEN + 0.02), trim); s.position.y = 0.6;
        const w = new THREE.Mesh(new THREE.BoxGeometry(TRAM_W + 0.04, 0.9, TRAM_LEN - 1.6), glass); w.position.y = 2.2;
        const roof = new THREE.Mesh(new THREE.BoxGeometry(TRAM_W - 0.2, 0.25, TRAM_LEN - 0.6), trim); roof.position.y = 3.05;
        const pan = new THREE.Mesh(new THREE.BoxGeometry(0.08, 3.1, 0.08), dark); pan.position.set(0, 4.65, 0); pan.rotation.x = 0.3;
        const front = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 0.05), glass); front.position.set(0, 2.2, TRAM_LEN / 2 + 0.01);
        g.add(b, s, w, roof, pan, front);
        this.group.add(g);
        const dir = k === 0 ? 1 : -1;
        this.trams.push({ L, g, a: L.a0 + 30 + (len - 60) * (k === 0 ? 0.25 + li * 0.2 : 0.7 - li * 0.15), dir, c: L.c + dir * -offset * (L.axis === 'x' ? 1 : -1), wait: 0, speed: 9 });
      }
    });
    for (const t of this.trams) this._place(t);
  }

  _place(t) {
    const L = t.L;
    if (L.axis === 'x') { t.g.position.set(t.a, 0, t.c); t.g.rotation.y = t.dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
    else { t.g.position.set(t.c, 0, t.a); t.g.rotation.y = t.dir > 0 ? 0 : Math.PI; }
  }

  update(dt) {
    for (const t of this.trams) {
      if (t.wait > 0) { t.wait -= dt; continue; }
      t.a += t.dir * t.speed * dt;
      if (t.a > t.L.a1 - 8 || t.a < t.L.a0 + 8) {
        t.a = Math.max(t.L.a0 + 8, Math.min(t.L.a1 - 8, t.a));
        t.dir *= -1;
        t.c = t.L.c + (t.c - t.L.c) * -1; // (back along the other track)
        t.wait = 4;
      }
      this._place(t);
    }
  }

  /** Does a car (at pos, radius r) touch a tram? Which way to push it, and the tram's speed. */
  hit(pos, r = 1.8) {
    if (pos.y > 3 || pos.y < -1) return null;
    for (const t of this.trams) {
      const L = t.L;
      const along = L.axis === 'x' ? pos.x : pos.z, across = L.axis === 'x' ? pos.z : pos.x;
      if (Math.abs(along - t.a) > TRAM_LEN / 2 + r || Math.abs(across - t.c) > TRAM_W / 2 + r) continue;
      const side = Math.sign(across - t.c) || 1;
      return { axis: L.axis, push: t.c + side * (TRAM_W / 2 + r) - across, side, speed: t.wait > 0 ? 0 : t.speed * t.dir };
    }
    return null;
  }
}

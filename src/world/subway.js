import * as THREE from 'three';
import { makeTextTexture, getGlowTexture } from './materials.js';

// The subway: tunnels under two of the city's avenues, crossing at a
// junction, with stations and subway trains. Drive down into it.
//
//  - Entrances: ramps down through city blocks, between the buildings,
//    from the street in front (a "SUBWAY" sign over each). The ramps ease in
//    and out, so going down (or coming back up) is smooth.
//  - The tunnels: a road on one side, the train track on the other. Stations
//    have a platform, pillars and lights. The trains stop at the stations;
//    don't be on the track when one comes.
//  - The police can follow you down: `nav` is a route map through the
//    tunnels, linked to the street junctions in front of each ramp.
//
// Like the rest of the city it's made of "surfaces" (the tunnel floors and
// the ramps). The city's groundHeight(x, z, y) asks heightAt(): a car in a
// tunnel is on the tunnel floor, a car on the street above stays on the
// street, and over a ramp's opening there's no street, only the ramp.

export const FLOOR_Y = -7;   // tunnel floor
const CEIL_Y = -1.2;         // tunnel ceiling (underside)
const TW = 16;               // tunnel width
const WALL = 0.6;
const RW = 11;               // ramp width
const TRACK = 5;             // the track runs this far off the tunnel's centre line
const LANE = -3;             // (the police drive down this side, away from the track)
const STEP = 1.0;
const ST_LEN = 36;           // station length
const ST_DEEP = 6;           // platform depth (past the tunnel wall)

export const ease = (t) => 0.5 * t + 0.5 * t * t * (3 - 2 * t);

/**
 * Where the tunnels and their entrance ramps go, decided before the blocks
 * are built (an entrance block gets buildings either side of its ramp).
 * forced: block keys ('i,j') a story chapter has fixed: never used.
 */
export function planSubway({ n, roadC, road, forced }) {
  const blocks = n - 1;
  if (blocks < 5) return { lines: [], ramps: [], rampBlocks: new Map() };
  const jA = Math.min(n - 3, Math.max(2, n - 4)); // line A: under an east-west road
  const iB = 2;                                   // line B: under a north-south road
  const lines = [
    { id: 'A', axis: 'x', c: roadC(jA), a0: roadC(0) - 2, a1: roadC(n - 1) + 2, k: jA },
    { id: 'B', axis: 'z', c: roadC(iB), a0: roadC(0) - 2, a1: roadC(n - 1) + 2, k: iB },
  ];
  const free = (i, j) => i >= 0 && j >= 0 && i < blocks && j < blocks && !forced.has(`${i},${j}`);
  const blockOf = (i, j) => ({ x0: roadC(i) + road / 2, x1: roadC(i + 1) - road / 2, z0: roadC(j) + road / 2, z1: roadC(j + 1) - road / 2 });
  const ramps = [];
  const taken = new Set();
  const add = (line, i, j, side) => {
    if (!free(i, j) || taken.has(`${i},${j}`)) return false;
    const b = blockOf(i, j), L = line;
    const r = { line: L.id, i, j, side, key: `${i},${j}` };
    if (L.axis === 'x') { // ramp runs north-south
      const cx = (b.x0 + b.x1) / 2;
      Object.assign(r, { axis: 'z', c0: cx - RW / 2, c1: cx + RW / 2, cx });
      if (side < 0) Object.assign(r, { mouth: b.z0, holeEnd: b.z1, to: L.c - TW / 2, out: -1, roadNodes: [[i, j], [i + 1, j]] });
      else Object.assign(r, { mouth: b.z1, holeEnd: b.z0, to: L.c + TW / 2, out: 1, roadNodes: [[i, j + 1], [i + 1, j + 1]] });
    } else { // ramp runs east-west
      const cz = (b.z0 + b.z1) / 2;
      Object.assign(r, { axis: 'x', c0: cz - RW / 2, c1: cz + RW / 2, cx: cz });
      if (side < 0) Object.assign(r, { mouth: b.x0, holeEnd: b.x1, to: L.c - TW / 2, out: -1, roadNodes: [[i, j], [i, j + 1]] });
      else Object.assign(r, { mouth: b.x1, holeEnd: b.x0, to: L.c + TW / 2, out: 1, roadNodes: [[i + 1, j], [i + 1, j + 1]] });
    }
    ramps.push(r);
    taken.add(r.key);
    return true;
  };
  const tryAdd = (line, prefs, mk) => { for (const v of prefs) if (add(line, ...mk(v))) return; };
  const A = lines[0], B = lines[1];
  // Line A: one entrance from the north, two from the south (spread out)
  tryAdd(A, [1, 0, 3], (i) => [i, jA - 1, -1]);
  tryAdd(A, [blocks - 2, blocks - 1, 4], (i) => [i, jA, 1]);
  tryAdd(A, [4, 5, 3], (i) => [i, jA - 1, -1]);
  // Line B: one from the west, two from the east
  tryAdd(B, [1, 0, 3], (j) => [iB - 1, j, -1]);
  tryAdd(B, [blocks - 2, blocks - 1, 4], (j) => [iB, j, 1]);
  tryAdd(B, [3, 4, 2], (j) => [iB, j, 1]);
  const rampBlocks = new Map(ramps.map((r) => [r.key, r]));
  return { lines, ramps, rampBlocks };
}

/** The opening a ramp leaves in the ground (and in the block's pavement). */
export function rampHole(r) {
  const a0 = Math.min(r.mouth, r.holeEnd), a1 = Math.max(r.mouth, r.holeEnd);
  return r.axis === 'z' ? { x0: r.c0 - 0.5, x1: r.c1 + 0.5, z0: a0, z1: a1 } : { x0: a0, x1: a1, z0: r.c0 - 0.5, z1: r.c1 + 0.5 };
}

/**
 * Build the tunnels, stations, ramps and trains (after the blocks).
 */
export function buildSubway({ plan, batch, world, graph, roadC, alpine }) {
  const group = new THREE.Group();
  const surfaces = [];
  const shapes = [];
  const { lines, ramps } = plan;
  if (!lines.length) return emptySubway(group);
  const holes = ramps.map(rampHole);

  // Looks
  const wallC = alpine ? 0x6a6660 : 0x55585e, tileC = alpine ? 0xd8cfc0 : 0xd2d6dc, floorC = 0x6a6a70;
  const lightC = alpine ? 0xffd9a0 : 0xd8f0ff;
  const stationNames = alpine ? ['SKI LIFT', 'OLD TOWN', 'LAKESIDE'] : ['HARBOR SQ', 'MARKET ST', 'CENTRAL'];

  // Helpers: positions along a line (along, across, y) -> world
  const W = (L, a, c, y) => (L.axis === 'x' ? { x: a, y, z: c } : { x: c, y, z: a });
  const box = (L, a0, c0, y0, a1, c1, y1, look, solid = true, tag = 'tunnel') => {
    const p = W(L, Math.min(a0, a1), Math.min(c0, c1), y0), q = W(L, Math.max(a0, a1), Math.max(c0, c1), y1);
    const min = { x: Math.min(p.x, q.x), y: y0, z: Math.min(p.z, q.z) }, max = { x: Math.max(p.x, q.x), y: y1, z: Math.max(p.z, q.z) };
    batch.addBox(min, max, look);
    if (solid) world.addBox(min.x, min.y, min.z, max.x, max.y, max.z, { tag });
  };
  const wallLook = { side: 'concrete', top: null, color: wallC, uvScale: [3, 3] };
  const tileLook = { side: 'concrete', top: 'concrete', color: tileC, uvScale: [1.5, 1.5], topScale: [2, 2] };
  const ceilLook = { side: 'concrete', top: null, bottom: 'plain', color: 0x3a3c40 };
  const glowLook = (c) => ({ side: 'glow', top: 'glow', bottom: 'glow', color: c });

  // Stations: mid-block, away from the ramps and the junction
  const stations = [];
  {
    let name = 0;
    for (const L of lines) {
      const other = lines.find((o) => o !== L);
      const want = L.id === 'A' ? 2 : 1;
      const cands = [];
      for (let k = 0; k < graph.n - 1; k++) cands.push((roadC(k) + roadC(k + 1)) / 2);
      const ok = cands.filter((a) => Math.abs(a - other.c) > 40 && !ramps.some((r) => r.line === L.id && Math.abs(r.cx - a) < ST_LEN / 2 + RW))
        .sort((p, q) => Math.abs(p) - Math.abs(q));
      const picked = [];
      for (const a of ok) { if (picked.length >= want) break; if (picked.every((b) => Math.abs(b - a) > 120)) picked.push(a); }
      for (const a of picked) stations.push({ line: L, at: a, name: stationNames[name++ % stationNames.length] });
    }
  }

  // ---------------------------------------------------------------- the tunnels
  for (const L of lines) {
    const other = lines.find((o) => o !== L);
    const c0 = L.c - TW / 2, c1 = L.c + TW / 2;
    surfaces.push({ kind: 'deck', ...rectOf(L, L.a0, c0, L.a1, c1), y: FLOOR_Y, label: 'the subway' });
    shapes.push({ type: 'tunnel', ...rectOf(L, L.a0, c0, L.a1, c1) });
    // Floor, trackbed and rails, a painted edge line
    box(L, L.a0, c0 - WALL, FLOOR_Y - 0.5, L.a1, c1 + WALL, FLOOR_Y, { side: null, top: 'asphalt', color: floorC, topScale: [8, 8] }, false);
    box(L, L.a0, L.c + TRACK - 2, FLOOR_Y, L.a1, L.c + TRACK + 2, FLOOR_Y + 0.04, { side: null, top: 'concrete', color: 0x4a4440, topScale: [2, 2] }, false);
    for (const r of [-0.75, 0.75]) box(L, L.a0, L.c + TRACK + r - 0.07, FLOOR_Y + 0.04, L.a1, L.c + TRACK + r + 0.07, FLOOR_Y + 0.18, { side: 'plain', top: 'plain', color: 0x9aa0a8 }, false);
    box(L, L.a0, L.c + TRACK - 2.4, FLOOR_Y, L.a1, L.c + TRACK - 2.2, FLOOR_Y + 0.05, glowLook(0xffd040), false);
    // Ceiling, with strip lights
    box(L, L.a0, c0 - WALL, CEIL_Y, L.a1, c1 + WALL, CEIL_Y + 0.5, ceilLook, true, 'ceiling');
    for (let a = L.a0 + 6; a < L.a1 - 2; a += 12) {
      for (const off of [-4, 3]) box(L, a - 1.5, L.c + off - 0.2, CEIL_Y - 0.12, a + 1.5, L.c + off + 0.2, CEIL_Y, glowLook(lightC), false);
    }
    // Walls (open where a ramp comes in, where the other line crosses and at the stations)
    for (const [side, cw] of [[-1, c0], [1, c1]]) {
      const gaps = [[other.c - TW / 2, other.c + TW / 2]];
      for (const r of ramps) if (r.line === L.id && r.side === side) gaps.push([r.c0, r.c1]);
      for (const st of stations) if (st.line === L && side > 0) gaps.push([st.at - ST_LEN / 2, st.at + ST_LEN / 2]);
      gaps.sort((p, q) => p[0] - q[0]);
      let s = L.a0;
      for (const [g0, g1] of [...gaps, [L.a1, L.a1]]) {
        if (g0 > s) {
          const w0 = side < 0 ? cw - WALL : cw, w1 = w0 + WALL;
          box(L, s, w0, FLOOR_Y, g0, w1, CEIL_Y, wallLook);
          // a band of light along the wall
          const lc = side < 0 ? cw + 0.02 : cw - 0.02;
          box(L, s, Math.min(lc, lc - side * 0.06), FLOOR_Y + 2.6, g0, Math.max(lc, lc - side * 0.06), FLOOR_Y + 2.75, glowLook(alpine ? 0xffb060 : 0x39a8ff), false);
        }
        s = Math.max(s, g1);
      }
    }
    // The ends (buffer stops)
    for (const a of [L.a0, L.a1]) {
      const d = a === L.a0 ? -1 : 1;
      box(L, a, c0 - WALL, FLOOR_Y, a + d * WALL, c1 + WALL, CEIL_Y, wallLook);
      box(L, a - d * 1.5, L.c + TRACK - 1.6, FLOOR_Y, a, L.c + TRACK + 1.6, FLOOR_Y + 1.2, { side: 'plain', top: 'plain', color: 0xc02020 });
    }
  }

  // ---------------------------------------------------------------- stations
  for (const st of stations) {
    const L = st.line, a0 = st.at - ST_LEN / 2, a1 = st.at + ST_LEN / 2, cw = L.c + TW / 2, back = cw + ST_DEEP;
    box(L, a0, cw, FLOOR_Y, a1, back, FLOOR_Y + 1.0, tileLook, true, 'platform');                       // the platform
    box(L, a0, cw, FLOOR_Y + 1.0, a1, cw + 0.3, FLOOR_Y + 1.03, glowLook(0xffd040), false);               // its yellow edge
    box(L, a0, back, FLOOR_Y, a1, back + WALL, CEIL_Y, tileLook);                                      // back wall (tiled)
    for (const a of [a0 - WALL, a1]) box(L, a, cw, FLOOR_Y, a + WALL, back + WALL, CEIL_Y, tileLook);   // end walls
    box(L, a0 - WALL, cw, CEIL_Y, a1 + WALL, back + WALL, CEIL_Y + 0.5, ceilLook, true, 'ceiling');
    for (let a = a0 + 3; a < a1 - 1; a += 6) {
      box(L, a - 0.35, cw + 2.6, FLOOR_Y + 1, a + 0.35, cw + 3.3, CEIL_Y, { side: 'concrete', top: null, color: 0x8a8e96 }); // pillars
      box(L, a - 1.4, cw + 2.75, CEIL_Y - 0.12, a + 1.4, cw + 3.15, CEIL_Y, glowLook(lightC), false);
      box(L, a + 1.2, back - 0.6, FLOOR_Y + 1, a + 2.8, back - 0.1, FLOOR_Y + 1.5, { side: 'plain', top: 'plain', color: 0x7a4a2a }, false); // benches
    }
    // Name signs on the back wall
    for (const a of [a0 + 8, a1 - 8]) {
      const tex = makeTextTexture(st.name, { color: '#ffffff', bg: alpine ? '#7a3a1a' : '#1a3a8a', width: 512, height: 96, font: 'bold 60px Arial, sans-serif' });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.1), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      const p = W(L, a, back - 0.02, FLOOR_Y + 3.4);
      m.position.set(p.x, p.y, p.z);
      m.rotation.y = L.axis === 'x' ? Math.PI : -Math.PI / 2;
      group.add(m);
    }
    shapes.push({ type: 'station', ...rectOf(L, a0, cw, a1, back), name: st.name });
  }

  // ---------------------------------------------------------------- entrance ramps
  for (const r of ramps) {
    const L = lines.find((l) => l.id === r.line);
    const len = r.to - r.mouth, t = (a) => Math.min(1, Math.max(0, (a - r.mouth) / len));
    const yAt = (a) => FLOOR_Y * ease(t(a));
    const P = (a, c, y) => (r.axis === 'x' ? [a, y, c] : [c, y, a]);
    const lo = Math.min(r.mouth, r.to), hi = Math.max(r.mouth, r.to);
    surfaces.push({ kind: 'ramp', ...(r.axis === 'z' ? { x0: r.c0, x1: r.c1, z0: lo, z1: hi } : { x0: lo, x1: hi, z0: r.c0, z1: r.c1 }), axis: r.axis, mouth: r.mouth, to: r.to, label: 'Subway ramp' });
    shapes.push({ type: 'subwayRamp', ...(r.axis === 'z' ? { x0: r.c0, x1: r.c1, z0: lo, z1: hi } : { x0: lo, x1: hi, z0: r.c0, z1: r.c1 }) });
    const segs = Math.ceil(Math.abs(len) / 2);
    const sideUV = r.axis === 'x' ? (x, y) => [x / 3, y / 3] : (x, y, z) => [z / 3, y / 3];
    for (let k = 0; k < segs; k++) {
      const sa = r.mouth + (len * k) / segs, sb = r.mouth + (len * (k + 1)) / segs;
      const ya = yAt(sa), yb = yAt(sb);
      const open = r.out < 0 ? (sb <= r.holeEnd + 0.01 && sa <= r.holeEnd) : (sb >= r.holeEnd - 0.01 && sa >= r.holeEnd);
      const top = open ? 0 : CEIL_Y; // (open to the sky in the block; under the street after that)
      // Road surface
      quadTo(batch, 'asphalt', [P(sa, r.c0, ya), P(sb, r.c0, yb), P(sb, r.c1, yb), P(sa, r.c1, ya)], [0, 1, 0], floorC, (x, y, z) => [x / 8, z / 8]);
      // Retaining walls up to the street (or the tunnel ceiling)
      for (const [c, nrm] of [[r.c0, 1], [r.c1, -1]]) {
        const n3 = r.axis === 'x' ? [0, 0, nrm] : [nrm, 0, 0];
        quadTo(batch, 'concrete', [P(sa, c, ya), P(sb, c, yb), P(sb, c, top), P(sa, c, top)], n3, wallC, sideUV);
        // a light strip along each wall
        quadTo(batch, 'glow', [P(sa, c + nrm * 0.03, ya + 2.4), P(sb, c + nrm * 0.03, yb + 2.4), P(sb, c + nrm * 0.03, yb + 2.55), P(sa, c + nrm * 0.03, ya + 2.55)], n3, alpine ? 0xffb060 : 0x39a8ff, () => [0, 0]);
        // solid: you can't drive out of the side, or fall in from the street
        const w0 = nrm > 0 ? c - 0.5 : c, w1 = w0 + 0.5;
        const a0 = Math.min(sa, sb), a1 = Math.max(sa, sb), yLo = Math.min(ya, yb) - 0.5, yHi = open ? 0.9 : CEIL_Y;
        if (r.axis === 'z') world.addBox(w0, yLo, a0, w1, yHi, a1, { tag: 'ramp' }); else world.addBox(a0, yLo, w0, a1, yHi, w1, { tag: 'ramp' });
        if (open) { // a low kerb wall round the opening, at street level
          if (r.axis === 'z') batch.addBox({ x: w0, y: 0, z: a0 }, { x: w1, y: 0.9, z: a1 }, { side: 'concrete', top: 'concrete', color: 0xa8a49c });
          else batch.addBox({ x: a0, y: 0, z: w0 }, { x: a1, y: 0.9, z: w1 }, { side: 'concrete', top: 'concrete', color: 0xa8a49c });
        }
      }
      if (!open) { // the ceiling over the covered part
        const a0 = Math.min(sa, sb), a1 = Math.max(sa, sb);
        if (r.axis === 'z') batch.addBox({ x: r.c0 - 0.5, y: CEIL_Y, z: a0 }, { x: r.c1 + 0.5, y: CEIL_Y + 0.5, z: a1 }, ceilLook);
        else batch.addBox({ x: a0, y: CEIL_Y, z: r.c0 - 0.5 }, { x: a1, y: CEIL_Y + 0.5, z: r.c1 + 0.5 }, ceilLook);
      }
    }
    // The portal: where the ramp goes under the street (a header over it, with a barrier on top)
    {
      const yh = yAt(r.holeEnd), d = -r.out * 0.6;
      const a0 = Math.min(r.holeEnd, r.holeEnd + d), a1 = Math.max(r.holeEnd, r.holeEnd + d);
      const hb = { side: 'concrete', top: 'concrete', color: 0xa8a49c, uvScale: [3, 3] };
      const yb = Math.min(-0.2, yh + 4.6);
      if (r.axis === 'z') { batch.addBox({ x: r.c0, y: yb, z: a0 }, { x: r.c1, y: 0.9, z: a1 }, hb); world.addBox(r.c0, yb, a0, r.c1, 0.9, a1, { tag: 'ramp' }); }
      else { batch.addBox({ x: a0, y: yb, z: r.c0 }, { x: a1, y: 0.9, z: r.c1 }, hb); world.addBox(a0, yb, r.c0, a1, 0.9, r.c1, { tag: 'ramp' }); }
      const tex = makeTextTexture('SUBWAY', { color: '#ffffff', bg: '#1a3a8a', width: 512, height: 96, font: 'bold 64px Arial, sans-serif' });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(RW - 2, 1.4), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      const p = r.axis === 'z' ? [r.cx, yb + 1.2, r.holeEnd + r.out * 0.02] : [r.holeEnd + r.out * 0.02, yb + 1.2, r.cx];
      m.position.set(...p);
      m.rotation.y = r.axis === 'z' ? (r.out > 0 ? 0 : Math.PI) : (r.out > 0 ? Math.PI / 2 : -Math.PI / 2);
      group.add(m);
    }
    // A sign over the entrance, at the street
    {
      const z = r.mouth + r.out * 0.4, h = 5.2;
      const post = { side: 'plain', top: 'plain', color: 0x2a2c30 };
      for (const c of [r.c0 - 0.6, r.c1 + 0.6]) {
        const [x, , zz] = P(z, c, 0);
        batch.addBox({ x: x - 0.15, y: 0, z: zz - 0.15 }, { x: x + 0.15, y: h + 1.3, z: zz + 0.15 }, post);
        world.addBox(x - 0.15, 0, zz - 0.15, x + 0.15, h + 1.3, zz + 0.15, { tag: 'post' });
      }
      const tex = makeTextTexture('▼ SUBWAY', { color: '#ffffff', bg: '#1a3a8a', width: 512, height: 96, font: 'bold 60px Arial, sans-serif' });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(RW - 1, 1.5), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      const [x, , zz] = P(z + r.out * 0.12, r.cx, 0);
      m.position.set(x, h + 0.6, zz);
      m.rotation.y = r.axis === 'z' ? (r.out > 0 ? 0 : Math.PI) : (r.out > 0 ? Math.PI / 2 : -Math.PI / 2);
      group.add(m);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0x3d7bff, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0.5 }));
      glow.position.set(x, h + 0.6, zz);
      glow.scale.set(RW + 3, 4, 1);
      group.add(glow);
    }
  }

  // ---------------------------------------------------------------- trains
  const trains = lines.map((L) => new SubwayTrain(L, stations.filter((s) => s.line === L).map((s) => s.at), alpine));
  for (const t of trains) group.add(t.group);

  // ---------------------------------------------------------------- the police route map
  const nodes = [];
  const roadLinks = new Map();
  const N = (x, y, z) => { const o = { x, y, z, links: [], elevated: true }; nodes.push(o); return o; };
  const link = (a, b) => { if (a && b && a !== b && !a.links.includes(b)) { a.links.push(b); b.links.push(a); } };
  const linkRoad = (a, rn) => { if (!rn) return; a.links.push(rn); if (!roadLinks.has(rn)) roadLinks.set(rn, []); roadLinks.get(rn).push(a); };
  const A = lines[0], B = lines[1];
  const J = N(B.c + LANE, FLOOR_Y, A.c + LANE); // (the junction)
  const lineNodes = new Map(lines.map((L) => [L, [J]]));
  for (const L of lines) {
    const at = (a) => (L.axis === 'x' ? N(a, FLOOR_Y, L.c + LANE) : N(L.c + LANE, FLOOR_Y, a));
    lineNodes.get(L).push(at(L.a0 + 8), at(L.a1 - 8));
  }
  for (const r of ramps) {
    const L = lines.find((l) => l.id === r.line);
    const T = L.axis === 'x' ? N(r.cx, FLOOR_Y, L.c + LANE) : N(L.c + LANE, FLOOR_Y, r.cx);
    lineNodes.get(L).push(T);
    const rn = r.roadNodes.map(([i, j]) => graph.node(i, j));
    const roadLine = r.axis === 'z' ? rn[0].z : rn[0].x; // (the street in front of the mouth)
    const Bn = r.axis === 'z' ? N(r.cx, 0, roadLine - r.out * 3) : N(roadLine - r.out * 3, 0, r.cx);
    const Mn = r.axis === 'z' ? N(r.cx, -0.3, r.mouth - r.out * 4) : N(r.mouth - r.out * 4, -0.3, r.cx);
    for (const x of rn) linkRoad(Bn, x);
    link(Bn, Mn); link(Mn, T);
  }
  for (const L of lines) {
    const key = L.axis === 'x' ? 'x' : 'z';
    const list = lineNodes.get(L).sort((p, q) => p[key] - q[key]);
    for (let k = 1; k < list.length; k++) link(list[k - 1], list[k]);
  }

  // ---------------------------------------------------------------- queries
  const inHole = (x, z) => holes.some((h) => x > h.x0 && x < h.x1 && z > h.z0 && z < h.z1);
  /** Height of the subway surface at (x, z) a car at height y is on, or -Infinity. */
  function heightAt(x, z, y) {
    let best = -Infinity;
    for (const s of surfaces) {
      if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) continue;
      let h;
      if (s.kind === 'deck') h = s.y;
      else {
        const a = s.axis === 'x' ? x : z;
        h = FLOOR_Y * ease(Math.min(1, Math.max(0, (a - s.mouth) / (s.to - s.mouth))));
      }
      if (h <= y + STEP && h > best) best = h;
    }
    return best;
  }
  const onSurface = (x, z, y) => (y < -0.5 ? surfaces.find((s) => x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1) || null : null);
  /** Does a car (pos, radius r) touch a train? */
  const hit = (pos, rad = 1.8) => { for (const t of trains) { const h = t.hit(pos, rad); if (h) return h; } return null; };

  return {
    group, surfaces, shapes, holes, stations, trains, ramps, lines,
    heightAt, inHole, onSurface, hit,
    isUnder: (y) => y < -2.5,
    update: (dt) => { for (const t of trains) t.update(dt); },
    nav: { nodes, roadLinks },
  };
}

function emptySubway(group) {
  return {
    group, surfaces: [], shapes: [], holes: [], stations: [], trains: [], ramps: [], lines: [],
    heightAt: () => -Infinity, inHole: () => false, onSurface: () => null, hit: () => null,
    isUnder: () => false, update() {}, nav: { nodes: [], roadLinks: new Map() },
  };
}

const rectOf = (L, a0, c0, a1, c1) => (L.axis === 'x'
  ? { x0: Math.min(a0, a1), x1: Math.max(a0, a1), z0: Math.min(c0, c1), z1: Math.max(c0, c1) }
  : { x0: Math.min(c0, c1), x1: Math.max(c0, c1), z0: Math.min(a0, a1), z1: Math.max(a0, a1) });

// ----------------------------------------------------------------------
// A three-car subway train running up and down a line, stopping at the
// stations. hit(pos) says if a car touches it (and which way to push it).
// ----------------------------------------------------------------------
class SubwayTrain {
  constructor(L, stops, alpine) {
    this.L = L;
    this.min = L.a0 + 24;
    this.max = L.a1 - 24;
    this.stops = stops;
    this.a = (this.min + this.max) / 2 + (L.id === 'A' ? 60 : -40);
    this.dir = L.id === 'A' ? 1 : -1;
    this.wait = 0;
    this.speed = 16;
    this.lastStop = null;
    this.group = new THREE.Group();
    this.inner = new THREE.Group();
    this.group.add(this.inner);
    const body = new THREE.MeshLambertMaterial({ color: alpine ? 0xc84a3a : 0xc8ccd2 });
    const stripe = new THREE.MeshLambertMaterial({ color: alpine ? 0xf2e6c8 : 0x2a5ad8 });
    const glow = new THREE.MeshBasicMaterial({ color: 0xfff0c0, toneMapped: false });
    const head = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    for (let i = 0; i < 3; i++) {
      const x = -i * 14.6;
      const car = new THREE.Mesh(new THREE.BoxGeometry(14, 3.1, 3), body); car.position.set(x, 1.85, 0);
      const st = new THREE.Mesh(new THREE.BoxGeometry(14.02, 0.35, 3.04), stripe); st.position.set(x, 1.1, 0);
      const win = new THREE.Mesh(new THREE.BoxGeometry(12, 0.9, 3.06), glow); win.position.set(x, 2.3, 0);
      this.inner.add(car, st, win);
    }
    for (const s of [-0.9, 0.9]) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.5), head);
      h.position.set(7.02, 1.2, s);
      this.inner.add(h);
      const t = h.clone(); t.position.x = -29.2 - 7.02; this.inner.add(t);
    }
    this.group.position.y = FLOOR_Y + 0.2;
    this._place();
  }

  _place() {
    const L = this.L, across = L.c + TRACK;
    if (L.axis === 'x') { this.group.position.x = this.a; this.group.position.z = across; this.group.rotation.y = this.dir > 0 ? 0 : Math.PI; }
    else { this.group.position.x = across; this.group.position.z = this.a; this.group.rotation.y = this.dir > 0 ? -Math.PI / 2 : Math.PI / 2; }
  }

  update(dt) {
    if (this.wait > 0) { this.wait -= dt; return; }
    const prev = this.a;
    this.a += this.dir * this.speed * dt;
    // Stop at a station (the middle of the train at the middle of the platform)
    for (const s of this.stops) {
      const mid = s + this.dir * 14.6; // (the train's middle is one car back from its nose)
      if (this.lastStop !== s && (prev - mid) * (this.a - mid) <= 0) { this.a = mid; this.wait = 5; this.lastStop = s; break; }
    }
    if (this.a > this.max || this.a < this.min) {
      this.a = Math.max(this.min, Math.min(this.max, this.a));
      this.dir *= -1;
      this.wait = 3;
      this.lastStop = null;
    }
    this._place();
  }

  hit(pos, r = 1.8) {
    if (pos.y > FLOOR_Y + 3.5 || pos.y < FLOOR_Y - 1) return null;
    const L = this.L;
    const along = L.axis === 'x' ? pos.x : pos.z, across = L.axis === 'x' ? pos.z : pos.x;
    const lo = this.dir > 0 ? this.a - 36.2 : this.a - 7, hi = this.dir > 0 ? this.a + 7 : this.a + 36.2;
    const c = L.c + TRACK;
    if (along < lo - r || along > hi + r || Math.abs(across - c) > 1.5 + r) return null;
    const side = Math.sign(across - c) || -1;
    return { axis: L.axis, push: c + side * (1.5 + r) - across, side, speed: this.wait > 0 ? 0 : this.speed * this.dir };
  }
}

/** One flat four-sided face (corners in order round it), facing `want`. */
function quadTo(batch, key, [A, B, Cc, D], want, color, uv) {
  let nrm = cross(sub(B, A), sub(D, A));
  if (dot(nrm, want) < 0) { nrm = nrm.map((v) => -v); batch.addPoly(key, A, D, Cc, B, norm(nrm), color, uv); return; }
  batch.addPoly(key, A, B, Cc, D, norm(nrm), color, uv);
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

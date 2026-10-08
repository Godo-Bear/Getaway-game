import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Shop fronts with real-looking rooms behind the glass.
//
// The windows use "interior mapping": there is no room really there, the
// shader follows your line of sight through the glass into an imaginary box
// (floor, ceiling, side walls, back wall) and draws what you'd hit, so the
// room shifts in perspective as you walk or drive past. Each shop is one of
// a few kinds (picked by its seed):
//
//   0 grocery      aisles of shelves full of packets, fridges at the back
//   1 clothes      rails of clothes down the sides, a mirror at the back
//   2 cafe         a counter, a menu board, pendant lights, warm wood
//   3 electronics  a wall of glowing screens, a white counter
//   4 bar / pawn   dim, a neon strip, bottles (or trinkets) on the shelves
//
// Around the glass: a stall riser, mullions, a door, a lit fascia band and
// (most shops) a striped awning. Everything is merged into three meshes for
// the whole city (frames, glow strips, windows), so it's cheap on phones.

const ROOM_D = 5.5;      // how deep the rooms look
const SILL = 0.45;       // the stall riser under the glass
const GLASS_H = 2.45;    // window height
const FASCIA = 0.75;     // the sign band above the glass

const VERT = /* glsl */`
attribute vec3 aT;      // along the window (room x)
attribute vec2 aLocal;  // this point in room coordinates (x along, y up from the floor)
attribute vec4 aRoom;   // room width, room height, depth, seed
varying vec3 vWorld;
varying vec3 vT;
varying vec3 vN;
varying vec2 vLocal;
varying vec4 vRoom;
#include <common>
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vT = aT;
  vN = normalize(mat3(modelMatrix) * normal);
  vLocal = aLocal;
  vRoom = aRoom;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */`
uniform float uDay;
uniform float uAlpine;
uniform float uLights;
varying vec3 vWorld;
varying vec3 vT;
varying vec3 vN;
varying vec2 vLocal;
varying vec4 vRoom;
#include <common>
#include <fog_pars_fragment>

float h1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 pal(float k) { // bright packaging / clothes colours
  return 0.5 + 0.45 * cos(6.2831 * (k + vec3(0.0, 0.33, 0.67)));
}

// Products on a shelf unit: boards every 0.5 m with packets between them
vec3 shelfFace(vec2 q, float seed, float kind) {
  float row = floor(q.y / 0.5);
  float fy = fract(q.y / 0.5);
  if (fy < 0.09) return vec3(0.25, 0.24, 0.23);                          // the board
  float w = kind > 3.5 ? 0.12 : 0.22;
  float cell = floor(q.x / w);
  float r = h1(vec2(cell, row + seed * 31.0));
  float fx = fract(q.x / w);
  if (r < 0.12 || fx < 0.08) return vec3(0.12, 0.12, 0.13);             // a gap
  float tall = 0.45 + r * 0.5;
  if (fy > tall) return vec3(0.13, 0.13, 0.15);                           // above the packet
  vec3 c = pal(r * 3.7 + seed);
  if (kind > 3.5) c = mix(vec3(0.35, 0.22, 0.1), vec3(0.2, 0.45, 0.25), step(0.5, r)) * 1.3; // bottles
  return c * (0.75 + 0.25 * fy);
}

void main() {
  float W = vRoom.x, H = vRoom.y, D = vRoom.z, seed = vRoom.w;
  float kind = floor(seed * 5.0);
  vec3 rdW = normalize(vWorld - cameraPosition);
  vec3 r = vec3(dot(rdW, vT), rdW.y, -dot(rdW, vN));   // into the room = +z
  r.z = max(r.z, 0.02);
  vec3 p = vec3(vLocal, 0.0);
  vec3 inv = 1.0 / r;
  float tx = r.x > 0.0 ? (W - p.x) * inv.x : -p.x * inv.x;
  float ty = r.y > 0.0 ? (H - p.y) * inv.y : -p.y * inv.y;
  if (abs(r.x) < 1e-4) tx = 1e4;
  if (abs(r.y) < 1e-4) ty = 1e4;
  float tz = (D - p.z) * inv.z;
  float t = min(min(tx, ty), tz);
  vec3 hp = p + r * t;

  // The room's colours (from its seed)
  vec3 wallC = mix(vec3(0.62, 0.58, 0.52), pal(seed * 2.1) * 0.7 + 0.1, 0.45);
  vec3 floorC = kind == 2.0 || kind == 4.0 || uAlpine > 0.5 ? vec3(0.42, 0.28, 0.17) : vec3(0.55, 0.55, 0.57);
  vec3 col;
  if (t == tz) {
    // The back wall
    col = wallC;
    if (kind == 0.0) { // fridges with lit glass doors
      float fx = fract(hp.x / 1.1);
      col = hp.y < 2.1 ? (fx < 0.05 ? vec3(0.6) : vec3(0.75, 0.9, 1.0) * 0.9 + shelfFace(hp.xy * vec2(1.0, 1.2), seed + 3.0, 0.0) * 0.25) : wallC;
    } else if (kind == 1.0) { // a big mirror
      bool mir = abs(hp.x - W * 0.5) < W * 0.22 && hp.y > 0.3 && hp.y < 2.3;
      col = mir ? vec3(0.24, 0.3, 0.36) + 0.12 * fract((hp.x + hp.y) * 0.7) : wallC;
    } else if (kind == 2.0) { // a menu board and a coffee machine shelf
      bool board = abs(hp.x - W * 0.55) < 1.1 && hp.y > 1.9 && hp.y < 2.7;
      col = board ? vec3(0.08, 0.1, 0.09) + step(0.6, fract(hp.y * 9.0)) * step(0.3, h1(floor(hp.xy * vec2(3.0, 9.0)))) * 0.55 : wallC * vec3(1.0, 0.92, 0.82);
    } else if (kind == 3.0) { // a wall of screens
      vec2 g = vec2(hp.x / 1.0, (hp.y - 0.9) / 0.65);
      vec2 f = fract(g);
      bool scr = hp.y > 0.9 && hp.y < 2.6 && f.x > 0.08 && f.x < 0.92 && f.y > 0.1 && f.y < 0.9;
      col = scr ? pal(h1(floor(g)) + seed) * 1.4 + 0.2 : vec3(0.12, 0.13, 0.15);
    } else { // shelves of bottles / trinkets
      col = hp.y > 0.9 && hp.y < 2.6 ? shelfFace(hp.xy, seed, 4.0) : vec3(0.18, 0.12, 0.09);
      if (abs(hp.y - 2.75) < 0.05) col = pal(seed) * 2.0;           // neon strip
    }
  } else if (t == ty) {
    if (r.y < 0.0) { // the floor (tiles or boards)
      vec2 f = hp.xz / (kind == 2.0 || kind == 4.0 || uAlpine > 0.5 ? vec2(0.2, 1.2) : vec2(0.6));
      float k = mod(floor(f.x) + floor(f.y), 2.0);
      col = floorC * (0.85 + 0.15 * k);
    } else { // the ceiling, with light panels
      vec2 f = fract(hp.xz / vec2(1.8, 1.6));
      col = (abs(f.x - 0.5) < 0.22 && abs(f.y - 0.5) < 0.12) ? vec3(1.3, 1.22, 1.05) : vec3(0.58, 0.56, 0.53);
    }
  } else {
    // The side walls
    col = wallC * 0.85;
    if (kind == 0.0 || kind == 4.0) col = hp.y < 2.2 ? shelfFace(vec2(hp.z, hp.y), seed + 1.0, kind) : col;
  }

  // Things standing in the room: shelf aisles, clothes rails, a counter
  if (kind == 0.0) {
    for (int i = 1; i < 4; i++) {
      float xs = W * float(i) / 4.0;
      float ta = (xs - p.x) * inv.x;
      if (ta > 0.0 && ta < t) {
        vec3 q = p + r * ta;
        if (q.z > 1.2 && q.z < D - 1.0 && q.y < 1.7) { col = shelfFace(vec2(q.z, q.y), seed + float(i), 0.0); t = ta; }
      }
    }
  } else if (kind == 1.0) {
    for (int i = 0; i < 2; i++) {
      float xs = i == 0 ? 0.7 : W - 0.7;
      float ta = (xs - p.x) * inv.x;
      if (ta > 0.0 && ta < t) {
        vec3 q = p + r * ta;
        if (q.z > 0.8 && q.z < D - 0.6 && q.y > 0.5 && q.y < 1.75) {
          float c = floor(q.z / 0.16);
          col = q.y > 1.68 ? vec3(0.7) : pal(h1(vec2(c, seed)) * 0.6 + seed) * (0.7 + 0.3 * fract(q.z / 0.16));
          t = ta;
        }
      }
    }
  }
  if (kind >= 2.0) {
    // A counter across part of the room
    float zc = D * 0.55;
    float tc = (zc - p.z) * inv.z;
    if (tc < t) {
      vec3 q = p + r * tc;
      if (q.y < 1.05 && q.x > W * 0.25 && q.x < W * 0.9) {
        col = kind == 3.0 ? vec3(0.85, 0.86, 0.88) : vec3(0.38, 0.24, 0.14) * (q.y > 0.95 ? 1.6 : 1.0);
        t = tc;
      }
    }
  }

  // Someone working behind the counter (or browsing)
  {
    float zf = kind >= 2.0 ? D * 0.72 : D * 0.5;
    float xf = W * (0.35 + 0.4 * h1(vec2(seed, 7.0)));
    float tf = (zf - p.z) * inv.z;
    if (tf < t) {
      vec3 q = p + r * tf;
      vec2 b = abs(vec2(q.x - xf, q.y - 0.95)) - vec2(0.2, 0.55);
      float body = length(max(b, 0.0)) - 0.08;
      float head = length(vec2(q.x - xf, q.y - 1.68)) - 0.13;
      if (min(body, head) < 0.0) {
        col = head < 0.0 ? vec3(0.78, 0.58, 0.45) * (0.7 + 0.3 * h1(vec2(seed, 3.0))) : pal(seed * 7.0 + 0.3) * 0.6;
        t = tf;
      }
    }
  }
  // Softer corners (a little shade where the walls meet)
  float edge = min(min(hp.x, W - hp.x), min(hp.y, H - hp.y));
  if (t >= tz - 0.001 || t == ty) col *= mix(0.65, 1.0, smoothstep(0.0, 0.9, edge));

  // Light: brighter near the window and under the ceiling lights, darker at the back
  float depth = clamp(t * r.z / D, 0.0, 1.0);
  vec3 lightC = kind == 4.0 ? vec3(1.0, 0.7, 0.45) : uAlpine > 0.5 || kind == 2.0 ? vec3(1.15, 0.95, 0.7) : vec3(1.05, 1.02, 0.95);
  float bright = kind == 4.0 ? 0.55 : 0.82;
  col *= lightC * bright * uLights * mix(1.05, 0.55, depth);

  // The glass: a little sky reflection, more at a glancing angle
  float fres = 0.06 + 0.5 * pow(1.0 - r.z, 3.0);
  vec3 sky = mix(vec3(0.06, 0.08, 0.14), vec3(0.62, 0.72, 0.85), uDay);
  col = mix(col, sky, fres);
  // Daylight on the glass washes the inside out a little
  col = mix(col, col * 0.75 + sky * 0.12, uDay * 0.5);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

let sharedMat = null;
/** The interior material (shared; uDay is updated by setShopDaylight). */
export function interiorMaterial() {
  if (sharedMat) return sharedMat;
  sharedMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uDay: { value: 0.5 }, uAlpine: { value: 0 }, uLights: { value: 1 } }]),
    vertexShader: VERT,
    fragmentShader: FRAG,
    fog: true,
  });
  return sharedMat;
}

/** 0 at night, 1 in daylight: dims the glass reflections at night. */
export function setShopDaylight(day) {
  if (sharedMat) sharedMat.uniforms.uDay.value = day;
}

/** The lights inside the shops: 1 = on, near 0 = a power cut (Chapter 20's blackout). */
export function setShopLights(k) {
  if (sharedMat) sharedMat.uniforms.uLights.value = k;
}

const STRIPES = [[0xc8302a, 0xf2ece0], [0x1f6a3a, 0xf2ece0], [0x2a4a9a, 0xf2ece0], [0xd89a1a, 0x3a2a1a], [0x7a2a6a, 0xf0e0f0], [0x1a7a8a, 0xf2ece0]];
const GLOWS = [0xffa040, 0xff4fa0, 0x40d0ff, 0x60ff90, 0xffe070, 0xff6a3a];

/**
 * Collects shop fronts, then builds them into a few meshes.
 *   const shops = new Shopfronts({ alpine });
 *   shops.add({ x, z, nx, nz, width, base, seed });  // (x, z) = middle of the shop on the wall
 *   group.add(shops.build());
 */
export class Shopfronts {
  constructor({ alpine = false } = {}) {
    this.alpine = alpine;
    this.frames = [];   // vertex-coloured geometries (lit normally)
    this.glows = [];    // vertex-coloured geometries (unlit, glowing)
    this.windows = [];  // interior-mapped quads
    this.spots = [];    // where the shops are ({ x, z, nx, nz, width, seed })
  }

  /**
   * @param {object} o
   * @param {number} o.x @param {number} o.z - the middle of the shop front, on the wall
   * @param {number} o.nx @param {number} o.nz - the wall's outward normal (axis aligned)
   * @param {number} o.width - along the wall
   * @param {number} [o.base] - the pavement height
   * @param {number} o.seed - 0..1, picks the kind of shop and its colours
   * @param {boolean} [o.awning]
   */
  add({ x, z, nx, nz, width, base = 0.15, seed, awning = true }) {
    this.spots.push({ x, z, nx, nz, width, seed });
    const tx = -nz, tz = nx; // along the wall (left to right, looking at it)
    const out = 0.06;        // the front stands a little proud of the wall
    const W = width;
    const frameC = this.alpine ? 0x5a3e28 : [0x1a1c20, 0x2a3a2a, 0x3a2418, 0x202a3a, 0x18181a][Math.floor(seed * 5)];
    const at = (u, y, o = out) => [x + tx * u + nx * o, base + y, z + tz * u + nz * o];
    const boxAt = (u, y, o, w, h, d, color, list = this.frames) => {
      // w along the wall, d out from the wall
      const g = new THREE.BoxGeometry(Math.abs(tx) > 0.5 ? w : d, h, Math.abs(tx) > 0.5 ? d : w);
      const [px, py, pz] = at(u, y, o);
      g.translate(px, py, pz);
      list.push(colour(g, color));
    };

    // The riser under the glass, the fascia above, the frame round the sides
    boxAt(0, SILL + GLASS_H + FASCIA / 2, out + 0.06, W + 0.3, FASCIA, 0.26, frameC);
    for (const s of [-1, 1]) boxAt(s * (W / 2 + 0.08), SILL + GLASS_H / 2, out + 0.05, 0.2, GLASS_H + 0.02, 0.24, frameC);
    // A lit strip along the fascia (the shop's colour)
    const glowC = this.alpine ? [0xffc870, 0xffa040, 0xff9050][Math.floor(seed * 3)] : GLOWS[Math.floor(seed * 7.3) % GLOWS.length];
    boxAt(0, SILL + GLASS_H + FASCIA * 0.5, out + 0.2, W * 0.7, FASCIA * 0.42, 0.04, glowC, this.glows);

    // Panes: a door (on one side) and windows, split by mullions
    const doorW = 1.1, doorLeft = seed > 0.5;
    const doorU = doorLeft ? -W / 2 + 0.25 + doorW / 2 : W / 2 - 0.25 - doorW / 2;
    const panes = [];
    const winL = -W / 2, winR = W / 2;
    // the door pane goes from the ground up
    panes.push({ u0: doorU - doorW / 2, u1: doorU + doorW / 2, y0: 0.02, door: true });
    const restL = doorLeft ? doorU + doorW / 2 + 0.1 : winL, restR = doorLeft ? winR : doorU - doorW / 2 - 0.1;
    const n = Math.max(1, Math.round((restR - restL) / 2.4));
    for (let i = 0; i < n; i++) panes.push({ u0: restL + ((restR - restL) * i) / n, u1: restL + ((restR - restL) * (i + 1)) / n, y0: SILL });
    for (const pn of panes) {
      // mullions at both edges of each pane (thin)
      for (const u of [pn.u0, pn.u1]) boxAt(u, (pn.y0 + SILL + GLASS_H) / 2, out + 0.04, 0.08, SILL + GLASS_H - pn.y0, 0.14, frameC);
      if (!pn.door) boxAt((pn.u0 + pn.u1) / 2, SILL / 2, out + 0.05, pn.u1 - pn.u0 + 0.1, SILL, 0.22, frameC); // the riser
      if (pn.door) {
        boxAt((pn.u0 + pn.u1) / 2, pn.y0 + 0.03, out + 0.05, pn.u1 - pn.u0, 0.06, 0.16, frameC);
        boxAt((pn.u0 + pn.u1) / 2 + (doorLeft ? 0.35 : -0.35), 1.05, out + 0.1, 0.04, 0.4, 0.06, 0xc8c8c8); // handle
      }
      this._pane(x, z, nx, nz, tx, tz, base, pn.u0 + 0.04, pn.u1 - 0.04, pn.y0, SILL + GLASS_H, W, seed);
    }
    // Some shops have a step-out sign or an awning
    if (awning) {
      const [c1, c2] = STRIPES[Math.floor(seed * 13) % STRIPES.length];
      const depth = 1.3, n2 = Math.max(4, Math.round(W / 0.55));
      for (let i = 0; i < n2; i++) {
        const u0 = -W / 2 - 0.1 + ((W + 0.2) * i) / n2, u1 = -W / 2 - 0.1 + ((W + 0.2) * (i + 1)) / n2;
        // a sloping strip from the wall out and down
        const g = new THREE.BoxGeometry(u1 - u0, 0.05, depth);
        g.rotateX(0.38);
        // (built facing +z, then turned to face the wall's normal)
        g.rotateY(Math.atan2(nx, nz));
        const [px, py, pz] = at((u0 + u1) / 2, SILL + GLASS_H + FASCIA + 0.05 - Math.sin(0.38) * depth / 2, out + Math.cos(0.38) * depth / 2);
        g.translate(px, py, pz);
        this.frames.push(colour(g, i % 2 ? c2 : c1));
      }
      // the valance (the flap along the front edge)
      boxAt(0, SILL + GLASS_H + FASCIA + 0.05 - Math.sin(0.38) * depth - 0.12, out + Math.cos(0.38) * depth, W + 0.2, 0.24, 0.04, c1);
    }
  }

  _pane(x, z, nx, nz, tx, tz, base, u0, u1, y0, y1, W, seed) {
    const o = 0.04;
    const P = (u, y) => [x + tx * u + nx * o, base + y, z + tz * u + nz * o];
    // (wound so the front faces out of the wall)
    const corners = [[u0, y0], [u1, y1], [u1, y0], [u0, y0], [u0, y1], [u1, y1]];
    const pos = corners.flatMap(([u, y]) => P(u, y));
    const local = corners.flatMap(([u, y]) => [u + W / 2, y]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(Array(6).fill([nx, 0, nz]).flat(), 3));
    g.setAttribute('aT', new THREE.Float32BufferAttribute(Array(6).fill([tx, 0, tz]).flat(), 3));
    g.setAttribute('aLocal', new THREE.Float32BufferAttribute(local, 2));
    g.setAttribute('aRoom', new THREE.Float32BufferAttribute(Array(6).fill([W, 3.3, ROOM_D, seed]).flat(), 4));
    this.windows.push(g);
  }

  build() {
    const group = new THREE.Group();
    group.userData.shops = this.spots;
    if (this.frames.length) {
      const m = new THREE.Mesh(mergeGeometries(this.frames, false), new THREE.MeshLambertMaterial({ vertexColors: true }));
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
    }
    if (this.glows.length) group.add(new THREE.Mesh(mergeGeometries(this.glows, false), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })));
    if (this.windows.length) {
      const mat = interiorMaterial();
      mat.uniforms.uAlpine.value = this.alpine ? 1 : 0;
      group.add(new THREE.Mesh(mergeGeometries(this.windows, false), mat));
    }
    for (const g of [...this.frames, ...this.glows, ...this.windows]) g.dispose();
    return group;
  }
}

function colour(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

/**
 * Put shops along the street faces of a list of buildings.
 * @param {Shopfronts} shops
 * @param {{x0,z0,x1,z1}[]} buildings
 * @param {(x:number, z:number) => boolean} isOpen - is there street (not another building) at this point?
 * @param {object} [o] - chance (of a shop on a street face), base (pavement height),
 *        avoid(x, z, halfWidth) - true where a shop mustn't go (a ladder, a level's own door)
 */
export function addShopsToBuildings(shops, buildings, isOpen, { chance = 0.65, base = 0.15, avoid = null } = {}, rng = Math.random) {
  for (const b of buildings) {
    const faces = [
      { x: (b.x0 + b.x1) / 2, z: b.z0, nx: 0, nz: -1, len: b.x1 - b.x0 },
      { x: (b.x0 + b.x1) / 2, z: b.z1, nx: 0, nz: 1, len: b.x1 - b.x0 },
      { x: b.x0, z: (b.z0 + b.z1) / 2, nx: -1, nz: 0, len: b.z1 - b.z0 },
      { x: b.x1, z: (b.z0 + b.z1) / 2, nx: 1, nz: 0, len: b.z1 - b.z0 },
    ];
    for (const f of faces) {
      if (f.len < 6 || rng() > chance) continue;
      if (!isOpen(f.x + f.nx * 1.2, f.z + f.nz * 1.2)) continue;
      // One shop on a short face, two side by side on a long one
      const count = f.len > 17 ? 2 : 1;
      const slot = f.len / count;
      for (let i = 0; i < count; i++) {
        const u = -f.len / 2 + slot * (i + 0.5);
        const tx = -f.nz, tz = f.nx;
        const width = Math.min(slot - 1.4, 7 + rng() * 3);
        if (width < 4) continue;
        if (avoid?.(f.x + tx * u, f.z + tz * u, width / 2 + 0.6)) continue;
        shops.add({ x: f.x + tx * u, z: f.z + tz * u, nx: f.nx, nz: f.nz, width, base, seed: rng(), awning: rng() < 0.6 });
      }
    }
  }
}

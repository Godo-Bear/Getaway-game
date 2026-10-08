import * as THREE from 'three';
import { CollisionWorld } from '../../core/collision.js';
import { makeGlowMaterial, makeTextTexture } from '../materials.js';
import { MovingPlatform } from '../movingPlatform.js';
import { PlayerModel } from '../../player/playerModel.js';
import { CREW_LOOKS } from '../../player/people.js';
import { makeRng } from '../../core/utils.js';

// ======================================================================
//  Chapter 20, Part 3: the Opéra, the only lit building in Lumière (it has
//  its own generator). Inside the fly tower above the stage, during the
//  gala: "The Flight of the Stars".
//
//  Looking from the stage towards the audience is +Z. The stage is
//  x -11..11, the wings either side out to the walls at x = ±18.
//    - Fly galleries: lower ones on both sides at y 6, an upper one on the
//      left at y 14 (with the hatch up to the roof). A ladder in the left
//      wing goes up to the lower left gallery.
//    - Five flying bridges across the stage (long in Z, 1.6 m wide) go up
//      and down on their ropes between y 3 and 15. Hop from one to the next
//      to cross the stage high above the show.
//    - Valcourt's box (Box 5) is on the right, through the little door in
//      the proscenium wall off the lower right gallery.
//    - The follow spots shine from the back of the auditorium through the
//      proscenium arch (11 m high): low down over the stage you can be seen;
//      high up in the flies the arch hides you.
// ======================================================================

export const STAGE_X = 11.5, ARCH_TOP = 11, PROSC_Z = 7.5;
export const GALLERY_Y = 6, UPPER_Y = 14;
export const BRIDGE_X = [-9.2, -4.6, 0, 4.6, 9.2];
export const BRIDGE_MID = 9, BRIDGE_AMP = 6;
const BRIDGE_PERIOD = [11, 9.4, 12.2, 10.2, 11.6];
const BRIDGE_PHASE = [0, 1.3, 2.4, 3.9, 5.1];
/** Where bridge i is at time t (its top surface). */
export const bridgeY = (i, t) => BRIDGE_MID + BRIDGE_AMP * Math.sin((t * Math.PI * 2) / BRIDGE_PERIOD[i] + BRIDGE_PHASE[i]);

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o });

/** A painted cut-out for the show (a moon, a star, a cloud) on a canvas. */
function cutout(kind) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  if (kind === 'moon') {
    g.fillStyle = '#f4e8b0'; g.beginPath(); g.arc(64, 64, 54, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(88, 50, 48, 0, Math.PI * 2); g.fill();
  } else if (kind === 'star') {
    g.fillStyle = '#ffd860'; g.beginPath();
    for (let k = 0; k < 10; k++) { const r = k % 2 ? 24 : 60, a = (k / 10) * Math.PI * 2 - Math.PI / 2; g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); }
    g.fill();
  } else {
    g.fillStyle = '#c8d0e8';
    for (const [x, y, r] of [[34, 74, 26], [62, 58, 32], [92, 72, 26], [64, 84, 24]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, emissive: 0x2a2410, roughness: 0.9 });
}

/** The painted backdrop: Lumière's roofs and the Iron Tower under a starry sky. */
function backdropMaterial(rng) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, 256);
  sky.addColorStop(0, '#0a1030'); sky.addColorStop(1, '#3a3a78');
  g.fillStyle = sky; g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 120; i++) { g.fillStyle = `rgba(255,250,220,${0.4 + rng() * 0.6})`; g.fillRect(rng() * 512, rng() * 160, 2, 2); }
  g.fillStyle = '#1a1830';
  for (let x = 0; x < 512; x += 26 + rng() * 20) { const h = 40 + rng() * 50; g.fillRect(x, 256 - h, 30 + rng() * 14, h); }
  g.beginPath(); g.moveTo(240, 256); g.lineTo(256, 70); g.lineTo(272, 256); g.fill(); // (the tower)
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95, emissive: 0x1a1a30 });
}

export function buildChapter20Opera() {
  const group = new THREE.Group();
  const world = new CollisionWorld(8);
  const rng = makeRng(2021);
  const ladders = [];
  const solid = (x0, y0, z0, x1, y1, z1, material, tag = 'wall') => {
    if (material) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), material);
      m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      group.add(m);
    }
    return world.addBox(x0, y0, z0, x1, y1, z1, { tag });
  };
  const brick = mat(0x3a2e2a), black = mat(0x16161a), boards = mat(0x5a3e26, { roughness: 0.7 }), steel = mat(0x4a4d55, { metalness: 0.6, roughness: 0.5 });
  const red = mat(0x8a1420, { roughness: 0.9 }), gold = mat(0xc8a040, { metalness: 0.7, roughness: 0.35 }), cream = mat(0xe8dcc0);
  const ladderMesh = (x, z, nx, nz, y0, y1) => {
    const g = new THREE.Group();
    for (const s of [-0.28, 0.28]) { const r = new THREE.Mesh(new THREE.BoxGeometry(nz ? 0.06 : 0.06, y1 - y0, 0.06), steel); r.position.set(nz ? s : 0, (y1 - y0) / 2, nx ? s : 0); g.add(r); }
    for (let y = 0.3; y < y1 - y0; y += 0.4) { const rung = new THREE.Mesh(new THREE.BoxGeometry(nz ? 0.56 : 0.05, 0.05, nx ? 0.56 : 0.05), steel); rung.position.y = y; g.add(rung); }
    g.position.set(x + nx * 0.08, y0, z + nz * 0.08);
    group.add(g);
    ladders.push({ x, z, nx, nz, y0, y1 });
  };

  // ------------------------------------------------------------ the stage house
  solid(-18, -1, -9, 18, 0, 8.3, boards, 'roof');                       // the stage and the wings
  solid(-18.8, 0, -9.8, -18, 24, 8.3, brick);                           // side walls
  solid(18, 0, -9.8, 18.8, 24, 13.4, brick);
  solid(-18, 0, -9.8, 18, 24, -9, brick);                               // back wall
  solid(-18.8, 24, -9.8, 18.8, 25, 13.4, black);                        // the roof over the flies
  // the proscenium wall: an arch over the stage, and the little pass door to the boxes on the right
  solid(-18, 0, PROSC_Z, -STAGE_X + 0.5, 24, 8.3, cream);
  solid(STAGE_X - 0.5, 0, PROSC_Z, 14.2, 24, 8.3, cream);
  solid(15.8, 0, PROSC_Z, 18, 24, 8.3, cream);
  solid(14.2, 0, PROSC_Z, 15.8, GALLERY_Y, 8.3, cream);
  solid(14.2, GALLERY_Y + 2.4, PROSC_Z, 15.8, 24, 8.3, cream);
  solid(-STAGE_X + 0.5, ARCH_TOP, PROSC_Z, STAGE_X - 0.5, 24, 8.3, cream);
  // gold trim round the arch, and the great red curtain gathered at the sides
  const trim = new THREE.Mesh(new THREE.BoxGeometry(2 * STAGE_X - 0.6, 0.4, 0.1), gold);
  trim.position.set(0, ARCH_TOP - 0.2, 8.35);
  group.add(trim);
  for (const sx of [-1, 1]) {
    const cur = new THREE.Mesh(new THREE.BoxGeometry(1.6, ARCH_TOP, 0.4), red);
    cur.position.set(sx * (STAGE_X - 1.2), ARCH_TOP / 2, PROSC_Z - 0.3);
    group.add(cur);
  }
  const valance = new THREE.Mesh(new THREE.BoxGeometry(2 * STAGE_X, 1.4, 0.3), red);
  valance.position.set(0, ARCH_TOP - 0.7, PROSC_Z - 0.3);
  group.add(valance);
  // the painted backdrop, and two side flats (no collision: they're just cloth)
  const back = new THREE.Mesh(new THREE.PlaneGeometry(22, 11), backdropMaterial(rng));
  back.position.set(0, 5.5, -8.4);
  group.add(back);

  // ------------------------------------------------------------ the fly galleries
  const yellow = makeGlowMaterial(0xffc030, 0.35);
  const gallery = (x0, x1, y) => {
    solid(x0, y - 0.4, -9, x1, y, PROSC_Z, steel, 'roof');
    const edgeX = x0 < 0 ? x1 : x0;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 16.4), yellow);
    strip.position.set(edgeX + (x0 < 0 ? -0.06 : 0.06), y + 0.01, -0.75);
    group.add(strip);
    // the pin rail: a row of ropes running up to the grid
    const ropes = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.025, 0.025, 24 - y, 4), mat(0xb8a070), 14);
    const o = new THREE.Object3D();
    for (let k = 0; k < 14; k++) { o.position.set(x0 < 0 ? x0 + 0.6 : x1 - 0.6, y + (24 - y) / 2, -8 + k * 1.1); o.updateMatrix(); ropes.setMatrixAt(k, o.matrix); }
    group.add(ropes);
  };
  gallery(-18, -13, GALLERY_Y);
  gallery(13, 18, GALLERY_Y);
  gallery(-18, -13, UPPER_Y);
  ladderMesh(-13, -6.5, 1, 0, 0, GALLERY_Y);                            // the left wing up to the lower left gallery
  // the roof hatch at the back of the upper gallery (and its ladder)
  const hatch = new THREE.Vector3(-16.2, UPPER_Y, -7.6);
  const hl = new THREE.Group();
  for (const s of [-0.28, 0.28]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.06, 24 - UPPER_Y, 0.06), steel); r.position.set(s, (24 - UPPER_Y) / 2, 0); hl.add(r); }
  for (let y = 0.3; y < 24 - UPPER_Y; y += 0.4) { const rung = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.05, 0.05), steel); rung.position.y = y; hl.add(rung); }
  hl.position.set(hatch.x, UPPER_Y, -8.9);
  group.add(hl);
  const hatchGlow = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.1, 24), makeGlowMaterial(0x4dffa6, 0.7));
  hatchGlow.rotation.x = -Math.PI / 2;
  hatchGlow.position.set(hatch.x, UPPER_Y + 0.04, hatch.z + 0.4);
  group.add(hatchGlow);
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshBasicMaterial({ color: 0x2a3a6a }));
  sky.rotation.x = Math.PI / 2;
  sky.position.set(hatch.x, 23.98, -8.4);
  group.add(sky);

  // ------------------------------------------------------------ the flying bridges
  const bridges = BRIDGE_X.map((x, i) => {
    const g = new THREE.Group();
    const deck = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.35, 10), steel);
    deck.position.y = -0.175;
    const rimL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 10), yellow);
    rimL.position.set(-0.78, 0.01, 0);
    const rimR = rimL.clone();
    rimR.position.x = 0.78;
    g.add(deck, rimL, rimR);
    // the ropes up to the grid (stretched every frame to reach it)
    const ropes = new THREE.Group();
    for (const z of [-4.6, 4.6]) {
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 4), mat(0xb8a070));
      r.position.z = z;
      ropes.add(r);
    }
    g.add(ropes);
    // a row of stage lamps underneath, and the show's cut-out hanging off the front
    for (let k = -3; k <= 3; k += 2) {
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.4, 8), black);
      can.position.set(0, -0.5, k * 1.2);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.15, 10), new THREE.MeshBasicMaterial({ color: [0xfff0c0, 0x9ad0ff, 0xff9ad0, 0xffd860][(k + 3) / 2], toneMapped: false }));
      lens.rotation.x = Math.PI / 2;
      lens.position.set(0, -0.71, k * 1.2);
      g.add(can, lens);
    }
    const art = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), cutout(['moon', 'star', 'cloud', 'star', 'moon'][i]));
    art.position.set(0, -2.2, 4.9);
    g.add(art);
    const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.9, 3), steel);
    wire.position.set(0, -0.6, 4.9);
    g.add(wire);
    group.add(g);
    const pos = new THREE.Vector3(x, bridgeY(i, 0), -1);
    const plat = new MovingPlatform(world, g, [[-0.8, -0.35, -5, 0.8, 0, 5]], pos);
    return { plat, group: g, ropes, x };
  });

  // ------------------------------------------------------------ Box 5: Valcourt's box
  solid(12, GALLERY_Y - 0.4, 8.3, 18, GALLERY_Y, 13.4, red, 'roof');          // the floor
  solid(12, GALLERY_Y, 13, 18, GALLERY_Y + 3.6, 13.4, red);                   // back wall (to the next box)
  solid(12, GALLERY_Y + 3.6, 8.3, 18, GALLERY_Y + 4, 13.4, gold);              // the ceiling
  solid(12, GALLERY_Y, 8.3, 12.3, GALLERY_Y + 1.1, 13, gold);                 // the balustrade
  const chairs = [];
  for (const [x, z, f] of [[13.3, 10.4, -2.2], [13.3, 11.9, -2.0]]) {
    const ch = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.6), red);
    seat.position.y = 0.25;
    const bk = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.12), red);
    bk.position.set(0, 0.75, -0.26);
    ch.add(seat, bk);
    ch.position.set(x, GALLERY_Y, z);
    ch.rotation.y = f;
    group.add(ch);
    chairs.push(ch);
  }
  // the little table with the Star's open case on it
  const table = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.3, 0.75, 12), gold);
  table.position.set(14.4, GALLERY_Y + 0.375, 12.4);
  const caseM = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.3), mat(0x1a1a40));
  caseM.position.set(14.4, GALLERY_Y + 0.81, 12.4);
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0), new THREE.MeshStandardMaterial({ color: 0xeaf6ff, metalness: 0.2, roughness: 0.02, emissive: 0x6a9ad0, emissiveIntensity: 1.3 }));
  star.position.set(14.4, GALLERY_Y + 0.98, 12.4);
  const starGlow = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 8), makeGlowMaterial(0x9ad0ff, 0.25));
  starGlow.position.copy(star.position);
  group.add(table, caseM, star, starGlow);
  world.addBox(14.05, GALLERY_Y, 12.05, 14.75, GALLERY_Y + 0.75, 12.75, { tag: 'wall' });
  const boxLamp = new THREE.PointLight(0xffc880, 9, 7, 1.6);
  boxLamp.position.set(16, GALLERY_Y + 3, 11);
  group.add(boxLamp);
  // Valcourt himself, in his white dinner jacket, watching the show
  const valcourt = new PlayerModel(CREW_LOOKS.valcourt, { bag: false, style: CREW_LOOKS.valcourt.style });
  const vBody = { pos: new THREE.Vector3(13.3, GALLERY_Y + 0.05, 10.4), vel: new THREE.Vector3(), facing: -2.2, state: 'ground', horizontalSpeed: 0, mantleProgress: 0, stateTime: 0, stumbleTimer: 0, mantle: null, wallRun: null };
  valcourt.seated = true;
  group.add(valcourt.root);

  // ------------------------------------------------------------ the auditorium (to look at)
  const hall = new THREE.Group();
  const stalls = new THREE.Mesh(new THREE.BoxGeometry(36, 1, 30), mat(0x3a1418));
  stalls.position.set(0, -0.5, 24);
  hall.add(stalls);
  world.addBox(-18, -1, 8.3, 18, 0, 40, { tag: 'roof' });
  const seatGeo = new THREE.BoxGeometry(0.55, 0.9, 0.5), headGeo = new THREE.SphereGeometry(0.13, 8, 6);
  const seats = new THREE.InstancedMesh(seatGeo, red, 400), heads = new THREE.InstancedMesh(headGeo, mat(0xd8a880), 400);
  const o = new THREE.Object3D();
  let n = 0;
  for (let row = 0; row < 16 && n < 400; row++) for (let x = -12; x <= 12 && n < 400; x += 0.7) {
    if (Math.abs(x) < 0.8) continue; // (the aisle)
    const z = 12 + row * 1.1, y = row * 0.18;
    o.position.set(x, y + 0.45, z); o.updateMatrix(); seats.setMatrixAt(n, o.matrix);
    o.position.set(x + (rng() - 0.5) * 0.06, y + 1.15, z - 0.05); o.updateMatrix(); heads.setMatrixAt(n, o.matrix);
    n++;
  }
  seats.count = heads.count = n;
  hall.add(seats, heads);
  // the tiers of boxes round the sides, the back balcony, the chandelier
  for (const sx of [-1, 1]) for (let tier = 0; tier < 3; tier++) {
    const front = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.1, 24), gold);
    front.position.set(sx * 12.2, 6 + tier * 4 + 0.55, 26);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4, 24), red);
    wall.position.set(sx * 17, 6 + tier * 4 + 2, 26);
    hall.add(front, wall);
  }
  const balcony = new THREE.Mesh(new THREE.BoxGeometry(30, 1.2, 0.4), gold);
  balcony.position.set(0, 10.6, 36);
  hall.add(balcony);
  const chand = new THREE.Group();
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2, r = k % 2 ? 1.6 : 2.4;
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffe0a0, toneMapped: false }));
    b.position.set(Math.cos(a) * r, (k % 2) * 0.5, Math.sin(a) * r);
    chand.add(b);
  }
  chand.position.set(0, 17, 24);
  hall.add(chand);
  const hallSides = new THREE.Mesh(new THREE.BoxGeometry(38, 26, 32), new THREE.MeshStandardMaterial({ color: 0x2a0e12, side: THREE.BackSide, roughness: 1 }));
  hallSides.position.set(0, 12, 24.4);
  hall.add(hallSides);
  group.add(hall);

  // ------------------------------------------------------------ the show (two singers on the stage)
  const singers = [
    new PlayerModel({ hoodie: 0xb01830, trousers: 0xb01830, skin: 0xe0b090, hair: 0x3a2416 }, { bag: false, style: { top: 'trench', hair: 'long' } }),
    new PlayerModel({ hoodie: 0x1a1b22, trousers: 0x1a1b22, skin: 0xc4946f, hair: 0x1a1410, shirt: 0xffffff, tie: 0x1a1b22 }, { bag: false, style: { top: 'suit', hair: 'short', beard: 'beard' } }),
  ].map((m, i) => {
    group.add(m.root);
    return { model: m, body: { pos: new THREE.Vector3(i ? 2 : -2, 0, 2), vel: new THREE.Vector3(), facing: 0, state: 'ground', horizontalSpeed: 0, mantleProgress: 0, stateTime: 0, stumbleTimer: 0, mantle: null, wallRun: null }, t: i * 3 };
  });

  // ------------------------------------------------------------ lights
  const wash = new THREE.PointLight(0xffd8a0, 60, 28, 1.4);
  wash.position.set(0, 8, 3);
  const work = [[-15.5, GALLERY_Y + 2.5, 0], [15.5, GALLERY_Y + 2.5, 0], [-15.5, UPPER_Y + 2.5, -2]].map(([x, y, z]) => {
    const l = new THREE.PointLight(0x7a9ad8, 7, 12, 1.5);
    l.position.set(x, y, z);
    return l;
  });
  group.add(wash, ...work);
  for (const l of work) {
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), new THREE.MeshBasicMaterial({ color: 0x9ab8ff, toneMapped: false }));
    bulb.position.copy(l.position);
    group.add(bulb);
  }
  // the box number over the pass door
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.5), new THREE.MeshBasicMaterial({ map: makeTextTexture('LOGE 5', { color: '#ffd070' }), transparent: true, toneMapped: false }));
  sign.position.set(15, GALLERY_Y + 2.8, PROSC_Z - 0.02);
  sign.rotation.y = Math.PI;
  group.add(sign);

  return {
    group, world, ladders, bridges, valcourt, vBody, star, starGlow, starPos: star.position.clone(), singers, hatch, hatchGlow,
    spawn: new THREE.Vector3(-15.6, 0.05, -3), checkpoints: [], hideSpots: [], buildings: [],
  };
}

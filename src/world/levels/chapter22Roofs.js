import * as THREE from 'three';
import { generateRooftopCity } from '../rooftopCity.js';
import { MIRAGE_FOOT } from '../maps.js';
import { rooftopCitySpawns } from '../../ai/officer.js';
import { PlayerModel } from '../../player/playerModel.js';
import { makeGlowMaterial, makeTextTexture } from '../materials.js';

// Chapter 22, Part 6: over the roofs of Mirage Springs at 2 a.m. (the same
// city as Free Run), from the Oasis Motel in the north-west to the Golden
// Mirage, the tallest casino on the Strip, in the south-east. The goal is
// the casino's drive, down on the street in front of it, where the
// doormen are.

const DOORMAN = { hoodie: 0xc8a040, trousers: 0x16161a, shoes: 0x0a0a0a, skin: 0x8d5a3b, hair: 0x1a1410, shirt: 0xffffff, tie: 0x16161a, hat: 0xc8a040,
  style: { top: 'suit', hat: 'cap', build: 1.15 } };

export function buildChapter22Roofs() {
  const city = generateRooftopCity(MIRAGE_FOOT);
  const C = (i) => city.blockCenters[i];
  const half = city.block / 2;
  /** The roof of the building nearest the middle of block (i, j) (at least 8 m up, if there is one). */
  const roofOf = (i, j) => {
    const cx = C(i), cz = C(j);
    let best = null, bd = Infinity;
    for (const b of city.buildings) {
      const x = (b.minX + b.maxX) / 2, z = (b.minZ + b.maxZ) / 2, d = Math.hypot(x - cx, z - cz) + (b.h < 8 ? 1000 : 0);
      if (Math.abs(x - cx) > half || Math.abs(z - cz) > half || b.h < 5) continue;
      if (d < bd) { bd = d; best = b; }
    }
    const b = best;
    return { b, pos: new THREE.Vector3((b.minX + b.maxX) / 2, b.h + 0.05, (b.minZ + b.maxZ) / 2), roof: { minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ, h: b.h } };
  };
  const yawTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z) - Math.PI;

  // the Golden Mirage: the tallest tower in the far (south-east) corner of town
  let gold = null;
  for (const b of city.buildings) {
    const x = (b.minX + b.maxX) / 2, z = (b.minZ + b.maxZ) / 2;
    if (x > C(4) - half && z > C(4) - half && (!gold || b.h > gold.h)) gold = b;
  }
  const gx = (gold.minX + gold.maxX) / 2, gz = (gold.minZ + gold.maxZ) / 2;
  const gj = city.blockCenters.reduce((bi, c, i) => (Math.abs(c - gz) < Math.abs(city.blockCenters[bi] - gz) ? i : bi), 0);
  // its drive: on the street along the north side of its block (towards where you come from)
  const goalPos = new THREE.Vector3(gx, 0, C(gj) - half - 6.5);

  const motel = roofOf(1, 1), mid = roofOf(2, 2), late = roofOf(4, 3);
  const checkpoints = [
    { name: 'The Oasis Motel', spawn: motel.pos, yaw: yawTo(motel.pos, mid.pos), roof: motel.roof },
    { name: 'Over the Strip', spawn: mid.pos, yaw: yawTo(mid.pos, late.pos), roof: mid.roof },
    { name: 'Nearly there', spawn: late.pos, yaw: yawTo(late.pos, goalPos), roof: late.roof },
  ];

  // the Golden Mirage in its gold glass: four walls just outside the tower's own, lit window bands
  {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#3a2808'; g.fillRect(0, 0, 64, 64);
    for (let y = 4; y < 64; y += 16) { g.fillStyle = '#ffd890'; g.fillRect(0, y, 64, 7); g.fillStyle = '#3a2808'; for (let x = 0; x < 64; x += 16) g.fillRect(x, y, 2, 7); }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    const w = gold.maxX - gold.minX + 0.3, d = gold.maxZ - gold.minZ + 0.3, h = gold.h - 0.1;
    for (const [pw, px, pz, ry] of [[w, gx, gold.maxZ + 0.15, 0], [w, gx, gold.minZ - 0.15, Math.PI], [d, gold.maxX + 0.15, gz, Math.PI / 2], [d, gold.minX - 0.15, gz, -Math.PI / 2]]) {
      const t = tex.clone(); t.needsUpdate = true; t.repeat.set(pw / 8, h / 4);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(pw, h), new THREE.MeshStandardMaterial({ color: 0xd8b050, metalness: 0.7, roughness: 0.3, emissive: 0xffc060, emissiveMap: t, emissiveIntensity: 0.75 }));
      m.position.set(px, h / 2, pz);
      m.rotation.y = ry;
      city.group.add(m);
    }
  }
  // the motel's sign on its roof, and the casino's: big, gold, lit
  const sign = (text, color, w, x, y, z, rotY) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 5), new THREE.MeshBasicMaterial({ map: makeTextTexture(text, { color, bg: 'rgba(0,0,0,0)', width: 1024, height: 200 }), transparent: true, side: THREE.DoubleSide, toneMapped: false }));
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    city.group.add(m);
    return m;
  };
  sign('OASIS MOTEL', '#4dffa6', 10, motel.pos.x, motel.pos.y + 2.6, motel.roof.minZ + 0.5, 0);
  sign('GOLDEN MIRAGE', '#ffd040', Math.min(30, gold.maxX - gold.minX + 6), gx, gold.h + 4, gold.minZ - 0.6, Math.PI);
  sign('GOLDEN MIRAGE', '#ffd040', Math.min(30, gold.maxX - gold.minX + 6), gx, gold.h + 4, gold.minZ - 0.65, 0);
  // the drive: a gold carpet, lamps, two doormen, and the green ring
  const carpet = new THREE.Mesh(new THREE.PlaneGeometry(4, 12), new THREE.MeshLambertMaterial({ color: 0xb8902a }));
  carpet.rotation.x = -Math.PI / 2;
  carpet.position.set(gx, 0.06, goalPos.z + 2);
  city.group.add(carpet);
  for (const s of [-1, 1]) {
    const d = new PlayerModel(DOORMAN, { bag: false });
    d.update(0, { pos: new THREE.Vector3(gx + s * 2.6, 0.05, goalPos.z + 4), vel: new THREE.Vector3(), facing: Math.PI, state: 'ground', horizontalSpeed: 0, mantleProgress: 0, stateTime: 0, stumbleTimer: 0, mantle: null, wallRun: null });
    city.group.add(d.root);
    const lamp = new THREE.PointLight(0xffd070, 14, 16, 1.6);
    lamp.position.set(gx + s * 4, 4, goalPos.z + 1);
    city.group.add(lamp);
  }
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.4, 3, 32), makeGlowMaterial(0xffd040, 0.75));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(goalPos.x, 0.08, goalPos.z);
  city.group.add(ring);

  return {
    ...city,
    groundLevel: true,
    spawn: motel.pos.clone(), checkpoints, clues: [], goalPos,
    officerSpawns: rooftopCitySpawns(city),
    heliStart: new THREE.Vector3(C(5), 0, C(0)),
  };
}

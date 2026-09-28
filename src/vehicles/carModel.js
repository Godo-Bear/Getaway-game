import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeGlowMaterial, getGlowTexture } from '../world/materials.js';

// Box-built car meshes (player getaway car, police cruisers, civilian cars).
// Cars face +Z: headlights at +Z, tail lights at -Z.
//
// Materials are cached and shared between cars of the same colour, and the
// geometries are shared by every car, which keeps memory and draw setup low.

const geoCache = new Map();
const matCache = new Map();

function geo(key, make) {
  if (!geoCache.has(key)) geoCache.set(key, make());
  return geoCache.get(key);
}
function lambert(color, extra = {}) {
  const key = `${color}|${JSON.stringify(extra)}`;
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color, ...extra }));
  return matCache.get(key);
}

const glass = () => lambert(0x141c2c);
const tyre = () => lambert(0x111111);

function addBox(parent, w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(geo(`box${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

/**
 * @param {object} opts
 * @param {'player'|'police'|'civilian'|'van'|'taxi'} opts.kind
 * @param {number} opts.color
 */
export function makeCarMesh({ kind = 'civilian', color = 0x888888 } = {}) {
  const g = new THREE.Group();
  const body = new THREE.Group(); // tilts for pitch/roll without moving wheels' parent
  g.add(body);
  const isVan = kind === 'van';
  // The player's paint gets its own material so the colour can change live.
  const bodyMat = kind === 'player' ? new THREE.MeshLambertMaterial({ color }) : lambert(color);

  if (isVan) {
    addBox(body, 2.2, 1.9, 5.0, bodyMat, 0, 1.4, 0);
    addBox(body, 2.0, 0.7, 0.1, glass(), 0, 1.9, 2.52);
  } else {
    addBox(body, 2.05, 0.7, 4.4, bodyMat, 0, 0.72, 0);           // lower body
    const cab = addBox(body, 1.75, 0.6, 2.1, kind === 'police' ? lambert(0xf2f2f2) : glass(), 0, 1.36, -0.25);
    cab.castShadow = true;
    if (kind === 'police') {
      addBox(body, 1.78, 0.36, 1.7, glass(), 0, 1.4, -0.25);      // windows band
      addBox(body, 2.08, 0.34, 1.9, lambert(0x101216), 0, 0.68, -0.1); // black doors
      addBox(body, 2.07, 0.12, 4.42, lambert(0xf2f2f2), 0, 1.02, 0);   // white stripe
    }
    if (kind === 'player') {
      // Racing stripes and a spoiler for the getaway car
      const stripe = lambert(0x151515);
      for (const x of [-0.22, 0.22]) {
        addBox(body, 0.24, 0.02, 4.42, stripe, x, 1.08, 0);
        addBox(body, 0.24, 0.02, 2.12, stripe, x, 1.67, -0.25);
      }
      addBox(body, 1.9, 0.08, 0.4, stripe, 0, 1.35, -2.05);
      addBox(body, 0.08, 0.3, 0.3, stripe, -0.8, 1.18, -2.05);
      addBox(body, 0.08, 0.3, 0.3, stripe, 0.8, 1.18, -2.05);
    }
    if (kind === 'taxi') {
      addBox(body, 0.7, 0.22, 0.3, new THREE.MeshBasicMaterial({ color: 0xfff2a0, toneMapped: false }), 0, 1.78, -0.25);
    }
  }

  // Head and tail lights
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff1c4, toneMapped: false });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0x881018, toneMapped: false });
  const lz = isVan ? 2.52 : 2.21, ly = isVan ? 1.0 : 0.78;
  for (const s of [-1, 1]) {
    addBox(body, 0.42, 0.18, 0.06, headMat, s * 0.66, ly, lz);
    addBox(body, 0.46, 0.16, 0.06, tailMat, s * 0.7, ly, -lz);
  }
  // Fake headlight beams on the road (additive glow, no real light needed)
  const beamGeo = geo('beam', () => {
    const p = new THREE.PlaneGeometry(4.5, 12);
    p.rotateX(-Math.PI / 2);
    p.translate(0, 0.06, 8.5);
    return p;
  });
  const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({
    map: getGlowTexture(), color: 0xfff0c0, transparent: true, opacity: 0.35,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  g.add(beam);

  // Police light bar
  let sirens = null;
  if (kind === 'police') {
    const red = new THREE.MeshBasicMaterial({ color: 0xff2233, toneMapped: false });
    const blue = new THREE.MeshBasicMaterial({ color: 0x2266ff, toneMapped: false });
    const r = addBox(body, 0.6, 0.16, 0.34, red, -0.34, 1.74, -0.25);
    const b = addBox(body, 0.6, 0.16, 0.34, blue, 0.34, 1.74, -0.25);
    // Big soft glows so the lights read from far away
    const glowR = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0xff2030, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    const glowB = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0x2060ff, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    glowR.position.set(-0.4, 1.9, -0.25);
    glowB.position.set(0.4, 1.9, -0.25);
    glowR.scale.setScalar(4);
    glowB.scale.setScalar(4);
    body.add(glowR, glowB);
    sirens = { r, b, glowR, glowB, red, blue };
  }

  // Wheels (spin with speed)
  const wheels = [];
  const wz = isVan ? 1.7 : 1.4, wx = isVan ? 1.05 : 0.98;
  const wheelGeo = geo('wheel', () => {
    const c = new THREE.CylinderGeometry(0.42, 0.42, 0.34, 12);
    c.rotateZ(Math.PI / 2);
    return c;
  });
  for (const [x, z] of [[-wx, -wz], [wx, -wz], [-wx, wz], [wx, wz]]) {
    const w = new THREE.Mesh(wheelGeo, tyre());
    w.position.set(x, 0.42, z);
    g.add(w);
    wheels.push(w);
    // Hub cap so the spin is visible
    const hub = new THREE.Mesh(geo('hub', () => new THREE.BoxGeometry(0.36, 0.5, 0.12)), lambert(0x777777));
    w.add(hub);
  }

  // Nitro flames (only visible while boosting)
  let flames = null;
  if (kind === 'player') {
    flames = new THREE.Group();
    for (const s of [-0.5, 0.5]) {
      const f = new THREE.Mesh(geo('flame', () => {
        const c = new THREE.ConeGeometry(0.2, 1.2, 8);
        c.rotateX(-Math.PI / 2);
        c.translate(0, 0, -0.6);
        return c;
      }), makeGlowMaterial(0x40b0ff, 0.85));
      f.position.set(s, 0.45, -2.3);
      flames.add(f);
    }
    flames.visible = false;
    g.add(flames);
  }

  // Hubcaps only on the player's car (nobody looks that closely at traffic).
  if (kind !== 'player') for (const w of wheels) w.clear();
  // Performance: merge all the static body boxes that share a material into
  // one mesh each. A car goes from ~20 draw calls to ~8.
  const keep = new Set([tailMat, sirens?.red, sirens?.blue].filter(Boolean));
  mergeStatic(body, keep);

  g.userData = { wheels, sirens, flames, body, beam, tailMat, paint: kind === 'player' ? bodyMat : null };
  return g;
}

/** Merge the plain Mesh children of `group` by material (except `keep`). */
function mergeStatic(group, keep) {
  const byMat = new Map();
  for (const child of [...group.children]) {
    if (!child.isMesh || keep.has(child.material)) continue;
    child.updateMatrix();
    const geo = child.geometry.clone().applyMatrix4(child.matrix);
    if (!byMat.has(child.material)) byMat.set(child.material, []);
    byMat.get(child.material).push(geo);
    group.remove(child);
  }
  for (const [mat, geos] of byMat) {
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = true;
    mesh.renderOrder = mat.depthTest === false ? 10 : 0;
    group.add(mesh);
  }
}

/** Flash police lights. Call every frame with the running time. */
export function updateSirens(mesh, time, on = true) {
  const s = mesh.userData.sirens;
  if (!s) return;
  const phase = Math.floor(time * 6) % 2 === 0;
  s.glowR.visible = on && phase;
  s.glowB.visible = on && !phase;
  s.red.color.setHex(on && phase ? 0xff2233 : 0x330008);
  s.blue.color.setHex(on && !phase ? 0x2266ff : 0x000833);
}

export const CIVILIAN_COLORS = [0x8a1c1c, 0x1f3f8a, 0xd8d4cc, 0x2e2e33, 0x5a6a3a, 0x9a9a9a, 0x6b2f4a, 0x2f6b6b];

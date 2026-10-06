import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Car, CAR_SPECS } from '../vehicles/car.js';
import { makeCarMesh, CIVILIAN_COLORS } from '../vehicles/carModel.js';
import { PlayerModel } from '../player/playerModel.js';
import { randomPerson } from '../player/people.js';
import { audio } from '../core/audio.js';
import { buildTrees } from './cityBlocks.js';

// Life on the streets of the driving city (built on the pavement edges that
// generateStreetCity records):
//
//  - People walking along the pavements. Drive at them and they jump clear
//    (across the pavement, or flat against the wall); cut it too fine and
//    they dive out of the way and pick themselves up. Honk and they look.
//  - Cars parked at the kerb, half up on the pavement. Shove them about.
//  - Trees along the kerbs (their trunks are solid).
//  - Street furniture: fire hydrants (knock one over and it sprays water),
//    bins, newspaper boxes and benches that go flying when you hit them,
//    and bus shelters with lit-up adverts.
//  - Steam rising from the drains (Harbor City; the snowy town has its
//    chimney smoke instead).
//
// Phone-friendly: the furniture is instanced (one draw call per kind), and
// the people and parked cars are small pools that are moved round to stay
// near you, out of sight.

const PED_IN = 1.85;          // how far into the pavement people walk (m from the kerb)
const PARK_IN = 0.2;          // parked cars' centre line (just up on the kerb)
const GRAVITY = 18;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();
const _frustum = new THREE.Frustum(), _pm = new THREE.Matrix4(), _v = new THREE.Vector3(), _hits = [];

/** A box / cylinder with every vertex one colour (to merge into one prop). */
function part(geo, color, x = 0, y = 0, z = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  g.translate(x, y, z);
  const c = new THREE.Color(color), n = g.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}
const bx = (w, h, d, color, x, y, z) => part(new THREE.BoxGeometry(w, h, d), color, x, y, z);
const cyl = (r0, r1, h, color, x, y, z, seg = 10) => part(new THREE.CylinderGeometry(r0, r1, h, seg), color, x, y, z);

/** A lit advert for a bus shelter: two words on a coloured poster. */
function adTexture(a, b, bg, fg) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 204;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 204);
  grad.addColorStop(0, bg); grad.addColorStop(1, '#101018');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 204);
  g.fillStyle = fg; g.globalAlpha = 0.25;
  g.beginPath(); g.arc(64, 140, 46, 0, Math.PI * 2); g.fill();
  g.globalAlpha = 1;
  g.textAlign = 'center';
  g.font = 'bold 30px Arial, sans-serif';
  g.fillText(a, 64, 58, 118);
  g.font = 'bold 22px Arial, sans-serif';
  g.fillText(b, 64, 88, 118);
  g.strokeStyle = fg; g.lineWidth = 4; g.strokeRect(4, 4, 120, 196);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The street furniture, each built once: [geometry, radius, knockable]. */
function propKinds(alpine) {
  const kinds = {};
  // Fire hydrant (yellow with a tall snow marker in the mountains)
  const hyd = alpine ? 0xe8b820 : 0xc8241e;
  kinds.hydrant = { r: 0.3, geo: mergeGeometries([
    cyl(0.17, 0.2, 0.12, hyd, 0, 0.06, 0), cyl(0.14, 0.15, 0.5, hyd, 0, 0.36, 0), cyl(0.17, 0.17, 0.06, hyd, 0, 0.62, 0),
    cyl(0.1, 0.14, 0.14, hyd, 0, 0.71, 0), cyl(0.05, 0.05, 0.36, 0xd0d0d0, 0, 0.42, 0).rotateX(Math.PI / 2).translate(0, 0, 0),
    ...(alpine ? [cyl(0.02, 0.02, 1.4, 0xd8302a, 0.22, 0.7, 0, 5), cyl(0.025, 0.025, 0.3, 0xffffff, 0.22, 1.3, 0, 5)] : []),
  ]) };
  kinds.bin = { r: 0.4, geo: mergeGeometries([
    cyl(0.3, 0.27, 0.86, alpine ? 0x5a3e28 : 0x2a4a34, 0, 0.43, 0, 12), cyl(0.33, 0.33, 0.06, 0x2a2c30, 0, 0.88, 0, 12),
    cyl(0.305, 0.305, 0.06, 0x8a8f96, 0, 0.6, 0, 12),
  ]) };
  kinds.newsbox = { r: 0.4, geo: mergeGeometries([
    bx(0.5, 0.75, 0.42, 0x2a5ad8, 0, 0.55, 0), bx(0.4, 0.3, 0.02, 0xd8dce4, 0, 0.66, 0.215), bx(0.54, 0.05, 0.46, 0x1a2a6a, 0, 0.95, 0),
    bx(0.06, 0.2, 0.06, 0x2a2c30, -0.18, 0.1, 0), bx(0.06, 0.2, 0.06, 0x2a2c30, 0.18, 0.1, 0),
  ]) };
  const wood = alpine ? 0x7a5236 : 0x8a5a30;
  kinds.bench = { r: 0.75, geo: mergeGeometries([
    bx(1.8, 0.06, 0.45, wood, 0, 0.45, 0), bx(1.8, 0.36, 0.05, wood, 0, 0.78, -0.22),
    ...[-0.75, 0.75].flatMap((x) => [bx(0.06, 0.45, 0.4, 0x2a2c30, x, 0.22, 0), bx(0.06, 0.4, 0.06, 0x2a2c30, x, 0.68, -0.22)]),
  ]) };
  // Bus shelter (stays put: it has a collider): roof, glass back, posts
  kinds.shelter = { r: 0, static: true, geo: mergeGeometries([
    bx(3.4, 0.1, 1.3, 0x3a3e46, 0, 2.5, 0), bx(3.2, 2.0, 0.04, 0x8ab0c8, 0, 1.35, -0.55),
    ...[-1.6, 1.6].map((x) => bx(0.08, 2.45, 0.08, 0x3a3e46, x, 1.23, -0.55)), bx(2.0, 0.06, 0.34, 0x3a3e46, 0, 0.5, -0.33),
    ...[-0.8, 0.8].map((x) => bx(0.05, 0.5, 0.05, 0x3a3e46, x, 0.25, -0.33)),
    ...(alpine ? [bx(3.6, 0.18, 1.5, 0xf2f6fa, 0, 2.64, 0)] : []), // (snow on the roof)
  ]) };
  return kinds;
}

export class StreetLife {
  /**
   * @param {THREE.Scene} scene
   * @param {object} city - from generateStreetCity
   * @param {() => number} rng
   * @param {{graphics?: string, particles?: object}} opts
   */
  constructor(scene, city, rng, { graphics = 'medium', particles = null } = {}) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.particles = particles;
    this.group = new THREE.Group();
    scene.add(this.group);
    const alpine = city.alpine;
    const nearLamp = (x, z, r) => city.lampSpots.some(([lx, lz]) => Math.abs(lx - x) < r && Math.abs(lz - z) < r);

    // --- Slots along every kerb: parking, furniture or nothing ------------
    this.parkSpots = [];
    this.walks = [];   // pavement stretches people walk along
    const props = [];  // [kind, x, z, rotY]
    const trees = [];  // street trees [x, y, z, scale]
    const shelters = [];
    for (const k of city.kerbs) {
      const [ax, az] = k.a, [bx2, bz] = k.b;
      const len = Math.hypot(bx2 - ax, bz - az), ux = (bx2 - ax) / len, uz = (bz - az) / len;
      const ix = -k.n[0], iz = -k.n[1]; // into the pavement
      const along = (x, z) => (ux ? x : z); // (the world coordinate along this side)
      const clear = (x, z, pad = 0) => !k.keepClear.some(([a, b]) => along(x, z) > a - pad && along(x, z) < b + pad);
      const at = (t, d) => [ax + ux * t + ix * d, az + uz * t + iz * d];
      // Walking stretches (split where the side must be kept clear)
      let start = 2;
      for (let t = 2; t <= len - 2; t += 1) {
        const [x, z] = at(t, PED_IN);
        const ok = clear(x, z) && t < len - 2.5;
        if (!ok) {
          if (t - start > 8) this.walks.push({ a: at(start, PED_IN), b: at(t, PED_IN), len: t - start, k, ix, iz });
          while (t <= len - 2 && !clear(...at(t, PED_IN))) t += 1;
          start = t;
        }
      }
      if (len - 2 - start > 8) this.walks.push({ a: at(start, PED_IN), b: at(len - 2, PED_IN), len: len - 2 - start, k, ix, iz });
      // The El's pillars stand at the kerb: nothing parked under the railway
      const onEl = !uz && Math.abs(az - city.elZ) < city.roadWidth / 2 + 2;
      let shelterHere = !alpine && rng() < 0.12;
      for (let t = 6; t < len - 6; t += 7) {
        const [cx, cz] = at(t, 0);
        if (!clear(cx, cz, 3)) continue;
        const r = rng();
        if (shelterHere && t > 15 && t < len - 15 && !nearLamp(cx, cz, 3.5)) {
          // A bus shelter by the kerb, facing the road (people walk behind it)
          const [sx, sz] = at(t, 0.95);
          shelters.push([sx, sz, Math.atan2(-ix, -iz)]);
          const hx = uz ? 0.62 : 1.7, hz = ux ? 0.62 : 1.7;
          city.world.addBox(sx - hx, 0, sz - hz, sx + hx, 2.6, sz + hz, { tag: 'shelter' });
          shelterHere = false;
          t += 4;
          continue;
        }
        if (!alpine && !onEl && r < 0.55 && !nearLamp(cx, cz, 3.4)) {
          const [px, pz] = at(t, PARK_IN);
          this.parkSpots.push({ x: px, z: pz, heading: Math.atan2(ux, uz) + (rng() < 0.5 ? 0 : Math.PI), car: null });
        } else if (r < 0.72 && !nearLamp(cx, cz, 3)) {
          // A street tree in a little square of earth (bump into the trunk)
          const [tx, tz] = at(t, alpine ? 1.5 : 0.95);
          trees.push([tx, 0.15, tz, 0.8 + rng() * 0.25]);
          city.world.addBox(tx - 0.22, 0, tz - 0.22, tx + 0.22, 3, tz + 0.22, { tag: 'tree' });
        } else if (r < 0.9 && !nearLamp(cx, cz, 1.4)) {
          // Kerb side: a hydrant or a newspaper box. Wall side: a bin or a bench
          const kerbSide = rng() < 0.5;
          const kind = kerbSide ? (rng() < 0.6 ? 'hydrant' : 'newsbox') : (rng() < 0.55 ? 'bin' : 'bench');
          const [px, pz] = at(t + rng() * 2 - 1, kerbSide ? (alpine ? 1.25 : 0.55) : 2.62);
          const face = Math.atan2(ix, iz) + (kerbSide ? Math.PI : 0); // (benches face the road, newsboxes the pavement)
          props.push([kind, px, pz, kind === 'bench' ? Math.atan2(-ix, -iz) + Math.PI : face]);
        }
      }
    }

    if (trees.length) {
      this.group.add(buildTrees(trees, alpine));
      // (the earth round the trunk)
      if (!alpine) {
        const pit = new THREE.PlaneGeometry(1.3, 1.3); pit.rotateX(-Math.PI / 2);
        const pits = new THREE.InstancedMesh(pit, new THREE.MeshLambertMaterial({ color: 0x3a2a1c }), trees.length);
        trees.forEach(([x, y, z], i) => pits.setMatrixAt(i, _m.makeTranslation(x, y + 0.01, z)));
        this.group.add(pits);
      }
    }

    // --- Furniture (instanced) ---------------------------------------------
    const kinds = propKinds(alpine);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.props = [];
    this.meshes = {};
    for (const [name, kd] of Object.entries(kinds)) {
      const list = name === 'shelter' ? shelters.map(([x, z, r]) => ['shelter', x, z, r]) : props.filter((p) => p[0] === name);
      if (!list.length) continue;
      const im = new THREE.InstancedMesh(kd.geo, mat, list.length);
      im.castShadow = true;
      this.meshes[name] = im;
      list.forEach(([, x, z, rot], i) => {
        const pr = { kind: name, im, i, x, z, y: 0.15, rot, home: [x, z, rot], r: kd.r, static: !!kd.static, vx: 0, vy: 0, vz: 0, tilt: 0, tiltAxis: 0, flying: false, down: false, spray: 0 };
        this.props.push(pr);
        this._setMatrix(pr);
      });
      im.instanceMatrix.needsUpdate = true;
      this.group.add(im);
    }
    // Lit adverts in the bus shelters
    if (shelters.length) {
      const adGeo = new THREE.PlaneGeometry(1.0, 1.6);
      adGeo.translate(1.15, 1.35, -0.52);
      // A few adverts (one instanced mesh each)
      const designs = alpine
        ? [['SKI', 'SCHOOL', '#1f6ad8', '#9fd4ff'], ['HOT', 'COCOA', '#8a3a1a', '#ffd27a'], ['LIFT', 'PASS', '#1a7a4a', '#a8ffb0'], ['FONDUE', 'NIGHT', '#c0391e', '#ffe0a0']]
        : [['FIZZ', 'COLA', '#d8282a', '#ffffff'], ['NEON', 'NIGHTS', '#5a1a8a', '#ff9ad5'], ['FLY', 'AWAY', '#1f6ad8', '#ffd27a'], ['BURGER', 'BAR', '#e89a1a', '#3a1a08']];
      designs.forEach(([a, b, bg, fg], d) => {
        const mine = shelters.filter((_, i) => i % designs.length === d);
        if (!mine.length) return;
        const ads = new THREE.InstancedMesh(adGeo, new THREE.MeshBasicMaterial({ map: adTexture(a, b, bg, fg), toneMapped: false, side: THREE.DoubleSide }), mine.length);
        mine.forEach(([x, z, r], i) => ads.setMatrixAt(i, _m.compose(_p.set(x, 0.15, z), _q.setFromEuler(_e.set(0, r, 0)), _s.set(1, 1, 1))));
        this.group.add(ads);
      });
    }

    // --- Drains with steam (Harbor City) ------------------------------------
    this.drains = [];
    if (!alpine && particles) {
      const g = city.graph;
      for (const a of g.nodes) {
        for (const b of a.neighbours) {
          if (rng() > 0.18 || b.x + b.z < a.x + a.z) continue; // (each road once)
          const t = 0.3 + rng() * 0.4, side = rng() < 0.5 ? -1 : 1;
          const p = g.lanePoint(a, b, t, side * 4.3, new THREE.Vector3()); // (on a lane line)
          this.drains.push([p.x, p.z]);
        }
      }
      const disc = new THREE.CircleGeometry(0.55, 14);
      disc.rotateX(-Math.PI / 2);
      const covers = new THREE.InstancedMesh(disc, new THREE.MeshLambertMaterial({ color: 0x2a2a2c }), this.drains.length);
      this.drains.forEach(([x, z], i) => covers.setMatrixAt(i, _m.makeTranslation(x, 0.035, z)));
      this.group.add(covers);
    }
    this.steamT = 0;

    // --- People and parked cars (pools near you) ---------------------------
    const nPeople = { low: 6, medium: 11, high: 16 }[graphics] ?? 11;
    const nParked = alpine ? 0 : ({ low: 6, medium: 10, high: 14 }[graphics] ?? 10);
    this.people = [];
    for (let i = 0; i < nPeople; i++) {
      const model = new PlayerModel(randomPerson(rng, { cold: alpine }), { bag: rng() < 0.15 });
      model.root.visible = false;
      this.group.add(model.root);
      const body = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), facing: 0, state: 'ground', horizontalSpeed: 0, mantleProgress: 0, stateTime: 0, stumbleTimer: 0, mantle: null, wallRun: null };
      this.people.push({ model, body, walk: null, t: 0, dir: 1, speed: 1.2, off: 0, offTo: null, pause: 0, knock: 0, scare: 0 });
    }
    this.parked = [];
    for (let i = 0; i < nParked; i++) {
      const kind = rng() < 0.12 ? 'van' : rng() < 0.12 ? 'taxi' : 'civilian';
      const color = kind === 'taxi' ? 0xe8b820 : kind === 'van' ? 0x9a9c9f : CIVILIAN_COLORS[Math.floor(rng() * CIVILIAN_COLORS.length)];
      const mesh = makeCarMesh({ kind, color });
      // Parked: lights off
      mesh.traverse((o) => { if (o.material?.userData?.nightGlow || o.material?.blending === THREE.AdditiveBlending) o.visible = false; });
      scene.add(mesh);
      const car = new Car(CAR_SPECS.parked, mesh);
      car.active = true;
      car.isParked = true;
      car.controls.handbrake = true;
      this.parked.push({ car, mesh, spot: null });
    }
  }

  /** The parked cars (they join the physics like every other car). */
  get cars() { return this.parked.map((p) => p.car); }

  _setMatrix(pr) {
    _q.setFromEuler(_e.set(0, pr.rot, 0));
    if (pr.tilt) _q.multiply(new THREE.Quaternion().setFromAxisAngle(_v.set(Math.cos(pr.tiltAxis), 0, Math.sin(pr.tiltAxis)), pr.tilt));
    pr.im.setMatrixAt(pr.i, _m.compose(_p.set(pr.x, pr.y, pr.z), _q, _s.set(1, 1, 1)));
  }

  _frustum(camera) {
    if (!camera) return null;
    camera.updateMatrixWorld();
    _pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    return _frustum.setFromProjectionMatrix(_pm);
  }

  /** Fill the pools around the player (at the start). */
  scatter(player) {
    for (const p of this.parked) { if (p.spot) p.spot.car = null; p.spot = null; }
    for (const p of this.parked) this._park(p, player, null, 10, 150);
    for (const pe of this.people) this._placePerson(pe, player, null, 8, 90);
    for (const pr of this.props) if (pr.flying || pr.down) this._resetProp(pr);
  }

  _park(p, player, fr, minD, maxD) {
    const spots = this.parkSpots;
    for (let tries = 0; tries < 40 && spots.length; tries++) {
      const s = spots[Math.floor(this.rng() * spots.length)];
      if (s.car) continue;
      const d = Math.hypot(s.x - player.pos.x, s.z - player.pos.z);
      if (d < minD || d > maxD) continue;
      if (fr && fr.containsPoint(_v.set(s.x, 1, s.z))) continue;
      if (p.spot) p.spot.car = null;
      s.car = p;
      p.spot = s;
      p.car.place(s.x, s.z, s.heading);
      p.car.controls.throttle = 0;
      p.car.controls.handbrake = true;
      p.mesh.visible = true;
      return true;
    }
    if (!p.spot) { p.car.place(1e4, 1e4, 0); p.mesh.visible = false; }
    return false;
  }

  _placePerson(pe, player, fr, minD, maxD) {
    const walks = this.walks;
    for (let tries = 0; tries < 40 && walks.length; tries++) {
      const w = walks[Math.floor(this.rng() * walks.length)];
      const t = this.rng() * w.len;
      const x = w.a[0] + (w.b[0] - w.a[0]) * (t / w.len), z = w.a[1] + (w.b[1] - w.a[1]) * (t / w.len);
      const d = Math.hypot(x - player.pos.x, z - player.pos.z);
      if (d < minD || d > maxD) continue;
      if (fr && fr.containsPoint(_v.set(x, 1, z))) continue;
      Object.assign(pe, { walk: w, t, dir: this.rng() < 0.5 ? 1 : -1, speed: 1.05 + this.rng() * 0.6, off: 0, offTo: null, pause: 0, knock: 0, scare: 0 });
      if (pe.model.isDown) pe.model.standUp?.();
      pe.model.root.visible = true;
      this._posPerson(pe);
      return;
    }
  }

  _posPerson(pe) {
    const w = pe.walk, k = pe.t / w.len;
    pe.body.pos.set(w.a[0] + (w.b[0] - w.a[0]) * k + w.ix * pe.off, 0.15, w.a[1] + (w.b[1] - w.a[1]) * k + w.iz * pe.off);
  }

  _resetProp(pr) {
    [pr.x, pr.z, pr.rot] = pr.home;
    Object.assign(pr, { y: 0.15, vx: 0, vy: 0, vz: 0, tilt: 0, flying: false, down: false, spray: 0 });
    this._setMatrix(pr);
    pr.im.instanceMatrix.needsUpdate = true;
  }

  /** Honk: the people nearby turn and look. */
  honk(player) {
    for (const pe of this.people) {
      if (!pe.walk || pe.knock > 0) continue;
      if (Math.hypot(pe.body.pos.x - player.pos.x, pe.body.pos.z - player.pos.z) < 28) pe.model.glance(player.pos.x, player.pos.z, 1.4 + Math.random());
    }
  }

  /**
   * @param {number} dt
   * @param {Car} player
   * @param {THREE.Camera} camera
   * @param {Car[]} movers - cars that knock things over and scare people (you and the police)
   */
  update(dt, player, camera, movers) {
    const fr = this._frustum(camera);
    this._updatePeople(dt, player, fr, movers);
    this._updateProps(dt, player, movers);
    // Parked cars: recycle the far-away ones to empty spots near you
    for (const p of this.parked) {
      const c = p.car;
      c.controls.throttle = 0;
      c.controls.handbrake = true;
      c.lastImpact = 0;
      const d = Math.hypot(c.pos.x - player.pos.x, c.pos.z - player.pos.z);
      if (d > 170 || !p.spot) {
        if (!fr || !fr.containsPoint(_v.set(c.pos.x, 1, c.pos.z))) this._park(p, player, fr, 60, 150);
      }
    }
    // Steam from the drains near you
    if (this.drains.length && (this.steamT += dt) > 0.16) {
      this.steamT = 0;
      for (const [x, z] of this.drains) {
        if (Math.abs(x - player.pos.x) > 110 || Math.abs(z - player.pos.z) > 110 || Math.random() > 0.55) continue;
        this.particles.emit(x + (Math.random() - 0.5) * 0.6, 0.1, z + (Math.random() - 0.5) * 0.6, {
          vx: (Math.random() - 0.5) * 0.3, vy: 1.3 + Math.random() * 0.6, vz: (Math.random() - 0.5) * 0.3,
          size: 0.8, grow: 1.6, life: 2.6, alpha: 0.22, color: [0.86, 0.88, 0.92], drag: 0.4, fadeIn: 0.5 });
      }
    }
  }

  syncMeshes() {
    for (const p of this.parked) if (p.spot) p.car.syncMesh();
  }

  _updatePeople(dt, player, fr, movers) {
    const out = Math.round(this.people.length * (this.share ?? 1)); // (fewer people out at night)
    for (let i = 0; i < this.people.length; i++) {
      const pe = this.people[i];
      if (i >= out) { if (pe.walk) { pe.walk = null; pe.model.root.visible = false; } continue; }
      if (!pe.walk) { this._placePerson(pe, player, fr, 40, 95); continue; }
      const pos = pe.body.pos;
      const d = Math.hypot(pos.x - player.pos.x, pos.z - player.pos.z);
      if (d > 110) {
        // Far behind you: walk somewhere nearer instead (out of sight)
        if (!fr || !fr.containsPoint(_v.set(pos.x, 1, pos.z))) this._placePerson(pe, player, fr, 40, 95);
        continue;
      }
      const w = pe.walk, ux = (w.b[0] - w.a[0]) / w.len, uz = (w.b[1] - w.a[1]) / w.len;
      if (pe.scare > 0) pe.scare -= dt;
      if (pe.knock > 0) {
        pe.knock -= dt;
        pe.body.horizontalSpeed = 0;
        if (pe.knock <= 0) pe.pause = 0.8;
      } else {
        // A car coming at them: jump clear
        for (const car of movers) {
          if (car.speed < 3.5) continue;
          const rx = pos.x - car.pos.x, rz = pos.z - car.pos.z;
          if (Math.abs(rx) > 30 || Math.abs(rz) > 30) continue;
          const ahead = rx * car.fwdX + rz * car.fwdZ;
          const side = rx * -car.fwdZ + rz * car.fwdX; // (+ = to the car's left)
          const reach = 2 + car.speed * 0.75;
          if (ahead < -2.6 || ahead > reach || Math.abs(side) > 2.3) continue;
          if (Math.abs(side) < 1.5 && ahead < 2.4) {
            // Too close: a dive out of the way (and back up again)
            if (!pe.model.isDown) {
              pe.model.knockDown({ upIn: 1.3 });
              pe.knock = 2.3;
              pe.body.facing = Math.atan2(-car.fwdX, -car.fwdZ);
              audio.sfx('whoosh', { vol: 0.5 });
            }
            const across = -car.fwdZ * w.ix + car.fwdX * w.iz; // (how the pavement's "inwards" lines up with the car's left)
            pe.offTo = Math.abs(across) > 0.4 ? (side * across > 0 ? 2.7 - PED_IN : 0.35 - PED_IN) : pe.off;
            pe.dash = Math.abs(across) <= 0.4 ? Math.sign(side * (ux * -car.fwdZ + uz * car.fwdX) || 1) * 3 : 0;
            break;
          }
          if (pe.scare > 0) continue;
          // Which way across the pavement gets them further from the car's path?
          const across = -car.fwdZ * w.ix + car.fwdX * w.iz;
          const toWall = side + (2.7 - PED_IN - pe.off) * across, toKerb = side + (0.35 - PED_IN - pe.off) * across;
          if (Math.abs(across) > 0.4) {
            pe.offTo = Math.abs(toWall) >= Math.abs(toKerb) ? 2.7 - PED_IN : 0.35 - PED_IN;
            pe.dash = 0;
          } else {
            // Driving straight across the pavement at them: run along it instead
            // (driving along it, they flatten themselves against the wall or the kerb)
            pe.offTo = null;
            pe.dash = Math.sign(side * (ux * -car.fwdZ + uz * car.fwdX) || (Math.random() - 0.5)) * 3.5;
          }
          pe.model.flinch(car.pos.x, car.pos.z);
          pe.scare = 2.2;
          pe.pause = 1.6;
          break;
        }
        if (pe.pause > 0) {
          pe.pause -= dt;
          pe.body.horizontalSpeed = 0;
        } else {
          pe.t += pe.dir * pe.speed * dt;
          if (pe.t > w.len || pe.t < 0) {
            pe.t = Math.min(w.len, Math.max(0, pe.t));
            pe.dir = -pe.dir;
            pe.pause = 0.6 + Math.random() * 1.6;
          }
          pe.body.facing = Math.atan2(ux * pe.dir, uz * pe.dir);
          pe.body.horizontalSpeed = pe.speed;
        }
      }
      // The jump (fast), then they drift back to their line
      if (pe.offTo != null) {
        pe.off += (pe.offTo - pe.off) * Math.min(1, dt * 9);
        if (Math.abs(pe.offTo - pe.off) < 0.03 && !(pe.scare > 0)) pe.offTo = null;
      } else if (pe.off) pe.off *= Math.exp(-dt * 0.7);
      if (pe.dash) {
        const step = Math.sign(pe.dash) * Math.min(Math.abs(pe.dash), dt * 7);
        pe.t = Math.min(w.len, Math.max(0, pe.t + step));
        pe.dash -= step;
        if (Math.abs(pe.dash) < 0.01) pe.dash = 0;
      }
      this._posPerson(pe);
      const show = d < 95;
      pe.model.root.visible = show;
      if (show) pe.model.update(dt, pe.body);
    }
  }

  _updateProps(dt, player, movers) {
    let dirty = new Set();
    for (const pr of this.props) {
      if (pr.static) continue;
      if (!pr.flying && !pr.down) {
        // Hit by a car?
        for (const car of movers) {
          if (car.speed < 2.5) continue;
          if (Math.abs(car.pos.x - pr.x) > 6 || Math.abs(car.pos.z - pr.z) > 6) continue;
          const circles = car.spec.circles || [-1.2, 1.2];
          if (!circles.some((o) => Math.hypot(car.pos.x + car.fwdX * o - pr.x, car.pos.z + car.fwdZ * o - pr.z) < 1.1 + pr.r)) continue;
          // Off it goes, the way the car was going (and up)
          const k = pr.kind === 'bench' ? 0.6 : 0.9;
          pr.vx = car.vel.x * k + (Math.random() - 0.5) * 3;
          pr.vz = car.vel.z * k + (Math.random() - 0.5) * 3;
          pr.vy = 2.5 + Math.min(car.speed, 30) * 0.18;
          pr.spinV = (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 5);
          pr.tiltAxis = Math.atan2(pr.vz, pr.vx) + Math.PI / 2;
          pr.flying = true;
          car.vel.multiplyScalar(pr.kind === 'bench' ? 0.9 : 0.96);
          if (pr.kind === 'hydrant') pr.spray = 9;
          if (car === player) audio.sfx('clang', { vol: Math.min(1, 0.4 + car.speed / 30) });
          break;
        }
      }
      if (pr.flying) {
        pr.vy -= GRAVITY * dt;
        const nx = pr.x + pr.vx * dt, nz = pr.z + pr.vz * dt;
        // Bounce off walls
        if (this.city.world.query(nx - 0.2, 0.3, nz - 0.2, nx + 0.2, 1.5, nz + 0.2, _hits).length) {
          pr.vx *= -0.3;
          pr.vz *= -0.3;
        } else { pr.x = nx; pr.z = nz; }
        pr.y += pr.vy * dt;
        pr.tilt += pr.spinV * dt;
        const floor = this._floorAt(pr.x, pr.z);
        if (pr.y <= floor) {
          pr.y = floor;
          if (pr.vy < -4) { pr.vy *= -0.3; pr.vx *= 0.5; pr.vz *= 0.5; pr.spinV *= 0.4; } else {
            // Come to rest on its side (benches land upside down or upright)
            pr.flying = false;
            pr.down = true;
            pr.tilt = pr.kind === 'bench' ? (Math.abs(Math.sin(pr.tilt)) > 0.7 ? Math.PI : 0) : Math.PI / 2;
            pr.y = floor + (pr.kind === 'bench' ? (pr.tilt ? 0.85 : 0) : pr.r * 0.7);
            pr.downAt = 0;
          }
        }
        this._setMatrix(pr);
        dirty.add(pr.im);
      }
      // A knocked-over hydrant sprays a jet of water
      if (pr.spray > 0 && this.particles) {
        pr.spray -= dt;
        const [hx, hz] = pr.home;
        for (let i = 0; i < 2; i++) {
          this.particles.emit(hx + (Math.random() - 0.5) * 0.3, 0.3, hz + (Math.random() - 0.5) * 0.3, {
            vx: (Math.random() - 0.5) * 1.6, vy: 8 + Math.random() * 3, vz: (Math.random() - 0.5) * 1.6,
            size: 0.45, grow: 1.6, life: 1.0, alpha: 0.5, color: [0.78, 0.88, 1.0], drag: 1.1, fadeIn: 0.05 });
        }
      }
      // Put back once you're well away
      if (pr.down && (pr.downAt += dt) > 8 && Math.hypot(pr.home[0] - player.pos.x, pr.home[1] - player.pos.z) > 140) {
        this._resetProp(pr);
      }
    }
    for (const im of dirty) im.instanceMatrix.needsUpdate = true;
  }

  /** The ground height: the pavement is a little higher than the road. */
  _floorAt(x, z) {
    for (const k of this.city.kerbs) {
      const [ax, az] = k.a, [bx2, bz] = k.b;
      if (k.n[1] === -1 && x > ax && x < bx2 && z > az && z < az + this.city.sidewalk) return 0.15;
      if (k.n[1] === 1 && x > ax && x < bx2 && z < az && z > az - this.city.sidewalk) return 0.15;
      if (k.n[0] === -1 && z > az && z < bz && x > ax && x < ax + this.city.sidewalk) return 0.15;
      if (k.n[0] === 1 && z > az && z < bz && x < ax && x > ax - this.city.sidewalk) return 0.15;
    }
    return 0.02;
  }

  dispose() {
    for (const p of this.parked) this.scene.remove(p.mesh);
    this.parked = [];
    this.scene.remove(this.group);
    for (const im of Object.values(this.meshes)) im.geometry.dispose();
  }
}

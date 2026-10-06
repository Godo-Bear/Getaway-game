import * as THREE from 'three';
import { makeRng, formatTime } from '../../core/utils.js';
import { makeGlowMaterial } from '../../world/materials.js';
import { findClearRoofSpot } from '../../world/rooftopCity.js';
import { PlayerModel } from '../../player/playerModel.js';
import { randomPerson } from '../../player/people.js';
import { audio } from '../../core/audio.js';
import { save } from '../../core/save.js';
import { spend, cash } from '../../gadgets/gadgets.js';
import { addStat } from '../../core/stats.js';
import { showCard, hideCard } from '../../ui/menus.js';
import { freeEarn } from './freeRoam.js';

// Things to do in Free Run on foot:
//
//  - Jobs: three contacts stand round the city (a yellow "!" over their
//    heads). Walk up and press E for a job: a courier run, losing a tail, a
//    rooftop dash or a shop snatch, each against the clock. Cash when you
//    pull it off.
//  - Parkour challenges: three courses across the rooftops (cyan beams mark
//    the starts). Run into the start, then through every ring as fast as you
//    can. Your best run is saved, and next time its ghost races you.
//  - The shops: at a till, E opens the counter: buy something (a coffee to
//    run faster, a disguise, a burner phone to call off the police...), or
//    rob it.

/** A glowing marker: a ring on the ground and a beam of light. */
function marker(color, height = 40, radius = 1.2) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.8, radius, 32), makeGlowMaterial(color, 0.8));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.5, radius * 0.5, height, 12, 1, true), makeGlowMaterial(color, 0.12));
  beam.position.y = height / 2;
  g.add(ring, beam);
  g.userData.ring = ring;
  g.visible = false;
  return g;
}

/** A "!" over a contact's head. */
function bangSprite(color = '#ffd040') {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = color; g.beginPath(); g.arc(32, 32, 28, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#16141c'; g.font = 'bold 44px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('!', 32, 34);
  const tex = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, toneMapped: false }));
  sp.scale.setScalar(0.8);
  sp.renderOrder = 20;
  return sp;
}

const body = (pos) => ({ pos, vel: new THREE.Vector3(), facing: 0, state: 'ground', horizontalSpeed: 0, mantleProgress: 0, stateTime: 0, stumbleTimer: 0, mantle: null, wallRun: null });

// ======================================================================
//  Jobs
// ======================================================================
const JOBS = {
  courier: { name: 'Courier run', pay: 150 },
  tail: { name: 'Lose a tail', pay: 250 },
  dash: { name: 'Rooftop dash', pay: 180 },
  snatch: { name: 'Shop snatch', pay: 220 },
};
const ORDER = ['courier', 'snatch', 'dash', 'tail'];

export class FreeJobs {
  constructor(mode) {
    this.mode = mode;
    const city = mode.city;
    this.rng = makeRng(mode.map.foot.seed * 3 + 5);
    // Three contacts, spread round the middle of the city, on the pavements
    const walks = city.walks.filter((w) => Math.hypot(w.a[0], w.a[1]) < 160).sort(() => this.rng() - 0.5);
    this.contacts = [];
    for (const w of walks) {
      if (this.contacts.length >= 3) break;
      const pos = new THREE.Vector3((w.a[0] + w.b[0]) / 2, 0.05, (w.a[1] + w.b[1]) / 2);
      if (this.contacts.some((c) => c.pos.distanceTo(pos) < 90)) continue;
      const model = new PlayerModel(randomPerson(this.rng, { cold: !!mode.map.snow }), { bag: true });
      const b = body(pos.clone());
      b.facing = this.rng() * Math.PI * 2;
      const bang = bangSprite();
      bang.position.set(pos.x, 2.5, pos.z);
      const beam = marker(0xffb020, 14, 0.7);
      beam.position.copy(pos);
      beam.visible = true;
      city.group.add(model.root, bang, beam);
      this.contacts.push({ pos, model, body: b, bang, beam });
    }
    this.beacon = marker(0xffb020);
    city.group.add(this.beacon);
    this.job = null;
    this.next = 0;
  }

  /** The action label when you're next to a contact (or null). */
  nearContact(p) {
    if (this.job || this.mode.challenges?.run) return null;
    return this.contacts.find((c) => Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z) < 2.2 && Math.abs(p.pos.y - c.pos.y) < 1.5) || null;
  }

  /** A random roof spot (or, in Frostvale, a pavement spot) min..max m from `from`. */
  _spot(from, min, max) {
    const city = this.mode.city, rng = this.rng;
    for (let tries = 0; tries < 40; tries++) {
      if (!city.groundLevel && tries < 30) {
        const b = city.buildings[Math.floor(rng() * city.buildings.length)];
        if (b.tower || b.h < 4) continue;
        const d = Math.hypot((b.minX + b.maxX) / 2 - from.x, (b.minZ + b.maxZ) / 2 - from.z);
        if (d < min || d > max) continue;
        const sp = findClearRoofSpot(city.world, b, rng);
        if (sp) return sp;
      } else {
        const w = city.walks[Math.floor(rng() * city.walks.length)], t = rng();
        const v = new THREE.Vector3(w.a[0] + (w.b[0] - w.a[0]) * t, 0.05, w.a[1] + (w.b[1] - w.a[1]) * t);
        const d = v.distanceTo(from);
        if (d >= min && d <= max) return v;
      }
    }
    return from.clone().add(new THREE.Vector3(min, 0, 0));
  }

  start(contact) {
    const m = this.mode, s = m.state, p = s.player.pos;
    const kind = ORDER[this.next++ % ORDER.length];
    const job = { kind, t: 0, pay: JOBS[kind].pay * (m.police ? 2 : 1) };
    if (kind === 'courier') {
      job.pick = this._spot(p, 50, 130);
      job.drop = this._spot(job.pick, 90, 200);
      job.stage = 'pick';
      job.time = (p.distanceTo(job.pick) + job.pick.distanceTo(job.drop)) / 4 + 40;
    } else if (kind === 'tail') {
      m.heat = Math.max(m.heat, 3);
      m.calm = 0;
      m.officers.alert(15);
      job.time = 150;
    } else if (kind === 'dash') {
      job.points = [];
      let at = p;
      for (let i = 0; i < 3; i++) { at = this._spot(at, 35, 80); job.points.push(at); }
      job.i = 0;
      job.time = 30 + job.points.reduce((d, q, i) => d + q.distanceTo(i ? job.points[i - 1] : p), 0) / 3.6;
    } else {
      const shops = (m.city.shops || []).filter((sh) => !sh.robbed && sh.door.distanceTo(p) > 60 && sh.door.distanceTo(p) < 200);
      job.shop = shops[Math.floor(this.rng() * shops.length)] || m.city.shops.find((sh) => !sh.robbed);
      job.stage = 'rob';
      job.time = 150;
    }
    this.job = job;
    audio.sfx('checkpoint', { vol: 0.7 });
    const how = {
      courier: 'Pick up the package (the orange beam), then drop it off before the time runs out.',
      tail: 'The police are onto you: three stars. Lose them all before time runs out.',
      dash: 'Reach the three rooftop markers in time.',
      snatch: `Rob the till at the ${job.shop?.name || 'shop'} (the orange beam), then get to the drop-off.`,
    }[kind];
    s.game.hud.toast(`Job: ${JOBS[kind].name}  ($${job.pay})`, how, '#ffb020', 5);
  }

  /** The till at this shop was robbed (the snatch job wants to know). */
  onRob(shop) {
    const j = this.job;
    if (j?.kind === 'snatch' && j.stage === 'rob' && shop === j.shop) {
      j.stage = 'drop';
      j.drop = this._spot(shop.door, 70, 150);
      this.mode.state.game.hud.toast('Got it!', 'Now get to the drop-off.', '#ffb020', 2.5);
    }
  }

  /** Caught by the police: the job's off. */
  fail(why = 'Caught! The job\'s off.') {
    if (!this.job) return;
    this.job = null;
    this.beacon.visible = false;
    audio.sfx('caught', { vol: 0.5 });
    this.mode.state.game.hud.toast('Job failed', why, 'var(--red)', 3);
  }

  _done() {
    const j = this.job, m = this.mode;
    this.job = null;
    this.beacon.visible = false;
    freeEarn(m.state.game, j.pay, `${JOBS[j.kind].name} done!`, 'Talk to a contact (yellow "!") for another job.');
    audio.sfx('win', { vol: 0.6 });
    addStat(m.state.game, 'missions');
  }

  /** Returns where to point the marker ({ pos, label }) or null. */
  update(dt) {
    const m = this.mode, s = m.state, p = s.player.pos;
    for (const c of this.contacts) {
      const near = Math.hypot(c.pos.x - p.x, c.pos.z - p.z);
      c.model.root.visible = near < 120;
      c.bang.visible = c.beam.visible = !this.job && near < 160;
      c.bang.position.y = 2.5 + Math.sin(performance.now() / 300) * 0.08;
      if (near < 120) {
        if (near < 8) c.body.facing = Math.atan2(p.x - c.pos.x, p.z - c.pos.z);
        c.model.update(dt, c.body);
      }
    }
    const j = this.job;
    if (!j) return null;
    j.t += dt;
    if (j.t > j.time) { this.fail('Out of time.'); return null; }
    const at = (q, r = 2.2) => Math.hypot(q.x - p.x, q.z - p.z) < r && Math.abs(q.y - p.y) < 2;
    let target = null, label = '';
    if (j.kind === 'courier') {
      if (j.stage === 'pick') { target = j.pick; label = 'Package'; if (at(j.pick)) { j.stage = 'drop'; audio.sfx('cash', { vol: 0.5 }); s.game.hud.toast('Got the package', 'Now the drop-off!', '#ffb020', 2); } }
      else { target = j.drop; label = 'Drop-off'; if (at(j.drop)) this._done(); }
    } else if (j.kind === 'tail') {
      if (m.heat <= 0 && j.t > 3) this._done();
    } else if (j.kind === 'dash') {
      target = j.points[j.i]; label = `Marker ${j.i + 1}/3`;
      if (at(target)) { audio.sfx('checkpoint', { vol: 0.6 }); if (++j.i >= 3) this._done(); }
    } else if (j.stage === 'rob') { target = j.shop.door; label = j.shop.name; }
    else { target = j.drop; label = 'Drop-off'; if (at(j.drop)) this._done(); }
    if (this.job && target) { this.beacon.position.copy(target); this.beacon.visible = true; this.beacon.userData.ring.rotation.z += dt; }
    else this.beacon.visible = false;
    return this.job ? { pos: target, label, left: j.time - j.t, name: JOBS[j.kind].name } : null;
  }

  dispose() {
    for (const c of this.contacts) { c.model.root.parent?.remove(c.model.root); c.bang.parent?.remove(c.bang); c.beam.parent?.remove(c.beam); }
    this.beacon.parent?.remove(this.beacon);
  }
}

// ======================================================================
//  Parkour challenges (with ghosts)
// ======================================================================
const COURSE_NAMES = ['Block Hopper', 'High Line', 'Gap Runner'];

export class Challenges {
  constructor(mode) {
    this.mode = mode;
    const city = mode.city, rng = makeRng(mode.map.foot.seed * 7 + 1);
    this.courses = [];
    const half = ((city.blockCenters.length - 1) / 2) * city.pitch;
    if (!city.groundLevel) {
      // Round the roofs of an apartment block near the middle: hop from roof to roof
      const blocks = Object.entries(city.blockKinds).filter(([, k]) => k === 'apartments')
        .map(([key]) => key.split(',').map(Number)).map(([i, j]) => ({ cx: i * city.pitch - half, cz: j * city.pitch - half }))
        .sort((a, b) => Math.hypot(a.cx, a.cz) - Math.hypot(b.cx, b.cz));
      for (const bl of blocks) {
        if (this.courses.length >= 3) break;
        if (this.courses.some((c) => Math.hypot(c.cx - bl.cx, c.cz - bl.cz) < 60)) continue;
        const bs = city.buildings.filter((b) => !b.tower && !b.shop && Math.abs((b.minX + b.maxX) / 2 - bl.cx) < 21 && Math.abs((b.minZ + b.maxZ) / 2 - bl.cz) < 21)
          .sort((a, b) => Math.atan2((a.minZ + a.maxZ) / 2 - bl.cz, (a.minX + a.maxX) / 2 - bl.cx) - Math.atan2((b.minZ + b.maxZ) / 2 - bl.cz, (b.minX + b.maxX) / 2 - bl.cx));
        const pts = bs.map((b) => findClearRoofSpot(city.world, b, rng)).filter(Boolean);
        if (pts.length < 4) continue;
        pts.push(pts[0].clone()); // (back where you started: a lap)
        this.courses.push({ cx: bl.cx, cz: bl.cz, pts });
      }
    } else {
      // Frostvale: a sprint round the streets of a block
      for (let k = 0; k < 3; k++) {
        const i = [1, 3, 2][k], j = [2, 2, 4][k];
        const cx = i * city.pitch - half, cz = j * city.pitch - half, r = 22.5;
        const pts = [[-r, -r], [r, -r], [r, r], [-r, r], [-r, -r]].map(([x, z]) => new THREE.Vector3(cx + x, 0.05, cz + z));
        this.courses.push({ cx, cz, pts });
      }
    }
    this.courses.forEach((c, i) => {
      c.id = `${mode.map.id}:${i}`;
      c.name = COURSE_NAMES[i] || `Course ${i + 1}`;
      c.start = marker(0x39e6ff, 30, 1.4);
      c.start.position.copy(c.pts[0]);
      city.group.add(c.start);
    });
    this.ring = marker(0x39e6ff, 8, 1.6);
    city.group.add(this.ring);
    this.run = null;
    this.ghost = null;
  }

  best(c) { return save.data.challenges?.[c.id] || null; }

  _ghostModel() {
    if (this.ghost) return this.ghost;
    const model = new PlayerModel(randomPerson(makeRng(5)), { bag: false });
    model.root.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      o.material.transparent = true;
      o.material.opacity = 0.35;
      o.material.depthWrite = false;
      o.material.color?.lerp(new THREE.Color(0x39e6ff), 0.6);
    });
    this.mode.city.group.add(model.root);
    this.ghost = { model, body: body(new THREE.Vector3()) };
    return this.ghost;
  }

  /** Returns { pos, label } for the marker while racing, or null. */
  update(dt) {
    const m = this.mode, s = m.state, p = s.player, hud = s.game.hud;
    const r = this.run;
    for (const c of this.courses) {
      const d = Math.hypot(c.pts[0].x - p.pos.x, c.pts[0].z - p.pos.z);
      c.start.visible = !r && d < 200;
      c.start.userData.ring.rotation.z += dt;
      // Run into a start marker: off you go (once you've stepped away after a run)
      if (!r && d > 4) c.armed = true;
      if (!r && c.armed !== false && !m.jobs?.job && d < 1.8 && Math.abs(c.pts[0].y - p.pos.y) < 2) {
        c.armed = false;
        this.run = { c, i: 1, t: 0, rec: [], recT: 0 };
        const b = this.best(c);
        audio.sfx('checkpoint');
        hud.toast(`${c.name}: GO!`, b ? `Beat your best: ${formatTime(b.t)} (that's your ghost).` : 'Through every ring as fast as you can.', '#39e6ff', 3);
        return null;
      }
    }
    if (!r) { if (this.ghost) this.ghost.model.root.visible = false; return null; }
    r.t += dt;
    // Record this run (10 times a second) for its ghost
    r.recT -= dt;
    if (r.recT <= 0) { r.recT = 0.1; r.rec.push([+p.pos.x.toFixed(2), +p.pos.y.toFixed(2), +p.pos.z.toFixed(2), +p.facing.toFixed(2)]); }
    // The ghost of your best run
    const best = this.best(r.c);
    if (best?.ghost?.length) {
      const g = this._ghostModel(), k = Math.min(best.ghost.length - 1.001, r.t / 0.1), a = best.ghost[Math.floor(k)], b = best.ghost[Math.ceil(k)], f = k - Math.floor(k);
      const prev = g.body.pos.clone();
      g.body.pos.set(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f);
      g.body.facing = a[3];
      g.body.horizontalSpeed = Math.min(9, Math.hypot(g.body.pos.x - prev.x, g.body.pos.z - prev.z) / Math.max(dt, 1e-3));
      g.model.root.visible = r.t < best.t + 1;
      g.model.update(dt, g.body);
    }
    const next = r.c.pts[r.i];
    this.ring.position.copy(next);
    this.ring.visible = true;
    this.ring.userData.ring.rotation.z -= dt * 2;
    if (Math.hypot(next.x - p.pos.x, next.z - p.pos.z) < 2.6 && Math.abs(next.y - p.pos.y) < 2.5) {
      audio.sfx('checkpoint', { vol: 0.6 });
      if (++r.i >= r.c.pts.length) this._finish();
      return null;
    }
    if (Math.hypot(next.x - p.pos.x, next.z - p.pos.z) > 90 || r.t > 300) {
      this.run = null;
      this.ring.visible = false;
      hud.toast('Challenge abandoned', 'Run back into the start marker to try again.', 'var(--red)', 2.5);
      return null;
    }
    return { pos: next, label: `Ring ${r.i}/${r.c.pts.length - 1}`, t: r.t, best: best?.t ?? null, name: r.c.name };
  }

  _finish() {
    const r = this.run, s = this.mode.state, old = this.best(r.c);
    this.run = null;
    this.ring.visible = false;
    if (this.ghost) this.ghost.model.root.visible = false;
    addStat(s.game, 'challenges');
    const record = !old || r.t < old.t;
    if (record) {
      (save.data.challenges ||= {})[r.c.id] = { t: +r.t.toFixed(2), ghost: r.rec };
      save.write();
      if (old) addStat(s.game, 'records');
    }
    freeEarn(s.game, record ? (old ? 200 : 120) : 60, `${r.c.name}: ${formatTime(r.t)}${record ? (old ? '  NEW RECORD!' : '') : ''}`, record ? (old ? `Your old best was ${formatTime(old.t)}.` : 'Run it again to race your ghost.') : `Your best is ${formatTime(old.t)}.`);
    audio.sfx(record ? 'win' : 'checkpoint');
  }

  dispose() {
    for (const c of this.courses) c.start.parent?.remove(c.start);
    this.ring.parent?.remove(this.ring);
    if (this.ghost) this.ghost.model.root.parent?.remove(this.ghost.model.root);
  }
}

// ======================================================================
//  Shopping
// ======================================================================
const GOODS = {
  grocer: [['energy', 'Energy drink', 15, 'Run faster for a minute'], ['gum', 'Pack of gum', 5, 'Just gum. Minty.']],
  cafe: [['coffee', 'Espresso', 12, 'Run faster for a minute'], ['cake', 'Slice of cake', 8, 'Delicious. Does nothing.']],
  clothes: [['disguise', 'Hoodie and cap', 120, 'A new look: two stars off your wanted level, and they lose you']],
  tech: [['burner', 'Burner phone', 200, 'Call in a fake tip across town: one star off your wanted level'], ['scanner', 'Tag finder app', 250, 'Shows the crew tags on your minimap (this session)']],
  pawn: [['charm', 'Lucky charm', 150, 'Cash bags pay double (this session)'], ['watch', 'Gold watch', 90, 'Shiny. Does nothing.']],
};

/**
 * The shop counter (E at a till): buy something, or rob the till. The game
 * waits while it's open.
 */
export function openCounter(mode, shop) {
  const s = mode.state;
  s.inCard = true;
  s.game.input.exitPointerLock();
  const close = () => { hideCard(); s.inCard = false; s._afterResume?.(); };
  const goods = GOODS[shop.kind] || [];
  showCard(`<p class="sub kicker">${shop.name}</p><h2>At the counter</h2><p class="sub">You've got <b>$${cash().toLocaleString('en-US')}</b>.</p>`, [
    ...goods.map(([id, name, price, what]) => ({
      label: `${name} · $${price}`, sub: what,
      onClick: () => {
        if (!spend(price)) { s.game.hud.toast('Not enough cash', '', 'var(--red)', 2); return; }
        close();
        addStat(s.game, 'buys');
        audio.sfx('cash', { vol: 0.5 });
        mode.onBuy(id, name);
      },
    })),
    ...(shop.robbed ? [] : [{ label: 'Rob the till', sub: 'Cash, but the alarm goes off and the police come', onClick: () => { close(); mode._robTill(shop); } }]),
    { label: 'Leave', primary: true, onClick: close },
  ]);
}

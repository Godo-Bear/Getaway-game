import * as THREE from 'three';
import { PrisonMode } from './prisonMode.js';
import { MiniGame } from '../../ui/miniGame.js';
import { showCard, hideCard } from '../../ui/menus.js';
import { leaveJail } from '../../core/jail.js';
import { diff } from '../../core/difficulty.js';
import { audio } from '../../core/audio.js';
import { JUMPSUIT_LOOK, GUARD_LOOK } from '../../player/people.js';
import { PlayerModel } from '../../player/playerModel.js';
import { makeTextTexture } from '../../world/materials.js';
import { formatTime } from '../../core/utils.js';

// Jail: you were caught three times, and now you're in a cell on Blackwater
// (the island prison). You pick how you break out:
//
//  THE TUNNEL  - dig through the floor under your bunk (hold Jump / E), but
//                only while the night guard isn't walking past your cell: if
//                he sees you digging, he kicks the dirt back in. Then crawl
//                out through a drain in the yard and sneak to the coal wagon
//                of the supply train by the rail gate. No alarm.
//  THE LAUNDRY - pick the lock quietly (no alarm, so the corridor lasers stay
//                on: get past them). In the yard grab a laundry sack from a
//                cart: carrying it you look like laundry duty (guards only
//                notice you close up, if you walk), but you're slow and can't
//                climb. Get it into the laundry truck before it leaves.
//  THE CREW    - pick the lock and the alarm goes: the lasers lose power, a
//                lockdown countdown starts, and Mags is waiting with a boat at
//                the end of a zip line over the east wall.
// Getting caught in here sends you back a step (it doesn't count). Then
// you're back where you were caught. It's the Chapter 7 prison (PrisonMode).

const LOCK = new THREE.Vector3(12, 0, -31.9);   // inside your cell, by the door
const DIG = new THREE.Vector3(9.6, 0, -38.2);   // under your bunk
const DRAIN = new THREE.Vector3(-40.5, 0, 6);   // where the tunnel comes up (the yard's west side)
const WAGON = new THREE.Vector3(-30, 0, 29);    // the coal wagon at the rail gate
const TRUCK = new THREE.Vector3(5, 0, 36.5);    // the laundry truck, by the bus
const CARTS = [[-4, 24], [0, 24], [10, -2], [-26, 18]].map(([x, z]) => new THREE.Vector3(x, 0, z));
const DIG_TIME = 14;      // seconds of digging
const TRUCK_TIME = 170;   // the laundry truck leaves (x difficulty)

const PLANS = {
  tunnel: { name: 'The Tunnel', icon: '⛏', sub: 'Dig out under your bunk while the night guard isn\'t looking, then sneak across the yard to the supply train. Quiet: no alarm.' },
  laundry: { name: 'The Laundry Run', icon: '🧺', sub: 'Pick the lock quietly (the lasers stay on), grab a laundry sack as a disguise, and hide in the laundry truck before it leaves.' },
  crew: { name: 'The Crew', icon: '⚓', sub: 'Pick the lock and run for it: the alarm goes, the lasers die, and Mags waits with a boat at the end of a zip line over the east wall.' },
};

export class JailMode extends PrisonMode {
  constructor(state, params) {
    super(state, { chapterId: 'chapter7', part: 0 });
    this.isJail = true;
    this.stage = 'dblock';
    this.chapter = { id: 'jail', title: 'Jail' };
    this.part = { title: 'Break out', objective: 'Pick your way out' };
    this.partIndex = 0;
    this.plan = params?.plan || null;
  }

  build() {
    const L = super.build();
    const V = (x, z) => new THREE.Vector3(x, 0.05, z);
    this.cpSets = {
      tunnel: [{ name: 'Your cell', spawn: V(12, -36), yaw: Math.PI }, { name: 'The drain', spawn: V(DRAIN.x + 1.5, DRAIN.z), yaw: -Math.PI / 2 }],
      laundry: [{ name: 'Your cell', spawn: V(12, -36), yaw: Math.PI }, { name: 'Outside D Block', spawn: V(0, -19), yaw: Math.PI / 2 }],
      crew: [{ name: 'Your cell', spawn: V(12, -36), yaw: Math.PI }, { name: 'Outside D Block', spawn: V(0, -19), yaw: Math.PI / 2 }, { name: 'The east wall stairs', spawn: V(40, 0), yaw: 0 }],
    };
    L.checkpoints = this.cpSets.crew;
    L.spawn = L.checkpoints[0].spawn.clone();
    L.spawn.yaw = Math.PI;
    this.ricky.root.visible = false;
    // The night guard who walks the D Block corridor (the Tunnel)
    this.nightGuard = new PlayerModel({ ...GUARD_LOOK, hoodie: 0x24324a, trousers: 0x1a2130, hat: 0x1a2130 }, { bag: false });
    this.ngBody = { pos: new THREE.Vector3(-20, 0, -27), vel: new THREE.Vector3(), facing: Math.PI / 2, state: 'ground', horizontalSpeed: 2, mantleProgress: 0, stateTime: 0, stumbleTimer: 0, mantle: null, wallRun: null };
    this.nightGuard.root.visible = false;
    L.group.add(this.nightGuard.root);
    // The hole under your bunk, a drain in the yard, a laundry truck by the bus
    this.hole = new THREE.Mesh(new THREE.CircleGeometry(0.7, 18), new THREE.MeshBasicMaterial({ color: 0x0a0806 }));
    this.hole.rotation.x = -Math.PI / 2;
    this.hole.position.set(DIG.x, 0.03, DIG.z);
    this.hole.scale.setScalar(0.01);
    L.group.add(this.hole);
    const grate = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), new THREE.MeshLambertMaterial({ color: 0x2a2c30 }));
    grate.rotation.x = -Math.PI / 2;
    grate.position.set(DRAIN.x, 0.03, DRAIN.z);
    L.group.add(grate);
    const truck = new THREE.Group();
    const white = new THREE.MeshLambertMaterial({ color: 0xe8e6e0 }), dark = new THREE.MeshLambertMaterial({ color: 0x2a2c30 });
    const tb = (sx, sy, sz, x, y, z, m) => { const k = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m); k.position.set(x, y, z); k.castShadow = true; truck.add(k); };
    tb(6.5, 2.8, 2.5, 0, 1.9, 0, white); tb(2, 2, 2.4, 4.2, 1.4, 0, white); tb(0.05, 1.8, 2.2, -3.27, 1.9, 0, dark);
    for (const [x, z] of [[-2.2, 1.2], [-2.2, -1.2], [3.8, 1.2], [3.8, -1.2]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.3, 12), dark); w.rotation.x = Math.PI / 2; w.position.set(x, 0.45, z); truck.add(w); }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(5, 0.8), new THREE.MeshBasicMaterial({ map: makeTextTexture('ISLAND LAUNDRY', { color: '#1a5a9a', bg: '#e8e6e0', width: 1024, height: 160 }), toneMapped: false }));
    sign.position.set(0, 2.4, -1.27); sign.rotation.y = Math.PI; truck.add(sign);
    truck.position.set(TRUCK.x + 1.5, 0, TRUCK.z);
    truck.visible = false;
    L.group.add(truck);
    this.truckBox = L.world.addBlock(TRUCK.x + 1.5, 0, TRUCK.z, 6.5, 2.8, 2.5, { tag: 'truck' });
    this.truck = truck;
    return L;
  }

  start() {
    const s = this.state, L = this.level;
    this.stage = 'dblock';
    const keep = s.game.chapterRun; // (don't lose the story chapter you were caught in)
    super.start(false);
    s.game.chapterRun = keep;
    this.run = { caught: 0, flags: {} };
    this.cp = 0;
    this.dug = 0;
    this.sack = null;
    this.truckLeft = null;
    this.lasersStayOn = false;
    // The way out of D Block is open from inside; your cell isn't
    L.dbDoorBox.disabled = true;
    L.dbDoor.userData.open = true;
    L.dbDoor.position.x = 3.9;
    L.reader.material.emissive.setHex(0x30ff70);
    this.keycard = true;
    this.keycardMesh.visible = false;
    this.ricky.root.visible = false;
    s.placePlayer(L.checkpoints[0].spawn, Math.PI);
    const hud = s.game.hud;
    hud.setPhase('Jail · Blackwater');
    hud.setObjective('Pick your way out');
    if (this.plan) this._setPlan(this.plan);
    else this._choosePlan();
  }

  /** How do you want to get out? */
  _choosePlan() {
    const s = this.state;
    s.inCard = true;
    s.game.input.exitPointerLock?.();
    showCard('<p class="sub kicker">Jail · Blackwater</p><h2>Plan your breakout</h2><p class="sub">Caught three times, and they brought you to the island prison. Your cellmate has three ideas:</p>',
      Object.entries(PLANS).map(([id, p]) => ({ label: `${p.icon} ${p.name}`, sub: p.sub, onClick: () => { hideCard(); s.inCard = false; this._setPlan(id); s._afterResume?.(); } })));
  }

  _setPlan(id) {
    const s = this.state, L = this.level, hud = s.game.hud;
    this.plan = id;
    L.checkpoints = this.cpSets[id];
    this.lasersStayOn = id === 'laundry';
    this.nightGuard.root.visible = id === 'tunnel';
    this.truck.visible = id === 'laundry';
    this.truckBox.disabled = id !== 'laundry';
    if (id === 'tunnel') {
      this.stage = 'cell';
      hud.setObjective('Dig under your bunk (when the guard isn\'t looking)');
      hud.toast('The Tunnel', 'Stand on the dark patch under your bunk and hold Jump (or E) to dig. The night guard walks the corridor: stop digging when he passes your cell, or he\'ll kick the dirt back in.', 'var(--amber)', 8);
    } else if (id === 'laundry') {
      hud.setObjective('Pick your cell lock (quietly)');
      hud.toast('The Laundry Run', 'Pick your cell lock quietly: no alarm, so the corridor lasers stay on. Then grab a laundry sack from a cart in the yard and hide in the laundry truck by the bus before it leaves.', 'var(--amber)', 8);
    } else {
      hud.setObjective('Pick the lock on your cell door');
      hud.toast('The Crew', 'Pick your cell lock: the alarm goes, the lasers lose power, and you\'ve got until lockdown to get over the east wall and down Mags\'s zip line.', 'var(--amber)', 8);
    }
  }

  _caught(title, msg) {
    // (being caught in here sends you back a step, but doesn't count)
    if (this.disguised && !this.sack) { this._setDisguise(false); msg += ' (They took the uniform.)'; }
    if (this.sack) { this._dropSack(); msg += ' They took the laundry sack.'; }
    audio.sfx('caught');
    if (this.alarm) this.lockdown = 150 * diff().timer;
    if (this.truckLeft != null) this.truckLeft = TRUCK_TIME * diff().timer;
    this._toCheckpoint(title, msg);
  }

  update(dt) {
    if (this.done || !this.plan) { if (!this.plan) this.state.game.hud.setMarker(null); return; }
    const s = this.state, p = s.player, pos = p.pos, input = s.game.input, hud = s.game.hud;
    // --- The Tunnel: digging, and the night guard
    if (this.plan === 'tunnel' && this.stage === 'cell') { this._dig(dt); return; }
    // --- Your cell's lock (from inside, at the door)
    if (!this.freed && !this.mini) {
      const at = Math.hypot(pos.x - LOCK.x, pos.z - LOCK.z) < 1.7;
      if (!at) this.miniBlocked = false;
      else if (!this.miniBlocked) this.mini = new MiniGame({ type: this.plan === 'laundry' ? 'safe' : 'hack', title: this.plan === 'laundry' ? 'Picking the lock (quietly)' : 'Picking the lock', hint: 'Jump (Space / A / tap) when it lines up · C to step away' });
    }
    if (this.mini && !this.freed) {
      if (input.wasPressed('crouch')) { this._closeMini(); this.miniBlocked = true; }
      else {
        const r = this.mini.update(dt, input.wasPressed('jump'));
        if (r === 'done') { this._closeMini(); this._freeRicky(); }
      }
      this._updateMarker(pos);
      return;
    }
    // --- The Laundry Run: a sack from a cart, then the truck (before it leaves)
    if (this.plan === 'laundry' && this.stage === 'yard2') {
      if (this.sack) { this.disguised = true; p.speedScale *= 0.75; }
      if (!this.sack && CARTS.some((c) => Math.hypot(c.x - pos.x, c.z - pos.z) < 1.9)) this._takeSack();
      if (Math.hypot(TRUCK.x - pos.x, TRUCK.z - pos.z) < 3.4) {
        if (this.sack) { this._escape(); return; }
        if ((this.warnT -= dt) <= 0) { this.warnT = 4; hud.toast('Not like that', 'You\'ll be spotted climbing in. Grab a laundry sack from a cart first: then you\'re just laundry duty.', 'var(--amber)'); }
      }
      this.truckLeft -= dt;
      if (this.truckLeft <= 0) { this._caught('The truck left', 'Too slow: the laundry truck drove off without you. It\'s back for the next load.'); return; }
    }
    // --- The Tunnel, part two: across the yard to the coal wagon
    if (this.plan === 'tunnel' && this.stage === 'yard2' && Math.hypot(WAGON.x - pos.x, WAGON.z - pos.z) < 3.2) { this._escape(); return; }
    super.update(dt);
    if (this.plan === 'crew' && this.stage === 'lockdown' && this.cp < 2 && pos.x > 38) this.cp = 2;
    if (this.plan === 'laundry' && this.stage === 'yard2' && !this.done) {
      hud.setStats(`<span>Time <b>${formatTime(s.time)}</b></span><span class="${this.truckLeft < 30 ? 'warn' : ''}">Truck leaves in <b>${formatTime(Math.max(0, this.truckLeft))}</b></span>` + (this.sack ? '<span><b style="color:#8ab4ff">LAUNDRY DUTY</b></span>' : ''));
    }
  }

  /** Dig while the night guard isn't passing your cell. */
  _dig(dt) {
    const s = this.state, p = s.player, input = s.game.input, hud = s.game.hud;
    // The night guard: up and down the corridor
    const b = this.ngBody;
    this.ngDir ||= 1;
    b.pos.x += this.ngDir * 2.1 * dt;
    if (b.pos.x > 22 || b.pos.x < -22) { this.ngDir *= -1; b.pos.x = Math.max(-22, Math.min(22, b.pos.x)); }
    b.facing = this.ngDir > 0 ? Math.PI / 2 : -Math.PI / 2;
    b.horizontalSpeed = 2.1;
    this.nightGuard.update(dt, b);
    const watching = Math.abs(b.pos.x - LOCK.x) < 6.5;
    const comingIn = !watching && Math.abs(b.pos.x - LOCK.x) < 12 && Math.sign(LOCK.x - b.pos.x) === this.ngDir;
    // Digging: on the spot, holding Jump or E
    const onSpot = Math.hypot(p.pos.x - DIG.x, p.pos.z - DIG.z) < 1.3;
    const digging = onSpot && (input.isDown('jump') || input.isDown('interact'));
    if (digging && watching) {
      this.dug = Math.max(0, this.dug - 0.45);
      this.hole.scale.setScalar(Math.max(0.01, this.dug));
      audio.sfx('caught');
      s.flash('Caught digging!', 'The guard saw you and kicked the dirt back in. Wait until he\'s walked past.', 'var(--red)');
      s.placePlayer(this.cpSets.tunnel[0].spawn, Math.PI);
      return;
    }
    if (digging) {
      this.dug = Math.min(1, this.dug + dt / (DIG_TIME * diff().timer));
      this.hole.scale.setScalar(Math.max(0.01, this.dug));
      if (Math.random() < dt * 8) s.particles?.emit?.(DIG.x, 0.3, DIG.z, { vx: (Math.random() - 0.5) * 2, vy: 1.5, vz: (Math.random() - 0.5) * 2, size: 0.25, grow: 0, life: 0.6, alpha: 1, color: [0.35, 0.28, 0.2] });
    }
    hud.setMeter(this.dug, watching ? 'GUARD! Stop digging!' : comingIn ? 'Guard coming...' : onSpot ? 'Digging (hold Jump / E)' : 'The tunnel', watching ? 'var(--red)' : comingIn ? 'var(--amber)' : '#c8a46a');
    s.setAction(onSpot && !watching ? 'Dig (hold)' : null);
    if (this.dug >= 1) {
      // Through! Out of the drain in the yard
      this.stage = 'yard2';
      this.freed = true;
      this.cp = 1;
      this.nightGuard.root.visible = false;
      hud.setMeter(0, '');
      s.setAction(null);
      audio.sfx('whoosh', { vol: 1 });
      s.placePlayer(this.cpSets.tunnel[1].spawn, -Math.PI / 2);
      s.flash('Through!', 'You crawl along an old drain and push up a grate in the yard. Now to the supply train\'s coal wagon by the rail gate: no alarm, so keep it that way.', 'var(--safe)');
      hud.setObjective('Sneak to the coal wagon by the rail gate');
    }
    this._updateMarker(p.pos);
  }

  _takeSack() {
    const s = this.state;
    const sack = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), new THREE.MeshLambertMaterial({ color: 0xd8dce4 }));
    sack.scale.set(1, 1.2, 0.9);
    sack.position.set(0, 1.55, -0.35);
    s.model.root.add(sack);
    this.sack = sack;
    s.player.noClimb = true;
    audio.sfx('click', { vol: 0.7 });
    s.game.hud.toast('Laundry duty', 'With a sack of sheets on your back nobody looks twice (walk, don\'t run: close up they\'ll still notice). You\'re slower and you can\'t climb. Get it into the truck by the bus!', '#8ab4ff', 5);
  }

  _dropSack() {
    if (!this.sack) return;
    this.state.model.root.remove(this.sack);
    this.sack = null;
    this.disguised = false;
    this.state.player.noClimb = false;
  }

  // (opening your own cell)
  _freeRicky() {
    const s = this.state, L = this.level, hud = s.game.hud;
    this.freed = true;
    L.cellDoorBox.disabled = true;
    L.cellDoor.position.x = 12 - 2.1;
    L.keypad.material.emissive.setHex(0x30ff70);
    audio.sfx('door');
    if (this.plan === 'crew') {
      this.alarm = true;
      this.lockdown = 150 * diff().timer;
      s.player.zipLines = [L.zip];
      audio.sfx('sting');
      hud.setObjective('Get out of D Block, then over the east wall');
      hud.toast('The door\'s open!', 'And the alarm\'s going: the lasers are off, but you\'ve got until the lockdown. Out of D Block, then up the east wall stairs to the zip line.', 'var(--red)', 6);
    } else {
      hud.setObjective('Out of D Block, past the lasers');
      hud.toast('Click.', 'The door swings open without a sound. No alarm, so the corridor lasers are still on: watch them, crouch under the low ones.', 'var(--safe)', 5);
    }
  }

  _updateRicky() {}

  // (in a prison jumpsuit, unless you've got the guard uniform on)
  _setDisguise(on) {
    super._setDisguise(on);
    if (!on) this.state.model?.setOutfit({ hoodie: JUMPSUIT_LOOK.hoodie, trousers: JUMPSUIT_LOOK.trousers, style: { top: 'jumpsuit' } });
  }

  _updateMarker(pos) {
    const s = this.state, hud = s.game.hud, S = this.level.spots;
    let t, label, color = 'var(--cyan)';
    if (!this.plan) { hud.setMarker(null); return; }
    if (this.plan === 'tunnel' && this.stage === 'cell') { t = DIG; label = 'Dig here'; color = '#c8a46a'; }
    else if (this.plan === 'tunnel') { t = WAGON; label = 'The coal wagon'; color = 'var(--safe)'; }
    else if (!this.freed) { t = LOCK; label = 'Your cell door'; color = 'var(--amber)'; }
    else if (this.stage === 'dblock') { t = new THREE.Vector3(0, 0, -21); label = 'Way out'; color = 'var(--amber)'; }
    else if (this.plan === 'laundry') {
      if (this.sack) { t = TRUCK; label = 'The laundry truck'; color = 'var(--safe)'; }
      else { t = CARTS.slice().sort((a, b) => a.distanceTo(pos) - b.distanceTo(pos))[0]; label = 'Laundry cart'; color = '#8ab4ff'; }
    } else if (pos.x < 42 || pos.y < 6) { t = S.landing; label = 'East wall: zip line'; color = 'var(--amber)'; }
    else { t = S.pier; label = 'The boat'; color = 'var(--safe)'; }
    this._mk ||= new THREE.Vector3();
    this._mk.set(t.x, (t.y || 0) + 1.8, t.z);
    hud.setMarker(this._mk, s.camera, label, color, Math.hypot(t.x - pos.x, t.z - pos.z));
  }

  _finish() {
    if (this.done) return;
    // Out of D Block: on to the yard (same level, next stage)
    if (this.stage === 'dblock') {
      this.cp = 1;
      audio.sfx('checkpoint', { vol: 0.6 });
      if (this.plan === 'crew') {
        this.stage = 'lockdown';
        this.state.game.hud.setObjective('Up the east wall stairs, down the zip line to the boat');
      } else {
        this.stage = 'yard2';
        this.truckLeft = TRUCK_TIME * diff().timer;
        this.state.game.hud.setObjective('Grab a laundry sack, then into the laundry truck');
      }
      return;
    }
    this.done = true;
    const s = this.state;
    this._closeMini();
    this._dropSack();
    s.setAction(null);
    s.game.hud.setMeter(0, '');
    audio.sfx('win');
    s.over = true;
    s.inCard = true;
    s.game.input.exitPointerLock?.();
    const how = {
      tunnel: 'At dawn the supply train pulls out through the rail gate, with you under a ton of coal. Nobody counts the coal.',
      laundry: 'The laundry truck rattles onto the ferry with you under a heap of sheets. On the mainland, you hop out at the first red light.',
      crew: 'Over the wall, down the zip line, and into Mags\'s boat. She grins and opens the throttle: "Miss me?"',
    }[this.plan];
    showCard(`<p class="sub kicker">Jail · ${PLANS[this.plan].name}</p><h2>You broke out!</h2><p class="sub">${how} Back to it, and try not to get caught again.</p>`, [
      { label: 'Carry on', primary: true, onClick: () => { hideCard(); s.inCard = false; leaveJail(s.game); } },
    ]);
  }

  _escape() { this.stage = 'out'; this._finish(); }

  adminSkip() { this.stage = 'out'; this._finish(); }

  teardown() {
    this._dropSack();
    super.teardown();
  }
}

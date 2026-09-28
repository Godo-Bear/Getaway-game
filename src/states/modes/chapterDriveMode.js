import * as THREE from 'three';
import { makeGlowMaterial } from '../../world/materials.js';
import { CHAPTER1 } from '../../story/chapter1.js';
import { getChapterRun } from '../../story/chapterRun.js';
import { save } from '../../core/save.js';
import { formatTime } from '../../core/utils.js';

// Chapter 1, Part 2: the getaway drive.
//
// You leave the Pier Street garage (south-west of town) with the police on
// your tail. Goal: the crew's safehouse on the north side, marked by a green
// light. The catch: you can't lead the cops there. Lose them first (break
// line of sight until they switch to searching), THEN pull up at the door.
//
// A police keycard (clue) lies on a path in the park in the middle of town,
// off the direct route. Drive over it to pick it up.
//
// Busted = restart this part (counts as caught in your chapter rating).

const CITY = {
  seed: 1947,
  blocks: 8,
  // Fixed landmarks: a park in the middle (keycard clue), the safehouse NE.
  forceKinds: { '4,3': 'park', '7,0': 'safehouse', '1,6': 'buildings', '2,6': 'alley' },
};
const START_NODE = [1, 7];     // near the garage, south-west
const ARRIVE_RADIUS = 9;
const ARRIVE_SPEED = 15;       // m/s (~54 km/h): you have to actually pull up
const CLUE_RADIUS = 7;         // generous: just drive through the ring

export class ChapterDriveMode {
  constructor(state) {
    this.state = state;
    this.chapter = CHAPTER1;
    this.hudSections = ['tl', 'map', 'speedo', 'meter', 'controls', 'marker'];
    this.heat = 2;
  }

  cityOptions() {
    return CITY;
  }

  build() {
    const s = this.state;
    const lm = s.city.landmarks;
    this.safehouse = lm['7,0'].door;
    // Keycard on the east-west path of the park, a little off-centre
    const park = lm['4,3'];
    this.cluePos = park.center.clone().add(new THREE.Vector3(12, 0, 0));
    const g = new THREE.Group();
    g.position.copy(this.cluePos);
    const card = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.6),
      new THREE.MeshLambertMaterial({ color: 0xd8dde8, emissive: 0x404860, emissiveIntensity: 0.6 }));
    card.position.y = 0.15;
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.6),
      new THREE.MeshBasicMaterial({ color: 0xffc34d, toneMapped: false }));
    gem.position.y = 2.2;
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.1, 32), makeGlowMaterial(0xffb020, 0.7));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.12;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 30, 8, 1, true), makeGlowMaterial(0xffb020, 0.3));
    beam.position.y = 15;
    g.add(card, gem, ring, beam);
    s.scene.add(g);
    this.clue = { group: g, gem, ring };
  }

  start(first) {
    const s = this.state;
    this.run = getChapterRun(s.game, this.chapter.id);
    const [i, j] = START_NODE;
    const n = s.city.graph.node(i, j);
    // Mid-block south of the start intersection, pointing north (-Z).
    s.placePlayer(n.x + 2.3, n.z + 25, Math.PI);
    this.heat = 2;
    this.heatTimer = 0;
    this.warnTimer = 0;
    this.done = false;
    this.clueFound = this.run.clues.has('keycard');
    this.clue.group.visible = !this.clueFound;
    s.beacon.set(this.safehouse.x, this.safehouse.z, 'Safehouse', 0x4dffa6);

    const hud = s.game.hud;
    hud.setPhase(`${this.chapter.title} · Part 2: The drive`);
    hud.setObjective(this.chapter.driveObjective);
    this._updateStats();

    if (first) s.showStoryCards(this.chapter.driveIntro, 'Drive');
    else hud.toast('Go!', 'Lose the cops, then head for the green light.', 'var(--amber)');
  }

  /** Extra dots for the minimap: the clue (amber) until you pick it up. */
  minimapDots() {
    return this.clueFound ? [] : [{ x: this.cluePos.x, z: this.cluePos.z, color: '#ffb020', size: 1.6 }];
  }

  get copsOnYou() {
    const police = this.state.police;
    return police.everSeen && !police.searching;
  }

  onPoliceRam() {
    this.heatTimer += 8;
  }

  onEvade() {
    this.state.game.hud.toast('Cops lost!', 'They\'re searching the area. Get to the safehouse before they find you again.', 'var(--safe)');
  }

  update(dt) {
    if (this.done) return;
    const s = this.state;
    const p = s.player;
    const hud = s.game.hud;

    // Heat 2, rising to 3 after a minute (or sooner if you ram cops).
    this.heatTimer += dt;
    if (this.heat < 3 && this.heatTimer > 60) {
      this.heat = 3;
      hud.toast('Heat level 3', 'More cruisers are joining the chase.', 'var(--red)');
    }

    // Clue
    if (!this.clueFound) {
      this.clue.gem.rotation.y += dt * 2;
      this.clue.ring.rotation.z -= dt;
      if (Math.hypot(p.pos.x - this.cluePos.x, p.pos.z - this.cluePos.z) < CLUE_RADIUS) {
        this.clueFound = true;
        this.clue.group.visible = false;
        this.run.clues.add('keycard');
        save.addClue(this.chapter.id, 'keycard');
        const info = this.chapter.clues.keycard;
        hud.toast(`Clue: ${info.name}`, info.text, 'var(--amber)', 7);
      }
    }

    // Safehouse
    this.warnTimer -= dt;
    const d = Math.hypot(p.pos.x - this.safehouse.x, p.pos.z - this.safehouse.z);
    if (d < ARRIVE_RADIUS) {
      if (this.copsOnYou) {
        if (this.warnTimer <= 0) {
          this.warnTimer = 4;
          hud.toast('Not with cops on your tail!', 'Lose them first. Don\'t lead them to the safehouse.', 'var(--red)');
        }
      } else if (p.speed > ARRIVE_SPEED) {
        if (this.warnTimer <= 0) {
          this.warnTimer = 3;
          hud.toast('Slow down', 'Pull up at the door.', 'var(--amber)');
        }
      } else {
        this._complete();
        return;
      }
    }

    hud.setObjective(this.copsOnYou ? 'Lose the cops' : 'Get to the safehouse (green light)');
    this._updateStats();
  }

  _updateStats() {
    const s = this.state;
    const run = this.run;
    const total = Object.keys(this.chapter.clues).length;
    const police = s.police;
    const status = !police.everSeen ? '' : police.searching
      ? '<span><b style="color:var(--safe)">SEARCHING</b></span>'
      : '<span class="warn"><b>PURSUIT</b></span>';
    s.game.hud.setStats(`<span>Time <b>${formatTime(s.time)}</b></span>` +
      `<span>Clues <b>${run.clues.size}/${total}</b></span>` +
      `<span${run.caught ? ' class="warn"' : ''}>Caught <b>${run.caught}</b></span>` +
      `<span>Heat <b style="color:var(--red)">${'★'.repeat(this.heat)}</b></span>${status}`);
  }

  onBusted() {
    const s = this.state;
    this.run.caught++;
    s.gameOver(`
      <h2>Busted!</h2>
      <p class="sub">They boxed you in. Keep moving, use nitro to break away, and cut through parks and alleys to lose them.</p>
      <p>This counts as being caught in your chapter rating.</p>`,
    [], { retryLabel: 'Try the drive again' });
  }

  _complete() {
    this.done = true;
    const s = this.state;
    const run = this.run;
    run.parts.drive = s.time;
    save.submitTime(`${this.chapter.id}.drive`, s.time);
    s.game.hud.setMarker(null);
    s.game.hud.setMeter(0, '');
    // The story continues at the safehouse: outro scene, then the deduction.
    s.over = true;
    s.showStoryCards(this.chapter.outro, 'Open the Case Board', () => {
      s.game.sm.change('deduction', { chapterId: this.chapter.id });
    });
  }
}

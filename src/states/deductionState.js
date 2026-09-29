import * as THREE from 'three';
import { showCard, hideCard } from '../ui/menus.js';
import { showCaseBoard } from '../ui/caseBoard.js';
import { CHAPTERS } from '../story/chapters.js';
import { SUSPECTS } from '../story/crew.js';
import { getChapterRun, totalTime, chapterRating } from '../story/chapterRun.js';
import { startPart, knownClues } from '../story/chapterFlow.js';
import { save } from '../core/save.js';
import { earn, owns } from '../gadgets/gadgets.js';
import { formatTime, makeRng } from '../core/utils.js';
import { audio } from '../core/audio.js';

// Part 3 of a chapter: the deduction.
//
// A dim safehouse room with a corkboard: suspect photos across the top, the
// clues you found pinned below, and red string from each clue to the person
// it points at. The UI asks: who tipped off the police?
//
//  - Right answer: the result screen explains how each clue fits (and which
//    were red herrings), gives the chapter rating, and unlocks the next chapter.
//  - Wrong answer: explains why not, and lets you accuse again (costs rating)
//    or replay the chapter to find the clues you missed.

const SUSPECT_ORDER = ['vince', 'marla', 'dex', 'hale'];
const RATING_ORDER = ['gold', 'silver', 'bronze'];

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class DeductionState {
  constructor(game) {
    this.game = game;
  }

  enter({ chapterId = 'chapter1' } = {}) {
    this.chapter = CHAPTERS[chapterId];
    this.run = getChapterRun(this.game, chapterId);
    // Evidence = clues found this run plus anything found before (e.g. in a clue hunt).
    this.evidence = knownClues(this.game, chapterId);
    this.wrong = 0;
    // Lie Detector gadget: clears one innocent suspect (preferably one a
    // red-herring clue points at, since that's the tempting wrong answer).
    this.cleared = null;
    if (owns('detector')) {
      const traitor = this.chapter.traitor;
      const herring = Object.values(this.chapter.clues).find((c) => c.redHerring && c.pointsTo !== traitor);
      this.cleared = herring?.pointsTo || SUSPECT_ORDER.find((id) => id !== traitor);
    }
    this.time = 0;
    this.game.hud.hideAll();
    this._buildScene();
    this._askWho();
  }

  exit() {
    hideCard();
    this.scene?.traverse((o) => {
      o.geometry?.dispose();
      if (o.material?.map) o.material.map.dispose();
    });
    this.scene = null;
  }

  // ------------------------------------------------------------------
  // 3D corkboard scene
  // ------------------------------------------------------------------
  _buildScene() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07080c);
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);

    scene.add(new THREE.HemisphereLight(0x6070a0, 0x201810, 0.9));
    const lamp = new THREE.PointLight(0xffc27a, 42, 18, 1.6);
    lamp.position.set(1.5, 2.6, 3);
    scene.add(lamp);

    // Wall and cork board
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(20, 8), new THREE.MeshLambertMaterial({ color: 0x2a2622 }));
    wall.position.set(0, 1.5, -0.05);
    scene.add(wall);
    const rng = makeRng(5);
    const cork = canvasTex(512, 320, (g, w, h) => {
      g.fillStyle = '#9b7148';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 9000; i++) {
        g.fillStyle = ['#8a6340', '#a97c52', '#7d5936', '#b38a5e'][Math.floor(rng() * 4)];
        g.fillRect(rng() * w, rng() * h, 1 + rng() * 2, 1 + rng() * 2);
      }
    });
    const board = new THREE.Mesh(new THREE.BoxGeometry(6.4, 3.8, 0.08), new THREE.MeshLambertMaterial({ map: cork }));
    board.position.set(0, 1.6, 0);
    scene.add(board);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(6.6, 4.0, 0.06), new THREE.MeshLambertMaterial({ color: 0x3a2716 }));
    frame.position.set(0, 1.6, -0.02);
    scene.add(frame);

    // Suspect "photos" across the top
    this.photos = {};
    SUSPECT_ORDER.forEach((id, i) => {
      const s = SUSPECTS[id];
      const tex = canvasTex(256, 320, (g, w, h) => {
        g.fillStyle = '#f2ede2';
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#1a1c22';
        g.fillRect(16, 16, w - 32, h - 90);
        g.fillStyle = s.color;
        g.beginPath();
        g.arc(w / 2, 110, 58, 0, Math.PI * 2); // head
        g.fill();
        g.fillRect(w / 2 - 80, 170, 160, 70);   // shoulders
        g.fillStyle = '#1a1c22';
        g.font = 'bold 44px "Bebas Neue", Impact, sans-serif';
        g.textAlign = 'center';
        g.fillText(s.name.toUpperCase(), w / 2, h - 28);
      });
      const photo = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 1.19), new THREE.MeshLambertMaterial({ map: tex }));
      const x = -2.4 + i * 1.6;
      photo.position.set(x, 2.55, 0.06);
      photo.rotation.z = (rng() - 0.5) * 0.1;
      scene.add(photo);
      this._pin(x, 3.08, 0x2266ff);
      this.photos[id] = photo;
    });

    // Clue cards along the bottom, with red string to their suspect
    const ids = Object.keys(this.chapter.clues);
    const found = ids.filter((id) => this.evidence.has(id));
    const stringMat = new THREE.LineBasicMaterial({ color: 0xd01a1a });
    found.forEach((id, i) => {
      const info = this.chapter.clues[id];
      const tex = canvasTex(320, 200, (g, w, h) => {
        g.fillStyle = '#ece4cf';
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#2a2a2a';
        g.font = 'bold 36px "Barlow Semi Condensed", Arial, sans-serif';
        g.textAlign = 'center';
        g.fillText(info.name, w / 2, 70);
        g.font = '22px "Barlow Semi Condensed", Arial, sans-serif';
        g.fillStyle = '#6a5f4a';
        g.fillText('EVIDENCE', w / 2, 120);
        g.strokeStyle = '#b8ab8c';
        g.strokeRect(10, 10, w - 20, h - 20);
      });
      const card = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.69), new THREE.MeshLambertMaterial({ map: tex }));
      const n = found.length;
      const x = n === 1 ? 0 : -2.5 + (i * 5) / (n - 1);
      const y = 0.6 + (i % 2) * 0.35;
      card.position.set(x, y, 0.06);
      card.rotation.z = (rng() - 0.5) * 0.14;
      scene.add(card);
      this._pin(x, y + 0.3, 0xdd2222);
      // String from the clue up to the suspect photo it points at
      const target = SUSPECT_ORDER.indexOf(info.pointsTo);
      const tx = -2.4 + target * 1.6;
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, y + 0.3, 0.1), new THREE.Vector3(tx, 1.95, 0.1),
      ]);
      scene.add(new THREE.Line(geo, stringMat));
    });
    if (!found.length) {
      const tex = canvasTex(512, 128, (g, w, h) => {
        g.fillStyle = '#ece4cf';
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#2a2a2a';
        g.font = 'bold 40px "Barlow Semi Condensed", Arial, sans-serif';
        g.textAlign = 'center';
        g.fillText('No evidence found...', w / 2, 78);
      });
      const note = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.5), new THREE.MeshLambertMaterial({ map: tex }));
      note.position.set(0, 0.9, 0.06);
      scene.add(note);
    }

    // Highlight ring (shown around the accused)
    this.highlight = new THREE.Mesh(new THREE.RingGeometry(0.72, 0.8, 40),
      new THREE.MeshBasicMaterial({ color: 0xffb020, toneMapped: false }));
    this.highlight.visible = false;
    scene.add(this.highlight);
  }

  _pin(x, y, color) {
    const pin = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.3 }));
    pin.position.set(x, y, 0.1);
    this.scene.add(pin);
  }

  _highlight(id, color) {
    const p = this.photos[id];
    this.highlight.position.set(p.position.x, p.position.y, 0.08);
    this.highlight.material.color.setHex(color);
    this.highlight.visible = true;
  }

  // ------------------------------------------------------------------
  // UI flow
  // ------------------------------------------------------------------
  _clueCount() {
    const ids = Object.keys(this.chapter.clues);
    return { found: ids.filter((id) => this.evidence.has(id)).length, total: ids.length };
  }

  _askWho() {
    this.highlight.visible = false;
    const { found, total } = this._clueCount();
    showCard(`
      <p class="sub kicker">${this.chapter.title} · Part ${this.chapter.parts.length + 1}: The deduction</p>
      <h2>${this.chapter.deduction.question}</h2>
      <p class="sub">You have ${found} of ${total} clues. Check the Case Board if you need to: some clues point at the wrong person on purpose.</p>
      <div class="accuse-grid">
        ${SUSPECT_ORDER.map((id) => {
          const s = SUSPECTS[id];
          const clear = id === this.cleared;
          return `<button class="btn${clear ? ' cleared' : ''}" data-accuse="${id}" ${clear ? 'disabled' : ''}><span class="badge" style="background:${s.color}">${s.name[0]}</span>
            <span>${s.name}<small>${clear ? 'Cleared by the Lie Detector' : s.role}</small></span></button>`;
        }).join('')}
      </div>`,
    [
      { label: 'Case Board', onClick: () => showCaseBoard(this.chapter, this.evidence, () => this._askWho(), 'clues', true) },
      { label: 'Quit to title', onClick: () => this.game.goTitle() },
    ], { side: true });
    document.querySelectorAll('[data-accuse]').forEach((b) => {
      b.addEventListener('mouseenter', () => this._highlight(b.dataset.accuse, 0xffb020));
      b.addEventListener('focus', () => this._highlight(b.dataset.accuse, 0xffb020));
      b.addEventListener('click', () => this._accuse(b.dataset.accuse));
    });
  }

  _accuse(id) {
    const verdict = this.chapter.verdicts[id];
    if (verdict.correct) this._solved(id, verdict);
    else this._wrong(id, verdict);
  }

  _wrong(id, verdict) {
    this.wrong++;
    audio.sfx('sting');
    this._highlight(id, 0xff3346);
    const { found, total } = this._clueCount();
    const missed = total - found;
    showCard(`
      <p class="sub kicker">That doesn't add up</p>
      <h2 class="verdict-bad">${verdict.title}</h2>
      <p>${verdict.text}</p>
      <p class="sub">${missed ? `You missed ${missed} clue${missed > 1 ? 's' : ''}. Replaying the chapter might turn up what you need.` : 'You have every clue. Look at who the real evidence points to, and which clues look planted.'}
      Each wrong accusation lowers your chapter rating.</p>`,
    [
      { label: 'Accuse someone else', primary: true, onClick: () => this._askWho() },
      { label: 'Case Board', onClick: () => showCaseBoard(this.chapter, this.evidence, () => this._askWho(), 'clues', true) },
      ...(missed ? [{ label: 'Replay the chapter', onClick: () => this._replay() }] : []),
      { label: 'Quit to title', onClick: () => this.game.goTitle() },
    ], { side: true });
  }

  _solved(id, verdict) {
    audio.sfx('win');
    this._highlight(id, 0x4dffa6);
    const chapter = this.chapter;
    const run = this.run;
    const ids = Object.keys(chapter.clues);
    const { found, total } = this._clueCount();
    const complete = chapter.parts.every((pt) => run.parts[pt.id] != null); // played every part this run
    const time = totalTime(run);

    // Rating: from time, clues and catches, then one tier lower per wrong guess.
    let rating = chapterRating(run, chapter);
    const tier = Math.min(2, RATING_ORDER.indexOf(rating) + this.wrong);
    rating = RATING_ORDER[tier];

    // Save progress
    const p = save.data.progress;
    p.solved = p.solved || {};
    const firstSolve = !p.solved[chapter.id];
    p.solved[chapter.id] = true;
    p.chapterUnlocked = Math.max(p.chapterUnlocked || 1, chapter.number + 1);
    p.ratings = p.ratings || {};
    const prev = p.ratings[chapter.id];
    if (!prev || RATING_ORDER.indexOf(rating) < RATING_ORDER.indexOf(prev)) p.ratings[chapter.id] = rating;
    let newColour = false;
    if (rating === 'gold') {
      p.carColours = p.carColours || [];
      const colour = `gold-${chapter.id}`;
      if (!p.carColours.includes(colour)) { p.carColours.push(colour); newColour = true; }
    }
    const isBest = complete && save.submitTime(`${chapter.id}.total`, time);
    save.write();
    // Reward for the Shop: more the first time, a bonus for gold
    const cash = earn(this.game, (firstSolve ? 500 : 150) + (rating === 'gold' ? 200 : 0), '', { quiet: true });

    const clueHtml = ids.map((cid) => {
      const info = chapter.clues[cid];
      if (!this.evidence.has(cid)) return `<div class="clue missed"><strong>??? (not found)</strong></div>`;
      return `<div class="clue${info.redHerring ? ' herring' : ''}"><strong>${info.name}</strong><span>${info.explain}</span></div>`;
    }).join('');

    showCard(`
      <p class="sub kicker">Case closed</p>
      <h2 class="verdict-good">${verdict.title}</h2>
      <p>${verdict.text}</p>
      <span class="rank ${rating}">CHAPTER RATING: ${rating.toUpperCase()}</span>
      <div class="stat-grid">
        <div><span>Chapter time</span><b>${complete ? formatTime(time) : '-'}</b></div>
        <div><span>Best time</span><b>${p.bestTimes[`${chapter.id}.total`] != null ? formatTime(p.bestTimes[`${chapter.id}.total`]) : '-'}</b></div>
        <div><span>Clues found</span><b>${found}/${total}</b></div>
        <div><span>Caught / wrong guesses</span><b>${run.caught} / ${this.wrong}</b></div>
        <div><span>Cash earned</span><b style="color:var(--safe)">+$${cash}</b></div>
      </div>
      ${isBest ? '<p class="new-best">New best chapter time!</p>' : ''}
      ${newColour ? '<p class="new-best">Gold rating! New car colour unlocked.</p>' : ''}
      <p class="sub" style="margin-top:8px">How the clues fit</p>
      ${clueHtml}
      <p style="margin-top:14px">${chapter.resultOutro}</p>
      <p class="sub">Gold: the whole chapter in under 5:00, at least ${total - 1} clues, never caught, right first time.</p>`,
    [
      chapter.nextChapter
        ? { label: `Continue: ${CHAPTERS[chapter.nextChapter].title}`, primary: true, onClick: () => startPart(this.game, chapter.nextChapter, 0, { fresh: true }) }
        : { label: 'The End', primary: true, onClick: () => this._finale() },
      { label: 'Replay the chapter', onClick: () => this._replay() },
      { label: 'Quit to title', onClick: () => this.game.goTitle() },
    ], { side: true });
  }

  _replay() {
    startPart(this.game, this.chapter.id, 0, { fresh: true });
  }

  /** After the last chapter: the ending and credits. */
  _finale() {
    const ratings = save.data.progress.ratings || {};
    const rows = Object.values(CHAPTERS).map((c) => `<div><span>${c.title}</span><b>${(ratings[c.id] || '-').toUpperCase()}</b></div>`).join('');
    showCard(`
      <p class="sub kicker">The End</p>
      <h2>GETAWAY</h2>
      <p>Vince is doing time for the back door. Dex is testifying against everyone. Marla is in handcuffs on a wet runway, and Det. Hale is going away for a very long time: his own ledger, his lawyer\'s phone and box 42 made sure of that. The storm is clearing. You walk away in the rain, free.</p>
      <div class="stat-grid">${rows}</div>
      <p class="sub">Thanks for playing. Gold ratings unlock new car colours in Settings, and ghost mode (G, or the pause menu) lets you explore any part without the police.</p>`,
    [{ label: 'Back to title', primary: true, onClick: () => this.game.goTitle() }], { side: true });
  }

  update(dt) {
    this.time += dt;
    audio.setMix({ music: 0.35, intensity: 0.08, city: 0.05 });
    // Slow drift, like a handheld camera in a quiet room.
    const t = this.time;
    this.camera.position.set(0.7 + Math.sin(t * 0.15) * 0.25, 1.7 + Math.sin(t * 0.22) * 0.08, 7.0 + Math.sin(t * 0.1) * 0.2);
    // Look a little to the right of the board so it sits on the left of the
    // screen, clear of the menu docked on the right.
    this.camera.lookAt(1.5, 1.6, 0);
    this.game.input.consumeMouse();
  }

  render(renderer) {
    // No glow here: the lamp-lit cards would bloom into unreadable white.
    this.game.post.render(this.scene, this.camera, this.game.dt, { bloom: false });
  }

  resize(w, h) {
    if (!this.camera) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}

// Menu cards: title screen, pause, game over, controls.
//
// Every menu is drawn into the same overlay <div class="card">. A menu is
// just some HTML plus a list of buttons with click handlers.

import { save } from '../core/save.js';
import { CHAPTER_LIST, CHAPTERS } from '../story/chapters.js';
import { showCaseBoard } from './caseBoard.js';
import { formatTime } from '../core/utils.js';

const overlay = document.getElementById('overlay');
const card = document.getElementById('card');

/**
 * Show a card.
 * @param {string} html - content
 * @param {{label:string, sub?:string, primary?:boolean, disabled?:boolean, onClick:Function}[]} buttons
 * @param {{title?:boolean, list?:boolean, side?:boolean}} opts - title = big left-aligned title-screen style,
 *        side = docked on the right so the 3D scene stays visible
 */
export function showCard(html, buttons = [], { title = false, list = false, side = false } = {}) {
  card.innerHTML = html;
  const row = document.createElement('div');
  row.className = list ? 'menu-list' : 'btns';
  for (const b of buttons) {
    const el = document.createElement('button');
    el.className = `btn${b.primary ? ' primary' : ''}`;
    el.innerHTML = b.label + (b.sub ? `<small>${b.sub}</small>` : '');
    el.disabled = !!b.disabled;
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      b.onClick();
    });
    row.appendChild(el);
  }
  if (buttons.length) card.appendChild(row);
  overlay.classList.toggle('title', title);
  overlay.classList.toggle('side', side);
  overlay.hidden = false;
  card.scrollTop = 0;
  const first = row.querySelector('.primary') || row.querySelector('button');
  if (first) setTimeout(() => first.focus({ preventScroll: true }), 30);
}

export function hideCard() {
  overlay.hidden = true;
}

export function isCardOpen() {
  return !overlay.hidden;
}

export const CONTROLS = {
  onFoot: `
    <kbd>Mouse</kbd> look around &nbsp; <kbd>W A S D</kbd> move<br>
    <kbd>Shift</kbd> sprint &nbsp; <kbd>Space</kbd> jump / climb<br>
    Run at low obstacles to vault them. Jump at a ledge (up to 2.7 m) to climb.
    Hold a direction into a ledge in mid-air to grab it.<br>
    <kbd>V</kbd> first / third person &nbsp; <kbd>R</kbd> back to safety &nbsp; <kbd>P</kbd>/<kbd>Esc</kbd> pause`,
  onFootNoLock: `
    <kbd>W / S</kbd> move &nbsp; <kbd>A / D</kbd> turn &nbsp; drag the mouse to look<br>
    <kbd>Shift</kbd> sprint &nbsp; <kbd>Space</kbd> jump / climb<br>
    <kbd>V</kbd> first / third person &nbsp; <kbd>R</kbd> back to safety &nbsp; <kbd>P</kbd> pause`,
  driving: `
    <kbd>W</kbd> accelerate &nbsp; <kbd>S</kbd> brake / reverse &nbsp; <kbd>A D</kbd> steer<br>
    <kbd>Space</kbd> handbrake (drift) &nbsp; <kbd>Shift</kbd> nitro<br>
    Drifting and near-misses recharge nitro. Keep moving: stopping near cops fills the Busted meter.<br>
    <kbd>Q</kbd> horn (traffic pulls aside) &nbsp; <kbd>C</kbd> camera<br>
    <kbd>R</kbd> unstick (when stopped) &nbsp; <kbd>P</kbd>/<kbd>Esc</kbd> pause`,
};

export function controlsHtml() {
  return `<h2>Controls</h2>
    <p class="sub">On foot</p>
    <div class="controls-grid">
      <kbd>Mouse</kbd><span>Look around (click the game to lock the mouse)</span>
      <kbd>W A S D</kbd><span>Move</span>
      <kbd>Shift</kbd><span>Sprint</span>
      <kbd>Space</kbd><span>Jump. Near a ledge: climb it (up to 2.7 m)</span>
      <kbd>Run into it</kbd><span>Vault over low obstacles like AC units</span>
      <kbd>V</kbd><span>Switch between first-person and third-person view</span>
      <kbd>R</kbd><span>Go back to the last safe spot</span>
    </div>
    <p class="sub">Driving</p>
    <div class="controls-grid">
      <kbd>W / S</kbd><span>Accelerate / brake and reverse</span>
      <kbd>A / D</kbd><span>Steer</span>
      <kbd>Space</kbd><span>Handbrake: drift round corners</span>
      <kbd>Shift</kbd><span>Nitro boost</span>
      <kbd>Q</kbd><span>Horn: traffic ahead pulls aside</span>
      <kbd>C</kbd><span>Change camera</span>
      <kbd>R</kbd><span>Unstick the car (when stopped)</span>
    </div>
    <div class="controls-grid"><kbd>P / Esc</kbd><span>Pause</span><kbd>H</kbd><span>Show / hide the controls help</span></div>`;
}

/** Title screen. `actions` = { rooftopRun, freeRun, streetChase } callbacks. */
export function showTitle(actions) {
  const best = save.data.best;
  showCard(
    `<div class="logo">GET<span>AWAY</span></div>
     <p class="sub">A heist gone wrong. Someone on your crew talked. Get out, lose the cops, and find the rat.</p>`,
    [
      { label: 'Story', sub: 'Escape, drive, and find out who betrayed you', primary: true, onClick: () => showChapterSelect(actions) },
      { label: 'Rooftop Run', sub: `Parkour survival: outrun the police helicopters. Best: ${best.rooftopRun.toLocaleString('en-US')}`, onClick: actions.rooftopRun },
      { label: 'Street Chase', sub: `Driving survival: lose the cops, use nitro. Best: ${best.streetChase.toLocaleString('en-US')}`, onClick: actions.streetChase },
      { label: 'Free Run', sub: 'Practise parkour on the rooftops, no helicopters', onClick: actions.freeRun },
      { label: 'Controls', onClick: () => showCard(controlsHtml(), [{ label: 'Back', primary: true, onClick: () => showTitle(actions) }]) },
    ],
    { title: true, list: true },
  );
}

/** Chapter select: pick a chapter (and part), see ratings, open the Case Board. */
export function showChapterSelect(actions) {
  const p = save.data.progress;
  const back = () => showChapterSelect(actions);
  const rows = CHAPTER_LIST.map((c, i) => {
    const unlocked = c.available && i + 1 <= (p.chapterUnlocked || 1);
    const rating = p.ratings?.[c.id];
    const best = p.bestTimes?.[`${c.id}.total`];
    const status = !c.available ? 'Coming in Milestone 7'
      : !unlocked ? 'Locked: solve the previous chapter'
      : [p.solved?.[c.id] ? 'Solved' : 'Not solved yet', rating ? `rating ${rating}` : '', best != null ? `best ${formatTime(best)}` : ''].filter(Boolean).join(' · ');
    return { c, unlocked, status };
  });
  const buttons = [];
  for (const r of rows) {
    buttons.push({ label: r.c.title, sub: r.status, primary: r.c.id === 'chapter1', disabled: !r.unlocked,
      onClick: () => showChapterParts(r.c.id, actions, back) });
  }
  buttons.push({ label: 'Back', onClick: () => showTitle(actions) });
  showCard('<h2>Story</h2><p class="sub">Each chapter: escape on foot, lose the police, then work out who betrayed you.</p>', buttons, { list: true });
}

function showChapterParts(chapterId, actions, back) {
  const chapter = CHAPTERS[chapterId];
  const found = new Set(save.data.progress.clues?.[chapterId] || []);
  showCard(`<p class="sub kicker">${chapter.title}</p><h2>Choose where to start</h2>
    <p class="sub">A chapter rating needs a full run from Part 1. Starting later is good for practice.</p>`, [
    { label: 'Part 1: The rooftops', sub: 'Play the whole chapter from the start', primary: true, onClick: () => actions.story(chapterId, 'rooftops') },
    { label: 'Part 2: The drive', sub: 'Jump straight into the getaway drive', onClick: () => actions.story(chapterId, 'drive') },
    { label: 'Case Board', sub: `Every clue you have ever found (${found.size}/${Object.keys(chapter.clues).length})`,
      onClick: () => showCaseBoard(chapter, found, () => showChapterParts(chapterId, actions, back)) },
    { label: 'Back', onClick: back },
  ], { list: true });
}

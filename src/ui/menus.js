// Menu cards: title screen, pause, game over, controls.
//
// Every menu is drawn into the same overlay <div class="card">. A menu is
// just some HTML plus a list of buttons with click handlers.

import { save } from '../core/save.js';
import { CHAPTER_LIST, CHAPTERS } from '../story/chapters.js';
import { showCaseBoard } from './caseBoard.js';
import { formatTime } from '../core/utils.js';
import { showShop } from './shop.js';
import { cash } from '../gadgets/gadgets.js';

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
    <kbd>Shift</kbd> sprint &nbsp; <kbd>Space</kbd> jump / climb &nbsp; <kbd>C</kbd> slide<br>
    Jump alongside a tall wall to wall-run; jump again to leap off. Jump into a zip line cable to ride it.
    Run at low obstacles to vault them. Jump at a ledge (up to 2.7 m) to climb.
    Hold a direction into a ledge in mid-air to grab it. Fell to the street? Walk into a yellow ladder and hold <kbd>W</kbd>.<br>
    <kbd>V</kbd> first / third person &nbsp; <kbd>Scroll</kbd> zoom &nbsp; <kbd>F</kbd> gadget &nbsp; <kbd>R</kbd> back to safety &nbsp; <kbd>G</kbd> ghost mode (story) &nbsp; <kbd>P</kbd>/<kbd>Esc</kbd> pause`,
  onFootNoLock: `
    <kbd>W / S</kbd> move &nbsp; <kbd>A / D</kbd> turn &nbsp; drag the mouse to look<br>
    <kbd>Shift</kbd> sprint &nbsp; <kbd>Space</kbd> jump / climb<br>
    <kbd>V</kbd> first / third person &nbsp; <kbd>Scroll</kbd> zoom &nbsp; <kbd>F</kbd> gadget &nbsp; <kbd>R</kbd> back to safety &nbsp; <kbd>G</kbd> ghost mode &nbsp; <kbd>P</kbd> pause`,
  driving: `
    <kbd>W</kbd> accelerate &nbsp; <kbd>S</kbd> brake / reverse &nbsp; <kbd>A D</kbd> steer<br>
    <kbd>Shift</kbd> handbrake (drift) &nbsp; <kbd>Space</kbd> nitro<br>
    Blue canisters on the road, drifting and near-misses refill nitro. Keep moving: stopping near cops fills the Busted meter.<br>
    <kbd>Q</kbd> horn (traffic pulls aside) &nbsp; <kbd>C</kbd> camera &nbsp; <kbd>Scroll</kbd> zoom<br>
    <kbd>M</kbd> big map: click to set a waypoint &nbsp; <kbd>F</kbd> gadget<br>
    Hide from the cops in parking garages (blue P on the minimap).<br>
    <kbd>R</kbd> unstick (when stopped) &nbsp; <kbd>G</kbd> ghost mode (story) &nbsp; <kbd>P</kbd>/<kbd>Esc</kbd> pause`,
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
      <kbd>C</kbd><span>Slide while sprinting (under pipes); crouch when slow</span>
      <kbd>Jump by a wall</kbd><span>Wall-run along a tall wall; press Space again to jump off it</span>
      <kbd>Jump at a cable</kbd><span>Grab a zip line and ride it down; Space lets go</span>
      <kbd>V</kbd><span>Switch between first-person and third-person view</span>
      <kbd>Walk into a ladder</kbd><span>Every building has a yellow ladder: hold W to climb back up from the street</span>
      <kbd>Hiding spots</kbd><span>Stand in a stairwell hut or under a water tower (green floor) to hide from the helicopter and officers</span>
      <kbd>R</kbd><span>Go back to the last safe spot</span>
    </div>
    <p class="sub">Driving</p>
    <div class="controls-grid">
      <kbd>W / S</kbd><span>Accelerate / brake and reverse</span>
      <kbd>A / D</kbd><span>Steer</span>
      <kbd>Shift</kbd><span>Handbrake: drift round corners</span>
      <kbd>Space</kbd><span>Nitro boost (refill it at the blue canisters on the road)</span>
      <kbd>Q</kbd><span>Horn: traffic ahead pulls aside</span>
      <kbd>C</kbd><span>Change camera</span>
      <kbd>M</kbd><span>Big city map: click anywhere to set a waypoint (or tap the minimap)</span>
      <kbd>Parking garage</kbd><span>Hiding spot: drive in (blue P on the minimap) and the cops lose you fast</span>
      <kbd>R</kbd><span>Unstick the car (when stopped)</span>
    </div>
    <div class="controls-grid"><kbd>P / Esc</kbd><span>Pause</span><kbd>Tab</kbd><span>Case Board (story)</span>
      <kbd>Scroll wheel</kbd><span>Zoom the camera in and out (on foot and driving)</span>
      <kbd>F</kbd><span>Use your gadget (buy gadgets in the Shop on the title screen)</span>
      <kbd>G</kbd><span>Ghost mode on/off (story): no police, roam freely. Nothing counts while it's on; turning it off takes you back to where you turned it on</span>
      <kbd>H</kbd><span>Show / hide the controls help</span></div>
    <p class="sub">Gamepad (Xbox layout)</p>
    <div class="controls-grid">
      <kbd>Left stick</kbd><span>Move / steer</span>
      <kbd>Right stick</kbd><span>Look around</span>
      <kbd>A</kbd><span>Jump / handbrake</span>
      <kbd>B</kbd><span>Slide / crouch</span>
      <kbd>RB or L3</kbd><span>Sprint / nitro</span>
      <kbd>LB</kbd><span>Use gadget</span>
      <kbd>D-pad right</kbd><span>Big map (driving)</span>
      <kbd>RT / LT</kbd><span>Accelerate / brake (driving)</span>
      <kbd>X</kbd><span>Horn</span>
      <kbd>Y</kbd><span>Switch view / camera</span>
      <kbd>D-pad down</kbd><span>Back to safety / unstick</span>
      <kbd>D-pad left</kbd><span>Ghost mode on/off (story)</span>
      <kbd>Menu / View</kbd><span>Pause / Case Board</span>
      <kbd>D-pad + A / B</kbd><span>Move around menus, select, go back</span>
    </div>
    <p class="sub">Touch screen</p>
    <div class="controls-grid">
      <kbd>Left joystick</kbd><span>Move / steer and accelerate</span>
      <kbd>Drag right side</kbd><span>Look around</span>
      <kbd>Buttons</kbd><span>Jump or Drift, Sprint or Nitro, View or Camera, Slide or Horn, Pause</span>
      <kbd>Ghost (left edge)</kbd><span>Ghost mode on/off in story parts</span>
      <kbd>Gadget button</kbd><span>Use your gadget</span>
      <kbd>Tap the minimap</kbd><span>Big city map: tap to set a waypoint</span>
      <kbd>Pinch</kbd><span>Zoom the camera in and out</span>
      <kbd>Pause menu</kbd><span>Back to checkpoint / unstick the car (there's no R key on a phone)</span>
    </div>`;
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
      { label: 'Gadget Shop', sub: `Smoke bombs, EMPs, grapple guns and more. Cash: $${cash().toLocaleString('en-US')}`, onClick: () => showShop(() => showTitle(actions)) },
      { label: 'Settings', sub: 'Volume, controls, graphics, car colour', onClick: () => actions.settings(() => showTitle(actions)) },
      { label: 'Controls', onClick: () => showCard(controlsHtml(), [{ label: 'Back', primary: true, onClick: () => showTitle(actions) }]) },
    ],
    { title: true, list: true },
  );
}

/** Chapter select: pick a chapter (and part), see ratings, open the Case Board. */
export function showChapterSelect(actions) {
  const p = save.data.progress;
  const back = () => showChapterSelect(actions);
  const buttons = CHAPTER_LIST.map((c) => {
    const unlocked = c.number <= (p.chapterUnlocked || 1);
    const rating = p.ratings?.[c.id];
    const best = p.bestTimes?.[`${c.id}.total`];
    const status = !unlocked ? 'Locked: solve the previous chapter'
      : [p.solved?.[c.id] ? 'Solved' : 'Not solved yet', rating ? `rating ${rating}` : '', best != null ? `best ${formatTime(best)}` : ''].filter(Boolean).join(' · ');
    return { label: c.title, sub: status, primary: unlocked && !p.solved?.[c.id], disabled: !unlocked,
      onClick: () => showChapterParts(c.id, actions, back) };
  });
  buttons.push({ label: 'Back', onClick: () => showTitle(actions) });
  showCard('<h2>Story</h2><p class="sub">Each chapter: escape, lose the police, then work out who betrayed you.</p>', buttons, { list: true });
}

function showChapterParts(chapterId, actions, back) {
  const chapter = CHAPTERS[chapterId];
  const found = new Set((save.data.progress.clues?.[chapterId] || []).filter((id) => id in chapter.clues));
  const total = Object.keys(chapter.clues).length;
  const parts = chapter.parts.map((part, i) => ({
    label: `Part ${i + 1}: ${part.title}`,
    sub: i === 0 ? 'Play the whole chapter from the start' : 'Start from this part (practice)',
    primary: i === 0,
    onClick: () => actions.story(chapterId, i, false),
  }));
  showCard(`<p class="sub kicker">${chapter.title}</p><h2>Choose where to start</h2>
    <p class="sub">A chapter rating needs a full run from Part 1. Want to look around without the police? Turn on ghost mode in any part: press G, use the pause menu, or tap the Ghost button on a touch screen. Nothing counts while it's on.</p>`, [
    ...parts,
    { label: 'Case Board', sub: `Every clue you have ever found (${found.size}/${total})`,
      onClick: () => showCaseBoard(chapter, found, () => showChapterParts(chapterId, actions, back)) },
    { label: 'Back', onClick: back },
  ], { list: true });
}


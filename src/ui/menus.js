// Menu cards: title screen, pause, game over, controls.
//
// Every menu is drawn into the same overlay <div class="card">. A menu is
// just some HTML plus a list of buttons with click handlers.

import { save } from '../core/save.js';
import { CHAPTER_LIST, CHAPTERS } from '../story/chapters.js';
import { showCaseBoard } from './caseBoard.js';
import { buyClue } from '../story/chapterFlow.js';
import { formatTime } from '../core/utils.js';
import { showShop } from './shop.js';
import { cash } from '../gadgets/gadgets.js';
import { showAccount } from './account.js';
import { cloud } from '../core/cloud.js';
import { admin } from '../core/admin.js';
import { showAdminPanel } from './adminPanel.js';
import { diff, DIFFICULTY_LIST, setDifficulty } from '../core/difficulty.js';
import { neonLogoSvg } from './neonLogo.js';

const overlay = document.getElementById('overlay');
const card = document.getElementById('card');

/**
 * Show a card.
 * @param {string} html - content
 * @param {{label:string, sub?:string, primary?:boolean, disabled?:boolean, onClick:Function}[]} buttons
 * @param {{title?:boolean, list?:boolean, grid?:boolean, side?:boolean, story?:boolean}} opts - title = big left-aligned title-screen style,
 *        story = a compact story scene docked at the bottom left,
 *        list = one button per row, grid = two columns, side = docked on the right so the 3D scene stays visible
 */
export function showCard(html, buttons = [], { title = false, list = false, grid = false, side = false, story = false, rowCls = '', wide = false } = {}) {
  card.innerHTML = html;
  card.classList.toggle('wide', wide);
  const row = document.createElement('div');
  row.className = (grid ? 'menu-grid' : list ? 'menu-list' : 'btns') + (rowCls ? ` ${rowCls}` : '');
  for (const b of buttons) {
    const el = document.createElement('button');
    el.className = `btn${b.primary ? ' primary' : ''}${b.cls ? ` ${b.cls}` : ''}`;
    el.innerHTML = b.label + (b.sub ? `<small>${b.sub}</small>` : '');
    el.disabled = !!b.disabled;
    if (b.focus) el.dataset.focus = '1';
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      b.onClick();
    });
    row.appendChild(el);
  }
  if (buttons.length) card.appendChild(row);
  overlay.classList.toggle('title', title);
  overlay.classList.toggle('side', side);
  overlay.classList.toggle('story', story); // compact, docked bottom-left: the game stays visible
  overlay.classList.remove('has-preview'); // (the Your look preview: that card adds it back)
  overlay.hidden = false;
  card.scrollTop = 0;
  const first = row.querySelector('[data-focus]') || row.querySelector('.primary') || row.querySelector('button:not(:disabled)');
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
    <kbd>Shift</kbd> sprint on / off &nbsp; <kbd>Space</kbd> jump / climb &nbsp; <kbd>C</kbd> slide<br>
    Jump alongside a tall wall to wall-run; jump again to leap off. Jump into a zip line cable to ride it, either way (even uphill): hold <kbd>S</kbd> to turn round, <kbd>Space</kbd> to let go.
    Run at low obstacles to vault them. Jump at a ledge (up to 2.7 m) to climb.
    Hold a direction into a ledge in mid-air to grab it. Fell to the street? Walk into a yellow ladder and hold <kbd>W</kbd>.<br>
    <kbd>E</kbd> action when one shows on screen (knock out a guard from behind)<br>
    <kbd>V</kbd> first / third person &nbsp; <kbd>Scroll</kbd> zoom &nbsp; <kbd>F</kbd> gadget &nbsp; <kbd>R</kbd> back to safety &nbsp; <kbd>G</kbd> ghost mode (story) &nbsp; <kbd>P</kbd>/<kbd>Esc</kbd> pause`,
  onFootNoLock: `
    <kbd>W / S</kbd> move &nbsp; <kbd>A / D</kbd> turn &nbsp; drag the mouse to look<br>
    <kbd>Shift</kbd> sprint on / off &nbsp; <kbd>Space</kbd> jump / climb &nbsp; <kbd>X</kbd> action (knock out)<br>
    <kbd>V</kbd> first / third person &nbsp; <kbd>Scroll</kbd> zoom &nbsp; <kbd>F</kbd> gadget &nbsp; <kbd>R</kbd> back to safety &nbsp; <kbd>G</kbd> ghost mode &nbsp; <kbd>P</kbd> pause`,
  driving: `
    <kbd>W</kbd> accelerate &nbsp; <kbd>S</kbd> brake / reverse &nbsp; <kbd>A D</kbd> steer<br>
    <kbd>Shift</kbd> handbrake (drift) &nbsp; <kbd>Space</kbd> nitro<br>
    Blue canisters on the road, drifting and near-misses refill nitro. Keep moving: stopping near cops fills the Busted meter.<br>
    <kbd>Q</kbd> horn (traffic pulls aside) &nbsp; <kbd>C</kbd> camera &nbsp; <kbd>Scroll</kbd> zoom<br>
    <kbd>M</kbd> big map: click to set a waypoint &nbsp; <kbd>F</kbd> gadget<br>
    <kbd>E</kbd> hack the junction you just drove through (red lights + bollards stop the cops behind you)<br>
    Hide from the cops in parking garages (blue P on the minimap).<br>
    <kbd>R</kbd> unstick (when stopped) &nbsp; <kbd>G</kbd> ghost mode (story) &nbsp; <kbd>P</kbd>/<kbd>Esc</kbd> pause`,
};

export function controlsHtml() {
  return `<h2>Controls</h2>
    <p class="sub">On foot</p>
    <div class="controls-grid">
      <kbd>Mouse</kbd><span>Look around (click the game to lock the mouse)</span>
      <kbd>W A S D</kbd><span>Move</span>
      <kbd>Shift</kbd><span>Sprint: tap once to keep sprinting, tap again to stop (switch to hold-to-sprint in Settings)</span>
      <kbd>Space</kbd><span>Jump. Near a ledge: climb it (up to 2.7 m)</span>
      <kbd>Run into it</kbd><span>Vault over low obstacles like AC units</span>
      <kbd>C</kbd><span>Slide while sprinting (under pipes); crouch when slow</span>
      <kbd>Jump by a wall</kbd><span>Wall-run along a tall wall; press Space again to jump off it</span>
      <kbd>Jump at a cable</kbd><span>Grab a zip line and ride it down; Space lets go</span>
      <kbd>V</kbd><span>Switch between first-person and third-person view</span>
      <kbd>Walk into a ladder</kbd><span>Every building has a yellow ladder: hold W to climb back up from the street</span>
      <kbd>Hiding spots</kbd><span>Stand in a stairwell hut or under a water tower (green floor) to hide from the helicopter and officers</span>
      <kbd>Space in mid-air</kbd><span>With the Glider Wing gadget: press again and hold to glide</span>
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

const ICONS = {
  rooftop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 21V12h5v9M8 21V7h7v14M15 21v-9h6v9M2 21h20"/><path d="M17 3l-3 5M11.5 3.5 14 8" stroke-linecap="round"/></svg>',
  chase: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 16v-3l2.2-5h13.6L21 13v3z"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M6 12h12"/></svg>',
  free: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M15.5 8.5 13.5 13.5 8.5 15.5 10.5 10.5z" stroke-linejoin="round"/></svg>',
  speedrun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="14" r="7.5"/><path d="M12 10v4.5l3 2M9.5 2.5h5M12 2.5v4M18.5 6.5l1.5-1.5"/></svg>',
};

/** The story chapter to carry on with: the first unlocked one not solved yet. */
function nextChapter() {
  const p = save.data.progress;
  const unlocked = CHAPTER_LIST.filter((c) => c.number <= (p.chapterUnlocked || 1));
  return unlocked.find((c) => !p.solved?.[c.id]) || unlocked[unlocked.length - 1];
}

/**
 * Title screen. `actions` = { game, story, rooftopRun, streetChase, freeRun,
 * speedrun, settings } callbacks.
 */
export function showTitle(actions) {
  const best = save.data.best;
  const next = nextChapter();
  const solved = Object.keys(save.data.progress.solved || {}).length;
  const runBest = Object.values(best.speedrun || {});
  const back = () => showTitle(actions);
  const fmtScore = (n) => (n ? `Best ${n.toLocaleString('en-US')} (${diff().name})` : `No ${diff().name} score yet`);
  showCard(`
    ${neonLogoSvg()}
    <p class="tagline">Plan the job. Pull the heist. Lose the cops. Get away.</p>
    <button class="btn primary story-btn" data-go="story">
      <span class="t-kick">Story · ${solved}/${CHAPTER_LIST.length} solved</span>
      <b>${next.title.replace(/^Chapter (\d+): /, 'Chapter $1 · ')}</b>
      <small>${solved === 0 ? 'Start here: the Harbor Trust job' : 'Carry on with the story'} · ${diff().name}</small>
      <span class="arrow">›</span>
    </button>
    <div class="tiles">
      <button class="btn tile" data-go="rooftop">${ICONS.rooftop}<b>Rooftop Run</b><small>${fmtScore(save.bestScore('rooftopRun'))}</small></button>
      <button class="btn tile" data-go="chase">${ICONS.chase}<b>Street Chase</b><small>${fmtScore(save.bestScore('streetChase'))}</small></button>
      <button class="btn tile" data-go="free">${ICONS.free}<b>Free Run</b><small>Rooftops + streets</small></button>
      <button class="btn tile" data-go="speedrun">${ICONS.speedrun}<b>Speedrun</b><small>${runBest.length ? `${runBest.length} best time${runBest.length > 1 ? 's' : ''}` : 'Race the story'}</small></button>
    </div>
    <div class="pills">
      <button class="pill" data-go="shop">Shop <b>$${cash().toLocaleString('en-US')}</b></button>
      <button class="pill" data-go="account">${cloud.user ? '<span class="dot"></span>' : ''}Account</button>
      <button class="pill" data-go="settings">Settings</button>
      <button class="pill" data-go="controls">Controls</button>
      <button class="pill" data-go="editor">Level Editor</button>
      ${admin.on ? '<button class="pill pill-admin" data-go="admin">Admin</button>' : ''}
    </div>`, [], { title: true });
  const go = {
    story: () => showChapterSelect(actions),
    rooftop: actions.rooftopRun,
    chase: actions.streetChase,
    free: () => showFreeRunMenu(actions, back),
    speedrun: () => actions.speedrun(back),
    shop: () => showShop(back),
    account: () => showAccount(back),
    settings: () => actions.settings(back),
    controls: () => showCard(controlsHtml(), [{ label: 'Back', primary: true, onClick: back }]),
    admin: () => showAdminPanel(back),
    editor: () => actions.editor(),
  };
  for (const el of card.querySelectorAll('[data-go]')) {
    el.addEventListener('click', (e) => { e.stopPropagation(); go[el.dataset.go](); });
  }
  setTimeout(() => card.querySelector('.story-btn')?.focus({ preventScroll: true }), 30);
}

/** Free Run: pick where to start, and whether the police come too. */
function showFreeRunMenu(actions, back) {
  let police = false;
  const render = () => {
    showCard(`
      <p class="sub kicker">Free Run</p>
      <h2>Rooftops and streets</h2>
      <p class="sub">Roam the rooftops on foot, then walk up to your car on the street and drive the city. Park in a garage to head back up. Grab cash bags and cash drops for the Shop.</p>
      <div class="tabs" style="margin:6px 0 4px">
        <button class="tab${police ? '' : ' on'}" data-pol="0">No police</button>
        <button class="tab${police ? ' on' : ''}" data-pol="1">With police (double cash)</button>
      </div>`,
    [
      { label: 'Start on the rooftops', primary: true, onClick: () => actions.freeRun({ police, inCar: false }) },
      { label: 'Start in the car', onClick: () => actions.freeRun({ police, inCar: true }) },
      { label: 'Back', onClick: back },
    ]);
    for (const el of card.querySelectorAll('[data-pol]')) {
      el.addEventListener('click', (e) => { e.stopPropagation(); police = el.dataset.pol === '1'; render(); });
    }
  };
  render();
}

/** Chapter select: a clean grid of chapter cards (status and your rank on this difficulty). */
export function showChapterSelect(actions) {
  const p = save.data.progress;
  const next = nextChapter();
  const cards = CHAPTER_LIST.map((c) => {
    const unlocked = c.number <= (p.chapterUnlocked || 1);
    const done = !!p.solved?.[c.id];
    const isNext = unlocked && !done && c.id === next.id;
    const rank = unlocked ? save.rating(c.id, diff().id) : null;
    const best = unlocked ? save.bestTime(`${c.id}.total`) : null;
    const status = !unlocked ? '<span class="ch-status lock">🔒</span>'
      : done ? '<span class="ch-status done">✓</span>'
        : isNext ? '<span class="ch-status next">Next</span>' : '';
    const medal = rank ? `<span class="ch-medal ${rank}" title="${rank} on ${diff().name}"></span>` : '';
    const line = !unlocked ? 'Finish the previous chapter'
      : [`${c.parts.length} parts`, best != null ? `best ${formatTime(best)}` : ''].filter(Boolean).join(' · ');
    return {
      label: `<span class="ch-num">${c.number}</span><span class="ch-main"><b>${c.short}</b><small>${line}</small></span><span class="ch-side">${medal}${status}</span>`,
      cls: `ch-card${done ? ' is-done' : ''}${isNext ? ' is-next' : ''}`, disabled: !unlocked, focus: isNext,
      onClick: () => showChapterParts(c.id, actions, () => showChapterSelect(actions)),
    };
  });
  showCard(`<div class="ch-head"><div><p class="sub kicker">Story</p><h2>Chapters</h2></div>
      <div class="ch-diff">${DIFFICULTY_LIST.map((d) => `<button class="${d.id === diff().id ? 'on' : ''}" data-diff="${d.id}">${d.name}</button>`).join('')}</div></div>`,
  [...cards, { label: 'Back', cls: 'ch-back', onClick: () => showTitle(actions) }], { list: true, rowCls: 'ch-grid', wide: true });
  for (const b of document.querySelectorAll('#card .ch-diff [data-diff]')) {
    b.addEventListener('click', (e) => { e.stopPropagation(); setDifficulty(b.dataset.diff); showChapterSelect(actions); });
  }
}

function showChapterParts(chapterId, actions, back) {
  const chapter = CHAPTERS[chapterId];
  const found = new Set((save.data.progress.clues?.[chapterId] || []).filter((id) => id in chapter.clues));
  const total = Object.keys(chapter.clues).length;
  const partBest = (id) => save.bestTime(`${chapterId}.${id}`);
  const parts = chapter.parts.map((part, i) => {
    const best = partBest(part.id);
    return {
      label: `<span class="ch-num">${i + 1}</span><span class="ch-main"><b>${part.title}</b><small>${part.kind === 'drive' ? '🚗 Driving' : '🏃 On foot'}${best != null ? ` · best ${formatTime(best)}` : ''}</small></span>` +
        `<span class="ch-side"><span class="ch-play">${i === 0 ? 'Play' : 'Practice'}</span></span>`,
      cls: `ch-card part${i === 0 ? ' is-next' : ''}`, focus: i === 0,
      onClick: () => actions.story(chapterId, i, false),
    };
  });
  showCard(`<div class="ch-head"><div><p class="sub kicker">Chapter ${chapter.number}</p><h2>${chapter.short}</h2></div></div>
    <p class="sub ch-hint">Play from Part 1 for a rating; later parts are practice. G = ghost mode (look around, nothing counts).</p>`, [
    ...parts,
    ...(total ? [{ label: `<span class="ch-num">⌕</span><span class="ch-main"><b>Case Board</b><small>${found.size} of ${total} clues found</small></span>`, cls: 'ch-card part',
      onClick: () => showCaseBoard(chapter, found, () => showChapterParts(chapterId, actions, back), 'clues', false,
        { onBuy: (id) => buyClue(actions.game, chapterId, id) }) }] : []),
    { label: 'Back', cls: 'ch-back', onClick: back },
  ], { list: true, rowCls: 'ch-parts' });
}

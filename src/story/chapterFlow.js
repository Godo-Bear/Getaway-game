// Chapter flow: moving from one part of a chapter to the next.
//
// A chapter is a list of parts (on foot or driving), then the deduction.
//   startPart(game, chapterId, index)  - jump into a part
//   finishPart(state, mode)            - called by a mode when its goal is met:
//                                        shows the part summary, then the
//                                        next part or the outro + deduction.

import { CHAPTERS } from './chapters.js';
import { getChapterRun, newChapterRun } from './chapterRun.js';
import { formatTime } from '../core/utils.js';
import { save } from '../core/save.js';
import { earn } from '../gadgets/gadgets.js';
import { speedrunPartDone } from './speedrun.js';

/**
 * @param {object} game
 * @param {string} chapterId
 * @param {number} index - which part (0 = first)
 * @param {{ghost?:boolean, fresh?:boolean}} opts - fresh = start a new chapter run,
 *        ghost = start the part with ghost mode switched on
 */
export function startPart(game, chapterId, index = 0, { ghost = false, fresh = false } = {}) {
  const chapter = CHAPTERS[chapterId];
  const part = chapter.parts[index];
  if (fresh || !game.chapterRun || game.chapterRun.chapterId !== chapterId) {
    game.chapterRun = newChapterRun(chapterId);
  }
  const state = part.kind === 'drive' ? 'driving' : 'onFoot';
  game.sm.change(state, { mode: part.mode || 'story', chapterId, part: index, ghost });
}

/** Called by a story mode when the part's goal is reached. */
export function finishPart(state, mode) {
  const { game } = state;
  const { chapter, part, partIndex } = mode;
  const run = getChapterRun(game, chapter.id);
  run.parts[part.id] = state.time;
  save.submitTime(`${chapter.id}.${part.id}`, state.time);
  if (game.speedrun) { speedrunPartDone(state, mode); return; }
  const next = chapter.parts[partIndex + 1];
  const clueTotal = Object.keys(chapter.clues).length;
  game.hud.setMarker(null);
  game.hud.setMeter(0, '');

  const toNext = () => {
    if (next) startPart(game, chapter.id, partIndex + 1);
    else {
      // Last part: the outro scene, then the deduction.
      state.showStoryCards(chapter.outro, 'Open the Case Board', () => {
        game.sm.change('deduction', { chapterId: chapter.id });
      });
    }
  };

  const found = Object.entries(chapter.clues).filter(([id]) => run.clues.has(id));
  const cash = earn(game, 250, '', { quiet: true });
  state.gameOver(`
    <p class="sub kicker">${chapter.title} · Part ${partIndex + 1} complete</p>
    <h2>${part.doneTitle}</h2>
    <p>${part.doneText}</p>
    <div class="stat-grid">
      <div><span>Time</span><b>${formatTime(state.time)}</b></div>
      <div><span>Clues this run</span><b>${found.length}/${clueTotal}</b></div>
      <div><span>Times caught</span><b>${run.caught}</b></div>
      <div><span>Cash earned</span><b style="color:var(--safe)">+$${cash}</b></div>
    </div>`,
  [{
    label: next ? `Continue: Part ${partIndex + 2}, ${next.title}` : 'Continue: the deduction',
    primary: true, onClick: () => { state.over = false; state.inCard = false; toNext(); },
  }], { retryLabel: `Replay ${part.title}`, extraFirst: true });
}

/** Every clue the player has found, in this run or any earlier one. */
export function knownClues(game, chapterId) {
  const run = game.chapterRun?.chapterId === chapterId ? game.chapterRun.clues : new Set();
  // Only clues that still exist (old saves may list clues a chapter no longer has).
  const valid = CHAPTERS[chapterId]?.clues || {};
  return new Set([...run, ...(save.data.progress.clues?.[chapterId] || [])].filter((id) => id in valid));
}

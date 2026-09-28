// The Case Board: everything you know about the betrayal so far.
//
//  - Clues tab: every clue in the chapter. Found ones show their text and
//    who they point at; missing ones show as "???" with a hint.
//  - Suspects tab: the crew (and the detective), with the clues that
//    point at each of them.
//
// Opened from the pause menu (or Tab) during a chapter, and from the title
// screen's chapter select (showing every clue you have ever found).

import { showCard } from './menus.js';
import { SUSPECTS } from '../story/crew.js';

function clueRow(id, info, found) {
  if (!found) return `<div class="clue missed"><strong>??? Not found yet</strong><span>Keep an eye out for tall amber light beams.</span></div>`;
  const who = SUSPECTS[info.pointsTo];
  return `<div class="clue"><strong>${info.name}</strong><span>${info.text}</span>
    <em class="points" style="color:${who.color}">Points at: ${who.name}</em></div>`;
}

/**
 * @param {object} chapter - chapter data (clues)
 * @param {Set<string>} found - ids of clues found
 * @param {Function} onBack
 * @param {'clues'|'suspects'} tab
 */
export function showCaseBoard(chapter, found, onBack, tab = 'clues', side = false) {
  const ids = Object.keys(chapter.clues);
  const count = ids.filter((id) => found.has(id)).length;
  let body;
  if (tab === 'clues') {
    body = ids.map((id) => clueRow(id, chapter.clues[id], found.has(id))).join('');
  } else {
    body = Object.entries(SUSPECTS).map(([sid, s]) => {
      const against = ids.filter((id) => found.has(id) && chapter.clues[id].pointsTo === sid)
        .map((id) => chapter.clues[id].name);
      return `<div class="suspect">
        <div class="badge" style="background:${s.color}">${s.name[0]}</div>
        <div><strong>${s.name}</strong> <span class="role">${s.role}</span>
        <p>${s.bio}</p>
        <p class="against">${against.length ? `Clues pointing here: <b>${against.join(', ')}</b>` : 'No clues point here yet.'}</p></div>
      </div>`;
    }).join('');
  }
  showCard(`
    <p class="sub kicker">${chapter.title}</p>
    <h2>Case Board</h2>
    <p class="sub">${count} of ${ids.length} clues found. Some clues are red herrings: someone may be trying to frame an innocent person.</p>
    ${body}`,
  [
    { label: tab === 'clues' ? 'Suspects' : 'Clues', onClick: () => showCaseBoard(chapter, found, onBack, tab === 'clues' ? 'suspects' : 'clues', side) },
    { label: 'Back', primary: true, onClick: onBack },
  ], { side });
}

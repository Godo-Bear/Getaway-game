// The Case Board: everything you know about the betrayal so far.
//
//  - Clues tab: every clue in the chapter. Found ones show their text and
//    who they point at; missing ones show as "Not found yet".
//  - Suspects tab: the crew (and the detective), with the clues that
//    point at each of them.
//
// Opened from the pause menu (or Tab) during a chapter, and from the title
// screen's chapter select (showing every clue you have ever found).
// With the Forensics Kit gadget, red herrings are marked.

import { showCard } from './menus.js';
import { SUSPECTS, suspectsOf } from '../story/crew.js';
import { owns, cash } from '../gadgets/gadgets.js';
import { CLUE_PRICE } from '../story/chapterFlow.js';
import { audio } from '../core/audio.js';

function clueRow(id, info, found, forensics, canBuy) {
  if (!found) {
    return `<div class="clue missed"><strong>Not found yet</strong><span>Look for tall amber light beams along the route${canBuy ? ', or buy it' : ''}.</span>
      ${canBuy ? `<div><button class="chip buy-clue" data-buy-clue="${id}" ${cash() < CLUE_PRICE ? 'disabled' : ''}>Buy this clue · $${CLUE_PRICE}</button></div>` : ''}</div>`;
  }
  const who = SUSPECTS[info.pointsTo];
  return `<div class="clue" style="--cc:${who.color}"><strong>${info.name}</strong><span>${info.text}</span>
    <div><em class="points">Points at ${who.name}</em>${forensics && info.redHerring ? '<em class="herring-tag">Forensics: planted (red herring)</em>' : ''}</div></div>`;
}

/**
 * @param {object} chapter - chapter data (clues)
 * @param {Set<string>} found - ids of clues found
 * @param {Function} onBack
 * @param {'clues'|'suspects'} tab
 * @param {boolean} side - docked on the right (the deduction)
 * @param {{onBuy?:(id:string)=>boolean}} opts - onBuy: buy a missing clue ($100); true if bought
 */
export function showCaseBoard(chapter, found, onBack, tab = 'clues', side = false, opts = {}) {
  const ids = Object.keys(chapter.clues);
  const count = ids.filter((id) => found.has(id)).length;
  const forensics = owns('evidence');
  let body;
  if (tab === 'clues') {
    body = ids.map((id) => clueRow(id, chapter.clues[id], found.has(id), forensics, !!opts.onBuy)).join('');
  } else {
    body = suspectsOf(chapter).map((sid) => {
      const s = SUSPECTS[sid];
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
    <p class="sub kicker">${chapter.title.replace(/:.*/, '')} · ${chapter.short}</p>
    <div class="board-head"><h2>Case Board</h2><div class="board-count"><b>${count}/${ids.length}</b>clues found</div></div>
    <div class="progress"><div style="width:${(count / ids.length) * 100}%"></div></div>
    <div class="tabs" style="margin-bottom:12px">
      <button class="tab${tab === 'clues' ? ' on' : ''}" data-tab="clues">Clues</button>
      <button class="tab${tab === 'suspects' ? ' on' : ''}" data-tab="suspects">Suspects</button>
    </div>
    ${body}
    <p class="sub fine">${forensics ? 'Your Forensics Kit marks planted clues.' : 'Careful: some clues are red herrings, planted to frame someone innocent.'}
      ${opts.onBuy && count < ids.length ? ` Missed one? Buy it for $${CLUE_PRICE} (you have $${cash().toLocaleString('en-US')}). Bought clues help the deduction but don't count for your rating.` : ''}</p>`,
  [
    { label: 'Back', primary: true, onClick: onBack },
  ], { side });
  for (const el of document.querySelectorAll('#card [data-tab]')) {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (el.dataset.tab !== tab) showCaseBoard(chapter, found, onBack, el.dataset.tab, side, opts);
    });
  }
  for (const el of document.querySelectorAll('#card [data-buy-clue]')) {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = el.dataset.buyClue;
      if (!opts.onBuy(id)) return;
      found.add(id);
      audio.sfx('clue');
      const card = document.getElementById('card'), top = card.scrollTop;
      showCaseBoard(chapter, found, onBack, tab, side, opts);
      card.scrollTop = top;
    });
  }
}

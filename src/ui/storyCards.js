// Story cards: short, skippable scenes shown between parts of a chapter.
//
// A scene is a list of pages. Each page can have:
//   kicker - small amber line above (place and time, "On the radio"...)
//   title  - big heading
//   who    - a suspect id: shows their name in their colour as the speaker
//   lines  - paragraphs
// The player clicks Next (or presses Enter/Space) through the pages, or skips.

import { showCard, hideCard } from './menus.js';
import { SUSPECTS } from '../story/crew.js';
import { audio } from '../core/audio.js';

export function pageHtml(page, index, total) {
  const who = page.who ? SUSPECTS[page.who] : null;
  return `
    ${page.kicker ? `<p class="sub kicker">${page.kicker}</p>` : ''}
    ${page.title ? `<h2>${page.title}</h2>` : ''}
    ${who ? `<p class="speaker" style="color:${who.color}">${who.name}</p>` : ''}
    ${page.lines.map((l) => `<p>${l}</p>`).join('')}
    ${total > 1 ? `<p class="page-dots">${Array.from({ length: total }, (_, i) => (i === index ? '●' : '○')).join(' ')}</p>` : ''}`;
}

/**
 * Show a scene. Calls onDone() after the last page (or on Skip).
 * @param {object[]} pages
 * @param {{finalLabel?:string, onDone:Function}} opts
 */
export function playStoryCards(pages, { finalLabel = 'Continue', onDone }) {
  let i = 0;
  const finish = () => { hideCard(); onDone(); };
  const show = () => {
    const last = i === pages.length - 1;
    const buttons = [{ label: last ? finalLabel : 'Next', primary: true, onClick: () => { if (last) finish(); else { i++; show(); } } }];
    if (!last) buttons.push({ label: 'Skip story', onClick: finish });
    showCard(pageHtml(pages[i], i, pages.length), buttons);
    // Recorded voice line for this page, if there is one.
    audio.stopVoice();
    if (pages[i].voice) audio.voice(pages[i].voice);
  };
  show();
}

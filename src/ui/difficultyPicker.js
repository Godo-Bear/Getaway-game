// The Easy / Normal / Hard picker (Settings and the Story screen).

import { DIFFICULTY_LIST, diff, setDifficulty } from '../core/difficulty.js';

export { DIFFICULTY_LIST, diff, setDifficulty };

export function difficultyPickerHtml() {
  const d = diff();
  return `<div class="tabs diff-tabs">${DIFFICULTY_LIST.map((x) =>
    `<button class="tab${x.id === d.id ? ' on' : ''}" data-diff="${x.id}">${x.name}</button>`).join('')}</div>
    <p class="sub fine diff-desc" id="diff-desc">${d.desc}</p>`;
}

/** Make the picker's buttons work (call after the card is shown). */
export function bindDifficultyPicker(onChange) {
  for (const b of document.querySelectorAll('#card [data-diff]')) {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      setDifficulty(b.dataset.diff);
      for (const x of document.querySelectorAll('#card [data-diff]')) x.classList.toggle('on', x === b);
      const desc = document.getElementById('diff-desc');
      if (desc) desc.textContent = diff().desc;
      onChange?.();
    });
  }
}

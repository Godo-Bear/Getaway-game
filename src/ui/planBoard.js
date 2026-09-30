// Heist planning board: before a heist, pick how you get in and what you
// bring. Each choice comes from a crew member and changes how the level
// plays (see the part's `plan` in the chapter file, and the heist mode).
//
//   plan = { title, text, groups: [{ id, label, options: [{ id, name, who, text }] }] }
//   choice = { [groupId]: optionId }

import { showCard } from './menus.js';
import { SUSPECTS } from '../story/crew.js';

/** The first option of every group. */
export function defaultPlan(plan) {
  return Object.fromEntries(plan.groups.map((g) => [g.id, g.options[0].id]));
}

/**
 * @param {object} plan
 * @param {object} choice - current picks (changed in place)
 * @param {Function} onDone - called with the final choice
 */
export function showPlanBoard(plan, choice, onDone) {
  const html = () => `
    <p class="kicker">Planning the job</p>
    <h2>${plan.title || 'The plan'}</h2>
    ${plan.text ? `<p class="sub">${plan.text}</p>` : ''}
    ${plan.groups.map((g) => `
      <p class="sub setting-head">${g.label}</p>
      <div class="plan-row">${g.options.map((o) => {
        const who = o.who && SUSPECTS[o.who];
        return `<button class="plan-opt${choice[g.id] === o.id ? ' on' : ''}" data-g="${g.id}" data-o="${o.id}">
          ${who ? `<span class="plan-who" style="background:${who.color}">${who.name[0]}</span>` : ''}
          <b>${o.name}</b><small>${o.text}</small></button>`;
      }).join('')}</div>`).join('')}`;
  const render = () => {
    showCard(html(), [{ label: plan.startLabel || 'Go with this plan', primary: true, onClick: () => onDone(choice) }]);
    for (const b of document.querySelectorAll('.plan-opt')) {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        choice[b.dataset.g] = b.dataset.o;
        render();
      });
    }
  };
  render();
}

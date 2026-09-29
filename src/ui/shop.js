// The gadget Shop (title screen): buy gadgets with the cash you earn, and
// choose which one is equipped on foot and in the car.

import { showCard } from './menus.js';
import { GADGETS, cash, owns, equipped, buy, equip } from '../gadgets/gadgets.js';
import { audio } from '../core/audio.js';

const SECTIONS = [
  ['foot', 'On foot', 'Equip one. Press F to use it (LB on a gamepad, the Gadget button on a phone).'],
  ['car', 'In the car', 'Equip one. Press F while driving to use it.'],
  ['passive', 'Catch the mole', 'Always on once you own them.'],
];

export function showShop(onBack) {
  const render = () => {
    const html = SECTIONS.map(([kind, title, note]) => `
      <p class="sub setting-head">${title}</p>
      <p class="sub" style="font-size:14px;margin-top:-4px">${note}</p>
      <div class="shop-grid">${GADGETS.filter((g) => g.kind === kind).map((g) => {
        const have = owns(g.id);
        const isOn = equipped(g.kind)?.id === g.id;
        const afford = cash() >= g.price;
        const action = !have
          ? `<button class="chip buy" data-buy="${g.id}" ${afford ? '' : 'disabled'}>Buy $${g.price.toLocaleString('en-US')}</button>`
          : g.kind === 'passive' ? '<span class="owned">Owned · always on</span>'
            : isOn ? '<span class="owned">Equipped ✓</span>'
              : `<button class="chip" data-equip="${g.id}">Equip</button>`;
        return `<div class="gadget${have ? ' have' : ''}${isOn ? ' on' : ''}" style="--gc:${g.color}">
          <div class="g-orb">${g.icon}</div>
          <div class="g-body"><b>${g.name}</b>
            <span>${g.desc}</span>
            ${g.cooldown ? `<small>Recharge: ${g.cooldown} s</small>` : ''}
            <div class="g-act">${action}</div>
          </div></div>`;
      }).join('')}</div>`).join('');
    showCard(`
      <h2>Gadget shop</h2>
      <p class="shop-cash">Cash: <b>$${cash().toLocaleString('en-US')}</b></p>
      <p class="sub" style="font-size:14px">Earn cash from clues, finished story parts, solved chapters, cash bags and cash drops, and your survival scores.</p>
      ${html}`,
    [{ label: 'Done', primary: true, onClick: onBack }], { list: false });
    document.querySelectorAll('[data-buy]').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (buy(b.dataset.buy)) audio.sfx('cash');
      render();
    }));
    document.querySelectorAll('[data-equip]').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      equip(b.dataset.equip);
      render();
    }));
  };
  render();
}

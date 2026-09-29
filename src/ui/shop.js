// The gadget Shop (title screen): buy gadgets with the cash you earn, and
// choose which one is equipped on foot and in the car.
// One tab per category: Utility, Movement, Damage, Getaways, Mole.

import { showCard } from './menus.js';
import { GADGETS, CATEGORIES, cash, owns, equipped, buy, equip } from '../gadgets/gadgets.js';
import { audio } from '../core/audio.js';
import { admin } from '../core/admin.js';

const USE = {
  foot: 'On foot · press F',
  car: 'In the car · press F',
  passive: 'Always on',
};

let lastTab = 'utility';

export function showShop(onBack) {
  const render = (tab = lastTab) => {
    const cats = CATEGORIES.filter((c) => !c.adminOnly || admin.on);
    if (!cats.some((c) => c.id === tab)) tab = cats[0].id;
    lastTab = tab;
    const cat = cats.find((c) => c.id === tab);
    const tabs = cats.map((c) => {
      const n = GADGETS.filter((g) => g.cat === c.id).length;
      const have = GADGETS.filter((g) => g.cat === c.id && owns(g.id)).length;
      return `<button class="tab${c.id === tab ? ' on' : ''}" data-tab="${c.id}">${c.name}<small>${have}/${n}</small></button>`;
    }).join('');
    const cards = GADGETS.filter((g) => g.cat === tab).map((g) => {
      const have = owns(g.id);
      const isOn = equipped(g.kind)?.id === g.id;
      const afford = cash() >= g.price;
      const action = !have
        ? `<button class="chip buy" data-buy="${g.id}" ${afford ? '' : 'disabled'}>${g.price ? `Buy · $${g.price.toLocaleString('en-US')}` : 'Take it (free)'}</button>`
        : g.kind === 'passive' ? '<span class="owned">Owned ✓</span>'
          : isOn ? '<span class="owned">Equipped ✓</span>'
            : `<button class="chip" data-equip="${g.id}">Equip</button>`;
      return `<div class="gadget${have ? ' have' : ''}${isOn ? ' on' : ''}" style="--gc:${g.color}">
        <div class="g-orb">${g.icon}</div>
        <div class="g-body">
          <div class="g-top"><b>${g.name}</b><span class="g-use">${USE[g.kind]}${g.cooldown ? ` · ${g.cooldown}s recharge` : ''}</span></div>
          <span>${g.desc}</span>
          <div class="g-act">${action}</div>
        </div></div>`;
    }).join('');
    const foot = equipped('foot'), car = equipped('car');
    showCard(`
      <div class="shop-head">
        <h2>Gadget shop</h2>
        <div class="shop-cash"><span>Cash</span><b>$${cash().toLocaleString('en-US')}</b></div>
      </div>
      <div class="loadout">
        <span>Equipped:</span>
        <span class="slot" style="--gc:${foot?.color || '#555'}">${foot ? `${foot.icon} ${foot.name}` : 'nothing'} <small>on foot</small></span>
        <span class="slot" style="--gc:${car?.color || '#555'}">${car ? `${car.icon} ${car.name}` : 'nothing'} <small>in the car</small></span>
      </div>
      <div class="tabs">${tabs}</div>
      <p class="sub tab-blurb">${cat.blurb}</p>
      <div class="shop-grid">${cards}</div>
      <p class="sub fine">Earn cash from clues, story parts, solved chapters, Speedruns, cash bags, and every survival or Free Run session.</p>`,
    [{ label: 'Done', primary: true, onClick: onBack }], { list: false });
    document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      render(b.dataset.tab);
    }));
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

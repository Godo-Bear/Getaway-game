// The gadget Shop (title screen): buy gadgets with the cash you earn, buy
// gadget slots (up to 3, even the first one costs cash), and choose which
// gadgets go in your slots on foot and in the car (keys 1, 2, 3 in a game).
// One tab per category: Utility, Movement, Damage, Getaways, Mole.

import { showCard } from './menus.js';
import { GADGETS, CATEGORIES, MAX_SLOTS, cash, owns, buy, equip, unequip, areaLocked, equippedList, slotsOwned, slotOf, nextSlotPrice, buySlot } from '../gadgets/gadgets.js';
import { audio } from '../core/audio.js';
import { admin } from '../core/admin.js';

const USE = {
  foot: 'On foot · keys 1-3',
  car: 'In the car · keys 1-3',
  passive: 'Always on',
};

let lastTab = 'utility';

export function showShop(onBack) {
  const render = (tab = lastTab) => {
    const cats = CATEGORIES.filter((c) => !c.adminOnly || admin.adminGadgets);
    if (!cats.some((c) => c.id === tab)) tab = cats[0].id;
    lastTab = tab;
    const cat = cats.find((c) => c.id === tab);
    const tabs = cats.map((c) => {
      const n = GADGETS.filter((g) => g.cat === c.id).length;
      if (c.area) return `<button class="tab${c.id === tab ? ' on' : ''}" data-tab="${c.id}">${areaLocked(GADGETS.find((g) => g.cat === c.id)) ? '🔒 ' : '📍 '}${c.name}<small>${GADGETS.filter((g) => g.cat === c.id && owns(g.id)).length}/${n}</small></button>`;
      const have = GADGETS.filter((g) => g.cat === c.id && owns(g.id)).length;
      return `<button class="tab${c.id === tab ? ' on' : ''}" data-tab="${c.id}">${c.name}<small>${have}/${n}</small></button>`;
    }).join('');
    const cards = GADGETS.filter((g) => g.cat === tab).map((g) => {
      const have = owns(g.id);
      const at = slotOf(g.id), isOn = at >= 0;
      const n = slotsOwned(), list = g.kind === 'passive' ? [] : equippedList(g.kind), free = list.findIndex((x) => !x);
      const afford = cash() >= g.price;
      const locked = areaLocked(g);
      const action = locked ? `<span class="owned">🔒 Get to ${cat.area.place} in the story</span>` : !have
        ? `<button class="chip buy" data-buy="${g.id}" ${afford ? '' : 'disabled'}>${g.price ? `Buy · $${g.price.toLocaleString('en-US')}` : 'Take it (free)'}</button>`
        : g.kind === 'passive' ? '<span class="owned">Owned ✓</span>'
          : isOn ? `<span class="owned">In slot ${at + 1} ✓</span> <button class="chip" data-unequip="${g.id}">Take out</button>`
            : !n ? '<span class="owned">Buy a gadget slot first (top of the Shop)</span>'
              : free >= 0 ? `<button class="chip" data-equip="${g.id}">Put in slot ${free + 1}</button>`
                : list.map((x, i) => `<button class="chip" data-equip="${g.id}" data-slot="${i}" title="Swap out ${x.name}">Swap into ${i + 1}</button>`).join(' ');
      return `<div class="gadget${have ? ' have' : ''}${isOn ? ' on' : ''}" style="--gc:${g.color}">
        <div class="g-orb">${g.icon}</div>
        <div class="g-body">
          <div class="g-top"><b>${g.name}</b><span class="g-use">${USE[g.kind]}${g.cooldown ? ` · ${g.cooldown}s recharge` : ''}</span></div>
          <span>${g.desc}</span>
          <div class="g-act">${action}</div>
        </div></div>`;
    }).join('');
    const n = slotsOwned(), price = nextSlotPrice();
    const slotRow = (kind, label) => `<div class="slot-row"><small>${label}</small>${Array.from({ length: MAX_SLOTS }, (_, i) => {
      if (i >= n) return `<span class="slot locked">${i + 1} · 🔒</span>`;
      const g = equippedList(kind)[i];
      return `<span class="slot" style="--gc:${g?.color || '#555'}"><b>${i + 1}</b> ${g ? `${g.icon} ${g.name}` : 'empty'}</span>`;
    }).join('')}</div>`;
    showCard(`
      <div class="shop-head">
        <h2>Gadget shop</h2>
        <div class="shop-cash"><span>Cash</span><b>$${cash().toLocaleString('en-US')}</b></div>
      </div>
      <div class="loadout slots">
        <div class="slot-head"><span>Gadget slots: <b>${n}/${MAX_SLOTS}</b></span>${price != null
          ? `<button class="chip buy" data-buyslot ${cash() >= price ? '' : 'disabled'}>Buy slot ${n + 1} · $${price.toLocaleString('en-US')}</button>`
          : '<span class="owned">All slots ✓</span>'}</div>
        ${slotRow('foot', 'On foot')}
        ${slotRow('car', 'In the car')}
        <p class="sub fine">${n ? 'In a game, press 1, 2 or 3 to use the gadget in that slot (on a phone: tap its button).' : 'You need a gadget slot to use gadgets, even the first one. Each slot holds one gadget on foot and one in the car.'}</p>
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
      equip(b.dataset.equip, b.dataset.slot != null ? Number(b.dataset.slot) : null);
      render();
    }));
    document.querySelectorAll('[data-unequip]').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      unequip(b.dataset.unequip);
      render();
    }));
    document.querySelector('[data-buyslot]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (buySlot()) audio.sfx('cash');
      render();
    });
  };
  render();
}

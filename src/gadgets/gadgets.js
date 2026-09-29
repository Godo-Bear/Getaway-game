// Gadgets: the shop's stock, and the cash you buy them with.
//
// Cash is earned by playing (clues, finished parts, solved chapters, cash
// bags and cash drops, and a share of your survival scores) and spent in the
// Shop on the title screen.
//
// Two kinds of gadget:
//   active  - equip one for on foot and one for the car; press F (LB on a
//             gamepad, the Gadget button on a phone) to use it, then it
//             recharges for a while.
//   passive - always working once you own them.
//
// What each gadget actually does lives in footGadgets.js / carGadgets.js.

import { save } from '../core/save.js';
import { audio } from '../core/audio.js';

export const GADGETS = [
  // ---- On foot
  { id: 'smoke', kind: 'foot', name: 'Smoke Bomb', price: 400, cooldown: 22, color: '#b8c0cc', icon: '☁',
    desc: 'Bursts into a thick cloud at your feet. For 6 seconds helicopters and officers can\'t see you, and the spotlight meter drains away.' },
  { id: 'decoy', kind: 'foot', name: 'Holo-Decoy', price: 800, cooldown: 28, color: '#39e6ff', icon: '◈',
    desc: 'Drops a glowing hologram of you. For 8 seconds the spotlights and officers chase it instead of you.' },
  { id: 'grapple', kind: 'foot', name: 'Grapple Gun', price: 1200, cooldown: 7, color: '#ffb020', icon: '⤴',
    desc: 'Aim at a building up to 24 m away and fire: a cable yanks you up onto its roof, even from the street (up to 18 m up).' },
  // ---- In the car
  { id: 'oil', kind: 'car', name: 'Oil Slick', price: 500, cooldown: 14, color: '#8a5cff', icon: '◐',
    desc: 'Dumps a slick of oil behind the car. Police cars that hit it spin out of control.' },
  { id: 'emp', kind: 'car', name: 'EMP Blast', price: 1400, cooldown: 30, color: '#3d9bff', icon: 'ϟ',
    desc: 'A shockwave that knocks out every police car within 45 m for 5 seconds. Sirens die, engines stall.' },
  { id: 'jammer', kind: 'car', name: 'Signal Jammer', price: 1600, cooldown: 45, color: '#ff3a6a', icon: '⌁',
    desc: 'Scrambles the police radio for 8 seconds: they lose your trail on the spot and start searching somewhere else.' },
  // ---- Catch the mole (passive)
  { id: 'scanner', kind: 'passive', name: 'Clue Scanner', price: 600, color: '#4dffa6', icon: '⌖',
    desc: 'Always on. In story levels the marker points you to the nearest clue from anywhere on the map.' },
  { id: 'detector', kind: 'passive', name: 'Lie Detector', price: 1000, color: '#ffd27a', icon: '⚖',
    desc: 'Always on. At every deduction it clears one innocent suspect, so there are fewer to choose from.' },
];

export const gadget = (id) => GADGETS.find((g) => g.id === id);

const shop = () => save.data.shop;

export function cash() { return shop().cash; }
export function owns(id) { return shop().owned.includes(id); }
export function equipped(kind) { return shop().equipped[kind] ? gadget(shop().equipped[kind]) : null; }

/** Buy a gadget (and equip it straight away if its slot is free). Returns false if you can't afford it. */
export function buy(id) {
  const g = gadget(id);
  if (!g || owns(id) || shop().cash < g.price) return false;
  shop().cash -= g.price;
  shop().owned.push(id);
  if (g.kind !== 'passive' && !shop().equipped[g.kind]) shop().equipped[g.kind] = id;
  save.write();
  return true;
}

export function equip(id) {
  const g = gadget(id);
  if (!g || !owns(id) || g.kind === 'passive') return;
  shop().equipped[g.kind] = id;
  save.write();
}

/**
 * Earn cash. Shows a small "+$50" message unless quiet (use quiet when
 * another message is already on screen, like a clue's text).
 */
export function earn(game, amount, reason = '', { quiet = false } = {}) {
  amount = Math.round(amount);
  if (amount <= 0) return 0;
  shop().cash += amount;
  save.write();
  if (!quiet) {
    game?.hud?.toast(`+$${amount}`, reason, 'var(--safe)', 2);
    audio.sfx('cash', { vol: 0.5 });
  }
  return amount;
}

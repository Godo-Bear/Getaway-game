// Paint colours for the getaway car. Some are unlocked by gold ratings.
import { save } from '../core/save.js';

export const CAR_COLOURS = [
  { id: 'amber', name: 'Amber', hex: 0xff9f1a },
  { id: 'crimson', name: 'Crimson', hex: 0xc0182a },
  { id: 'cobalt', name: 'Cobalt', hex: 0x1f5fd1 },
  { id: 'emerald', name: 'Emerald', hex: 0x1f8a4c },
  { id: 'midnight', name: 'Midnight', hex: 0x1a1b20 },
  { id: 'gold-chapter1', name: 'Harbor Gold', hex: 0xd4a73a, unlock: 'Gold rating in Chapter 1' },
  { id: 'gold-chapter2', name: 'Pearl White', hex: 0xe8e6e0, unlock: 'Gold rating in Chapter 2' },
  { id: 'gold-chapter3', name: 'Neon Violet', hex: 0x7a2fd3, unlock: 'Gold rating in Chapter 3' },
];

export function isColourUnlocked(c) {
  return !c.unlock || (save.data.progress.carColours || []).includes(c.id);
}

/** The colour the player picked (falls back to amber). */
export function playerCarColour() {
  const c = CAR_COLOURS.find((x) => x.id === save.data.settings.carColour);
  return c && isColourUnlocked(c) ? c.hex : CAR_COLOURS[0].hex;
}

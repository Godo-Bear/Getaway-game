// Paint colours for the getaway car. Some are unlocked by gold ratings.
import { save } from '../core/save.js';

export const CAR_COLOURS = [
  { id: 'amber', name: 'Amber', hex: 0xff9f1a },
  { id: 'crimson', name: 'Crimson', hex: 0xc0182a },
  { id: 'cobalt', name: 'Cobalt', hex: 0x1f5fd1 },
  { id: 'emerald', name: 'Emerald', hex: 0x1f8a4c },
  { id: 'midnight', name: 'Midnight', hex: 0x1a1b20 },
  { id: 'lime', name: 'Lime', hex: 0x8ad01f },
  { id: 'sunset', name: 'Sunset Orange', hex: 0xe8541a },
  { id: 'sky', name: 'Sky Blue', hex: 0x5ab0f0 },
  { id: 'hotpink', name: 'Hot Pink', hex: 0xe83a9a },
  { id: 'snow', name: 'Snow White', hex: 0xd8dde4 },
  { id: 'olive', name: 'Army Green', hex: 0x4a5a32 },
  { id: 'gold-chapter1', name: 'Harbor Gold', hex: 0xd4a73a, unlock: 'Gold rating in Chapter 1' },
  { id: 'gold-chapter2', name: 'Pearl White', hex: 0xe8e6e0, unlock: 'Gold rating in Chapter 2' },
  { id: 'gold-chapter3', name: 'Neon Violet', hex: 0x7a2fd3, unlock: 'Gold rating in Chapter 3' },
  { id: 'gold-chapter4', name: 'Storm Chrome', hex: 0xa9b4c2, unlock: 'Gold rating in Chapter 4' },
];

export function isColourUnlocked(c) {
  return !c.unlock || (save.data.progress.carColours || []).includes(c.id);
}

// Mix and match the rest of the getaway car (Settings / pause menu -> Your car)
export const CAR_PARTS = {
  stripes: [{ id: 'black', name: 'Black', hex: 0x151515 }, { id: 'white', name: 'White', hex: 0xeeeeee }, { id: 'red', name: 'Red', hex: 0xc0182a }, { id: 'gold', name: 'Gold', hex: 0xd4a73a }, { id: 'blue', name: 'Blue', hex: 0x2a6ae8 }, { id: 'none', name: 'No stripes', hex: null }],
  rims: [{ id: 'steel', name: 'Steel', hex: 0x777777 }, { id: 'black', name: 'Black', hex: 0x1a1a1a }, { id: 'chrome', name: 'Chrome', hex: 0xd8dde4 }, { id: 'gold', name: 'Gold', hex: 0xd4a73a }, { id: 'red', name: 'Red', hex: 0xc0182a }],
  spoiler: [{ id: 'on', name: 'Spoiler' }, { id: 'off', name: 'No spoiler' }],
  windows: [{ id: 'clear', name: 'Clear', hex: null }, { id: 'tinted', name: 'Tinted', hex: 0x0a0c10 }],
  glow: [{ id: 'none', name: 'No underglow', hex: null }, { id: 'cyan', name: 'Cyan', hex: 0x39e6ff }, { id: 'pink', name: 'Pink', hex: 0xff4dd2 }, { id: 'green', name: 'Green', hex: 0x4dffa6 }, { id: 'orange', name: 'Orange', hex: 0xff8a2a }],
};

/** The rest of the player's car: { stripe, rims, spoiler, tint, glow } (hex values or null). */
export function playerCarStyle() {
  const c = save.data.settings.car || {};
  const pick = (k, d) => (CAR_PARTS[k].find((x) => x.id === c[k]) || CAR_PARTS[k].find((x) => x.id === d));
  return { stripe: pick('stripes', 'black').hex, rims: pick('rims', 'steel').hex, spoiler: pick('spoiler', 'on').id === 'on', tint: pick('windows', 'clear').hex, glow: pick('glow', 'none').hex };
}

/** The colour the player picked (falls back to amber). */
export function playerCarColour() {
  const c = CAR_COLOURS.find((x) => x.id === save.data.settings.carColour);
  return c && isColourUnlocked(c) ? c.hex : CAR_COLOURS[0].hex;
}

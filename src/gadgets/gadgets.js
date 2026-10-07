// Gadgets: the shop's stock, and the cash you buy them with.
//
// Cash is earned by playing (clues, finished parts, solved chapters, cash
// bags and cash drops, and a share of your survival scores) and spent in the
// Shop on the title screen.
//
// Five Shop categories (utility, movement, damage, getaways, mole), and two
// kinds of gadget:
//   active  - equip them into your gadget slots (on foot and in the car):
//             press 1, 2 or 3 to use the one in that slot (F uses the one
//             you used last; LB on a gamepad; a phone shows a button for
//             each), then it recharges for a while.
//
// Gadget slots cost cash, even the first one (SLOT_PRICES): each slot you
// buy holds one gadget on foot and one in the car, up to 3.
//   passive - always working once you own them.
//
// What each gadget actually does lives in footGadgets.js / carGadgets.js.

import { save } from '../core/save.js';
import { audio } from '../core/audio.js';
import { admin } from '../core/admin.js';
import { diff } from '../core/difficulty.js';

// Shop categories, in the order the Shop shows them.
export const CATEGORIES = [
  { id: 'hide', name: 'Hiding', blurb: 'Vanish from the police: cloaks, a cardboard box, a chameleon suit, quiet gear, and a car that changes its paint.' },
  { id: 'utility', name: 'Utility', blurb: 'Distract them and slip away.' },
  { id: 'movement', name: 'Movement', blurb: 'Get around the rooftops faster.' },
  { id: 'damage', name: 'Damage', blurb: 'Knock the police out of the chase.' },
  { id: 'getaway', name: 'Getaways', blurb: 'Upgrades for the getaway car.' },
  { id: 'mole', name: 'Mole', blurb: 'Find the clues and catch the traitor.' },
  // Local gadgets: each place the crew lives has its own, sold by the people
  // there. They unlock when the story reaches that place (area.unlock = chapter).
  { id: 'harbor', name: 'Harbor City', blurb: 'From the docks and the back streets of Harbor City.', area: { place: 'Harbor City', unlock: 1 } },
  { id: 'frost', name: 'Frostvale', blurb: 'Mountain gear from the ski town. Unlocks when the crew reaches Frostvale (Chapter 8).', area: { place: 'Frostvale', unlock: 8 } },
  { id: 'porto', name: 'Porto Sereno', blurb: 'Tricks from the harbour town. Unlocks when the crew lands in Porto Sereno (Chapter 13).', area: { place: 'Porto Sereno', unlock: 13 } },
  { id: 'neon', name: 'Neon Kōji', blurb: 'High-tech gear from the neon city. Unlocks when the crew gets to Neon Kōji (Chapter 16).', area: { place: 'Neon Kōji', unlock: 16 } },
  { id: 'admin', name: 'Admin', blurb: 'Admin-only specials. Free, and only in the Shop for admins (or players an admin shared them with).', adminOnly: true },
];

// kind: 'foot' / 'car' = press F to use (equip one of each), 'passive' = always on.
// cat: which Shop category it's listed under.
export const GADGETS = [
  // ---- Hiding
  { id: 'box', cat: 'hide', kind: 'foot', name: 'Cardboard Box', price: 500, cooldown: 15, color: '#c8a46a', icon: '▢',
    desc: 'Duck under a cardboard box. Nobody looks twice at a box: you\'re hidden while you stand still or creep along. Sprint, or press the gadget button again, to throw it off.' },
  { id: 'chameleon', cat: 'hide', kind: 'foot', name: 'Chameleon Suit', price: 1500, cooldown: 45, color: '#6affb0', icon: '◍',
    desc: 'For 12 seconds your suit copies everything around you: walk (don\'t sprint) and nobody can see you.' },
  { id: 'mirage', cat: 'hide', kind: 'foot', name: 'Mirage Cloak', price: 2600, cooldown: 60, color: '#b48cff', icon: '◌',
    desc: 'A light-bending cloak: completely invisible for 7 seconds, even at a sprint.' },
  { id: 'quiet', cat: 'hide', kind: 'passive', name: 'Ninja Kit', price: 1100, color: '#8a8fb0', icon: '☾',
    desc: 'Soft shoes and dark cloth: guards and police patrols spot you from a quarter less far.' },
  { id: 'plates', cat: 'hide', kind: 'car', name: 'Paint Shifter', price: 1800, cooldown: 60, color: '#ff7ad9', icon: '◧',
    desc: 'Flip the car\'s paint and number plates for 20 seconds: the police are looking for a different car and lose your trail.' },
  { id: 'blackout', cat: 'hide', kind: 'car', name: 'Blackout Mode', price: 1400, cooldown: 50, color: '#5a6a8a', icon: '◒',
    desc: 'Lights off, engine quiet, for 8 seconds: police only see you from very close.' },
  // ---- Utility
  { id: 'smoke', cat: 'hide', kind: 'foot', name: 'Smoke Bomb', price: 400, cooldown: 35, color: '#b8c0cc', icon: '☁',
    desc: 'Bursts into a thick cloud at your feet. For 6 seconds helicopters and officers can\'t see you, the spotlight meter drains away, and guards caught in the cloud stop and cough.' },
  { id: 'decoy', cat: 'utility', kind: 'foot', name: 'Holo-Decoy', price: 800, cooldown: 45, color: '#39e6ff', icon: '◈',
    desc: 'Throws a glowing hologram of you that runs off the way you\'re looking. For 8 seconds the spotlights and officers chase it instead of you.' },
  { id: 'jammer', cat: 'utility', kind: 'car', name: 'Signal Jammer', price: 1600, cooldown: 70, color: '#ff3a6a', icon: '⌁',
    desc: 'Scrambles the police radio for 8 seconds: they lose your trail on the spot, search somewhere else, and can\'t call in roadblocks.' },
  { id: 'locator', cat: 'utility', kind: 'foot', name: 'Locator', price: 600, cooldown: 30, color: '#5ab4ff', icon: '⌖',
    desc: 'A ping goes out: for 10 seconds everything nearby gets a marker, even through walls. Police and guards (red), cash (green), bags (amber), cars you could take (yellow) and where you\'re going (blue), with how far away each one is.' },
  { id: 'radar', cat: 'utility', kind: 'car', name: 'Radar Locator', price: 900, cooldown: 35, color: '#5ab4ff', icon: '⌖',
    desc: 'The car\'s radar pings: for 10 seconds every police car, the helicopter and where you\'re going get a marker on screen, with how far away they are.' },
  { id: 'clip', cat: 'utility', kind: 'passive', name: 'Money Clip', price: 1500, color: '#4dffa6', icon: '$',
    desc: 'You earn 25% more cash from everything.' },
  // ---- Movement
  { id: 'grapple', cat: 'movement', kind: 'foot', name: 'Grapple Gun', price: 1200, cooldown: 12, color: '#ffb020', icon: '⤴',
    desc: 'Aim at a building up to 24 m away: an orange ring shows where you\'ll land. Fire, and a cable yanks you up onto its roof, even from the street (up to 18 m up).' },
  { id: 'glider', cat: 'movement', kind: 'passive', name: 'Glider Wing', price: 1800, color: '#ff8a3d', icon: '◭',
    desc: 'Press Jump again in mid-air and hold it to open a wing and glide: you fall slowly and keep your speed, so you can sail across wide gaps and down from tall roofs.' },
  { id: 'springs', cat: 'movement', kind: 'passive', name: 'Spring Boots', price: 900, color: '#a6ff4d', icon: '⇞',
    desc: 'Every jump goes about 40% higher.' },
  { id: 'grips', cat: 'movement', kind: 'passive', name: 'Gecko Gloves', price: 700, color: '#5affd0', icon: '✋',
    desc: 'Wall-runs last twice as long.' },
  { id: 'blink', cat: 'movement', kind: 'foot', name: 'Blink', price: 2500, cooldown: 18, color: '#8af4ff', icon: '✦',
    desc: 'A short-range teleporter. A target ring shows where you\'re aiming (up to 16 m away): press the gadget button and you\'re there in a flash. Over a gap, up onto a ledge, or out of a guard\'s sight.' },
  // ---- Damage
  { id: 'flash', cat: 'damage', kind: 'foot', name: 'Flashbang', price: 1100, cooldown: 45, color: '#fff3a0', icon: '✸',
    desc: 'A blinding flash. Helicopter crews lose you for 5 seconds (their spotlights wander off), and officers and guards within 15 m are stunned for 5 seconds.' },
  { id: 'oil', cat: 'damage', kind: 'car', name: 'Oil Slick', price: 500, cooldown: 25, color: '#8a5cff', icon: '◐',
    desc: 'Dumps a trail of oil behind the car. Police cars that hit it spin out of control.' },
  { id: 'spikes', cat: 'damage', kind: 'car', name: 'Spike Drop', price: 900, cooldown: 35, color: '#ff9a3d', icon: '⋀',
    desc: 'Drops a spike strip behind the car. Police cars that cross it burst their tyres and crawl along for 10 seconds.' },
  { id: 'emp', cat: 'damage', kind: 'car', name: 'EMP Blast', price: 1400, cooldown: 50, color: '#3d9bff', icon: 'ϟ',
    desc: 'A shockwave that knocks out every police car within 45 m for 5 seconds (sirens die, engines stall), and shorts out the roadblocks nearby.' },
  { id: 'ram', cat: 'damage', kind: 'passive', name: 'Ram Plating', price: 1300, color: '#ff5a5a', icon: '▣',
    desc: 'A steel-plated bumper: ram a police car hard and it spins out for 3 seconds.' },
  // ---- Getaways
  { id: 'screen', cat: 'getaway', kind: 'car', name: 'Smoke Screen', price: 1200, cooldown: 55, color: '#9aa2ae', icon: '≋',
    desc: 'Your exhaust pours out thick smoke for 7 seconds. Police behind you can\'t see you unless they\'re right on your bumper.' },
  { id: 'tank', cat: 'getaway', kind: 'passive', name: 'Turbo Tank', price: 1000, color: '#2fa8ff', icon: '⛽',
    desc: 'A bigger nitro tank: nitro lasts 40% longer and refills 50% faster.' },
  { id: 'keycard', cat: 'getaway', kind: 'passive', name: 'Garage Keycard', price: 800, color: '#5a8aff', icon: 'P',
    desc: 'Parking garages lose the cops in 1 second (instead of 3), and parks and alleys work faster too.' },
  // ---- Mole
  { id: 'scanner', cat: 'mole', kind: 'passive', name: 'Clue Scanner', price: 600, color: '#4dffa6', icon: '⌖',
    desc: 'In story levels the marker points you to the nearest clue from anywhere on the map.' },
  { id: 'magnet', cat: 'mole', kind: 'passive', name: 'Clue Magnet', price: 500, color: '#ffc34d', icon: '⊕',
    desc: 'Pick up clues from 3 times further away, even from the roof next door.' },
  { id: 'evidence', cat: 'mole', kind: 'passive', name: 'Forensics Kit', price: 1200, color: '#ff7ad9', icon: '⌬',
    desc: 'The Case Board marks which clues are red herrings (planted to fool you).' },
  { id: 'detector', cat: 'mole', kind: 'passive', name: 'Lie Detector', price: 1000, color: '#ffd27a', icon: '⚖',
    desc: 'At every deduction it clears one innocent suspect, so there are fewer to choose from.' },
  // ---- Harbor City
  { id: 'foghorn', cat: 'harbor', kind: 'foot', name: 'Harbour Fog', price: 900, cooldown: 50, color: '#c8d4e0', icon: '≈',
    desc: 'A canister of sea fog: a big, thick cloud (9 m across) rolls out round you for 10 seconds. Inside it nobody can see you.' },
  { id: 'tow', cat: 'harbor', kind: 'car', name: 'Tow Hook', price: 1000, cooldown: 30, color: '#d8a028', icon: '⚓',
    desc: 'Fires a hook at the nearest police car behind you and yanks its wheel: it spins out and stalls for 5 seconds.' },
  { id: 'velvet', cat: 'harbor', kind: 'passive', name: 'Velvet Gloves', price: 800, color: '#c77dff', icon: '✋',
    desc: 'The lightest fingers in Harbor City: pickpocketing pays double and never adds to your wanted level.' },
  // ---- Frostvale
  { id: 'snowball', cat: 'frost', kind: 'foot', name: 'Snowball Launcher', price: 1100, cooldown: 30, color: '#e8f4ff', icon: '❅',
    desc: 'A blast of packed snowballs in front of you: every officer or guard in a 22 m cone is knocked dizzy for 4 seconds.' },
  { id: 'plough', cat: 'frost', kind: 'passive', name: 'Snow-Plough Bumper', price: 1400, color: '#ff9f1a', icon: '⛟',
    desc: 'A steel plough on the front of your car: ram a police car and it spins out (like Ram Plating).' },
  { id: 'skates', cat: 'frost', kind: 'passive', name: 'Ice Skates', price: 900, color: '#9fd4ff', icon: '⛸',
    desc: 'Blades that fold out of your shoes: you run 12% faster on foot, everywhere.' },
  // ---- Porto Sereno
  { id: 'gulls', cat: 'porto', kind: 'foot', name: 'Bag of Bread', price: 1000, cooldown: 40, color: '#f2ece0', icon: '🐦',
    desc: 'Throw the bread: a flock of seagulls mobs every officer and guard within 18 m. For 6 seconds they\'re too busy flapping to see you.' },
  { id: 'net', cat: 'porto', kind: 'car', name: 'Fishing Net', price: 1100, cooldown: 35, color: '#3a9a8a', icon: '#',
    desc: 'Drops a weighted fishing net behind the car: police cars that drive into it get tangled and crawl along for 10 seconds.' },
  { id: 'siesta', cat: 'porto', kind: 'foot', name: 'Siesta Dart', price: 1500, cooldown: 35, color: '#ffd070', icon: '➹',
    desc: 'A sleepy dart for the nearest officer or guard in front of you (up to 25 m): they curl up for a 20-second siesta.' },
  // ---- Neon Kōji
  { id: 'holo', cat: 'neon', kind: 'foot', name: 'Hologram Billboard', price: 1300, cooldown: 45, color: '#ff4fd8', icon: '▣',
    desc: 'A brighter, longer holo-decoy: your hologram runs off and the police chase it for 14 seconds.' },
  { id: 'drone', cat: 'neon', kind: 'passive', name: 'Spotter Drone', price: 1800, color: '#39e6ff', icon: '⌬',
    desc: 'A little drone watches the guards for you and warns you early: guards and patrols spot you from 20% less far.' },
  { id: 'surge', cat: 'neon', kind: 'car', name: 'Power Surge', price: 2000, cooldown: 60, color: '#8a5cff', icon: 'ϟ',
    desc: 'Overloads the city grid round you: every police car within 80 m stalls for 4 seconds and nearby roadblocks short out.' },
  // ---- Admin only (see src/core/admin.js)
  { id: 'rocket', cat: 'admin', kind: 'passive', adminOnly: true, name: 'Rocket Boots', price: 0, color: '#ff4dd2', icon: '🚀',
    desc: 'Jump again in mid-air as many times as you like: climb anything, cross any gap.' },
  { id: 'cloak', cat: 'admin', kind: 'foot', adminOnly: true, name: 'Invisibility Cloak', price: 0, cooldown: 20, color: '#b48cff', icon: '◌',
    desc: 'Turn invisible for 15 seconds: helicopters and officers can\'t see you at all.' },
  { id: 'freeze', cat: 'admin', kind: 'car', adminOnly: true, name: 'Police Freeze', price: 0, cooldown: 20, color: '#8af4ff', icon: '❄',
    desc: 'Every police car on the map freezes for 10 seconds and loses your trail.' },
  { id: 'teleport', cat: 'admin', kind: 'car', adminOnly: true, name: 'Teleporter', price: 0, cooldown: 5, color: '#ffe04d', icon: '⌖',
    desc: 'Opens the city map: tap anywhere and the car beams straight there. (Close the map and it isn\'t used up.)' },
];

export const gadget = (id) => GADGETS.find((g) => g.id === id);

/** Admin-only gadgets only work in admin mode (or if an admin shared them). */
const usable = (g) => g && (!g.adminOnly || admin.adminGadgets);

/** A local gadget whose place the story hasn't reached yet: still locked. */
export function areaLocked(g) {
  const a = CATEGORIES.find((c) => c.id === g?.cat)?.area;
  return !!a && (save.data.progress?.chapterUnlocked || 1) < a.unlock && !admin.on;
}

const shop = () => save.data.shop;

export function cash() { return shop().cash; }

/** Spend cash. Returns false (and spends nothing) if you can't afford it. */
export function spend(amount) {
  if (shop().cash < amount) return false;
  shop().cash -= amount;
  save.write();
  return true;
}
export function owns(id) { return shop().owned.includes(id) && usable(gadget(id)); }

// ---------------------------------------------------------------- slots
export const MAX_SLOTS = 3;
/** What the 1st, 2nd and 3rd gadget slots cost. */
export const SLOT_PRICES = [150, 600, 1500];

/** How many gadget slots you've bought (admins get all three). */
export function slotsOwned() {
  return admin.on ? MAX_SLOTS : Math.min(MAX_SLOTS, shop().slots || 0);
}
/** The price of the next slot (null when you have them all). */
export function nextSlotPrice() {
  const n = shop().slots || 0;
  return n >= MAX_SLOTS ? null : SLOT_PRICES[n];
}
/** Buy the next gadget slot. Returns false if you can't afford it (or have them all). */
export function buySlot() {
  const price = nextSlotPrice();
  if (price == null || shop().cash < price) return false;
  shop().cash -= price;
  shop().slots = (shop().slots || 0) + 1;
  // Fill the new slot with a gadget you own that isn't in a slot yet
  for (const kind of ['foot', 'car']) {
    const free = GADGETS.find((g) => g.kind === kind && owns(g.id) && !loadout(kind).includes(g.id));
    if (free) equip(free.id);
  }
  save.write();
  return true;
}

/** The ids in your slots for 'foot' or 'car' (always MAX_SLOTS long; older saves had one). */
function loadout(kind) {
  const s = shop();
  s.loadout ||= {};
  if (!Array.isArray(s.loadout[kind])) s.loadout[kind] = [s.equipped?.[kind] || null, null, null];
  return s.loadout[kind];
}
/** Keep the old single "equipped" field in step (the admin panel and cloud saves read it). */
function sync(kind) {
  shop().equipped ||= {};
  shop().equipped[kind] = equippedList(kind).find(Boolean)?.id || null;
}

/** Your gadgets for 'foot' or 'car', one per slot you've bought (null = empty slot). */
export function equippedList(kind) {
  return loadout(kind).slice(0, slotsOwned()).map((id) => {
    const g = id ? gadget(id) : null;
    return usable(g) && owns(g.id) ? g : null;
  });
}
/** Your first equipped gadget for 'foot' or 'car'. */
export function equipped(kind) {
  return equippedList(kind).find(Boolean) || null;
}
/** Which slot (0-2) a gadget is in, or -1. */
export function slotOf(id) {
  const g = gadget(id);
  return g && g.kind !== 'passive' ? equippedList(g.kind).findIndex((x) => x?.id === id) : -1;
}

/** Buy a gadget (and equip it straight away if its slot is free). Returns false if you can't afford it. */
export function buy(id) {
  const g = gadget(id);
  if (!usable(g) || owns(id) || areaLocked(g) || shop().cash < g.price) return false;
  shop().cash -= g.price;
  shop().owned.push(id);
  if (g.kind !== 'passive') equip(id); // (into a free slot, if you have one)
  save.write();
  return true;
}

/**
 * Put a gadget in a slot: the slot you pick (0-2), or the first free one.
 * Returns false if there's no slot for it (buy one first).
 */
export function equip(id, slot = null) {
  const g = gadget(id);
  if (!g || !owns(id) || g.kind === 'passive') return false;
  const L = loadout(g.kind), n = slotsOwned();
  const at = slot ?? equippedList(g.kind).findIndex((x) => !x);
  if (at == null || at < 0 || at >= n) return false;
  for (let i = 0; i < L.length; i++) if (L[i] === id) L[i] = null; // (it moves)
  L[at] = id;
  sync(g.kind);
  save.write();
  return true;
}
/** Take a gadget out of its slot. */
export function unequip(id) {
  const g = gadget(id);
  if (!g || g.kind === 'passive') return;
  const L = loadout(g.kind);
  for (let i = 0; i < L.length; i++) if (L[i] === id) L[i] = null;
  sync(g.kind);
  save.write();
}

/**
 * Earn cash. Shows a small "+$50" message unless quiet (use quiet when
 * another message is already on screen, like a clue's text).
 */
export function earn(game, amount, reason = '', { quiet = false } = {}) {
  amount = Math.round(amount * (owns('clip') ? 1.25 : 1) * diff().cash); // Money Clip, Hard difficulty
  if (amount <= 0) return 0;
  shop().cash += amount;
  save.write();
  if (!quiet) {
    game?.hud?.toast(`+$${amount}`, reason, 'var(--safe)', 2);
    audio.sfx('cash', { vol: 0.5 });
  }
  return amount;
}

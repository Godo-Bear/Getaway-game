// Admin mode: unlocked with a code in Settings.
//
// On this device it gives you cheats for your own save: set your cash, no
// gadget recharge, god mode, infinite nitro, super speed, infinite range,
// admin-only gadgets, unlock everything, skip story parts.
//
// Admins can also SHARE abilities with other players (online accounts):
// those land in the player's save as `perks` and work for them without the
// code (see cloud.js setPlayerPerks).
//
// Changing OTHER players' cash is different: that happens on the server,
// and the Firestore rules only allow the admin account(s) listed there (see
// README.md, "Admin panel"). The code alone can't do it, because anything
// in the game's code can be read by anyone who looks.

import { save } from './save.js';

// SHA-256 of the admin code (lower case, single spaces), so it isn't
// sitting in the game's code as plain text.
const CODE_HASH = '9c925e1c9a939a528cedbc7bfa554bb837d5230ce8d34f8abfb34a0e17ce6fb7';

/**
 * Abilities: the admin's cheats, which can also be given to other players.
 * (Any of them on = speedrun times aren't saved.)
 */
export const ABILITIES = [
  // Stealth
  // Everything
  { id: 'doubleAll', group: 'Everything', name: 'Double everything', desc: 'Twice the cash, twice the time on every countdown, gadgets last twice as long and recharge twice as fast, nitro lasts twice as long, and you catch people twice as fast' },
  { id: 'god', group: 'Stealth', name: 'God mode', desc: 'Never caught, spotted out or busted' },
  { id: 'unseen', group: 'Stealth', name: 'Unseen', desc: 'Guards, street patrols and searchlights can\'t see you' },
  { id: 'noLasers', group: 'Stealth', name: 'No lasers', desc: 'Walk straight through laser beams' },
  { id: 'instantMini', group: 'Stealth', name: 'Instant hacks', desc: 'Every hack and safe opens the moment you start it' },
  // Movement
  { id: 'superSpeed', group: 'Movement', name: 'Super speed', desc: 'Run and drive much faster' },
  { id: 'moonJump', group: 'Movement', name: 'Moon jump', desc: 'Jump almost twice as high' },
  { id: 'alwaysGlide', group: 'Movement', name: 'Glider always on', desc: 'Press jump again in the air and hold it to glide, anywhere' },
  { id: 'infiniteNitro', group: 'Movement', name: 'Infinite nitro', desc: 'The nitro tank never empties' },
  // Gadgets
  { id: 'noCooldowns', group: 'Gadgets', name: 'No gadget recharge', desc: 'Use gadgets as often as you like' },
  { id: 'infiniteRange', group: 'Gadgets', name: 'Infinite range', desc: 'Grapple onto any building you can see; EMP and Flashbang hit every cop; smoke hides you anywhere' },
  { id: 'doublePower', group: 'Gadgets', name: 'Double power-ups', desc: 'Every gadget effect lasts twice as long: smoke, cloaks, the box, decoys, flashbangs, EMP, jammer, oil, spikes...' },
  { id: 'adminGadgets', group: 'Gadgets', name: 'Admin gadgets', desc: 'Rocket Boots, Invisibility Cloak, Police Freeze and Teleporter in the Shop' },
  // Fun
  { id: 'slowMo', group: 'Fun', name: 'Slow motion', desc: 'The whole game runs at half speed' },
  { id: 'bigHead', group: 'Fun', name: 'Big head', desc: 'Your character\'s head is twice the size' },
];
export const ABILITY_GROUPS = ['Everything', 'Stealth', 'Movement', 'Gadgets', 'Fun'];

const normalise = (s) => String(s).trim().toLowerCase().replace(/\s+/g, ' ');

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const admin = {
  /** Is admin mode unlocked on this device? */
  get on() {
    return !!save.data.admin?.unlocked;
  },

  /** Is this ability on? (the admin switched it on, or an admin gave it to this player) */
  flag(name) {
    return (this.on && !!save.data.admin[name]) || !!save.data.perks?.[name];
  },

  /** Abilities an admin has given this player: { god: true, ... } */
  get perks() {
    return save.data.perks || {};
  },

  /** Can this player use the admin-only gadgets? */
  get adminGadgets() {
    return this.on || !!save.data.perks?.adminGadgets;
  },

  set(name, value) {
    save.data.admin[name] = value;
    save.write();
  },

  /** Any cheat on right now? (speedrun times aren't saved then) */
  get cheating() {
    return ABILITIES.some((a) => a.id !== 'adminGadgets' && this.flag(a.id));
  },

  /** Try a code. Resolves true if it was right. */
  async unlock(code) {
    if (!globalThis.crypto?.subtle) throw new Error('This browser can\'t check the code (it needs a secure https page).');
    if ((await sha256(normalise(code))) !== CODE_HASH) return false;
    save.data.admin.unlocked = true;
    save.write();
    return true;
  },

  /** Lock admin mode again and switch every cheat off. */
  lock() {
    save.data.admin = { unlocked: false };
    save.write();
  },
};

// Admin mode: unlocked with a code in Settings.
//
// On this device it gives you cheats for your own save: set your cash, no
// gadget recharge, god mode, infinite nitro, super speed, admin-only
// gadgets, unlock everything, skip story parts.
//
// Changing OTHER players' cash is different: that happens on the server,
// and the Firestore rules only allow the admin account(s) listed there (see
// README.md, "Admin panel"). The code alone can't do it, because anything
// in the game's code can be read by anyone who looks.

import { save } from './save.js';

// SHA-256 of the admin code (lower case, single spaces), so it isn't
// sitting in the game's code as plain text.
const CODE_HASH = '9c925e1c9a939a528cedbc7bfa554bb837d5230ce8d34f8abfb34a0e17ce6fb7';

/** Cheats that make a speedrun time not count. */
const CHEATS = ['noCooldowns', 'god', 'infiniteNitro', 'superSpeed'];

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

  /** Is this admin option switched on? (always false for non-admins) */
  flag(name) {
    return this.on && !!save.data.admin[name];
  },

  set(name, value) {
    save.data.admin[name] = value;
    save.write();
  },

  /** Any cheat on right now? (speedrun times aren't saved then) */
  get cheating() {
    return this.on && CHEATS.some((c) => save.data.admin[c]);
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

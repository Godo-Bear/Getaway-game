import { save } from './save.js';
import { audio } from './audio.js';

// Jail: get caught by the police (or guards) three times, in any mode, and
// they take you to jail. You have to break out (jailMode.js); then you're
// back where you were (that level or run starts again). The count is kept
// in the save, so quitting doesn't reset it; breaking out does.

export const JAIL_AFTER = 3;

export function caughtCount() {
  return save.data.caughtCount || 0;
}

/**
 * Count a catch. Call it where a mode catches you (before its own "caught"
 * handling). Returns true if this catch sends you to jail: then don't do
 * anything else (the game is on its way there).
 */
export function noteCaught(state) {
  const game = state.game;
  if (!game || state.mode?.isJail || game.jailing) return false;
  const n = caughtCount() + 1;
  if (n < JAIL_AFTER) {
    save.data.caughtCount = n;
    save.write();
    game.hud.toast(`Caught: ${n} of ${JAIL_AFTER}`, n === JAIL_AFTER - 1 ? 'One more time and the police take you to jail!' : `Get caught ${JAIL_AFTER} times and you go to jail.`, 'var(--red)', 3);
    return false;
  }
  save.data.caughtCount = 0;
  save.write();
  sendToJail(state);
  return true;
}

/** Off to jail (and remember where to come back to). */
export function sendToJail(state) {
  const game = state.game;
  game.jailing = true;
  state.over = true;
  game.jailReturn = { name: game.sm.currentName, params: { ...(state.params || {}) } };
  audio.sfx('caught');
  game.hud.toast('Caught three times!', 'The police are taking you to jail. You\'ll have to break out.', 'var(--red)', 3);
  game.hud.setFade?.(true);
  setTimeout(() => {
    game.jailing = false;
    game.sm.change('onFoot', { mode: 'jail' });
    setTimeout(() => game.hud.setFade?.(false), 200);
  }, 1800);
}

/** Out! Back to where you were caught (or the title screen). */
export function leaveJail(game) {
  const r = game.jailReturn;
  game.jailReturn = null;
  if (r && r.name && r.name !== 'title') game.sm.change(r.name, r.params);
  else game.sm.change('title');
}

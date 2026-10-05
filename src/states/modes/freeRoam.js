// Free Run is one session across two worlds: the rooftops (on foot) and the
// streets (in the car). This file holds what they share: the session (police
// on or off, cash earned so far), switching between the two, and earning.

import { earn } from '../../gadgets/gadgets.js';
import { audio } from '../../core/audio.js';

export function freeSession(game) {
  return (game.freeRoam ||= { police: false, cash: 0 });
}

/** Start a Free Run session (from the title screen). */
export function startFreeRoam(game, { police = false, inCar = false } = {}) {
  game.freeRoam = { police, cash: 0 };
  game.sm.change(inCar ? 'driving' : 'onFoot', { mode: 'free' });
}

/**
 * Swap between walking and the car ('foot' | 'car'), with a quick fade.
 * Getting out of the car puts you on the street next to your parked car.
 */
export function switchFreeRoam(state, to) {
  const game = state.game;
  if (state._switching) return;
  state._switching = true;
  state.over = true; // freeze while the other world loads
  game.hud.setFade(true);
  audio.sfx(to === 'car' ? 'door' : 'whoosh', { vol: 0.7 });
  setTimeout(() => {
    state._switching = false; // (the same state object is used again next time: let it switch again)
    game.sm.change(to === 'car' ? 'driving' : 'onFoot', { mode: 'free', arrived: true, fromCar: to === 'foot' });
    setTimeout(() => game.hud.setFade(false), 150);
  }, 220);
}

/** Earn cash in Free Run (also added to the session total shown in the HUD). */
export function freeEarn(game, amount, title, body = 'Cash for the Shop.') {
  const got = earn(game, amount, '', { quiet: true });
  freeSession(game).cash += got;
  game.hud.toast(`${title} +$${got}`, body, 'var(--safe)', 2);
  audio.sfx('cash', { vol: 0.6 });
  return got;
}

/** Pause-menu buttons: switch world, police on/off. */
export function freeRoamPauseButtons(state, where) {
  const game = state.game, s = freeSession(game);
  return [
    where === 'foot'
      ? { label: 'Drive the streets', sub: 'Jump in the car', onClick: () => { state.resume(); switchFreeRoam(state, 'car'); } }
      : { label: 'Get out and walk', sub: 'Park the car and go on foot (T)', onClick: () => { state.resume(); switchFreeRoam(state, 'foot'); } },
    {
      label: s.police ? 'Police: ON (turn off)' : 'Police: OFF (turn on)',
      sub: s.police ? 'Explore in peace' : 'A helicopter on the roofs and patrol cars on the streets. More cash for escaping',
      onClick: () => {
        s.police = !s.police;
        state.resume();
        state.over = true;
        game.sm.change(where === 'car' ? 'driving' : 'onFoot', { mode: 'free', arrived: true });
      },
    },
  ];
}

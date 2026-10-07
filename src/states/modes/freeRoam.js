// Free Run is one session across two worlds: the rooftops (on foot) and the
// streets (in the car). This file holds what they share: the session (police
// on or off, cash earned so far), switching between the two, and earning.

import { earn } from '../../gadgets/gadgets.js';
import { audio } from '../../core/audio.js';
import { DOWNTOWN_FOOT, DOWNTOWN_CAR, FROSTVALE_FOOT, FROSTVALE_CAR, PORTO_FOOT, PORTO_CAR } from '../../world/maps.js';
import { save } from '../../core/save.js';

/**
 * The maps you can roam (each has a city on foot and one to drive). More
 * open up as the story goes on (unlock = the chapter you need to reach).
 */
export const FREE_MAPS = {
  downtown: {
    name: 'Downtown', where: 'Harbor City', unlock: 1, icon: '🏙️',
    sub: 'Tall apartments, shop blocks and parks. Where it all started.',
    foot: DOWNTOWN_FOOT, car: DOWNTOWN_CAR, // (the same city as the story and every other mode)
  },
  oldtown: {
    name: 'Old Town', where: 'Harbor City', unlock: 4, icon: '🌳',
    sub: 'Lower, greener streets: more parks, more little shops, easy roofs.',
    foot: { seed: 4321, blocks: 7, parks: 0.3, shopBlocks: 0.4, lowRise: true }, car: { seed: 4242, blocks: 8, parkShare: 0.26 },
  },
  frostvale: {
    name: 'Frostvale', where: 'the mountains', unlock: 8, icon: '🏔️', snow: true,
    sub: 'The snowy ski town: chalet shops, snowy parks and pine trees.',
    foot: FROSTVALE_FOOT, car: FROSTVALE_CAR, // (the story's Frostvale)
  },
  porto: {
    name: 'Porto Sereno', where: 'abroad', unlock: 13, icon: '🌴', sunny: true,
    sub: 'A sunny harbour town: whitewashed streets, palm trees, trams and the sea.',
    foot: PORTO_FOOT, car: PORTO_CAR, // (the story's Porto Sereno)
  },
};

export function mapUnlocked(id) {
  return (save.data.progress.chapterUnlocked || 1) >= (FREE_MAPS[id]?.unlock ?? 99);
}

export function freeSession(game) {
  return (game.freeRoam ||= { police: false, cash: 0, map: 'downtown', weather: 'auto', time: 'cycle', hour: null });
}

/**
 * Free Run's time and weather (picked in the menu), for a mode to use:
 * sets mode.time / timeCycle (day and night come round, carrying on when
 * you swap between walking and the car) and mode.weather / weatherForced.
 */
export function applyFreeSky(mode, game, map) {
  const ses = freeSession(game);
  if ((ses.time || 'cycle') === 'cycle') {
    mode.time = ses.hour ?? 16.5; // (late afternoon: rush hour, then the sun goes down)
    mode.timeCycle = true;
  } else mode.time = ses.time;
  const w = ses.weather || 'auto';
  if (w === 'auto') mode.weather = map.snow ? 'snow' : undefined;
  else { mode.weather = w; mode.weatherForced = true; }
}

/**
 * How busy the streets are at this hour (0-1): quiet at night, packed at
 * rush hour (7:30-9:30 and 16:30-18:30).
 */
export function busyness(hour) {
  const h = ((hour % 24) + 24) % 24;
  if ((h >= 7.5 && h < 9.5) || (h >= 16.5 && h < 18.5)) return 1;
  if (h < 5.5 || h >= 23) return 0.3;
  if (h < 7.5) return 0.55;
  if (h >= 20) return 0.5;
  return 0.75;
}
export const isRushHour = (hour) => busyness(hour) >= 1;

/** The map this Free Run session is on. */
export function freeMap(game) {
  const id = freeSession(game).map;
  return { id, ...(FREE_MAPS[id] || FREE_MAPS.downtown) };
}

/** Start a Free Run session (from the title screen). */
export function startFreeRoam(game, { police = false, inCar = false, map = 'downtown', weather = 'auto', time = 'cycle' } = {}) {
  game.freeRoam = { police, cash: 0, map: mapUnlocked(map) ? map : 'downtown', weather, time, hour: null };
  game.sm.change(inCar ? 'driving' : 'onFoot', { mode: 'free' });
}

/**
 * Swap between walking and the car ('foot' | 'car'), with a quick fade.
 * Getting out of the car puts you on the street next to your parked car.
 * extra: more for the new mode (e.g. { stolen } for a car you stole).
 */
export function switchFreeRoam(state, to, extra = {}) {
  const game = state.game;
  if (state._switching) return;
  state._switching = true;
  state.over = true; // freeze while the other world loads
  game.hud.setFade(true);
  audio.sfx(to === 'car' ? 'door' : 'whoosh', { vol: 0.7 });
  setTimeout(() => {
    state._switching = false; // (the same state object is used again next time: let it switch again)
    game.sm.change(to === 'car' ? 'driving' : 'onFoot', { mode: 'free', arrived: true, fromCar: to === 'foot', ...extra });
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

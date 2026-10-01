// Difficulty: Easy / Normal / Hard (Settings, or the Story screen).
//
// Every number here multiplies (or adds to) the game's normal values, so
// Normal is always exactly the game as designed. Read the current one with
// diff(); the setting lives in save.data.settings.difficulty.

import { save } from './save.js';

export const DIFFICULTIES = {
  easy: {
    id: 'easy', name: 'Easy',
    desc: 'Slower police and spotlights, more time, and it takes longer to get caught.',
    spot: 0.8,         // helicopter spotlight speed
    fill: 0.55,        // how fast the Spotted / camera meters fill
    officerSpeed: 0.85,// police officers on foot
    fugitive: 0.9,     // the people you chase (on foot and in cars)
    catchRate: 1.4,    // how fast the catch meter fills when you're close
    cops: -1,          // police cars (never fewer than one)
    copSpeed: 0.88,    // police car speed
    bust: 0.55,        // how fast the Busted meter fills
    evade: 0.65,       // how long you must stay out of sight to lose them
    roadblocks: 1.6,   // time between roadblocks (bigger = rarer)
    timer: 1.4,        // time limits (e.g. the last ferry, the bank alarm)
    levelTime: 1.5,    // Rooftop Run: seconds per wanted level
    heatTime: 1.5,     // Street Chase / story drives: time before heat rises
    cash: 1,           // cash you earn
    guardSight: 0.75,  // how far casino guards can see
    miniZone: 1.4,     // hacking / safe-cracking: size of the target
    miniSpeed: 0.8,    // ... and how fast the marker moves
  },
  normal: {
    id: 'normal', name: 'Normal',
    desc: 'The game as designed.',
    spot: 1, fill: 1, officerSpeed: 1, fugitive: 1, catchRate: 1, cops: 0, copSpeed: 1, bust: 1,
    evade: 1, roadblocks: 1, timer: 1, levelTime: 1, heatTime: 1, cash: 1,
    guardSight: 1, miniZone: 1, miniSpeed: 1,
  },
  hard: {
    id: 'hard', name: 'Hard',
    desc: 'Faster police, an extra cop car, less time. You earn 25% more cash.',
    spot: 1.12, fill: 1.3, officerSpeed: 1.06, fugitive: 1.05, catchRate: 0.85, cops: 1, copSpeed: 1.06, bust: 1.35,
    evade: 1.3, roadblocks: 0.75, timer: 0.9, levelTime: 0.75, heatTime: 0.75, cash: 1.25,
    guardSight: 1.15, miniZone: 0.8, miniSpeed: 1.15,
  },
};

export const DIFFICULTY_LIST = [DIFFICULTIES.easy, DIFFICULTIES.normal, DIFFICULTIES.hard];

/** The current difficulty's numbers. */
export function diff() {
  const d = DIFFICULTIES[save.data.settings.difficulty] || DIFFICULTIES.normal;
  // Admin "Double everything": twice the cash, twice the time on every countdown, catch twice as fast
  const a = save.data.admin, doubled = (a?.unlocked && a.doubleAll) || save.data.perks?.doubleAll;
  if (!doubled) return d;
  if (_doubled?.base !== d) _doubled = { ...d, base: d, timer: d.timer * 2, cash: d.cash * 2, catchRate: d.catchRate * 2 };
  return _doubled;
}
let _doubled = null;

export function setDifficulty(id) {
  save.data.settings.difficulty = DIFFICULTIES[id] ? id : 'normal';
  save.write();
}

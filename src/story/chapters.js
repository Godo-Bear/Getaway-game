// All chapters, looked up by id.
import { CHAPTER1 } from './chapter1.js';
import { CHAPTER2 } from './chapter2.js';
import { CHAPTER3 } from './chapter3.js';
import { CHAPTER4 } from './chapter4.js';
import { CHAPTER5 } from './chapter5.js';
import { CHAPTER6 } from './chapter6.js';
import { CHAPTER7 } from './chapter7.js';
import { CHAPTER8 } from './chapter8.js';

export const CHAPTERS = { chapter1: CHAPTER1, chapter2: CHAPTER2, chapter3: CHAPTER3, chapter4: CHAPTER4, chapter5: CHAPTER5, chapter6: CHAPTER6, chapter7: CHAPTER7, chapter8: CHAPTER8 };

// (the chapters themselves, in order: id, number, title, short, parts...)
export const CHAPTER_LIST = [CHAPTER1, CHAPTER2, CHAPTER3, CHAPTER4, CHAPTER5, CHAPTER6, CHAPTER7, CHAPTER8];

// Where the crew lives. Every few chapters they move on to a new city or
// country (a new look, new places to rob, new ways to get away). The chapter
// screen groups the chapters under these.
export const PLACES = [
  { name: 'Harbor City', where: 'The docks, the casino strip and the coast', from: 1, to: 7 },
  { name: 'Frostvale', where: 'A ski town high in the mountains: your new home', from: 8, to: 10 },
  { name: 'Somewhere new', where: 'After Frostvale the crew moves on: a new country', from: 11, to: 13 },
];
export const placeOf = (number) => PLACES.find((p) => number >= p.from && number <= p.to) || PLACES[PLACES.length - 1];

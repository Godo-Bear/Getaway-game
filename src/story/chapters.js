// All chapters, looked up by id.
import { CHAPTER1 } from './chapter1.js';
import { CHAPTER2 } from './chapter2.js';
import { CHAPTER3 } from './chapter3.js';
import { CHAPTER4 } from './chapter4.js';
import { CHAPTER5 } from './chapter5.js';
import { CHAPTER6 } from './chapter6.js';
import { CHAPTER7 } from './chapter7.js';
import { CHAPTER8 } from './chapter8.js';
import { CHAPTER9 } from './chapter9.js';
import { CHAPTER10 } from './chapter10.js';
import { CHAPTER11 } from './chapter11.js';
import { CHAPTER12 } from './chapter12.js';
import { CHAPTER13 } from './chapter13.js';
import { CHAPTER14 } from './chapter14.js';
import { CHAPTER15 } from './chapter15.js';

export const CHAPTERS = { chapter1: CHAPTER1, chapter2: CHAPTER2, chapter3: CHAPTER3, chapter4: CHAPTER4, chapter5: CHAPTER5, chapter6: CHAPTER6, chapter7: CHAPTER7, chapter8: CHAPTER8, chapter9: CHAPTER9, chapter10: CHAPTER10, chapter11: CHAPTER11, chapter12: CHAPTER12, chapter13: CHAPTER13, chapter14: CHAPTER14, chapter15: CHAPTER15 };

// (the chapters themselves, in order: id, number, title, short, parts...)
export const CHAPTER_LIST = [CHAPTER1, CHAPTER2, CHAPTER3, CHAPTER4, CHAPTER5, CHAPTER6, CHAPTER7, CHAPTER8, CHAPTER9, CHAPTER10, CHAPTER11, CHAPTER12, CHAPTER13, CHAPTER14, CHAPTER15];

// Where the crew lives. Every few chapters they move on to a new city or
// country (a new look, new places to rob, new ways to get away). The chapter
// screen groups the chapters under these.
export const PLACES = [
  { name: 'Harbor City', where: 'The docks, the casino strip and the coast', from: 1, to: 7 },
  { name: 'Frostvale', where: 'A ski town high in the mountains: your new home', from: 8, to: 12 },
  { name: 'Porto Sereno', where: 'A sunny harbour town abroad: trams, palm trees and the sea', from: 13, to: 15 },
  { name: 'Neon Kōji', where: 'A huge neon city on the other side of the world', from: 16, to: 18 },
];
export const placeOf = (number) => PLACES.find((p) => number >= p.from && number <= p.to) || PLACES[PLACES.length - 1];

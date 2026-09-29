// All chapters, looked up by id.
import { CHAPTER1 } from './chapter1.js';
import { CHAPTER2 } from './chapter2.js';
import { CHAPTER3 } from './chapter3.js';
import { CHAPTER4 } from './chapter4.js';

export const CHAPTERS = { chapter1: CHAPTER1, chapter2: CHAPTER2, chapter3: CHAPTER3, chapter4: CHAPTER4 };

export const CHAPTER_LIST = [CHAPTER1, CHAPTER2, CHAPTER3, CHAPTER4].map((c) => ({ id: c.id, title: c.title, number: c.number, available: true }));

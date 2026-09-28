// Hand-built on-foot levels, by name (chapter parts refer to them by name).
import { buildChapter1Rooftops } from './chapter1Rooftops.js';
import { buildChapter2Docks } from './chapter2Docks.js';
import { buildChapter3Headquarters } from './chapter3Headquarters.js';

export const LEVELS = {
  ch1Rooftops: buildChapter1Rooftops,
  ch2Docks: buildChapter2Docks,
  ch3Headquarters: buildChapter3Headquarters,
};

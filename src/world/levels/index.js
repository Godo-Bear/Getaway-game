// Hand-built on-foot levels, by name (chapter parts refer to them by name).
import { buildChapter1Rooftops } from './chapter1Rooftops.js';
import { buildChapter2Docks } from './chapter2Docks.js';
import { buildChapter3Headquarters } from './chapter3Headquarters.js';
import { buildChapter4Railyard } from './chapter4Railyard.js';
import { buildChapter5Recruit } from './chapter5Recruit.js';
import { buildChapter8Town } from './chapter8Town.js';
import { buildChapter13Port } from './chapter13Port.js';
import { buildChapter21Roofs } from './chapter21Roofs.js';

export const LEVELS = {
  ch1Rooftops: buildChapter1Rooftops,
  ch2Docks: buildChapter2Docks,
  ch3Headquarters: buildChapter3Headquarters,
  ch4Railyard: buildChapter4Railyard,
  ch5Recruit: buildChapter5Recruit,
  ch8Town: buildChapter8Town,
  ch13Port: buildChapter13Port,
  ch21Roofs: buildChapter21Roofs,
};

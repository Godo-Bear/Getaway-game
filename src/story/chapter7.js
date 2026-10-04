// Chapter 7: "Blackwater"
//
// The breakout. You're inside the prison (Chapter 6 got you in on the
// supply train). Steal a guard's keycard from a watchtower, get into
// D Block, past its lasers, open Ricky's cell, survive the lockdown, ride
// Mags's zip line over the wall to her boat, then drive Ricky home.
// No mole, no detective work: the crew is loyal (see CLAUDE.md).

const COAST_CITY = {
  seed: 7177, blocks: 8,
  forceKinds: { '6,1': 'safehouse', '1,6': 'buildings', '3,3': 'park', '5,5': 'park' },
};

export const CHAPTER7 = {
  id: 'chapter7',
  number: 7,
  title: 'Chapter 7: Blackwater',
  short: 'Blackwater',
  noDeduction: true,
  suspects: [],
  crew: ['mags', 'theo', 'ricky'],
  clues: {},
  verdicts: {},
  nextChapter: 'chapter8',
  rating: { gold: 600, silver: 960 },

  parts: [
    {
      id: 'yard', kind: 'onFoot', mode: 'prison', title: 'The yard',
      prison: { stage: 'yard' },
      intro: [
        { kicker: 'Blackwater Prison, 1:19 a.m.', title: 'Blackwater',
          lines: ['D Block\'s door needs a guard keycard. The night guard in the north-west watchtower leaves his up on the platform: climb the tower ladder and take it.'] },
        { kicker: 'How to play', title: 'The yard',
          lines: [
            'Searchlights sweep the yard: keep crates, walls or the bus between you and a tower. Guards patrol with torches (knock them out from behind with E).',
            'A guard uniform hangs in the dock office: in uniform, guards only notice you close up (it stays on for the rest of the breakout).',
          ] },
      ],
      startLabel: 'Go',
      objective: 'Get the keycard from the north-west watchtower',
      doneTitle: 'Into D Block',
      doneText: 'The keycard beeps green and the steel door slides open. Inside: a long corridor of cells, and red beams across it.',
    },
    {
      id: 'dblock', kind: 'onFoot', mode: 'prison', title: 'D Block',
      prison: { stage: 'dblock' },
      intro: [
        { kicker: 'D Block, 1:26 a.m.', who: 'theo',
          lines: ['"Ricky\'s in the cell at the east end. Those lasers switch off every few seconds, and the low ones you crouch under. When you open his cell, the alarm WILL go. Be ready to run."'] },
      ],
      startLabel: 'Go',
      objective: 'Get past the lasers to Ricky\'s cell',
      doneTitle: 'Alarm!',
      doneText: 'Every light in Blackwater comes on at once. Ricky grins at you. "Nice of you to drop by. Which way?" Over the wall.',
    },
    {
      id: 'lockdown', kind: 'onFoot', mode: 'prison', title: 'Lockdown',
      prison: { stage: 'lockdown' },
      intro: [
        { kicker: 'The yard, 1:31 a.m.', who: 'mags',
          lines: ['"The zip line\'s rigged on the east wall: up the stairs, jump onto the cable, and it\'ll take you both down to my boat. Keep out of the searchlights and you\'ll make it. Move!"'] },
      ],
      startLabel: 'Run',
      objective: 'Get Ricky over the east wall before the lockdown',
      doneTitle: 'Over the wall',
      doneText: 'You and Ricky fly down the zip line into the dark and drop into Mags\'s boat. Behind you, Blackwater is screaming.',
    },
    {
      id: 'coast', kind: 'drive', title: 'The coast road',
      time: 'dawn', weather: 'rain',
      intro: [
        { kicker: 'The old harbour, 4:48 a.m.', who: 'ricky',
          lines: ['"Theo left a car at the harbour? Give me the keys." Mags takes them first. "You\'ve been in a cell for two weeks. YOU are navigating."'] },
        { kicker: 'How to play', title: 'Home',
          lines: ['Every cop on the coast heard the prison alarm. Lose them, then get to the safehouse (green light).'] },
      ],
      startLabel: 'Drive',
      objective: 'Lose the police, then get to the safehouse',
      city: COAST_CITY,
      start: { node: [1, 6], offset: [2.3, -30], heading: Math.PI },
      goal: { type: 'safehouse', block: '6,1', label: 'Safehouse', loseCops: true },
      heat: { start: 3, max: 5, riseEvery: 40 },
      roadblocks: { fromHeat: 4, every: 26, spikes: true },
      doneTitle: 'Home',
      doneText: 'The garage door rattles down. Ricky gets out, stretches, and laughs for the first time in two weeks.',
    },
  ],

  outro: [
    { kicker: 'The safehouse, 5:20 a.m.', who: 'ricky',
      lines: ['"A tail light," Ricky says. "Two weeks in there because of a tail light."', '"And you came and got me. All of you. Over a prison wall."'] },
    { kicker: 'The safehouse', who: 'mags',
      lines: ['"Nobody gets left behind," Mags says. Then she turns on the TV. The morning news: all four of your faces, and a reward. A big one.'] },
  ],

  jobDone: {
    title: 'Ricky is free',
    text: 'The crew is back together. But there\'s a price on every one of your heads now, and this city has too many people who\'d like to collect it.',
  },
};

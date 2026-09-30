// Chapter 6: "The Iron Line"
//
// Two weeks after the Lucky Star, Ricky gets pulled over for a broken tail
// light with casino chips still under the seat. He's in Blackwater, the
// island prison you can only reach over the rail bridge. The crew is going
// to get him out: catch the prison's night supply train, ride it across the
// bridge and through the gate, then break Ricky out of his cell.
//
// No mole and no detective work here (see CLAUDE.md): the crew is loyal and
// the trouble comes from outside - the prison, the clock, and the train.
// Instead of clues there's loot: the prison's payroll is on the train.

const YARD_CITY = {
  seed: 6060, blocks: 8,
  forceKinds: { '6,6': 'freightyard', '4,3': 'park', '1,2': 'buildings', '2,5': 'park' },
};

export const CHAPTER6 = {
  id: 'chapter6',
  number: 6,
  title: 'Chapter 6: The Iron Line',
  short: 'The Iron Line',
  noDeduction: true,   // a breakout, not a whodunit: the chapter ends with the job done
  suspects: [],
  crew: ['mags', 'theo', 'ricky'], // (on the board at the end: the team, not suspects)
  clues: {},
  verdicts: {},
  nextChapter: null,
  rating: { gold: 540, silver: 840 },

  parts: [
    {
      id: 'catch', kind: 'drive', title: 'Catch the train',
      intro: [
        { kicker: 'Two weeks later', title: 'Ricky',
          lines: [
            'A broken tail light. That\'s all it took: a traffic cop pulled Ricky over, found a handful of Lucky Star chips under the seat, and now he\'s in Blackwater, the prison on the island.',
            'Nobody gets out of Blackwater. There\'s one way on or off the island: the rail bridge.',
          ] },
        { kicker: 'Mags\'s garage', who: 'mags',
          lines: ['"The prison\'s supply train leaves the freight yard at one o\'clock every night. Food, laundry, and the guards\' payroll. It goes straight over the bridge and in through the gate."',
            '"We\'re going to be on it."'] },
        { kicker: 'On the radio', who: 'theo',
          lines: ['"It\'s pulling out of the yard early! You\'ve got under three minutes to get to the freight yard before it\'s over the bridge. Go!"'] },
      ],
      startLabel: 'Go',
      objective: 'Get to the freight yard before the train leaves',
      city: YARD_CITY,
      start: { node: [1, 1], offset: [2.3, 30], heading: 0 },
      goal: { type: 'reach', block: '6,6', label: 'Freight yard', color: 0xff8a3d, timer: 170, timerLabel: 'Train leaves in',
        timeoutTitle: 'The train\'s gone', timeoutText: 'It rolled out without you. Take the fastest route, use nitro on the straights, and hack a junction if the police get close.' },
      heat: { start: 2, max: 4, riseEvery: 45 },
      roadblocks: { fromHeat: 4, every: 30, spikes: true },
      doneTitle: 'Made it',
      doneText: 'You skid into the freight yard as the last wagon rolls past the gate. You leave the car running and sprint for the ladder on the back of the train.',
    },
    {
      id: 'train', kind: 'onFoot', mode: 'train', title: 'The Iron Line',
      intro: [
        { kicker: 'On the supply train, 1:04 a.m.', title: 'The Iron Line',
          lines: [
            'You\'re on the back of the train. The front wagon is an open coal wagon with a tarp over it: get in there and hide before the train reaches the prison gate.',
          ] },
        { kicker: 'How to play', title: 'A moving train',
          lines: [
            'Run along the roofs and jump the gaps between the wagons. Two guards ride on top: stay out of their torch beams, or sneak up behind them and knock them out (E).',
            'LOW BRIDGES: when you hear the horn and see "BRIDGE!", crouch (C, or hold Slide) or drop down onto a flat wagon, or you\'ll be knocked off. The guards\' payroll is in green bags along the train: grab them for cash.',
          ] },
      ],
      startLabel: 'Run',
      objective: 'Get to the front wagon and hide under the tarp',
      doneTitle: 'Through the gate',
      doneText: 'You pull the tarp over your head. The train slows, the gate rumbles shut behind it, and a guard\'s torch sweeps over the coal. Then it moves on.',
    },
    {
      id: 'breakout', kind: 'onFoot', mode: 'prison', title: 'Blackwater',
      intro: [
        { kicker: 'Blackwater Prison, 1:19 a.m.', title: 'Blackwater',
          lines: [
            'You\'re in. Ricky is in D Block, the building at the far end of the yard. Get him out of his cell, then get both of you over the north-east wall: Mags has rigged a zip line down to her boat.',
          ] },
        { kicker: 'How to play', title: 'Breaking out',
          lines: [
            'Searchlights sweep the yard from the towers: stay out of the white circles, or keep something between you and the tower. Guards patrol with torches (yellow cones).',
            'A guard uniform is hanging in the dock office by the train: in uniform, the guards only notice you close up. Open Ricky\'s cell with a quick hack (press Jump when it lines up). Once he\'s out, the alarm goes: run for the wall, and he\'ll follow you.',
          ] },
      ],
      startLabel: 'Go get him',
      objective: 'Find Ricky\'s cell in D Block',
      doneTitle: 'Over the wall',
      doneText: 'You and Ricky fly down the zip line into the dark, over the rocks, and drop into Mags\'s boat. Behind you, every light in Blackwater comes on.',
    },
  ],

  outro: [
    { kicker: 'Mags\'s boat, 1:31 a.m.', who: 'ricky',
      lines: ['"A tail light," Ricky says, shaking his head. "Two weeks in there because of a tail light."',
        '"You came and got me. All of you. Over a prison wall."'] },
    { kicker: 'Mags\'s boat', who: 'mags',
      lines: ['"Course we did," Mags says, opening the throttle. "Nobody gets left behind. Now, somebody count that payroll."'] },
  ],

  // The results card (no deduction in this chapter)
  jobDone: {
    title: 'Ricky is free',
    text: 'The crew is back together, and the prison\'s payroll paid for the boat. Somewhere across the water, Blackwater is still counting its prisoners and coming up one short.',
  },
  finale: {
    title: 'The End (for now)',
    text: 'Four friends, one boat, and a city that has no idea what they\'re planning next.',
  },
};

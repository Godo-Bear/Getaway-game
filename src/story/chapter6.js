// Chapter 6: "The Iron Line"
//
// Two weeks after the Lucky Star, Ricky gets pulled over for a broken tail
// light with casino chips still under the seat. He's in Blackwater, the
// island prison you can only reach over the rail bridge. The crew's way in:
// the prison's night supply train. Catch it, crack the safe in its mail car
// for tonight's gate pass, then ride it across the sea bridge and through
// the gate hidden in the coal wagon. (The breakout itself is Chapter 7.)
//
// No mole and no detective work (see CLAUDE.md): the crew is loyal and the
// trouble comes from outside - the prison, the clock, the train itself.

const YARD_CITY = {
  seed: 6060, blocks: 8,
  forceKinds: { '6,6': 'freightyard', '4,3': 'park', '1,2': 'buildings', '2,5': 'park' },
};

export const CHAPTER6 = {
  id: 'chapter6',
  number: 6,
  title: 'Chapter 6: The Iron Line',
  short: 'The Iron Line',
  noDeduction: true,   // a job, not a whodunit: the chapter ends with the results
  suspects: [],
  crew: ['mags', 'theo', 'ricky'],
  clues: {},
  verdicts: {},
  nextChapter: 'chapter7',
  rating: { gold: 480, silver: 780 },

  parts: [
    {
      id: 'catch', kind: 'drive', title: 'Catch the train',
      intro: [
        { kicker: 'Two weeks later', title: 'Ricky',
          lines: [
            'A broken tail light. A traffic cop pulled Ricky over, found Lucky Star chips under the seat, and now he\'s in Blackwater: the prison on the island. One way on or off: the rail bridge.',
          ] },
        { kicker: 'Mags\'s garage', who: 'mags',
          lines: ['"The prison\'s supply train leaves the freight yard at one o\'clock. Food, laundry, the guards\' payroll, and tonight\'s gate pass in the mail car safe. Without that pass the gate guards search every wagon."',
            '"We get on, we get the pass, we ride it in."'] },
        { kicker: 'On the radio', who: 'theo',
          lines: ['"It\'s leaving early! You\'ve got under three minutes to reach the freight yard. Go!"'] },
      ],
      startLabel: 'Go',
      objective: 'Get to the freight yard before the train leaves',
      city: YARD_CITY,
      start: { node: [1, 1], offset: [2.3, 30], heading: 0 },
      goal: { type: 'reach', block: '6,6', label: 'Freight yard', color: 0xff8a3d, timer: 170, timerLabel: 'Train leaves in',
        timeoutTitle: 'The train\'s gone', timeoutText: 'It rolled out without you. Take the fastest route, use nitro on the straights, and hack a junction (E) if the police get close.' },
      heat: { start: 2, max: 4, riseEvery: 45 },
      roadblocks: { fromHeat: 4, every: 30, spikes: true },
      doneTitle: 'Made it',
      doneText: 'You skid into the freight yard as the last wagon rolls past the gate, and sprint for the step on the back of the train.',
    },
    {
      id: 'mailcar', kind: 'onFoot', mode: 'train', title: 'The mail car',
      train: { stage: 'mail' },
      intro: [
        { kicker: 'On the supply train, 1:04 a.m.', who: 'theo',
          lines: ['"The mail car is the red one in the middle, with a hatch in the roof. One guard rides inside. The safe\'s at the front end."'] },
        { kicker: 'How to play', title: 'A moving train',
          lines: [
            'Run along the roofs and jump the gaps. Two guards with torches walk the roofs: stay out of the beams, or sneak up behind and knock them out (E).',
            'LOW BRIDGES: horn + "BRIDGE!" = crouch (C / hold Slide) or get down onto a flat wagon. Green bags are the guards\' payroll: grab them.',
          ] },
      ],
      startLabel: 'Run',
      objective: 'Get into the mail car and crack the safe',
      doneTitle: 'Got the pass',
      doneText: 'The safe swings open: tonight\'s gate pass, stamped and signed, and a fat envelope of payroll. Theo whistles over the radio. "Now get to the front before the bridge."',
    },
    {
      id: 'seabridge', kind: 'onFoot', mode: 'train', title: 'The sea bridge',
      train: { stage: 'bridge' },
      intro: [
        { kicker: 'The Blackwater rail bridge, 1:12 a.m.', who: 'mags',
          lines: ['"Bad news: a police helicopter is following the train. It isn\'t looking for you yet. Keep it that way."'] },
        { kicker: 'How to play', title: 'The sea bridge',
          lines: [
            'Get to the coal wagon at the front and hide under the tarp before the train reaches the prison gate.',
            'Stay out of the helicopter\'s spotlight (duck into the mail car hatch or behind something tall). WIND: when the warning shows, crouch or you\'ll be blown off the train.',
          ] },
      ],
      startLabel: 'Go',
      objective: 'Get to the coal wagon and hide under the tarp',
      doneTitle: 'Through the gate',
      doneText: 'You pull the tarp over your head. The train slows, a guard takes the gate pass from the driver, and the gate rumbles shut behind you. You\'re inside Blackwater.',
    },
  ],

  outro: [
    { kicker: 'Blackwater rail dock, 1:18 a.m.', who: 'mags',
      lines: ['"You\'re in. Ricky\'s cell is in D Block, the far end of the yard. Rest a second. Then we get him out."'] },
  ],

  jobDone: {
    title: 'Inside Blackwater',
    text: 'You rode a prison train across the sea and through its own front gate, with its own gate pass. Ricky has no idea you\'re here. Yet.',
  },
};

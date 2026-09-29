// Chapter 1: "The Harbor Trust Job"
//
// Story: the heist at the Harbor Trust bank goes wrong. The police arrive
// the moment you empty the vault: someone tipped them off. You escape
// across the rooftops, drive to the safehouse, then work out who talked.
//
// The traitor in Chapter 1 is VINCE. Clues can point at the truth, or be
// red herrings that point at someone innocent. Clue ids match the pickups
// placed in src/world/levels/chapter1Rooftops.js and the drive mode.
//
// Story cards are lists of "pages": { kicker, title, who, lines[] }.
// `who` is a suspect id (colours the speaker name) or omitted for narration.

export const CHAPTER1 = {
  id: 'chapter1',
  number: 1,
  title: 'Chapter 1: The Harbor Trust Job',
  short: 'The Harbor Trust Job',
  traitor: 'vince',
  nextChapter: 'chapter2',
  rating: { gold: 420, silver: 640 }, // chapter time targets (seconds)
  deduction: { question: 'Who tipped off the police?' },

  // ---------------------------------------------------------------- Part 1
  heistIntro: [
    {
      kicker: 'Harbor Trust Bank, 11:52 p.m.',
      title: 'The Harbor Trust Job',
      lines: [
        'The back door was unlocked, just like Vince said it would be. The bank is dark and silent. Somewhere below, four pallets of cash are waiting in the vault.',
        'Vince planned it. Marla is on the radio, keeping the alarm quiet. Dex is outside in the van. All you have to do is get in, and get out.',
      ],
    },
    {
      kicker: 'On the radio',
      who: 'marla',
      lines: ['"The cameras are still live. Kill them in the security room first: it\'s the door on your left. Stay out of their red cones until then."'],
    },
    {
      kicker: 'On the radio',
      who: 'vince',
      lines: ['"The manager keeps the vault code in his office. Then it\'s just the keypad and the cash. In and out."'],
    },
    {
      kicker: 'How to play',
      title: 'The heist',
      lines: [
        'Follow the marker. To do something (switch off the cameras, grab the vault code, type it in, bag the cash), just run over its glowing ring.',
        'A camera that sees you for about a second raises the alarm early and sends you back to the door.',
      ],
    },
  ],

  // ---------------------------------------------------------------- Part 2
  prologue: [
    {
      kicker: 'Harbor Trust roof, 12:07 a.m.',
      title: 'Somebody talked',
      lines: [
        'The vault was open for ninety seconds when the sirens started. Real sirens, coming fast, from every direction. The police knew exactly when to come.',
        'Dex isn\'t answering the radio. The back door is swarming with cops. The only way out is across the rooftops.',
      ],
    },
    {
      kicker: 'On the radio',
      who: 'marla',
      lines: ['"Someone tipped them off. Keep your eyes open for anything that tells us who."'],
    },
    {
      kicker: 'How to play',
      title: 'The rooftops',
      lines: [
        'Follow the orange arrows and the blue checkpoint lights to the car. Keep out of the helicopter\'s spotlight.',
        'Three clues are hidden on the roofs: look for the tall amber light beams. Two are right on your path; the third is off to the side.',
      ],
    },
  ],
  rooftopObjective: 'Cross the rooftops to the getaway car',
  // Played over the helicopter's loudspeaker when it arrives
  heliCallout: { who: 'hale', line: 'This is Detective Hale. The building is surrounded. There is nowhere left to run.' },

  // ---------------------------------------------------------------- Part 3
  driveIntro: [
    {
      kicker: 'Pier Street garage, 12:19 a.m.',
      who: 'dex',
      lines: ['On the radio at last, breathless: "The whole block is crawling with cops. You\'ll have to drive through them."'],
    },
    {
      kicker: 'On the radio',
      who: 'vince',
      lines: ['"Lose them and get to the safehouse on the north side of town. Look for the green light."', 'Whatever you do, don\'t lead the police there.'],
    },
    {
      kicker: 'How to play',
      title: 'The drive',
      lines: [
        'Break line of sight until the police start SEARCHING (parks, alleys, the elevated railway and parking garages help), then pull up at the green light.',
      ],
    },
  ],
  driveObjective: 'Lose the cops, then get to the safehouse',

  // ---------------------------------------------------------------- Deduction
  outro: [
    {
      kicker: 'The safehouse, 12:31 a.m.',
      title: 'Safe. For now.',
      lines: ['The garage door rattles down behind you. The engine ticks as it cools. The cash is here. The crew isn\'t.'],
    },
    {
      kicker: 'On the radio',
      who: 'marla',
      lines: ['"Dex\'s phone is off. And the cops knew exactly when we\'d be in the vault."'],
    },
    {
      kicker: 'The safehouse',
      title: 'Who talked?',
      lines: [
        'Somebody on the crew sold you out tonight. You pin everything you found to the old corkboard and start pulling at the threads.',
        'Vince planned it. Marla ran the alarms. Dex drove. And Det. Hale knew exactly where to wait.',
      ],
    },
  ],

  clues: {
    // Three clues: two on the main route that point at the traitor, and one
    // red herring on the harder detour.
    phone: {
      name: 'Burner phone',
      text: 'Dropped by a police lookout. One text: "Back door unlocked at 12:05. Don\'t be late. - V". The police came in through the back door at exactly 12:05. The call log shows one call at 11:30, from the payphone at The Anchor (Vince\'s bar) to Det. Hale\'s direct line.',
      pointsTo: 'vince',
      explain: 'Only the planner knew the back-door timing, the text is signed "V", and the call to Hale came from Vince\'s own bar half an hour before the job. Vince told the police how to get in.',
    },
    earpiece: {
      name: 'Dex\'s earpiece',
      text: 'Dex\'s radio earpiece, switched off at 11:58, a minute before the sirens. The radio log on it shows why: at 11:57 the planner\'s handset (Vince\'s) ordered Dex to "switch to channel 9 and stay quiet".',
      pointsTo: 'vince',
      explain: 'Dex didn\'t run: Vince ordered him off the radio a minute before the police arrived, so nobody could warn you.',
    },
    floorplan: {
      name: 'Torn floor plan',
      text: 'The vault route, circled in green ink. Marla\'s colour... but the ink is still wet, and Marla was on the radio with you all night.',
      pointsTo: 'marla',
      redHerring: true,
      explain: 'A plant. The ink was still wet, but Marla never left the radio. Someone wanted you to blame her.',
    },
  },

  // What the result screen says for each accusation.
  verdicts: {
    vince: {
      correct: true,
      title: 'It was Vince',
      text: 'Vince planned the job, and then he sold it. He unlocked the back door for the police, fed Det. Hale the timing over drinks at The Anchor, and tried to pin it on Marla with a wet-ink floor plan.',
    },
    marla: {
      correct: false,
      title: 'Not Marla',
      text: 'Marla was on the radio with you the whole night, and she kept the alarm quiet until the very end. That green ink was still wet: someone planted it to frame her.',
    },
    dex: {
      correct: false,
      title: 'Not Dex',
      text: 'Dex went silent, but only because he was told to switch channels. He came back on the radio to warn you about the police at the garage. A traitor wouldn\'t have.',
    },
    hale: {
      correct: false,
      title: 'Hale is a cop, not the rat',
      text: 'Det. Hale was waiting for you, but a detective catching thieves isn\'t a betrayal. The question is who on your crew told Hale where to be.',
    },
  },

  // The parts of the chapter, played in order (then the deduction).
  get parts() {
    return [
      {
        id: 'heist', kind: 'onFoot', mode: 'heist', title: 'The heist',
        intro: this.heistIntro, startLabel: 'Start the heist',
        objective: 'Kill the security cameras',
        doneTitle: 'Out of the vault',
        doneText: 'Four pallets of cash, and every siren in the city coming your way. Somebody knew. The stairwell door bangs shut behind you as you run for the roof.',
      },
      {
        id: 'rooftops', kind: 'onFoot', title: 'The rooftops',
        level: 'ch1Rooftops',
        intro: this.prologue, startLabel: 'Start the escape',
        objective: this.rooftopObjective,
        heli: { delay: 5, spotSpeed: 5.8, fill: 0.6, lead: 0.15, callout: this.heliCallout },
        goal: { type: 'reach', label: 'Getaway car' },
        doneTitle: 'Made it to the car',
        doneText: 'The engine catches on the first try. Down below, the street is a wall of flashing lights. Time to drive.',
      },
      {
        id: 'drive', kind: 'drive', title: 'The drive',
        intro: this.driveIntro,
        objective: this.driveObjective,
        city: { seed: 1947, blocks: 8, forceKinds: { '4,3': 'park', '7,0': 'safehouse', '1,6': 'buildings', '2,6': 'alley' } },
        start: { node: [1, 7], offset: [2.3, 25], heading: Math.PI },
        goal: { type: 'safehouse', block: '7,0', label: 'Safehouse', loseCops: true },
        heat: { start: 2, max: 3, riseEvery: 60 },
        doneTitle: 'Safe. For now.',
        doneText: 'You pull into the safehouse with the cash. Now to work out who sold you out.',
      },
    ];
  },

  resultOutro: 'Vince\'s phone goes straight to voicemail. The Anchor is dark. Whatever he was paid, he isn\'t done yet. Neither are you.',
};

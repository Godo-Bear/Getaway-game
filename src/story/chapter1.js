// Chapter 1: "The Harbor Trust Job"
//
// Story: the heist at the Harbor Trust bank goes wrong. The police arrive
// minutes after you crack the vault: someone tipped them off. You escape
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

  // ---------------------------------------------------------------- Part 1
  prologue: [
    {
      kicker: 'Harbor Trust Bank, 12:07 a.m.',
      title: 'Somebody talked',
      lines: [
        'The vault was open for ninety seconds when the sirens started. Not the alarm: Marla had that covered. Real sirens, coming fast, from every direction.',
        'Dex isn\'t answering the radio. The back door is swarming with cops. The only way out is up.',
      ],
    },
    {
      kicker: 'On the radio',
      who: 'vince',
      lines: ['"Take the roofs. I left a car on top of the Pier Street garage. Go, go, go!"'],
    },
    {
      kicker: 'How to play',
      title: 'The rooftops',
      lines: [
        'Follow the orange arrows and the blue checkpoint lights to the car. Keep out of the helicopter\'s spotlight.',
        'Four clues are hidden on the roofs: look for the tall amber light beams. Two are on the main path, two a little off it.',
      ],
    },
  ],
  rooftopObjective: 'Cross the rooftops to the getaway car',

  // ---------------------------------------------------------------- Part 2
  driveIntro: [
    {
      kicker: 'Pier Street garage, 12:19 a.m.',
      who: 'dex',
      lines: ['Dex, on the radio at last, breathless: "The whole block is crawling with cops. You\'ll have to drive through them."'],
    },
    {
      kicker: 'On the radio',
      who: 'vince',
      lines: ['"Lose them first, then get to the safehouse on the north side of town. Look for the green light. Whatever you do, don\'t lead them there."'],
    },
    {
      kicker: 'How to play',
      title: 'The drive',
      lines: [
        'Break line of sight until the police start SEARCHING (parks, alleys and the elevated railway help), then pull up at the green light.',
        'One more clue is in the park in the middle of town. It\'s the amber dot on your minimap.',
      ],
    },
  ],
  driveObjective: 'Lose the cops, then get to the safehouse',

  // ---------------------------------------------------------------- Part 3
  outro: [
    {
      kicker: 'The safehouse, 12:31 a.m.',
      title: 'Safe. For now.',
      lines: ['The garage door rattles down behind you. The engine ticks as it cools. The cash is here. The crew isn\'t.'],
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
    phone: {
      name: 'Burner phone',
      text: 'Dropped by a lookout. One unread text: "Back door unlocked at 12:05. Don\'t be late. - V". The police came in through the back door at 12:05.',
      pointsTo: 'vince',
      explain: 'Only the planner knew the back-door timing, and the text is signed "V". Vince told the police how to get in.',
    },
    floorplan: {
      name: 'Torn floor plan',
      text: 'The vault route, circled in green ink. Marla\'s colour... but the ink is still wet, and Marla was on the radio with you all night.',
      pointsTo: 'marla',
      redHerring: true,
      explain: 'A plant. The ink was still wet, but Marla never left the radio. Someone wanted you to blame her.',
    },
    earpiece: {
      name: 'Dex\'s earpiece',
      text: 'Dex\'s radio earpiece, switched off at 11:58, a minute before the sirens. Did he run, or did someone tell him to go dark?',
      pointsTo: 'dex',
      redHerring: true,
      explain: 'Dex went dark because he was told to: the order to switch channels came from the planner. He showed up later to help you drive out.',
    },
    keycard: {
      name: 'Police keycard',
      text: 'Dropped at a police checkpoint, signed out to Det. Hale. Clipped to it: a receipt from The Anchor, Vince\'s bar, for two drinks at 11:30 tonight.',
      pointsTo: 'vince',
      explain: 'Det. Hale was drinking at The Anchor half an hour before the job. Hale didn\'t need a tip from the street: Hale got it from the bar owner.',
    },
    matchbook: {
      name: 'Anchor matchbook',
      text: 'A matchbook from The Anchor, Vince\'s bar. Written inside the flap: a phone number. It\'s Det. Hale\'s direct line.',
      pointsTo: 'vince',
      explain: 'Vince keeps the detective\'s private number in his own bar\'s matchbook. They\'ve talked before.',
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

  resultOutro: 'Vince\'s phone goes straight to voicemail. The Anchor is dark. Whatever he was paid, he isn\'t done yet. Neither are you.',
};

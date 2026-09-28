// Chapter 1: "The Harbor Trust Job"
//
// Story: the heist at the Harbor Trust bank goes wrong. The police arrive
// minutes after you crack the vault: someone tipped them off. You escape
// across the rooftops to the getaway car.
//
// The traitor in Chapter 1 is VINCE. Clues can point at the truth, or be
// red herrings that point at someone innocent. The rooftop clue ids below
// match the pickups placed in src/world/levels/chapter1Rooftops.js.

export const CHAPTER1 = {
  id: 'chapter1',
  title: 'Chapter 1: The Harbor Trust Job',
  traitor: 'vince',

  intro: {
    kicker: 'Harbor Trust Bank, 12:07 a.m.',
    title: 'Somebody talked',
    text: [
      'The vault was open for ninety seconds when the sirens started. Not the alarm: Marla had that covered. Real sirens, coming fast, from every direction.',
      'Dex isn\'t answering the radio. The back door is swarming with cops. The only way out is up.',
      'Vince\'s voice crackles in your ear: "Take the roofs. I left a car on top of the Pier Street garage. Go!"',
    ],
  },

  rooftopObjective: 'Cross the rooftops to the getaway car',

  driveIntro: {
    kicker: 'Pier Street, 12:19 a.m.',
    title: 'Lose them',
    text: [
      'Dex, on the radio at last, breathless: "The whole block is crawling with cops. You\'ll have to drive through them."',
      'Vince cuts in: "Lose them first, then get to the safehouse on the north side of town. Look for the green light. Whatever you do, don\'t lead them there."',
    ],
  },
  driveObjective: 'Lose the cops, then get to the safehouse',

  outro: {
    title: 'Safe. For now.',
    text: 'The garage door rattles down behind you. The engine ticks as it cools. Somebody on the crew sold you out tonight, and you\'re going to find out who.',
  },

  clues: {
    phone: {
      name: 'Burner phone',
      text: 'Dropped by a lookout. One unread text: "Back door unlocked at 12:05. Don\'t be late. - V". The police came in through the back door at 12:05.',
      pointsTo: 'vince',
    },
    floorplan: {
      name: 'Torn floor plan',
      text: 'The vault route, circled in green ink. Marla\'s colour... but the ink is still wet, and Marla was on the radio with you all night.',
      pointsTo: 'marla',
      redHerring: true,
    },
    earpiece: {
      name: 'Dex\'s earpiece',
      text: 'Dex\'s radio earpiece, switched off at 11:58, a minute before the sirens. Did he run, or did someone tell him to go dark?',
      pointsTo: 'dex',
      redHerring: true,
    },
    keycard: {
      name: 'Police keycard',
      text: 'Dropped at a police checkpoint, signed out to Det. Hale. Clipped to it: a receipt from The Anchor, Vince\'s bar, for two drinks at 11:30 tonight.',
      pointsTo: 'vince',
    },
    matchbook: {
      name: 'Anchor matchbook',
      text: 'A matchbook from The Anchor, Vince\'s bar. Written inside the flap: a phone number. It\'s Det. Hale\'s direct line.',
      pointsTo: 'vince',
    },
  },
};

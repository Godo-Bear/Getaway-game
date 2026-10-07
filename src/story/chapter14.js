// Chapter 14: "The Bella Fortuna"
//
// Porto Sereno. The casino ship anchored in the bay never comes into port,
// so no police can touch it, and nobody has ever robbed it. Part 1: Paz
// rows you out at night; climb aboard, cross the decks in a heavy swell
// (the ship rolls: crouch to hold on, and the guards grab the rail too),
// crack the counting room and jump overboard to Paz's speedboat. Part 2:
// the harbour police launches come out after you: lose them among the rocks
// and the reef (the Teeth), then slip into a sea cave in the cliffs.
// No mole, no detective work (see CLAUDE.md): the crew is loyal. The trouble
// is the ship's security, the sea, and the harbour police, one of whom
// turns out to be bent.

export const CHAPTER14 = {
  id: 'chapter14',
  number: 14,
  title: 'Chapter 14: The Bella Fortuna',
  short: 'The Bella Fortuna',
  noDeduction: true,
  suspects: [],
  crew: ['mags', 'theo', 'ricky', 'juno', 'paz'],
  clues: {},
  verdicts: {},
  nextChapter: null,
  rating: { gold: 480, silver: 800 },

  parts: [
    {
      id: 'aboard', kind: 'onFoot', mode: 'ship', title: 'Aboard',
      time: 'night', weather: 'clear',
      intro: [
        { kicker: 'The bay, 1:20 a.m.', who: 'paz',
          lines: ['The rowing boat bumps against a wall of white steel. Music thumps somewhere above. Paz ships the oars and points up at a rope ladder hanging down the side.',
            '"Security changed shifts ten minutes ago. Up you go. And hold on to something: there\'s a swell tonight."'] },
        { kicker: 'On the radio', who: 'mags',
          lines: ['"The counting room is right at the front, behind a STAFF ONLY door. Hack the door, crack the vault, take the lot."',
            '"When the alarm goes, Paz brings the speedboat round to the LEFT side of the ship. You jump. Don\'t miss."'] },
        { kicker: 'How to play', title: 'A ship in a swell',
          lines: ['Climb the rope ladder (walk into it, hold forward). Every so often a big swell rolls the ship: you\'ll get a warning, then the deck tips and you slide to the low side unless you crouch (C) to hold on. The guards hold on too, and their torches go off: that\'s your moment to slip past, or to knock one out (E). Keep out of the searchlight on the mast. The roof is a sun deck (ladder at the back) with an open skylight into the casino.'] },
      ],
      startLabel: 'Climb',
      objective: 'Climb the rope ladder up the side of the ship',
      doneTitle: 'Overboard!',
      doneText: 'You hit the black water feet first. A hand grabs your collar and hauls you over the side of the speedboat. Paz is laughing: "Hold on to the money. And to the boat!"',
    },
    {
      id: 'bay', kind: 'onFoot', mode: 'bay', title: 'Across the bay',
      time: 'night', weather: 'clear',
      intro: [
        { kicker: 'In the speedboat', who: 'paz',
          lines: ['Two blue lights are already sliding out of the harbour mouth. Paz hands you the wheel: "You drive, I watch. There is a sea cave in the cliffs to the west, where my cousins keep their boats."',
            '"But they must not see us go in. Lose them first. The rocks they call the Teeth: our boat fits through the gaps. Theirs do not."'] },
        { kicker: 'How to play', title: 'The speedboat',
          lines: ['Steer like the car (W/S or the stick), Jump (Space / the Jump button) is the boost, crouch (C) for a tight turn. A police launch that stays right next to you catches you, faster if you slow down. They can only chase what they can see: get rocks between you and them, or thread the narrow gaps in the reef. Once nobody has seen you for a few seconds, you\'ve lost them: then get into the sea cave (green light).'] },
      ],
      startLabel: 'Go',
      objective: 'Lose the police launches, then get into the sea cave in the western cliffs',
      doneTitle: 'Gone',
      doneText: 'The cave swallows the boat. Paz kills the engine and the darkness smells of salt and diesel. Outside, the blue lights sweep the empty water, then give up.',
    },
  ],

  outro: [
    { kicker: 'The sea cave, 3 a.m.', who: 'ricky',
      lines: ['Ricky counts it twice on an upturned crate. "That is a LOT of money." Mags just smiles and pours Paz a drink.',
        'Then Paz\'s phone buzzes. A photo: the speedboat, sliding into the cave. Taken from the cliff top.'] },
    { kicker: 'A message', who: 'paz',
      lines: ['"Very nice, my friends. Inspector Varga, harbour police. Half of it is mine, or tomorrow the whole city knows where the cave is."',
        'Paz goes pale. "Varga. He is the most crooked cop on the coast." Mags puts the phone down. "Then we don\'t pay him. We take something he can\'t report missing."'] },
  ],

  jobDone: {
    title: 'The Bella Fortuna',
    text: 'The ship nobody could rob, robbed. But the harbour police have a crooked inspector, and he wants a share.',
  },

  finale: {
    title: 'To be continued',
    text: 'Inspector Varga wants half. Mags has other ideas: the city festival is coming, and Varga is in charge of guarding it.',
  },
};

// Chapter 18: "Silver Dragons"
//
// Neon Kōji's finale. Ryu, who runs the Silver Dragons street-racing crew,
// challenged the crew: one race across the city, the winner keeps
// Kurogane's gold, the loser leaves Neon Kōji. Part 1: race Ryu's white car
// through the rainy neon streets to the foot of Kurogane Tower. You win,
// but while you raced, her crew emptied the Fox Den. Part 2: the gold is in
// a car on a car transporter in a convoy of Dragon trucks on the
// expressway: jump from truck roof to truck roof (crouch under the low
// bridges) and drive it off the back. Part 3: Kurogane heard everything:
// get the gold car to Juno's cargo plane at the airport before it goes.
// The crew leaves Neon Kōji for Lumière.
// No mole, no detective work (see CLAUDE.md): the crew is loyal; the
// trouble is a rival crew that cheats, and Kurogane.

const RYU_CAR = { stripe: 0xc0c8e0, rims: 0xd8d8d8, spoiler: true, tint: 0x1a1b20, glow: 0x9ab8ff, body: 'muscle' };

const RACE_CITY = {
  neon: true,
  forceKinds: { '1,7': 'dragons', '6,1': 'kurogane', '3,4': 'park', '5,5': 'park' },
};

const AIRPORT_CITY = {
  neon: true,
  forceKinds: { '7,7': 'airport', '6,1': 'kurogane', '1,6': 'foxden', '3,3': 'park', '2,5': 'park' },
};

export const CHAPTER18 = {
  id: 'chapter18',
  number: 18,
  title: 'Chapter 18: Silver Dragons',
  short: 'Silver Dragons',
  noDeduction: true,
  suspects: [],
  crew: ['mags', 'theo', 'ricky', 'juno', 'paz', 'kitsu'],
  clues: {},
  verdicts: {},
  nextChapter: 'chapter19',
  rating: { gold: 660, silver: 1020 },

  parts: [
    {
      id: 'race', kind: 'drive', title: 'The race',
      time: 'night', weather: 'rain',
      intro: [
        { kicker: 'The Dragons\' garage, midnight', who: 'ryu',
          lines: ['A hundred people in the rain, phones held up. Ryu leans on a white car with a silver dragon painted down its side. "From here to the foot of Kurogane Tower. No rules. The winner keeps the gold."',
            '"And the loser leaves Neon Kōji. Forever."'] },
        { kicker: 'On the radio', who: 'kitsu',
          lines: ['"I\'ve switched off every traffic camera in the city for an hour, so no police tonight. Just you, her and the rain. I\'ll turn the lights green for you, but she knows these streets better than anyone."'] },
        { kicker: 'How to play', title: 'Beat Ryu',
          lines: ['Get to Kurogane Tower (the red light) before Ryu\'s white car. Take the shortest way, cut through the parks, and use the nitro on the straights. She takes the odd wrong turn: that\'s your chance.'] },
      ],
      startLabel: 'Race',
      objective: 'Beat Ryu to Kurogane Tower',
      city: RACE_CITY,
      start: { node: [2, 7], offset: [2.3, -14], heading: Math.PI },
      noPolice: true,
      fugitive: { startNode: [2, 7], heading: Math.PI, name: 'Ryu', who: 'ryu', kind: 'player', color: 0xf0f0f4, style: RYU_CAR, speed: 0.95,
        escapeTitle: 'Ryu won', escapeText: 'Her white car was already parked under the tower when you got there. Try again: take the shortest way, cut through the parks, and keep the nitro for the straights.' },
      goal: { type: 'race', block: '6,1', label: 'Kurogane Tower', color: 0xff3040 },
      heat: { start: 1, max: 1, riseEvery: 999 },
      doneTitle: 'First!',
      doneText: 'You slide to a stop under Kurogane Tower a whole street ahead of the white car, and the crowd goes wild. Ryu climbs out slowly, with a strange little smile. Then Kitsu, in your ear: "The Fox Den. Somebody\'s been in. The gold is gone."',
    },
    {
      id: 'convoy', kind: 'onFoot', mode: 'highway', title: 'The convoy',
      time: 'night', weather: 'clear',
      intro: [
        { kicker: 'The Kōji Expressway, 3 a.m.', who: 'kitsu',
          lines: ['"While you raced, her crew cleaned out the Fox Den. The gold is in a yellow car on the top deck of a car transporter, heading for the docks with a convoy of Dragon trucks round it."',
            'Juno floors the van up the on-ramp. "I\'ll get you right up behind the last truck. After that, it\'s up to you."'] },
        { kicker: 'How to play', title: 'Truck to truck',
          lines: ['Jump from roof to roof along the convoy to the car transporter at the front. The trucks drift forward and back, so the gaps open and close: wait for a short one, and sprint to jump further. When the LOW BRIDGE warning comes, crouch (C) flat on the roof until it\'s gone over, or it sweeps you off. Then get into the gold car (E).'] },
      ],
      startLabel: 'Climb out',
      objective: 'Jump along the convoy to the car transporter at the front',
      doneTitle: 'Off the back',
      doneText: 'The gold car roars into life. Ricky, hanging out of the van window, hits the transporter\'s ramp release, and you drive straight off the back of the top deck and bounce down onto the expressway. Ryu\'s white car is right there. She just shakes her head, and laughs.',
    },
    {
      id: 'airport', kind: 'drive', title: 'Wheels up',
      time: 'night', weather: 'rain',
      car: { body: 'muscle', color: 0xffc020 },
      intro: [
        { kicker: 'The expressway, 4 a.m.', who: 'juno',
          lines: ['Juno, on the radio: "Kurogane heard the whole thing on the police radio. Every black car in the city is on its way to you."',
            '"Forget the Fox Den. I\'ve got a cargo plane at the airport with the engines running. We leave Neon Kōji tonight. All of us."'] },
        { kicker: 'How to play', title: 'Wheels up',
          lines: ['Drive the gold car to the AIRPORT (the blue light) before the plane has to go. Kurogane\'s black cars and the police they pay are everywhere, with roadblocks and spike strips when the heat is high. Hack junctions (E) and use the nitro.'] },
      ],
      startLabel: 'Drive',
      objective: 'Get the gold car to the cargo plane at the airport',
      city: AIRPORT_CITY,
      start: { node: [1, 1], offset: [2.3, 20], heading: 0 },
      goal: { type: 'reach', block: '7,7', label: 'Airport', color: 0x39e6ff, timer: 190, timerLabel: 'Plane leaves in', timeoutTitle: 'The plane left', timeoutText: 'Juno couldn\'t wait any longer. Try again: hack the junctions (E), cut through the parks, and keep the nitro for the straights.' },
      heat: { start: 3, max: 5, riseEvery: 40 },
      roadblocks: { fromHeat: 4, every: 28, spikes: true },
      doneTitle: 'Wheels up',
      doneText: 'You drive the gold car straight up the cargo plane\'s ramp, and the ramp is already closing behind you. Juno opens the throttles. Down below, a line of black cars skids to a stop at the end of the runway.',
    },
  ],

  outro: [
    { kicker: 'The cargo plane, 5 a.m.', who: 'ryu',
      lines: ['Ryu\'s face on Kitsu\'s laptop. "You won the race, and then you won it again. Fine. The gold is yours." A pause. "If you ever come back to Neon Kōji, we race again. For real."',
        'Kitsu grins at the screen. "Deal."'] },
    { kicker: 'Over the ocean', who: 'mags',
      lines: ['The crew sleeps on the gold, all but Mags and Kitsu. Kitsu turns her laptop round: a photo of a huge white diamond under glass. "The Star of Lumière. On show at the Grand Musée, for one week only."',
        'Mags looks at it for a long time. "Lumière. Boulevards, bridges, old palaces full of treasure." She smiles. "Tell Juno to change course."'] },
  ],

  jobDone: {
    title: 'Silver Dragons',
    text: 'You beat the Silver Dragons twice in one night, took the gold back off a moving convoy, and flew out of Neon Kōji. Goodbye, neon.',
  },

  finale: {
    title: 'To be continued',
    text: 'Next stop: Lumière, a grand old city of boulevards, bridges and museums, where the Star of Lumière is on show for one week only.',
  },
};

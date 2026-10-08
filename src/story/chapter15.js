// Chapter 15: "Festa"
//
// Porto Sereno's big night: the Festa de São Sereno, a parade of floats up
// the old town's main street to the cathedral. Inspector Varga (the crooked
// harbour cop from Chapter 14) is moving his bribe money in the chest on the
// golden galleon float, guarded by his own men, so he can never report it
// stolen. Part 1: on Paz's dirt bike, tail Varga's van (not too close) to
// find out which float the money goes on. Part 2: in a carnival big-head
// costume, dance up the street with
// the parade, climb onto the moving galleon and pick the chest's lock while
// his lookouts look away; then Theo blacks out the street and you run for
// the funicular. Part 3: ride the funicular up the hill, jump across to the
// other car as they pass (Varga's waiting at the top), ride down and reach
// Juno's seaplane. The crew leaves Porto Sereno for Neon Kōji.
// No mole, no detective work (see CLAUDE.md): the crew is loyal; the trouble
// is a bent cop.

const TAIL_CITY = {
  coastal: true,
  forceKinds: { '6,1': 'hq', '1,6': 'floatyard', '3,3': 'park', '4,5': 'park' },
};

export const CHAPTER15 = {
  id: 'chapter15',
  number: 15,
  title: 'Chapter 15: Festa',
  short: 'Festa',
  noDeduction: true,
  suspects: [],
  crew: ['mags', 'theo', 'ricky', 'juno', 'paz'],
  clues: {},
  verdicts: {},
  nextChapter: 'chapter16',
  rating: { gold: 600, silver: 960 },

  parts: [
    {
      id: 'tail', kind: 'drive', title: 'Follow the money',
      vehicle: 'dirtbike', time: 'dusk', weather: 'clear',
      intro: [
        { kicker: 'Porto Sereno, 7 p.m.', who: 'paz',
          lines: ['Paz throws you a helmet and kicks her dirt bike into life. "Varga is moving his bribe money tonight, inside the festival. But on which float? Nobody knows."',
            '"His van is leaving the police station right now. Follow it to the float yard and we\'ll see where the money goes. Just don\'t let him see you."'] },
        { kicker: 'How to play', title: 'Not too close',
          lines: ['Follow Varga\'s grey van on the Dirt Bike all the way to wherever it\'s going. Keep it in sight, but not too close: when the meter goes red, drop back. Fall too far behind and you lose it. Hold Space (Wheelie on a phone) to pull a wheelie; let go to jump.'] },
      ],
      startLabel: 'Ride',
      objective: 'Follow Varga\'s van without being seen',
      city: TAIL_CITY,
      start: { node: [6, 2], offset: [2.3, 26], heading: Math.PI },
      noPolice: true,
      fugitive: { startNode: [6, 2], heading: Math.PI, name: 'Varga\'s van', who: 'varga', kind: 'van', color: 0x8a8f9c },
      goal: {
        type: 'tail', block: '1,6', label: 'Float yard', near: 14, far: 80,
        spottedTitle: 'He saw you', spottedText: 'Varga\'s driver spotted a dirt bike in his mirror and drove straight back to the station. Hang back further: keep the meter out of the red.',
        lostTitle: 'Lost him', lostText: 'The van turned a corner and was gone. Keep it in sight: the marker shows where it is.',
      },
      heat: { start: 1, max: 1, riseEvery: 999 },
      doneTitle: 'The golden galleon',
      doneText: 'The van backs into the float yard. Through a gap in the fence you watch two of Varga\'s men carry a heavy chest up onto the biggest float of all: a golden galleon. Paz whistles. "Now we know."',
    },
    {
      id: 'parade', kind: 'onFoot', mode: 'parade', title: 'The parade',
      time: 'night', weather: 'clear',
      intro: [
        { kicker: 'Rua Alta, 10 p.m.', who: 'paz',
          lines: ['Drums. Thousands of lanterns over the street. Paz straps a huge papier-mâché head onto your shoulders, a grinning face with red cheeks. "Now you are a cabeçudo. Nobody looks twice at a cabeçudo."',
            '"Varga\'s money is in the chest on the golden galleon. He moves it tonight, under everybody\'s nose, to the cathedral."'] },
        { kicker: 'On the radio', who: 'mags',
          lines: ['"Two of his men ride on the galleon, one at each end. They keep turning round. Pick the lock while they\'re both looking out at the crowd."',
            '"When you\'ve got it, Theo kills the lights on the whole street. Then run for the funicular, on the cathedral square."'] },
        { kicker: 'How to play', title: 'The costume',
          lines: ['Stay close to the dancers and the floats and don\'t sprint: the police on the pavements can\'t pick you out. The floats move: climb onto the galleon (it carries you along). Hold E at the chest to pick the lock, only while both lookouts\' cones are yellow (looking out at the street); orange means one is about to turn. If the galleon reaches the square first, the money goes inside the cathedral.'] },
      ],
      startLabel: 'Dance',
      objective: 'Join the parade and climb onto the golden galleon float',
      doneTitle: 'Into the station',
      doneText: 'You duck into the funicular station with the money under your costume. Behind you, the lights of Rua Alta flicker back on, and the whistles start.',
    },
    {
      id: 'funicular', kind: 'onFoot', mode: 'funicular', title: 'The funicular',
      time: 'night', weather: 'clear',
      intro: [
        { kicker: 'The bottom station', who: 'paz',
          lines: ['Paz, breathless on the radio: "Car one is waiting, the yellow one. Get in. The operator owes me a favour."',
            'Then Ricky, from the bell tower: "Bad news. Two police cars just went up the hill road. Varga\'s going to be waiting at the top."'] },
        { kicker: 'How to play', title: 'Two cars, one cable',
          lines: ['As your car goes up, the other car comes down, and halfway they pass each other (slowly). Their open sides face each other, edged in yellow: when car 2 is right alongside, jump across. Ride it back down, then sneak past Varga\'s officers on the quay to Juno\'s seaplane at the end of the jetty.'] },
      ],
      startLabel: 'Go',
      objective: 'Get into car 1 (the yellow one)',
      doneTitle: 'Wheels up',
      doneText: 'Juno opens the throttle and the seaplane skips across the bay and lifts into the dark. Down on the quay, a man in a long coat throws his hat into the sea.',
    },
  ],

  outro: [
    { kicker: 'Over the sea, midnight', who: 'juno',
      lines: ['The money is spread across the seats: Varga\'s bribes, every dirty note of them. "He can\'t tell anyone," Ricky grins. "Not a soul."',
        'Paz looks back at the lights of Porto Sereno getting smaller. "I can\'t go home for a while." Mags hands her a drink: "Then you come with us. You\'re crew."'] },
    { kicker: 'A message', who: 'theo',
      lines: ['Theo\'s laptop pings. A message with no name, just a neon fox for a signature: "I watched you rob a cop with a parade. I have a bigger job. A bullet train. Come to Neon Kōji."',
        'Juno turns the plane east. "How far is Neon Kōji?" Mags smiles. "The other side of the world."'] },
  ],

  jobDone: {
    title: 'Festa',
    text: 'Varga\'s money, taken from under his nose in the middle of a parade. And Paz is crew now. Goodbye, Porto Sereno.',
  },

  finale: {
    title: 'To be continued',
    text: 'A hacker who signs with a neon fox has a job for the crew: a bullet train in Neon Kōji. The seaplane heads east.',
  },
};

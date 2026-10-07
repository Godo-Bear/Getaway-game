// Chapter 13: "Touchdown"
//
// The crew lands abroad, in Porto Sereno: a sunny harbour town of
// whitewashed streets, palm trees and old yellow trams. Part 1: get the
// gear (three heavy bags) off the plane, past the customs officers at the
// little private airstrip, and into the van of Paz, the local fixer. Part 2:
// a customs patrol has the van's plate. Drive across town (watch the trams)
// to the safehouse Paz has found: rooms over the fish market.
// No mole, no detective work (see CLAUDE.md): the crew is loyal (Paz joins
// it and stays loyal); the trouble is customs, the police and the clock.

const MARKET_CITY = {
  coastal: true,
  forceKinds: { '7,2': 'portair', '1,6': 'fishmarket', '3,3': 'park', '5,5': 'park' },
};

export const CHAPTER13 = {
  id: 'chapter13',
  number: 13,
  title: 'Chapter 13: Touchdown',
  short: 'Touchdown',
  noDeduction: true,
  suspects: [],
  crew: ['mags', 'theo', 'ricky', 'juno', 'paz'],
  clues: {},
  verdicts: {},
  nextChapter: null,
  rating: { gold: 420, silver: 720 },

  parts: [
    {
      id: 'customs', kind: 'onFoot', title: 'Customs',
      level: 'ch13Port', time: 'day', weather: 'clear',
      intro: [
        { kicker: 'Porto Sereno airstrip, 9:40 a.m.', who: 'ricky',
          lines: ['Sun. Actual sun. Ricky steps off the plane and squints at the palm trees. "I could get used to this."',
            'Mags points at the little customs gate in the fence. "Three bags of gear. They don\'t go through an X-ray machine. Ever."'] },
        { kicker: 'On the phone', who: 'paz',
          lines: ['A warm voice, laughing. "Welcome to Porto Sereno! I am Paz. My van is in the car park outside the gate: the white one that says FRESH FISH."',
            '"The customs men here are lazy, but they are not blind. Walk with the other passengers and nobody looks twice."'] },
        { kicker: 'How to play', title: 'Customs',
          lines: ['Carry the three bags (amber beams) to Paz\'s van (green ring), one at a time. With a bag you\'re slower and you can\'t climb: it\'s through the gate or nothing. Customs officers (white shirts) walk the airstrip and the car park: stay out of their yellow cones, walk with the passengers, or hide behind the crates and the luggage cart.'] },
      ],
      startLabel: 'Go',
      objective: 'Get the three bags past customs and into Paz\'s van',
      patrols: 'customs',
      carry: { ids: ['bag1', 'bag2', 'bag3'], label: 'gear bag' },
      goal: { type: 'reach', label: 'Paz\'s van', requireCarry: true },
      doneTitle: 'Past customs',
      doneText: 'The last bag thumps into the back of the van next to a crate of ice and sardines. Paz grins from the driver\'s seat: "You smell like a tourist already. Get in!"',
    },
    {
      id: 'market', kind: 'drive', title: 'To the fish market',
      time: 'afternoon', weather: 'clear',
      intro: [
        { kicker: 'On the radio', who: 'paz',
          lines: ['"Bad news: a customs patrol took the van\'s number at the gate. They want to look in the back."',
            '"Good news: I know these streets. Lose them, and take us to the fish market: there are rooms upstairs that nobody asks about."'] },
        { kicker: 'How to play', title: 'Trams and narrow streets',
          lines: ['Drive to the FISH MARKET (green light), but lose the police first: you can\'t lead them to the safehouse. The yellow trams don\'t stop for anyone: keep off their tracks. The subway (blue SUBWAY signs) is a good place to vanish.'] },
      ],
      startLabel: 'Drive',
      objective: 'Lose the police and get to the fish market',
      city: MARKET_CITY,
      start: { node: [7, 2], offset: [-2.3, 24], heading: Math.PI },
      goal: { type: 'safehouse', block: '1,6', label: 'Fish market', loseCops: true },
      heat: { start: 2, max: 3, riseEvery: 55 },
      doneTitle: 'Home, for now',
      doneText: 'The van rolls in under the fish market\'s awning and the shutter comes down behind it. Upstairs: four bare rooms, a balcony and a view of the whole harbour.',
    },
  ],

  outro: [
    { kicker: 'Over the fish market, sunset', who: 'paz',
      lines: ['Paz pours drinks on the balcony. "So. You are the famous crew from the north. What do you want in my town?"',
        'Mags nods at a huge white ship anchored out in the bay, lit up like a birthday cake. "That."'] },
    { kicker: 'The balcony', who: 'paz',
      lines: ['"The Bella Fortuna. A casino that never touches land, so no police can touch it." Paz laughs. "I am in. Nobody in this town has ever robbed it."', '"Then we\'ll be the first."'] },
  ],

  jobDone: {
    title: 'Touchdown',
    text: 'New country, new names, and a new friend: Paz knows every street and every customs man in Porto Sereno. And out in the bay, a floating casino is waiting.',
  },

  finale: {
    title: 'To be continued',
    text: 'In the bay, the Bella Fortuna glitters all night. The crew is already planning how to get aboard.',
  },
};

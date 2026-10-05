// Chapter 10: "Avalanche"
//
// Commander Hask's Sentinel army has started "fining" the people of
// Frostvale: shops emptied, savings seized, all of it trucked up to their
// depot. The crew decides to take it back. Part 1: chase down Sentinel's
// armoured truck. Then Juno starts a small avalanche to block the road
// behind them, and it isn't small: a wall of snow comes down through town,
// and you have to outrun it. Last, the town's money goes to St. Anna's church,
// where Father Brandt hands it back to the people it was taken from.
// No mole, no detective work (see CLAUDE.md): the crew is loyal; the trouble
// is Sentinel and the mountain.

const AVALANCHE_CITY = {
  seed: 1010, blocks: 8, alpine: true,
  forceKinds: { '1,7': 'sentinel', '2,2': 'church', '6,6': 'cabin', '4,3': 'park', '6,1': 'park', '3,6': 'park' },
};

export const CHAPTER10 = {
  id: 'chapter10',
  number: 10,
  title: 'Chapter 10: Avalanche',
  short: 'Avalanche',
  noDeduction: true,
  suspects: [],
  crew: ['mags', 'theo', 'ricky', 'juno'],
  clues: {},
  verdicts: {},
  nextChapter: 'chapter11',
  rating: { gold: 620, silver: 1000 },

  parts: [
    {
      id: 'convoy', kind: 'drive', title: 'The armoured truck',
      time: 'day', weather: 'snow', ice: true,
      intro: [
        { kicker: 'Pine Lodge, 10:05 a.m.', who: 'theo',
          lines: ['"Sentinel cleaned out the bakery this morning. The ski shop. Old Mrs. Halvorsen\'s savings jar. They call it a security fee."',
            '"It all goes up to their depot in one armoured truck. It leaves town in five minutes."'] },
        { kicker: 'On the radio', who: 'mags',
          lines: ['"We don\'t rob the people who let us live here. We rob the people robbing them. Stop that truck before it reaches the SENTINEL depot."'] },
        { kicker: 'How to play', title: 'The armoured truck',
          lines: ['Catch the black armoured truck (yellow arrow) and ram it off the road before it reaches the Sentinel depot. The roads are icy: brake early.'] },
      ],
      startLabel: 'Drive',
      objective: 'Stop the armoured truck before the Sentinel depot',
      city: AVALANCHE_CITY,
      start: { node: [5, 2], offset: [2.3, 22], heading: 0 },
      fugitive: { startNode: [6, 3], heading: -Math.PI / 2, name: 'Sentinel truck', who: 'hask', kind: 'van', color: 0x16181c,
        escapeTitle: 'The truck reached the depot', escapeText: 'The gates close behind it. Stay on its bumper and ram it before it gets there.' },
      goal: { type: 'chase', block: '1,7', label: 'Sentinel depot', color: 0xff4050 },
      heat: { start: 2, max: 4, riseEvery: 45 },
      doneTitle: 'Truck down',
      doneText: 'The truck slews into a snowbank and the guards run for it. In the back: crates of cash, jewellery, a savings jar with a name taped on it. Then Juno\'s voice on the radio: "Sentinel\'s whole convoy is coming down the mountain road. I can block it."',
    },
    {
      id: 'avalanche', kind: 'onFoot', title: 'Avalanche!',
      level: 'ch8Town', time: 'day', weather: 'snow',
      levelOpts: { spawnAt: 'church', goalAt: 'cabin', checkpoints: [['The middle of town', 6, 2, Math.PI / 2], ['The Summit Hotel', 22, 50.2, Math.PI / 2]] },
      intro: [
        { kicker: 'The north road, 10:31 a.m.', who: 'juno',
          lines: ['"Small charge on the ridge, a little slide across the road, Sentinel stuck behind it for a week. Easy."', 'BOOM. A long, deep rumble. Juno, quietly: "...that\'s not small."'] },
        { kicker: 'How to play', title: 'RUN',
          lines: ['A wall of snow is coming down through town from the north. Sprint south to Pine Lodge before it catches you. If it does, you\'re back at the last checkpoint (they\'re in the middle of town and at the hotel).',
            'Sprint (Shift) the whole way and cut the corners. Don\'t stop.'] },
      ],
      startLabel: 'Run!',
      objective: 'Outrun the avalanche to Pine Lodge',
      avalanche: { startZ: -150, speed: 6.6, height: 6.5 },
      goal: { type: 'reach', label: 'Pine Lodge' },
      doneTitle: 'Buried, but not you',
      doneText: 'The snow stops a street from the lodge, piled up to the first-floor windows. Sentinel\'s convoy is somewhere under it. Nobody\'s hurt: Theo cleared the streets with the church bell five minutes before it hit.',
    },
    {
      id: 'church', kind: 'drive', title: 'St. Anna\'s',
      vehicle: 'snowmobile', time: 'dusk', weather: 'snow',
      intro: [
        { kicker: 'Pine Lodge, 5:10 p.m.', who: 'ricky',
          lines: ['"Sentinel dug themselves out. They\'re searching every street for the truck money."', '"Father Brandt at St. Anna\'s says he\'ll give it back to everyone it was taken from. We just have to get it to him."'] },
      ],
      startLabel: 'Ride',
      objective: 'Lose Sentinel, then get the money to St. Anna\'s church',
      city: AVALANCHE_CITY,
      start: { node: [6, 6], offset: [2.3, -20], heading: Math.PI },
      goal: { type: 'safehouse', block: '2,2', label: 'St. Anna\'s church', color: 0x9fd4ff, loseCops: true },
      heat: { start: 2, max: 4, riseEvery: 45 },
      roadblocks: { fromHeat: 4, every: 32, spikes: true },
      doneTitle: 'Sanctuary',
      doneText: 'Father Brandt counts the money into envelopes, one for every name on his list. "I didn\'t see you," he says. "God might have. I think He\'s on your side today."',
    },
  ],

  outro: [
    { kicker: 'St. Anna\'s, 7:00 p.m.', who: 'theo',
      lines: ['The church bell rings again: the whole town comes to collect their envelopes. Mrs. Halvorsen gets her savings jar back and cries.'] },
    { kicker: 'Sentinel depot, the same night', who: 'hask',
      lines: ['Commander Hask stares at the empty truck. "Somebody in this town is laughing at me," he says. "Find out who."'] },
  ],

  jobDone: {
    title: 'Avalanche',
    text: 'You stopped Sentinel\'s truck, outran a mountain, and gave Frostvale its money back. The town is on your side now. Commander Hask is not.',
  },
};

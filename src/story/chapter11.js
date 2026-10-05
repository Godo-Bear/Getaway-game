// Chapter 11: "The Ice Festival"
//
// Frostvale's Winter Festival: lanterns over every street, a giant tree, the
// Ice Palace in the middle of town and fireworks at midnight. Commander Hask
// has turned the Ice Palace into Sentinel's pay office: their wages, in
// cash, handed out to the guards on festival night. The crew takes it, bag
// by bag, while the whole town watches the sky.
// New mechanic: every few seconds the fireworks go up and the guards look at
// the sky: that's when you move.
// No mole, no detective work (see CLAUDE.md): the crew is loyal; the trouble
// is Sentinel.

const FESTIVAL_CITY = {
  seed: 1111, blocks: 8, alpine: true,
  forceKinds: { '6,6': 'cabin', '4,4': 'hotel', '3,2': 'park', '5,5': 'park', '1,4': 'park' },
};

const FESTIVAL = { festival: true };

export const CHAPTER11 = {
  id: 'chapter11',
  number: 11,
  title: 'Chapter 11: The Ice Festival',
  short: 'The Ice Festival',
  noDeduction: true,
  suspects: [],
  crew: ['mags', 'theo', 'ricky', 'juno'],
  clues: {},
  verdicts: {},
  nextChapter: 'chapter12',
  rating: { gold: 640, silver: 1000 },

  parts: [
    {
      id: 'scout', kind: 'onFoot', title: 'Lanterns',
      level: 'ch8Town', time: 'night', weather: 'snow',
      levelOpts: { ...FESTIVAL, spawnAt: 'busStop', goalAt: 'hotel' },
      intro: [
        { kicker: 'The Winter Festival, 10:15 p.m.', title: 'Festival night',
          lines: ['Lanterns over every street, a tree as tall as a house, hot chocolate stalls, and the Ice Palace glowing blue in the middle of town. Everyone in Frostvale is out.',
            'Sentinel is out too. Commander Hask has turned the Ice Palace into his pay office: tonight his guards get paid. In cash.'] },
        { kicker: 'On the phone', who: 'theo',
          lines: ['"Take photos for the plan: the Ice Palace gate, the fireworks stage, and the armoured van they brought the cash in. Then meet us in the bar of the Summit Hotel."'] },
      ],
      startLabel: 'Go',
      objective: 'Photograph the Ice Palace, the fireworks stage and the van',
      patrols: 'sentinel',
      recon: [
        { id: 'palace', label: 'Ice Palace gate', text: 'One gate, facing east. The cash bags are split up and hidden round the festival, so nobody can grab them all at once.' },
        { id: 'stage', label: 'Fireworks stage', text: 'Fireworks every few minutes until midnight. When they go up, every guard looks at the sky.' },
        { id: 'van', label: 'Sentinel van', text: 'The armoured van that brought the cash. Hask\'s own guards, three of them, very bored.' },
      ],
      goal: { type: 'reach', label: 'Summit Hotel', requireRecon: true },
      doneTitle: 'The plan',
      doneText: 'In the hotel bar, Juno draws on a napkin. "Six cash bags, hidden round the festival. Fireworks every few minutes. When the sky lights up, we move. When it goes dark, we freeze."',
    },
    {
      id: 'palace', kind: 'onFoot', title: 'Fireworks',
      level: 'ch8Town', time: 'night', weather: 'snow',
      levelOpts: { ...FESTIVAL, spawnAt: 'hotel', goalAt: 'shed', checkpoints: [['The Ice Palace', 6, 6, 0]] },
      intro: [
        { kicker: '11:30 p.m.', who: 'mags',
          lines: ['"Six bags. Grab every one, then get to the snowmobile hire. Ricky\'s waiting."'] },
        { kicker: 'How to play', title: 'Fireworks',
          lines: ['Grab the six cash bags (gold beams) while Sentinel guards patrol the festival. Every few seconds the fireworks go up: for a moment every guard is looking at the sky and can\'t see you. That\'s when you run.',
            'Between the fireworks, stay out of their sight cones, hide in the crowd or under the porches, or punch a guard from behind.'] },
      ],
      startLabel: 'Go',
      objective: 'Grab the six cash bags, then get to the snowmobile hire',
      patrols: 'sentinel',
      loot: { ids: ['a', 'b', 'c', 'd', 'e', 'f'], value: 2500 },
      fireworks: { every: 15, blind: 4, first: 6 },
      goal: { type: 'reach', label: 'Snowmobile hire', requireLoot: true },
      doneTitle: 'Every bag',
      doneText: 'Ricky revs the engine as you throw the last bag in the sled. Behind you, the big midnight finale lights up the whole valley, and somewhere in the Ice Palace a Sentinel paymaster opens an empty safe.',
    },
    {
      id: 'parade', kind: 'drive', title: 'Through the parade',
      time: 'night', weather: 'snow',
      intro: [
        { kicker: 'Midnight', who: 'ricky',
          lines: ['"They\'ve worked it out. Every Sentinel truck in town is on the move, and the roads are full of festival traffic."', '"Car\'s faster than the sleds on the road. Get the cash home before they lock down the town."'] },
      ],
      startLabel: 'Drive',
      objective: 'Get the cash to Pine Lodge before Sentinel locks down the town',
      city: FESTIVAL_CITY,
      start: { node: [4, 5], offset: [2.3, 18], heading: 0 },
      goal: { type: 'reach', block: '6,6', label: 'Pine Lodge', timer: 150, timerLabel: 'Lockdown in', timeoutTitle: 'Lockdown', timeoutText: 'Sentinel shut every road out of town. Try again, faster: hack junctions (E) and use the nitro.' },
      heat: { start: 2, max: 4, riseEvery: 40 },
      roadblocks: { fromHeat: 4, every: 30, spikes: true },
      doneTitle: 'Payday',
      doneText: 'The car slides into the barn as the last firework fades. Sentinel\'s wages for the whole month, stacked on the kitchen table. Theo starts counting. Mags starts planning.',
    },
  ],

  outro: [
    { kicker: 'Pine Lodge, 1:20 a.m.', who: 'juno',
      lines: ['"No pay, no army," Juno says. "Half of Sentinel will quit by the weekend."'] },
    { kicker: 'Pine Lodge', who: 'mags',
      lines: ['"The other half will be angry," Mags says. "And Hask will be angriest of all. Pack a bag. Everyone. Just in case."'] },
  ],

  jobDone: {
    title: 'The Ice Festival',
    text: 'You emptied Sentinel\'s pay office on festival night, under their noses and a sky full of fireworks. Half the guards are already packing. The other half are looking for you.',
  },
};

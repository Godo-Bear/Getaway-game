// Chapter 9: "Snowblind"
//
// The crew has a vault's worth of gold and no way to spend it. Mags finds a
// buyer: Mr. Lindqvist, who does business from a suite at the Summit Hotel.
// Meanwhile the Glacier Bank has hired Sentinel, a private security army, and
// their black parkas are all over town. Lindqvist takes the gold and
// double-crosses them: his men run for the mountain pass in a van, in a
// blizzard, and the crew goes after them on snowmobiles.
// No mole, no detective work (see CLAUDE.md): the crew is loyal; the trouble
// is the buyer, Sentinel and the weather.

const SNOWBLIND_CITY = {
  seed: 9191, blocks: 8, alpine: true,
  forceKinds: { '4,4': 'hotel', '7,0': 'pass', '6,6': 'cabin', '2,2': 'park', '5,1': 'park', '1,5': 'park' },
};

export const CHAPTER9 = {
  id: 'chapter9',
  number: 9,
  title: 'Chapter 9: Snowblind',
  short: 'Snowblind',
  noDeduction: true,
  suspects: [],
  crew: ['mags', 'theo', 'ricky', 'juno'],
  clues: {},
  verdicts: {},
  nextChapter: 'chapter10',
  rating: { gold: 600, silver: 950 },

  parts: [
    {
      id: 'summit', kind: 'onFoot', title: 'The Summit Hotel',
      level: 'ch8Town', time: 'night', weather: 'snow',
      levelOpts: { spawnAt: 'cabin', goalAt: 'shed', meet: { lindqvist: 'hotel' }, checkpoints: [['The Summit Hotel', 22, 50.2, -Math.PI / 2]] },
      intro: [
        { kicker: 'Pine Lodge, 9:40 p.m.', who: 'mags',
          lines: ['"Gold is heavy, loud and impossible to spend. So we sell it." She slides a hotel key card across the table. "Mr. Lindqvist. Suite 7, the Summit Hotel. He buys anything shiny and asks nothing."',
            '"Take him the sample. Then meet Ricky at the snowmobile hire: if this goes wrong, we leave fast."'] },
        { kicker: 'How to play', title: 'Sentinel',
          lines: ['The bank has hired Sentinel, a private security army: guards in black parkas walk the streets. Stay out of their sight cones, hide in the crowd or under the porches, or punch one from behind.',
            'Meet Lindqvist at the Summit Hotel (the white beam), then get to the snowmobile hire.'] },
      ],
      startLabel: 'Go',
      objective: 'Meet Lindqvist at the Summit Hotel',
      patrols: 'sentinel',
      meetings: [
        {
          who: 'lindqvist', task: null,
          joinText: 'Lindqvist has the sample. Now the snowmobile hire.',
          pages: [{ kicker: 'The Summit Hotel', who: 'lindqvist',
            lines: ['Lindqvist turns the gold bar over in the lamplight and smiles a lot. "Beautiful. Bring me the rest at midnight, at the old toll road. My men will have your money."',
              'As you leave, you see his driver making a phone call, watching you through the snow.'] }],
        },
      ],
      goal: { type: 'reach', label: 'Snowmobile hire', requireMeetings: true },
      doneTitle: 'Snowmobiles',
      doneText: 'Ricky has three snowmobiles warming up. Then the radio crackles: "Lindqvist\'s men just broke into the lodge and took the gold. ALL of it. They\'re heading for the pass."',
    },
    {
      id: 'doublecross', kind: 'drive', title: 'The double-cross',
      vehicle: 'snowmobile', time: 'night', weather: 'blizzard',
      intro: [
        { kicker: 'On the radio', who: 'ricky',
          lines: ['"Grey van, no plates, gold in the back. If they reach the mountain pass we\'ll never see it again."', '"It\'s a whiteout up there. They can\'t see. Neither can you. Stay on their tail lights."'] },
        { kicker: 'How to play', title: 'Snowmobile',
          lines: ['You\'re on a snowmobile: lighter and quicker to turn than the car, and the skis grip in the snow. Catch the grey van (yellow arrow) and ram it off the road before it reaches the MOUNTAIN PASS.',
            'In a blizzard you can only see a few car lengths: so can the police.'] },
      ],
      startLabel: 'Ride',
      objective: 'Catch Lindqvist\'s van before the mountain pass',
      city: SNOWBLIND_CITY,
      start: { node: [4, 5], offset: [2.3, 18], heading: 0 },
      fugitive: { startNode: [5, 4], heading: Math.PI / 2, name: 'Lindqvist\'s van', who: 'lindqvist', kind: 'van', color: 0x4a4e56,
        escapeTitle: 'The van made the pass', escapeText: 'It disappears over the pass with your gold. Stay on its bumper and ram it before it gets there.' },
      goal: { type: 'chase', block: '7,0', label: 'Mountain pass', color: 0xffd040 },
      heat: { start: 1, max: 3, riseEvery: 50 },
      doneTitle: 'Van down',
      doneText: 'The van slides off the road and noses into a snowbank. Lindqvist\'s men run into the white. The gold is still in the back, every bar of it.',
    },
    {
      id: 'whiteout', kind: 'drive', title: 'Whiteout',
      vehicle: 'snowmobile', time: 'night', weather: 'blizzard',
      intro: [
        { kicker: 'The old toll road', who: 'theo',
          lines: ['"Bad news: Lindqvist called Sentinel and sold you instead. Their trucks are coming up the road. Lights everywhere."', '"Good news: it\'s a blizzard. Lose them in the white and get home."'] },
      ],
      startLabel: 'Ride',
      objective: 'Lose Sentinel in the storm, then get back to Pine Lodge',
      city: SNOWBLIND_CITY,
      start: { node: [7, 1], offset: [2.3, 20], heading: 0 },
      goal: { type: 'safehouse', block: '6,6', label: 'Pine Lodge', loseCops: true },
      heat: { start: 3, max: 4, riseEvery: 45 },
      roadblocks: { fromHeat: 4, every: 32, spikes: true },
      doneTitle: 'Home, white and frozen',
      doneText: 'You kill the engine in the barn. Outside, Sentinel\'s lights crawl past, lost in the snow. The gold is stacked by the stove again, and Lindqvist has made himself an enemy.',
    },
  ],

  outro: [
    { kicker: 'Pine Lodge, 2:30 a.m.', who: 'juno',
      lines: ['Juno shakes the snow out of her hair. "So. No buyer, and now Sentinel knows we\'re here."'] },
    { kicker: 'Pine Lodge', who: 'mags',
      lines: ['"Sentinel knows somebody\'s here," Mags says. "Not who. Not yet." She looks at the gold. "And I have a better idea for some of this."'] },
  ],

  jobDone: {
    title: 'Snowblind',
    text: 'A double-crossing buyer, a blizzard and a private army, and the gold is still yours. Lindqvist will think twice before he cheats this crew again.',
  },
};

// Chapter 12: "Last Run"
//
// Commander Hask has worked out who's been laughing at him. Sentinel raids
// Pine Lodge at night, with a helicopter. The crew has to leave Frostvale:
// out of the lodge, through the town to the snowmobiles; then you drive a
// decoy round town to pull Sentinel's trucks off the lake road; then a
// flat-out run through a blizzard to the frozen lake, where Juno's friend
// has a ski plane waiting on the ice. Goodbye, Frostvale: the next chapters
// are abroad.
// No mole, no detective work (see CLAUDE.md): the crew is loyal; the trouble
// is Sentinel, the storm and the clock.

const DECOY_CITY = {
  alpine: true,
  forceKinds: { '1,1': 'hire', '5,2': 'sentinel', '5,6': 'hotel', '2,5': 'church', '3,3': 'park' },
};

const LAKE_CITY = {
  seed: 1212, blocks: 8, alpine: true,
  forceKinds: { '0,7': 'airstrip', '6,6': 'cabin', '1,1': 'sentinel', '3,3': 'park', '5,2': 'park', '2,5': 'park' },
};

export const CHAPTER12 = {
  id: 'chapter12',
  number: 12,
  title: 'Chapter 12: Last Run',
  short: 'Last Run',
  noDeduction: true,
  suspects: [],
  crew: ['mags', 'theo', 'ricky', 'juno'],
  clues: {},
  verdicts: {},
  nextChapter: 'chapter13',
  rating: { gold: 700, silver: 1100 },

  parts: [
    {
      id: 'raid', kind: 'onFoot', title: 'The raid',
      level: 'ch8Town', time: 'night', weather: 'snow',
      levelOpts: { spawnAt: 'cabin', goalAt: 'shed', checkpoints: [['The middle of town', 6, 2, Math.PI / 2]] },
      intro: [
        { kicker: 'Pine Lodge, 3:12 a.m.', title: 'Lights',
          lines: ['Floodlights through the curtains. A helicopter overhead. A voice on a loudspeaker: "THIS IS SENTINEL SECURITY. COME OUT."',
            'Mags is already pulling on her coat. "Out the back. Everyone to the snowmobile hire. We\'re leaving Frostvale tonight."'] },
        { kicker: 'How to play', title: 'The raid',
          lines: ['Get across town to the snowmobile hire (green light). A Sentinel helicopter is hunting you with a searchlight: stay out of the light, or hide under the covered porches. Guards walk the streets: punch them from behind, or go round.'] },
      ],
      startLabel: 'Run',
      objective: 'Get to the snowmobile hire',
      heli: { delay: 6, spotSpeed: 4.6, fill: 0.55, lead: 0.2, callout: { who: 'hask', line: 'You took my gold, my money and my men. You\'re not leaving this valley.' } },
      patrols: 'sentinel',
      goal: { type: 'reach', label: 'Snowmobile hire' },
      doneTitle: 'The hire shed',
      doneText: 'You slam the shed door behind you. The snowmobiles are there, fuelled up and ready. But through the window: three Sentinel trucks parked right across the lake road.',
    },
    {
      id: 'decoy', kind: 'drive', title: 'The decoy',
      time: 'night', weather: 'snow', ice: true,
      intro: [
        { kicker: 'The snowmobile hire', who: 'mags',
          lines: ['"We\'ll never get past those trucks," Mags says. "Somebody has to pull them off that road."',
            'Ricky throws you the keys to the hire company\'s old pickup. "Make some noise. Take them on a tour of town, lose them, then come back for your snowmobile."'] },
        { kicker: 'How to play', title: 'Make some noise',
          lines: ['Drive past the three lights in town (no need to stop): Sentinel\'s office, the Summit Hotel and St. Anna\'s church. Each one brings more trucks after you. Then lose them all and get back to the snowmobile hire (they mustn\'t see you go in). The roads are icy: brake early.'] },
      ],
      startLabel: 'Drive',
      objective: 'Drive past Sentinel\'s office to get their attention',
      city: DECOY_CITY,
      start: { node: [2, 1], offset: [2.3, 20], heading: 0 },
      goal: {
        type: 'stops', driveBy: true, block: '1,1', label: 'Snowmobile hire', loseCops: true,
        finalObjective: 'Lose Sentinel, then get back to the snowmobile hire',
        stops: [
          { block: '5,2', label: 'Sentinel office', objective: 'Drive past Sentinel\'s office to get their attention', heat: 3,
            title: 'They\'re coming!', text: 'Ricky, on the radio: "There they go! Every truck on the lake road just turned round." Now lead them past the Summit Hotel.' },
          { block: '5,6', label: 'Summit Hotel', objective: 'Lead them past the Summit Hotel', heat: 3,
            title: 'Round the hotel', text: 'Guests in dressing gowns stare from the balconies. Next: past St. Anna\'s church.' },
          { block: '2,5', label: 'St. Anna\'s church', objective: 'Lead them past St. Anna\'s church', heat: 4,
            title: 'Every truck in town', text: 'Mags: "That\'s all of them. Now lose them, and come home."' },
        ],
      },
      heat: { start: 2, max: 4, riseEvery: 60 },
      roadblocks: { fromHeat: 4, every: 34, spikes: false },
      doneTitle: 'The road is clear',
      doneText: 'You coast into the hire shed with the lights off. Behind you, a long line of Sentinel trucks roars away up the valley, chasing nobody. Mags is already on a snowmobile: "Nice driving. Now: the lake!"',
    },
    {
      id: 'lake', kind: 'drive', title: 'To the lake',
      vehicle: 'snowmobile', time: 'night', weather: 'blizzard',
      intro: [
        { kicker: 'On the radio', who: 'juno',
          lines: ['"My friend Ingrid has a ski plane on the frozen lake. She\'ll wait until the storm closes the sky. That\'s about three minutes."',
            '"Sentinel will work out your trick any minute and come back for the lake road. Go."'] },
        { kicker: 'How to play', title: 'Last run',
          lines: ['Get to the LAKE AIRSTRIP before the plane has to leave. Sentinel is out in force with roadblocks and spike strips. The blizzard hides you, and them: hack junctions (E) and use your nitro.'] },
      ],
      startLabel: 'Ride',
      objective: 'Get to the plane on the frozen lake',
      city: LAKE_CITY,
      start: { node: [1, 7], offset: [2.3, -20], heading: Math.PI },
      goal: { type: 'reach', block: '0,7', label: 'Lake airstrip', color: 0x39e6ff, timer: 200, timerLabel: 'Plane leaves in', timeoutTitle: 'The plane left', timeoutText: 'Ingrid couldn\'t wait any longer. Try again: cut through the parks and keep the nitro for the straights.' },
      heat: { start: 4, max: 5, riseEvery: 40 },
      roadblocks: { fromHeat: 4, every: 26, spikes: true },
      doneTitle: 'Wheels up',
      doneText: 'You ditch the snowmobiles on the ice and pile into the little plane. Ingrid opens the throttle. Through the window, Sentinel\'s headlights reach the shore just as the skis leave the ice.',
    },
  ],

  outro: [
    { kicker: 'Over the mountains, 4:05 a.m.', who: 'ricky',
      lines: ['The storm drops away below you. Ricky has his face pressed to the window. "Goodbye, Frostvale. I\'ll miss the snow. I will NOT miss the snow."'] },
    { kicker: 'The plane', who: 'mags',
      lines: ['Mags looks round at her crew: Theo asleep on a gold crate, Juno chatting with the pilot, Ricky, you. "New country tomorrow. New names. Same rules."', '"Nobody gets left behind."'] },
  ],

  jobDone: {
    title: 'Last Run',
    text: 'Sentinel raided your home, so you took to the sky. Frostvale gave you a new start and a town that was on your side. Now the crew is heading abroad.',
  },

  finale: {
    title: 'To be continued',
    text: 'Somewhere over the mountains, a small plane heads for the border with five tired criminals and a lot of gold. The next job is in a new country.',
  },
};

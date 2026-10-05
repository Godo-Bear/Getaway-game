// Chapter 12: "Last Run"
//
// Commander Hask has worked out who's been laughing at him. Sentinel raids
// Pine Lodge at night, with a helicopter. The crew has to leave Frostvale:
// out of the lodge, through the town to the snowmobiles, then a flat-out run
// through a blizzard to the frozen lake, where Juno's friend has a ski plane
// waiting on the ice. Goodbye, Frostvale: the next chapters are abroad.
// No mole, no detective work (see CLAUDE.md): the crew is loyal; the trouble
// is Sentinel, the storm and the clock.

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
  nextChapter: null,
  rating: { gold: 480, silver: 780 },

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
      doneTitle: 'Engines',
      doneText: 'Five snowmobiles roar out of the hire shed and into the storm. Juno is on the radio to someone: "Lake. Twenty minutes. Keep the engine warm."',
    },
    {
      id: 'lake', kind: 'drive', title: 'To the lake',
      vehicle: 'snowmobile', time: 'night', weather: 'blizzard',
      intro: [
        { kicker: 'On the radio', who: 'juno',
          lines: ['"My friend Ingrid has a ski plane on the frozen lake. She\'ll wait until the storm closes the sky. That\'s about three minutes."',
            '"Every Sentinel truck in the valley is between us and the lake. Go."'] },
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

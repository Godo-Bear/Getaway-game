// Chapter 8: "Frostvale"
//
// After the breakout, all four faces are on the news with a reward. The city
// is full of people who'd like to collect it, so the crew leaves: out through
// the highway tunnel north, to Frostvale, a small ski town under the
// mountains. A new start, and a new kind of job: the Glacier Bank keeps its
// gold in a vault cut into the ice at the top of the mountain, reachable only
// by its own cable car. A new crew member joins: Juno, Theo's cousin, an
// ex-ski-patrol mountain guide with a wingsuit.
// No mole, no detective work (see CLAUDE.md): the crew is loyal, the trouble
// is the bounty hunters, the mountain and the bank.

const ESCAPE_CITY = {
  seed: 8118, blocks: 8,
  forceKinds: { '6,0': 'tunnel', '1,6': 'buildings', '3,3': 'park', '4,5': 'park' },
};
const MOUNTAIN_ROAD = {
  seed: 8282, blocks: 8, alpine: true, // (Frostvale: chalets, pines and mountains)
  forceKinds: { '6,6': 'cabin', '1,1': 'park', '3,4': 'park', '5,2': 'park' },
};

export const CHAPTER8 = {
  id: 'chapter8',
  number: 8,
  title: 'Chapter 8: Frostvale',
  short: 'Frostvale',
  noDeduction: true,
  suspects: [],
  crew: ['mags', 'theo', 'ricky', 'juno'],
  clues: {},
  verdicts: {},
  nextChapter: null,
  rating: { gold: 720, silver: 1100 },

  parts: [
    {
      id: 'bounty', kind: 'drive', title: 'Leaving town',
      time: 'dusk', weather: 'rain',
      intro: [
        { kicker: 'The safehouse, the next evening', who: 'mags',
          lines: ['"Half a million on each of our heads. Every bounty hunter, bent cop and bored cousin in this city is looking for a van with four faces in it."',
            '"So we leave. Tonight. I know a town up north where nobody watches the news."'] },
        { kicker: 'On the radio', who: 'theo',
          lines: ['"My cousin Juno lives in Frostvale, under the mountains. She says there\'s a bank up there that keeps its gold in a glacier. A GLACIER."', '"First you have to get out of the city: the highway tunnel north. Lose the tail before you go in, or they follow you all the way."'] },
        { kicker: 'How to play', title: 'Goodbye, city',
          lines: ['The police and the bounty hunters are out. Lose them, then drive into the HIGHWAY NORTH tunnel (yellow light). Hack junctions (E) to block chasers.'] },
      ],
      startLabel: 'Drive',
      objective: 'Lose the police, then get to the highway tunnel',
      city: ESCAPE_CITY,
      start: { node: [1, 6], offset: [2.3, -30], heading: Math.PI },
      goal: { type: 'safehouse', block: '6,0', label: 'Highway north', color: 0xffd040, loseCops: true },
      heat: { start: 3, max: 5, riseEvery: 40 },
      roadblocks: { fromHeat: 4, every: 28, spikes: true },
      doneTitle: 'Goodbye, city',
      doneText: 'The tunnel swallows the van. When you come out the other side, the city lights are a smudge in the mirror, and then they\'re gone. Six hours north, it starts to snow.',
    },
    {
      id: 'frostvale', kind: 'onFoot', title: 'Frostvale',
      level: 'ch8Town', time: 'day', weather: 'snow',
      intro: [
        { kicker: 'Frostvale, 11:20 a.m.', title: 'A new town',
          lines: ['Snow on every roof, a ski lift on the mountain, and wanted posters on the noticeboard by the bus stop. Your faces. Even here.',
            'Bounty hunters in red jackets walk the streets. Blend into the crowd, or crouch behind parked cars and snowmen. Knock one out from behind with E (if another finds the body, they all start looking).'] },
        { kicker: 'On the phone', who: 'theo',
          lines: ['"Juno\'s at the ski hire shop. Then take photos of the job for the plan: the Glacier Bank cable car station, its security hut, and the bank\'s office in town (follow the cyan beams). Then go home: Pine Lodge, the cabin at the edge of town."'] },
      ],
      startLabel: 'Go',
      objective: 'Meet Juno at the ski hire shop',
      patrols: 'hunters',
      meetings: [
        {
          who: 'juno', task: null,
          joinText: 'Juno the mountain guide is in.',
          pages: [{ kicker: 'Frostvale Ski Hire', who: 'juno',
            lines: ['"So you\'re Theo\'s famous friends." Juno is waxing a ski. "Ex ski patrol. I know every ridge on that mountain, and I know the Glacier Bank\'s cable car goes up at midnight with nobody in it but the gold run."',
              '"Getting up is easy. Getting DOWN, with gold, with their guards behind you? That\'s why you need me." She taps a folded wingsuit. "Go and look at the job. I\'ll meet you at the lodge."'] }],
        },
      ],
      recon: [
        { id: 'station', label: 'Cable car station', text: 'The cable car goes up at midnight for the gold run. One operator, no guards at the bottom.' },
        { id: 'hut', label: 'Security hut', text: 'Shift change at 11:45. The night crew drives up the service road; they\'re on the summit by midnight.' },
        { id: 'office', label: 'Bank office', text: 'The board shows the vault: a steel door with a keypad, an ice tunnel with lasers, and a round dial door.' },
      ],
      goal: { type: 'reach', label: 'Pine Lodge', requireMeetings: true, requireRecon: true },
      doneTitle: 'Home',
      doneText: 'The cabin smells of pine and old smoke. Mags spreads your photos across the table, Theo lights the stove, Ricky finds the only armchair. Juno unrolls a map of the mountain. "Midnight," she says.',
    },
    {
      id: 'glacier', kind: 'onFoot', mode: 'glacier', title: 'The Glacier Vault',
      intro: [
        { kicker: 'The summit, 12:06 a.m.', who: 'mags',
          lines: ['"You\'re at the top. Steel door at the back of the plateau: hack the panel. Through the ice tunnel, crack the vault, grab the gold. Then Juno gets you down."'] },
        { kicker: 'How to play', title: 'The Glacier Vault',
          lines: [
            'Two searchlight masts sweep the snow and guards walk the plateau: stay behind the rocks and snowcats, or knock guards out from behind (E).',
            'In the tunnel, the flashing lasers switch off every few seconds (they flicker just before they come back on); crouch (C) or slide under the low ones. Taking the last gold stack sets off the ALARM.',
          ] },
      ],
      startLabel: 'Go',
      objective: 'Hack the panel by the vault\'s steel door',
      doneTitle: 'Down the mountain',
      doneText: 'You glide out of the clouds and thump into the snow next to Juno. "Not bad for a city kid." The snowmobile takes you down to the service road, where Ricky has a car warming up.',
    },
    {
      id: 'descent', kind: 'drive', title: 'The mountain road',
      time: 'night', weather: 'snow', ice: true,
      intro: [
        { kicker: 'The service road, 12:31 a.m.', who: 'ricky',
          lines: ['"The bank called the sheriff. Every car in the valley is coming up this road." He hands you the keys. "It\'s ice all the way down. Brake early."'] },
        { kicker: 'How to play', title: 'Ice',
          lines: ['The roads are icy: the car slides, so brake before the corners. Lose the police, then get back to Pine Lodge (green light).'] },
      ],
      startLabel: 'Drive',
      objective: 'Lose the police, then get back to Pine Lodge',
      city: MOUNTAIN_ROAD,
      start: { node: [1, 1], offset: [2.3, 30], heading: 0 },
      goal: { type: 'safehouse', block: '6,6', label: 'Pine Lodge', loseCops: true },
      heat: { start: 3, max: 4, riseEvery: 45 },
      roadblocks: { fromHeat: 4, every: 30, spikes: true },
      doneTitle: 'Pine Lodge',
      doneText: 'You slide into the lodge\'s barn with the lights off. Outside, the sheriff\'s cars crawl past and keep going up the mountain, looking for a crew that came down the other way.',
    },
  ],

  outro: [
    { kicker: 'Pine Lodge, 2:10 a.m.', who: 'juno',
      lines: ['The gold is stacked by the stove. Juno pours five mugs of cocoa. "So," she says. "Is it always like this?"'] },
    { kicker: 'Pine Lodge', who: 'mags',
      lines: ['"Only on good days," Mags says. She looks round the table: Theo, Ricky, Juno, you. "New town. New crew. Same rules: nobody gets left behind."'] },
  ],

  jobDone: {
    title: 'A new life in the snow',
    text: 'You left the city with a bounty on your head and arrived in Frostvale with nothing. Now the Glacier Bank is short a vault full of gold, and nobody in town has a clue who you are.',
  },

  finale: {
    title: 'The End (for now)',
    text: 'Snow covers your tracks by morning. Down in Frostvale the wanted posters are fading, and up on the mountain the Glacier Bank is changing every lock. Somewhere, the next job is waiting.',
  },
};

// Chapter 21: "The Last Bridge"
//
// Lumière's finale. At noon Inspector Delacroix looks at the Star in the
// Grand Musée and sees glass. By one o'clock she knows where the crew lives.
// Part 1: tail her car from the museum (don't let her see you): she leads the
// police straight to the studio. Part 2: the raid: over the roofs with
// Delacroix herself on your heels, to Paz's boat on the river. Part 3: down
// the river under the bridges (duck under the low footbridges; the narrow
// arches stop the police launches) to the Iron Tower. Part 4: at dusk, sneak
// through the park round the tower, past the police, up the stair and onto
// the lift. Part 5: climb the top of the tower in the wind to Juno's
// helicopter. Part 6: Juno drops you by Ricky's van outside the city: drive
// to the airfield before they close the last bridge.
// The crew leaves Lumière for the desert: Mirage Springs (Chapters 22-24).
// No mole, no detective work (see CLAUDE.md): the crew is loyal; the
// trouble is Delacroix, who never gives up.

const NOON_CITY = {
  classic: true,
  forceKinds: { '4,3': 'musee', '6,6': 'atelier' },
};

const BRIDGE_CITY = {
  classic: true,
  forceKinds: { '7,0': 'airfield', '6,6': 'atelier' },
};

export const CHAPTER21 = {
  id: 'chapter21',
  number: 21,
  title: 'Chapter 21: The Last Bridge',
  short: 'The Last Bridge',
  noDeduction: true,
  suspects: [],
  crew: ['mags', 'theo', 'ricky', 'juno', 'paz', 'kitsu'],
  clues: {},
  verdicts: {},
  nextChapter: null,
  rating: { gold: 1100, silver: 1700 },

  parts: [
    {
      id: 'noon', kind: 'drive', title: 'Noon',
      time: 'day', weather: 'clear',
      intro: [
        { kicker: 'The Grand Musée, noon', who: 'kitsu',
          lines: ['Kitsu, on the radio, from a café across the square: "Delacroix just went in. She asked them to open the Star\'s case. She\'s holding it up to the light."',
            'A long pause. "She\'s coming out. She\'s running. She\'s on the phone to the police. She knows."'] },
        { kicker: 'The plan', who: 'mags',
          lines: ['Mags: "Then we need to know what she knows. Follow her. Don\'t let her see you."'] },
        { kicker: 'How to play', title: 'Not too close',
          lines: ['Follow Delacroix\'s grey car through Lumière in daylight. Keep it in sight, but not too close: when the meter goes red, drop back. Fall too far behind and you lose her. No police yet.'] },
      ],
      startLabel: 'Follow',
      objective: 'Follow Delacroix\'s car without being seen',
      city: NOON_CITY,
      start: { node: [4, 3], offset: [2.3, 18], heading: 0 },
      noPolice: true,
      fugitive: { startNode: [4, 4], heading: 0, name: 'Delacroix', who: 'delacroix', kind: 'civilian', color: 0x7a7e86 },
      goal: {
        type: 'tail', block: '6,6', label: 'Wherever she\'s going', near: 15, far: 85,
        spottedTitle: 'She saw you', spottedText: 'Delacroix looked in her mirror one time too many, and turned straight back to the police station. Hang back further: keep the meter out of the red.',
        lostTitle: 'Lost her', lostText: 'The grey car turned a corner and was gone. Keep it in sight: the marker shows where it is.',
      },
      heat: { start: 1, max: 1, riseEvery: 999 },
      doneTitle: 'She knows',
      doneText: 'The grey car stops outside the studio. Your studio. Delacroix gets out and looks straight up at your window, and behind her, police vans pull into the street. You go in through the back, and up the stairs, two at a time.',
    },
    {
      id: 'raid', kind: 'onFoot', title: 'The raid',
      level: 'ch21Roofs', time: 'afternoon', weather: 'clear',
      intro: [
        { kicker: 'The studio, 1 p.m.', who: 'mags',
          lines: ['Fists on the door downstairs. "POLICE! OPEN UP!" Mags grabs the velvet bag with the Star and throws it to you. "Out of the skylight. Paz is waiting on the river with the boat. Go!"'] },
        { kicker: 'On the roof', who: 'delacroix',
          lines: ['You\'re out on the zinc roof when a second skylight bangs open behind you, and out climbs a woman in a beige trench coat. Delacroix. "You are very good," she says. "But I am better."',
            'And she runs.'] },
        { kicker: 'How to play', title: 'Run',
          lines: ['Get over the roofs and down to Paz\'s boat at the river quay (follow the checkpoints, then the green light). Delacroix leads the chase herself, and she\'s quicker than her officers. A police helicopter hunts you from above: stay out of its light, or hide in the stairwell huts and under the water tanks.'] },
      ],
      startLabel: 'Run',
      objective: 'Get to Paz\'s boat on the river',
      officers: { count: 4, speed: 0.86, streets: true, lead: 'delacroix', leadSpeed: 1.07 },
      heli: { delay: 10, spotSpeed: 5, fill: 0.55, lead: 0.2, callout: { who: 'delacroix', line: 'You cannot run forever. I have never lost a case.' } },
      goal: { type: 'reach', label: 'Paz\'s boat' },
      doneTitle: 'Into the boat',
      doneText: 'You take the quay steps three at a time and jump. Paz catches you, guns the engine, and the speedboat leaps away from the wall. Up on the quay, Delacroix stops, breathing hard, and pulls out her radio.',
    },
    {
      id: 'river', kind: 'onFoot', mode: 'river', title: 'The river',
      time: 'afternoon', weather: 'clear',
      intro: [
        { kicker: 'The river, 1:20 p.m.', who: 'paz',
          lines: ['"Hold on!" Paz throws the boat round the first bend. Behind you, two police launches come out from under a bridge, blue lights flashing, and in the front of the first one, in her beige coat: Delacroix.',
            '"We go all the way down, to the Iron Tower. Juno can pick us up from the top of it. Nowhere else."'] },
        { kicker: 'How to play', title: 'Under the bridges',
          lines: ['Drive the speedboat down the river to the landing under the Iron Tower (the green light). Space = boost. Steer through the bridges\' arches: the narrow side arches fit you but not a police launch. Some bridges have LOW footbridges: hold C (or the Drift button) to DUCK as you go under, or you\'ll bang your head and stop dead. The launches are too tall: they get stuck behind. Don\'t let one stay alongside you.'] },
      ],
      startLabel: 'Go',
      objective: 'Down the river to the Iron Tower',
      doneTitle: 'The Iron Tower',
      doneText: 'Paz runs the boat in under the bridge by the tower and cuts the engine. Above you, sirens everywhere. "We wait here," she says. "Until it\'s dark. Then Juno comes."',
    },
    {
      id: 'park', kind: 'onFoot', mode: 'tower', title: 'The park',
      time: 'dusk', weather: 'clear',
      intro: [
        { kicker: 'Under the bridge, dusk', who: 'kitsu',
          lines: ['Kitsu, on the radio: "Every police officer in Lumière is round that tower. They think you\'re going to jump in the river again. Nobody thinks you\'re going UP."',
            '"There\'s a stair inside the west leg up to the first deck, and a lift up to the second. After that, it\'s ladders."'] },
        { kicker: 'How to play', title: 'Through the park',
          lines: ['Sneak through the park to the stair in the tower\'s west leg (crouch behind the hedges; the police helicopter\'s searchlight sweeps the lawns), climb it to deck 1, get past the two officers up there, and ride the lift (on the east side) up to deck 2. Knock officers out from behind (E).'] },
      ],
      startLabel: 'Go',
      objective: 'Through the park and up to the lift',
      doneTitle: 'Deck 2',
      doneText: 'The lift clanks to a stop sixty metres up. The city spreads out below you in the last of the light, and the wind tugs at your coat. Up there, at the very top, a small white helicopter is circling, with no lights on.',
    },
    {
      id: 'tower', kind: 'onFoot', mode: 'tower', title: 'The Iron Tower',
      time: 'dusk', weather: 'clear',
      intro: [
        { kicker: 'Deck 2, sixty metres up', who: 'juno',
          lines: ['Juno, on the radio: "I see you! I can hover over the top deck for a few minutes, no more. I\'ll drop a rope ladder."',
            'Kitsu: "And the police helicopter has seen Juno. It\'s coming round with its searchlight."'] },
        { kicker: 'How to play', title: 'In the wind',
          lines: ['Climb the four ladders round the tower to the top deck: walk into a ladder to climb it, and walk across each little platform to the next ladder. When a GUST is coming (the meter warns you), crouch (C) or hang on to a ladder, or it blows you off. Keep out of the police helicopter\'s light. At the top, grab Juno\'s rope ladder (E).'] },
      ],
      startLabel: 'Climb',
      objective: 'Climb to the top of the Iron Tower',
      doneTitle: 'Over the city',
      doneText: 'You grab the rope ladder and Juno pulls away from the tower. You hang there, swinging, the whole of Lumière shining underneath your feet, and climb up into the helicopter. Far below, on deck 2, a beige coat. Delacroix, looking up.',
    },
    {
      id: 'bridge', kind: 'drive', title: 'The last bridge',
      time: 'night', weather: 'clear',
      intro: [
        { kicker: 'Outside the city, 9 p.m.', who: 'ricky',
          lines: ['Juno puts down in a field at the edge of town, where Ricky is waiting with the van and the rest of the crew. "Juno\'s plane is at the airfield," he says. "But Delacroix is closing every bridge out of Lumière. One by one."',
            'Kitsu: "There\'s one left open. Not for long."'] },
        { kicker: 'How to play', title: 'The last bridge',
          lines: ['Drive the van to the airfield (the blue light) before Delacroix closes the last bridge. The police are everywhere tonight, with roadblocks and spike strips when the heat is high. Hack junctions (E) and use the nitro.'] },
      ],
      startLabel: 'Drive',
      objective: 'Get to the airfield before the last bridge closes',
      car: { kind: 'van', color: 0x2a3a5a },
      city: BRIDGE_CITY,
      start: { node: [5, 4], offset: [-2.3, -20], heading: Math.PI },
      goal: { type: 'reach', block: '7,0', label: 'The airfield', color: 0x39e6ff, timer: 180, timerLabel: 'Last bridge closes in',
        timeoutTitle: 'The bridge is closed', timeoutText: 'Delacroix closed the last bridge out of Lumière. Try again: hack the junctions (E), cut through the parks, and keep the nitro for the straights.' },
      heat: { start: 3, max: 5, riseEvery: 40 },
      roadblocks: { fromHeat: 4, every: 28, spikes: true },
      doneTitle: 'Wheels up',
      doneText: 'Ricky drives the van straight up the ramp into Juno\'s plane, and the ramp closes behind you. As the plane lifts off over the river, a single grey car stops at the end of the runway, and a woman in a beige coat gets out and watches you go.',
    },
  ],

  outro: [
    { kicker: 'Over the mountains, midnight', who: 'kitsu',
      lines: ['Kitsu\'s phone buzzes. A message, from a number nobody knows: "The Star belongs in its museum. I will find you. D."',
        'Theo laughs. "She found us once already."'] },
    { kicker: 'Over the sea', who: 'mags',
      lines: ['Mags turns the Star in her fingers, and the little rainbows go all round the cabin. "We still need someone who\'ll buy it." She opens a map. Desert, as far as the eye can see, and in the middle of it, a city of casinos.',
        '"Mirage Springs. They\'ll buy anything there."'] },
  ],

  jobDone: {
    title: 'The Last Bridge',
    text: 'You tailed the woman who never loses, got off a roof under her nose, ducked under every bridge in Lumière and flew off the top of the Iron Tower. Goodbye, Lumière.',
  },

  finale: {
    title: 'To be continued',
    text: 'Next stop: Mirage Springs, a city of casinos in the middle of the desert, where they\'ll buy anything. And Delacroix is still looking for you.',
  },
};

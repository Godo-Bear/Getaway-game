// Chapter 22: "Sandstorm"
//
// The crew flies into Mirage Springs, a city of casinos in the middle of the
// desert, to sell the Star. They land on a dry lake outside town where
// nobody looks... except the Jackals, the crew that owns the desert. Their
// boss, Sable, takes the Star the moment the ramp comes down.
// Part 1: after her across the dunes in a buggy: ram her buggy to bits.
// Part 2: she gets away in the Jackals' van: chase it down the Strip before
// it gets into their garage. The case in the back is empty.
// Part 3: Dry Gulch, the old silver town where the Jackals live, in a
// sandstorm: take the Star back from the bank's vault while the gusts hide you.
// Part 4: out of town on an old railway handcar: pump it, punch the Jackals
// off their dirt bikes, duck under the water-tower spouts.
// Part 5: back into town at night: lose the sheriff (Sable owns him) and get
// to the Oasis Motel, the crew's new home.
// Part 6: the Jackals raid the motel at 2 a.m.: over the casino roofs with
// the Star to the buyer, at the Golden Mirage.
// No mole, no detective work (see CLAUDE.md): the crew is loyal; the trouble
// is a rival crew, and a sheriff they've bought.

const STRIP_CITY = {
  desert: true,
  forceKinds: { '6,6': 'sableauto', '4,4': 'golden', '1,1': 'oasis' },
};

export const CHAPTER22 = {
  id: 'chapter22',
  number: 22,
  title: 'Chapter 22: Sandstorm',
  short: 'Sandstorm',
  noDeduction: true,
  suspects: [],
  crew: ['mags', 'theo', 'ricky', 'juno', 'paz', 'kitsu'],
  clues: {},
  verdicts: {},
  nextChapter: null,
  rating: { gold: 1150, silver: 1750 },

  parts: [
    {
      id: 'dunes', kind: 'onFoot', mode: 'dunes', title: 'The dunes',
      time: 'day', weather: 'clear',
      intro: [
        { kicker: 'Over the desert, 10 a.m.', who: 'juno',
          lines: ['Juno banks the plane low over an ocean of sand. "Mirage Springs airport has cameras, customs, the works. So we\'re landing on the dry lake. Nobody ever goes out there."',
            'Far off, a city of gold towers shimmers in the heat.'] },
        { kicker: 'The dry lake', who: 'sable',
          lines: ['The ramp comes down onto the cracked white mud, and four dune buggies come roaring out from behind the dunes and circle the plane. A woman in red leather and aviators climbs out of the first one.',
            '"Welcome to Mirage Springs. I\'m Sable. Everything that comes into this town pays the Jackals." She picks up the silver case with the Star in it. "This\'ll do." And she\'s gone, in a cloud of sand.'] },
        { kicker: 'The back of the plane', who: 'theo',
          lines: ['Ricky pulls a tarp off the crew\'s own buggy. "I packed it just in case." Theo is already strapped into the passenger seat. "Drive! I\'ll hold on!"'] },
        { kicker: 'How to play', title: 'Over the dunes',
          lines: ['Chase Sable\'s red buggy across the desert and RAM it four times to wreck it before she gets to the highway. Hit a sharp crest at speed and you fly: big air fills your boost (Space). Uphill slows you down, downhill speeds you up. Her two Jackals (black buggies) swing in to knock you away: hit them hard and they spin out. Don\'t fall too far behind!'] },
      ],
      startLabel: 'Drive',
      objective: 'Ram Sable\'s buggy four times before she reaches the highway',
      doneTitle: 'Wrecked',
      doneText: 'Sable\'s buggy rolls over twice and stops on its wheels in a cloud of sand. Before you can get to her, a black van with a red jackal on the side comes skidding over the dune. Sable throws the case in the back, dives in after it, and the van roars off up the highway towards the city.',
    },
    {
      id: 'strip', kind: 'drive', title: 'The Strip',
      time: 'afternoon', weather: 'clear',
      intro: [
        { kicker: 'The highway into town', who: 'kitsu',
          lines: ['Kitsu, on the radio: "That van\'s going to Sable Auto, the Jackals\' garage on the south side. Once it\'s inside, we never see the Star again."',
            'Ricky screeches up beside your buggy in the crew\'s car. "Swap! Buggies aren\'t allowed on the Strip!"'] },
        { kicker: 'How to play', title: 'Catch the van',
          lines: ['Catch the Jackals\' black van before it gets to SABLE AUTO (the red light). Stay right on its bumper, or ram it, to fill the meter. The sheriff\'s cars are about, too.'] },
      ],
      startLabel: 'Drive',
      objective: 'Catch the Jackals\' van before it reaches Sable Auto',
      city: STRIP_CITY,
      start: { node: [4, 0], offset: [2.3, 18], heading: 0 },
      fugitive: { startNode: [4, 1], heading: 0, name: 'The Jackals\' van', who: 'sable', kind: 'van', color: 0x1e1f24,
        escapeTitle: 'They made it', escapeText: 'The black van shot into Sable Auto and the steel door came down behind it. Stay on its bumper, and ram it, before it gets there.' },
      goal: { type: 'chase', block: '6,6', label: 'Sable Auto', color: 0xff5a4a },
      heat: { start: 1, max: 2, riseEvery: 60 },
      doneTitle: 'Empty',
      doneText: 'The van spins out in front of the Golden Mirage and stops against its fountain. Theo yanks the back doors open: two dizzy Jackals, a pile of tyres, and the silver case. Empty. Kitsu, on the radio: "A dirt bike just shot out of the van\'s side door back there. Red jacket. Going west, out of town." Mags: "Dry Gulch. The old silver town. That\'s where the Jackals live." And out west, the sky is turning brown.',
    },
    {
      id: 'gulch', kind: 'onFoot', mode: 'sandstorm', title: 'Dry Gulch',
      time: 'afternoon', weather: 'clear',
      intro: [
        { kicker: 'A ridge above Dry Gulch, 4 p.m.', who: 'mags',
          lines: ['Mags lies flat on the ridge with her binoculars. Below, at the end of a dirt road: a ghost town. A saloon, a bank, a water tower, a railway station nobody has used for fifty years. And Jackals, everywhere.',
            '"She\'ll have put the Star in the old bank vault. She thinks nobody can get in there."'] },
        { kicker: 'The storm', who: 'kitsu',
          lines: ['Kitsu, on the radio: "A sandstorm\'s coming in. A big one. In the gusts you won\'t be able to see your hand in front of your face." Theo grins. "Neither will they."'] },
        { kicker: 'How to play', title: 'In the storm',
          lines: ['Get into the bank, open the old vault (hold E) and take the Star, then get to the railway station at the far end of town. The storm comes and goes: when a big GUST blows through (the meter warns you), the Jackals can hardly see: move! When it clears, hide behind the wagons and the barrels. Knock Jackals out from behind (E).'] },
      ],
      startLabel: 'Go',
      objective: 'Take the Star from the bank vault',
      doneTitle: 'The handcar',
      doneText: 'Theo is waiting at the station, by a track no train has used in fifty years. There is no train. There\'s a rusty railway handcar, with a pump handle like a see-saw. Theo looks at it. Then at you. "You\'re joking."',
    },
    {
      id: 'handcar', kind: 'onFoot', mode: 'handcar', title: 'The handcar',
      time: 'dusk', weather: 'clear',
      intro: [
        { kicker: 'Dry Gulch station', who: 'theo',
          lines: ['Theo grabs the other end of the pump handle. "Up, down, up, down. How hard can it be?" Behind you, engines: the Jackals have found the empty vault.'] },
        { kicker: 'On the radio', who: 'ricky',
          lines: ['"I\'m at the level crossing on Highway 9, down the line, with the van. Get here."'] },
        { kicker: 'How to play', title: 'Pump!',
          lines: ['Pump the handcar: press A and D (or Left and Right) one after the other, in a steady rhythm, to build up speed. Jackals on dirt bikes ride up beside you: punch them off (E, or click) when they\'re close. DUCK (C) under the water-tower spouts and the low beams. Get to Ricky\'s van at the level crossing.'] },
      ],
      startLabel: 'Pump',
      objective: 'Pump the handcar down the line to Ricky',
      doneTitle: 'The crossing',
      doneText: 'The handcar screeches to a stop at the level crossing, and there\'s Ricky\'s van with the back doors open. You and Theo dive in, Ricky floors it, and the last Jackal bike skids into the ditch behind you.',
    },
    {
      id: 'home', kind: 'drive', title: 'Back to town',
      time: 'night', weather: 'clear',
      intro: [
        { kicker: 'Highway 9, 9 p.m.', who: 'ricky',
          lines: ['Ricky glances in the mirror. "Bad news. Sable owns the sheriff. Every deputy in town has our number plate."',
            'Kitsu: "Mags found us rooms at the Oasis Motel, on the north side. Nobody there asks questions. Just don\'t bring the sheriff with you."'] },
        { kicker: 'How to play', title: 'Lose them',
          lines: ['Drive to the OASIS MOTEL (green light), but lose the sheriff\'s cars first: you can\'t lead them home. Roadblocks and spike strips when the heat is high. Hack junctions (E) and use the nitro.'] },
      ],
      startLabel: 'Drive',
      objective: 'Lose the sheriff and get to the Oasis Motel',
      car: { kind: 'van', color: 0x2a3a5a },
      city: STRIP_CITY,
      start: { node: [2, 8], offset: [-2.3, -20], heading: Math.PI },
      goal: { type: 'safehouse', block: '1,1', label: 'Oasis Motel', loseCops: true },
      heat: { start: 2, max: 4, riseEvery: 45 },
      roadblocks: { fromHeat: 4, every: 30, spikes: true },
      doneTitle: 'The Oasis',
      doneText: 'Ricky backs the van under the motel\'s carport, and the green OASIS sign buzzes over your heads. Room 7: two beds, a TV that doesn\'t work, and a swimming pool with no water in it. Mags locks the Star in the bathroom. It\'s the best sleep you\'ve had in weeks. For about three hours.',
    },
    {
      id: 'casinos', kind: 'onFoot', title: 'Over the casinos',
      level: 'ch22Roofs', time: 'night', weather: 'clear',
      intro: [
        { kicker: 'The Oasis Motel, 2 a.m.', who: 'kitsu',
          lines: ['Kitsu shakes you awake. "Up. UP! Jackals in the car park. Six of them. Sable\'s with them."',
            'Mags throws you the Star, in a sock. "The buyer. Lorenzo Gold, at the Golden Mirage. He\'s expecting us. Get it to him. Over the roofs. Go!"'] },
        { kicker: 'On the roof', who: 'sable',
          lines: ['You\'re out of the bathroom window and up on the roof when Sable climbs the motel sign after you. "Nobody steals from the Jackals," she says. "Nobody."'] },
        { kicker: 'How to play', title: 'Over the Strip',
          lines: ['Get over the roofs to the Golden Mirage (follow the checkpoints, then the gold light). Sable and her Jackals chase you across the roofs, and their helicopter hunts you with its searchlight: stay out of its light, or hide in the stairwell huts and under the water tanks.'] },
      ],
      startLabel: 'Run',
      objective: 'Get the Star to the Golden Mirage',
      officers: { count: 4, speed: 0.86, streets: true, lead: 'sable', leadSpeed: 1.04, look: 'jackal' },
      heli: { delay: 12, spotSpeed: 5, fill: 0.55, lead: 0.2, callout: { who: 'sable', line: 'Run all you like. This whole town is mine.' } },
      goal: { type: 'reach', label: 'The Golden Mirage' },
      doneTitle: 'The Golden Mirage',
      doneText: 'You drop off the last roof into the casino\'s drive, under a thousand gold lights. Two doormen in gold jackets step between you and the Jackals, and the Jackals stop dead. Nobody starts trouble at the Golden Mirage. A glass lift takes you up, and up, to the top floor.',
    },
  ],

  outro: [
    { kicker: 'The penthouse, 3 a.m.', who: 'lorenzo',
      lines: ['Lorenzo Gold, who owns the Golden Mirage and most of the Strip, turns the Star slowly under his desk lamp. "Beautiful. Yes. I\'ll buy it."',
        'He slides it back across the desk to Mags. "But not with money. With a job."'] },
    { kicker: 'The penthouse', who: 'lorenzo',
      lines: ['"Sable keeps everything she steals down the old silver mine, up in the mountains. Twenty years of it. I want what\'s down there. Bring it to me, and the Star is worth ten times what you asked."',
        'Mags looks at the crew. The crew looks at Mags. "Deal."'] },
  ],

  jobDone: {
    title: 'Sandstorm',
    text: 'You chased Sable over the dunes, took the Star back from a ghost town in a sandstorm, pumped a handcar out of Dry Gulch and ran the roofs of the Strip with the Jackals on your heels.',
  },

  finale: {
    title: 'To be continued',
    text: 'Next: down into the Jackals\' silver mine, where Sable keeps twenty years of loot.',
  },
};

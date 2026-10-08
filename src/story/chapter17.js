// Chapter 17: "Kurogane Tower"
//
// Neon Kōji. The courier from Chapter 16 worked for Kurogane, the people who
// own half the city and its tallest tower, and their gold sits in a sky
// vault on the 88th floor. Nobody goes in from the top, because nobody can
// get to the top. Part 1: jump from Juno's helicopter in a wingsuit and fly
// down a canyon of skyscrapers to land on the roof (updrafts, boost rings,
// drones with searchlights). Part 2: ride the window cleaners' gondola down
// to the vault window, cut the glass, cross a floor of pressure tiles on the
// path Kitsu shows you, grab the gold, then jump out of the window: the
// parachute takes you down to Kitsu's van. Part 3: Kurogane's black cars and
// the police they pay chase you across the neon city to Kitsu's garage.
// No mole, no detective work (see CLAUDE.md): the crew is loyal; the trouble
// is Kurogane and its security. At the end, a rival crew (the Silver
// Dragons) challenges them to a race for the gold.

const BLACK_CARS_CITY = {
  neon: true,
  forceKinds: { '6,1': 'kurogane', '1,6': 'foxden', '3,4': 'park', '5,5': 'park' },
};

export const CHAPTER17 = {
  id: 'chapter17',
  number: 17,
  title: 'Chapter 17: Kurogane Tower',
  short: 'Kurogane Tower',
  noDeduction: true,
  suspects: [],
  crew: ['mags', 'theo', 'ricky', 'juno', 'paz', 'kitsu'],
  clues: {},
  verdicts: {},
  nextChapter: 'chapter18',
  rating: { gold: 600, silver: 960 },

  parts: [
    {
      id: 'flight', kind: 'onFoot', mode: 'skydrop', title: 'The wingsuit',
      time: 'night', weather: 'clear',
      intro: [
        { kicker: 'Above Neon Kōji, 2 a.m.', who: 'juno',
          lines: ['Juno holds the helicopter steady, 330 metres above the end of the avenue. Below you, a canyon of glass and neon runs all the way to one black tower with a red crown: Kurogane.',
            '"They own half this city," Kitsu says in your ear. "Their gold sits in a sky vault on the 88th floor. Nobody goes in from the top, because nobody can get to the top."'] },
        { kicker: 'In the doorway', who: 'mags',
          lines: ['"You can," Mags grins, zipping up your wingsuit. "Fly down the avenue and land on their roof. Kitsu has their cameras. She doesn\'t have their drones, so keep out of the searchlights."'] },
        { kicker: 'How to play', title: 'The wingsuit',
          lines: ['A / D steer, W dives (faster, but you drop), S flares (slower, and you float). Fly through the steam updrafts over the lower towers to climb, and through the orange rings for a burst of speed. Keep out of the drones\' searchlights. Land anywhere on Kurogane\'s roof (the helipad is a bonus). Hit a wall, or drop below the roof, and you start again.'] },
      ],
      startLabel: 'Jump',
      objective: 'Fly down the avenue and land on Kurogane Tower\'s roof',
      doneTitle: 'Touchdown',
      doneText: 'You thump down onto the roof of Kurogane Tower and roll. 220 metres up, the wind tugging at you, the whole city glowing below. Kitsu: "Nice. Now the hard part."',
    },
    {
      id: 'vault', kind: 'onFoot', mode: 'skyvault', title: 'The sky vault',
      time: 'night', weather: 'clear',
      intro: [
        { kicker: 'The roof', who: 'kitsu',
          lines: ['"The vault\'s on the 88th floor, right under you, behind the big window on the east side. The window cleaners\' gondola hangs right above it."',
            '"Ride it down and cut the glass. Then the floor. I can\'t switch it off, but I can tell you where to step."'] },
        { kicker: 'How to play', title: 'The sky vault',
          lines: ['Step into the gondola and press E to lower it. When the drone\'s light sweeps your way, crouch (C) below the rail. Hold E to cut the glass. Inside, Kitsu lights up the safe tiles for a few seconds: remember the path and follow it exactly (the terminal by the window shows it again). Grab the gold, run back to the window and jump: the parachute opens by itself. Land by Kitsu\'s orange van.'] },
      ],
      startLabel: 'Go',
      objective: 'Get into the window cleaners\' gondola',
      doneTitle: 'Into the van',
      doneText: 'You hit the street running, the parachute tangled behind you, and dive into the back of the van. Kitsu floors it before the door is even shut.',
    },
    {
      id: 'getaway', kind: 'drive', title: 'Black cars',
      time: 'night', weather: 'rain',
      intro: [
        { kicker: 'An alley, 2:30 a.m.', who: 'ricky',
          lines: ['Two streets later you jump from the van into Ricky\'s car. Behind you, black cars with red lights pour out of Kurogane\'s garage. "The van\'s too slow," Ricky says, and slides over. "You drive."',
            '"Kurogane pays half the police in this city," Kitsu says. "They\'ll all be looking for us. Lose them, then home to the Fox Den. They must never find it."'] },
        { kicker: 'How to play', title: 'Lose them',
          lines: ['Lose the black cars and the police (get far away and out of sight), then drive into the Fox Den, Kitsu\'s garage (the orange light). Hack junctions (E) to turn the lights red behind you, and watch out for roadblocks.'] },
      ],
      startLabel: 'Drive',
      objective: 'Lose Kurogane\'s cars, then get to the Fox Den',
      city: BLACK_CARS_CITY,
      start: { node: [7, 2], offset: [-2.3, 24], heading: Math.PI },
      goal: { type: 'safehouse', block: '1,6', label: 'The Fox Den', color: 0xff7a2a, loseCops: true },
      heat: { start: 3, max: 4, riseEvery: 50 },
      roadblocks: { fromHeat: 4, every: 30, spikes: true },
      doneTitle: 'The Fox Den',
      doneText: 'The garage door rattles down behind you. In the dark, Kitsu flicks on a string of fairy lights, and the gold glows.',
    },
  ],

  outro: [
    { kicker: 'The Fox Den, 3 a.m.', who: 'theo',
      lines: ['Theo stacks the gold bars on the workbench, one by one. Mags laughs. "They\'ll never live this down. Robbed from the top of their own tower."',
        'Ricky turns on the TV. Every channel shows Kurogane Tower lit up like a Christmas tree, helicopters circling it.'] },
    { kicker: 'A message', who: 'kitsu',
      lines: ['Kitsu\'s laptop beeps. A video message: a woman in a white racing jacket with a silver dragon on the back. "Very good. I\'m Ryu. My crew, the Silver Dragons, runs this city\'s streets. Kurogane was ours to rob."',
        '"So, a deal. One race, right across the city, tomorrow night. The winner keeps the gold. The loser leaves Neon Kōji for good." Mags doesn\'t even look up. "Tell her we\'re in."'] },
  ],

  jobDone: {
    title: 'Kurogane Tower',
    text: 'Kurogane\'s gold, lifted from a sky vault 88 floors up, by wingsuit and parachute.',
  },

  finale: {
    title: 'To be continued',
    text: 'A rival crew, the Silver Dragons, wants the gold. One race across Neon Kōji decides who keeps it.',
  },
};

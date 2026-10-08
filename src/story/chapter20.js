// Chapter 20: "Lights Out"
//
// Lumière, the night after the swap. Inspector Delacroix doesn't know what
// was taken yet, but she knows the crew did something: every camera in the
// city is watching for them. The buyer, Valcourt, will pay for the Star at
// midnight, in his box at the Opéra gala.
// Part 1: down into the catacombs with a torch, through the maze of bones to
// the cable vault, and cut the three cables: the whole city goes dark.
// Part 2: drive across the blacked-out city to the Opéra (the only lit
// building: it has its own generator) before the backup power comes on.
// Headlights off and the police can hardly see you; but nor can you.
// Part 3: Valcourt takes the Star and won't pay. Take it back: across the
// stage high above the show on the flying scenery, into his box while he's
// watching, and out through the roof.
// No mole, no detective work (see CLAUDE.md): the crew is loyal; the trouble
// is a double-crossing buyer and an investigator who never gives up.

const BLACKOUT_CITY = {
  classic: true,
  forceKinds: { '2,2': 'opera', '4,3': 'musee', '6,6': 'atelier' },
};

export const CHAPTER20 = {
  id: 'chapter20',
  number: 20,
  title: 'Chapter 20: Lights Out',
  short: 'Lights Out',
  noDeduction: true,
  suspects: [],
  crew: ['mags', 'theo', 'ricky', 'juno', 'paz', 'kitsu'],
  clues: {},
  verdicts: {},
  nextChapter: null,
  rating: { gold: 760, silver: 1150 },

  parts: [
    {
      id: 'catacombs', kind: 'onFoot', mode: 'catacombs', title: 'The catacombs',
      time: 'night', weather: 'clear',
      intro: [
        { kicker: 'The studio, the next evening', who: 'kitsu',
          lines: ['Kitsu turns her laptop round: a map of Lumière covered in little red dots. "Every camera in the city. Inspector Delacroix asked for all of them to watch for us tonight. She doesn\'t know what we took yet. But she knows it was us."',
            '"And Valcourt will only pay for the Star at midnight, in his box at the Opéra. Twenty million. We just have to get there without a thousand cameras seeing us."'] },
        { kicker: 'The plan', who: 'mags',
          lines: ['Mags taps the map: the old stone quarries under the city. The catacombs. "All of Lumière\'s power comes through one cable vault, down there. Cut it, and the whole city goes dark. No lights. No cameras."',
            '"The Opéra has its own generator. It\'ll be the only lit building in town."'] },
        { kicker: 'How to play', title: 'In the dark',
          lines: ['Find your way through the tunnels to the cable vault (the marker points to it) and cut the three cables (hold E at each). Your torch (E or L) runs on batteries: pick up spare ones (they glow blue). The power company\'s night patrol walks the tunnels with torches: keep out of the yellow fans, and switch YOUR torch off when one is near, or they\'ll see its light, even from behind. Knock them out from behind (E).'] },
      ],
      startLabel: 'Climb down',
      objective: 'Find the cable vault and cut the three cables',
      doneTitle: 'Lights out',
      doneText: 'You climb out of a manhole into the middle of a boulevard. Not a light anywhere: no street lamps, no windows, no traffic lights. Just the stars, and car horns everywhere. Far off across the river, one building is still glowing gold: the Opéra.',
    },
    {
      id: 'lightsout', kind: 'drive', title: 'The dark city',
      time: 'night', weather: 'clear',
      intro: [
        { kicker: 'A boulevard, in the dark', who: 'juno',
          lines: ['Juno pulls up beside the manhole in the van with no lights on. "Every police car in Lumière is out looking for whoever did this. They\'ve got headlights. We\'ve got the dark."',
            'Kitsu, on the radio: "The power company says the backup comes on in three minutes. When it does, so does every camera. Be inside the Opéra by then."'] },
        { kicker: 'How to play', title: 'Lights off',
          lines: ['Drive to the Opéra (the gold light) before the backup power comes on. The whole city is dark. Switch your headlights off (L, or the Lights button) and the police only see you when they\'re right on top of you. But then you can hardly see the road either. Lights on to see the way, lights off to hide.'] },
      ],
      startLabel: 'Drive',
      objective: 'Get to the Opéra before the power comes back',
      city: BLACKOUT_CITY,
      start: { node: [6, 7], offset: [-2.3, -20], heading: Math.PI },
      blackout: true,
      goal: { type: 'reach', block: '2,2', label: 'The Opéra', color: 0xffd070, timer: 170, timerLabel: 'Power back in',
        timeoutTitle: 'The lights came back on',
        timeoutText: 'The backup power came on, and with it every camera in Lumière. Try again: lights off when there are police about, lights on to see the way, and hurry.' },
      heat: { start: 2, max: 4, riseEvery: 45 },
      roadblocks: { fromHeat: 4, every: 30, spikes: false },
      doneTitle: 'The Opéra',
      doneText: 'You roll the van up to the stage door with no lights on. Inside, the Opéra is all gold and red velvet and music: the gala goes on as if nothing has happened. Mags and Theo go up to Box 5 in their best clothes, with the Star in a velvet bag.',
    },
    {
      id: 'opera', kind: 'onFoot', mode: 'opera', title: 'The Opéra',
      time: 'night', weather: 'clear',
      intro: [
        { kicker: 'Box 5, midnight', who: 'valcourt',
          lines: ['Valcourt holds the Star up to the light from the stage. "Magnifique." He lays it in an open case on the little table beside his chair. "And the money?" says Mags.',
            'Valcourt smiles. "Money? Madame, you stole it. Who will you complain to? The police?" His bodyguard walks Mags and Theo to the door.'] },
        { kicker: 'Backstage', who: 'kitsu',
          lines: ['Kitsu, on the radio: "Lucky we had a plan B. You\'re backstage, in stage blacks. Up in the flies, over the stage, there\'s a way across to his box. Get the Star back. Then out through the roof. Juno will be waiting."'] },
        { kicker: 'How to play', title: 'The fly tower',
          lines: ['Climb the ladder in the wing to the fly gallery. Cross the stage high above the show on the flying bridges: they go up and down, so wait for the next one to come level, then jump. Low over the stage the follow spots can catch you through the arch: stay high. Slip into Box 5 behind the bodyguard\'s back and take the Star (E) while Valcourt watches the show (he keeps turning round to admire it). Then ride the bridges UP to the top gallery on the left, and out through the roof hatch.'] },
      ],
      startLabel: 'Go',
      objective: 'Up to the fly gallery, and across to Box 5',
      doneTitle: 'Over the roofs',
      doneText: 'You push the hatch open and climb out onto the Opéra\'s roof, under the stars, with the whole dark city around you. A rope drops out of the night: Juno\'s helicopter, with no lights at all. Up you go.',
    },
  ],

  outro: [
    { kicker: 'Above Lumière', who: 'juno',
      lines: ['Below you, the city lights come back on, street by street. Box 5 is full of police. Valcourt is shouting at all of them. And in the middle of it all, a woman in a beige trench coat holds up an empty velvet case: Inspector Delacroix.'] },
    { kicker: 'The studio, 3 a.m.', who: 'mags',
      lines: ['Mags turns the Star over in her fingers. "No buyer. And Delacroix knows it was us. Tomorrow she looks at the Star in the museum, and sees glass."',
        'Theo grins. "Then we\'d better give her something else to look at."'] },
  ],

  jobDone: {
    title: 'Lights Out',
    text: 'You switched off a whole city, crossed the Opéra on its flying scenery, and took the Star back from the man who tried to steal it from you.',
  },

  finale: {
    title: 'To be continued',
    text: 'Delacroix knows. The Star is still in your pocket. One last night in Lumière.',
  },
};

// Chapter 19: "The Star of Lumière"
//
// Lumière (Chapters 19-21): a grand old European capital of cream stone and
// zinc roofs, cafés, a river with bridges, and the Iron Tower over it all.
// The job: swap the Star of Lumière, a 140-carat diamond on show at the
// Grand Musée, for a perfect glass copy, so nobody even knows it's gone.
// Part 1: collect the glass copy from the glassmaker across the river and
// drive it to the crew's studio without breaking it (every bump chips it).
// Part 2: over the museum's roof, up to the glass dome, and down a rope
// through the oculus and four layers of lasers to the Star; swap it.
// Part 3: the winch jams, so walk out through the Hall of Statues in a
// marble-grey catsuit: freeze on an empty plinth whenever a guard's torch
// turns your way. Paz's boat waits at the river door.
// No mole, no detective work (see CLAUDE.md): the crew is loyal; the
// trouble is the museum's security (and, next, an insurance investigator).

const GLASS_CITY = {
  classic: true,
  forceKinds: { '1,2': 'glassworks', '6,6': 'atelier', '4,3': 'musee' },
};

export const CHAPTER19 = {
  id: 'chapter19',
  number: 19,
  title: 'Chapter 19: The Star of Lumière',
  short: 'The Star of Lumière',
  noDeduction: true,
  suspects: [],
  crew: ['mags', 'theo', 'ricky', 'juno', 'paz', 'kitsu'],
  clues: {},
  verdicts: {},
  nextChapter: null,
  rating: { gold: 720, silver: 1100 },

  parts: [
    {
      id: 'glass', kind: 'drive', title: 'The glass Star',
      time: 'day', weather: 'clear',
      intro: [
        { kicker: 'Lumière, the morning after', who: 'mags',
          lines: ['Cream stone, grey roofs, a café on every corner, and a great iron tower over it all. Lumière. Mags spreads a museum leaflet on the café table: "The Star of Lumière. 140 carats. On show at the Grand Musée for one week."',
            '"We don\'t smash and grab this time. We swap it. Nobody will even know it\'s gone."'] },
        { kicker: 'The plan', who: 'theo',
          lines: ['"The best glassmaker in Europe has made us a copy. Perfect, down to the last facet. It\'s in her workshop across the river. And it\'s made of glass. So: gently."'] },
        { kicker: 'How to play', title: 'Handle with care',
          lines: ['Drive to the glassmaker\'s workshop (the orange light) and pull up to collect the glass Star. Then take it to the crew\'s studio by the river (the green light). It\'s fragile: every bump chips it, and a big crash smashes it. Brake early, take the corners slowly and keep clear of the traffic. No police today.'] },
      ],
      startLabel: 'Drive',
      objective: 'Collect the glass Star from the glassmaker',
      city: GLASS_CITY,
      start: { node: [7, 7], offset: [-2.3, -20], heading: Math.PI },
      noPolice: true,
      fragile: { label: 'The glass Star', after: 1, brokenTitle: 'Smashed!',
        brokenText: 'The velvet box hit the dashboard and the glass Star broke into a hundred pieces. Luckily the glassmaker always makes two. Try again: brake early, take the corners slowly and keep clear of the traffic.' },
      goal: {
        type: 'stops', block: '6,6', label: 'The studio',
        finalObjective: 'Take the glass Star to the studio without breaking it',
        stops: [
          { block: '1,2', label: 'Glassmaker', objective: 'Collect the glass Star from the glassmaker',
            title: 'The glass Star', text: 'Madame Verre puts a velvet box on the passenger seat. Inside: a perfect glass copy of the Star of Lumière. "It took me a year. Drive like a grandmother."' },
        ],
      },
      heat: { start: 1, max: 1, riseEvery: 999 },
      doneTitle: 'Not a scratch',
      doneText: 'You carry the velvet box up the studio stairs like a baby. Theo holds the glass Star up to the window next to a photo of the real one. "I can\'t tell them apart. I\'m a genius."',
    },
    {
      id: 'dome', kind: 'onFoot', mode: 'museum', title: 'The dome',
      time: 'night', weather: 'clear',
      intro: [
        { kicker: 'The Grand Musée, 2 a.m.', who: 'kitsu',
          lines: ['Kitsu, on the radio: "I\'m in their cameras. The Star sits in the round hall, under the glass dome, and the dome has a hole in the top: the oculus. That\'s your door."',
            '"Four layers of lasers between the oculus and the Star, and a night guard who walks through every half a minute. Easy."'] },
        { kicker: 'On the roof', who: 'ricky',
          lines: ['"Two guards on the roof of the long hall," Ricky says from the bridge. "Keep the skylights between you and their torches. The ladder up to the dome is at the far end."'] },
        { kicker: 'How to play', title: 'The dome',
          lines: ['Sneak along the roof past the guards (crouch behind the skylights), climb the ladder and the mast, cross the gantry to the oculus and clip on (E). On the rope: hold Jump to go down, hold Crouch to climb, move to swing. Blinking lasers: go through while they\'re off. Sliding lasers: swing into the gap. When the night guard comes, climb up high into the dark. At the bottom, swap the Star (E).'] },
      ],
      startLabel: 'Go',
      objective: 'Cross the roof to the dome without being seen',
      doneTitle: 'Stuck',
      doneText: 'The real Star in your pocket, the glass one on the velvet. Kitsu starts the winch, and it pulls you up... then whines, and stops. "The motor\'s burnt out," she whispers. "You\'ll have to walk out. Through the Hall of Statues."',
    },
    {
      id: 'statues', kind: 'onFoot', mode: 'museum', title: 'The Hall of Statues',
      time: 'night', weather: 'clear',
      intro: [
        { kicker: 'The Hall of Statues', who: 'kitsu',
          lines: ['You unclip and drop to the floor. Ahead, the long hall to the river door: two rows of marble statues on their plinths, and three guards with torches walking up and down between them.',
            '"Lucky you\'re dressed for it," Kitsu says. Under the black suit, Theo\'s idea: a marble-grey catsuit, and grey face paint.'] },
        { kicker: 'How to play', title: 'Be a statue',
          lines: ['Half the plinths are empty. Hop onto one and hold still: you freeze in a statue\'s pose, and nobody looks twice. When the torches turn away, hop to the next one. Move while a guard is looking and you\'re caught. Then out through the river door to Paz\'s boat.'] },
      ],
      startLabel: 'Go',
      objective: 'Get down the Hall of Statues to the river door',
      doneTitle: 'Gone',
      doneText: 'You slip out of the river door and down the quay steps into Paz\'s boat. She pushes off without a sound, and the Grand Musée glides away behind you, every statue still in its place. Well. Nearly every one.',
    },
  ],

  outro: [
    { kicker: 'The studio, 4 a.m.', who: 'theo',
      lines: ['Theo holds the Star up to the lamp, and the whole room fills with little rainbows. "One hundred and forty carats," he whispers. "And in the museum, one hundred and forty carats of my glass."'] },
    { kicker: 'The morning papers', who: 'kitsu',
      lines: ['Kitsu turns her laptop round. Nothing about a theft: nobody has noticed. But the museum\'s insurers are sending their best investigator to check the Star before it goes back to its vault: Inspector Delacroix. "She has never lost a case," Kitsu reads.',
        'Mags just smiles. "Then she\'s never met us."'] },
  ],

  jobDone: {
    title: 'The Star of Lumière',
    text: 'The most famous diamond in Lumière, swapped for glass under a dome full of lasers. Nobody even knows it\'s gone. Yet.',
  },

  finale: {
    title: 'To be continued',
    text: 'The museum\'s insurers are sending Inspector Delacroix to check the Star. She has never lost a case.',
  },
};

// Chapter 5: "The Lucky Star"
//
// Six months after Chapter 4. The old crew is gone, so you put together a
// new one (Part 1), rob the Lucky Star casino on the Strip (Part 2) and
// drive the money out through the neon (Part 3).
//
// This time there's only ONE mole: NOVA, the hacker. Her real name is Nova
// Voss; the casino's head of security is her aunt. She switched the cameras
// "off" for you, then back on from outside the moment you had the cash.
// Mags, Theo and Ricky are loyal. The red herring points at Theo.

const STRIP_CITY = {
  seed: 5555, blocks: 8,
  forceKinds: { '6,1': 'safehouse', '4,4': 'park', '2,2': 'park', '1,5': 'buildings' },
};

export const CHAPTER5 = {
  id: 'chapter5',
  number: 5,
  title: 'Chapter 5: The Lucky Star',
  short: 'The Lucky Star',
  traitor: 'nova',
  suspects: ['nova', 'mags', 'theo', 'ricky'],
  nextChapter: null,
  rating: { gold: 600, silver: 900 },
  deduction: { question: 'Who on the new crew is working for the Lucky Star?' },

  clues: {
    laptop: {
      name: 'Nova\'s second laptop',
      text: 'Left on a roof next to Nova\'s, still warm. The login screen reads: "LUCKY STAR SECURITY - remote access - user N.VOSS". Voss is the name of the casino\'s head of security.',
      pointsTo: 'nova',
      explain: 'Nova\'s real surname is Voss. She had a remote login to the Lucky Star\'s own security system all along.',
    },
    schedule: {
      name: 'Theo\'s work rota',
      text: 'A crumpled casino rota: Theo swapped off his shift tonight, and someone has scrawled "TELL CRANE?" across his name.',
      pointsTo: 'theo',
      redHerring: true,
      explain: 'A red herring. Theo swapped shifts because you asked him to, and the scrawl is his floor manager\'s: she has suspected Theo of hating Crane for months (she\'s right).',
    },
    badge: {
      name: 'Security badge',
      text: 'Dropped in the casino\'s security office: a Lucky Star staff badge, clearance level 5, with a photo of a young woman and a stickered laptop. Name: N. VOSS. Issued three months ago.',
      pointsTo: 'nova',
      explain: 'Nova has worked for Lucky Star security for three months. She joined your crew to walk you into a trap, and switched the cameras back on remotely when the vault was open.',
    },
  },

  verdicts: {
    nova: {
      correct: true,
      title: 'It was Nova',
      text: 'Nova Voss, niece of the Lucky Star\'s head of security. She was never going to switch the cameras off for good: she waited until you had the cash, then turned them back on from the van so Crane\'s guards could catch you red-handed. She didn\'t count on the rest of the crew.',
    },
    mags: {
      correct: false,
      title: 'Not Mags',
      text: 'Mags was on the radio the whole time and she\'s the one who told you to run for the shutter. She has thirty years of loyalty to thieves and none at all to casino owners.',
    },
    theo: {
      correct: false,
      title: 'Not Theo',
      text: 'Theo swapped his shift because you asked him to, and that scrawl on the rota was his floor manager\'s. He risked his job and his neck to let you in.',
    },
    ricky: {
      correct: false,
      title: 'Not Ricky',
      text: 'Ricky sat outside with the engine running through a full lockdown when he could have driven off. A mole would have been long gone.',
    },
  },

  outro: [
    {
      kicker: 'Ricky\'s garage, 2:52 a.m.',
      title: 'The cameras didn\'t switch themselves on',
      lines: [
        'The shutter comes down. The money is here. So is the crew: Mags, Theo, Ricky... and Nova, typing, not looking at anyone.',
        'Someone turned the cameras back on from outside while you were in the vault. Only one of them could have.',
      ],
    },
  ],

  resultOutro: 'By sunrise Nova is gone, and so is her laptop. But Mags, Theo and Ricky are still here, splitting Silas Crane\'s money on the garage floor. For the first time in a long time, you have a crew you can trust.',

  finale: {
    title: 'The End (for now)',
    text: 'Silas Crane wakes up to an empty vault and a niece of his security chief who can\'t explain where the cameras were. Somewhere across the city, a new crew is already planning the next job.',
  },

  parts: [
    {
      id: 'recruit', kind: 'onFoot', title: 'A new crew',
      level: 'ch5Recruit',
      intro: [
        { kicker: 'Six months later', title: 'One last job',
          lines: [
            'The old crew is gone: in prison, in witness protection, or in handcuffs on a wet runway. You kept your head down. Then Dex calls.',
          ] },
        { kicker: 'On the phone', who: 'dex',
          lines: ['"The Lucky Star, on the Strip. Silas Crane launders half the city\'s money through its vault. You need a new crew, so I\'ve sent you some names."',
            '"One more thing: Crane always has somebody on the inside. Watch your new friends."'] },
        { kicker: 'How to play', title: 'Find a new crew',
          lines: [
            'Meet Nova, Mags and Theo on the rooftops: follow the coloured beams. Two of them want you to prove yourself first (a quick hacking or safe-cracking test: press Jump when it lines up).',
            'Then get down to the street, where Ricky is waiting with the car. A police helicopter is patrolling: keep out of its light.',
          ] },
      ],
      startLabel: 'Go',
      objective: 'Meet your new crew',
      meetings: [
        {
          who: 'nova', task: 'hack', taskTitle: 'Hack the billboard',
          joinText: 'Nova the hacker is in. She seems to know an awful lot about casino security.',
          pages: [{ kicker: 'Nova', who: 'nova',
            lines: ['She doesn\'t look up from her laptop. "The Harbor Trust job? Everybody knows your face now."',
              '"Casinos run on cameras, and I can turn cameras off. But I only work with people who can keep up. That billboard over there: break into it."'] }],
        },
        {
          who: 'mags', task: 'safe', taskTitle: 'Crack the old safe',
          joinText: 'Mags the safecracker is in.',
          pages: [{ kicker: 'Mags', who: 'mags',
            lines: ['"Thirty years of safes," Mags says, patting a rusty one somebody hauled up onto the roof. "Six of them in prison."',
              '"If you want me on this, you open this one first. Feel for the clicks."'] }],
        },
        {
          who: 'theo', task: null,
          joinText: 'Theo the inside man is in. Ricky is waiting on the street with the car.',
          pages: [{ kicker: 'Theo', who: 'theo',
            lines: ['"I deal blackjack at the Lucky Star," Theo says. "Silas Crane owns it, and half the police department. I know every door in that building."',
              'He hands you a folded floor plan. "Ricky\'s down on the street with the car. See you inside."'] }],
        },
      ],
      heli: { delay: 25, spotSpeed: 5.2, fill: 0.45, lead: 0.1 },
      goal: { type: 'reach', label: 'Ricky\'s car', requireMeetings: true },
      doneTitle: 'The crew is together',
      doneText: 'Ricky leans out of the window. "So this is the famous one? Get in." Four strangers and one very big casino.',
    },
    {
      id: 'casino', kind: 'onFoot', mode: 'casino', title: 'The Lucky Star',
      intro: [
        { kicker: 'The Lucky Star, 2:10 a.m.', title: 'The Lucky Star',
          lines: ['Theo let you in through the staff door. Out on the casino floor the slot machines never stop ringing, and security is everywhere.'] },
        { kicker: 'On the radio', who: 'nova',
          lines: ['"I\'m in their network from the van. Get to the security office and plug me into the terminal: I\'ll kill the cameras."'] },
        { kicker: 'How to play', title: 'Guards, lasers and a vault',
          lines: [
            'Stay out of the guards\' yellow vision cones: if one sees you for a moment, you\'re back at the last checkpoint. Crouch (C, or hold Slide) behind card tables to hide.',
            'Hack the terminal, grab the keycard from the cashier\'s cage, get past the lasers, crack the vault, take the cash. Gold chip stacks are bonus cash.',
          ] },
      ],
      startLabel: 'Start the heist',
      objective: 'Hack the security terminal',
      doneTitle: 'Out of the Lucky Star',
      doneText: 'You burst into the garage with the alarm still screaming. Ricky already has the doors open.',
    },
    {
      id: 'strip', kind: 'drive', title: 'The Strip',
      weather: 'rain',
      intro: [
        { kicker: 'Casino garage, 2:31 a.m.', who: 'ricky',
          lines: ['"Get in, get in! Every cop on the Strip is coming! You drive, I\'ll navigate. Garage on the north side, I\'ll open it when you\'re clear."'] },
        { kicker: 'How to play', title: 'The getaway',
          lines: ['Lose the police (garages, parks and alleys help), then pull into Ricky\'s garage: the green light.'] },
      ],
      startLabel: 'Drive',
      objective: 'Lose the cops, then get to Ricky\'s garage',
      city: STRIP_CITY,
      start: { node: [1, 6], offset: [2.3, -30], heading: Math.PI },
      goal: { type: 'safehouse', block: '6,1', label: 'Ricky\'s garage', loseCops: true },
      heat: { start: 3, max: 4, riseEvery: 45 },
      roadblocks: { fromHeat: 4, every: 28, spikes: true },
      doneTitle: 'Safe',
      doneText: 'The garage door rattles down behind you. Now, about those cameras...',
    },
  ],
};

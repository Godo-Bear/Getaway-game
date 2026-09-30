// Chapter 2: "The Ferry"
//
// Vince is running with the cash and a ferry ticket. Part 1: chase his car
// through the city before he reaches the ferry terminal (the police are
// after you both, with roadblocks and spike strips). Part 2: he bails out at
// the docks and runs; chase him across the container terminal on foot.
//
// Caught at the end of the pier, Vince confesses: Hale was blackmailing him,
// but Hale answers to someone else, someone who knew about the vault first.
// Deduction: who was feeding Hale the plan? The answer is DEX.

const CHASE_CITY = {
  seed: 2025, blocks: 8,
  forceKinds: { '1,1': 'anchor', '7,6': 'terminal', '4,4': 'park', '1,2': 'buildings' },
};

export const CHAPTER2 = {
  id: 'chapter2',
  number: 2,
  title: 'Chapter 2: The Ferry',
  short: 'The Ferry',
  traitor: 'dex',
  nextChapter: 'chapter3',
  rating: { gold: 330, silver: 540 },
  deduction: { question: 'Who was feeding Det. Hale the plan?' },

  parts: [
    {
      id: 'chase', kind: 'drive', title: 'The chase',
      time: 'afternoon',
      intro: [
        { kicker: 'The next afternoon, 4:32 p.m.', who: 'marla',
          lines: ['"Vince has been hiding in The Anchor all day. That\'s his car outside, and he has a bag of cash and a ticket for the 5 pm ferry."'] },
        { kicker: 'How to play', title: 'Catch Vince',
          lines: [
            'Stay close to Vince\'s brown sedan (the spinning amber arrow) to fill the meter, or ram him. Don\'t let him reach the ferry terminal.',
            'The police are out in force today (in broad daylight, they can see you from further away): expect roadblocks and spike strips. Parking garages (blue P on the minimap) are good places to hide.',
          ] },
      ],
      startLabel: 'Go after him',
      objective: 'Catch Vince before he reaches the ferry',
      city: CHASE_CITY,
      start: { node: [1, 1], offset: [2.3, 30], heading: 0 },
      goal: { type: 'chase', block: '7,6', label: 'Ferry terminal', color: 0x39e6ff },
      fugitive: { startNode: [1, 2], heading: 0, name: 'Vince', who: 'vince',
        escapeTitle: 'Vince made the ferry', escapeText: 'He drove straight onto the boat. Stay on his bumper and ram him off the road.' },
      heat: { start: 3, max: 4, riseEvery: 45 },
      roadblocks: { fromHeat: 4, every: 28, spikes: true },
      doneTitle: 'Vince bails out',
      doneText: 'His car spins into a fence at the container terminal. He grabs the bag and runs for the pier.',
    },
    {
      id: 'docks', kind: 'onFoot', title: 'The docks',
      level: 'ch2Docks',
      time: 'afternoon',
      intro: [
        { kicker: 'Pier 9, 4:41 p.m.', title: 'After him',
          lines: [
            'Vince scrambles up onto the warehouse roofs, the cash bag bouncing on his back. The quay below is crawling with police: stay up high.',
            'New moves: sprint and press C to SLIDE under low ducts. Jump alongside a tall wall to WALL-RUN across gaps, and jump into a cable to ride a ZIP LINE.',
          ] },
      ],
      startLabel: 'Chase him',
      objective: 'Catch Vince',
      fugitive: { name: 'Vince', who: 'vince', speed: 8.6 },
      goal: { type: 'catch', label: 'End of the pier' },
      doneTitle: 'Got him',
      doneText: 'Vince is cornered at the end of the pier, the ferry horn sounding behind him. He drops the bag.',
    },
  ],

  outro: [
    { kicker: 'The end of the pier', who: 'vince',
      lines: ['"Alright! Alright, you got me. Just put the gun down... oh, it\'s a phone. Right."'] },
    { kicker: 'The end of the pier', who: 'vince',
      lines: ['"Hale had me. Gambling debts, fake books at The Anchor. It was you lot or me in a cell."'] },
    { kicker: 'The end of the pier', who: 'vince',
      lines: ['"But selling you out wasn\'t my idea. Hale works for someone. Someone who knew about that vault before I did."'] },
    { kicker: 'On the radio', who: 'marla',
      lines: ['"Hold on. Dex\'s phone just switched back on. It\'s pinging from inside police headquarters."'] },
  ],

  clues: {
    // Three clues: the badge (on the route) and the photo (off to the side)
    // point at the traitor; the IOU is a red herring.
    vinceIOU: {
      name: 'Vince\'s IOU',
      text: 'Dropped by Vince as he ran: an IOU for $80,000, owed to a card game run out of the police social club. Stamped PAID last night.',
      pointsTo: 'vince',
      redHerring: true,
      explain: 'This is how Hale got his hooks into Vince. It explains Vince, but not who handed Hale the plan.',
    },
    dexPhoto: {
      name: 'Photo of Dex',
      text: 'A long-lens photo of Dex shaking hands with Det. Hale outside police HQ, dated last week. On the back, in Hale\'s writing: "D. has the full plan. Vault timing to follow."',
      pointsTo: 'dex',
      explain: 'Dex and Hale were meeting a week before the job, and Hale\'s own note says Dex gave him the plan.',
    },
    hqBadge: {
      name: 'Visitor badge',
      text: 'A police HQ visitor badge in Dex\'s name, last scanned in at 11:50 last night, eight minutes before he went off the radio. Folded behind it: a bank slip showing $50,000 paid to Dex yesterday by "HT Holdings", the company that owns Det. Hale\'s boat.',
      pointsTo: 'dex',
      explain: 'Dex walked into police HQ just before he went silent, and Hale\'s company paid him fifty grand the day before. He wasn\'t missing: he was reporting in.',
    },
  },

  verdicts: {
    dex: {
      correct: true,
      title: 'It was Dex',
      text: 'Dex was Hale\'s man inside the crew: paid, photographed with him, and signed in at police HQ minutes before the job went wrong. He gave Hale the plan; Hale used Vince to open the door.',
    },
    vince: {
      correct: false,
      title: 'Not Vince, not this time',
      text: 'Vince opened the back door, but only because Hale owned his debts. The question is who gave Hale the plan in the first place.',
    },
    marla: {
      correct: false,
      title: 'Not Marla',
      text: 'Nothing ties Marla to Hale. She switched the cameras off at 12:05, exactly as planned, and stayed on the radio with you.',
    },
    hale: {
      correct: false,
      title: 'Hale is the one being fed',
      text: 'Hale is the one receiving the plan. Someone on your crew was feeding him.',
    },
  },

  resultOutro: 'Dex\'s phone is still pinging from inside police headquarters. If you want answers, you\'re going to have to go in and get them.',
};

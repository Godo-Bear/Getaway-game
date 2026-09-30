// Chapter 3: "Headquarters"
//
// Dex's phone is pinging from inside police HQ. Part 1: get onto the HQ
// roof, find Det. Hale's ledger and get out while officers chase you across
// the roof (and the helicopter joins in). Part 2: race to the ferry terminal
// before the last boat leaves, through heat-5 roadblocks and spike strips.
//
// The final twist: the mastermind is MARLA. She found box 42 in the bank's
// records (an internal-affairs file that let her control Hale), had Hale
// squeeze Vince and Dex, and planted her own "obvious" green-ink frame back
// in Chapter 1 so you'd clear her.

const FERRY_CITY = {
  seed: 3031, blocks: 8,
  forceKinds: { '1,6': 'hq', '7,1': 'terminal', '3,3': 'park' },
};

export const CHAPTER3 = {
  id: 'chapter3',
  number: 3,
  title: 'Chapter 3: Headquarters',
  short: 'Headquarters',
  traitor: 'marla',
  nextChapter: 'chapter4',
  rating: { gold: 300, silver: 500 },
  deduction: { question: 'Who planned the whole thing?' },

  parts: [
    {
      id: 'hq', kind: 'onFoot', title: 'Police HQ',
      level: 'ch3Headquarters',
      intro: [
        { kicker: 'Across from police HQ, that night, 2:10 a.m.', title: 'Into the lion\'s den',
          lines: [
            'Dex\'s phone is somewhere inside. So is Det. Hale\'s office, and whatever Hale keeps in it.',
            'Zip across to the HQ roof, find Hale\'s ledger by the skylight over his office (east side), then zip down to the car on the garage behind.',
          ] },
        { kicker: 'How to play', title: 'Officers on the roof',
          lines: [
            'Officers will come out of the stairwell huts and chase you on foot. They\'re slower than your sprint and they can\'t wall-run or ride zip lines. If one tackles you, it\'s back to the checkpoint.',
          ] },
      ],
      startLabel: 'Go in',
      objective: 'Find Hale\'s ledger, then get to the car',
      officers: { count: 3, speed: 0.84, delay: 8 },
      heli: { delay: 45, spotSpeed: 6.2, fill: 0.65, lead: 0.3,
        callout: { who: 'hale', line: 'This is Detective Hale. The building is surrounded. There is nowhere left to run.' } },
      requiredClue: 'ledger',
      requiredLabel: 'Hale\'s ledger',
      requiredText: 'Find Hale\'s ledger first: it\'s by the skylight over his office, on the east side of the HQ roof.',
      requiredAfterCheckpoint: 1,
      goal: { type: 'reach', label: 'Getaway car' },
      doneTitle: 'Out with the ledger',
      doneText: 'You drop into the car with Hale\'s ledger under your jacket. Sirens everywhere. The last ferry leaves in minutes.',
    },
    {
      id: 'ferry', kind: 'drive', title: 'The last ferry',
      intro: [
        { kicker: 'Leaving HQ, 2:24 a.m.', title: 'The last ferry',
          lines: [
            'Every cop in the city is looking for you now. The last ferry out leaves the terminal on the east side in a couple of minutes.',
            'Heat 4 and rising: roadblocks and spike strips everywhere. Don\'t stop, don\'t get boxed in. Take the fastest route and use nitro on the long straights.',
          ] },
      ],
      startLabel: 'Floor it',
      objective: 'Reach the ferry terminal before the last boat leaves',
      city: FERRY_CITY,
      start: { node: [1, 6], offset: [2.3, 30], heading: Math.PI },
      goal: { type: 'reach', block: '7,1', label: 'Ferry terminal', color: 0x39e6ff, timer: 160, timerLabel: 'Ferry leaves in',
        timeoutTitle: 'You missed the ferry', timeoutText: 'The ferry pulls away without you. Take the fastest route and use nitro on the long straights.' },
      heat: { start: 4, max: 5, riseEvery: 40 },
      roadblocks: { fromHeat: 4, every: 24, spikes: true },
      doneTitle: 'Made the ferry',
      doneText: 'You drive up the ramp as the gate closes behind you. The city shrinks in the mirror.',
    },
  ],

  outro: [
    { kicker: 'On the ferry, 2:31 a.m.', title: 'Box 42',
      lines: ['You spread everything out on the car bonnet: Hale\'s ledger, the page from box 42, the printed emails. The names repeat. One of them shouldn\'t be there at all.'] },
    { kicker: 'On the ferry', title: 'Who planned it?',
      lines: ['Vince was squeezed. Dex was paid. Hale was owned. Somebody held all three strings, and knew about box 42 before anyone else.'] },
  ],

  clues: {
    // Three clues, all on the route: the email and the ledger point at the
    // traitor; the ferry ticket is a red herring.
    marlaEmail: {
      name: 'Printed emails',
      text: 'Left on the hotel roof, where Marla set up her antenna on job night. Two emails from her laptop. 11:57, to Dex: "Go dark at 11:58 or Hale opens your file." 12:04, to Hale: "It\'s done. They\'ll never see it coming."',
      pointsTo: 'marla',
      explain: 'Marla threatened Dex into going silent, then told Hale it was done, one minute before the police came in the back. It wasn\'t about the cameras.',
    },
    ledger: {
      name: 'Hale\'s ledger',
      text: 'Det. Hale\'s private ledger. Monthly payments to "D.". Taped inside the cover: a page from safe-deposit box 42, twenty years of evidence against Hale. On the last page, in green ink: "Box 42 stays with me. Do as you\'re told. - M".',
      pointsTo: 'marla',
      explain: 'Whoever held box 42 owned Hale, and the orders in his ledger are in green ink, signed "M". Marla was giving Hale his orders.',
    },
    vinceTicket: {
      name: 'Ferry ticket',
      text: 'A ferry ticket in Vince\'s name, bought a week before the job. Was he planning to run all along?',
      pointsTo: 'vince',
      redHerring: true,
      explain: 'Bought on Hale\'s card to make Vince look like he\'d planned to run. Vince was set up to take the fall.',
    },
  },

  verdicts: {
    marla: {
      correct: true,
      title: 'It was Marla',
      text: 'Marla found box 42 in the bank\'s records months ago. She used Hale\'s file to own him, had him squeeze Vince and pay off Dex, and planned for the crew to take the fall while she walked off with the box. Even the "planted" green ink in Chapter 1 was hers: a frame so obvious you\'d clear her.',
    },
    hale: {
      correct: false,
      title: 'Hale was a puppet',
      text: 'Hale took the orders, but look who signed them: green ink, "M". Whoever held box 42 held Hale.',
    },
    dex: {
      correct: false,
      title: 'Dex was a pawn',
      text: 'Dex took Hale\'s money and went dark when he was threatened. The threat came from someone else\'s burner.',
    },
    vince: {
      correct: false,
      title: 'Vince was the fall guy',
      text: 'The ferry ticket was bought on Hale\'s card to make Vince look guilty. He was squeezed, not in charge.',
    },
  },

  resultOutro: 'You send Hale\'s ledger and Marla\'s emails to every newsroom in the city. By morning, Hale is in handcuffs. But when the police reach Marla\'s apartment it\'s empty, one green pen left on the table. So is the rest of box 42: twenty million in bearer bonds. The ferry horn sounds. It isn\'t over yet.',
};

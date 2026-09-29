// Chapter 4: "Last Flight"
//
// Marla has run with the bonds from box 42. A storm has rolled in over the city. Part 1:
// chase her car through the flooded streets to the rail yard by the private
// airfield. Part 2: she's out on foot, running across the parked freight
// trains toward the hangars where her plane is waiting. Catch her.
//
// On the hangar roof Marla laughs: someone warned her you were coming, and
// told her which gate to use. Deduction: who tipped Marla off? The answer
// is DET. HALE: from his holding cell, through his lawyer's phone. With
// Marla gone, nobody could testify that Hale took orders from her.

const AIRFIELD_CITY = {
  seed: 4047, blocks: 8,
  forceKinds: { '1,6': 'terminal', '6,0': 'airfield', '4,3': 'park', '1,5': 'buildings' },
};

export const CHAPTER4 = {
  id: 'chapter4',
  number: 4,
  title: 'Chapter 4: Last Flight',
  short: 'Last Flight',
  traitor: 'hale',
  nextChapter: null,
  finale: true,
  rating: { gold: 330, silver: 560 },
  deduction: { question: 'Who warned Marla you were coming?' },

  parts: [
    {
      id: 'storm', kind: 'drive', title: 'The storm',
      weather: 'storm',
      intro: [
        { kicker: 'Off the ferry, 3:05 a.m.', title: 'Last flight',
          lines: [
            'The storm hits as you roll off the ferry. Your phone buzzes: a number you know.',
          ] },
        { kicker: 'On the phone', who: 'dex',
          lines: ['"It\'s Dex. I\'m talking to the prosecutors now, all of it. But listen: Marla filed a flight plan an hour ago. North airfield. She\'s taking the bonds from box 42 with her."'] },
        { kicker: 'How to play', title: 'Catch Marla',
          lines: [
            'Stay close to Marla\'s green car (the spinning amber arrow) or ram it to fill the meter. Don\'t let her reach the airfield.',
            'The roads are wet and the police are everywhere: roadblocks and spike strips from heat 4. Lose them in a parking garage (blue P on the minimap) if you need to. A clue waits in the park in the middle of town.',
          ] },
      ],
      startLabel: 'After her',
      objective: 'Catch Marla before she reaches the airfield',
      city: AIRFIELD_CITY,
      start: { node: [1, 6], offset: [2.3, -30], heading: Math.PI },
      goal: { type: 'chase', block: '6,0', label: 'Airfield', color: 0x39e6ff },
      fugitive: { startNode: [2, 5], heading: Math.PI, name: 'Marla', who: 'marla', color: 0x1f6a4a,
        escapeTitle: 'Marla reached the airfield', escapeText: 'Her car disappears through the airfield gate. Stay on her bumper and ram her before she gets there.' },
      clue: { id: 'flightPlan', park: '4,3', offset: [12, 0] },
      heat: { start: 3, max: 5, riseEvery: 40 },
      roadblocks: { fromHeat: 4, every: 16, spikes: true },
      doneTitle: 'Marla bails out',
      doneText: 'Her car slides through the rail yard gate and into a fence. She\'s out and running across the freight trains toward the hangars with a bag of bonds from box 42.',
    },
    {
      id: 'railyard', kind: 'onFoot', title: 'The rail yard',
      level: 'ch4Railyard',
      weather: 'storm',
      intro: [
        { kicker: 'North rail yard, 3:18 a.m.', title: 'End of the line',
          lines: [
            'Rain hammers the boxcars. Marla is already up on the trains, running for the hangars. Past them, a private jet is warming its engines on the apron.',
            'Follow her across the train roofs, up and over the signal gantry, and onto the hangars. Fall to the ground and you can climb back up any ladder.',
          ] },
      ],
      startLabel: 'Run',
      objective: 'Catch Marla before she reaches the plane',
      fugitive: { name: 'Marla', who: 'marla', speed: 8.7, colors: 'marla' },
      heli: { delay: 32, spotSpeed: 6.0, fill: 0.6, lead: 0.3, callout: null },
      goal: { type: 'catch', label: 'Hangar 2' },
      doneTitle: 'Got her',
      doneText: 'You catch Marla at the edge of the hangar roof, the jet screaming on the apron below. She drops the bag of bonds.',
    },
  ],

  outro: [
    { kicker: 'Hangar 2 roof, 3:26 a.m.', who: 'marla',
      lines: ['"You think you beat me? I was ten minutes from gone. Ten minutes."'] },
    { kicker: 'Hangar 2 roof', who: 'marla',
      lines: ['"Somebody called me an hour ago. Told me you were coming. Told me which gate to use. I thought they were helping me."'] },
    { kicker: 'Hangar 2 roof', title: 'Who made that call?',
      lines: ['Whoever called her didn\'t want her caught, and didn\'t want her talking either. With Marla on a plane, nobody could ever say who was really giving the orders.'] },
  ],

  clues: {
    flightPlan: {
      name: 'Flight plan',
      text: 'Found in the park: a copy of Marla\'s flight plan, filed at 2:35 a.m. The jet was paid for by "HT Holdings", the same company that paid Dex.',
      pointsTo: 'hale',
      explain: 'HT Holdings is Hale\'s company. Somebody close to Hale paid for Marla\'s escape.',
    },
    lawyerCard: {
      name: 'Lawyer\'s card',
      text: 'A business card: "R. Castellano, counsel to Det. R. Hale". On the back, in pencil: "North gate. 3:15."',
      pointsTo: 'hale',
      explain: 'Hale\'s lawyer knew the gate and the time before you did. The message came through him.',
    },
    cellCall: {
      name: 'Phone log',
      text: 'A printout from Marla\'s burner phone: one incoming call at 2:52 a.m., from a phone registered to Hale\'s lawyer, made inside the police HQ holding cells.',
      pointsTo: 'hale',
      explain: 'The call came from the holding cells, on Hale\'s lawyer\'s phone, during his visit.',
    },
    dexKeys: {
      name: 'Dex\'s car keys',
      text: 'Dex\'s car keys, hanging on a hook on the hangar roof. Did Dex drive Marla here?',
      pointsTo: 'dex',
      redHerring: true,
      explain: 'Dex\'s car was impounded as evidence tonight. Its keys came out of the evidence room, where only a detective could get them.',
    },
    vinceMap: {
      name: 'Hand-drawn map',
      text: 'A map of the rail yard with the escape route marked, in Vince\'s handwriting.',
      pointsTo: 'vince',
      redHerring: true,
      explain: 'Vince drew this map years ago for another job. It was in the police file on him, and Hale kept that file.',
    },
  },

  verdicts: {
    hale: {
      correct: true,
      title: 'It was Hale',
      text: 'From a holding cell, Hale used his lawyer\'s phone to warn Marla and paid for her jet through HT Holdings. With Marla gone, nobody could prove he\'d been taking her orders, and he could blame the whole thing on her. The planted keys and the old map were meant to point you at Dex and Vince.',
    },
    marla: {
      correct: false,
      title: 'Marla didn\'t warn herself',
      text: 'Marla got the call; she didn\'t make it. Look at where the call came from, and who paid for the jet.',
    },
    dex: {
      correct: false,
      title: 'Not Dex',
      text: 'Dex is the one who told you about the flight plan. His keys came out of the police evidence room.',
    },
    vince: {
      correct: false,
      title: 'Not Vince',
      text: 'Vince is in a cell with no phone. The map is old; it came out of a police file.',
    },
  },

  resultOutro: 'The jet taxis away empty. The bonds go back to the Harbor Trust, and the phone log goes to the prosecutors. By sunrise, Hale\'s lawyer is talking, and Hale\'s cell just got a lot smaller.',
};

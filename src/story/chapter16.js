// Chapter 16: "The Silver Arrow"
//
// Neon Kōji, a huge city on the other side of the world (the crew's home for
// Chapters 16-18): dark towers covered in neon, giant billboards, cherry
// trees, rain. Kitsu, the hacker who signs with a neon fox, joins the crew.
// The job: a courier carries a silver case of bearer bonds on the Silver
// Arrow, the bullet train to the coast. Part 1: race across the city in
// the rain to make the train (Kitsu turns the lights green ahead of you).
// Part 2: aboard at 300 km/h. Sit down to hide among the passengers, swap the
// case in the dark of a tunnel, then get back to the luggage car before the
// courier opens it: Kitsu uncouples your carriage and the train rushes on.
// No mole, no detective work (see CLAUDE.md): the crew is loyal (Kitsu joins
// it and stays loyal); the trouble is the courier's bodyguards and the
// railway police.

const STATION_CITY = {
  neon: true,
  forceKinds: { '7,1': 'station', '2,5': 'park', '5,3': 'park' },
};

export const CHAPTER16 = {
  id: 'chapter16',
  number: 16,
  title: 'Chapter 16: The Silver Arrow',
  short: 'The Silver Arrow',
  noDeduction: true,
  suspects: [],
  crew: ['mags', 'theo', 'ricky', 'juno', 'paz', 'kitsu'],
  clues: {},
  verdicts: {},
  nextChapter: 'chapter17',
  rating: { gold: 420, silver: 700 },

  parts: [
    {
      id: 'station', kind: 'drive', title: 'Last train',
      time: 'night', weather: 'rain',
      intro: [
        { kicker: 'Neon Kōji, 11:40 p.m.', who: 'kitsu',
          lines: ['The rain makes the whole city glow. A girl in an orange tracksuit and big headphones leans on the car, grinning. "I\'m Kitsu. The fox. Nice to meet you in real life."',
            '"The courier boards the Silver Arrow at Kōji Central at midnight. In his case: forty million in bearer bonds. We have to be on that train."'] },
        { kicker: 'In the car', who: 'mags',
          lines: ['"That\'s the other side of the city." Kitsu taps her laptop. "I\'m in the traffic system. I\'ll turn the lights green ahead of you. Just drive."'] },
        { kicker: 'How to play', title: 'Neon Kōji',
          lines: ['Get to KŌJI CENTRAL station (the blue light) before the train leaves. The roads are wet: brake early. Hack junctions (E) to turn the lights, use the nitro on the straights, and cut through the parks.'] },
      ],
      startLabel: 'Drive',
      objective: 'Get to Kōji Central before the Silver Arrow leaves',
      city: STATION_CITY,
      start: { node: [1, 7], offset: [2.3, -20], heading: Math.PI },
      goal: { type: 'reach', block: '7,1', label: 'Kōji Central', color: 0x39e6ff, timer: 160, timerLabel: 'Train leaves in', timeoutTitle: 'It left without you', timeoutText: 'The Silver Arrow pulled out on time, as always. Try again: hack the junctions (E), keep the nitro for the long straights.' },
      heat: { start: 1, max: 2, riseEvery: 70 },
      doneTitle: 'All aboard',
      doneText: 'You sprint down the platform as the doors hiss. Kitsu yanks you into the last carriage, the luggage car, a second before they close.',
    },
    {
      id: 'arrow', kind: 'onFoot', mode: 'bullet', title: 'The Silver Arrow',
      time: 'night', weather: 'clear',
      intro: [
        { kicker: 'The luggage car, 300 km/h', who: 'kitsu',
          lines: ['The city lights stream past the windows. Kitsu hands you a silver case: exactly the same as the courier\'s, full of comics. "He\'s in first class, right at the front. His case is on the rack above his seat."',
            '"The train goes through tunnels. In a tunnel the lights go down for a few seconds. That\'s when you swap them."'] },
        { kicker: 'On the radio', who: 'kitsu',
          lines: ['"Railway police walk the aisles, and he has two bodyguards. If someone walks your way, just sit down: one more sleepy passenger. When you\'ve swapped, come back here. He\'ll open it in a minute, and then I uncouple this carriage."'] },
        { kicker: 'How to play', title: 'Hide in plain sight',
          lines: ['Walk forward through the carriages to first class. Press E by an empty aisle seat to sit down: while you sit, nobody looks twice (E again, or move, to stand up). At the courier\'s seat, swap the case (E) only while the carriage is dark in a tunnel: with the lights on, he\'ll notice you. Then get back to the luggage car and hold E at the red coupling release.'] },
      ],
      startLabel: 'Go',
      objective: 'Walk forward to first class and swap the silver case',
      doneTitle: 'Uncoupled',
      doneText: 'Your carriage rolls to a stop in the dark fields, all alone. Far ahead, the Silver Arrow\'s lights disappear into the mountains with a courier screaming at a case of comics.',
    },
  ],

  outro: [
    { kicker: 'A field, 1 a.m.', who: 'kitsu',
      lines: ['Headlights bounce across the field: Juno in a borrowed van. Kitsu clicks the silver case open. Forty million in bearer bonds, fanned out like a deck of cards.',
        '"Welcome to Neon Kōji," she grins. "You\'re going to love it here."'] },
    { kicker: 'The van', who: 'mags',
      lines: ['Mags counts the crew in the back of the van: Theo, Ricky, Juno, Paz, and now Kitsu. "Six of us." Kitsu shrugs: "Seven, if you count my laptop."',
        'Then a message lights up her screen. The courier\'s bosses own the tallest tower in the city. And they want their bonds back.'] },
  ],

  jobDone: {
    title: 'The Silver Arrow',
    text: 'Forty million in bearer bonds, lifted from a bullet train at 300 km/h. And Kitsu is crew now.',
  },

  finale: {
    title: 'To be continued',
    text: 'The courier worked for the people who own Neon Kōji\'s tallest tower. The crew is going to pay them a visit, from the top.',
  },
};

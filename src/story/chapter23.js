// Chapter 23: "The Silver Mine"
//
// Lorenzo Gold will buy the Star if the crew robs Sable's silver mine: the
// Silver Crown, up in the Coyote Mountains, where the Jackals keep twenty
// years of loot on level 9, the bottom. The only road up is full of Jackals.
// Part 1: a night drive across Mirage Springs for the climbing gear, out to
// the Balloon Fiesta field.
// Part 2: fly a hot-air balloon to the top of the mountain: you can only go
// up or down, and the wind blows a different way at every height. Keep out
// of the lookouts' searchlights and land by the old ventilation shaft.
// Part 3: abseil 160 metres down the shaft, past broken beams, a turning
// fan, live cables, falling rocks and the Jackals on the lower levels.
// Part 4: level 9 by lantern light: blow the lanterns out, keep to the dark,
// and carry Sable's loot to an ore cart.
// Part 5: Sable comes down in the lift: away in the ore cart down the old
// line through the mountain (pick the right tunnel at every fork, lean on
// the bends), with the Jackals' cart behind you.
// Part 6: race the sheriff to the Golden Mirage before sunrise.
// Then Sable takes Ricky (Chapter 24: the Coyote Dam).
// No mole, no detective work (see CLAUDE.md): the crew is loyal; the trouble
// is a rival crew, a bent sheriff, and a buyer who keeps the Star.

const MINE_CITY = {
  desert: true,
  forceKinds: { '6,1': 'outfitter', '1,6': 'fiesta', '4,4': 'golden', '1,1': 'oasis', '6,6': 'sableauto' },
};

export const CHAPTER23 = {
  id: 'chapter23',
  number: 23,
  title: 'Chapter 23: The Silver Mine',
  short: 'The Silver Mine',
  noDeduction: true,
  suspects: [],
  crew: ['mags', 'theo', 'ricky', 'juno', 'paz', 'kitsu'],
  clues: {},
  verdicts: {},
  nextChapter: 'chapter24',
  rating: { gold: 1250, silver: 1850 },

  parts: [
    {
      id: 'gear', kind: 'drive', title: 'Shopping',
      time: 'dusk', weather: 'clear',
      intro: [
        { kicker: 'The Oasis Motel, the next afternoon', who: 'mags',
          lines: ['Mags spreads an old map across the bed: the Coyote Mountains, north of town, and the Silver Crown mine. "Sable keeps everything on level 9. The bottom. The only road up is crawling with Jackals, and the sheriff sits at the end of it."',
            '"So we don\'t take the road. We fly over it, and we go in through the top."'] },
        { kicker: 'The plan', who: 'juno',
          lines: ['"It\'s the Balloon Fiesta tonight: fifty hot-air balloons going up at sunset from the field outside town. Nobody will notice one more. I fly us to the top of the mountain. After that, it\'s all rope."',
            'Kitsu: "Canyon Outfitters have left two hundred metres of rope round the back for us. Don\'t ask how."'] },
        { kicker: 'How to play', title: 'Supplies',
          lines: ['Drive to CANYON OUTFITTERS to pick up the climbing gear (the amber light), then out to the BALLOON FIESTA field (the green light). The sheriff\'s deputies are out looking for your van: keep out of their way.'] },
      ],
      startLabel: 'Drive',
      objective: 'Pick up the climbing gear, then get to the Balloon Fiesta',
      car: { kind: 'van', color: 0x2a3a5a },
      city: MINE_CITY,
      start: { node: [2, 2], offset: [2.3, 18], heading: 0 },
      goal: {
        type: 'stops', block: '1,6', label: 'Balloon Fiesta', color: 0xff7ac8,
        finalObjective: 'Get to the Balloon Fiesta field',
        stops: [
          { block: '6,1', label: 'Canyon Outfitters', objective: 'Pick up the climbing gear',
            title: 'Two hundred metres of rope', text: 'Round the back, behind the bins: four coils of rope, harnesses, head torches and a box of glow sticks. Theo picks up a harness and looks at it for a long time. "This goes on WHERE?"' },
        ],
      },
      heat: { start: 1, max: 2, riseEvery: 70 },
      doneTitle: 'Up, up and away',
      doneText: 'Juno has a balloon ready at the far end of the fiesta field: purple and gold, with a basket just big enough for two and a lot of rope. All round you, fifty balloons are lifting into the sunset. The burner roars, the basket creaks, and Mirage Springs falls away below you.',
    },
    {
      id: 'balloon', kind: 'onFoot', mode: 'balloon', title: 'The balloon',
      time: 'dusk', weather: 'clear',
      intro: [
        { kicker: 'Over the desert, sunset', who: 'juno',
          lines: ['"Here\'s the thing about balloons: you can\'t steer them. You go where the wind goes. But the wind blows a different way at every height. So we go up, or down, and find the wind that takes us where we want to go."',
            '"You fly. I\'ll keep an eye out."'] },
        { kicker: 'On the radio', who: 'kitsu',
          lines: ['"The Jackals have lookouts on the mountain, with searchlights. Keep out of the beams. The top of the mountain is flat: land right by the old ventilation shaft."'] },
        { kicker: 'How to play', title: 'Burner and vent',
          lines: ['Hold W (or Jump) to fire the burner and climb; hold S (or C) to open the vent and sink. Let go and the balloon floats level. The wind blows a different way at each height: the panel shows which way every layer is going (green = towards the mountain). A and D work Juno\'s little fan to nudge you sideways, and near the top the mountain breeze carries you in. Keep out of the searchlights, and come down on the summit by the shaft (the big green ring).'] },
      ],
      startLabel: 'Fly',
      objective: 'Fly the balloon to the top of the mountain',
      doneTitle: 'The summit',
      doneText: 'The basket bumps down onto the flat top of the mountain as the last of the light goes, ten steps from an old iron headframe over a black hole in the rock: the ventilation shaft. Juno ties the balloon down. "I\'ll wait here. Don\'t be long. Balloons don\'t like Jackals."',
    },
    {
      id: 'shaft', kind: 'onFoot', mode: 'shaft', title: 'The shaft',
      time: 'night', weather: 'clear',
      intro: [
        { kicker: 'The top of the shaft', who: 'theo',
          lines: ['Theo drops a glow stick down the shaft. It falls, and falls, and turns into a tiny green dot, and is gone. "Nine levels," he says. "After you."'] },
        { kicker: 'On the radio', who: 'kitsu',
          lines: ['"The old fan is still turning, halfway down. Some of the cables are live. And there are Jackals on the lower levels: they look into the shaft now and then. Go slowly where you have to, quickly where you can."'] },
        { kicker: 'How to play', title: 'Down the rope',
          lines: ['You slide down the rope by yourself: hold Jump to go faster, hold C (or Slide) to stop. Move round the shaft (WASD, or the stick) to get past the broken beams and planks, through the gaps in the turning fan, and away from sparking cables and falling rocks. Don\'t slide past an opening while a Jackal is looking in (the light shows you). Slow down before the bottom!'] },
      ],
      startLabel: 'Go down',
      objective: 'Abseil to the bottom of the shaft',
      doneTitle: 'Level 9',
      doneText: 'Your boots touch rock, a hundred and sixty metres under the mountain. A lantern flickers down a long timbered tunnel, and somewhere water drips. Theo lands beside you and unclips. "That," he whispers, "was horrible."',
    },
    {
      id: 'level9', kind: 'onFoot', mode: 'mine', title: 'Level 9',
      time: 'night', weather: 'clear',
      intro: [
        { kicker: 'Level 9', who: 'kitsu',
          lines: ['"Sable\'s vault is at the far end of the main tunnel. The ore cart line out of the mine starts at the loading bay. Put everything you can carry in the cart."'] },
        { kicker: 'The lanterns', who: 'mags',
          lines: ['Mags, on the radio: "There are Jackals down there, and lanterns everywhere. In the dark they won\'t see you until they walk into you. So make it dark."'] },
        { kicker: 'How to play', title: 'Lights out',
          lines: ['Get into Sable\'s vault and carry the three bags of loot to the ore cart at the loading bay, one at a time (they\'re heavy: you\'re slower). Keep out of the light: in the dark the Jackals only see you when they\'re close. Blow lanterns out (E) to make more dark, but a Jackal who walks past a dark lantern lights it again. Knock Jackals out from behind (E).'] },
      ],
      startLabel: 'Go',
      objective: 'Carry Sable\'s loot to the ore cart',
      doneTitle: 'Here she comes',
      doneText: 'The last bag thumps into the ore cart. Then the lift bell rings: the cage is coming down the main shaft, all lit up, and standing in it, with six Jackals behind her, is Sable. Theo is already in the cart. "Push! PUSH!"',
    },
    {
      id: 'cart', kind: 'onFoot', mode: 'cart', title: 'The ore cart',
      time: 'night', weather: 'clear',
      intro: [
        { kicker: 'The loading bay', who: 'theo',
          lines: ['The ore cart creaks, rolls, and tips over the lip of the loading bay onto the old line down through the mountain. Behind you, a second cart, full of Jackals.'] },
        { kicker: 'On the radio', who: 'kitsu',
          lines: ['"The old line goes all the way down to the mine\'s bottom entrance, on the side of the mountain. Ricky\'s waiting there. But half the tunnels have caved in: at every fork, follow the lanterns, not the boards."'] },
        { kicker: 'How to play', title: 'Down the line',
          lines: ['At each fork, pick a tunnel: press A or D before you get there (follow the lanterns and the EXIT arrows; tunnels boarded up with a red X have caved in). On the bends, lean into the corner (A or D) or the cart tips over. S brakes. Don\'t let the Jackals\' cart catch you.'] },
      ],
      startLabel: 'Hold on',
      objective: 'Ride the ore cart down to the bottom entrance',
      doneTitle: 'Out!',
      doneText: 'The cart bursts out of the mountain into the cold night air, hits the buffers at the end of the line and throws you both into a pile of sand. Ricky\'s van is waiting at the bottom of the spoil heap, lights off. "Taxi?"',
    },
    {
      id: 'dawn', kind: 'drive', title: 'Before sunrise',
      time: 'dawn', weather: 'clear',
      intro: [
        { kicker: 'Highway 9, 5 a.m.', who: 'ricky',
          lines: ['"Lorenzo said before sunrise, or there\'s no deal." Ricky looks in the mirror: blue lights. The sheriff, and he\'s brought friends.'] },
        { kicker: 'How to play', title: 'Before the sun comes up',
          lines: ['Drive the loot to the GOLDEN MIRAGE (the gold light) before the sun comes up. The sheriff\'s cars are after you, with roadblocks and spike strips when the heat is high. Hack junctions (E), and use the nitro.'] },
      ],
      startLabel: 'Drive',
      objective: 'Get the loot to the Golden Mirage before sunrise',
      car: { kind: 'van', color: 0x2a3a5a },
      city: MINE_CITY,
      start: { node: [2, 8], offset: [-2.3, -20], heading: Math.PI },
      goal: { type: 'reach', block: '4,4', label: 'The Golden Mirage', color: 0xffd040, timer: 170, timerLabel: 'Sunrise in',
        timeoutTitle: 'The sun came up', timeoutText: 'The sun came up over the desert, and Lorenzo\'s offer went with the dark. Try again: hack the junctions (E), cut through the parks, and keep the nitro for the straights.' },
      heat: { start: 2, max: 4, riseEvery: 45 },
      roadblocks: { fromHeat: 4, every: 30, spikes: true },
      doneTitle: 'Sunrise',
      doneText: 'You pull up at the Golden Mirage just as the sun comes up over the desert. Lorenzo\'s men in gold jackets carry the bags inside. Ricky stays in the van in the car park. "Somebody has to," he grins, and turns the radio up.',
    },
  ],

  outro: [
    { kicker: 'The penthouse, 6 a.m.', who: 'lorenzo',
      lines: ['Lorenzo opens the bags one by one: gold, silver, diamonds, twenty years of the Jackals\' stealing. "Wonderful. A deal is a deal." He slides a case of money across the desk, and the Star goes into his pocket. "A pleasure doing business."'] },
    { kicker: 'The car park', who: 'mags',
      lines: ['Downstairs, the van is still there. The doors are open and the radio is still playing. Ricky is gone. On the driver\'s seat: a jackal\'s head drawn in red, and a phone number.'] },
    { kicker: 'On the phone', who: 'sable',
      lines: ['"You took my silver. So I took your driver. The Coyote Dam, tomorrow, midnight. Bring back everything you stole from me. And the diamond. Or you never see him again."',
        'Mags looks at the others. "We get him back. Whatever it takes."'] },
  ],

  jobDone: {
    title: 'The Silver Mine',
    text: 'You flew a balloon past the Jackals\' lookouts, abseiled down a 160-metre shaft, emptied Sable\'s vault by lantern light and rode an ore cart out of the mountain.',
  },

  finale: {
    title: 'To be continued',
    text: 'Sable has Ricky. Next: the Coyote Dam, at midnight.',
  },
};

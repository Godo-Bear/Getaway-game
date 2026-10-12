// Chapter 24: "The Coyote Dam" (the last chapter)
//
// Sable has Ricky, and she wants her loot back AND the Star, which Lorenzo
// Gold has in his pocket. So:
// Part 1: chase Lorenzo's gold car across Mirage Springs before it reaches
// his private jet, and take the Star back.
// Part 2: midnight, out to the Coyote Dam road, with the sheriff after you.
// Part 3: Mags walks out onto the dam to stall Sable. You climb the dam's
// face in a storm, timing the spillways, to the inspection gallery door.
// Part 4: the power house inside the dam: fight the Jackals off in waves
// (lure them onto the steam vents) and break Ricky out of his cage.
// Part 5: THE FINAL BOSS: Sable herself, on top of the dam, in the rain.
// Part 6: the last getaway: every police car in the desert, and Inspector
// Delacroix, who has followed the Star all the way from Lumière, between
// you and the jetport.
// Then the ending.
// No mole, no detective work (see CLAUDE.md): the crew is loyal; the trouble
// is a rival crew, a bent sheriff, a buyer, and the law.

const DAM_CITY = {
  desert: true,
  forceKinds: { '7,0': 'jetport', '0,7': 'damroad', '4,4': 'golden', '1,1': 'oasis', '6,6': 'sableauto' },
};

export const CHAPTER24 = {
  id: 'chapter24',
  number: 24,
  title: 'Chapter 24: The Coyote Dam',
  short: 'The Coyote Dam',
  noDeduction: true,
  suspects: [],
  crew: ['mags', 'theo', 'ricky', 'juno', 'paz', 'kitsu'],
  clues: {},
  verdicts: {},
  nextChapter: null,
  rating: { gold: 1500, silver: 2200 },

  parts: [
    {
      id: 'limo', kind: 'drive', title: 'The Star',
      time: 'night', weather: 'clear',
      intro: [
        { kicker: 'The Oasis Motel, 9 p.m.', who: 'mags',
          lines: ['Nobody has slept. Ricky\'s jacket is still on the back of a chair. Mags puts the phone down on the table. "Sable wants everything back. The silver, the gold, and the Star. We\'ve got the silver. Lorenzo\'s got the Star."',
            'Kitsu looks up from her laptop. "Not for long. Lorenzo\'s flying out tonight. His gold car is leaving the Golden Mirage right now, for his private jet."'] },
        { kicker: 'The plan', who: 'theo',
          lines: ['"Then we take it back before he gets on the plane." Theo throws you the keys. "Ricky would want you to drive."'] },
        { kicker: 'How to play', title: 'Catch Lorenzo',
          lines: ['Catch Lorenzo\'s gold car before it gets to the PRIVATE JETS terminal (the gold light). Stay right on its bumper, or ram it, to fill the meter. The sheriff\'s deputies are out too.'] },
      ],
      startLabel: 'Drive',
      objective: 'Catch Lorenzo\'s car before it reaches his jet',
      city: DAM_CITY,
      start: { node: [2, 8], offset: [-2.3, -20], heading: Math.PI },
      fugitive: { startNode: [2, 7], heading: Math.PI, name: 'Lorenzo', who: 'lorenzo', kind: 'civilian', color: 0xd8b040, speed: 0.88,
        escapeTitle: 'Wheels up', escapeText: 'Lorenzo\'s car rolled straight onto the runway, and his jet was in the air before you got to the fence. Stay on his bumper and ram him before he gets there.' },
      goal: { type: 'chase', block: '7,0', label: 'Private Jets', color: 0xffd040 },
      heat: { start: 1, max: 3, riseEvery: 55 },
      doneTitle: 'A deal is a deal',
      doneText: 'The gold car spins into a row of palm trees. Lorenzo climbs out, straightens his white jacket, and holds out a velvet box before anybody asks. "Take it. I know when I\'ve lost." The Star of Lumière, blue fire in the street lights. "Give my regards to Sable," he says. "And then please, never come back to my casino."',
    },
    {
      id: 'midnight', kind: 'drive', title: 'Midnight',
      time: 'night', weather: 'storm',
      intro: [
        { kicker: 'On the phone', who: 'sable',
          lines: ['"Midnight. On top of the dam. Bring the silver, bring the diamond, and come alone." The line goes dead. Outside, thunder rolls in off the desert.'] },
        { kicker: 'The plan', who: 'kitsu',
          lines: ['"I\'ve got the dam\'s plans. Ricky won\'t be on top with Sable: there\'s a power house inside the dam, and the Jackals have been taking food in there all day. Mags walks out on top with the bags and keeps Sable talking. You go up the outside of the dam and in through the inspection gallery."',
            'Mags: "And if the sheriff stops us on the way, none of it matters. Drive."'] },
        { kicker: 'How to play', title: 'Before midnight',
          lines: ['Drive to the COYOTE DAM ROAD (the blue light) before midnight. The sheriff is waiting: lose his cars or outrun them. Hack junctions (E), and use the nitro.'] },
      ],
      startLabel: 'Drive',
      objective: 'Get to the Coyote Dam road before midnight',
      car: { kind: 'van', color: 0x2a3a5a },
      city: DAM_CITY,
      start: { node: [2, 2], offset: [2.3, 18], heading: 0 },
      goal: { type: 'reach', block: '0,7', label: 'Coyote Dam Road', color: 0x2fe0ff, timer: 170, timerLabel: 'Midnight in',
        timeoutTitle: 'Midnight', timeoutText: 'The clock struck twelve and you were still in town. Sable doesn\'t wait. Try again: hack the junctions (E) and keep the nitro for the straights.' },
      heat: { start: 2, max: 4, riseEvery: 45 },
      roadblocks: { fromHeat: 4, every: 32, spikes: true },
      doneTitle: 'The Coyote Dam',
      doneText: 'The road ends at the bottom of the canyon, under the dam: a wall of concrete sixty metres high, all lit up in the rain, the river roaring out of it. Up on top, tiny in the floodlights, a row of Jackal trucks. Mags takes the bags and the velvet box and drives up the long road to the top. You walk to the bottom of the dam, and look up.',
    },
    {
      id: 'spillway', kind: 'onFoot', mode: 'spillway', title: 'The spillway',
      time: 'night', weather: 'storm',
      intro: [
        { kicker: 'The foot of the dam, 11:50 p.m.', who: 'kitsu',
          lines: ['"There are maintenance walkways all the way up the face, and a ladder up every step. The gallery door is on the top walkway, right in the middle."',
            '"One problem. It\'s raining so hard they\'re letting water out of the lake. The spillways open and close on their own. Get caught in one and it\'ll wash you right off the dam."'] },
        { kicker: 'On the radio', who: 'mags',
          lines: ['"I\'m on top. Sable\'s here. She wants to see the diamond first, so I\'m being very slow about the box. Hurry."'] },
        { kicker: 'How to play', title: 'Up the dam',
          lines: ['Climb the ladders from walkway to walkway (walk into a ladder and hold W). Every ladder is somewhere else along the dam, so you cross the spillways on every walkway. Their lamps tell you: GREEN, go; AMBER, the water is coming; RED, wait. Jump the broken bits of walkway. The gallery door is on the top walkway.'] },
      ],
      startLabel: 'Climb',
      objective: 'Climb the dam to the inspection gallery door',
      doneTitle: 'The gallery',
      doneText: 'The door is rusted, but it opens. A long concrete tunnel inside the dam, water running down the walls, and from somewhere below, the hum of the turbines. And a voice you know, shouting at somebody: Ricky. "...and the food here is TERRIBLE!"',
    },
    {
      id: 'turbines', kind: 'onFoot', mode: 'brawl', title: 'The power house',
      time: 'night', weather: 'clear',
      intro: [
        { kicker: 'The power house', who: 'kitsu',
          lines: ['"Three turbines, one cage at the far end, and a lot of Jackals. No sneaking round this one, I\'m afraid."'] },
        { kicker: 'The cage', who: 'ricky',
          lines: ['Ricky rattles the bars. "There you are! Watch out for the floor: those grates blow steam every few seconds. Nearly cooked one of them myself earlier."'] },
        { kicker: 'How to play', title: 'Fight',
          lines: ['The Jackals come at you in waves. When one gets a red ! over his head, he\'s about to swing: STEP BACK out of reach, then hit him while he recovers. Three quick punches end in an UPPERCUT. When a grate in the floor glows orange, steam is coming: get off it, and lure the Jackals onto it. Then break the lock on Ricky\'s cage (hold E).'] },
      ],
      startLabel: 'Fight',
      objective: 'Fight off the Jackals and get Ricky out of the cage',
      doneTitle: 'Ricky',
      doneText: 'Ricky squeezes out of the cage, hugs you so hard your ribs creak, and picks up a spanner. "Right. Where\'s Sable?" The lift at the end of the hall goes up to the top of the dam. On the radio, Mags has stopped talking. Then her voice, very calm: "She knows. Come up. Now."',
    },
    {
      id: 'sable', kind: 'onFoot', mode: 'boss', title: 'Sable',
      time: 'night', weather: 'storm',
      intro: [
        { kicker: 'The top of the dam, midnight', who: 'sable',
          lines: ['The lift doors open onto the rain and the floodlights. Mags is sitting on the bags by the floodgate house with two Jackals over her. And standing in the middle of the helipad, in her red leather coat, the velvet box in one hand: Sable.',
            '"You took my silver. You took my driver back. And now you think you\'re leaving with the diamond." She puts the box in her pocket and takes her sunglasses off. "No. Now it\'s just you and me."'] },
        { kicker: 'On the radio', who: 'kitsu',
          lines: ['"She\'s strong, she\'s fast, and she fights dirty. Watch what she does before she does it. And keep away from the edges."'] },
        { kicker: 'How to play', title: 'The final fight',
          lines: ['Watch Sable. RED ! over her head: she\'s about to throw three punches: step BACK, then hit her while she\'s OPEN. RED LINE on the ground: she\'s going to CHARGE: get out of the line, and if she runs into a crate or the railings she\'s DIZZY (every punch counts double). From the front she blocks jabs: the UPPERCUT (the third quick punch) breaks through. Later she calls her Jackals, and then she gets out the dynamite: get out of the red rings!'] },
      ],
      startLabel: 'Fight',
      objective: 'Beat Sable',
      doneTitle: 'The End of the Jackals',
      doneText: 'Sable goes down on the wet concrete and stays down. The velvet box rolls out of her pocket and stops at your feet. Mags is already on her feet, and the two Jackals guarding her have run for their trucks. Then, all along the canyon, blue lights: the sheriff, and behind him, every police car in the desert. And over the top of the canyon, a helicopter, with somebody in a trench coat leaning out of the door.',
    },
    {
      id: 'finale', kind: 'drive', title: 'The last getaway',
      time: 'night', weather: 'storm',
      intro: [
        { kicker: 'On the dam road', who: 'mags',
          lines: ['"That\'s Delacroix in the helicopter. She\'s followed the Star all the way from Lumière." Mags throws Sable in the back of the van with the bags, and Ricky slides behind the wheel... then thinks about it, and slides over. "Last drive. You\'ve earned it."'] },
        { kicker: 'On the radio', who: 'juno',
          lines: ['"I\'m at the jetport. Lorenzo\'s jet is still sitting on the runway, fuelled up, and nobody\'s looking after it. Get here and we\'re gone."'] },
        { kicker: 'How to play', title: 'The last getaway',
          lines: ['Drive the van to the PRIVATE JETS terminal (the gold light) with every police car in Mirage Springs after you. Roadblocks, spike strips, and Delacroix\'s helicopter. Hack the junctions (E), use the nitro, and don\'t stop.'] },
      ],
      startLabel: 'Drive',
      objective: 'Get to the jetport',
      car: { kind: 'van', color: 0x2a3a5a },
      city: DAM_CITY,
      start: { node: [1, 8], offset: [2.3, -20], heading: Math.PI },
      goal: { type: 'reach', block: '7,0', label: 'Private Jets', color: 0xffd040 },
      heat: { start: 3, max: 5, riseEvery: 35 },
      roadblocks: { fromHeat: 4, every: 26, spikes: true },
      doneTitle: 'The runway',
      doneText: 'The van crashes through the jetport fence and races down the runway to Lorenzo\'s jet, its engines already screaming, Juno waving from the cockpit. And in front of it, landing right on the runway in a storm of rain and light: Delacroix\'s helicopter.',
    },
  ],

  outro: [
    { kicker: 'The runway, 1 a.m.', who: 'delacroix',
      lines: ['Inspector Delacroix walks across the wet runway in her trench coat, all alone, and stops in front of you. "Four countries. Two years. One diamond." She holds out her hand.',
        'You look at the crew. Then you put the velvet box in her hand.'] },
    { kicker: 'The runway', who: 'delacroix',
      lines: ['She opens it, and for a long moment she just looks at the Star. Then she looks past you, at the back of the van: Sable, tied up with tow rope, and beside her the sheriff\'s little black book of everything the Jackals ever paid him for.',
        '"The Star goes home to the Grand Musée. Sable and her sheriff go to prison for a very long time." She closes the box. "And I never saw any of you. Go, before I change my mind."'] },
    { kicker: 'Thirty thousand feet', who: 'juno',
      lines: ['Lorenzo\'s jet climbs out of the storm into a sky full of stars. Lorenzo\'s money in the bags. Ricky asleep in a leather seat that cost more than his car. Theo opens the minibar. "So. Where to?"',
        'Mags looks out of the window at the dark desert going by underneath. "Somewhere warm. With a beach. Where nobody has ever heard of any of us."'] },
  ],

  jobDone: {
    title: 'The Coyote Dam',
    text: 'You took the Star back from Lorenzo, climbed the Coyote Dam through the spillways, broke Ricky out of the power house, beat Sable on top of the dam, and got the whole crew out from under Delacroix\'s nose. The last job.',
  },

  finale: {
    title: 'The Perfect Getaway',
    text: 'Six months later, on Isla Coral, a little island in a turquoise sea, there is a beach bar called THE GETAWAY. Nobody there has ever heard of a diamond called the Star of Lumière.',
    epilogue: [
      { who: 'mags', text: 'Runs the bar. Keeps the money in a safe nobody has ever cracked (she checked).' },
      { who: 'theo', text: 'Makes cocktails, very badly, very slowly. Has not climbed anything since the dam.' },
      { who: 'ricky', text: 'Drives the island\'s only taxi, a sky-blue convertible, much too fast.' },
      { who: 'juno', text: 'Flies tourists round the islands in a little seaplane. Never goes up in a balloon.' },
      { who: 'paz', text: 'Takes tourists out on the speedboat. Still ducks under every bridge.' },
      { who: 'kitsu', text: 'Says she\'s retired. Has four laptops open, all the time.' },
      { who: 'delacroix', text: 'Back in Lumière. Every Christmas a postcard arrives from somewhere sunny, with no name on it. She keeps them all in her desk.' },
    ],
  },
};

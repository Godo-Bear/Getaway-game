import { save } from '../core/save.js';

// Updates: everything that's been added to the game, newest first (title
// screen > Updates). Add a new entry at the TOP of UPDATES with every
// update you ship, in plain words.

export const UPDATES = [
  { date: '2026-10-07', title: 'Gadget slots, the Locator, new looks and a better jailbreak', items: [
    'Gadget slots: buy up to 3 in the Shop (even the first one costs cash). Each slot holds one gadget on foot and one in the car',
    'Press 1, 2 or 3 to use the gadget in that slot (F still uses the last one). On a phone there\'s a button for each gadget',
    'New gadgets: the Locator (on foot) and the Radar Locator (in the car) mark everything nearby for 10 seconds, even through walls',
    'Jail breakouts: pick a plan (dig a tunnel, hide in the laundry truck, or the crew\'s zip line), with a night guard on patrol',
    'Carrying a bag: the suitcase is held in your hand and swings as you walk',
    'New looks: afro, braids, dreadlocks, slicked-back and undercut hair; fedora, bucket hat, beret and headphones; leather jacket, tracksuit, vest, holiday shirt and long coat; aviators, a bandana and a hockey mask; sideburns',
    'New presets: Biker, Tracksuit, Beach day, Long coat, Hockey mask and Bandana bandit, plus more colours',
  ] },
  { date: '2026-10-07', title: 'Chapter 13: Touchdown, and local gadgets', items: [
    'Chapter 13: the crew lands abroad in Porto Sereno, a sunny harbour town with palm trees, terracotta roofs, trams and the sea',
    'Part 1: carry three heavy bags past the customs officers at the airstrip (with a bag you\'re slower and can\'t climb)',
    'Part 2: lose the police across town (mind the trams!) and get to the safehouse over the fish market',
    'A new crew member: Paz, the local fixer',
    'Local gadgets: each place has its own set of 3 in the Shop (Harbor City, Frostvale, Porto Sereno, Neon Kōji), unlocked when the story gets there',
    'Porto Sereno is a new Free Run map',
  ] },
  { date: '2026-10-07', title: 'The subway, jail, and busier streets', items: [
    'The raised roads are gone: there\'s a subway under the city instead. Ramps down through some blocks (blue SUBWAY signs), tunnels under two avenues, stations and subway trains',
    'The police can follow you down into the subway (and back up)',
    'Jail: get caught 3 times, in any mode, and the police take you to jail. Break out to carry on',
    'Sharper steering: the car turns more and slides out to the side through corners',
    'Free Run on foot: no car of yours parked in the street; traffic drives round the blocks and pulls over to park, and police cars come out when you\'re wanted',
    'Steal a parked or stopped car and drive it right there, no loading screen (E to get out)',
    'Better buildings: glass towers, stepped tops, stone bases, corner columns, pilasters and balconies',
  ] },
  { date: '2026-10-06', title: 'Driving on different levels', items: [
    'A bigger city with three levels to drive on',
    'The Skyway: a ring road 9 m up round the outside of the city, with on-ramps from the streets',
    'Drive along the railway tracks across the city (watch out for the train!)',
    'The Highline: the highest road, 18 m up, over the middle of the city',
  ] },
  { date: '2026-10-06', title: 'Updates list', items: [
    'An Updates button on the home screen: everything that\'s been added to the game, newest first',
  ] },
  { date: '2026-10-06', title: 'Free Run part 4: getting around', items: [
    'Steal any parked car (the police come looking for it)',
    'Bikes and e-scooters from docks round the city',
    'Bring Mags, Theo or Ricky along: they follow you and knock down police',
    'The safehouse: lay low and save, garage, wardrobe, gadgets, start here',
  ] },
  { date: '2026-10-06', title: 'Free Run part 3: things to do', items: [
    'Jobs from contacts round the city, against the clock',
    'Parkour challenges with ghosts of your best runs',
    'Buy things at the shop counters (energy drinks, disguises, a tag finder...)',
    'Stats and achievements (title screen > Stats)',
    'Rumble on a gamepad and vibration on phones',
  ] },
  { date: '2026-10-06', title: 'Free Run part 2: a living world', items: [
    'Puddles and wet streets in the rain',
    'Day and night come round in Free Run',
    'Pick the time and the weather (rain, storm, fog, snow)',
    'Rush hour: packed pavements and roads, horns at the lights',
    'Hidden crew tags to find on the hardest roofs',
  ] },
  { date: '2026-10-06', title: 'Free Run part 1: police on foot', items: [
    'Wanted stars on foot',
    'Smarter police on foot: they have to see you, and they radio each other',
    'Hide behind shop counters',
    'Shop alarms, and shutters that roll down after a robbery',
    'Minimap and big map on foot',
  ] },
  { date: '2026-10-06', title: 'Home screen music', items: [
    'A theme tune on the home screen, and less fuzzy noise',
  ] },
  { date: '2026-10-06', title: 'One city everywhere', items: [
    'Ladders inside the buildings (through a stairwell door)',
    'The same city map in the story and every mode',
    'Parks spread out across the city',
  ] },
  { date: '2026-10-06', title: 'A real city', items: [
    'Free Run maps: Downtown, Old Town and Frostvale, unlocked through the story',
    'People on every pavement and park path, and shopkeepers',
    'Little shops you can walk into, parks, street trees and fire escapes',
    'A bigger Free Run city',
    'Better buildings: rooms behind the glass, balconies, roof details',
    'Livelier streets: buses, trucks, parked cars, people who jump clear',
    'New vehicles: the Street Bike, police bikes, a chase helicopter',
  ] },
  { date: '2026-10-05', title: 'Better everything', items: [
    'Frostvale side jobs and new cars to unlock',
    'Better gadgets: pick a spot on the map to teleport, Blink, a running decoy',
    'Character portraits, a cleaner HUD, phone buttons you can move, music for each place',
    'Smoother running, falls and get-ups, people react to you',
    'Throw coins, punch combos, blocking, slide tackles, pickpocketing',
    'Free Run: T gets you in and out of the car',
    'Graphics: reflections, light beams, smoke, breath in the cold, clouds and stars',
  ] },
  { date: '2026-10-05', title: 'Frostvale chapters 9-12', items: [
    'Snowblind, Avalanche, The Ice Festival and Last Run',
    'A proper security door in the prison\'s D Block',
    'The game\'s version shows on the home screen',
  ] },
  { date: '2026-10-04', title: 'New people and cars', items: [
    'Snowy Frostvale for the final chase, the crew\'s homes on the chapter screen, and punching',
    'Better cars with a real underglow, and a live preview of your car',
    'A live 3D preview of your character',
    'New people: rounded bodies, faces, hair, clothes and a walk cycle',
    'A loading screen with a progress bar and tips',
    'An easier prison escape once Ricky is out',
  ] },
  { date: '2026-10-02', title: 'A new look', items: [
    'A new home screen: neon GETAWAY over a rainy neon city',
    'An app icon for your phone\'s home screen',
    'Guards hunt as a group when you\'re seen',
    'A brightness slider for dark night levels',
    'See how long each gadget effect has left',
  ] },
  { date: '2026-10-01', title: 'Chapters 6, 7 and 8', items: [
    'Chapter 8: Frostvale (leave the city for a snowy ski town and the Glacier Vault)',
    'Chapter 6: The Iron Line (the train) and Chapter 7: Blackwater (the prison break)',
    'Working lasers, smaller story text, and playing in landscape on phones',
    'Fixed police vision cones and laser alarms',
    'Free Run: the "Get in a car" button',
    'Pop-ups in the top-left corner; road chases are easier to win',
    'More admin abilities, mix-and-match looks and cars, hiding gadgets, softer snow',
    'Cleaner chapter screens',
  ] },
  { date: '2026-09-30', title: 'Level Editor and more', items: [
    'Times of day, daytime missions, heist planning, disguises, takedowns and city hacking',
    'The Level Editor (brush sizes, gliders, parkour, floors, islands, vault pieces)',
    'Zip lines you can ride either way',
    'Chapter 6 first appeared',
  ] },
  { date: '2026-09-29', title: 'Chapter 5 and online accounts', items: [
    'Chapter 5: The Lucky Star (a new crew and a casino heist)',
    'Difficulty: Easy, Normal and Hard, each with its own best times',
    'The admin panel',
    'Pick things up by running over them',
    'The bank heist opening, Speedrun mode, Free Run across rooftops and streets',
    'Online accounts with cloud saves',
    'A gadget shop, a big map and nitro pickups',
    'Chapter 4: Last Flight, and a big visual upgrade',
  ] },
  { date: '2026-09-28', title: 'The first version', items: [
    'Chapters 1, 2 and 3, the Case Board and story cards',
    'Ghost mode, ladders and hiding spots',
    'First-person view on foot',
    'Sound, settings, gamepad and touch controls',
    'Police and traffic',
    'Rooftop Run and Street Chase, and the parkour moves',
  ] },
];

const fmtDate = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** Is there an update the player hasn't looked at yet? */
export function hasNewUpdate() {
  return save.data.seenUpdates !== UPDATES.length;
}

/** The Updates card's contents (and marks them as seen). */
export function updatesHtml() {
  const unseen = UPDATES.length - (save.data.seenUpdates ?? UPDATES.length);
  save.data.seenUpdates = UPDATES.length;
  save.write();
  const list = UPDATES.map((u, i) => `<div class="upd${i < unseen ? ' new' : ''}">
      <div class="upd-head"><b>${u.title}</b>${i < unseen ? '<span class="upd-tag">NEW</span>' : ''}<small>${fmtDate(u.date)}</small></div>
      <ul>${u.items.map((t) => `<li>${t}</li>`).join('')}</ul></div>`).join('');
  return `<p class="sub kicker">What's new</p><h2>Updates</h2><p class="sub">Everything that's been added to the game, newest first.</p><div class="upd-list">${list}</div>`;
}

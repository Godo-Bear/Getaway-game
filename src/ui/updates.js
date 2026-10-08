import { save } from '../core/save.js';

// Updates: everything that's been added to the game, newest first (title
// screen > Updates). Add a new entry at the TOP of UPDATES with every
// update you ship, in plain words.

export const UPDATES = [
  { date: '2026-10-08', title: 'Chapter 18: Silver Dragons', items: [
    'Chapter 18 (three parts), the last job in Neon Kōji: Ryu and her street-racing crew, the Silver Dragons, want Kurogane\'s gold',
    'Part 1: a race across the rainy neon city against Ryu\'s white car. No police, just the two of you. It shows who\'s ahead and by how much',
    'Part 2: while you raced, her crew stole the gold. Jump from truck roof to truck roof along a convoy on the expressway at 94 km/h. The gaps open and close, and when a LOW BRIDGE comes, crouch flat or it sweeps you off!',
    'Part 3: drive the gold car (a yellow muscle car) to Juno\'s cargo plane at the airport before it leaves, with Kurogane\'s black cars everywhere',
    'The crew leaves Neon Kōji. Next stop: Lumière, a grand old city of boulevards, bridges and museums (Chapters 19 to 21)',
  ] },
  { date: '2026-10-08', title: 'Longer chapters: a new part in Chapters 12 to 16', items: [
    'Chapter 12, new Part 2 "The decoy": Sentinel\'s trucks block the lake road, so drive round town past their office, the hotel and the church to pull them all after you, then lose them and get back to the snowmobiles',
    'Chapter 13, new Part 3 "The photos": the customs officer took photos of you. Catch his car before he gets them to the police station',
    'Chapter 14, new Part 1 "The shopping list": a daytime run round Porto Sereno for a rope ladder, wetsuits and a speedboat, before the shops close. No police, just the clock and the trams',
    'Chapter 15, new Part 1 "Follow the money": tail Varga\'s van on Paz\'s Dirt Bike to find out which float the money goes on. Keep it in sight, but don\'t get too close or he\'ll see you',
    'Chapter 16, new Part 3 "Dead drops": split the stolen bonds between three hiding places round Neon Kōji, then lose the black cars and get to Kitsu\'s garage, the Fox Den',
    'New kinds of driving: stops in order, tailing a car, races against a rival (coming in Chapter 18), and parts where you ride the Dirt Bike',
  ] },
  { date: '2026-10-08', title: 'Chapter 17: Kurogane Tower', items: [
    'Chapter 17 (three parts): rob the gold from the sky vault at the top of Neon Kōji\'s tallest tower, from above',
    'Part 1: jump from Juno\'s helicopter in a wingsuit and fly down a canyon of skyscrapers. A / D steer, W dives, S flares. Ride the steam updrafts, fly through the boost rings, keep out of the drones\' searchlights, and land on the roof',
    'Part 2: ride the window cleaners\' gondola down the tower (crouch when the drone\'s light comes your way), cut the glass, and cross a floor of pressure tiles on the path Kitsu shows you for a few seconds. Remember it!',
    'Grab the gold and the alarm goes: guards burst in and steel shutters start to come down. Run for the window and jump: the parachute opens by itself. Steer it down to Kitsu\'s van',
    'Part 3: Kurogane\'s black cars chase you across the rainy neon city to Kitsu\'s garage, the Fox Den',
  ] },
  { date: '2026-10-08', title: 'The Dirt Bike', items: [
    'A new bike in Your car / the Garage: the Dirt Bike (free from Chapter 2, or buy it early)',
    'Hold Space (the Wheelie button on a phone) to pull a wheelie: the front wheel comes up and you get a little extra speed',
    'Let go and it pops into a jump. It flies off the ramps too. Long wheelies and big air earn a bit of cash',
    'The controls help in the corner is shorter (the full list is on the Controls screen)',
  ] },
  { date: '2026-10-08', title: 'Chapter 16: The Silver Arrow, and Neon Kōji', items: [
    'The crew moves to Neon Kōji: a huge city of dark towers covered in neon signs, giant billboards, cherry trees and rain. It\'s a new Free Run map too',
    'A new crew member: Kitsu, the hacker who signs with a neon fox',
    'Part 1: race across the rainy neon city to catch the bullet train before it leaves',
    'Part 2: aboard the Silver Arrow at 300 km/h. Sit down in an empty seat to hide among the passengers, swap the courier\'s case only while the train is in a tunnel and the lights go out, then run back and uncouple the last carriage',
    'People can sit down now (passengers on the train)',
    'The controls help in the corner is smaller',
  ] },
  { date: '2026-10-07', title: 'Chapter 15: Festa', items: [
    'Chapter 15: rob the crooked inspector Varga in the middle of Porto Sereno\'s night festival, then leave town',
    'Part 1: a parade of floats, lanterns, confetti and crowds. Wear a giant carnival head and dance with the parade so the police can\'t pick you out',
    'Climb onto the moving galleon float (it carries you along) and pick the chest\'s lock while Varga\'s two lookouts look away. Then the whole street blacks out: run!',
    'Part 2: ride the funicular up the hill and jump across to the other car as they pass halfway, because Varga is waiting at the top',
    'Floats and funicular cars are real moving platforms you can stand on',
    'Phone: hold the action button to pick a lock',
  ] },
  { date: '2026-10-07', title: 'Chapter 14: The Bella Fortuna', items: [
    'Chapter 14: rob the Bella Fortuna, a casino ship anchored in Porto Sereno\'s bay, at night',
    'Part 1: climb a rope ladder up the ship\'s side, sneak through the decks and the casino, crack the counting room, then jump overboard to Paz\'s speedboat',
    'The swell: every so often the ship rolls and you slide across the deck unless you crouch to hold on. The guards grab the rail too, so their torches go off: your moment to slip past',
    'Part 2: drive a speedboat across the bay with police launches after you. Hide behind rocks, thread the narrow gaps in the reef (their boats don\'t fit), then slip into a sea cave',
    'Boats! A speedboat with a boost, police launches with flashing lights, a rowing boat',
    'Phone: the boat uses the Drift and Nitro buttons',
  ] },
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

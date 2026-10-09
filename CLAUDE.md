# Getaway: notes for future work

## Story direction (from Chapter 6 onwards)

The player and their crew are **criminals, not detectives**. Chapters 1-5
were built around finding a mole (clues, a Case Board, a deduction at the
end). From now on:

- **No moles or traitors.** The crew is loyal; nobody on the team betrays
  the others. Tension comes from outside instead: rival crews, a bent cop,
  a double-crossing buyer, the city itself, bad luck, time pressure.
- **No detective work.** No clue hunting to solve a whodunit, no deduction
  screens. Chapters are about planning a job, pulling it off, and getting
  away. (Collectibles are fine if they're loot, blueprints, gear, or cash,
  not evidence.)
- **Be creative and don't repeat the formula.** Every chapter should bring
  new places and new mechanics: e.g. a train heist on the move, a museum at
  night, a harbour/boat escape, an airfield, a snowy mountain vault, a
  prison break for a crew member, a race against a rival crew, a blackout
  across the city. Mix on-foot, driving and new vehicle/traversal ideas.
- Keep the crew from Chapter 5 (Mags, Theo, Ricky) as the loyal core team;
  new members can join, and they should stay loyal. (Juno, Paz and Kitsu
  have joined since.)
- **Chapters have about six parts (from Chapter 21 on; at least three before).**
  Mix them: drives, on-foot, and at least two parts with a new mechanic of
  their own. Story drive parts are cheap to add
  (`ChapterDriveMode` goal types: reach, safehouse, chase, stops, tail,
  race; `noPolice`, `vehicle: 'dirtbike'`, `car: { body, color }`), but each
  chapter should also have at least one part with its own new mechanic.

- **The crew moves every few chapters.** About every 3 chapters they leave
  for a new city or country, and the chapters in between happen there (new
  look, new places to rob, new ways to get away). Chapters 1-7 are in
  Harbor City; Chapter 8 moves them to **Frostvale**, a snowy ski town in
  the mountains: their new home for Chapters 8-12 (use the alpine street
  city `generateStreetCity({ alpine: true })` and the alpine rooftop town
  `ch8Town` with its `levelOpts` for it). At the end of Chapter 12 they fly
  abroad (Chapters 13-15), and so on. So far: Porto Sereno (13-15, the
  `coastal` city style), Neon Kōji (16-18, the `neon` style), then Lumière
  (19-21: a grand old European-style capital of boulevards, a river with
  bridges and famous museums; Chapter 18 ends with the crew flying there to
  steal the Star of Lumière diamond from the Grand Musée; Chapter 20
  blacks out the city; Chapter 21 ends with the crew flying out from under
  Delacroix's nose). Then Mirage Springs (22-24, the `desert` style: a
  city of casinos in the middle of the desert; the rival crew there is the
  Jackals, led by Sable, and the sheriff works for her; Chapter 22 ends with
  Lorenzo Gold of the Golden Mirage offering to buy the Star if the crew
  robs Sable's silver mine). Then Isla Coral (25-27), tropical islands.
  Keep `PLACES` in `src/story/chapters.js` up to date: the chapter screen
  groups chapters under where the crew lives.
- **Each place has its own map layout** (not just its own look): its own
  street plan in `src/world/maps.js` (driving: `layout` block sizes and
  joined blocks, `el`; on foot: `blocks`, `block`, hand `kinds`). Within a
  place, the story and Free Run use the SAME map. A new place gets a new
  layout, and its story drive parts must start on its roads (check them).

Chapters 1-5 keep their existing mole stories and deductions as they are.

## Working in this repo

- Vite + Three.js. `npx vite build` must pass. The game must work on phones
  (touch controls, portrait and landscape).
- With every update, add an entry at the top of `UPDATES` in
  `src/ui/updates.js` (title screen > Updates lists them, newest first).
- Commit and push to the working branch when done; the GitHub Pages site
  deploys automatically.

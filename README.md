# Getaway

A 3D heist-escape game for the browser, built with **Vite + Three.js** (plain JavaScript, ES modules).

## Run it

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173/).

Handy URL options for testing:

| URL | What it does |
| --- | --- |
| `/?mode=chapter1` | Jump straight into Story Chapter 1 (also `chapter2` to `chapter8`; add `&part=N` for a later part, counting from 0) |
| `/?mode=speedrun` | Start a Chapter 1 speedrun |
| `/?mode=freecar` | Free Run, starting in the car |
| `/?mode=editor` | The Level Editor (add `&level=GW1-...` to open a level code) |
| `/?mode=chapter2&part=1` | Jump into a later part of a chapter (parts count from 0) |
| `/?mode=chapter3&ghost` | Jump into a chapter with ghost mode switched on |
| `/?mode=drive1` | Jump straight into Story Chapter 1, Part 3 (the drive) |
| `/?mode=deduce1` | Jump straight into a deduction (also `deduce2` to `deduce5`) with whatever clues you've found |
| `/?mode=rooftop` | Jump straight into Rooftop Run (helicopter survival) |
| `/?mode=free` | Jump straight into Free Run (on the rooftops) |
| `/?mode=chase` | Jump straight into Street Chase (driving survival) |
| `&nolock` | Play without mouse lock (A/D turn, drag to look) |

Press **F3** (or **`**) in game for an FPS / debug readout.

**Controls:** keyboard + mouse (on foot: Shift switches sprint on and off; driving: Shift drift, Space nitro, M map; F gadget; scroll to zoom), any standard gamepad (Xbox layout: sticks, A jump/handbrake, RB nitro/sprint, LB gadget, RT/LT gas/brake, Y view, Menu pause; the d-pad and A/B drive menus), or touch (virtual joystick + buttons appear on the first touch). See *Controls* on the title screen.

**Difficulty** (Settings, or the Story screen): **Easy** (slower police and spotlights, one cop car fewer, the meters fill slower, more time on timers, slower people to chase), **Normal** (as designed) or **Hard** (faster police, one cop car more, less time, and 25% more cash). It changes on-foot and driving parts, the survival modes and Free Run. Each difficulty keeps its **own** chapter ranks (gold on Easy doesn't count for Hard), best times, survival high scores and Speedrun times; the Story screen shows your rank on all three. Story progress (solved and unlocked chapters) is shared. Code: `src/core/difficulty.js`, `save.statKey()` in `src/core/save.js`.

**Settings** (title screen or pause menu): difficulty, master/music/effects volume, look sensitivity, invert Y, first-person view, sprint toggle or hold, crosshair, graphics quality (low / medium / high), weather (story / rain / off), getaway car colour (gold ratings unlock extra colours). Saved in the browser.

**Graphics:** medium and high add post-processing (`src/world/postFx.js`): bloom so neon, lamps, headlights and windows glow, a vignette and a cool/warm colour grade. The sky is a gradient dome with drifting clouds (more of them in bad weather; lit orange by the city at night, white by day, pink and gold at sunrise and sunset), a big low sun that sets the sky on fire round it, a moon halo, and twinkling stars of different sizes and colours that go out behind the clouds (`src/world/lighting.js`; Low graphics uses a cheaper one-layer cloud). Rain and thunderstorms (`src/world/weather.js`) add rain streaks, wet shiny roads and roofs that reflect the sky, lightning flashes and thunder; snow falls as soft round flakes.

**Reflections and light beams** (`src/world/atmosphere.js`): car paint, glass, chrome rims and building windows reflect a small picture of the sky all round (the sky colours, a skyline with lit windows at night or snowy mountains in Frostvale, the sun or moon), repainted when the time of day changes. At night in rain or snow, street lamps and headlights show soft cones of light, as if lit up by the raindrops and flakes.

**Smoke and breath** (`src/vehicles/particles.js`, one draw call per system): soft, lumpy, spinning puffs that fade into the fog and darken at night. Tyre smoke when you drift or spin the wheels (snow spray in the snow and on the snowmobile), breath clouds from everyone's mouths in the cold, and smoke from the chimneys in Frostvale (already rising when a level starts). Low skips the post-processing for older laptops; phones start on medium.

**Audio:** recorded sounds in `public/audio` (see CREDITS.md), plus sounds synthesised with the Web Audio API.

## Title screen

The title matches the app icon: **GETAWAY** is an amber neon-tube sign (each letter drawn from the title font's outline as a glass tube with a hot core and a glow, golden at the top and deep orange at the bottom; it flickers on the first time, the W buzzes now and then, and a glint twinkles on the G; `src/ui/neonLogo.js`), over the same rainy neon city as the icon (`src/assets/title/keyart.webp`, rendered from a 3D scene) that slowly drifts, with rain falling over it (`src/states/titleState.js`). There's no 3D city to build or draw on the title, so it opens fast on phones.

**Updates** (a pill on the title screen) lists everything that's been added to the game, newest first, back to the first version. A dot on the pill means there's something you haven't seen yet, and the new ones are tagged NEW. The list lives in `src/ui/updates.js`: add an entry at the top with every update.

## Loading screen

While the game downloads, and whenever a level is being built (a chapter part, Free Run, Street Chase, a custom level), a loading screen shows the neon **GETAWAY** sign over the blurred rainy city, what's loading (e.g. *Chapter 1 · The Harbor Trust Job / The heist*), a progress bar with a little getaway car driving along it, and a gameplay tip that changes every few seconds. Code: `src/ui/loader.js` (the markup is in `index.html` so it shows straight away); `src/core/stateMachine.js` shows it and builds the level a frame later so it's on screen first.

## App icon (Add to Home Screen)

The icon is a see-through amber **neon-tube G** (the title font, slanted like the logo, golden at the top and deep orange at the bottom, with a glint on the glass) glowing over a 3D-rendered rainy night city: a wet avenue with soft reflections, lit office windows, neon shop signs, street lamps and long-exposure car light trails (`public/icons/`). `public/manifest.webmanifest` makes **Add to Home Screen** use it and open the game full-screen in landscape like an app. Use the GitHub Pages address (https://godo-bear.github.io/Getaway-game/) in Safari (Share > Add to Home Screen) or Chrome (menu > Add to Home screen / Install app): a page shown inside another site (like a claude.ai link) gets that site's icon instead. The icon links carry a version (`?v=neon`) so phones fetch a new icon after it changes; if an old one still shows, delete the home-screen icon and add it again.

## Check every chapter

`npm run check:chapters` starts the game, opens every part of every chapter in a headless browser, plays two seconds of each, and lists anything that failed to load or threw an error (needs Playwright: `npm i -D playwright`). Code: `scripts/check-chapters.mjs`.

## Publish on GitHub Pages

`.github/workflows/deploy.yml` builds the game and publishes it on every push.
One-time setup: in the repo go to **Settings > Pages > Build and deployment > Source** and pick **GitHub Actions**.
The game then lives at https://godo-bear.github.io/Getaway-game/ (progress is in the Actions tab).

It's also on Cloudflare Pages at https://getaway-game.pages.dev (for networks that block GitHub). The Cloudflare project is connected to this repo (build command `npx vite build`, output `dist`, production branch = the working branch), so every push rebuilds it too. If Cloudflare says the project is disconnected from Git, give the **Cloudflare Workers and Pages** GitHub app access to this repo (GitHub > Settings > Applications) and push again. The title screen shows the build version in the corner, to check which version a device has.

## Story direction

From Chapter 6 on: no moles and no detective work (you're the criminals). See `CLAUDE.md`.

## Online accounts (Firebase)

The title screen has an **Account** button: players sign up / sign in with an email and password and their progress, cash and gadgets are saved online (a few seconds after every save), so clearing the browser doesn't lose anything and they can carry on on another device. Settings stay per device. If a device and the account both have progress, the player picks which to keep. Code: `src/core/cloud.js`, `src/ui/account.js`.

It's off until you connect a free Firebase project (until then everything is saved in the browser only, like before):

1. Go to https://console.firebase.google.com, **Create a project** (Google Analytics not needed).
2. **Build > Authentication > Get started > Sign-in method > Email/Password > Enable > Save.**
3. **Build > Firestore Database > Create database** (any location, start in **production mode**). Then open the **Rules** tab, replace everything with this and press **Publish**:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /saves/{userId} {
         allow read, delete: if request.auth != null && request.auth.uid == userId;
         allow create, update: if request.auth != null && request.auth.uid == userId
           && request.resource.data.json.size() < 500000;
       }
     }
   }
   ```

   This is what keeps saves private: each player can only read and write their own.
4. **Project settings (gear icon) > General > Your apps > the `</>` (web) icon**, give it any nickname, **Register app**. Copy the values from the `firebaseConfig` it shows into `src/core/cloudConfig.js` and push. (These values are meant to be public; the rules above protect the data.)

This repo is already connected to the `getaway-game-50249` project.

## Admin panel

**Settings > Admin**: type the admin code to unlock it on that device (it's remembered, and synced with your account). The title screen then shows an **Admin** button too. Code: `src/core/admin.js`, `src/ui/adminPanel.js`.

The panel has four tabs, each a tidy list:

* **Abilities** (on/off switches, in groups):
  * Everything: Double everything (twice the cash, twice the time on every countdown, gadgets last twice as long and recharge twice as fast, nitro lasts twice as long, catch people twice as fast).
  * Stealth: God mode (never caught, spotted out or busted), Unseen (guards, street patrols and searchlights can't see you), No lasers, Instant hacks (every hack and safe opens at once).
  * Movement: Super speed, Moon jump, Glider always on, Infinite nitro.
  * Gadgets: No gadget recharge, Double power-ups (every gadget effect lasts twice as long), Infinite range (the Grapple Gun reaches any building you can see, EMP and Flashbang hit every cop, smoke hides you anywhere).
  * Fun: Slow motion, Big head.
  * With any ability on, Speedrun times aren't saved.
* **Cash & unlocks**: set your cash or add $1,000 to $1,000,000; unlock every gadget, chapter or car colour.
* **Players**: other players' cash, chapters and gadgets (online accounts, see below).
* **Admin**: turn every ability off, lock admin mode, reset your progress.
* **In a game**, the pause menu has Admin buttons: skip this part, teleport to the objective marker (on foot), and the admin panel itself.
* **Admin gadgets** (free, in the Shop's Admin tab, and only while admin mode is on): Rocket Boots (jump again in mid-air, any number of times), Invisibility Cloak (15 s invisible), Police Freeze (every cruiser stuck for 10 s), Teleporter (the city map opens: tap anywhere and the car beams there; close the map and it isn't used up).
* **Unlock**: every gadget, every chapter, every car colour. **Reset my progress** (asks twice). **Lock admin mode**.
* **Admin: skip this part** in the pause menu of any story part.
* **Other players**: sign in with your account, then **Load the player list**: each player's email, cash, chapters solved and equipped gadgets. Set anyone's cash, and **share abilities** with them (tick them and Save abilities; untick to take them away), or give the same abilities to every player at once. Shared abilities work for them without the code, including the admin gadgets. Their game picks changes up within a minute (or next time they open it).

The code only unlocks the panel in the game on that device, and anyone who digs through the game's files could find it, so it only ever changes **your own** save. Changing other players' saves is checked by the server: the Firestore rules must list your account as an admin. Copy **Your account ID** from the admin panel and use these rules instead of the ones above (put your ID between the quotes; add more IDs, comma-separated, for more admins):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isAdmin() {
      return request.auth != null && request.auth.uid in ['PASTE-YOUR-ACCOUNT-ID-HERE'];
    }
    match /saves/{userId} {
      allow read: if request.auth != null && (request.auth.uid == userId || isAdmin());
      allow delete: if request.auth != null && request.auth.uid == userId;
      allow create, update: if request.auth != null && (request.auth.uid == userId || isAdmin())
        && request.resource.data.json.size() < 500000;
    }
  }
}
```

## Modes

* **Rooftop Run**: endless parkour survival. Police helicopters hunt you with spotlights. Points tick up every second you're in the open; cash bags give bonuses. Every 30 s the wanted level rises (faster spotlights, more helicopters). Hide under water towers or inside stairwell huts to break line of sight: stay hidden a moment and the helicopters search further away.
* **Street Chase**: endless driving survival. Points for every second you stay free (more when fast or drifting). Heat rises every 35 s and when you ram cops. Space = nitro, Shift = drift; blue canisters on the road refill nitro (so do drifting, jumps and near misses). Only the two nearest cops chase you up close; the rest patrol nearby junctions. Lose the cops by breaking line of sight; parks, alleys and driving under the elevated railway help. Once lost, the cops sweep a widening search area (red circle on the minimap). From heat 4, roadblocks and spike strips appear on the road ahead.
* **Free Run**: one session across both worlds. Roam the rooftops on foot (cash bags on the roofs), press **Get in a car** (the blue button, or T) to jump straight into your car, or walk up to it on the street (blue beams), and drive the city (cash drops, drifts, near misses), and slow down in a parking garage to head back up. Police are optional (a helicopter on the roofs, two patrol cars on the streets, double cash); getting caught just sends you back, it never ends the run. Switch worlds or police from the pause menu too.
* **Speedrun**: story parts back to back against the clock (any single chapter, or the whole story): no story scenes, no deductions, split times for every part, best times saved. The timer only runs while you're playing.
* **Cash**: Rooftop Run and Street Chase pay for cash bags/drops, losing the cops, and a tenth of your score; Free Run pays for everything you pick up.
* **Story: Chapter 1, Part 1 (the heist)**: inside the Harbor Trust bank. Kill the security cameras (their red cones catch you), find the vault code in the manager's office, open the vault, grab four pallets of cash, then beat the alarm to the roof stairs. Just run over a glowing ring to do each thing.
* **Story: Chapter 1, Part 2**: a hand-built rooftop route from the Harbor Trust bank roof to the getaway car on the Pier Street garage. Checkpoints, one police helicopter (caught = back to the last checkpoint), 4 clues (2 on the main path, 2 behind harder shortcuts), and a bronze/silver/gold rating.
* **Story: Chapter 1, Part 3**: drive the getaway car from the garage to the crew's safehouse (green light). You must lose the cops before you pull up, or you'd lead them straight there. A fifth clue is hidden in the park in the middle of town (amber dot on the minimap).
* **Story: Chapter 1, the deduction**: Your clues are pinned to a corkboard in the safehouse; accuse Vince, Marla, Dex or Det. Hale. The result explains how each clue fits (and which were red herrings) and gives your chapter rating. Solving it unlocks Chapter 2.
* **Story: Chapter 2, The Ferry** (the next afternoon, in daylight): chase Vince's car across town before he reaches the ferry terminal (heat 3-4, roadblocks and spike strips), then chase him on foot across the docks: warehouse roofs, container stacks, a wall-run, a duct to slide under and a zip line down to the pier.
* **Story: Chapter 3, Headquarters**: zip-line onto the police HQ roof, find Det. Hale's ledger while officers chase you out of the stairwells (and the helicopter joins later), zip down to the car, then race the clock to the last ferry through heat-5 roadblocks. The final deduction reveals who planned everything.
* **Story: Chapter 4, Last Flight**: a thunderstorm at dawn. Chase Marla's car through the wet streets to the rail yard by the airfield, then chase her on foot across the freight trains (crossing plates between tracks, a signal gantry to climb, hangar roofs and a zip line) before she reaches her plane. The deduction: who warned her you were coming?
* **Story: Chapter 5, The Lucky Star**: six months later, with a brand new crew and only **one** mole among them. Part 1 (a sunny afternoon, down on the street): meet Nova (hacker) at a pavement cafe, Mags (safecracker) outside a pawn shop and Theo (inside man) at a bus stop (follow the coloured beams; Nova and Mags test you first with a mini-game), then Ricky (driver) and his car. Police officers walk the pavements with vision cones: blend into the crowd (walk right next to people), crouch behind parked cars, take the roofs, or knock one out from behind. Part 2: plan the job, then rob the Lucky Star casino (see the new mechanics below). Part 3: drive the cash down the rainy Strip to Ricky's garage. The deduction only has the new crew as suspects.
* **Story: Chapter 6, The Iron Line** (no mole, no deduction: a job). Ricky is locked up in Blackwater, the island prison, and the only way in is its supply train. Part 1: race across the city to the freight yard before the train leaves. Part 2, the mail car: on top of the moving train at night, jump the gaps between wagons, duck (C / hold Slide) under low bridges, avoid or knock out the guards with torches, grab the payroll bags, then drop through the mail car's roof hatch, past the guard inside, and crack the safe for tonight's gate pass. Part 3, the sea bridge: a police helicopter's spotlight searches the train (hide in the mail car or behind something tall) and wind gusts try to blow you off (crouch!) on the way to the coal wagon at the front. The chapter ends with a "Job done" results screen.
* **Story: Chapter 7, Blackwater** (the breakout). Part 1, the yard: four searchlight towers sweep the yard (keep cover between you and a tower), guards patrol with torches, a guard uniform hangs in the dock office, and the night guard's keycard is up the north-west watchtower's ladder. Part 2, D Block: pulsing and low lasers down the corridor, hack Ricky's cell, and the alarm goes. Part 3, lockdown: get Ricky (he follows you) up the east wall stairs and down Mags's zip line before the countdown ends. The escape is kinder than the way in: once Ricky is out the alarm cuts the power to the lasers, the searchlights keep to their sweeps instead of chasing you, the guards aren't on extra alert, it takes twice as long to be spotted, and the lockdown gives you 2.5 minutes. Part 4: drive him home along the rainy coast road at dawn. Then the news: there's a bounty on all of you.
* **Story: Chapter 8, Frostvale** (a new crew member, Juno the mountain guide). Part 1: lose the police and bounty hunters and leave the city through the HIGHWAY NORTH tunnel. Part 2: Frostvale, a snowy mountain village of chalets with snowy roofs and chimneys, pine forest and peaks all round, in daylight: meet Juno at the ski hire shop, take recon photos of the job (the Glacier Bank's cable car station, its security hut, its town office), and dodge bounty hunters on the way to your new home, Pine Lodge. Part 3, the Glacier Vault, at night on the summit: searchlight masts and guards on the snowy plateau, hack the steel door's panel, get through the laser fences in the ice tunnel, crack the round vault door's dial and take the gold. The alarm goes: run to the jump deck and glide off the mountain in Juno's wingsuit (jump, then press jump again and HOLD) down to her ledge. Part 4: drive back down the icy mountain road (the car slides) to Pine Lodge.
* **Lasers** (Chapters 5, 7, 8 and the Level Editor): touch a beam that's on and the ALARM goes off (an alarm bell, the screen edges flash red) and you're back at the last checkpoint. They always catch you, even at full sprint (the game checks the whole path you moved along, not just where you ended up), but the pulsing ones stay off for about 2 seconds (longer on Easy) and flicker just before they come back on. Crouch or slide under the low ones.
* **Road chases** (Chapters 2 and 4): stay within about 16 m of the fleeing car (or ram it) to fill the catch meter; it fills in about 2 seconds and drains slowly if you drop back. Fall far behind and they ease off, so you can always catch up.
* **Vision cones**: guards, police and bounty hunters see in the yellow cone in front of them (red when they're on alert). Stand in it and the meter fills; sneak up from behind (outside the cone) to knock them out.
* **The hunt**: the moment any guard, police officer or bounty hunter sees you (or a searchlight or camera catches you), every one of them nearby turns and runs to where you were last seen, their cones turning orange. Sprint away, break line of sight and stay hidden: after 8 seconds without seeing you they give up and go back to their rounds. (The guards on the train's roofs hold their posts.)
* **Your look** (pause menu on foot, or Settings): mix and match your face (balaclava, face showing, sunglasses), skin tone, hair (short, buzz cut, spiky, curly, mohawk, bob, long, ponytail, bun, bald) and hair colour, beard, hat (beanie, bobble hat, cap) and its colour, kind of top (hoodie, jacket, T-shirt, jumper, suit, ski jacket) and its colour, trousers, shoes, gloves and the cash bag, or start from a preset (heist gear, jeans and jacket, tourist, business suit, ski jacket). Your character stands at the side of the screen so you can see the changes live. Saved between games. In broad daylight, with your face showing, police and bounty hunters on the street only recognise you up close. Guard uniforms (casino, prison) are disguises on top.
* **Punch** (on foot): left click (or B, RT on a gamepad, or the Punch button on a phone) punches whoever is in front of you, a little further when you're running. From behind it knocks a guard or police officer out; from the front it stuns them for a moment, and a second punch knocks them down. Rooftop police go down for a few seconds; people on the street fall over and get back up.
* **Combos and blocking**: three quick punches make a combo (jab, cross, then a big rising uppercut). Guards and police sometimes **block** a punch from the front (fists up in front of the face) and shove you back; the uppercut at the end of a combo smashes through a block. They block more on Hard and when they're on alert (`GuardSquad.punched`, `difficulty.guardBlock`).
* **Throw a coin** (right click, Z, LT, or the Coin button on a phone, which shows where there are guards): it flies where you're looking and clinks down; a ring shows how far the sound carries. Guards inside it get a **?** over their heads, walk over, look round for a few seconds, then go back to their rounds; guards who hold their posts (train roofs) just turn to look. A **!** means they've seen you. Free, but one every couple of seconds (`src/player/coins.js`, `GuardSquad.hear`).
* **Slide tackle**: slide (C while sprinting) into a guard to knock them off their feet (from behind: out cold), or into a passer-by or a rooftop officer.
* **Pickpocket**: walk (don't sprint) up behind someone in the street and press **E** (the Pickpocket button on a phone) to lift their wallet: a little cash for the Shop. They stop and look round a moment later, and if a patrol saw you do it, they come running.
* **Frostvale chapters (9-12)**: *Snowblind* (meet a buyer at the Summit Hotel past Sentinel's patrols, then chase his double-crossing van on a **snowmobile** through a **blizzard** and lose Sentinel in the whiteout), *Avalanche* (stop Sentinel's armoured truck, then **outrun an avalanche** that sweeps down through town, and get the town's money to St. Anna's church), *The Ice Festival* (lanterns, a giant tree and the Ice Palace: photograph the job, then grab six cash bags while the **fireworks** dazzle the guards every few seconds, and race home before the lockdown), *Last Run* (Sentinel raids Pine Lodge with a helicopter: hide under the porches, reach the snowmobiles, and race the clock through a blizzard to a ski plane on the frozen lake). New: the snowmobile (you ride it in your own look; skis that steer), blizzard weather (whiteout fog for you and the police), Sentinel Security, and the town's `levelOpts` (`src/world/levels/chapter8Town.js`).
* **Where the crew lives**: the chapter screen groups chapters by city. Chapters 1-7 are in Harbor City; from Chapter 8 to 12 the crew lives in Frostvale, a ski town in the mountains (the final car chase drives through its snowy streets: chalets with snow on the roofs, pine trees, snowbanks and mountains all round). Every few chapters they move on to a new city or country.
* **People**: everyone (you, the crew, guards, police, bounty hunters, prisoners, people on the street) has a rounded body, a face with eyes that blink, eyebrows, a nose and a mouth, hair, and clothes with details (hoodie pockets and drawstrings, jacket zips and collars, suits with a shirt and tie, uniforms with pockets, a badge, a radio and a duty belt, peaked caps). The crew each have their own look (Mags's grey bun and orange jacket, Theo's dealer suit, Ricky's spiky hair and green jacket, Juno's pink ski jacket and ponytail), and every passer-by is different (dressed for the snow in Frostvale). They walk with a proper walk cycle, run with their shoulders twisting, and shift their weight and look around while standing. Walking, running and sprinting are one gait that blends smoothly as they speed up (the stride rhythm grows with speed, so there's no jump between walking and running), and jumps and ledge climbs blend between their phases too. Each body part is one shared, recoloured mesh, so a whole crowd stays cheap to draw on phones. Code: `src/player/playerModel.js` (rig and animation), `src/player/bodyParts.js` (shapes), `src/player/people.js` (who wears what).
* **Vehicles**: the **Street Bike** (Your car > Car; quickest off the line and nimble, but light; free from Chapter 7 or buy it) leans into corners with you on it. Every third police unit is a **police motorbike**: quick, but one good knock puts it down. At 3 stars and up a **police helicopter** joins car chases: while you're in its searchlight the cops always know where you are, so outrun it on a straight or hide in a garage or under the railway (EMP and Signal Jammer blind it).
* **A livelier city** (the driving streets): people walk the pavements and jump clear when you drive at them (or dive out of the way and pick themselves up; honk and they look round). Cars are parked half up on the kerb (shove them about), **city buses** and **box trucks** lumber along in the traffic (slow and heavy: they shove you, not the other way round), and the pavements have fire hydrants (knock one over and it sprays water), bins, newspaper boxes and benches that go flying, and bus shelters with lit-up adverts. Steam rises from the drains in Harbor City. In Frostvale the people wear their winter coats and nothing is parked in the snowbanks. Everything is instanced or pooled near you, so it stays quick on phones (`src/world/streetLife.js`).
* **Better buildings and shop interiors**: every street has shops at ground level, in the driving cities and in the on-foot towns. Each has a proper shop front (glass panes, a door, a lit sign band, often a striped awning), and behind the glass there's a **room you can see into**: a grocery with aisles of shelves and fridges, a clothes shop with rails and a mirror, a cafe with a counter and a menu board, an electronics shop with a wall of screens, or a bar with bottles and a neon strip, with someone working inside. The rooms are drawn by an "interior mapping" shader (no real geometry), so they shift in perspective as you go past and cost almost nothing (`src/world/shopfronts.js`). Harbor City's buildings also have cornices and ledges, water tanks and air-con units on the roofs, and the towers have stepped crowns with an aerial and a red warning light; Frostvale's chalets have wooden balconies with snow on the rails.
* **Police and shops on foot** (Free Run):
  * **Wanted stars**: robbing a till, punching people or officers and pickpocketing raise your wanted level (shown in the top bar). More stars, more police on foot; at three stars the helicopter comes too. Stay out of sight and it drops a star at a time; at zero they give up (even with police off in the menu, crime brings them out).
  * **Smarter police on foot** (every mode with them): they have to *see* you (walls and windows block their view, 45 m at most). One sighting is radioed to all of them; lose them and they run to where you were last seen, then search round it. Climb a stairwell ladder and the nearest one waits at the door.
  * **Hide in the shops**: duck behind a counter and they can't see you (and the helicopter can't see into a shop or a stairwell).
  * **Alarms and shutters**: after a robbery the shopkeeper calls the police (another half star, and they know where you are for a while), and once you're out the metal shutters roll down: that shop's closed.
  * **Minimap and big map on foot** (Free Run and Rooftop Run): the same map as in the car, with the little shops (brown), parks and the stairwell doors (yellow); M or tap it for the big map and a waypoint.
* **Things to do** (Free Run on foot):
  * **Jobs**: three contacts stand round the city (a yellow "!" and an orange beam; yellow dots on the minimap). Walk up and press E: a courier run (pick up a package on a roof, drop it off), a shop snatch (rob one shop's till, get to the drop-off), a rooftop dash (three markers) or losing a tail (three stars: shake them all), each against the clock. $150-$250 (double with police on).
  * **Parkour challenges**: three courses round the roofs of a block (cyan beams; Frostvale: street sprints). Run into the start, then through every ring. Your best time is saved with a recording of the run, and next time its **ghost** races you.
  * **Shop counters**: at a till, E opens the counter: buy an espresso or an energy drink (run 15% faster for a minute), a hoodie and cap (a disguise: two stars off and they lose you), a burner phone (one star off), a tag finder app (crew tags on the minimap), a lucky charm (cash bags pay double), or rob the till.
  * **Stats and achievements** (title screen > Stats): distance on foot and driven, tills, pickpockets, police lost, most wanted, officers down, tags, jobs, challenges, things bought, cars stolen, distance on bikes, and 19 achievements that pay out once ($100-$1000).
  * **Rumble and vibration**: a gamepad rumbles, and a phone buzzes, on punches, big landings, crashes and getting caught (Settings > Vibration).
* **Getting around** (Free Run on foot):
  * **Steal a parked car**: cars are parked along the kerbs. Walk up to one and press E to break in and drive off in it (a little slower than your own car). The owner calls it in: half a star on foot, and two patrol cars come looking for it on the streets, even with police off, until you lose them (+$80).
  * **Bikes and e-scooters**: docks by the parks and on corners (blue and green dots on the minimap). E to ride (a bike is 85% faster than running, a scooter 55%), E again to get off. Climbing, ladders, zip lines and wall runs put it down.
  * **Your crew**: bring Mags, Theo or Ricky along (pause menu or the safehouse). They follow you down the streets and over the roofs (and catch up if they fall behind), and knock down police officers who get too close.
  * **The safehouse** (a green door with a sign and a green beam; green dot on the minimap): lay low (your wanted level goes) and save, the garage (your car), the wardrobe (your look), the gadget locker, who comes with you, and *Start here* (begin Free Run at the safehouse next time).
* **A living world** (Free Run):
  * **Pick the time and the weather** in the Free Run menu: *Day & night* (the clock runs, a full day every 12 minutes, and keeps going when you swap between walking and the car), or fixed Day / Dusk / Night; Clear / Rain / Storm / Fog (Frostvale: Snow / Blizzard / Fog / Clear).
  * **Puddles and wet streets**: in the rain, puddles on the ground round you reflect the sky and the lights, with rain rings rippling across them; the shiny wet roads and roofs now show on medium graphics too (low gets the puddles). Fog closes the city in.
  * **Busy and quiet hours**: the pavements and roads fill up at rush hour (7:30-9:30 and 16:30-18:30), with drivers stuck at the lights leaning on their horns, and empty out at night.
  * **Crew tags**: 25 hidden on each map (15 in Frostvale) on the hardest places to reach: tower tops, stairwell huts, upper roof levels, the tops of fire escapes, gazebo roofs. $25 each, $1000 for finding them all; they're remembered (Tags in the top bar).
* **A real city on foot** (Free Run, Rooftop Run and the story's city streets, Chapters 5 and 8-12): the blocks are now a mix of **apartments**, **shop blocks** and **parks**, and the Free Run city is bigger (7 x 7 blocks).
  * Shop blocks: a ring of small one-storey shops (a mini mart, a cafe, a clothes shop, a phone shop, a pawn shop) round a block of flats. **Walk in** through the door: shelves full of stock, a counter, lights. In Free Run you can **rob the till** (E) for cash; with the police on, the alarm brings the helicopter and the officers, but the helicopter can't see into a shop. Climb the ladder on a corner shop to the low roofs, then the **fire escape** up the flats.
  * Parks: grass, paths, hedges, trees, flower beds, benches, a fountain and a gazebo (hide under it; climb on it from the planter). Snowy pines in Frostvale.
  * Trees along every pavement, gardens on some roofs, and fire escapes (zig-zag landings) up the street side of many apartment blocks.
  * The driving city matches: rows of small shops (rooms behind the glass) round some blocks with the tall buildings behind, and trees along the kerbs (their trunks are solid).
  * **People everywhere**: a crowd walks every pavement and park path near you (they're moved, out of sight, to wherever you go, so the streets round you are always busy), and there's someone behind the counter of the shops you walk past (they watch you, and flinch when you rob the till). Walk along with people and the police on foot lose you in the crowd. In Free Run, Rooftop Run and the story's city streets (on top of each chapter's own crowd).
  * **Pick your map in Free Run** (the Free Run menu): **Downtown** (Harbor City, always open), **Old Town** (Harbor City's lower, greener streets: more parks and little shops, easy roofs; opens at Chapter 4) and **Frostvale** (the snowy ski town, played in the streets, with a snowy city to drive; opens at Chapter 8). Each map has a city on foot and one to drive, and T still swaps between them. `?mode=free&map=oldtown` (or `frostvale`, and `mode=freecar`) jumps straight in.
  * **Ladders are inside the buildings**: a doorway with a lamp over it leads into a little stairwell; the ladder goes up its back wall to an open hatch in the roof (and inside, the helicopter can't see you). Corner shops have theirs in the back by the storeroom. (A building with no room for a stairwell keeps its ladder on the wall.)
  * **One map in every mode**: Free Run, Rooftop Run, Street Chase and the story all use the same Harbor City and the same Frostvale (`src/world/maps.js`): on foot, Chapter 5's streets are the middle of downtown and Chapters 8-12 are the middle of Frostvale; every car chase drives the same streets, with only the part's own landmarks (a safehouse, a bank...) added. Parks are spread out evenly: never two next to each other.
  * **Sound**: the home screen has its own theme tune (a sneaky heist tune made of notes: plucked bass, a soft pad, a twinkling arpeggio and a lead line; it starts on your first click, since browsers only allow sound after one), and the fuzzy noise beds (rain hiss, wind, city rumble, nitro and tyre hiss) are turned well down.
  (`src/world/cityBlocks.js`)
* **Police on foot** in Free Run (police on) and in Rooftop Run (from wanted level 2): they come out of rooftop stairwells and street doorways, chase you over the roofs and down on the street, and come back out near your level if you climb up or drop down (`OfficerSquad` with `streets`).
* **Frostvale side jobs** (Free Run menu, once the crew reaches Frostvale in the story): quick jobs one after another for cash. Street races through checkpoints against the clock, smash and grabs (stop at the shop while the crew empties the till, then lose Sentinel on the way back to Pine Lodge), and hot deliveries to the lake airstrip on a timer. Pause > Skip this job for a different one (`src/states/modes/sideJobsMode.js`).
* **New cars** (Settings > Your car > Car): the Getaway Coupe (all-rounder), the Muscle Car (fastest on the straights, but it slides; free from Chapter 5) and the Rally Hatch (grips on snow and ice, turns on a coin; free from Chapter 9). Buy one early with cash. Each has its own shape and handling (`CAR_BODIES` in `src/vehicles/carColours.js`).
* **Story portraits**: in story scenes the speaker's face appears in a ring of their colour next to their name, drawn from their own 3D character (`src/ui/portraits.js`).
* **Cleaner HUD**: the objective sits on a soft dark panel with an amber edge, stats are small chips, pop-ups are compact cards in their message's colour, and the controls help hides behind menus.
* **Movable phone buttons**: Settings > *Move phone buttons* (on phones and tablets): drag the joystick and every button where you want them, pick Small / Normal / Big, Reset or Done. Saved on the device and kept when the screen turns (`TouchControls.editLayout`).
* **Music and sound**: the music follows where the crew lives: Harbor City plays the main track, Frostvale plays it slower and lower with soft bells. In a chase the music speeds up and a low pulsing tension layer comes in. On snow your footsteps crunch (`audio.setPlace`, `audio.surface`).
* **Falling down and getting up**: anyone punched out, tackled or knocked over topples over (backwards, or on their face when hit from behind, hands out to break the fall), bounces, lies there, then tucks their knees and pushes back up (`PlayerModel.knockDown`). Out-cold guards stay down.
* **Reactions**: sprint right past someone in the street and they flinch, hands up, look at you and step out of your way. A coin landing nearby makes people look at it. Guards hear you **running** close behind them: they stop, turn round to look (a **?**), and may well see you, so walk or crouch past them (`GuardSquad.update`, `Crowd.update`).
* **Your car** (pause menu while driving, or Settings): paint, stripes, wheel colour, spoiler, tinted windows and underglow. Changes show straight away on a live 3D preview beside the card (Your look has one too, with a close-up for your face; drag either to turn it). The underglow is neon tubes under the sills and bumpers plus a soft pool of light on the road that fades out from under the car (it shimmers a little and dims when you're in the air).
* **Cars**: every car is built from a real side profile (bumpers, bonnet, raked windscreen, roof, boot, wheel arches) with rounded edges, a glass cabin that narrows towards the roof, pillars, slanted headlights, a tail-light bar, grille, wing mirrors, door lines, side skirts, exhausts, number plates and wheels with tyres and rims (the front wheels steer). Your getaway car is a low coupe with a proper wing; traffic are saloons, taxis (checker band and roof sign) and vans; police cruisers are black and white with a gold star, a push bar and a light bar. Code: `src/vehicles/carModel.js`.
* **Brightness** (Settings > Graphics): 60% to 250%. Turn it up if night-time levels are too dark: it raises the exposure and, on medium/high graphics, lifts the darkest shadows. Changes show straight away and are saved.
* **Effect timers**: while a gadget's effect is running (a cloak, smoke, the box, a decoy, dazed police, a jammed radio, frozen or knocked-out cruisers, oil, spikes, new paint, blackout), a countdown with a shrinking bar shows just above the gadget badge, turning red in the last 3 seconds.
* **Hiding gadgets** (the Shop's new Hiding section): Cardboard Box (hidden while you stand still or creep), Chameleon Suit (invisible while walking, 12 s), Mirage Cloak (fully invisible, 7 s), Ninja Kit (passive: guards and patrols spot you from a quarter less far), Smoke Bomb, and for the car: Paint Shifter (new paint and plates, the police lose your trail) and Blackout Mode (lights off, only seen from close up).
* **Phones**: the game is played in landscape (turning a phone upright shows a "rotate your phone" message). Story scenes are a compact panel in the middle of the screen. Pop-up messages (clues, checkpoints, hints, alarms) appear small in the top-left corner, under the objective, never across the middle.
* **Casino heist mechanics** (Chapter 5): **guards** patrol with yellow vision cones (seen for a moment = back to the checkpoint; the Flashbang stuns them). **Crouch** (C, or hold Slide on a phone) behind card tables to hide from them. **Lasers**: some pulse on and off, some are low (jump or crouch-walk past). **Mini-games**: hacking (stop the cursor in the green zone) and safe-cracking (stop the needle on the notch); press Jump / Space or tap the panel, C to back out. The **alarm**: someone switches the cameras back on once you have the cash, the guards go on alert and the exit shutter opens: run for the garage. Gold chip stacks are bonus cash.
* **Heist planning board** (before the casino): pick a way in (Theo's staff door, Nova's roof vent straight into the security office but the guards start on alert, or Mags's front door already in disguise) and one thing to bring (easier mini-games, slower to be noticed, or 50% more time after the alarm). Change the plan every time you start the part.
* **Disguises**: a staff uniform (on a rail in the casino lounge, or from the front-door plan). In uniform, guards only notice you close up, or if you run or crouch, and cameras ignore you; it doesn't work in staff-only rooms (security office, vault corridor), and you lose it if you're caught.
* **Sneak takedowns**: walk up behind a guard or patrolling officer and press **E** (X on a gamepad, the Knock out button on a phone). They stay down, but if another one finds the body, they all go on alert (bigger cones, faster).
* **Hack the city** (driving, any mode with police): just after you drive through a junction, press **E** (X / the Hack button): its lights go red and bollards shoot up on every side except the way you left, stopping the police behind you for a few seconds. Recharges in about 20 s.
* **Time of day**: night, dawn, day or dusk, with the sky, sun, shadows, windows and street lamps to match (and cops see further in daylight). Story missions pick their own time; Settings → Time of day sets it for Rooftop Run, Street Chase and Free Run, including Random and Cycle (a whole day every 12 minutes).
* **Level Editor** (title screen): a "How it works" guide the first time (and on the ? button), then three steps: 1. paint buildings by dragging on the map (Rub out, Wall, Small, Medium, Tall, Huge, or More heights; big 3 x 3 brush or small), 2. place the Start, Finish, cash bags and zip lines (tap a tall building, then a lower one), plus the police chopper and the time of day, 3. Play it! Each building's height number is written on the map (you can climb onto a building one number higher; every building has a ladder from the street). A live checklist says whether the finish and every cash bag can be reached, and circles the ones that can't in red. Brush sizes 1x1 to 7x7. Floors: street, water (fall in and you're back on dry land), grass, sand, vault floor and casino carpet, and ocean all around the map to make an island. Parkour pieces: beams between buildings, ducts to slide under, crates, hideout huts and water towers (hide from the chopper), gold bars and waist-high lasers (crouch under). Glider pickups. Undo, Examples (Empty map, Rooftop run, The tower, Zip line city, Chopper chase, Vault break-in, Island hop, Surprise me), My levels (up to 12, with best times), and Share / load with a code (`GW1-...`) a friend pastes in. Code: `src/editor/`, `src/ui/levelEditor.js`.
* **Ghost mode** (story parts): press **G** (d-pad left on a gamepad, the Ghost button on the left edge of a touch screen, or the pause menu). The police, helicopter and officers vanish and the clock stops, so you can roam freely; on foot, a marker points at the nearest clue you haven't found. Nothing counts while it's on (no clues, checkpoints or finishing), and turning it off puts you back where you turned it on, with the police back on your case.
* **Ladders**: every building has a yellow ladder. Fall to the street and you're no longer sent back: walk into a ladder and hold forward to climb back up (a marker points to the nearest one). Only falling into the harbour sends you back.
* **Hiding spots**: on foot, stand in a stairwell hut or under a water tower (green floor patch) to hide from the helicopter and the officers. Driving, pull into a parking garage (blue P on the minimap): the cops can't see you from the street and lose you in a few seconds.
* **Safehouse**: you can pull in mid-chase as long as no cop can see you and none is within about a block.
* **Big map** (driving): press M or tap the minimap. Click anywhere to set a pink waypoint (shown on the minimap, as a light beam and an on-screen pointer).
* **Zoom**: scroll wheel (or pinch on a phone) zooms the camera, on foot and in the car.
* **Clues**: three per chapter, all on the route; two point at the traitor, one is a red herring (Chapter 5: two in the rooftop part, one in the casino). There are no clues in the car chases.
* **Gadget Shop** (title screen): five categories. Equip one active gadget for on foot and one for the car and press F to use it (LB on a gamepad, the Gadget button on a phone); the rest are always on once bought. Code: `src/gadgets/`.
  * Utility: Smoke Bomb, Holo-Decoy (foot), Signal Jammer (car), Money Clip (+25% cash).
  * Movement: Grapple Gun (foot; an orange ring shows where it'll pull you), Blink (foot; a cyan ring shows where you're aiming, up to 16 m, and you teleport there), Glider Wing (press jump again in mid-air and hold to glide), Spring Boots (higher jumps), Gecko Gloves (longer wall-runs).
  * Better gadgets: the Holo-Decoy runs off the way you're looking; the Flashbang stuns guards too; guards caught in a Smoke Bomb stop and cough; the Oil Slick leaves a trail of three puddles; the EMP also shorts out nearby roadblocks; the Signal Jammer stops roadblocks being called in.
  * Damage: Flashbang (foot: blinds helicopters, stuns officers), Oil Slick, Spike Drop, EMP Blast (car), Ram Plating (ramming spins cops out).
  * Getaways: Smoke Screen (car), Turbo Tank (more nitro), Garage Keycard (garages lose the cops in 1 second).
  * Mole: Clue Scanner, Clue Magnet (pick up clues from further away), Forensics Kit (Case Board marks red herrings), Lie Detector.
* **Crosshair**: on foot (aim the Grapple Gun with it). SPRINT shows under it while sprint is on.
* **Moves**: Shift switches sprint on (and off again); sprint + C to slide under low ducts (C while standing = crouch). Jump alongside a tall wall to wall-run. Jump into a zip-line cable to ride it, Fortnite-style: grab it anywhere (from either end), it takes you the way you're facing, even uphill; pull back (S) to turn round, jump to let go.
* **Case Board**: press Tab (or use the pause menu) during a chapter to review clues and suspects. Also on the chapter select screen and at the deduction. Missed a clue? Buy it there for $100: it counts for the deduction (and is kept), but not for your chapter rating.

## Project layout

```
src/
  main.js              boot, renderer, game loop, state machine setup
  style.css            HUD and menu styles
  core/                input, collision world, camera, save system, utils, state machine
  world/               rooftop city, street city, street life (people, parked cars, street furniture), shop fronts (rooms behind the glass), materials, lighting (times of day, sky, clouds, stars), atmosphere (reflections, light beams), weather, mesh batching
  editor/              Level Editor levels: share codes and building them
  player/              on-foot controller (parkour physics) and box-character model
  vehicles/            car physics, car models, traffic, particles, hacking junctions
  ai/                  helicopter, police, officers on foot, guards and street patrols (takedowns, blocking, hearing coins), crowds, fugitives, road graph, AI driving helpers
  ui/                  HUD, menus, minimap, mini-games (hacking / safe-cracking), heist planning board, Level Editor
  story/               chapter data (parts, story text, clues, verdicts), chapter flow, the crew
  world/levels/        hand-built story levels
  states/              title, on-foot state, driving state (+ shared PlayState base)
  states/modes/        Free Run (rooftops + car), Rooftop Run, Street Chase, the bank heist, the casino heist, the moving train, the prison breakout, chapter on-foot parts (+ crew meetings, street patrols), chapter driving parts, your own levels
reference/getaway.html the original single-file prototype (for reference only)
```

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
| `/?mode=chapter1` | Jump straight into Story Chapter 1 (also `chapter2` to `chapter5`) |
| `/?mode=speedrun` | Start a Chapter 1 speedrun |
| `/?mode=freecar` | Free Run, starting in the car |
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

**Graphics:** medium and high add post-processing (`src/world/postFx.js`): bloom so neon, lamps, headlights and windows glow, a vignette and a cool/warm colour grade. The sky is a gradient dome with a moon halo and storm clouds (`src/world/lighting.js`). Rain and thunderstorms (`src/world/weather.js`) add rain streaks, wet shiny roads and roofs that reflect the sky, lightning flashes and thunder. Low skips the post-processing for older laptops; phones start on medium.

**Audio:** recorded sounds in `public/audio` (see CREDITS.md), plus sounds synthesised with the Web Audio API.

## Publish on GitHub Pages

`.github/workflows/deploy.yml` builds the game and publishes it on every push.
One-time setup: in the repo go to **Settings > Pages > Build and deployment > Source** and pick **GitHub Actions**.
The game then lives at https://godo-bear.github.io/Getaway-game/ (progress is in the Actions tab).

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

* **Your cash**: set it to any amount, or add $1,000 / $10,000 / $100,000.
* **Abilities**: no gadget recharge, god mode (never caught, spotted out or busted), infinite nitro, super speed, infinite range (the Grapple Gun reaches any building you can see, EMP and Flashbang hit every cop, smoke hides you anywhere). With any ability on, Speedrun times aren't saved.
* **Admin gadgets** (free, in the Shop's Admin tab, and only while admin mode is on): Rocket Boots (jump again in mid-air, any number of times), Invisibility Cloak (15 s invisible), Police Freeze (every cruiser stuck for 10 s), Teleporter (beam the car to your waypoint or goal).
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
* **Free Run**: one session across both worlds. Roam the rooftops on foot (cash bags on the roofs), walk up to your car on the street (blue beams) to drive the city (cash drops, drifts, near misses), and slow down in a parking garage to head back up. Police are optional (a helicopter on the roofs, two patrol cars on the streets, double cash); getting caught just sends you back, it never ends the run. Switch worlds or police from the pause menu too.
* **Speedrun**: story parts back to back against the clock (any single chapter, or the whole story): no story scenes, no deductions, split times for every part, best times saved. The timer only runs while you're playing.
* **Cash**: Rooftop Run and Street Chase pay for cash bags/drops, losing the cops, and a tenth of your score; Free Run pays for everything you pick up.
* **Story: Chapter 1, Part 1 (the heist)**: inside the Harbor Trust bank. Kill the security cameras (their red cones catch you), find the vault code in the manager's office, open the vault, grab four pallets of cash, then beat the alarm to the roof stairs. Just run over a glowing ring to do each thing.
* **Story: Chapter 1, Part 2**: a hand-built rooftop route from the Harbor Trust bank roof to the getaway car on the Pier Street garage. Checkpoints, one police helicopter (caught = back to the last checkpoint), 4 clues (2 on the main path, 2 behind harder shortcuts), and a bronze/silver/gold rating.
* **Story: Chapter 1, Part 3**: drive the getaway car from the garage to the crew's safehouse (green light). You must lose the cops before you pull up, or you'd lead them straight there. A fifth clue is hidden in the park in the middle of town (amber dot on the minimap).
* **Story: Chapter 1, the deduction**: Your clues are pinned to a corkboard in the safehouse; accuse Vince, Marla, Dex or Det. Hale. The result explains how each clue fits (and which were red herrings) and gives your chapter rating. Solving it unlocks Chapter 2.
* **Story: Chapter 2, The Ferry**: chase Vince's car across town before he reaches the ferry terminal (heat 3-4, roadblocks and spike strips), then chase him on foot across the docks: warehouse roofs, container stacks, a wall-run, a duct to slide under and a zip line down to the pier.
* **Story: Chapter 3, Headquarters**: zip-line onto the police HQ roof, find Det. Hale's ledger while officers chase you out of the stairwells (and the helicopter joins later), zip down to the car, then race the clock to the last ferry through heat-5 roadblocks. The final deduction reveals who planned everything.
* **Story: Chapter 4, Last Flight**: a thunderstorm. Chase Marla's car through the wet streets to the rail yard by the airfield, then chase her on foot across the freight trains (crossing plates between tracks, a signal gantry to climb, hangar roofs and a zip line) before she reaches her plane. The deduction: who warned her you were coming?
* **Story: Chapter 5, The Lucky Star**: six months later, with a brand new crew and only **one** mole among them. Part 1: meet Nova (hacker), Mags (safecracker) and Theo (inside man) on three rooftops (follow the coloured beams; Nova and Mags test you first with a mini-game), then get down to Ricky (driver) and his car on the street. Part 2: rob the Lucky Star casino (see the new mechanics below). Part 3: drive the cash down the rainy Strip to Ricky's garage. The deduction only has the new crew as suspects.
* **Casino heist mechanics** (Chapter 5): **guards** patrol with yellow vision cones (seen for a moment = back to the checkpoint; the Flashbang stuns them). **Crouch** (C, or hold Slide on a phone) behind card tables to hide from them. **Lasers**: some pulse on and off, some are low (jump or crouch-walk past). **Mini-games**: hacking (stop the cursor in the green zone) and safe-cracking (stop the needle on the notch); press Jump / Space or tap the panel, C to back out. The **alarm**: someone switches the cameras back on once you have the cash, the guards go on alert and the exit shutter opens: run for the garage. Gold chip stacks are bonus cash.
* **Ghost mode** (story parts): press **G** (d-pad left on a gamepad, the Ghost button on the left edge of a touch screen, or the pause menu). The police, helicopter and officers vanish and the clock stops, so you can roam freely; on foot, a marker points at the nearest clue you haven't found. Nothing counts while it's on (no clues, checkpoints or finishing), and turning it off puts you back where you turned it on, with the police back on your case.
* **Ladders**: every building has a yellow ladder. Fall to the street and you're no longer sent back: walk into a ladder and hold forward to climb back up (a marker points to the nearest one). Only falling into the harbour sends you back.
* **Hiding spots**: on foot, stand in a stairwell hut or under a water tower (green floor patch) to hide from the helicopter and the officers. Driving, pull into a parking garage (blue P on the minimap): the cops can't see you from the street and lose you in a few seconds.
* **Safehouse**: you can pull in mid-chase as long as no cop can see you and none is within about a block.
* **Big map** (driving): press M or tap the minimap. Click anywhere to set a pink waypoint (shown on the minimap, as a light beam and an on-screen pointer).
* **Zoom**: scroll wheel (or pinch on a phone) zooms the camera, on foot and in the car.
* **Clues**: three per chapter, all on the route; two point at the traitor, one is a red herring (Chapter 5: two in the rooftop part, one in the casino). There are no clues in the car chases.
* **Gadget Shop** (title screen): five categories. Equip one active gadget for on foot and one for the car and press F to use it (LB on a gamepad, the Gadget button on a phone); the rest are always on once bought. Code: `src/gadgets/`.
  * Utility: Smoke Bomb, Holo-Decoy (foot), Signal Jammer (car), Money Clip (+25% cash).
  * Movement: Grapple Gun (foot), Glider Wing (press jump again in mid-air and hold to glide), Spring Boots (higher jumps), Gecko Gloves (longer wall-runs).
  * Damage: Flashbang (foot: blinds helicopters, stuns officers), Oil Slick, Spike Drop, EMP Blast (car), Ram Plating (ramming spins cops out).
  * Getaways: Smoke Screen (car), Turbo Tank (more nitro), Garage Keycard (garages lose the cops in 1 second).
  * Mole: Clue Scanner, Clue Magnet (pick up clues from further away), Forensics Kit (Case Board marks red herrings), Lie Detector.
* **Crosshair**: on foot (aim the Grapple Gun with it). SPRINT shows under it while sprint is on.
* **Moves**: Shift switches sprint on (and off again); sprint + C to slide under low ducts (C while standing = crouch). Jump alongside a tall wall to wall-run. Jump into a zip-line cable to ride it (it drops you at the far end).
* **Case Board**: press Tab (or use the pause menu) during a chapter to review clues and suspects. Also on the chapter select screen and at the deduction. Missed a clue? Buy it there for $100: it counts for the deduction (and is kept), but not for your chapter rating.

## Project layout

```
src/
  main.js              boot, renderer, game loop, state machine setup
  style.css            HUD and menu styles
  core/                input, collision world, camera, save system, utils, state machine
  world/               rooftop city, street city, materials, lighting, mesh batching
  player/              on-foot controller (parkour physics) and box-character model
  vehicles/            car physics, car models, traffic, particles
  ai/                  helicopter, police, officers on foot, casino guards, fugitives, road graph, AI driving helpers
  ui/                  HUD, menus, minimap, mini-games (hacking / safe-cracking)
  story/               chapter data (parts, story text, clues, verdicts), chapter flow, the crew
  world/levels/        hand-built story levels
  states/              title, on-foot state, driving state (+ shared PlayState base)
  states/modes/        Free Run (rooftops + car), Rooftop Run, Street Chase, the bank heist, the casino heist, chapter on-foot parts (+ crew meetings), chapter driving parts
reference/getaway.html the original single-file prototype (for reference only)
```

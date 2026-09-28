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
| `/?mode=chapter1` | Jump straight into Story Chapter 1 (also `chapter2`, `chapter3`) |
| `/?mode=chapter2&part=1` | Jump into a later part of a chapter (parts count from 0) |
| `/?mode=chapter3&ghost` | Jump into a chapter in clue-hunt (ghost) mode |
| `/?mode=drive1` | Jump straight into Story Chapter 1, Part 2 (the drive) |
| `/?mode=deduce1` | Jump straight into a deduction (also `deduce2`, `deduce3`) with whatever clues you've found |
| `/?mode=rooftop` | Jump straight into Rooftop Run (helicopter survival) |
| `/?mode=free` | Jump straight into Free Run (parkour practice) |
| `/?mode=chase` | Jump straight into Street Chase (driving survival) |
| `&nolock` | Play without mouse lock (A/D turn, drag to look) |

Press **F3** (or **`**) in game for an FPS / debug readout.

**Controls:** keyboard + mouse, any standard gamepad (Xbox layout: sticks, A jump/handbrake, RB nitro/sprint, RT/LT gas/brake, Y view, Menu pause; the d-pad and A/B drive menus), or touch (virtual joystick + buttons appear on the first touch). See *Controls* on the title screen.

**Settings** (title screen or pause menu): master/music/effects volume, look sensitivity, invert Y, first-person view, graphics quality (low / medium / high), getaway car colour (gold ratings unlock extra colours). Saved in the browser.

**Audio:** recorded sounds and voices in `public/audio` (see CREDITS.md), plus sounds synthesised with the Web Audio API.

## Modes

* **Rooftop Run**: endless parkour survival. Police helicopters hunt you with spotlights. Points tick up every second you're in the open; cash bags give bonuses. Every 30 s the wanted level rises (faster spotlights, more helicopters). Hide under water towers or inside stairwell huts to break line of sight.
* **Street Chase**: endless driving survival. Points for every second you stay free (more when fast or drifting). Heat rises every 35 s and when you ram cops. Shift = nitro (recharges while drifting, jumping and on near misses). Lose the cops by breaking line of sight; parks, alleys and driving under the elevated railway help. Once lost, the cops sweep a widening search area (red circle on the minimap). From heat 4, roadblocks and spike strips appear on the road ahead.
* **Free Run**: rooftops with no helicopters, for practising moves.
* **Story: Chapter 1, Part 1**: a hand-built rooftop route from the Harbor Trust bank to the getaway car on the Pier Street garage. Checkpoints, one police helicopter (caught = back to the last checkpoint), 4 clues (2 on the main path, 2 behind harder shortcuts), and a bronze/silver/gold rating.
* **Story: Chapter 1, Part 2**: drive the getaway car from the garage to the crew's safehouse (green light). You must lose the cops before you pull up, or you'd lead them straight there. A fifth clue is hidden in the park in the middle of town (amber dot on the minimap).
* **Story: Chapter 1, Part 3**: the deduction. Your clues are pinned to a corkboard in the safehouse; accuse Vince, Marla, Dex or Det. Hale. The result explains how each clue fits (and which were red herrings) and gives your chapter rating. Solving it unlocks Chapter 2.
* **Story: Chapter 2, The Ferry**: chase Vince's car across town before he reaches the ferry terminal (heat 3-4, roadblocks and spike strips), then chase him on foot across the docks: warehouse roofs, container stacks, a wall-run, a duct to slide under and a zip line down to the pier.
* **Story: Chapter 3, Headquarters**: zip-line onto the police HQ roof, find Det. Hale's ledger while officers chase you out of the stairwells (and the helicopter joins later), zip down to the car, then race the clock to the last ferry through heat-5 roadblocks. The final deduction reveals who planned everything.
* **Clue hunt (ghost mode)**: on the chapter's part screen. Replay any part with no police, no helicopter and no timer; an amber marker points at clues you haven't found. Clues found are saved and count in every later deduction.
* **Moves**: sprint + C (or Ctrl) to slide under low ducts (C while standing = crouch). Jump alongside a tall wall to wall-run. Jump into a zip-line cable to ride it (it drops you at the far end).
* **Case Board**: press Tab (or use the pause menu) during a chapter to review clues and suspects. Also on the chapter select screen.

## Project layout

```
src/
  main.js              boot, renderer, game loop, state machine setup
  style.css            HUD and menu styles
  core/                input, collision world, camera, save system, utils, state machine
  world/               rooftop city, street city, materials, lighting, mesh batching
  player/              on-foot controller (parkour physics) and box-character model
  vehicles/            car physics, car models, traffic, particles
  ai/                  helicopter, police, officers on foot, fugitives, road graph, AI driving helpers
  ui/                  HUD, menus, minimap
  story/               chapter data (parts, story text, clues, verdicts), chapter flow, the crew
  world/levels/        hand-built story levels
  states/              title, on-foot state, driving state (+ shared PlayState base)
  states/modes/        Free Run, Rooftop Run, Street Chase, chapter on-foot parts, chapter driving parts
reference/getaway.html the original single-file prototype (for reference only)
```

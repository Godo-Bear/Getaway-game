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
| `/?mode=chapter1` | Jump straight into Story Chapter 1 (rooftop escape) |
| `/?mode=drive1` | Jump straight into Story Chapter 1, Part 2 (the drive) |
| `/?mode=rooftop` | Jump straight into Rooftop Run (helicopter survival) |
| `/?mode=free` | Jump straight into Free Run (parkour practice) |
| `/?mode=chase` | Jump straight into Street Chase (driving survival) |
| `&nolock` | Play without mouse lock (A/D turn, drag to look) |

Press **F3** (or **`**) in game for an FPS / debug readout.

## Modes

* **Rooftop Run**: endless parkour survival. Police helicopters hunt you with spotlights. Points tick up every second you're in the open; cash bags give bonuses. Every 30 s the wanted level rises (faster spotlights, more helicopters). Hide under water towers or inside stairwell huts to break line of sight.
* **Street Chase**: endless driving survival. Points for every second you stay free (more when fast or drifting). Heat rises every 35 s and when you ram cops. Shift = nitro (recharges while drifting, jumping and on near misses). Lose the cops by breaking line of sight; parks and alleys help.
* **Free Run**: rooftops with no helicopters, for practising moves.
* **Story: Chapter 1, Part 1**: a hand-built rooftop route from the Harbor Trust bank to the getaway car on the Pier Street garage. Checkpoints, one police helicopter (caught = back to the last checkpoint), 4 clues (2 on the main path, 2 behind harder shortcuts), and a bronze/silver/gold rating.
* **Story: Chapter 1, Part 2**: drive the getaway car from the garage to the crew's safehouse (green light). You must lose the cops before you pull up, or you'd lead them straight there. A fifth clue is hidden in the park in the middle of town. Finishing shows your chapter rating (time, clues, times caught).

## Project layout

```
src/
  main.js              boot, renderer, game loop, state machine setup
  style.css            HUD and menu styles
  core/                input, collision world, camera, save system, utils, state machine
  world/               rooftop city, street city, materials, lighting, mesh batching
  player/              on-foot controller (parkour physics) and box-character model
  vehicles/            car physics, car models, traffic, particles
  ai/                  helicopter, police, road graph, AI driving helpers
  ui/                  HUD, menus, minimap
  story/               chapter data (intro text, clues), the crew
  world/levels/        hand-built story levels
  states/              title, on-foot state, driving state (+ shared PlayState base)
  states/modes/        Free Run, Rooftop Run, Chapter rooftops, Street Chase, Chapter drive
reference/getaway.html the original single-file prototype (for reference only)
```

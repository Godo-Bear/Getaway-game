import { decodeLevel } from './editor/customLevel.js';
import * as THREE from 'three';
import { Input } from './core/input.js';
import { StateMachine } from './core/stateMachine.js';
import { save } from './core/save.js';
import { Hud } from './ui/hud.js';
import { audio } from './core/audio.js';
import { TouchControls } from './ui/touch.js';
import { TitleState } from './states/titleState.js';
import { OnFootState } from './states/onFootState.js';
import { DrivingState } from './states/drivingState.js';
import { DeductionState } from './states/deductionState.js';
import { startPart } from './story/chapterFlow.js';
import { startSpeedrun } from './story/speedrun.js';
import { PostFx } from './world/postFx.js';
import { AutoQuality } from './core/autoQuality.js';
import { syncOnStart, cloud } from './core/cloud.js';
import { ABILITIES, admin } from './core/admin.js';
import { showLoader, hideLoader, loaderLabel, initLoader } from './ui/loader.js';

// ============================================================
//  GETAWAY - entry point
//  1. create the WebGL renderer
//  2. create shared systems (input, HUD, save data)
//  3. register the game modes (states) in a state machine
//  4. run the game loop: update the current state, then draw it
// ============================================================

function createRenderer() {
  try {
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    return renderer;
  } catch (err) {
    console.error(err);
    document.getElementById('webgl-error').hidden = false;
    document.getElementById('loader').hidden = true; // (don't hide the message)
    return null;
  }
}

// Highest pixel ratio per graphics setting. "Retina" screens have 2-3x as
// many pixels; drawing all of them (plus the glow effects) is what makes
// laptops lag, so we cap it.
const MAX_DPR = { low: 0.85, medium: 1, high: 1.5 };

const renderer = createRenderer();
if (renderer) start(renderer);

function start(renderer) {
  const settings = save.data.settings;
  // Pixel ratio: rendering at full "retina" resolution is very expensive.
  // Cap it depending on the graphics setting.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DPR[settings.graphics] ?? 1));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = settings.graphics !== 'low';
  document.getElementById('game').appendChild(renderer.domElement);

  // The "game" object is handed to every state so they can reach shared systems.
  const game = {
    renderer,
    settings,
    input: new Input(renderer.domElement),
    hud: new Hud(),
    sm: new StateMachine(),
    showDebug: false,
    fps: 60,
    dt: 1 / 60,
    post: new PostFx(renderer), // bloom, vignette, lightning (skipped on low graphics)
    goTitle: () => game.sm.change('title'),
    /** Apply settings that can change live (called by the settings screen). */
    applySettings: () => {
      const st = game.settings;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DPR[st.graphics] ?? 1));
      renderer.setSize(window.innerWidth, window.innerHeight);
      game.post.setQuality(st.graphics);
      game.post.brightness = st.brightness ?? 1;
      game.post.setSize(window.innerWidth, window.innerHeight);
      audio.setVolumes(st);
      game.sm.current?.applySettings?.();
    },
  };
  game.post.setQuality(settings.graphics);
  game.post.brightness = settings.brightness ?? 1;
  const autoQuality = new AutoQuality(game);
  audio.setVolumes(settings);
  game.touch = new TouchControls(game.input);
  game.audio = audio; // handy for debugging in the console

  // Browsers only allow sound after the first click/key/touch.
  const unlockAudio = () => audio.unlock();
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);
  // Menu button clicks
  document.addEventListener('click', (e) => {
    if (e.target.closest?.('.btn, .chip, .swatch')) audio.sfx('click', { vol: 0.6 });
  }, true);

  // Loading screen while a level is built (and during the first load, from index.html)
  game.sm.loader = { heavy: new Set(['onFoot', 'driving']), show: (name, p) => showLoader(loaderLabel(name, p)), hide: hideLoader };
  initLoader();

  game.sm
    .add('title', new TitleState(game))
    .add('onFoot', new OnFootState(game))
    .add('driving', new DrivingState(game))
    .add('deduction', new DeductionState(game));

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    game.post.setSize(window.innerWidth, window.innerHeight);
    game.sm.resize(window.innerWidth, window.innerHeight);
  });

  // Handy for debugging in the browser console: window.game
  window.game = game;

  // URL options for testing:
  //   ?mode=chapter1..chapter6 [&part=N] [&ghost]  - a story part (N from 0)
  //   ?mode=deduce1..deduce5 | rooftop | free | chase  - jump straight into a mode
  //   ?mode=editor [&level=GW1-...]  - the Level Editor (optionally with a level code)
  //   ?nolock                       - play without mouse lock (A/D turn, drag to look)
  const params = new URLSearchParams(location.search);
  if (params.has('nolock')) game.input.pointerLockFailed = game.input.lockDisabled = true;
  const mode = params.get('mode');
  // Story: ?mode=chapter2&part=1&ghost  (part is 0-based)
  const story = /^chapter(\d)$/.exec(mode || '');
  if (story) startPart(game, mode, Number(params.get('part') || 0), { ghost: params.has('ghost'), fresh: true });
  else if (mode === 'rooftop') game.sm.change('onFoot', { mode: 'survival' });
  else if (mode === 'free') game.sm.change('onFoot', { mode: 'free' });
  else if (mode === 'freecar') game.sm.change('driving', { mode: 'free' });
  else if (mode === 'speedrun') startSpeedrun(game, 'chapter1');
  else if (mode === 'chase') game.sm.change('driving', { mode: 'survival' });
  else if (mode === 'drive1') startPart(game, 'chapter1', 2, { fresh: true });
  else if (/^deduce\d$/.test(mode || '')) game.sm.change('deduction', { chapterId: `chapter${mode.slice(-1)}` });
  else if (mode === 'editor') game.sm.change('title', { editor: decodeLevel(params.get('level') || '') || null });
  else game.sm.change('title');
  // (the first load: hide the loading screen once the title is drawn; a level hides it itself)
  if (!game.sm.pending) requestAnimationFrame(() => requestAnimationFrame(hideLoader));

  // Signed in? Fetch the online save (in case you played on another device)
  // and redraw the title screen if it changed.
  syncOnStart(() => { if (game.sm.currentName === 'title') game.sm.change('title'); });
  // An admin set your cash: say so (and refresh the title screen's cash).
  cloud.onGrant((kind, value) => {
    if (kind === 'cash') game.hud.toast('Cash updated', `An admin set your cash to $${value.toLocaleString('en-US')}.`, 'var(--safe)', 5);
    else {
      const names = ABILITIES.filter((a) => value[a.id]).map((a) => a.name);
      game.hud.toast(names.length ? 'An admin gave you abilities' : 'Abilities removed', names.length ? names.join(', ') : 'An admin took your special abilities away.', '#ff9be8', 6);
      game.applySettings();
    }
    if (game.sm.currentName === 'title' && document.getElementById('overlay').classList.contains('title')) game.sm.change('title');
  });

  // ---------------- Game loop ----------------
  let last = performance.now();
  function frame(now) {
    // dt = seconds since last frame. Clamp it so a hiccup (tab switch,
    // slow frame) doesn't make things jump through walls.
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    game.fps = game.fps * 0.95 + (1 / Math.max(dt, 1e-4)) * 0.05;
    game.dt = admin.flag('slowMo') ? dt * 0.5 : dt; // (admin: Slow motion)

    game.input.poll(dt);
    game.touch.setMode(game.sm.currentName === 'onFoot' ? 'onFoot' : game.sm.currentName === 'driving' ? 'driving' : 'none');
    game.sm.update(game.dt);
    game.sm.render(renderer);
    autoQuality.update(dt);
    game.input.endFrame();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

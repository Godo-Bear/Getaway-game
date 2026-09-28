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
    return null;
  }
}

const renderer = createRenderer();
if (renderer) start(renderer);

function start(renderer) {
  const settings = save.data.settings;
  // Pixel ratio: rendering at full "retina" resolution is very expensive.
  // Cap it depending on the graphics setting.
  const maxDpr = { low: 1, medium: 1.25, high: 1.75 }[settings.graphics] ?? 1.5;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
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
    goTitle: () => game.sm.change('title'),
    /** Apply settings that can change live (called by the settings screen). */
    applySettings: () => {
      const st = game.settings;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, { low: 1, medium: 1.25, high: 1.75 }[st.graphics] ?? 1.5));
      renderer.setSize(window.innerWidth, window.innerHeight);
      audio.setVolumes(st);
      game.sm.current?.applySettings?.();
    },
  };
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

  game.sm
    .add('title', new TitleState(game))
    .add('onFoot', new OnFootState(game))
    .add('driving', new DrivingState(game))
    .add('deduction', new DeductionState(game));

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    game.sm.resize(window.innerWidth, window.innerHeight);
  });

  // Handy for debugging in the browser console: window.game
  window.game = game;

  // URL options for testing:
  //   ?mode=chapter1 | drive1 | deduce1 | rooftop | free | chase  - jump straight into a mode
  //   ?nolock                       - play without mouse lock (A/D turn, drag to look)
  const params = new URLSearchParams(location.search);
  if (params.has('nolock')) game.input.pointerLockFailed = game.input.lockDisabled = true;
  const mode = params.get('mode');
  if (mode === 'chapter1') game.sm.change('onFoot', { mode: 'chapter1' });
  else if (mode === 'rooftop') game.sm.change('onFoot', { mode: 'survival' });
  else if (mode === 'free') game.sm.change('onFoot', { mode: 'free' });
  else if (mode === 'chase') game.sm.change('driving', { mode: 'survival' });
  else if (mode === 'drive1') game.sm.change('driving', { mode: 'chapter1' });
  else if (mode === 'deduce1') game.sm.change('deduction', { chapterId: 'chapter1' });
  else game.sm.change('title');

  // ---------------- Game loop ----------------
  let last = performance.now();
  function frame(now) {
    // dt = seconds since last frame. Clamp it so a hiccup (tab switch,
    // slow frame) doesn't make things jump through walls.
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    game.fps = game.fps * 0.95 + (1 / Math.max(dt, 1e-4)) * 0.05;

    game.input.poll(dt);
    game.touch.setMode(game.sm.currentName === 'onFoot' ? 'onFoot' : game.sm.currentName === 'driving' ? 'driving' : 'none');
    game.sm.update(dt);
    game.sm.render(renderer);
    game.input.endFrame();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

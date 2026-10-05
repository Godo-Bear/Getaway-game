// Loading screen: the neon GETAWAY sign over the title's rainy city, what's
// loading, a progress bar with a little getaway car driving along it, and a
// gameplay tip that changes every few seconds. It's in index.html, so it shows
// straight away while the game downloads; the state machine shows it again
// while a level is being built (core/stateMachine.js).

import { CHAPTERS } from '../story/chapters.js';

const TIPS = [
  'Crouch (C) or slide under the low lasers.',
  'Flashing lasers switch off every few seconds. They flicker just before they come back on.',
  'Sneak up behind a guard and press E to knock them out.',
  'If one guard sees you, they all come looking. Break line of sight and hide for 8 seconds.',
  'In daylight, change into everyday clothes (pause, then Your look): the police notice you later.',
  'Walk right next to people to blend into a crowd.',
  'Smoke bombs, cloaks and the cardboard box hide you from the police. Find them in the Shop.',
  'While driving, hack a junction (E) to block the cops behind you.',
  'Shift drifts, Space fires the nitro. Drifting refills it.',
  'Lose the cops before you pull into the safehouse, or you lead them straight there.',
  'Jump at a ledge to climb it. Jump alongside a tall wall to wall-run.',
  'Zip lines go both ways: hold S to turn round on the cable.',
  'Too dark at night? Turn up Brightness in Settings.',
  'In Free Run, press T (or Get in a car) to jump straight into your car.',
  'Press G in a story part for ghost mode: look around with no police.',
  'Gold ratings unlock new car paint.',
  'Settings, then Your car: stripes, wheels, spoiler and underglow.',
  'A guard uniform is a disguise: walk, don\'t run, and they only notice you up close.',
  'Gadget effects show a countdown above the gadget button.',
  'Searchlights can\'t see you behind crates, walls or buses.',
];

const MIN_TIME = 450; // ms, so it never just flashes

const $ = (id) => document.getElementById(id);
let tipTimer = null, barTimer = null, shownAt = 0, progress = 0, tipIndex = Math.floor(Math.random() * TIPS.length);

function setBar(p) {
  progress = p;
  const fill = $('ld-fill');
  if (fill) fill.style.width = `${p.toFixed(1)}%`;
  const car = document.querySelector('#loader .ld-car');
  if (car) car.style.left = `${p.toFixed(1)}%`;
}

function nextTip() {
  const el = $('ld-tip');
  if (!el) return;
  tipIndex = (tipIndex + 1) % TIPS.length;
  el.classList.add('swap');
  setTimeout(() => { el.textContent = TIPS[tipIndex]; el.classList.remove('swap'); }, 220);
}

function start() {
  clearInterval(tipTimer);
  clearInterval(barTimer);
  tipTimer = setInterval(nextTip, 3800);
  // The bar eases towards 92% while we wait, then jumps to the end when it's ready
  barTimer = setInterval(() => setBar(progress + (92 - progress) * 0.07), 60);
}

/** What's loading, for the label: a chapter part, Free Run... */
export function loaderLabel(name, params = {}) {
  const ch = params.chapterId && CHAPTERS[params.chapterId];
  if (ch) {
    const part = ch.parts[params.part || 0];
    return { kicker: `Chapter ${ch.number} · ${ch.short}`, title: part?.title || ch.short };
  }
  if (params.mode === 'free') return { kicker: 'Free Run', title: name === 'driving' ? 'Driving the city' : 'Up on the rooftops' };
  if (params.mode === 'survival') return { kicker: name === 'driving' ? 'Street Chase' : 'Rooftop Run', title: 'Lose the cops' };
  if (params.mode === 'jobs') return { kicker: 'Frostvale', title: 'Side jobs' };
  if (params.mode === 'custom') return { kicker: 'Level Editor', title: 'Your level' };
  return { kicker: 'Loading', title: 'Getting the crew together…' };
}

/** Show the loading screen (for a level that's about to be built). */
export function showLoader({ kicker, title } = {}) {
  const el = $('loader');
  if (!el) return;
  if (kicker) $('ld-kicker').textContent = kicker;
  if (title) $('ld-title').textContent = title;
  $('ld-tip').textContent = TIPS[tipIndex];
  el.classList.remove('fade');
  el.hidden = false;
  shownAt = performance.now();
  setBar(4);
  start();
}

/** Finish the bar and fade the loading screen out. */
export function hideLoader() {
  const el = $('loader');
  if (!el || el.hidden) return;
  clearInterval(barTimer);
  setBar(100);
  const wait = Math.max(0, MIN_TIME - (performance.now() - shownAt));
  setTimeout(() => {
    el.classList.add('fade');
    setTimeout(() => { el.hidden = true; el.classList.remove('fade'); clearInterval(tipTimer); }, 320);
  }, wait + 120);
}

/** The first load: the screen is already showing (it's in index.html). */
export function initLoader() {
  shownAt = 0; // (counts from when the page started loading)
  setBar(progress || 8);
  start();
}

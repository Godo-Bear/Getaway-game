// Settings screen: volume, controls, graphics and car colour.
// Every change is applied straight away and saved to localStorage.

import { showCard, hideCard } from './menus.js';
import { save } from '../core/save.js';
import { showLookEditor, showGarage } from './customise.js';
import { currentLook } from '../player/outfits.js';
import { adminSettingsHtml, bindAdminSettings, showAdminPanel } from './adminPanel.js';
import { difficultyPickerHtml, bindDifficultyPicker } from './difficultyPicker.js';

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

/**
 * @param {object} game - needs game.settings and game.applySettings()
 * @param {Function} onBack
 */
export function showSettings(game, onBack) {
  const s = game.settings;
  const slider = (id, label, value, min, max, step, fmt) => `
    <label class="setting" for="${id}"><span>${label}</span>
      <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}">
      <output id="${id}-out">${fmt(value)}</output></label>`;
  const pct = (v) => `${Math.round(v * 100)}%`;
  const touchy = game.input.touchMode || window.matchMedia?.('(pointer: coarse)').matches;
  showCard(`
    <h2>Settings</h2>
    <p class="sub setting-head">Difficulty</p>
    ${difficultyPickerHtml()}
    <p class="sub setting-head">Sound</p>
    ${slider('set-master', 'Master volume', s.masterVolume, 0, 1, 0.05, pct)}
    ${slider('set-music', 'Music', s.musicVolume, 0, 1, 0.05, pct)}
    ${slider('set-sfx', 'Sound effects', s.sfxVolume, 0, 1, 0.05, pct)}
    <p class="sub setting-head">Controls</p>
    ${slider('set-sens', 'Mouse / look sensitivity', s.mouseSensitivity, 0.3, 2.5, 0.05, (v) => `${Number(v).toFixed(2)}x`)}
    <label class="setting check" for="set-invert"><span>Invert look up/down</span><input type="checkbox" id="set-invert" ${s.invertY ? 'checked' : ''}></label>
    <label class="setting check" for="set-fp"><span>First-person view on foot (V)</span><input type="checkbox" id="set-fp" ${s.firstPerson ? 'checked' : ''}></label>
    <label class="setting check" for="set-vib"><span>Vibration (gamepad rumble, phone buzz on hits and crashes)</span><input type="checkbox" id="set-vib" ${s.vibration !== false ? 'checked' : ''}></label>
    <label class="setting check" for="set-sprint"><span>Sprint stays on (press sprint once to switch it on or off)</span><input type="checkbox" id="set-sprint" ${s.sprintToggle !== false ? 'checked' : ''}></label>
    <label class="setting check" for="set-cross"><span>Crosshair on foot</span><input type="checkbox" id="set-cross" ${s.crosshair !== false ? 'checked' : ''}></label>
    ${touchy ? `<div class="seg wrap"><button class="chip cz-open" id="set-touch">Move phone buttons</button></div>
    <p class="sub" style="font-size:14px">Drag the joystick and buttons to where your thumbs want them, and make them smaller or bigger.</p>` : ''}
    <p class="sub setting-head">Graphics</p>
    ${slider('set-bright', 'Brightness', s.brightness ?? 1, 0.6, 2.5, 0.05, pct)}
    <p class="sub" style="font-size:14px">Turn it up if night-time levels are too dark to see.</p>
    <div class="setting"><span>Quality</span><div class="seg" id="set-quality">
      ${['low', 'medium', 'high'].map((q) => `<button class="chip${s.graphics === q ? ' on' : ''}" data-q="${q}">${q}</button>`).join('')}
    </div></div>
    <label class="setting check" for="set-auto"><span>Lower graphics automatically if the game is slow</span><input type="checkbox" id="set-auto" ${s.autoGraphics !== false ? 'checked' : ''}></label>
    <p class="sub" style="font-size:14px">Low: no shadows, no glow effects, lower resolution, less traffic (best for older laptops). Medium and High add glowing lights (bloom). Shadow changes apply when the next level loads.</p>
    <div class="setting"><span>Weather</span><div class="seg" id="set-weather">
      ${[['auto', 'story'], ['rain', 'rain'], ['off', 'off']].map(([v, l]) => `<button class="chip${(s.weather || 'auto') === v ? ' on' : ''}" data-w="${v}">${l}</button>`).join('')}
    </div></div>
    <p class="sub" style="font-size:14px">Story: storms where the story has them. Rain: rain in every mode. Off: always clear. Applies when the next level loads.</p>
    <div class="setting"><span>Time of day</span><div class="seg wrap" id="set-time">
      ${[['night', 'night'], ['dawn', 'dawn'], ['day', 'day'], ['dusk', 'dusk'], ['random', 'random'], ['cycle', 'cycle']].map(([v, l]) => `<button class="chip${(s.timeOfDay || 'night') === v ? ' on' : ''}" data-t="${v}">${l}</button>`).join('')}
    </div></div>
    <p class="sub" style="font-size:14px">For Rooftop Run, Street Chase and Free Run (story missions and your own levels pick their own time). Cycle: a whole day passes every 12 minutes.</p>
    <p class="sub setting-head">Customise</p>
    <div class="seg wrap"><button class="chip cz-open" id="set-look">Your look</button><button class="chip cz-open" id="set-car">Your car</button></div>
    <p class="sub" style="font-size:14px">Mix and match your clothes, and your getaway car's paint, stripes, wheels, spoiler, windows and underglow.</p>
    ${adminSettingsHtml()}`,
  [{ label: 'Done', primary: true, onClick: onBack }]);

  const apply = () => { save.write(); game.applySettings(); };
  const again = () => showSettings(game, onBack);
  bindDifficultyPicker();
  bindAdminSettings(again, () => showAdminPanel(() => { game.applySettings(); again(); }));
  const bindSlider = (id, key, fmt) => {
    const el = document.getElementById(id), out = document.getElementById(`${id}-out`);
    el.addEventListener('input', () => { s[key] = Number(el.value); out.textContent = fmt(s[key]); apply(); });
  };
  document.getElementById('set-touch')?.addEventListener('click', () => { hideCard(); game.touch.editLayout(again); });
  bindSlider('set-master', 'masterVolume', pct);
  bindSlider('set-music', 'musicVolume', pct);
  bindSlider('set-bright', 'brightness', pct);
  bindSlider('set-sfx', 'sfxVolume', pct);
  bindSlider('set-sens', 'mouseSensitivity', (v) => `${Number(v).toFixed(2)}x`);
  document.getElementById('set-invert').addEventListener('change', (e) => { s.invertY = e.target.checked; apply(); });
  document.getElementById('set-auto').addEventListener('change', (e) => { s.autoGraphics = e.target.checked; apply(); });
  document.getElementById('set-fp').addEventListener('change', (e) => { s.firstPerson = e.target.checked; apply(); });
  document.getElementById('set-sprint').addEventListener('change', (e) => { s.sprintToggle = e.target.checked; apply(); });
  document.getElementById('set-vib').addEventListener('change', (e) => { s.vibration = e.target.checked; apply(); });
  document.getElementById('set-cross').addEventListener('change', (e) => { s.crosshair = e.target.checked; apply(); });
  for (const b of document.querySelectorAll('#set-quality [data-q]')) {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      s.graphics = b.dataset.q;
      document.querySelectorAll('#set-quality [data-q]').forEach((x) => x.classList.toggle('on', x === b));
      apply();
    });
  }
  for (const b of document.querySelectorAll('#set-weather [data-w]')) {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      s.weather = b.dataset.w;
      document.querySelectorAll('#set-weather [data-w]').forEach((x) => x.classList.toggle('on', x === b));
      apply();
    });
  }
  for (const b of document.querySelectorAll('#set-time [data-t]')) {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      s.timeOfDay = b.dataset.t;
      document.querySelectorAll('#set-time [data-t]').forEach((x) => x.classList.toggle('on', x === b));
      apply();
    });
  }
  const reopen = () => showSettings(game, onBack);
  document.getElementById('set-look').addEventListener('click', (e) => { e.stopPropagation(); showLookEditor(game, reopen, () => game.sm.current?.model?.setLook(currentLook(s))); });
  document.getElementById('set-car').addEventListener('click', (e) => { e.stopPropagation(); showGarage(game, reopen, () => game.sm.current?.rebuildCar?.()); });
}

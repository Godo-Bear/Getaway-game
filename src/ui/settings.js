// Settings screen: volume, controls, graphics and car colour.
// Every change is applied straight away and saved to localStorage.

import { showCard } from './menus.js';
import { save } from '../core/save.js';
import { CAR_COLOURS, isColourUnlocked } from '../vehicles/carColours.js';

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
  const colours = CAR_COLOURS.map((c) => {
    const unlocked = isColourUnlocked(c);
    return `<button class="swatch${s.carColour === c.id ? ' on' : ''}" data-colour="${c.id}" ${unlocked ? '' : 'disabled'}
      style="background:${hex(c.hex)}" title="${c.name}${unlocked ? '' : ` (locked: ${c.unlock})`}" aria-label="${c.name}"></button>`;
  }).join('');

  showCard(`
    <h2>Settings</h2>
    <p class="sub setting-head">Sound</p>
    ${slider('set-master', 'Master volume', s.masterVolume, 0, 1, 0.05, pct)}
    ${slider('set-music', 'Music', s.musicVolume, 0, 1, 0.05, pct)}
    ${slider('set-sfx', 'Sound effects', s.sfxVolume, 0, 1, 0.05, pct)}
    <p class="sub setting-head">Controls</p>
    ${slider('set-sens', 'Mouse / look sensitivity', s.mouseSensitivity, 0.3, 2.5, 0.05, (v) => `${Number(v).toFixed(2)}x`)}
    <label class="setting check" for="set-invert"><span>Invert look up/down</span><input type="checkbox" id="set-invert" ${s.invertY ? 'checked' : ''}></label>
    <label class="setting check" for="set-fp"><span>First-person view on foot (V)</span><input type="checkbox" id="set-fp" ${s.firstPerson ? 'checked' : ''}></label>
    <label class="setting check" for="set-sprint"><span>Sprint stays on (press sprint once to switch it on or off)</span><input type="checkbox" id="set-sprint" ${s.sprintToggle !== false ? 'checked' : ''}></label>
    <label class="setting check" for="set-cross"><span>Crosshair on foot</span><input type="checkbox" id="set-cross" ${s.crosshair !== false ? 'checked' : ''}></label>
    <p class="sub setting-head">Graphics</p>
    <div class="setting"><span>Quality</span><div class="seg" id="set-quality">
      ${['low', 'medium', 'high'].map((q) => `<button class="chip${s.graphics === q ? ' on' : ''}" data-q="${q}">${q}</button>`).join('')}
    </div></div>
    <label class="setting check" for="set-auto"><span>Lower graphics automatically if the game is slow</span><input type="checkbox" id="set-auto" ${s.autoGraphics !== false ? 'checked' : ''}></label>
    <p class="sub" style="font-size:14px">Low: no shadows, no glow effects, lower resolution, less traffic (best for older laptops). Medium and High add glowing lights (bloom). Shadow changes apply when the next level loads.</p>
    <div class="setting"><span>Weather</span><div class="seg" id="set-weather">
      ${[['auto', 'story'], ['rain', 'rain'], ['off', 'off']].map(([v, l]) => `<button class="chip${(s.weather || 'auto') === v ? ' on' : ''}" data-w="${v}">${l}</button>`).join('')}
    </div></div>
    <p class="sub" style="font-size:14px">Story: storms where the story has them. Rain: rain in every mode. Off: always clear. Applies when the next level loads.</p>
    <p class="sub setting-head">Getaway car</p>
    <div class="swatches">${colours}</div>
    <p class="sub" id="set-colour-name" style="font-size:14px"></p>`,
  [{ label: 'Done', primary: true, onClick: onBack }]);

  const apply = () => { save.write(); game.applySettings(); };
  const bindSlider = (id, key, fmt) => {
    const el = document.getElementById(id), out = document.getElementById(`${id}-out`);
    el.addEventListener('input', () => { s[key] = Number(el.value); out.textContent = fmt(s[key]); apply(); });
  };
  bindSlider('set-master', 'masterVolume', pct);
  bindSlider('set-music', 'musicVolume', pct);
  bindSlider('set-sfx', 'sfxVolume', pct);
  bindSlider('set-sens', 'mouseSensitivity', (v) => `${Number(v).toFixed(2)}x`);
  document.getElementById('set-invert').addEventListener('change', (e) => { s.invertY = e.target.checked; apply(); });
  document.getElementById('set-auto').addEventListener('change', (e) => { s.autoGraphics = e.target.checked; apply(); });
  document.getElementById('set-fp').addEventListener('change', (e) => { s.firstPerson = e.target.checked; apply(); });
  document.getElementById('set-sprint').addEventListener('change', (e) => { s.sprintToggle = e.target.checked; apply(); });
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
  const nameEl = document.getElementById('set-colour-name');
  const showName = (c) => { nameEl.textContent = c ? `${c.name}${isColourUnlocked(c) ? '' : ` - locked: ${c.unlock}`}` : ''; };
  showName(CAR_COLOURS.find((c) => c.id === s.carColour) || CAR_COLOURS[0]);
  for (const b of document.querySelectorAll('.swatch')) {
    const c = CAR_COLOURS.find((x) => x.id === b.dataset.colour);
    b.addEventListener('mouseenter', () => showName(c));
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      s.carColour = c.id;
      document.querySelectorAll('.swatch').forEach((x) => x.classList.toggle('on', x === b));
      showName(c);
      apply();
    });
  }
}

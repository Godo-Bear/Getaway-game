// Customise screens: Your look (mix and match your face, hair and clothes) and Your car
// (paint, stripes, rims, spoiler, windows, underglow). Both save to your
// settings straight away and call onChange so the game can show it live.

import { showCard } from './menus.js';
import { save } from '../core/save.js';
import { audio } from '../core/audio.js';
import { OUTFITS, PALETTE, SKINS, FACES, HAIRS, HAIR_COLOURS, BEARDS, HATS, TOPS, currentLook } from '../player/outfits.js';
import { CAR_COLOURS, CAR_PARTS, isColourUnlocked } from '../vehicles/carColours.js';

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
const swatch = (attr, value, on, color, title) =>
  `<button class="swatch sm${on ? ' on' : ''}" data-${attr}="${value}" style="background:${color}" title="${title}" aria-label="${title}"></button>`;
const none = (attr, on, label = 'none') => `<button class="chip cz-none${on ? ' on' : ''}" data-${attr}="none">${label}</button>`;
const row = (label, inner) => `<div class="cz-row"><span class="cz-label">${label}</span><div class="cz-opts">${inner}</div></div>`;

/** Keep the card where it was scrolled to when it redraws. */
function redraw(fn) {
  const card = document.getElementById('card');
  const top = card.scrollTop;
  fn();
  card.scrollTop = top;
}

function bind(attr, fn) {
  for (const b of document.querySelectorAll(`#card [data-${attr}]`)) {
    b.addEventListener('click', (e) => { e.stopPropagation(); audio.sfx('click', { vol: 0.6 }); fn(b.dataset[attr.replace(/-(\w)/g, (_, c) => c.toUpperCase())]); });
  }
}

// ----------------------------------------------------------------------
/** Your look. onChange(look) lets the game update your character live. */
export function showLookEditor(game, onBack, onChange = () => {}) {
  const s = game.settings;
  const look = currentLook(s);
  const set = (k, v) => {
    s.look = { ...currentLook(s), [k]: v };
    delete s.outfit;
    save.write();
    onChange(s.look);
    redraw(() => showLookEditor(game, onBack, onChange));
  };
  const colours = (attr, cur, withNone) =>
    (withNone ? none(attr, cur == null) : '') + PALETTE.map((c) => swatch(attr, c, cur === c, hex(c), hex(c))).join('');
  const chips = (attr, list, cur) => list.map((o) => `<button class="chip${(cur ?? null) === o.id ? ' on' : ''}" data-${attr}="${o.id ?? 'none'}">${o.name}</button>`).join('');

  showCard(`
    <p class="sub kicker">Wardrobe</p><h2>Your look</h2>
    <p class="sub cz-note">Mix and match. In daylight a balaclava gets noticed: with your face showing, police and bounty hunters on the street only recognise you up close.</p>
    ${row('Start from', OUTFITS.map((o) => `<button class="chip" data-preset="${o.id}" title="${o.text}">${o.name}</button>`).join(''))}
    ${row('Face', chips('face', FACES, look.face))}
    ${row('Skin', SKINS.map((c) => swatch('skin', c, look.skin === c, hex(c), 'Skin tone')).join(''))}
    ${row('Hair', chips('hair', HAIRS, look.hair))}
    ${row('Hair colour', HAIR_COLOURS.map((c) => swatch('hair-colour', c, look.hairColour === c, hex(c), 'Hair colour')).join(''))}
    ${row('Beard', chips('beard', BEARDS, look.beard))}
    ${row('Hat', chips('hat-style', HATS, look.hat == null ? null : look.hatStyle))}
    ${look.hat == null ? '' : row('Hat colour', colours('hat', look.hat))}
    ${row('Top', chips('top-style', TOPS, look.topStyle))}
    ${row('Top colour', colours('top', look.top))}
    ${row('Trousers', colours('legs', look.legs))}
    ${row('Shoes', colours('shoes', look.shoes))}
    ${row('Gloves', colours('gloves', look.gloves, true))}
    ${row('Cash bag', `<button class="chip${look.bag ? ' on' : ''}" data-bag="1">On your back</button><button class="chip${look.bag ? '' : ' on'}" data-bag="0">No bag</button>`)}`,
  [{ label: 'Done', primary: true, onClick: onBack }], { side: true });

  bind('preset', (id) => {
    s.look = { ...OUTFITS.find((o) => o.id === id).look };
    save.write();
    onChange(s.look);
    redraw(() => showLookEditor(game, onBack, onChange));
  });
  bind('face', (v) => set('face', v));
  bind('skin', (v) => set('skin', Number(v)));
  bind('hair', (v) => set('hair', v));
  bind('hair-colour', (v) => set('hairColour', Number(v)));
  bind('beard', (v) => set('beard', v === 'none' ? null : v));
  bind('top-style', (v) => set('topStyle', v));
  bind('hat-style', (v) => {
    if (v === 'none') { set('hat', null); return; }
    s.look = { ...currentLook(s), hatStyle: v, hat: currentLook(s).hat ?? 0x2a2b31 };
    set('hatStyle', v);
  });
  for (const k of ['hat', 'top', 'legs', 'shoes', 'gloves']) bind(k, (v) => set(k, v === 'none' ? null : Number(v)));
  bind('bag', (v) => set('bag', v === '1'));
}

// ----------------------------------------------------------------------
/** Your car. onChange() lets the game rebuild the car live. */
export function showGarage(game, onBack, onChange = () => {}) {
  const s = game.settings;
  const car = { stripes: 'black', rims: 'steel', spoiler: 'on', windows: 'clear', glow: 'none', ...(s.car || {}) };
  const set = (k, v) => {
    s.car = { ...car, [k]: v };
    save.write();
    onChange();
    redraw(() => showGarage(game, onBack, onChange));
  };
  const paint = CAR_COLOURS.map((c) => {
    const ok = isColourUnlocked(c);
    return `<button class="swatch sm${s.carColour === c.id ? ' on' : ''}" data-paint="${c.id}" ${ok ? '' : 'disabled'} style="background:${hex(c.hex)}" title="${c.name}${ok ? '' : ` (locked: ${c.unlock})`}" aria-label="${c.name}"></button>`;
  }).join('');
  const part = (k) => CAR_PARTS[k].map((p) => (p.hex != null && k !== 'windows'
    ? swatch(`part-${k}`, p.id, car[k] === p.id, hex(p.hex), p.name)
    : `<button class="chip${car[k] === p.id ? ' on' : ''}" data-part-${k}="${p.id}">${p.name}</button>`)).join('');

  showCard(`
    <p class="sub kicker">Garage</p><h2>Your car</h2>
    <p class="sub cz-note">Mix and match your getaway car. Gold-rating colours unlock as you play.</p>
    ${row('Paint', paint)}
    ${row('Stripes', part('stripes'))}
    ${row('Wheels', part('rims'))}
    ${row('Spoiler', part('spoiler'))}
    ${row('Windows', part('windows'))}
    ${row('Underglow', part('glow'))}`,
  [{ label: 'Done', primary: true, onClick: onBack }], { side: true });

  bind('paint', (id) => { s.carColour = id; save.write(); onChange(); redraw(() => showGarage(game, onBack, onChange)); });
  for (const k of Object.keys(CAR_PARTS)) bind(`part-${k}`, (v) => set(k, v));
}

// The Level Editor: draw a rooftop course from above, then play it.
//
//  - Heights 0-9: paint cells (0 = street, 1 = low wall, 2-9 = buildings,
//    each step 2.5 m taller, so a one-step difference can be climbed).
//  - Start / Finish / Cash / Zip line: place things (zip lines go from a
//    roof down to a lower or equal roof: tap the start, then the end).
//  - Helicopter on/off and the time of day.
//  - Share: a code you can send to a friend. Load: paste a friend's code.
// Your levels are kept in the save (and in the cloud if you're signed in).

import { showCard } from './menus.js';
import { save } from '../core/save.js';
import { GRID, CELL, MAX_CASH, MAX_ZIPS, newLevel, encodeLevel, decodeLevel, cellHeight, levelId } from '../editor/customLevel.js';
import { formatTime } from '../core/utils.js';

const HEIGHT_COLORS = ['#1b1f2a', '#6b6f78', '#3f5a7a', '#4a6d8f', '#5a82a3', '#6d97b6', '#83abc6', '#9cc0d6', '#b8d4e4', '#d6e8f2'];
const TOOLS = [
  { id: 'start', label: 'Start', color: '#4dffa6' },
  { id: 'finish', label: 'Finish', color: '#ffb020' },
  { id: 'cash', label: 'Cash', color: '#7dff8a' },
  { id: 'zip', label: 'Zip line', color: '#ffd040' },
];
const TIMES = ['night', 'dawn', 'day', 'dusk'];
const MAX_LEVELS = 12;

/**
 * @param {object} game
 * @param {{level?:object, onPlay:(level)=>void, onBack:()=>void}} opts
 */
export function showLevelEditor(game, { level = null, onPlay, onBack }) {
  let L = level || decodeLevel(save.data.levels.draft || '') || newLevel();
  let tool = 3;          // a number = paint that height; a string = a TOOLS id
  let zipFrom = null;    // first end of a zip line being placed
  let msg = '';
  const keepDraft = () => { save.data.levels.draft = encodeLevel(L); save.write(); };

  const render = () => {
    showCard(`
      <p class="kicker">Level Editor</p>
      <div class="ed-top"><input id="ed-name" class="ed-name" maxlength="40" value="${escapeHtml(L.name)}" aria-label="Level name">
        <span class="sub ed-size">${GRID * CELL} x ${GRID * CELL} m</span></div>
      <div class="ed-tools">
        ${HEIGHT_COLORS.map((c, v) => `<button class="ed-h${tool === v ? ' on' : ''}" data-h="${v}" style="--c:${c}" title="${v === 0 ? 'Street' : v === 1 ? 'Low wall (1 m)' : `${cellHeight(v)} m`}">${v}</button>`).join('')}
      </div>
      <div class="ed-tools">
        ${TOOLS.map((t) => `<button class="ed-t${tool === t.id ? ' on' : ''}" data-t="${t.id}" style="--c:${t.color}">${t.label}</button>`).join('')}
        <button class="ed-t${L.heli ? ' on' : ''}" data-opt="heli" style="--c:#ff3346">Heli ${L.heli ? 'on' : 'off'}</button>
        <button class="ed-t" data-opt="time" style="--c:#39e6ff">${L.time}</button>
      </div>
      <canvas id="ed-canvas" class="ed-canvas"></canvas>
      <p class="sub ed-help" id="ed-msg">${msg || helpText(tool, zipFrom)}</p>`,
    [
      { label: 'Play', primary: true, onClick: play },
      { label: 'Share code', onClick: share },
      { label: 'Load code', onClick: load },
      { label: 'My levels', onClick: myLevels },
      { label: 'New', onClick: () => { L = newLevel(); zipFrom = null; msg = 'A fresh starter level.'; keepDraft(); render(); } },
      { label: 'Back', onClick: () => { keepDraft(); onBack(); } },
    ]);
    const card = document.getElementById('card');
    document.getElementById('ed-name').addEventListener('input', (e) => { L.name = e.target.value || 'My level'; });
    document.getElementById('ed-name').addEventListener('keydown', (e) => e.stopPropagation());
    for (const b of card.querySelectorAll('[data-h]')) b.addEventListener('click', (e) => { e.stopPropagation(); tool = +b.dataset.h; zipFrom = null; msg = ''; render(); });
    for (const b of card.querySelectorAll('[data-t]')) b.addEventListener('click', (e) => { e.stopPropagation(); tool = b.dataset.t; zipFrom = null; msg = ''; render(); });
    card.querySelector('[data-opt="heli"]').addEventListener('click', (e) => { e.stopPropagation(); L.heli = !L.heli; keepDraft(); render(); });
    card.querySelector('[data-opt="time"]').addEventListener('click', (e) => { e.stopPropagation(); L.time = TIMES[(TIMES.indexOf(L.time) + 1) % TIMES.length]; keepDraft(); render(); });
    bindCanvas();
  };

  // ------------------------------------------------------------------ the grid
  const bindCanvas = () => {
    const cv = document.getElementById('ed-canvas');
    // As big as fits: the card's width, and the screen's height minus the tools and buttons
    const cs0 = getComputedStyle(cv.parentElement);
    const inner = cv.parentElement.clientWidth - parseFloat(cs0.paddingLeft) - parseFloat(cs0.paddingRight);
    const size = Math.floor(Math.min(inner - 2, Math.max(220, Math.min(460, window.innerHeight - 330))));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.style.width = cv.style.height = `${size}px`;
    cv.width = cv.height = size * dpr;
    const g = cv.getContext('2d');
    const cs = (size * dpr) / GRID;
    const draw = () => {
      g.clearRect(0, 0, cv.width, cv.height);
      for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
        g.fillStyle = HEIGHT_COLORS[L.cells[j * GRID + i]];
        g.fillRect(i * cs, j * cs, cs, cs);
      }
      g.strokeStyle = 'rgba(255,255,255,0.07)';
      g.lineWidth = 1;
      for (let k = 0; k <= GRID; k++) {
        g.beginPath(); g.moveTo(k * cs, 0); g.lineTo(k * cs, GRID * cs); g.stroke();
        g.beginPath(); g.moveTo(0, k * cs); g.lineTo(GRID * cs, k * cs); g.stroke();
      }
      const mid = ([i, j]) => [(i + 0.5) * cs, (j + 0.5) * cs];
      g.lineWidth = Math.max(2, cs * 0.18);
      for (const z of L.zips) {
        const [ax, ay] = mid(z.slice(0, 2)), [bx, by] = mid(z.slice(2, 4));
        g.strokeStyle = '#ffd040';
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
        g.fillStyle = '#ffd040';
        g.beginPath(); g.arc(bx, by, cs * 0.25, 0, Math.PI * 2); g.fill();
      }
      const mark = (p, color, text) => {
        const [x, y] = mid(p);
        g.fillStyle = color;
        g.beginPath(); g.arc(x, y, cs * 0.45, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#111';
        g.font = `bold ${Math.round(cs * 0.6)}px sans-serif`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(text, x, y + 1);
      };
      for (const c of L.cash) mark(c, '#7dff8a', '$');
      mark(L.start, '#4dffa6', 'S');
      mark(L.finish, '#ffb020', 'F');
      if (zipFrom) mark(zipFrom, '#ffd040', 'Z');
    };
    draw();
    let painting = false, last = null;
    const cellAt = (e) => {
      const r = cv.getBoundingClientRect();
      const i = Math.floor(((e.clientX - r.left) / r.width) * GRID), j = Math.floor(((e.clientY - r.top) / r.height) * GRID);
      return i >= 0 && j >= 0 && i < GRID && j < GRID ? [i, j] : null;
    };
    const apply = (c, first) => {
      if (!c) return;
      const [i, j] = c, k = j * GRID + i, same = (p) => p[0] === i && p[1] === j;
      if (typeof tool === 'number') {
        L.cells[k] = tool;
        if (tool === 0) { L.cash = L.cash.filter((p) => !same(p)); L.zips = L.zips.filter((z) => !same(z) && !same(z.slice(2))); }
      } else if (!first) {
        return; // markers are placed with one tap, not dragged
      } else if (tool === 'start') L.start = [i, j];
      else if (tool === 'finish') L.finish = [i, j];
      else if (tool === 'cash') {
        if (L.cash.some(same)) L.cash = L.cash.filter((p) => !same(p));
        else if (L.cash.length < MAX_CASH) L.cash.push([i, j]);
        else setMsg(`That's the most cash bags (${MAX_CASH}).`);
      } else if (tool === 'zip') {
        if (!zipFrom) {
          const existing = L.zips.findIndex((z) => same(z));
          if (existing >= 0) { L.zips.splice(existing, 1); setMsg('Zip line removed.'); }
          else if (L.cells[k] < 2) setMsg('Zip lines start on a roof (height 2 or more).');
          else if (L.zips.length >= MAX_ZIPS) setMsg(`That's the most zip lines (${MAX_ZIPS}).`);
          else { zipFrom = [i, j]; setMsg('Now tap where it ends (a lower or equal roof, up to 45 m away).'); }
        } else {
          const [a, b] = zipFrom, ha = cellHeight(L.cells[b * GRID + a]), hb = cellHeight(L.cells[k]);
          const len = Math.hypot(i - a, j - b) * CELL;
          if (same(zipFrom)) setMsg('Pick a different roof for the end.');
          else if (hb > ha) setMsg('Zip lines have to go downhill (or level): pick a lower roof.');
          else if (len > 45 || len < 6) setMsg('Too far or too close: 6 to 45 m.');
          else { L.zips.push([a, b, i, j]); setMsg('Zip line added.'); }
          zipFrom = null;
        }
      }
      keepDraftSoon();
      draw();
    };
    const setMsg = (t) => { msg = t; const el = document.getElementById('ed-msg'); if (el) el.textContent = t; };
    cv.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      painting = true;
      cv.setPointerCapture(e.pointerId);
      last = cellAt(e);
      apply(last, true);
    });
    cv.addEventListener('pointermove', (e) => {
      if (!painting) return;
      const c = cellAt(e);
      if (c && (!last || c[0] !== last[0] || c[1] !== last[1])) { last = c; apply(c, false); }
    });
    const stop = () => { painting = false; };
    cv.addEventListener('pointerup', stop);
    cv.addEventListener('pointercancel', stop);
  };
  let draftTimer = 0;
  const keepDraftSoon = () => { clearTimeout(draftTimer); draftTimer = setTimeout(keepDraft, 600); };

  // ------------------------------------------------------------------ buttons
  function play() {
    keepDraft();
    storeMine();
    onPlay(L);
  }

  /** Keep it in "My levels" (by name). */
  function storeMine() {
    const mine = save.data.levels.mine;
    const code = encodeLevel(L);
    const i = mine.findIndex((m) => m.name === L.name);
    if (i >= 0) mine[i].code = code;
    else { mine.unshift({ name: L.name, code }); mine.length = Math.min(mine.length, MAX_LEVELS); }
    save.write();
  }

  function share() {
    storeMine();
    const code = encodeLevel(L);
    showCard(`
      <p class="kicker">Share "${escapeHtml(L.name)}"</p>
      <h2>Your level code</h2>
      <p class="sub">Send this to a friend. They open the Level Editor, press Load code and paste it in.</p>
      <textarea id="ed-code" class="ed-code" readonly>${code}</textarea>
      <p class="sub" id="ed-copied"></p>`,
    [
      { label: 'Copy', primary: true, onClick: () => {
        const el = document.getElementById('ed-code');
        el.select();
        const done = () => { document.getElementById('ed-copied').textContent = 'Copied!'; };
        navigator.clipboard?.writeText(code).then(done, () => { document.execCommand?.('copy'); done(); });
      } },
      { label: 'Back', onClick: render },
    ]);
  }

  function load() {
    showCard(`
      <p class="kicker">Load a level</p>
      <h2>Paste a level code</h2>
      <p class="sub">Codes start with GW1-</p>
      <textarea id="ed-code" class="ed-code" placeholder="GW1-..."></textarea>
      <p class="sub warn" id="ed-err"></p>`,
    [
      { label: 'Load', primary: true, onClick: () => {
        const got = decodeLevel(document.getElementById('ed-code').value);
        if (!got) { document.getElementById('ed-err').textContent = 'That isn\'t a level code.'; return; }
        L = got; zipFrom = null; msg = `Loaded "${L.name}". Press Play to try it.`;
        keepDraft(); render();
      } },
      { label: 'Back', onClick: render },
    ]);
    const ta = document.getElementById('ed-code');
    ta.addEventListener('keydown', (e) => e.stopPropagation());
    setTimeout(() => ta.focus(), 50);
  }

  function myLevels() {
    const mine = save.data.levels.mine;
    const best = save.data.levels.best;
    const rows = mine.map((m, i) => {
      const lv = decodeLevel(m.code);
      const b = lv && best[levelId(lv)];
      return `<div class="ed-row"><b>${escapeHtml(m.name)}</b><small>${b ? `Best ${formatTime(b)}` : 'Not finished yet'}</small>
        <button class="pill" data-open="${i}">Open</button><button class="pill" data-del="${i}">Delete</button></div>`;
    }).join('');
    showCard(`
      <p class="kicker">Level Editor</p>
      <h2>My levels</h2>
      ${rows || '<p class="sub">No levels yet. Press Play or Share in the editor to keep one here.</p>'}`,
    [{ label: 'Back', primary: true, onClick: render }]);
    const card = document.getElementById('card');
    for (const b of card.querySelectorAll('[data-open]')) b.addEventListener('click', (e) => {
      e.stopPropagation();
      const lv = decodeLevel(mine[+b.dataset.open].code);
      if (lv) { L = lv; zipFrom = null; msg = `Opened "${L.name}".`; keepDraft(); }
      render();
    });
    for (const b of card.querySelectorAll('[data-del]')) b.addEventListener('click', (e) => {
      e.stopPropagation();
      mine.splice(+b.dataset.del, 1);
      save.write();
      myLevels();
    });
  }

  render();
}

function helpText(tool, zipFrom) {
  if (typeof tool === 'number') return tool === 0 ? 'Street: rub out buildings (and cash / zip lines on them). Drag to paint.'
    : tool === 1 ? 'Low wall, 1 m: vault over it. Drag to paint.' : `Building, ${cellHeight(tool)} m tall. You can climb one step (2.5 m) up. Drag to paint.`;
  if (tool === 'start') return 'Tap where you start.';
  if (tool === 'finish') return 'Tap the finish. Grab every cash bag, then reach it.';
  if (tool === 'cash') return 'Tap to add or remove a cash bag.';
  return zipFrom ? 'Now tap where it ends.' : 'Tap a roof to start a zip line, then where it ends. Tap a zip line\'s start to remove it.';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));
}

// The Level Editor: draw a rooftop course from above, then play it.
//
// Made to be easy to pick up:
//  - A short "How it works" guide the first time (and on the ? button).
//  - Start from an example map (or an empty one, or a random one).
//  - Building sizes have names (Small / Medium / Tall...) and each building's
//    height number is written on the map. A big brush paints 3 x 3 at once.
//  - A live checklist: have you placed a start and a finish, and can you
//    actually reach the finish and every cash bag? Things you can't reach
//    are circled in red on the map.
//  - Undo.
//
// Heights: 0 = street, 1 = low wall, 2-9 = buildings, each step 2.5 m taller
// (you can climb one step up; drop down any height; buildings have ladders
// from the street). Zip lines go from a roof down to a lower or equal roof.
// Share: a code you can send to a friend. Load: paste a friend's code.

import { showCard } from './menus.js';
import { save } from '../core/save.js';
import { GRID, CELL, MAX_CASH, MAX_ZIPS, encodeLevel, decodeLevel, cellHeight, levelId } from '../editor/customLevel.js';
import { TEMPLATES, reachable } from '../editor/templates.js';
import { formatTime } from '../core/utils.js';

const HEIGHT_COLORS = ['#1b1f2a', '#6b6f78', '#3f5a7a', '#4a6d8f', '#5a82a3', '#6d97b6', '#83abc6', '#9cc0d6', '#b8d4e4', '#d6e8f2'];
// The paint buttons everyone sees (the rest are under "More heights")
const PAINTS = [
  { v: 0, name: 'Rub out', sub: 'street' },
  { v: 1, name: 'Wall', sub: 'jump over' },
  { v: 2, name: 'Small', sub: 'height 2' },
  { v: 4, name: 'Medium', sub: 'height 4' },
  { v: 6, name: 'Tall', sub: 'height 6' },
  { v: 8, name: 'Huge', sub: 'height 8' },
];
const TOOLS = [
  { id: 'start', label: 'S  Start', color: '#4dffa6' },
  { id: 'finish', label: 'F  Finish', color: '#ffb020' },
  { id: 'cash', label: '$  Cash', color: '#7dff8a' },
  { id: 'zip', label: 'Zip line', color: '#ffd040' },
];
const TIMES = ['night', 'dawn', 'day', 'dusk'];
const MAX_LEVELS = 12;

/**
 * @param {object} game
 * @param {{level?:object, onPlay:(level)=>void, onBack:()=>void}} opts
 */
export function showLevelEditor(game, { level = null, onPlay, onBack }) {
  const draft = level || decodeLevel(save.data.levels.draft || '');
  let L = draft || TEMPLATES[1].make();
  let tool = 4;          // a number = paint that height; a string = a TOOLS id
  let big = true;        // big brush (3 x 3)
  let moreHeights = false;
  let zipFrom = null;    // first end of a zip line being placed
  let msg = '';
  const undo = [];
  const snapshot = () => { undo.push(JSON.stringify(L)); if (undo.length > 40) undo.shift(); };
  const keepDraft = () => { save.data.levels.draft = encodeLevel(L); save.write(); };

  const render = () => {
    const paints = moreHeights ? Array.from({ length: 10 }, (_, v) => PAINTS.find((p) => p.v === v) || { v, name: `Height ${v}`, sub: `${cellHeight(v)} m` }) : PAINTS;
    showCard(`
      <div class="ed-top"><input id="ed-name" class="ed-name" maxlength="40" value="${escapeHtml(L.name)}" aria-label="Level name">
        <button class="ed-help-btn" data-act="help" aria-label="How it works">?</button></div>
      <p class="ed-label">1. Paint buildings <span>(drag on the map)</span></p>
      <div class="ed-tools">
        ${paints.map((p) => `<button class="ed-h${tool === p.v ? ' on' : ''}" data-h="${p.v}" style="--c:${HEIGHT_COLORS[p.v]}"><b>${p.name}</b><small>${p.sub}</small></button>`).join('')}
        <button class="ed-t" data-act="more" style="--c:var(--muted)">${moreHeights ? 'Fewer' : 'More heights'}</button>
        <button class="ed-t${big ? ' on' : ''}" data-act="brush" style="--c:var(--ink)">Brush: ${big ? 'big' : 'small'}</button>
      </div>
      <p class="ed-label">2. Place things <span>(tap the map)</span></p>
      <div class="ed-tools">
        ${TOOLS.map((t) => `<button class="ed-t${tool === t.id ? ' on' : ''}" data-t="${t.id}" style="--c:${t.color}">${t.label}</button>`).join('')}
        <button class="ed-t${L.heli ? ' on' : ''}" data-act="heli" style="--c:#ff3346">Police chopper: ${L.heli ? 'on' : 'off'}</button>
        <button class="ed-t" data-act="time" style="--c:#39e6ff">Time: ${L.time}</button>
      </div>
      <canvas id="ed-canvas" class="ed-canvas"></canvas>
      <p class="sub ed-msg" id="ed-msg">${msg || helpText(tool, zipFrom)}</p>
      <div class="ed-check" id="ed-check"></div>`,
    [
      { label: '3. Play it!', primary: true, onClick: play },
      { label: 'Undo', disabled: !undo.length, onClick: () => { if (undo.length) { L = JSON.parse(undo.pop()); zipFrom = null; msg = 'Undone.'; keepDraft(); render(); } } },
      { label: 'Examples', onClick: examples },
      { label: 'Share / load', onClick: shareMenu },
      { label: 'My levels', onClick: myLevels },
      { label: 'Back', onClick: () => { keepDraft(); onBack(); } },
    ]);
    const card = document.getElementById('card');
    const name = document.getElementById('ed-name');
    name.addEventListener('input', (e) => { L.name = e.target.value || 'My level'; });
    name.addEventListener('keydown', (e) => e.stopPropagation());
    const on = (sel, fn) => { for (const b of card.querySelectorAll(sel)) b.addEventListener('click', (e) => { e.stopPropagation(); fn(b); }); };
    on('[data-h]', (b) => { tool = +b.dataset.h; zipFrom = null; msg = ''; render(); });
    on('[data-t]', (b) => { tool = b.dataset.t; zipFrom = null; msg = ''; render(); });
    on('[data-act="more"]', () => { moreHeights = !moreHeights; render(); });
    on('[data-act="brush"]', () => { big = !big; msg = big ? 'Big brush: paints 3 x 3 squares at once.' : 'Small brush: one square at a time.'; render(); });
    on('[data-act="heli"]', () => { snapshot(); L.heli = !L.heli; keepDraft(); render(); });
    on('[data-act="time"]', () => { snapshot(); L.time = TIMES[(TIMES.indexOf(L.time) + 1) % TIMES.length]; keepDraft(); render(); });
    on('[data-act="help"]', () => guide(render));
    bindCanvas();
  };

  // ------------------------------------------------------------------ the map
  const bindCanvas = () => {
    const cv = document.getElementById('ed-canvas');
    // As big as fits: the card's width, and the screen's height minus the tools and buttons
    const cs0 = getComputedStyle(cv.parentElement);
    const inner = cv.parentElement.clientWidth - parseFloat(cs0.paddingLeft) - parseFloat(cs0.paddingRight);
    const size = Math.floor(Math.min(inner - 2, Math.max(240, Math.min(470, window.innerHeight - 300))));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.style.width = cv.style.height = `${size}px`;
    cv.width = cv.height = size * dpr;
    const g = cv.getContext('2d');
    const cs = (size * dpr) / GRID;
    let hover = null;
    const draw = () => {
      const reach = reachable(L);
      g.clearRect(0, 0, cv.width, cv.height);
      for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
        g.fillStyle = HEIGHT_COLORS[L.cells[j * GRID + i]];
        g.fillRect(i * cs, j * cs, cs, cs);
      }
      g.strokeStyle = 'rgba(255,255,255,0.06)';
      g.lineWidth = 1;
      for (let k = 0; k <= GRID; k++) {
        g.beginPath(); g.moveTo(k * cs, 0); g.lineTo(k * cs, GRID * cs); g.stroke();
        g.beginPath(); g.moveTo(0, k * cs); g.lineTo(GRID * cs, k * cs); g.stroke();
      }
      // Building outlines, and each building's height number in the middle
      g.strokeStyle = 'rgba(0,0,0,0.55)';
      g.lineWidth = Math.max(1.5, cs * 0.08);
      for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
        const v = L.cells[j * GRID + i];
        if (!v) continue;
        const edge = (ni, nj) => ni < 0 || nj < 0 || ni >= GRID || nj >= GRID || L.cells[nj * GRID + ni] !== v;
        g.beginPath();
        if (edge(i, j - 1)) { g.moveTo(i * cs, j * cs); g.lineTo((i + 1) * cs, j * cs); }
        if (edge(i, j + 1)) { g.moveTo(i * cs, (j + 1) * cs); g.lineTo((i + 1) * cs, (j + 1) * cs); }
        if (edge(i - 1, j)) { g.moveTo(i * cs, j * cs); g.lineTo(i * cs, (j + 1) * cs); }
        if (edge(i + 1, j)) { g.moveTo((i + 1) * cs, j * cs); g.lineTo((i + 1) * cs, (j + 1) * cs); }
        g.stroke();
      }
      // (in each building's top-left corner, out of the way of S / F / $)
      for (const r of regions(L)) {
        g.fillStyle = r.v >= 6 ? 'rgba(10,14,24,0.8)' : 'rgba(255,255,255,0.85)';
        g.font = `bold ${Math.round(Math.min(cs * 0.85, 20 * dpr))}px sans-serif`;
        g.textAlign = 'left'; g.textBaseline = 'top';
        g.fillText(r.v === 1 ? 'w' : String(r.v), r.x * cs + cs * 0.15, r.y * cs + cs * 0.08);
      }
      const mid = ([i, j]) => [(i + 0.5) * cs, (j + 0.5) * cs];
      g.lineWidth = Math.max(2, cs * 0.18);
      for (const z of L.zips) {
        const [ax, ay] = mid(z.slice(0, 2)), [bx, by] = mid(z.slice(2, 4));
        g.strokeStyle = '#ffd040';
        g.setLineDash([cs * 0.4, cs * 0.25]);
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
        g.setLineDash([]);
        // arrow head at the end
        const a = Math.atan2(by - ay, bx - ax);
        g.fillStyle = '#ffd040';
        g.beginPath(); g.moveTo(bx, by);
        g.lineTo(bx - Math.cos(a - 0.5) * cs * 0.8, by - Math.sin(a - 0.5) * cs * 0.8);
        g.lineTo(bx - Math.cos(a + 0.5) * cs * 0.8, by - Math.sin(a + 0.5) * cs * 0.8);
        g.fill();
      }
      const mark = (p, color, text, ok = true) => {
        const [x, y] = mid(p);
        g.fillStyle = color;
        g.beginPath(); g.arc(x, y, cs * 0.55, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#111';
        g.font = `bold ${Math.round(cs * 0.75)}px sans-serif`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(text, x, y + 1);
        if (!ok) {
          g.strokeStyle = '#ff3346'; g.lineWidth = Math.max(2, cs * 0.16);
          g.beginPath(); g.arc(x, y, cs * 0.95, 0, Math.PI * 2); g.stroke();
        }
      };
      const ok = ([i, j]) => !!reach[j * GRID + i];
      for (const c of L.cash) mark(c, '#7dff8a', '$', ok(c));
      mark(L.start, '#4dffa6', 'S');
      mark(L.finish, '#ffb020', 'F', ok(L.finish));
      if (zipFrom) mark(zipFrom, '#ffd040', 'Z');
      // Where the brush will paint
      if (hover && typeof tool === 'number') {
        const r0 = big ? 1 : 0;
        g.strokeStyle = 'rgba(255,176,32,0.9)'; g.lineWidth = 2;
        g.strokeRect((hover[0] - r0) * cs, (hover[1] - r0) * cs, (r0 * 2 + 1) * cs, (r0 * 2 + 1) * cs);
      }
      updateChecklist(reach);
    };
    draw();
    let painting = false, last = null;
    const cellAt = (e) => {
      const r = cv.getBoundingClientRect();
      const i = Math.floor(((e.clientX - r.left) / r.width) * GRID), j = Math.floor(((e.clientY - r.top) / r.height) * GRID);
      return i >= 0 && j >= 0 && i < GRID && j < GRID ? [i, j] : null;
    };
    const paintAt = (i, j) => {
      const r0 = big ? 1 : 0;
      for (let di = -r0; di <= r0; di++) for (let dj = -r0; dj <= r0; dj++) {
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= GRID || b >= GRID) continue;
        L.cells[b * GRID + a] = tool;
        if (tool === 0) {
          const same = (p) => p[0] === a && p[1] === b;
          L.cash = L.cash.filter((p) => !same(p));
          L.zips = L.zips.filter((z) => !same(z) && !same(z.slice(2)));
        }
      }
    };
    const apply = (c, first) => {
      if (!c) return;
      const [i, j] = c, k = j * GRID + i, same = (p) => p[0] === i && p[1] === j;
      if (typeof tool === 'number') {
        if (first) snapshot();
        paintAt(i, j);
      } else if (!first) {
        return; // things are placed with one tap, not dragged
      } else {
        snapshot();
        if (tool === 'start') { L.start = [i, j]; setMsg('Start placed: this is where you begin.'); }
        else if (tool === 'finish') { L.finish = [i, j]; setMsg('Finish placed: grab every $ and then get here.'); }
        else if (tool === 'cash') {
          if (L.cash.some(same)) { L.cash = L.cash.filter((p) => !same(p)); setMsg('Cash bag removed.'); }
          else if (L.cash.length < MAX_CASH) { L.cash.push([i, j]); setMsg(`Cash bag added (${L.cash.length}). Tap it again to remove it.`); }
          else setMsg(`That's the most cash bags (${MAX_CASH}).`);
        } else if (tool === 'zip') {
          if (!zipFrom) {
            const existing = L.zips.findIndex((z) => same(z));
            if (existing >= 0) { L.zips.splice(existing, 1); setMsg('Zip line removed.'); }
            else if (L.cells[k] < 2) { undo.pop(); setMsg('A zip line starts on top of a building: tap a building (not the street).'); }
            else if (L.zips.length >= MAX_ZIPS) { undo.pop(); setMsg(`That's the most zip lines (${MAX_ZIPS}).`); }
            else { undo.pop(); zipFrom = [i, j]; setMsg('Good! Now tap a LOWER building (or the same height) up to 15 squares away, where the zip line ends.'); }
          } else {
            const [a, b] = zipFrom, ha = cellHeight(L.cells[b * GRID + a]), hb = cellHeight(L.cells[k]);
            const len = Math.hypot(i - a, j - b) * CELL;
            if (same(zipFrom)) setMsg('Tap a different building for the end.');
            else if (hb > ha) setMsg('That building is taller: zip lines only go downhill. Tap a lower one.');
            else if (len > 45 || len < 6) setMsg('Too far or too close: pick a building 2 to 15 squares away.');
            else { L.zips.push([a, b, i, j]); setMsg('Zip line added! Jump into the cable at the start to ride it.'); }
            if (!(L.zips.length && same(L.zips[L.zips.length - 1].slice(2)))) undo.pop();
            zipFrom = null;
          }
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
      const c = cellAt(e);
      if (!painting) {
        if (e.pointerType === 'mouse' && (!hover || !c || c[0] !== hover[0] || c[1] !== hover[1])) { hover = c; draw(); }
        return;
      }
      if (c && (!last || c[0] !== last[0] || c[1] !== last[1])) { last = c; hover = c; apply(c, false); }
    });
    cv.addEventListener('pointerleave', () => { if (hover) { hover = null; draw(); } });
    const stop = () => { painting = false; };
    cv.addEventListener('pointerup', stop);
    cv.addEventListener('pointercancel', stop);
  };

  /** The checklist under the map: what's missing, and can you reach everything? */
  const updateChecklist = (reach) => {
    const el = document.getElementById('ed-check');
    if (!el) return;
    const ok = ([i, j]) => !!reach[j * GRID + i];
    const stuckCash = L.cash.filter((c) => !ok(c)).length;
    const items = [
      [true, 'Start placed (S)'],
      [ok(L.finish), ok(L.finish) ? 'You can reach the finish (F)' : 'You can\'t reach the finish! Add a building one step lower next to it, or move it'],
      L.cash.length
        ? [!stuckCash, stuckCash ? `${stuckCash} cash bag${stuckCash > 1 ? 's' : ''} can't be reached (circled in red)` : `All ${L.cash.length} cash bags can be reached`]
        : [null, 'No cash bags yet (optional)'],
    ];
    el.innerHTML = items.map(([good, text]) => `<span class="${good === null ? 'maybe' : good ? 'good' : 'bad'}">${good === null ? '•' : good ? '✓' : '✗'} ${text}</span>`).join('');
  };
  let draftTimer = 0;
  const keepDraftSoon = () => { clearTimeout(draftTimer); draftTimer = setTimeout(keepDraft, 600); };

  // ------------------------------------------------------------------ screens
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

  function examples() {
    showCard(`
      <p class="kicker">Level Editor</p>
      <h2>Start from an example</h2>
      <p class="sub">Pick one to change it however you like. (This replaces the map you're working on: press Back to keep it.)</p>
      <div class="ed-examples">${TEMPLATES.map((t) => `<button class="plan-opt" data-tpl="${t.id}"><b>${t.name}</b><small>${t.text}</small></button>`).join('')}</div>`,
    [{ label: 'Back', primary: true, onClick: render }]);
    for (const b of document.querySelectorAll('[data-tpl]')) b.addEventListener('click', (e) => {
      e.stopPropagation();
      snapshot();
      L = TEMPLATES.find((t) => t.id === b.dataset.tpl).make();
      zipFrom = null;
      msg = `"${L.name}" loaded. Change anything you like, then press Play.`;
      keepDraft();
      render();
    });
  }

  function shareMenu() {
    storeMine();
    const code = encodeLevel(L);
    showCard(`
      <p class="kicker">Share "${escapeHtml(L.name)}"</p>
      <h2>Send it to a friend</h2>
      <p class="sub">Copy this code and send it. Your friend opens the Level Editor, presses <b>Share / load</b>, pastes it in the second box and presses <b>Load</b>.</p>
      <textarea id="ed-code" class="ed-code" readonly>${code}</textarea>
      <p class="sub" id="ed-copied"></p>
      <p class="sub setting-head">Got a code from a friend?</p>
      <textarea id="ed-load" class="ed-code ed-load" placeholder="Paste a code here (it starts with GW1-)"></textarea>
      <p class="sub warn" id="ed-err"></p>`,
    [
      { label: 'Copy my code', primary: true, onClick: () => {
        const el = document.getElementById('ed-code');
        el.select();
        const done = () => { document.getElementById('ed-copied').textContent = 'Copied! Now paste it in a message to your friend.'; };
        navigator.clipboard?.writeText(code).then(done, () => { document.execCommand?.('copy'); done(); });
      } },
      { label: 'Load', onClick: () => {
        const got = decodeLevel(document.getElementById('ed-load').value);
        if (!got) { document.getElementById('ed-err').textContent = 'That isn\'t a level code. Codes start with GW1-'; return; }
        snapshot();
        L = got; zipFrom = null; msg = `Loaded "${L.name}". Press Play to try it.`;
        keepDraft(); render();
      } },
      { label: 'Back', onClick: render },
    ]);
    document.getElementById('ed-load').addEventListener('keydown', (e) => e.stopPropagation());
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
      ${rows || '<p class="sub">No levels yet. Every level you play is kept here (up to 12).</p>'}`,
    [{ label: 'Back', primary: true, onClick: render }]);
    const card = document.getElementById('card');
    for (const b of card.querySelectorAll('[data-open]')) b.addEventListener('click', (e) => {
      e.stopPropagation();
      const lv = decodeLevel(mine[+b.dataset.open].code);
      if (lv) { snapshot(); L = lv; zipFrom = null; msg = `Opened "${L.name}".`; keepDraft(); }
      render();
    });
    for (const b of card.querySelectorAll('[data-del]')) b.addEventListener('click', (e) => {
      e.stopPropagation();
      mine.splice(+b.dataset.del, 1);
      save.write();
      myLevels();
    });
  }

  /** "How it works": three steps, shown the first time. */
  function guide(then) {
    showCard(`
      <p class="kicker">Level Editor</p>
      <h2>How it works</h2>
      <p class="sub">The map is a city seen from above, like a drawing. Each square is 3 m.</p>
      <div class="ed-steps">
        <div><span>1</span><b>Paint buildings</b><small>Pick a size (Small, Medium, Tall...) and drag on the map. The number on a building is how tall it is: you can climb from a building onto one that is <b>one number higher</b> (2 → 3), and jump down from any height. Every building has a ladder from the street.</small></div>
        <div><span>2</span><b>Place things</b><small>Tap <b>Start</b> then tap the map where you begin. Do the same for the <b>Finish</b> and some <b>$ Cash</b> bags. For a <b>Zip line</b>, tap a tall building, then a lower one.</small></div>
        <div><span>3</span><b>Play it!</b><small>Grab every cash bag, then reach the finish, as fast as you can. The checklist under the map tells you if something can't be reached (it's circled in red).</small></div>
      </div>
      <p class="sub">Not sure where to begin? Press <b>Examples</b> and change one of those.</p>`,
    [{ label: 'Got it', primary: true, onClick: () => { save.data.levels.seenGuide = true; save.write(); then(); } }]);
  }

  if (!save.data.levels.seenGuide) guide(render);
  else render();
}

/** Rectangles of same-height buildings (for writing their height on the map). */
function regions(L) {
  const out = [], seen = new Uint8Array(GRID * GRID);
  for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
    const v = L.cells[j * GRID + i];
    if (!v || seen[j * GRID + i]) continue;
    // flood fill this building
    const stack = [[i, j]]; seen[j * GRID + i] = 1;
    while (stack.length) {
      const [a, b] = stack.pop();
      for (const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = a + da, y = b + db;
        if (x < 0 || y < 0 || x >= GRID || y >= GRID || seen[y * GRID + x] || L.cells[y * GRID + x] !== v) continue;
        seen[y * GRID + x] = 1;
        stack.push([x, y]);
      }
    }
    // label in the top-left cell (the first one found: top row, leftmost)
    out.push({ v, x: i, y: j });
  }
  return out;
}

function helpText(tool, zipFrom) {
  if (typeof tool === 'number') {
    if (tool === 0) return 'Rub out: drag over buildings to turn them back into street.';
    if (tool === 1) return 'Wall: a low wall (1 m) you can vault over. Drag to paint.';
    return `Height ${tool} building (${cellHeight(tool)} m). Drag on the map to paint it. You can climb onto a building one number higher.`;
  }
  if (tool === 'start') return 'Tap the map where you want to start.';
  if (tool === 'finish') return 'Tap the map where the finish goes.';
  if (tool === 'cash') return 'Tap the map to add a cash bag (tap it again to remove it).';
  return zipFrom ? 'Now tap a lower building where it ends.' : 'Tap a tall building where the zip line starts. (Tap a zip line\'s start to remove it.)';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));
}

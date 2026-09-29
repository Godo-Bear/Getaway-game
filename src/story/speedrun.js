// Speedrun: play story parts back to back against the clock.
//
// No story scenes, no deductions, no part summaries: finishing a part goes
// straight into the next one. The timer only runs while you're actually
// playing (not while paused, in a menu, or loading), and every part gets a
// split time. Best times are saved per route.
//
//   game.speedrun = { routeId, route, i, t, splits: [{ name, t }], caught }

import { CHAPTER_LIST } from './chapters.js';
import { startPart } from './chapterFlow.js';
import { save } from '../core/save.js';
import { earn } from '../gadgets/gadgets.js';
import { showCard } from '../ui/menus.js';
import { audio } from '../core/audio.js';
import { admin } from '../core/admin.js';

/** Every part of a chapter, as route steps. */
const chapterSteps = (c) => c.parts.map((_, i) => ({ chapterId: c.id, part: i }));

export function speedrunRoutes() {
  const unlocked = save.data.progress.chapterUnlocked || 1;
  const routes = CHAPTER_LIST.map((c) => ({
    id: c.id, name: c.short, sub: `${c.parts.length} parts`, steps: chapterSteps(c), locked: c.number > unlocked,
  }));
  routes.push({
    id: 'all', name: 'The whole story', sub: `All ${CHAPTER_LIST.length} chapters, ${CHAPTER_LIST.reduce((n, c) => n + c.parts.length, 0)} parts`,
    steps: CHAPTER_LIST.flatMap(chapterSteps), locked: unlocked < CHAPTER_LIST.length,
  });
  return routes;
}

/** m:ss.cc (hundredths) */
export function formatRun(t) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

export function bestRun(routeId) {
  return save.data.best.speedrun?.[routeId] ?? null;
}

export function startSpeedrun(game, routeId) {
  const route = speedrunRoutes().find((r) => r.id === routeId);
  game.speedrun = { routeId, name: route.name, route: route.steps, i: 0, t: 0, splits: [], caught: 0 };
  const first = route.steps[0];
  startPart(game, first.chapterId, first.part, { fresh: true });
  game.hud.toast('Go!', 'No story scenes. The timer only runs while you\'re playing.', 'var(--amber)', 3);
}

/** Called instead of the normal part summary when a speedrun is on. */
export function speedrunPartDone(state, mode) {
  const { game } = state;
  const sr = game.speedrun;
  const prev = sr.splits.length ? sr.splits[sr.splits.length - 1].t : 0;
  sr.splits.push({ name: `${mode.chapter.short}: ${mode.part.title}`, t: sr.t });
  sr.i++;
  const next = sr.route[sr.i];
  // Freeze this state; the next part loads a moment later (outside the update loop).
  state.over = true;
  game.hud.setMarker(null);
  game.hud.setMeter(0, '');
  if (next) {
    if (next.chapterId !== mode.chapter.id) sr.caught += game.chapterRun?.caught || 0;
    game.hud.toast(`Split: ${formatRun(sr.t - prev)}`, `${mode.part.title} done. Total ${formatRun(sr.t)}`, 'var(--amber)', 2.5);
    setTimeout(() => startPart(game, next.chapterId, next.part, { fresh: next.chapterId !== mode.chapter.id }), 50);
    return;
  }
  sr.caught += game.chapterRun?.caught || 0;
  finishSpeedrun(state);
}

function finishSpeedrun(state) {
  const { game } = state;
  const sr = game.speedrun;
  const old = bestRun(sr.routeId);
  // Admin cheats (or skipped parts) don't set records
  const counts = !sr.adminUsed && !admin.cheating;
  const isBest = counts && (old == null || sr.t < old);
  if (isBest) {
    save.data.best.speedrun ||= {};
    save.data.best.speedrun[sr.routeId] = sr.t;
    save.write();
  }
  const cash = earn(game, 150 * sr.route.length + (isBest ? 300 : 0), '', { quiet: true });
  audio.sfx('win');
  game.input.exitPointerLock();
  let prev = 0;
  const rows = sr.splits.map((s) => {
    const r = `<span>${s.name}</span><b>${formatRun(s.t - prev)}</b>`;
    prev = s.t;
    return r;
  }).join('');
  const routeId = sr.routeId;
  showCard(`
    <p class="sub kicker">Speedrun complete · ${sr.name}</p>
    <div class="run-total">${formatRun(sr.t)}</div>
    <div class="splits">${rows}<span>Times caught</span><b>${sr.caught}</b><span>Cash earned</span><b style="color:var(--safe)">+$${cash}</b></div>
    <p class="sub">${!counts ? 'Admin cheats were on, so this time isn\'t saved.' : isBest ? (old == null ? 'Your first recorded time. Now beat it.' : `New personal best! Your old best was ${formatRun(old)}.`) : `Your best is ${formatRun(old)}.`}</p>`,
  [
    { label: 'Run it again', primary: true, onClick: () => startSpeedrun(game, routeId) },
    { label: 'Quit to title', onClick: () => game.goTitle() },
  ]);
}

/** The Speedrun menu (title screen). */
export function showSpeedrunMenu(game, onBack) {
  const routes = speedrunRoutes();
  showCard(`
    <h2>Speedrun</h2>
    <p class="sub">Story parts back to back against the clock: no scenes, no deductions. The timer pauses whenever you pause.</p>`,
  [
    ...routes.map((r) => {
      const best = bestRun(r.id);
      return {
        label: r.name,
        sub: r.locked ? 'Locked: unlock it in the story first' : `${r.sub}${best != null ? ` · best ${formatRun(best)}` : ''}`,
        disabled: r.locked,
        primary: r.id === 'chapter1',
        onClick: () => startSpeedrun(game, r.id),
      };
    }),
    { label: 'Back', onClick: onBack },
  ], { list: true });
}


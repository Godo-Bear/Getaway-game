// Save system: a thin wrapper around localStorage.
//
// Everything is stored under one key as JSON. localStorage can throw
// (private browsing, storage full, blocked cookies), so every access is
// wrapped in try/catch and the game keeps working without saving.

const KEY = 'getaway.save.v1';

const DEFAULTS = {
  settings: {
    mouseSensitivity: 1.0,
    invertY: false,
    firstPerson: false, // on-foot camera view
    sprintToggle: true, // tap sprint once to keep sprinting (false = hold it)
    difficulty: 'normal', // 'easy' | 'normal' | 'hard' (src/core/difficulty.js)
    crosshair: true,
    brightness: 1,      // Settings > Graphics: 0.6 (darker) to 2.5 (much brighter, for night scenes)
    carColour: 'amber',
    // 'low' | 'medium' | 'high'. Everyone starts on medium (smooth on most
    // laptops and phones); raise it in Settings if your computer can take it.
    graphics: 'medium',
    autoGraphics: true, // lower the graphics setting by itself if the game runs slowly
    weather: 'auto',  // 'auto' (story decides) | 'rain' (rain everywhere) | 'off'
    timeOfDay: 'night', // non-story modes: 'night' | 'dawn' | 'day' | 'dusk' | 'random' | 'cycle'
    masterVolume: 0.8,
    musicVolume: 0.6,
    sfxVolume: 0.9,
  },
  best: {
    rooftopRun: 0,   // best score in the helicopter survival mode
    streetChase: 0,  // best score in the car survival mode
    speedrun: {},    // route id -> best time (seconds)
  },
  progress: {
    chapterUnlocked: 1,
    clues: {},       // chapterId -> [clue ids ever found]  (for the Case Board)
    bestTimes: {},   // e.g. 'chapter1.rooftops' -> seconds
    solved: {},      // chapterId -> true once the deduction is right
    ratings: {},     // chapterId -> best rating ('gold' | 'silver' | 'bronze')
    carColours: [],  // unlocked by gold ratings
  },
  // Admin mode (src/core/admin.js): unlocked with a code in Settings
  admin: {
    unlocked: false,
    noCooldowns: false, god: false, infiniteNitro: false, superSpeed: false,
  },
  // Abilities an admin gave this player online (same names as the admin cheats)
  perks: {},
  // Level Editor (src/editor/): your levels as share codes, best times by layout
  levels: {
    mine: [],        // [{ name, code }]
    best: {},        // level id -> best time (seconds)
    draft: null,     // the level open in the editor (share code)
  },
  // The gadget shop (src/gadgets/gadgets.js)
  shop: {
    cash: 500,       // spend it in the Shop; earned by playing
    owned: [],       // gadget ids you've bought
    equipped: { foot: null, car: null }, // the F-key gadget for each
  },
};

function deepMerge(base, extra) {
  const out = structuredClone(base);
  for (const k in extra) {
    if (extra[k] && typeof extra[k] === 'object' && !Array.isArray(extra[k]) && typeof out[k] === 'object') {
      out[k] = deepMerge(out[k], extra[k]);
    } else {
      out[k] = extra[k];
    }
  }
  return out;
}

let data = structuredClone(DEFAULTS);
try {
  const raw = localStorage.getItem(KEY);
  if (raw) data = deepMerge(DEFAULTS, JSON.parse(raw));
} catch {
  // corrupted or unavailable - just use defaults
}

const writeListeners = [];

export const save = {
  get data() {
    return data;
  },
  write() {
    data.savedAt = Date.now();
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      // ignore - saving is a nice-to-have
    }
    for (const fn of writeListeners) fn(data);
  },
  /** Call fn(data) after every save (the online account sync uses this). */
  onWrite(fn) {
    writeListeners.push(fn);
  },
  /**
   * Replace the saved progress (e.g. with the copy from your online account).
   * Settings stay as they are on this device (a phone and a laptop usually
   * want different graphics), and the same settings object is kept because
   * the game holds on to it.
   */
  replaceAll(newData) {
    const settings = data.settings;
    data = deepMerge(DEFAULTS, newData);
    data.settings = settings;
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* ignore */ }
  },
  /** Is this save basically empty (never played)? */
  isFresh(d = data) {
    const p = d.progress || {};
    return !(Object.keys(p.solved || {}).length || Object.keys(p.bestTimes || {}).length ||
      (d.best?.rooftopRun || 0) + (d.best?.streetChase || 0) > 0 || (d.shop?.owned || []).length);
  },
  /** One line describing a save, for choosing between two of them. */
  describe(d = data) {
    const solved = Object.keys(d.progress?.solved || {}).length;
    const cash = d.shop?.cash ?? 0;
    const gadgets = (d.shop?.owned || []).length;
    const when = d.savedAt ? new Date(d.savedAt).toLocaleString() : 'unknown time';
    return `${solved} chapter${solved === 1 ? '' : 's'} solved · $${cash} · ${gadgets} gadget${gadgets === 1 ? '' : 's'} · saved ${when}`;
  },
  /** Remember that a clue has been found (ever). */
  addClue(chapterId, clueId) {
    const list = (data.progress.clues[chapterId] ||= []);
    if (!list.includes(clueId)) {
      list.push(clueId);
      this.write();
    }
  },
  // ------------------------------------------------------------------
  // Stats are kept separately for each difficulty: best times, chapter
  // ratings and survival high scores. Normal uses the plain key (so saves
  // from before difficulties existed count as Normal); Easy and Hard add
  // "@easy" / "@hard". Story progress (solved, unlocked) is shared.
  // ------------------------------------------------------------------
  statKey(key, difficulty = data.settings.difficulty || 'normal') {
    return difficulty === 'normal' ? key : `${key}@${difficulty}`;
  },
  /** Best time for e.g. 'chapter1.total' on a difficulty (default: the current one), or null. */
  bestTime(key, difficulty) {
    return data.progress.bestTimes[this.statKey(key, difficulty)] ?? null;
  },
  /** Chapter rating ('gold' | 'silver' | 'bronze') on a difficulty, or null. */
  rating(chapterId, difficulty) {
    return data.progress.ratings?.[this.statKey(chapterId, difficulty)] ?? null;
  },
  /** Keep a chapter rating on the current difficulty if it's better than the old one. */
  submitRating(chapterId, rating) {
    const order = ['gold', 'silver', 'bronze'];
    const key = this.statKey(chapterId);
    data.progress.ratings ||= {};
    const prev = data.progress.ratings[key];
    if (!prev || order.indexOf(rating) < order.indexOf(prev)) data.progress.ratings[key] = rating;
  },
  /** High score for 'rooftopRun' / 'streetChase' on a difficulty (default: the current one). */
  bestScore(mode, difficulty) {
    return data.best[this.statKey(mode, difficulty)] || 0;
  },
  /** Record a time on the current difficulty; returns true if it's a new best (lower is better). */
  submitTime(key, seconds) {
    const k = this.statKey(key);
    const old = data.progress.bestTimes[k];
    if (old == null || seconds < old) {
      data.progress.bestTimes[k] = seconds;
      this.write();
      return true;
    }
    return false;
  },
  /** Record a score on the current difficulty; returns true if it's a new best. */
  submitBest(mode, score) {
    const k = this.statKey(mode);
    if (score > (data.best[k] || 0)) {
      data.best[k] = Math.floor(score);
      this.write();
      return true;
    }
    return false;
  },
};

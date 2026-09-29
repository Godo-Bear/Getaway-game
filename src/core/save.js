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
    carColour: 'amber',
    // 'low' | 'medium' | 'high'. Everyone starts on medium (smooth on most
    // laptops and phones); raise it in Settings if your computer can take it.
    graphics: 'medium',
    autoGraphics: true, // lower the graphics setting by itself if the game runs slowly
    weather: 'auto',  // 'auto' (story decides) | 'rain' (rain everywhere) | 'off'
    masterVolume: 0.8,
    musicVolume: 0.6,
    sfxVolume: 0.9,
  },
  best: {
    rooftopRun: 0,   // best score in the helicopter survival mode
    streetChase: 0,  // best score in the car survival mode
  },
  progress: {
    chapterUnlocked: 1,
    clues: {},       // chapterId -> [clue ids ever found]  (for the Case Board)
    bestTimes: {},   // e.g. 'chapter1.rooftops' -> seconds
    solved: {},      // chapterId -> true once the deduction is right
    ratings: {},     // chapterId -> best rating ('gold' | 'silver' | 'bronze')
    carColours: [],  // unlocked by gold ratings
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

export const save = {
  get data() {
    return data;
  },
  write() {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      // ignore - saving is a nice-to-have
    }
  },
  /** Remember that a clue has been found (ever). */
  addClue(chapterId, clueId) {
    const list = (data.progress.clues[chapterId] ||= []);
    if (!list.includes(clueId)) {
      list.push(clueId);
      this.write();
    }
  },
  /** Record a time; returns true if it's a new best (lower is better). */
  submitTime(key, seconds) {
    const old = data.progress.bestTimes[key];
    if (old == null || seconds < old) {
      data.progress.bestTimes[key] = seconds;
      this.write();
      return true;
    }
    return false;
  },
  /** Record a score; returns true if it's a new best. */
  submitBest(mode, score) {
    if (score > (data.best[mode] || 0)) {
      data.best[mode] = Math.floor(score);
      this.write();
      return true;
    }
    return false;
  },
};

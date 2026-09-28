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
    graphics: 'high', // 'low' | 'medium' | 'high'
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

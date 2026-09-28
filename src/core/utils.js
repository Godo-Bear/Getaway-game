// Small maths helpers used all over the game.
// Keeping them in one place means every system "feels" the same
// (e.g. all smoothing uses the same frame-rate independent damp()).

/** Clamp a value between min and max. */
export const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);

/** Linear interpolation from a to b by t (0..1). */
export const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Frame-rate independent smoothing.
 * Moves `current` toward `target`; `lambda` is "how snappy" (higher = faster).
 * Unlike lerp(a, b, 0.1), this behaves the same at 30 fps and 144 fps.
 */
export const damp = (current, target, lambda, dt) =>
  lerp(current, target, 1 - Math.exp(-lambda * dt));

/** Move `current` toward `target` by at most `maxDelta`. */
export const approach = (current, target, maxDelta) => {
  if (current < target) return Math.min(current + maxDelta, target);
  return Math.max(current - maxDelta, target);
};

/** Wrap an angle to the range -PI..PI. */
export const wrapAngle = (a) => {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
};

/** Smoothly rotate angle `a` toward `b`, taking the short way round. */
export const dampAngle = (a, b, lambda, dt) =>
  a + wrapAngle(b - a) * (1 - Math.exp(-lambda * dt));

/** Ease-out curve (fast start, slow finish). */
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

/** Ease-in-out curve. */
export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/**
 * Seeded pseudo-random number generator (mulberry32).
 * Using a seed means the city/course is generated the same way every time,
 * which makes bugs reproducible and levels designable.
 */
export function makeRng(seed = 1) {
  let s = seed >>> 0;
  const rng = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.range = (min, max) => min + rng() * (max - min);
  rng.int = (min, max) => Math.floor(rng.range(min, max + 1));
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
  return rng;
}

/** Format seconds as m:ss.t for timers. */
export function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

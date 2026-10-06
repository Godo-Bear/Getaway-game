import { save } from './save.js';

// Rumble on a gamepad and a buzz on a phone, for hits, crashes and big
// landings. Settings > Vibration turns it off.

let last = 0;

/** strength 0..1, ms = how long. */
export function rumble(strength = 0.5, ms = 120) {
  if (save.data.settings.vibration === false) return;
  const now = performance.now();
  if (now - last < 60) return; // (not every frame)
  last = now;
  try {
    for (const pad of navigator.getGamepads?.() || []) {
      pad?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: Math.min(1, strength), weakMagnitude: Math.min(1, strength * 1.3) });
    }
  } catch { /* no rumble */ }
  try {
    if (document.body.classList.contains('touch') && navigator.vibrate) navigator.vibrate(Math.round(ms * Math.min(1, 0.3 + strength)));
  } catch { /* no vibration */ }
}

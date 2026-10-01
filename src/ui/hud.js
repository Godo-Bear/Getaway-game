// HUD: updates the HTML overlay that sits on top of the 3D canvas.
//
// HTML is great for text, bars and menus - much easier than drawing them in
// 3D. To keep it fast we only touch the DOM when a value actually changes
// (writing to the DOM every frame for no reason is a common slowdown).

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.el = {
      tl: $('hud-tl'), phase: $('hud-phase'), objective: $('hud-objective'), stats: $('hud-stats'),
      score: $('hud-score'), scoreValue: $('hud-score-value'), scoreLabel: $('hud-score-label'),
      mapWrap: $('hud-map-wrap'), map: $('hud-map'),
      speedo: $('hud-speedo'), speed: $('hud-speed'), nitro: $('hud-nitro'),
      meter: $('hud-meter'), meterLabel: $('hud-meter-label'), meterFill: $('hud-meter-fill'),
      controls: $('hud-controls'), debug: $('hud-debug'), marker: $('hud-marker'), waypoint: $('hud-waypoint'),
      toast: $('toast'), fade: $('fade'), cross: $('hud-cross'), run: $('hud-run'),
    };
    // Action prompt ("E  Knock out"): shown while an action is possible
    this.el.prompt = document.createElement('div');
    this.el.prompt.id = 'hud-prompt';
    this.el.prompt.className = 'hud';
    this.el.prompt.hidden = true;
    document.body.appendChild(this.el.prompt);
    this._cache = new Map();
    this._toastTimer = 0;
    this._controlsTimer = 0;
  }

  /** Set textContent/innerHTML only if it changed. */
  _set(el, key, value, html = false) {
    if (this._cache.get(key) === value) return;
    this._cache.set(key, value);
    if (html) el.innerHTML = value;
    else el.textContent = value;
  }

  /** Show only the listed HUD sections: 'tl', 'score', 'map', 'speedo', 'meter', 'controls', 'marker', 'cross' */
  show(sections) {
    const all = { tl: this.el.tl, score: this.el.score, map: this.el.mapWrap, speedo: this.el.speedo,
      meter: this.el.meter, controls: this.el.controls, marker: this.el.marker, cross: this.el.cross };
    for (const [k, el] of Object.entries(all)) el.hidden = !sections.includes(k);
    if (!sections.includes('marker')) this.el.marker.style.display = 'none';
    this.el.waypoint.style.display = 'none'; // shown again by a driving state that has one
  }

  /** The action you can do right now (null hides it). */
  setPrompt(label) {
    const html = label ? `<kbd>E</kbd> ${label}` : '';
    this._set(this.el.prompt, 'prompt', html, true);
    if (this.el.prompt.hidden !== !label) this.el.prompt.hidden = !label;
  }

  hideAll() {
    this.setPrompt(null);
    this.show([]);
    this.setRun(null);
    this.setDebug('');
    this.el.toast.classList.remove('show');
    this._toastTimer = 0;
  }

  setPhase(text) { this._set(this.el.phase, 'phase', text); }
  setObjective(text) { this._set(this.el.objective, 'objective', text); }
  setStats(html) { this._set(this.el.stats, 'stats', html, true); }
  setScore(value, labelHtml) {
    this._set(this.el.scoreValue, 'score', Math.floor(value).toLocaleString('en-US'));
    this._set(this.el.scoreLabel, 'scoreLabel', labelHtml, true);
  }
  setDebug(text) { this._set(this.el.debug, 'debug', text); }

  /** Speedrun timer (top centre); null hides it. */
  setRun(time, label = '') {
    const on = time != null;
    if (this.el.run.hidden === on) this.el.run.hidden = !on;
    if (!on) return;
    this._set(this.el.run.querySelector('b'), 'runT', time);
    this._set(this.el.run.querySelector('span'), 'runL', `Speedrun · ${label}`);
  }

  /** Crosshair: shows SPRINT under it while sprint is switched on. */
  setSprint(on) {
    if (this._cache.get('sprint') === on) return;
    this._cache.set('sprint', on);
    this.el.cross.classList.toggle('sprint', on);
  }

  setSpeedo(kmh, nitro) {
    this._set(this.el.speed, 'speed', String(Math.round(kmh)));
    const n = `${(nitro * 100).toFixed(0)}%`;
    if (this._cache.get('nitro') !== n) { this._cache.set('nitro', n); this.el.nitro.style.width = n; }
  }

  /** The Spotted / Busted meter. value 0..1; hidden when empty. */
  setMeter(value, label, color = 'var(--red)') {
    const v = Math.max(0, Math.min(1, value));
    const w = `${(v * 100).toFixed(1)}%`;
    if (this._cache.get('meterW') !== w) { this._cache.set('meterW', w); this.el.meterFill.style.width = w; }
    this._set(this.el.meterLabel, 'meterLabel', label);
    if (this._cache.get('meterC') !== color) { this._cache.set('meterC', color); this.el.meterFill.style.background = color; }
    const op = v > 0.01 ? '1' : '0';
    if (this._cache.get('meterO') !== op) { this._cache.set('meterO', op); this.el.meter.style.opacity = op; }
  }

  /** Big centred message that fades after a few seconds. */
  toast(title, body = '', color = 'var(--ink)', seconds = null) {
    this.el.toast.querySelector('.t').textContent = title;
    this.el.toast.querySelector('.t').style.color = color;
    this.el.toast.querySelector('.b').textContent = body;
    // Just under the objective in the top-left corner (out of the way of the action)
    const tl = document.getElementById('hud-tl');
    const r = tl && !tl.hidden && getComputedStyle(tl).display !== 'none' ? tl.getBoundingClientRect() : null;
    this.el.toast.style.top = `${Math.round(r && r.height ? r.bottom + 6 : 14)}px`;
    this.el.toast.classList.add('show');
    this._toastTimer = seconds ?? (body ? 4 : 2);
  }

  /** Show the controls help for `seconds` (the first minute of each mode). */
  showControls(html, seconds = 60) {
    this.el.controls.innerHTML = html + '<div class="fade-note">Press H to show or hide these controls</div>';
    this.el.controls.hidden = false;
    this.el.controls.style.opacity = '1';
    this._controlsTimer = seconds;
  }

  toggleControls() {
    const visible = this.el.controls.style.opacity !== '0';
    this.el.controls.style.opacity = visible ? '0' : '1';
    this._controlsTimer = visible ? 0 : 1e9;
  }

  /** Fade the screen to black (true) or back (false). */
  setFade(on) {
    this.el.fade.style.opacity = on ? '1' : '0';
  }

  /**
   * On-screen marker that points at a 3D position (or to the screen edge
   * with an arrow if it's off-screen).
   */
  setMarker(worldPos, camera, label, color = 'var(--amber)', distance = null) {
    this.markerPos = worldPos ? { x: worldPos.x, y: worldPos.y, z: worldPos.z } : null; // (admin: teleport to the marker)
    this._placeMarker(this.el.marker, 'marker', worldPos, camera, label, color, distance);
  }

  /** A second pointer for the waypoint you set on the big map (M). */
  setWaypoint(worldPos, camera, distance = null) {
    this._placeMarker(this.el.waypoint, 'waypoint', worldPos, camera, 'Waypoint', '#ff5ad0', distance);
  }

  _placeMarker(m, key, worldPos, camera, label, color, distance) {
    if (!worldPos) { m.style.display = 'none'; return; }
    m.style.display = 'block';
    const v = worldPos.clone().project(camera);
    let x = v.x, y = v.y;
    const behind = v.z > 1;
    if (behind) { x = -x; y = -y; }
    const off = behind || Math.abs(x) > 0.9 || Math.abs(y) > 0.85;
    if (off) {
      if (Math.hypot(x, y) < 0.05) { x = 0; y = -1; }
      const k = Math.max(Math.abs(x) / 0.9, Math.abs(y) / 0.85);
      x /= k; y /= k;
    }
    m.style.left = `${(x * 0.5 + 0.5) * window.innerWidth}px`;
    m.style.top = `${(-y * 0.5 + 0.5) * window.innerHeight}px`;
    m.classList.toggle('off', off);
    m.style.setProperty('--mc', color);
    m.style.setProperty('--ang', `${90 - (Math.atan2(y, x) * 180) / Math.PI}deg`);
    const text = distance != null ? `${label} ${Math.round(distance)} m` : label;
    this._set(m.querySelector('.lbl'), key, text);
  }

  update(dt) {
    if (this._toastTimer > 0) {
      this._toastTimer -= dt;
      if (this._toastTimer <= 0) this.el.toast.classList.remove('show');
    }
    if (this._controlsTimer > 0 && this._controlsTimer < 1e8) {
      this._controlsTimer -= dt;
      if (this._controlsTimer <= 0) this.el.controls.style.opacity = '0';
    }
  }
}

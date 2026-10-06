// Audio: everything you hear, built on the Web Audio API.
//
// Sound graph:
//
//   loops (engine, siren, rotor, wind...) ─┐
//   one-shot effects (steps, crashes...)  ─┴─> sfx bus ──┐
//                                                        ├─> master ─> speakers
//   music ─> music filter ─> music bus ───────────────────┘
//
// Recorded sounds (public/audio/*.mp3, from the original prototype) are used
// where we have them; everything else is synthesised from oscillators and
// noise, so the game still has sound if a file fails to load.
//
// Browsers only allow audio after the player clicks or presses a key, so the
// AudioContext is created on the first input (see unlock()).
//
// Game states drive the loops every frame with setMix({ engine: 0.4, ... }).
// Any loop not mentioned fades out, so switching states never leaves an
// engine or siren droning on.
//
// MUSIC follows where the crew lives (setPlace): Harbor City plays the main
// track as it is; Frostvale plays it slower and lower with soft bells over
// the top. In a chase (high intensity) the track speeds up a little, the
// filter opens, and a low pulsing tension layer comes in.

import { clamp } from './utils.js';

const SAMPLE_SFX = ['cash', 'caught', 'checkpoint', 'click', 'clue', 'crash0', 'crash1', 'door', 'glass',
  'land', 'locked', 'step0', 'step1', 'step2', 'step3', 'step4', 'vault', 'win'];
const LOOP_NAMES = ['engine', 'screech', 'siren', 'rotor', 'wind', 'city', 'nitro', 'rain'];

// Fake gearbox: the engine note rises, then drops at each gear change.
const GEARS = [0, 9, 18, 27, 36, 60];
function engineNote(speed) {
  let g = 0;
  while (g < GEARS.length - 2 && speed > GEARS[g + 1]) g++;
  const fr = clamp((speed - GEARS[g]) / (GEARS[g + 1] - GEARS[g]), 0, 1);
  return 52 + g * 6 + fr * (46 + g * 4);
}

const url = (path) => new URL(path, document.baseURI).href;

// Where the crew is: how the music sounds there
const PLACES = {
  harbor: { rate: 1, bells: false },
  frostvale: { rate: 0.9, bells: true },
  abroad: { rate: 1.06, bells: false },
};
// Frostvale bells: notes of a pentatonic scale (Hz)
const BELLS = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66];

class AudioManager {
  constructor() {
    this.ctx = null;
    this.buffers = {};
    this.loops = {};
    this.last = {};
    this.volumes = { master: 0.8, music: 0.6, sfx: 0.9 };
    this.lastImpact = 0;
    this.intensity = 0.3;
    this.place = 'harbor';
    this.surface = null; // 'snow': footsteps crunch
  }

  /** Create the audio context. Call from a user gesture (click / key). */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch {
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 900;
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0;
    this.musicFilter.connect(this.musicGain);
    this.musicGain.connect(this.musicBus);
    // Extra music layers (bells, the chase pulse) follow the music level too
    this.layerGain = ctx.createGain();
    this.layerGain.gain.value = 0;
    this.layerGain.connect(this.musicBus);
    this._buildTension();
    this._bellTimer = setInterval(() => this._bells(), 250);
    this._applyVolumes();

    // Two seconds of white noise, reused by every noisy sound.
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this._buildLoops();
    this._loadSamples();
  }

  setVolumes({ masterVolume, musicVolume, sfxVolume }) {
    this.volumes = { master: masterVolume, music: musicVolume, sfx: sfxVolume };
    this._applyVolumes();
  }

  _applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volumes.master, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.volumes.sfx, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.volumes.music, t, 0.05);
  }

  // ------------------------------------------------------------------
  // Building blocks
  // ------------------------------------------------------------------
  _noiseSource() {
    const n = this.ctx.createBufferSource();
    n.buffer = this.noise;
    n.loop = true;
    n.start(0, Math.random() * 1.5);
    return n;
  }

  _filter(type, freq, q = 1) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  _lfo(type, freq, amount, param) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.value = amount;
    o.connect(g);
    g.connect(param);
    o.start();
  }

  _out() {
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.connect(this.sfxBus);
    return g;
  }

  /** The synthesised loops (recorded ones are layered in when they load). */
  _buildLoops() {
    const ctx = this.ctx, L = this.loops;
    // City rumble: low-passed noise
    { const f = this._filter('lowpass', 350), g = this._out(); this._noiseSource().connect(f); f.connect(g); L.city = g; }
    // Rooftop wind: band-passed noise that slowly sweeps
    { const f = this._filter('bandpass', 700, 0.6), g = this._out(); this._noiseSource().connect(f); f.connect(g); this._lfo('sine', 0.15, 260, f.frequency); L.wind = g; L.windFilter = f; }
    // Helicopter rotor: low noise chopped by a square wave
    { const f = this._filter('lowpass', 170), am = ctx.createGain(); am.gain.value = 0.5; this._lfo('square', 11, 0.5, am.gain);
      const g = this._out(); this._noiseSource().connect(f); f.connect(am); am.connect(g); L.rotor = g; }
    // Rain: bright hiss (high noise) with a softer patter underneath
    { const hp = this._filter('highpass', 1600, 0.5), lp = this._filter('lowpass', 7500, 0.5), g = this._out();
      const n = this._noiseSource(); n.connect(hp); hp.connect(lp); lp.connect(g);
      const pf = this._filter('bandpass', 500, 0.8), pg = this.ctx.createGain(); pg.gain.value = 0.6;
      this._noiseSource().connect(pf); pf.connect(pg); pg.connect(g); L.rain = g; }
    // Tyre screech: narrow band of high noise
    { const f = this._filter('bandpass', 2300, 7), g = this._out(); this._noiseSource().connect(f); f.connect(g); this._lfo('sine', 5, 300, f.frequency); L.screech = g; }
    // Nitro: rushing hiss
    { const f = this._filter('highpass', 1400, 0.7), g = this._out(); this._noiseSource().connect(f); f.connect(g); L.nitro = g; }
    // Siren: two sines sweeping up and down (replaced by the recording when loaded)
    {
      const f = this._filter('lowpass', 1800, 0.5), g = this._out(), sg = ctx.createGain();
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 760; this._lfo('sine', 0.28, 290, o.frequency);
      const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 1520; this._lfo('sine', 0.28, 580, o2.frequency);
      const g2 = ctx.createGain(); g2.gain.value = 0.22;
      o.connect(sg); o2.connect(g2); g2.connect(sg); sg.connect(f); f.connect(g); o.start(); o2.start();
      L.siren = g; L.sirenFilter = f; L.sirenSynth = sg;
    }
    // Engine: sawtooth + sub sine + triangle through a low-pass, with a little chug
    {
      const g = this._out(), lp = this._filter('lowpass', 260, 0.4), eg = ctx.createGain();
      lp.connect(eg); eg.connect(g);
      const am = ctx.createGain(); am.gain.value = 0.7; am.connect(lp);
      const osc = (type, f, v) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; const og = ctx.createGain(); og.gain.value = v; o.connect(og); og.connect(am); o.start(); return o; };
      const o1 = osc('sawtooth', 58, 0.45), o2 = osc('sine', 29, 0.7), o3 = osc('triangle', 116, 0.18);
      const chug = ctx.createOscillator(); chug.type = 'sine'; chug.frequency.value = 29;
      const cg = ctx.createGain(); cg.gain.value = 0.22; chug.connect(cg); cg.connect(am.gain); chug.start();
      L.engine = g; L.eng = { o1, o2, o3, chug, lp, synth: eg };
    }
  }

  async _loadSamples() {
    const decode = async (path) => {
      const res = await fetch(url(path));
      if (!res.ok) throw new Error(path);
      const buf = await res.arrayBuffer();
      return this.ctx.decodeAudioData(buf);
    };
    const loop = (buf, dest, gain) => {
      const n = this.ctx.createBufferSource();
      n.buffer = buf;
      n.loop = true;
      n.loopStart = 0.03;
      n.loopEnd = buf.duration - 0.03;
      const g = this.ctx.createGain();
      g.gain.value = gain;
      n.connect(g);
      g.connect(dest);
      n.start(0, 0.03);
      return n;
    };
    // Loops: the recordings replace the synth versions.
    await Promise.all([
      decode('audio/siren.mp3').then((b) => { loop(b, this.loops.sirenFilter, 4); this.loops.sirenSynth.gain.value = 0; }).catch(() => {}),
      decode('audio/drive.mp3').then((b) => { this.loops.driveSrc = loop(b, this.loops.engine, 4); this.loops.eng.synth.gain.value = 0.35; }).catch(() => {}),
      decode('audio/music.mp3').then((b) => { this.musicSrc = loop(b, this.musicFilter, 1); this._setRate(); }).catch(() => {}),
    ]);
    // Effects load in parallel; any that fail fall back to synthesised sounds.
    await Promise.all(SAMPLE_SFX.map(async (name) => {
      try { this.buffers[name] = await decode(`audio/${name}.mp3`); } catch { /* synth fallback */ }
    }));
  }

  // ------------------------------------------------------------------
  // Loops
  // ------------------------------------------------------------------
  /**
   * Set loop volumes (0..1). Any loop not listed fades to silence.
   * e.g. setMix({ engine: 0.5, siren: 0.3, music: 0.4 })
   */
  setMix(mix) {
    if (!this.ctx) return;
    for (const name of LOOP_NAMES) this._setLoop(name, mix[name] || 0);
    this._setMusic(mix.music || 0, mix.intensity ?? 0.3);
  }

  _setLoop(name, v) {
    const g = this.loops[name];
    if (!g || Math.abs((this.last[name] ?? -1) - v) < 0.004) return;
    this.last[name] = v;
    g.gain.setTargetAtTime(v, this.ctx.currentTime, 0.2);
  }

  /** Where the crew is ('harbor' | 'frostvale' | 'abroad'): the music changes to suit. */
  setPlace(place) {
    if (!PLACES[place]) place = 'harbor';
    if (place === this.place) return;
    this.place = place;
    this._setRate();
  }

  /** Music speed: the place's own, a little faster in a chase. */
  _setRate() {
    if (!this.ctx) return;
    const base = (PLACES[this.place] || PLACES.harbor).rate;
    const chase = clamp((this.intensity - 0.55) / 0.4, 0, 1);
    const rate = base * (1 + 0.1 * chase);
    if (this.musicSrc && Math.abs((this.last.rate ?? -1) - rate) > 0.004) {
      this.last.rate = rate;
      this.musicSrc.playbackRate.setTargetAtTime(rate, this.ctx.currentTime, 1.2);
    }
    // The tension pulse: a low throb that comes in as a chase heats up
    const tv = 0.09 * chase;
    if (Math.abs((this.last.tension ?? -1) - tv) > 0.003) {
      this.last.tension = tv;
      this.tension.gain.setTargetAtTime(tv, this.ctx.currentTime, 0.8);
      this.tensionLfo.frequency.setTargetAtTime(3 + 2.5 * chase, this.ctx.currentTime, 0.8);
    }
  }

  /** A low, pulsing drone (two detuned saws through a low-pass, throbbing). */
  _buildTension() {
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    const amp = ctx.createGain();
    amp.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 3;
    const depth = ctx.createGain();
    depth.gain.value = 0.5;
    lfo.connect(depth);
    depth.connect(amp.gain);
    lfo.start();
    for (const f of [55, 55.4, 110.3]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(lp);
      o.start();
    }
    lp.connect(amp);
    amp.connect(out);
    out.connect(this.layerGain);
    this.tension = out;
    this.tensionLfo = lfo;
  }

  /** Frostvale: now and then a soft bell note (like sleigh bells in the distance). */
  _bells() {
    if (!this.ctx || this.ctx.state !== 'running' || !(PLACES[this.place]?.bells) || (this.last.music ?? 0) < 0.05) return;
    if (Math.random() > 0.32) return;
    const ctx = this.ctx, t = ctx.currentTime + 0.02;
    const f = BELLS[Math.floor(Math.random() * BELLS.length)] * (Math.random() < 0.25 ? 0.5 : 1);
    for (const [mult, vol, dur] of [[1, 0.05, 2.2], [2.76, 0.016, 0.9], [5.4, 0.006, 0.4]]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * mult;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(this.layerGain);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  _setMusic(v, intensity) {
    if (Math.abs((this.last.music ?? -1) - v) > 0.004) {
      this.last.music = v;
      this.musicGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.6);
      this.layerGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.6);
    }
    this.intensity = intensity;
    this._setRate();
    // Intensity opens up the filter: muffled and calm -> bright and driving.
    const f = 500 * Math.pow(36, clamp(intensity, 0, 1));
    if (Math.abs((this.last.musicF ?? -1) - f) > 20) {
      this.last.musicF = f;
      this.musicFilter.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.8);
    }
  }

  /** Engine pitch from speed (m/s); load 0..1 = throttle. */
  engine(speed, load = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, e = this.loops.eng;
    const f = engineNote(Math.abs(speed));
    e.o1.frequency.setTargetAtTime(f, t, 0.12);
    e.o2.frequency.setTargetAtTime(f / 2, t, 0.12);
    e.o3.frequency.setTargetAtTime(f * 2, t, 0.12);
    e.chug.frequency.setTargetAtTime(f / 2, t, 0.12);
    e.lp.frequency.setTargetAtTime(f * 2.2 + load * 380, t, 0.15);
    this.loops.driveSrc?.playbackRate.setTargetAtTime(clamp(0.78 + (f - 52) / 150 + load * 0.04, 0.75, 1.45), t, 0.2);
  }

  /** Siren gets brighter (and the state makes it louder) as police get close. */
  sirenDistance(d) {
    if (!this.ctx) return;
    this.loops.sirenFilter.frequency.setTargetAtTime(500 + 2300 * clamp(1 - d / 110, 0, 1), this.ctx.currentTime, 0.2);
  }

  /** Wind gets brighter at speed. */
  windSpeed(speed) {
    if (!this.ctx) return;
    this.loops.windFilter.frequency.setTargetAtTime(500 + speed * 80, this.ctx.currentTime, 0.3);
  }

  // ------------------------------------------------------------------
  // One-shot sounds
  // ------------------------------------------------------------------
  _playBuffer(name, vol = 1, rate = 1) {
    const b = this.buffers[name];
    if (!b) return false;
    const n = this.ctx.createBufferSource();
    n.buffer = b;
    n.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    n.connect(g);
    g.connect(this.sfxBus);
    n.start();
    return true;
  }

  _tone(freq, dur, type = 'sine', vol = 0.15, when = 0, slide = null) {
    const ctx = this.ctx, t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  _noiseHit(dur, freq, q, vol, when = 0, type = 'bandpass') {
    const ctx = this.ctx, t = ctx.currentTime + when;
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    n.loop = true; // long sounds (thunder) outlast the 2 s noise buffer
    const f = this._filter(type, freq, q);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f);
    f.connect(g);
    g.connect(this.sfxBus);
    n.start(t, Math.random());
    n.stop(t + dur + 0.05);
  }

  /**
   * Play a sound effect by name.
   * step, land, jump, clue, cash, checkpoint, caught, win, click, crash,
   * glass, whoosh, horn, spike, nitroStart, vault, door, locked,
   * flick, coin, block, uppercut
   */
  sfx(name, { vol = 1, rate = 1 } = {}) {
    if (!this.ctx) return;
    switch (name) {
      case 'step':
        if (this.surface === 'snow') { this.sfx('snowstep', { vol }); return; }
        if (!this._playBuffer(`step${Math.floor(Math.random() * 5)}`, 0.45 * vol, 0.92 + Math.random() * 0.16)) this._noiseHit(0.08, 900, 1, 0.2 * vol);
        return;
      case 'snowstep': { // a soft crunch in the snow: a low thud plus a short gritty squeak
        const r = 0.85 + Math.random() * 0.3;
        this._noiseHit(0.09, 700 * r, 1.6, 0.16 * vol, 0, 'bandpass');
        this._noiseHit(0.05, 2400 * r, 3, 0.05 * vol, 0.015, 'bandpass');
        this._tone(85 * r, 0.06, 'sine', 0.05 * vol);
        return;
      }
      case 'land':
        if (!this._playBuffer('land', vol, rate)) this._noiseHit(0.2, 300, 0.8, 0.5 * vol);
        return;
      case 'jump':
        this._noiseHit(0.12, 1800, 0.8, 0.08 * vol, 0, 'highpass');
        return;
      case 'crash': {
        const now = performance.now();
        if (now - this.lastImpact < 220) return;
        this.lastImpact = now;
        if (!this._playBuffer(Math.random() < 0.5 ? 'crash0' : 'crash1', vol, 0.85 + Math.random() * 0.25)) this._noiseHit(0.3, 260, 0.7, 0.7 * vol);
        this._tone(70, 0.25, 'square', 0.08 * vol, 0, 40);
        if (vol > 0.7 && Math.random() < 0.4) this._playBuffer('glass', 0.5 * vol);
        return;
      }
      case 'whoosh':
        this._noiseHit(0.45, 1200, 0.7, 0.35 * vol);
        return;
      case 'flick': // a coin flicked off the thumb
        this._tone(2400, 0.06, 'sine', 0.05 * vol, 0, 3200);
        return;
      case 'coin': // a coin landing: ting... ting.. ting
        [0, 0.15, 0.25, 0.31].forEach((w, i) => {
          const v = vol * (1 - i * 0.23);
          this._tone(3150 + i * 30, 0.18, 'sine', 0.06 * v, w);
          this._tone(4720, 0.1, 'sine', 0.03 * v, w);
        });
        return;
      case 'clang': // a bin or a hydrant knocked flying by a car
        this._noiseHit(0.14, 1300 + Math.random() * 600, 1.8, 0.35 * vol, 0, 'bandpass');
        this._tone(380 + Math.random() * 120, 0.18, 'triangle', 0.08 * vol, 0, 300);
        return;
      case 'block': // a punch blocked on a forearm
        this._noiseHit(0.1, 420, 1.4, 0.55 * vol);
        this._tone(140, 0.09, 'sine', 0.12 * vol, 0, 90);
        return;
      case 'uppercut': // the big punch at the end of a combo
        if (!this._playBuffer('land', vol, 0.75)) this._noiseHit(0.25, 260, 0.8, 0.6 * vol);
        this._tone(90, 0.22, 'sine', 0.22 * vol, 0, 45);
        return;
      case 'thunder':
        // A sharp crack, then a long low rumble
        this._noiseHit(0.35, 1800, 0.6, 0.25 * vol);
        this._noiseHit(3.2, 90, 0.7, 1.1 * vol, 0.05, 'lowpass');
        this._noiseHit(2.4, 160, 0.9, 0.6 * vol, 0.4, 'lowpass');
        return;
      case 'horn':
        this._tone(415, 0.45, 'square', 0.07 * vol);
        this._tone(523, 0.45, 'square', 0.06 * vol);
        return;
      case 'spike':
        this._noiseHit(0.5, 3000, 0.5, 0.5 * vol, 0, 'highpass');
        this._playBuffer('glass', 0.6 * vol, 0.7);
        return;
      case 'nitroStart':
        this._noiseHit(0.6, 600, 0.5, 0.4 * vol, 0, 'lowpass');
        return;
      case 'clue':
        if (!this._playBuffer('clue', 0.8 * vol)) { this._tone(880, 0.25, 'triangle', 0.18); this._tone(1320, 0.4, 'triangle', 0.14, 0.1); }
        return;
      case 'checkpoint':
        if (!this._playBuffer('checkpoint', 0.8 * vol)) { this._tone(660, 0.15, 'sine', 0.18); this._tone(990, 0.35, 'sine', 0.14, 0.12); }
        return;
      case 'caught':
        if (!this._playBuffer('caught', 0.8 * vol)) { this._tone(220, 0.4, 'square', 0.1); this._tone(165, 0.7, 'square', 0.1, 0.3); }
        return;
      case 'win':
        if (!this._playBuffer('win', 0.9 * vol)) [523, 659, 784, 1047].forEach((f, i) => this._tone(f, 0.5, 'triangle', 0.14, i * 0.12));
        return;
      case 'alarm': // an alarm bell ringing for a couple of seconds (a laser was touched)
        for (let i = 0; i < 9; i++) this._tone(i % 2 ? 680 : 920, 0.22, 'square', 0.06 * vol, i * 0.25);
        return;
      case 'sting': // dramatic chord for reveals
        this._tone(110, 1.6, 'sawtooth', 0.06 * vol);
        this._tone(116.5, 1.6, 'sawtooth', 0.05 * vol);
        this._tone(55, 2, 'sine', 0.2 * vol);
        return;
      default:
        if (!this._playBuffer(name, vol, rate) && name === 'click') this._tone(1200, 0.04, 'square', 0.04);
    }
  }
}

export const audio = new AudioManager();

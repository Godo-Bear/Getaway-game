import * as THREE from 'three';
import { makeRng } from '../core/utils.js';

// All shared materials and procedurally drawn textures live here.
// Textures are painted onto <canvas> elements at start-up, so the game has no
// image files to download. Materials are created once and shared by every
// mesh that uses them (sharing = fewer GPU state changes = faster).

function canvasTexture(size, draw, { srgb = true, repeat = true } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  draw(g, size);
  const tex = new THREE.CanvasTexture(canvas);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/** Sprinkle random specks for a gritty concrete/gravel look. */
function noise(g, size, count, colors, rng, maxSize = 2) {
  for (let i = 0; i < count; i++) {
    g.fillStyle = colors[Math.floor(rng() * colors.length)];
    const s = 1 + rng() * maxSize;
    g.fillRect(rng() * size, rng() * size, s, s);
  }
}

// One facade tile covers 8 windows across and 8 floors up.
export const FACADE_COLS = 8;
export const FACADE_ROWS = 8;
export const WINDOW_SPACING = 3.0; // metres between window centres
export const FLOOR_HEIGHT = 3.5;   // metres per floor
export const FACADE_UV = [FACADE_COLS * WINDOW_SPACING, FACADE_ROWS * FLOOR_HEIGHT];

/**
 * Building facade: a grid of windows. Returns two textures:
 *  - map: what the wall looks like in any light (grey wall, dark glass)
 *  - emissive: only the LIT windows, which glow on their own at night
 *  - dayMap: the same wall in daylight (the glass reflects the sky)
 */
function makeFacadeTextures(seed) {
  const rng = makeRng(seed);
  const size = 512;
  const cw = size / FACADE_COLS, ch = size / FACADE_ROWS;
  const lit = []; // decide which windows are lit once, use for both textures
  for (let y = 0; y < FACADE_ROWS; y++) {
    for (let x = 0; x < FACADE_COLS; x++) {
      const on = rng() < 0.32;
      // Mostly warm tungsten, some cool TV/office blue
      const warm = rng() < 0.78;
      const col = warm
        ? `hsl(${34 + rng() * 14}, 90%, ${52 + rng() * 18}%)`
        : `hsl(${195 + rng() * 25}, 65%, ${58 + rng() * 14}%)`;
      const blind = rng() < 0.3 ? rng() * 0.5 : 0; // half-drawn blinds
      lit.push({ x, y, on, col, blind, warm });
    }
  }

  const drawWindows = (g, emissive, day = false) => {
    for (const w of lit) {
      const wx = w.x * cw + cw * 0.27, ww = cw * 0.46;
      const wy = w.y * ch + ch * 0.25, wh = ch * 0.48;
      if (day) {
        // Sky reflected in the glass (lighter at the top), some with blinds
        const grad = g.createLinearGradient(0, wy, 0, wy + wh);
        grad.addColorStop(0, w.warm ? '#a9c6e2' : '#c4d8ea');
        grad.addColorStop(1, '#4c6a88');
        g.fillStyle = grad;
        g.fillRect(wx, wy, ww, wh);
        if (w.blind) { g.fillStyle = '#d8d2c2'; g.fillRect(wx, wy, ww, wh * w.blind); }
        g.fillStyle = '#9a9a9a';
        g.fillRect(wx - 2, wy + wh, ww + 4, 4);
        continue;
      }
      if (emissive) {
        if (!w.on) continue;
        g.fillStyle = w.col;
        g.fillRect(wx, wy + wh * w.blind, ww, wh * (1 - w.blind));
      } else {
        g.fillStyle = w.on ? w.col : '#0d1119';
        g.fillRect(wx, wy, ww, wh);
        // Sill
        g.fillStyle = '#9a9a9a';
        g.fillRect(wx - 2, wy + wh, ww + 4, 4);
      }
    }
  };

  const map = canvasTexture(size, (g) => {
    g.fillStyle = '#b8b8b8'; // neutral: tinted per building via vertex colour
    g.fillRect(0, 0, size, size);
    noise(g, size, 3000, ['#a9a9a9', '#c4c4c4', '#9f9f9f'], rng);
    // Floor bands
    g.fillStyle = 'rgba(0,0,0,0.12)';
    for (let y = 0; y < FACADE_ROWS; y++) g.fillRect(0, y * ch + ch - 6, size, 6);
    drawWindows(g, false);
  });
  const emissive = canvasTexture(size, (g) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, size, size);
    drawWindows(g, true);
  });
  const dayMap = canvasTexture(size, (g) => {
    g.fillStyle = '#b8b8b8';
    g.fillRect(0, 0, size, size);
    noise(g, size, 3000, ['#a9a9a9', '#c4c4c4', '#9f9f9f'], rng);
    g.fillStyle = 'rgba(0,0,0,0.12)';
    for (let y = 0; y < FACADE_ROWS; y++) g.fillRect(0, y * ch + ch - 6, size, 6);
    drawWindows(g, false, true);
  });
  return { map, emissive, dayMap };
}

let cache = null;

/** Create (once) and return every shared material. */
export function getMaterials() {
  if (cache) return cache;
  const rng = makeRng(42);

  const facade = makeFacadeTextures(7);

  const roofTex = canvasTexture(256, (g, s) => {
    g.fillStyle = '#5a5a5e';
    g.fillRect(0, 0, s, s);
    noise(g, s, 5000, ['#4a4a4e', '#6a6a6e', '#55555a', '#77777a'], rng, 2.5);
    // tar seams
    g.strokeStyle = 'rgba(20,20,22,0.6)';
    g.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.moveTo(0, (i + 0.5) * s / 4);
      g.lineTo(s, (i + 0.5) * s / 4 + rng() * 6 - 3);
      g.stroke();
    }
  });

  const concreteTex = canvasTexture(256, (g, s) => {
    g.fillStyle = '#8a8a88';
    g.fillRect(0, 0, s, s);
    noise(g, s, 4000, ['#7c7c7a', '#959593', '#838381'], rng, 2);
  });

  const asphaltTex = canvasTexture(256, (g, s) => {
    g.fillStyle = '#26272b';
    g.fillRect(0, 0, s, s);
    noise(g, s, 6000, ['#1f2024', '#2d2e33', '#34353a'], rng, 1.5);
  });

  const metalTex = canvasTexture(128, (g, s) => {
    g.fillStyle = '#9aa0a8';
    g.fillRect(0, 0, s, s);
    // Vent slats
    g.fillStyle = '#6d737b';
    for (let y = 8; y < s; y += 12) g.fillRect(0, y, s, 4);
  });

  const lambert = (opts) => new THREE.MeshLambertMaterial(opts);

  cache = {
    // Building walls: window texture + glowing lit windows. Vertex colour tints the wall.
    wall: lambert({
      map: facade.map,
      emissiveMap: facade.emissive,
      emissive: 0xffffff,
      emissiveIntensity: 1.4,
      vertexColors: true,
    }),
    facade, // (the lighting swaps wall.map to facade.dayMap in daylight)
    // Plain walls (stairwell huts, parapets, side walls without windows)
    concrete: lambert({ map: concreteTex, vertexColors: true }),
    roof: lambert({ map: roofTex, vertexColors: true }),
    asphalt: lambert({ map: asphaltTex, vertexColors: true }),
    metal: lambert({ map: metalTex, vertexColors: true }),
    // Solid colours (props, trims); vertex colour gives the actual colour
    plain: lambert({ color: 0xffffff, vertexColors: true }),
    // Things that glow on their own (lamp heads, neon, markers)
    glow: new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, toneMapped: false }),
  };
  return cache;
}

/** Additive, see-through glow for light beams, halos and cones. */
export function makeGlowMaterial(color, opacity = 0.3) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
}

/** Soft round glow sprite texture (for lamp halos). */
let glowTex = null;
export function getGlowTexture() {
  if (glowTex) return glowTex;
  glowTex = canvasTexture(128, (g, s) => {
    const grad = g.createRadialGradient(s / 2, s / 2, 2, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.3, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  }, { repeat: false });
  return glowTex;
}

/** Canvas texture with text on it (neon signs, labels). */
export function makeTextTexture(text, { color = '#ff3fa4', bg = 'rgba(0,0,0,0)', width = 512, height = 128,
  font = 'bold 84px "Bebas Neue", Impact, sans-serif', glow = true } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, width, height);
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (glow) {
    g.shadowColor = color;
    g.shadowBlur = 18;
  }
  g.fillStyle = color;
  g.fillText(text, width / 2, height / 2 + 4);
  g.fillText(text, width / 2, height / 2 + 4); // twice = brighter glow
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

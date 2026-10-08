import * as THREE from 'three';

// Neon Kōji (Chapters 16-18): a huge city on the other side of the world.
// Dark towers, and neon everywhere: tall vertical signs sticking out from the
// walls, glowing strips round the roof edges, giant lit billboards on the
// towers, pink cherry trees. Both cities (the streets you drive and the
// rooftops) dress their buildings with this.

/** Dark wall colours (8, like the other places' lists). */
export const NEON_TINTS = [0x2a2c36, 0x30323e, 0x24262e, 0x3a3644, 0x2c3440, 0x34303a, 0x282e36, 0x3e3a48];
export const NEON_GLASS = [0x2a3a58, 0x243048, 0x3a2a58, 0x1e3448];
const COLORS = ['#ff3fa4', '#2fe0ff', '#b46cff', '#ffd040', '#4dffa6', '#ff6a3a'];
/** Words for the signs (the city's shops and bars). */
export const NEON_WORDS = ['RAMEN', 'KARAOKE', 'ARCADE', 'HOTEL', 'SUSHI', 'NOODLES', 'PACHINKO', 'CAFE', 'BAR', 'GAMES', 'TAXI', 'KOJI'];

const cache = new Map();
/** A tall sign: the letters stacked top to bottom, glowing. */
function verticalTexture(text, color) {
  const key = text + color;
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = 96; c.height = 64 + text.length * 72;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(8,8,16,0.85)';
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = color; g.lineWidth = 6; g.strokeRect(5, 5, c.width - 10, c.height - 10);
  g.font = 'bold 64px "Bebas Neue", Impact, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = color; g.shadowBlur = 18; g.fillStyle = '#ffffff';
  [...text].forEach((ch, i) => g.fillText(ch, c.width / 2, 68 + i * 72));
  g.shadowBlur = 0; g.fillStyle = color; g.globalAlpha = 0.35;
  [...text].forEach((ch, i) => g.fillText(ch, c.width / 2, 68 + i * 72));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}

/** A giant billboard: a bright gradient with a slogan. */
function billboardTexture(i) {
  const key = 'bb' + i;
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = 512; c.height = 288;
  const g = c.getContext('2d');
  const pairs = [['#ff3fa4', '#5a1aff'], ['#2fe0ff', '#1a2aff'], ['#ffd040', '#ff3a3a'], ['#4dffa6', '#1a8aff']];
  const [a, b] = pairs[i % pairs.length];
  const grad = g.createLinearGradient(0, 0, 512, 288);
  grad.addColorStop(0, a); grad.addColorStop(1, b);
  g.fillStyle = grad; g.fillRect(0, 0, 512, 288);
  g.fillStyle = 'rgba(255,255,255,0.12)';
  for (let k = 0; k < 6; k++) { g.beginPath(); g.arc(80 + k * 80, 140 + Math.sin(k) * 60, 40 + k * 6, 0, Math.PI * 2); g.fill(); }
  g.font = 'bold 120px "Bebas Neue", Impact, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ffffff';
  g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 12;
  g.fillText(['KITSUNE COLA', 'NEO GAMES', 'SILVER ARROW', 'HYPER RAMEN'][i % 4], 256, 150);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}

/**
 * Neon on a list of buildings ({x0, x1, z0, z1, h}).
 * @param {() => number} rng - its own random numbers (decoration only)
 * @param {{signChance?: number, minY?: number}} [opts]
 */
export function buildNeonDressing(buildings, rng, { signChance = 0.5, minY = 3 } = {}) {
  const g = new THREE.Group();
  const pick = (a) => a[Math.floor(rng() * a.length)];
  // glowing strips round the roof edges (and one band lower down on some)
  const strips = [];
  for (const b of buildings) {
    if (rng() < 0.55) strips.push([b, b.h - 0.15, pick(COLORS)]);
    if (rng() < 0.6) strips.push([b, minY - 0.4, pick(COLORS)]);                // over the shop fronts (eye level)
    if (b.h > 14 && rng() < 0.35) strips.push([b, Math.round(rng() * (b.h - 8)) + 5, pick(COLORS)]);
  }
  if (strips.length) {
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), strips.length * 4);
    const o = new THREE.Object3D(), col = new THREE.Color();
    let n = 0;
    for (const [b, y, c] of strips) {
      const w = b.x1 - b.x0, d = b.z1 - b.z0, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
      for (const [x, z, sx, sz] of [[cx, b.z0 - 0.06, w + 0.12, 0.12], [cx, b.z1 + 0.06, w + 0.12, 0.12], [b.x0 - 0.06, cz, 0.12, d], [b.x1 + 0.06, cz, 0.12, d]]) {
        o.position.set(x, y, z);
        o.scale.set(sx, 0.18, sz);
        o.updateMatrix();
        im.setMatrixAt(n, o.matrix);
        im.setColorAt(n, col.set(c));
        n++;
      }
    }
    g.add(im);
  }
  // tall signs sticking out from the walls, and billboards on the towers
  for (const b of buildings) {
    if (rng() < signChance && b.h > minY + 6) {
      const text = pick(NEON_WORDS), color = pick(COLORS);
      const tex = verticalTexture(text, color);
      const hgt = Math.min(b.h - minY - 1, 1.5 * text.length + 1.2);
      const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2, hgt), mat);
      const y = minY + hgt / 2 + rng() * Math.min(4, Math.max(0, b.h - hgt - minY - 1)); // (low down: where you can see them from the street)
      // on one of the corners, sticking out at right angles to the wall
      const side = Math.floor(rng() * 4);
      const along = rng() < 0.5 ? 0.15 : 0.85;
      if (side < 2) { m.position.set(b.x0 + (b.x1 - b.x0) * along, y, side ? b.z1 + 1.05 : b.z0 - 1.05); m.rotation.y = Math.PI / 2; }
      else { m.position.set(side === 3 ? b.x1 + 1.05 : b.x0 - 1.05, y, b.z0 + (b.z1 - b.z0) * along); }
      g.add(m);
    }
    if (b.h > 26 && rng() < 0.45) {
      const w = Math.min(b.x1 - b.x0, 16) * 0.8;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.56), new THREE.MeshBasicMaterial({ map: billboardTexture(Math.floor(rng() * 4)), toneMapped: false }));
      m.position.set((b.x0 + b.x1) / 2, b.h - w * 0.4, b.z0 - 0.15);
      m.rotation.y = Math.PI;
      g.add(m);
    }
  }
  return g;
}

/** Cherry trees (pink blossom) instead of green ones. */
export const BLOSSOM = 0xf0a0c8;

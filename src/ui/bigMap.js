// Big city map (press M while driving, or tap the minimap on a phone).
//
// Shows the whole city from above, north up: you, the police, the current
// goal, parking garages and your waypoint. Click or tap anywhere to put a
// waypoint there; it then shows on the minimap, as a pink light beam in the
// city and as an on-screen pointer, until you reach it or clear it.

export class BigMap {
  /**
   * @param {import('./minimap.js').Minimap} minimap - reuses its pre-drawn city picture
   */
  constructor(minimap) {
    this.minimap = minimap;
    this.root = document.getElementById('bigmap');
    this.canvas = document.getElementById('bigmap-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.isOpen = false;
    this._onPick = null;
    this._onClose = null;
    this._info = null;
    this.canvas.addEventListener('pointerdown', (e) => this._pick(e));
    document.getElementById('bigmap-clear').addEventListener('click', () => { this._onPick?.(null); this._draw(); });
    document.getElementById('bigmap-close').addEventListener('click', () => this.close());
  }

  /**
   * @param {object} info - { player:{x,z,heading}, dots, target, targetColor, waypoint }
   * @param {(p:{x:number,z:number}|null) => void} onPick - new waypoint (null = cleared)
   * @param {() => void} onClose
   */
  open(info, onPick, onClose) {
    this._info = info;
    this._onPick = (p) => { info.waypoint = p; onPick(p); };
    this._onClose = onClose;
    this.isOpen = true;
    this.root.hidden = false;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = Math.round(this.canvas.getBoundingClientRect().width * dpr) || 600;
    this.canvas.width = this.canvas.height = size;
    this._draw();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.hidden = true;
    this._onClose?.();
  }

  /** Canvas pixel -> world (x, z). The map shows the whole city, north up. */
  _toWorld(px, py) {
    const mm = this.minimap, S = this.canvas.width;
    return { x: mm.min + (px / S) * mm.span, z: mm.min + (py / S) * mm.span };
  }

  _pick(e) {
    e.preventDefault();
    const r = this.canvas.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * this.canvas.width;
    const py = ((e.clientY - r.top) / r.height) * this.canvas.height;
    this._onPick?.(this._toWorld(px, py));
    this._draw();
  }

  _draw() {
    const g = this.ctx, S = this.canvas.width, mm = this.minimap, info = this._info;
    const k = S / mm.span;
    const P = (x, z) => [(x - mm.min) * k, (z - mm.min) * k];
    g.clearRect(0, 0, S, S);
    g.drawImage(mm.cityImage, 0, 0, S, S);
    const dot = (x, z, r, color, stroke) => {
      const [px, py] = P(x, z);
      g.fillStyle = color;
      g.beginPath();
      g.arc(px, py, r, 0, Math.PI * 2);
      g.fill();
      if (stroke) { g.strokeStyle = stroke; g.lineWidth = 2; g.stroke(); }
    };
    if (info.target) dot(info.target.x, info.target.z, S * 0.014, info.targetColor || '#4dffa6', '#000');
    for (const d of info.dots) dot(d.x, d.z, S * 0.008 * (d.size || 1), d.color);
    // Waypoint: a pink diamond
    if (info.waypoint) {
      const [px, py] = P(info.waypoint.x, info.waypoint.z);
      const s = S * 0.018;
      g.fillStyle = '#ff5ad0';
      g.strokeStyle = '#000';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(px, py - s); g.lineTo(px + s, py); g.lineTo(px, py + s); g.lineTo(px - s, py); g.closePath();
      g.fill();
      g.stroke();
    }
    // You: an arrow pointing the way the car faces
    const [px, py] = P(info.player.x, info.player.z);
    g.save();
    g.translate(px, py);
    g.rotate(Math.PI - info.player.heading); // heading 0 = +Z = down the map
    const a = S * 0.022;
    g.fillStyle = '#ffb020';
    g.strokeStyle = '#000';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, -a); g.lineTo(a * 0.7, a * 0.8); g.lineTo(0, a * 0.4); g.lineTo(-a * 0.7, a * 0.8); g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }
}

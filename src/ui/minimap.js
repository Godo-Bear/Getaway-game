// Minimap: a small rotating map in the corner.
//
// The whole city layout (roads, buildings, parks) is drawn ONCE onto a large
// off-screen canvas when the level loads. Every frame we just copy the part
// around the player onto the small visible canvas, rotated so "up" is the
// direction you're driving, then draw dots for police, the target and you.

const VIEW_RADIUS = 110;  // metres shown from the centre to the edge

export class Minimap {
  constructor(canvas, city) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = 180 * dpr;
    canvas.height = 180 * dpr;
    this.size = canvas.width;

    // --- Pre-render the city at 1 pixel per metre ---
    const { min, max } = city.bounds;
    this.min = min;
    this.span = max - min;
    const off = document.createElement('canvas');
    off.width = off.height = Math.ceil(this.span);
    const g = off.getContext('2d');
    g.fillStyle = '#3a3e4a'; // roads (everything not covered is road)
    g.fillRect(0, 0, off.width, off.height);
    for (const s of city.minimapShapes) {
      g.fillStyle = s.type === 'park' ? '#1f4a2a' : '#12151d';
      g.fillRect(s.x0 - min, s.z0 - min, s.x1 - s.x0, s.z1 - s.z0);
    }
    for (const a of city.alleys) {
      g.fillStyle = '#2c3038';
      g.fillRect(a.x0 - min, a.z0 - min, a.x1 - a.x0, a.z1 - a.z0);
    }
    this.cityImage = off;
  }

  /**
   * @param {{x:number,z:number,heading:number}} player
   * @param {{x:number,z:number,color:string}[]} dots
   * @param {{x:number,z:number}|null} target
   */
  draw(player, dots, target, time) {
    const g = this.ctx, S = this.size, scale = S / (VIEW_RADIUS * 2);
    g.save();
    g.clearRect(0, 0, S, S);
    // Circular clip
    g.beginPath();
    g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#07090f';
    g.fillRect(0, 0, S, S);

    // World -> map: centre on player, rotate so the car's forward points up.
    // Map x = world x, map y = world z. Car forward = (sin h, cos h).
    g.translate(S / 2, S / 2);
    g.scale(scale, scale);
    g.rotate(Math.PI + player.heading);
    g.translate(-player.x, -player.z);
    g.drawImage(this.cityImage, this.min, this.min);

    // Target beacon
    if (target) {
      g.fillStyle = '#4dffa6';
      g.beginPath();
      g.arc(target.x, target.z, 6 / scale * 0.9, 0, Math.PI * 2);
      g.fill();
    }
    // Police and other dots
    for (const d of dots) {
      g.fillStyle = d.color;
      g.beginPath();
      g.arc(d.x, d.z, 4 / scale, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();

    // Target direction arrow on the rim when off-map
    if (target) {
      const dx = target.x - player.x, dz = target.z - player.z;
      const dist = Math.hypot(dx, dz);
      if (dist > VIEW_RADIUS * 0.9) {
        // Angle relative to the car's heading (0 = straight ahead = up)
        const ang = Math.atan2(dx, dz) - player.heading;
        const r = S / 2 - 10;
        const x = S / 2 - Math.sin(ang) * r, y = S / 2 - Math.cos(ang) * r;
        g.fillStyle = '#4dffa6';
        g.beginPath();
        g.arc(x, y, 6, 0, Math.PI * 2);
        g.fill();
      }
    }

    // Player arrow in the centre (always pointing up)
    g.save();
    g.translate(S / 2, S / 2);
    g.fillStyle = '#ffb020';
    g.strokeStyle = '#000';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, -10);
    g.lineTo(7, 8);
    g.lineTo(0, 4);
    g.lineTo(-7, 8);
    g.closePath();
    g.stroke();
    g.fill();
    g.restore();

    // Rim
    g.strokeStyle = 'rgba(255,255,255,0.25)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2);
    g.stroke();
  }
}

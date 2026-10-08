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
      if (s.type === 'bridge' || s.type === 'garage' || s.type === 'tunnel' || s.type === 'station' || s.type === 'subwayRamp') continue;
      g.fillStyle = { park: '#1f4a2a', shop: '#4a3418', ladder: '#ffd040', water: '#1d4470' }[s.type] || '#12151d';
      g.fillRect(s.x0 - min, s.z0 - min, s.x1 - s.x0, s.z1 - s.z0);
    }
    // The subway: tunnels (dashed, see-through), stations, and the ramps down (solid blue)
    for (const s of city.minimapShapes) {
      if (s.type !== 'tunnel' && s.type !== 'station') continue;
      g.fillStyle = s.type === 'station' ? 'rgba(90,140,255,0.55)' : 'rgba(40,90,200,0.28)';
      g.fillRect(s.x0 - min, s.z0 - min, s.x1 - s.x0, s.z1 - s.z0);
      g.save();
      g.setLineDash([6, 5]);
      g.strokeStyle = 'rgba(120,170,255,0.8)';
      g.lineWidth = 1.5;
      g.strokeRect(s.x0 - min, s.z0 - min, s.x1 - s.x0, s.z1 - s.z0);
      g.restore();
    }
    for (const s of city.minimapShapes) {
      if (s.type !== 'subwayRamp') continue;
      g.fillStyle = '#3d7bff';
      g.fillRect(s.x0 - min, s.z0 - min, s.x1 - s.x0, s.z1 - s.z0);
    }
    for (const s of city.minimapShapes) {
      if (s.type !== 'bridge') continue;
      g.fillStyle = 'rgba(120,130,150,0.35)';
      g.fillRect(s.x0 - min, s.z0 - min, s.x1 - s.x0, s.z1 - s.z0);
    }
    // Parking garages (hiding spots): blue with a white P
    for (const s of city.minimapShapes) {
      if (s.type !== 'garage') continue;
      g.fillStyle = '#2a5ad8';
      g.fillRect(s.x0 - min, s.z0 - min, s.x1 - s.x0, s.z1 - s.z0);
      g.fillStyle = '#ffffff';
      g.font = 'bold 14px Arial, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('P', (s.x0 + s.x1) / 2 - min, (s.z0 + s.z1) / 2 - min);
    }
    for (const a of city.alleys || []) {
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
  draw(player, dots, target, time, targetColor = '#4dffa6', search = null, waypoint = null) {
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
      g.fillStyle = targetColor;
      g.beginPath();
      g.arc(target.x, target.z, 6 / scale * 0.9, 0, Math.PI * 2);
      g.fill();
    }
    // Area the police are searching (after you've lost them)
    if (search) {
      g.fillStyle = 'rgba(255,51,70,0.12)';
      g.strokeStyle = 'rgba(255,51,70,0.6)';
      g.lineWidth = 2 / scale;
      g.beginPath();
      g.arc(search.x, search.z, search.r, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    // Police and other dots
    for (const d of dots) {
      g.fillStyle = d.color;
      g.beginPath();
      g.arc(d.x, d.z, (4 * (d.size || 1)) / scale, 0, Math.PI * 2);
      g.fill();
    }
    // Your waypoint (set on the big map): a pink diamond
    if (waypoint) {
      const s = 7 / scale;
      g.fillStyle = '#ff5ad0';
      g.beginPath();
      g.moveTo(waypoint.x, waypoint.z - s); g.lineTo(waypoint.x + s, waypoint.z);
      g.lineTo(waypoint.x, waypoint.z + s); g.lineTo(waypoint.x - s, waypoint.z);
      g.fill();
    }
    g.restore();

    // Waypoint direction on the rim when it's off the minimap
    if (waypoint) {
      const dx = waypoint.x - player.x, dz = waypoint.z - player.z;
      if (Math.hypot(dx, dz) > VIEW_RADIUS * 0.9) {
        const ang = Math.atan2(dx, dz) - player.heading;
        const r = S / 2 - 10;
        g.fillStyle = '#ff5ad0';
        g.beginPath();
        g.arc(S / 2 - Math.sin(ang) * r, S / 2 - Math.cos(ang) * r, 5, 0, Math.PI * 2);
        g.fill();
      }
    }

    // Target direction arrow on the rim when off-map
    if (target) {
      const dx = target.x - player.x, dz = target.z - player.z;
      const dist = Math.hypot(dx, dz);
      if (dist > VIEW_RADIUS * 0.9) {
        // Angle relative to the car's heading (0 = straight ahead = up)
        const ang = Math.atan2(dx, dz) - player.heading;
        const r = S / 2 - 10;
        const x = S / 2 - Math.sin(ang) * r, y = S / 2 - Math.cos(ang) * r;
        g.fillStyle = targetColor;
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

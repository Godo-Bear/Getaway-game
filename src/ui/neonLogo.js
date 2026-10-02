// The title logo: GETAWAY as an amber neon-tube sign, to match the app icon's G.
//
// Each letter's outline comes from the title font (Bebas Neue), so the logo
// looks the same on every device, even before the web font has loaded. Every
// letter is drawn as a neon tube: a wide soft glow, a tighter glow, the glass
// tube (golden at the top, deep orange at the bottom) and a hot white core.
// The sign flickers on the first time the title screen appears, the W buzzes
// now and then, and a glint twinkles on the top of the G (style.css, .neon-logo).

const LETTERS = [
  "M19.70 101Q11.70 101 7.50 96.45Q3.30 91.90 3.30 83.40L3.30 83.40L3.30 46.60Q3.30 38.10 7.50 33.55Q11.70 29 19.70 29L19.70 29Q27.70 29 31.90 33.55Q36.10 38.10 36.10 46.60L36.10 46.60L36.10 52.60L25.70 52.60L25.70 45.90Q25.70 39 20 39L20 39Q14.30 39 14.30 45.90L14.30 45.90L14.30 84.20Q14.30 91 20 91L20 91Q25.70 91 25.70 84.20L25.70 84.20L25.70 70.50L20.20 70.50L20.20 60.50L36.10 60.50L36.10 83.40Q36.10 91.90 31.90 96.45Q27.70 101 19.70 101L19.70 101Z",
  "M46.20 100L46.20 30L76.20 30L76.20 40L57.20 40L57.20 58.50L72.30 58.50L72.30 68.50L57.20 68.50L57.20 90L76.20 90L76.20 100L46.20 100Z",
  "M94.10 100L94.10 40L82.60 40L82.60 30L116.60 30L116.60 40L105.10 40L105.10 100L94.10 100Z",
  "M117.40 100L128.80 30L143.70 30L155.10 100L144.10 100L142.10 86.10L142.10 86.30L129.60 86.30L127.60 100L117.40 100ZM130.90 76.80L140.80 76.80L135.90 42.20L135.70 42.20L130.90 76.80Z",
  "M166.50 100L159.40 30L170 30L174.90 83.80L175.10 83.80L180.30 30L192.30 30L197.50 83.80L197.70 83.80L202.60 30L212.10 30L205 100L191.30 100L186.30 52.80L186.10 52.80L181.10 100L166.50 100Z",
  "M216.40 100L227.80 30L242.70 30L254.10 100L243.10 100L241.10 86.10L241.10 86.30L228.60 86.30L226.60 100L216.40 100ZM229.90 76.80L239.80 76.80L234.90 42.20L234.70 42.20L229.90 76.80Z",
  "M267.90 100L267.90 70.20L254.60 30L266.30 30L273.80 55.70L274 55.70L281.50 30L292.20 30L278.90 70.20L278.90 100L267.90 100Z"
];
const VIEW = '-26.7 15.0 328.1 100.0';
const GLINT = [21.5, 30.2]; // on the top curve of the G (after the slant)
let shown = false; // the sign only flickers on the first time

export function neonLogoSvg() {
  const on = !shown;
  shown = true;
  const defs = LETTERS.map((d, i) => `<path id="nl-p${i}" d="${d}"/>`).join('');
  const letters = LETTERS.map((_, i) => `<g class="nl-l nl-l${i}" style="--i:${i}">` +
    `<use href="#nl-p${i}" class="nl-w"/><use href="#nl-p${i}" class="nl-g"/><use href="#nl-p${i}" class="nl-t"/><use href="#nl-p${i}" class="nl-c"/></g>`).join('');
  return `<svg class="neon-logo${on ? ' nl-on' : ''}" viewBox="${VIEW}" role="img" aria-label="Getaway">
    <defs>${defs}
      <linearGradient id="nl-tube" gradientUnits="userSpaceOnUse" x1="0" y1="29" x2="0" y2="101">
        <stop offset="0" stop-color="#ffe7a2"/><stop offset="0.45" stop-color="#ffb020"/><stop offset="1" stop-color="#ff5a12"/></linearGradient>
      <filter id="nl-wide" x="-40%" y="-60%" width="180%" height="220%"><feGaussianBlur stdDeviation="5.5"/></filter>
      <filter id="nl-soft" x="-40%" y="-60%" width="180%" height="220%"><feGaussianBlur stdDeviation="1.6"/></filter>
      <radialGradient id="nl-glint-r"><stop offset="0" stop-color="#fffaf0"/><stop offset="0.3" stop-color="#ffe6b0" stop-opacity="0.85"/><stop offset="1" stop-color="#ffb020" stop-opacity="0"/></radialGradient>
      <linearGradient id="nl-glint-h"><stop offset="0" stop-color="#fff2d0" stop-opacity="0"/><stop offset="0.5" stop-color="#fffaf0"/><stop offset="1" stop-color="#fff2d0" stop-opacity="0"/></linearGradient>
      <linearGradient id="nl-glint-v" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fff2d0" stop-opacity="0"/><stop offset="0.5" stop-color="#fffaf0"/><stop offset="1" stop-color="#fff2d0" stop-opacity="0"/></linearGradient>
    </defs>
    <g transform="skewX(-9)">${letters}</g>
    <g transform="translate(${GLINT[0]} ${GLINT[1]})"><g class="nl-glint">
      <circle r="8" fill="url(#nl-glint-r)"/><rect x="-24" y="-0.55" width="48" height="1.1" fill="url(#nl-glint-h)"/><rect x="-0.5" y="-13" width="1" height="26" fill="url(#nl-glint-v)"/>
    </g></g>
  </svg>`;
}

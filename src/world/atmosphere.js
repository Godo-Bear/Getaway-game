import * as THREE from 'three';

// Two shared effects that make the world feel more solid:
//
// 1. A reflection map: a tiny picture of the sky all round (sky colours,
//    a skyline with lit windows at night, or snowy mountains in Frostvale,
//    the sun or moon), painted on six canvases. Car paint, glass, chrome and
//    building windows reflect it, so they catch the light as the camera
//    moves. It's repainted when the time of day changes. (Cheap: no extra
//    rendering, just a texture lookup.)
//
// 2. Light beams: soft cones of light under street lamps and in front of
//    headlights. They only show at night in rain or snow (light catching
//    the raindrops and flakes), and fade at their edges and in the fog.

// ---------------------------------------------------------------- reflections
const FACE = 64;
let env = null;

function makeCanvas() {
  const c = document.createElement('canvas');
  c.width = c.height = FACE;
  return c;
}

/** The shared reflection cube map (call paintEnvMap to set its colours). */
export function getEnvMap() {
  if (env) return env.texture;
  const canvases = Array.from({ length: 6 }, makeCanvas);
  const texture = new THREE.CubeTexture(canvases);
  texture.colorSpace = THREE.SRGBColorSpace;
  env = { canvases, texture, key: '' };
  return texture;
}

const css = (c, k = 1) => `rgb(${Math.round(Math.min(1, c.r * k) * 255)},${Math.round(Math.min(1, c.g * k) * 255)},${Math.round(Math.min(1, c.b * k) * 255)})`;
const rand = (s) => { const x = Math.sin(s * 127.1) * 43758.5453; return x - Math.floor(x); };

/**
 * Repaint the reflections for a lighting look (NightLighting's colours).
 * @param {object} look - { zen, hor, glow, win, sun } (THREE.Color / numbers)
 * @param {{snow?:boolean, sunDir?:THREE.Vector3}} opts
 */
export function paintEnvMap(look, { snow = false, sunDir = null } = {}) {
  getEnvMap();
  const key = [look.zen.getHexString(), look.hor.getHexString(), look.win.toFixed(2), snow, sunDir ? sunDir.toArray().map((v) => v.toFixed(1)).join() : ''].join('|');
  if (key === env.key) return; // (nothing changed)
  env.key = key;
  const night = Math.min(1, look.win / 1.4);
  const [px, nx, py, ny, pz, nz] = env.canvases;
  // Sides: sky gradient on top, a skyline (or mountains) across the middle, ground below
  [px, nx, pz, nz].forEach((c, f) => {
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, FACE / 2);
    grad.addColorStop(0, css(look.zen));
    grad.addColorStop(0.8, css(look.hor));
    grad.addColorStop(1, css(look.glow, 0.6 + night * 0.4));
    g.fillStyle = grad;
    g.fillRect(0, 0, FACE, FACE / 2);
    g.fillStyle = snow ? '#c8d2de' : css(look.hor, 0.18 + (1 - night) * 0.25);
    g.fillRect(0, FACE / 2, FACE, FACE / 2);
    if (snow) {
      // Snowy mountains
      for (let k = 0; k < 4; k++) {
        const x = rand(f * 7 + k) * FACE, w = 18 + rand(f * 13 + k) * 22, h = 10 + rand(f * 3 + k) * 14;
        g.fillStyle = css(look.hor, 0.55 + night * 0.1);
        g.beginPath(); g.moveTo(x - w, FACE / 2); g.lineTo(x, FACE / 2 - h); g.lineTo(x + w, FACE / 2); g.fill();
        g.fillStyle = night > 0.5 ? '#8a94a8' : '#eef2f8';
        g.beginPath(); g.moveTo(x - w * 0.35, FACE / 2 - h * 0.65); g.lineTo(x, FACE / 2 - h); g.lineTo(x + w * 0.35, FACE / 2 - h * 0.65); g.fill();
      }
    } else {
      // Skyline: dark blocks with lit windows at night, pale ones by day
      for (let x = 0; x < FACE;) {
        const w = 4 + rand(f * 31 + x) * 7, h = 4 + rand(f * 17 + x * 3) * 16;
        g.fillStyle = night > 0.5 ? '#0c0e16' : css(look.hor, 0.62);
        g.fillRect(x, FACE / 2 - h, w - 1, h);
        if (night > 0.3) {
          for (let wy = FACE / 2 - h + 2; wy < FACE / 2 - 1; wy += 2) {
            for (let wx = x + 1; wx < x + w - 2; wx += 2) {
              if (rand(wx * 7.3 + wy * 3.1 + f) < 0.28) { g.fillStyle = rand(wx + wy) < 0.8 ? '#ffc070' : '#9fd4ff'; g.fillRect(wx, wy, 1, 1); }
            }
          }
        }
        x += w;
      }
      // Street lights along the bottom of the skyline
      if (night > 0.3) { g.fillStyle = 'rgba(255,170,80,0.55)'; g.fillRect(0, FACE / 2, FACE, 2); }
    }
  });
  // Top: the sky overhead, with the sun or moon
  {
    const g = py.getContext('2d');
    const grad = g.createRadialGradient(FACE / 2, FACE / 2, 0, FACE / 2, FACE / 2, FACE * 0.72);
    grad.addColorStop(0, css(look.zen));
    grad.addColorStop(1, css(look.hor));
    g.fillStyle = grad;
    g.fillRect(0, 0, FACE, FACE);
    if (sunDir && sunDir.y > 0.2) {
      const sx = FACE / 2 + (sunDir.x / sunDir.y) * FACE / 2, sz = FACE / 2 + (sunDir.z / sunDir.y) * FACE / 2;
      const s = g.createRadialGradient(sx, sz, 0, sx, sz, 14);
      s.addColorStop(0, look.sun > 0.5 ? 'rgba(255,248,230,1)' : 'rgba(220,230,255,0.9)');
      s.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = s;
      g.fillRect(0, 0, FACE, FACE);
    }
  }
  // Bottom: the ground
  {
    const g = ny.getContext('2d');
    g.fillStyle = snow ? '#aab4c2' : css(look.hor, 0.12);
    g.fillRect(0, 0, FACE, FACE);
  }
  env.texture.needsUpdate = true;
}

/**
 * Give a Phong material reflections. amount: 0 (none) .. 1 (a mirror).
 * The material keeps its own colour; the reflection is mixed in on top.
 */
export function addReflections(material, amount) {
  material.envMap = getEnvMap();
  material.combine = THREE.MixOperation;
  material.reflectivity = amount;
  material.needsUpdate = true;
  return material;
}

// ---------------------------------------------------------------- light beams
const shaft = { night: 0, weather: 0, materials: [] };

const SHAFT_VERT = /* glsl */`
  varying float vAlong;   // 1 at the lamp, 0 at the far end
  varying float vEdge;    // 1 facing you, 0 at the cone's edges
  #include <fog_pars_vertex>
  void main() {
    vec4 local = vec4(position, 1.0);
    vec3 n = normal;
    #ifdef USE_INSTANCING
      local = instanceMatrix * local;
      n = mat3(instanceMatrix) * n;
    #endif
    vec4 mvPosition = modelViewMatrix * local;
    vec3 nv = normalize(normalMatrix * n);
    vEdge = abs(dot(nv, normalize(-mvPosition.xyz)));
    vAlong = uv.y;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const SHAFT_FRAG = /* glsl */`
  uniform vec3 color;
  uniform float strength;
  varying float vAlong;
  varying float vEdge;
  #include <fog_pars_fragment>
  void main() {
    float a = strength * pow(vAlong, 1.4) * pow(vEdge, 2.0);
    #ifdef USE_FOG
      #ifdef FOG_EXP2
        float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
      #else
        float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
      #endif
      a *= 1.0 - fogFactor;
    #endif
    gl_FragColor = vec4(color * a, 1.0);
  }`;

/** The soft beam material (additive). color: the light's colour; k: how bright. */
export function makeShaftMaterial(color, k = 0.35) {
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { color: { value: new THREE.Color(color) }, strength: { value: 0 } }]),
    vertexShader: SHAFT_VERT, fragmentShader: SHAFT_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true,
  });
  m.userData.shaftK = k;
  shaft.materials.push(new WeakRef(m));
  applyShaft(m);
  return m;
}

function applyShaft(m) {
  const s = shaft.night * shaft.weather * m.userData.shaftK;
  m.uniforms.strength.value = s;
  m.visible = s > 0.005;
}

function refreshShafts() {
  shaft.materials = shaft.materials.filter((r) => { const m = r.deref(); if (m) applyShaft(m); return !!m; });
}

/** How dark it is (0 day .. 1 night): set by the lighting. */
export function setShaftNight(k) { shaft.night = k; refreshShafts(); }
/** The weather: beams only show in rain and snow. */
export function setShaftWeather(kind) {
  shaft.weather = { rain: 1, storm: 1.15, snow: 0.9, blizzard: 1.3 }[kind] ?? 0;
  refreshShafts();
}

/** A cone hanging down from a lamp head: open, wide at the bottom (uv.y = 1 at the top). */
export function lampShaftGeometry(height = 6.6, topR = 0.3, bottomR = 3.2) {
  const g = new THREE.CylinderGeometry(topR, bottomR, height, 16, 1, true);
  g.translate(0, -height / 2, 0);
  return g;
}

/** A cone pointing forward (+Z) from a headlight (uv.y = 1 at the lamp). */
export function headlightShaftGeometry(length = 15, startR = 0.12, endR = 2.6) {
  const g = new THREE.CylinderGeometry(startR, endR, length, 14, 1, true);
  g.translate(0, -length / 2, 0);
  g.rotateX(-Math.PI / 2 + 0.06); // point forward, dipping a little toward the road
  return g;
}

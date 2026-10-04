import * as THREE from 'three';
import { PlayerModel } from '../player/playerModel.js';

// The live preview next to the "Your look" card: your character on a little
// lit turntable that turns slowly by itself. Drag it to spin it round, or
// switch to a close-up to check your face, hair and hat.
//
// It has its own small renderer (so it works from the title screen too,
// where there's no character in the scene). It lives inside the menu overlay
// and only shows while the overlay has the `has-preview` class: every other
// menu card removes that class (menus.js), so it can't get left behind.

const VIEWS = {
  body: { y: 1.02, dist: 5.6 },
  face: { y: 1.72, dist: 1.55 },
};
const AUTO_SPIN = 0.45; // radians a second, until you drag it

let P = null;

/** A soft round glow texture (the floor spot and the shadow under your feet). */
function radial(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function build() {
  const overlay = document.getElementById('overlay');
  const el = document.createElement('div');
  el.id = 'look-preview';
  el.innerHTML = `<canvas aria-label="Your character"></canvas>
    <div class="lp-hint">Drag to turn</div>
    <div class="lp-bar"><button class="chip on" data-lp="body">Whole body</button><button class="chip" data-lp="face">Close-up</button></div>`;
  overlay.insertBefore(el, overlay.firstChild);
  const canvas = el.querySelector('canvas');

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (err) {
    console.warn('No look preview:', err);
    el.remove();
    return null;
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x2a2a34, 1.2));
  const key = new THREE.DirectionalLight(0xfff1dc, 2.4);
  key.position.set(2.5, 4, 5);
  const rim = new THREE.DirectionalLight(0xffb84a, 1.8); // warm edge light from behind
  rim.position.set(-3, 3, -4);
  const fill = new THREE.DirectionalLight(0x8ab4ff, 0.6);
  fill.position.set(-4, 1.5, 3);
  scene.add(key, rim, fill);
  // A lit spot on the floor and a soft shadow under your feet
  const spot = new THREE.Mesh(new THREE.CircleGeometry(1.6, 40), new THREE.MeshBasicMaterial({ map: radial('rgba(255,190,90,0.42)', 'rgba(255,190,90,0)'), transparent: true, depthWrite: false }));
  spot.rotation.x = -Math.PI / 2;
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.55, 32), new THREE.MeshBasicMaterial({ map: radial('rgba(0,0,0,0.6)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.005;
  scene.add(spot, shadow);

  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
  const model = new PlayerModel();
  model.lookAround = false; // (hold still for the camera)
  scene.add(model.root);
  const body = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), facing: 0.45, state: 'ground', horizontalSpeed: 0,
    mantleProgress: 0, stateTime: 0, stumbleTimer: 0, mantle: null, wallRun: null };

  const p = { el, overlay, canvas, renderer, scene, camera, model, body, view: 'body', camY: VIEWS.body.y, camDist: VIEWS.body.dist,
    dragging: false, lastX: 0, spinVel: 0, sinceDrag: 99, running: false, last: 0 };

  // Drag (mouse or finger) to turn; it keeps spinning a little when you let go
  canvas.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    p.dragging = true; p.lastX = e.clientX; p.spinVel = 0;
    canvas.setPointerCapture?.(e.pointerId);
    canvas.style.cursor = 'grabbing';
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!p.dragging) return;
    const dx = e.clientX - p.lastX;
    p.lastX = e.clientX;
    body.facing += dx * 0.012;
    p.spinVel = dx * 0.012 * 60;
    p.sinceDrag = 0;
  });
  const up = () => { p.dragging = false; canvas.style.cursor = ''; };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  el.addEventListener('click', (e) => e.stopPropagation());
  for (const b of el.querySelectorAll('[data-lp]')) {
    b.addEventListener('click', () => {
      p.view = b.dataset.lp;
      for (const o of el.querySelectorAll('[data-lp]')) o.classList.toggle('on', o === b);
      if (p.view === 'face') { body.facing = 0.25; p.sinceDrag = 0; } // (turn to face you)
    });
  }
  return p;
}

function frame(now) {
  if (!P) return;
  const visible = !P.overlay.hidden && P.overlay.classList.contains('has-preview');
  if (!visible) { P.running = false; return; }
  const dt = Math.min(0.05, Math.max(0, (now - P.last) / 1000)); // (a frame's time can come before `last`)
  P.last = now;

  // Size the drawing to the box
  const w = P.canvas.clientWidth, h = P.canvas.clientHeight;
  if (w && h && (P.canvas.width !== Math.round(w * P.renderer.getPixelRatio()) || P.canvas.height !== Math.round(h * P.renderer.getPixelRatio()))) {
    P.renderer.setSize(w, h, false);
    P.camera.aspect = w / h;
    P.camera.updateProjectionMatrix();
  }

  // Turntable: coast after a drag, then slowly spin by itself
  P.sinceDrag += dt;
  if (!P.dragging) {
    P.spinVel *= Math.exp(-3 * dt);
    P.body.facing += P.spinVel * dt;
    if (P.sinceDrag > 2.5 && P.view === 'body') P.body.facing += AUTO_SPIN * dt;
  }
  P.model.update(dt, P.body);

  // Camera eases between the whole-body view and the close-up. Tall boxes
  // (portrait) need the camera further back to fit you in.
  const v = VIEWS[P.view];
  const fit = P.view === 'body' ? Math.max(1, 0.62 / Math.max(0.3, P.camera.aspect)) : 1;
  P.camY += (v.y - P.camY) * Math.min(1, dt * 6);
  P.camDist += (v.dist * fit - P.camDist) * Math.min(1, dt * 6);
  P.camera.position.set(0, P.camY + (P.view === 'body' ? 0.25 : 0.04), P.camDist);
  P.camera.lookAt(0, P.camY, 0);

  P.renderer.render(P.scene, P.camera);
  requestAnimationFrame(frame);
}

/** Show (or update) the preview with this look. Call after showing the "Your look" card. */
export function showLookPreview(look) {
  if (!P) P = build();
  if (!P) return;
  P.model.setLook(look);
  P.overlay.classList.add('has-preview');
  if (!P.running) {
    P.running = true;
    P.last = performance.now();
    requestAnimationFrame(frame);
  }
}

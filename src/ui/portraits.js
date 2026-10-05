import * as THREE from 'three';
import { PlayerModel } from '../player/playerModel.js';
import { crewLook, CREW_LOOKS } from '../player/people.js';

// Speaker portraits for the story scenes: each character's face, drawn once
// from their own 3D model (same clothes, hair and hat as in the game) into a
// small picture, then reused. A tiny renderer of its own does the drawing and
// is thrown away a few seconds after the last portrait, so it doesn't keep a
// graphics context open while you play.

const SIZE = 160;
const cache = new Map();
let R = null, idle = null;

function setup() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x2a2a34, 1.3));
  const key = new THREE.DirectionalLight(0xfff1dc, 2.6);
  key.position.set(2, 3, 4);
  const rim = new THREE.DirectionalLight(0xffb84a, 2);
  rim.position.set(-3, 2.5, -3);
  scene.add(key, rim);
  const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 20);
  camera.position.set(0.55, 1.7, 1.85);
  camera.lookAt(0, 1.6, 0);
  R = { renderer, scene, camera, canvas };
}

/** A data: URL picture of this character's face (or null if we can't draw one). */
export function portraitUrl(id) {
  if (cache.has(id)) return cache.get(id);
  if (!CREW_LOOKS[id]) return null;
  let url = null;
  try {
    if (!R) setup();
    const model = new PlayerModel(crewLook(id), { bag: false });
    model.lookAround = false;
    const body = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), facing: 0.32, state: 'ground', horizontalSpeed: 0, stumbleTimer: 0 };
    for (let i = 0; i < 30; i++) model.update(1 / 30, body); // (settle into a relaxed standing pose)
    model.eyes.scale.y = 1; // (eyes open)
    R.scene.add(model.root);
    R.renderer.render(R.scene, R.camera);
    url = R.canvas.toDataURL('image/png');
    R.scene.remove(model.root);
    model.material.dispose();
  } catch (err) {
    console.warn('No portrait:', err);
  }
  cache.set(id, url);
  // Let the little renderer go once we're done drawing
  clearTimeout(idle);
  idle = setTimeout(() => { if (R) { R.renderer.dispose(); R.renderer.forceContextLoss?.(); R = null; } }, 4000);
  return url;
}

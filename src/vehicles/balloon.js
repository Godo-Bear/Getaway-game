import * as THREE from 'three';
import { getGlowTexture } from '../world/materials.js';

// A hot-air balloon (Chapter 23): a striped envelope, a wicker basket on
// ropes, and the burner between them. The group's origin is the floor of
// the basket. userData.flame / userData.glow show while the burner fires;
// userData.envelope's emissive lights it up from inside.

const PROFILE = [[1.3, 0], [2.3, 1.4], [4.1, 3.4], [5.7, 5.9], [6.7, 8.4], [7.1, 10.5], [6.9, 12.5], [6.1, 14.3], [4.7, 15.7], [2.7, 16.7], [0.01, 17.1]];

function goreTexture(a, b, c) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const g = cv.getContext('2d');
  const cols = [a, b, a, c];
  for (let i = 0; i < 16; i++) { g.fillStyle = cols[i % cols.length]; g.fillRect(i * 16, 0, 16, 64); }
  // a band round the middle
  g.fillStyle = 'rgba(255,255,255,0.25)';
  g.fillRect(0, 26, 256, 6);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildBalloon({ colors = ['#7a2ac8', '#ffc030', '#e8e0f0'], scale = 1 } = {}) {
  const g = new THREE.Group();
  const env = new THREE.Mesh(new THREE.LatheGeometry(PROFILE.map(([r, y]) => new THREE.Vector2(r, y)), 18),
    new THREE.MeshStandardMaterial({ map: goreTexture(...colors), roughness: 0.75, side: THREE.DoubleSide, emissive: 0xff8a30, emissiveIntensity: 0 }));
  env.position.y = 4.1;
  g.add(env);
  // the basket, its rim, the ropes up to the mouth of the envelope, the burner frame
  const wicker = new THREE.MeshStandardMaterial({ color: 0x8a6232, roughness: 0.95 });
  const basket = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.1, 1.5), wicker);
  basket.position.y = 0.55;
  const rim = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 1.6), new THREE.MeshStandardMaterial({ color: 0x4a2e16 }));
  rim.position.y = 1.12;
  g.add(basket, rim);
  const rope = new THREE.MeshBasicMaterial({ color: 0x2a2018 });
  for (const [x, z] of [[-0.7, -0.7], [0.7, -0.7], [0.7, 0.7], [-0.7, 0.7]]) {
    const top = new THREE.Vector3(x * 1.75, 4.15, z * 1.75), bot = new THREE.Vector3(x, 1.1, z);
    const len = top.distanceTo(bot);
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, len, 4), rope);
    r.position.copy(top).add(bot).multiplyScalar(0.5);
    r.lookAt(top);
    r.rotateX(Math.PI / 2);
    g.add(r);
  }
  const burner = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.3, 0.4, 10), new THREE.MeshStandardMaterial({ color: 0x8a8a92, metalness: 0.8, roughness: 0.3 }));
  burner.position.y = 2.6;
  g.add(burner);
  // the flame (shows while the burner fires) and its glow
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.6, 8), new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  flame.position.y = 3.6;
  flame.visible = false;
  g.add(flame);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0xffa040, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  glow.position.y = 3.6;
  glow.scale.setScalar(4);
  glow.visible = false;
  g.add(glow);
  g.scale.setScalar(scale);
  g.userData = { envelope: env, flame, glow, burn: 0 };
  return g;
}

/** Show the burner firing (k 0..1): the flame, and the envelope lit up from inside. */
export function setBurner(balloon, k, t = 0) {
  const u = balloon.userData;
  u.burn = k;
  u.flame.visible = u.glow.visible = k > 0.05;
  if (k > 0.05) {
    u.flame.scale.set(1, 0.8 + Math.sin(t * 37) * 0.15 + k * 0.4, 1);
    u.glow.material.opacity = 0.6 + Math.sin(t * 23) * 0.2;
  }
  u.envelope.material.emissiveIntensity = k * (0.55 + Math.sin(t * 29) * 0.08);
}

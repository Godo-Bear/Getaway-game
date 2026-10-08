import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { FXAAPass } from 'three/examples/jsm/postprocessing/FXAAPass.js';

// Post-processing: effects applied to the finished image.
//
//   scene ─> RenderPass ─> Bloom ─> Grade (vignette, colour, lightning) ─> Output (tone map, sRGB) [─> FXAA]
//
//  - Bloom makes bright things (neon, lamps, headlights, lit windows) glow.
//  - Grade adds a soft dark vignette, a slight cool/warm split, and the
//    white lightning flash in storms.
//
// On 'low' graphics it's all skipped and the scene is drawn directly, so
// older laptops keep their frame rate. States call post.render(scene, camera)
// instead of renderer.render(scene, camera).

// A pixel too bright for the half-float buffer (a headlight glinting off wet
// paint or water at just the wrong angle) comes out infinite, or NaN. The
// bloom would smear that one pixel over the whole screen and the frame would
// flash black. So before the bloom (and again in the grade) every pixel is
// capped, and broken ones are dropped.
const SANITIZE_GLSL = /* glsl */`
  vec3 SANITIZE(vec3 c) {
    if (any(isnan(c))) return vec3(0.0);
    return clamp(c, vec3(0.0), vec3(64.0));
  }`;

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    vignette: { value: 0.35 },
    flash: { value: 0 },      // 0..1 lightning flash
    tint: { value: new THREE.Vector3(1, 1, 1) },
    lift: { value: 0 },       // Brightness setting: lifts the darkest shadows (night scenes)
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float vignette;
    uniform float flash;
    uniform vec3 tint;
    uniform float lift;
    varying vec2 vUv;
    ${SANITIZE_GLSL}
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      c.rgb = SANITIZE(c.rgb);
      // Split-tone: shadows lean blue, highlights lean warm (the "neon noir" look).
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb *= mix(vec3(0.92, 0.97, 1.08), vec3(1.06, 1.0, 0.94), smoothstep(0.05, 0.6, l));
      c.rgb *= tint;
      // Brightness: lift the shadows so dark night corners can be seen (fades out in bright areas)
      c.rgb += lift * (1.0 - smoothstep(0.0, 0.35, l)) * vec3(0.9, 0.95, 1.05);
      // Vignette: darker towards the corners.
      vec2 d = vUv - 0.5;
      c.rgb *= 1.0 - vignette * smoothstep(0.2, 0.75, dot(d, d) * 2.0);
      // Lightning: a cold white flash over everything.
      c.rgb += vec3(0.75, 0.82, 1.0) * flash * (0.35 + l);
      gl_FragColor = c;
    }`,
};

// Kept deliberately light: laptop graphics chips struggle with full-size
// high-precision effects. bloom: [strength, radius, threshold];
// scale = bloom resolution (fraction of the screen); samples = MSAA
// anti-aliasing (0 = use the much cheaper FXAA smoothing pass instead).
const QUALITY = {
  medium: { bloom: [0.55, 0.35, 0.72], scale: 0.35, samples: 0 },
  high: { bloom: [0.7, 0.45, 0.68], scale: 0.5, samples: 2 },
};

export class PostFx {
  constructor(renderer) {
    this.renderer = renderer;
    this.flash = 0;
    this.quality = null;
    this.composer = null;
  }

  /** Build (or tear down) the effect chain for a graphics setting. */
  setQuality(q) {
    if (q === this.quality) return;
    this.quality = q;
    this.composer?.dispose();
    this.composer = null;
    const cfg = QUALITY[q];
    if (!cfg) return; // low: draw directly
    const r = this.renderer;
    const size = r.getSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x * r.getPixelRatio(), size.y * r.getPixelRatio(), {
      type: THREE.HalfFloatType, samples: cfg.samples,
    });
    this.composer = new EffectComposer(r, target);
    this.renderPass = new RenderPass(null, null);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x * cfg.scale, size.y * cfg.scale), ...cfg.bloom);
    // (cap every pixel before the bloom picks out the bright ones: see SANITIZE_GLSL)
    const hp = this.bloom.materialHighPassFilter, read = 'vec4 texel = texture2D( tDiffuse, vUv );';
    if (hp.fragmentShader.includes(read)) {
      hp.fragmentShader = hp.fragmentShader.replace('void main() {', `${SANITIZE_GLSL}\nvoid main() {`).replace(read, `${read}\ntexel.rgb = SANITIZE( texel.rgb );`);
      hp.needsUpdate = true;
    } else console.warn('PostFx: bloom shader changed, pixels are not capped before the bloom');
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
    this.fxaa = null;
    if (!cfg.samples) {
      this.fxaa = new FXAAPass();
      this.composer.addPass(this.fxaa);
    }
    this.bloomScale = cfg.scale;
    this.bloomBase = cfg.bloom[0];
  }

  setSize(w, h) {
    if (!this.composer) return;
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.bloom.setSize(w * this.bloomScale, h * this.bloomScale);
  }

  /** Lightning flash strength (0..1); fades by itself. */
  lightning(strength = 1) {
    this.flash = Math.max(this.flash, strength);
  }

  /**
   * @param {{bloom?:boolean}} opts - bloom: false for scenes that should stay
   *   crisp and readable (the Case Board corkboard)
   */
  render(scene, camera, dt = 1 / 60, { bloom = true } = {}) {
    this.flash = Math.max(0, this.flash - dt * 3.5);
    // Time of day: daylight scenes are exposed a little darker and bloom less
    const look = scene.userData.lighting;
    // Brightness setting (Settings > Graphics): scales the exposure, and lifts the shadows a little
    const bright = this.brightness ?? 1;
    this.renderer.toneMappingExposure = (look?.exposure ?? 1.15) * bright;
    if (!this.composer) {
      this.renderer.render(scene, camera);
      return;
    }
    this.bloom.enabled = bloom;
    this.bloom.strength = this.bloomBase * (look?.bloom ?? 1);
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    this.grade.uniforms.flash.value = this.flash;
    this.grade.uniforms.lift.value = Math.max(0, bright - 1) * 0.045;
    this.composer.render(dt);
  }
}

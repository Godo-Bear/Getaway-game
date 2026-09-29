import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// Post-processing: effects applied to the finished image.
//
//   scene ─> RenderPass ─> Bloom ─> Grade (vignette, colour, lightning) ─> Output (tone map, sRGB)
//
//  - Bloom makes bright things (neon, lamps, headlights, lit windows) glow.
//  - Grade adds a soft dark vignette, a slight cool/warm split, and the
//    white lightning flash in storms.
//
// On 'low' graphics it's all skipped and the scene is drawn directly, so
// older laptops keep their frame rate. States call post.render(scene, camera)
// instead of renderer.render(scene, camera).

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    vignette: { value: 0.35 },
    flash: { value: 0 },      // 0..1 lightning flash
    tint: { value: new THREE.Vector3(1, 1, 1) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float vignette;
    uniform float flash;
    uniform vec3 tint;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      // Split-tone: shadows lean blue, highlights lean warm (the "neon noir" look).
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb *= mix(vec3(0.92, 0.97, 1.08), vec3(1.06, 1.0, 0.94), smoothstep(0.05, 0.6, l));
      c.rgb *= tint;
      // Vignette: darker towards the corners.
      vec2 d = vUv - 0.5;
      c.rgb *= 1.0 - vignette * smoothstep(0.2, 0.75, dot(d, d) * 2.0);
      // Lightning: a cold white flash over everything.
      c.rgb += vec3(0.75, 0.82, 1.0) * flash * (0.35 + l);
      gl_FragColor = c;
    }`,
};

const QUALITY = {
  // bloom: [strength, radius, threshold], scale = bloom resolution
  medium: { bloom: [0.55, 0.35, 0.72], scale: 0.5, samples: 0 },
  high: { bloom: [0.7, 0.45, 0.68], scale: 0.5, samples: 4 },
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
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
    this.bloomScale = cfg.scale;
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

  render(scene, camera, dt = 1 / 60) {
    this.flash = Math.max(0, this.flash - dt * 3.5);
    if (!this.composer) {
      this.renderer.render(scene, camera);
      return;
    }
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    this.grade.uniforms.flash.value = this.flash;
    this.composer.render(dt);
  }
}

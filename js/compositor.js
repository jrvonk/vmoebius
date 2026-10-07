// Composites base + 3 timelines with continuously drifting blend modes,
// then runs a post pass to the screen.
import * as THREE from 'three';
import { COMPOSITE_FRAG, POST_FRAG, BLEND_MODES } from './shaders/composite.js';
import { VERTEX } from './shaders/prelude.js';
import { makeRenderTarget } from './timeline.js';

const rand = (a, b) => a + Math.random() * (b - a);

export class BlendDrift {
  constructor(settings, allowNormal) {
    this.settings = settings;
    this.allowNormal = allowNormal;
    this.a = this._pick();
    this.b = this._pick(this.a);
    this.t = Math.random();
    this.dur = settings.blend * rand(.6, 1.4);
    this.opacity = rand(.7, 1);
  }
  _pick(exclude) {
    let i;
    do { i = Math.floor(Math.random() * BLEND_MODES.length); } while (i === exclude || (!this.allowNormal && i === 0));
    return i;
  }
  reroll() { this.a = this._pick(); this.b = this._pick(this.a); this.t = 0; this.dur = this.settings.blend * rand(.6, 1.4); }
  update(dt) {
    this.t += dt / this.dur;
    if (this.t >= 1) {
      this.a = this.b; this.b = this._pick(this.a); this.t = 0;
      this.dur = this.settings.blend * rand(.6, 1.4);
      this.opacity = rand(.7, 1);
    }
  }
  get label() { return `${BLEND_MODES[this.a]} → ${BLEND_MODES[this.b]} ${Math.round(this.t * 100)}%`; }
}

export class Compositor {
  constructor(renderer, settings, rtType) {
    this.renderer = renderer;
    this.settings = settings;
    this.rtType = rtType;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    this.drifts = [new BlendDrift(settings, false), new BlendDrift(settings, false), new BlendDrift(settings, false)];

    this.composite = new THREE.ShaderMaterial({
      vertexShader: VERTEX, fragmentShader: COMPOSITE_FRAG, depthTest: false, depthWrite: false,
      uniforms: {
        tBase: { value: null }, uHasBase: { value: 0 }, uBaseAlpha: { value: 1 }, uBaseLinear: { value: 0 }, uPreserve: { value: .3 },
        tA0: { value: null }, tB0: { value: null }, tA1: { value: null }, tB1: { value: null }, tA2: { value: null }, tB2: { value: null },
        uFade: { value: new THREE.Vector3() }, uOpacity: { value: new THREE.Vector3(1, 1, 1) },
        uModeA: { value: new THREE.Vector3() }, uModeB: { value: new THREE.Vector3() }, uModeMix: { value: new THREE.Vector3() },
        tPrev: { value: null }, uTrail: { value: 0 }, uBeat: { value: 0 }, uAudio: { value: new THREE.Vector4() }, uTime: { value: 0 }
      }
    });
    this.post = new THREE.ShaderMaterial({
      vertexShader: VERTEX, fragmentShader: POST_FRAG, depthTest: false, depthWrite: false,
      uniforms: {
        tSrc: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 },
        uBeat: { value: 0 }, uFx: { value: .5 }, uAudio: { value: new THREE.Vector4() }
      }
    });
    this.read = makeRenderTarget(2, 2, rtType);
    this.write = makeRenderTarget(2, 2, rtType);
  }

  resize(w, h) {
    this.read.setSize(w, h); this.write.setSize(w, h);
    this.post.uniforms.uRes.value.set(w, h);
  }

  rerollBlends() { this.drifts.forEach(d => d.reroll()); }

  update(dt, evolving) { if (evolving) this.drifts.forEach(d => d.update(dt)); }

  render(base, timelines, audio, beat, time) {
    const u = this.composite.uniforms;
    u.tBase.value = base.rtTexture;
    u.uBaseAlpha.value = base.transform.opacity;
    u.uHasBase.value = base.active ? 1 : 0;
    u.uBaseLinear.value = base.linear ? 1 : 0;
    u.uPreserve.value = base.preserve;
    const [t0, t1, t2] = timelines;
    u.tA0.value = t0.texA; u.tB0.value = t0.texB;
    u.tA1.value = t1.texA; u.tB1.value = t1.texB;
    u.tA2.value = t2.texA; u.tB2.value = t2.texB;
    u.uFade.value.set(t0.mix, t1.mix, t2.mix);
    const d = this.drifts;
    const e = .8 + .25 * audio.w;
    u.uOpacity.value.set(1, Math.min(1, d[1].opacity * e), Math.min(1, d[2].opacity * e));
    u.uModeA.value.set(d[0].a, d[1].a, d[2].a);
    u.uModeB.value.set(d[0].b, d[1].b, d[2].b);
    u.uModeMix.value.set(d[0].t, d[1].t, d[2].t);
    u.tPrev.value = this.read.texture;
    u.uTrail.value = this.settings.trail;
    u.uBeat.value = beat; u.uAudio.value.copy(audio); u.uTime.value = time;

    this.quad.material = this.composite;
    this.renderer.setRenderTarget(this.write);
    this.renderer.render(this.scene, this.camera);
    const tmp = this.read; this.read = this.write; this.write = tmp;

    const p = this.post.uniforms;
    p.tSrc.value = this.read.texture;
    p.uTime.value = time; p.uBeat.value = beat; p.uFx.value = this.settings.fx; p.uAudio.value.copy(audio);
    this.quad.material = this.post;
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.camera);
  }
}

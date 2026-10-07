// A ShaderTimeline owns two slots (current + incoming) and crossfades between
// them whenever a shader's lifetime ends. Each slot keeps a feedback texture.
import * as THREE from 'three';
import { SHADERS, SHADER_BY_ID } from './shaders/library.js';
import { PRELUDE, MAIN, VERTEX } from './shaders/prelude.js';
import { randomPalette } from './palettes.js';

const rand = (a, b) => a + Math.random() * (b - a);

export class ShaderBank {
  constructor(renderer) {
    this.renderer = renderer;
    this.materials = new Map();
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  material(id) {
    let m = this.materials.get(id);
    if (!m) {
      const def = SHADER_BY_ID[id];
      const extra = {};
      for (const [k, v] of Object.entries(def.uniforms || {})) {
        extra[k] = { value: Array.isArray(v) ? (v.length === 2 ? new THREE.Vector2(...v) : v.length === 3 ? new THREE.Vector3(...v) : new THREE.Vector4(...v)) : v };
      }
      m = new THREE.ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: PRELUDE + def.body + MAIN,
        depthTest: false, depthWrite: false,
        uniforms: {
          u_res: { value: new THREE.Vector2(1, 1) },
          u_time: { value: 0 }, u_age: { value: 0 },
          u_audio: { value: new THREE.Vector4() }, u_beat: { value: 0 },
          u_seed: { value: 0 }, u_params: { value: new THREE.Vector4() },
          u_palA: { value: new THREE.Vector3() }, u_palB: { value: new THREE.Vector3() },
          u_palC: { value: new THREE.Vector3() }, u_palD: { value: new THREE.Vector3() },
          u_prev: { value: null },
          ...extra
        }
      });
      this.materials.set(id, m);
    }
    return m;
  }

  // Compile every shader up front so later swaps don't stutter.
  async warmup(onProgress) {
    const rt = new THREE.WebGLRenderTarget(4, 4);
    for (let i = 0; i < SHADERS.length; i++) {
      this.quad.material = this.material(SHADERS[i].id);
      this.renderer.setRenderTarget(rt);
      this.renderer.render(this.scene, this.camera);
      if (onProgress) onProgress(i + 1, SHADERS.length, SHADERS[i].name);
      await new Promise(r => setTimeout(r, 0));
    }
    this.renderer.setRenderTarget(null);
    rt.dispose();
  }

  renderTo(target, id, uniforms, slot, dt) {
    const m = this.material(id);
    const u = m.uniforms;
    const def = SHADER_BY_ID[id];
    if (def.update && slot && slot.state) def.update(slot.state, u, dt, uniforms.audio, uniforms.beat, uniforms.time);
    u.u_res.value.set(target.width, target.height);
    u.u_time.value = uniforms.time;
    u.u_age.value = uniforms.age;
    u.u_audio.value.copy(uniforms.audio);
    u.u_beat.value = uniforms.beat;
    u.u_seed.value = uniforms.seed;
    u.u_params.value.copy(uniforms.params);
    u.u_palA.value.copy(uniforms.palette.A); u.u_palB.value.copy(uniforms.palette.B);
    u.u_palC.value.copy(uniforms.palette.C); u.u_palD.value.copy(uniforms.palette.D);
    u.u_prev.value = uniforms.prev;
    this.quad.material = m;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
  }
}

export function makeRenderTarget(w, h, type) {
  return new THREE.WebGLRenderTarget(w, h, {
    type, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    wrapS: THREE.MirroredRepeatWrapping, wrapT: THREE.MirroredRepeatWrapping,
    depthBuffer: false, stencilBuffer: false, generateMipmaps: false
  });
}

export class ShaderTimeline {
  constructor(bank, index, settings, inUse, rtType) {
    this.bank = bank;
    this.index = index;
    this.settings = settings;
    this.inUse = inUse;
    this.rtType = rtType;
    this.size = { w: 2, h: 2 };
    this.slots = [this._newSlot(), this._newSlot()];
    this.fade = 0;
    this.fading = false;
    this.fadeDur = 6;
    this.life = 0;
    this.lifeJitter = 1;
    this.locked = false;
    this.onChange = null;
    this._rollLife();
    this._assign(this.slots[0], this._pick());
    this.life = Math.random() * this.lifeMax * .6; // desync the three timelines
  }

  _newSlot() {
    return { shader: null, age: 0, seed: 0, params: new THREE.Vector4(), palette: randomPalette(), speed: 1, read: null, write: null, timeOffset: 0 };
  }

  get lifeMax() { return this.settings.life * this.lifeJitter; }
  _rollLife() { this.lifeJitter = rand(.6, 1.4); }

  _pick(exclude) {
    const busy = new Set(this.inUse());
    if (exclude) busy.add(exclude);
    let pool = SHADERS.filter(s => !busy.has(s.id));
    if (!pool.length) pool = SHADERS;
    return pool[Math.floor(Math.random() * pool.length)].id;
  }

  _assign(slot, id) {
    slot.shader = id;
    slot.seed = Math.random() * 100;
    slot.params.set(Math.random(), Math.random(), Math.random(), Math.random());
    slot.palette = randomPalette();
    slot.speed = rand(.6, 1.4);
    slot.timeOffset = Math.random() * 100;
    slot.age = 0;
    const def = SHADER_BY_ID[id];
    slot.state = def.state ? def.state(slot) : null;
    this._ensureTargets(slot);
    this._clear(slot);
  }

  _ensureTargets(slot) {
    const { w, h } = this.size;
    if (!slot.read || slot.read.width !== w || slot.read.height !== h) {
      if (slot.read) { slot.read.dispose(); slot.write.dispose(); }
      slot.read = makeRenderTarget(w, h, this.rtType);
      slot.write = makeRenderTarget(w, h, this.rtType);
    }
  }

  _clear(slot) {
    const r = this.bank.renderer;
    for (const t of [slot.read, slot.write]) { r.setRenderTarget(t); r.clear(); }
    r.setRenderTarget(null);
  }

  resize(w, h) {
    this.size = { w, h };
    for (const s of this.slots) this._ensureTargets(s);
  }

  get current() { return this.slots[0]; }
  get incoming() { return this.fading ? this.slots[1] : null; }
  activeIds() { return this.fading ? [this.slots[0].shader, this.slots[1].shader] : [this.slots[0].shader]; }

  // Start crossfading to a new shader now.
  next(id) {
    if (this.fading) this._finish();
    this._assign(this.slots[1], id || this._pick(this.slots[0].shader));
    this.fading = true;
    this.fade = 0;
    this.fadeDur = this.settings.fade * rand(.7, 1.3);
    if (this.onChange) this.onChange(this);
  }

  _finish() {
    const [a, b] = this.slots;
    this.slots = [b, a];
    this.fading = false;
    this.fade = 0;
    this.life = 0;
    this._rollLife();
    if (this.onChange) this.onChange(this);
  }

  update(dt, evolving) {
    if (evolving && !this.locked) this.life += dt;
    if (!this.fading && evolving && !this.locked && this.life > this.lifeMax) this.next();
    if (this.fading) {
      this.fade += dt / this.fadeDur;
      if (this.fade >= 1) this._finish();
    }
  }

  render(audio, beat, dt) {
    this._renderSlot(this.slots[0], audio, beat, dt);
    if (this.fading) this._renderSlot(this.slots[1], audio, beat, dt);
  }

  _renderSlot(slot, audio, beat, dt) {
    slot.age += dt;
    this.bank.renderTo(slot.write, slot.shader, {
      time: slot.age * slot.speed + slot.timeOffset, age: slot.age,
      audio, beat, seed: slot.seed, params: slot.params, palette: slot.palette, prev: slot.read.texture
    }, slot, dt);
    const t = slot.read; slot.read = slot.write; slot.write = t;
  }

  // Textures for the compositor.
  get texA() { return this.slots[0].read.texture; }
  get texB() { return this.fading ? this.slots[1].read.texture : this.slots[0].read.texture; }
  get mix() { return this.fading ? Math.min(1, this.fade) : 0; }
}

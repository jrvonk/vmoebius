import * as THREE from 'three';
import { AudioEngine } from './audio.js';
import { ShaderBank, ShaderTimeline } from './timeline.js';
import { Compositor } from './compositor.js';
import { BaseLayer, classify } from './baselayer.js';
import { UI } from './ui.js';

const SETTINGS_KEY = 'vmoebius.settings.v1';
const DEFAULTS = { life: 40, fade: 6, blend: 12, trail: 0, fx: .5, layerScale: .5, evolving: true };

class App {
  constructor() {
    this.canvas = document.getElementById('gl');
    this.settings = Object.assign({}, DEFAULTS, this._loadSettings());
    this.settings.evolving = true;

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.pixelRatio = Math.min(devicePixelRatio || 1, 1.5);
    this.renderer.setPixelRatio(this.pixelRatio);

    const gl = this.renderer.getContext();
    const halfOk = this.renderer.capabilities.isWebGL2 && (gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
    this.rtType = halfOk ? THREE.HalfFloatType : THREE.UnsignedByteType;

    this.audio = new AudioEngine();
    this.bank = new ShaderBank(this.renderer);
    const inUse = () => this.timelines ? this.timelines.flatMap(t => t.activeIds()) : [];
    this.timelines = [];
    for (let i = 0; i < 3; i++) this.timelines.push(new ShaderTimeline(this.bank, i, this.settings, inUse, this.rtType));
    this.compositor = new Compositor(this.renderer, this.settings, this.rtType);
    this.base = new BaseLayer(this.renderer);

    this.audioVec = new THREE.Vector4();
    this.clock = new THREE.Clock();
    this.time = 0;
    this.fps = 0;
    this._uiTick = 0;

    this.ui = new UI(this);
    window.addEventListener('resize', () => this.resize());
    this.resize();
    window.addEventListener('beforeunload', () => this._saveSettings());
    setInterval(() => this._saveSettings(), 5000);
  }

  _loadSettings() { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch (e) { return {}; } }
  _saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch (e) { /* noop */ } }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    const pw = Math.round(w * this.pixelRatio), ph = Math.round(h * this.pixelRatio);
    const lw = Math.max(64, Math.round(pw * this.settings.layerScale)), lh = Math.max(64, Math.round(ph * this.settings.layerScale));
    this.timelines.forEach(t => t.resize(lw, lh));
    this.compositor.resize(pw, ph);
    this.base.resize(pw, ph);
  }

  async selectAudio(mode) {
    const err = document.getElementById('splash-error');
    try {
      if (mode === 'mic') await this.audio.useMic();
      else if (mode === 'tab') await this.audio.useDisplay();
      else if (mode === 'file') { document.getElementById('file-audio').click(); await this.audio.useIdle(); }
      else await this.audio.useIdle();
      err.hidden = true;
      this._dismissSplash();
    } catch (e) {
      console.error(e);
      const msg = e && e.name === 'NotAllowedError' ? 'Permission denied. Pick another source.' : (e.message || String(e));
      if (!document.getElementById('splash').hidden) { err.textContent = msg; err.hidden = false; }
      else this.ui.toast(msg, true);
    }
  }

  _dismissSplash() {
    const s = document.getElementById('splash');
    if (!s.hidden) { s.hidden = true; this.ui.toast('Menu: hover bottom-right or press M. Drop an image, video or 3D file anywhere.', false, 5000); }
  }

  async loadFile(file, forceKind) {
    const kind = forceKind || classify(file);
    try {
      if (kind === 'audio') { await this.audio.useFile(file); this._dismissSplash(); this.ui.toast(`Audio: ${file.name}`); }
      else { await this.base.load(file); this.ui.toast(`Loaded ${this.base.kind}: ${file.name}`); }
    } catch (e) { console.error(e); this.ui.toast(e.message || String(e), true); }
  }

  shuffleAll() { this.timelines.forEach(t => t.next()); this.compositor.rerollBlends(); }

  async start() {
    const err = document.getElementById('splash-error');
    try {
      await this.bank.warmup((i, n) => { err.hidden = false; err.classList.remove('error'); err.textContent = `compiling shaders ${i}/${n}`; });
      err.hidden = true; err.classList.add('error');
    } catch (e) {
      console.error(e); err.textContent = 'Shader compile failed: ' + (e.message || e); err.hidden = false;
    }
    this.renderer.setAnimationLoop(() => this.frame());
  }

  frame() {
    const dt = Math.min(this.clock.getDelta(), .1);
    this.time += dt;
    this.fps += ((dt > 0 ? 1 / dt : 60) - this.fps) * .05;
    const bands = this.audio.update(dt);
    this.audioVec.set(bands.bass, bands.mid, bands.treble, bands.energy);
    const beat = this.audio.beat;
    const evolving = this.settings.evolving;

    for (const t of this.timelines) { t.update(dt, evolving); t.render(this.audioVec, beat, dt); }
    this.compositor.update(dt, evolving);
    this.base.render(this.audioVec, beat, dt);
    this.compositor.render(this.base, this.timelines, this.audioVec, beat, this.time);

    if ((this._uiTick += dt) > .1) { this._uiTick = 0; this.ui.refresh(); }
  }
}

const app = new App();
window.vmoebius = app;
app.start();

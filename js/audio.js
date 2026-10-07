// Web Audio analysis: mic / tab-capture / file / synthetic idle motion.
// Produces smoothed, auto-gained band levels and a decaying beat pulse.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.analyser = null;
    this.data = null;
    this.input = null;      // GainNode everything feeds into
    this.monitor = null;    // GainNode to speakers (only for file playback)
    this.source = null;
    this.stream = null;
    this.mediaEl = null;
    this.mode = 'idle';
    this.sensitivity = 1;
    this.bands = { bass: 0, mid: 0, treble: 0, energy: 0 };
    this.raw = { bass: 0, mid: 0, treble: 0 };
    this.peaks = { bass: .2, mid: .2, treble: .2 };
    this.beat = 0;
    this.beatCount = 0;
    this.lastBeat = 0;
    this.history = new Float32Array(43);
    this.hIdx = 0;
    this.t = 0;
    this.label = 'no input';
    this.onChange = null;
  }

  async ensureCtx() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.55;
      this.data = new Uint8Array(this.analyser.frequencyBinCount);
      this.input = this.ctx.createGain();
      this.input.connect(this.analyser);
      this.monitor = this.ctx.createGain();
      this.monitor.gain.value = 0;
      this.analyser.connect(this.monitor);
      this.monitor.connect(this.ctx.destination);
    }
    if (this.ctx.state !== 'running') await this.ctx.resume();
  }

  _teardown() {
    if (this.source) { try { this.source.disconnect(); } catch (e) { /* noop */ } }
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    if (this.mediaEl) { this.mediaEl.pause(); if (this.mediaEl.src.startsWith('blob:')) URL.revokeObjectURL(this.mediaEl.src); }
    this.source = this.stream = this.mediaEl = null;
    if (this.monitor) this.monitor.gain.value = 0;
  }

  _set(mode, label) {
    this.mode = mode; this.label = label;
    if (this.onChange) this.onChange(this);
  }

  async useMic() {
    await this.ensureCtx();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    });
    this._teardown();
    this.stream = stream;
    this.source = this.ctx.createMediaStreamSource(stream);
    this.source.connect(this.input);
    this._set('mic', 'microphone');
  }

  async useDisplay() {
    await this.ensureCtx();
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    if (!stream.getAudioTracks().length) {
      stream.getTracks().forEach(t => t.stop());
      throw new Error('No audio was shared. Pick a tab or screen and tick "Share audio".');
    }
    stream.getVideoTracks().forEach(t => t.stop());
    this._teardown();
    this.stream = stream;
    this.source = this.ctx.createMediaStreamSource(stream);
    this.source.connect(this.input);
    stream.getAudioTracks()[0].addEventListener('ended', () => { if (this.mode === 'tab') this.useIdle(); });
    this._set('tab', 'tab / system audio');
  }

  async useFile(file) {
    await this.ensureCtx();
    const el = new Audio();
    el.src = URL.createObjectURL(file);
    el.loop = true;
    this._teardown();
    this.mediaEl = el;
    this.source = this.ctx.createMediaElementSource(el);
    this.source.connect(this.input);
    this.monitor.gain.value = 1;
    await el.play();
    this._set('file', file.name);
  }

  async useIdle() {
    if (this.ctx) { try { await this.ensureCtx(); } catch (e) { /* noop */ } }
    this._teardown();
    this._set('idle', 'no input (demo motion)');
  }

  _band(lo, hi) {
    const binHz = this.ctx.sampleRate / this.analyser.fftSize;
    const a = Math.max(0, Math.floor(lo / binHz)), b = Math.min(this.data.length - 1, Math.ceil(hi / binHz));
    let s = 0;
    for (let i = a; i <= b; i++) s += this.data[i];
    return s / ((b - a + 1) * 255);
  }

  update(dt) {
    this.t += dt;
    let bass, mid, treble;
    if (this.mode !== 'idle' && this.analyser && this.ctx.state === 'running') {
      this.analyser.getByteFrequencyData(this.data);
      bass = this._band(20, 150) * 1.1;
      mid = this._band(150, 2000) * 1.6;
      treble = this._band(2000, 12000) * 2.4;
    } else {
      const t = this.t;
      bass = .45 + .4 * Math.max(0, Math.sin(t * 2.2 * Math.PI)) ** 6 + .1 * Math.sin(t * .7);
      mid = .35 + .25 * Math.sin(t * 1.3) * Math.sin(t * .37) + .15 * Math.sin(t * 5.1);
      treble = .25 + .2 * Math.abs(Math.sin(t * 3.7)) + .1 * Math.sin(t * 11.3);
    }
    this.raw.bass = bass; this.raw.mid = mid; this.raw.treble = treble;
    const out = this.bands, pk = this.peaks;
    for (const k of ['bass', 'mid', 'treble']) {
      const v = this.raw[k];
      pk[k] = Math.max(pk[k] * (1 - dt * .05), v, .15);
      const target = Math.min(1.5, (v / pk[k]) * this.sensitivity);
      const rate = target > out[k] ? 1 - Math.exp(-dt * 30) : 1 - Math.exp(-dt * 8);
      out[k] += (target - out[k]) * rate;
    }
    out.energy = out.bass * .5 + out.mid * .3 + out.treble * .2;

    // Beat detection on the raw bass band vs. its recent average.
    const avg = this.history.reduce((a, b) => a + b, 0) / this.history.length;
    this.history[this.hIdx] = bass; this.hIdx = (this.hIdx + 1) % this.history.length;
    const now = this.t;
    if (bass > avg * 1.3 && bass > .25 * (1 / this.sensitivity) && now - this.lastBeat > .18) {
      this.beat = 1; this.lastBeat = now; this.beatCount++;
    }
    this.beat *= Math.exp(-dt * 6);
    return out;
  }
}

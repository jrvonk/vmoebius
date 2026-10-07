// Hidden bottom-right menu, HUD, toasts, drag & drop, keyboard.
import { SHADERS, SHADER_BY_ID } from './shaders/library.js';
import { classify } from './baselayer.js';

const $ = id => document.getElementById(id);

export class UI {
  constructor(app) {
    this.app = app;
    this.menu = $('menu');
    this.hud = $('hud');
    this.open = false;
    this.hideTimer = null;
    this.idleTimer = null;
    this._bind();
  }

  toast(msg, isError = false, ms = 3200) {
    const t = $('toast');
    t.textContent = msg; t.hidden = false; t.classList.toggle('error', isError);
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { t.hidden = true; }, ms);
  }

  setMenu(open) {
    this.open = open;
    this.menu.classList.toggle('open', open);
    this.menu.setAttribute('aria-hidden', String(!open));
    document.body.classList.toggle('menu-open', open);
    clearTimeout(this.hideTimer);
  }

  _bind() {
    const app = this.app, base = app.base, audio = app.audio, s = app.settings;

    // Hot corner + open / close behaviour.
    $('hotzone').addEventListener('mouseenter', () => this.setMenu(true));
    $('hotzone').addEventListener('click', () => this.setMenu(!this.open));
    $('menu-close').addEventListener('click', () => this.setMenu(false));
    this.menu.addEventListener('mouseleave', () => { this.hideTimer = setTimeout(() => this.setMenu(false), 1800); });
    this.menu.addEventListener('mouseenter', () => clearTimeout(this.hideTimer));

    // Audio source buttons (splash + menu share data-audio).
    document.querySelectorAll('[data-audio]').forEach(b => b.addEventListener('click', () => app.selectAudio(b.dataset.audio)));
    $('a-sens').addEventListener('input', e => { audio.sensitivity = +e.target.value; });
    audio.onChange = () => {
      $('audio-status').textContent = audio.label;
      document.querySelectorAll('#menu [data-audio]').forEach(b => b.classList.toggle('active', b.dataset.audio === audio.mode));
    };

    // Asset.
    $('asset-load').addEventListener('click', () => $('file-asset').click());
    $('file-asset').addEventListener('change', e => { if (e.target.files[0]) app.loadFile(e.target.files[0]); e.target.value = ''; });
    $('file-audio').addEventListener('change', e => { if (e.target.files[0]) app.loadFile(e.target.files[0], 'audio'); e.target.value = ''; });
    $('asset-clear').addEventListener('click', () => base.clear());
    const T = base.transform;
    const bindT = (id, key, scale = 1) => {
      const el = $(id);
      el.addEventListener('input', e => { T[key] = +e.target.value * scale; });
      return el;
    };
    this.tInputs = {
      scale: bindT('t-scale', 'scale'), x: bindT('t-x', 'x'), y: bindT('t-y', 'y'), rot: bindT('t-rot', 'rot'),
      opacity: bindT('t-opacity', 'opacity'), pulse: bindT('t-pulse', 'pulse'), spin: bindT('t-spin', 'spin'), preserve: bindT('t-preserve', 'preserve')
    };
    $('t-reset').addEventListener('click', () => base.resetTransform());
    base.onChange = () => this.syncTransform();
    this.syncTransform();

    // Evolution.
    const bindS = (id, key, cb) => $(id).addEventListener('input', e => { s[key] = +e.target.value; if (cb) cb(); });
    bindS('e-life', 'life'); bindS('e-fade', 'fade'); bindS('e-blend', 'blend'); bindS('e-trail', 'trail'); bindS('e-fx', 'fx');
    $('e-res').addEventListener('change', e => { s.layerScale = +e.target.value; app.resize(); });
    for (const [id, key] of [['e-life', 'life'], ['e-fade', 'fade'], ['e-blend', 'blend'], ['e-trail', 'trail'], ['e-fx', 'fx']]) $(id).value = s[key];
    $('e-res').value = String(s.layerScale);
    $('e-shuffle').addEventListener('click', () => app.shuffleAll());
    $('e-blends').addEventListener('click', () => app.compositor.rerollBlends());
    $('e-pause').addEventListener('click', () => this.setEvolving(!s.evolving));

    // Footer.
    $('fullscreen').addEventListener('click', () => this.toggleFullscreen());
    $('hud-toggle').addEventListener('click', () => this.toggleHud());

    // Per-layer rows.
    this.layerRows = app.timelines.map((tl, i) => {
      const row = document.createElement('div'); row.className = 'layer';
      row.innerHTML = `<span class="idx">L${i + 1}</span><select class="pick" title="Choose shader"></select><span class="blend"></span><span><button class="lock" title="Lock shader">lock</button><button class="next" title="Reroll shader now">next</button></span>`;
      const sel = row.querySelector('.pick');
      sel.innerHTML = SHADERS.map(sh => `<option value="${sh.id}">${sh.name}</option>`).join('');
      sel.addEventListener('change', e => { tl.next(e.target.value); });
      row.querySelector('.lock').addEventListener('click', e => { tl.locked = !tl.locked; e.target.classList.toggle('active', tl.locked); });
      row.querySelector('.next').addEventListener('click', () => tl.next());
      $('layers').appendChild(row);
      return row;
    });

    // Drag & drop anywhere.
    let dragDepth = 0;
    window.addEventListener('dragenter', e => { e.preventDefault(); dragDepth++; $('drop').hidden = false; });
    window.addEventListener('dragleave', e => { e.preventDefault(); if (--dragDepth <= 0) { dragDepth = 0; $('drop').hidden = true; } });
    window.addEventListener('dragover', e => e.preventDefault());
    window.addEventListener('drop', e => {
      e.preventDefault(); dragDepth = 0; $('drop').hidden = true;
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) app.loadFile(f);
    });

    // Canvas: drag to move, wheel to scale the asset.
    const canvas = app.canvas;
    let drag = null;
    canvas.addEventListener('pointerdown', e => {
      if (!base.active) return;
      drag = { px: e.clientX, py: e.clientY, x: T.x, y: T.y };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', e => {
      if (!drag) return;
      T.x = Math.max(-1.5, Math.min(1.5, drag.x + (e.clientX - drag.px) / innerWidth * 2));
      T.y = Math.max(-1.5, Math.min(1.5, drag.y - (e.clientY - drag.py) / innerHeight * 2));
      this.syncTransform();
    });
    const endDrag = () => { drag = null; };
    canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('wheel', e => {
      if (!base.active) return;
      e.preventDefault();
      T.scale = Math.max(.05, Math.min(6, T.scale * Math.exp(-e.deltaY * .0015)));
      this.syncTransform();
    }, { passive: false });

    // Keyboard.
    window.addEventListener('keydown', e => {
      if (e.target.matches('input, select, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key.toLowerCase()) {
        case 'm': this.setMenu(!this.open); break;
        case 'h': this.toggleHud(); break;
        case 'f': this.toggleFullscreen(); break;
        case ' ': e.preventDefault(); app.shuffleAll(); break;
        case 'b': app.compositor.rerollBlends(); break;
        case '1': case '2': case '3': app.timelines[+e.key - 1].next(); break;
        case 'p': this.setEvolving(!s.evolving); break;
        case 'escape': this.setMenu(false); break;
        default: return;
      }
    });

    // Hide the cursor when idle.
    const wake = () => {
      document.body.classList.remove('hide-cursor');
      clearTimeout(this.idleTimer);
      this.idleTimer = setTimeout(() => { if (!this.open) document.body.classList.add('hide-cursor'); }, 3000);
    };
    window.addEventListener('pointermove', wake); wake();
  }

  setEvolving(v) {
    this.app.settings.evolving = v;
    $('e-pause').textContent = v ? 'Pause evolution' : 'Resume evolution';
    $('e-pause').classList.toggle('active', !v);
  }

  toggleHud() { this.hud.hidden = !this.hud.hidden; $('hud-toggle').classList.toggle('active', !this.hud.hidden); }

  toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => this.toast('Fullscreen not available', true));
  }

  syncTransform() {
    const base = this.app.base, T = base.transform;
    for (const [k, el] of Object.entries(this.tInputs)) if (document.activeElement !== el) el.value = T[k];
    $('asset-name').textContent = base.active ? `${base.kind}: ${base.name}` : 'none — drop a file anywhere';
    document.querySelectorAll('.only3d').forEach(el => el.classList.toggle('hidden', base.kind !== 'model'));
  }

  // Called ~10x per second.
  refresh() {
    const app = this.app, a = app.audio;
    if (this.open) {
      $('m-bass').style.transform = `scaleX(${Math.min(1, a.bands.bass)})`;
      $('m-mid').style.transform = `scaleX(${Math.min(1, a.bands.mid)})`;
      $('m-treb').style.transform = `scaleX(${Math.min(1, a.bands.treble)})`;
      $('m-beat').style.opacity = a.beat;
      app.timelines.forEach((tl, i) => {
        const row = this.layerRows[i];
        const sel = row.querySelector('.pick');
        const shown = tl.incoming ? tl.incoming.shader : tl.current.shader;
        if (document.activeElement !== sel && sel.value !== shown) sel.value = shown;
        sel.title = SHADER_BY_ID[shown].credit;
        row.querySelector('.blend').textContent = app.compositor.drifts[i].label;
      });
    }
    if (!this.hud.hidden) {
      this.hud.innerHTML = app.timelines.map((tl, i) => {
        const cur = SHADER_BY_ID[tl.current.shader].name;
        const inc = tl.incoming ? ` → ${SHADER_BY_ID[tl.incoming.shader].name} ${Math.round(tl.mix * 100)}%` : '';
        return `<div><span class="idx">L${i + 1}</span> ${cur}${inc} <span class="mode">· ${app.compositor.drifts[i].label}</span></div>`;
      }).join('') + `<div class="mode">${a.label} · ${app.fps.toFixed(0)} fps · ${SHADERS.length} shaders</div>`;
    }
  }
}

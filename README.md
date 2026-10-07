# vmoebius

A WebGL-accelerated, ever-evolving music visualizer for the browser.

Three shader timelines run concurrently. Each one picks a VJ-style shader,
lives with it for a while, then crossfades into a new one with fresh seeds,
palette and speed. The three layers are composited with blend modes that drift
continuously from one mode to the next, so the same shaders never combine the
same way twice. Everything reacts to bass / mid / treble levels and a beat
detector.

A hidden menu in the bottom-right corner lets you drop a PNG / image, a looping
video, or a 3D model (GLB, glTF, OBJ, STL, FBX) onto the base layer, centred on
screen, and scale / position / rotate it under the shader stack.

No build step. Open `index.html` from any static web server.

```sh
npx http-server . -p 8080     # or: python3 -m http.server 8080
```

Then visit <http://localhost:8080>. (ES modules and microphone access need
`http://` or `https://`, not `file://`.)

## Using it

1. Pick an audio source on the splash screen:
   * **Microphone** – any input the browser can see.
   * **Tab / system audio** – uses screen-capture; choose a tab or screen and
     tick *Share audio* in the picker. Great for Spotify / YouTube in another tab.
   * **Audio file** – plays a local file on loop through the visualizer.
   * **No audio** – synthetic motion so the visuals still evolve.
2. Hover the bottom-right corner (or press `M`) to reveal the menu.
3. Drop an image / video / 3D file anywhere on the page, or use *Load* in the
   menu. Drag on the canvas to move it, scroll to scale it, or use the sliders.

### Keyboard

| Key | Action |
| --- | --- |
| `M` | toggle menu |
| `H` | toggle HUD (shader names, blend modes, fps) |
| `F` | fullscreen |
| `Space` | shuffle all three timelines and reroll blend modes |
| `1` `2` `3` | crossfade that timeline to a new shader now |
| `B` | reroll blend modes |
| `P` | pause / resume evolution |

### Menu controls

* **Audio** – source, sensitivity, live band meters.
* **Base asset** – load / clear, scale, X / Y, rotation, opacity, bass pulse,
  spin (3D only), and *keep visible* (how much the asset shows through the
  blended shader stack).
* **Evolution** – shader lifetime, crossfade length, blend drift period, trails,
  beat FX (chromatic aberration / vignette / grain), layer resolution, and
  per-layer lock / next buttons.

Settings persist in `localStorage`.

## How it works

```
audio ─► bands + beat ─┐
                       ▼
timeline 1 ─► shader A ──┐  (crossfade)
            ─► shader B ──┤
timeline 2 ─► ...         ├─► compositor ─► trails ─► post (chroma, vignette, grain) ─► screen
timeline 3 ─► ...         │      ▲
base layer (image / video / 3D) ─┘
```

* `js/shaders/library.js` – 25 layer shaders. Every entry is an original GLSL
  implementation of a technique from the VJ / demoscene / Shadertoy world
  (Kali sets, Truchet weaves, domain warping, gyroid raymarching, Apollonian
  inversion, feedback zoom, phyllotaxis, op-art, glitch, and more). Each
  shader gets `u_audio`, `u_beat`, a random seed, random parameters, a cosine
  palette, and its own previous frame (`u_prev`) for feedback effects.
* `js/shaders/composite.js` – 25 blend modes (screen, overlay, difference,
  color dodge, xor, hue shift, wrap, vivid light …). Each layer holds two
  modes and a mix factor that eases from one to the other, then picks a new
  target.
* `js/timeline.js` – the timeline / crossfade state machine and render-target
  ping-pong.
* `js/baselayer.js` – the asset layer. Images and videos render on an
  orthographic quad; models are normalised to a unit sphere and lit, with
  audio-reactive rim light and spin.
* `js/audio.js` – Web Audio analysis with per-band auto-gain and beat
  detection.

### Adding a shader

Append an object to `SHADERS` in `js/shaders/library.js`:

```js
{
  id: 'myshader', name: 'My Shader', cost: 1,
  credit: 'where the technique comes from',
  body: /* glsl */`
vec4 render(vec2 uv, vec2 p){      // uv: 0..1, p: centred & aspect-corrected
  vec3 col = pal(length(p) + u_time * .1) * (.5 + BASS);
  return vec4(col, 1.);
}`
}
```

Helpers available in every shader: `pal()`, `rot()`, `hash11/21/22/31`,
`noise`, `noise3`, `fbm`, `fbm3`, `sdSeg`, `sdBox`, `aces`, plus `BASS`,
`MID`, `TREB`, `ENERGY`, `u_beat`, `u_seed`, `u_params`, `u_prev`.

## Deploying

The site is static. For GitHub Pages: *Settings → Pages → Deploy from branch →
`main` / root*. Microphone and tab-capture require HTTPS, which Pages provides.

## Notes

* Animated GIFs load as a still frame (browser texture limitation). Use a
  video loop instead.
* Draco-compressed glTF is not supported; export uncompressed GLB.
* three.js (MIT) is vendored under `vendor/three` so the page works offline.

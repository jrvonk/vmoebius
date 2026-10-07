// Cosine palettes (Inigo Quilez) plus random variations.
import * as THREE from 'three';

const PRESETS = [
  [[.5, .5, .5], [.5, .5, .5], [1, 1, 1], [0, .33, .67]],
  [[.5, .5, .5], [.5, .5, .5], [1, 1, 1], [0, .1, .2]],
  [[.5, .5, .5], [.5, .5, .5], [1, 1, .5], [.8, .9, .3]],
  [[.5, .5, .5], [.5, .5, .5], [1, .7, .4], [0, .15, .2]],
  [[.5, .5, .5], [.5, .5, .5], [2, 1, 0], [.5, .2, .25]],
  [[.8, .5, .4], [.2, .4, .2], [2, 1, 1], [0, .25, .25]],
  [[.1, .2, .3], [.6, .5, .4], [1, 1, 1], [.2, .3, .4]],
  [[.6, .3, .5], [.4, .5, .5], [1, 1, 1], [.1, .5, .8]],
  [[.4, .4, .5], [.6, .4, .3], [.5, 1, 1.5], [.9, .1, .3]],
  [[.2, .2, .2], [.8, .4, .6], [1, 1, 2], [.3, .6, .1]]
];

export function randomPalette(rng = Math.random) {
  const base = PRESETS[Math.floor(rng() * PRESETS.length)];
  const jitter = (arr, amt) => arr.map(v => v + (rng() - .5) * amt);
  const A = jitter(base[0], .2), B = jitter(base[1], .2), C = jitter(base[2], .4), D = jitter(base[3], .4);
  return {
    A: new THREE.Vector3(...A), B: new THREE.Vector3(...B), C: new THREE.Vector3(...C), D: new THREE.Vector3(...D)
  };
}

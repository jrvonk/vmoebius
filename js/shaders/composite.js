// Composite: base asset + three shader layers with randomised blend modes,
// then a post pass (trails live here, chroma / vignette / grain in the blit).

export const BLEND_MODES = [
  'normal', 'add', 'screen', 'multiply', 'overlay', 'hard light', 'soft light',
  'difference', 'exclusion', 'color dodge', 'color burn', 'lighten', 'darken',
  'subtract', 'divide', 'linear burn', 'negation', 'wrap', 'pin light',
  'vivid light', 'xor', 'hue shift', 'luminosity', 'reflect', 'glow'
];

export const COMPOSITE_FRAG = /* glsl */`
uniform sampler2D tBase;
uniform float uHasBase;
uniform float uBaseAlpha;
uniform float uBaseLinear;
uniform float uPreserve;
uniform sampler2D tA0; uniform sampler2D tB0;
uniform sampler2D tA1; uniform sampler2D tB1;
uniform sampler2D tA2; uniform sampler2D tB2;
uniform vec3 uFade;     // crossfade per layer
uniform vec3 uOpacity;  // opacity per layer
uniform vec3 uModeA;    // blend mode A (as float index) per layer
uniform vec3 uModeB;    // blend mode B per layer
uniform vec3 uModeMix;  // 0 = A, 1 = B
uniform sampler2D tPrev;
uniform float uTrail;
uniform float uBeat;
uniform vec4 uAudio;
uniform float uTime;
varying vec2 vUv;

vec3 hueRotate(vec3 c, float a){
  const vec3 k = vec3(.57735);
  float cs = cos(a), sn = sin(a);
  return c * cs + cross(k, c) * sn + k * dot(k, c) * (1. - cs);
}
float lum(vec3 c){ return dot(c, vec3(.299, .587, .114)); }

vec3 blendMode(int m, vec3 b, vec3 s){
  if (m == 0) return s;
  if (m == 1) return b + s;
  if (m == 2) return 1. - (1. - b) * (1. - s);
  if (m == 3) return b * s;
  if (m == 4) return mix(2. * b * s, 1. - 2. * (1. - b) * (1. - s), step(.5, b));
  if (m == 5) return mix(2. * b * s, 1. - 2. * (1. - b) * (1. - s), step(.5, s));
  if (m == 6) return mix(b - (1. - 2. * s) * b * (1. - b), b + (2. * s - 1.) * (sqrt(max(b, 0.)) - b), step(.5, s));
  if (m == 7) return abs(b - s);
  if (m == 8) return b + s - 2. * b * s;
  if (m == 9) return b / max(1. - s, .02);
  if (m == 10) return 1. - (1. - b) / max(s, .02);
  if (m == 11) return max(b, s);
  if (m == 12) return min(b, s);
  if (m == 13) return max(b - s, 0.);
  if (m == 14) return b / max(s, .05) * .5;
  if (m == 15) return max(b + s - 1., 0.);
  if (m == 16) return 1. - abs(1. - b - s);
  if (m == 17) return fract(b + s);
  if (m == 18) return mix(min(b, 2. * s), max(b, 2. * s - 1.), step(.5, s));
  if (m == 19) return mix(1. - (1. - b) / max(2. * s, .02), b / max(2. * (1. - s), .02), step(.5, s));
  if (m == 20) { ivec3 bi = ivec3(clamp(b, 0., 1.) * 255.), si = ivec3(clamp(s, 0., 1.) * 255.); return vec3(bi ^ si) / 255.; }
  if (m == 21) return mix(hueRotate(b, lum(s) * 6.283), s, .35);
  if (m == 22) return b * (lum(s) / max(lum(b), .05));
  if (m == 23) return b * b / max(1. - s, .02);
  return s * s / max(1. - b, .02); // glow
}

vec3 applyLayer(vec3 backdrop, vec3 s, float modeA, float modeB, float k){
  vec3 a = blendMode(int(modeA + .5), backdrop, s);
  vec3 b = blendMode(int(modeB + .5), backdrop, s);
  return clamp(mix(a, b, smoothstep(0., 1., k)), 0., 4.);
}

void main(){
  vec2 uv = vUv;
  vec4 base = texture2D(tBase, uv);
  vec3 baseC = base.rgb / max(base.a, 1e-4);
  if (uBaseLinear > .5) baseC = pow(max(baseC, 0.), vec3(1. / 2.2));
  float ba = clamp(base.a, 0., 1.) * uHasBase * uBaseAlpha;

  vec3 l0 = mix(texture2D(tA0, uv).rgb, texture2D(tB0, uv).rgb, uFade.x);
  vec3 l1 = mix(texture2D(tA1, uv).rgb, texture2D(tB1, uv).rgb, uFade.y);
  vec3 l2 = mix(texture2D(tA2, uv).rgb, texture2D(tB2, uv).rgb, uFade.z);

  // Layer 0: where the asset exists, blend it with layer 0; elsewhere layer 0 shows plain.
  vec3 res = mix(l0, applyLayer(baseC, l0, uModeA.x, uModeB.x, uModeMix.x), ba);
  res = mix(baseC * ba, res, uOpacity.x);
  res = mix(res, applyLayer(res, l1, uModeA.y, uModeB.y, uModeMix.y), uOpacity.y);
  res = mix(res, applyLayer(res, l2, uModeA.z, uModeB.z, uModeMix.z), uOpacity.z);

  // Keep the asset legible through the shader stack.
  res = mix(res, baseC, ba * uPreserve);

  // Trails: decaying echo of the previous composite, slightly zoomed.
  if (uTrail > 0.001) {
    vec2 tuv = (uv - .5) * (1. - .006 * uTrail) + .5;
    vec3 prev = texture2D(tPrev, tuv).rgb;
    res = max(res, prev * uTrail);
  }
  gl_FragColor = vec4(res, 1.);
}
`;

export const POST_FRAG = /* glsl */`
uniform sampler2D tSrc;
uniform vec2 uRes;
uniform float uTime;
uniform float uBeat;
uniform float uFx;
uniform vec4 uAudio;
varying vec2 vUv;

float hash21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }

void main(){
  vec2 uv = vUv;
  vec2 c = uv - .5;
  float r2 = dot(c, c);
  float ab = (.002 + .012 * uBeat) * uFx;
  vec2 dir = c * ab;
  vec3 col;
  col.r = texture2D(tSrc, uv + dir).r;
  col.g = texture2D(tSrc, uv).g;
  col.b = texture2D(tSrc, uv - dir).b;
  // soft clip + vignette
  col = col / (1. + col * .15);
  col *= 1. - r2 * (.35 + .4 * uFx) * (1. - .3 * uBeat * uFx);
  // film grain
  float g = hash21(uv * uRes + fract(uTime) * 100.) - .5;
  col += g * .025 * uFx;
  gl_FragColor = vec4(clamp(col, 0., 1.), 1.);
}
`;

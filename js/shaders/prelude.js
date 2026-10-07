// Shared GLSL prelude for every layer shader.
// Each shader in library.js defines `vec4 render(vec2 uv, vec2 p)` where
//   uv : 0..1 texture coordinates
//   p  : centered, aspect-corrected coordinates (y in -1..1)

export const PRELUDE = /* glsl */`
uniform vec2  u_res;      // layer resolution in pixels
uniform float u_time;     // seconds, scaled by the slot's speed
uniform float u_age;      // seconds since this slot started
uniform vec4  u_audio;    // bass, mid, treble, energy (0..1, smoothed)
uniform float u_beat;     // decaying beat pulse (1 on beat -> 0)
uniform float u_seed;     // random seed per slot
uniform vec4  u_params;   // random 0..1 per slot
uniform vec3  u_palA; uniform vec3 u_palB; uniform vec3 u_palC; uniform vec3 u_palD; // cosine palette
uniform sampler2D u_prev; // previous frame of this slot (feedback)
varying vec2 vUv;

#define PI  3.141592653589793
#define TAU 6.283185307179586
#define BASS   u_audio.x
#define MID    u_audio.y
#define TREB   u_audio.z
#define ENERGY u_audio.w

vec3 pal(float t){ return u_palA + u_palB * cos(TAU * (u_palC * t + u_palD)); }
mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float hash11(float p){ p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2  hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float hash31(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), f.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y);
}
float noise3(vec3 p){
  vec3 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(
    mix(mix(hash31(i), hash31(i + vec3(1, 0, 0)), f.x), mix(hash31(i + vec3(0, 1, 0)), hash31(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash31(i + vec3(0, 0, 1)), hash31(i + vec3(1, 0, 1)), f.x), mix(hash31(i + vec3(0, 1, 1)), hash31(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec2 p){
  float v = 0., a = .5; mat2 m = rot(.6);
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = m * p * 2.03 + vec2(1.7, 9.2); a *= .5; }
  return v;
}
float fbm3(vec3 p){
  float v = 0., a = .5;
  for (int i = 0; i < 4; i++) { v += a * noise3(p); p = p * 2.05 + vec3(1.3, 7.1, 3.7); a *= .5; }
  return v;
}
float sdSeg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.); return length(pa - ba * h); }
float sdBox(vec3 p, vec3 b){ vec3 q = abs(p) - b; return length(max(q, 0.)) + min(max(q.x, max(q.y, q.z)), 0.); }
vec3 aces(vec3 x){ return clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0., 1.); }
`;

export const MAIN = /* glsl */`
void main(){
  vec2 uv = vUv;
  vec2 p = (uv * 2. - 1.) * vec2(u_res.x / u_res.y, 1.);
  vec4 c = render(uv, p);
  gl_FragColor = vec4(max(c.rgb, 0.0), 1.0);
}
`;

export const VERTEX = /* glsl */`
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

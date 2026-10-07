// Layer shader library. Each entry is an original GLSL implementation of a
// technique that circulates in the VJ / demoscene / Shadertoy world. `credit`
// names the technique and where it comes from.
//
// Every body must define: vec4 render(vec2 uv, vec2 p)
// and may use everything from prelude.js (pal, rot, fbm, u_prev, BASS...).

import { FRACTAL_SHADERS } from './fractals.js';

export const SHADERS = [
...FRACTAL_SHADERS,
{
  id: 'kali', name: 'Kali Set Fold', cost: 2,
  credit: 'Kali-set iteration (Kali, fractalforums)',
  body: /* glsl */`
vec4 render(vec2 uv, vec2 p){
  float t = u_time * .15;
  vec2 z = p * (1.2 + .3 * sin(t * .7)) + vec2(0., .1 * sin(t));
  z *= rot(t * .3);
  vec2 c = vec2(.65 + .3 * u_params.x, .55 + .35 * u_params.y) + .05 * vec2(sin(t * 1.3), cos(t * .9)) + .08 * BASS;
  float acc = 0., mn = 1e4;
  for (int i = 0; i < 14; i++) {
    z = abs(z) / dot(z, z) - c;
    float l = length(z);
    mn = min(mn, abs(l - .6 - .4 * MID));
    acc += exp(-l * 3.);
  }
  vec3 col = pal(acc * .1 + mn * 2. + u_seed) * (acc * .25);
  col += pal(mn * 4. + .3) * smoothstep(.1, 0., mn) * 1.5;
  col = aces(col * (1. + ENERGY));
  return vec4(col, 1.);
}`
},
{
  id: 'truchet', name: 'Truchet Weave', cost: 1,
  credit: 'Truchet tiling with flowing arcs (Smith 1704 / Shadertoy tradition)',
  body: /* glsl */`
vec4 render(vec2 uv, vec2 p){
  float t = u_time * .5;
  float sc = 3. + 4. * u_params.x;
  vec2 q = p * sc * rot(.2 * sin(t * .1)); q += vec2(t * .3, t * .17);
  vec2 id = floor(q), f = fract(q) - .5;
  float r = hash21(id + floor(u_seed * 100.));
  if (r > .5) f.x = -f.x;
  vec2 c1 = vec2(.5, .5), c2 = vec2(-.5, -.5);
  float d1 = length(f - c1), d2 = length(f - c2);
  float d = min(abs(d1 - .5), abs(d2 - .5));
  vec2 rel = d1 < d2 ? f - c1 : f - c2;
  float ang = atan(rel.y, rel.x);
  float dash = .5 + .5 * sin(ang * 8. + t * 3. + r * 20.);
  float w = .1 + .1 * BASS;
  float line = smoothstep(w, w - .03, d);
  float glow = exp(-d * 6.) * .4;
  vec3 col = pal(r + ang / TAU * .3 + u_time * .05) * (line * (.6 + .6 * dash) + glow * (1. + 2. * TREB));
  return vec4(col, 1.);
}`
},
{
  id: 'warp', name: 'Domain Warp Ink', cost: 2,
  credit: 'Nested fbm domain warping (Inigo Quilez)',
  body: /* glsl */`
vec4 render(vec2 uv, vec2 p){
  float t = u_time * .12;
  vec2 q = p * (1.5 + u_params.x);
  vec2 w1 = vec2(fbm(q + vec2(0., t)), fbm(q + vec2(5.2, 1.3) - t));
  vec2 w2 = vec2(fbm(q + 4. * w1 + vec2(1.7, 9.2) + .15 * t * (1. + BASS)), fbm(q + 4. * w1 + vec2(8.3, 2.8) + .126 * t));
  float f = fbm(q + 4. * w2 * (1. + .3 * MID));
  vec3 col = pal(f * 1.5 + length(w2) * .5 + u_seed);
  col = mix(col, pal(w1.x + .5), smoothstep(.4, .7, f));
  col *= f * f * 2. + .3 + .6 * BASS * exp(-length(p) * 1.5);
  return vec4(col, 1.);
}`
},
{
  id: 'moire', name: 'Moiré Interference', cost: 1,
  credit: 'Interference of drifting ring sources (op-art / early VJ classic)',
  body: /* glsl */`
vec4 render(vec2 uv, vec2 p){
  float t = u_time * .3;
  float freq = 18. + 14. * u_params.y + 6. * MID;
  float s = 0.;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    vec2 c = .7 * vec2(sin(t * (.7 + fi * .23) + fi * 2.1), cos(t * (.5 + fi * .31) + fi * 1.7));
    s += sin(length(p - c) * freq - u_time * 2. + fi);
  }
  s /= 4.;
  float v = smoothstep(-.1, .1, s);
  vec3 col = pal(s * .5 + u_seed + .1 * u_time) * (v * .8 + .2);
  col += pal(s) * pow(abs(s), 8.) * 2. * (1. + 2. * BASS);
  return vec4(col, 1.);
}`
},
{
  id: 'voronoi', name: 'Voronoi Cells', cost: 2,
  credit: 'Voronoi with exact edge distance (Inigo Quilez)',
  body: /* glsl */`
vec2 vpoint(vec2 n, vec2 g, float t){ vec2 o = hash22(n + g + u_seed); return .5 + .4 * sin(t + TAU * o + BASS * 2.); }
vec4 render(vec2 uv, vec2 p){
  float t = u_time * .6;
  vec2 q = p * (3. + 3. * u_params.x) + vec2(t * .2, 0.);
  vec2 n = floor(q), f = fract(q);
  vec2 mg = vec2(0.), mr = vec2(0.); float md = 8.;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 r = g + vpoint(n, g, t) - f; float d = dot(r, r);
    if (d < md) { md = d; mr = r; mg = g; }
  }
  float cd = dot(mr, mr);
  md = 8.;
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
    vec2 g = mg + vec2(float(i), float(j));
    vec2 r = g + vpoint(n, g, t) - f;
    if (dot(mr - r, mr - r) > 1e-5) md = min(md, dot(.5 * (mr + r), normalize(r - mr)));
  }
  float id = hash21(n + mg + u_seed);
  vec3 col = pal(id + u_time * .05) * (.3 + .7 * smoothstep(0., 1., md * 2.)) * (.6 + .8 * ENERGY);
  col += vec3(1.) * smoothstep(.06, 0., md) * (.5 + TREB);
  col += pal(id + .5) * exp(-cd * (4. + 10. * (1. - BASS))) * .8;
  return vec4(col, 1.);
}`
},
{
  id: 'hex', name: 'Hex Pulse', cost: 1,
  credit: 'Hexagonal grid traversal (Shane / Shadertoy)',
  body: /* glsl */`
vec4 hexc(vec2 p){
  const vec2 s = vec2(1., 1.7320508);
  vec4 hC = floor(vec4(p, p - vec2(.5, 1.)) / s.xyxy) + .5;
  vec4 h = vec4(p - hC.xy * s, p - (hC.zw + .5) * s);
  return dot(h.xy, h.xy) < dot(h.zw, h.zw) ? vec4(h.xy, hC.xy) : vec4(h.zw, hC.zw + .5);
}
float hexDist(vec2 p){ p = abs(p); return max(dot(p, vec2(.5, .8660254)), p.x); }
vec4 render(vec2 uv, vec2 p){
  float t = u_time;
  vec2 q = p * (4. + 4. * u_params.x) * rot(t * .03);
  vec4 h = hexc(q);
  float d = hexDist(h.xy);
  float id = hash21(h.zw + u_seed);
  float ring = length(h.zw) * .3 - t * .8;
  float wave = .5 + .5 * sin(ring + id * TAU);
  float r = .5 * (.35 + .5 * wave * (1. + BASS * .8));
  float fill = smoothstep(r, r - .05, d);
  vec3 col = pal(id * .3 + ring * .05 + u_seed) * fill * (.4 + .9 * wave);
  col += pal(id + .5) * smoothstep(.5, .42, d) * smoothstep(.40, .5, d) * TREB * 2.;
  col += vec3(.15) * (1. - smoothstep(0., .06, .5 - d));
  return vec4(col, 1.);
}`
},
{
  id: 'gyroid', name: 'Gyroid Tunnel', cost: 3,
  credit: 'Raymarched gyroid shell (minimal surface, VJ raymarch staple)',
  body: /* glsl */`
float gyr(vec3 p){ return dot(sin(p), cos(p.yzx)); }
float map(vec3 p){
  float k = 1.5 + u_params.x;
  float g = gyr(p * k) / k;
  return abs(g) - .15 - .1 * BASS;
}
vec4 render(vec2 uv, vec2 p){
  vec3 ro = vec3(0., 0., u_time * 1.5);
  ro.xy += vec2(sin(u_time * .3), cos(u_time * .27)) * .5;
  vec3 rd = normalize(vec3(p, 1.3));
  rd.xy *= rot(u_time * .1);
  float t = 0., glow = 0.;
  for (int i = 0; i < 64; i++) {
    vec3 q = ro + rd * t;
    float d = map(q);
    glow += exp(-abs(d) * 8.) * .02;
    if (abs(d) < .001 || t > 20.) break;
    t += max(d * .8, .01);
  }
  vec3 q = ro + rd * t;
  vec2 e = vec2(.002, 0.);
  vec3 n = normalize(vec3(map(q + e.xyy) - map(q - e.xyy), map(q + e.yxy) - map(q - e.yxy), map(q + e.yyx) - map(q - e.yyx)));
  float fog = exp(-t * .18);
  float dif = .5 + .5 * dot(n, normalize(vec3(.3, .6, -.5)));
  vec3 col = pal(q.z * .1 + n.y * .2 + u_seed) * dif * fog;
  col += pal(u_seed + .3) * glow * (1. + 2. * MID);
  col = aces(col * 1.4);
  return vec4(col, 1.);
}`
},
{
  id: 'kaleido', name: 'Kaleidoscope', cost: 2,
  credit: 'Polar fold kaleidoscope over fbm (classic VJ mirror)',
  body: /* glsl */`
vec4 render(vec2 uv, vec2 p){
  float t = u_time * .2;
  float n = floor(5. + 6. * u_params.x);
  float a = atan(p.y, p.x), r = length(p);
  a = mod(a, TAU / n); a = abs(a - PI / n);
  vec2 q = vec2(cos(a), sin(a)) * r;
  q *= rot(t * .5); q += vec2(t * .7, -t * .3);
  float f = fbm(q * 3. + BASS);
  float f2 = fbm(q * 6. - t + vec2(f));
  vec3 col = pal(f * 2. + f2 + u_seed + r * .5) * (f2 * 1.5 + .2);
  col += pal(r * 2.) * smoothstep(.4, 0., abs(f - .5)) * (.3 + TREB);
  col *= smoothstep(2., .3, r);
  return vec4(col, 1.);
}`
},
{
  id: 'plasma', name: 'Plasma Classic', cost: 1,
  credit: 'Demoscene sine plasma (Future Crew era)',
  body: /* glsl */`
vec4 render(vec2 uv, vec2 p){
  float t = u_time * .8;
  vec2 q = p * (2. + 2. * u_params.x);
  float v = sin(q.x + t) + sin(q.y + t * .7) + sin((q.x + q.y) * .7 + t * 1.3)
          + sin(length(q + vec2(sin(t * .4), cos(t * .6)) * 2.) * 2. - t * 1.7);
  v *= .25;
  v += .3 * BASS * sin(length(p) * 8. - u_time * 6.);
  vec3 col = pal(v + u_seed + u_time * .03);
  col *= .7 + .5 * sin(v * TAU * 2. + MID * 3.);
  return vec4(col, 1.);
}`
},
{
  id: 'lissajous', name: 'Lissajous Strands', cost: 2,
  credit: 'Lissajous curve drawn as glowing segments (oscilloscope VJ)',
  body: /* glsl */`
vec2 liss(float ph, float a, float b, float t){
  return vec2(sin(a * ph + t * .3 + BASS * .5), sin(b * ph + t * .21 + MID * .7)) * (.8 + .1 * sin(t + ph));
}
vec4 render(vec2 uv, vec2 p){
  float t = u_time * .5;
  float a = 2. + floor(u_params.x * 3.), b = 3. + floor(u_params.y * 3.);
  vec3 col = vec3(0.);
  float w = .004 + .006 * TREB;
  vec2 prev = liss(0., a, b, t);
  for (int k = 1; k <= 96; k++) {
    float s = float(k) / 96. * TAU;
    vec2 c = liss(s, a, b, t);
    float d = sdSeg(p, prev, c);
    col += pal(s / TAU + u_seed + t * .05) * (w / (d + w)) * .35;
    prev = c;
  }
  col = aces(col * (1. + ENERGY));
  return vec4(col, 1.);
}`
},
{
  id: 'feedback', name: 'Feedback Zoom Bloom', cost: 1,
  credit: 'Video-feedback zoom with injected sparks (analog VJ feedback loop)',
  body: /* glsl */`
vec4 render(vec2 uv, vec2 p){
  float t = u_time;
  vec2 c = uv - .5;
  c *= 1. - .02 - .03 * BASS;
  c *= rot((.01 + .02 * sin(t * .3)) * (u_params.x - .5) * 2.);
  c += .003 * vec2(sin(t * 1.1), cos(t * .9));
  vec3 prev = texture2D(u_prev, c + .5).rgb;
  prev = prev * .95 + prev.gbr * .03;
  vec3 add = vec3(0.);
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    vec2 s = vec2(sin(t * (.6 + fi * .17) + fi), cos(t * (.45 + fi * .13) + fi * 2.)) * .7;
    float d = length(p - s);
    add += pal(fi * .17 + u_seed + t * .1) * smoothstep(.08 + .1 * BASS, 0., d);
  }
  add += pal(u_seed + .4) * smoothstep(.02, 0., abs(length(p) - (1. - u_beat) * 1.5)) * u_beat;
  vec3 col = prev * .985 + add;
  return vec4(col, 1.);
}`
},
{
  id: 'glitch', name: 'Block Glitch', cost: 1,
  credit: 'Datamosh-style row shift + RGB split (glitch VJ idiom)',
  body: /* glsl */`
vec3 src(vec2 q, float t){
  float f = fbm(q * 3. + vec2(t * .2, 0.));
  float bars = step(.5, fract(q.x * 6. + t * .3 + f));
  return pal(f * 2. + u_seed + t * .03) * (.35 + .75 * bars);
}
vec4 render(vec2 uv, vec2 p){
  float t = u_time;
  float rows = 16. + 40. * u_params.x;
  float rowN = floor(uv.y * rows);
  float tick = floor(t * (6. + 10. * ENERGY));
  float r = hash21(vec2(rowN, tick) + u_seed);
  float shift = (r - .5) * (.1 + .6 * BASS) * step(.65, r);
  vec2 q = p; q.x += shift;
  vec2 blockId = floor(q * vec2(6., 4.) + tick);
  float bh = hash21(blockId + u_seed);
  if (bh > .8) q = q.yx * rot(1.57);
  float sp = (.008 + .04 * TREB) * step(.5, hash11(tick + u_seed));
  vec3 col;
  col.r = src(q + vec2(sp, 0.), t).r;
  col.g = src(q, t).g;
  col.b = src(q - vec2(sp, 0.), t).b;
  col *= .85 + .15 * sin(uv.y * u_res.y * 1.5);
  col += vec3(1.) * step(.975, hash21(vec2(rowN, floor(t * 20.)) + u_seed)) * (.3 + MID);
  col = mix(col, 1. - col, step(.93, hash11(tick * 3.1 + u_seed)) * u_beat);
  return vec4(col, 1.);
}`
},
{
  id: 'spiral', name: 'Log Spiral Vortex', cost: 1,
  credit: 'Log-polar spiral interference (hypnotic VJ loop)',
  body: /* glsl */`
vec4 render(vec2 uv, vec2 p){
  float t = u_time * .5;
  float r = length(p), a = atan(p.y, p.x);
  float lr = log(r + 1e-4);
  float arms = floor(2. + 4. * u_params.x);
  float s = sin(arms * a + lr * (6. + 4. * u_params.y) - t * 3.);
  float s2 = sin(arms * a - lr * 8. + t * 2. + BASS * 2.);
  float v = smoothstep(-.2, .2, s * s2);
  vec3 col = pal(lr * .3 + a / TAU + u_seed + t * .1) * v;
  col += pal(s + .5) * pow(max(0., s), 6.) * (.5 + 1.5 * TREB);
  col *= smoothstep(0., .15, r) * (1. + 2. * BASS * exp(-r * 3.));
  col += pal(u_seed + .3) * exp(-r * 6.) * (.5 + 2. * BASS);
  return vec4(col, 1.);
}`
},
{
  id: 'metaballs', name: 'Metaballs', cost: 1,
  credit: 'Inverse-square metaballs with audio-sized blobs (Blinn blobbies)',
  body: /* glsl */`
vec4 render(vec2 uv, vec2 p){
  float t = u_time * .6;
  float f = 0.; vec3 ccol = vec3(0.);
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    vec2 c = vec2(sin(t * (.5 + fi * .11) + fi * 1.3), cos(t * (.4 + fi * .09) + fi * .7)) * (.6 + .2 * sin(fi + t));
    float band = fi < 2. ? BASS : (fi < 4. ? MID : TREB);
    float rr = .08 + .05 * hash11(fi + u_seed) + .08 * band;
    float w = rr / dot(p - c, p - c);
    f += w; ccol += pal(fi * .13 + u_seed) * w;
  }
  ccol /= f;
  float th = 3. + 2. * u_params.x;
  float m = smoothstep(th - .6, th + .6, f);
  float edge = smoothstep(0., .5, abs(f - th));
  vec3 col = ccol * m * (.6 + .6 * edge) + pal(u_seed + .5) * smoothstep(.5, 0., abs(f - th)) * (.6 + TREB);
  col += ccol * .15 * smoothstep(0., th, f);
  return vec4(col, 1.);
}`
},
{
  id: 'synthgrid', name: 'Synthwave Grid', cost: 1,
  credit: 'Perspective floor grid + striped sun (outrun / retrowave VJ)',
  body: /* glsl */`
vec4 render(vec2 uv, vec2 p){
  float t = u_time * 2.;
  vec3 col = vec3(0.);
  float horizon = .05 * sin(u_time * .3);
  float yy = p.y - horizon;
  float side = sign(yy);
  float z = 1. / (abs(yy) + .001);
  vec2 g = vec2(p.x * z * (1. + .3 * u_params.x), z + t);
  vec2 gf = abs(fract(g) - .5);
  float line = smoothstep(.06, 0., min(gf.x, gf.y) * (abs(yy) * 2. + .1));
  float fade = smoothstep(0., .3, abs(yy));
  col += pal(u_seed + floor(g.y) * .03 + side * .2) * line * fade * (1. + BASS * 1.5);
  vec2 sp = p - vec2(0., horizon + .1);
  float sun = smoothstep(.42 + .1 * BASS, .4, length(sp));
  sun *= smoothstep(-.2, .2, sin(sp.y * 50. + t * 2.) + smoothstep(0., .3, sp.y) * 2.);
  col += pal(u_seed + .6) * sun * .8;
  col += pal(u_seed + .6) * exp(-length(sp) * 3.) * .3;
  float st = step(.995, hash21(floor(p * 120.) + u_seed));
  col += st * smoothstep(0., .3, yy) * (.5 + TREB);
  return vec4(col, 1.);
}`
},
{
  id: 'starwarp', name: 'Starfield Warp', cost: 1,
  credit: 'Radial hyperspace streaks (demoscene star warp)',
  body: /* glsl */`
vec4 render(vec2 uv, vec2 p){
  vec3 col = vec3(0.);
  float a = atan(p.y, p.x), r = length(p);
  float speed = .3 + .5 * u_params.x + .6 * BASS;
  for (int L = 0; L < 3; L++) {
    float fl = float(L);
    float N = 60. + fl * 40.;
    float sec = floor((a / TAU + .5) * N + fl * .37);
    float h = hash11(sec + fl * 131. + u_seed);
    float ph = fract(h * 10. + u_time * speed * (.5 + h));
    float sr = ph * ph * 1.6;
    float sa = ((sec + .5 + (h - .5) * .6) / N - .5) * TAU;
    vec2 dir = vec2(cos(sa), sin(sa));
    vec2 sp = dir * sr;
    float len = .02 + .3 * ph * ph * (1. + BASS);
    float d = sdSeg(p, sp, sp - dir * len);
    float br = smoothstep(.006 + .004 * ph, 0., d) * ph;
    col += pal(h + u_seed + fl * .2) * br * (1. + TREB);
  }
  col += pal(u_seed + .5) * exp(-r * 4.) * .4 * (1. + BASS * 2.);
  return vec4(col, 1.);
}`
},
{
  id: 'julia', name: 'Julia Orbit Traps', cost: 2,
  credit: 'Animated Julia set with orbit-trap colouring',
  body: /* glsl */`
vec4 render(vec2 uv, vec2 p){
  float t = u_time * .2;
  vec2 z = p * 1.4 * rot(t * .1);
  vec2 c = vec2(-.75 + .15 * sin(t * .7), .1 + .15 * cos(t * .9)) + u_params.xy * .1 - .05;
  c += .03 * BASS;
  float trap = 1e5, trap2 = 1e5, n = 0.;
  for (int i = 0; i < 40; i++) {
    z = vec2(z.x * z.x - z.y * z.y, 2. * z.x * z.y) + c;
    trap = min(trap, length(z - vec2(.3, .2)));
    trap2 = min(trap2, abs(length(z) - .5 - .3 * MID));
    if (dot(z, z) > 16.) break;
    n += 1.;
  }
  float sn = n / 40.;
  vec3 col = pal(sn * 2. + trap * .5 + u_seed);
  col *= .3 + .7 * smoothstep(1., 0., trap);
  col += pal(trap2 + u_seed + .3) * smoothstep(.1, 0., trap2) * (.7 + TREB);
  col *= smoothstep(0., .05, sn) + .1;
  return vec4(col, 1.);
}`
},
{
  id: 'phyllo', name: 'Phyllotaxis Bloom', cost: 2,
  credit: 'Vogel sunflower spiral, golden-angle point field',
  body: /* glsl */`
vec4 render(vec2 uv, vec2 p){
  float t = u_time;
  float c = .045 + .02 * u_params.x;
  float ga = 2.39996323 + .0008 * sin(t * .05) * u_params.y;
  vec2 q = p * rot(t * .1);
  float r = length(q);
  float n0 = floor((r / c) * (r / c));
  float md = 1e5, mi = 0.;
  for (int k = -20; k <= 20; k++) {
    float n = max(0., n0 + float(k));
    float rr = c * sqrt(n), aa = n * ga;
    vec2 pp = vec2(cos(aa), sin(aa)) * rr;
    float d = length(q - pp);
    if (d < md) { md = d; mi = n; }
  }
  float size = c * (.35 + .3 * sin(mi * .05 - t * 2.) + .3 * BASS);
  float dotm = smoothstep(size, size - .004, md);
  vec3 col = pal(mi * .003 + u_seed + t * .05) * dotm;
  col += pal(mi * .003 + u_seed + .5) * exp(-md * 40.) * .3 * (1. + 2. * TREB);
  col *= smoothstep(1.6, .8, r) + .2;
  return vec4(col, 1.);
}`
},
{
  id: 'apollonian', name: 'Apollonian Inversion', cost: 2,
  credit: 'Circle-inversion fractal (Kali / Apollonian gasket family)',
  body: /* glsl */`
vec4 render(vec2 uv, vec2 p){
  float t = u_time * .2;
  vec2 z = p * 1.2 * rot(t * .2);
  float s = 1., acc = 0.;
  float k = 1. + .2 * sin(t) + .3 * u_params.x + .2 * BASS;
  for (int i = 0; i < 10; i++) {
    z = -1. + 2. * fract(.5 * z + .5);
    float r2 = dot(z, z);
    float f = max(k / r2, 1.);
    z *= f; s *= f;
    acc += exp(-r2 * 2.);
  }
  float d = abs(length(z) - .5) / s;
  vec3 col = pal(acc * .2 + u_seed + log(s) * .05) * (acc * .3);
  col += pal(u_seed + .4) * smoothstep(.01, 0., d) * (1. + 2. * TREB);
  col = aces(col * (1.2 + ENERGY));
  return vec4(col, 1.);
}`
},
{
  id: 'opart', name: 'Op-Art Checker Warp', cost: 1,
  credit: 'Warped checkerboard with beat inversion (Bridget Riley / op-art VJ)',
  body: /* glsl */`
vec4 render(vec2 uv, vec2 p){
  float t = u_time * .4;
  vec2 q = p;
  float r = length(q);
  q *= rot(sin(r * 3. - t) * .6 * u_params.y + t * .1);
  q += .2 * vec2(sin(q.y * 3. + t), cos(q.x * 3. - t)) * (.5 + BASS);
  q *= 6. + 4. * u_params.x + 2. * sin(r * 2. - t * 2.) * MID;
  float ch = mod(floor(q.x) + floor(q.y), 2.);
  vec2 f = abs(fract(q) - .5);
  float aa = fwidth(q.x) * .7;
  float edge = smoothstep(.5 - aa, .5, max(f.x, f.y));
  vec3 a = pal(u_seed + r * .2), b = pal(u_seed + .5 + t * .05);
  vec3 col = mix(a, b, ch) * (1. - edge * .5);
  col = mix(col, 1. - col, smoothstep(0., .2, u_beat) * step(.5, hash11(floor(u_time * 4.) + u_seed)));
  return vec4(col, 1.);
}`
},
{
  id: 'lightning', name: 'Lightning Threads', cost: 2,
  credit: 'fbm-displaced bolts with flicker (electric VJ overlay)',
  body: /* glsl */`
vec4 render(vec2 uv, vec2 p){
  float t = u_time;
  vec3 col = vec3(0.);
  float clouds = fbm(p * 2. + vec2(0., t * .1)) * .15;
  col += pal(u_seed + .7) * clouds;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float seg = floor(t * (5. + fi * 2.)) + fi * 13. + u_seed;
    float jitter = hash11(seg);
    float off = (fbm(vec2(p.y * (2. + 3. * jitter), seg * 3.1)) - .5) * 1.4 + (jitter - .5) * 1.2 * (1. + u_params.x);
    off += (noise(vec2(p.y * 20., seg * 7.)) - .5) * .15 * (1. + 2. * TREB);
    float d = abs(p.x - off);
    float flick = .3 + .7 * step(.3, hash11(seg * 1.7 + floor(t * 30.))) * (.5 + BASS);
    col += pal(fi * .3 + u_seed) * (.012 / (d + .01)) * .6 * flick;
  }
  col = aces(col);
  return vec4(col, 1.);
}`
},
{
  id: 'rings', name: 'Segmented Rings', cost: 1,
  credit: 'Counter-rotating dashed rings (op-art / radar VJ)',
  body: /* glsl */`
vec4 render(vec2 uv, vec2 p){
  float t = u_time;
  float r = length(p), a = atan(p.y, p.x);
  float density = 10. + 6. * u_params.x;
  float nr = floor(r * density);
  float h = hash11(nr + u_seed);
  float dir = h > .5 ? 1. : -1.;
  float segs = floor(3. + h * 9.);
  float aa = a + dir * t * (.3 + h) * (1. + BASS);
  float seg = step(.5 + .3 * sin(nr + t), fract(aa * segs / TAU));
  float ringF = fract(r * density);
  float band = smoothstep(.1, .2, ringF) * smoothstep(.95, .85, ringF);
  vec3 col = pal(h + u_seed + nr * .05) * seg * band;
  col *= smoothstep(1.5, .7, r) + .3;
  col += pal(u_seed + .2) * smoothstep(.04, 0., abs(r - .05 - (1. - u_beat) * .9)) * u_beat * 2.;
  return vec4(col, 1.);
}`
},
{
  id: 'lattice', name: 'Lattice Flythrough', cost: 3,
  credit: 'Raymarched repeated bar lattice (Menger-style tunnel)',
  body: /* glsl */`
float bars(vec3 q, float c){ return min(sdBox(q, vec3(9., c, c)), min(sdBox(q, vec3(c, 9., c)), sdBox(q, vec3(c, c, 9.)))); }
float map(vec3 p){
  vec3 q = mod(p + 1., 2.) - 1.;
  float c = .12 + .08 * BASS;
  float d = bars(q, c);
  vec3 q2 = mod(p * 2. + 1.5, 2.) - 1.;
  d = min(d, bars(q2, c * .4 + .1 * u_params.y) / 2.);
  return d;
}
vec4 render(vec2 uv, vec2 p){
  float t = u_time;
  vec3 ro = vec3(1., 1., t * 1.2);
  ro.xy += vec2(sin(t * .4), cos(t * .33)) * .35;
  vec3 rd = normalize(vec3(p, 1.1));
  rd.xy *= rot(t * .15);
  rd.xz *= rot(sin(t * .2) * .3);
  float d = 0., tt = 0., glow = 0.;
  for (int i = 0; i < 70; i++) {
    d = map(ro + rd * tt);
    glow += exp(-d * 10.) * .015;
    if (d < .002 || tt > 24.) break;
    tt += d * .9;
  }
  vec3 q = ro + rd * tt;
  vec2 e = vec2(.002, 0.);
  vec3 n = normalize(vec3(map(q + e.xyy) - map(q - e.xyy), map(q + e.yxy) - map(q - e.yxy), map(q + e.yyx) - map(q - e.yyx)));
  float fog = exp(-tt * .16);
  float dif = .4 + .6 * max(0., dot(n, normalize(vec3(.4, .7, -.3))));
  vec3 col = pal(floor(q.z * .5) * .1 + u_seed) * dif * fog * step(d, .01);
  col += pal(u_seed + .5) * glow * (1. + 2. * MID);
  col = aces(col * 1.3);
  return vec4(col, 1.);
}`
},
{
  id: 'ribbons', name: 'Sine Ribbons', cost: 1,
  credit: 'Stacked travelling sine ribbons (oscilloscope VJ)',
  body: /* glsl */`
vec4 render(vec2 uv, vec2 p){
  float t = u_time;
  vec3 col = vec3(0.);
  float band = .5 + .5 * fbm(p * 2. + t * .1);
  float freq = 1.5 + u_params.x * 2.;
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    float ph = fi * .5 + u_seed * 10.;
    float y = .6 * sin(p.x * freq + t * (.7 + fi * .05) + ph) * (.5 + .5 * sin(t * .3 + fi))
            + .3 * sin(p.x * 3. + t + fi) * BASS;
    y += (fi - 5.5) * .08 * (1. + MID);
    float d = abs(p.y - y);
    float w = .004 + .01 * TREB;
    col += pal(fi * .08 + u_seed + t * .05) * (w / (d + w)) * (.6 + .6 * band);
  }
  col = aces(col);
  return vec4(col, 1.);
}`
},
{
  id: 'cloudtunnel', name: 'Nebula Tunnel', cost: 3,
  credit: 'Volumetric fbm tunnel march (Duke / space-nebula VJ)',
  body: /* glsl */`
vec4 render(vec2 uv, vec2 p){
  float t = u_time * .6;
  vec3 ro = vec3(0., 0., t);
  vec3 rd = normalize(vec3(p, 1.));
  rd.xy *= rot(t * .1);
  vec3 col = vec3(0.);
  float tt = 0.;
  float den = .8 + .6 * u_params.x;
  for (int i = 0; i < 40; i++) {
    vec3 q = ro + rd * tt;
    float r = length(q.xy);
    float wall = 1.2 + .3 * sin(q.z * .5 + t) - r;
    float n = fbm3(q * den + vec3(0., 0., -t * .5));
    float dens = smoothstep(.1, .6, n) * smoothstep(-.2, .4, wall) * (.3 + BASS * .4);
    vec3 c = pal(n * 1.5 + q.z * .05 + u_seed) * dens;
    col += c * exp(-tt * .25) * .09;
    tt += .12 + .06 * (1. - dens);
  }
  col += pal(u_seed + .5) * exp(-length(p) * 2.5) * (.2 + .6 * TREB);
  col = aces(col * 1.6);
  return vec4(col, 1.);
}`
}
];

export const SHADER_BY_ID = Object.fromEntries(SHADERS.map(s => [s.id, s]));

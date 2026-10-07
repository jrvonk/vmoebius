// Deep-zoom fractal shaders. Both carry CPU-side state (see timeline.js):
//  - 'mandelbulb': raymarched 3D Mandelbulb with a camera that dives toward
//    the surface forever. Speed is proportional to the distance estimate, so
//    the approach is exponential and never arrives; when float precision gets
//    thin the camera skims along the surface and re-dives elsewhere.
//  - 'mandelzoom': 2D Mandelbrot infinite zoom into famous deep-zoom targets,
//    using two staggered zoom layers so the loop never visibly restarts.

const rand = (a, b) => a + Math.random() * (b - a);

// CPU mirror of the GLSL Mandelbulb distance estimator.
function bulbDE(x, y, z, power) {
  let zx = x, zy = y, zz = z, dr = 1, r = 0;
  for (let i = 0; i < 12; i++) {
    r = Math.sqrt(zx * zx + zy * zy + zz * zz);
    if (r > 2) break;
    const rr = Math.max(r, 1e-9);
    const theta = Math.acos(Math.max(-1, Math.min(1, zz / rr))) * power;
    const phi = Math.atan2(zy, zx) * power;
    const zr = Math.pow(rr, power);
    dr = Math.pow(rr, power - 1) * power * dr + 1;
    const st = Math.sin(theta);
    zx = zr * st * Math.cos(phi) + x;
    zy = zr * st * Math.sin(phi) + y;
    zz = zr * Math.cos(theta) + z;
  }
  r = Math.max(r, 1e-9);
  return 0.5 * Math.log(r) * r / dr;
}

const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z });
const norm = v => { const l = Math.hypot(v.x, v.y, v.z) || 1; return v3(v.x / l, v.y / l, v.z / l); };
const add = (a, b, k = 1) => v3(a.x + b.x * k, a.y + b.y * k, a.z + b.z * k);
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);

export const FRACTAL_SHADERS = [
{
  id: 'mandelbulb', name: 'Mandelbulb Dive', cost: 4,
  credit: 'Mandelbulb (Daniel White & Paul Nylander, 2009) with distance-estimated raymarching and an endless dive camera',
  uniforms: { u_camPos: [0, 0, 2.5], u_camDir: [0, 0, -1], u_camUp: [0, 1, 0], u_power: 8, u_camDE: 1 },
  state() {
    const dir = norm(v3(rand(-1, 1), rand(-1, 1), rand(-1, 1)));
    const pos = add(v3(), dir, 2.6);
    return { pos, dir: norm(add(v3(), pos, -1)), up: v3(0, 1, 0), power: rand(6, 9), powerT: rand(5, 10), retarget: rand(10, 25), roll: rand(-.08, .08), wander: rand(0, 100) };
  },
  update(st, u, dt, audio, beat, time) {
    // Slowly morph the power; the fractal keeps changing under the camera.
    st.retarget -= dt;
    if (st.retarget < 0) { st.powerT = rand(4.5, 11); st.retarget = rand(12, 30); }
    st.power += (st.powerT - st.power) * (1 - Math.exp(-dt * .08));
    const pw = st.power;
    const p = st.pos;
    let d = bulbDE(p.x, p.y, p.z, pw);
    const e = Math.max(Math.abs(d) * .5, 1e-4);
    const n = norm(v3(
      bulbDE(p.x + e, p.y, p.z, pw) - bulbDE(p.x - e, p.y, p.z, pw),
      bulbDE(p.x, p.y + e, p.z, pw) - bulbDE(p.x, p.y - e, p.z, pw),
      bulbDE(p.x, p.y, p.z + e, pw) - bulbDE(p.x, p.y, p.z - e, pw)));
    if (d < 2e-4) { st.pos = add(p, n, 2e-4 - d + 1e-4); d = 2e-4; } // escaped inside: step back out
    st.wander += dt;
    // Desired heading: mostly forward, biased toward the surface (the dive),
    // pushed away when precision runs out, and pulled home if we drift off.
    let desired = add(st.dir, n, -.25);
    const near = Math.max(0, (.0025 - d) / .0025);
    desired = add(desired, n, near * 1.2);
    const w = st.wander;
    desired = add(desired, v3(Math.sin(w * .21), Math.cos(w * .17), Math.sin(w * .11)), .12 + .25 * near);
    const dist = Math.hypot(p.x, p.y, p.z);
    if (dist > 1.6) desired = add(desired, norm(v3(-p.x, -p.y, -p.z)), (dist - 1.6) * 2);
    desired = norm(desired);
    const k = 1 - Math.exp(-dt * (1.2 + near * 3));
    st.dir = norm(add(st.dir, add(desired, st.dir, -1), k));
    // Exponential approach: speed shrinks with the distance estimate.
    const speed = Math.min(.45, Math.max(3e-4, d * .8)) * (1 + .5 * audio.w + .8 * beat);
    st.pos = add(st.pos, st.dir, speed * dt);
    // Keep the up vector orthogonal and roll gently.
    let up = add(st.up, st.dir, -dot(st.up, st.dir));
    const r = cross(st.dir, up);
    up = norm(add(up, r, Math.sin(st.roll * dt)));
    st.up = up;
    u.u_camPos.value.set(st.pos.x, st.pos.y, st.pos.z);
    u.u_camDir.value.set(st.dir.x, st.dir.y, st.dir.z);
    u.u_camUp.value.set(up.x, up.y, up.z);
    u.u_power.value = pw + .04 * Math.sin(time * 2) * audio.x;
    u.u_camDE.value = d;
  },
  body: /* glsl */`
uniform vec3 u_camPos; uniform vec3 u_camDir; uniform vec3 u_camUp; uniform float u_power; uniform float u_camDE;
vec2 bulb(vec3 p, out float trap){
  vec3 z = p; float dr = 1., r = 0., it = 0.; trap = 1e5;
  for (int k = 0; k < 12; k++) {
    r = max(length(z), 1e-9);
    if (r > 2.) break;
    float theta = acos(clamp(z.z / r, -1., 1.)) * u_power, phi = atan(z.y, z.x) * u_power;
    float zr = pow(r, u_power);
    dr = pow(r, u_power - 1.) * u_power * dr + 1.;
    float st = sin(theta);
    z = zr * vec3(st * cos(phi), st * sin(phi), cos(theta)) + p;
    trap = min(trap, dot(z, z));
    it += 1.;
  }
  return vec2(.5 * log(r) * r / dr, it);
}
vec4 render(vec2 uv, vec2 p){
  vec3 ro = u_camPos;
  vec3 f = normalize(u_camDir), rgt = normalize(cross(f, u_camUp)), up = cross(rgt, f);
  vec3 rd = normalize(f * 1.4 + p.x * rgt + p.y * up);
  float pix = 1.2 / u_res.y;
  float t = 0., trap = 0., hitTrap = 0., hitIt = 0., steps = 0.; bool hit = false;
  for (int i = 0; i < 110; i++) {
    vec3 q = ro + rd * t;
    vec2 h = bulb(q, trap);
    float d = h.x;
    steps += 1.;
    if (d < pix * t * .6 + 1e-6) { hit = true; hitTrap = trap; hitIt = h.y; break; }
    if (t > 6.) break;
    t += d * .9;
  }
  vec3 bg = pal(u_seed + .6 + p.y * .1) * .08 + vec3(.01, .01, .02);
  if (!hit) return vec4(bg + pal(u_seed + .3) * .04 * (1. + 2. * TREB) * exp(-length(p) * 2.), 1.);
  vec3 q = ro + rd * t;
  float e = max(pix * t * .5, 2e-6);
  float tt;
  vec3 n = normalize(vec3(
    bulb(q + vec3(e, 0, 0), tt).x - bulb(q - vec3(e, 0, 0), tt).x,
    bulb(q + vec3(0, e, 0), tt).x - bulb(q - vec3(0, e, 0), tt).x,
    bulb(q + vec3(0, 0, e), tt).x - bulb(q - vec3(0, 0, e), tt).x));
  float ao = clamp(1. - steps / 110., 0., 1.);
  ao = ao * ao;
  vec3 L = normalize(vec3(.5, .8, .3));
  float dif = max(0., dot(n, L)) * .7 + .3;
  float spec = pow(max(0., dot(reflect(-L, n), -rd)), 24.);
  float fres = pow(1. - max(0., dot(n, -rd)), 3.);
  vec3 col = pal(sqrt(hitTrap) * 1.5 + hitIt * .06 + u_seed) * (.25 + .75 * dif) * (.35 + .65 * ao);
  col += pal(u_seed + .4) * fres * .5 * (1. + BASS);
  col += vec3(1.) * spec * .4 * (1. + 2. * TREB);
  float fog = exp(-t / (u_camDE * 6. + .3));
  col = mix(bg, col, fog);
  col += pal(u_seed + .15) * u_beat * .15;
  return vec4(aces(col * 1.5), 1.);
}`
},
{
  id: 'mandelzoom', name: 'Mandelbrot Infinite Zoom', cost: 3,
  credit: 'Mandelbrot set deep zoom with distance-estimated edges; two staggered zoom layers make the loop endless',
  uniforms: { u_zoomPhase: 0, u_zoomAngle: 0, u_center: [-.7436438870371587, .1318259042053119] },
  state() {
    const targets = [
      [-.7436438870371587, .1318259042053119],  // seahorse valley spiral
      [-.77568377, .13646737],                  // seahorse valley tendrils
      [.2549870375144766, -.0005679790528465],  // elephant valley
      [-1.25066, .02012],                       // antenna mini-brot
      [-.1011, .9563],                          // Misiurewicz point
      [-1.7686, .00185],                        // period-3 bulb satellite
      [-.16, 1.0405]                            // top tendril spiral
    ];
    const t = targets[Math.floor(Math.random() * targets.length)];
    return { center: t, phase: Math.random(), period: rand(22, 34), angle: rand(0, 6.28), spin: rand(-.06, .06) };
  },
  update(st, u, dt, audio, beat) {
    st.phase = (st.phase + dt / st.period * (1 + .35 * audio.x + .5 * beat)) % 1;
    st.angle += st.spin * dt * (1 + audio.y);
    u.u_zoomPhase.value = st.phase;
    u.u_zoomAngle.value = st.angle;
    u.u_center.value.set(st.center[0], st.center[1]);
  },
  body: /* glsl */`
uniform float u_zoomPhase; uniform float u_zoomAngle; uniform vec2 u_center;
vec3 brot(vec2 p0, float phase){
  float scale = 2.2 * pow(1e-4, phase);
  vec2 c = u_center + rot(u_zoomAngle) * p0 * scale;
  vec2 z = vec2(0.), dz = vec2(0.);
  float n = 0., m2 = 0.;
  for (int i = 0; i < 300; i++) {
    dz = 2. * vec2(z.x * dz.x - z.y * dz.y, z.x * dz.y + z.y * dz.x) + vec2(1., 0.);
    z = vec2(z.x * z.x - z.y * z.y, 2. * z.x * z.y) + c;
    m2 = dot(z, z);
    if (m2 > 1e4) break;
    n += 1.;
  }
  if (n >= 299.) return vec3(0.);
  float sn = n - log2(log2(m2)) + 4.;
  float de = .5 * sqrt(m2) * log(m2) / max(length(dz), 1e-20);
  float pixel = scale / u_res.y * 2.;
  float edge = clamp(de / pixel, 0., 1.);
  vec3 col = pal(sn * .018 + u_seed + phase * .3) * (.35 + .65 * pow(edge, .4));
  col *= .6 + .4 * sin(sn * .35 + u_time * .5) ;
  return col;
}
vec4 render(vec2 uv, vec2 p){
  float ph1 = u_zoomPhase, ph2 = fract(u_zoomPhase + .5);
  float w1 = 1. - abs(ph1 * 2. - 1.);
  vec3 a = brot(p, ph1), b = brot(p, ph2);
  vec3 col = a * w1 + b * (1. - w1);
  col *= 1. + .4 * BASS * exp(-length(p) * 1.5);
  col += pal(u_seed + .5) * u_beat * .1;
  return vec4(col, 1.);
}`
}
];

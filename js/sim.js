// Falcon 9-style 2-D ascent + booster-return simulation (point mass, spherical non-rotating Earth).
// Figures: SpaceX public vehicle page + Wikipedia "Falcon 9" (Block 5). Stage masses are public estimates.
export const F9 = {
  height: 70, diameter: 3.7, liftoffMass: 549054,
  s1: { dry: 25600, prop: 411000, engines: 9, fSL: 845e3, ispSL: 282, ispVac: 311, burn: 162 },
  s2: { dry: 4000, prop: 107500, fVac: 981e3, isp: 348, burn: 397 },
  fairing: 1900, leoExp: 22800, leoAsds: 17500, gtoExp: 8300
};
const KICK_V = 100;
// Earth rotation, effective eastward surface speed ~408 m/s at Cape Canaveral (28.5° N)
const W = 408 / 6371e3;
const G0 = 9.80665, MU = 3.986004e14, RE = 6371e3;
const A_REF = Math.PI * (F9.diameter / 2) ** 2;
const rho = h => h > 150e3 ? 0 : 1.225 * Math.exp(-h / 8500);
const pRatio = h => Math.exp(-h / 7000);
export const RESERVE = { asds: 0.08, rtls: 0.16, expend: 0 };

// thrust & mass flow of n Merlin 1D at altitude h, throttle k
function merlin(n, h, k = 1) {
  const fVac = F9.s1.fSL * F9.s1.ispVac / F9.s1.ispSL; // ~932 kN per engine in vacuum
  const f = fVac - (fVac - F9.s1.fSL) * pRatio(h);
  return { F: n * f * k, mdot: n * k * fVac / (F9.s1.ispVac * G0) };
}
// state in a local 2-D frame: x = downrange angle on sphere via (r, theta)
function gravAcc(px, py) { const r = Math.hypot(px, py), a = -MU / (r * r * r); return [a * px, a * py]; }
const alt = s => Math.hypot(s.x, s.y) - RE;
function local(s) { // radial (up) and horizontal unit vectors
  const r = Math.hypot(s.x, s.y), up = [s.x / r, s.y / r], hz = [up[1], -up[0]];
  const vU = s.vx * up[0] + s.vy * up[1], vH = s.vx * hz[0] + s.vy * hz[1];
  return { r, up, hz, vU, vH };
}
function step(s, dt, F, dir, mdot, cdA) {
  // drag on air-relative velocity (atmosphere co-rotates with Earth)
  const rx = s.vx - W * s.y, ry = s.vy + W * s.x;
  const v = Math.hypot(rx, ry), h = alt(s), q = 0.5 * rho(h) * v * v;
  const [gx, gy] = gravAcc(s.x, s.y);
  const dax = v > 0 ? -q * cdA * rx / v / s.m : 0, day = v > 0 ? -q * cdA * ry / v / s.m : 0;
  const ax = gx + dax + F * dir[0] / s.m, ay = gy + day + F * dir[1] / s.m;
  s.vx += ax * dt; s.vy += ay * dt; s.x += s.vx * dt; s.y += s.vy * dt;
  s.m -= mdot * dt; s.t += dt;
  return { q, acc: Math.hypot(ax - gx, ay - gy) };
}
// ground-relative downrange distance (pad rotates with Earth)
const downrange = s => Math.atan2(s.x, s.y) * RE - W * RE * s.t;
// sample: time, altitude (m), inertial speed (m/s), ground downrange (m), flight-path angle vs local horizon (rad, air-relative)
function sample(s) {
  const L = local(s), rx = s.vx - W * s.y, ry = s.vy + W * s.x;
  const vU = rx * L.up[0] + ry * L.up[1], vH = rx * L.hz[0] + ry * L.hz[1];
  return { t: s.t, h: alt(s), v: Math.hypot(s.vx, s.vy), va: Math.hypot(vU, vH), x: downrange(s), g: Math.atan2(vU, vH) };
}

export function simulate(opts = {}) {
  const { payload = 15000, mode = "asds", cd = 0.3 } = opts;
  const dt = 0.1, reserve = F9.s1.prop * (RESERVE[mode] ?? 0);
  const s = { x: 0, y: RE, vx: W * RE, vy: 0, t: 0, m: F9.s1.dry + F9.s1.prop + F9.s2.dry + F9.s2.prop + F9.fairing + payload };
  const ev = {}, s2pts = [], bpts = [];
  let s1prop = F9.s1.prop, maxQ = { q: 0, t: 0, h: 0 }, maxG = 0, kicked = false;
  const kick = opts.kick ?? ({ asds: 0.078, rtls: 0.066, expend: 0.08 }[mode] - payload / 22800 * 0.004);
  // ---- stage 1 ascent (vertical, pitch kick, gravity turn; throttle bucket around max-Q) ----
  while (s1prop > reserve) {
    const L = local(s), h = alt(s);
    const rx = s.vx - W * s.y, ry = s.vy + W * s.x, v = Math.hypot(rx, ry);
    let dir = L.up;
    if (v > KICK_V && !kicked) { kicked = true; const a = kick; s.vx = W * s.y + (L.up[0] * Math.cos(a) + L.hz[0] * Math.sin(a)) * v; s.vy = -W * s.x + (L.up[1] * Math.cos(a) + L.hz[1] * Math.sin(a)) * v; }
    if (kicked) { const rx2 = s.vx - W * s.y, ry2 = s.vy + W * s.x, v2 = Math.hypot(rx2, ry2); dir = [rx2 / v2, ry2 / v2]; }
    const k = (s.t > 55 && s.t < 80) ? 0.78 : 1;
    const e = merlin(9, h, k);
    const r = step(s, dt, e.F, dir, e.mdot, cd * A_REF); s1prop -= e.mdot * dt;
    if (r.q > maxQ.q) maxQ = { q: r.q, t: s.t, h: alt(s) };
    maxG = Math.max(maxG, r.acc / G0);
    if (Math.round(s.t * 10) % 10 === 0) s2pts.push(sample(s));
  }
  ev.meco = { t: s.t, h: alt(s), v: Math.hypot(s.vx, s.vy) };
  // split vehicles
  const b = { ...s, m: F9.s1.dry + s1prop };
  const u = { ...s, m: s.m - b.m };
  // ---- stage 2: coast 8 s, MVac burn with altitude-hold guidance, fairing sep > 110 km ----
  const target = 200e3, fair = { done: false };
  let s2prop = F9.s2.prop, orbit = false;
  const mdot2 = F9.s2.fVac / (F9.s2.isp * G0);
  ev.sep = { t: u.t + 3, h: 0 };
  while (u.t < ev.meco.t + 8) { const L = local(u); step(u, dt, 0, L.up, 0, cd * A_REF); }
  ev.sep.h = alt(u); ev.ses = { t: u.t, h: alt(u) };
  while (s2prop > 0) {
    const L = local(u), h = alt(u);
    if (!fair.done && h > 110e3) { fair.done = true; u.m -= F9.fairing; ev.fairing = { t: u.t, h }; }
    const aT = F9.s2.fVac / u.m, gEff = MU / (L.r * L.r) - L.vH * L.vH / L.r;
    const vUdes = Math.max(-150, Math.min(400, (target - h) / (opts.g1 ?? 80)));
    const aU = (vUdes - L.vU) / (opts.g2 ?? 50) + gEff;
    const sinP = Math.max(-0.4, Math.min(0.95, aU / aT)), cosP = Math.sqrt(1 - sinP * sinP);
    const dir = [L.up[0] * sinP + L.hz[0] * cosP, L.up[1] * sinP + L.hz[1] * cosP];
    const r = step(u, dt, F9.s2.fVac, dir, mdot2, cd * A_REF); s2prop -= mdot2 * dt;
    maxG = Math.max(maxG, r.acc / G0);
    if (Math.round(u.t * 10) % 10 === 0) s2pts.push(sample(u));
    const L2 = local(u);
    if (L2.vH >= Math.sqrt(MU / L2.r) * 0.998 && Math.abs(alt(u) - target) < 40e3) { orbit = true; break; }
  }
  ev.seco = { t: u.t, h: alt(u), v: Math.hypot(u.vx, u.vy) };
  s2pts.push(sample(u));
  // orbital elements of S2 at SECO
  const rr = Math.hypot(u.x, u.y), vv = Math.hypot(u.vx, u.vy), en = vv * vv / 2 - MU / rr;
  const hmom = u.x * u.vy - u.y * u.vx, sma = -MU / (2 * en), ecc = Math.sqrt(Math.max(0, 1 + 2 * en * hmom * hmom / (MU * MU)));
  const perigee = sma * (1 - ecc) - RE, apogee = sma * (1 + ecc) - RE;
  orbit = perigee > 140e3;
  // ---- booster return ----
  const ret = mode === 'expend' ? null : booster(b, mode, s1prop, cd, ev, bpts);
  return {
    payload, mode, ev, maxQ, maxG, s2pts, bpts, ret, orbit,
    perigee: perigee / 1e3, apogee: apogee / 1e3, s2left: s2prop, s1reserve: reserve,
    tEnd: Math.max(ev.seco.t, ret ? ret.tLand : 0)
  };
}

function booster(b, mode, prop, cd, ev, pts) {
  const dt = 0.1;
  const cdA_body = 1.4 * A_REF; // flying engines-first + grid fins
  let phase = 'coast', burnEnd = 0;
  const tSep = b.t + 3;
  const log = () => { if (Math.round(b.t * 10) % 5 === 0) pts.push(sample(b)); };
  // flip, then boostback (RTLS) using 3 engines until return velocity reached
  while (b.t < tSep + 10) { step(b, dt, 0, [0, 1], 0, cd * A_REF); log(); }
  if (mode === 'rtls') {
    ev.boostback = { t: b.t, h: alt(b) };
    for (let i = 0; i < 1200 && prop > F9.s1.prop * 0.07; i++) {
      const L = local(b), h = alt(b), g = MU / (L.r * L.r);
      const tg = (L.vU + Math.sqrt(L.vU * L.vU + 2 * g * h)) / g * 0.9;
      const need = W * L.r - downrange(b) / tg * 1.1; // horizontal speed that brings the booster back over the (moving) pad
      if (L.vH <= need) break;
      const e = merlin(3, h); step(b, dt, e.F, [-L.hz[0], -L.hz[1]], e.mdot, cd * A_REF); prop -= e.mdot * dt; log();
    }
    ev.boostbackEnd = { t: b.t, h: alt(b) };
  }
  ev.gridfins = { t: b.t + 6, h: alt(b) };
  let apo = 0;
  // coast to entry interface
  for (let i = 0; i < 20000; i++) {
    const L = local(b); apo = Math.max(apo, alt(b));
    if (L.vU < 0 && alt(b) < (mode === 'rtls' ? 48e3 : 58e3)) break;
    step(b, dt, 0, [0, 1], 0, cdA_body); log();
  }
  ev.boosterApogee = apo;
  // entry burn: 3 engines retrograde until |v| below target or prop margin
  ev.entry = { t: b.t, h: alt(b), v: Math.hypot(b.vx, b.vy) };
  const vTarget = mode === 'rtls' ? 650 : 1000;
  while (Math.hypot(b.vx, b.vy) > vTarget && prop > F9.s1.prop * 0.012) {
    const v = Math.hypot(b.vx, b.vy), e = merlin(3, alt(b));
    step(b, dt, e.F, [-b.vx / v, -b.vy / v], e.mdot, cdA_body); prop -= e.mdot * dt; log();
  }
  ev.entryEnd = { t: b.t, h: alt(b), v: Math.hypot(b.vx, b.vy) };
  // aerodynamic descent, then single-engine landing ("hoverslam") burn
  // ignition when a full-thrust 1-D prediction (with drag) stops the booster ~40 m above the deck
  const stopAlt = (h, v, m) => {
    for (let i = 0; i < 4000; i++) {
      const e = merlin(1, h), d = 0.5 * rho(h) * v * v * cdA_body;
      v -= ((e.F + d) / m - G0) * 0.05; h -= v * 0.05; m -= e.mdot * 0.05;
      if (v <= 0) return h;
    }
    return -1;
  };
  let legs = false;
  for (let i = 0; i < 40000; i++) {
    const v = Math.hypot(b.vx - W * b.y, b.vy + W * b.x), h = alt(b), e = merlin(1, h);
    if (phase !== 'land' && h < 9000 && i % 2 === 0 && stopAlt(h, v, b.m) < 120) { phase = 'land'; ev.landing = { t: b.t, h, v }; }
    if (!legs && h < 900) { legs = true; ev.legs = { t: b.t, h }; }
    if (phase === 'land') {
      const need = (v * v) / (2 * Math.max(h - 2, 1)) + G0, k = Math.max(0.4, Math.min(1, need * b.m / e.F));
      const rx = b.vx - W * b.y, ry = b.vy + W * b.x;
      step(b, dt, e.F * k, [-rx / v, -ry / v], e.mdot * k, cdA_body); prop -= e.mdot * k * dt;
    } else step(b, dt, 0, [0, 1], 0, cdA_body);
    log();
    const L = local(b);
    if (h <= 0 || (phase === 'land' && L.vU > -2 && h < 30)) break;
  }
  const L = local(b);
  return { tLand: b.t, vTouch: Math.abs(Math.min(0, L.vU)), propLeft: Math.max(0, prop), downrange: Math.abs(downrange(b)) / 1e3, apogee: apo / 1e3 };
}

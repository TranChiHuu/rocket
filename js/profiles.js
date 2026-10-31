// Mission profiles -> time-sampled tracks used by the flight animation + HUD.
// Track sample: { t (s), h (m), v (m/s), x (m downrange), th (rad, attitude from local vertical, + toward downrange) }
import { simulate } from './sim.js';

const D = Math.PI / 180;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const smooth = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

// ---------- interpolation ----------
function monotone(ts, ys) { // Fritsch–Carlson tangents
  const n = ts.length, d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (ts[i + 1] - ts[i] || 1));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]; }
  }
  return m;
}
export function makeTrack(samples) {
  const T = samples.map(s => s.t), H = samples.map(s => s.h), X = samples.map(s => s.x);
  const mh = monotone(T, H), mx = monotone(T, X);
  const herm = (i, u, y, m, dt) => { const u2 = u * u, u3 = u2 * u; return (2 * u3 - 3 * u2 + 1) * y[i] + (u3 - 2 * u2 + u) * dt * m[i] + (-2 * u3 + 3 * u2) * y[i + 1] + (u3 - u2) * dt * m[i + 1]; };
  return {
    samples, t0: T[0], t1: T[T.length - 1],
    at(t, out = {}) {
      if (t <= T[0]) { Object.assign(out, samples[0]); out.t = t; return out; }
      if (t >= T[T.length - 1]) { Object.assign(out, samples[samples.length - 1]); out.t = t; return out; }
      let lo = 0, hi = T.length - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (T[mid] <= t) lo = mid; else hi = mid; }
      const dt = T[hi] - T[lo], u = (t - T[lo]) / dt, a = samples[lo], b = samples[hi];
      out.t = t; out.h = herm(lo, u, H, mh, dt); out.x = herm(lo, u, X, mx, dt);
      out.v = a.v + (b.v - a.v) * u; out.th = a.th + (b.th - a.th) * (a.ease ? smooth(u) : u);
      return out;
    }
  };
}
// keyframes: [t, h km, v km/h, x km, th deg]
const KF = rows => rows.map(([t, h, v, x, th]) => ({ t, h: h * 1e3, v: v / 3.6, x: x * 1e3, th: th * D, ease: true }));

// ---------- attitude smoothing for sim tracks ----------
function lowpassAngles(samples, tau) {
  let prev = samples[0].th;
  for (let i = 1; i < samples.length; i++) {
    let a = samples[i].th; while (a - prev > Math.PI) a -= 2 * Math.PI; while (a - prev < -Math.PI) a += 2 * Math.PI;
    const k = 1 - Math.exp(-(samples[i].t - samples[i - 1].t) / tau);
    prev = prev + (a - prev) * k; samples[i].th = prev;
  }
  return samples;
}

// =====================================================================
// FALCON 9: scenario 'full' (follow 2nd stage to orbit) | 'booster' (follow booster: asds | rtls)
// =====================================================================
export function f9Profile(scn = 'booster', land = 'asds', payload = 15000) {
  const mode = scn === 'full' ? 'asds' : land;
  const r = simulate({ payload: mode === 'rtls' ? Math.min(payload, 5000) : payload, mode });
  const ev = r.ev;
  const pro = s => ({ t: s.t, h: s.h, v: s.va ?? s.v, x: s.x, th: Math.PI / 2 - s.g });
  const upper = r.s2pts.map(pro);
  // extend upper into orbit coast after SECO
  const last = upper[upper.length - 1];
  const tEndU = ev.seco.t + 120;
  for (let t = Math.ceil(last.t) + 5; t <= Math.max(tEndU, r.ret ? r.ret.tLand + 10 : 0); t += 5) upper.push({ t, h: last.h + (t - last.t) * 2, v: last.v, x: last.x + (t - last.t) * (last.v - 408), th: Math.PI / 2 });
  // booster: stack until MECO then booster sim
  const booster = r.s2pts.filter(s => s.t <= ev.meco.t).map(pro);
  const bb = ev.boostback, bbe = ev.boostbackEnd;
  for (const s of r.bpts) {
    if (s.t <= ev.meco.t) continue;
    const vU = Math.sin(s.g), vH = Math.cos(s.g);
    let th = Math.atan2(-vH, -vU); // retrograde (engines first), wrapped to (-pi, pi]
    if (s.t < ev.sep.t + 2) th = Math.PI / 2 - s.g;
    if (bb && s.t >= bb.t - 4 && s.t <= bbe.t) th = -Math.PI / 2 + 0.25; // thrust back toward launch site
    if (s.h < 3000) th *= smooth(s.h / 3000);
    booster.push({ t: s.t, h: Math.max(0, s.h), v: s.va ?? s.v, x: s.x, th });
  }
  lowpassAngles(booster, 3.5);
  const tLand = r.ret ? r.ret.tLand : ev.seco.t;
  const k0 = Math.round(booster[booster.length - 1].th / (2 * Math.PI)) * 2 * Math.PI;
  booster.push({ t: tLand + 0.1, h: 0, v: 0, x: booster[booster.length - 1].x, th: k0 }, { t: tLand + 60, h: 0, v: 0, x: booster[booster.length - 1].x, th: k0 });

  const E = (k, o) => o ? { k, t: o.t } : null;
  const evs = [E('liftoff', { t: 0 }), { k: 'maxq', t: r.maxQ.t }, E('meco', ev.meco), E('sep', ev.sep), E('ses', ev.ses), E('fairing', ev.fairing), E('seco', ev.seco),
    E('boostback', ev.boostback), E('gridfins', ev.gridfins), E('entry', ev.entry), E('landing', ev.landing), E('legs', ev.legs), r.ret ? { k: mode === 'rtls' ? 'touchdownLZ' : 'touchdownASDS', t: tLand } : null].filter(Boolean);
  const follow = scn === 'full' ? 'upper' : 'booster';
  const phases = scn === 'full' ? ['liftoff', 'maxq', 'meco', 'sep', 'ses', 'fairing', 'seco'] :
    ['liftoff', 'maxq', 'meco', 'sep', ...(mode === 'rtls' ? ['boostback'] : []), 'gridfins', 'entry', 'landing', mode === 'rtls' ? 'touchdownLZ' : 'touchdownASDS'];
  const at = k => evs.find(e => e.k === k)?.t ?? 0;
  const tEnd = scn === 'full' ? ev.seco.t + 40 : tLand + 6;
  // time compression: [missionTime, realSecondsUntilNext]
  const seg = scn === 'full'
    ? [[0, 8], [22, 10], [at('meco') - 6, 10], [at('ses') + 8, 6], [at('fairing') + 10, 10], [ev.seco.t - 10, 7], [tEnd, 0]]
    : [[0, 8], [22, 9], [at('meco') - 6, 10], [at('sep') + 16, mode === 'rtls' ? 9 : 6], [at('gridfins'), 6], [at('entry') - 4, 8], [ev.entryEnd.t + 4, 6], [at('landing') - 6, 12], [tEnd, 0]];
  // engines
  const engines = t => {
    const b = t < ev.meco.t ? 'all' : (bb && t >= bb.t && t < bbe.t) ? 3 : (ev.entry && t >= ev.entry.t && t < ev.entryEnd.t) ? 3 : (ev.landing && t >= ev.landing.t && t < tLand) ? 1 : 0;
    const u = (t >= ev.ses.t && t < ev.seco.t) ? 1 : 0;
    return { b, u };
  };
  return { kind: 'f9', scn, land: mode, sim: r, tracks: { booster: makeTrack(booster), upper: makeTrack(upper) }, tSep: ev.sep.t, tMeco: ev.meco.t,
    evs, phases, seg: seg.filter(s => isFinite(s[0])).sort((a, b) => a[0] - b[0]).filter((s, i, a) => i === 0 || s[0] > a[i - 1][0] + 0.5), tEnd, follow, engines,
    gridfinsAt: ev.gridfins?.t ?? 1e9, legsAt: ev.legs?.t ?? 1e9, fairingAt: ev.fairing?.t ?? 1e9, tLand, landX: booster[booster.length - 1].x,
    plasma: t => (ev.entry && t > ev.entry.t - 5 && t < ev.entryEnd.t + 8) ? 0.35 : 0 };
}

// =====================================================================
// STARSHIP — Flight 11 profile (13/10/2025 23:23 UTC = 14/10/2025 06:23 UTC+7), keyframed from public timeline.
// scn: 'ship' (follow Ship to Indian Ocean splashdown) | 'booster' (follow Super Heavy). opt: 'gulf' | 'catch'
// =====================================================================
const SS_STACK = [[0, 0, 0, 0, 0], [8, .12, 60, 0, 0], [20, .9, 260, .02, 1], [40, 4.8, 750, .5, 8], [62, 11.5, 1550, 2.2, 18], [90, 24, 2650, 8, 32], [120, 42, 3950, 22, 45], [157, 66, 5600, 55, 58], [160, 69, 5650, 60, 60]];
const SS_SHIP = [[180, 82, 6100, 80, 66], [240, 112, 7900, 160, 72], [300, 138, 10100, 270, 76], [360, 158, 12900, 420, 80], [420, 172, 16100, 620, 84], [480, 182, 20600, 900, 87], [538, 188, 26400, 1230, 90],
  [900, 190.5, 26550, 3500, 92], [1600, 192, 26500, 7900, 95], [2269, 172, 26600, 11600, 98], [2650, 130, 26700, 13900, 60], [2863, 100, 26750, 15000, 40],
  [2980, 81, 26700, 15800, 37], [3100, 71, 25600, 16600, 35], [3300, 62, 20600, 17700, 35], [3660, 39, 9500, 18700, 38], [3810, 19, 1250, 18900, 45], [3832, 16.5, 1000, 18905, 72],
  [3900, 7, 420, 18910, 90], [3958, .6, 300, 18912, 90], [3961, .42, 240, 18912, 40], [3966, .2, 120, 18912, 2], [3969, .1, 60, 18912, 0], [3985, -.004, 4, 18912, 0], [4040, -.004, 0, 18912, 0]];
const SS_BOOSTER = [[163, 70.6, 5550, 63, 40], [169, 74, 5300, 69, -80], [190, 84, 3000, 81, -92], [218, 92, 900, 86, -95], [240, 95, 600, 85, -40], [280, 88, 1700, 76, 8], [330, 45, 3600, 56, 6],
  [360, 15, 2000, 41, 4], [380, 1.6, 1100, 33, 2], [392, .12, 60, 31, 0], [396, 0, 3, 31, 0], [460, 0, 0, 31, 0]];

export function ssProfile(scn = 'ship', opt = 'gulf') {
  const catchMode = opt === 'catch';
  const stack = KF(SS_STACK);
  const ship = makeTrack([...stack, ...KF(SS_SHIP)]);
  let bk = KF(SS_BOOSTER);
  if (catchMode) bk = bk.map(s => ({ ...s, x: s.t <= 169 ? s.x : s.x - 31e3 * smooth((s.t - 169) / (392 - 169)), h: s.t >= 392 ? (s.t >= 396 ? 30.6 : 36) : s.h }));
  const booster = makeTrack([...stack, ...bk]);
  const evs = [
    ['liftoff', 0], ['maxq', 62], ['meco', 157], ['hotstaging', 159], ['boostback', 169], ['boostbackEnd', 218], ['ringJettison', 220],
    ['bLanding', 380], [catchMode ? 'catch' : 'bSplash', 396], ['seco', 538], ['payload', 1113], ['relight', 2269], ['entry', 2863], ['peakHeat', 3100],
    ['transonic', 3810], ['subsonic', 3832], ['sLanding', 3958], ['flip', 3960], ['splash', 3985]].map(([k, t]) => ({ k, t }));
  const follow = scn === 'ship' ? 'upper' : 'booster';
  const phases = scn === 'ship' ? ['liftoff', 'maxq', 'hotstaging', 'seco', 'payload', 'relight', 'entry', 'flip', 'splash'] :
    ['liftoff', 'maxq', 'meco', 'hotstaging', 'boostback', 'ringJettison', 'bLanding', catchMode ? 'catch' : 'bSplash'];
  const tEnd = scn === 'ship' ? 3995 : 404;
  const seg = scn === 'ship'
    ? [[0, 8], [22, 9], [150, 10], [178, 10], [540, 5], [1100, 3], [2250, 4], [2600, 9], [3300, 6], [3800, 5], [3940, 11], [tEnd, 0]]
    : [[0, 8], [22, 9], [150, 11], [180, 8], [225, 9], [370, 12], [tEnd, 0]];
  const engines = t => {
    let b = 0, u = 0;
    if (t < 157) b = 'all'; else if (t < 163) b = 'inner3'; else if (t >= 169 && t < 218) b = 'boost12'; else if (t >= 380 && t < 389) b = 13; else if (t >= 389 && t < 396) b = 5;
    if (t >= 159 && t < 538) u = 6; else if (t >= 2269 && t < 2275) u = 1; else if (t >= 3958 && t < 3969) u = 3; else if (t >= 3969 && t < 3985) u = 2;
    return { b, u };
  };
  return { kind: 'ss', scn, opt, tracks: { booster, upper: ship }, tSep: 160, tMeco: 157, evs, phases, seg, tEnd, follow, engines,
    ringJettisonAt: 220, tLand: 396, catchMode, landX: catchMode ? 0 : 31e3, shipSplashX: 18912e3, shipSplashT: 3985,
    plasma: t => t < 2840 ? 0 : t < 2980 ? smooth((t - 2840) / 140) : t < 3300 ? 1 : t < 3700 ? 1 - smooth((t - 3300) / 400) * .85 : t < 3810 ? .15 * (1 - (t - 3700) / 110) : 0,
    flaps: t => { // [fwd, aft] radians
      if (t < 2600) return [0.15, 0.15];
      if (t < 3940) { const w = Math.sin(t * 0.7) * 0.05; return [0.5 + w, 0.25 - w]; }
      if (t < 3962) return [0.8, 0.1]; return [1.2, 1.2];
    } };
}

// mission time <-> real time mapping
export function timeMap(seg) {
  const acc = [0]; for (let i = 0; i < seg.length - 1; i++) acc.push(acc[i] + seg[i][1]);
  const total = acc[acc.length - 1];
  return {
    total,
    toMission(r) { for (let i = 0; i < seg.length - 1; i++) if (r <= acc[i + 1] || i === seg.length - 2) { const u = clamp((r - acc[i]) / (seg[i][1] || 1), 0, 1); return seg[i][0] + (seg[i + 1][0] - seg[i][0]) * u; } return seg[seg.length - 1][0]; },
    toReal(t) { for (let i = 0; i < seg.length - 1; i++) if (t <= seg[i + 1][0] || i === seg.length - 2) { const u = clamp((t - seg[i][0]) / (seg[i + 1][0] - seg[i][0] || 1), 0, 1); return acc[i] + seg[i][1] * u; } return total; }
  };
}

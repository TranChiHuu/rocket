// Educational sections below the HUD: specs + scale comparison, phases, simulation charts, Starship profile, news.
import { t, fmt, onLang } from './i18n.js';
import { simulate, F9 } from './sim.js';
import { ssProfile } from './profiles.js';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const NS = 'http://www.w3.org/2000/svg';
const el = (n, a = {}, txt) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); if (txt != null) e.textContent = txt; return e; };

const UI = { ph: 'f9', pay: 15000, mode: 'asds' };

function specs() {
  const rows = {
    f9: [['height', `${fmt(70)} M`], ['diam', `${fmt(3.7, 1)} M`], ['mass', `${fmt(549)} T`], ['stages', '2'], ['engines', t('spec.v.f9eng')], ['thrust', `${fmt(7.6, 1)} MN`],
      ['leoExp', `${fmt(22.8, 1)} T`], ['leoReuse', `${fmt(17.5, 1)} T`], ['gto', `${fmt(8.3, 1)} T`], ['prop', 'LOX / RP-1'], ['recovery', t('spec.v.f9rec')]],
    ss: [['height', `~${fmt(123)} M`], ['diam', `${fmt(9)} M`], ['mass', `~${fmt(5000)} T`], ['stages', '2'], ['engines', t('spec.v.sseng')], ['thrust', `~${fmt(74)} MN`],
      ['leo', t('spec.v.ssleo')], ['prop', 'LOX / CH₄'], ['recovery', t('spec.v.ssrec')], ['f11', t('spec.v.f11')]]
  };
  for (const k of ['f9', 'ss']) {
    const dl = $(`#spec-${k} dl`); dl.textContent = '';
    rows[k].forEach(([a, b]) => { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = t('spec.k.' + a); dd.textContent = b; dl.append(dt, dd); });
  }
  // scale comparison
  const box = $('#cmp'); box.textContent = '';
  const H = 260, top = 20, base = 236, k = (base - top) / 130, svg = el('svg', { viewBox: `0 0 1000 ${H}`, preserveAspectRatio: 'xMidYMid meet', role: 'img', 'aria-label': t('specs.cmpAria') });
  for (let m = 0; m <= 120; m += 20) { const y = base - m * k; svg.append(el('line', { x1: 60, x2: 980, y1: y, y2: y, stroke: m ? '#161616' : '#333' }), el('text', { x: 20, y: y + 3, fill: '#666', 'font-size': 10 }, `${m} M`)); }
  const rocket = (x, w, h, color, label, sub, stages) => {
    const g = el('g'); const y0 = base - h * k, wpx = w * k;
    g.append(el('path', { d: `M${x - wpx / 2},${base} V${y0 + wpx * 1.2} Q${x - wpx / 2},${y0} ${x},${y0 - 2} Q${x + wpx / 2},${y0} ${x + wpx / 2},${y0 + wpx * 1.2} V${base} Z`, fill: 'none', stroke: color, 'stroke-width': 1.2 }));
    stages.forEach(s => { const y = base - s * k; g.append(el('line', { x1: x - wpx / 2, x2: x + wpx / 2, y1: y, y2: y, stroke: '#555', 'stroke-dasharray': '3 2' })); });
    g.append(el('line', { x1: x + wpx / 2 + 8, x2: x + wpx / 2 + 40, y1: y0, y2: y0, stroke: color }), el('text', { x: x + wpx / 2 + 44, y: y0 + 4, fill: '#ddd', 'font-size': 11 }, label), el('text', { x: x + wpx / 2 + 44, y: y0 + 18, fill: '#777', 'font-size': 10 }, sub));
    svg.append(g);
  };
  rocket(260, 3.7, 70, '#ddd', 'FALCON 9', `${fmt(70)} M · ${fmt(549)} T`, [42.6]);
  rocket(560, 9, 123, '#ff3b2f', 'STARSHIP', `~${fmt(123)} M · ~${fmt(5000)} T`, [71]);
  // reference: 1.75 m person (dot) & 30 m ten-storey building
  const bx = 820, bh = 30 * k; svg.append(el('rect', { x: bx, y: base - bh, width: 30, height: bh, fill: 'none', stroke: '#555' }), el('text', { x: bx + 40, y: base - bh + 4, fill: '#777', 'font-size': 10 }, t('specs.building')));
  box.append(svg);
}

function phases() {
  $$('#phases [role=tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.ph === UI.ph));
  const ol = $('#phase-list'); ol.textContent = '';
  (t('phases.' + UI.ph) || []).forEach?.(p => { const li = document.createElement('li'); li.innerHTML = '<span class="t"></span><h4></h4><p></p>'; li.querySelector('.t').textContent = p.t; li.querySelector('h4').textContent = p.h; li.querySelector('p').textContent = p.p; ol.appendChild(li); });
  if (!RM && window.gsap) gsap.from('#phase-list li', { opacity: 0, y: 12, stagger: .04, duration: .4, ease: 'power2.out' });
}

function chart(svg, series, { xMax, yMax, xLab, yLab, evs = [], xTicks = 6, yTicks = 5, xFmt = v => fmt(v) }) {
  svg.textContent = '';
  const vb = svg.viewBox.baseVal, Wd = vb.width, Hd = vb.height, L = 46, R = 12, T = 12, B = 28;
  const X = v => L + v / xMax * (Wd - L - R), Y = v => Hd - B - v / yMax * (Hd - T - B);
  for (let i = 0; i <= yTicks; i++) { const v = yMax * i / yTicks; svg.append(el('line', { class: i ? 'gr' : 'ax', x1: L, x2: Wd - R, y1: Y(v), y2: Y(v) }), el('text', { x: L - 6, y: Y(v) + 3, 'text-anchor': 'end' }, fmt(v))); }
  for (let i = 0; i <= xTicks; i++) { const v = xMax * i / xTicks; svg.append(el('line', { class: i ? 'gr' : 'ax', x1: X(v), x2: X(v), y1: T, y2: Hd - B }), el('text', { x: X(v), y: Hd - B + 14, 'text-anchor': 'middle' }, xFmt(v))); }
  evs.forEach(([x, lab], i) => { if (x > xMax) return; svg.append(el('line', { class: 'ev', x1: X(x), x2: X(x), y1: T, y2: Hd - B }), el('text', { class: 'evt', x: X(x) + 3, y: T + 10 + (i % 3) * 11 }, lab)); });
  series.forEach(([pts, cls]) => { const pl = el('polyline', { class: cls, points: pts.map(p => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' ') }); svg.append(pl);
    if (!RM && window.gsap) { const len = pl.getTotalLength?.() || 0; if (len) { pl.style.strokeDasharray = cls === 'l2' ? '' : len; if (cls !== 'l2') gsap.fromTo(pl, { strokeDashoffset: len }, { strokeDashoffset: 0, duration: 1.1, ease: 'power2.out' }); } } });
  svg.setAttribute('aria-label', `${yLab} / ${xLab}`);
}
function sim() {
  const r = simulate({ payload: UI.pay, mode: UI.mode });
  const up = r.s2pts.filter((_, i) => i % 5 === 0), bp = r.bpts.filter((_, i) => i % 5 === 0);
  const tMax = Math.max(r.ev.seco?.t || 0, r.ret?.tLand || 0) + 20;
  const evs = [['meco', r.ev.meco], ['sep', r.ev.sep], ['boostback', r.ev.boostback], ['entry', r.ev.entry], ['landing', r.ev.landing], ['seco', r.ev.seco]].filter(e => e[1]).map(([k, e]) => [e.t, t('ev.' + k)]);
  const hMax = Math.ceil(Math.max(...up.map(p => p.h), ...bp.map(p => p.h)) / 1e3 / 50) * 50;
  chart($('#c-alt'), [[up.map(p => [p.t, p.h / 1e3]), 'l1'], [bp.map(p => [p.t, Math.max(0, p.h) / 1e3]), 'l2']], { xMax: tMax, yMax: hMax, xLab: 'S', yLab: 'KM', evs });
  const vMax = Math.ceil(Math.max(...up.map(p => p.va ?? p.v)) * 3.6 / 5000) * 5000;
  chart($('#c-vel'), [[up.map(p => [p.t, (p.va ?? p.v) * 3.6]), 'l1'], [bp.map(p => [p.t, (p.va ?? p.v) * 3.6]), 'l2']], { xMax: tMax, yMax: vMax, xLab: 'S', yLab: 'KM/H', evs });
  const o = [
    ['orbit', r.orbit ? `${fmt(r.perigee)} × ${fmt(r.apogee)} KM` : t('sim.o.noOrbit')],
    ['maxq', `${fmt(r.maxQ.q / 1e3, 1)} KPA · T+${fmt(r.maxQ.t)} S`],
    ['maxg', `${fmt(r.maxG, 1)} G`],
    ['meco', `T+${fmt(r.ev.meco.t)} S`], ['seco', r.ev.seco ? `T+${fmt(r.ev.seco.t)} S` : '—'],
    ['s2left', `${fmt(r.s2left / 1e3, 1)} T`]
  ];
  if (r.ret) o.push(['land', `T+${fmt(r.ret.tLand)} S · ${fmt(r.ret.downrange, 1)} KM`], ['vtouch', `${fmt(r.ret.vTouch, 1)} M/S`], ['propLeft', `${fmt(r.ret.propLeft / 1e3, 1)} T`], ['apogeeB', `${fmt(r.ret.apogee)} KM`]);
  else o.push(['land', t('sim.o.expended')]);
  const dl = $('#sim-out'); dl.textContent = '';
  o.forEach(([k, v]) => { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = t('sim.o.' + k); dd.textContent = v; dl.append(dt, dd); });
  $('#s-pay-v').textContent = `${fmt(UI.pay / 1e3, 1)} T`;
}
function ssChart() {
  const p = ssProfile('ship', 'gulf'), b = ssProfile('booster', 'gulf');
  const s = [], bs = []; for (let x = 0; x <= 3995; x += 10) s.push([x / 60, Math.max(0, p.tracks.upper.at(x).h / 1e3)]); for (let x = 0; x <= 400; x += 4) bs.push([x / 60, Math.max(0, b.tracks.booster.at(x).h / 1e3)]);
  const evs = ['hotstaging', 'seco', 'payload', 'relight', 'entry', 'splash'].map(k => [p.evs.find(e => e.k === k).t / 60, t('ev.' + k)]);
  chart($('#c-ss'), [[s, 'l1'], [bs, 'l2']], { xMax: 70, yMax: 200, xLab: 'MIN', yLab: 'KM', evs, xTicks: 14, yTicks: 4 });
}
function news() {
  const f = $('#news-facts'); f.textContent = '';
  (t('news.facts') || []).forEach?.(x => { const li = document.createElement('li'); li.textContent = x; f.appendChild(li); });
  const tl = $('#news-time'); tl.textContent = '';
  (t('news.timeline') || []).forEach?.(x => { const li = document.createElement('li'); li.innerHTML = '<time></time><p></p>'; li.querySelector('time').textContent = x.t; li.querySelector('p').textContent = x.p; tl.appendChild(li); });
}
function renderAll() { specs(); phases(); sim(); ssChart(); news(); }

export function initUI() {
  $$('#phases [role=tab]').forEach(b => b.onclick = () => { UI.ph = b.dataset.ph; phases(); });
  $$('#phases [role=tab]').forEach(b => b.onkeydown = e => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const o = $$('#phases [role=tab]').find(x => x !== b); o.focus(); o.click(); } });
  const pay = $('#s-pay'); let raf = 0; pay.oninput = () => { UI.pay = +pay.value; cancelAnimationFrame(raf); raf = requestAnimationFrame(sim); };
  $$('#s-mode button').forEach(b => b.onclick = () => { UI.mode = b.dataset.sm; $$('#s-mode button').forEach(x => x.setAttribute('aria-pressed', x === b)); if (UI.mode === 'rtls' && UI.pay > 9000) { UI.pay = 5000; pay.value = 5000; } sim(); });
  renderAll(); onLang(renderAll);
  if (!RM && window.gsap && window.ScrollTrigger) {
    gsap.registerPlugin(ScrollTrigger);
    $$('.sec').forEach(s => gsap.from(s.querySelectorAll('.sec-h > *, .kv, .note, .chart, .cmp, .news-main, .tabs'), { opacity: 0, y: 24, stagger: .06, duration: .7, ease: 'power3.out', scrollTrigger: { trigger: s, start: 'top 80%', once: true } }));
  }
}

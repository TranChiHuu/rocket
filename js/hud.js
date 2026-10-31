// HUD DOM helpers: engine dot maps, phase track, line graph, bracket tracking, scramble counters.
import { t, fmt } from './i18n.js';
const $ = s => document.querySelector(s);
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const NS = 'http://www.w3.org/2000/svg';
const el = (n, a = {}) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); return e; };

// ---------- scramble counters ----------
const scr = new WeakMap();
export function scramble(node, text, dur = 0.7) {
  if (!node) return;
  text = String(text);
  if (RM || !window.gsap) { node.textContent = text; return; }
  scr.get(node)?.kill();
  const o = { p: 0 };
  const tw = gsap.to(o, { p: 1, duration: dur, ease: 'none', onUpdate() {
    const n = Math.floor(o.p * text.length);
    node.textContent = text.slice(0, n) + text.slice(n).replace(/[0-9]/g, () => (Math.random() * 10) | 0);
  }, onComplete() { node.textContent = text; } });
  scr.set(node, tw);
}

// ---------- engine maps ----------
export function engineMap(svg, engines, radius) {
  svg.textContent = '';
  const k = 44 / (radius || 1);
  const rings = [...new Set(engines.map(e => Math.hypot(e.p.x, e.p.z).toFixed(1)))];
  rings.forEach(r => { if (+r > .1) svg.appendChild(el('circle', { class: 'ring', cx: 0, cy: 0, r: +r * k })); });
  const dots = engines.map(e => { const c = el('circle', { class: 'e', cx: (e.p.x * k).toFixed(2), cy: (e.p.z * k).toFixed(2), r: Math.max(2.4, e.r * k * .72).toFixed(2) }); svg.appendChild(c); return c; });
  return { dots, set(state) { dots.forEach((d, i) => { const s = state[i] || 0; d.classList.toggle('on', s === 1); d.classList.toggle('dim', s === 2); }); } };
}
// engine state arrays (1 on, 2 dim, 0 off) from profile engine codes
export function engState(kind, which, code, n) {
  const a = new Array(n).fill(0); if (!code) return a;
  if (code === 'all') return a.fill(1);
  if (kind === 'ss' && which === 'b') {
    if (code === 'inner3') { a[0] = a[1] = a[2] = 1; return a; }
    if (code === 'boost12') { for (let i = 0; i < 13; i++) a[i] = 1; a[7] = 2; return a; }
    if (code === 13) { for (let i = 0; i < 13; i++) a[i] = 1; return a; }
    if (code === 5) { a[0] = a[1] = a[2] = a[3] = a[8] = 1; return a; }
  }
  if (kind === 'ss' && which === 'u') { for (let i = 0; i < code; i++) a[i] = 1; return a; } // first 3 are sea-level engines
  if (kind === 'f9' && which === 'b') { const idx = code === 3 ? [0, 1, 5] : code === 1 ? [0] : []; idx.forEach(i => a[i] = 1); return a; }
  if (kind === 'f9' && which === 'u') { a[0] = code ? 1 : 0; return a; }
  return a;
}

// ---------- phase track ----------
export function phaseTrack(prof) {
  const box = $('#ptrack'); box.querySelectorAll('.pn-node,.pn-lab').forEach(n => n.remove());
  const ph = prof.phases.map(k => ({ k, t: prof.evs.find(e => e.k === k)?.t ?? 0 })).sort((a, b) => a.t - b.t);
  const n = ph.length, nodes = [], labs = [];
  ph.forEach((p, i) => {
    const x = (i / (n - 1) * 100).toFixed(2) + '%';
    const d = document.createElement('i'); d.className = 'pn-node'; d.style.left = x; d.dataset.t = p.t; d.title = t('ev.' + p.k); box.appendChild(d); nodes.push(d);
    const l = document.createElement('span'); l.className = 'pn-lab'; l.style.left = x; l.textContent = t('ev.' + p.k); box.appendChild(l); labs.push(l);
  });
  return {
    ph,
    relabel() { labs.forEach((l, i) => l.textContent = t('ev.' + ph[i].k)); },
    set(time) {
      let i = 0; while (i < n - 1 && time >= ph[i + 1].t) i++;
      const u = i >= n - 1 ? 0 : Math.max(0, Math.min(1, (time - ph[i].t) / (ph[i + 1].t - ph[i].t)));
      const f = time < ph[0].t ? 0 : (i + u) / (n - 1) * 100;
      $('#pt-fill').style.width = f + '%'; $('#pt-dot').style.left = f + '%';
      nodes.forEach((d, j) => d.classList.toggle('done', time >= ph[j].t));
      labs.forEach((l, j) => l.classList.toggle('cur', j === i));
      return ph[i];
    }
  };
}

// ---------- line graph (red line graph above panels) ----------
export function graph(series, tEnd, yMax) {
  const g = $('#g-grid'); g.textContent = '';
  for (let i = 1; i < 10; i++) g.appendChild(el('line', { x1: i * 100, x2: i * 100, y1: 0, y2: 80 }));
  for (let i = 1; i < 4; i++) g.appendChild(el('line', { x1: 0, x2: 1000, y1: i * 20, y2: i * 20 }));
  const pts = s => s.map(p => `${(p[0] / tEnd * 1000).toFixed(1)},${(78 - p[1] / yMax * 74).toFixed(1)}`).join(' ');
  $('#g-line').setAttribute('points', pts(series[0] || []));
  $('#g-line2').setAttribute('points', pts(series[1] || []));
  return { head(time) { const x = Math.max(0, Math.min(1000, time / tEnd * 1000)); const h = $('#g-head'); h.setAttribute('x1', x); h.setAttribute('x2', x); } };
}

// ---------- bracket + leader + card ----------
export function bracket(rect, card, visible) {
  const br = $('#br'), ld = $('#leader'), tc = $('#tcard');
  if (!visible || !rect) { br.setAttribute('d', ''); ld.setAttribute('points', ''); tc.classList.remove('on'); return; }
  const { x0, y0, x1, y1 } = rect, L = Math.max(8, Math.min(22, (x1 - x0) * .3, (y1 - y0) * .3));
  br.setAttribute('d', `M${x0},${y0 + L}V${y0}H${x0 + L}M${x1 - L},${y0}H${x1}V${y0 + L}M${x1},${y1 - L}V${y1}H${x1 - L}M${x0 + L},${y1}H${x0}V${y1 - L}`);
  const W = innerWidth, cw = tc.offsetWidth || 220, ch = tc.offsetHeight || 120;
  let side = (x1 + 60 + cw < W - 250) ? 1 : -1;
  let cx = side > 0 ? x1 + 60 : x0 - 60 - cw, cy = Math.max(110, Math.min(innerHeight - 330 - ch, y0 - 10));
  if (cx < 8) cx = 8;
  const ax = side > 0 ? x1 : x0, ay = (y0 + y1) / 2, kx = side > 0 ? cx - 20 : cx + cw + 20;
  ld.setAttribute('points', `${ax},${ay} ${kx},${cy + 14} ${side > 0 ? cx : cx + cw},${cy + 14}`);
  tc.style.transform = `translate(${cx}px,${cy}px)`; tc.classList.add('on');
}
export function card(k, h, rows, desc) {
  $('#tc-k').textContent = k; $('#tc-h').textContent = h;
  const dl = $('#tc-d'); dl.textContent = '';
  rows.forEach(([a, b]) => { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = a; dd.textContent = b; dl.append(dt, dd); });
  if (desc) { const p = document.createElement('p'); p.className = 'd'; p.textContent = desc; dl.appendChild(p); }
}

export const hms = s => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}`; };
export { fmt };

// i18n: en default (only ?lang= or a saved user choice overrides), vi/en complete, ja/ko fall back to en for any missing key.
export const LANGS = ['vi', 'en', 'ja', 'ko'];
const KEY = 'rocket.lang';
const cache = {};
let lang = 'en', dict = {}, fallback = {};
const subs = new Set();

async function load(l) {
  if (!cache[l]) cache[l] = fetch(`locales/${l}.json`).then(r => { if (!r.ok) throw new Error(l); return r.json(); });
  return cache[l];
}
function pick() {
  const q = new URLSearchParams(location.search).get('lang');
  if (q && LANGS.includes(q)) return q;
  try { const s = localStorage.getItem(KEY); if (LANGS.includes(s)) return s; } catch {}
  return 'en'; // never auto-switch from navigator.language
}
const get = (o, k) => k.split('.').reduce((a, p) => (a == null ? a : a[p]), o);

export function t(k, vars) {
  let v = get(dict, k);
  if (v == null) v = get(fallback, k);
  if (v == null) return k;
  if (vars && typeof v === 'string') v = v.replace(/\{(\w+)\}/g, (_, n) => vars[n] ?? '');
  return v;
}
export const getLang = () => lang;
export const onLang = fn => { subs.add(fn); return () => subs.delete(fn); };
export const locale = () => ({ vi: 'vi-VN', en: 'en-US', ja: 'ja-JP', ko: 'ko-KR' }[lang]);
export const fmt = (n, d = 0) => Number(n).toLocaleString(locale(), { minimumFractionDigits: d, maximumFractionDigits: d });

export function apply(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => {
    const v = t(el.dataset.i18n);
    if (typeof v === 'string' && v !== el.dataset.i18n) { if (/<[a-z]/i.test(v)) el.innerHTML = v; else el.textContent = v; }
  });
  root.querySelectorAll('[data-i18n-aria]').forEach(el => el.setAttribute('aria-label', t(el.dataset.i18nAria)));
  document.title = t('meta.title');
  const md = document.querySelector('meta[name=description]'); if (md) md.content = t('meta.desc');
}

export async function setLang(l, persist = true) {
  if (!LANGS.includes(l)) l = 'en';
  const [d, f] = await Promise.all([load(l), load('en')]);
  lang = l; dict = d; fallback = f;
  document.documentElement.lang = l;
  if (persist) try { localStorage.setItem(KEY, l); } catch {}
  const u = new URL(location.href);
  if (u.searchParams.has('lang')) { u.searchParams.set('lang', l); history.replaceState(null, '', u); }
  apply();
  subs.forEach(fn => fn(l));
}
export async function initI18n() { await setLang(pick(), false); return lang; }

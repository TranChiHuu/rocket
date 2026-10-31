/* Loader: real progress = bytes of critical assets (fetch streams) + scene build items reported by main.js
   via a THREE.LoadingManager. Reveal only after model built and first frame rendered. */
(function () {
  'use strict';
  var RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var pctEl = document.getElementById('ld-pct'), fill = document.getElementById('ld-fill'), log = document.getElementById('ld-log');
  var shown = 0, target = 0, netFrac = 0, sceneFrac = 0, finished = false;
  function lang() {
    try { var q = new URLSearchParams(location.search).get('lang'); if (q && ['vi','en','ja','ko'].indexOf(q) >= 0) return q; var s = localStorage.getItem('rocket.lang'); if (['vi','en','ja','ko'].indexOf(s) >= 0) return s; } catch (e) {}
    return 'en';
  }
  function line(txt) { var li = document.createElement('li'); li.className = 'ok'; li.textContent = txt; log.appendChild(li); while (log.children.length > 4) log.removeChild(log.firstChild); }
  function upd() { target = netFrac * 0.55 + sceneFrac * 0.45; }
  (function tick() {
    shown += (target - shown) * (RM ? 1 : 0.18);
    var p = Math.min(100, Math.round(shown * 100));
    pctEl.textContent = ('00' + p).slice(-3);
    fill.style.width = p + '%';
    if (!finished) requestAnimationFrame(tick);
  })();
  var L = lang();
  var assets = [
    ['vendor/three.module.js', 1300000], ['js/main.js', 60000], ['js/models.js', 40000], ['js/sim.js', 12000],
    ['js/flightfx.js', 30000], ['js/profiles.js', 9000], ['js/hud.js', 6000], ['js/ui.js', 14000], ['js/i18n.js', 4000], ['locales/' + L + '.json', 30000],
    ['assets/fonts/jetbrains-mono-latin-400-normal.woff2', 20000], ['assets/fonts/jetbrains-mono-vietnamese-400-normal.woff2', 8000]
  ];
  // NASA Earth / star textures (same URLs the renderer loads; served with long cache headers)
  // quality tier: ?q= / saved choice, else auto from GPU string + device class (main.js can still auto-downgrade on low FPS)
  function tier() {
    try { var q = new URLSearchParams(location.search).get('q') || localStorage.getItem('rocket.q'); if (q === 'high' || q === 'mid' || q === 'low') return { q: q, auto: false, gpu: '' }; } catch (e) {}
    var gpu = '';
    try { var c = document.createElement('canvas'), g = c.getContext('webgl2') || c.getContext('webgl'); var x = g && g.getExtension('WEBGL_debug_renderer_info'); gpu = x ? String(g.getParameter(x.UNMASKED_RENDERER_WEBGL)) : (g ? String(g.getParameter(g.RENDERER)) : ''); var lose = g && g.getExtension('WEBGL_lose_context'); lose && lose.loseContext(); } catch (e) {}
    var mob = matchMedia('(max-width: 820px), (pointer: coarse)').matches, mem = navigator.deviceMemory || 8, cores = navigator.hardwareConcurrency || 8;
    var weak = /swiftshader|llvmpipe|softpipe|software|basic render|mali-[4t][0-9]{2}\b|adreno[^0-9]*[2-5][0-9]{2}\b|powervr|sgx|intel.*hd graphics/i.test(gpu);
    var q = weak || (mob && (mem <= 3 || cores <= 4)) ? 'low' : mob ? 'mid' : (mem <= 4 || cores <= 4) ? 'mid' : 'high';
    return { q: q, auto: true, gpu: gpu };
  }
  var T = window.__TIER = tier(), Q = T.q;
  // first load: 2K (high/mid) or 1K (low); high upgrades to 4K in the background after the intro
  var TS = Q !== 'low' ? { day: 156000, night: 71000, clouds: 482000, topo: 163000, stars: 73000 } : { day: 50000, night: 25000, clouds: 150000, topo: 50000, stars: 30000 };
  var RES = Q === 'low' ? '1k' : '2k';
  Object.keys(TS).forEach(function (n) { assets.push(['assets/earth/' + n + '_' + RES + '.webp', TS[n]]); });
  assets.push(['assets/site/f9_' + RES + '.webp', Q === 'low' ? 190000 : 700000]);
  var total = assets.reduce(function (a, b) { return a + b[1]; }, 0), got = {};
  function fetchOne(a) {
    return fetch(a[0]).then(function (r) {
      if (!r.body || !r.body.getReader) { return r.arrayBuffer().then(function () { got[a[0]] = a[1]; }); }
      var rd = r.body.getReader(), n = 0, len = +r.headers.get('content-length') || a[1];
      function pump() {
        return rd.read().then(function (x) {
          if (x.done) { got[a[0]] = a[1]; return; }
          n += x.value.length; got[a[0]] = Math.min(a[1], a[1] * n / len);
          netFrac = Object.keys(got).reduce(function (s, k) { return s + got[k]; }, 0) / total; upd();
          return pump();
        });
      }
      return pump();
    }).catch(function () { got[a[0]] = a[1]; }).then(function () {
      netFrac = Object.keys(got).reduce(function (s, k) { return s + got[k]; }, 0) / total; upd();
      line(a[0].split('/').pop());
    });
  }
  window.__LD = {
    scene: function (f, label) { sceneFrac = f; upd(); if (label) line(label); },
    finish: function (onDone) {
      sceneFrac = 1; netFrac = 1; upd();
      var ld = document.getElementById('loader');
      function end() { finished = true; ld.remove(); document.body.classList.remove('is-loading'); onDone && onDone(); }
      if (RM || !window.gsap) { shown = 1; setTimeout(end, 120); return; }
      var tl = gsap.timeline({ onComplete: end });
      tl.to({}, { duration: 0.35 })
        .to('.ld-flame', { scaleY: 2.2, duration: 0.25, ease: 'power2.in' })
        .to('.ld-rocket', { y: -window.innerHeight, duration: 0.8, ease: 'power3.in' }, '<0.1')
        .to('.ld-center > :not(.ld-rocket)', { opacity: 0, y: -8, stagger: 0.04, duration: 0.25 }, '<')
        .to(ld, { opacity: 0, duration: 0.45 }, '-=0.25');
    }
  };
  if (!RM && window.gsap) {
    gsap.to('.ld-flame', { scaleY: 0.7, duration: 0.08, repeat: -1, yoyo: true, ease: 'none' });
    gsap.to('.ld-body', { y: -1.5, duration: 0.06, repeat: -1, yoyo: true, ease: 'none' });
  }
  Promise.all(assets.map(fetchOne)).then(function () {
    return import('./js/main.js');
  }).catch(function (e) {
    console.error(e);
    document.getElementById('ld-log').insertAdjacentHTML('beforeend', '<li>ERROR: ' + String(e && e.message || e) + '</li>');
  });
})();

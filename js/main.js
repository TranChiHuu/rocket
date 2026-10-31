// ROCKET // Mission Control — anatomy viewer + flight simulation (Three.js r170, GSAP).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/pp/EffectComposer.js';
import { RenderPass } from 'three/addons/pp/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/pp/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/pp/OutputPass.js';
import { ShaderPass } from 'three/addons/pp/ShaderPass.js';
import { initI18n, setLang, onLang, getLang, apply, t, fmt, LANGS } from './i18n.js';
import { makeHexTextures, buildFalcon9, buildStarship, setLegs, setGridFins, setFlaps } from './models.js';
import { f9Profile, ssProfile, timeMap, smooth } from './profiles.js';
import { RE, SITES, siteEcef, loadEarthTextures, upgradeEarthTextures, loadSiteGround, skyEnvironment, Plume, plasmaMaterial, plumeMaterial, Particles, surfaceFrame, createWorld, makeSeaSite, makeDroneShip, makeLandingZone } from './flightfx.js';
import { scramble, engineMap, engState, phaseTrack, graph, bracket, card, hms } from './hud.js';
import { initUI } from './ui.js';

const LD = window.__LD || { scene() {}, finish(cb) { cb && cb(); } };
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const MOBILE = matchMedia('(max-width: 820px), (pointer: coarse)').matches;
const SMALLQ = matchMedia('(max-width: 600px), (orientation: landscape) and (max-height: 520px)'); // phone layout (bottom sheets)
const TIER = window.__TIER || { q: MOBILE ? 'mid' : 'high', auto: true };
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, u) => a + (b - a) * u;

// ---------------- tweakable config (window.ROCKET_CFG) ----------------
const CFG = window.ROCKET_CFG = {
  camera: { fov: 40, chase: { dist: 2.4, up: -0.35, side: 0.25 }, wide: { base: 900, perAlt: 1.6, max: 900e3 }, onboardFov: 100, fisheye: 0.38, groundFov: [3, 45], lag: 4 },
  cuts: {
    'ss.ship': [[0, 'ground'], [9, 'chase'], [40, 'onboard'], [150, 'booster'], [168, 'onboard'], [200, 'chase'], [540, 'wide'], [2700, 'flap'], [3300, 'chase'], [3930, 'chase'], [3974, 'ground']],
    'ss.booster': [[0, 'ground'], [9, 'chase'], [40, 'onboard'], [150, 'booster'], [176, 'chase'], [232, 'wide'], [300, 'chase'], [374, 'ground']],
    'f9.full': [[0, 'ground'], [10, 'chase'], [50, 'onboard'], ['meco-5', 'booster'], ['sep+6', 'onboard'], ['fairing-3', 'chase'], ['fairing+9', 'wide']],
    'f9.booster': [[0, 'ground'], [10, 'chase'], [50, 'onboard'], ['meco-4', 'booster'], ['sep+10', 'chase'], ['entry-12', 'onboard'], ['entryEnd+3', 'chase'], ['landing-4', 'ground']]
  },
  plume: { lenScale: 1, intensity: 1, vacLen: 1, vacWidth: 1, light: 1 },
  bloom: { strength: 0.6, radius: 0.45, threshold: 0.82, flightThreshold: 1.6, anatomy: 0.22 }, // flight: only plumes / sun / glints bloom, not the bright daytime sky
  hud: { bracketPad: 8, graphKm: true, scramble: !RM },
  particles: { high: 3200, mid: 1600, low: 800 },
  lens: { vignette: .32, ca: .0022 },
  shake: !RM
};

// ---------------- state ----------------
const S = {
  rocket: 'f9', mode: 'mission', scn: { f9: 'booster', ss: 'ship' }, opt: { f9: 'asds', ss: 'catch' }, cam: 'auto',
  quality: TIER.q, qAuto: TIER.auto, explode: 0, xray: false, cut: false, cg: false, rot: !RM, sel: null, hover: null, visible: true
};

let renderer, composer, renderPass, bloom, barrel, out, envLow, envSpace, shakeAmp = 0;
let ana, anaCam, controls, anaModels = {}, anaModel, hex, envTex;
let fly, flyCam, W, sun, hemi, flyModels = {}, FM, P = null, TM = null, mtl = null, proxy = { r: 0 }, PT = null, GR = null, EA = null, EB = null;
let cutPlane = new THREE.Plane(V3(0, 0, -1), 0);

// =====================================================================
async function boot() {
  await initI18n(); LD.scene(.08, 'i18n ' + getLang());
  const canvas = $('#gl');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: S.quality === 'high', powerPreference: 'high-performance', logarithmicDepthBuffer: true });
  renderer.setPixelRatio(pr()); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  if (S.quality === 'high') { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; }
  const pm = new THREE.PMREMGenerator(renderer); envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  LD.scene(.18, 'renderer · webgl2');

  // anatomy scene
  ana = new THREE.Scene(); ana.background = new THREE.Color(0x000000); ana.environment = envTex; ana.environmentIntensity = .38;
  anaCam = new THREE.PerspectiveCamera(30, 1, .1, 4000);
  const key = new THREE.DirectionalLight(0xffffff, 1.5); key.position.set(40, 80, 60); ana.add(key);
  const rim = new THREE.DirectionalLight(0xff3b2f, 2.2); rim.position.set(-60, 30, -50); ana.add(rim);
  const rim2 = new THREE.DirectionalLight(0xff8a3a, .8); rim2.position.set(60, 10, -40); ana.add(rim2);
  ana.add(new THREE.AmbientLight(0xffffff, .12));
  const grid = new THREE.GridHelper(600, 120, 0x2a2a2a, 0x121212); grid.material.transparent = true; grid.material.opacity = .8; ana.add(grid);
  const ringG = new THREE.Group(); ana.add(ringG);
  [24, 48, 96].forEach((r, i) => { const pts = []; for (let k = 0; k <= 128; k++) { const a = k / 128 * Math.PI * 2; pts.push(V3(Math.cos(a) * r, .05, Math.sin(a) * r)); } const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: i ? 0x333333 : 0xff3b2f, dashSize: 2, gapSize: 1.5 })); l.computeLineDistances(); ringG.add(l); });
  controls = new OrbitControls(anaCam, canvas); controls.enableDamping = true; controls.dampingFactor = .07; controls.autoRotate = S.rot; controls.autoRotateSpeed = .6; controls.enablePan = false;
  controls.maxPolarAngle = Math.PI * .56;
  LD.scene(.25, 'scene · anatomy');

  // Starship (hex tiles + model) is built lazily on first use -> faster first load
  if (S.rocket === 'ss') getHex();
  anaModels[S.rocket] = prepAnatomy(S.rocket === 'f9' ? buildFalcon9({ payloadMass: 15000 }) : buildStarship({ hex: getHex() })); LD.scene(.45, 'model · ' + (S.rocket === 'f9' ? 'falcon 9' : 'starship'));
  initMarkers();

  // flight scene
  fly = new THREE.Scene();
  envLow = skyEnvironment(renderer, 'low'); envSpace = skyEnvironment(renderer, 'space'); fly.environment = envLow; fly.environmentIntensity = .55;
  fly.fog = new THREE.FogExp2(0x9fb3c8, 0);
  flyCam = new THREE.PerspectiveCamera(CFG.camera.fov, 1, .5, 2e9);
  let nT = 0; const earthTex = await loadEarthTextures(S.quality, n => LD.scene(.55 + .1 * (++nT / 5), 'nasa · ' + n));
  W = createWorld(S.quality, earthTex); fly.add(W.world, W.sky, W.stars);
  addCap(0);
  sun = new THREE.DirectionalLight(0xfff1dc, 3.2); fly.add(sun, sun.target);
  if (S.quality === 'high') { sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.0004; sun.shadow.normalBias = .04; const sc = sun.shadow.camera; sc.near = 1; sc.far = 4000; }
  hemi = new THREE.HemisphereLight(0x9fc0ff, 0x2a241c, .45); fly.add(hemi);
  LD.scene(.68, 'world · earth / atmosphere / debris');

  // post
  composer = new EffectComposer(renderer);
  renderPass = new RenderPass(ana, anaCam); composer.addPass(renderPass);
  bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), CFG.bloom.anatomy, CFG.bloom.radius, CFG.bloom.threshold); composer.addPass(bloom);
  barrel = new ShaderPass(LensShader); barrel.enabled = S.quality !== 'low'; composer.addPass(barrel);
  bloom.enabled = S.quality !== 'low';
  out = new OutputPass(); composer.addPass(out);
  LD.scene(.76, 'post · bloom / lens');

  initControls(); initUI(); LD.scene(.86, 'ui · sections');
  setRocket(S.rocket, true);
  { const q = new URLSearchParams(location.search).get('mode'); setMode(q === 'anatomy' ? 'anatomy' : 'mission'); } // Mission by default; ?mode=anatomy|mission
  onResize(); addEventListener('resize', onResize);
  new IntersectionObserver(([e]) => { S.visible = e.isIntersecting; }, { threshold: 0 }).observe($('#hud'));
  onLang(() => { relabel(); });
  relabel();
  LD.scene(.95, 'render · first frame');
  frame(performance.now());
  requestAnimationFrame(() => LD.finish(intro));
  window.__rocket = { ready: true, S, seek: tm => { seek(tm); if (mtl) mtl.pause(); }, get P() { return P; }, get mode() { return S.mode; }, get r() { return proxy.r; }, get total() { return TM?.total; }, end: () => { if (mtl) { mtl.progress(1); } } };
  requestAnimationFrame(loop);
}
const pr = () => Math.min(devicePixelRatio || 1, S.quality === 'high' ? 1.75 : S.quality === 'mid' ? 1.5 : 1);
function getHex() { return hex ||= makeHexTextures(512, 24); }

// =====================================================================
// ANATOMY
// =====================================================================
function prepAnatomy(m) {
  // unique materials per part so highlight/x-ray don't bleed across parts
  for (const k of m.order) {
    const map = new Map();
    m.parts[k].group.traverse(n => {
      if (!n.isMesh) return;
      const cl = mt => { if (!map.has(mt)) { const c = mt.clone(); c.userData = {}; map.set(mt, c); } return map.get(mt); };
      n.material = Array.isArray(n.material) ? n.material.map(cl) : cl(n.material);
    });
    map.forEach(c => { c.userData.base = { opacity: c.opacity, transparent: c.transparent, depthWrite: c.depthWrite, side: c.side, emissive: c.emissive ? c.emissive.clone() : null, ei: c.emissiveIntensity }; });
  }
  m.root.traverse(n => { if (n.isMesh) { n.castShadow = n.receiveShadow = false; } });
  return m;
}
function setAnatomyModel(k) {
  if (anaModel) ana.remove(anaModel.root);
  anaModel = anaModels[k] ||= prepAnatomy(k === 'f9' ? buildFalcon9({ payloadMass: 15000 }) : buildStarship({ hex: getHex() })); ana.add(anaModel.root);
  S.sel = S.hover = null; applyExplode(); applyXray(); applyCut(); frameAnatomy(true);
  buildPartList(); anatomyPanels(); placeMarkers();
}
function frameAnatomy(snap) {
  const H = anaModel.height, w = innerWidth, h = innerHeight, asp = w / h;
  const vf = THREE.MathUtils.degToRad(anaCam.fov), fitH = H * (MOBILE ? 1.5 : 1.62) * (1 + S.explode * .2), fitW = H * .4;
  const dist = Math.max(fitH / 2 / Math.tan(vf / 2), fitW / 2 / Math.tan(vf / 2) / asp) * (MOBILE ? 1.15 : 1);
  controls.target.set(0, H * (MOBILE ? .42 : .4), 0); controls.minDistance = H * .35; controls.maxDistance = dist * 2.2;
  const dir = snap ? V3(.55, .12, 1).normalize() : anaCam.position.clone().sub(controls.target).normalize();
  const to = controls.target.clone().addScaledVector(dir, dist);
  if (snap || RM || !window.gsap) anaCam.position.copy(to);
  else gsap.to(anaCam.position, { x: to.x, y: to.y, z: to.z, duration: 1, ease: 'power3.inOut' });
}
function applyExplode() {
  const m = anaModel, f = S.explode;
  for (const k of m.order) { const p = m.parts[k]; p.group.position.copy(p.explode).multiplyScalar(f); }
  m.upper.position.y = m.upperY + f * m.height * .1;
  if (m.fairing) m.fairing.forEach((g, i) => { g.position.x = (i ? -1 : 1) * f * 4; });
  placeMarkers();
}
function eachMat(fn) { anaModel.root.traverse(n => { if (n.isMesh) (Array.isArray(n.material) ? n.material : [n.material]).forEach(mt => fn(mt, n)); }); }
function applyXray() {
  eachMat((mt, n) => {
    const b = mt.userData.base; if (!b) return;
    if (n.userData.internal) { n.visible = S.xray || S.cut; return; }
    if (S.xray) { mt.transparent = true; mt.opacity = .14; mt.depthWrite = false; } else { mt.transparent = b.transparent; mt.opacity = b.opacity; mt.depthWrite = b.depthWrite; }
    mt.needsUpdate = true;
  });
}
function applyCut() {
  renderer.localClippingEnabled = S.cut;
  eachMat((mt, n) => { const b = mt.userData.base; if (!b) return; if (n.userData.internal) { n.visible = S.xray || S.cut; return; } mt.clippingPlanes = S.cut ? [cutPlane] : null; mt.side = S.cut ? THREE.DoubleSide : b.side; mt.needsUpdate = true; });
}
function highlight() {
  const on = S.sel || S.hover;
  eachMat((mt, n) => { const b = mt.userData.base; if (!b || !mt.emissive) return; const hit = on && n.userData.part === on; mt.emissive.copy(hit ? new THREE.Color(0xff3b2f) : b.emissive); mt.emissiveIntensity = hit ? .55 : b.ei; });
  $$('#part-list li').forEach(li => li.setAttribute('aria-current', li.dataset.k === on ? 'true' : 'false'));
}
function buildPartList() {
  const ol = $('#part-list'); ol.textContent = '';
  anaModel.order.forEach((k, i) => {
    const li = document.createElement('li'); li.dataset.k = k; li.tabIndex = 0; li.setAttribute('role', 'button');
    li.innerHTML = `<i>${String(i + 1).padStart(2, '0')}</i><span></span>`; li.querySelector('span').textContent = t(`parts.${k}.name`);
    li.onmouseenter = () => { S.hover = k; highlight(); }; li.onmouseleave = () => { S.hover = null; highlight(); };
    li.onclick = () => selectPart(S.sel === k ? null : k); li.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); li.click(); } };
    ol.appendChild(li);
  });
  $('#parts-count').textContent = String(anaModel.order.length).padStart(2, '0');
}
function selectPart(k) { S.sel = k; highlight(); }
function partMass(p) { return p.mass + p.prop.reduce((s, x) => s + x[0], 0); }
function partCard(k) {
  const p = anaModel.parts[k], i = anaModel.order.indexOf(k);
  const rows = [[t('tc.stage'), t(p.stage === anaModel.upper ? (anaModel.kind === 'ss' ? 'stage.ship' : 'stage.upper') : (anaModel.kind === 'ss' ? 'stage.sh' : 'stage.booster'))]];
  const pm = partMass(p); if (pm) rows.push([t('tc.mass'), pm >= 1000 ? `${fmt(pm / 1000, pm < 1e4 ? 1 : 0)} T` : `${fmt(pm)} KG`]);
  if (p.prop.length) rows.push([t('tc.prop'), `${fmt(p.prop.reduce((s, x) => s + x[0], 0) / 1000, 0)} T`]);
  if (p.dims) rows.push([t('tc.dims'), p.dims.toUpperCase()]);
  rows.push([t('tc.mat'), t(`parts.${k}.mat`)]);
  card(`${String(i + 1).padStart(2, '0')} / ${String(anaModel.order.length).padStart(2, '0')}`, t(`parts.${k}.name`), rows, t(`parts.${k}.fn`));
}
const _box = new THREE.Box3(), _v = V3();
function screenRect(obj, cam) {
  _box.setFromObject(obj, false); if (_box.isEmpty()) return null;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; const W_ = innerWidth, H_ = $('#hud').clientHeight;
  for (let i = 0; i < 8; i++) {
    _v.set(i & 1 ? _box.max.x : _box.min.x, i & 2 ? _box.max.y : _box.min.y, i & 4 ? _box.max.z : _box.min.z).project(cam);
    if (_v.z > 1) return null;
    const sx = (_v.x * .5 + .5) * W_, sy = (-_v.y * .5 + .5) * H_; x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
  }
  const p = CFG.hud.bracketPad; return { x0: x0 - p, y0: y0 - p, x1: x1 + p, y1: y1 + p };
}
function anatomyPanels() {
  const m = anaModel, ss = m.kind === 'ss';
  const vals = { h: fmt(m.height, 1), m: fmt(ss ? 5000 : 549, 0), t: fmt(ss ? 74 : 7.6, 1), s: fmt(m.cg - m.cp, 1) };
  for (const k in vals) { scramble($('#pn-' + k), vals[k]); $(`#pn-${k}-s`).textContent = t(`pnsub.${m.kind}.${k}`, { cal: fmt(m.cpCal, 2) }); }
  $('#sys-veh').textContent = ss ? 'SS' : 'F9';
}
// CG / CP markers (DOM labels anchored to 3D points)
let mkCG, mkCP; const mkGroup = new THREE.Group();
function initMarkers() {
  const mk = cls => { const d = document.createElement('div'); d.className = 'mk ' + cls; d.innerHTML = '<i></i><b></b><small></small>'; $('#hud').appendChild(d); return d; };
  mkCG = mk('cg'); mkCP = mk('cp');
  const geo = new THREE.SphereGeometry(1, 20, 12);
  const a = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true })); a.name = 'cg'; a.renderOrder = 20;
  const b = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff3b2f, depthTest: false, transparent: true })); b.name = 'cp'; b.renderOrder = 20;
  mkGroup.add(a, b); ana.add(mkGroup);
}
function placeMarkers() {
  if (!anaModel || !mkCG) return;
  const m = anaModel, r = m.radius * .32;
  mkGroup.visible = S.cg; mkGroup.children.forEach(s => s.scale.setScalar(r));
  mkGroup.getObjectByName('cg').position.set(0, m.cg, 0); mkGroup.getObjectByName('cp').position.set(0, m.cp, 0);
  mkCG.querySelector('b').textContent = t('mk.cg'); mkCP.querySelector('b').textContent = t('mk.cp');
  mkCG.querySelector('small').textContent = `${fmt(m.cg, 1)} M`; mkCP.querySelector('small').textContent = `${fmt(m.cp, 1)} M`;
}
function updateMarkers() {
  const show = S.mode === 'anatomy' && S.cg;
  for (const [el, n] of [[mkCG, 'cg'], [mkCP, 'cp']]) {
    if (!show) { el.style.opacity = 0; continue; }
    _v.copy(mkGroup.getObjectByName(n).position).project(anaCam);
    el.style.opacity = _v.z < 1 ? 1 : 0; el.style.transform = `translate(${(_v.x * .5 + .5) * innerWidth}px,${(-_v.y * .5 + .5) * $('#hud').clientHeight}px)`;
  }
}
// picking
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(); let pickPending = null;
function pick(ev, click) {
  if (S.mode !== 'anatomy') return;
  const r = $('#gl').getBoundingClientRect(); ndc.set((ev.clientX - r.left) / r.width * 2 - 1, -(ev.clientY - r.top) / r.height * 2 + 1);
  ray.setFromCamera(ndc, anaCam);
  const hits = ray.intersectObject(anaModel.root, true).filter(h => h.object.visible && h.object.userData.part && (!S.cut || h.object.userData.internal || cutPlane.distanceToPoint(h.point) >= 0));
  const k = hits.length ? hits[0].object.userData.part : null;
  if (click) selectPart(k === S.sel ? null : k); else if (k !== S.hover) { S.hover = k; highlight(); }
}

// =====================================================================
// FLIGHT
// =====================================================================
const caps = {};
function addCap(x) { // high-res spherical cap so the ground is smooth near sites
  const key = Math.round(x / 1e3); if (caps[key]) return caps[key];
  const g = new THREE.SphereGeometry(RE, 256, 128, 0, Math.PI * 2, 0, 2500e3 / RE); g.rotateZ(-x / RE); // 2500 km: large enough that the low-altitude horizon is smooth
  const o = V3(Math.sin(x / RE) * RE, Math.cos(x / RE) * RE, 0); g.translate(-o.x, -o.y, -o.z); // local coords -> float32 precision
  const m = new THREE.Mesh(g, W.earth.material); m.position.copy(o); m.renderOrder = 1; W.world.add(m); caps[key] = m; return m;
}
function getFlightModel(k) {
  if (flyModels[k]) return flyModels[k];
  const m = k === 'f9' ? buildFalcon9({ payloadMass: 15000 }) : buildStarship({ hex: getHex() });
  const cB = new THREE.Group(), cU = new THREE.Group(); W.world.add(cB, cU);
  cB.add(m.booster); cU.add(m.upper); m.upper.position.y = 0;
  m.root.traverse(n => { if (n.isMesh && n.userData.internal) n.visible = false; });
  const q = S.quality;
  const plB = new Plume(m.booster, m.enginesB, { clusterR: m.radius, quality: q, fuel: k === 'ss' ? 'ch4' : 'rp1' });
  const plU = new Plume(m.upper, m.enginesU, { clusterR: k === 'f9' ? 1.5 : 4.0, quality: q, fuel: k === 'ss' ? 'ch4' : 'rp1' });
  const lenB = m.stageTopB, lenU = m.height - m.upperY;
  const shell = (stage, len) => { const mt = plasmaMaterial(); const s = new THREE.Mesh(new THREE.CapsuleGeometry(m.radius * 1.28, len * .92, 8, 28), mt); s.position.y = len / 2; s.visible = false; s.renderOrder = 8; s.frustumCulled = false; stage.add(s); return s; };
  const wake = () => { const mt = plumeMaterial(); mt.uniforms.uCore.value.set(1.6, .5, 1.4); mt.uniforms.uEdge.value.set(.5, .15, .9); mt.uniforms.uSoft.value = .9; const w = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 24, 16, true).translate(0, -.5, 0), mt); w.visible = false; w.frustumCulled = false; w.renderOrder = 7; W.world.add(w); return w; };
  // hot-staging glow
  let glow = null, glowLight = null;
  if (k === 'ss') {
    glow = new THREE.Mesh(new THREE.CylinderGeometry(m.radius * 1.06, m.radius * 1.06, 2.2, 64, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 1.6, .5), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    glow.position.y = 70.1; m.booster.add(glow); glowLight = new THREE.PointLight(0xff8a3a, 0, 0, 2); glowLight.position.y = 71; m.booster.add(glowLight);
  }
  const F = flyModels[k] = { m, cB, cU, plB, plU, shB: shell(m.booster, lenB), shU: shell(m.upper, lenU), wkB: wake(), wkU: wake(), glow, glowLight, lenB, lenU,
    parts: new Particles(CFG.particles[q] || 2000), sites: [], lines: [] };
  W.world.add(F.parts.points);
  return F;
}
function setFlightVisible(k) { for (const n in flyModels) { const F = flyModels[n], on = n === k; F.cB.visible = F.cU.visible = on; F.parts.points.visible = on; F.wkB.visible = F.wkU.visible = false; } }

function buildMission() {
  const k = S.rocket;
  P = k === 'f9' ? f9Profile(S.scn.f9, S.opt.f9, 15000) : ssProfile(S.scn.ss, S.opt.ss);
  TM = timeMap(P.seg);
  FM = getFlightModel(k); setFlightVisible(k);
  W.ssPad.visible = k === 'ss'; W.f9Pad.visible = k === 'f9';
  setSiteGround(k);
  // sites
  for (const F of Object.values(flyModels)) { F.sites.forEach(s => W.world.remove(s)); F.sites = []; F.lines.forEach(l => W.world.remove(l)); F.lines = []; }
  const site = (x, kind) => { const f = kind === 'lz' ? surfaceFrame(x) : makeSeaSite(x, W.seaTex, W.waveN); if (kind === 'ship') f.add(makeDroneShip(W.steel)); if (kind === 'lz') { f.add(makeLandingZone(W.concrete, true)); f.add(lzGround()); } W.world.add(f); FM.sites.push(f); addCap(x); f.userData.x = x; return f; };
  P.landSite = null; P.shipSite = null;
  if (k === 'f9') P.landSite = site(P.landX, P.land === 'rtls' ? 'lz' : 'ship');
  else { if (!P.catchMode) P.landSite = site(P.landX, 'sea'); P.shipSite = site(P.shipSplashX, 'sea'); }
  // dashed trajectories
  const mkLine = (tr, t0, t1, color, op) => {
    const pts = [], o = posE(tr, t0, V3()); for (let tt = t0; tt <= t1; tt += 2) pts.push(posE(tr, tt, V3()).sub(o));
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color, dashSize: 900, gapSize: 600, transparent: true, opacity: op, depthWrite: false }));
    l.computeLineDistances(); l.position.copy(o); l.frustumCulled = false; W.world.add(l); FM.lines.push(l);
  };
  const fol = P.follow === 'upper';
  mkLine(P.tracks.upper, 0, fol ? P.tEnd : Math.min(P.tEnd + 200, P.tracks.upper.t1), fol ? 0xff3b2f : 0x666666, fol ? .9 : .5);
  mkLine(P.tracks.booster, P.tSep, P.tracks.booster.t1, fol ? 0x666666 : 0xff3b2f, fol ? .5 : .9);
  // HUD
  const m = FM.m;
  EA = engineMap($('#eng-a'), m.enginesB, m.radius); EB = engineMap($('#eng-b'), m.enginesU, m.radius);
  PT = phaseTrack(P);
  $$('#ptrack .pn-node').forEach(n => n.onclick = () => seek(+n.dataset.t));
  const ser = tr => { const a = []; for (let tt = 0; tt <= P.tEnd; tt += P.tEnd / 300) a.push([tt, tr.at(tt).h / 1e3]); return a; };
  const sF = ser(P.tracks[P.follow]), sO = ser(P.tracks[fol ? 'booster' : 'upper']);
  GR = graph([sF, sO], P.tEnd, Math.max(...sF.map(p => p[1]), ...sO.map(p => p[1])) * 1.08);
  // reset model states
  setLegs(m, 0); if (m.kind === 'f9') setGridFins(m, 0);
  if (m.fairing) m.fairing.forEach(g => { g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); g.visible = true; });
  if (m.hotRing) { m.hotRing.position.set(0, 0, 0); m.hotRing.rotation.set(0, 0, 0); m.hotRing.visible = true; }
  FM.parts.clear(); lastEv = null; splashDone = {};
  // timeline
  mtl?.kill(); proxy.r = 0;
  mtl = window.gsap ? gsap.timeline({ paused: true, onComplete: () => setPlaying(false) }).to(proxy, { r: TM.total, duration: TM.total, ease: 'none' }) : null;
  mtl?.timeScale(+$('#m-speed').value);
  camState.init = false; setPlaying(false); relabelMission();
}
function setPlaying(on) {
  $('#m-play').setAttribute('aria-pressed', on);
  if (mtl) { if (on) { if (proxy.r >= TM.total - .01 || mtl.progress() >= 1) { mtl.pause(0); proxy.r = 0; lastMission = 0; FM.parts.clear(); splashDone = {}; lastEv = undefined; mtl.play(0); } else mtl.play(); } else mtl.pause(); }
  setPlayingLabel();
}
// NASA imagery under the pad (Cape / Starbase) and at the RTLS landing zone
function setSiteGround(k) {
  const g = W.ground; g.userData.k = k;
  loadSiteGround(k, S.quality).then(t => { if (g.userData.k !== k) return; g.material.map = t.map; g.material.roughnessMap = t.rough; g.material.needsUpdate = true; g.visible = true; }).catch(() => { g.visible = false; });
}
function lzGround() {
  const m = new THREE.Mesh(new THREE.CircleGeometry(6000, 96), new THREE.MeshStandardMaterial({ transparent: true, roughness: 1, envMapIntensity: .6 }));
  m.rotation.x = -Math.PI / 2; m.position.y = .3; m.receiveShadow = true; m.visible = false;
  loadSiteGround('lz', S.quality).then(t => { m.material.map = t.map; m.material.roughnessMap = t.rough; m.material.needsUpdate = true; m.visible = true; }).catch(() => {});
  return m;
}
function seek(tMission) { if (!mtl) return; mtl.time(TM.toReal(tMission)); FM.parts.clear(); splashDone = {}; }

// Earth-local position of a track point (+ pad / landing offsets)
const _s = {}, _s2 = {};
function hEff(tr, s) {
  let h = s.h;
  if (s.t < 30) h += (S.rocket === 'ss' ? 20.9 : 4) * (1 - smooth(s.h / 300));
  if (S.rocket === 'f9' && tr === P.tracks.booster && P.landX && Math.abs(s.x - P.landX) < 3000 && s.h < 2000) h += (P.land === 'rtls' ? 1.4 : 3.05) * (1 - smooth(s.h / 2000));
  return h;
}
function posE(tr, tt, out) { const s = tr.at(tt, _s2), a = s.x / RE, r = RE + hEff(tr, s); return out.set(Math.sin(a) * r, Math.cos(a) * r, 0); }
function axisE(x, th, out) { const a = x / RE + th; return out.set(Math.sin(a), Math.cos(a), 0); }

const st = { b: {}, u: {} }, vB = V3(), vU = V3(), aB = V3(), aU = V3(), tmp = V3(), tmp2 = V3(), tmp3 = V3(), velB = V3(), velU = V3();
let lastEv = null, splashDone = {}, lastT = 0;
function flightUpdate(tm, dt, dtM, now) {
  const m = FM.m, ss = m.kind === 'ss';
  const sB = P.tracks.booster.at(tm, st.b), sU = P.tracks.upper.at(tm, st.u);
  // --- poses
  let thB = sB.th, thU = sU.th, xB = sB.x;
  if (ss && tm > 3985) thU += smooth((tm - 3986) / 4.5) * Math.PI / 2 * .98; // tip-over after splashdown
  if (ss && P.catchMode === false && tm > 397) thB += smooth((tm - 397) / 5) * Math.PI / 2 * .98;
  const baseU = vU.set(Math.sin(sU.x / RE), Math.cos(sU.x / RE), 0).multiplyScalar(RE + hEff(P.tracks.upper, sU));
  axisE(sU.x, thU, aU);
  const ownB = vB.set(Math.sin(xB / RE), Math.cos(xB / RE), 0).multiplyScalar(RE + hEff(P.tracks.booster, sB));
  const dS = tm - P.tSep;
  if (tm < P.tSep) { ownB.copy(baseU); thB = thU; }
  else if (dS < 8) { const w = smooth(dS / 8); tmp.copy(baseU).addScaledVector(aU, -(0.5 * 12 * dS * dS)); ownB.lerpVectors(tmp, ownB, w); thB = lerp(thU, thB, w); }
  axisE(xB, thB, aB); if (tm < P.tSep + 8) axisE(sU.x, thB, aB);
  FM.cB.position.copy(ownB); FM.cB.rotation.set(0, 0, -Math.atan2(aB.x, aB.y));
  FM.cU.position.copy(baseU).addScaledVector(aU, m.upperY); FM.cU.rotation.set(0, 0, -Math.atan2(aU.x, aU.y));
  // velocities (Earth-local, finite diff)
  velOf(P.tracks.booster, tm, velB); velOf(P.tracks.upper, tm, velU);

  // --- follow / anchor
  const followU = P.follow === 'upper' && tm >= P.tSep, stacked = tm < P.tSep;
  const fObj = stacked ? FM.cB : followU ? FM.cU : FM.cB;
  const fLen = stacked ? m.height : followU ? FM.lenU : FM.lenB;
  const fS = (P.follow === 'upper') ? sU : sB, fA = stacked ? aB : followU ? aU : aB;
  const a = Math.atan2(fObj.position.x, fObj.position.y), r = fObj.position.length();
  W.world.rotation.set(0, 0, a); W.world.position.set(0, -r, 0); W.world.updateMatrixWorld(true);

  // --- engines / plumes
  const E = P.engines(tm), q = S.quality;
  const nB = m.enginesB.length, nU = m.enginesU.length;
  const esB = engState(m.kind, 'b', E.b, nB), esU = engState(m.kind, 'u', E.u, nU);
  const pB = Math.exp(-Math.max(0, sB.h) / 8400), pU = Math.exp(-Math.max(0, sU.h) / 8400);
  FM.plB.set(esB.map(x => x > 0), pB, now, CFG.plume); FM.plU.set(esU.map(x => x > 0), pU, now, CFG.plume);
  if (ss && tm >= 159 && tm < P.tSep + .5) FM.plU.set(esU.map(x => x > 0), .35, now, { ...CFG.plume, lenScale: .35 }); // plume into the ring
  EA.set(esB); EB.set(esU);
  // --- hot staging glow
  if (FM.glow) { const g = tm > 158.6 && tm < 166 ? (tm < 160 ? smooth((tm - 158.6) / 1.4) : 1 - smooth((tm - 160) / 6)) : 0; FM.glow.material.opacity = g; FM.glowLight.intensity = g * 6e4; FM.glow.visible = g > .01; }
  // --- mechanisms
  if (m.kind === 'f9') {
    setGridFins(m, smooth((tm - P.gridfinsAt) / 1.5)); setLegs(m, smooth((tm - P.legsAt) / 2.5));
    if (m.fairing) { const d = tm - P.fairingAt; m.fairing.forEach((g, i) => { const s = i ? -1 : 1; if (d <= 0) { g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); g.visible = true; return; } g.position.set(s * (1.2 * d + 1.5 * d * d), -2 * d * d, 0); g.rotation.set(0, 0, -s * .35 * d); g.visible = d < 12; }); }
  } else {
    const fl = P.flaps(tm); setFlaps(m, fl[0], fl[1]);
    const d = tm - P.ringJettisonAt; if (m.hotRing) { if (d > 0) { m.hotRing.position.set(1.2 * d, 4 * d - 1.5 * d * d, .5 * d); m.hotRing.rotation.set(.3 * d, 0, -.5 * d); m.hotRing.visible = d < 25; } else { m.hotRing.position.set(0, 0, 0); m.hotRing.rotation.set(0, 0, 0); m.hotRing.visible = true; } }
    // tower arms: open, close on catch
    const close = P.catchMode && tm > 386 ? smooth((tm - 386) / 9) : 0;
    W.arms.forEach(pv => { pv.rotation.y = pv.userData.side * .55 * (1 - close); });
  }
  // --- plasma
  const pl = P.plasma(tm);
  for (const [sh, wk, c, vel, len, active] of [[FM.shU, FM.wkU, FM.cU, velU, FM.lenU, !stacked && (ss || P.follow === 'upper' ? true : true)], [FM.shB, FM.wkB, FM.cB, velB, FM.lenB, true]]) {
    const isU = sh === FM.shU, I = isU ? (ss ? pl : 0) : (ss ? 0 : pl);
    sh.visible = wk.visible = I > .01 && active;
    if (!sh.visible) continue;
    tmp.copy(vel).normalize(); tmp2.copy(tmp).applyQuaternion(c.quaternion.clone().invert());
    sh.material.uniforms.uI.value = I * (ss ? 1.1 : .8); sh.material.uniforms.uVel.value.copy(tmp2); sh.material.uniforms.uTime.value = now;
    tmp3.copy(c.position).addScaledVector(axisE(isU ? sU.x : xB, isU ? thU : thB, V3()), len * .5);
    wk.position.copy(tmp3); wk.quaternion.setFromUnitVectors(V3(0, 1, 0), tmp);
    const u = wk.material.uniforms; u.uLen.value = len * (3 + 3 * I); u.uR0.value = m.radius * 1.4; u.uR1.value = m.radius * 4; u.uK.value = .5; u.uI.value = .5 * I; u.uNoise.value = .7; u.uTime.value = now; u.uDiam.value = 0;
  }
  // --- particles
  if (dtM > 0 && dt > 0) emitParticles(tm, dt, dtM, sB, sU, aB, aU, E, esB, esU, pB, pU, stacked);
  FM.parts.rebase(fObj.position); FM.parts.update(dtM > 0 ? dt : 0);
  FM.parts.mat.uniforms.uScale.value = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(flyCam.fov) / 2));
  { // engine glow lighting the smoke from below, low altitude only
    const fB = esB.filter(x => x > 0).length / Math.max(1, nB), pu = FM.parts.mat.uniforms;
    FM.cB.getWorldPosition(pu.uGlowP.value).addScaledVector(aB.clone().applyQuaternion(W.world.quaternion), -m.radius * 2);
    pu.uGlowI.value = fB * 1.1 * (1 - smooth(sB.h / 4000)); pu.uGlowR.value = m.radius * 14;
    // shake: engine roar near the ground + aerodynamic buffeting near max-Q
    const fS_ = Math.max(fB, esU.filter(x => x > 0).length / Math.max(1, nU) * (tm > P.tSep ? 1 : 0)), rho = 1.225 * Math.exp(-Math.max(0, fS.h) / 8400), qd = .5 * rho * fS.v * fS.v;
    shakeAmp = CFG.shake ? fS_ * (.6 * Math.exp(-Math.max(0, fS.h) / 1500) + .5 * Math.min(1.2, qd / 35000)) : 0;
  }

  // --- camera
  _stacked = stacked;
  updateFlyCam(tm, dt, fObj, fLen, fA, stacked ? m.radius : followU ? (ss ? 4.5 : 1.85) : m.radius, fS);
  FM.parts.mat.uniforms.uSun.value.copy(W.sunDir).transformDirection(flyCam.matrixWorldInverse);
  // --- environment fades
  const cp = flyCam.position.clone().sub(W.world.position), camAlt = cp.length() - RE;
  sunEarth.set(.5, .12, .86).normalize(); W.sunDir.copy(sunEarth).applyQuaternion(W.world.quaternion);
  sun.position.copy(W.sunDir).multiplyScalar(1000); sun.target.position.set(0, 0, 0);
  W.sky.position.copy(flyCam.position); W.stars.position.copy(flyCam.position);
  W.sky.material.uniforms.uUp.value.copy(cp).normalize(); W.sky.material.uniforms.uAlt.value = camAlt;
  W.stars.material.uniforms.uOp.value = smooth((camAlt - 22e3) / 50e3);
  { const ec = W.earth.material.uniforms.uEcef.value; siteEcef(...SITES[S.rocket], ec); W.clouds.material.uniforms.uEcef.value.copy(ec);
    _m3.setFromMatrix4(W.world.matrixWorld).transpose(); W.stars.material.uniforms.uRot.value.multiplyMatrices(ec, _m3);
    const cr = now * 2e-4; W.earth.material.uniforms.uCloudRot.value = cr; W.clouds.material.uniforms.uCloudRot.value = cr; }
  W.atmo.material.uniforms.uI.value = smooth((camAlt - 15e3) / 50e3);
  const sp = smooth((camAlt - 60e3) / 120e3); W.debris.material.opacity = .8 * sp; W.rings.children.forEach(l => l.material.opacity = .55 * sp); W.debris.visible = W.rings.visible = sp > .01;
  hemi.intensity = .45 * (1 - smooth((camAlt - 30e3) / 60e3)) + .08;
  // altitude haze / aerial perspective: dense near the ground, gone above ~40 km
  const hz = Math.exp(-Math.max(0, camAlt) / 7000);
  fly.fog.density = 3.2e-5 * hz; W.earth.material.uniforms.uHaze.value = 1.6e-5 * hz;
  fly.environment = camAlt > 35e3 ? envSpace : envLow;
  if (sun.castShadow) { const sc = sun.shadow.camera, b = clamp(fLen * 1.3, 60, 260); if (sc.right !== b) { sc.left = sc.bottom = -b; sc.right = sc.top = b; sc.updateProjectionMatrix(); } sun.position.copy(W.sunDir).multiplyScalar(1500); }
  FM.lines.forEach(l => { l.material.dashSize = clamp(camAlt * .02, 40, 60e3); l.material.gapSize = l.material.dashSize * .7; });

  // --- HUD
  hudUpdate(tm, fS, fObj, fLen, fA);
}
function velOf(tr, tt, out) { posE(tr, tt + .5, out); posE(tr, tt - .5, tmp3); return out.sub(tmp3); }
const sunEarth = V3();

function emitParticles(tm, dt, dtM, sB, sU, aB, aU, E, esB, esU, pB, pU, stacked) {
  const PS = FM.parts, m = FM.m, k = S.quality === 'high' ? 1 : S.quality === 'mid' ? .6 : .35, rnd = () => Math.random() * 2 - 1;
  const stages = [[FM.cB, aB, sB, esB, pB, m.radius]]; if (!stacked) stages.push([FM.cU, aU, sU, esU, pU, m.kind === 'f9' ? 1.5 : 4]);
  for (const [c, A, s, es, p, R] of stages) {
    const on = es.some(x => x); if (!on) continue;
    const frac = es.filter(x => x).length / es.length;
    // exhaust smoke / condensation trail
    if (s.h < 32e3) {
      const n = Math.min(40, (70 * k * (0.35 + frac)) * dt * (1 + 3 * (1 - p)) * (dtM / dt > 4 ? .5 : 1));
      for (let i = 0; i < n + Math.random(); i++) {
        tmp.copy(c.position).addScaledVector(A, -R * (5 + Math.random() * 4)); tmp.x += rnd() * R; tmp.z += rnd() * R;
        tmp2.copy(A).multiplyScalar(-(40 + Math.random() * 80) * p).add(V3(rnd() * 8, rnd() * 8, rnd() * 8));
        PS.emit(tmp, tmp2, 6 + Math.random() * 6, R * 2.2, R * (12 + Math.random() * 10) * (1 + (1 - p) * 2.5), .34 * Math.sqrt(p) + .05, [.8, .79, .77], .7);
      }
    }
    // ground cloud at liftoff / landing
    const hg = s.h + (tm < 30 ? (S.rocket === 'ss' ? 20 : 4) : 0);
    if (hg < 260 && frac > 0) {
      const n = Math.min(18, 55 * k * dt * (1 - hg / 260) * (dtM / dt > 4 ? .5 : 1));
      tmp3.copy(c.position).normalize();
      for (let i = 0; i < n; i++) {
        const ang = Math.random() * Math.PI * 2, rad = tmp2.set(Math.cos(ang), 0, Math.sin(ang));
        // tangent plane: x along local east, z out of plane
        tmp.copy(c.position).setLength(RE + 2); const east = V3(tmp3.y, -tmp3.x, 0);
        const v = east.multiplyScalar(rad.x * (90 + Math.random() * 90)).add(V3(0, 0, rad.z * (90 + Math.random() * 90))).addScaledVector(tmp3, 6 + Math.random() * 14);
        PS.emit(tmp, v, 8 + Math.random() * 6, R * 3.5, R * (26 + Math.random() * 24), .34, Math.random() < .7 ? [.93, .93, .92] : [.7, .68, .65], .45); // steam from the deluge + dust
      }
    }
  }
  // RCS puffs on coasting booster (cold gas)
  const coast = !stacked && !esB.some(x => x) && sB.h > 15e3;
  if (coast && Math.random() < dt * 1.6 * Math.min(4, dtM / dt)) {
    const side = Math.random() < .5 ? 1 : -1, top = tmp.copy(FM.cB.position).addScaledVector(aB, FM.lenB - 3);
    const sd = V3(0, 0, side); for (let i = 0; i < 8; i++) PS.emit(top.clone().addScaledVector(sd, m.radius), sd.clone().multiplyScalar(30 + Math.random() * 20).add(V3(rnd() * 4, rnd() * 4, rnd() * 4)), 1.2, 1, 9, .75, [1, 1, 1], 1.8);
  }
  // hot-staging vent flash
  if (m.kind === 'ss' && tm > 159 && tm < 162) {
    tmp.copy(FM.cB.position).addScaledVector(aB, 70);
    for (let i = 0; i < 18 * k; i++) { const ang = Math.random() * Math.PI * 2, d = V3(Math.cos(ang), 0, Math.sin(ang)); const v = V3(aB.y * d.x, -aB.x * d.x, d.z).multiplyScalar(90 + Math.random() * 60); PS.emit(tmp.clone().addScaledVector(v.clone().normalize(), m.radius), v, .9, 2, 16, .9, [1, .62, .28], 1.2); }
  }
  // splashes / fireball
  const splash = (key, c, A, s, big) => {
    if (splashDone[key] || !(s.h < 2)) return; splashDone[key] = true;
    tmp3.copy(c.position).normalize(); const east = V3(tmp3.y, -tmp3.x, 0);
    for (let i = 0; i < 220 * k; i++) { const ang = Math.random() * 6.283; const v = east.clone().multiplyScalar(Math.cos(ang) * (15 + Math.random() * 40)).add(V3(0, 0, Math.sin(ang) * (15 + Math.random() * 40))).addScaledVector(tmp3, 30 + Math.random() * 70); PS.emit(c.position, v, 3 + Math.random() * 2, 3, 26, .8, [.92, .95, 1], .6); }
    if (big) for (let i = 0; i < 160 * k; i++) { const v = V3(rnd(), rnd(), rnd()).normalize().multiplyScalar(20 + Math.random() * 40).addScaledVector(tmp3, 20); PS.emit(tmp.copy(c.position).addScaledVector(A, 12), v, 2.5 + Math.random() * 2, 6, 40, .9, Math.random() < .6 ? [1, .55, .18] : [.3, .28, .27], .7); }
  };
  if (m.kind === 'ss') {
    if (!P.catchMode && tm > 395) splash('b', FM.cB, aB, sB, tm > 398);
    if (tm > 3984) splash('u', FM.cU, aU, sU, false);
    if (tm > 3990 && !splashDone.fb) { splashDone.fb = true; splashDone.u = false; splash('u', FM.cU, aU, { h: 0 }, true); }
  }
}

// ---------------- cameras ----------------
const camState = { init: false, off: V3(), look: V3(), fov: 40, mode: 'chase', wideD: 1000 };
function autoCam(tm) {
  const list = CFG.cuts[`${S.rocket}.${P.scn}`] || []; let c = 'chase';
  const at = s => { if (typeof s === 'number') return s; const m_ = /^(\w+)([+-]\d+)?$/.exec(s); const e = P.evs.find(e => e.k === m_[1]) || (m_[1] === 'entryEnd' && P.sim ? { t: P.sim.ev.entryEnd.t } : null); return e ? e.t + (+m_[2] || 0) : 1e9; };
  for (const [tt, cam] of list) if (tm >= at(tt)) c = cam;
  if (c === 'flap' && S.rocket !== 'ss') c = 'chase';
  return c;
}
function updateFlyCam(tm, dt, fObj, len, A, R, s) {
  let mode = S.cam === 'auto' ? autoCam(tm) : S.cam;
  const C = fObj.getWorldPosition(V3()).addScaledVector(A.clone().applyQuaternion(W.world.quaternion), len * .5);
  const Aw = A.clone().applyQuaternion(W.world.quaternion), Z = V3(0, 0, 1);
  let pos = V3(), look = V3(), up = V3(0, 1, 0), fov = CFG.camera.fov, fish = false;
  if (mode === 'onboard' && _stacked && FM.m.camAnchors.onboardStack) mode = 'onboardStack';
  const anchor = (name) => { const ca = FM.m.camAnchors[name]; if (!ca) return null; const stg = ca.stage === 'upper' ? FM.m.upper : FM.m.booster; if (!stg.parent.visible) return null; stg.updateMatrixWorld(true); const p = stg.localToWorld(ca.p.clone()); const outD = stg.localToWorld(V3(ca.p.x, ca.p.y, ca.p.z).setY(ca.p.y).multiplyScalar(1)).sub(stg.localToWorld(V3(0, ca.p.y, 0))).normalize(); const ax = V3(0, 1, 0).transformDirection(stg.matrixWorld); return { p, out: outD, ax }; };
  if (mode === 'onboard' || mode === 'onboardStack' || mode === 'booster' || mode === 'flap') {
    const an = anchor(mode);
    if (an) {
      const dir = mode === 'booster' ? an.ax.clone() : an.ax.clone().negate();
      pos.copy(an.p).addScaledVector(an.out, .3); look.copy(pos).addScaledVector(dir, 40).addScaledVector(an.out, mode === 'flap' ? 9 : 5);
      up.copy(an.out); fov = CFG.camera.onboardFov; fish = true;
      camState.init = false; applyCam(pos, look, up, fov, fish, true); camState.mode = mode; return;
    }
    mode = 'chase';
  }
  if (mode === 'ground') {
    const near = (x) => Math.abs(s.x - x) < 60e3;
    let frame = null;
    if (near(0) && (tm < 100 || P.catchMode)) frame = W.site;
    else if (P.landSite && near(P.landSite.userData.x)) frame = P.landSite;
    else if (P.shipSite && near(P.shipSite.userData.x)) frame = P.shipSite;
    if (frame) {
      frame.updateMatrixWorld(true);
      pos.copy(frame.localToWorld(V3(-650, 30, 1050)));
      const d = pos.distanceTo(C); fov = clamp(THREE.MathUtils.radToDeg(2 * Math.atan(len * 1.5 / d)), CFG.camera.groundFov[0], CFG.camera.groundFov[1]);
      up.copy(frame.localToWorld(V3(0, 1, 0)).sub(frame.localToWorld(V3()))).normalize();
      camState.init = false; applyCam(pos, C, up, fov, false, true); camState.mode = mode; return;
    }
    mode = 'chase';
  }
  if (mode === 'wide') {
    const want = clamp(CFG.camera.wide.base + s.h * CFG.camera.wide.perAlt, 600, CFG.camera.wide.max);
    camState.wideD = camState.mode === 'wide' ? lerp(camState.wideD, want, 1 - Math.exp(-dt * 1.5)) : want;
    const D = camState.wideD; pos.copy(C).addScaledVector(Z, D).add(V3(-D * .35, D * .3, 0)); look.copy(C); fov = 42;
    applyCam(pos, look, up, fov, false, camState.mode !== 'wide'); camState.mode = mode; return;
  }
  // chase
  const d = Math.max(len, R * 6) * CFG.camera.chase.dist;
  const off = V3().addScaledVector(Z, d).addScaledVector(Aw, CFG.camera.chase.up * d).add(V3(-CFG.camera.chase.side * d, 0, 0));
  if (camState.mode !== 'chase' || !camState.init) { camState.off.copy(off); camState.init = true; }
  else camState.off.lerp(off, 1 - Math.exp(-dt * CFG.camera.lag));
  pos.copy(C).add(camState.off); look.copy(C).addScaledVector(Aw, len * .1);
  applyCam(pos, look, up, fov, false, true); camState.mode = 'chase';
}
let _stacked = true;
function applyCam(pos, look, up, fov, fish, snap) {
  flyCam.position.copy(pos); flyCam.up.copy(up); flyCam.lookAt(look);
  if (flyCam.fov !== fov) { flyCam.fov = fov; flyCam.updateProjectionMatrix(); }
  if (shakeAmp > .003) { // subtle rotational jitter (sum of incommensurate sines), stronger on body-mounted cameras
    const t_ = performance.now() / 1000, a = shakeAmp * .0035 * (fov / 40) * (fish ? .8 : 1);
    flyCam.rotateX(a * (Math.sin(t_ * 37.1) * .6 + Math.sin(t_ * 61.7) * .4)); flyCam.rotateY(a * (Math.sin(t_ * 43.3 + 1) * .6 + Math.sin(t_ * 71.9) * .4)); flyCam.rotateZ(a * .5 * Math.sin(t_ * 29.3));
  }
  lensFor(fish);
}
function lensFor(fish) {
  const u = barrel.uniforms, hq = S.quality !== 'low';
  barrel.enabled = fish || hq; u.uK.value = fish ? CFG.camera.fisheye : 0;
  u.uVig.value = fish ? 1 : S.mode === 'mission' ? CFG.lens.vignette : .25; u.uCA.value = fish ? .006 : S.mode === 'mission' && S.quality === 'high' ? CFG.lens.ca : 0;
}

// ---------------- HUD (mission) ----------------
let lastScr = 0;
function hudUpdate(tm, fS, fObj, len, A) {
  $('#tplus').textContent = 'T+ ' + hms(tm);
  const cur = PT.set(tm);
  // latest event of any kind
  let ev = null; for (const e of P.evs) if (tm >= e.t) ev = e;
  $('#tsub').textContent = ev ? t('evd.' + ev.k) : t('evd.prelaunch');
  if (ev !== lastEv) {
    lastEv = ev; $('#pb-t').textContent = ev ? t('ev.' + ev.k) : t('ev.prelaunch'); $('#pb-s').textContent = ev ? 'T+ ' + hms(ev.t) : t('hud.ready');
    if (window.gsap && !RM && ev) gsap.fromTo('#phase-banner', { opacity: 0, y: -6 }, { opacity: 1, y: 0, duration: .5 });
  }
  const sNow = P.tracks[P.follow].at(tm, {});
  $('#v-spd').textContent = fmt(Math.max(0, sNow.v * 3.6), 0); $('#v-alt').textContent = fmt(Math.max(0, sNow.h / 1e3), sNow.h < 1e5 ? 2 : 1);
  GR.head(tm); $('#g-read').textContent = `${fmt(Math.max(0, sNow.h / 1e3), 1)} KM · T+${hms(tm)}`;
  // bracket on followed vehicle
  const ok = S.visible;
  if (ok) {
    const c = fObj.getWorldPosition(V3()), Aw = A.clone().applyQuaternion(W.world.quaternion), R = FM.m.radius;
    const right = V3(1, 0, 0).applyQuaternion(flyCam.quaternion);
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, vis = true; const Wd = innerWidth, Hd = $('#hud').clientHeight;
    for (const [ya, sx] of [[0, -1], [0, 1], [len, -1], [len, 1]]) {
      _v.copy(c).addScaledVector(Aw, ya).addScaledVector(right, sx * R).project(flyCam); if (_v.z > 1 || _v.z < -1) vis = false;
      const px = (_v.x * .5 + .5) * Wd, py = (-_v.y * .5 + .5) * Hd; x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
    }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hw = Math.max(14, (x1 - x0) / 2 + 8), hh = Math.max(14, (y1 - y0) / 2 + 8);
    vis = vis && cx > -50 && cx < Wd + 50 && cy > -50 && cy < Hd + 50 && hw < Wd * .45;
    const fish = barrel.uniforms.uK.value > 0;
    if (vis && !fish) {
      if (performance.now() - lastScr > 250) {
        lastScr = performance.now();
        const stg = P.follow === 'upper' ? (S.rocket === 'ss' ? 'stage.ship' : 'stage.upper') : (S.rocket === 'ss' ? 'stage.sh' : 'stage.booster');
        card('TRK · ' + (S.rocket === 'ss' ? 'SS' : 'F9'), t(tm < P.tSep ? 'stage.stack' : stg), [[t('tc.alt'), `${fmt(Math.max(0, sNow.h / 1e3), 2)} KM`], [t('tc.spd'), `${fmt(Math.max(0, sNow.v * 3.6), 0)} KM/H`], [t('tc.dr'), `${fmt(sNow.x / 1e3, 1)} KM`]], null);
      }
      bracket({ x0: cx - hw, y0: cy - hh, x1: cx + hw, y1: cy + hh }, null, true);
    } else bracket(null, null, false);
  }
}
function relabelMission() {
  if (!P) return;
  const ss = S.rocket === 'ss';
  $('#eng-lbl-a').textContent = t('hud.booster'); $('#eng-lbl-b').textContent = t(ss ? 'hud.ship' : 'hud.s2');
  PT?.relabel(); lastEv = undefined;
  $('#g-title').textContent = t('graph.alt');
  setPlayingLabel();
}
function setPlayingLabel() {
  const b = $('#m-play'), on = b.getAttribute('aria-pressed') === 'true', tot = (TM?.total || 1) - .01;
  const st = on ? 'pause' : proxy.r >= tot ? 'replay' : proxy.r > 0 ? 'resume' : 'play';
  b.querySelector('span').textContent = t('ctl.' + st); b.dataset.state = st;
  b.querySelector('use').setAttribute('href', `assets/icons.svg#i-${st === 'pause' ? 'pause' : st === 'replay' ? 'replay' : 'play'}`);
}

// =====================================================================
// CONTROLS / UI WIRING
// =====================================================================
function pressed(sel, on) { $$(sel).forEach(b => b.setAttribute('aria-pressed', b === on ? 'true' : 'false')); }
function segButtons(box, items, cur, onPick) {
  const el = $(box); el.textContent = '';
  items.forEach(([v, key]) => { const b = document.createElement('button'); b.type = 'button'; b.dataset.v = v; b.dataset.k = key; b.textContent = t(key); b.setAttribute('aria-pressed', v === cur); b.onclick = () => { $$(box + ' button').forEach(x => x.setAttribute('aria-pressed', x === b)); onPick(v); }; el.appendChild(b); });
}
function missionControls() {
  const k = S.rocket;
  segButtons('#scn-list', k === 'f9' ? [['booster', 'scn.f9.booster'], ['full', 'scn.f9.full']] : [['ship', 'scn.ss.ship'], ['booster', 'scn.ss.booster']], S.scn[k], v => { S.scn[k] = v; buildMission(); });
  segButtons('#opt-list', k === 'f9' ? [['asds', 'opt.asds'], ['rtls', 'opt.rtls']] : [['catch', 'opt.catch'], ['gulf', 'opt.gulf']], S.opt[k], v => { S.opt[k] = v; buildMission(); });
  $('#opt-legend').textContent = t(k === 'f9' ? 'ctl.landing' : 'ctl.boosterEnd');
  const cams = ['auto', 'chase', 'onboard', 'booster', ...(k === 'ss' ? ['flap'] : []), 'ground', 'wide'];
  if (!cams.includes(S.cam)) S.cam = 'auto';
  segButtons('#cam-list', cams.map(c => [c, 'cam.' + c]), S.cam, v => { S.cam = v; camState.init = false; });
}
function setRocket(k, first) {
  S.rocket = k; pressed('#seg-rocket button', $(`#seg-rocket [data-rocket=${k}]`));
  setAnatomyModel(k); missionControls();
  if (S.mode === 'mission' || !first) buildMission();
}
function setMode(md) {
  cardK = ''; closeMore();
  S.mode = md; $('#hud').dataset.mode = md; pressed('#seg-mode button', $(`#seg-mode [data-mode=${md}]`));
  if (md === 'mission') { if (!P || P.kind !== S.rocket) buildMission(); renderPass.scene = fly; renderPass.camera = flyCam; bloom.strength = CFG.bloom.strength; bloom.threshold = CFG.bloom.flightThreshold; bloom.enabled = S.quality !== 'low'; lensFor(false); if (!RM) setPlaying(true); }
  else { mtl?.pause(); setPlaying(false); renderPass.scene = ana; renderPass.camera = anaCam; bloom.strength = CFG.bloom.anatomy; bloom.threshold = CFG.bloom.threshold; bloom.enabled = S.quality !== 'low'; lensFor(false); bracket(null, null, false); }
  onResize();
}
function initControls() {
  $$('#seg-rocket button').forEach(b => b.onclick = () => setRocket(b.dataset.rocket));
  $$('#seg-mode button').forEach(b => b.onclick = () => setMode(b.dataset.mode));
  const ex = $('#explode'); ex.oninput = () => { S.explode = +ex.value; $('#explode-v').textContent = Math.round(S.explode * 100) + '%'; applyExplode(); };
  const tg = (id, key, fn) => { const b = $(id); b.setAttribute('aria-pressed', !!S[key]); b.onclick = () => { S[key] = !S[key]; b.setAttribute('aria-pressed', S[key]); fn(); }; };
  tg('#t-xray', 'xray', applyXray); tg('#t-cut', 'cut', applyCut); tg('#t-cg', 'cg', placeMarkers); tg('#t-rot', 'rot', () => controls.autoRotate = S.rot);
  $('#t-reset').onclick = () => { S.explode = 0; ex.value = 0; $('#explode-v').textContent = '0%'; S.xray = S.cut = S.cg = false; ['#t-xray', '#t-cut', '#t-cg'].forEach(i => $(i).setAttribute('aria-pressed', 'false')); applyExplode(); applyXray(); applyCut(); placeMarkers(); selectPart(null); frameAnatomy(false); };
  $('#m-play').onclick = () => setPlaying($('#m-play').getAttribute('aria-pressed') !== 'true');
  // settings popover (secondary controls, contextual by mode)
  const mb = $('#more-btn'), mp = $('#more-pop');
  const placeMore = () => { if (SMALLQ.matches) { mp.style.top = mp.style.left = ''; return; } const h = $('#hud').getBoundingClientRect(), r = mb.getBoundingClientRect(); mp.style.top = (r.bottom - h.top + 8) + 'px'; if (innerWidth > 820) mp.style.left = (r.left - h.left) + 'px'; else mp.style.left = ''; };
  mb.onclick = e => { e.stopPropagation(); const open = mp.hidden; mp.hidden = !open; mb.setAttribute('aria-expanded', open); $('#hud').classList.toggle('sheet-open', open); if (open) { placeMore(); $('#hud').classList.remove('pt-open'); } };
  $('#scrim').onclick = e => { e.stopPropagation(); closeMore(); if (SMALLQ.matches && S.sel) selectPart(null); };
  $('#more-x').onclick = e => { e.stopPropagation(); closeMore(); };
  $('#tc-x').onclick = e => { e.stopPropagation(); selectPart(null); };
  // phone strip: tap the T+ panel to open/close the phase track
  $('.panels.fl .wide').addEventListener('click', e => { if (!SMALLQ.matches || e.target.closest('.pn-node')) return; $('#hud').classList.toggle('pt-open'); });
  document.addEventListener('click', e => { if (!e.target.closest('.panels.fl .wide')) $('#hud').classList.remove('pt-open'); });
  // explode slider lives in the bottom sheet on phones
  const exq = $('label.explode-q'), exHome = exq.parentNode, exNext = exq.nextSibling, moveEx = () => { if (SMALLQ.matches) $('#ex-slot').appendChild(exq); else exHome.insertBefore(exq, exNext); };
  moveEx(); SMALLQ.addEventListener('change', () => { moveEx(); closeMore(); onResize(); });
  addEventListener('resize', () => { if (!mp.hidden) placeMore(); });
  document.addEventListener('click', e => { if (!mp.hidden && !e.target.closest('#more-pop, #more-btn')) closeMore(); });
  $('#m-speed').onchange = e => mtl?.timeScale(+e.target.value);
  const qs = $('#m-quality'); qs.value = S.qAuto ? 'auto' : S.quality;
  qs.onchange = () => { try { qs.value === 'auto' ? localStorage.removeItem('rocket.q') : localStorage.setItem('rocket.q', qs.value); } catch (e) {} const u = new URL(location.href); u.searchParams.delete('q'); location.replace(u.href); };
  $('#graph').addEventListener('click', e => { if (S.mode !== 'mission') return; const r = e.currentTarget.getBoundingClientRect(); seek((e.clientX - r.left) / r.width * P.tEnd); });
  // picking
  const gl = $('#gl'); let down = null;
  gl.addEventListener('pointermove', e => { if (e.pointerType === 'touch') return; pickPending = e; moveCross(e); });
  gl.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
  gl.addEventListener('pointerup', e => { if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 5) pick(e, true); down = null; });
  gl.addEventListener('pointerleave', () => { S.hover = null; if (S.mode === 'anatomy') highlight(); $('#cross').style.opacity = 0; });
  addEventListener('keydown', e => { if (e.key === 'Escape') { selectPart(null); closeLang(); closeMore(); } if (e.key === ' ' && S.mode === 'mission' && e.target === document.body) { e.preventDefault(); $('#m-play').click(); } });
  // language
  const lb = $('#lang-btn'), ll = $('#lang-list');
  lb.onclick = e => { e.stopPropagation(); const open = ll.hidden; ll.hidden = !open; lb.setAttribute('aria-expanded', open); if (open) ll.querySelector('[aria-selected=true]')?.focus?.(); };
  ll.querySelectorAll('li').forEach(li => { li.tabIndex = 0; li.onclick = () => { setLang(li.dataset.lang); closeLang(); }; li.onkeydown = e => { if (e.key === 'Enter') li.click(); }; });
  document.addEventListener('click', e => { if (!e.target.closest('.lang')) closeLang(); });
  // nav smooth scroll
  $$('.nav a, .skip, .logo').forEach(a => a.addEventListener('click', e => { const h = a.getAttribute('href'); if (!h?.startsWith('#') || RM || !window.ScrollToPlugin) return; e.preventDefault(); gsap.to(window, { scrollTo: h === '#top' ? 0 : h, duration: .9, ease: 'power3.inOut' }); }));
  // clock UTC+7
  const fmtC = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const fmtD = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  const tick = () => { const d = new Date(); $('#clock').textContent = fmtC.format(d); $('#foot-clock').textContent = fmtD.format(d); }; tick(); setInterval(tick, 1000);
}
function closeMore() { $('#more-pop').hidden = true; $('#more-btn').setAttribute('aria-expanded', 'false'); $('#hud').classList.remove('sheet-open'); }
function closeLang() { $('#lang-list').hidden = true; $('#lang-btn').setAttribute('aria-expanded', 'false'); }
function moveCross(e) { if (MOBILE) return; const c = $('#cross'), r = $('#hud').getBoundingClientRect(); c.style.opacity = 1; c.style.setProperty('--x', (e.clientX - r.left) + 'px'); c.style.setProperty('--y', (e.clientY - r.top) + 'px'); }
function relabel() {
  const l = getLang(); $('#lang-cur').textContent = l.toUpperCase();
  $$('#lang-list li').forEach(li => li.setAttribute('aria-selected', li.dataset.lang === l));
  buildPartList(); highlight(); anatomyPanels(); placeMarkers(); missionControls(); relabelMission();
}

// =====================================================================
// LOOP
// =====================================================================
let cardK = ''; const _m3 = new THREE.Matrix3();
let prev = performance.now(), fpsN = 0, fpsT = 0, lastMission = 0;
function onResize() {
  const hud = $('#hud'), w = hud.clientWidth, h = hud.clientHeight;
  renderer.setPixelRatio(pr()); renderer.setSize(w, h, false); composer.setPixelRatio(pr()); composer.setSize(w, h);
  anaCam.aspect = flyCam.aspect = w / h;
  // phones: the bottom dock + stats + part chips cover ~170px, so lift the anatomy view's optical centre
  if (SMALLQ.matches) anaCam.setViewOffset(w, h, 0, h > w ? 60 : 34, w, h); else anaCam.clearViewOffset();
  anaCam.updateProjectionMatrix(); flyCam.updateProjectionMatrix();
  barrel.uniforms.uAspect.value = w / h;
  if (anaModel && S.mode === 'anatomy') frameAnatomy(true);
}
function frame(now) {
  const dt = Math.min(.05, (now - prev) / 1000); prev = now;
  if (S.mode === 'anatomy') {
    controls.update(dt);
    if (pickPending) { pick(pickPending, false); pickPending = null; }
    if (S.cut) { const d = anaCam.position.clone().sub(controls.target); d.y = 0; d.normalize(); cutPlane.normal.copy(d).negate(); cutPlane.constant = 0; }
    const k = S.sel || S.hover;
    if (k && S.visible) { const r = screenRect(anaModel.parts[k].group, anaCam); if (r) { if (cardK !== k + getLang()) { cardK = k + getLang(); partCard(k); } bracket(r, null, true); } else bracket(null, null, false); } else bracket(null, null, false);
    updateMarkers();
  } else if (P) {
    const tm = TM.toMission(proxy.r), dtM = tm - lastMission; lastMission = tm;
    flightUpdate(tm, dt, Math.abs(dtM) > 30 ? 0 : Math.max(0, dtM), now / 1000);
  }
  composer.render(dt);
  fpsN++; fpsT += dt; if (fpsT > .5) { $('#fps').textContent = Math.round(fpsN / fpsT); fpsN = 0; fpsT = 0; }
  perfWatch(now);
}
// adaptive quality: when the tier was auto-detected and the real frame rate stays low, step down (high -> mid -> low) live
const PW = { t0: 0, n: 0, bad: 0, done: false };
function perfWatch(now) {
  if (!S.qAuto || PW.done || document.visibilityState !== 'visible' || !S.visible) { PW.t0 = 0; return; }
  if (!PW.t0) { PW.t0 = now; PW.n = 0; return; }
  PW.n++; const el = now - PW.t0; if (el < 3000) return;
  const fps = PW.n * 1000 / el; PW.t0 = now; PW.n = 0;
  if (fps >= 30) { PW.bad = 0; return; }
  if (++PW.bad < 2 || S.quality === 'low') { if (S.quality === 'low') PW.done = true; return; }
  PW.bad = 0; S.quality = S.quality === 'high' ? 'mid' : 'low';
  renderer.shadowMap.enabled = false; sun.castShadow = false; fly.traverse(n => { if (n.material) n.material.needsUpdate = true; });
  bloom.enabled = S.quality !== 'low'; lensFor(barrel.uniforms.uK.value > 0); onResize(); toast(t('toast.lowq'));
}
function toast(msg) { const el = $('#toast'); if (!el) return; el.textContent = msg; el.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => { el.hidden = true; }, 4200); }
function loop(now) { requestAnimationFrame(loop); if (!S.visible && document.visibilityState === 'visible') { prev = now; return; } frame(now); }

// intro reveal
function intro() {
  if (S.mode === 'mission' && mtl) { mtl.restart(); FM.parts.clear(); splashDone = {}; setPlaying(!RM); }
  if (S.quality === 'high') setTimeout(() => upgradeEarthTextures(W, renderer).catch(() => {}), 2500); // lazy 4K globe
  if (RM || !window.gsap) return;
  gsap.from('.hud-top > *', { opacity: 0, y: -10, stagger: .08, duration: .6, ease: 'power3.out' });
  gsap.from('.hud-left > *:not([style*="none"])', { opacity: 0, x: -14, stagger: .05, duration: .5, delay: .15, ease: 'power3.out' });
  gsap.from('.hud-right, .hud-play', { opacity: 0, x: 14, duration: .6, delay: .25, ease: 'power3.out' });
  gsap.from('.hud-bottom .graph, .hud-bottom .pn', { opacity: 0, y: 16, stagger: .06, duration: .6, delay: .3, ease: 'power3.out' });
  gsap.from(anaCam.position, { x: anaCam.position.x * 1.6, y: anaCam.position.y + anaModel.height * .4, z: anaCam.position.z * 1.6, duration: 1.8, ease: 'power3.out' });
  anatomyPanels();
}

// lens: barrel (onboard fisheye only) + chromatic aberration + vignette + faint film grain
const LensShader = {
  uniforms: { tDiffuse: { value: null }, uK: { value: 0 }, uAspect: { value: 1.6 }, uCA: { value: 0 }, uVig: { value: .3 }, uT: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uK,uAspect,uCA,uVig; varying vec2 vUv;
    vec2 warp(vec2 uv,float k){ if(k<=0.) return uv; vec2 c=uv*2.-1.; vec2 a=vec2(c.x*uAspect,c.y); float r2=dot(a,a)/(1.+uAspect*uAspect); c*= (1.+k*r2)/(1.+k); return c*.5+.5; }
    void main(){ vec2 u0=warp(vUv,uK);
      if(u0.x<0.||u0.x>1.||u0.y<0.||u0.y>1.){ gl_FragColor=vec4(0.,0.,0.,1.); return; }
      vec2 d0=u0-.5; float r2=dot(d0,d0); vec2 off=d0*uCA*(1.+r2*4.);
      vec3 c=vec3(texture2D(tDiffuse,u0+off).r,texture2D(tDiffuse,u0).g,texture2D(tDiffuse,u0-off).b);
      vec2 d=vUv-.5; float v=smoothstep(.85,.35,length(d*vec2(uAspect*.8,1.))); gl_FragColor=vec4(c*mix(1.-uVig*.75,1.,v),1.); }`
};

boot().catch(e => { console.error(e); const l = $('#ld-log'); if (l) l.insertAdjacentHTML('beforeend', '<li>ERROR: ' + (e?.message || e) + '</li>'); });

// Procedural 3D models: Falcon 9-style (Block 5) and Starship-style (Block 2, Flight 11 era).
// Units: metres. Each stage group has its origin at its own base; +y = up. Windward (tile) side of Ship = +x.
import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;

// ---------- procedural textures ----------
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }

export function makeHexTextures(size = 512, cell = 24) {
  // pointy-top hex grid; returns colour + normal maps (tileable)
  const [c, g] = canvas(size, size), [cn, gn] = canvas(size, size);
  const col = g.createImageData(size, size), nor = gn.createImageData(size, size);
  const w = Math.sqrt(3) * cell / 2; // half-width
  const rowH = cell * 1.5;
  const rnd = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    // nearest hex centre by checking candidate rows
    let best = 1e9, bx = 0, by = 0, bi = 0, bj = 0;
    const r0 = Math.floor(y / rowH);
    for (let r = r0 - 1; r <= r0 + 1; r++) {
      const off = (r & 1) ? w : 0;
      const c0 = Math.floor((x - off) / (2 * w));
      for (let q = c0 - 1; q <= c0 + 1; q++) {
        const cx = q * 2 * w + off + w, cy = r * rowH + cell;
        const d = (x - cx) ** 2 + (y - cy) ** 2;
        if (d < best) { best = d; bx = cx; by = cy; bi = q; bj = r; }
      }
    }
    const dx = x - bx, dy = y - by;
    // hex distance (pointy-top): max of projections onto 3 axes
    const a = Math.abs(dx), b = Math.abs(dx * 0.5 + dy * 0.866), cc = Math.abs(dx * 0.5 - dy * 0.866);
    const hd = Math.max(a, b, cc) / w; // 0 centre .. 1 edge
    const k = (y * size + x) * 4;
    const v = rnd(bi, bj);
    const gap = hd > 0.93;
    const base = gap ? 6 : 18 + v * 14 + (v > 0.97 ? 20 : 0);
    col.data[k] = col.data[k + 1] = col.data[k + 2] = base; col.data[k + 3] = 255;
    // bevel normal near edges
    const e = Math.max(0, (hd - 0.72) / 0.21);
    let nx = 0, ny = 0;
    if (!gap && e > 0) { const l = Math.hypot(dx, dy) || 1; nx = dx / l * e * 0.6; ny = dy / l * e * 0.6; }
    nor.data[k] = 128 + nx * 127; nor.data[k + 1] = 128 - ny * 127; nor.data[k + 2] = 255; nor.data[k + 3] = 255;
  }
  g.putImageData(col, 0, 0); gn.putImageData(nor, 0, 0);
  const t1 = new THREE.CanvasTexture(c), t2 = new THREE.CanvasTexture(cn);
  t1.colorSpace = THREE.SRGBColorSpace;
  for (const t of [t1, t2]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; }
  return { map: t1, normalMap: t2 };
}

function steelTexture(rings) {
  // 304L stainless: horizontal brushing, ring welds + staggered vertical panel seams, faint heat tint (straw/blue) near weld lines
  const W = 512, H = 2048, [c, g] = canvas(W, H);
  g.fillStyle = '#c3c7cb'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 2600; i++) { const l = Math.random() < .5; g.fillStyle = `rgba(${l ? '255,255,255' : '70,74,80'},${Math.random() * .06})`; g.fillRect(Math.random() * W, Math.random() * H, 20 + Math.random() * 160, 1); }
  for (let i = 0; i < 40; i++) { const y = Math.random() * H, h = 20 + Math.random() * 120; g.fillStyle = `rgba(${Math.random() < .5 ? '255,255,255' : '90,95,100'},${Math.random() * .05})`; g.fillRect(0, y, W, h); } // panel-to-panel sheen variation
  const ph = H / rings;
  for (let i = 0; i <= rings; i++) {
    const y = i * ph;
    const tint = g.createLinearGradient(0, y - 9, 0, y + 9); tint.addColorStop(0, 'rgba(0,0,0,0)'); tint.addColorStop(.3, 'rgba(176,140,80,.14)'); tint.addColorStop(.5, 'rgba(70,80,120,.18)'); tint.addColorStop(.7, 'rgba(176,140,80,.14)'); tint.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = tint; g.fillRect(0, y - 9, W, 18);
    g.fillStyle = 'rgba(60,62,68,.6)'; g.fillRect(0, y - 1, W, 2);
    const off = (i % 2) * W / 6; g.fillStyle = 'rgba(70,72,78,.4)';
    for (let k = 0; k < 3; k++) g.fillRect((off + k * W / 3) % W, y, 2, ph);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}
function steelRough(rings) {
  // roughness: brushed streaks + per-panel variation (polished vs dull sheets), rougher heat-tinted welds
  const W = 256, H = 1024, [c, g] = canvas(W, H);
  g.fillStyle = 'rgb(150,150,150)'; g.fillRect(0, 0, W, H);
  const ph = H / rings;
  for (let i = 0; i < rings; i++) for (let k = 0; k < 3; k++) { const v = 142 + Math.random() * 16; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(((i % 2) * W / 6 + k * W / 3) % W, i * ph, W / 3, ph); if (k === 2) g.fillRect(0, i * ph, ((i % 2) * W / 6 + k * W / 3 + W / 3) % W, ph); }
  for (let i = 0; i < 2200; i++) { const v = Math.random() < .5 ? 255 : 0; g.fillStyle = `rgba(${v},${v},${v},${Math.random() * .08})`; g.fillRect(Math.random() * W, Math.random() * H, 10 + Math.random() * 90, 1); }
  for (let i = 0; i <= rings; i++) { g.fillStyle = 'rgba(210,210,210,.7)'; g.fillRect(0, i * ph - 2, W, 4); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}

function sootTexture() {
  // flown Falcon 9 booster: white with kerosene soot rising from the base in streaks (heavier on the downwind side)
  const W = 512, H = 1024, [c, g] = canvas(W, H);
  g.fillStyle = '#f2f2f0'; g.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += 2) {
    const side = .55 + .45 * Math.cos((x / W) * Math.PI * 2);
    const h = H * (.28 + .58 * side * (.5 + .5 * Math.random()) * (.6 + .4 * Math.sin(x * .05)));
    const gr = g.createLinearGradient(0, H, 0, H - h);
    gr.addColorStop(0, `rgba(26,23,20,${.97 * (.7 + .3 * side)})`); gr.addColorStop(.3, `rgba(48,43,38,${.8 * (.4 + .6 * side)})`); gr.addColorStop(.65, `rgba(90,82,74,${.4 * side})`); gr.addColorStop(1, 'rgba(120,112,104,0)');
    g.fillStyle = gr; g.fillRect(x, H - h, 2, h);
  }
  for (let i = 0; i < 700; i++) { const x = Math.random() * W, y = H * (.3 + .7 * Math.random()); g.fillStyle = `rgba(36,32,28,${Math.random() * .18})`; g.fillRect(x, y, 1 + Math.random() * 3, 10 + Math.random() * 160); }
  const bg = g.createLinearGradient(0, H, 0, H * .86); bg.addColorStop(0, 'rgba(18,16,14,.95)'); bg.addColorStop(1, 'rgba(18,16,14,0)'); g.fillStyle = bg; g.fillRect(0, H * .86, W, H * .14);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}

// ---------- materials ----------
function sootRough(map) { // soot is matte, clean paint semi-gloss: derive from the colour canvas
  const src = map.image, W = 128, H = 256, [c, g] = canvas(W, H); g.drawImage(src, 0, 0, W, H);
  const d = g.getImageData(0, 0, W, H); for (let i = 0; i < d.data.length; i += 4) { const l = d.data[i] / 255, v = 255 * (.38 + .5 * (1 - l)); d.data[i] = d.data[i + 1] = d.data[i + 2] = v; } g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; return t;
}
function mats() {
  return {
    white: () => new THREE.MeshPhysicalMaterial({ color: 0xf2f2f0, roughness: .42, metalness: 0, clearcoat: .3, clearcoatRoughness: .5 }),
    black: () => new THREE.MeshStandardMaterial({ color: 0x141416, roughness: .62, metalness: .1 }),
    alu: () => new THREE.MeshStandardMaterial({ color: 0xa8abb0, roughness: .38, metalness: .9 }),
    ti: () => new THREE.MeshPhysicalMaterial({ color: 0x6b665f, roughness: .48, metalness: 1, anisotropy: .4, sheen: .2, sheenColor: 0x6a5a80 }), // cast/machined titanium, faint heat tint
    bell: () => new THREE.MeshStandardMaterial({ color: 0x3a3836, roughness: .38, metalness: .85, side: THREE.DoubleSide }),
    nb: () => new THREE.MeshStandardMaterial({ color: 0x2b2826, roughness: .32, metalness: .9, side: THREE.DoubleSide }),
    copper: () => new THREE.MeshStandardMaterial({ color: 0x9a5a34, roughness: .35, metalness: 1 }),
    gold: () => new THREE.MeshStandardMaterial({ color: 0xc9a24a, roughness: .3, metalness: 1 }),
    lox: () => new THREE.MeshStandardMaterial({ color: 0x5fa8ff, roughness: .2, transparent: true, opacity: .55, emissive: 0x0a2a55 }),
    fuel: () => new THREE.MeshStandardMaterial({ color: 0xff7a2f, roughness: .2, transparent: true, opacity: .55, emissive: 0x401400 }),
    dark: () => new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: .8 })
  };
}

// ---------- geometry helpers ----------
function lathe(profile, seg = 48, phiStart = 0, phiLen = TAU) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0001), y)), seg, phiStart, phiLen);
}
function bellGeo(rt, re, h, seg = 28) {
  const pts = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push([rt + (re - rt) * Math.pow(t, .62), h * (1 - t)]); }
  return lathe(pts, seg); // y from h (throat) down to 0 (exit)
}
function ogive(r, L, y0, n = 18, rTip = 0.05) {
  const pts = [], rho = (r * r + L * L) / (2 * r);
  for (let i = 0; i <= n; i++) { const x = L * i / n; const rr = Math.sqrt(rho * rho - (L - x) ** 2) + r - rho; pts.push([Math.max(rTip, rr), y0 + L - x]); }
  return pts.reverse(); // from base (r) to tip
}

// part registry
class Builder {
  constructor() { this.parts = {}; this.order = []; }
  part(key, stage, opts = {}) {
    if (!this.parts[key]) {
      const g = new THREE.Group(); g.name = key; stage.add(g);
      this.parts[key] = { key, group: g, stage, meshes: [], explode: opts.explode || V(0, 0, 0), mass: opts.mass || 0, prop: opts.prop || [], dims: opts.dims || '', cg: opts.cg ?? null };
      this.order.push(key);
    }
    return this.parts[key];
  }
  mesh(key, geo, mat, { internal = false, pos, rot, scale } = {}) {
    const p = this.parts[key], m = new THREE.Mesh(geo, mat);
    if (pos) m.position.copy(pos); if (rot) m.rotation.set(rot.x, rot.y, rot.z); if (scale) m.scale.copy(scale);
    m.userData.part = key; m.userData.internal = internal; m.castShadow = m.receiveShadow = !internal;
    if (internal) m.visible = false;
    p.group.add(m); p.meshes.push(m); return m;
  }
}

function addBell(B, key, parent, x, z, y, rt, re, h, mat, head = true, M) {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
  const bm = new THREE.Mesh(bellGeo(rt, re, h), mat); bm.userData.part = key; g.add(bm); B.parts[key].meshes.push(bm);
  if (head) {
    const hm = new THREE.Mesh(new THREE.CylinderGeometry(rt * 1.5, rt * 1.1, h * .55, 14), M);
    hm.position.y = h + h * .27; hm.userData.part = key; g.add(hm); B.parts[key].meshes.push(hm);
  }
  return g;
}

function gridFin(B, key, parent, w, h, M) {
  // panel: w along x, h along y, cell depth d along z
  const g = new THREE.Group(); parent.add(g);
  const t = 0.07, d = 0.45, n = 6, add = (a, b, x, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(a, b, d), M); m.position.set(x, y, 0); m.userData.part = key; g.add(m); B.parts[key].meshes.push(m); };
  add(w, t, 0, h / 2); add(w, t, 0, -h / 2); add(t, h, w / 2, 0); add(t, h, -w / 2, 0);
  for (let i = 1; i < n; i++) { add(w, .035, 0, (i / n - .5) * h); add(.035, h, (i / n - .5) * w, 0); }
  return g;
}

// =====================================================================
// FALCON 9-style
// =====================================================================
export function buildFalcon9({ payload = 'fairing', payloadMass = 15000 } = {}) {
  const M = mats(), B = new Builder();
  const root = new THREE.Group(), booster = new THREE.Group(), upper = new THREE.Group();
  root.add(booster, upper); booster.name = 'booster'; upper.name = 'upper';
  const R = 1.85, UPPER_Y = 42.6;
  upper.position.y = UPPER_Y;

  // --- Merlin 1D x9 + octaweb
  B.part('merlin', booster, { explode: V(0, -9, 0), mass: 5400, dims: '9 × Merlin 1D · Ø0.92 m', cg: 1.6 });
  const mBell = M.bell(), mHead = M.alu();
  const engPos = [[0, 0]]; for (let i = 0; i < 8; i++) engPos.push([Math.cos(i / 8 * TAU) * 1.22, Math.sin(i / 8 * TAU) * 1.22]);
  const enginesB = [];
  engPos.forEach(([x, z]) => { addBell(B, 'merlin', B.parts.merlin.group, x, z, 0.2, 0.17, 0.42, 1.25, mBell, true, mHead); enginesB.push({ p: V(x, 0.2, z), r: 0.42 }); });
  B.mesh('merlin', new THREE.CylinderGeometry(R, R, 0.35, 48), M.dark(), { pos: V(0, 2.05, 0) }); // octaweb heat shield
  B.mesh('merlin', new THREE.CylinderGeometry(R, R * 1.0, 1.0, 48, 1, true), M.black(), { pos: V(0, 2.6, 0) });

  // --- legs (4), pivot at base
  B.part('legs', booster, { explode: V(0, -3, 0), mass: 2000, dims: '4 × ~9.5 m · Ø18 m', cg: 7 });
  const legs = [];
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * TAU + TAU / 8, pv = new THREE.Group();
    pv.position.set(Math.cos(a) * (R + 0.12), 2.3, Math.sin(a) * (R + 0.12)); pv.rotation.y = -a;
    B.parts.legs.group.add(pv);
    const arm = new THREE.Group(); pv.add(arm);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 9.6, 1.1), M.black()); leg.position.y = 4.8; leg.userData.part = 'legs'; arm.add(leg); B.parts.legs.meshes.push(leg);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 1.2), M.alu()); foot.position.y = 9.4; foot.userData.part = 'legs'; arm.add(foot); B.parts.legs.meshes.push(foot);
    legs.push(arm);
  }

  // --- S1 tank (RP-1 lower, LOX upper)
  B.part('s1tank', booster, { explode: V(0, 0, 0), mass: 14800, prop: [[123500, 11], [287500, 31]], dims: 'Ø3.7 m · ~39.6 m', cg: 23 });
  const s1m = M.white(); s1m.map = sootTexture(); s1m.roughnessMap = sootRough(s1m.map); s1m.roughness = 1; s1m.clearcoat = .15;
  B.mesh('s1tank', new THREE.CylinderGeometry(R, R, 39.6, 64, 1, true), s1m, { pos: V(0, 3.1 + 19.8, 0) });
  B.mesh('s1tank', new THREE.CylinderGeometry(R * .985, R * .985, 15.5, 32), M.fuel(), { internal: true, pos: V(0, 3.4 + 7.75, 0) });
  B.mesh('s1tank', new THREE.CylinderGeometry(R * .985, R * .985, 22.6, 32), M.lox(), { internal: true, pos: V(0, 19.5 + 11.3, 0) });
  B.mesh('s1tank', new THREE.SphereGeometry(R * .99, 32, 12, 0, TAU, 0, Math.PI / 2), M.alu(), { internal: true, pos: V(0, 19.2, 0), scale: V(1, .45, 1) });
  B.mesh('s1tank', new THREE.CylinderGeometry(.25, .25, 16, 12), M.alu(), { internal: true, pos: V(0, 11.2, 0) }); // LOX transfer tube
  // raceway
  B.mesh('s1tank', new THREE.BoxGeometry(.18, 37, .35), M.white(), { pos: V(0, 22, R + .08) });

  // --- interstage (+ grid fins)
  B.part('interstage', booster, { explode: V(0, 4, 0), mass: 2000, dims: 'Ø3.7 m · ~6.4 m · CFRP', cg: 45.8 });
  B.mesh('interstage', new THREE.CylinderGeometry(R, R, 6.4, 64, 1, true), new THREE.MeshPhysicalMaterial({ color: 0x111113, roughness: .55, metalness: 0, clearcoat: .5, clearcoatRoughness: .35 }), { pos: V(0, 42.7 + 3.2, 0) });
  B.mesh('interstage', new THREE.CylinderGeometry(R * .99, R * .99, .2, 48), M.alu(), { pos: V(0, 42.75, 0) });
  for (let i = 0; i < 4; i++) { const a = i / 4 * TAU; B.mesh('interstage', new THREE.CylinderGeometry(.08, .08, 1.2, 8), M.alu(), { internal: true, pos: V(Math.cos(a) * 1.2, 43.4, Math.sin(a) * 1.2) }); } // pushers

  B.part('gridfins', booster, { explode: V(0, 6, 0), mass: 1400, dims: '4 × 1.2 × 1.5 m · Ti', cg: 46.6 });
  const gridfins = [];
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * TAU, pv = new THREE.Group();
    pv.position.set(Math.cos(a) * (R + .05), 47.6, Math.sin(a) * (R + .05)); pv.rotation.y = -a;
    B.parts.gridfins.group.add(pv);
    const hinge = new THREE.Group(); pv.add(hinge);
    const f = gridFin(B, 'gridfins', hinge, 1.5, 1.2, M.ti()); f.rotation.x = Math.PI / 2; f.position.x = 0.8;
    hinge.rotation.z = Math.PI / 2; gridfins.push(hinge);
  }

  // --- upper stage
  B.part('mvac', upper, { explode: V(0, -2.5, 0), mass: 600, dims: 'Merlin Vacuum · Ø3.3 m', cg: 3.4 });
  addBell(B, 'mvac', B.parts.mvac.group, 0, 0, 1.5, 0.22, 1.5, 4.0, M.nb(), true, M.alu());
  B.mesh('mvac', new THREE.CylinderGeometry(.24, .24, 1.6, 12), M.copper(), { pos: V(0, 5.6, 0) });
  const enginesU = [{ p: V(0, 1.5, 0), r: 1.5, vac: true }];

  B.part('s2tank', upper, { explode: V(0, 3, 0), mass: 3400, prop: [[32000, 8.4], [75500, 11.4]], dims: 'Ø3.7 m · ~9 m', cg: 10.8 });
  B.mesh('s2tank', new THREE.CylinderGeometry(R, R, 9.0, 64, 1, true), M.white(), { pos: V(0, 6.2 + 4.5, 0) });
  B.mesh('s2tank', new THREE.CylinderGeometry(R, R, .3, 48), M.dark(), { pos: V(0, 6.3, 0) });
  B.mesh('s2tank', new THREE.CylinderGeometry(R * .98, R * .98, 3.4, 32), M.fuel(), { internal: true, pos: V(0, 6.6 + 1.7, 0) });
  B.mesh('s2tank', new THREE.CylinderGeometry(R * .98, R * .98, 5.0, 32), M.lox(), { internal: true, pos: V(0, 10.2 + 2.5, 0) });
  B.mesh('s2tank', new THREE.CylinderGeometry(R, R, .25, 48), M.black(), { pos: V(0, 15.2, 0) });

  // payload: satellite stack or capsule
  let fairing = null, capsule = null;
  if (payload === 'dragon') {
    B.part('capsule', upper, { explode: V(0, 8, 0), mass: 12500, dims: 'Ø3.7 m · 8.1 m (trunk + capsule)', cg: 19.5 });
    const trunk = M.white(); B.mesh('capsule', new THREE.CylinderGeometry(R, R, 3.7, 48, 1, true), trunk, { pos: V(0, 15.3 + 1.85, 0) });
    const sol = new THREE.MeshStandardMaterial({ color: 0x14204a, roughness: .25, metalness: .6, emissive: 0x050a20 });
    B.mesh('capsule', new THREE.CylinderGeometry(R + .01, R + .01, 2.2, 48, 1, true, 0, Math.PI), sol, { pos: V(0, 16.6, 0) });
    B.mesh('capsule', lathe([[R * .98, 0], [R * .98, .4], [1.55, 2.4], [0.75, 3.7], [0.6, 3.9], [0.01, 4.0]]), M.white(), { pos: V(0, 19.0, 0) });
    B.mesh('capsule', new THREE.SphereGeometry(.6, 24, 10, 0, TAU, 0, Math.PI / 2), M.white(), { pos: V(0, 22.85, 0), scale: V(1, .55, 1) });
    for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + .4; B.mesh('capsule', new THREE.BoxGeometry(.5, .6, .05), M.dark(), { pos: V(Math.cos(a) * 1.25, 21.8, Math.sin(a) * 1.25), rot: V(0, -a + Math.PI / 2, -.35) }); }
    capsule = B.parts.capsule.group;
  } else {
    B.part('payload', upper, { explode: V(5, 6, 0), mass: payloadMass, dims: payloadMass >= 1000 ? `${(payloadMass / 1000).toFixed(1)} t · Ø~4.6 m` : '', cg: 19.5 });
    B.mesh('payload', new THREE.CylinderGeometry(1.0, R * .95, 1.0, 32), M.alu(), { pos: V(0, 15.8, 0) });
    for (let i = 0; i < 9; i++) B.mesh('payload', new THREE.BoxGeometry(2.6, .32, 1.4), i % 2 ? M.gold() : M.alu(), { pos: V(0, 16.5 + i * .4, 0), rot: V(0, i * .35, 0) });
    B.part('fairing', upper, { explode: V(0, 4, 0), mass: 1900, dims: 'Ø5.2 m · 13.1 m · CFRP', cg: 21.5 });
    const prof = [[R, 14.4], [2.6, 15.8], [2.6, 21.6], ...ogive(2.6, 5.8, 21.6).slice(1)];
    const halves = [];
    for (let s = 0; s < 2; s++) {
      const g = new THREE.Group(); B.parts.fairing.group.add(g);
      const m = new THREE.Mesh(lathe(prof, 48, s * Math.PI, Math.PI), M.white()); m.userData.part = 'fairing'; m.castShadow = true; g.add(m); B.parts.fairing.meshes.push(m);
      halves.push(g);
    }
    fairing = halves;
  }
  const pm = payload === 'dragon' ? 12500 : payloadMass;
  return finalize(B, { root, booster, upper, upperY: UPPER_Y, height: payload === 'dragon' ? UPPER_Y + 23.2 : 70, radius: R,
    enginesB, enginesU, legs, gridfins, fairing, capsule, payloadMass: pm, kind: 'f9',
    stageTopB: 49, // booster top (interstage)
    camAnchors: { onboard: { stage: 'upper', p: V(Math.SQRT1_2 * (R + .25), 6.5, Math.SQRT1_2 * (R + .25)) }, onboardStack: { stage: 'booster', p: V(Math.SQRT1_2 * (R + .3), 49.6, Math.SQRT1_2 * (R + .3)) }, booster: { stage: 'booster', p: V(Math.SQRT1_2 * (R + .3), 44.6, -Math.SQRT1_2 * (R + .3)) } } });
}

// =====================================================================
// STARSHIP-style (Super Heavy + Ship)
// =====================================================================
export function buildStarship({ hex } = {}) {
  const M = mats(), B = new Builder();
  const root = new THREE.Group(), booster = new THREE.Group(), upper = new THREE.Group();
  root.add(booster, upper); booster.name = 'booster'; upper.name = 'upper';
  const R = 4.5, UPPER_Y = 71.0;
  upper.position.y = UPPER_Y;
  const steelB = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: .95, roughness: .62, anisotropy: .55, anisotropyRotation: 0, envMapIntensity: 1.4 }); steelB.map = steelTexture(36); steelB.map.repeat.set(4, 1); steelB.roughnessMap = steelRough(36); steelB.roughnessMap.repeat.set(4, 1);

  // --- 33 Raptors: 3 inner (gimbal), 10 middle (gimbal), 20 outer (fixed)
  B.part('raptors', booster, { explode: V(0, -12, 0), mass: 53800, dims: '33 × Raptor 2 · Ø1.3 m', cg: 2.2 });
  const enginesB = [], rings = [[3, 0.95, 0], [10, 2.5, .3], [20, 3.85, 0]];
  const bm = M.bell(), hm = M.alu();
  rings.forEach(([n, r, off], ri) => { for (let i = 0; i < n; i++) { const a = (i + off) / n * TAU + .3; const x = Math.cos(a) * r, z = Math.sin(a) * r; addBell(B, 'raptors', B.parts.raptors.group, x, z, 0.4, .22, ri === 2 ? .6 : .64, 1.6, bm, true, hm); enginesB.push({ p: V(x, 0.4, z), r: .64, ring: ri }); } });
  B.mesh('raptors', new THREE.CylinderGeometry(R * .98, R * .98, .25, 64), M.dark(), { pos: V(0, 3.3, 0) });
  B.mesh('raptors', new THREE.CylinderGeometry(R, R, 4.2, 72, 1, true), steelB, { pos: V(0, 2.1 + .4, 0) }); // aft skirt
  // chines (aft)
  for (const s of [1, -1]) B.mesh('raptors', new THREE.BoxGeometry(.25, 7, .7), steelB, { pos: V(0, 4.5, s * (R + .3)) });

  // --- tanks (LOX lower, CH4 upper, common dome), stainless 3.97 mm
  B.part('shTank', booster, { explode: V(0, 0, 0), mass: 200200, prop: [[2650000, 25], [750000, 57]], dims: 'Ø9 m · ~65 m · 304L', cg: 33 });
  B.mesh('shTank', new THREE.CylinderGeometry(R, R, 64.8, 96, 1, true), steelB, { pos: V(0, 4.6 + 32.4, 0) });
  B.mesh('shTank', new THREE.CylinderGeometry(R * .99, R * .99, 41.6, 40), M.lox(), { internal: true, pos: V(0, 4.8 + 20.8, 0) });
  B.mesh('shTank', new THREE.CylinderGeometry(R * .99, R * .99, 22, 40), M.fuel(), { internal: true, pos: V(0, 46.8 + 11, 0) });
  B.mesh('shTank', new THREE.SphereGeometry(R * .99, 40, 12, 0, TAU, 0, Math.PI / 2), M.alu(), { internal: true, pos: V(0, 46.4, 0), scale: V(1, .4, 1) });
  B.mesh('shTank', new THREE.CylinderGeometry(.9, .9, 42, 16), M.alu(), { internal: true, pos: V(0, 25.6, 0) }); // CH4 downcomer
  // raceways & chines
  B.mesh('shTank', new THREE.BoxGeometry(.5, 60, .5), steelB, { pos: V(0, 36, -(R + .2)) });
  // top dome
  B.mesh('shTank', new THREE.SphereGeometry(R * .99, 48, 12, 0, TAU, 0, Math.PI / 2), M.alu(), { pos: V(0, 69.0, 0), scale: V(1, .25, 1) });
  // catch pins
  for (const s of [1, -1]) B.mesh('shTank', new THREE.BoxGeometry(.8, .6, 1.4), M.dark(), { pos: V(s * (R + .5), 66.2, 0) });

  // --- grid fins (4, Block 2)
  B.part('gridfinsSH', booster, { explode: V(0, 5, 0), mass: 12000, dims: '4 × ~3.4 × 4 m', cg: 64.6 });
  const gridfins = [];
  [Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4].forEach(a => {
    const pv = new THREE.Group(); pv.position.set(Math.cos(a) * (R + .1), 64.6, Math.sin(a) * (R + .1)); pv.rotation.y = -a; B.parts.gridfinsSH.group.add(pv);
    const f = gridFin(B, 'gridfinsSH', pv, 3.6, 3.2, M.alu()); f.rotation.x = Math.PI / 2; f.position.x = 1.9; gridfins.push(pv);
  });

  // --- hot-staging ring (vented interstage), jettisoned after boostback
  B.part('hotRing', booster, { explode: V(0, 9, 0), mass: 9000, dims: 'Ø9 m · ~1.8 m', cg: 70.1 });
  const hotRing = B.parts.hotRing.group;
  B.mesh('hotRing', new THREE.CylinderGeometry(R, R, .3, 72, 1, true), steelB, { pos: V(0, 69.35, 0) });
  B.mesh('hotRing', new THREE.CylinderGeometry(R, R, .3, 72, 1, true), steelB, { pos: V(0, 70.85, 0) });
  for (let i = 0; i < 36; i++) { const a = i / 36 * TAU; B.mesh('hotRing', new THREE.BoxGeometry(.32, 1.25, .1), M.alu(), { pos: V(Math.cos(a) * R, 70.1, Math.sin(a) * R), rot: V(0, -a + Math.PI / 2, 0) }); }
  B.mesh('hotRing', new THREE.CylinderGeometry(R * .9, R * .9, .1, 48), M.dark(), { pos: V(0, 70.9, 0) }); // shield plate

  // ===== Ship =====
  const steelS = steelB.clone(); steelS.map = steelTexture(28); steelS.map.repeat.set(4, 1); steelS.roughnessMap = steelRough(28); steelS.roughnessMap.repeat.set(4, 1);
  B.part('shipEngines', upper, { explode: V(0, -9, 0), mass: 10000, dims: '3 × Raptor SL + 3 × RVac (Ø2.3 m)', cg: 2.2 });
  const enginesU = [];
  for (let i = 0; i < 3; i++) { const a = i / 3 * TAU + Math.PI / 2; const x = Math.cos(a) * 1.0, z = Math.sin(a) * 1.0; addBell(B, 'shipEngines', B.parts.shipEngines.group, x, z, 1.4, .22, .64, 1.6, bm, true, hm); enginesU.push({ p: V(x, 1.4, z), r: .64 }); }
  for (let i = 0; i < 3; i++) { const a = i / 3 * TAU - Math.PI / 2; const x = Math.cos(a) * 2.9, z = Math.sin(a) * 2.9; addBell(B, 'shipEngines', B.parts.shipEngines.group, x, z, 0.35, .25, 1.15, 3.0, M.nb(), true, hm); enginesU.push({ p: V(x, .35, z), r: 1.15, vac: true }); }
  B.mesh('shipEngines', new THREE.CylinderGeometry(R, R, 4.0, 72, 1, true), steelS, { pos: V(0, 2.0, 0) }); // aft skirt

  B.part('shipTank', upper, { explode: V(0, 0, 0), mass: 56700, prop: [[1170000, 11], [330000, 24.5]], dims: 'Ø9 m · ~27 m', cg: 17 });
  B.mesh('shipTank', new THREE.CylinderGeometry(R, R, 26, 96, 1, true), steelS, { pos: V(0, 4 + 13, 0) });
  B.mesh('shipTank', new THREE.CylinderGeometry(R * .99, R * .99, 15.5, 40), M.lox(), { internal: true, pos: V(0, 4.2 + 7.75, 0) });
  B.mesh('shipTank', new THREE.CylinderGeometry(R * .99, R * .99, 10, 40), M.fuel(), { internal: true, pos: V(0, 20 + 5, 0) });
  B.mesh('shipTank', new THREE.SphereGeometry(R * .99, 40, 12, 0, TAU, 0, Math.PI / 2), M.alu(), { internal: true, pos: V(0, 19.8, 0), scale: V(1, .35, 1) });

  B.part('payloadBay', upper, { explode: V(0, 6, 0), mass: 31000, dims: 'PEZ · 8 Starlink sim · ~16 t', cg: 37 });
  const shipTop = 52.1;
  B.mesh('payloadBay', new THREE.CylinderGeometry(R, R, 12, 96, 1, true), steelS, { pos: V(0, 30 + 6, 0) });
  const noseProf = ogive(R, 10.1, 42, 22, .6);
  B.mesh('payloadBay', lathe(noseProf, 96), steelS);
  B.mesh('payloadBay', new THREE.BoxGeometry(.25, 3.2, 3.8), M.dark(), { pos: V(-(R - .05), 36.5, 0) }); // PEZ slot (leeward)
  for (let i = 0; i < 8; i++) B.mesh('payloadBay', new THREE.BoxGeometry(5, .25, 2.4), M.alu(), { internal: true, pos: V(0, 31.5 + i * .9, 0) });
  B.mesh('payloadBay', new THREE.SphereGeometry(1.4, 20, 14), M.alu(), { internal: true, pos: V(0, 44.5, 0) }); // header tank

  // heat shield: half shell on windward (+x) side, ~18,000 hex tiles
  B.part('heatshield', upper, { explode: V(7, 0, 0), mass: 10500, dims: '~18,000 hex tiles · 1,400 °C', cg: 26 });
  const tm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .72, metalness: .05, map: hex?.map, normalMap: hex?.normalMap, normalScale: new THREE.Vector2(2.2, 2.2) });
  if (tm.map) { tm.map = tm.map.clone(); tm.map.repeat.set(20, 52); tm.normalMap = tm.normalMap.clone(); tm.normalMap.repeat.set(20, 52); }
  const shellProf = [[R + .06, 4.0], [R + .06, 42.0], ...noseProf.slice(1).map(([r, y]) => [r + .06, y])];
  B.mesh('heatshield', lathe(shellProf, 64, .05, Math.PI - .1), tm);

  // flaps: aft (±~95°) and forward (Block 2, leeward-shifted ±~125°)
  B.part('flaps', upper, { explode: V(-3, 0, 0), mass: 8000, dims: '2 × aft + 2 × forward', cg: 25 });
  const flaps = [];
  const flapShape = (span, root, tip) => { const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(span, (root - tip) * .25); s.lineTo(span, (root - tip) * .25 + tip); s.lineTo(0, root); s.closePath(); return new THREE.ExtrudeGeometry(s, { depth: .3, bevelEnabled: false }); };
  const flapDefs = [[95, 5.0, 4.4, 10, 3.6], [-95, 5.0, 4.4, 10, 3.6], [128, 38.5, 3.2, 6.4, 2.6], [-128, 38.5, 3.2, 6.4, 2.6]];
  flapDefs.forEach(([deg, y, span, root, tip], i) => {
    const a = deg * Math.PI / 180; // angle from +x
    const pv = new THREE.Group(); pv.position.set(Math.cos(a) * R * .98, y, Math.sin(a) * R * .98); pv.rotation.y = -a; B.parts.flaps.group.add(pv);
    const hinge = new THREE.Group(); pv.add(hinge);
    const tmf = tm.clone(); if (tmf.map) { tmf.map = hex.map.clone(); tmf.map.repeat.set(2, 3); tmf.normalMap = hex.normalMap.clone(); tmf.normalMap.repeat.set(2, 3); }
    const m = new THREE.Mesh(flapShape(span, root, tip), [tmf, tmf]); m.userData.part = 'flaps'; m.position.z = -.15; m.castShadow = true;
    hinge.add(m); B.parts.flaps.meshes.push(m);
    hinge.userData = { side: Math.sign(deg), fwd: i >= 2 };
    flaps.push(hinge);
  });

  return finalize(B, { root, booster, upper, upperY: UPPER_Y, height: UPPER_Y + shipTop, radius: R,
    enginesB, enginesU, gridfins, flaps, hotRing, kind: 'ss', payloadMass: 16000, stageTopB: 71,
    camAnchors: { onboard: { stage: 'upper', p: V(-0.6, 4.5, R + .35) }, booster: { stage: 'booster', p: V(R + .4, 66.5, 1.2) }, flap: { stage: 'upper', p: V(1.2, 13.5, R + .5) } } });
}

// =====================================================================
function finalize(B, o) {
  o.parts = B.parts; o.order = B.order;
  // CG with propellant (y from vehicle base)
  let m = 0, my = 0;
  for (const k of B.order) {
    const p = B.parts[k], off = p.stage === o.upper ? o.upperY : 0;
    m += p.mass; my += p.mass * ((p.cg ?? 0) + off);
    for (const [pm, py] of p.prop) { m += pm; my += pm * (py + off); }
  }
  o.mass = m; o.cg = my / m;
  // CP: slender-body normal-force (CNα) of nose + any shoulder; body & stowed fins ~0
  const H = o.height, D = o.radius * 2;
  if (o.kind === 'f9' && o.fairing) {
    const dr = 5.2, Ln = 5.8, cnN = 2, xN = H - 0.466 * Ln; // fairing ogive
    const cnS = 2 * ((D / dr) ** 2 - 1), xS = o.upperY + 14.4 + 0.7; // boat-tail below fairing (negative)
    o.cp = (cnN * xN + cnS * xS) / (cnN + cnS);
  } else {
    const Ln = o.kind === 'ss' ? 10.1 : 4.0; o.cp = H - 0.466 * Ln;
  }
  o.cpCal = (o.cg - o.cp) / D; // >0 = CP below CG = statically stable
  // all meshes default materials stash
  o.root.traverse(n => { if (n.isMesh) { const ms = Array.isArray(n.material) ? n.material : [n.material]; ms.forEach(mm => { mm.userData.base = { opacity: mm.opacity, transparent: mm.transparent, depthWrite: mm.depthWrite, emissive: mm.emissive ? mm.emissive.clone() : null }; }); } });
  return o;
}

export function setLegs(model, f) { // 0 stowed .. 1 deployed
  (model.legs || []).forEach(a => { a.rotation.z = -f * 2.45; });
}
export function setGridFins(model, f) { // F9 only: 0 stowed (folded up) .. 1 deployed
  if (model.kind === 'f9') model.gridfins.forEach(h => { h.rotation.z = (1 - f) * Math.PI / 2; });
}
export function setFlaps(model, fwd = 0, aft = 0) { // radians; + folds toward leeward
  (model.flaps || []).forEach(h => { h.rotation.y = -(h.userData.fwd ? fwd : aft) * h.userData.side; });
}

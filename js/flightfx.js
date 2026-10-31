// Flight environment + VFX: procedural Earth (continents, clouds, atmosphere rim), sky dome, stars, debris shell,
// dashed orbit rings, plumes (sea-level -> vacuum cone), reentry plasma, particles (smoke/RCS/splash), pads, tower, drone ship.
import * as THREE from 'three';

export const RE = 6371e3;
const TAU = Math.PI * 2;

export const NOISE = /* glsl */`
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}
float snoise(vec3 v){const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
i=mod289(i);vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);
vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));}
float fbm(vec3 p){float a=.5,s=0.;for(int i=0;i<5;i++){s+=a*snoise(p);p*=2.03;a*=.5;}return s;}
`;
const LDV = '#include <common>\n#include <logdepthbuf_pars_vertex>\n', LDF = '#include <logdepthbuf_pars_fragment>\n';

// ---------------- Earth (NASA imagery) ----------------
// Mesh-local frame: pad at +Y, downrange east = +X. uEcef maps mesh-local directions to Earth-fixed (ECEF) for texture lookup.
const GEO = /* glsl */`
const float PI=3.141592653589793;
vec2 llUv(vec3 e){ return vec2(atan(e.y,e.x)/(2.*PI)+.5, asin(clamp(e.z,-1.,1.))/PI+.5); }
vec4 texW(sampler2D t, vec2 uv){ vec2 dx=dFdx(uv), dy=dFdy(uv); dx.x-=floor(dx.x+.5); dy.x-=floor(dy.x+.5); return textureGrad(t,uv,dx,dy); }
`;
const EARTH_V = LDV + `uniform mat3 uEcef; uniform vec3 uSun; varying vec3 vE; varying vec3 vSunE; varying vec3 vViewE;
  void main(){ vec4 wp=modelMatrix*vec4(position,1.); mat3 R=mat3(modelMatrix);
    vE=uEcef*normalize(normal); vSunE=uEcef*(transpose(R)*uSun); vViewE=uEcef*(transpose(R)*(cameraPosition-wp.xyz));
    gl_Position=projectionMatrix*viewMatrix*wp;
    #include <logdepthbuf_vertex>
  }`;
function earthMaterial(sunDir, tex) {
  return new THREE.ShaderMaterial({
    uniforms: { uSun: { value: sunDir }, uEcef: { value: new THREE.Matrix3() }, uDay: { value: tex.day }, uNight: { value: tex.night }, uClouds: { value: tex.clouds },
      uTopo: { value: tex.topo }, uCloudRot: { value: 0 }, uHaze: { value: 0 }, uHazeCol: { value: new THREE.Color(.5, .62, .78) }, uTexel: { value: new THREE.Vector2(1 / tex.topo.image.width, 1 / tex.topo.image.height) }, uBump: { value: 2.2 } },
    vertexShader: EARTH_V,
    fragmentShader: LDF + GEO + `uniform sampler2D uDay,uNight,uClouds,uTopo; uniform float uCloudRot,uBump,uHaze; uniform vec3 uHazeCol; uniform vec2 uTexel; varying vec3 vE; varying vec3 vSunE; varying vec3 vViewE;
      void main(){
        #include <logdepthbuf_fragment>
        vec3 e=normalize(vE), L=normalize(vSunE), V=normalize(vViewE);
        vec2 uv=llUv(e);
        vec3 day=texW(uDay,uv).rgb; vec3 night=texW(uNight,uv).rgb; vec2 topo=texW(uTopo,uv).rg; float ocean=smoothstep(.35,.65,topo.g);
        // bump from NASA/GEBCO topography (east / north gradients)
        float hE=texture(uTopo,uv+vec2(uTexel.x,0.)).r-texture(uTopo,uv-vec2(uTexel.x,0.)).r;
        float hN=texture(uTopo,uv+vec2(0.,uTexel.y)).r-texture(uTopo,uv-vec2(0.,uTexel.y)).r;
        float lon=atan(e.y,e.x), lat=asin(e.z);
        vec3 east=vec3(-sin(lon),cos(lon),0.), north=vec3(-sin(lat)*cos(lon),-sin(lat)*sin(lon),cos(lat));
        float far=smoothstep(2e4,4e5,length(vViewE));
        vec3 N=normalize(e-uBump*far*(hE*east+hN*north)*(1.-ocean));
        float dg=dot(e,L), dl=dot(N,L);
        float dayF=smoothstep(-.12,.12,dg);
        // cloud shadows: sample the (rotated) cloud layer toward the sun
        vec3 toward=(L-e*dg)*(.0016/max(dg,.15));
        vec3 es=normalize(e+toward); float cr=uCloudRot; es=vec3(es.x*cos(cr)+es.y*sin(cr),-es.x*sin(cr)+es.y*cos(cr),es.z);
        float shadow=1.-.5*texW(uClouds,llUv(es)).r*smoothstep(0.,.1,dg);
        vec3 albedo=day*1.1; // sRGB texture -> linear on sample
        vec3 col=albedo*(max(dl,0.)*1.9*shadow+.015);
        // ocean sun glint (Blinn-Phong, wave-roughened) + Fresnel sky reflection
        vec3 H=normalize(L+V); float nh=max(dot(e,H),0.);
        float fr=.02+.98*pow(1.-max(dot(e,V),0.),5.);
        col+=ocean*dayF*shadow*(vec3(1.,.93,.8)*(pow(nh,350.)*2.2+pow(nh,40.)*.12)+vec3(.12,.25,.5)*fr*.35);
        // night lights (NASA Black Marble), fade through twilight
        float nightF=1.-smoothstep(-.18,.04,dg);
        col+=pow(night,vec3(1.6))*vec3(1.,.82,.55)*nightF*1.4;
        // atmospheric in-scatter: blue haze at grazing angles, warm band at the terminator
        float mu=max(dot(e,V),0.), fres=pow(1.-mu,4.);
        float term=smoothstep(-.15,.02,dg)*(1.-smoothstep(.02,.3,dg));
        vec3 haze=mix(vec3(.28,.52,1.),vec3(1.,.45,.18),term);
        col=mix(col,haze*(dayF*.45+term*.35),clamp(fres*(dayF+term*.5)*.6,0.,1.));
        col+=vec3(.1,.18,.35)*dayF*.06;
        // low-altitude aerial perspective (camera inside the haze layer)
        float hz=1.-exp(-pow(length(vViewE)*uHaze,1.15)); col=mix(col,uHazeCol*(dayF*.9+.1),hz*.92);
        gl_FragColor=vec4(col,1.);
        #include <colorspace_fragment>
      }`
  });
}
function cloudMaterial(sunDir, tex) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uSun: { value: sunDir }, uEcef: { value: new THREE.Matrix3() }, uClouds: { value: tex.clouds }, uCloudRot: { value: 0 }, uFade: { value: 1 } },
    vertexShader: EARTH_V,
    fragmentShader: LDF + GEO + `uniform sampler2D uClouds; uniform float uCloudRot,uFade; varying vec3 vE; varying vec3 vSunE; varying vec3 vViewE;
      void main(){
        #include <logdepthbuf_fragment>
        vec3 e=normalize(vE), L=normalize(vSunE); float cr=uCloudRot;
        vec3 er=vec3(e.x*cos(cr)+e.y*sin(cr),-e.x*sin(cr)+e.y*cos(cr),e.z);
        float c=texW(uClouds,llUv(er)).r; c=smoothstep(.08,.9,c);
        float dg=dot(e,L); float lit=smoothstep(-.12,.25,dg);
        float term=smoothstep(-.12,.02,dg)*(1.-smoothstep(.02,.28,dg));
        vec3 col=mix(vec3(.02,.025,.04),vec3(1.),lit); col=mix(col,vec3(1.,.55,.28),term*.7);
        gl_FragColor=vec4(col,c*.95*uFade);
      }`
  });
}
function atmoMaterial(sunDir) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
    uniforms: { uSun: { value: sunDir }, uI: { value: 1 } },
    vertexShader: LDV + `varying vec3 vWN; varying vec3 vWP; varying vec3 vC; void main(){ vWN=normalize(mat3(modelMatrix)*normal); vec4 wp=modelMatrix*vec4(position,1.); vWP=wp.xyz; vC=(modelMatrix*vec4(0.,0.,0.,1.)).xyz; gl_Position=projectionMatrix*viewMatrix*wp;
      #include <logdepthbuf_vertex>
      }`,
    fragmentShader: LDF + `uniform vec3 uSun; uniform float uI; varying vec3 vWN; varying vec3 vWP; varying vec3 vC;
      void main(){
        #include <logdepthbuf_fragment>
        vec3 V=normalize(cameraPosition-vWP), N=normalize(vWN); float r=1.-abs(dot(N,V));
        float rim=pow(r,6.)*1.7;
        // from altitude: analytic limb glow from the ray's closest approach to the Earth (smooth exponential falloff, no faceted shell edge)
        vec3 oc=vC-cameraPosition; float camAlt=length(oc)-${RE.toFixed(1)}; float tca=dot(oc,-V);
        float hb=tca>0.?sqrt(max(dot(oc,oc)-tca*tca,0.))-${RE.toFixed(1)}:camAlt; // closest approach (camera itself when looking away)
        float limb=exp(-max(hb,0.)/16000.)*1.35;
        rim=mix(rim,limb,smoothstep(25000.,70000.,camAlt));
        float dg=dot(N,uSun);
        float day=smoothstep(-.3,.25,dg); float term=smoothstep(-.3,-.02,dg)*(1.-smoothstep(-.02,.3,dg));
        float fwd=pow(max(dot(-V,uSun),0.),6.); // forward scattering when looking toward the sun
        vec3 col=vec3(.22,.5,1.)*day+vec3(1.,.42,.12)*term*1.3+vec3(1.,.8,.6)*fwd*day*.3;
        gl_FragColor=vec4(col*rim*uI,1.);
      }`
  });
}
function starMaterial(tex) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.BackSide,
    uniforms: { uStars: { value: tex.stars }, uOp: { value: 0 }, uRot: { value: new THREE.Matrix3() } },
    vertexShader: LDV + `varying vec3 vD; void main(){ vD=normalize(mat3(modelMatrix)*position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
      #include <logdepthbuf_vertex>
      }`,
    fragmentShader: LDF + GEO + `uniform sampler2D uStars; uniform float uOp; uniform mat3 uRot; varying vec3 vD;
      void main(){
        #include <logdepthbuf_fragment>
        vec3 d=normalize(uRot*normalize(vD)); vec2 uv=llUv(d); uv.x=1.-uv.x+.5; uv.x=fract(uv.x);
        vec3 c=texW(uStars,uv).rgb; gl_FragColor=vec4(c*c*1.6,uOp);
      }`
  });
}
// site (lat, lon in degrees) -> Matrix3 mapping mesh-local (x=east, y=up, z=south) to ECEF
export function siteEcef(lat, lon, m3 = new THREE.Matrix3()) {
  const f = THREE.MathUtils.degToRad(lat), l = THREE.MathUtils.degToRad(lon);
  const U = new THREE.Vector3(Math.cos(f) * Math.cos(l), Math.cos(f) * Math.sin(l), Math.sin(f));
  const E = new THREE.Vector3(-Math.sin(l), Math.cos(l), 0);
  const S = new THREE.Vector3(Math.sin(f) * Math.cos(l), Math.sin(f) * Math.sin(l), -Math.cos(f));
  return m3.setFromMatrix4(new THREE.Matrix4().makeBasis(E, U, S));
}
export const SITES = { ss: [25.997, -97.157], f9: [28.608, -80.604] };
export const TEX_RES = q => q === '4k' ? '4k' : q === 'low' ? '1k' : '2k';
export const EARTH_TEX = q => ['day', 'night', 'clouds', 'topo', 'stars'].map(n => `assets/earth/${n}_${TEX_RES(q)}.webp`);
export async function loadEarthTextures(q, onEach) {
  const L = new THREE.TextureLoader(), names = ['day', 'night', 'clouds', 'topo', 'stars'], urls = EARTH_TEX(q), out = {};
  await Promise.all(urls.map((u, i) => L.loadAsync(u).then(t => {
    const n = names[i]; t.colorSpace = (n === 'day' || n === 'night' || n === 'stars') ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = THREE.RepeatWrapping; t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; out[n] = t; onEach && onEach(n);
  })));
  return out;
}
// swap in sharper textures later (lazy 4K upgrade); keeps the old ones until every new one is decoded
export async function upgradeEarthTextures(W, renderer) {
  const nt = await loadEarthTextures('4k');
  for (const n in nt) renderer.initTexture?.(nt[n]);
  const eu = W.earth.material.uniforms, cu = W.clouds.material.uniforms, su = W.stars.material.uniforms, old = [eu.uDay.value, eu.uNight.value, eu.uClouds.value, eu.uTopo.value, su.uStars.value];
  eu.uDay.value = nt.day; eu.uNight.value = nt.night; eu.uClouds.value = nt.clouds; eu.uTopo.value = nt.topo; cu.uClouds.value = nt.clouds; su.uStars.value = nt.stars;
  eu.uTexel.value.set(1 / nt.topo.image.width, 1 / nt.topo.image.height);
  old.forEach(t => t.dispose());
}
// NASA GIBS (Landsat WELD true colour) 30 km square centred on each pad -> ground disc around the launch site
const siteCache = {};
export function loadSiteGround(kind, q) {
  const key = kind + q; if (siteCache[key]) return siteCache[key];
  return siteCache[key] = new Promise((res, rej) => {
    const img = new Image(); img.decoding = 'async';
    img.onload = () => {
      const N = img.width, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, N, N), px = d.data, rc = document.createElement('canvas'); rc.width = rc.height = N >> 1; const rg = rc.getContext('2d'), rd = rg.createImageData(N >> 1, N >> 1);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const k = (y * N + x) * 4, r = Math.hypot(x - N / 2, y - N / 2) / (N / 2);
        px[k + 3] = 255 * Math.max(0, Math.min(1, (1 - r) / .22)); // feathered edge into the NASA globe
        if (!(x & 1) && !(y & 1)) { // roughness: water (blue-dominant, dark) glossy, land rough
          const R_ = px[k], G_ = px[k + 1], B_ = px[k + 2], water = B_ > R_ * 1.05 && B_ + G_ + R_ < 330 ? 1 : 0, j = ((y >> 1) * (N >> 1) + (x >> 1)) * 4, v = water ? 70 : 245;
          rd.data[j] = rd.data[j + 1] = rd.data[j + 2] = v; rd.data[j + 3] = 255;
        }
      }
      g.putImageData(d, 0, 0); rg.putImageData(rd, 0, 0);
      const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
      const rough = new THREE.CanvasTexture(rc); rough.anisotropy = 4;
      res({ map, rough });
    };
    img.onerror = rej; img.src = `assets/site/${kind}_${q === 'low' ? '1k' : '2k'}.webp`;
  });
}
// soft "puff" sprite for smoke / steam particles
function puffTexture() {
  const N = 128, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, N, N); g.globalCompositeOperation = 'lighter';
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 46; i++) {
    const a = rnd() * 6.283, rr = Math.pow(rnd(), .7) * N * .26, x = N / 2 + Math.cos(a) * rr, y = N / 2 + Math.sin(a) * rr, s = N * (.1 + rnd() * .17);
    const gr = g.createRadialGradient(x, y, 0, x, y, s); gr.addColorStop(0, `rgba(255,255,255,${.18 + rnd() * .2})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, s, 0, 6.283); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; return t;
}
// gradient sky as an environment map (PBR reflections / ambient): 'low' = blue day sky over hazy ground, 'space' = black sky over blue Earth
export function skyEnvironment(renderer, kind) {
  const sc = new THREE.Scene();
  const mat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, uniforms: { uK: { value: kind === 'space' ? 1 : 0 } },
    vertexShader: 'varying vec3 vD; void main(){ vD=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform float uK; varying vec3 vD; void main(){ float e=vD.y; vec3 sun=normalize(vec3(-.35,.55,.75)); float s=max(dot(vD,sun),0.);
      vec3 skyL=mix(vec3(.55,.68,.85),vec3(.16,.34,.7),smoothstep(0.,.6,e)), grL=mix(vec3(.3,.31,.27),vec3(.42,.46,.5),smoothstep(-.4,0.,e));
      vec3 skyS=vec3(.01,.012,.02), grS=mix(vec3(.05,.12,.25),vec3(.25,.4,.65),smoothstep(-.5,0.,e));
      vec3 c=e>0.?mix(skyL,skyS,uK):mix(grL,grS,uK); c+=vec3(1.,.92,.8)*pow(s,24.)*mix(1.5,2.5,uK);
      gl_FragColor=vec4(c,1.); }` });
  sc.add(new THREE.Mesh(new THREE.SphereGeometry(100, 48, 24), mat));
  const pm = new THREE.PMREMGenerator(renderer); const rt = pm.fromScene(sc, 0, .1, 1000); pm.dispose(); mat.dispose();
  return rt.texture;
}
function skyMaterial(sunDir) {
  return new THREE.ShaderMaterial({
    depthWrite: false, side: THREE.BackSide,
    uniforms: { uSun: { value: sunDir }, uUp: { value: new THREE.Vector3(0, 1, 0) }, uAlt: { value: 0 } },
    vertexShader: LDV + `varying vec3 vD; void main(){ vD=normalize(mat3(modelMatrix)*position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
      #include <logdepthbuf_vertex>
      }`,
    fragmentShader: LDF + `uniform vec3 uSun,uUp; uniform float uAlt; varying vec3 vD;
      void main(){
        #include <logdepthbuf_fragment>
        float e=dot(vD,uUp); float k=exp(-uAlt/9000.), kz=exp(-uAlt/5500.);
        float se=dot(uSun,uUp); float s=max(dot(vD,uSun),0.);
        // altitude-dependent Rayleigh gradient: zenith darkens first, the bright horizon band thins out
        vec3 zen=mix(vec3(.004,.012,.05),vec3(.035,.13,.42),kz), hor=vec3(.38,.56,.82);
        float band=mix(.05,.35,k);
        vec3 c=mix(hor,zen,pow(smoothstep(-.02,band,e),.7));
        float warm=(1.-smoothstep(.0,.35,se))*(1.-smoothstep(0.,.25,abs(e)));
        c=mix(c,vec3(1.,.55,.3),warm*.55*pow(s,2.));
        c=mix(c,vec3(.12,.17,.22),smoothstep(0.,-.08,e)); // haze below the horizon
        c+=vec3(1.,.9,.72)*(pow(s,800.)*10.+pow(s,30.)*.14+pow(s,4.)*.03);
        c*=mix(.0,1.,k*.85+.15*kz); c+=vec3(1.,.96,.88)*pow(s,2500.)*8.*(1.-k);
        gl_FragColor=vec4(c,1.);
        #include <colorspace_fragment>
      }`
  });
}

// ---------------- plume ----------------
export function plumeMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uLen: { value: 30 }, uR0: { value: .5 }, uR1: { value: 2 }, uK: { value: .6 }, uI: { value: 1 },
      uCore: { value: new THREE.Color(4, 3.4, 2.4) }, uEdge: { value: new THREE.Color(1.6, .55, .12) }, uNoise: { value: .5 }, uDiam: { value: 0 }, uSoft: { value: 1.5 }, uDiaCol: { value: new THREE.Color(3, 2.2, 1.6) } },
    vertexShader: LDV + `uniform float uLen,uR0,uR1,uK,uDiam; varying float vS; varying vec3 vNv; varying vec3 vVv; varying vec3 vP;
      void main(){ float s=clamp(-position.y,0.,1.); vS=s;
        float r=mix(uR0,uR1,pow(s,uK))*(1.+uDiam*.12*sin(s*60.));
        vec3 p=vec3(position.x*r,-s*uLen,position.z*r); vP=vec3(position.x,s,position.z);
        vec4 mv=modelViewMatrix*vec4(p,1.); vVv=-mv.xyz; vNv=normalize(normalMatrix*vec3(position.x,0.,position.z));
        gl_Position=projectionMatrix*mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: LDF + NOISE + `uniform float uTime,uI,uNoise,uDiam,uSoft; uniform vec3 uCore,uEdge,uDiaCol; varying float vS; varying vec3 vNv; varying vec3 vVv; varying vec3 vP;
      void main(){
        #include <logdepthbuf_fragment>
        float f=abs(dot(normalize(vNv),normalize(vVv)));
        float a=pow(f,uSoft);
        // two-octave turbulence advected downstream; stronger toward the plume tail
        float n=snoise(vec3(vP.x*2.,vS*6.-uTime*9.,vP.z*2.))*.6+snoise(vec3(vP.x*5.,vS*15.-uTime*17.,vP.z*5.))*.3; n=n*.5+.5;
        n=mix(1.,n,uNoise*(.4+.6*vS));
        float fall=pow(1.-vS,1.6)*smoothstep(0.,.03,vS+.02);
        float dw=pow(max(sin(vS*60.),0.),8.)*(1.-vS)*smoothstep(.0,.08,vS);
        vec3 col=mix(uCore,uEdge,clamp(vS*1.4+(1.-a)*.6,0.,1.));
        col+=uDiaCol*uDiam*.55*dw*a;
        gl_FragColor=vec4(col*a*fall*n*uI,1.);
      }`
  });
}
const plumeGeo = (() => { const g = new THREE.CylinderGeometry(1, 1, 1, 28, 24, true); g.translate(0, -.5, 0); return g; })();

export class Plume {
  // engines: [{p:Vector3, r}] in stage-local coords; cluster plume + per-engine cores
  constructor(stage, engines, { clusterR, quality = 'high', fuel = 'rp1' } = {}) {
    this.fuel = fuel; // 'rp1' (kerosene: yellow-orange, sooty) | 'ch4' (methane: clear, blue-violet core, pink diamonds)
    this.group = new THREE.Group(); stage.add(this.group);
    this.engines = engines; this.cores = [];
    this.coreMat = plumeMaterial(); this.cluMat = plumeMaterial(); this.vacMat = plumeMaterial();
    this.vacMat.uniforms.uCore.value.set(1.4, 1.2, 1.5); this.vacMat.uniforms.uEdge.value.set(.5, .35, .9); this.vacMat.uniforms.uSoft.value = .6; if (fuel === 'ch4') this.vacMat.uniforms.uEdge.value.set(.35, .3, .95);
    const minY = Math.min(...engines.map(e => e.p.y));
    engines.forEach(e => { const m = new THREE.Mesh(plumeGeo, this.coreMat); m.position.copy(e.p); m.frustumCulled = false; m.renderOrder = 5; this.group.add(m); this.cores.push(m); });
    this.cluster = new THREE.Mesh(plumeGeo, this.cluMat); this.cluster.position.y = minY; this.cluster.frustumCulled = false; this.cluster.renderOrder = 6; this.group.add(this.cluster);
    this.vac = new THREE.Mesh(plumeGeo, this.vacMat); this.vac.position.y = minY; this.vac.frustumCulled = false; this.vac.renderOrder = 7; this.group.add(this.vac);
    this.clusterR = clusterR; this.maxR = Math.max(...engines.map(e => e.r));
    this.light = new THREE.PointLight(0xffb070, 0, 0, 2); this.light.position.y = minY - clusterR * 2; this.group.add(this.light);
    this.set([], 0, 0);
  }
  // active: array of booleans per engine; p: ambient pressure ratio 0..1; t: time
  set(active, p, t, cfg = {}) {
    const n = active.filter(Boolean).length, on = n > 0;
    const frac = n / this.engines.length;
    this.cores.forEach((m, i) => { m.visible = !!active[i]; const r = this.engines[i].r; m.scale.set(1, 1, 1); });
    const L = cfg.lenScale ?? 1, I = cfg.intensity ?? 1;
    const u = this.coreMat.uniforms, c = this.cluMat.uniforms, v = this.vacMat.uniforms;
    u.uTime.value = c.uTime.value = v.uTime.value = t;
    // per-engine cores: short, very bright, diamonds at sea level
    const ch4 = this.fuel === 'ch4';
    if (ch4) { u.uCore.value.set(2.6, 2.4, 3.4); u.uEdge.value.set(1.1, .45, .55); u.uDiaCol.value.set(2.4, 1.2, 2.8); }
    else { u.uCore.value.set(4, 3.3, 2.1); u.uEdge.value.set(1.7, .6, .12); u.uDiaCol.value.set(3, 2.2, 1.4); }
    u.uLen.value = this.maxR * (6 + 10 * (1 - p)) * L; u.uR0.value = this.maxR * .85; u.uR1.value = this.maxR * (1.2 + 3 * (1 - p)); u.uI.value = 1.6 * I; u.uDiam.value = p; u.uSoft.value = 1.2;
    // cluster: dense turbulent white-yellow at SL -> fades with altitude
    const cl = this.clusterR;
    this.cluster.visible = on && p > 0.02;
    c.uLen.value = cl * (5.5 + 2.5 * (1 - p)) * L * (0.6 + 0.4 * Math.sqrt(frac)); c.uR0.value = cl * .9; c.uR1.value = cl * (1.25 + 1.5 * (1 - p)); c.uK.value = .7; c.uI.value = 1.25 * p * I * (0.4 + 0.6 * frac); c.uNoise.value = .7;
    if (ch4) { c.uCore.value.set(2.3, 1.9, 2.0); c.uEdge.value.set(1.3, .55, .35); c.uI.value *= .8; }
    else { c.uCore.value.set(3.3, 2.6, 1.5); c.uEdge.value.set(1.6, .62, .16); }
    // vacuum plume: big diffuse translucent cone
    const vp = Math.max(0, 1 - p * 3);
    this.vac.visible = on && vp > 0.01;
    v.uLen.value = cl * (14 + 10 * vp) * L * (cfg.vacLen ?? 1); v.uR0.value = cl * .8; v.uR1.value = cl * (9 + 9 * vp) * (cfg.vacWidth ?? 1); v.uK.value = .55; v.uI.value = .13 * vp * I * (0.35 + 0.65 * Math.sqrt(frac)); v.uNoise.value = .45;
    this.light.intensity = on ? (cfg.light ?? 1) * 4e4 * (0.3 + frac) : 0; this.light.distance = 0;
    this.group.visible = on;
  }
}

// ---------------- plasma shell ----------------
export function plasmaMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uI: { value: 0 }, uVel: { value: new THREE.Vector3(1, 0, 0) } },
    vertexShader: LDV + `varying vec3 vN; varying vec3 vP; varying vec3 vNv; varying vec3 vVv;
      void main(){ vN=normal; vP=position; vec4 mv=modelViewMatrix*vec4(position,1.); vVv=-mv.xyz; vNv=normalize(normalMatrix*normal); gl_Position=projectionMatrix*mv;
      #include <logdepthbuf_vertex>
      }`,
    fragmentShader: LDF + NOISE + `uniform float uTime,uI; uniform vec3 uVel; varying vec3 vN; varying vec3 vP; varying vec3 vNv; varying vec3 vVv;
      void main(){
        #include <logdepthbuf_fragment>
        float lead=dot(normalize(vN),-normalize(uVel));
        float rim=1.-abs(dot(normalize(vNv),normalize(vVv)));
        float n=snoise(vP*.25+uVel*uTime*3.)*.5+.5; float st=snoise(vec3(vP.x*.6,vP.y*.08-uTime*4.,vP.z*.6))*.5+.5;
        vec3 vio=vec3(.55,.18,1.1), mag=vec3(1.3,.25,.75), hot=vec3(3.,2.4,1.3);
        vec3 c=mix(vio,mag,n); c=mix(c,hot,smoothstep(.35,.95,lead));
        float a=(.25+.75*pow(rim,1.5))*(.4+.6*st)*smoothstep(-.6,.4,lead)*uI;
        gl_FragColor=vec4(c*a,1.);
      }`
  });
}

// ---------------- particles (smoke, condensation, RCS, splash) ----------------
export class Particles {
  constructor(max = 2000) {
    this.max = max; this.i = 0;
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3); this.age = new Float32Array(max).fill(1e9); this.life = new Float32Array(max).fill(1);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max); this.a0 = new Float32Array(max); this.drag = new Float32Array(max); this.col = new Float32Array(max * 3);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(new Float32Array(max * 3), 3); this.aSize = new THREE.BufferAttribute(new Float32Array(max), 1); this.aA = new THREE.BufferAttribute(new Float32Array(max), 1); this.aC = new THREE.BufferAttribute(new Float32Array(max * 3), 3);
    for (const a of [this.aPos, this.aSize, this.aA, this.aC]) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('size', this.aSize); g.setAttribute('alpha', this.aA); g.setAttribute('color', this.aC);
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uScale: { value: 600 }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uPuff: { value: puffTexture() }, uGlowP: { value: new THREE.Vector3() }, uGlowI: { value: 0 }, uGlowR: { value: 40 }, uAmb: { value: 1 } },
      vertexShader: LDV + `attribute float size; attribute float alpha; attribute vec3 color; uniform float uScale,uGlowI,uGlowR; uniform vec3 uGlowP; varying float vA; varying vec3 vC; varying float vRot; varying float vGlow;
        void main(){ vec4 wp=modelMatrix*vec4(position,1.); vec4 mv=viewMatrix*wp; float dz=-mv.z; vA=alpha*smoothstep(size*.6,size*3.,dz); vC=color; gl_PointSize=min(420.,size*uScale/max(dz,.1)); gl_Position=projectionMatrix*mv;
        vRot=fract(sin(float(gl_VertexID)*12.9898)*43758.5453)*6.2832; vGlow=uGlowI*exp(-distance(wp.xyz,uGlowP)/uGlowR);
        #include <logdepthbuf_vertex>
        }`,
      fragmentShader: LDF + `uniform sampler2D uPuff; uniform vec3 uSun; uniform float uAmb; varying float vA; varying vec3 vC; varying float vRot; varying float vGlow; void main(){
        #include <logdepthbuf_fragment>
        vec2 d=gl_PointCoord-.5; float r=length(d); if(r>.5) discard;
        float cs=cos(vRot), sn=sin(vRot); vec2 q=vec2(cs*d.x-sn*d.y,sn*d.x+cs*d.y)+.5;
        float n=texture2D(uPuff,q).r; float a=clamp(n*1.9,0.,1.)*vA; if(a<.003) discard;
        vec3 N=normalize(vec3(d.x*2.,-d.y*2.,sqrt(max(0.,1.-4.*r*r))+.25));
        float lit=clamp(.5+.6*dot(N,uSun),0.,1.), hot=smoothstep(.45,.7,vC.r-vC.b);
        vec3 c=mix(vC*(.38+.8*lit)*uAmb,vC*1.2,hot)+vec3(1.,.5,.18)*vGlow*(.6+.4*n);
        gl_FragColor=vec4(c,a); }`
    });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; this.points.renderOrder = 4;
    this.origin = new THREE.Vector3(); // Earth-local origin of this cloud
  }
  rebase(earthLocal) { // keep coordinates small
    const d = new THREE.Vector3().subVectors(earthLocal, this.origin);
    if (d.lengthSq() < 4e8) return;
    for (let i = 0; i < this.max; i++) { this.pos[i * 3] -= d.x; this.pos[i * 3 + 1] -= d.y; this.pos[i * 3 + 2] -= d.z; }
    this.origin.copy(earthLocal); this.points.position.copy(earthLocal);
  }
  emit(pEarth, v, life, s0, s1, a0, col, drag = 0.5) {
    const i = this.i = (this.i + 1) % this.max, k = i * 3;
    this.pos[k] = pEarth.x - this.origin.x; this.pos[k + 1] = pEarth.y - this.origin.y; this.pos[k + 2] = pEarth.z - this.origin.z;
    this.vel[k] = v.x; this.vel[k + 1] = v.y; this.vel[k + 2] = v.z; this.age[i] = 0; this.life[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = a0; this.drag[i] = drag;
    this.col[k] = col[0]; this.col[k + 1] = col[1]; this.col[k + 2] = col[2];
  }
  update(dt) {
    const P = this.aPos.array, S = this.aSize.array, A = this.aA.array, C = this.aC.array, o = this.origin;
    const gr = RE + 1.5;
    for (let i = 0; i < this.max; i++) {
      const k = i * 3; this.age[i] += dt; const u = this.age[i] / this.life[i];
      if (u >= 1) { A[i] = 0; S[i] = 0; continue; }
      const dr = Math.exp(-this.drag[i] * dt);
      this.vel[k] *= dr; this.vel[k + 1] *= dr; this.vel[k + 2] *= dr;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      // ground collision (Earth-centred): spread sideways
      const ex = this.pos[k] + o.x, ey = this.pos[k + 1] + o.y, ez = this.pos[k + 2] + o.z, r = Math.hypot(ex, ey, ez);
      if (r < gr) {
        const nx = ex / r, ny = ey / r, nz = ez / r, vn = this.vel[k] * nx + this.vel[k + 1] * ny + this.vel[k + 2] * nz;
        if (vn < 0) { this.vel[k] -= nx * vn * 1.3; this.vel[k + 1] -= ny * vn * 1.3; this.vel[k + 2] -= nz * vn * 1.3; this.vel[k] *= 1.6; this.vel[k + 2] *= 1.6; }
        const f = gr / r; this.pos[k] = ex * f - o.x; this.pos[k + 1] = ey * f - o.y; this.pos[k + 2] = ez * f - o.z;
      }
      P[k] = this.pos[k]; P[k + 1] = this.pos[k + 1]; P[k + 2] = this.pos[k + 2];
      S[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * Math.sqrt(u);
      A[i] = this.a0[i] * (1 - u) * Math.min(1, u * 12);
      C[k] = this.col[k]; C[k + 1] = this.col[k + 1]; C[k + 2] = this.col[k + 2];
    }
    this.aPos.needsUpdate = this.aSize.needsUpdate = this.aA.needsUpdate = this.aC.needsUpdate = true;
  }
  clear() { this.age.fill(1e9); }
}

// ---------------- ground textures ----------------
function waveNormal() { // tiled wave normal map (sum of directional sines)
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'), d = g.createImageData(N, N);
  const W = [[1, 3, .5, 0], [3, -2, .3, 1.3], [-4, 5, .18, 2.1], [7, 2, .1, .4], [-9, -6, .07, 2.8], [12, -11, .05, 1.7]];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let dx = 0, dy = 0; for (const [a, b, A, ph] of W) { const k = 6.2832 / N, c_ = Math.cos((a * x + b * y) * k + ph) * A; dx += c_ * a; dy += c_ * b; }
    const j = (y * N + x) * 4, n = Math.hypot(dx * .25, dy * .25, 1);
    d.data[j] = 128 - dx * .25 / n * 127; d.data[j + 1] = 128 - dy * .25 / n * 127; d.data[j + 2] = 255 / n; d.data[j + 3] = 255;
  }
  g.putImageData(d, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(60, 60); return t;
}
function seaTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
  const gr = g.createRadialGradient(256, 256, 0, 256, 256, 256); gr.addColorStop(0, 'rgba(14,52,84,1)'); gr.addColorStop(.75, 'rgba(10,40,70,1)'); gr.addColorStop(1, 'rgba(8,30,55,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(160,200,230,${Math.random() * .12})`; const x = Math.random() * 512, y = Math.random() * 512; if (Math.hypot(x - 256, y - 256) < 240) g.fillRect(x, y, 2 + Math.random() * 6, 1); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function lattice(h, w, M, step = 6) { // square lattice tower (Box frames + bracing)
  const g = new THREE.Group();
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(.8, h, .8), M); m.position.set(x * w / 2, h / 2, z * w / 2); g.add(m); }
  for (let y = 0; y < h; y += step) for (let s = 0; s < 4; s++) {
    const a = s * Math.PI / 2, m = new THREE.Mesh(new THREE.BoxGeometry(w, .4, .4), M); m.position.set(Math.sin(a) * w / 2, y, Math.cos(a) * w / 2); m.rotation.y = a + Math.PI / 2; g.add(m);
    const d = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(w, step), .3, .3), M); d.position.set(Math.sin(a) * w / 2, y + step / 2, Math.cos(a) * w / 2); d.rotation.y = a + Math.PI / 2; d.rotateZ(Math.atan2(step, w) * (s % 2 ? 1 : -1)); g.add(d);
  }
  return g;
}

// place a frame on the Earth surface at downrange x (m)
export function surfaceFrame(x, h = 0) { const f = new THREE.Group(); const a = x / RE; f.position.set(Math.sin(a) * (RE + h), Math.cos(a) * (RE + h), 0); f.rotation.z = -a; return f; }

// ---------------- world ----------------
export function createWorld(quality = 'high', tex) {
  const sunDir = new THREE.Vector3(-0.35, 0.55, 0.75).normalize();
  const world = new THREE.Group(); world.name = 'world';
  const seg = quality === 'high' ? 160 : 96;
  const earth = new THREE.Mesh(new THREE.SphereGeometry(RE, seg, seg / 2), earthMaterial(sunDir, tex)); world.add(earth);
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(RE + 9e3, seg, seg / 2), cloudMaterial(sunDir, tex)); world.add(clouds); clouds.renderOrder = 2;
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(RE * 1.018, seg, seg / 2), atmoMaterial(sunDir)); world.add(atmo);
  // debris shell
  const nD = quality === 'high' ? 5000 : 1800, dp = new Float32Array(nD * 3), dc = new Float32Array(nD * 3);
  for (let i = 0; i < nD; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(RE + 350e3 + Math.pow(Math.random(), 2) * 1800e3); dp.set([v.x, v.y, v.z], i * 3); const r = Math.random() < .15; dc.set(r ? [1, .25, .2] : [.75, .75, .75], i * 3); }
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dp, 3)); dg.setAttribute('color', new THREE.BufferAttribute(dc, 3));
  const debris = new THREE.Points(dg, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: .8, depthWrite: false })); world.add(debris);
  // decorative orbit rings (dashed red ellipses)
  const rings = new THREE.Group(); world.add(rings);
  const ringMat = new THREE.LineDashedMaterial({ color: 0xff3b2f, dashSize: 60e3, gapSize: 45e3, transparent: true, opacity: .55, depthWrite: false });
  [[RE + 550e3, RE + 600e3, .9, .2], [RE + 800e3, RE + 1400e3, .3, 1.1], [RE + 420e3, RE + 430e3, 1.5, 2.2]].forEach(([a, b, inc, raan]) => {
    const pts = []; for (let i = 0; i <= 256; i++) { const t = i / 256 * TAU; pts.push(new THREE.Vector3(Math.cos(t) * a, 0, Math.sin(t) * b)); }
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), ringMat); l.computeLineDistances(); l.rotation.set(inc, raan, 0); rings.add(l);
  });
  // stars: Yale Bright Star Catalog (via NASA HEASARC) baked to an equirect map; follows camera
  const stars = new THREE.Mesh(new THREE.SphereGeometry(2e8, 64, 32), starMaterial(tex)); stars.frustumCulled = false; stars.renderOrder = -9;
  const sky = new THREE.Mesh(new THREE.SphereGeometry(3e8, 32, 16), skyMaterial(sunDir)); sky.frustumCulled = false; sky.renderOrder = -10;

  // launch site frame (pad at Earth-local (0,RE,0))
  const site = surfaceFrame(0); world.add(site);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(15000, 128), new THREE.MeshStandardMaterial({ transparent: true, roughness: 1, metalness: 0, depthWrite: true, envMapIntensity: .6 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = 0.6; ground.receiveShadow = true; ground.visible = false; site.add(ground);
  const concrete = new THREE.MeshStandardMaterial({ color: 0x8d8a85, roughness: .9 }), steel = new THREE.MeshStandardMaterial({ color: 0x55585e, roughness: .6, metalness: .7 });
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(120, 130, 1.2, 48), concrete); pad.castShadow = true; pad.position.y = .8; pad.receiveShadow = true; site.add(pad);
  // Starship-style launch mount + tower with "chopsticks"
  const ssPad = new THREE.Group(); site.add(ssPad);
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU, m = new THREE.Mesh(new THREE.BoxGeometry(2.4, 20, 2.4), concrete); m.position.set(Math.cos(a) * 9, 10, Math.sin(a) * 9); ssPad.add(m); }
  const table = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 2.5, 6, 1, false), steel); table.position.y = 19; ssPad.add(table);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(5.2, .6, 8, 48), steel); ring.rotation.x = Math.PI / 2; ring.position.y = 20.3; ssPad.add(ring);
  const tower = lattice(146, 12, steel, 7); tower.position.set(0, 0, -24); ssPad.add(tower);
  const carriage = new THREE.Group(); carriage.position.set(0, 96, -24); ssPad.add(carriage);
  const arms = [];
  for (const s of [1, -1]) {
    const pv = new THREE.Group(); pv.position.set(s * 6, 0, 4); carriage.add(pv);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(2.2, 3.2, 34), steel); arm.position.z = 17; pv.add(arm);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(.6, .6, 30), new THREE.MeshStandardMaterial({ color: 0x222222 })); rail.position.set(-s * 1.3, 1.9, 17); pv.add(rail);
    pv.userData.side = s; arms.push(pv);
  }
  const qd = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 18), steel); qd.position.set(0, 118, -15); ssPad.add(qd);
  // F9-style pad: flat pad + transporter-erector + lightning masts
  const f9Pad = new THREE.Group(); site.add(f9Pad);
  const te = lattice(70, 5, steel, 5); te.position.set(0, 0, -9); f9Pad.add(te);
  const mount = new THREE.Mesh(new THREE.BoxGeometry(12, 4, 12), concrete); mount.position.y = 2; f9Pad.add(mount);
  for (const [x, z] of [[60, 60], [-60, 60], [0, -80]]) { const m = new THREE.Mesh(new THREE.CylinderGeometry(.6, 1.2, 90, 8), steel); m.position.set(x, 45, z); f9Pad.add(m); }

  [ssPad, f9Pad].forEach(g => g.traverse(n => { if (n.isMesh) n.castShadow = n.receiveShadow = true; }));
  return { world, earth, clouds, atmo, debris, rings, stars, sky, site, ground, ssPad, f9Pad, arms, sunDir, seaTex: seaTexture(), waveN: waveNormal(), steel, concrete };
}

export function makeSeaSite(x, seaTex, waveN) {
  const f = surfaceFrame(x); const sea = new THREE.Mesh(new THREE.CircleGeometry(4000, 64), new THREE.MeshStandardMaterial({ map: seaTex, normalMap: waveN || null, normalScale: new THREE.Vector2(.6, .6), transparent: true, roughness: .18, metalness: .1, depthWrite: false }));
  sea.receiveShadow = true;
  sea.rotation.x = -Math.PI / 2; sea.position.y = .2; f.add(sea); return f;
}
export function makeDroneShip(steel) {
  const g = new THREE.Group();
  const deck = new THREE.Mesh(new THREE.BoxGeometry(91, 4, 52), new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: .8 })); deck.position.y = 1; g.add(deck);
  g.userData.shadow = true;
  const mark = new THREE.Mesh(new THREE.RingGeometry(10, 12, 48), new THREE.MeshBasicMaterial({ color: 0xdddddd })); mark.rotation.x = -Math.PI / 2; mark.position.y = 3.05; g.add(mark);
  for (const z of [-24, 24]) { const w = new THREE.Mesh(new THREE.BoxGeometry(91, 4, 1), steel); w.position.set(0, 5, z); g.add(w); }
  for (const x of [-40, 40]) for (const z of [-20, 20]) { const t = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 3, 16), steel); t.position.set(x, 4.5, z); g.add(t); }
  g.traverse(n => { if (n.isMesh) n.castShadow = n.receiveShadow = true; });
  return g;
}
export function makeLandingZone(concrete, onImagery = false) {
  const g = new THREE.Group();
  if (!onImagery) { const land = new THREE.Mesh(new THREE.CircleGeometry(900, 64), new THREE.MeshStandardMaterial({ color: 0x5c6040, roughness: 1 })); land.rotation.x = -Math.PI / 2; land.position.y = .4; g.add(land); }
  const p = new THREE.Mesh(new THREE.CylinderGeometry(42, 42, 1, 64), concrete); p.position.y = .9; p.receiveShadow = true; g.add(p);
  const mark = new THREE.Mesh(new THREE.RingGeometry(18, 20, 64), new THREE.MeshBasicMaterial({ color: 0xffffff })); mark.rotation.x = -Math.PI / 2; mark.position.y = 1.45; g.add(mark);
  return g;
}

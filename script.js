/* ==========================================================
   Angles of Elevation and Depression: interactive 3D lesson
   Three.js r128 scenes + KaTeX + lesson interactivity
   ========================================================== */
(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));
const ease = x => 1 - Math.pow(1 - x, 3);
const RAD = Math.PI / 180, DEG = 180 / Math.PI;
const hasGL = typeof THREE !== 'undefined';
const hasKatex = typeof katex !== 'undefined' && typeof renderMathInElement !== 'undefined';
const DELIMS = [{ left: '\\[', right: '\\]', display: true }, { left: '\\(', right: '\\)', display: false }];

/* ---------- layout modes: JS sets body classes, CSS reads them (one source of truth) ----------
   sheet  = phones and tablets in portrait: lesson card is a bottom sheet over the scene
   side   = phones in landscape (short screens): card on the left, scene on the right
   drawer = sheet or side: the sidebar becomes a slide-in drawer
   (none) = laptops and tablets in landscape: docked sidebar, card on the left */
const mqSheet = window.matchMedia('(max-width:900px) and (min-height:501px), (orientation:portrait) and (max-width:1100px)');
const mqSide = window.matchMedia('(max-height:500px) and (orientation:landscape)');
const mqTight = window.matchMedia('(max-width:1280px)');
const mqCoarse = window.matchMedia('(pointer:coarse)');
const mqMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const motionOff = () => mqMotion.matches || document.documentElement.dataset.motion === 'reduce';
const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } }, del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } } };
function applyLayout() {
  const c = document.body.classList;
  c.toggle('sheet', mqSheet.matches);
  c.toggle('side', !mqSheet.matches && mqSide.matches);
  c.toggle('drawer', mqSheet.matches || mqSide.matches);
}
const isDrawer = () => document.body.classList.contains('drawer');
applyLayout();

/* ---------- KaTeX helpers ---------- */
function typeset(el) {
  if (!hasKatex) return;
  try { renderMathInElement(el || document.body, { delimiters: DELIMS, throwOnError: false }); } catch (e) { /* ignore */ }
}
function ktx(el, tex) {
  if (!el || el._t === tex) return;
  el._t = tex;
  if (hasKatex) { try { katex.render(tex, el, { throwOnError: false }); return; } catch (e) { /* fall through */ } }
  el.textContent = tex;
}

/* ==========================================================
   3D WORLD
   ========================================================== */
let W = null; // world, set by initGL()
const S = name => (W && W.scenes[name]) || null;
const ALIAS = { d0: 'demo', d1: 'demo', d2: 'demo', d3: 'demo', c0: 'concept', c1: 'concept', c2: 'concept' };

function initGL() {
  const canvas = $('#c');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (e) { return null; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mqCoarse.matches ? 1.5 : 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);

  const root = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 500);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x9dbdb0, 0.95);
  root.add(hemi);
  const grounds = [], cloudMats = [];
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.0);
  sun.position.set(-12, 26, 18);
  sun.castShadow = true;
  const sm = mqCoarse.matches ? 512 : 1024; sun.shadow.mapSize.set(sm, sm);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 90 });
  sun.shadow.bias = -0.0006;
  root.add(sun);


  /* ---------- small helpers ---------- */
  const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const M = (c, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.6, metalness: 0.05, flatShading: true }, o));
  const B = (c, o = {}) => new THREE.MeshBasicMaterial(Object.assign({ color: c, transparent: true }, o));
  const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };
  const shade = (o, cast = true, recv = true) => { o.traverse(m => { if (m.isMesh) { m.castShadow = cast; m.receiveShadow = recv; } }); return o; };
  const UP = V3(0, 1, 0);
  const _d = V3(), _p = V3(), _s = V3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
  const C = { amber: 0xc98a1b, cyan: 0x1b8a9a, lime: 0x2e9e6b, pink: 0x8e5a9b, coral: 0xc9694f, violet: 0x6a68b0, white: 0x3d5a50 };
  const CSS = { amber: '#c98a1b', cyan: '#1b8a9a', lime: '#2e9e6b', pink: '#8e5a9b', coral: '#c9694f', violet: '#6a68b0', white: '#3d5a50' };
  const LB = (k, t, p, c) => ({ k, t, p, c });

  const CYL = new THREE.CylinderGeometry(1, 1, 1, 10, 1);
  function Beam(color, r = 0.07, op = 1) { const m = new THREE.Mesh(CYL, B(color, { opacity: op })); m.userData.r = r; return m; }
  function setBeam(m, a, b, k = 1) {
    _d.subVectors(b, a);
    const len = _d.length() || 1e-4;
    m.position.copy(a).addScaledVector(_d, 0.5);
    m.quaternion.setFromUnitVectors(UP, _d.normalize());
    const r = m.userData.r * k;
    m.scale.set(r, len, r);
  }
  function Dashed(color, r = 0.04, n = 90, op = 0.9) {
    const im = new THREE.InstancedMesh(CYL, B(color, { opacity: op }), n);
    im.userData = { r, n }; im.frustumCulled = false; im.count = 0; return im;
  }
  function setDashed(im, a, b, dash = 0.5, gap = 0.35) {
    _d.subVectors(b, a);
    const len = _d.length();
    if (len < 1e-3) { im.count = 0; return; }
    const dir = _d.clone().normalize();
    _q.setFromUnitVectors(UP, dir);
    let step = dash + gap;
    const n = im.userData.n;
    if (len / step > n) { const f = len / (n * step); dash *= f; gap *= f; step *= f; }
    let k = 0;
    for (let d = 0; d < len - 1e-3 && k < n; d += step) {
      const l = Math.min(dash, len - d);
      _p.copy(dir).multiplyScalar(d + l / 2).add(a);
      _s.set(im.userData.r, l, im.userData.r);
      _m.compose(_p, _q, _s);
      im.setMatrixAt(k++, _m);
    }
    im.count = k; im.instanceMatrix.needsUpdate = true;
  }
  /* animated segment: draws itself from a to b */
  function Seg(parent, color, r, a, b, delay = 0, dash = false) {
    const o = { a: a.clone(), b: b.clone(), delay, p: 0, e: 1, eT: 1, dash, r };
    o.m = dash ? Dashed(color, r) : Beam(color, r);
    parent.add(o.m); return o;
  }
  function segTick(o, age, dt, dur = 0.8) {
    o.p = ease(clamp((age - o.delay) / dur, 0, 1));
    o.e = damp(o.e, o.eT, 9, dt);
    _p.copy(o.b).sub(o.a).multiplyScalar(o.p).add(o.a);
    o.m.visible = o.p > 0.001;
    if (o.dash) setDashed(o.m, o.a, _p, o.r * 12, o.r * 8); else setBeam(o.m, o.a, _p, o.e);
  }
  function Arc(color, rad, thick = 0.14) {
    const g = new THREE.Group();
    const fill = new THREE.Mesh(new THREE.CircleGeometry(rad, 4, 0, 0.1), B(color, { opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }));
    const ring = new THREE.Mesh(new THREE.RingGeometry(rad - thick, rad, 4, 1, 0, 0.1), B(color, { opacity: 0.95, side: THREE.DoubleSide }));
    g.add(fill, ring); g.userData = { rad, thick, a0: 9, a1: 9 }; return g;
  }
  function setArc(g, c, a0, a1) {
    if (a1 < a0) { const t = a0; a0 = a1; a1 = t; }
    const u = g.userData, len = Math.max(a1 - a0, 0.001);
    if (Math.abs(u.a0 - a0) > 1e-4 || Math.abs(u.a1 - a1) > 1e-4) {
      u.a0 = a0; u.a1 = a1;
      const seg = Math.max(4, Math.ceil(len * 12));
      g.children[0].geometry.dispose(); g.children[1].geometry.dispose();
      g.children[0].geometry = new THREE.CircleGeometry(u.rad, seg, a0, len);
      g.children[1].geometry = new THREE.RingGeometry(u.rad - u.thick, u.rad, seg, 1, a0, len);
    }
    g.position.set(c.x, c.y, c.z + 0.02);
    g.visible = len > 0.012;
  }
  const arcMid = (c, rad, a0, a1, k = 1.5) => { const m = (a0 + a1) / 2; return V3(c.x + rad * k * Math.cos(m), c.y + rad * k * Math.sin(m), c.z); };
  function Marker(color, r = 0.28) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.SphereGeometry(r, 16, 12), B(color, { opacity: 1 })));
    const ring = mesh(new THREE.RingGeometry(r * 1.5, r * 1.8, 32), B(color, { opacity: 0.6, side: THREE.DoubleSide }));
    g.add(ring); g.userData.ring = ring; return g;
  }
  function markerTick(g, t) { const s = 1 + 0.3 * Math.sin(t * 4); g.userData.ring.scale.setScalar(s); g.userData.ring.material.opacity = 0.7 - 0.35 * Math.sin(t * 4 + 1); }

  /* ---------- sight-line rig: horizontal, ray, drop, angle arc ---------- */
  class Rig {
    constructor(parent, color, O, T, o = {}) {
      const u = o.u || 1, d = o.delay == null ? 0 : o.delay, z0 = V3();
      this.rad = o.rad || 2; this.d0 = d; this.O = V3(); this.T = V3();
      this.g = new THREE.Group(); parent.add(this.g);
      this.hz = Seg(this.g, o.hzColor || C.white, 0.04 * u, z0, z0, d, true);
      this.ray = o.ray === false ? null : Seg(this.g, color, 0.07 * u, z0, z0, d + 0.45, false);
      this.vt = o.vert ? Seg(this.g, color, 0.035 * u, z0, z0, d + 1.1, true) : null;
      this.arc = Arc(color, this.rad, o.thick || 0.14 * u); this.g.add(this.arc);
      this.set(O, T);
    }
    set(O, T) {
      this.O.copy(O); this.T.copy(T);
      const hx = V3(T.x, O.y, O.z);
      this.hz.a.copy(O); this.hz.b.copy(hx);
      if (this.ray) { this.ray.a.copy(O); this.ray.b.copy(T); }
      if (this.vt) { this.vt.a.copy(hx); this.vt.b.copy(T); }
      const dx = T.x - O.x, dy = T.y - O.y;
      this.base = dx >= 0 ? 0 : Math.PI;
      let d = Math.atan2(dy, dx) - this.base;
      d = ((d + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
      this.sweep = d; this.deg = Math.abs(d) * DEG; this.len = Math.hypot(dx, dy);
    }
    mid(k = 1.6) { return arcMid(this.O, this.rad, this.base, this.base + this.sweep, k); }
    tick(age, dt) {
      segTick(this.hz, age, dt);
      if (this.ray) segTick(this.ray, age, dt);
      if (this.vt) segTick(this.vt, age, dt);
      const p = ease(clamp((age - this.d0 - 0.75) / 0.9, 0, 1));
      setArc(this.arc, this.O, this.base, this.base + this.sweep * p);
    }
  }

  /* ---------- scenery ---------- */
  function addGround(g, r = 34) {
    const d = mesh(new THREE.CircleGeometry(r, 64), M(0xcfe3d8, { flatShading: false, roughness: 0.9 }));
    grounds.push(d.material);
    d.rotation.x = -Math.PI / 2; d.receiveShadow = true; g.add(d);
    const grid = new THREE.GridHelper(r * 2, r, 0x0b6e4f, 0x0b6e4f);
    grid.material.transparent = true; grid.material.opacity = 0.16; grid.position.y = 0.01; g.add(grid);
  }
  function Tree(x, z, s = 1) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.12 * s, 0.17 * s, 0.9 * s, 6), M(0x7a4b2a), 0, 0.45 * s, 0));
    g.add(mesh(new THREE.ConeGeometry(0.8 * s, 1.6 * s, 7), M(0x1fa86a), 0, 1.5 * s, 0));
    g.add(mesh(new THREE.ConeGeometry(0.6 * s, 1.3 * s, 7), M(0x2ccf86), 0, 2.2 * s, 0));
    g.position.set(x, 0, z); return shade(g);
  }
  function Cloud(x, y, z, s = 1) {
    const g = new THREE.Group(), m = B(0xffffff, { opacity: 0.9 });
    cloudMats.push(m);
    [[0, 0, 1], [1, -0.1, 0.8], [-1, -0.1, 0.75], [0.4, 0.5, 0.7]].forEach(a => g.add(mesh(new THREE.SphereGeometry(a[2], 12, 8), m, a[0], a[1], 0)));
    g.position.set(x, y, z); g.scale.setScalar(s); g.userData.sp = 0.1 + Math.random() * 0.15; return g;
  }
  function Building({ w = 4, d = 4, floors = 3, fh = 3, color = 0xf1f5f2 } = {}) {
    const g = new THREE.Group(), H = floors * fh;
    g.add(mesh(new THREE.BoxGeometry(w, H, d), M(color), 0, H / 2, 0));
    g.add(mesh(new THREE.BoxGeometry(w + 0.3, 0.2, d + 0.3), M(0x6f8f83), 0, H + 0.02, 0));
    const wm = M(0xffd98a, { emissive: 0xffb84d, emissiveIntensity: 0.55 });
    const ww = fh * 0.24, wh = fh * 0.38;
    for (let f = 0; f < floors; f++) {
      const y = f * fh + fh * 0.58;
      g.add(mesh(new THREE.BoxGeometry(w + 0.05, 0.08, d + 0.05), M(0xb8cbc2), 0, f * fh + 0.04, 0));
      for (const z of [-d / 4, d / 4]) g.add(mesh(new THREE.BoxGeometry(0.05, wh, ww), wm, -w / 2 - 0.01, y, z));
      for (const x of [-w / 4, w / 4]) g.add(mesh(new THREE.BoxGeometry(ww, wh, 0.05), wm, x, y, d / 2 + 0.01));
    }
    g.add(mesh(new THREE.BoxGeometry(0.06, fh * 0.55, fh * 0.28), M(0x4a2d1a), -w / 2 - 0.02, fh * 0.275, 0));
    g.userData.H = H; return shade(g);
  }
  function Human(shirt = 0x4de1ff, pants = 0x35564a, skin = 0xf3c9a0, hair = 0x2a1b14) {
    const g = new THREE.Group();
    for (const z of [-0.1, 0.1]) {
      g.add(mesh(new THREE.CylinderGeometry(0.085, 0.075, 0.8, 10), M(pants), 0, 0.4, z));
      g.add(mesh(new THREE.BoxGeometry(0.3, 0.1, 0.14), M(0x1f2f2a), 0.06, 0.05, z));
    }
    g.add(mesh(new THREE.CylinderGeometry(0.19, 0.16, 0.7, 12), M(shirt), 0, 1.15, 0));
    const head = new THREE.Group(); head.position.set(0, 1.5, 0);
    head.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 8), M(skin), 0, 0.05, 0));
    head.add(mesh(new THREE.SphereGeometry(0.16, 16, 12), M(skin), 0, 0.22, 0));
    head.add(mesh(new THREE.SphereGeometry(0.17, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), M(hair), -0.015, 0.23, 0));
    for (const z of [-0.06, 0.06]) head.add(mesh(new THREE.SphereGeometry(0.025, 8, 6), M(0x111111), 0.15, 0.23, z));
    g.add(head);
    for (const z of [-0.23, 0.23]) {
      const arm = new THREE.Group(); arm.position.set(0, 1.45, z);
      arm.add(mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.6, 8), M(shirt), 0, -0.3, 0));
      arm.add(mesh(new THREE.SphereGeometry(0.065, 8, 6), M(skin), 0, -0.63, 0));
      g.add(arm);
    }
    g.userData = { head, f: 1 };
    return shade(g);
  }
  const eyeOf = (h, out = V3()) => out.set(h.position.x + h.userData.f * 0.16 * h.scale.x, h.position.y + 1.72 * h.scale.y, h.position.z);
  function Bird(s = 1) {
    const g = new THREE.Group();
    const body = mesh(new THREE.SphereGeometry(0.26, 12, 10), M(C.pink)); body.scale.x = 1.3; g.add(body);
    g.add(mesh(new THREE.SphereGeometry(0.15, 12, 10), M(C.pink), 0.3, 0.14, 0));
    const beak = mesh(new THREE.ConeGeometry(0.05, 0.16, 6), M(C.amber), 0.47, 0.14, 0); beak.rotation.z = -Math.PI / 2; g.add(beak);
    g.add(mesh(new THREE.BoxGeometry(0.3, 0.04, 0.12), M(0x6f4478), -0.42, 0.05, 0));
    const wings = [];
    for (const z of [-1, 1]) {
      const w = new THREE.Group(); w.position.set(0, 0.1, z * 0.12);
      w.add(mesh(new THREE.BoxGeometry(0.32, 0.03, 0.34), M(0xc79ad0), 0, 0, z * 0.17));
      g.add(w); wings.push(w);
    }
    g.userData.wings = wings; g.scale.setScalar(s); return shade(g);
  }
  function Protractor(R, down) {
    const g = new THREE.Group(), a0 = down ? -Math.PI : 0;
    g.add(mesh(new THREE.CircleGeometry(R, 48, a0, Math.PI), B(0x7fb8a2, { opacity: 0.13, side: THREE.DoubleSide, depthWrite: false })));
    g.add(mesh(new THREE.RingGeometry(R - 0.05, R, 64, 1, a0, Math.PI), B(0x3d5a50, { opacity: 0.55, side: THREE.DoubleSide })));
    const pts = [];
    for (let d = 0; d <= 180; d += 5) {
      const a = a0 + d * RAD, l = d % 10 === 0 ? 0.4 : 0.22;
      pts.push(Math.cos(a) * (R - l), Math.sin(a) * (R - l), 0, Math.cos(a) * R, Math.sin(a) * R, 0);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x3d5a50, transparent: true, opacity: 0.6 })));
    return g;
  }
  function Sea(w, d, x0) {
    const geo = new THREE.PlaneGeometry(w, d, 48, 24);
    const m = mesh(geo, M(0x3aa6b5, { transparent: true, opacity: 0.84, metalness: 0.3, roughness: 0.25 }));
    m.rotation.x = -Math.PI / 2; m.position.set(x0 + w / 2, 0, 0); m.receiveShadow = true;
    const pos = geo.attributes.position, base = pos.array.slice();
    m.userData.tick = t => {
      for (let i = 0; i < pos.count; i++) pos.array[i * 3 + 2] = Math.sin(base[i * 3] * 0.5 + t * 1.6) * 0.09 + Math.cos(base[i * 3 + 1] * 0.7 + t * 1.2) * 0.07;
      pos.needsUpdate = true;
    };
    const bed = mesh(new THREE.PlaneGeometry(w, d), M(0x2d6f7f, { flatShading: false }), x0 + w / 2, -0.7, 0);
    bed.rotation.x = -Math.PI / 2;
    const g = new THREE.Group(); g.add(m, bed); g.userData.sea = m; return g;
  }
  function Boat() {
    const g = new THREE.Group(), sh = new THREE.Shape();
    sh.moveTo(-1.5, 0.35); sh.lineTo(1.7, 0.35); sh.lineTo(1.2, -0.3); sh.lineTo(-1.1, -0.3); sh.closePath();
    const hull = mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.9, bevelEnabled: false }), M(0xf5f7ff)); hull.position.z = -0.45; g.add(hull);
    g.add(mesh(new THREE.BoxGeometry(3.25, 0.1, 0.95), M(0xc9694f), 0.1, 0.3, 0));
    g.add(mesh(new THREE.BoxGeometry(0.8, 0.45, 0.65), M(C.amber), -0.5, 0.6, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6), M(0x8a6a4a), 0.55, 1.35, 0));
    const tri = new THREE.Shape(); tri.moveTo(0, 0); tri.lineTo(1.1, 0); tri.lineTo(0, 1.8); tri.closePath();
    g.add(mesh(new THREE.ShapeGeometry(tri), M(0xffffff, { side: THREE.DoubleSide }), 0.6, 0.5, 0));
    return shade(g);
  }
  function Canoe() {
    const g = new THREE.Group();
    const hull = mesh(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M(C.amber, { side: THREE.DoubleSide }), 0, 0.12, 0);
    hull.scale.set(1.7, 0.5, 0.5); g.add(hull);
    const pad = new THREE.Group(); pad.position.set(0, 0.35, 0.1); pad.rotation.z = 0.5;
    pad.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 6), M(0x8a6a4a)));
    pad.add(mesh(new THREE.BoxGeometry(0.22, 0.4, 0.03), M(0xc9694f), 0, -0.8, 0));
    g.add(pad); g.userData.pad = pad; return shade(g);
  }
  function Lighthouse(h) {
    const g = new THREE.Group(), n = 5, sh = h / n;
    for (let i = 0; i < n; i++) {
      const r0 = 1.15 - i * 0.1, r1 = 1.15 - (i + 1) * 0.1;
      g.add(mesh(new THREE.CylinderGeometry(r1, r0, sh, 20), M(i % 2 ? 0xffffff : 0xc9694f), 0, sh * i + sh / 2, 0));
    }
    g.add(mesh(new THREE.CylinderGeometry(0.95, 0.75, 0.22, 20), M(0x5b6f68), 0, h + 0.1, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.6, 16), M(0xfff1a8, { emissive: 0xffd24d, emissiveIntensity: 1 }), 0, h + 0.5, 0));
    g.add(mesh(new THREE.ConeGeometry(0.62, 0.55, 16), M(0xc9694f), 0, h + 1.1, 0));
    const beam = mesh(new THREE.ConeGeometry(1.1, 7, 16, 1, true), B(0xf2c76b, { opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
    beam.geometry.translate(0, -3.5, 0); beam.rotation.z = Math.PI / 2; beam.position.y = h + 0.5;
    const spin = new THREE.Group(); spin.add(beam); g.add(spin); g.userData.spin = spin;
    g.add(mesh(new THREE.IcosahedronGeometry(2.1, 0), M(0x7d8c86), 0, 0.2, 0));
    return shade(g);
  }
  function Cliff(h, x2, depth = 9) {
    const g = new THREE.Group(), n = 5, lh = h / n, cols = [0x8a8f7a, 0x9a9f86, 0x7c8270, 0xa3a890, 0x888d77];
    for (let i = 0; i < n; i++) {
      const w = 6 + (i % 2) * 0.7;
      g.add(mesh(new THREE.BoxGeometry(w, lh + 0.02, depth - (i % 2) * 0.6), M(cols[i]), x2 - w / 2 - (i % 2) * 0.12, lh * i + lh / 2, 0));
    }
    g.add(mesh(new THREE.BoxGeometry(6.2, 0.3, depth + 0.2), M(0x2fbf71), x2 - 3.1, h + 0.12, 0));
    const t1 = Tree(x2 - 3.6, -2, 0.7), t2 = Tree(x2 - 4.6, 2.4, 0.9);
    t1.position.y = h + 0.25; t2.position.y = h + 0.25;
    g.add(t1, t2);
    return shade(g);
  }
  function Ladder(len) {
    const g = new THREE.Group(), wm = M(0xd9a15b);
    for (const z of [-0.28, 0.28]) g.add(mesh(new THREE.BoxGeometry(0.07, len, 0.07), wm, 0, len / 2, z));
    for (let y = 0.35; y < len - 0.1; y += 0.4) { const r = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.56, 6), wm, 0, y, 0); r.rotation.x = Math.PI / 2; g.add(r); }
    return shade(g);
  }
  function Car() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(2.2, 0.5, 1), M(0xc9694f), 0, 0.5, 0));
    g.add(mesh(new THREE.BoxGeometry(1.1, 0.42, 0.9), M(0xf0c4b8), -0.1, 0.96, 0));
    for (const x of [-0.7, 0.7]) for (const z of [-0.5, 0.5]) { const w = mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.18, 12), M(0x222222), x, 0.25, z); w.rotation.x = Math.PI / 2; g.add(w); }
    return shade(g);
  }
  function windowTexture() {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const x = cv.getContext('2d');
    x.fillStyle = '#e9f1ec'; x.fillRect(0, 0, 64, 64);
    x.fillStyle = '#b8cbc2'; x.fillRect(0, 0, 64, 4);
    x.fillStyle = '#f0d08a'; x.fillRect(9, 14, 18, 26); x.fillRect(37, 14, 18, 26);
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  }
  const edgeLines = geo => new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x3d5a50, transparent: true, opacity: 0.6 }));

  /* ==========================================================
     SCENE BASE
     ========================================================== */
  class Scene {
    constructor(name) {
      this.name = name; this.g = new THREE.Group(); this.g.visible = false; root.add(this.g);
      this.app = 0; this.want = 0; this.age = 0;
      this.size = [20, 12]; this.cam = { t: [0, 3, 0], az: 0.15, el: 0.14 };
      this.clouds = [Cloud(-14, 14, -10, 1.3), Cloud(12, 17, -12, 1.6)];
      this.clouds.forEach(c => this.g.add(c));
    }
    enter() { this.want = 1; this.age = 0; this.app = 0; this.g.visible = true; this.g.scale.setScalar(0.86); }
    leave() { this.want = 0; }
    frame(t, dt) {
      this.app = damp(this.app, this.want, this.want ? 6 : 12, dt);
      if (this.want === 0 && this.app < 0.01) { this.g.visible = false; return; }
      this.age += dt;
      this.g.scale.setScalar(0.86 + 0.14 * ease(clamp(this.app, 0, 1)));
      this.clouds.forEach(c => { c.position.x += c.userData.sp * dt; if (c.position.x > 40) c.position.x = -40; });
      this.tick(t, dt);
    }
    tick() {}
    labels() { return []; }
  }

  /* ==========================================================
     SCENE: RPK right-angled triangle
     ========================================================== */
  class RPK extends Scene {
    constructor() {
      super('rpk');
      this.size = [12, 8.5]; this.cam = { t: [0, 2.6, 0], az: 0.2, el: 0.12 };
      this.hl = null;
      addGround(this.g, 20);
      const A = this.A = V3(-4, 0, 0.35), Bp = this.Bp = V3(4, 0, 0.35), Cp = this.Cp = V3(4, 5.4, 0.35);
      const sh = new THREE.Shape(); sh.moveTo(A.x, 0); sh.lineTo(Bp.x, 0); sh.lineTo(Cp.x, Cp.y); sh.closePath();
      const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.6, bevelEnabled: false }); geo.translate(0, 0, -0.3);
      const slab = mesh(geo, M(0x7fb8a2, { transparent: true, opacity: 0.3, flatShading: false, depthWrite: false }));
      slab.add(edgeLines(geo)); slab.castShadow = true; this.g.add(slab);
      this.sides = {
        AB: Seg(this.g, C.lime, 0.1, A, Bp, 0.1),
        CB: Seg(this.g, C.cyan, 0.1, Bp, Cp, 0.7),
        AC: Seg(this.g, C.pink, 0.1, A, Cp, 1.3)
      };
      const sq = new THREE.BufferGeometry();
      sq.setAttribute('position', new THREE.Float32BufferAttribute([3.4, 0, 0.36, 3.4, 0.6, 0.36, 3.4, 0.6, 0.36, 4, 0.6, 0.36], 3));
      this.g.add(new THREE.LineSegments(sq, new THREE.LineBasicMaterial({ color: 0x3d5a50 })));
      this.th = Math.atan2(Cp.y, Bp.x - A.x);
      this.arc = Arc(C.amber, 1.9, 0.16); this.g.add(this.arc);
      this.g.add(Tree(-8.5, -2, 1.1), Tree(8, -3, 1.3));
    }
    tick(t, dt) {
      for (const k in this.sides) { const s = this.sides[k]; s.eT = this.hl === k ? 2.8 : 1; segTick(s, this.age, dt); }
      setArc(this.arc, this.A, 0, this.th * ease(clamp((this.age - 2) / 0.9, 0, 1)));
    }
    labels() {
      const a = this.age, A = this.A, Bp = this.Bp, Cp = this.Cp, o = [];
      o.push(LB(0, 'A', V3(A.x - 0.6, -0.6, 0.4), CSS.white), LB(1, 'B', V3(Bp.x + 0.6, -0.6, 0.4), CSS.white), LB(2, 'C', V3(Cp.x + 0.6, Cp.y + 0.3, 0.4), CSS.white));
      if (a > 2.4) o.push(LB(3, '\\theta', arcMid(A, 1.9, 0, this.th, 1.45), CSS.amber));
      if (a > 0.9) o.push(LB(4, '\\text{Adj}\\ |AB|', V3(0, -0.8, 0.4), CSS.lime));
      if (a > 1.5) o.push(LB(5, '\\text{Opp}\\ |CB|', V3(5.5, 2.7, 0.4), CSS.cyan));
      if (a > 2.1) o.push(LB(6, '\\text{Hyp}\\ |AC|', V3(-1.2, 3.3, 0.4), CSS.pink));
      return o;
    }
  }

  /* ==========================================================
     SCENE: Demo (Kwame, Ama and the block), four modes
     ========================================================== */
  class Demo extends Scene {
    constructor() {
      super('demo');
      this.size = [24, 14]; this.cam = { t: [2, 5.2, 0], az: 0.2, el: 0.12 };
      this.mode = 'd0'; this.named = false;
      addGround(this.g, 30);
      this.g.add(Tree(-11, -3, 1.2), Tree(-10, 3.5, 1), Tree(14, -4, 1.3), Tree(13, 3.5, 1.5));
      this.bld = Building({ w: 4, d: 4, floors: 3, fh: 3 }); this.bld.position.set(8, 0, 0); this.g.add(this.bld);
      this.kw = Human(C.cyan); this.kw.position.set(-7, 0, 0); this.g.add(this.kw);
      this.am = Human(C.pink); this.am.position.set(6.7, 9.12, 0); this.am.rotation.y = Math.PI; this.am.userData.f = -1; this.g.add(this.am);
      this.bird = Bird(0.8); this.g.add(this.bird);
      const O = this.O = eyeOf(this.kw), P = this.P = eyeOf(this.am);
      this.Tr = V3(6.2, 9.45, 0); this.Tg = V3(-2.2, 0.3, 0);
      this.r0 = new Rig(this.g, C.white, O, V3(5.9, O.y, 0), { rad: 2, vert: false });
      this.r1 = new Rig(this.g, C.amber, O, this.Tr, { rad: 3.4, vert: true });
      this.r2 = new Rig(this.g, C.cyan, O, this.Tg, { rad: 2.6, vert: true });
      this.r3a = new Rig(this.g, C.amber, O, P, { rad: 3.6, vert: true });
      this.r3b = new Rig(this.g, C.cyan, P, O, { rad: 3.6, ray: false, vert: false });
      this.setMode('d0');
    }
    setMode(m) {
      this.mode = m; this.age = 0;
      this.r0.g.visible = m === 'd0'; this.r1.g.visible = m === 'd1'; this.r2.g.visible = m === 'd2';
      this.r3a.g.visible = this.r3b.g.visible = m === 'd3';
      this.am.visible = m === 'd3'; this.bird.visible = m === 'd1' || m === 'd2';
      if (m === 'd1') { this.bird.position.set(6.2, 9.15, 0); this.bird.rotation.y = Math.PI; }
      if (m === 'd2') { this.bird.position.set(-2.2, 0.15, 0); this.bird.rotation.y = 0; }
    }
    setNamed() { this.named = true; }
    tick(t, dt) {
      const m = this.mode, a = this.age;
      this.r0.tick(a, dt); this.r1.tick(a, dt); this.r2.tick(a, dt); this.r3a.tick(a, dt); this.r3b.tick(a, dt);
      const k = ease(clamp((a - 0.4) / 1.4, 0, 1));
      const tgt = m === 'd1' ? this.r1.sweep : m === 'd2' ? this.r2.sweep : m === 'd3' ? this.r3a.sweep : 0;
      this.kw.userData.head.rotation.z = damp(this.kw.userData.head.rotation.z, tgt * k, 8, dt);
      this.am.userData.head.rotation.z = damp(this.am.userData.head.rotation.z, m === 'd3' ? -this.r3a.sweep * k : 0, 8, dt);
      this.bird.userData.wings.forEach((w, i) => { w.rotation.x = Math.sin(t * 9) * 0.35 * (i ? 1 : -1) * (m === 'd2' ? 1 : 0.25); });
      this.bird.position.y += Math.sin(t * 3) * 0.001;
    }
    labels() {
      const m = this.mode, n = this.named, a = this.age, o = [];
      if (m === 'd0' && a > 1) o.push(LB(0, '\\text{straight ahead}', V3(-1, 2.7, 0), CSS.white));
      if (m === 'd1' && a > 2) o.push(LB(0, n ? '\\text{angle of elevation}' : '\\theta', this.r1.mid(), CSS.amber));
      if (m === 'd2' && a > 2) o.push(LB(0, n ? '\\text{angle of depression}' : '\\theta', this.r2.mid(1.9), CSS.cyan));
      if (m === 'd3' && a > 2) {
        o.push(LB(0, n ? '\\text{elevation}' : '\\theta_1', this.r3a.mid(), CSS.amber));
        o.push(LB(1, n ? '\\text{depression}' : '\\theta_2', this.r3b.mid(), CSS.cyan));
        if (n) o.push(LB(2, '\\theta_{\\text{dep}}=\\theta_{\\text{elev}}', V3(1, 12.6, 0), CSS.lime));
      }
      return o;
    }
  }

  /* ==========================================================
     SCENE: Sightline model with slider
     ========================================================== */
  class Model extends Scene {
    constructor() {
      super('model');
      this.size = [24, 28]; this.cam = { t: [8.5, 11.5, 0], az: 0.18, el: 0.12 };
      this.D = 14; this.ang = 35; this.zOn = true;
      const gg = new THREE.Group(); gg.position.x = 8; this.g.add(gg); addGround(gg, 34);
      this.kw = Human(C.cyan); this.kw.position.set(0, 0, 0); this.g.add(this.kw);
      this.am = Human(C.pink); this.am.rotation.y = Math.PI; this.am.userData.f = -1; this.g.add(this.am);
      this.tex = windowTexture();
      const bg = new THREE.BoxGeometry(5, 1, 4);
      this.tw = mesh(bg, M(0xffffff, { map: this.tex, flatShading: false })); this.tw.add(edgeLines(bg)); shade(this.tw); this.g.add(this.tw);
      const O = eyeOf(this.kw), T = V3(O.x + this.D, O.y + 5, 0);
      this.rE = new Rig(this.g, C.amber, O, T, { rad: 4, vert: true, thick: 0.18 });
      this.rD = new Rig(this.g, C.cyan, T, O, { rad: 4, ray: false, vert: false, thick: 0.18, delay: 0.3 });
      this.p1 = Protractor(6, false); this.p2 = Protractor(6, true); this.g.add(this.p1, this.p2);
      this.g.add(Tree(-5, 3, 1.2), Tree(24, -4, 1.4));
      this.update();
    }
    setAngle(a) { this.ang = a; this.update(); }
    setZ(on) { this.zOn = on; this.update(); }
    update() {
      const th = this.ang * RAD, roof = this.D * Math.tan(th);
      const O = eyeOf(this.kw), T = V3(O.x + this.D, O.y + roof, 0);
      this.am.position.set(T.x + 0.16, roof, 0);
      this.tw.scale.y = roof; this.tw.position.set(this.am.position.x + 2, roof / 2, 0);
      this.tex.repeat.set(1.6, Math.max(1, roof / 3));
      this.rE.set(O, T); this.rD.set(T, O);
      this.rD.g.visible = this.zOn; this.p2.visible = this.zOn;
      this.p1.position.set(O.x, O.y, -0.05); this.p2.position.set(T.x, T.y, -0.05);
      this.O = O; this.T = T; this.h = roof;
    }
    tick(t, dt) {
      const a = this.age;
      this.rE.tick(a, dt); this.rD.tick(a, dt);
      const k = ease(clamp((a - 0.3) / 1.2, 0, 1)), th = this.ang * RAD;
      this.kw.userData.head.rotation.z = th * k;
      this.am.userData.head.rotation.z = -th * k;
    }
    labels() {
      if (this.age < 1.5) return [];
      const O = this.O, T = this.T, o = [];
      o.push(LB(0, '\\theta=' + this.ang + '^\\circ', this.rE.mid(1.45), CSS.amber));
      o.push(LB(1, '14\\text{ m}', V3(O.x + this.D / 2, O.y - 1.2, 0), CSS.lime));
      o.push(LB(2, 'h\\approx ' + this.h.toFixed(2) + '\\text{ m}', V3(T.x - 2.4, (O.y + T.y) / 2, 0), CSS.white));
      if (this.zOn) {
        o.push(LB(3, '\\theta=' + this.ang + '^\\circ', this.rD.mid(1.45), CSS.cyan));
        o.push(LB(4, '\\text{alternate angles}', V3(O.x + this.D / 2 - 1, T.y + 1.8, 0), CSS.lime));
      }
      return o;
    }
  }

  /* ==========================================================
     SCENE: generic worked problem (examples, tasks, questions)
     ========================================================== */
  class Problem extends Scene {
    constructor(name, cfg) {
      super(name);
      this.cfg = cfg; this.size = cfg.size; this.cam = cfg.cam;
      this.stage = 0; this.solved = false; this.flash = 0; this.altAge = 0; this.altWas = false;
      if (!cfg.noGround) { const gg = new THREE.Group(); gg.position.x = cfg.gx || 0; this.g.add(gg); addGround(gg, cfg.gr || 34); }
      this.extra = cfg.build(this, this.g) || null;
      const u = cfg.u || 1;
      this.rig = new Rig(this.g, cfg.color, cfg.O, cfg.T, { u, rad: cfg.rad, ray: cfg.ray, vert: true, thick: cfg.thick });
      this.alt = cfg.altOn ? new Rig(this.g, C.amber, cfg.T, cfg.O, { u, rad: cfg.rad, ray: false, vert: false, thick: cfg.thick }) : null;
      if (cfg.marker) { this.mk = Marker(cfg.color, 0.3 * u); this.mk.position.copy(cfg.O); this.g.add(this.mk); }
    }
    setStage(i) { if (i < this.stage) this.age = 0; this.stage = i; }
    solve() { this.solved = true; this.flash = 1; }
    tick(t, dt) {
      this.rig.tick(this.age, dt);
      if (this.alt) {
        const on = this.cfg.altOn(this.stage, this.solved);
        if (on && !this.altWas) this.altAge = 0;
        this.altWas = on; this.alt.g.visible = on;
        if (on) { this.altAge += dt; this.alt.tick(this.altAge, dt); }
      }
      this.flash = Math.max(0, this.flash - dt * 0.7);
      if (this.rig.ray) this.rig.ray.eT = 1 + this.flash * 1.8;
      if (this.mk) markerTick(this.mk, t);
      if (this.extra) this.extra(t, dt);
    }
    labels() {
      if (this.age < 1.2) return [];
      return this.cfg.labels({ st: this.stage, solved: this.solved, rig: this.rig, alt: this.alt, O: this.cfg.O, T: this.cfg.T });
    }
  }

  /* ==========================================================
     SCENE: Concept (lighthouse, shore observer and boat)
     ========================================================== */
  class Concept extends Scene {
    constructor() {
      super('concept');
      this.size = [44, 18]; this.cam = { t: [7, 6.6, 0], az: 0.2, el: 0.12 };
      this.mode = 'c0';
      this.g.add(shade(mesh(new THREE.BoxGeometry(18, 0.5, 26), M(0xcfe3d8, { flatShading: false }), -7, -0.25, 0)));
      this.g.add(Tree(-13, -4, 1.2), Tree(-12, 4, 1), Tree(-4, -5, 1.1));
      this.seaG = Sea(32, 26, 2); this.g.add(this.seaG);
      this.lh = Lighthouse(12); this.lh.scale.set(1.5, 1, 1.5); this.lh.position.set(8, 0, 0); this.g.add(this.lh);
      this.kw = Human(C.cyan); this.kw.position.set(-8, 0, 0); this.g.add(this.kw);
      this.boat = Boat(); this.boat.position.set(22, 0, 0); this.g.add(this.boat);
      const O = this.O = eyeOf(this.kw), L = this.L = V3(8, 12.5, 0), Tb = this.Tb = V3(22, 0.4, 0);
      this.rE = new Rig(this.g, C.amber, O, L, { rad: 4, vert: true });
      this.rD = new Rig(this.g, C.cyan, L, Tb, { rad: 5, vert: true });
      this.rB = new Rig(this.g, C.cyan, L, O, { rad: 4, ray: false, vert: false });
      this.setMode('c0');
    }
    setMode(m) {
      this.mode = m; this.age = 0;
      this.rE.g.visible = m !== 'c1'; this.rD.g.visible = m === 'c1'; this.rB.g.visible = m === 'c2';
    }
    tick(t, dt) {
      const a = this.age, m = this.mode;
      this.seaG.userData.sea.userData.tick(t);
      this.boat.position.y = Math.sin(t * 1.4) * 0.12; this.boat.rotation.z = Math.sin(t * 1.1) * 0.03;
      this.lh.userData.spin.rotation.y += dt;
      this.rE.tick(a, dt); this.rD.tick(a, dt); this.rB.tick(a, dt);
      const k = ease(clamp((a - 0.4) / 1.4, 0, 1));
      this.kw.userData.head.rotation.z = damp(this.kw.userData.head.rotation.z, m === 'c1' ? 0 : this.rE.sweep * k, 8, dt);
    }
    labels() {
      const m = this.mode, a = this.age, O = this.O, L = this.L, Tb = this.Tb, o = [];
      if (a < 1.6) return o;
      if (m === 'c0') {
        o.push(LB(0, '\\text{angle of elevation}', this.rE.mid(1.6), CSS.amber));
        o.push(LB(1, '\\text{horizontal}', V3(O.x + 5, O.y - 0.9, 0), CSS.white));
        o.push(LB(2, '\\text{line of sight}', V3((O.x + L.x) / 2 - 1.8, (O.y + L.y) / 2 + 1.2, 0), CSS.amber));
      } else if (m === 'c1') {
        o.push(LB(0, '\\text{angle of depression}', this.rD.mid(1.45), CSS.cyan));
        o.push(LB(1, '\\text{horizontal}', V3(L.x + 8, L.y + 0.9, 0), CSS.white));
        o.push(LB(2, '\\text{line of sight}', V3((L.x + Tb.x) / 2 + 1.6, (L.y + Tb.y) / 2 + 1.2, 0), CSS.cyan));
      } else {
        o.push(LB(0, '\\text{elevation}', this.rE.mid(1.6), CSS.amber));
        o.push(LB(1, '\\text{depression}', this.rB.mid(1.6), CSS.cyan));
        o.push(LB(2, '\\theta_{\\text{dep}}=\\theta_{\\text{elev}}', V3(0, 16, 0), CSS.lime));
      }
      return o;
    }
  }

  const P = (x, y, z = 0) => V3(x, y, z);
  const tanD = d => Math.tan(d * RAD);
  const scenes = {};
  scenes.rpk = new RPK();
  scenes.demo = new Demo();
  scenes.model = new Model();
  scenes.concept = new Concept();

  /* ---- Example 1: flagpole ---- */
  scenes.ex1 = new Problem('ex1', {
    size: [28, 17], cam: { t: [10, 6.6, 0], az: 0.18, el: 0.12 }, gx: 10, gr: 34,
    color: C.amber, O: P(0, 0.05), T: P(20, 20 * tanD(35)), rad: 5, u: 1.5, thick: 0.2, marker: true,
    build(s, g) {
      const pm = M(0xf2f5ff, { flatShading: false, emissive: 0xc98a1b, emissiveIntensity: 0 });
      g.add(shade(mesh(new THREE.CylinderGeometry(0.1, 0.14, 14, 10), pm, 20, 7, 0)));
      g.add(mesh(new THREE.SphereGeometry(0.22, 12, 10), M(C.amber), 20, 14.1, 0), mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.25, 16), M(0x7d8c86), 20, 0.12, 0));
      const fg = new THREE.PlaneGeometry(2.6, 1.5, 14, 1); fg.translate(1.3, 0, 0);
      const base = fg.attributes.position.array.slice();
      g.add(mesh(fg, M(0xc9694f, { side: THREE.DoubleSide }), 20.1, 13.1, 0));
      g.add(Tree(-4, -3, 1.2), Tree(5, 4.5, 1), Tree(27, -3, 1.4), Tree(14, -5, 1.1));
      return t => {
        const p = fg.attributes.position;
        for (let i = 0; i < p.count; i++) p.array[i * 3 + 2] = Math.sin(base[i * 3] * 2.2 - t * 5) * 0.2 * base[i * 3] / 2.6;
        p.needsUpdate = true;
        pm.emissiveIntensity = s.stage >= 3 ? 0.35 + 0.25 * Math.sin(t * 5) : 0;
      };
    },
    labels({ st, rig }) {
      const o = [LB(0, '35^\\circ', rig.mid(1.5), CSS.amber), LB(1, '20\\text{ m}', P(10, -1.3), CSS.lime), LB(2, st >= 3 ? 'h=14.00\\text{ m}' : 'h=\\,?', P(22.8, 7), CSS.cyan)];
      if (st >= 1) o.push(LB(3, st === 1 ? '\\tan 35^\\circ=\\dfrac{h}{20}' : st === 2 ? 'h=20\\tan 35^\\circ' : 'h=20\\times 0.7002=14.00\\text{ m}', P(9, 12.4), CSS.lime));
      return o;
    }
  });

  /* ---- Example 2: cliff and boat ---- */
  scenes.ex2 = new Problem('ex2', {
    size: [104, 58], cam: { t: [34, 22, 0], az: 0.16, el: 0.12 }, noGround: true,
    color: C.cyan, O: P(0, 40), T: P(75, 0), rad: 16, u: 2.6, thick: 0.6, marker: true,
    altOn: st => st >= 1,
    build(s, g) {
      g.add(Cliff(40, 0));
      g.add(shade(mesh(new THREE.BoxGeometry(34, 0.5, 60), M(0x86ac9c), -17, -0.25, 0)));
      const sea = Sea(100, 60, 0); g.add(sea);
      const boat = Boat(); boat.scale.setScalar(2.6); boat.position.set(75, 0, 0); g.add(boat);
      return t => { sea.userData.sea.userData.tick(t); boat.position.y = Math.sin(t * 1.4) * 0.14; boat.rotation.z = Math.sin(t * 1.1) * 0.03; };
    },
    labels({ st, rig, alt }) {
      const deg = st >= 3 ? '28^\\circ' : '\\theta';
      const o = [LB(0, deg, rig.mid(1.45), CSS.cyan), LB(2, '40\\text{ m}', P(79.5, 20), CSS.white), LB(3, '75\\text{ m}', P(37.5, -3), CSS.lime)];
      if (st >= 1) o.push(LB(1, deg, alt.mid(1.45), CSS.amber));
      if (st >= 2) o.push(LB(4, st === 2 ? '\\tan\\theta=\\dfrac{40}{75}=0.5333' : '\\theta=\\tan^{-1}(0.5333)\\approx 28^\\circ', P(38, 48), CSS.lime));
      return o;
    }
  });

  /* ---- Task A: building and boy ---- */
  (() => {
    const boyS = 1.5 / 1.72, Ox = 0.16 * boyS;
    scenes.ta = new Problem('ta', {
      size: [34, 26], cam: { t: [14, 10.5, 0], az: 0.18, el: 0.12 }, gx: 14, gr: 38,
      color: C.amber, O: P(Ox, 1.5), T: P(Ox + 24, 20.25), rad: 7, u: 1.3, thick: 0.25,
      build(s, g) {
        const boy = Human(C.cyan); boy.scale.setScalar(boyS); g.add(boy);
        const b = Building({ w: 6, d: 6, floors: 6, fh: 3.375 }); b.position.set(Ox + 24 + 3, 0, 0); g.add(b);
        g.add(Tree(-4, -3, 1.2), Tree(10, 4, 1.1), Tree(36, -4, 1.4));
        return (t, dt) => { boy.userData.head.rotation.z = damp(boy.userData.head.rotation.z, 38 * RAD * ease(clamp((s.age - 0.5) / 1.4, 0, 1)), 8, dt); };
      },
      labels({ solved, rig }) {
        const o = [LB(0, '38^\\circ', rig.mid(1.5), CSS.amber), LB(1, '24\\text{ m}', P(Ox + 12, -1.2), CSS.lime), LB(2, '1.5\\text{ m}', P(-1.9, 0.8), CSS.white), LB(3, solved ? 'h=20.25\\text{ m}' : 'h=\\,?', P(Ox + 21.5, 11), CSS.cyan)];
        if (solved) o.push(LB(4, '24\\tan 38^\\circ+1.5=20.25\\text{ m}', P(12, 24), CSS.lime));
        return o;
      }
    });
  })();

  /* ---- Task B: lighthouse and canoe ---- */
  scenes.tb = new Problem('tb', {
    size: [78, 54], cam: { t: [28, 23, 0], az: 0.16, el: 0.12 }, noGround: true,
    color: C.cyan, O: P(0, 45.2), T: P(60, 0), rad: 13, u: 2.2, thick: 0.5, marker: true,
    altOn: (st, solved) => solved,
    build(s, g) {
      const lh = Lighthouse(45); lh.scale.set(2.2, 1, 2.2); lh.position.set(-2.6, 0, 0); g.add(lh);
      const sea = Sea(130, 70, -35); g.add(sea);
      const cn = Canoe(); cn.scale.setScalar(2.4); cn.position.set(60, 0.05, 0); g.add(cn);
      return (t, dt) => { sea.userData.sea.userData.tick(t); cn.position.y = 0.05 + Math.sin(t * 1.5) * 0.12; cn.rotation.z = Math.sin(t * 1.2) * 0.04; cn.userData.pad.rotation.z = 0.5 + Math.sin(t * 2.2) * 0.25; lh.userData.spin.rotation.y += dt * 1.1; };
    },
    labels({ solved, rig, alt }) {
      const o = [LB(0, solved ? '\\theta\\approx 37^\\circ' : '\\theta=\\,?', rig.mid(1.5), CSS.cyan), LB(2, '45\\text{ m}', P(63.5, 22), CSS.white), LB(3, '60\\text{ m}', P(30, -3), CSS.lime)];
      if (solved) { o.push(LB(1, '37^\\circ', alt.mid(1.5), CSS.amber)); o.push(LB(4, '\\tan\\theta=\\dfrac{45}{60}=0.75', P(30, 34), CSS.lime)); }
      return o;
    }
  });

  /* ---- Question 1: ladder ---- */
  (() => {
    const bx = -8 * Math.cos(62 * RAD), top = 8 * Math.sin(62 * RAD);
    scenes.q1 = new Problem('q1', {
      size: [16, 14], cam: { t: [-1.5, 5.6, 0], az: 0.2, el: 0.12 }, gx: -1.5, gr: 16,
      color: C.amber, O: P(bx, 0.03), T: P(0, top), rad: 1.9, u: 0.9, thick: 0.12, ray: false,
      build(s, g) {
        const w = mesh(new THREE.BoxGeometry(1.4, 14, 10), M(0xc9ddd3, { transparent: true, opacity: 0.55, flatShading: false }), -0.7, 7, 0); w.add(edgeLines(w.geometry)); g.add(shade(w));
        const lad = Ladder(8); lad.position.set(bx, 0, 0); lad.rotation.z = -(90 - 62) * RAD; g.add(lad);
        g.add(Tree(-8, -3, 1.2), Tree(5, 3, 1.3));
      },
      labels({ solved, rig }) {
        const o = [LB(0, '62^\\circ', rig.mid(1.55), CSS.amber), LB(1, '8\\text{ m}', P(-3.3, 4.5), CSS.white), LB(2, solved ? 'h=7.06\\text{ m}' : 'h=\\,?', P(1.8, 3.5), CSS.cyan)];
        if (solved) o.push(LB(3, 'h=8\\sin 62^\\circ=7.06\\text{ m}', P(-3.5, 10), CSS.lime));
        return o;
      }
    });
  })();

  /* ---- Question 2: balcony and car ---- */
  (() => {
    const dx = 12 / tanD(25), Ox = 1;
    scenes.q2 = new Problem('q2', {
      size: [38, 18], cam: { t: [13, 7, 0], az: 0.18, el: 0.12 }, gx: 12, gr: 34,
      color: C.cyan, O: P(Ox, 12), T: P(Ox + dx, 0), rad: 9, u: 1.4, thick: 0.3, marker: true,
      altOn: (st, solved) => solved,
      build(s, g) {
        const b = Building({ w: 8, d: 8, floors: 4, fh: 3 }); b.position.set(-4, 0, 0); g.add(b);
        g.add(shade(mesh(new THREE.BoxGeometry(1.2, 0.15, 4), M(0xb8cbc2), 0.6, 11.9, 0)));
        const rail = M(0x6f8f83); g.add(mesh(new THREE.BoxGeometry(0.05, 0.05, 4), rail, 1.2, 12.8, 0));
        for (const z of [-2, 0, 2]) g.add(mesh(new THREE.BoxGeometry(0.05, 0.9, 0.05), rail, 1.2, 12.35, z));
        const car = Car(); car.scale.setScalar(1.5); car.position.set(Ox + dx, 0, 0); g.add(car);
        g.add(Tree(-10, 4, 1.4), Tree(30, -4, 1.3), Tree(12, -5, 1.1));
      },
      labels({ solved, rig, alt }) {
        const o = [LB(0, '25^\\circ', rig.mid(1.5), CSS.cyan), LB(2, '12\\text{ m}', P(Ox + dx + 2.6, 6), CSS.white), LB(3, solved ? 'd=25.73\\text{ m}' : 'd=\\,?', P(Ox + dx / 2, -1.3), CSS.lime)];
        if (solved) { o.push(LB(1, '25^\\circ', alt.mid(1.6), CSS.amber)); o.push(LB(4, 'd=\\dfrac{12}{\\tan 25^\\circ}=25.73\\text{ m}', P(14, 16), CSS.lime)); }
        return o;
      }
    });
  })();

  /* ==========================================================
     ENGINE: camera, labels, drag, loop
     ========================================================== */
  const pool = $$('#labels span');
  const host = $('#labels');
  while (pool.length < 8) { const s = document.createElement('span'); host.appendChild(s); pool.push(s); }

  const cs = { t: V3(0, 3, 0), az: 0.15, el: 0.14, d: 40 };
  const view = { fw: 0.58 };
  const drag = { az: 0, el: 0, on: false, x: 0, y: 0 };
  let cur = null, zoom = 1, snap = true, VW = 1, VH = 1, clock = 0, last = performance.now();
  const hint = document.createElement('div');
  hint.className = 'hint glass';
  hint.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16.466 7.5C15.643 4.237 13.952 2 12 2 9.239 2 7 6.477 7 12s2.239 10 5 10c.342 0 .677-.069 1-.2"/><path d="m15.194 13.707 3.814 1.86-1.86 3.814"/><path d="M19 15.57c-1.804.885-4.274 1.43-7 1.43-5.523 0-10-2.239-10-5s4.477-5 10-5c4.838 0 8.873 1.718 9.8 4"/></svg><span>' + (mqCoarse.matches ? 'Drag to rotate, pinch to zoom' : 'Drag to rotate the scene') + '</span>';
  hint.classList.add('off');
  document.body.appendChild(hint);
  const hideHint = () => hint.classList.add('off');

  function resize() {
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    if (w !== VW || h !== VH) { VW = w; VH = h; renderer.setSize(VW, VH, false); camera.aspect = VW / VH; }
    const sheet = document.body.classList.contains('sheet');
    const card = $('.card');
    const left = card ? card.offsetLeft + card.offsetWidth : VW * 0.5;
    view.fw = sheet ? 0.94 : clamp((VW - left) / VW * 0.9, 0.3, 0.7);
    camera.setViewOffset(VW, VH, sheet ? 0 : -left / 2, sheet ? VH * 0.17 : 0, VW, VH);
    camera.updateProjectionMatrix();
  }
  function fitDist(sc) {
    const mob = document.body.classList.contains('sheet'), tn = Math.tan(camera.fov * RAD / 2);
    const fw = view.fw, fh = mob ? 0.4 : 0.8;
    return Math.max((sc.size[1] / 2) / (tn * fh), (sc.size[0] / 2) / (tn * camera.aspect * fw));
  }

  const ptrs = new Map(); let pinch = 0;
  canvas.addEventListener('pointerdown', e => {
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    drag.on = true; drag.x = e.clientX; drag.y = e.clientY; pinch = 0;
    try { canvas.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
    hideHint();
  });
  canvas.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2) {
      const [p, q] = Array.from(ptrs.values()), d = Math.hypot(p.x - q.x, p.y - q.y);
      if (pinch) zoom = clamp(zoom * pinch / d, 0.55, 1.8);
      pinch = d; return;
    }
    if (!drag.on) return;
    drag.az = clamp(drag.az - (e.clientX - drag.x) * 0.006, -1.4, 1.4);
    drag.el = clamp(drag.el + (e.clientY - drag.y) * 0.004, -0.3, 1.0);
    drag.x = e.clientX; drag.y = e.clientY;
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => canvas.addEventListener(ev, e => {
    ptrs.delete(e.pointerId); pinch = 0; drag.on = ptrs.size > 0;
    if (ptrs.size === 1) { const p = ptrs.values().next().value; drag.x = p.x; drag.y = p.y; }
  }));
  canvas.addEventListener('dblclick', () => { drag.az = 0; drag.el = 0; zoom = 1; });
  canvas.addEventListener('wheel', e => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoom = clamp(zoom * Math.exp(e.deltaY * 0.002), 0.55, 1.8); } }, { passive: false });
  canvas.tabIndex = 0;
  canvas.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') drag.az = clamp(drag.az + 0.08, -1.4, 1.4);
    if (e.key === 'ArrowRight') drag.az = clamp(drag.az - 0.08, -1.4, 1.4);
    if (e.key === 'ArrowUp') drag.el = clamp(drag.el - 0.05, -0.3, 1.0);
    if (e.key === 'ArrowDown') drag.el = clamp(drag.el + 0.05, -0.3, 1.0);
  });

  const _v = V3();
  function placeLabels() {
    const used = {};
    if (cur && cur.g.visible && cur.app > 0.5) {
      cur.g.updateMatrixWorld(true); camera.updateMatrixWorld();
      for (const l of cur.labels()) {
        const el = pool[l.k]; if (!el) continue;
        used[l.k] = true;
        ktx(el, l.t);
        if (el._c !== l.c) { el._c = l.c; el.style.setProperty('--c', l.c); }
        cur.g.localToWorld(_v.copy(l.p)); _v.project(camera);
        const vis = _v.z < 1 && Math.abs(_v.x) < 1.3 && Math.abs(_v.y) < 1.3;
        if (vis) el.style.transform = 'translate(' + ((_v.x * 0.5 + 0.5) * VW).toFixed(1) + 'px,' + ((-_v.y * 0.5 + 0.5) * VH).toFixed(1) + 'px) translate(-50%,-50%)';
        el.classList.toggle('on', vis);
      }
    }
    pool.forEach((el, i) => { if (!used[i]) el.classList.remove('on'); });
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now; clock += dt;
    for (const k in scenes) if (scenes[k].g.visible) scenes[k].frame(clock, dt);
    if (cur) {
      const sway = drag.on || motionOff() ? 0 : Math.sin(clock * 0.3) * 0.05;
      const gt = V3(cur.cam.t[0], cur.cam.t[1], cur.cam.t[2]);
      const gaz = clamp(cur.cam.az + drag.az + sway, -1.5, 1.5), gel = clamp(cur.cam.el + drag.el, -0.2, 1.2), gd = fitDist(cur) * zoom;
      if (snap) { cs.t.copy(gt); cs.az = gaz; cs.el = gel; cs.d = gd; snap = false; }
      else { const k = 1 - Math.exp(-3.5 * dt); cs.t.lerp(gt, k); cs.az += (gaz - cs.az) * k; cs.el += (gel - cs.el) * k; cs.d += (gd - cs.d) * k; }
      camera.position.set(cs.t.x + cs.d * Math.sin(cs.az) * Math.cos(cs.el), cs.t.y + cs.d * Math.sin(cs.el), cs.t.z + cs.d * Math.cos(cs.az) * Math.cos(cs.el));
      camera.lookAt(cs.t);
    }
    renderer.render(root, camera);
    placeLabels();
  }

  function show(id) {
    const base = ALIAS[id] || id, sc = scenes[base];
    if (!sc) return;
    if (base !== id && sc.setMode) sc.setMode(id);
    if (cur !== sc) {
      if (cur) cur.leave();
      cur = sc; sc.enter();
      if (sc.mode) sc.setMode(sc.mode);
      drag.az = 0; drag.el = 0; zoom = 1;
    }
  }

  resize();
  window.addEventListener('resize', resize);
  requestAnimationFrame(frame);
  /* dark mode: dim the lights, darken the ground and clouds */
  function setDark(d) {
    hemi.intensity = d ? 0.62 : 0.95; hemi.color.setHex(d ? 0xbfd8ff : 0xffffff); hemi.groundColor.setHex(d ? 0x2a4a40 : 0x9dbdb0);
    sun.intensity = d ? 0.6 : 1.0; sun.color.setHex(d ? 0xcfd8ff : 0xfff1d6);
    grounds.forEach(m => m.color.setHex(d ? 0x1a3a31 : 0xcfe3d8));
    cloudMats.forEach(m => m.color.setHex(d ? 0x6d8780 : 0xffffff));
  }
  return { scenes, show, setDark, showHint() { hint.classList.remove('off'); setTimeout(hideHint, 9000); } };
}

/* ==========================================================
   UI: splash, navigation, quiz, steps, tasks, controls
   ========================================================== */
function confetti(el) {
  const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
  const cols = ['#ffc24d', '#4de1ff', '#7dffb0', '#ff6ad5', '#b69cff'];
  for (let i = 0; i < 30; i++) {
    const p = document.createElement('i'), a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 130;
    p.className = 'conf';
    p.style.cssText = 'left:' + x + 'px;top:' + y + 'px;background:' + cols[i % 5] + ';--dx:' + (Math.cos(a) * v).toFixed(0) + 'px;--dy:' + (Math.sin(a) * v - 40 + Math.random() * 150).toFixed(0) + 'px;--r:' + (Math.random() * 720 - 360).toFixed(0) + 'deg';
    document.body.appendChild(p);
    p.addEventListener('animationend', () => p.remove());
  }
}

function initSplash() {
  const go = $('#go'), splash = $('#splash');
  document.documentElement.style.overflow = 'hidden';
  let enabled = false;
  const enable = () => { if (enabled) return; enabled = true; go.disabled = false; go.textContent = 'Start lesson'; go.focus({ preventScroll: true }); };
  const minT = new Promise(r => setTimeout(r, 2500));
  const loaded = document.readyState === 'complete' ? Promise.resolve() : new Promise(r => window.addEventListener('load', r, { once: true }));
  const fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  Promise.all([minT, loaded, fonts]).then(enable);
  setTimeout(enable, 7000);
  go.addEventListener('click', () => {
    splash.classList.add('out');
    document.documentElement.style.overflow = '';
    window.scrollTo(0, 0);
    setTimeout(() => splash.remove(), 1000);
    if (W) W.showHint();
  });
}

function initNav() {
  const secs = $$('main section'), list = $('#steps'), pg = $('#pg'), body = document.body, count = $('#sbcount');
  const toggle = $('#sbtoggle'), choice = {}, items = [], seen = new Set();
  const defaults = { rpk: 'rpk', obj: 'rpk', concept: 'c0', d0: 'd0', model: 'model', ex1: 'ex1', ex2: 'ex2', ta: 'ta', q1: 'q1', quiz: 'c2' };
  const mobile = isDrawer, sidebar = $('#sidebar');
  const syncAria = () => {
    const open = mobile() ? body.classList.contains('sb-open') : !body.classList.contains('sb-collapsed');
    toggle.setAttribute('aria-expanded', String(open));
    sidebar.inert = mobile() && !open; /* closed drawer must not be reachable by keyboard or screen reader */
  };
  const refit = () => { window.dispatchEvent(new Event('resize')); setTimeout(() => window.dispatchEvent(new Event('resize')), 330); };
  const closeDrawer = () => { body.classList.remove('sb-open'); syncAria(); };

  secs.forEach((s, i) => {
    const chip = $('.chip', s), b = document.createElement('button');
    b.className = 'sb-item'; b.type = 'button'; b.title = s.dataset.n;
    b.innerHTML = '<i>' + (i + 1) + '</i><span><b>' + s.dataset.n + '</b><small>' + (chip ? chip.textContent : '') + '</small></span>';
    b.addEventListener('click', () => { s.scrollIntoView({ behavior: 'smooth' }); if (mobile()) closeDrawer(); });
    list.appendChild(b); items.push(b);
  });
  toggle.addEventListener('click', () => {
    if (mobile()) body.classList.toggle('sb-open'); else body.classList.toggle('sb-collapsed');
    syncAria(); refit();
    if (mobile() && body.classList.contains('sb-open')) { const f = $('.sb-item.on', list) || items[0]; if (f) setTimeout(() => f.focus({ preventScroll: true }), 60); }
  });
  $('#sbback').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && body.classList.contains('sb-open')) { closeDrawer(); toggle.focus(); } });
  /* small laptops and tablets start with the slim sidebar so the 3D scene gets room */
  let wasDrawer = mobile();
  if (!wasDrawer && mqTight.matches) body.classList.add('sb-collapsed');
  window.addEventListener('resize', () => {
    const d = mobile();
    const flipped = wasDrawer && !d && mqTight.matches && !body.classList.contains('sb-collapsed');
    wasDrawer = d;
    if (flipped) body.classList.add('sb-collapsed');
    if (!d) body.classList.remove('sb-open');
    syncAria();
    if (flipped) refit();
  });
  syncAria(); refit();

  const activate = sec => {
    secs.forEach((s, i) => { const on = s === sec; s.classList.toggle('active', on); items[i].classList.toggle('on', on); if (on) { seen.add(i); items[i].classList.add('seen'); } });
    count.textContent = seen.size + ' / ' + secs.length;
    const id = choice[sec.dataset.s] || defaults[sec.dataset.s];
    if (W && id) W.show(id);
  };
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) activate(e.target); }), { rootMargin: '-45% 0px -45% 0px' });
  secs.forEach(s => io.observe(s));
  const prog = () => { const m = document.documentElement.scrollHeight - window.innerHeight; pg.style.width = (m > 0 ? clamp(window.scrollY / m, 0, 1) * 100 : 0) + '%'; };
  window.addEventListener('scroll', prog, { passive: true }); prog();

  /* scene buttons (data-sc) and their tasks */
  $$('.btns').forEach(group => {
    const sec = group.closest('section'), card = group.closest('.card');
    $$('button[data-sc]', group).forEach(b => b.addEventListener('click', () => {
      $$('button[data-sc]', group).forEach(x => x.classList.toggle('on', x === b));
      $$('.task,.def', card).forEach(t => { t.hidden = t.dataset.for !== b.dataset.sc; });
      choice[sec.dataset.s] = b.dataset.sc;
      if (W) W.show(b.dataset.sc);
    }));
  });
}

function initLesson() {
  /* objectives checklist */
  const objs = $$('.objs input');
  objs.forEach(cb => cb.addEventListener('change', () => { if (objs.every(x => x.checked)) confetti(cb); }));

  /* RPK quiz with 3D highlight */
  $$('.q').forEach(q => {
    const fb = $('.fb', q), ans = q.dataset.a;
    $$('button[data-v]', q).forEach(b => {
      const on = () => { const s = S('rpk'); if (s) s.hl = b.dataset.v; };
      const off = () => { const s = S('rpk'); if (s) s.hl = null; };
      b.addEventListener('mouseenter', on); b.addEventListener('focus', on);
      b.addEventListener('mouseleave', off); b.addEventListener('blur', off);
      b.addEventListener('click', () => {
        const ok = b.dataset.v === ans;
        $$('button', q).forEach(x => x.classList.remove('ok', 'bad'));
        void b.offsetWidth;
        b.classList.add(ok ? 'ok' : 'bad');
        fb.className = 'fb ' + (ok ? 'ok' : 'bad');
        fb.textContent = ok ? 'Correct. \\(|CB|\\) faces \\(\\theta\\) without touching it, so it is the opposite side.' : 'Not quite. The opposite side faces \\(\\theta\\); it does not touch it.';
        typeset(fb);
        if (ok) { confetti(b); const s = S('rpk'); if (s) { s.hl = 'CB'; setTimeout(() => { s.hl = null; }, 2200); } }
        else { const s = S('rpk'), v = b.dataset.v; if (s) { s.hl = v; setTimeout(() => { if (s.hl === v) s.hl = null; }, 1800); } }
      });
    });
  });

  /* demo: name the angles */
  const name = $('#name'), named = $('#named');
  if (name) name.addEventListener('click', () => {
    named.hidden = false; name.disabled = true; confetti(name);
    const d = S('demo'); if (d) d.setNamed();
  });

  /* model controls */
  const ang = $('#ang'), out = $('#angv'), zt = $('#zt');
  const upd = () => { ktx(out, ang.value + '^\\circ'); const m = S('model'); if (m) m.setAngle(+ang.value); };
  ang.addEventListener('input', upd); upd();
  zt.addEventListener('change', () => { const m = S('model'); if (m) m.setZ(zt.checked); });

  /* worked-example steps */
  $$('.steps').forEach(list => {
    const sec = list.closest('section'), btn = $('.next', sec), items = $$('li', list);
    let n = 1;
    const render = () => {
      items.forEach((li, i) => { li.classList.toggle('show', i < n); li.classList.toggle('now', i === n - 1); });
      btn.textContent = n >= items.length ? 'Replay steps' : 'Next step';
      const s = S(sec.dataset.s); if (s) s.setStage(n - 1);
    };
    render();
    btn.addEventListener('click', () => { n = n >= items.length ? 1 : n + 1; render(); });
  });

  /* answer checking */
  $$('.task').forEach(task => {
    const inp = $('input', task), btn = $('.chk', task), fb = $('.fb', task);
    let tries = 0;
    const check = () => {
      const v = parseFloat(inp.value);
      if (isNaN(v)) { fb.className = 'fb bad'; fb.textContent = 'Enter a number first.'; return; }
      const a = +inp.dataset.a, ok = Math.abs(v - a) <= +inp.dataset.tol;
      inp.classList.toggle('ok', ok); inp.classList.toggle('bad', !ok); btn.classList.toggle('ok', ok);
      if (ok) {
        fb.className = 'fb ok'; fb.textContent = 'Correct. ' + fb.dataset.ok; confetti(btn);
        const s = S(task.dataset.for); if (s) s.solve();
      } else {
        tries++;
        fb.className = 'fb bad';
        fb.textContent = Math.abs(v - a) <= Math.max(0.5, a * 0.03)
          ? 'Close. Check your rounding.'
          : tries > 1 ? 'Hint: sketch the right-angled triangle, label Opp, Adj and Hyp, then pick the ratio.' : 'Not quite. Check that your calculator is in Degree mode.';
      }
      typeset(fb);
    };
    btn.addEventListener('click', check);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') check(); });
    inp.addEventListener('input', () => { inp.classList.remove('ok', 'bad'); btn.classList.remove('ok'); });
  });
}

/* ==========================================================
   Settings: theme, text size, reduced motion, reset
   ========================================================== */
function initSettings() {
  const root = document.documentElement, panel = $('#settings'), btn = $('#settoggle'), meta = $('meta[name=theme-color]');
  const mqDark = window.matchMedia('(prefers-color-scheme: dark)');
  const st = Object.assign({ theme: 'light', size: 'normal', motion: false }, store.get('angles-settings') || {});
  const apply = () => {
    const dark = st.theme === 'dark' || (st.theme === 'auto' && mqDark.matches);
    root.dataset.theme = dark ? 'dark' : 'light';
    if (st.size === 'normal') delete root.dataset.size; else root.dataset.size = st.size;
    if (st.motion) root.dataset.motion = 'reduce'; else delete root.dataset.motion;
    if (meta) meta.content = dark ? '#0c1f19' : '#0b6e4f';
    if (W && W.setDark) W.setDark(dark);
    $$('.seg', panel).forEach(g => $$('button', g).forEach(b => b.setAttribute('aria-checked', String(b.dataset.v === st[g.dataset.key]))));
    $('#set-motion').checked = !!st.motion;
  };
  const save = () => { store.set('angles-settings', st); apply(); };
  $$('.seg button', panel).forEach(b => b.addEventListener('click', () => { st[b.parentNode.dataset.key] = b.dataset.v; save(); }));
  $('#set-motion').addEventListener('change', e => { st.motion = e.target.checked; save(); });
  mqDark.addEventListener && mqDark.addEventListener('change', () => { if (st.theme === 'auto') apply(); });
  $('#set-reset').addEventListener('click', () => { store.del('angles-quiz-best'); location.reload(); });
  const close = () => { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  btn.addEventListener('click', () => { const open = panel.hidden; panel.hidden = !open; btn.setAttribute('aria-expanded', String(open)); if (open) { const f = $('.seg button[aria-checked=true]', panel); if (f) f.focus({ preventScroll: true }); } });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) { close(); btn.focus(); } });
  document.addEventListener('pointerdown', e => { if (!panel.hidden && !panel.contains(e.target) && !btn.contains(e.target)) close(); });
  /* install app: native prompt where the browser offers one, written steps elsewhere */
  const ib = $('#set-install'), im = $('#inst-msg');
  let deferred = null;
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const showInstalled = () => { ib.disabled = true; ib.textContent = 'App installed'; im.hidden = true; };
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; });
  window.addEventListener('appinstalled', () => { deferred = null; showInstalled(); });
  if (standalone()) showInstalled();
  ib.addEventListener('click', async () => {
    if (deferred) {
      deferred.prompt();
      try { await deferred.userChoice; } catch (e) { /* ignore */ }
      deferred = null; return;
    }
    im.hidden = false;
    im.textContent = isIOS
      ? 'On iPhone or iPad: tap the Share button in Safari, then choose Add to Home Screen.'
      : location.protocol === 'file:' ? 'Open the lesson from its web address first. Installing does not work from a local file.'
      : 'Open your browser menu and choose Install app (or Add to Home screen). If you do not see it, reload once while online.';
  });
  apply();
}

/* ==========================================================
   End-of-lesson quiz
   ========================================================== */
const QUIZ = [
  { q: 'The angle of elevation is measured between the line of sight and the…', a: ['horizontal line through the observer\'s eye', 'vertical line through the object', 'ground directly beneath the object', 'hypotenuse of the triangle'], c: 0,
    e: 'Both angles are measured from the <b>horizontal</b>, never from a vertical wall, pole or cliff.' },
  { q: 'From the top of a tower, the angle of depression of a boat is \\(30^\\circ\\). What is the angle of elevation of the tower top, seen from the boat?', a: ['\\(30^\\circ\\)', '\\(60^\\circ\\)', '\\(150^\\circ\\)', 'It cannot be found'], c: 0,
    e: 'The two horizontals are parallel, so the angles are <b>alternate angles</b> and equal: \\(\\theta_{\\text{depression}}=\\theta_{\\text{elevation}}\\).' },
  { q: 'An angle of depression opens…', a: ['below the horizontal line of sight', 'above the horizontal line of sight', 'to the left of the vertical', 'between the ground and the wall'], c: 0,
    e: 'Look <b>down</b> and the angle opens below the horizontal. Look <b>up</b> and it opens above.' },
  { q: 'A tree stands on level ground. From a point 15 m away, the angle of elevation of its top is \\(40^\\circ\\). Find the height of the tree (2 d.p.). Ignore eye height.', a: ['12.59 m', '17.88 m', '9.64 m', '11.49 m'], c: 0,
    e: '\\(\\tan 40^\\circ=\\dfrac{h}{15}\\Rightarrow h=15\\tan 40^\\circ=12.59\\text{ m}\\). The tree is opposite and the 15 m is adjacent, so use tan.' },
  { q: 'From the top of a 50 m cliff, the angle of depression of a boat is \\(20^\\circ\\). How far is the boat from the foot of the cliff (2 d.p.)?', a: ['137.37 m', '18.20 m', '17.10 m', '146.19 m'], c: 0,
    e: 'The angle at the boat is also \\(20^\\circ\\). \\(\\tan 20^\\circ=\\dfrac{50}{d}\\Rightarrow d=\\dfrac{50}{\\tan 20^\\circ}=137.37\\text{ m}\\).' },
  { q: 'A kite string 50 m long is taut and makes an angle of elevation of \\(50^\\circ\\) with level ground. How high is the kite (2 d.p.)?', a: ['38.30 m', '32.14 m', '59.59 m', '65.27 m'], c: 0,
    e: 'The string is the hypotenuse and the height is opposite. \\(\\sin 50^\\circ=\\dfrac{h}{50}\\Rightarrow h=50\\sin 50^\\circ=38.30\\text{ m}\\).' },
  { q: 'A pole 18 m tall stands 30 m from an observer on level ground. Find the angle of elevation of its top, to the nearest degree.', a: ['\\(31^\\circ\\)', '\\(37^\\circ\\)', '\\(59^\\circ\\)', '\\(69^\\circ\\)'], c: 0,
    e: '\\(\\tan\\theta=\\dfrac{18}{30}=0.6\\Rightarrow\\theta=\\tan^{-1}(0.6)\\approx 31^\\circ\\). Use tan because you know the opposite and adjacent sides.' },
  { q: 'A girl whose eye level is 1.6 m above the ground stands 20 m from a building. The angle of elevation of its top is \\(35^\\circ\\). Find the height of the building (2 d.p.).', a: ['15.60 m', '14.00 m', '12.40 m', '30.16 m'], c: 0,
    e: '\\(20\\tan 35^\\circ=14.00\\). That is the height above her <b>eye</b>, so add her eye height: \\(14.00+1.6=15.60\\text{ m}\\).' }
];
function initQuiz() {
  const $q = id => document.getElementById(id), root = $q('quiz');
  if (!root) return;
  const start = $('.qz-start', root), run = $('.qz-run', root), end = $('.qz-end', root);
  const KEY = 'angles-quiz-best';
  let order, i, score, locked;
  const show = p => { start.hidden = p !== start; run.hidden = p !== run; end.hidden = p !== end; };
  const shuffle = arr => { const a = arr.slice(); for (let k = a.length - 1; k > 0; k--) { const r = Math.floor(Math.random() * (k + 1)); [a[k], a[r]] = [a[r], a[k]]; } return a; };
  const showBest = () => { const b = store.get(KEY), el = $q('qbest'); el.hidden = b == null; if (b != null) el.textContent = 'Your best score: ' + b + ' / ' + QUIZ.length; };
  const render = () => {
    const it = QUIZ[i]; locked = false;
    $q('qnum').textContent = 'Question ' + (i + 1) + ' of ' + QUIZ.length;
    $q('qscore').textContent = 'Score ' + score;
    $q('qbar').style.width = (i / QUIZ.length * 100) + '%';
    $q('qtext').innerHTML = it.q;
    const box = $q('qopts'); box.innerHTML = '';
    shuffle(it.a.map((t, k) => ({ t, ok: k === it.c }))).forEach(o => {
      const b = document.createElement('button'); b.type = 'button'; b.innerHTML = o.t; b.dataset.ok = o.ok ? '1' : '';
      b.addEventListener('click', () => pick(b)); box.appendChild(b);
    });
    const fb = $q('qfb'); fb.className = 'fb'; fb.innerHTML = '';
    $q('qnext').hidden = true;
    typeset($q('qtext')); typeset(box);
  };
  const pick = b => {
    if (locked) return; locked = true;
    const ok = !!b.dataset.ok, it = QUIZ[i], fb = $q('qfb');
    $$('#qopts button').forEach(x => { x.disabled = true; if (x.dataset.ok) x.classList.add('ok'); });
    if (!ok) b.classList.add('bad'); else { score++; $q('qscore').textContent = 'Score ' + score; confetti(b); }
    fb.className = 'fb ' + (ok ? 'ok' : 'bad');
    fb.innerHTML = (ok ? 'Correct. ' : 'Not quite. ') + it.e;
    typeset(fb);
    const nx = $q('qnext'); nx.hidden = false; nx.textContent = i + 1 >= QUIZ.length ? 'See results' : 'Next question'; nx.focus({ preventScroll: true });
  };
  const finish = () => {
    const n = QUIZ.length, best = store.get(KEY);
    if (best == null || score > best) store.set(KEY, score);
    $q('qresult').textContent = score + ' / ' + n;
    $q('qmsg').textContent = score === n ? 'Perfect. You have mastered elevation and depression.' : score >= 6 ? 'Well done. Review the questions you missed and try for full marks.' : score >= 4 ? 'Good start. Revisit the examples, then try again.' : 'Go back through Examples 1 and 2 and the sightline model, then try again.';
    show(end); showBest();
    if (score >= 6) confetti($q('qresult'));
  };
  const begin = () => { i = 0; score = 0; show(run); render(); $q('qtext').focus({ preventScroll: true }); };
  $q('qstart').addEventListener('click', begin);
  $q('qagain').addEventListener('click', begin);
  $q('qtop').addEventListener('click', () => { show(start); showBest(); });
  $q('qnext').addEventListener('click', () => { if (i + 1 >= QUIZ.length) finish(); else { i++; render(); $q('qtext').focus({ preventScroll: true }); } });
  show(start); showBest();
}

/* ---------- boot ---------- */
typeset(document.body);
window.addEventListener('resize', applyLayout); /* registered first so body classes update before the 3D resize runs */
window.addEventListener('orientationchange', () => setTimeout(() => window.dispatchEvent(new Event('resize')), 300));
if (hasGL) W = initGL();
if (!W) { const c = $('#c'); if (c) c.style.display = 'none'; }
initSplash();
initNav();
initLesson();
initQuiz();
initSettings();

/* ---------- offline support ---------- */
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast glass'; t.setAttribute('role', 'status'); t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('on'));
  setTimeout(() => { t.classList.remove('on'); setTimeout(() => t.remove(), 400); }, 3800);
}
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  const firstVisit = !navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('message', e => {
    if (firstVisit && e.data && e.data.type === 'offline-ready') toast(e.data.full ? 'Saved. This lesson now works offline.' : 'Saving for offline use. Stay online a little longer.');
  });
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { /* offline mode unavailable, site still works online */ }));
  window.addEventListener('offline', () => toast('You are offline. The lesson still works.'));
  window.addEventListener('online', () => toast('Back online.'));
}
})();

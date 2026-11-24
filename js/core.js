// ============================================================
// SHARDFALL - core: namespace, utils, noise, spatial grid, input, save
// ============================================================
(() => {
  const G = (window.G = window.G || {});
  const TAU = Math.PI * 2;
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const B64I = new Int16Array(128);
  for (let i = 0; i < 64; i++) B64I[B64.charCodeAt(i)] = i;
  // control, zero-width and bidi characters (built from code points so the source stays plain ASCII)
  const BAD_CHARS = new RegExp('[' + [[0, 31], [127, 159], [173, 173], [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x206f], [0xfeff, 0xfeff]].map((r) => String.fromCharCode(r[0]) + '-' + String.fromCharCode(r[1])).join('') + '<>]', 'g');
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  // ---------------- utils ----------------
  const U = (G.U = {
    TAU,
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    lerp: (a, b, t) => a + (b - a) * t,
    invLerp: (a, b, v) => (v - a) / (b - a),
    rand: (a = 0, b = 1) => a + Math.random() * (b - a),
    randInt: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
    chance: (p) => Math.random() < p,
    sign: (v) => (v < 0 ? -1 : 1),
    damp: (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt)),
    angleDiff(a, b) {
      let d = (b - a) % TAU;
      if (d > Math.PI) d -= TAU;
      if (d < -Math.PI) d += TAU;
      return d;
    },
    dampAngle(a, b, lambda, dt) {
      return a + U.angleDiff(a, b) * (1 - Math.exp(-lambda * dt));
    },
    smoothstep(a, b, v) {
      const t = U.clamp((v - a) / (b - a), 0, 1);
      return t * t * (3 - 2 * t);
    },
    easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
    easeInCubic: (t) => t * t * t,
    easeOutBack(t) {
      const c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },
    easeOutElastic(t) {
      if (t <= 0 || t >= 1) return U.clamp(t, 0, 1);
      return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1;
    },
    dist2: (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz),
    dist: (ax, az, bx, bz) => Math.sqrt((ax - bx) * (ax - bx) + (az - bz) * (az - bz)),
    fmtTime(sec) {
      sec = Math.max(0, Math.floor(sec));
      const m = Math.floor(sec / 60), s = sec % 60;
      return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    },
    fmtNum: (n) => Math.floor(n).toLocaleString('en-US'),
    weightedPick(items, wf) {
      let total = 0;
      for (const it of items) total += Math.max(0, wf(it));
      if (total <= 0) return items[Math.floor(Math.random() * items.length)];
      let r = Math.random() * total;
      for (const it of items) {
        r -= Math.max(0, wf(it));
        if (r <= 0) return it;
      }
      return items[items.length - 1];
    },
    shuffle(arr, rnd = Math.random) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      return arr;
    },
    mulberry32(seed) {
      let a = seed >>> 0;
      return function () {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },
    // HDR color helper: returns THREE.Color scaled by mult (values may exceed 1 -> bloom)
    hdr(hex, mult = 1) {
      const c = new THREE.Color(hex);
      c.r *= mult; c.g *= mult; c.b *= mult;
      return c;
    },
    el: (id) => document.getElementById(id),
    // compact URL-safe base-64 integer codec (netcode)
    enc(v, n) {
      v = Math.max(0, Math.floor(v));
      let s = '';
      for (let i = n - 1; i >= 0; i--) s += B64[Math.floor(v / Math.pow(64, i)) % 64];
      return s;
    },
    dec(s, o, n) {
      let v = 0;
      for (let i = 0; i < n; i++) v = v * 64 + B64I[s.charCodeAt(o + i) & 127];
      return v;
    },
    esc: (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]),
    clean: (s, max = 12) => String(s == null ? '' : s).replace(BAD_CHARS, '').trim().slice(0, max),
    num: (v, d = 0, lo = -1e6, hi = 1e6) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; },
    r1: (v) => Math.round(v * 10) / 10,
    r2: (v) => Math.round(v * 100) / 100,
    // stylized fresnel rim light for MeshStandardMaterial (works with flat shading too)
    addRim(mat, color, strength = 0.5, power = 2.5) {
      const rc = new THREE.Color(color);
      const prev = mat.onBeforeCompile;
      mat.onBeforeCompile = (sh, r) => {
        if (prev) prev(sh, r);
        sh.uniforms.uRimColor = { value: rc };
        sh.fragmentShader = 'uniform vec3 uRimColor;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
           float rimF = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
           totalEmissiveRadiance += uRimColor * pow(rimF, ${power.toFixed(2)}) * ${strength.toFixed(3)};`);
      };
      mat.customProgramCacheKey = () => 'rim' + rc.getHexString() + strength + power;
      mat.needsUpdate = true;
      return mat;
    },
  });

  // ---------------- simplex noise 2D ----------------
  const Noise = (G.Noise = (() => {
    const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
    const gx = [1, -1, 1, -1, 1, -1, 0, 0], gy = [1, 1, -1, -1, 0, 0, 1, -1];
    const perm = new Uint8Array(512);
    function seed(s) {
      const r = U.mulberry32(s);
      const p = [];
      for (let i = 0; i < 256; i++) p.push(i);
      U.shuffle(p, r);
      for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
    }
    function simplex2(xin, yin) {
      const s = (xin + yin) * F2;
      const i = Math.floor(xin + s), j = Math.floor(yin + s);
      const t = (i + j) * G2;
      const x0 = xin - (i - t), y0 = yin - (j - t);
      const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
      const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
      const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
      const ii = i & 255, jj = j & 255;
      let n = 0, tt, g;
      tt = 0.5 - x0 * x0 - y0 * y0;
      if (tt > 0) { g = perm[ii + perm[jj]] & 7; tt *= tt; n += tt * tt * (gx[g] * x0 + gy[g] * y0); }
      tt = 0.5 - x1 * x1 - y1 * y1;
      if (tt > 0) { g = perm[ii + i1 + perm[jj + j1]] & 7; tt *= tt; n += tt * tt * (gx[g] * x1 + gy[g] * y1); }
      tt = 0.5 - x2 * x2 - y2 * y2;
      if (tt > 0) { g = perm[ii + 1 + perm[jj + 1]] & 7; tt *= tt; n += tt * tt * (gx[g] * x2 + gy[g] * y2); }
      return 70 * n;
    }
    function fbm(x, y, oct = 4, lac = 2, gain = 0.5) {
      let a = 1, f = 1, sum = 0, norm = 0;
      for (let o = 0; o < oct; o++) {
        sum += a * simplex2(x * f, y * f);
        norm += a; a *= gain; f *= lac;
      }
      return sum / norm;
    }
    seed(1337);
    return { seed, simplex2, fbm };
  })());

  // ---------------- uniform grid spatial hash ----------------
  class Grid {
    constructor(size = 120, cell = 4) {
      this.cell = cell;
      this.n = Math.ceil(size / cell);
      this.half = size / 2;
      this.cells = [];
      for (let i = 0; i < this.n * this.n; i++) this.cells.push([]);
    }
    clear() { for (let i = 0; i < this.cells.length; i++) this.cells[i].length = 0; }
    ci(v) { return U.clamp(Math.floor((v + this.half) / this.cell), 0, this.n - 1); }
    insert(o) { this.cells[this.ci(o.z) * this.n + this.ci(o.x)].push(o); }
    query(x, z, r, fn) {
      const x0 = this.ci(x - r), x1 = this.ci(x + r), z0 = this.ci(z - r), z1 = this.ci(z + r);
      for (let cz = z0; cz <= z1; cz++) {
        const row = cz * this.n;
        for (let cx = x0; cx <= x1; cx++) {
          const c = this.cells[row + cx];
          for (let k = 0; k < c.length; k++) if (fn(c[k]) === true) return true;
        }
      }
      return false;
    }
  }
  G.Grid = Grid;

  // ---------------- events ----------------
  const handlers = {};
  G.Events = {
    on(name, fn) { (handlers[name] = handlers[name] || []).push(fn); },
    emit(name, a, b, c) { const h = handlers[name]; if (h) for (const fn of h) fn(a, b, c); },
  };

  // ---------------- input ----------------
  const Input = (G.Input = {
    down: new Set(), pressed: new Set(), released: new Set(),
    mouse: { x: innerWidth / 2, y: innerHeight / 2, nx: 0, ny: 0, left: false, right: false,
      leftPressed: false, rightPressed: false, leftReleased: false, rightReleased: false },
    init() {
      const m = this.mouse;
      const blockKeys = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft']);
      const typing = (e) => {
        const t = e.target;
        return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      };
      this.typing = typing;
      addEventListener('keydown', (e) => {
        if (typing(e)) return;
        if (blockKeys.has(e.code)) e.preventDefault();
        if (!e.repeat) this.pressed.add(e.code);
        this.down.add(e.code);
      });
      addEventListener('keyup', (e) => { this.down.delete(e.code); this.released.add(e.code); });
      addEventListener('mousemove', (e) => {
        m.x = e.clientX; m.y = e.clientY;
        m.nx = (e.clientX / innerWidth) * 2 - 1;
        m.ny = -(e.clientY / innerHeight) * 2 + 1;
      });
      addEventListener('mousedown', (e) => {
        if (e.button === 0) { m.left = true; m.leftPressed = true; }
        if (e.button === 2) { m.right = true; m.rightPressed = true; }
      });
      addEventListener('mouseup', (e) => {
        if (e.button === 0) { if (m.left) m.leftReleased = true; m.left = false; }
        if (e.button === 2) { if (m.right) m.rightReleased = true; m.right = false; }
      });
      addEventListener('contextmenu', (e) => e.preventDefault());
      addEventListener('blur', () => this.reset());
    },
    reset() {
      const m = this.mouse;
      this.down.clear(); this.pressed.clear(); this.released.clear();
      m.left = m.right = m.leftPressed = m.rightPressed = m.leftReleased = m.rightReleased = false;
    },
    isDown(...codes) { for (const c of codes) if (this.down.has(c)) return true; return false; },
    wasPressed(...codes) { for (const c of codes) if (this.pressed.has(c)) return true; return false; },
    endFrame() {
      const m = this.mouse;
      this.pressed.clear(); this.released.clear();
      m.leftPressed = m.rightPressed = m.leftReleased = m.rightReleased = false;
    },
  });

  // ---------------- settings & save ----------------
  function load(key) {
    try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (e) { return {}; }
  }
  function store(key, v) {
    try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* ignore */ }
  }
  const defaultQuality = (navigator.hardwareConcurrency || 8) <= 4 ? 'medium' : 'high';
  G.Settings = Object.assign(
    { master: 0.8, music: 0.5, sfx: 0.8, quality: defaultQuality, shake: true, dmgNumbers: true, showFps: false, nick: '', color: 0, diff: 'normal' },
    load('shardfall.settings')
  );
  G.saveSettings = () => store('shardfall.settings', G.Settings);

  G.Save = {
    data: Object.assign({ best: 0, bestWave: 0, shards: 0, forge: {}, runs: 0, totalKills: 0, wins: 0 }, load('shardfall.save')),
    write() { store('shardfall.save', this.data); },
  };

  // true on the machine that owns the simulation (solo or co-op host)
  G.auth = () => !G.Net || G.Net.mode !== 'client';

  // ---------------- error reporting (helps debugging) ----------------
  let errCount = 0;
  addEventListener('error', (e) => {
    if (errCount++ > 6) return;
    const box = document.getElementById('error-box');
    if (box) box.textContent += (e.message || 'error') + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno + '\n';
  });
})();

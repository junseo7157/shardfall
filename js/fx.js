// ============================================================
// SHARDFALL - fx: particles, gibs, rings, telegraphs, lightning, beams, damage numbers
// ============================================================
(() => {
  const G = window.G, U = G.U;
  const FX = (G.FX = {});
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3();
  const tmpC = new THREE.Color();

  // ---------------- particle system ----------------
  const P_VERT = `attribute float aSize; attribute vec4 aColor; uniform float uScale; varying vec4 vColor;
    void main() { vColor = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = aSize * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`;
  const P_FRAG_ADD = `varying vec4 vColor;
    void main() { vec2 c = gl_PointCoord - 0.5; float d = dot(c, c) * 4.0; if (d > 1.0) discard;
      float a = exp(-d * 3.5); gl_FragColor = vec4(vColor.rgb * (1.0 + exp(-d * 18.0)), vColor.a * a); }`;
  const P_FRAG_SMOKE = `varying vec4 vColor;
    void main() { vec2 c = gl_PointCoord - 0.5; float d = dot(c, c) * 4.0; if (d > 1.0) discard;
      float a = smoothstep(1.0, 0.15, d); gl_FragColor = vec4(vColor.rgb, vColor.a * a); }`;

  class Particles {
    constructor(max, additive) {
      this.max = max; this.n = 0;
      const f = (k) => new Float32Array(max * k);
      this.pos = f(3); this.col = f(4); this.size = f(1);
      this.vel = f(3); this.life = f(1); this.maxLife = f(1); this.s0 = f(1); this.s1 = f(1);
      this.drag = f(1); this.grav = f(1); this.rgb = f(3); this.a0 = f(1);
      const g = (this.geo = new THREE.BufferGeometry());
      this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
      this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
      this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('position', this.aPos); g.setAttribute('aColor', this.aCol); g.setAttribute('aSize', this.aSize);
      g.setDrawRange(0, 0);
      this.mat = new THREE.ShaderMaterial({
        uniforms: { uScale: FX.scaleU }, vertexShader: P_VERT, fragmentShader: additive ? P_FRAG_ADD : P_FRAG_SMOKE,
        transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      });
      this.points = new THREE.Points(g, this.mat);
      this.points.frustumCulled = false;
      this.points.renderOrder = additive ? 5 : 4;
    }
    emit(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, drag, grav) {
      let i;
      if (this.n < this.max) i = this.n++;
      else i = Math.floor(Math.random() * this.max);
      const i3 = i * 3;
      this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
      this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
      this.rgb[i3] = r; this.rgb[i3 + 1] = g; this.rgb[i3 + 2] = b;
      this.life[i] = this.maxLife[i] = life; this.s0[i] = s0; this.s1[i] = s1;
      this.a0[i] = a; this.drag[i] = drag; this.grav[i] = grav; this.size[i] = s0;
    }
    copy(d, s) {
      const d3 = d * 3, s3 = s * 3;
      for (let k = 0; k < 3; k++) { this.pos[d3 + k] = this.pos[s3 + k]; this.vel[d3 + k] = this.vel[s3 + k]; this.rgb[d3 + k] = this.rgb[s3 + k]; }
      for (let k = 0; k < 4; k++) this.col[d * 4 + k] = this.col[s * 4 + k];
      this.life[d] = this.life[s]; this.maxLife[d] = this.maxLife[s]; this.s0[d] = this.s0[s]; this.s1[d] = this.s1[s];
      this.a0[d] = this.a0[s]; this.drag[d] = this.drag[s]; this.grav[d] = this.grav[s]; this.size[d] = this.size[s];
    }
    update(dt) {
      for (let i = 0; i < this.n; i++) {
        this.life[i] -= dt;
        if (this.life[i] <= 0) { this.n--; if (i !== this.n) this.copy(i, this.n); i--; continue; }
        const i3 = i * 3, dr = Math.max(0, 1 - this.drag[i] * dt);
        this.vel[i3] *= dr; this.vel[i3 + 1] = this.vel[i3 + 1] * dr - this.grav[i] * dt; this.vel[i3 + 2] *= dr;
        this.pos[i3] += this.vel[i3] * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
        if (this.grav[i] > 0 && this.pos[i3 + 1] < 0.05 && this.vel[i3 + 1] < 0) {
          this.pos[i3 + 1] = 0.05; this.vel[i3 + 1] *= -0.35; this.vel[i3] *= 0.6; this.vel[i3 + 2] *= 0.6;
        }
        const t = 1 - this.life[i] / this.maxLife[i];
        this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
        const i4 = i * 4;
        this.col[i4] = this.rgb[i3]; this.col[i4 + 1] = this.rgb[i3 + 1]; this.col[i4 + 2] = this.rgb[i3 + 2];
        this.col[i4 + 3] = this.a0[i] * (1 - t * t);
      }
      this.geo.setDrawRange(0, this.n);
      this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; this.aSize.needsUpdate = true;
    }
    clear() { this.n = 0; this.geo.setDrawRange(0, 0); }
  }

  // ---------------- gibs (instanced chunks) ----------------
  const GIB_MAX = 600;
  const gibs = [];
  let gibMesh;

  // ---------------- pools ----------------
  const rings = [], teles = [], bolts = [], beams = [], dmgs = [], emitters = [];

  const TELE_FRAG = `uniform float uProgress; uniform vec3 uColor; uniform float uAlpha; uniform float uShape; uniform float uTime;
    varying vec2 vUv;
    void main() {
      float a; float lead = 0.0;
      if (uShape < 0.5) {
        vec2 c = vUv * 2.0 - 1.0; float d = length(c); if (d > 1.0) discard;
        float edge = smoothstep(0.88, 0.96, d) * (1.0 - smoothstep(0.975, 1.0, d));
        float fill = step(d, uProgress);
        lead = fill * smoothstep(uProgress - 0.06, uProgress, d);
        a = edge * 0.9 + fill * 0.28 + lead * 0.7 + 0.1 + 0.05 * sin(uTime * 12.0 + d * 10.0);
      } else {
        vec2 u = vUv; float e = min(min(u.x, 1.0 - u.x) * 4.0, min(u.y, 1.0 - u.y) * 20.0);
        float edge = 1.0 - smoothstep(0.0, 0.2, e);
        float fill = step(u.y, uProgress);
        lead = fill * smoothstep(uProgress - 0.05, uProgress, u.y);
        a = edge * 0.9 + fill * 0.3 + lead * 0.6 + 0.1;
      }
      gl_FragColor = vec4(uColor * (1.0 + lead * 1.5), a * uAlpha);
    }`;
  const BEAM_FRAG = `uniform vec3 uColor; uniform float uAlpha; varying vec2 vUv;
    void main() { float x = abs(vUv.x - 0.5) * 2.0; float core = exp(-x * x * 22.0); float glow = exp(-x * x * 3.5) * 0.6;
      float ends = smoothstep(0.0, 0.03, vUv.y) * smoothstep(1.0, 0.96, vUv.y);
      gl_FragColor = vec4(uColor * glow + vec3(1.6) * core, (core + glow) * uAlpha * ends); }`;
  const SIMPLE_VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

  FX.init = function (scene) {
    FX.scene = scene;
    FX.scaleU = { value: 600 };
    const upd = () => {
      const h = G.Render.renderer.getDrawingBufferSize(new THREE.Vector2()).y;
      FX.scaleU.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(G.Render.camera.fov) / 2));
    };
    upd();
    G.Events.on('resize', upd);
    FX.P = new Particles(8000, true);
    FX.S = new Particles(1600, false);
    scene.add(FX.P.points, FX.S.points);

    gibMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.6, flatShading: true }), GIB_MAX);
    gibMesh.frustumCulled = false;
    gibMesh.castShadow = true;
    for (let i = 0; i < GIB_MAX; i++) gibMesh.setColorAt(i, tmpC.set(0xffffff));
    gibMesh.count = 0;
    scene.add(gibMesh);

    const ringGeo = new THREE.RingGeometry(0.86, 1, 72).rotateX(-Math.PI / 2);
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.visible = false; m.renderOrder = 6; scene.add(m);
      rings.push({ mesh: m, t: 0, life: 0, active: false });
    }
    const planeGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    for (let i = 0; i < 90; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uProgress: { value: 0 }, uColor: { value: new THREE.Color() }, uAlpha: { value: 1 }, uShape: { value: 0 }, uTime: { value: 0 } },
        vertexShader: SIMPLE_VERT, fragmentShader: TELE_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        polygonOffset: true, polygonOffsetFactor: -4,
      });
      const m = new THREE.Mesh(planeGeo, mat);
      m.visible = false; m.renderOrder = 2; scene.add(m);
      teles.push({ mesh: m, active: false });
    }
    for (let i = 0; i < 16; i++) {
      const mat = new THREE.ShaderMaterial({ uniforms: { uColor: { value: new THREE.Color() }, uAlpha: { value: 1 } }, vertexShader: SIMPLE_VERT, fragmentShader: BEAM_FRAG,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      const m = new THREE.Mesh(planeGeo, mat);
      m.visible = false; m.renderOrder = 7; scene.add(m);
      beams.push({ mesh: m, active: false });
    }
    const SEG = 12;
    for (let i = 0; i < 18; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((SEG + 1) * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
      const idx = [];
      for (let s = 0; s < SEG; s++) { const a = s * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      g.setIndex(idx);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.frustumCulled = false; m.visible = false; m.renderOrder = 7; scene.add(m);
      bolts.push({ mesh: m, active: false, seg: SEG });
    }
    const layer = U.el('dmg-layer');
    for (let i = 0; i < 70; i++) {
      const el = document.createElement('div');
      el.className = 'dmg'; el.style.display = 'none';
      layer.appendChild(el);
      dmgs.push({ el, active: false, t: 0 });
    }
  };

  // ---------------- emit helpers ----------------
  function col(c) { return typeof c === 'number' ? tmpC.set(c) : tmpC.copy(c); }
  // generic burst. opts: count, color, intensity, speed[min,max], life[min,max], size[s0,s1], grav, drag, up, spread('sphere'|'ring'|'up'), alpha
  FX.burst = function (x, y, z, o) {
    const c = col(o.color != null ? o.color : 0xffffff), k = o.intensity != null ? o.intensity : 2.5;
    const r = c.r * k, g = c.g * k, b = c.b * k;
    const n = o.count || 10, sp = o.speed || [2, 6], lf = o.life || [0.3, 0.6], sz = o.size || [0.4, 0.05];
    const sys = o.smoke ? FX.S : FX.P;
    for (let i = 0; i < n; i++) {
      const s = U.rand(sp[0], sp[1]);
      let vx, vy, vz;
      if (o.spread === 'ring') { const a = Math.random() * U.TAU; vx = Math.cos(a) * s; vz = Math.sin(a) * s; vy = (o.up || 0) * Math.random(); }
      else if (o.spread === 'up') { const a = Math.random() * U.TAU, rr = Math.random() * 0.5; vx = Math.cos(a) * s * rr; vz = Math.sin(a) * s * rr; vy = s; }
      else if (o.dir) { vx = o.dir.x * s + U.rand(-1, 1) * s * (o.cone || 0.4); vy = o.dir.y * s + U.rand(-0.5, 1) * s * (o.cone || 0.4); vz = o.dir.z * s + U.rand(-1, 1) * s * (o.cone || 0.4); }
      else { const u = Math.random() * 2 - 1, a = Math.random() * U.TAU, q = Math.sqrt(1 - u * u); vx = q * Math.cos(a) * s; vy = Math.abs(u) * s * 0.8 + (o.up || 0); vz = q * Math.sin(a) * s; }
      const j = o.jitter || 0;
      sys.emit(x + U.rand(-j, j), y + U.rand(-j, j) * 0.5, z + U.rand(-j, j), vx, vy, vz, U.rand(lf[0], lf[1]),
        sz[0] * U.rand(0.7, 1.3), sz[1], r, g, b, o.alpha != null ? o.alpha : 1, o.drag != null ? o.drag : 2, o.grav || 0);
    }
  };
  FX.spark = function (x, y, z, color, n = 6, speed = 7) {
    FX.burst(x, y, z, { count: n, color, intensity: 3, speed: [speed * 0.4, speed], life: [0.15, 0.35], size: [0.28, 0.02], grav: 9, drag: 3 });
  };
  FX.trail = function (x, y, z, color, size = 0.35, life = 0.18, k = 2) {
    const c = col(color);
    FX.P.emit(x, y, z, 0, 0, 0, life, size, 0.02, c.r * k, c.g * k, c.b * k, 0.9, 0, 0);
  };
  FX.smoke = function (x, y, z, n = 8, color = 0x3a2e48, size = 2.2, speed = 2.5) {
    FX.burst(x, y, z, { smoke: true, count: n, color, intensity: 1, speed: [speed * 0.3, speed], life: [0.6, 1.3], size: [size * 0.5, size * 1.4], alpha: 0.55, drag: 2.2, up: 1.2, jitter: 0.5 });
  };

  FX.gibs = function (x, y, z, color, n = 8, size = 0.22, force = 6) {
    for (let i = 0; i < n; i++) {
      let gb;
      if (gibs.length < GIB_MAX) { gb = {}; gibs.push(gb); } else gb = gibs[Math.floor(Math.random() * gibs.length)];
      const a = Math.random() * U.TAU, s = U.rand(0.3, 1) * force;
      gb.x = x; gb.y = y; gb.z = z; gb.vx = Math.cos(a) * s; gb.vz = Math.sin(a) * s; gb.vy = U.rand(3, 8);
      gb.rx = Math.random() * 6; gb.ry = Math.random() * 6; gb.wx = U.rand(-10, 10); gb.wy = U.rand(-10, 10);
      gb.s = size * U.rand(0.6, 1.4); gb.life = U.rand(1.2, 2.2); gb.max = gb.life;
      gb.c = typeof color === 'number' ? color : color.getHex();
    }
  };

  FX.ring = function (x, y, z, r0, r1, life, color, k = 2.5) {
    const rg = rings.find((q) => !q.active) || rings[0];
    rg.active = true; rg.t = 0; rg.life = life; rg.r0 = r0; rg.r1 = r1; rg.k = k;
    rg.mesh.position.set(x, y, z);
    rg.mesh.material.color.copy(col(color)).multiplyScalar(k);
    rg.mesh.visible = true;
    rg.mesh.scale.setScalar(r0);
  };

  // telegraph: { shape, x, z, r, angle, length, width, dur, color, hold, y }
  FX.telegraph = function (o) {
    const t = teles.find((q) => !q.active);
    if (!t) return { kill() {}, set() {} };
    const m = t.mesh, u = m.material.uniforms;
    t.active = true; t.t = 0; t.dur = o.dur || 1; t.hold = !!o.hold; t.fade = 0; t.dying = false;
    u.uColor.value.copy(col(o.color != null ? o.color : 0xff3344)).multiplyScalar(o.k || 1.6);
    u.uShape.value = o.shape === 'rect' ? 1 : 0;
    u.uProgress.value = o.hold ? 1 : 0; u.uAlpha.value = 1;
    const y = (o.y != null ? o.y : G.World.heightAt(o.x, o.z)) + 0.12;
    if (o.shape === 'rect') {
      const L = o.length, a = o.angle;
      m.position.set(o.x + Math.cos(a) * L / 2, y, o.z + Math.sin(a) * L / 2);
      m.rotation.set(0, -a - Math.PI / 2, 0);
      m.scale.set(o.width, 1, L);
    } else {
      m.position.set(o.x, y, o.z);
      m.rotation.set(0, 0, 0);
      m.scale.set(o.r * 2, 1, o.r * 2);
    }
    m.visible = true;
    const gen = (t.gen = (t.gen || 0) + 1);
    return {
      kill() { if (t.gen === gen) t.dying = true; },
      set(x, z) { if (t.gen === gen) { m.position.x = x; m.position.z = z; } },
      get progress() { return t.gen === gen ? u.uProgress.value : 1; },
    };
  };

  FX.beam = function (x, y, z, angle, length, width, color, life = 0.25) {
    const b = beams.find((q) => !q.active) || beams[0];
    const m = b.mesh;
    b.active = true; b.t = 0; b.life = life; b.w = width;
    m.material.uniforms.uColor.value.copy(col(color)).multiplyScalar(2.5);
    m.position.set(x + Math.cos(angle) * length / 2, y, z + Math.sin(angle) * length / 2);
    m.rotation.set(0, -angle - Math.PI / 2, 0);
    m.scale.set(width, 1, length);
    m.visible = true;
  };

  FX.lightning = function (x0, y0, z0, x1, y1, z1, color = 0xb9a4ff, width = 0.22, life = 0.16, jitter = 0.7) {
    const b = bolts.find((q) => !q.active) || bolts[0];
    const pos = b.mesh.geometry.attributes.position, S = b.seg;
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz) || 1, px = -dz / len, pz = dx / len;
    for (let s = 0; s <= S; s++) {
      const t = s / S, off = s === 0 || s === S ? 0 : U.rand(-jitter, jitter);
      const cx = x0 + dx * t + px * off, cz = z0 + dz * t + pz * off, cy = y0 + (y1 - y0) * t + U.rand(-0.2, 0.2) * (s % S ? 1 : 0);
      const w = width * (0.6 + Math.random() * 0.6);
      pos.setXYZ(s * 2, cx + px * w, cy, cz + pz * w);
      pos.setXYZ(s * 2 + 1, cx - px * w, cy, cz - pz * w);
    }
    pos.needsUpdate = true;
    b.mesh.material.color.copy(col(color)).multiplyScalar(4);
    b.mesh.material.opacity = 1;
    b.mesh.visible = true; b.active = true; b.t = 0; b.life = life;
  };

  FX.dmgNumber = function (x, y, z, text, cls = '') {
    if (!G.Settings.dmgNumbers && cls !== 'player' && cls !== 'heal' && cls !== 'info') return;
    let d = dmgs.find((q) => !q.active);
    if (!d) { d = dmgs[0]; for (const q of dmgs) if (q.t > d.t) d = q; }
    d.active = true; d.t = 0; d.life = cls === 'crit' ? 0.95 : 0.75;
    d.x = x + U.rand(-0.4, 0.4); d.y = y; d.z = z + U.rand(-0.3, 0.3); d.vx = U.rand(-30, 30);
    d.el.className = 'dmg ' + cls;
    d.el.textContent = text;
    d.el.style.display = 'block';
  };

  FX.emitter = function (dur, fn) { emitters.push({ t: 0, dur, fn }); };

  // ---------------- composite effects ----------------
  FX.explosion = function (x, y, z, radius = 3, color = 0xff8a3a, shake = 0.35) {
    FX.burst(x, y + 0.5, z, { count: Math.floor(18 + radius * 10), color, intensity: 3.2, speed: [radius * 1.5, radius * 4.2], life: [0.25, 0.6], size: [radius * 0.55, 0.05], drag: 3.5, up: 1 });
    FX.burst(x, y + 0.5, z, { count: Math.floor(10 + radius * 4), color: 0xfff0c0, intensity: 4, speed: [radius * 3, radius * 6], life: [0.2, 0.45], size: [0.25, 0.02], grav: 14, drag: 1.5 });
    FX.smoke(x, y + 0.6, z, Math.floor(4 + radius * 2), 0x3b2c3e, radius * 0.9, radius * 1.3);
    FX.ring(x, y + 0.15, z, radius * 0.3, radius * 1.15, 0.35, color, 2.2);
    G.Render.flash(x, y + 1.5, z, color, 30 + radius * 14, 0.3, radius * 5);
    if (shake) G.Render.shake(shake);
  };
  FX.enemyDeath = function (x, y, z, color, size = 1) {
    FX.gibs(x, y + 0.6 * size, z, color, Math.floor(5 + size * 5), 0.18 * size + 0.08, 5 + size * 2);
    FX.burst(x, y + 0.7 * size, z, { count: Math.floor(10 + size * 8), color, intensity: 2.8, speed: [2, 6 + size * 2], life: [0.25, 0.55], size: [0.45 * size + 0.2, 0.03], drag: 3 });
    FX.ring(x, y + 0.1, z, 0.3, 1.6 * size + 0.6, 0.3, color, 1.8);
  };
  FX.portal = function (x, z, dur = 0.9, color = 0xb45cff) {
    const y = G.World.heightAt(x, z);
    FX.telegraph({ shape: 'circle', x, z, r: 1.4, dur, color, k: 2 });
    FX.emitter(dur, (e, dt) => {
      if (Math.random() < 0.7) {
        const a = Math.random() * U.TAU, r = 1.3;
        FX.P.emit(x + Math.cos(a) * r, y + 0.1, z + Math.sin(a) * r, -Math.cos(a) * 1.2, U.rand(2, 4.5), -Math.sin(a) * 1.2, 0.5, 0.35, 0.02, 1.6, 0.7, 3, 1, 1, 0);
      }
    });
  };
  FX.pillar = function (x, z, color, n = 30, h = 6) {
    const y = G.World.heightAt(x, z);
    FX.burst(x, y, z, { count: n, color, intensity: 3, spread: 'up', speed: [h * 0.6, h * 1.6], life: [0.4, 0.9], size: [0.45, 0.02], drag: 1.6, jitter: 0.6 });
  };

  // ---------------- update ----------------
  FX.update = function (dt, realDt) {
    FX.P.update(dt);
    FX.S.update(dt);

    // gibs
    let n = 0;
    for (let i = gibs.length - 1; i >= 0; i--) {
      const gb = gibs[i];
      gb.life -= dt;
      if (gb.life <= 0) { gibs[i] = gibs[gibs.length - 1]; gibs.pop(); continue; }
      gb.vy -= 22 * dt;
      gb.x += gb.vx * dt; gb.y += gb.vy * dt; gb.z += gb.vz * dt;
      const gy = G.World.heightAt(gb.x, gb.z) + gb.s * 0.5;
      if (gb.y < gy) { gb.y = gy; gb.vy *= -0.38; gb.vx *= 0.65; gb.vz *= 0.65; gb.wx *= 0.7; gb.wy *= 0.7; }
      gb.rx += gb.wx * dt; gb.ry += gb.wy * dt;
      const sc = gb.s * Math.min(1, gb.life / (gb.max * 0.35));
      tmpE.set(gb.rx, gb.ry, 0); tmpQ.setFromEuler(tmpE);
      tmpM.compose(tmpP.set(gb.x, gb.y, gb.z), tmpQ, tmpS.set(sc, sc, sc));
      gibMesh.setMatrixAt(n, tmpM);
      gibMesh.setColorAt(n, tmpC.set(gb.c));
      n++;
    }
    gibMesh.count = n;
    gibMesh.instanceMatrix.needsUpdate = true;
    if (gibMesh.instanceColor) gibMesh.instanceColor.needsUpdate = true;

    for (const rg of rings) {
      if (!rg.active) continue;
      rg.t += dt;
      const k = rg.t / rg.life;
      if (k >= 1) { rg.active = false; rg.mesh.visible = false; continue; }
      rg.mesh.scale.setScalar(rg.r0 + (rg.r1 - rg.r0) * U.easeOutCubic(k));
      rg.mesh.material.opacity = 1 - k * k;
    }
    for (const t of teles) {
      if (!t.active) continue;
      const u = t.mesh.material.uniforms;
      t.t += dt;
      u.uTime.value += dt;
      if (!t.hold) u.uProgress.value = Math.min(1, t.t / t.dur);
      if (t.dying || (!t.hold && t.t >= t.dur)) {
        t.fade += dt;
        u.uAlpha.value = Math.max(0, 1 - t.fade / 0.18);
        if (t.fade >= 0.18) { t.active = false; t.mesh.visible = false; }
      }
    }
    for (const b of beams) {
      if (!b.active) continue;
      b.t += dt;
      const k = b.t / b.life;
      if (k >= 1) { b.active = false; b.mesh.visible = false; continue; }
      b.mesh.material.uniforms.uAlpha.value = 1 - k * k;
      b.mesh.scale.x = b.w * (1 - k * 0.6);
    }
    for (const b of bolts) {
      if (!b.active) continue;
      b.t += dt;
      if (b.t >= b.life) { b.active = false; b.mesh.visible = false; continue; }
      b.mesh.material.opacity = 1 - b.t / b.life;
    }
    for (let i = emitters.length - 1; i >= 0; i--) {
      const e = emitters[i];
      e.t += dt;
      e.fn(e, dt);
      if (e.t >= e.dur) emitters.splice(i, 1);
    }
    const sp = { x: 0, y: 0, vis: false };
    for (const d of dmgs) {
      if (!d.active) continue;
      d.t += realDt;
      if (d.t >= d.life) { d.active = false; d.el.style.display = 'none'; continue; }
      const k = d.t / d.life;
      G.Render.toScreen(d.x, d.y + 1.2 + k * 1.4, d.z, sp);
      const s = d.t < 0.12 ? 1.7 - d.t * 6 : 1;
      d.el.style.transform = `translate(${(sp.x + d.vx * k).toFixed(1)}px, ${sp.y.toFixed(1)}px) translate(-50%, -50%) scale(${s.toFixed(2)})`;
      d.el.style.opacity = k > 0.6 ? (1 - (k - 0.6) / 0.4).toFixed(2) : '1';
    }
  };

  FX.clear = function () {
    FX.P.clear(); FX.S.clear();
    gibs.length = 0; gibMesh.count = 0;
    for (const r of rings) { r.active = false; r.mesh.visible = false; }
    for (const t of teles) { t.active = false; t.mesh.visible = false; }
    for (const b of beams) { b.active = false; b.mesh.visible = false; }
    for (const b of bolts) { b.active = false; b.mesh.visible = false; }
    for (const d of dmgs) { d.active = false; d.el.style.display = 'none'; }
    emitters.length = 0;
  };
})();

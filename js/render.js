// ============================================================
// SHARDFALL - render: renderer, scene, camera, lights, sky, post FX
// ============================================================
(() => {
  const G = window.G, U = G.U;
  const R = (G.Render = {});

  const QUALITY = {
    low: { pr: 0.85, shadows: false, shadowSize: 1024, samples: 0, grass: 3500, bloomStrength: 0.36, maxPix: 1.2e6 },
    medium: { pr: 1, shadows: true, shadowSize: 1024, samples: 0, grass: 9000, bloomStrength: 0.38, maxPix: 2.2e6 },
    high: { pr: Math.min(window.devicePixelRatio || 1, 1.5), shadows: true, shadowSize: 2048, samples: 4, grass: 18000, bloomStrength: 0.4, maxPix: 3.8e6 },
  };

  const SKY_VERT = `
    varying vec3 vDir;
    void main() {
      vDir = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`;
  const SKY_FRAG = `
    uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uHorizon; uniform vec3 uBottom;
    uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uTime; uniform float uStars;
    varying vec3 vDir;
    float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    void main() {
      vec3 d = normalize(vDir);
      float h = d.y;
      vec3 col = mix(uHorizon, uMid, smoothstep(-0.03, 0.25, h));
      col = mix(col, uTop, smoothstep(0.25, 0.9, h));
      col = mix(col, uBottom, smoothstep(-0.03, -0.45, h));
      float s = max(dot(d, normalize(uSunDir)), 0.0);
      col += uSunColor * (pow(s, 800.0) * 24.0 + pow(s, 48.0) * 0.7 + pow(s, 5.0) * 0.22);
      vec3 sd = floor(d * 260.0);
      float st = hash(sd);
      float star = step(0.9972, st) * smoothstep(0.08, 0.5, h);
      star *= 0.55 + 0.45 * sin(uTime * 2.3 + st * 120.0);
      col += vec3(0.85, 0.9, 1.0) * star * 2.2 * uStars;
      gl_FragColor = vec4(col, 1.0);
    }`;

  const CLOUD_VERT = `
    varying vec3 vWorld;
    void main() {
      vec4 w = modelMatrix * vec4(position, 1.0);
      vWorld = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`;
  const CLOUD_FRAG = `
    uniform float uTime; uniform vec3 uColA; uniform vec3 uColB; uniform vec3 uColC; uniform vec3 uFog; uniform vec3 uCam;
    varying vec3 vWorld;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float vnoise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
    }
    float fbm(vec2 p) {
      float v = 0.0, a = 0.5;
      for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
      return v;
    }
    void main() {
      vec2 p = vWorld.xz * 0.011;
      float n = fbm(p + vec2(uTime * 0.012, uTime * 0.007));
      float n2 = fbm(p * 2.4 - vec2(uTime * 0.02, -uTime * 0.01));
      float c = smoothstep(0.3, 0.85, n * 0.7 + n2 * 0.45);
      vec3 col = mix(uColA, uColB, c);
      col = mix(col, uColC, pow(c, 3.0) * 0.75);
      float dist = length(vWorld.xz - uCam.xz);
      col = mix(uFog, col, smoothstep(760.0, 220.0, dist));
      gl_FragColor = vec4(col, 1.0);
    }`;

  const FINAL_SHADER = {
    uniforms: {
      tDiffuse: { value: null }, uHurt: { value: 0 }, uTime: { value: 0 }, uSat: { value: 1 },
      uAber: { value: 0 }, uVig: { value: 1 }, uFlash: { value: 0 }, uGrade: { value: 0 },
    },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float uHurt, uTime, uSat, uAber, uVig, uFlash, uGrade;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        vec2 c = vUv - 0.5;
        float d = length(c);
        vec2 off = c * (0.0025 + uAber * 0.02) * d;
        vec3 col;
        col.r = texture2D(tDiffuse, vUv + off).r;
        col.g = texture2D(tDiffuse, vUv).g;
        col.b = texture2D(tDiffuse, vUv - off).b;
        float lum = dot(col, vec3(0.299, 0.587, 0.114));
        col = mix(vec3(lum), col, uSat);
        // hell grade: warmer reds, thinner blues, deeper blacks
        vec3 hg = pow(max(col * vec3(1.1, 0.9, 0.8), 0.0), vec3(1.07));
        col = mix(col, hg, uGrade);
        float vig = smoothstep(0.95, 0.3, d * uVig);
        col *= mix(0.6, 1.0, vig);
        col = mix(col, vec3(0.75, 0.04, 0.1), uHurt * smoothstep(0.2, 0.75, d) * 0.9);
        col += uFlash;
        col += (hash(vUv * 1000.0 + uTime) - 0.5) * 0.02;
        gl_FragColor = vec4(col, 1.0);
      }`,
  };

  const _v = new THREE.Vector3();
  const _ray = new THREE.Raycaster();
  const _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const _ndc = new THREE.Vector2();

  R.dyn = 1;
  R.pixelRatio = function () {
    const Q = R.Q;
    return Math.max(0.5, Math.min(Q.pr, Math.sqrt(Q.maxPix / (innerWidth * innerHeight))) * R.dyn);
  };
  // Phones only: drop the render resolution while the frame rate is low and win it back when it
  // recovers. A drop that buys nothing (a phone capped at 30 fps) is undone and not tried again.
  const dyn = { t0: 0, n: 0, cool: 4, lock: false, before: 0 };
  R.adapt = function (now) {
    if (!G.Mobile.on || !R.renderer) return;
    if (!dyn.t0) { dyn.t0 = now; return; }
    dyn.n++;
    const el = (now - dyn.t0) / 1000;
    if (el < 2) return;
    const fps = dyn.n / el;
    dyn.t0 = now; dyn.n = 0; dyn.cool -= el;
    if (document.hidden || dyn.cool > 0) return;
    let next = R.dyn;
    if (dyn.before && fps < dyn.before + 3) { next = Math.min(1, R.dyn / 0.85); dyn.lock = true; }
    else if (fps < 42 && R.dyn > 0.6 && !dyn.lock) next = Math.max(0.6, R.dyn * 0.85);
    else if (fps > 57 && R.dyn < 1) next = Math.min(1, R.dyn * 1.12);
    dyn.before = next < R.dyn ? fps : 0;
    if (Math.abs(next - R.dyn) > 0.01) { R.dyn = next; dyn.cool = 3; R.resize(); }
  };
  R.init = function (canvas) {
    const base = QUALITY[G.Settings.quality] || QUALITY.high;
    // phones: no MSAA, lighter grass and shadows, a resolution cap that suits a small sharp screen
    const Q = (R.Q = G.Mobile.on ? Object.assign({}, base, {
      samples: 0, grass: Math.round(base.grass * 0.55), shadowSize: 1024,
      pr: Math.min(window.devicePixelRatio || 1, base === QUALITY.low ? 1 : base === QUALITY.medium ? 1.25 : 1.5),
      maxPix: Math.min(base.maxPix, 1.6e6),
    }) : base);
    const renderer = (R.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false }));
    renderer.setPixelRatio(R.pixelRatio());
    renderer.setSize(innerWidth, innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = Q.shadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = (R.scene = new THREE.Scene());
    R.fogColor = new THREE.Color(0x3d4762);
    scene.fog = new THREE.FogExp2(R.fogColor, 0.0055);
    scene.background = R.fogColor.clone();

    const camera = (R.camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.5, 1400));
    camera.position.set(0, 30, 40);
    camera.lookAt(0, 0, 0);
    scene.add(camera);

    // ---------- lights ----------
    R.hemi = new THREE.HemisphereLight(0xc6d2f0, 0x4a3b2e, 1.0);
    scene.add(R.hemi);
    const sun = (R.sun = new THREE.DirectionalLight(0xffd3a8, 2.5));
    sun.position.set(22, 42, 16);
    sun.castShadow = Q.shadows;
    sun.shadow.mapSize.set(Q.shadowSize, Q.shadowSize);
    const sc = sun.shadow.camera;
    sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 140;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    scene.add(sun, sun.target);
    R.sunOffset = new THREE.Vector3(22, 42, 16);
    const rim = (R.rim = new THREE.DirectionalLight(0x6f8fd6, 0.8));
    rim.position.set(-30, 18, -26);
    scene.add(rim);

    // flash light pool (fixed count to avoid shader recompiles)
    R.flashes = [];
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 16, 2);
      l.position.set(0, -50, 0);
      scene.add(l);
      R.flashes.push({ light: l, t: 0, dur: 0, peak: 0 });
    }

    // ---------- sky ----------
    const sunDir = new THREE.Vector3(0.55, 0.13, -0.82).normalize();
    R.skyUniforms = {
      uTop: { value: new THREE.Color(0x0f1a33) },
      uMid: { value: new THREE.Color(0x3c5a86) },
      uHorizon: { value: new THREE.Color(0xf0ae66) },
      uBottom: { value: new THREE.Color(0x2c3550) },
      uSunDir: { value: sunDir },
      uSunColor: { value: new THREE.Color(0xffc98a) },
      uTime: { value: 0 },
      uStars: { value: 1 },
    };
    const skyMat = (R.skyMat = new THREE.ShaderMaterial({
      uniforms: R.skyUniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
      side: THREE.BackSide, depthWrite: false, fog: false,
    }));
    R.sky = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), skyMat);
    R.sky.renderOrder = -10;
    R.sky.frustumCulled = false;
    scene.add(R.sky);

    // environment lighting from the sky gradient
    R.buildEnv();
    scene.environmentIntensity = 0.55;

    // ---------- cloud sea ----------
    R.cloudUniforms = {
      uTime: { value: 0 },
      uColA: { value: new THREE.Color(0x27334d) },
      uColB: { value: new THREE.Color(0x7f93b3) },
      uColC: { value: new THREE.Color(0xf4cf9c) },
      uFog: { value: new THREE.Color(0xb7a08a) },
      uCam: { value: new THREE.Vector3() },
    };
    const cloud = new THREE.Mesh(
      new THREE.PlaneGeometry(2400, 2400, 1, 1),
      new THREE.ShaderMaterial({ uniforms: R.cloudUniforms, vertexShader: CLOUD_VERT, fragmentShader: CLOUD_FRAG, fog: false })
    );
    cloud.rotation.x = -Math.PI / 2;
    cloud.position.y = -46;
    cloud.renderOrder = -5;
    scene.add(cloud);
    R.cloud = cloud;

    // ---------- post processing ----------
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: Q.samples });
    const composer = (R.composer = new TA.EffectComposer(renderer, rt));
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(innerWidth, innerHeight);
    composer.addPass(new TA.RenderPass(scene, camera));
    // Safety net: one NaN / infinite pixel would otherwise be smeared over the whole screen by the
    // bloom blur and turn everything black. Scrub them before any post effect reads the frame.
    composer.addPass(new TA.ShaderPass({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
        void main() {
          vec4 c = texture2D(tDiffuse, vUv);
          if (any(isnan(c.rgb))) c.rgb = vec3(0.0);
          gl_FragColor = vec4(clamp(c.rgb, 0.0, 48.0), 1.0);
        }`,
    }));
    R.bloom = new TA.UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), Q.bloomStrength, 0.42, 1.0);
    composer.addPass(R.bloom);
    composer.addPass(new TA.OutputPass());
    R.finalPass = new TA.ShaderPass(FINAL_SHADER);
    composer.addPass(R.finalPass);
    R.post = R.finalPass.uniforms;

    // ---------- camera state ----------
    R.cam = {
      pos: new THREE.Vector3(0, 30, 40), look: new THREE.Vector3(),
      height: 19.5, back: 12.4, zoom: 1, targetZoom: 1, trauma: 0, orbit: 0, t: 0,
    };
    R.hurtV = 0; R.flashV = 0; R.aberV = 0; R.satTarget = 1;

    addEventListener('resize', R.resize);
  };

  // reflections and ambient light come from a blurred copy of the current sky
  R.buildEnv = function () {
    try {
      const pmrem = new THREE.PMREMGenerator(R.renderer);
      const envScene = new THREE.Scene();
      const mat = R.skyMat.clone();
      mat.uniforms.uStars.value = 0;
      const envSky = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), mat);
      envScene.add(envSky);
      const old = R.scene.environment;
      R.scene.environment = pmrem.fromScene(envScene, 0.04).texture;
      if (old) old.dispose();
      envSky.geometry.dispose(); mat.dispose();
      pmrem.dispose();
    } catch (e) { console.warn('env failed', e); }
  };

  // ---------- looks: the normal sunset arena, and hell for the hell difficulty ----------
  const LOOKS = {
    normal: {
      fog: 0x3d4762, fogD: 0.0055, exposure: 1.0, env: 0.55, bloom: 0, grade: 0, vig: 1,
      hemi: [0xc6d2f0, 0x4a3b2e, 1.0], sun: [0xffd3a8, 2.5], rim: [0x6f8fd6, 0.8],
      sky: { uTop: 0x0f1a33, uMid: 0x3c5a86, uHorizon: 0xf0ae66, uBottom: 0x2c3550, uSunColor: 0xffc98a }, stars: 1,
      cloud: { uColA: 0x27334d, uColB: 0x7f93b3, uColC: 0xf4cf9c, uFog: 0xb7a08a }, cloudHot: 1,
    },
    // a blood-red dusk over a sea of lava, ash instead of stars, everything lit from below by fire
    // (bright enough that the ground, props and enemies all read; the mood comes from colour, not darkness)
    hell: {
      fog: 0x32110c, fogD: 0.0058, exposure: 1.1, env: 0.62, bloom: 0.14, grade: 0.85, vig: 0.98,
      hemi: [0xb88a80, 0x40160c, 1.3], sun: [0xffa678, 2.75], rim: [0xff4a1e, 1.25],
      sky: { uTop: 0x080203, uMid: 0x3a0906, uHorizon: 0xff4d12, uBottom: 0x1a0404, uSunColor: 0xff5a1a }, stars: 0.12,
      cloud: { uColA: 0x190403, uColB: 0x7a1606, uColC: 0xffb040, uFog: 0x3a0e08 }, cloudHot: 2.6,
    },
  };
  R.theme = 'normal';
  R.setTheme = function (name) {
    const L = LOOKS[name] || LOOKS.normal;
    if (R.theme === name && R.lookApplied) return;
    R.theme = name; R.lookApplied = true;
    R.fogColor.set(L.fog);
    R.scene.fog.color.copy(R.fogColor);
    R.scene.fog.density = L.fogD;
    R.scene.background.copy(R.fogColor);
    R.renderer.toneMappingExposure = L.exposure;
    R.hemi.color.set(L.hemi[0]); R.hemi.groundColor.set(L.hemi[1]); R.hemi.intensity = L.hemi[2];
    R.sun.color.set(L.sun[0]); R.sun.intensity = L.sun[1];
    R.rim.color.set(L.rim[0]); R.rim.intensity = L.rim[1];
    for (const k in L.sky) R.skyUniforms[k].value.set(L.sky[k]);
    R.skyUniforms.uStars.value = L.stars;
    for (const k in L.cloud) R.cloudUniforms[k].value.set(L.cloud[k]);
    R.cloudUniforms.uColC.value.multiplyScalar(L.cloudHot); // molten highlights bloom
    R.bloom.strength = R.Q.bloomStrength + L.bloom;
    R.post.uGrade.value = L.grade;
    R.post.uVig.value = L.vig;
    R.buildEnv();
    R.scene.environmentIntensity = L.env;
  };

  R.resize = function () {
    const w = innerWidth, h = innerHeight;
    R.camera.aspect = w / h;
    R.camera.updateProjectionMatrix();
    const pr = R.pixelRatio();
    R.renderer.setPixelRatio(pr);
    R.renderer.setSize(w, h);
    R.composer.setPixelRatio(pr);
    R.composer.setSize(w, h);
    G.Events.emit('resize', w, h);
  };

  // ---------- camera ----------
  R.shake = function (amount) {
    if (!G.Settings.shake) return;
    R.cam.trauma = Math.min(1, R.cam.trauma + amount);
  };

  function applyShake(dt) {
    const c = R.cam;
    c.t += dt;
    if (c.trauma > 0) {
      const s = c.trauma * c.trauma;
      const n = G.Noise.simplex2;
      R.camera.position.x += n(c.t * 22, 1.3) * s * 0.9;
      R.camera.position.y += n(c.t * 22, 7.1) * s * 0.6;
      R.camera.position.z += n(c.t * 22, 13.7) * s * 0.9;
      R.camera.rotation.z += n(c.t * 18, 21.5) * s * 0.035;
      c.trauma = Math.max(0, c.trauma - dt * 1.7);
    }
  }

  // gameplay follow camera
  R.updateCamera = function (dt, px, py, pz, ax, az) {
    const c = R.cam;
    if (!Number.isFinite(px + py + pz)) return;
    if (!Number.isFinite(ax + az)) { ax = px; az = pz; }
    c.zoom = U.damp(c.zoom, c.targetZoom, 3, dt);
    let lx = (ax - px) * 0.17, lz = (az - pz) * 0.17;
    const ll = Math.hypot(lx, lz);
    if (ll > 4.5) { lx *= 4.5 / ll; lz *= 4.5 / ll; }
    _v.set(px + lx, py, pz + lz);
    c.look.x = U.damp(c.look.x, _v.x, 8, dt);
    c.look.y = U.damp(c.look.y, _v.y, 8, dt);
    c.look.z = U.damp(c.look.z, _v.z, 8, dt);
    const dx = c.look.x, dy = c.look.y + c.height * c.zoom, dz = c.look.z + c.back * c.zoom;
    c.pos.x = U.damp(c.pos.x, dx, 7, dt);
    c.pos.y = U.damp(c.pos.y, dy, 7, dt);
    c.pos.z = U.damp(c.pos.z, dz, 7, dt);
    R.camera.position.copy(c.pos);
    R.camera.lookAt(c.look);
    applyShake(dt);
    followShadow(px, pz);
  };

  // slow cinematic orbit for menus
  R.menuCamera = function (dt) {
    const c = R.cam;
    c.orbit += dt * 0.05;
    const r = 52, x = Math.sin(c.orbit) * r, z = Math.cos(c.orbit) * r;
    c.pos.x = U.damp(c.pos.x, x, 2, dt);
    c.pos.y = U.damp(c.pos.y, 15, 2, dt);
    c.pos.z = U.damp(c.pos.z, z, 2, dt);
    c.look.x = U.damp(c.look.x, 0, 2, dt);
    c.look.y = U.damp(c.look.y, 3, 2, dt);
    c.look.z = U.damp(c.look.z, 0, 2, dt);
    R.camera.position.copy(c.pos);
    R.camera.lookAt(c.look);
    applyShake(dt);
    followShadow(0, 0);
  };

  function followShadow(x, z) {
    const texel = 68 / R.Q.shadowSize;
    x = Math.round(x / texel) * texel;
    z = Math.round(z / texel) * texel;
    R.sun.target.position.set(x, 0, z);
    R.sun.position.set(x + R.sunOffset.x, R.sunOffset.y, z + R.sunOffset.z);
  }

  // ---------- helpers ----------
  R.screenToGround = function (nx, ny, h, out) {
    _ndc.set(nx, ny);
    _ray.setFromCamera(_ndc, R.camera);
    _plane.constant = -h;
    if (!_ray.ray.intersectPlane(_plane, out)) out.set(R.cam.look.x, h, R.cam.look.z);
    return out;
  };

  R.toScreen = function (x, y, z, out) {
    _v.set(x, y, z).project(R.camera);
    out.x = (_v.x * 0.5 + 0.5) * innerWidth;
    out.y = (-_v.y * 0.5 + 0.5) * innerHeight;
    out.vis = _v.z < 1 && _v.z > -1;
    return out;
  };

  R.flash = function (x, y, z, color, peak = 40, dur = 0.25, dist = 16) {
    let best = R.flashes[0];
    for (const f of R.flashes) if (f.t >= f.dur) { best = f; break; } else if (f.dur - f.t < best.dur - best.t) best = f;
    best.light.position.set(x, y, z);
    best.light.color.set(color);
    best.light.distance = dist;
    best.t = 0; best.dur = dur; best.peak = peak;
  };

  R.hurt = function (v) { R.hurtV = Math.max(R.hurtV, v); R.aberV = Math.max(R.aberV, v * 0.8); };
  R.screenFlash = function (v) { R.flashV = Math.max(R.flashV, v); };

  R.update = function (dt, realDt) {
    for (const f of R.flashes) {
      if (f.t < f.dur) {
        f.t += realDt;
        const k = Math.max(0, 1 - f.t / f.dur);
        f.light.intensity = f.peak * k * k;
      } else f.light.intensity = 0;
    }
    R.hurtV = Math.max(0, R.hurtV - realDt * 2.2);
    R.aberV = Math.max(0, R.aberV - realDt * 2.5);
    R.flashV = Math.max(0, R.flashV - realDt * 3);
    R.post.uHurt.value = R.hurtV;
    R.post.uAber.value = R.aberV;
    R.post.uFlash.value = R.flashV;
    R.post.uSat.value = U.damp(R.post.uSat.value, R.satTarget, 3, realDt);
    R.post.uTime.value += realDt;
    R.skyUniforms.uTime.value += realDt;
    R.cloudUniforms.uTime.value += realDt;
    R.cloudUniforms.uCam.value.copy(R.camera.position);
    R.sky.position.copy(R.camera.position);
  };

  R.render = function () {
    R.composer.render();
  };
})();

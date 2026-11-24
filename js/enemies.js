// ============================================================
// SHARDFALL - enemies: types, instanced rigs, AI (host), proxies (co-op clients)
// ============================================================
(() => {
  const G = window.G, U = G.U;
  const tmpM = new THREE.Matrix4(), tmpL = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler();
  const tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3(), tmpC = new THREE.Color();

  // ---------- shared geometry helpers ----------
  const Geo = (G.Geo = {
    col(geo, hex, jitter = 0.05) {
      const g = geo.index ? geo.toNonIndexed() : geo;
      g.computeVertexNormals();
      const n = g.attributes.position.count, c = new Float32Array(n * 3), base = new THREE.Color(hex);
      for (let i = 0; i < n; i += 3) {
        const j = 1 + (Math.random() - 0.5) * 2 * jitter;
        for (let k = 0; k < 3 && i + k < n; k++) { c[(i + k) * 3] = base.r * j; c[(i + k) * 3 + 1] = base.g * j; c[(i + k) * 3 + 2] = base.b * j; }
      }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      return g;
    },
    at(geo, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
      tmpE.set(rx, ry, rz); tmpQ.setFromEuler(tmpE);
      geo.applyMatrix4(tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(sx, sy, sz)));
      return geo;
    },
    part(list) {
      return TA.mergeGeometries(list.map((d) => Geo.col(Geo.at(d[0], d[2] || 0, d[3] || 0, d[4] || 0, d[5] || 0, d[6] || 0, d[7] || 0, d[8] || 1, d[9] || d[8] || 1, d[10] || d[8] || 1), d[1], d[11] != null ? d[11] : 0.05)), false);
    },
    rock(detail, seed, amp = 0.22) {
      let g = new THREE.IcosahedronGeometry(1, detail);
      if (g.index) g = g.toNonIndexed();
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const d = 1 + G.Noise.simplex2(x * 1.7 + seed, y * 1.7 - seed) * amp + G.Noise.simplex2(z * 2.2 - seed, x * 2) * amp * 0.5;
        p.setXYZ(i, x * d, y * d, z * d);
      }
      return g;
    },
  });
  const Sph = (r, w = 10, h = 8) => new THREE.SphereGeometry(r, w, h);
  const Cyl = (a, b, h, s = 8) => new THREE.CylinderGeometry(a, b, h, s);
  const Cone = (r, h, s = 8, open = false) => new THREE.ConeGeometry(r, h, s, 1, open);
  const Box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
  const Ico = (r, d = 0) => new THREE.IcosahedronGeometry(r, d);

  // ---------- type definitions ----------
  const TYPES = {
    imp: { name: '임프', hp: 26, speed: 4.3, dmg: 9, r: 0.55, xp: 1, score: 10, color: 0xd8344a, h: 1.5, mass: 1, rig: 'imp' },
    runner: { name: '질주자', hp: 12, speed: 7.4, dmg: 6, r: 0.45, xp: 1, score: 8, color: 0x7cd84a, h: 0.9, mass: 0.6, rig: 'runner' },
    caster: { name: '주술사', hp: 34, speed: 3.4, dmg: 10, r: 0.55, xp: 3, score: 25, color: 0x8a5ad0, h: 1.9, mass: 1, rig: 'caster' },
    bomber: { name: '폭탄병', hp: 20, speed: 5.3, dmg: 24, r: 0.55, xp: 2, score: 20, color: 0xff8a2a, h: 1.4, mass: 0.8, rig: 'bomber' },
    brute: { name: '거석병', hp: 170, speed: 2.7, dmg: 20, r: 1.15, xp: 8, score: 80, color: 0x6e7f9a, h: 2.8, mass: 4, rig: 'brute' },
    splitter: { name: '분열체', hp: 70, speed: 3.3, dmg: 11, r: 0.85, xp: 3, score: 30, color: 0x3fd0c8, h: 1.4, mass: 1.5, rig: 'splitter' },
    mini: { name: '작은 분열체', hp: 22, speed: 5.0, dmg: 7, r: 0.48, xp: 1, score: 8, color: 0x3fd0c8, h: 0.8, mass: 0.6, rig: 'splitter', scale: 0.55 },
    wraith: { name: '망령 기사', hp: 48, speed: 4.6, dmg: 13, r: 0.6, xp: 4, score: 40, color: 0x5a7bff, h: 2.0, mass: 1.2, rig: 'wraith' },
    spider: { name: '도약 거미', hp: 30, speed: 5.4, dmg: 12, r: 0.62, xp: 2, score: 22, color: 0xb8e04a, h: 1.0, mass: 0.8, rig: 'spider' },
    shield: { name: '방패병', hp: 95, speed: 2.9, dmg: 15, r: 0.8, xp: 5, score: 50, color: 0xc89a4a, h: 2.1, mass: 2.6, rig: 'shield' },
    sniper: { name: '저격수', hp: 30, speed: 3.7, dmg: 22, r: 0.5, xp: 3, score: 35, color: 0x6fd8ff, h: 1.8, mass: 0.9, rig: 'sniper' },
    healer: { name: '치유사', hp: 44, speed: 3.3, dmg: 8, r: 0.55, xp: 4, score: 45, color: 0x7cffb0, h: 2.3, mass: 1, rig: 'healer' },
  };
  const AFFIX = { swift: '신속', armored: '강철', volatile: '불안정' };
  // order matters: co-op packs these as indexes (type: 4 bits, state: 4 bits)
  const TYPE_KEYS = ['imp', 'runner', 'caster', 'bomber', 'brute', 'splitter', 'mini', 'wraith', 'spider', 'shield', 'sniper', 'healer'];
  const AFFIX_KEYS = [null, 'swift', 'armored', 'volatile'];
  const STATE_KEYS = ['move', 'cast', 'fuse', 'windup', 'recover', 'blinkOut', 'blinkIn', 'crouch', 'leap', 'brace', 'bash', 'aim', 'heal'];
  const STATE_DUR = { move: 0, cast: 0.55, fuse: 0.7, windup: 0.85, recover: 0.45, blinkOut: 0.3, blinkIn: 0.35, crouch: 0.45, leap: 0.45, brace: 0.6, bash: 0.32, aim: 1.0, heal: 0.8 };
  // keep their distance and shoot (or heal) instead of biting: [too close, too far]
  const RANGED = { caster: [8, 12.5], sniper: [12, 19], healer: [9, 14] };
  // states where the body is committed to a direction
  const LOCKED = new Set(['crouch', 'leap', 'brace', 'bash', 'aim']);
  // light shots a shield stops from the front
  const BLOCKABLE = new Set(['bolt', 'drone', 'blade']);

  // ---------- rigs ----------
  const RIG_DEFS = {
    imp: () => [
      { geo: Geo.part([[Sph(0.42), 0xc8303f, 0, 0.78, 0, 0, 0, 0, 1, 1.1, 0.95], [Sph(0.28), 0xe86a5a, 0, 0.7, 0.2], [Sph(0.3), 0xc8303f, 0, 1.3, 0.04],
          [Cone(0.08, 0.36, 6), 0xf0e0c0, 0.17, 1.58, 0, 0, 0, -0.45], [Cone(0.08, 0.36, 6), 0xf0e0c0, -0.17, 1.58, 0, 0, 0, 0.45],
          [Cyl(0.09, 0.12, 0.4), 0x8a1f2a, 0.18, 0.2, 0], [Cyl(0.09, 0.12, 0.4), 0x8a1f2a, -0.18, 0.2, 0], [Cone(0.1, 0.5, 5), 0x8a1f2a, 0, 0.6, -0.4, -1.2]]) },
      { glow: 0xffd040, k: 3, geo: Geo.part([[Sph(0.065, 6, 5), 0xffffff, 0.11, 1.33, 0.27], [Sph(0.065, 6, 5), 0xffffff, -0.11, 1.33, 0.27]]) },
      { pivot: [0.42, 1.0, 0], anim: armSwing(1), geo: Geo.part([[Cyl(0.08, 0.06, 0.5), 0xb02838, 0, -0.25, 0], [Cone(0.1, 0.2, 5), 0xf0e0c0, 0, -0.55, 0.05, Math.PI]]) },
      { pivot: [-0.42, 1.0, 0], anim: armSwing(-1), geo: Geo.part([[Cyl(0.08, 0.06, 0.5), 0xb02838, 0, -0.25, 0], [Cone(0.1, 0.2, 5), 0xf0e0c0, 0, -0.55, 0.05, Math.PI]]) },
    ],
    runner: () => [
      { geo: Geo.part([[Ico(0.4, 0), 0x5ab83a, 0, 0.45, 0, 0, 0, 0, 0.9, 0.7, 1.3], [Cone(0.22, 0.45, 6), 0x4a9a2a, 0, 0.5, 0.48, Math.PI / 2],
          [Cone(0.07, 0.35, 4), 0xd0f070, 0, 0.82, 0.1, -0.3], [Cone(0.07, 0.3, 4), 0xd0f070, 0, 0.78, -0.18, -0.6], [Cone(0.07, 0.25, 4), 0xd0f070, 0, 0.7, -0.4, -0.9],
          [Cyl(0.05, 0.05, 0.4), 0x2f6a1f, 0.25, 0.18, 0.2, 0, 0, 0.4], [Cyl(0.05, 0.05, 0.4), 0x2f6a1f, -0.25, 0.18, 0.2, 0, 0, -0.4],
          [Cyl(0.05, 0.05, 0.4), 0x2f6a1f, 0.25, 0.18, -0.25, 0, 0, 0.4], [Cyl(0.05, 0.05, 0.4), 0x2f6a1f, -0.25, 0.18, -0.25, 0, 0, -0.4]]) },
      { glow: 0xff3030, k: 3.5, geo: Geo.part([[Sph(0.05, 6, 5), 0xffffff, 0.1, 0.6, 0.6], [Sph(0.05, 6, 5), 0xffffff, -0.1, 0.6, 0.6]]) },
    ],
    caster: () => [
      { geo: Geo.part([[Cone(0.5, 1.3, 9, true), 0x6b3aa8, 0, 0.85, 0], [Sph(0.3), 0x58309a, 0, 1.6, 0], [Cone(0.33, 0.55, 9), 0x58309a, 0, 1.92, -0.05, -0.2],
          [Sph(0.2), 0x0a0612, 0, 1.56, 0.14], [Cyl(0.06, 0.06, 0.7), 0x5a3a8a, 0.4, 1.15, 0.25, 0.9, 0, 0], [Cyl(0.06, 0.06, 0.7), 0x5a3a8a, -0.4, 1.15, 0.25, 0.9, 0, 0]]) },
      { glow: 0xff6a8a, k: 3.2, geo: Geo.part([[Sph(0.05, 6, 5), 0xffffff, 0.08, 1.58, 0.3], [Sph(0.05, 6, 5), 0xffffff, -0.08, 1.58, 0.3]]) },
      { glow: 0xff6a8a, k: 2.8, pivot: [0, 1.2, 0.6], anim: casterOrb, geo: Geo.part([[Ico(0.17, 1), 0xffffff]]) },
      { glow: 0xd08cff, k: 2, pivot: [0, 0.55, 0], anim: spinY(1.5), geo: Geo.part([[new THREE.TorusGeometry(0.62, 0.025, 4, 24), 0xffffff, 0, 0, 0, Math.PI / 2]]) },
    ],
    bomber: () => [
      { geo: Geo.part([[Sph(0.5, 12, 10), 0x3a2f3a, 0, 0.65, 0], [new THREE.TorusGeometry(0.5, 0.07, 6, 18), 0xd8742a, 0, 0.65, 0, Math.PI / 2],
          [Cyl(0.05, 0.05, 0.3), 0xc0a080, 0, 1.22, 0], [Cyl(0.1, 0.12, 0.3), 0x2a222a, 0.22, 0.14, 0], [Cyl(0.1, 0.12, 0.3), 0x2a222a, -0.22, 0.14, 0]]) },
      { glow: 0xffa030, k: 3, geo: Geo.part([[Box(0.36, 0.08, 0.05), 0xffffff, 0, 0.75, 0.48]]) },
      { glow: 0xffcf5a, k: 4, pivot: [0, 1.4, 0], anim: fuseSpark, geo: Geo.part([[Ico(0.11, 0), 0xffffff]]) },
    ],
    brute: () => [
      { geo: Geo.part([[Geo.rock(1, 3), 0x6e7f9a, 0, 1.6, 0, 0, 0, 0, 1.1, 0.95, 0.85, 0.08], [Box(0.65, 0.55, 0.6), 0x5e6f8a, 0, 2.45, 0.2],
          [Box(0.5, 0.9, 0.5), 0x56657e, 0.48, 0.45, 0], [Box(0.5, 0.9, 0.5), 0x56657e, -0.48, 0.45, 0], [Geo.rock(0, 9), 0x4f8a5a, 0, 2.45, -0.3, 0, 0, 0, 0.6, 0.4, 0.5]]) },
      { glow: 0xff7a2a, k: 3, geo: Geo.part([[Box(0.1, 0.06, 0.05), 0xffffff, 0.14, 2.5, 0.51], [Box(0.1, 0.06, 0.05), 0xffffff, -0.14, 2.5, 0.51],
          [Box(0.06, 0.6, 0.05), 0xffffff, 0.15, 1.7, 0.86, 0, 0, 0.4], [Box(0.05, 0.4, 0.05), 0xffffff, -0.2, 1.4, 0.84, 0, 0, -0.6]]) },
      { pivot: [1.05, 2.1, 0], anim: bruteArm(1), geo: Geo.part([[Box(0.45, 1.0, 0.45), 0x6a7b96, 0, -0.5, 0], [Geo.rock(0, 5), 0x5a6a84, 0, -1.2, 0.05, 0, 0, 0, 0.5, 0.5, 0.5]]) },
      { pivot: [-1.05, 2.1, 0], anim: bruteArm(-1), geo: Geo.part([[Box(0.45, 1.0, 0.45), 0x6a7b96, 0, -0.5, 0], [Geo.rock(0, 7), 0x5a6a84, 0, -1.2, 0.05, 0, 0, 0, 0.5, 0.5, 0.5]]) },
    ],
    splitter: () => [
      { pivot: [0, 0, 0], anim: wobble, geo: Geo.part([[Sph(0.85, 14, 10), 0x3fd0c8, 0, 0.68, 0, 0, 0, 0, 1, 0.8, 1, 0.03], [Sph(0.3), 0x2a9a94, 0.45, 1.05, 0.2]]) },
      { glow: 0x9ffff0, k: 2.5, pivot: [0, 0, 0], anim: wobble, geo: Geo.part([[Sph(0.26), 0xffffff, 0, 0.7, 0], [Sph(0.08, 6, 5), 0xffffff, 0.22, 0.95, 0.72], [Sph(0.08, 6, 5), 0xffffff, -0.22, 0.95, 0.72]]) },
    ],
    wraith: () => [
      { pivot: [0, 0, 0], anim: hover, geo: Geo.part([[Cone(0.58, 1.5, 7, true), 0x2a3a8a, 0, 1.05, 0], [Sph(0.3), 0x8a9ac8, 0, 1.85, 0], [Box(0.9, 0.2, 0.4), 0x8a9ac8, 0, 1.6, 0], [Cone(0.12, 0.4, 5), 0x8a9ac8, 0, 2.2, 0]]) },
      { glow: 0x8ff0ff, k: 3.5, pivot: [0, 0, 0], anim: hover, geo: Geo.part([[Box(0.26, 0.05, 0.05), 0xffffff, 0, 1.88, 0.28]]) },
      { glow: 0x7a9bff, k: 2.5, pivot: [0.5, 1.45, 0.1], anim: swordSwing, geo: Geo.part([[Box(0.08, 0.08, 1.2), 0xffffff, 0, 0, 0.55]]) },
    ],
    // leaping spider: eight legs in four pairs that step in a tetrapod gait
    spider: () => [
      { geo: Geo.part([[Sph(0.5, 12, 9), 0x2e2836, 0, 0.66, -0.42, 0, 0, 0, 1, 0.78, 1.2], [Sph(0.3, 10, 8), 0x3b3344, 0, 0.62, 0.22, 0, 0, 0, 1.05, 0.8, 1.1],
          [Cone(0.05, 0.24, 4), 0xe0d8b8, 0.09, 0.47, 0.5, 2.0], [Cone(0.05, 0.24, 4), 0xe0d8b8, -0.09, 0.47, 0.5, 2.0]]) },
      { glow: 0xc8ff4a, k: 3, geo: Geo.part([[Sph(0.055, 6, 5), 0xffffff, 0.08, 0.74, 0.5], [Sph(0.055, 6, 5), 0xffffff, -0.08, 0.74, 0.5],
          [Sph(0.035, 6, 5), 0xffffff, 0.16, 0.7, 0.45], [Sph(0.035, 6, 5), 0xffffff, -0.16, 0.7, 0.45],
          [Box(0.07, 0.05, 0.7), 0xffffff, 0, 1.03, -0.42], [Box(0.5, 0.05, 0.07), 0xffffff, 0, 0.98, -0.55]]) },
      { pivot: [0.2, 0.6, 0.21], anim: spiderLeg(1, 0), geo: spiderLegs(1, [[0.21, 0.7], [-0.07, -0.2]]) },
      { pivot: [0.2, 0.6, 0.21], anim: spiderLeg(1, 1), geo: spiderLegs(1, [[0.07, 0.25], [-0.21, -0.65]]) },
      { pivot: [-0.2, 0.6, 0.21], anim: spiderLeg(-1, 1), geo: spiderLegs(-1, [[0.21, 0.7], [-0.07, -0.2]]) },
      { pivot: [-0.2, 0.6, 0.21], anim: spiderLeg(-1, 0), geo: spiderLegs(-1, [[0.07, 0.25], [-0.21, -0.65]]) },
    ],
    // shield bearer: bronze tower shield in front, spear behind it
    shield: () => [
      { geo: Geo.part([[Cyl(0.42, 0.5, 1.15, 8), 0x6b5a3e, 0, 0.98, -0.05], [Sph(0.3, 10, 8), 0x8c7a56, 0, 1.78, -0.02], [Cone(0.33, 0.32, 8), 0x8c7a56, 0, 2.02, -0.02],
          [Box(0.22, 0.6, 0.24), 0x4b3f2e, 0.2, 0.3, -0.05], [Box(0.22, 0.6, 0.24), 0x4b3f2e, -0.2, 0.3, -0.05], [Box(0.28, 0.22, 0.6), 0x8c7a56, 0.5, 1.45, -0.1],
          [Cyl(0.04, 0.04, 2.4, 5), 0x5a4632, 0.62, 1.4, -0.2, 0.25], [Cone(0.09, 0.4, 5), 0xd8d0c0, 0.62, 2.62, 0.1, 0.25]]) },
      { glow: 0xffc35a, k: 2.6, geo: Geo.part([[Box(0.34, 0.05, 0.05), 0xffffff, 0, 1.8, 0.29]]) },
      { pivot: [-0.05, 0, 0.62], anim: shieldPose, geo: Geo.part([[Box(1.3, 1.8, 0.16), 0x8a6a34, 0, 1.02, 0], [Box(1.4, 0.13, 0.22), 0xb08a40, 0, 1.92, 0], [Box(1.4, 0.13, 0.22), 0xb08a40, 0, 0.12, 0],
          [Box(0.13, 1.85, 0.22), 0xb08a40, 0.66, 1.02, 0], [Box(0.13, 1.85, 0.22), 0xb08a40, -0.66, 1.02, 0], [Box(0.1, 1.5, 0.2), 0xb08a40, 0, 1.02, 0.02]]) },
      { glow: 0xffc35a, k: 2.4, pivot: [-0.05, 0, 0.62], anim: shieldPose, geo: Geo.part([[new THREE.OctahedronGeometry(0.2, 0), 0xffffff, 0, 1.15, 0.12, 0, 0, 0, 1, 1.5, 0.5]]) },
    ],
    // hooded crossbow sniper; the loaded bolt brightens while it aims
    sniper: () => [
      { geo: Geo.part([[Cone(0.42, 1.3, 7, true), 0x24485a, 0, 0.78, 0], [Sph(0.25, 10, 8), 0x1d3a4a, 0, 1.55, 0], [Cone(0.29, 0.55, 7), 0x1d3a4a, 0, 1.78, -0.1, -0.45],
          [Sph(0.17, 8, 6), 0x080b10, 0, 1.52, 0.12], [Box(0.6, 0.1, 0.3), 0x3a6a7a, 0, 1.3, 0]]) },
      { glow: 0x8ff0ff, k: 3.2, geo: Geo.part([[Sph(0.045, 6, 5), 0xffffff, 0.07, 1.55, 0.26], [Sph(0.045, 6, 5), 0xffffff, -0.07, 1.55, 0.26]]) },
      { pivot: [0.14, 1.2, 0.2], anim: sniperArm, geo: Geo.part([[Box(0.09, 0.1, 1.2), 0x4a3a2a, 0, 0, 0.4], [Box(1.0, 0.06, 0.08), 0x5d4a33, 0, 0.03, 0.85],
          [Box(0.05, 0.05, 0.05), 0x5d4a33, 0.5, 0.03, 0.78], [Box(0.05, 0.05, 0.05), 0x5d4a33, -0.5, 0.03, 0.78]]) },
      { glow: 0x8ff0ff, k: 2.6, pivot: [0.14, 1.2, 0.2], anim: sniperBolt, geo: Geo.part([[Box(0.035, 0.035, 0.95), 0xffffff, 0, 0.08, 0.5]]) },
    ],
    // floating healer with a staff and a green halo that swells as it channels
    healer: () => [
      { pivot: [0, 0, 0], anim: hover, geo: Geo.part([[Cone(0.52, 1.45, 8, true), 0xd8e6d2, 0, 1.0, 0], [Sph(0.24, 10, 8), 0xc8d6c0, 0, 1.86, 0], [Cone(0.2, 0.45, 6), 0x2c8a5e, 0, 2.12, -0.05, -0.25],
          [Box(0.8, 0.12, 0.32), 0x2c8a5e, 0, 1.56, 0], [Cyl(0.035, 0.035, 1.7, 5), 0x8a7a5a, 0.5, 1.05, 0.2]]) },
      { glow: 0x7cffb0, k: 3, pivot: [0, 0, 0], anim: hover, geo: Geo.part([[Sph(0.045, 6, 5), 0xffffff, 0.07, 1.88, 0.21], [Sph(0.045, 6, 5), 0xffffff, -0.07, 1.88, 0.21]]) },
      { glow: 0x7cffb0, k: 2.4, pivot: [0, 2.4, 0], anim: healHalo, geo: Geo.part([[new THREE.TorusGeometry(0.34, 0.03, 4, 22), 0xffffff, 0, 0, 0, Math.PI / 2]]) },
      { glow: 0x9fffc8, k: 3, pivot: [0.5, 1.95, 0.2], anim: healOrb, geo: Geo.part([[Ico(0.15, 1), 0xffffff]]) },
    ],
  };
  // two spider legs per part; s = side (+1 right, -1 left), legs: [z offset from the pivot, splay]
  function spiderLegs(s, legs) {
    const list = [];
    for (const [zi, sp] of legs) {
      const ph = -s * sp;
      for (const [mx, my, len, th, rad] of [[0.165 * s, 0.125, 0.42, Math.atan2(-0.33 * s, 0.25), 0.05], [0.48 * s, -0.17, 0.9, Math.atan2(-0.3 * s, -0.85), 0.045]]) {
        list.push([Cyl(rad * 0.75, rad, len, 5), 0x2a2531, mx * Math.cos(ph), my, -mx * Math.sin(ph) + zi, 0, ph, th]);
      }
    }
    return Geo.part(list);
  }
  function spiderLeg(side, pair) {
    return (e, t, o) => {
      if (e.state === 'leap') { o.rz = side * 0.55; return; }
      if (e.state === 'crouch') { o.rz = -side * 0.2; return; }
      const mv = Math.min(1, e.moveAmt), ph = t * 16 + e.phase + pair * Math.PI;
      o.ry = Math.sin(ph) * 0.32 * mv;
      o.rz = Math.max(0, Math.cos(ph)) * 0.22 * mv * side;
    };
  }
  function shieldPose(e, t, o) {
    if (e.state === 'brace') o.rx = -0.18;
    else if (e.state === 'bash') o.rx = 0.22;
    else o.rx = e.lunge * 0.25 + Math.sin(t * 6 + e.phase) * 0.02 * Math.min(1, e.moveAmt);
  }
  function sniperArm(e, t, o) { o.rx = e.state === 'aim' ? -0.04 : e.state === 'recover' ? 0.3 : 0.55; o.py = Math.sin(t * 2 + e.phase) * 0.02; }
  function sniperBolt(e, t, o) {
    sniperArm(e, t, o);
    const k = e.state === 'aim' && e.stateT0 > 0 ? 1 - e.stateT / e.stateT0 : 0;
    o.sx = o.sy = 1 + k * 2.2;
  }
  const channel = (e) => (e.state === 'heal' && e.stateT0 > 0 ? U.clamp(1 - e.stateT / e.stateT0, 0, 1) : 0);
  function healHalo(e, t, o) {
    o.ry = t * 2 + e.phase; o.py = 0.25 + Math.sin(t * 2.5 + e.phase) * 0.12;
    o.sx = o.sy = o.sz = 1 + channel(e) * 1.4;
  }
  function healOrb(e, t, o) {
    o.py = 0.25 + Math.sin(t * 2.5 + e.phase) * 0.12 + Math.sin(t * 4) * 0.04;
    o.sx = o.sy = o.sz = 1 + channel(e) * 1.8 + Math.sin(t * 7) * 0.08;
  }
  function armSwing(side) {
    return (e, t, o) => {
      const mv = Math.min(1, e.moveAmt);
      o.rx = Math.sin(t * 12 + e.phase + (side > 0 ? 0 : Math.PI)) * 0.8 * mv - e.lunge * 1.8;
      o.rz = side * 0.15;
    };
  }
  function bruteArm(side) {
    return (e, t, o) => {
      if (e.state === 'windup') { o.rx = -2.6 * U.easeOutCubic(Math.min(1, e.stateT0 > 0 ? 1 - e.stateT / e.stateT0 : 1)); o.rz = side * 0.2; }
      else if (e.state === 'recover') o.rx = 0.5;
      else { o.rx = Math.sin(t * 5 + e.phase + (side > 0 ? 0 : Math.PI)) * 0.4 * Math.min(1, e.moveAmt) - e.lunge * 1.2; o.rz = side * 0.12; }
    };
  }
  function casterOrb(e, t, o) { o.sx = o.sy = o.sz = 1 + (e.state === 'cast' ? (1 - e.stateT / 0.55) * 1.6 : 0) + Math.sin(t * 6) * 0.1; o.py = Math.sin(t * 3 + e.phase) * 0.08; }
  function spinY(sp) { return (e, t, o) => { o.ry = t * sp + e.phase; o.py = Math.sin(t * 2 + e.phase) * 0.06; }; }
  function fuseSpark(e, t, o) {
    const f = e.state === 'fuse' ? 1 - e.stateT / 0.7 : 0;
    o.sx = o.sy = o.sz = 1 + Math.sin(t * (20 + f * 40)) * 0.4 + f * 2.5;
  }
  function wobble(e, t, o) { const w = Math.sin(t * 6 + e.phase) * 0.08; o.sx = o.sz = 1 + w; o.sy = 1 - w * 1.4; }
  function hover(e, t, o) { o.py = 0.25 + Math.sin(t * 2.5 + e.phase) * 0.12; }
  function swordSwing(e, t, o) { o.py = 0.25 + Math.sin(t * 2.5 + e.phase) * 0.12; o.ry = e.lunge > 0 ? -2.2 + e.lunge * 3.2 : 0.3; o.rx = -0.3; }

  class Rig {
    constructor(scene, parts, cap) {
      this.parts = parts.map((p) => {
        const mesh = new THREE.InstancedMesh(p.geo, p.glow ? E.glowMat : E.bodyMat, cap);
        mesh.frustumCulled = false;
        mesh.castShadow = !p.glow;
        for (let i = 0; i < cap; i++) mesh.setColorAt(i, tmpC.set(0xffffff));
        mesh.count = 0;
        scene.add(mesh);
        return { ...p, mesh, pv: p.pivot ? new THREE.Vector3(...p.pivot) : null, gc: p.glow ? new THREE.Color(p.glow) : null };
      });
      this.n = 0; this.cap = cap;
    }
    begin() { this.n = 0; }
    add(e, t, tint, base) {
      if (this.n >= this.cap) return;
      const o = Rig.o;
      for (const p of this.parts) {
        let m = base;
        if (p.anim) {
          o.rx = o.ry = o.rz = 0; o.sx = o.sy = o.sz = 1; o.py = 0;
          p.anim(e, t, o);
          tmpE.set(o.rx, o.ry, o.rz); tmpQ.setFromEuler(tmpE);
          tmpL.compose(tmpP.set(p.pv.x, p.pv.y + o.py, p.pv.z), tmpQ, tmpS.set(o.sx, o.sy, o.sz));
          m = tmpM.multiplyMatrices(base, tmpL);
        }
        p.mesh.setMatrixAt(this.n, m);
        if (p.gc) tmpC.copy(p.gc).multiplyScalar(p.k * (1 + e.flash * 2)).multiply(tint);
        else tmpC.copy(tint);
        p.mesh.setColorAt(this.n, tmpC);
      }
      this.n++;
    }
    end() {
      for (const p of this.parts) {
        p.mesh.count = this.n;
        p.mesh.instanceMatrix.needsUpdate = true;
        p.mesh.instanceColor.needsUpdate = true;
      }
    }
  }
  Rig.o = {};

  // ---------- enemy ----------
  class Enemy {
    init(type, x, z, o = {}) {
      const T = TYPES[type];
      this.type = type; this.def = T;
      this.id = o.netId != null ? o.netId : (E.nextId = (E.nextId + 1) % 4096);
      this.elite = !!o.elite; this.affix = o.affix || null;
      this.scale = (T.scale || 1) * (this.elite ? 1.35 : 1);
      this.x = x; this.z = z; this.y = G.World.heightAt(x, z);
      this.maxHp = this.hp = T.hp * E.hpScale * (this.elite ? 3.6 : 1);
      this.r = T.r * (this.elite ? 1.3 : 1);
      this.h = T.h * this.scale;
      this.speed = T.speed * (this.affix === 'swift' ? 1.4 : 1) * U.rand(0.92, 1.08);
      this.dmg = T.dmg * (this.elite ? 1.4 : 1);
      this.mass = T.mass * (this.elite ? 2 : 1);
      this.alive = true; this.spawnT = o.instant ? 0.15 : 0.75; this.spawnMax = 0.75;
      this.vx = 0; this.vz = 0; this.kvx = 0; this.kvz = 0;
      const th = G.Heroes.nearest(x, z);
      this.facing = th ? Math.atan2(th.z - z, th.x - x) : 0;
      this.target = null; this.tgT = 0;
      this.atkCd = U.rand(0.6, 1.6); this.special = type === 'spider' ? U.rand(0.3, 1.0) : U.rand(1.5, 3);
      this.state = 'move'; this.stateT = 0; this.stateT0 = 0;
      this.burn = 0; this.burnDps = 0; this.burnTick = 0; this.slow = 0; this.slowK = 0; this.freeze = 0;
      this.flash = 0; this.lunge = 0; this.moveAmt = 0; this.phase = Math.random() * 10; this.strafe = U.chance(0.5) ? 1 : -1;
      this.tele = null; this.bladeT = 0; this.exploded = false; this.critT = 0; this.lastBy = null;
      this.isBoss = false; this.losT = 0; this.losOk = true;
      this.proxy = !!o.proxy; this.netHp = 1;
      this.hop = 0; this.lastResist = false; this.bashHit = false; this.aimA = 0; this.bashA = 0;
      return this;
    }
    hurt(dmg, o) {
      if (!this.alive || this.spawnT > 0 || this.proxy) return false;
      if (this.freeze > 0) dmg *= 1.25;
      if (this.affix === 'armored') dmg *= 0.6;
      // shield bearers stop light shots from the front; lances, novas, meteors and the rest go through
      if (this.type === 'shield' && o && o.by && BLOCKABLE.has(o.source) && this.freeze <= 0 && this.state !== 'bash') {
        const dx = o.by.x - this.x, dz = o.by.z - this.z, d = Math.hypot(dx, dz) || 1;
        if ((dx * Math.cos(this.facing) + dz * Math.sin(this.facing)) / d > 0.4) {
          dmg *= 0.2;
          this.lastResist = true;
          if (Math.random() < 0.5) G.FX.spark(this.x + Math.cos(this.facing) * 0.75, this.y + 1.1, this.z + Math.sin(this.facing) * 0.75, 0xffd27a, 4, 5);
        }
      }
      this.hp -= dmg;
      this.lastDealt = dmg;
      this.flash = 1;
      if (this.hp <= 0) { E.kill(this); return true; }
      return false;
    }
    applyStatus(kind, p, dur) {
      if (!this.alive || this.proxy) return;
      if (kind === 'burn') { this.burn = Math.max(this.burn, dur); this.burnDps = Math.max(this.burnDps, p); }
      else if (kind === 'slow') { this.slow = Math.max(this.slow, dur); this.slowK = Math.max(this.slowK, p); }
      else if (kind === 'freeze') {
        this.freeze = Math.max(this.freeze, dur * (this.type === 'brute' || this.type === 'shield' || this.elite ? 0.6 : 1));
        if (this.tele) { this.tele.kill(); this.tele = null; }
        this.state = 'move';
        this.hop = 0;
      }
    }
    knock(dx, dz, f) {
      if (this.proxy) return;
      const d = Math.hypot(dx, dz) || 1;
      this.kvx += (dx / d) * f / this.mass; this.kvz += (dz / d) * f / this.mass;
    }
  }

  const E = (G.Enemies = { list: [], TYPES, AFFIX, TYPE_KEYS, AFFIX_KEYS, STATE_KEYS, hpScale: 1, grid: new G.Grid(160, 4), nextId: 0 });
  const rigs = {};
  const pool = [];
  const proxies = new Map();

  E.init = function (scene) {
    E.bodyMat = U.addRim(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05, flatShading: true }), 0xffe2c8, 0.5, 2.2);
    E.glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    const caps = { imp: 160, runner: 160, caster: 80, bomber: 80, brute: 40, splitter: 120, wraith: 60, spider: 90, shield: 40, sniper: 50, healer: 30 };
    for (const k in RIG_DEFS) rigs[k] = new Rig(scene, RIG_DEFS[k](), caps[k]);
    E.aura = new THREE.InstancedMesh(new THREE.RingGeometry(0.8, 1, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: U.hdr(0xffc040, 1.8), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }), 60);
    E.barBg = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 0.13), new THREE.MeshBasicMaterial({ color: 0x15110d, transparent: true, opacity: 0.8, depthWrite: false }), 120);
    E.barFg = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 0.09).translate(0.5, 0, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, depthWrite: false }), 120);
    for (const m of [E.aura, E.barBg, E.barFg]) { m.frustumCulled = false; m.count = 0; m.renderOrder = 8; scene.add(m); }
    for (let i = 0; i < 120; i++) E.barFg.setColorAt(i, tmpC.set(0xe0384f));
  };

  E.spawn = function (type, x, z, o = {}) {
    const e = (pool.pop() || new Enemy()).init(type, x, z, o);
    E.list.push(e);
    if (!o.instant) { G.FX.portal(x, z, 0.7, e.elite ? 0xffc040 : 0xb45cff); G.Audio.play('portal'); }
    return e;
  };
  E.count = () => E.list.length;

  E.kill = function (e) {
    if (!e.alive) return;
    e.alive = false;
    if (e.tele) { e.tele.kill(); e.tele = null; }
    G.FX.enemyDeath(e.x, e.y, e.z, e.elite ? 0xffc040 : e.def.color, e.scale * (e.type === 'brute' ? 1.8 : 1));
    G.Audio.play('kill');
    G.Pickups.dropXP(e.x, e.z, e.def.xp * (e.elite ? 6 : 1));
    if (Math.random() < (e.elite ? 0.4 : 0.025)) G.Pickups.dropHealth(e.x, e.z);
    if (e.elite && G.Game.eliteChest()) G.Pickups.dropChest(e.x, e.z);
    if (e.type === 'splitter') {
      for (let k = 0; k < 2; k++) {
        const a = Math.random() * U.TAU;
        const m = E.spawn('mini', e.x + Math.cos(a) * 0.6, e.z + Math.sin(a) * 0.6, { instant: true });
        m.knock(Math.cos(a), Math.sin(a), 8);
      }
    }
    if (e.type === 'bomber' && !e.exploded) bomberExplode(e, 0.6);
    if (e.affix === 'volatile') {
      const x = e.x, z = e.z;
      G.Net.tele({ shape: 'circle', x, z, r: 3.6, dur: 0.9, color: 0xffa020 });
      E.later(0.9, () => {
        G.Net.vis('boom', U.r1(x), U.r1(z), 3.6, 0xffa020, 0.3);
        G.Heroes.damageCircle(x, z, 3.6, 22);
      });
    }
    G.Game.onKill(e);
  };

  const timers = [];
  E.later = function (t, fn) { timers.push({ t, fn }); };

  function bomberExplode(e, k = 1) {
    e.exploded = true;
    const r = 3.3 * (e.elite ? 1.3 : 1) * (k < 1 ? 0.85 : 1);
    G.Net.vis('boom', U.r1(e.x), U.r1(e.z), U.r1(r), 0xff8a2a, 0.3);
    G.Heroes.damageCircle(e.x, e.z, r, e.dmg * k, e.x, e.z);
    E.grid.query(e.x, e.z, r + 1, (o) => {
      if (o !== e && o.alive && U.dist(o.x, o.z, e.x, e.z) < r + o.r) {
        o.knock(o.x - e.x, o.z - e.z, 10);
        G.FX.dmgNumber(o.x, o.y + o.h, o.z, 40, 'burn');
        o.hurt(40);
      }
    });
  }

  // ---------- flow field pathfinding (Dijkstra from every living hero, rebuilt ~5x/sec) ----------
  // one cell per metre, sized to the island (a co-op island is wider)
  let FN = 80, FH = 40, FNN = FN * FN;
  let ffDist = null, ffBlocked = null, ffT = 0;
  let hk = new Float32Array(FNN * 8), hv = new Int32Array(FNN * 8);
  let hn = 0;
  function hpush(k, v) {
    let i = hn++;
    while (i > 0) { const p = (i - 1) >> 1; if (hk[p] <= k) break; hk[i] = hk[p]; hv[i] = hv[p]; i = p; }
    hk[i] = k; hv[i] = v;
  }
  function hpop() {
    const top = hv[0], k = hk[--hn], v = hv[hn];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= hn) break;
      if (c + 1 < hn && hk[c + 1] < hk[c]) c++;
      if (hk[c] >= k) break;
      hk[i] = hk[c]; hv[i] = hv[c]; i = c;
    }
    hk[i] = k; hv[i] = v;
    return top;
  }
  const cellOf = (v) => U.clamp(Math.floor(v + FH), 0, FN - 1);
  function ffInit() {
    const W = G.World, half = Math.ceil(W.ARENA_R + 3);
    if (half !== FH) {
      FH = half; FN = half * 2; FNN = FN * FN;
      hk = new Float32Array(FNN * 8); hv = new Int32Array(FNN * 8);
    }
    ffDist = new Float32Array(FNN); ffBlocked = new Uint8Array(FNN);
    for (let iz = 0; iz < FN; iz++) for (let ix = 0; ix < FN; ix++) {
      const x = ix - FH + 0.5, z = iz - FH + 0.5;
      let b = Math.hypot(x, z) > W.ARENA_R - 0.4;
      if (!b) for (const o of W.obstacles) if (!o.off && U.dist2(x, z, o.x, o.z) < (o.r + 0.5) * (o.r + 0.5)) { b = true; break; }
      ffBlocked[iz * FN + ix] = b ? 1 : 0;
    }
  }
  const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
  function ffBuild(heroes) {
    if (!ffDist) ffInit();
    ffDist.fill(1e9);
    hn = 0;
    for (const h of heroes) {
      const s = cellOf(h.z) * FN + cellOf(h.x);
      ffDist[s] = 0;
      hpush(0, s);
    }
    while (hn > 0) {
      const d0 = hk[0], c = hpop();
      if (d0 > ffDist[c]) continue;
      const cx = c % FN, cz = (c / FN) | 0;
      for (const [dx, dz, w] of NB) {
        const nx = cx + dx, nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= FN || nz >= FN) continue;
        const ni = nz * FN + nx;
        if (ffBlocked[ni]) continue;
        if (dx && dz && (ffBlocked[cz * FN + nx] || ffBlocked[nz * FN + cx])) continue;
        const nd = d0 + w;
        if (nd < ffDist[ni]) { ffDist[ni] = nd; if (hn < hk.length) hpush(nd, ni); }
      }
    }
  }
  E.flowDir = function (x, z, out) {
    out.x = 0; out.z = 0;
    if (!ffDist) return out;
    const cx = cellOf(x), cz = cellOf(z);
    let best = ffDist[cz * FN + cx], bx = 0, bz = 0;
    for (const [dx, dz] of NB) {
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= FN || nz >= FN) continue;
      const d = ffDist[nz * FN + nx];
      if (d < best) { best = d; bx = dx; bz = dz; }
    }
    if (!bx && !bz) return out;
    const tx = cx + bx - FH + 0.5 - x, tz = cz + bz - FH + 0.5 - z, l = Math.hypot(tx, tz) || 1;
    out.x = tx / l; out.z = tz / l;
    return out;
  };
  // a prop broke or grew back: the walkable grid is rebuilt on the next path update
  E.obstaclesChanged = function () { ffDist = null; ffT = 0; };
  E.los = function (x0, z0, x1, z1, pad = 0.5) {
    const dx = x1 - x0, dz = z1 - z0, L2 = dx * dx + dz * dz || 1;
    for (const o of G.World.obstacles) {
      if (o.off) continue;
      const t = U.clamp(((o.x - x0) * dx + (o.z - z0) * dz) / L2, 0, 1);
      const cx = x0 + dx * t - o.x, cz = z0 + dz * t - o.z, rr = o.r + pad;
      if (cx * cx + cz * cz < rr * rr) return false;
    }
    return true;
  };
  const _fd = { x: 0, z: 0 };
  function chaseDir(e, P, nx, nz, dist, dt) {
    e.losT -= dt;
    if (e.losT <= 0) { e.losT = 0.12 + Math.random() * 0.1; e.losOk = dist < 3 || E.los(e.x, e.z, P.x, P.z, e.r * 0.9); }
    if (e.losOk) { _fd.x = nx; _fd.z = nz; return _fd; }
    E.flowDir(e.x, e.z, _fd);
    if (!_fd.x && !_fd.z) { _fd.x = nx; _fd.z = nz; }
    return _fd;
  }
  function pickTarget(e, dt) {
    e.tgT -= dt;
    if (e.tgT > 0 && e.target && e.target.alive) return e.target;
    e.tgT = 0.4 + Math.random() * 0.3;
    let best = null, bd = 1e12;
    for (const h of G.Heroes.list) {
      if (!h.alive) continue;
      let d = U.dist2(e.x, e.z, h.x, h.z);
      if (h === e.target) d *= 0.7;
      if (d < bd) { bd = d; best = h; }
    }
    e.target = best;
    return best;
  }

  // ---------- AI (authoritative machine only) ----------
  function setState(e, s, t) { e.state = s; e.stateT = t; e.stateT0 = t; }

  function updateEnemy(e, dt, t) {
    if (e.spawnT > 0) { e.spawnT -= dt; e.y = G.World.heightAt(e.x, e.z); return; }
    e.flash = Math.max(0, e.flash - dt * 7);
    e.lunge = Math.max(0, e.lunge - dt * 3);
    e.critT = Math.max(0, e.critT - dt);
    e.atkCd -= dt; e.special -= dt;
    if (e.burn > 0) {
      e.burn -= dt; e.burnTick -= dt;
      if (Math.random() < 0.35) G.FX.P.emit(e.x + U.rand(-0.3, 0.3), e.y + U.rand(0.3, e.h), e.z + U.rand(-0.3, 0.3), 0, U.rand(1, 2.5), 0, 0.4, 0.4, 0.05, 3, 1.2, 0.3, 1, 1, 0);
      if (e.burnTick <= 0) {
        e.burnTick = 0.5;
        const d = e.burnDps * 0.5 * (e.lastBy ? e.lastBy.stats.dmgMult : 1);
        G.FX.dmgNumber(e.x, e.y + e.h, e.z, Math.round(d), 'burn');
        G.Game.stats.damage += d;
        if (e.hurt(d)) return;
      }
      if (e.burn <= 0) e.burnDps = 0;
    }
    if (e.slow > 0) { e.slow -= dt; if (e.slow <= 0) e.slowK = 0; }
    let frozen = false;
    if (e.freeze > 0) { e.freeze -= dt; frozen = true; if (Math.random() < 0.1) G.FX.spark(e.x, e.y + e.h * 0.6, e.z, 0xbff0ff, 1, 2); }

    const P = pickTarget(e, dt);
    let mx = 0, mz = 0;
    const ty = e.type;
    let dist = 99, dx = 0, dz = 0, nx = 0, nz = 0;
    if (P) {
      dx = P.x - e.x; dz = P.z - e.z; dist = Math.hypot(dx, dz) || 0.001;
      nx = dx / dist; nz = dz / dist;
    }
    let sp = e.speed * (1 - e.slowK);
    if (G.Heroes.chronoNear(e.x, e.z)) sp *= 0.65;
    if (!frozen && P) {
      if (e.state === 'move') {
        const band = RANGED[ty];
        if (band) {
          const f = chaseDir(e, P, nx, nz, dist, dt);
          if (dist > band[1] || !e.losOk) { mx = f.x; mz = f.z; }
          else if (dist < band[0]) { mx = -nx; mz = -nz; }
          else { mx = -nz * e.strafe * 0.7; mz = nx * e.strafe * 0.7; if (Math.random() < dt * 0.4) e.strafe *= -1; }
          if (ty === 'caster' && e.atkCd <= 0 && dist < 19 && e.losOk) { setState(e, 'cast', 0.55); G.Audio.play('telegraph'); }
          if (ty === 'sniper' && e.atkCd <= 0 && dist < 26 && e.losOk) {
            // a thin blue line, then one very fast bolt down it
            e.aimA = Math.atan2(P.z + P.vz * 0.25 - e.z, P.x + P.vx * 0.25 - e.x);
            e.facing = e.aimA;
            setState(e, 'aim', 1.0);
            e.tele = G.Net.tele({ shape: 'rect', x: e.x, z: e.z, angle: e.aimA, length: 32, width: 0.8, dur: 1.0, color: 0x6fd8ff });
            G.Audio.play('telegraph');
          }
          if (ty === 'healer' && e.special <= 0) {
            setState(e, 'heal', 0.8);
            G.Net.vis('ring', U.r1(e.x), U.r1(e.z), 7.5, 1, 0.8, 0x7cffb0);
          }
        } else {
          const f = chaseDir(e, P, nx, nz, dist, dt);
          mx = f.x; mz = f.z;
          if (ty === 'runner' && e.losOk) { const w = Math.sin(t * 5 + e.phase) * 0.7; mx += -nz * w; mz += nx * w; }
          if (ty === 'bomber' && dist < 2.4) {
            setState(e, 'fuse', 0.7);
            e.tele = G.Net.tele({ shape: 'circle', x: e.x, z: e.z, r: 3.3 * (e.elite ? 1.3 : 1), dur: 0.7, color: 0xff6a20 });
            G.Audio.play('telegraph');
          }
          if (ty === 'brute' && dist < 4.3 && e.special <= 0) {
            setState(e, 'windup', 0.85);
            e.tele = G.Net.tele({ shape: 'circle', x: e.x, z: e.z, r: 4.4 * e.scale, dur: 0.85, color: 0xff3344 });
          }
          if (ty === 'wraith' && dist > 7 && e.special <= 0) {
            setState(e, 'blinkOut', 0.3);
            G.FX.burst(e.x, e.y + 1, e.z, { count: 20, color: 0x7a9bff, intensity: 2.2, speed: [2, 5], life: [0.3, 0.5], size: [0.5, 0.05] });
          }
          if (ty === 'spider' && e.special <= 0 && dist > 2.5 && dist < 9.5 && e.losOk) {
            // crouch, then jump onto the marked spot (a little ahead of a moving target)
            let tx = P.x + P.vx * 0.35, tz = P.z + P.vz * 0.35;
            if (!G.World.isFree(tx, tz, 0.6)) { tx = P.x; tz = P.z; }
            e.lx0 = e.x; e.lz0 = e.z; e.lx = tx; e.lz = tz;
            e.facing = Math.atan2(tz - e.z, tx - e.x);
            setState(e, 'crouch', 0.45);
            e.tele = G.Net.tele({ shape: 'circle', x: tx, z: tz, r: 1.9 * e.scale, dur: 0.9, color: 0xc8ff4a });
          }
          if (ty === 'shield' && dist < 5.5 && e.special <= 0 && e.losOk) {
            // bashes where the shield points, so a target standing to the side is safe
            e.bashA = e.facing;
            setState(e, 'brace', 0.6);
            e.tele = G.Net.tele({ shape: 'rect', x: e.x, z: e.z, angle: e.bashA, length: 6.5, width: 2.2, dur: 0.6, color: 0xffb347 });
          }
        }
        if (!band && dist < e.r + 0.65 && e.atkCd <= 0) {
          e.atkCd = 0.9; e.lunge = 1;
          P.takeDamage(e.dmg, e.x, e.z);
        }
      } else {
        e.stateT -= dt;
        if (e.state === 'cast') {
          if (e.stateT <= 0) {
            const ox = e.x + Math.cos(e.facing) * 0.6, oz = e.z + Math.sin(e.facing) * 0.6;
            G.Patterns.start('fan', { x: U.r1(ox), z: U.r1(oz), y: U.r1(e.y + 1.2), a: U.r2(Math.atan2(dz, dx)), n: e.elite ? 5 : 3, sp: 0.22, v: 10.5, d: U.r1(e.dmg), r: 0.3, c: 0xff7a8a, l: 4 });
            e.atkCd = U.rand(2.3, 3.2); setState(e, 'move', 0);
          }
        } else if (e.state === 'fuse') {
          e.flash = Math.max(e.flash, Math.sin(t * 40) > 0 ? 0.7 : 0);
          if (e.stateT <= 0) { e.tele = null; bomberExplode(e, 1); e.hp = 0; E.kill(e); return; }
        } else if (e.state === 'windup') {
          if (e.stateT <= 0) {
            e.tele = null;
            const r = 4.4 * e.scale;
            G.Net.vis('slam', U.r1(e.x), U.r1(e.z), U.r1(r));
            G.Heroes.damageCircle(e.x, e.z, r, e.dmg * 1.4, e.x, e.z);
            e.special = U.rand(3, 4); setState(e, 'recover', 0.45);
          }
        } else if (e.state === 'recover') {
          if (e.stateT <= 0) setState(e, 'move', 0);
        } else if (e.state === 'blinkOut') {
          if (e.stateT <= 0) {
            const a = Math.random() * U.TAU, rr = 3.5 + Math.random() * 1.5;
            let tx = P.x + Math.cos(a) * rr, tz = P.z + Math.sin(a) * rr;
            if (!G.World.isFree(tx, tz, 0.8)) { const p = G.World.randomOpenPoint(0, G.World.ARENA_R - 2, 1); tx = p.x; tz = p.z; }
            e.x = tx; e.z = tz;
            G.FX.portal(tx, tz, 0.35, 0x7a9bff);
            setState(e, 'blinkIn', 0.35);
          }
        } else if (e.state === 'blinkIn') {
          if (e.stateT <= 0) { e.special = U.rand(3.5, 5); e.atkCd = 0.15; setState(e, 'move', 0); }
        } else if (e.state === 'crouch') {
          if (e.stateT <= 0) setState(e, 'leap', 0.45);
        } else if (e.state === 'leap') {
          const k = U.clamp(1 - e.stateT / 0.45, 0, 1);
          e.x = U.lerp(e.lx0, e.lx, k); e.z = U.lerp(e.lz0, e.lz, k);
          e.hop = Math.sin(k * Math.PI) * 2.2;
          if (e.stateT <= 0) {
            e.hop = 0; e.tele = null;
            const r = 1.9 * e.scale;
            G.Net.vis('ring', U.r1(e.x), U.r1(e.z), 0.3, U.r1(r), 0.3, 0xc8ff4a);
            G.Heroes.damageCircle(e.x, e.z, r, e.dmg * 1.3, e.x, e.z);
            e.special = U.rand(2.6, 3.8); setState(e, 'recover', 0.5);
          }
        } else if (e.state === 'brace') {
          if (e.stateT <= 0) { e.tele = null; e.bashHit = false; setState(e, 'bash', 0.32); G.Audio.play('dash'); }
        } else if (e.state === 'bash') {
          e.x += Math.cos(e.bashA) * 17 * dt; e.z += Math.sin(e.bashA) * 17 * dt;
          if (!e.bashHit) for (const h of G.Heroes.list) {
            if (h.alive && U.dist(h.x, h.z, e.x, e.z) < e.r + 1.0) { e.bashHit = true; h.takeDamage(e.dmg * 1.4, e.x, e.z); break; }
          }
          if (e.stateT <= 0) { e.special = U.rand(3, 4.2); setState(e, 'recover', 0.6); }
        } else if (e.state === 'aim') {
          if (e.stateT <= 0) {
            e.tele = null;
            const ox = e.x + Math.cos(e.aimA) * 0.7, oz = e.z + Math.sin(e.aimA) * 0.7;
            G.Patterns.start('fan', { x: U.r1(ox), z: U.r1(oz), y: U.r1(e.y + 1.25), a: U.r2(e.aimA), n: e.elite ? 3 : 1, sp: 0.1, v: 34, d: U.r1(e.dmg), r: 0.36, c: 0x8ff0ff, l: 1.1 });
            e.atkCd = U.rand(2.8, 3.8); setState(e, 'recover', 0.4);
          }
        } else if (e.state === 'heal') {
          if (e.stateT <= 0) {
            // mends everything nearby (itself included) by 14% of their health
            const R = 7.5;
            E.grid.query(e.x, e.z, R + 1.5, (o) => {
              if (!o.alive || o.hp >= o.maxHp || U.dist(o.x, o.z, e.x, e.z) > R + o.r) return;
              const amt = Math.min(o.maxHp - o.hp, o.maxHp * 0.14);
              if (amt < 1) return;
              o.hp += amt;
              G.FX.dmgNumber(o.x, o.y + o.h, o.z, '+' + Math.round(amt), 'heal');
            });
            G.Net.vis('ring', U.r1(e.x), U.r1(e.z), 0.5, R, 0.45, 0x7cffb0);
            G.Net.vis('sfx', 'heal');
            e.special = U.rand(4, 5.5); setState(e, 'recover', 0.4);
          }
        }
      }
    }
    if (frozen || e.state !== 'move' || !P) { mx = 0; mz = 0; }
    e.vx = U.damp(e.vx, mx * sp, 6, dt); e.vz = U.damp(e.vz, mz * sp, 6, dt);
    e.kvx = U.damp(e.kvx, 0, 6, dt); e.kvz = U.damp(e.kvz, 0, 6, dt);
    e.x += (e.vx + e.kvx) * dt; e.z += (e.vz + e.kvz) * dt;
    e.moveAmt = Math.hypot(e.vx, e.vz) / Math.max(1, e.speed);
    if (!frozen && P && !LOCKED.has(e.state)) {
      const want = e.state === 'move' && !RANGED[ty] && e.moveAmt > 0.2 ? Math.atan2(e.vz, e.vx) : Math.atan2(dz, dx);
      // the shield turns slowly, so you can get around it
      e.facing = U.dampAngle(e.facing, want, ty === 'shield' ? 2.2 : 8, dt);
    }
  }

  function separate() {
    const list = E.list;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a.alive || a.spawnT > 0) continue;
      E.grid.query(a.x, a.z, a.r + 1.3, (b) => {
        if (b === a || !b.alive || b.spawnT > 0) return;
        const dx = a.x - b.x, dz = a.z - b.z, rr = a.r + b.r, d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-6) {
          const d = Math.sqrt(d2), push = (rr - d) * 0.5, wa = b.mass / (a.mass + b.mass);
          a.x += (dx / d) * push * wa; a.z += (dz / d) * push * wa;
        }
      });
      G.World.resolve(a, a.r);
      for (const h of G.Heroes.list) {
        if (!h.alive) continue;
        const dx = a.x - h.x, dz = a.z - h.z, rr = a.r + 0.5, d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-6) { const d = Math.sqrt(d2); a.x = h.x + (dx / d) * rr; a.z = h.z + (dz / d) * rr; }
      }
      a.y = G.World.heightAt(a.x, a.z);
    }
  }

  // ---------- drawing (shared by host and clients) ----------
  const TINT = new THREE.Color();
  const baseM = new THREE.Matrix4();
  const baseE = new THREE.Euler(0, 0, 0, 'YXZ');
  function render(t) {
    for (const k in rigs) rigs[k].begin();
    let na = 0, nb = 0;
    const camQ = G.Render.camera.quaternion;
    for (const e of E.list) {
      if (!e.alive) continue;
      let s = e.scale;
      if (e.spawnT > 0) {
        const k = 1 - e.spawnT / e.spawnMax;
        if (k < 0.45) continue;
        s *= U.easeOutBack((k - 0.45) / 0.55);
      }
      TINT.setRGB(1, 1, 1);
      if (e.elite) TINT.setRGB(1.35, 1.12, 0.55);
      if (e.affix === 'armored') TINT.setRGB(1.1, 1.15, 1.3);
      if (e.freeze > 0) TINT.setRGB(0.55, 0.9, 1.8);
      else if (e.slowK > 0) TINT.multiply(tmpC.setRGB(0.8, 0.95, 1.35));
      if (e.burn > 0) TINT.multiply(tmpC.setRGB(1.3 + Math.sin(t * 30) * 0.2, 0.85, 0.6));
      if (e.state === 'blinkOut' || e.state === 'blinkIn') s *= e.state === 'blinkOut' ? U.clamp(e.stateT / 0.3, 0, 1) : U.clamp(1 - e.stateT / 0.35, 0, 1);
      if (e.flash > 0) TINT.lerp(tmpC.setRGB(6, 6, 6), e.flash * 0.8);
      let sq = 1, lift = 0;
      if (e.type === 'bomber' && e.state === 'fuse') sq = 1 + Math.sin(t * 30) * 0.08;
      else if (e.type === 'spider' && e.state === 'crouch') sq = 1.14;
      if (e.type === 'runner') lift = Math.abs(Math.sin(t * 16 + e.phase)) * 0.12 * e.moveAmt;
      else if (e.state === 'leap') lift = e.hop || 0;
      baseE.set(e.lunge * 0.35, Math.PI / 2 - e.facing, 0); tmpQ.setFromEuler(baseE);
      baseM.compose(tmpP.set(e.x, e.y + lift, e.z), tmpQ, tmpS.set(s * sq, s / sq, s * sq));
      rigs[e.def.rig].add(e, t, TINT, baseM);
      if (e.elite && na < 60) {
        tmpE.set(0, t * 2, 0); tmpQ.setFromEuler(tmpE);
        E.aura.setMatrixAt(na++, tmpM.compose(tmpP.set(e.x, e.y + 0.08, e.z), tmpQ, tmpS.setScalar(e.r * 1.6)));
      }
      if ((e.elite || e.maxHp >= 60) && e.hp < e.maxHp && nb < 120) {
        const w = Math.min(2.2, 0.9 + e.maxHp / 150), by = e.y + e.h + 0.55;
        E.barBg.setMatrixAt(nb, tmpM.compose(tmpS.set(e.x, by, e.z), camQ, tmpP.set(w + 0.08, 1, 1)));
        tmpS.set(-w / 2, 0, 0.01).applyQuaternion(camQ).add(tmpP.set(e.x, by, e.z));
        E.barFg.setMatrixAt(nb, tmpM.compose(tmpS, camQ, tmpP.set(w * Math.max(0, e.hp / e.maxHp), 1, 1)));
        E.barFg.setColorAt(nb, tmpC.set(e.elite ? 0xe0a23a : 0xd8384c));
        nb++;
      }
    }
    for (const k in rigs) rigs[k].end();
    E.aura.count = na; E.aura.instanceMatrix.needsUpdate = true;
    E.barBg.count = nb; E.barFg.count = nb;
    E.barBg.instanceMatrix.needsUpdate = true; E.barFg.instanceMatrix.needsUpdate = true;
    if (E.barFg.instanceColor) E.barFg.instanceColor.needsUpdate = true;
  }
  E.rebuildGrid = function () {
    E.grid.clear();
    for (const e of E.list) if (e.alive && e.spawnT <= 0) E.grid.insert(e);
  };

  // authoritative update
  E.update = function (dt, t) {
    for (let i = timers.length - 1; i >= 0; i--) { timers[i].t -= dt; if (timers[i].t <= 0) { const f = timers[i].fn; timers.splice(i, 1); f(); } }
    ffT -= dt;
    if (ffT <= 0) { const hs = G.Heroes.alive(); if (hs.length) { ffT = 0.2; ffBuild(hs); } }
    E.rebuildGrid();
    for (let i = 0; i < E.list.length; i++) { const e = E.list[i]; if (e.alive) updateEnemy(e, dt, t); }
    separate();
    let j = 0;
    for (let i = 0; i < E.list.length; i++) { const e = E.list[i]; if (e.alive) E.list[j++] = e; else pool.push(e); }
    E.list.length = j;
    E.rebuildGrid();
    render(t);
  };

  // ---------- co-op client: mirror the host's enemies ----------
  // ents: decoded host entries at the interpolated render time; fresh = a new host snapshot arrived
  E.netApply = function (ents, dt, t, fresh) {
    const seen = new Set();
    for (const s of ents) {
      let e = proxies.get(s.id);
      const type = TYPE_KEYS[s.ti] || 'imp';
      if (!e || e.type !== type) {
        if (e) { proxies.delete(s.id); pool.push(e); }
        e = (pool.pop() || new Enemy()).init(type, s.x, s.z, { elite: s.el, affix: AFFIX_KEYS[s.af], instant: !(s.fl & 1), netId: s.id, proxy: true });
        e.netHp = s.hp;
        proxies.set(s.id, e);
        if (s.fl & 1) G.FX.portal(s.x, s.z, 0.7, s.el ? 0xffc040 : 0xb45cff);
      }
      seen.add(s.id);
      const px = e.x, pz = e.z;
      e.x = s.x; e.z = s.z; e.y = G.World.heightAt(e.x, e.z);
      e.facing = U.dampAngle(e.facing, s.f, 14, dt);
      const v = Math.hypot(e.x - px, e.z - pz) / Math.max(dt, 1e-3);
      e.moveAmt = U.damp(e.moveAmt, U.clamp(v / Math.max(1, e.def.speed), 0, 1.5), 10, dt);
      const st = STATE_KEYS[s.st] || 'move';
      if (st !== e.state) {
        e.state = st; e.stateT0 = STATE_DUR[st] || 0; e.stateT = e.stateT0;
        if (st === 'blinkOut') G.FX.burst(e.x, e.y + 1, e.z, { count: 20, color: 0x7a9bff, intensity: 2.2, speed: [2, 5], life: [0.3, 0.5], size: [0.5, 0.05] });
        if (st === 'blinkIn') G.FX.portal(e.x, e.z, 0.35, 0x7a9bff);
      } else e.stateT = Math.max(0, e.stateT - dt);
      e.hop = st === 'leap' ? Math.sin(U.clamp(1 - e.stateT / 0.45, 0, 1) * Math.PI) * 2.2 : 0;
      e.freeze = s.fl & 2 ? 1 : 0;
      e.burn = s.fl & 4 ? 1 : 0;
      e.slowK = s.fl & 8 ? 0.4 : 0;
      if (s.fl & 16) e.lunge = 1;
      e.lunge = Math.max(0, e.lunge - dt * 3);
      e.flash = Math.max(0, e.flash - dt * 7);
      e.spawnT = s.fl & 1 ? Math.max(0.05, e.spawnT - dt) : 0;
      if (e.burn && Math.random() < 0.3) G.FX.P.emit(e.x + U.rand(-0.3, 0.3), e.y + U.rand(0.3, e.h), e.z + U.rand(-0.3, 0.3), 0, U.rand(1, 2.5), 0, 0.4, 0.4, 0.05, 3, 1.2, 0.3, 1, 1, 0);
      if (fresh && s.hp < e.netHp - 0.0005) {
        const dmg = (e.netHp - s.hp) * e.maxHp;
        if (dmg >= 1) {
          G.FX.dmgNumber(e.x, e.y + e.h, e.z, Math.round(dmg), s.fl & 32 ? 'crit' : '');
          G.Audio.play(s.fl & 32 ? 'crit' : 'hit');
          e.flash = 1;
        }
      } else if (fresh && s.hp > e.netHp + 0.004) {
        // a healer mended it
        const n = (s.hp - e.netHp) * e.maxHp;
        if (n >= 1) G.FX.dmgNumber(e.x, e.y + e.h, e.z, '+' + Math.round(n), 'heal');
      }
      if (fresh) e.netHp = s.hp;
      e.hp = s.hp * e.maxHp;
    }
    for (const [id, e] of proxies) {
      if (seen.has(id)) continue;
      proxies.delete(id);
      e.alive = false;
      if (e.spawnT <= 0) {
        G.FX.enemyDeath(e.x, e.y, e.z, e.elite ? 0xffc040 : e.def.color, e.scale * (e.type === 'brute' ? 1.8 : 1));
        G.Audio.play('kill');
        G.Pickups.cosmeticGems(e.x, e.z, e.def.xp * (e.elite ? 6 : 1));
      }
      pool.push(e);
    }
    E.list = Array.from(proxies.values());
    E.rebuildGrid();
    render(t);
  };

  E.killAll = function () { for (const e of E.list.slice()) if (e.alive) { e.spawnT = 0; e.hurt(1e9); } };
  E.clear = function () {
    for (const e of E.list) { if (e.tele) e.tele.kill(); e.alive = false; pool.push(e); }
    E.list.length = 0; timers.length = 0;
    proxies.clear();
    E.grid.clear();
    render(0);
  };
})();

// ============================================================
// SHARDFALL - world: floating island arena, props, grass, ambience
// ============================================================
(() => {
  const G = window.G, U = G.U, N = G.Noise;
  const W = (G.World = {});
  // S scales the island's width for co-op (1 for one player); props keep their size, the land spreads out
  const BASE_R = 37;
  W.S = 1;
  W.ARENA_R = BASE_R;
  W.obstacles = [];
  W.altar = { x: 0, z: 0, r: 4.6 };

  const HF_STEP = 0.5;
  let HF_HALF = 56, HF_RES = Math.round((HF_HALF * 2) / HF_STEP) + 1;
  let hf = null;

  function edgeR(th) { return (47 + N.fbm(Math.cos(th) * 1.7 + 4, Math.sin(th) * 1.7 - 2, 3) * 4) * W.S; }
  function pathMask(x, z) {
    const r = Math.hypot(x, z), th = Math.atan2(z, x);
    const wob = N.simplex2(x * 0.15, z * 0.15) * 0.9;
    let m = 1 - Math.abs(r - 12.5 * W.S + wob) / 1.5;
    if (r > 6 && r < W.ARENA_R - 2) {
      for (let k = 0; k < 4; k++) {
        const a = U.angleDiff(th, k * Math.PI / 2);
        m = Math.max(m, 1 - Math.abs(a * r + wob) / 1.3);
      }
    }
    return U.clamp(m, 0, 1);
  }
  function rawHeight(x, z) {
    const r = Math.hypot(x, z);
    let h = N.fbm(x * 0.045, z * 0.045, 4) * 0.55;
    h *= U.smoothstep(5, 9, r);
    h += U.smoothstep(W.ARENA_R - 1, W.ARENA_R + 7, r) * (1.4 + N.fbm(x * 0.08, z * 0.08, 3) * 1.4);
    return h;
  }
  W.heightAt = function (x, z) {
    const fx = (x + HF_HALF) / HF_STEP, fz = (z + HF_HALF) / HF_STEP;
    const ix = U.clamp(Math.floor(fx), 0, HF_RES - 2), iz = U.clamp(Math.floor(fz), 0, HF_RES - 2);
    const tx = U.clamp(fx - ix, 0, 1), tz = U.clamp(fz - iz, 0, 1);
    const i = iz * HF_RES + ix;
    const a = hf[i], b = hf[i + 1], c = hf[i + HF_RES], d = hf[i + HF_RES + 1];
    const h = (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
    const r = Math.hypot(x, z);
    return h + 0.42 * (1 - U.smoothstep(5.0, 5.5, r));
  };

  // ---------- geometry helpers ----------
  const tmpC = new THREE.Color(), tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler();
  const tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3();
  function colorize(geo, color, jitter = 0.06, moss = null) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) g.userData = geo.userData;
    g.computeVertexNormals();
    const pos = g.attributes.position, nor = g.attributes.normal, n = pos.count;
    const col = new Float32Array(n * 3);
    const base = new THREE.Color(color), mc = moss ? new THREE.Color(moss) : null;
    for (let i = 0; i < n; i += 3) {
      const j = 1 + (Math.random() - 0.5) * jitter * 2;
      for (let k = 0; k < 3 && i + k < n; k++) {
        tmpC.copy(base);
        if (mc && nor.getY(i + k) > 0.55) tmpC.lerp(mc, U.smoothstep(0.55, 0.85, nor.getY(i + k)));
        col[(i + k) * 3] = tmpC.r * j; col[(i + k) * 3 + 1] = tmpC.g * j; col[(i + k) * 3 + 2] = tmpC.b * j;
      }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }
  function place(geo, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    tmpE.set(rx, ry, rz); tmpQ.setFromEuler(tmpE);
    tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(sx, sy, sz));
    geo.applyMatrix4(tmpM);
    return geo;
  }
  function rockGeo(detail, seed) {
    let g = new THREE.IcosahedronGeometry(1, detail);
    if (g.index) g = g.toNonIndexed();
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const d = 1 + N.simplex2(x * 1.6 + seed, y * 1.6 - seed) * 0.22 + N.simplex2(z * 2.1 - seed, x * 2.1) * 0.12;
      p.setXYZ(i, x * d, y * d * 0.8, z * d);
    }
    return g;
  }
  function merge(list) {
    const m = TA.mergeGeometries(list, false);
    m.computeBoundingSphere();
    return m;
  }

  // ---------- breakable props ----------
  // Bosses can smash pillars, rocks, crystals and trees. A broken one sinks into rubble (no collision)
  // and grows back after a while. Every prop vertex carries its obstacle index and base point; a uniform
  // array of per-obstacle heights squashes them in the vertex shader, so the merged meshes stay one draw each.
  const OBS_MAX = 64, RUBBLE = 0.14, REGROW = 25;
  W.REGROW = REGROW;
  W.obsU = { uObs: { value: new Float32Array(OBS_MAX).fill(1) } };
  const OBS_HEAD = `attribute vec2 aOb; attribute vec3 aObC; uniform float uObs[${OBS_MAX}];\n`;
  // aOb.y = 0: squash into a low pile (stumps, bases, stones); aOb.y = 1: vanish (caps, tree crowns)
  const OBS_CODE = `
    if (aOb.x >= 0.0) {
      float obS = uObs[int(aOb.x + 0.5)];
      vec3 obD = transformed - aObC;
      if (aOb.y > 0.5) obD *= clamp((obS - ${RUBBLE.toFixed(2)}) / ${(1 - RUBBLE).toFixed(2)}, 0.0, 1.0);
      else { obD.y *= obS; obD.xz *= mix(0.8, 1.0, obS); }
      transformed = aObC + obD;
    }`;
  function obsPatch(sh) {
    sh.uniforms.uObs = W.obsU.uObs;
    sh.vertexShader = OBS_HEAD + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + OBS_CODE);
  }
  const obsMat = (m) => { m.onBeforeCompile = obsPatch; return m; };
  // shadows are drawn with a separate depth material, which needs the same squash
  const obsDepth = () => obsMat(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }));
  function mergeTagged(list) {
    for (const g of list) {
      const n = g.attributes.position.count, t = g.userData.ob;
      const a = new Float32Array(n * 2), c = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        a[i * 2] = t ? t[0] : -1; a[i * 2 + 1] = t ? t[1] : 0;
        if (t) { c[i * 3] = t[2]; c[i * 3 + 1] = t[3]; c[i * 3 + 2] = t[4]; }
      }
      g.setAttribute('aOb', new THREE.BufferAttribute(a, 2));
      g.setAttribute('aObC', new THREE.BufferAttribute(c, 3));
    }
    return merge(list);
  }
  function canPlace(x, z, r, gap = 2.5) {
    if (Math.hypot(x, z) < 8.5 + r) return false;
    for (const o of W.obstacles) if (U.dist(x, z, o.x, o.z) < o.r + r + gap) return false;
    return true;
  }

  // ---------- island ----------
  function buildIsland(scene) {
    const RINGS = Math.round(70 * W.S), SEG = Math.round(200 * Math.sqrt(W.S));
    const verts = [], cols = [], idx = [];
    const cGrassA = new THREE.Color(0x3a7a58), cGrassB = new THREE.Color(0x62a35c), cGrassC = new THREE.Color(0x9aa64e);
    const cPath = new THREE.Color(0x8c6a52), cStone = new THREE.Color(0x8d8aa6), cRock = new THREE.Color(0x6d6684), cLip = new THREE.Color(0x6b4a3c);
    const pushV = (x, z, f) => {
      const r = Math.hypot(x, z);
      let h = rawHeight(x, z) - U.smoothstep(0.9, 1, f) * 1.4;
      verts.push(x, h, z);
      const n1 = N.fbm(x * 0.06, z * 0.06, 3), n2 = N.simplex2(x * 0.3, z * 0.3);
      tmpC.copy(cGrassA).lerp(cGrassB, U.clamp(0.5 + n1 * 0.9, 0, 1));
      tmpC.lerp(cGrassC, U.clamp(n2 * 0.6 - 0.1, 0, 0.5));
      tmpC.lerp(cPath, pathMask(x, z) * 0.85);
      if (r < 6.2) tmpC.lerp(cStone, U.smoothstep(6.2, 5.6, r));
      tmpC.lerp(cRock, U.smoothstep(W.ARENA_R + 1, W.ARENA_R + 6, r) * U.clamp(0.5 + n2, 0.3, 1));
      tmpC.lerp(cLip, U.smoothstep(0.93, 1, f));
      cols.push(tmpC.r, tmpC.g, tmpC.b);
    };
    pushV(0, 0, 0);
    for (let i = 1; i <= RINGS; i++) {
      const f = i / RINGS;
      for (let j = 0; j < SEG; j++) {
        const th = (j / SEG) * U.TAU, R = edgeR(th) * f;
        pushV(Math.cos(th) * R, Math.sin(th) * R, f);
      }
    }
    for (let j = 0; j < SEG; j++) idx.push(0, 1 + ((j + 1) % SEG), 1 + j);
    for (let i = 1; i < RINGS; i++) {
      const a0 = 1 + (i - 1) * SEG, b0 = 1 + i * SEG;
      for (let j = 0; j < SEG; j++) {
        const j1 = (j + 1) % SEG;
        idx.push(a0 + j, a0 + j1, b0 + j, a0 + j1, b0 + j1, b0 + j);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const top = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0 }));
    top.receiveShadow = true;
    scene.add(top);

    // underside (rocky cone)
    const K = 16, S2 = 90, uv = [], uc = [], ui = [];
    const cTopU = new THREE.Color(0x5a3d33), cMidU = new THREE.Color(0x433857), cLowU = new THREE.Color(0x1e1a30);
    for (let k = 0; k <= K; k++) {
      const f = k / K;
      for (let j = 0; j < S2; j++) {
        const th = (j / S2) * U.TAU;
        const er = edgeR(th);
        const depth = 34 + N.simplex2(Math.cos(th) * 2, Math.sin(th) * 2) * 7;
        let r = er * (1 - Math.pow(f, 1.25)) * (k === 0 ? 1 : 0.98);
        r += k > 0 && k < K ? N.simplex2(th * 3.1 + k * 0.6, k * 0.45) * 2.6 : 0;
        const y = (k === 0 ? rawHeight(Math.cos(th) * er, Math.sin(th) * er) - 1.4 : -Math.pow(f, 0.9) * depth);
        uv.push(Math.cos(th) * Math.max(r, 0.2), y, Math.sin(th) * Math.max(r, 0.2));
        const strata = 0.5 + 0.5 * Math.sin(y * 1.4 + N.simplex2(th * 4, k) * 2);
        tmpC.copy(cTopU).lerp(cMidU, U.smoothstep(0.02, 0.3, f)).lerp(cLowU, U.smoothstep(0.35, 1, f));
        tmpC.multiplyScalar(0.85 + strata * 0.3);
        uc.push(tmpC.r, tmpC.g, tmpC.b);
      }
    }
    for (let k = 0; k < K; k++) {
      for (let j = 0; j < S2; j++) {
        const a = k * S2 + j, b = k * S2 + ((j + 1) % S2), c = (k + 1) * S2 + j, d = (k + 1) * S2 + ((j + 1) % S2);
        ui.push(a, c, b, b, c, d);
      }
    }
    const ug = new THREE.BufferGeometry();
    ug.setAttribute('position', new THREE.Float32BufferAttribute(uv, 3));
    ug.setAttribute('color', new THREE.Float32BufferAttribute(uc, 3));
    ug.setIndex(ui);
    ug.computeVertexNormals();
    const under = new THREE.Mesh(ug, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true, side: THREE.DoubleSide }));
    under.receiveShadow = true;
    scene.add(under);
  }

  // ---------- props ----------
  const rockMat = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });

  function buildProps(scene) {
    const rnd = U.mulberry32(7);
    const rocks = [], stone = [], runes = [], trees = [], cyanC = [], violetC = [];
    // the obstacle record comes first so every part of a prop can be tagged with its index
    const addOb = (x, z, r, kind, col, breakable = true) => {
      const o = { x, z, r, y: W.heightAt(x, z), kind, col, i: W.obstacles.length, breakable, off: false, s: 1, goal: 1, t: 0 };
      W.obstacles.push(o);
      return o;
    };
    const tag = (g, o, vanish) => { g.userData.ob = [o.i, vanish ? 1 : 0, o.x, o.y, o.z]; return g; };
    // a wider co-op island gets more cover, about as dense as the solo one (within the shader's 64 slots)
    const S = W.S, more = Math.min(S * S, 1.75), RIM = Math.round(64 * S);

    // rim rocks
    for (let i = 0; i < RIM; i++) {
      const th = (i / RIM) * U.TAU + rnd() * 0.08;
      const r = W.ARENA_R + 3 + rnd() * 6;
      const s = 1.5 + rnd() * 2.6;
      const x = Math.cos(th) * r, z = Math.sin(th) * r;
      const g = place(rockGeo(1, rnd() * 50), x, rawHeight(x, z) + s * 0.25, z, rnd() * 0.6, rnd() * 6, rnd() * 0.6, s * (0.8 + rnd() * 0.6), s * (0.7 + rnd() * 0.9), s);
      rocks.push(colorize(g, rnd() < 0.5 ? 0x6c6584 : 0x5d5672, 0.08, 0x4f8a5a));
    }
    // pillars ring
    for (let k = 0; k < 8; k++) {
      const th = k * Math.PI / 4 + Math.PI / 8;
      const x = Math.cos(th) * 21 * S, z = Math.sin(th) * 21 * S, y = W.heightAt(x, z);
      const broken = k % 3 === 1;
      const H = broken ? 2 + rnd() * 1.5 : 4.5 + rnd() * 2.5;
      const o = addOb(x, z, 1.35, 'pillar', 0xa8a4be);
      stone.push(tag(colorize(place(new THREE.BoxGeometry(2.3, 0.7, 2.3), x, y + 0.3, z, 0, th, 0), 0x9a96b0, 0.05, 0x5c8a5c), o));
      stone.push(tag(colorize(place(new THREE.CylinderGeometry(0.72, 0.82, H, 10), x, y + 0.65 + H / 2, z, 0, rnd(), 0), 0xaaa6c0, 0.05, 0x5c8a5c), o));
      if (!broken) stone.push(tag(colorize(place(new THREE.BoxGeometry(2.0, 0.55, 2.0), x, y + 0.65 + H + 0.27, z, 0, th, 0), 0x9a96b0, 0.05), o, true));
      else {
        const fx = x + Math.cos(th + 1.2) * 2.4, fz = z + Math.sin(th + 1.2) * 2.4;
        const of = addOb(fx, fz, 1.1, 'column', 0xa29eb8);
        stone.push(tag(colorize(place(new THREE.CylinderGeometry(0.72, 0.72, 2.2, 10), fx, W.heightAt(fx, fz) + 0.6, fz, 0, th, Math.PI / 2), 0xa29eb8, 0.05, 0x5c8a5c), of));
      }
      runes.push(tag(place(new THREE.TorusGeometry(0.86, 0.06, 6, 28), x, y + 1.7, z, Math.PI / 2, 0, 0), o));
    }
    // crystal clusters
    for (let n = 0, tries = 0, want = Math.round(7 * more); n < want && tries < 400 * more; tries++) {
      const th = rnd() * U.TAU, r = 10 + rnd() * (W.ARENA_R - 14);
      const x = Math.cos(th) * r, z = Math.sin(th) * r;
      if (!canPlace(x, z, 1.7, 3.5) || pathMask(x, z) > 0.2) continue;
      n++;
      const y = W.heightAt(x, z), list = n % 2 ? cyanC : violetC;
      const o = addOb(x, z, 1.7, 'crystal', n % 2 ? 0x7fa8ff : 0xf0b060);
      const cnt = 4 + Math.floor(rnd() * 4);
      for (let i = 0; i < cnt; i++) {
        const a = rnd() * U.TAU, d = i === 0 ? 0 : 0.4 + rnd() * 0.7, h = i === 0 ? 3.2 : 1.2 + rnd() * 1.8;
        const g = new THREE.OctahedronGeometry(1, 0);
        list.push(tag(place(g, x + Math.cos(a) * d, y + h * 0.42, z + Math.sin(a) * d, Math.cos(a) * d * 0.5, rnd() * 3, Math.sin(a) * d * 0.5, 0.42, h, 0.42), o));
      }
      rocks.push(tag(colorize(place(rockGeo(1, rnd() * 50), x, y, z, 0, rnd() * 6, 0, 1.7, 0.6, 1.7), 0x4d4766, 0.08), o));
    }
    // boulders
    for (let n = 0, tries = 0, want = Math.round(9 * more); n < want && tries < 400 * more; tries++) {
      const th = rnd() * U.TAU, r = 10 + rnd() * (W.ARENA_R - 13);
      const x = Math.cos(th) * r, z = Math.sin(th) * r, s = 1.1 + rnd() * 1.3;
      if (!canPlace(x, z, s, 3) || pathMask(x, z) > 0.3) continue;
      n++;
      const o = addOb(x, z, s * 0.95, 'boulder', 0x77708e);
      rocks.push(tag(colorize(place(rockGeo(1, rnd() * 50), x, W.heightAt(x, z) + s * 0.3, z, rnd() * 0.5, rnd() * 6, rnd() * 0.5, s * 1.1, s, s), 0x77708e, 0.08, 0x5a9a5e), o));
    }
    // trees
    for (let n = 0, tries = 0, want = Math.round(11 * more); n < want && tries < 500 * more && W.obstacles.length < OBS_MAX - 4; tries++) {
      const th = rnd() * U.TAU, r = 11 + rnd() * (W.ARENA_R - 12);
      const x = Math.cos(th) * r, z = Math.sin(th) * r;
      if (!canPlace(x, z, 0.8, 3.2) || pathMask(x, z) > 0.2) continue;
      n++;
      const y = W.heightAt(x, z), lean = (rnd() - 0.5) * 0.15, pink = rnd() < 0.6;
      const o = addOb(x, z, 0.85, 'tree', pink ? 0xd8679a : 0x2f7a6a);
      // the trunk is left as a stump; the crown disappears
      trees.push(tag(colorize(place(new THREE.CylinderGeometry(0.2, 0.42, 3.2, 7), x, y + 1.5, z, lean, 0, lean), 0x5b3a2e, 0.1), o));
      if (pink) {
        const cols = [0xd8679a, 0xb84f9c, 0xf08ab0];
        for (let i = 0; i < 3; i++) {
          const s = 1.7 - i * 0.3, ox = (rnd() - 0.5) * 0.8, oz = (rnd() - 0.5) * 0.8;
          trees.push(tag(colorize(place(rockGeo(1, rnd() * 50), x + ox, y + 3.5 + i * 0.95, z + oz, rnd(), rnd() * 6, rnd(), s, s * 0.8, s), cols[i], 0.12), o, true));
        }
      } else {
        for (let i = 0; i < 3; i++) {
          const s = 1.9 - i * 0.45;
          trees.push(tag(colorize(place(new THREE.ConeGeometry(s, 2.2, 7), x, y + 3.0 + i * 1.15, z, 0, rnd() * 3, 0), i === 2 ? 0x5fb894 : 0x2f7a6a, 0.12), o, true));
        }
      }
    }

    // altar
    stone.push(colorize(place(new THREE.CylinderGeometry(5.2, 5.7, 0.55, 48), 0, 0.12, 0), 0x9b98b4, 0.03));
    stone.push(colorize(place(new THREE.CylinderGeometry(4.1, 4.1, 0.58, 48), 0, 0.13, 0), 0x7c7898, 0.02));
    for (let k = 0; k < 4; k++) {
      const th = Math.PI / 4 + (k * Math.PI) / 2, x = Math.cos(th) * 6.1, z = Math.sin(th) * 6.1;
      stone.push(colorize(place(new THREE.BoxGeometry(0.7, 2.4, 0.7), x, 1.2, z, 0, th, 0), 0x9a96b0, 0.05, 0x5c8a5c));
      cyanC.push(place(new THREE.OctahedronGeometry(0.42, 0), x, 2.9, z, 0, 0, 0, 1, 1.6, 1));
      addOb(x, z, 0.6, 'altar', 0x9a96b0, false); // the altar's posts never break
    }

    // meshes
    const rockMesh = new THREE.Mesh(mergeTagged(rocks), obsMat(rockMat()));
    const stoneMesh = new THREE.Mesh(mergeTagged(stone), obsMat(rockMat()));
    for (const m of [rockMesh, stoneMesh]) { m.castShadow = true; m.receiveShadow = true; m.customDepthMaterial = obsDepth(); scene.add(m); }

    const treeMat = rockMat();
    W.windU = { uTime: { value: 0 } };
    treeMat.onBeforeCompile = (sh) => {
      obsPatch(sh);
      sh.uniforms.uTime = W.windU.uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        `#include <begin_vertex>
         float wk = max(0.0, transformed.y - 2.4);
         transformed.x += sin(uTime * 1.4 + transformed.x * 0.2 + transformed.z * 0.15) * 0.06 * wk;
         transformed.z += cos(uTime * 1.1 + transformed.x * 0.17) * 0.05 * wk;`);
    };
    const treeMesh = new THREE.Mesh(mergeTagged(trees), treeMat);
    treeMesh.castShadow = true; treeMesh.receiveShadow = true;
    treeMesh.customDepthMaterial = obsDepth();
    scene.add(treeMesh);

    W.crystalMats = [];
    const mk = (list, color) => {
      const geos = list.map((g) => colorize(g, 0xffffff, 0));
      const mat = obsMat(new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.6, roughness: 0.25, metalness: 0.1, flatShading: true }));
      const m = new THREE.Mesh(mergeTagged(geos), mat);
      m.castShadow = true;
      m.customDepthMaterial = obsDepth();
      scene.add(m);
      W.crystalMats.push(mat);
    };
    mk(cyanC, 0x4f7fe8);
    mk(violetC, 0xe89a38);
    const runeMesh = new THREE.Mesh(mergeTagged(runes.map((g) => colorize(g, 0xffffff, 0))), obsMat(new THREE.MeshBasicMaterial({ color: U.hdr(0xffcf7a, 1.7) })));
    scene.add(runeMesh);
  }

  // ---------- things that never change size: the altar's glow, the central shard, the sky ----------
  function buildStatic(scene) {
    W.altarRingMat = new THREE.MeshBasicMaterial({ color: U.hdr(0xffcf7a, 1.2), transparent: true, opacity: 0.9 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4.55, 0.09, 8, 80), W.altarRingMat);
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.45;
    scene.add(ring);
    const shardMat = new THREE.MeshStandardMaterial({ color: 0xc8dcff, emissive: 0x5f8fff, emissiveIntensity: 1.1, roughness: 0.15, flatShading: true });
    W.shard = new THREE.Group();
    const big = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), shardMat);
    big.scale.set(1.1, 2.6, 1.1); big.castShadow = true;
    W.shard.add(big);
    W.shardMinis = [];
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), shardMat);
      m.scale.y = 1.8;
      W.shard.add(m); W.shardMinis.push(m);
    }
    W.shard.position.set(0, 5.4, 0);
    scene.add(W.shard);
    W.shardLight = new THREE.PointLight(0xa9c4ff, 40, 22, 2);
    W.shardLight.position.set(0, 4, 0);
    scene.add(W.shardLight);
    buildAmbience(scene);
  }

  // ---------- grass & flowers ----------
  function buildGrass(scene, count) {
    const segs = 4, pos = [], col = [], nor = [], ind = [];
    const cb = new THREE.Color(0x1f4a35), ct = new THREE.Color(0x8cc276);
    for (let i = 0; i <= segs; i++) {
      const t = i / segs, w = 0.075 * (1 - t * 0.85);
      tmpC.copy(cb).lerp(ct, t);
      pos.push(-w, t, 0, w, t, 0);
      col.push(tmpC.r, tmpC.g, tmpC.b, tmpC.r, tmpC.g, tmpC.b);
      nor.push(0, 1, 0, 0, 1, 0);
      if (i < segs) { const a = i * 2; ind.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setIndex(ind);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.9 });
    W.grassU = { uTime: { value: 0 }, uPlayer: { value: new THREE.Vector3(0, -99, 0) } };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = W.grassU.uTime;
      sh.uniforms.uPlayer = W.grassU.uPlayer;
      sh.vertexShader = 'uniform float uTime;\nuniform vec3 uPlayer;\n' + sh.vertexShader.replace('#include <project_vertex>', `
        vec4 mvPosition = instanceMatrix * vec4(transformed, 1.0);
        vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        float bend = position.y * position.y;
        float wind = sin(uTime * 1.7 + ip.x * 0.32 + ip.z * 0.21) * 0.6 + sin(uTime * 3.3 + ip.x * 0.9 - ip.z * 0.4) * 0.25;
        mvPosition.x += (wind * 0.22 + 0.12) * bend;
        mvPosition.z += wind * 0.1 * bend;
        vec2 tp = ip.xz - uPlayer.xz;
        float pd = length(tp);
        float push = smoothstep(1.9, 0.2, pd);
        mvPosition.xz += (pd > 0.001 ? tp / pd : vec2(0.0)) * push * 0.55 * bend;
        mvPosition.y -= push * 0.3 * bend;
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>',
        '#include <normal_fragment_begin>\n normal = normalize(vNormal);');
    };
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    let n = 0, guard = 0;
    const c = new THREE.Color();
    while (n < count && guard++ < count * 6) {
      const th = Math.random() * U.TAU, r = Math.sqrt(Math.random()) * (W.ARENA_R + 6 * W.S);
      const x = Math.cos(th) * r, z = Math.sin(th) * r;
      if (r < 6.3 || pathMask(x, z) > 0.35) continue;
      let blocked = false;
      for (const o of W.obstacles) if (U.dist2(x, z, o.x, o.z) < (o.r + 0.2) * (o.r + 0.2)) { blocked = true; break; }
      if (blocked) continue;
      const s = 0.35 + Math.random() * 0.5 + Math.max(0, N.simplex2(x * 0.1, z * 0.1)) * 0.4;
      tmpE.set(0, Math.random() * Math.PI, 0); tmpQ.setFromEuler(tmpE);
      tmpM.compose(tmpP.set(x, W.heightAt(x, z) - 0.02, z), tmpQ, tmpS.set(1, s, 1));
      mesh.setMatrixAt(n, tmpM);
      const v = 0.8 + Math.random() * 0.4;
      c.setRGB(v, v * (0.95 + Math.random() * 0.1), v * (0.85 + Math.random() * 0.2));
      mesh.setColorAt(n, c);
      n++;
    }
    mesh.count = n;
    scene.add(mesh);

    // glowing flowers
    const fc = Math.floor(count / 50);
    const flowers = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.09, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), fc);
    flowers.frustumCulled = false;
    const fcols = [U.hdr(0xff9a8a, 1.8), U.hdr(0x9fbdf5, 1.8), U.hdr(0xffe27a, 1.8)];
    let m2 = 0; guard = 0;
    while (m2 < fc && guard++ < fc * 20) {
      const th = Math.random() * U.TAU, r = 7 + Math.random() * (W.ARENA_R - 6);
      const x = Math.cos(th) * r, z = Math.sin(th) * r;
      if (pathMask(x, z) > 0.2) continue;
      tmpM.makeTranslation(x, W.heightAt(x, z) + 0.35 + Math.random() * 0.2, z);
      flowers.setMatrixAt(m2, tmpM);
      flowers.setColorAt(m2, fcols[m2 % 3]);
      m2++;
    }
    flowers.count = m2;
    scene.add(flowers);
  }

  // ---------- ambience: floating rocks, distant islands, fireflies ----------
  function buildAmbience(scene) {
    const FR = 34;
    W.floaters = [];
    const fgeo = colorize(rockGeo(1, 3), 0x5f5878, 0.1, 0x4f8a5a);
    W.floatMesh = new THREE.InstancedMesh(fgeo, rockMat(), FR);
    W.floatMesh.frustumCulled = false;
    for (let i = 0; i < FR; i++) {
      W.floaters.push({ a: Math.random() * U.TAU, r: 54 + Math.random() * 40, y: -16 + Math.random() * 26, s: 0.7 + Math.random() * 2.6,
        sp: (0.01 + Math.random() * 0.025) * (Math.random() < 0.5 ? -1 : 1), ph: Math.random() * 10, rot: Math.random() * 6 });
    }
    scene.add(W.floatMesh);

    for (let i = 0; i < 6; i++) {
      const th = (i / 6) * U.TAU + Math.random() * 0.5, dist = 170 + Math.random() * 160;
      const rad = 10 + Math.random() * 18, x = Math.cos(th) * dist, z = Math.sin(th) * dist, y = -20 + Math.random() * 45;
      const topG = colorize(place(new THREE.CylinderGeometry(rad, rad * 0.9, 2, 14), 0, 0, 0), 0x3f7a5c, 0.1);
      const botG = colorize(place(rockGeo(1, i * 7), 0, -rad * 0.9, 0, Math.PI, 0, 0, rad * 0.95, rad * 1.4, rad * 0.95), 0x3a3150, 0.1);
      const parts = [topG, botG];
      for (let t = 0; t < 4; t++) {
        const a = Math.random() * U.TAU, d = Math.random() * rad * 0.6;
        parts.push(colorize(place(new THREE.ConeGeometry(2.2, 6, 6), Math.cos(a) * d, 4, Math.sin(a) * d), 0x2f6a5a, 0.1));
      }
      const m = new THREE.Mesh(merge(parts), rockMat());
      m.position.set(x, y, z);
      m.rotation.y = Math.random() * 6;
      scene.add(m);
    }

    // fireflies (GPU animated): one material for good, the swarm itself follows the island's size
    W.ffU = { uTime: { value: 0 }, uScale: { value: 600 } };
    W.ffMat = new THREE.ShaderMaterial({
      uniforms: W.ffU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute vec3 aSeed; uniform float uTime; uniform float uScale; varying float vA; varying vec3 vC;
        void main() {
          vec3 p = position; float t = uTime * (0.25 + aSeed.x * 0.35);
          p.x += sin(t + aSeed.y * 6.28) * 1.6; p.z += cos(t * 0.8 + aSeed.z * 6.28) * 1.6; p.y += sin(t * 1.3 + aSeed.x * 10.0) * 0.7;
          vA = 0.5 + 0.5 * sin(uTime * (1.5 + aSeed.z * 2.0) + aSeed.y * 20.0);
          vC = mix(vec3(1.0, 0.85, 0.4), vec3(0.4, 1.0, 0.9), step(0.6, aSeed.z));
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = (0.16 + 0.12 * vA) * uScale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `varying float vA; varying vec3 vC;
        void main() { float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vC * (1.5 + vA * 2.5), a * a * (0.3 + vA * 0.7)); }`,
    });
    W.ffMat.userData.keep = true;
    const upd = () => {
      const h = G.Render.renderer.getDrawingBufferSize(new THREE.Vector2()).y;
      W.ffU.uScale.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(G.Render.camera.fov) / 2));
    };
    upd();
    G.Events.on('resize', upd);
  }
  function buildFireflies(scene) {
    const FF = Math.round(260 * W.S * W.S), p = new Float32Array(FF * 3), sd = new Float32Array(FF * 3);
    for (let i = 0; i < FF; i++) {
      const th = Math.random() * U.TAU, r = Math.sqrt(Math.random()) * (W.ARENA_R + 4);
      p[i * 3] = Math.cos(th) * r; p[i * 3 + 1] = 0.6 + Math.random() * 4; p[i * 3 + 2] = Math.sin(th) * r;
      sd[i * 3] = Math.random(); sd[i * 3 + 1] = Math.random(); sd[i * 3 + 2] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 3));
    const pts = new THREE.Points(g, W.ffMat);
    pts.frustumCulled = false;
    scene.add(pts);
  }

  // ---------- public ----------
  W.build = function (scene) {
    W.scene = scene;
    buildStatic(scene);
    W.setScale(1, true);
  };
  function disposeTree(root) {
    root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      for (const m of [].concat(o.material || [], o.customDepthMaterial || [])) if (!m.userData.keep) m.dispose();
      if (o.isInstancedMesh) o.dispose();
    });
  }
  // (Re)builds the island, its props, grass and fireflies for a width scale. The same scale always
  // builds the same props in the same order, so co-op machines agree on every obstacle index.
  W.setScale = function (S, force) {
    S = U.clamp(+S || 1, 1, 2);
    if (!force && Math.abs(S - W.S) < 0.001) return false;
    W.S = S;
    W.ARENA_R = BASE_R * S;
    if (W.root) { W.scene.remove(W.root); disposeTree(W.root); }
    W.root = new THREE.Group();
    W.scene.add(W.root);
    W.obstacles = [];
    W.obsU.uObs.value.fill(1);
    N.seed(1337);
    HF_HALF = Math.ceil(56 * S);
    HF_RES = Math.round((HF_HALF * 2) / HF_STEP) + 1;
    hf = new Float32Array(HF_RES * HF_RES);
    for (let iz = 0; iz < HF_RES; iz++)
      for (let ix = 0; ix < HF_RES; ix++) hf[iz * HF_RES + ix] = rawHeight(-HF_HALF + ix * HF_STEP, -HF_HALF + iz * HF_STEP);
    buildIsland(W.root);
    buildProps(W.root);
    buildGrass(W.root, Math.round(G.Render.Q.grass * Math.min(S * S, 1.8)));
    buildFireflies(W.root);
    W.toldBreak = false;
    W.syncKey = '';
    if (G.Enemies && G.Enemies.obstaclesChanged) G.Enemies.obstaclesChanged();
    return true;
  };

  W.resolve = function (o, radius) {
    let hit = false;
    for (let i = 0; i < W.obstacles.length; i++) {
      const ob = W.obstacles[i];
      if (ob.off) continue;
      const dx = o.x - ob.x, dz = o.z - ob.z, rr = ob.r + radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr) {
        const d = Math.sqrt(d2) || 0.001;
        o.x = ob.x + (dx / d) * rr; o.z = ob.z + (dz / d) * rr;
        hit = true;
      }
    }
    const r = Math.hypot(o.x, o.z), lim = W.ARENA_R - radius;
    if (r > lim) { o.x *= lim / r; o.z *= lim / r; hit = true; }
    return hit;
  };
  W.hitObstacle = function (x, z, r) {
    for (let i = 0; i < W.obstacles.length; i++) {
      const ob = W.obstacles[i], rr = ob.r + r;
      if (!ob.off && U.dist2(x, z, ob.x, ob.z) < rr * rr) return ob;
    }
    return null;
  };

  // ---------- breaking and regrowth ----------
  // host only: smash every standing breakable prop touching the circle (kinds: optional list)
  W.breakAt = function (x, z, r, kinds) {
    if (!G.auth()) return 0;
    let n = 0;
    for (const o of W.obstacles) {
      if (!o.breakable || o.off || (kinds && !kinds.includes(o.kind))) continue;
      const rr = o.r + r;
      if (U.dist2(x, z, o.x, o.z) >= rr * rr) continue;
      G.Net.vis('obBreak', o.i);
      n++;
    }
    if (n && !W.toldBreak) { W.toldBreak = true; G.Net.vis('toast', '부서진 지형은 ' + REGROW + '초 뒤 다시 솟아납니다', ''); }
    return n;
  };
  // every machine: the prop drops to rubble and stops blocking
  W.applyBreak = function (i) {
    const o = W.obstacles[i];
    if (!o || !o.breakable || o.off) return;
    o.off = true; o.goal = RUBBLE; o.t = REGROW;
    G.Enemies.obstaclesChanged();
    const y = o.y, P = G.Player;
    G.FX.gibs(o.x, y + 1.2, o.z, o.col, 16, o.kind === 'tree' ? 0.3 : 0.42, 9);
    G.FX.smoke(o.x, y + 0.6, o.z, 12, 0x5a5262, 2.6, 3.5);
    G.FX.ring(o.x, y + 0.2, o.z, 0.5, o.r + 2.2, 0.4, 0xd8c8a8, 1.6);
    if (o.kind === 'crystal') G.FX.burst(o.x, y + 1.5, o.z, { count: 34, color: o.col, intensity: 2.6, speed: [4, 11], life: [0.4, 0.8], size: [0.5, 0.05], drag: 2 });
    if (o.kind === 'tree') G.FX.burst(o.x, y + 3.5, o.z, { count: 26, color: o.col, intensity: 1.4, speed: [2, 6], life: [0.6, 1.2], size: [0.45, 0.1], grav: 4, drag: 1.5, jitter: 1.2 });
    G.Audio.play('slam');
    if (P) G.Render.shake(0.22 * U.clamp(1.2 - U.dist(o.x, o.z, P.x, P.z) / 24, 0, 1));
  };
  // every machine: the prop rises again and blocks
  W.applyGrow = function (i) {
    const o = W.obstacles[i];
    if (!o || !o.off) return;
    o.off = false; o.goal = 1; o.t = 0;
    G.Enemies.obstaclesChanged();
    G.FX.ring(o.x, o.y + 0.2, o.z, o.r + 1.6, 0.4, 0.6, 0x9fe8b8, 2);
    G.FX.burst(o.x, o.y + 0.4, o.z, { count: 22, color: 0x9fe8b8, intensity: 2, spread: 'up', speed: [1.5, 4.5], life: [0.5, 1], size: [0.35, 0.03], jitter: o.r });
    G.Audio.play('portal');
  };
  // nobody may be standing inside a prop when it comes back
  function clearOf(o) {
    for (const h of G.Heroes.list) if (h.alive && U.dist(h.x, h.z, o.x, o.z) < o.r + 0.9) return false;
    for (const t of G.Bosses.targets) if (t.alive && U.dist(t.x, t.z, o.x, o.z) < o.r + t.r + 0.3) return false;
    return true;
  }
  W.resetObstacles = function () {
    const u = W.obsU.uObs.value;
    for (const o of W.obstacles) { o.off = false; o.goal = 1; o.s = 1; o.t = 0; u[o.i] = 1; }
    W.toldBreak = false;
    W.syncKey = '';
    G.Enemies.obstaclesChanged();
  };
  // co-op: the host lists what is broken, clients line up with it (covers any missed event)
  W.brokenCode = function () {
    let s = '';
    for (const o of W.obstacles) if (o.off) s += U.enc(o.i, 1);
    return s;
  };
  W.syncBroken = function (code) {
    if (typeof code !== 'string' || code === W.syncKey || code.length > OBS_MAX || !/^[A-Za-z0-9_-]*$/.test(code)) return;
    W.syncKey = code;
    const set = new Set();
    for (let k = 0; k < code.length; k++) set.add(U.dec(code, k, 1));
    for (const o of W.obstacles) {
      if (!o.breakable) continue;
      if (set.has(o.i) && !o.off) W.applyBreak(o.i);
      else if (!set.has(o.i) && o.off) W.applyGrow(o.i);
    }
  };
  function updateObstacles(dt) {
    const u = W.obsU.uObs.value, auth = G.auth();
    for (const o of W.obstacles) {
      if (!o.breakable) continue;
      if (o.s !== o.goal) {
        // a fast collapse, a slower climb back up
        o.s = Math.abs(o.goal - o.s) < 0.004 ? o.goal : U.damp(o.s, o.goal, o.goal < o.s ? 16 : 3.2, dt);
        u[o.i] = o.s;
        if (o.goal === 1 && Math.random() < 0.6) {
          const a = Math.random() * U.TAU, rr = o.r * Math.sqrt(Math.random());
          G.FX.P.emit(o.x + Math.cos(a) * rr, o.y + 0.2, o.z + Math.sin(a) * rr, 0, U.rand(1.5, 3.5), 0, 0.6, 0.4, 0.03, 0.9, 2.6, 1.6, 1, 0.5, 0);
        }
      }
      if (auth && o.off) {
        o.t -= dt;
        if (o.t <= 0) { if (clearOf(o)) G.Net.vis('obGrow', o.i); else o.t = 0.5; }
      }
    }
  }
  W.isFree = function (x, z, r) {
    return Math.hypot(x, z) < W.ARENA_R - r && !W.hitObstacle(x, z, r);
  };
  W.spawnPoint = function (px, pz, minDist = 14) {
    for (let t = 0; t < 40; t++) {
      const th = Math.random() * U.TAU, r = W.ARENA_R - 1.5 - Math.random() * 6;
      const x = Math.cos(th) * r, z = Math.sin(th) * r;
      if (U.dist(x, z, px, pz) >= minDist && W.isFree(x, z, 1.2)) return { x, z };
    }
    const th = Math.atan2(-pz, -px);
    return { x: Math.cos(th) * (W.ARENA_R - 3), z: Math.sin(th) * (W.ARENA_R - 3) };
  };
  W.randomOpenPoint = function (minR, maxR, clear = 1) {
    for (let t = 0; t < 60; t++) {
      const th = Math.random() * U.TAU, r = minR + Math.random() * (maxR - minR);
      const x = Math.cos(th) * r, z = Math.sin(th) * r;
      if (W.isFree(x, z, clear)) return { x, z };
    }
    return { x: 0, z: 0 };
  };

  let altarGlow = 0;
  W.setAltarActive = function (on) { W.altarActive = on; };

  W.update = function (dt, t, px, pz) {
    updateObstacles(dt);
    W.grassU.uTime.value = t;
    W.grassU.uPlayer.value.set(px, 0, pz);
    W.windU.uTime.value = t;
    W.ffU.uTime.value = t;
    const pulse = 1.5 + Math.sin(t * 2.2) * 0.35;
    for (const m of W.crystalMats) m.emissiveIntensity = pulse;
    altarGlow = U.damp(altarGlow, W.altarActive ? 1 : 0, 3, dt);
    W.altarRingMat.color.setRGB(1, 0.8, 0.45).multiplyScalar(0.6 + altarGlow * (1.8 + Math.sin(t * 5) * 0.8));
    W.shardLight.intensity = 16 + altarGlow * 34 + Math.sin(t * 3) * 4;
    W.shard.rotation.y += dt * 0.6;
    W.shard.position.y = 5.4 + Math.sin(t * 1.3) * 0.35;
    W.shardMinis.forEach((m, i) => {
      const a = t * 1.2 + (i * U.TAU) / 3;
      m.position.set(Math.cos(a) * 2.2, Math.sin(t * 2 + i) * 0.6, Math.sin(a) * 2.2);
      m.rotation.y = -a;
    });
    for (let i = 0; i < W.floaters.length; i++) {
      const f = W.floaters[i];
      f.a += f.sp * dt;
      tmpE.set(f.rot + t * 0.05, f.rot, 0); tmpQ.setFromEuler(tmpE);
      const fr = f.r + (W.S - 1) * 50; // stay outside a widened island
      tmpM.compose(tmpP.set(Math.cos(f.a) * fr, f.y + Math.sin(t * 0.5 + f.ph) * 1.2, Math.sin(f.a) * fr), tmpQ, tmpS.set(f.s, f.s, f.s));
      W.floatMesh.setMatrixAt(i, tmpM);
    }
    W.floatMesh.instanceMatrix.needsUpdate = true;
  };
})();

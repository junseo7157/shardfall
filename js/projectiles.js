// ============================================================
// SHARDFALL - projectiles (hero bolts, enemy orbs, boulders) and enemy attack patterns.
// Patterns run on every machine from one mirrored message; only the host applies damage.
// ============================================================
(() => {
  const G = window.G, U = G.U;
  const TAU = Math.PI * 2;
  const PR = (G.Proj = { player: [], enemy: [], boulders: [] });
  const MAXP = 600, MAXE = 700, MAXB = 40;
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3();
  const tmpC = new THREE.Color(), WHITE = new THREE.Color(1, 1, 1);
  let meshP, meshE, meshEcore, meshB, scene;
  let ringGeo, wallGeo, laserGeo;
  // burning ground strips (dragon fire trails), all drawn in one instanced mesh.
  // Noise runs in world space so neighbouring pieces read as one ragged, flickering band;
  // each piece fades out over its overlapping ends so the joins don't show.
  const FIRE_MAX = 600;
  let fireMesh = null, fireN = 0;
  const FIRE_VERT = `varying vec2 vUv; varying vec3 vCol; varying vec2 vW;
    void main() {
      vUv = uv;
      vCol = instanceColor;
      vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
      vW = wp.xz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`;
  const FIRE_FRAG = `uniform float uTime; varying vec2 vUv; varying vec3 vCol; varying vec2 vW;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    void main() {
      float across = abs(vUv.x - 0.5) * 2.0;
      float n = noise(vW * 1.4 + vec2(0.0, -uTime * 2.4)) * 0.6 + noise(vW * 3.3 + vec2(uTime * 1.6, uTime * 0.7)) * 0.4;
      float edge = 1.0 - smoothstep(0.3 + n * 0.4, 1.0, across);
      float ends = clamp(vUv.y / 0.107, 0.0, 1.0) * clamp((1.0 - vUv.y) / 0.107, 0.0, 1.0);
      float core = (1.0 - smoothstep(0.0, 0.5, across)) * smoothstep(0.35, 0.9, n);
      vec3 col = vCol * (0.45 + n * 1.0) + vec3(1.0, 0.8, 0.45) * core * min(1.0, length(vCol)) * 0.9;
      float a = clamp(edge * ends * (0.45 + n * 0.55), 0.0, 1.0);
      gl_FragColor = vec4(col, a);
    }`;

  PR.init = function (sc) {
    scene = sc;
    meshP = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0).scale(0.17, 0.17, 0.7), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAXP);
    const eg = new THREE.IcosahedronGeometry(1, 1);
    meshE = new THREE.InstancedMesh(eg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false }), MAXE);
    meshEcore = new THREE.InstancedMesh(eg, new THREE.MeshBasicMaterial({ color: 0xffffff }), MAXE);
    meshB = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x6d5f6a, roughness: 0.9, flatShading: true, emissive: 0x401810, emissiveIntensity: 0.6 }), MAXB);
    meshB.castShadow = true;
    for (const m of [meshP, meshE, meshEcore, meshB]) {
      m.frustumCulled = false;
      for (let i = 0; i < m.count; i++) m.setColorAt(i, tmpC.set(0xffffff));
      m.count = 0;
      scene.add(m);
    }
    meshE.renderOrder = 3;
    ringGeo = new THREE.RingGeometry(0.9, 1, 160).rotateX(-Math.PI / 2);
    wallGeo = new THREE.CylinderGeometry(1, 1, 1, 160, 1, true).translate(0, 0.5, 0);
    laserGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, -0.5);
    fireMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } }, vertexShader: FIRE_VERT, fragmentShader: FIRE_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }), FIRE_MAX);
    fireMesh.frustumCulled = false;
    fireMesh.renderOrder = 4;
    for (let i = 0; i < FIRE_MAX; i++) fireMesh.setColorAt(i, tmpC.set(0xffffff));
    fireMesh.count = 0;
    scene.add(fireMesh);
  };

  // o: x, y, z, angle, speed, life, dmg, size, pierce, ricochet, homing, color, source, procs, by (hero), cos (visual only)
  PR.spawnPlayer = function (o) {
    if (PR.player.length >= MAXP) return;
    PR.player.push({
      x: o.x, y: o.y, z: o.z, vx: Math.cos(o.angle) * o.speed, vz: Math.sin(o.angle) * o.speed, speed: o.speed,
      life: o.life, dmg: o.dmg, size: o.size || 1, pierce: o.pierce || 0, ricochet: o.ricochet || 0, homing: o.homing || 0,
      color: o.color || 0x9fd0ff, source: o.source || 'bolt', procs: !!o.procs, by: o.by || G.Player, cos: !!o.cos, knock: o.knock || 2.2,
      hit: new Set(), target: null, retarget: 0,
    });
  };
  // o: x, z, y, angle, speed, dmg, r, color, life, accel, turn, tg (hero key to home on)
  PR.spawnEnemy = function (o) {
    if (PR.enemy.length >= MAXE) return;
    PR.enemy.push({
      x: o.x, z: o.z, y: o.y != null ? o.y : 1.2, vx: Math.cos(o.angle) * o.speed, vz: Math.sin(o.angle) * o.speed,
      speed: o.speed, dmg: o.dmg, r: o.r || 0.32, color: o.color || 0xff6a4a, life: o.life || 5, accel: o.accel || 0,
      turn: o.turn || 0, tg: o.tg || null, t: 0, cos: !G.auth(),
    });
  };
  // o: sx, sz, sy, tx, tz, du, h, r, d, s
  PR.spawnBoulder = function (o) {
    if (PR.boulders.length >= MAXB) return;
    const tele = G.FX.telegraph({ shape: 'circle', x: o.tx, z: o.tz, r: o.r, dur: o.du, color: 0xff3344 });
    PR.boulders.push({ sx: o.sx, sz: o.sz, sy: o.sy != null ? o.sy : 3, tx: o.tx, tz: o.tz, dur: o.du, height: o.h || 0, r: o.r, dmg: o.d, size: o.s || 1, t: 0, tele, rot: Math.random() * 6, cos: !G.auth(),
      c: o.c || 0, fz: o.fz || 0, fzd: o.fzd || 8, cr: o.cr || 0, ca: o.ca || 0, cd: o.cd || 0 });
  };

  function updatePlayer(dt) {
    const W = G.World, C = G.Combat;
    let n = 0;
    for (let i = PR.player.length - 1; i >= 0; i--) {
      const b = PR.player[i];
      b.life -= dt;
      let dead = b.life <= 0;
      if (!dead && b.homing > 0) {
        b.retarget -= dt;
        if (b.retarget <= 0 || !b.target || !b.target.alive) { b.target = C.nearest(b.x, b.z, 10, b.hit); b.retarget = 0.15; }
        if (b.target && b.target.alive) {
          let ang = Math.atan2(b.vz, b.vx);
          ang += U.clamp(U.angleDiff(ang, Math.atan2(b.target.z - b.z, b.target.x - b.x)), -1, 1) * Math.min(1, b.homing * 6 * dt);
          b.vx = Math.cos(ang) * b.speed; b.vz = Math.sin(ang) * b.speed;
        }
      }
      const steps = Math.max(1, Math.ceil((b.speed * dt) / 0.6));
      for (let s = 0; s < steps && !dead; s++) {
        b.x += (b.vx * dt) / steps; b.z += (b.vz * dt) / steps;
        if (W.hitObstacle(b.x, b.z, 0.05)) { G.FX.spark(b.x, b.y, b.z, b.color, 5, 5); dead = true; break; }
        let hitT = null;
        C.forEachTarget(b.x, b.z, 0.22 * b.size, (t) => { if (!hitT && !b.hit.has(t)) hitT = t; });
        if (!hitT) continue;
        b.hit.add(hitT);
        // a piercing shot can't run down the wyrm's whole body: one hit per boss
        if (hitT.boss) for (const q of hitT.boss.targets) b.hit.add(q);
        if (!b.cos) C.damage(hitT, b.dmg, { kx: b.vx / b.speed, kz: b.vz / b.speed, knock: b.knock, source: b.source, procs: b.procs, by: b.by });
        G.FX.spark(b.x, b.y, b.z, b.color, 4, 6);
        if (b.pierce > 0) b.pierce--;
        else if (b.ricochet > 0) {
          b.ricochet--;
          const nx = C.nearest(b.x, b.z, 11, b.hit);
          if (nx) {
            const a = Math.atan2(nx.z - b.z, nx.x - b.x);
            b.vx = Math.cos(a) * b.speed; b.vz = Math.sin(a) * b.speed;
            b.life = Math.max(b.life, 0.45);
          } else dead = true;
        } else dead = true;
      }
      if (Math.hypot(b.x, b.z) > W.ARENA_R + 8) dead = true;
      if (dead) { PR.player[i] = PR.player[PR.player.length - 1]; PR.player.pop(); continue; }
      G.FX.trail(b.x, b.y, b.z, b.color, 0.3 * b.size, 0.11, 1.7);
      tmpE.set(0, Math.PI / 2 - Math.atan2(b.vz, b.vx), 0); tmpQ.setFromEuler(tmpE);
      tmpM.compose(tmpP.set(b.x, b.y, b.z), tmpQ, tmpS.set(b.size, b.size, b.size * 1.25));
      meshP.setMatrixAt(n, tmpM);
      meshP.setColorAt(n, tmpC.set(b.color).multiplyScalar(3.4));
      n++;
    }
    meshP.count = n;
    meshP.instanceMatrix.needsUpdate = true;
    meshP.instanceColor.needsUpdate = true;
  }

  function updateEnemy(dt) {
    const W = G.World, HS = G.Heroes;
    let n = 0;
    for (let i = PR.enemy.length - 1; i >= 0; i--) {
      const b = PR.enemy[i];
      b.life -= dt; b.t += dt;
      let dead = b.life <= 0;
      if (b.accel) {
        b.speed = Math.max(1, b.speed + b.accel * dt);
        const a = Math.atan2(b.vz, b.vx);
        b.vx = Math.cos(a) * b.speed; b.vz = Math.sin(a) * b.speed;
      }
      if (b.turn && b.t < 2.2) {
        const th = (b.tg && HS.get(b.tg)) || HS.nearest(b.x, b.z);
        if (th && th.alive) {
          let a = Math.atan2(b.vz, b.vx);
          a += U.clamp(U.angleDiff(a, Math.atan2(th.z - b.z, th.x - b.x)), -1, 1) * b.turn * dt;
          b.vx = Math.cos(a) * b.speed; b.vz = Math.sin(a) * b.speed;
        }
      }
      const k = HS.chronoNear(b.x, b.z) ? 0.65 : 1;
      b.x += b.vx * dt * k; b.z += b.vz * dt * k;
      if (!dead && W.hitObstacle(b.x, b.z, b.r * 0.5)) { G.FX.spark(b.x, b.y, b.z, b.color, 4, 4); dead = true; }
      if (!dead) {
        for (const h of HS.list) {
          if (!h.alive) continue;
          const rr = b.r + 0.45;
          if (U.dist2(b.x, b.z, h.x, h.z) > rr * rr || Math.abs(b.y - (h.y + 1)) > 1.6) continue;
          if (b.cos) {
            if (h.dashT > 0 || h.invuln > 0) continue;
            G.FX.spark(b.x, b.y, b.z, b.color, 8, 6); dead = true; break;
          }
          if (h.takeDamage(b.dmg, b.x, b.z)) { G.FX.spark(b.x, b.y, b.z, b.color, 8, 6); dead = true; break; }
        }
      }
      if (Math.hypot(b.x, b.z) > W.ARENA_R + 10) dead = true;
      if (dead) { PR.enemy[i] = PR.enemy[PR.enemy.length - 1]; PR.enemy.pop(); continue; }
      if (Math.random() < 0.25) G.FX.trail(b.x, b.y, b.z, b.color, b.r * 1.2, 0.18, 1.2);
      const pulse = 1 + Math.sin(b.t * 18) * 0.12;
      tmpM.compose(tmpP.set(b.x, b.y, b.z), tmpQ.identity(), tmpS.setScalar(b.r * 1.45 * pulse));
      meshE.setMatrixAt(n, tmpM);
      meshE.setColorAt(n, tmpC.set(b.color).multiplyScalar(1.5));
      tmpM.compose(tmpP, tmpQ, tmpS.setScalar(b.r * 0.8));
      meshEcore.setMatrixAt(n, tmpM);
      meshEcore.setColorAt(n, tmpC.set(b.color).lerp(WHITE, 0.55).multiplyScalar(2.6));
      n++;
    }
    for (const m of [meshE, meshEcore]) {
      m.count = n;
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor.needsUpdate = true;
    }
  }

  function updateBoulders(dt) {
    const W = G.World;
    let n = 0;
    for (let i = PR.boulders.length - 1; i >= 0; i--) {
      const b = PR.boulders[i];
      b.t += dt;
      const k = Math.min(1, b.t / b.dur);
      const x = U.lerp(b.sx, b.tx, k), z = U.lerp(b.sz, b.tz, k);
      const gy = W.heightAt(b.tx, b.tz);
      const y = U.lerp(b.sy, gy + b.size * 0.6, k) + Math.sin(k * Math.PI) * b.height;
      if (k >= 1) {
        G.FX.explosion(b.tx, gy, b.tz, b.r, b.c || 0xff7040, 0.3);
        G.FX.gibs(b.tx, gy + 0.6, b.tz, 0x6d5f6a, 8, 0.35, 8);
        G.Audio.play('slam');
        if (!b.cos && b.dmg > 0) G.Heroes.damageCircle(b.tx, b.tz, b.r, b.dmg);
        // boss rocks smash whatever they land on (the host decides, everyone sees it break)
        if (!b.cos) G.World.breakAt(b.tx, b.tz, b.r * 0.7);
        // awakened bosses: the rock leaves burning ground (every machine runs its own boulders)
        if (b.fz) PT.start('firezone', { x: b.tx, z: b.tz, r: b.fz, du: 3, d: b.fzd, c: b.c || 0xff5a1a }, true);
        // ember bombs: the landing spot splits into a cross of flame
        if (b.cr) PT.start('cross', { x: b.tx, z: b.tz, a: b.ca, n: 4, len: b.cr, w: 1.1, dl: 0.6, d: b.cd || b.dmg, c: b.c || 0xff7a2a }, true);
        PR.boulders[i] = PR.boulders[PR.boulders.length - 1]; PR.boulders.pop();
        continue;
      }
      if (Math.random() < 0.7) G.FX.trail(x, y, z, b.c || 0xff6030, 1.0, 0.3, 1.5);
      b.rot += dt * 5;
      tmpE.set(b.rot, b.rot * 0.7, 0); tmpQ.setFromEuler(tmpE);
      const s = b.size * 0.9;
      meshB.setMatrixAt(n++, tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(s, s, s)));
    }
    meshB.count = n;
    meshB.instanceMatrix.needsUpdate = true;
  }

  PR.update = function (dt) {
    updatePlayer(dt);
    updateEnemy(dt);
    updateBoulders(dt);
    PT.update(dt);
  };
  PR.clearEnemy = function () {
    for (const b of PR.enemy) G.FX.spark(b.x, b.y, b.z, b.color, 3, 3);
    PR.enemy.length = 0;
  };
  PR.clear = function () {
    PR.player.length = 0; PR.enemy.length = 0;
    for (const b of PR.boulders) b.tele.kill();
    PR.boulders.length = 0;
    for (const m of [meshP, meshE, meshEcore, meshB]) m.count = 0;
    PT.clear();
  };

  // =================== attack patterns ===================
  const PT = (G.Patterns = { list: [] });
  const hy = (x, z) => G.World.heightAt(x, z);

  const GAP_VERT = `varying vec2 vXZ; varying float vY;
    void main() { vXZ = position.xz; vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
  const GAP_FRAG = `uniform vec3 uColor; uniform float uOpacity; uniform vec4 uGaps; uniform float uGapW; uniform float uWall;
    varying vec2 vXZ; varying float vY;
    void main() {
      float a = atan(vXZ.y, vXZ.x);
      float m = 1.0;
      for (int i = 0; i < 4; i++) {
        float g = uGaps[i];
        if (g < -9.0) continue;
        float d = abs(mod(a - g + 3.14159265, 6.2831853) - 3.14159265);
        m = min(m, smoothstep(uGapW, uGapW + 0.06, d));
      }
      if (m < 0.02) discard;
      float h = clamp(1.0 - vY, 0.0, 1.0);
      float fade = uWall > 0.5 ? h * sqrt(h) : 1.0;
      gl_FragColor = vec4(uColor * (1.0 + (1.0 - m) * 2.0), clamp(uOpacity * m * fade, 0.0, 1.0));
    }`;
  function gapMaterial(gaps, gw, wall, color) {
    const g = [-99, -99, -99, -99];
    gaps.slice(0, 4).forEach((v, i) => { g[i] = v; });
    return new THREE.ShaderMaterial({
      uniforms: { uColor: { value: U.hdr(color || 0xffa25a, 2.2) }, uOpacity: { value: 1 }, uGaps: { value: new THREE.Vector4(...g) }, uGapW: { value: gw }, uWall: { value: wall ? 1 : 0 } },
      vertexShader: GAP_VERT, fragmentShader: GAP_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
  }

  const K = {
    // a single spread of enemy orbs
    fan: {
      start(p) {
        for (let i = 0; i < p.n; i++) {
          PR.spawnEnemy({ x: p.x, z: p.z, y: p.y, angle: p.a + (i - (p.n - 1) / 2) * p.sp, speed: p.v, dmg: p.d, r: p.r, color: p.c, life: p.l || 4, turn: p.tu || 0, tg: p.tg || null });
        }
        G.Audio.play('enemyShoot');
      },
    },
    // rotating arms of orbs
    spiral: {
      init(i) { i.acc = 0; i.spin = i.p.a0; },
      step(i, dt) {
        const p = i.p;
        i.acc += dt;
        while (i.acc >= p.iv && i.t <= p.du) {
          i.acc -= p.iv;
          for (let k = 0; k < p.ar; k++) PR.spawnEnemy({ x: p.x, z: p.z, y: 1.3, angle: i.spin + (k / p.ar) * TAU, speed: p.v, dmg: p.d, r: p.r, color: p.c, life: 5 });
          i.spin += (p.rv && i.t > p.du / 2 ? -p.rs : p.rs) * p.iv; // rv: the spin turns back halfway
          G.Audio.play('enemyShoot');
        }
        return i.t >= p.du;
      },
    },
    // rings of orbs, each with one opening
    waves: {
      init(i) { i.k = 0; i.next = 0.2; },
      step(i) {
        const p = i.p;
        while (i.k < p.g.length && i.t >= i.next) {
          const off = (i.k + 1) * 0.13;
          for (let j = 0; j < p.n; j++) {
            const a = (j / p.n) * TAU + off;
            if (Math.abs(U.angleDiff(a, p.g[i.k])) < 0.34) continue;
            PR.spawnEnemy({ x: p.x, z: p.z, y: 1.3, angle: a, speed: p.v, dmg: p.d, r: p.r, color: p.c, life: 5 });
          }
          G.FX.ring(p.x, hy(p.x, p.z) + 1.5, p.z, 1, 4, 0.3, p.c, 2.2);
          G.Audio.play('enemyShoot');
          i.k++;
          i.next += p.iv;
        }
        return i.k >= p.g.length;
      },
    },
    // Colossus ground shockwaves: expanding walls with openings you can stand in
    colrings: {
      init(i) {
        const p = i.p;
        i.rings = p.rg.map((q) => ({ dl: q[0], gw: q[1], g: q.slice(2, 6), r: 0, on: false, done: false, hit: new Set(), m: null }));
        const first = i.rings[0];
        if (first) for (const g of first.g) {
          G.FX.telegraph({ shape: 'rect', x: p.x + Math.cos(g) * 7.8, z: p.z + Math.sin(g) * 7.8, angle: g, length: 14, width: 2.6, dur: first.dl + 1.0, color: 0x6fe3c4, k: 0.9 });
        }
      },
      step(i, dt) {
        const p = i.p;
        let busy = false;
        for (const rg of i.rings) {
          if (rg.done) continue;
          busy = true;
          if (i.t < rg.dl) continue;
          if (!rg.on) {
            rg.on = true;
            rg.r = 1.6;
            rg.m = [new THREE.Mesh(ringGeo, gapMaterial(rg.g, rg.gw, false, p.c)), new THREE.Mesh(wallGeo, gapMaterial(rg.g, rg.gw, true, p.c))];
            for (const m of rg.m) { m.renderOrder = 6; m.frustumCulled = false; scene.add(m); }
          }
          rg.r += p.v * dt;
          const y = hy(p.x, p.z) + 0.12, op = U.clamp(1.15 - rg.r / p.mx, 0, 1);
          rg.m[0].position.set(p.x, y, p.z); rg.m[0].scale.set(rg.r, 1, rg.r);
          rg.m[1].position.set(p.x, y, p.z); rg.m[1].scale.set(rg.r, 1.5, rg.r);
          for (const m of rg.m) m.material.uniforms.uOpacity.value = op;
          if (i.host) {
            for (const h of G.Heroes.list) {
              if (!h.alive || rg.hit.has(h)) continue;
              const d = U.dist(h.x, h.z, p.x, p.z);
              if (Math.abs(d - rg.r) > 0.6) continue;
              const a = Math.atan2(h.z - p.z, h.x - p.x);
              let safe = false;
              for (const g of rg.g) if (Math.abs(U.angleDiff(a, g)) < rg.gw - 0.03) safe = true;
              if (!safe && h.takeDamage(p.d, p.x, p.z)) rg.hit.add(h);
            }
          }
          if (rg.r >= p.mx) { rg.done = true; dropRing(rg); }
        }
        return !busy;
      },
      end(i) { for (const rg of i.rings) dropRing(rg); },
    },
    // four rotating beams
    lasers: {
      init(i) {
        i.a = i.p.a0;
        i.m = [];
        for (let k = 0; k < i.p.n; k++) {
          const m = new THREE.Mesh(laserGeo, new THREE.MeshBasicMaterial({ color: U.hdr(i.p.c || 0xff5a6e, 2.6), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
          m.renderOrder = 7;
          scene.add(m);
          i.m.push(m);
        }
        G.Audio.play('telegraph');
      },
      step(i, dt) {
        const p = i.p, warm = i.t < p.wm;
        if (!warm) i.a += (p.rv && i.t > (p.wm + p.du) / 2 ? -p.dir : p.dir) * p.rs * dt;
        const y = hy(p.x, p.z) + 1.2;
        i.m.forEach((m, k) => {
          const a = i.a + (k / p.n) * TAU;
          m.position.set(p.x, y, p.z);
          m.rotation.y = -a - Math.PI / 2;
          m.scale.set(warm ? 0.15 : p.w, 1, p.len);
          m.material.opacity = warm ? 0.35 + Math.sin(i.t * 30) * 0.15 : 0.95;
          if (warm || !i.host) return;
          const ca = Math.cos(a), sa = Math.sin(a);
          for (const h of G.Heroes.list) {
            if (!h.alive) continue;
            const px = h.x - p.x, pz = h.z - p.z, proj = px * ca + pz * sa;
            if (proj > 0 && proj < p.len && Math.abs(px * sa - pz * ca) < p.w / 2 + 0.45) h.takeDamage(p.d, p.x, p.z);
          }
        });
        return i.t >= p.du;
      },
      end(i) { for (const m of i.m) { scene.remove(m); m.material.dispose(); } },
    },
    // delayed burst on a marked circle
    zone: {
      init(i) { G.FX.telegraph({ shape: 'circle', x: i.p.x, z: i.p.z, r: i.p.r, dur: i.p.dl, color: i.p.c || 0xff3a5a }); },
      step(i) {
        if (i.t < i.p.dl) return false;
        const p = i.p, y = hy(p.x, p.z), c = p.c || 0xff6a7a;
        G.FX.burst(p.x, y + 0.3, p.z, { count: 30, color: c, intensity: 2.4, spread: 'up', speed: [6, 14], life: [0.3, 0.6], size: [0.5, 0.05], jitter: 1.5 });
        G.FX.ring(p.x, y + 0.2, p.z, 0.5, p.r, 0.3, c, 2.4);
        G.Audio.play('explode');
        if (i.host) {
          G.Heroes.damageCircle(p.x, p.z, p.r + 0.3, p.d);
          if (p.br) G.World.breakAt(p.x, p.z, p.r * 0.8);
        }
        return true;
      },
    },
    // burning patch that hurts while you stand in it
    firezone: {
      init(i) { i.tick = 0; i.col = new THREE.Color(i.p.c || 0xff5a1a); i.tele = G.FX.telegraph({ shape: 'circle', x: i.p.x, z: i.p.z, r: i.p.r, hold: true, color: i.p.c || 0xff5a1a, k: 1.2 }); },
      step(i, dt) {
        const p = i.p, c = i.col;
        if (Math.random() < 0.5) G.FX.P.emit(p.x + U.rand(-p.r, p.r) * 0.8, 0.2, p.z + U.rand(-p.r, p.r) * 0.8, 0, U.rand(1.5, 3), 0, 0.5, 0.5, 0.05, c.r * 3, c.g * 3, c.b * 3, 1, 1, 0);
        i.tick -= dt;
        if (i.host && i.tick <= 0) {
          i.tick = 0.5;
          for (const h of G.Heroes.list) if (h.alive && U.dist(h.x, h.z, p.x, p.z) < p.r + 0.3) h.takeDamage(p.d, p.x, p.z);
        }
        return i.t >= p.du;
      },
      end(i) { i.tele.kill(); },
    },
    // a strip of burning ground laid behind the wyrm: a straight dive (x, z, a, len)
    // or an arc around a point (cx, cz, r, a0, dir, sw). Each piece lights just after the head passes (v, dl).
    firepath: {
      init(i) {
        const p = i.p, seg = 1.7, segs = (i.segs = []), R = G.World.ARENA_R - 0.5;
        if (p.r) {
          const L = p.r * p.sw, n = Math.max(1, Math.ceil(L / seg)), da = (p.sw / n) * (p.dir < 0 ? -1 : 1), sl = L / n;
          for (let k = 0; k < n; k++) {
            const a = p.a0 + da * (k + 0.5), x = p.cx + Math.cos(a) * p.r, z = p.cz + Math.sin(a) * p.r;
            if (Math.hypot(x, z) > R) continue;
            segs.push({ x, z, y: hy(x, z) + 0.07, a: a + Math.PI / 2, len: sl * 1.12, on: ((k + 0.5) * sl) / p.v + p.dl });
          }
        } else {
          const n = Math.max(1, Math.ceil(p.len / seg)), ca = Math.cos(p.a), sa = Math.sin(p.a), sl = p.len / n;
          for (let k = 0; k < n; k++) {
            const s = (k + 0.5) * sl, x = p.x + ca * s, z = p.z + sa * s;
            if (Math.hypot(x, z) > R) continue;
            segs.push({ x, z, y: hy(x, z) + 0.07, a: p.a, len: sl * 1.12, on: s / p.v + p.dl });
          }
        }
        i.col = new THREE.Color(p.c || 0xff6a1a);
        i.tick = 0.15;
        i.end = segs.reduce((m, s) => Math.max(m, s.on), 0) + p.du;
      },
      step(i, dt) {
        const p = i.p, c = i.col;
        i.tick -= dt;
        const doDmg = i.host && i.tick <= 0;
        if (doDmg) i.tick = 0.4;
        const hit = doDmg ? new Set() : null;
        for (const s of i.segs) {
          const age = i.t - s.on;
          if (age < 0 || age > p.du) continue;
          const f = Math.min(1, age / 0.15) * Math.min(1, (p.du - age) / 0.5);
          if (fireN < FIRE_MAX) {
            tmpE.set(0, -s.a - Math.PI / 2, 0); tmpQ.setFromEuler(tmpE);
            fireMesh.setMatrixAt(fireN, tmpM.compose(tmpP.set(s.x, s.y, s.z), tmpQ, tmpS.set(p.w * 2 * (0.7 + 0.3 * f), 1, s.len)));
            fireMesh.setColorAt(fireN, tmpC.copy(c).multiplyScalar(1.3 * f));
            fireN++;
          }
          if (Math.random() < 0.12) G.FX.P.emit(s.x + U.rand(-0.8, 0.8), s.y + 0.1, s.z + U.rand(-0.8, 0.8), 0, U.rand(1.5, 3.5), 0, 0.5, 0.55, 0.05, c.r * 3, c.g * 3, c.b * 3, 1, 1, 0);
          if (!doDmg) continue;
          const ca = Math.cos(s.a), sa = Math.sin(s.a);
          for (const h of G.Heroes.list) {
            if (!h.alive || hit.has(h)) continue;
            const dx = h.x - s.x, dz = h.z - s.z;
            if (Math.abs(dx * ca + dz * sa) < s.len / 2 + 0.3 && Math.abs(dx * sa - dz * ca) < p.w + 0.4) { hit.add(h); h.takeDamage(p.d, s.x, s.z); }
          }
        }
        return i.t >= i.end;
      },
    },
    // a cross of flame bursting from a point after a short warning
    cross: {
      init(i) {
        const p = i.p;
        for (let k = 0; k < p.n; k++) {
          G.FX.telegraph({ shape: 'rect', x: p.x, z: p.z, angle: p.a + (k / p.n) * TAU, length: p.len, width: p.w * 2, dur: p.dl, color: p.c, k: 1.3 });
        }
      },
      step(i) {
        const p = i.p;
        if (i.t < p.dl) return false;
        const y = hy(p.x, p.z) + 0.6;
        for (let k = 0; k < p.n; k++) {
          const a = p.a + (k / p.n) * TAU, ca = Math.cos(a), sa = Math.sin(a);
          G.FX.beam(p.x, y, p.z, a, p.len, p.w * 2.2, p.c, 0.3);
          G.FX.burst(p.x + ca * p.len * 0.6, y, p.z + sa * p.len * 0.6, { count: 8, color: p.c, intensity: 2.6, speed: [2, 6], life: [0.2, 0.45], size: [0.5, 0.05], dir: { x: ca, y: 0.3, z: sa }, cone: 0.5 });
          if (!i.host) continue;
          for (const h of G.Heroes.list) {
            if (!h.alive) continue;
            const dx = h.x - p.x, dz = h.z - p.z, proj = dx * ca + dz * sa;
            if (proj > -0.6 && proj < p.len && Math.abs(dx * sa - dz * ca) < p.w + 0.4) h.takeDamage(p.d, p.x, p.z);
          }
        }
        G.Audio.play('explode');
        return true;
      },
    },
    // rings of eruptions spreading out from a point, one ring after another. rg: [[delay, radius, count, offset]]
    erupt: {
      init(i) {
        const p = i.p, R = G.World.ARENA_R - 1;
        i.spots = [];
        for (const q of p.rg) {
          const n = q[2] | 0;
          for (let k = 0; k < n; k++) {
            const a = q[3] + (k / n) * TAU, x = p.x + Math.cos(a) * q[1], z = p.z + Math.sin(a) * q[1];
            if (Math.hypot(x, z) > R) continue;
            i.spots.push({ x, z, dl: q[0], done: false });
            G.FX.telegraph({ shape: 'circle', x, z, r: p.r, dur: q[0], color: p.c });
          }
        }
      },
      step(i) {
        const p = i.p;
        let left = false, boom = false;
        for (const s of i.spots) {
          if (s.done) continue;
          if (i.t < s.dl) { left = true; continue; }
          s.done = true; boom = true;
          const y = hy(s.x, s.z);
          G.FX.burst(s.x, y + 0.3, s.z, { count: 16, color: p.c, intensity: 2.6, spread: 'up', speed: [5, 12], life: [0.3, 0.6], size: [0.6, 0.05], jitter: 1 });
          G.FX.ring(s.x, y + 0.2, s.z, 0.4, p.r, 0.3, p.c, 2.2);
          if (i.host) { G.Heroes.damageCircle(s.x, s.z, p.r + 0.2, p.d); G.World.breakAt(s.x, s.z, p.r * 0.5); }
        }
        if (boom) G.Audio.play('explode');
        return !left;
      },
    },
    boulder: { start(p) { PR.spawnBoulder(p); } },
  };
  function dropRing(rg) {
    if (!rg.m) return;
    for (const m of rg.m) { scene.remove(m); m.material.dispose(); }
    rg.m = null;
  }

  PT.start = function (kind, p, fromNet) {
    const k = K[kind];
    if (!k || !p) return;
    if (!fromNet) G.Net.pattern(kind, p);
    if (k.start) k.start(p);
    if (!k.step) return;
    const inst = { kind, p, t: 0, host: G.auth() };
    if (k.init) k.init(inst);
    PT.list.push(inst);
  };
  PT.update = function (dt) {
    fireN = 0;
    fireMesh.material.uniforms.uTime.value = (fireMesh.material.uniforms.uTime.value + dt) % 1000;
    for (let j = PT.list.length - 1; j >= 0; j--) {
      const i = PT.list[j];
      i.t += dt;
      let done = true;
      try { done = K[i.kind].step(i, dt); } catch (e) { console.warn('pattern', i.kind, e); }
      if (done) {
        if (K[i.kind].end) K[i.kind].end(i);
        PT.list.splice(j, 1);
      }
    }
    fireMesh.count = fireN;
    fireMesh.instanceMatrix.needsUpdate = true;
    fireMesh.instanceColor.needsUpdate = true;
  };
  PT.clear = function () {
    for (const i of PT.list) if (K[i.kind].end) K[i.kind].end(i);
    PT.list.length = 0;
    fireN = 0;
    if (fireMesh) fireMesh.count = 0;
  };
})();

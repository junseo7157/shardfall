// ============================================================
// SHARDFALL - bosses: Stone Colossus, Void Seraph, Ember Wyrm
// think() = AI on the authoritative machine, pose() = animation everywhere,
// puppets on co-op clients follow the host's snapshot.
// After the final stage they return "awakened": new colours, more of everything, twisted patterns.
// ============================================================
(() => {
  const G = window.G, U = G.U, Geo = G.Geo;
  const B = (G.Bosses = { active: null, targets: [] });
  // arena-relative distances: a co-op island is wider (G.World.S), so the bosses roam and reach further
  const LIM = (m = 3) => G.World.ARENA_R - m;
  const WS = () => G.World.S;
  let scene;
  const Sph = (r, w = 12, h = 10) => new THREE.SphereGeometry(r, w, h);
  const Box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
  const Cone = (r, h, s = 8) => new THREE.ConeGeometry(r, h, s);
  const Oct = (r) => new THREE.OctahedronGeometry(r, 0);
  const R1 = U.r1, R2 = U.r2;

  // colours per boss: n = normal, a = awakened
  const PAL = [
    {
      n: { aura: 0xff8a3a, glow: 0xff7a2a, glow2: 0xff2a2a, ring: 0xffa25a, rock: 0, tint: 0xffffff },
      a: { aura: 0x5fa8ff, glow: 0x6fb8ff, glow2: 0xc8e8ff, ring: 0x7fc4ff, rock: 0x6fb0ff, tint: 0xa8bce0 },
    },
    {
      n: { aura: 0xff5a6e, core: 0xff5a6e, core2: 0xff2a4a, halo: 0xffc35a, wing: 0x24357a, wingE: 0x3f63e0, b1: 0xff6a7a, b2: 0xffb04a, laser: 0xff5a6e, zone: 0xff3a5a, tint: 0xffffff },
      a: { aura: 0x3fe0a0, core: 0x3fe0a0, core2: 0xb8ffe0, halo: 0xd8ffe8, wing: 0x0f4a3a, wingE: 0x2fd090, b1: 0x5ff0b0, b2: 0xc8ff6a, laser: 0x4ff0b0, zone: 0x3fe0a0, tint: 0xb0e0c8 },
    },
    {
      n: { aura: 0xff6a1a, glow: 0xff8a2a, glow2: 0xffd04a, fire: 0xff7a2a, zone: 0xff5a1a, trail: 0xff8a1a, rock: 0, breath: [3, 1.15, 0.3], tint: 0xffffff },
      a: { aura: 0x7fd8ff, glow: 0x9fe8ff, glow2: 0xffffff, fire: 0x8fe0ff, zone: 0x5fc8ff, trail: 0x6fd0ff, rock: 0x8fd8ff, breath: [1.2, 2.6, 3.2], tint: 0x8fa6d8 },
    },
  ];

  B.init = function (sc) { scene = sc; };

  function target(boss, r, h, mult = 1) {
    return {
      x: 0, z: 0, y: 0, r, h, alive: true, isBoss: true, elite: false, mult, boss, lastDealt: null, lastResist: false, weak: false,
      hurt(d, o) { const k = boss.hurt(d * this.mult, o); this.lastDealt = boss.lastDealt; this.lastResist = this.mult < 0.5; return k; },
      applyStatus(k, p, dur) { boss.applyStatus(k, p, dur); },
      knock() {},
      set lastBy(h) { boss.lastBy = h; },
      get lastBy() { return boss.lastBy; },
    };
  }
  function mesh(geo, mat, parent, cast = true) { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; parent.add(m); return m; }

  class Boss {
    // o: armor, dm (attack damage), cd (time between attacks) from DEFS
    constructor(kind, name, sub, hp, puppet, aw, o = {}) {
      this.kind = kind; this.aw = aw | 0; this.puppet = !!puppet;
      this.pal = PAL[kind][this.aw ? 'a' : 'n'];
      this.color = this.pal.aura;
      this.name = this.aw ? '각성한 ' + name : name;
      this.sub = this.aw ? '모든 능력이 크게 올랐습니다 · ' + sub : sub;
      this.armor = (o.armor || 0) + this.aw * 15;
      this.dk = (o.dm || 1) * (this.aw ? 1.7 + 0.3 * (this.aw - 1) : 1); // attack damage
      this.spk = this.aw ? 1.25 : 1; // movement
      this.cdk = (o.cd || 1) * (this.aw ? 0.7 : 1); // time between attacks
      this.maxHp = this.hp = hp; this.alive = true; this.dying = false;
      this.phase = 1; this.invuln = true; this.state = 'intro'; this.stateT = 2.2; this.t = 0; this.cool = 1.5;
      this.flash = 0; this.burn = 0; this.burnDps = 0; this.burnTick = 0; this.slowT = 0; this.stunned = 0;
      this.x = 0; this.z = -16; this.y = 0; this.facing = Math.PI / 2; this.walk = 0;
      this.nx = null; this.nz = 0; this.ny = 0; this.nf = 0; this.flags = 0; this.extra = 0;
      this.group = new THREE.Group();
      scene.add(this.group);
      this.bodyMat = U.addRim(new THREE.MeshStandardMaterial({ vertexColors: true, color: this.pal.tint, roughness: 0.55, metalness: 0.1, flatShading: true, emissive: 0x000000 }), this.color, 0.55, 2.2);
      this.targets = [];
      this.lastAtk = '';
      this.tg = null; this.tgT = 0;
      this.aura = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 64).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: U.hdr(this.color, this.aw ? 2 : 1.4), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
      this.aura.renderOrder = 3;
      scene.add(this.aura);
    }
    pickTarget(dt) {
      this.tgT -= dt;
      if (this.tgT > 0 && this.tg && this.tg.alive) return this.tg;
      this.tgT = 0.6;
      this.tg = G.Heroes.nearest(this.x, this.z);
      return this.tg;
    }
    updateAura(x, z, r) {
      this.aura.visible = this.alive;
      this.aura.position.set(x, G.World.heightAt(x, z) + 0.1, z);
      this.aura.scale.setScalar(r * (1.15 + Math.sin(this.t * 4) * 0.05));
      this.aura.rotation.y += 0.01;
    }
    hurt(d) {
      if (!this.alive || this.invuln || this.puppet) return false;
      if (this.stunned > 0) d *= 1.5;
      d *= 30 / (30 + this.armor); // armor: the same curve heroes use
      this.lastDealt = d;
      this.hp -= d;
      this.flash = Math.min(1, this.flash + 0.5);
      if (this.phase === 1 && this.hp < this.maxHp * 0.5) {
        this.phase = 2;
        G.Net.vis('toast', this.name + ' — 분노', 'warn');
        G.Net.vis('sfx', 'bossRoar');
        G.Net.vis('ring', R1(this.x), R1(this.z), 1, 14, 0.7, this.color);
        G.Net.vis('shake', 0.5);
        this.onPhase2();
      }
      if (this.hp <= 0) { this.hp = 0; this.die(); return true; }
      return false;
    }
    onPhase2() {}
    applyStatus(k, p, dur) {
      if (this.puppet) return;
      if (k === 'burn') { this.burn = Math.max(this.burn, dur); this.burnDps = Math.max(this.burnDps, p); }
      else this.slowT = Math.max(this.slowT, dur * 0.35);
    }
    common(dt) {
      this.t += dt;
      this.flash = Math.max(0, this.flash - dt * 6);
      this.slowT = Math.max(0, this.slowT - dt);
      this.stunned = Math.max(0, this.stunned - dt);
      this.bodyMat.emissive.setRGB(this.flash * 0.9, this.flash * 0.9, this.flash * 0.9);
      if (this.puppet || this.burn <= 0 || !this.alive) return;
      this.burn -= dt; this.burnTick -= dt;
      if (this.burnTick <= 0) {
        this.burnTick = 0.5;
        const d = this.burnDps * 0.5 * (this.lastBy ? this.lastBy.stats.dmgMult : 1);
        this.hurt(d);
        G.Game.stats.damage += this.lastDealt || 0;
        G.FX.dmgNumber(this.x, this.y + 3, this.z, Math.round(this.lastDealt || d), 'burn');
      }
    }
    speedK() { return (this.slowT > 0 ? 0.6 : 1) * this.spk; }
    contact(dmg, r) { G.Heroes.damageCircle(this.x, this.z, r, dmg * this.dk, this.x, this.z); }
    intro(dt) {
      this.stateT -= dt;
      const k = U.clamp(1 - this.stateT / 2.2, 0, 1);
      this.y = G.World.heightAt(this.x, this.z) + (1 - U.easeOutCubic(Math.min(1, k * 1.6))) * 25;
      if (this.stateT <= 0) {
        this.invuln = false; this.state = 'idle'; this.cool = 1;
        G.Net.vis('boom', R1(this.x), R1(this.z), 6, this.color, 0.7);
        G.Net.vis('sfx', 'slam');
      }
    }
    die() {
      this.alive = false; this.dying = true; this.invuln = true;
      for (const t of this.targets) t.alive = false;
      G.Game.hitstop(0.2);
      G.Game.slowmo(1.6, 0.25);
      G.Net.vis('sfx', 'bossDie');
      G.Net.vis('clearShots');
      const x = this.x, z = this.z;
      for (let i = 0; i < 7; i++) {
        G.Enemies.later(i * 0.2, () => {
          const a = Math.random() * U.TAU, r = Math.random() * 3;
          G.Net.vis('bossBoom', R1(x + Math.cos(a) * r), R1(G.World.heightAt(x, z) + 1 + Math.random() * 3), R1(z + Math.sin(a) * r), R1(3 + Math.random() * 2), i % 2 ? this.color : 0xffd080);
        });
      }
      G.Enemies.later(1.5, () => {
        G.Net.vis('bossFinal', R1(x), R1(z), this.color);
        this.remove();
        G.Game.onBossKilled(this);
      });
    }
    remove() {
      scene.remove(this.group);
      scene.remove(this.aura);
      if (this.extra3d) for (const m of this.extra3d) scene.remove(m);
      this.dying = false;
      if (B.active === this) { B.active = null; B.targets = []; }
    }
    update(dt) {
      this.common(dt);
      if (this.puppet) this.follow(dt);
      else if (this.state === 'intro') this.intro(dt);
      else if (this.alive) this.think(dt);
      this.pose(dt);
    }
    // ---- co-op ----
    netState() {
      const fl = (this.stunned > 0 ? 1 : 0) | (this.invuln ? 2 : 0) | (this.dying || !this.alive ? 4 : 0) | (this.breathing ? 8 : 0);
      return [this.kind, R2(this.x), R2(this.z), R2(this.y), R2(this.facing), Math.round(this.hp), Math.round(this.maxHp), Math.max(0, this.STATES.indexOf(this.state)), this.phase, R2(this.extra || 0), fl, this.aw];
    }
    netApply(a) {
      const N = U.num;
      this.nx = N(a[1], this.x, -95, 95); this.nz = N(a[2], this.z, -95, 95); this.ny = N(a[3], 0, -10, 40); this.nf = N(a[4], 0, -20, 20);
      const hp = N(a[5], this.hp, 0, 1e8);
      if (hp < this.hp - 0.5 && this.alive) {
        G.FX.dmgNumber(this.x, this.y + 3, this.z, Math.round(this.hp - hp), '');
        this.flash = Math.min(1, this.flash + 0.4);
      }
      this.hp = hp;
      this.maxHp = Math.max(1, N(a[6], this.maxHp, 1, 1e8));
      this.state = this.STATES[N(a[7], 0, 0, 20) | 0] || 'idle';
      const ph = N(a[8], 1, 1, 2) | 0;
      if (ph === 2 && this.phase === 1) this.onPhase2();
      this.phase = ph;
      this.extra = N(a[9], 0, -20, 20);
      this.flags = N(a[10], 0, 0, 255) | 0;
      this.stunned = this.flags & 1 ? 0.2 : 0;
      this.invuln = !!(this.flags & 2);
      if (this.flags & 4) { this.alive = false; for (const t of this.targets) t.alive = false; }
    }
    follow(dt) {
      if (this.nx == null) return;
      const px = this.x, pz = this.z;
      if (U.dist2(this.x, this.z, this.nx, this.nz) > 36) { this.x = this.nx; this.z = this.nz; }
      else { this.x = U.damp(this.x, this.nx, 12, dt); this.z = U.damp(this.z, this.nz, 12, dt); }
      this.y = U.damp(this.y, this.ny, 12, dt);
      this.facing = U.dampAngle(this.facing, this.nf, 10, dt);
      this.walk += Math.hypot(this.x - px, this.z - pz) * 1.2;
    }
  }

  // ======================= 1. STONE COLOSSUS =======================
  class Colossus extends Boss {
    constructor(hp, puppet, aw, o) {
      super(0, '바위 거신 고르담', '내려찍은 뒤 퍼지는 충격파는 벌어진 틈으로 피하세요', hp, puppet, aw, o);
      const g = this.group, bm = this.bodyMat;
      this.glowMat = new THREE.MeshBasicMaterial({ color: U.hdr(this.pal.glow, 2.6) });
      const body = (this.body = new THREE.Group());
      g.add(body);
      mesh(Geo.part([[Geo.rock(1, 11), 0x6b6f86, 0, 3.0, 0, 0, 0, 0, 1.9, 1.55, 1.35, 0.08], [Geo.rock(1, 4), 0x4f8a5a, 0, 4.2, -0.4, 0, 0, 0, 1.3, 0.6, 1.0],
        [Geo.rock(0, 2), 0x5f637a, 0, 4.55, 0.55, 0, 0, 0, 0.8, 0.62, 0.75], [Box(0.95, 1.7, 0.95), 0x575b70, 0.95, 0.85, 0], [Box(0.95, 1.7, 0.95), 0x575b70, -0.95, 0.85, 0],
        [Oct(0.6), 0x4a6ad0, 1.6, 4.4, -0.2, 0, 0, -0.4, 0.6, 1.6, 0.6], [Oct(0.6), 0x4a6ad0, -1.6, 4.4, -0.2, 0, 0, 0.4, 0.6, 1.6, 0.6]]), bm, body);
      mesh(Geo.part([[Box(0.22, 0.1, 0.1), 0xffffff, 0.25, 4.6, 1.2], [Box(0.22, 0.1, 0.1), 0xffffff, -0.25, 4.6, 1.2], [Sph(0.42), 0xffffff, 0, 3.15, 1.3],
        [Box(0.08, 1.2, 0.08), 0xffffff, 0.6, 2.7, 1.32, 0, 0, 0.5], [Box(0.08, 0.9, 0.08), 0xffffff, -0.7, 3.3, 1.25, 0, 0, -0.7],
        [Box(0.1, 0.1, 1.6), 0xffffff, 0.45, 4.45, -0.2, 0, 0.3, 0], [Box(0.1, 0.1, 1.3), 0xffffff, -0.5, 4.4, -0.1, 0, -0.4, 0],
        [Box(0.1, 1.4, 0.1), 0xffffff, 0.5, 3.0, -1.32, 0, 0, 0.4], [Box(0.1, 1.1, 0.1), 0xffffff, -0.6, 3.2, -1.3, 0, 0, -0.5],
        [Sph(0.3), 0xffffff, 0, 3.4, -1.35]]), this.glowMat, body, false);
      if (this.aw) {
        // awakened: a crown of ice shards
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI - Math.PI / 2;
          const s = mesh(Oct(0.35), this.glowMat, body, false);
          s.position.set(Math.sin(a) * 1.1, 5.2 + Math.cos(a) * 0.3, Math.cos(a) * 0.3 - 0.2);
          s.scale.set(0.7, 2.2, 0.7);
        }
      }
      g.scale.setScalar(this.aw ? 1.38 : 1.25);
      this.arms = [];
      for (const s of [1, -1]) {
        const arm = new THREE.Group();
        arm.position.set(2.1 * s, 3.9, 0);
        body.add(arm);
        mesh(Geo.part([[Geo.rock(0, 5 + s), 0x666a82, 0, -1.0, 0, 0, 0, 0, 0.75, 1.3, 0.75], [Geo.rock(1, 8 + s), 0x5a5e76, 0, -2.5, 0.1, 0, 0, 0, 0.95, 0.9, 0.95]]), bm, arm);
        this.arms.push(arm);
      }
      this.t1 = target(this, this.aw ? 3.1 : 2.8, 6);
      this.targets = [this.t1];
    }
    get STATES() { return ['intro', 'idle', 'slam', 'toss', 'charge', 'charging', 'summon', 'recover']; }
    onPhase2() { this.glowMat.color.copy(U.hdr(this.pal.glow2, 3)); }
    pick(P) {
      const d = U.dist(P.x, P.z, this.x, this.z), P2 = this.phase === 2, aw = this.aw;
      const opts = ['slam', 'toss', 'charge'];
      if (P2) opts.push('summon', 'toss');
      let a = U.pick(opts);
      if (d < 7 && Math.random() < 0.6) a = 'slam';
      if (a === this.lastAtk && Math.random() < 0.6) a = U.pick(opts);
      this.lastAtk = a;
      this.state = a;
      if (a === 'slam') {
        this.stateT = (P2 ? 0.9 : 1.15) * (aw ? 0.85 : 1);
        G.Net.tele({ shape: 'circle', x: this.x, z: this.z, r: 7.5, dur: this.stateT, color: aw ? this.pal.ring : undefined });
        G.Net.vis('sfx', 'telegraph');
        // shockwaves with two openings each; later rings turn so you have to shift with them.
        // awakened: one more ring, faster, and the openings zig-zag back and forth
        const g0 = Math.random() * U.TAU, n = (P2 ? 3 : 2) + (aw ? 1 : 0), gap = (P2 ? 0.85 : 0.95) * (aw ? 0.9 : 1), rg = [];
        for (let k = 0; k < n; k++) {
          const g = g0 + (aw ? (k % 2) * 0.55 : k * 0.5);
          rg.push([R2(this.stateT + k * gap), 0.44, R2(g), R2(g + Math.PI)]);
        }
        G.Patterns.start('colrings', { x: R1(this.x), z: R1(this.z), rg, v: aw ? 9 : 8, mx: R1((aw ? 26 : 22) * WS()), d: R1(14 * this.dk), c: this.pal.ring });
      }
      if (a === 'toss') { this.stateT = 0.7 * (aw ? 0.85 : 1); this.tossN = (P2 ? 5 : 3) + (aw ? 2 : 0); }
      if (a === 'charge') this.startCharge(P, (P2 ? 0.75 : 0.95) * (aw ? 0.85 : 1));
      if (a === 'summon') { this.stateT = 1.0; G.Net.vis('sfx', 'bossRoar'); }
    }
    startCharge(P, wind) {
      this.state = 'charge';
      this.stateT = wind;
      this.chargeA = Math.atan2(P.z - this.z, P.x - this.x);
      G.Net.tele({ shape: 'rect', x: this.x, z: this.z, angle: this.chargeA, length: 26, width: 4.2, dur: wind, color: this.aw ? this.pal.ring : undefined });
      G.Net.vis('sfx', 'telegraph');
    }
    think(dt) {
      const P = this.pickTarget(dt);
      if (this.state === 'idle') {
        if (!P) return;
        const dx = P.x - this.x, dz = P.z - this.z, dist = Math.hypot(dx, dz) || 1;
        const sp = (this.phase === 2 ? 3.4 : 2.6) * this.speedK();
        let mx = dx / dist, mz = dz / dist;
        if (!G.Enemies.los(this.x, this.z, P.x, P.z, 1.6)) {
          const f = G.Enemies.flowDir(this.x, this.z, { x: 0, z: 0 });
          if (f.x || f.z) { mx = f.x; mz = f.z; }
        }
        if (dist > 4) { this.x += mx * sp * dt; this.z += mz * sp * dt; this.walk += dt * sp * 1.5; }
        this.facing = U.dampAngle(this.facing, Math.atan2(dz, dx), 4, dt);
        this.cool -= dt;
        if (this.cool <= 0 && this.stunned <= 0) this.pick(P);
      } else if (this.state === 'slam') {
        this.stateT -= dt;
        if (this.stateT <= 0) {
          G.Net.vis('bigSlam', R1(this.x), R1(this.z), 7.5, this.pal.ring);
          G.Game.hitstop(0.05);
          G.Heroes.damageCircle(this.x, this.z, 7.5, 28 * this.dk, this.x, this.z);
          G.World.breakAt(this.x, this.z, 5.5);
          this.state = 'recover'; this.stateT = 0.9; this.cool = (this.phase === 2 ? 1.6 : 2.1) * this.cdk;
        }
      } else if (this.state === 'toss') {
        this.stateT -= dt;
        if (this.stateT <= 0) {
          const hs = G.Heroes.alive();
          for (let i = 0; i < this.tossN; i++) {
            const h = (i === 0 ? P : hs[i % Math.max(1, hs.length)]) || P;
            if (!h) break;
            const lead = i === 0 ? 0 : 1;
            const tx = U.clamp(h.x + h.vx * 0.9 * lead + U.rand(-3, 3) * lead, -LIM(), LIM()), tz = U.clamp(h.z + h.vz * 0.9 * lead + U.rand(-3, 3) * lead, -LIM(), LIM());
            G.Patterns.start('boulder', { sx: R1(this.x), sz: R1(this.z), sy: R1(this.y + 5), tx: R1(tx), tz: R1(tz), du: R2(1.1 + i * 0.18), h: 9, r: 2.6, d: R1(22 * this.dk), s: 1.1,
              c: this.pal.rock, fz: this.aw ? 1.8 : 0, fzd: R1(8 * this.dk) });
          }
          G.Net.vis('sfx', 'slam');
          this.state = 'recover'; this.stateT = 0.6; this.cool = 1.6 * this.cdk;
        }
      } else if (this.state === 'charge') {
        this.stateT -= dt;
        this.facing = this.chargeA;
        if (this.stateT <= 0) { this.state = 'charging'; this.stateT = 1.1; G.Net.vis('sfx', 'dash'); }
      } else if (this.state === 'charging') {
        this.stateT -= dt;
        const sp = 26 * this.spk;
        this.x += Math.cos(this.chargeA) * sp * dt; this.z += Math.sin(this.chargeA) * sp * dt;
        if (Math.random() < 0.8) G.FX.smoke(this.x, this.y + 0.3, this.z, 2, 0x4a3a40, 1.6, 2);
        this.contact(30, 3.0);
        // whatever it rams shatters, and the impact still staggers it
        const smashed = G.World.breakAt(this.x, this.z, 2.7);
        const hit = G.World.resolve(this, 2.6) || smashed > 0;
        if (hit || this.stateT <= 0) {
          G.Net.vis('boom', R1(this.x), R1(this.z), 4, this.aw ? this.pal.ring : 0xffa060, 0.5);
          if (hit) { this.stunned = this.aw ? 1.0 : 1.6; G.Net.vis('toast', smashed ? '거신이 들이받은 것을 부수고 비틀거립니다 — 지금이 기회' : '거신이 비틀거립니다 — 지금이 기회', 'gold'); }
          if (this.aw && !hit && !this.chained && P) {
            // awakened: turns around and charges again right away
            this.chained = true;
            this.startCharge(P, 0.55);
          } else {
            this.chained = false;
            this.state = 'recover'; this.stateT = hit ? (this.aw ? 1.0 : 1.6) : 0.6; this.cool = 1.4 * this.cdk;
          }
        }
      } else if (this.state === 'summon') {
        this.stateT -= dt;
        if (this.stateT <= 0) {
          const n = this.aw ? 7 : 5;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * U.TAU, p = { x: this.x + Math.cos(a) * 5, z: this.z + Math.sin(a) * 5 };
            G.World.resolve(p, 0.6);
            G.Enemies.spawn(this.aw ? ['brute', 'bomber', 'shield'][i % 3] : i < 2 ? 'bomber' : 'imp', p.x, p.z);
          }
          this.state = 'recover'; this.stateT = 0.5; this.cool = 2.2 * this.cdk;
        }
      } else if (this.state === 'recover') {
        this.stateT -= dt;
        if (this.stateT <= 0) this.state = 'idle';
      }
      if (this.state !== 'charging') {
        // it tramples trees and fallen columns in its way; standing pillars and boulders still block it
        G.World.breakAt(this.x, this.z, 2.5, ['tree', 'column']);
        G.World.resolve(this, 2.4);
      }
      this.contact(18, 2.8);
      this.y = G.World.heightAt(this.x, this.z);
    }
    pose(dt) {
      const s = this.state;
      let arm = 0;
      if (s === 'slam') arm = -2.8;
      else if (s === 'toss') arm = -2.4;
      else if (s === 'summon') arm = -1.5;
      else if (s === 'recover') arm = this.stunned > 0 ? 0.6 : 0.3;
      this.group.position.set(this.x, this.y, this.z);
      this.group.rotation.y = Math.PI / 2 - this.facing;
      this.body.position.y = s === 'idle' ? Math.abs(Math.sin(this.walk)) * 0.15 : 0;
      this.body.rotation.x = s === 'charging' ? 0.35 : this.stunned > 0 ? -0.25 : 0;
      this.arms.forEach((a, i) => { a.rotation.x = U.damp(a.rotation.x, arm !== 0 ? arm : Math.sin(this.walk + i * Math.PI) * 0.5, 8, dt); });
      this.t1.x = this.x; this.t1.z = this.z; this.t1.y = this.y;
    }
  }

  // ======================= 2. VOID SERAPH =======================
  class Seraph extends Boss {
    constructor(hp, puppet, aw, o) {
      super(1, '공허의 사도 넥시아', '광선을 따라 돌고, 탄막의 빈자리로 빠지세요', hp, puppet, aw, o);
      const g = this.group, pal = this.pal;
      this.coreMat = new THREE.MeshBasicMaterial({ color: U.hdr(pal.core, 1.8) });
      this.haloMat = new THREE.MeshBasicMaterial({ color: U.hdr(pal.halo, 1.6) });
      const body = (this.body = new THREE.Group());
      g.add(body);
      mesh(Oct(1), this.coreMat, body).scale.set(1, 1.8, 1);
      mesh(Geo.part([[new THREE.IcosahedronGeometry(1.15, 0), 0x2a1d2c], [Cone(0.7, 2.2, 6), 0x2a1d2c, 0, -1.9, 0, Math.PI]]), this.bodyMat, body);
      this.halos = [];
      const rings = [[2.0, 0.4], [2.6, -0.6], [3.2, 1.2]];
      if (this.aw) rings.push([3.8, -1.1]);
      for (const [r, tilt] of rings) {
        const h = mesh(new THREE.TorusGeometry(r, 0.05, 6, 64), this.haloMat, body, false);
        h.rotation.x = Math.PI / 2 + tilt;
        this.halos.push(h);
      }
      this.wings = [];
      const wingMat = new THREE.MeshStandardMaterial({ color: pal.wing, emissive: pal.wingE, emissiveIntensity: 1.3, flatShading: true, roughness: 0.3 });
      const per = this.aw ? 5 : 4;
      for (const s of [1, -1]) for (let i = 0; i < per; i++) {
        const piv = new THREE.Group();
        piv.position.set(0.6 * s, 0.6, -0.4);
        body.add(piv);
        const w = mesh(Oct(1), wingMat, piv);
        w.scale.set(0.2, 1.4 - i * 0.16, 0.45);
        w.position.set(1.4 * s + i * 0.45 * s, 0.6 - i * 0.2, -0.3 * i);
        piv.userData = { s, i };
        this.wings.push(piv);
      }
      if (this.aw) g.scale.setScalar(1.15);
      this.t1 = target(this, 1.9, 4.5);
      this.targets = [this.t1];
      this.hover = 3.2;
      this.x = 0; this.z = -14;
    }
    get STATES() { return ['intro', 'idle', 'spiral', 'rings', 'zones', 'teleport', 'lasers', 'summon']; }
    onPhase2() { this.coreMat.color.copy(U.hdr(this.pal.core2, 2.2)); }
    pick(P) {
      const P2 = this.phase === 2, aw = this.aw, pal = this.pal, dk = this.dk;
      const opts = ['spiral', 'rings', 'zones', 'teleport'];
      if (P2 || aw) opts.push('lasers', 'lasers');
      if (P2) opts.push('summon');
      let a = U.pick(opts);
      if (a === this.lastAtk) a = U.pick(opts);
      this.lastAtk = a;
      this.state = a;
      const x = R1(this.x), z = R1(this.z);
      if (a === 'spiral') {
        this.stateT = 3.6;
        G.Patterns.start('spiral', { x, z, a0: R2(Math.random() * 6), ar: (P2 ? 5 : 3) + (aw ? 2 : 0), iv: P2 ? 0.075 : 0.095, rs: P2 ? 2.2 : 1.6, rv: aw ? 1 : 0, du: 3.6, v: 8.5, d: R1(13 * dk), r: 0.32, c: pal.b1 });
      }
      if (a === 'rings') {
        this.stateT = aw ? 2.8 : 2.2;
        const base = Math.atan2(P.z - this.z, P.x - this.x);
        const waves = aw ? 4 : 3;
        G.Patterns.start('waves', { x, z, n: (P2 ? 30 : 24) + (aw ? 6 : 0), g: Array.from({ length: waves }, () => R2(base + U.rand(-0.6, 0.6))), iv: 0.6, v: 9, d: R1(14 * dk), r: 0.36, c: pal.b2 });
      }
      if (a === 'zones') { this.stateT = aw ? 2.3 : 1.8; this.zoneT = 0; this.zoneN = 0; }
      if (a === 'teleport') { this.stateT = 0.5; this.fromX = this.x; this.fromZ = this.z; G.Net.vis('warp', x, z, this.color); }
      if (a === 'lasers') {
        this.stateT = 4.2;
        G.Patterns.start('lasers', { x, z, a0: R2(Math.random() * 6), dir: U.chance(0.5) ? 1 : -1, rs: R2((P2 ? 0.55 : 0.42) * (aw ? 1.25 : 1)), rv: aw ? 1 : 0, wm: 1.0, du: 4.2, n: aw ? 6 : 4, len: 40, w: 1.3, d: R1(16 * dk), c: pal.laser });
      }
      if (a === 'summon') this.stateT = 0.8;
    }
    think(dt) {
      const P = this.pickTarget(dt);
      if (!P) return;
      const dx = P.x - this.x, dz = P.z - this.z, dist = Math.hypot(dx, dz) || 1;
      this.facing = U.dampAngle(this.facing, Math.atan2(dz, dx), 3, dt);
      if (this.state === 'idle') {
        const sp = 2.4 * this.speedK(), want = dist > 14 ? 1 : dist < 8 ? -1 : 0;
        this.x += (dx / dist) * sp * want * dt + Math.cos(this.t * 0.7) * dt * 1.5;
        this.z += (dz / dist) * sp * want * dt + Math.sin(this.t * 0.9) * dt * 1.5;
        this.cool -= dt;
        if (this.cool <= 0) this.pick(P);
      } else {
        this.stateT -= dt;
        if (this.state === 'zones') {
          this.zoneT -= dt;
          if (this.zoneT <= 0 && this.zoneN < (this.phase === 2 ? 7 : 5) + (this.aw ? 3 : 0)) {
            this.zoneT = 0.18;
            this.zoneN++;
            const hs = G.Heroes.alive(), h = hs[this.zoneN % hs.length] || P;
            const spread = this.zoneN > hs.length ? 5 : 0;
            const tx = U.clamp(h.x + h.vx * 0.5 + U.rand(-spread, spread), -LIM(), LIM()), tz = U.clamp(h.z + h.vz * 0.5 + U.rand(-spread, spread), -LIM(), LIM());
            G.Patterns.start('zone', { x: R1(tx), z: R1(tz), r: this.aw ? 3.2 : 2.8, dl: 1.15, d: R1(22 * this.dk), c: this.pal.zone, br: 1 });
          }
        } else if (this.state === 'teleport') {
          if (this.stateT <= 0) {
            const p = G.World.randomOpenPoint(6, LIM(7), 2);
            if (U.dist(p.x, p.z, P.x, P.z) > 9) { this.x = p.x; this.z = p.z; }
            G.Net.vis('warp', R1(this.x), R1(this.z), this.color);
            // awakened: the spot it left bursts a moment later
            if (this.aw) G.Patterns.start('zone', { x: R1(this.fromX), z: R1(this.fromZ), r: 3.6, dl: 0.9, d: R1(22 * this.dk), c: this.pal.zone, br: 1 });
          }
        } else if (this.state === 'summon') {
          if (this.stateT <= 0) {
            const n = this.aw ? 6 : 4;
            for (let i = 0; i < n; i++) {
              const p = G.World.randomOpenPoint(8, LIM(7), 1);
              G.Enemies.spawn(this.aw ? ['caster', 'wraith', 'sniper'][i % 3] : i % 2 ? 'caster' : 'wraith', p.x, p.z);
            }
          }
        }
        if (this.stateT <= 0) { this.state = 'idle'; this.cool = (this.phase === 2 ? 0.9 : 1.4) * this.cdk; }
      }
      G.World.resolve(this, 1.6);
      this.contact(18, 1.9);
      this.y = G.World.heightAt(this.x, this.z);
    }
    pose(dt) {
      const t = this.t;
      const hy = this.state === 'intro' && !this.puppet ? this.y : this.y + Math.sin(t * 1.6) * 0.3;
      this.group.position.set(this.x, hy + this.hover, this.z);
      this.group.rotation.y = Math.PI / 2 - this.facing;
      this.halos.forEach((h, i) => { h.rotation.z += dt * (0.6 + i * 0.4) * (i % 2 ? -1 : 1) * (this.aw ? 1.5 : 1); h.rotation.y += dt * 0.3; });
      this.wings.forEach((w) => { const { s, i } = w.userData; w.rotation.z = s * (0.25 + Math.sin(t * 2.2 + i * 0.4) * 0.18); w.rotation.y = s * -0.3; });
      this.body.rotation.y += dt * 0.4;
      if (Math.random() < 0.5) G.FX.trail(this.x + U.rand(-0.5, 0.5), hy + this.hover - 2 + U.rand(-0.3, 0.3), this.z + U.rand(-0.5, 0.5), this.pal.b1, 0.8, 0.5, 1.8);
      this.t1.x = this.x; this.t1.z = this.z; this.t1.y = this.y + 1.5;
    }
  }

  // ======================= 3. EMBER WYRM =======================
  // only the head takes full damage; the plated body takes 30%
  class Wyrm extends Boss {
    constructor(hp, puppet, aw, o) {
      super(2, '화염 비룡 이그니스', '머리를 노리세요 · 몸통은 피해 30%', hp, puppet, aw, o);
      const g = this.group, bm = this.bodyMat;
      this.glowMat = new THREE.MeshBasicMaterial({ color: U.hdr(this.pal.glow, 3) });
      this.head = new THREE.Group();
      g.add(this.head);
      // weak point marker: a burning ring around the head
      this.weakMat = new THREE.MeshBasicMaterial({ color: U.hdr(this.pal.glow2, 2.2), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
      this.crest = mesh(new THREE.TorusGeometry(1.55, 0.07, 6, 44), this.weakMat, this.head, false);
      this.crest.rotation.x = Math.PI / 2;
      this.crest.renderOrder = 5;
      mesh(Geo.part([[Box(1.3, 0.9, 2.0), 0x5a1a1a, 0, 0, 0], [Cone(0.6, 1.4, 6), 0x6a2018, 0, -0.05, 1.6, Math.PI / 2], [Cone(0.18, 1.4, 5), 0xe8d0a0, 0.5, 0.6, -0.8, -0.9],
        [Cone(0.18, 1.4, 5), 0xe8d0a0, -0.5, 0.6, -0.8, -0.9], [Cone(0.25, 0.6, 5), 0x3a0e0e, 0, 0.6, -0.2, -0.3]]), bm, this.head);
      if (this.aw) {
        for (const s of [1, -1]) {
          const horn = mesh(Cone(0.14, 1.6, 5), this.glowMat, this.head, false);
          horn.position.set(0.32 * s, 0.9, -0.3);
          horn.rotation.set(-1.1, 0, s * 0.35);
        }
      }
      this.jaw = new THREE.Group();
      this.jaw.position.set(0, -0.4, 0.4);
      this.head.add(this.jaw);
      mesh(Geo.part([[Box(1.0, 0.25, 1.8), 0x4a1414, 0, 0, 0.6]]), bm, this.jaw);
      mesh(Geo.part([[Box(0.25, 0.12, 0.12), 0xffffff, 0.45, 0.2, 0.95], [Box(0.25, 0.12, 0.12), 0xffffff, -0.45, 0.2, 0.95]]), this.glowMat, this.head, false);
      this.segs = [];
      const N = this.aw ? 24 : 20;
      const segGeo = Geo.part([[Sph(1, 10, 8), 0x5a1a1a, 0, 0, 0, 0, 0, 0, 1, 0.85, 1.1], [Cone(0.3, 0.9, 5), 0x2a0a0a, 0, 0.9, 0, -0.3]]);
      const bellyGeo = new THREE.SphereGeometry(0.55, 8, 6);
      for (let i = 0; i < N; i++) {
        const s = 1.15 - (i / N) * 0.7;
        const m = new THREE.Mesh(segGeo, bm);
        m.castShadow = true;
        m.scale.setScalar(s);
        scene.add(m);
        const glow = new THREE.Mesh(bellyGeo, this.glowMat);
        glow.position.y = -0.45;
        m.add(glow);
        this.segs.push({ mesh: m, r: s, x: 0, y: 0, z: 0, tg: target(this, s * 0.95, 1.2, 0.3) });
      }
      this.extra3d = this.segs.map((s) => s.mesh);
      this.headT = target(this, aw ? 1.9 : 1.7, 1.4, 1);
      this.headT.weak = true;
      this.targets = [this.headT, ...this.segs.map((s) => s.tg)];
      this.trail = [];
      this.x = 0; this.z = -40; this.hy = 3; this.dir = 0;
      this.orbitA = -Math.PI / 2; this.orbitDir = 1;
      this.fireT = 1.5; this.volley = 0;
      this.breathing = false;
    }
    get STATES() { return ['intro', 'idle', 'dive', 'diving', 'breath', 'rain', 'coil', 'inferno']; }
    intro(dt) {
      this.stateT -= dt;
      this.orbitA += dt * 0.5;
      this.steer(Math.cos(this.orbitA) * 26 * WS(), Math.sin(this.orbitA) * 26 * WS(), 16, dt);
      if (this.stateT <= 0) {
        this.invuln = false; this.state = 'idle'; this.cool = 1.5;
        G.Net.vis('toast', '머리를 맞혀야 제대로 들어갑니다', 'gold');
      }
    }
    steer(tx, tz, sp, dt, turn = 2.6) {
      this.dir += U.clamp(U.angleDiff(this.dir, Math.atan2(tz - this.z, tx - this.x)), -turn * dt, turn * dt);
      this.x += Math.cos(this.dir) * sp * dt; this.z += Math.sin(this.dir) * sp * dt;
    }
    onPhase2() { this.glowMat.color.copy(U.hdr(this.pal.glow2, 3.4)); }
    endAttack(cool) { this.state = 'idle'; this.cool = cool * this.cdk; this.orbitA = Math.atan2(this.z, this.x); }
    pick() {
      const P2 = this.phase === 2, aw = this.aw;
      const opts = ['dive', 'breath', 'coil', 'dive', 'breath'];
      if (P2 || aw) opts.push('rain', 'inferno', 'coil');
      let a = U.pick(opts);
      for (let k = 0; k < 2 && a === this.lastAtk; k++) a = U.pick(opts);
      this.lastAtk = a;
      this.state = a;
      if (a === 'dive') { this.diveN = aw ? 3 : P2 ? 2 : 1; this.diveI = 0; this.stateT = 1.25; this.diveSet = false; }
      if (a === 'breath') { this.stateT = 3.6; this.breathT = 0; this.breathSet = false; }
      if (a === 'rain') { this.stateT = aw ? 2.6 : 2.2; this.rainN = 0; this.rainT = 0; G.Net.vis('sfx', 'bossRoar'); }
      if (a === 'coil') { this.stateT = 9; this.coilPh = 0; this.coilT = 0; G.Net.vis('sfx', 'bossRoar'); }
      if (a === 'inferno') { this.stateT = 6.2; this.infSet = false; this.infA = Math.atan2(this.z, this.x); G.Net.vis('sfx', 'bossRoar'); }
    }
    // lobbed embers that land and split into a cross of flame
    emberBombs(P) {
      const aw = this.aw, hs = G.Heroes.alive(), n = aw ? 4 : this.phase === 2 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const h = (i === 0 ? P : hs[i % Math.max(1, hs.length)]) || P;
        const sp = i === 0 ? 0.6 : 4;
        const tx = U.clamp(h.x + h.vx * 0.7 + U.rand(-sp, sp), -LIM(4), LIM(4)), tz = U.clamp(h.z + h.vz * 0.7 + U.rand(-sp, sp), -LIM(4), LIM(4));
        G.Patterns.start('boulder', { sx: R1(this.x), sz: R1(this.z), sy: R1(this.hy + 1), tx: R1(tx), tz: R1(tz), du: R2(0.95 + i * 0.14), h: 6, r: 1.8, d: R1(16 * this.dk), s: 0.7,
          c: this.pal.fire, cr: aw ? 8.5 : 7, ca: R2(i % 2 ? Math.PI / 4 : 0), cd: R1(14 * this.dk) });
      }
      G.Net.vis('sfx', 'enemyShoot');
    }
    think(dt) {
      const P = this.pickTarget(dt), aw = this.aw, pal = this.pal, dk = this.dk, P2 = this.phase === 2;
      const sp = (P2 ? 15 : 12) * this.speedK();
      this.breathing = false;
      if (this.state === 'idle') {
        this.orbitA += this.orbitDir * dt * (sp / 24);
        const R = (22 + Math.sin(this.t * 0.5) * 6) * WS();
        this.steer(Math.cos(this.orbitA) * R, Math.sin(this.orbitA) * R, sp, dt);
        this.fireT -= dt;
        if (this.fireT <= 0 && P) {
          this.fireT = (P2 ? 0.95 : 1.3) * this.cdk;
          this.volley = (this.volley + 1) % 3;
          if (this.volley === 2) this.emberBombs(P);
          else G.Patterns.start('fan', { x: R1(this.x), z: R1(this.z), y: 1.4, a: R2(Math.atan2(P.z - this.z, P.x - this.x)), n: aw ? 6 : 4, sp: aw ? 0.19 : 0.23, v: 14, d: R1(14 * dk), r: 0.42, c: pal.fire, l: 4, tu: aw ? 0.9 : 0.7, tg: P.key });
        }
        this.cool -= dt;
        if (this.cool <= 0 && P) this.pick();
      } else if (this.state === 'dive') {
        this.stateT -= dt;
        if (!this.diveSet && P) {
          this.diveSet = true;
          // follow-up dives cut in from the side, so a chain draws an X across the arena
          const side = this.diveI > 0 ? U.pick([-1, 1]) * U.rand(1.0, 1.5) : 0;
          const a = Math.atan2(P.z - this.z, P.x - this.x) + side;
          const lx = P.x + P.vx * 0.3, lz = P.z + P.vz * 0.3;
          this.diveA = a;
          this.diveStart = { x: lx - Math.cos(a) * 30, z: lz - Math.sin(a) * 30 };
          G.Net.tele({ shape: 'rect', x: this.diveStart.x, z: this.diveStart.z, angle: a, length: 60, width: 4.5, dur: this.stateT, color: aw ? pal.zone : undefined });
          G.Net.vis('sfx', 'telegraph');
        }
        if (this.diveStart) this.steer(this.diveStart.x, this.diveStart.z, sp * 1.8, dt, 4);
        if (this.stateT <= 0 && this.diveStart) {
          this.state = 'diving'; this.stateT = 2.2;
          this.x = this.diveStart.x; this.z = this.diveStart.z; this.dir = this.diveA;
          G.Net.vis('sfx', 'bossRoar');
          // the dive leaves a strip of burning ground behind it
          G.Patterns.start('firepath', { x: R1(this.x), z: R1(this.z), a: R2(this.dir), len: 64, v: R1(34 * this.spk), dl: 0.3, du: aw ? 3.4 : P2 ? 2.6 : 1.8, w: 1.3, d: R1(8 * dk), c: pal.trail });
        }
      } else if (this.state === 'diving') {
        this.stateT -= dt;
        this.x += Math.cos(this.dir) * 34 * this.spk * dt; this.z += Math.sin(this.dir) * 34 * this.spk * dt;
        if (Math.random() < 0.6) G.FX.burst(this.x, 1, this.z, { count: 3, color: pal.fire, intensity: 2.6, speed: [1, 4], life: [0.3, 0.6], size: [0.8, 0.1], up: 2 });
        // flying this low it ploughs through anything in the way
        G.World.breakAt(this.x, this.z, 1.8);
        if (this.stateT <= 0) {
          this.diveI++;
          if (this.diveI < this.diveN && P) { this.state = 'dive'; this.stateT = 0.95; this.diveSet = false; }
          else this.endAttack(P2 ? 1.2 : 1.9);
        }
      } else if (this.state === 'breath') {
        this.stateT -= dt;
        // the flame starts on one side and sweeps across (awakened: and back again)
        const half = aw ? 3.0 : 2.4, len = 18, amp = aw ? 0.75 : P2 ? 0.6 : 0.45;
        if (this.stateT > 2.5) {
          if (P) {
            const a = Math.atan2(P.z - this.z, P.x - this.x);
            this.steer(P.x - Math.cos(a) * 13, P.z - Math.sin(a) * 13, sp, dt, 4);
          }
        } else if (!this.breathSet) {
          this.breathSet = true;
          this.breathBase = P ? Math.atan2(P.z - this.z, P.x - this.x) : this.dir;
          this.sweepDir = U.chance(0.5) ? 1 : -1;
          this.breathA = this.breathBase - this.sweepDir * amp;
          const col = aw ? pal.zone : undefined;
          G.Net.tele({ shape: 'rect', x: this.x, z: this.z, angle: this.breathA, length: len, width: half * 2, dur: 0.75, color: col });
          G.Net.tele({ shape: 'rect', x: this.x, z: this.z, angle: this.breathBase + this.sweepDir * amp, length: len, width: half * 2, dur: 2.5, color: col, k: 0.7 });
          G.Net.vis('sfx', 'telegraph');
        } else if (this.stateT > 1.75) {
          this.dir = U.dampAngle(this.dir, this.breathA, 10, dt);
        } else {
          const k = 1 - this.stateT / 1.75;
          this.breathA = this.breathBase - this.sweepDir * amp * Math.cos(k * Math.PI * (aw ? 2 : 1));
          this.dir = this.breathA;
          this.breathing = true;
          this.breathT -= dt;
          if (this.breathT <= 0) {
            this.breathT = 0.22;
            const ca = Math.cos(this.breathA), sa = Math.sin(this.breathA);
            for (const h of G.Heroes.list) {
              if (!h.alive) continue;
              const px = h.x - this.x, pz = h.z - this.z, proj = px * ca + pz * sa;
              if (proj > 0 && proj < len && Math.abs(px * sa - pz * ca) < half + 0.4) h.takeDamage(12 * dk, this.x, this.z);
            }
            if (Math.random() < (aw ? 0.5 : 0.35)) {
              const zd = U.rand(4, 15);
              G.Patterns.start('firezone', { x: R1(this.x + ca * zd), z: R1(this.z + sa * zd), r: 1.8, du: 4, d: R1(8 * dk), c: pal.zone });
            }
          }
        }
        if (this.stateT <= 0) this.endAttack(1.6);
      } else if (this.state === 'rain') {
        this.stateT -= dt;
        this.orbitA += this.orbitDir * dt * 0.5;
        this.steer(Math.cos(this.orbitA) * 26 * WS(), Math.sin(this.orbitA) * 26 * WS(), sp, dt);
        this.rainT -= dt;
        if (this.rainT <= 0 && this.rainN < (aw ? 16 : 11) && P) {
          this.rainT = aw ? 0.12 : 0.15;
          this.rainN++;
          const hs = G.Heroes.alive(), h = hs[this.rainN % hs.length] || P;
          // every third rock goes where its target is heading
          const aim = this.rainN % 3 === 0, s = aim ? 0.8 : 7;
          const tx = U.clamp(h.x + (aim ? h.vx * 1.1 : 0) + U.rand(-s, s), -LIM(), LIM()), tz = U.clamp(h.z + (aim ? h.vz * 1.1 : 0) + U.rand(-s, s), -LIM(), LIM());
          G.Patterns.start('boulder', { sx: R1(tx + 10), sz: R1(tz - 6), sy: 32, tx: R1(tx), tz: R1(tz), du: 1.25, h: 0, r: 2.3, d: R1(20 * dk), s: 0.9, c: pal.rock, fz: aw ? 1.8 : 1.4, fzd: R1(8 * dk) });
        }
        if (this.stateT <= 0) this.endAttack(1.5);
      } else if (this.state === 'coil') this.coil(dt, P, sp);
      else if (this.state === 'inferno') this.inferno(dt, sp);
      this.extra = this.breathA || 0;
      for (const h of G.Heroes.list) {
        if (!h.alive) continue;
        if (U.dist(h.x, h.z, this.x, this.z) < 1.9) { h.takeDamage(20 * dk, this.x, this.z); continue; }
        for (const s of this.segs) if (U.dist(h.x, h.z, s.x, s.z) < s.r + 0.45) { h.takeDamage(14 * dk, s.x, s.z); break; }
      }
    }
    // closes in, then circles its target leaving a wall of fire with one gap; the trapped middle bursts
    coil(dt, P, sp) {
      const aw = this.aw, pal = this.pal, dk = this.dk;
      this.stateT -= dt;
      if (this.coilPh === 0) {
        if (!P) { this.endAttack(1.2); return; }
        const R = aw ? 11 : 10, a = Math.atan2(this.z - P.z, this.x - P.x);
        const gx = P.x + Math.cos(a) * R, gz = P.z + Math.sin(a) * R;
        this.steer(gx, gz, sp * 2.1, dt, 5);
        this.coilT += dt;
        if (U.dist(this.x, this.z, gx, gz) < 2.5 || this.coilT > 1.6) {
          this.coilPh = 1; this.coilT = 0; this.coilR = R;
          this.cx = U.clamp(P.x, -LIM(9), LIM(9)); this.cz = U.clamp(P.z, -LIM(9), LIM(9));
          this.coilA = Math.atan2(this.z - this.cz, this.x - this.cx);
          this.coilDir = U.chance(0.5) ? 1 : -1;
          this.coilV = (aw ? 32 : 28) * this.spk;
          this.coilSw = U.TAU - (aw ? 0.65 : 0.8);
          const dur = (R * this.coilSw) / this.coilV;
          G.Patterns.start('firepath', { cx: R1(this.cx), cz: R1(this.cz), r: R, a0: R2(this.coilA), dir: this.coilDir, sw: R2(this.coilSw), v: R1(this.coilV), dl: 0.25, du: aw ? 4.6 : 4, w: 1.25, d: R1(9 * dk), c: pal.trail });
          G.Patterns.start('zone', { x: R1(this.cx), z: R1(this.cz), r: aw ? 5 : 4.5, dl: R2(dur + 0.6), d: R1(26 * dk), c: pal.zone, br: 1 });
          if (!this.coilTold) { this.coilTold = true; G.Net.vis('toast', '불길이 감싸기 전에 틈으로 빠져나가세요', 'warn'); }
        }
      } else if (this.coilPh === 1) {
        this.coilT += dt;
        const w = this.coilV / this.coilR, ang = this.coilA + this.coilDir * w * this.coilT;
        this.x = this.cx + Math.cos(ang) * this.coilR; this.z = this.cz + Math.sin(ang) * this.coilR;
        this.dir = ang + this.coilDir * Math.PI / 2;
        G.World.breakAt(this.x, this.z, 1.6);
        if (w * this.coilT >= this.coilSw) {
          this.coilPh = 2; this.stateT = 0.9;
          const ia = Math.atan2(this.cz - this.z, this.cx - this.x);
          this.dir = ia;
          G.Patterns.start('fan', { x: R1(this.x), z: R1(this.z), y: 1.4, a: R2(ia), n: aw ? 11 : 7, sp: 0.15, v: 12, d: R1(14 * dk), r: 0.45, c: pal.fire, l: 3 });
        }
      } else if (this.stateT <= 0) this.endAttack(1.4);
    }
    // flies to the middle and coils there while rings of eruptions roll outward under a slow spiral of fire
    inferno(dt, sp) {
      const aw = this.aw, pal = this.pal, dk = this.dk;
      this.stateT -= dt;
      if (!this.infSet) {
        this.steer(0, 0, sp * 2, dt, 5);
        if (U.dist(this.x, this.z, 0, 0) < 5 || this.stateT < 4.6) {
          this.infSet = true; this.stateT = 4.4;
          this.infA = Math.atan2(this.z, this.x);
          // rings of eruptions sized to the island, so a wide co-op arena gets the same coverage
          const s = WS(), ring = (d, r, n, a) => [d, R1(r * s), Math.round(n * s), R2(a)];
          const off = Math.random() * U.TAU, rg = [ring(1.0, 7, 7, off), ring(1.9, 14, 11, off + 0.3), ring(2.8, 21, 15, off)];
          if (aw || s > 1.3) rg.push(ring(3.7, 28, 19, off + 0.2));
          G.Patterns.start('erupt', { x: 0, z: 0, r: 2.4, d: R1(22 * dk), c: pal.zone, rg });
          G.Patterns.start('spiral', { x: 0, z: 0, a0: R2(off), ar: aw ? 4 : 3, iv: 0.16, rs: 1.3, rv: aw ? 1 : 0, du: 3.8, v: 8, d: R1(12 * dk), r: 0.42, c: pal.fire });
          G.Net.vis('ring', 0, 0, 1, 10, 0.6, this.color);
          G.Net.vis('shake', 0.4);
        }
      } else {
        this.infA += dt * 2.4;
        const tx = Math.cos(this.infA) * 4, tz = Math.sin(this.infA) * 4;
        this.x = U.damp(this.x, tx, 6, dt); this.z = U.damp(this.z, tz, 6, dt);
        this.dir = this.infA + Math.PI / 2;
        if (this.stateT <= 0) this.endAttack(1.6);
      }
    }
    netState() {
      const a = super.netState();
      a[1] = R2(this.x); a[2] = R2(this.z); a[3] = R2(this.hy); a[4] = R2(this.dir);
      return a;
    }
    follow(dt) {
      if (this.nx == null) return;
      if (U.dist2(this.x, this.z, this.nx, this.nz) > 64) { this.x = this.nx; this.z = this.nz; }
      else { this.x = U.damp(this.x, this.nx, 14, dt); this.z = U.damp(this.z, this.nz, 14, dt); }
      this.hy = U.damp(this.hy, this.ny, 10, dt);
      this.dir = U.dampAngle(this.dir, this.nf, 12, dt);
      this.breathing = !!(this.flags & 8);
      this.breathA = this.extra;
    }
    pose(dt) {
      const t = this.t, br = this.pal.breath;
      if (!this.puppet) {
        const s = this.state;
        const flyY = s === 'diving' ? 1.4 : s === 'coil' ? 1.8 : s === 'inferno' ? 3.4 : 2.6 + Math.sin(t * 2) * 0.4;
        this.hy = U.damp(this.hy, s === 'intro' ? 4 : flyY, 4, dt);
      }
      const pulse = Math.sin(t * 6);
      this.crest.scale.setScalar(1 + pulse * 0.08);
      this.weakMat.opacity = this.alive ? 0.62 + pulse * 0.25 : 0;
      if (this.breathing) {
        for (let k = 0; k < 4; k++) {
          const s = U.rand(10, 22), sa = this.breathA + U.rand(-0.22, 0.22);
          G.FX.P.emit(this.x + Math.cos(this.dir) * 2, 1.4, this.z + Math.sin(this.dir) * 2, Math.cos(sa) * s, U.rand(-0.5, 1.5), Math.sin(sa) * s, 0.6, 0.6, 1.6, br[0], br[1], br[2], 1, 1.5, 0);
        }
      }
      const last = this.trail[this.trail.length - 1];
      if (!last || U.dist(last.x, last.z, this.x, this.z) > 0.3) this.trail.push({ x: this.x, z: this.z, y: this.hy });
      if (this.trail.length > 300) this.trail.shift();
      let idx = this.trail.length - 1, acc = 0;
      let px = this.x, pz = this.z, py = this.hy;
      for (let i = 0; i < this.segs.length; i++) {
        const s = this.segs[i];
        const need = 1.25 * (1.1 - (i / this.segs.length) * 0.4);
        while (idx > 0) {
          const b = this.trail[idx - 1];
          const d = U.dist(px, pz, b.x, b.z);
          if (acc + d >= need) {
            const k = (need - acc) / (d || 1);
            px += (b.x - px) * k; pz += (b.z - pz) * k; py += (b.y - py) * k;
            acc = 0;
            break;
          }
          acc += d; px = b.x; pz = b.z; py = b.y; idx--;
        }
        const wob = Math.sin(t * 6 - i * 0.6) * 0.15;
        s.x = px; s.z = pz; s.y = py + wob;
        s.mesh.position.set(px, py + wob, pz);
        const prev = i === 0 ? this : this.segs[i - 1];
        s.mesh.rotation.y = Math.PI / 2 - Math.atan2(prev.z - pz, prev.x - px);
        s.tg.x = px; s.tg.z = pz; s.tg.y = py - 1;
      }
      this.group.position.set(this.x, this.hy, this.z);
      this.group.rotation.y = Math.PI / 2 - this.dir;
      this.jaw.rotation.x = this.breathing || (this.state === 'breath' && this.puppet) ? 0.6 : 0.05 + Math.sin(t * 3) * 0.05;
      this.headT.x = this.x; this.headT.z = this.z; this.headT.y = this.hy - 1;
      this.y = this.hy - 2;
    }
  }

  // base health, armor (hero curve: 30 / (30 + armor) of each hit gets through), attack damage (dm)
  // and time between attacks (cd). The wyrm's armor stays low because its body already shrugs off 70%.
  // Its damage was 2.5 and is 30% lower now: its fire stays on the ground and stacks with the volleys.
  const DEFS = [
    { cls: Colossus, hp: 5460, armor: 8, dm: 1.3, cd: 0.9 },
    { cls: Seraph, hp: 7800, armor: 10, dm: 1.3, cd: 0.9 },
    { cls: Wyrm, hp: 23750, armor: 10, dm: 1.75, cd: 1 },
  ];

  B.spawn = function (idx, scaleHp = 1, aw = 0) {
    const d = DEFS[idx % DEFS.length];
    const hp = d.hp * scaleHp * (aw ? 2.6 + 0.9 * (aw - 1) : 1);
    const boss = new d.cls(hp, false, aw, d);
    B.active = boss;
    B.targets = boss.targets;
    G.Net.vis('sfx', 'bossRoar');
    G.Net.vis('shake', 0.6);
    G.Net.vis('bossBar', 1, boss.name, B.barSub(boss));
    G.Net.vis('banner', boss.name, aw ? '모든 능력이 크게 올랐습니다' : boss.sub, 'boss');
    return boss;
  };
  B.barSub = (boss) => boss.sub + ' · 방어력 ' + boss.armor + ' (피해 ' + Math.round((1 - 30 / (30 + boss.armor)) * 100) + '% 감소)';
  // co-op client: a look-alike driven by the host's numbers
  B.spawnPuppet = function (kind, maxHp, aw) {
    const d = DEFS[kind % DEFS.length];
    const boss = new d.cls(maxHp, true, aw, d);
    B.active = boss;
    B.targets = boss.targets;
    return boss;
  };
  B.netState = () => (B.active ? B.active.netState() : null);
  B.netApply = function (a, dt) {
    if (!Array.isArray(a)) {
      if (B.active && B.active.puppet) { B.clear(); G.UI.bossBar(false); }
      return;
    }
    const kind = U.num(a[0], 0, 0, 2) | 0, aw = U.num(a[11], 0, 0, 9) | 0;
    if (!B.active || B.active.kind !== kind || B.active.aw !== aw) {
      if (B.active) B.clear();
      const b = B.spawnPuppet(kind, U.num(a[6], 1000, 1, 1e8), aw);
      G.UI.bossBar(true, b.name, B.barSub(b));
    }
    B.active.netApply(a, dt);
  };
  B.update = function (dt) {
    const b = B.active;
    if (!b) return;
    if (b.alive || b.dying || b.puppet) b.update(dt);
    if (B.active === b) { const t0 = b.targets[0]; b.updateAura(t0.x, t0.z, t0.r + 0.6); }
    G.UI.bossHp(b.hp / b.maxHp);
  };
  B.clear = function () {
    if (B.active) {
      B.active.alive = false;
      B.active.remove();
    }
    B.active = null;
    B.targets = [];
  };
})();

// ============================================================
// SHARDFALL - heroes: player characters (solo, co-op host, co-op client), abilities, combat helpers
//   drive 'input' = controlled on this machine, 'net' = follows another player's presence
//   auth  true    = this machine deals the damage (solo / host), false = visuals only (client)
// Skills: every character has three (slot 1 = right click, 2 = Q, 3 = E) and an ultimate (R).
//   A skill's kind decides how it is used: charge (hold, let go), channel (hold to keep it up),
//   aim (cast toward the aim), place (cast at a point), self (cast at once). classes.js says what
//   each one does; this file reads the input, tells the other players and runs it here.
// ============================================================
(() => {
  const G = window.G, U = G.U, I = G.Input;
  const _aim = new THREE.Vector3();
  const PAL = [
    { robe: 0x2f5aa8, cape: 0xd39a35, energy: 0x9fd0ff, css: '#6f9be6', name: '코발트' },
    { robe: 0xa3323f, cape: 0xe6d9bb, energy: 0xff9d8c, css: '#e46b74', name: '루비' },
    { robe: 0x2b7a55, cape: 0xd9b24a, energy: 0x9fe8b8, css: '#6cc596', name: '에메랄드' },
    { robe: 0xb0761d, cape: 0x3559a8, energy: 0xffd27a, css: '#f3c766', name: '호박' },
  ];
  const SPAWN = [[0, 3.2], [3.2, 0], [-3.2, 0], [0, -3.2]];
  const SK = ['', 's1', 's2', 's3'];
  const ULT_BOSS = 0.002; // ultimate charge per point of damage on a boss (kills: game.js)
  G.HERO_PAL = PAL;

  // ================= combat helpers =================
  const C = (G.Combat = {});
  // a boss made of several hit areas (the wyrm's head and body) takes one hit per attack:
  // the best part in reach, so the head wins whenever it is touched
  const partRank = (t) => (t.weak ? 10 : 0) + (t.mult || 1);
  C.forEachTarget = function (x, z, r, fn) {
    G.Enemies.grid.query(x, z, r + 2, (e) => {
      if (e.alive && U.dist2(x, z, e.x, e.z) < (r + e.r) * (r + e.r)) fn(e);
    });
    let best = null, bk = -1;
    for (const t of G.Bosses.targets) {
      if (!t.alive || U.dist2(x, z, t.x, t.z) >= (r + t.r) * (r + t.r)) continue;
      const k = partRank(t);
      if (k > bk) { bk = k; best = t; }
    }
    if (best) fn(best);
  };
  // homing, ricochet and chains lean toward weak points
  C.nearest = function (x, z, maxR, exclude) {
    let best = null, bd = maxR * maxR;
    G.Enemies.grid.query(x, z, maxR, (e) => {
      if (!e.alive || (exclude && exclude.has(e))) return;
      const d = U.dist2(x, z, e.x, e.z);
      if (d < bd) { bd = d; best = e; }
    });
    for (const t of G.Bosses.targets) {
      if (!t.alive || (exclude && exclude.has(t))) continue;
      const d = U.dist2(x, z, t.x, t.z) * (t.weak ? 0.35 : 1);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  };
  // the one place damage is dealt. o: by (hero), canCrit, crit (forced), procs, kx, kz, knock, source, cls
  C.damage = function (t, base, o = {}) {
    if (!t || !t.alive || !G.auth()) return 0;
    const h = o.by || G.Player, s = h.stats;
    let dmg = base;
    if (t.elite || t.isBoss) dmg *= 1 + s.hunter;
    if (s.berserk > 0) dmg *= 1 + s.berserk * (1 - h.hp / s.maxHp);
    if (h.cls) dmg *= G.Classes.dealtMult(h, t, o);
    let crit = o.crit === true;
    if (!crit && o.canCrit !== false && Math.random() < s.crit + (h.cls ? G.Classes.critBonus(h, t) : 0)) crit = true;
    if (crit) dmg *= s.critMult;
    dmg *= U.rand(0.92, 1.08);
    t.lastBy = h;
    if (crit) t.critT = 0.3;
    t.lastDealt = null;
    t.lastResist = false;
    const killed = t.hurt(dmg, o);
    const dealt = t.lastDealt != null ? t.lastDealt : dmg; // after armor and other reductions
    if (o.knock && t.knock) t.knock(o.kx || 0, o.kz || 0, o.knock);
    // blocked by a shield or a hard body part: small grey number and a dull clink
    G.FX.dmgNumber(t.x, (t.y || 0) + (t.h || 1.2), t.z, Math.round(dealt), t.lastResist ? 'resist' : crit ? 'crit' : o.cls || '');
    G.Audio.play(t.lastResist ? 'clink' : crit ? 'crit' : 'hit');
    G.Game.stats.damage += dealt;
    if (t.isBoss && o.source !== 'ult') h.addUlt(dealt * ULT_BOSS * s.ultGain);
    if (h === G.Player && (o.source === 'bolt' || o.source === 'drone' || o.source === 'melee')) G.UI.hitMarker();
    if (h.cls) G.Classes.onHit(h, t, dealt, crit, killed, o);
    if (o.procs) procs(t, dmg, h, killed);
    return dmg;
  };
  function procs(t, dmg, h, killed) {
    const s = h.stats;
    if (s.explode > 0 && Math.random() < 0.12 + 0.08 * s.explode) C.explodeAt(t.x, t.z, 2.6, dmg * 0.9, 0xff8a3a, 0.12, h);
    if (killed) return;
    if (s.burn > 0 && t.applyStatus) t.applyStatus('burn', 4 + 4 * s.burn, 3);
    if (s.frost > 0 && t.applyStatus && Math.random() < 0.2 + 0.1 * s.frost) t.applyStatus('slow', 0.4, 2);
    if (s.chain > 0 && Math.random() < 0.15 + 0.07 * s.chain) C.chain(t, 2 + s.chain, dmg * 0.6, h);
  }
  C.chain = function (from, count, dmg, h) {
    const hit = new Set([from]);
    let cur = from;
    for (let i = 0; i < count; i++) {
      const nx = C.nearest(cur.x, cur.z, 8, hit);
      if (!nx) break;
      hit.add(nx);
      G.Net.vis('link', U.r1(cur.x), U.r1(cur.z), U.r1(nx.x), U.r1(nx.z));
      C.damage(nx, dmg, { canCrit: false, cls: 'chain', source: 'chain', by: h });
      cur = nx;
    }
  };
  C.explodeAt = function (x, z, r, dmg, color = 0xff8a3a, shake = 0.12, h) {
    G.Net.vis('boom', U.r1(x), U.r1(z), U.r1(r), color, shake);
    C.forEachTarget(x, z, r, (t) => {
      const dx = t.x - x, dz = t.z - z, d = Math.hypot(dx, dz) || 1;
      C.damage(t, dmg, { canCrit: false, kx: dx / d, kz: dz / d, knock: 6, source: 'explosion', by: h });
    });
  };
  C.line = function (x, z, ang, len, width, fn) {
    const dx = Math.cos(ang), dz = Math.sin(ang), cx = x + dx * len / 2, cz = z + dz * len / 2, R = len / 2 + width;
    const inLine = (t) => {
      const px = t.x - x, pz = t.z - z, proj = px * dx + pz * dz;
      if (proj < -t.r || proj > len + t.r || Math.abs(px * dz - pz * dx) >= width / 2 + t.r) return null;
      return proj;
    };
    G.Enemies.grid.query(cx, cz, R + 2, (e) => {
      if (!e.alive || U.dist2(cx, cz, e.x, e.z) >= (R + e.r) * (R + e.r)) return;
      const p = inLine(e);
      if (p != null) fn(e, p);
    });
    // a beam down the wyrm's spine still counts as one hit, on the best part it crosses
    let best = null, bp = 0, bk = -1;
    for (const t of G.Bosses.targets) {
      if (!t.alive) continue;
      const p = inLine(t);
      if (p == null) continue;
      const k = partRank(t);
      if (k > bk) { bk = k; best = t; bp = p; }
    }
    if (best) fn(best, bp);
  };

  // ================= hero registry =================
  const HS = (G.Heroes = { list: [], lights: [], zones: [] });
  HS.init = function (scene) {
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 9, 2);
      l.position.set(0, -60, 0);
      scene.add(l);
      HS.lights.push({ light: l, used: false });
    }
    HS.orbGeo = new THREE.IcosahedronGeometry(0.17, 1);
    HS.ringGeo = new THREE.RingGeometry(0.75, 0.86, 40, 1, 0, Math.PI * 1.6).rotateX(-Math.PI / 2);
    HS.bladeGeo = new THREE.OctahedronGeometry(0.28, 0).scale(0.5, 0.35, 2.0);
    HS.droneGeo = new THREE.OctahedronGeometry(0.26, 0);
    HS.droneRingGeo = new THREE.TorusGeometry(0.36, 0.03, 6, 20);
  };
  HS.takeLight = () => { const s = HS.lights.find((q) => !q.used); if (s) s.used = true; return s; };
  HS.add = function (key, o) { const h = new Hero(key, o); HS.list.push(h); return h; };
  HS.remove = function (h) { const i = HS.list.indexOf(h); if (i >= 0) HS.list.splice(i, 1); h.dispose(); };
  HS.clearOthers = function () { for (const h of HS.list.slice()) if (h !== G.Player) HS.remove(h); };
  HS.get = (key) => HS.list.find((h) => h.key === key) || null;
  HS.alive = () => HS.list.filter((h) => h.alive);
  HS.anyAlive = () => HS.list.some((h) => h.alive);
  // what a monster can see: a hero hidden in the shadows doesn't count
  HS.nearest = function (x, z, maxR = 1e9) {
    let best = null, bd = maxR * maxR;
    for (const h of HS.list) {
      if (!h.alive || h.stealthT > 0 || G.Classes.immune(h)) continue;
      const d = U.dist2(x, z, h.x, h.z);
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  };
  HS.damageCircle = function (x, z, r, dmg, sx, sz) {
    let any = false;
    for (const h of HS.list) {
      if (h.alive && U.dist2(h.x, h.z, x, z) < (r + 0.45) * (r + 0.45)) any = h.takeDamage(dmg, sx == null ? x : sx, sz == null ? z : sz) || any;
    }
    return any;
  };
  HS.chronoNear = function (x, z) {
    for (const h of HS.list) if (h.alive && h.stats.chrono && U.dist2(h.x, h.z, x, z) < 49) return true;
    return false;
  };
  HS.update = function (dt, t) {
    for (const h of HS.list) h.update(dt, t);
    G.Classes.update(dt);
    // burning ground left by meteors (damage only on the authoritative machine)
    for (let i = HS.zones.length - 1; i >= 0; i--) {
      const zn = HS.zones[i];
      zn.t -= dt; zn.tick -= dt;
      if (zn.tick <= 0) {
        zn.tick = 0.4;
        C.forEachTarget(zn.x, zn.z, zn.r, (tg) => C.damage(tg, 10 * zn.by.stats.meteorMult * zn.by.stats.dmgMult, { canCrit: false, source: 'zone', cls: 'burn', by: zn.by }));
      }
      if (zn.t <= 0) HS.zones.splice(i, 1);
    }
  };

  // ================= hero =================
  const NOMOD = {};
  class Hero {
    static baseStats() {
      return {
        maxHp: 100, regen: 0, armor: 0, speed: 7.4, dmg: 13, dmgMult: 1, fireRate: 4.6, projSpeed: 34, projLife: 0.72, projSize: 1,
        projCount: 1, pierce: 0, crit: 0.06, critMult: 2, dashCharges: 1, dashCd: 1.5, pickup: 3.2, xpMult: 1, cdMult: 1,
        lifestealKill: 0, burn: 0, frost: 0, chain: 0, explode: 0, homing: 0, ricochet: 0, blades: 0, drones: 0, thorns: 0,
        hunter: 0, berserk: 0, blinkNova: 0, meteorMult: 1, meteorRadius: 1, novaCdMult: 1, freezeDur: 1.3, lanceMult: 1,
        lanceWidth: 1, ultGain: 1, echo: 0, phoenix: 0, chrono: 0, storm: 0, avatar: 0, luck: 0, rerolls: 2, startBonus: 0,
      };
    }

    constructor(key, o = {}) {
      this.key = key;
      this.name = o.name || '';
      this.local = !!o.local;
      this.drive = o.drive || (this.local ? 'input' : 'net');
      this.auth = o.auth !== false;
      this.slot = o.slot || 0;
      this.forge = o.forge != null ? String(o.forge) : G.Upgrades.forgeCode();
      this.colorIdx = (((o.color | 0) % PAL.length) + PAL.length) % PAL.length;
      this.pal = PAL[this.colorIdx];
      // the character (class): solo is always the shard mage; the player's colour stays on the clothes
      this.cls = G.Classes.get(o.cls);
      this.energy = this.cls.energy || this.pal.energy;
      this.lightSlot = HS.takeLight();
      this.build();
      this.reset();
    }

    build() {
      const scene = G.Render.scene, c = this.cls, bare = c.bare || [];
      const g = (this.group = new THREE.Group());
      const body = (this.body = new THREE.Group());
      g.add(body);
      const robeM = new THREE.MeshStandardMaterial({ color: this.pal.robe, roughness: 0.62, metalness: 0.08, side: THREE.DoubleSide });
      const steelM = new THREE.MeshStandardMaterial({ color: 0xc4c8d4, roughness: 0.38, metalness: 0.7 });
      const goldM = new THREE.MeshStandardMaterial({ color: 0xd6a94e, roughness: 0.32, metalness: 0.8 });
      const darkM = new THREE.MeshStandardMaterial({ color: 0x1a1714, roughness: 0.6 });
      const capeM = new THREE.MeshStandardMaterial({ color: this.pal.cape, roughness: 0.75, side: THREE.DoubleSide });
      this.mats = [robeM, steelM, goldM, darkM, capeM];
      for (const m of this.mats) U.addRim(m, 0xfff0d0, 0.45, 2.4);
      this.glowM = new THREE.MeshBasicMaterial({ color: U.hdr(this.energy, 3) });
      this.geos = [];
      this.parts = {};
      const add = (geo, mat, x, y, z) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, z);
        m.castShadow = true;
        body.add(m);
        this.geos.push(geo);
        return m;
      };
      add(new THREE.ConeGeometry(0.6, 1.25, 12, 1, true), robeM, 0, 0.62, 0);
      add(new THREE.CylinderGeometry(0.62, 0.62, 0.08, 12), goldM, 0, 0.04, 0);
      add(new THREE.CapsuleGeometry(0.3, 0.42, 4, 10), steelM, 0, 1.28, 0);
      add(new THREE.TorusGeometry(0.31, 0.05, 6, 16), goldM, 0, 1.06, 0).rotation.x = Math.PI / 2;
      add(new THREE.SphereGeometry(0.25, 14, 10), darkM, 0, 1.78, 0);
      add(new THREE.BoxGeometry(0.34, 0.06, 0.1), this.glowM, 0, 1.78, -0.21);
      if (!bare.includes('shoulders')) for (const sx of [-1, 1]) add(new THREE.SphereGeometry(0.19, 10, 8), goldM, sx * 0.36, 1.52, 0).scale.set(1.1, 0.7, 1.1);
      const capeGeo = new THREE.PlaneGeometry(0.75, 1.2, 1, 4);
      capeGeo.translate(0, -0.45, 0);
      this.cape = add(capeGeo, capeM, 0, 1.5, 0.26);
      // what makes each character recognisable: the mage's hat, the knight's helm and shield, ...
      if (c.model) c.model(this, add, { robe: robeM, steel: steelM, gold: goldM, dark: darkM, cape: capeM, glow: this.glowM });
      else add(new THREE.ConeGeometry(0.3, 0.5, 12), robeM, 0, 1.98, 0.04);
      this.orb = new THREE.Mesh(HS.orbGeo, this.glowM);
      this.orb.visible = c.orb !== false;
      g.add(this.orb);
      this.ringM = new THREE.MeshBasicMaterial({ color: U.hdr(this.pal.energy, 1.3), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
      this.ring = new THREE.Mesh(HS.ringGeo, this.ringM);
      this.ring.position.y = 0.06;
      g.add(this.ring);
      // co-op: a glass bubble while this hero chooses a card (the fight doesn't stop for it)
      this.bubbleM = new THREE.MeshBasicMaterial({ color: U.hdr(this.pal.energy, 1.1), transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false });
      this.bubble = new THREE.Mesh(HS.bubbleGeo || (HS.bubbleGeo = new THREE.IcosahedronGeometry(1.25, 2)), this.bubbleM);
      this.bubble.position.y = 1.0;
      this.bubble.visible = false;
      g.add(this.bubble);
      // the cleric's holy shield, on whoever carries one
      this.shieldM = new THREE.MeshBasicMaterial({ color: U.hdr(0xffe6a0, 1.3), transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false });
      this.shieldB = new THREE.Mesh(HS.bubbleGeo, this.shieldM);
      this.shieldB.position.y = 1.0;
      this.shieldB.scale.setScalar(1.12);
      this.shieldB.visible = false;
      g.add(this.shieldB);
      this.baseScale = 1.22 * (c.size || 1);
      g.scale.setScalar(this.baseScale);
      scene.add(g);
      if (this.local) {
        this.aimLine = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, -0.5),
          new THREE.MeshBasicMaterial({ color: U.hdr(this.energy, 1.8), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
        // a beam goes through pillars, rocks and hills, so its range line is drawn through them too
        this.aimLine.renderOrder = 6;
        this.aimLine.visible = false;
        scene.add(this.aimLine);
      }
      this.bladeMat = new THREE.MeshBasicMaterial({ color: U.hdr(this.energy, 2.6) });
      this.droneMat = new THREE.MeshStandardMaterial({ color: this.pal.cape, emissive: this.energy, emissiveIntensity: 0.9, metalness: 0.5, roughness: 0.35, flatShading: true });
      this.blades = [];
      this.drones = [];
    }

    reset() {
      const s = (this.stats = Hero.baseStats());
      if (this.cls.stats) this.cls.stats(s); // the character's own body and weapon, then the forge on top
      G.Upgrades.applyForge(s, this.forge);
      G.Classes.resetHero(this);
      this.up = { levels: {}, order: [] };
      this.picks = '';
      this.netPicks = 0;
      const sp = SPAWN[this.slot % SPAWN.length];
      this.x = sp[0]; this.z = sp[1]; this.y = G.World.heightAt(this.x, this.z);
      this.vx = 0; this.vz = 0; this.moveX = 0; this.moveZ = 0;
      this.facing = -Math.PI / 2; this.aimX = this.x; this.aimZ = this.z - 5;
      this.hp = s.maxHp; this.maxHp = s.maxHp; this.alive = true;
      this.invuln = 1.0; this.hurtFlash = 0; this.dashT = 0; this.dashCharges = s.dashCharges; this.dashRecharge = 0; this.dashDir = { x: 0, z: -1 };
      this.fireT = 0; this.lanceCharge = 0; this.lastLc = 0; this.charging = false; this.chgSlot = 0; this.firing = false;
      this.chan = 0; this.chanT = 0; this.leap = null; this.hop = 0; this.leapVis = false; this.leapVisT = 0; this.stealthVis = false;
      this.cd = { s1: 0, s2: 0, s3: 0 };
      this.ult = 0; this.ultT = 0; this.ultTick = 0; this.ultReq = 0;
      this.bladeA = Math.random() * 6; this.stormT = 0; this.heartT = 0;
      this.echoQ = [];
      this.rerolls = s.rerolls;
      this.seq = { s1: 0, s2: 0, s3: 0, us: 0 };
      this.ca = [null, [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
      // every run starts every counter at zero (presences from an older run are never applied)
      this.seen = { s1: 0, s2: 0, s3: 0, us: 0 };
      this.net = null;
      this.rv = 0; this.rvh = 0;
      this.lastOp = 1;
      this.stopLanceSound();
      this.syncOrbiters();
      this.group.visible = true;
      this.group.scale.setScalar(this.baseScale);
    }

    // ---------------- health ----------------
    // by: the hero doing the healing (a cleric charges its ultimate by mending others)
    heal(n, silent, by) {
      if (!this.alive || !this.auth) return 0;
      const before = this.hp;
      this.hp = Math.min(this.stats.maxHp, this.hp + n);
      const d = this.hp - before;
      if (d >= 1 && !silent) G.Net.vis('heal', U.r1(this.x), U.r1(this.z), Math.round(d));
      if (d > 0 && by && by !== this && by.cls.healUlt) by.addUlt(d * by.cls.healUlt);
      return d;
    }
    addUlt(n) {
      if (!this.auth || this.ultT > 0) return;
      const before = this.ult;
      this.ult = Math.min(100, this.ult + n);
      if (before < 100 && this.ult >= 100 && this === G.Player) { G.UI.toast(this.cls.ult.name + ' 준비됨 · R', 'gold'); G.Audio.play('chest'); }
    }
    takeDamage(amount, sx, sz) {
      if (!this.auth || !this.alive || this.invuln > 0 || this.dashT > 0 || this.leap || (this.ultT > 0 && this.stats.avatar) || G.Classes.immune(this)) return false;
      const s = this.stats;
      let dmg = amount * (30 / (30 + s.armor)) * G.Game.diffDamage() * G.Classes.takenMult(this, sx, sz, amount);
      dmg = G.Classes.absorb(this, dmg);
      if (dmg <= 0.5) {
        // all of it on the holy shield
        this.invuln = 0.3;
        G.FX.burst(this.x, this.y + 1.1, this.z, { count: 8, color: 0xffe6a0, intensity: 2.2, speed: [2, 5], life: [0.15, 0.3], size: [0.3, 0.02] });
        if (this === G.Player) G.Audio.play('clink');
        return true;
      }
      this.hp -= dmg;
      if (this.hp < 1 && G.Classes.undying(this)) this.hp = 1; // the berserker's frenzy
      this.invuln = 0.55; this.hurtFlash = 1;
      if (this === G.Player) { G.Render.hurt(0.75); G.Render.shake(0.32); G.Audio.play('hurt'); }
      G.FX.dmgNumber(this.x, this.y + 1.8, this.z, '-' + Math.round(dmg), this === G.Player ? 'player' : 'ally');
      G.FX.burst(this.x, this.y + 1, this.z, { count: 12, color: 0xe0384f, intensity: 2.2, speed: [2, 6], life: [0.2, 0.45], size: [0.35, 0.03], drag: 3 });
      G.Game.stats.taken += this === G.Player ? dmg : 0;
      if (s.thorns > 0) {
        G.Net.vis('ring', U.r1(this.x), U.r1(this.z), 0.5, 4.2, 0.3, 0x7cff8a);
        C.forEachTarget(this.x, this.z, 4.2, (t) => {
          const dx = t.x - this.x, dz = t.z - this.z, d = Math.hypot(dx, dz) || 1;
          C.damage(t, 18 * s.thorns * s.dmgMult, { canCrit: false, kx: dx / d, kz: dz / d, knock: 7, source: 'thorns', by: this });
        });
      }
      if (sx !== undefined && this.drive === 'input' && this.chan === 0) {
        const dx = this.x - sx, dz = this.z - sz, d = Math.hypot(dx, dz) || 1;
        this.vx += (dx / d) * 9; this.vz += (dz / d) * 9;
      }
      if (this.hp <= 0) {
        if (s.phoenix > 0) {
          s.phoenix--;
          this.hp = s.maxHp * 0.6; this.invuln = 2.2;
          G.Net.vis('phoenix', U.r1(this.x), U.r1(this.z), this.key);
          C.forEachTarget(this.x, this.z, 7, (t) => C.damage(t, 80 * s.dmgMult, { canCrit: false, knock: 14, kx: t.x - this.x, kz: t.z - this.z, by: this }));
        } else this.die();
      }
      return true;
    }
    die() {
      this.hp = 0;
      this.alive = false;
      G.Net.vis('heroDie', U.r1(this.x), U.r1(this.z), this.colorIdx);
      this.hideBody();
      G.Game.onHeroDeath(this);
    }
    hideBody() {
      this.group.visible = false;
      if (this.aimLine) this.aimLine.visible = false;
      this.charging = false;
      this.firing = false;
      if (this.chan) this.endChannel(true);
      this.leap = null;
      this.stopLanceSound();
      this.setOrbitersVisible(false);
      this.lightOff();
    }
    // here: stand up where they fell (the cleric's hymn) instead of by the altar
    revive(frac, here) {
      this.alive = true;
      this.hp = Math.max(1, this.stats.maxHp * frac);
      this.invuln = 2.5;
      this.rv++;
      this.rvh = here ? 1 : 0;
      const sp = SPAWN[this.slot % SPAWN.length];
      if (this.drive === 'input' && !here) { this.x = sp[0]; this.z = sp[1]; this.vx = this.vz = 0; }
      this.group.visible = true;
      const px = this.drive === 'input' && !here ? sp[0] : this.x, pz = this.drive === 'input' && !here ? sp[1] : this.z;
      G.Net.vis('pillar', U.r1(px), U.r1(pz), this.pal.energy);
    }

    // ---------------- orbiters ----------------
    syncOrbiters() {
      const s = this.stats, scene = G.Render.scene;
      while (this.blades.length < s.blades) {
        const m = new THREE.Mesh(HS.bladeGeo, this.bladeMat);
        scene.add(m);
        this.blades.push(m);
      }
      while (this.blades.length > s.blades) scene.remove(this.blades.pop());
      while (this.drones.length < s.drones) {
        const m = new THREE.Mesh(HS.droneGeo, this.droneMat);
        m.castShadow = true;
        const ring = new THREE.Mesh(HS.droneRingGeo, this.bladeMat);
        ring.rotation.x = Math.PI / 2;
        m.add(ring);
        scene.add(m);
        this.drones.push({ mesh: m, t: Math.random() * 0.7, x: this.x, z: this.z });
      }
      while (this.drones.length > s.drones) scene.remove(this.drones.pop().mesh);
      if (this.alive) this.setOrbitersVisible(true);
    }
    setOrbitersVisible(v) {
      for (const b of this.blades) b.visible = v;
      for (const d of this.drones) d.mesh.visible = v;
    }

    // ---------------- basic attack ----------------
    // returns false when the weapon can't fire yet (the gunslinger reloading)
    fire(extra = 0) {
      const c = this.cls, b = c.basic;
      if (c.canFire && !c.canFire(this)) return false;
      if (b.melee) { G.Classes.swing(this); if (this.stats.echo && Math.random() < this.stats.echo) this.echoQ.push(0.12); return true; }
      const s = this.stats, mod = (c.fireMod && c.fireMod(this)) || NOMOD, shot = (c.onShot && c.onShot(this)) || NOMOD;
      const n = s.projCount + extra + (mod.more || 0);
      const ox = this.x + Math.cos(this.facing + 0.55) * 0.67, oz = this.z + Math.sin(this.facing + 0.55) * 0.67;
      const base = Math.atan2(this.aimZ - oz, this.aimX - ox);
      const col = shot.color || mod.color || this.energy, spread = b.spread || 0.12;
      for (let i = 0; i < n; i++) {
        const a = base + (i - (n - 1) / 2) * spread + U.rand(-0.02, 0.02);
        G.Proj.spawnPlayer({ x: ox, z: oz, y: this.y + 1.4, angle: a, speed: s.projSpeed, life: s.projLife, dmg: s.dmg * s.dmgMult * (mod.dmgK || 1) * (shot.dmgK || 1),
          size: s.projSize * (mod.sizeK || 1), pierce: s.pierce, ricochet: s.ricochet, homing: s.homing + (mod.homing || 0), boom: mod.boom || 0, crit: !!shot.crit,
          knock: b.knock, color: col, source: 'bolt', procs: true, by: this, cos: !this.auth });
      }
      G.FX.burst(ox, this.y + 1.4, oz, { count: 3, color: col, intensity: 2.4, speed: [2, 5], life: [0.08, 0.15], size: [0.28, 0.02], dir: { x: Math.cos(base), y: 0, z: Math.sin(base) }, cone: 0.5 });
      if (this === G.Player) { G.Audio.play(b.sfx || 'shoot', { pitch: this.ultT > 0 ? 1.25 : 1 }); G.UI.fireKick(); }
      if (s.echo && Math.random() < s.echo) this.echoQ.push(0.09);
      return true;
    }

    // ---------------- the shard mage's own skills ----------------
    fireLance(ch) {
      const s = this.stats;
      const width = (1.1 + ch * 1.0) * s.lanceWidth, len = 28, a = this.facing;
      G.Net.visBy(this.key, 'lance', U.r1(this.x), U.r1(this.z), U.r2(a), U.r2(width), ch > 0.95 ? 1 : 0, this.colorIdx, this.key);
      if (this.auth) {
        const dmg = (38 + 150 * ch) * s.lanceMult * s.dmgMult;
        C.line(this.x, this.z, a, len, width, (t) => {
          C.damage(t, dmg, { kx: Math.cos(a), kz: Math.sin(a), knock: 6 + ch * 10, source: 'lance', procs: ch > 0.95, by: this });
          G.FX.spark(t.x, 1.2, t.z, 0xfff1d0, 8, 9);
        });
        if (ch > 0.95 && this === G.Player) G.Game.hitstop(0.05);
      }
      if (this.drive === 'input') { this.vx -= Math.cos(a) * (4 + ch * 6); this.vz -= Math.sin(a) * (4 + ch * 6); }
    }
    nova() {
      const s = this.stats;
      G.Net.visBy(this.key, 'nova', U.r1(this.x), U.r1(this.z), this.key);
      if (this.auth) {
        C.forEachTarget(this.x, this.z, 7.5, (t) => {
          const dx = t.x - this.x, dz = t.z - this.z, d = Math.hypot(dx, dz) || 1;
          C.damage(t, 30 * s.dmgMult, { kx: dx / d, kz: dz / d, knock: 12, source: 'nova', by: this });
          if (t.applyStatus) t.applyStatus('freeze', 1, s.freezeDur);
        });
      }
    }
    castMeteor(tx, tz) {
      const s = this.stats;
      const lim = G.World.ARENA_R + 3;
      tx = U.clamp(tx, -lim, lim); tz = U.clamp(tz, -lim, lim);
      const r = 5 * s.meteorRadius;
      G.Net.vis('meteor', U.r1(tx), U.r1(tz), U.r1(r));
      G.Enemies.later(0.7, () => {
        if (!G.auth()) return;
        C.forEachTarget(tx, tz, r, (t) => {
          const dx = t.x - tx, dz = t.z - tz, dd = Math.hypot(dx, dz) || 1;
          C.damage(t, 120 * s.meteorMult * s.dmgMult * (1 - 0.5 * Math.min(1, dd / r)), { kx: dx / dd, kz: dz / dd, knock: 14, source: 'meteor', by: this });
        });
        if (this === G.Player) G.Game.hitstop(0.06);
        HS.zones.push({ x: tx, z: tz, r: r * 0.75, t: 3, tick: 0, by: this });
      });
    }

    // ---------------- skills, whatever the character ----------------
    skillCd(i) {
      const s = this.stats, sk = this.cls.skills[i - 1];
      return sk.cd * s.cdMult * (i === 2 ? s.novaCdMult : 1);
    }
    // run a skill on this machine (the caster's, and the host's for everyone's damage)
    useSkill(i, a) {
      const sk = this.cls.skills[i - 1];
      this.cd[SK[i]] = this.skillCd(i);
      if (sk.use) sk.use(this, a);
      if (this.cls.onSkill) this.cls.onSkill(this, i);
    }
    // the caster decided: run it here, then count it for the other players (with whatever the
    // skill worked out, like where a blink landed)
    castSkill(i, a) {
      a.q = ++this.seq[SK[i]];
      this.useSkill(i, a);
      this.ca[i] = [U.r2(a.ang || 0), U.r1(a.x || 0), U.r1(a.z || 0), U.r2(a.ch || 0)];
    }
    startChannel(i) { this.chan = i; this.chanT = 0; G.Classes.chanStart(this, i); }
    endChannel(cancel) {
      const i = this.chan;
      if (!i) return;
      this.chan = 0;
      G.Classes.chanEnd(this, i, !!cancel);
      this.cd[SK[i]] = this.skillCd(i);
    }
    ultStart() {
      const s = this.stats, c = this.cls;
      this.ult = 0;
      this.ultT = (c.ultDur || Hero.ULT_TIME) + (s.avatar ? 2 : 0);
      this.ultTick = 0;
      if (c.ultStart) c.ultStart(this);
    }
    startDash(ix, iz) {
      let dx = ix, dz = iz;
      if (!dx && !dz) { dx = Math.cos(this.facing); dz = Math.sin(this.facing); }
      const l = Math.hypot(dx, dz) || 1;
      this.dashDir = { x: dx / l, z: dz / l };
      this.dashT = 0.17;
      this.invuln = Math.max(this.invuln, 0.27);
      this.dashCharges--;
      G.Audio.play('dash');
      G.FX.ring(this.x, this.y + 0.15, this.z, 0.4, 2, 0.25, this.energy, 1.8);
    }
    stopLanceSound() { if (this.lanceSound) { this.lanceSound.stop(); this.lanceSound = null; } }

    // ---------------- control ----------------
    controlInput(dt) {
      const s = this.stats, m = I.mouse;
      const locked = G.Game.controlsLocked();
      // phones aim with a thumb stick; desktops aim at the mouse
      const T = G.Touch && G.Touch.on ? G.Touch : null;
      let wantFire;
      if (T) wantFire = T.steer(this);
      else {
        G.Render.screenToGround(m.nx, m.ny, this.y + 1.4, _aim);
        this.aimX = _aim.x; this.aimZ = _aim.z;
        wantFire = m.left;
      }
      if (!this.leap) this.facing = U.dampAngle(this.facing, Math.atan2(this.aimZ - this.z, this.aimX - this.x), 22, dt);
      let ix = 0, iz = 0;
      if (!locked) {
        if (T) { const k = T.walk(); ix = T.mx * k; iz = T.mz * k; }
        else {
          if (I.isDown('KeyW', 'ArrowUp')) iz -= 1;
          if (I.isDown('KeyS', 'ArrowDown')) iz += 1;
          if (I.isDown('KeyA', 'ArrowLeft')) ix -= 1;
          if (I.isDown('KeyD', 'ArrowRight')) ix += 1;
        }
      }
      // keys give 1 or a diagonal of 1.41; a thumb is already within 1 and keeps its partial push
      const il = Math.hypot(ix, iz);
      if (il > 1) { ix /= il; iz /= il; }
      this.moving = il > 0.01;
      this.moveX = ix; this.moveZ = iz;
      const spd = s.speed * G.Classes.moveK(this);
      if (this.leap) {
        // the berserker's jump: straight to the chosen spot, over everything
        const L = this.leap;
        L.t += dt;
        const k = Math.min(1, L.t / L.dur);
        this.x = U.lerp(L.x0, L.x1, k); this.z = U.lerp(L.z0, L.z1, k);
        this.hop = Math.sin(k * Math.PI) * 3.2;
        this.vx = 0; this.vz = 0;
        if (Math.random() < 0.7) G.FX.trail(this.x + U.rand(-0.4, 0.4), this.y + this.hop + U.rand(0.4, 1.8), this.z + U.rand(-0.4, 0.4), this.energy, 0.55, 0.3, 1.8);
        if (k >= 1) { this.leap = null; this.hop = 0; }
      } else if (this.dashT > 0) {
        this.dashT -= dt;
        this.vx = this.dashDir.x * 46; this.vz = this.dashDir.z * 46;
        for (let k = 0; k < 3; k++) G.FX.trail(this.x + U.rand(-0.3, 0.3), this.y + U.rand(0.4, 1.8), this.z + U.rand(-0.3, 0.3), this.energy, 0.55, 0.3, 1.8);
        if (this.dashT <= 0) {
          this.vx *= 0.25; this.vz *= 0.25;
          if (s.blinkNova > 0) {
            G.Net.vis('ring', U.r1(this.x), U.r1(this.z), 0.4, 4.5, 0.3, this.energy);
            G.Audio.play('blade');
            if (this.auth) C.forEachTarget(this.x, this.z, 4.5, (tg) => C.damage(tg, 25 * s.blinkNova * s.dmgMult, { kx: tg.x - this.x, kz: tg.z - this.z, knock: 10, source: 'blink', by: this }));
          }
        }
      } else {
        this.vx = U.damp(this.vx, ix * spd, 13, dt);
        this.vz = U.damp(this.vz, iz * spd, 13, dt);
      }
      if (!this.leap) { this.x += this.vx * dt; this.z += this.vz * dt; }
      G.World.resolve(this, 0.55);
      this.y = G.World.heightAt(this.x, this.z);
      if (this.dashCharges < s.dashCharges) {
        this.dashRecharge += dt;
        if (this.dashRecharge >= s.dashCd) { this.dashRecharge = 0; this.dashCharges++; }
      } else this.dashRecharge = 0;

      if (locked) {
        this.firing = false;
        if (this.charging) { this.charging = false; this.stopLanceSound(); }
        if (this.chan) this.endChannel(true);
        if (this.aimLine) this.aimLine.visible = false;
        if (T) T.drop();
        return;
      }
      if (I.wasPressed('Space', 'ShiftLeft', 'ShiftRight') && this.dashCharges > 0 && this.dashT <= 0 && !this.leap) this.startDash(ix, iz);
      if (!this.leap) for (let i = 1; i <= 3; i++) this.skillInput(i, T, m, dt);
      if (I.wasPressed('KeyR') && this.ult >= 100 && this.ultT <= 0 && performance.now() - this.ultReq > 600) {
        this.seq.us++;
        this.ultReq = performance.now();
        if (this.auth) this.ultStart();
      }
      this.firing = wantFire && !this.charging && !this.chan && !this.leap;
      this.drawAimLine(T);
    }
    // one skill slot: hold, release, or a single press, as its kind wants
    skillInput(i, T, m, dt) {
      const sk = this.cls.skills[i - 1], kind = sk.kind, k = SK[i], ready = this.cd[k] <= 0;
      const held = T ? T.held(i) : i === 1 ? m.right : I.isDown(i === 2 ? 'KeyQ' : 'KeyE');
      if (kind === 'charge') {
        if (held && ready && !this.chan && (!this.charging || this.chgSlot === i)) {
          if (!this.charging) { this.charging = true; this.chgSlot = i; this.lanceCharge = 0; this.lanceSound = G.Audio.loop(); }
          this.lanceCharge = Math.min(1, this.lanceCharge + dt / (sk.chargeTime || 1.1));
          if (this.lanceSound) this.lanceSound.set(this.lanceCharge);
          if (Math.random() < 0.6) {
            const a = Math.random() * U.TAU, ox = this.x + Math.cos(this.facing) * 0.9, oz = this.z + Math.sin(this.facing) * 0.9;
            const c = new THREE.Color(this.energy);
            G.FX.P.emit(ox + Math.cos(a) * 1.2, this.y + 1.4, oz + Math.sin(a) * 1.2, -Math.cos(a) * 4, 0, -Math.sin(a) * 4, 0.28, 0.3, 0.05, c.r * 2.4, c.g * 2.4, c.b * 2.4, 1, 0, 0);
          }
        }
        if (this.charging && this.chgSlot === i && (!held || !ready)) {
          this.charging = false;
          this.stopLanceSound();
          if (ready) {
            // a phone fires exactly where the skill thumb last pointed, not toward the walking thumb
            const fd = T && T.takeDir(i);
            if (fd) this.facing = Math.atan2(fd[1], fd[0]);
            this.lastLc = this.lanceCharge;
            this.castSkill(i, { ang: this.facing, x: this.x, z: this.z, ch: this.lanceCharge });
          }
        }
        return;
      }
      if (kind === 'channel') {
        if (this.chan === i) {
          this.chanT += dt;
          if (!held || this.chanT >= (sk.max || 3)) this.endChannel(false);
        } else if (held && ready && !this.chan && !this.charging) this.startChannel(i);
        return;
      }
      // aim / place / self: one press (a phone hands over a finished gesture)
      let a = null;
      if (T) { const r = T.take(i); if (r) a = this.touchArgs(sk, r); }
      else if (i === 1 ? m.rightPressed : I.wasPressed(i === 2 ? 'KeyQ' : 'KeyE')) a = this.mouseArgs(sk);
      if (!a) return;
      if (ready && !this.chan && !this.charging) this.castSkill(i, a);
      else if (!ready && this === G.Player) G.Audio.play('hover');
    }
    // the cursor: its direction, or its spot (no further than the skill reaches)
    mouseArgs(sk) {
      let ang = Math.atan2(this.aimZ - this.z, this.aimX - this.x), x = this.aimX, z = this.aimZ;
      if (sk.dir === 'move' && this.moving) ang = Math.atan2(this.moveZ, this.moveX);
      if (sk.kind === 'self') return { ang: this.facing, x: this.x, z: this.z };
      const R = sk.range || 20, d = U.dist(this.x, this.z, x, z);
      if (d > R) { x = this.x + Math.cos(ang) * R; z = this.z + Math.sin(ang) * R; }
      return { ang, x, z };
    }
    // a phone gesture: { x, z } for a spot, { ang, k } for a direction (k: how far the thumb went)
    touchArgs(sk, r) {
      if (sk.kind === 'self') return { ang: this.facing, x: this.x, z: this.z };
      if (sk.kind === 'place') {
        if (r.x == null) return null;
        return { ang: Math.atan2(r.z - this.z, r.x - this.x), x: r.x, z: r.z };
      }
      let ang = r.ang != null ? r.ang : this.facing;
      if (sk.dir === 'move' && r.ang == null && this.moving) ang = Math.atan2(this.moveZ, this.moveX);
      const d = (sk.range || 14) * U.clamp(r.k != null ? r.k : 1, 0.25, 1);
      return { ang, x: this.x + Math.cos(ang) * d, z: this.z + Math.sin(ang) * d };
    }
    // the range line of whatever is being charged, channelled or (on a phone) dragged
    drawAimLine(T) {
      if (!this.aimLine) return;
      let i = this.charging ? this.chgSlot : this.chan;
      let ang = this.facing;
      if (!i && T) { const d = T.dragging(); if (d) { i = d.i; ang = Math.atan2(d.dir[1], d.dir[0]); } }
      const sk = i ? this.cls.skills[i - 1] : null;
      const show = !!(sk && sk.line);
      this.aimLine.visible = show;
      if (!show) return;
      const am = sk.line(this.charging ? this.lanceCharge : 1, this.stats);
      this.aimLine.position.set(this.x, this.y + 0.12, this.z);
      this.aimLine.rotation.y = -ang - Math.PI / 2;
      this.aimLine.scale.set(am.w, 1, am.len);
      this.aimLine.material.opacity = this.charging ? 0.15 + this.lanceCharge * 0.35 : 0.22;
    }
    controlNet(dt) {
      const n = this.net;
      if (!n) return;
      const px = this.x, pz = this.z;
      if (U.dist2(this.x, this.z, n.x, n.z) > 64) { this.x = n.x; this.z = n.z; }
      else { this.x = U.damp(this.x, n.x, 14, dt); this.z = U.damp(this.z, n.z, 14, dt); }
      this.vx = (this.x - px) / Math.max(dt, 1e-3);
      this.vz = (this.z - pz) / Math.max(dt, 1e-3);
      this.moving = Math.hypot(this.vx, this.vz) > 0.8;
      this.y = G.World.heightAt(this.x, this.z);
      this.facing = U.dampAngle(this.facing, n.f, 16, dt);
      this.aimX = n.ax; this.aimZ = n.az;
      this.charging = !!(n.fl & 2);
      this.chgSlot = this.charging ? n.cs : 0;
      this.lanceCharge = this.charging ? n.lc : 0;
      this.stealthVis = !!(n.fl & 8);
      this.leapVis = !!(n.fl & 16);
      // a channel starts and stops as the player holds it
      if (n.chan !== this.chan) {
        if (this.chan) this.endChannel(false);
        if (n.chan) this.startChannel(n.chan);
      }
      if (this.chan) this.chanT += dt;
      this.firing = !!(n.fl & 1) && !this.charging && !this.chan && !G.Game.controlsLocked();
      if (n.fl & 4) {
        this.dashT = Math.max(this.dashT, 0.08);
        G.FX.trail(this.x + U.rand(-0.3, 0.3), this.y + U.rand(0.4, 1.8), this.z + U.rand(-0.3, 0.3), this.energy, 0.5, 0.3, 1.8);
      }
      if (!this.auth) return;
      // the host runs the skills the player cast (once each, as their counters tick up)
      const sn = this.seen;
      for (let i = 1; i <= 3; i++) {
        const q = n.sq[i], k = SK[i];
        if (q === sn[k]) continue;
        sn[k] = q;
        if (this.cd[k] > 0.6) continue;
        const ca = n.ca[i];
        this.useSkill(i, { ang: ca[0], x: ca[1], z: ca[2], ch: ca[3], q });
      }
      if (n.us !== sn.us) { sn.us = n.us; if (this.ult >= 100 && this.ultT <= 0) this.ultStart(); }
    }

    // ---------------- per frame ----------------
    update(dt, t) {
      if (!this.alive) { this.lightOff(); return; }
      const s = this.stats;
      if (!Number.isFinite(this.x + this.z + this.vx + this.vz)) {
        const sp = SPAWN[this.slot % SPAWN.length];
        this.x = sp[0]; this.z = sp[1]; this.vx = 0; this.vz = 0;
      }
      // a hero choosing a card is shielded, and nothing of theirs attacks meanwhile
      const picking = G.Game.isPicking(this);
      this.syncOrbiters();
      if (this.auth) this.maxHp = s.maxHp;
      if (this.drive === 'input') this.controlInput(dt);
      else { this.controlNet(dt); this.dashT = Math.max(0, this.dashT - dt); }
      this.invuln = Math.max(0, this.invuln - dt);
      this.hurtFlash = Math.max(0, this.hurtFlash - dt * 4);
      const cdk = dt * G.Classes.cdRate(this);
      for (const k in this.cd) this.cd[k] = Math.max(0, this.cd[k] - cdk);
      if (this.auth && s.regen > 0 && this.hp < s.maxHp) this.hp = Math.min(s.maxHp, this.hp + s.regen * dt);
      if (this === G.Player && this.hp / this.maxHp < 0.3) {
        this.heartT -= dt;
        if (this.heartT <= 0) { this.heartT = 0.9; G.Audio.play('heartbeat'); }
      }
      G.Classes.timers(this, dt);
      if (this.chan) G.Classes.channel(this, this.chan, dt);
      this.fireT -= dt;
      // someone else's gunslinger shoots when its owner's rounds run down (see syncAmmo), not on the trigger flag
      const byTrigger = !(this.drive !== 'input' && this.cls.remoteFire && this.net && this.net.am >= 0);
      if (byTrigger && this.firing && this.fireT <= 0 && this.fire()) this.fireT = 1 / (s.fireRate * this.rateK());
      for (let i = this.echoQ.length - 1; i >= 0; i--) {
        this.echoQ[i] -= dt;
        if (this.echoQ[i] <= 0) { this.echoQ.splice(i, 1); this.fire(); }
      }
      if (this.auth) {
        if (!picking) { this.updateUlt(dt); this.updateStorm(dt); }
        G.Classes.tick(this, dt);
      }
      G.Classes.ultLook(this, dt, t);
      this.updateOrbiters(dt, t, picking);
      this.animate(dt, t, picking);
    }
    // how fast the basic attack fires: the character's own pace, haste, rage, turrets nearby
    rateK() { return G.Classes.rateK(this); }
    updateUlt(dt) {
      if (this.ultT <= 0) return;
      this.ultT -= dt;
      this.ultTick -= dt;
      if (this.ultTick > 0) return;
      if (this.cls.ultTick) this.cls.ultTick(this); else this.ultTick = 1;
    }
    updateStorm(dt) {
      const s = this.stats;
      if (!s.storm) return;
      this.stormT -= dt;
      if (this.stormT > 0) return;
      this.stormT = 1.5;
      const hit = new Set();
      for (let k = 0; k < 3; k++) {
        const tg = C.nearest(this.x + U.rand(-6, 6), this.z + U.rand(-6, 6), 13, hit);
        if (!tg) break;
        hit.add(tg);
        G.Net.vis('strike', U.r1(tg.x), U.r1(tg.z), 0xc8b8ff);
        C.damage(tg, 35 * s.dmgMult, { canCrit: true, source: 'storm', cls: 'chain', by: this });
      }
    }
    // spinning blades and drones; idle while their hero picks a card
    updateOrbiters(dt, t, idle) {
      const s = this.stats;
      this.bladeA += dt * (idle ? 1.2 : 3.4);
      const n = this.blades.length;
      for (let i = 0; i < n; i++) {
        const a = this.bladeA + (i / n) * U.TAU, bx = this.x + Math.cos(a) * 2.7, bz = this.z + Math.sin(a) * 2.7;
        const b = this.blades[i];
        b.position.set(bx, this.y + 1.2, bz);
        b.rotation.set(0, -a, 0);
        if (idle) continue;
        if (Math.random() < 0.4) G.FX.trail(bx, this.y + 1.2, bz, this.energy, 0.28, 0.14, 1.6);
        if (!this.auth) continue;
        C.forEachTarget(bx, bz, 0.75, (tg) => {
          if ((tg.bladeT || 0) > t) return;
          tg.bladeT = t + 0.35;
          C.damage(tg, 12 * s.dmgMult, { kx: Math.cos(a + 1.57), kz: Math.sin(a + 1.57), knock: 4, source: 'blade', by: this });
          if (this === G.Player) G.Audio.play('blade');
        });
      }
      for (let i = 0; i < this.drones.length; i++) {
        const d = this.drones[i];
        const a = t * 0.9 + (i / this.drones.length) * U.TAU;
        d.x = U.damp(d.x, this.x + Math.cos(a) * 1.7, 6, dt);
        d.z = U.damp(d.z, this.z + Math.sin(a) * 1.7, 6, dt);
        d.mesh.position.set(d.x, this.y + 2.5 + Math.sin(t * 3 + i) * 0.2, d.z);
        d.mesh.rotation.y += dt * 3;
        d.t -= dt;
        if (d.t > 0 || idle) continue;
        const tg = C.nearest(d.x, d.z, 16);
        if (!tg) { d.t = 0.2; continue; }
        d.t = 0.75;
        G.Proj.spawnPlayer({ x: d.x, z: d.z, y: this.y + 1.8, angle: Math.atan2(tg.z - d.z, tg.x - d.x), speed: 30, life: 0.7, dmg: s.dmg * s.dmgMult * 0.6,
          size: 0.75, pierce: 0, ricochet: 0, homing: 1, color: this.energy, source: 'drone', procs: true, by: this, cos: !this.auth });
      }
    }
    lightOff() { if (this.lightSlot) this.lightSlot.light.intensity = 0; }
    animate(dt, t, picking) {
      const g = this.group;
      // someone else's jump: an arc while their leap flag is up
      if (this.drive !== 'input') {
        this.leapVisT = this.leapVis ? this.leapVisT + dt : 0;
        this.hop = this.leapVis ? Math.sin(Math.min(1, this.leapVisT / 0.55) * Math.PI) * 3.2 : 0;
      }
      g.position.set(this.x, this.y + this.hop, this.z);
      g.rotation.y = -this.facing - Math.PI / 2;
      const sp = Math.hypot(this.vx, this.vz), ms = Math.max(1, this.stats.speed);
      const fwd = (this.vx * Math.cos(this.facing) + this.vz * Math.sin(this.facing)) / ms;
      const side = (this.vx * -Math.sin(this.facing) + this.vz * Math.cos(this.facing)) / ms;
      this.body.rotation.x = U.damp(this.body.rotation.x, -U.clamp(fwd, -1.5, 1.5) * 0.22, 10, dt);
      this.body.rotation.z = U.damp(this.body.rotation.z, U.clamp(side, -1.5, 1.5) * 0.18, 10, dt);
      this.body.position.y = this.moving ? Math.abs(Math.sin(t * 11)) * 0.08 : Math.sin(t * 2.2) * 0.025;
      const st = this.dashT > 0 ? 1 : 0;
      this.body.scale.set(1 - st * 0.18, 1 + st * 0.12, 1 + st * 0.25);
      this.cape.rotation.x = U.damp(this.cape.rotation.x, 0.15 + Math.min(1, sp / 8) * 0.7 + Math.sin(t * 9) * 0.06 * Math.min(1, sp / 4), 8, dt);
      this.orb.position.set(0.55 + Math.sin(t * 3) * 0.05, 1.2 + Math.sin(t * 4) * 0.08, -0.25);
      this.orb.scale.setScalar(1 + (this.charging ? this.lanceCharge * 0.8 : 0) + Math.sin(t * 8) * 0.05);
      G.Classes.anim(this, dt, t);
      if (this.lightSlot) {
        const L = this.lightSlot.light;
        L.position.set(this.x, this.y + 1.7, this.z);
        L.intensity = 7 + (this.charging ? this.lanceCharge * 18 : 0) + (this.ultT > 0 ? 9 : 0);
        L.color.setHex(this.ultT > 0 ? 0xffd27a : this.energy);
      }
      this.ring.rotation.y += dt * 2;
      this.ringM.opacity = 0.32 + Math.sin(t * 4) * 0.1;
      const pick = this.alive && picking;
      this.bubble.visible = pick;
      if (pick) {
        this.bubble.rotation.y += dt * 0.8;
        this.bubble.scale.setScalar(1 + Math.sin(t * 3) * 0.04);
        this.bubbleM.opacity = 0.18 + Math.sin(t * 5) * 0.05;
      }
      this.shieldB.visible = this.shieldHp > 0 && !pick;
      if (this.shieldB.visible) { this.shieldB.rotation.y -= dt * 0.6; this.shieldM.opacity = 0.16 + Math.sin(t * 6) * 0.05; }
      // the assassin's stealth: see-through (a little more for allies than for yourself)
      const op = G.Classes.opacity(this);
      if (op !== this.lastOp) {
        this.lastOp = op;
        for (const mt of this.mats) { mt.transparent = op < 1; mt.opacity = op; mt.depthWrite = op >= 1; mt.needsUpdate = true; }
        this.ring.visible = op >= 1;
      }
      const hf = this.hurtFlash;
      for (const mt of this.mats) mt.emissive.setRGB(hf * 1.2, hf * 0.15, hf * 0.2);
      g.visible = !G.Classes.hidden(this) && !(this.invuln > 0 && this.invuln < 0.5 && this.hurtFlash <= 0 && this.dashT <= 0 && Math.floor(t * 18) % 2 === 0);
    }

    // ---------------- co-op sync ----------------
    // 0 x, 1 z, 2 facing, 3-4 aim, 5 flags, 6 channel slot, 7 charge slot, 8 charge,
    // 9 s1 count, 10-13 s1 args (angle, x, z, charge), 14 s2 count, 15-18 its args,
    // 19 s3 count, 20-23 its args, 24 ultimate count, 25 the gun's cylinder (gunslinger)
    netState() {
      const ca = this.ca;
      return [U.r2(this.x), U.r2(this.z), U.r2(this.facing), U.r1(this.aimX), U.r1(this.aimZ),
        (this.firing ? 1 : 0) | (this.charging ? 2 : 0) | (this.dashT > 0 ? 4 : 0) | (this.stealthT > 0 ? 8 : 0) | (this.leap ? 16 : 0),
        this.chan, this.charging ? this.chgSlot : 0, U.r2(this.charging ? this.lanceCharge : this.lastLc),
        this.seq.s1, ...ca[1], this.seq.s2, ...ca[2], this.seq.s3, ...ca[3], this.seq.us, this.cls.netAmmo ? this.cls.netAmmo(this) : 0];
    }
    applyNet(a) {
      if (!Array.isArray(a) || a.length < 25) return;
      const N = U.num;
      const args = (o) => [N(a[o], 0, -10, 10), N(a[o + 1], 0, -140, 140), N(a[o + 2], 0, -140, 140), N(a[o + 3], 0, 0, 1)];
      this.net = { x: N(a[0], this.x, -95, 95), z: N(a[1], this.z, -95, 95), f: N(a[2], 0, -10, 10), ax: N(a[3], 0, -140, 140), az: N(a[4], 0, -140, 140),
        fl: N(a[5], 0, 0, 255) | 0, chan: N(a[6], 0, 0, 3) | 0, cs: N(a[7], 0, 0, 3) | 0, lc: N(a[8], 0, 0, 1),
        sq: [0, N(a[9]), N(a[14]), N(a[19])], ca: [null, args(10), args(15), args(20)], us: N(a[24]), am: a.length > 25 ? N(a[25], 0, 0, 15) | 0 : -1 };
      // a gun that counts its rounds: fire here exactly the rounds its owner just fired
      if (this.cls.syncAmmo && this.net.am >= 0) this.cls.syncAmmo(this, this.net.am);
    }
    // replay another player's card picks (in order) so this machine knows their stats
    syncPicks(str) {
      if (typeof str !== 'string') return;
      while (this.netPicks < str.length && this.netPicks < 90) {
        const d = G.Upgrades.byCode[str[this.netPicks]];
        this.netPicks++;
        if (d) G.Upgrades.take(this, d);
      }
    }
    dispose() {
      const scene = G.Render.scene;
      this.stopLanceSound();
      scene.remove(this.group);
      if (this.aimLine) { scene.remove(this.aimLine); this.aimLine.geometry.dispose(); this.aimLine.material.dispose(); }
      for (const b of this.blades) scene.remove(b);
      for (const d of this.drones) scene.remove(d.mesh);
      this.blades = []; this.drones = [];
      for (const g of this.geos) g.dispose();
      for (const m of this.mats) m.dispose();
      this.glowM.dispose(); this.ringM.dispose(); this.bubbleM.dispose(); this.shieldM.dispose(); this.bladeMat.dispose(); this.droneMat.dispose();
      if (this.lightSlot) { this.lightSlot.light.intensity = 0; this.lightSlot.used = false; this.lightSlot = null; }
    }
  }
  Hero.ULT_TIME = 5;
  G.Hero = Hero;
})();

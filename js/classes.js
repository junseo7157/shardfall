// ============================================================
// SHARDFALL - classes: the ten heroes. Solo is always the shard mage; in co-op every player takes a
// different one. Each has a trait, a basic attack, three skills (right click / Q / E) and an
// ultimate (R), and its own way of playing:
//   shard mage   beam, nova, meteor            guardian    raised shield, thrown shield, banner
//   falconer     drawn bow, snare, hawk        pyromancer  flamethrower, fire dash, combustion
//   cleric       healing beam, shields, spring berserker   whirlwind, leap, war cry
//   engineer     turrets, mines, EMP           assassin    shadow step, stealth, death mark
//   chronomancer slow field, rewind, haste     gunslinger  six-shooter, fanning, roll, lasso
//
// How a skill runs (hero.js reads the input): the caster's machine runs use() at once (movement,
// its own copy of the visuals) and so does the host when the cast reaches it (the damage).
// Visuals go through G.Net.visBy, so the caster sees its own copy and everyone else the host's.
// What stays on the field (turrets, traps, the hawk, banners, fields, domes) is made by those
// visual events on every machine; its damage is dealt only where G.auth() is true.
// ============================================================
(() => {
  const G = window.G, U = G.U, C = G.Combat, HS = G.Heroes;
  const R1 = U.r1, R2 = U.r2, TAU = U.TAU;
  const CL = (G.Classes = {
    order: ['shard', 'guardian', 'ranger', 'pyro', 'cleric', 'berserker', 'engineer', 'assassin', 'chrono', 'gunslinger'],
    list: {}, zones: [], summons: [], decoys: [], traps: [], mines: [], dmarks: [], marks: new Map(), stopT: 0,
  });
  // how each kind of skill is used, for the lobby card: [desktop, phone]
  CL.HOW = {
    charge: ['누르고 모았다가 떼기', '눌러 모으고 끌어서 조준, 떼면 발사'],
    channel: ['누르고 있는 동안', '누르는 동안 유지 · 끌어서 조준'],
    aim: ['조준한 쪽으로 바로', '끌어서 방향을 정하고 떼기'],
    place: ['커서 자리에 바로', '끌어서 자리를 정하고 떼기'],
    self: ['누르면 바로', '누르면 바로'],
  };
  const def = (o) => {
    o.names = { s1: o.skills[0].name, s2: o.skills[1].name, s3: o.skills[2].name, ult: o.ult.name };
    o.skills.forEach((s, i) => { s.slot = i + 1; });
    CL.list[o.id] = o;
    return o;
  };
  CL.get = (id) => CL.list[id] || CL.list.shard;
  CL.valid = (id) => Object.prototype.hasOwnProperty.call(CL.list, id);

  // ---------------- helpers ----------------
  const scene = () => G.Render.scene;
  const hy = (x, z) => G.World.heightAt(x, z);
  const vb = (h, name, ...a) => G.Net.visBy(h.key, name, ...a);
  const shows = (h) => h.drive === 'input' || h.auth; // the caster's copy and the host's (relayed to the rest)
  const mine = (key) => !!G.Player && key === G.Player.key;
  const near = (x, z) => { const P = G.Player; return P ? U.clamp(1.25 - U.dist(x, z, P.x, P.z) / 28, 0.12, 1) : 1; };
  const extra = (s) => Math.max(0, s.freezeDur - 1.3); // '... 숙련' cards lengthen every Q effect
  const eid = (t) => (t.isBoss ? -1 : t.id);
  const sid = (h, i, q) => h.slot + '-' + i + '-' + q; // the same on every machine
  const stun = (t, d) => { if (t.applyStatus) t.applyStatus('freeze', 1, d); };
  const slow = (t, k, d) => { if (t.applyStatus) t.applyStatus('slow', k, d); };
  const lost = (h) => U.clamp(1 - h.hp / Math.max(1, h.stats.maxHp), 0, 1);
  const hpFrac = (t) => (t.boss ? t.boss.hp / Math.max(1, t.boss.maxHp) : t.hp / Math.max(1, t.maxHp));
  const inCone = (h, t, ang, half) => U.dist2(h.x, h.z, t.x, t.z) < 2.25 || Math.abs(U.angleDiff(ang, Math.atan2(t.z - h.z, t.x - h.x))) <= half;
  // the last free spot on the way from (x0, z0) toward ang, at most len away
  function reach(x0, z0, ang, len, r = 0.55) {
    const dx = Math.cos(ang), dz = Math.sin(ang);
    let bx = x0, bz = z0;
    for (let d = 0.5; d <= len + 1e-6; d += 0.5) {
      const x = x0 + dx * d, z = z0 + dz * d;
      if (!G.World.isFree(x, z, r)) break;
      bx = x; bz = z;
    }
    return [bx, bz];
  }
  const freeSpot = (x, z, r = 0.7) => { const p = { x, z }; G.World.resolve(p, r); return p; };
  // a mark above an enemy that every machine can see (kind 1 falconer, 2 death mark, 3 dead eye)
  function markEnemy(t, dur, kind = 1) {
    const now = G.Game.time;
    if (kind === 1) {
      t.markUntil = Math.max(t.markUntil || 0, now + dur);
      if ((t.markSent || 0) > now + dur - 1) return; // already showing
      t.markSent = now + dur;
    }
    G.Net.vis('mark', eid(t), R1(dur), kind);
  }
  CL.mark = markEnemy;
  // visual timers on every machine (host timers live in G.Enemies.later)
  const fxq = [];
  const later = (t, fn) => fxq.push({ t, fn });

  // ---------------- shared meshes ----------------
  const MAT = {}, GEO = {};
  const mat = (k, f) => MAT[k] || (MAT[k] = f());
  const geo = (k, f) => GEO[k] || (GEO[k] = f());
  const std = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.5, metalness: 0.35, flatShading: true }, o));
  const glowM = (color, k = 2.4, o = {}) => new THREE.MeshBasicMaterial(Object.assign({ color: U.hdr(color, k) }, o));
  const addM = (g, gm, m, x = 0, y = 0, z = 0, shadow = true) => { const me = new THREE.Mesh(gm, m); me.position.set(x, y, z); me.castShadow = shadow; g.add(me); return me; };
  const face = (o, ang) => { o.rotation.y = Math.PI / 2 - ang; }; // our meshes look down +z
  function hawkGroup(scale = 1) {
    const g = new THREE.Group();
    const brown = mat('hkBrown', () => std(0x6a4a32, { roughness: 0.8, metalness: 0 }));
    addM(g, geo('hkBody', () => new THREE.SphereGeometry(0.22, 8, 6).scale(1, 0.8, 1.7)), brown, 0, 0, 0, false);
    addM(g, geo('hkHead', () => new THREE.SphereGeometry(0.13, 8, 6)), mat('hkWhite', () => std(0xeee6d6, { roughness: 0.7, metalness: 0 })), 0, 0.1, 0.3, false);
    addM(g, geo('hkBeak', () => new THREE.ConeGeometry(0.05, 0.15, 5).rotateX(Math.PI / 2)), mat('hkGold', () => std(0xe8a530)), 0, 0.08, 0.45, false);
    const wingGeo = geo('hkWing', () => new THREE.BoxGeometry(0.6, 0.03, 0.28).translate(0.3, 0, 0));
    const wL = addM(g, wingGeo, brown, 0.08, 0.05, 0, false);
    const wR = addM(g, wingGeo, brown, -0.08, 0.05, 0, false);
    wR.scale.x = -1;
    addM(g, geo('hkTail', () => new THREE.BoxGeometry(0.22, 0.03, 0.32).translate(0, 0, -0.16)), brown, 0, 0, -0.3, false);
    g.scale.setScalar(scale);
    g.userData.wL = wL; g.userData.wR = wR;
    return g;
  }
  const flap = (g, t, k = 1) => { g.userData.wL.rotation.z = Math.sin(t) * 0.75 * k; g.userData.wR.rotation.z = -Math.sin(t) * 0.75 * k; };

  // ================= the ten =================
  const MELEE_OFF = ['seeker', 'ricochet', 'pierce', 'velocity'];
  const MELEE_ALT = {
    multishot: { desc: '휘두르는 범위 <b>+25%</b>, 근접 피해 <b>+20%</b>' },
    enlarge: { desc: '공격 거리 <b>+15%</b>, 피해 <b>+6%</b>' },
  };

  // ---------- 1. shard mage: the solo hero ----------
  def({
    id: 'shard', name: '파편술사', role: '만능 마법사', emblem: 'shard', css: '#8fb3f0', energy: null, ultDur: 5,
    trait: { name: '마력 순환', desc: '스킬을 쓰면 2초 동안 공격 속도가 40% 빨라집니다.' },
    basic: { name: '파편탄', icon: 'shard', desc: '빠르게 연사하는 마력 파편' },
    skills: [
      { name: '파편 창', icon: 'spear', kind: 'charge', cd: 3.2, desc: '오래 모을수록 굵고 아파지는, 지형을 뚫는 관통 광선',
        line: (ch, s) => ({ len: 28, w: (0.15 + ch * 1.2) * s.lanceWidth }),
        use(h, a) { h.facing = a.ang; h.fireLance(a.ch); } },
      { name: '서리 노바', icon: 'snow', kind: 'self', cd: 9, desc: '주변 7.5m의 적을 얼리고 밀어냄', use(h) { h.nova(); } },
      { name: '운석', icon: 'meteor', kind: 'place', cd: 11, range: 22, ring: (s) => 5 * s.meteorRadius, desc: '정한 자리에 떨어져 불바다를 남김',
        use(h, a) { if (h.auth) h.castMeteor(a.x, a.z); } },
    ],
    ult: { name: '파편 폭풍', icon: 'burst', desc: '5초 동안 주변에 벼락이 쏟아지고 공격이 빨라짐' },
    onSkill(h) { h.surgeT = 2; },
    rateK: (h) => (h.ultT > 0 ? 1.35 : 1) * (h.surgeT > 0 ? 1.4 : 1),
    fireMod: (h) => (h.ultT > 0 ? { more: 1, color: 0xffd27a } : null),
    ultStart(h) {
      const s = h.stats;
      G.Net.vis('ultStart', R1(h.x), R1(h.z), h.key);
      C.forEachTarget(h.x, h.z, 8, (t) => C.damage(t, (t.isBoss ? 15 : 30) * s.dmgMult, { kx: t.x - h.x, kz: t.z - h.z, knock: 16, source: 'ult', by: h }));
    },
    ultTick(h) {
      h.ultTick = 0.22;
      const tg = C.nearest(h.x + U.rand(-8, 8), h.z + U.rand(-8, 8), 14);
      if (!tg) return;
      G.Net.vis('strike', R1(tg.x), R1(tg.z), 0xffc35a);
      // the storm is for crowds: bosses only take half of each strike
      C.damage(tg, 14 * h.stats.dmgMult * (tg.isBoss ? 0.5 : 1), { canCrit: !tg.isBoss, kx: tg.x - h.x, kz: tg.z - h.z, knock: 4, source: 'ult', cls: 'chain', by: h });
    },
    look(h) { if (Math.random() < 0.5) G.FX.trail(h.x + U.rand(-0.8, 0.8), h.y + U.rand(0.2, 2), h.z + U.rand(-0.8, 0.8), 0xffc35a, 0.5, 0.5, 2.2); },
  });

  // ---------- 2. guardian: holds the line ----------
  def({
    id: 'guardian', name: '수호기사', role: '방패로 동료를 지키는 탱커', emblem: 'shield', css: '#f6d27a', energy: 0xffd98a, ultDur: 6, orb: false, size: 1.04,
    trait: { name: '불굴', desc: '받는 피해가 20% 줄고, 6m 안의 동료도 받는 피해가 10% 줄어듭니다.' },
    basic: { name: '성광 망치', icon: 'hammer', desc: '앞쪽을 크게 휘둘러 맞은 적을 모두 밀쳐내는 근접 공격', melee: { r: 3.4, arc: 1.9 }, knock: 9, sfx: 'swingHeavy' },
    stats(s) { s.maxHp = 160; s.armor += 5; s.speed *= 0.92; s.dmg = 24; s.fireRate = 1.9; },
    cardOff: MELEE_OFF, cardAlt: MELEE_ALT,
    skills: [
      { name: '방패 세우기', icon: 'shield', kind: 'channel', cd: 6, max: 4, moveK: 0.55,
        desc: '누르는 동안 앞쪽에서 오는 적 탄을 모두 막고 정면 피해를 80% 줄임. 떼면 막아 낸 만큼 강해지는 방패 강타(앞 7m, 1초 기절)',
        up: '방패 강타 피해 <b>+45%</b>, 거리 <b>+20%</b>' },
      { name: '방패 던지기', icon: 'disc', kind: 'aim', cd: 8, range: 16, line: () => ({ len: 16, w: 1.4 }),
        desc: '방패를 던져 적 사이를 최대 5번 튕기며 맞은 적을 1초 기절시키고 돌아옴',
        up: '방패 던지기 대기시간 <b>-15%</b>, 기절 <b>+0.3초</b>',
        use(h, a) {
          const ch = throwChain(h, a.ang);
          if (shows(h)) vb(h, 'gdThrow', ch.pts.map(R1), h.key);
          if (!h.auth) return;
          const s = h.stats, d = 1 + extra(s) * 0.6;
          ch.targets.forEach((t, k) => G.Enemies.later(0.08 + k * 0.13, () => {
            if (!t.alive) return;
            C.damage(t, 45 * s.dmgMult, { kx: t.x - h.x, kz: t.z - h.z, knock: 6, source: 'skill', by: h });
            stun(t, d);
          }));
        } },
      { name: '도발의 깃발', icon: 'flag', kind: 'place', cd: 15, range: 12, tap: 'feet', ring: (s) => 9 * s.meteorRadius,
        desc: '깃발을 꽂아 6초 동안 9m 안의 적(보스 제외)이 깃발만 노리게 함. 깃발 곁 5m 동료는 받는 피해 25% 감소',
        up: '깃발 체력 <b>+40%</b>, 끄는 범위 <b>+15%</b>',
        use(h, a) {
          const s = h.stats, p = freeSpot(a.x, a.z, 0.6), r = 9 * s.meteorRadius, id = sid(h, 3, a.q);
          if (shows(h)) vb(h, 'gdBanner', id, R1(p.x), R1(p.z), R1(r), 6, h.key);
          if (!h.auth) return;
          CL.decoys.push({
            kind: 'banner', id, x: p.x, z: p.z, y: hy(p.x, p.z), r, t: 6, hp: 300 * s.meteorMult, alive: true, vx: 0, vz: 0, isDecoy: true, stealthT: 0, by: h,
            takeDamage(n) {
              this.hp -= n;
              G.FX.spark(this.x, this.y + 1.6, this.z, 0xffd98a, 4, 4);
              if (this.hp <= 0 && this.alive) { this.alive = false; G.Net.vis('sumEnd', this.id, 1); }
              return true;
            },
          });
        } },
    ],
    ult: { name: '수호의 결계', icon: 'dome', desc: '그 자리에 6초 동안 반지름 8m 황금 결계: 들어오는 적 탄이 모두 사라지고, 안의 동료는 받는 피해 50% 감소와 체력 회복, 적은 느려짐' },
    chanStart(h) { h.bStore = 0; if (shows(h)) vb(h, 'gdRaise', R1(h.x), R1(h.z), h.key); },
    chanEnd(h, i, cancel) {
      if (cancel) return;
      const s = h.stats, a = h.facing, range = 7 * (0.9 + 0.1 * s.lanceWidth), store = Math.min(360, h.bStore || 0);
      if (shows(h)) vb(h, 'gdBash', R1(h.x), R1(h.z), R2(a), R1(range), store > 30 ? 1 : 0, h.key);
      h.bStore = 0;
      if (!h.auth) return;
      const dmg = (40 + store * 1.6) * s.lanceMult * s.dmgMult;
      C.forEachTarget(h.x, h.z, range, (t) => {
        if (!inCone(h, t, a, 0.75)) return;
        C.damage(t, dmg, { kx: Math.cos(a), kz: Math.sin(a), knock: 14, source: 'skill', by: h });
        stun(t, 1);
      });
    },
    ultStart(h) {
      G.Net.vis('ultFx', 'guardian', R1(h.x), R1(h.z), h.key);
      G.Net.vis('gdDome', h.slot + '-u-' + Math.round(G.Game.time * 10), R1(h.x), R1(h.z), 8, 6, h.key);
    },
    ultTick(h) { h.ultTick = 1; },
    model(h, add, M) {
      add(new THREE.SphereGeometry(0.29, 14, 10), M.steel, 0, 1.8, 0).scale.set(1, 1.05, 1.05);
      add(new THREE.BoxGeometry(0.06, 0.26, 0.46), M.gold, 0, 2.06, 0.02);
      for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.3, 0.12, 0.42), M.steel, sx * 0.42, 1.6, 0).rotation.z = sx * -0.35;
      const sh = add(new THREE.CylinderGeometry(0.46, 0.46, 0.08, 6), M.steel, -0.56, 1.06, -0.22);
      sh.rotation.set(Math.PI / 2, 0, Math.PI / 2 + 0.25);
      const boss = add(new THREE.CylinderGeometry(0.15, 0.15, 0.1, 10), M.gold, -0.6, 1.06, -0.24);
      boss.rotation.set(Math.PI / 2, 0, Math.PI / 2 + 0.25);
      // the hammer
      add(new THREE.CylinderGeometry(0.045, 0.05, 1.1, 6), M.dark, 0.52, 1.05, -0.05).rotation.x = 0.35;
      add(new THREE.BoxGeometry(0.42, 0.26, 0.26), M.gold, 0.52, 1.56, -0.24).rotation.x = 0.35;
      // the raised shield: a wall of light in front, shown while blocking
      const arc = add(new THREE.CylinderGeometry(1.45, 1.45, 2.0, 18, 1, true, Math.PI - 1.05, 2.1), new THREE.MeshBasicMaterial({ color: U.hdr(0xffd98a, 1.6), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), 0, 1.0, 0);
      arc.castShadow = false; arc.visible = false;
      h.parts.arc = arc;
    },
    anim(h, dt, t) {
      const a = h.parts.arc;
      if (!a) return;
      a.visible = h.chan === 1;
      if (a.visible) a.material.opacity = 0.28 + Math.sin(t * 9) * 0.08 + Math.min(0.25, (h.bStore || 0) / 600);
    },
    look(h) {
      if (Math.random() < 0.5) {
        const a = Math.random() * TAU;
        G.FX.P.emit(h.x + Math.cos(a) * 1.2, h.y + 0.3, h.z + Math.sin(a) * 1.2, 0, U.rand(1, 3), 0, 0.6, 0.4, 0.02, 2.6, 2.2, 1.2, 1, 0.5, 0);
      }
    },
  });
  // the shield's path: the first enemy down the throw (or in a forgiving cone), then the nearest
  // unhit one each bounce
  function throwChain(h, ang) {
    const targets = [], hit = new Set();
    let first = null, bp = 1e9;
    C.line(h.x, h.z, ang, 16, 2.6, (t, p) => { if (p < bp) { bp = p; first = t; } });
    if (!first) {
      let bd = 1e9;
      C.forEachTarget(h.x, h.z, 16, (t) => {
        if (!inCone(h, t, ang, 0.6)) return;
        const d = U.dist2(h.x, h.z, t.x, t.z);
        if (d < bd) { bd = d; first = t; }
      });
    }
    let cur = first;
    while (cur && targets.length < 5) {
      targets.push(cur);
      hit.add(cur);
      if (cur.boss) for (const q of cur.boss.targets) hit.add(q);
      cur = C.nearest(cur.x, cur.z, 8, hit);
    }
    const pts = [h.x, h.z];
    if (!targets.length) pts.push(h.x + Math.cos(ang) * 16, h.z + Math.sin(ang) * 16);
    for (const t of targets) pts.push(t.x, t.z);
    return { pts, targets };
  }

  // ---------- 3. falconer: the bow and the hawk ----------
  def({
    id: 'ranger', name: '매사냥꾼', role: '매와 함께 멀리서 노리는 명사수', emblem: 'bird', css: '#8fdcb3', energy: 0xa8f07a, ultDur: 7, orb: false,
    trait: { name: '명사수', desc: '14m보다 먼 적에게 주는 피해 +30%. 치명타를 맞은 적에게 4초 동안 표식: 표식된 적은 모두에게 15% 더 아프게 맞습니다.' },
    basic: { name: '사냥 화살', icon: 'arrow', desc: '멀리 날아가 적 하나를 꿰뚫는 화살', spread: 0.06, sfx: 'bow' },
    stats(s) { s.maxHp = 90; s.speed *= 1.05; s.dmg = 20; s.fireRate = 3.1; s.projSpeed = 52; s.projLife = 0.78; s.projSize = 0.9; s.pierce += 1; s.crit += 0.06; },
    skills: [
      { name: '저격 화살', icon: 'bow', kind: 'charge', cd: 4, chargeTime: 1.2, line: (ch, s) => ({ len: 45, w: Math.max(0.2, 1.5 - ch * 1.25) * (0.8 + 0.2 * s.lanceWidth) }),
        desc: '활을 끝까지 당길수록 강한 화살 한 발. 멀리 날아갈수록 피해가 커지고(최대 +60%), 끝까지 당기면 반드시 치명타에 맞은 적 모두 표식',
        up: '저격 화살 피해 <b>+45%</b>, 굵기 <b>+20%</b>',
        use(h, a) {
          h.facing = a.ang;
          if (shows(h)) vb(h, 'rgSnipe', R1(h.x), R1(h.z), R2(a.ang), R2(a.ch), h.key);
          if (h.drive === 'input') { h.vx -= Math.cos(a.ang) * 3; h.vz -= Math.sin(a.ang) * 3; }
          if (h.auth) snipeArrow(h, h.x, h.z, a.ang, a.ch, false);
        } },
      { name: '후방 도약', icon: 'wind', kind: 'self', cd: 8,
        desc: '조준 반대쪽으로 8m 뛰며 무적. 떠난 자리에 올가미 덫: 처음 밟은 적과 주변을 2.5초 묶고 피해',
        up: '후방 도약 대기시간 <b>-15%</b>, 묶기 <b>+0.5초</b>',
        use(h, a) {
          const ang = h.facing + Math.PI, x0 = h.x, z0 = h.z, id = sid(h, 2, a.q);
          if (h.drive === 'input') { h.dashDir = { x: Math.cos(ang), z: Math.sin(ang) }; h.dashT = 8 / 46; h.invuln = Math.max(h.invuln, 0.4); }
          if (shows(h)) vb(h, 'rgVault', id, R1(x0), R1(z0), h.key);
          if (!h.auth) return;
          // three snares each at most: a fourth takes the oldest
          const own = CL.traps.filter((q) => q.by === h);
          if (own.length >= 3) { const o = own[0]; CL.traps.splice(CL.traps.indexOf(o), 1); G.Net.vis('sumEnd', o.id, 0); }
          CL.traps.push({ id, by: h, x: x0, z: z0, r: 2.6, arm: 0.35, t: 18, hold: 2.5 + extra(h.stats) });
        } },
      { name: '매 사냥', icon: 'bird', kind: 'place', cd: 12, range: 24, ring: (s) => 5 * s.meteorRadius,
        desc: '매를 보내 정한 자리 반지름 5m를 5초 동안 맴돌며 적에게 급강하(0.45초마다 피해와 표식)',
        up: '매 피해 <b>+40%</b>, 사냥 범위 <b>+15%</b>',
        use(h, a) { if (shows(h)) vb(h, 'rgHawk', sid(h, 3, a.q), R1(a.x), R1(a.z), R1(5 * h.stats.meteorRadius), 5, h.key); } },
    ],
    ult: { name: '사냥의 시간', icon: 'eye', desc: '7초 동안 공격 속도 +60%, 화살이 3갈래로 나가 적을 따라가고, 매가 곁에서 쉬지 않고 사냥' },
    rateK: (h) => (h.ultT > 0 ? 1.6 : 1),
    fireMod: (h) => (h.ultT > 0 ? { more: 2, homing: 1 } : null),
    ultStart(h) { G.Net.vis('ultFx', 'ranger', R1(h.x), R1(h.z), h.key); },
    ultTick(h) {
      h.ultTick = 0.6;
      const t = C.nearest(h.x, h.z, 16);
      if (!t) return;
      G.Net.vis('rgDive', R1(h.x), R1(h.z), R1(t.x), R1(t.z));
      C.damage(t, 30 * h.stats.dmgMult, { source: 'hawk', by: h, kx: t.x - h.x, kz: t.z - h.z, knock: 3 });
      markEnemy(t, 4, 1);
    },
    model(h, add, M) {
      const hood = add(new THREE.ConeGeometry(0.34, 0.62, 10), M.cape, 0, 1.98, 0.08);
      hood.rotation.x = 0.28;
      add(new THREE.TorusGeometry(0.27, 0.07, 6, 14), M.cape, 0, 1.5, 0).rotation.x = Math.PI / 2;
      const bow = add(new THREE.TorusGeometry(0.62, 0.035, 6, 22, Math.PI), M.dark, -0.55, 1.1, -0.05);
      bow.rotation.set(0, Math.PI / 2, Math.PI / 2);
      add(new THREE.CylinderGeometry(0.008, 0.008, 1.24, 3), M.gold, -0.55, 1.1, -0.05);
      const q = add(new THREE.CylinderGeometry(0.11, 0.09, 0.64, 8), M.dark, 0.18, 1.28, 0.32);
      q.rotation.x = -0.35; q.rotation.z = -0.3;
      for (let i = 0; i < 3; i++) add(new THREE.ConeGeometry(0.05, 0.16, 4), M.glow, 0.22 + i * 0.05, 1.66, 0.42 - i * 0.03);
      // the hawk rides on the left shoulder until it is sent out
      const hk = hawkGroup(0.85);
      hk.position.set(-0.42, 1.78, 0.04);
      hk.rotation.y = Math.PI;
      h.body.add(hk);
      h.parts.hawk = hk;
    },
    anim(h, dt, t) {
      const hk = h.parts.hawk;
      if (!hk) return;
      hk.visible = !CL.summons.some((s) => s.kind === 'hawk' && s.owner === h.key && !s.dead);
      flap(hk, t * 3, Math.max(0, Math.sin(t * 0.7)) * 0.4);
    },
    look(h) { if (Math.random() < 0.4) G.FX.trail(h.x + U.rand(-0.6, 0.6), h.y + U.rand(0.5, 2), h.z + U.rand(-0.6, 0.6), 0xb8f07a, 0.4, 0.4, 2.2); },
  });
  function snipeArrow(h, x, z, ang, ch, cos) {
    const s = h.stats, full = ch > 0.95;
    G.Proj.spawnPlayer({ x: x + Math.cos(ang) * 0.8, z: z + Math.sin(ang) * 0.8, y: hy(x, z) + 1.35, angle: ang, speed: 92, life: 0.5,
      dmg: (40 + 180 * ch) * s.lanceMult * s.dmgMult, size: (1.5 + ch * 0.8) * (0.85 + 0.15 * s.lanceWidth), pierce: 99, color: full ? 0xffffff : 0xd8ffb0,
      source: 'snipe', procs: full, by: h, cos, knock: 5 + 8 * ch, grow: 0.015, crit: full, mark: full ? 4 : 0 });
  }

  // ---------- 4. pyromancer: sets everything alight ----------
  def({
    id: 'pyro', name: '화염술사', role: '불바다를 펼치는 광역 딜러', emblem: 'flame', css: '#f08c93', energy: 0xff8a3a, ultDur: 6,
    trait: { name: '잿불', desc: '모든 공격이 3초 동안 불태웁니다. 불타던 적이 쓰러지면 터지며 주변에 불을 옮깁니다.' },
    basic: { name: '불꽃 다발', icon: 'flame', desc: '가까이에서 부채꼴로 퍼지는 화염구 세 개', spread: 0.2, sfx: 'fireball' },
    stats(s) { s.maxHp = 95; s.dmg = 7.5; s.fireRate = 4.0; s.projSpeed = 26; s.projLife = 0.52; s.projCount = 3; s.burn += 1; },
    skills: [
      { name: '화염 방사', icon: 'fire', kind: 'channel', cd: 5, max: 3, moveK: 0.7, line: (ch, s) => ({ len: 8 * (0.85 + 0.15 * s.lanceWidth), w: 5.2 }),
        desc: '누르는 동안 앞쪽 부채꼴(8m)로 불길을 뿜어 적을 계속 태움. 최대 3초',
        up: '화염 방사 피해 <b>+45%</b>, 거리 <b>+20%</b>' },
      { name: '불꽃 질주', icon: 'dashfire', kind: 'aim', cd: 7, range: 9, line: () => ({ len: 9, w: 2.4 }),
        desc: '조준한 쪽으로 9m 돌진(무적)하며 4초 동안 불타는 길을 남김',
        up: '불꽃 질주 대기시간 <b>-15%</b>, 불길 <b>+0.5초</b>',
        use(h, a) {
          const s = h.stats, ang = a.ang, x0 = h.x, z0 = h.z;
          const [x1, z1] = h.drive === 'input' ? reach(x0, z0, ang, 9, 0.5) : [a.x, a.z];
          a.x = x1; a.z = z1;
          const len = Math.max(0.5, U.dist(x0, z0, x1, z1));
          if (h.drive === 'input') { h.facing = ang; h.dashDir = { x: Math.cos(ang), z: Math.sin(ang) }; h.dashT = Math.max(0.05, len / 46); h.invuln = Math.max(h.invuln, h.dashT + 0.2); }
          const dur = 4 + extra(s);
          if (shows(h)) vb(h, 'pyTrail', R1(x0), R1(z0), R1(x1), R1(z1), R1(dur));
          if (!h.auth) return;
          CL.zones.push({ x: x0, z: z0, t: dur, every: 0.3, tick: 0.12, by: h, fn() {
            C.line(x0, z0, ang, len, 2.6, (t) => {
              C.damage(t, 9 * s.dmgMult, { canCrit: false, source: 'zone', cls: 'burn', by: h });
              if (t.applyStatus) t.applyStatus('burn', 9, 2);
            });
          } });
        } },
      { name: '연소', icon: 'burst', kind: 'place', cd: 10, range: 20, ring: (s) => 6 * s.meteorRadius,
        desc: '정한 자리 6m 안의 불타는 적을 모두 터뜨림: 남은 화상 피해를 한꺼번에 몰아주고(×2.5) 폭발이 주변을 다시 태움',
        up: '연소 피해 <b>+40%</b>, 범위 <b>+15%</b>',
        use(h, a) {
          const s = h.stats, r = 6 * s.meteorRadius;
          if (shows(h)) vb(h, 'pyCombust', R1(a.x), R1(a.z), R1(r));
          if (!h.auth) return;
          let booms = 0;
          C.forEachTarget(a.x, a.z, r, (t) => {
            const src = t.boss || t;
            if (src.burn > 0) {
              const left = Math.max(0, src.burn) * (src.burnDps || 0);
              src.burn = 0; src.burnDps = 0;
              C.damage(t, (35 + left * 2.5) * s.meteorMult * s.dmgMult, { source: 'skill', cls: 'burn', by: h, kx: t.x - a.x, kz: t.z - a.z, knock: 8 });
              if (booms++ < 8) G.Net.vis('boom', R1(t.x), R1(t.z), 2.4, 0xff7a2a, 0.06);
              C.forEachTarget(t.x, t.z, 2.6, (o) => { if (o !== t && o.applyStatus) o.applyStatus('burn', 12, 3); });
            } else {
              C.damage(t, 15 * s.meteorMult * s.dmgMult, { canCrit: false, source: 'skill', by: h });
              if (t.applyStatus) t.applyStatus('burn', 8, 3);
            }
          });
        } },
    ],
    ult: { name: '지옥불 화신', icon: 'skull', desc: '6초 동안 몸이 불길이 되어 주변 6m 적을 계속 태우고, 화염구가 더 크고 아파지며 맞은 자리에서 터짐' },
    fireMod: (h) => (h.ultT > 0 ? { dmgK: 1.4, sizeK: 1.6, boom: 2.2 } : null),
    channel(h, i, dt) {
      const s = h.stats, a = h.facing, range = 8 * (0.85 + 0.15 * s.lanceWidth), y = h.y + 1.15;
      const ox = h.x + Math.cos(a) * 0.8, oz = h.z + Math.sin(a) * 0.8, n = G.Settings.quality === 'low' ? 3 : 6;
      for (let k = 0; k < n; k++) {
        const b = a + U.rand(-0.42, 0.42), sp = U.rand(range * 1.6, range * 2.4);
        G.FX.P.emit(ox, y, oz, Math.cos(b) * sp, U.rand(0, 2), Math.sin(b) * sp, U.rand(0.3, 0.45), U.rand(0.55, 0.95), 0.2, 3, U.rand(0.7, 1.3), 0.25, 1, 2.4, 0);
      }
      if (Math.random() < 0.12) G.FX.smoke(ox + Math.cos(a) * range * 0.8, y, oz + Math.sin(a) * range * 0.8, 1, 0x3a2a24, 1.6, 2);
      if (near(h.x, h.z) > 0.4) G.Audio.play('flame');
      if (!h.auth) return;
      h.fTick = (h.fTick || 0) - dt;
      if (h.fTick > 0) return;
      h.fTick = 0.1;
      C.forEachTarget(h.x, h.z, range, (t) => {
        if (!inCone(h, t, a, 0.45)) return;
        C.damage(t, 6.5 * s.lanceMult * s.dmgMult, { canCrit: false, source: 'flame', cls: 'burn', by: h, kx: t.x - h.x, kz: t.z - h.z, knock: 1.2 });
        if (t.applyStatus) t.applyStatus('burn', 10 * s.lanceMult, 3);
      });
    },
    ultStart(h) { G.Net.vis('ultFx', 'pyro', R1(h.x), R1(h.z), h.key); },
    ultTick(h) {
      h.ultTick = 0.4;
      C.forEachTarget(h.x, h.z, 6, (t) => {
        C.damage(t, 16 * h.stats.dmgMult * (t.isBoss ? 0.6 : 1), { canCrit: false, source: 'ult', cls: 'burn', by: h });
        if (t.applyStatus) t.applyStatus('burn', 8, 2);
      });
    },
    model(h, add, M) {
      for (const sx of [-1, 1]) {
        const horn = add(new THREE.ConeGeometry(0.07, 0.42, 6), M.dark, sx * 0.17, 2.02, 0.02);
        horn.rotation.z = sx * -0.5;
      }
      for (let i = 0; i < 3; i++) add(new THREE.ConeGeometry(0.06, 0.24, 5), M.glow, (i - 1) * 0.12, 2.12 - Math.abs(i - 1) * 0.06, -0.02);
      add(new THREE.TorusGeometry(0.6, 0.035, 6, 24), M.glow, 0, 0.1, 0).rotation.x = Math.PI / 2;
    },
    look(h) {
      for (let k = 0; k < 2; k++) {
        const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * 6;
        G.FX.P.emit(h.x + Math.cos(a) * r, h.y + 0.2, h.z + Math.sin(a) * r, 0, U.rand(2, 5), 0, 0.5, 0.5, 0.05, 3, 1.1, 0.25, 1, 1, 0);
      }
      if (Math.random() < 0.6) G.FX.P.emit(h.x + U.rand(-0.4, 0.4), h.y + U.rand(0.5, 2), h.z + U.rand(-0.4, 0.4), 0, U.rand(2, 4), 0, 0.4, 0.7, 0.1, 3, 1, 0.2, 1, 1, 0);
    },
  });

  // ---------- 5. cleric: keeps the party standing ----------
  def({
    id: 'cleric', name: '빛의 사제', role: '동료를 살리고 지키는 치유사', emblem: 'feather', css: '#d2e2dc', energy: 0xffeebb, ultDur: 6, healUlt: 0.12,
    trait: { name: '은총', desc: '자신과 8m 안의 동료가 1초마다 체력 2를 회복합니다. 동료를 치유하면 궁극기가 찹니다.' },
    basic: { name: '빛의 구슬', icon: 'orb', desc: '천천히 날아가 적을 따라가는 빛', spread: 0.14 },
    stats(s) { s.maxHp = 105; s.dmg = 14; s.fireRate = 3.6; s.projSpeed = 24; s.projLife = 1.0; s.projSize = 1.2; s.homing += 1; },
    skills: [
      { name: '생명의 빛줄기', icon: 'beam', kind: 'channel', cd: 4, max: 4, moveK: 0.75,
        desc: '누르는 동안 조준한 쪽의 동료나 적과 빛줄기로 이어짐(16m). 동료는 초당 20 회복, 적은 초당 30 피해에 느려짐',
        up: '빛줄기 치유와 피해 <b>+45%</b>' },
      { name: '신성한 보호막', icon: 'halo', kind: 'self', cd: 12,
        desc: '자신과 10m 안의 동료에게 5초 동안 피해 45를 막아 주는 보호막',
        up: '보호막 대기시간 <b>-15%</b>, 지속 <b>+0.5초</b>',
        use(h) {
          if (shows(h)) vb(h, 'clShield', R1(h.x), R1(h.z), h.key);
          if (!h.auth) return;
          const dur = 5 + extra(h.stats);
          for (const o of HS.list) if (o.alive && U.dist2(o.x, o.z, h.x, h.z) < 100) { o.shieldHp = Math.max(o.shieldHp || 0, 45); o.shieldT = dur; }
        } },
      { name: '치유의 샘', icon: 'leaf', kind: 'place', cd: 14, range: 18, tap: 'feet', ring: (s) => 4.5 * s.meteorRadius,
        desc: '6초 동안 빛의 샘: 안의 동료는 0.5초마다 체력 6 회복, 적은 느려지며 빛에 탐',
        up: '샘 치유·피해 <b>+40%</b>, 크기 <b>+15%</b>',
        use(h, a) {
          const s = h.stats, r = 4.5 * s.meteorRadius, dur = 6;
          if (shows(h)) vb(h, 'zoneFx', 'light', R1(a.x), R1(a.z), R1(r), dur);
          if (!h.auth) return;
          CL.zones.push({ x: a.x, z: a.z, r, t: dur, every: 0.5, tick: 0.2, by: h, fn(z) {
            C.forEachTarget(z.x, z.z, z.r, (t) => { C.damage(t, 12 * s.meteorMult * s.dmgMult, { canCrit: false, source: 'zone', by: h }); slow(t, 0.3, 0.7); });
            for (const o of HS.list) if (o.alive && U.dist2(o.x, o.z, z.x, z.z) < z.r * z.r) o.heal(6 * s.meteorMult, true, h);
          } });
        } },
    ],
    ult: { name: '부활의 찬가', icon: 'feather', desc: '쓰러진 동료를 그 자리에서 모두 일으키고 모두의 체력을 가득 채움. 3초 무적, 6초 동안 모두의 피해 +25%' },
    channel(h, i, dt) {
      const bt = beamTarget(h), s = h.stats;
      const tx = bt ? bt.t.x : h.x + Math.cos(h.facing) * 16, tz = bt ? bt.t.z : h.z + Math.sin(h.facing) * 16;
      const col = bt ? (bt.ally ? 0x9fffc0 : 0xfff0b0) : 0xfff4d0, y = h.y + 1.4, len = U.dist(h.x, h.z, tx, tz);
      G.FX.beam(h.x, y, h.z, Math.atan2(tz - h.z, tx - h.x), len, bt ? 0.7 : 0.35, col, 0.05);
      if (bt && Math.random() < 0.5) G.FX.burst(tx, (bt.t.y || 0) + 1.2, tz, { count: 2, color: col, intensity: 2.4, speed: [1, 3], life: [0.2, 0.4], size: [0.35, 0.02], spread: 'up' });
      if (near(h.x, h.z) > 0.4 && bt) G.Audio.play(bt.ally ? 'beamHeal' : 'beamHurt');
      if (!h.auth || !bt) return;
      h.bTick = (h.bTick || 0) - dt;
      if (h.bTick > 0) return;
      h.bTick = 0.25;
      if (bt.ally) bt.t.heal(5 * s.lanceMult, false, h);
      else { C.damage(bt.t, 7.5 * s.lanceMult * s.dmgMult, { canCrit: false, source: 'beam', cls: 'burn', by: h }); slow(bt.t, 0.35, 0.6); }
    },
    ultStart(h) {
      G.Net.vis('ultFx', 'cleric', R1(h.x), R1(h.z), h.key);
      const back = [];
      for (const o of HS.list) {
        if (!o.alive) { o.revive(1, true); back.push(o.name || '동료'); }
        o.hp = o.stats.maxHp;
        o.invuln = Math.max(o.invuln, 3);
        G.Net.vis('pillar', R1(o.x), R1(o.z), 0xffeebb);
      }
      if (back.length) G.Net.vis('toast', back.join(', ') + '님이 빛 속에서 일어났어요', 'good');
    },
    ultTick(h) { h.ultTick = 1; },
    model(h, add, M) {
      add(new THREE.TorusGeometry(0.3, 0.035, 8, 26), M.glow, 0, 2.2, 0).rotation.x = Math.PI / 2;
      add(new THREE.SphereGeometry(0.27, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.robe, 0, 1.84, 0.02);
      add(new THREE.TorusGeometry(0.26, 0.035, 6, 18), M.gold, 0, 1.86, 0.02).rotation.x = Math.PI / 2;
      add(new THREE.CylinderGeometry(0.035, 0.035, 1.9, 6), M.gold, 0.52, 1.0, 0.02);
      add(new THREE.OctahedronGeometry(0.15, 0), M.glow, 0.52, 2.05, 0.02).scale.set(1, 1.5, 1);
      add(new THREE.TorusGeometry(0.13, 0.02, 6, 14), M.gold, 0.52, 2.05, 0.02);
    },
    look(h) { if (Math.random() < 0.5) G.FX.trail(h.x + U.rand(-0.8, 0.8), h.y + U.rand(0.5, 2.4), h.z + U.rand(-0.8, 0.8), 0xffeebb, 0.45, 0.5, 2.2); },
  });
  // whom the healing beam reaches: an ally near the aim first, else an enemy
  function beamTarget(h) {
    const a = h.facing, R = 16;
    let best = null, bk = 1e9;
    for (const o of HS.list) {
      if (o === h || !o.alive) continue;
      const d = U.dist(h.x, h.z, o.x, o.z);
      if (d > R) continue;
      const da = Math.abs(U.angleDiff(a, Math.atan2(o.z - h.z, o.x - h.x)));
      if (da > 0.5) continue;
      const k = da * 10 + d * 0.1;
      if (k < bk) { bk = k; best = o; }
    }
    if (best) return { t: best, ally: true };
    C.forEachTarget(h.x, h.z, R, (t) => {
      const da = Math.abs(U.angleDiff(a, Math.atan2(t.z - h.z, t.x - h.x)));
      if (da > 0.35) return;
      const k = da * 10 + U.dist(h.x, h.z, t.x, t.z) * 0.1;
      if (k < bk) { bk = k; best = t; }
    });
    return best ? { t: best, ally: false } : null;
  }

  // ---------- 6. berserker: the more it bleeds, the harder it hits ----------
  def({
    id: 'berserker', name: '광전사', role: '피를 볼수록 강해지는 근접 전사', emblem: 'axe', css: '#e0765a', energy: 0xff5a3a, ultDur: 7, orb: false, size: 1.06,
    trait: { name: '피의 갈증', desc: '잃은 체력만큼 피해와 공격 속도가 최대 50% 늘고, 근접 공격 피해의 8%만큼 체력을 회복합니다.' },
    basic: { name: '쌍도끼', icon: 'axe', desc: '앞쪽을 빠르게 베어 가르는 근접 연타', melee: { r: 3.0, arc: 2.3 }, knock: 4, sfx: 'swing' },
    stats(s) { s.maxHp = 140; s.armor += 2; s.speed *= 1.02; s.dmg = 21; s.fireRate = 2.6; s.crit += 0.05; },
    cardOff: MELEE_OFF, cardAlt: MELEE_ALT,
    skills: [
      { name: '소용돌이', icon: 'whirl', kind: 'channel', cd: 7, max: 3, moveK: 0.85,
        desc: '누르는 동안 도끼를 휘두르며 회전: 주변 3.6m의 적을 초당 5번 베고, 받는 피해 25% 감소',
        up: '소용돌이 피해 <b>+45%</b>, 범위 <b>+20%</b>' },
      { name: '도약 강타', icon: 'leap', kind: 'place', cd: 9, range: 12, ring: () => 4,
        desc: '정한 자리로 뛰어올라 내려찍음: 착지 4m 안의 적에게 큰 피해와 1초 기절. 공중에서는 무적',
        up: '도약 강타 대기시간 <b>-15%</b>, 기절 <b>+0.3초</b>',
        use(h, a) {
          const s = h.stats, x0 = h.x, z0 = h.z, p = freeSpot(a.x, a.z, 0.6), dur = 0.55;
          a.x = p.x; a.z = p.z;
          if (h.drive === 'input') { h.leap = { x0, z0, x1: p.x, z1: p.z, t: 0, dur }; h.invuln = Math.max(h.invuln, dur + 0.2); }
          if (shows(h)) vb(h, 'bzLeap', R1(x0), R1(z0), R1(p.x), R1(p.z), h.key);
          if (!h.auth) return;
          const d = 1 + extra(s) * 0.6;
          G.Enemies.later(dur, () => {
            G.Net.vis('bzLand', R1(p.x), R1(p.z), 4);
            C.forEachTarget(p.x, p.z, 4, (t) => {
              const dx = t.x - p.x, dz = t.z - p.z, dd = Math.hypot(dx, dz) || 1;
              C.damage(t, 70 * s.dmgMult, { kx: dx / dd, kz: dz / dd, knock: 10, source: 'skill', by: h });
              stun(t, d);
            });
          });
        } },
      { name: '전쟁의 함성', icon: 'horn', kind: 'self', cd: 14,
        desc: '포효로 6m 안의 적을 2초 동안 겁에 질려 달아나게 하고, 6초 동안 공격·이동 속도 +30%',
        up: '함성 피해 <b>+40%</b>, 범위 <b>+15%</b>',
        use(h) {
          h.rageT = 6;
          if (shows(h)) vb(h, 'bzRoar', R1(h.x), R1(h.z), h.key);
          if (!h.auth) return;
          const s = h.stats;
          C.forEachTarget(h.x, h.z, 6 * s.meteorRadius, (t) => {
            C.damage(t, 12 * s.meteorMult * s.dmgMult, { canCrit: false, source: 'skill', by: h });
            if (t.scare) t.scare(h.x, h.z, 2);
          });
        } },
    ],
    ult: { name: '피의 광란', icon: 'drop', desc: '7초 동안 쓰러지지 않고(체력 1 아래로 안 내려감) 공격 속도 +60%, 공격 피해의 25%만큼 흡혈. 처치할 때마다 0.5초 연장' },
    rateK: (h) => (1 + 0.5 * lost(h)) * (h.ultT > 0 ? 1.6 : 1),
    channel(h, i, dt) {
      const s = h.stats, r = 3.6 * (0.9 + 0.1 * s.lanceWidth);
      h.spinA = (h.spinA || 0) + dt * 17;
      for (let k = 0; k < 2; k++) {
        const a = h.spinA + k * Math.PI;
        G.FX.trail(h.x + Math.cos(a) * r * 0.8, h.y + 1.05, h.z + Math.sin(a) * r * 0.8, 0xffb08a, 0.6, 0.22, 2.4);
        G.FX.trail(h.x + Math.cos(a - 0.25) * r * 0.65, h.y + 0.95, h.z + Math.sin(a - 0.25) * r * 0.65, 0xff6a4a, 0.45, 0.18, 2);
      }
      if (Math.random() < 0.25) G.FX.smoke(h.x, h.y + 0.3, h.z, 1, 0x4a3a34, 1.4, 3);
      if (near(h.x, h.z) > 0.4) G.Audio.play('whirl');
      if (!h.auth) return;
      h.wTick = (h.wTick || 0) - dt;
      if (h.wTick > 0) return;
      h.wTick = 0.2;
      C.forEachTarget(h.x, h.z, r, (t) => {
        const dx = t.x - h.x, dz = t.z - h.z, d = Math.hypot(dx, dz) || 1;
        C.damage(t, 12 * s.lanceMult * s.dmgMult, { source: 'whirl', by: h, kx: dx / d, kz: dz / d, knock: 3 });
      });
    },
    chanEnd(h) { h.spinA = 0; },
    ultStart(h) { h.ultExt = 0; G.Net.vis('ultFx', 'berserker', R1(h.x), R1(h.z), h.key); },
    ultTick(h) { h.ultTick = 1; },
    model(h, add, M) {
      add(new THREE.SphereGeometry(0.3, 12, 9), M.steel, 0, 1.82, 0).scale.set(1.05, 0.95, 1.05);
      for (const sx of [-1, 1]) {
        const horn = add(new THREE.ConeGeometry(0.08, 0.55, 7), M.gold, sx * 0.3, 2.02, 0.05);
        horn.rotation.z = sx * -1.05; horn.rotation.x = -0.2;
      }
      add(new THREE.TorusGeometry(0.42, 0.14, 6, 14), new THREE.MeshStandardMaterial({ color: 0x5a3a26, roughness: 0.95 }), 0, 1.55, 0.02).rotation.x = Math.PI / 2;
      for (const sx of [-1, 1]) {
        const g = new THREE.Group();
        g.position.set(sx * 0.58, 1.02, -0.12);
        g.rotation.x = 0.5;
        h.body.add(g);
        const hd = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.9, 6), M.dark);
        const bl = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.05, 3, 1, false, 0, Math.PI), M.steel);
        bl.rotation.set(0, 0, Math.PI / 2); bl.position.set(sx * 0.1, 0.36, 0);
        hd.castShadow = bl.castShadow = true;
        g.add(hd, bl);
        h.geos.push(hd.geometry, bl.geometry);
      }
    },
    anim(h, dt, t) {
      h.body.rotation.y = h.chan === 1 ? h.spinA || 0 : U.damp(h.body.rotation.y % TAU, 0, 10, dt);
      const k = 1.22 * h.cls.size * (h.ultT > 0 ? 1.16 : 1);
      h.group.scale.setScalar(U.damp(h.group.scale.x, k, 8, dt));
    },
    look(h) {
      if (Math.random() < 0.7) G.FX.trail(h.x + U.rand(-0.7, 0.7), h.y + U.rand(0.4, 2.2), h.z + U.rand(-0.7, 0.7), 0xff3a2a, 0.5, 0.45, 2.4);
    },
  });

  // ---------- 7. engineer: turrets, mines and a pulse ----------
  def({
    id: 'engineer', name: '기계공', role: '포탑과 장치로 전장을 짜는 기술자', emblem: 'gear', css: '#7fd6e0', energy: 0x6fe8ff, ultDur: 8, orb: false,
    trait: { name: '정밀 공학', desc: '설치한 장치가 내 카드 효과(피해·치명타)를 그대로 받습니다. 포탑 6m 안의 동료는 공격 속도 +15%.' },
    basic: { name: '리벳건', icon: 'bolt', desc: '빠르게 연사하는 리벳', spread: 0.1, sfx: 'rivet' },
    stats(s) { s.maxHp = 100; s.dmg = 10; s.fireRate = 4.4; s.projSpeed = 40; s.projLife = 0.6; s.projSize = 0.85; },
    skills: [
      { name: '자동 포탑', icon: 'turret', kind: 'place', cd: 8, range: 10, tap: 'feet', ring: () => 1,
        desc: '정한 자리에 14초 동안 포탑: 18m 안의 적에게 초당 4발 자동 사격(내 공격력의 45%). 최대 2개',
        up: '포탑 피해 <b>+45%</b>, 사거리 <b>+20%</b>',
        use(h, a) {
          const p = freeSpot(a.x, a.z, 0.8);
          if (shows(h)) vb(h, 'enTurret', sid(h, 1, a.q), R1(p.x), R1(p.z), 14, h.key);
        } },
      { name: '지뢰 살포', icon: 'mine', kind: 'aim', cd: 10, line: () => ({ len: 7, w: 4.5 }),
        desc: '조준한 쪽으로 지뢰 5개를 흩뿌림. 적이 다가오면 터짐(반지름 3m), 20초 유지',
        up: '지뢰 대기시간 <b>-15%</b>, 유지 <b>+2초</b>',
        use(h, a) {
          const id = sid(h, 2, a.q), x = R1(h.x), z = R1(h.z), ang = R2(a.ang), life = R1(20 + extra(h.stats) * 4);
          if (shows(h)) vb(h, 'enMines', id, x, z, ang, life, h.key);
          if (!h.auth) return;
          for (const m of minePoints(x, z, ang)) CL.mines.push({ id: id + '-' + m.k, x: m.x, z: m.z, arm: 0.6, t: life, by: h });
        } },
      { name: '전자기 폭탄', icon: 'emp', kind: 'place', cd: 13, range: 16, ring: (s) => 5.5 * s.meteorRadius,
        desc: '정한 자리에서 0.5초 뒤 터져 반지름 5.5m의 적을 2초 기절시키고 그 안의 적 탄을 모두 지움',
        up: '전자기 폭탄 피해 <b>+40%</b>, 범위 <b>+15%</b>',
        use(h, a) {
          const s = h.stats, r = 5.5 * s.meteorRadius;
          if (shows(h)) vb(h, 'enEmp', R1(a.x), R1(a.z), R1(r));
          if (!h.auth) return;
          G.Enemies.later(0.5, () => C.forEachTarget(a.x, a.z, r, (t) => {
            C.damage(t, 30 * s.meteorMult * s.dmgMult, { canCrit: false, source: 'skill', cls: 'chain', by: h });
            stun(t, 2);
          }));
        } },
    ],
    ult: { name: '타이탄 포대', icon: 'cannon', desc: '8초 동안 거대 포대를 세워 24m 안의 가장 강한 적에게 폭발 포탄을 퍼붓고, 내 포탑들의 사격 속도가 두 배' },
    ultStart(h) {
      G.Net.vis('ultFx', 'engineer', R1(h.x), R1(h.z), h.key);
      const p = freeSpot(h.x + Math.cos(h.facing) * 1.8, h.z + Math.sin(h.facing) * 1.8, 1.1);
      h.ultN = (h.ultN || 0) + 1;
      G.Net.vis('enTitan', h.slot + '-u-' + h.ultN, R1(p.x), R1(p.z), 8, h.key);
    },
    ultTick(h) { h.ultTick = 1; },
    model(h, add, M) {
      for (const sx of [-1, 1]) {
        const g = add(new THREE.CylinderGeometry(0.085, 0.085, 0.1, 10), M.steel, sx * 0.1, 1.84, -0.22);
        g.rotation.x = Math.PI / 2;
        add(new THREE.CircleGeometry(0.07, 10), M.glow, sx * 0.1, 1.84, -0.275).rotation.y = Math.PI;
      }
      add(new THREE.TorusGeometry(0.26, 0.03, 6, 18), M.dark, 0, 1.84, 0).rotation.x = Math.PI / 2;
      add(new THREE.BoxGeometry(0.5, 0.55, 0.28), M.steel, 0, 1.32, 0.34);
      add(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 4), M.dark, 0.16, 1.86, 0.36);
      const tip = add(new THREE.SphereGeometry(0.05, 8, 6), M.glow, 0.16, 2.17, 0.36);
      h.parts.tip = tip;
      const w = new THREE.Group();
      w.position.set(0.55, 1.05, -0.12); w.rotation.x = 0.45;
      h.body.add(w);
      const hd = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.62, 0.07), M.steel);
      const jaw = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.035, 5, 10, Math.PI * 1.5), M.steel);
      jaw.position.y = 0.36; jaw.rotation.z = Math.PI * 0.75;
      hd.castShadow = jaw.castShadow = true;
      w.add(hd, jaw);
      h.geos.push(hd.geometry, jaw.geometry);
    },
    anim(h, dt, t) { if (h.parts.tip) h.parts.tip.visible = Math.sin(t * 6) > -0.3; },
    look(h) { if (Math.random() < 0.3) G.FX.spark(h.x + U.rand(-0.6, 0.6), h.y + U.rand(0.8, 2), h.z + U.rand(-0.6, 0.6), 0x6fe8ff, 2, 3); },
  });
  // five mines in a fan: worked out from rounded numbers so every machine puts them in the same spots
  function minePoints(x, z, ang) {
    const out = [];
    for (let k = 0; k < 5; k++) {
      const b = ang + (k - 2) * 0.3, d = 3.5 + (k % 2) * 2 + Math.abs(k - 2) * 0.4;
      const px = x + Math.cos(b) * d, pz = z + Math.sin(b) * d;
      if (G.World.isFree(px, pz, 0.5)) out.push({ k, x: px, z: pz });
    }
    return out;
  }

  // ---------- 8. assassin: strikes from the shadows ----------
  def({
    id: 'assassin', name: '그림자 암살자', role: '그림자에서 급소를 노리는 자객', emblem: 'mask', css: '#a98be6', energy: 0xb07aff, ultDur: 3, orb: false, size: 0.97, bare: ['shoulders'],
    trait: { name: '급소', desc: '체력이 30% 아래인 적에게 피해 2배(보스는 1.5배). 은신 중 첫 공격은 반드시 치명타에 피해 3배.' },
    basic: { name: '쌍단검', icon: 'dagger', desc: '짧은 거리로 빠르게 던지는 단검 두 자루', spread: 0.08, sfx: 'knife' },
    stats(s) { s.maxHp = 85; s.speed *= 1.12; s.dmg = 14; s.fireRate = 4.6; s.projSpeed = 46; s.projLife = 0.3; s.projCount = 2; s.projSize = 0.8; s.crit += 0.12; s.critMult += 0.4; },
    skills: [
      { name: '그림자 걸음', icon: 'blink', kind: 'aim', cd: 4.5, range: 11, line: (ch, s) => ({ len: 11 * (0.9 + 0.1 * s.lanceWidth), w: 1.2 }),
        desc: '조준한 쪽으로 최대 11m 순간이동하며 지나간 길의 적을 벰. 2.5초 안의 다음 공격은 반드시 치명타',
        up: '그림자 걸음 피해 <b>+45%</b>, 거리 <b>+20%</b>',
        use(h, a) {
          const s = h.stats, x0 = h.x, z0 = h.z;
          let x1 = a.x, z1 = a.z;
          if (h.drive === 'input') {
            [x1, z1] = reach(x0, z0, a.ang, 11 * (0.9 + 0.1 * s.lanceWidth));
            a.x = x1; a.z = z1;
            h.x = x1; h.z = z1; h.vx = 0; h.vz = 0; h.facing = a.ang;
            h.invuln = Math.max(h.invuln, 0.25);
          }
          h.critNextT = 2.5;
          if (shows(h)) vb(h, 'asStep', R1(x0), R1(z0), R1(x1), R1(z1), h.key);
          if (!h.auth) return;
          const ang = Math.atan2(z1 - z0, x1 - x0), d = Math.max(0.6, U.dist(x0, z0, x1, z1));
          C.line(x0, z0, ang, d, 2.2, (t) => C.damage(t, 50 * s.lanceMult * s.dmgMult, { source: 'skill', by: h, kx: Math.cos(ang), kz: Math.sin(ang), knock: 4 }));
        } },
      { name: '그림자 은신', icon: 'mask', kind: 'self', cd: 13,
        desc: '3초 동안 모습을 감춤: 적이 나를 놓치고 이동 속도 +35%. 공격하면 풀리지만 그 공격은 3배 치명타',
        up: '은신 대기시간 <b>-15%</b>, 지속 <b>+0.5초</b>',
        use(h) {
          h.stealthT = 3 + extra(h.stats);
          if (shows(h)) vb(h, 'asVanish', R1(h.x), R1(h.z), h.key);
          if (h.auth) for (const e of G.Enemies.list) if (e.target === h) e.tgT = 0;
        } },
      { name: '죽음의 표식', icon: 'skull', kind: 'aim', cd: 12, range: 20, line: () => ({ len: 20, w: 0.6 }),
        desc: '조준한 곳의 적에게 표식: 3초 뒤 그동안 받은 피해의 50%가 한꺼번에 터짐. 표식된 적이 쓰러지면 그림자 걸음·은신 대기시간 초기화',
        up: '표식 폭발 <b>+40%</b>',
        use(h, a) {
          if (!h.auth) { if (h.drive === 'input') G.Audio.play('markDeath'); return; }
          const t = markTarget(h, a);
          if (!t) return;
          t.dMark = { by: h, acc: 0, until: G.Game.time + 3, mult: h.stats.meteorMult, uid: t.uid };
          CL.dmarks.push(t);
          markEnemy(t, 3, 2);
          G.Net.vis('sfx', 'markDeath');
        } },
    ],
    ult: { name: '천의 칼날', icon: 'blades', desc: '3초 동안 그림자가 되어(무적) 14m 안의 적 사이를 오가며 12번 벰(한 번에 60)' },
    onShot(h) {
      if (h.stealthT > 0) { h.stealthT = 0; if (shows(h)) vb(h, 'asAmbush', R1(h.x), R1(h.z)); return { dmgK: 3, crit: true }; }
      if (h.critNextT > 0) { h.critNextT = 0; return { crit: true }; }
      return null;
    },
    ultStart(h) {
      G.Net.vis('ultFx', 'assassin', R1(h.x), R1(h.z), h.key);
      const s = h.stats, x0 = h.x, z0 = h.z, hit = new Map();
      let px = x0, pz = z0;
      for (let k = 0; k < 12; k++) {
        G.Enemies.later(0.15 + k * 0.2, () => {
          if (!h.alive) return;
          // the next one: whoever near the start has taken the fewest cuts
          let best = null, bk = 1e9;
          C.forEachTarget(x0, z0, 14, (t) => {
            const v = (hit.get(t) || 0) * 100 + U.dist2(px, pz, t.x, t.z) * 0.05 + Math.random() * 3;
            if (v < bk) { bk = v; best = t; }
          });
          if (!best) return;
          hit.set(best, (hit.get(best) || 0) + 1);
          G.Net.vis('asCut', R1(px), R1(pz), R1(best.x), R1(best.z));
          px = best.x; pz = best.z;
          C.damage(best, 60 * s.dmgMult, { source: 'ult', by: h });
        });
      }
    },
    ultTick(h) { h.ultTick = 1; },
    model(h, add, M) {
      const hood = add(new THREE.ConeGeometry(0.33, 0.66, 10), M.dark, 0, 2.0, 0.06);
      hood.rotation.x = 0.22;
      add(new THREE.BoxGeometry(0.4, 0.13, 0.08), M.dark, 0, 1.76, -0.21);
      for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.08, 0.035, 0.02), M.glow, sx * 0.08, 1.8, -0.255);
      const sc = add(new THREE.PlaneGeometry(0.22, 0.9), M.cape, 0.12, 1.3, 0.3);
      sc.rotation.set(0.35, 0, 0.1);
      for (const sx of [-1, 1]) {
        const d = add(new THREE.ConeGeometry(0.05, 0.5, 4), M.steel, sx * 0.55, 0.95, -0.15);
        d.rotation.x = -Math.PI / 2 - 0.3;
      }
    },
    look(h) {
      if (Math.random() < 0.6) G.FX.smoke(h.x + U.rand(-0.5, 0.5), h.y + U.rand(0.3, 1.4), h.z + U.rand(-0.5, 0.5), 1, 0x2a1a3a, 1.2, 1);
    },
  });
  // the death mark lands on the enemy closest to the chosen spot, else the first one down the aim
  function markTarget(h, a) {
    let best = null, bd = 36;
    C.forEachTarget(a.x, a.z, 6, (t) => { const d = U.dist2(a.x, a.z, t.x, t.z); if (d < bd) { bd = d; best = t; } });
    if (best) return best;
    let bp = 1e9;
    C.line(h.x, h.z, a.ang, 20, 3, (t, p) => { if (p < bp) { bp = p; best = t; } });
    return best;
  }

  // ---------- 9. chronomancer: bends time ----------
  def({
    id: 'chrono', name: '시간술사', role: '시간을 비틀어 싸움을 다스리는 마법사', emblem: 'clock', css: '#8fe0d0', energy: 0x7fffe0, ultDur: 4,
    trait: { name: '느린 시간', desc: '주변 6m의 적과 적 탄이 20% 느려집니다. 기본 공격에 맞은 적은 1.5초 동안 30% 둔화.' },
    basic: { name: '시간 구슬', icon: 'orb', desc: '맞은 적을 느리게 만드는 시간의 구슬', spread: 0.12, sfx: 'tick' },
    stats(s) { s.maxHp = 95; s.dmg = 15; s.fireRate = 3.7; s.projSpeed = 30; s.projLife = 0.8; s.projSize = 1.1; },
    skills: [
      { name: '감속장', icon: 'hourglass', kind: 'place', cd: 10, range: 18, tap: 'feet', ring: (s) => 6 * (0.9 + 0.1 * s.lanceWidth),
        desc: '6초 동안 반지름 6m 감속장: 안의 적은 70% 느려지고 적 탄은 거의 멈춤',
        up: '감속장 지속 <b>+2초</b>, 크기 <b>+20%</b>',
        use(h, a) {
          const s = h.stats, r = 6 * (0.9 + 0.1 * s.lanceWidth), dur = 6 + (s.lanceMult - 1) * 4.4;
          if (shows(h)) vb(h, 'chField', sid(h, 1, a.q), R1(a.x), R1(a.z), R1(r), R1(dur), h.key);
        } },
      { name: '시간 역행', icon: 'rewind', kind: 'self', cd: 14,
        desc: '3초 전의 자리와 체력으로 되돌아감(지금 체력이 더 높으면 그대로). 떠난 자리의 잔상이 터지며 적을 밀쳐냄',
        up: '시간 역행 대기시간 <b>-15%</b>',
        use(h) {
          const p = h.hist && h.hist[0];
          if (!p) return;
          const x0 = h.x, z0 = h.z;
          if (h.drive === 'input') { h.x = p[0]; h.z = p[1]; h.vx = 0; h.vz = 0; h.invuln = Math.max(h.invuln, 0.5); }
          if (shows(h)) vb(h, 'chRewind', R1(x0), R1(z0), R1(p[0]), R1(p[1]), h.key);
          h.hist.length = 0;
          if (!h.auth) return;
          if (p[2] > h.hp + 1) {
            const d = Math.min(h.stats.maxHp, p[2]) - h.hp;
            h.hp += d;
            G.Net.vis('heal', R1(p[0]), R1(p[1]), Math.round(d));
          }
          C.forEachTarget(x0, z0, 4, (t) => {
            const dx = t.x - x0, dz = t.z - z0, d = Math.hypot(dx, dz) || 1;
            C.damage(t, 25 * h.stats.dmgMult, { canCrit: false, kx: dx / d, kz: dz / d, knock: 12, source: 'skill', by: h });
          });
        } },
      { name: '가속', icon: 'haste', kind: 'self', cd: 16,
        desc: '자신과 10m 안 동료가 5초 동안 이동·공격 속도 +30%, 그동안 스킬 대기시간이 두 배 빨리 돎',
        up: '가속 지속 <b>+1초</b>, 범위 <b>+15%</b>',
        use(h) {
          if (shows(h)) vb(h, 'chHasteFx', R1(h.x), R1(h.z), h.key);
          if (!h.auth) return;
          const s = h.stats, r = 10 * s.meteorRadius, dur = 5 + (s.meteorMult - 1) * 2.5;
          const keys = HS.list.filter((o) => o.alive && U.dist2(o.x, o.z, h.x, h.z) < r * r).map((o) => o.key);
          G.Net.vis('chHaste', R1(dur), ...keys);
        } },
    ],
    ult: { name: '시간 정지', icon: 'clock', desc: '4초 동안 모든 적과 적 탄이 멈춤(보스는 크게 느려짐). 멈춘 적은 25% 더 아프게 맞음' },
    ultStart(h) { G.Net.vis('ultFx', 'chrono', R1(h.x), R1(h.z), h.key); G.Net.vis('chStop', 4); },
    ultTick(h) { h.ultTick = 1; },
    model(h, add, M) {
      const halo = new THREE.Group();
      halo.position.set(0, 1.55, 0.34);
      h.body.add(halo);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.03, 6, 32), M.gold);
      halo.add(ring);
      h.geos.push(ring.geometry);
      for (let i = 0; i < 12; i++) {
        const tk = new THREE.Mesh(new THREE.BoxGeometry(0.03, i % 3 ? 0.06 : 0.12, 0.03), M.glow);
        const a = (i / 12) * TAU;
        tk.position.set(Math.sin(a) * 0.43, Math.cos(a) * 0.43, 0);
        tk.rotation.z = -a;
        halo.add(tk);
        h.geos.push(tk.geometry);
      }
      const hand1 = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.34, 0.02).translate(0, 0.17, 0), M.glow);
      const hand2 = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.24, 0.02).translate(0, 0.12, 0), M.gold);
      halo.add(hand1, hand2);
      h.geos.push(hand1.geometry, hand2.geometry);
      h.parts.hands = [hand1, hand2];
      const hg = new THREE.Group();
      hg.position.set(-0.5, 1.25, -0.2);
      h.body.add(hg);
      for (const sy of [1, -1]) {
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.16, 8), M.glow);
        c.position.y = sy * 0.09; c.rotation.x = sy > 0 ? Math.PI : 0;
        hg.add(c);
        h.geos.push(c.geometry);
      }
      h.parts.glass = hg;
      add(new THREE.TorusGeometry(0.27, 0.03, 6, 18), M.gold, 0, 2.0, 0).rotation.x = Math.PI / 2;
    },
    anim(h, dt, t) {
      const hn = h.parts.hands;
      if (hn) { const k = h.ultT > 0 ? 0.15 : 1; hn[0].rotation.z = -t * 2.4 * k; hn[1].rotation.z = -t * 0.2 * k; }
      if (h.parts.glass) { h.parts.glass.rotation.z = Math.sin(t * 1.3) * 0.4; h.parts.glass.position.y = 1.25 + Math.sin(t * 2.2) * 0.06; }
    },
    look(h) { if (Math.random() < 0.4) G.FX.trail(h.x + U.rand(-0.8, 0.8), h.y + U.rand(0.4, 2.2), h.z + U.rand(-0.8, 0.8), 0x7fffe0, 0.4, 0.6, 2); },
  });

  // ---------- 10. gunslinger: six shots, then reload ----------
  def({
    id: 'gunslinger', name: '총잡이', role: '여섯 발로 승부하는 무법자', emblem: 'gun', css: '#e8c07a', energy: 0xffc46a, ultDur: 2.5, orb: false, ammo: 6,
    trait: { name: '마지막 한 발', desc: '탄창의 마지막 한 발은 피해 2배에 반드시 치명타. 재장전이 끝나면 1.5초 동안 이동 속도 +20%.' },
    basic: { name: '리볼버', icon: 'gun', desc: '여섯 발을 쏘고 재장전(약 1.1초)', spread: 0.05, sfx: 'gun' },
    stats(s) { s.maxHp = 100; s.speed *= 1.05; s.dmg = 26; s.fireRate = 5.2; s.projSpeed = 64; s.projLife = 0.5; s.projSize = 0.8; s.crit += 0.08; },
    skills: [
      { name: '패닝', icon: 'fan', kind: 'aim', cd: 6, line: () => ({ len: 20, w: 7 }),
        desc: '남은 총알을 조준한 쪽 부채꼴로 순식간에 모두 쏟아붓고 바로 재장전(한 발당 피해 +30%)',
        up: '패닝 피해 <b>+45%</b>',
        use(h, a) {
          const n = Math.max(2, h.ammo || 0);
          h.ammo = 6; h.reloadT = 0; h.facing = a.ang;
          if (shows(h)) vb(h, 'gsFan', R1(h.x), R1(h.z), R2(a.ang), n, h.key);
          if (h.auth) fanShots(h, h.x, h.z, a.ang, n, false);
        } },
      { name: '구르기', icon: 'roll', kind: 'aim', dir: 'move', cd: 4,
        desc: '움직이는 쪽(멈춰 있으면 조준한 쪽)으로 7m 굴러 피하고(무적) 탄창을 바로 채움',
        up: '구르기 대기시간 <b>-15%</b>',
        use(h, a) {
          if (h.drive === 'input') { h.dashDir = { x: Math.cos(a.ang), z: Math.sin(a.ang) }; h.dashT = 7 / 46; h.invuln = Math.max(h.invuln, 0.4); }
          h.ammo = 6; h.reloadT = 0;
          if (shows(h)) vb(h, 'gsRoll', R1(h.x), R1(h.z), R2(a.ang), h.key);
        } },
      { name: '올가미', icon: 'lasso', kind: 'aim', cd: 9, range: 14, line: () => ({ len: 14, w: 1.2 }),
        desc: '올가미를 던져 처음 걸린 적을 내 앞으로 끌어오고 1.5초 기절. 보스에게 걸면 내가 보스 앞으로 날아감',
        up: '올가미 피해 <b>+40%</b>',
        use(h, a) {
          const s = h.stats, ang = a.ang, R = 14;
          let first = null, bp = 1e9;
          C.line(h.x, h.z, ang, R, 1.8, (t, p) => { if (p < bp) { bp = p; first = t; } });
          const ex = first ? first.x : h.x + Math.cos(ang) * R, ez = first ? first.z : h.z + Math.sin(ang) * R;
          if (shows(h)) vb(h, 'gsLasso', R1(h.x), R1(h.z), R1(ex), R1(ez), h.key);
          if (first && first.isBoss && h.drive === 'input') yank(h, ex, ez);
          if (!h.auth || !first) return;
          C.damage(first, 25 * s.meteorMult * s.dmgMult, { source: 'skill', by: h });
          if (first.isBoss) { if (h.drive !== 'input') G.Net.vis('gsYank', h.key, R1(ex), R1(ez)); return; }
          if (first.pullTo) first.pullTo(h.x + Math.cos(ang) * 2.2, h.z + Math.sin(ang) * 2.2);
          stun(first, 1.5);
        } },
    ],
    ult: { name: '필중의 눈', icon: 'target', desc: '24m 안의 적을 최대 8명까지 차례로 조준한 뒤 한 발씩 모두 명중(반드시 치명타, 피해 ×4)' },
    canFire: (h) => !(h.reloadT > 0),
    onShot(h) {
      h.ammo = Math.max(0, (h.ammo == null ? 6 : h.ammo) - 1);
      h.idleT = 0;
      if (h.ammo > 0) return null;
      h.reloadT = reloadTime(h);
      if (h === G.Player) G.Audio.play('reloadStart');
      return { dmgK: 2, crit: true, color: 0xffffff };
    },
    timers(h, dt) {
      if (h.reloadT > 0) {
        h.reloadT -= dt;
        if (h.reloadT <= 0) { h.reloadT = 0; h.ammo = 6; h.speedT = 1.5; if (h === G.Player) G.Audio.play('reload'); }
      } else if (!h.firing && h.ammo < 6) {
        // stop shooting for a moment and the gun fills itself
        h.idleT = (h.idleT || 0) + dt;
        if (h.idleT > 1.4) { h.idleT = 0; h.reloadT = reloadTime(h) * 0.8; }
      }
    },
    ultStart(h) {
      G.Net.vis('ultFx', 'gunslinger', R1(h.x), R1(h.z), h.key);
      const s = h.stats, list = [];
      C.forEachTarget(h.x, h.z, 24, (t) => list.push(t));
      const score = (t) => (t.isBoss ? 1e7 : 0) + (t.elite ? 1e6 : 0) + (t.maxHp || 0);
      list.sort((a, b) => score(b) - score(a));
      const tg = list.slice(0, 8);
      tg.forEach((t, i) => G.Enemies.later(0.12 + i * 0.12, () => { if (t.alive) markEnemy(t, 1.8, 3); }));
      tg.forEach((t, i) => G.Enemies.later(1.3 + i * 0.08, () => {
        if (!t.alive || !h.alive) return;
        G.Net.vis('gsShot', R1(h.x), R1(h.z), R1(t.x), R1(t.z));
        C.damage(t, s.dmg * s.dmgMult * 4, { crit: true, source: 'ult', by: h, kx: t.x - h.x, kz: t.z - h.z, knock: 8 });
      }));
    },
    ultTick(h) { h.ultTick = 1; },
    model(h, add, M) {
      add(new THREE.CylinderGeometry(0.52, 0.52, 0.035, 18), M.cape, 0, 1.98, 0);
      add(new THREE.CylinderGeometry(0.23, 0.27, 0.26, 12), M.cape, 0, 2.12, 0);
      add(new THREE.TorusGeometry(0.255, 0.025, 6, 16), M.dark, 0, 2.02, 0).rotation.x = Math.PI / 2;
      const bd = add(new THREE.TorusGeometry(0.36, 0.04, 6, 18), M.dark, 0, 1.3, 0);
      bd.rotation.set(Math.PI / 2, 0.55, 0);
      const gun = new THREE.Group();
      gun.position.set(0.55, 1.12, -0.25);
      h.body.add(gun);
      const parts = [
        [new THREE.BoxGeometry(0.08, 0.2, 0.1), M.dark, 0, -0.08, 0.05],
        [new THREE.CylinderGeometry(0.035, 0.035, 0.42, 8).rotateX(Math.PI / 2), M.steel, 0, 0.04, -0.16],
        [new THREE.CylinderGeometry(0.075, 0.075, 0.12, 8).rotateX(Math.PI / 2), M.steel, 0, 0.03, -0.02],
      ];
      for (const [g, m, x, y, z] of parts) { const me = new THREE.Mesh(g, m); me.position.set(x, y, z); me.castShadow = true; gun.add(me); h.geos.push(g); }
      h.parts.gun = gun;
    },
    anim(h, dt, t) {
      const g = h.parts.gun;
      if (!g) return;
      // a spin of the revolver while it reloads
      g.rotation.x = h.reloadT > 0 ? g.rotation.x - dt * 18 : U.damp(g.rotation.x % TAU, 0, 12, dt);
    },
    look(h) { if (Math.random() < 0.3) G.FX.trail(h.x + U.rand(-0.6, 0.6), h.y + U.rand(0.6, 2), h.z + U.rand(-0.6, 0.6), 0xffc46a, 0.4, 0.4, 2); },
  });
  const reloadTime = (h) => U.clamp(1.1 * (5.2 / h.stats.fireRate), 0.45, 1.3);
  function fanShots(h, x, z, ang, n, cos) {
    const s = h.stats;
    for (let k = 0; k < n; k++) {
      const b = ang + (n > 1 ? (k / (n - 1) - 0.5) * 0.55 : 0), last = k === n - 1;
      G.Proj.spawnPlayer({ x: x + Math.cos(b) * 0.7, z: z + Math.sin(b) * 0.7, y: hy(x, z) + 1.35, angle: b, speed: s.projSpeed, life: s.projLife,
        dmg: s.dmg * s.dmgMult * 1.3 * s.lanceMult * (last ? 2 : 1), size: s.projSize, pierce: s.pierce, ricochet: s.ricochet, homing: s.homing,
        color: last ? 0xffffff : 0xffd27a, source: 'bolt', procs: true, by: h, cos, crit: last });
    }
  }
  // a lasso on a boss pulls the gunslinger to it instead
  function yank(h, x, z) {
    const d = U.dist(h.x, h.z, x, z) - 3;
    if (d <= 0.5) return;
    const ang = Math.atan2(z - h.z, x - h.x);
    h.dashDir = { x: Math.cos(ang), z: Math.sin(ang) };
    h.dashT = d / 46;
    h.invuln = Math.max(h.invuln, h.dashT + 0.25);
  }

  // ================= what the hero code asks =================
  CL.resetHero = function (h) {
    h.stealthT = 0; h.hasteT = 0; h.rageT = 0; h.critNextT = 0; h.shieldHp = 0; h.shieldT = 0; h.surgeT = 0; h.speedT = 0;
    h.bStore = 0; h.fTick = 0; h.bTick = 0; h.wTick = 0; h.spinA = 0; h.ultExt = 0; h.hist = []; h.histT = 0; h.auraT = 0;
    h.ammo = h.cls.ammo || 0; h.reloadT = 0; h.idleT = 0; h.swingSide = 1;
  };
  // every machine: the timers of buffs that the caster and the host both set
  CL.timers = function (h, dt) {
    for (const k of ['stealthT', 'hasteT', 'rageT', 'critNextT', 'surgeT', 'speedT']) if (h[k] > 0) h[k] = Math.max(0, h[k] - dt);
    if (h.shieldT > 0) { h.shieldT -= dt; if (h.shieldT <= 0 && h.auth) { h.shieldT = 0; h.shieldHp = 0; } }
    if (h.cls.timers) h.cls.timers(h, dt);
    // where the chronomancer was, for the rewind (kept by the caster and the host)
    if (h.cls.id === 'chrono' && (h.drive === 'input' || h.auth)) {
      h.histT -= dt;
      if (h.histT <= 0) { h.histT = 0.1; h.hist.push([h.x, h.z, h.hp]); if (h.hist.length > 30) h.hist.shift(); }
    }
  };
  // the authoritative machine, every frame: the cleric's aura
  CL.tick = function (h, dt) {
    if (h.cls.id !== 'cleric') return;
    h.auraT = (h.auraT || 0) - dt;
    if (h.auraT > 0) return;
    h.auraT = 1;
    for (const o of HS.list) if (o.alive && U.dist2(o.x, o.z, h.x, h.z) < 64) o.heal(2, true, h);
  };
  CL.rateK = function (h) {
    let k = h.cls.rateK ? h.cls.rateK(h) : 1;
    if (h.hasteT > 0) k *= 1.3;
    if (h.rageT > 0) k *= 1.3;
    for (const s of CL.summons) if (s.kind === 'turret' && !s.dead && U.dist2(s.x, s.z, h.x, h.z) < 36) { k *= 1.15; break; }
    return k;
  };
  CL.moveK = function (h) {
    let k = 1;
    if (h.charging) k *= 0.55;
    if (h.chan) k *= h.cls.skills[h.chan - 1].moveK || 0.7;
    if (h.stealthT > 0) k *= 1.35;
    if (h.hasteT > 0) k *= 1.3;
    if (h.rageT > 0) k *= 1.3;
    if (h.speedT > 0) k *= 1.2;
    if (h.ultT > 0) k *= 1.15;
    return k;
  };
  CL.cdRate = (h) => (h.hasteT > 0 ? 2 : 1);
  // all damage a hero takes runs through this: traits, blocks, banners and domes
  CL.takenMult = function (h, sx, sz, amount) {
    let m = 1;
    const id = h.cls.id;
    if (id === 'guardian') {
      m *= 0.8;
      if (h.chan === 1 && sx != null && Math.abs(U.angleDiff(h.facing, Math.atan2(sz - h.z, sx - h.x))) < 1.05) {
        m *= 0.2;
        h.bStore = (h.bStore || 0) + (amount || 10);
        G.Net.vis('ring', R1(h.x + Math.cos(h.facing) * 1.3), R1(h.z + Math.sin(h.facing) * 1.3), 0.3, 1.4, 0.2, 0xffd98a);
      }
    }
    if (id === 'berserker' && h.chan === 1) m *= 0.75;
    for (const g of HS.list) if (g !== h && g.alive && g.cls.id === 'guardian' && U.dist2(g.x, g.z, h.x, h.z) < 36) { m *= 0.9; break; }
    for (const d of CL.decoys) if (d.alive && U.dist2(d.x, d.z, h.x, h.z) < 25) { m *= 0.75; break; }
    for (const s of CL.summons) if (s.kind === 'dome' && !s.dead && U.dist2(s.x, s.z, h.x, h.z) < s.r * s.r) { m *= 0.5; break; }
    return Math.max(0.12, m);
  };
  // a holy shield soaks the hit first; whatever is left gets through
  CL.absorb = function (h, dmg) {
    if (!(h.shieldHp > 0)) return dmg;
    const a = Math.min(h.shieldHp, dmg);
    h.shieldHp -= a;
    if (h.shieldHp <= 0.5) { h.shieldHp = 0; h.shieldT = 0; G.Net.vis('ring', R1(h.x), R1(h.z), 0.5, 2, 0.3, 0xffeebb); }
    return dmg - a;
  };
  CL.immune = (h) => h.cls.id === 'assassin' && h.ultT > 0;
  CL.undying = (h) => h.cls.id === 'berserker' && h.ultT > 0;
  // what the hero deals: marks, the falconer's long shots, the berserker's blood, the assassin's
  // finishing blows, the cleric's hymn for everyone
  CL.dealtMult = function (h, t) {
    let m = 1;
    const id = h.cls.id;
    if ((t.markUntil || 0) > G.Game.time) m *= 1.15;
    if (id === 'ranger' && U.dist2(h.x, h.z, t.x, t.z) > 196) m *= 1.3;
    else if (id === 'berserker') m *= 1 + 0.5 * lost(h);
    else if (id === 'assassin' && hpFrac(t) < 0.3) m *= t.isBoss ? 1.5 : 2;
    for (const o of HS.list) if (o.cls.id === 'cleric' && o.ultT > 0) { m *= 1.25; break; }
    return m;
  };
  CL.critBonus = () => 0;
  // after a hit lands (authoritative machine)
  CL.onHit = function (h, t, dealt, crit, killed, o) {
    const id = h.cls.id;
    if (t.dMark && !killed) t.dMark.acc += dealt;
    if (id === 'ranger' && crit && !killed) markEnemy(t, 4, 1);
    else if (id === 'chrono' && o.source === 'bolt' && !killed) slow(t, 0.3, 1.5);
    else if (id === 'berserker' && (o.source === 'melee' || o.source === 'whirl')) h.heal(dealt * (h.ultT > 0 ? 0.25 : 0.08), true);
  };
  CL.onKill = function (e) {
    const h = e.lastBy;
    if (e.dMark) { const by = e.dMark.by; e.dMark = null; if (by) G.Net.vis('cdReset', by.key, 3); }
    if (!h || !h.cls) return;
    if (h.cls.id === 'berserker' && h.ultT > 0 && (h.ultExt || 0) < 4) { h.ultT += 0.5; h.ultExt = (h.ultExt || 0) + 0.5; }
    // the pyromancer's burning dead burst and pass the fire on
    if (h.cls.id === 'pyro' && e.burn > 0) {
      G.Net.vis('boom', R1(e.x), R1(e.z), 2.5, 0xff7a2a, 0.05);
      C.forEachTarget(e.x, e.z, 2.6, (t) => {
        if (t === e) return;
        C.damage(t, 14 * h.stats.dmgMult, { canCrit: false, source: 'explosion', by: h });
        if (t.applyStatus) t.applyStatus('burn', 10, 3);
      });
    }
  };
  // monsters' pace at a point (host) and enemy shots' pace (every machine): fields, the
  // chronomancer's aura, the time stop
  CL.enemyK = function (x, z) {
    if (CL.stopT > 0) return 0;
    let k = 1;
    for (const h of HS.list) if (h.alive && h.cls.id === 'chrono' && U.dist2(h.x, h.z, x, z) < 36) { k *= 0.8; break; }
    for (const s of CL.summons) if (s.kind === 'field' && !s.dead && U.dist2(s.x, s.z, x, z) < s.r * s.r) { k *= 0.3; break; }
    return k;
  };
  CL.shotK = function (x, z) {
    if (CL.stopT > 0) return 0;
    let k = 1;
    for (const h of HS.list) if (h.alive && h.cls.id === 'chrono' && U.dist2(h.x, h.z, x, z) < 36) { k *= 0.8; break; }
    for (const s of CL.summons) if (s.kind === 'field' && !s.dead && U.dist2(s.x, s.z, x, z) < s.r * s.r) { k *= 0.25; break; }
    return k;
  };
  CL.bossK = () => (CL.stopT > 0 ? 0.2 : 1);
  // an enemy shot meets a raised shield or a dome (every machine; the host's copy is the real one)
  CL.blockShot = function (b) {
    for (const h of HS.list) {
      if (!h.alive || h.chan !== 1 || h.cls.id !== 'guardian') continue;
      const dx = b.x - h.x, dz = b.z - h.z, d2 = dx * dx + dz * dz;
      if (d2 > 6.8 || Math.abs(U.angleDiff(h.facing, Math.atan2(dz, dx))) > 1.05) continue;
      if (G.auth()) h.bStore = (h.bStore || 0) + (b.dmg || 8);
      G.FX.spark(b.x, b.y, b.z, 0xffe08a, 6, 6);
      G.Audio.play('clink');
      return true;
    }
    for (const s of CL.summons) {
      if (s.kind !== 'dome' || s.dead || U.dist2(s.x, s.z, b.x, b.z) > s.r * s.r) continue;
      G.FX.spark(b.x, b.y, b.z, 0xffe08a, 4, 4);
      return true;
    }
    return false;
  };
  // a banner close enough pulls a monster's attention (bosses ignore it)
  CL.decoyFor = function (x, z) {
    for (const d of CL.decoys) if (d.alive && U.dist2(d.x, d.z, x, z) < d.r * d.r) return d;
    return null;
  };
  CL.opacity = (h) => (h.stealthT > 0 || h.stealthVis ? (h === G.Player ? 0.38 : 0.22) : 1);
  CL.hidden = (h) => h.cls.id === 'assassin' && h.ultT > 0;
  CL.anim = function (h, dt, t) { if (h.cls.anim) h.cls.anim(h, dt, t); };
  CL.ultLook = function (h, dt, t) { if (h.ultT > 0 && h.alive && h.cls.look) h.cls.look(h, dt, t); };
  // channels: start, every frame on every machine (damage only where auth), end
  CL.chanStart = (h, i) => { if (h.cls.chanStart) h.cls.chanStart(h, i); };
  CL.channel = (h, i, dt) => { if (h.cls.channel) h.cls.channel(h, i, dt); };
  CL.chanEnd = (h, i, cancel) => { if (h.cls.chanEnd) h.cls.chanEnd(h, i, cancel); };

  // a melee basic attack: one sweep in front (every machine draws it, the host deals it)
  CL.swing = function (h) {
    const s = h.stats, b = h.cls.basic, m = b.melee, n = Math.max(1, s.projCount);
    const r = m.r * (0.85 + 0.15 * s.projSize), half = Math.min(Math.PI, (m.arc * (1 + 0.25 * (n - 1))) / 2);
    const a = Math.atan2(h.aimZ - h.z, h.aimX - h.x);
    h.swingSide = -(h.swingSide || 1);
    swingFx(h, a, r, half, h.swingSide, b.melee.r > 3.2 ? 0xffe6a0 : 0xffb090);
    if (h === G.Player) { G.Audio.play(b.sfx || 'swing'); G.UI.fireKick(); }
    else if (near(h.x, h.z) > 0.5) G.Audio.play(b.sfx || 'swing');
    if (!h.auth) return;
    const dmg = s.dmg * s.dmgMult * (1 + 0.2 * (n - 1)), kn = b.knock || 4;
    C.forEachTarget(h.x, h.z, r, (t) => {
      if (!inCone(h, t, a, half)) return;
      const dx = t.x - h.x, dz = t.z - h.z, d = Math.hypot(dx, dz) || 1;
      C.damage(t, dmg, { kx: dx / d, kz: dz / d, knock: kn, source: 'melee', procs: true, by: h });
    });
  };
  function swingFx(h, a, r, half, side, color) {
    const y = h.y + 1.05, n = 14, c = tmpC.set(color);
    for (let i = 0; i <= n; i++) {
      const k = i / n, b = a + side * (k - 0.5) * 2 * half, rr = r * (0.75 + 0.2 * Math.sin(k * Math.PI));
      G.FX.P.emit(h.x + Math.cos(b) * rr, y, h.z + Math.sin(b) * rr, Math.cos(b) * 2, 0.5, Math.sin(b) * 2, 0.16 + k * 0.08, 0.55, 0.05, c.r * 2.6, c.g * 2.6, c.b * 2.6, 1, 3, 0);
    }
  }

  // ================= the authoritative machine: zones, traps, mines, marks =================
  CL.update = function (dt) {
    if (CL.stopT > 0) { CL.stopT = Math.max(0, CL.stopT - dt); if (CL.stopT <= 0) stopEnd(); }
    if (G.auth()) {
      for (let i = CL.zones.length - 1; i >= 0; i--) {
        const z = CL.zones[i];
        z.t -= dt; z.tick -= dt;
        if (z.tick <= 0) { z.tick += z.every; z.fn(z); }
        if (z.t <= 0) CL.zones.splice(i, 1);
      }
      for (let i = CL.decoys.length - 1; i >= 0; i--) {
        const d = CL.decoys[i];
        d.t -= dt;
        if (d.t <= 0 || !d.alive) { d.alive = false; CL.decoys.splice(i, 1); }
      }
      updateTraps(dt);
      updateMines(dt);
      updateDeathMarks();
      if (CL.stopT > 0) for (const e of G.Enemies.list) if (e.alive) e.freeze = Math.max(e.freeze, 0.12);
    }
    for (let i = fxq.length - 1; i >= 0; i--) { fxq[i].t -= dt; if (fxq[i].t <= 0) { const f = fxq[i].fn; fxq.splice(i, 1); f(); } }
    updateSummons(dt);
    updateFx(dt);
    updateMarks(dt);
  };
  function updateTraps(dt) {
    for (let i = CL.traps.length - 1; i >= 0; i--) {
      const q = CL.traps[i];
      q.t -= dt; q.arm -= dt;
      if (q.t <= 0) { CL.traps.splice(i, 1); G.Net.vis('sumEnd', q.id, 0); continue; }
      if (q.arm > 0) continue;
      let any = false;
      C.forEachTarget(q.x, q.z, q.r * 0.6, () => { any = true; });
      if (!any) continue;
      CL.traps.splice(i, 1);
      G.Net.vis('sumEnd', q.id, 2);
      const s = q.by.stats;
      C.forEachTarget(q.x, q.z, q.r, (t) => {
        C.damage(t, 40 * s.dmgMult, { canCrit: false, source: 'skill', by: q.by });
        if (t.isBoss) slow(t, 0.5, 2);
        else if (t.rootFor) t.rootFor(q.hold);
      });
    }
  }
  function updateMines(dt) {
    for (let i = CL.mines.length - 1; i >= 0; i--) {
      const m = CL.mines[i];
      m.t -= dt; m.arm -= dt;
      if (m.t <= 0) { CL.mines.splice(i, 1); G.Net.vis('sumEnd', m.id, 0); continue; }
      if (m.arm > 0) continue;
      let any = false;
      C.forEachTarget(m.x, m.z, 1.6, () => { any = true; });
      if (!any) continue;
      CL.mines.splice(i, 1);
      G.Net.vis('sumEnd', m.id, 3);
      const s = m.by.stats;
      C.forEachTarget(m.x, m.z, 3, (t) => {
        const dx = t.x - m.x, dz = t.z - m.z, d = Math.hypot(dx, dz) || 1;
        C.damage(t, 55 * s.dmgMult, { kx: dx / d, kz: dz / d, knock: 9, source: 'explosion', by: m.by });
      });
    }
  }
  function updateDeathMarks() {
    for (let i = CL.dmarks.length - 1; i >= 0; i--) {
      const t = CL.dmarks[i], m = t.dMark;
      if (!m || !t.alive || (m.uid != null && t.uid !== m.uid)) { CL.dmarks.splice(i, 1); continue; }
      if (G.Game.time < m.until) continue;
      CL.dmarks.splice(i, 1);
      t.dMark = null;
      G.Net.vis('asBurst', R1(t.x), R1(t.z));
      C.damage(t, (25 + m.acc * 0.5) * m.mult, { canCrit: false, source: 'skill', cls: 'crit', by: m.by });
    }
  }

  // ================= summons (on every machine) =================
  // kind: make(s), update(s, dt, t, owner, idle), end(s). idle: the owner is choosing a card and
  // is shielded, so nothing of theirs attacks meanwhile.
  const SUM = {};
  CL.addSummon = function (kind, o) {
    if (!SUM[kind]) return null;
    const s = Object.assign({ kind, t: 0, dur: 5, dead: false, endFx: 0 }, o);
    SUM[kind].make(s);
    CL.summons.push(s);
    return s;
  };
  function updateSummons(dt) {
    const tt = performance.now() / 1000;
    for (let i = CL.summons.length - 1; i >= 0; i--) {
      const s = CL.summons[i], o = HS.get(s.owner);
      s.t += dt;
      if (!o || s.dead || s.t >= s.dur) { SUM[s.kind].end(s); CL.summons.splice(i, 1); continue; }
      SUM[s.kind].update(s, dt, tt, o, G.Game.isPicking(o));
    }
  }
  const grow = (s, k0 = 0.3, k1 = 0.4) => U.easeOutBack(Math.min(1, s.t / k0)) * (s.t > s.dur - k1 ? Math.max(0.01, (s.dur - s.t) / k1) : 1);
  const dropMesh = (s) => { if (s.mesh) scene().remove(s.mesh); };

  SUM.turret = {
    make(s) {
      const g = (s.mesh = new THREE.Group());
      const dark = mat('stD', () => std(0x3e4552)), light = mat('stL', () => std(0xb8c4d0)), cy = mat('cyanG', () => glowM(0x6fe8ff, 2.6));
      addM(g, geo('tBase', () => new THREE.CylinderGeometry(0.6, 0.78, 0.5, 8)), dark, 0, 0.25, 0);
      addM(g, geo('tRing', () => new THREE.TorusGeometry(0.56, 0.06, 6, 20).rotateX(Math.PI / 2)), cy, 0, 0.52, 0, false);
      const head = (s.head = new THREE.Group());
      head.position.y = 0.95;
      g.add(head);
      addM(head, geo('tHead', () => new THREE.BoxGeometry(0.7, 0.5, 0.7)), light);
      const bar = geo('tBarrel', () => new THREE.CylinderGeometry(0.08, 0.1, 0.9, 6).rotateX(Math.PI / 2).translate(0, 0, 0.6));
      addM(head, bar, dark, 0.14, 0.05, 0);
      addM(head, bar, dark, -0.14, 0.05, 0);
      addM(head, geo('tEye', () => new THREE.BoxGeometry(0.34, 0.1, 0.05)), cy, 0, 0.12, 0.36, false);
      s.y = hy(s.x, s.z);
      g.position.set(s.x, s.y, s.z);
      g.scale.setScalar(0.01);
      scene().add(g);
      s.cd = 0.5; s.ang = 0; s.tg = null; s.rt = 0;
      // one engineer keeps two: a third retires the oldest
      const own = CL.summons.filter((q) => q.kind === 'turret' && q.owner === s.owner && !q.dead);
      if (own.length >= 2) own[0].dead = true;
      G.FX.ring(s.x, s.y + 0.1, s.z, 0.3, 2, 0.35, 0x6fe8ff, 2.2);
      G.FX.burst(s.x, s.y + 0.5, s.z, { count: 14, color: 0x9ff4ff, intensity: 2.2, speed: [2, 5], life: [0.2, 0.4], size: [0.3, 0.02], spread: 'up' });
      G.Audio.play('deploy');
    },
    update(s, dt, t, o, idle) {
      s.mesh.scale.setScalar(grow(s) * 1.3);
      const st = o.stats, range = 18 * (0.9 + 0.1 * st.lanceWidth);
      s.rt -= dt;
      if (s.rt <= 0 || !s.tg || !s.tg.alive) { s.rt = 0.25; s.tg = C.nearest(s.x, s.z, range); }
      if (s.tg) s.ang = U.dampAngle(s.ang, Math.atan2(s.tg.z - s.z, s.tg.x - s.x), 14, dt);
      face(s.head, s.ang);
      s.cd -= dt * (o.ultT > 0 && o.cls.id === 'engineer' ? 2 : 1);
      if (idle || !s.tg || s.cd > 0 || s.t < 0.3) return;
      s.cd = 0.25;
      const a = s.ang, mx = s.x + Math.cos(a) * 1.0, mz = s.z + Math.sin(a) * 1.0;
      G.Proj.spawnPlayer({ x: mx, z: mz, y: s.y + 1.0, angle: a, speed: 46, life: range / 46 + 0.05, dmg: st.dmg * st.dmgMult * 0.45 * st.lanceMult,
        size: 0.7, color: 0x8ff4ff, source: 'turret', by: o, cos: !G.auth() });
      G.FX.burst(mx, s.y + 1.0, mz, { count: 3, color: 0x8ff4ff, intensity: 2.4, speed: [2, 5], life: [0.05, 0.12], size: [0.3, 0.02], dir: { x: Math.cos(a), y: 0, z: Math.sin(a) }, cone: 0.4 });
      if (near(s.x, s.z) > 0.55) G.Audio.play('turret');
    },
    end(s) { dropMesh(s); G.FX.burst(s.x, s.y + 0.6, s.z, { count: 12, color: 0x9ff4ff, intensity: 2, speed: [2, 5], life: [0.2, 0.4], size: [0.3, 0.02] }); },
  };

  SUM.titan = {
    make(s) {
      const g = (s.mesh = new THREE.Group());
      const dark = mat('stD', () => std(0x3e4552)), gold = mat('ttGold', () => std(0xd6a94e, { metalness: 0.7, roughness: 0.3 })), core = mat('ttCore', () => glowM(0xffc46a, 3));
      addM(g, geo('ttBase', () => new THREE.CylinderGeometry(1.1, 1.4, 0.8, 8)), dark, 0, 0.4, 0);
      addM(g, geo('ttRing', () => new THREE.TorusGeometry(1.05, 0.09, 6, 24).rotateX(Math.PI / 2)), core, 0, 0.82, 0, false);
      const head = (s.head = new THREE.Group());
      head.position.y = 1.5;
      g.add(head);
      addM(head, geo('ttHead', () => new THREE.BoxGeometry(1.3, 0.8, 1.2)), gold);
      const bar = geo('ttBarrel', () => new THREE.CylinderGeometry(0.17, 0.21, 1.7, 8).rotateX(Math.PI / 2).translate(0, 0, 1.0));
      addM(head, bar, dark, 0.3, 0.05, 0);
      addM(head, bar, dark, -0.3, 0.05, 0);
      addM(head, geo('ttEye', () => new THREE.BoxGeometry(0.7, 0.14, 0.05)), core, 0, 0.2, 0.62, false);
      s.y = hy(s.x, s.z);
      g.position.set(s.x, s.y, s.z);
      g.scale.setScalar(0.01);
      scene().add(g);
      s.cd = 0.6; s.ang = 0; s.tg = null; s.rt = 0;
      G.FX.explosion(s.x, s.y, s.z, 3, 0xffc46a, 0.25 * near(s.x, s.z));
      G.Audio.play('deploy'); G.Audio.play('slam');
    },
    update(s, dt, t, o, idle) {
      s.mesh.scale.setScalar(grow(s, 0.45, 0.5));
      s.rt -= dt;
      if (s.rt <= 0 || !s.tg || !s.tg.alive) {
        s.rt = 0.3;
        let best = null, bk = -1;
        C.forEachTarget(s.x, s.z, 24, (q) => { const k = (q.isBoss ? 1e7 : 0) + (q.elite ? 1e5 : 0) + (q.maxHp || q.hp || 0); if (k > bk) { bk = k; best = q; } });
        s.tg = best;
      }
      if (s.tg) s.ang = U.dampAngle(s.ang, Math.atan2(s.tg.z - s.z, s.tg.x - s.x), 8, dt);
      face(s.head, s.ang);
      s.cd -= dt;
      if (idle || !s.tg || s.cd > 0 || s.t < 0.45) return;
      s.cd = 0.4;
      const st = o.stats, a = s.ang, mx = s.x + Math.cos(a) * 1.9, mz = s.z + Math.sin(a) * 1.9;
      G.Proj.spawnPlayer({ x: mx, z: mz, y: s.y + 1.5, angle: a, speed: 40, life: 0.75, dmg: 50 * st.dmgMult, size: 1.7, homing: 1, boom: 3,
        color: 0xffc46a, source: 'titan', by: o, cos: !G.auth(), knock: 8 });
      G.FX.burst(mx, s.y + 1.5, mz, { count: 8, color: 0xffd27a, intensity: 2.6, speed: [3, 7], life: [0.08, 0.2], size: [0.5, 0.03], dir: { x: Math.cos(a), y: 0, z: Math.sin(a) }, cone: 0.4 });
      G.FX.smoke(mx, s.y + 1.5, mz, 2, 0x4a4040, 1.4, 2);
      if (near(s.x, s.z) > 0.35) G.Audio.play('cannon');
    },
    end(s) { dropMesh(s); G.FX.explosion(s.x, s.y, s.z, 2.5, 0xffc46a, 0.1); },
  };

  SUM.mine = {
    make(s) {
      const g = (s.mesh = new THREE.Group());
      addM(g, geo('mnBody', () => new THREE.CylinderGeometry(0.34, 0.4, 0.14, 10)), mat('stD', () => std(0x3e4552)), 0, 0.07, 0);
      s.light = addM(g, geo('mnLight', () => new THREE.SphereGeometry(0.09, 8, 6)), mat('mnRed', () => glowM(0xff4a3a, 3.2)), 0, 0.18, 0, false);
      s.y = hy(s.x, s.z);
      g.position.set(s.x, s.y, s.z);
      scene().add(g);
    },
    update(s, dt, t) {
      s.mesh.scale.setScalar(Math.min(1, s.t / 0.2));
      s.light.visible = Math.sin(t * (s.t > 0.6 ? 9 : 3) + s.x) > 0;
    },
    end(s) {
      dropMesh(s);
      if (s.endFx === 3) { G.FX.explosion(s.x, s.y, s.z, 3, 0xff8a3a, 0.2 * near(s.x, s.z)); G.Audio.play('explode'); }
    },
  };

  SUM.trap = {
    make(s) {
      const g = (s.mesh = new THREE.Group());
      const steel = mat('trSteel', () => std(0x8a8e96, { metalness: 0.8, roughness: 0.35 }));
      addM(g, geo('trRing', () => new THREE.TorusGeometry(0.55, 0.05, 5, 16).rotateX(Math.PI / 2)), steel, 0, 0.06, 0, false);
      const tooth = geo('trTooth', () => new THREE.ConeGeometry(0.05, 0.22, 4));
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU, m = addM(g, tooth, steel, Math.cos(a) * 0.55, 0.15, Math.sin(a) * 0.55, false);
        m.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
      }
      addM(g, geo('trPlate', () => new THREE.CylinderGeometry(0.22, 0.22, 0.04, 8)), mat('trGlow', () => glowM(0xb8f07a, 1.8)), 0, 0.04, 0, false);
      s.y = hy(s.x, s.z);
      g.position.set(s.x, s.y, s.z);
      scene().add(g);
    },
    update(s) { s.mesh.scale.setScalar(Math.min(1, s.t / 0.25)); },
    end(s) {
      dropMesh(s);
      if (s.endFx === 2) {
        G.FX.ring(s.x, s.y + 0.15, s.z, 0.3, 2.8, 0.3, 0xb8f07a, 2.4);
        G.FX.burst(s.x, s.y + 0.4, s.z, { count: 20, color: 0xd8ffb0, intensity: 2.2, spread: 'ring', speed: [4, 9], life: [0.2, 0.4], size: [0.35, 0.03] });
        G.Audio.play('snap');
      }
    },
  };

  SUM.banner = {
    make(s) {
      const g = (s.mesh = new THREE.Group());
      const gold = mat('bnGold', () => std(0xd6a94e, { metalness: 0.75, roughness: 0.3 })), cloth = mat('bnCloth', () => std(0xc83a2e, { metalness: 0, roughness: 0.8, side: THREE.DoubleSide }));
      addM(g, geo('bnBase', () => new THREE.CylinderGeometry(0.45, 0.55, 0.3, 8)), mat('stD', () => std(0x3e4552)), 0, 0.15, 0);
      addM(g, geo('bnPole', () => new THREE.CylinderGeometry(0.05, 0.06, 3.2, 6)), gold, 0, 1.75, 0);
      addM(g, geo('bnTop', () => new THREE.OctahedronGeometry(0.16, 0)), mat('bnGlow', () => glowM(0xffd98a, 3)), 0, 3.45, 0, false);
      s.flag = addM(g, geo('bnFlag', () => new THREE.PlaneGeometry(1.1, 0.75, 6, 2).translate(0.58, 0, 0)), cloth, 0.05, 2.9, 0);
      s.ring = addM(g, geo('bnRing', () => new THREE.RingGeometry(0.96, 1, 64).rotateX(-Math.PI / 2)),
        new THREE.MeshBasicMaterial({ color: U.hdr(0xffd98a, 1.4), transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }), 0, 0.12, 0, false);
      s.ring.scale.setScalar(s.r);
      s.y = hy(s.x, s.z);
      g.position.set(s.x, s.y, s.z);
      g.scale.setScalar(0.01);
      scene().add(g);
      G.FX.ring(s.x, s.y + 0.2, s.z, 0.5, s.r, 0.5, 0xffd98a, 2.2);
      G.FX.smoke(s.x, s.y + 0.4, s.z, 8, 0x6a5a48, 1.8, 3);
      G.Audio.play('banner');
    },
    update(s, dt, t) {
      s.mesh.scale.setScalar(grow(s, 0.35, 0.35));
      s.ring.scale.setScalar(s.r / Math.max(0.01, s.mesh.scale.x));
      s.flag.rotation.y = Math.sin(t * 3) * 0.25;
      s.ring.material.opacity = 0.3 + Math.sin(t * 4) * 0.12;
      if (Math.random() < 0.3) { const a = Math.random() * TAU; G.FX.P.emit(s.x + Math.cos(a) * s.r, s.y + 0.2, s.z + Math.sin(a) * s.r, 0, U.rand(1, 2.5), 0, 0.6, 0.35, 0.02, 2.6, 2.2, 1.1, 1, 0.5, 0); }
    },
    end(s) { s.ring.material.dispose(); dropMesh(s); G.FX.burst(s.x, s.y + 1.5, s.z, { count: 16, color: 0xffd98a, intensity: 2, speed: [2, 5], life: [0.3, 0.6], size: [0.35, 0.03] }); },
  };

  SUM.dome = {
    make(s) {
      const g = (s.mesh = new THREE.Group());
      s.shell = addM(g, geo('dmShell', () => new THREE.SphereGeometry(1, 28, 14, 0, TAU, 0, Math.PI / 2)),
        new THREE.MeshBasicMaterial({ color: U.hdr(0xffd98a, 1.2), transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), 0, 0, 0, false);
      s.edge = addM(g, geo('dmEdge', () => new THREE.RingGeometry(0.95, 1, 72).rotateX(-Math.PI / 2)),
        new THREE.MeshBasicMaterial({ color: U.hdr(0xffd98a, 2), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }), 0, 0.1, 0, false);
      s.y = hy(s.x, s.z);
      g.position.set(s.x, s.y, s.z);
      g.scale.setScalar(0.01);
      scene().add(g);
      s.tick = 0;
      G.Audio.play('dome');
    },
    update(s, dt, t, o) {
      const k = grow(s, 0.4, 0.5);
      s.mesh.scale.set(s.r * k, s.r * k * 0.75, s.r * k);
      s.shell.material.opacity = 0.12 + Math.sin(t * 3) * 0.04;
      if (Math.random() < 0.6) { const a = Math.random() * TAU, rr = Math.sqrt(Math.random()) * s.r; G.FX.P.emit(s.x + Math.cos(a) * rr, s.y + 0.2, s.z + Math.sin(a) * rr, 0, U.rand(1.5, 3.5), 0, 0.8, 0.3, 0.02, 2.6, 2.2, 1.1, 1, 0.4, 0); }
      if (!G.auth()) return;
      s.tick -= dt;
      if (s.tick > 0) return;
      s.tick = 0.5;
      for (const h of HS.list) if (h.alive && U.dist2(h.x, h.z, s.x, s.z) < s.r * s.r) h.heal(h.stats.maxHp * 0.015, true, o);
      C.forEachTarget(s.x, s.z, s.r, (q) => slow(q, 0.3, 0.6));
    },
    end(s) { s.shell.material.dispose(); s.edge.material.dispose(); dropMesh(s); },
  };

  SUM.field = {
    make(s) {
      const g = (s.mesh = new THREE.Group());
      s.disc = addM(g, geo('fdDisc', () => new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2)),
        new THREE.MeshBasicMaterial({ color: U.hdr(0x7fffe0, 0.7), transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }), 0, 0.1, 0, false);
      s.dial = new THREE.Group();
      g.add(s.dial);
      const tc = mat('fdTick', () => glowM(0x9ffff0, 2.4));
      addM(s.dial, geo('fdRing', () => new THREE.TorusGeometry(1, 0.012, 4, 64).rotateX(Math.PI / 2)), tc, 0, 0.14, 0, false);
      const tk = geo('fdTk', () => new THREE.BoxGeometry(0.02, 0.02, 0.1));
      for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU, m = addM(s.dial, tk, tc, Math.cos(a) * 0.93, 0.14, Math.sin(a) * 0.93, false); m.rotation.y = -a; }
      s.hand = addM(s.dial, geo('fdHand', () => new THREE.BoxGeometry(0.02, 0.02, 0.8).translate(0, 0, 0.4)), tc, 0, 0.15, 0, false);
      s.y = hy(s.x, s.z);
      g.position.set(s.x, s.y, s.z);
      scene().add(g);
      s.tick = 0;
      G.Audio.play('tickTock');
    },
    update(s, dt, t, o) {
      const k = grow(s, 0.35, 0.5);
      s.mesh.scale.set(s.r * k, 1, s.r * k);
      s.hand.rotation.y = -t * 0.6;
      s.dial.rotation.y = t * 0.05;
      s.disc.material.opacity = 0.18 + Math.sin(t * 2) * 0.05;
      if (Math.random() < 0.5) { const a = Math.random() * TAU, rr = Math.sqrt(Math.random()) * s.r; G.FX.P.emit(s.x + Math.cos(a) * rr, s.y + 0.3, s.z + Math.sin(a) * rr, 0, U.rand(0.2, 0.6), 0, 1.4, 0.3, 0.05, 1.2, 2.6, 2.4, 1, 0.2, 0); }
      if (!G.auth()) return;
      s.tick -= dt;
      if (s.tick > 0) return;
      s.tick = 0.5;
      for (const q of G.Bosses.targets) if (q.alive && U.dist2(q.x, q.z, s.x, s.z) < s.r * s.r) { slow(q, 0.5, 1.6); break; }
    },
    end(s) { s.disc.material.dispose(); dropMesh(s); },
  };

  SUM.hawk = {
    make(s) {
      s.mesh = hawkGroup(1.3);
      scene().add(s.mesh);
      const o = HS.get(s.owner);
      s.px = o ? o.x : s.x; s.pz = o ? o.z : s.z; s.py = (o ? o.y : 0) + 2;
      s.phase = 'out'; s.a = Math.random() * TAU; s.diveT = 0.3; s.life = s.dur; s.dur += 2.5;
      G.Audio.play('hawk');
    },
    update(s, dt, t, o, idle) {
      flap(s.mesh, t * (s.phase === 'dive' ? 6 : 16));
      let tx, ty, tz, sp = 30;
      const gy = hy(s.x, s.z);
      if (s.phase !== 'back' && s.t > s.life + 0.4) s.phase = 'back';
      if (s.phase === 'out' || s.phase === 'circle') {
        s.a += dt * 2.2;
        tx = s.x + Math.cos(s.a) * s.r * 0.75; tz = s.z + Math.sin(s.a) * s.r * 0.75; ty = gy + 5;
        if (s.phase === 'out' && U.dist(s.px, s.pz, tx, tz) < 2) s.phase = 'circle';
        if (s.phase === 'circle') {
          sp = 16;
          s.diveT -= dt;
          if (s.diveT <= 0 && !idle) {
            s.diveT = 0.45;
            const list = [];
            C.forEachTarget(s.x, s.z, s.r, (q) => list.push(q));
            if (list.length) { s.tg = list[Math.floor(Math.random() * list.length)]; s.phase = 'dive'; s.sx = s.px; s.sy = s.py; s.sz = s.pz; s.dk = 0; }
          }
        }
      } else if (s.phase === 'dive') {
        const q = s.tg;
        s.dk += dt / 0.24;
        if (!q || !q.alive) { s.phase = 'circle'; }
        else {
          const k = Math.min(1, s.dk), qy = (q.y || hy(q.x, q.z)) + 1;
          s.px = U.lerp(s.sx, q.x, k); s.pz = U.lerp(s.sz, q.z, k); s.py = U.lerp(s.sy, qy, k * k);
          if (k >= 1) {
            if (G.auth()) {
              const st = o.stats;
              C.damage(q, 26 * st.meteorMult * st.dmgMult, { source: 'hawk', by: o, kx: q.x - s.sx, kz: q.z - s.sz, knock: 3 });
              markEnemy(q, 4, 1);
            }
            G.FX.burst(q.x, qy, q.z, { count: 8, color: 0xd8ffb0, intensity: 2.4, speed: [3, 6], life: [0.15, 0.3], size: [0.35, 0.02] });
            if (near(q.x, q.z) > 0.5) G.Audio.play('blade');
            s.phase = 'circle';
          }
        }
      } else {
        tx = o.x; tz = o.z; ty = o.y + 2.2; sp = 34;
        if (U.dist(s.px, s.pz, tx, tz) < 1) s.dead = true;
      }
      if (tx != null) {
        const dx = tx - s.px, dz = tz - s.pz, d = Math.hypot(dx, dz) || 1, st = Math.min(d, sp * dt);
        s.px += (dx / d) * st; s.pz += (dz / d) * st; s.py = U.damp(s.py, ty, 5, dt);
      }
      const vx = s.px - s.mesh.position.x, vz = s.pz - s.mesh.position.z;
      s.mesh.position.set(s.px, s.py, s.pz);
      if (vx * vx + vz * vz > 1e-5) face(s.mesh, Math.atan2(vz, vx));
      s.mesh.rotation.x = s.phase === 'dive' ? 0.6 : 0;
    },
    end(s) { dropMesh(s); },
  };

  // the guardian's thrown shield follows its bounce points, then flies home
  SUM.flyer = {
    make(s) {
      const g = (s.mesh = new THREE.Group());
      addM(g, geo('flDisc', () => new THREE.CylinderGeometry(0.5, 0.5, 0.09, 6)), mat('flGold', () => std(0xd6c08a, { metalness: 0.8, roughness: 0.25 })), 0, 0, 0);
      addM(g, geo('flBoss', () => new THREE.CylinderGeometry(0.17, 0.17, 0.14, 10)), mat('bnGlow', () => glowM(0xffd98a, 3)), 0, 0, 0, false);
      s.k = 1; s.px = s.pts[0]; s.pz = s.pts[1];
      s.y = hy(s.px, s.pz) + 1.3;
      g.position.set(s.px, s.y, s.pz);
      scene().add(g);
      s.dur = 6;
      G.Audio.play('throw');
    },
    update(s, dt, t, o) {
      s.mesh.rotation.y += dt * 22;
      let tx, tz;
      const n = s.pts.length / 2;
      if (s.k < n) { tx = s.pts[s.k * 2]; tz = s.pts[s.k * 2 + 1]; }
      else { tx = o.x; tz = o.z; }
      const dx = tx - s.px, dz = tz - s.pz, d = Math.hypot(dx, dz), st = 34 * dt;
      if (d <= st) {
        s.px = tx; s.pz = tz;
        if (s.k < n) {
          s.k++;
          if (s.k > 1 || n === 2) {
            G.FX.burst(tx, s.y, tz, { count: 10, color: 0xffe08a, intensity: 2.4, speed: [3, 7], life: [0.15, 0.3], size: [0.35, 0.02] });
            if (near(tx, tz) > 0.4) G.Audio.play('clink');
          }
        } else s.dead = true;
      } else { s.px += (dx / d) * st; s.pz += (dz / d) * st; }
      s.y = U.damp(s.y, hy(s.px, s.pz) + 1.3, 8, dt);
      s.mesh.position.set(s.px, s.y, s.pz);
      if (Math.random() < 0.6) G.FX.trail(s.px, s.y, s.pz, 0xffd98a, 0.5, 0.18, 2);
    },
    end(s) { dropMesh(s); },
  };

  // ================= visuals (every machine) =================
  const V = G.Vis, fx = [];
  const tmpC = new THREE.Color();
  const ZC = { light: 0xffeebb };
  V.zoneFx = (kind, x, z, r, dur) => {
    kind = String(kind);
    r = U.clamp(+r || 1, 0.5, 20); dur = U.clamp(+dur || 1, 0.2, 12);
    const color = ZC[kind] || 0xffffff;
    fx.push({ kind, x, z, r, t: dur, tele: G.FX.telegraph({ shape: 'circle', x, z, r, hold: true, color, k: 1.1 }), color });
    if (kind === 'light') { G.FX.pillar(x, z, color, 60, 14); G.Audio.play('heal'); }
  };
  function updateFx(dt) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      f.t -= dt;
      const y = hy(f.x, f.z), c = tmpC.set(f.color);
      const a = Math.random() * TAU, rr = Math.sqrt(Math.random()) * f.r;
      const px = f.x + Math.cos(a) * rr, pz = f.z + Math.sin(a) * rr;
      if (f.kind === 'light' && Math.random() < 0.8) G.FX.P.emit(px, y + 0.2, pz, 0, U.rand(3, 6), 0, 0.7, 0.35, 0.02, c.r * 2.6, c.g * 2.4, c.b * 1.8, 1, 0.5, 0);
      else if (f.kind === 'fire') {
        for (let k = 0; k < 2; k++) {
          const q = Math.random();
          G.FX.P.emit(U.lerp(f.x, f.x1, q) + U.rand(-0.7, 0.7), y + 0.2, U.lerp(f.z, f.z1, q) + U.rand(-0.7, 0.7), 0, U.rand(2, 4.5), 0, 0.45, 0.6, 0.05, 3, 1.1, 0.25, 1, 1, 0);
        }
      }
      if (f.t <= 0) { if (f.tele) f.tele.kill(); fx.splice(i, 1); }
    }
  }
  // marks above enemies (kind 1 falconer, 2 death mark, 3 dead eye)
  const MARK_C = { 1: [1.4, 2.8, 1.0], 2: [2.2, 0.9, 3.0], 3: [3.0, 0.7, 0.5] };
  V.mark = (id, dur, kind) => { kind = (kind | 0) || 1; CL.marks.set(id + ':' + kind, { id: +id, kind, t: U.clamp(+dur || 1, 0.1, 10) }); };
  function updateMarks(dt) {
    if (!CL.marks.size) return;
    const t = performance.now() / 1000;
    for (const [k, m] of CL.marks) {
      m.t -= dt;
      const e = m.id === -1 ? G.Bosses.targets[0] : G.Enemies.byId(m.id);
      if (m.t <= 0 || !e || !e.alive) { CL.marks.delete(k); continue; }
      const c = MARK_C[m.kind], y = (e.y || 0) + (e.h || 2) + (m.id === -1 ? 2.2 : 0.9), a = t * 6 + m.id;
      G.FX.P.emit(e.x + Math.cos(a) * 0.45, y, e.z + Math.sin(a) * 0.45, 0, 0.4, 0, 0.25, 0.32, 0.02, c[0], c[1], c[2], 1, 0, 0);
      if (m.kind !== 1 && Math.random() < 0.3) G.FX.P.emit(e.x, y + 0.2, e.z, 0, 0.8, 0, 0.3, 0.5, 0.05, c[0], c[1], c[2], 1, 0, 0);
    }
  }
  V.sumEnd = (id, fxk) => { id = String(id); for (const s of CL.summons) if (s.id === id) { s.dead = true; s.endFx = fxk | 0; } };
  V.cdReset = (key, bits) => {
    const h = HS.get(String(key));
    if (!h) return;
    if (bits & 1) h.cd.s1 = 0;
    if (bits & 2) h.cd.s2 = 0;
    if (bits & 4) h.cd.s3 = 0;
    G.FX.ring(h.x, h.y + 0.3, h.z, 0.5, 2.4, 0.35, 0xb07aff, 2.4);
    if (h === G.Player) { G.UI.toast('표식 처치 · 그림자 걸음과 은신 준비됨', 'gold', 1.8); G.Audio.play('chest'); }
  };
  const ownerOf = (key) => HS.get(String(key));

  // ---- guardian ----
  V.gdRaise = (x, z, key) => { G.FX.ring(x, hy(x, z) + 0.3, z, 0.4, 1.8, 0.25, 0xffd98a, 2.2); G.Audio.play('shieldUp'); };
  V.gdBash = (x, z, a, range, big, key) => {
    const y = hy(x, z) + 0.9, col = big ? 0xffffff : 0xffd98a;
    for (let i = 0; i < 40; i++) {
      const b = a + U.rand(-0.75, 0.75), sp = U.rand(range * 1.6, range * 2.6);
      G.FX.P.emit(x + Math.cos(a) * 0.8, y, z + Math.sin(a) * 0.8, Math.cos(b) * sp, U.rand(0, 2), Math.sin(b) * sp, 0.32, 0.8, 0.05, 2.8, 2.4, 1.3, 1, 2.6, 0);
    }
    G.FX.ring(x + Math.cos(a) * 2, y - 0.6, z + Math.sin(a) * 2, 0.5, range * 0.6, 0.3, col, 2.6);
    G.Audio.play('bash');
    if (mine(key)) { G.Render.shake(big ? 0.45 : 0.25); if (big) G.Game.hitstop(0.05); }
  };
  V.gdThrow = (pts, key) => {
    if (!Array.isArray(pts) || pts.length < 4) return;
    CL.addSummon('flyer', { owner: String(key), pts: pts.slice(0, 14).map((v) => +v || 0), x: +pts[0] || 0, z: +pts[1] || 0 });
  };
  V.gdBanner = (id, x, z, r, dur, key) => { CL.addSummon('banner', { id: String(id), owner: String(key), x, z, r: U.clamp(+r || 9, 3, 20), dur: U.clamp(+dur || 6, 1, 12) }); };
  V.gdDome = (id, x, z, r, dur, key) => {
    CL.addSummon('dome', { id: String(id), owner: String(key), x, z, r: U.clamp(+r || 8, 3, 16), dur: U.clamp(+dur || 6, 1, 12) });
    G.FX.pillar(x, z, 0xffd98a, 70, 12);
  };

  // ---- falconer ----
  V.rgSnipe = (x, z, a, ch, key) => {
    const y = hy(x, z) + 1.35, full = ch > 0.95;
    G.FX.burst(x + Math.cos(a), y, z + Math.sin(a), { count: full ? 22 : 12, color: full ? 0xffffff : 0xd8ffb0, intensity: 2.6, speed: [6, 16], life: [0.1, 0.25], size: [0.35, 0.02], dir: { x: Math.cos(a), y: 0, z: Math.sin(a) }, cone: 0.2 });
    G.Audio.play('snipe', { power: 0.6 + ch * 0.6 });
    if (mine(key)) G.Render.shake(full ? 0.25 : 0.1);
    const h = ownerOf(key);
    if (h && !G.auth()) snipeArrow(h, x, z, a, U.clamp(+ch || 0, 0, 1), true);
  };
  V.rgVault = (id, x, z, key) => {
    const y = hy(x, z);
    G.FX.smoke(x, y + 0.6, z, 10, 0x6a645e, 2.2, 3);
    G.FX.ring(x, y + 0.2, z, 0.4, 2.6, 0.3, 0xc8ff9a, 1.8);
    G.Audio.play('dash');
    CL.addSummon('trap', { id: String(id), owner: String(key), x, z, dur: 20 });
  };
  V.rgHawk = (id, x, z, r, dur, key) => {
    CL.addSummon('hawk', { id: String(id), owner: String(key), x, z, r: U.clamp(+r || 5, 2, 12), dur: U.clamp(+dur || 5, 1, 10) });
    G.FX.telegraph({ shape: 'circle', x, z, r: U.clamp(+r || 5, 2, 12), dur: 0.6, color: 0xb8f07a, k: 1.2 });
  };
  V.rgDive = (x0, z0, x1, z1) => {
    const y = hy(x1, z1) + 1;
    G.FX.lightning(x0, y + 3, z0, x1, y, z1, 0xd8ffb0, 0.12, 0.18, 0.3);
    G.FX.burst(x1, y, z1, { count: 8, color: 0xd8ffb0, intensity: 2.2, speed: [3, 6], life: [0.15, 0.3], size: [0.35, 0.02] });
    if (near(x1, z1) > 0.5) G.Audio.play('hawk');
  };

  // ---- pyromancer ----
  V.pyTrail = (x0, z0, x1, z1, dur) => {
    const a = Math.atan2(z1 - z0, x1 - x0), len = Math.max(0.5, U.dist(x0, z0, x1, z1));
    dur = U.clamp(+dur || 4, 0.5, 10);
    fx.push({ kind: 'fire', x: x0, z: z0, x1, z1, t: dur, color: 0xff6a20, tele: G.FX.telegraph({ shape: 'rect', x: x0, z: z0, angle: a, length: len, width: 2.4, hold: true, color: 0xff5a1a, k: 1.5 }) });
    G.FX.burst(x0, hy(x0, z0) + 0.8, z0, { count: 18, color: 0xff8a3a, intensity: 2.6, speed: [3, 8], life: [0.2, 0.4], size: [0.6, 0.05] });
    G.Audio.play('fireDash');
  };
  V.pyCombust = (x, z, r) => {
    r = U.clamp(+r || 6, 1, 16);
    const y = hy(x, z);
    G.FX.ring(x, y + 0.2, z, 0.5, r, 0.45, 0xff7a2a, 2.8);
    G.FX.ring(x, y + 0.4, z, 0.3, r * 0.6, 0.3, 0xffd27a, 2);
    G.Render.flash(x, y + 2, z, 0xff7a2a, 60, 0.3, 18);
    G.Audio.play('explode', { big: true });
  };

  // ---- cleric ----
  V.clShield = (x, z, key) => {
    const y = hy(x, z);
    G.FX.ring(x, y + 0.3, z, 0.5, 10, 0.6, 0xffeebb, 2.4);
    G.FX.burst(x, y + 1, z, { count: 36, color: 0xfff4c8, intensity: 2.2, spread: 'up', speed: [3, 7], life: [0.5, 0.9], size: [0.4, 0.03], drag: 2, jitter: 2 });
    G.Audio.play('holyShield');
  };

  // ---- berserker ----
  V.bzLeap = (x0, z0, x1, z1, key) => {
    G.FX.smoke(x0, hy(x0, z0) + 0.4, z0, 8, 0x6a5a4e, 2, 3);
    G.FX.telegraph({ shape: 'circle', x: x1, z: z1, r: 4, dur: 0.55, color: 0xff6a3a, k: 1.5 });
    G.Audio.play('leap');
  };
  V.bzLand = (x, z, r) => {
    const y = hy(x, z);
    G.FX.explosion(x, y, z, U.clamp(+r || 4, 1, 8), 0xff7a4a, 0.5 * near(x, z));
    G.FX.gibs(x, y + 0.4, z, 0x6a5a4e, 12, 0.3, 9);
    G.Audio.play('slam');
  };
  V.bzRoar = (x, z, key) => {
    const y = hy(x, z);
    G.FX.ring(x, y + 0.3, z, 0.5, 6.5, 0.45, 0xff5a3a, 2.6);
    G.FX.ring(x, y + 0.8, z, 0.3, 4, 0.35, 0xffffff, 1.6);
    G.FX.burst(x, y + 1.5, z, { count: 30, color: 0xff7a4a, intensity: 2.2, spread: 'ring', speed: [6, 14], life: [0.3, 0.5], size: [0.45, 0.04], drag: 3 });
    G.Audio.play('warCry');
    if (mine(key)) G.Render.shake(0.35);
  };

  // ---- engineer ----
  V.enTurret = (id, x, z, dur, key) => { CL.addSummon('turret', { id: String(id), owner: String(key), x, z, dur: U.clamp(+dur || 14, 1, 30) }); };
  V.enTitan = (id, x, z, dur, key) => { CL.addSummon('titan', { id: String(id), owner: String(key), x, z, dur: U.clamp(+dur || 8, 1, 15) }); };
  V.enMines = (id, x, z, ang, life, key) => {
    id = String(id);
    life = U.clamp(+life || 20, 1, 60) + 0.5;
    const pts = minePoints(+x || 0, +z || 0, +ang || 0);
    for (const m of pts) {
      later(0.05 + m.k * 0.06, () => {
        CL.addSummon('mine', { id: id + '-' + m.k, owner: String(key), x: m.x, z: m.z, dur: life });
        G.FX.burst(m.x, hy(m.x, m.z) + 0.3, m.z, { count: 5, color: 0xff8a6a, intensity: 2, speed: [1, 3], life: [0.1, 0.25], size: [0.3, 0.02] });
      });
    }
    G.Audio.play('mineThrow');
  };
  V.enEmp = (x, z, r) => {
    r = U.clamp(+r || 5.5, 1, 14);
    const y = hy(x, z) + 1;
    G.FX.telegraph({ shape: 'circle', x, z, r, dur: 0.5, color: 0x6fe8ff, k: 1.6 });
    G.Audio.play('empCharge');
    for (let i = 0; i < 5; i++) later(i * 0.1, () => G.FX.lightning(x + U.rand(-1, 1), y + 1.5, z + U.rand(-1, 1), x + U.rand(-r, r) * 0.6, y - 0.6, z + U.rand(-r, r) * 0.6, 0x8ff4ff, 0.12, 0.12, 0.6));
    later(0.5, () => {
      G.FX.ring(x, y - 0.8, z, 0.5, r, 0.35, 0x8ff4ff, 3);
      G.FX.burst(x, y, z, { count: 40, color: 0x9ff4ff, intensity: 2.6, spread: 'ring', speed: [6, 14], life: [0.2, 0.4], size: [0.35, 0.03] });
      G.Render.flash(x, y + 1, z, 0x6fe8ff, 60, 0.3, 18);
      G.Proj.clearEnemyIn(x, z, r);
      G.Audio.play('emp');
    });
  };

  // ---- assassin ----
  V.asStep = (x0, z0, x1, z1, key) => {
    const y = hy(x0, z0) + 1, a = Math.atan2(z1 - z0, x1 - x0), len = U.dist(x0, z0, x1, z1);
    G.FX.smoke(x0, y, z0, 8, 0x2a1a3a, 1.6, 2);
    G.FX.beam(x0, y, z0, a, len, 0.5, 0xb07aff, 0.22);
    G.FX.smoke(x1, hy(x1, z1) + 1, z1, 6, 0x2a1a3a, 1.4, 2);
    G.FX.burst(x1, hy(x1, z1) + 1, z1, { count: 12, color: 0xc8a0ff, intensity: 2.4, speed: [2, 6], life: [0.2, 0.35], size: [0.35, 0.02] });
    G.Audio.play('shadowStep');
  };
  V.asVanish = (x, z, key) => { G.FX.smoke(x, hy(x, z) + 1, z, 16, 0x2a1a3a, 2.2, 3); G.Audio.play('vanish'); };
  V.asAmbush = (x, z) => { G.FX.burst(x, hy(x, z) + 1.2, z, { count: 14, color: 0xc8a0ff, intensity: 2.6, speed: [3, 8], life: [0.15, 0.3], size: [0.4, 0.02] }); G.Audio.play('crit'); };
  V.asBurst = (x, z) => {
    const y = hy(x, z) + 1.2;
    G.FX.explosion(x, y - 1, z, 2.2, 0xb07aff, 0.2 * near(x, z));
    G.FX.burst(x, y, z, { count: 24, color: 0xe0c8ff, intensity: 3, speed: [4, 10], life: [0.2, 0.4], size: [0.4, 0.03] });
    G.Audio.play('markBurst');
  };
  V.asCut = (x0, z0, x1, z1) => {
    const y = hy(x1, z1) + 1.1, a = Math.atan2(z1 - z0, x1 - x0), len = Math.max(0.5, U.dist(x0, z0, x1, z1));
    G.FX.beam(x0, y, z0, a, len, 0.35, 0xc8a0ff, 0.16);
    G.FX.burst(x1, y, z1, { count: 10, color: 0xe8d8ff, intensity: 2.8, speed: [3, 8], life: [0.1, 0.25], size: [0.4, 0.02] });
    if (near(x1, z1) > 0.4) G.Audio.play('cut');
  };

  // ---- chronomancer ----
  V.chField = (id, x, z, r, dur, key) => { CL.addSummon('field', { id: String(id), owner: String(key), x, z, r: U.clamp(+r || 6, 2, 14), dur: U.clamp(+dur || 6, 1, 20) }); };
  V.chRewind = (x0, z0, x1, z1, key) => {
    const y0 = hy(x0, z0) + 1, y1 = hy(x1, z1) + 1;
    G.FX.explosion(x0, y0 - 1, z0, 2.5, 0x7fffe0, 0.15 * near(x0, z0));
    for (let i = 0; i < 16; i++) { const k = i / 16; G.FX.trail(U.lerp(x0, x1, k), U.lerp(y0, y1, k) + Math.sin(k * Math.PI), U.lerp(z0, z1, k), 0x7fffe0, 0.5, 0.35 + k * 0.2, 2.2); }
    G.FX.ring(x1, y1 - 0.7, z1, 0.3, 2.2, 0.35, 0x7fffe0, 2.4);
    G.Audio.play('rewind');
  };
  V.chHasteFx = (x, z) => { G.FX.ring(x, hy(x, z) + 0.3, z, 0.5, 10, 0.5, 0x7fffe0, 2.4); G.Audio.play('haste'); };
  V.chHaste = (dur, ...keys) => {
    dur = U.clamp(+dur || 5, 0.5, 12);
    for (const k of keys) {
      const o = HS.get(String(k));
      if (!o) continue;
      o.hasteT = Math.max(o.hasteT || 0, dur);
      G.FX.burst(o.x, o.y + 1, o.z, { count: 14, color: 0x9ffff0, intensity: 2.2, spread: 'up', speed: [2, 5], life: [0.3, 0.6], size: [0.35, 0.02] });
      if (o === G.Player) G.UI.toast('가속 · ' + Math.round(dur) + '초', 'good', 1.6);
    }
  };
  V.chStop = (d) => {
    CL.stopT = U.clamp(+d || 0, 0, 8);
    G.Render.satTarget = 0.3;
    G.Render.screenFlash(0.25);
    G.Audio.play('timeStop');
    const P = G.Player;
    if (P) for (let i = 0; i < 3; i++) later(i * 0.12, () => G.FX.ring(P.x, P.y + 0.3, P.z, 1, 30, 0.8, 0x7fffe0, 2));
  };
  function stopEnd() {
    if (['playing', 'levelup', 'paused'].includes(G.Game.state)) G.Render.satTarget = 1;
    G.Audio.play('timeResume');
  }

  // ---- gunslinger ----
  V.gsFan = (x, z, a, n, key) => {
    const y = hy(x, z) + 1.35;
    G.FX.burst(x + Math.cos(a) * 0.8, y, z + Math.sin(a) * 0.8, { count: 16, color: 0xffd27a, intensity: 2.8, speed: [5, 12], life: [0.06, 0.16], size: [0.4, 0.02], dir: { x: Math.cos(a), y: 0, z: Math.sin(a) }, cone: 0.5 });
    G.FX.smoke(x + Math.cos(a) * 0.9, y, z + Math.sin(a) * 0.9, 3, 0x5a5048, 1.2, 2);
    n = U.clamp(n | 0, 1, 8);
    for (let i = 0; i < n; i++) later(i * 0.035, () => G.Audio.play('gun'));
    if (mine(key)) G.Render.shake(0.22);
    const h = ownerOf(key);
    if (h && !G.auth()) fanShots(h, x, z, a, n, true);
  };
  V.gsRoll = (x, z, a, key) => { G.FX.smoke(x, hy(x, z) + 0.3, z, 6, 0x7a6a58, 1.4, 3); G.Audio.play('roll'); G.Audio.play('reload'); };
  V.gsLasso = (x0, z0, x1, z1, key) => {
    const y0 = hy(x0, z0) + 1.3, y1 = hy(x1, z1) + 1.1, a = Math.atan2(z1 - z0, x1 - x0), len = U.dist(x0, z0, x1, z1);
    G.FX.beam(x0, (y0 + y1) / 2, z0, a, len, 0.12, 0xd8b078, 0.3);
    G.FX.ring(x1, y1 - 0.8, z1, 0.3, 1.3, 0.3, 0xd8b078, 2);
    G.Audio.play('lasso');
  };
  V.gsYank = (key, x, z) => { const h = ownerOf(key); if (h && h.drive === 'input') yank(h, +x || 0, +z || 0); };
  V.gsShot = (x0, z0, x1, z1) => {
    const y = hy(x1, z1) + 1.2, a = Math.atan2(z1 - z0, x1 - x0), len = U.dist(x0, z0, x1, z1);
    G.FX.beam(x0, y, z0, a, len, 0.25, 0xffe0a0, 0.12);
    G.FX.burst(x1, y, z1, { count: 12, color: 0xffffff, intensity: 3, speed: [4, 9], life: [0.1, 0.25], size: [0.4, 0.02] });
    G.Audio.play('gun');
    G.Audio.play('crit');
  };

  // ---- every ultimate's opening ----
  V.ultFx = (kind, x, z, key) => {
    const c = CL.list[String(kind)];
    if (!c) return;
    const col = c.energy || 0xffc35a, y = hy(x, z);
    G.FX.pillar(x, z, col, 80, 12);
    G.FX.ring(x, y + 0.3, z, 1, 10, 0.6, col, 2.6);
    G.Audio.play('ult');
    if (mine(key)) { G.UI.banner(c.ult.name, '', 'gold'); G.Render.screenFlash(0.2); G.Render.shake(0.35); }
    else { const h = ownerOf(key); if (h && h.name) G.UI.toast(h.name + ' · ' + c.ult.name, 'gold', 1.6); }
  };

  CL.clear = function () {
    CL.zones.length = 0; CL.decoys.length = 0; CL.traps.length = 0; CL.mines.length = 0; CL.dmarks.length = 0;
    for (const s of CL.summons) SUM[s.kind].end(Object.assign(s, { endFx: 0 }));
    CL.summons.length = 0;
    for (const f of fx) if (f.tele) f.tele.kill();
    fx.length = 0; fxq.length = 0;
    CL.marks.clear();
    if (CL.stopT > 0) { CL.stopT = 0; G.Render.satTarget = 1; }
  };
})();

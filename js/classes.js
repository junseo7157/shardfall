// ============================================================
// SHARDFALL - classes: the heroes you can be. Solo is always the shard mage; in co-op every
// player takes a different one. Each has a basic attack, three skills (right click / Q / E),
// an ultimate (R) and a trait of its own.
//   s1 (right click) is held to charge and fires on release; s2 (Q) is instant; s3 (E) lands on a
//   point you choose; the ultimate lasts while ultT runs. They travel over the same co-op channels
//   the shard mage always used (ls/lc, ns, ms/mtx/mtz, us), so the netcode needs nothing new.
//   Skill logic: s1/s2 run on the caster's machine for feedback and on the host for damage;
//   s3 and the ultimate run where damage is dealt and are mirrored as visual events.
// ============================================================
(() => {
  const G = window.G, U = G.U, C = G.Combat, HS = G.Heroes;
  const R1 = U.r1, R2 = U.r2;
  const CL = (G.Classes = { order: ['shard', 'guardian', 'ranger', 'pyro', 'cleric'], list: {}, zones: [] });
  const def = (o) => {
    o.names = { s1: o.skills[0].name, s2: o.skills[1].name, s3: o.skills[2].name, ult: o.ult.name };
    CL.list[o.id] = o;
    return o;
  };
  CL.get = (id) => CL.list[id] || CL.list.shard;
  CL.valid = (id) => Object.prototype.hasOwnProperty.call(CL.list, id);
  const extra = (s) => Math.max(0, s.freezeDur - 1.3); // '얼음 심장' lengthens every class's Q effect

  // ================= the five =================
  def({
    id: 'shard', name: '파편술사', role: '만능 마법사', emblem: 'shard', css: '#8fb3f0', energy: null, ultDur: 5,
    trait: { name: '마력 순환', desc: '스킬을 쓰면 2초 동안 공격 속도가 40% 빨라집니다.' },
    basic: { name: '파편탄', icon: 'shard', desc: '빠르게 연사하는 마력 파편' },
    skills: [
      { name: '파편 창', icon: 'spear', cd: 3.2, desc: '모았다가 놓으면 지형을 뚫는 관통 광선. 오래 모을수록 굵고 강합니다' },
      { name: '서리 노바', icon: 'snow', cd: 9, desc: '주변 적을 얼리고 밀어냅니다' },
      { name: '운석', icon: 'meteor', cd: 11, desc: '정한 자리에 떨어져 불바다를 남깁니다' },
    ],
    ult: { name: '파편 폭풍', icon: 'burst', desc: '5초 동안 주변에 벼락이 쏟아지고 공격이 빨라집니다' },
    aim: (ch, s) => ({ len: 28, w: (0.15 + ch * 1.2) * s.lanceWidth }),
    s3R: (s) => 5 * s.meteorRadius,
  });

  def({
    id: 'guardian', name: '수호기사', role: '앞에서 버티는 방패', emblem: 'shield', css: '#f6d27a', energy: 0xffd98a, ultDur: 6, orb: false,
    trait: { name: '불굴', desc: '받는 피해가 20% 줄고, 6m 안의 동료도 받는 피해가 10% 줄어듭니다.' },
    basic: { name: '성광 망치', icon: 'axe', desc: '묵직하게 날아가 적을 밀어내는 빛의 망치', knock: 7, spread: 0.16 },
    skills: [
      { name: '방패 돌진', icon: 'shield', cd: 6, desc: '모은 만큼 5~14m 돌진해 길 위의 적을 들이받고 밀쳐냅니다. 돌진하는 동안 무적' },
      { name: '도발의 함성', icon: 'crown', cd: 12, desc: '10m 안의 적이 4초 동안 수호기사만 노리고, 그동안 받는 피해가 40% 줄어듭니다' },
      { name: '성역', icon: 'cross', cd: 16, desc: '정한 자리에 6초 동안 성역: 안의 동료는 회복하며 덜 아프고, 적은 느려집니다' },
    ],
    ult: { name: '수호의 결계', icon: 'gem', desc: '6초 동안 10m 안 모든 동료가 받는 피해 60% 감소, 주변에 성광 파동' },
    stats(s) { s.maxHp = 150; s.armor += 4; s.speed *= 0.92; s.dmg = 24; s.fireRate = 2.3; s.projSpeed = 30; s.projLife = 0.52; s.projSize = 1.5; },
    aim: (ch, s) => ({ len: (5 + 9 * ch) * (0.9 + 0.1 * s.lanceWidth), w: 1.3 * s.lanceWidth }),
    s3R: (s) => 4.5 * s.meteorRadius,
    s1(h, ch) {
      const s = h.stats, a = h.facing, dist = (5 + 9 * ch) * (0.9 + 0.1 * s.lanceWidth);
      G.Net.visBy(h.key, 'gCharge', R1(h.x), R1(h.z), R2(a), R1(dist), h.key);
      if (h.drive === 'input') {
        h.dashDir = { x: Math.cos(a), z: Math.sin(a) };
        h.dashT = dist / 46;
        h.invuln = Math.max(h.invuln, h.dashT + 0.15);
      }
      if (!h.auth) return;
      const dmg = (30 + 70 * ch) * s.lanceMult * s.dmgMult;
      C.line(h.x, h.z, a, dist + 1.2, 2.6 * s.lanceWidth, (t) => {
        C.damage(t, dmg, { kx: Math.cos(a), kz: Math.sin(a), knock: 14 + 8 * ch, source: 'skill', by: h });
        if (t.applyStatus) t.applyStatus('slow', 0.6, 1.5);
      });
    },
    s2(h) {
      const s = h.stats, dur = 4 + extra(s);
      G.Net.visBy(h.key, 'gRoar', R1(h.x), R1(h.z), h.key);
      if (!h.auth) return;
      h.tauntT = dur; h.guardT = dur;
      C.forEachTarget(h.x, h.z, 10, (t) => {
        const dx = t.x - h.x, dz = t.z - h.z, d = Math.hypot(dx, dz) || 1;
        C.damage(t, 15 * s.dmgMult, { kx: dx / d, kz: dz / d, knock: 5, source: 'skill', by: h });
        if (t.boss) { t.boss.tg = h; t.boss.tgT = Math.min(dur, 2.5); } else { t.target = h; t.tgT = dur; }
      });
    },
    s3(h, tx, tz) {
      const s = h.stats, r = 4.5 * s.meteorRadius, dur = 6;
      G.Net.vis('zoneFx', 'sanct', R1(tx), R1(tz), R1(r), dur);
      CL.zones.push({ x: tx, z: tz, r, t: dur, every: 0.5, tick: 0, by: h, fn(z) {
        for (const o of HS.list) if (o.alive && U.dist2(o.x, o.z, z.x, z.z) < z.r * z.r) { o.heal(4 * s.meteorMult, true); o.sanctT = 0.7; }
        C.forEachTarget(z.x, z.z, z.r, (t) => { if (t.applyStatus) t.applyStatus('slow', 0.4, 0.8); });
      } });
    },
    ultStart(h) {
      G.Net.vis('ultFx', 'guardian', R1(h.x), R1(h.z), h.key);
    },
    ultTick(h) {
      h.ultTick = 0.6;
      G.Net.vis('ring', R1(h.x), R1(h.z), 0.6, 5, 0.35, 0xffd98a);
      C.forEachTarget(h.x, h.z, 5, (t) => {
        const dx = t.x - h.x, dz = t.z - h.z, d = Math.hypot(dx, dz) || 1;
        C.damage(t, 25 * h.stats.dmgMult * (t.isBoss ? 0.6 : 1), { canCrit: false, kx: dx / d, kz: dz / d, knock: 6, source: 'ult', by: h });
      });
    },
    model(h, add, M) {
      add(new THREE.SphereGeometry(0.29, 14, 10), M.steel, 0, 1.8, 0).scale.set(1, 1.05, 1.05);
      add(new THREE.BoxGeometry(0.06, 0.26, 0.46), M.gold, 0, 2.06, 0.02);
      for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.3, 0.12, 0.42), M.steel, sx * 0.42, 1.6, 0).rotation.z = sx * -0.35;
      const sh = add(new THREE.CylinderGeometry(0.44, 0.44, 0.08, 6), M.steel, -0.56, 1.06, -0.22);
      sh.rotation.set(Math.PI / 2, 0, Math.PI / 2 + 0.25);
      const boss = add(new THREE.CylinderGeometry(0.14, 0.14, 0.1, 10), M.gold, -0.6, 1.06, -0.24);
      boss.rotation.set(Math.PI / 2, 0, Math.PI / 2 + 0.25);
      add(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 6), M.dark, 0.5, 0.95, 0.05).rotation.x = 0.4;
      add(new THREE.BoxGeometry(0.28, 0.2, 0.2), M.steel, 0.5, 1.32, -0.08);
    },
  });

  def({
    id: 'ranger', name: '매사냥꾼', role: '멀리서 노리는 명사수', emblem: 'eye', css: '#8fdcb3', energy: 0xa8f07a, ultDur: 6, orb: false,
    trait: { name: '명사수', desc: '14m보다 멀리 있는 적에게 주는 피해가 30% 늘고, 화살이 적 하나를 더 뚫습니다.' },
    basic: { name: '사냥 화살', icon: 'arrow', desc: '멀리 날아가 하나를 꿰뚫는 화살', spread: 0.06 },
    skills: [
      { name: '관통 사격', icon: 'pierce', cd: 4, desc: '모았다가 놓으면 42m를 꿰뚫는 화살. 끝까지 모으면 치명적인 한 발' },
      { name: '후방 도약', icon: 'wind', cd: 8, desc: '뒤로 8m 뛰며 무적, 떠난 자리에 적을 느리게 하는 연막' },
      { name: '화살비', icon: 'trident', cd: 12, desc: '정한 자리에 2.4초 동안 화살이 쏟아져 피해를 주고 느리게 합니다' },
    ],
    ult: { name: '매의 눈', icon: 'eye', desc: '6초 동안 공격 속도 80% 증가, 화살 +2갈래, 화살이 적을 따라가고 치명타 확률 +25%' },
    stats(s) { s.maxHp = 90; s.speed *= 1.05; s.dmg = 20; s.fireRate = 3.1; s.projSpeed = 52; s.projLife = 0.78; s.projSize = 0.9; s.pierce += 1; s.crit += 0.06; },
    aim: (ch, s) => ({ len: 42, w: (0.9 + 0.9 * ch) * s.lanceWidth * 0.6 }),
    s3R: (s) => 5 * s.meteorRadius,
    s1(h, ch) {
      const s = h.stats, a = h.facing, w = (0.9 + 0.9 * ch) * s.lanceWidth;
      G.Net.visBy(h.key, 'rShot', R1(h.x), R1(h.z), R2(a), R2(w), ch > 0.95 ? 1 : 0, h.key);
      if (h.drive === 'input') { h.vx -= Math.cos(a) * 3; h.vz -= Math.sin(a) * 3; }
      if (!h.auth) return;
      const dmg = (45 + 215 * ch) * s.lanceMult * s.dmgMult;
      C.line(h.x, h.z, a, 42, w, (t) => {
        C.damage(t, dmg, { kx: Math.cos(a), kz: Math.sin(a), knock: 4 + 8 * ch, source: 'skill', procs: ch > 0.95, by: h });
        G.FX.spark(t.x, 1.2, t.z, 0xe8ffd0, 8, 9);
      });
      if (ch > 0.95 && h === G.Player) G.Game.hitstop(0.05);
    },
    s2(h) {
      const s = h.stats, a = h.facing, x0 = h.x, z0 = h.z;
      G.Net.visBy(h.key, 'rVault', R1(x0), R1(z0), h.key);
      if (h.drive === 'input') {
        h.dashDir = { x: -Math.cos(a), z: -Math.sin(a) };
        h.dashT = 8 / 46;
        h.invuln = Math.max(h.invuln, 0.35);
      }
      if (!h.auth) return;
      const dur = 3 + extra(s);
      G.Net.vis('zoneFx', 'smoke', R1(x0), R1(z0), 4, dur);
      CL.zones.push({ x: x0, z: z0, r: 4, t: dur, every: 0.3, tick: 0, by: h, fn(z) {
        C.forEachTarget(z.x, z.z, z.r, (t) => { if (t.applyStatus) t.applyStatus('slow', 0.5, 0.5); });
      } });
    },
    s3(h, tx, tz) {
      const s = h.stats, r = 5 * s.meteorRadius, dur = 2.4;
      G.Net.vis('zoneFx', 'rain', R1(tx), R1(tz), R1(r), dur);
      CL.zones.push({ x: tx, z: tz, r, t: dur, every: 0.3, tick: 0.25, by: h, fn(z) {
        C.forEachTarget(z.x, z.z, z.r, (t) => {
          C.damage(t, 18 * s.meteorMult * s.dmgMult, { canCrit: true, source: 'skill', by: h });
          if (t.applyStatus) t.applyStatus('slow', 0.3, 0.6);
        });
      } });
    },
    ultStart(h) { G.Net.vis('ultFx', 'ranger', R1(h.x), R1(h.z), h.key); },
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
    },
  });

  def({
    id: 'pyro', name: '화염술사', role: '불바다를 펼치는 광역 딜러', emblem: 'flame', css: '#f08c93', energy: 0xff8a3a, ultDur: 6,
    trait: { name: '잿불', desc: '모든 기본 공격이 3초 동안 불태웁니다. 불타던 적이 쓰러지면 주변에서 작게 터집니다.' },
    basic: { name: '불꽃 다발', icon: 'flame', desc: '가까이에서 부채꼴로 퍼지는 화염구 세 개', spread: 0.2 },
    skills: [
      { name: '화염 파도', icon: 'burst', cd: 4.5, desc: '모았다가 놓으면 앞쪽 부채꼴을 휩쓰는 불길. 모을수록 멀리 갑니다' },
      { name: '불의 고리', icon: 'blink', cd: 10, desc: '주변 적을 밀쳐내고 4초 동안 반지름 6m 불의 고리를 둘러 지나는 적을 태웁니다' },
      { name: '화산 분출', icon: 'meteor', cd: 12, desc: '정한 자리에서 땅이 세 번 연달아 터져 오릅니다. 갈수록 넓게' },
    ],
    ult: { name: '지옥불 화신', icon: 'skull', desc: '6초 동안 6m 안의 적을 계속 태우고, 기본 공격이 40% 세지고 커지며 이동이 빨라집니다' },
    stats(s) { s.maxHp = 95; s.dmg = 7.5; s.fireRate = 4.0; s.projSpeed = 26; s.projLife = 0.52; s.projCount = 3; s.burn += 1; },
    aim: (ch, s) => { const r = (6 + 8 * ch) * (0.85 + 0.15 * s.lanceWidth); return { len: r, w: r * 0.95 }; },
    s3R: (s) => 5 * s.meteorRadius,
    s1(h, ch) {
      const s = h.stats, a = h.facing, range = (6 + 8 * ch) * (0.85 + 0.15 * s.lanceWidth);
      G.Net.visBy(h.key, 'pWave', R1(h.x), R1(h.z), R2(a), R1(range), h.key);
      if (!h.auth) return;
      const dmg = (28 + 90 * ch) * s.lanceMult * s.dmgMult;
      C.forEachTarget(h.x, h.z, range, (t) => {
        const dx = t.x - h.x, dz = t.z - h.z, d = Math.hypot(dx, dz) || 1;
        if (Math.abs(U.angleDiff(a, Math.atan2(dz, dx))) > 0.55 && d > 1.5) return;
        C.damage(t, dmg, { kx: dx / d, kz: dz / d, knock: 6 + 6 * ch, source: 'skill', by: h });
        if (t.applyStatus) t.applyStatus('burn', 12 * s.lanceMult, 3);
      });
    },
    s2(h) {
      const s = h.stats, x0 = h.x, z0 = h.z, dur = 4 + extra(s), r = 6;
      G.Net.visBy(h.key, 'pRing', R1(x0), R1(z0), h.key);
      if (!h.auth) return;
      C.forEachTarget(x0, z0, r, (t) => {
        const dx = t.x - x0, dz = t.z - z0, d = Math.hypot(dx, dz) || 1;
        C.damage(t, 15 * s.dmgMult, { kx: dx / d, kz: dz / d, knock: 11, source: 'skill', by: h });
      });
      G.Net.vis('zoneFx', 'firering', R1(x0), R1(z0), r, dur);
      CL.zones.push({ x: x0, z: z0, r, t: dur, every: 0.4, tick: 0.4, by: h, fn(z) {
        C.forEachTarget(z.x, z.z, z.r + 1.6, (t) => {
          if (Math.abs(Math.hypot(t.x - z.x, t.z - z.z) - z.r) > 1.6 + t.r) return;
          C.damage(t, 14 * s.dmgMult, { canCrit: false, source: 'zone', cls: 'burn', by: h });
          if (t.applyStatus) t.applyStatus('burn', 8, 2);
        });
      } });
    },
    s3(h, tx, tz) {
      const s = h.stats;
      G.Net.vis('pErupt', R1(tx), R1(tz), R2(s.meteorRadius));
      [[0.45, 2.5, 40], [0.9, 3.8, 40], [1.35, 5, 60]].forEach(([at, r0, d0]) => G.Enemies.later(at, () => {
        if (!G.auth()) return;
        const r = r0 * s.meteorRadius;
        C.forEachTarget(tx, tz, r, (t) => {
          const dx = t.x - tx, dz = t.z - tz, d = Math.hypot(dx, dz) || 1;
          C.damage(t, d0 * s.meteorMult * s.dmgMult, { kx: dx / d, kz: dz / d, knock: 9, source: 'skill', by: h });
          if (t.applyStatus) t.applyStatus('burn', 10, 3);
        });
        G.World.breakAt(tx, tz, r * 0.4);
      }));
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
  });

  def({
    id: 'cleric', name: '빛의 사제', role: '동료를 살리는 치유사', emblem: 'feather', css: '#d2e2dc', energy: 0xffeebb, ultDur: 6,
    trait: { name: '은총', desc: '자신과 8m 안의 동료가 1초마다 체력을 2씩 회복합니다.' },
    basic: { name: '빛의 구슬', icon: 'crystal', desc: '천천히 날아가 적을 따라가는 빛', spread: 0.14 },
    skills: [
      { name: '정화의 빛', icon: 'star', cd: 4, desc: '모았다가 놓는 빛줄기. 적은 태우고, 빛이 지나간 동료는 회복합니다' },
      { name: '축복의 파동', icon: 'heart', cd: 11, desc: '10m 안의 동료 체력 25 회복과 4초 동안 받는 피해 30% 감소, 가까운 적은 밀쳐냅니다' },
      { name: '빛의 기둥', icon: 'leaf', cd: 14, desc: '정한 자리에 5초 동안 빛의 기둥: 적은 태우고 느리게, 동료는 회복' },
    ],
    ult: { name: '부활의 찬가', icon: 'feather', desc: '쓰러진 동료를 모두 일으키고 모두의 체력을 절반 채운 뒤, 6초 동안 모두의 피해 25% 증가' },
    stats(s) { s.maxHp = 105; s.dmg = 14; s.fireRate = 3.6; s.projSpeed = 24; s.projLife = 1.0; s.projSize = 1.2; s.homing += 1; },
    aim: (ch, s) => ({ len: 30, w: (1.2 + 1.0 * ch) * s.lanceWidth * 0.6 }),
    s3R: (s) => 4 * s.meteorRadius,
    s1(h, ch) {
      const s = h.stats, a = h.facing, w = (1.2 + 1.0 * ch) * s.lanceWidth;
      G.Net.visBy(h.key, 'cBeam', R1(h.x), R1(h.z), R2(a), R2(w), h.key);
      if (!h.auth) return;
      const dmg = (30 + 120 * ch) * s.lanceMult * s.dmgMult, heal = (15 + 45 * ch) * s.lanceMult;
      C.line(h.x, h.z, a, 30, w, (t) => C.damage(t, dmg, { kx: Math.cos(a), kz: Math.sin(a), knock: 5, source: 'skill', by: h }));
      const ca = Math.cos(a), sa = Math.sin(a);
      for (const o of HS.list) {
        if (o === h || !o.alive) continue;
        const px = o.x - h.x, pz = o.z - h.z, proj = px * ca + pz * sa;
        if (proj > 0 && proj < 30 && Math.abs(px * sa - pz * ca) < w / 2 + 0.6) o.heal(heal);
      }
    },
    s2(h) {
      const s = h.stats, dur = 4 + extra(s);
      G.Net.visBy(h.key, 'cBless', R1(h.x), R1(h.z), h.key);
      if (!h.auth) return;
      for (const o of HS.list) if (o.alive && U.dist2(o.x, o.z, h.x, h.z) < 100) { o.heal(25 * s.lanceMult); o.blessT = dur; }
      C.forEachTarget(h.x, h.z, 5, (t) => {
        const dx = t.x - h.x, dz = t.z - h.z, d = Math.hypot(dx, dz) || 1;
        C.damage(t, 20 * s.dmgMult, { kx: dx / d, kz: dz / d, knock: 12, source: 'skill', by: h });
      });
    },
    s3(h, tx, tz) {
      const s = h.stats, r = 4 * s.meteorRadius, dur = 5;
      G.Net.vis('zoneFx', 'light', R1(tx), R1(tz), R1(r), dur);
      CL.zones.push({ x: tx, z: tz, r, t: dur, every: 0.5, tick: 0.3, by: h, fn(z) {
        C.forEachTarget(z.x, z.z, z.r, (t) => {
          C.damage(t, 16 * s.meteorMult * s.dmgMult, { canCrit: false, source: 'skill', by: h });
          if (t.applyStatus) t.applyStatus('slow', 0.25, 0.7);
        });
        for (const o of HS.list) if (o.alive && U.dist2(o.x, o.z, z.x, z.z) < z.r * z.r) o.heal(6 * s.meteorMult, true);
      } });
    },
    ultStart(h) {
      G.Net.vis('ultFx', 'cleric', R1(h.x), R1(h.z), h.key);
      const back = [];
      for (const o of HS.list) {
        if (!o.alive) { o.revive(0.5); back.push(o.name || '동료'); }
        else o.heal(o.stats.maxHp * 0.5);
        G.Net.vis('pillar', R1(o.x), R1(o.z), 0xffeebb);
      }
      if (back.length) G.Net.vis('toast', back.join(', ') + '님이 빛 속에서 일어났어요', 'good');
    },
    model(h, add, M) {
      add(new THREE.TorusGeometry(0.3, 0.035, 8, 26), M.glow, 0, 2.2, 0).rotation.x = Math.PI / 2;
      add(new THREE.SphereGeometry(0.27, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.robe, 0, 1.84, 0.02);
      add(new THREE.TorusGeometry(0.26, 0.035, 6, 18), M.gold, 0, 1.86, 0.02).rotation.x = Math.PI / 2;
      add(new THREE.CylinderGeometry(0.035, 0.035, 1.9, 6), M.gold, 0.52, 1.0, 0.02);
      add(new THREE.OctahedronGeometry(0.15, 0), M.glow, 0.52, 2.05, 0.02).scale.set(1, 1.5, 1);
      add(new THREE.TorusGeometry(0.13, 0.02, 6, 14), M.gold, 0.52, 2.05, 0.02);
    },
  });

  // ================= what the hero code asks =================
  // all damage a hero takes runs through this: traits, shields, sanctuaries and the aegis
  CL.takenMult = function (h) {
    let m = 1;
    if (h.cls.id === 'guardian') m *= 0.8;
    if (h.guardT > 0) m *= 0.6;
    if (h.blessT > 0) m *= 0.7;
    if (h.sanctT > 0) m *= 0.75;
    for (const g of HS.list) {
      if (!g.alive || g.cls.id !== 'guardian') continue;
      const d2 = U.dist2(g.x, g.z, h.x, h.z);
      if (g !== h && d2 < 36) m *= 0.9;
      if (g.ultT > 0 && d2 < 100) m *= 0.4;
    }
    return Math.max(0.2, m);
  };
  // damage a hero deals: the ranger's long shots, the cleric's hymn for everyone
  CL.dealtMult = function (h, t) {
    let m = 1;
    if (h.cls.id === 'ranger' && U.dist2(h.x, h.z, t.x, t.z) > 196) m *= 1.3;
    for (const o of HS.list) if (o.cls.id === 'cleric' && o.ultT > 0) { m *= 1.25; break; }
    return m;
  };
  CL.critBonus = (h) => (h.cls.id === 'ranger' && h.ultT > 0 ? 0.25 : 0);
  // every frame on the authoritative machine: buff timers, the cleric's healing aura
  CL.tick = function (h, dt) {
    h.tauntT = Math.max(0, (h.tauntT || 0) - dt);
    h.guardT = Math.max(0, (h.guardT || 0) - dt);
    h.blessT = Math.max(0, (h.blessT || 0) - dt);
    h.sanctT = Math.max(0, (h.sanctT || 0) - dt);
    if (h.cls.id === 'cleric') {
      h.auraT = (h.auraT || 0) - dt;
      if (h.auraT <= 0) {
        h.auraT = 1;
        for (const o of HS.list) if (o.alive && U.dist2(o.x, o.z, h.x, h.z) < 64) o.heal(2, true);
      }
    }
  };
  // the pyromancer's burning dead burst
  CL.onKill = function (e) {
    const h = e.lastBy;
    if (!h || !h.cls || h.cls.id !== 'pyro' || !(e.burn > 0)) return;
    G.Net.vis('boom', R1(e.x), R1(e.z), 2.5, 0xff7a2a, 0.05);
    C.forEachTarget(e.x, e.z, 2.5, (t) => { if (t !== e) C.damage(t, 14 * h.stats.dmgMult, { canCrit: false, source: 'explosion', by: h }); });
  };

  // ================= timed areas =================
  CL.update = function (dt) {
    if (G.auth()) {
      for (let i = CL.zones.length - 1; i >= 0; i--) {
        const z = CL.zones[i];
        z.t -= dt; z.tick -= dt;
        if (z.tick <= 0) { z.tick += z.every; z.fn(z); }
        if (z.t <= 0) CL.zones.splice(i, 1);
      }
    }
    updateFx(dt);
  };
  CL.clear = function () {
    CL.zones.length = 0;
    for (const f of fx) if (f.tele) f.tele.kill();
    fx.length = 0;
  };

  // ================= visuals (every machine) =================
  const V = G.Vis, fx = [];
  const hy = (x, z) => G.World.heightAt(x, z);
  const mine = (key) => !!G.Player && key === G.Player.key;
  const ZC = { sanct: 0xffd98a, smoke: 0x9a948c, rain: 0xb8f07a, firering: 0xff6a20, light: 0xffeebb };
  V.zoneFx = (kind, x, z, r, dur) => {
    kind = String(kind);
    r = U.clamp(+r || 1, 0.5, 20); dur = U.clamp(+dur || 1, 0.2, 12);
    const color = ZC[kind] || 0xffffff;
    const tele = kind === 'smoke' ? null : G.FX.telegraph({ shape: 'circle', x, z, r, hold: true, color, k: kind === 'firering' ? 1.6 : 1.1 });
    fx.push({ kind, x, z, r, t: dur, tele, color });
    if (kind === 'light') G.FX.pillar(x, z, color, 60, 14);
    if (kind === 'sanct') G.FX.ring(x, hy(x, z) + 0.2, z, 0.5, r, 0.5, color, 2.2);
    if (kind === 'smoke') G.FX.smoke(x, hy(x, z) + 0.6, z, 18, 0x6a645e, 3, 3);
    if (kind === 'firering') G.Audio.play('explode');
    if (kind === 'rain') G.Audio.play('enemyShoot');
  };
  function updateFx(dt) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      f.t -= dt;
      const y = hy(f.x, f.z), c = tmpC.set(f.color);
      const a = Math.random() * U.TAU, rr = Math.sqrt(Math.random()) * f.r;
      const px = f.x + Math.cos(a) * rr, pz = f.z + Math.sin(a) * rr;
      if (f.kind === 'sanct' && Math.random() < 0.7) G.FX.P.emit(px, y + 0.2, pz, 0, U.rand(1.5, 3), 0, 0.8, 0.3, 0.02, c.r * 2.4, c.g * 2.4, c.b * 2.4, 1, 0.5, 0);
      else if (f.kind === 'smoke' && Math.random() < 0.25) G.FX.smoke(px, y + 0.5, pz, 1, 0x6a645e, 2.4, 1);
      else if (f.kind === 'rain') {
        for (let k = 0; k < 3; k++) {
          const b = Math.random() * U.TAU, br = Math.sqrt(Math.random()) * f.r;
          G.FX.P.emit(f.x + Math.cos(b) * br + 1.5, y + 9, f.z + Math.sin(b) * br - 1, -6, -34, 4, 0.26, 0.22, 0.05, 1.6, 2.6, 1.2, 1, 0, 0);
        }
        if (Math.random() < 0.3) G.FX.spark(px, y + 0.2, pz, 0xe8ffd0, 3, 4);
      } else if (f.kind === 'firering') {
        for (let k = 0; k < 3; k++) {
          const b = Math.random() * U.TAU;
          G.FX.P.emit(f.x + Math.cos(b) * f.r, y + 0.2, f.z + Math.sin(b) * f.r, 0, U.rand(2, 5), 0, 0.5, 0.55, 0.05, 3, 1.1, 0.25, 1, 1, 0);
        }
      } else if (f.kind === 'light' && Math.random() < 0.8) G.FX.P.emit(px, y + 0.2, pz, 0, U.rand(3, 6), 0, 0.7, 0.35, 0.02, 2.6, 2.4, 1.8, 1, 0.5, 0);
      if (f.t <= 0) { if (f.tele) f.tele.kill(); fx.splice(i, 1); }
    }
  }
  const tmpC = new THREE.Color();
  const near = (x, z) => { const P = G.Player; return P ? U.clamp(1.25 - U.dist(x, z, P.x, P.z) / 28, 0.12, 1) : 1; };

  V.gCharge = (x, z, a, dist, key) => {
    const y = hy(x, z) + 0.6;
    G.FX.beam(x, y, z, a, dist, 2.4, 0xffd98a, 0.3);
    G.FX.smoke(x, y, z, 6, 0x8a7a68, 2, 3);
    G.Audio.play('dash');
    G.Audio.play('slam');
    if (mine(key)) G.Render.shake(0.25);
  };
  V.gRoar = (x, z, key) => {
    const y = hy(x, z);
    G.FX.ring(x, y + 0.3, z, 0.5, 10, 0.5, 0xffb04a, 2.6);
    G.FX.ring(x, y + 0.6, z, 0.3, 6, 0.35, 0xffffff, 1.8);
    G.FX.burst(x, y + 1.5, z, { count: 30, color: 0xffc060, intensity: 2.2, spread: 'ring', speed: [6, 14], life: [0.3, 0.5], size: [0.4, 0.04], drag: 3 });
    G.Audio.play('bossRoar');
    if (mine(key)) G.Render.shake(0.3);
  };
  V.rShot = (x, z, a, w, full, key) => {
    const y = hy(x, z) + 1.4, col = full ? 0xffffff : 0xc8ff9a;
    G.FX.beam(x, y, z, a, 42, Math.max(0.3, w * 0.9), col, full ? 0.4 : 0.25);
    G.FX.burst(x + Math.cos(a), y, z + Math.sin(a), { count: 14, color: col, intensity: 2.4, speed: [8, 18], life: [0.12, 0.3], size: [0.35, 0.02], dir: { x: Math.cos(a), y: 0, z: Math.sin(a) }, cone: 0.2 });
    G.Audio.play('lanceFire', { power: full ? 1.1 : 0.7 });
    if (mine(key)) G.Render.shake(full ? 0.3 : 0.12);
  };
  V.rVault = (x, z, key) => {
    const y = hy(x, z);
    G.FX.smoke(x, y + 0.6, z, 14, 0x6a645e, 2.6, 3);
    G.FX.ring(x, y + 0.2, z, 0.4, 3, 0.3, 0xc8ff9a, 1.8);
    G.Audio.play('dash');
  };
  V.pWave = (x, z, a, range) => {
    const y = hy(x, z) + 0.8;
    for (let i = 0; i < 26; i++) {
      const b = a + U.rand(-0.55, 0.55), sp = U.rand(range * 1.4, range * 2.6);
      G.FX.P.emit(x + Math.cos(a) * 0.6, y, z + Math.sin(a) * 0.6, Math.cos(b) * sp, U.rand(0, 2), Math.sin(b) * sp, U.rand(0.3, 0.45), 0.9, 0.2, 3, 1.1, 0.25, 1, 2, 0);
    }
    G.FX.burst(x, y, z, { count: 12, color: 0xffb04a, intensity: 2.6, speed: [3, 8], life: [0.2, 0.4], size: [0.6, 0.05], dir: { x: Math.cos(a), y: 0, z: Math.sin(a) }, cone: 0.5 });
    G.Audio.play('explode');
  };
  V.pRing = (x, z, key) => {
    const y = hy(x, z);
    G.FX.ring(x, y + 0.3, z, 0.5, 6, 0.4, 0xff7a2a, 2.8);
    G.FX.burst(x, y + 0.6, z, { count: 40, color: 0xff8a3a, intensity: 2.6, spread: 'ring', speed: [8, 16], life: [0.25, 0.45], size: [0.5, 0.05], drag: 3 });
    if (mine(key)) G.Render.shake(0.25);
  };
  V.pErupt = (x, z, rk) => {
    rk = U.clamp(+rk || 1, 0.5, 3);
    [[0.45, 2.5], [0.9, 3.8], [1.35, 5]].forEach(([at, r0]) => {
      const r = r0 * rk;
      G.FX.telegraph({ shape: 'circle', x, z, r, dur: at, color: 0xff5a1a, k: 1.4 });
      setTimeout(() => {
        G.FX.explosion(x, hy(x, z), z, r, 0xff7a2a, 0.35 * near(x, z));
        G.FX.pillar(x, z, 0xff8a3a, 20, 5 + r);
        G.Audio.play('explode', { big: r > 4 });
      }, at * 1000);
    });
  };
  V.cBeam = (x, z, a, w, key) => {
    const y = hy(x, z) + 1.4;
    G.FX.beam(x, y, z, a, 30, Math.max(0.5, w * 1.4), 0xffeebb, 0.35);
    G.FX.burst(x + Math.cos(a), y, z + Math.sin(a), { count: 16, color: 0xfff4d0, intensity: 2.4, speed: [6, 14], life: [0.15, 0.35], size: [0.4, 0.02], dir: { x: Math.cos(a), y: 0, z: Math.sin(a) }, cone: 0.25 });
    G.Audio.play('lanceFire', { power: 0.8 });
    if (mine(key)) G.Render.shake(0.12);
  };
  V.cBless = (x, z, key) => {
    const y = hy(x, z);
    G.FX.ring(x, y + 0.3, z, 0.5, 10, 0.6, 0xffeebb, 2.4);
    G.FX.burst(x, y + 0.8, z, { count: 40, color: 0xfff4c8, intensity: 2.2, spread: 'up', speed: [3, 8], life: [0.5, 0.9], size: [0.4, 0.03], drag: 2, jitter: 2 });
    G.Audio.play('heal');
    G.Audio.play('levelup');
  };
  const ULT_FX = { guardian: [0xffd98a, '수호의 결계'], ranger: [0xb8f07a, '매의 눈'], pyro: [0xff6a1a, '지옥불 화신'], cleric: [0xffeebb, '부활의 찬가'] };
  V.ultFx = (kind, x, z, key) => {
    const f = ULT_FX[String(kind)];
    if (!f) return;
    const y = hy(x, z);
    G.FX.pillar(x, z, f[0], 80, 12);
    G.FX.ring(x, y + 0.3, z, 1, kind === 'guardian' ? 10 : 9, 0.6, f[0], 2.6);
    G.Audio.play('ult');
    if (mine(key)) { G.UI.banner(f[1], '', 'gold'); G.Render.screenFlash(0.2); G.Render.shake(0.35); }
    else { const h = G.Heroes.get(key); if (h && h.name) G.UI.toast(h.name + ' · ' + f[1], 'gold', 1.6); }
  };

  // ultimates you can see on every machine (ultT travels with the host's snapshot)
  CL.ultLook = function (h, dt, t) {
    if (!(h.ultT > 0) || !h.alive) return;
    const id = h.cls.id, y = h.y;
    if (id === 'guardian' && Math.random() < 0.6) {
      const a = Math.random() * U.TAU;
      G.FX.P.emit(h.x + Math.cos(a) * 10, y + 0.3, h.z + Math.sin(a) * 10, 0, U.rand(1, 3), 0, 0.6, 0.4, 0.02, 2.6, 2.2, 1.2, 1, 0.5, 0);
    } else if (id === 'pyro') {
      for (let k = 0; k < 2; k++) {
        const a = Math.random() * U.TAU, r = Math.sqrt(Math.random()) * 6;
        G.FX.P.emit(h.x + Math.cos(a) * r, y + 0.2, h.z + Math.sin(a) * r, 0, U.rand(2, 5), 0, 0.5, 0.5, 0.05, 3, 1.1, 0.25, 1, 1, 0);
      }
    } else if (id === 'ranger' && Math.random() < 0.4) G.FX.trail(h.x + U.rand(-0.6, 0.6), y + U.rand(0.5, 2), h.z + U.rand(-0.6, 0.6), 0xb8f07a, 0.4, 0.4, 2.2);
    else if (id === 'cleric' && Math.random() < 0.5) G.FX.trail(h.x + U.rand(-0.8, 0.8), y + U.rand(0.5, 2.4), h.z + U.rand(-0.8, 0.8), 0xffeebb, 0.45, 0.5, 2.2);
  };
})();

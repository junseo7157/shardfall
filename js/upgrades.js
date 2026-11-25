// ============================================================
// SHARDFALL - upgrades: level-up cards (per hero) + soul forge (meta)
// ============================================================
(() => {
  const G = window.G, U = G.U;

  // w = chance (in %) that a card slot draws from that tier. The tier is rolled first and the card
  // inside it second, so a tier stays exactly this rare however many cards it holds.
  const RARITY = {
    common: { w: 69, kr: '일반' },
    rare: { w: 24, kr: '희귀' },
    epic: { w: 6, kr: '영웅' },
    legendary: { w: 1, kr: '전설' },
  };
  const ORDER = ['common', 'rare', 'epic', 'legendary'];

  // apply(stats, newLevel, hero): side effects (heal, ult, score) only run on the authoritative machine
  const D = (id, name, icon, rarity, max, desc, apply) => ({ id, name, icon, rarity, max, desc, apply });
  const defs = [
    D('sharp', '날 선 파편', 'blade', 'common', 8, () => '모든 피해 <b>+12%</b>', (s) => { s.dmgMult += 0.12; }),
    // attack speed compounds (x2.5 at max), so it sits a tier up
    D('rapid', '빠른 손', 'bolt', 'rare', 8, () => '공격 속도 <b>+12%</b>', (s) => { s.fireRate *= 1.12; }),
    D('precision', '정조준', 'target', 'common', 6, () => '치명타 확률 <b>+7%</b>', (s) => { s.crit += 0.07; }),
    D('swift', '가벼운 장화', 'boot', 'common', 5, () => '이동 속도 <b>+8%</b>', (s) => { s.speed *= 1.08; }),
    D('vitality', '튼튼한 심장', 'heart', 'common', 8, () => '최대 체력 <b>+25</b>, 바로 25 회복', (s, l, h) => { s.maxHp += 25; if (h.auth) h.heal(25); }),
    D('magnet', '자석 반지', 'magnet', 'common', 4, () => '줍는 범위 <b>+35%</b>', (s) => { s.pickup *= 1.35; }),
    D('wisdom', '낡은 마법서', 'book', 'common', 5, () => '경험치 <b>+15%</b>', (s) => { s.xpMult += 0.15; }),
    D('velocity', '바람 깃', 'arrow', 'common', 4, () => '탄속 <b>+20%</b>, 사거리 <b>+15%</b>', (s) => { s.projSpeed *= 1.2; s.projLife *= 1.15; }),
    D('enlarge', '굵은 결정', 'crystal', 'common', 4, () => '탄 크기 <b>+25%</b>, 피해 <b>+6%</b>', (s) => { s.projSize += 0.25; s.dmgMult += 0.06; }),
    D('armor', '덧댄 갑옷', 'shield', 'common', 5, () => '방어력 <b>+4</b>', (s) => { s.armor += 4; }),

    // every extra bolt multiplies all damage and every on-hit effect, so it is an epic
    D('multishot', '세 갈래', 'trident', 'epic', 4, (l, h) => `한 번에 쏘는 탄 <b>+1</b> (지금 ${h ? h.stats.projCount : 1}발)`, (s) => { s.projCount += 1; }),
    D('pierce', '꿰뚫기', 'pierce', 'rare', 3, () => '탄이 적 <b>1명</b>을 더 뚫음', (s) => { s.pierce += 1; }),
    D('executioner', '처형인', 'skull', 'rare', 4, () => '치명타 피해 <b>+40%</b>', (s) => { s.critMult += 0.4; }),
    D('regen', '새싹', 'leaf', 'rare', 4, () => '초당 체력 <b>0.8</b> 회복', (s) => { s.regen += 0.8; }),
    D('windstep', '두 번 딛기', 'wind', 'rare', 2, () => '질주 <b>+1회</b>, 질주 대기 <b>-10%</b>', (s) => { s.dashCharges += 1; s.dashCd *= 0.9; }),
    D('arcane', '룬 새김', 'rune', 'rare', 4, () => '스킬 대기시간 <b>-10%</b>', (s) => { s.cdMult *= 0.9; }),
    D('ignite', '불씨', 'flame', 'rare', 4, (l) => `맞은 적이 3초 동안 불탐 (초당 <b>${4 + l * 4}</b>)`, (s) => { s.burn += 1; }),
    D('frost', '서리', 'snow', 'rare', 3, (l) => `<b>${20 + l * 10}%</b> 확률로 2초간 40% 둔화`, (s) => { s.frost += 1; }),
    D('seeker', '눈 달린 탄', 'eye', 'rare', 3, () => '탄이 가까운 적을 <b>따라감</b>', (s) => { s.homing += 1; }),
    D('thorns', '가시 덩굴', 'thorns', 'rare', 3, () => '방어력 <b>+3</b>, 맞으면 주변에 반격', (s) => { s.armor += 3; s.thorns += 1; }),
    D('hunter', '사냥꾼', 'crown', 'rare', 3, () => '엘리트·보스에게 피해 <b>+25%</b>', (s) => { s.hunter += 0.25; }),
    D('meteor', '큰 별똥별', 'meteor', 'rare', 3, () => '운석 피해 <b>+40%</b>, 범위 <b>+15%</b>', (s) => { s.meteorMult += 0.4; s.meteorRadius += 0.15; }),
    D('glacial', '얼음 심장', 'ice', 'rare', 3, () => '서리 노바 대기 <b>-15%</b>, 빙결 <b>+0.5초</b>', (s) => { s.novaCdMult *= 0.85; s.freezeDur += 0.5; }),
    D('lance', '창 다루기', 'spear', 'rare', 3, () => '파편 창 피해 <b>+45%</b>, 굵기 <b>+20%</b>', (s) => { s.lanceMult += 0.45; s.lanceWidth += 0.2; }),
    D('overcharge', '과충전', 'battery', 'rare', 3, () => '궁극기 충전 <b>+30%</b>', (s) => { s.ultGain += 0.3; }),

    D('chain', '번개 사슬', 'chain', 'epic', 4, (l) => `<b>${15 + l * 7}%</b> 확률로 번개가 <b>${2 + l}명</b>에게 튐`, (s) => { s.chain += 1; }),
    D('volatile', '터지는 탄', 'burst', 'epic', 3, (l) => `<b>${12 + l * 8}%</b> 확률로 맞은 자리에서 폭발`, (s) => { s.explode += 1; }),
    D('ricochet', '튕기는 탄', 'ricochet', 'epic', 3, () => '탄이 다른 적에게 <b>1번</b> 더 튕김', (s) => { s.ricochet += 1; }),
    D('blades', '도는 칼날', 'blades', 'epic', 6, (l, h) => `몸 주위를 도는 칼날 <b>+1</b> (지금 ${h ? h.stats.blades : 0}개)`, (s) => { s.blades += 1; }),
    D('drone', '작은 드론', 'drone', 'epic', 3, () => '스스로 쏘는 드론 <b>+1</b>', (s) => { s.drones += 1; }),
    D('vampire', '흡혈', 'drop', 'epic', 3, () => '처치 때 <b>12%</b> 확률로 체력 3 회복', (s) => { s.lifestealKill += 0.12; }),
    D('berserk', '광기', 'axe', 'epic', 2, () => '잃은 체력만큼 피해 증가 (최대 <b>+50%</b>)', (s) => { s.berserk += 0.5; }),
    D('blinknova', '착지 충격', 'blink', 'epic', 2, () => '질주가 끝난 자리에 <b>충격파</b>', (s) => { s.blinkNova += 1; }),

    D('starheart', '별의 심장', 'star', 'legendary', 1, () => '모든 피해 <b>+30%</b>, 최대 체력 <b>+50</b>', (s, l, h) => { s.dmgMult += 0.3; s.maxHp += 50; if (h.auth) h.heal(50); }),
    D('echo', '메아리', 'echo', 'legendary', 1, () => '<b>30%</b> 확률로 한 번 더 발사', (s) => { s.echo = 0.3; }),
    D('phoenix', '불사조 깃털', 'feather', 'legendary', 1, () => '쓰러지면 <b>한 번</b> 체력 60%로 일어남', (s) => { s.phoenix += 1; }),
    D('chrono', '느린 모래', 'hourglass', 'legendary', 1, () => '주변 7m 적과 적 탄 <b>35%</b> 느려짐', (s) => { s.chrono = 1; }),
    D('storm', '폭풍의 눈', 'storm', 'legendary', 1, () => '1.5초마다 주변 적 3명에게 <b>벼락</b>', (s) => { s.storm = 1; }),
    D('avatar', '파편 갑주', 'gem', 'legendary', 1, () => '궁극기 <b>+2초</b>, 궁극기 동안 <b>무적</b>', (s) => { s.avatar = 1; }),
  ];
  // basic-attack boosters (attack speed, bolt speed, more bolts, echoes) come up far less often than
  // the other cards of their tier
  const RARE_PICK = { rapid: 0.3, velocity: 0.3, multishot: 0.3, echo: 0.4 };
  for (const d of defs) d.w = RARE_PICK[d.id] || 1;
  // skill cards follow the hero's character: the shard mage keeps these names, others get their own
  // skill's name and what the card does to it (skills[i].up)
  const SKILL_ALT = {
    lance: { name: (c) => c.skills[0].name + ' 연마', desc: (c) => c.skills[0].up || `${c.skills[0].name} 위력 <b>+45%</b>, 크기 <b>+20%</b>` },
    glacial: { name: (c) => c.skills[1].name + ' 숙련', desc: (c) => c.skills[1].up || `${c.skills[1].name} 대기시간 <b>-15%</b>, 효과 시간 <b>+0.5초</b>` },
    meteor: { name: (c) => c.skills[2].name + ' 강화', desc: (c) => c.skills[2].up || `${c.skills[2].name} 위력 <b>+40%</b>, 범위 <b>+15%</b>` },
  };
  // offered only when nothing else is left
  const FALLBACK = [
    D('_heal', '붕대', 'cross', 'common', 99, () => '체력 <b>40</b> 회복, 최대 체력 <b>+5</b>', (s, l, h) => { s.maxHp += 5; if (h.auth) h.heal(40); }),
    D('_power', '정제된 파편', 'crystal', 'rare', 99, () => '모든 피해 <b>+4%</b>, 궁극기 <b>30%</b> 충전', (s, l, h) => { s.dmgMult += 0.04; if (h.auth) h.addUlt(30); }),
    D('_score', '전리품', 'coins', 'common', 99, () => '점수 <b>+2,500</b>', (s, l, h) => { if (h.auth) G.Game.addScore(2500); }),
  ];

  const CODES = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const ALL = defs.concat(FALLBACK);
  const UP = (G.Upgrades = { defs, ALL, RARITY, byId: {}, byCode: {} });
  ALL.forEach((d, i) => { d.code = CODES[i]; UP.byId[d.id] = d; UP.byCode[d.code] = d; });

  UP.level = (hero, id) => (hero.up.levels[id] || 0);
  // a character can word a card its own way (a melee fighter's "more bolts" widens its swing)
  const altFor = (d, h) => {
    const c = h && h.cls;
    if (!c) return null;
    const own = c.cardAlt && c.cardAlt[d.id];
    if (own) return { name: own.name, desc: own.desc };
    const a = SKILL_ALT[d.id];
    return a && c.id !== 'shard' ? { name: a.name(c), desc: a.desc(c) } : null;
  };
  UP.nameOf = (d, h) => { const x = altFor(d, h); return (x && x.name) || d.name; };
  UP.descOf = (d, lv, h) => { const x = altFor(d, h); return (x && x.desc) || d.desc(lv, h); };

  // tier weights for this hero and this draw (forge luck lifts the upper tiers, chests skip the lower ones)
  UP.tierWeights = function (hero, opts = {}) {
    const luck = hero.stats.luck || 0, minIdx = ORDER.indexOf(opts.minRarity || 'common');
    const w = {
      common: RARITY.common.w,
      rare: RARITY.rare.w * (1 + luck * 0.25),
      epic: RARITY.epic.w * (1 + luck * 0.4),
      legendary: RARITY.legendary.w * (1 + luck * 0.6) * (opts.legendBoost || 1),
    };
    ORDER.forEach((r, i) => { if (i < minIdx) w[r] = 0; });
    return w;
  };
  // chance in % per card slot, for the odds line under the cards
  UP.odds = function (hero, opts = {}) {
    const w = UP.tierWeights(hero, opts);
    const total = ORDER.reduce((a, r) => a + w[r], 0) || 1;
    return ORDER.filter((r) => w[r] > 0).map((r) => ({ r, kr: RARITY[r].kr, p: (w[r] / total) * 100 }));
  };

  UP.roll = function (hero, n = 3, opts = {}) {
    const tw = UP.tierWeights(hero, opts);
    // cards that do nothing for this character (homing for an axe) never come up
    const off = (hero.cls && hero.cls.cardOff) || [];
    const pool = defs.filter((d) => UP.level(hero, d.id) < d.max && tw[d.rarity] > 0 && !off.includes(d.id));
    const out = [];
    while (out.length < n && pool.length) {
      // a tier with nothing left to give drops out and the others share its chance
      const tiers = ORDER.filter((r) => tw[r] > 0 && pool.some((d) => d.rarity === r));
      const r = U.weightedPick(tiers, (t) => tw[t]);
      const d = U.weightedPick(pool.filter((c) => c.rarity === r), (c) => c.w * (UP.level(hero, c.id) > 0 ? 1.15 : 1));
      out.push(d);
      pool.splice(pool.indexOf(d), 1);
    }
    for (let i = 0; out.length < n && i < FALLBACK.length; i++) out.push(FALLBACK[i]);
    return out;
  };

  UP.take = function (hero, d) {
    const lvl = UP.level(hero, d.id) + 1;
    d.apply(hero.stats, lvl, hero);
    if (d.id[0] !== '_') {
      if (!hero.up.levels[d.id]) hero.up.order.push(d.id);
      hero.up.levels[d.id] = lvl;
    }
    hero.picks += d.code;
    hero.maxHp = hero.stats.maxHp;
    if (hero === G.Player) G.Events.emit('upgrade', d);
  };

  // ---------------- Soul forge (permanent, per browser) ----------------
  const F = (id, name, icon, max, base, desc, apply) => ({ id, name, icon, max, base, desc, apply });
  UP.forge = [
    F('hp', '강인함', 'heart', 5, 40, '최대 체력 +10', (s, l) => { s.maxHp += 10 * l; }),
    F('dmg', '파괴력', 'blade', 5, 50, '모든 피해 +5%', (s, l) => { s.dmgMult += 0.05 * l; }),
    F('speed', '민첩', 'boot', 3, 40, '이동 속도 +3%', (s, l) => { s.speed *= 1 + 0.03 * l; }),
    F('xp', '통찰', 'book', 4, 45, '경험치 +8%', (s, l) => { s.xpMult += 0.08 * l; }),
    F('magnet', '끌어당김', 'magnet', 3, 30, '줍는 범위 +15%', (s, l) => { s.pickup *= 1 + 0.15 * l; }),
    F('regen', '회복력', 'leaf', 3, 50, '초당 체력 회복 +0.3', (s, l) => { s.regen += 0.3 * l; }),
    F('reroll', '운명 조작', 'dice', 3, 60, '카드 다시 뽑기 +1', (s, l) => { s.rerolls += l; }),
    F('luck', '행운', 'clover', 3, 70, '높은 등급 카드가 더 자주 나옴', (s, l) => { s.luck += l; }),
    F('cd', '시간의 모래', 'hourglass', 3, 60, '스킬 대기시간 -4%', (s, l) => { s.cdMult *= 1 - 0.04 * l; }),
    F('revive', '두 번째 기회', 'feather', 1, 300, '판마다 한 번 부활', (s, l) => { s.phoenix += l; }),
    F('start', '준비된 전사', 'chest', 2, 120, '시작할 때 카드 +1', (s, l) => { s.startBonus = l; }),
  ];
  UP.forgeLevel = (id) => (G.Save.data.forge[id] || 0);
  UP.forgeCost = (f) => Math.round(f.base * (1 + UP.forgeLevel(f.id) * 0.9));
  UP.buyForge = function (id) {
    const f = UP.forge.find((q) => q.id === id);
    if (!f) return false;
    const lvl = UP.forgeLevel(id), cost = UP.forgeCost(f);
    if (lvl >= f.max || G.Save.data.shards < cost) return false;
    G.Save.data.shards -= cost;
    G.Save.data.forge[id] = lvl + 1;
    G.Save.write();
    return true;
  };
  // forge levels as a digit string (sent to the co-op host so it can rebuild your stats)
  UP.forgeCode = () => UP.forge.map((f) => Math.min(9, UP.forgeLevel(f.id))).join('');
  UP.applyForge = function (s, code) {
    UP.forge.forEach((f, i) => {
      const l = Math.min(f.max, parseInt((code || '')[i], 10) || 0);
      if (l > 0) f.apply(s, l);
    });
  };
})();

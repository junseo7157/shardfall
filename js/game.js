// ============================================================
// SHARDFALL - game: boot, main loop, solo / co-op host / co-op client, stage director, scoring
// ============================================================
(() => {
  const G = window.G, U = G.U;
  const FINAL_WAVE = 15;
  const WS = ['none', 'intro', 'spawn', 'clear', 'inter', 'done'];
  const Gm = (G.Game = {
    state: 'loading', mode: 'solo', score: 0, combo: 0, comboT: 0, time: 0, wave: 0, endless: false, menuOpen: false,
    stats: { kills: 0, damage: 0, taken: 0, maxCombo: 0, elites: 0, bosses: 0 },
    team: { lv: 1, xp: 0, xpNext: 14, pq: '' }, picksDone: 0, pickPause: false,
  });
  let last = performance.now(), t = 0;
  let hitstopT = 0, slowT = 0, slowScale = 1, dyingT = 0, resultT = 0;
  let ws = 'none', waveT = 0, spawnT = 0, spawned = 0, budget = 0, isBoss = false, elitesLeft = 0, chestThisStage = false;
  let pickDelay = 0, pickWaitT = 0, netRemain = 0, netProgress = 0;
  let banked = 0, bankedKills = 0, wonOnce = false;
  let runRec = null, recBank = { kills: 0, time: 0, bosses: 0 }; // this run's line in the records book
  const NEW_ENEMY = {
    2: ['주술사', '세 갈래로 탄을 쏩니다'], 3: ['폭탄병', '붙으면 터집니다. 붉은 원 밖으로'], 4: ['거석병', '팔을 들면 곧 내려찍습니다'],
    6: ['분열체', '죽으면 둘로 갈라집니다'], 7: ['망령 기사', '멀어지면 곁으로 순간이동합니다'], 8: ['도약 거미', '웅크리면 표시된 자리로 뛰어듭니다'],
    9: ['방패병', '앞에서 쏜 탄은 막힙니다. 옆으로 돌거나 파편 창으로 뚫으세요'], 11: ['저격수', '푸른 조준선이 보이면 옆으로 비키세요'],
    12: ['치유사', '주변 적을 되살립니다. 먼저 쓰러뜨리세요'],
  };
  // difficulty: k scales enemy and boss health and the damage they deal; rw scales score and soul shards.
  // Every tier was lowered 1.7x from the original tuning and then raised 1.2x (BASE); the tiers
  // keep their ratios to normal.
  const BASE = 1.2 / 1.7;
  const DIFFS = {
    easy: { name: '쉬움', k: BASE / 1.7, rw: 0.6, css: 'var(--emerald-l)' },
    normal: { name: '보통', k: BASE, rw: 1, css: 'var(--cobalt-l)' },
    hard: { name: '어려움', k: BASE * 1.4, rw: 1.4, css: 'var(--amber-l)' },
    hell: { name: '지옥', k: BASE * 2.38, rw: 2.38, css: 'var(--ruby-l)' },
  };
  Gm.DIFFS = DIFFS;
  // co-op party scaling, per extra player: the island's area grows with the enemy count (+60%), so
  // the crowd stays as dense as solo; enemies get +35% health and +12% damage, bosses +90% health
  const PARTY = (pc) => {
    const x = U.clamp(pc | 0, 1, 4) - 1;
    return { pc: x + 1, area: 1 + 0.6 * x, count: 1 + 0.6 * x, hp: 1 + 0.35 * x, dmg: 1 + 0.12 * x, boss: 1 + 0.9 * x };
  };
  Gm.PARTY = PARTY;
  Gm.mapPlayers = 1;
  const mapScale = (pc) => Math.sqrt(PARTY(pc).area);
  // sky, light and colour grade, the monsters' palette; the island itself comes from World.setup
  function applyLook(look) {
    G.HellU.value = look === 'hell' ? 1 : 0;
    G.Render.setTheme(look);
    G.Enemies.setTheme(look);
  }
  // menus and the lobby always show the ordinary sunset island
  function plainLook() {
    applyLook('normal');
    G.World.setup(1, 'normal');
  }
  Gm.DIFF_KEYS = ['easy', 'normal', 'hard', 'hell'];
  Gm.diff = 'normal';
  const D = () => DIFFS[Gm.diff] || DIFFS.normal;
  Gm.diffInfo = D;

  // ---------------- boot ----------------
  G.boot = async function () {
    G.Input.init();
    G.Render.init(document.getElementById('gl'));
    const scene = G.Render.scene;
    G.World.build(scene);
    G.FX.init(scene);
    G.Heroes.init(scene);
    G.Proj.init(scene);
    G.Enemies.init(scene);
    G.Bosses.init(scene);
    G.Pickups.init(scene);
    G.Net.init();
    G.Player = G.Heroes.add('me', { local: true, auth: true, color: G.Settings.color, slot: 0 });
    G.UI.init();
    G.Touch.init();
    try {
      if (G.Render.renderer.compileAsync) await G.Render.renderer.compileAsync(scene, G.Render.camera);
      else G.Render.renderer.compile(scene, G.Render.camera);
    } catch (e) { console.warn(e); }
    G.Player.hideBody();
    Gm.state = 'menu';
    G.UI.show('menu');
    G.UI.hud(false);
    addEventListener('blur', () => { if (Gm.state === 'playing' && Gm.mode === 'solo') Gm.pause(); });
    requestAnimationFrame(frame);
    // a shared link with a room code opens the co-op screen and joins
    const tryJoin = () => {
      if (!G.Net.pendingCode || G.Net.status === 'connecting') return;
      const code = G.Net.pendingCode;
      G.Net.pendingCode = '';
      if (!G.Net.available()) { G.UI.show('coop'); return; }
      G.UI.show('coop');
      G.Net.joinRoom(code).then((ok) => { if (ok) G.UI.show('lobby'); });
    };
    G.Events.on('net', tryJoin);
    tryJoin();
  };

  // ---------------- small helpers ----------------
  Gm.hitstop = (d) => { if (Gm.mode !== 'client') hitstopT = Math.max(hitstopT, d); };
  Gm.slowmo = (d, s) => { slowT = Math.max(slowT, d); slowScale = s; };
  Gm.players = () => Math.max(1, G.Heroes.list.length);
  Gm.diffDamage = () => (1 + Math.max(0, Gm.wave - 1) * 0.035 + Math.max(0, Gm.wave - FINAL_WAVE) * 0.05) * D().k * PARTY(Gm.players()).dmg;
  Gm.comboMult = () => 1 + Math.min(Gm.combo, 200) / 100;
  // score already carries the difficulty bonus; the flat parts get it here
  Gm.shardsEarned = () => Math.floor(Gm.score / 250) + Math.round((Gm.stats.bosses * 40 + Math.max(0, Gm.wave - 1) * 4) * D().rw);
  Gm.addScore = (n) => { Gm.score += n; };
  Gm.inRun = () => ['playing', 'levelup', 'paused', 'dying', 'gameover'].includes(Gm.state);
  Gm.picksNeeded = () => (G.Player ? G.Player.stats.startBonus : 0) + Gm.team.pq.length;
  Gm.picksPending = () => Gm.picksDone < Gm.picksNeeded();
  Gm.controlsLocked = () => Gm.mode !== 'solo' && (Gm.pickPause || Gm.picksPending() || Gm.state !== 'playing');
  const xpFor = (l) => Math.floor((8 + l * 6 + Math.pow(l, 1.6) * 1.5) * (1 + 0.35 * (Gm.players() - 1)));

  Gm.addXP = function (n) {
    if (!G.auth()) return;
    const hs = G.Heroes.list, T = Gm.team;
    const mult = hs.length ? hs.reduce((a, h) => a + h.stats.xpMult, 0) / hs.length : 1;
    T.xp += n * mult;
    while (T.xp >= T.xpNext) {
      T.xp -= T.xpNext;
      T.lv++;
      T.xpNext = xpFor(T.lv);
      T.pq += 'L';
      for (const h of G.Heroes.alive()) G.Net.vis('pillar', U.r1(h.x), U.r1(h.z), 0xffd060);
      G.Net.vis('sfx', 'levelup');
    }
  };

  // ---------------- run lifecycle ----------------
  function clearWorld() {
    G.Enemies.clear(); G.Bosses.clear(); G.Proj.clear(); G.Pickups.clear(); G.FX.clear(); G.Vis.clear();
    G.UI.clearTags();
    G.Heroes.zones.length = 0;
    G.Classes.clear();
    G.UI.bossBar(false);
    G.World.setAltarActive(false);
    G.World.resetObstacles();
  }
  // solo plays the character picked on the character screen (kept in the settings)
  Gm.soloClass = G.Classes.valid(G.Settings.soloClass) ? G.Settings.soloClass : 'shard';
  function setupHeroes(mode) {
    G.Heroes.clearOthers();
    if (mode === 'solo') {
      if (G.Player.key !== 'me' || !G.Player.auth || G.Player.cls.id !== Gm.soloClass) {
        G.Heroes.remove(G.Player);
        G.Player = G.Heroes.add('me', { local: true, auth: true, color: G.Settings.color, slot: 0, cls: Gm.soloClass });
      } else { G.Player.forge = G.Upgrades.forgeCode(); }
      return;
    }
    // co-op: everyone plays the character the lobby gave them (no two alike)
    const list = G.Net.lobbyList();
    const meIdx = Math.max(0, list.findIndex((it) => it.me));
    G.Heroes.remove(G.Player);
    G.Player = G.Heroes.add(G.Net.me, { local: true, auth: mode === 'host', color: G.Net.color, name: G.Net.name, slot: meIdx, cls: list[meIdx] && list[meIdx].cls });
    list.forEach((it, i) => {
      if (it.me) return;
      G.Heroes.add(it.key, { local: false, drive: 'net', auth: mode === 'host', color: it.color, name: it.name, forge: it.forge, slot: i, cls: it.cls });
    });
  }
  Gm.COOP_MIN = 2;
  Gm.start = function (mode = 'solo') {
    // a co-op run needs at least two people in the room (a host left alone goes back to the lobby)
    if (mode === 'host' && G.Net.roster.length < Gm.COOP_MIN) {
      G.UI.toast('같이 하기는 2명부터 시작할 수 있어요', 'warn', 4);
      if (Gm.state !== 'lobby') Gm.backToLobby();
      return;
    }
    clearWorld();
    G.Net.mode = mode;
    Gm.mode = mode;
    const dk = mode === 'solo' ? G.Settings.diff : G.Net.roomDiff();
    Gm.diff = DIFFS[dk] ? dk : 'normal';
    setupHeroes(mode);
    G.UI.setHero(G.Player);
    G.Touch.setHero(G.Player);
    // the island is rebuilt wider for a bigger party (and back to normal for solo), and hell
    // difficulty dresses the whole arena in hellfire
    Gm.mapPlayers = mode === 'solo' ? 1 : Gm.players();
    const look = Gm.diff === 'hell' ? 'hell' : 'normal';
    applyLook(look);
    G.World.setup(mapScale(Gm.mapPlayers), look);
    for (const h of G.Heroes.list) h.reset();
    G.UI.renderUpgradeList();
    Gm.score = 0; Gm.combo = 0; Gm.comboT = 0; Gm.time = 0; Gm.wave = 0; Gm.endless = false; Gm.menuOpen = false;
    Gm.stats = { kills: 0, damage: 0, taken: 0, maxCombo: 0, elites: 0, bosses: 0 };
    Gm.team = { lv: 1, xp: 0, xpNext: xpFor(1), pq: '' };
    Gm.picksDone = 0; Gm.pickPause = false; pickDelay = 0.6; pickWaitT = 0;
    hitstopT = 0; slowT = 0; dyingT = 0; resultT = 0; ws = 'none'; isBoss = false;
    banked = 0; bankedKills = 0; wonOnce = false;
    runRec = null; recBank = { kills: 0, time: 0, bosses: 0 };
    G.Render.satTarget = 1;
    G.Render.post.uSat.value = 1;
    G.Render.cam.targetZoom = 1;
    Gm.state = 'playing';
    G.UI.show(null);
    G.UI.hud(true);
    G.UI.setPlaying(true);
    G.Input.reset();
    G.Audio.init();
    G.Save.data.runs++;
    G.Save.write();
    G.FX.pillar(G.Player.x, G.Player.z, G.Player.pal.energy, 50, 9);
    if (mode === 'host') { G.Net.evBuf = []; G.Net.runId++; G.Net.setPhase('play'); }
    if (mode !== 'client') nextWave();
    else G.Audio.music('combat');
    // a word on this character's first skill (co-op characters always; the shard mage for new players)
    const c = G.Player.cls;
    if (G.Save.data.runs <= 3 || c.id !== 'shard') {
      const s1 = c.skills[0], how = G.Classes.HOW[s1.kind][G.Touch.on ? 1 : 0];
      const tips = [c.name + ' · ' + c.trait.name + ': ' + c.trait.desc, (G.Touch.on ? '1번 ' : '우클릭 ') + s1.name + ': ' + how,
        G.Touch.on ? '질주하는 동안은 맞지 않습니다' : 'Space나 Shift로 질주. 질주하는 동안은 맞지 않습니다'];
      tips.forEach((tx, i) => setTimeout(() => Gm.state === 'playing' && G.UI.toast(tx, '', 5), (G.Touch.on ? 7000 : 2400) + i * 1300));
    }
  };
  Gm.pause = function () {
    if (Gm.state !== 'playing') return;
    if (Gm.mode !== 'solo') { Gm.menuOpen = true; G.UI.renderUpgradeList(); G.UI.show('pause'); G.UI.setPlaying(false); return; }
    Gm.state = 'paused';
    G.UI.renderUpgradeList();
    G.UI.show('pause');
    G.UI.setPlaying(false);
  };
  Gm.resume = function () {
    if (Gm.menuOpen) { Gm.menuOpen = false; G.UI.show(null); G.UI.setPlaying(true); G.Input.reset(); return; }
    if (Gm.state !== 'paused') return;
    Gm.state = 'playing';
    G.UI.show(null);
    G.UI.setPlaying(true);
    G.Input.reset();
  };
  Gm.quit = function () {
    if (Gm.mode !== 'solo') { Gm.leaveRoom(); return; }
    finishRun(false, 'quit');
    Gm.toMenu();
  };
  Gm.toMenu = function () {
    clearWorld();
    plainLook();
    G.Player.hideBody();
    G.Heroes.clearOthers();
    Gm.state = 'menu';
    Gm.mode = 'solo';
    G.Net.mode = 'solo';
    Gm.menuOpen = false;
    G.UI.hud(false);
    G.UI.setPlaying(false);
    G.UI.show('menu');
    G.Render.satTarget = 1;
    G.Render.post.uSat.value = 1;
    G.Render.cam.targetZoom = 1;
    G.Audio.music('menu');
  };
  Gm.toLobby = function () {
    clearWorld();
    plainLook();
    G.Player.hideBody();
    G.Heroes.clearOthers();
    Gm.state = 'lobby';
    Gm.menuOpen = false;
    G.Net.mode = 'solo';
    Gm.mode = 'solo';
    G.UI.hud(false);
    G.UI.setPlaying(false);
    G.UI.show('lobby');
    G.Render.satTarget = 1;
    G.Render.post.uSat.value = 1;
    G.Audio.music('menu');
  };
  Gm.leaveRoom = function () {
    if (Gm.inRun()) finishRun(false, 'quit');
    G.Net.leaveRoom();
    Gm.toMenu();
  };
  Gm.backToLobby = function () {
    if (G.Net.isHost()) G.Net.setPhase('lobby');
    Gm.toLobby();
  };
  Gm.continueEndless = function () {
    if (Gm.mode === 'client') return;
    Gm.endless = true;
    Gm.state = 'playing';
    if (Gm.mode === 'host') G.Net.setPhase('play');
    G.UI.show(null);
    G.UI.hud(true);
    G.UI.setPlaying(true);
    G.Input.reset();
    nextWave();
  };

  // shards / kills are banked incrementally so victory -> endless -> defeat never double counts.
  // how: 'win', 'lose', 'quit' (gave up or left) or 'ended' (the host closed the room or stopped)
  function finishRun(victory, how) {
    const d = G.Save.data;
    const firstWin = victory && !wonOnce;
    if (firstWin) { wonOnce = true; d.wins++; }
    const total = Gm.shardsEarned() + (wonOnce ? Math.round(150 * D().rw) : 0);
    d.shards += Math.max(0, total - banked);
    d.totalKills += Math.max(0, Gm.stats.kills - bankedKills);
    banked = total;
    bankedKills = Gm.stats.kills;
    Gm.newBest = Gm.score > d.best;
    if (Gm.newBest) d.best = Math.floor(Gm.score);
    d.bestWave = Math.max(d.bestWave, Gm.wave);
    recordRun(firstWin, how || (victory ? 'win' : 'lose'), total);
    G.Save.write();
    return total;
  }
  // The records book. Each run is one line in the history (the latest 40), written when it first
  // ends and updated if it goes on (a win carried into endless); the per-character and
  // per-difficulty totals only ever take what is new since the last time.
  function recordRun(firstWin, how, shards) {
    const R = G.Save.rec(), P = G.Player, cls = P.cls.id, mode = Gm.mode === 'solo' ? 'solo' : 'coop';
    const num = (v) => (Number.isFinite(+v) && +v >= 0 ? +v : 0);
    const line = (o, keys) => { for (const k of keys) o[k] = num(o[k]); return o; };
    const ch = (R.cls[cls] = line(R.cls[cls] && typeof R.cls[cls] === 'object' ? R.cls[cls] : {}, ['n', 'w', 'wave', 'score', 'kills', 'time']));
    const dk = mode + ':' + Gm.diff;
    const df = (R.diff[dk] = line(R.diff[dk] && typeof R.diff[dk] === 'object' ? R.diff[dk] : {}, ['n', 'w', 'wave', 'score']));
    const S = Gm.stats, wave = Gm.wave, score = Math.floor(Gm.score);
    const before = { wave: ch.wave, score: ch.score };
    if (!runRec) {
      ch.n++; df.n++; R[mode]++;
      runRec = { at: Date.now(), m: mode, pc: Gm.players(), c: cls, d: Gm.diff, res: how };
      R.hist.unshift(runRec);
      if (R.hist.length > 40) R.hist.length = 40;
    }
    if (firstWin) { ch.w++; df.w++; }
    const dk2 = Math.max(0, S.kills - recBank.kills), dt = Math.max(0, Gm.time - recBank.time), db = Math.max(0, S.bosses - recBank.bosses);
    ch.kills += dk2; ch.time += dt; R.time += dt; R.bosses += db;
    recBank = { kills: S.kills, time: Gm.time, bosses: S.bosses };
    ch.wave = Math.max(ch.wave, wave); ch.score = Math.max(ch.score, score);
    df.wave = Math.max(df.wave, wave); df.score = Math.max(df.score, score);
    R.combo = Math.max(R.combo, S.maxCombo);
    // a won run stays won, a lost one stays lost; otherwise the latest word on how it ended
    if (runRec.res !== 'win' && !(runRec.res === 'lose' && how !== 'win')) runRec.res = how;
    Object.assign(runRec, {
      at: Date.now(), wave, score, kills: S.kills, time: Math.floor(Gm.time), lv: Gm.team.lv, boss: S.bosses, elite: S.elites, combo: S.maxCombo, sh: shards,
      dmg: mode === 'solo' ? Math.round(S.damage) : 0, best: Gm.newBest ? 1 : 0,
      cards: P.up.order.slice(0, 24).map((id) => [id, P.up.levels[id] || 1]),
      team: mode === 'coop' ? G.Heroes.list.filter((h) => h !== P).slice(0, 3).map((h) => [U.clean(h.name, 12) || '동료', h.cls.id]) : [],
    });
    // what the results screen celebrates for this character
    Gm.clsBest = before.wave > 0 || before.score > 0 ? (wave > before.wave ? 'wave' : score > before.score ? 'score' : '') : ch.n === 1 ? 'first' : '';
  }
  function showResults(victory) {
    const shards = finishRun(victory);
    Gm.state = 'gameover';
    G.UI.setPlaying(false);
    G.UI.showGameOver({
      victory, score: Gm.score, wave: Gm.wave, level: Gm.team.lv, time: Gm.time, stats: Gm.stats, shards, newBest: Gm.newBest, diff: D(),
      canContinue: victory && Gm.mode !== 'client', coop: Gm.mode !== 'solo', host: Gm.mode === 'host', cls: G.Player.cls, clsBest: Gm.clsBest,
    });
  }
  function enterDying() {
    Gm.state = 'dying';
    dyingT = 2.4;
    Gm.slowmo(2.4, 0.3);
    G.Render.satTarget = 0.15;
    G.Audio.music('off');
    G.Audio.play('gameOver');
    G.UI.setPlaying(false);
  }
  // co-op: a fallen hero waits for the rest of the team; clearing the stage brings them back
  // (see waveComplete), and if nobody is left standing the run is lost
  Gm.onHeroDeath = function (h) {
    if (Gm.mode === 'solo') { enterDying(); return; }
    if (!G.Heroes.anyAlive()) { G.Net.setPhase('over'); enterDying(); return; }
    G.Net.vis('toast', (h.name || '동료') + '님이 쓰러졌어요 · 이 스테이지를 깨면 다시 일어나요', 'warn');
  };
  function victory() {
    G.Audio.play('victory');
    G.Audio.music('calm');
    if (Gm.mode === 'host') G.Net.setPhase('win');
    showResults(true);
  }

  // ---------------- co-op hooks ----------------
  Gm.netPlayerLeft = function (key) {
    const h = G.Heroes.get(key);
    if (!h || h === G.Player) return;
    if (Gm.inRun()) G.Net.vis('toast', (h.name || '동료') + '님이 나갔어요', 'warn');
    G.Heroes.remove(h);
  };
  Gm.netEnded = function (msg) {
    if (Gm.inRun()) finishRun(false, 'ended');
    G.Net.leaveRoom();
    Gm.toMenu();
    G.UI.toast(msg, 'warn', 5);
  };
  // client: the host changed what everyone is doing
  Gm.onNetPhase = function (ph, newRun) {
    if (G.Net.role !== 'guest') return;
    const inRoster = G.Net.roster.includes(G.Net.me);
    if (ph === 'play') {
      if (!inRoster) { G.UI.show('lobby'); return; }
      if (newRun || Gm.mode !== 'client' || !Gm.inRun()) { Gm.start('client'); return; }
      // the host chose to keep going after the final stage
      Gm.pendingResult = null;
      Gm.state = 'playing';
      G.Render.satTarget = 1;
      G.UI.show(null);
      G.UI.hud(true);
      G.UI.setPlaying(true);
      return;
    }
    if (ph === 'lobby') { if (Gm.inRun()) finishRun(false, 'ended'); Gm.toLobby(); return; }
    if ((ph === 'over' || ph === 'win') && Gm.mode === 'client' && Gm.inRun()) {
      if (ph === 'win') G.Audio.play('victory'); else { G.Audio.play('gameOver'); G.Render.satTarget = 0.15; }
      resultT = 1.6;
      Gm.pendingResult = ph;
    }
  };
  Gm.netInfo = () => ({
    wv: Gm.wave, ws: WS.indexOf(ws), wt: U.r1(Math.max(0, waveT)), wl: remaining(), wp: Math.round(Gm.waveProgress() * 100), bs: isBoss ? 1 : 0,
    sc: Math.floor(Gm.score), cb: Gm.combo, ct: U.r1(Math.max(0, Gm.comboT)), tm: Math.floor(Gm.time),
    lv: Gm.team.lv, xp: Math.floor(Gm.team.xp), xn: Gm.team.xpNext, pq: Gm.team.pq.slice(0, 120), pz: Gm.pickPause ? 1 : 0,
    al: G.World.altarActive ? 1 : 0, hs: U.r2(G.Enemies.hpScale), en: Gm.endless ? 1 : 0,
    k: Gm.stats.kills, el: Gm.stats.elites, bk: Gm.stats.bosses, mc: Gm.stats.maxCombo, mp: Gm.mapPlayers,
  });
  Gm.applyNetInfo = function (w) {
    const n = U.num;
    Gm.wave = n(w.wv, 0, 0, 999) | 0;
    ws = WS[n(w.ws, 0, 0, 5) | 0] || 'none';
    waveT = n(w.wt, 0, 0, 99);
    netRemain = n(w.wl, 0, 0, 9999) | 0;
    netProgress = n(w.wp, 0, 0, 100) / 100;
    isBoss = !!w.bs;
    Gm.score = n(w.sc, 0, 0, 1e9);
    Gm.combo = n(w.cb, 0, 0, 1e5) | 0;
    Gm.comboT = n(w.ct, 0, 0, 10);
    Gm.time = n(w.tm, 0, 0, 1e6);
    Gm.team.lv = n(w.lv, 1, 1, 999) | 0;
    Gm.team.xp = n(w.xp, 0, 0, 1e7);
    Gm.team.xpNext = Math.max(1, n(w.xn, 10, 1, 1e7));
    Gm.team.pq = typeof w.pq === 'string' ? w.pq.replace(/[^LRE]/g, '').slice(0, 120) : Gm.team.pq;
    Gm.pickPause = !!w.pz;
    G.World.setAltarActive(!!w.al);
    Gm.endless = !!w.en;
    Gm.stats.kills = n(w.k, 0, 0, 1e7) | 0;
    Gm.stats.elites = n(w.el, 0, 0, 1e6) | 0;
    Gm.stats.bosses = n(w.bk, 0, 0, 1e4) | 0;
    Gm.stats.maxCombo = n(w.mc, 0, 0, 1e6) | 0;
    // the host's island size wins (a guest whose roster differed at the start rebuilds to match)
    const mp = n(w.mp, 1, 1, 4) | 0;
    if (mp !== Gm.mapPlayers) { Gm.mapPlayers = mp; G.World.setScale(mapScale(mp)); }
    // heroes: make sure everyone in the roster exists, then take the host's numbers
    const list = G.Net.lobbyList();
    list.forEach((it, i) => {
      if (it.me || G.Heroes.get(it.key)) return;
      G.Heroes.add(it.key, { local: false, drive: 'net', auth: false, color: it.color, name: it.name, forge: it.forge, slot: i, cls: it.cls });
    });
    for (const h of G.Heroes.list.slice()) if (h !== G.Player && !list.some((it) => it.key === h.key)) G.Heroes.remove(h);
    if (!Array.isArray(w.h)) return;
    G.Net.roster.forEach((key, i) => {
      const h = G.Heroes.get(key), a = w.h[i];
      if (!h || !Array.isArray(a)) return;
      const hp = n(a[0], h.hp, 0, 1e6), alive = !!a[2], rv = n(a[5], 0, 0, 999) | 0, here = !!a[7];
      h.shieldHp = n(a[6], 0, 0, 1e4);
      h.res = n(a[8], 0, 0, 99); // souls, momentum: the host keeps the count
      if (h === G.Player && alive && hp < h.hp - 0.5 && h.alive) {
        G.Render.hurt(0.75); G.Render.shake(0.32); G.Audio.play('hurt');
        G.FX.dmgNumber(h.x, h.y + 1.8, h.z, '-' + Math.round(h.hp - hp), 'player');
        h.hurtFlash = 1;
      } else if (h !== G.Player && hp < h.hp - 0.5) h.hurtFlash = 1;
      h.hp = hp;
      h.maxHp = Math.max(1, n(a[1], 100, 1, 1e6));
      const before = h.ult;
      h.ult = n(a[3], 0, 0, 100);
      if (h === G.Player && before < 100 && h.ult >= 100) { G.UI.toast(h.cls.ult.name + ' 준비됨 · R', 'gold'); G.Audio.play('chest'); }
      h.ultT = n(a[4], 0, 0, 20);
      if (rv !== h.rv) {
        // by the altar after a cleared stage, or right where they fell (the cleric's hymn)
        if (h === G.Player && alive) { h.revive(0.5, here); G.UI.toast('다시 일어났어요', 'good'); }
        h.rv = rv;
      }
      if (alive !== h.alive) {
        if (!alive) { h.alive = false; h.hideBody(); }
        else { h.alive = true; h.group.visible = true; h.invuln = 2; }
      }
    });
  };

  // ---------------- stages ----------------
  function nextWave() {
    Gm.wave++;
    const n = Gm.wave, pc = Gm.players(), party = PARTY(pc);
    isBoss = n % 5 === 0;
    ws = 'intro'; waveT = 2.6; spawned = 0; spawnT = 0; chestThisStage = false;
    budget = Math.round((isBoss ? 8 + n * 2 : 14 + n * 7 + n * n * 0.35) * party.count);
    elitesLeft = n >= 3 ? 1 + Math.floor(n / 5) + (pc - 1) : 0;
    G.Enemies.hpScale = (1 + (n - 1) * 0.2) * (n > FINAL_WAVE ? 1 + (n - FINAL_WAVE) * 0.12 : 1) * party.hp * D().k;
    // ordinary monsters also hit harder and move faster stage by stage (on top of diffDamage)
    G.Enemies.dmgScale = 1 + (n - 1) * 0.03 + Math.max(0, n - FINAL_WAVE) * 0.04;
    G.Enemies.speedScale = 1 + Math.min(0.15, (n - 1) * 0.011);
    G.World.setAltarActive(false);
    // fallback: someone who fell during the break between stages comes back as the next one starts
    for (const h of G.Heroes.list) if (!h.alive && Gm.mode === 'host' && Gm.state === 'playing') h.revive(0.5);
    const title = '스테이지 ' + n;
    if (isBoss) G.Net.vis('banner', title, n > FINAL_WAVE ? '각성한 보스가 내려옵니다' : '보스가 내려옵니다', 'boss');
    else if (NEW_ENEMY[n]) G.Net.vis('banner', title, '새 적 · ' + NEW_ENEMY[n][0] + ' — ' + NEW_ENEMY[n][1], '');
    else G.Net.vis('banner', title, '적 ' + budget + '마리', '');
    G.Audio.music(isBoss ? 'boss' : 'combat');
    if (Gm.mode === 'host') G.Net.vis('sfx', 'portal');
  }
  const SPAWN_TABLE = [
    { type: 'imp', from: 1, w: () => 10 },
    { type: 'runner', from: 1, w: (n) => 6 + n * 0.2 },
    { type: 'caster', from: 2, w: (n) => 2.5 + n * 0.25 },
    { type: 'bomber', from: 3, w: (n) => 2.5 + n * 0.15 },
    { type: 'brute', from: 4, w: (n) => 1 + n * 0.15 },
    { type: 'splitter', from: 6, w: () => 2.5 },
    { type: 'wraith', from: 7, w: (n) => 2.2 + n * 0.1 },
    { type: 'spider', from: 8, w: (n) => 2.6 + n * 0.1 },
    { type: 'shield', from: 9, w: (n) => 1.4 + n * 0.08 },
    { type: 'sniper', from: 11, w: (n) => 1.6 + n * 0.08 },
    { type: 'healer', from: 12, w: () => 1.1 },
  ];
  const SMALL_GROUPS = new Set(['brute', 'splitter', 'shield', 'sniper', 'healer']);
  function spawnGroup() {
    const n = Gm.wave;
    const hs = G.Heroes.alive(), anchor = hs[Math.floor(Math.random() * hs.length)] || G.Player;
    const pt = G.World.spawnPoint(anchor.x, anchor.z, 13);
    const def = U.weightedPick(SPAWN_TABLE.filter((s) => n >= s.from), (s) => s.w(n));
    const big = SMALL_GROUPS.has(def.type);
    const cnt = Math.min(budget - spawned, big ? U.randInt(1, 1 + Math.floor(n / 8)) : U.randInt(1, 2 + Math.floor(n / 3)));
    for (let i = 0; i < cnt; i++) {
      const p = { x: pt.x + U.rand(-1.8, 1.8), z: pt.z + U.rand(-1.8, 1.8) };
      G.World.resolve(p, 0.8);
      let elite = false, affix = null;
      if (elitesLeft > 0 && Math.random() < 0.035 + n * 0.004) {
        elite = true;
        elitesLeft--;
        affix = U.pick(['swift', 'armored', 'volatile', null]);
        G.Net.vis('toast', '엘리트 ' + G.Enemies.TYPES[def.type].name + (affix ? ' (' + G.Enemies.AFFIX[affix] + ')' : ''), 'gold');
      }
      G.Enemies.spawn(def.type, p.x, p.z, { elite, affix });
      spawned++;
    }
  }
  function director(dt) {
    const n = Gm.wave;
    if (ws === 'intro') {
      waveT -= dt;
      if (waveT <= 0) {
        ws = 'spawn';
        if (isBoss) {
          // after the final stage the bosses come back awakened (stronger every 15 stages)
          const aw = n > FINAL_WAVE ? Math.floor((n - FINAL_WAVE - 1) / FINAL_WAVE) + 1 : 0;
          G.Bosses.spawn((n / 5 - 1) % 3, (1 + Math.floor((n - 1) / FINAL_WAVE) * 0.8) * PARTY(Gm.players()).boss * D().k, aw);
          spawnT = 6;
        }
      }
    } else if (ws === 'spawn') {
      spawnT -= dt;
      const pc = Gm.players(), cap = Math.min(95 + 10 * (pc - 1), Math.round((26 + n * 6) * (1 + 0.4 * (pc - 1))));
      if (spawnT <= 0 && spawned < budget && G.Enemies.count() < cap) {
        spawnGroup();
        spawnT = isBoss ? U.rand(2.5, 4) : Math.max(0.35, 1.25 - n * 0.06) * U.rand(0.7, 1.3) / Math.sqrt(Gm.players());
      }
      if (spawned >= budget) ws = 'clear';
    } else if (ws === 'clear') {
      if (G.Enemies.count() === 0 && !G.Bosses.active) waveComplete();
    } else if (ws === 'inter') {
      waveT -= dt;
      if (waveT <= 0) {
        if (n === FINAL_WAVE && !Gm.endless) { ws = 'done'; victory(); }
        else nextWave();
      }
    }
  }
  function waveComplete() {
    const n = Gm.wave;
    ws = 'inter';
    waveT = n === FINAL_WAVE && !Gm.endless ? 3.5 : 8;
    const bonus = Math.round(250 * n * D().rw);
    Gm.score += bonus;
    G.Net.vis('banner', '스테이지 ' + n + ' 클리어', '+' + U.fmtNum(bonus) + '점 · 가운데 제단에 서면 체력이 찹니다', 'gold');
    G.Net.vis('sfx', 'waveClear');
    G.Audio.music('calm');
    G.Pickups.collectAll();
    G.Net.vis('clearShots');
    G.World.setAltarActive(true);
    G.Save.data.bestWave = Math.max(G.Save.data.bestWave, n);
    // co-op: the stage is cleared, so whoever fell in it gets back up (by the altar, in time to heal);
    // a lost run stays lost (the world keeps moving behind the results screen)
    if (Gm.mode === 'host' && Gm.state === 'playing') {
      const fallen = G.Heroes.list.filter((h) => !h.alive);
      for (const h of fallen) h.revive(0.5);
      if (fallen.length) G.Net.vis('toast', fallen.map((h) => h.name || '동료').join(', ') + '님이 다시 일어났어요', 'good');
    }
  }
  function remaining() { return Math.max(0, budget - spawned) + G.Enemies.count(); }
  Gm.waveLabel = () => (isBoss ? '보스 · ' : '') + '스테이지 ' + Gm.wave + (Gm.endless ? '' : ' / ' + FINAL_WAVE);
  Gm.waveSub = function () {
    if (ws === 'intro') return '곧 시작합니다';
    if (ws === 'inter') return Math.max(0, Math.ceil(waveT)) + '초 뒤 다음 스테이지 · 제단에서 회복';
    if (ws === 'done') return '';
    const left = Gm.mode === 'client' ? netRemain : remaining();
    return '남은 적 ' + left;
  };
  Gm.waveProgress = function () {
    if (Gm.mode === 'client') return netProgress;
    if (ws === 'inter' || ws === 'done') return 1;
    if (ws === 'intro' || budget <= 0) return 0;
    return U.clamp((spawned - G.Enemies.count()) / budget, 0, 1);
  };
  Gm.isBossWave = () => isBoss;
  // test helper: jump to a stage
  Gm._jump = function (n) {
    G.Enemies.clear(); G.Bosses.clear(); G.Proj.clear();
    G.UI.bossBar(false);
    Gm.wave = n - 1;
    nextWave();
  };

  // ---------------- events from the world ----------------
  Gm.onKill = function (e) {
    const s = Gm.stats;
    s.kills++;
    if (e.elite) s.elites++;
    Gm.combo++;
    Gm.comboT = 2.6;
    s.maxCombo = Math.max(s.maxCombo, Gm.combo);
    if (Gm.combo % 50 === 0) G.Net.vis('toast', Gm.combo + '연속 처치', 'gold');
    Gm.score += e.def.score * (e.elite ? 5 : 1) * Gm.comboMult() * (1 + (Gm.wave - 1) * 0.05) * D().rw;
    const h = e.lastBy && G.Heroes.list.includes(e.lastBy) ? e.lastBy : G.Heroes.nearest(e.x, e.z);
    if (h) {
      // the ultimate fills slowly: a kill is 0.5%, an elite 3%
      h.addUlt((e.elite ? 3 : 0.5) * h.stats.ultGain);
      if (h.stats.lifestealKill > 0 && Math.random() < h.stats.lifestealKill) h.heal(3);
    }
    if (Math.random() < 0.004) G.Pickups.dropMagnet(e.x, e.z);
    G.Classes.onKill(e);
  };
  Gm.onBossKilled = function (b) {
    Gm.stats.bosses++;
    Gm.score += 5000 * (1 + Math.floor((Gm.wave - 1) / FINAL_WAVE)) * D().rw;
    G.Pickups.dropChest(b.x, b.z, 'epic');
    G.Pickups.dropXP(b.x, b.z, 120 + Gm.wave * 10);
    for (let i = 0; i < 3; i++) G.Pickups.dropHealth(b.x + U.rand(-2, 2), b.z + U.rand(-2, 2), true);
    G.Net.vis('bossBar', 0, '', '');
    G.Net.vis('banner', b.name + ' 처치', '', 'gold');
    G.Enemies.killAll();
    spawned = budget;
    if (ws === 'spawn') ws = 'clear';
    G.Audio.music('combat');
  };
  Gm.openChest = function (tier) { Gm.team.pq += tier === 'epic' ? 'E' : 'R'; };
  // elites only sometimes carry a chest: at most one per stage, never on boss stages (the boss drops its own)
  Gm.eliteChest = function () {
    if (chestThisStage || isBoss || Math.random() > 0.25) return false;
    chestThisStage = true;
    return true;
  };

  // ---------------- cards ----------------
  function nextPickKind() {
    const sb = G.Player.stats.startBonus;
    if (Gm.picksDone < sb) return 'S';
    return Gm.team.pq[Gm.picksDone - sb] || 'L';
  }
  function showPicks() {
    const kind = nextPickKind();
    const roll = kind === 'E' ? { minRarity: 'epic', legendBoost: 5 } : kind === 'R' ? { minRarity: 'rare', legendBoost: 1.6 } : {};
    const titles = { L: ['레벨 업', '카드 한 장을 고르세요'], S: ['출발 준비', '시작 카드를 고르세요'], R: ['보물 상자', '희귀 등급 이상'], E: ['큰 보물 상자', '영웅 등급 이상'] };
    if (Gm.mode === 'solo') Gm.state = 'levelup';
    G.Input.reset();
    G.UI.showLevelUp(G.Upgrades.roll(G.Player, 3, roll), { title: titles[kind][0], sub: titles[kind][1], roll });
  }
  Gm.onCardPicked = function (d) {
    G.Upgrades.take(G.Player, d);
    Gm.picksDone++;
    G.FX.ring(G.Player.x, G.Player.y + 0.2, G.Player.z, 0.5, 4, 0.5, 0xffd060, 2.2);
    G.UI.show(null);
    if (Gm.mode === 'solo') Gm.state = 'playing';
    G.UI.setPlaying(true);
    G.Input.reset();
    pickDelay = 0.2;
  };
  Gm.waitingNames = function () {
    if (Gm.mode !== 'host' && Gm.mode !== 'client') return [];
    return G.Heroes.list.filter((h) => h !== G.Player && Gm.isPicking(h)).map((h) => h.name || '동료');
  };
  // co-op: is this hero still choosing a card? (every machine can tell: picks travel in presence)
  Gm.isPicking = function (h) {
    if (Gm.mode === 'solo' || !h) return false;
    const need = h.stats.startBonus + Gm.team.pq.length;
    return (h === G.Player ? Gm.picksDone : h.netPr || 0) < need;
  };

  // ---------------- main loop ----------------
  function camera(realDt) {
    const P = G.Player;
    let f = P;
    if (!P.alive) f = G.Heroes.alive()[0] || P;
    G.Render.cam.targetZoom = P.ultT > 0 ? 0.93 : G.Bosses.active ? 1.12 : 1;
    G.Render.updateCamera(realDt, f.x, f.y, f.z, P.alive ? P.aimX : f.x, P.alive ? P.aimZ : f.z);
  }
  function updateWorld(dt, realDt) {
    const P = G.Player;
    if (!Gm.pickPause) {
      Gm.time += dt;
      director(dt);
      G.Heroes.update(dt, t);
      G.Enemies.update(dt, t);
      G.Bosses.update(dt * G.Classes.bossK()); // a time stop slows the boss to a crawl
      G.Proj.update(dt);
      G.Pickups.update(dt);
      Gm.comboT -= dt;
      if (Gm.comboT <= 0) Gm.combo = 0;
      if (ws === 'inter') {
        for (const h of G.Heroes.alive()) {
          if (U.dist(h.x, h.z, 0, 0) >= G.World.altar.r || h.hp >= h.stats.maxHp) continue;
          h.heal(16 * dt, true);
          if (Math.random() < 0.4) G.FX.P.emit(h.x + U.rand(-0.6, 0.6), h.y + 0.2, h.z + U.rand(-0.6, 0.6), 0, U.rand(1.5, 3), 0, 0.7, 0.35, 0.02, 0.6, 3, 1.2, 1, 0.5, 0);
        }
      }
    }
    G.Vis.update(dt);
    G.World.update(dt, t, P.x, P.z);
    G.FX.update(dt, realDt);
    camera(realDt);
  }
  function updateClient(dt, realDt) {
    const P = G.Player;
    G.Net.clientWorld(dt, t);
    if (!Gm.pickPause) G.Heroes.update(dt, t);
    G.Proj.update(dt);
    G.Bosses.update(dt * G.Classes.bossK());
    G.Pickups.update(dt);
    G.Vis.update(dt);
    G.World.update(dt, t, P.x, P.z);
    G.FX.update(dt, realDt);
    camera(realDt);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const realDt = Math.min(0.05, Math.max(0.0001, (now - last) / 1000));
    last = now;
    step(realDt, true);
    G.Render.adapt(now);
  }
  // co-op keeps running when this tab is hidden (requestAnimationFrame stops there), so a host
  // switching tabs (say, to send the room code) does not freeze the lobby or everyone else's game
  setInterval(() => {
    if (!document.hidden || !G.Net.inRoom()) return;
    const now = performance.now();
    const realDt = Math.min(0.05, Math.max(0.0001, (now - last) / 1000));
    last = now;
    step(realDt, false);
  }, 33);
  Gm.simulate = function (sec, fdt = 1 / 60, render = true) {
    const n = Math.max(1, Math.round(sec / fdt));
    for (let i = 0; i < n; i++) step(fdt, render && i === n - 1);
  };
  function step(realDt, doRender) {
    if (Gm.frozen) { if (doRender) G.Render.render(); G.Input.endFrame(); return; }
    let dt = realDt;
    if (hitstopT > 0) { hitstopT -= realDt; dt *= 0.06; }
    else if (slowT > 0) { slowT -= realDt; dt *= slowScale; }
    t += dt;
    const I = G.Input;
    try {
      G.Net.update(realDt);
      const st = Gm.state, mp = Gm.mode !== 'solo';
      if (st === 'playing' || (mp && st === 'levelup')) {
        if (I.wasPressed('Escape', 'KeyP')) { if (Gm.menuOpen) Gm.resume(); else Gm.pause(); }
        // card picks: solo pauses the run; co-op never stops, and whoever is choosing is shielded
        if (G.UI.current !== 'levelup' && Gm.picksPending() && !Gm.menuOpen) {
          pickDelay -= realDt;
          if (pickDelay <= 0) showPicks();
        }
        if (Gm.mode === 'host') {
          Gm.pickPause = false;
          for (const h of G.Heroes.list) if (h.alive && Gm.isPicking(h)) h.invuln = Math.max(h.invuln, 0.25);
        }
        if (Gm.state === 'playing' || mp) {
          if (Gm.mode === 'client') updateClient(dt, realDt); else updateWorld(dt, realDt);
        }
        if (Gm.mode === 'client' && Gm.pendingResult) {
          resultT -= realDt;
          if (resultT <= 0) { const r = Gm.pendingResult; Gm.pendingResult = null; showResults(r === 'win'); }
        }
      } else if (st === 'dying') {
        if (Gm.mode === 'client') updateClient(dt, realDt); else updateWorld(dt, realDt);
        dyingT -= realDt;
        if (dyingT <= 0) showResults(false);
      } else if (st === 'menu' || st === 'lobby') {
        G.Render.menuCamera(realDt);
        G.World.update(realDt, t, 0, -99);
        G.FX.update(realDt, realDt);
      } else if (st === 'paused') {
        if (I.wasPressed('Escape', 'KeyP')) { if (G.UI.current === 'settings') G.UI.show('pause'); else Gm.resume(); }
      } else if (st === 'gameover') {
        if (mp) { if (Gm.mode === 'client') updateClient(dt, realDt); else updateWorld(dt, realDt); }
        else {
          G.World.update(realDt, t, G.Player.x, G.Player.z);
          G.FX.update(realDt, realDt);
          G.Render.updateCamera(realDt, G.Player.x, G.Player.y, G.Player.z, G.Player.x, G.Player.z);
        }
      }
      if (Gm.inRun()) G.UI.update(realDt);
      G.Touch.update(realDt);
      G.Render.update(dt, realDt);
      if (doRender) G.Render.render();
    } catch (err) {
      console.error(err);
      const box = document.getElementById('error-box');
      if (box && box.textContent.length < 2000) box.textContent += (err && err.stack ? err.stack.split('\n').slice(0, 3).join('\n') : err) + '\n';
    }
    I.endFrame();
  }
})();

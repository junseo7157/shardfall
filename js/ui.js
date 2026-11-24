// ============================================================
// SHARDFALL - ui: HUD, menus, co-op lobby, card picking (with a press guard), minimap, toasts
// ============================================================
(() => {
  const G = window.G, U = G.U, $ = U.el;
  const UI = (G.UI = { current: null, cards: null, armAt: 0, downIdx: -1 });
  const E = {};
  let hpTrail = 1, bossTrail = 1, bossFrac = 1, mmT = 0, fpsT = 0, fpsN = 0, perfT = 0, perfN = 0, perfWarned = false, hitT = 0, fireT = 0;
  let teamKey = '';
  const tags = new Map();
  const cdLast = {}, cdMax = {};
  const ARM_MS = 700;
  const ARCH = 'M10 330V118C10 52 56 10 115 10s105 42 105 108v212z';
  const LOGO = (id) => `<svg viewBox="0 0 660 136" role="img" aria-label="SHARDFALL">
    <defs>
      <clipPath id="${id}a"><polygon points="0,0 660,0 660,60 520,66 470,52 405,80 330,64 250,86 170,70 95,90 0,74"/></clipPath>
      <clipPath id="${id}b"><polygon points="0,74 95,90 170,70 250,86 330,64 405,80 470,52 520,66 660,60 660,136 0,136"/></clipPath>
    </defs>
    <g class="logo-word">
      <text x="330" y="106" text-anchor="middle" textLength="632" lengthAdjust="spacingAndGlyphs" clip-path="url(#${id}a)">SHARDFALL</text>
      <g class="low" transform="translate(4 8) rotate(1.4 330 100)"><text x="330" y="106" text-anchor="middle" textLength="632" lengthAdjust="spacingAndGlyphs" clip-path="url(#${id}b)">SHARDFALL</text></g>
      <polyline class="crack" points="60,82 95,90 170,70 250,86 330,64 405,80 470,52 520,66 590,62"/>
    </g>
  </svg>`;

  UI.init = function () {
    for (const id of ['hud', 'hp-fill', 'hp-trail', 'hp-text', 'ult-fill', 'ult-text', 'lvl-num', 'wave-label', 'wave-sub', 'wave-progress', 'score', 'combo-box', 'combo-mult',
      'combo-count', 'combo-timer', 'shards-count', 'timer', 'kills', 'boss-bar', 'boss-name', 'boss-fill', 'boss-trail', 'boss-sub', 'xp-fill', 'xp-text', 'minimap',
      'upgrade-list', 'toasts', 'banner', 'fps', 'crosshair', 'lowhp-overlay', 'levelup-cards', 'reroll-count', 'btn-reroll', 'team', 'tags-layer', 'spectate', 'pickwait', 'levelup-wait', 'diff-tag'])
      E[id] = $(id);
    E.wpFill = E['wave-progress'].firstElementChild;
    E.comboBar = E['combo-timer'].firstElementChild;
    E.mm = E.minimap.getContext('2d');
    document.querySelectorAll('.logo-wrap').forEach((el, i) => { el.innerHTML = LOGO('lg' + i); });
    E.ab = {};
    for (const k of ['lmb', 'rmb', 'dash', 'q', 'e', 'r']) {
      const el = $('ab-' + k);
      el.querySelector('.ab-icon').innerHTML = G.Icons.svg(el.dataset.icon);
      E.ab[k] = { el, cd: el.querySelector('.ab-cd'), txt: el.querySelector('.ab-cdtext'), pips: el.querySelector('.ab-pips'), charge: el.querySelector('.ab-charge div'), ready: true };
    }

    const go = (id, fn) => $(id).addEventListener('click', () => { G.Audio.play('ui'); fn(); });
    go('btn-play', () => UI.show('diff'));
    go('btn-diff-back', () => UI.show('menu'));
    go('btn-coop', () => UI.show('coop'));
    go('btn-forge', () => UI.show('forge'));
    go('btn-help', () => UI.show('help'));
    go('btn-settings', () => { UI.settingsBack = 'menu'; UI.show('settings'); });
    go('btn-forge-back', () => UI.show('menu'));
    go('btn-help-back', () => UI.show('menu'));
    go('btn-settings-back', () => UI.show(UI.settingsBack || 'menu'));
    go('btn-resume', () => G.Game.resume());
    go('btn-pause-settings', () => { UI.settingsBack = 'pause'; UI.show('settings'); });
    go('btn-quit', () => G.Game.quit());
    go('btn-retry', () => G.Game.start(G.Game.mode === 'host' ? 'host' : 'solo'));
    go('btn-go-menu', () => { if (G.Net.inRoom()) G.Game.leaveRoom(); else G.Game.toMenu(); });
    go('btn-go-lobby', () => G.Game.backToLobby());
    go('btn-continue', () => G.Game.continueEndless());
    go('btn-reroll', () => UI.reroll());

    // co-op screens
    const ident = () => G.Net.setIdentity($('coop-name').value, UI.pickedColor == null ? G.Net.color : UI.pickedColor);
    go('btn-host', async () => {
      ident();
      setStatus('coop-status', '방을 여는 중...');
      if (await G.Net.createRoom()) UI.show('lobby');
      else UI.renderCoop();
    });
    go('btn-join', async () => {
      ident();
      setStatus('coop-status', '들어가는 중...');
      if (await G.Net.joinRoom($('coop-code').value)) UI.show('lobby');
      else UI.renderCoop();
    });
    $('coop-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-join').click(); });
    go('btn-coop-back', () => UI.show('menu'));
    go('btn-lobby-start', () => { if (G.Net.isHost()) G.Game.start('host'); });
    go('btn-lobby-leave', () => { G.Net.leaveRoom(); G.Game.toMenu(); });
    go('btn-copy-code', () => {
      // on an ordinary website the whole link is the invite; on claude.ai only the code travels
      const link = G.Net.inviteLink();
      const done = () => setStatus('lobby-status', link ? '초대 링크를 복사했어요. 친구에게 보내면 바로 이 방으로 들어와요' : '방 코드를 복사했어요');
      const fail = () => setStatus('lobby-status', link ? '복사가 막혀 있어요. 이 링크를 보내 주세요: ' + link : '복사가 막혀 있어요. 코드를 직접 알려 주세요', true);
      try { navigator.clipboard.writeText(link || G.Net.code).then(done, fail); } catch (e) { fail(); }
    });
    $('coop-colors').innerHTML = G.HERO_PAL.map((p, i) => `<button class="swatch" data-c="${i}" style="--c:${p.css}" aria-label="${p.name}"></button>`).join('');
    $('coop-colors').querySelectorAll('.swatch').forEach((b) => b.addEventListener('click', () => { UI.pickedColor = +b.dataset.c; G.Audio.play('ui'); UI.renderCoop(); }));
    document.querySelectorAll('.btn, .mi').forEach((b) => b.addEventListener('mouseenter', () => G.Audio.play('hover')));

    // settings
    const S = G.Settings;
    const bindRange = (id, key) => { const el = $(id); el.value = S[key]; el.addEventListener('input', () => { S[key] = parseFloat(el.value); G.saveSettings(); G.Audio.setVolumes(); }); };
    bindRange('set-master', 'master'); bindRange('set-music', 'music'); bindRange('set-sfx', 'sfx');
    const bindCheck = (id, key) => { const el = $(id); el.checked = !!S[key]; el.addEventListener('change', () => { S[key] = el.checked; G.saveSettings(); }); };
    bindCheck('set-shake', 'shake'); bindCheck('set-dmgnum', 'dmgNumbers'); bindCheck('set-fps', 'showFps');
    const q = $('set-quality');
    q.value = S.quality;
    q.addEventListener('change', () => {
      S.quality = q.value;
      G.saveSettings();
      if (G.Game.state === 'menu' && !G.Net.inRoom()) location.reload();
      else UI.toast('그래픽 설정은 메인 메뉴에서 다시 불러올 때 적용됩니다');
    });

    const unlock = () => {
      G.Audio.init();
      G.Audio.music(G.Game.state === 'menu' || G.Game.state === 'lobby' ? 'menu' : 'combat');
      removeEventListener('pointerdown', unlock);
      removeEventListener('keydown', unlock);
    };
    addEventListener('pointerdown', unlock);
    addEventListener('keydown', unlock);

    addEventListener('keydown', (e) => {
      if (UI.current !== 'diff' || e.repeat || G.Input.typing(e)) return;
      const i = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
      if (i >= 0) UI.pickDiff(G.Game.DIFF_KEYS[i]);
      else if (e.code === 'Escape') UI.show('menu');
    });
    addEventListener('keydown', (e) => {
      if (UI.current !== 'levelup' || !UI.cards || e.repeat || G.Input.typing(e)) return;
      if (performance.now() < UI.armAt) return;
      const i = ['Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3'].indexOf(e.code) % 3;
      if (i >= 0 && i < UI.cards.length) UI.pickCard(i);
      if (e.code === 'KeyF') UI.reroll();
    });
    G.Events.on('upgrade', () => UI.renderUpgradeList());
    G.Events.on('net', () => {
      if (UI.current === 'coop') UI.renderCoop();
      if (UI.current === 'lobby') UI.renderLobby();
    });
  };
  function setStatus(id, msg, err) { const el = $(id); el.textContent = msg; el.classList.toggle('err', !!err); }

  UI.show = function (name) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-' + name));
    UI.current = name;
    if (name === 'menu') UI.refreshMenu();
    if (name === 'diff') UI.renderDiff();
    if (name === 'coop') UI.renderCoop();
    if (name === 'lobby') UI.renderLobby();
    if (name === 'forge') UI.renderForge();
    if (name === 'pause') {
      const mp = G.Game.mode !== 'solo';
      $('btn-quit').textContent = mp ? '방 나가기' : '포기하고 메뉴로';
      $('pause-note').textContent = mp ? '같이 하는 중에는 게임이 멈추지 않아요' : '';
    }
  };
  UI.hud = function (on) { E.hud.classList.toggle('hidden', !on); };
  UI.setPlaying = function (on) { document.body.classList.toggle('playing', on); };
  UI.refreshMenu = function () {
    const d = G.Save.data;
    $('menu-best').textContent = U.fmtNum(d.best);
    $('menu-shards').textContent = U.fmtNum(d.shards);
    $('menu-wave').textContent = d.bestWave;
  };

  // ---------------- difficulty ----------------
  const DIFF_TEXT = {
    easy: ['적 체력·공격력 ÷1.7', '처음이거나, 카드 조합을 편하게 시험해 보고 싶을 때'],
    normal: ['기준', '카드 조합을 쌓아 가며 끝까지 가는 기본 아레나'],
    hard: ['적 체력·공격력 ×1.4', '조합이 맞물려야 끝까지 버팁니다'],
    hell: ['적 체력·공격력 ×2.38', '보스의 한 방이 곧 끝입니다'],
  };
  UI.renderDiff = function () {
    const Gm = G.Game, cur = G.Settings.diff;
    const list = $('diff-list');
    list.innerHTML = Gm.DIFF_KEYS.map((k, i) => {
      const d = Gm.DIFFS[k], tx = DIFF_TEXT[k];
      return `<button class="diff-opt d-${k}${k === cur ? ' on' : ''}" data-k="${k}"><kbd>${i + 1}</kbd><i class="do-gem"></i>
        <span class="do-name">${d.name}</span><span class="do-mult">${tx[0]}</span><span class="do-desc">${tx[1]}</span><span class="do-rw">점수·파편 ×${d.rw}</span></button>`;
    }).join('');
    list.querySelectorAll('.diff-opt').forEach((b) => {
      b.addEventListener('click', () => UI.pickDiff(b.dataset.k));
      b.addEventListener('mouseenter', () => G.Audio.play('hover'));
    });
  };
  UI.pickDiff = function (k) {
    if (!G.Game.DIFFS[k] || UI.current !== 'diff') return;
    G.Settings.diff = k;
    G.saveSettings();
    G.Audio.play('ui');
    G.Game.start('solo');
  };

  // ---------------- co-op ----------------
  UI.renderCoop = function () {
    const N = G.Net;
    const off = !N.available();
    const note = $('coop-off');
    note.classList.toggle('hidden', !off);
    $('coop-on').classList.toggle('hidden', off);
    if (N.status === 'connecting') note.textContent = '같이 하기 연결을 준비하는 중이에요...';
    else if (off) note.textContent = N.offNote || '이 화면에서는 같이 하기를 쓸 수 없어요. 혼자 하기는 그대로 할 수 있어요.';
    const name = $('coop-name');
    if (document.activeElement !== name) name.value = N.name;
    const c = UI.pickedColor == null ? N.color : UI.pickedColor;
    $('coop-colors').querySelectorAll('.swatch').forEach((b) => b.classList.toggle('on', +b.dataset.c === c));
    if (N.reason) setStatus('coop-status', N.reason, true);
    else if (N.status !== 'joining') setStatus('coop-status', '');
  };
  UI.renderLobby = function () {
    const N = G.Net;
    $('lobby-code').textContent = N.code || '-----';
    if (N.p2p && !UI.lobbyP2P) {
      UI.lobbyP2P = true;
      $('lobby-help').textContent = '초대 링크를 보내면 친구가 누르자마자 이 방으로 들어와요. 로그인이나 설치는 필요 없어요.';
      $('btn-copy-code').textContent = '초대 링크 복사';
    }
    const list = N.lobbyList(), ul = $('lobby-roster');
    const html = [];
    for (let i = 0; i < 4; i++) {
      const it = list[i];
      if (!it) { html.push('<li class="empty">빈 자리</li>'); continue; }
      const tag = [it.host ? '방장' : '', it.me ? '나' : ''].filter(Boolean).join(' · ');
      html.push(`<li><i style="background:${G.HERO_PAL[it.color].css}"></i><span class="nm"></span><em>${tag}</em></li>`);
    }
    ul.innerHTML = html.join('');
    ul.querySelectorAll('li:not(.empty) .nm').forEach((el, i) => { el.textContent = list[i].name; });
    const host = N.isHost(), Gm = G.Game, dk = N.roomDiff();
    const seg = $('lobby-diff');
    seg.innerHTML = Gm.DIFF_KEYS.map((k) => `<button class="seg-b d-${k}${k === dk ? ' on' : ''}" data-k="${k}"${host ? '' : ' disabled'}>${Gm.DIFFS[k].name}</button>`).join('');
    if (host) seg.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { G.Audio.play('ui'); N.setDiff(b.dataset.k); }));
    $('lobby-diff-note').textContent = host ? '방장이 정합니다' : '방장이 고른 난이도';
    // what a bigger party changes, for the people in the room right now
    const pa = Gm.PARTY(Math.max(1, list.length)), x = (v) => '×' + (Math.round(v * 100) / 100);
    $('lobby-party').innerHTML = pa.pc < 2 ? '사람이 늘수록 섬이 넓어지고 적이 강해져요'
      : `<b>${pa.pc}명</b> · 섬 넓이 ${x(pa.area)} · 적 수 ${x(pa.count)} · 적 체력 ${x(pa.hp)} · 적 공격력 ${x(pa.dmg)} · 보스 체력 ${x(pa.boss)}`;
    $('btn-lobby-start').classList.toggle('hidden', !host);
    $('btn-lobby-start').disabled = N.status !== 'inroom';
    const wait = N.waiting();
    if (N.reason) setStatus('lobby-status', N.reason, true);
    else if (!N.connected) setStatus('lobby-status', '연결이 잠시 끊겼어요. 다시 잇는 중...', true);
    else if (host) setStatus('lobby-status', list.length + '명 모였어요. 준비되면 시작을 누르세요');
    else setStatus('lobby-status', wait || '방장이 시작하기를 기다리는 중', !!wait && !wait.endsWith('...'));
  };

  // ---------------- toasts / banners ----------------
  UI.toast = function (msg, cls = '', life = 2.4) {
    const el = document.createElement('div');
    el.className = 'toast ' + cls;
    el.style.setProperty('--life', life + 's');
    el.textContent = msg;
    E.toasts.appendChild(el);
    while (E.toasts.children.length > 4) E.toasts.firstChild.remove();
    setTimeout(() => el.remove(), (life + 0.5) * 1000);
  };
  UI.banner = function (title, sub = '', cls = '') {
    const b = E.banner;
    b.className = '';
    b.querySelector('.banner-title').textContent = title;
    b.querySelector('.banner-sub').textContent = sub;
    void b.offsetWidth;
    b.className = 'show ' + cls;
  };
  UI.bossBar = function (on, name, sub) {
    E['boss-bar'].classList.toggle('hidden', !on);
    if (on) { E['boss-name'].textContent = name; E['boss-sub'].textContent = sub || ''; bossTrail = 1; bossFrac = 1; }
  };
  UI.bossHp = function (f) { bossFrac = Math.max(0, f); };
  UI.hitMarker = function () { hitT = 0.08; };
  UI.fireKick = function () { fireT = 0.06; };

  // ---------------- HUD ----------------
  const _sp = { x: 0, y: 0, vis: false };
  UI.update = function (dt) {
    const P = G.Player, Gm = G.Game, s = P.stats, mp = Gm.mode !== 'solo';
    const m = G.Input.mouse;
    E.crosshair.style.transform = `translate(${m.x}px, ${m.y}px)`;
    hitT -= dt; fireT -= dt;
    E.crosshair.classList.toggle('hit', hitT > 0);
    E.crosshair.classList.toggle('fire', fireT > 0);

    const maxHp = Math.max(1, P.maxHp || s.maxHp);
    const hpF = U.clamp(P.hp / maxHp, 0, 1);
    hpTrail = hpTrail > hpF ? Math.max(hpF, hpTrail - dt * 0.6) : hpF;
    E['hp-fill'].style.transform = `scaleX(${hpF})`;
    E['hp-trail'].style.transform = `scaleX(${hpTrail})`;
    E['hp-fill'].classList.toggle('low', hpF < 0.3 && P.alive);
    E['lowhp-overlay'].classList.toggle('on', hpF < 0.3 && P.alive);
    E['hp-text'].textContent = Math.ceil(P.hp) + ' / ' + Math.round(maxHp);
    const ultMax = G.Hero.ULT_TIME + (s.avatar ? 2 : 0);
    E['ult-fill'].style.width = (P.ultT > 0 ? P.ultT / ultMax : P.ult / 100) * 100 + '%';
    E['ult-fill'].classList.toggle('ready', P.ult >= 100);
    E['ult-text'].textContent = P.ultT > 0 ? '파편 폭풍' : P.ult >= 100 ? '파편 폭풍 · R' : '파편 폭풍 ' + Math.floor(P.ult) + '%';
    E['lvl-num'].textContent = Gm.team.lv;
    E['xp-fill'].style.width = U.clamp(Gm.team.xp / Gm.team.xpNext, 0, 1) * 100 + '%';
    E['xp-text'].textContent = '레벨 ' + Gm.team.lv + ' · ' + Math.floor(Gm.team.xp) + ' / ' + Gm.team.xpNext;

    E['wave-label'].textContent = Gm.waveLabel();
    const di = Gm.diffInfo(), tag = mp ? di.name + ' · ' + Gm.players() + '인' : di.name;
    if (E['diff-tag'].textContent !== tag) { E['diff-tag'].textContent = tag; E['diff-tag'].style.color = di.css; }
    E['wave-sub'].textContent = Gm.waveSub();
    E.wpFill.style.width = Gm.waveProgress() * 100 + '%';
    E.score.textContent = U.fmtNum(Gm.score);
    E['combo-box'].classList.toggle('active', Gm.combo > 1);
    E['combo-mult'].textContent = '×' + Gm.comboMult().toFixed(1);
    E['combo-count'].textContent = Gm.combo > 1 ? Gm.combo + '연속' : '';
    E.comboBar.style.width = U.clamp(Gm.comboT / 2.6, 0, 1) * 100 + '%';
    E['shards-count'].textContent = Gm.shardsEarned();
    E.timer.textContent = U.fmtTime(Gm.time);
    E.kills.textContent = Gm.stats.kills;

    setCd('rmb', P.cd.lance, P.charging);
    setCd('q', P.cd.nova);
    setCd('e', P.cd.meteor);
    E.ab.rmb.charge.style.width = (P.charging ? P.lanceCharge * 100 : 0) + '%';
    E.ab.lmb.el.classList.toggle('active', m.left && P.alive);
    const d = E.ab.dash;
    if (d.pips.children.length !== s.dashCharges) d.pips.innerHTML = '<i></i>'.repeat(s.dashCharges);
    [...d.pips.children].forEach((p, i) => p.classList.toggle('on', i < P.dashCharges));
    d.cd.style.setProperty('--cd', P.dashCharges > 0 ? 0 : 1 - P.dashRecharge / s.dashCd);
    d.txt.textContent = P.dashCharges > 0 ? '' : Math.max(0, s.dashCd - P.dashRecharge).toFixed(1);
    const r = E.ab.r;
    r.cd.style.setProperty('--cd', P.ultT > 0 ? 0 : 1 - P.ult / 100);
    r.el.classList.toggle('ready', P.ult >= 100);
    r.el.classList.toggle('active', P.ultT > 0);
    r.txt.textContent = P.ult >= 100 || P.ultT > 0 ? '' : Math.floor(P.ult) + '%';

    if (!E['boss-bar'].classList.contains('hidden')) {
      bossTrail = bossTrail > bossFrac ? Math.max(bossFrac, bossTrail - dt * 0.35) : bossFrac;
      E['boss-fill'].style.transform = `scaleX(${bossFrac})`;
      E['boss-trail'].style.transform = `scaleX(${bossTrail})`;
    }

    updateTeam(mp);
    updateTags(mp);
    E.spectate.classList.toggle('hidden', !(mp && !P.alive && Gm.state === 'playing'));
    const waiting = mp ? Gm.waitingNames() : [];
    const showWait = mp && Gm.pickPause && !Gm.picksPending() && waiting.length > 0;
    E.pickwait.classList.toggle('hidden', !showWait);
    if (showWait) E.pickwait.textContent = '카드 고르는 중 · ' + waiting.join(', ');
    E['levelup-wait'].textContent = mp && waiting.length ? '아직 고르는 사람 · ' + waiting.join(', ') : '';

    mmT -= dt;
    if (mmT <= 0) { mmT = 1 / 20; drawMinimap(); }
    if (G.Settings.showFps) {
      fpsN++; fpsT += dt;
      if (fpsT >= 0.5) { E.fps.textContent = Math.round(fpsN / fpsT) + ' FPS · 적 ' + G.Enemies.count(); fpsN = 0; fpsT = 0; }
    } else E.fps.textContent = '';
    if (Gm.state === 'playing' && !perfWarned) {
      perfT += dt; perfN++;
      if (perfT > 10) {
        perfWarned = true;
        if (perfN / perfT < 35 && G.Settings.quality !== 'low') UI.toast('화면이 끊기면 설정에서 그래픽을 낮춰 보세요', 'warn', 6);
      }
    }
  };
  function setCd(k, v, active) {
    const a = E.ab[k];
    if (v > (cdLast[k] || 0) + 0.01) cdMax[k] = v;
    cdLast[k] = v;
    a.cd.style.setProperty('--cd', v > 0 && cdMax[k] ? v / cdMax[k] : 0);
    a.txt.textContent = v > 0 ? (v >= 10 ? Math.ceil(v) : v.toFixed(1)) : '';
    if (v <= 0 && !a.ready) { a.ready = true; a.el.classList.remove('ready-flash'); void a.el.offsetWidth; a.el.classList.add('ready-flash'); }
    if (v > 0) a.ready = false;
    a.el.classList.toggle('active', !!active);
  }
  function updateTeam(mp) {
    const others = mp ? G.Heroes.list.filter((h) => h !== G.Player) : [];
    const key = others.map((h) => h.key + h.colorIdx + h.name).join('|');
    if (key !== teamKey) {
      teamKey = key;
      E.team.innerHTML = others.map((h) => `<div class="mate" data-k="${U.esc(h.key)}"><i style="background:${h.pal.css}"></i><span></span><div class="mbar"><div></div></div></div>`).join('');
      E.team.querySelectorAll('.mate').forEach((el, i) => { el.querySelector('span').textContent = others[i].name || '동료'; });
    }
    E.team.querySelectorAll('.mate').forEach((el, i) => {
      const h = others[i];
      if (!h) return;
      el.classList.toggle('dead', !h.alive);
      el.querySelector('.mbar div').style.transform = `scaleX(${U.clamp(h.hp / Math.max(1, h.maxHp), 0, 1)})`;
    });
  }
  function updateTags(mp) {
    const seen = new Set();
    if (mp) {
      for (const h of G.Heroes.list) {
        if (h === G.Player) continue;
        seen.add(h.key);
        let el = tags.get(h.key);
        if (!el) {
          el = document.createElement('div');
          el.className = 'tag';
          el.innerHTML = `<i style="background:${h.pal.css}"></i><span></span>`;
          E['tags-layer'].appendChild(el);
          tags.set(h.key, el);
        }
        el.querySelector('span').textContent = h.name || '동료';
        el.classList.toggle('dead', !h.alive);
        G.Render.toScreen(h.x, h.y + 3.1, h.z, _sp);
        el.style.display = _sp.vis ? 'block' : 'none';
        el.style.transform = `translate(${_sp.x.toFixed(0)}px, ${_sp.y.toFixed(0)}px) translate(-50%, -100%)`;
      }
    }
    for (const [k, el] of tags) if (!seen.has(k)) { el.remove(); tags.delete(k); }
  }
  UI.clearTags = function () { for (const el of tags.values()) el.remove(); tags.clear(); teamKey = ''; E.team.innerHTML = ''; };

  function drawMinimap() {
    const c = E.mm, W = 200, R = G.World.ARENA_R, k = 88 / (R + 4);
    c.clearRect(0, 0, W, W);
    c.save();
    c.translate(W / 2, W / 2);
    c.fillStyle = '#2b3a2c';
    c.beginPath(); c.arc(0, 0, R * k, 0, U.TAU); c.fill();
    c.strokeStyle = '#5a4a3a'; c.lineWidth = 2; c.stroke();
    c.fillStyle = '#15110d';
    for (const o of G.World.obstacles) { if (o.off) continue; c.beginPath(); c.arc(o.x * k, o.z * k, Math.max(1.5, o.r * k), 0, U.TAU); c.fill(); }
    c.strokeStyle = G.World.altarActive ? '#f6d27a' : '#8a7a62';
    c.lineWidth = 1.5;
    c.beginPath(); c.arc(0, 0, G.World.altar.r * k, 0, U.TAU); c.stroke();
    for (const ch of G.Pickups.chests) if (!ch.open) { c.fillStyle = '#f6d27a'; c.fillRect(ch.x * k - 3, ch.z * k - 3, 6, 6); }
    for (const e of G.Enemies.list) {
      if (!e.alive) continue;
      c.fillStyle = e.elite ? '#f6d27a' : e.spawnT > 0 ? '#a89a82' : '#e0505e';
      const s = e.elite ? 3.4 : e.type === 'brute' ? 3 : 2;
      c.fillRect(e.x * k - s / 2, e.z * k - s / 2, s, s);
    }
    if (G.Bosses.active && G.Bosses.active.alive) {
      c.fillStyle = '#f08c93';
      for (const t of G.Bosses.targets) { c.beginPath(); c.arc(t.x * k, t.z * k, Math.max(2.5, t.r * k), 0, U.TAU); c.fill(); }
    }
    for (const h of G.Heroes.list) {
      if (!h.alive || h === G.Player) continue;
      c.save();
      c.translate(h.x * k, h.z * k);
      c.rotate(Math.PI / 4);
      c.fillStyle = h.pal.css; c.strokeStyle = '#15110d'; c.lineWidth = 1.5;
      c.fillRect(-3.5, -3.5, 7, 7); c.strokeRect(-3.5, -3.5, 7, 7);
      c.restore();
    }
    const P = G.Player;
    if (P.alive) {
      c.save();
      c.translate(P.x * k, P.z * k);
      c.rotate(P.facing);
      c.fillStyle = '#efe5cf'; c.strokeStyle = '#15110d'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(7, 0); c.lineTo(-4, 4.5); c.lineTo(-2, 0); c.lineTo(-4, -4.5); c.closePath(); c.fill(); c.stroke();
      c.restore();
    }
    c.restore();
  }

  UI.renderUpgradeList = function () {
    const P = G.Player, UP = G.Upgrades;
    const html = P ? P.up.order.map((id) => {
      const d = UP.byId[id];
      return `<div class="upg r-${d.rarity}" title="${U.esc(d.name)}">${G.Icons.svg(d.icon)}<b>${P.up.levels[id]}</b></div>`;
    }).join('') : '';
    E['upgrade-list'].innerHTML = html;
    $('pause-build').innerHTML = html || '<span class="muted small">아직 고른 카드가 없어요</span>';
  };

  // ---------------- cards ----------------
  // A card only counts if the press STARTS on it after the cards have settled (0.7s), so a held
  // attack button or a frantic click while fighting can never pick one by accident.
  UI.showLevelUp = function (cards, opts = {}) {
    UI.cards = cards;
    UI.cardOpts = opts;
    UI.armAt = performance.now() + ARM_MS;
    UI.downIdx = -1;
    $('levelup-title').textContent = opts.title || '레벨 업';
    $('levelup-sub').textContent = opts.sub || '카드 한 장을 고르세요';
    const P = G.Player, UP = G.Upgrades;
    E['levelup-cards'].innerHTML = cards.map((d, i) => {
      const lv = UP.level(P, d.id), fb = d.id[0] === '_';
      const lvTxt = fb ? '' : lv === 0 ? '처음 얻는 카드' : `${lv} → ${lv + 1}단계 · 최대 ${d.max}`;
      return `<div class="card arming r-${d.rarity}" data-i="${i}">
        <svg class="card-art" viewBox="0 0 230 340" preserveAspectRatio="none" aria-hidden="true">
          <path class="glass" d="${ARCH}"/><path class="pane2" d="M115 10C66 10 30 40 18 86l97 60z"/><path class="pane3" d="M212 72c-14-34-50-62-97-62v136z"/>
          <path class="lead" d="M115 10v136M18 86l97 60 97-74"/><path class="frame" d="${ARCH}"/>
        </svg>
        <div class="c-medal">${G.Icons.svg(d.icon)}</div>
        <div class="c-key">${i + 1}</div>
        <div class="c-plate"><div class="c-rarity">${UP.RARITY[d.rarity].kr}</div><div class="c-name">${d.name}</div><div class="c-desc">${d.desc(lv + 1, P)}</div><div class="c-level">${lvTxt}</div></div>
        <div class="c-arm"><div></div></div>
      </div>`;
    }).join('');
    E['levelup-cards'].querySelectorAll('.card').forEach((el) => {
      const i = +el.dataset.i;
      el.addEventListener('pointerdown', (ev) => { if (ev.button === 0) UI.downIdx = performance.now() >= UI.armAt ? i : -1; });
      el.addEventListener('pointerup', (ev) => {
        if (ev.button === 0 && UI.downIdx === i && performance.now() >= UI.armAt) UI.pickCard(i);
        UI.downIdx = -1;
      });
      el.addEventListener('mouseenter', () => { if (performance.now() >= UI.armAt) G.Audio.play('hover'); });
    });
    const pct = (p) => (p >= 10 ? Math.round(p) : +p.toFixed(1));
    $('levelup-odds').innerHTML = '<span class="lo-k">한 장마다 등급 확률</span>' +
      UP.odds(P, opts.roll || {}).map((o) => `<span class="r-${o.r}"><i></i>${o.kr} <b>${pct(o.p)}%</b></span>`).join('');
    clearTimeout(UI.armTimer);
    UI.armTimer = setTimeout(() => E['levelup-cards'].querySelectorAll('.card').forEach((el) => el.classList.remove('arming')), ARM_MS);
    E['reroll-count'].textContent = G.Player.rerolls;
    E['btn-reroll'].disabled = G.Player.rerolls <= 0;
    E.banner.className = '';
    UI.show('levelup');
    UI.setPlaying(false);
  };
  UI.pickCard = function (i) {
    if (!UI.cards || UI.current !== 'levelup' || performance.now() < UI.armAt) return;
    const d = UI.cards[i];
    if (!d) return;
    UI.cards = null;
    G.Audio.play('levelup');
    G.Game.onCardPicked(d);
  };
  UI.reroll = function () {
    if (UI.current !== 'levelup' || !UI.cards || G.Player.rerolls <= 0 || performance.now() < UI.armAt) return;
    G.Player.rerolls--;
    G.Audio.play('reroll');
    UI.showLevelUp(G.Upgrades.roll(G.Player, 3, UI.cardOpts.roll || {}), UI.cardOpts);
  };

  // ---------------- results ----------------
  UI.showGameOver = function (o) {
    const t = $('go-title');
    t.textContent = o.victory ? '승리' : '패배';
    t.className = o.victory ? 'victory' : 'defeat';
    $('go-sub').textContent = o.victory ? '15스테이지를 끝까지 버텼습니다' : '스테이지 ' + o.wave + '에서 쓰러졌습니다';
    const st = o.stats;
    const rows = [['난이도', o.diff ? o.diff.name : '보통'], ['점수', U.fmtNum(o.score)], ['스테이지', o.wave], ['레벨', o.level], ['시간', U.fmtTime(o.time)], ['처치', U.fmtNum(st.kills)],
      ['최대 연속 처치', st.maxCombo], ['엘리트', st.elites], ['보스', st.bosses]];
    if (!o.coop) rows.splice(7, 0, ['준 피해', U.fmtNum(st.damage)], ['받은 피해', U.fmtNum(st.taken)]);
    $('go-stats').innerHTML = (o.newBest ? '<div class="new-best">최고 점수 갱신</div>' : '') + rows.map((r) => `<div><span>${r[0]}</span><b>${r[1]}</b></div>`).join('');
    $('go-shards').textContent = '영혼 파편 +' + o.shards + ' · 보유 ' + U.fmtNum(G.Save.data.shards);
    $('btn-continue').classList.toggle('hidden', !o.canContinue);
    $('btn-retry').classList.toggle('hidden', o.coop && !o.host);
    $('btn-retry').textContent = o.coop ? '같은 사람들과 다시 하기' : '다시 도전';
    $('btn-go-lobby').classList.toggle('hidden', !(o.coop && o.host));
    $('btn-go-menu').textContent = o.coop ? '방 나가기' : '메인 메뉴';
    $('go-note').textContent = o.coop && !o.host ? '방장이 다시 시작하면 바로 이어서 함께합니다' : '';
    UI.clearTags();
    UI.show('gameover');
    UI.setPlaying(false);
  };

  // ---------------- forge ----------------
  UI.renderForge = function () {
    const UP = G.Upgrades, d = G.Save.data;
    $('forge-shards').textContent = U.fmtNum(d.shards);
    $('forge-list').innerHTML = UP.forge.map((f) => {
      const l = UP.forgeLevel(f.id), max = l >= f.max, cost = UP.forgeCost(f);
      return `<div class="forge-item"><div class="fi-icon">${G.Icons.svg(f.icon)}</div><div class="fi-body"><div class="fi-name">${f.name}</div>
        <div class="fi-desc">${f.desc} · 단계마다</div><div class="fi-pips">${'<i class="on"></i>'.repeat(l)}${'<i></i>'.repeat(f.max - l)}</div></div>
        <button data-id="${f.id}" ${max || d.shards < cost ? 'disabled' : ''}>${max ? '완료' : cost}</button></div>`;
    }).join('');
    $('forge-list').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      if (UP.buyForge(b.dataset.id)) { G.Audio.play('chest'); UI.renderForge(); UI.refreshMenu(); }
    }));
  };
})();

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
  const ARM_MS = 700, COOP_PICK_S = 11;
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
    go('btn-play', () => UI.show('chars'));
    go('btn-diff-back', () => UI.show('chars'));
    go('btn-chars-next', () => UI.show('diff'));
    go('btn-chars-back', () => UI.show('menu'));
    go('btn-records', () => UI.show('records'));
    go('btn-records-back', () => UI.show('menu'));
    $('diff-char').addEventListener('click', (e) => { if (e.target.closest('button')) { G.Audio.play('ui'); UI.show('chars'); } });
    document.querySelector('.rec-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('.rec-tab');
      if (b && b.dataset.t !== UI.recTab) { G.Audio.play('ui'); UI.renderRecords(b.dataset.t); }
    });
    // a line in the history opens to show the cards and the rest of that run
    $('rec-body').addEventListener('click', (e) => {
      const li = e.target.closest('.rh-item');
      if (!li) return;
      li.classList.toggle('open');
      G.Audio.play('hover');
    });
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
      else if (e.code === 'Escape') UI.show('chars');
    });
    // the character screen: arrows move along the grid, Enter goes on, Esc goes back
    addEventListener('keydown', (e) => {
      if (UI.current !== 'chars' || G.Input.typing(e)) return;
      const order = G.Classes.order, i = Math.max(0, order.indexOf(G.Game.soloClass));
      const cols = getComputedStyle($('solo-classes')).gridTemplateColumns.split(' ').length || 5;
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols }[e.code];
      if (step) { e.preventDefault(); const j = i + step; if (j >= 0 && j < order.length) UI.pickSolo(order[j]); }
      else if (e.code === 'Enter' && !e.repeat) { e.preventDefault(); G.Audio.play('ui'); UI.show('diff'); }
      else if (e.code === 'Escape' && !e.repeat) UI.show('menu');
    });
    addEventListener('keydown', (e) => {
      if (UI.current !== 'records' || e.repeat || G.Input.typing(e)) return;
      const t = { Digit1: 'sum', Digit2: 'cls', Digit3: 'hist' }[e.code];
      if (t) UI.renderRecords(t);
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
    if (name === 'chars') UI.renderChars();
    if (name === 'records') UI.renderRecords();
    if (name === 'diff') UI.renderDiff();
    if (name === 'coop') UI.renderCoop();
    if (name === 'lobby') UI.renderLobby();
    if (name === 'forge') UI.renderForge();
    if (name === 'pause') {
      // co-op has no pause: the same panel is just a menu over a game that keeps running
      const mp = G.Game.mode !== 'solo';
      $('pause-title').textContent = mp ? '메뉴' : '일시정지';
      $('btn-resume').textContent = mp ? '돌아가기' : '계속하기';
      $('btn-quit').textContent = mp ? '방 나가기' : '포기하고 메뉴로';
      $('pause-note').textContent = mp ? '같이 하기에는 일시정지가 없어요. 메뉴를 보는 동안에도 싸움은 계속됩니다' : '';
      $('screen-pause').classList.toggle('coop', mp);
    }
  };
  UI.hud = function (on) { E.hud.classList.toggle('hidden', !on); };
  // the skill bar wears the current character's skills (hover a slot for its name)
  UI.setHero = function (h) {
    const c = h.cls, CL = G.Classes, b = CL.basicOf(h), sk = [1, 2, 3].map((i) => CL.skillView(h, i));
    viewKey = c.viewKey ? c.viewKey(h) : null;
    const slots = { lmb: [b.icon, b.name], rmb: [sk[0].icon || c.skills[0].icon, sk[0].name], q: [sk[1].icon || c.skills[1].icon, sk[1].name], e: [sk[2].icon || c.skills[2].icon, sk[2].name], r: [c.ult.icon, c.ult.name] };
    for (const k in slots) {
      const a = E.ab[k];
      a.el.querySelector('.ab-icon').innerHTML = G.Icons.svg(slots[k][0]);
      a.el.title = slots[k][1];
    }
    E.ab.dash.el.title = '질주';
  };
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
    hell: ['적 체력·공격력 ×2.38', '섬도 몬스터도 지옥불에 물듭니다. 보스의 한 방이 곧 끝입니다'],
  };
  UI.renderDiff = function () {
    const Gm = G.Game, cur = G.Settings.diff;
    // who is going in (and a way back to change it)
    const c = G.Classes.get(Gm.soloClass);
    $('diff-char').innerHTML = `<span class="dc-ico" style="--cc:${c.css}">${G.Icons.svg(c.emblem)}</span>` +
      `<span class="dc-txt"><small>캐릭터</small><b>${c.name}</b><em>${c.role}</em></span><button class="btn small">바꾸기</button>`;
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
      const tag = [G.Classes.get(it.cls).name, it.host ? '방장' : '', it.me ? '나' : ''].filter(Boolean).join(' · ');
      html.push(`<li><i style="background:${G.HERO_PAL[it.color].css}"></i><span class="nm"></span><em>${tag}</em></li>`);
    }
    ul.innerHTML = html.join('');
    ul.querySelectorAll('li:not(.empty) .nm').forEach((el, i) => { el.textContent = list[i].name; });
    const host = N.isHost(), Gm = G.Game, dk = N.roomDiff();
    // The lobby re-renders on every network update (many times a second). The buttons are made
    // once and only their state changes here; rebuilding them each time swallowed the host's clicks.
    const seg = $('lobby-diff');
    if (!seg.childElementCount) {
      seg.innerHTML = Gm.DIFF_KEYS.map((k) => `<button class="seg-b d-${k}" data-k="${k}">${Gm.DIFFS[k].name}</button>`).join('');
      seg.addEventListener('click', (e) => {
        const b = e.target.closest('.seg-b');
        if (!b || b.disabled || !G.Net.isHost()) return;
        G.Audio.play('ui');
        G.Net.setDiff(b.dataset.k);
      });
    }
    for (const b of seg.children) {
      b.classList.toggle('on', b.dataset.k === dk);
      b.disabled = !host;
    }
    $('lobby-diff-note').textContent = host ? '방장이 정합니다' : '방장이 고른 난이도';
    // characters: built once, then only marked (mine / taken by whom); a taken one can't be picked
    const grid = $('lobby-classes');
    if (!grid.childElementCount) {
      grid.innerHTML = G.Classes.order.map((id) => {
        const c = G.Classes.get(id);
        return `<button class="cls-card" data-c="${id}" style="--cc:${c.css}">${clsWindow(id)}<span class="cls-ico">${G.Icons.svg(c.emblem)}</span><b>${c.name}</b><small>${c.role}</small><i class="cls-who"></i></button>`;
      }).join('');
      grid.addEventListener('click', (e) => {
        const b = e.target.closest('.cls-card');
        if (b && !b.disabled && G.Net.setClass(b.dataset.c)) G.Audio.play('ui');
      });
      grid.addEventListener('mouseover', (e) => { const b = e.target.closest('.cls-card'); UI.clsHover = b ? b.dataset.c : null; renderClsInfo(); });
      grid.addEventListener('mouseleave', () => { UI.clsHover = null; renderClsInfo(); });
    }
    const byCls = new Map(list.map((it) => [it.cls, it]));
    for (const b of grid.children) {
      const it = byCls.get(b.dataset.c), mine = !!it && it.me, who = b.querySelector('.cls-who');
      b.classList.toggle('mine', mine);
      b.disabled = !!it && !mine;
      who.textContent = it ? (mine ? '나' : it.name) : '';
      who.style.display = it ? '' : 'none';
    }
    renderClsInfo();
    // what a bigger party changes, for the people in the room right now
    const pa = Gm.PARTY(Math.max(1, list.length)), x = (v) => '×' + (Math.round(v * 100) / 100);
    $('lobby-party').innerHTML = pa.pc < 2 ? '사람이 늘수록 섬이 넓어지고 적이 강해져요'
      : `<b>${pa.pc}명</b> · 섬 넓이 ${x(pa.area)} · 적 수 ${x(pa.count)} · 적 체력 ${x(pa.hp)} · 적 공격력 ${x(pa.dmg)} · 보스 체력 ${x(pa.boss)}`;
    $('btn-lobby-start').classList.toggle('hidden', !host);
    // co-op needs a partner: the host can start once at least two people are in the room
    $('btn-lobby-start').disabled = N.status !== 'inroom' || list.length < Gm.COOP_MIN;
    const wait = N.waiting();
    if (N.reason) setStatus('lobby-status', N.reason, true);
    else if (!N.connected) setStatus('lobby-status', '연결이 잠시 끊겼어요. 다시 잇는 중...', true);
    else if (host && list.length < Gm.COOP_MIN) setStatus('lobby-status', '친구를 기다리는 중이에요 · 같이 하기는 2명부터 시작할 수 있어요');
    else if (host) setStatus('lobby-status', list.length + '명 모였어요. 준비되면 시작을 누르세요');
    else setStatus('lobby-status', wait || '방장이 시작하기를 기다리는 중', !!wait && !wait.endsWith('...'));
  };

  // each character's own stained-glass window (its colours, its pattern, its emblem in the middle)
  const clsWindow = (id) => `<svg class="cls-win" viewBox="14 22 202 158" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${G.Icons.window(id, { medal: true })}</svg>`;
  // a character's sheet: how hard it is to play, trait, basic attack, three skills, ultimate
  const TIER = ['', '쉬움', '보통', '어려움'];
  function clsInfoHtml(c, extra = '') {
    const m = G.Mobile.on;
    const keys = m ? ['1번', '2번', '3번', '궁극기'] : ['우클릭', 'Q', 'E', 'R'];
    const how = (s) => `<i class="how">${G.Classes.HOW[s.kind][m ? 1 : 0]}</i>`;
    const tier = c.tier ? `<span class="tier t${c.tier}" title="다루기 ${TIER[c.tier]}"><i>${'★'.repeat(c.tier)}${'☆'.repeat(3 - c.tier)}</i> 다루기 ${TIER[c.tier]}</span>` : '';
    return `<h4>${c.name} <small>${c.role}</small>${tier}</h4>` + extra +
      `<p class="trait"><b>특성 · ${c.trait.name}</b> ${c.trait.desc}</p>` +
      `<ul><li><kbd>${m ? '오른쪽' : '좌클릭'}</kbd><b>${c.basic.name}</b>${c.basic.desc}</li>` +
      c.skills.map((s, i) => `<li><kbd>${keys[i]}</kbd><b>${s.name}</b>${how(s)}${s.desc}</li>`).join('') +
      `<li><kbd>${keys[3]}</kbd><b>${c.ult.name}</b>${c.ult.desc}</li></ul>`;
  }
  // the lobby: the chosen (or hovered) character
  function renderClsInfo() {
    const id = UI.clsHover || G.Net.classOf(G.Net.me);
    if (UI.clsInfoKey === id) return;
    UI.clsInfoKey = id;
    $('lobby-cls-info').innerHTML = clsInfoHtml(G.Classes.get(id));
  }

  // ---------------- solo: character screen ----------------
  // 'with the falconer': 로 after a vowel or ㄹ, 으로 after any other final consonant
  const ro = (w) => { const k = w.charCodeAt(w.length - 1) - 0xac00; return w + (k < 0 || k > 11171 || k % 28 === 0 || k % 28 === 8 ? '로' : '으로'); };
  UI.renderChars = function () {
    const grid = $('solo-classes');
    if (!grid.childElementCount) {
      grid.innerHTML = G.Classes.order.map((id) => {
        const c = G.Classes.get(id);
        return `<button class="cls-card" data-c="${id}" style="--cc:${c.css}">${clsWindow(id)}<span class="cls-ico">${G.Icons.svg(c.emblem)}</span><b>${c.name}</b><small>${c.role}</small><i class="cls-rec"></i></button>`;
      }).join('');
      grid.addEventListener('click', (e) => { const b = e.target.closest('.cls-card'); if (b) UI.pickSolo(b.dataset.c); });
      grid.addEventListener('dblclick', (e) => { const b = e.target.closest('.cls-card'); if (b) { UI.pickSolo(b.dataset.c); UI.show('diff'); } });
      grid.addEventListener('mouseover', (e) => { const b = e.target.closest('.cls-card'); UI.soloHover = b ? b.dataset.c : null; renderSoloInfo(); });
      grid.addEventListener('mouseleave', () => { UI.soloHover = null; renderSoloInfo(); });
    }
    // each card shows how far that character has been
    const R = G.Save.rec();
    for (const b of grid.children) {
      const r = R.cls[b.dataset.c];
      b.classList.toggle('mine', b.dataset.c === G.Game.soloClass);
      b.querySelector('.cls-rec').textContent = r && r.n > 0 ? '최고 ' + (r.wave | 0) + '스테이지' : '';
    }
    UI.soloHover = null;
    UI.soloInfoKey = null;
    renderSoloInfo();
  };
  UI.pickSolo = function (id) {
    if (!G.Classes.valid(id)) return;
    if (G.Game.soloClass !== id) G.Audio.play('ui');
    G.Game.soloClass = id;
    G.Settings.soloClass = id;
    G.saveSettings();
    for (const b of $('solo-classes').children) b.classList.toggle('mine', b.dataset.c === id);
    UI.soloHover = null;
    renderSoloInfo();
  };
  function renderSoloInfo() {
    const id = UI.soloHover || G.Game.soloClass;
    $('btn-chars-next').textContent = ro(G.Classes.get(G.Game.soloClass).name) + ' · 난이도 고르기';
    if (UI.soloInfoKey === id) return;
    UI.soloInfoKey = id;
    const r = G.Save.rec().cls[id], n = r ? r.n | 0 : 0;
    const line = n > 0
      ? `<p class="cls-rec-line">이 캐릭터로 <b>${n}</b>판 · 승리 <b>${r.w | 0}</b>번 · 최고 <b>${r.wave | 0}</b>스테이지 · 최고 점수 <b>${U.fmtNum(r.score || 0)}</b></p>`
      : '<p class="cls-rec-line none">아직 이 캐릭터로 끝낸 판이 없어요</p>';
    $('solo-cls-info').innerHTML = clsInfoHtml(G.Classes.get(id), line);
  }

  // ---------------- records ----------------
  UI.recTab = 'sum';
  const num = (v) => (Number.isFinite(+v) && +v >= 0 ? +v : 0);
  const fmtDur = (s) => { s = Math.floor(num(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? h + '시간 ' + m + '분' : m ? m + '분' : s + '초'; };
  const when = (ts) => {
    ts = num(ts);
    if (!ts) return '';
    const d = new Date(ts), now = new Date(), ago = (now - d) / 1000;
    if (ago < 60) return '방금';
    if (ago < 3600) return Math.floor(ago / 60) + '분 전';
    const hm = (d.getHours() < 12 ? '오전 ' : '오후 ') + ((d.getHours() % 12) || 12) + ':' + String(d.getMinutes()).padStart(2, '0');
    if (d.toDateString() === now.toDateString()) return '오늘 ' + hm;
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return '어제 ' + hm;
    return (d.getFullYear() !== now.getFullYear() ? d.getFullYear() + '년 ' : '') + (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + hm;
  };
  const RES = { win: ['승리', 'win'], lose: ['패배', 'lose'], quit: ['포기', 'quit'], ended: ['중단', 'quit'] };
  UI.renderRecords = function (tab) {
    if (tab) UI.recTab = tab;
    const t = UI.recTab;
    document.querySelectorAll('.rec-tab').forEach((b) => { const on = b.dataset.t === t; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
    $('rec-body').innerHTML = t === 'cls' ? recClasses() : t === 'hist' ? recHistory() : recSummary();
  };
  function recSummary() {
    const d = G.Save.data, R = G.Save.rec(), Gm = G.Game;
    const runs = num(d.runs), wins = num(d.wins);
    let fav = null;
    for (const id of G.Classes.order) { const r = R.cls[id]; if (r && num(r.n) > 0 && (!fav || num(r.n) > num(R.cls[fav].n))) fav = id; }
    const tiles = [
      ['플레이', U.fmtNum(runs) + '판', R.solo + R.coop > 0 ? '혼자 ' + R.solo + ' · 같이 ' + R.coop : ''],
      ['승리', U.fmtNum(wins) + '번', runs ? '승률 ' + Math.round((wins / runs) * 100) + '%' : ''],
      ['최고 점수', U.fmtNum(num(d.best)), ''],
      ['최고 스테이지', num(d.bestWave) | 0, num(d.bestWave) > 15 ? '무한 모드까지' : num(d.bestWave) >= 15 ? '끝까지 버팀' : ''],
      ['총 처치', U.fmtNum(num(d.totalKills)), ''],
      ['보스 처치', U.fmtNum(R.bosses) + '마리', ''],
      ['플레이 시간', fmtDur(R.time), ''],
      ['최고 연속 처치', U.fmtNum(R.combo), ''],
    ];
    let html = '<div class="rec-tiles">' + tiles.map((x) => `<div class="rt"><span>${x[0]}</span><b>${x[1]}</b>${x[2] ? `<em>${x[2]}</em>` : ''}</div>`).join('') + '</div>';
    if (fav) {
      const c = G.Classes.get(fav), r = R.cls[fav];
      html += `<div class="rec-fav" style="--cc:${c.css}"><span class="rf-ico">${G.Icons.svg(c.emblem)}</span><span><small>가장 많이 한 캐릭터</small><b>${c.name}</b></span>` +
        `<em>${num(r.n)}판 · 최고 ${num(r.wave) | 0}스테이지 · ${U.fmtNum(num(r.score))}점</em></div>`;
    }
    const cell = (k) => {
      const r = R.diff[k];
      if (!r || !(num(r.n) > 0)) return '<td class="none">—</td>';
      return `<td><b>${num(r.wave) | 0}</b>스테이지 · ${U.fmtNum(num(r.score))}점<small>${num(r.w)}승 / ${num(r.n)}판</small></td>`;
    };
    html += '<h3 class="rec-h">난이도별 최고 기록</h3><table class="rec-table"><thead><tr><th>난이도</th><th>혼자 하기</th><th>같이 하기</th></tr></thead><tbody>' +
      Gm.DIFF_KEYS.map((k) => `<tr><th class="d-${k}"><i></i>${Gm.DIFFS[k].name}</th>${cell('solo:' + k)}${cell('coop:' + k)}</tr>`).join('') + '</tbody></table>';
    return html;
  }
  function recClasses() {
    const R = G.Save.rec();
    let top = null;
    for (const id of G.Classes.order) { const r = R.cls[id]; if (r && num(r.n) > 0 && (!top || num(r.wave) > num(R.cls[top].wave) || (num(r.wave) === num(R.cls[top].wave) && num(r.score) > num(R.cls[top].score)))) top = id; }
    const rows = G.Classes.order.map((id) => {
      const c = G.Classes.get(id), r = R.cls[id], n = r ? num(r.n) : 0;
      const badge = id === top ? '<em class="rc-top">최고 기록</em>' : '';
      if (!n) return `<div class="rc-row none" style="--cc:${c.css}"><span class="rc-name"><i>${G.Icons.svg(c.emblem)}</i><b>${c.name}</b></span><span class="rc-empty">아직 끝낸 판이 없어요</span></div>`;
      return `<div class="rc-row" style="--cc:${c.css}"><span class="rc-name"><i>${G.Icons.svg(c.emblem)}</i><b>${c.name}</b>${badge}</span>` +
        `<span>${n}</span><span>${num(r.w)}</span><span><b>${num(r.wave) | 0}</b></span><span>${U.fmtNum(num(r.score))}</span><span class="rc-x">${U.fmtNum(num(r.kills))}</span><span class="rc-x">${fmtDur(r.time)}</span></div>`;
    }).join('');
    return '<div class="rec-cls"><div class="rc-row head"><span>캐릭터</span><span>판</span><span>승리</span><span>최고 스테이지</span><span>최고 점수</span><span class="rc-x">처치</span><span class="rc-x">플레이 시간</span></div>' +
      rows + '</div><p class="muted small">혼자 하기와 같이 하기를 모두 합친 기록이에요. 같이 하기 점수는 팀 점수입니다.</p>';
  }
  function recHistory() {
    const R = G.Save.rec(), Gm = G.Game, UP = G.Upgrades;
    if (!R.hist.length) return '<p class="rec-empty">아직 남은 판이 없어요.<br>한 판을 끝내면 여기에 결과와 고른 카드가 쌓여요.</p>';
    const items = R.hist.map((h, i) => {
      const c = G.Classes.get(h.c), dk = Gm.DIFFS[h.d] ? h.d : 'normal', res = RES[h.res] || RES.quit;
      const wave = num(h.wave) | 0, coop = h.m === 'coop', mode = coop ? '같이 ' + U.clamp(num(h.pc) | 0, 2, 4) + '인' : '혼자';
      const stats = [['레벨', num(h.lv) | 0], ['처치', U.fmtNum(num(h.kills))], ['시간', U.fmtTime(num(h.time))], ['보스', num(h.boss) | 0], ['엘리트', num(h.elite) | 0],
        ['최대 연속', num(h.combo) | 0], ['영혼 파편', '+' + (num(h.sh) | 0)]];
      if (!coop && num(h.dmg) > 0) stats.push(['준 피해', U.fmtNum(num(h.dmg))]);
      const cards = (Array.isArray(h.cards) ? h.cards : []).map((q) => {
        const d = Array.isArray(q) && UP.byId[q[0]];
        if (!d) return '';
        const lv = U.clamp(num(q[1]) | 0, 1, 99);
        return `<span class="rh-card r-${d.rarity}" title="${U.esc(UP.nameOf(d, { cls: c }))}${lv > 1 ? ' ' + lv + '단계' : ''}">${G.Icons.svg(d.icon)}${lv > 1 ? `<b>${lv}</b>` : ''}</span>`;
      }).join('');
      const team = coop && Array.isArray(h.team) ? h.team.filter(Array.isArray).map((q) => `<span>${U.esc(U.clean(q[0], 12) || '동료')} <small>${G.Classes.get(q[1]).name}</small></span>`).join('') : '';
      return `<li class="rh-item" style="--cc:${c.css}">` +
        `<div class="rh-main"><span class="rh-res ${res[1]}">${res[0]}</span>` +
        `<span class="rh-char"><i>${G.Icons.svg(c.emblem)}</i><b>${c.name}</b></span>` +
        `<span class="rh-meta"><em class="d-${dk}">${Gm.DIFFS[dk].name}</em> · ${mode}</span>` +
        `<span class="rh-stage">${h.res === 'win' && wave > 15 ? '무한 ' : ''}<b>${wave}</b>스테이지</span>` +
        `<span class="rh-score"><b>${U.fmtNum(num(h.score))}</b>점${h.best ? '<i class="rh-best">최고</i>' : ''}</span>` +
        `<span class="rh-when">${when(h.at)}</span><span class="rh-arrow"></span></div>` +
        `<div class="rh-more"><div class="rh-stats">${stats.map((s) => `<span><small>${s[0]}</small><b>${s[1]}</b></span>`).join('')}</div>` +
        `<div class="rh-sub">고른 카드</div><div class="rh-cards">${cards || '<span class="muted small">카드 없음</span>'}</div>` +
        (team ? `<div class="rh-sub">함께한 동료</div><div class="rh-team">${team}</div>` : '') + '</div></li>';
    }).join('');
    return `<ul class="rec-hist">${items}</ul><p class="muted small">최근 40판까지 남아요. 줄을 누르면 고른 카드와 자세한 기록이 보여요.</p>`;
  }

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
  let viewKey = null; // what the skill bar last showed (the druid's form, the bard's song)
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
    const ultMax = (P.cls.ultDur || G.Hero.ULT_TIME) + (s.avatar ? 2 : 0), un = P.cls.ult.name;
    E['ult-fill'].style.width = (P.ultT > 0 ? P.ultT / ultMax : P.ult / 100) * 100 + '%';
    E['ult-fill'].classList.toggle('ready', P.ult >= 100);
    E['ult-text'].textContent = P.ultT > 0 ? un : P.ult >= 100 ? un + ' · R' : un + ' ' + Math.floor(P.ult) + '%';
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

    // the three skills: cooldown, and a bar while one is charged or held
    ['rmb', 'q', 'e'].forEach((k, j) => {
      const i = j + 1, sk = P.cls.skills[j], charging = P.charging && P.chgSlot === i, chan = P.chan === i;
      setCd(k, P.cd['s' + i], charging || chan);
      const bar = E.ab[k].charge;
      if (bar) bar.style.width = (charging ? P.lanceCharge * 100 : chan ? (1 - P.chanT / (sk.max || 3)) * 100 : 0) + '%';
    });
    const lm = E.ab.lmb;
    lm.el.classList.toggle('active', m.left && P.alive);
    // a skill bar that changes with the character's state (the druid's form, the bard's song)
    if (P.cls.viewKey && P.cls.viewKey(P) !== viewKey) { UI.setHero(P); G.Touch.setHero(P); }
    // the gunslinger's six rounds, and a reload; souls and momentum
    const res = P.cls.resource;
    if (P.cls.ammo) {
      if (lm.pips.children.length !== P.cls.ammo) { lm.pips.innerHTML = '<i></i>'.repeat(P.cls.ammo); lm.pips.classList.remove('res'); }
      [...lm.pips.children].forEach((p, i) => p.classList.toggle('on', i < P.ammo));
      lm.txt.textContent = P.reloadT > 0 ? P.reloadT.toFixed(1) : '';
      lm.cd.style.setProperty('--cd', P.reloadT > 0 ? 1 : 0);
    } else if (res) {
      if (lm.pips.children.length !== res.max) { lm.pips.innerHTML = '<i></i>'.repeat(res.max); lm.pips.classList.add('res'); lm.el.title = P.cls.basic.name + ' · ' + res.name; }
      const n = Math.round(P.res || 0);
      [...lm.pips.children].forEach((p, i) => p.classList.toggle('on', i < n));
      lm.txt.textContent = n > 0 ? String(n) : '';
    } else if (lm.pips.childElementCount) { lm.pips.innerHTML = ''; lm.pips.classList.remove('res'); lm.txt.textContent = ''; lm.cd.style.setProperty('--cd', 0); }
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
    const showWait = mp && !Gm.picksPending() && waiting.length > 0;
    E.pickwait.classList.toggle('hidden', !showWait);
    if (showWait) E.pickwait.textContent = '카드 고르는 중 (보호막) · ' + waiting.join(', ');
    // co-op card screen: the fight goes on, so the choice has a clock and the chooser a shield
    if (mp && UI.current === 'levelup' && UI.cards) {
      const left = Math.max(0, COOP_PICK_S - (performance.now() - UI.cardsAt) / 1000);
      E['levelup-wait'].textContent = '게임은 계속됩니다 · 고르는 동안은 보호막 · ' + Math.ceil(left) + '초 뒤 자동 선택';
      if (left <= 0) UI.pickCard(Math.floor(Math.random() * UI.cards.length));
    } else E['levelup-wait'].textContent = '';

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

  // a skill card shows the skill of the character holding it (the pyromancer's flame, not a lance)
  const SKILL_CARD = { lance: 0, glacial: 1, meteor: 2 };
  const cardIcon = (d, P) => (P && P.cls && SKILL_CARD[d.id] != null ? P.cls.skills[SKILL_CARD[d.id]].icon : d.icon);
  UI.renderUpgradeList = function () {
    const P = G.Player, UP = G.Upgrades;
    const html = P ? P.up.order.map((id) => {
      const d = UP.byId[id];
      return `<div class="upg r-${d.rarity}" title="${U.esc(G.Upgrades.nameOf(d, P))}">${G.Icons.svg(cardIcon(d, P))}<b>${P.up.levels[id]}</b></div>`;
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
    UI.cardsAt = performance.now();
    UI.armAt = UI.cardsAt + ARM_MS;
    $('screen-levelup').classList.toggle('coop', G.Game.mode !== 'solo');
    UI.downIdx = -1;
    $('levelup-title').textContent = opts.title || '레벨 업';
    $('levelup-sub').textContent = opts.sub || '카드 한 장을 고르세요';
    const P = G.Player, UP = G.Upgrades, cid = P.cls.id;
    // every character draws its cards in its own glass
    E['levelup-cards'].innerHTML = cards.map((d, i) => {
      const lv = UP.level(P, d.id), fb = d.id[0] === '_';
      const lvTxt = fb ? '' : lv === 0 ? '처음 얻는 카드' : `${lv} → ${lv + 1}단계 · 최대 ${d.max}`;
      return `<div class="card arming r-${d.rarity}" data-i="${i}" data-cls="${cid}" style="--cc:${P.cls.css}">
        <svg class="card-art" viewBox="0 0 230 340" preserveAspectRatio="none" aria-hidden="true">${G.Icons.window(cid, { side: true, rim: true })}</svg>
        <div class="c-medal">${G.Icons.svg(cardIcon(d, P))}</div>
        <div class="c-key">${i + 1}</div>
        <div class="c-plate"><div class="c-rarity">${UP.RARITY[d.rarity].kr}</div><div class="c-name">${UP.nameOf(d, P)}</div><div class="c-desc">${UP.descOf(d, lv + 1, P)}</div><div class="c-level">${lvTxt}</div></div>
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
    $('go-sub').textContent = o.victory ? '15스테이지를 끝까지 버텼습니다' : '스테이지 ' + o.wave + (o.coop ? '에서 모두 쓰러졌습니다' : '에서 쓰러졌습니다');
    const st = o.stats;
    const rows = [['캐릭터', o.cls ? o.cls.name : '파편술사'], ['난이도', o.diff ? o.diff.name : '보통'], ['점수', U.fmtNum(o.score)], ['스테이지', o.wave], ['레벨', o.level], ['시간', U.fmtTime(o.time)],
      ['처치', U.fmtNum(st.kills)], ['최대 연속 처치', st.maxCombo], ['엘리트', st.elites], ['보스', st.bosses]];
    if (!o.coop) rows.splice(8, 0, ['준 피해', U.fmtNum(st.damage)], ['받은 피해', U.fmtNum(st.taken)]);
    // what this run did for the records book
    const marks = [];
    if (o.newBest) marks.push('최고 점수 갱신');
    if (o.cls && o.clsBest) marks.push(o.cls.name + (o.clsBest === 'first' ? ' 첫 기록' : o.clsBest === 'wave' ? ' 최고 스테이지 갱신' : ' 최고 점수 갱신'));
    $('go-stats').innerHTML = (marks.length ? `<div class="new-best">${marks.join(' · ')}</div>` : '') + rows.map((r) => `<div><span>${r[0]}</span><b>${r[1]}</b></div>`).join('');
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

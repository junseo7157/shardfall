// ============================================================
// SHARDFALL - net: co-op built on one small "room" API that only uses presence:
//   every player publishes their own hero (position, aim, buttons, card picks)
//   the host simulates the world and also publishes a compact world snapshot + event log
// Three rooms speak that API:
//   on claude.ai          the artifact platform's `room` capability (signed-in, invited viewers)
//   on any other website  peer-to-peer WebRTC through PeerJS, so a plain link is enough
//   on localhost          a BroadcastChannel mock for two-tab tests (add ?p2p to test WebRTC)
// ============================================================
(() => {
  const G = window.G, U = G.U;
  const PROTO = 'sf11', TAU = Math.PI * 2, MAX_PLAYERS = 4, EV_MAX = 44, BYTE_CAP = 3900;
  // positions travel as 12 bits: ±81.9 m in 4 cm steps, enough for the widest (4-player) island
  const POS_O = 81.9, POS_K = 25;
  const enc = new TextEncoder();
  const N = (G.Net = {
    mode: 'solo', status: 'off', room: null, nr: null, code: '', role: null, me: null, hostPeer: null,
    roster: [], phase: 'none', peers: [], name: '', color: 0, reason: '', connected: true,
    seq: 0, evBuf: [], teleId: 0, teles: new Map(), lastSeq: -1, snaps: [], offs: [], off: 0, curB: null,
    runId: 0, seenRun: -1, sendT: 0, mock: false, unsubs: [],
    diff: 'normal', hostDiff: 'normal',
  });
  const DIFF_KEYS = ['easy', 'normal', 'hard', 'hell'];
  const validDiff = (k) => (DIFF_KEYS.includes(k) ? k : 'normal');

  // ---------------- setup ----------------
  N.init = function () {
    N.name = U.clean(G.Settings.nick, 12) || '모험가' + U.randInt(10, 99);
    N.color = U.clamp(G.Settings.color | 0, 0, 3);
    N.diff = validDiff(G.Settings.diff);
    const m = /^#?([a-z0-9]{4,8})$/.exec(location.hash || '');
    N.pendingCode = m ? m[1] : '';
    if (window.claude && typeof window.claude.use === 'function') {
      N.status = 'connecting';
      Promise.resolve(window.claude.use('room')).then((r) => {
        N.room = r || null;
        N.status = r ? 'ready' : 'unavailable';
        G.Events.emit('net');
      }).catch(() => { N.status = 'unavailable'; G.Events.emit('net'); });
    } else if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && !/[?&]p2p\b/.test(location.search)) {
      N.room = mockRoom();
      N.mock = true;
      N.status = 'ready';
    } else {
      N.p2p = true;
      N.status = 'connecting';
      loadPeerJS().then((Peer) => {
        N.room = p2pRoom(Peer);
        N.status = 'ready';
        G.Events.emit('net');
      }).catch(() => {
        N.status = 'unavailable';
        N.offNote = '같이 하기 연결 도구를 불러오지 못했어요. 인터넷 연결을 확인하고 새로고침해 주세요.';
        G.Events.emit('net');
      });
    }
  };
  // the link that drops a friend straight into this room (only where the page's own address is shareable)
  N.inviteLink = () => (N.p2p && N.code ? location.href.split('#')[0] + '#' + N.code : '');
  N.available = () => !!N.room;
  N.setIdentity = function (name, color) {
    N.name = U.clean(name, 12) || N.name;
    N.color = U.clamp(color | 0, 0, 3);
    G.Settings.nick = N.name;
    G.Settings.color = N.color;
    G.saveSettings();
  };
  const randomCode = () => Array.from({ length: 5 }, () => 'abcdefghjkmnpqrstuvwxyz23456789'[Math.floor(Math.random() * 31)]).join('');
  const valid = (p) => p && p.kind === 'viewer' && p.presence && p.presence.g === PROTO;

  N.createRoom = () => enterRoom(randomCode(), 'host');
  N.joinRoom = (code) => {
    code = String(code || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
    if (code.length < 4) { N.reason = '방 코드를 확인해 주세요'; G.Events.emit('net'); return Promise.resolve(false); }
    return enterRoom(code, 'guest');
  };
  async function enterRoom(code, role, tries = 0) {
    if (!N.room) return false;
    await N.leaveRoom(true);
    N.code = code; N.role = role; N.reason = ''; N.status = 'joining';
    N.phase = role === 'host' ? 'lobby' : 'none';
    N.roster = []; N.hostPeer = null; N.hostSeen = false; N.me = null;
    N.lastSeq = -1; N.snaps = []; N.offs = []; N.evBuf = []; N.seenRun = -1;
    G.Events.emit('net');
    try {
      // peer-to-peer: the host's tab becomes the room itself, guests dial it
      N.nr = await (N.p2p ? N.room.join('sf-' + code, { hub: role === 'host' }) : N.room.join('sf-' + code));
    } catch (e) {
      const why = e && e.code;
      // someone already holds this code: a host just takes a fresh one
      if (why === 'taken' && role === 'host' && tries < 3) return enterRoom(randomCode(), 'host', tries + 1);
      N.status = 'ready';
      N.code = '';
      N.reason = why === 'not_permitted' ? '이 화면에서는 같이 하기를 쓸 수 없어요 (로그인과 공유 초대가 필요해요)'
        : why === 'network' ? '연결 서버에 닿지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요'
          : why === 'unsupported' ? '이 브라우저는 같이 하기(WebRTC)를 지원하지 않아요. 크롬이나 엣지, 사파리 최신 버전으로 열어 주세요'
            : '방에 들어가지 못했어요. 잠시 뒤 다시 시도해 주세요';
      G.Events.emit('net');
      return false;
    }
    const onErr = (e) => { if (e && (e.code === 'revoked' || e.code === 'not_granted')) { N.reason = '연결이 끊겼어요'; N.leaveRoom(); } };
    N.unsubs = [N.nr.onPeers(onPeers, onErr), N.nr.onConnection((c) => { N.connected = c; G.Events.emit('net'); }, onErr)];
    N.status = 'inroom';
    N.joinAt = performance.now();
    try { location.hash = code; } catch (e) { /* sandboxed */ }
    publish();
    G.Events.emit('net');
    return true;
  }
  N.leaveRoom = async function (quiet) {
    for (const u of N.unsubs) { try { u(); } catch (e) { /* ignore */ } }
    N.unsubs = [];
    const nr = N.nr;
    N.nr = null;
    if (nr) { try { await nr.leave(); } catch (e) { /* ignore */ } }
    N.role = null; N.code = ''; N.roster = []; N.phase = 'none'; N.hostPeer = null;
    if (N.status === 'inroom' || N.status === 'joining') N.status = N.room ? 'ready' : 'unavailable';
    if (!quiet) { try { if (location.hash) location.hash = ''; } catch (e) { /* ignore */ } G.Events.emit('net'); }
  };

  // ---------------- roster ----------------
  function onPeers(ch) {
    N.peers = ch.peers || [];
    for (const p of N.peers) if (p.isMe && p.sameTab) N.me = p.peer;
    if (N.role === 'host') hostRoster();
    else if (N.role === 'guest') {
      const hp = N.peers.find((p) => valid(p) && p.presence.rl === 'h');
      if (hp) { if (!N.hostSeen) N.hostSeenAt = performance.now(); N.hostPeer = hp.peer; N.hostSeen = true; }
      else if (N.hostSeen) { N.hostSeen = false; G.Game.netEnded('방장이 방을 나갔어요'); }
    }
    G.Events.emit('net');
  }
  function hostRoster() {
    if (!N.me) return;
    const live = new Set(N.peers.filter(valid).map((p) => p.peer));
    const before = N.roster.slice();
    N.roster = N.roster.filter((k) => k === N.me || live.has(k));
    if (!N.roster.includes(N.me)) N.roster.unshift(N.me);
    if (N.phase === 'lobby') {
      for (const p of N.peers) {
        if (N.roster.length >= MAX_PLAYERS) break;
        if (valid(p) && !p.isMe && p.presence.rl === 'g' && !N.roster.includes(p.peer)) N.roster.push(p.peer);
      }
    }
    for (const k of before) if (!N.roster.includes(k)) G.Game.netPlayerLeft(k);
  }
  N.lobbyList = function () {
    const byPeer = new Map(N.peers.map((p) => [p.peer, p]));
    if (N.role === 'host' && N.phase === 'lobby') assignClasses();
    return N.roster.map((k, i) => {
      const p = byPeer.get(k), pr = (p && p.presence) || {};
      const me = k === N.me;
      return { key: k, me, host: i === 0, name: me ? N.name : U.clean(pr.nm, 12) || '모험가', color: me ? N.color : U.clamp(U.num(pr.cl, 0) | 0, 0, 3), forge: me ? G.Upgrades.forgeCode() : String(pr.fg || '').replace(/[^0-9]/g, '').slice(0, 11), cls: N.classOf(k) };
    });
  };

  // ---------------- characters: one each, no two alike ----------------
  // Everyone says which character they want (presence 'ch'); the host settles it in roster order
  // (the host first, then whoever came in earlier) and publishes the result (w.cl) for all to follow.
  N.cls = G.Classes.valid(G.Settings.coopClass) ? G.Settings.coopClass : 'shard';
  N.assigned = new Map();
  function assignClasses() {
    const byPeer = new Map(N.peers.map((p) => [p.peer, p])), taken = new Set();
    N.assigned = new Map();
    for (const k of N.roster) {
      const pr = k === N.me ? null : byPeer.get(k) && byPeer.get(k).presence;
      let want = k === N.me ? N.cls : pr && pr.ch;
      if (!G.Classes.valid(want) || taken.has(want)) want = G.Classes.order.find((c) => !taken.has(c)) || 'shard';
      taken.add(want);
      N.assigned.set(k, want);
    }
    return N.roster.map((k) => N.assigned.get(k));
  }
  N.classOf = (k) => N.assigned.get(k) || (k === N.me ? N.cls : 'shard');
  // who already holds a character (another player's key), or null
  N.classTaker = (id) => { for (const [k, c] of N.assigned) if (c === id && k !== N.me) return k; return null; };
  N.setClass = function (id) {
    if (!G.Classes.valid(id) || N.classTaker(id)) return false;
    N.cls = id;
    N.clsAt = performance.now();
    G.Settings.coopClass = id;
    G.saveSettings();
    if (N.role === 'host') assignClasses();
    else N.assigned.set(N.me, id); // shown at once; the host's answer confirms it
    G.Events.emit('net');
    return true;
  };
  N.waiting = function () {
    if (N.role !== 'guest') return '';
    if (!N.hostSeen) return performance.now() - (N.joinAt || 0) > 7000 ? '방을 찾지 못했어요. 코드가 맞는지, 방장이 방을 열어 두었는지 확인해 주세요' : '방장을 찾는 중...';
    if (N.me && !N.roster.includes(N.me)) {
      if (N.phase === 'play') return '게임이 진행 중이에요. 이번 판이 끝나면 들어갈 수 있어요';
      // the host's roster takes a moment to list a newcomer
      return performance.now() - (N.hostSeenAt || 0) < 3000 ? '방에 들어가는 중...' : '방이 가득 찼어요 (최대 4명)';
    }
    return '';
  };
  N.isHost = () => N.role === 'host';
  N.inRoom = () => !!N.nr;
  N.setPhase = function (ph) { N.phase = ph; if (ph === 'lobby') hostRoster(); G.Events.emit('net'); };
  // the host picks the difficulty in the lobby; guests just see it
  N.setDiff = function (k) {
    if (!N.isHost()) return;
    N.diff = validDiff(k);
    G.Settings.diff = N.diff;
    G.saveSettings();
    G.Events.emit('net');
  };
  N.roomDiff = () => (N.role === 'guest' ? N.hostDiff : N.diff);

  // ---------------- events (host → clients) ----------------
  const CRIT = new Set(['banner', 'toast', 'bossBar', 'meteor', 'ultStart', 'phoenix', 'heroDie', 'chestOpen', 'warp', 'clearShots', 'bigSlam', 'bossFinal', 'lance', 'nova', 'slam', 'obBreak', 'obGrow',
    'ultFx', 'sumEnd', 'cdReset', 'gdDome', 'enTitan', 'chStop', 'chHaste', 'gsYank', 'zoneFx',
    'shCrystal', 'gdFort', 'rgEagle', 'rgTalon', 'pyPhoenix', 'clAngel', 'bzWind', 'bzCleave', 'enOrbital', 'asStar', 'gsCoins', 'gsRico',
    'nkGate', 'nkSkel', 'nkMove', 'gvHole', 'drTree', 'bmTriple', 'bmParry', 'bdSym', 'bdBell']);
  function pushEv(e, critical) {
    N.seq++;
    e.unshift(N.seq);
    e.crit = !!critical;
    N.evBuf.push(e);
    if (N.evBuf.length > EV_MAX) {
      const i = N.evBuf.findIndex((q) => !q.crit);
      N.evBuf.splice(i >= 0 ? i : 0, 1);
    }
  }
  N.vis = function (name, ...args) {
    const fn = G.Vis[name];
    if (fn) { try { fn(...args); } catch (err) { console.warn('vis', name, err); } }
    if (N.mode === 'host') pushEv(['v', name, ...args], CRIT.has(name));
  };
  N.visBy = function (key, name, ...args) {
    const fn = G.Vis[name];
    if (fn) { try { fn(...args); } catch (err) { console.warn('vis', name, err); } }
    if (N.mode === 'host') pushEv(['w', key, name, ...args], true);
  };
  N.pattern = function (kind, p) { if (N.mode === 'host') pushEv(['p', kind, p], true); };
  N.tele = function (o) {
    const h = G.FX.telegraph(o);
    if (N.mode !== 'host') return h;
    const id = (N.teleId = (N.teleId + 1) % 100000);
    pushEv(['t', id, { s: o.shape === 'rect' ? 1 : 0, x: U.r1(o.x), z: U.r1(o.z), r: U.r1(o.r || 0), a: U.r2(o.angle || 0), l: U.r1(o.length || 0), w: U.r1(o.width || 0), d: U.r2(o.dur || 1), c: o.color == null ? 0xff3344 : o.color, h: o.hold ? 1 : 0, k: o.k || 0 }], true);
    return { kill() { h.kill(); pushEv(['k', id], true); }, set: (x, z) => h.set(x, z), get progress() { return h.progress; } };
  };

  // untrusted values from other players: numbers clamped, strings cleaned, nothing else
  const cleanVal = (v, depth = 0) => {
    if (typeof v === 'number') return Number.isFinite(v) ? U.clamp(v, -1e6, 1e6) : 0;
    if (typeof v === 'string') return U.clean(v, 90);
    if (typeof v === 'boolean') return v;
    if (Array.isArray(v) && depth < 3) return v.slice(0, 40).map((q) => cleanVal(q, depth + 1));
    if (v && typeof v === 'object' && depth < 2) { const o = {}; for (const k of Object.keys(v).slice(0, 24)) if (/^[a-z0-9]{1,4}$/i.test(k)) o[k] = cleanVal(v[k], depth + 1); return o; }
    return 0;
  };
  function runEvent(e) {
    const type = e[1];
    if (type === 'v' || type === 'w') {
      let i = 2;
      if (type === 'w') { if (e[2] === N.me) return; i = 3; }
      const name = String(e[i]);
      if (!Object.prototype.hasOwnProperty.call(G.Vis, name) || name === 'update' || name === 'clear') return;
      G.Vis[name](...e.slice(i + 1).map((q) => cleanVal(q)));
    } else if (type === 't') {
      const o = cleanVal(e[3]);
      const h = G.FX.telegraph({ shape: o.s ? 'rect' : 'circle', x: o.x, z: o.z, r: U.clamp(o.r, 0, 40), angle: o.a, length: U.clamp(o.l, 0, 80), width: U.clamp(o.w, 0, 20), dur: U.clamp(o.d, 0.05, 10), color: o.c, hold: !!o.h, k: o.k || 1.6 });
      N.teles.set(e[2], h);
      if (N.teles.size > 60) N.teles.delete(N.teles.keys().next().value);
    } else if (type === 'k') {
      const h = N.teles.get(e[2]);
      if (h) { h.kill(); N.teles.delete(e[2]); }
    } else if (type === 'p') {
      G.Patterns.start(String(e[2]), cleanVal(e[3]), true);
    }
  }
  function processEvents(list) {
    if (!Array.isArray(list)) return;
    let maxSeq = N.lastSeq;
    for (const e of list) {
      if (!Array.isArray(e) || typeof e[0] !== 'number') continue;
      if (N.lastSeq < 0 || e[0] <= N.lastSeq) { maxSeq = Math.max(maxSeq, e[0]); continue; }
      try { runEvent(e); } catch (err) { console.warn('net event', err); }
      maxSeq = Math.max(maxSeq, e[0]);
    }
    if (N.lastSeq < 0) maxSeq = list.reduce((m, e) => Math.max(m, Array.isArray(e) ? +e[0] || 0 : 0), 0);
    N.lastSeq = maxSeq;
  }

  // ---------------- world snapshot ----------------
  function packEnemies() {
    const E = G.Enemies, out = [];
    let s = '';
    for (const e of E.list) {
      if (!e.alive) continue;
      const ti = Math.max(0, E.TYPE_KEYS.indexOf(e.type)) & 15, af = Math.max(0, E.AFFIX_KEYS.indexOf(e.affix));
      const fl = (e.spawnT > 0 ? 1 : 0) | (e.freeze > 0 ? 2 : 0) | (e.burn > 0 ? 4 : 0) | (e.slowK > 0 ? 8 : 0) | (e.lunge > 0.5 ? 16 : 0) | (e.critT > 0 ? 32 : 0);
      const f = Math.round((((e.facing % TAU) + TAU) % TAU) / TAU * 63);
      const st = (Math.max(0, E.STATE_KEYS.indexOf(e.state)) & 15) | (e.elite ? 16 : 0);
      // id(2) type+affix(1) x(2) z(2) facing(1) hp(2) flags(1) state+elite(1)
      s += U.enc(e.id, 2) + U.enc(ti | (af << 4), 1) + U.enc(U.clamp((e.x + POS_O) * POS_K, 0, 4095), 2) + U.enc(U.clamp((e.z + POS_O) * POS_K, 0, 4095), 2)
        + U.enc(f, 1) + U.enc(Math.round(U.clamp(e.hp / e.maxHp, 0, 1) * 4095), 2) + U.enc(fl, 1) + U.enc(st, 1);
      if (s.length >= 960) { out.push(s); s = ''; }
    }
    if (s) out.push(s);
    return out;
  }
  function unpackEnemies(arr) {
    const out = [];
    if (!Array.isArray(arr)) return out;
    for (const s of arr.slice(0, 3)) {
      if (typeof s !== 'string') continue;
      for (let i = 0; i + 12 <= s.length; i += 12) {
        const tf = U.dec(s, i + 2, 1), sf = U.dec(s, i + 11, 1);
        out.push({ id: U.dec(s, i, 2), ti: tf & 15, el: !!(sf & 16), af: (tf >> 4) & 3, x: U.dec(s, i + 3, 2) / POS_K - POS_O, z: U.dec(s, i + 5, 2) / POS_K - POS_O,
          f: (U.dec(s, i + 7, 1) / 63) * TAU, hp: U.dec(s, i + 8, 2) / 4095, fl: U.dec(s, i + 10, 1), st: sf & 15 });
      }
    }
    return out;
  }
  function buildWorld() {
    const w = { ht: Math.round(performance.now()), ph: N.phase, rs: N.roster.slice(), rid: N.runId, df: N.diff };
    // characters are settled in the lobby and stay fixed for the run
    w.cl = N.phase === 'lobby' ? assignClasses() : N.roster.map((k) => N.classOf(k));
    if (N.phase === 'lobby' || N.mode !== 'host') return w;
    Object.assign(w, G.Game.netInfo());
    w.h = N.roster.map((k) => {
      const h = G.Heroes.get(k);
      return h ? [Math.round(h.hp), Math.round(h.stats.maxHp), h.alive ? 1 : 0, Math.round(h.ult), U.r1(Math.max(0, h.ultT)), h.rv, Math.round(h.shieldHp || 0), h.rvh || 0, Math.round(h.res || 0)] : 0;
    });
    w.e = packEnemies();
    w.ob = G.World.brokenCode();
    w.b = G.Bosses.netState();
    w.o = G.Pickups.netOrbs();
    w.c = G.Pickups.netChests();
    w.ev = N.evBuf.map((e) => e.slice());
    return w;
  }
  const bytes = (o) => enc.encode(JSON.stringify(o)).length;
  function publish() {
    if (!N.nr) return;
    const P = G.Player;
    const o = { g: PROTO, rl: N.role === 'host' ? 'h' : 'g', nm: N.name, cl: N.color, fg: G.Upgrades.forgeCode(), ch: N.cls };
    // the hero's state carries the run it belongs to, so a leftover from the last run is never replayed
    if (N.mode !== 'solo' && P && G.Game.inRun()) { o.p = P.netState(); o.up = P.picks; o.pr = G.Game.picksDone; o.ri = N.role === 'host' ? N.runId : N.seenRun; }
    else { o.p = null; o.up = null; o.pr = null; o.ri = null; }
    if (N.role === 'host') {
      const w = buildWorld();
      o.w = w;
      let n = bytes(o);
      // keep under the platform's 4 KiB presence limit: drop cosmetic events first, then everything old
      while (n > BYTE_CAP && w.ev && w.ev.length) {
        let i = w.ev.findIndex((e) => e[1] === 'v' && !CRIT.has(e[2]));
        if (i < 0) i = 0;
        w.ev.splice(i, 1);
        n = bytes(o);
      }
      if (n > BYTE_CAP) { w.o = ''; w.c = []; }
    }
    N.nr.presence(o).catch((e) => { if (e && e.code === 'invalid_argument') console.warn('presence too large', e.message); });
  }

  // ---------------- per frame ----------------
  N.update = function (dt) {
    if (!N.nr) return;
    N.sendT -= dt;
    if (N.sendT <= 0) { N.sendT = N.role === 'host' ? 0.05 : 0.033; publish(); }
    readPeers();
    if (N.role === 'guest') readHost();
  };
  function readPeers() {
    const peers = N.nr.peers();
    for (const p of peers) {
      if (p.peer === N.me || !valid(p)) continue;
      const h = G.Heroes.get(p.peer);
      if (!h) continue;
      const pr = p.presence;
      const rid = N.role === 'host' ? N.runId : N.seenRun;
      if (pr.p && pr.p !== h.lastNetP && U.num(pr.ri, -1) === rid) { h.lastNetP = pr.p; h.applyNet(pr.p); }
      if (typeof pr.up === 'string' && pr.up !== h.lastUp) { h.lastUp = pr.up; h.syncPicks(pr.up); }
      h.netPr = U.num(pr.pr, 0, 0, 999) | 0;
      h.name = U.clean(pr.nm, 12) || h.name;
    }
  }
  function readHost() {
    const peers = N.nr.peers();
    const hp = peers.find((p) => p.peer === N.hostPeer && valid(p)) || peers.find((p) => valid(p) && p.presence.rl === 'h');
    if (!hp) return;
    const w = hp.presence.w;
    if (!w || w === N.lastW || typeof w !== 'object') return;
    N.lastW = w;
    if (Array.isArray(w.rs)) N.roster = w.rs.filter((s) => typeof s === 'string').slice(0, MAX_PLAYERS);
    // the host's word on who plays which character; if someone beat me to mine, take what I was given
    if (Array.isArray(w.cl)) {
      const before = N.classOf(N.me);
      N.assigned = new Map(N.roster.map((k, i) => [k, G.Classes.valid(w.cl[i]) ? w.cl[i] : 'shard']));
      const mine = N.assigned.get(N.me);
      if (mine && mine !== N.cls) {
        if (performance.now() - (N.clsAt || 0) > 1500) N.cls = mine;
        else N.assigned.set(N.me, N.cls); // my click is still on its way to the host
      }
      if (N.classOf(N.me) !== before) G.Events.emit('net');
    }
    const df = validDiff(w.df);
    if (df !== N.hostDiff) { N.hostDiff = df; G.Events.emit('net'); }
    const ph = ['lobby', 'play', 'over', 'win'].includes(w.ph) ? w.ph : 'lobby';
    const rid = U.num(w.rid, 0) | 0;
    if (ph !== N.phase || (ph === 'play' && rid !== N.seenRun)) {
      N.phase = ph;
      const newRun = ph === 'play' && rid !== N.seenRun;
      if (newRun) { N.seenRun = rid; N.lastSeq = 0; N.snaps = []; N.offs = []; N.curB = null; }
      G.Game.onNetPhase(ph, newRun);
      G.Events.emit('net');
    }
    if (ph === 'lobby' || N.mode !== 'client') return;
    const now = performance.now(), ht = U.num(w.ht, 0);
    N.offs.push(ht - now);
    if (N.offs.length > 24) N.offs.shift();
    N.off = Math.max(...N.offs);
    N.snaps.push({ ht, w, ents: unpackEnemies(w.e), map: null });
    if (N.snaps.length > 24) N.snaps.shift();
    processEvents(w.ev);
    // broken props follow the newest snapshot (after its events, so the debris plays first)
    G.World.syncBroken(w.ob);
  }

  // client: draw the host's world at a slightly delayed, interpolated moment
  N.clientWorld = function (dt, t) {
    const snaps = N.snaps;
    if (!snaps.length) return;
    const rt = performance.now() + N.off - 110;
    let a = snaps[snaps.length - 1], b = a;
    if (rt <= snaps[0].ht) a = b = snaps[0];
    else for (let i = snaps.length - 1; i > 0; i--) if (snaps[i - 1].ht <= rt) { a = snaps[i - 1]; b = snaps[i]; break; }
    const k = b.ht > a.ht ? U.clamp((rt - a.ht) / (b.ht - a.ht), 0, 1) : 1;
    const fresh = b !== N.curB;
    N.curB = b;
    let ents = b.ents;
    if (a !== b) {
      if (!a.map) a.map = new Map(a.ents.map((e) => [e.id, e]));
      ents = b.ents.map((eb) => {
        const ea = a.map.get(eb.id);
        return ea ? { ...eb, x: U.lerp(ea.x, eb.x, k), z: U.lerp(ea.z, eb.z, k), f: ea.f + U.angleDiff(ea.f, eb.f) * k } : eb;
      });
    }
    G.Enemies.hpScale = U.num(b.w.hs, 1, 0.1, 100);
    G.Enemies.netApply(ents, dt, t, fresh);
    let bs = b.w.b;
    const ba = a.w.b;
    if (Array.isArray(bs) && Array.isArray(ba) && ba[0] === bs[0] && a !== b) {
      bs = bs.slice();
      for (const i of [1, 2, 3]) bs[i] = U.lerp(+ba[i] || 0, +bs[i] || 0, k);
      bs[4] = (+ba[4] || 0) + U.angleDiff(+ba[4] || 0, +bs[4] || 0) * k;
    }
    G.Bosses.netApply(bs, dt);
    if (fresh) G.Pickups.netApply(b.w.o, b.w.c);
    G.Game.applyNetInfo(b.w, fresh);
  };

  // ---------------- any other website: peer-to-peer WebRTC through PeerJS ----------------
  // The host's tab IS the room: it registers an id made from the room code on the free PeerJS
  // broker (which also lends a TURN relay for strict networks), guests dial that id, and the host
  // passes every presence on to everyone else. Each message is a whole presence, so a skipped
  // one costs nothing, just like the platform's presence.
  const PEERJS_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
  function loadPeerJS() {
    const get = () => window.Peer || (window.peerjs && window.peerjs.Peer);
    if (get()) return Promise.resolve(get());
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = PEERJS_URL;
      s.async = true;
      s.onload = () => (get() ? res(get()) : rej(new Error('PeerJS missing')));
      s.onerror = () => rej(new Error('PeerJS failed to load'));
      document.head.appendChild(s);
    });
  }
  function p2pRoom(Peer) {
    const STALE = 6000, RETRY = 2000, MAX_LINKS = 8, MAX_GUEST_MSG = 6000;
    const live = new Set();
    function open(name, hub) {
      const hubId = 'shardfall-' + PROTO + '-' + String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
      const r = { me: '', mine: {}, remote: new Map(), conns: new Map(), listeners: new Set(), connFns: new Set(), peer: null,
        dirty: true, frozen: null, delivered: null, timer: null, last: 0, closed: false, online: false, redialT: null, pendingLost: null };
      const setOnline = (v) => { if (r.online === v) return; r.online = v; for (const fn of r.connFns) fn(v); };
      const sendTo = (c, m) => {
        // a player who can't keep up skips frames instead of falling seconds behind
        if (!c.open || (c.bufferSize || 0) > 4 || (c.dataChannel && c.dataChannel.bufferedAmount > 262144)) return;
        try { c.send(m); } catch (e) { /* closing */ }
      };
      const fanOut = (m, except) => { for (const [id, c] of r.conns) if (id !== except) sendTo(c, m); };
      r.flush = () => {
        clearTimeout(r.timer);
        r.timer = null;
        r.last = performance.now();
        if (r.closed) return;
        if (hub) fanOut({ t: 'p', id: r.me, p: r.mine });
        else { const c = r.conns.get(hubId); if (c) sendTo(c, { t: 'p', p: r.mine }); }
      };
      const queue = () => { if (!r.timer && !r.closed) r.timer = setTimeout(r.flush, Math.max(0, 33 - (performance.now() - r.last))); };
      const isObj = (p) => !!p && typeof p === 'object' && !Array.isArray(p);
      const remember = (id, p) => { r.remote.set(id, { presence: Object.freeze(p), at: Date.now() }); r.dirty = true; };
      const forget = (id) => { if (r.remote.delete(id)) r.dirty = true; };
      r.snapshot = () => {
        if (!r.dirty && r.frozen) return r.frozen;
        const list = [Object.freeze({ peer: r.me, by: null, isMe: true, sameTab: true, kind: 'viewer', guest: false, presence: Object.freeze({ ...r.mine }), updatedAt: Date.now() })];
        for (const [peer, v] of r.remote) list.push(Object.freeze({ peer, by: null, isMe: false, sameTab: false, kind: 'viewer', guest: false, presence: v.presence, updatedAt: v.at }));
        r.dirty = false;
        r.frozen = Object.freeze(list);
        return r.frozen;
      };
      r.prune = (now) => { for (const [k, v] of r.remote) if (now - v.at > STALE) forget(k); };

      // host: one link per guest
      function adopt(c) {
        const drop = () => {
          if (r.conns.get(c.peer) !== c) return;
          r.conns.delete(c.peer);
          forget(c.peer);
          fanOut({ t: 'bye', id: c.peer });
        };
        c.on('open', () => {
          if (r.closed || r.conns.size >= MAX_LINKS) { try { c.close(); } catch (e) { /* ignore */ } return; }
          r.conns.set(c.peer, c);
          // a newcomer hears everyone already here
          sendTo(c, { t: 'p', id: r.me, p: r.mine });
          for (const [id, v] of r.remote) if (id !== c.peer) sendTo(c, { t: 'p', id, p: v.presence });
        });
        c.on('data', (m) => {
          if (!m || m.t !== 'p' || !isObj(m.p) || r.conns.get(c.peer) !== c) return;
          if (JSON.stringify(m.p).length > MAX_GUEST_MSG) return;
          remember(c.peer, m.p);
          fanOut({ t: 'p', id: c.peer, p: m.p }, c.peer);
        });
        c.on('close', drop);
        c.on('error', drop);
      }
      // guest: the one link to the host, redialled until the host is there
      const redial = () => { if (!r.closed && !r.redialT) r.redialT = setTimeout(dial, RETRY); };
      function dial() {
        r.redialT = null;
        if (r.closed || !r.peer || r.peer.destroyed) return;
        if (r.peer.disconnected) { redial(); return; }
        const c = r.peer.connect(hubId, { reliable: true, serialization: 'json' });
        let opened = false, done = false;
        const lost = () => {
          clearTimeout(watchdog);
          if (done) return;
          done = true;
          if (r.pendingLost === lost) r.pendingLost = null;
          if (r.conns.get(hubId) === c) r.conns.delete(hubId);
          if (opened) for (const id of [...r.remote.keys()]) forget(id);
          try { c.close(); } catch (e) { /* ignore */ }
          redial();
        };
        const watchdog = setTimeout(() => { if (!opened) lost(); }, 9000);
        r.pendingLost = lost;
        c.on('open', () => {
          clearTimeout(watchdog);
          if (r.closed) { lost(); return; }
          opened = true;
          if (r.pendingLost === lost) r.pendingLost = null;
          r.conns.set(hubId, c);
          setOnline(true);
          sendTo(c, { t: 'p', p: r.mine });
        });
        c.on('data', (m) => {
          if (!m || typeof m.id !== 'string' || !m.id || m.id.length > 64 || m.id === r.me) return;
          if (m.t === 'p' && isObj(m.p)) remember(m.id, m.p);
          else if (m.t === 'bye') forget(m.id);
        });
        c.on('close', lost);
        c.on('error', lost);
      }
      function shut() {
        if (r.closed) return;
        r.closed = true;
        clearTimeout(r.timer);
        clearTimeout(r.redialT);
        live.delete(r);
        for (const c of r.conns.values()) { try { c.close(); } catch (e) { /* ignore */ } }
        r.conns.clear();
        try { if (r.peer) r.peer.destroy(); } catch (e) { /* ignore */ }
      }
      r.shut = shut;
      const api = {
        name,
        presence(patch) {
          const merged = { ...r.mine };
          for (const k in patch) { if (patch[k] === null) delete merged[k]; else merged[k] = patch[k]; }
          r.mine = merged;
          r.dirty = true;
          queue();
          return Promise.resolve();
        },
        peers: () => r.snapshot(),
        onPeers(fn) { r.listeners.add(fn); setTimeout(() => fn({ peers: r.snapshot(), joined: [], left: [], updated: [] }), 0); return () => r.listeners.delete(fn); },
        connected: () => r.online,
        onConnection(fn) { r.connFns.add(fn); setTimeout(() => fn(r.online), 0); return () => r.connFns.delete(fn); },
        emit: () => Promise.resolve(),
        on: () => () => {},
        leave() { shut(); return Promise.resolve(); },
      };
      return new Promise((resolve, reject) => {
        let settled = false;
        const fail = (code) => { if (settled) return; settled = true; clearTimeout(giveUp); shut(); reject({ code }); };
        const giveUp = setTimeout(() => fail('network'), 15000);
        let peer;
        try { peer = hub ? new Peer(hubId, { debug: 0 }) : new Peer({ debug: 0 }); } catch (e) { fail('unsupported'); return; }
        r.peer = peer;
        peer.on('open', (id) => {
          if (r.closed) return;
          r.me = id;
          r.dirty = true;
          setOnline(true);
          if (!settled) { settled = true; clearTimeout(giveUp); live.add(r); resolve(api); }
          if (!hub && !r.conns.has(hubId) && !r.pendingLost && !r.redialT) dial();
        });
        if (hub) peer.on('connection', adopt);
        // the broker dropped (players' links stay up): quietly reconnect for anyone still to join
        peer.on('disconnected', () => {
          if (r.closed || !settled) return;
          if (!hub && !r.conns.has(hubId)) setOnline(false);
          setTimeout(() => { if (!r.closed && !peer.destroyed && peer.disconnected) { try { peer.reconnect(); } catch (e) { /* retry next drop */ } } }, 1500);
        });
        peer.on('error', (err) => {
          const t = err && err.type;
          if (t === 'unavailable-id') { fail('taken'); return; }
          if (t === 'peer-unavailable') { if (r.pendingLost) r.pendingLost(); return; }
          if (t === 'browser-incompatible') { fail('unsupported'); return; }
          if (!settled) fail('network');
        });
      });
    }
    setInterval(() => {
      const now = Date.now();
      for (const r of live) {
        r.prune(now);
        const snap = r.snapshot();
        if (snap !== r.delivered) { r.delivered = snap; for (const fn of r.listeners) fn({ peers: snap, joined: [], left: [], updated: [] }); }
      }
    }, 33);
    // a heartbeat, so a player whose tab is in the background doesn't look gone
    setInterval(() => { for (const r of live) r.flush(); }, 1000);
    addEventListener('pagehide', () => { for (const r of [...live]) r.shut(); });
    return { join: (name, o) => open(name, !!(o && o.hub)) };
  }

  // ---------------- localhost mock of the room capability ----------------
  function mockRoom() {
    const me = 'm' + Math.random().toString(36).slice(2, 12);
    const bc = new BroadcastChannel('sf-mock-room-v2');
    const rooms = new Map();
    const LAT = 70;
    bc.onmessage = (ev) => setTimeout(() => {
      const m = ev.data, r = rooms.get(m.room);
      if (!r || m.peer === me) return;
      if (m.t === 'p') { r.remote.set(m.peer, { presence: Object.freeze(m.presence), at: Date.now() }); r.dirty = true; }
      else if (m.t === 'bye') { r.remote.delete(m.peer); r.dirty = true; }
      else if (m.t === 'hello') r.send();
    }, LAT);
    function named(name) {
      const r = { mine: {}, remote: new Map(), listeners: new Set(), dirty: true, frozen: null, delivered: null, timer: null, last: 0 };
      r.send = () => { bc.postMessage({ t: 'p', room: name, peer: me, presence: r.mine }); r.last = performance.now(); };
      r.snapshot = () => {
        if (!r.dirty && r.frozen) return r.frozen;
        const list = [Object.freeze({ peer: me, by: null, isMe: true, sameTab: true, kind: 'viewer', guest: false, presence: Object.freeze({ ...r.mine }), updatedAt: Date.now() })];
        for (const [peer, v] of r.remote) list.push(Object.freeze({ peer, by: null, isMe: false, sameTab: false, kind: 'viewer', guest: false, presence: v.presence, updatedAt: v.at }));
        r.dirty = false;
        r.frozen = Object.freeze(list);
        return r.frozen;
      };
      r.api = {
        name,
        presence(patch) {
          const merged = { ...r.mine };
          for (const k in patch) { if (patch[k] === null) delete merged[k]; else merged[k] = patch[k]; }
          const n = bytes(merged);
          if (n > 4096) return Promise.reject({ code: 'invalid_argument', message: 'presence ' + n + ' bytes > 4 KiB' });
          r.mine = merged;
          r.dirty = true;
          if (!r.timer) r.timer = setTimeout(() => { r.timer = null; r.send(); }, Math.max(0, 33 - (performance.now() - r.last)));
          return Promise.resolve();
        },
        peers: () => r.snapshot(),
        onPeers(fn) { r.listeners.add(fn); setTimeout(() => fn({ peers: r.snapshot(), joined: [], left: [], updated: [] }), 0); return () => r.listeners.delete(fn); },
        connected: () => true,
        onConnection(fn) { setTimeout(() => fn(true), 0); return () => {}; },
        emit: () => Promise.resolve(),
        on: () => () => {},
        leave() { bc.postMessage({ t: 'bye', room: name, peer: me }); rooms.delete(name); return Promise.resolve(); },
      };
      return r;
    }
    setInterval(() => {
      const now = Date.now();
      for (const r of rooms.values()) {
        for (const [k, v] of r.remote) if (now - v.at > 4000) { r.remote.delete(k); r.dirty = true; }
        const snap = r.snapshot();
        if (snap !== r.delivered) { r.delivered = snap; for (const fn of r.listeners) fn({ peers: snap, joined: [], left: [], updated: [] }); }
      }
    }, 33);
    setInterval(() => { for (const r of rooms.values()) r.send(); }, 1000);
    addEventListener('pagehide', () => { for (const r of rooms.values()) r.api.leave(); });
    return {
      join(name) {
        let r = rooms.get(name);
        if (!r) { r = named(name); rooms.set(name, r); bc.postMessage({ t: 'hello', room: name, peer: me }); r.send(); }
        return Promise.resolve(r.api);
      },
      peers: () => [], onPeers: () => () => {}, presence: () => Promise.resolve(), connected: () => true, onConnection: () => () => {},
    };
  }
})();

// ============================================================
// SHARDFALL - touch: controls for phones and tablets. Only active when core.js decided this is a
// mobile device (G.Mobile.on); on a desktop this file only defines an inert G.Touch.
//   left thumb   a floating stick that walks (a light push walks, past halfway runs)
//   right thumb  a floating stick that aims and shoots while it is held (nothing fires by itself)
//   buttons      dash · three skills · ultimate · menu. Each skill button works the way its skill
//                does: hold it (charge / channel, drag to aim), drag a direction and let go (aim),
//                drag a spot on the ground and let go (place), or just tap (self)
// The hero asks G.Touch where to aim and walk, and for the gestures the skill buttons finished.
// ============================================================
(() => {
  const G = window.G, U = G.U;
  const T = (G.Touch = {
    on: false, mx: 0, mz: 0, mag: 0, held: () => false, aiming: false, ax: 0, az: -1,
    init() {}, update() {}, setHero() {}, walk: () => 0, steer: () => false, take: () => null, takeDir: () => null, dragging: () => null, drop() {},
  });
  if (!G.Mobile || !G.Mobile.on) return;
  T.on = true;

  const R = 58, DEAD_MOVE = 0.14, DEAD_AIM = 0.3, DRAG = 14, AIM_DIST = 14, PLACE_PX = 95, AIM_PX = 95;
  const KEYS = { dash: 'Space', r: 'KeyR' };
  // the pad keeps its old places: skill 1 is the big button by the thumb, then 2 and 3
  const SLOT = { lance: 1, q: 2, e: 3 };
  const BTN_OF = ['', 'lance', 'q', 'e'];
  const NAMES = { dash: '질주', lance: '1번', q: '2번', e: '3번', r: '궁극기' };
  const ICONS = { dash: 'dash', lance: 'spear', q: 'snow', e: 'meteor', r: 'burst' };
  const ptr = { move: null, aim: null };
  const sticks = {}, btn = {}, cdMax = {}, cdLast = {};
  const gest = [null, null, null, null]; // a finger on a skill button: { id, ox, oy, dx, dy, moved, kind, ring }
  const hold = [false, false, false, false], dir = [null, null, null, null], req = [null, null, null, null], rel = [null, null, null, null];
  const told = {};
  let root, ammoEl, shown = false, toldMove = false;

  const place = (el, x, y) => { el.style.transform = `translate(${x}px, ${y}px)`; };
  const press = (code) => { G.Input.pressed.add(code); G.Input.down.add(code); };
  const release = (code) => { if (G.Input.down.delete(code)) G.Input.released.add(code); };
  const skillOf = (i) => { const P = G.Player; return P && P.cls ? P.cls.skills[i - 1] : null; };

  T.init = function () {
    root = document.createElement('div');
    root.id = 'touch';
    root.className = 'off';
    root.innerHTML =
      '<div class="tz" data-z="move"></div><div class="tz" data-z="aim"></div>' +
      '<div class="stick ghost" data-s="move"><i></i><span>이동</span></div>' +
      '<div class="stick" data-s="aim"><i></i></div>' +
      '<div class="tammo hidden"></div>' +
      '<div class="tpad">' + ['r', 'e', 'q', 'lance', 'dash'].map((k) =>
        `<button class="tb tb-${k}" data-b="${k}" aria-label="${NAMES[k]}"><span class="tb-ico">${G.Icons.svg(ICONS[k])}</span>` +
        '<span class="tb-cd"></span><b class="tb-num"></b>' +
        (k === 'dash' ? '<span class="tb-pips"></span>' : '') + (SLOT[k] ? '<span class="tb-charge"><i></i></span><span class="tb-how"></span>' : '') +
        `<em>${NAMES[k]}</em></button>`).join('') + '</div>' +
      '<button class="tmini tb-pause" aria-label="일시정지"><i></i><i></i><i></i></button>';
    document.body.appendChild(root);
    ammoEl = root.querySelector('.tammo');
    for (const el of root.querySelectorAll('.stick')) sticks[el.dataset.s] = { el, knob: el.firstElementChild };

    // ---- the two thumb zones ----
    for (const z of root.querySelectorAll('.tz')) {
      const kind = z.dataset.z;
      z.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (ptr[kind]) return;
        try { z.setPointerCapture(e.pointerId); } catch (err) { /* a synthetic or finished pointer */ }
        stickStart(kind, e.clientX, e.clientY, e.pointerId);
      });
      z.addEventListener('pointermove', (e) => { const p = ptr[kind]; if (p && p.id === e.pointerId) stickMove(kind, e.clientX, e.clientY); });
      const end = (e) => { const p = ptr[kind]; if (p && p.id === e.pointerId) stickEnd(kind); };
      z.addEventListener('pointerup', end);
      z.addEventListener('pointercancel', end);
      z.addEventListener('lostpointercapture', end);
    }

    // ---- buttons ----
    for (const b of root.querySelectorAll('.tb')) {
      const k = b.dataset.b, i = SLOT[k] || 0;
      btn[k] = { el: b, cd: b.querySelector('.tb-cd'), num: b.querySelector('.tb-num'), pips: b.querySelector('.tb-pips'), charge: b.querySelector('.tb-charge i'), ready: true };
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        try { b.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        b.classList.add('down');
        if (i) skillDown(i, e);
        else press(KEYS[k]);
        // a tiny buzz, once the page has been touched for real (browsers refuse it before that)
        try { const ua = navigator.userActivation; if (navigator.vibrate && (!ua || ua.hasBeenActive)) navigator.vibrate(8); } catch (err) { /* not allowed */ }
      });
      b.addEventListener('pointermove', (e) => { if (i) skillMove(i, e); });
      const up = (e) => {
        b.classList.remove('down');
        if (i) { const g = gest[i]; if (g && g.id === e.pointerId) skillUp(i, e.type === 'pointerup'); }
        else release(KEYS[k]);
      };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('lostpointercapture', up);
    }

    root.querySelector('.tb-pause').addEventListener('click', () => { G.Audio.play('ui'); G.Game.pause(); });

    // ---- portrait hint, fullscreen, layout ----
    const rot = document.createElement('div');
    rot.id = 'rotate';
    rot.innerHTML = '<div class="rot-box"><div class="rot-phone"><i></i></div><b>가로로 돌려 주세요</b>' +
      '<p>가로 화면에서 조작 버튼과 시야가 가장 넓어요.</p><button class="btn small" id="btn-rotate-skip">세로로 계속하기</button></div>';
    document.body.appendChild(rot);
    rot.querySelector('#btn-rotate-skip').addEventListener('click', () => document.documentElement.classList.add('portrait-ok'));
    // a run starting (or a room) is the moment to take the whole screen, where the browser allows it
    document.addEventListener('click', (e) => {
      if (e.target && e.target.closest && e.target.closest('.diff-opt, #btn-lobby-start, #btn-retry, #btn-continue, #btn-host, #btn-join, #btn-go-lobby')) fullscreen();
    }, true);
    addEventListener('resize', layout);
    addEventListener('orientationchange', () => setTimeout(layout, 120));
    layout();
  };

  function fullscreen() {
    const d = document, el = d.documentElement;
    if (d.fullscreenElement || d.webkitFullscreenElement) return;
    const fn = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!fn) return;
    try {
      const p = fn.call(el, { navigationUI: 'hide' });
      const lock = () => { try { const o = screen.orientation; if (o && o.lock) o.lock('landscape').catch(() => {}); } catch (e) { /* not supported */ } };
      if (p && p.then) p.then(lock, () => {}); else lock();
    } catch (e) { /* refused here (an embedded frame, iPhone Safari) */ }
  }

  // UI sizes for a small screen: the HUD, panels and the card row each get a zoom that fits them
  function layout() {
    const w = innerWidth, h = innerHeight, st = document.documentElement.style;
    st.setProperty('--uiz', U.clamp(Math.min(w / 1180, h / 620), 0.55, 1).toFixed(3));
    // panels stay big enough to tap (they scroll instead of shrinking further)
    st.setProperty('--pz', U.clamp(Math.min(w / 900, (h - 12) / 480), 0.78, 1).toFixed(3));
    st.setProperty('--lz', U.clamp(Math.min((w - 24) / 760, (h - 16) / 540), 0.42, 1).toFixed(3));
    document.documentElement.classList.toggle('portrait', h > w * 1.05);
    if (!ptr.move && sticks.move) place(sticks.move.el, Math.max(92, w * 0.13), h - Math.max(96, h * 0.28));
  }

  // ---------------- sticks ----------------
  function stickStart(kind, x, y, id) {
    const s = sticks[kind];
    ptr[kind] = { id, ox: x, oy: y };
    s.el.classList.remove('ghost');
    s.el.classList.add('on');
    place(s.el, x, y);
    if (kind === 'aim') T.heldAim = true;
    stickMove(kind, x, y);
  }
  function stickMove(kind, x, y) {
    const p = ptr[kind], s = sticks[kind];
    let dx = x - p.ox, dy = y - p.oy, d = Math.hypot(dx, dy);
    // the base trails a thumb that slides past the rim, so the stick never runs out of room
    if (d > R) {
      const k = (d - R) / d;
      p.ox += dx * k; p.oy += dy * k;
      place(s.el, p.ox, p.oy);
      dx = x - p.ox; dy = y - p.oy; d = R;
    }
    s.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const mag = d / R, l = d || 1;
    // the camera looks straight down the -z axis, so screen right is +x and screen down is +z
    if (kind === 'move') { T.mag = mag > DEAD_MOVE ? mag : 0; T.mx = dx / l; T.mz = dy / l; }
    else { T.aiming = mag > DEAD_AIM; if (T.aiming) { T.ax = dx / l; T.az = dy / l; } }
  }
  function stickEnd(kind) {
    const s = sticks[kind];
    ptr[kind] = null;
    s.knob.style.transform = '';
    s.el.classList.remove('on');
    if (kind === 'move') { T.mag = 0; s.el.classList.add('ghost'); layout(); }
    else { T.heldAim = false; T.aiming = false; }
  }
  function releaseAll() {
    for (const k of ['move', 'aim']) if (ptr[k]) stickEnd(k);
    for (let i = 1; i <= 3; i++) { if (gest[i]) skillUp(i, false); hold[i] = false; req[i] = null; rel[i] = null; }
    for (const k in btn) btn[k].el.classList.remove('down');
    for (const k in KEYS) release(KEYS[k]);
  }

  // ---------------- skill buttons ----------------
  function skillDown(i, e) {
    const P = G.Player, s = skillOf(i);
    if (!P || !s) return;
    gest[i] = { id: e.pointerId, ox: e.clientX, oy: e.clientY, dx: 0, dy: 0, moved: false, kind: s.kind, ring: null };
    dir[i] = [Math.cos(P.facing), Math.sin(P.facing)];
    if (s.kind === 'charge' || s.kind === 'channel') hold[i] = true;
  }
  function skillMove(i, e) {
    const g = gest[i];
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.ox, dy = e.clientY - g.oy, d = Math.hypot(dx, dy);
    g.dx = dx; g.dy = dy;
    if (d > DRAG) { g.moved = true; dir[i] = [dx / d, dy / d]; }
    // a place skill shows its ring on the ground where it will land
    if (g.kind === 'place' && g.moved && !g.ring) {
      const P = G.Player, s = skillOf(i), p = spotOf(i, g);
      if (P && s) g.ring = G.FX.telegraph({ shape: 'circle', x: p.x, z: p.z, r: s.ring ? s.ring(P.stats) : 3, hold: true, color: 0xffd27a, k: 1.3 });
    }
  }
  // where a dragged place skill lands: a full drag reaches the skill's range
  function spotOf(i, g) {
    const P = G.Player, s = skillOf(i), d = Math.hypot(g.dx, g.dy) || 1;
    const k = (Math.min(1, d / PLACE_PX) * ((s && s.range) || 20)) / d;
    return { x: P.x + g.dx * k, z: P.z + g.dy * k };
  }
  function skillUp(i, cast) {
    const g = gest[i];
    gest[i] = null;
    if (!g) return;
    if (g.ring) g.ring.kill();
    const P = G.Player, s = skillOf(i);
    if (g.kind === 'charge') { hold[i] = false; rel[i] = { dir: dir[i], at: performance.now() }; return; }
    if (g.kind === 'channel') { hold[i] = false; return; }
    if (!cast || !P || !s) return;
    if (g.kind === 'place') {
      if (g.moved) { const p = spotOf(i, g); req[i] = { x: p.x, z: p.z }; }
      else if (s.tap === 'feet') req[i] = { x: P.x, z: P.z };
      else if (!told[i]) { told[i] = true; G.UI.toast(s.name + ' 버튼을 끌어서 자리를 정한 뒤 손을 떼세요', '', 3.5); }
    } else if (g.kind === 'aim') {
      // a tap goes where the hero already looks (a roll: where it walks)
      req[i] = g.moved ? { ang: Math.atan2(dir[i][1], dir[i][0]), k: Math.min(1, Math.hypot(g.dx, g.dy) / AIM_PX) } : {};
    } else req[i] = {};
  }

  // ---------------- what the hero asks ----------------
  T.held = (i) => hold[i];
  T.take = (i) => { const r = req[i]; req[i] = null; return r; };
  // the direction a charged skill was let go in (used once, by the shot itself)
  T.takeDir = (i) => { const r = rel[i]; rel[i] = null; return r ? r.dir : null; };
  // an aim skill being dragged right now (for its range line)
  T.dragging = () => {
    for (let i = 1; i <= 3; i++) { const g = gest[i]; if (g && g.moved && g.kind === 'aim') return { i, dir: dir[i] }; }
    return null;
  };
  // controls locked (a card to choose): forget every finger on a skill
  T.drop = () => { for (let i = 1; i <= 3; i++) { hold[i] = false; req[i] = null; rel[i] = null; if (gest[i] && gest[i].ring) gest[i].ring.kill(); gest[i] = null; } };

  // walking speed from how far the thumb pushes: a nudge walks, past halfway runs
  T.walk = () => (T.mag <= 0 ? 0 : U.clamp(0.3 + (T.mag - DEAD_MOVE) * 1.75, 0.3, 1));

  // Sets the hero's aim point for this frame and says whether to shoot. Nothing fires on its own:
  // the right thumb aims and shoots, a held or dragged skill owns the aim, otherwise you look where you walk.
  T.steer = function (h) {
    let tx, tz, fire = false, d = null;
    const now = performance.now();
    for (let i = 1; i <= 3 && !d; i++) {
      if (rel[i] && now - rel[i].at > 250) rel[i] = null;
      const g = gest[i];
      if (hold[i] || (g && g.moved)) d = dir[i];
      else if (rel[i]) d = rel[i].dir;
    }
    if (d) { tx = h.x + d[0] * AIM_DIST; tz = h.z + d[1] * AIM_DIST; }
    else if (T.heldAim) {
      if (T.aiming) { tx = h.x + T.ax * AIM_DIST; tz = h.z + T.az * AIM_DIST; }
      else { tx = h.x + Math.cos(h.facing) * AIM_DIST; tz = h.z + Math.sin(h.facing) * AIM_DIST; }
      fire = true;
    } else if (T.mag > 0) { tx = h.x + T.mx * AIM_DIST; tz = h.z + T.mz * AIM_DIST; }
    else { tx = h.x + Math.cos(h.facing) * AIM_DIST; tz = h.z + Math.sin(h.facing) * AIM_DIST; }
    h.aimX = tx; h.aimZ = tz;
    return fire;
  };

  // the buttons wear the current character's skills, and say how each one is used
  const HOW_ICON = { charge: '◉', channel: '◎', aim: '➚', place: '⊙', self: '' };
  T.setHero = function (h) {
    if (!root) return;
    const c = h.cls;
    const set = (k, icon, name, kind) => {
      const b = btn[k];
      if (!b) return;
      b.el.querySelector('.tb-ico').innerHTML = G.Icons.svg(icon);
      b.el.querySelector('em').textContent = name;
      b.el.setAttribute('aria-label', name);
      const how = b.el.querySelector('.tb-how');
      if (how) how.textContent = HOW_ICON[kind] || '';
      b.el.dataset.kind = kind || '';
    };
    for (let i = 1; i <= 3; i++) set(BTN_OF[i], c.skills[i - 1].icon, c.skills[i - 1].name, c.skills[i - 1].kind);
    set('r', c.ult.icon, c.ult.name, 'self');
    ammoEl.classList.toggle('hidden', !c.ammo);
    ammoEl.innerHTML = c.ammo ? '<i></i>'.repeat(c.ammo) : '';
  };

  // ---------------- per frame: show/hide, cooldowns ----------------
  function setCd(k, v, active) {
    const b = btn[k];
    if (v > (cdLast[k] || 0) + 0.01) cdMax[k] = v;
    cdLast[k] = v;
    b.cd.style.setProperty('--cd', v > 0 && cdMax[k] ? v / cdMax[k] : 0);
    b.num.textContent = v > 0 ? (v >= 10 ? Math.ceil(v) : v.toFixed(1)) : '';
    if (v <= 0 && !b.ready) { b.ready = true; b.el.classList.remove('flash'); void b.el.offsetWidth; b.el.classList.add('flash'); }
    if (v > 0) b.ready = false;
    b.el.classList.toggle('active', !!active);
  }
  T.update = function () {
    if (!root) return;
    const Gm = G.Game, P = G.Player;
    const want = !!P && Gm.inRun() && !G.UI.current && Gm.state !== 'gameover' && Gm.state !== 'paused';
    if (want !== shown) {
      shown = want;
      root.classList.toggle('off', !want);
      if (!want) releaseAll();
      else if (!toldMove) {
        toldMove = true;
        setTimeout(() => shown && G.UI.toast('왼쪽 엄지로 이동하고, 오른쪽을 끌면 그쪽으로 쏩니다. 스킬 버튼은 누르고 있거나, 끌어서 방향·자리를 정해요', '', 6), 1800);
      }
    }
    if (!want) return;
    // co-op has no pause, so the corner button there is a menu (three bars) instead of pause (two)
    const coop = Gm.mode !== 'solo', pb = root.querySelector('.tb-pause');
    if (pb.classList.contains('menu') !== coop) { pb.classList.toggle('menu', coop); pb.setAttribute('aria-label', coop ? '메뉴' : '일시정지'); }
    const s = P.stats;
    for (let i = 1; i <= 3; i++) {
      const k = BTN_OF[i], sk = P.cls.skills[i - 1], b = btn[k];
      const charging = P.charging && P.chgSlot === i, chan = P.chan === i;
      setCd(k, P.cd['s' + i], charging || chan || !!gest[i]);
      b.charge.style.width = (charging ? P.lanceCharge * 100 : chan ? (1 - P.chanT / (sk.max || 3)) * 100 : 0) + '%';
    }
    const d = btn.dash;
    if (d.pips.children.length !== s.dashCharges) d.pips.innerHTML = '<i></i>'.repeat(s.dashCharges);
    [...d.pips.children].forEach((p, i) => p.classList.toggle('on', i < P.dashCharges));
    d.cd.style.setProperty('--cd', P.dashCharges > 0 ? 0 : 1 - P.dashRecharge / s.dashCd);
    d.num.textContent = P.dashCharges > 0 ? '' : Math.max(0, s.dashCd - P.dashRecharge).toFixed(1);
    const r = btn.r;
    r.cd.style.setProperty('--cd', P.ultT > 0 ? 0 : 1 - P.ult / 100);
    r.el.classList.toggle('ready', P.ult >= 100 && P.ultT <= 0);
    r.el.classList.toggle('active', P.ultT > 0);
    r.num.textContent = P.ult >= 100 || P.ultT > 0 ? '' : Math.floor(P.ult) + '%';
    // the gunslinger's cylinder
    if (P.cls.ammo) {
      ammoEl.classList.toggle('reload', P.reloadT > 0);
      [...ammoEl.children].forEach((p, i) => p.classList.toggle('on', i < P.ammo));
    }
    // a place skill's ring rides along with the hero while you hold the button
    for (let i = 1; i <= 3; i++) {
      const g = gest[i];
      if (g && g.ring) { const p = spotOf(i, g); g.ring.set(p.x, p.z); }
    }
  };
})();

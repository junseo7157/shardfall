// ============================================================
// SHARDFALL - touch: controls for phones and tablets. Only active when core.js decided this is a
// mobile device (G.Mobile.on); on a desktop this file only defines an inert G.Touch.
//   left thumb   a floating stick that walks (a light push walks, past halfway runs)
//   right thumb  a floating stick that aims and shoots while it is held
//   no right thumb: auto-aim shoots the nearest enemy in range (a boss's weak spot first)
//   buttons      dash · shard lance (hold to charge, drag to aim, let go to fire) · frost nova ·
//                meteor (lands where you aim) · shard storm, plus pause and an auto-aim switch
// The hero asks G.Touch where to aim and walk; the buttons press the keys a keyboard would.
// ============================================================
(() => {
  const G = window.G, U = G.U;
  const T = (G.Touch = {
    on: false, mx: 0, mz: 0, mag: 0, held: false, aiming: false, ax: 0, az: -1,
    lance: false, lanceAim: false, lx: 0, lz: -1, auto: true, target: null,
    init() {}, update() {}, walk: () => 0, steer: () => false,
  });
  if (!G.Mobile || !G.Mobile.on) return;
  T.on = true;
  T.auto = G.Settings.autoAim !== false;

  const R = 58, DEAD_MOVE = 0.14, DEAD_AIM = 0.3, LANCE_DRAG = 16, AIM_DIST = 14;
  const KEYS = { dash: 'Space', q: 'KeyQ', e: 'KeyE', r: 'KeyR' };
  const ICONS = { dash: 'dash', lance: 'spear', q: 'snow', e: 'meteor', r: 'burst' };
  const NAMES = { dash: '질주', lance: '파편 창', q: '서리 노바', e: '운석', r: '파편 폭풍' };
  const ptr = { move: null, aim: null, lance: null };
  const sticks = {}, btn = {}, cdMax = {}, cdLast = {};
  const _v = new THREE.Vector3();
  let root, lockEl, shown = false, told = false;

  const place = (el, x, y) => { el.style.transform = `translate(${x}px, ${y}px)`; };
  const press = (code) => { G.Input.pressed.add(code); G.Input.down.add(code); };
  const release = (code) => { if (G.Input.down.delete(code)) G.Input.released.add(code); };

  T.init = function () {
    root = document.createElement('div');
    root.id = 'touch';
    root.className = 'off';
    root.innerHTML =
      '<div class="tz" data-z="move"></div><div class="tz" data-z="aim"></div>' +
      '<div class="stick ghost" data-s="move"><i></i><span>이동</span></div>' +
      '<div class="stick" data-s="aim"><i></i></div>' +
      '<div class="tlock"><i></i><i></i><i></i><i></i></div>' +
      '<div class="tpad">' + ['r', 'e', 'q', 'lance', 'dash'].map((k) =>
        `<button class="tb tb-${k}" data-b="${k}" aria-label="${NAMES[k]}"><span class="tb-ico">${G.Icons.svg(ICONS[k])}</span>` +
        '<span class="tb-cd"></span><b class="tb-num"></b>' +
        (k === 'dash' ? '<span class="tb-pips"></span>' : '') + (k === 'lance' ? '<span class="tb-charge"><i></i></span>' : '') +
        `<em>${NAMES[k]}</em></button>`).join('') + '</div>' +
      '<button class="tmini tb-pause" aria-label="일시정지"><i></i><i></i><i></i></button>' +
      `<button class="tmini tb-auto${T.auto ? ' on' : ''}" aria-label="자동 조준">자동<br>조준</button>`;
    document.body.appendChild(root);
    lockEl = root.querySelector('.tlock');
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

    // ---- skill buttons ----
    for (const b of root.querySelectorAll('.tb')) {
      const k = b.dataset.b;
      btn[k] = { el: b, cd: b.querySelector('.tb-cd'), num: b.querySelector('.tb-num'), pips: b.querySelector('.tb-pips'), charge: b.querySelector('.tb-charge i'), ready: true };
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        try { b.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        b.classList.add('down');
        if (k === 'lance') { ptr.lance = { id: e.pointerId, ox: e.clientX, oy: e.clientY }; T.lance = true; T.lanceAim = false; }
        else press(KEYS[k]);
        try { if (navigator.vibrate) navigator.vibrate(8); } catch (err) { /* not allowed */ }
      });
      // the lance can be dragged like a stick to aim the beam before letting go
      b.addEventListener('pointermove', (e) => {
        const p = ptr.lance;
        if (k !== 'lance' || !p || p.id !== e.pointerId) return;
        const dx = e.clientX - p.ox, dy = e.clientY - p.oy, d = Math.hypot(dx, dy);
        if (d > LANCE_DRAG) { T.lanceAim = true; T.lx = dx / d; T.lz = dy / d; }
      });
      const up = (e) => {
        b.classList.remove('down');
        if (k !== 'lance') release(KEYS[k]);
        else if (ptr.lance && ptr.lance.id === e.pointerId) { ptr.lance = null; T.lance = false; T.lanceAim = false; }
      };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('lostpointercapture', up);
    }

    root.querySelector('.tb-pause').addEventListener('click', () => { G.Audio.play('ui'); G.Game.pause(); });
    const autoB = root.querySelector('.tb-auto');
    autoB.addEventListener('click', () => {
      T.auto = !T.auto;
      autoB.classList.toggle('on', T.auto);
      G.Settings.autoAim = T.auto;
      G.saveSettings();
      G.Audio.play('ui');
      G.UI.toast(T.auto ? '자동 조준 켜짐 · 손을 떼고 있으면 가까운 적을 알아서 쏩니다' : '자동 조준 꺼짐 · 오른쪽을 끌어서 조준하고 쏘세요', '', 2.4);
    });

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
    if (kind === 'aim') T.held = true;
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
    else { T.held = false; T.aiming = false; }
  }
  function releaseAll() {
    for (const k of ['move', 'aim']) if (ptr[k]) stickEnd(k);
    ptr.lance = null; T.lance = false; T.lanceAim = false;
    for (const k in btn) btn[k].el.classList.remove('down');
    for (const k in KEYS) release(KEYS[k]);
  }

  // ---------------- what the hero asks ----------------
  // walking speed from how far the thumb pushes: a nudge walks, past halfway runs
  T.walk = () => (T.mag <= 0 ? 0 : U.clamp(0.3 + (T.mag - DEAD_MOVE) * 1.75, 0.3, 1));

  // nearest live target, sticking with the current one unless another is clearly closer
  function nearest(x, z, r) {
    let best = null, bd = r * r;
    for (const e of G.Enemies.list) {
      if (!e.alive || e.spawnT > 0) continue;
      const d = (e.x - x) ** 2 + (e.z - z) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    for (const t of G.Bosses.targets) {
      if (!t.alive) continue;
      const d = ((t.x - x) ** 2 + (t.z - z) ** 2) * (t.weak ? 0.35 : 1);
      if (d < bd) { bd = d; best = t; }
    }
    const cur = T.target;
    if (cur && cur !== best && cur.alive) {
      const d = ((cur.x - x) ** 2 + (cur.z - z) ** 2) * (cur.weak ? 0.35 : 1);
      if (d < r * r && d < bd * 1.6) return cur;
    }
    return best;
  }

  // sets the hero's aim point for this frame and says whether to shoot
  T.steer = function (h) {
    const s = h.stats;
    const range = U.clamp(s.projSpeed * s.projLife * 1.05, 14, 34);
    let tx, tz, fire = false, tgt = null;
    if (T.lance && T.lanceAim) { tx = h.x + T.lx * AIM_DIST; tz = h.z + T.lz * AIM_DIST; }
    else if (T.held && T.aiming) { tx = h.x + T.ax * AIM_DIST; tz = h.z + T.az * AIM_DIST; fire = true; }
    else {
      if (T.auto || T.held || T.lance) tgt = nearest(h.x, h.z, range);
      if (tgt) { tx = tgt.x; tz = tgt.z; fire = T.auto || T.held; }
      else if (T.mag > 0 && !T.held) { tx = h.x + T.mx * AIM_DIST; tz = h.z + T.mz * AIM_DIST; }
      else { tx = h.x + Math.cos(h.facing) * AIM_DIST; tz = h.z + Math.sin(h.facing) * AIM_DIST; fire = T.held; }
    }
    T.target = tgt;
    h.aimX = tx; h.aimZ = tz;
    return fire;
  };

  // ---------------- per frame: show/hide, cooldowns, target marker ----------------
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
      else if (!told) {
        told = true;
        setTimeout(() => shown && G.UI.toast('왼쪽 엄지로 이동하고 오른쪽을 끌어서 조준해요. 손을 떼면 가까운 적을 자동으로 쏩니다', '', 5.5), 1800);
      }
    }
    if (!want) return;
    // co-op has no pause, so the corner button there is a menu (three bars) instead of pause (two)
    const coop = Gm.mode !== 'solo', pb = root.querySelector('.tb-pause');
    if (pb.classList.contains('menu') !== coop) { pb.classList.toggle('menu', coop); pb.setAttribute('aria-label', coop ? '메뉴' : '일시정지'); }
    const s = P.stats;
    setCd('lance', P.cd.lance, P.charging);
    setCd('q', P.cd.nova);
    setCd('e', P.cd.meteor);
    btn.lance.charge.style.width = (P.charging ? P.lanceCharge * 100 : 0) + '%';
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
    // a ring on whatever auto-aim is shooting at
    const t = T.target;
    if (t && t.alive && P.alive && !(T.held && T.aiming) && !T.lanceAim) {
      _v.set(t.x, (t.y || 0) + (t.isBoss ? 2.2 : 1), t.z).project(G.Render.camera);
      place(lockEl, (_v.x * 0.5 + 0.5) * innerWidth, (-_v.y * 0.5 + 0.5) * innerHeight);
      lockEl.classList.add('on');
    } else lockEl.classList.remove('on');
  };
})();

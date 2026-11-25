// ============================================================
// SHARDFALL - touch: controls for phones and tablets. Only active when core.js decided this is a
// mobile device (G.Mobile.on); on a desktop this file only defines an inert G.Touch.
//   left thumb   a floating stick that walks (a light push walks, past halfway runs)
//   right thumb  a floating stick that aims and shoots while it is held (nothing fires by itself)
//   buttons      dash · skill 1 (hold to charge, drag to aim, let go to fire) · skill 2 ·
//                skill 3 (drag to place its ring on the ground, let go to cast) · ultimate · menu
// The hero asks G.Touch where to aim and walk; the buttons press the keys a keyboard would.
// ============================================================
(() => {
  const G = window.G, U = G.U;
  const T = (G.Touch = {
    on: false, mx: 0, mz: 0, mag: 0, held: false, aiming: false, ax: 0, az: -1,
    lance: false, lanceAim: false, lx: 0, lz: -1, s3Target: null,
    init() {}, update() {}, setHero() {}, walk: () => 0, steer: () => false, takeLanceDir: () => null,
  });
  if (!G.Mobile || !G.Mobile.on) return;
  T.on = true;

  const R = 58, DEAD_MOVE = 0.14, DEAD_AIM = 0.3, LANCE_DRAG = 14, AIM_DIST = 14, S3_DRAG = 14, S3_PX = 95, S3_RANGE = 22;
  const KEYS = { dash: 'Space', q: 'KeyQ', e: 'KeyE', r: 'KeyR' };
  const ICONS = { dash: 'dash', lance: 'spear', q: 'snow', e: 'meteor', r: 'burst' };
  const NAMES = { dash: '질주', lance: '파편 창', q: '서리 노바', e: '운석', r: '파편 폭풍' };
  const ptr = { move: null, aim: null, lance: null, s3: null };
  const sticks = {}, btn = {}, cdMax = {}, cdLast = {};
  let root, shown = false, told = false, toldS3 = false, hero = null;

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
      '<div class="tpad">' + ['r', 'e', 'q', 'lance', 'dash'].map((k) =>
        `<button class="tb tb-${k}" data-b="${k}" aria-label="${NAMES[k]}"><span class="tb-ico">${G.Icons.svg(ICONS[k])}</span>` +
        '<span class="tb-cd"></span><b class="tb-num"></b>' +
        (k === 'dash' ? '<span class="tb-pips"></span>' : '') + (k === 'lance' ? '<span class="tb-charge"><i></i></span>' : '') +
        `<em>${NAMES[k]}</em></button>`).join('') + '</div>' +
      '<button class="tmini tb-pause" aria-label="일시정지"><i></i><i></i><i></i></button>';
    document.body.appendChild(root);
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
        // skill 1: hold to charge; the line starts where the hero already faces until you drag it
        if (k === 'lance') {
          ptr.lance = { id: e.pointerId, ox: e.clientX, oy: e.clientY };
          T.lance = true; T.lanceAim = false; T.lanceFire = null;
          const P = G.Player;
          T.lx = Math.cos(P ? P.facing : -Math.PI / 2); T.lz = Math.sin(P ? P.facing : -Math.PI / 2);
        } else if (k === 'e') s3Start(e);
        else press(KEYS[k]);
        try { if (navigator.vibrate) navigator.vibrate(8); } catch (err) { /* not allowed */ }
      });
      b.addEventListener('pointermove', (e) => {
        // skill 1 is dragged like a stick to aim the shot before letting go
        const p = ptr.lance;
        if (k === 'lance' && p && p.id === e.pointerId) {
          const dx = e.clientX - p.ox, dy = e.clientY - p.oy, d = Math.hypot(dx, dy);
          if (d > LANCE_DRAG) { T.lanceAim = true; T.lx = dx / d; T.lz = dy / d; }
        }
        // skill 3: the drag places the ring on the ground
        if (k === 'e' && ptr.s3 && ptr.s3.id === e.pointerId) s3Move(e.clientX, e.clientY);
      });
      const up = (e) => {
        b.classList.remove('down');
        if (k === 'lance') {
          // remember the last direction: the shot leaves exactly where the skill thumb pointed
          if (ptr.lance && ptr.lance.id === e.pointerId) { ptr.lance = null; T.lance = false; T.lanceAim = false; T.lanceFire = [T.lx, T.lz]; T.lanceFireAt = performance.now(); }
        } else if (k === 'e') { if (ptr.s3 && ptr.s3.id === e.pointerId) s3End(e.type === 'pointerup'); }
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
    ptr.lance = null; T.lance = false; T.lanceAim = false; T.lanceFire = null;
    if (ptr.s3) s3End(false);
    for (const k in btn) btn[k].el.classList.remove('down');
    for (const k in KEYS) release(KEYS[k]);
  }

  // ---------------- skill 3: drag the button to place its ring, let go to cast ----------------
  // A tap that never drags casts nothing, so the skill never lands somewhere you didn't choose.
  function s3Start(e) {
    const P = G.Player;
    if (!P || !P.alive || P.cd.meteor > 0) return;
    ptr.s3 = { id: e.pointerId, ox: e.clientX, oy: e.clientY, dx: 0, dz: 0, moved: false, ring: null };
  }
  function s3Move(x, y) {
    const p = ptr.s3, P = G.Player;
    if (!p || !P) return;
    const dx = x - p.ox, dy = y - p.oy, d = Math.hypot(dx, dy);
    if (d > S3_DRAG) p.moved = true;
    // screen right is +x and screen down is +z; a full drag reaches the skill's range
    const k = (Math.min(1, d / S3_PX) * S3_RANGE) / (d || 1);
    p.dx = dx * k; p.dz = dy * k;
    if (p.moved && !p.ring) p.ring = G.FX.telegraph({ shape: 'circle', x: P.x + p.dx, z: P.z + p.dz, r: P.cls.s3R(P.stats), hold: true, color: 0xffd27a, k: 1.3 });
  }
  function s3End(cast) {
    const p = ptr.s3, P = G.Player;
    ptr.s3 = null;
    if (!p) return;
    if (p.ring) p.ring.kill();
    if (!cast || !P) return;
    if (p.moved) { T.s3Target = { x: P.x + p.dx, z: P.z + p.dz }; press(KEYS.e); release(KEYS.e); }
    else if (!toldS3) { toldS3 = true; G.UI.toast(P.cls.skills[2].name + ' 버튼을 끌어서 떨어질 자리를 정한 뒤 손을 떼세요', '', 3.5); }
  }

  // ---------------- what the hero asks ----------------
  // walking speed from how far the thumb pushes: a nudge walks, past halfway runs
  T.walk = () => (T.mag <= 0 ? 0 : U.clamp(0.3 + (T.mag - DEAD_MOVE) * 1.75, 0.3, 1));

  // Sets the hero's aim point for this frame and says whether to shoot. Nothing fires on its own:
  // the right thumb aims and shoots, a charging skill 1 owns the aim, otherwise you look where you walk.
  T.steer = function (h) {
    let tx, tz, fire = false;
    if (T.lanceFire && performance.now() - T.lanceFireAt > 250) T.lanceFire = null;
    const lanceDir = T.lance ? [T.lx, T.lz] : T.lanceFire;
    if (lanceDir) { tx = h.x + lanceDir[0] * AIM_DIST; tz = h.z + lanceDir[1] * AIM_DIST; }
    else if (T.held) {
      if (T.aiming) { tx = h.x + T.ax * AIM_DIST; tz = h.z + T.az * AIM_DIST; }
      else { tx = h.x + Math.cos(h.facing) * AIM_DIST; tz = h.z + Math.sin(h.facing) * AIM_DIST; }
      fire = true;
    } else if (T.mag > 0) { tx = h.x + T.mx * AIM_DIST; tz = h.z + T.mz * AIM_DIST; }
    else { tx = h.x + Math.cos(h.facing) * AIM_DIST; tz = h.z + Math.sin(h.facing) * AIM_DIST; }
    h.aimX = tx; h.aimZ = tz;
    return fire;
  };
  // the direction skill 1 was let go in (used once, by the shot itself)
  T.takeLanceDir = () => { const d = T.lanceFire; T.lanceFire = null; return d; };

  // the buttons wear the current character's skills
  T.setHero = function (h) {
    hero = h;
    if (!root) return;
    const c = h.cls;
    const set = (k, icon, name) => {
      const b = btn[k];
      if (!b) return;
      b.el.querySelector('.tb-ico').innerHTML = G.Icons.svg(icon);
      b.el.querySelector('em').textContent = name;
      b.el.setAttribute('aria-label', name);
    };
    set('lance', c.skills[0].icon, c.skills[0].name);
    set('q', c.skills[1].icon, c.skills[1].name);
    set('e', c.skills[2].icon, c.skills[2].name);
    set('r', c.ult.icon, c.ult.name);
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
        setTimeout(() => shown && G.UI.toast('왼쪽 엄지로 이동하고, 오른쪽을 끌면 그쪽으로 쏩니다. 스킬 버튼은 끌어서 방향이나 위치를 정해요', '', 6), 1800);
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
    // the skill-3 ring rides along with the hero while you hold the button
    const p3 = ptr.s3;
    if (p3 && p3.ring) p3.ring.set(P.x + p3.dx, P.z + p3.dz);
  };
})();

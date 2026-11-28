// ============================================================
// SHARDFALL - classes2: five more heroes, built with what classes.js lends (G.Classes.kit)
//   necromancer  souls, skeleton warriors, bone armour, the grasp, the gate of the dead
//   gravitist    pulling shots, the gravity orb, repulse, the black hole, the event horizon
//   druid        two forms (thorns and a healing grove as a person, claws and quakes as a bear),
//                the world tree
//   blademaster  momentum, the draw-cut, the parry, the wind blade, the triple flash
//   bard         three songs for the whole party, discord, the echo bell, the symphony
// Same rules as the first ten: the caster's machine runs a skill at once, the host deals the
// damage, and what stays on the field is made by visual events on every machine.
// ============================================================
(() => {
  const G = window.G, U = G.U, C = G.Combat, HS = G.Heroes, CL = G.Classes, K = CL.kit;
  const { def, scene, hy, vb, shows, mine, near, extra, sid, stun, slow, inCone, reach, freeSpot, later, mat, geo, std, glowM, addM, face, flap, grow, dropMesh,
    addMat, ownMat, dropAll, outward, ultSpot, uid, ownerOf, SUM, V, R1, R2, TAU } = K;
  CL.order.push('necro', 'gravity', 'druid', 'blademaster', 'bard');

  // a model's own materials: lit ones join the hero's (they flash when hit, fade in stealth, and
  // are thrown away with it); glowing ones are only thrown away with it
  const skin = (h, color, o = {}) => { const m = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.6, metalness: 0.1 }, o)); U.addRim(m, 0xfff0d0, 0.45, 2.4); h.mats.push(m); return m; };
  const shine = (h, color, k = 3) => { const m = new THREE.MeshBasicMaterial({ color: U.hdr(color, k) }); h.geos.push(m); return m; };
  const strongest = (x, z, r) => {
    let best = null, bk = -1;
    C.forEachTarget(x, z, r, (q) => { const v = (q.isBoss ? 1e7 : 0) + (q.elite ? 1e5 : 0) + (q.hp || 0); if (v > bk) { bk = v; best = q; } });
    return best;
  };
  const pullIn = (q, x, z, f) => { if (q.isBoss || !q.knock) return; const dx = x - q.x, dz = z - q.z; if (dx * dx + dz * dz > 0.36) q.knock(dx, dz, f); };

  // ======================================================================
  // 11. necromancer: the dead fight for it
  // ======================================================================
  const NK_SOUL_R = 12;
  def({
    id: 'necro', tier: 2, name: '강령술사', role: '해골 군단을 부리는 죽음의 마법사', emblem: 'skull', css: '#b8e06a', energy: 0x9fff6a, ultDur: 6.5,
    resource: { max: 10, name: '영혼' },
    trait: { name: '영혼 수확', desc: '12m 안에서 적이 쓰러질 때마다 영혼을 하나 거둡니다(최대 10). 뼈 갑옷과 망자의 문이 모은 영혼을 모두 써서 강해집니다.' },
    basic: { name: '영혼탄', icon: 'wisp', desc: '천천히 적을 따라가며 하나를 꿰뚫는 녹색 영혼', spread: 0.1, sfx: 'soul' },
    stats(s) { s.maxHp = 95; s.dmg = 14; s.fireRate = 3.3; s.projSpeed = 24; s.projLife = 0.95; s.projSize = 1.05; s.homing += 0.6; s.pierce += 1; },
    skills: [
      { name: '해골 일으키기', icon: 'raise', kind: 'place', cd: 9, range: 14, ring: () => 2.2,
        desc: '정한 자리의 땅을 갈라 해골 전사 둘을 일으킴(영혼이 5개 이상이면 셋). 10초 동안 가장 가까운 적에게 달려가 칼을 휘두름. 해골은 최대 6',
        up: '해골 피해 <b>+45%</b>, 유지 <b>+2초</b>',
        use(h, a) {
          if (!h.auth) return; // the host raises them (it counts the souls) and tells everyone
          const n = (h.res || 0) >= 5 ? 3 : 2, dur = 10 + (h.stats.lanceWidth - 1) * 10, base = sid(h, 1, a.q);
          for (let k = 0; k < n; k++) {
            const b = (k / n) * TAU + 0.5, p = freeSpot(a.x + Math.cos(b) * 1.2, a.z + Math.sin(b) * 1.2, 0.45);
            G.Net.vis('nkSkel', base + '-' + k, R1(p.x), R1(p.z), R1(dur), 0, h.key);
          }
        } },
      { name: '뼈 갑옷', icon: 'ribs', kind: 'self', cd: 12,
        desc: '모은 영혼을 모두 태워 6초 동안 뼈 갑옷: 피해 25 + 영혼 하나당 6을 막음. 입는 순간 뼛조각이 터져 4.5m 안의 적에게 피해(영혼 하나당 +4)',
        up: '뼈 갑옷 대기시간 <b>-15%</b>, 지속 <b>+0.5초</b>',
        use(h) {
          if (shows(h)) vb(h, 'nkArmor', R1(h.x), R1(h.z), h.key);
          if (!h.auth) return;
          const n = h.res || 0, s = h.stats;
          h.res = 0;
          h.shieldHp = Math.max(h.shieldHp || 0, 25 + 6 * n); h.shieldT = 6 + extra(s);
          C.forEachTarget(h.x, h.z, 4.5, (t) => { const [kx, kz] = outward(t, h.x, h.z); C.damage(t, (20 + 4 * n) * s.dmgMult, { kx, kz, knock: 6, source: 'skill', by: h }); });
        } },
      { name: '죽음의 손아귀', icon: 'grasp', kind: 'aim', cd: 10, range: 14, line: (ch, s) => ({ len: 14, w: 2.6 * s.meteorRadius }),
        desc: '조준한 쪽 14m의 땅에서 망령의 손들이 솟아 적을 1.8초 붙잡고 생명을 빨아들임: 피해를 주고 그 15%만큼 회복(최대 25)',
        up: '손아귀 피해 <b>+40%</b>, 폭 <b>+15%</b>',
        use(h, a) {
          const s = h.stats, ang = a.ang, w = 2.6 * s.meteorRadius, x0 = h.x, z0 = h.z;
          h.facing = ang;
          if (shows(h)) vb(h, 'nkGrasp', sid(h, 3, a.q), R1(x0), R1(z0), R2(ang), R1(w), h.key);
          if (!h.auth) return;
          G.Enemies.later(0.25, () => {
            let got = 0;
            C.line(x0, z0, ang, 14, w, (t) => {
              got += C.damage(t, 50 * s.meteorMult * s.dmgMult, { source: 'skill', cls: 'burn', by: h });
              if (t.isBoss) slow(t, 0.5, 1.8); else if (t.rootFor) t.rootFor(1.8);
            });
            if (got > 0 && h.alive) h.heal(Math.min(25, got * 0.15), false);
          });
        } },
    ],
    ult: { name: '망자의 문', icon: 'gate', desc: '조준한 곳에 거대한 뼈의 문을 세움: 6초 동안 해골 전사 10구가 줄지어 쏟아져 나와 적에게 달려들고, 문이 닫히는 순간 모은 영혼을 모두 터뜨려 6m를 휩쓰는 영혼 폭발(영혼 하나당 +15%)' },
    // a soul for every death close by (the host counts them; the gauge reaches the player with its hero)
    onNearKill(h, e) {
      if ((h.res || 0) >= 10 || U.dist2(h.x, h.z, e.x, e.z) > NK_SOUL_R * NK_SOUL_R) return;
      CL.gain(h, 1);
      G.Net.vis('nkSoul', R1(e.x), R1(e.z), h.key);
    },
    ultStart(h) {
      const p = ultSpot(h, 16, 4), id = uid(h), n = h.res || 0, s = h.stats, fa = Math.atan2(h.z - p.z, h.x - p.x);
      h.res = 0;
      G.Net.vis('ultFx', 'necro', R1(h.x), R1(h.z), h.key);
      G.Net.vis('nkGate', id, R1(p.x), R1(p.z), R2(fa), 6.5, h.key);
      for (let k = 0; k < 10; k++) {
        G.Enemies.later(0.7 + k * 0.5, () => {
          const b = fa + U.rand(-0.9, 0.9), q = freeSpot(p.x + Math.cos(b) * 1.8, p.z + Math.sin(b) * 1.8, 0.45);
          G.Net.vis('nkSkel', id + '-' + k, R1(q.x), R1(q.z), 6, 1, h.key);
        });
      }
      G.Enemies.later(6.2, () => {
        G.Net.vis('nkBurst', R1(p.x), R1(p.z), n);
        C.forEachTarget(p.x, p.z, 6, (t) => { const [kx, kz] = outward(t, p.x, p.z); C.damage(t, 90 * (1 + 0.15 * n) * s.dmgMult, { kx, kz, knock: 14, source: 'ult', by: h }); });
      });
    },
    ultTick(h) { h.ultTick = 1; },
    model(h, add, M) {
      const bone = skin(h, 0xe8e2cc, { roughness: 0.85 });
      const hood = add(new THREE.ConeGeometry(0.37, 0.72, 10), M.dark, 0, 2.0, 0.06);
      hood.rotation.x = 0.22;
      add(new THREE.SphereGeometry(0.2, 10, 8).scale(1, 1.1, 0.9), bone, 0, 1.8, -0.12);
      for (const sx of [-1, 1]) add(new THREE.SphereGeometry(0.045, 6, 4), M.glow, sx * 0.08, 1.84, -0.29);
      // the staff: a long dark shaft, a little skull and a green flame on top
      add(new THREE.CylinderGeometry(0.035, 0.04, 2.1, 6), M.dark, 0.55, 1.05, -0.05);
      add(new THREE.SphereGeometry(0.13, 8, 6), bone, 0.55, 2.15, -0.05);
      add(new THREE.ConeGeometry(0.09, 0.32, 6), M.glow, 0.55, 2.4, -0.05);
      // bone pauldrons (they swell while the bone armour holds)
      h.parts.plates = [-1, 1].map((sx) => { const p = add(new THREE.ConeGeometry(0.15, 0.42, 5), bone, sx * 0.42, 1.68, 0); p.rotation.z = sx * -0.6; return p; });
      // the souls it carries, circling at the waist
      const sg = new THREE.SphereGeometry(0.085, 6, 4);
      h.geos.push(sg);
      h.parts.souls = [];
      for (let i = 0; i < 10; i++) { const m = new THREE.Mesh(sg, M.glow); m.visible = false; h.group.add(m); h.parts.souls.push(m); }
    },
    anim(h, dt, t) {
      const n = Math.round(h.res || 0), S = h.parts.souls;
      if (S) for (let i = 0; i < S.length; i++) {
        const m = S[i];
        m.visible = i < n && h.alive;
        if (!m.visible) continue;
        const a = t * 1.8 + (i / Math.max(1, n)) * TAU;
        m.position.set(Math.cos(a) * 0.78, 1.05 + Math.sin(t * 3 + i) * 0.12, Math.sin(a) * 0.78);
      }
      const on = (h.shieldHp || 0) > 0;
      if (h.parts.plates) for (const p of h.parts.plates) p.scale.setScalar(U.damp(p.scale.x, on ? 1.9 : 1, 10, dt));
    },
    look(h) { if (Math.random() < 0.5) G.FX.trail(h.x + U.rand(-0.8, 0.8), h.y + U.rand(0.3, 2.2), h.z + U.rand(-0.8, 0.8), 0x9fff6a, 0.45, 0.5, 2.2); },
  });

  // ---- skeleton warriors: every machine walks them the same way, toward where the host points them ----
  const moveQ = [];
  let moveFrame = -1;
  SUM.skel = {
    make(s) {
      const g = (s.mesh = new THREE.Group()), body = (s.body = new THREE.Group());
      g.add(body);
      const bone = mat('skBone', () => std(0xe8e2cc, { metalness: 0.05, roughness: 0.8 }));
      const rust = mat('skRust', () => std(0x8a7a62, { metalness: 0.6, roughness: 0.5 }));
      const eye = mat('skEye', () => glowM(0x9fff6a, 3));
      addM(body, geo('skSkull', () => new THREE.SphereGeometry(0.24, 10, 8).scale(1, 1.05, 1.1)), bone, 0, 1.62, 0);
      addM(body, geo('skJaw', () => new THREE.BoxGeometry(0.2, 0.08, 0.16)), bone, 0, 1.42, 0.06);
      for (const sx of [-1, 1]) addM(body, geo('skEyeG', () => new THREE.SphereGeometry(0.05, 6, 4)), eye, sx * 0.09, 1.64, 0.21, false);
      addM(body, geo('skSpine', () => new THREE.CylinderGeometry(0.05, 0.05, 0.62, 5)), bone, 0, 1.08, 0);
      for (let i = 0; i < 3; i++) addM(body, geo('skRib', () => new THREE.TorusGeometry(0.2 - 0.02, 0.035, 4, 10, Math.PI * 1.4).rotateX(Math.PI / 2)), bone, 0, 1.3 - i * 0.13, 0).rotation.y = -0.9;
      addM(body, geo('skPelvis', () => new THREE.BoxGeometry(0.34, 0.1, 0.16)), bone, 0, 0.78, 0);
      s.legs = [-1, 1].map((sx) => {
        const l = new THREE.Group();
        l.position.set(sx * 0.12, 0.78, 0);
        body.add(l);
        addM(l, geo('skLeg', () => new THREE.CylinderGeometry(0.045, 0.04, 0.78, 5).translate(0, -0.39, 0)), bone);
        return l;
      });
      s.arm = new THREE.Group();
      s.arm.position.set(0.28, 1.36, 0);
      body.add(s.arm);
      addM(s.arm, geo('skArm', () => new THREE.CylinderGeometry(0.04, 0.035, 0.58, 5).translate(0, -0.29, 0)), bone);
      addM(s.arm, geo('skSword', () => new THREE.BoxGeometry(0.07, 0.85, 0.035).translate(0, -1.0, 0)), rust);
      addM(s.arm, geo('skHilt', () => new THREE.BoxGeometry(0.22, 0.05, 0.06).translate(0, -0.6, 0)), rust);
      const arm2 = addM(body, geo('skArm', () => null), bone, -0.28, 1.36, 0);
      arm2.rotation.z = -0.15;
      s.y = hy(s.x, s.z);
      s.tx = s.x; s.tz = s.z; s.ang = Math.random() * TAU; s.atk = 0; s.atkCd = 0.6; s.rt = 0.1; s.near = null; s.nearT = 0; s.walk = 0;
      g.position.set(s.x, s.y - 1.8, s.z);
      g.scale.setScalar(1.05);
      scene().add(g);
      // up through the ground in a spray of dirt and green light
      G.FX.burst(s.x, s.y + 0.3, s.z, { count: 14, color: 0x9fff6a, intensity: 2.2, spread: 'up', speed: [2, 6], life: [0.3, 0.6], size: [0.35, 0.03] });
      G.FX.gibs(s.x, s.y + 0.3, s.z, 0x5a4a3a, 6, 0.2, 5);
      G.FX.ring(s.x, s.y + 0.15, s.z, 0.3, 1.6, 0.35, 0x9fff6a, 2.2);
      if (near(s.x, s.z) > 0.3) G.Audio.play('boneRaise');
      // one necromancer keeps six raised by its own hand (the gate's dead don't count)
      if (!s.ult) {
        const own = CL.summons.filter((q) => q.kind === 'skel' && q.owner === s.owner && !q.ult && !q.dead);
        if (own.length >= 6) own[0].dead = true;
      }
    },
    update(s, dt, t, o, idle) {
      const g = s.mesh, rise = Math.min(1, s.t / 0.45);
      // the host points every skeleton at its nearest enemy, a few times a second (sent in batches)
      if (G.auth()) {
        if (moveQ.length && moveFrame !== G.Game.time) { G.Net.vis('nkMove', moveQ.splice(0)); moveFrame = G.Game.time; }
        s.rt -= dt;
        if (s.rt <= 0) {
          s.rt = 0.5;
          const q = C.nearest(s.x, s.z, 16);
          if (q && U.dist2(q.x, q.z, s.tx, s.tz) > 1.2) moveQ.push(s.id, R1(q.x), R1(q.z));
        }
      }
      // walk (after rising), stop at arm's length
      let moving = false;
      if (rise >= 1) {
        const dx = s.tx - s.x, dz = s.tz - s.z, d = Math.hypot(dx, dz);
        if (d > 1.25) {
          const st = Math.min(d - 1.2, 6.5 * dt);
          s.x += (dx / d) * st; s.z += (dz / d) * st;
          G.World.resolve(s, 0.4);
          s.ang = U.dampAngle(s.ang, Math.atan2(dz, dx), 12, dt);
          moving = true;
        }
      }
      // whoever is in reach (every machine looks, for the swing; the host deals it)
      s.nearT -= dt;
      if (s.nearT <= 0) { s.nearT = 0.2; s.near = C.nearest(s.x, s.z, 1.9); }
      if (s.near && !s.near.alive) s.near = null;
      if (s.near && !moving) s.ang = U.dampAngle(s.ang, Math.atan2(s.near.z - s.z, s.near.x - s.x), 14, dt);
      s.atkCd -= dt;
      if (s.near && s.atkCd <= 0 && !idle && rise >= 1) {
        s.atkCd = 0.75; s.atk = 0.3;
        if (G.auth()) {
          const st = o.stats, q = s.near;
          C.damage(q, 14 * st.dmgMult * (s.ult ? 0.65 : st.lanceMult), { kx: q.x - s.x, kz: q.z - s.z, knock: 2.5, source: s.ult ? 'ult' : 'minion', by: o });
        }
        if (near(s.x, s.z) > 0.45) G.Audio.play('boneHit');
      }
      s.atk = Math.max(0, s.atk - dt);
      // pose
      s.y = hy(s.x, s.z);
      const fade = s.t > s.dur - 0.35 ? Math.max(0.01, (s.dur - s.t) / 0.35) : 1;
      g.position.set(s.x, s.y - 1.8 * (1 - U.easeOutCubic(rise)) - (1 - fade) * 0.6, s.z);
      face(g, s.ang);
      s.walk += dt * (moving ? 11 : 0);
      for (let i = 0; i < 2; i++) s.legs[i].rotation.x = moving ? Math.sin(s.walk + i * Math.PI) * 0.6 : 0;
      s.body.position.y = moving ? Math.abs(Math.sin(s.walk)) * 0.06 : 0;
      s.arm.rotation.x = s.atk > 0 ? U.lerp(-1.0, -2.9, (s.atk / 0.3) ** 2) : U.damp(s.arm.rotation.x, -0.35, 8, dt);
      g.scale.setScalar(1.05 * fade);
    },
    end(s) {
      dropMesh(s);
      if (s.t > 0.3) {
        G.FX.gibs(s.x, s.y + 1, s.z, 0xe8e2cc, 7, 0.16, 5);
        G.FX.burst(s.x, s.y + 1.2, s.z, { count: 8, color: 0x9fff6a, intensity: 2.2, spread: 'up', speed: [1, 3], life: [0.3, 0.6], size: [0.3, 0.02] });
      }
    },
  };
  V.nkSkel = (id, x, z, dur, ult, key) => { CL.addSummon('skel', { id: String(id), owner: String(key), x: +x || 0, z: +z || 0, dur: U.clamp(+dur || 10, 1, 20), ult: !!ult }); };
  V.nkMove = (list) => {
    if (!Array.isArray(list)) return;
    for (let i = 0; i + 2 < list.length; i += 3) {
      const id = String(list[i]);
      for (const s of CL.summons) if (s.id === id && s.kind === 'skel') { s.tx = +list[i + 1] || s.tx; s.tz = +list[i + 2] || s.tz; }
    }
  };
  V.nkSoul = (x, z, key) => {
    const y0 = hy(x, z) + 1.2;
    G.FX.emitter(0.5, (e) => {
      const h = ownerOf(key);
      if (!h) return;
      const k = Math.min(1, e.t / 0.5), q = k * k, px = U.lerp(x, h.x, q), pz = U.lerp(z, h.z, q), py = U.lerp(y0, h.y + 1.2, q) + Math.sin(k * Math.PI) * 1.5;
      G.FX.P.emit(px, py, pz, 0, 0, 0, 0.3, 0.5, 0.05, 1.6, 3, 1.2, 1, 0, 0);
    });
    if (mine(key)) later(0.5, () => G.Audio.play('soul'));
  };
  V.nkArmor = (x, z, key) => {
    const y = hy(x, z);
    G.FX.gibs(x, y + 1.2, z, 0xe8e2cc, 14, 0.18, 9);
    G.FX.ring(x, y + 0.3, z, 0.5, 4.5, 0.35, 0xd8ffb0, 2.4);
    G.FX.burst(x, y + 1, z, { count: 20, color: 0xb8f07a, intensity: 2.4, spread: 'ring', speed: [4, 9], life: [0.2, 0.4], size: [0.35, 0.03] });
    G.Audio.play('boneRaise');
    if (mine(key)) G.Render.shake(0.2);
  };
  // the grasp: hands of the dead up through the ground along the line, holding fast, then sinking
  SUM.grasp = {
    make(s) {
      const g = (s.mesh = new THREE.Group());
      const m = mat('gpHand', () => new THREE.MeshBasicMaterial({ color: U.hdr(0x9fff6a, 1.4), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
      s.hands = [];
      const n = 7, ca = Math.cos(s.a), sa = Math.sin(s.a);
      for (let i = 0; i < n; i++) {
        const d = 1.6 + (i / (n - 1)) * 12, off = (i % 2 ? 1 : -1) * U.rand(0.2, s.w * 0.35);
        const hx = s.x + ca * d - sa * off, hz = s.z + sa * d + ca * off, hand = new THREE.Group();
        hand.position.set(hx, hy(hx, hz) - 1.4, hz);
        hand.rotation.y = Math.random() * TAU;
        addM(hand, geo('gpPalm', () => new THREE.BoxGeometry(0.42, 0.5, 0.16).translate(0, 0.25, 0)), m, 0, 0, 0, false);
        for (let f = 0; f < 4; f++) addM(hand, geo('gpFinger', () => new THREE.BoxGeometry(0.08, 0.5, 0.08).translate(0, 0.25, 0)), m, -0.15 + f * 0.1, 0.48, 0, false).rotation.x = -0.25;
        addM(hand, geo('gpThumb', () => new THREE.BoxGeometry(0.08, 0.36, 0.08).translate(0, 0.18, 0)), m, 0.24, 0.2, 0, false).rotation.z = -0.7;
        g.add(hand);
        s.hands.push({ g: hand, y: hy(hx, hz), d: i * 0.025, x: hx, z: hz });
      }
      scene().add(g);
      G.Audio.play('vine');
    },
    update(s) {
      for (const hd of s.hands) {
        const t = s.t - hd.d, up = U.easeOutBack(U.clamp(t / 0.25, 0, 1)), down = s.t > s.dur - 0.35 ? Math.max(0, (s.dur - s.t) / 0.35) : 1;
        hd.g.position.y = hd.y - 1.4 + 1.5 * up * down;
        hd.g.scale.setScalar(1.2 + 0.2 * Math.sin(s.t * 6 + hd.d * 40));
        if (Math.random() < 0.1) G.FX.P.emit(hd.x, hd.y + 0.6, hd.z, 0, U.rand(1, 2), 0, 0.5, 0.35, 0.02, 1.4, 3, 1.2, 1, 0.3, 0);
      }
    },
    end(s) { dropMesh(s); },
  };
  V.nkGrasp = (id, x, z, a, w, key) => {
    CL.addSummon('grasp', { id: String(id), owner: String(key), x: +x || 0, z: +z || 0, a: +a || 0, w: U.clamp(+w || 2.6, 1, 6), dur: 2.1 });
    G.FX.beam(+x || 0, hy(x, z) + 0.2, +z || 0, +a || 0, 14, U.clamp(+w || 2.6, 1, 6), 0x7adf4a, 0.5);
  };
  // the gate of the dead
  SUM.gate = {
    make(s) {
      const g = (s.mesh = new THREE.Group()), inner = (s.inner = new THREE.Group());
      g.add(inner);
      const bone = mat('skBone', () => std(0xe8e2cc, { metalness: 0.05, roughness: 0.8 }));
      const dark = mat('gtDark', () => std(0x2a2a24, { metalness: 0.2, roughness: 0.9 }));
      const eye = mat('skEye', () => glowM(0x9fff6a, 3));
      for (const sx of [-1, 1]) {
        addM(inner, geo('gtPillar', () => new THREE.CylinderGeometry(0.45, 0.6, 5, 7).translate(0, 2.5, 0)), dark, sx * 2.2, 0, 0);
        for (let i = 0; i < 4; i++) {
          addM(inner, geo('skSkullB', () => new THREE.SphereGeometry(0.34, 8, 6).scale(1, 1.05, 1.1)), bone, sx * 2.2, 0.7 + i * 1.15, 0.45);
          addM(inner, geo('gtEye', () => new THREE.SphereGeometry(0.06, 5, 4)), eye, sx * 2.2 - 0.12, 0.75 + i * 1.15, 0.75, false);
          addM(inner, geo('gtEye', () => null), eye, sx * 2.2 + 0.12, 0.75 + i * 1.15, 0.75, false);
        }
        const horn = addM(inner, geo('gtHorn', () => new THREE.ConeGeometry(0.3, 1.8, 6)), bone, sx * 2.5, 5.6, 0);
        horn.rotation.z = sx * -0.5;
      }
      addM(inner, geo('gtArch', () => new THREE.TorusGeometry(2.2, 0.38, 6, 16, Math.PI)), dark, 0, 5, 0);
      addM(inner, geo('skSkullB', () => null), bone, 0, 7.15, 0.3).scale.setScalar(1.8);
      s.portal = addM(inner, geo('gtPortal', () => new THREE.CircleGeometry(1, 32)), ownMat(s, addMat(0x7adf4a, 1.6, 0.6, THREE.DoubleSide)), 0, 3.3, 0, false);
      s.portal.scale.set(1.9, 3.1, 1);
      s.swirl = addM(inner, geo('gtSwirl', () => new THREE.RingGeometry(0.55, 1, 24, 1, 0, Math.PI * 1.5)), ownMat(s, addMat(0xd8ffb0, 2.2, 0.7, THREE.DoubleSide)), 0, 3.3, 0.05, false);
      s.swirl.scale.set(1.6, 2.6, 1);
      s.y = hy(s.x, s.z);
      g.position.set(s.x, s.y, s.z);
      face(g, s.a); // the open side looks toward the necromancer
      scene().add(g);
      G.FX.explosion(s.x, s.y, s.z, 4, 0x7adf4a, 0.45 * near(s.x, s.z));
      G.FX.gibs(s.x, s.y + 0.5, s.z, 0x4a3a2a, 14, 0.35, 10);
      G.Audio.play('gateOpen');
      if (mine(s.owner)) G.Render.shake(0.45);
    },
    update(s, dt, t) {
      const up = U.easeOutBack(Math.min(1, s.t / 0.6)), down = s.t > s.dur - 0.5 ? Math.max(0.01, (s.dur - s.t) / 0.5) : 1;
      s.inner.position.y = (up - 1) * 7 - (1 - down) * 3;
      s.inner.scale.setScalar(Math.max(0.01, down));
      s.swirl.rotation.z -= dt * 3;
      s.portal.material.opacity = (0.5 + Math.sin(t * 5) * 0.12) * down;
      if (Math.random() < 0.7) {
        const ca = Math.cos(s.a), sa = Math.sin(s.a), w = U.rand(-1.6, 1.6);
        G.FX.P.emit(s.x - sa * w, s.y + U.rand(0.5, 5.5), s.z + ca * w, ca * U.rand(1, 3), U.rand(-0.5, 1), sa * U.rand(1, 3), 0.8, 0.5, 0.05, 1.4, 3, 1.2, 1, 0.5, 0);
      }
    },
    end(s) {
      dropAll(s);
      if (s.t > 1) { G.FX.gibs(s.x, s.y + 2, s.z, 0xe8e2cc, 18, 0.3, 10); G.FX.smoke(s.x, s.y + 1, s.z, 10, 0x2a3a24, 2.4, 4); }
    },
  };
  V.nkGate = (id, x, z, a, dur, key) => { CL.addSummon('gate', { id: String(id), owner: String(key), x: +x || 0, z: +z || 0, a: +a || 0, dur: U.clamp(+dur || 6.5, 1, 10) }); };
  V.nkBurst = (x, z, n) => {
    const y = hy(x, z), k = 1 + U.clamp(+n || 0, 0, 10) * 0.08;
    G.FX.explosion(x, y, z, 6 * k, 0x7adf4a, 0.6 * near(x, z));
    G.FX.pillar(x, z, 0x9fff6a, 80, 14);
    G.FX.burst(x, y + 1.5, z, { count: 60, color: 0xd8ffb0, intensity: 3, spread: 'ring', speed: [8, 18], life: [0.3, 0.7], size: [0.5, 0.04], drag: 2.5, up: 4 });
    G.Render.flash(x, y + 2, z, 0x7adf4a, 120, 0.5, 26);
    G.Audio.play('explode', { big: true }); G.Audio.play('soul');
  };

  // ======================================================================
  // 12. gravitist: drags everything into one place, then crushes it
  // ======================================================================
  def({
    id: 'gravity', tier: 3, name: '중력술사', role: '적을 한데 끌어모아 짓누르는 마법사', emblem: 'planet', css: '#c87ae8', energy: 0xc87aff, ultDur: 4.2,
    trait: { name: '압축', desc: '6m 안의 적 하나당 주는 피해 +4%(최대 +32%). 중력탄에 맞은 적 둘레 3m의 적은 맞은 자리로 끌려옵니다.' },
    basic: { name: '중력탄', icon: 'orb', desc: '맞은 자리로 둘레의 적을 끌어당기는 보랏빛 구체', spread: 0.1 },
    stats(s) { s.maxHp = 95; s.dmg = 16; s.fireRate = 3.4; s.projSpeed = 30; s.projLife = 0.75; s.projSize = 1.15; },
    skills: [
      { name: '중력 구체', icon: 'gravorb', kind: 'charge', cd: 7, chargeTime: 1, line: (ch, s) => ({ len: 14, w: (2.4 + ch * 2.2) * (0.9 + 0.1 * s.lanceWidth) }),
        desc: '모을수록 커지는 중력 구체를 천천히 굴려 보냄: 14m를 가는 동안 둘레의 적을 계속 빨아들이며 피해를 주고, 끝에서 안으로 무너지며 터짐',
        up: '중력 구체 피해 <b>+45%</b>, 크기 <b>+20%</b>',
        use(h, a) { h.facing = a.ang; if (shows(h)) vb(h, 'gvOrb', sid(h, 1, a.q), R1(h.x), R1(h.z), R2(a.ang), R2(a.ch), h.key); } },
      { name: '반발', icon: 'repulse', kind: 'self', cd: 9,
        desc: '중력을 뒤집어 7m 안의 적을 멀리 튕겨 내며 피해를 주고, 그 안의 적 탄을 모두 지움. 튕겨 난 적은 1초 동안 느려짐',
        up: '반발 대기시간 <b>-15%</b>, 느려짐 <b>+0.5초</b>',
        use(h) {
          if (shows(h)) vb(h, 'gvPush', R1(h.x), R1(h.z), h.key);
          if (!h.auth) return;
          const s = h.stats;
          C.forEachTarget(h.x, h.z, 7, (t) => { const [kx, kz] = outward(t, h.x, h.z); C.damage(t, 30 * s.dmgMult, { kx, kz, knock: 24, source: 'skill', by: h }); slow(t, 0.4, 1 + extra(s)); });
        } },
      { name: '블랙홀', icon: 'blackhole', kind: 'place', cd: 14, range: 16, ring: (s) => 5 * s.meteorRadius,
        desc: '정한 자리에 4초 동안 블랙홀: 5m 안의 적을 한가운데로 빨아들이며 피해를 주고 느리게 만듦(보스는 느려지기만). 끝에 짓눌러 터뜨림',
        up: '블랙홀 피해 <b>+40%</b>, 범위 <b>+15%</b>',
        use(h, a) { if (shows(h)) vb(h, 'gvHole', sid(h, 3, a.q), R1(a.x), R1(a.z), R1(5 * h.stats.meteorRadius), 4, 0, h.key); } },
    ],
    ult: { name: '사건의 지평선', icon: 'horizon', desc: '조준한 곳에 거대한 특이점을 엶: 3.5초 동안 9m 안의 모든 것을 빨아들이며 갈아 대고(보스·정예에겐 1.5배), 끝에 초신성으로 폭발해 10m를 날려 버림' },
    // the press: counted a few times a second, used by every hit
    tick(h, dt) {
      h.pressT = (h.pressT || 0) - dt;
      if (h.pressT > 0) return;
      h.pressT = 0.25;
      let n = 0;
      C.forEachTarget(h.x, h.z, 6, () => { n++; });
      h.press = Math.min(8, n);
    },
    dealtK: (h) => 1 + 0.04 * (h.press || 0),
    onHitK(h, t, dealt, crit, killed, o) {
      if (o.source !== 'bolt') return;
      C.forEachTarget(t.x, t.z, 3, (q) => { if (q !== t) pullIn(q, t.x, t.z, 4.5); });
    },
    fireMod: () => GV_SHOT,
    ultStart(h) {
      const p = ultSpot(h, 18, 5);
      G.Net.vis('ultFx', 'gravity', R1(h.x), R1(h.z), h.key);
      G.Net.vis('gvHole', uid(h), R1(p.x), R1(p.z), 9, 3.5, 1, h.key);
    },
    ultTick(h) { h.ultTick = 1; },
    model(h, add, M) {
      // a high collar, a dark circlet and three small moons on slow orbits
      add(new THREE.CylinderGeometry(0.34, 0.26, 0.32, 10, 1, true), M.cape, 0, 1.62, 0);
      add(new THREE.TorusGeometry(0.26, 0.035, 6, 18), M.dark, 0, 1.95, 0).rotation.x = Math.PI / 2;
      add(new THREE.OctahedronGeometry(0.09, 0), M.glow, 0, 2.02, -0.24);
      const ring = new THREE.Group();
      ring.position.y = 1.35;
      h.body.add(ring);
      const mg = new THREE.SphereGeometry(0.1, 8, 6), core = shine(h, 0x1a0a24, 1);
      h.geos.push(mg);
      h.parts.moons = [0, 1, 2].map((i) => { const m = new THREE.Mesh(mg, i === 1 ? core : M.glow); ring.add(m); return m; });
      h.parts.mring = ring;
    },
    anim(h, dt, t) {
      const ms = h.parts.moons;
      if (!ms) return;
      const sp = h.charging ? 6 : 1.6;
      for (let i = 0; i < 3; i++) {
        const a = t * sp + (i / 3) * TAU, r = 0.75 + (h.charging ? -0.3 * h.lanceCharge : 0);
        ms[i].position.set(Math.cos(a) * r, Math.sin(a * 2 + i) * 0.25, Math.sin(a) * r);
      }
    },
    look(h) {
      const a = Math.random() * TAU, r = U.rand(1.5, 3);
      G.FX.P.emit(h.x + Math.cos(a) * r, h.y + U.rand(0.5, 2), h.z + Math.sin(a) * r, -Math.cos(a) * r * 2, 0, -Math.sin(a) * r * 2, 0.45, 0.4, 0.02, 2.2, 1.0, 3, 1, 0, 0);
    },
  });
  const GV_SHOT = { color: 0xd8a0ff };

  // the gravity orb rolls out slowly along a straight line, so every machine has it in the same place
  SUM.gorb = {
    make(s) {
      const g = (s.mesh = new THREE.Group());
      s.core = addM(g, geo('goCore', () => new THREE.SphereGeometry(1, 16, 12)), mat('goBlack', () => new THREE.MeshBasicMaterial({ color: 0x0a0410 })), 0, 0, 0, false);
      s.halo = addM(g, geo('goHalo', () => new THREE.SphereGeometry(1, 16, 12)), ownMat(s, addMat(0x8a3ae8, 1.1, 0.3)), 0, 0, 0, false);
      s.disk = addM(g, geo('goDisk', () => new THREE.RingGeometry(1.2, 2, 40).rotateX(-Math.PI / 2)), ownMat(s, addMat(0xb070ff, 1.2, 0.45, THREE.DoubleSide)), 0, 0, 0, false);
      s.r = (2.4 + s.ch * 2.2) * 0.5; // the visible body; it pulls from further out
      s.len = 14; s.speed = 9;
      s.dur = s.len / s.speed + 0.35;
      s.tick = 0; s.pull = 0; s.boomed = false;
      s.px = s.x + Math.cos(s.a) * 1.2; s.pz = s.z + Math.sin(s.a) * 1.2;
      g.position.set(s.px, hy(s.px, s.pz) + 1.2, s.pz);
      scene().add(g);
      G.Audio.play('gravPull');
    },
    update(s, dt, t, o, idle) {
      const travel = s.len / s.speed, k = Math.min(1, s.t / travel);
      s.px = s.x + Math.cos(s.a) * (1.2 + s.len * k); s.pz = s.z + Math.sin(s.a) * (1.2 + s.len * k);
      const y = hy(s.px, s.pz) + 1.2, sc = s.t < 0.2 ? s.t / 0.2 : s.t > travel ? Math.max(0.01, 1 - (s.t - travel) / 0.35) : 1;
      s.mesh.position.set(s.px, y, s.pz);
      s.core.scale.setScalar(s.r * 0.45 * sc);
      s.halo.scale.setScalar(s.r * (0.75 + Math.sin(t * 9) * 0.05) * sc);
      s.disk.scale.setScalar(s.r * 0.9 * sc);
      s.disk.rotation.y += dt * 5;
      const R = s.r + 1.8;
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * TAU, rr = R * U.rand(0.8, 1.2);
        G.FX.P.emit(s.px + Math.cos(a) * rr, y + U.rand(-0.8, 0.8), s.pz + Math.sin(a) * rr, -Math.cos(a) * rr * 2.5 - Math.sin(a) * 3, 0, -Math.sin(a) * rr * 2.5 + Math.cos(a) * 3, 0.35, 0.35, 0.02, 2.4, 1.2, 3, 1, 0, 0);
      }
      if (s.t >= travel && !s.boomed) {
        s.boomed = true;
        G.FX.ring(s.px, y - 1, s.pz, R + 1, 0.4, 0.3, 0xe0b0ff, 3);
        G.FX.burst(s.px, y, s.pz, { count: 30, color: 0xd8a0ff, intensity: 3, speed: [4, 10], life: [0.2, 0.4], size: [0.45, 0.03] });
        G.Audio.play('explode');
        if (G.auth()) {
          const st = o.stats, x0 = s.px, z0 = s.pz;
          C.forEachTarget(x0, z0, s.r + 1.2, (q) => C.damage(q, (40 + 90 * s.ch) * st.lanceMult * st.dmgMult, { source: 'skill', by: o, kx: x0 - q.x, kz: z0 - q.z, knock: 4 }));
        }
      }
      if (!G.auth() || idle || s.t >= travel) return;
      s.pull -= dt;
      if (s.pull <= 0) { s.pull = 0.12; C.forEachTarget(s.px, s.pz, R, (q) => pullIn(q, s.px, s.pz, 5)); }
      s.tick -= dt;
      if (s.tick <= 0) {
        s.tick = 0.3;
        const st = o.stats;
        C.forEachTarget(s.px, s.pz, s.r + 0.8, (q) => C.damage(q, (7 + 7 * s.ch) * st.lanceMult * st.dmgMult, { canCrit: false, source: 'skill', by: o }));
      }
    },
    end(s) { dropAll(s); },
  };
  V.gvOrb = (id, x, z, a, ch, key) => { CL.addSummon('gorb', { id: String(id), owner: String(key), x: +x || 0, z: +z || 0, a: +a || 0, ch: U.clamp(+ch || 0, 0, 1) }); };
  V.gvPush = (x, z, key) => {
    const y = hy(x, z);
    G.FX.ring(x, y + 0.4, z, 0.5, 7.5, 0.4, 0xd8a0ff, 3);
    G.FX.ring(x, y + 1.2, z, 0.3, 5.5, 0.35, 0xffffff, 2);
    G.FX.burst(x, y + 1, z, { count: 50, color: 0xc87aff, intensity: 2.6, spread: 'ring', speed: [10, 22], life: [0.25, 0.45], size: [0.45, 0.03], drag: 3 });
    G.Proj.clearEnemyIn(x, z, 7);
    G.Audio.play('gravPush');
    if (mine(key)) G.Render.shake(0.3);
  };
  // the black hole (and, big, the event horizon): pulls, grinds, and at the end bursts
  SUM.hole = {
    make(s) {
      const g = (s.mesh = new THREE.Group()), B = s.big;
      s.core = addM(g, geo('goCore', () => new THREE.SphereGeometry(1, 16, 12)), mat('goBlack', () => new THREE.MeshBasicMaterial({ color: 0x0a0410 })), 0, 0, 0, false);
      s.lens = addM(g, geo('hlLens', () => new THREE.TorusGeometry(1, 0.05, 6, 48).rotateX(Math.PI / 2)), ownMat(s, addMat(0xe8d0ff, 1.5, 0.55)), 0, 0, 0, false);
      s.disk = addM(g, geo('goDisk', () => new THREE.RingGeometry(1.2, 2, 40).rotateX(-Math.PI / 2)), ownMat(s, addMat(B ? 0xff7a3a : 0x9a48f0, 1.25, 0.5, THREE.DoubleSide)), 0, 0, 0, false);
      s.disk2 = addM(g, geo('goDisk', () => null), ownMat(s, addMat(0x6a2ad0, 1.1, 0.35, THREE.DoubleSide)), 0, 0, 0, false);
      // the ground under it goes dark, like a pit
      s.floor = addM(g, geo('fdDisc', () => new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2)), ownMat(s, new THREE.MeshBasicMaterial({ color: 0x12061c, transparent: true, opacity: 0.55, depthWrite: false })), 0, 0, 0, false);
      s.y = hy(s.x, s.z);
      s.h0 = B ? 3.2 : 1.6;
      g.position.set(s.x, s.y, s.z);
      scene().add(g);
      s.pull = 0; s.tick = 0; s.boomed = false;
      s.slowK = B ? 0.35 : 0.5;
      G.Audio.play('blackhole');
      if (B && mine(s.owner)) G.Render.shake(0.4);
    },
    update(s, dt, t, o, idle) {
      const B = s.big, life = s.dur - 0.3, k = U.easeOutBack(Math.min(1, s.t / 0.4)), end = s.t >= life;
      const sc = end ? Math.max(0.01, 1 - (s.t - life) / 0.3) : k, R = s.r;
      s.core.position.y = s.lens.position.y = s.disk.position.y = s.disk2.position.y = s.h0;
      s.core.scale.setScalar(R * 0.22 * sc * (B ? 1.2 : 1));
      s.lens.scale.setScalar(R * 0.3 * sc * (1 + Math.sin(t * 7) * 0.04));
      s.disk.scale.setScalar(R * 0.33 * sc); s.disk.rotation.y += dt * (B ? 4 : 6); s.disk.rotation.x = 0.35;
      s.disk2.scale.setScalar(R * 0.42 * sc); s.disk2.rotation.y -= dt * 2.5; s.disk2.rotation.z = -0.25;
      s.floor.scale.setScalar(R * sc); s.floor.position.y = 0.1;
      // everything spirals in
      const n = B ? 7 : 4;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, rr = R * U.rand(0.6, 1.1);
        G.FX.P.emit(s.x + Math.cos(a) * rr, s.y + U.rand(0.2, s.h0 * 1.6), s.z + Math.sin(a) * rr, -Math.cos(a) * rr * 1.8 - Math.sin(a) * rr * 1.4, 0, -Math.sin(a) * rr * 1.8 + Math.cos(a) * rr * 1.4,
          0.5, 0.45, 0.02, B ? 3 : 2.2, B ? 1.6 : 1, 3, 1, 0, 0);
      }
      if (end && !s.boomed) {
        s.boomed = true;
        s.slowK = 0;
        if (B) {
          // the supernova
          G.FX.explosion(s.x, s.y, s.z, 10, 0xffd0a0, 0.8 * near(s.x, s.z));
          G.FX.ring(s.x, s.y + 0.4, s.z, 0.5, 13, 0.6, 0xffffff, 3);
          G.FX.ring(s.x, s.y + 1.2, s.z, 0.3, 10, 0.5, 0xc87aff, 3);
          G.FX.burst(s.x, s.y + s.h0, s.z, { count: 90, color: 0xffe0c0, intensity: 3.2, speed: [10, 30], life: [0.4, 0.8], size: [0.6, 0.05], drag: 2 });
          G.FX.pillar(s.x, s.z, 0xd8a0ff, 120, 20);
          G.Render.flash(s.x, s.y + 3, s.z, 0xffffff, 220, 0.6, 40);
          G.Audio.play('supernova');
          if (mine(s.owner)) { G.Render.shake(0.8); G.Render.screenFlash(0.35); G.Game.hitstop(0.08); }
        } else {
          G.FX.explosion(s.x, s.y, s.z, R, 0xc87aff, 0.35 * near(s.x, s.z));
          G.Audio.play('explode', { big: true });
        }
        if (G.auth()) {
          const st = o.stats;
          if (B) C.forEachTarget(s.x, s.z, 10, (q) => { const [kx, kz] = outward(q, s.x, s.z); C.damage(q, 130 * st.dmgMult, { kx, kz, knock: 24, source: 'ult', by: o }); });
          else C.forEachTarget(s.x, s.z, R, (q) => C.damage(q, 50 * st.meteorMult * st.dmgMult, { source: 'skill', by: o }));
        }
      }
      if (!G.auth() || idle || end) return;
      s.pull -= dt;
      if (s.pull <= 0) {
        s.pull = 0.12;
        C.forEachTarget(s.x, s.z, R, (q) => pullIn(q, s.x, s.z, B ? 9 : 6.5));
        for (const q of G.Bosses.targets) if (q.alive && U.dist2(q.x, q.z, s.x, s.z) < R * R) { slow(q, 0.4, 0.5); break; }
      }
      s.tick -= dt;
      if (s.tick <= 0) {
        s.tick = 0.25;
        const st = o.stats;
        C.forEachTarget(s.x, s.z, R, (q) => C.damage(q, (B ? 7 * (q.isBoss || q.elite ? 1.5 : 1) : 10 * st.meteorMult) * st.dmgMult, { canCrit: false, source: B ? 'ult' : 'skill', by: o }));
      }
    },
    end(s) { dropAll(s); },
  };
  V.gvHole = (id, x, z, r, dur, big, key) => { CL.addSummon('hole', { id: String(id), owner: String(key), x: +x || 0, z: +z || 0, r: U.clamp(+r || 5, 2, 14), dur: U.clamp(+dur || 4, 1, 8) + 0.3, big: !!big }); };

  // ======================================================================
  // 13. druid: a person of the woods, or a great bear
  // ======================================================================
  const DR_BEAR_S1 = { name: '할퀴기 돌진', icon: 'claw', desc: '조준한 쪽으로 7m 돌진하며 할퀴어 지나간 적에게 피해와 3초 출혈' };
  const DR_BEAR_S3 = { name: '대지 강타', icon: 'quake', desc: '땅을 내리찍어 5m 안의 적에게 피해와 1초 기절, 8m 안의 적이 2.5초 동안 곰만 노리게 도발' };
  def({
    id: 'druid', tier: 3, name: '드루이드', role: '사람과 곰을 오가는 숲의 수호자', emblem: 'paw', css: '#7ec85a', energy: 0x9fe86a, ultDur: 8, orb: false,
    trait: { name: '두 개의 모습', desc: '사람일 때는 가시 씨앗을 쏘고 숲으로 치유하며, 곰일 때는 받는 피해가 25% 줄고 발톱으로 싸웁니다. 모습을 바꿀 때마다 3초 동안 이동 속도 +25%, 체력 5% 회복.' },
    basic: { name: '가시 씨앗', icon: 'thorn', desc: '사람: 두 갈래로 날아가 맞은 적을 잠깐 느리게 하는 가시 씨앗 · 곰: 앞쪽을 넓게 할퀴는 발톱', spread: 0.14 },
    bear: { name: '곰 발톱', icon: 'claw', desc: '앞쪽을 넓게 할퀴어 밀쳐 내는 곰의 발톱', melee: { r: 3.3, arc: 2.2 }, knock: 7, sfx: 'swingHeavy', dmgK: 2.3, color: 0xe8c890 },
    basicOf: (h) => (h.form === 1 ? h.cls.bear : h.cls.basic),
    stats(s) { s.maxHp = 115; s.armor += 1; s.dmg = 11; s.fireRate = 3.6; s.projSpeed = 30; s.projLife = 0.7; s.projCount = 2; s.projSize = 0.9; },
    skills: [
      { name: '가시 덩굴', icon: 'thorn', kind: 'aim', cd: 7, range: 14,
        line: (ch, s, h) => (h && h.form === 1 ? { len: 7, w: 2.8 } : { len: 14, w: 2.4 * (0.85 + 0.15 * s.lanceWidth) }),
        desc: '사람: 조준한 쪽 14m에 가시 덩굴이 솟아 적을 1.8초 묶고 피해 · 곰(할퀴기 돌진): 조준한 쪽으로 7m 돌진하며 할퀴어 피해와 3초 출혈',
        up: '덩굴·돌진 피해 <b>+45%</b>, 크기 <b>+20%</b>',
        view: (h) => (h.form === 1 ? DR_BEAR_S1 : null),
        use(h, a) { if ((a.ch || 0) >= 0.5) bearRush(h, a); else vineLine(h, a); } },
      { name: '변신', icon: 'shift', kind: 'self', cd: 1.5,
        desc: '사람과 곰의 모습을 바꿈. 바꿀 때마다 3초 동안 이동 속도 +25%, 체력 5% 회복',
        up: '변신 대기시간 <b>-15%</b>, 빨라지는 시간 <b>+0.5초</b>',
        use(h, a) { setForm(h, (a.ch || 0) >= 0.5 ? 1 : 0, true); } },
      { name: '치유의 숲', icon: 'grove', kind: 'self', cd: 13,
        desc: '사람: 발밑에 6초 동안 치유의 숲(반지름 5m): 안의 동료는 초당 체력 6 회복, 적은 느려짐 · 곰(대지 강타): 땅을 내리찍어 5m 안의 적에게 피해와 1초 기절, 8m 안의 적을 도발',
        up: '숲·강타 효과 <b>+40%</b>, 범위 <b>+15%</b>',
        view: (h) => (h.form === 1 ? DR_BEAR_S3 : null),
        use(h, a) { if ((a.ch || 0) >= 0.5) bearQuake(h, a); else grove(h, a); } },
    ],
    ult: { name: '세계수 강림', icon: 'worldtree', desc: '그 자리에 8초 동안 거대한 세계수가 솟아남: 솟는 순간 9m 안의 적을 뿌리로 휘감아 2초 묶고 피해. 나무 그늘(9m) 안의 동료는 초당 최대 체력 1.5% 회복과 주는 피해 +15%, 적은 40% 느려지고 매초 가시 뿌리 둘이 적을 꿰뚫음' },
    // which form cast it travels with the cast (so the host runs the same one); the change carries the new form
    castArgs(h, i, a) { a.ch = i === 2 ? (h.form ? 0 : 1) : h.form ? 1 : 0; },
    flags: (h) => (h.form ? 1 : 0),
    applyFlags(h, f) { setForm(h, f & 1, false); },
    viewKey: (h) => h.form,
    rateK: (h) => (h.form === 1 ? 0.66 : 1),
    takenK: (h) => (h.form === 1 ? 0.75 : 1),
    moveK: (h) => (h.formT > 0 ? 1.25 : 1),
    onHitK(h, t, dealt, crit, killed, o) { if (o.source === 'bolt' && h.form !== 1 && !killed) slow(t, 0.25, 1.2); },
    reset(h) { setForm(h, 0, false); },
    ultStart(h) {
      const s = h.stats, x = R1(h.x), z = R1(h.z);
      G.Net.vis('ultFx', 'druid', x, z, h.key);
      G.Net.vis('drTree', uid(h), x, z, 9, 8, h.key);
      C.forEachTarget(x, z, 9, (t) => { C.damage(t, 60 * s.dmgMult, { source: 'ult', by: h }); if (t.isBoss) slow(t, 0.5, 2); else if (t.rootFor) t.rootFor(2); });
    },
    ultTick(h) { h.ultTick = 1; },
    model(h, add, M) {
      const wood = skin(h, 0x7a5a3a, { roughness: 0.9 }), leaf = skin(h, 0x5aa84a, { roughness: 0.8, side: THREE.DoubleSide });
      // antlers, a crown of leaves, a mantle and a staff with a glowing seed
      for (const sx of [-1, 1]) {
        const a1 = add(new THREE.CylinderGeometry(0.025, 0.04, 0.55, 5), wood, sx * 0.16, 2.12, 0.02);
        a1.rotation.z = sx * -0.55;
        const a2 = add(new THREE.CylinderGeometry(0.02, 0.03, 0.3, 5), wood, sx * 0.3, 2.3, 0.02);
        a2.rotation.z = sx * 0.3;
        const a3 = add(new THREE.CylinderGeometry(0.018, 0.025, 0.26, 5), wood, sx * 0.38, 2.22, 0.02);
        a3.rotation.z = sx * -1.2;
      }
      for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU, l = add(new THREE.PlaneGeometry(0.16, 0.26), leaf, Math.cos(a) * 0.24, 1.98, Math.sin(a) * 0.24); l.rotation.set(-0.4, -a, 0); }
      for (const sx of [-1, 1]) { const m = add(new THREE.PlaneGeometry(0.5, 0.36), leaf, sx * 0.34, 1.6, 0.05); m.rotation.set(-1.1, 0, sx * 0.5); }
      add(new THREE.CylinderGeometry(0.035, 0.045, 2.0, 6), wood, 0.55, 1.0, -0.05);
      add(new THREE.SphereGeometry(0.12, 8, 6), M.glow, 0.55, 2.08, -0.05);
      // the bear: shown instead of the person while in bear form
      const fur = skin(h, 0x6a4a32, { roughness: 0.95 }), dark = skin(h, 0x2a1d14, { roughness: 0.9 }), eye = shine(h, 0x9fe86a, 3);
      const b = new THREE.Group();
      const part = (gm, m, x, y, z) => { const me = new THREE.Mesh(gm, m); me.position.set(x, y, z); me.castShadow = true; b.add(me); h.geos.push(gm); return me; };
      part(new THREE.SphereGeometry(0.62, 12, 9).scale(1, 0.85, 1.35), fur, 0, 1.05, 0.05);
      part(new THREE.SphereGeometry(0.5, 12, 9).scale(1.05, 0.95, 1), fur, 0, 1.25, -0.45);
      part(new THREE.SphereGeometry(0.38, 12, 9), fur, 0, 1.45, -0.95);
      part(new THREE.SphereGeometry(0.18, 8, 6).scale(1, 0.85, 1.2), dark, 0, 1.36, -1.28);
      for (const sx of [-1, 1]) {
        part(new THREE.SphereGeometry(0.12, 8, 6), fur, sx * 0.26, 1.78, -0.92);
        part(new THREE.SphereGeometry(0.05, 6, 4), eye, sx * 0.15, 1.53, -1.24);
      }
      h.parts.bearLegs = [];
      for (const [lx, lz] of [[-0.36, -0.55], [0.36, -0.55], [-0.36, 0.5], [0.36, 0.5]]) {
        const l = new THREE.Group();
        l.position.set(lx, 0.72, lz);
        b.add(l);
        const gm = new THREE.CylinderGeometry(0.17, 0.15, 0.72, 8).translate(0, -0.36, 0);
        const me = new THREE.Mesh(gm, fur);
        me.castShadow = true;
        l.add(me);
        h.geos.push(gm);
        h.parts.bearLegs.push(l);
      }
      b.visible = false;
      h.group.add(b);
      h.parts.bear = b;
    },
    anim(h, dt, t) {
      const b = h.parts.bear;
      if (!b) return;
      const bear = h.form === 1;
      b.visible = bear;
      h.body.visible = !bear;
      if (!bear) return;
      const sp = Math.hypot(h.vx, h.vz);
      h.bearWalk = (h.bearWalk || 0) + dt * Math.min(12, sp * 1.4);
      h.parts.bearLegs.forEach((l, i) => { l.rotation.x = sp > 0.8 ? Math.sin(h.bearWalk + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.5 : 0; });
      b.position.y = sp > 0.8 ? Math.abs(Math.sin(h.bearWalk)) * 0.05 : Math.sin(t * 2) * 0.02;
      b.rotation.x = U.damp(b.rotation.x, h.chan || h.dashT > 0 ? 0.15 : 0, 10, dt);
    },
    look(h) { if (Math.random() < 0.5) G.FX.P.emit(h.x + U.rand(-1, 1), h.y + U.rand(1.5, 3), h.z + U.rand(-1, 1), U.rand(-0.5, 0.5), -U.rand(0.5, 1.5), U.rand(-0.5, 0.5), 1.2, 0.3, 0.05, 1.4, 2.8, 1.2, 1, 0.3, 0); },
  });
  // the change of form: every machine runs it (the caster and the host from the cast, the others
  // from the presence flag), so each plays the leaves and the roar once
  function setForm(h, f, cast) {
    f = f ? 1 : 0;
    if ((h.form || 0) === f) return;
    h.form = f;
    h.formT = 3 + (cast ? extra(h.stats) : 0);
    if (h.auth && cast) h.heal(h.stats.maxHp * 0.05, true);
    if (h.chan) h.endChannel(true);
    if (h.alive && h.group && h.group.visible) {
      G.FX.burst(h.x, h.y + 1.2, h.z, { count: 26, color: 0x9fe86a, intensity: 2.4, speed: [3, 8], life: [0.3, 0.6], size: [0.4, 0.04], drag: 2 });
      G.FX.smoke(h.x, h.y + 0.8, h.z, 6, 0x4a5a3a, 1.8, 3);
      G.FX.ring(h.x, h.y + 0.3, h.z, 0.5, 3, 0.35, 0x9fe86a, 2.2);
      if (near(h.x, h.z) > 0.35) { G.Audio.play('transform'); G.Audio.play(f ? 'roar' : 'vine'); }
    }
    if (h === G.Player) { G.UI.setHero(h); G.Touch.setHero(h); }
  }
  function vineLine(h, a) {
    const s = h.stats, ang = a.ang, w = 2.4 * (0.85 + 0.15 * s.lanceWidth), x0 = h.x, z0 = h.z;
    h.facing = ang;
    if (shows(h)) vb(h, 'drVines', R1(x0), R1(z0), R2(ang), R1(w));
    if (!h.auth) return;
    G.Enemies.later(0.2, () => C.line(x0, z0, ang, 14, w, (t) => {
      C.damage(t, 40 * s.lanceMult * s.dmgMult, { source: 'skill', by: h });
      if (t.isBoss) slow(t, 0.5, 1.8); else if (t.rootFor) t.rootFor(1.8);
    }));
  }
  function bearRush(h, a) {
    const s = h.stats, ang = a.ang, x0 = h.x, z0 = h.z;
    const [x1, z1] = h.drive === 'input' ? reach(x0, z0, ang, 7, 0.55) : [a.x, a.z];
    a.x = x1; a.z = z1;
    const len = Math.max(0.5, U.dist(x0, z0, x1, z1));
    if (h.drive === 'input') { h.facing = ang; h.dashDir = { x: Math.cos(ang), z: Math.sin(ang) }; h.dashT = Math.max(0.05, len / 46); h.invuln = Math.max(h.invuln, h.dashT + 0.15); }
    if (shows(h)) vb(h, 'drRush', R1(x0), R1(z0), R1(x1), R1(z1));
    if (!h.auth) return;
    C.line(x0, z0, ang, len + 1, 3, (t) => {
      C.damage(t, 70 * s.lanceMult * s.dmgMult, { kx: Math.cos(ang), kz: Math.sin(ang), knock: 8, source: 'skill', by: h });
      if (t.applyStatus) t.applyStatus('burn', 12 * s.lanceMult, 3);
    });
  }
  function grove(h) {
    const s = h.stats, r = 5 * s.meteorRadius, x = h.x, z = h.z;
    if (shows(h)) vb(h, 'zoneFx', 'grove', R1(x), R1(z), R1(r), 6);
    if (!h.auth) return;
    CL.zones.push({ x, z, r, t: 6, every: 0.5, tick: 0.2, by: h, fn(zn) {
      for (const o of HS.list) if (o.alive && U.dist2(o.x, o.z, zn.x, zn.z) < zn.r * zn.r) o.heal(3 * s.meteorMult, true, h);
      C.forEachTarget(zn.x, zn.z, zn.r, (t) => { C.damage(t, 5 * s.meteorMult * s.dmgMult, { canCrit: false, source: 'zone', by: h }); slow(t, 0.3, 0.7); });
    } });
  }
  function bearQuake(h) {
    const s = h.stats, r = 5 * s.meteorRadius;
    if (shows(h)) vb(h, 'drQuake', R1(h.x), R1(h.z), R1(r), h.key);
    if (!h.auth) return;
    C.forEachTarget(h.x, h.z, r, (t) => { const [kx, kz] = outward(t, h.x, h.z); C.damage(t, 70 * s.meteorMult * s.dmgMult, { kx, kz, knock: 8, source: 'skill', by: h }); stun(t, 1); });
    // everything near wants the bear now
    for (const e of G.Enemies.list) if (e.alive && !e.isBoss && U.dist2(e.x, e.z, h.x, h.z) < 64) { e.target = h; e.tgT = 2.5; }
  }
  V.drVines = (x, z, a, w) => {
    w = U.clamp(+w || 2.4, 1, 6);
    G.FX.telegraph({ shape: 'rect', x, z, angle: a, length: 14, width: w, dur: 0.2, color: 0x7adf4a, k: 1.6 });
    for (let i = 0; i < 9; i++) {
      later(0.2 + i * 0.025, () => {
        const d = 1 + (i / 8) * 13, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d, py = hy(px, pz);
        G.FX.burst(px, py + 0.4, pz, { count: 7, color: 0x6ad84a, intensity: 2, spread: 'up', speed: [3, 7], life: [0.3, 0.6], size: [0.35, 0.03] });
        G.FX.gibs(px, py + 0.3, pz, 0x3a6a2a, 2, 0.18, 4);
      });
    }
    G.Audio.play('vine');
  };
  V.drRush = (x0, z0, x1, z1) => {
    const a = Math.atan2(z1 - z0, x1 - x0), len = Math.max(0.5, U.dist(x0, z0, x1, z1)), y = hy(x0, z0) + 1;
    for (let k = -1; k <= 1; k++) G.FX.beam(x0 - Math.sin(a) * k * 0.45, y, z0 + Math.cos(a) * k * 0.45, a, len, 0.25, 0xe8c890, 0.35);
    G.FX.smoke(x0, y - 0.6, z0, 6, 0x6a5a48, 1.6, 3);
    G.Audio.play('roar');
  };
  V.drQuake = (x, z, r, key) => {
    r = U.clamp(+r || 5, 1, 12);
    const y = hy(x, z);
    G.FX.explosion(x, y, z, r * 0.8, 0xb89060, 0.5 * near(x, z));
    G.FX.gibs(x, y + 0.4, z, 0x6a5a48, 14, 0.35, 10);
    G.FX.ring(x, y + 0.3, z, 0.5, 8, 0.5, 0xffd890, 2.4);
    G.Audio.play('slam'); G.Audio.play('roar');
    if (mine(key)) G.Render.shake(0.45);
  };
  // the world tree
  SUM.tree = {
    make(s) {
      const g = (s.mesh = new THREE.Group());
      const bark = mat('trBark', () => std(0x6a4a32, { metalness: 0, roughness: 0.95 }));
      const leaves = mat('trLeaf', () => std(0x4a9a3a, { metalness: 0, roughness: 0.8 }));
      const leaves2 = mat('trLeaf2', () => std(0x6ac84a, { metalness: 0, roughness: 0.8 }));
      const fruit = mat('trFruit', () => glowM(0xd8ff9a, 3));
      addM(g, geo('trTrunk', () => new THREE.CylinderGeometry(0.55, 1.1, 6, 9).translate(0, 3, 0)), bark);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU, br = addM(g, geo('trBranch', () => new THREE.CylinderGeometry(0.15, 0.32, 3, 6).translate(0, 1.5, 0)), bark, Math.cos(a) * 0.3, 4.6, Math.sin(a) * 0.3);
        br.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
      }
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU, r = i % 2 ? 2.4 : 1.6;
        addM(g, geo('trCanopy', () => new THREE.IcosahedronGeometry(1.7, 0)), i % 2 ? leaves : leaves2, Math.cos(a) * r, 6.6 + (i % 3) * 0.5, Math.sin(a) * r);
      }
      addM(g, geo('trTop', () => new THREE.IcosahedronGeometry(2.1, 0)), leaves2, 0, 8, 0);
      for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU + 0.3; addM(g, geo('trFruitG', () => new THREE.SphereGeometry(0.2, 8, 6)), fruit, Math.cos(a) * 2.6, 6.2 + (i % 2) * 0.8, Math.sin(a) * 2.6, false); }
      // roots running out over the ground
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU, rt = addM(g, geo('trRoot', () => new THREE.ConeGeometry(0.32, 4.2, 5).rotateZ(-Math.PI / 2).translate(2.1, 0, 0)), bark, Math.cos(a) * 0.6, 0.15, Math.sin(a) * 0.6);
        rt.rotation.y = -a;
      }
      s.ring = addM(g, geo('dmEdge', () => new THREE.RingGeometry(0.95, 1, 72).rotateX(-Math.PI / 2)), ownMat(s, addMat(0x9fe86a, 1.8, 0.6)), 0, 0.12, 0, false);
      s.ring.scale.setScalar(s.r);
      s.y = hy(s.x, s.z);
      g.position.set(s.x, s.y, s.z);
      g.scale.setScalar(0.01);
      scene().add(g);
      s.buff = 1.15; s.slowK = 0.6; s.tick = 0.3; s.thorn = 0.8;
      G.FX.explosion(s.x, s.y, s.z, 5, 0x9fe86a, 0.5 * near(s.x, s.z));
      G.FX.gibs(s.x, s.y + 0.5, s.z, 0x5a4a32, 18, 0.35, 12);
      G.FX.pillar(s.x, s.z, 0xd8ff9a, 90, 14);
      G.Audio.play('treeGrow');
      if (mine(s.owner)) G.Render.shake(0.5);
    },
    update(s, dt, t, o, idle) {
      const up = U.easeOutBack(Math.min(1, s.t / 1.0)), down = s.t > s.dur - 0.6 ? Math.max(0.01, (s.dur - s.t) / 0.6) : 1;
      s.mesh.scale.setScalar(Math.max(0.01, 1.15 * up * down));
      s.mesh.rotation.z = Math.sin(t * 0.8) * 0.015;
      s.ring.scale.setScalar(s.r / Math.max(0.01, s.mesh.scale.x));
      s.ring.material.opacity = (0.4 + Math.sin(t * 3) * 0.15) * down;
      if (Math.random() < 0.8) {
        const a = Math.random() * TAU, rr = Math.sqrt(Math.random()) * s.r * 0.9;
        G.FX.P.emit(s.x + Math.cos(a) * rr, s.y + U.rand(5, 9), s.z + Math.sin(a) * rr, U.rand(-0.6, 0.6), -U.rand(0.8, 1.6), U.rand(-0.6, 0.6), 2.2, 0.3, 0.12, 1.2, 2.6, 1, 1, 0.2, 0);
      }
      if (!G.auth() || down < 1) return;
      const st = o.stats;
      s.tick -= dt;
      if (s.tick <= 0) {
        s.tick = 0.5;
        for (const h of HS.list) if (h.alive && U.dist2(h.x, h.z, s.x, s.z) < s.r * s.r) h.heal(h.stats.maxHp * 0.0075, true, o);
      }
      s.thorn -= dt;
      if (s.thorn > 0 || idle) return;
      s.thorn = 1;
      const list = [];
      C.forEachTarget(s.x, s.z, s.r, (q) => list.push(q));
      for (let k = 0; k < 2 && list.length; k++) {
        const q = list.splice(Math.floor(Math.random() * list.length), 1)[0];
        G.Net.vis('drRoot', R1(q.x), R1(q.z));
        C.damage(q, 45 * st.dmgMult, { source: 'ult', by: o, knock: 3, kx: q.x - s.x, kz: q.z - s.z });
      }
    },
    end(s) {
      dropAll(s);
      if (s.t > 1) G.FX.burst(s.x, s.y + 4, s.z, { count: 50, color: 0x9fe86a, intensity: 2.2, speed: [3, 9], life: [0.5, 1], size: [0.45, 0.05], drag: 2 });
    },
  };
  V.drTree = (id, x, z, r, dur, key) => { CL.addSummon('tree', { id: String(id), owner: String(key), x: +x || 0, z: +z || 0, r: U.clamp(+r || 9, 3, 14), dur: U.clamp(+dur || 8, 1, 12) }); };
  V.drRoot = (x, z) => {
    const y = hy(x, z);
    G.FX.burst(x, y + 0.3, z, { count: 12, color: 0x8a6a42, intensity: 1.8, spread: 'up', speed: [4, 9], life: [0.2, 0.45], size: [0.4, 0.03] });
    G.FX.gibs(x, y + 0.2, z, 0x5a4a32, 4, 0.22, 6);
    G.FX.lightning(x, y - 0.2, z, x, y + 2.4, z, 0x9fe86a, 0.3, 0.25, 0.1);
    if (near(x, z) > 0.4) G.Audio.play('vine');
  };

  // ======================================================================
  // 14. blademaster: momentum, and the edge
  // ======================================================================
  const BM = { T0: 0.08, STEP: 0.16 };
  BM.SHEATH = BM.T0 + 3 * BM.STEP + 0.45;
  const BM_BIG = { dmgK: 1.5, rK: 1.15, arcK: 1.25, knockK: 2.2, color: 0xffffff, sfx: 'unsheathe' };
  def({
    id: 'blademaster', tier: 3, name: '검성', role: '기세를 타고 베어 넘기는 검객', emblem: 'katana', css: '#f0a050', energy: 0xffb060, ultDur: 1.4, orb: false,
    resource: { max: 10, name: '기세' },
    trait: { name: '기세', desc: '칼이 적을 벨 때마다 기세 +1(최대 10), 기세 하나당 주는 피해 +2.5%. 맞으면 기세가 절반으로 줄고, 4초 동안 베지 못하면 조금씩 식습니다. 세 번째 휘두름마다 크게 벱니다.' },
    basic: { name: '태도', icon: 'katana', desc: '앞쪽을 베는 근접 공격. 세 번째 휘두름은 더 넓고 강한 큰 베기(×1.5)', melee: { r: 3.3, arc: 1.35 }, knock: 4, sfx: 'swing', color: 0xffd8a0 },
    stats(s) { s.maxHp = 120; s.armor += 2; s.speed *= 1.06; s.dmg = 22; s.fireRate = 2.5; s.crit += 0.06; },
    skills: [
      { name: '발도', icon: 'iai', kind: 'charge', cd: 7, chargeTime: 0.8, line: (ch, s) => ({ len: (5 + 7 * ch) * (0.9 + 0.1 * s.lanceWidth), w: 2.6 }),
        desc: '칼집에 손을 얹고 모았다가 떼면 조준한 쪽으로 최대 12m를 번개처럼 가르며 지나감(그동안 무적). 끝까지 모으면 반드시 치명타',
        up: '발도 피해 <b>+45%</b>, 거리 <b>+20%</b>',
        use(h, a) {
          const s = h.stats, ang = a.ang, ch = U.clamp(a.ch || 0, 0, 1), x0 = h.x, z0 = h.z;
          let x1 = a.x, z1 = a.z;
          if (h.drive === 'input') { [x1, z1] = reach(x0, z0, ang, (5 + 7 * ch) * (0.9 + 0.1 * s.lanceWidth), 0.55); a.x = x1; a.z = z1; }
          const len = Math.max(0.5, U.dist(x0, z0, x1, z1));
          if (h.drive === 'input') { h.facing = ang; h.dashDir = { x: Math.cos(ang), z: Math.sin(ang) }; h.dashT = Math.max(0.05, len / 46); h.invuln = Math.max(h.invuln, h.dashT + 0.25); }
          if (shows(h)) vb(h, 'bmDraw', R1(x0), R1(z0), R1(x1), R1(z1), ch > 0.95 ? 1 : 0, h.key);
          if (!h.auth) return;
          G.Enemies.later(0.1, () => C.line(x0, z0, ang, len + 0.8, 2.4, (t) => C.damage(t, (30 + 60 * ch) * s.lanceMult * s.dmgMult, { crit: ch > 0.95, kx: -Math.sin(ang), kz: Math.cos(ang), knock: 5, source: 'skill', by: h })));
        } },
      { name: '반격 자세', icon: 'parry', kind: 'self', cd: 7,
        desc: '0.6초 동안 칼을 세워 어느 쪽에서 오는 공격이든 받아넘김. 막아 내면 둘레 4.5m를 베어 반격하고(1초 기절) 기세 +3, 발도 대기시간이 바로 돌아옴',
        up: '반격 자세 대기시간 <b>-15%</b>, 자세 <b>+0.2초</b>',
        use(h) {
          h.parryT = 0.6 + extra(h.stats) * 0.4;
          if (shows(h)) vb(h, 'bmGuard', R1(h.x), R1(h.z), h.key);
        } },
      { name: '질풍참', icon: 'windblade', kind: 'aim', cd: 9, range: 18, line: (ch, s) => ({ len: 18, w: 2.4 * s.meteorRadius }),
        desc: '칼을 크게 휘둘러 18m를 날아가는 바람의 칼날을 날림: 지나가는 모든 적을 꿰뚫고, 기세가 많을수록 커지고 아파짐',
        up: '질풍참 피해 <b>+40%</b>, 크기 <b>+15%</b>',
        use(h, a) {
          h.facing = a.ang;
          if (shows(h)) vb(h, 'bmWind', R1(h.x), R1(h.z), R2(a.ang), Math.round(h.res || 0), h.key);
          if (h.auth) windBlade(h, h.x, h.z, a.ang, h.res || 0, false);
        } },
    ],
    ult: { name: '삼연 일섬', icon: 'triple', desc: '눈에 보이지 않는 속도로 세 번 가르며 내달림(그동안 무적): 지나간 자리의 적을 베고, 마지막 일섬은 반드시 치명타. 칼을 거두는 순간 베인 적 모두에게 한 번 더 피해. 기세가 많을수록 강함' },
    dealtK: (h) => 1 + 0.025 * (h.res || 0),
    // every third swing is the big one
    swingMod(h) { h.combo = ((h.combo || 0) + 1) % 3; h.swingN = (h.swingN || 0) + 1; return h.combo === 0 ? BM_BIG : null; },
    onHitK(h, t, dealt, crit, killed, o) {
      if (o.source === 'melee') { if (h.gainSwing !== h.swingN) { h.gainSwing = h.swingN; CL.gain(h, 1); h.calmT = 4; } }
      else if (o.source === 'skill' && G.Game.time - (h.skGainT || 0) > 0.4) { h.skGainT = G.Game.time; CL.gain(h, 2); h.calmT = 4; }
    },
    tick(h, dt) {
      h.calmT = (h.calmT || 0) - dt;
      if (h.calmT > 0 || !(h.res > 0)) return;
      h.coolT = (h.coolT || 0) - dt;
      if (h.coolT <= 0) { h.coolT = 0.8; h.res = Math.max(0, h.res - 1); }
    },
    // the parry, and what a real hit does to momentum
    onTaken(h, amount, sx, sz) {
      if (h.parryT > 0) {
        h.parryT = 0; h.invuln = Math.max(h.invuln, 0.5);
        const s = h.stats;
        G.Net.vis('bmParry', R1(h.x), R1(h.z), h.key);
        C.forEachTarget(h.x, h.z, 4.5, (t) => { const [kx, kz] = outward(t, h.x, h.z); C.damage(t, 80 * s.dmgMult, { kx, kz, knock: 10, source: 'skill', by: h }); stun(t, 1); });
        CL.gain(h, 3); h.calmT = 4;
        return true;
      }
      if (h.res > 0) h.res = Math.floor(h.res / 2);
      return false;
    },
    immune: (h) => h.ultT > 0,
    hidden: (h) => h.hideT > 0,
    ultStart(h) {
      const s = h.stats, a0 = Math.atan2(h.aimZ - h.z, h.aimX - h.x), pts = [R1(h.x), R1(h.z)];
      let x = h.x, z = h.z;
      for (const [a, L] of [[a0, 9], [a0 + Math.PI * 0.72, 7], [a0, 9]]) { const p = reach(x, z, a, L, 0.55); x = p[0]; z = p[1]; pts.push(R1(x), R1(z)); }
      G.Net.vis('ultFx', 'blademaster', pts[0], pts[1], h.key);
      G.Net.vis('bmTriple', pts, h.key);
      const hit = new Set();
      for (let i = 0; i < 3; i++) {
        G.Enemies.later(BM.T0 + (i + 1) * BM.STEP, () => {
          const ax = pts[i * 2], az = pts[i * 2 + 1], bx = pts[i * 2 + 2], bz = pts[i * 2 + 3], a = Math.atan2(bz - az, bx - ax), len = Math.max(0.5, U.dist(ax, az, bx, bz));
          C.line(ax, az, a, len + 0.8, 3.2, (t) => { hit.add(t); C.damage(t, 90 * s.dmgMult, { crit: i === 2, kx: -Math.sin(a), kz: Math.cos(a), knock: 6, source: 'ult', by: h }); });
        });
      }
      G.Enemies.later(BM.SHEATH, () => {
        let n = 0;
        for (const t of hit) {
          if (!t.alive) continue;
          if (n++ < 12) G.Net.vis('bmSever', R1(t.x), R1(t.z));
          C.damage(t, 60 * s.dmgMult, { source: 'ult', cls: 'crit', by: h });
        }
      });
    },
    ultTick(h) { h.ultTick = 1; },
    model(h, add, M) {
      // a topknot, a sash, the scabbard at the hip and the blade in hand
      add(new THREE.SphereGeometry(0.11, 8, 6), M.dark, 0, 2.06, 0.12);
      add(new THREE.CylinderGeometry(0.04, 0.06, 0.18, 6), M.dark, 0, 2.0, 0.2).rotation.x = 1.1;
      add(new THREE.TorusGeometry(0.33, 0.06, 6, 16), M.cape, 0, 1.12, 0).rotation.x = Math.PI / 2;
      const sc = add(new THREE.CylinderGeometry(0.045, 0.04, 1.05, 6), M.dark, -0.38, 1.0, 0.1);
      sc.rotation.set(1.25, 0, 0.25);
      const blade = new THREE.Group();
      blade.position.set(0.5, 1.05, -0.1);
      h.body.add(blade);
      const bg = new THREE.BoxGeometry(0.035, 0.07, 1.15).translate(0, 0, -0.62), hg = new THREE.CylinderGeometry(0.03, 0.03, 0.3, 6).rotateX(Math.PI / 2).translate(0, 0, 0.1), gg = new THREE.CylinderGeometry(0.08, 0.08, 0.03, 10).rotateX(Math.PI / 2);
      for (const [gm, m] of [[bg, M.steel], [hg, M.dark], [gg, M.gold]]) { const me = new THREE.Mesh(gm, m); me.castShadow = true; blade.add(me); h.geos.push(gm); }
      blade.rotation.x = -0.4;
      h.parts.blade = blade;
    },
    anim(h, dt, t) {
      const b = h.parts.blade;
      if (!b) return;
      // the guard: blade upright before the body; otherwise low and ready
      const guard = h.parryT > 0, big = h.combo === 0 && (h.swingN || 0) > 0;
      b.rotation.x = U.damp(b.rotation.x, guard ? 1.45 : -0.4, 18, dt);
      b.rotation.y = U.damp(b.rotation.y, guard ? 0.9 : 0, 18, dt);
      b.scale.setScalar(U.damp(b.scale.x, big ? 1.12 : 1, 8, dt));
      if (guard && Math.random() < 0.5) G.FX.trail(h.x + Math.cos(h.facing) * 0.6, h.y + 1.5, h.z + Math.sin(h.facing) * 0.6, 0xffe0b0, 0.5, 0.2, 2.4);
      if ((h.res || 0) >= 7 && Math.random() < 0.25) G.FX.trail(h.x + U.rand(-0.4, 0.4), h.y + U.rand(0.5, 2), h.z + U.rand(-0.4, 0.4), 0xffb060, 0.35, 0.35, 2.2);
    },
    look(h) { if (h.hideT > 0) return; if (Math.random() < 0.5) G.FX.trail(h.x + U.rand(-0.5, 0.5), h.y + U.rand(0.5, 2), h.z + U.rand(-0.5, 0.5), 0xffd8a0, 0.4, 0.4, 2.2); },
  });
  function windBlade(h, x, z, ang, res, cos) {
    const s = h.stats, k = 1 + 0.03 * U.clamp(res, 0, 10);
    G.Proj.spawnPlayer({ x: x + Math.cos(ang) * 0.9, z: z + Math.sin(ang) * 0.9, y: hy(x, z) + 1.2, angle: ang, speed: 32, life: 0.56, dmg: 32 * s.meteorMult * s.dmgMult * k,
      size: 2.1 * s.meteorRadius * k, pierce: 99, color: 0xffe0b0, source: 'skill', by: h, cos, knock: 6 });
  }
  V.bmDraw = (x0, z0, x1, z1, full, key) => {
    const a = Math.atan2(z1 - z0, x1 - x0), len = Math.max(0.5, U.dist(x0, z0, x1, z1)), y = hy(x0, z0) + 1.1;
    G.FX.beam(x0, y, z0, a, len, full ? 0.9 : 0.55, full ? 0xffffff : 0xffd8a0, 0.35);
    for (let i = 0; i < 10; i++) { const q = i / 10; G.FX.trail(U.lerp(x0, x1, q), y + 0.2, U.lerp(z0, z1, q), 0xffb060, 0.7, 0.3, 2.4); }
    later(0.1, () => { G.FX.burst(x1, hy(x1, z1) + 1, z1, { count: full ? 26 : 14, color: 0xfff0d0, intensity: 3, speed: [4, 10], life: [0.15, 0.3], size: [0.4, 0.02] }); G.Audio.play(full ? 'iai' : 'unsheathe'); });
    if (mine(key) && full) { G.Render.shake(0.3); G.Game.hitstop(0.05); }
  };
  V.bmGuard = (x, z, key) => { G.FX.ring(x, hy(x, z) + 0.3, z, 0.4, 2.2, 0.3, 0xffe0b0, 2.4); G.Audio.play('shieldUp'); };
  V.bmParry = (x, z, key) => {
    const y = hy(x, z);
    G.FX.burst(x, y + 1.3, z, { count: 30, color: 0xfff0c0, intensity: 3.2, speed: [5, 12], life: [0.12, 0.3], size: [0.4, 0.02] });
    G.FX.ring(x, y + 0.4, z, 0.5, 4.8, 0.35, 0xffd890, 3);
    G.Render.flash(x, y + 1.5, z, 0xffe0b0, 90, 0.25, 16);
    G.Audio.play('parry'); G.Audio.play('cut');
    const h = ownerOf(key);
    if (h && h.drive === 'input') {
      h.cd.s1 = 0;
      if (h === G.Player) { G.UI.toast('받아넘김 · 발도 준비됨', 'gold', 1.4); G.Render.shake(0.25); G.Game.hitstop(0.06); }
    }
  };
  V.bmWind = (x, z, a, res, key) => {
    const y = hy(x, z) + 1.2;
    G.FX.burst(x + Math.cos(a), y, z + Math.sin(a), { count: 16, color: 0xffe0b0, intensity: 2.6, speed: [6, 14], life: [0.1, 0.25], size: [0.4, 0.02], dir: { x: Math.cos(a), y: 0, z: Math.sin(a) }, cone: 0.35 });
    G.Audio.play('windSlash');
    const h = ownerOf(key);
    if (h && !G.auth()) windBlade(h, x, z, a, U.clamp(res | 0, 0, 10), true);
  };
  V.bmTriple = (pts, key) => {
    if (!Array.isArray(pts) || pts.length < 8) return;
    const p = pts.slice(0, 8).map((v) => +v || 0), h = ownerOf(key);
    if (h) h.hideT = BM.T0 + 3 * BM.STEP + 0.05;
    G.Audio.play('iai');
    for (let i = 0; i < 3; i++) {
      later(BM.T0 + i * BM.STEP, () => {
        const ax = p[i * 2], az = p[i * 2 + 1], bx = p[i * 2 + 2], bz = p[i * 2 + 3], a = Math.atan2(bz - az, bx - ax), len = Math.max(0.5, U.dist(ax, az, bx, bz)), y = hy(ax, az) + 1.1;
        G.FX.beam(ax, y, az, a, len, i === 2 ? 1.1 : 0.75, i === 2 ? 0xffffff : 0xffd8a0, BM.SHEATH - BM.T0 - i * BM.STEP + 0.1);
        for (let k = 0; k < 8; k++) { const q = k / 8; G.FX.trail(U.lerp(ax, bx, q), y, U.lerp(az, bz, q), 0xffb060, 0.9, 0.35, 2.4); }
        G.FX.burst(bx, y, bz, { count: 14, color: 0xfff0d0, intensity: 3, speed: [4, 10], life: [0.12, 0.25], size: [0.4, 0.02] });
        G.Audio.play('unsheathe');
        // its own player's copy is carried along the cuts
        if (h && h.drive === 'input' && h.alive) { h.x = bx; h.z = bz; h.vx = h.vz = 0; h.facing = a; }
      });
    }
    later(BM.SHEATH, () => {
      const x = p[6], z = p[7], y = hy(x, z);
      G.FX.ring(x, y + 0.4, z, 0.3, 3, 0.3, 0xffe0b0, 3);
      G.Render.flash(x, y + 1.5, z, 0xffffff, 100, 0.3, 18);
      G.Audio.play('clink'); G.Audio.play('iai');
      if (mine(key)) { G.Render.shake(0.45); G.Game.hitstop(0.08); }
    });
  };
  V.bmSever = (x, z) => {
    const y = hy(x, z) + 1.2;
    G.FX.burst(x, y, z, { count: 14, color: 0xffffff, intensity: 3, speed: [4, 9], life: [0.12, 0.28], size: [0.45, 0.02] });
    G.FX.beam(x - 1.2, y, z - 1.2, Math.PI / 4, 2.4, 0.3, 0xffe0b0, 0.25);
  };

  // ======================================================================
  // 15. bard: the whole party fights to its song
  // ======================================================================
  const SONGS = [
    { name: '전진의 노래', color: 0xff8a7a, desc: '공격 속도 +18%' },
    { name: '치유의 노래', color: 0x7aff9a, desc: '초당 체력 2 회복' },
    { name: '바람의 노래', color: 0x7ac8ff, desc: '이동 속도 +15%, 스킬 대기시간 20% 빨리 돎' },
  ];
  const SONG_AURA = [{ rate: 1.18 }, null, { move: 1.15, cd: 1.2 }], SYM_AURA = { rate: 1.18, move: 1.15, cd: 1.2 };
  const BD_R = 10, BELL_R = 6;
  const bdShot = SONGS.map((sg) => ({ color: sg.color }));
  // within reach of a bard's song: near the bard, or near one of its bells
  function inSong(o, h) {
    const R = o.ultT > 0 ? 12 : BD_R;
    if (U.dist2(o.x, o.z, h.x, h.z) < R * R) return true;
    for (const s of CL.summons) if (s.kind === 'bell' && s.owner === o.key && !s.dead && U.dist2(s.x, s.z, h.x, h.z) < BELL_R * BELL_R) return true;
    return false;
  }
  def({
    id: 'bard', tier: 2, name: '음유시인', role: '노래로 모두를 북돋는 지원가', emblem: 'lute', css: '#f59ad2', energy: 0xff9ad8, ultDur: 7,
    trait: { name: '공명', desc: '지금 부르는 노래가 10m 안의 모든 동료(자신 포함)에게 닿습니다. 전진의 노래: 공격 속도 +18% · 치유의 노래: 초당 체력 2 회복 · 바람의 노래: 이동 속도 +15%, 스킬 대기시간 20% 빨리 돎.' },
    basic: { name: '음표', icon: 'notes', desc: '맞으면 다음 적에게 한 번 튕겨 가는 음표(지금 노래의 색)', spread: 0.1, sfx: 'note' },
    stats(s) { s.maxHp = 100; s.dmg = 13.5; s.fireRate = 3.0; s.projSpeed = 28; s.projLife = 0.75; s.projSize = 1.0; s.ricochet += 1; },
    skills: [
      { name: '불협화음', icon: 'discord', kind: 'aim', cd: 6, range: 8, line: (ch, s) => ({ len: 8 * (0.9 + 0.1 * s.lanceWidth), w: 6 }),
        desc: '조준한 쪽 부채꼴(8m)로 귀를 찢는 불협화음: 피해를 주고 멀리 밀쳐 내며 2초 동안 40% 느리게 함',
        up: '불협화음 피해 <b>+45%</b>, 거리 <b>+20%</b>',
        use(h, a) {
          const s = h.stats, ang = a.ang, R = 8 * (0.9 + 0.1 * s.lanceWidth);
          h.facing = ang;
          if (shows(h)) vb(h, 'bdDiscord', R1(h.x), R1(h.z), R2(ang), R1(R));
          if (!h.auth) return;
          C.forEachTarget(h.x, h.z, R, (t) => {
            if (!inCone(h, t, ang, 0.65)) return;
            const [kx, kz] = outward(t, h.x, h.z);
            C.damage(t, 50 * s.lanceMult * s.dmgMult, { kx, kz, knock: 12, source: 'skill', by: h });
            slow(t, 0.4, 2);
          });
        } },
      { name: '노래 바꾸기', icon: 'notes', kind: 'self', cd: 1.5,
        desc: '전진 → 치유 → 바람의 노래 차례로 바꿔 부름',
        up: '노래 바꾸기 대기시간 <b>-15%</b>, 바꿀 때 주변 동료 <b>1초</b> 가속',
        view: (h) => BD_VIEW[h.song || 0],
        use(h, a) {
          const sg = Math.round(U.clamp(a.ch || 0, 0, 1) * 2) % 3;
          h.song = sg;
          if (shows(h)) vb(h, 'bdSong', R1(h.x), R1(h.z), sg, h.key);
          if (!h.auth) return;
          const k = extra(h.stats) * 2;
          if (k > 0) G.Net.vis('chHaste', R1(k), ...HS.list.filter((o) => o.alive && U.dist2(o.x, o.z, h.x, h.z) < BD_R * BD_R).map((o) => o.key));
        } },
      { name: '메아리 종', icon: 'bell', kind: 'place', cd: 12, range: 14, tap: 'feet', ring: (s) => 4.5 * s.meteorRadius,
        desc: '정한 자리에 6초 동안 울리는 종을 세움: 1.2초마다 울려 4.5m 안의 적에게 피해를 주고, 종 둘레 6m 안의 동료에게도 지금의 노래가 닿음. 종은 최대 2',
        up: '종 피해 <b>+40%</b>, 범위 <b>+15%</b>',
        use(h, a) { const p = freeSpot(a.x, a.z, 0.6); if (shows(h)) vb(h, 'bdBell', sid(h, 3, a.q), R1(p.x), R1(p.z), R1(4.5 * h.stats.meteorRadius), 6, h.key); } },
    ],
    ult: { name: '교향곡', icon: 'symphony', desc: '7초 동안 음표 여덟 개가 곁을 돌며 세 노래를 한꺼번에 부름(12m 안의 동료가 셋 모두 받음). 1.2초마다 크레센도가 터져 9m 안의 적에게 피해를 주고 밀쳐 내며, 마지막엔 가장 큰 화음이 11m를 휩씀' },
    castArgs(h, i, a) { if (i === 2) a.ch = (((h.song || 0) + 1) % 3) / 2; },
    flags: (h) => (h.song || 0) & 3,
    applyFlags(h, f) { const sg = f & 3; if (sg <= 2 && sg !== h.song) { h.song = sg; if (h === G.Player) { G.UI.setHero(h); G.Touch.setHero(h); } } },
    viewKey: (h) => h.song || 0,
    fireMod: (h) => bdShot[h.song || 0],
    // the songs reach every hero near (this bard included)
    aura(o, h) {
      if (!inSong(o, h)) return null;
      return o.ultT > 0 ? SYM_AURA : SONG_AURA[o.song || 0];
    },
    // the healing song (and the symphony) mends whoever hears it, on the host
    tick(h, dt) {
      if (h.song !== 1 && !(h.ultT > 0)) return;
      h.songT = (h.songT || 0) - dt;
      if (h.songT > 0) return;
      h.songT = 0.5;
      for (const o of HS.list) if (o.alive && inSong(h, o)) o.heal(1, true, h);
    },
    healUlt: 0.02,
    ultStart(h) {
      G.Net.vis('ultFx', 'bard', R1(h.x), R1(h.z), h.key);
      G.Net.vis('bdSym', uid(h), 7, h.key);
      h.ultTick = 1.2;
    },
    ultTick(h) {
      h.ultTick = 1.2;
      const s = h.stats, last = h.ultT < 1.25;
      G.Net.vis('bdPulse', R1(h.x), R1(h.z), last ? 1 : 0, h.key);
      C.forEachTarget(h.x, h.z, last ? 11 : 9, (t) => { const [kx, kz] = outward(t, h.x, h.z); C.damage(t, (last ? 120 : 45) * s.dmgMult, { kx, kz, knock: last ? 16 : 8, source: 'ult', by: h }); });
    },
    model(h, add, M) {
      const felt = skin(h, 0x7a3a5a, { roughness: 0.85 }), wood = skin(h, 0xb07a4a, { roughness: 0.6 }), plume = skin(h, 0xffe0f0, { roughness: 0.7, side: THREE.DoubleSide });
      // a broad feathered hat
      add(new THREE.CylinderGeometry(0.5, 0.5, 0.04, 18), felt, 0, 1.98, 0);
      add(new THREE.CylinderGeometry(0.22, 0.27, 0.24, 12), felt, 0, 2.1, 0);
      const f = add(new THREE.PlaneGeometry(0.16, 0.62), plume, 0.2, 2.3, 0.1);
      f.rotation.set(0.3, 0.3, -0.5);
      // the lute, slung across the front
      const lute = new THREE.Group();
      lute.position.set(0.1, 1.15, -0.32);
      lute.rotation.set(0.25, 0, 0.75);
      h.body.add(lute);
      const bg = new THREE.SphereGeometry(0.26, 12, 8, 0, TAU, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(1, 1.25, 0.6), ng = new THREE.BoxGeometry(0.07, 0.62, 0.05).translate(0, 0.55, 0), hg = new THREE.CircleGeometry(0.06, 10).rotateY(Math.PI);
      for (const [gm, m, z] of [[bg, wood, 0], [ng, wood, -0.02], [hg, M.dark, -0.006]]) { const me = new THREE.Mesh(gm, m); me.position.z = z; me.castShadow = true; lute.add(me); h.geos.push(gm); }
      h.parts.lute = lute;
      // the song's note, floating over the shoulder in its colour
      const ng2 = new THREE.SphereGeometry(0.09, 8, 6);
      h.geos.push(ng2);
      h.parts.noteM = new THREE.MeshBasicMaterial({ color: U.hdr(SONGS[0].color, 2.6) });
      h.geos.push(h.parts.noteM);
      const note = new THREE.Mesh(ng2, h.parts.noteM);
      h.group.add(note);
      h.parts.note = note;
    },
    anim(h, dt, t) {
      const n = h.parts.note;
      if (!n) return;
      const sg = h.ultT > 0 ? Math.floor(t * 3) % 3 : h.song || 0;
      if (h.parts.noteSong !== sg) { h.parts.noteSong = sg; h.parts.noteM.color.copy(U.hdr(SONGS[sg].color, 2.6)); }
      n.position.set(-0.5 + Math.sin(t * 2) * 0.1, 2.3 + Math.sin(t * 3) * 0.12, 0);
      if (h.parts.lute) h.parts.lute.rotation.z = 0.75 + Math.sin(t * (h.firing ? 18 : 2)) * (h.firing ? 0.06 : 0.02);
      if (Math.random() < 0.06) { const c = SONGS[sg].color; G.FX.trail(h.x + U.rand(-0.6, 0.6), h.y + U.rand(1.6, 2.4), h.z + U.rand(-0.6, 0.6), c, 0.3, 0.6, 2); }
    },
    look() {},
  });
  const BD_VIEW = SONGS.map((sg, i) => ({ name: '노래 바꾸기 · 지금 ' + sg.name, desc: '지금: ' + sg.name + '(' + sg.desc + '). 누르면 ' + SONGS[(i + 1) % 3].name + '로 바꿔 부름' }));
  V.bdDiscord = (x, z, a, R) => {
    R = U.clamp(+R || 8, 2, 14);
    const y = hy(x, z) + 1.2;
    for (let i = 0; i < 4; i++) {
      later(i * 0.05, () => {
        const r = (R * (i + 1)) / 4;
        for (let k = 0; k <= 10; k++) {
          const b = a + (k / 10 - 0.5) * 1.3;
          G.FX.P.emit(x + Math.cos(b) * r, y, z + Math.sin(b) * r, Math.cos(b) * 4, 0, Math.sin(b) * 4, 0.25, 0.55, 0.05, 3, 1.4, 2.6, 1, 2, 0);
        }
      });
    }
    G.Audio.play('discord');
  };
  V.bdSong = (x, z, sg, key) => {
    const s = SONGS[U.clamp(sg | 0, 0, 2)], y = hy(x, z);
    G.FX.ring(x, y + 0.3, z, 0.5, BD_R, 0.6, s.color, 2.4);
    G.FX.burst(x, y + 1.6, z, { count: 22, color: s.color, intensity: 2.6, spread: 'up', speed: [2, 6], life: [0.4, 0.8], size: [0.4, 0.03], drag: 1.5 });
    G.Audio.play('chord');
    const h = ownerOf(key);
    if (h && h === G.Player) G.UI.toast(s.name + ' · ' + s.desc, 'good', 1.6);
  };
  // the echo bell
  SUM.bell = {
    make(s) {
      const g = (s.mesh = new THREE.Group());
      const wood = mat('blWood', () => std(0x8a5a3a, { metalness: 0, roughness: 0.8 })), bronze = mat('blBronze', () => std(0xd6a04e, { metalness: 0.85, roughness: 0.3 }));
      for (const sx of [-1, 1]) addM(g, geo('blPost', () => new THREE.BoxGeometry(0.16, 2.6, 0.16).translate(0, 1.3, 0)), wood, sx * 0.8, 0, 0);
      addM(g, geo('blBeam', () => new THREE.BoxGeometry(1.9, 0.18, 0.2)), wood, 0, 2.6, 0);
      s.swing = new THREE.Group();
      s.swing.position.y = 2.5;
      g.add(s.swing);
      addM(s.swing, geo('blBell', () => new THREE.CylinderGeometry(0.28, 0.62, 0.9, 16, 1, true).translate(0, -0.55, 0)), bronze);
      addM(s.swing, geo('blTop', () => new THREE.SphereGeometry(0.29, 12, 8, 0, TAU, 0, Math.PI / 2).translate(0, -0.12, 0)), bronze);
      s.glow = addM(s.swing, geo('blClapper', () => new THREE.SphereGeometry(0.12, 8, 6)), ownMat(s, addMat(0xffffff, 2.6, 1)), 0, -0.95, 0, false);
      s.ringM = addM(g, geo('dmEdge', () => new THREE.RingGeometry(0.95, 1, 72).rotateX(-Math.PI / 2)), ownMat(s, addMat(0xff9ad8, 1.6, 0.4)), 0, 0.1, 0, false);
      s.ringM.scale.setScalar(BELL_R);
      s.y = hy(s.x, s.z);
      g.position.set(s.x, s.y, s.z);
      g.scale.setScalar(0.01);
      scene().add(g);
      s.ring = 0.6;
      // one bard keeps two bells
      const own = CL.summons.filter((q) => q.kind === 'bell' && q.owner === s.owner && !q.dead);
      if (own.length >= 2) own[0].dead = true;
      G.FX.ring(s.x, s.y + 0.2, s.z, 0.3, 2.5, 0.35, 0xff9ad8, 2.2);
      G.Audio.play('deploy');
    },
    update(s, dt, t, o, idle) {
      s.mesh.scale.setScalar(grow(s, 0.35, 0.4));
      s.ringM.scale.setScalar(BELL_R / Math.max(0.01, s.mesh.scale.x));
      const sg = SONGS[o.song || 0];
      s.glow.material.color.copy(U.hdr(sg.color, 2.6));
      s.ringM.material.color.copy(U.hdr(sg.color, 1.6));
      s.swing.rotation.z = Math.sin(s.t * 9) * 0.35 * Math.max(0, 1 - (s.t % 1.2) * 1.4);
      s.ring -= dt;
      if (s.ring > 0 || idle || s.t < 0.35) return;
      s.ring = 1.2;
      G.FX.ring(s.x, s.y + 0.3, s.z, 0.5, s.r, 0.4, sg.color, 2.6);
      G.FX.burst(s.x, s.y + 2, s.z, { count: 8, color: sg.color, intensity: 2.4, spread: 'ring', speed: [3, 6], life: [0.3, 0.5], size: [0.35, 0.03] });
      if (near(s.x, s.z) > 0.3) G.Audio.play('bell');
      if (!G.auth()) return;
      const st = o.stats;
      C.forEachTarget(s.x, s.z, s.r, (q) => C.damage(q, 10 * st.meteorMult * st.dmgMult, { canCrit: false, source: 'skill', by: o }));
    },
    end(s) { dropAll(s); },
  };
  V.bdBell = (id, x, z, r, dur, key) => { CL.addSummon('bell', { id: String(id), owner: String(key), x: +x || 0, z: +z || 0, r: U.clamp(+r || 4.5, 2, 10), dur: U.clamp(+dur || 8, 1, 14) }); };
  // the symphony: eight notes going round their bard
  SUM.sym = {
    make(s) {
      const g = (s.mesh = new THREE.Group());
      s.notes = [];
      for (let i = 0; i < 8; i++) {
        const sg = SONGS[i % 3], m = ownMat(s, addMat(sg.color, 2.6, 1)), n = new THREE.Group();
        addM(n, geo('syHead', () => new THREE.SphereGeometry(0.22, 10, 8).scale(1.2, 0.9, 0.9)), m, 0, 0, 0, false);
        addM(n, geo('syStem', () => new THREE.BoxGeometry(0.05, 0.75, 0.05).translate(0.24, 0.37, 0)), m, 0, 0, 0, false);
        addM(n, geo('syFlag', () => new THREE.BoxGeometry(0.28, 0.08, 0.05).translate(0.38, 0.7, 0)), m, 0, 0, 0, false);
        g.add(n);
        s.notes.push(n);
      }
      s.floor = addM(g, geo('dmEdge', () => new THREE.RingGeometry(0.95, 1, 72).rotateX(-Math.PI / 2)), ownMat(s, addMat(0xff9ad8, 1.6, 0.5)), 0, 0.1, 0, false);
      s.floor.scale.setScalar(12);
      scene().add(g);
      G.Audio.play('crescendo');
    },
    update(s, dt, t, o) {
      const k = Math.min(1, s.t / 0.4), out = s.t > s.dur - 0.4 ? Math.max(0.01, (s.dur - s.t) / 0.4) : 1;
      s.mesh.position.set(o.x, o.y, o.z);
      for (let i = 0; i < 8; i++) {
        const a = t * 1.4 + (i / 8) * TAU, r = 4 * k;
        const n = s.notes[i];
        n.position.set(Math.cos(a) * r, 1.6 + Math.sin(t * 3 + i) * 0.5, Math.sin(a) * r);
        n.rotation.y = -a;
        n.scale.setScalar(out);
        if (Math.random() < 0.2) G.FX.trail(o.x + n.position.x, o.y + n.position.y, o.z + n.position.z, SONGS[i % 3].color, 0.4, 0.4, 2.4);
      }
      s.floor.material.opacity = 0.35 * out + Math.sin(t * 4) * 0.08;
    },
    end(s) { dropAll(s); },
  };
  V.bdSym = (id, dur, key) => { CL.addSummon('sym', { id: String(id), owner: String(key), x: 0, z: 0, dur: U.clamp(+dur || 7, 1, 10) }); };
  V.bdPulse = (x, z, big, key) => {
    const y = hy(x, z), R = big ? 11 : 9;
    for (let i = 0; i < 3; i++) G.FX.ring(x, y + 0.3 + i * 0.3, z, 0.5, R, 0.45 + i * 0.05, SONGS[i].color, 2.6);
    G.FX.burst(x, y + 1.4, z, { count: big ? 60 : 26, color: 0xffd0f0, intensity: 2.8, spread: 'ring', speed: [6, big ? 18 : 12], life: [0.3, 0.5], size: [0.45, 0.03], drag: 2 });
    G.Audio.play(big ? 'crescendo' : 'chord');
    if (big) { G.Render.flash(x, y + 2, z, 0xff9ad8, 120, 0.4, 24); if (mine(key)) G.Render.shake(0.4); }
  };
})();

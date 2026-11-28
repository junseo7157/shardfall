// ============================================================
// SHARDFALL - audio: procedural WebAudio SFX + adaptive music
// ============================================================
(() => {
  const G = window.G, U = G.U;
  const A = (G.Audio = { ready: false });
  let ctx, master, sfxBus, musicBus, comp, noiseBuf, delay, delayFb, delayWet;
  const last = {};
  const THROTTLE = { shoot: 0.045, hit: 0.03, crit: 0.04, kill: 0.035, pickup: 0.028, enemyShoot: 0.06, lightning: 0.06, explode: 0.07, blade: 0.08, burn: 0.1, slam: 0.1, telegraph: 0.12, portal: 0.15, clink: 0.05,
    flame: 0.12, whirl: 0.2, swing: 0.06, swingHeavy: 0.08, gun: 0.03, turret: 0.08, cannon: 0.1, beamHeal: 0.3, beamHurt: 0.25, cut: 0.05, tick: 0.06, rivet: 0.04, knife: 0.04, bow: 0.05, fireball: 0.05, hawk: 0.3, snap: 0.1,
    shardShot: 0.08, ricochet: 0.04, smite: 0.08, boneHit: 0.06, soul: 0.08, note: 0.06, gravPull: 0.15, vine: 0.1, windSlash: 0.06, bell: 0.2, parry: 0.1 };

  A.init = function () {
    if (A.ready) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { return; }
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    master = ctx.createGain();
    sfxBus = ctx.createGain(); musicBus = ctx.createGain();
    sfxBus.connect(master); musicBus.connect(master); master.connect(comp); comp.connect(ctx.destination);
    // delay for music arps
    delay = ctx.createDelay(1.0); delayFb = ctx.createGain(); delayWet = ctx.createGain();
    delayFb.gain.value = 0.38; delayWet.gain.value = 0.32;
    delay.connect(delayFb); delayFb.connect(delay); delay.connect(delayWet); delayWet.connect(musicBus);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    A.ready = true;
    A.setVolumes();
    setInterval(schedule, 25);
  };

  A.setVolumes = function () {
    if (!A.ready) return;
    const S = G.Settings;
    master.gain.value = S.master;
    sfxBus.gain.value = S.sfx * 0.9;
    musicBus.gain.value = S.music * 0.55;
  };

  // ---------------- primitives ----------------
  function env(g, t, a, d, peak) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  function tone(type, f0, f1, t, a, d, vol, dest = sfxBus, filt = null) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + a + d);
    env(g, t, a, d, vol);
    if (filt) { const f = ctx.createBiquadFilter(); f.type = filt.type || 'lowpass'; f.frequency.value = filt.f; f.Q.value = filt.q || 0.8; o.connect(f); f.connect(g); }
    else o.connect(g);
    g.connect(dest);
    o.start(t); o.stop(t + a + d + 0.05);
    return o;
  }
  function noise(t, a, d, vol, type, f0, f1, q = 1, dest = sfxBus) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf;
    s.loop = true;
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + a + d);
    env(g, t, a, d, vol);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t, Math.random() * 1.5); s.stop(t + a + d + 0.05);
  }
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // ---------------- sfx ----------------
  let pickupChain = 0, pickupT = 0;
  const SFX = {
    shoot(t, o) {
      const p = U.rand(0.92, 1.08) * (o.pitch || 1);
      tone('triangle', 1250 * p, 520 * p, t, 0.003, 0.07, 0.07);
      noise(t, 0.002, 0.04, 0.035, 'highpass', 4000, 3000);
    },
    hit(t) { noise(t, 0.002, 0.05, 0.09, 'bandpass', 2400, 900, 1.5); tone('sine', 260, 120, t, 0.002, 0.05, 0.06); },
    crit(t) { noise(t, 0.002, 0.06, 0.12, 'bandpass', 3200, 1200, 2); tone('square', 1700, 1400, t, 0.002, 0.06, 0.04); },
    kill(t) { noise(t, 0.003, 0.14, 0.14, 'lowpass', 1600, 300); tone('sine', 170, 55, t, 0.003, 0.14, 0.18); },
    explode(t, o) {
      const k = o.big ? 1.5 : 1;
      noise(t, 0.005, 0.6 * k, 0.4, 'lowpass', 1400, 90, 0.7);
      tone('sine', 110, 28, t, 0.005, 0.55 * k, 0.45);
      noise(t, 0.002, 0.12, 0.15, 'highpass', 2500, 1500);
    },
    slam(t) { tone('sine', 80, 30, t, 0.005, 0.6, 0.5); noise(t, 0.01, 0.5, 0.3, 'lowpass', 600, 80); },
    dash(t) { noise(t, 0.01, 0.2, 0.16, 'bandpass', 500, 2600, 1.2); tone('sine', 300, 700, t, 0.01, 0.15, 0.05); },
    nova(t) {
      noise(t, 0.01, 0.5, 0.25, 'highpass', 1500, 6000, 0.8);
      [1320, 1980, 2640, 3520].forEach((f, i) => tone('sine', f, f * 0.98, t + i * 0.02, 0.005, 0.6, 0.05));
      tone('sine', 140, 60, t, 0.005, 0.35, 0.25);
    },
    meteorFall(t) { tone('sawtooth', 1600, 240, t, 0.05, 0.55, 0.05, sfxBus, { f: 2000 }); noise(t, 0.2, 0.4, 0.1, 'bandpass', 800, 300, 2); },
    lanceFire(t, o) {
      const k = o.power || 1;
      tone('sawtooth', 1400, 160, t, 0.004, 0.35, 0.12 * k, sfxBus, { f: 3500 });
      tone('square', 90, 45, t, 0.004, 0.3, 0.12 * k);
      noise(t, 0.003, 0.3, 0.2 * k, 'highpass', 3000, 1200);
    },
    ult(t) {
      [57, 61, 64, 69, 73].forEach((m) => tone('sawtooth', mtof(m), mtof(m), t, 0.08, 1.1, 0.06, sfxBus, { f: 2600 }));
      tone('sine', 70, 35, t, 0.01, 0.9, 0.5);
      noise(t, 0.05, 1.0, 0.2, 'bandpass', 300, 5000, 0.6);
    },
    pickup(t) {
      if (t - pickupT > 0.6) pickupChain = 0;
      pickupT = t;
      const f = 700 * Math.pow(2, Math.min(pickupChain++, 30) / 24);
      tone('sine', f, f * 1.5, t, 0.002, 0.07, 0.07);
    },
    heal(t) { [72, 76, 79, 84].forEach((m, i) => tone('sine', mtof(m), mtof(m), t + i * 0.05, 0.005, 0.2, 0.07)); },
    levelup(t) {
      [60, 64, 67, 72, 76, 79, 84].forEach((m, i) => tone('triangle', mtof(m), mtof(m), t + i * 0.055, 0.005, 0.35, 0.1));
      noise(t, 0.05, 0.8, 0.08, 'highpass', 5000, 9000);
    },
    hurt(t) { tone('square', 200, 70, t, 0.004, 0.2, 0.16, sfxBus, { f: 1200 }); noise(t, 0.003, 0.15, 0.18, 'lowpass', 1200, 200); },
    enemyShoot(t) { tone('sine', 620, 260, t, 0.004, 0.14, 0.06, sfxBus, { f: 1500 }); },
    telegraph(t) { tone('sine', 880, 880, t, 0.005, 0.07, 0.04); tone('sine', 660, 660, t + 0.09, 0.005, 0.07, 0.035); },
    bossRoar(t) {
      const o = tone('sawtooth', 75, 42, t, 0.15, 1.5, 0.3, sfxBus, { f: 500, q: 3 });
      const l = ctx.createOscillator(), lg = ctx.createGain();
      l.frequency.value = 9; lg.gain.value = 9; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + 1.8);
      noise(t, 0.1, 1.4, 0.25, 'lowpass', 400, 120, 2);
    },
    portal(t) { tone('sine', 260, 640, t, 0.05, 0.35, 0.05, sfxBus, { f: 1200 }); },
    chest(t) { [76, 79, 83, 88, 91].forEach((m, i) => tone('triangle', mtof(m), mtof(m), t + i * 0.07, 0.005, 0.3, 0.08)); },
    ui(t) { tone('sine', 900, 1300, t, 0.002, 0.05, 0.06); },
    hover(t) { tone('sine', 1500, 1500, t, 0.002, 0.025, 0.02); },
    waveClear(t) {
      [[60, 64, 67], [65, 69, 72], [67, 71, 74], [72, 76, 79]].forEach((ch, i) =>
        ch.forEach((m) => tone('triangle', mtof(m), mtof(m), t + i * 0.13, 0.01, i === 3 ? 0.9 : 0.15, 0.06)));
    },
    bossDie(t) {
      SFX.explode(t, { big: true }); SFX.explode(t + 0.25, { big: true });
      [69, 65, 62, 57, 50].forEach((m, i) => tone('sawtooth', mtof(m), mtof(m), t + 0.3 + i * 0.12, 0.01, 0.5, 0.06, sfxBus, { f: 1800 }));
    },
    lightning(t) { noise(t, 0.002, 0.12, 0.14, 'highpass', 4500, 2500); tone('square', 2200, 300, t, 0.002, 0.08, 0.03); },
    blade(t) { noise(t, 0.005, 0.08, 0.06, 'bandpass', 1800, 3000, 3); },
    clink(t) { tone('triangle', 2100, 1700, t, 0.002, 0.1, 0.05); tone('sine', 3300, 3100, t, 0.002, 0.06, 0.025); },
    burn(t) { noise(t, 0.01, 0.12, 0.05, 'bandpass', 900, 500, 1); },
    gameOver(t) { [64, 60, 57, 52, 45].forEach((m, i) => tone('triangle', mtof(m), mtof(m), t + i * 0.22, 0.01, 0.7, 0.1)); },
    victory(t) { [60, 64, 67, 72, 67, 72, 76, 79, 84].forEach((m, i) => tone('triangle', mtof(m), mtof(m), t + i * 0.11, 0.005, 0.5, 0.09)); },
    heartbeat(t) { tone('sine', 70, 45, t, 0.005, 0.12, 0.35); tone('sine', 65, 42, t + 0.16, 0.005, 0.12, 0.25); },
    freeze(t) { [2400, 3100, 3900].forEach((f, i) => tone('sine', f, f * 1.05, t + i * 0.03, 0.002, 0.15, 0.025)); },
    reroll(t) { noise(t, 0.01, 0.15, 0.1, 'bandpass', 1200, 4000, 2); },
    // ---- the characters ----
    swing(t) { noise(t, 0.01, 0.11, 0.11, 'bandpass', 700, 2400, 1.4); },
    swingHeavy(t) { noise(t, 0.015, 0.18, 0.14, 'bandpass', 400, 1500, 1.2); tone('sine', 120, 70, t + 0.05, 0.005, 0.12, 0.08); },
    whirl(t) { noise(t, 0.02, 0.2, 0.08, 'bandpass', 600, 1800, 2.5); },
    flame(t) { noise(t, 0.02, 0.16, 0.07, 'lowpass', 1800, 900, 0.7); noise(t, 0.01, 0.1, 0.03, 'highpass', 3000, 2500); },
    fireball(t) { noise(t, 0.005, 0.12, 0.07, 'lowpass', 2200, 600); tone('sine', 300, 150, t, 0.004, 0.08, 0.03); },
    fireDash(t) { noise(t, 0.01, 0.35, 0.2, 'lowpass', 2600, 400, 0.8); tone('sawtooth', 220, 90, t, 0.01, 0.3, 0.05, sfxBus, { f: 900 }); },
    gun(t) { noise(t, 0.001, 0.09, 0.28, 'lowpass', 3500, 600, 0.6); tone('square', 160, 60, t, 0.001, 0.08, 0.12, sfxBus, { f: 1200 }); noise(t, 0.001, 0.03, 0.12, 'highpass', 5000, 4000); },
    reloadStart(t) { tone('square', 900, 700, t, 0.001, 0.03, 0.04); },
    reload(t) { tone('square', 1300, 1100, t, 0.001, 0.025, 0.05); tone('square', 900, 800, t + 0.07, 0.001, 0.03, 0.05); noise(t + 0.12, 0.002, 0.04, 0.06, 'bandpass', 2600, 2000, 3); },
    rivet(t) { tone('square', 700, 380, t, 0.002, 0.05, 0.05, sfxBus, { f: 2400 }); noise(t, 0.001, 0.03, 0.04, 'highpass', 4000, 3000); },
    knife(t) { noise(t, 0.003, 0.06, 0.07, 'bandpass', 3000, 5000, 2); },
    bow(t) { tone('triangle', 420, 180, t, 0.002, 0.09, 0.07); noise(t, 0.002, 0.05, 0.05, 'highpass', 3500, 2500); },
    snipe(t, o) { const k = o.power || 1; tone('triangle', 700, 140, t, 0.002, 0.2, 0.1 * k); noise(t, 0.002, 0.18, 0.12 * k, 'bandpass', 2800, 900, 1.5); },
    snap(t) { tone('square', 1500, 900, t, 0.001, 0.05, 0.08); noise(t, 0.001, 0.08, 0.12, 'bandpass', 2000, 1200, 2); },
    hawk(t) { tone('sawtooth', 2400, 1500, t, 0.02, 0.28, 0.035, sfxBus, { f: 3400, q: 3 }); tone('sine', 2100, 1700, t + 0.08, 0.01, 0.2, 0.025); },
    deploy(t) { tone('square', 300, 600, t, 0.005, 0.1, 0.05, sfxBus, { f: 1600 }); tone('square', 600, 900, t + 0.1, 0.005, 0.08, 0.04, sfxBus, { f: 1800 }); noise(t + 0.18, 0.002, 0.08, 0.08, 'bandpass', 1500, 900, 2); },
    turret(t) { tone('square', 1100, 500, t, 0.001, 0.04, 0.03, sfxBus, { f: 3000 }); },
    cannon(t) { noise(t, 0.003, 0.4, 0.3, 'lowpass', 900, 120, 0.7); tone('sine', 90, 40, t, 0.004, 0.35, 0.3); },
    mineThrow(t) { [0, 0.06, 0.12, 0.18, 0.24].forEach((d) => tone('square', 1600, 1500, t + d, 0.001, 0.025, 0.025)); },
    empCharge(t) { tone('sawtooth', 200, 1800, t, 0.05, 0.45, 0.04, sfxBus, { f: 2400 }); },
    emp(t) { noise(t, 0.002, 0.4, 0.25, 'bandpass', 3000, 600, 1); tone('square', 1800, 90, t, 0.002, 0.35, 0.06, sfxBus, { f: 3000 }); },
    shieldUp(t) { tone('triangle', 520, 780, t, 0.005, 0.15, 0.07); noise(t, 0.005, 0.12, 0.06, 'bandpass', 1800, 2600, 3); },
    bash(t) { tone('sine', 140, 50, t, 0.003, 0.35, 0.4); noise(t, 0.003, 0.3, 0.25, 'lowpass', 1600, 200); tone('triangle', 900, 600, t, 0.002, 0.2, 0.06); },
    throw(t) { noise(t, 0.02, 0.3, 0.08, 'bandpass', 900, 2200, 2); },
    banner(t) { [55, 62, 67].forEach((m, i) => tone('sawtooth', mtof(m), mtof(m), t + i * 0.09, 0.03, 0.5, 0.05, sfxBus, { f: 1400 })); tone('sine', 80, 45, t, 0.01, 0.4, 0.25); },
    dome(t) { [64, 71, 76, 83].forEach((m, i) => tone('sine', mtof(m), mtof(m), t + i * 0.06, 0.01, 0.9, 0.05)); noise(t, 0.05, 0.9, 0.08, 'highpass', 2500, 6000); },
    holyShield(t) { [76, 81, 88].forEach((m, i) => tone('sine', mtof(m), mtof(m) * 1.01, t + i * 0.05, 0.005, 0.5, 0.06)); },
    beamHeal(t) { tone('sine', 1320, 1400, t, 0.02, 0.25, 0.025); },
    beamHurt(t) { tone('sawtooth', 700, 650, t, 0.02, 0.2, 0.02, sfxBus, { f: 1800 }); },
    leap(t) { noise(t, 0.02, 0.35, 0.12, 'bandpass', 400, 1800, 1.2); tone('sine', 200, 420, t, 0.02, 0.3, 0.06); },
    warCry(t) {
      const o = tone('sawtooth', 130, 85, t, 0.05, 0.9, 0.22, sfxBus, { f: 900, q: 2 });
      const l = ctx.createOscillator(), lg = ctx.createGain();
      l.frequency.value = 13; lg.gain.value = 12; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + 1);
      noise(t, 0.05, 0.8, 0.18, 'bandpass', 500, 300, 1.5);
    },
    shadowStep(t) { noise(t, 0.005, 0.18, 0.12, 'bandpass', 3000, 600, 1.5); tone('sine', 900, 200, t, 0.004, 0.15, 0.05); },
    vanish(t) { noise(t, 0.02, 0.5, 0.12, 'lowpass', 2000, 300, 0.8); tone('sine', 600, 300, t, 0.02, 0.4, 0.04); },
    markDeath(t) { tone('sawtooth', 220, 110, t, 0.01, 0.5, 0.06, sfxBus, { f: 900, q: 4 }); tone('sine', 880, 870, t, 0.005, 0.4, 0.03); },
    markBurst(t) { SFX.crit(t); noise(t, 0.003, 0.35, 0.2, 'bandpass', 1400, 300, 1); tone('sine', 300, 60, t, 0.003, 0.3, 0.2); },
    cut(t) { noise(t, 0.002, 0.07, 0.1, 'bandpass', 4000, 1800, 2.5); },
    tick(t) { tone('sine', 1900, 1900, t, 0.001, 0.03, 0.035); },
    tickTock(t) { [0, 0.25, 0.5].forEach((d, i) => tone('sine', i % 2 ? 1500 : 2000, i % 2 ? 1500 : 2000, t + d, 0.001, 0.04, 0.05)); },
    rewind(t) { tone('sine', 1600, 300, t, 0.01, 0.4, 0.06); noise(t, 0.02, 0.35, 0.08, 'bandpass', 4000, 800, 2); },
    haste(t) { [72, 79, 84].forEach((m, i) => tone('triangle', mtof(m), mtof(m + 12), t + i * 0.04, 0.005, 0.18, 0.05)); },
    timeStop(t) { tone('sine', 900, 40, t, 0.01, 1.2, 0.2); noise(t, 0.02, 1.0, 0.12, 'lowpass', 3000, 100, 0.7); [0, 0.5, 1.0].forEach((d) => tone('sine', 1200, 1200, t + 0.3 + d, 0.001, 0.05, 0.05)); },
    timeResume(t) { tone('sine', 60, 700, t, 0.01, 0.4, 0.1); },
    roll(t) { noise(t, 0.01, 0.2, 0.1, 'bandpass', 500, 1200, 1); },
    lasso(t) { noise(t, 0.01, 0.25, 0.09, 'bandpass', 1400, 600, 2); tone('triangle', 500, 900, t, 0.01, 0.2, 0.04); },
    // ---- the ultimates ----
    shardShot(t) { tone('triangle', 2400, 1800, t, 0.002, 0.08, 0.04); tone('sine', 3600, 3200, t, 0.002, 0.06, 0.02); },
    shatter(t) {
      noise(t, 0.003, 0.45, 0.22, 'highpass', 5200, 2400, 0.8);
      [2900, 4100, 3500, 5200, 2300].forEach((f, i) => tone('sine', f, f * 0.96, t + i * 0.03, 0.002, 0.25, 0.035));
      tone('sine', 120, 50, t, 0.004, 0.4, 0.3);
    },
    fortRise(t) {
      tone('sine', 62, 38, t, 0.02, 1.0, 0.4); noise(t, 0.05, 0.9, 0.2, 'lowpass', 420, 90, 0.7);
      [55, 62, 67, 74].forEach((m, i) => tone('sawtooth', mtof(m), mtof(m), t + 0.15 + i * 0.07, 0.04, 0.8, 0.045, sfxBus, { f: 1500 }));
    },
    eagleCry(t) { tone('sawtooth', 2800, 1500, t, 0.03, 0.5, 0.05, sfxBus, { f: 3600, q: 3 }); tone('sine', 3100, 1900, t + 0.05, 0.02, 0.45, 0.03); noise(t, 0.05, 0.5, 0.06, 'bandpass', 900, 2600, 1); },
    phoenix(t) {
      noise(t, 0.05, 0.7, 0.18, 'bandpass', 400, 3200, 1);
      tone('sawtooth', 700, 1500, t, 0.05, 0.5, 0.05, sfxBus, { f: 2600, q: 2 }); tone('sawtooth', 1500, 1100, t + 0.4, 0.02, 0.5, 0.05, sfxBus, { f: 3000, q: 2 });
      tone('sine', 90, 45, t, 0.01, 0.7, 0.3);
    },
    angel(t) { [72, 76, 79, 84, 88].forEach((m, i) => tone('sine', mtof(m), mtof(m), t + i * 0.08, 0.25, 1.4, 0.05)); noise(t, 0.3, 1.2, 0.07, 'highpass', 4000, 7000, 0.7); },
    smite(t) { noise(t, 0.002, 0.25, 0.16, 'highpass', 5000, 1500); tone('triangle', 1800, 700, t, 0.002, 0.25, 0.06); tone('sine', 110, 50, t, 0.004, 0.3, 0.25); },
    bloodCharge(t) { tone('sawtooth', 55, 170, t, 0.05, 1.0, 0.12, sfxBus, { f: 650 }); noise(t, 0.1, 0.9, 0.12, 'lowpass', 300, 1400, 1); tone('sine', 40, 70, t, 0.05, 0.9, 0.25); },
    cleave(t) { noise(t, 0.003, 0.28, 0.22, 'bandpass', 300, 1500, 1); tone('sine', 95, 32, t, 0.004, 0.7, 0.55); noise(t + 0.03, 0.004, 0.55, 0.35, 'lowpass', 1900, 90, 0.7); },
    lockOn(t) { [0, 0.16, 0.32].forEach((d) => tone('square', 1800, 1800, t + d, 0.002, 0.06, 0.04, sfxBus, { f: 3000 })); tone('square', 2400, 2400, t + 0.5, 0.002, 0.25, 0.04, sfxBus, { f: 3200 }); },
    orbital(t) { tone('sawtooth', 2400, 70, t, 0.003, 0.9, 0.14, sfxBus, { f: 3200 }); noise(t, 0.002, 1.0, 0.32, 'highpass', 3200, 700); tone('sine', 75, 28, t, 0.004, 0.9, 0.55); },
    coinFlip(t) { [0, 0.06, 0.13, 0.19, 0.24, 0.3].forEach((d, i) => tone('sine', 3000 + i * 180, 3300 + i * 180, t + d, 0.002, 0.12, 0.03)); },
    ricochet(t) { tone('sine', 2700, 800, t, 0.002, 0.16, 0.05); noise(t, 0.002, 0.08, 0.06, 'bandpass', 3500, 1800, 3); },
    // ---- the newer five ----
    boneRaise(t) { noise(t, 0.02, 0.35, 0.12, 'bandpass', 500, 1800, 1.5); [0, 0.07, 0.15, 0.22].forEach((d) => tone('square', 900 + Math.random() * 300, 500, t + d, 0.001, 0.03, 0.03, sfxBus, { f: 2200 })); },
    boneHit(t) { noise(t, 0.001, 0.06, 0.08, 'bandpass', 1600, 900, 2); tone('square', 420, 200, t, 0.001, 0.05, 0.03, sfxBus, { f: 1800 }); },
    soul(t) { tone('sine', 420, 1260, t, 0.01, 0.22, 0.04); tone('triangle', 840, 1680, t + 0.03, 0.01, 0.18, 0.02); },
    gateOpen(t) { tone('sawtooth', 52, 34, t, 0.1, 1.3, 0.22, sfxBus, { f: 320 }); noise(t, 0.2, 1.1, 0.16, 'lowpass', 300, 120, 0.7); [48, 51, 55].forEach((m, i) => tone('sine', mtof(m), mtof(m) * 0.98, t + i * 0.2, 0.1, 1.0, 0.06)); },
    gravPull(t) { tone('sine', 320, 70, t, 0.01, 0.45, 0.07); tone('sawtooth', 130, 45, t, 0.01, 0.4, 0.05, sfxBus, { f: 500 }); },
    gravPush(t) { noise(t, 0.003, 0.4, 0.28, 'lowpass', 2200, 200, 0.8); tone('sine', 110, 320, t, 0.003, 0.2, 0.18); },
    blackhole(t) { tone('sawtooth', 46, 37, t, 0.15, 1.6, 0.22, sfxBus, { f: 220 }); tone('sine', 92, 58, t, 0.1, 1.5, 0.2); noise(t, 0.2, 1.3, 0.1, 'bandpass', 900, 200, 2); },
    supernova(t) {
      noise(t, 0.003, 1.0, 0.45, 'lowpass', 2600, 80, 0.7); tone('sine', 90, 24, t, 0.004, 1.0, 0.6);
      [60, 67, 72, 76, 79].forEach((m, i) => tone('sawtooth', mtof(m), mtof(m), t + 0.05 + i * 0.03, 0.02, 0.9, 0.04, sfxBus, { f: 2400 }));
    },
    vine(t) { noise(t, 0.01, 0.3, 0.12, 'bandpass', 380, 900, 1.5); tone('triangle', 190, 360, t, 0.01, 0.25, 0.05); },
    roar(t) { tone('sawtooth', 170, 70, t, 0.02, 0.6, 0.18, sfxBus, { f: 900 }); noise(t, 0.02, 0.55, 0.25, 'lowpass', 1000, 260, 0.8); tone('sine', 75, 45, t, 0.02, 0.5, 0.3); },
    transform(t) { tone('sine', 300, 950, t, 0.02, 0.3, 0.06); noise(t, 0.02, 0.35, 0.1, 'bandpass', 700, 2600, 1.2); },
    treeGrow(t) { tone('sine', 110, 230, t, 0.1, 1.0, 0.2); [60, 64, 67, 72, 76].forEach((m, i) => tone('triangle', mtof(m), mtof(m), t + 0.2 + i * 0.1, 0.02, 0.9, 0.05)); noise(t, 0.1, 0.8, 0.1, 'bandpass', 300, 900, 1); },
    bell(t) { [1, 2.76, 5.4].forEach((k, i) => tone('sine', 660 * k, 660 * k, t, 0.002, 1.6 - i * 0.4, 0.07 / (i + 1))); },
    chord(t) { [72, 76, 79, 84].forEach((m, i) => tone('triangle', mtof(m), mtof(m), t + i * 0.05, 0.005, 0.35, 0.05)); },
    discord(t) { tone('sawtooth', 440, 420, t, 0.005, 0.3, 0.05, sfxBus, { f: 1800 }); tone('sawtooth', 466, 480, t, 0.005, 0.3, 0.05, sfxBus, { f: 1800 }); noise(t, 0.005, 0.25, 0.1, 'bandpass', 1200, 600, 1); },
    note(t) { const m = [72, 74, 76, 79, 81, 84][Math.floor(Math.random() * 6)]; tone('triangle', mtof(m), mtof(m), t, 0.005, 0.28, 0.05); },
    crescendo(t) { [60, 64, 67, 72, 76, 79, 84].forEach((m, i) => tone('triangle', mtof(m), mtof(m), t + i * 0.045, 0.01, 0.6, 0.05)); tone('sine', 65, 45, t + 0.3, 0.01, 0.5, 0.3); },
    unsheathe(t) { noise(t, 0.002, 0.2, 0.14, 'highpass', 6500, 3200); tone('triangle', 2600, 3600, t, 0.002, 0.16, 0.04); },
    parry(t) { tone('triangle', 2300, 1900, t, 0.002, 0.18, 0.08); tone('sine', 3400, 3300, t, 0.002, 0.12, 0.04); noise(t, 0.001, 0.08, 0.12, 'bandpass', 3000, 2000, 3); },
    windSlash(t) { noise(t, 0.01, 0.28, 0.16, 'bandpass', 1200, 3200, 1.5); tone('sine', 900, 1500, t, 0.01, 0.2, 0.03); },
    iai(t) { tone('sine', 4200, 900, t, 0.001, 0.09, 0.07); noise(t, 0.001, 0.12, 0.2, 'highpass', 6000, 2500); tone('sine', 120, 50, t + 0.02, 0.003, 0.25, 0.25); },
  };

  A.play = function (name, o = {}) {
    if (!A.ready) return;
    const t = ctx.currentTime;
    const th = THROTTLE[name];
    if (th && last[name] && t - last[name] < th) return;
    last[name] = t;
    const fn = SFX[name];
    if (fn) { try { fn(t + 0.005, o); } catch (e) { console.warn('sfx error', name, e); } }
  };

  // continuous lance charge hum
  A.loop = function () {
    if (!A.ready) return { set() {}, stop() {} };
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth'; o2.type = 'sine';
    f.type = 'bandpass'; f.Q.value = 4; f.frequency.value = 500;
    g.gain.value = 0.0001;
    o.connect(f); o2.connect(g); f.connect(g); g.connect(sfxBus);
    o.start(); o2.start();
    return {
      set(v) {
        const t = ctx.currentTime;
        o.frequency.setTargetAtTime(160 + v * 520, t, 0.03);
        o2.frequency.setTargetAtTime(320 + v * 1040, t, 0.03);
        f.frequency.setTargetAtTime(400 + v * 2400, t, 0.03);
        g.gain.setTargetAtTime(0.03 + v * 0.07, t, 0.03);
      },
      stop() {
        const t = ctx.currentTime;
        g.gain.setTargetAtTime(0.0001, t, 0.02);
        o.stop(t + 0.15); o2.stop(t + 0.15);
      },
    };
  };

  // ---------------- music ----------------
  const PROG = {
    calm: [[50, [0, 3, 7]], [46, [0, 4, 7]], [53, [0, 4, 7]], [48, [0, 4, 7]]],
    combat: [[50, [0, 3, 7]], [46, [0, 4, 7]], [53, [0, 4, 7]], [48, [0, 4, 7]]],
    boss: [[50, [0, 3, 7]], [46, [0, 4, 7]], [43, [0, 3, 7]], [45, [0, 4, 7]]],
  };
  const TEMPO = { menu: 92, calm: 100, combat: 120, boss: 132 };
  const M = { mode: 'off', next: null, step: 0, bar: 0, time: 0 };

  A.music = function (mode) {
    if (!A.ready) { M.pending = mode; return; }
    if (M.mode === mode && !M.next) return;
    if (M.mode === 'off') { M.mode = mode; M.time = ctx.currentTime + 0.1; M.step = 0; M.bar = 0; }
    else M.next = mode;
  };

  function pad(t, notes, dur) {
    for (const m of notes) {
      for (const det of [-8, 8]) {
        const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = det;
        f.type = 'lowpass'; f.frequency.value = 900; f.Q.value = 0.5;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.018, t + 0.5);
        g.gain.setValueAtTime(0.018, t + dur - 0.1);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.7);
        o.connect(f); f.connect(g); g.connect(musicBus);
        o.start(t); o.stop(t + dur + 0.8);
      }
    }
  }
  function pluck(t, m, vol, type = 'triangle', toDelay = true) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = mtof(m);
    env(g, t, 0.004, 0.22, vol);
    o.connect(g); g.connect(musicBus);
    if (toDelay) g.connect(delay);
    o.start(t); o.stop(t + 0.3);
  }
  function bass(t, m, len, hard) {
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = hard ? 'square' : 'sawtooth'; o.frequency.value = mtof(m);
    f.type = 'lowpass'; f.Q.value = hard ? 6 : 3;
    f.frequency.setValueAtTime(180, t);
    f.frequency.exponentialRampToValueAtTime(hard ? 1400 : 800, t + 0.02);
    f.frequency.exponentialRampToValueAtTime(160, t + len);
    env(g, t, 0.005, len, hard ? 0.11 : 0.12);
    o.connect(f); f.connect(g); g.connect(musicBus);
    o.start(t); o.stop(t + len + 0.05);
  }
  function kick(t) { tone('sine', 140, 38, t, 0.002, 0.28, 0.5, musicBus); }
  function snare(t) { noise(t, 0.002, 0.16, 0.16, 'bandpass', 1900, 1500, 0.9, musicBus); tone('triangle', 220, 160, t, 0.002, 0.08, 0.08, musicBus); }
  function hat(t, open) { noise(t, 0.001, open ? 0.12 : 0.035, 0.05, 'highpass', 8000, 8000, 1, musicBus); }

  const ARP = [0, 1, 2, 3, 2, 1, 0, 2, 1, 3, 2, 4, 3, 2, 1, 2];
  function playStep(step, t) {
    const mode = M.mode;
    if (mode === 'off') return;
    const prog = PROG[mode === 'menu' ? 'calm' : mode] || PROG.combat;
    const [root, iv] = prog[M.bar % prog.length];
    const spb = 60 / TEMPO[mode] / 4;
    if (step === 0) pad(t, iv.map((x) => root + 12 + x), spb * 16);
    const tones = [root + 24 + iv[0], root + 24 + iv[1], root + 24 + iv[2], root + 36 + iv[0], root + 36 + iv[1]];
    if (mode === 'menu') {
      if (step % 4 === 0) pluck(t, tones[ARP[(step / 4 + M.bar * 4) % 16] % 5], 0.035);
      return;
    }
    if (mode === 'calm') {
      if (step % 2 === 0) pluck(t, tones[ARP[step] % 5], 0.03);
      if (step === 0 || step === 10) bass(t, root - 12, spb * 5, false);
      return;
    }
    const boss = mode === 'boss';
    pluck(t, tones[ARP[step] % 5] + (boss && step % 8 === 7 ? 1 : 0), boss ? 0.035 : 0.03, boss ? 'square' : 'triangle');
    const bp = boss ? [1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1] : [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1];
    if (bp[step]) bass(t, root - 12 + (step === 7 || step === 15 ? 12 : 0), spb * 1.6, boss);
    if (step === 0 || step === 8 || (boss && (step === 4 || step === 12)) || (step === 14 && M.bar % 2 === 1)) kick(t);
    if (step === 4 || step === 12) snare(t);
    if (boss ? step % 2 === 1 : step % 4 === 2) hat(t, step === 14);
  }

  function schedule() {
    if (!A.ready || M.mode === 'off') {
      if (A.ready && M.pending) { const p = M.pending; M.pending = null; A.music(p); }
      return;
    }
    if (ctx.state !== 'running') return;
    if (M.time < ctx.currentTime - 0.5) M.time = ctx.currentTime + 0.05;
    while (M.time < ctx.currentTime + 0.12) {
      playStep(M.step, M.time);
      M.time += 60 / TEMPO[M.mode] / 4;
      M.step = (M.step + 1) % 16;
      if (M.step === 0) {
        M.bar++;
        if (M.next) {
          M.mode = M.next; M.next = null;
          if (M.mode === 'off') break;
        }
      }
    }
    delay.delayTime.setTargetAtTime((60 / TEMPO[M.mode] || 0.5) * 0.75, ctx.currentTime, 0.1);
  }
})();

// ============================================================
// SHARDFALL - audio: procedural WebAudio SFX + adaptive music
// ============================================================
(() => {
  const G = window.G, U = G.U;
  const A = (G.Audio = { ready: false });
  let ctx, master, sfxBus, musicBus, comp, noiseBuf, delay, delayFb, delayWet;
  const last = {};
  const THROTTLE = { shoot: 0.045, hit: 0.03, crit: 0.04, kill: 0.035, pickup: 0.028, enemyShoot: 0.06, lightning: 0.06, explode: 0.07, blade: 0.08, burn: 0.1, slam: 0.1, telegraph: 0.12, portal: 0.15, clink: 0.05 };

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

// ============================================================
// SHARDFALL - vis: named visual moments. The host plays them and mirrors them to
// co-op clients (G.Net.vis), so every argument is plain JSON (numbers / short strings).
// ============================================================
(() => {
  const G = window.G, U = G.U;
  const V = (G.Vis = {});
  const mine = (key) => !!G.Player && key === G.Player.key;
  const near = (x, z) => {
    const P = G.Player;
    if (!P) return 1;
    return U.clamp(1.25 - U.dist(x, z, P.x, P.z) / 28, 0.12, 1);
  };
  const hy = (x, z) => G.World.heightAt(x, z);
  const PAL = () => G.HERO_PAL;

  V.boom = (x, z, r, color, shake) => {
    G.FX.explosion(x, hy(x, z), z, r, color, (shake || 0) * near(x, z));
    G.Audio.play('explode');
  };
  V.link = (x0, z0, x1, z1) => {
    G.FX.lightning(x0, 1.2, z0, x1, 1.2, z1, 0xc9b8ff, 0.2, 0.18);
    G.FX.spark(x1, 1.2, z1, 0xc9b8ff, 5);
    G.Audio.play('lightning');
  };
  V.strike = (x, z, color) => {
    G.FX.lightning(x + U.rand(-1.5, 1.5), 15, z + U.rand(-1.5, 1.5), x, 0.5, z, color, 0.32, 0.22, 0.9);
    G.FX.spark(x, 0.6, z, color, 9, 8);
    G.Audio.play('lightning');
  };
  V.heal = (x, z, n) => {
    const y = hy(x, z);
    G.FX.dmgNumber(x, y + 1.9, z, '+' + n, 'heal');
    G.FX.burst(x, y + 1, z, { count: 10, color: 0x7ff0a0, intensity: 1.8, speed: [1, 3], life: [0.4, 0.8], size: [0.35, 0.02], spread: 'up', drag: 2, jitter: 0.5 });
  };
  V.phoenix = (x, z, key) => {
    G.FX.explosion(x, hy(x, z), z, 6, 0xffa040, 0.6 * near(x, z));
    G.FX.pillar(x, z, 0xffb050, 60, 10);
    G.Audio.play('levelup');
    if (mine(key)) G.UI.banner('다시 일어섰다', '불사조 깃털이 타올랐습니다', 'gold');
  };
  V.heroDie = (x, z, ci) => {
    const p = PAL()[ci] || PAL()[0], y = hy(x, z);
    G.FX.explosion(x, y + 0.5, z, 4, p.energy, 0.5 * near(x, z));
    G.FX.gibs(x, y + 1, z, p.robe, 14, 0.3, 8);
  };
  V.lance = (x, z, a, w, full, ci, key) => {
    const p = PAL()[ci] || PAL()[0], y = hy(x, z) + 1.4, col = full ? 0xffe28a : p.energy;
    G.FX.beam(x, y, z, a, 28, w * 1.6, col, 0.35);
    G.FX.burst(x + Math.cos(a), y, z + Math.sin(a), { count: 18, color: col, intensity: 2.4, speed: [6, 16], life: [0.15, 0.35], size: [0.4, 0.02], dir: { x: Math.cos(a), y: 0, z: Math.sin(a) }, cone: 0.25 });
    G.Audio.play('lanceFire', { power: full ? 1.2 : 0.8 });
    if (mine(key)) G.Render.shake(full ? 0.4 : 0.18);
  };
  V.nova = (x, z, key) => {
    const y = hy(x, z);
    G.FX.ring(x, y + 0.2, z, 0.5, 7.5, 0.45, 0xbfe4ff, 2.4);
    G.FX.ring(x, y + 0.4, z, 0.3, 5.2, 0.35, 0xffffff, 1.6);
    G.FX.burst(x, y + 0.6, z, { count: 60, color: 0xcfeaff, intensity: 2, spread: 'ring', speed: [8, 20], life: [0.3, 0.6], size: [0.5, 0.05], drag: 3.5, up: 2 });
    G.Render.flash(x, y + 2, z, 0xbfe4ff, 70, 0.35, 20);
    G.Audio.play('nova');
    if (mine(key)) G.Render.shake(0.3);
  };
  V.ultStart = (x, z, key) => {
    const y = hy(x, z);
    G.FX.pillar(x, z, 0xffc35a, 80, 12);
    G.FX.ring(x, y + 0.3, z, 1, 12, 0.6, 0xffc35a, 2.6);
    G.Audio.play('ult');
    if (mine(key)) { G.UI.banner('파편 폭풍', '', 'gold'); G.Render.screenFlash(0.2); G.Render.shake(0.4); }
    else {
      const h = G.Heroes.get(key);
      if (h && h.name) G.UI.toast(h.name + ' · 파편 폭풍', 'gold', 1.6);
    }
  };
  V.ring = (x, z, r0, r1, life, color) => G.FX.ring(x, hy(x, z) + 0.2, z, r0, r1, life, color, 2.2);
  V.pillar = (x, z, color) => G.FX.pillar(x, z, color, 45, 9);
  V.slam = (x, z, r) => {
    const y = hy(x, z);
    G.FX.ring(x, y + 0.2, z, 0.5, r, 0.4, 0xffa060, 2.2);
    G.FX.smoke(x, y + 0.4, z, 10, 0x4a3a34, 2, 5);
    G.FX.gibs(x, y + 0.4, z, 0x6e7f9a, 6, 0.25, 7);
    G.Render.shake(0.25 * near(x, z));
    G.Audio.play('slam');
  };
  V.bigSlam = (x, z, r, color) => {
    const y = hy(x, z);
    G.FX.explosion(x, y, z, r, color || 0xff8a3a, 0.7 * near(x, z));
    G.FX.gibs(x, y + 0.5, z, 0x6b6f86, 18, 0.4, 12);
    G.Audio.play('slam');
  };
  V.bossBoom = (x, y, z, r, color) => G.FX.explosion(x, y, z, r, color, 0.35 * near(x, z));
  V.bossFinal = (x, z, color) => {
    G.FX.explosion(x, hy(x, z) + 1, z, 9, 0xffffff, 0.9 * near(x, z));
    G.FX.pillar(x, z, color, 120, 18);
    G.FX.gibs(x, 2, z, 0x5a4a5a, 30, 0.6, 14);
    G.Render.screenFlash(0.5);
  };
  V.chestOpen = (x, z, color) => {
    const y = hy(x, z);
    G.FX.burst(x, y + 0.8, z, { count: 50, color, intensity: 2.6, spread: 'up', speed: [4, 10], life: [0.5, 1], size: [0.4, 0.03], drag: 1.5, jitter: 0.4 });
    G.Render.flash(x, y + 2, z, color, 50, 0.5, 14);
    G.Audio.play('chest');
  };
  V.warp = (x, z, color) => {
    const y = hy(x, z);
    G.FX.burst(x, y + 3, z, { count: 50, color, intensity: 2.6, speed: [3, 9], life: [0.3, 0.6], size: [0.6, 0.05] });
    G.FX.ring(x, y + 0.3, z, 0.5, 6, 0.4, color, 2.4);
    G.Audio.play('portal');
  };
  V.clearShots = () => G.Proj.clearEnemy();
  // breakable props (index into G.World.obstacles)
  V.obBreak = (i) => G.World.applyBreak(U.clamp(i | 0, 0, 63));
  V.obGrow = (i) => G.World.applyGrow(U.clamp(i | 0, 0, 63));
  V.banner = (title, sub, cls) => G.UI.banner(String(title || ''), String(sub || ''), String(cls || ''));
  V.toast = (msg, cls) => G.UI.toast(String(msg || ''), String(cls || ''));
  V.bossBar = (on, name, sub) => G.UI.bossBar(!!on, String(name || ''), String(sub || ''));
  V.sfx = (name) => G.Audio.play(String(name));
  V.shake = (v) => G.Render.shake(U.clamp(+v || 0, 0, 1));
  V.flash = (v) => G.Render.screenFlash(U.clamp(+v || 0, 0, 1));

  // ---------- meteor (falling rock + burning ground), purely visual ----------
  const meteors = [], embers = [];
  let rockGeo = null, rockMat = null;
  V.meteor = (tx, tz, r) => {
    if (!rockGeo) { rockGeo = new THREE.IcosahedronGeometry(0.9, 1); rockMat = new THREE.MeshBasicMaterial({ color: U.hdr(0xffb060, 4) }); }
    const mesh = new THREE.Mesh(rockGeo, rockMat);
    G.Render.scene.add(mesh);
    G.FX.telegraph({ shape: 'circle', x: tx, z: tz, r, dur: 0.7, color: 0xffa040, k: 1.3 });
    meteors.push({ x: tx, z: tz, r, t: 0, dur: 0.7, mesh, sx: tx - 14, sy: 30, sz: tz + 10 });
    G.Audio.play('meteorFall');
  };
  V.update = function (dt) {
    for (let i = meteors.length - 1; i >= 0; i--) {
      const m = meteors[i];
      m.t += dt;
      const k = Math.min(1, m.t / m.dur), y = hy(m.x, m.z);
      m.mesh.position.set(U.lerp(m.sx, m.x, k), U.lerp(m.sy, y, k * k), U.lerp(m.sz, m.z, k));
      m.mesh.rotation.x += dt * 8;
      G.FX.trail(m.mesh.position.x, m.mesh.position.y, m.mesh.position.z, 0xff8040, 1.6, 0.35, 2.4);
      if (k < 1) continue;
      G.Render.scene.remove(m.mesh);
      meteors.splice(i, 1);
      G.FX.explosion(m.x, y, m.z, m.r, 0xff8a3a, 0.55 * near(m.x, m.z));
      G.FX.gibs(m.x, y + 0.5, m.z, 0x4a3a3a, 10, 0.35, 10);
      G.Audio.play('explode', { big: true });
      const zr = m.r * 0.75;
      embers.push({ x: m.x, z: m.z, r: zr, t: 3, tele: G.FX.telegraph({ shape: 'circle', x: m.x, z: m.z, r: zr, hold: true, color: 0xff6a20, k: 1.1 }) });
    }
    for (let i = embers.length - 1; i >= 0; i--) {
      const e = embers[i];
      e.t -= dt;
      if (Math.random() < 0.8) {
        const a = Math.random() * U.TAU, rr = Math.sqrt(Math.random()) * e.r;
        G.FX.P.emit(e.x + Math.cos(a) * rr, 0.2, e.z + Math.sin(a) * rr, 0, U.rand(1.5, 3.5), 0, 0.5, 0.5, 0.05, 3, 1.1, 0.3, 1, 1, 0);
      }
      if (e.t <= 0) { e.tele.kill(); embers.splice(i, 1); }
    }
  };
  V.clear = function () {
    for (const m of meteors) G.Render.scene.remove(m.mesh);
    for (const e of embers) e.tele.kill();
    meteors.length = 0;
    embers.length = 0;
  };
})();

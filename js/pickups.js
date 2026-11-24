// ============================================================
// SHARDFALL - pickups: XP gems, health orbs, magnets, chests
// solo: gems carry XP. co-op: XP goes to the team on kill and gems are just for show.
// ============================================================
(() => {
  const G = window.G, U = G.U;
  const PK = (G.Pickups = { gems: [], orbs: [], chests: [] });
  const MAXG = 450, MAXO = 40;
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3();
  const tmpC = new THREE.Color();
  const GEM = [
    { v: 50, c: 0xffc040, s: 2.0 },
    { v: 20, c: 0xd06a7a, s: 1.65 },
    { v: 5, c: 0x4fd08a, s: 1.3 },
    { v: 1, c: 0x5a8fe0, s: 1.0 },
  ];
  const TIERS = ['rare', 'epic'];
  let gemMesh, orbMesh, scene, orbId = 0, chestId = 0;

  PK.init = function (sc) {
    scene = sc;
    gemMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.2, 0).scale(1, 1.5, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAXG);
    orbMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.3, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAXO);
    for (const m of [gemMesh, orbMesh]) {
      m.frustumCulled = false;
      for (let i = 0; i < m.count; i++) m.setColorAt(i, tmpC.set(0xffffff));
      m.count = 0;
      scene.add(m);
    }
  };

  function tier(v) { for (const g of GEM) if (v >= g.v) return g; return GEM[3]; }
  function spawnGem(x, z, v, cos) {
    if (PK.gems.length >= MAXG) {
      if (cos) return;
      const g = PK.gems[Math.floor(Math.random() * PK.gems.length)];
      g.v += v; g.tier = tier(g.v);
      return;
    }
    const a = Math.random() * U.TAU, s = U.rand(1, 3.5);
    PK.gems.push({ x, z, y: G.World.heightAt(x, z) + 0.6, vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: U.rand(3, 6), v, tier: tier(v), t: Math.random() * 0.1, mag: false, ms: 0, cos: !!cos });
  }

  PK.dropXP = function (x, z, total) {
    total = Math.max(1, Math.round(total));
    if (G.Net.mode === 'host') { G.Game.addXP(total); PK.cosmeticGems(x, z, total); return; }
    let n = 0;
    for (const g of GEM) while (total >= g.v && n < 7) { spawnGem(x, z, g.v, false); total -= g.v; n++; }
    if (total > 0 && PK.gems.length) PK.gems[PK.gems.length - 1].v += total;
  };
  // gems that only fly to the nearest hero (co-op)
  PK.cosmeticGems = function (x, z, total) {
    let left = Math.max(1, Math.round(total)), n = 0;
    for (const g of GEM) while (left >= g.v && n < 4) { spawnGem(x, z, g.v, true); left -= g.v; n++; }
  };
  PK.dropHealth = function (x, z, big) {
    if (!G.auth() || PK.orbs.length >= MAXO) return;
    orbId = (orbId + 1) % 4096;
    PK.orbs.push({ id: orbId, x, z, y: G.World.heightAt(x, z) + 0.7, vy: 5, kind: 'heal', amt: big ? 40 : 18, life: 22, t: 0, mag: false, ms: 0 });
  };
  PK.dropMagnet = function (x, z) {
    if (!G.auth() || G.Net.mode === 'host' || PK.orbs.length >= MAXO) return;
    orbId = (orbId + 1) % 4096;
    PK.orbs.push({ id: orbId, x, z, y: G.World.heightAt(x, z) + 0.7, vy: 5, kind: 'magnet', life: 25, t: 0, mag: false, ms: 0 });
  };

  function makeChest(id, x, z, tierName, drop) {
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: tierName === 'epic' ? 0x6a2a34 : 0x6a3a22, roughness: 0.7, flatShading: true });
    const gold = new THREE.MeshStandardMaterial({ color: 0xd9a63a, metalness: 0.9, roughness: 0.25, emissive: 0x5a3a00, emissiveIntensity: 0.6 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 0.8), wood);
    base.position.y = 0.35; base.castShadow = true; g.add(base);
    const lid = new THREE.Group();
    lid.position.set(0, 0.7, -0.4);
    g.add(lid);
    const lm = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.2, 10, 1, false, 0, Math.PI).rotateZ(Math.PI / 2), wood);
    lm.position.z = 0.4; lm.castShadow = true; lid.add(lm);
    for (const sx of [-0.45, 0.45]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.74, 0.84), gold); b.position.set(sx, 0.36, 0); g.add(b); }
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.25, 0.08), gold);
    lock.position.set(0, 0.62, 0.42); g.add(lock);
    const color = tierName === 'epic' ? 0xff7a6a : 0xffc040;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 14, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: U.hdr(color, 1.1), transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = 7; g.add(beam);
    const gy = G.World.heightAt(x, z);
    g.position.set(x, drop ? gy + 6 : gy, z);
    scene.add(g);
    const c = { id, x, z, g, lid, beam, t: 0, open: false, openT: 0, tier: tierName, color };
    PK.chests.push(c);
    G.FX.ring(x, gy + 0.2, z, 0.5, 3, 0.5, color, 2.2);
    return c;
  }
  PK.dropChest = function (x, z, tierName = 'rare') {
    if (!G.auth()) return;
    const p = { x, z };
    G.World.resolve(p, 0.9);
    chestId = (chestId + 1) % 4096;
    makeChest(chestId, p.x, p.z, tierName, true);
  };
  function openChest(c) {
    c.open = true;
    G.Net.vis('chestOpen', U.r1(c.x), U.r1(c.z), c.color);
    G.Game.openChest(c.tier);
  }

  PK.collectAll = function () {
    for (const g of PK.gems) g.mag = true;
    for (const o of PK.orbs) if (o.kind !== 'magnet') o.mag = true;
  };

  PK.update = function (dt) {
    const HS = G.Heroes, auth = G.auth();
    const P = G.Player;
    const pr = P ? P.stats.pickup : 3, pr2 = pr * pr;
    let n = 0;
    for (let i = PK.gems.length - 1; i >= 0; i--) {
      const g = PK.gems[i];
      g.t += dt;
      const gy = G.World.heightAt(g.x, g.z) + 0.45;
      let target = null;
      if (g.cos) { if (g.t > 0.35) { target = HS.nearest(g.x, g.z, 60); g.mag = !!target; } }
      else if (P && P.alive) {
        if (!g.mag && U.dist2(g.x, g.z, P.x, P.z) < pr2 && g.t > 0.35) g.mag = true;
        if (g.mag) target = P;
      }
      if (g.mag && target) {
        g.ms = Math.min(40, g.ms + dt * 45);
        const dx = target.x - g.x, dz = target.z - g.z, d = Math.hypot(dx, dz) || 1;
        g.x += (dx / d) * g.ms * dt; g.z += (dz / d) * g.ms * dt;
        g.y = U.damp(g.y, target.y + 1, 10, dt);
        if (d < 0.75 || g.t > 6) {
          if (!g.cos) G.Game.addXP(g.v);
          if (target === P) G.Audio.play('pickup');
          G.FX.burst(g.x, g.y, g.z, { count: 3, color: g.tier.c, intensity: 2.6, speed: [1, 3], life: [0.15, 0.3], size: [0.3, 0.02] });
          PK.gems[i] = PK.gems[PK.gems.length - 1]; PK.gems.pop();
          continue;
        }
      } else {
        g.vx = U.damp(g.vx, 0, 3, dt); g.vz = U.damp(g.vz, 0, 3, dt);
        g.vy -= 20 * dt;
        g.x += g.vx * dt; g.z += g.vz * dt; g.y += g.vy * dt;
        if (g.y < gy) { g.y = gy; g.vy = Math.abs(g.vy) > 2 ? -g.vy * 0.35 : 0; }
        G.World.resolve(g, 0.2);
      }
      if (n < MAXG) {
        const s = g.tier.s;
        tmpE.set(0, g.t * 2.5, 0); tmpQ.setFromEuler(tmpE);
        gemMesh.setMatrixAt(n, tmpM.compose(tmpP.set(g.x, g.y + (g.mag ? 0 : Math.sin(g.t * 3) * 0.08), g.z), tmpQ, tmpS.set(s, s, s)));
        gemMesh.setColorAt(n, tmpC.set(g.tier.c).multiplyScalar(2.3));
        n++;
      }
    }
    gemMesh.count = n;
    gemMesh.instanceMatrix.needsUpdate = true;
    gemMesh.instanceColor.needsUpdate = true;

    n = 0;
    for (let i = PK.orbs.length - 1; i >= 0; i--) {
      const o = PK.orbs[i];
      o.t += dt;
      if (auth) {
        o.life -= dt;
        if (o.life <= 0) { PK.orbs[i] = PK.orbs[PK.orbs.length - 1]; PK.orbs.pop(); continue; }
        const gy = G.World.heightAt(o.x, o.z) + 0.6;
        o.vy -= 18 * dt; o.y += o.vy * dt;
        if (o.y < gy) { o.y = gy; o.vy = 0; }
        const h = HS.nearest(o.x, o.z, 60);
        const d = h ? U.dist(o.x, o.z, h.x, h.z) : 99;
        if (h && (o.mag || d < h.stats.pickup * 0.8)) {
          o.ms = Math.min(30, o.ms + dt * 40);
          o.x += ((h.x - o.x) / (d || 1)) * o.ms * dt; o.z += ((h.z - o.z) / (d || 1)) * o.ms * dt;
        }
        if (h && d < 0.9) {
          if (o.kind === 'heal') { h.heal(o.amt); G.Net.vis('sfx', 'heal'); }
          else { PK.collectAll(); G.UI.toast('주변 경험치를 모두 끌어왔습니다', 'good'); G.Audio.play('chest'); G.FX.ring(h.x, h.y + 0.3, h.z, 1, 30, 0.8, 0x9fd0ff, 1.8); }
          PK.orbs[i] = PK.orbs[PK.orbs.length - 1]; PK.orbs.pop();
          continue;
        }
        if (o.life < 4 && Math.floor(o.t * 8) % 2 === 0) continue;
      } else {
        o.x = U.damp(o.x, o.nx, 14, dt); o.z = U.damp(o.z, o.nz, 14, dt);
        o.y = G.World.heightAt(o.x, o.z) + 0.6;
      }
      tmpM.compose(tmpP.set(o.x, o.y + Math.sin(o.t * 3) * 0.1, o.z), tmpQ.identity(), tmpS.setScalar(1 + Math.sin(o.t * 6) * 0.12));
      orbMesh.setMatrixAt(n, tmpM);
      orbMesh.setColorAt(n, tmpC.set(o.kind === 'heal' ? 0xe0384f : 0x9fd0ff).multiplyScalar(2.6));
      n++;
      if (Math.random() < 0.15) G.FX.trail(o.x + U.rand(-0.3, 0.3), o.y + 0.3, o.z + U.rand(-0.3, 0.3), o.kind === 'heal' ? 0xe0384f : 0x9fd0ff, 0.25, 0.5, 2);
    }
    orbMesh.count = n;
    orbMesh.instanceMatrix.needsUpdate = true;
    orbMesh.instanceColor.needsUpdate = true;

    for (let i = PK.chests.length - 1; i >= 0; i--) {
      const c = PK.chests[i];
      c.t += dt;
      const gy = G.World.heightAt(c.x, c.z);
      c.g.position.y = U.damp(c.g.position.y, gy, 8, dt);
      c.beam.material.opacity = 0.16 + Math.sin(c.t * 3) * 0.06;
      if (!c.open) {
        c.g.rotation.y = Math.sin(c.t * 1.5) * 0.2;
        if (auth && c.t > 0.6) for (const h of HS.list) if (h.alive && U.dist(c.x, c.z, h.x, h.z) < 1.7) { openChest(c); break; }
        continue;
      }
      c.openT += dt;
      c.lid.rotation.x = -U.easeOutBack(Math.min(1, c.openT * 3)) * 1.9;
      c.beam.scale.x = c.beam.scale.z = Math.max(0.01, 1 - c.openT);
      if (c.openT > 1.4) {
        const s = Math.max(0.01, 1 - (c.openT - 1.4) * 2.5);
        c.g.scale.setScalar(s);
        if (s <= 0.02) { scene.remove(c.g); PK.chests.splice(i, 1); }
      }
    }
  };

  // ---------- co-op sync ----------
  PK.netOrbs = function () {
    let s = '';
    for (const o of PK.orbs) s += U.enc(o.id, 2) + (o.kind === 'heal' ? 'h' : 'm') + U.enc((o.x + 41) * 50, 2) + U.enc((o.z + 41) * 50, 2);
    return s;
  };
  PK.netChests = () => PK.chests.filter((c) => c.openT < 1.2).map((c) => [c.id, U.r1(c.x), U.r1(c.z), TIERS.indexOf(c.tier), c.open ? 1 : 0]);
  PK.netApply = function (orbStr, chests) {
    const seen = new Set();
    if (typeof orbStr === 'string') {
      for (let i = 0; i + 7 <= orbStr.length && i < 7 * MAXO; i += 7) {
        const id = U.dec(orbStr, i, 2), kind = orbStr[i + 2] === 'h' ? 'heal' : 'magnet';
        const x = U.dec(orbStr, i + 3, 2) / 50 - 41, z = U.dec(orbStr, i + 5, 2) / 50 - 41;
        seen.add(id);
        let o = PK.orbs.find((q) => q.id === id);
        if (!o) { o = { id, kind, x, z, y: G.World.heightAt(x, z) + 0.6, t: 0 }; PK.orbs.push(o); }
        o.nx = x; o.nz = z;
      }
    }
    for (let i = PK.orbs.length - 1; i >= 0; i--) if (!seen.has(PK.orbs[i].id)) PK.orbs.splice(i, 1);
    if (!Array.isArray(chests)) return;
    for (const a of chests.slice(0, 8)) {
      if (!Array.isArray(a)) continue;
      const id = U.num(a[0], -1) | 0;
      let c = PK.chests.find((q) => q.id === id);
      if (!c) c = makeChest(id, U.num(a[1], 0, -40, 40), U.num(a[2], 0, -40, 40), TIERS[U.num(a[3], 0, 0, 1) | 0] || 'rare', true);
      if (a[4] && !c.open) c.open = true;
    }
  };

  PK.clear = function () {
    PK.gems.length = 0;
    PK.orbs.length = 0;
    for (const c of PK.chests) scene.remove(c.g);
    PK.chests.length = 0;
    gemMesh.count = 0;
    orbMesh.count = 0;
  };
})();

p='src/main.js'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)
rep("""function updateBats(dt) {""",
"""// ---------- olms: pale, blind, slow, in the still water ----------
const OLMS = 8;
const olmGeo = new THREE.IcosahedronGeometry(1, 1).scale(0.11, 0.022, 0.022), olmMat = new THREE.MeshStandardMaterial({ color: 0xf2dcd2, roughness: 0.6, emissive: 0x2a1c18, flatShading: true });
const olms = [];               // {mesh, x,y,z, yaw, speed, flee, node}
const olmNodesTried = new Set();
let olmT = 0;
function updateOlms(dt) {
  olmT -= dt;
  if (olmT <= 0) {
    olmT = 1.5;
    // spawn: still water at least knee deep, near the player, never seen before
    if (olms.length < OLMS) for (const n of G.nodes) {
      if (n.wl === undefined || n.flow || n.wl - n.y < 0.3) continue;
      const d = Math.hypot(n.x - player.x, n.y - player.y, n.z - player.z); if (d > 18 || d < 3) continue;
      const key = n.w + ':' + n.i; if (olmNodesTried.has(key)) continue; olmNodesTried.add(key);
      if (G.hash3(Math.floor(n.x * 3.1), 0, Math.floor(n.z * 7.7)) > 0.22 || !G.chunkReadyAt(n.x, n.wl, n.z)) continue;
      const mesh = new THREE.Mesh(olmGeo, olmMat); scene.add(mesh);
      olms.push({ mesh, x: n.x, y: n.wl - 0.12, z: n.z, yaw: Math.random() * 6.28, speed: 0.12, flee: 0, t: Math.random() * 10 });
      if (olms.length >= OLMS) break;
    }
    for (let i = olms.length - 1; i >= 0; i--) { const o = olms[i]; if (Math.hypot(o.x - player.x, o.z - player.z) > 30) { scene.remove(o.mesh); olms.splice(i, 1); } }
  }
  camera.getWorldDirection(viewDir);
  for (const o of olms) {
    o.t += dt;
    const dx = o.x - camera.position.x, dy = o.y - camera.position.y, dz = o.z - camera.position.z, d = Math.hypot(dx, dy, dz);
    const lit = torchHeld && torchLevel(player.battery) > 0.3 && d < 9 && (dx * viewDir.x + dy * viewDir.y + dz * viewDir.z) / d > 0.96;
    if ((lit || d < 2.2) && o.flee <= 0) { o.flee = 2.5; o.yaw = Math.atan2(dx, dz) + (Math.random() - 0.5) * 1.2; teach('olm', 'something pale in the water. it has no eyes; it has never needed them'); if (d < 4) sfx.play('splash_small', { x: o.x, y: o.y, z: o.z, vol: 0.12, rate: 1.6, vary: 0.2 }); }
    o.flee -= dt;
    const sp = o.flee > 0 ? 1.2 : 0.12 + 0.05 * Math.sin(o.t * 0.7);
    if (o.flee <= 0) o.yaw += Math.sin(o.t * 0.9) * dt * 0.6;
    const nx = o.x + Math.sin(o.yaw) * sp * dt, nz = o.z + Math.cos(o.yaw) * sp * dt;
    const wl = G.waterLevelAt(nx, o.y + 0.2, nz);
    if (Number.isFinite(wl) && wl - 0.12 > o.y - 0.4 && G.fieldAt(nx, wl - 0.12, nz) < -0.12) { o.x = nx; o.z = nz; o.y += (wl - 0.12 - o.y) * Math.min(1, dt * 3); }
    else o.yaw += Math.PI * 0.6 + Math.random() * 0.8;                              // the edge of the pool: turn
    o.mesh.position.set(o.x, o.y, o.z); o.mesh.rotation.y = o.yaw + Math.sin(o.t * (o.flee > 0 ? 18 : 4)) * 0.15;
    o.mesh.scale.set(1, 1, 1 + Math.sin(o.t * (o.flee > 0 ? 18 : 4)) * 0.25);
  }
}
function updateBats(dt) {""")
rep("""  updateLoose(dt);
  updateCollapse(dt);""", """  updateLoose(dt);
  updateOlms(dt);
  updateCollapse(dt);""")
open(p,'w',encoding='utf-8').write(s); print('ok')

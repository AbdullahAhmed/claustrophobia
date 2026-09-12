p='src/main.js'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)
rep("""      if (tips.length && Math.random() < 0.7) { const c = tips[Math.floor(Math.random() * tips.length)]; x = c.x; z = c.z; y = c.top - c.len; }
      sfx.play('drip', { x, y, z, vol: 0.5 + Math.random() * 0.4, vary: 0.25, wet: 0.9, rolloff: 0.8 });""",
    """      let fromTip = false;
      if (tips.length && Math.random() < 0.7) { const c = tips[Math.floor(Math.random() * tips.length)]; x = c.x; z = c.z; y = c.top - c.len; fromTip = true; }
      const landY = s.wl !== undefined ? s.wl : floor;
      if (fromTip && y - landY > 0.4) {                                                 // you see it fall before you hear it land
        const fallT = Math.sqrt(2 * Math.max(0.1, y - landY) / 9.8);
        spawnDrip(x, y, z, landY); gameDelay(() => sfx.play('drip', { x, y: landY, z, vol: 0.5 + Math.random() * 0.4, vary: 0.25, wet: 0.9, rolloff: 0.8 }), fallT * 1000);
      } else sfx.play('drip', { x, y, z, vol: 0.5 + Math.random() * 0.4, vary: 0.25, wet: 0.9, rolloff: 0.8 });""")
rep("""let stillT = 0, presenceT = rr(40, 90), gustT = 0;
function updateSound(dt) {""",
"""// a single falling drop, from a stalactite tip to the floor or the water
const dripDrops = []; let dripInst = null;
function spawnDrip(x, y, z, landY) {
  if (!dripInst) { dripInst = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.05, 0.12), dropMat, 24); dripInst.count = 0; dripInst.frustumCulled = false; scene.add(dripInst); }
  if (dripDrops.length >= 24) return;
  dripDrops.push({ x, y, z, landY, v: 0 });
}
function updateDrips(dt) {
  if (!dripInst) return;
  for (let i = dripDrops.length - 1; i >= 0; i--) { const d = dripDrops[i]; d.v += 9.8 * dt; d.y -= d.v * dt; if (d.y <= d.landY) dripDrops.splice(i, 1); }
  dripInst.count = dripDrops.length;
  for (let i = 0; i < dripDrops.length; i++) { const d = dripDrops[i]; _m.compose(_p.set(d.x, d.y, d.z), camera.quaternion, _s.set(1, 1 + d.v * 0.25, 1)); dripInst.setMatrixAt(i, _m); }
  dripInst.instanceMatrix.needsUpdate = true;
}
let stillT = 0, presenceT = rr(40, 90), gustT = 0;
function updateSound(dt) {""")
rep("""  updateStones(dt);
  updateDrops(dt);""", """  updateStones(dt);
  updateDrips(dt);
  updateDrops(dt);""")
open(p,'w',encoding='utf-8').write(s); print('ok')

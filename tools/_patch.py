p='src/main.js'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)
rep("""function updateMotes(dt, level) {
  torch.getWorldDirection(_td).negate(); _tp.copy(camera.position);            // torch is a plain Object3D: +Z is backwards
  const t = performance.now() * 0.001, ic = motes.instanceColor.array;
  for (let i = 0; i < MOTES; i++) {
    let x = motePos[i * 3], y = motePos[i * 3 + 1], z = motePos[i * 3 + 2];
    x += (Math.sin(t * 0.7 + i) * 0.04 + moteVel[i * 3]) * dt; y += (-0.05 + Math.cos(t * 0.5 + i * 1.3) * 0.03) * dt; z += (Math.cos(t * 0.6 + i * 0.7) * 0.04 + moteVel[i * 3 + 2]) * dt;""",
"""// the draught: the air in a cave moves toward the way out, and the dust in your beam goes with it — slowly
let draughtX = 0, draughtZ = 0, draughtT = 0;
function updateDraught(dt) {
  draughtT -= dt; if (draughtT > 0) return; draughtT = 2;
  let tx = 0, tz = 0;
  if (exitInfo) { tx = exitInfo.x - player.x; tz = exitInfo.z - player.z; }
  else {                                                                       // no exit yet: along the main way, away from the entrance
    let best = null, bd = 60; for (const n of G.nodes) { if (!G.trunkIds.has(n.w)) continue; const d = Math.hypot(n.x - player.x, n.z - player.z); if (d < bd) { bd = d; best = n; } }
    if (best) { const nx = G.nodes.find(n => n.w === best.w && n.i === best.i + 6); if (nx) { tx = nx.x - best.x; tz = nx.z - best.z; } }
  }
  const L = Math.hypot(tx, tz) || 1; const k = open > 12 ? 0.08 : 0.16;      // stronger in passages, lost in big chambers
  draughtX = tx / L * k; draughtZ = tz / L * k;
}
function updateMotes(dt, level) {
  torch.getWorldDirection(_td).negate(); _tp.copy(camera.position);            // torch is a plain Object3D: +Z is backwards
  const t = performance.now() * 0.001, ic = motes.instanceColor.array;
  const gust = 1 + (gustT > 0 ? 3 : 0);
  for (let i = 0; i < MOTES; i++) {
    let x = motePos[i * 3], y = motePos[i * 3 + 1], z = motePos[i * 3 + 2];
    x += (Math.sin(t * 0.7 + i) * 0.04 + moteVel[i * 3] + draughtX * gust) * dt; y += (-0.05 + Math.cos(t * 0.5 + i * 1.3) * 0.03) * dt; z += (Math.cos(t * 0.6 + i * 0.7) * 0.04 + moteVel[i * 3 + 2] + draughtZ * gust) * dt;""")
rep("""  updateFlood(dt);
  updateTremor(dt);""", """  updateFlood(dt);
  updateTremor(dt);
  updateDraught(dt);""")
open(p,'w',encoding='utf-8').write(s); print('ok')

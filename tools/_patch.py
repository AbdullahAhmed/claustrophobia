p='src/main.js'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)
rep("""  if (e.code === 'KeyE' && !e.repeat) { restRequested = false; useRope(); }""",
    """  if (e.code === 'KeyE' && !e.repeat) { restRequested = false; eHeldAt = performance.now(); }""")
rep("""  if (e.code === 'KeyG') releaseGlow();""",
    """  if (e.code === 'KeyG') releaseGlow();
  if (e.code === 'KeyE' && eHeldAt) { const held = (performance.now() - eHeldAt) / 1000; eHeldAt = 0; if (canAct() && !typing && !toolsOpen && !notebookOpen) { if (held > 0.6) derigRope(); else useRope(); } }""")
rep("""let gameClock = 0;""", """let gameClock = 0, eHeldAt = 0;""")
rep("""function useRope() {""",
"""// derig: hold E at the top of a rope you rigged to pull it up and coil it again
function derigRope() {
  for (const r of ropes) {
    if (r.old || r.rescue) continue;
    if (Math.hypot(r.x - player.x, r.z - player.z) < 2.2 && Math.abs(player.y - r.top) < 1.5 && !roping) {
      scene.remove(r.mesh); ropes.splice(ropes.indexOf(r), 1); player.rope += r.coils || 1;
      sfx.play('drag', { vol: 0.5, rate: 1.1, dur: 1.2 }); showHint(`rope pulled up and coiled · ${player.rope}`); return;
    }
  }
  if (ropes.some(r => (r.old || r.rescue) && Math.hypot(r.x - player.x, r.z - player.z) < 2.2)) showHint('not yours to take');
  else useRope();
}
function useRope() {""")
rep("""  player.rope -= need; if (need > 1) showHint(`${need} coils tied together`);""",
    """  player.rope -= need; if (need > 1) showHint(`${need} coils tied together`);
  ropeCoils = need;""")
rep("""  const r = { x: v.x, z: v.z, top: v.top, bottom: v.y, mesh: new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, v.top - v.y + 0.3, 5), ropeMat) };""",
    """  const r = { x: v.x, z: v.z, top: v.top, bottom: v.y, coils: ropeCoils, mesh: new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, v.top - v.y + 0.3, 5), ropeMat) };""")
rep("""const ropes = [];            // {x, top, bottom, z, mesh}""", """const ropes = [];            // {x, top, bottom, z, mesh}
let ropeCoils = 1;""")
open(p,'w',encoding='utf-8').write(s); print('ok')

p='src/main.js'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)
rep("""  if (player.swim) {
    const cp = Math.cos(player.pitch), sp = Math.sin(player.pitch);""",
"""  if (player.swim) {
    // deep, black water, and you are not the only thing in it
    if (!player.under && depthW > 1.4 && dread > 0.15) {
      lakeT -= dt;
      if (lakeT <= 0) {
        lakeT = rr(35, 80);
        const a = Math.random() * Math.PI * 2, d = rr(4, 9);
        if (Math.random() < 0.65) { sfx.play('splash', { x: player.x + Math.sin(a) * d, y: player.wl, z: player.z + Math.cos(a) * d, vol: 0.7, rate: 0.85, wet: 0.7, rolloff: 0.5 }); setTimeout(() => sfx.play('stroke', { x: player.x + Math.sin(a) * d * 0.7, y: player.wl, z: player.z + Math.cos(a) * d * 0.7, vol: 0.4, rate: 0.7, wet: 0.7 }), 900); showHint('something moved in the water'); }
        else { sfx.play('bubbles', { vol: 0.5, rate: 0.8, dur: 1.4 }); camera.rotation.z += (Math.random() - 0.5) * 0.08; player.vy -= 0.6; showHint('something touched your leg'); sfx.play('gasp', { vol: 0.7 }); }
        lakeFear = 1;
      }
    }
    const cp = Math.cos(player.pitch), sp = Math.sin(player.pitch);""")
rep("""let foulT = 0;""", """let foulT = 0, lakeT = rr(20, 50), lakeFear = 0;""")
rep("""player.hurt ? 0.3 : 0, stuck > 0 ? Math.min(1, 0.5 + stuckT * 0.1) : 0, batList.length ? 0.5 : 0), 0, 1);""",
    """player.hurt ? 0.3 : 0, stuck > 0 ? Math.min(1, 0.5 + stuckT * 0.1) : 0, batList.length ? 0.5 : 0, lakeFear * 0.8), 0, 1);
  lakeFear = Math.max(0, lakeFear - dt * 0.08);""")
open(p,'w',encoding='utf-8').write(s); print('ok')

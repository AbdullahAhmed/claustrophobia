p='src/main.js'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)
rep("""  if (player.under) { scene.fog.color.copy(FOG_WATER); scene.fog.density = 0.15 + 0.22 * floodLevel + (player.flow ? 0.05 : 0); $('water').style.opacity = 1; updateBubbles(dt); }   // silt in a flood: you cannot see your hand""",
    """  // silt: every stroke in a sump stirs the floor, and the water closes in behind you — a flood does the same to all of it
  if (player.under) { siltT = Math.min(14, siltT + dt * (Math.hypot(player.x - siltX, player.z - siltZ) > 0.01 ? 1 : 0.15)); if (siltT > 8) teach('silt', 'the silt is up. you stirred it, and now you cannot see. keep going the way you were going'); }
  else siltT = Math.max(0, siltT - dt * 2);
  siltX = player.x; siltZ = player.z;
  if (player.under) { scene.fog.color.copy(FOG_WATER); scene.fog.density = 0.15 + 0.22 * floodLevel + (player.flow ? 0.05 : 0) + 0.3 * Math.min(1, siltT / 12); $('water').style.opacity = 1; updateBubbles(dt); }""")
rep("""let foulT = 0, lakeT = rr(20, 50), lakeFear = 0, climbing = false, climbT = 0, resting = false, restT = 0;""",
    """let foulT = 0, lakeT = rr(20, 50), lakeFear = 0, climbing = false, climbT = 0, resting = false, restT = 0, siltT = 0, siltX = 0, siltZ = 0;""")
open(p,'w',encoding='utf-8').write(s); print('ok')

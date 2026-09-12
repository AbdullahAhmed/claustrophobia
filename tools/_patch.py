p='src/main.js'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)
rep("""    const d = Math.hypot(exitInfo.x - player.x, exitInfo.y - player.y, exitInfo.z - player.z);
    const near = clamp(1 - d / 70, 0, 1);
    if (exitLoops.wind) exitLoops.wind.setVol((1 - u) * (0.2 + 0.8 * near) * (player.out ? 1.6 : 1), 1);
    if (exitLoops.birds) exitLoops.birds.setVol((1 - u) * (near > 0.3 ? (near - 0.3) * 1.2 : 0) * (player.out ? 1.5 : 1), 1);""",
"""    const d = Math.hypot(exitInfo.x - player.x, exitInfo.y - player.y, exitInfo.z - player.z);
    // stand still in the dark and you hear further: the draught and the birds reach you from twice as far
    const near = clamp(1 - d / (70 * (1 + listening)), 0, 1);
    if (exitLoops.wind) exitLoops.wind.setVol((1 - u) * (0.2 + 0.8 * near) * (player.out ? 1.6 : 1) * (1 + 0.6 * listening), 1);
    if (exitLoops.birds) exitLoops.birds.setVol((1 - u) * (near > 0.3 ? (near - 0.3) * 1.2 : 0) * (player.out ? 1.5 : 1) * (1 + 0.6 * listening), 1);
    if (listening > 0.9 && near > 0.05 && !player.out) teach('listen', 'still, and dark: you can hear a draught. air moves toward the way out');""")
rep("""  if (gustT > 0) gustT -= dt;
  // daylight, heard before it is seen""",
"""  if (gustT > 0) gustT -= dt;
  // listening: still, torch dark or off, for a few seconds
  const stillNow = Math.hypot(player.x - lastPx, player.z - lastPz) < 0.02 && !player.swim;
  listening = stillNow && (!torchHeld || torchLevel(player.battery) < 0.08) ? Math.min(1, listening + dt / 3) : Math.max(0, listening - dt * 2);
  // daylight, heard before it is seen""")
rep("""let open = 5, openT = 0, dripT = 2, rockT = rr(60, 160), nearWater = 0, fear = 0, gaspT = 0, lastPx = 0, lastPz = 0, lastStepX = 0, lastStepZ = 0;""",
    """let open = 5, openT = 0, dripT = 2, rockT = rr(60, 160), nearWater = 0, fear = 0, gaspT = 0, lastPx = 0, lastPz = 0, lastStepX = 0, lastStepZ = 0, listening = 0;""")
open(p,'w',encoding='utf-8').write(s); print('ok')

p='src/main.js'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)
rep("""function updateHeldControls(dt) {""",
"""// controller rumble, when there is a controller and it can
function rumble(strong, weak, ms) {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const g of pads) if (g && g.connected && g.vibrationActuator && g.vibrationActuator.playEffect) { try { g.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }); } catch (e) {} break; }
}
function updateHeldControls(dt) {""")
# hook points
rep("""function die(title, why, stat) {
  if (!player.alive) return; player.alive = false; record[stat]++;""",
    """function die(title, why, stat) {
  if (!player.alive) return; player.alive = false; record[stat]++; rumble(1, 1, 900);""")
rep("""          player.hurt = true; $('hurt').style.opacity = 0.7; gameDelay(() => { $('hurt').style.opacity = 0; }, 900);""",
    """          player.hurt = true; $('hurt').style.opacity = 0.7; gameDelay(() => { $('hurt').style.opacity = 0; }, 900); rumble(0.8, 0.4, 400);""")
rep("""  tremorAt = runTime + rr(600, 1200); tremorT = 4.5;""", """  tremorAt = runTime + rr(600, 1200); tremorT = 4.5; rumble(0.5, 0.9, 3500);""")
rep("""        L.mesh.position.y = L.rest; L.state = 'down';""", """        L.mesh.position.y = L.rest; L.state = 'down'; rumble(0.9, 0.6, 500);""")
rep("""      if (onIt) { f.state = 'cracking'; f.t = 0;""", """      if (onIt) { f.state = 'cracking'; f.t = 0; rumble(0.3, 0.7, 700);""")
rep("""      collapsed.add(key); cave.collapsed = (cave.collapsed || []).concat([key]); saveCave();""",
    """      collapsed.add(key); cave.collapsed = (cave.collapsed || []).concat([key]); saveCave(); gameDelay(() => rumble(0.8, 0.8, 1200), 700);""")
# the shake: a tick of rumble per shake
rep("""  shakeT = 0.22;
  shakeE.set(""", """  shakeT = 0.22; rumble(0.15, 0.35, 90);
  shakeE.set(""")
open(p,'w',encoding='utf-8').write(s); print('ok')

p='src/main.js'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)
rep("""  // breath
  if (player.under) player.breath -= dt / BREATH_S; else player.breath = Math.min(1, player.breath + dt / 4);
  if (player.breath <= 0) { player.breath = 0; die('DROWNED', 'the water took you', 'drowned'); }""",
"""  // breath — and bad air: some dead ends have none worth breathing
  player.foul = !player.under && G.foulAt(player.x, player.y + 0.5, player.z);
  if (player.under) player.breath -= dt / BREATH_S;
  else if (player.foul) { player.breath -= dt / (BREATH_S * 3.2); foulT += dt; if (foulT > 4) teach('foul', 'the air is thick and your head hurts. this pocket has no air in it. back out'); }
  else { player.breath = Math.min(1, player.breath + dt / (foulT > 0 ? 12 : 4)); foulT = 0; }
  if (player.breath <= 0) { player.breath = 0; if (player.foul) die('BAD AIR', 'you sat down for a moment. the air in that pocket had nothing in it', 'foul'); else die('DROWNED', 'the water took you', 'drowned'); }""")
rep("""let stuck = 0, stuckSide = 0, stuckT = 0, wiggles = 0, coldT = 0, coldDropped = false;""", """let foulT = 0;
let stuck = 0, stuckSide = 0, stuckT = 0, wiggles = 0, coldT = 0, coldDropped = false;""")
rep("""let record = { runs: 0, best: 0, escapes: 0, drowned: 0, fell: 0, froze: 0, crushed: 0 };""",
    """let record = { runs: 0, best: 0, escapes: 0, drowned: 0, fell: 0, froze: 0, crushed: 0, foul: 0 };""")
rep("""  set('breath_labored', (1 - u) * (player.hurt ? 0.7 : 0));""",
    """  set('breath_labored', (1 - u) * Math.max(player.hurt ? 0.7 : 0, player.foul ? 0.4 + (1 - player.breath) * 0.8 : 0));""")
rep("""  breathM.classList.toggle('low', player.breath < 0.35);""",
    """  breathM.classList.toggle('low', player.breath < 0.35);
  breathM.querySelector('.tag').textContent = player.foul ? 'bad air' : 'air';""")
rep("""r.cause === 'crushed' ? 'were buried' : 'fell'}. +25%`);""",
    """r.cause === 'crushed' ? 'were buried' : r.cause === 'foul' ? 'stopped breathing' : 'fell'}. +25%`);""")
open(p,'w',encoding='utf-8').write(s); print('ok')

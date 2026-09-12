p='src/main.js'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)
rep("""  if (e.code === 'KeyH' && !e.repeat) whistle();""",
    """  if (e.code === 'KeyH' && !e.repeat) whistle();
  if (e.code === 'KeyQ' && !e.repeat && torchHeld) { beamNarrow = !beamNarrow; sfx.play('torch_click', { vol: 0.5, rate: beamNarrow ? 1.3 : 1.0 }); showHint(beamNarrow ? 'spot: further, and nothing to either side' : 'flood: wide, and not far'); }""")
rep("""  spot.intensity = 12 * (torchHeld ? adapt : 1) * level * (0.96 + 0.04 * Math.sin(t * 13.7) * Math.sin(t * 3.1));""",
    """  // the beam: flood is wide and short, spot is narrow and long — it eats the battery a little faster
  const wantAngle = beamNarrow ? 0.26 : 0.52; spot.angle += (wantAngle - spot.angle) * Math.min(1, dt * 8);
  spot.distance = beamNarrow ? 60 : 34; spot.penumbra = beamNarrow ? 0.5 : 0.8;
  spot.intensity = 12 * (beamNarrow ? 2.6 : 1) * (torchHeld ? adapt : 1) * level * (0.96 + 0.04 * Math.sin(t * 13.7) * Math.sin(t * 3.1));""")
rep("""  if (running && player.alive && !player.out) player.battery = Math.max(0, player.battery - dt / (BATTERY_S * (player.cells ? 1.6 : 1)));""",
    """  if (running && player.alive && !player.out) player.battery = Math.max(0, player.battery - dt / (BATTERY_S * (player.cells ? 1.6 : 1) * (beamNarrow ? 0.8 : 1)));""")
rep("""let torchDrifting = false;""", """let torchDrifting = false, beamNarrow = false;""")
open(p,'w',encoding='utf-8').write(s)

p='index.html'; s=open(p,encoding='utf-8').read()
rep("""<b>F</b> shake the torch (blind while you do)<br>""", """<b>F</b> shake the torch (blind while you do) &nbsp;·&nbsp; <b>Q</b> spot / flood<br>""")
open(p,'w',encoding='utf-8').write(s)
p='README.md'; s=open(p,encoding='utf-8').read()
rep("""| T | chalk a note on the rock you're looking at |""", """| Q | spot or flood beam — narrow reaches the far wall of a cavern and the bottom of a pit, wide shows you the floor either side; the spot eats the battery faster |
| T | chalk a note on the rock you're looking at |""")
open(p,'w',encoding='utf-8').write(s); print('ok')

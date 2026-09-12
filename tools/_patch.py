p='src/main.js'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)
rep("""  const still = notebookOpen || stuck > 0;                    // you stop walking to write; or the rock has you""",
    """  // resting: hold R on dry ground — the torch goes off to save it, you sit, and the cold and the tiredness go, slowly. the dark is not empty
  const wantRest = (keys.KeyR || keys._padRest) && player.grounded && !player.swim && depthW < 0.2 && stuck === 0 && !climbing;
  if (wantRest && !resting) { resting = true; restT = 0; sfx.play('torch_click', { vol: 0.5, rate: 0.9 }); teach('rest', 'sitting down, torch off. the cold goes, the legs come back; the battery is spared. listen while you wait'); }
  if (!wantRest && resting) { resting = false; sfx.play('torch_click', { vol: 0.5, rate: 1.1 }); }
  if (resting) { restT += dt; player.cold = Math.max(0, player.cold - dt / 12); player.stamina = Math.min(1, player.stamina + dt / 4); if (restT > 25 && Math.floor(restT) % 20 === 0 && Math.floor(restT) !== Math.floor(restT - dt)) showHint('still here'); }
  const still = notebookOpen || stuck > 0 || resting;         // you stop walking to write; or the rock has you; or you are sitting""")
rep("""let foulT = 0, lakeT = rr(20, 50), lakeFear = 0, climbing = false, climbT = 0;""",
    """let foulT = 0, lakeT = rr(20, 50), lakeFear = 0, climbing = false, climbT = 0, resting = false, restT = 0;""")
# torch off while resting; battery does not drain
rep("""  if (running && player.alive && !player.out) player.battery = Math.max(0, player.battery - dt / (BATTERY_S * (player.cells ? 1.6 : 1) * (beamNarrow ? 0.8 : 1)));""",
    """  if (running && player.alive && !player.out && !resting) player.battery = Math.max(0, player.battery - dt / (BATTERY_S * (player.cells ? 1.6 : 1) * (beamNarrow ? 0.8 : 1)));""")
rep("""  let level = torchLevel(player.battery);""", """  let level = resting ? 0 : torchLevel(player.battery);""")
# the pad: hold B while standing still could be crouch; use the D-pad down (button 13) for rest
rep("""  keys.Space = b(0) || keys._kbSpace; keys.KeyC = b(1) || keys._kbC; keys.ShiftLeft = b(6) || keys._kbShift;""",
    """  keys.Space = b(0) || keys._kbSpace; keys.KeyC = b(1) || keys._kbC; keys.ShiftLeft = b(6) || keys._kbShift; keys._padRest = b(13);""")
open(p,'w',encoding='utf-8').write(s)
p='index.html'; s=open(p,encoding='utf-8').read()
rep("""<b>Q</b> spot / flood<br>""", """<b>Q</b> spot / flood &nbsp;·&nbsp; <b>R</b> (hold) rest, torch off<br>""")
open(p,'w',encoding='utf-8').write(s)
p='README.md'; s=open(p,encoding='utf-8').read()
rep("""| T | chalk a note on the rock you're looking at |""", """| R (hold) | rest on dry ground: the torch goes off to spare it, the cold and the tiredness go; the dark is not empty |
| T | chalk a note on the rock you're looking at |""")
open(p,'w',encoding='utf-8').write(s); print('ok')

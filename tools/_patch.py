p='src/main.js'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)
rep("""  if (stuck > 0) {                                            // wiggle: alternate A and D to work yourself loose
    const side = keys.KeyA || keys.ArrowLeft ? -1 : keys.KeyD || keys.ArrowRight ? 1 : 0;
    if (side !== 0 && side !== stuckSide) { stuckSide = side; stuck--; wiggles++; sfx.play('scrape', { x: player.x, y: player.y + 0.3, z: player.z, vol: 0.5, rate: 1.3, vary: 0.3, dur: 0.5, hrtf: false }); camera.rotation.z += side * 0.05;
      if (stuck === 0) { showHint('free'); sfx.play('gasp', { vol: 0.7 }); } }
    stuckT += dt;
  }""",
"""  if (stuck > 0) {                                            // wiggle: alternate A and D to work yourself loose
    const side = keys.KeyA || keys.ArrowLeft ? -1 : keys.KeyD || keys.ArrowRight ? 1 : 0;
    if (side !== 0 && side !== stuckSide) { stuckSide = side; wiggles++; sfx.play('scrape', { x: player.x, y: player.y + 0.3, z: player.z, vol: 0.5, rate: 1.3, vary: 0.3, dur: 0.5, hrtf: false }); camera.rotation.z += side * 0.05;
      if (!stuckTight) stuck--;
      else if (wiggles % 3 === 0) showHint('no. wiggling does nothing here. breathe out and push — hold C', true);
      if (stuck === 0) { showHint('free'); sfx.play('gasp', { vol: 0.7 }); } }
    // the tight ones: you only get through by breathing out — and you cannot do that for long
    if (stuckTight) {
      if (keys.KeyC || keys.ControlLeft) {
        exhaling = true; player.breath = Math.max(0, player.breath - dt / (BREATH_S * 0.7)); exhaleT += dt;
        if (exhaleT > 0.9) { exhaleT = 0; stuck--; sfx.play('drag', { x: player.x, y: player.y + 0.3, z: player.z, vol: 0.6, rate: 0.8, dur: 0.8, hrtf: false }); camera.rotation.z += (Math.random() - 0.5) * 0.04; if (stuck === 0) { showHint('through. breathe', true); sfx.play('gasping', { vol: 0.8 }); } }
        if (player.breath <= 0) { player.breath = 0; die('WEDGED', 'you breathed in. the rock did not give it back', 'wedged'); }
      } else { exhaling = false; exhaleT = 0; player.breath = Math.min(1, player.breath + dt / 3); }
    }
    stuckT += dt;
  }""")
rep("""  if (stuck === 0 && player.h <= 0.52 && ml > 0 && moved > 0 && !player.swim && clear < 0.62 && Math.random() < dt * 0.06) {
    stuck = 5 + (Math.random() * 4 | 0); stuckSide = 0; stuckT = 0;
    showHint('stuck. wiggle — A, D, A, D', true); sfx.play('scrape', { vol: 0.7, rate: 0.7, dur: 1.2 }); sfx.play('gasp', { vol: 0.5, rate: 0.9 });
  }""",
"""  if (stuck === 0 && player.h <= 0.52 && ml > 0 && moved > 0 && !player.swim && clear < 0.62 && Math.random() < dt * 0.06) {
    stuck = 5 + (Math.random() * 4 | 0); stuckSide = 0; stuckT = 0; wiggles = 0; exhaleT = 0;
    const sg = G.nearestSegAt(player.x, player.y + 0.3, player.z);
    stuckTight = !!(sg && sg.rmin < 0.62 && Math.random() < 0.5);                    // a squeeze proper: chest-tight
    if (stuckTight) { stuck = 3 + (Math.random() * 3 | 0); showHint('stuck. it has your chest. breathe out — hold C — and push', true); sfx.play('scrape', { vol: 0.8, rate: 0.6, dur: 1.4 }); sfx.play('gasping', { vol: 0.6 }); teach('tight', 'the tight ones: you get through on an empty chest, a few centimetres at a time. watch the bar'); }
    else { showHint('stuck. wiggle — A, D, A, D', true); sfx.play('scrape', { vol: 0.7, rate: 0.7, dur: 1.2 }); sfx.play('gasp', { vol: 0.5, rate: 0.9 }); }
  }""")
rep("""let stuck = 0, stuckSide = 0, stuckT = 0, wiggles = 0, coldT = 0, coldDropped = false;""",
    """let stuck = 0, stuckSide = 0, stuckT = 0, wiggles = 0, coldT = 0, coldDropped = false, stuckTight = false, exhaling = false, exhaleT = 0;""")
rep("""let record = { runs: 0, best: 0, escapes: 0, drowned: 0, fell: 0, froze: 0, crushed: 0, foul: 0 };""",
    """let record = { runs: 0, best: 0, escapes: 0, drowned: 0, fell: 0, froze: 0, crushed: 0, foul: 0, wedged: 0 };""")
rep("""r.cause === 'foul' ? 'stopped breathing' : 'fell'}. +25%`);""",
    """r.cause === 'foul' ? 'stopped breathing' : r.cause === 'wedged' ? 'stuck' : 'fell'}. +25%`);""")
rep("""  const CAUSE = { drowned: 'drowned', fell: 'fell', froze: 'froze', crushed: 'buried', foul: 'bad air' };""",
    """  const CAUSE = { drowned: 'drowned', fell: 'fell', froze: 'froze', crushed: 'buried', foul: 'bad air', wedged: 'wedged' };""")
# the breath meter shows while exhaling (breath < 1 already shows it); the tag
rep("""  breathM.querySelector('.tag').textContent = player.foul ? 'bad air' : 'air';""",
    """  breathM.querySelector('.tag').textContent = player.foul ? 'bad air' : exhaling ? 'breathe out' : 'air';""")
open(p,'w',encoding='utf-8').write(s); print('ok')

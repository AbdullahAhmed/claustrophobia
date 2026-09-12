p='src/main.js'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)
rep("""function start() { overlay.classList.add('hidden'); running = true; }""",
"""let introDone = false;
function start() {
  overlay.classList.add('hidden'); running = true;
  if (!introDone && !resumed && cave.attempts === 1 && runTime < 1) {                  // the fall: white, a rush, the ground, then the hole far above
    introDone = true;
    const fl = $('flash'); fl.style.transition = 'none'; fl.style.opacity = 1; void fl.offsetWidth;
    player.pitch = 1.25; player.yaw = Math.atan2(-0.6, 0.4) + Math.PI;
    sfx.play('whoosh', { vol: 0.9, rate: 0.7 });
    setTimeout(() => { sfx.play('body_fall', { vol: 1 }); sfx.play('rockfall', { vol: 0.6, rate: 0.9, dur: 1.5, wet: 0.8 }); camera.rotation.z = 0.12; fl.style.transition = 'opacity 3s ease-in'; fl.style.opacity = 0; $('hurt').style.opacity = 0.6; setTimeout(() => { $('hurt').style.opacity = 0; }, 1200); }, 900);
    setTimeout(() => sfx.play('gasping', { vol: 0.6 }), 1900);
    setTimeout(() => showHint('the hole you fell through. it is a long way up', true), 3200);
  } else if (!introDone) introDone = true;
}""")
rep("""  if (cave.run && !urlSeedIsNew) {                                  // pick the interrupted attempt back up""",
    """  if (cave.run && !urlSeedIsNew) { resumed = true;                  // pick the interrupted attempt back up""")
rep("""let introDone = false;""", """let introDone = false, resumed = false;""")
open(p,'w',encoding='utf-8').write(s); print('ok')

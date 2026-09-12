p='src/main.js'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)
rep("""  if (e.code === 'KeyG' && !e.repeat) dropGlowstick();""",
    """  if (e.code === 'KeyG' && !e.repeat) dropGlowstick();
  if (e.code === 'KeyH' && !e.repeat) whistle();""")
rep("""function updateBats(dt) {""",
"""// ---------- a whistle: the cave answers, and tells you how big it is ----------
let whistleT = 0;
function whistle() {
  if (whistleT > 0 || player.under) return; whistleT = 1.6;
  sfx.play('whistle', { vol: 0.7, rate: rr(0.95, 1.05) });
  camera.getWorldDirection(viewDir);
  const o = Math.max(2, open), delay = clamp(o * 2 / 340, 0.04, 0.4);
  const ex = camera.position.x + viewDir.x * o, ey = camera.position.y + viewDir.y * o, ez = camera.position.z + viewDir.z * o;
  setTimeout(() => sfx.play('whistle', { x: ex, y: ey, z: ez, vol: 0.32 * clamp(o / 14, 0.25, 1), rate: 0.98, wet: 1.0, rolloff: 0.4 }), delay * 1000);
  if (o > 9) setTimeout(() => sfx.play('whistle', { x: ex - viewDir.x * o * 0.5, y: ey, z: ez - viewDir.z * o * 0.5, vol: 0.14, rate: 0.96, wet: 1.0, rolloff: 0.3 }), delay * 2200);
  if (o > 16) setTimeout(() => sfx.play('rumble', { vol: 0.25, rate: 1.4, dur: 1.2, wet: 1.0 }), delay * 2600);
  for (const r of roosts) if (!r.spooked && Math.hypot(r.x - player.x, r.y - player.y, r.z - player.z) < 22) setTimeout(() => spookRoost(r), 300);
  if (following > 0) { following = 0; followT = rr(40, 90); }                          // whatever it is, it stops when you do that
  teach('whistle', o > 9 ? 'listen to it come back. that took a while: this is a big space' : 'it came straight back. there is not much room here');
}
function updateBats(dt) {""")
rep("""  updateLoose(dt);
  updateFollower(dt);""", """  updateLoose(dt);
  whistleT -= dt;
  updateFollower(dt);""")
open(p,'w',encoding='utf-8').write(s)

p='index.html'; s=open(p,encoding='utf-8').read()
rep("""     <b>T</b> chalk &nbsp;·&nbsp; <b>G</b> glowstick (three) &nbsp;·&nbsp; <b>E</b> rig a rope at a drop, if you found one &nbsp;·&nbsp; <b>M</b> survey<br>""",
    """     <b>T</b> chalk &nbsp;·&nbsp; <b>G</b> glowstick (three) &nbsp;·&nbsp; <b>E</b> rig a rope at a drop, if you found one &nbsp;·&nbsp; <b>H</b> whistle &nbsp;·&nbsp; <b>M</b> survey<br>""")
open(p,'w',encoding='utf-8').write(s)
p='README.md'; s=open(p,encoding='utf-8').read()
rep("""| M | your survey notebook""", """| H | whistle — the echo tells you how big the space is, even with the torch dead; bats mind it |
| M | your survey notebook""")
open(p,'w',encoding='utf-8').write(s); print('ok')

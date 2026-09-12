p='src/main.js'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)
rep("""function floodFlowMul() { return 1 + 1.6 * floodLevel; }""",
"""function floodFlowMul() { return 1 + 1.6 * floodLevel; }

// ---------- a tremor: the whole hill shifts, once in a while ----------
let tremorAt = rr(420, 900), tremorT = 0;
function updateTremor(dt) {
  if (!running || !player.alive || player.out) return;
  if (tremorT > 0) { tremorT -= dt; camera.rotation.z += (Math.random() - 0.5) * 0.02 * Math.min(1, tremorT); camera.position.y += (Math.random() - 0.5) * 0.012 * Math.min(1, tremorT); return; }
  if (runTime < tremorAt) return;
  tremorAt = runTime + rr(600, 1200); tremorT = 4.5;
  sfx.play('rumble', { vol: 1.0, rate: 0.55, dur: 6, wet: 1.0 });
  for (let k = 0; k < 7; k++) setTimeout(() => sfx.play('rockfall', { x: player.x + rr(-14, 14), y: player.y + rr(0, 4), z: player.z + rr(-14, 14), vol: rr(0.3, 0.6), rate: rr(0.8, 1.2), dur: 1.0, wet: 0.9, rolloff: 0.5 }), 400 + k * rr(200, 600));
  setTimeout(() => sfx.play('gasp', { vol: 0.6 }), 700);
  // anything loose within earshot lets go
  for (const L of loose) if (L.state === 'hanging' && Math.hypot(L.x - player.x, L.z - player.z) < 30) { L.state = 'warning'; L.t = Math.random() * 0.6; }
  for (const r of roosts) if (!r.spooked && Math.hypot(r.x - player.x, r.z - player.z) < 25) setTimeout(() => spookRoost(r), 600);
  showHint('the rock moved. all of it', true);
  teach('tremor', 'that was the hill settling. it happens. what it shakes loose is the problem');
}""")
rep("""  updateFollower(dt);
  updateFlood(dt);""", """  updateFollower(dt);
  updateFlood(dt);
  updateTremor(dt);""")
rep("""startFlood: () => { floodAt = 0; },""", """startFlood: () => { floodAt = 0; }, tremor: () => { tremorAt = 0; },""")
open(p,'w',encoding='utf-8').write(s); print('ok')

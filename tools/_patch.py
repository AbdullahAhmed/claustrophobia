p='src/main.js'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)
rep("""// ---------- something crosses the passage ----------""",
"""// ---------- the light leaves: something picks up the torch while you sit in the dark, and carries it off ----------
let carried = null, stealArmed = true;
function stealTorch() {
  if (!torchHeld || carried) return;
  const sg = G.nearestSegAt(player.x, player.y + 0.5, player.z); if (!sg || !sg.nb) return;
  const n0 = sg.nb, path = [];
  for (let i = n0.i + 1; i <= n0.i + 7; i++) { const n = G.nodes.find(q => q.w === n0.w && q.i === i); if (!n || n.wl !== undefined) break; path.push(n); }
  if (path.length < 3) return;
  dropTorch(); dropT = 1e9;                                                        // not to be picked up while it is walking
  torch.position.set(player.x, player.y + 0.9, player.z);
  carried = { path, t: 0, dur: 2.2 * path.length, stepT: 0 };
  resting = false; restRequested = false;
  gameDelay(() => showHint('the torch is moving. you are not holding it', true), 900);
  sfx.play('creature_breath', { x: player.x, y: player.y + 1.2, z: player.z, vol: 0.5, rolloff: 1.5 });
}
function updateCarried(dt) {
  if (!carried) {
    if (resting && restT > 12 && dread > 0.6 && stealArmed && Math.random() < dt * 0.08) { stealArmed = false; stealTorch(); }
    return;
  }
  carried.t += dt; carried.stepT -= dt;
  const k = Math.min(1, carried.t / carried.dur), seg = Math.min(carried.path.length - 1, Math.floor(k * carried.path.length)), f = k * carried.path.length - seg;
  const a = seg === 0 ? { x: player.x, y: player.y, z: player.z } : carried.path[seg - 1], b = carried.path[seg];
  const x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f + 0.9 + Math.sin(carried.t * 6) * 0.08, z = a.z + (b.z - a.z) * f;
  torch.position.set(x, y, z); torch.lookAt(b.x, b.y + 0.9, b.z);
  if (carried.stepT <= 0) { carried.stepT = 0.55; sfx.play('step_rock', { x, y: y - 0.9, z, vol: 0.45, rate: 0.8, wet: 0.7 }); }
  if (k >= 1) {
    const last = carried.path[carried.path.length - 1], fy = floorBelow(last.x, last.y + 0.5, last.z);
    torch.position.set(last.x, (fy === null ? last.y : fy) + 0.22, last.z); torch.quaternion.setFromEuler(_dropE.set(rr(-0.2, 0.1), Math.random() * 6.28, 0));
    sfx.play('torch_click', { x: last.x, y: last.y, z: last.z, vol: 0.7 }); sfx.play('rattle', { x: last.x, y: last.y, z: last.z, vol: 0.5, rate: 0.8 });
    carried = null; dropT = 0.5;
    gameDelay(() => showHint('it put it down. go and get it', true), 600);
  }
}

// ---------- something crosses the passage ----------""")
rep("""  updateCrosser(dt);
  updateBats(dt);""", """  updateCrosser(dt);
  updateCarried(dt);
  updateBats(dt);""")
rep("""startFlood: () => { floodAt = 0; }, tremor: () => { tremorAt = 0; },""",
    """startFlood: () => { floodAt = 0; }, tremor: () => { tremorAt = 0; }, steal: stealTorch,""")
open(p,'w',encoding='utf-8').write(s); print('ok')

p='src/gen.js'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)
rep("""              wl: a.wl !== undefined ? a.wl : b.wl, core: a.core !== false && b.core !== false,""",
    """              wl: a.wl !== undefined ? a.wl : b.wl, floods: !!(a.floods || b.floods), core: a.core !== false && b.core !== false,""")
rep("""    if (wl !== undefined) { n.wl = wl; if (this.flow) n.flow = this.flow; }""",
    """    if (wl !== undefined) { n.wl = wl; if (this.flow) n.flow = this.flow; if (this.stream || this.sump || this.pit) n.floods = true; }   // live water: it rises when it rains up top""")
rep("""export function foulAt(x, y, z) {""",
    """// a flood pulse: every stream, sump and plunge pool rises by h (metres above its normal level); the chunks holding them rebuild
export let flood = 0;
export function setFlood(h) {
  flood = h;
  for (const s of segs) { if (!s.floods) continue; if (s.wl0 === undefined) s.wl0 = s.wl; s.wl = s.wl0 + h; }
  for (const n of nodes) { if (!n.floods) continue; if (n.wl0 === undefined) n.wl0 = n.wl; n.wl = n.wl0 + h; }
  for (const [key, list] of cellSegs) { const ch = chunks.get(key); if (!ch || !ch.built) continue; for (const s of list) if (s.floods) { ch.dirty = true; break; } }
}
export function foulAt(x, y, z) {""")
open(p,'w',encoding='utf-8').write(s)

p='src/main.js'; s=open(p,encoding='utf-8').read()
rep("""// ---------- the sound of moving water ----------""",
"""// ---------- the flood: it rained up top, and the cave's water is rising ----------
let floodPhase = 'dry', floodT = 0, floodAt = rr(300, 540), floodPeak = 0, floodLevel = 0, floodStep = 0;
function updateFlood(dt) {
  if (!running || !player.alive || player.out) return;
  if (floodPhase === 'dry') {
    if (runTime > floodAt) {
      floodPhase = 'rising'; floodT = 0; floodPeak = rr(0.7, 1.15);
      sfx.play('rumble', { vol: 0.7, rate: 0.6, dur: 6, wet: 0.9 });
      setTimeout(() => showHint('listen. the water is rising', true), 2500);
      teach('flood', 'it rained up top. the streams and the sumps will run higher for a while — stay out of them, or be quick');
    }
    return;
  }
  floodT += dt;
  if (floodPhase === 'rising') { floodLevel = floodPeak * Math.min(1, floodT / 90); if (floodT >= 90) { floodPhase = 'high'; floodT = 0; } }
  else if (floodPhase === 'high') { floodLevel = floodPeak; if (floodT >= 150) { floodPhase = 'falling'; floodT = 0; } }
  else if (floodPhase === 'falling') { floodLevel = floodPeak * Math.max(0, 1 - floodT / 240); if (floodT >= 240) { floodPhase = 'dry'; floodLevel = 0; floodAt = runTime + rr(420, 720); showHint('the water is going down', true); } }
  const step = Math.round(floodLevel / 0.2) * 0.2;                      // the field only moves in 20 cm steps: each one is a rebuild
  if (step !== floodStep) { floodStep = step; G.setFlood(step); }
}
function floodFlowMul() { return 1 + 1.6 * floodLevel; }

// ---------- the sound of moving water ----------""")
# the current gets stronger in flood
rep("""    const f = player.flow, k = player.swim ? 1 : clamp((depthW - 0.2) / 0.5, 0.15, 0.8);
    player.x += f.x * f.s * k * dt; player.z += f.z * f.s * k * dt; collide();""",
    """    const f = player.flow, k = (player.swim ? 1 : clamp((depthW - 0.2) / 0.5, 0.15, 0.8)) * floodFlowMul();
    player.x += f.x * f.s * k * dt; player.z += f.z * f.s * k * dt; collide();""")
rep("""  if (streamLoop) { if (best) { streamLoop.setPos(best.x, best.wl, best.z); streamLoop.setVol(0.55 * Math.min(1, best.flow.s), 0.5); } else streamLoop.setVol(0, 1.0); }""",
    """  if (streamLoop) { if (best) { streamLoop.setPos(best.x, best.wl, best.z); streamLoop.setVol(0.55 * Math.min(1, best.flow.s) * floodFlowMul(), 0.5); streamLoop.setRate(1 + 0.15 * floodLevel, 1); } else streamLoop.setVol(0, 1.0); }""")
rep("""  updateLoose(dt);
  updateOlms(dt);""", """  updateLoose(dt);
  updateFlood(dt);
  updateOlms(dt);""")
rep("""spawnCrosser, get crosser() { return crosser; }, places, loose, caches, composePage, olms };""",
    """spawnCrosser, get crosser() { return crosser; }, places, loose, caches, composePage, olms, get flood() { return { floodPhase, floodLevel, floodAt, floodStep }; }, startFlood: () => { floodAt = 0; } };""")
open(p,'w',encoding='utf-8').write(s); print('ok')

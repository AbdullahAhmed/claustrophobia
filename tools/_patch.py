p='src/gen.js'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)
# unstable trunk crawls
rep("""    // a loose block in the roof of a cavern (or a big chamber): it comes down when something moves under it""",
    """    // an unstable stretch of a low trunk passage: it can come down behind you once you are through
    if (this.kind === 'trunk' && core && wl === undefined && !this.pit && !this.sump && this.age > 30 && this.mode &&
        (this.mode.name === 'crawl' || this.mode.name === 'squeeze' || this.mode.name === 'bedding') && R() < 0.05) n.unstable = true;
    // a loose block in the roof of a cavern (or a big chamber): it comes down when something moves under it""")
rep("""export function foulAt(x, y, z) {""",
    """// the roof of a low passage comes down: the segments through the node lose their crawl core and gain a block of rock
export function collapseAt(n) {
  const r = Math.max(n.rx, n.ry) * 1.2 + 0.4, b = { x: n.x, y: n.y + n.ry * 0.5, z: n.z, r };
  for (const s of segs) {
    if (!(s.nb === n || (s.nb && s.nb.w === n.w && s.nb.i === n.i + 1))) continue;
    s.core = false; s.boulders = s.boulders.concat([b]);
    const e = r + 1; s.x0 = Math.min(s.x0, n.x - e); s.x1 = Math.max(s.x1, n.x + e); s.y0b = Math.min(s.y0b, n.y - e); s.y1b = Math.max(s.y1b, n.y + e); s.z0 = Math.min(s.z0, n.z - e); s.z1 = Math.max(s.z1, n.z + e);
  }
  n.core = false;
  const cx = Math.floor(n.x / CHUNK), cy = Math.floor(n.y / CHUNK), cz = Math.floor(n.z / CHUNK);
  for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const ch = chunks.get(ckey(cx + dx, cy + dy, cz + dz)); if (ch) ch.dirty = true; }
}
export function foulAt(x, y, z) {""")
open(p,'w',encoding='utf-8').write(s)

p='src/main.js'; s=open(p,encoding='utf-8').read()
rep("""// ---------- eyes ----------""",
"""// ---------- the passage that closes behind you ----------
const collapsed = new Set(); let collapseT = 0; const unstableNear = [];
function updateCollapse(dt) {
  collapseT -= dt; if (collapseT > 0) return; collapseT = 0.4;
  if (cave.collapsed) for (const key of cave.collapsed) if (!collapsed.has(key)) { const n = G.nodes.find(q => q.unstable && `${q.x.toFixed(0)},${q.z.toFixed(0)}` === key); if (n && G.chunkReadyAt(n.x, n.y + 0.5, n.z)) { G.collapseAt(n); collapsed.add(key); } }
  for (const n of G.nodes) {
    if (!n.unstable) continue;
    const key = `${n.x.toFixed(0)},${n.z.toFixed(0)}`; if (collapsed.has(key)) continue;
    const d = Math.hypot(n.x - player.x, n.y - player.y, n.z - player.z);
    if (d < 1.4) n.passed = true;
    else if (n.passed && d > 3.5 && d < 9 && Math.hypot(player.x, player.z) > Math.hypot(n.x, n.z) + 1.5 && player.grounded) {
      // you are through, and farther in than it is: it comes down behind you
      collapsed.add(key); cave.collapsed = (cave.collapsed || []).concat([key]); saveCave();
      sfx.play('rattle', { x: n.x, y: n.y + 0.5, z: n.z, vol: 0.8, rate: 0.8, wet: 0.7, rolloff: 0.5 });
      setTimeout(() => { sfx.play('rockslide', { x: n.x, y: n.y + 0.5, z: n.z, vol: 1.0, wet: 0.9, rolloff: 0.3 }); sfx.play('rumble', { x: n.x, y: n.y + 0.5, z: n.z, vol: 0.9, rate: 0.8, dur: 3, wet: 0.8, rolloff: 0.3 }); G.collapseAt(n); }, 700);
      for (let k = 0; k < 6; k++) setTimeout(() => sfx.play('rockfall', { x: n.x + rr(-1.5, 1.5), y: n.y + 0.3, z: n.z + rr(-1.5, 1.5), vol: 0.4, rate: rr(0.8, 1.2), dur: 0.8, wet: 0.7 }), 900 + k * 220);
      setTimeout(() => { showHint('the roof came down behind you. that way is gone', true); sfx.play('gasp', { vol: 0.6 }); }, 1600);
    }
  }
}

// ---------- eyes ----------""")
rep("""  updateLoose(dt);
  updateStreamSound(dt);""", """  updateLoose(dt);
  updateCollapse(dt);
  updateStreamSound(dt);""")
open(p,'w',encoding='utf-8').write(s); print('ok')

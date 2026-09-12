p='src/gen.js'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)
rep("""export function fieldAt(x, y, z) {
  const cx = Math.floor(x / CHUNK), cy = Math.floor(y / CHUNK), cz = Math.floor(z / CHUNK);
  const ch = chunks.get(ckey(cx, cy, cz));
  if (!ch || !ch.built || ch.solid || !ch.density) return 1.0;
  return gridAt(ch.density, (x - cx * CHUNK) / VOXEL, (y - cy * CHUNK) / VOXEL, (z - cz * CHUNK) / VOXEL);
}""",
"""export function fieldAt(x, y, z) {
  const cx = Math.floor(x / CHUNK), cy = Math.floor(y / CHUNK), cz = Math.floor(z / CHUNK);
  const ch = chunks.get(ckey(cx, cy, cz));
  if (!ch || !ch.built || ch.solid || !ch.density) return 1.0;
  const g = gridAt(ch.density, (x - cx * CHUNK) / VOXEL, (y - cy * CHUNK) / VOXEL, (z - cz * CHUNK) / VOXEL);
  if (g <= -0.45 || g > 0.3) return g;
  // the crawl core is thinner than a voxel, so the grid smears it; near it, trust the line the mesh was built from
  const list = cellSegs.get(ckey(cx, cy, cz)); if (!list) return g;
  const s = nearestSeg(list, x, y, z);
  if (s && s.core) { const c = coreDist(s, x, y, z); if (c < g) return c; }
  return g;
}""")
# dripstone: nothing hangs across a passage you have to walk through
rep("""    const roomy = this.ry > 1.5 && wl === undefined && core;""",
    """    const roomy = this.ry > 1.5 && this.rx > 1.15 && wl === undefined && core;""")
rep("""        n.spel.push({ x, z, top: ceil + 0.3, len: column ? ceil - n.y + 0.6 : Math.min(len, ceil - n.y - 0.5), r: column ? r * 1.3 : r, up: false });""",
    """        const clear = this.rx > 2.5 ? 0.5 : 1.3;                                          // in a passage, a stalactite leaves head-room; in a chamber it can come low
        n.spel.push({ x, z, top: ceil + 0.3, len: column && this.rx > 2.0 ? ceil - n.y + 0.6 : Math.min(len, ceil - n.y - clear), r: column ? r * 1.3 : r, up: false });""")
open(p,'w',encoding='utf-8').write(s); print('ok')

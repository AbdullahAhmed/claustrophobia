p='src/gen.js'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)
rep("""    this.roost = false; this.stream = null; this.flow = null; this.lake = null; this.chimney = 0;""",
    """    this.roost = false; this.stream = null; this.flow = null; this.lake = null; this.chimney = 0; this.exitStream = 0;""")
# claim: a trunk in a streamway leaves by the water — a resurgence — instead of climbing
rep("""      if (this.gated) { exitClaimed = true; this.exit = true; this.target = null; this.stream = null; this.flow = null; }""",
    """      if (this.gated) {
        exitClaimed = true; this.exit = true; this.target = null;
        if (this.stream) { this.exitStream = wr(24, 40); this.modeLeft = 1e9; this.stream.toSump = false; }   // the water goes out; so can you
        else { this.stream = null; this.flow = null; }
      }""")
rep("""        if (this.exit) {
          this.pitch += (0.32 - this.pitch) * 0.3;""",
    """        if (this.exit && this.exitStream > 0) {                                     // a resurgence: the stream runs out into daylight
          this.exitStream -= STEP;
          if (this.exitStream < 14) this.tint = 4;
          if (this.exitStream <= 0) { this.carve(true, this.stream.wl); makeExit(this, true); return false; }
        } else if (this.exit) {
          this.pitch += (0.32 - this.pitch) * 0.3;""")
rep("""      if (this.stream && !this.exit) {                            // water runs downhill""",
    """      if (this.stream && (!this.exit || this.exitStream > 0)) {  // water runs downhill""")
rep("""        const rapids = S.toSump ? 1 + 1.4 * clamp(1 - S.left / 10, 0, 1) : 1;""",
    """        const rapids = S.toSump ? 1 + 1.4 * clamp(1 - S.left / 10, 0, 1) : this.exitStream > 0 ? 1 + 1.2 * clamp(1 - this.exitStream / 16, 0, 1) : 1;""")
rep("""function makeExit(w) {
  const cp = Math.cos(w.pitch), dx = Math.sin(w.yaw) * cp, dz = Math.cos(w.yaw) * cp;
  const n0 = w.node;
  const n1 = { x: n0.x + dx * 3, y: n0.y + 1.0, z: n0.z + dz * 3, rx: 3.5, ry: 2.8, w: w.id, i: ++w.n, core: true, algae: 0 };
  const n2 = { x: n1.x + dx * 5, y: n1.y + 1.2, z: n1.z + dz * 5, rx: 6, ry: 5, w: w.id, i: ++w.n, core: true, algae: 0 };
  addSeg(n0, n1); addSeg(n1, n2); nodes.push(n1, n2);
  exit = { x: n2.x, y: n2.y, z: n2.z, dx, dz, n1 };
  props.push({ type: 'exit', ...exit });
}""",
"""function makeExit(w, resurgence = false) {
  const cp = Math.cos(w.pitch), dx = Math.sin(w.yaw) * cp, dz = Math.cos(w.yaw) * cp;
  const n0 = w.node, rise = resurgence ? 0.05 : 1;
  const n1 = { x: n0.x + dx * 3, y: n0.y + 1.0 * rise, z: n0.z + dz * 3, rx: 3.5, ry: 2.8, w: w.id, i: ++w.n, core: true, algae: 0, tint: 4 };
  const n2 = { x: n1.x + dx * 5, y: n1.y + 1.2 * rise, z: n1.z + dz * 5, rx: 6, ry: 5, w: w.id, i: ++w.n, core: true, algae: 0, tint: 4 };
  if (resurgence && n0.wl !== undefined) { for (const q of [n1, n2]) { q.wl = n0.wl; q.floods = true; q.flow = n0.flow ? { x: n0.flow.x, z: n0.flow.z, s: 1.0 } : undefined; if (q.flow) streamNodes.push(q); } }
  addSeg(n0, n1); addSeg(n1, n2); nodes.push(n1, n2);
  exit = { x: n2.x, y: n2.y, z: n2.z, dx, dz, n1, resurgence };
  props.push({ type: 'exit', ...exit });
}""")
open(p,'w',encoding='utf-8').write(s); print('ok')

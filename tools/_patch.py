p='src/gen.js'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)
# remember the ledge node when the pit starts
rep("""      if (P.phase === 'ledge') { this.pitch = 0; this.rx = lerp(this.rx, 1.3, 0.6); this.ry = lerp(this.ry, 1.3, 0.6); P.phase = 'drop'; voids.push({ x: this.x, y: P.bottom, z: this.z, top: this.y, wet: P.wl !== undefined }); }""",
    """      if (P.phase === 'ledge') { this.pitch = 0; this.rx = lerp(this.rx, 1.3, 0.6); this.ry = lerp(this.ry, 1.3, 0.6); P.phase = 'drop'; P.ledge = this.node; P.ledgeYaw = this.yaw; voids.push({ x: this.x, y: P.bottom, z: this.z, top: this.y, wet: P.wl !== undefined }); }""")
# at the bottom: sometimes a ramp from the ledge winds down to meet it — the traverse cavers take instead of the drop
rep("""          if (P.cavern) this.pickMode(MODE.cavern); else this.pickMode(MODE.passage);
          this.pit = null; this.gated = true;""",
    """          if (P.cavern) this.pickMode(MODE.cavern); else this.pickMode(MODE.passage);
          if (P.ledge && P.wl === undefined && R() < 0.5 && worms.length < MAX_WORMS) {
            const side = R() < 0.5 ? -1 : 1, L = P.ledge;
            const ramp = new Worm((Math.imul(this.id, 1000003) + this.n * 7 + 5) | 0, L, P.ledgeYaw + side * 1.5, -0.15, 'side', 60);
            ramp.pickMode(MODE.passage); ramp.trx = 0.85; ramp.try = 1.15; ramp.rx = 0.85; ramp.ry = 1.15; ramp.modeLeft = 1e9;
            ramp.ramp = { via: { x: L.x + Math.sin(P.ledgeYaw + side * 1.5) * 9, y: (L.y + P.bottom) / 2, z: L.z + Math.cos(P.ledgeYaw + side * 1.5) * 9 }, to: this.node };
            worms.push(ramp);
            if (R() < 0.6) props.push({ type: 'note', x: L.x, y: L.y, z: L.z, text: side < 0 ? 'traverse left. it goes round' : 'traverse right. it goes round' });
          }
          this.pit = null; this.gated = true;""")
rep("""      if (this.target) {
        const t = this.target, dx = t.x - this.x, dz = t.z - this.z, dy = t.y - this.y;""",
    """      if (this.ramp) {                                     // the traverse: out and down to a waypoint, then aim for the pit floor
        const v = this.ramp.via, dx = v.x - this.x, dz = v.z - this.z, dy = v.y - this.y;
        this.yaw += clamp(angDiff(Math.atan2(dx, dz), this.yaw), -0.35, 0.35);
        this.pitch += clamp(Math.atan2(dy, Math.hypot(dx, dz)) - this.pitch, -0.15, 0.15);
        if (Math.hypot(dx, dz) < 3) { this.target = this.ramp.to; this.ramp = null; }
      } else if (this.target) {
        const t = this.target, dx = t.x - this.x, dz = t.z - this.z, dy = t.y - this.y;""")
rep("""    this.roost = false; this.stream = null; this.flow = null; this.lake = null; this.chimney = 0; this.exitStream = 0; this.cathedral = false;""",
    """    this.roost = false; this.stream = null; this.flow = null; this.lake = null; this.chimney = 0; this.exitStream = 0; this.cathedral = false; this.ramp = null;""")
open(p,'w',encoding='utf-8').write(s); print('ok')

p='src/gen.js'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)
rep("""SEED = seed; setSeed(seed); rand = mulberry32(seed); EXIT_AT = rr(200, 320);""",
    """SEED = seed; setSeed(seed); rand = mulberry32(seed); EXIT_AT = rr(340, 500);""")
rep("""    this.roost = false; this.stream = null; this.flow = null;
  }""","""    this.roost = false; this.stream = null; this.flow = null;
    this.gated = false;                                          // trunks: has this line been through water or over a drop yet?
  }""")
# the trunk wanders more: the way out is not a straight line
rep("""          const away = Math.atan2(this.x, this.z);              // trunks head away from the entrance
          this.yaw += angDiff(away, this.yaw) * 0.06;""",
    """          const away = Math.atan2(this.x, this.z);              // trunks head away from the entrance, loosely
          this.yaw += angDiff(away, this.yaw) * 0.035;""")
# sumps and pits count as the gate
rep("""        if (this.y > S.wl + 0.3) { this.sump = null; this.flow = null; this.pickMode(MODE.passage); }""",
    """        if (this.y > S.wl + 0.3) { this.sump = null; this.flow = null; this.gated = true; this.pickMode(MODE.passage); }""")
rep("""          if (P.cavern) this.pickMode(MODE.cavern); else this.pickMode(MODE.passage);
          this.pit = null;""",
    """          if (P.cavern) this.pickMode(MODE.cavern); else this.pickMode(MODE.passage);
          this.pit = null; this.gated = true;""")
# the exit is claimed only past a sump or a pit; if the line has had neither, it gets one now
rep("""    if (this.kind === 'trunk' && !exitClaimed && !this.sump && !this.pit && Math.hypot(this.x, this.z) > EXIT_AT) { exitClaimed = true; this.exit = true; this.target = null; this.stream = null; this.flow = null; }""",
    """    if (this.kind === 'trunk' && !exitClaimed && !this.sump && !this.pit && Math.hypot(this.x, this.z) > EXIT_AT) {
      if (this.gated) { exitClaimed = true; this.exit = true; this.target = null; this.stream = null; this.flow = null; }
      else if (this.pinch === 0 && !this.stream) {                // the way out is through the water: one committed sump before the climb
        this.stream = null; this.flow = null; this.pickMode(MODE.sump);
        if (this.sump) { this.sump.left = wr(11, 19); this.sump.bellAt = this.sump.left > 14 ? this.sump.left * wr(0.45, 0.6) : null; this.sump.trap = false; }
        else this.gated = true;                                    // too deep for a sump here: the depth was the price
      }
    }""")
open(p,'w',encoding='utf-8').write(s); print('ok')

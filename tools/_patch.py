p='src/gen.js'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)
rep("""export const trunkIds = new Set();
let windows = 0;""", """export const trunkIds = new Set();
let windows = 0, cathedral = false;          // the one great room per cave""")
rep("""  nodes.length = 0; segs.length = 0; cellSegs.clear(); worms.length = 0; props.length = 0; algaeNodes.length = 0; streamNodes.length = 0;
  voids.length = 0; sumpNodes.length = 0; trunkIds.clear(); windows = 0; rounds = 0; exit = null; exitClaimed = false;""",
"""  nodes.length = 0; segs.length = 0; cellSegs.clear(); worms.length = 0; props.length = 0; algaeNodes.length = 0; streamNodes.length = 0;
  voids.length = 0; sumpNodes.length = 0; trunkIds.clear(); windows = 0; cathedral = false; rounds = 0; exit = null; exitClaimed = false;""")
# the cathedral: forced once, on a trunk, well in
rep("""    if (m.name === 'lake') { this.lake = {""",
    """    if (this.cathedral) {                                        // a lake in the middle of a great cavern, its roof lit, water falling into it
      m = MODE.cavern; this.cathedral = false;
      this.trx = wr(11, 16); this.try = wr(8, 12); this.modeLeft = wr(40, 60);
      this.lake = { wl: this.y + 0.35, total: this.modeLeft, left: this.modeLeft }; this.algae = 1; this.roost = true; this.tint = 0;
      props.push({ type: 'cascade', x: this.x + Math.sin(this.yaw) * 14, y: this.y + 9, z: this.z + Math.cos(this.yaw) * 14, wl: this.y + 0.35, big: true });
      props.push({ type: 'glowworms', x: this.x + Math.sin(this.yaw) * 20, y: this.y + 12, z: this.z + Math.cos(this.yaw) * 20, floor: this.y - 2, rx: 12, n: 700, seed: R() });
      props.push({ type: 'note', x: this.x, y: this.y, z: this.z, text: ['we stopped here for a long time', 'look up', 'the big one. swim it', 'turn the light off here'][(R() * 4) | 0] });
      this.mode = m; this.lake.cathedral = true;
      return;
    }
    if (m.name === 'lake') { this.lake = {""")
rep("""    if (this.kind === 'trunk' && !exitClaimed && !this.sump && !this.pit && Math.hypot(this.x, this.z) > EXIT_AT) {""",
    """    if (this.kind === 'trunk' && !cathedral && !this.sump && !this.pit && !this.stream && !this.lake && this.chimney <= 0 && Math.hypot(this.x, this.z) > EXIT_AT * 0.42 && R() < 0.03) { cathedral = true; this.cathedral = true; this.modeLeft = 0; }
    if (this.kind === 'trunk' && !exitClaimed && !this.sump && !this.pit && Math.hypot(this.x, this.z) > EXIT_AT) {""")
rep("""    this.roost = false; this.stream = null; this.flow = null; this.lake = null; this.chimney = 0; this.exitStream = 0;""",
    """    this.roost = false; this.stream = null; this.flow = null; this.lake = null; this.chimney = 0; this.exitStream = 0; this.cathedral = false;""")
open(p,'w',encoding='utf-8').write(s); print('ok')

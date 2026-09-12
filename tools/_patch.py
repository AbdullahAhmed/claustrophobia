p='src/gen.js'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)
rep("""  { name: 'gour',    rx: [1.8, 3.2], ry: [1.5, 2.6],   len: [12, 30], w: 0.035 },  // rimstone terraces: calcite dams holding shallow pools, stepping down""",
    """  { name: 'gour',    rx: [1.8, 3.2], ry: [1.5, 2.6],   len: [12, 30], w: 0.035 },  // rimstone terraces: calcite dams holding shallow pools, stepping down
  { name: 'lake',    rx: [5.0, 9.0], ry: [3.5, 6.0],   len: [24, 44], w: 0.03 },   // a black lake in a big chamber: you swim it, in the cold, under algae""")
rep("""    this.roost = false; this.stream = null; this.flow = null;""",
    """    this.roost = false; this.stream = null; this.flow = null; this.lake = null;""")
rep("""    if ((m.name === 'sump' || m.name === 'pit' || m.name === 'cavern' || m.name === 'crystal' || m.name === 'stream' || m.name === 'gour') && (this.age < 20 || this.exit)) m = MODES[0];""",
    """    if ((m.name === 'sump' || m.name === 'pit' || m.name === 'cavern' || m.name === 'crystal' || m.name === 'stream' || m.name === 'gour' || m.name === 'lake') && (this.age < 20 || this.exit)) m = MODES[0];
    if (m.name === 'lake' && this.kind !== 'trunk' && this.life < 50) m = MODES[0];
    this.lake = null;""")
rep("""    if (m.name === 'gour') { this.algae = 0;""",
    """    if (m.name === 'lake') { this.lake = { wl: this.y + 1.9, total: this.modeLeft, left: this.modeLeft }; this.algae = wr(0.7, 1); this.roost = R() < 0.5; if (R() < 0.4) props.push({ type: 'note', x: this.x, y: this.y, z: this.z, text: R() < 0.5 ? 'deep. cold. swim it fast' : 'the lake. keep left' }); }
    if (m.name === 'gour') { this.algae = 0;""")
rep("""      if (this.mode && this.mode.name === 'gour' && !this.exit) {  // terraces step down gently; each holds a pool""",
    """      if (this.lake && !this.exit) {                              // down into the water, along under it, and up out the far side
        const L = this.lake; L.left -= STEP;
        this.pitch = clamp(this.pitch * 0.6 + (L.left > L.total * 0.5 ? -0.16 : 0.18) * 0.4, -0.3, 0.3);
        if (this.y > L.wl - 0.6 && L.left > L.total * 0.5) this.pitch = -0.16;
        this.wander = clamp(this.wander, -0.05, 0.05);
        if (this.y < L.wl - 0.2) wl = L.wl;
      }
      if (this.mode && this.mode.name === 'gour' && !this.exit) {  // terraces step down gently; each holds a pool""")
rep("""if (this.stream || this.sump || this.pit) n.floods = true; }""", """if (this.stream || this.sump || this.pit || this.lake) n.floods = true; }""")
open(p,'w',encoding='utf-8').write(s)

p='src/main.js'; s=open(p,encoding='utf-8').read()
rep("""const NAME_B = { cavern: ['Hall', 'Cathedral', 'Vault', 'Hollow', 'Chamber'],""",
    """const NAME_B = { lake: ['Lake', 'Water', 'Mere', 'Pool'], cavern: ['Hall', 'Cathedral', 'Vault', 'Hollow', 'Chamber'],""")
rep("""const n = sg.nb, kind = n.rx > 8 ? 'cavern' : n.tint === 5 ? 'crystal' : n.gour ? 'gour' : n.rx > 3.4 && n.ry > 2.6 ? 'chamber' : null;""",
    """const n = sg.nb, kind = n.wl !== undefined && n.wl - n.y > 1.2 && n.rx > 4 ? 'lake' : n.rx > 8 ? 'cavern' : n.tint === 5 ? 'crystal' : n.gour ? 'gour' : n.rx > 3.4 && n.ry > 2.6 ? 'chamber' : null;""")
open(p,'w',encoding='utf-8').write(s); print('ok')

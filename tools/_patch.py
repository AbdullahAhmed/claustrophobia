p='src/gen.js'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)
rep("""  { name: 'lake',    rx: [5.0, 9.0], ry: [3.5, 6.0],   len: [24, 44], w: 0.03 },   // a black lake in a big chamber: you swim it, in the cold, under algae""",
    """  { name: 'lake',    rx: [5.0, 9.0], ry: [3.5, 6.0],   len: [24, 44], w: 0.03 },   // a black lake in a big chamber: you swim it, in the cold, under algae
  { name: 'duck',    rx: [1.0, 1.5], ry: [0.44, 0.5],  len: [8, 18],  w: 0.05 },   // a flooded crawl: on your belly with your chin in the water and the roof on your back""")
rep("""    if ((m.name === 'sump' || m.name === 'pit' || m.name === 'cavern' || m.name === 'crystal' || m.name === 'stream' || m.name === 'gour' || m.name === 'lake') && (this.age < 20 || this.exit)) m = MODES[0];""",
    """    if ((m.name === 'sump' || m.name === 'pit' || m.name === 'cavern' || m.name === 'crystal' || m.name === 'stream' || m.name === 'gour' || m.name === 'lake' || m.name === 'duck') && (this.age < 20 || this.exit)) m = MODES[0];""")
rep("""    if (m.name === 'lake') { this.lake = {""",
    """    if (m.name === 'duck') { this.pitch = 0; this.algae = 0; if (R() < 0.4) props.push({ type: 'note', x: this.x, y: this.y, z: this.z, text: ['chin up', 'keep your head up. it goes', 'wet crawl. 12 m', 'breathe through your nose'][(R() * 4) | 0] }); }
    if (m.name === 'lake') { this.lake = {""")
rep("""      if (this.lake && !this.exit) {                              // down into the water, along under it, and up out the far side""",
    """      if (this.mode && this.mode.name === 'duck' && !this.exit) { // flat, and flooded to just under the roof
        this.pitch = clamp(this.pitch * 0.5, -0.03, 0.03); this.wander = clamp(this.wander, -0.1, 0.1);
        wl = Math.round((this.y + 0.27) / 0.1) * 0.1;
      }
      if (this.lake && !this.exit) {                              // down into the water, along under it, and up out the far side""")
rep("""if (this.stream || this.sump || this.pit || this.lake) n.floods = true; }""",
    """if (this.stream || this.sump || this.pit || this.lake || (this.mode && this.mode.name === 'duck')) n.floods = true; }""")
open(p,'w',encoding='utf-8').write(s); print('ok')

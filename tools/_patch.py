p='src/gen.js'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)
rep("""    // a loose block in the roof of a cavern (or a big chamber): it comes down when something moves under it""",
    """    // a window: a second hole to the sky in a shallow chamber roof — daylight, roots, birds, and no way up it
    if (core && wl === undefined && !this.pit && !this.sump && this.ry > 2.2 && this.rx > 2.5 && n.y > -16 && n.y < 4 && R() < 0.012 && windows < 6) {
      windows++;
      const top = n.y + (1 + CY) * this.ry;
      let prev = { x: n.x, y: top - 1.0, z: n.z, rx: 0.9, ry: 0.9, w: -3, i: windows * 40, core: false, algae: 0 };
      nodes.push(prev);
      const steps = Math.ceil((SURFACE_Y + 5 - prev.y) / 1.5);
      for (let k = 1; k <= steps; k++) {
        const q = { x: n.x + Math.sin(k * 0.8 + windows) * 0.2, y: prev.y + 1.5, z: n.z + Math.cos(k * 0.7 + windows) * 0.2, rx: 0.8, ry: 0.8, w: -3, i: windows * 40 + k, core: false, algae: 0 };
        addSeg(prev, q); nodes.push(q); prev = q;
      }
      props.push({ type: 'sinkhole', x: prev.x, y: prev.y + 0.6, z: prev.z, floor: n.y, window: true });
      props.push({ type: 'roots', x: n.x, y: top - 0.2, z: n.z, rx: this.rx * 0.6, n: 6 + (R() * 6 | 0), seed: R() });
      if (R() < 0.5) props.push({ type: 'note', x: n.x, y: n.y, z: n.z, text: ['too far up', 'we tried the walls. no', 'daylight. 14 m. no', 'shout. nobody'][(R() * 4) | 0] });
      n.tint = 4; n.window = true;
    }
    // a loose block in the roof of a cavern (or a big chamber): it comes down when something moves under it""")
rep("""export const trunkIds = new Set();""", """export const trunkIds = new Set();
let windows = 0;""")
open(p,'w',encoding='utf-8').write(s)

p='src/main.js'; s=open(p,encoding='utf-8').read()
rep("""  sinkhole = { ...p, sky, shaft, pool, dripT: 0 };
  // rain down the shaft, into a puddle
  placeCascade({ x: p.x, y: p.y - 0.5, z: p.z, wl: p.floor + 0.02, big: false, quiet: true });""",
"""  sinkhole = { ...p, sky, shaft, pool, dripT: 0 };
  // rain down the shaft, into a puddle
  placeCascade({ x: p.x, y: p.y - 0.5, z: p.z, wl: p.floor + 0.02, big: false, quiet: true });
  if (p.window && soundsOn) { const b = sfx.loop('birds', { x: p.x, y: p.y + 1, z: p.z, rolloff: 1.2 }); b.setVol(0.5, 2); }""")
rep("""const NAME_B = { lake: ['Lake', 'Water', 'Mere', 'Pool'],""", """const NAME_B = { window: ['Window', 'Skylight', 'Eye', 'Light'], lake: ['Lake', 'Water', 'Mere', 'Pool'],""")
rep("""const n = sg.nb, kind = n.wl !== undefined && n.wl - n.y > 1.2 && n.rx > 4 ? 'lake' :""",
    """const n = sg.nb, kind = n.window ? 'window' : n.wl !== undefined && n.wl - n.y > 1.2 && n.rx > 4 ? 'lake' :""")
open(p,'w',encoding='utf-8').write(s); print('ok')

p='src/gen.js'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)
rep("""              old: (b.theme || a.theme) === 'old', broken: (b.theme || a.theme) === 'broken',""",
    """              old: (b.theme || a.theme) === 'old', broken: (b.theme || a.theme) === 'broken', blue: !!(a.blue || b.blue),""")
rep("""                algae: core ? this.algae : 0, tint: this.tint, foul: this.foul, gour: !!(this.mode && this.mode.name === 'gour' && !this.pit && !this.sump), chimney: this.chimney > 0 };""",
    """                algae: core ? this.algae : 0, tint: this.tint, foul: this.foul, gour: !!(this.mode && this.mode.name === 'gour' && !this.pit && !this.sump), chimney: this.chimney > 0,
                blue: !!this.lake || this.theme === 'wet' && this.tint === 3 };   // over the lakes, and in the grey-blue wet rock, the glow is blue-white, not green""")
open(p,'w',encoding='utf-8').write(s)

p='src/field.js'; s=open(p,encoding='utf-8').read()
rep("""          if (bs.algae > 0) g = bs.algae * patch;
          if (bs.wl !== undefined && y > bs.wl - 0.2 && y < bs.wl + 1.6) g = Math.max(g, (bs.wl - Math.max(bs.y0, bs.y1) < 0.12 ? 0.3 : 0.8) * patch * (1 - (y - bs.wl) / 1.8));   // puddles grow less than pools""",
    """          if (bs.algae > 0) g = bs.algae * patch;
          if (bs.wl !== undefined && y > bs.wl - 0.2 && y < bs.wl + 1.6) g = Math.max(g, (bs.wl - Math.max(bs.y0, bs.y1) < 0.12 ? 0.3 : 0.8) * patch * (1 - (y - bs.wl) / 1.8));   // puddles grow less than pools
          if (bs.blue) g = -g;                                                          // the sign carries the colour: negative glow renders blue-white""")
open(p,'w',encoding='utf-8').write(s)

p='src/main.js'; s=open(p,encoding='utf-8').read()
rep("""    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\\ntotalEmissiveRadiance += vec3(0.10, 0.75, 0.55) * vGlow * vGlow * 0.32;');""",
    """    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\\ntotalEmissiveRadiance += (vGlow < 0.0 ? vec3(0.30, 0.55, 1.0) : vec3(0.10, 0.75, 0.55)) * vGlow * vGlow * 0.32;');""")
rep("""    l.position.set(n.x, n.y + 0.9, n.z); l.intensity = 0.3 * n.algae;""",
    """    l.position.set(n.x, n.y + 0.9, n.z); l.intensity = 0.3 * n.algae; l.color.set(n.blue ? 0x6fa0ff : 0x2fd8b0);""")
open(p,'w',encoding='utf-8').write(s); print('ok')

p='src/gen.js'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)
rep("""              wl: a.wl !== undefined ? a.wl : b.wl, floods: !!(a.floods || b.floods), chimney: !!(a.chimney || b.chimney), core: a.core !== false && b.core !== false,""",
    """              wl: a.wl !== undefined ? a.wl : b.wl, floods: !!(a.floods || b.floods), chimney: !!(a.chimney || b.chimney), core: a.core !== false && b.core !== false,
              old: (b.theme || a.theme) === 'old', broken: (b.theme || a.theme) === 'broken',""")
open(p,'w',encoding='utf-8').write(s)

p='src/field.js'; s=open(p,encoding='utf-8').read()
rep("""          if (bs.core) { const c = coreDist(bs, x, y, z); if (c < v) v = c; }   // last: the crawl core is a promise, boulders and dripstone included""",
    """          if (bs.old) { const fl = vnoise(x * 0.55 + 11, y * 0.9, z * 0.55 - 4); if (fl > 0.3) cal = Math.max(cal, smooth(0.3, 0.6, fl) * 0.85); }   // old rock: flowstone sheets over the walls
          if (bs.broken) v += 0.12 * vnoise(x * 3.1, y * 3.1, z * 3.1);                                                                  // broken rock: a rougher surface
          if (bs.core) { const c = coreDist(bs, x, y, z); if (c < v) v = c; }   // last: the crawl core is a promise, boulders and dripstone included""")
open(p,'w',encoding='utf-8').write(s); print('ok')

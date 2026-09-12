p='src/field.js'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)
block = """          if (bs.slabs) for (let q = 0; q < bs.slabs.length; q++) {   // a crust of sediment lying across a shaft: flat, thin, and not attached to much
            const sl = bs.slabs[q], hd = Math.hypot(x - sl.x, z - sl.z);
            const sd = Math.min(sl.r - hd + 0.1 * vnoise(x * 2.7, 0, z * 2.7), 0.2 - Math.abs(y - sl.y));
            if (sd > v) v = sd;
          }
"""
assert block in s; s = s.replace(block, "")
rep("""          if (bs.core) { const c = coreDist(bs, x, y, z); if (c < v) v = c; }   // last: the crawl core is a promise, boulders and dripstone included""",
    """          if (bs.core) { const c = coreDist(bs, x, y, z); if (c < v) v = c; }   // last: the crawl core is a promise, boulders and dripstone included
""" + block.replace("// a crust of sediment lying across a shaft: flat, thin, and not attached to much", "// after the core: a crust of sediment lying across a shaft, whole until it is not"))
open(p,'w',encoding='utf-8').write(s); print('ok')

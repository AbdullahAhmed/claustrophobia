p='src/main.js'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)
rep("""function placeGlowworms(p) {
  let sd = p.seed * 233280 | 0; const R = () => (sd = (sd * 9301 + 49297) % 233280) / 233280;
  let placed = 0;
  for (let i = 0; i < p.n && wormInst.count < 4000; i++) {
    const a = R() * Math.PI * 2, d = Math.sqrt(R()) * p.rx, x = p.x + Math.sin(a) * d, z = p.z + Math.cos(a) * d;
    // the roof above this spot
    let cy = null; for (let h = 0; h < 6; h += 0.12) { const yy = p.floor + 1.2 + h; if (G.fieldAt(x, yy, z) > -0.04) { cy = yy - 0.06; break; } }
    if (cy === null) continue;
    const drop = 0.05 + R() * 0.35, y = cy - drop;
    _m.compose(_p.set(x, y, z), _q.identity(), _s.set(1, 1, 1)); wormInst.setMatrixAt(wormInst.count++, _m);
    threadPos.push(x, cy, z, x, y, z); placed++;
  }
  wormInst.instanceMatrix.needsUpdate = true;
  wormThreads.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(threadPos), 3));
  if (placed > 20) { const site = { x: p.x, y: p.y, z: p.z, n: placed, light: borrowLight(0x5fd8b8, 2.2, p.rx * 3, 1.4, p.x, p.y - 0.8, p.z) }; if (site.light) site.light.userData.owner = site; wormSites.push(site); }
}""",
"""// placed a few dozen per call, so a big roof spreads over several frames; returns true when the prop is finished
function placeGlowworms(p) {
  if (p.sd === undefined) { p.sd = p.seed * 233280 | 0; p.done = 0; p.placed = 0; }
  const R = () => (p.sd = (p.sd * 9301 + 49297) % 233280) / 233280;
  const stop = Math.min(p.n, p.done + 60);
  for (; p.done < stop && wormInst.count < 4000; p.done++) {
    const a = R() * Math.PI * 2, d = Math.sqrt(R()) * p.rx, x = p.x + Math.sin(a) * d, z = p.z + Math.cos(a) * d;
    // the roof above this spot: a coarse climb, then a fine one
    let cy = null; for (let h = 0; h < 6; h += 0.3) { const yy = p.floor + 1.2 + h; if (G.fieldAt(x, yy, z) > -0.04) { for (let f = yy - 0.3; f <= yy; f += 0.06) if (G.fieldAt(x, f, z) > -0.04) { cy = f - 0.06; break; } break; } }
    if (cy === null) continue;
    const drop = 0.05 + R() * 0.35, y = cy - drop;
    _m.compose(_p.set(x, y, z), _q.identity(), _s.set(1, 1, 1)); wormInst.setMatrixAt(wormInst.count++, _m);
    threadPos.push(x, cy, z, x, y, z); p.placed++;
  }
  wormInst.instanceMatrix.needsUpdate = true;
  wormThreads.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(threadPos), 3));
  if (p.done < p.n && wormInst.count < 4000) return false;
  if (p.placed > 20) { const site = { x: p.x, y: p.y, z: p.z, n: p.placed, light: borrowLight(0x5fd8b8, 2.2, p.rx * 3, 1.4, p.x, p.y - 0.8, p.z) }; if (site.light) site.light.userData.owner = site; wormSites.push(site); }
  return true;
}""")
rep("""    else if (p.type === 'glowworms') placeGlowworms(p);""",
    """    else if (p.type === 'glowworms') { if (!placeGlowworms(p)) continue; }""")
open(p,'w',encoding='utf-8').write(s); print('ok')

p='src/gen.js'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)
rep("""    // draperies: thin calcite curtains hanging from a sloped roof, in the old rock mostly""",
    """    // cave pearls: little calcite spheres in the terrace pools
    if (this.mode && this.mode.name === 'gour' && wl !== undefined && R() < 0.35) props.push({ type: 'pearls', x: n.x, y: wl, z: n.z, r: this.rx * 0.5, n: 8 + (R() * 20 | 0), seed: R() });
    // draperies: thin calcite curtains hanging from a sloped roof, in the old rock mostly""")
open(p,'w',encoding='utf-8').write(s)

p='src/main.js'; s=open(p,encoding='utf-8').read()
rep("""    else if (p.type === 'oldrope') placeOldRope(p);""",
    """    else if (p.type === 'oldrope') placeOldRope(p);
    else if (p.type === 'pearls') placePearls(p);""")
rep("""// draperies: a wavy calcite sheet hung from the roof""",
"""// cave pearls: calcite spheres, polished by the water that made them
const pearlInst = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 5), new THREE.MeshStandardMaterial({ color: 0xf2ead8, roughness: 0.35 }), 1500); pearlInst.count = 0; pearlInst.frustumCulled = false; scene.add(pearlInst);
function placePearls(p) {
  let sd = p.seed * 233280 | 0; const R = () => (sd = (sd * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < p.n && pearlInst.count < 1500; i++) {
    const a = R() * Math.PI * 2, d = Math.sqrt(R()) * p.r, x = p.x + Math.sin(a) * d, z = p.z + Math.cos(a) * d;
    const fy = floorBelow(x, p.y + 0.3, z); if (fy === null || fy > p.y - 0.02) continue;      // on the pool floor, under the water
    const r = 0.025 + R() * 0.035;
    _m.compose(_p.set(x, fy + r * 0.8, z), _q.identity(), _s.set(r, r * 0.9, r)); pearlInst.setMatrixAt(pearlInst.count++, _m);
  }
  pearlInst.instanceMatrix.needsUpdate = true;
}
// draperies: a wavy calcite sheet hung from the roof""")
# V hides the interface for a look
rep("""  if (e.code === 'KeyH' && !e.repeat) whistle();""",
    """  if (e.code === 'KeyH' && !e.repeat) whistle();
  if (e.code === 'KeyV' && !e.repeat) { hudHidden = !hudHidden; for (const id of ['torchm', 'breathm', 'hint', 'hud']) $(id).style.visibility = hudHidden ? 'hidden' : ''; }""")
rep("""let torchDrifting = false, beamNarrow = false;""", """let torchDrifting = false, beamNarrow = false, hudHidden = false;""")
open(p,'w',encoding='utf-8').write(s); print('ok')

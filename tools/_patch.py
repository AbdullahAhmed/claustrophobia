p='src/gen.js'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)
rep("""    if (this.roost && this.ry > 2.0 && !this.pit && !this.sump) { this.roost = false; props.push({ type: 'roost', x: n.x, y: n.y + (1 + CY) * this.ry - 0.4, z: n.z, floor: n.y, n: 25 + (R() * 45 | 0) }); }""",
    """    if (this.roost && this.ry > 2.0 && !this.pit && !this.sump) { this.roost = false; props.push({ type: 'roost', x: n.x, y: n.y + (1 + CY) * this.ry - 0.4, z: n.z, floor: n.y, n: 25 + (R() * 45 | 0) }); }
    // glow-worms: a damp roof over still water or a big chamber, hung with a few hundred blue-green lights
    if (core && this.ry > 1.8 && !this.pit && !this.sump && (wl !== undefined || this.mode.name === 'cavern' || this.mode.name === 'chamber') && R() < (wl !== undefined ? 0.05 : 0.02)) {
      props.push({ type: 'glowworms', x: n.x, y: n.y + (1 + CY) * this.ry, z: n.z, floor: n.y, rx: Math.max(2.5, this.rx * 0.9), n: 120 + (R() * 220 | 0), seed: R() });
    }""")
open(p,'w',encoding='utf-8').write(s)

p='src/main.js'; s=open(p,encoding='utf-8').read()
rep("""    else if (p.type === 'loose') placeLoose(p);""",
    """    else if (p.type === 'loose') placeLoose(p);
    else if (p.type === 'glowworms') placeGlowworms(p);""")
rep("""// ---------- loose rock: the roof is not all attached ----------""",
"""// ---------- glow-worms: the roof, lit ----------
const wormMat = new THREE.MeshBasicMaterial({ color: 0x8cf0d0, fog: false });
const wormInst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.018, 5, 4), wormMat, 4000); wormInst.count = 0; scene.add(wormInst);
const wormThreads = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x9fe8d4, transparent: true, opacity: 0.35 }));
const threadPos = []; scene.add(wormThreads);
const wormSites = [];
function placeGlowworms(p) {
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
  if (placed > 20) { wormSites.push({ x: p.x, y: p.y, z: p.z, n: placed, light: new THREE.PointLight(0x5fd8b8, 2.2, p.rx * 3, 1.4) }); const L = wormSites[wormSites.length - 1].light; L.position.set(p.x, p.y - 0.8, p.z); scene.add(L); }
}
let wormSeenT = 0;
function updateGlowworms(dt) {
  wormSeenT -= dt; if (wormSeenT > 0) return; wormSeenT = 1;
  for (const w of wormSites) if (Math.hypot(w.x - player.x, w.y - player.y, w.z - player.z) < 14) { teach('glowworms', 'the roof is lit. thousands of them, each on a thread of silk. turn the torch off and look'); surveyNote('lights', w.x, w.z); if (!places.some(pl => Math.hypot(pl.x - w.x, pl.z - w.z) < 30)) { let sd = (Math.abs(w.x * 73 + w.z * 131) | 0) + SEED; const Rr = () => ((sd = (sd * 9301 + 49297) % 233280) / 233280); const nm = `${NAME_A[(Rr() * NAME_A.length) | 0]} Lights`; places.push({ x: w.x, y: w.y, z: w.z, name: nm, kind: 'lights' }); showHint(nm.toLowerCase(), true); } }
}

// ---------- loose rock: the roof is not all attached ----------""")
rep("""  updateLoose(dt);
  whistleT -= dt;""", """  updateLoose(dt);
  updateGlowworms(dt);
  whistleT -= dt;""")
open(p,'w',encoding='utf-8').write(s); print('ok')

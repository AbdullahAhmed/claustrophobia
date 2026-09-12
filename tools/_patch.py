p='src/gen.js'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)
rep("""    // fossils in the bedding: an ammonite, a crinoid stem, a shell, pressed into the wall at eye height""",
    """    // draperies: thin calcite curtains hanging from a sloped roof, in the old rock mostly
    if (core && wl === undefined && !this.pit && !this.sump && this.ry > 1.9 && this.rx > 1.8 && R() < 0.04 * (this.theme === 'old' ? 3 : 0.5)) {
      const a = R() * Math.PI * 2, d = R() * this.rx * 0.6;
      props.push({ type: 'curtain', x: n.x + Math.sin(a) * d, z: n.z + Math.cos(a) * d, floor: n.y, top: n.y + (1 + CY) * this.ry, len: wr(0.8, 2.4), width: wr(0.8, 2.2), seed: R() });
    }
    // mist over still water, in the wet stretches
    if (wl !== undefined && !this.sump && this.lake && n.i % 6 === 0) props.push({ type: 'mist', x: n.x, y: wl, z: n.z, r: this.rx * 0.8, seed: R() });
    // fossils in the bedding: an ammonite, a crinoid stem, a shell, pressed into the wall at eye height""")
open(p,'w',encoding='utf-8').write(s)

p='src/main.js'; s=open(p,encoding='utf-8').read()
rep("""    else if (p.type === 'fossil') placeFossil(p);""",
    """    else if (p.type === 'fossil') placeFossil(p);
    else if (p.type === 'curtain') placeCurtain(p);
    else if (p.type === 'mist') placeMist(p);""")
rep("""// fossils: drawn on a canvas, pressed into the nearest wall like chalk""",
"""// draperies: a wavy calcite sheet hung from the roof
const curtainMat = new THREE.MeshStandardMaterial({ color: 0xe8d9b8, roughness: 0.5, emissive: 0x1a1408, side: THREE.DoubleSide, flatShading: true, transparent: true, opacity: 0.92 });
function placeCurtain(p) {
  // the roof at this spot
  let cy = null; for (let h = 0; h < 8; h += 0.12) { const yy = p.floor + 1.5 + h; if (G.fieldAt(p.x, yy, p.z) > -0.04) { cy = yy; break; } }
  if (cy === null) return;
  let sd = p.seed * 233280 | 0; const R = () => (sd = (sd * 9301 + 49297) % 233280) / 233280;
  const W = p.width, L = Math.min(p.len, cy - p.floor - 0.9), segs = 14;
  const g = new THREE.PlaneGeometry(W, L, segs, 4), pos = g.attributes.position, ph = R() * 6.28, freq = 2.5 + R() * 3;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), t = (y + L / 2) / L;                       // t: 0 bottom, 1 top (hangs from the top edge)
    pos.setZ(i, Math.sin(x * freq + ph) * 0.12 * (1.2 - t) + Math.sin(x * freq * 2.3 + ph * 2) * 0.05);
    pos.setY(i, y - (1 - t) * Math.abs(Math.sin(x * freq * 0.7 + ph)) * 0.35);            // a scalloped bottom edge
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, curtainMat); m.position.set(p.x, cy - L / 2 + 0.05, p.z); m.rotation.y = R() * Math.PI; m.castShadow = true; scene.add(m);
}
// mist: a few soft, slow sheets just above still water
const mistTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const r = g.createRadialGradient(64, 64, 4, 64, 64, 62); r.addColorStop(0, 'rgba(200,215,210,0.55)'); r.addColorStop(0.6, 'rgba(200,215,210,0.18)'); r.addColorStop(1, 'rgba(200,215,210,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
const mistMat = new THREE.MeshBasicMaterial({ map: mistTex, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide, fog: false });
const mists = [];
function placeMist(p) {
  let sd = p.seed * 233280 | 0; const R = () => (sd = (sd * 9301 + 49297) % 233280) / 233280;
  for (let k = 0; k < 3; k++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(p.r * 1.6, p.r * 1.6), mistMat); m.rotation.x = -Math.PI / 2;
    m.position.set(p.x + (R() - 0.5) * p.r, p.y + 0.25 + k * 0.12, p.z + (R() - 0.5) * p.r); m.rotation.z = R() * 6.28; scene.add(m);
    mists.push({ mesh: m, x0: m.position.x, z0: m.position.z, ph: R() * 6.28, sp: 0.03 + R() * 0.04 });
  }
}
function updateMists(dt) {
  const t = performance.now() * 0.001;
  for (const m of mists) { m.mesh.position.x = m.x0 + Math.sin(t * m.sp + m.ph) * 1.2; m.mesh.position.z = m.z0 + Math.cos(t * m.sp * 0.8 + m.ph) * 1.2; m.mesh.rotation.z += dt * 0.02; }
}
// fossils: drawn on a canvas, pressed into the nearest wall like chalk""")
rep("""  updateFossils(dt);
  whistleT -= dt;""", """  updateFossils(dt);
  updateMists(dt);
  whistleT -= dt;""")
open(p,'w',encoding='utf-8').write(s); print('ok')

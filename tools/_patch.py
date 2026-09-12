p='src/gen.js'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)
rep("""    // a window: a second hole to the sky in a shallow chamber roof — daylight, roots, birds, and no way up it""",
    """    // fossils in the bedding: an ammonite, a crinoid stem, a shell, pressed into the wall at eye height
    if (core && wl === undefined && !this.pit && !this.sump && this.mode && (this.mode.name === 'bedding' || this.mode.name === 'passage' || this.mode.name === 'canyon') && R() < 0.025)
      props.push({ type: 'fossil', x: n.x, y: n.y, z: n.z, kind: (R() * 3) | 0, seed: R(), size: wr(0.25, 0.7) });
    // a window: a second hole to the sky in a shallow chamber roof — daylight, roots, birds, and no way up it""")
open(p,'w',encoding='utf-8').write(s)

p='src/main.js'; s=open(p,encoding='utf-8').read()
rep("""    else if (p.type === 'glowworms') placeGlowworms(p);""",
    """    else if (p.type === 'glowworms') placeGlowworms(p);
    else if (p.type === 'fossil') placeFossil(p);""")
rep("""// cascades: water falling from the ceiling into a pool""",
"""// fossils: drawn on a canvas, pressed into the nearest wall like chalk
function fossilTexture(kind, seed) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const ctx = cv.getContext('2d');
  let sd = seed * 233280 | 0; const R = () => (sd = (sd * 9301 + 49297) % 233280) / 233280;
  ctx.strokeStyle = 'rgba(60,48,38,0.9)'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  if (kind === 0) {                                                            // ammonite: a spiral with ribs
    ctx.beginPath(); for (let t = 0; t < Math.PI * 7; t += 0.08) { const r = 6 + t * 5.2; const x = 128 + Math.cos(t) * r, y = 128 + Math.sin(t) * r; t ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke();
    ctx.lineWidth = 3; for (let t = Math.PI * 2; t < Math.PI * 7; t += 0.35) { const r0 = 6 + t * 5.2, r1 = 6 + (t + Math.PI * 2) * 5.2; ctx.beginPath(); ctx.moveTo(128 + Math.cos(t) * r0, 128 + Math.sin(t) * r0); ctx.lineTo(128 + Math.cos(t + 0.15) * r1, 128 + Math.sin(t + 0.15) * r1); ctx.stroke(); }
  } else if (kind === 1) {                                                     // crinoid stem: a stack of discs
    const a = R() * Math.PI, dx = Math.cos(a), dy = Math.sin(a); ctx.lineWidth = 4;
    for (let k = -14; k <= 14; k++) { const cx = 128 + dx * k * 7, cy = 128 + dy * k * 7; ctx.beginPath(); ctx.ellipse(cx, cy, 12, 5, a + Math.PI / 2, 0, Math.PI * 2); ctx.stroke(); }
  } else {                                                                     // a brachiopod shell: a fan of ribs
    ctx.beginPath(); ctx.arc(128, 150, 70, Math.PI, 0); ctx.lineTo(128, 150); ctx.closePath(); ctx.stroke();
    ctx.lineWidth = 2.5; for (let k = 0; k <= 14; k++) { const a = Math.PI + k / 14 * Math.PI; ctx.beginPath(); ctx.moveTo(128, 150); ctx.lineTo(128 + Math.cos(a) * 68, 150 + Math.sin(a) * 68); ctx.stroke(); }
  }
  const img = ctx.getImageData(0, 0, 256, 256), d = img.data;
  for (let i = 3; i < d.length; i += 4) if (d[i]) d[i] = d[i] * (0.35 + 0.65 * Math.random());
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}
function placeFossil(p) {
  let best = null, bd = 6, bn = null;
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * Math.PI * 2 + p.seed, dx = Math.sin(a), dz = Math.cos(a);
    const t = G.rayToRock(p.x, p.y + 1.1 + p.seed * 0.5, p.z, dx, 0, dz, 5, 0.1);
    if (t < bd) { bd = t; best = new THREE.Vector3(p.x + dx * (t - 0.02), p.y + 1.1 + p.seed * 0.5, p.z + dz * (t - 0.02)); }
  }
  if (!best) return;
  G.gradAt(best.x, best.y, best.z); const g = G.G, gl = Math.hypot(g.x, g.y, g.z) || 1; const normal = new THREE.Vector3(-g.x / gl, -g.y / gl, -g.z / gl);
  const mat = new THREE.MeshLambertMaterial({ map: fossilTexture(p.kind, p.seed), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  decalHelper.position.copy(best); decalHelper.lookAt(best.clone().add(normal)); decalHelper.rotateZ(p.seed * 6.28);
  const size = new THREE.Vector3(p.size, p.size, 0.4); let placed = false;
  const cx = Math.floor(best.x / G.CHUNK), cy = Math.floor(best.y / G.CHUNK), cz = Math.floor(best.z / G.CHUNK);
  for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const ch = G.chunks.get(G.ckey(cx + dx, cy + dy, cz + dz)); if (!ch || !ch.mesh) continue;
    if (ch.mesh.geometry.boundingSphere.distanceToPoint(best) > p.size) continue;
    ch.mesh.updateMatrixWorld();
    const geo = new DecalGeometry(ch.mesh, best, decalHelper.rotation, size);
    if (geo.attributes.position && geo.attributes.position.count > 0) { scene.add(new THREE.Mesh(geo, mat)); placed = true; }
  }
  if (placed) fossils.push({ x: best.x, y: best.y, z: best.z, kind: p.kind });
}
const fossils = [];
let fossilT = 0;
function updateFossils(dt) {
  fossilT -= dt; if (fossilT > 0) return; fossilT = 1;
  for (const f of fossils) if (Math.hypot(f.x - player.x, f.y - player.y - 1.2, f.z - player.z) < 2.2) { teach('fossil', ['an ammonite in the wall. this was a sea floor once. the rock is older than you can think about', 'a crinoid stem in the wall: a stack of little discs. it was an animal, on a sea floor, a very long time ago', 'a shell in the wall. the whole hill is made of them'][f.kind]); break; }
}
// cascades: water falling from the ceiling into a pool""")
rep("""  updateGlowworms(dt);
  whistleT -= dt;""", """  updateGlowworms(dt);
  updateFossils(dt);
  whistleT -= dt;""")
open(p,'w',encoding='utf-8').write(s); print('ok')

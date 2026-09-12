p='src/gen.js'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)
rep("""P.phase = 'drop'; P.ledge = this.node; P.ledgeYaw = this.yaw; voids.push({ x: this.x, y: P.bottom, z: this.z, top: this.y, wet: P.wl !== undefined }); }""",
    """P.phase = 'drop'; P.ledge = this.node; P.ledgeYaw = this.yaw; voids.push({ x: this.x, y: P.bottom, z: this.z, top: this.y, wet: P.wl !== undefined });
        if (R() < 0.22) props.push({ type: 'oldrope', x: this.x, y: this.y, z: this.z, bottom: P.bottom, frayed: R() < 0.3 });   // someone rigged this once, and left it
      }""")
open(p,'w',encoding='utf-8').write(s)

p='src/main.js'; s=open(p,encoding='utf-8').read()
rep("""    else if (p.type === 'curtain') placeCurtain(p);""",
    """    else if (p.type === 'curtain') placeCurtain(p);
    else if (p.type === 'oldrope') placeOldRope(p);""")
rep("""function useRope() {""",
"""// a rope somebody else left on a pitch: it works, unless it does not
const oldRopeMat = new THREE.MeshStandardMaterial({ color: 0x6b5a48, roughness: 1 });
function placeOldRope(p) {
  const r = { x: p.x, z: p.z, top: p.y, bottom: p.bottom, old: true, frayed: p.frayed, mesh: new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, p.y - p.bottom + 0.3, 5), oldRopeMat) };
  r.mesh.position.set(p.x, (p.y + p.bottom) / 2 - 0.1, p.z); scene.add(r.mesh); ropes.push(r);
}
function useRope() {""")
# on an old frayed rope, partway down, it goes
rep("""  const r = roping.rope, span = r.top - r.bottom, speed = roping.dir < 0 ? 1.6 : 0.9;
  roping.t += dt;""",
    """  const r = roping.rope, span = r.top - r.bottom, speed = roping.dir < 0 ? 1.6 : 0.9;
  roping.t += dt;
  if (r.old && !roping.warned) { roping.warned = true; showHint(r.frayed ? 'the rope is old. it feels wrong' : 'an old rope. it holds, so far'); teach('oldrope', 'ropes the others left: most hold. look at them first'); }
  if (r.frayed && roping.dir < 0 && r.top - player.y > span * 0.45 && !r.gone) {
    r.gone = true; roping = null; scene.remove(r.mesh); ropes.splice(ropes.indexOf(r), 1);
    sfx.play('rattle', { vol: 0.8, rate: 0.5 }); sfx.play('gasp', { vol: 0.8 }); showHint('it went', true); player.vy = -1; player.airT = 0.3; player.h = H_STAND;
    return;
  }""")
open(p,'w',encoding='utf-8').write(s); print('ok')

p='src/main.js'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)
rep("""    const geo = new DecalGeometry(ch.mesh, best, decalHelper.rotation, size);""",
    """    const geo = new DecalGeometry(localMesh(ch.mesh, best, p.size), best, decalHelper.rotation, size);""")
rep("""    const geo = new DecalGeometry(ch.mesh, hit, decalHelper.rotation, size);""",
    """    const geo = new DecalGeometry(localMesh(ch.mesh, hit, Math.max(w, hgt)), hit, decalHelper.rotation, size);""")
rep("""const decalHelper = new THREE.Object3D();""",
"""const decalHelper = new THREE.Object3D();
// DecalGeometry clips every triangle of the mesh it is given; a chunk has tens of thousands. Hand it only the ones near the hit.
const _lm = new THREE.Mesh(new THREE.BufferGeometry(), undefined);
function localMesh(mesh, hit, radius) {
  const pos = mesh.geometry.attributes.position.array, r2 = (radius * 1.6 + 0.4) ** 2, out = [];
  for (let i = 0; i < pos.length; i += 9) {
    const dx = pos[i] - hit.x, dy = pos[i + 1] - hit.y, dz = pos[i + 2] - hit.z;
    if (dx * dx + dy * dy + dz * dz < r2) for (let k = 0; k < 9; k++) out.push(pos[i + k]);
  }
  _lm.geometry.dispose(); _lm.geometry = new THREE.BufferGeometry();
  _lm.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(out), 3)); _lm.geometry.computeVertexNormals();
  _lm.position.copy(mesh.position); _lm.quaternion.copy(mesh.quaternion); _lm.scale.copy(mesh.scale); _lm.updateMatrixWorld();
  return _lm;
}""")
open(p,'w',encoding='utf-8').write(s); print('ok')

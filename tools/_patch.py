p='src/main.js'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)
rep("""init();
""", """init();
// warm the shaders now, not the first time a lake or a loose block comes into view (a compile can cost a quarter second)
{
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]), 3));
  g.setAttribute('aFlow', new THREE.BufferAttribute(new Float32Array(9), 3)); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(12).fill(1), 4));
  g.computeVertexNormals();
  const warm = [new THREE.Mesh(g, waterMat), new THREE.Mesh(looseGeo, looseMat), new THREE.Mesh(olmGeo, olmMat), new THREE.Mesh(pageGeo, pageMat), new THREE.Mesh(packGeo, packMat), new THREE.Mesh(torchGeo, torchMat), new THREE.Mesh(stickGeo, stickMat)];
  for (const m of warm) { m.position.set(0, -900, 0); scene.add(m); }
  crosserMesh.visible = true; crosserMesh.position.set(0, -900, 0);
  try { renderer.compile(scene, camera); } catch (e) {}
  for (const m of warm) scene.remove(m);
  crosserMesh.visible = false;
}
""")
open(p,'w',encoding='utf-8').write(s); print('ok')

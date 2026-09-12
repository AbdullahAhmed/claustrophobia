p='src/main.js'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)
rep("""function placeSinkhole(p) {
  const sky = new THREE.Mesh(new THREE.CircleGeometry(0.75, 24), new THREE.MeshBasicMaterial({ color: 0x8fa0b4, fog: false }));
  sky.position.set(p.x, p.y + 0.2, p.z); sky.rotation.x = Math.PI / 2; scene.add(sky);                    // seen from below
  const shaft = borrowSpot(0x9fb2c8, 60, 26, 0.18, p.x, p.y, p.z, p.x, p.floor, p.z);
  const pool = borrowLight(0x8fa4bc, 1.2, 6, 1.6, p.x, p.floor + 0.6, p.z); if (pool) pool.userData.keep = true;""",
"""// the surface keeps real time: what comes down a shaft, or in at the mouth, is the light outside right now
function daylight() {
  const h = new Date().getHours() + new Date().getMinutes() / 60;
  if (h < 5 || h >= 21.5) return { sky: 0x1c2436, k: 0.06, name: 'night' };
  if (h < 7 || h >= 19.5) return { sky: 0xb07a5a, k: 0.35, name: 'dusk' };
  return { sky: 0x8fa0b4, k: 1, name: 'day' };
}
function placeSinkhole(p) {
  const dl = daylight();
  const sky = new THREE.Mesh(new THREE.CircleGeometry(0.75, 24), new THREE.MeshBasicMaterial({ color: dl.sky, fog: false }));
  sky.position.set(p.x, p.y + 0.2, p.z); sky.rotation.x = Math.PI / 2; scene.add(sky);                    // seen from below
  const shaft = borrowSpot(dl.name === 'night' ? 0x6f7ea0 : dl.name === 'dusk' ? 0xd4a070 : 0x9fb2c8, 60 * Math.max(0.15, dl.k), 26, 0.18, p.x, p.y, p.z, p.x, p.floor, p.z);
  const pool = borrowLight(0x8fa4bc, 1.2 * Math.max(0.2, dl.k), 6, 1.6, p.x, p.floor + 0.6, p.z); if (pool) pool.userData.keep = true;""")
rep("""  const disc = new THREE.Mesh(new THREE.CircleGeometry(5.5, 40), new THREE.MeshBasicMaterial({ color: 0xfff4dc, fog: false }));
  disc.position.set(e.x + e.dx * 4.6, e.y + 2.2, e.z + e.dz * 4.6); disc.lookAt(e.n1.x, e.n1.y + 1.5, e.n1.z);
  scene.add(disc);
  const sun = borrowLight(0xfff1d6, 140, 60, 2, e.x + e.dx * 3, e.y + 3, e.z + e.dz * 3); if (sun) sun.userData.keep = true;
  const sky = borrowLight(0x9fc4ff, 30, 40, 2, e.n1.x, e.n1.y + 1.8, e.n1.z); if (sky) sky.userData.keep = true;""",
"""  const dl = daylight();
  const disc = new THREE.Mesh(new THREE.CircleGeometry(5.5, 40), new THREE.MeshBasicMaterial({ color: dl.name === 'night' ? 0x2a3450 : dl.name === 'dusk' ? 0xe0a070 : 0xfff4dc, fog: false }));
  disc.position.set(e.x + e.dx * 4.6, e.y + 2.2, e.z + e.dz * 4.6); disc.lookAt(e.n1.x, e.n1.y + 1.5, e.n1.z);
  scene.add(disc);
  const sun = borrowLight(dl.name === 'night' ? 0x7f90c0 : dl.name === 'dusk' ? 0xffb070 : 0xfff1d6, 140 * Math.max(0.12, dl.k), 60, 2, e.x + e.dx * 3, e.y + 3, e.z + e.dz * 3); if (sun) sun.userData.keep = true;
  const sky = borrowLight(0x9fc4ff, 30 * Math.max(0.2, dl.k), 40, 2, e.n1.x, e.n1.y + 1.8, e.n1.z); if (sky) sky.userData.keep = true;
  exitDaylight = dl.name;""")
rep("""let exitInfo = null, exitLoops = null;""", """let exitInfo = null, exitLoops = null, exitDaylight = 'day';""")
# the escape line knows what it is out there
rep("""  gameDelay(() => endScreen('DAYLIGHT', `you found the way out.""",
    """  gameDelay(() => endScreen(exitDaylight === 'night' ? 'STARS' : exitDaylight === 'dusk' ? 'THE LAST OF THE LIGHT' : 'DAYLIGHT', `you found the way out.""")
open(p,'w',encoding='utf-8').write(s); print('ok')

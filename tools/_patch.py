p='src/main.js'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)
# the rescue rope, in the entrance shaft, once enough of you have died here
rep("""function placeSinkhole(p) {
  const dl = daylight();""",
"""function placeSinkhole(p) {
  const dl = daylight();
  if (!p.window && cave.deaths.length >= 6 && !ropes.some(r => r.rescue)) {   // someone up there has counted: a rope comes down the hole
    const r = { x: p.x, z: p.z, top: p.y - 0.3, bottom: p.floor, rescue: true, mesh: new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, p.y - p.floor + 0.3, 5), new THREE.MeshStandardMaterial({ color: 0xd8442a, roughness: 0.8 })) };
    r.mesh.position.set(p.x, (p.y + p.floor) / 2 - 0.15, p.z); scene.add(r.mesh); ropes.push(r);
    gameDelay(() => showHint('a rope. down the hole you fell through. red, and new', true), 4000);
  }""")
rep("""    if (roping.dir > 0) { player.y = r.top + 0.1; const dx = -Math.sin(player.yaw), dz = -Math.cos(player.yaw); player.x = r.x + dx * 0.9; player.z = r.z + dz * 0.9; }   // step off the lip""",
    """    if (roping.dir > 0 && r.rescue) { roping = null; rescued(); return; }
    if (roping.dir > 0) { player.y = r.top + 0.1; const dx = -Math.sin(player.yaw), dz = -Math.cos(player.yaw); player.x = r.x + dx * 0.9; player.z = r.z + dz * 0.9; }   // step off the lip""")
rep("""function escape() {
  if (player.out) return; player.out = true; record.escapes++;""",
"""function rescued() {
  if (player.out) return; player.out = true; record.rescued = (record.rescued || 0) + 1;
  cave.escaped = true; saveCave();
  $('flash').style.opacity = 1; sfx.play('wind', { vol: 0.6, dur: 6 }); sfx.play('birds', { vol: 0.5, dur: 6 });
  gameDelay(() => endScreen('THEY CAME', `a rope came down the hole on the ${['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'][Math.min(9, cave.attempts - 1)]} try. someone up there counted. you did not find the way out; you were found.`, 'CLICK FOR A NEW CAVE'), 2400);
}
function escape() {
  if (player.out) return; player.out = true; record.escapes++;""")
open(p,'w',encoding='utf-8').write(s); print('ok')

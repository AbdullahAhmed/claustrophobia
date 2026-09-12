p='src/gen.js'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)
rep("""let windows = 0, cathedral = false;          // the one great room per cave""",
    """let windows = 0, cathedral = false, camp = false;   // the one great room per cave; the one camp""")
rep("""  voids.length = 0; sumpNodes.length = 0; trunkIds.clear(); windows = 0; cathedral = false; rounds = 0; exit = null; exitClaimed = false;""",
    """  voids.length = 0; sumpNodes.length = 0; trunkIds.clear(); windows = 0; cathedral = false; camp = false; rounds = 0; exit = null; exitClaimed = false;""")
rep("""    // a loose block in the roof of a cavern (or a big chamber): it comes down when something moves under it""",
    """    // the camp: where an earlier party stopped for good — once per cave, in a dry chamber well in
    if (!camp && core && wl === undefined && !this.pit && !this.sump && this.rx > 2.4 && this.ry > 1.6 && this.theme !== 'wet' && Math.hypot(n.x, n.z) > 90 && R() < 0.08) {
      camp = true;
      props.push({ type: 'camp', x: n.x, y: n.y, z: n.z, rx: this.rx, seed: R() });
    }
    // a loose block in the roof of a cavern (or a big chamber): it comes down when something moves under it""")
open(p,'w',encoding='utf-8').write(s)

p='src/main.js'; s=open(p,encoding='utf-8').read()
rep("""    else if (p.type === 'pearls') placePearls(p);""",
    """    else if (p.type === 'pearls') placePearls(p);
    else if (p.type === 'camp') { placeCamp(p); placed = 4; }""")
rep("""// caches: a dead caver's pack next to some bones""",
"""// the camp: sleeping bags, a stove, packs, a rope bag, and everything they wrote on the walls
const bagGeo = new THREE.CapsuleGeometry(0.28, 1.3, 3, 7).rotateZ(Math.PI / 2), bagMat = new THREE.MeshStandardMaterial({ color: 0x4a3d5c, roughness: 0.95, flatShading: true });
const stoveGeo = new THREE.CylinderGeometry(0.09, 0.11, 0.14, 8), stoveMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.5, metalness: 0.6 });
function placeCamp(p) {
  let sd = p.seed * 233280 | 0; const R = () => (sd = (sd * 9301 + 49297) % 233280) / 233280;
  const spot = (r) => { const a = R() * Math.PI * 2, d = R() * r; const x = p.x + Math.sin(a) * d, z = p.z + Math.cos(a) * d; const fy = floorBelow(x, p.y + 1, z); return fy === null ? null : { x, y: fy, z }; };
  for (let k = 0; k < 3; k++) { const q = spot(p.rx * 0.5); if (!q) continue; const m = new THREE.Mesh(bagGeo, bagMat); m.position.set(q.x, q.y + 0.2, q.z); m.rotation.y = R() * 6.28; m.scale.set(1, 0.55, 1); m.castShadow = true; scene.add(m); }
  const st = spot(p.rx * 0.3); if (st) { const m = new THREE.Mesh(stoveGeo, stoveMat); m.position.set(st.x, st.y + 0.07, st.z); scene.add(m); }
  // what they left, and what they knew
  const kinds = ['kit', 'cells', 'rope', 'page', 'page', 'sticks'];
  for (const k of kinds) { const q = spot(p.rx * 0.6); if (!q) continue; placeCache(q.x, q.y, q.z, k, k === 'page' ? (R() < 0.5 ? composeSurvey(q.x, q.y, q.z, R) : { text: ['day 11. nobody has come. we stop here tonight and decide in the morning', 'day 12. the torch is the problem. we take turns in the dark to save it', 'day 14. it rained. the way we came is under water. we are going on', 'day 9. the far side of the sump has a chamber and air. it is the only way we have not tried', 'the water rises here. do not camp low'][(R() * 5) | 0] }) : null); }
  // chalk everywhere: names, days, arrows, the last count
  const names = CAVER_NAMES.slice().sort(() => R() - 0.5).slice(0, 3);
  for (const t of [names.join(' · '), `day ${8 + (R() * 8 | 0)}`, 'we came in from there ->', '<- untried', `${names[0]} went to look. ${5 + (R() * 30 | 0)} hours`, 'do not follow the water', 'the light is the clock']) props.push({ type: 'note', x: p.x + (R() - 0.5) * p.rx, y: p.y, z: p.z + (R() - 0.5) * p.rx, text: t });
  placeBones({ x: p.x + (R() - 0.5) * 2, y: p.y, z: p.z + (R() - 0.5) * 2, rx: 1.2, ry: 1, big: false, seed: R() });
  campSite = { x: p.x, y: p.y, z: p.z };
}
let campSite = null, campSeen = false;
function updateCamp(dt) {
  if (!campSite || campSeen || Math.hypot(campSite.x - player.x, campSite.y - player.y, campSite.z - player.z) > 8) return;
  campSeen = true; showHint('a camp. sleeping bags, a stove. nobody', true); surveyNote('camp', campSite.x, campSite.z);
  if (!places.some(pl => Math.hypot(pl.x - campSite.x, pl.z - campSite.z) < 30)) { places.push({ x: campSite.x, y: campSite.y, z: campSite.z, name: 'The Camp', kind: 'camp' }); }
  sfx.play('creature_breath', { vol: 0.15, rate: 0.7, wet: 0.9 });
}
// caches: a dead caver's pack next to some bones""")
rep("""  updateFalseFloors(dt); if (frameNo % 30 === 0) restoreBrokenFloors();""",
    """  updateFalseFloors(dt); if (frameNo % 30 === 0) restoreBrokenFloors();
  updateCamp(dt);""")
open(p,'w',encoding='utf-8').write(s); print('ok')

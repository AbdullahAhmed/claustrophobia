p='src/main.js'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)
rep("""  if (player.under) { scene.fog.color.copy(FOG_WATER); scene.fog.density = 0.15; $('water').style.opacity = 1; }""",
    """  if (player.under) { scene.fog.color.copy(FOG_WATER); scene.fog.density = 0.15 + 0.22 * floodLevel + (player.flow ? 0.05 : 0); $('water').style.opacity = 1; updateBubbles(dt); }   // silt in a flood: you cannot see your hand""")
rep("""// water running off your face after you surface: drops on the view that slide and fade""",
"""// your own bubbles, when you are under
const bubbleMat = new THREE.MeshBasicMaterial({ color: 0xcfe6e8, transparent: true, opacity: 0.55, fog: false });
const bubbleGeo = new THREE.SphereGeometry(1, 6, 5);
const bubbles = []; let bubbleSpawnT = 0;
function updateBubbles(dt) {
  bubbleSpawnT -= dt;
  if (bubbleSpawnT <= 0 && bubbles.length < 40) {
    bubbleSpawnT = 0.12 + Math.random() * 0.25;
    camera.getWorldDirection(viewDir);
    const m = new THREE.Mesh(bubbleGeo, bubbleMat); const r = 0.012 + Math.random() * 0.03; m.scale.setScalar(r);
    m.position.set(camera.position.x + viewDir.x * 0.5 + (Math.random() - 0.5) * 0.3, camera.position.y - 0.15, camera.position.z + viewDir.z * 0.5 + (Math.random() - 0.5) * 0.3);
    scene.add(m); bubbles.push({ m, v: 0.35 + Math.random() * 0.4, wob: Math.random() * 6, r });
  }
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i]; b.wob += dt * 5; b.m.position.y += b.v * dt; b.m.position.x += Math.sin(b.wob) * 0.004; b.v += dt * 0.25;
    const wl = G.waterLevelAt(b.m.position.x, b.m.position.y, b.m.position.z);
    if (!Number.isFinite(wl) || b.m.position.y >= wl - 0.02 || G.fieldAt(b.m.position.x, b.m.position.y, b.m.position.z) > -0.05) { scene.remove(b.m); bubbles.splice(i, 1); }
  }
}
// water running off your face after you surface: drops on the view that slide and fade""")
open(p,'w',encoding='utf-8').write(s); print('ok')

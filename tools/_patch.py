p='index.html'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)
rep("""  #tool-chalk { top: 18px; left: 112px; } #tool-whistle { top: 173px; right: 8px; } #tool-rest { top: 173px; left: 8px; }""",
    """  #tool-chalk { top: 18px; left: 112px; } #tool-whistle { top: 122px; right: 8px; } #tool-rest { top: 122px; left: 8px; } #tool-stone { top: 232px; left: 112px; }""")
rep("""    <button id="tool-rest" type="button">Rest<small>torch off</small></button>""",
    """    <button id="tool-rest" type="button">Rest<small>torch off</small></button>
    <button id="tool-stone" type="button">Stone<small>test the floor</small></button>""")
rep("""hold <b>Q</b> for tools: chalk, whistle, rest""", """hold <b>Q</b> for tools: chalk, whistle, rest, stone""")
open(p,'w',encoding='utf-8').write(s)

p='src/main.js'; s=open(p,encoding='utf-8').read()
rep("""const overlay = $('overlay'), chalkIn = $('chalk'), toolNames = ['chalk', 'whistle', 'rest'];""",
    """const overlay = $('overlay'), chalkIn = $('chalk'), toolNames = ['chalk', 'whistle', 'rest', 'stone'];""")
rep("""  toolChoice = Math.hypot(wheelX, wheelY) < 22 ? -1 : wheelY < -Math.abs(wheelX) * 0.45 ? 0 : wheelX >= 0 ? 1 : 2;""",
    """  toolChoice = Math.hypot(wheelX, wheelY) < 22 ? -1 : wheelY < -Math.abs(wheelX) * 0.7 ? 0 : wheelY > Math.abs(wheelX) * 0.7 ? 3 : wheelX >= 0 ? 1 : 2;""")
rep("""  if (choice === 0) openChalk();
  else if (choice === 1) whistle();
  else {""",
    """  if (choice === 0) openChalk();
  else if (choice === 1) whistle();
  else if (choice === 3) throwStone();
  else {""")
# the stone: thrown along the view, lands with a sound; on a crust, it may go through
rep("""// a thrown glowstick: an arc along your view, a landing you hear, a light where it stops""",
"""// a stone, thrown ahead: you hear where it lands and how far down; on a crust of sediment, it may go through first
const stoneGeo = new THREE.DodecahedronGeometry(0.05, 0), stoneMat = new THREE.MeshStandardMaterial({ color: 0x6b6058, roughness: 1, flatShading: true });
const stones = [];
function throwStone() {
  if (!canAct()) return;
  camera.getWorldDirection(_fwd);
  const mesh = new THREE.Mesh(stoneGeo, stoneMat); mesh.position.copy(camera.position).addScaledVector(_fwd, 0.4); scene.add(mesh);
  stones.push({ mesh, x: mesh.position.x, y: mesh.position.y, z: mesh.position.z, vx: _fwd.x * 9, vy: _fwd.y * 9 + 2, vz: _fwd.z * 9, t: 0, bounces: 0 });
  sfx.play('whoosh', { vol: 0.25, rate: 1.9 });
  teach('stone', 'a stone, thrown ahead: it tells you where the floor is, how far down the drop goes, and whether that floor is floor');
}
function updateStones(dt) {
  for (let i = stones.length - 1; i >= 0; i--) {
    const g = stones[i]; g.t += dt; let done = false;
    for (let k = 0; k < 3 && !done; k++) {
      const h = dt / 3; g.vy -= GRAV * h;
      const nx = g.x + g.vx * h, ny = g.y + g.vy * h, nz = g.z + g.vz * h;
      if (G.fieldAt(nx, ny, nz) > -0.06) {
        const sp = Math.hypot(g.vx, g.vy, g.vz);
        // a false floor takes a stone the way it takes you
        const ff = falseFloors.find(f => f.state !== 'gone' && f.slab && Math.hypot(nx - f.x, nz - f.z) < f.r - 0.3 && Math.abs(ny - f.y) < 0.6);
        if (ff && sp > 3) { ff.state = 'cracking'; ff.t = 0.4; sfx.play('rattle', { x: nx, y: ny, z: nz, vol: 0.7, rate: 0.8, wet: 0.6 }); showHint('the floor there is not floor', true); }
        sfx.play(sp > 3 ? 'rockfall' : 'step_gravel', { x: g.x, y: g.y, z: g.z, vol: Math.min(0.6, 0.15 + sp * 0.05), rate: rr(1.1, 1.5), dur: 0.45, wet: 0.8, rolloff: 0.6 });
        G.gradAt(g.x, g.y, g.z); const gr = G.G, gl = Math.hypot(gr.x, gr.y, gr.z) || 1, dot = (g.vx * gr.x + g.vy * gr.y + g.vz * gr.z) / gl;
        g.vx = (g.vx - 2 * dot * gr.x / gl) * 0.3; g.vy = (g.vy - 2 * dot * gr.y / gl) * 0.3; g.vz = (g.vz - 2 * dot * gr.z / gl) * 0.3;
        if (++g.bounces > 3 || sp < 1.5 || g.t > 8) done = true;
      } else { g.x = nx; g.y = ny; g.z = nz; }
      const wl = G.waterLevelAt(g.x, g.y, g.z);
      if (Number.isFinite(wl) && g.y < wl) { sfx.play('splash_small', { x: g.x, y: wl, z: g.z, vol: 0.5, wet: 0.6 }); done = true; }
    }
    g.mesh.position.set(g.x, g.y, g.z); g.mesh.rotation.x += dt * 7;
    if (done) { stones.splice(i, 1); gameDelay(() => scene.remove(g.mesh), 20000); }
  }
}
// a thrown glowstick: an arc along your view, a landing you hear, a light where it stops""")
rep("""  updateThrown(dt);
  updateDrops(dt);""", """  updateThrown(dt);
  updateStones(dt);
  updateDrops(dt);""")
# the smoke test's wheel assumptions: right = whistle still (wheelX>=0 & not far up/down)
open(p,'w',encoding='utf-8').write(s); print('ok')

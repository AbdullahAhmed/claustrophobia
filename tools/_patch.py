p='src/main.js'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)
rep("""  if (e.code === 'KeyG' && !e.repeat) dropGlowstick();""",
    """  if (e.code === 'KeyG' && !e.repeat) gHeldAt = performance.now();""")
rep("""addEventListener('keyup', e => { keys[e.code] = false; keys['_kb' + e.code.replace('Key', '').replace('Left', '')] = false; });""",
    """addEventListener('keyup', e => {
  keys[e.code] = false; keys['_kb' + e.code.replace('Key', '').replace('Left', '')] = false;
  if (e.code === 'KeyG' && gHeldAt && running && player.alive && !player.out && !typing) { const held = (performance.now() - gHeldAt) / 1000; gHeldAt = 0; if (held > 0.3) throwGlowstick(Math.min(1, (held - 0.3) / 0.9)); else dropGlowstick(); }
});
let gHeldAt = 0;""")
rep("""// caches: a dead caver's pack next to some bones""",
"""// a thrown glowstick: an arc along your view, a landing you hear, a light where it stops
const thrown = [];
function throwGlowstick(power) {
  if (player.sticks <= 0) { showHint('no glowsticks left'); return; }
  player.sticks--;
  camera.getWorldDirection(_fwd);
  const sp = 5 + power * 9;
  const mesh = new THREE.Mesh(stickGeo, stickMat); mesh.position.copy(camera.position).addScaledVector(_fwd, 0.4); scene.add(mesh);
  const light = new THREE.PointLight(0x5cff7a, 1.1, 9, 1.7); light.position.copy(mesh.position); scene.add(light);
  thrown.push({ mesh, light, x: mesh.position.x, y: mesh.position.y, z: mesh.position.z, vx: _fwd.x * sp, vy: _fwd.y * sp + 1.5, vz: _fwd.z * sp, t: 0, spin: rr(4, 9) });
  sfx.play('whoosh', { vol: 0.3, rate: 1.6 });
  showHint(`thrown · ${player.sticks} left`);
  teach('throw', 'hold G to throw a glowstick: down a pit, across a chamber. you hear where it lands');
}
function updateThrown(dt) {
  for (let i = thrown.length - 1; i >= 0; i--) {
    const g = thrown[i]; g.t += dt;
    const steps = 3; let hit = false;
    for (let k = 0; k < steps && !hit; k++) {
      const h = dt / steps; g.vy -= GRAV * h;
      const nx = g.x + g.vx * h, ny = g.y + g.vy * h, nz = g.z + g.vz * h;
      if (G.fieldAt(nx, ny, nz) > -0.06) {                                            // rock: bounce a little, or stop
        const sp = Math.hypot(g.vx, g.vy, g.vz);
        G.gradAt(g.x, g.y, g.z); const gr = G.G, gl = Math.hypot(gr.x, gr.y, gr.z) || 1;
        const dot = (g.vx * gr.x + g.vy * gr.y + g.vz * gr.z) / gl;
        g.vx = (g.vx - 2 * dot * gr.x / gl) * 0.25; g.vy = (g.vy - 2 * dot * gr.y / gl) * 0.25; g.vz = (g.vz - 2 * dot * gr.z / gl) * 0.25;
        if (sp > 2) sfx.play('rattle', { x: g.x, y: g.y, z: g.z, vol: Math.min(0.7, sp * 0.06), rate: rr(1.2, 1.6), dur: 0.35, wet: 0.7, rolloff: 0.6 });
        if (sp < 1.2 || g.t > 6) hit = true;
      } else { g.x = nx; g.y = ny; g.z = nz; }
      const wl = G.waterLevelAt(g.x, g.y, g.z);
      if (Number.isFinite(wl) && g.y < wl) { sfx.play('splash_small', { x: g.x, y: wl, z: g.z, vol: 0.5, wet: 0.6 }); g.vx *= 0.1; g.vz *= 0.1; g.vy = 0; g.y = wl - 0.05; hit = true; }
    }
    g.mesh.position.set(g.x, g.y, g.z); g.mesh.rotation.x += dt * g.spin; g.light.position.set(g.x, g.y + 0.1, g.z);
    if (hit) { thrown.splice(i, 1); glow.push({ x: g.x, y: g.y, z: g.z, light: g.light, mesh: g.mesh }); }
  }
}
// caches: a dead caver's pack next to some bones""")
rep("""  updateMists(dt);
  whistleT -= dt;""", """  updateMists(dt);
  updateThrown(dt);
  whistleT -= dt;""")
# the gamepad RB: tap drops; a long hold throws — keep it simple: RB throws with medium power
rep("""if (edge(5)) dropGlowstick();""", """if (edge(5)) throwGlowstick(0.5);""")
open(p,'w',encoding='utf-8').write(s)
p='index.html'; s=open(p,encoding='utf-8').read()
rep("""<b>G</b> glowstick (three)""", """<b>G</b> glowstick (three; hold to throw)""")
open(p,'w',encoding='utf-8').write(s)
p='README.md'; s=open(p,encoding='utf-8').read()
rep("""| G | drop a glowstick (three per attempt) |""", """| G | drop a glowstick (three per attempt); hold and release to throw one — down a pit, across a chamber; you hear where it lands |""")
open(p,'w',encoding='utf-8').write(s); print('ok')

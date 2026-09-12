p='src/gen.js'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)
rep("""export function chimneyAt(x, y, z) {                       // a rift you can climb by pressing against both walls
  const s = nearestSegAt(x, y, z);
  return !!(s && s.chimney);
}""",
"""export function chimneyAt(x, y, z) {                       // a rift you can climb by pressing against both walls
  const s = nearestSegAt(x, y, z);
  return !!(s && s.chimney);
}
export function chimneyLineAt(x, y, z) {                   // where the rift's centre line is at this height: {x,z} or null
  const s = nearestSegAt(x, y, z);
  if (!s || !s.chimney || Math.abs(s.fdy) < 0.3) return null;
  const t = clamp((y - s.fy) / s.fdy, 0, 1);
  return { x: s.fx + s.fdx * t, z: s.fz + s.fdz * t };
}""")
open(p,'w',encoding='utf-8').write(s)

p='src/main.js'; s=open(p,encoding='utf-8').read()
rep("""    const inChimney = G.chimneyAt(player.x, player.y + 0.8, player.z) && Math.min(G.rayToRock(player.x, player.y + 0.9, player.z, 1, 0, 0, 1.2, 0.1) + G.rayToRock(player.x, player.y + 0.9, player.z, -1, 0, 0, 1.2, 0.1), G.rayToRock(player.x, player.y + 0.9, player.z, 0, 0, 1, 1.2, 0.1) + G.rayToRock(player.x, player.y + 0.9, player.z, 0, 0, -1, 1.2, 0.1)) < 1.9;
    if (inChimney && keys.Space && !player.hurt && player.stamina > 0.02) {
      climbing = true; player.vy = 0.85; player.stamina = Math.max(0, player.stamina - dt / 9); player.grounded = false;""",
"""    const chimHere = G.chimneyAt(player.x, player.y + 1.5, player.z) || G.chimneyAt(player.x, player.y + 0.8, player.z);
    const narrow = (h) => Math.min(G.rayToRock(player.x, player.y + h, player.z, 1, 0, 0, 1.6, 0.1) + G.rayToRock(player.x, player.y + h, player.z, -1, 0, 0, 1.6, 0.1), G.rayToRock(player.x, player.y + h, player.z, 0, 0, 1, 1.6, 0.1) + G.rayToRock(player.x, player.y + h, player.z, 0, 0, -1, 1.6, 0.1)) < 2.9;
    const inChimney = chimHere && (climbing || narrow(1.5) || narrow(2.4));
    if (inChimney && keys.Space && !player.hurt && player.stamina > 0.02) {
      climbing = true; player.vy = 0.85; player.stamina = Math.max(0, player.stamina - dt / 9); player.grounded = false;
      const ln = G.chimneyLineAt(player.x, player.y + 1.2, player.z);                 // the rift leans: stay on its line
      if (ln) { const dx = ln.x - player.x, dz = ln.z - player.z, L = Math.hypot(dx, dz); if (L > 0.02) { const k = Math.min(L, 0.7 * dt) / L; player.x += dx * k; player.z += dz * k; } }""")
open(p,'w',encoding='utf-8').write(s); print('ok')

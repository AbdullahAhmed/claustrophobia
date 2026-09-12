p='src/main.js'; s=open(p,encoding='utf-8').read()
def rep(old,new):
    global s
    assert old in s, old[:80]; s=s.replace(old,new)

# ---- place names ----
rep("""// ---------- survey notebook ----------""",
"""// ---------- place names: cavers name what they find ----------
const NAME_A = ['Long', 'Broken', 'Quiet', 'Black', 'High', 'Wet', 'Low', 'Cold', 'Far', 'Old', 'Grey', 'Lost'];
const NAME_B = { cavern: ['Hall', 'Cathedral', 'Vault', 'Hollow', 'Chamber'], chamber: ['Room', 'Chamber', 'Alcove', 'Gallery'], crystal: ['Pocket', 'Grotto', 'Vein'] };
const places = [];           // {x,y,z, name, kind}
let placeT = 0;
function updatePlaces(dt) {
  placeT -= dt; if (placeT > 0) return; placeT = 1.0;
  const sg = G.nearestSegAt(player.x, player.y + 0.5, player.z); if (!sg || !sg.nb) return;
  const n = sg.nb, kind = n.rx > 8 ? 'cavern' : n.tint === 5 ? 'crystal' : n.rx > 2.8 && n.ry > 2.2 ? 'chamber' : null;
  if (!kind) return;
  for (const pl of places) if (Math.hypot(pl.x - player.x, pl.z - player.z) < (kind === 'cavern' ? 40 : 14)) return;
  let sd = (Math.abs(n.x * 73 + n.z * 131) | 0) + SEED; const R = () => ((sd = (sd * 9301 + 49297) % 233280) / 233280);
  const name = `${NAME_A[(R() * NAME_A.length) | 0]} ${NAME_B[kind][(R() * NAME_B[kind].length) | 0]}`;
  places.push({ x: player.x, y: player.y, z: player.z, name, kind });
  showHint(name.toLowerCase(), true);
}

// ---------- survey notebook ----------""")
rep("""  // glowsticks
  ctx.fillStyle = 'rgba(40,150,80,0.9)';""",
"""  // places
  ctx.font = '600 30px Caveat'; ctx.fillStyle = 'rgba(45,38,32,0.85)';
  for (const pl of places) ctx.fillText(pl.name, X(pl.x) - ctx.measureText(pl.name).width / 2, Z(pl.z) - 16);
  // glowsticks
  ctx.fillStyle = 'rgba(40,150,80,0.9)';""")
rep("""  updateEyes(dt);
  updateBats(dt);""",
"""  updateEyes(dt);
  updatePlaces(dt);
  updateCrosser(dt);
  updateBats(dt);""")
# save/restore places
rep("""               glow: glow.map(g => ({ x: g.x, y: g.y, z: g.z })),""",
    """               glow: glow.map(g => ({ x: g.x, y: g.y, z: g.z })), places,""")
rep("""    if (r.sticks !== undefined) player.sticks = r.sticks;""", """    if (r.sticks !== undefined) player.sticks = r.sticks; if (r.places) places.push(...r.places);""")
# keep places across deaths too
rep("""  cave.marks.push(...runMarks); saveCave();""", """  cave.marks.push(...runMarks); cave.places = (cave.places || []).concat(places.filter(p => !(cave.places || []).some(q => q.name === p.name))); saveCave();""")
rep("""  for (const m of cave.marks) G.props.push({ type: 'mark', ...m });""",
    """  for (const m of cave.marks) G.props.push({ type: 'mark', ...m });
  if (cave.places) places.push(...cave.places);""")

# ---- something crosses the beam ----
rep("""// ---------- eyes ----------""",
"""// ---------- something crosses the passage ----------
let crosser = null, crosserT = rr(120, 260);
const crosserMesh = new THREE.Group();
{
  const dark = new THREE.MeshStandardMaterial({ color: 0x0a0806, roughness: 1 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.32, 0.3), dark); body.position.y = 0.5;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.22), dark); head.position.set(0.55, 0.42, 0);
  crosserMesh.add(body, head);
  for (let i = 0; i < 4; i++) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 0.08), dark); leg.position.set(i < 2 ? 0.3 : -0.3, 0.22, i % 2 ? 0.1 : -0.1); leg.userData.i = i; crosserMesh.add(leg); }
  crosserMesh.visible = false; scene.add(crosserMesh);
}
function spawnCrosser() {
  camera.getWorldDirection(viewDir);
  // a spot 10-18 m ahead with floor, and a lateral direction with room on both sides
  for (let tries = 0; tries < 20; tries++) {
    const d = 10 + Math.random() * 8, cx = camera.position.x + viewDir.x * d, cz = camera.position.z + viewDir.z * d;
    const fy = floorBelow(cx, camera.position.y + 1, cz); if (fy === null) continue;
    if (G.rayToRock(camera.position.x, camera.position.y, camera.position.z, viewDir.x, (fy + 0.5 - camera.position.y) / d, viewDir.z, d - 0.5, 0.4) < d - 0.8) continue;
    const lx = -viewDir.z, lz = viewDir.x;
    const l = G.rayToRock(cx, fy + 0.5, cz, lx, 0, lz, 5, 0.2), r = G.rayToRock(cx, fy + 0.5, cz, -lx, 0, -lz, 5, 0.2);
    if (l + r < 2.5) continue;
    const from = Math.random() < 0.5 ? 1 : -1;
    crosser = { x0: cx + lx * from * (from > 0 ? l : r) * 0.9, z0: cz + lz * from * (from > 0 ? l : r) * 0.9, x1: cx - lx * from * (from > 0 ? r : l) * 0.9, z1: cz - lz * from * (from > 0 ? r : l) * 0.9, y: fy, t: 0, dur: 0.55 + Math.random() * 0.3 };
    crosserMesh.visible = true; crosserMesh.rotation.y = Math.atan2(crosser.x1 - crosser.x0, crosser.z1 - crosser.z0) - Math.PI / 2;
    for (let k = 0; k < 4; k++) setTimeout(() => sfx.play('step_rock', { x: cx, y: fy, z: cz, vol: 0.45, rate: 1.4, vary: 0.2, wet: 0.7 }), k * 130);
    setTimeout(() => sfx.play('rockfall', { x: crosser ? crosser.x1 : cx, y: fy, z: crosser ? crosser.z1 : cz, vol: 0.3, rate: 1.3, dur: 1.2, wet: 0.8 }), 700);
    return;
  }
}
function updateCrosser(dt) {
  if (!crosser) {
    if (dread > 0.35 && running && player.alive && !player.out) { crosserT -= dt * (1 + dread); if (crosserT <= 0) { spawnCrosser(); crosserT = rr(150, 360) / (0.5 + dread); } }
    return;
  }
  crosser.t += dt; const k = Math.min(1, crosser.t / crosser.dur);
  crosserMesh.position.set(crosser.x0 + (crosser.x1 - crosser.x0) * k, crosser.y, crosser.z0 + (crosser.z1 - crosser.z0) * k);
  for (const c of crosserMesh.children) if (c.userData.i !== undefined) c.rotation.x = Math.sin(crosser.t * 40 + c.userData.i * 1.6) * 0.8;
  if (k >= 1) { crosser = null; crosserMesh.visible = false; }
}

// ---------- eyes ----------""")
open(p,'w',encoding='utf-8').write(s); print('ok')

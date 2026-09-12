p='src/main.js'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)

# 1. lines + persisted ropes, after updateRoping
rep("""// roots through the roof near the surface""",
"""// a rope you rigged stays rigged: for the rest of this attempt, and for the next of you
function restoreRopes() {
  for (const e of cave.ropes || []) {
    const r = { x: e.x, z: e.z, top: e.top, bottom: e.bottom, coils: e.coils, mesh: new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, e.top - e.bottom + 0.3, 5), ropeMat) };
    r.mesh.position.set(e.x, (e.top + e.bottom) / 2 - 0.1, e.z); scene.add(r.mesh); ropes.push(r);
  }
}
restoreRopes();
const ropeKey = r => `${r.x.toFixed(1)},${r.z.toFixed(1)},${r.top.toFixed(1)}`;
function forgetRope(r) { cave.ropes = (cave.ropes || []).filter(e => ropeKey(e) !== ropeKey(r)); saveCave(); }
// sump lines: tie a coil off at the water's edge and it runs through the sump along the floor. In the water, hold E and it
// pulls you along it toward the nearer end — faster than swimming, and it still works when the silt is up. Lines stay laid.
const lines = [];            // {n0, pts:[Vector3], len, coils, mesh}
const lineMat = new THREE.MeshStandardMaterial({ color: 0xe6dcc6, emissive: 0x2a251c, roughness: 0.9 });
let hauled = false, haulT = 0, padUseHeld = false, lineRestoreT = 0;
const linesPending = (cave.lines || []).slice();
function sumpPath(n0) {
  if (n0.linePath) return n0.linePath;
  const pts = [];
  const prev = G.nodes.find(q => q.w === n0.w && q.i === n0.i - 1); if (prev) pts.push(prev);
  for (let i = n0.i; i < n0.i + 90; i++) {
    const q = G.nodes.find(p => p.w === n0.w && p.i === i); if (!q) break;
    pts.push(q); if (i > n0.i && (q.wl === undefined || q.wl < q.y + 0.4)) break;   // out of the water on the far side
  }
  const last = pts[pts.length - 1], complete = pts.length >= 3 && (last.wl === undefined || last.wl < last.y + 0.4 || !G.worms.some(w => w.id === n0.w && w.life > 0));
  if (!complete) return null;                                                         // not carved through yet: ask again later
  const v = pts.map(q => new THREE.Vector3(q.x, q.y + 0.3, q.z));
  let len = 0; for (let i = 1; i < v.length; i++) len += v[i].distanceTo(v[i - 1]);
  return n0.linePath = { pts: v, len };
}
function layLine(n0, coils, restore) {
  const path = sumpPath(n0); if (!path) return null;
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path.pts), path.pts.length * 3, 0.012, 4, false), lineMat);
  scene.add(mesh);
  const L = { n0, pts: path.pts, len: path.len, coils, mesh }; lines.push(L);
  if (!restore) { cave.lines = (cave.lines || []).concat([{ w: n0.w, i: n0.i, coils }]); saveCave(); }
  return L;
}
function lineEndsNear(L, d = 3.2) { const a = L.pts[0], b = L.pts[L.pts.length - 1]; return [a, b].some(q => Math.hypot(q.x - player.x, q.z - player.z) < d && Math.abs(q.y - player.y) < 2.5); }
function nearestSumpEnd() {                                                           // a sump with no line yet, either bank of it within reach
  if (player.swim) return null;
  for (const n0 of G.sumpNodes) {
    if (Math.hypot(n0.x - player.x, n0.z - player.z) > 45 || lines.some(L => L.n0 === n0)) continue;
    const path = sumpPath(n0); if (!path) continue;
    if (lineEndsNear({ pts: path.pts })) return { n0, path };
  }
  return null;
}
function nearestLine(maxD) {                                                          // the closest point on any line: {L, d, s} with s the arc length along it
  let best = null; const py = player.y + 0.5;
  for (const L of lines) {
    const p = L.pts; let acc = 0;
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1], b = p[i], abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z, l2 = abx * abx + aby * aby + abz * abz, l = Math.sqrt(l2);
      const t = l2 > 0 ? clamp(((player.x - a.x) * abx + (py - a.y) * aby + (player.z - a.z) * abz) / l2, 0, 1) : 0;
      const d = Math.hypot(player.x - (a.x + abx * t), py - (a.y + aby * t), player.z - (a.z + abz * t));
      if (d < maxD && (!best || d < best.d)) best = { L, d, s: acc + l * t };
      acc += l;
    }
  }
  return best;
}
function linePoint(L, s) {
  const p = L.pts; let acc = 0;
  for (let i = 1; i < p.length; i++) { const l = p[i].distanceTo(p[i - 1]); if (acc + l >= s || i === p.length - 1) { const t = l > 0 ? clamp((s - acc) / l, 0, 1) : 0; return { x: p[i - 1].x + (p[i].x - p[i - 1].x) * t, y: p[i - 1].y + (p[i].y - p[i - 1].y) * t, z: p[i - 1].z + (p[i].z - p[i - 1].z) * t }; } acc += l; }
  return p[0];
}
function updateHaul(dt) {
  const holding = (eHeldAt || padUseHeld) && canAct() && !typing && !toolsOpen && !notebookOpen;
  if (!holding || !player.swim) { if (!holding) haulT = 0; return; }
  const nl = nearestLine(1.7); if (!nl) return;
  hauled = true; haulT += dt;
  const s2 = clamp(nl.s + (nl.s < nl.L.len / 2 ? -1 : 1) * 3.0 * dt, 0, nl.L.len), q = linePoint(nl.L, s2), k = Math.min(1, dt * 6);
  player.x += (q.x - player.x) * k; player.z += (q.z - player.z) * k; player.y += (q.y - 0.15 - player.y) * k; player.vy = 0;
  collide();
  if (Math.floor(haulT * 1.5) !== Math.floor((haulT - dt) * 1.5)) sfx.play('stroke', { vol: 0.5, rate: 1.25, vary: 0.2, wet: 1 });
  teach('haul', 'the line: hold E and pull yourself along it. faster than swimming, and it knows the way out even when you cannot see it');
}
function updateLines(dt) {
  if (!linesPending.length) return;
  lineRestoreT -= dt; if (lineRestoreT > 0) return; lineRestoreT = 1;
  for (let i = linesPending.length - 1; i >= 0; i--) {
    const e = linesPending[i], n0 = G.sumpNodes.find(q => q.w === e.w && q.i === e.i);
    if (n0 && layLine(n0, e.coils, true)) linesPending.splice(i, 1);
  }
}
// roots through the roof near the surface""")

# 2. useRope: haul takes precedence in the water; lines at sump banks; ropes persisted
rep("""  const v = nearestVoid();
  if (!v) { showHint('nothing to rig here'); return; }
  if (player.rope <= 0) { showHint('you have no rope'); return; }""",
"""  if (player.swim && nearestLine(1.7)) return;                                          // hold, and you haul
  const v = nearestVoid();
  if (!v) {
    const se = nearestSumpEnd();
    if (!se) { showHint('nothing to rig here'); return; }
    if (player.rope <= 0) { showHint('you have no rope for a line'); return; }
    const need = Math.max(1, Math.round(se.path.len / 14));                               // a coil, tied to the next, runs about fourteen metres of line
    if (player.rope < need) { showHint(`the line would not reach through. ${need} coils for this one, and you have ${player.rope}`, true); return; }
    player.rope -= need; layLine(se.n0, need, false);
    sfx.play('rattle', { vol: 0.5, rate: 0.7 }); sfx.play('splash_small', { x: se.n0.x, y: se.n0.y + 1, z: se.n0.z, vol: 0.6 });
    showHint(`tied off. the line runs through the water${need > 1 ? `, ${need} coils of it` : ''}. hold E in there and haul`, true); return;
  }
  if (player.rope <= 0) { showHint('you have no rope'); return; }""")
rep("""  r.mesh.position.set(v.x, (v.top + v.y) / 2 - 0.1, v.z); scene.add(r.mesh); ropes.push(r);
  roping = { rope: r, dir: -1, t: 0 };""",
"""  r.mesh.position.set(v.x, (v.top + v.y) / 2 - 0.1, v.z); scene.add(r.mesh); ropes.push(r);
  cave.ropes = (cave.ropes || []).concat([{ x: r.x, z: r.z, top: r.top, bottom: r.bottom, coils: r.coils }]); saveCave();
  roping = { rope: r, dir: -1, t: 0 };""")
rep("""      scene.remove(r.mesh); ropes.splice(ropes.indexOf(r), 1); player.rope += r.coils || 1;
      sfx.play('drag', { vol: 0.5, rate: 1.1, dur: 1.2 }); showHint(`rope pulled up and coiled · ${player.rope}`); return;
    }
  }""",
"""      scene.remove(r.mesh); ropes.splice(ropes.indexOf(r), 1); player.rope += r.coils || 1; forgetRope(r);
      sfx.play('drag', { vol: 0.5, rate: 1.1, dur: 1.2 }); showHint(`rope pulled up and coiled · ${player.rope}`); return;
    }
  }
  for (const L of lines) {                                                              // reel a line in from either bank
    if (player.swim || !lineEndsNear(L, 2.5)) continue;
    scene.remove(L.mesh); lines.splice(lines.indexOf(L), 1); player.rope += L.coils; cave.lines = (cave.lines || []).filter(e => !(e.w === L.n0.w && e.i === L.n0.i)); saveCave();
    sfx.play('drag', { vol: 0.5, rate: 1.2, dur: 1.6 }); sfx.play('splash_small', { vol: 0.4 }); showHint(`line reeled in and coiled · ${player.rope}`); return;
  }""")

# 3. E release: a haul is not a rig
rep("""if (e.code === 'KeyE' && eHeldAt) { const held = (performance.now() - eHeldAt) / 1000; eHeldAt = 0; if (canAct() && !typing && !toolsOpen && !notebookOpen) { if (held > 0.6) derigRope(); else useRope(); } }""",
    """if (e.code === 'KeyE' && eHeldAt) { const held = (performance.now() - eHeldAt) / 1000; eHeldAt = 0; if (hauled) hauled = false; else if (canAct() && !typing && !toolsOpen && !notebookOpen) { if (held > 0.6) derigRope(); else useRope(); } }""")
# 4. pad: hold D-pad up hauls
rep("""  padCharge = pressed[2] && !notebookOpen; padFocus = pressed[4] && !notebookOpen;""",
    """  padCharge = pressed[2] && !notebookOpen; padFocus = pressed[4] && !notebookOpen; padUseHeld = pressed[12] && !notebookOpen;""")
rep("""for (const k of merged) keys[k] = !!keyboard[k]; padSeen = false; padCharge = padFocus = false;""",
    """for (const k of merged) keys[k] = !!keyboard[k]; padSeen = false; padCharge = padFocus = padUseHeld = false;""")
# 5. context prompts
rep("""    else if (nearestVoid() && player.rope > 0) text = padSeen ? 'D-pad up · rig rope' : 'E · rig rope';""",
"""    else if (nearestVoid() && player.rope > 0) text = padSeen ? 'D-pad up · rig rope' : 'E · rig rope';
    else if (player.swim && nearestLine(1.7)) text = padSeen ? 'Hold D-pad up · haul along the line' : 'Hold E · haul along the line';
    else if (lines.some(L => lineEndsNear(L, 2.5))) text = padSeen ? 'A line runs through the water' : 'A line runs through the water   hold E · reel it in';
    else if (player.rope > 0 && nearestSumpEnd()) text = padSeen ? 'D-pad up · lay a line through the sump' : 'E · lay a line through the sump';""")
# 6. haul in the swim branch, line restore in the frame
rep("""    player.x += dx * speed * dt; player.z += dz * speed * dt; player.y += player.vy * dt;
    collide(); player.grounded = false; player.airT = 0;""",
"""    player.x += dx * speed * dt; player.z += dz * speed * dt; player.y += player.vy * dt;
    collide(); player.grounded = false; player.airT = 0;
    updateHaul(dt);""")
rep("""  updateCrosser(dt);
  updateCarried(dt);""", """  updateCrosser(dt);
  updateCarried(dt);
  updateLines(dt);""")
# 7. warm the line material; debug handles
rep("""new THREE.Mesh(bagGeo, bagMat), new THREE.Mesh(stoveGeo, stoveMat),""", """new THREE.Mesh(bagGeo, bagMat), new THREE.Mesh(stoveGeo, stoveMat), new THREE.Mesh(g, lineMat),""")
rep("""steal: stealTorch,""", """steal: stealTorch, lines, layLine, sumpPath, nearestSumpEnd, ropes,""")
open(p,'w',encoding='utf-8').write(s); print('ok')

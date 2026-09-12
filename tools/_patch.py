p='src/main.js'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)
# the follower: steps behind yours, when the light is low
rep("""function footstep(kind) {
  if (!soundsOn) return;
  const o = { x: player.x, y: player.y, z: player.z, wet: 0.5, vary: 0.15, hrtf: false };""",
"""let followT = rr(70, 160), following = 0, followLookedT = 0;
function updateFollower(dt) {
  if (!running || !player.alive || player.out) return;
  if (following > 0) {
    following -= dt;
    camera.getWorldDirection(viewDir);
    const back = -(viewDir.x * lastMoveX + viewDir.z * lastMoveZ);           // looking back along the way you came
    if (back > 0.6 && Math.hypot(lastMoveX, lastMoveZ) > 0.01) { followLookedT += dt; if (followLookedT > 0.8) { following = 0; followT = rr(120, 260); } }
    else followLookedT = 0;
    return;
  }
  const dim = !torchHeld || torchLevel(player.battery) < 0.35;
  if (dread > 0.25 && dim && open < 7 && !player.swim) { followT -= dt; if (followT <= 0) { following = rr(18, 40); followLookedT = 0; teach('follow', 'those are not your steps'); } }
}
let lastMoveX = 0, lastMoveZ = 0;
function footstep(kind) {
  if (!soundsOn) return;
  const o = { x: player.x, y: player.y, z: player.z, wet: 0.5, vary: 0.15, hrtf: false };
  lastMoveX = player.x - lastStepX; lastMoveZ = player.z - lastStepZ; lastStepX = player.x; lastStepZ = player.z;
  if (following > 0 && kind !== 'swim' && kind !== 'crawl') {
    // one step behind, a little late, a little heavier — six or seven metres back along the passage
    const L = Math.hypot(lastMoveX, lastMoveZ) || 1, bx = player.x - lastMoveX / L * 6.5, bz = player.z - lastMoveZ / L * 6.5;
    setTimeout(() => sfx.play(kind === 'wade' || kind === 'puddle' ? 'wade' : 'step_rock', { x: bx, y: player.y, z: bz, vol: 0.5, rate: 0.85, vary: 0.1, wet: 0.8, rolloff: 0.7 }), 260 + Math.random() * 120);
  }""")
rep("""let open = 5, openT = 0, dripT = 2, rockT = rr(60, 160), nearWater = 0, fear = 0, gaspT = 0, lastPx = 0, lastPz = 0;""",
    """let open = 5, openT = 0, dripT = 2, rockT = rr(60, 160), nearWater = 0, fear = 0, gaspT = 0, lastPx = 0, lastPz = 0, lastStepX = 0, lastStepZ = 0;""")
rep("""  updateLoose(dt);
  updateFlood(dt);""", """  updateLoose(dt);
  updateFollower(dt);
  updateFlood(dt);""")
# survey auto-notes: drops and sumps you have stood at
rep("""  if (ropeHintT <= 0) { ropeHintT = 1.5; const v = nearestVoid(); if (v && player.grounded) showHint(player.rope > 0 ? 'a drop. E to rig the rope' : 'a drop. no rope'); }""",
    """  if (ropeHintT <= 0) { ropeHintT = 1.5; const v = nearestVoid(); if (v && player.grounded) { showHint(player.rope > 0 ? 'a drop. E to rig the rope' : 'a drop. no rope'); surveyNote('drop', v.x, v.z); } }
  if (player.under && !wasUnder) surveyNote('sump', player.x, player.z);
  if (player.foul && foulT > 3) surveyNote('bad air', player.x, player.z);""")
rep("""// ---------- place names: cavers name what they find ----------""",
    """// ---------- survey notes: things worth a word on the map ----------
const notes = [];            // {x,z,t}
function surveyNote(t, x, z) {
  for (const n of notes) if (n.t === t && Math.hypot(n.x - x, n.z - z) < 9) return;
  notes.push({ t, x, z });
}

// ---------- place names: cavers name what they find ----------""")
rep("""  // places
  ctx.font = '600 30px Caveat'; ctx.fillStyle = 'rgba(45,38,32,0.85)';""",
    """  // notes: drops, sumps, bad air
  ctx.font = '500 22px Caveat'; ctx.fillStyle = 'rgba(120,40,30,0.85)';
  for (const n of notes) ctx.fillText(n.t, X(n.x) + 8, Z(n.z) + 6);
  // places
  ctx.font = '600 30px Caveat'; ctx.fillStyle = 'rgba(45,38,32,0.85)';""")
rep("""               glow: glow.map(g => ({ x: g.x, y: g.y, z: g.z })), places, pages: player.pages,""",
    """               glow: glow.map(g => ({ x: g.x, y: g.y, z: g.z })), places, pages: player.pages, notes,""")
rep("""if (r.places) places.push(...r.places);""", """if (r.places) places.push(...r.places); if (r.notes) notes.push(...r.notes);""")
rep("""  cave.marks.push(...runMarks); cave.places = (cave.places || []).concat(places.filter(p => !(cave.places || []).some(q => q.name === p.name))); saveCave();""",
    """  cave.marks.push(...runMarks); cave.places = (cave.places || []).concat(places.filter(p => !(cave.places || []).some(q => q.name === p.name)));
  cave.notes = (cave.notes || []).concat(notes.filter(n => !(cave.notes || []).some(q => q.t === n.t && Math.hypot(q.x - n.x, q.z - n.z) < 9))); saveCave();""")
rep("""  if (cave.pages) player.pages.push(...cave.pages);""", """  if (cave.pages) player.pages.push(...cave.pages);
  if (cave.notes) notes.push(...cave.notes);""")
open(p,'w',encoding='utf-8').write(s); print('ok')

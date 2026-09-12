p='src/main.js'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)
# tired arms
rep("""  player.battery = Math.min(1, player.battery + 0.025 * (player.battery > 0.6 ? 0.5 : 1));
  shakeT = 0.22;""",
    """  const tired = 1 - 0.45 * clamp((runTime - 900) / 1500, 0, 1) * (1 - 0.5 * clamp((resting ? 1 : 0), 0, 1));   // after fifteen minutes the arm gives less; resting helps a little
  player.battery = Math.min(1, player.battery + 0.025 * tired * (player.battery > 0.6 ? 0.5 : 1) * (player.hurt ? 0.7 : 1));
  if (tired < 0.8) teach('tired', 'your arm is tired. the shake gives less than it did');
  shakeT = 0.22;""")
# survey pages: a torn sheet with a stretch of the main way on it
rep("""    if (fy !== null) { const k = R() < 0.3 ? 'page' : R() < 0.15 ? 'kit' : R() < 0.4 ? 'battery' : R() < 0.62 ? 'sticks' : R() < 0.85 ? 'rope' : 'cells'; placeCache(ax, fy, az, k, k === 'page' ? composePage(ax, fy, az, R) : null); }""",
    """    if (fy !== null) { const k = R() < 0.3 ? 'page' : R() < 0.15 ? 'kit' : R() < 0.4 ? 'battery' : R() < 0.62 ? 'sticks' : R() < 0.85 ? 'rope' : 'cells'; placeCache(ax, fy, az, k, k === 'page' ? (R() < 0.35 ? composeSurvey(ax, fy, az, R) : composePage(ax, fy, az, R)) : null); }""")
rep("""function composePage(x, y, z, R) {""",
"""// a torn survey sheet: the main way from here on, as far as whoever drew it got
function composeSurvey(x, y, z, R) {
  let best = null, bd = 80; for (const n of G.nodes) { if (!G.trunkIds.has(n.w)) continue; const d = Math.hypot(n.x - x, n.z - z); if (d < bd) { bd = d; best = n; } }
  if (!best) return composePage(x, y, z, R);
  const line = []; for (let i = best.i; i < best.i + 34; i += 2) { const n = G.nodes.find(q => q.w === best.w && q.i === i); if (!n) break; line.push([+n.x.toFixed(1), +n.z.toFixed(1)]); }
  if (line.length < 5) return composePage(x, y, z, R);
  return { survey: line, text: `a torn survey sheet: ${Math.round(line.length * 3 / 5) * 5} m of the main way, in someone\\u2019s pencil` };
}
function composePage(x, y, z, R) {""")
# pickup: text may be an object
rep("""      else if (c.kind === 'page') { const pg = { key: `${c.x.toFixed(0)},${c.z.toFixed(0)}`, text: c.text, x: c.x, z: c.z };""",
    """      else if (c.kind === 'page') { const pg = { key: `${c.x.toFixed(0)},${c.z.toFixed(0)}`, text: typeof c.text === 'object' ? c.text.text : c.text, survey: typeof c.text === 'object' ? c.text.survey : undefined, x: c.x, z: c.z };""")
rep("""showHint(`a page from someone\\u2019s log: \\u201c${c.text}\\u201d`, true);""",
    """showHint(pg.survey ? pg.text : `a page from someone\\u2019s log: \\u201c${pg.text}\\u201d`, true);""")
# notebook: draw survey lines from pages
rep("""  // notes: drops, sumps, bad air""",
    """  // survey sheets from the dead: the main way, in their pencil
  ctx.strokeStyle = 'rgba(90,70,40,0.75)'; ctx.lineWidth = 2.5; ctx.setLineDash([9, 6]);
  for (const pg of player.pages) if (pg.survey && pg.survey.length > 1) { ctx.beginPath(); ctx.moveTo(X(pg.survey[0][0]), Z(pg.survey[0][1])); for (let i = 1; i < pg.survey.length; i++) ctx.lineTo(X(pg.survey[i][0]), Z(pg.survey[i][1])); ctx.stroke(); ctx.font = '500 20px Caveat'; ctx.fillStyle = 'rgba(90,70,40,0.8)'; ctx.fillText('main way?', X(pg.survey[pg.survey.length - 1][0]) + 6, Z(pg.survey[pg.survey.length - 1][1]) + 6); }
  ctx.setLineDash([]);
  // notes: drops, sumps, bad air""")
open(p,'w',encoding='utf-8').write(s); print('ok')

p='src/gen.js'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)
rep("""export const voids = [];                       // pit bottoms: {x,y,z, top}""",
    """export const voids = [];                       // pit bottoms: {x,y,z, top}
export const sumpNodes = [];                   // where each sump begins, with what it is: {len, bell, trap}
export const trunkIds = new Set();""")
rep("""    this.kind = kind; this.life = life; this.age = 0; this.n = 0;""",
    """    this.kind = kind; this.life = life; this.age = 0; this.n = 0; if (kind === 'trunk') trunkIds.add(id);""")
rep("""    if (wl !== undefined) { n.wl = wl; if (this.flow) n.flow = this.flow; }""",
    """    if (wl !== undefined) { n.wl = wl; if (this.flow) n.flow = this.flow; }
    if (this.sump && !this.sump.marked) { this.sump.marked = true; n.sump = { len: this.sump.left, bell: this.sump.bellAt !== null, trap: this.sump.trap }; sumpNodes.push(n); }""")
open(p,'w',encoding='utf-8').write(s)

p='src/main.js'; s=open(p,encoding='utf-8').read()
# cache kinds: some packs hold a page of someone's log
rep("""    if (fy !== null) placeCache(ax, fy, az, R() < 0.4 ? 'battery' : R() < 0.62 ? 'sticks' : R() < 0.85 ? 'rope' : 'cells');""",
    """    if (fy !== null) { const k = R() < 0.3 ? 'page' : R() < 0.4 ? 'battery' : R() < 0.62 ? 'sticks' : R() < 0.85 ? 'rope' : 'cells'; placeCache(ax, fy, az, k, k === 'page' ? composePage(ax, fy, az, R) : null); }""")
rep("""function placeCache(x, y, z, kind) {
  const mesh = new THREE.Mesh(packGeo, packMat); mesh.position.set(x, y + 0.1, z); mesh.rotation.y = rr(0, 6); mesh.rotation.z = rr(-0.3, 0.3); scene.add(mesh);
  const tag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.05), new THREE.MeshBasicMaterial({ color: kind === 'battery' ? 0xffb347 : kind === 'rope' ? 0xff7a5c : kind === 'cells' ? 0xffffff : 0x9dffb0, fog: false }));
  tag.position.set(x, y + 0.22, z); scene.add(tag);
  caches.push({ x, y, z, kind, taken: false, mesh, tag });
}""",
"""function placeCache(x, y, z, kind, text) {
  if (kind === 'page' && (cave.pages || []).some(pg => pg.key === `${x.toFixed(0)},${z.toFixed(0)}`)) return;   // already read, on an earlier attempt
  const mesh = new THREE.Mesh(kind === 'page' ? pageGeo : packGeo, kind === 'page' ? pageMat : packMat); mesh.position.set(x, y + (kind === 'page' ? 0.015 : 0.1), z); mesh.rotation.y = rr(0, 6); if (kind !== 'page') mesh.rotation.z = rr(-0.3, 0.3); scene.add(mesh);
  const tag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.05), new THREE.MeshBasicMaterial({ color: kind === 'battery' ? 0xffb347 : kind === 'rope' ? 0xff7a5c : kind === 'cells' ? 0xffffff : kind === 'page' ? 0xf1e6cc : 0x9dffb0, fog: false }));
  tag.position.set(x, y + 0.22, z); scene.add(tag);
  caches.push({ x, y, z, kind, text, taken: false, mesh, tag });
}
const pageGeo = new THREE.PlaneGeometry(0.21, 0.28).rotateX(-Math.PI / 2), pageMat = new THREE.MeshStandardMaterial({ color: 0xd9ccb0, roughness: 0.9, side: THREE.DoubleSide });
// a page from someone's log: what they learned about the rock near where they stopped
const DIRS8 = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
function bearing(dx, dz) { const a = Math.atan2(dx, -dz); return DIRS8[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8]; }
const CAVER_NAMES = ['Anna', 'Tomas', 'Priya', 'Dan', 'Lise', 'Marek', 'Ola', 'Ben', 'Ines', 'Kit'];
function composePage(x, y, z, R) {
  const near = (arr, lim) => { let b = null, bd = lim; for (const n of arr) { const d = Math.hypot(n.x - x, n.z - z); if (d < bd && d > 4) { bd = d; b = n; } } return b; };
  const name = CAVER_NAMES[(R() * CAVER_NAMES.length) | 0], day = 2 + ((R() * 9) | 0);
  const opts = [];
  const sp = near(G.sumpNodes, 70);
  if (sp) opts.push(sp.sump.trap ? `the sump ${bearing(sp.x - x, sp.z - z)} of here does not come up again. ${name} went in first. don\\u2019t`
                                : `the sump ${bearing(sp.x - x, sp.z - z)} of here goes about ${Math.round(sp.sump.len / 5) * 5} m under. ${sp.sump.bell ? 'there is air about halfway' : 'no air till the far side'}`);
  const vd = near(G.voids, 70);
  if (vd) opts.push(`the drop ${bearing(vd.x - x, vd.z - z)} of here is ${Math.round(vd.top - vd.y)} m. ${vd.wet ? 'deep water at the bottom' : 'rock at the bottom. we lowered ' + name + ' on the rope'}`);
  const fl = near(G.nodes.filter(n => n.foul), 60);
  if (fl) opts.push(`the passage ${bearing(fl.x - x, fl.z - z)} of here has bad air. ${name}\\u2019s head hurt after a minute. we came out`);
  const lo = near(G.props.filter(pp => pp.type === 'loose').concat(loose), 60);
  if (lo) opts.push(`the roof of the chamber ${bearing(lo.x - x, lo.z - z)} moves when you walk under it. don\\u2019t run in there`);
  const st = near(G.streamNodes, 70);
  if (st) opts.push(`there is a stream ${bearing(st.x - x, st.z - z)} of here. it goes downhill. ${R() < 0.5 ? 'we did not follow it' : 'follow the water'}`);
  if (opts.length && R() < 0.85) return `day ${day}. ` + opts[(R() * opts.length) | 0];
  const tr = near(G.nodes.filter(n => G.trunkIds.has(n.w)), 80);
  if (tr) { const nx = G.nodes.find(n => n.w === tr.w && n.i === tr.i + 8); if (nx) return `day ${day}. the main way runs ${bearing(nx.x - tr.x, nx.z - tr.z)} from here. it keeps going. ${name} thinks it opens`; }
  return [`day ${day}. torch at ${(R() * 30 + 5) | 0}%. ${name} has stopped talking`, `day ${day}. we heard something walking. it was not one of us`, `day ${day}. ${name} says leave the pack. i am leaving the pack`][(R() * 3) | 0];
}""")
# pickup
rep("""      else if (c.kind === 'cells') { player.cells = true; player.battery = Math.min(1, player.battery + 0.2); showHint('lithium cells. the torch will last longer now'); }""",
    """      else if (c.kind === 'cells') { player.cells = true; player.battery = Math.min(1, player.battery + 0.2); showHint('lithium cells. the torch will last longer now'); }
      else if (c.kind === 'page') { const pg = { key: `${c.x.toFixed(0)},${c.z.toFixed(0)}`, text: c.text, x: c.x, z: c.z }; player.pages.push(pg); cave.pages = (cave.pages || []).concat([pg]); saveCave(); showHint(`a page from someone\\u2019s log: \\u201c${c.text}\\u201d`, true); hintT = 9; sfx.play('scrape', { vol: 0.2, rate: 2.5, dur: 0.4 }); continue; }""")
rep("""dist: 0, maxDepth: 0, marks: 0, alive: true, out: false, trail: [], lastTrail: null, cold: 0, sticks: 3, rope: 0, cells: false };""",
    """dist: 0, maxDepth: 0, marks: 0, alive: true, out: false, trail: [], lastTrail: null, cold: 0, sticks: 3, rope: 0, cells: false, pages: [] };""")
rep("""  if (cave.places) places.push(...cave.places);""",
    """  if (cave.places) places.push(...cave.places);
  if (cave.pages) player.pages.push(...cave.pages);""")
# notebook: pages in the margin
rep("""  const S = clamp(Math.min((W - 320) / Math.max(1, x1 - x0), (H - 300) / Math.max(1, z1 - z0)), 2.5, 12);   // px per metre
  const cx = W / 2 - (x0 + x1) / 2 * S, cz = H / 2 - (z0 + z1) / 2 * S;""",
    """  const margin = player.pages.length ? 400 : 0;                                                          // pages I found go down the right-hand side
  const S = clamp(Math.min((W - 320 - margin) / Math.max(1, x1 - x0), (H - 300) / Math.max(1, z1 - z0)), 2.5, 12);   // px per metre
  const cx = (W - margin) / 2 - (x0 + x1) / 2 * S, cz = H / 2 - (z0 + z1) / 2 * S;""")
rep("""  // compass rose
  ctx.save(); ctx.translate(W - 120, 130);""",
    """  // found pages, copied out
  if (player.pages.length) {
    const px = W - 400, maxW = 330; let py = 230;
    ctx.strokeStyle = 'rgba(60,52,44,0.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px - 30, 120); ctx.lineTo(px - 30, H - 90); ctx.stroke();
    ctx.font = '600 26px Caveat'; ctx.fillStyle = 'rgba(60,52,44,0.9)'; ctx.fillText('pages we found', px, 200);
    ctx.font = '500 24px Caveat'; ctx.fillStyle = 'rgba(45,38,32,0.85)';
    for (const pg of player.pages) {
      const words = pg.text.split(' '); let line = '';
      for (const w of words) { const test = line ? line + ' ' + w : w; if (ctx.measureText(test).width > maxW) { ctx.fillText(line, px, py); py += 30; line = w; } else line = test; }
      if (line) { ctx.fillText(line, px, py); py += 30; }
      ctx.font = '600 30px Caveat'; ctx.fillText('\\u00b7', X(pg.x) - 5, Z(pg.z) + 10); ctx.font = '500 24px Caveat';
      py += 22; if (py > H - 120) break;
    }
  }
  // compass rose
  ctx.save(); ctx.translate(W - 120, 130);""")
rep("""               glow: glow.map(g => ({ x: g.x, y: g.y, z: g.z })), places,""",
    """               glow: glow.map(g => ({ x: g.x, y: g.y, z: g.z })), places, pages: player.pages,""")
rep("""    if (r.sticks !== undefined) player.sticks = r.sticks; if (r.places) places.push(...r.places);""",
    """    if (r.sticks !== undefined) player.sticks = r.sticks; if (r.places) places.push(...r.places); if (r.pages) for (const pg of r.pages) if (!player.pages.some(q => q.key === pg.key)) player.pages.push(pg);""")
open(p,'w',encoding='utf-8').write(s); print('ok')

p='index.html'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)
rep("""<div id="water"></div>""", """<div id="water"></div>
<canvas id="drops" width="480" height="270" style="position:fixed;inset:0;width:100%;height:100%;pointer-events:none;opacity:0;transition:opacity .3s"></canvas>""")
open(p,'w',encoding='utf-8').write(s)

p='src/main.js'; s=open(p,encoding='utf-8').read()
rep("""  if (!player.under && wasUnder) {
    sfx.play('splash_small', { x: player.x, y: wy, z: player.z, vol: 0.7 });""",
    """  if (!player.under && wasUnder) {
    sfx.play('splash_small', { x: player.x, y: wy, z: player.z, vol: 0.7 });
    startDrops();""")
rep("""// ---------- overlays / hud ----------""",
"""// water running off your face after you surface: drops on the view that slide and fade
const dropsCv = $('drops'), dropsCtx = dropsCv.getContext('2d'); let dropList = [], dropsT = 0;
function startDrops() {
  dropList = []; for (let i = 0; i < 14; i++) dropList.push({ x: Math.random() * 480, y: Math.random() * 200, r: 3 + Math.random() * 9, v: 8 + Math.random() * 40, a: 0.35 + Math.random() * 0.35 });
  dropsT = 4.5; dropsCv.style.opacity = 1;
}
function updateDrops(dt) {
  if (dropsT <= 0) return;
  dropsT -= dt; if (dropsT <= 0) { dropsCv.style.opacity = 0; return; }
  dropsCtx.clearRect(0, 0, 480, 270);
  const k = Math.min(1, dropsT / 1.5);
  for (const d of dropList) {
    d.y += d.v * dt; d.v += 12 * dt;
    const g = dropsCtx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r);
    g.addColorStop(0, `rgba(150,170,175,${0.05 * d.a * k})`); g.addColorStop(0.7, `rgba(200,220,225,${0.28 * d.a * k})`); g.addColorStop(1, 'rgba(200,220,225,0)');
    dropsCtx.fillStyle = g; dropsCtx.beginPath(); dropsCtx.ellipse(d.x, d.y, d.r * 0.8, d.r * 1.3, 0, 0, Math.PI * 2); dropsCtx.fill();
  }
}

// ---------- overlays / hud ----------""")
rep("""  updateThrown(dt);
  whistleT -= dt;""", """  updateThrown(dt);
  updateDrops(dt);
  whistleT -= dt;""")
open(p,'w',encoding='utf-8').write(s); print('ok')

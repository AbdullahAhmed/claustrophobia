p='src/main.js'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)
rep("""const BREATH_S = 16, BATTERY_S = 130;                      // seconds of breath; seconds of torch at full""",
    """const BREATH_BASE = 16, BATTERY_S = 130;                   // seconds of breath; seconds of torch at full
let BREATH_S = BREATH_BASE;                                 // grows a little with every sump you come up from, across attempts""")
rep("""record.runs++;""", """record.runs++;
BREATH_S = BREATH_BASE + Math.min(6, (record.sumps || 0) * 0.4);""")
rep("""  if (!player.under && wasUnder) {
    sfx.play('splash_small', { x: player.x, y: wy, z: player.z, vol: 0.7 });""",
    """  if (!player.under && wasUnder) {
    sfx.play('splash_small', { x: player.x, y: wy, z: player.z, vol: 0.7 });
    if (player.underT > 5) { record.sumps = (record.sumps || 0) + 1; saveRecord(); const nb = BREATH_BASE + Math.min(6, record.sumps * 0.4); if (nb > BREATH_S + 0.01) { BREATH_S = nb; if (record.sumps % 5 === 0) showHint(`you can hold it a little longer now: ${BREATH_S.toFixed(0)} seconds`, true); } }""")
open(p,'w',encoding='utf-8').write(s); print('ok')

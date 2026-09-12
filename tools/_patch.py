p='src/gen.js'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)
rep("""export let SEED = 1, rand = Math.random, EXIT_AT = 260;""",
    """export let SEED = 1, rand = Math.random, EXIT_AT = 260, TIER = 0;   // TIER: how many caves this player has already got out of""")
rep("""export function initGen(seed) {
  SEED = seed; setSeed(seed); rand = mulberry32(seed); EXIT_AT = rr(340, 500);""",
    """export function initGen(seed, tier = 0) {
  SEED = seed; TIER = tier; setSeed(seed); rand = mulberry32(seed); EXIT_AT = rr(340, 500) * (1 + 0.12 * Math.min(tier, 6));""")
# deeper caves for the experienced: sumps longer, dangerous modes heavier, bells rarer
rep("""      const r = R(), under = fed ? wr(9, 22) : r < 0.45 ? wr(5, 10) : r < 0.85 ? wr(10, 18) : wr(18, 30);
      const bell = under > 18 ? R() < 0.3 : under > 10 ? R() < 0.6 : false;""",
    """      const hard = 1 + 0.08 * Math.min(TIER, 6);
      const r = R(), under = (fed ? wr(9, 22) : r < 0.45 ? wr(5, 10) : r < 0.85 ? wr(10, 18) : wr(18, 30)) * hard;
      const bell = under > 18 ? R() < 0.3 / hard : under > 10 ? R() < 0.6 / hard : false;""")
rep("""      const ws = MODES.map(mo => mo.w * (mo.name === 'sump' ? 1 + deep : mo.name === 'pit' ? 1 + 0.8 * deep : mo.name === 'cavern' ? 1 + 0.6 * deep : 1));""",
    """      const th = 1 + 0.1 * Math.min(TIER, 6);                   // the caves you find after getting out are meaner
      const ws = MODES.map(mo => mo.w * (mo.name === 'sump' ? (1 + deep) * th : mo.name === 'pit' ? (1 + 0.8 * deep) * th : mo.name === 'cavern' ? 1 + 0.6 * deep : mo.name === 'squeeze' || mo.name === 'crawl' ? th : 1));""")
open(p,'w',encoding='utf-8').write(s)

p='src/main.js'; s=open(p,encoding='utf-8').read()
rep("""if (!cave || cave.seed !== SEED) cave = { seed: SEED, attempts: 0, deaths: [], marks: [], escaped: false };""",
    """let record = { runs: 0, best: 0, escapes: 0, drowned: 0, fell: 0, froze: 0, crushed: 0, foul: 0 };
try { record = Object.assign(record, JSON.parse(localStorage.getItem('karst.record') || '{}')); } catch (e) {}
if (!cave || cave.seed !== SEED) cave = { seed: SEED, attempts: 0, deaths: [], marks: [], escaped: false, tier: record.escapes };
if (cave.tier === undefined) cave.tier = 0;""")
rep("""let record = { runs: 0, best: 0, escapes: 0, drowned: 0, fell: 0, froze: 0, crushed: 0, foul: 0 };
try { record = Object.assign(record, JSON.parse(localStorage.getItem('karst.record') || '{}')); } catch (e) {}
record.runs++;""", """record.runs++;""")
rep("""  G.initGen(SEED);""", """  G.initGen(SEED, cave.tier);""")
rep("""$('ov-rec').textContent = `cave ${SEED} · attempt ${cave.attempts}${cave.deaths.length ? ` · ${cave.deaths.length} of you lie in it` : ''} · farthest ever ${record.best.toFixed(0)} m · escaped ${record.escapes}×`;""",
    """$('ov-rec').textContent = `cave ${SEED}${cave.tier ? ` (the ${['second', 'third', 'fourth', 'fifth', 'sixth', 'seventh'][Math.min(cave.tier, 6) - 1] || 'next'} cave: deeper)` : ''} · attempt ${cave.attempts}${cave.deaths.length ? ` · ${cave.deaths.length} of you lie in it` : ''} · farthest ever ${record.best.toFixed(0)} m · escaped ${record.escapes}×`;""")
open(p,'w',encoding='utf-8').write(s); print('ok')

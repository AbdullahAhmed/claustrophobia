p='src/main.js'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)
rep("""  $('ov-body').innerHTML = `<b>${player.dist.toFixed(0)} m</b> walked &nbsp;·&nbsp; deepest <b>${player.maxDepth.toFixed(0)} m</b> &nbsp;·&nbsp; <b>${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}</b><br>${player.marks} chalk marks &nbsp;·&nbsp; seed ${SEED}`;""",
    """  const extras = [player.marks ? `${player.marks} chalk marks` : '', places.length ? `${places.length} place${places.length > 1 ? 's' : ''} named` : '', player.pages.length ? `${player.pages.length} page${player.pages.length > 1 ? 's' : ''} read` : '', `seed ${SEED}`].filter(Boolean).join(' &nbsp;·&nbsp; ');
  const obit = cave.deaths.length && player.out ? `<br>${cave.deaths.length} of you did not come back.` : '';
  $('ov-body').innerHTML = `<b>${player.dist.toFixed(0)} m</b> walked &nbsp;·&nbsp; deepest <b>${player.maxDepth.toFixed(0)} m</b> &nbsp;·&nbsp; <b>${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}</b><br>${extras}${obit}`;""")
# title screen: the ones who came before
rep("""$('ov-rec').textContent = `cave ${SEED}${cave.tier ? ` (the ${['second', 'third', 'fourth', 'fifth', 'sixth', 'seventh'][Math.min(cave.tier, 6) - 1] || 'next'} cave: deeper)` : ''} · attempt ${cave.attempts}${cave.deaths.length ? ` · ${cave.deaths.length} of you lie in it` : ''} · farthest ever ${record.best.toFixed(0)} m · escaped ${record.escapes}×`;""",
    """$('ov-rec').textContent = `cave ${SEED}${cave.tier ? ` (the ${['second', 'third', 'fourth', 'fifth', 'sixth', 'seventh'][Math.min(cave.tier, 6) - 1] || 'next'} cave: deeper)` : ''} · attempt ${cave.attempts}${cave.deaths.length ? ` · ${cave.deaths.length} of you lie in it` : ''} · farthest ever ${record.best.toFixed(0)} m · escaped ${record.escapes}×`;
{
  const CAUSE = { drowned: 'drowned', fell: 'fell', froze: 'froze', crushed: 'buried', foul: 'bad air' };
  const last = cave.deaths.slice(-4).map(d => `✕ ${Math.hypot(d.x, d.z).toFixed(0)} m out, ${(-d.y).toFixed(0)} m down · ${CAUSE[d.cause] || d.cause}`);
  if (last.length) { const el = document.createElement('div'); el.className = 'rec'; el.style.marginTop = '6px'; el.style.opacity = '0.75'; el.textContent = last.join('   '); $('ov-rec').after(el); }
}""")
open(p,'w',encoding='utf-8').write(s); print('ok')

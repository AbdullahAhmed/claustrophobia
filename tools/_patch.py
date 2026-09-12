p='src/gen.js'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)
# themes: a stretch of cave has a character
rep("""const MODE = Object.fromEntries(MODES.map(m => [m.name, m]));""",
"""const MODE = Object.fromEntries(MODES.map(m => [m.name, m]));
// themes: the character of a stretch of cave — which modes it favours, what it is made of
const THEMES = {
  dry:    { stream: 0.3, lake: 0.3, sump: 0.6, duck: 0.3, gour: 0.3, passage: 1.4, canyon: 1.5, bedding: 1.5, bones: 2.2, foul: 1.6, tint: 1 },
  wet:    { stream: 3, lake: 2.2, sump: 1.5, duck: 2, gour: 1.5, cavern: 1.2, bones: 0.7, foul: 0.5, tint: 4 },
  broken: { cavern: 2.2, crawl: 1.5, squeeze: 1.3, chimney: 1.6, loose: 2.5, unstable: 2.2, bones: 1.2, tint: 3 },
  old:    { gour: 4, crystal: 3, chamber: 1.5, spel: 1.8, fossil: 3, bones: 1.0, tint: 2 },
};
const THEME_NAMES = Object.keys(THEMES);
const tf = (w, k) => { const t = THEMES[w.theme]; return t && t[k] !== undefined ? t[k] : 1; };""")
rep("""    this.gated = false;                                          // trunks: has this line been through water or over a drop yet?""",
    """    this.gated = false;                                          // trunks: has this line been through water or over a drop yet?
    this.theme = node.theme || 'dry'; this.themeLeft = kind === 'trunk' ? wr(120, 200) : Infinity;""")
rep("""      const ws = MODES.map(mo => mo.w * (mo.name === 'sump' ? (1 + deep) * th : mo.name === 'pit' ? (1 + 0.8 * deep) * th : mo.name === 'cavern' ? 1 + 0.6 * deep : mo.name === 'squeeze' || mo.name === 'crawl' ? th : 1));""",
    """      const ws = MODES.map(mo => mo.w * tf(this, mo.name) * (mo.name === 'sump' ? (1 + deep) * th : mo.name === 'pit' ? (1 + 0.8 * deep) * th : mo.name === 'cavern' ? 1 + 0.6 * deep : mo.name === 'squeeze' || mo.name === 'crawl' ? th : 1));""")
rep("""    if (R() < 0.3) this.tint = (R() * 5) | 0;                    // 0 plain limestone, 1 rust, 2 ochre, 3 grey-blue, 4 copper-green""",
    """    if (R() < 0.3) this.tint = R() < 0.6 ? tf(this, 'tint') : (R() * 5) | 0;   // 0 plain limestone, 1 rust, 2 ochre, 3 grey-blue, 4 copper-green; the theme's own colour, mostly""")
# trunks change theme every so often; the change is carved into the node so children inherit it
rep("""    const cavern = this.mode && this.mode.name === 'cavern' && !this.pit && !this.sump;
    if (cavern && R() < 0.6) {""",
    """    if (this.kind === 'trunk') { this.themeLeft -= STEP; if (this.themeLeft <= 0) { this.themeLeft = wr(120, 200); const others = THEME_NAMES.filter(t => t !== this.theme); this.theme = others[(R() * others.length) | 0]; } }
    n.theme = this.theme;
    const cavern = this.mode && this.mode.name === 'cavern' && !this.pit && !this.sump;
    if (cavern && R() < 0.6) {""")
rep("""    if (roomy && R() < (cavern ? 0.7 : this.ry > 2.3 ? 0.5 : 0.12)) {""",
    """    if (roomy && R() < (cavern ? 0.7 : this.ry > 2.3 ? 0.5 : 0.12) * tf(this, 'spel')) {""")
rep("""(this.mode.name === 'crawl' || this.mode.name === 'squeeze' || this.mode.name === 'bedding') && R() < 0.05) n.unstable = true;""",
    """(this.mode.name === 'crawl' || this.mode.name === 'squeeze' || this.mode.name === 'bedding') && R() < 0.05 * tf(this, 'unstable')) n.unstable = true;""")
rep("""(this.mode.name === 'bedding' || this.mode.name === 'passage' || this.mode.name === 'canyon') && R() < 0.025)""",
    """(this.mode.name === 'bedding' || this.mode.name === 'passage' || this.mode.name === 'canyon') && R() < 0.025 * tf(this, 'fossil'))""")
rep("""this.ry > 2.3 && R() < (cavern ? 0.12 : 0.04)) {""", """this.ry > 2.3 && R() < (cavern ? 0.12 : 0.04) * tf(this, 'loose')) {""")
rep("""    if (core && wl === undefined && this.rx < 3 && R() < 0.03) props.push({ type: 'bones',""",
    """    if (core && wl === undefined && this.rx < 3 && R() < 0.03 * tf(this, 'bones')) props.push({ type: 'bones',""")
rep("""(this.y < -6 || (this.mode && this.mode.name === 'crawl')) && R() < 0.06) {""",
    """(this.y < -6 || (this.mode && this.mode.name === 'crawl')) && R() < 0.06 * tf(this, 'foul')) {""")
open(p,'w',encoding='utf-8').write(s); print('ok')

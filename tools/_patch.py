p='src/main.js'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)
rep("""function look(dx, dy) {""",
"""// a gamepad, if there is one: sticks move and look, A hop/climb, B crouch, X shake, Y whistle, LB beam, RB glowstick, LT run, start survey, back rope
const padPrev = {}; let padSeen = false;
function pollGamepad(dt) {
  const pads = navigator.getGamepads ? navigator.getGamepads() : []; let gp = null; for (const g of pads) if (g && g.connected) { gp = g; break; }
  if (!gp) return;
  if (!padSeen) { padSeen = true; showHint('controller: sticks move and look · A hop · B crouch · X shake · Y whistle · LB beam · RB glowstick · LT run · start survey', true); }
  const dz = (v) => Math.abs(v) < 0.18 ? 0 : v;
  const lx = dz(gp.axes[0] || 0), ly = dz(gp.axes[1] || 0), rx = dz(gp.axes[2] || 0), ry = dz(gp.axes[3] || 0);
  keys.KeyW = ly < -0.3 || keys._kbW; keys.KeyS = ly > 0.3 || keys._kbS; keys.KeyA = lx < -0.3 || keys._kbA; keys.KeyD = lx > 0.3 || keys._kbD;
  if (rx || ry) look(rx * 900 * dt, ry * 700 * dt);
  const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
  keys.Space = b(0) || keys._kbSpace; keys.KeyC = b(1) || keys._kbC; keys.ShiftLeft = b(6) || keys._kbShift;
  const edge = (i) => { const now = b(i), was = !!padPrev[i]; padPrev[i] = now; return now && !was; };
  if (!running) { if (edge(0) || edge(9)) overlay.click(); return; }
  if (edge(2)) shakeTorch(); if (edge(3)) whistle(); if (edge(5)) dropGlowstick(); if (edge(9)) toggleNotebook(); if (edge(8)) useRope();
  if (edge(4) && torchHeld) { beamNarrow = !beamNarrow; sfx.play('torch_click', { vol: 0.5, rate: beamNarrow ? 1.3 : 1.0 }); showHint(beamNarrow ? 'spot: further, and nothing to either side' : 'flood: wide, and not far'); }
}
function look(dx, dy) {""")
# keyboard state mirrored so the pad can OR with it
rep("""  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();""",
    """  keys[e.code] = true; keys['_kb' + e.code.replace('Key', '').replace('Left', '')] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();""")
open(p,'w',encoding='utf-8').write(s)
rep("""addEventListener('keyup', e => { keys[e.code] = false; });""", """addEventListener('keyup', e => { keys[e.code] = false; keys['_kb' + e.code.replace('Key', '').replace('Left', '')] = false; });""")
rep("""  lap('player');""", """  lap('player');
  pollGamepad(dt);""")
open(p,'w',encoding='utf-8').write(s); print('ok')

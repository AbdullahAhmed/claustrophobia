// Scripted playtester: paste into the console (or run via the browser tool). Follows a trunk worm with simple
// obstacle avoidance, shakes the torch, dives through sumps aiming for the surface, logs events. Returns a report.
// usage: await walk({ seconds: 240, worm: 1 })
window.walk = async function walk(opts = {}) {
  const secs = opts.seconds || 180, wid = opts.worm || 1, dt = 1 / 60;
  const y = () => new Promise(r => setTimeout(r, 0));
  const p = K.player, log = [], stances = {};
  let pi = 0, blocked = 0, avoid = 0, avoidDir = 1, lastX = p.x, lastZ = p.z, lastMoveCheck = 0, maxFrame = 0, wp = { x: 0, z: 0 }, retreat = 0, stuckHere = 0;
  const startDist = p.dist;
  K.run();
  for (let f = 0; f < secs * 60; f++) {
    const path = K.G.nodes.filter(n => n.w === wid);
    while (retreat === 0 && pi < path.length - 1 && Math.hypot(path[pi].x - p.x, path[pi].z - p.z) < 1.4) pi++;
    const t = path[Math.min(pi, path.length - 1)];
    // aim: at the node, at floor + 0.9; in water aim for the surface unless the ceiling is under it
    let aimY = t.y + 0.9;
    if (p.wl > -1e9) aimY = Math.min(t.y + 0.9, p.wl + 0.15);
    // detour: when blocked, walk to a point 3 m off to one side of the line to the node, then resume
    let gx = t.x, gz = t.z;
    if (avoid > 0) { avoid--; gx = wp.x; gz = wp.z; if (Math.hypot(wp.x - p.x, wp.z - p.z) < 0.8) avoid = 0; }
    if (retreat > 0) { retreat--; const b = path[Math.max(0, pi - 3)]; gx = b.x; gz = b.z; if (retreat === 0) { pi = Math.max(0, pi - 3); stuckHere = 0; } }
    p.yaw = Math.atan2(-(gx - p.x), -(gz - p.z));
    p.pitch = Math.max(-1.0, Math.min(0.6, Math.atan2(aimY - (p.y + p.h - 0.1), Math.hypot(t.x - p.x, t.z - p.z))));
    K.keys.KeyW = true; K.keys.KeyS = false;
    // a chimney: the next node is well above and close by — hold space and climb (only with the legs for it)
    const climbNode = t.y - p.y > 1.2 && Math.hypot(t.x - p.x, t.z - p.z) < 1.6 && !p.swim;
    K.keys.Space = climbNode && (p.stamina > 0.3 || !p.grounded);
    if (avoid > 150) { K.keys.KeyW = false; K.keys.KeyS = true; }         // first half-second: back out
    if (K.stuck > 0) { K.keys.KeyA = (f % 8) < 4; K.keys.KeyD = !K.keys.KeyA; } else { K.keys.KeyA = false; K.keys.KeyD = false; }
    if (f % 240 < 60 && f % 8 === 0) K.shakeTorch();                       // a burst of ~8 shakes every 4 s, spaced like a human
    const a = performance.now(); K.tick(dt); const d = performance.now() - a; if (f > 120 && d > maxFrame) maxFrame = d;
    if (f % 3 === 0) await y();
    // progress check every second
    if (f - lastMoveCheck >= 60) {
      lastMoveCheck = f;
      if (Math.hypot(p.x - lastX, p.z - lastZ) < 0.4 && !p.swim && K.stuck === 0) {
        blocked++;
        if (blocked >= 2) {
          avoidDir = -avoidDir; blocked = 0; avoid = 180;
          const dx = t.x - p.x, dz = t.z - p.z, L = Math.hypot(dx, dz) || 1;
          wp = { x: p.x + (-dz / L) * avoidDir * 3 + dx / L * 1.5, z: p.z + (dx / L) * avoidDir * 3 + dz / L * 1.5 };
          log.push(['avoid', (f / 60).toFixed(0), pi]);
          if (++stuckHere >= 4 && retreat === 0) { retreat = 300; avoid = 0; log.push(['retreat', (f / 60).toFixed(0), pi]); }   // go back and try again
        }
      }
      else blocked = 0;
      lastX = p.x; lastZ = p.z;
    }
    const st = p.swim ? (p.under ? 'dive' : 'swim') : p.h > 1.4 ? 'walk' : p.h > 0.8 ? 'crouch' : 'crawl';
    stances[st] = (stances[st] || 0) + 1;
    if (f % 1800 === 0) log.push(['t', (f / 60).toFixed(0), 'pi', pi, '/', path.length, 'y', p.y.toFixed(1), st, 'breath', p.breath.toFixed(2), 'bat', p.battery.toFixed(2), 'dist', Math.hypot(p.x, p.z).toFixed(0), p.hurt ? 'hurt' : '', K.torchHeld ? '' : 'torch dropped']);
    if (!p.alive) { log.push(['DEAD', (f / 60).toFixed(0), document.getElementById('ov-title').textContent]); break; }
    if (p.out) { log.push(['OUT', (f / 60).toFixed(0)]); break; }
  }
  K.keys.KeyW = false; K.keys.KeyS = false; K.keys.KeyA = false; K.keys.KeyD = false; K.keys.Space = false;
  return { log, stances, walked: (p.dist - startDist).toFixed(0), far: Math.hypot(p.x, p.z).toFixed(0), maxFrameMs: maxFrame.toFixed(1), alive: p.alive, out: p.out, hurt: p.hurt, worms: K.G.worms.length, rounds: K.G.rounds, exit: !!K.exit };
};

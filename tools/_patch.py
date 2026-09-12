p='src/main.js'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)
rep("""  if (torchHeld) {
    torch.position.copy(camera.position);
    const a = 1 - Math.pow(shakeT > 0 ? 0.05 : 0.0005, dt);
    torch.quaternion.slerp(camera.quaternion, a);
  }""",
"""  if (torchHeld) {
    torch.position.copy(camera.position);
    const a = 1 - Math.pow(shakeT > 0 ? 0.05 : 0.0005, dt);
    torch.quaternion.slerp(camera.quaternion, a);
    // cold hands: the beam shivers, and so does the hand in front of you
    const shiver = player.cold > 0.45 ? (player.cold - 0.45) * (coldT > 40 ? 3.2 : 1.6) : 0;
    if (shiver > 0) {
      const t = performance.now() * 0.001;
      torch.rotateX((Math.sin(t * 23.0) + Math.sin(t * 31.7)) * 0.006 * shiver); torch.rotateY((Math.sin(t * 27.3) + Math.sin(t * 19.1)) * 0.006 * shiver);
      hand.position.set(0.21 + Math.sin(t * 29) * 0.004 * shiver, -0.22 + Math.sin(t * 37) * 0.004 * shiver, -0.4);
    }
  }
  // breath fog when you are cold, in the beam, in front of your face
  if (player.cold > 0.35 && !player.under) {
    const ph = (player.bob * 0.35 + performance.now() * 0.0009) % (Math.PI * 2), puffK = Math.max(0, Math.sin(ph));
    fog.visible = true; fog.material.opacity = 0.06 * (player.cold - 0.35) * puffK;
    fog.position.set(0, -0.06 + puffK * 0.02, -0.32 - puffK * 0.12); fog.scale.setScalar(0.12 + puffK * 0.1);
  } else fog.visible = false;""")
rep("""let stutter = 1;
function updateTorch(dt) {""",
"""let stutter = 1;
const fog = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const r = g.createRadialGradient(32, 32, 2, 32, 32, 30); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); return t; })(), transparent: true, opacity: 0, depthWrite: false, depthTest: false, fog: false }));
fog.renderOrder = 5; fog.visible = false; camera.add(fog);
function updateTorch(dt) {""")
open(p,'w',encoding='utf-8').write(s); print('ok')

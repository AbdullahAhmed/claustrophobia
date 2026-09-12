p='src/main.js'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)

# 1. the camera, before the survey notebook
rep("""// ---------- survey notebook ----------""",
"""// ---------- the camera: eight frames a trip. the flash shows the whole room for an instant, and the print goes in the survey ----------
const FRAMES = 8;
let framesLeft = FRAMES, photoReq = 0, flashLight = null, flashHold = 0;
const photoCanvas = document.createElement('canvas'); photoCanvas.width = 240; photoCanvas.height = 150;
const photoImgs = new Map();                                          // data url -> Image, for the notebook
function takePhoto() {
  if (!canAct() || typing || toolsOpen || notebookOpen || photoReq || flashHold > 0) return;
  if (framesLeft <= 0) { showHint('the roll is finished'); return; }
  if (player.under) { showHint('not under the water'); return; }
  framesLeft--; photoReq = 2;                                          // the flash lights the next frame; the one after it is the print
  sfx.play('torch_click', { vol: 0.9, rate: 1.7 });
}
function beforeRenderPhoto() {
  if (photoReq && !flashLight) { flashLight = borrowLight(0xfff1d6, 240, 90, 1.5, camera.position.x, camera.position.y + 0.25, camera.position.z); if (flashLight) flashLight.userData.keep = true; flashHold = 0.13; }
  if (flashLight) flashLight.position.set(camera.position.x, camera.position.y + 0.25, camera.position.z);
}
function afterRenderPhoto(dt) {
  if (photoReq) {
    photoReq--;
    if (!photoReq) {
      const g = photoCanvas.getContext('2d'); g.drawImage(canvas, 0, 0, photoCanvas.width, photoCanvas.height);
      const data = photoCanvas.toDataURL('image/jpeg', 0.72);
      const pl = places.find(q => Math.hypot(q.x - player.x, q.z - player.z) < 30);
      cave.photos = (cave.photos || []).concat([{ x: player.x, y: player.y, z: player.z, t: Math.round(runTime), a: cave.attempts, place: pl ? pl.name : null, data }]).slice(-12); saveCave();
      showHint(framesLeft ? `${framesLeft} frame${framesLeft === 1 ? '' : 's'} left on the roll` : 'that was the last frame');
    }
  }
  if (flashHold > 0) {
    flashHold -= dt;
    if (flashHold <= 0) {                                              // the burst is gone; what stays is the burn on your eyes
      returnLight(flashLight); flashLight = null;
      const fl = $('flash'); fl.style.transition = 'none'; fl.style.opacity = 0.8; void fl.offsetWidth; fl.style.transition = 'opacity 0.7s ease-out'; fl.style.opacity = 0;
      gameDelay(() => { fl.style.transition = ''; }, 800);
    }
  }
}
function photoImage(ph) {
  let im = photoImgs.get(ph.data);
  if (!im) { im = new Image(); im.src = ph.data; photoImgs.set(ph.data, im); }
  return im.complete && im.naturalWidth ? im : null;
}

// ---------- survey notebook ----------""")

# 2. the prints on the notebook page: a row along the bottom, the map makes room for them
rep("""  const margin = player.pages.length ? 400 : 0;                                                          // pages I found go down the right-hand side
  const S = clamp(Math.min((W - 320 - margin) / Math.max(1, x1 - x0), (H - 300) / Math.max(1, z1 - z0)), 2.5, 12);   // px per metre
  const cx = (W - margin) / 2 - (x0 + x1) / 2 * S, cz = H / 2 - (z0 + z1) / 2 * S;""",
"""  const margin = player.pages.length ? 400 : 0;                                                          // pages I found go down the right-hand side
  const photos = cave.photos || [], strip = photos.length ? 190 : 0;                                    // prints go along the bottom
  const S = clamp(Math.min((W - 320 - margin) / Math.max(1, x1 - x0), (H - 300 - strip) / Math.max(1, z1 - z0)), 2.5, 12);   // px per metre
  const cx = (W - margin) / 2 - (x0 + x1) / 2 * S, cz = (H - strip) / 2 - (z0 + z1) / 2 * S;""")
rep("""  // compass rose
  ctx.save(); ctx.translate(W - 120, 130);""",
"""  // the prints, stuck along the bottom of the page, numbered where they were taken
  if (photos.length) {
    const pw = 200, phh = 125, gap = 16, n = photos.length, total = n * pw + (n - 1) * gap, sx = Math.max(70, (W - margin - total) / 2), py = H - strip - 20;
    ctx.font = '600 22px Caveat';
    photos.forEach((ph, i) => {
      const x = sx + i * (pw + gap), im = photoImage(ph);
      ctx.save(); ctx.translate(x + pw / 2, py + phh / 2); ctx.rotate(((i * 7919) % 11 - 5) * 0.006);
      ctx.fillStyle = '#f3efe6'; ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3; ctx.fillRect(-pw / 2 - 7, -phh / 2 - 7, pw + 14, phh + 34); ctx.shadowColor = 'transparent';
      if (im) ctx.drawImage(im, -pw / 2, -phh / 2, pw, phh); else { ctx.fillStyle = '#1a1714'; ctx.fillRect(-pw / 2, -phh / 2, pw, phh); }
      ctx.fillStyle = 'rgba(45,38,32,0.85)';
      const cap = `${i + 1} · ${ph.place || `${(-ph.y).toFixed(0)} m down`}${ph.a !== cave.attempts ? ` · attempt ${ph.a}` : ''}`;
      ctx.fillText(cap.length > 26 ? cap.slice(0, 25) + '…' : cap, -pw / 2, phh / 2 + 20);
      ctx.restore();
      ctx.fillStyle = 'rgba(45,38,32,0.8)'; ctx.beginPath(); ctx.arc(X(ph.x), Z(ph.z), 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f3efe6'; ctx.font = '700 16px Caveat'; ctx.fillText(String(i + 1), X(ph.x) - (i >= 9 ? 7 : 4), Z(ph.z) + 6); ctx.font = '600 22px Caveat';
    });
  }
  // compass rose
  ctx.save(); ctx.translate(W - 120, 130);""")
rep("""${player.suit ? ' · wetsuit' : ''}`;
}""", """${player.suit ? ' · wetsuit' : ''} · ${framesLeft} frame${framesLeft === 1 ? '' : 's'}`;
}""")

# 3. render hooks
rep("""  updateSound(dt); lap('sound');
  renderer.render(scene, camera); lap('render');""",
"""  updateSound(dt); lap('sound');
  beforeRenderPhoto(); renderer.render(scene, camera); afterRenderPhoto(dt); lap('render');""")

# 4. keys: P, and the controller's right-stick click
rep("""  if (e.code === 'KeyG' && !e.repeat) beginGlow();
  if (e.code === 'KeyE' && !e.repeat) { restRequested = false; eHeldAt = performance.now(); }""",
"""  if (e.code === 'KeyG' && !e.repeat) beginGlow();
  if (e.code === 'KeyP' && !e.repeat) takePhoto();
  if (e.code === 'KeyE' && !e.repeat) { restRequested = false; eHeldAt = performance.now(); }""")
rep("""    if (down(12)) { restRequested = false; useRope(); }""",
    """    if (down(12)) { restRequested = false; useRope(); }
    if (down(11)) takePhoto();""")

# 5. the roll is saved with the run; the end screen shows what you brought out
rep("""cells: player.cells, kit: player.kit, suit: player.suit,
               glow:""", """cells: player.cells, kit: player.kit, suit: player.suit, frames: framesLeft,
               glow:""")
rep("""if (r.cells) player.cells = true; if (r.kit) player.kit = true; if (r.suit) player.suit = true;""",
    """if (r.cells) player.cells = true; if (r.kit) player.kit = true; if (r.suit) player.suit = true; if (r.frames !== undefined) framesLeft = r.frames;""")
rep("""  $('ov-rec').textContent = `cave ${SEED} · attempt ${cave.attempts} · ${cave.deaths.length} dead in it · farthest ever ${record.best.toFixed(0)} m · escaped ${record.escapes}×`;""",
"""  $('ov-rec').textContent = `cave ${SEED} · attempt ${cave.attempts} · ${cave.deaths.length} dead in it · farthest ever ${record.best.toFixed(0)} m · escaped ${record.escapes}×`;
  const mine = (cave.photos || []).filter(ph => ph.a === cave.attempts);
  $('ov-photos').innerHTML = mine.map(ph => `<img src="${ph.data}" alt="" title="${ph.place || `${(-ph.y).toFixed(0)} m down`}">`).join('');
  $('ov-photos').hidden = !mine.length;""")

# 6. the first big room: you have a camera
rep("""  if (stance < 1 && !player.swim) teach('low',""",
"""  if (open > 14 && runTime > 90 && framesLeft === FRAMES) teach('camera', 'a big room. there is a camera in the pack, eight frames on the roll: P (right stick click). the flash shows more than the torch ever will, for an instant');
  if (stance < 1 && !player.swim) teach('low',""")
rep("""steal: stealTorch, lines,""", """steal: stealTorch, takePhoto, get frames() { return framesLeft; }, lines,""")
open(p,'w',encoding='utf-8').write(s)

p='index.html'; s=open(p,encoding='utf-8').read()
rep("""  <div class="rec" id="ov-rec"></div>""",
"""  <div class="rec" id="ov-rec"></div>
  <div id="ov-photos" hidden></div>""")
rep("""  .box .rec { margin-top: 18px; font-size: 11px; letter-spacing: .1em; color: var(--dim); }""",
"""  .box .rec { margin-top: 18px; font-size: 11px; letter-spacing: .1em; color: var(--dim); }
  #ov-photos { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; margin-top: 16px; }
  #ov-photos img { width: 128px; height: 80px; border: 4px solid #efeae0; border-bottom-width: 14px; box-shadow: 0 3px 10px rgba(0,0,0,.5); transform: rotate(-1.2deg); }
  #ov-photos img:nth-child(even) { transform: rotate(1.4deg); }""")
rep("""     <b>G</b> drop glowstick; hold and release to throw &nbsp;·&nbsp; <b>E</b> use / rig rope<br>""",
    """     <b>G</b> drop glowstick; hold and release to throw &nbsp;·&nbsp; <b>E</b> use / rig rope &nbsp;·&nbsp; <b>P</b> photograph (flash)<br>""")
open(p,'w',encoding='utf-8').write(s); print('ok')

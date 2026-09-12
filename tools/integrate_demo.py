"""One-time guarded integration against the checkpoint. UTF-8, preserving gameplay."""
from pathlib import Path
import re
root=Path(__file__).resolve().parents[1]
p=root/'src/main.js';s=p.read_text(encoding='utf-8')
def sub(a,b):
    global s
    if a not in s: raise RuntimeError('Missing anchor: '+a[:120])
    s=s.replace(a,b)
sub("import { Sfx } from './audio.js';", """import { Sfx } from './audio.js';
import { assets } from './assets.js';
import { Presentation, BUILD, visualDefaults, normalizeVisuals } from './presentation.js';
import { VFX, StreamedInstances } from './vfx.js';
await assets.load((n,total)=>{document.getElementById('loading').textContent=`Preparing equipment ${n}/${total}…`;});""")
sub('scene.add(camera);','scene.add(camera);\nconst presentation = new Presentation(renderer), vfx = new VFX(scene);\nconst streamed = [];\nfunction stream(geometry, material, capacity) { const batch = new StreamedInstances(scene, geometry, material, capacity); streamed.push(batch); return batch; }')
a=s.index('const hand = new THREE.Group();');b=s.index('let torchHeld',a)
s=s[:a]+'''const hand = assets.model('glove');
const torchModel = assets.model('torch');
hand.position.set(.21,-.22,-.4); hand.rotation.set(.08,-.12,.05);
torchModel.position.copy(hand.position); torchModel.rotation.copy(hand.rotation);
hand.userData.lens = torchModel.getObjectByName('lens');
hand.userData.torchModel = torchModel; torch.add(hand,torchModel);
'''+s[b:]
sub("skull: new THREE.IcosahedronGeometry(0.11, 0).scale(1, 0.85, 1.25)","skull: assets.geometry('skull')")
sub("long: new THREE.CapsuleGeometry(0.028, 0.34, 2, 6)","long: assets.geometry('longbone')")
sub("rib: new THREE.TorusGeometry(0.17, 0.018, 4, 9, Math.PI)","rib: assets.geometry('rib')")
s=re.sub(r"for \(const k in boneGeos\) \{ boneInst\[k\].*?boneCount\[k\] = 0; \}","for (const k in boneGeos) { boneInst[k] = stream(boneGeos[k], boneMat, 600); boneCount[k] = 0; }",s)
sub('const im = boneInst[kind]; if (im.count >= 900) return;', 'const im = boneInst[kind];')
sub('new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 4), crystalMat, 6000)',"stream(assets.geometry('crystal'), crystalMat, 1800)")
sub('scene.add(crystals);','')
sub('n = 120 + (R() * 80 | 0)','n = 30 + (R() * 30 | 0)')
sub('i < n && crystals.count < 6000','i < n')
sub('0.03 + R() * 0.07, len = 0.18 + R() * 0.45','0.025 + R() * 0.035, len = 0.12 + R() * 0.30')
sub('new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 0.25, 1, 5), rootMat, 1200)','stream(new THREE.CylinderGeometry(1, 0.25, 1, 5), rootMat, 800)')
sub('scene.add(roots);','');sub('i < p.n && roots.count < 1200','i < p.n')
s=re.sub(r'new THREE.InstancedMesh\((new THREE.SphereGeometry\([^;]+?), pearlMat, (\d+)\)',r'stream(\1, pearlMat, 800)',s)
sub('scene.add(pearlInst);','');s=re.sub(r'i < p.n && pearlInst.count < \d+','i < p.n',s)
sub('new THREE.InstancedMesh(new THREE.SphereGeometry(0.018, 5, 4), wormMat, 4000)','stream(new THREE.SphereGeometry(0.018, 5, 4), wormMat, 2400)')
sub('scene.add(wormInst);','');sub('p.done < stop && wormInst.count < 4000','p.done < stop');sub('p.done < p.n && wormInst.count < 4000','p.done < p.n')
sub('const t = G.rayToRock(p.x, p.y + 0.6 + R() * 0.8, p.z, dx, 0, dz, 6, 0.1);','const wallY = p.y + 0.6 + R() * 0.8; const t = G.rayToRock(p.x, wallY, p.z, dx, 0, dz, 6, 0.1);')
sub('p.y + 0.6 + R() * 0.8, p.z + dz * (t + 0.02)','(R(), wallY), p.z + dz * (t + 0.02)')
a=s.index('const batGeo = new THREE.BufferGeometry();');b=s.index('const bats =',a)
s=s[:a]+"const batGeo = assets.geometry('bat');\n"+s[b:]
sub('const flap = 0.6 + 0.6 * Math.abs(Math.sin(b.t * 18 + b.phase));','const flap = 1;')
sub('const mesh = new THREE.Mesh(olmGeo, olmMat);',"const mesh = assets.model('olm');")
a=s.index('const crosserMesh = new THREE.Group()');b=s.index('function spawnCrosser()',a)
s=s[:a]+'''const crosserMesh = assets.model('crosser'), crosserEyes = [], crosserLegs = [];
crosserMesh.traverse(m=>{if(m.name.startsWith('eye')) {m.material=new THREE.MeshBasicMaterial({color:0xd8ff9c});crosserEyes.push(m);}if(m.name.startsWith('leg'))crosserLegs.push(m);});
crosserMesh.visible=false;scene.add(crosserMesh);
'''+s[b:]
sub('torchLevel() > 0.05','torchLevel(player.battery) > 0.05')
sub("crosser.gone = true;", "crosser.gone = true; const encounter = {...crosser};")
sub('x: crosser ? crosserMesh.position.x : crosser.x0, y: crosser.y, z: crosser ? crosserMesh.position.z : crosser.z0','x: encounter.x0, y: encounter.y, z: encounter.z0')
sub('x: crosser.x1, y: crosser.y, z: crosser.z1','x: encounter.x1, y: encounter.y, z: encounter.z1')
sub('for (const c of crosserMesh.children) if (c.userData.i !== undefined) c.rotation.z = Math.sin(crosser.t * 42 + c.userData.i * 1.6) * 0.7;','crosserLegs.forEach((c,i)=>c.rotation.z = Math.sin(crosser.t * 42 + i * 1.6) * 0.7);')
sub("const mesh = new THREE.Mesh(kind === 'page' ? pageGeo : packGeo, kind === 'page' ? pageMat : packMat);", "const mesh = kind === 'page' ? new THREE.Mesh(pageGeo,pageMat) : assets.model(assets.models.has(kind)?kind:'pack');")
sub("y + (kind === 'page' ? 0.015 : 0.1)","y + 0.015")
sub('tag.position.set(x, y + 0.22, z); scene.add(tag);','tag.position.set(x, y + 0.22, z); tag.visible=false; scene.add(tag);')
# Roof ray searches from air to rock, with the generator-provided height as bound.
a=s.index('  let cy = null; for (let h = 0; h < 8;',s.index('function placeCurtain'))
b=s.index('\n  if (cy === null)',a);s=s[:a]+"  const cy = ceilingAt(p.x,p.z,p.floor,p.top || p.y+14);"+s[b:]
a=s.index('    let cy = null; for (let h = 0; h < 6;',s.index('function placeGlowworms'));b=s.index('\n    if (cy === null)',a)
s=s[:a]+"    const cy = ceilingAt(x,z,p.floor,p.y+3);"+s[b:]
sub('function placeCurtain(p) {', '''function ceilingAt(x,z,floor,roof) {
  let air=false;
  for(let y=floor+.35;y<=Math.min(floor+40,roof+4);y+=.15){
    const solid=G.fieldAt(x,y,z)>-.04;
    if(!solid)air=true;
    else if(air){let lo=y-.15,hi=y;for(let i=0;i<4;i++){const mid=(lo+hi)/2;if(G.fieldAt(x,mid,z)>-.04)hi=mid;else lo=mid;}return lo;}
  }return null;
}
function placeCurtain(p) {''')
# Correct world/view normal coordinates and drive beam motes by actual spotlight.
sub('torch.getWorldDirection(_td).negate(); _tp.copy(camera.position);','spot.getWorldPosition(_tp); spot.target.getWorldPosition(_td); _td.sub(_tp).normalize();')
sub('(cosA - 0.86) / 0.1','(cosA - Math.cos(spot.angle)) / Math.max(.015, 1-Math.cos(spot.angle * (1-spot.penumbra)))')
sub('0.9 * level * edge','0.5 * level * edge')
old='normal = normalize(normal + vec3(dir.x * (w1 * 0.7 + w2 * 0.3) * amp, 0.0, dir.y * (w1 * 0.7 + w2 * 0.3) * amp) + vec3(-dir.y, 0.0, dir.x) * w3 * amp * 0.5);'
sub(old,'vec3 wave = vec3(dir.x * (w1 * 0.7 + w2 * 0.3) * amp, 0.0, dir.y * (w1 * 0.7 + w2 * 0.3) * amp) + vec3(-dir.y, 0.0, dir.x) * w3 * amp * 0.5; normal = normalize(normal + mat3(viewMatrix) * wave * faceDirection);')
sub('metalness: 0.3, emissive: 0x03120f','metalness: 0.08, emissive: 0x010403')
sub("$('water').style.opacity = 1; updateBubbles(dt);","$('water').style.opacity = 1;")
sub('if (bubbleSpawnT <= 0 && bubbles.length < 40)','if (player.under && bubbleSpawnT <= 0 && bubbles.length < 40)')
sub('updateDrops(dt);','updateDrops(dt);\n  updateBubbles(dt);')
sub("sfx.play('splash_small', { x: g.x, y: wl, z: g.z, vol: 0.5, wet: 0.6 });","vfx.emit('splash',g.x,visualWater(g.x,wl,g.z),g.z,16); sfx.play('splash_small', { x: g.x, y: wl, z: g.z, vol: 0.5, wet: 0.6 });")
sub('function footstep(kind) {',"function footstep(kind) {\n  if(Number.isFinite(player.wl) && player.y < player.wl+.1) vfx.emit('splash',player.x,visualWater(player.x,player.wl,player.z),player.z,kind==='swim'?8:4);")
sub("L.state = 'warning'; L.t = 0;","L.state = 'warning'; L.t = 0; vfx.emit('chips',L.x,L.y,L.z,10);")
sub("L.mesh.position.y = L.rest; L.state = 'down';","L.mesh.position.y = L.rest; L.state = 'down'; vfx.emit('dust',L.x,L.rest,L.z,40);vfx.emit('chips',L.x,L.rest,L.z,20);")
sub("f.state = 'cracking'; f.t = 0;","f.state = 'cracking'; f.t = 0; vfx.emit('chips',f.x,f.y,f.z,8);")
sub("f.state = 'gone'; G.breakSlab(f.slab);","f.state = 'gone'; G.breakSlab(f.slab); vfx.emit('dust',f.x,f.y,f.z,35);vfx.emit('chips',f.x,f.y,f.z,25);")
sub('G.collapseAt(n); }, 700);',"vfx.emit('dust',n.x,n.y+.5,n.z,50);vfx.emit('chips',n.x,n.y+1,n.z,20); G.collapseAt(n); }, 700);")
# Render/display settings remain compatible with karst.settings and old cave saves.
sub('let settings = { sens: 1, vol: 0.9, inv: false, hud: true };','let settings = { sens: 1, vol: 0.9, inv: false, hud: true, ...visualDefaults };')
sub('function applySettings() {','''function motionAmount(){return settings.reduced?0:settings.motion;}
function applySettings() {
  normalizeVisuals(settings);presentation.apply(settings);vfx.quality(settings.quality);resize();
  for(const id of ['quality','tape','motion','brightness']) $('s-'+id).value=settings[id];
  $('s-reduced').checked=settings.reduced;
  $('recording').hidden=settings.tape==='off';
  document.body.classList.toggle('reduced-motion',settings.reduced);''')
sub('const padPrev = {};',"""for(const id of ['quality','tape','motion','brightness','reduced']) $('s-'+id).addEventListener('input',e=>{settings[id]=id==='reduced'?e.target.checked:['motion','brightness'].includes(id)?+e.target.value:e.target.value;applySettings();});
const padPrev = {};""")
sub('const bobA = moving ?', 'const bobA = moving && motionAmount() ?')
sub('0.028 * stance) : 0','0.028 * stance) * motionAmount() : 0')
sub('const limp = player.hurt ?', 'const limp = player.hurt && motionAmount() ?')
sub('const shiver = player.cold > 0.35 ?', 'const shiver = player.cold > 0.35 && motionAmount() ?')
sub('lerp(58, 75, (player.h - 0.5) / 1.22) - camera.fov','(settings.reduced ? 75 : lerp(58, 75, (player.h - 0.5) / 1.22)) - camera.fov')
sub('renderer.render(scene, camera)','presentation.render(scene, camera, gameClock*.001)')
sub('grain(); hud(dt);','hud(dt);')
a=s.index("const grainCtx = $('grain')");b=s.index('function hud(',a)
# Preserve frame counters used by HUD and scheduler, remove only grain resources/function.
grain=s[a:b];keep='\n'.join(line for line in grain.splitlines() if line.startswith('let ') and ('frame' in line.lower() or 'fps' in line))
s=s[:a]+keep+"\nconst torchM = torchm, breathM = breathm;\n"+s[b:]
sub('init();\n// warm',"init();\n$('loading').hidden=true; $('build').textContent=`Free browser demo · ${BUILD}`;\n// warm")
sub('updateCascades(dt); lap', '''updateCascades(dt);
  for(const batch of streamed)batch.update(player,settings.quality==='low'?32:48);
  updateVisualWater(); updateDecorations();
  vfx.update(dt,(x,z)=>visualWater(x,player.y,z));
  $('recording-time').textContent=new Date(runTime*1000).toISOString().slice(11,19);
  lap''')
sub('window.K = { player,', 'window.K = { presentation, settings, applySettings, vfx, assets, renderer, streamed, bubbles, ceilingAt, visualWater, placeGlowworms, placeCurtain, placeCrystals, placeCache, player,')
p.write_text(s,encoding='utf-8')
print('Integrated demo art, rendering, controls and effects')

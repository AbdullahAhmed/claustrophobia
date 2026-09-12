from pathlib import Path
import re
r=Path(__file__).resolve().parents[1];p=r/'src/main.js';s=p.read_text(encoding='utf-8')
def sub(a,b):
    global s
    assert a in s,a[:100];s=s.replace(a,b)
sub("import { VFX, StreamedInstances } from './vfx.js';","import { VFX, StreamedInstances } from './vfx.js';\nimport { RegionGeometry } from './regions.js';")
sub('const streamed = [];','const streamed = [], regionGeometry = new RegionGeometry();')
sub('if(++decorationTick%30)return;','if(++decorationTick%30)return;\n  regionGeometry.update(camera.position);updateLightRegions();updateDripstone();')
sub('m.castShadow = true; scene.add(m);\n}', 'm.castShadow = true; scene.add(m);regionGeometry.track(m);\n}')
sub('inst.frustumCulled = false; scene.add(inst);','inst.frustumCulled = false; scene.add(inst);regionGeometry.track(inst,new THREE.Vector3(p.x,p.y,p.z));')
sub('foam.frustumCulled = false; scene.add(foam);','foam.frustumCulled = false; scene.add(foam);regionGeometry.track(foam,new THREE.Vector3(p.x,p.y,p.z));')
# Give skull recesses and teeth their authored vertex colors in the instance batch.
sub('const boneMat = new THREE.MeshStandardMaterial({ color: 0xe6dcc6, roughness: 0.8, flatShading: true });','const boneMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors:true, roughness: 0.8, flatShading: true });')
# Spotlight aperture follows the model and is in front of the hand, preventing self-illumination blowout.
sub('updateMotes(dt, level * (0.5 + 0.5 * adapt));','''spot.position.copy(torchModel.position);spot.position.z-=.16;
  spot.target.position.copy(spot.position);spot.target.position.z-=8;
  torch.updateMatrixWorld(true);
  updateMotes(dt, level * (0.5 + 0.5 * adapt));''')
# All involuntary camera motion obeys the same comfort control; gameplay RNG calls remain.
s=re.sub(r'(camera\.(?:rotation\.[xyz]|position\.y) \+= )([^;]+);',r'\1(\2) * motionAmount();',s)
sub('const shiver = player.cold > 0.45 ?', 'const shiver = player.cold > 0.45 && motionAmount() ?')
sub('torchModel.rotation.copy(hand.rotation);\n    const a =', 'torchModel.rotation.copy(hand.rotation);\n    const a =') if 'torchModel.rotation.copy(hand.rotation);\n    const a =' in s else None
# Nearby logical light sources regain a pool entry when returning to an explored area.
sub('function returnLight(l)', '''function updateLightRegions(){
  const sources=[...glow.map(o=>({o,color:0x5cff7a,intensity:1.1,distance:9,decay:1.7,dy:.15})),...remains.filter(o=>!o.taken).map(o=>({o,color:0xffa050,intensity:.25,distance:4,decay:1.5,dy:.12})),...wormSites.map(o=>({o,color:0x5fd8b8,intensity:2.2,distance:24,decay:1.4,dy:-.8}))];
  sources.forEach(q=>q.d=Math.hypot(q.o.x-player.x,q.o.y-player.y,q.o.z-player.z));sources.sort((a,b)=>a.d-b.d);
  const free=lightPool.filter(l=>!l.userData.keep);
  for(const l of free){if(l.userData.owner)l.userData.owner.light=null;returnLight(l);}
  for(let i=0;i<Math.min(free.length,sources.length);i++){const q=sources[i];if(q.d>q.distance+20)break;const l=free[i];l.userData.free=false;l.userData.owner=q.o;q.o.light=l;l.color.set(q.color);l.intensity=q.intensity;l.distance=q.distance;l.decay=q.decay;l.position.set(q.o.x,q.o.y+q.dy,q.o.z);}
}
function returnLight(l)''')
# Fine calcite tips overlay the existing density cones, never the crawl corridor.
sub('const bonePiles = [];', '''const dripstone = stream(new THREE.CylinderGeometry(.15,1,1,9,4),new THREE.MeshStandardMaterial({color:0xb8a889,roughness:.65,flatShading:true}),500);
const detailedSpel=new WeakSet();
function updateDripstone(){
  for(const n of G.nodes){if(Math.hypot(n.x-player.x,n.y-player.y,n.z-player.z)>44)continue;
    for(const c of n.spel||[]){if(detailedSpel.has(c))continue;detailedSpel.add(c);if(c.r>.48||c.len<.3)continue;
      const tipY=c.top+(c.up?1:-1)*c.len;
      // Respect the collision core: only overlay formations that still exist.
      if(G.fieldAt(c.x,tipY-(c.up?1:-1)*.18,c.z)<-.06)continue;
      _p.set(c.x,c.top+(c.up?1:-1)*c.len*.5,c.z);_s.set(c.r*.94,c.len,c.r*.94);_e.set(c.up?0:Math.PI,0,0);_q.setFromEuler(_e);_m.compose(_p,_q,_s);dripstone.setMatrixAt(dripstone.count++,_m);
    }
  }
}
const bonePiles = [];''')
# A visible crack fan is short-lived and lives in the shared effect pool.
sub("vfx.emit('chips',f.x,f.y,f.z,8);", "vfx.emit('chips',f.x,f.y,f.z,8);vfx.crack(f.x,f.y+.02,f.z,f.r);")
sub("vfx.emit('chips',L.x,L.y,L.z,10);", "vfx.emit('chips',L.x,L.y,L.z,10);vfx.crack(L.x,L.mesh.position.y-L.r*.5,L.z,L.r);")
p.write_text(s,encoding='utf-8')
p=r/'tools/check.cjs';s=p.read_text(encoding='utf-8').replace('syntaxModules: 5',"syntaxModules: fs.readdirSync('src').filter(f => f.endsWith('.js')).length");p.write_text(s,encoding='utf-8')
print('Refined regional resources, equipment lighting, comfort and formations')

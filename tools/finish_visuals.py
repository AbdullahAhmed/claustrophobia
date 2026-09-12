from pathlib import Path
import re
root=Path(__file__).resolve().parents[1];p=root/'src/main.js';s=p.read_text(encoding='utf-8')
def sub(a,b):
    global s
    assert a in s,a[:100]
    s=s.replace(a,b)
sub('const waterUniforms = { uTime: { value: 0 } };','const waterUniforms = { uTime: { value: 0 }, uFlood: {value:0} };')
sub('sh.uniforms.uTime = waterUniforms.uTime;','sh.uniforms.uTime = waterUniforms.uTime; sh.uniforms.uFlood = waterUniforms.uFlood;')
sub('attribute vec3 aFlow; varying vec3 vFlow; varying vec3 vWp;', 'attribute vec3 aFlow; attribute float aFlood; attribute float aDepth; uniform float uFlood; varying float vDepth; varying vec3 vFlow; varying vec3 vWp;')
sub('vFlow = aFlow; vWp = (modelMatrix * vec4(position, 1.0)).xyz;', 'transformed.y += aFlood*uFlood; vDepth=aDepth; vFlow = aFlow; vWp = (modelMatrix * vec4(transformed, 1.0)).xyz;')
sub('uniform float uTime; varying vec3 vFlow; varying vec3 vWp;','uniform float uTime; varying float vDepth; varying vec3 vFlow; varying vec3 vWp;')
sub(".replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>",""".replace('#include <color_fragment>', `#include <color_fragment>
      float depthMix=1.0-exp(-max(vDepth,0.0)*1.4);
      diffuseColor.rgb *= mix(vec3(1.8,2.1,1.65),vec3(.48,.72,.85),depthMix);
      diffuseColor.a *= mix(.35,1.0,depthMix);
      float contact=(1.0-smoothstep(.02,.22,vDepth))*.25;
      diffuseColor.rgb += vec3(.06,.08,.065)*contact;`)
    .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>""")
a=s.index('    const fl = new Float32Array(out.water.length)');b=s.index('    g.computeVertexNormals();',a)
s=s[:a]+'''    const W=out.water, fl=new Float32Array(W.length),col=new Float32Array(W.length/3*4).fill(1),depth=new Float32Array(W.length/3),flood=new Float32Array(W.length/3);
    // Metadata is per triangle, so clipped shoreline cells need no fixed quad stride.
    for(let i=0;i<W.length;i+=9){
      const x=(W[i]+W[i+3]+W[i+6])/3,y=W[i+1],z=(W[i+2]+W[i+5]+W[i+8])/3;
      const f=G.flowAt(x,y,z),sg=G.nearestSegAt(x,y,z);
      for(let k=0;k<9;k+=3){
        const v=(i+k)/3;
        if(f){fl[i+k]=f.x*f.s;fl[i+k+2]=f.z*f.s;}
        let d=0;for(;d<2.4;d+=.2)if(G.fieldAt(W[i+k],y-d-.05,W[i+k+2])>-.03)break;
        depth[v]=d;
        if(sg?.floods){flood[v]=1;W[i+k+1]-=G.flood;}
        if(sg?.gour){col[v*4]=1.9;col[v*4+1]=2.3;col[v*4+2]=2.1;col[v*4+3]=.65;}
      }
    }
    g.setAttribute('aFlow',new THREE.BufferAttribute(fl,3));g.setAttribute('color',new THREE.BufferAttribute(col,4));
    g.setAttribute('aDepth',new THREE.BufferAttribute(depth,1));g.setAttribute('aFlood',new THREE.BufferAttribute(flood,1));
'''+s[b:]
sub('waterGroup.position.y = Math.sin(t * 1.1) * 0.012;','waterGroup.position.y = 0;')
sub('const h = Math.max(0.5, c.y - c.wl);','const surface = visualWater(c.x,c.wl,c.z); const wl=Number.isFinite(surface)?surface:c.wl;\n    const h = Math.max(0.1, c.y - wl);')
sub('c.wl + 0.03 + 0.05','wl + 0.03 + 0.05')
sub("g.setAttribute('aFlow', new THREE.BufferAttribute(new Float32Array(9), 3));", "g.setAttribute('aDepth', new THREE.BufferAttribute(new Float32Array(3).fill(1),1));g.setAttribute('aFlood', new THREE.BufferAttribute(new Float32Array(3),1));\n  g.setAttribute('aFlow', new THREE.BufferAttribute(new Float32Array(9), 3));")
sub('attribute float glow; attribute float wet; varying float vGlow; varying float vWet;', 'attribute float glow; attribute float wet; varying vec3 vRock; varying float vGlow; varying float vWet;')
sub('vGlow = glow; vWet = wet;', 'vGlow = glow; vWet = wet; vRock=(modelMatrix*vec4(position,1.0)).xyz;')
sub("'varying float vGlow; varying float vWet;\\n#include <common>'", "'varying vec3 vRock; varying float vGlow; varying float vWet;\\n#include <common>'")
sub(".replace('#include <roughnessmap_fragment>'", """.replace('#include <color_fragment>', `#include <color_fragment>
      float strata=sin(vRock.y*8.+sin(vRock.x*.53+vRock.z*.41)*1.7);
      float mineral=sin(vRock.x*4.1+vRock.z*3.7+sin(vRock.y*2.9))*sin(vRock.z*5.3-vRock.x*2.1);
      float grit=sin(vRock.x*81.+sin(vRock.z*43.))*sin(vRock.y*73.-vRock.z*61.);
      diffuseColor.rgb *= .84+strata*.075+mineral*.075+grit*.055;
      diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.77,.86,.83),vWet*.3);`)
    .replace('#include <roughnessmap_fragment>'""")
# Lit, smaller mist patches with clipped procedural texture; no self-lit horizontal sheets.
sub('new THREE.MeshBasicMaterial({ map: mistTex, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide, fog: false })','new THREE.MeshStandardMaterial({ color:0x8c9b95, map: mistTex, transparent: true, opacity: 0.22, roughness:1, depthWrite: false, side: THREE.DoubleSide })')
sub('const sz = Math.min(7, p.r * 0.9);','const sz = Math.min(3.8, p.r * 0.65);')
sub('m.rotation.x = -Math.PI / 2;\n    m.position.set(p.x + (R()', 'm.rotation.x = -Math.PI / 2 + .4;\n    m.position.set(p.x + (R()')
sub('for (const m of mists) { m.mesh.position.x', 'for (const m of mists) { m.mesh.visible=Math.hypot(m.x0-player.x,m.z0-player.z)<32; m.mesh.position.x')
sub("const dropMat = new THREE.MeshBasicMaterial", "const dropMat = new THREE.MeshStandardMaterial")
# Full meshes use bounded region visibility. Data/state survives leaving the region.
sub('const streamed = [];','''const streamed = [];
function visualWater(x,y,z){const sg=G.nearestSegAt(x,y,z);return sg?.wl!==undefined?sg.wl+(sg.floods?floodLevel-G.flood:0):-Infinity;}
function updateVisualWater(){waterUniforms.uFlood.value=floodLevel;}
let decorationTick=0;
function updateDecorations(){
  if(++decorationTick%30)return;
  for(const list of [caches,ropes,loose,olms])for(const d of list)if(d.mesh)d.mesh.visible=!d.taken && Math.hypot(d.x-player.x,(d.y??d.top??player.y)-player.y,d.z-player.z)<48;
  // Thread buffer only contains the visible region and has a fixed maximum.
  const nearby=[];for(let i=0;i<threadPos.length&&nearby.length<2400*6;i+=6)if(Math.hypot(threadPos[i]-player.x,threadPos[i+1]-player.y,threadPos[i+2]-player.z)<48)nearby.push(...threadPos.slice(i,i+6));
  const a=wormThreads.geometry.attributes.position;a.array.fill(0);a.array.set(nearby);a.needsUpdate=true;wormThreads.geometry.setDrawRange(0,nearby.length/3);
}
''')
sub('const wormThreads = new THREE.LineSegments(new THREE.BufferGeometry(),', "const wormThreads = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(new Float32Array(2400*6),3)),")
sub("wormThreads.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(threadPos), 3));",'')
sub('scene.add(wormThreads);','scene.add(wormThreads);wormThreads.geometry.setDrawRange(0,0);')
sub('const pearlInst = new THREE.InstancedMesh', 'const pearlInst = new THREE.InstancedMesh') if 'const pearlInst = new THREE.InstancedMesh' in s else None
s=re.sub(r'const pearlInst = new THREE.InstancedMesh\((.*?), (\d+)\);',r'const pearlInst = stream(\1, 800);',s)
s=re.sub(r'i < p.n && pearlInst.count < \d+', 'i < p.n',s)
# Animate first-person equipment as one rig so grip and beam do not separate.
sub('torch.position.copy(camera.position);', '''torch.position.copy(camera.position);
    const movement=motionAmount(), t=gameClock*.001;
    hand.position.set(.21 + Math.sin(player.bob*.5)*.006*movement,-.22+Math.sin(t*1.8)*.003*movement+(beamNarrow?.016:0),-.4+(shakeT>0?Math.sin(t*34)*.025*movement:0));
    hand.rotation.set(.08+(shakeT>0?Math.sin(t*34)*.12*movement:0),-.12,.05);
    torchModel.position.copy(hand.position);torchModel.rotation.copy(hand.rotation);''')
# Add anchors and modeled frays under the existing rope mesh, retaining removal behavior.
sub('function placeOldRope(p) {', '''function dressRope(r){
  const anchor=assets.model('anchor');anchor.position.y=r.top-r.mesh.position.y;r.mesh.add(anchor);
  if(r.frayed){for(let i=0;i<7;i++){const fiber=new THREE.Mesh(new THREE.CylinderGeometry(.001,.002,.12+i*.015,4),oldRopeMat);fiber.position.set(Math.sin(i)*.012,0,Math.cos(i)*.012);fiber.rotation.z=(i-3)*.11;r.mesh.add(fiber);}}
}
function placeOldRope(p) {''')
sub('scene.add(r.mesh); ropes.push(r);','scene.add(r.mesh);dressRope(r); ropes.push(r);')
# Animated instanced bats: bend wings about the shoulder while keeping the body stable.
sub('bats.count = 0; bats.frustumCulled', '''bats.material.onBeforeCompile=sh=>{sh.uniforms.uBatTime=waterUniforms.uTime;sh.vertexShader='uniform float uBatTime;\\n'+sh.vertexShader;sh.vertexShader=sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\\nfloat wing=max(0.0,abs(position.x)-.035); transformed.y += wing*sin(uBatTime*18.0+instanceMatrix[3].x*2.0);');};
bats.count = 0; bats.frustumCulled''')
p.write_text(s,encoding='utf-8')
# Presentation shell. Existing controls and menu IDs are preserved for saves and tests.
p=root/'index.html';h=p.read_text(encoding='utf-8')
h=h.replace('<title>Karst</title>','<!doctype html>\n<html lang="en">\n<title>Claustrophobia — Free Browser Demo</title>\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<meta name="description" content="A free cave survival horror demo. Find your way out with a fading torch, chalk and the sound of moving water.">')
h=re.sub(r'<link rel="stylesheet" href="https://fonts.googleapis.com[^>]+>', '<link rel="stylesheet" href="assets/fonts/fonts.css">',h)
h=h.replace('>KARST<','>CLAUSTROPHOBIA<').replace('<canvas id="grain" width="320" height="180"></canvas>','<div id="recording"><span class="rec-dot">●</span> REC <span id="recording-time">00:00:00</span></div>')
h=h.replace('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js','./vendor/three/build/three.module.js').replace('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/','./vendor/three/examples/jsm/')
h=h.replace('<div class="rec" id="ov-rec">','''<div class="visual-settings" onclick="event.stopPropagation()">
    <label>Graphics <select id="s-quality"><option value="low">Low</option><option value="standard" selected>Standard</option><option value="high">High</option></select></label>
    <label>Tape effect <select id="s-tape"><option value="off">Off</option><option value="subtle" selected>Subtle</option><option value="full">Full</option></select></label>
    <label>Camera motion <input id="s-motion" type="range" min="0" max="1" step=".1" value="1"></label>
    <label>Brightness <input id="s-brightness" type="range" min=".7" max="1.5" step=".05" value="1"></label>
    <label><input id="s-reduced" type="checkbox"> Reduced motion</label>
    <span class="calibration">Calibrate: <i></i><i></i><i></i> three dark shades should be distinguishable</span>
  </div>
  <div class="rec" id="ov-rec">''')
h=h.replace('<div class="snd" id="ov-snd">','<p id="loading" role="status">Preparing the cave…</p><p id="load-error" role="alert" hidden></p><div id="build">Free browser demo</div><a href="credits.html" target="_blank" rel="noopener" onclick="event.stopPropagation()">Credits</a>\n  <div class="snd" id="ov-snd">')
h=h.replace('<script type="module" src="src/main.js"></script>', '''<script type="module">
const fail=error=>{console.error(error);document.getElementById('loading').hidden=true;const el=document.getElementById('load-error');el.hidden=false;el.textContent='The cave could not load. Check your connection and WebGL support, then reload this page.';};
import('./src/main.js').catch(fail);
</script></html>''')
h=h.replace('</style>', '''
  .box {max-width:700px;padding:24px;} .box h1 {font-size:clamp(24px,4vw,44px);letter-spacing:.16em;margin-left:.16em;}
  #overlay {overflow:auto;} .settings{flex-wrap:wrap;gap:14px;} .visual-settings{display:flex;flex-wrap:wrap;justify-content:center;gap:12px;margin-top:16px;font-size:11px;}
  .visual-settings label{display:flex;align-items:center;gap:6px;} select{background:#181713;color:#c7beac;border:1px solid #595044;padding:5px;font:inherit;}
  .visual-settings input[type=range]{width:75px;accent-color:#b59d74;} .calibration{width:100%;color:#9c9385;}
  .calibration i{display:inline-block;width:20px;height:14px;background:#080808;margin:0 2px;vertical-align:middle;}.calibration i:nth-child(2){background:#141414}.calibration i:nth-child(3){background:#252525}
  #recording{position:fixed;left:20px;top:18px;font:12px var(--mono);letter-spacing:2px;color:#a8b1a2;pointer-events:none;opacity:.75;}.rec-dot{color:#b7573f;} #recording-time{margin-left:12px;}
  #loading,#load-error{margin-top:16px;color:#d2ba8e;} #build{font-size:10px;color:#8d8475;margin:10px;} a{color:#a89b84;font-size:11px;}
  .reduced-motion *{animation:none!important;transition:none!important;}
  @media(max-height:820px){#overlay{align-items:flex-start}.box .sub{margin-bottom:12px}.box p{line-height:1.65}.box .go{margin-top:14px}.settings{margin-top:12px}}
</style>''')
p.write_text(h,encoding='utf-8')
print('Water, materials, streaming and shell integrated')

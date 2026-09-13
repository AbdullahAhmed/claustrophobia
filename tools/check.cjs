// Run: node --experimental-vm-modules --no-warnings tools/check.cjs
// Uses empty marching-cubes tables: these checks exercise generation and density, not mesh triangulation.
const fs = require('fs'), vm = require('vm'), cp = require('child_process'), assert = require('assert');
process.chdir(require('path').join(__dirname, '..'));
async function load(committed, legacy = false) {
  const read = p => committed ? cp.execFileSync('git', ['show', (legacy ? '4430de6:' : 'bd55f1d:') + p], { encoding: 'utf8' }) : fs.readFileSync(p, 'utf8');
  const field = new vm.SourceTextModule(read('src/field.js'));
  const gen = new vm.SourceTextModule(read(!committed && legacy ? 'src/gen-legacy.js' : 'src/gen.js'));
  const tables = new vm.SyntheticModule(['edgeTable', 'triTable'], function () { this.setExport('edgeTable', []); this.setExport('triTable', []); });
  await gen.link(s => s === './field.js' ? field : tables); await gen.evaluate();
  return { G: gen.namespace, F: field.namespace };
}
(async () => {
  for (const file of fs.readdirSync('src').filter(f => f.endsWith('.js'))) new vm.SourceTextModule(fs.readFileSync('src/' + file, 'utf8'));
  const local = await load(false), committed = await load(true);
  const legacyLocal=await load(false,true),legacyBase=await load(true,true);
  let floors = 0, solidSamples = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const { G, F } = local;
    G.initGen(seed); committed.G.initGen(seed);
    const shape = g => g.nodes.map(n => [n.w, n.i, n.x, n.y, n.z, n.rx, n.ry, n.wl, n.core]);
    assert.deepStrictEqual(shape(G), shape(committed.G), 'New cave layout changed from Claude baseline for seed ' + seed);
    legacyLocal.G.initGen(seed);legacyBase.G.initGen(seed);
    assert.deepStrictEqual(shape(legacyLocal.G),shape(legacyBase.G),'Published legacy cave changed for seed '+seed);
    const floor = G.props.find(p => p.type === 'falsefloor');
    if (!floor) continue;
    floors++; G.chunks.clear();
    for (let dy = -0.15; dy <= 0.25; dy += 0.1) for (let dx = -1.8; dx <= 1.8; dx += 0.2) for (let dz = -1.8; dz <= 1.8; dz += 0.2) {
      const x = floor.x + dx, y = floor.y + dy, z = floor.z + dz;
      const cx = Math.floor(x / G.CHUNK), cy = Math.floor(y / G.CHUNK), cz = Math.floor(z / G.CHUNK), key = G.ckey(cx, cy, cz);
      let ch = G.chunks.get(key);
      if (!ch) { ch = { ...F.buildField(G.cellSegs.get(key), cx, cy, cz), built: true, solid: false }; G.chunks.set(key, ch); }
      const grid = F.gridAt(ch.density, (x - cx * G.CHUNK) / G.VOXEL, (y - cy * G.CHUNK) / G.VOXEL, (z - cz * G.CHUNK) / G.VOXEL);
      if (grid > 0) { assert(G.fieldAt(x, y, z) >= 0, 'Solid floor treated as air for seed ' + seed); solidSamples++; }
    }
    const slab = floor.node.slabs[0]; G.breakSlab(slab);
    assert(!G.segs.some(s => s.slabs.includes(slab)));
    assert(!G.nodes.some(n => n.slabs?.includes(slab)));
  }
  // The numbered seeds are regression samples, never a fixed level catalogue.
  const growing=local.G;growing.initGen(917263);const initialNodes=growing.nodes.length;
  for(let leg=0;leg<8;leg++){const front=growing.worms.find(w=>w.kind==='trunk'&&!w.dead)||growing.worms[0];Object.assign(growing.focus,{x:front.x,y:front.y,z:front.z});growing.advanceWorms(30);}
  assert(growing.nodes.length>initialNodes,'Exploration must grow the procedural cave');
  const code = fs.readFileSync('src/main.js', 'utf8');
  const ceiling = code.slice(code.indexOf('function ceilingAt('),code.indexOf('function placeCurtain('));
  const roofContext={G:{fieldAt:(x,y,z)=>y<1||y>=19?1:-1}};
  vm.runInNewContext(ceiling+'\nresult=ceilingAt(0,0,0,20);',roofContext);
  assert(roofContext.result>18.8&&roofContext.result<19.1,'High roof must be found after leaving floor rock');
  const visualWater = code.slice(code.indexOf('function visualWater('),code.indexOf('function updateVisualWater('));
  for(const floods of [true,false]){
    const context={floodLevel:.37,G:{flood:.4,nearestSegAt:()=>({wl:2.4,floods})}};
    vm.runInNewContext(visualWater+'\nresult=visualWater(0,0,0);',context);
    assert(Math.abs(context.result-(floods?2.37:2.4))<.00001,'Visual flood must be applied once and leave still pools fixed');
  }
  const onBuilt = code.slice(code.indexOf('function onBuilt(out)'), code.indexOf('function realizeChunk(ch)'));
  for (const dirty of [true, false]) {
    const ch = { dirty, building: true }, calls = [];
    vm.runInNewContext(onBuilt + '\nonBuilt({key:"test",solid:true});', {
      pendingBuilds: new Map([['test', ch]]),
      G: { chunks: new Map([['test', ch]]), applyChunkData: (c, out) => { calls.push('apply'); local.G.applyChunkData(c, out); } },
      disposeChunk: () => calls.push('dispose'), meshChunk: () => calls.push('mesh'),
    });
    assert.equal(ch.dirty, dirty); assert.equal(ch.building, false);
    assert.deepStrictEqual(calls, dirty ? [] : ['apply', 'dispose']);
  }
  const manifest = JSON.parse(fs.readFileSync('sounds/out/manifest.json', 'utf8'));
  const sounds = [...new Set(Object.values(manifest).flat())];
  assert(sounds.every(f => fs.existsSync('sounds/out/' + f)));
  console.log(JSON.stringify({ syntaxModules: fs.readdirSync('src').filter(f => f.endsWith('.js')).length, compatibleSeeds: 30, legacySeeds: 30, proceduralGrowth:{initialNodes,afterExploration:growing.nodes.length},highCeiling:'pass',floodInterpolation:'pass',floorCases: floors, solidSamples, slabRemoval: 'pass', workerResults: 'pass', audioFiles: sounds.length }, null, 2));
})().catch(e => { console.error(e); process.exitCode = 1; });

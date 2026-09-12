// Karst — the game: scene, player, torch, water, chalk, things in the dark. Generator lives in gen.js, sound in audio.js.
import * as THREE from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import * as G from './gen.js';
import { Sfx } from './audio.js';

const $ = id => document.getElementById(id);
const { clamp, lerp, rr } = G;
const params = new URLSearchParams(location.search);
// the cave you are in stays the same cave until you get out of it; your dead stay in it too
let cave = null;
try { cave = JSON.parse(localStorage.getItem('karst.cave') || 'null'); } catch (e) {}
const urlSeed = parseInt(params.get('seed'));
const urlSeedIsNew = !!urlSeed && !(cave && cave.seed === urlSeed);
const SEED = (urlSeed || (cave && !cave.escaped && cave.seed) || ((Math.random() * 1e9) | 0)) >>> 0;
let record = { runs: 0, best: 0, escapes: 0, drowned: 0, fell: 0, froze: 0, crushed: 0, foul: 0 };
try { record = Object.assign(record, JSON.parse(localStorage.getItem('karst.record') || '{}')); } catch (e) {}
if (!cave || cave.seed !== SEED) cave = { seed: SEED, attempts: 0, deaths: [], marks: [], escaped: false, tier: record.escapes };
if (cave.tier === undefined) cave.tier = 0;
if (!cave.run) cave.attempts++;
function saveCave() { try { localStorage.setItem('karst.cave', JSON.stringify(cave)); } catch (e) {} }
saveCave();
const runMarks = [];
const dread = Math.min(1, (cave.attempts - 1) * 0.18 + cave.deaths.length * 0.08);   // the cave remembers you
let saveT = 0;
function saveRun() {
  if (!player.alive || player.out) return;
  cave.run = { x: player.x, y: player.y, z: player.z, yaw: player.yaw, battery: player.battery, breath: player.breath, hurt: player.hurt, sticks: player.sticks, rope: player.rope, cells: player.cells,
               glow: glow.map(g => ({ x: g.x, y: g.y, z: g.z })), places, pages: player.pages,
               dist: player.dist, maxDepth: player.maxDepth, marks: runMarks, trail: player.trail.slice(-3000), t: runTime };
  saveCave();
}
document.addEventListener('visibilitychange', () => { if (document.hidden) saveRun(); });

const PR = 0.26;                                           // player collision radius
const H_STAND = 1.72, H_CROUCH = 0.95, H_PRONE = 0.5;
const BREATH_S = 16, BATTERY_S = 130;                      // seconds of breath; seconds of torch at full
const GRAV = 14;

const player = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, vy: 0, h: H_STAND, grounded: false, bob: 0, stamina: 1, sprint: false,
                 wl: -Infinity, swim: false, under: false, breath: 1, battery: 1, hurt: false,
                 airT: 0, whooshed: false, underT: 0, stepPhase: 0,
                 dist: 0, maxDepth: 0, marks: 0, alive: true, out: false, trail: [], lastTrail: null, cold: 0, sticks: 3, rope: 0, cells: false, pages: [] };
G.focus.x = 0; G.focus.y = 0; G.focus.z = 0;

// ---------- scene ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const FOG_AIR = new THREE.Color(0x000000), FOG_WATER = new THREE.Color(0x03161a);
scene.fog = new THREE.FogExp2(0x000000, 0.048);
const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 90);
camera.rotation.order = 'YXZ';
scene.add(camera);

// rock: flat-shaded, per-face colour, plus a per-vertex glow channel for the algae
const rockMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.94, metalness: 0.0, flatShading: true, vertexColors: true });
rockMat.onBeforeCompile = (sh) => {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', 'attribute float glow; varying float vGlow;\n#include <common>')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glow;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', 'varying float vGlow;\n#include <common>')
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(0.10, 0.75, 0.55) * vGlow * vGlow * 0.32;');
};
const waterMat = new THREE.MeshStandardMaterial({ color: 0x0a2226, roughness: 0.08, metalness: 0.3, emissive: 0x03120f, vertexColors: true,
                                                  transparent: true, opacity: 0.84, side: THREE.DoubleSide, depthWrite: false });
const waterUniforms = { uTime: { value: 0 } };
waterMat.onBeforeCompile = (sh) => {
  sh.uniforms.uTime = waterUniforms.uTime;
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', 'attribute vec3 aFlow; varying vec3 vFlow; varying vec3 vWp;\n#include <common>')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFlow = aFlow; vWp = (modelMatrix * vec4(position, 1.0)).xyz;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', 'uniform float uTime; varying vec3 vFlow; varying vec3 vWp;\n#include <common>')
    .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
      float sp = length(vFlow.xz);
      vec2 dir = sp > 0.01 ? vFlow.xz / sp : vec2(0.7, 0.7);
      float along = dot(vWp.xz, dir);
      float across = dot(vWp.xz, vec2(-dir.y, dir.x));
      float amp = 0.035 + 0.11 * min(sp, 2.5);
      float w1 = sin(along * 5.0 - uTime * (0.8 + 3.0 * sp) + across * 1.3);
      float w2 = sin(along * 11.0 - uTime * (1.3 + 5.0 * sp) + sin(across * 2.1 + uTime * 0.7) * 1.5);
      float w3 = sin(across * 6.0 + uTime * 0.9 + along * 0.4);
      normal = normalize(normal + vec3(dir.x * (w1 * 0.7 + w2 * 0.3) * amp, 0.0, dir.y * (w1 * 0.7 + w2 * 0.3) * amp) + vec3(-dir.y, 0.0, dir.x) * w3 * amp * 0.5);`)
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      { float spf = length(vFlow.xz); if (spf > 1.0) { float f = smoothstep(0.5, 0.95, sin(dot(vWp.xz, normalize(vFlow.xz)) * 3.0 - uTime * (2.0 + spf * 2.0) + sin(vWp.x * 4.0 + vWp.z * 3.0) * 2.0)); totalEmissiveRadiance += vec3(0.14, 0.16, 0.15) * f * min(1.0, (spf - 1.0) * 1.2); } }`);
};
const waterGroup = new THREE.Group(); scene.add(waterGroup);

const torch = new THREE.Object3D(); scene.add(torch);
const spot = new THREE.SpotLight(0xffd9a6, 12, 34, 0.52, 0.8, 1.2);
spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024);
spot.shadow.camera.near = 0.15; spot.shadow.camera.far = 32; spot.shadow.bias = -0.0006; spot.shadow.normalBias = 0.035;
spot.position.set(0.16, -0.14, 0); spot.target.position.set(0.05, -0.16, -8);
torch.add(spot); torch.add(spot.target);
const bounce = new THREE.PointLight(0xffc890, 0.9, 7, 1.5); scene.add(bounce);
// the hand that holds it: low-poly glove and torch, parented to the lagging rig so it sways and whips when you shake
const hand = new THREE.Group();
{
  const glove = new THREE.MeshStandardMaterial({ color: 0x24201b, roughness: 0.95, flatShading: true });
  const metal = new THREE.MeshStandardMaterial({ color: 0x2b2a2e, roughness: 0.5, metalness: 0.4, flatShading: true });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.026, 0.19, 8), metal); body.rotation.x = Math.PI / 2; body.position.z = 0.02;
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.027, 0.055, 8), metal); head.rotation.x = Math.PI / 2; head.position.z = -0.1;
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.028, 10), new THREE.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0xffc070, emissiveIntensity: 2, roughness: 0.3 }));
  lens.position.z = -0.128;
  const fist = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.085, 0.11), glove); fist.position.set(0, -0.012, 0.03); fist.rotation.z = 0.15;
  const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.03, 0.06), glove); thumb.position.set(-0.04, 0.02, 0.0); thumb.rotation.z = -0.5;
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.045, 0.4, 7), glove); arm.position.set(0.05, -0.16, 0.22); arm.rotation.set(1.05, 0, -0.35);
  const torchModel = new THREE.Group(); torchModel.add(body, head, lens);
  hand.add(fist, thumb, arm);
  hand.position.set(0.21, -0.22, -0.4); hand.rotation.set(0.08, -0.12, 0.05);
  torchModel.position.copy(hand.position); torchModel.rotation.copy(hand.rotation);
  hand.userData.lens = lens; hand.userData.torchModel = torchModel;
  torch.add(hand, torchModel);
}
let torchHeld = true;
const droppedTorch = { pos: new THREE.Vector3() };
scene.add(new THREE.AmbientLight(0x1a1610, 0.06));
// dust in the beam: a cloud of motes around the camera, lit only where the torch cone reaches them
const MOTES = 220;
const motePos = new Float32Array(MOTES * 3), moteVel = new Float32Array(MOTES * 3), moteSz = new Float32Array(MOTES);
for (let i = 0; i < MOTES; i++) { motePos[i * 3] = 1e6; moteSz[i] = 0.007 + Math.random() * 0.014; }
const moteTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d');
  const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32); const t = new THREE.CanvasTexture(c); return t; })();
const moteMat = new THREE.MeshBasicMaterial({ color: 0xffffff, map: moteTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false, side: THREE.DoubleSide });
const motes = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), moteMat, MOTES);
motes.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MOTES * 3), 3);
motes.frustumCulled = false; scene.add(motes);
const _td = new THREE.Vector3(), _tp = new THREE.Vector3(), _mm = new THREE.Matrix4(), _mp = new THREE.Vector3(), _ms = new THREE.Vector3(), _mc = new THREE.Color();
function updateMotes(dt, level) {
  torch.getWorldDirection(_td).negate(); _tp.copy(camera.position);            // torch is a plain Object3D: +Z is backwards
  const t = performance.now() * 0.001, ic = motes.instanceColor.array;
  for (let i = 0; i < MOTES; i++) {
    let x = motePos[i * 3], y = motePos[i * 3 + 1], z = motePos[i * 3 + 2];
    x += (Math.sin(t * 0.7 + i) * 0.04 + moteVel[i * 3]) * dt; y += (-0.05 + Math.cos(t * 0.5 + i * 1.3) * 0.03) * dt; z += (Math.cos(t * 0.6 + i * 0.7) * 0.04 + moteVel[i * 3 + 2]) * dt;
    const rx = x - _tp.x, ry = y - _tp.y, rz = z - _tp.z, d = Math.hypot(rx, ry, rz);
    if (d > 6 || d < 0.6 || G.fieldAt(x, y, z) > -0.05) {            // drifted off, too close, or inside rock: respawn in the beam, in air
      const r = 1.0 + Math.random() * 4.5, a = Math.random() * Math.PI * 2, s = Math.random() * r * 0.4;
      x = _tp.x + _td.x * r + Math.sin(a) * s; y = _tp.y + _td.y * r + (Math.random() - 0.5) * r * 0.5; z = _tp.z + _td.z * r + Math.cos(a) * s;
      moteVel[i * 3] = (Math.random() - 0.5) * 0.08; moteVel[i * 3 + 2] = (Math.random() - 0.5) * 0.08;
      if (G.fieldAt(x, y, z) > -0.05) { x = 1e6; }                    // try again next frame
    }
    motePos[i * 3] = x; motePos[i * 3 + 1] = y; motePos[i * 3 + 2] = z;
    // brightness: inside the cone, fading with distance and toward the cone edge
    const cosA = d > 0 ? (rx * _td.x + ry * _td.y + rz * _td.z) / d : 0;
    const edge = clamp((cosA - 0.86) / 0.1, 0, 1);
    const b = x > 1e5 ? 0 : 0.9 * level * edge * clamp(1.4 / (d + 0.4), 0, 1) * (0.55 + 0.45 * Math.sin(t * 3 + i * 2.1)) * (player.under ? 0.4 : 1);
    ic[i * 3] = b * 0.9; ic[i * 3 + 1] = b * 0.82; ic[i * 3 + 2] = b * 0.62;
    _mp.set(x, y, z); _ms.setScalar(moteSz[i] * (1 + d * 0.25));
    _mm.compose(_mp, camera.quaternion, _ms); motes.setMatrixAt(i, _mm);
  }
  motes.instanceMatrix.needsUpdate = true; motes.instanceColor.needsUpdate = true;
}
// algae light pool
const algaeLights = []; for (let i = 0; i < 6; i++) { const l = new THREE.PointLight(0x2fd8b0, 0, 7, 1.6); scene.add(l); algaeLights.push(l); }

let lastW = -1, lastH = -1;
function resize() { const w = innerWidth || 1280, h = innerHeight || 800; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }

// ---------- chunk meshes ----------
// Builds run in workers when available (no hitches); the initial load and any fallback run synchronously.
const workers = [], pendingBuilds = new Map();   // key -> chunk record
let workerOk = false, nextWorker = 0, buildGen = 0;
try {
  const n = Math.min(3, Math.max(1, (navigator.hardwareConcurrency || 4) - 1));
  for (let i = 0; i < n; i++) {
    const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    w.postMessage({ type: 'init', seed: SEED, edgeTable: G.edgeTable, triTable: G.triTable });
    w.onmessage = (e) => onBuilt(e.data);
    w.onerror = (e) => { console.warn('chunk worker failed, building on the main thread', e.message || e); workerOk = false; for (const ch of pendingBuilds.values()) { ch.building = false; ch.dirty = true; } pendingBuilds.clear(); };
    workers.push(w);
  }
  workerOk = workers.length > 0;
} catch (e) { console.warn('no workers:', e); workerOk = false; }
function onBuilt(out) {
  const ch = pendingBuilds.get(out.key); if (!ch) return;
  pendingBuilds.delete(out.key); ch.building = false;
  if (G.chunks.get(out.key) !== ch) return;                          // disposed while building
  G.applyChunkData(ch, out);
  if (ch.dirty) return;                                              // carved again meanwhile; the scan will re-queue it
  disposeChunk(ch);
  if (!out.solid) meshChunk(ch, out);
}
function realizeChunk(ch) {
  if (workerOk && !ch.building) {
    const list = G.cellSegs.get(ch.key);
    if (!list || list.length === 0) { disposeChunk(ch); G.applyChunkData(ch, { solid: true }); return; }
    ch.building = true; ch.dirty = false; pendingBuilds.set(ch.key, ch);
    workers[nextWorker++ % workers.length].postMessage({ type: 'build', key: ch.key, cx: ch.cx, cy: ch.cy, cz: ch.cz, list: G.plainSegs(list), gen: ++buildGen });
    return;
  }
  if (ch.building) return;
  disposeChunk(ch);
  const out = G.buildChunk(ch);
  if (out) meshChunk(ch, out);
}
function meshChunk(ch, out) {
  if (out.rock) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(out.rock.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(out.rock.col, 3));
    geo.setAttribute('glow', new THREE.BufferAttribute(out.rock.glow, 1));
    geo.computeVertexNormals(); geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, rockMat); mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh); ch.mesh = mesh;
  }
  if (out.water) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(out.water, 3));
    const fl = new Float32Array(out.water.length), col = new Float32Array(out.water.length / 3 * 4).fill(1), W = out.water;
    for (let i = 0; i < W.length; i += 18) {                        // one lookup per quad
      const f = G.flowAt(W[i] + 0.2, W[i + 1], W[i + 2] + 0.2);
      if (f) for (let k = 0; k < 18; k += 3) { fl[i + k] = f.x * f.s; fl[i + k + 2] = f.z * f.s; }
      const sg = G.nearestSegAt(W[i] + 0.2, W[i + 1], W[i + 2] + 0.2);
      if (sg && sg.gour) for (let k = 0; k < 6; k++) { const c = (i / 3 + k) * 4; col[c] = 1.9; col[c + 1] = 2.3; col[c + 2] = 2.1; col[c + 3] = 0.45; }   // shallow clear water over white calcite
    }
    g.setAttribute('aFlow', new THREE.BufferAttribute(fl, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 4));
    g.computeVertexNormals(); g.computeBoundingSphere();
    ch.water = new THREE.Mesh(g, waterMat); waterGroup.add(ch.water);
  }
}
function realizeSync(ch) { disposeChunk(ch); const out = G.buildChunk(ch); if (out) meshChunk(ch, out); }
function disposeChunk(ch) {
  if (ch.mesh) { scene.remove(ch.mesh); ch.mesh.geometry.dispose(); ch.mesh = null; }
  if (ch.water) { waterGroup.remove(ch.water); ch.water.geometry.dispose(); ch.water = null; }
}
const stats = { builds: 0, buildMs: 0, maxMs: 0, frameMs: 0 };
function processQueue(ms, sync) {
  const t0 = performance.now();
  while (G.queue.length && performance.now() - t0 < ms) {
    const ch = G.queue.shift(); if ((ch.built && !ch.dirty) || ch.building) continue;
    if (!sync && workerOk && pendingBuilds.size >= workers.length * 3) { G.queue.unshift(ch); break; }   // keep the workers fed, not flooded
    const t1 = performance.now(); if (sync) realizeSync(ch); else realizeChunk(ch); const d = performance.now() - t1;
    stats.builds++; stats.buildMs += d; if (d > stats.maxMs) stats.maxMs = d;
  }
}

// ---------- props: bones, daylight ----------
const boneMat = new THREE.MeshStandardMaterial({ color: 0xe6dcc6, roughness: 0.8, flatShading: true });
const boneGeos = {
  skull: new THREE.IcosahedronGeometry(0.11, 0).scale(1, 0.85, 1.25),
  long: new THREE.CapsuleGeometry(0.028, 0.34, 2, 6),
  rib: new THREE.TorusGeometry(0.17, 0.018, 4, 9, Math.PI),
};
const boneInst = {}; const boneCount = {};
for (const k in boneGeos) { boneInst[k] = new THREE.InstancedMesh(boneGeos[k], boneMat, 900); boneInst[k].count = 0; boneInst[k].castShadow = true; boneInst[k].receiveShadow = true; scene.add(boneInst[k]); boneCount[k] = 0; }
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const bonePiles = [];       // {x,y,z, r, crunched}
// gypsum blades for crystal pockets
const crystalMat = new THREE.MeshStandardMaterial({ color: 0xf3f5ff, roughness: 0.28, metalness: 0.0, emissive: 0x2c3444, flatShading: true });
const crystals = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 4), crystalMat, 6000); crystals.count = 0; crystals.castShadow = true; scene.add(crystals);
const _up = new THREE.Vector3(0, 1, 0), _nrm = new THREE.Vector3();
function placeCrystals(p) {
  let sd = p.seed * 233280 | 0; const R = () => (sd = (sd * 9301 + 49297) % 233280) / 233280;
  const cy = p.y + p.ry * 0.7, n = 120 + (R() * 80 | 0);
  for (let i = 0; i < n && crystals.count < 6000; i++) {
    // a random direction from the middle of the pocket to its wall
    const u = R() * 2 - 1, a = R() * Math.PI * 2, r = Math.sqrt(1 - u * u), dx = r * Math.cos(a), dy = u, dz = r * Math.sin(a);
    const t = G.rayToRock(p.x, cy, p.z, dx, dy, dz, p.rx + p.ry + 2, 0.12);
    if (t >= p.rx + p.ry + 2) continue;
    const hx = p.x + dx * t, hy = cy + dy * t, hz = p.z + dz * t;
    G.gradAt(hx, hy, hz); const g = G.G, gl = Math.hypot(g.x, g.y, g.z) || 1;
    _nrm.set(-g.x / gl, -g.y / gl, -g.z / gl);
    _q.setFromUnitVectors(_up, _nrm);
    const rad = 0.03 + R() * 0.07, len = 0.18 + R() * 0.45;
    _p.set(hx + _nrm.x * (len * 0.35), hy + _nrm.y * (len * 0.35), hz + _nrm.z * (len * 0.35)); _s.set(rad, len, rad);
    _e.set(0, R() * Math.PI, 0); const spin = new THREE.Quaternion().setFromEuler(_e); _q.multiply(spin);
    _m.compose(_p, _q, _s); crystals.setMatrixAt(crystals.count++, _m);
  }
  crystals.instanceMatrix.needsUpdate = true;
}
function addBone(kind, x, y, z, yaw, pitch, roll, scale) {
  const im = boneInst[kind]; if (im.count >= 900) return;
  _p.set(x, y, z); _e.set(pitch, yaw, roll); _q.setFromEuler(_e); _s.set(scale, scale, scale);
  _m.compose(_p, _q, _s); im.setMatrixAt(im.count++, _m); im.instanceMatrix.needsUpdate = true;
}
function floorBelow(x, y, z) {                       // drop a point onto the meshed floor (skipping rock it may start inside)
  let t = 0;
  while (t < 2.0 && G.fieldAt(x, y - t, z) > -0.04) t += 0.1;
  if (t >= 2.0) return null;
  for (; t < 4.5; t += 0.05) if (G.fieldAt(x, y - t, z) > -0.04) return y - t;
  return null;
}
function placeBones(p) {
  const rnd = G.hash3(p.seed * 1e6 | 0, 7, 3); let s = rnd;
  const R = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const sc = p.big ? rr(5, 8) : 1.35, n = p.big ? 5 : 5 + (R() * 10 | 0);
  for (let i = 0; i < n; i++) {
    const a = R() * Math.PI * 2, d = R() * p.rx * 0.6, x = p.x + Math.sin(a) * d, z = p.z + Math.cos(a) * d;
    const kind = i === 0 ? 'skull' : R() < 0.4 ? 'rib' : 'long';
    if (R() < 0.3 && !p.big) {                      // sunk into the wall
      const ang = R() * Math.PI * 2, dx = Math.sin(ang), dz = Math.cos(ang);
      const t = G.rayToRock(p.x, p.y + 0.6 + R() * 0.8, p.z, dx, 0, dz, 6, 0.1);
      if (t < 6) { addBone(kind, p.x + dx * (t + 0.02), p.y + 0.6 + R() * 0.8, p.z + dz * (t + 0.02), ang + Math.PI / 2, R() * 0.6 - 0.3, R() * 6, sc); continue; }
    }
    const fy = floorBelow(x, p.y + 1.0, z); if (fy === null) continue;
    addBone(kind, x, fy + (kind === 'skull' ? 0.06 : 0.02) * sc, z, R() * Math.PI * 2, kind === 'skull' ? R() * 0.4 - 0.2 : R() * 0.3, kind === 'long' ? Math.PI / 2 + R() * 0.4 : R() * 0.3, sc);
  }
  bonePiles.push({ x: p.x, y: p.y, z: p.z, r: p.rx * 0.7 + (p.big ? 3 : 0), crunched: 0, taught: false });
  if (!p.big && R() < 0.3) {
    const ax = p.x + (R() - 0.5) * 0.8, az = p.z + (R() - 0.5) * 0.8, fy = floorBelow(ax, p.y + 1.0, az);
    if (fy !== null) { const k = R() < 0.3 ? 'page' : R() < 0.4 ? 'battery' : R() < 0.62 ? 'sticks' : R() < 0.85 ? 'rope' : 'cells'; placeCache(ax, fy, az, k, k === 'page' ? composePage(ax, fy, az, R) : null); }
  }
}
const remains = [];          // {x,y,z, taken, light}
const torchGeo = new THREE.CylinderGeometry(0.025, 0.03, 0.22, 6), torchMat = new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.6 });
const lensMat = new THREE.MeshBasicMaterial({ color: 0xffb060 });
function placeRemains(p) {
  const fy = floorBelow(p.x, p.y + 0.3, p.z);
  const y = fy === null ? p.y : fy;
  placeBones({ x: p.x, y, z: p.z, rx: 0.9, ry: 1, big: false, seed: (p.t % 1000) / 1000 });
  const t = new THREE.Mesh(torchGeo, torchMat); t.position.set(p.x + 0.35, y + 0.04, p.z - 0.2); t.rotation.set(Math.PI / 2, 0, rr(0, 6)); scene.add(t);
  const lens = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 6), lensMat); lens.position.set(p.x + 0.35, y + 0.05, p.z - 0.2); scene.add(lens);
  const light = new THREE.PointLight(0xffa050, 0.25, 4, 1.5); light.position.set(p.x + 0.35, y + 0.12, p.z - 0.2); scene.add(light);
  remains.push({ x: p.x + 0.35, y, z: p.z - 0.2, taken: false, light, lens, cause: p.cause, battery: p.battery });
}
// bats: a colony on a chamber ceiling; light or noise sends it past your face
const roosts = [];           // {x,y,z, floor, n, loop, spooked}
const BATS = 90;
const batGeo = new THREE.BufferGeometry();
batGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.21, 0, 0.03, 0, 0, -0.07, 0, 0, 0.06, 0.21, 0, 0.03, 0, 0, -0.07, 0, 0, 0.06]), 3));
const bats = new THREE.InstancedMesh(batGeo, new THREE.MeshBasicMaterial({ color: 0x0b0907, side: THREE.DoubleSide }), BATS);
bats.count = 0; bats.frustumCulled = false; scene.add(bats);
const batList = [];          // {x,y,z, vx,vy,vz, t, phase}
function placeRoost(p) {
  const r = { ...p, spooked: false, loop: soundsOn ? sfx.loop('bats_colony', { x: p.x, y: p.y, z: p.z, rolloff: 1.4 }) : null };
  if (r.loop) r.loop.setVol(0.35, 1);
  roosts.push(r);
}
function spookRoost(r) {
  r.spooked = true; if (r.loop) r.loop.setVol(0, 0.4);
  sfx.play('bats_burst', { x: r.x, y: r.y, z: r.z, vol: 0.9, wet: 0.6, rolloff: 0.6 });
  camera.getWorldDirection(viewDir);
  for (let i = 0; i < r.n && batList.length < BATS; i++) {
    // each bat leaves the roost toward a point near your head, then keeps going
    const tx = camera.position.x + (Math.random() - 0.5) * 2.4, ty = camera.position.y + (Math.random() - 0.3) * 1.6, tz = camera.position.z + (Math.random() - 0.5) * 2.4;
    const dx = tx - r.x, dy = ty - r.y, dz = tz - r.z, L = Math.hypot(dx, dy, dz) || 1, sp = 5 + Math.random() * 4;
    batList.push({ x: r.x + (Math.random() - 0.5) * 2, y: r.y - Math.random() * 0.6, z: r.z + (Math.random() - 0.5) * 2, vx: dx / L * sp, vy: dy / L * sp, vz: dz / L * sp, t: -Math.random() * 1.4, phase: Math.random() * 6, life: 5 + Math.random() * 2 });
  }
  for (let k = 0; k < 6; k++) setTimeout(() => sfx.play('flap', { x: camera.position.x + (Math.random() - 0.5) * 2, y: camera.position.y + 0.3, z: camera.position.z + (Math.random() - 0.5) * 2, vol: 0.5, vary: 0.3 }), 600 + k * 260 + Math.random() * 200);
  showHint('bats');
}
function updateBats(dt) {
  camera.getWorldDirection(viewDir);
  for (const r of roosts) {
    if (r.spooked) continue;
    const dx = r.x - camera.position.x, dy = r.y - camera.position.y, dz = r.z - camera.position.z, d = Math.hypot(dx, dy, dz);
    if (d > 14) continue;
    const lit = torchLevel(player.battery) > 0.35 && (dx * viewDir.x + dy * viewDir.y + dz * viewDir.z) / d > 0.9;
    if (lit || player.sprint || d < 3.5) spookRoost(r);
  }
  let n = 0;
  for (let i = batList.length - 1; i >= 0; i--) {
    const b = batList[i]; b.t += dt; if (b.t < 0) { continue; }
    b.life -= dt; if (b.life <= 0) { batList.splice(i, 1); continue; }
    b.x += b.vx * dt; b.y += b.vy * dt + Math.sin(b.t * 9 + b.phase) * 0.02; b.z += b.vz * dt;
    if (G.fieldAt(b.x, b.y, b.z) > -0.1) { b.vx *= -0.6; b.vz *= -0.6; b.vy = Math.abs(b.vy) * 0.5 + 1; }           // bounce off rock, upward
    const flap = 0.6 + 0.6 * Math.abs(Math.sin(b.t * 18 + b.phase));
    _p.set(b.x, b.y, b.z); _e.set(0, Math.atan2(b.vx, b.vz), 0); _q.setFromEuler(_e); _s.set(flap, 1, 1);
    _m.compose(_p, _q, _s); bats.setMatrixAt(n++, _m);
    if (Math.hypot(b.x - camera.position.x, b.y - camera.position.y, b.z - camera.position.z) < 0.5 && b.t > 0.2 && !b.hit) { b.hit = true; camera.rotation.z += (Math.random() - 0.5) * 0.06; }
  }
  bats.count = n; if (n) bats.instanceMatrix.needsUpdate = true;
}
// rope: rig a pit and go down it slowly; a rigged rope can be climbed back up
const ropes = [];            // {x, top, bottom, z, mesh}
const ropeMat = new THREE.MeshStandardMaterial({ color: 0xc8b48a, roughness: 0.9 });
let roping = null;           // {rope, dir, t}
function nearestVoid() {
  let best = null, bd = 3.2;
  for (const v of G.voids) { const d = Math.hypot(v.x - player.x, v.z - player.z); if (d < bd && Math.abs(v.top - player.y) < 1.5) { bd = d; best = v; } }
  return best;
}
function useRope() {
  if (!running || !player.alive || player.out || roping) return;
  // climb an existing rope from the bottom
  for (const r of ropes) {
    if (Math.hypot(r.x - player.x, r.z - player.z) < 3.0 && Math.abs(player.y - r.bottom) < 1.8) { roping = { rope: r, dir: 1, t: 0 }; showHint('climbing'); return; }
    if (Math.hypot(r.x - player.x, r.z - player.z) < 1.8 && Math.abs(player.y - r.top) < 1.5) { roping = { rope: r, dir: -1, t: 0 }; showHint('down the rope'); return; }
  }
  const v = nearestVoid();
  if (!v) { showHint('nothing to rig here'); return; }
  if (player.rope <= 0) { showHint('you have no rope'); return; }
  player.rope--;
  const r = { x: v.x, z: v.z, top: v.top, bottom: v.y, mesh: new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, v.top - v.y + 0.3, 5), ropeMat) };
  r.mesh.position.set(v.x, (v.top + v.y) / 2 - 0.1, v.z); scene.add(r.mesh); ropes.push(r);
  roping = { rope: r, dir: -1, t: 0 }; sfx.play('rattle', { vol: 0.5, rate: 0.6 }); showHint('rigged. going down');
}
function updateRoping(dt) {
  if (!roping) return;
  const r = roping.rope, span = r.top - r.bottom, speed = roping.dir < 0 ? 1.6 : 0.9;
  roping.t += dt;
  const target = roping.dir < 0 ? r.bottom : r.top;
  player.x += (r.x - player.x) * Math.min(1, dt * 4); player.z += (r.z - player.z) * Math.min(1, dt * 4);
  player.y += Math.sign(target - player.y) * speed * dt; player.vy = 0; player.airT = 0; player.h = H_CROUCH;
  if (Math.floor(roping.t * 1.6) !== Math.floor((roping.t - dt) * 1.6)) sfx.play('scrape', { vol: 0.35, rate: 1.4, vary: 0.3, dur: 0.4, hrtf: false });
  if ((roping.dir < 0 && player.y <= r.bottom + 0.15) || (roping.dir > 0 && player.y >= r.top - 0.05)) {
    if (roping.dir > 0) { player.y = r.top + 0.1; const dx = -Math.sin(player.yaw), dz = -Math.cos(player.yaw); player.x = r.x + dx * 0.9; player.z = r.z + dz * 0.9; }   // step off the lip
    else player.y = r.bottom + 0.15;
    roping = null; showHint(player.y < r.bottom + 1 ? 'down' : 'up');
  }
}
// roots through the roof near the surface
const rootMat = new THREE.MeshStandardMaterial({ color: 0x3d2f22, roughness: 0.95, flatShading: true });
const roots = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 0.25, 1, 5), rootMat, 1200); roots.count = 0; scene.add(roots);
function placeRoots(p) {
  let sd = p.seed * 233280 | 0; const R = () => (sd = (sd * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < p.n && roots.count < 1200; i++) {
    const a = R() * Math.PI * 2, d = R() * p.rx * 0.7, x = p.x + Math.sin(a) * d, z = p.z + Math.cos(a) * d;
    // find the ceiling above this spot, hang a root from it
    let cy = null; for (let h = 0; h < 4; h += 0.1) { const yy = p.y - 1.5 + h; if (G.fieldAt(x, yy, z) > -0.05 && G.fieldAt(x, yy - 0.15, z) < -0.05) { cy = yy; break; } }
    if (cy === null) continue;
    const len = 0.4 + R() * 1.4, r = 0.012 + R() * 0.03;
    _p.set(x, cy - len / 2 + 0.05, z); _e.set(R() * 0.25 - 0.12, R() * 6, R() * 0.25 - 0.12); _q.setFromEuler(_e); _s.set(r, len, r);
    _m.compose(_p, _q, _s); roots.setMatrixAt(roots.count++, _m);
  }
  roots.instanceMatrix.needsUpdate = true;
}
// glowsticks: a cold green light you can leave behind
const glow = [];             // {x,y,z, light, mesh}
const stickGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.16, 6);
const stickMat = new THREE.MeshBasicMaterial({ color: 0x9dffb0, fog: false });
function dropGlowstick() {
  if (!running || !player.alive || player.out) return;
  if (player.sticks <= 0) { showHint('no glowsticks left'); return; }
  player.sticks--;
  const fy = floorBelow(player.x, player.y + 0.5, player.z), y = (fy === null ? player.y : fy) + 0.03;
  const x = player.x + (Math.random() - 0.5) * 0.3, z = player.z + (Math.random() - 0.5) * 0.3;
  const mesh = new THREE.Mesh(stickGeo, stickMat); mesh.position.set(x, y, z); mesh.rotation.set(Math.PI / 2 + rr(-0.2, 0.2), rr(0, 6), 0); scene.add(mesh);
  const light = new THREE.PointLight(0x5cff7a, 1.1, 9, 1.7); light.position.set(x, y + 0.15, z); scene.add(light);
  glow.push({ x, y, z, light, mesh });
  sfx.play('torch_click', { vol: 0.5, rate: 1.4 });
  showHint(`glowstick down · ${player.sticks} left`);
}
// caches: a dead caver's pack next to some bones
const caches = [];           // {x,y,z, kind, taken, mesh}
const packGeo = new THREE.BoxGeometry(0.28, 0.2, 0.16), packMat = new THREE.MeshStandardMaterial({ color: 0x3b3a36, roughness: 0.9, flatShading: true });
function placeCache(x, y, z, kind, text) {
  if (kind === 'page' && (cave.pages || []).some(pg => pg.key === `${x.toFixed(0)},${z.toFixed(0)}`)) return;   // already read, on an earlier attempt
  const mesh = new THREE.Mesh(kind === 'page' ? pageGeo : packGeo, kind === 'page' ? pageMat : packMat); mesh.position.set(x, y + (kind === 'page' ? 0.015 : 0.1), z); mesh.rotation.y = rr(0, 6); if (kind !== 'page') mesh.rotation.z = rr(-0.3, 0.3); scene.add(mesh);
  const tag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.05), new THREE.MeshBasicMaterial({ color: kind === 'battery' ? 0xffb347 : kind === 'rope' ? 0xff7a5c : kind === 'cells' ? 0xffffff : kind === 'page' ? 0xf1e6cc : 0x9dffb0, fog: false }));
  tag.position.set(x, y + 0.22, z); scene.add(tag);
  caches.push({ x, y, z, kind, text, taken: false, mesh, tag });
}
const pageGeo = new THREE.PlaneGeometry(0.21, 0.28).rotateX(-Math.PI / 2), pageMat = new THREE.MeshStandardMaterial({ color: 0xd9ccb0, roughness: 0.9, side: THREE.DoubleSide });
// a page from someone's log: what they learned about the rock near where they stopped
const DIRS8 = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
function bearing(dx, dz) { const a = Math.atan2(dx, -dz); return DIRS8[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8]; }
const CAVER_NAMES = ['Anna', 'Tomas', 'Priya', 'Dan', 'Lise', 'Marek', 'Ola', 'Ben', 'Ines', 'Kit'];
function composePage(x, y, z, R) {
  const near = (arr, lim) => { let b = null, bd = lim; for (const n of arr) { const d = Math.hypot(n.x - x, n.z - z); if (d < bd && d > 4) { bd = d; b = n; } } return b; };
  const name = CAVER_NAMES[(R() * CAVER_NAMES.length) | 0], day = 2 + ((R() * 9) | 0);
  const opts = [];
  const sp = near(G.sumpNodes, 70);
  if (sp) opts.push(sp.sump.trap ? `the sump ${bearing(sp.x - x, sp.z - z)} of here does not come up again. ${name} went in first. don\u2019t`
                                : `the sump ${bearing(sp.x - x, sp.z - z)} of here goes about ${Math.round(sp.sump.len / 5) * 5} m under. ${sp.sump.bell ? 'there is air about halfway' : 'no air till the far side'}`);
  const vd = near(G.voids, 70);
  if (vd) opts.push(`the drop ${bearing(vd.x - x, vd.z - z)} of here is ${Math.round(vd.top - vd.y)} m. ${vd.wet ? 'deep water at the bottom' : 'rock at the bottom. we lowered ' + name + ' on the rope'}`);
  const fl = near(G.nodes.filter(n => n.foul), 60);
  if (fl) opts.push(`the passage ${bearing(fl.x - x, fl.z - z)} of here has bad air. ${name}\u2019s head hurt after a minute. we came out`);
  const lo = near(G.props.filter(pp => pp.type === 'loose').concat(loose), 60);
  if (lo) opts.push(`the roof of the chamber ${bearing(lo.x - x, lo.z - z)} moves when you walk under it. don\u2019t run in there`);
  const st = near(G.streamNodes, 70);
  if (st) opts.push(`there is a stream ${bearing(st.x - x, st.z - z)} of here. it goes downhill. ${R() < 0.5 ? 'we did not follow it' : 'follow the water'}`);
  if (opts.length && R() < 0.85) return `day ${day}. ` + opts[(R() * opts.length) | 0];
  const tr = near(G.nodes.filter(n => G.trunkIds.has(n.w)), 80);
  if (tr) { const nx = G.nodes.find(n => n.w === tr.w && n.i === tr.i + 8); if (nx) return `day ${day}. the main way runs ${bearing(nx.x - tr.x, nx.z - tr.z)} from here. it keeps going. ${name} thinks it opens`; }
  return [`day ${day}. torch at ${(R() * 30 + 5) | 0}%. ${name} has stopped talking`, `day ${day}. we heard something walking. it was not one of us`, `day ${day}. ${name} says leave the pack. i am leaving the pack`][(R() * 3) | 0];
}
// notes from the ones who came before, written on the nearest wall at head height
function placeNote(p) {
  let best = null, bd = 9;
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a);
    const t = G.rayToRock(p.x, p.y + 1.3, p.z, dx, 0, dz, 6, 0.1);
    if (t < bd) { bd = t; best = new THREE.Vector3(p.x + dx * (t - 0.02), p.y + 1.3, p.z + dz * (t - 0.02)); }
  }
  if (!best) return;
  G.gradAt(best.x, best.y, best.z); const g = G.G, gl = Math.hypot(g.x, g.y, g.z) || 1;
  drawMark(p.text, best, new THREE.Vector3(-g.x / gl, -g.y / gl, -g.z / gl), true);
}
// cascades: water falling from the ceiling into a pool
const cascades = [];         // {x,y,z, wl, drops: Float32Array phases, inst, foam, loop}
const dropMat = new THREE.MeshBasicMaterial({ color: 0xcfe6ff, map: moteTex, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true });
function placeCascade(p) {
  const n = p.big ? 140 : p.quiet ? 30 : 70, inst = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), dropMat, n);
  inst.frustumCulled = false; scene.add(inst);
  const foam = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), dropMat, 24); foam.frustumCulled = false; scene.add(foam);
  const c = { ...p, n, inst, foam, ph: new Float32Array(n).map(() => Math.random()), ox: new Float32Array(n).map(() => (Math.random() - 0.5) * (p.big ? 1.6 : 0.7)), oz: new Float32Array(n).map(() => (Math.random() - 0.5) * (p.big ? 1.6 : 0.7)),
              loop: soundsOn ? sfx.loop(p.quiet ? 'drips_cave' : p.big ? 'cascade_big' : 'cascade', { x: p.x, y: p.wl + 0.5, z: p.z, rolloff: 0.8, wet: 0.5 }) : null };
  if (c.loop) c.loop.setVol(p.quiet ? 0.5 : p.big ? 0.8 : 0.55, 1);
  cascades.push(c);
}
function updateCascades(dt) {
  const t = performance.now() * 0.001;
  for (const c of cascades) {
    const d = Math.hypot(c.x - camera.position.x, c.y - camera.position.y, c.z - camera.position.z);
    c.inst.visible = c.foam.visible = d < 45; if (d >= 45) continue;
    const h = Math.max(0.5, c.y - c.wl);
    for (let i = 0; i < c.n; i++) {
      c.ph[i] += dt * (1.4 + 0.35 * (i % 3)) / Math.sqrt(h / 3); if (c.ph[i] > 1) c.ph[i] -= 1;
      const yy = c.y - c.ph[i] * h, sp = 0.6 + c.ph[i] * 0.8;
      _p.set(c.x + c.ox[i] * (0.5 + c.ph[i]), yy, c.z + c.oz[i] * (0.5 + c.ph[i])); _s.set(0.05 + c.ph[i] * 0.06, 0.35 * sp, 1);
      _m.compose(_p, camera.quaternion, _s); c.inst.setMatrixAt(i, _m);
    }
    for (let i = 0; i < 24; i++) {
      const a = i / 24 * Math.PI * 2 + t * 0.4, r = (c.big ? 1.3 : 0.7) * (0.7 + 0.3 * Math.sin(t * 3 + i));
      _p.set(c.x + Math.cos(a) * r, c.wl + 0.03 + 0.05 * Math.abs(Math.sin(t * 5 + i)), c.z + Math.sin(a) * r); _s.set(0.35, 0.18, 1);
      _m.compose(_p, camera.quaternion, _s); c.foam.setMatrixAt(i, _m);
    }
    c.inst.instanceMatrix.needsUpdate = true; c.foam.instanceMatrix.needsUpdate = true;
  }
}
// the sinkhole overhead at the entrance: grey daylight far above, rain coming down the shaft
let sinkhole = null;
function placeSinkhole(p) {
  const sky = new THREE.Mesh(new THREE.CircleGeometry(0.75, 24), new THREE.MeshBasicMaterial({ color: 0x8fa0b4, fog: false }));
  sky.position.set(p.x, p.y + 0.2, p.z); sky.rotation.x = Math.PI / 2; scene.add(sky);                    // seen from below
  const shaft = new THREE.SpotLight(0x9fb2c8, 60, 26, 0.18, 0.9, 1.2); shaft.position.set(p.x, p.y, p.z);
  shaft.target.position.set(p.x, p.floor, p.z); scene.add(shaft); scene.add(shaft.target);
  const pool = new THREE.PointLight(0x8fa4bc, 1.2, 6, 1.6); pool.position.set(p.x, p.floor + 0.6, p.z); scene.add(pool);
  sinkhole = { ...p, sky, shaft, pool, dripT: 0 };
  // rain down the shaft, into a puddle
  placeCascade({ x: p.x, y: p.y - 0.5, z: p.z, wl: p.floor + 0.02, big: false, quiet: true });
}
let exitInfo = null, exitLoops = null;
function placeExit(e) {
  exitInfo = e;
  if (soundsOn) exitLoops = { wind: sfx.loop('wind', { x: e.x, y: e.y + 2, z: e.z, rolloff: 0.35, wet: 0.3 }), birds: sfx.loop('birds', { x: e.x + e.dx * 4, y: e.y + 3, z: e.z + e.dz * 4, rolloff: 0.6 }) };
  const disc = new THREE.Mesh(new THREE.CircleGeometry(5.5, 40), new THREE.MeshBasicMaterial({ color: 0xfff4dc, fog: false }));
  disc.position.set(e.x + e.dx * 4.6, e.y + 2.2, e.z + e.dz * 4.6); disc.lookAt(e.n1.x, e.n1.y + 1.5, e.n1.z);
  scene.add(disc);
  const sun = new THREE.PointLight(0xfff1d6, 140, 60, 2); sun.position.set(e.x + e.dx * 3, e.y + 3, e.z + e.dz * 3); scene.add(sun);
  const sky = new THREE.PointLight(0x9fc4ff, 30, 40, 2); sky.position.set(e.n1.x, e.n1.y + 1.8, e.n1.z); scene.add(sky);
}
let propTimer = 0;
function processProps(dt) {
  propTimer -= dt; if (propTimer > 0) return; propTimer = 0.5;
  for (let i = G.props.length - 1; i >= 0; i--) {
    const p = G.props[i];
    if (p.type === 'exit') { placeExit(p); G.props.splice(i, 1); continue; }
    const d = Math.hypot(p.x - player.x, p.y - player.y, p.z - player.z);
    if (d > 45) continue;
    if (!G.chunkReadyAt(p.x, p.y + 0.5, p.z)) continue;
    if (p.type === 'remains') placeRemains(p); else if (p.type === 'mark') drawMark(p.text, new THREE.Vector3(p.x, p.y, p.z), new THREE.Vector3(p.nx, p.ny, p.nz), true);
    else if (p.type === 'crystals') placeCrystals(p);
    else if (p.type === 'roost') placeRoost(p);
    else if (p.type === 'cascade') placeCascade(p);
    else if (p.type === 'sinkhole') placeSinkhole(p);
    else if (p.type === 'roots') placeRoots(p);
    else if (p.type === 'note') placeNote(p);
    else if (p.type === 'loose') placeLoose(p);
    else placeBones(p);
    G.props.splice(i, 1);
  }
  // algae lights follow the nearest dense patches
  const near = G.algaeNodes.filter(n => Math.hypot(n.x - player.x, n.y - player.y, n.z - player.z) < 26)
    .sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y, a.z - player.z) - Math.hypot(b.x - player.x, b.y - player.y, b.z - player.z));
  for (let i = 0; i < algaeLights.length; i++) {
    const l = algaeLights[i], n = near[i];
    if (!n) { l.intensity = 0; continue; }
    l.position.set(n.x, n.y + 0.9, n.z); l.intensity = 0.3 * n.algae;
  }
}

// ---------- collision ----------
function pushSphere(oy, r) {
  const d = G.fieldAt(player.x, player.y + oy, player.z);
  if (d <= -r) return null;
  G.gradAt(player.x, player.y + oy, player.z);
  const g = G.G; let gl = Math.hypot(g.x, g.y, g.z);
  if (gl < 1e-4) { if (d > 0.6) return null; g.x = 0; g.z = 0; g.y = -1; gl = 1; }   // no gradient near a surface: nudge up, never down
  const push = Math.min(0.35, (r + d) / Math.max(gl, 0.6));
  player.x -= g.x / gl * push; player.y -= g.y / gl * push; player.z -= g.z / gl * push;
  return -g.y / gl;
}
function collide() {
  player.grounded = false;
  for (let it = 0; it < 3; it++) {
    const ny = pushSphere(PR, PR);
    if (ny !== null) { if (ny > 0.35) { player.grounded = true; if (player.vy < 0) player.vy = 0; } else if (ny < -0.35 && player.vy > 0) player.vy = 0; }
    const top = Math.max(player.h - PR, PR);
    const ty = pushSphere(top, PR);
    if (ty !== null && ty < -0.35 && player.vy > 0) player.vy = 0;
    if (player.h > 1.2) pushSphere(player.h * 0.5, PR);
  }
}
function clearanceAbove(x = player.x, z = player.z) {
  for (let h = 0.3; h < 2.0; h += 0.1) if (G.fieldAt(x, player.y + h, z) > -0.22) return h;
  return 2.0;
}

// ---------- input ----------
const keys = {};
let running = false, dragLook = false, dragging = false, typing = false, showDebug = false;
const overlay = $('overlay'), chalkIn = $('chalk');
addEventListener('keydown', e => {
  if (typing) {
    if (e.code === 'Enter') { const t = chalkIn.value.trim(); closeChalk(); if (t) placeMark(t); }
    else if (e.code === 'Escape') closeChalk();
    return;
  }
  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.code === 'Backquote') showDebug = !showDebug;
  if (e.code === 'KeyN' && !player.alive) { newCave(); return; }
  if (e.code === 'KeyM' && !e.repeat && running) toggleNotebook();
  if (!running || !player.alive || player.out) return;
  if (e.code === 'KeyF' && !e.repeat) shakeTorch();
  if (e.code === 'KeyT' && !e.repeat) { e.preventDefault(); openChalk(); }
  if (e.code === 'KeyG' && !e.repeat) dropGlowstick();
  if (e.code === 'KeyE' && !e.repeat) useRope();
});
addEventListener('keyup', e => { keys[e.code] = false; });
function openChalk() { typing = true; for (const k in keys) keys[k] = false; chalkIn.value = ''; chalkIn.style.display = 'block'; chalkIn.focus(); }
function closeChalk() { typing = false; chalkIn.style.display = 'none'; chalkIn.blur(); canvas.focus(); }
let settings = { sens: 1, vol: 0.9, inv: false };
try { settings = Object.assign(settings, JSON.parse(localStorage.getItem('karst.settings') || '{}')); } catch (e) {}
function applySettings() {
  $('s-sens').value = settings.sens; $('s-vol').value = settings.vol; $('s-inv').checked = settings.inv;
  if (sfx.master) sfx.master.gain.value = settings.vol;
  try { localStorage.setItem('karst.settings', JSON.stringify(settings)); } catch (e) {}
}
$('s-sens').addEventListener('input', e => { settings.sens = +e.target.value; applySettings(); });
$('s-vol').addEventListener('input', e => { settings.vol = +e.target.value; applySettings(); });
$('s-inv').addEventListener('change', e => { settings.inv = e.target.checked; applySettings(); });
function look(dx, dy) { player.yaw -= dx * 0.0022 * settings.sens; player.pitch = clamp(player.pitch - dy * 0.0022 * settings.sens * (settings.inv ? -1 : 1), -1.5, 1.5); }
addEventListener('mousemove', e => { if (document.pointerLockElement === canvas || (dragLook && dragging)) look(e.movementX, e.movementY); });
canvas.addEventListener('mousedown', () => { dragging = true; }); addEventListener('mouseup', () => { dragging = false; });
overlay.addEventListener('click', () => {
  sfx.resume();
  if (player.out) { newCave(); return; }
  if (!player.alive) { sameCave(); return; }
  if (!canvas.requestPointerLock) { dragLook = true; start(); return; }
  const p = canvas.requestPointerLock({ unadjustedMovement: true });
  if (p && p.catch) p.catch(() => { dragLook = true; start(); });
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) start();
  else if (!dragLook && player.alive && !player.out) { running = false; overlay.classList.remove('hidden'); $('go').textContent = 'CLICK TO CONTINUE'; }
});
document.addEventListener('pointerlockerror', () => { dragLook = true; start(); });
function start() { overlay.classList.add('hidden'); running = true; }
if (matchMedia('(pointer: coarse)').matches) $('warn').style.display = 'block';

// ---------- run record ----------
record.runs++;
try { localStorage.setItem('karst.record', JSON.stringify(record)); } catch (e) {}
$('ov-rec').textContent = `cave ${SEED}${cave.tier ? ` (the ${['second', 'third', 'fourth', 'fifth', 'sixth', 'seventh'][Math.min(cave.tier, 6) - 1] || 'next'} cave: deeper)` : ''} · attempt ${cave.attempts}${cave.deaths.length ? ` · ${cave.deaths.length} of you lie in it` : ''} · farthest ever ${record.best.toFixed(0)} m · escaped ${record.escapes}×`;
if (cave.attempts > 1) $('ov-sub').textContent = 'the same cave. it remembers.';
function saveRecord() { record.best = Math.max(record.best, player.dist); try { localStorage.setItem('karst.record', JSON.stringify(record)); } catch (e) {} }
let runTime = 0;
function endScreen(title, sub, go) {
  running = false; saveRecord();
  delete cave.run; saveCave();
  const t = Math.round(runTime);
  $('ov-title').textContent = title; $('ov-sub').textContent = sub;
  $('ov-body').innerHTML = `<b>${player.dist.toFixed(0)} m</b> walked &nbsp;·&nbsp; deepest <b>${player.maxDepth.toFixed(0)} m</b> &nbsp;·&nbsp; <b>${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}</b><br>${player.marks} chalk marks &nbsp;·&nbsp; seed ${SEED}`;
  $('ov-rec').textContent = `cave ${SEED} · attempt ${cave.attempts} · ${cave.deaths.length} dead in it · farthest ever ${record.best.toFixed(0)} m · escaped ${record.escapes}×`;
  $('go').innerHTML = go;
  overlay.classList.remove('hidden'); overlay.classList.add('over');
  notebookOpen = true; nb.style.display = 'block'; nb.classList.add('under'); drawNotebook();
  if (document.exitPointerLock) document.exitPointerLock();
}
function die(title, why, stat) {
  if (!player.alive) return; player.alive = false; record[stat]++;
  cave.deaths.push({ x: player.x, y: player.y, z: player.z, cause: stat, battery: player.battery, t: Date.now(), trail: player.trail.filter((p, i) => i % 3 === 0).slice(-700) });
  cave.marks.push(...runMarks); cave.places = (cave.places || []).concat(places.filter(p => !(cave.places || []).some(q => q.name === p.name))); saveCave();
  $('hurt').style.opacity = 0.9;
  setTimeout(() => endScreen(title, why, 'CLICK TO GO BACK DOWN &nbsp;·&nbsp; <span style="opacity:.6">N for a new cave</span>'), 1400);
}
function escape() {
  if (player.out) return; player.out = true; record.escapes++;
  cave.escaped = true; saveCave();
  $('flash').style.opacity = 1;
  setTimeout(() => endScreen('DAYLIGHT', 'you found the way out', 'CLICK FOR A NEW CAVE'), 2400);
}
function newCave() { location.href = location.pathname + '?seed=' + ((Math.random() * 1e9) | 0); }
function sameCave() { location.href = location.pathname + '?seed=' + SEED; }

// ---------- chalk ----------
const decalHelper = new THREE.Object3D();
const hint = $('hint'); let hintT = 0;
function showHint(t, long) { hint.textContent = t; hint.style.opacity = 1; hintT = long ? 5 : 2.5; }
// things you are told once, ever
let taught = {};
try { taught = JSON.parse(localStorage.getItem('karst.taught') || '{}'); } catch (e) {}
function teach(key, text) {
  if (taught[key]) return; taught[key] = 1;
  try { localStorage.setItem('karst.taught', JSON.stringify(taught)); } catch (e) {}
  showHint(text, true);
}
const viewDir = new THREE.Vector3();
async function placeMark(text) {
  try { await document.fonts.load('600 84px Caveat'); } catch (e) {}
  camera.getWorldDirection(viewDir);
  let hit = null;
  for (let t = 0.15; t < 2.6; t += 0.05) {
    const x = camera.position.x + viewDir.x * t, y = camera.position.y + viewDir.y * t, z = camera.position.z + viewDir.z * t;
    if (G.fieldAt(x, y, z) > -0.03) { hit = new THREE.Vector3(x, y, z); break; }
  }
  if (!hit) { showHint('no rock within reach'); return; }
  G.gradAt(hit.x, hit.y, hit.z);
  const g = G.G, gl = Math.hypot(g.x, g.y, g.z) || 1;
  const normal = new THREE.Vector3(-g.x / gl, -g.y / gl, -g.z / gl);
  drawMark(text, hit, normal, false);
  runMarks.push({ text, x: hit.x, y: hit.y, z: hit.z, nx: normal.x, ny: normal.y, nz: normal.z });
  player.marks++;
  sfx.play('scrape', { x: hit.x, y: hit.y, z: hit.z, vol: 0.25, rate: 1.6, vary: 0.2, dur: 0.5 });
}
// old: a mark from a previous attempt — faded, smudged
function drawMark(text, hit, normal, old) {
  const cw = 512, chh = 160, cv = document.createElement('canvas'); cv.width = cw; cv.height = chh;
  const ctx = cv.getContext('2d');
  let fs = 84; ctx.font = `600 ${fs}px Caveat`;
  let tw = ctx.measureText(text).width;
  if (tw > 480) { fs = Math.floor(fs * 480 / tw); ctx.font = `600 ${fs}px Caveat`; tw = ctx.measureText(text).width; }
  ctx.fillStyle = old ? '#cfc6b4' : '#f1ebdd'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, cw / 2, chh / 2);
  const img = ctx.getImageData(0, 0, cw, chh), d = img.data;
  for (let i = 3; i < d.length; i += 4) if (d[i]) d[i] = d[i] * (old ? 0.2 + 0.5 * Math.random() : 0.4 + 0.6 * Math.random());
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const w = clamp(0.2 + tw * 0.0034, 0.4, 1.8), hgt = w * chh / cw;
  decalHelper.position.copy(hit); decalHelper.lookAt(hit.clone().add(normal));
  const size = new THREE.Vector3(w, hgt, 0.5);
  let placed = false;
  const cx = Math.floor(hit.x / G.CHUNK), cy = Math.floor(hit.y / G.CHUNK), cz = Math.floor(hit.z / G.CHUNK);
  for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const ch = G.chunks.get(G.ckey(cx + dx, cy + dy, cz + dz));
    if (!ch || !ch.mesh) continue;
    if (ch.mesh.geometry.boundingSphere.distanceToPoint(hit) > w) continue;
    ch.mesh.updateMatrixWorld();
    const geo = new DecalGeometry(ch.mesh, hit, decalHelper.rotation, size);
    if (geo.attributes.position && geo.attributes.position.count > 0) { scene.add(new THREE.Mesh(geo, mat)); placed = true; }
  }
  if (!placed) {
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(w, hgt), mat);
    pl.position.copy(hit).addScaledVector(normal, 0.03); pl.quaternion.copy(decalHelper.quaternion); scene.add(pl);
  }
  return placed;
}

// ---------- sound hooks ----------
const sfx = new Sfx('sounds/out/');
applySettings();
const loops = {};
let soundsOn = false;
sfx.load().then(() => {
  soundsOn = true;
  for (const k of ['amb_cave', 'amb_grotto', 'amb_drone', 'amb_underwater', 'drips_cave', 'breath_calm', 'breath_scared', 'breath_labored', 'heartbeat'])
    loops[k] = sfx.loop(k, { hrtf: false });
  $('ov-snd').textContent = '';
}).catch(e => { console.warn(e); $('ov-snd').textContent = 'sound unavailable'; });
let open = 5, openT = 0, dripT = 2, rockT = rr(60, 160), nearWater = 0, fear = 0, gaspT = 0, lastPx = 0, lastPz = 0;
let voidLoop = null, voidT = 0;
let stillT = 0, presenceT = rr(40, 90), gustT = 0;
function updateSound(dt) {
  if (!soundsOn) return;
  camera.getWorldDirection(viewDir);
  sfx.setListener(camera.position.x, camera.position.y, camera.position.z, viewDir.x, viewDir.y, viewDir.z);
  sfx.setUnderwater(player.under);
  openT -= dt;
  if (openT <= 0) {
    openT = 0.45;
    open = G.openness(camera.position.x, camera.position.y, camera.position.z);
    sfx.setSpace(open);
    // is there water around here? (any wet segment in this cell)
    const list = G.cellSegs.get(G.ckey(Math.floor(player.x / G.CHUNK), Math.floor(player.y / G.CHUNK), Math.floor(player.z / G.CHUNK))) || [];
    nearWater = list.some(s => s.wl !== undefined) ? 1 : 0;
  }
  const u = player.under ? 1 : 0;
  const level = torchLevel(player.battery);
  fear = clamp(Math.max(level < 0.05 ? 0.8 : (1 - level) * 0.45, player.breath < 0.6 ? (1 - player.breath) * 0.9 : 0, eyes ? 0.55 : 0, player.hurt ? 0.3 : 0, stuck > 0 ? Math.min(1, 0.5 + stuckT * 0.1) : 0, batList.length ? 0.5 : 0), 0, 1);
  const set = (k, v) => loops[k] && loops[k].setVol(v, 0.6);
  set('amb_cave', (1 - u) * (0.45 + 0.5 * clamp((open - 2) / 10, 0, 1)));
  set('amb_grotto', (1 - u) * nearWater * 0.7);
  set('drips_cave', (1 - u) * nearWater * 0.5);
  set('amb_drone', (1 - u) * clamp((open - 9) / 10, 0, 1) * 0.8);
  set('amb_underwater', u * 0.9);
  const puff = 1 - player.stamina;
  set('breath_calm', (1 - u) * (player.hurt ? 0 : (0.35 + (player.h < 0.8 ? 0.35 : 0)) * (1 - fear) * (1 - puff)));
  set('breath_scared', (1 - u) * Math.max(fear, puff * 0.9, player.cold > 0.5 ? (player.cold - 0.5) * 1.2 : 0) * (player.hurt ? 0.5 : 1));
  set('breath_labored', (1 - u) * Math.max(player.hurt ? 0.7 : 0, player.foul ? 0.4 + (1 - player.breath) * 0.8 : 0));
  set('heartbeat', u * (0.35 + (1 - player.breath) * 0.8) + (1 - u) * fear * 0.35);
  if (loops.heartbeat) loops.heartbeat.setRate(0.9 + (1 - player.breath) * 0.6 + fear * 0.2, 1);
  // drips, somewhere on the ceiling nearby
  dripT -= dt;
  if (dripT <= 0) {
    dripT = rr(1.5, 6) / (nearWater ? 2.2 : 1);
    const list = G.cellSegs.get(G.ckey(Math.floor(player.x / G.CHUNK), Math.floor(player.y / G.CHUNK), Math.floor(player.z / G.CHUNK)));
    if (list && list.length) {
      const s = list[Math.floor(Math.random() * list.length)], t = Math.random();
      let x = s.fx + s.fdx * t, z = s.fz + s.fdz * t; const floor = s.y0 + (s.y1 - s.y0) * t;
      let y = s.wl !== undefined ? s.wl + 0.05 : floor + 0.05;
      const tips = s.spel.filter(c => !c.up);
      if (tips.length && Math.random() < 0.7) { const c = tips[Math.floor(Math.random() * tips.length)]; x = c.x; z = c.z; y = c.top - c.len; }
      sfx.play('drip', { x, y, z, vol: 0.5 + Math.random() * 0.4, vary: 0.25, wet: 0.9, rolloff: 0.8 });
    }
  }
  // the mountain settling, far off
  rockT -= dt;
  if (rockT <= 0) {
    rockT = rr(70, 200);
    const a = Math.random() * Math.PI * 2, d = rr(18, 40);
    sfx.play(Math.random() < 0.7 ? 'rockfall' : 'rumble', { x: player.x + Math.sin(a) * d, y: player.y + rr(-4, 6), z: player.z + Math.cos(a) * d, vol: 0.5, wet: 1, rolloff: 0.5 });
  }
  if (gaspT > 0) gaspT -= dt;
  // the presence: the longer you have been here, the less alone you are
  if (dread > 0.05 && running && player.alive && !player.out) {
    const moving = Math.hypot(player.x - lastPx, player.z - lastPz) > 0.02; lastPx = player.x; lastPz = player.z;
    stillT = moving ? 0 : stillT + dt;
    presenceT -= dt * (1 + dread) * (stillT > 4 ? 2 : 1) * (torchLevel(player.battery) < 0.3 ? 1.6 : 1);
    if (presenceT <= 0) {
      presenceT = rr(50, 140) / (0.5 + dread);
      camera.getWorldDirection(viewDir);
      const bx = player.x - viewDir.x * rr(5, 9), bz = player.z - viewDir.z * rr(5, 9);       // behind you
      const r = Math.random();
      if (r < 0.5) {                                                                           // footsteps that stop when you turn
        for (let k = 0; k < 3 + (Math.random() * 3 | 0); k++) setTimeout(() => sfx.play('step_rock', { x: bx + k * viewDir.x * 0.7, y: player.y, z: bz + k * viewDir.z * 0.7, vol: 0.28, wet: 0.8, rate: 0.9 }), k * 520);
      } else if (r < 0.8 || dread < 0.5) {                                                    // a pebble, a settling
        sfx.play('rockfall', { x: bx, y: player.y + 1, z: bz, vol: 0.3, wet: 0.9, rate: 1.2, dur: 1.2 });
      } else {                                                                                 // breath, close
        sfx.play('creature_breath', { x: player.x - viewDir.x * 1.2, y: player.y + 1.5, z: player.z - viewDir.z * 1.2, vol: 0.35, rolloff: 1.5, dur: 3 });
        if (dread > 0.6 && Math.random() < 0.5) gustT = 1.6;                                   // and the torch dips
      }
    }
  }
  if (gustT > 0) gustT -= dt;
  // daylight, heard before it is seen
  if (exitInfo) {
    if (!exitLoops) exitLoops = { wind: sfx.loop('wind', { x: exitInfo.x, y: exitInfo.y + 2, z: exitInfo.z, rolloff: 0.35, wet: 0.3 }), birds: sfx.loop('birds', { x: exitInfo.x + exitInfo.dx * 4, y: exitInfo.y + 3, z: exitInfo.z + exitInfo.dz * 4, rolloff: 0.6 }) };
    const d = Math.hypot(exitInfo.x - player.x, exitInfo.y - player.y, exitInfo.z - player.z);
    const near = clamp(1 - d / 70, 0, 1);
    if (exitLoops.wind) exitLoops.wind.setVol((1 - u) * (0.2 + 0.8 * near) * (player.out ? 1.6 : 1), 1);
    if (exitLoops.birds) exitLoops.birds.setVol((1 - u) * (near > 0.3 ? (near - 0.3) * 1.2 : 0) * (player.out ? 1.5 : 1), 1);
  }
  // a pit nearby: the air moves, and it sounds like it comes from below
  voidT -= dt;
  if (voidT <= 0) {
    voidT = 0.5;
    let best = null, bd = 14;
    for (const v of G.voids) { const d = Math.hypot(v.x - player.x, v.top - player.y, v.z - player.z); if (d < bd && player.y > v.y + 1) { bd = d; best = v; } }
    if (best) {
      if (!voidLoop) voidLoop = sfx.loop('rumble', { x: best.x, y: best.y + 1, z: best.z, rolloff: 0.6, wet: 0.8 });
      if (bd < 8) teach('pit', 'hear that? the air moves where the floor doesn’t. look down before you step');
      voidLoop.setPos(best.x, best.y + 1, best.z);
      voidLoop.setVol(0.55 * clamp(1 - bd / 14, 0, 1) * (1 - u), 0.5);
    } else if (voidLoop) voidLoop.setVol(0, 0.5);
  }
}
function footstep(kind) {
  if (!soundsOn) return;
  const o = { x: player.x, y: player.y, z: player.z, wet: 0.5, vary: 0.15, hrtf: false };
  if (kind === 'wade') sfx.play('wade', { ...o, vol: 0.7 });
  else if (kind === 'puddle') sfx.play('splash_small', { ...o, vol: 0.5, rate: 1.2 });
  else if (kind === 'swim') sfx.play('stroke', { ...o, vol: 0.45 });
  else if (kind === 'crawl') sfx.play(Math.random() < 0.5 ? 'drag' : 'scrape', { ...o, vol: 0.45, rate: 0.9 });
  else sfx.play(Math.random() < 0.3 ? 'step_gravel' : 'step_rock', { ...o, vol: kind === 'crouch' ? 0.35 : 0.55 });
  for (const b of bonePiles) {
    if (Math.hypot(b.x - player.x, b.z - player.z) < b.r && Math.abs(b.y - player.y) < 2 && b.crunched < performance.now() - 4000) {
      b.crunched = performance.now(); sfx.play('bone_crunch', { ...o, vol: 0.6 });
      teach('bones', 'bones. someone came this way. their pack, if it’s here, is worth a look — and T writes on the wall');
    }
  }
}

// ---------- player ----------
let duckT = 0, duckLevel = 0, duckHold = 0, bubbleT = 2, ropeHintT = 0, blockedT = 0;
let foulT = 0;
let stuck = 0, stuckSide = 0, stuckT = 0, wiggles = 0, coldT = 0, coldDropped = false;                      // stuck > 0: wedged, that many wiggles still needed
function updatePlayer(dt) {
  if (!G.chunkReadyAt(player.x, player.y + 0.3, player.z)) { G.focus.x = player.x; G.focus.y = player.y; G.focus.z = player.z; return; }
  if (roping) {
    updateRoping(dt);
    camera.position.set(player.x, player.y + player.h - 0.1, player.z); camera.rotation.set(player.pitch, player.yaw, 0);
    G.focus.x = player.x; G.focus.y = player.y; G.focus.z = player.z; return;
  }
  const still = notebookOpen || stuck > 0;                    // you stop walking to write; or the rock has you
  const f = !still && (keys.KeyW || keys.ArrowUp) ? 1 : 0, b = !still && (keys.KeyS || keys.ArrowDown) ? 1 : 0;
  const l = !still && (keys.KeyA || keys.ArrowLeft) ? 1 : 0, r = !still && (keys.KeyD || keys.ArrowRight) ? 1 : 0;
  if (stuck > 0) {                                            // wiggle: alternate A and D to work yourself loose
    const side = keys.KeyA || keys.ArrowLeft ? -1 : keys.KeyD || keys.ArrowRight ? 1 : 0;
    if (side !== 0 && side !== stuckSide) { stuckSide = side; stuck--; wiggles++; sfx.play('scrape', { x: player.x, y: player.y + 0.3, z: player.z, vol: 0.5, rate: 1.3, vary: 0.3, dur: 0.5, hrtf: false }); camera.rotation.z += side * 0.05;
      if (stuck === 0) { showHint('free'); sfx.play('gasp', { vol: 0.7 }); } }
    stuckT += dt;
  }
  const crouchKey = keys.KeyC || keys.ControlLeft;
  const sprintKey = keys.ShiftLeft || keys.ShiftRight;
  let mx = r - l, mz = f - b; const ml = Math.hypot(mx, mz); if (ml > 0) { mx /= ml; mz /= ml; }
  const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
  const px0 = player.x, py0 = player.y, pz0 = player.z;
  const wasSwim = player.swim, wasUnder = player.under;

  player.wl = G.waterLevelAt(player.x, player.y + 0.3, player.z);
  const depthW = player.wl - player.y;
  if (!player.swim && depthW > 0.6) player.swim = true;
  if (player.swim && depthW < 0.35) player.swim = false;

  let clear = clearanceAbove();
  if (ml > 0 && !player.swim) {                                  // duck for a low ceiling before you hit the lip
    for (const ahead of [0.55, 1.1]) {
      const ax = player.x + (-sy * mz + cy * mx) * ahead, az = player.z + (-cy * mz - sy * mx) * ahead;
      if (G.fieldAt(ax, player.y + 0.5, az) >= -0.22) continue;
      let lo = 0.5, hi = 0.5;                                       // floor and ceiling at that spot, relative to my feet
      while (lo > -0.8 && G.fieldAt(ax, player.y + lo, az) < -0.22) lo -= 0.1;
      while (hi < 2.3 && G.fieldAt(ax, player.y + hi, az) < -0.22) hi += 0.1;
      clear = Math.min(clear, hi - lo + (ahead > 0.6 ? 0.15 : 0));
    }
  }
  let want = player.swim ? 0.62 : crouchKey ? H_CROUCH : H_STAND;
  if (duckT > 0) { duckT -= dt; want = Math.min(want, duckLevel >= 2 ? H_PRONE : H_CROUCH); }
  const target = clamp(Math.min(want, clear - 0.06), H_PRONE, H_STAND);
  player.h += clamp(target - player.h, -5 * dt, 5 * dt);
  const eyeY = player.y + player.h - 0.1;
  player.under = player.wl > eyeY;
  const stance = player.h > 1.4 ? 1 : player.h > 0.8 ? 0.55 : 0.3;
  if (stance < 1 && !player.swim) teach('low', 'low ceiling — you duck on your own. lower still and you crawl. hold C to stay down');
  if (player.swim) teach('swim', 'chest deep: you’re swimming. look down + W or C to dive. space to surface. watch your breath');
  if (player.under) teach('under', 'under. the bar at the top is your breath. turn back at half if you can’t see air');
  if (player.battery < 0.3) teach('torch', 'the torch is dying. tap F to shake it — you’re blind while you do');
  if (player.hurt) teach('hurt', 'something is broken. you’re slower now, and a second fall will finish you');
  if (player.cold > 0.6) teach('cold', 'you’re cold. keep moving to warm up. too long and your hands stop working');
  player.sprint = sprintKey && ml > 0 && stance === 1 && !player.swim && player.stamina > 0.05 && !player.hurt;
  if (player.sprint) player.stamina = Math.max(0, player.stamina - dt / 7); else player.stamina = Math.min(1, player.stamina + dt / (12 * (1 + player.cold)));
  // water is cold; you warm up slowly, faster when moving
  if (player.swim || depthW > 0.3) player.cold = Math.min(1, player.cold + dt / (player.under ? 14 : 25)); else player.cold = Math.max(0, player.cold - dt / (ml > 0 ? 45 : 80));
  if (player.cold > 0.95) {
    coldT += dt;
    if (coldT > 40 && torchHeld && !coldDropped) { coldDropped = true; dropTorch(); showHint('your hands are shaking too hard to hold it'); }
    if (coldT > 110) die('THE COLD', 'you stopped shivering. that was the end of it', 'froze');
  } else coldT = Math.max(0, coldT - dt * 0.5);
  let speed = 3.3 * stance * (player.hurt ? 0.7 : 1) * (player.sprint ? 1.7 : 1);
  let stepKind = stance === 1 ? 'walk' : stance > 0.4 ? 'crouch' : 'crawl';

  if (player.swim) {
    const cp = Math.cos(player.pitch), sp = Math.sin(player.pitch);
    let dx = -sy * cp * mz + cy * mx, dz = -cy * cp * mz - sy * mx, dy = sp * mz;
    if (!player.under && dy > 0) dy = 0;
    speed = 2.0 * (player.hurt ? 0.8 : 1); stepKind = 'swim';
    let vyT;
    if (keys.Space) vyT = 1.4; else if (crouchKey) vyT = -1.4;
    else if (Math.abs(dy) > 0.05) vyT = dy * speed;
    else vyT = clamp((player.wl + 0.12 - (player.h - 0.1) - player.y) * 2.5, -1, 1);
    player.vy += (vyT - player.vy) * Math.min(1, dt * 5);
    player.x += dx * speed * dt; player.z += dz * speed * dt; player.y += player.vy * dt;
    collide(); player.grounded = false; player.airT = 0;
  } else {
    const wx = -sy * mz + cy * mx, wz = -cy * mz - sy * mx;
    if (depthW > 0.25) { speed *= 0.55; stepKind = 'wade'; } else if (depthW > 0.02) stepKind = 'puddle';
    if (keys.Space && player.grounded && player.h > 1.4 && !player.hurt) { player.vy = 4.0; player.grounded = false; }
    player.vy = Math.max(player.vy - GRAV * dt, -25);
    const wasGrounded = player.grounded, preVy = player.vy;
    player.x += wx * speed * dt; player.z += wz * speed * dt; player.y += player.vy * dt;
    collide();
    // falling
    if (!player.grounded) {
      player.airT += dt;
      if (player.airT > 0.7 && !player.whooshed) { player.whooshed = true; sfx.play('whoosh', { vol: 0.6, rate: 0.9 }); }
    } else if (player.airT > 0) {
      const hEq = preVy * preVy / (2 * GRAV);
      const soft = depthW > 1.4;
      if (hEq > 7 && !soft) { sfx.play('body_fall', { vol: 1 }); die('THE FLOOR WASN\'T THERE', `a drop of ${hEq.toFixed(0)} metres, in the dark`, 'fell'); }
      else if (hEq > 3.5 && !soft) {
        sfx.play('body_fall', { vol: 0.9 }); sfx.play('gasping', { vol: 0.7 });
        if (player.hurt) die('THE SECOND FALL', 'something gave way, then you did', 'fell');
        else {
          player.hurt = true; $('hurt').style.opacity = 0.7; setTimeout(() => { $('hurt').style.opacity = 0; }, 900);
          if (torchHeld && Math.random() < 0.45) dropTorch(); else showHint('something is broken');
        }
      } else if (hEq > 1.2) sfx.play(soft ? 'splash' : 'body_fall', { vol: soft ? 0.8 : 0.4 });
      player.airT = 0; player.whooshed = false;
    }
    // blocked by a ledge? step or mantle up to ~0.85 m (also when wedged against it, not just when grounded)
    const tried = speed * dt;
    if (ml > 0 && (wasGrounded || Math.abs(preVy) < 2) && Math.hypot(player.x - px0, player.z - pz0) < tried * 0.5) {
      let done = false;
      for (const sh of [0.2, 0.35, 0.5, 0.65, 0.85, 1.05]) {
        if (sh > 0.5 && (player.h < 0.8 || player.hurt)) break;             // no mantling on your belly or with a broken arm
        const hh = sh > 0.6 ? Math.min(player.h, H_CROUCH) : player.h;       // you come up over a high ledge crouched
        const top = Math.max(hh - PR, PR);
        for (const fwd of [0.14, 0.45]) {
          const tx = px0 + wx * fwd, tz = pz0 + wz * fwd;
          if (G.fieldAt(tx, py0 + sh + PR, tz) < -0.22 && G.fieldAt(tx, py0 + sh + top, tz) < -0.22 &&
              G.fieldAt(tx, py0 + sh + 0.05, tz) > -0.6) {                      // and there is actually a floor there
            player.x = tx; player.z = tz; player.y = py0 + sh; player.vy = 0; if (hh < player.h) player.h = hh;
            collide(); done = true; break;
          }
        }
        if (done) break;
      }
      // still blocked, and there is air low down ahead: it's a lip, not a wall — get lower and try again
      if (!done) {
        const ax = px0 + wx * 0.6, az = pz0 + wz * 0.6, lx = -wz, lz = wx;
        // is there air low ahead? look a little to either side too — the crawl core is only 0.34 m wide
        let lowF = 1; for (const o of [0, -0.18, 0.18]) lowF = Math.min(lowF, G.fieldAt(ax + lx * o, py0 + 0.3, az + lz * o), G.fieldAt(ax + lx * o, py0 + 0.5, az + lz * o));
        const lowAir = lowF < -0.16;
        // on your belly and jammed: feel for the line — shift toward the more open side
        if (player.h <= 0.6) {
          const fl = G.fieldAt(px0 + wx * 0.3 - lx * 0.15, py0 + 0.28, pz0 + wz * 0.3 - lz * 0.15), fr = G.fieldAt(px0 + wx * 0.3 + lx * 0.15, py0 + 0.28, pz0 + wz * 0.3 + lz * 0.15);
          const side = fr < fl - 0.02 ? 1 : fl < fr - 0.02 ? -1 : 0;
          if (side) { player.x += lx * side * 0.35 * dt; player.z += lz * side * 0.35 * dt; collide(); }
        }
        blockedT += dt;
        if (lowAir && blockedT < 2.5) { duckT = 0.6; if (duckHold <= 0) { duckLevel = Math.min(duckLevel + 1, 2); duckHold = 0.35; } }
        else if (blockedT >= 2.5) { duckLevel = 0; duckT = 0; }                   // ducking didn't help: it's a wall
      }
    } else { if (duckT <= 0) duckLevel = 0; blockedT = 0; }
    duckHold -= dt;
  }
  if (player.y < -400) { player.x = 0; player.y = 0; player.z = 0; player.vy = 0; }

  // the current: moving water takes you with it — a little when wading, all of it when swimming
  player.flow = depthW > 0.2 ? G.flowAt(player.x, player.y + 0.3, player.z) : null;
  if (player.flow) {
    const f = player.flow, k = player.swim ? 1 : clamp((depthW - 0.2) / 0.5, 0.15, 0.8);
    player.x += f.x * f.s * k * dt; player.z += f.z * f.s * k * dt; collide();
    if (f.s > 1.15) teach('current', 'the water is pulling. it goes somewhere — under, probably. upstream is still possible from here');
    else if (f.s > 0.4 && (player.swim || depthW > 0.3)) teach('stream', 'the water is moving. it has to go somewhere; that is not always good news');
  }

  // water transitions
  const wy = Number.isFinite(player.wl) ? player.wl : player.y + 0.3;
  if (player.swim && !wasSwim) sfx.play('splash', { x: player.x, y: wy, z: player.z, vol: 0.8, wet: 0.6 });
  if (player.under && !wasUnder) { sfx.play('bubbles', { vol: 0.5, rate: 1.1, dur: 1.2 }); player.underT = 0; }
  if (!player.under && wasUnder) {
    sfx.play('splash_small', { x: player.x, y: wy, z: player.z, vol: 0.7 });
    if (player.underT > 2.5 && gaspT <= 0) { sfx.play(player.breath < 0.4 ? 'gasping' : 'gasp', { vol: 0.8 }); gaspT = 3; }
  }
  if (player.under) { player.underT += dt; bubbleT -= dt; if (bubbleT <= 0) { bubbleT = rr(2.5, 5); sfx.play('bubbles', { vol: 0.25, rate: rr(0.9, 1.2), dur: 1.0 }); } }

  // breath — and bad air: some dead ends have none worth breathing
  player.foul = !player.under && G.foulAt(player.x, player.y + 0.5, player.z);
  if (player.under) player.breath -= dt / BREATH_S;
  else if (player.foul) { player.breath -= dt / (BREATH_S * 3.2); foulT += dt; if (foulT > 4) teach('foul', 'the air is thick and your head hurts. this pocket has no air in it. back out'); }
  else { player.breath = Math.min(1, player.breath + dt / (foulT > 0 ? 12 : 4)); foulT = 0; }
  if (player.breath <= 0) { player.breath = 0; if (player.foul) die('BAD AIR', 'you sat down for a moment. the air in that pocket had nothing in it', 'foul'); else die('DROWNED', 'the water took you', 'drowned'); }

  const moved = Math.hypot(player.x - px0, player.z - pz0);
  player.dist += moved;
  ropeHintT -= dt;
  if (ropeHintT <= 0) { ropeHintT = 1.5; const v = nearestVoid(); if (v && player.grounded) showHint(player.rope > 0 ? 'a drop. E to rig the rope' : 'a drop. no rope'); }
  if (stuck === 0 && player.h <= 0.52 && ml > 0 && moved > 0 && !player.swim && clear < 0.62 && Math.random() < dt * 0.06) {
    stuck = 5 + (Math.random() * 4 | 0); stuckSide = 0; stuckT = 0;
    showHint('stuck. wiggle — A, D, A, D', true); sfx.play('scrape', { vol: 0.7, rate: 0.7, dur: 1.2 }); sfx.play('gasp', { vol: 0.5, rate: 0.9 });
  }
  const lt = player.lastTrail;
  if (!lt || Math.hypot(player.x - lt.x, player.z - lt.z) > 0.7 || Math.abs(player.y - lt.y) > 0.7) {
    const pt = { x: +player.x.toFixed(1), y: +player.y.toFixed(1), z: +player.z.toFixed(1), k: player.under ? 2 : player.swim || depthW > 0.25 ? 1 : player.h < 0.8 ? 3 : 0 };
    player.trail.push(pt); player.lastTrail = pt;
  }
  for (const c of caches) {
    if (!c.taken && Math.hypot(c.x - player.x, c.z - player.z) < 0.9 && Math.abs(c.y - player.y) < 1.4) {
      c.taken = true; scene.remove(c.mesh); scene.remove(c.tag);
      if (c.kind === 'battery') { player.battery = Math.min(1, player.battery + 0.4); showHint('a dead caver\'s spare cells. +40%'); }
      else if (c.kind === 'rope') { player.rope++; showHint('a coil of rope. E at a drop to rig it'); }
      else if (c.kind === 'cells') { player.cells = true; player.battery = Math.min(1, player.battery + 0.2); showHint('lithium cells. the torch will last longer now'); }
      else if (c.kind === 'page') { const pg = { key: `${c.x.toFixed(0)},${c.z.toFixed(0)}`, text: c.text, x: c.x, z: c.z }; player.pages.push(pg); cave.pages = (cave.pages || []).concat([pg]); saveCave(); showHint(`a page from someone\u2019s log: \u201c${c.text}\u201d`, true); hintT = 9; sfx.play('scrape', { vol: 0.2, rate: 2.5, dur: 0.4 }); continue; }
      else { player.sticks += 2; showHint(`two glowsticks in the pack · ${player.sticks} now`); }
      sfx.play('rattle', { vol: 0.5, rate: 0.7 }); sfx.play('torch_click', { vol: 0.4 });
    }
  }
  dropT -= dt;
  if (!torchHeld && dropT <= 0 && Math.hypot(torch.position.x - player.x, torch.position.z - player.z) < 0.8 && Math.abs(torch.position.y - player.y) < 1.4) {
    torchHeld = true; hand.visible = true; torchM.classList.remove('gone');
    hand.userData.torchModel.position.copy(hand.position); hand.userData.torchModel.rotation.copy(hand.rotation);
    sfx.play('torch_click', { vol: 0.7 }); showHint('got it');
  }
  for (const r of remains) {
    if (!r.taken && Math.hypot(r.x - player.x, r.z - player.z) < 1.0 && Math.abs(r.y - player.y) < 1.5) {
      r.taken = true; scene.remove(r.light); scene.remove(r.lens);
      player.battery = Math.min(1, player.battery + 0.25);
      showHint(`your own torch. still ${(r.battery * 100).toFixed(0)}% when you ${r.cause === 'drowned' ? 'drowned' : r.cause === 'froze' ? 'froze' : r.cause === 'crushed' ? 'were buried' : r.cause === 'foul' ? 'stopped breathing' : 'fell'}. +25%`);
      sfx.play('torch_click', { vol: 0.6 }); sfx.play('bones_rattle', { x: r.x, y: r.y, z: r.z, vol: 0.4, rate: 0.9 });
    }
  }
  player.maxDepth = Math.max(player.maxDepth, -player.y);
  if (exitInfo && Math.hypot(player.x - exitInfo.x, player.y - exitInfo.y, player.z - exitInfo.z) < 5) escape();

  // head bob + footsteps
  const moving = ml > 0 && (player.grounded || player.swim);
  player.bob += dt * (moving ? speed * 2.6 : 0);
  const phase = Math.floor(player.bob / (stepKind === 'swim' ? Math.PI * 2 : Math.PI));
  if (phase !== player.stepPhase) { player.stepPhase = phase; if (moving) footstep(stepKind); }
  const bobA = moving ? (player.swim ? 0.02 : 0.028 * stance) : 0;
  const limp = player.hurt ? Math.sin(player.bob * 0.5) * 0.02 : 0;
  const shiver = player.cold > 0.35 ? (player.cold - 0.35) * 0.012 * Math.sin(performance.now() * 0.041) * Math.sin(performance.now() * 0.0173) : 0;
  camera.position.set(player.x + Math.cos(player.bob * 0.5) * bobA * 0.6, player.y + player.h - 0.1 + Math.sin(player.bob) * bobA, player.z);
  camera.rotation.set(player.pitch + shiver, player.yaw + shiver * 0.7, Math.sin(player.bob * 0.5) * bobA * 0.35 + limp + shiver);
  camera.fov += (lerp(58, 75, (player.h - 0.5) / 1.22) - camera.fov) * Math.min(1, dt * 6);
  camera.updateProjectionMatrix();
  G.focus.x = player.x; G.focus.y = player.y; G.focus.z = player.z;
}

// ---------- torch ----------
let adapt = 1, shakeT = 0, lastShake = 0, buzzT = 0, dropT = 0;
const _fwd = new THREE.Vector3(), _dropE = new THREE.Euler();
function dropTorch() {
  torchHeld = false; hand.visible = false; torchM.classList.add('gone'); dropT = 1.5;
  hand.userData.torchModel.position.set(0.16, -0.14, 0.02); hand.userData.torchModel.rotation.set(0, 0, 0);   // lies where the light comes from
  camera.getWorldDirection(_fwd);
  const a = Math.random() * Math.PI * 2, d = 1.3 + Math.random() * 1.4;
  let x = player.x + _fwd.x * 0.6 + Math.sin(a) * d, z = player.z + _fwd.z * 0.6 + Math.cos(a) * d;
  for (let k = 0; k < 6 && G.fieldAt(x, player.y + 0.3, z) > -0.2; k++) { const a2 = Math.random() * Math.PI * 2, d2 = 0.8 + Math.random() * 1.2; x = player.x + Math.sin(a2) * d2; z = player.z + Math.cos(a2) * d2; }
  if (G.fieldAt(x, player.y + 0.3, z) > -0.2) { x = player.x; z = player.z; }                // don't throw it into the rock
  const fy = floorBelow(x, player.y + 0.5, z);
  torch.position.set(x, (fy === null ? player.y : fy) + 0.22, z);            // the light and the model sit 0.14 below the rig
  _dropE.set(rr(-0.25, 0.05), Math.random() * Math.PI * 2, rr(-0.3, 0.3)); torch.quaternion.setFromEuler(_dropE);
  shakeT = 0;
  sfx.play('torch_click', { x, y: torch.position.y, z, vol: 0.8 }); sfx.play('rattle', { x, y: torch.position.y, z, vol: 0.6, rate: 0.8 });
  showHint('the torch is not in your hand');
}
const shakeQ = new THREE.Quaternion(), shakeE = new THREE.Euler();
function shakeTorch() {
  if (!torchHeld) { showHint('you are not holding it'); return; }
  const now = performance.now(); if (now - lastShake < 100) return; lastShake = now;
  player.battery = Math.min(1, player.battery + 0.025 * (player.battery > 0.6 ? 0.5 : 1));
  shakeT = 0.22;
  shakeE.set(rr(-0.4, 0.4), rr(-0.4, 0.4), rr(-0.5, 0.5)); shakeQ.setFromEuler(shakeE);
  torch.quaternion.multiply(shakeQ);
  sfx.play('rattle', { vol: 0.5, vary: 0.2 });
  if (Math.random() < 0.25) sfx.play('torch_click', { vol: 0.3 });
}
function torchLevel(b) {
  if (b <= 0) return 0;
  return b < 0.3 ? Math.pow(b / 0.3, 1.6) * 0.5 : b < 0.5 ? 0.5 + (b - 0.3) / 0.2 * 0.3 : 0.8 + (b - 0.5) / 0.5 * 0.2;
}
let stutter = 1;
function updateTorch(dt) {
  if (running && player.alive && !player.out) player.battery = Math.max(0, player.battery - dt / (BATTERY_S * (player.cells ? 1.6 : 1)));
  if (torchHeld) {
    torch.position.copy(camera.position);
    const a = 1 - Math.pow(shakeT > 0 ? 0.05 : 0.0005, dt);
    torch.quaternion.slerp(camera.quaternion, a);
  }
  shakeT -= dt;
  bounce.position.copy(camera.position);
  camera.getWorldDirection(viewDir);
  let ahead = 3;
  for (let t = 0.2; t < 3; t += 0.2) {
    if (G.fieldAt(camera.position.x + viewDir.x * t, camera.position.y + viewDir.y * t, camera.position.z + viewDir.z * t) > -0.05) { ahead = t; break; }
  }
  adapt += (clamp(0.15 + ahead / 2.4, 0.2, 1) - adapt) * Math.min(1, dt * 3);
  const t = performance.now() * 0.001;
  let level = torchLevel(player.battery);
  // a dying torch stutters; while you shake it the contact is broken and you're in the dark
  if (player.battery < 0.3 && Math.random() < (0.3 - player.battery) * 0.3) { stutter = 0.15; if (buzzT <= 0) { sfx.play('bulb_buzz', { vol: 0.35, offset: Math.random() * 3, dur: 0.6 }); buzzT = 1.5; } }
  stutter += (1 - stutter) * Math.min(1, dt * 12); buzzT -= dt;
  if (gustT > 0) stutter = Math.min(stutter, 0.1 + 0.4 * Math.random());
  level *= stutter * (shakeT > 0 ? 0.12 : 1) * (player.under ? 0.7 : 1);
  spot.intensity = 12 * (torchHeld ? adapt : 1) * level * (0.96 + 0.04 * Math.sin(t * 13.7) * Math.sin(t * 3.1));
  bounce.intensity = torchHeld ? 0.9 * adapt * level : 0;
  bounce.position.copy(torchHeld ? camera.position : torch.position);
  hand.userData.lens.material.emissiveIntensity = 2.5 * level;
  updateMotes(dt, level * (0.5 + 0.5 * adapt));
  if (player.under) { scene.fog.color.copy(FOG_WATER); scene.fog.density = 0.15; $('water').style.opacity = 1; }
  else { scene.fog.color.copy(FOG_AIR); scene.fog.density = 0.048; $('water').style.opacity = 0; }
  waterGroup.position.y = Math.sin(t * 1.1) * 0.012;
  for (const r of remains) if (!r.taken) r.light.intensity = 0.18 + 0.1 * Math.sin(t * 7 + r.x) * Math.sin(t * 2.3);
}

// ---------- something crosses the passage ----------
// the beam finds it low on the floor, looking back at you; then it goes, across and into the wall
let crosser = null, crosserT = rr(120, 260);
const crosserMesh = new THREE.Group(), crosserEyes = [];
{
  const dark = new THREE.MeshStandardMaterial({ color: 0x1d1814, roughness: 1 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.3), dark); body.position.y = 0.42;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.2, 0.22), dark); head.position.set(0.55, 0.38, 0); head.name = 'head';
  crosserMesh.add(body, head);
  const shine = new THREE.MeshBasicMaterial({ color: 0xd8ff9c, fog: false });
  for (const sz of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 5), shine); e.position.set(0.14, 0.03, sz * 0.075); e.scale.y = 0.75; head.add(e); crosserEyes.push(e); }
  for (let i = 0; i < 4; i++) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.4, 0.07), dark); leg.position.set(i < 2 ? 0.3 : -0.3, 0.2, i % 2 ? 0.1 : -0.1); leg.userData.i = i; crosserMesh.add(leg); }
  crosserMesh.visible = false; scene.add(crosserMesh);
}
function spawnCrosser() {
  camera.getWorldDirection(viewDir);
  for (let tries = 0; tries < 24; tries++) {
    const d = 5.5 + Math.random() * 4, cx = camera.position.x + viewDir.x * d, cz = camera.position.z + viewDir.z * d;
    const fy = floorBelow(cx, camera.position.y + 1, cz); if (fy === null || fy > camera.position.y + 0.5 || fy < camera.position.y - 4) continue;
    if (G.rayToRock(camera.position.x, camera.position.y, camera.position.z, viewDir.x, 0, viewDir.z, d, 0.3) < d - 0.5) continue;
    const lx = -viewDir.z, lz = viewDir.x;
    const l = G.rayToRock(cx, fy + 0.4, cz, lx, 0, lz, 5, 0.2), r = G.rayToRock(cx, fy + 0.4, cz, -lx, 0, -lz, 5, 0.2);
    if (l < 1.0 && r < 1.0) continue;
    const toL = l >= r, run = toL ? l : r, sx = toL ? lx : -lx, sz = toL ? lz : -lz;
    crosser = { x0: cx, z0: cz, x1: cx + sx * (run - 0.3), z1: cz + sz * (run - 0.3), y: fy, t: 0, hold: 0.5 + Math.random() * 0.6, dur: 0.35 + run * 0.12,
                faceX: camera.position.x - cx, faceZ: camera.position.z - cz };
    crosserMesh.visible = true; crosserMesh.position.set(cx, fy, cz);
    crosserMesh.rotation.y = Math.atan2(crosser.faceX, crosser.faceZ) - Math.PI / 2;      // head toward you
    for (const e of crosserEyes) e.visible = true;
    return;
  }
}
function updateCrosser(dt) {
  if (!crosser) {
    if (dread > 0.35 && running && player.alive && !player.out) { crosserT -= dt * (1 + dread); if (crosserT <= 0) { spawnCrosser(); crosserT = rr(150, 360) / (0.5 + dread); } }
    return;
  }
  crosser.t += dt;
  if (crosser.t < crosser.hold) {                                   // frozen, eyeshine on the beam
    for (const e of crosserEyes) e.visible = torchHeld && torchLevel() > 0.05;
    return;
  }
  if (!crosser.gone) {
    crosser.gone = true; for (const e of crosserEyes) e.visible = false;
    crosserMesh.rotation.y = Math.atan2(crosser.x1 - crosser.x0, crosser.z1 - crosser.z0) - Math.PI / 2;
    for (let k = 0; k < 5; k++) setTimeout(() => sfx.play('step_rock', { x: crosser ? crosserMesh.position.x : crosser.x0, y: crosser.y, z: crosser ? crosserMesh.position.z : crosser.z0, vol: 0.5, rate: 1.5, vary: 0.25, wet: 0.7 }), k * 90);
    setTimeout(() => sfx.play('rockfall', { x: crosser.x1, y: crosser.y, z: crosser.z1, vol: 0.28, rate: 1.3, dur: 1.0, wet: 0.8 }), 450);
  }
  const k = Math.min(1, (crosser.t - crosser.hold) / crosser.dur);
  crosserMesh.position.set(crosser.x0 + (crosser.x1 - crosser.x0) * k, crosser.y, crosser.z0 + (crosser.z1 - crosser.z0) * k);
  for (const c of crosserMesh.children) if (c.userData.i !== undefined) c.rotation.z = Math.sin(crosser.t * 42 + c.userData.i * 1.6) * 0.7;
  if (k >= 1) { crosser = null; crosserMesh.visible = false; }
}
// ---------- loose rock: the roof is not all attached ----------
const looseGeo = new THREE.DodecahedronGeometry(1, 0), looseMat = new THREE.MeshStandardMaterial({ color: 0x8a7d6c, roughness: 0.95, flatShading: true });
const loose = [];
function placeLoose(p) {
  const key = `${p.x.toFixed(0)},${p.z.toFixed(0)}`, fallen = (cave.fallen || []).includes(key);
  const m = new THREE.Mesh(looseGeo, looseMat); m.scale.setScalar(p.r); m.rotation.set(p.seed * 6, p.seed * 17, p.seed * 3);
  m.castShadow = true; m.receiveShadow = true; scene.add(m);
  const fy = floorBelow(p.x, p.floor + 1.5, p.z);
  const rest = (fy !== null ? fy : p.floor) + p.r * 0.55;
  m.position.set(p.x, fallen ? rest : p.y - p.r * 0.25, p.z);
  loose.push({ ...p, key, mesh: m, rest, strain: 0, state: fallen ? 'down' : 'hanging', t: 0, vy: 0 });
}
function updateLoose(dt) {
  for (const L of loose) {
    if (L.state === 'down') continue;
    const dx = player.x - L.x, dz = player.z - L.z, hd = Math.hypot(dx, dz);
    if (L.state === 'hanging') {
      if (hd > 4.5 || player.y > L.y) continue;
      const moving = Math.hypot(player.x - lastLooseX, player.z - lastLooseZ) > 0.01;
      const load = player.sprint ? 3.0 : moving ? 1.0 : 0.15;                          // running under it is what brings it down
      L.strain += dt * load * (1 - hd / 4.5);
      if (L.strain > L.patience) {
        L.state = 'warning'; L.t = 0;
        sfx.play('rattle', { x: L.x, y: L.y, z: L.z, vol: 0.9, rate: 0.85, wet: 0.7, rolloff: 0.5 });
        setTimeout(() => sfx.play('rockfall', { x: L.x, y: L.y, z: L.z, vol: 0.5, rate: 1.2, dur: 0.9, wet: 0.7 }), 350);
        teach('loose', 'something moved up there. do not stand under it');
      }
    } else if (L.state === 'warning') {
      L.t += dt; L.mesh.position.y = L.y - L.r * 0.25 - Math.sin(L.t * 40) * 0.02;
      if (L.t > 1.15) { L.state = 'falling'; L.vy = 0; }
    } else if (L.state === 'falling') {
      L.vy -= GRAV * dt; L.mesh.position.y += L.vy * dt; L.mesh.rotation.x += dt * 2.2; L.mesh.rotation.z += dt * 1.1;
      if (L.mesh.position.y <= L.rest) {
        L.mesh.position.y = L.rest; L.state = 'down';
        cave.fallen = (cave.fallen || []).concat([L.key]); saveCave();
        sfx.play('rockslide', { x: L.x, y: L.rest, z: L.z, vol: 1.0, wet: 0.9, rolloff: 0.35 });
        sfx.play('rumble', { x: L.x, y: L.rest, z: L.z, vol: 0.8, rate: 0.9, dur: 2.5, wet: 0.8, rolloff: 0.3 });
        const near = hd < L.r + 0.55, close = hd < L.r + 2.2;
        if (near && Math.abs(player.y - L.rest) < 2.2) {
          if (L.r > 0.7 || player.hurt) { sfx.play('body_fall', { vol: 1 }); die('THE ROOF CAME DOWN', `a block the size of a car, from ${(L.y - L.rest).toFixed(0)} metres up`, 'crushed'); }
          else { player.hurt = true; $('hurt').style.opacity = 0.8; setTimeout(() => { $('hurt').style.opacity = 0; }, 900); sfx.play('gasping', { vol: 0.8 }); showHint('it caught your leg. something is broken'); if (torchHeld && Math.random() < 0.5) dropTorch(); }
        } else if (close) { sfx.play('gasp', { vol: 0.7 }); showHint('that was close'); }
        for (let k = 0; k < 5; k++) setTimeout(() => sfx.play('rockfall', { x: L.x + rr(-2, 2), y: L.rest, z: L.z + rr(-2, 2), vol: 0.35, rate: rr(0.9, 1.3), dur: 0.8, wet: 0.7 }), 300 + k * 260);
      }
    }
  }
  lastLooseX = player.x; lastLooseZ = player.z;
}
let lastLooseX = 0, lastLooseZ = 0;

// ---------- the passage that closes behind you ----------
const collapsed = new Set(); let collapseT = 0; const unstableNear = [];
function updateCollapse(dt) {
  collapseT -= dt; if (collapseT > 0) return; collapseT = 0.4;
  if (cave.collapsed) for (const key of cave.collapsed) if (!collapsed.has(key)) { const n = G.nodes.find(q => q.unstable && `${q.x.toFixed(0)},${q.z.toFixed(0)}` === key); if (n && G.chunkReadyAt(n.x, n.y + 0.5, n.z)) { G.collapseAt(n); collapsed.add(key); } }
  for (const n of G.nodes) {
    if (!n.unstable) continue;
    const key = `${n.x.toFixed(0)},${n.z.toFixed(0)}`; if (collapsed.has(key)) continue;
    const d = Math.hypot(n.x - player.x, n.y - player.y, n.z - player.z);
    if (d < 1.4) n.passed = true;
    else if (n.passed && d > 3.5 && d < 9 && Math.hypot(player.x, player.z) > Math.hypot(n.x, n.z) + 1.5 && player.grounded) {
      // you are through, and farther in than it is: it comes down behind you
      collapsed.add(key); cave.collapsed = (cave.collapsed || []).concat([key]); saveCave();
      sfx.play('rattle', { x: n.x, y: n.y + 0.5, z: n.z, vol: 0.8, rate: 0.8, wet: 0.7, rolloff: 0.5 });
      setTimeout(() => { sfx.play('rockslide', { x: n.x, y: n.y + 0.5, z: n.z, vol: 1.0, wet: 0.9, rolloff: 0.3 }); sfx.play('rumble', { x: n.x, y: n.y + 0.5, z: n.z, vol: 0.9, rate: 0.8, dur: 3, wet: 0.8, rolloff: 0.3 }); G.collapseAt(n); }, 700);
      for (let k = 0; k < 6; k++) setTimeout(() => sfx.play('rockfall', { x: n.x + rr(-1.5, 1.5), y: n.y + 0.3, z: n.z + rr(-1.5, 1.5), vol: 0.4, rate: rr(0.8, 1.2), dur: 0.8, wet: 0.7 }), 900 + k * 220);
      setTimeout(() => { showHint('the roof came down behind you. that way is gone', true); sfx.play('gasp', { vol: 0.6 }); }, 1600);
    }
  }
}

// ---------- eyes ----------
let eyes = null, eyesT = rr(90, 200);
const eyeMat = new THREE.MeshBasicMaterial({ color: 0xd8ff9c, fog: false });
function spawnEyes() {
  camera.getWorldDirection(viewDir);
  const cands = G.nodes.length; let best = null;
  for (let tries = 0; tries < 160; tries++) {
    const n = G.nodes[Math.max(0, cands - 1 - Math.floor(Math.random() * Math.min(cands, 2000)))];
    if (!n || n.wl !== undefined || n.core === false) continue;
    const dx = n.x - camera.position.x, dz = n.z - camera.position.z, d = Math.hypot(dx, n.y - camera.position.y, dz);
    if (d < 7 || d > 28 || (best && d < best.d)) continue;
    if ((dx * viewDir.x + dz * viewDir.z) / Math.hypot(dx, dz) < 0.5) continue;
    const h = Math.random() < 0.6 ? 0.35 : 1.9, ey = n.y + h;
    // line of sight
    const vx = n.x - camera.position.x, vy = ey - camera.position.y, vz = n.z - camera.position.z, L = Math.hypot(vx, vy, vz);
    if (G.rayToRock(camera.position.x, camera.position.y, camera.position.z, vx / L, vy / L, vz / L, L - 0.3, 0.3) < L - 0.4) continue;
    best = { x: n.x, y: ey, z: n.z, d };
  }
  if (!best) return;
  const grp = new THREE.Group(); grp.position.set(best.x, best.y, best.z); grp.lookAt(camera.position);
  for (const s of [-0.055, 0.055]) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), eyeMat); m.position.x = s; m.scale.y = 0.75; grp.add(m); }
  scene.add(grp);
  eyes = { grp, t: rr(3, 8), blink: rr(0.8, 2.5), x: best.x, y: best.y, z: best.z };
  sfx.play('creature_breath', { x: best.x, y: best.y, z: best.z, vol: 0.5, wet: 0.7, rolloff: 0.6 });
}
function updateEyes(dt) {
  if (!eyes) {
    eyesT -= dt * (torchLevel(player.battery) < 0.3 ? 2.5 : 1) * (1 + dread * 2);
    if (eyesT <= 0 && running) { spawnEyes(); eyesT = rr(120, 300); }
    return;
  }
  eyes.t -= dt; eyes.blink -= dt;
  if (eyes.blink <= 0) { eyes.grp.scale.y = 0.08; if (eyes.blink < -0.13) { eyes.grp.scale.y = 1; eyes.blink = rr(0.8, 2.6); } }
  const dx = eyes.x - camera.position.x, dy = eyes.y - camera.position.y, dz = eyes.z - camera.position.z, d = Math.hypot(dx, dy, dz);
  torch.getWorldDirection(viewDir).negate();
  const lit = (dx * viewDir.x + dy * viewDir.y + dz * viewDir.z) / d > 0.994 && torchLevel(player.battery) > 0.3 && d < 22;
  if (eyes.t <= 0 || lit || d < 8) {
    scene.remove(eyes.grp);
    sfx.play('bones_rattle', { x: eyes.x, y: eyes.y, z: eyes.z, vol: 0.3, rate: 1.4, wet: 0.6 });
    if (Math.random() < 0.3) sfx.play('creature_growl', { x: eyes.x, y: eyes.y, z: eyes.z, vol: 0.25, rate: 0.8, wet: 0.9 });
    eyes = null;
  }
}

// ---------- the sound of moving water ----------
let streamLoop = null, rapidsLoop = null, streamT = 0;
function updateStreamSound(dt) {
  streamT -= dt; if (streamT > 0) return; streamT = 0.4;
  let best = null, bd = 1e9, rap = null, rd = 1e9;
  for (const n of G.streamNodes) {
    const d = Math.hypot(n.x - player.x, n.y - player.y, n.z - player.z); if (d > 40) continue;
    if (d < bd) { bd = d; best = n; }
    if (n.flow.s > 1.4 && d < rd) { rd = d; rap = n; }
  }
  if (best && !streamLoop) streamLoop = sfx.loop('stream', { x: best.x, y: best.wl, z: best.z, rolloff: 0.6, wet: 0.6 });
  if (streamLoop) { if (best) { streamLoop.setPos(best.x, best.wl, best.z); streamLoop.setVol(0.55 * Math.min(1, best.flow.s), 0.5); } else streamLoop.setVol(0, 1.0); }
  if (rap && !rapidsLoop) rapidsLoop = sfx.loop('stream_rocks', { x: rap.x, y: rap.wl, z: rap.z, rolloff: 0.9, wet: 0.7 });
  if (rapidsLoop) { if (rap) { rapidsLoop.setPos(rap.x, rap.wl, rap.z); rapidsLoop.setVol(0.9 * Math.min(1, rap.flow.s - 1.2), 0.5); } else rapidsLoop.setVol(0, 1.0); }
}

// ---------- place names: cavers name what they find ----------
const NAME_A = ['Long', 'Broken', 'Quiet', 'Black', 'High', 'Wet', 'Low', 'Cold', 'Far', 'Old', 'Grey', 'Lost'];
const NAME_B = { cavern: ['Hall', 'Cathedral', 'Vault', 'Hollow', 'Chamber'], chamber: ['Room', 'Chamber', 'Alcove', 'Gallery'], crystal: ['Pocket', 'Grotto', 'Vein'], gour: ['Terraces', 'Steps', 'Pools', 'Stairs'] };
const places = [];           // {x,y,z, name, kind}
let placeT = 0, lastNamed = -1e9;
function updatePlaces(dt) {
  placeT -= dt; if (placeT > 0) return; placeT = 1.0;
  const sg = G.nearestSegAt(player.x, player.y + 0.5, player.z); if (!sg || !sg.nb) return;
  const n = sg.nb, kind = n.rx > 8 ? 'cavern' : n.tint === 5 ? 'crystal' : n.gour ? 'gour' : n.rx > 3.4 && n.ry > 2.6 ? 'chamber' : null;
  if (!kind) return;
  if (kind !== 'cavern' && runTime - lastNamed < 75) return;               // naming is an event, not a label printer
  for (const pl of places) if (Math.hypot(pl.x - player.x, pl.z - player.z) < (kind === 'cavern' ? 60 : 35)) return;
  let sd = (Math.abs(n.x * 73 + n.z * 131) | 0) + SEED; const R = () => ((sd = (sd * 9301 + 49297) % 233280) / 233280);
  let adj = NAME_A[(R() * NAME_A.length) | 0]; for (let k = 0; k < 6 && places.some(p => p.name.startsWith(adj + ' ')); k++) adj = NAME_A[(R() * NAME_A.length) | 0];
  const name = `${adj} ${NAME_B[kind][(R() * NAME_B[kind].length) | 0]}`; lastNamed = runTime;
  places.push({ x: player.x, y: player.y, z: player.z, name, kind });
  showHint(name.toLowerCase(), true);
}

// ---------- survey notebook ----------
let notebookOpen = false, nbTimer = 0;
const nb = $('notebook'), nbc = $('nbc');
function toggleNotebook() {
  notebookOpen = !notebookOpen; nb.style.display = notebookOpen ? 'block' : 'none';
  if (notebookOpen) { drawNotebook(); sfx.play('scrape', { vol: 0.15, rate: 2.2, dur: 0.3 }); }
}
function drawNotebook() {
  const ctx = nbc.getContext('2d'), W = nbc.width, H = nbc.height;
  ctx.clearRect(0, 0, W, H);
  // faint ruled paper
  ctx.strokeStyle = 'rgba(120,110,95,0.18)'; ctx.lineWidth = 2;
  for (let y = 120; y < H; y += 56) { ctx.beginPath(); ctx.moveTo(60, y); ctx.lineTo(W - 60, y); ctx.stroke(); }
  // fit everything I know about on the page: my route, the entrance, the marks — the page scale shrinks as the survey grows
  let x0 = Math.min(0, player.x), x1 = Math.max(0, player.x), z0 = Math.min(0, player.z), z1 = Math.max(0, player.z);
  for (const q of player.trail) { if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x; if (q.z < z0) z0 = q.z; if (q.z > z1) z1 = q.z; }
  for (const d of cave.deaths) for (const q of (d.trail || [])) { if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x; if (q.z < z0) z0 = q.z; if (q.z > z1) z1 = q.z; }
  const margin = player.pages.length ? 400 : 0;                                                          // pages I found go down the right-hand side
  const S = clamp(Math.min((W - 320 - margin) / Math.max(1, x1 - x0), (H - 300) / Math.max(1, z1 - z0)), 2.5, 12);   // px per metre
  const cx = (W - margin) / 2 - (x0 + x1) / 2 * S, cz = H / 2 - (z0 + z1) / 2 * S;
  const X = x => cx + x * S, Z = z => cz + z * S;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // surveys of the ones who came before, faint
  for (const d of cave.deaths) {
    if (!d.trail || d.trail.length < 2) continue;
    ctx.strokeStyle = 'rgba(70,60,50,0.22)'; ctx.lineWidth = 2.5; ctx.setLineDash([6, 8]);
    ctx.beginPath(); ctx.moveTo(X(d.trail[0].x), Z(d.trail[0].z));
    for (let i = 1; i < d.trail.length; i++) ctx.lineTo(X(d.trail[i].x), Z(d.trail[i].z));
    ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(70,60,50,0.7)'; ctx.font = '600 30px Caveat'; ctx.fillText('✕', X(d.x) - 9, Z(d.z) + 11);
  }
  // my trail: pencil; blue where it was water; dotted where I crawled
  const t = player.trail;
  for (let i = 1; i < t.length; i++) {
    const a = t[i - 1], b = t[i];
    if (Math.hypot(b.x - a.x, b.z - a.z) > 6) continue;
    ctx.strokeStyle = b.k === 1 || b.k === 2 ? 'rgba(40,90,130,0.85)' : 'rgba(45,38,32,0.85)';
    ctx.lineWidth = b.k === 2 ? 5 : 3; ctx.setLineDash(b.k === 3 ? [4, 7] : []);
    ctx.beginPath(); ctx.moveTo(X(a.x), Z(a.z)); ctx.lineTo(X(b.x), Z(b.z)); ctx.stroke();
  }
  ctx.setLineDash([]);
  // depth ticks every ~25 m of trail
  ctx.fillStyle = 'rgba(60,52,44,0.8)'; ctx.font = '500 22px Caveat';
  for (let i = 0; i < t.length; i += 36) ctx.fillText((-t[i].y).toFixed(0) + ' m', X(t[i].x) + 8, Z(t[i].z) - 8);
  // places
  ctx.font = '600 30px Caveat'; ctx.fillStyle = 'rgba(45,38,32,0.85)';
  for (const pl of places) ctx.fillText(pl.name, X(pl.x) - ctx.measureText(pl.name).width / 2, Z(pl.z) - 16);
  // glowsticks
  ctx.fillStyle = 'rgba(40,150,80,0.9)';
  for (const g of glow) { ctx.beginPath(); ctx.arc(X(g.x), Z(g.z), 6, 0, Math.PI * 2); ctx.fill(); }
  // chalk, in my hand
  ctx.font = '600 26px Caveat'; ctx.fillStyle = 'rgba(40,34,28,0.9)';
  for (const m of runMarks.concat(cave.marks)) ctx.fillText(m.text, X(m.x) + 10, Z(m.z) + 8);
  // me
  ctx.save(); ctx.translate(X(player.x), Z(player.z)); ctx.rotate(-player.yaw);
  ctx.fillStyle = 'rgba(160,40,30,0.9)'; ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(9, 10); ctx.lineTo(-9, 10); ctx.closePath(); ctx.fill();
  ctx.restore();
  // entrance
  ctx.font = '600 24px Caveat'; ctx.fillStyle = 'rgba(60,52,44,0.9)'; ctx.fillText('entrance', X(0) + 12, Z(0) + 8);
  ctx.beginPath(); ctx.arc(X(0), Z(0), 7, 0, Math.PI * 2); ctx.stroke();
  // found pages, copied out
  if (player.pages.length) {
    const px = W - 400, maxW = 330; let py = 230;
    ctx.strokeStyle = 'rgba(60,52,44,0.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px - 30, 120); ctx.lineTo(px - 30, H - 90); ctx.stroke();
    ctx.font = '600 26px Caveat'; ctx.fillStyle = 'rgba(60,52,44,0.9)'; ctx.fillText('pages we found', px, 200);
    ctx.font = '500 24px Caveat'; ctx.fillStyle = 'rgba(45,38,32,0.85)';
    for (const pg of player.pages) {
      const words = pg.text.split(' '); let line = '';
      for (const w of words) { const test = line ? line + ' ' + w : w; if (ctx.measureText(test).width > maxW) { ctx.fillText(line, px, py); py += 30; line = w; } else line = test; }
      if (line) { ctx.fillText(line, px, py); py += 30; }
      ctx.font = '600 30px Caveat'; ctx.fillText('\u00b7', X(pg.x) - 5, Z(pg.z) + 10); ctx.font = '500 24px Caveat';
      py += 22; if (py > H - 120) break;
    }
  }
  // compass rose
  ctx.save(); ctx.translate(W - 120, 130); ctx.strokeStyle = 'rgba(60,52,44,0.8)'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(0, 0, 44, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, -44); ctx.lineTo(0, 44); ctx.moveTo(-44, 0); ctx.lineTo(44, 0); ctx.stroke();
  ctx.fillStyle = 'rgba(60,52,44,0.9)'; ctx.font = '600 26px Caveat'; ctx.fillText('N', -8, -52); ctx.restore();
  $('nb-title').textContent = `survey · attempt ${cave.attempts}`;
  const dist = Math.hypot(player.x, player.z);
  $('nb-foot').textContent = `${player.dist.toFixed(0)} m walked · ${(-player.y).toFixed(0)} m deep · ${dist.toFixed(0)} m from the entrance as the bat flies · ${player.sticks} glowsticks · ${player.rope} rope`;
}

// ---------- overlays / hud ----------
const grainCtx = $('grain').getContext('2d');
const grainImg = grainCtx.createImageData(320, 180);
let frameNo = 0;
function grain() {
  if (frameNo & 1) return;
  const d = grainImg.data;
  for (let i = 0; i < d.length; i += 4) { const v = (Math.random() * 255) | 0; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
  grainCtx.putImageData(grainImg, 0, 0);
}
let fpsAcc = 0, fpsN = 0, fps = 0;
const torchM = $('torchm'), breathM = $('breathm');
function hud(dt) {
  fpsAcc += dt; fpsN++;
  if (fpsAcc >= 0.5) { fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
  if (hintT > 0) { hintT -= dt; if (hintT <= 0) hint.style.opacity = 0; }
  if (notebookOpen) { nbTimer -= dt; if (nbTimer <= 0) { nbTimer = 0.5; drawNotebook(); } }
  if (frameNo % 6) return;
  $('torchbar').style.width = (player.battery * 100).toFixed(0) + '%';
  torchM.classList.toggle('low', player.battery < 0.3);
  $('breathbar').style.width = (player.breath * 100).toFixed(0) + '%';
  breathM.style.opacity = player.under || player.breath < 1 ? 1 : 0;
  breathM.classList.toggle('low', player.breath < 0.35);
  breathM.querySelector('.tag').textContent = player.foul ? 'bad air' : 'air';
  if (showDebug) {
    let meshes = 0; for (const c of G.chunks.values()) if (c.mesh) meshes++;
    const stance = player.swim ? (player.under ? 'diving' : 'swimming') : player.h > 1.4 ? 'walking' : player.h > 0.8 ? 'crouched' : 'crawling';
    $('hud').innerHTML = `<b>${Math.hypot(player.x, player.z).toFixed(0)} m</b> from entrance &nbsp; depth <b>${(-player.y).toFixed(1)} m</b> &nbsp; ${stance} &nbsp; open ${open.toFixed(1)}` +
      ` &nbsp;·&nbsp; ${fps} fps · ${meshes} chunks · ${G.worms.length} worms · build max ${stats.maxMs.toFixed(0)} ms · seed ${SEED}`;
  } else $('hud').innerHTML = [player.hurt ? 'hurt' : '', player.cold > 0.95 ? (coldT > 40 ? 'freezing' : 'very cold') : player.cold > 0.5 ? 'cold' : ''].filter(Boolean).join(' · ');
}

// ---------- bootstrap ----------
function init() {
  G.initGen(SEED, cave.tier);
  for (const d of cave.deaths) G.props.push({ type: 'remains', ...d });
  for (const m of cave.marks) G.props.push({ type: 'mark', ...m });
  if (cave.places) places.push(...cave.places);
  if (cave.pages) player.pages.push(...cave.pages);
  G.scanChunks(1, true, disposeChunk); processQueue(1e9, true);
  for (let y = -3; y < 3; y += 0.1) if (G.fieldAt(0, y + 0.35, 0) < -0.3 && G.fieldAt(0, y + 1.2, 0) < -0.3) { player.y = y; break; }
  player.yaw = Math.PI;
  if (cave.run && !urlSeedIsNew) {                                  // pick the interrupted attempt back up
    const r = cave.run;
    player.x = r.x; player.y = r.y; player.z = r.z; player.yaw = r.yaw; player.battery = r.battery; player.breath = r.breath; player.hurt = r.hurt;
    player.dist = r.dist; player.maxDepth = r.maxDepth; player.trail = r.trail || []; runMarks.push(...(r.marks || [])); runTime = r.t || 0;
    if (r.sticks !== undefined) player.sticks = r.sticks; if (r.places) places.push(...r.places); if (r.pages) for (const pg of r.pages) if (!player.pages.some(q => q.key === pg.key)) player.pages.push(pg); if (r.rope !== undefined) player.rope = r.rope; if (r.cells) player.cells = true;
    for (const g of (r.glow || [])) { const mesh = new THREE.Mesh(stickGeo, stickMat); mesh.position.set(g.x, g.y, g.z); mesh.rotation.x = Math.PI / 2; scene.add(mesh); const light = new THREE.PointLight(0x5cff7a, 1.1, 9, 1.7); light.position.set(g.x, g.y + 0.15, g.z); scene.add(light); glow.push({ ...g, light, mesh }); }
    for (const m of runMarks) G.props.push({ type: 'mark', ...m });
    G.focus.x = player.x; G.focus.y = player.y; G.focus.z = player.z;
    G.advanceWorms(4000);                                           // the same rounds give the same cave
    G.scanChunks(1, true, disposeChunk); processQueue(1e9, true);
    if (player.hurt) $('hud').textContent = 'hurt';
    $('ov-sub').textContent = 'you are still down here.';
    $('go').textContent = 'CLICK TO CARRY ON';
  }
  updatePlayer(0); updateTorch(1);
  window.K = { player, G, keys, stats, placeMark, shakeTorch, spawnEyes, sfx, camera, scene, torch, bonePiles, boneInst,
               get eyes() { return eyes; }, get exit() { return exitInfo; }, tick: (dt) => stepFrame(dt), render: () => renderer.render(scene, camera), motes, td: _td, tp: _tp, motePos, dropTorch, get torchHeld() { return torchHeld; }, get stuck() { return stuck; }, set stuck(v) { stuck = v; },
               run: () => { running = true; overlay.classList.add('hidden'); }, spawnCrosser, get crosser() { return crosser; }, places, loose, caches, composePage };
}
init();

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  stepFrame(dt);
}
function stepFrame(dt) {
  frameNo++;
  if (innerWidth !== lastW || innerHeight !== lastH) { lastW = innerWidth; lastH = innerHeight; resize(); }
  const tf = performance.now();
  if (running && player.alive && !player.out) { updatePlayer(dt); runTime += dt; saveT += dt; if (saveT > 5) { saveT = 0; saveRun(); }
    if (runTime > 40 && runTime < 41) teach('survey', 'M opens your survey — it only shows where you have been. T chalks the wall. G drops a glowstick'); }
  G.advanceWorms(3);
  G.scanChunks(dt, false, disposeChunk);
  processQueue(running ? 5 : 12);
  processProps(dt);
  updateTorch(dt);
  updateEyes(dt);
  updateLoose(dt);
  updateCollapse(dt);
  updateStreamSound(dt);
  waterUniforms.uTime.value += dt;
  updatePlaces(dt);
  updateCrosser(dt);
  updateBats(dt);
  updateCascades(dt);
  updateSound(dt);
  renderer.render(scene, camera);
  grain(); hud(dt);
  stats.frameMs = performance.now() - tf;
}
requestAnimationFrame(frame);

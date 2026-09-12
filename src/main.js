// Karst — the game: scene, player, torch, water, chalk, things in the dark. Generator lives in gen.js, sound in audio.js.
import * as THREE from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import * as G from './gen.js';
import { Sfx } from './audio.js';

const $ = id => document.getElementById(id);
const { clamp, lerp, rr } = G;
const params = new URLSearchParams(location.search);
// Gameplay delays advance with the simulation, so pausing also freezes a pending collapse or fall.
let gameClock = 0, eHeldAt = 0;
const gameTimers = [];
function gameDelay(fn, milliseconds) { gameTimers.push({ fn, left: milliseconds / 1000 }); }
function advanceGameTimers(dt) {
  gameClock += dt * 1000;
  for (const timer of gameTimers.slice()) {
    timer.left -= dt;
    if (timer.left <= 0) { gameTimers.splice(gameTimers.indexOf(timer), 1); timer.fn(); }
  }
}
// the cave you are in stays the same cave until you get out of it; your dead stay in it too
let cave = null;
try { cave = JSON.parse(localStorage.getItem('karst.cave') || 'null'); } catch (e) {}
const urlSeed = parseInt(params.get('seed'));
const urlSeedIsNew = !!urlSeed && !(cave && cave.seed === urlSeed);
const SEED = (urlSeed || (cave && !cave.escaped && cave.seed) || ((Math.random() * 1e9) | 0)) >>> 0;
let record = { runs: 0, best: 0, escapes: 0, drowned: 0, fell: 0, froze: 0, crushed: 0, foul: 0, wedged: 0 };
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
  cave.run = { x: player.x, y: player.y, z: player.z, yaw: player.yaw, battery: player.battery, breath: player.breath, hurt: player.hurt, sticks: player.sticks, rope: player.rope, cells: player.cells, kit: player.kit, suit: player.suit,
               glow: glow.map(g => ({ x: g.x, y: g.y, z: g.z })), places, pages: player.pages, notes,
               dist: player.dist, maxDepth: player.maxDepth, marks: runMarks, trail: player.trail.slice(-3000), t: runTime };
  saveCave();
}
document.addEventListener('visibilitychange', () => { if (document.hidden) saveRun(); });

const PR = 0.26;                                           // player collision radius
const H_STAND = 1.72, H_CROUCH = 0.95, H_PRONE = 0.5;
const BREATH_BASE = 16, BATTERY_S = 130;                   // seconds of breath; seconds of torch at full
let BREATH_S = BREATH_BASE;                                 // grows a little with every sump you come up from, across attempts
const GRAV = 14;

const player = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, vy: 0, h: H_STAND, grounded: false, bob: 0, stamina: 1, sprint: false,
                 wl: -Infinity, swim: false, under: false, breath: 1, battery: 1, hurt: false,
                 airT: 0, whooshed: false, underT: 0, stepPhase: 0,
                 dist: 0, maxDepth: 0, marks: 0, alive: true, out: false, trail: [], lastTrail: null, cold: 0, sticks: 3, rope: 0, cells: false, kit: false, suit: false, pages: [] };
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
    .replace('#include <common>', 'attribute float glow; attribute float wet; varying float vGlow; varying float vWet;\n#include <common>')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glow; vWet = wet;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', 'varying float vGlow; varying float vWet;\n#include <common>')
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = roughnessFactor * (1.0 - 0.62 * vWet);')   // wet rock and flowstone catch the beam
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += (vGlow < 0.0 ? vec3(0.42, 0.72, 1.25) : vec3(0.10, 0.75, 0.55)) * vGlow * vGlow * 0.32;');
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
const touch = new THREE.PointLight(0x9fb0c8, 0, 1.6, 2.2); scene.add(touch);     // feeling your way: what an arm's reach of rock looks like to a dark-adapted eye
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
// the draught: the air in a cave moves toward the way out, and the dust in your beam goes with it — slowly
let draughtX = 0, draughtZ = 0, draughtT = 0;
function updateDraught(dt) {
  draughtT -= dt; if (draughtT > 0) return; draughtT = 2;
  let tx = 0, tz = 0;
  if (exitInfo) { tx = exitInfo.x - player.x; tz = exitInfo.z - player.z; }
  else {                                                                       // no exit yet: along the main way, away from the entrance
    let best = null, bd = 60; for (const n of G.nodes) { if (!G.trunkIds.has(n.w)) continue; const d = Math.hypot(n.x - player.x, n.z - player.z); if (d < bd) { bd = d; best = n; } }
    if (best) { const nx = G.nodes.find(n => n.w === best.w && n.i === best.i + 6); if (nx) { tx = nx.x - best.x; tz = nx.z - best.z; } }
  }
  const L = Math.hypot(tx, tz) || 1; const k = open > 12 ? 0.08 : 0.16;      // stronger in passages, lost in big chambers
  draughtX = tx / L * k; draughtZ = tz / L * k;
  if (runTime > 120 && (tx || tz) && open < 12 && torchHeld && torchLevel(player.battery) > 0.4) teach('draught', 'watch the dust in the beam. it drifts one way: the air is going somewhere, and cavers follow it');
}
function updateMotes(dt, level) {
  torch.getWorldDirection(_td).negate(); _tp.copy(camera.position);            // torch is a plain Object3D: +Z is backwards
  const t = gameClock * 0.001, ic = motes.instanceColor.array;
  const gust = 1 + (gustT > 0 ? 3 : 0);
  for (let i = 0; i < MOTES; i++) {
    let x = motePos[i * 3], y = motePos[i * 3 + 1], z = motePos[i * 3 + 2];
    x += (Math.sin(t * 0.7 + i) * 0.04 + moteVel[i * 3] + draughtX * gust) * dt; y += (-0.05 + Math.cos(t * 0.5 + i * 1.3) * 0.03) * dt; z += (Math.cos(t * 0.6 + i * 0.7) * 0.04 + moteVel[i * 3 + 2] + draughtZ * gust) * dt;
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
// a fixed pool of lights: three.js recompiles every shader when the number of lights changes, so the count never does.
// glowsticks, remains, glow-worm sites, the exit and the shafts all borrow from here; when it runs dry, the light furthest from you is taken back.
const lightPool = [], spotPool = [];
for (let i = 0; i < 14; i++) { const l = new THREE.PointLight(0xffffff, 0, 1, 2); l.userData.free = true; scene.add(l); lightPool.push(l); }
for (let i = 0; i < 3; i++) { const l = new THREE.SpotLight(0xffffff, 0, 1, 0.3, 0.9, 1.2); l.userData.free = true; scene.add(l); scene.add(l.target); spotPool.push(l); }
function borrowLight(color, intensity, distance, decay, x, y, z) {
  let l = lightPool.find(q => q.userData.free);
  if (!l) { let far = -1; for (const q of lightPool) { if (q.userData.keep) continue; const d = Math.hypot(q.position.x - player.x, q.position.z - player.z); if (d > far) { far = d; l = q; } } if (l && l.userData.owner) l.userData.owner.light = null; }
  if (!l) return null;
  l.userData.free = false; l.userData.keep = false; l.userData.owner = null;
  l.color.set(color); l.intensity = intensity; l.distance = distance; l.decay = decay; l.position.set(x, y, z);
  return l;
}
function returnLight(l) { if (!l) return; l.intensity = 0; l.userData.free = true; l.userData.keep = false; l.userData.owner = null; }
function borrowSpot(color, intensity, distance, angle, x, y, z, tx, ty, tz) {
  const l = spotPool.find(q => q.userData.free); if (!l) return null;
  l.userData.free = false; l.color.set(color); l.intensity = intensity; l.distance = distance; l.angle = angle; l.position.set(x, y, z); l.target.position.set(tx, ty, tz);
  return l;
}

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
  if (ch.dirty) return;                                              // carved again meanwhile; the scan will re-queue it
  G.applyChunkData(ch, out);
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
    if (out.rock.wet) geo.setAttribute('wet', new THREE.BufferAttribute(out.rock.wet, 1));
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
const stats = { builds: 0, buildMs: 0, maxMs: 0, frameMs: 0, phase: {}, propMs: {} };
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
for (const k in boneGeos) { boneInst[k] = new THREE.InstancedMesh(boneGeos[k], boneMat, 900); boneInst[k].count = 0; boneInst[k].frustumCulled = false; boneInst[k].castShadow = true; boneInst[k].receiveShadow = true; scene.add(boneInst[k]); boneCount[k] = 0; }
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const bonePiles = [];       // {x,y,z, r, crunched}
// gypsum blades for crystal pockets
const crystalMat = new THREE.MeshStandardMaterial({ color: 0xf3f5ff, roughness: 0.28, metalness: 0.0, emissive: 0x2c3444, flatShading: true });
const crystals = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 4), crystalMat, 6000); crystals.count = 0; crystals.frustumCulled = false; crystals.castShadow = true; scene.add(crystals);
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
    if (fy !== null) { const k = R() < 0.3 ? 'page' : R() < 0.15 ? 'kit' : R() < 0.08 ? 'suit' : R() < 0.4 ? 'battery' : R() < 0.62 ? 'sticks' : R() < 0.85 ? 'rope' : 'cells'; placeCache(ax, fy, az, k, k === 'page' ? (R() < 0.35 ? composeSurvey(ax, fy, az, R) : composePage(ax, fy, az, R)) : null); }
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
  const light = borrowLight(0xffa050, 0.25, 4, 1.5, p.x + 0.35, y + 0.12, p.z - 0.2);
  const rem = { x: p.x + 0.35, y, z: p.z - 0.2, taken: false, light, lens, cause: p.cause, battery: p.battery }; if (light) light.userData.owner = rem;
  remains.push(rem);
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
  for (let k = 0; k < 6; k++) gameDelay(() => sfx.play('flap', { x: camera.position.x + (Math.random() - 0.5) * 2, y: camera.position.y + 0.3, z: camera.position.z + (Math.random() - 0.5) * 2, vol: 0.5, vary: 0.3 }), 600 + k * 260 + Math.random() * 200);
  showHint('bats');
}
// ---------- olms: pale, blind, slow, in the still water ----------
const OLMS = 8;
const olmGeo = new THREE.IcosahedronGeometry(1, 1).scale(0.11, 0.022, 0.022), olmMat = new THREE.MeshStandardMaterial({ color: 0xf2dcd2, roughness: 0.6, emissive: 0x2a1c18, flatShading: true });
const olms = [];               // {mesh, x,y,z, yaw, speed, flee, node}
const olmNodesTried = new Set();
let olmT = 0;
function updateOlms(dt) {
  olmT -= dt;
  if (olmT <= 0) {
    olmT = 1.5;
    // spawn: still water at least knee deep, near the player, never seen before
    if (olms.length < OLMS) for (const n of G.nodes) {
      if (n.wl === undefined || n.flow || n.wl - n.y < 0.3) continue;
      const d = Math.hypot(n.x - player.x, n.y - player.y, n.z - player.z); if (d > 18 || d < 3) continue;
      const key = n.w + ':' + n.i; if (olmNodesTried.has(key) || !G.chunkReadyAt(n.x, n.wl, n.z)) continue; olmNodesTried.add(key);
      if (G.hash3(Math.floor(n.x * 3.1), 0, Math.floor(n.z * 7.7)) > 0.22) continue;
      const mesh = new THREE.Mesh(olmGeo, olmMat); scene.add(mesh);
      olms.push({ mesh, x: n.x, y: n.wl - 0.12, z: n.z, yaw: Math.random() * 6.28, speed: 0.12, flee: 0, t: Math.random() * 10 });
      if (olms.length >= OLMS) break;
    }
    for (let i = olms.length - 1; i >= 0; i--) { const o = olms[i]; if (Math.hypot(o.x - player.x, o.z - player.z) > 30) { scene.remove(o.mesh); olms.splice(i, 1); } }
  }
  camera.getWorldDirection(viewDir);
  for (const o of olms) {
    o.t += dt;
    const dx = o.x - camera.position.x, dy = o.y - camera.position.y, dz = o.z - camera.position.z, d = Math.hypot(dx, dy, dz);
    const lit = torchHeld && torchLevel(player.battery) > 0.3 && d < 9 && (dx * viewDir.x + dy * viewDir.y + dz * viewDir.z) / d > 0.96;
    if ((lit || d < 2.2) && o.flee <= 0) { o.flee = 2.5; o.yaw = Math.atan2(dx, dz) + (Math.random() - 0.5) * 1.2; teach('olm', 'something pale in the water. it has no eyes; it has never needed them'); if (d < 4) sfx.play('splash_small', { x: o.x, y: o.y, z: o.z, vol: 0.12, rate: 1.6, vary: 0.2 }); }
    o.flee -= dt;
    const sp = o.flee > 0 ? 1.2 : 0.12 + 0.05 * Math.sin(o.t * 0.7);
    if (o.flee <= 0) o.yaw += Math.sin(o.t * 0.9) * dt * 0.6;
    const nx = o.x + Math.sin(o.yaw) * sp * dt, nz = o.z + Math.cos(o.yaw) * sp * dt;
    const wl = G.waterLevelAt(nx, o.y + 0.2, nz);
    if (Number.isFinite(wl) && wl - 0.12 > o.y - 0.4 && G.fieldAt(nx, wl - 0.12, nz) < -0.12) { o.x = nx; o.z = nz; o.y += (wl - 0.12 - o.y) * Math.min(1, dt * 3); }
    else o.yaw += Math.PI * 0.6 + Math.random() * 0.8;                              // the edge of the pool: turn
    o.mesh.position.set(o.x, o.y, o.z); o.mesh.rotation.y = o.yaw + Math.sin(o.t * (o.flee > 0 ? 18 : 4)) * 0.15;
    o.mesh.scale.set(1, 1, 1 + Math.sin(o.t * (o.flee > 0 ? 18 : 4)) * 0.25);
  }
}
// ---------- a whistle: the cave answers, and tells you how big it is ----------
let whistleT = 0;
function whistle() {
  if (whistleT > 0 || player.under) return; whistleT = 1.6;
  sfx.play('whistle', { vol: 0.7, rate: rr(0.95, 1.05) });
  camera.getWorldDirection(viewDir);
  const o = Math.max(2, open), delay = clamp(o * 2 / 340, 0.04, 0.4);
  const ex = camera.position.x + viewDir.x * o, ey = camera.position.y + viewDir.y * o, ez = camera.position.z + viewDir.z * o;
  gameDelay(() => sfx.play('whistle', { x: ex, y: ey, z: ez, vol: 0.32 * clamp(o / 14, 0.25, 1), rate: 0.98, wet: 1.0, rolloff: 0.4 }), delay * 1000);
  if (o > 9) gameDelay(() => sfx.play('whistle', { x: ex - viewDir.x * o * 0.5, y: ey, z: ez - viewDir.z * o * 0.5, vol: 0.14, rate: 0.96, wet: 1.0, rolloff: 0.3 }), delay * 2200);
  if (o > 16) gameDelay(() => sfx.play('rumble', { vol: 0.25, rate: 1.4, dur: 1.2, wet: 1.0 }), delay * 2600);
  for (const r of roosts) if (!r.spooked && Math.hypot(r.x - player.x, r.y - player.y, r.z - player.z) < 22) gameDelay(() => spookRoost(r), 300);
  if (following > 0) { following = 0; followT = rr(40, 90); }                          // whatever it is, it stops when you do that
  if (dread > 0.35 && Math.random() < 0.22 + 0.3 * dread) {                             // and sometimes something answers, late, from the wrong place
    const a = Math.random() * Math.PI * 2, d = rr(12, 22);
    gameDelay(() => { if (player.alive) { sfx.play('whistle', { x: player.x + Math.sin(a) * d, y: player.y + 0.5, z: player.z + Math.cos(a) * d, vol: 0.4, rate: 0.9, wet: 0.9, rolloff: 0.4 }); showHint('that was not an echo', true); } }, rr(2600, 4200));
  }
  teach('whistle', o > 9 ? 'listen to it come back. that took a while: this is a big space' : 'it came straight back. there is not much room here');
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
let ropeCoils = 1;
const ropeMat = new THREE.MeshStandardMaterial({ color: 0xc8b48a, roughness: 0.9 });
let roping = null;           // {rope, dir, t}
function nearestVoid() {
  let best = null, bd = 3.2;
  for (const v of G.voids) { const d = Math.hypot(v.x - player.x, v.z - player.z); if (d < bd && Math.abs(v.top - player.y) < 1.5) { bd = d; best = v; } }
  return best;
}
// a rope somebody else left on a pitch: it works, unless it does not
const oldRopeMat = new THREE.MeshStandardMaterial({ color: 0x6b5a48, roughness: 1 }), frayedMat = new THREE.MeshStandardMaterial({ color: 0x3e3128, roughness: 1 });
function placeOldRope(p) {
  const r = { x: p.x, z: p.z, top: p.y, bottom: p.bottom, old: true, frayed: p.frayed, mesh: new THREE.Mesh(new THREE.CylinderGeometry(p.frayed ? 0.009 : 0.013, 0.013, p.y - p.bottom + 0.3, 5), p.frayed ? frayedMat : oldRopeMat) };
  r.mesh.position.set(p.x, (p.y + p.bottom) / 2 - 0.1, p.z); scene.add(r.mesh); ropes.push(r);
}
// derig: hold E at the top of a rope you rigged to pull it up and coil it again
function derigRope() {
  for (const r of ropes) {
    if (r.old || r.rescue) continue;
    if (Math.hypot(r.x - player.x, r.z - player.z) < 2.2 && Math.abs(player.y - r.top) < 1.5 && !roping) {
      scene.remove(r.mesh); ropes.splice(ropes.indexOf(r), 1); player.rope += r.coils || 1; forgetRope(r);
      sfx.play('drag', { vol: 0.5, rate: 1.1, dur: 1.2 }); showHint(`rope pulled up and coiled · ${player.rope}`); return;
    }
  }
  for (const L of lines) {                                                              // reel a line in from either bank
    if (player.swim || !lineEndsNear(L, 2.5)) continue;
    scene.remove(L.mesh); lines.splice(lines.indexOf(L), 1); player.rope += L.coils; cave.lines = (cave.lines || []).filter(e => !(e.w === L.n0.w && e.i === L.n0.i)); saveCave();
    sfx.play('drag', { vol: 0.5, rate: 1.2, dur: 1.6 }); sfx.play('splash_small', { vol: 0.4 }); showHint(`line reeled in and coiled · ${player.rope}`); return;
  }
  if (ropes.some(r => (r.old || r.rescue) && Math.hypot(r.x - player.x, r.z - player.z) < 2.2)) showHint('not yours to take');
  else useRope();
}
function useRope() {
  if (!running || !player.alive || player.out || roping) return;
  // climb an existing rope from the bottom
  for (const r of ropes) {
    if (Math.hypot(r.x - player.x, r.z - player.z) < 3.0 && Math.abs(player.y - r.bottom) < 1.8) { roping = { rope: r, dir: 1, t: 0 }; showHint('climbing'); return; }
    if (Math.hypot(r.x - player.x, r.z - player.z) < 1.8 && Math.abs(player.y - r.top) < 1.5) { roping = { rope: r, dir: -1, t: 0 }; showHint('down the rope'); return; }
  }
  if (player.swim && nearestLine(1.7)) return;                                          // hold, and you haul
  const v = nearestVoid();
  if (!v) {
    const se = nearestSumpEnd();
    if (!se) { showHint('nothing to rig here'); return; }
    if (player.rope <= 0) { showHint('you have no rope for a line'); return; }
    const need = Math.max(1, Math.round(se.path.len / 14));                               // a coil, tied to the next, runs about fourteen metres of line
    if (player.rope < need) { showHint(`the line would not reach through. ${need} coils for this one, and you have ${player.rope}`, true); return; }
    player.rope -= need; layLine(se.n0, need, false);
    sfx.play('rattle', { vol: 0.5, rate: 0.7 }); sfx.play('splash_small', { x: se.n0.x, y: se.n0.y + 1, z: se.n0.z, vol: 0.6 });
    showHint(`tied off. the line runs through the water${need > 1 ? `, ${need} coils of it` : ''}. hold E in there and haul`, true); return;
  }
  if (player.rope <= 0) { showHint('you have no rope'); return; }
  const need = Math.max(1, Math.ceil((v.top - v.y) / 12));                              // a coil is about twelve metres
  if (player.rope < need) { showHint(`the rope does not reach. ${need} coils for this one, and you have ${player.rope}`, true); return; }
  player.rope -= need; if (need > 1) showHint(`${need} coils tied together`);
  ropeCoils = need;
  const r = { x: v.x, z: v.z, top: v.top, bottom: v.y, coils: ropeCoils, mesh: new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, v.top - v.y + 0.3, 5), ropeMat) };
  r.mesh.position.set(v.x, (v.top + v.y) / 2 - 0.1, v.z); scene.add(r.mesh); ropes.push(r);
  cave.ropes = (cave.ropes || []).concat([{ x: r.x, z: r.z, top: r.top, bottom: r.bottom, coils: r.coils }]); saveCave();
  roping = { rope: r, dir: -1, t: 0 }; sfx.play('rattle', { vol: 0.5, rate: 0.6 }); showHint('rigged. going down');
}
function updateRoping(dt) {
  if (!roping) return;
  const r = roping.rope, span = r.top - r.bottom, speed = roping.dir < 0 ? 1.6 : 0.9;
  roping.t += dt;
  if (r.old && !roping.warned) { roping.warned = true; showHint(r.frayed ? 'the rope is old. it feels wrong' : 'an old rope. it holds, so far'); teach('oldrope', 'ropes the others left: most hold. look at them first'); }
  if (r.frayed && roping.dir < 0 && r.top - player.y > span * 0.45 && !r.gone) {
    r.gone = true; roping = null; scene.remove(r.mesh); ropes.splice(ropes.indexOf(r), 1);
    sfx.play('rattle', { vol: 0.8, rate: 0.5 }); sfx.play('gasp', { vol: 0.8 }); showHint('it went', true); player.vy = -1; player.airT = 0.3; player.h = H_STAND;
    return;
  }
  const target = roping.dir < 0 ? r.bottom : r.top;
  player.x += (r.x - player.x) * Math.min(1, dt * 4); player.z += (r.z - player.z) * Math.min(1, dt * 4);
  player.y += Math.sign(target - player.y) * speed * dt; player.vy = 0; player.airT = 0; player.h = H_CROUCH;
  if (Math.floor(roping.t * 1.6) !== Math.floor((roping.t - dt) * 1.6)) sfx.play('scrape', { vol: 0.35, rate: 1.4, vary: 0.3, dur: 0.4, hrtf: false });
  if ((roping.dir < 0 && player.y <= r.bottom + 0.15) || (roping.dir > 0 && player.y >= r.top - 0.05)) {
    if (roping.dir > 0 && r.rescue) { roping = null; rescued(); return; }
    if (roping.dir > 0) { player.y = r.top + 0.1; const dx = -Math.sin(player.yaw), dz = -Math.cos(player.yaw); player.x = r.x + dx * 0.9; player.z = r.z + dz * 0.9; }   // step off the lip
    else player.y = r.bottom + 0.15;
    roping = null; showHint(player.y < r.bottom + 1 ? 'down' : 'up');
  }
}
// a rope you rigged stays rigged: for the rest of this attempt, and for the next of you
function restoreRopes() {
  for (const e of cave.ropes || []) {
    const r = { x: e.x, z: e.z, top: e.top, bottom: e.bottom, coils: e.coils, mesh: new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, e.top - e.bottom + 0.3, 5), ropeMat) };
    r.mesh.position.set(e.x, (e.top + e.bottom) / 2 - 0.1, e.z); scene.add(r.mesh); ropes.push(r);
  }
}
restoreRopes();
const ropeKey = r => `${r.x.toFixed(1)},${r.z.toFixed(1)},${r.top.toFixed(1)}`;
function forgetRope(r) { cave.ropes = (cave.ropes || []).filter(e => ropeKey(e) !== ropeKey(r)); saveCave(); }
// sump lines: tie a coil off at the water's edge and it runs through the sump along the floor. In the water, hold E and it
// pulls you along it toward the nearer end — faster than swimming, and it still works when the silt is up. Lines stay laid.
const lines = [];            // {n0, pts:[Vector3], len, coils, mesh}
const lineMat = new THREE.MeshStandardMaterial({ color: 0xe6dcc6, emissive: 0x2a251c, roughness: 0.9 });
let hauled = false, haulT = 0, padUseHeld = false, lineRestoreT = 0;
const linesPending = (cave.lines || []).slice();
function sumpPath(n0) {
  if (n0.linePath) return n0.linePath;
  const pts = [];
  const prev = G.nodes.find(q => q.w === n0.w && q.i === n0.i - 1); if (prev) pts.push(prev);
  for (let i = n0.i; i < n0.i + 90; i++) {
    const q = G.nodes.find(p => p.w === n0.w && p.i === i); if (!q) break;
    pts.push(q); if (i > n0.i && (q.wl === undefined || q.wl < q.y + 0.4)) break;   // out of the water on the far side
  }
  const last = pts[pts.length - 1], complete = pts.length >= 3 && (last.wl === undefined || last.wl < last.y + 0.4 || !G.worms.some(w => w.id === n0.w));   // the far bank, or a worm that finished (a trap: the line ends under water)
  if (!complete) return null;                                                         // not carved through yet: ask again later
  const v = pts.map(q => new THREE.Vector3(q.x, q.y + 0.3, q.z));
  let len = 0; for (let i = 1; i < v.length; i++) len += v[i].distanceTo(v[i - 1]);
  return n0.linePath = { pts: v, len };
}
function layLine(n0, coils, restore) {
  const path = sumpPath(n0); if (!path) return null;
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path.pts), path.pts.length * 3, 0.012, 4, false), lineMat);
  scene.add(mesh);
  const L = { n0, pts: path.pts, len: path.len, coils, mesh }; lines.push(L);
  if (!restore) { cave.lines = (cave.lines || []).concat([{ w: n0.w, i: n0.i, coils }]); saveCave(); }
  return L;
}
function lineEndsNear(L, d = 3.2) { const a = L.pts[0], b = L.pts[L.pts.length - 1]; return [a, b].some(q => Math.hypot(q.x - player.x, q.z - player.z) < d && Math.abs(q.y - player.y) < 2.5); }
function nearestSumpEnd() {                                                           // a sump with no line yet, either bank of it within reach
  if (player.swim) return null;
  for (const n0 of G.sumpNodes) {
    if (Math.hypot(n0.x - player.x, n0.z - player.z) > 45 || lines.some(L => L.n0 === n0)) continue;
    const path = sumpPath(n0); if (!path) continue;
    if (lineEndsNear({ pts: path.pts })) return { n0, path };
  }
  return null;
}
function nearestLine(maxD) {                                                          // the closest point on any line: {L, d, s} with s the arc length along it
  let best = null; const py = player.y + 0.5;
  for (const L of lines) {
    const p = L.pts; let acc = 0;
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1], b = p[i], abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z, l2 = abx * abx + aby * aby + abz * abz, l = Math.sqrt(l2);
      const t = l2 > 0 ? clamp(((player.x - a.x) * abx + (py - a.y) * aby + (player.z - a.z) * abz) / l2, 0, 1) : 0;
      const d = Math.hypot(player.x - (a.x + abx * t), py - (a.y + aby * t), player.z - (a.z + abz * t));
      if (d < maxD && (!best || d < best.d)) best = { L, d, s: acc + l * t };
      acc += l;
    }
  }
  return best;
}
function linePoint(L, s) {
  const p = L.pts; let acc = 0;
  for (let i = 1; i < p.length; i++) { const l = p[i].distanceTo(p[i - 1]); if (acc + l >= s || i === p.length - 1) { const t = l > 0 ? clamp((s - acc) / l, 0, 1) : 0; return { x: p[i - 1].x + (p[i].x - p[i - 1].x) * t, y: p[i - 1].y + (p[i].y - p[i - 1].y) * t, z: p[i - 1].z + (p[i].z - p[i - 1].z) * t }; } acc += l; }
  return p[0];
}
function updateHaul(dt) {
  const holding = (eHeldAt || padUseHeld) && canAct() && !typing && !toolsOpen && !notebookOpen;
  if (!holding || !player.swim) { if (!holding) haulT = 0; return; }
  const nl = nearestLine(1.7); if (!nl) return;
  hauled = true; haulT += dt;
  const s2 = clamp(nl.s + (nl.s < nl.L.len / 2 ? -1 : 1) * 3.0 * dt, 0, nl.L.len), q0 = linePoint(nl.L, nl.s), q1 = linePoint(nl.L, s2), k = Math.min(1, dt * 6);
  player.x += q1.x - q0.x + (q0.x - player.x) * k; player.z += q1.z - q0.z + (q0.z - player.z) * k; player.y += q1.y - q0.y + (q0.y - 0.15 - player.y) * k; player.vy = 0;   // hand over hand along it, and onto it
  collide();
  if (Math.floor(haulT * 1.5) !== Math.floor((haulT - dt) * 1.5)) sfx.play('stroke', { vol: 0.5, rate: 1.25, vary: 0.2, wet: 1 });
  teach('haul', 'the line: hold E and pull yourself along it. faster than swimming, and it knows the way out even when you cannot see it');
}
function updateLines(dt) {
  if (!linesPending.length) return;
  lineRestoreT -= dt; if (lineRestoreT > 0) return; lineRestoreT = 1;
  for (let i = linesPending.length - 1; i >= 0; i--) {
    const e = linesPending[i], n0 = G.sumpNodes.find(q => q.w === e.w && q.i === e.i);
    if (n0 && layLine(n0, e.coils, true)) linesPending.splice(i, 1);
  }
}
// roots through the roof near the surface
const rootMat = new THREE.MeshStandardMaterial({ color: 0x3d2f22, roughness: 0.95, flatShading: true });
const roots = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 0.25, 1, 5), rootMat, 1200); roots.count = 0; roots.frustumCulled = false; scene.add(roots);
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
  const light = borrowLight(0x5cff7a, 1.1, 9, 1.7, x, y + 0.15, z);
  const g = { x, y, z, light, mesh }; if (light) light.userData.owner = g; glow.push(g);
  sfx.play('torch_click', { vol: 0.5, rate: 1.4 });
  showHint(`glowstick down · ${player.sticks} left`);
}
// a stone, thrown ahead: you hear where it lands and how far down; on a crust of sediment, it may go through first
const stoneGeo = new THREE.DodecahedronGeometry(0.05, 0), stoneMat = new THREE.MeshStandardMaterial({ color: 0x6b6058, roughness: 1, flatShading: true });
const stones = [];
function throwStone() {
  if (!canAct()) return;
  camera.getWorldDirection(_fwd);
  const mesh = new THREE.Mesh(stoneGeo, stoneMat); mesh.position.copy(camera.position).addScaledVector(_fwd, 0.4); scene.add(mesh);
  stones.push({ mesh, x: mesh.position.x, y: mesh.position.y, z: mesh.position.z, vx: _fwd.x * 5.5, vy: _fwd.y * 5.5 + 0.8, vz: _fwd.z * 5.5, t: 0, bounces: 0 });   // a toss, not a throw: it lands where you are looking, a few metres out
  sfx.play('whoosh', { vol: 0.25, rate: 1.9 });
  teach('stone', 'a stone, thrown ahead: it tells you where the floor is, how far down the drop goes, and whether that floor is floor');
}
function updateStones(dt) {
  for (let i = stones.length - 1; i >= 0; i--) {
    const g = stones[i]; g.t += dt; let done = false;
    for (let k = 0; k < 3 && !done; k++) {
      const h = dt / 3; g.vy -= GRAV * h;
      const nx = g.x + g.vx * h, ny = g.y + g.vy * h, nz = g.z + g.vz * h;
      if (G.fieldAt(nx, ny, nz) > -0.06) {
        const sp = Math.hypot(g.vx, g.vy, g.vz);
        // a false floor takes a stone the way it takes you
        const ff = falseFloors.find(f => f.state !== 'gone' && f.slab && Math.hypot(nx - f.x, nz - f.z) < f.r - 0.3 && Math.abs(ny - f.y) < 0.6);
        if (ff && sp > 3) { ff.state = 'cracking'; ff.t = 0.4; sfx.play('rattle', { x: nx, y: ny, z: nz, vol: 0.7, rate: 0.8, wet: 0.6 }); showHint('the floor there is not floor', true); }
        sfx.play(sp > 3 ? 'rockfall' : 'step_gravel', { x: g.x, y: g.y, z: g.z, vol: Math.min(0.6, 0.15 + sp * 0.05), rate: rr(1.1, 1.5), dur: 0.45, wet: 0.8, rolloff: 0.6 });
        G.gradAt(g.x, g.y, g.z); const gr = G.G, gl = Math.hypot(gr.x, gr.y, gr.z) || 1, dot = (g.vx * gr.x + g.vy * gr.y + g.vz * gr.z) / gl;
        g.vx = (g.vx - 2 * dot * gr.x / gl) * 0.3; g.vy = (g.vy - 2 * dot * gr.y / gl) * 0.3; g.vz = (g.vz - 2 * dot * gr.z / gl) * 0.3;
        if (++g.bounces > 3 || sp < 1.5 || g.t > 8) done = true;
      } else { g.x = nx; g.y = ny; g.z = nz; }
      const wl = G.waterLevelAt(g.x, g.y, g.z);
      if (Number.isFinite(wl) && g.y < wl) { sfx.play('splash_small', { x: g.x, y: wl, z: g.z, vol: 0.5, wet: 0.6 }); done = true; }
    }
    g.mesh.position.set(g.x, g.y, g.z); g.mesh.rotation.x += dt * 7;
    if (done) { stones.splice(i, 1); gameDelay(() => scene.remove(g.mesh), 20000); }
  }
}
// a thrown glowstick: an arc along your view, a landing you hear, a light where it stops
const thrown = [];
function throwGlowstick(power) {
  if (player.sticks <= 0) { showHint('no glowsticks left'); return; }
  player.sticks--;
  camera.getWorldDirection(_fwd);
  const sp = 5 + power * 9;
  const mesh = new THREE.Mesh(stickGeo, stickMat); mesh.position.copy(camera.position).addScaledVector(_fwd, 0.4); scene.add(mesh);
  const light = borrowLight(0x5cff7a, 1.1, 9, 1.7, mesh.position.x, mesh.position.y, mesh.position.z);
  const th = { mesh, light, x: mesh.position.x, y: mesh.position.y, z: mesh.position.z, vx: _fwd.x * sp, vy: _fwd.y * sp + 1.5, vz: _fwd.z * sp, t: 0, spin: rr(4, 9) }; if (light) { light.userData.owner = th; light.userData.keep = true; } thrown.push(th);
  sfx.play('whoosh', { vol: 0.3, rate: 1.6 });
  showHint(`thrown · ${player.sticks} left`);
  teach('throw', 'hold G to throw a glowstick: down a pit, across a chamber. you hear where it lands');
}
function updateThrown(dt) {
  for (let i = thrown.length - 1; i >= 0; i--) {
    const g = thrown[i]; g.t += dt;
    const steps = 3; let hit = false;
    for (let k = 0; k < steps && !hit; k++) {
      const h = dt / steps; g.vy -= GRAV * h;
      const nx = g.x + g.vx * h, ny = g.y + g.vy * h, nz = g.z + g.vz * h;
      if (G.fieldAt(nx, ny, nz) > -0.06) {                                            // rock: bounce a little, or stop
        const sp = Math.hypot(g.vx, g.vy, g.vz);
        G.gradAt(g.x, g.y, g.z); const gr = G.G, gl = Math.hypot(gr.x, gr.y, gr.z) || 1;
        const dot = (g.vx * gr.x + g.vy * gr.y + g.vz * gr.z) / gl;
        g.vx = (g.vx - 2 * dot * gr.x / gl) * 0.25; g.vy = (g.vy - 2 * dot * gr.y / gl) * 0.25; g.vz = (g.vz - 2 * dot * gr.z / gl) * 0.25;
        if (sp > 2) sfx.play('rattle', { x: g.x, y: g.y, z: g.z, vol: Math.min(0.7, sp * 0.06), rate: rr(1.2, 1.6), dur: 0.35, wet: 0.7, rolloff: 0.6 });
        if (sp < 1.2 || g.t > 6) hit = true;
      } else { g.x = nx; g.y = ny; g.z = nz; }
      const wl = G.waterLevelAt(g.x, g.y, g.z);
      if (Number.isFinite(wl) && g.y < wl) { sfx.play('splash_small', { x: g.x, y: wl, z: g.z, vol: 0.5, wet: 0.6 }); g.vx *= 0.1; g.vz *= 0.1; g.vy = 0; g.y = wl - 0.05; hit = true; }
    }
    g.mesh.position.set(g.x, g.y, g.z); g.mesh.rotation.x += dt * g.spin; if (g.light) g.light.position.set(g.x, g.y + 0.1, g.z);
    if (hit) { thrown.splice(i, 1); const gl = { x: g.x, y: g.y, z: g.z, light: g.light, mesh: g.mesh }; if (g.light) { g.light.userData.owner = gl; g.light.userData.keep = false; } glow.push(gl); }
  }
}
// the camp: sleeping bags, a stove, packs, a rope bag, and everything they wrote on the walls
const bagGeo = new THREE.CapsuleGeometry(0.28, 1.3, 3, 7).rotateZ(Math.PI / 2), bagMat = new THREE.MeshStandardMaterial({ color: 0x3a3244, roughness: 0.98, flatShading: true });
const stoveGeo = new THREE.CylinderGeometry(0.09, 0.11, 0.14, 8), stoveMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.5, metalness: 0.6 });
function placeCamp(p) {
  let sd = p.seed * 233280 | 0; const R = () => (sd = (sd * 9301 + 49297) % 233280) / 233280;
  const spot = (r) => { const a = R() * Math.PI * 2, d = R() * r; const x = p.x + Math.sin(a) * d, z = p.z + Math.cos(a) * d; const fy = floorBelow(x, p.y + 1, z); return fy === null ? null : { x, y: fy, z }; };
  for (let k = 0; k < 3; k++) { const q = spot(p.rx * 0.5); if (!q) continue; const m = new THREE.Mesh(bagGeo, bagMat); m.position.set(q.x, q.y + 0.2, q.z); m.rotation.y = R() * 6.28; m.scale.set(1, 0.55, 1); m.castShadow = true; scene.add(m); }
  const st = spot(p.rx * 0.3); if (st) { const m = new THREE.Mesh(stoveGeo, stoveMat); m.position.set(st.x, st.y + 0.07, st.z); scene.add(m); }
  // what they left, and what they knew
  const kinds = ['kit', 'cells', 'rope', 'page', 'page', 'sticks', 'suit'];
  for (const k of kinds) { const q = spot(p.rx * 0.6); if (!q) continue; placeCache(q.x, q.y, q.z, k, k === 'page' ? (R() < 0.5 ? composeSurvey(q.x, q.y, q.z, R) : { text: ['day 11. nobody has come. we stop here tonight and decide in the morning', 'day 12. the torch is the problem. we take turns in the dark to save it', 'day 14. it rained. the way we came is under water. we are going on', 'day 9. the far side of the sump has a chamber and air. it is the only way we have not tried', 'the water rises here. do not camp low'][(R() * 5) | 0] }) : null); }
  // chalk everywhere: names, days, arrows, the last count
  const names = CAVER_NAMES.slice().sort(() => R() - 0.5).slice(0, 3);
  for (const t of [names.join(' · '), `day ${8 + (R() * 8 | 0)}`, 'we came in from there ->', '<- untried', `${names[0]} went to look. ${5 + (R() * 30 | 0)} hours`, 'do not follow the water', 'the light is the clock']) G.props.push({ type: 'note', x: p.x + (R() - 0.5) * p.rx, y: p.y, z: p.z + (R() - 0.5) * p.rx, text: t });
  placeBones({ x: p.x + (R() - 0.5) * 2, y: p.y, z: p.z + (R() - 0.5) * 2, rx: 1.2, ry: 1, big: false, seed: R() });
  campSite = { x: p.x, y: p.y, z: p.z };
}
let campSite = null, campSeen = false;
function updateCamp(dt) {
  if (!campSite || campSeen || Math.hypot(campSite.x - player.x, campSite.y - player.y, campSite.z - player.z) > 8) return;
  campSeen = true; showHint('a camp. sleeping bags, a stove. nobody', true); surveyNote('camp', campSite.x, campSite.z);
  if (!places.some(pl => Math.hypot(pl.x - campSite.x, pl.z - campSite.z) < 30)) { places.push({ x: campSite.x, y: campSite.y, z: campSite.z, name: 'The Camp', kind: 'camp' }); }
  sfx.play('creature_breath', { vol: 0.15, rate: 0.7, wet: 0.9 });
}
// caches: a dead caver's pack next to some bones
const caches = [];           // {x,y,z, kind, taken, mesh}
const packGeo = new THREE.BoxGeometry(0.28, 0.2, 0.16), packMat = new THREE.MeshStandardMaterial({ color: 0x3b3a36, roughness: 0.9, flatShading: true });
function placeCache(x, y, z, kind, text) {
  if (kind === 'page' && (cave.pages || []).some(pg => pg.key === `${x.toFixed(0)},${z.toFixed(0)}`)) return;   // already read, on an earlier attempt
  const mesh = new THREE.Mesh(kind === 'page' ? pageGeo : packGeo, kind === 'page' ? pageMat : packMat); mesh.position.set(x, y + (kind === 'page' ? 0.015 : 0.1), z); mesh.rotation.y = rr(0, 6); if (kind !== 'page') mesh.rotation.z = rr(-0.3, 0.3); scene.add(mesh);
  const tag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.05), new THREE.MeshBasicMaterial({ color: kind === 'battery' ? 0xffb347 : kind === 'rope' ? 0xff7a5c : kind === 'cells' ? 0xffffff : kind === 'page' ? 0xf1e6cc : kind === 'kit' ? 0xff4d4d : kind === 'suit' ? 0x3a6fd8 : 0x9dffb0, fog: false }));
  tag.position.set(x, y + 0.22, z); scene.add(tag);
  caches.push({ x, y, z, kind, text, taken: false, mesh, tag });
}
const pageGeo = new THREE.PlaneGeometry(0.21, 0.28).rotateX(-Math.PI / 2), pageMat = new THREE.MeshStandardMaterial({ color: 0xd9ccb0, roughness: 0.9, side: THREE.DoubleSide });
// a page from someone's log: what they learned about the rock near where they stopped
const DIRS8 = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
function bearing(dx, dz) { const a = Math.atan2(dx, -dz); return DIRS8[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8]; }
const CAVER_NAMES = ['Anna', 'Tomas', 'Priya', 'Dan', 'Lise', 'Marek', 'Ola', 'Ben', 'Ines', 'Kit'];
// a torn survey sheet: the main way from here on, as far as whoever drew it got
function composeSurvey(x, y, z, R) {
  let best = null, bd = 80; for (const n of G.nodes) { if (!G.trunkIds.has(n.w)) continue; const d = Math.hypot(n.x - x, n.z - z); if (d < bd) { bd = d; best = n; } }
  if (!best) return composePage(x, y, z, R);
  const line = []; for (let i = best.i; i < best.i + 34; i += 2) { const n = G.nodes.find(q => q.w === best.w && q.i === i); if (!n) break; line.push([+n.x.toFixed(1), +n.z.toFixed(1)]); }
  if (line.length < 5) return composePage(x, y, z, R);
  return { survey: line, text: `a torn survey sheet: ${Math.round(line.length * 3 / 5) * 5} m of the main way, in someone\u2019s pencil` };
}
function composePage(x, y, z, R) {
  const near = (arr, lim) => { let b = null, bd = lim; for (const n of arr) { const d = Math.hypot(n.x - x, n.z - z); if (d < bd && d > 4) { bd = d; b = n; } } return b; };
  const name = CAVER_NAMES[(R() * CAVER_NAMES.length) | 0], day = 2 + ((R() * 9) | 0);
  const opts = [];
  const sp = near(G.sumpNodes, 70);
  if (sp) opts.push(sp.sump.trap ? `the sump ${bearing(sp.x - x, sp.z - z)} of here does not come up again. ${name} went in first. don\u2019t`
                                : `the sump ${bearing(sp.x - x, sp.z - z)} of here goes about ${Math.round(sp.sump.len / 5) * 5} m under. ${sp.sump.bell ? (sp.sump.foulBell ? 'there is air about halfway. do not trust it' : 'there is air about halfway') : 'no air till the far side'}`);
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
  if (p.lasting) { cave.marks.push({ text: p.text, x: best.x, y: best.y, z: best.z, nx: -g.x / gl, ny: -g.y / gl, nz: -g.z / gl }); saveCave(); }
}
// cave pearls: calcite spheres, polished by the water that made them
const pearlInst = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 5), new THREE.MeshStandardMaterial({ color: 0xf2ead8, roughness: 0.35 }), 1500); pearlInst.count = 0; pearlInst.frustumCulled = false; scene.add(pearlInst);
function placePearls(p) {
  let sd = p.seed * 233280 | 0; const R = () => (sd = (sd * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < p.n && pearlInst.count < 1500; i++) {
    const a = R() * Math.PI * 2, d = Math.sqrt(R()) * p.r, x = p.x + Math.sin(a) * d, z = p.z + Math.cos(a) * d;
    const fy = floorBelow(x, p.y + 0.3, z); if (fy === null || fy > p.y - 0.02) continue;      // on the pool floor, under the water
    const r = 0.025 + R() * 0.035;
    _m.compose(_p.set(x, fy + r * 0.8, z), _q.identity(), _s.set(r, r * 0.9, r)); pearlInst.setMatrixAt(pearlInst.count++, _m);
  }
  pearlInst.instanceMatrix.needsUpdate = true;
}
// draperies: a wavy calcite sheet hung from the roof
const curtainMat = new THREE.MeshStandardMaterial({ color: 0xe8d9b8, roughness: 0.5, emissive: 0x1a1408, side: THREE.DoubleSide, flatShading: true, transparent: true, opacity: 0.92 });
function placeCurtain(p) {
  // the roof at this spot
  let cy = null; for (let h = 0; h < 8; h += 0.12) { const yy = p.floor + 1.5 + h; if (G.fieldAt(p.x, yy, p.z) > -0.04) { cy = yy; break; } }
  if (cy === null) return;
  let sd = p.seed * 233280 | 0; const R = () => (sd = (sd * 9301 + 49297) % 233280) / 233280;
  const W = p.width, L = Math.min(p.len, cy - p.floor - 0.9), segs = 14;
  const g = new THREE.PlaneGeometry(W, L, segs, 4), pos = g.attributes.position, ph = R() * 6.28, freq = 2.5 + R() * 3;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), t = (y + L / 2) / L;                       // t: 0 bottom, 1 top (hangs from the top edge)
    pos.setZ(i, Math.sin(x * freq + ph) * 0.12 * (1.2 - t) + Math.sin(x * freq * 2.3 + ph * 2) * 0.05);
    pos.setY(i, y - (1 - t) * Math.abs(Math.sin(x * freq * 0.7 + ph)) * 0.35);            // a scalloped bottom edge
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, curtainMat); m.position.set(p.x, cy - L / 2 + 0.05, p.z); m.rotation.y = R() * Math.PI; m.castShadow = true; scene.add(m);
}
// mist: a few soft, slow sheets just above still water
const mistTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const r = g.createRadialGradient(64, 64, 4, 64, 64, 62); r.addColorStop(0, 'rgba(200,215,210,0.3)'); r.addColorStop(0.5, 'rgba(200,215,210,0.1)'); r.addColorStop(1, 'rgba(200,215,210,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
const mistMat = new THREE.MeshBasicMaterial({ map: mistTex, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide, fog: false });
const mists = [];
function placeMist(p) {
  let sd = p.seed * 233280 | 0; const R = () => (sd = (sd * 9301 + 49297) % 233280) / 233280;
  for (let k = 0; k < 3; k++) {
    const sz = Math.min(7, p.r * 0.9);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(sz, sz), mistMat); m.rotation.x = -Math.PI / 2;
    m.position.set(p.x + (R() - 0.5) * p.r, p.y + 0.5 + k * 0.25, p.z + (R() - 0.5) * p.r); m.rotation.z = R() * 6.28; scene.add(m);
    mists.push({ mesh: m, x0: m.position.x, z0: m.position.z, ph: R() * 6.28, sp: 0.03 + R() * 0.04 });
  }
}
function updateMists(dt) {
  const t = gameClock * 0.001;
  for (const m of mists) { m.mesh.position.x = m.x0 + Math.sin(t * m.sp + m.ph) * 1.2; m.mesh.position.z = m.z0 + Math.cos(t * m.sp * 0.8 + m.ph) * 1.2; m.mesh.rotation.z += dt * 0.02; }
}
// fossils: drawn on a canvas, pressed into the nearest wall like chalk
function fossilTexture(kind, seed) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const ctx = cv.getContext('2d');
  let sd = seed * 233280 | 0; const R = () => (sd = (sd * 9301 + 49297) % 233280) / 233280;
  ctx.strokeStyle = 'rgba(60,48,38,0.9)'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  if (kind === 0) {                                                            // ammonite: a spiral with ribs
    ctx.beginPath(); for (let t = 0; t < Math.PI * 7; t += 0.08) { const r = 6 + t * 5.2; const x = 128 + Math.cos(t) * r, y = 128 + Math.sin(t) * r; t ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke();
    ctx.lineWidth = 3; for (let t = Math.PI * 2; t < Math.PI * 7; t += 0.35) { const r0 = 6 + t * 5.2, r1 = 6 + (t + Math.PI * 2) * 5.2; ctx.beginPath(); ctx.moveTo(128 + Math.cos(t) * r0, 128 + Math.sin(t) * r0); ctx.lineTo(128 + Math.cos(t + 0.15) * r1, 128 + Math.sin(t + 0.15) * r1); ctx.stroke(); }
  } else if (kind === 1) {                                                     // crinoid stem: a stack of discs
    const a = R() * Math.PI, dx = Math.cos(a), dy = Math.sin(a); ctx.lineWidth = 4;
    for (let k = -14; k <= 14; k++) { const cx = 128 + dx * k * 7, cy = 128 + dy * k * 7; ctx.beginPath(); ctx.ellipse(cx, cy, 12, 5, a + Math.PI / 2, 0, Math.PI * 2); ctx.stroke(); }
  } else {                                                                     // a brachiopod shell: a fan of ribs
    ctx.beginPath(); ctx.arc(128, 150, 70, Math.PI, 0); ctx.lineTo(128, 150); ctx.closePath(); ctx.stroke();
    ctx.lineWidth = 2.5; for (let k = 0; k <= 14; k++) { const a = Math.PI + k / 14 * Math.PI; ctx.beginPath(); ctx.moveTo(128, 150); ctx.lineTo(128 + Math.cos(a) * 68, 150 + Math.sin(a) * 68); ctx.stroke(); }
  }
  const img = ctx.getImageData(0, 0, 256, 256), d = img.data;
  for (let i = 3; i < d.length; i += 4) if (d[i]) d[i] = d[i] * (0.35 + 0.65 * Math.random());
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}
function placeFossil(p) {
  let best = null, bd = 6, bn = null;
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * Math.PI * 2 + p.seed, dx = Math.sin(a), dz = Math.cos(a);
    const t = G.rayToRock(p.x, p.y + 1.1 + p.seed * 0.5, p.z, dx, 0, dz, 5, 0.1);
    if (t < bd) { bd = t; best = new THREE.Vector3(p.x + dx * (t - 0.02), p.y + 1.1 + p.seed * 0.5, p.z + dz * (t - 0.02)); }
  }
  if (!best) return;
  G.gradAt(best.x, best.y, best.z); const g = G.G, gl = Math.hypot(g.x, g.y, g.z) || 1; const normal = new THREE.Vector3(-g.x / gl, -g.y / gl, -g.z / gl);
  const mat = new THREE.MeshLambertMaterial({ map: fossilTexture(p.kind, p.seed), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  decalHelper.position.copy(best); decalHelper.lookAt(best.clone().add(normal)); decalHelper.rotateZ(p.seed * 6.28);
  const size = new THREE.Vector3(p.size, p.size, 0.4); let placed = false;
  const cx = Math.floor(best.x / G.CHUNK), cy = Math.floor(best.y / G.CHUNK), cz = Math.floor(best.z / G.CHUNK);
  for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const ch = G.chunks.get(G.ckey(cx + dx, cy + dy, cz + dz)); if (!ch || !ch.mesh) continue;
    if (ch.mesh.geometry.boundingSphere.distanceToPoint(best) > p.size) continue;
    ch.mesh.updateMatrixWorld();
    const geo = new DecalGeometry(localMesh(ch.mesh, best, p.size), best, decalHelper.rotation, size);
    if (geo.attributes.position && geo.attributes.position.count > 0) { scene.add(new THREE.Mesh(geo, mat)); placed = true; }
  }
  if (placed) fossils.push({ x: best.x, y: best.y, z: best.z, kind: p.kind });
}
const fossils = [];
let fossilT = 0;
function updateFossils(dt) {
  fossilT -= dt; if (fossilT > 0) return; fossilT = 1;
  for (const f of fossils) if (Math.hypot(f.x - player.x, f.y - player.y - 1.2, f.z - player.z) < 2.2) { teach('fossil', ['an ammonite in the wall. this was a sea floor once. the rock is older than you can think about', 'a crinoid stem in the wall: a stack of little discs. it was an animal, on a sea floor, a very long time ago', 'a shell in the wall. the whole hill is made of them'][f.kind]); break; }
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
  const t = gameClock * 0.001;
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
// the surface keeps real time: what comes down a shaft, or in at the mouth, is the light outside right now
function daylight() {
  const h = new Date().getHours() + new Date().getMinutes() / 60;
  if (h < 5 || h >= 21.5) return { sky: 0x1c2436, k: 0.06, name: 'night' };
  if (h < 7 || h >= 19.5) return { sky: 0xb07a5a, k: 0.35, name: 'dusk' };
  return { sky: 0x8fa0b4, k: 1, name: 'day' };
}
function placeSinkhole(p) {
  const dl = daylight();
  if (!p.window && cave.deaths.length >= 6 && !ropes.some(r => r.rescue)) {   // someone up there has counted: a rope comes down the hole
    const r = { x: p.x, z: p.z, top: p.y - 0.3, bottom: p.floor, rescue: true, mesh: new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, p.y - p.floor + 0.3, 5), new THREE.MeshStandardMaterial({ color: 0xd8442a, roughness: 0.8 })) };
    r.mesh.position.set(p.x, (p.y + p.floor) / 2 - 0.15, p.z); scene.add(r.mesh); ropes.push(r);
    gameDelay(() => showHint('a rope. down the hole you fell through. red, and new', true), 4000);
  }
  const sky = new THREE.Mesh(new THREE.CircleGeometry(0.75, 24), new THREE.MeshBasicMaterial({ color: dl.sky, fog: false }));
  sky.position.set(p.x, p.y + 0.2, p.z); sky.rotation.x = Math.PI / 2; scene.add(sky);                    // seen from below
  const shaft = borrowSpot(dl.name === 'night' ? 0x6f7ea0 : dl.name === 'dusk' ? 0xd4a070 : 0x9fb2c8, 60 * Math.max(0.15, dl.k), 26, 0.18, p.x, p.y, p.z, p.x, p.floor, p.z);
  const pool = borrowLight(0x8fa4bc, 1.2 * Math.max(0.2, dl.k), 6, 1.6, p.x, p.floor + 0.6, p.z); if (pool) pool.userData.keep = true;
  sinkhole = { ...p, sky, shaft, pool, dripT: 0 };
  // rain down the shaft, into a puddle
  placeCascade({ x: p.x, y: p.y - 0.5, z: p.z, wl: p.floor + 0.02, big: false, quiet: true });
  if (p.window && soundsOn) { const b = sfx.loop('birds', { x: p.x, y: p.y + 1, z: p.z, rolloff: 1.2 }); b.setVol(daylight().name === 'night' ? 0.08 : 0.5, 2); }
}
let exitInfo = null, exitLoops = null, exitDaylight = 'day';
const exitGrassMat = new THREE.MeshStandardMaterial({ color: 0x4f6a2e, roughness: 1, side: THREE.DoubleSide }), exitTreeMat = new THREE.MeshBasicMaterial({ color: 0x06090a, fog: false });
function placeExit(e) {
  exitInfo = e;
  if (soundsOn) exitLoops = { wind: sfx.loop('wind', { x: e.x, y: e.y + 2, z: e.z, rolloff: 0.35, wet: 0.3 }), birds: sfx.loop('birds', { x: e.x + e.dx * 4, y: e.y + 3, z: e.z + e.dz * 4, rolloff: 0.6 }) };
  const dl = daylight();
  const disc = new THREE.Mesh(new THREE.CircleGeometry(5.5, 40), new THREE.MeshBasicMaterial({ color: dl.name === 'night' ? 0x2a3450 : dl.name === 'dusk' ? 0xe0a070 : 0xfff4dc, fog: false }));
  disc.position.set(e.x + e.dx * 4.6, e.y + 2.2, e.z + e.dz * 4.6); disc.lookAt(e.n1.x, e.n1.y + 1.5, e.n1.z);
  scene.add(disc);
  const sun = borrowLight(dl.name === 'night' ? 0x7f90c0 : dl.name === 'dusk' ? 0xffb070 : 0xfff1d6, 140 * Math.max(0.12, dl.k), 60, 2, e.x + e.dx * 3, e.y + 3, e.z + e.dz * 3); if (sun) sun.userData.keep = true;
  const sky = borrowLight(0x9fc4ff, 30 * Math.max(0.2, dl.k), 40, 2, e.n1.x, e.n1.y + 1.8, e.n1.z); if (sky) sky.userData.keep = true;
  exitDaylight = dl.name;
  // trees against the light: dark shapes past the mouth, and grass at the lip
  const treeMat = exitTreeMat;
  for (let k = 0; k < 6; k++) {
    const side = (k % 2 ? 1 : -1) * (1.0 + Math.random() * 3.2), along = 3.4 + Math.random() * 1.0, h = 3 + Math.random() * 4;   // just inside the disc, so they stand against the light
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.5 + Math.random() * 0.8, h, 5), treeMat);
    t.position.set(e.x + e.dx * along - e.dz * side, e.y + 2.2 + h / 2 - 1.5, e.z + e.dz * along + e.dx * side); scene.add(t);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 2.5, 5), treeMat); trunk.position.set(t.position.x, t.position.y - h / 2 - 1.0, t.position.z); scene.add(trunk);
  }
  const grassMat = exitGrassMat;
  for (let k = 0; k < 40; k++) { const g = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.25 + Math.random() * 0.3), grassMat); const along = 2.5 + Math.random() * 3, side = (Math.random() - 0.5) * 5; const gx = e.x + e.dx * along - e.dz * side, gz = e.z + e.dz * along + e.dx * side; const fy = floorBelow(gx, e.y + 2, gz); if (fy === null) continue; g.position.set(gx, fy + 0.15, gz); g.rotation.y = Math.random() * 3.14; g.rotation.z = (Math.random() - 0.5) * 0.4; scene.add(g); }
}
let propTimer = 0;
function processProps(dt) {
  propTimer -= dt; if (propTimer > 0) return; propTimer = 0.25;
  let placed = 0;                                                        // a few per call: placing is raycasts and geometry, spread it out
  for (let i = G.props.length - 1; i >= 0 && placed < 4; i--) {
    const p = G.props[i];
    if (p.type === 'exit') { placeExit(p); G.props.splice(i, 1); continue; }
    const d = Math.hypot(p.x - player.x, p.y - player.y, p.z - player.z);
    if (d > 45) continue;
    if (!G.chunkReadyAt(p.x, p.y + 0.5, p.z)) continue;
    placed++;
    const tp0 = performance.now();
    if (p.type === 'remains') placeRemains(p); else if (p.type === 'mark') { drawMark(p.text, new THREE.Vector3(p.x, p.y, p.z), new THREE.Vector3(p.nx, p.ny, p.nz), true); placed = 4; }
    else if (p.type === 'crystals') placeCrystals(p);
    else if (p.type === 'roost') placeRoost(p);
    else if (p.type === 'cascade') placeCascade(p);
    else if (p.type === 'sinkhole') placeSinkhole(p);
    else if (p.type === 'roots') placeRoots(p);
    else if (p.type === 'note') { placeNote(p); placed = 4; }                 // a decal walks every triangle of the chunk mesh: one per call
    else if (p.type === 'loose') placeLoose(p);
    else if (p.type === 'glowworms') { if (!placeGlowworms(p)) continue; }
    else if (p.type === 'fossil') { placeFossil(p); placed = 4; }
    else if (p.type === 'curtain') placeCurtain(p);
    else if (p.type === 'oldrope') placeOldRope(p);
    else if (p.type === 'pearls') placePearls(p);
    else if (p.type === 'camp') { placeCamp(p); placed = 4; }
    else if (p.type === 'falsefloor') falseFloors.push({ ...p, slab: p.node.slabs && p.node.slabs[0], state: 'whole', t: 0 });
    else if (p.type === 'mist') placeMist(p);
    else placeBones(p);
    const tpd = performance.now() - tp0; if (tpd > (stats.propMs[p.type] || 0)) stats.propMs[p.type] = tpd;
    G.props.splice(i, 1);
  }
  // algae lights follow the nearest dense patches
  const near = G.algaeNodes.filter(n => Math.hypot(n.x - player.x, n.y - player.y, n.z - player.z) < 26)
    .sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y, a.z - player.z) - Math.hypot(b.x - player.x, b.y - player.y, b.z - player.z));
  for (let i = 0; i < algaeLights.length; i++) {
    const l = algaeLights[i], n = near[i];
    if (!n) { l.intensity = 0; continue; }
    l.position.set(n.x, n.y + 0.9, n.z); l.intensity = 0.3 * n.algae; l.color.set(n.blue ? 0x6fa0ff : 0x2fd8b0);
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
const keys = {}, keyboard = {};
let running = false, dragLook = false, dragging = false, typing = false, showDebug = false;
let toolsOpen = false, toolChoice = -1, wheelX = 0, wheelY = 0, restRequested = false;
let mouseCharge = false, mouseFocus = false, padCharge = false, padFocus = false, chargeT = 0;
let glowHeldAt = null, playRequest = 0, wheelSource = 'keyboard';
const overlay = $('overlay'), chalkIn = $('chalk'), toolNames = ['chalk', 'whistle', 'rest', 'stone'];
const controlHelp = $('ov-body').innerHTML;
function canAct() { return running && player.alive && !player.out; }
function clearInputs() {
  for (const k in keys) keys[k] = false;
  for (const k in keyboard) keyboard[k] = false;
  mouseCharge = mouseFocus = padCharge = padFocus = dragging = false;
  glowHeldAt = null; chargeT = 0; beamNarrow = false;
}
function selectTool(x, y) {
  wheelX = clamp(x, -120, 120); wheelY = clamp(y, -120, 120);
  toolChoice = Math.hypot(wheelX, wheelY) < 22 ? -1 : wheelY < -Math.abs(wheelX) * 0.7 ? 0 : wheelY > Math.abs(wheelX) * 0.7 ? 3 : wheelX >= 0 ? 1 : 2;
  $('wheel-cursor').style.transform = `translate(${wheelX}px, ${wheelY}px)`;
  toolNames.forEach((name, i) => $('tool-' + name).classList.toggle('selected', i === toolChoice));
}
function openTools(source = 'keyboard') {
  if (!canAct() || typing || toolsOpen) return;
  if (notebookOpen) toggleNotebook();
  clearInputs();
  toolsOpen = true; wheelSource = source; mouseCharge = mouseFocus = false; glowHeldAt = null;
  $('tools').hidden = false; selectTool(0, 0);
  $('tools-help').innerHTML = source === 'gamepad' ? 'Right stick to choose · release Y to use<br>The cave keeps moving · Menu pauses' : 'Move the mouse to choose · release Q to use<br>The cave keeps moving · Esc pauses';
}
function closeTools(use = false) {
  const choice = toolChoice;
  toolsOpen = false; $('tools').hidden = true; selectTool(0, 0);
  if (!use || !canAct() || choice < 0) return;
  if (choice === 0) { if (wheelSource === 'gamepad') placeMark(chalkArrow()); else openChalk(); }   // no keyboard on a pad: an arrow the way you face
  else if (choice === 1) whistle();
  else if (choice === 3) throwStone();
  else {
    if (restRequested) restRequested = false;
    else if (player.grounded && !player.swim && player.wl - player.y < 0.2 && stuck === 0 && !roping && !climbing) { restRequested = true; clearInputs(); showHint('resting. move to stand up', true); }
    else showHint('find dry, steady ground to rest');
  }
}
for (const [i, name] of toolNames.entries()) $('tool-' + name).addEventListener('click', e => { e.stopPropagation(); toolChoice = i; closeTools(true); });
function openChalk() {
  typing = true; clearInputs(); chalkIn.value = ''; chalkIn.style.display = 'block'; chalkIn.focus();
  showHint('write a note · Enter to mark · Esc to cancel', true);
}
function closeChalk() { typing = false; chalkIn.style.display = 'none'; chalkIn.blur(); }
function beginGlow() { if (canAct() && !typing && !toolsOpen && !notebookOpen) glowHeldAt = performance.now(); }
function releaseGlow() {
  if (glowHeldAt === null) return;
  const held = (performance.now() - glowHeldAt) / 1000; glowHeldAt = null;
  if (!canAct() || typing || toolsOpen || notebookOpen) return;
  if (held > 0.3) throwGlowstick(Math.min(1, (held - 0.3) / 0.9)); else dropGlowstick();
}
function pauseGame() {
  if (!canAct()) return;
  saveRun(); running = false; playRequest++; clearInputs(); closeTools();
  if (typing) closeChalk();
  $('ov-title').textContent = 'PAUSED'; $('ov-sub').textContent = 'take a breath. the cave can wait.';
  $('ov-body').innerHTML = controlHelp; $('go').textContent = 'CONTINUE';
  $('menu-actions').hidden = false; $('abandon-confirm').hidden = true;
  overlay.classList.remove('hidden'); overlay.classList.remove('over');
  if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  sfx.ctx.suspend().catch(() => {});
}
function requestPlay() {
  if (player.out) { newCave(); return; }
  if (!player.alive) { sameCave(); return; }
  const request = ++playRequest; sfx.resume();
  if (!canvas.requestPointerLock) { dragLook = true; start(); return; }
  try {
    const result = canvas.requestPointerLock({ unadjustedMovement: true });
    if (result && result.catch) result.catch(() => { if (request === playRequest) { dragLook = true; start(); } });
  } catch (e) { if (request === playRequest) { dragLook = true; start(); } }
}
$('go').addEventListener('click', requestPlay);
$('abandon').addEventListener('click', () => { $('abandon-confirm').hidden = false; $('keep-cave').focus(); });
$('keep-cave').addEventListener('click', () => { $('abandon-confirm').hidden = true; $('abandon').focus(); });
$('leave-cave').addEventListener('click', newCave);
addEventListener('keydown', e => {
  if (e.code === 'Escape') {
    e.preventDefault();
    if (typing) closeChalk();
    if (canAct()) pauseGame();
    else if (!$('abandon-confirm').hidden) $('abandon-confirm').hidden = true;
    return;
  }
  if (typing) {
    if (e.code === 'Enter') { e.preventDefault(); const text = chalkIn.value.trim(); closeChalk(); placeMark(text || chalkArrow()); }   // an empty note is an arrow the way you face
    return;
  }
  if (!canAct()) return;
  if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyQ'].includes(e.code)) e.preventDefault();
  if (toolsOpen) return;
  if (notebookOpen) { if (e.code === 'Tab' && !e.repeat) toggleNotebook(); return; }
  keyboard[e.code] = keys[e.code] = true;
  if (e.code === 'Backquote' && !e.repeat) showDebug = !showDebug;
  if (e.code === 'Tab' && !e.repeat && !toolsOpen) { mouseCharge = mouseFocus = false; glowHeldAt = null; toggleNotebook(); }
  if (e.code === 'KeyQ' && !e.repeat) openTools();
  if (toolsOpen || notebookOpen) return;
  if (e.code === 'KeyG' && !e.repeat) beginGlow();
  if (e.code === 'KeyE' && !e.repeat) { restRequested = false; eHeldAt = performance.now(); }
});
addEventListener('keyup', e => {
  keyboard[e.code] = keys[e.code] = false;
  if (e.code === 'KeyQ' && toolsOpen && wheelSource === 'keyboard') closeTools(true);
  if (e.code === 'KeyG') releaseGlow();
  if (e.code === 'KeyE' && eHeldAt) { const held = (performance.now() - eHeldAt) / 1000; eHeldAt = 0; if (hauled) hauled = false; else if (canAct() && !typing && !toolsOpen && !notebookOpen) { if (held > 0.6) derigRope(); else useRope(); } }
});
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('mousedown', e => {
  if (!canAct() || typing || toolsOpen || notebookOpen) return;
  if (e.button === 0) { mouseCharge = true; restRequested = false; }
  if (e.button === 2) mouseFocus = true;
  // If pointer lock is unavailable, middle-drag looks without also charging or focusing.
  if (e.button === 1) { e.preventDefault(); dragging = true; }
});
addEventListener('mouseup', e => { if (e.button === 0) mouseCharge = false; if (e.button === 2) mouseFocus = false; if (e.button === 1) dragging = false; });
function look(dx, dy) { player.yaw -= dx * 0.0022 * settings.sens; player.pitch = clamp(player.pitch - dy * 0.0022 * settings.sens * (settings.inv ? -1 : 1), -1.5, 1.5); }
addEventListener('mousemove', e => {
  if (!canAct() || typing) return;
  if (toolsOpen) { selectTool(wheelX + e.movementX, wheelY + e.movementY); return; }
  if (!notebookOpen && (document.pointerLockElement === canvas || (dragLook && dragging))) look(e.movementX, e.movementY);
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) { dragLook = false; if (!running) start(); }
  else if (canAct()) pauseGame();
});
addEventListener('blur', () => { if (canAct()) pauseGame(); else { clearInputs(); playRequest++; } });
document.addEventListener('visibilitychange', () => { if (document.hidden && canAct()) pauseGame(); });
let settings = { sens: 1, vol: 0.9, inv: false, hud: true };
try { settings = Object.assign(settings, JSON.parse(localStorage.getItem('karst.settings') || '{}')); } catch (e) {}
function applySettings() {
  $('s-sens').value = settings.sens; $('s-vol').value = settings.vol; $('s-inv').checked = settings.inv; $('s-hud').checked = settings.hud;
  for (const id of ['torchm', 'breathm', 'hint', 'hud', 'context']) $(id).style.visibility = settings.hud ? 'visible' : 'hidden';
  if (sfx.master) sfx.master.gain.value = settings.vol;
  try { localStorage.setItem('karst.settings', JSON.stringify(settings)); } catch (e) {}
}
$('s-sens').addEventListener('input', e => { settings.sens = +e.target.value; applySettings(); });
$('s-vol').addEventListener('input', e => { settings.vol = +e.target.value; applySettings(); });
$('s-inv').addEventListener('change', e => { settings.inv = e.target.checked; applySettings(); });
$('s-hud').addEventListener('change', e => { settings.hud = e.target.checked; applySettings(); });
const padPrev = {}; let padSeen = false;
function pollGamepad(dt) {
  const pads = navigator.getGamepads ? navigator.getGamepads() : []; let gp = null;
  for (const g of pads) if (g && g.connected) { gp = g; break; }
  const merged = ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'Space', 'KeyC', 'ShiftLeft'];
  if (!gp) {
    if (padSeen) { for (const k of merged) keys[k] = !!keyboard[k]; padSeen = false; padCharge = padFocus = padUseHeld = false; glowHeldAt = null; for (const k in padPrev) delete padPrev[k]; if (toolsOpen && wheelSource === 'gamepad') closeTools(); }
    return;
  }
  padSeen = true;
  const pressed = Array.from({ length: 16 }, (_, i) => !!gp.buttons[i]?.pressed);
  const down = i => pressed[i] && !padPrev[i], up = i => !pressed[i] && padPrev[i];
  const finish = () => pressed.forEach((v, i) => { padPrev[i] = v; });
  if (!canAct()) { if (down(0) || down(9)) { if (!$('abandon-confirm').hidden) $('abandon-confirm').hidden = true; else if (!overlay.classList.contains('hidden')) { if (!player.alive || player.out) requestPlay(); else { dragLook = true; start(); } } } finish(); return; }
  if (down(9)) { pauseGame(); finish(); return; }
  if (typing) { if (down(1)) closeChalk(); finish(); return; }
  const lx = gp.axes[0] || 0, ly = gp.axes[1] || 0, rx = gp.axes[2] || 0, ry = gp.axes[3] || 0;
  for (const [code, value] of Object.entries({ KeyW: ly < -0.3, KeyS: ly > 0.3, KeyA: lx < -0.3, KeyD: lx > 0.3, Space: pressed[0], KeyC: pressed[1], ShiftLeft: pressed[6] })) keys[code] = value || !!keyboard[code];
  if (down(3)) openTools('gamepad');
  if (toolsOpen) { for (const k of merged) keys[k] = false; padCharge = padFocus = false; if (wheelSource === 'gamepad') { if (up(3)) closeTools(true); else selectTool(rx * 120, ry * 120); } finish(); return; }
  if (down(8)) toggleNotebook();
  if (notebookOpen) { for (const k of merged) keys[k] = false; }
  if (!notebookOpen) {
    if (Math.abs(rx) > 0.18 || Math.abs(ry) > 0.18) look((Math.abs(rx) > 0.18 ? rx : 0) * 900 * dt, (Math.abs(ry) > 0.18 ? ry : 0) * 700 * dt);
    if (down(12)) { restRequested = false; useRope(); }
    if (down(5)) beginGlow(); if (up(5)) releaseGlow();
  }
  padCharge = pressed[2] && !notebookOpen; padFocus = pressed[4] && !notebookOpen; padUseHeld = pressed[12] && !notebookOpen;
  if (padCharge) restRequested = false;
  finish();
}
// controller rumble, when there is a controller and it can
function rumble(strong, weak, ms) {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const g of pads) if (g && g.connected && g.vibrationActuator && g.vibrationActuator.playEffect) { try { g.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }); } catch (e) {} break; }
}
function updateHeldControls(dt) {
  const available = canAct() && !typing && !toolsOpen && !notebookOpen;
  const focus = available && torchHeld && (mouseFocus || padFocus);
  if (focus !== beamNarrow) { beamNarrow = focus; sfx.play('torch_click', { vol: 0.5, rate: focus ? 1.3 : 1.0 }); }
  if (available && torchHeld && (mouseCharge || padCharge)) {
    chargeT -= dt;
    if (chargeT <= 0) { shakeTorch(); chargeT = 0.14; }
  } else chargeT = 0;
}
function updateContext() {
  let text = '';
  if (canAct() && !typing && !toolsOpen && !notebookOpen) {
    if (stuck > 0) text = stuckTight ? 'Hold C / B to breathe out · release to breathe' : 'Alternate left and right to work free';
    else if (roping) text = 'On the rope';
    else if (resting) text = 'Resting · move to stand up';
    else if (G.chimneyAt(player.x, player.y + 1.5, player.z)) text = padSeen ? 'Hold A to climb' : 'Hold Space to climb';
    else if (ropes.some(r => Math.hypot(r.x - player.x, r.z - player.z) < 1.8 && Math.min(Math.abs(player.y - r.top), Math.abs(player.y - r.bottom)) < 1.8)) text = padSeen ? 'D-pad up · use rope' : 'E · use rope   hold E at the top · pull it up';
    else if (nearestVoid() && player.rope > 0) text = padSeen ? 'D-pad up · rig rope' : 'E · rig rope';
    else if (player.swim && nearestLine(1.7)) text = padSeen ? 'Hold D-pad up · haul along the line' : 'Hold E · haul along the line';
    else if (lines.some(L => lineEndsNear(L, 2.5))) text = padSeen ? 'A line runs through the water' : 'A line runs through the water   hold E · reel it in';
    else if (player.rope > 0 && nearestSumpEnd()) text = padSeen ? 'D-pad up · lay a line through the sump' : 'E · lay a line through the sump';
    else text = padSeen ? 'Hold X · charge   LB · focus   Y · tools   View · survey' : 'Hold left mouse · charge   right mouse · focus   Q · tools   Tab · survey';
    if (dragLook && !padSeen) text += '   middle-drag · look';
  }
  $('context').textContent = text;
  $('torchm').querySelector('.tag').textContent = padSeen ? 'hold X' : 'hold left mouse';
}

let introDone = false, resumed = false;
function start() {
  overlay.classList.add('hidden'); overlay.classList.remove('over'); running = true;
  $('abandon-confirm').hidden = true; clearInputs(); sfx.resume();
  if (!introDone && !resumed && cave.attempts === 1 && runTime < 1) {                  // the fall: white, a rush, the ground, then the hole far above
    introDone = true;
    const fl = $('flash'); fl.style.transition = 'none'; fl.style.opacity = 1; void fl.offsetWidth;
    player.pitch = 1.25; player.yaw = Math.atan2(-0.6, 0.4) + Math.PI;
    sfx.play('whoosh', { vol: 0.9, rate: 0.7 });
    gameDelay(() => { sfx.play('body_fall', { vol: 1 }); sfx.play('rockfall', { vol: 0.6, rate: 0.9, dur: 1.5, wet: 0.8 }); camera.rotation.z = 0.12; fl.style.transition = 'opacity 3s ease-in'; fl.style.opacity = 0; $('hurt').style.opacity = 0.6; gameDelay(() => { $('hurt').style.opacity = 0; }, 1200); }, 900);
    gameDelay(() => sfx.play('gasping', { vol: 0.6 }), 1900);
    gameDelay(() => showHint('the hole you fell through. it is a long way up', true), 3200);
  } else if (!introDone) introDone = true;
}
if (matchMedia('(pointer: coarse)').matches) $('warn').style.display = 'block';

// ---------- run record ----------
record.runs++;
BREATH_S = BREATH_BASE + Math.min(6, (record.sumps || 0) * 0.4);
try { localStorage.setItem('karst.record', JSON.stringify(record)); } catch (e) {}
$('ov-rec').textContent = `cave ${SEED}${cave.tier ? ` (the ${['second', 'third', 'fourth', 'fifth', 'sixth', 'seventh'][Math.min(cave.tier, 6) - 1] || 'next'} cave: deeper)` : ''} · attempt ${cave.attempts}${cave.deaths.length ? ` · ${cave.deaths.length} of you lie in it` : ''} · farthest ever ${record.best.toFixed(0)} m · escaped ${record.escapes}×`;
{
  // today's cave: one seed for everyone, changing at midnight UTC
  const d = new Date(), daySeed = d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  if (SEED !== daySeed) { const a = document.createElement('div'); a.className = 'rec'; a.style.marginTop = '6px'; a.innerHTML = `<span style="cursor:pointer;text-decoration:underline dotted">today’s cave (${daySeed}) — the same one for everyone</span>`; a.onclick = (ev) => { ev.stopPropagation(); location.href = location.pathname + '?seed=' + daySeed; }; $('ov-rec').after(a); }
  const CAUSE = { drowned: 'drowned', fell: 'fell', froze: 'froze', crushed: 'buried', foul: 'bad air', wedged: 'wedged' };
  const last = cave.deaths.slice(-4).map(d => `✕ ${Math.hypot(d.x, d.z).toFixed(0)} m out, ${(-d.y).toFixed(0)} m down · ${CAUSE[d.cause] || d.cause}`);
  if (last.length) { const el = document.createElement('div'); el.className = 'rec'; el.style.marginTop = '6px'; el.style.opacity = '0.75'; el.textContent = last.join('   '); $('ov-rec').after(el); }
  // the whole record, all caves: how the others went
  const tally = Object.entries(CAUSE).map(([k, v]) => record[k] ? `${record[k]} ${v}` : '').filter(Boolean);
  if (tally.length && record.runs > 3) { const el = document.createElement('div'); el.className = 'rec'; el.style.marginTop = '4px'; el.style.opacity = '0.55'; el.textContent = `${record.runs} attempts, all caves · ${tally.join(' · ')}${record.rescued ? ` · found ${record.rescued}×` : ''}${record.sumps ? ` · ${record.sumps} sumps swum` : ''}`; $('ov-rec').after(el); }
}
if (cave.attempts > 1) $('ov-sub').textContent = 'the same cave. it remembers.';
function saveRecord() { record.best = Math.max(record.best, player.dist); try { localStorage.setItem('karst.record', JSON.stringify(record)); } catch (e) {} }
let runTime = 0;
function endScreen(title, sub, go) {
  running = false; clearInputs(); closeTools(); if (typing) closeChalk(); saveRecord();
  $('menu-actions').hidden = false; $('abandon-confirm').hidden = true;
  delete cave.run; saveCave();
  const t = Math.round(runTime);
  $('ov-title').textContent = title; $('ov-sub').textContent = sub;
  const extras = [player.marks ? `${player.marks} chalk marks` : '', places.length ? `${places.length} place${places.length > 1 ? 's' : ''} named` : '', player.pages.length ? `${player.pages.length} page${player.pages.length > 1 ? 's' : ''} read` : '', `seed ${SEED}`].filter(Boolean).join(' &nbsp;·&nbsp; ');
  const obit = cave.deaths.length && player.out ? `<br>${cave.deaths.length} of you did not come back.` : '';
  $('ov-body').innerHTML = `<b>${player.dist.toFixed(0)} m</b> walked &nbsp;·&nbsp; deepest <b>${player.maxDepth.toFixed(0)} m</b> &nbsp;·&nbsp; <b>${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}</b><br>${extras}${obit}`;
  $('ov-rec').textContent = `cave ${SEED} · attempt ${cave.attempts} · ${cave.deaths.length} dead in it · farthest ever ${record.best.toFixed(0)} m · escaped ${record.escapes}×`;
  $('go').innerHTML = go;
  overlay.classList.remove('hidden'); overlay.classList.add('over');
  notebookOpen = true; nb.style.display = 'block'; nb.classList.add('under'); drawNotebook();
  if (document.exitPointerLock) document.exitPointerLock();
}
function die(title, why, stat) {
  if (!player.alive) return; player.alive = false; record[stat]++; rumble(1, 1, 900);
  cave.deaths.push({ x: player.x, y: player.y, z: player.z, cause: stat, battery: player.battery, t: Date.now(), trail: player.trail.filter((p, i) => i % 3 === 0).slice(-700) });
  // the last thing you wrote: the next one of you will find it on the wall, if there is a wall
  if (stat !== 'drowned') { const words = { fell: ['fell here', 'the floor. careful', 'no floor'], froze: ['so cold', 'could not stop shaking', 'sat down for a minute'], crushed: ['the roof', 'do not run in here'], foul: ['bad air. get out', 'head hurts. air'], wedged: ['too tight', 'breathe out'] }[stat];
    if (words) G.props.push({ type: 'note', x: player.x, y: player.y, z: player.z, text: words[cave.attempts % words.length], lasting: true }); }
  cave.marks.push(...runMarks); cave.places = (cave.places || []).concat(places.filter(p => !(cave.places || []).some(q => q.name === p.name)));
  cave.notes = (cave.notes || []).concat(notes.filter(n => !(cave.notes || []).some(q => q.t === n.t && Math.hypot(q.x - n.x, q.z - n.z) < 9))); saveCave();
  $('hurt').style.opacity = 0.9;
  gameDelay(() => endScreen(title, why, 'TRY THIS CAVE AGAIN'), 1400);
}
function rescued() {
  if (player.out) return; player.out = true; record.rescued = (record.rescued || 0) + 1;
  cave.escaped = true; saveCave();
  $('flash').style.opacity = 1; sfx.play('wind', { vol: 0.6, dur: 6 }); sfx.play('birds', { vol: 0.5, dur: 6 });
  gameDelay(() => endScreen('THEY CAME', `a rope came down the hole on the ${['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'][Math.min(9, cave.attempts - 1)]} try. someone up there counted. you did not find the way out; you were found.`, 'CLICK FOR A NEW CAVE'), 2400);
}
function escape() {
  if (player.out) return; player.out = true; record.escapes++;
  cave.escaped = true; saveCave();
  $('flash').style.opacity = 1;
  if (record.escapes % 3 === 0) {                                                // every third time out: the people whose sounds these are
    fetch('sounds/CREDITS.md').then(r => r.text()).then(txt => {
      const names = [...new Set([...txt.matchAll(/ by ([^\u2014\n]+?) \u2014/g)].map(m => m[1].trim()))].filter(n => !/deleted_user/.test(n));
      const el = document.createElement('div'); el.className = 'rec'; el.style.marginTop = '14px'; el.style.opacity = '0.7'; el.style.maxWidth = '520px'; el.style.lineHeight = '1.7';
      el.textContent = 'every sound down there was recorded by someone and given away (CC0, on Freesound): ' + names.join(' · ');
      $('ov-rec').after(el);
    }).catch(() => {});
  }
  gameDelay(() => endScreen(exitDaylight === 'night' ? 'STARS' : exitDaylight === 'dusk' ? 'THE LAST OF THE LIGHT' : 'DAYLIGHT', `you found the way out. ${Math.round(runTime / 60) >= 1 ? `you were down there ${Math.round(runTime / 60)} minute${Math.round(runTime / 60) > 1 ? 's' : ''}. ` : ''}the next one is deeper.`, 'CLICK FOR A NEW CAVE'), 2400);
}
function newCave() { location.href = location.pathname + '?seed=' + ((Math.random() * 1e9) | 0); }
function sameCave() { location.href = location.pathname + '?seed=' + SEED; }

// ---------- chalk ----------
const decalHelper = new THREE.Object3D();
// DecalGeometry clips every triangle of the mesh it is given; a chunk has tens of thousands. Hand it only the ones near the hit.
const _lm = new THREE.Mesh(new THREE.BufferGeometry(), undefined);
function localMesh(mesh, hit, radius) {
  const pos = mesh.geometry.attributes.position.array, r2 = (radius * 1.6 + 0.4) ** 2, out = [];
  for (let i = 0; i < pos.length; i += 9) {
    const dx = pos[i] - hit.x, dy = pos[i + 1] - hit.y, dz = pos[i + 2] - hit.z;
    if (dx * dx + dy * dy + dz * dz < r2) for (let k = 0; k < 9; k++) out.push(pos[i + k]);
  }
  _lm.geometry.dispose(); _lm.geometry = new THREE.BufferGeometry();
  _lm.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(out), 3)); _lm.geometry.computeVertexNormals();
  _lm.position.copy(mesh.position); _lm.quaternion.copy(mesh.quaternion); _lm.scale.copy(mesh.scale); _lm.updateMatrixWorld();
  return _lm;
}
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
// an arrow for the direction you are facing, as the eight compass words the survey uses
function chalkArrow() { camera.getWorldDirection(viewDir); return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][((Math.round(Math.atan2(viewDir.x, -viewDir.z) / (Math.PI / 4)) % 8) + 8) % 8] + ' ->'; }
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
    const geo = new DecalGeometry(localMesh(ch.mesh, hit, Math.max(w, hgt)), hit, decalHelper.rotation, size);
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
let open = 5, openT = 0, dripT = 2, rockT = rr(60, 160), nearWater = 0, fear = 0, gaspT = 0, lastPx = 0, lastPz = 0, lastStepX = 0, lastStepZ = 0, listening = 0, lastLx = 0, lastLz = 0;
let voidLoop = null, voidT = 0;
// a single falling drop, from a stalactite tip to the floor or the water
const dripDrops = []; let dripInst = null;
function spawnDrip(x, y, z, landY) {
  if (!dripInst) { dripInst = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.05, 0.12), dropMat, 24); dripInst.count = 0; dripInst.frustumCulled = false; scene.add(dripInst); }
  if (dripDrops.length >= 24) return;
  dripDrops.push({ x, y, z, landY, v: 0 });
}
function updateDrips(dt) {
  if (!dripInst) return;
  for (let i = dripDrops.length - 1; i >= 0; i--) { const d = dripDrops[i]; d.v += 9.8 * dt; d.y -= d.v * dt; if (d.y <= d.landY) dripDrops.splice(i, 1); }
  dripInst.count = dripDrops.length;
  for (let i = 0; i < dripDrops.length; i++) { const d = dripDrops[i]; _m.compose(_p.set(d.x, d.y, d.z), camera.quaternion, _s.set(1, 1 + d.v * 0.25, 1)); dripInst.setMatrixAt(i, _m); }
  dripInst.instanceMatrix.needsUpdate = true;
}
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
  fear = clamp(Math.max(level < 0.05 ? 0.8 : (1 - level) * 0.45, player.breath < 0.6 ? (1 - player.breath) * 0.9 : 0, eyes ? 0.55 : 0, player.hurt ? 0.3 : 0, stuck > 0 ? Math.min(1, 0.5 + stuckT * 0.1) : 0, batList.length ? 0.5 : 0, lakeFear * 0.8), 0, 1);
  lakeFear = Math.max(0, lakeFear - dt * 0.08);
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
    dripT = rr(1.5, 6) / (nearWater ? 2.2 : 1) / (lastTheme === 'wet' ? 1.8 : lastTheme === 'dry' ? 0.5 : 1);   // the wet rock drips; the dry rock hardly does
    const list = G.cellSegs.get(G.ckey(Math.floor(player.x / G.CHUNK), Math.floor(player.y / G.CHUNK), Math.floor(player.z / G.CHUNK)));
    if (list && list.length) {
      const s = list[Math.floor(Math.random() * list.length)], t = Math.random();
      let x = s.fx + s.fdx * t, z = s.fz + s.fdz * t; const floor = s.y0 + (s.y1 - s.y0) * t;
      let y = s.wl !== undefined ? s.wl + 0.05 : floor + 0.05;
      const tips = s.spel.filter(c => !c.up);
      let fromTip = false;
      if (tips.length && Math.random() < 0.7) { const c = tips[Math.floor(Math.random() * tips.length)]; x = c.x; z = c.z; y = c.top - c.len; fromTip = true; }
      const landY = s.wl !== undefined ? s.wl : floor;
      if (fromTip && y - landY > 0.4) {                                                 // you see it fall before you hear it land
        const fallT = Math.sqrt(2 * Math.max(0.1, y - landY) / 9.8);
        spawnDrip(x, y, z, landY); gameDelay(() => sfx.play('drip', { x, y: landY, z, vol: 0.5 + Math.random() * 0.4, vary: 0.25, wet: 0.9, rolloff: 0.8 }), fallT * 1000);
      } else sfx.play('drip', { x, y, z, vol: 0.5 + Math.random() * 0.4, vary: 0.25, wet: 0.9, rolloff: 0.8 });
    }
  }
  // the mountain settling, far off
  rockT -= dt;
  if (rockT <= 0) {
    rockT = rr(70, 200) / (lastTheme === 'broken' ? 2.5 : 1);                                                  // broken ground settles, audibly
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
        for (let k = 0; k < 3 + (Math.random() * 3 | 0); k++) gameDelay(() => sfx.play('step_rock', { x: bx + k * viewDir.x * 0.7, y: player.y, z: bz + k * viewDir.z * 0.7, vol: 0.28, wet: 0.8, rate: 0.9 }), k * 520);
      } else if (r < 0.65 || dread < 0.5) {                                                   // a pebble, a settling
        sfx.play('rockfall', { x: bx, y: player.y + 1, z: bz, vol: 0.3, wet: 0.9, rate: 1.2, dur: 1.2 });
      } else if (r < 0.8) {                                                                    // three knocks, from inside the wall
        const a = Math.random() * Math.PI * 2, d = G.rayToRock(player.x, player.y + 1.2, player.z, Math.sin(a), 0, Math.cos(a), 6, 0.2);
        const kx = player.x + Math.sin(a) * (d + 0.4), kz = player.z + Math.cos(a) * (d + 0.4);
        for (let k = 0; k < 3; k++) gameDelay(() => sfx.play('step_rock', { x: kx, y: player.y + 1.2, z: kz, vol: 0.45, rate: 0.6, vary: 0.05, wet: 0.3 }), k * 620);
        gameDelay(() => { if (player.alive) showHint('knocking. from inside the rock', true); }, 1900);
      } else {                                                                                 // breath, close
        sfx.play('creature_breath', { x: player.x - viewDir.x * 1.2, y: player.y + 1.5, z: player.z - viewDir.z * 1.2, vol: 0.35, rolloff: 1.5, dur: 3 });
        if (dread > 0.6 && Math.random() < 0.5) gustT = 1.6;                                   // and the torch dips
      }
    }
  }
  if (gustT > 0) gustT -= dt;
  // listening: still, torch dark or off, for a few seconds
  const stillNow = Math.hypot(player.x - lastLx, player.z - lastLz) < 0.02 && !player.swim; lastLx = player.x; lastLz = player.z;
  listening = stillNow && (!torchHeld || torchLevel(player.battery) < 0.08) ? Math.min(1, listening + dt / 3) : Math.max(0, listening - dt * 2);
  // daylight, heard before it is seen
  if (exitInfo) {
    if (!exitLoops) exitLoops = { wind: sfx.loop('wind', { x: exitInfo.x, y: exitInfo.y + 2, z: exitInfo.z, rolloff: 0.35, wet: 0.3 }), birds: sfx.loop('birds', { x: exitInfo.x + exitInfo.dx * 4, y: exitInfo.y + 3, z: exitInfo.z + exitInfo.dz * 4, rolloff: 0.6 }) };
    const d = Math.hypot(exitInfo.x - player.x, exitInfo.y - player.y, exitInfo.z - player.z);
    // stand still in the dark and you hear further: the draught and the birds reach you from twice as far
    const near = clamp(1 - d / (70 * (1 + listening)), 0, 1);
    if (exitLoops.wind) exitLoops.wind.setVol((1 - u) * (0.2 + 0.8 * near) * (player.out ? 1.6 : 1) * (1 + 0.6 * listening), 1);
    if (exitLoops.birds) exitLoops.birds.setVol((1 - u) * (near > 0.3 ? (near - 0.3) * 1.2 : 0) * (player.out ? 1.5 : 1) * (1 + 0.6 * listening) * (exitDaylight === 'night' ? 0.15 : 1), 1);   // few birds at night
    if (listening > 0.9 && near > 0.05 && !player.out) teach('listen', 'still, and dark: you can hear a draught. air moves toward the way out');
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
let followT = rr(70, 160), following = 0, followLookedT = 0;
function updateFollower(dt) {
  if (!running || !player.alive || player.out) return;
  if (following > 0) {
    following -= dt;
    camera.getWorldDirection(viewDir);
    const back = -(viewDir.x * lastMoveX + viewDir.z * lastMoveZ);           // looking back along the way you came
    if (back > 0.6 && Math.hypot(lastMoveX, lastMoveZ) > 0.01) { followLookedT += dt; if (followLookedT > 0.8) { following = 0; followT = rr(120, 260); } }
    else followLookedT = 0;
    return;
  }
  const dim = !torchHeld || torchLevel(player.battery) < 0.35;
  if (dread > 0.25 && dim && open < 7 && !player.swim) { followT -= dt; if (followT <= 0) { following = rr(18, 40); followLookedT = 0; teach('follow', 'those are not your steps'); } }
}
let lastMoveX = 0, lastMoveZ = 0;
function footstep(kind) {
  if (!soundsOn) return;
  const o = { x: player.x, y: player.y, z: player.z, wet: 0.5, vary: 0.15, hrtf: false };
  lastMoveX = player.x - lastStepX; lastMoveZ = player.z - lastStepZ; lastStepX = player.x; lastStepZ = player.z;
  if (following > 0 && kind !== 'swim' && kind !== 'crawl') {
    // one step behind, a little late, a little heavier — six or seven metres back along the passage
    const L = Math.hypot(lastMoveX, lastMoveZ) || 1, bx = player.x - lastMoveX / L * 6.5, bz = player.z - lastMoveZ / L * 6.5;
    gameDelay(() => sfx.play(kind === 'wade' || kind === 'puddle' ? 'wade' : 'step_rock', { x: bx, y: player.y, z: bz, vol: 0.5, rate: 0.85, vary: 0.1, wet: 0.8, rolloff: 0.7 }), 260 + Math.random() * 120);
  }
  if (kind === 'wade') sfx.play('wade', { ...o, vol: 0.7 });
  else if (kind === 'puddle') sfx.play('splash_small', { ...o, vol: 0.5, rate: 1.2 });
  else if (kind === 'swim') sfx.play('stroke', { ...o, vol: 0.45 });
  else if (kind === 'crawl') sfx.play(Math.random() < 0.5 ? 'drag' : 'scrape', { ...o, vol: 0.45, rate: 0.9 });
  else sfx.play(Math.random() < (lastTheme === 'dry' ? 0.65 : lastTheme === 'broken' ? 0.1 : 0.3) ? 'step_gravel' : 'step_rock', { ...o, vol: kind === 'crouch' ? 0.35 : 0.55 });   // dry floors are gravel; broken ground is block
  for (const b of bonePiles) {
    if (Math.hypot(b.x - player.x, b.z - player.z) < b.r && Math.abs(b.y - player.y) < 2 && b.crunched < gameClock - 4000) {
      b.crunched = gameClock; sfx.play('bone_crunch', { ...o, vol: 0.6 });
      teach('bones', 'bones. someone came this way. their pack, if it’s here, is worth a look — and T writes on the wall');
    }
  }
}

// ---------- player ----------
let duckT = 0, duckLevel = 0, duckHold = 0, bubbleT = 2, ropeHintT = 0, blockedT = 0;
let foulT = 0, lakeT = rr(20, 50), lakeFear = 0, climbing = false, climbT = 0, resting = false, restT = 0, siltT = 0, siltX = 0, siltZ = 0;
let stuck = 0, stuckSide = 0, stuckT = 0, wiggles = 0, coldT = 0, coldDropped = false, stuckTight = false, exhaling = false, exhaleT = 0;                      // stuck > 0: wedged, that many wiggles still needed
function updatePlayer(dt) {
  if (!G.chunkReadyAt(player.x, player.y + 0.3, player.z)) { G.focus.x = player.x; G.focus.y = player.y; G.focus.z = player.z; return; }
  if (roping) {
    updateRoping(dt);
    camera.position.set(player.x, player.y + player.h - 0.1, player.z); camera.rotation.set(player.pitch, player.yaw, 0);
    G.focus.x = player.x; G.focus.y = player.y; G.focus.z = player.z; return;
  }
  // Rest is selected from the tools wheel and ends when the player tries to move.
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'Space', 'KeyC', 'ControlLeft'].some(k => keys[k]) && !toolsOpen && !typing) restRequested = false;
  const wantRest = restRequested && player.grounded && !player.swim && (player.wl - player.y) < 0.2 && stuck === 0 && !climbing;
  if (!wantRest) restRequested = false;
  if (wantRest && !resting) { resting = true; restT = 0; sfx.play('torch_click', { vol: 0.5, rate: 0.9 }); teach('rest', 'sitting down, torch off. the cold goes, the legs come back; the battery is spared. listen while you wait'); }
  if (!wantRest && resting) { resting = false; sfx.play('torch_click', { vol: 0.5, rate: 1.1 }); }
  const inCamp = campSite && Math.hypot(campSite.x - player.x, campSite.z - player.z) < 4 && Math.abs(campSite.y - player.y) < 2;
  if (resting && inCamp && restT < 0.1) showHint('in a dead man’s bag. warm, at least', true);
  if (resting) { restT += dt; player.cold = Math.max(0, player.cold - dt / (inCamp ? 4 : 12)); player.stamina = Math.min(1, player.stamina + dt / 4); if (restT > 25 && Math.floor(restT) % 20 === 0 && Math.floor(restT) !== Math.floor(restT - dt)) showHint('still here'); }
  const still = notebookOpen || toolsOpen || typing || stuck > 0 || resting;         // you stop walking to write; or the rock has you; or you are sitting
  const f = !still && (keys.KeyW || keys.ArrowUp) ? 1 : 0, b = !still && (keys.KeyS || keys.ArrowDown) ? 1 : 0;
  const l = !still && (keys.KeyA || keys.ArrowLeft) ? 1 : 0, r = !still && (keys.KeyD || keys.ArrowRight) ? 1 : 0;
  if (stuck > 0 && !typing && !toolsOpen && !notebookOpen) {     // wiggle: alternate A and D to work yourself loose
    const side = keys.KeyA || keys.ArrowLeft ? -1 : keys.KeyD || keys.ArrowRight ? 1 : 0;
    if (side !== 0 && side !== stuckSide) { stuckSide = side; wiggles++; sfx.play('scrape', { x: player.x, y: player.y + 0.3, z: player.z, vol: 0.5, rate: 1.3, vary: 0.3, dur: 0.5, hrtf: false }); camera.rotation.z += side * 0.05;
      if (!stuckTight) stuck--;
      else if (wiggles % 3 === 0) showHint('no. wiggling does nothing here. breathe out and push — hold C', true);
      if (stuck === 0) { showHint('free'); sfx.play('gasp', { vol: 0.7 }); } }
    // the tight ones: you only get through by breathing out — and you cannot do that for long
    if (stuckTight) {
      if (keys.KeyC || keys.ControlLeft) {
        exhaling = true; player.breath = Math.max(0, player.breath - dt / (BREATH_S * 0.7)); exhaleT += dt;
        if (exhaleT > 0.9) { exhaleT = 0; stuck--; sfx.play('drag', { x: player.x, y: player.y + 0.3, z: player.z, vol: 0.6, rate: 0.8, dur: 0.8, hrtf: false }); camera.rotation.z += (Math.random() - 0.5) * 0.04; if (stuck === 0) { showHint('through. breathe', true); sfx.play('gasping', { vol: 0.8 }); } }
        if (player.breath <= 0) { player.breath = 0; die('WEDGED', 'you breathed in. the rock did not give it back', 'wedged'); }
      } else { exhaling = false; exhaleT = 0; player.breath = Math.min(1, player.breath + dt / 3); }
    }
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
  if (!player.swim && player.h <= 0.52 && depthW > 0.18) teach('duck', 'flat out with your chin in the water. keep your head up, keep moving, and do not stop where it dips');
  if (player.under) teach('under', 'under. the bar at the top is your breath. turn back at half if you can’t see air');
  if (player.battery < 0.3) teach('torch-hold', 'the torch is dying. hold left mouse (X on controller) to charge — you’re blind while you do');
  if (player.hurt) teach('hurt', 'something is broken. you’re slower now, and a second fall will finish you');
  if (player.cold > 0.6) teach('cold', 'you’re cold. keep moving to warm up. too long and your hands stop working');
  player.sprint = sprintKey && ml > 0 && stance === 1 && !player.swim && player.stamina > 0.05 && !player.hurt;
  if (player.sprint) player.stamina = Math.max(0, player.stamina - dt / 7); else if (!climbing) player.stamina = Math.min(1, player.stamina + dt / (12 * (1 + player.cold)));
  // water is cold; you warm up slowly, faster when moving
  if (player.swim || depthW > 0.3) player.cold = Math.min(1, player.cold + dt / ((player.under ? 14 : 25) * (player.suit ? 2.2 : 1))); else player.cold = Math.max(0, player.cold - dt / (ml > 0 ? 45 : 80));
  if (player.cold > 0.95) {
    coldT += dt;
    if (coldT > 40 && torchHeld && !coldDropped) { coldDropped = true; dropTorch(); showHint('your hands are shaking too hard to hold it'); }
    if (coldT > 110) die('THE COLD', 'you stopped shivering. that was the end of it', 'froze');
  } else coldT = Math.max(0, coldT - dt * 0.5);
  let speed = 3.3 * stance * (player.hurt ? 0.7 : 1) * (player.sprint ? 1.7 : 1);
  let stepKind = stance === 1 ? 'walk' : stance > 0.4 ? 'crouch' : 'crawl';

  if (player.swim) {
    // deep, black water, and you are not the only thing in it
    if (!player.under && dread > 0.15 && G.fieldAt(player.x, player.y - 0.5, player.z) < -0.15) {   // nothing under your feet
      lakeT -= dt;
      if (lakeT <= 0) {
        lakeT = rr(35, 80);
        const a = Math.random() * Math.PI * 2, d = rr(4, 9);
        if (Math.random() < 0.65) { sfx.play('splash', { x: player.x + Math.sin(a) * d, y: player.wl, z: player.z + Math.cos(a) * d, vol: 0.7, rate: 0.85, wet: 0.7, rolloff: 0.5 }); gameDelay(() => sfx.play('stroke', { x: player.x + Math.sin(a) * d * 0.7, y: player.wl, z: player.z + Math.cos(a) * d * 0.7, vol: 0.4, rate: 0.7, wet: 0.7 }), 900); showHint('something moved in the water'); }
        else { sfx.play('bubbles', { vol: 0.5, rate: 0.8, dur: 1.4 }); camera.rotation.z += (Math.random() - 0.5) * 0.08; player.vy -= 0.6; showHint('something touched your leg'); sfx.play('gasp', { vol: 0.7 }); }
        lakeFear = 1;
      }
    }
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
    updateHaul(dt);
  } else {
    const wx = -sy * mz + cy * mx, wz = -cy * mz - sy * mx;
    if (depthW > 0.25) { speed *= 0.55; stepKind = 'wade'; } else if (depthW > 0.02) stepKind = 'puddle';
    // a chimney: hold space between the walls to climb, slowly; it drains you, and if you run out you come off
    const chimHere = G.chimneyAt(player.x, player.y + 1.5, player.z) || G.chimneyAt(player.x, player.y + 0.8, player.z);
    const narrow = (h) => Math.min(G.rayToRock(player.x, player.y + h, player.z, 1, 0, 0, 1.6, 0.1) + G.rayToRock(player.x, player.y + h, player.z, -1, 0, 0, 1.6, 0.1), G.rayToRock(player.x, player.y + h, player.z, 0, 0, 1, 1.6, 0.1) + G.rayToRock(player.x, player.y + h, player.z, 0, 0, -1, 1.6, 0.1)) < 2.9;
    const inChimney = chimHere && (climbing || narrow(1.5) || narrow(2.4));
    if (inChimney && keys.Space && !player.hurt && player.stamina > 0.02) {
      climbing = true; player.vy = 0.85; player.stamina = Math.max(0, player.stamina - dt / 13); player.grounded = false;
      const ln = G.chimneyLineAt(player.x, player.y + 1.2, player.z);                 // the rift leans: stay on its line
      if (ln) { const dx = ln.x - player.x, dz = ln.z - player.z, L = Math.hypot(dx, dz); if (L > 0.02) { const k = Math.min(L, 0.7 * dt) / L; player.x += dx * k; player.z += dz * k; } }
      if (player.stamina <= 0.02) { showHint('your legs went', true); sfx.play('gasp', { vol: 0.8 }); player.vy = -0.5; climbing = false; }
      climbT += dt; if (climbT > 0.5) { climbT = 0; sfx.play('scrape', { x: player.x, y: player.y + 0.5, z: player.z, vol: 0.4, rate: rr(0.8, 1.1), dur: 0.5, hrtf: false }); }
      if (Math.random() < dt * 0.05) {                                                  // the rift is not clean: something comes down it
        sfx.play('rockfall', { x: player.x, y: player.y + 4, z: player.z, vol: 0.6, rate: 1.3, dur: 0.6, wet: 0.7 });
        gameDelay(() => { if (climbing) { player.stamina = Math.max(0, player.stamina - 0.22); $('hurt').style.opacity = 0.5; gameDelay(() => { $('hurt').style.opacity = 0; }, 500); sfx.play('gasp', { vol: 0.7 }); showHint('a stone came down the rift. on your head', true); } }, 350);
      }
      teach('chimney', 'a chimney. back on one wall, feet on the other: hold space to go up. it costs you, and if you run out, you come off');
    } else {
      if (inChimney && !climbing && player.grounded) teach('chimney', 'a chimney. back on one wall, feet on the other: hold space to go up. it costs you, and if you run out, you come off');
      climbing = false;
      if (keys.Space && player.grounded && player.h > 1.4 && !player.hurt) { player.vy = 4.0; player.grounded = false; }
      player.vy = Math.max(player.vy - GRAV * dt, -25);
    }
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
          player.hurt = true; $('hurt').style.opacity = 0.7; gameDelay(() => { $('hurt').style.opacity = 0; }, 900); rumble(0.8, 0.4, 400);
          if (torchHeld && Math.random() < 0.45) dropTorch(); else showHint('something is broken');
          if (player.kit) gameDelay(() => { if (player.hurt && player.alive) { player.hurt = false; player.kit = false; showHint('you use the kit. it holds, for now', true); } }, 4000);
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
    const f = player.flow, k = (player.swim ? 1 : clamp((depthW - 0.2) / 0.5, 0.15, 0.8)) * floodFlowMul();
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
    startDrops();
    if (player.underT > 5) { record.sumps = (record.sumps || 0) + 1; saveRecord(); const nb = BREATH_BASE + Math.min(6, record.sumps * 0.4); if (nb > BREATH_S + 0.01) { BREATH_S = nb; if (record.sumps % 5 === 0) showHint(`you can hold it a little longer now: ${BREATH_S.toFixed(0)} seconds`, true); } }
    if (player.underT > 2.5 && gaspT <= 0) { sfx.play(player.breath < 0.4 ? 'gasping' : 'gasp', { vol: 0.8 }); gaspT = 3; }
  }
  if (player.under) { player.underT += dt; bubbleT -= dt; if (bubbleT <= 0) { bubbleT = rr(2.5, 5); sfx.play('bubbles', { vol: 0.25, rate: rr(0.9, 1.2), dur: 1.0 }); } }

  // breath — and bad air: some dead ends have none worth breathing
  player.foul = !player.under && G.foulAt(player.x, player.y + 0.5, player.z);
  if (player.under) player.breath -= dt / BREATH_S;
  else if (player.foul) { player.breath -= dt / (BREATH_S * 3.2); foulT += dt; if (foulT > 4) teach('foul', 'the air is thick and your head hurts. this pocket has no air in it. back out'); }
  else if (!exhaling) { player.breath = Math.min(1, player.breath + dt / (foulT > 0 ? 12 : 4)); foulT = 0; }
  if (player.breath <= 0) { player.breath = 0; if (player.foul) die('BAD AIR', 'you sat down for a moment. the air in that pocket had nothing in it', 'foul'); else die('DROWNED', 'the water took you', 'drowned'); }

  const moved = Math.hypot(player.x - px0, player.z - pz0);
  player.dist += moved;
  ropeHintT -= dt;
  if (ropeHintT <= 0) { ropeHintT = 1.5; const v = nearestVoid(); if (v && player.grounded) { showHint(player.rope > 0 ? 'a drop. E to rig the rope' : 'a drop. no rope'); surveyNote('drop', v.x, v.z); } }
  // a stone goes over the edge; you hear it land, later, further down than you would like
  if (moved > 0 && player.grounded) for (const v of G.voids) {
    if (v.kicked || Math.hypot(v.x - player.x, v.z - player.z) > 2.6 || Math.abs(v.top - player.y) > 1.5) continue;
    v.kicked = true; const h = Math.max(1, v.top - v.y), delay = Math.sqrt(2 * h / 9.8);
    sfx.play('step_gravel', { x: v.x, y: v.top, z: v.z, vol: 0.5, rate: 1.3 });
    gameDelay(() => sfx.play(v.wet ? 'splash_small' : 'rockfall', { x: v.x, y: v.y, z: v.z, vol: v.wet ? 0.6 : 0.45, rate: 1.2, dur: 0.7, wet: 0.9, rolloff: 0.5 }), delay * 1000);
    if (h > 5) gameDelay(() => sfx.play('rockfall', { x: v.x, y: v.y, z: v.z, vol: 0.25, rate: 1.5, dur: 0.5, wet: 1.0, rolloff: 0.4 }), delay * 1000 + 350);
    teach('edge', h > 5 ? 'that stone took a while to land. there is a drop here' : 'a stone went over an edge, close by');
  }
  if (player.under && !wasUnder) surveyNote('sump', player.x, player.z);
  if (player.foul && foulT > 3) surveyNote('bad air', player.x, player.z);
  if (stuck === 0 && player.h <= 0.52 && ml > 0 && moved > 0 && !player.swim && clear < 0.62 && Math.random() < dt * 0.06) {
    stuck = 5 + (Math.random() * 4 | 0); stuckSide = 0; stuckT = 0; wiggles = 0; exhaleT = 0;
    const sg = G.nearestSegAt(player.x, player.y + 0.3, player.z);
    stuckTight = !!(sg && sg.rmin < 0.62 && Math.random() < 0.5);                    // a squeeze proper: chest-tight
    if (stuckTight) { stuck = 3 + (Math.random() * 3 | 0); showHint('stuck. it has your chest. breathe out — hold C — and push', true); sfx.play('scrape', { vol: 0.8, rate: 0.6, dur: 1.4 }); sfx.play('gasping', { vol: 0.6 }); teach('tight', 'the tight ones: you get through on an empty chest, a few centimetres at a time. watch the bar'); }
    else { showHint('stuck. wiggle — A, D, A, D', true); sfx.play('scrape', { vol: 0.7, rate: 0.7, dur: 1.2 }); sfx.play('gasp', { vol: 0.5, rate: 0.9 }); }
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
      else if (c.kind === 'suit') { if (player.suit) showHint('another wetsuit. you have one on'); else { player.suit = true; showHint('a wetsuit, someone’s size. the water will be half as cold', true); } }
      else if (c.kind === 'kit') { if (player.hurt) { player.hurt = false; showHint('a first-aid kit. you strap it up. it will hold', true); sfx.play('gasping', { vol: 0.4, rate: 1.1 }); } else { player.kit = true; showHint('a first-aid kit. for later'); } }
      else if (c.kind === 'page') { const pg = { key: `${c.x.toFixed(0)},${c.z.toFixed(0)}`, text: typeof c.text === 'object' ? c.text.text : c.text, survey: typeof c.text === 'object' ? c.text.survey : undefined, x: c.x, z: c.z }; player.pages.push(pg); cave.pages = (cave.pages || []).concat([pg]); saveCave(); showHint(pg.survey ? pg.text : `a page from someone\u2019s log: \u201c${pg.text}\u201d`, true); hintT = 9; sfx.play('scrape', { vol: 0.2, rate: 2.5, dur: 0.4 }); continue; }
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
      r.taken = true; returnLight(r.light); scene.remove(r.lens);
      player.battery = Math.min(1, player.battery + 0.25);
      showHint(`your own torch. still ${(r.battery * 100).toFixed(0)}% when you ${r.cause === 'drowned' ? 'drowned' : r.cause === 'froze' ? 'froze' : r.cause === 'crushed' ? 'were buried' : r.cause === 'foul' ? 'stopped breathing' : r.cause === 'wedged' ? 'stuck' : 'fell'}. +25%`);
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
  const shiver = player.cold > 0.35 ? (player.cold - 0.35) * 0.012 * Math.sin(gameClock * 0.041) * Math.sin(gameClock * 0.0173) : 0;
  camera.position.set(player.x + Math.cos(player.bob * 0.5) * bobA * 0.6, player.y + player.h - 0.1 + Math.sin(player.bob) * bobA, player.z);
  camera.rotation.set(player.pitch + shiver, player.yaw + shiver * 0.7, Math.sin(player.bob * 0.5) * bobA * 0.35 + limp + shiver);
  camera.fov += (lerp(58, 75, (player.h - 0.5) / 1.22) - camera.fov) * Math.min(1, dt * 6);
  camera.updateProjectionMatrix();
  G.focus.x = player.x; G.focus.y = player.y; G.focus.z = player.z;
}

// ---------- torch ----------
let adapt = 1, shakeT = 0, lastShake = -Infinity, buzzT = 0, dropT = 0;
const _fwd = new THREE.Vector3(), _dropE = new THREE.Euler();
let torchDrifting = false, beamNarrow = false;
function dropTorch() {
  torchHeld = false; hand.visible = false; torchM.classList.add('gone'); dropT = 1.5; torchDrifting = false;
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
  const now = gameClock; if (now - lastShake < 100) return; lastShake = now;
  const tired = 1 - 0.45 * clamp((runTime - 900) / 1500, 0, 1) * (1 - 0.5 * clamp((resting ? 1 : 0), 0, 1));   // after fifteen minutes the arm gives less; resting helps a little
  player.battery = Math.min(1, player.battery + 0.025 * tired * (player.battery > 0.6 ? 0.5 : 1) * (player.hurt ? 0.7 : 1));
  if (tired < 0.8) teach('tired', 'your arm is tired. the shake gives less than it did');
  shakeT = 0.22; rumble(0.15, 0.35, 90);
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
const fog = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const r = g.createRadialGradient(32, 32, 2, 32, 32, 30); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); return t; })(), transparent: true, opacity: 0, depthWrite: false, depthTest: false, fog: false }));
fog.renderOrder = 5; fog.visible = false; camera.add(fog);
function updateTorch(dt) {
  if (running && player.alive && !player.out && !resting) player.battery = Math.max(0, player.battery - dt / (BATTERY_S * (player.cells ? 1.6 : 1) * (beamNarrow ? 0.8 : 1) * (1 - 0.25 * Math.max(0, player.cold - 0.5) * 2)));   // cold cells give less and drain faster
  if (torchHeld) {
    torch.position.copy(camera.position);
    const a = 1 - Math.pow(shakeT > 0 ? 0.05 : 0.0005, dt);
    torch.quaternion.slerp(camera.quaternion, a);
    // cold hands: the beam shivers, and so does the hand in front of you
    const shiver = player.cold > 0.45 ? (player.cold - 0.45) * (coldT > 40 ? 3.2 : 1.6) : 0;
    if (shiver > 0) {
      const t = gameClock * 0.001;
      torch.rotateX((Math.sin(t * 23.0) + Math.sin(t * 31.7)) * 0.006 * shiver); torch.rotateY((Math.sin(t * 27.3) + Math.sin(t * 19.1)) * 0.006 * shiver);
      hand.position.set(0.21 + Math.sin(t * 29) * 0.004 * shiver, -0.22 + Math.sin(t * 37) * 0.004 * shiver, -0.4);
    }
  }
  // breath fog when you are cold, in the beam, in front of your face
  if (player.cold > 0.35 && !player.under) {
    const ph = (player.bob * 0.35 + gameClock * 0.0009) % (Math.PI * 2), puffK = Math.max(0, Math.sin(ph));
    fog.visible = true; fog.material.opacity = 0.16 * (player.cold - 0.35) * puffK;
    fog.position.set(0, -0.06 + puffK * 0.02, -0.32 - puffK * 0.12); fog.scale.setScalar(0.12 + puffK * 0.1);
  } else fog.visible = false;
  shakeT -= dt;
  if (!torchHeld) {                                                             // dropped in moving water: it goes with it, still lit
    const f = G.flowAt(torch.position.x, torch.position.y, torch.position.z);
    if (f) {
      const nx = torch.position.x + f.x * f.s * 0.45 * floodFlowMul() * dt, nz = torch.position.z + f.z * f.s * 0.45 * floodFlowMul() * dt;
      const fy = floorBelow(nx, torch.position.y + 0.6, nz);
      if (fy !== null && G.fieldAt(nx, fy + 0.25, nz) < -0.15) { torch.position.set(nx, fy + 0.22, nz); torch.rotateY(dt * 0.8); if (!torchDrifting) { torchDrifting = true; showHint('the water is taking the torch', true); } }
    }
  }
  bounce.position.copy(camera.position);
  camera.getWorldDirection(viewDir);
  let ahead = 3;
  for (let t = 0.2; t < 3; t += 0.2) {
    if (G.fieldAt(camera.position.x + viewDir.x * t, camera.position.y + viewDir.y * t, camera.position.z + viewDir.z * t) > -0.05) { ahead = t; break; }
  }
  adapt += (clamp(0.15 + ahead / 2.4, 0.2, 1) - adapt) * Math.min(1, dt * 3);
  const t = gameClock * 0.001;
  let level = resting ? 0 : torchLevel(player.battery);
  // a dying torch stutters; while you shake it the contact is broken and you're in the dark
  if (player.battery < 0.3 && Math.random() < (0.3 - player.battery) * 0.3) { stutter = 0.15; if (buzzT <= 0) { sfx.play('bulb_buzz', { vol: 0.35, offset: Math.random() * 3, dur: 0.6 }); buzzT = 1.5; } }
  stutter += (1 - stutter) * Math.min(1, dt * 12); buzzT -= dt;
  if (gustT > 0) stutter = Math.min(stutter, 0.1 + 0.4 * Math.random());
  level *= stutter * (shakeT > 0 ? 0.12 : 1) * (player.under ? 0.7 : 1) * (1 - 0.3 * Math.max(0, player.cold - 0.5) * 2);
  if (player.cold > 0.75 && torchHeld) teach('coldcells', 'the cold is in the cells too: the beam is weaker, and the battery goes faster. warm up, or get out of the water');
  // the beam: flood is wide and short, spot is narrow and long — it eats the battery a little faster
  const wantAngle = beamNarrow ? 0.26 : 0.52; spot.angle += (wantAngle - spot.angle) * Math.min(1, dt * 8);
  spot.distance = beamNarrow ? 60 : 34; spot.penumbra = beamNarrow ? 0.5 : 0.8;
  spot.intensity = 12 * (beamNarrow ? 2.6 : 1) * (torchHeld ? adapt : 1) * level * (0.96 + 0.04 * Math.sin(t * 13.7) * Math.sin(t * 3.1));
  bounce.intensity = torchHeld ? 0.9 * adapt * level : 0;
  const dark = !torchHeld || level < 0.04;
  touch.intensity += ((dark && !player.under ? 0.32 : 0) - touch.intensity) * Math.min(1, dt * 0.5);
  if (touch.intensity > 0.01) { camera.getWorldDirection(viewDir); touch.position.set(camera.position.x + viewDir.x * 0.5, camera.position.y - 0.2, camera.position.z + viewDir.z * 0.5); }
  bounce.position.copy(torchHeld ? camera.position : torch.position);
  hand.userData.lens.material.emissiveIntensity = 2.5 * level;
  updateMotes(dt, level * (0.5 + 0.5 * adapt));
  // silt: every stroke in a sump stirs the floor, and the water closes in behind you — a flood does the same to all of it
  if (player.under) { siltT = Math.min(14, siltT + dt * (Math.hypot(player.x - siltX, player.z - siltZ) > 0.01 ? 1 : 0.15)); if (siltT > 8) teach('silt', 'the silt is up. you stirred it, and now you cannot see. keep going the way you were going'); }
  else siltT = Math.max(0, siltT - dt * 2);
  siltX = player.x; siltZ = player.z;
  if (player.under) { scene.fog.color.copy(FOG_WATER); scene.fog.density = 0.15 + 0.22 * floodLevel + (player.flow ? 0.05 : 0) + 0.3 * Math.min(1, siltT / 12); $('water').style.opacity = 1; updateBubbles(dt); }
  else { scene.fog.color.copy(FOG_AIR); scene.fog.density = 0.048; $('water').style.opacity = 0; }
  waterGroup.position.y = Math.sin(t * 1.1) * 0.012;
  for (const r of remains) if (!r.taken && r.light) r.light.intensity = 0.18 + 0.1 * Math.sin(t * 7 + r.x) * Math.sin(t * 2.3);
}

// ---------- the light leaves: something picks up the torch while you sit in the dark, and carries it off ----------
let carried = null, stealArmed = true;
function stealTorch() {
  if (!torchHeld || carried) return;
  const sg = G.nearestSegAt(player.x, player.y + 0.5, player.z); if (!sg || !sg.nb) return;
  const n0 = sg.nb, path = [];
  for (let i = n0.i + 1; i <= n0.i + 7; i++) { const n = G.nodes.find(q => q.w === n0.w && q.i === i); if (!n || n.wl !== undefined) break; path.push(n); }
  if (path.length < 3) return;
  dropTorch(); dropT = 1e9;                                                        // not to be picked up while it is walking
  torch.position.set(player.x, player.y + 0.9, player.z);
  carried = { path, t: 0, dur: 2.2 * path.length, stepT: 0 };
  resting = false; restRequested = false;
  gameDelay(() => showHint('the torch is moving. you are not holding it', true), 900);
  sfx.play('creature_breath', { x: player.x, y: player.y + 1.2, z: player.z, vol: 0.5, rolloff: 1.5 });
}
function updateCarried(dt) {
  if (!carried) {
    if (resting && restT > 12 && dread > 0.6 && stealArmed && Math.random() < dt * 0.08) { stealArmed = false; stealTorch(); }
    return;
  }
  carried.t += dt; carried.stepT -= dt;
  const k = Math.min(1, carried.t / carried.dur), seg = Math.min(carried.path.length - 1, Math.floor(k * carried.path.length)), f = k * carried.path.length - seg;
  const a = seg === 0 ? { x: player.x, y: player.y, z: player.z } : carried.path[seg - 1], b = carried.path[seg];
  const x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f + 0.9 + Math.sin(carried.t * 6) * 0.08, z = a.z + (b.z - a.z) * f;
  torch.position.set(x, y, z); torch.lookAt(b.x, b.y + 0.9, b.z);
  if (carried.stepT <= 0) { carried.stepT = 0.55; sfx.play('step_rock', { x, y: y - 0.9, z, vol: 0.45, rate: 0.8, wet: 0.7 }); }
  if (k >= 1) {
    const last = carried.path[carried.path.length - 1], fy = floorBelow(last.x, last.y + 0.5, last.z);
    torch.position.set(last.x, (fy === null ? last.y : fy) + 0.22, last.z); torch.quaternion.setFromEuler(_dropE.set(rr(-0.2, 0.1), Math.random() * 6.28, 0));
    sfx.play('torch_click', { x: last.x, y: last.y, z: last.z, vol: 0.7 }); sfx.play('rattle', { x: last.x, y: last.y, z: last.z, vol: 0.5, rate: 0.8 });
    carried = null; dropT = 0.5;
    gameDelay(() => showHint('it put it down. go and get it', true), 600);
  }
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
    for (let k = 0; k < 5; k++) gameDelay(() => sfx.play('step_rock', { x: crosser ? crosserMesh.position.x : crosser.x0, y: crosser.y, z: crosser ? crosserMesh.position.z : crosser.z0, vol: 0.5, rate: 1.5, vary: 0.25, wet: 0.7 }), k * 90);
    gameDelay(() => sfx.play('rockfall', { x: crosser.x1, y: crosser.y, z: crosser.z1, vol: 0.28, rate: 1.3, dur: 1.0, wet: 0.8 }), 450);
  }
  const k = Math.min(1, (crosser.t - crosser.hold) / crosser.dur);
  crosserMesh.position.set(crosser.x0 + (crosser.x1 - crosser.x0) * k, crosser.y, crosser.z0 + (crosser.z1 - crosser.z0) * k);
  for (const c of crosserMesh.children) if (c.userData.i !== undefined) c.rotation.z = Math.sin(crosser.t * 42 + c.userData.i * 1.6) * 0.7;
  if (k >= 1) { crosser = null; crosserMesh.visible = false; }
}
// ---------- glow-worms: the roof, lit ----------
const wormMat = new THREE.MeshBasicMaterial({ color: 0x8cf0d0, fog: false });
const wormInst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.018, 5, 4), wormMat, 4000); wormInst.count = 0; wormInst.frustumCulled = false; scene.add(wormInst);
const wormThreads = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x9fe8d4, transparent: true, opacity: 0.35 }));
const threadPos = []; wormThreads.frustumCulled = false; scene.add(wormThreads);
const wormSites = [];
// placed a few dozen per call, so a big roof spreads over several frames; returns true when the prop is finished
function placeGlowworms(p) {
  if (p.sd === undefined) { p.sd = p.seed * 233280 | 0; p.done = 0; p.placed = 0; }
  const R = () => (p.sd = (p.sd * 9301 + 49297) % 233280) / 233280;
  const stop = Math.min(p.n, p.done + 60);
  for (; p.done < stop && wormInst.count < 4000; p.done++) {
    const a = R() * Math.PI * 2, d = Math.sqrt(R()) * p.rx, x = p.x + Math.sin(a) * d, z = p.z + Math.cos(a) * d;
    // the roof above this spot: a coarse climb, then a fine one
    let cy = null; for (let h = 0; h < 6; h += 0.3) { const yy = p.floor + 1.2 + h; if (G.fieldAt(x, yy, z) > -0.04) { for (let f = yy - 0.3; f <= yy; f += 0.06) if (G.fieldAt(x, f, z) > -0.04) { cy = f - 0.06; break; } break; } }
    if (cy === null) continue;
    const drop = 0.05 + R() * 0.35, y = cy - drop;
    _m.compose(_p.set(x, y, z), _q.identity(), _s.set(1, 1, 1)); wormInst.setMatrixAt(wormInst.count++, _m);
    threadPos.push(x, cy, z, x, y, z); p.placed++;
  }
  wormInst.instanceMatrix.needsUpdate = true;
  wormThreads.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(threadPos), 3));
  if (p.done < p.n && wormInst.count < 4000) return false;
  if (p.placed > 20) { const site = { x: p.x, y: p.y, z: p.z, n: p.placed, light: borrowLight(0x5fd8b8, 2.2, p.rx * 3, 1.4, p.x, p.y - 0.8, p.z) }; if (site.light) site.light.userData.owner = site; wormSites.push(site); }
  return true;
}
let wormSeenT = 0;
function updateGlowworms(dt) {
  wormSeenT -= dt; if (wormSeenT > 0) return; wormSeenT = 1;
  for (const w of wormSites) if (Math.hypot(w.x - player.x, w.y - player.y, w.z - player.z) < 14) { teach('glowworms', 'the roof is lit. thousands of them, each on a thread of silk. turn the torch off and look'); surveyNote('lights', w.x, w.z); if (!places.some(pl => Math.hypot(pl.x - w.x, pl.z - w.z) < 30)) { let sd = (Math.abs(w.x * 73 + w.z * 131) | 0) + SEED; const Rr = () => ((sd = (sd * 9301 + 49297) % 233280) / 233280); const nm = `${NAME_A[(Rr() * NAME_A.length) | 0]} Lights`; places.push({ x: w.x, y: w.y, z: w.z, name: nm, kind: 'lights' }); showHint(nm.toLowerCase(), true); } }
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
        gameDelay(() => sfx.play('rockfall', { x: L.x, y: L.y, z: L.z, vol: 0.5, rate: 1.2, dur: 0.9, wet: 0.7 }), 350);
        teach('loose', 'something moved up there. do not stand under it');
      }
    } else if (L.state === 'warning') {
      L.t += dt; L.mesh.position.y = L.y - L.r * 0.25 - Math.sin(L.t * 40) * 0.02;
      if (L.t > 1.15) { L.state = 'falling'; L.vy = 0; }
    } else if (L.state === 'falling') {
      L.vy -= GRAV * dt; L.mesh.position.y += L.vy * dt; L.mesh.rotation.x += dt * 2.2; L.mesh.rotation.z += dt * 1.1;
      if (L.mesh.position.y <= L.rest) {
        L.mesh.position.y = L.rest; L.state = 'down'; rumble(0.9, 0.6, 500);
        cave.fallen = (cave.fallen || []).concat([L.key]); saveCave();
        sfx.play('rockslide', { x: L.x, y: L.rest, z: L.z, vol: 1.0, wet: 0.9, rolloff: 0.35 });
        sfx.play('rumble', { x: L.x, y: L.rest, z: L.z, vol: 0.8, rate: 0.9, dur: 2.5, wet: 0.8, rolloff: 0.3 });
        const near = hd < L.r + 0.55, close = hd < L.r + 2.2;
        if (near && Math.abs(player.y - L.rest) < 2.2) {
          if (L.r > 0.7 || player.hurt) { sfx.play('body_fall', { vol: 1 }); die('THE ROOF CAME DOWN', `a block the size of a car, from ${(L.y - L.rest).toFixed(0)} metres up`, 'crushed'); }
          else { player.hurt = true; $('hurt').style.opacity = 0.8; gameDelay(() => { $('hurt').style.opacity = 0; }, 900); sfx.play('gasping', { vol: 0.8 }); showHint('it caught your leg. something is broken'); if (torchHeld && Math.random() < 0.5) dropTorch(); }
        } else if (close) { sfx.play('gasp', { vol: 0.7 }); showHint('that was close'); }
        for (let k = 0; k < 5; k++) gameDelay(() => sfx.play('rockfall', { x: L.x + rr(-2, 2), y: L.rest, z: L.z + rr(-2, 2), vol: 0.35, rate: rr(0.9, 1.3), dur: 0.8, wet: 0.7 }), 300 + k * 260);
      }
    }
  }
  lastLooseX = player.x; lastLooseZ = player.z;
}
let lastLooseX = 0, lastLooseZ = 0;

// ---------- false floors: a crust over a shaft ----------
const falseFloors = [];
function updateFalseFloors(dt) {
  if (!running || !player.alive || player.out) return;
  for (const f of falseFloors) {
    if (f.state === 'gone' || !f.slab) continue;
    const hd = Math.hypot(player.x - f.x, player.z - f.z), onIt = hd < f.r - 0.4 && Math.abs(player.y - f.y) < 0.9 && player.grounded;
    if (f.state === 'whole') {
      if (onIt) { f.state = 'cracking'; f.t = 0; rumble(0.3, 0.7, 700); sfx.play('rattle', { x: f.x, y: f.y, z: f.z, vol: 0.8, rate: 0.7, wet: 0.5 }); sfx.play('rockfall', { x: f.x, y: f.y - 3, z: f.z, vol: 0.4, rate: 1.4, dur: 0.6, wet: 0.9 }); showHint('the floor moved', true); }
    } else if (f.state === 'cracking') {
      f.t += dt; camera.rotation.z += (Math.random() - 0.5) * 0.01;
      if (f.t > 0.75) {
        f.state = 'gone'; G.breakSlab(f.slab);
        sfx.play('rockslide', { x: f.x, y: f.y - 2, z: f.z, vol: 0.9, wet: 0.9, rolloff: 0.4 }); sfx.play('gasp', { vol: 0.8 });
        for (let k = 0; k < 4; k++) gameDelay(() => sfx.play('rockfall', { x: f.x, y: f.bottom, z: f.z, vol: 0.45, rate: rr(0.9, 1.2), dur: 0.8, wet: 0.9 }), 500 + k * 250);
        if (onIt || hd < f.r) { player.grounded = false; player.vy = Math.min(player.vy, -0.5); teach('falsefloor', 'that was not floor. it was a crust of mud over a hole, and it took the weight for as long as it did'); }
        cave.broken = (cave.broken || []).concat([`${f.x.toFixed(0)},${f.z.toFixed(0)}`]); saveCave();
      }
    }
  }
}
function restoreBrokenFloors() {
  if (!cave.broken) return;
  for (const f of falseFloors) if (f.state === 'whole' && f.slab && cave.broken.includes(`${f.x.toFixed(0)},${f.z.toFixed(0)}`)) { f.state = 'gone'; G.breakSlab(f.slab); }
}

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
      collapsed.add(key); cave.collapsed = (cave.collapsed || []).concat([key]); saveCave(); gameDelay(() => rumble(0.8, 0.8, 1200), 700);
      sfx.play('rattle', { x: n.x, y: n.y + 0.5, z: n.z, vol: 0.8, rate: 0.8, wet: 0.7, rolloff: 0.5 });
      gameDelay(() => { sfx.play('rockslide', { x: n.x, y: n.y + 0.5, z: n.z, vol: 1.0, wet: 0.9, rolloff: 0.3 }); sfx.play('rumble', { x: n.x, y: n.y + 0.5, z: n.z, vol: 0.9, rate: 0.8, dur: 3, wet: 0.8, rolloff: 0.3 }); G.collapseAt(n); }, 700);
      for (let k = 0; k < 6; k++) gameDelay(() => sfx.play('rockfall', { x: n.x + rr(-1.5, 1.5), y: n.y + 0.3, z: n.z + rr(-1.5, 1.5), vol: 0.4, rate: rr(0.8, 1.2), dur: 0.8, wet: 0.7 }), 900 + k * 220);
      gameDelay(() => { showHint('the roof came down behind you. that way is gone', true); sfx.play('gasp', { vol: 0.6 }); }, 1600);
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

// ---------- the flood: it rained up top, and the cave's water is rising ----------
let floodPhase = 'dry', floodT = 0, floodAt = rr(300, 540), floodPeak = 0, floodLevel = 0, floodStep = 0;
function updateFlood(dt) {
  if (!running || !player.alive || player.out) return;
  if (floodPhase === 'dry') {
    if (runTime > floodAt) {
      floodPhase = 'rising'; floodT = 0; floodPeak = rr(0.7, 1.15);
      sfx.play('rumble', { vol: 0.7, rate: 0.6, dur: 6, wet: 0.9 });
      gameDelay(() => showHint('listen. the water is rising', true), 2500);
      teach('flood', 'it rained up top. the streams and the sumps will run higher for a while — stay out of them, or be quick');
    }
    return;
  }
  floodT += dt;
  if (floodPhase === 'rising') { floodLevel = floodPeak * Math.min(1, floodT / 90); if (floodT >= 90) { floodPhase = 'high'; floodT = 0; } }
  else if (floodPhase === 'high') { floodLevel = floodPeak; if (floodT >= 150) { floodPhase = 'falling'; floodT = 0; } }
  else if (floodPhase === 'falling') { floodLevel = floodPeak * Math.max(0, 1 - floodT / 240); if (floodT >= 240) { floodPhase = 'dry'; floodLevel = 0; floodAt = runTime + rr(420, 720); showHint('the water is going down', true); } }
  const step = Math.round(floodLevel / 0.2) * 0.2;                      // the field only moves in 20 cm steps: each one is a rebuild
  if (step !== floodStep) { floodStep = step; G.setFlood(step); }
}
function floodFlowMul() { return 1 + 1.6 * floodLevel; }

// ---------- a tremor: the whole hill shifts, once in a while ----------
let tremorAt = rr(420, 900), tremorT = 0;
function updateTremor(dt) {
  if (!running || !player.alive || player.out) return;
  if (tremorT > 0) { tremorT -= dt; camera.rotation.z += (Math.random() - 0.5) * 0.02 * Math.min(1, tremorT); camera.position.y += (Math.random() - 0.5) * 0.012 * Math.min(1, tremorT); return; }
  if (runTime < tremorAt) return;
  tremorAt = runTime + rr(600, 1200); tremorT = 4.5; rumble(0.5, 0.9, 3500);
  sfx.play('rumble', { vol: 1.0, rate: 0.55, dur: 6, wet: 1.0 });
  for (let k = 0; k < 7; k++) gameDelay(() => sfx.play('rockfall', { x: player.x + rr(-14, 14), y: player.y + rr(0, 4), z: player.z + rr(-14, 14), vol: rr(0.3, 0.6), rate: rr(0.8, 1.2), dur: 1.0, wet: 0.9, rolloff: 0.5 }), 400 + k * rr(200, 600));
  gameDelay(() => sfx.play('gasp', { vol: 0.6 }), 700);
  // anything loose within earshot lets go
  for (const L of loose) if (L.state === 'hanging' && Math.hypot(L.x - player.x, L.z - player.z) < 30) { L.state = 'warning'; L.t = Math.random() * 0.6; }
  for (const r of roosts) if (!r.spooked && Math.hypot(r.x - player.x, r.z - player.z) < 25) gameDelay(() => spookRoost(r), 600);
  showHint('the rock moved. all of it', true);
  teach('tremor', 'that was the hill settling. it happens. what it shakes loose is the problem');
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
  if (streamLoop) { if (best) { streamLoop.setPos(best.x, best.wl, best.z); streamLoop.setVol(0.55 * Math.min(1, best.flow.s) * floodFlowMul(), 0.5); streamLoop.setRate(1 + 0.15 * floodLevel, 1); } else streamLoop.setVol(0, 1.0); }
  if (rap && !rapidsLoop) rapidsLoop = sfx.loop('stream_rocks', { x: rap.x, y: rap.wl, z: rap.z, rolloff: 0.9, wet: 0.7 });
  if (rapidsLoop) { if (rap) { rapidsLoop.setPos(rap.x, rap.wl, rap.z); rapidsLoop.setVol(0.9 * Math.min(1, rap.flow.s - 1.2), 0.5); } else rapidsLoop.setVol(0, 1.0); }
}

// ---------- survey notes: things worth a word on the map ----------
const notes = [];            // {x,z,t}
function surveyNote(t, x, z) {
  for (const n of notes) if (n.t === t && Math.hypot(n.x - x, n.z - z) < 9) return;
  notes.push({ t, x, z });
}

// ---------- place names: cavers name what they find ----------
const NAME_A = ['Long', 'Broken', 'Quiet', 'Black', 'High', 'Wet', 'Low', 'Cold', 'Far', 'Old', 'Grey', 'Lost'];
const NAME_B = { window: ['Window', 'Skylight', 'Eye', 'Light'], lake: ['Lake', 'Water', 'Mere', 'Pool'], cavern: ['Hall', 'Cathedral', 'Vault', 'Hollow', 'Chamber'], chamber: ['Room', 'Chamber', 'Alcove', 'Gallery'], crystal: ['Pocket', 'Grotto', 'Vein'], gour: ['Terraces', 'Steps', 'Pools', 'Stairs'] };
const places = [];           // {x,y,z, name, kind}
let placeT = 0, lastNamed = -1e9, lastTheme = null;
function updatePlaces(dt) {
  placeT -= dt; if (placeT > 0) return; placeT = 1.0;
  const sg = G.nearestSegAt(player.x, player.y + 0.5, player.z); if (!sg || !sg.nb) return;
  if (sg.nb.theme && sg.nb.theme !== lastTheme) {                              // the character of the rock changes
    if (lastTheme && runTime > 30) showHint({ dry: 'drier here. dust, and old bones', wet: 'wetter here. you can hear it', broken: 'broken ground. blocks everywhere, and the roof looks no better', old: 'old rock: calcite over everything, and the walls are full of shells', maze: 'it splits, and splits again. keep the survey open, and the chalk out' }[sg.nb.theme], true);
    lastTheme = sg.nb.theme;
  }
  const n = sg.nb, kind = n.window ? 'window' : n.wl !== undefined && n.wl - n.y > 1.2 && n.rx > 4 ? 'lake' : n.rx > 8 ? 'cavern' : n.tint === 5 ? 'crystal' : n.gour ? 'gour' : n.rx > 3.4 && n.ry > 2.6 ? 'chamber' : null;
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
  clearInputs();
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
  for (const pg of player.pages) for (const q of (pg.survey || [])) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < z0) z0 = q[1]; if (q[1] > z1) z1 = q[1]; }
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
  // survey sheets from the dead: the main way, in their pencil
  ctx.strokeStyle = 'rgba(90,70,40,0.75)'; ctx.lineWidth = 2.5; ctx.setLineDash([9, 6]);
  for (const pg of player.pages) if (pg.survey && pg.survey.length > 1) { ctx.beginPath(); ctx.moveTo(X(pg.survey[0][0]), Z(pg.survey[0][1])); for (let i = 1; i < pg.survey.length; i++) ctx.lineTo(X(pg.survey[i][0]), Z(pg.survey[i][1])); ctx.stroke(); ctx.font = '500 20px Caveat'; ctx.fillStyle = 'rgba(90,70,40,0.8)'; ctx.fillText('main way?', X(pg.survey[pg.survey.length - 1][0]) + 6, Z(pg.survey[pg.survey.length - 1][1]) + 6); }
  ctx.setLineDash([]);
  // notes: drops, sumps, bad air
  ctx.font = '500 22px Caveat'; ctx.fillStyle = 'rgba(120,40,30,0.85)';
  for (const n of notes) ctx.fillText(n.t, X(n.x) + 8, Z(n.z) + 6);
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
  $('nb-foot').textContent = `${player.dist.toFixed(0)} m walked · ${(-player.y).toFixed(0)} m deep · ${dist.toFixed(0)} m from the entrance as the bat flies · ${player.sticks} glowsticks · ${player.rope} rope${player.kit ? ' · a kit' : ''}${player.cells ? ' · lithium' : ''}${player.suit ? ' · wetsuit' : ''}`;
}

// your own bubbles, when you are under
const bubbleMat = new THREE.MeshBasicMaterial({ color: 0xcfe6e8, transparent: true, opacity: 0.32, fog: false });
const bubbleGeo = new THREE.SphereGeometry(1, 6, 5);
const bubbles = []; let bubbleSpawnT = 0;
function updateBubbles(dt) {
  bubbleSpawnT -= dt;
  if (bubbleSpawnT <= 0 && bubbles.length < 40) {
    bubbleSpawnT = 0.12 + Math.random() * 0.25;
    camera.getWorldDirection(viewDir);
    const m = new THREE.Mesh(bubbleGeo, bubbleMat); const r = 0.005 + Math.random() * 0.014; m.scale.setScalar(r);
    m.position.set(camera.position.x + viewDir.x * 0.5 + (Math.random() - 0.5) * 0.3, camera.position.y - 0.15, camera.position.z + viewDir.z * 0.5 + (Math.random() - 0.5) * 0.3);
    scene.add(m); bubbles.push({ m, v: 0.35 + Math.random() * 0.4, wob: Math.random() * 6, r });
  }
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i]; b.wob += dt * 5; b.m.position.y += b.v * dt; b.m.position.x += Math.sin(b.wob) * 0.004; b.v += dt * 0.25;
    const wl = G.waterLevelAt(b.m.position.x, b.m.position.y, b.m.position.z);
    if (!Number.isFinite(wl) || b.m.position.y >= wl - 0.02 || G.fieldAt(b.m.position.x, b.m.position.y, b.m.position.z) > -0.05) { scene.remove(b.m); bubbles.splice(i, 1); }
  }
}
// water running off your face after you surface: drops on the view that slide and fade
const dropsCv = $('drops'), dropsCtx = dropsCv.getContext('2d'); let dropList = [], dropsT = 0;
function startDrops() {
  dropList = []; for (let i = 0; i < 14; i++) dropList.push({ x: Math.random() * 480, y: Math.random() * 200, r: 3 + Math.random() * 9, v: 8 + Math.random() * 40, a: 0.35 + Math.random() * 0.35 });
  dropsT = 4.5; dropsCv.style.opacity = 1;
}
function updateDrops(dt) {
  if (dropsT <= 0) return;
  dropsT -= dt; if (dropsT <= 0) { dropsCv.style.opacity = 0; return; }
  dropsCtx.clearRect(0, 0, 480, 270);
  const k = Math.min(1, dropsT / 1.5);
  for (const d of dropList) {
    d.y += d.v * dt; d.v += 12 * dt;
    const g = dropsCtx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r);
    g.addColorStop(0, `rgba(150,170,175,${0.05 * d.a * k})`); g.addColorStop(0.7, `rgba(200,220,225,${0.28 * d.a * k})`); g.addColorStop(1, 'rgba(200,220,225,0)');
    dropsCtx.fillStyle = g; dropsCtx.beginPath(); dropsCtx.ellipse(d.x, d.y, d.r * 0.8, d.r * 1.3, 0, 0, Math.PI * 2); dropsCtx.fill();
  }
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
  breathM.querySelector('.tag').textContent = player.foul ? 'bad air' : exhaling ? 'breathe out' : 'air';
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
  if (cave.notes) notes.push(...cave.notes);
  G.scanChunks(1, true, disposeChunk); processQueue(1e9, true);
  for (let y = -3; y < 3; y += 0.1) if (G.fieldAt(0, y + 0.35, 0) < -0.3 && G.fieldAt(0, y + 1.2, 0) < -0.3) { player.y = y; break; }
  player.yaw = Math.PI;
  if (cave.run && !urlSeedIsNew) { resumed = true;                  // pick the interrupted attempt back up
    const r = cave.run;
    player.x = r.x; player.y = r.y; player.z = r.z; player.yaw = r.yaw; player.battery = r.battery; player.breath = r.breath; player.hurt = r.hurt;
    player.dist = r.dist; player.maxDepth = r.maxDepth; player.trail = r.trail || []; runMarks.push(...(r.marks || [])); runTime = r.t || 0;
    if (r.sticks !== undefined) player.sticks = r.sticks; if (r.places) places.push(...r.places); if (r.notes) notes.push(...r.notes); if (r.pages) for (const pg of r.pages) if (!player.pages.some(q => q.key === pg.key)) player.pages.push(pg); if (r.rope !== undefined) player.rope = r.rope; if (r.cells) player.cells = true; if (r.kit) player.kit = true; if (r.suit) player.suit = true;
    for (const g of (r.glow || [])) { const mesh = new THREE.Mesh(stickGeo, stickMat); mesh.position.set(g.x, g.y, g.z); mesh.rotation.x = Math.PI / 2; scene.add(mesh); const light = borrowLight(0x5cff7a, 1.1, 9, 1.7, g.x, g.y + 0.15, g.z); const gl = { ...g, light, mesh }; if (light) light.userData.owner = gl; glow.push(gl); }
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
               run: () => { running = true; overlay.classList.add('hidden'); sfx.resume(); }, pause: pauseGame, schedule: gameDelay, get controls() { return { running, toolsOpen, typing, beamNarrow, resting, restRequested, toolChoice, gameClock }; }, spawnCrosser, get crosser() { return crosser; }, places, loose, caches, composePage, olms, falseFloors, get flood() { return { floodPhase, floodLevel, floodAt, floodStep }; }, startFlood: () => { floodAt = 0; }, tremor: () => { tremorAt = 0; }, steal: stealTorch, lines, layLine, sumpPath, nearestSumpEnd, ropes, follow: (t) => { following = t; }, lakePoke: () => { lakeT = 0; }, tight: (n) => { stuck = n; stuckTight = true; wiggles = 0; exhaleT = 0; } };
}
init();
// warm the shaders now, not the first time a lake or a loose block comes into view (a compile can cost a quarter second)
{
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]), 3));
  g.setAttribute('aFlow', new THREE.BufferAttribute(new Float32Array(9), 3)); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(12).fill(1), 4));
  g.computeVertexNormals();
  const warm = [new THREE.Mesh(g, waterMat), new THREE.Mesh(looseGeo, looseMat), new THREE.Mesh(olmGeo, olmMat), new THREE.Mesh(pageGeo, pageMat), new THREE.Mesh(packGeo, packMat), new THREE.Mesh(torchGeo, torchMat), new THREE.Mesh(stickGeo, stickMat),
                new THREE.Mesh(g, curtainMat), new THREE.Mesh(g, mistMat), new THREE.Mesh(g, exitGrassMat), new THREE.Mesh(g, exitTreeMat), new THREE.Mesh(bagGeo, bagMat), new THREE.Mesh(stoveGeo, stoveMat), new THREE.Mesh(g, lineMat), new THREE.Mesh(stoneGeo, stoneMat), new THREE.Mesh(g, wormMat), new THREE.Mesh(g, bubbleMat),
                new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3)), wormThreads.material),
                new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: fossilTexture(0, 0.5), transparent: true, depthWrite: false, polygonOffset: true }))];
  // instanced programs too: pearls and glow-worms render with count 0 until they are used
  pearlInst.count = 0; wormInst.count = 0;
  for (const m of warm) { m.position.set(0, -900, 0); scene.add(m); }
  crosserMesh.visible = true; crosserMesh.position.set(0, -900, 0);
  try { renderer.compile(scene, camera); } catch (e) {}
  for (const m of warm) scene.remove(m);
  crosserMesh.visible = false;
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  stepFrame(dt);
}
function stepFrame(dt) {
  frameNo++;
  if (innerWidth !== lastW || innerHeight !== lastH) { lastW = innerWidth; lastH = innerHeight; resize(); }
  pollGamepad(dt);
  if (!running) { updateContext(); renderer.render(scene, camera); return; }
  advanceGameTimers(dt);
  if (!running) { updateContext(); renderer.render(scene, camera); return; }
  updateHeldControls(dt);
  const tf = performance.now(); let tp = tf; const lap = (k) => { const n = performance.now(); if (n - tp > (stats.phase[k] || 0)) stats.phase[k] = n - tp; tp = n; };
  if (running && player.alive && !player.out) { updatePlayer(dt); runTime += dt; saveT += dt; if (saveT > 5) { saveT = 0; saveRun(); }
    if (runTime > 40 && runTime < 41) teach('survey-tools', 'Tab opens your survey. Hold Q for chalk, whistle and rest. G drops a glowstick; hold to throw'); }
  lap('player');
  G.advanceWorms(3); lap('worms');
  G.scanChunks(dt, false, disposeChunk); lap('scan');
  processQueue(running ? 5 : 12); lap('queue');
  processProps(dt); lap('props');
  updateTorch(dt);
  updateEyes(dt);
  updateLoose(dt);
  updateGlowworms(dt);
  updateFossils(dt);
  updateMists(dt);
  updateThrown(dt);
  updateStones(dt);
  updateDrips(dt);
  updateDrops(dt);
  whistleT -= dt;
  updateFollower(dt);
  updateFlood(dt);
  updateTremor(dt);
  updateDraught(dt);
  updateOlms(dt);
  updateCollapse(dt);
  updateFalseFloors(dt); if (frameNo % 30 === 0) restoreBrokenFloors();
  updateCamp(dt);
  updateStreamSound(dt);
  waterUniforms.uTime.value += dt;
  updatePlaces(dt);
  updateCrosser(dt);
  updateCarried(dt);
  updateLines(dt);
  updateBats(dt);
  updateCascades(dt); lap('systems');
  updateSound(dt); lap('sound');
  renderer.render(scene, camera); lap('render');
  grain(); hud(dt); updateContext(); lap('hud');
  stats.frameMs = performance.now() - tf;
}
requestAnimationFrame(frame);

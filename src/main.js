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
const SEED = (urlSeed || (cave && !cave.escaped && cave.seed) || ((Math.random() * 1e9) | 0)) >>> 0;
if (!cave || cave.seed !== SEED) cave = { seed: SEED, attempts: 0, deaths: [], marks: [], escaped: false };
cave.attempts++;
function saveCave() { try { localStorage.setItem('karst.cave', JSON.stringify(cave)); } catch (e) {} }
saveCave();
const runMarks = [];

const PR = 0.26;                                           // player collision radius
const H_STAND = 1.72, H_CROUCH = 0.95, H_PRONE = 0.5;
const BREATH_S = 16, BATTERY_S = 130;                      // seconds of breath; seconds of torch at full
const GRAV = 14;

const player = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, vy: 0, h: H_STAND, grounded: false, bob: 0,
                 wl: -Infinity, swim: false, under: false, breath: 1, battery: 1, hurt: false,
                 airT: 0, whooshed: false, underT: 0, stepPhase: 0,
                 dist: 0, maxDepth: 0, marks: 0, alive: true, out: false };
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
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(0.10, 0.75, 0.55) * vGlow * vGlow * 0.5;');
};
const waterMat = new THREE.MeshStandardMaterial({ color: 0x0a2226, roughness: 0.08, metalness: 0.3, emissive: 0x03120f,
                                                  transparent: true, opacity: 0.84, side: THREE.DoubleSide, depthWrite: false });
const waterGroup = new THREE.Group(); scene.add(waterGroup);

const torch = new THREE.Object3D(); scene.add(torch);
const spot = new THREE.SpotLight(0xffd9a6, 12, 34, 0.52, 0.8, 1.2);
spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024);
spot.shadow.camera.near = 0.15; spot.shadow.camera.far = 32; spot.shadow.bias = -0.0006; spot.shadow.normalBias = 0.035;
spot.position.set(0.16, -0.14, 0); spot.target.position.set(0.05, -0.16, -8);
torch.add(spot); torch.add(spot.target);
const bounce = new THREE.PointLight(0xffc890, 0.9, 7, 1.5); scene.add(bounce);
scene.add(new THREE.AmbientLight(0x1a1610, 0.06));
// algae light pool
const algaeLights = []; for (let i = 0; i < 6; i++) { const l = new THREE.PointLight(0x2fd8b0, 0, 7, 1.6); scene.add(l); algaeLights.push(l); }

let lastW = 0, lastH = 0;
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }

// ---------- chunk meshes ----------
function realizeChunk(ch) {
  disposeChunk(ch);
  const out = G.buildChunk(ch);
  if (!out) return;
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
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(out.water.pos, 3));
    g.computeVertexNormals(); g.computeBoundingSphere();
    ch.water = new THREE.Mesh(g, waterMat); waterGroup.add(ch.water);
  }
}
function disposeChunk(ch) {
  if (ch.mesh) { scene.remove(ch.mesh); ch.mesh.geometry.dispose(); ch.mesh = null; }
  if (ch.water) { waterGroup.remove(ch.water); ch.water.geometry.dispose(); ch.water = null; }
}
const stats = { builds: 0, buildMs: 0, maxMs: 0, frameMs: 0 };
function processQueue(ms) {
  const t0 = performance.now();
  while (G.queue.length && performance.now() - t0 < ms) {
    const ch = G.queue.shift(); if (ch.built && !ch.dirty) continue;
    const t1 = performance.now(); realizeChunk(ch); const d = performance.now() - t1;
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
  bonePiles.push({ x: p.x, y: p.y, z: p.z, r: p.rx * 0.7 + (p.big ? 3 : 0), crunched: 0 });
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
let exitInfo = null;
function placeExit(e) {
  exitInfo = e;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(5.5, 40), new THREE.MeshBasicMaterial({ color: 0xfff4dc, fog: false }));
  disc.position.set(e.x + e.dx * 4.6, e.y + 2.2, e.z + e.dz * 4.6); disc.lookAt(e.n1.x, e.n1.y + 1.5, e.n1.z);
  scene.add(disc);
  const sun = new THREE.PointLight(0xfff1d6, 320, 70, 1.6); sun.position.set(e.x, e.y + 2.5, e.z); scene.add(sun);
  const sky = new THREE.PointLight(0x9fc4ff, 90, 40, 1.6); sky.position.set(e.n1.x, e.n1.y + 1.8, e.n1.z); scene.add(sky);
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
    else placeBones(p);
    G.props.splice(i, 1);
  }
  // algae lights follow the nearest dense patches
  const near = G.algaeNodes.filter(n => Math.hypot(n.x - player.x, n.y - player.y, n.z - player.z) < 26)
    .sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y, a.z - player.z) - Math.hypot(b.x - player.x, b.y - player.y, b.z - player.z));
  for (let i = 0; i < algaeLights.length; i++) {
    const l = algaeLights[i], n = near[i];
    if (!n) { l.intensity = 0; continue; }
    l.position.set(n.x, n.y + 0.9, n.z); l.intensity = 0.5 * n.algae;
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
  if (!running || !player.alive || player.out) return;
  if (e.code === 'KeyF' && !e.repeat) shakeTorch();
  if (e.code === 'KeyT' && !e.repeat) { e.preventDefault(); openChalk(); }
});
addEventListener('keyup', e => { keys[e.code] = false; });
function openChalk() { typing = true; for (const k in keys) keys[k] = false; chalkIn.value = ''; chalkIn.style.display = 'block'; chalkIn.focus(); }
function closeChalk() { typing = false; chalkIn.style.display = 'none'; chalkIn.blur(); canvas.focus(); }
function look(dx, dy) { player.yaw -= dx * 0.0022; player.pitch = clamp(player.pitch - dy * 0.0022, -1.5, 1.5); }
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
let record = { runs: 0, best: 0, escapes: 0, drowned: 0, fell: 0 };
try { record = Object.assign(record, JSON.parse(localStorage.getItem('karst.record') || '{}')); } catch (e) {}
record.runs++;
try { localStorage.setItem('karst.record', JSON.stringify(record)); } catch (e) {}
$('ov-rec').textContent = `cave ${SEED} · attempt ${cave.attempts}${cave.deaths.length ? ` · ${cave.deaths.length} of you lie in it` : ''} · farthest ever ${record.best.toFixed(0)} m · escaped ${record.escapes}×`;
if (cave.attempts > 1) $('ov-sub').textContent = 'the same cave. it remembers.';
function saveRecord() { record.best = Math.max(record.best, player.dist); try { localStorage.setItem('karst.record', JSON.stringify(record)); } catch (e) {} }
const runStart = performance.now();
function endScreen(title, sub, go) {
  running = false; saveRecord();
  const t = Math.round((performance.now() - runStart) / 1000);
  $('ov-title').textContent = title; $('ov-sub').textContent = sub;
  $('ov-body').innerHTML = `<b>${player.dist.toFixed(0)} m</b> walked &nbsp;·&nbsp; deepest <b>${player.maxDepth.toFixed(0)} m</b> &nbsp;·&nbsp; <b>${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}</b><br>${player.marks} chalk marks &nbsp;·&nbsp; seed ${SEED}`;
  $('ov-rec').textContent = `cave ${SEED} · attempt ${cave.attempts} · ${cave.deaths.length} dead in it · farthest ever ${record.best.toFixed(0)} m · escaped ${record.escapes}×`;
  $('go').innerHTML = go;
  overlay.classList.remove('hidden');
  if (document.exitPointerLock) document.exitPointerLock();
}
function die(title, why, stat) {
  if (!player.alive) return; player.alive = false; record[stat]++;
  cave.deaths.push({ x: player.x, y: player.y, z: player.z, cause: stat, battery: player.battery, t: Date.now() });
  cave.marks.push(...runMarks); saveCave();
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
function showHint(t) { hint.textContent = t; hint.style.opacity = 1; hintT = 2.5; }
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
const loops = {};
let soundsOn = false;
sfx.load().then(() => {
  soundsOn = true;
  for (const k of ['amb_cave', 'amb_grotto', 'amb_drone', 'amb_underwater', 'drips_cave', 'breath_calm', 'breath_scared', 'breath_labored', 'heartbeat'])
    loops[k] = sfx.loop(k, { hrtf: false });
  $('ov-snd').textContent = '';
}).catch(e => { console.warn(e); $('ov-snd').textContent = 'sound unavailable'; });
let open = 5, openT = 0, dripT = 2, rockT = rr(60, 160), nearWater = 0, fear = 0, gaspT = 0;
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
  fear = clamp(Math.max(level < 0.05 ? 0.8 : (1 - level) * 0.45, player.breath < 0.6 ? (1 - player.breath) * 0.9 : 0, eyes ? 0.55 : 0, player.hurt ? 0.3 : 0), 0, 1);
  const set = (k, v) => loops[k] && loops[k].setVol(v, 0.6);
  set('amb_cave', (1 - u) * (0.45 + 0.5 * clamp((open - 2) / 10, 0, 1)));
  set('amb_grotto', (1 - u) * nearWater * 0.7);
  set('drips_cave', (1 - u) * nearWater * 0.5);
  set('amb_drone', (1 - u) * clamp((open - 9) / 10, 0, 1) * 0.8);
  set('amb_underwater', u * 0.9);
  set('breath_calm', (1 - u) * (player.hurt ? 0 : (0.35 + (player.h < 0.8 ? 0.35 : 0)) * (1 - fear)));
  set('breath_scared', (1 - u) * fear * (player.hurt ? 0.5 : 1));
  set('breath_labored', (1 - u) * (player.hurt ? 0.7 : 0));
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
}
function footstep(kind) {
  if (!soundsOn) return;
  const o = { x: player.x, y: player.y, z: player.z, wet: 0.5, vary: 0.15, hrtf: false };
  if (kind === 'wade') sfx.play('wade', { ...o, vol: 0.7 });
  else if (kind === 'swim') sfx.play('stroke', { ...o, vol: 0.45 });
  else if (kind === 'crawl') sfx.play(Math.random() < 0.5 ? 'drag' : 'scrape', { ...o, vol: 0.45, rate: 0.9 });
  else sfx.play(Math.random() < 0.3 ? 'step_gravel' : 'step_rock', { ...o, vol: kind === 'crouch' ? 0.35 : 0.55 });
  for (const b of bonePiles) {
    if (Math.hypot(b.x - player.x, b.z - player.z) < b.r && Math.abs(b.y - player.y) < 2 && b.crunched < performance.now() - 4000) {
      b.crunched = performance.now(); sfx.play('bone_crunch', { ...o, vol: 0.6 });
    }
  }
}

// ---------- player ----------
let duckT = 0, duckLevel = 0, duckHold = 0;
function updatePlayer(dt) {
  if (!G.chunkReadyAt(player.x, player.y + 0.3, player.z)) { G.focus.x = player.x; G.focus.y = player.y; G.focus.z = player.z; return; }
  const f = keys.KeyW || keys.ArrowUp ? 1 : 0, b = keys.KeyS || keys.ArrowDown ? 1 : 0;
  const l = keys.KeyA || keys.ArrowLeft ? 1 : 0, r = keys.KeyD || keys.ArrowRight ? 1 : 0;
  const crouchKey = keys.KeyC || keys.ControlLeft || keys.ShiftLeft;
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
  let speed = 3.3 * stance * (player.hurt ? 0.7 : 1);
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
    if (depthW > 0.25) { speed *= 0.55; stepKind = 'wade'; }
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
      if (hEq > 7 && !soft) { sfx.play('body_fall', { vol: 1 }); die('THE FLOOR WASN\'T THERE', `a ${hEq.toFixed(0)} metre drop in the dark`, 'fell'); }
      else if (hEq > 3.5 && !soft) {
        sfx.play('body_fall', { vol: 0.9 }); sfx.play('gasping', { vol: 0.7 });
        if (player.hurt) die('THE SECOND FALL', 'something gave way, then you did', 'fell');
        else { player.hurt = true; $('hurt').style.opacity = 0.7; setTimeout(() => { $('hurt').style.opacity = 0; }, 900); showHint('something is broken'); }
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
        const ax = px0 + wx * 0.6, az = pz0 + wz * 0.6;
        const lowAir = G.fieldAt(ax, py0 + 0.3, az) < -0.2 && G.fieldAt(ax, py0 + 0.55, az) < -0.2;
        if (lowAir) { duckT = 0.6; if (duckHold <= 0) { duckLevel = Math.min(duckLevel + 1, 2); duckHold = 0.35; } }
      }
    } else if (duckT <= 0) duckLevel = 0;
    duckHold -= dt;
  }
  if (player.y < -400) { player.x = 0; player.y = 0; player.z = 0; player.vy = 0; }

  // water transitions
  if (player.swim && !wasSwim) sfx.play('splash', { x: player.x, y: player.wl, z: player.z, vol: 0.8, wet: 0.6 });
  if (player.under && !wasUnder) { sfx.play('bubbles', { vol: 0.5, rate: 1.1, dur: 1.2 }); player.underT = 0; }
  if (!player.under && wasUnder) {
    sfx.play('splash_small', { x: player.x, y: player.wl, z: player.z, vol: 0.7 });
    if (player.underT > 2.5 && gaspT <= 0) { sfx.play(player.breath < 0.4 ? 'gasping' : 'gasp', { vol: 0.8 }); gaspT = 3; }
  }
  if (player.under) player.underT += dt;

  // breath
  if (player.under) player.breath -= dt / BREATH_S; else player.breath = Math.min(1, player.breath + dt / 4);
  if (player.breath <= 0) { player.breath = 0; die('DROWNED', 'the water took you', 'drowned'); }

  const moved = Math.hypot(player.x - px0, player.z - pz0);
  player.dist += moved;
  for (const r of remains) {
    if (!r.taken && Math.hypot(r.x - player.x, r.z - player.z) < 1.0 && Math.abs(r.y - player.y) < 1.5) {
      r.taken = true; scene.remove(r.light); scene.remove(r.lens);
      player.battery = Math.min(1, player.battery + 0.25);
      showHint(`your own torch. still ${(r.battery * 100).toFixed(0)}% when you ${r.cause === 'drowned' ? 'drowned' : 'fell'}. +25%`);
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
  camera.position.set(player.x + Math.cos(player.bob * 0.5) * bobA * 0.6, player.y + player.h - 0.1 + Math.sin(player.bob) * bobA, player.z);
  camera.rotation.set(player.pitch, player.yaw, Math.sin(player.bob * 0.5) * bobA * 0.35 + limp);
  camera.fov += (lerp(58, 75, (player.h - 0.5) / 1.22) - camera.fov) * Math.min(1, dt * 6);
  camera.updateProjectionMatrix();
  G.focus.x = player.x; G.focus.y = player.y; G.focus.z = player.z;
}

// ---------- torch ----------
let adapt = 1, shakeT = 0, lastShake = 0, buzzT = 0;
const shakeQ = new THREE.Quaternion(), shakeE = new THREE.Euler();
function shakeTorch() {
  const now = performance.now(); if (now - lastShake < 100) return; lastShake = now;
  player.battery = Math.min(1, player.battery + 0.012 * (player.battery > 0.6 ? 0.5 : 1));
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
  if (running && player.alive && !player.out) player.battery = Math.max(0, player.battery - dt / BATTERY_S);
  torch.position.copy(camera.position);
  const a = 1 - Math.pow(shakeT > 0 ? 0.05 : 0.0005, dt);
  shakeT -= dt;
  torch.quaternion.slerp(camera.quaternion, a);
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
  level *= stutter * (shakeT > 0 ? 0.12 : 1) * (player.under ? 0.7 : 1);
  spot.intensity = 12 * adapt * level * (0.96 + 0.04 * Math.sin(t * 13.7) * Math.sin(t * 3.1));
  bounce.intensity = 0.9 * adapt * level;
  if (player.under) { scene.fog.color.copy(FOG_WATER); scene.fog.density = 0.15; $('water').style.opacity = 1; }
  else { scene.fog.color.copy(FOG_AIR); scene.fog.density = 0.048; $('water').style.opacity = 0; }
  waterGroup.position.y = Math.sin(t * 1.1) * 0.012;
  for (const r of remains) if (!r.taken) r.light.intensity = 0.18 + 0.1 * Math.sin(t * 7 + r.x) * Math.sin(t * 2.3);
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
    eyesT -= dt * (torchLevel(player.battery) < 0.3 ? 2.5 : 1);
    if (eyesT <= 0 && running) { spawnEyes(); eyesT = rr(120, 300); }
    return;
  }
  eyes.t -= dt; eyes.blink -= dt;
  if (eyes.blink <= 0) { eyes.grp.scale.y = 0.08; if (eyes.blink < -0.13) { eyes.grp.scale.y = 1; eyes.blink = rr(0.8, 2.6); } }
  const dx = eyes.x - camera.position.x, dy = eyes.y - camera.position.y, dz = eyes.z - camera.position.z, d = Math.hypot(dx, dy, dz);
  torch.getWorldDirection(viewDir);
  const lit = (dx * viewDir.x + dy * viewDir.y + dz * viewDir.z) / d > 0.994 && torchLevel(player.battery) > 0.3 && d < 22;
  if (eyes.t <= 0 || lit || d < 8) {
    scene.remove(eyes.grp);
    sfx.play('bones_rattle', { x: eyes.x, y: eyes.y, z: eyes.z, vol: 0.3, rate: 1.4, wet: 0.6 });
    if (Math.random() < 0.3) sfx.play('creature_growl', { x: eyes.x, y: eyes.y, z: eyes.z, vol: 0.25, rate: 0.8, wet: 0.9 });
    eyes = null;
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
  if (frameNo % 6) return;
  $('torchbar').style.width = (player.battery * 100).toFixed(0) + '%';
  torchM.classList.toggle('low', player.battery < 0.3);
  $('breathbar').style.width = (player.breath * 100).toFixed(0) + '%';
  breathM.style.opacity = player.under || player.breath < 1 ? 1 : 0;
  breathM.classList.toggle('low', player.breath < 0.35);
  if (showDebug) {
    let meshes = 0; for (const c of G.chunks.values()) if (c.mesh) meshes++;
    const stance = player.swim ? (player.under ? 'diving' : 'swimming') : player.h > 1.4 ? 'walking' : player.h > 0.8 ? 'crouched' : 'crawling';
    $('hud').innerHTML = `<b>${Math.hypot(player.x, player.z).toFixed(0)} m</b> from entrance &nbsp; depth <b>${(-player.y).toFixed(1)} m</b> &nbsp; ${stance} &nbsp; open ${open.toFixed(1)}` +
      ` &nbsp;·&nbsp; ${fps} fps · ${meshes} chunks · ${G.worms.length} worms · build max ${stats.maxMs.toFixed(0)} ms · seed ${SEED}`;
  } else $('hud').innerHTML = player.hurt ? 'hurt' : '';
}

// ---------- bootstrap ----------
function init() {
  G.initGen(SEED);
  for (const d of cave.deaths) G.props.push({ type: 'remains', ...d });
  for (const m of cave.marks) G.props.push({ type: 'mark', ...m });
  G.scanChunks(1, true, disposeChunk); processQueue(1e9);
  for (let y = -3; y < 3; y += 0.1) if (G.fieldAt(0, y + 0.35, 0) < -0.3 && G.fieldAt(0, y + 1.2, 0) < -0.3) { player.y = y; break; }
  player.yaw = Math.PI;
  updatePlayer(0); updateTorch(1);
  window.K = { player, G, keys, stats, placeMark, shakeTorch, spawnEyes, sfx, camera, scene, torch, bonePiles, boneInst,
               get eyes() { return eyes; }, get exit() { return exitInfo; }, tick: (dt) => stepFrame(dt),
               run: () => { running = true; overlay.classList.add('hidden'); } };
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
  if (running && player.alive && !player.out) updatePlayer(dt);
  G.advanceWorms(3);
  G.scanChunks(dt, false, disposeChunk);
  processQueue(running ? 5 : 12);
  processProps(dt);
  updateTorch(dt);
  updateEyes(dt);
  updateSound(dt);
  renderer.render(scene, camera);
  grain(); hud(dt);
  stats.frameMs = performance.now() - tf;
}
requestAnimationFrame(frame);

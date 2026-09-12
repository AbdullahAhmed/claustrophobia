// Karst — cave generator. Worm graph (floor lines) → distance field → marching cubes.
// Pure data: no three.js objects here. main.js turns the arrays into meshes.
import { edgeTable, triTable } from 'three/addons/objects/MarchingCubes.js';
import { VOXEL, N, M, CHUNK, CY, NOISE_AMP, CORE_H, setSeed, lerp, clamp, hash3, vnoise, fbm, segDist, coreDist, nearestSeg, gridAt, buildChunkData } from './field.js';
export { VOXEL, N, M, CHUNK, CY, lerp, clamp, hash3, vnoise, fbm, nearestSeg, gridAt };

// ---------- tunables ----------
export const MESH_R = 4, KEEP_R = 6;                              // chunk radii: meshed / kept
export const FRONTIER = 60, LOCK_R = 22;                          // worms advance within FRONTIER m; rebuilds nearer than LOCK_R wait
export const SURFACE_Y = 10;                                      // the exit opens above this height
const STEP = 1.5;
const MAX_WORMS = 90;

// ---------- rng / noise ----------
export let SEED = 1, rand = Math.random, EXIT_AT = 260;
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export const rr = (a, b) => a + rand() * (b - a);
// The cave must be the same cave every time for a seed, whatever route the player takes: every worm owns its
// own random stream, worm ids derive from the parent, and generation runs in lockstep rounds.
let R = Math.random;                                   // the current worm's stream while it steps
const wr = (a, b) => a + R() * (b - a);
const gauss = () => (R() + R() + R() - 1.5) * 1.63;
const angDiff = (a, b) => { let d = (a - b) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; };

// ---------- shared state ----------
export const focus = { x: 0, y: 0, z: 0 };     // the player, as far as the generator cares
export const nodes = [];                       // {x,y,z, rx,ry, w,i, wl?, core, algae, boulders?}
export const segs = [];
export const cellSegs = new Map();             // chunk key -> segments touching it
export const chunks = new Map();               // chunk key -> chunk record
export const worms = [];
export const props = [];                       // things for main.js to place: {type, x,y,z, ...}
export const algaeNodes = [];
export const voids = [];                       // pit bottoms: {x,y,z, top}
export let exit = null;
let exitClaimed = false;
export const ckey = (cx, cy, cz) => cx + ',' + cy + ',' + cz;

function addSeg(a, b) {
  const rx = (a.rx + b.rx) / 2, ry = (a.ry + b.ry) / 2, sy = rx / ry;
  const acy = a.y + CY * a.ry, bcy = b.y + CY * b.ry;          // node y is the floor; capsule centre is above it
  const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) || 1e-6;
  const s = { ax: a.x, ay: acy * sy, az: a.z, bx: b.x - a.x, by: (bcy - acy) * sy, bz: b.z - a.z,
              rx, ry, sy, y0: a.y, y1: b.y, rmin: Math.min(rx, ry),
              wl: a.wl !== undefined ? a.wl : b.wl, core: a.core !== false && b.core !== false,
              steep: Math.abs(b.y - a.y) > 0.6 * len,          // shafts: no sediment floor
              algae: Math.max(a.algae || 0, b.algae || 0), tint: b.tint || a.tint || 0,
              boulders: (a.boulders || []).concat(b.boulders || []),
              spel: (a.spel || []).concat(b.spel || []),
              fx: a.x, fy: a.y + CORE_H, fz: a.z, fdx: b.x - a.x, fdy: b.y - a.y, fdz: b.z - a.z, nb: b };
  s.inv = 1 / ((s.bx * s.bx + s.by * s.by + s.bz * s.bz) || 1e-6);
  s.finv = 1 / ((s.fdx * s.fdx + s.fdy * s.fdy + s.fdz * s.fdz) || 1e-6);
  // box outside which this segment is deep rock anyway (d > ~1), so samples can skip it
  const e = Math.max(rx, ry) + 1.0;
  s.x0 = Math.min(a.x, b.x) - e; s.x1 = Math.max(a.x, b.x) + e;
  s.y0b = Math.min(acy, bcy) - e; s.y1b = Math.max(acy, bcy) + e;
  s.z0 = Math.min(a.z, b.z) - e; s.z1 = Math.max(a.z, b.z) + e;
  segs.push(s);
  forCells(a, b, (key) => {
    let list = cellSegs.get(key);
    if (!list) cellSegs.set(key, list = []);
    list.push(s);
    const ch = chunks.get(key);
    if (ch) ch.dirty = true;
  });
}
function forCells(a, b, fn) {
  const m = Math.max(a.rx, b.rx, a.ry, b.ry) * 1.7 + NOISE_AMP + 0.6;
  const x0 = Math.floor((Math.min(a.x, b.x) - m) / CHUNK), x1 = Math.floor((Math.max(a.x, b.x) + m) / CHUNK);
  const y0 = Math.floor((Math.min(a.y, b.y) - m) / CHUNK), y1 = Math.floor((Math.max(a.y, b.y) + m) / CHUNK);
  const z0 = Math.floor((Math.min(a.z, b.z) - m) / CHUNK), z1 = Math.floor((Math.max(a.z, b.z) + m) / CHUNK);
  for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (fn(ckey(x, y, z), x, y, z) === false) return false;
  }
  return true;
}
export function nearestSegAt(x, y, z) {
  const list = cellSegs.get(ckey(Math.floor(x / CHUNK), Math.floor(y / CHUNK), Math.floor(z / CHUNK)));
  return list ? nearestSeg(list, x, y, z) : null;
}

// ---------- worms ----------
export const MODES = [
  { name: 'passage', rx: [1.0, 1.9], ry: [1.0, 1.6],   len: [15, 60], w: 0.36 },
  { name: 'chamber', rx: [3.0, 6.0], ry: [2.4, 4.0],   len: [8, 18],  w: 0.09 },
  { name: 'crawl',   rx: [0.9, 1.5], ry: [0.42, 0.50], len: [8, 22],  w: 0.17 },
  { name: 'squeeze', rx: [0.5, 0.65], ry: [0.9, 1.4],  len: [6, 12],  w: 0.09 },
  { name: 'canyon',  rx: [0.7, 0.9], ry: [2.0, 3.5],   len: [10, 30], w: 0.07 },
  { name: 'bedding', rx: [2.0, 3.2], ry: [0.8, 1.2],   len: [8, 25],  w: 0.06 },
  { name: 'sump',    rx: [1.2, 1.4], ry: [1.0, 1.1],   len: [0, 0],   w: 0.09 },
  { name: 'pit',     rx: [1.2, 1.4], ry: [1.2, 1.4],   len: [0, 0],   w: 0.04 },
  { name: 'cavern',  rx: [9, 16],    ry: [7, 12],      len: [25, 50], w: 0.03 },
];
const MODE = Object.fromEntries(MODES.map(m => [m.name, m]));

class Worm {
  constructor(id, node, yaw, pitch, kind, life) {
    this.id = id; this.rng = mulberry32((Math.imul(id, 0x9E3779B1) ^ SEED) >>> 0);
    this.node = node; this.x = node.x; this.y = node.y; this.z = node.z;
    this.yaw = yaw; this.pitch = pitch;
    this.rx = node.rx; this.ry = node.ry; this.trx = node.rx; this.try = node.ry;
    this.kind = kind; this.life = life; this.age = 0; this.n = 0;
    this.wander = 0; this.modeLeft = 0; this.target = null;
    this.mode = null; this.sump = null; this.pit = null; this.pinch = 0; this.exit = false; this.algae = 0;
    this.tint = node.tint !== undefined ? node.tint : 0;
  }
  pickMode(force) {
    R = this.rng;
    let m = force;
    if (!m) {
      // deeper is meaner: the dangerous modes get heavier with depth
      const deep = clamp(-this.y / 30, 0, 1.5);
      const ws = MODES.map(mo => mo.w * (mo.name === 'sump' ? 1 + deep : mo.name === 'pit' ? 1 + 0.8 * deep : mo.name === 'cavern' ? 1 + 0.6 * deep : 1));
      let r = R() * ws.reduce((a, b) => a + b, 0);
      for (let k = 0; k < MODES.length; k++) { r -= ws[k]; if (r <= 0) { m = MODES[k]; break; } }
      m = m || MODES[0];
    }
    if ((m.name === 'sump' || m.name === 'pit' || m.name === 'cavern') && (this.age < 20 || this.exit)) m = MODES[0];
    if (m.name === 'sump' && this.y < -32) m = MODES[0];
    if (m.name === 'pit' && this.y < -28) m = MODES[0];
    this.mode = m;
    this.trx = wr(m.rx[0], m.rx[1]); this.try = wr(m.ry[0], m.ry[1]);
    this.modeLeft = wr(m.len[0], m.len[1]);
    this.algae = R() < (m.name === 'chamber' || m.name === 'cavern' ? 0.35 : 0.07) ? wr(0.5, 1) : 0;
    if (R() < 0.3) this.tint = (R() * 5) | 0;                    // 0 plain limestone, 1 rust, 2 ochre, 3 grey-blue, 4 copper-green
    if (m.name === 'sump') {
      // short: never needs air. medium: usually a bell. long: bring your nerve.
      const r = R(), under = r < 0.45 ? wr(5, 10) : r < 0.85 ? wr(10, 18) : wr(18, 30);
      const bell = under > 18 ? R() < 0.3 : under > 10 ? R() < 0.6 : false;
      this.sump = { phase: 'dive', wl: this.y + 0.35, left: under, bell: 0, bellAt: bell ? under * wr(0.4, 0.6) : null,
                    trap: this.kind !== 'trunk' && R() < 0.25 };
    }
    if (m.name === 'pit') {
      const drop = wr(4, 15), pool = R() < 0.3;
      this.pit = { phase: 'ledge', drop, bottom: this.y - drop, wl: pool ? this.y - drop + 2.4 : undefined, cavern: R() < 0.1 };
    }
  }
  step() {
    R = this.rng;
    let core = true, wl;
    if (this.sump) {                                    // ---- flooded section ----
      const S = this.sump; wl = S.wl;
      this.wander = clamp(this.wander * 0.9 + gauss() * 0.04, -0.12, 0.12); this.yaw += this.wander;
      if (S.phase === 'dive') {
        this.pitch = -0.5; this.rx = lerp(this.rx, 1.3, 0.5); this.ry = lerp(this.ry, 1.0, 0.5);
        if (this.y - S.wl < -2.0) S.phase = 'under';
      } else if (S.phase === 'under') {
        this.pitch = 0; S.left -= STEP;
        if (S.bell > 0) { S.bell -= STEP; this.ry = (S.wl + 0.9 - this.y) / (1 + CY); this.rx = 1.6; }
        else if (S.bellAt !== null && S.left < S.bellAt) { S.bell = 4.5; S.bellAt = null; }
        else { this.ry = lerp(this.ry, 1.0, 0.5); this.rx = lerp(this.rx, 1.3, 0.5); }
        if (S.left <= 0) { if (S.trap) { this.sump = null; this.pinch = 3; } else S.phase = 'rise'; }
      } else {
        this.pitch = 0.45; this.ry = lerp(this.ry, 1.1, 0.5); this.rx = lerp(this.rx, 1.3, 0.5);
        if (this.y > S.wl + 0.3) { this.sump = null; this.pickMode(MODE.passage); }
      }
    } else if (this.pit) {                              // ---- a hole in the floor ----
      const P = this.pit;
      if (P.phase === 'ledge') { this.pitch = 0; this.rx = lerp(this.rx, 1.3, 0.6); this.ry = lerp(this.ry, 1.3, 0.6); P.phase = 'drop'; voids.push({ x: this.x, y: P.bottom, z: this.z, top: this.y, wet: P.wl !== undefined }); }
      else if (P.phase === 'drop') {
        this.pitch = -1.45; this.rx = 1.3; this.ry = 1.3;
        if (P.wl !== undefined && this.y - STEP < P.wl + 0.3) wl = P.wl;
        if (this.y - STEP <= P.bottom) {
          P.phase = 'out';
          this.pitch = P.wl !== undefined ? 0.45 : 0.15;
          if (P.wl !== undefined) this.sump = { phase: 'rise', wl: P.wl, left: 0, bell: 0, bellAt: null, trap: false };
          if (P.cavern) this.pickMode(MODE.cavern); else this.pickMode(MODE.passage);
          this.pit = null;
        }
      }
    } else if (this.pinch > 0) {                        // ---- side passage pinching shut ----
      this.pinch--; this.rx *= 0.55; this.ry *= 0.55; core = false;
      if (this.pinch === 0) { this.carve(core, wl); return false; }
    } else {
      this.modeLeft -= STEP;
      if (this.modeLeft <= 0) this.pickMode();
      if (this.pit || this.sump) return this.step();   // mode just switched into a special: run it
      this.rx = lerp(this.rx, this.trx, 0.35); this.ry = lerp(this.ry, this.try, 0.35);
      if (this.target) {
        const t = this.target, dx = t.x - this.x, dz = t.z - this.z, dy = t.y - this.y;
        this.yaw += clamp(angDiff(Math.atan2(dx, dz), this.yaw), -0.4, 0.4);
        this.pitch += clamp(Math.atan2(dy, Math.hypot(dx, dz)) - this.pitch, -0.2, 0.2);
        if (Math.hypot(dx, dy, dz) < STEP * 1.6) {          // join the older passage: a loop
          addSeg(this.node, t); return false;
        }
      } else {
        this.wander = clamp(this.wander * 0.9 + gauss() * 0.08, -0.22, 0.22);
        this.yaw += this.wander + gauss() * 0.05;
        if (this.exit) {
          this.pitch += (0.32 - this.pitch) * 0.3;
          this.trx = 1.5; this.try = 1.3;
          if (this.y > SURFACE_Y - 3) { this.trx = 3.2; this.try = 2.6; }
        } else {
          const band = this.y < -35 ? 0.06 : this.y > 8 ? -0.06 : -0.006;
          this.pitch = clamp(this.pitch * 0.85 + gauss() * 0.1 + band, -0.4, 0.4);
          if (this.mode && this.mode.name === 'cavern') this.pitch *= 0.5;
        }
        if (this.kind === 'trunk') {
          const away = Math.atan2(this.x, this.z);              // trunks head away from the entrance
          this.yaw += angDiff(away, this.yaw) * 0.06;
        }
      }
      // a crawl that continues past a slot you can't get through
      if (this.kind !== 'trunk' && this.mode && this.mode.name === 'crawl' && R() < 0.04) { this.ry = 0.2; this.rx = 0.5; core = false; }
    }
    if (!this.carve(core, wl)) return false;
    if (this.exit && this.y > SURFACE_Y) { makeExit(this); return false; }
    if (this.kind !== 'trunk' && this.life <= 0 && !this.sump && !this.pit) {
      if (R() < 0.55) { this.pinch = 3; return true; }
      return false;
    }
    if (this.kind === 'trunk' && !exitClaimed && !this.sump && !this.pit && Math.hypot(this.x, this.z) > EXIT_AT) { exitClaimed = true; this.exit = true; this.target = null; }

    if (!this.sump && !this.pit && !this.exit) {
      const inCavern = this.mode && this.mode.name === 'cavern';
      // fork: side passage or a short alcove
      if (this.age > 6 && worms.length < MAX_WORMS &&
          R() < (this.kind === 'trunk' ? 0.05 : 0.02) * (inCavern ? 3 : 1)) {
        const alcove = R() < 0.3;
        const c = new Worm((Math.imul(this.id, 1000003) + this.n * 7 + 1) | 0, this.node, this.yaw + (R() < 0.5 ? -1 : 1) * wr(0.7, 1.5), this.pitch * 0.5, 'side',
                           alcove ? wr(3, 8) : wr(15, 80));
        c.pickMode(alcove ? MODE.squeeze : null);
        if (alcove) { c.trx = Math.max(0.6, c.trx * 0.8); c.try = Math.max(0.5, c.try * 0.8); }
        worms.push(c);
      }
      // occasionally steer into an older passage to make a loop
      if (!this.target && this.kind !== 'trunk' && R() < 0.03) {
        let best = null, bd = 18;
        const cx = Math.floor(this.x / CHUNK), cy = Math.floor(this.y / CHUNK), cz = Math.floor(this.z / CHUNK);
        for (let dz = -2; dz <= 2; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) {
          const list = cellSegs.get(ckey(cx + dx, cy + dy, cz + dz)); if (!list) continue;
          for (const sg of list) {
            const o = sg.nb;
            if (!o || o.w === this.id || o.wl !== undefined || o.core === false || o.i < 8) continue;
            const d = Math.hypot(o.x - this.x, o.y - this.y, o.z - this.z);
            if (d < bd && d > 4) { bd = d; best = o; }
          }
        }
        if (best) this.target = best;
      }
    }
    return true;
  }
  carve(core, wl) {
    const cp = Math.cos(this.pitch);
    const n = { x: this.x + Math.sin(this.yaw) * cp * STEP, y: this.y + Math.sin(this.pitch) * STEP,
                z: this.z + Math.cos(this.yaw) * cp * STEP, rx: this.rx, ry: this.ry, w: this.id, i: ++this.n, core,
                algae: core ? this.algae : 0, tint: this.tint };
    if (wl !== undefined) n.wl = wl;
    const cavern = this.mode && this.mode.name === 'cavern' && !this.pit && !this.sump;
    if (cavern && R() < 0.6) {
      n.boulders = [];
      for (let k = 0, c = 1 + (R() * 3 | 0); k < c; k++) {
        const r = wr(0.7, 2.4), a = R() * Math.PI * 2, d = R() * this.rx * 0.75;
        n.boulders.push({ x: n.x + Math.sin(a) * d, y: n.y + r * 0.45, z: n.z + Math.cos(a) * d, r });
      }
    }
    // dripstone: hangs from roomy ceilings, grows from the floor under it
    const roomy = this.ry > 1.5 && wl === undefined && core;
    if (roomy && R() < (cavern ? 0.7 : this.ry > 2.3 ? 0.5 : 0.12)) {
      n.spel = [];
      const big = cavern ? 2.2 : this.ry > 2.3 ? 1.3 : 1;
      for (let k = 0, c = 1 + (R() * (cavern ? 4 : 2) | 0); k < c; k++) {
        const a = R() * Math.PI * 2, d = R() * this.rx * 0.55, x = n.x + Math.sin(a) * d, z = n.z + Math.cos(a) * d;
        const ceil = n.y + (1 + CY) * this.ry * Math.sqrt(Math.max(0.2, 1 - (d / this.rx) ** 2));
        const r = wr(0.18, 0.42) * big, len = wr(0.6, 2.2) * big;
        const column = R() < 0.12;
        n.spel.push({ x, z, top: ceil + 0.3, len: column ? ceil - n.y + 0.6 : Math.min(len, ceil - n.y - 0.5), r: column ? r * 1.3 : r, up: false });
        if (!column && R() < 0.6) n.spel.push({ x: x + wr(-0.3, 0.3), z: z + wr(-0.3, 0.3), top: n.y - 0.25, len: wr(0.3, 1.0) * big, r: wr(0.15, 0.4) * big, up: true });
      }
    }
    addSeg(this.node, n); nodes.push(n);
    if (n.algae > 0.4 && n.i % 3 === 0) algaeNodes.push(n);
    if (core && wl === undefined && this.rx < 3 && R() < 0.03) props.push({ type: 'bones', x: n.x, y: n.y, z: n.z, rx: this.rx, ry: this.ry, big: false, seed: R() });
    if (cavern && R() < 0.02) props.push({ type: 'bones', x: n.x, y: n.y, z: n.z, rx: this.rx, ry: this.ry, big: true, seed: R() });
    this.node = n; this.x = n.x; this.y = n.y; this.z = n.z;
    this.life -= STEP; this.age += STEP;
    return true;
  }
}
function distChunk(cx, cy, cz) {
  return Math.hypot((cx + 0.5) * CHUNK - focus.x, (cy + 0.5) * CHUNK - focus.y, (cz + 0.5) * CHUNK - focus.z);
}
export function activeWorms() {
  let n = 0; for (const w of worms) if (Math.hypot(w.x - focus.x, w.y - focus.y, w.z - focus.z) < FRONTIER) n++;
  return n;
}
export let rounds = 0;
// One round: every live worm takes one step, in list order. The graph after k rounds is a pure function of the seed.
function round() {
  rounds++;
  const live = worms.slice();
  for (const w of live) {
    if (!w.step()) {
      worms.splice(worms.indexOf(w), 1);
      if (w.exit && !exit) exitClaimed = false;              // the climb was cut off; another trunk gets to try
      if (w.kind === 'trunk') ensureTrunks(w);
    }
  }
}
// Advance while any live head is still within FRONTIER of the player (bounded per call).
export function advanceWorms(maxRounds) {
  for (let k = 0; k < maxRounds && activeWorms() > 0; k++) round();
}
function ensureTrunks(dead) {
  let t = 0; for (const w of worms) if (w.kind === 'trunk') t++;
  let k = 0;
  while (t < 2) {
    let far = nodes[0], fd = -1;
    for (const o of nodes) { if (o.wl !== undefined || o.core === false) continue; const d = Math.hypot(o.x, o.y, o.z); if (d > fd) { fd = d; far = o; } }
    const w = new Worm((Math.imul(dead.id, 7919) + 31 * (++k) + dead.n) | 0, far, Math.atan2(far.x, far.z), 0, 'trunk', Infinity);
    w.pickMode(MODE.passage); worms.push(w); t++;
  }
}
// The way out: widen into a mouth; main.js puts daylight beyond it.
function makeExit(w) {
  const cp = Math.cos(w.pitch), dx = Math.sin(w.yaw) * cp, dz = Math.cos(w.yaw) * cp;
  const n0 = w.node;
  const n1 = { x: n0.x + dx * 3, y: n0.y + 1.0, z: n0.z + dz * 3, rx: 3.5, ry: 2.8, w: w.id, i: ++w.n, core: true, algae: 0 };
  const n2 = { x: n1.x + dx * 5, y: n1.y + 1.2, z: n1.z + dz * 5, rx: 6, ry: 5, w: w.id, i: ++w.n, core: true, algae: 0 };
  addSeg(n0, n1); addSeg(n1, n2); nodes.push(n1, n2);
  exit = { x: n2.x, y: n2.y, z: n2.z, dx, dz, n1 };
  props.push({ type: 'exit', ...exit });
}

// ---------- chunks: field sampling + marching cubes ----------
// Build one chunk synchronously (initial load / fallback). Fills the grids on the record and returns { rock, water } or null.
export function buildChunk(ch) {
  const list = cellSegs.get(ch.key);
  ch.built = true; ch.dirty = false;
  const out = buildChunkData(list, ch.cx, ch.cy, ch.cz, edgeTable, triTable, ch.density ? ch : null);
  applyChunkData(ch, out);
  return out.solid || (!out.rock && !out.water) ? null : out;
}
export function applyChunkData(ch, out) {
  ch.built = true; ch.dirty = false; ch.solid = !!out.solid;
  if (out.solid && !out.density) { ch.density = null; ch.glow = null; ch.calc = null; ch.wet = null; ch.tint = null; return; }
  ch.density = out.density; ch.glow = out.glow; ch.calc = out.calc; ch.wet = out.wet; ch.tint = out.tint;
}
// Segments as plain data for a worker (drop the node back-reference).
export function plainSegs(list) { return list.map(s => { const { nb, ...rest } = s; return rest; }); }
export { edgeTable, triTable };

// streaming: which chunks need (re)building around the focus; returns the sorted queue and a list to dispose
export const queue = [];
let lastScanKey = '', scanTimer = 0;
export function scanChunks(dt, force, onDispose) {
  scanTimer += dt;
  const pcx = Math.floor(focus.x / CHUNK), pcy = Math.floor(focus.y / CHUNK), pcz = Math.floor(focus.z / CHUNK);
  const k = ckey(pcx, pcy, pcz);
  if (!force && k === lastScanKey && scanTimer < 0.25) return;
  lastScanKey = k; scanTimer = 0;
  queue.length = 0;
  for (let dz = -MESH_R; dz <= MESH_R; dz++) for (let dy = -MESH_R; dy <= MESH_R; dy++) for (let dx = -MESH_R; dx <= MESH_R; dx++) {
    if (dx * dx + dy * dy + dz * dz > MESH_R * MESH_R + 1) continue;
    const cx = pcx + dx, cy = pcy + dy, cz = pcz + dz, key = ckey(cx, cy, cz);
    let ch = chunks.get(key);
    if (!ch) { ch = { cx, cy, cz, key, built: false, dirty: false, solid: false, density: null, glow: null, calc: null, wet: null, mesh: null, water: null }; chunks.set(key, ch); }
    if (!ch.built || (ch.dirty && distChunk(cx, cy, cz) > LOCK_R)) { ch.d2 = dx * dx + dy * dy + dz * dz; queue.push(ch); }
  }
  queue.sort((a, b) => a.d2 - b.d2);
  for (const ch of chunks.values()) {
    if (Math.max(Math.abs(ch.cx - pcx), Math.abs(ch.cy - pcy), Math.abs(ch.cz - pcz)) > KEEP_R) { onDispose(ch); chunks.delete(ch.key); }
  }
}

// field sampling (trilinear on the chunk grids the meshes came from)
export function fieldAt(x, y, z) {
  const cx = Math.floor(x / CHUNK), cy = Math.floor(y / CHUNK), cz = Math.floor(z / CHUNK);
  const ch = chunks.get(ckey(cx, cy, cz));
  if (!ch || !ch.built || ch.solid || !ch.density) return 1.0;
  return gridAt(ch.density, (x - cx * CHUNK) / VOXEL, (y - cy * CHUNK) / VOXEL, (z - cz * CHUNK) / VOXEL);
}
export function chunkReadyAt(x, y, z) {
  const ch = chunks.get(ckey(Math.floor(x / CHUNK), Math.floor(y / CHUNK), Math.floor(z / CHUNK)));
  return !!(ch && ch.built);
}
export function waterLevelAt(x, y, z) {
  const s = nearestSegAt(x, y, z);
  return s && s.wl !== undefined ? s.wl : -Infinity;
}
export const G = { x: 0, y: 0, z: 0 };
export function gradAt(x, y, z) {
  const h = 0.18;
  G.x = (fieldAt(x + h, y, z) - fieldAt(x - h, y, z)) / (2 * h);
  G.y = (fieldAt(x, y + h, z) - fieldAt(x, y - h, z)) / (2 * h);
  G.z = (fieldAt(x, y, z + h) - fieldAt(x, y, z - h)) / (2 * h);
}
// march along a direction until rock; returns distance (or max)
export function rayToRock(x, y, z, dx, dy, dz, max, step = 0.25) {
  for (let t = step; t < max; t += step) if (fieldAt(x + dx * t, y + dy * t, z + dz * t) > -0.03) return t;
  return max;
}
// how open is it here: mean free path over a handful of directions (metres)
const DIRS = [[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0,1,0],[0.7,0.5,0.5],[-0.7,0.5,-0.5],[0.5,-0.3,-0.8]];
export function openness(x, y, z) {
  let s = 0; for (const d of DIRS) s += rayToRock(x, y, z, d[0], d[1], d[2], 30, 0.5);
  return s / DIRS.length;
}

// ---------- bootstrap ----------
export function initGen(seed) {
  SEED = seed; setSeed(seed); rand = mulberry32(seed); EXIT_AT = rr(200, 320);
  const start = { x: 0, y: 0, z: 0, rx: 3.4, ry: 2.6, w: -1, i: 0, core: true, algae: 0 }; nodes.push(start);
  for (let i = 0; i < 3; i++) {
    const w = new Worm(i + 1, start, i * 2.094 + rr(-0.4, 0.4), 0, 'trunk', Infinity);
    w.pickMode(MODE.passage); w.modeLeft = rr(20, 40); worms.push(w);
  }
  advanceWorms(400);
}
export const debug = { Worm, MODE };

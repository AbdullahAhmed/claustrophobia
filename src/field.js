// Karst — the density field and meshing, with no dependencies, so it runs the same on the main thread and in a worker.
// A chunk build takes a list of plain segment records and returns grids + geometry arrays.
export const VOXEL = 0.4, N = 20, M = N + 1, CHUNK = VOXEL * N;   // 8 m chunks of 0.4 m voxels
export const CY = 0.62;                                           // capsule centre sits this * ry above the floor line
export const NOISE_AMP = 0.28;
export const GOUR_STEP = 0.5, GOUR_POOL = 0.2;                    // rimstone terrace height; pool depth behind each lip (coarse: the voxels are 0.4 m)
export const CORE_R = 0.42, CORE_H = 0.34;                        // guaranteed crawl tube along every unpinched passage (wider than a voxel: the grid has to be able to hold it)

let SEED = 1;
export function setSeed(s) { SEED = s >>> 0; }
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export function hash3(x, y, z) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(z | 0, 0x9e3779b1) ^ SEED;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
export function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = x - xi, fy = y - yi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const a = lerp(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), u);
  const b = lerp(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), u);
  const c = lerp(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), u);
  const d = lerp(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), u);
  return lerp(lerp(a, b, v), lerp(c, d, v), w) * 2 - 1;
}
export const fbm = (x, y, z) => vnoise(x, y, z) * 0.65 + vnoise(x * 2.7 + 11.3, y * 2.7 + 5.1, z * 2.7 + 7.7) * 0.35;

// Ellipsoidal capsule: squash y so the cross-section is a circle, then plain capsule distance.
export let segT = 0;                   // out-param: projection parameter of the last segDist call
export function segDist(s, x, y, z) {
  const px = x - s.ax, py = y * s.sy - s.ay, pz = z - s.az;
  let t = (px * s.bx + py * s.by + pz * s.bz) * s.inv;
  t = t < 0 ? 0 : t > 1 ? 1 : t; segT = t;
  const dx = px - s.bx * t, dy = py - s.by * t, dz = pz - s.bz * t;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - s.rx;
}
// The crawl core: a plain round tube just above the floor line, always open.
export function coreDist(s, x, y, z) {
  const px = x - s.fx, py = y - s.fy, pz = z - s.fz;
  let t = (px * s.fdx + py * s.fdy + pz * s.fdz) * s.finv;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = px - s.fdx * t, dy = py - s.fdy * t, dz = pz - s.fdz * t;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - CORE_R;
}
export function nearestSeg(list, x, y, z) {
  let best = 1e9, bs = null;
  for (let q = 0; q < list.length; q++) { const d = segDist(list[q], x, y, z); if (d < best) { best = d; bs = list[q]; } }
  return bs;
}
export function gridAt(d, lx, ly, lz) {              // trilinear sample of one chunk's grid, local voxel coords
  const i = clamp(Math.floor(lx), 0, N - 1), j = clamp(Math.floor(ly), 0, N - 1), k = clamp(Math.floor(lz), 0, N - 1);
  const fx = lx - i, fy = ly - j, fz = lz - k, b = i + M * (j + M * k);
  const c00 = lerp(d[b], d[b + 1], fx), c10 = lerp(d[b + M], d[b + M + 1], fx);
  const c01 = lerp(d[b + M * M], d[b + M * M + 1], fx), c11 = lerp(d[b + M * M + M], d[b + M * M + M + 1], fx);
  return lerp(lerp(c00, c10, fy), lerp(c01, c11, fy), fz);
}

const fcol = [0, 0, 0];
// mineral tints: [plain, rust, ochre, grey-blue, copper-green] as (r,g,b) multipliers blended by strata
const TINTS = [[1, 1, 1], [1.25, 0.72, 0.55], [1.2, 1.02, 0.6], [0.8, 0.86, 1.05], [0.7, 1.0, 0.85], [1.45, 1.5, 1.6]];
function faceColor(cx, cy, cz, cal, wt, ti) {
  const n1 = fbm(cx * 0.22, cy * 0.22, cz * 0.22) * 0.5 + 0.5;            // warm sandstone <-> cool limestone
  const n2 = hash3(Math.floor(cx * 9.1), Math.floor(cy * 9.1), Math.floor(cz * 9.1));
  const strata = 0.5 + 0.5 * Math.sin(cy * 2.3 + n1 * 4);
  const br = 0.8 + 0.2 * n2 - 0.1 * strata;
  let r = lerp(0.46, 0.32, n1) * br, g = lerp(0.37, 0.31, n1) * br, b = lerp(0.27, 0.33, n1) * br;
  if (ti > 0.5) {                                                          // stained bands, strongest along the strata
    const T = TINTS[Math.min(5, Math.round(ti))], k = ti > 4.5 ? 0.85 : 0.45 + 0.55 * strata;
    r *= lerp(1, T[0], k); g *= lerp(1, T[1], k); b *= lerp(1, T[2], k);
  }
  if (cal > 0) { const cb = 0.85 + 0.15 * n2; r = lerp(r, 0.82 * cb, cal); g = lerp(g, 0.78 * cb, cal); b = lerp(b, 0.70 * cb, cal); }
  if (wt > 0) { const k = 1 - 0.4 * wt; r *= k; g *= k * 1.02; b *= k * 1.08; }
  fcol[0] = r; fcol[1] = g; fcol[2] = b;
}

// Sample the field over one chunk. Returns { density, glow, calc, wet, anyAir, anyRock }; grids may be reused via `into`.
export function buildField(list, cx, cy, cz, into) {
  const dens = (into && into.density) || new Float32Array(M * M * M);
  const glow = (into && into.glow) || new Float32Array(M * M * M);
  const calc = (into && into.calc) || new Uint8Array(M * M * M), wet = (into && into.wet) || new Uint8Array(M * M * M);
  const tint = (into && into.tint) || new Uint8Array(M * M * M);
  const ox = cx * CHUNK, oy = cy * CHUNK, oz = cz * CHUNK;
  let anyAir = false, anyRock = false, idx = 0;
  const row = [];
  for (let k = 0; k < M; k++) { const z = oz + k * VOXEL;
    for (let j = 0; j < M; j++) { const y = oy + j * VOXEL;
      row.length = 0;
      for (let q = 0; q < list.length; q++) { const s = list[q]; if (y >= s.y0b && y <= s.y1b && z >= s.z0 && z <= s.z1) row.push(s); }
      for (let i = 0; i < M; i++, idx++) { const x = ox + i * VOXEL;
        let best = 2.0, bs = null, bt = 0;
        for (let q = 0; q < row.length; q++) { const s = row[q]; if (x < s.x0 || x > s.x1) continue; const d = segDist(s, x, y, z); if (d < best) { best = d; bs = s; bt = segT; } }
        let v = best, g = 0, cal = 0, wt = 0;
        if (bs && best < 1.6) {
          const amp = NOISE_AMP * clamp((bs.rmin - 0.35) / 0.9, 0.25, 1);   // narrow passages get less noise: they have no width to spare
          v += amp * fbm(x * 1.1, y * 1.1, z * 1.1);
          if (!bs.steep) {
            let floorY;
            if (bs.gour) {                                          // rimstone: flat calcite terraces stepping down, each with a lip at its lower edge holding a pool
              const fl = lerp(bs.y0, bs.y1, bt) + 0.05 * vnoise(x * 1.3, y, z * 1.3), q = fl / GOUR_STEP, tq = Math.ceil(q), frac = tq - q;
              const lip = 0.34 * (1 - smooth(0.0, 0.13, frac)) * (0.75 + 0.25 * vnoise(x * 4, 0, z * 4));
              floorY = tq * GOUR_STEP + lip;
              const above = y - floorY; if (above < 0.6) cal = Math.max(cal, clamp(1 - above / 0.6, 0, 1));
            } else floorY = lerp(bs.y0, bs.y1, bt) + (0.08 + 0.03 * bs.ry) * vnoise(x * 0.9 + 3, y * 0.9, z * 0.9 + 7);
            const f = floorY - y; if (f > v) v = f;                 // sediment fill -> walkable floor
          }
          for (let q = 0; q < bs.boulders.length; q++) {            // breakdown blocks on cavern floors: a sphere with a skirt down into the floor, so nothing can wedge under it
            const b = bs.boulders[q], dyb = y > b.y ? y - b.y : y < b.y - b.r ? y - (b.y - b.r) : 0;
            const bd = b.r - Math.hypot(x - b.x, dyb, z - b.z) + 0.15 * vnoise(x * 2.3, y * 2.3, z * 2.3);
            if (bd > v) v = bd;
          }
          for (let q = 0; q < bs.spel.length; q++) {                // dripstone cones (calcite)
            const c = bs.spel[q], t = c.up ? (y - c.top) / c.len : (c.top - y) / c.len;   // 0 at the root, 1 at the tip
            if (t < -0.05 || t > 1) continue;
            const rad = c.r * (1 - t * 0.85) * (1 + 0.25 * vnoise(x * 3, y * 3, z * 3)), hd = Math.hypot(x - c.x, z - c.z);
            const cd = rad - hd;
            if (cd > v) v = cd;
            if (cd > -0.35) cal = Math.max(cal, clamp((cd + 0.35) / 0.35, 0, 1));
          }
          if (bs.old) { const fl = vnoise(x * 0.55 + 11, y * 0.9, z * 0.55 - 4); if (fl > 0.3) cal = Math.max(cal, smooth(0.3, 0.6, fl) * 0.85); }   // old rock: flowstone sheets over the walls
          if (bs.broken) v += 0.12 * vnoise(x * 3.1, y * 3.1, z * 3.1);                                                                  // broken rock: a rougher surface
          if (bs.core) { const c = coreDist(bs, x, y, z); if (c < v) v = c; }   // last: the crawl core is a promise, boulders and dripstone included
          if (bs.slabs) for (let q = 0; q < bs.slabs.length; q++) {   // after the core: a crust of sediment lying across a shaft, whole until it is not
            const sl = bs.slabs[q], hd = Math.hypot(x - sl.x, z - sl.z);
            const sd = Math.min(sl.r - hd + 0.1 * vnoise(x * 2.7, 0, z * 2.7), 0.2 - Math.abs(y - sl.y));
            if (sd > v) v = sd;
          }

          if (bs.wl !== undefined && y < bs.wl + 0.9) wt = clamp(1 - (y - bs.wl) / 0.9, 0, 1);
          // bioluminescence: damp band above water, plus flagged passages, patchy
          const patch = smooth(0.42, 0.9, vnoise(x * 1.5 + 21, y * 1.5, z * 1.5 - 13) * 0.5 + 0.5) * smooth(0.3, 0.7, vnoise(x * 0.35, y * 0.35, z * 0.35 + 5) * 0.5 + 0.5);
          if (bs.algae > 0) g = bs.algae * patch;
          if (bs.wl !== undefined && y > bs.wl - 0.2 && y < bs.wl + 1.6) g = Math.max(g, (bs.wl - Math.max(bs.y0, bs.y1) < 0.12 ? 0.3 : 0.8) * patch * (1 - (y - bs.wl) / 1.8));   // puddles grow less than pools
          if (bs.blue) g = -g;                                                          // the sign carries the colour: negative glow renders blue-white
        }
        dens[idx] = v; glow[idx] = g; calc[idx] = cal * 255; wet[idx] = wt * 255; tint[idx] = bs ? bs.tint * 50 : 0;
        if (v < 0) anyAir = true; else anyRock = true;
      }
    }
  }
  return { density: dens, glow, calc, wet, tint, anyAir, anyRock };
}

// water surfaces: one flat sheet per perched level, clipped to air. Returns Float32Array positions or null.
export function waterQuads(list, dens, cx, cy, cz) {
  const ox = cx * CHUNK, oy = cy * CHUNK, oz = cz * CHUNK;
  const levels = [];
  for (const s of list) if (s.wl !== undefined && s.wl >= oy && s.wl <= oy + CHUNK && !levels.includes(s.wl)) levels.push(s.wl);
  if (!levels.length) return null;
  const pos = [];
  for (const wl of levels) {
    const ly = (wl - oy) / VOXEL;
    for (let k = 0; k < N; k++) for (let i = 0; i < N; i++) {
      const x = ox + (i + 0.5) * VOXEL, z = oz + (k + 0.5) * VOXEL;
      if (gridAt(dens, i + 0.5, ly, k + 0.5) > -0.03) continue;
      const ns = nearestSeg(list, x, wl, z);
      if (!ns || ns.wl !== wl) continue;
      const x0 = x - VOXEL / 2, x1 = x + VOXEL / 2, z0 = z - VOXEL / 2, z1 = z + VOXEL / 2;
      // Clip each triangle against the interpolated shore. Terrain density and
      // collision stay untouched; only rendered water intersects the shoreline.
      const corners=[[x0,z0,i,k],[x0,z1,i,k+1],[x1,z1,i+1,k+1],[x1,z0,i+1,k]];
      for(const ids of [[0,1,2],[0,2,3]]){
        const input=ids.map(id=>{const v=corners[id];return {x:v[0],z:v[1],d:gridAt(dens,v[2],ly,v[3])+.03};}),poly=[];
        for(let c=0;c<3;c++){
          const a=input[c],b=input[(c+1)%3],inside=a.d<0,next=b.d<0;
          if(inside)poly.push(a);
          if(inside!==next){const t=a.d/(a.d-b.d);poly.push({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t});}
        }
        for(let c=1;c<poly.length-1;c++)for(const v of [poly[0],poly[c],poly[c+1]])pos.push(v.x,wl,v.z);
      }
    }
  }
  return pos.length ? new Float32Array(pos) : null;
}

const EDGE_C = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
const CORNER = [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]];
const ev = new Float32Array(36), fv = new Float32Array(8);
// Marching cubes over a chunk's grids; flat-shaded non-indexed triangles with per-face colour and glow.
export function marchingCubes(grids, cx, cy, cz, edgeTable, triTable) {
  const dens = grids.density, glowG = grids.glow, pos = [], col = [], glow = [], wet = [];
  const ox = cx * CHUNK, oy = cy * CHUNK, oz = cz * CHUNK;
  for (let k = 0; k < N; k++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const b = i + M * (j + M * k);
    fv[0] = dens[b]; fv[1] = dens[b + 1]; fv[2] = dens[b + 1 + M]; fv[3] = dens[b + M];
    fv[4] = dens[b + M * M]; fv[5] = dens[b + 1 + M * M]; fv[6] = dens[b + 1 + M + M * M]; fv[7] = dens[b + M + M * M];
    let ci = 0; for (let c = 0; c < 8; c++) if (fv[c] < 0) ci |= 1 << c;
    const bits = edgeTable[ci]; if (!bits) continue;
    const x = ox + i * VOXEL, y = oy + j * VOXEL, z = oz + k * VOXEL;
    for (let e = 0; e < 12; e++) if (bits & (1 << e)) {
      const c0 = EDGE_C[e][0], c1 = EDGE_C[e][1], v0 = fv[c0], v1 = fv[c1];
      const t = v0 / (v0 - v1), A = CORNER[c0], B = CORNER[c1];
      ev[e * 3] = x + (A[0] + (B[0] - A[0]) * t) * VOXEL;
      ev[e * 3 + 1] = y + (A[1] + (B[1] - A[1]) * t) * VOXEL;
      ev[e * 3 + 2] = z + (A[2] + (B[2] - A[2]) * t) * VOXEL;
    }
    let ti = ci * 16;
    while (triTable[ti] !== -1) {
      const a = triTable[ti] * 3, b2 = triTable[ti + 1] * 3, c = triTable[ti + 2] * 3;
      pos.push(ev[a], ev[a + 1], ev[a + 2], ev[b2], ev[b2 + 1], ev[b2 + 2], ev[c], ev[c + 1], ev[c + 2]);
      const fx = (ev[a] + ev[b2] + ev[c]) / 3, fy = (ev[a + 1] + ev[b2 + 1] + ev[c + 1]) / 3, fz = (ev[a + 2] + ev[b2 + 2] + ev[c + 2]) / 3;
      const lx = (fx - ox) / VOXEL, ly = (fy - oy) / VOXEL, lz = (fz - oz) / VOXEL;
      const wt = gridAt(grids.wet, lx, ly, lz) / 255, cal = gridAt(grids.calc, lx, ly, lz) / 255;
      faceColor(fx, fy, fz, cal, wt, gridAt(grids.tint, lx, ly, lz) / 50);
      col.push(fcol[0], fcol[1], fcol[2], fcol[0], fcol[1], fcol[2], fcol[0], fcol[1], fcol[2]);
      const sh = Math.min(1, wt + cal * 0.6); wet.push(sh, sh, sh);                 // sheen: wet rock and calcite are glossier
      const g = gridAt(glowG, lx, ly, lz);
      glow.push(g, g, g);
      ti += 3;
    }
  }
  if (!pos.length) return null;
  return { pos: new Float32Array(pos), col: new Float32Array(col), glow: new Float32Array(glow), wet: new Float32Array(wet) };
}

// Everything a chunk needs, from a segment list. `into` may hold grids to reuse.
export function buildChunkData(list, cx, cy, cz, edgeTable, triTable, into) {
  if (!list || list.length === 0) return { solid: true };
  const grids = buildField(list, cx, cy, cz, into);
  const out = { solid: !grids.anyAir, density: grids.density, glow: grids.glow, calc: grids.calc, wet: grids.wet, tint: grids.tint, rock: null, water: null };
  if (!grids.anyAir) return out;
  if (grids.anyRock) out.rock = marchingCubes(grids, cx, cy, cz, edgeTable, triTable);
  out.water = waterQuads(list, grids.density, cx, cy, cz);
  return out;
}

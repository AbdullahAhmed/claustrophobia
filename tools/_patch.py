p='src/field.js'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)
rep("""export const GOUR_STEP = 0.24;                                    // rimstone terrace height""",
    """export const GOUR_STEP = 0.5, GOUR_POOL = 0.2;                    // rimstone terrace height; pool depth behind each lip (coarse: the voxels are 0.4 m)""")
rep("""              const lip = 0.13 * (1 - smooth(0.0, 0.3, frac)) * (0.7 + 0.3 * vnoise(x * 4, 0, z * 4));""",
    """              const lip = 0.34 * (1 - smooth(0.0, 0.13, frac)) * (0.75 + 0.25 * vnoise(x * 4, 0, z * 4));""")
open(p,'w',encoding='utf-8').write(s)
p='src/gen.js'; s=open(p,encoding='utf-8').read()
rep("""import { VOXEL, N, M, CHUNK, CY, NOISE_AMP, CORE_H, GOUR_STEP, setSeed,""", """import { VOXEL, N, M, CHUNK, CY, NOISE_AMP, CORE_H, GOUR_STEP, GOUR_POOL, setSeed,""")
rep("""wl: Math.ceil(this.y / GOUR_STEP) * GOUR_STEP + 0.1, big: false, quiet: true }); }""",
    """wl: Math.ceil(this.y / GOUR_STEP) * GOUR_STEP + GOUR_POOL, big: false, quiet: true }); }""")
rep("""        wl = Math.ceil((this.y + 0.02) / GOUR_STEP) * GOUR_STEP + 0.1;""",
    """        wl = Math.ceil((this.y + 0.02) / GOUR_STEP) * GOUR_STEP + GOUR_POOL;""")
open(p,'w',encoding='utf-8').write(s)

p='src/main.js'; s=open(p,encoding='utf-8').read()
# pale pool water over calcite: per-vertex colour on the water
rep("""const waterMat = new THREE.MeshStandardMaterial({ color: 0x0a2226, roughness: 0.08, metalness: 0.3, emissive: 0x03120f,
                                                  transparent: true, opacity: 0.84, side: THREE.DoubleSide, depthWrite: false });""",
    """const waterMat = new THREE.MeshStandardMaterial({ color: 0x0a2226, roughness: 0.08, metalness: 0.3, emissive: 0x03120f, vertexColors: true,
                                                  transparent: true, opacity: 0.84, side: THREE.DoubleSide, depthWrite: false });""")
rep("""    const fl = new Float32Array(out.water.length), W = out.water;
    for (let i = 0; i < W.length; i += 18) {                        // one lookup per quad
      const f = G.flowAt(W[i] + 0.2, W[i + 1], W[i + 2] + 0.2);
      if (f) for (let k = 0; k < 18; k += 3) { fl[i + k] = f.x * f.s; fl[i + k + 2] = f.z * f.s; }
    }
    g.setAttribute('aFlow', new THREE.BufferAttribute(fl, 3));""",
    """    const fl = new Float32Array(out.water.length), col = new Float32Array(out.water.length).fill(1), W = out.water;
    for (let i = 0; i < W.length; i += 18) {                        // one lookup per quad
      const f = G.flowAt(W[i] + 0.2, W[i + 1], W[i + 2] + 0.2);
      if (f) for (let k = 0; k < 18; k += 3) { fl[i + k] = f.x * f.s; fl[i + k + 2] = f.z * f.s; }
      const sg = G.nearestSegAt(W[i] + 0.2, W[i + 1], W[i + 2] + 0.2);
      if (sg && sg.gour) for (let k = 0; k < 18; k += 3) { col[i + k] = 3.2; col[i + k + 1] = 3.6; col[i + k + 2] = 3.3; }   // shallow water over white calcite
    }
    g.setAttribute('aFlow', new THREE.BufferAttribute(fl, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));""")
open(p,'w',encoding='utf-8').write(s); print('ok')

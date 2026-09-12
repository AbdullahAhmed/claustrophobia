p='src/field.js'; s=open(p,encoding='utf-8').read()
def rep(old,new,cnt=1):
    global s
    assert s.count(old)==cnt, (s.count(old), old[:70]); s=s.replace(old,new)
rep("""  const dens = grids.density, glowG = grids.glow, pos = [], col = [], glow = [];""",
    """  const dens = grids.density, glowG = grids.glow, pos = [], col = [], glow = [], wet = [];""")
rep("""      faceColor(fx, fy, fz, gridAt(grids.calc, lx, ly, lz) / 255, gridAt(grids.wet, lx, ly, lz) / 255, gridAt(grids.tint, lx, ly, lz) / 50);
      col.push(fcol[0], fcol[1], fcol[2], fcol[0], fcol[1], fcol[2], fcol[0], fcol[1], fcol[2]);""",
    """      const wt = gridAt(grids.wet, lx, ly, lz) / 255, cal = gridAt(grids.calc, lx, ly, lz) / 255;
      faceColor(fx, fy, fz, cal, wt, gridAt(grids.tint, lx, ly, lz) / 50);
      col.push(fcol[0], fcol[1], fcol[2], fcol[0], fcol[1], fcol[2], fcol[0], fcol[1], fcol[2]);
      const sh = Math.min(1, wt + cal * 0.6); wet.push(sh, sh, sh);                 // sheen: wet rock and calcite are glossier""")
rep("""  return { pos: new Float32Array(pos), col: new Float32Array(col), glow: new Float32Array(glow) };""",
    """  return { pos: new Float32Array(pos), col: new Float32Array(col), glow: new Float32Array(glow), wet: new Float32Array(wet) };""")
open(p,'w',encoding='utf-8').write(s)

p='src/worker.js'; s=open(p,encoding='utf-8').read()
rep("""    if (out.rock) transfer.push(out.rock.pos.buffer, out.rock.col.buffer, out.rock.glow.buffer);""",
    """    if (out.rock) transfer.push(out.rock.pos.buffer, out.rock.col.buffer, out.rock.glow.buffer, out.rock.wet.buffer);""")
open(p,'w',encoding='utf-8').write(s)

p='src/main.js'; s=open(p,encoding='utf-8').read()
rep("""    geo.setAttribute('glow', new THREE.BufferAttribute(out.rock.glow, 1));""",
    """    geo.setAttribute('glow', new THREE.BufferAttribute(out.rock.glow, 1));
    if (out.rock.wet) geo.setAttribute('wet', new THREE.BufferAttribute(out.rock.wet, 1));""")
rep("""  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', 'attribute float glow; varying float vGlow;\\n#include <common>')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\\nvGlow = glow;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', 'varying float vGlow;\\n#include <common>')
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\\ntotalEmissiveRadiance += vec3(0.10, 0.75, 0.55) * vGlow * vGlow * 0.32;');""",
"""  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', 'attribute float glow; attribute float wet; varying float vGlow; varying float vWet;\\n#include <common>')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\\nvGlow = glow; vWet = wet;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', 'varying float vGlow; varying float vWet;\\n#include <common>')
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\\nroughnessFactor = roughnessFactor * (1.0 - 0.62 * vWet);')   // wet rock and flowstone catch the beam
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\\ntotalEmissiveRadiance += vec3(0.10, 0.75, 0.55) * vGlow * vGlow * 0.32;');""")
open(p,'w',encoding='utf-8').write(s); print('ok')

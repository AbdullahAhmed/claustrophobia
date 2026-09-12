from pathlib import Path
r=Path(__file__).resolve().parents[1];p=r/'src/main.js';s=p.read_text(encoding='utf-8')
s=s.replace('moteSz[i] = 0.007 + Math.random() * 0.014','moteSz[i] = 0.003 + Math.random() * 0.005').replace('0.5 * level * edge','0.25 * level * edge')
s=s.replace('color: 0xf3f5ff, roughness: 0.28, metalness: 0.0, emissive: 0x2c3444','color: 0xc5c2b7, roughness: 0.42, metalness: 0.0')
s=s.replace("$('loading').hidden=true;", "$('loading').hidden=true; $('go').disabled=false;")
p.write_text(s,encoding='utf-8')
p=r/'index.html';s=p.read_text(encoding='utf-8');s=s.replace('<p id="ov-body">','<p>Find the way out. Keep the torch charged. Listen to the water.</p>\n  <details><summary>Controls and survival</summary>\n  <p id="ov-body">').replace('LT run · D-pad up rope · View survey · Menu pause</p>','LT run · D-pad up rope · View survey · Menu pause</p></details>')
s=s.replace('class="go" id="go">','class="go" id="go" disabled>')
s=s.replace('</style>','details{margin-top:18px}summary{cursor:pointer;font-size:12px;letter-spacing:.08em;color:#c8b897}details[open] summary{margin-bottom:12px}#go:disabled{opacity:.35;cursor:wait;animation:none}\n</style>')
p.write_text(s,encoding='utf-8')
p=r/'README.md';s=p.read_text(encoding='utf-8').replace('# Karst','# Claustrophobia — Free Browser Demo',1)
a=s.index('Static hosting needs');b=s.index('\n| Control',a)
s=s[:a]+'''The cave continues to generate as the player explores. The 30 numbered seeds above are regression samples, not a level catalogue. A separate regression verifies growth beyond the initially generated region.

The demo uses original low-poly Blender assets, world-space mineral detail, clipped water edges, depth coloration, splash rings, debris/dust, streamed decorations and configurable VHS presentation. Tape is **Subtle** by default; Graphics defaults to **Standard**. Reduced motion and brightness controls are in the pause menu. Existing `karst.*` save keys remain compatible.

Runtime dependencies are local: Three.js **0.160.0**, fonts, models and sound. Static hosting needs `index.html`, `credits.html`, `src/`, `vendor/three/`, `assets/fonts/`, `assets/models/*.glb`, `sounds/out/` and `sounds/CREDITS.md`. No CDN requests are needed. The Blender source, development tools, screenshots, `.git` and `.claude` stay off the web server.

`tools/build_art.py` rebuilds the original model library using Blender 5.2; `assets/models/claustrophobia-library.blend` retains editable source. The glTF exports and named parts can be reused during the later engine port. `src/assets.js`, `src/presentation.js`, `src/vfx.js` and `src/regions.js` separate assets, display effects and regional resource lifetime from survival logic.

`python tools/serve_qa.py 8798` exposes the local visual harness at `/tools/visual-check.html`; its evidence endpoint writes only to the named local audit folder and accepts its own origin. This tool is excluded from deployment. Scene captures use diagnostic viewpoints, not a certified playthrough. Use `tools/package_demo.py` for a versioned runtime archive and publish its entry point last.
''' +s[b:];p.write_text(s,encoding='utf-8')

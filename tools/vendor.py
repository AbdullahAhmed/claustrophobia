"""Pin runtime dependencies locally; rerun only when deliberately updating the lock."""
from pathlib import Path
from urllib.request import urlopen, Request
import re, json, hashlib
root = Path(__file__).resolve().parents[1]
base = 'https://cdn.jsdelivr.net/npm/three@0.160.0/'
seen = set()
def fetch(rel):
    if rel in seen: return
    seen.add(rel)
    data = urlopen(base + rel).read()
    dest = root / 'vendor/three' / rel
    dest.parent.mkdir(parents=True, exist_ok=True); dest.write_bytes(data)
    if rel.endswith('.js'):
        for imp in re.findall(r"from\s+['\"]([^'\"]+)", data.decode()):
            if imp.startswith('.'):
                import posixpath
                fetch(posixpath.normpath(posixpath.join(posixpath.dirname(rel), imp)))
for rel in ['build/three.module.js','examples/jsm/loaders/GLTFLoader.js','examples/jsm/geometries/DecalGeometry.js','examples/jsm/objects/MarchingCubes.js','LICENSE']:
    fetch(rel)
fonts = root / 'assets/fonts'; fonts.mkdir(parents=True, exist_ok=True)
css = urlopen(Request('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500&family=IBM+Plex+Mono:wght@400;500&family=Caveat:wght@600&display=swap', headers={'User-Agent':'Mozilla/5.0'})).read().decode()
for i, url in enumerate(dict.fromkeys(re.findall(r'url\((https://[^)]+)\)', css))):
    name = f'font-{i}.' + url.split('.')[-1]
    (fonts/name).write_bytes(urlopen(url).read()); css = css.replace(url, './'+name)
(fonts/'fonts.css').write_text(css, encoding='utf-8')
for repo,name in [('cormorantgaramond','cormorant'),('ibmplexmono','ibm-plex-mono'),('caveat','caveat')]:
    (fonts/(name+'-OFL.txt')).write_bytes(urlopen('https://raw.githubusercontent.com/google/fonts/main/ofl/'+repo+'/OFL.txt').read())
files = sorted([p for folder in ['vendor','assets/fonts'] for p in (root/folder).rglob('*') if p.is_file()])
(root/'vendor/lock.json').write_text(json.dumps({str(p.relative_to(root)).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest() for p in files}, indent=2), encoding='utf-8')
print(f'Vendored Three.js 0.160.0 and fonts: {len(files)} files')

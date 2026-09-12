"""Package immutable runtime assets first, with index.html as the last publish step."""
from pathlib import Path
import hashlib,json,zipfile,re,shutil,sys
root=Path(__file__).resolve().parents[1]
out=Path(sys.argv[1]) if len(sys.argv)>1 else root/'dist'
runtime=[root/'credits.html',root/'sounds/CREDITS.md']
for folder,pattern in [('src','*.js'),('vendor/three','*'),('assets/fonts','*'),('assets/models','*.glb'),('sounds/out','*')]:
    runtime.extend(p for p in (root/folder).rglob(pattern) if p.is_file())
runtime=sorted(set(runtime));digest=hashlib.sha256()
for p in [root/'index.html']+runtime:digest.update(p.read_bytes())
release='demo-0.2.0-'+digest.hexdigest()[:10];dest=out/release;web=dest/'site';prefix='releases/'+release
for p in runtime:
    target=web/prefix/p.relative_to(root);target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,target)
entry=(root/'index.html').read_text(encoding='utf-8').replace('<html lang="en">',f'<html lang="en">\n<base href="./{prefix}/">')
(web/'index.html').write_text(entry,encoding='utf-8')
credits=web/prefix/'credits.html';credits.write_text(credits.read_text(encoding='utf-8').replace('href="./"','href="../../"'),encoding='utf-8')
files=sorted(p for p in web.rglob('*') if p.is_file());manifest={str(p.relative_to(web)).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
(dest/'manifest.json').write_text(json.dumps({'release':release,'files':manifest},indent=2),encoding='utf-8')
for name,selection in [('runtime-first.zip',[p for p in files if p.name!='index.html']),('complete-demo.zip',files)]:
    with zipfile.ZipFile(dest/name,'w',zipfile.ZIP_DEFLATED) as z:
        for p in selection:z.write(p,p.relative_to(web))
shutil.copyfile(web/'index.html',dest/'index.html')
# Validate pinned module imports and audio/model presence before any publication.
assert len(list((web/prefix/'assets/models').glob('*.glb')))==16
assert len(list((web/prefix/'sounds/out').glob('*.ogg')))==97
assert 'cdn.jsdelivr' not in entry and 'fonts.googleapis' not in entry
assert all(not any(part in ['.git','.claude','tools'] for part in Path(name).parts) for name in manifest)
(dest/'publish.txt').write_text(f'''Target: https://claustro.alphasquaredgames.com/
Document root: /home/u481134120/domains/alphasquaredgames.com/public_html/claustro
1. Upload and extract runtime-first.zip in this document root.
2. Verify every releases/{release}/ file against manifest.json over HTTPS.
3. Upload index.html last, replacing only the existing entry point.
4. Verify index.html hash and play the public URL in a fresh browser tab.
Rollback: restore the prior index.html; versioned runtime assets do not overwrite earlier releases.
Never publish Blender sources, development tools, credentials or repository metadata.
''',encoding='utf-8')
print(json.dumps({'release':release,'directory':str(dest),'files':len(files),'bytes':sum(p.stat().st_size for p in files)},indent=2))

"""Freesound CC0 sourcing helper (no API key: reads public pages + preview CDN).

  python tools/fs.py search "cave water drip" [--min 0.3] [--max 20] [--n 15]
  python tools/fs.py get <id> <name>        # verify CC0 on the sound page, download HQ ogg preview to sounds/<name>.ogg, append to sounds/CREDITS.md
"""
import re, sys, json, os, urllib.request, urllib.parse, html

UA = {'User-Agent': 'Mozilla/5.0 (karst asset fetch)'}
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SND = os.path.join(ROOT, 'sounds')

def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.read()

def search(q, mn=0.0, mx=1e9, n=15, sort='score desc'):
    url = 'https://freesound.org/search/?' + urllib.parse.urlencode({'q': q, 'f': 'license:"Creative Commons 0"', 's': sort})
    h = fetch(url).decode('utf-8', 'ignore')
    out = []
    for m in re.finditer(r'<div\s+class="bw-player"(.*?)tabindex="0">', h, re.S):
        blk = m.group(1)
        g = lambda k: (re.search(r'data-%s="([^"]*)"' % k, blk) or [None, ''])[1]
        try: dur = float(g('duration'))
        except: dur = 0
        if dur < mn or dur > mx: continue
        # rating sits a bit after the player block
        tail = h[m.end():m.end() + 6000]
        rt = re.search(r'Average rating of ([\d.]+)', tail)
        out.append({'id': int(g('sound-id')), 'user': g('username'), 'uid': g('user-id'), 'title': html.unescape(g('title')),
                    'dur': round(dur, 1), 'dl': int(g('num-downloads') or 0), 'rating': float(rt.group(1)) if rt else 0,
                    'ogg': g('ogg').replace('-lq.', '-hq.')})
    out.sort(key=lambda s: -s['dl'])
    for s in out[:n]:
        print(f"{s['id']:>7}  {s['dur']:>6.1f}s  dl={s['dl']:<5} r={s['rating']:<4} {s['user'][:18]:<18} {s['title'][:60]}")
    return out

def get(sid, name):
    # find the page URL via search on the id? simpler: sound pages redirect from /sounds/<id>/
    page_url = f'https://freesound.org/s/{sid}/'
    req = urllib.request.Request(page_url, headers=UA)
    with urllib.request.urlopen(req, timeout=40) as r:
        final = r.geturl(); h = r.read().decode('utf-8', 'ignore')
    lic = re.search(r'creativecommons\.org/publicdomain/zero/1\.0', h)
    lic_txt = 'Creative Commons 0' if lic else (re.search(r'License[^<]*<[^>]*>([^<]*)', h) or [None, '?'])[1]
    if not lic:
        print(f'!! {sid} is NOT CC0 ({lic_txt}) — skipped'); return False
    user = re.search(r'/people/([^/]+)/sounds/%d/' % sid, final or h).group(1)
    title = html.unescape((re.search(r'<title>([^<]*)</title>', h) or [None, str(sid)])[1]).split(' by ')[0].replace('Freesound - ', '').strip()
    ogg = re.search(r'data-ogg="([^"]+)"', h)
    if not ogg: print('!! no preview url'); return False
    url = ogg.group(1).replace('-lq.', '-hq.')
    data = fetch(url)
    os.makedirs(SND, exist_ok=True)
    path = os.path.join(SND, name + '.ogg')
    open(path, 'wb').write(data)
    line = f'- `{name}.ogg` — "{title}" by {user} — https://freesound.org/s/{sid}/ — CC0 1.0\n'
    cred = os.path.join(SND, 'CREDITS.md')
    if not os.path.exists(cred):
        open(cred, 'w', encoding='utf-8').write('# Sound credits\n\nAll clips are Creative Commons 0 (public domain dedication). Sources are Freesound HQ previews, trimmed/normalised with tools/prep.py.\n\n')
    existing = open(cred, encoding='utf-8').read()
    if f'`{name}.ogg`' not in existing:
        open(cred, 'a', encoding='utf-8').write(line)
    print(f'ok {name}.ogg  {len(data)//1024} KB  "{title}" by {user}')
    return True

if __name__ == '__main__':
    a = sys.argv[1:]
    if a[0] == 'search':
        kw = {}; q = a[1]
        for i in range(2, len(a), 2):
            kw[a[i].lstrip('-')] = a[i + 1]
        search(q, float(kw.get('min', 0)), float(kw.get('max', 1e9)), int(kw.get('n', 15)), kw.get('sort', 'score desc'))
    elif a[0] == 'get':
        get(int(a[1]), a[2])

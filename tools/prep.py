"""Prepare the raw CC0 clips in sounds/ into game-ready mono OGGs in sounds/out/ + manifest.json.

  python tools/prep.py

One-shots: trim silence, peak-normalise to -1 dBFS.
Sequences: onset-slice into single hits (steps, wades, strokes, rattles, scrapes).
Loops: take a middle window, RMS-normalise, equal-power crossfade the seam so they loop cleanly.
"""
import os, json, numpy as np, soundfile as sf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SND = os.path.join(ROOT, 'sounds'); OUT = os.path.join(SND, 'out')
os.makedirs(OUT, exist_ok=True)
SR = 44100
manifest = {}

def load(name):
    d, sr = sf.read(os.path.join(SND, name + '.ogg'), dtype='float32', always_2d=True)
    d = d.mean(axis=1)
    if sr != SR:                       # linear resample is fine for these
        n = int(len(d) * SR / sr); d = np.interp(np.linspace(0, len(d) - 1, n), np.arange(len(d)), d).astype('float32')
    return d

def db(x): return 20 * np.log10(max(x, 1e-9))
def peak_norm(d, target=-1.0):
    p = np.abs(d).max() or 1; return (d * (10 ** (target / 20) / p)).astype('float32')
def rms_norm(d, target=-20.0, ceiling=-1.0):
    r = np.sqrt(np.mean(d * d)) or 1e-9; d = d * (10 ** (target / 20) / r)
    p = np.abs(d).max()
    if p > 10 ** (ceiling / 20): d = d * (10 ** (ceiling / 20) / p)
    return d.astype('float32')
def envelope(d, win=0.01):
    w = int(SR * win); k = np.ones(w) / w
    return np.sqrt(np.convolve(d * d, k, mode='same'))
def trim(d, thresh_db=-50, pad=0.01):
    e = envelope(d, 0.005); t = 10 ** (thresh_db / 20)
    idx = np.where(e > t)[0]
    if not len(idx): return d
    a = max(0, idx[0] - int(SR * pad)); b = min(len(d), idx[-1] + int(SR * pad * 4))
    return d[a:b]
def fade(d, fin=0.003, fout=0.02):
    d = d.copy(); a = int(SR * fin); b = int(SR * fout)
    if a: d[:a] *= np.linspace(0, 1, a)
    if b: d[-b:] *= np.linspace(1, 0, b)
    return d
def write(name, d, q=0.4):
    # libsndfile's vorbis encoder crashes on single writes > ~10 s (Windows); stream it in 1 s blocks
    with sf.SoundFile(os.path.join(OUT, name + '.ogg'), 'w', SR, 1, format='OGG', subtype='VORBIS', compression_level=q) as f:
        for i in range(0, len(d), SR): f.write(d[i:i + SR])
    return name + '.ogg'

def oneshot(key, names, gain_db=-1.0, maxlen=None):
    files = []
    for i, n in enumerate(names):
        d = trim(load(n))
        if maxlen: d = d[:int(SR * maxlen)]
        d = fade(peak_norm(d, gain_db))
        files.append(write(f'{key}{i + 1}' if len(names) > 1 else key, d))
    manifest[key] = files
    print(f'{key:16} {len(files)} × oneshot  ' + ' '.join(f'{len(load(n)) / SR:.1f}s' for n in names))

def slices(key, name, min_gap=0.18, maxlen=0.6, max_n=8, gain_db=-2.0, thresh=0.35, minlen=0.25):
    d = load(name); e = envelope(d, 0.008)
    hi = np.percentile(e, 99.5); lo = np.median(e)
    t = lo + (hi - lo) * thresh
    onsets = []; last = -1e9
    for i in range(1, len(e)):
        if e[i] > t and e[i - 1] <= t and i - last > SR * min_gap:
            onsets.append(i); last = i
    files = []; base = len(manifest.get(key, []))
    for k, o in enumerate(onsets[:max_n]):
        a = max(0, o - int(SR * 0.012)); end = onsets[k + 1] - int(SR * 0.01) if k + 1 < len(onsets) else len(d)
        b = min(end, a + int(SR * maxlen), len(d))
        seg = d[a:b]
        # tail: cut once the envelope has fallen to ~12% of this hit's own peak (never before minlen)
        es = envelope(seg, 0.01); m0 = int(SR * minlen)
        if len(es) > m0:
            quiet = np.where(es[m0:] < es.max() * 0.12)[0]
            if len(quiet): seg = seg[:m0 + quiet[0] + int(SR * 0.03)]
        if len(seg) < SR * 0.05: continue
        files.append(write(f'{key}{base + len(files) + 1}', fade(peak_norm(seg, gain_db), 0.002, 0.04)))
    manifest[key] = manifest.get(key, []) + files
    print(f'{key:16} {len(files)} slices from {name} ({len(onsets)} onsets)')

def loop(key, name, seconds=18.0, start=None, target_db=-22.0, xf=0.6):
    d = load(name)
    n = min(len(d), int(SR * seconds))
    s = int(SR * start) if start is not None else max(0, (len(d) - n) // 2)
    seg = d[s:s + n].copy()
    x = int(SR * xf)
    if x and len(seg) > 3 * x:
        head = seg[:x].copy(); tail = seg[-x:].copy()
        w = np.linspace(0, 1, x, dtype='float32')
        seg[-x:] = tail * np.sqrt(1 - w) + head * np.sqrt(w)   # seam: end blends into the start
        seg = seg[:-1]
    manifest[key] = [write(key, rms_norm(seg, target_db), 0.35)]
    print(f'{key:16} loop {len(seg) / SR:.1f}s from {name}')

# ---- drips / water ----
oneshot('drip', ['drip1', 'drip2', 'drip3'])
loop('drips_cave', 'drips_cave', 11.0, target_db=-26)
oneshot('splash', ['splash1', 'splash2'], -2)
oneshot('splash_small', ['splash_small', 'splash_plop'], -4)
slices('wade', 'wade_seq', 0.25, 0.7, 6, -3, 0.35, 0.3)
slices('wade', 'wade_seq2', 0.25, 0.7, 6, -3, 0.35, 0.3)
slices('stroke', 'swim_seq', 0.5, 1.2, 6, -4, 0.3, 0.6)
oneshot('bubbles', ['bubbles1', 'bubbles2'], -8)
loop('amb_underwater', 'amb_underwater', 20.0, target_db=-24)
# ---- ambience ----
loop('amb_cave', 'amb_cave', 20.0, target_db=-30)
loop('amb_grotto', 'amb_grotto', 18.0, target_db=-28)
loop('amb_drone', 'amb_drone', 20.0, target_db=-30)
oneshot('rumble', ['rumble'], -6)
oneshot('rockfall', ['rockfall1', 'rockfall2', 'rockfall3'], -3)
oneshot('rockslide', ['rockslide'], -3, 7.0)
# ---- movement ----
slices('step_rock', 'steps_rock_seq', 0.22, 0.5, 8, -3, 0.35, 0.2)
oneshot('step_gravel', ['step_gravel1', 'step_gravel2', 'step_gravel3', 'step_gravel4'], -3)
oneshot('scrape', ['scrape1', 'scrape2', 'scrape3'], -6, 1.4)
slices('drag', 'drag_gravel_seq', 0.35, 0.9, 6, -6, 0.3, 0.4)
# ---- body ----
loop('breath_calm', 'breath_calm', 5.1, 0, -30, 0.25)
loop('breath_scared', 'breath_scared_loop', 7.0, 0, -26, 0.25)
loop('breath_heavy', 'breath_heavy', 16.0, target_db=-24, xf=0.4)
loop('breath_labored', 'breath_labored', 16.0, target_db=-24, xf=0.4)
oneshot('gasp', ['gasp1', 'gasp2'], -4)
oneshot('gasping', ['gasping'], -5)
loop('heartbeat', 'heartbeat', 9.9, 0, -20, 0.2)
oneshot('whoosh', ['whoosh_fall', 'whoosh_short'], -4)
oneshot('body_fall', ['body_fall1', 'body_fall2'], -1)
# ---- torch ----
oneshot('torch_click', ['torch_click1', 'torch_click2'], -6)
oneshot('rattle', ['rattle1'], -8)
slices('rattle', 'rattle_seq', 0.15, 0.35, 6, -8, 0.3, 0.15)
oneshot('bulb_buzz', ['bulb_buzz'], -14)
# ---- things in the dark ----
oneshot('creature_breath', ['creature_breath'], -8)
oneshot('creature_growl', ['creature_growl'], -8)
oneshot('bones_rattle', ['bones_rattle'], -6)
oneshot('bone_crunch', ['bone_break', 'bone_crunch'], -4)

# ---- daylight ----
loop('wind', 'wind_loop', 20.0, target_db=-24, xf=1.0)
loop('birds', 'birds_forest', 20.0, target_db=-26, xf=1.0)

# ---- bats ----
loop('bats_colony', 'bats_colony', 16.0, target_db=-24, xf=0.8)
oneshot('bats_burst', ['bats_chirp'], -6, 6.0)
oneshot('flap', ['flap1', 'flap2', 'flap3'], -8)

json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1)
tot = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
print(f'\n{len(os.listdir(OUT)) - 1} files, {tot / 1e6:.2f} MB total')

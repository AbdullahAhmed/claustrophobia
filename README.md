# Karst

A roguelike caving simulator in the browser. The cave is endless and procedurally carved; it is pitch black; you have a
hand-crank torch, sixteen seconds of breath, and a piece of chalk. Somewhere, if you persist, it opens to daylight.

**Play:** serve the folder with any static server and open `index.html` (ES modules need http, not `file://`):

```bash
python -m http.server 8080
```

Then http://localhost:8080/ — add `?seed=123` to fix the cave layout. Mouse + keyboard, headphones recommended.

| key | action |
|---|---|
| W A S D / mouse | move / look |
| C (hold) | crouch — low ceilings put you on your belly automatically; underwater: dive |
| Space | hop / mantle; underwater: surface |
| F (tap repeatedly) | shake the torch to charge it — the bulb is dark while you do |
| T | chalk a note on the rock you're looking at |
| ` | debug survey line |
| Esc | release the mouse |

## How it works

`src/gen.js` — **worm graph → distance field → marching cubes.** Worm agents walk *floor lines* through space carrying a
width/height that drifts through modes (passage, chamber, crawl, squeeze, canyon, bedding plane, sump, pit, cavern).
Every point's density is the distance to the nearest ellipsoidal capsule plus rock noise, with sediment fill for walkable
floors, a guaranteed 0.68 m crawl core so intended passages are always passable, boulders unioned in for caverns, and a
per-sample glow channel for bioluminescent algae. Chunks (8 m, 0.4 m voxels) are meshed within 32 m of the player and
disposed beyond 48 m; worms only advance within 60 m and die rather than carve into chunks near you.

`src/main.js` — three.js scene, player (collision samples the same density grid the mesh came from — no physics engine),
stances, swimming and breath, fall damage and injury, torch battery, chalk decals, bones, eyes, the exit, end screens.

`src/audio.js` — Web Audio: positional one-shots, looped layers, three synthesized cave reverbs crossfaded by measured
openness, a lowpass that closes over everything underwater.

## Sounds

All recordings are **CC0** from Freesound; see [`sounds/CREDITS.md`](sounds/CREDITS.md) for every clip, author and link.
`tools/fs.py` finds and license-checks clips; `tools/prep.py` slices, trims, normalises and loops them into `sounds/out/`.

## Risks (by design)

Sumps you may not have the breath for. Pits you can't see until you're falling. Crawls that pinch shut. Caverns whose
far walls your torch never reaches. A torch that dies in about two minutes unless you keep shaking it — blind while you
do. And sometimes, down the passage, a pair of eyes.

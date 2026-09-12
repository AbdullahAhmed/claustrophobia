# Karst

A roguelike caving simulator in the browser. The cave is endless and procedurally carved; it is pitch black; you have a
hand-crank torch, sixteen seconds of breath (a little more with every sump you come up from), and a piece of chalk. Somewhere, if you persist, it opens to daylight.

**Play:** serve the folder with any static server and open `index.html` (ES modules need http, not `file://`):

```bash
python -m http.server 8080
```

Then http://localhost:8080/ — add `?seed=123` to fix the cave layout; the title screen links today's cave (the date as
a seed, the same for everyone). Mouse + keyboard or a controller, headphones recommended.

| key | action |
|---|---|
| W A S D / mouse | move / look |
| C (hold) | crouch — low ceilings put you on your belly automatically; underwater: dive |
| Space | hop / mantle; underwater: surface; in a chimney (a narrow rift going up): hold to climb — it drains you, and if you run out you come off |
| F (tap repeatedly) | shake the torch to charge it — the bulb is dark while you do |
| Q | spot or flood beam — narrow reaches the far wall of a cavern and the bottom of a pit, wide shows you the floor either side; the spot eats the battery faster |
| T | chalk a note on the rock you're looking at |
| G | drop a glowstick (three per attempt); hold and release to throw one — down a pit, across a chamber; you hear where it lands |
| H | whistle — the echo tells you how big the space is, even with the torch dead; bats mind it |
| M | your survey notebook — a pencil trace of where you have been, chalk notes, water in blue, the dead's routes faint |
| controller | sticks move and look · A hop / climb · B crouch · X shake · Y whistle · LB beam · RB glowstick · LT run · start survey · back rope |
| V | hide the interface, for a look |
| ` | debug survey line |
| Esc | release the mouse |

One cave per seed: you keep the same cave until you get out of it. Your dead stay where they fell (bones, and your old
torch — worth 25 % if you reach it), last attempt's chalk is still on the walls, and an interrupted attempt resumes where it
stopped. `N` on the death screen abandons the cave for a new one.

## How it works

`src/gen.js` — **worm graph → distance field → marching cubes.** Worm agents walk *floor lines* through space carrying a
width/height that drifts through modes (passage, chamber, crawl, squeeze, canyon, bedding plane, sump, pit, cavern,
stream, lake, duck, chimney, gour, crystal). Every 120-200 m a trunk line changes *theme* — dry, wet, broken, old —
which biases the modes it picks, its colour, and what it leaves lying about (bones, loose blocks, calcite, fossils).
Every point's density is the distance to the nearest ellipsoidal capsule plus rock noise, with sediment fill for walkable
floors, a guaranteed 0.68 m crawl core so intended passages are always passable, boulders unioned in for caverns, and a
per-sample glow channel for bioluminescent algae. Chunks (8 m, 0.4 m voxels) are meshed within 32 m of the player and
disposed beyond 48 m. Generation runs in lockstep rounds with per-worm random streams, so a seed gives exactly the same
cave whatever route you take — which is what lets your remains, chalk and interrupted runs persist. Chunk builds run in
Web Workers (`src/field.js` is the shared pure core). Water is per-node: a level, and for streams a flow vector; floods
shift every live level and re-queue the chunks that hold it; a collapse revokes the crawl core through a node, adds a
block and re-queues too. The crawl core is thinner than a voxel, so collision trusts the analytic core near the line
rather than the smeared grid.

`src/main.js` — three.js scene, player (collision samples the same density grid the mesh came from — no physics engine),
stances, swimming and breath, fall damage and injury, torch battery, chalk decals, bones, eyes, the exit, end screens.

`src/audio.js` — Web Audio: positional one-shots, looped layers, three synthesized cave reverbs crossfaded by measured
openness, a lowpass that closes over everything underwater.

## Sounds

All recordings are **CC0** from Freesound; see [`sounds/CREDITS.md`](sounds/CREDITS.md) for every clip, author and link.
`tools/fs.py` finds and license-checks clips; `tools/prep.py` slices, trims, normalises and loops them into `sounds/out/`.

## Places

Passages, chambers, crawls, squeezes, canyons, bedding planes, chimneys; flooded sumps with air bells; pits with plunge pools;
boulder caverns; crystal pockets; dripstone and calcite draperies; mist over the lakes; bioluminescent algae; cascades; active streamways that run downhill in
steps and sometimes go under; rimstone terraces — calcite dams holding clear pools, stepping down, with cave pearls in them; black lakes in big chambers that you wade into, swim across in the cold, and wade out of; windows — a second hole to the sky in a shallow chamber roof, with rain and roots and birds and no way up it; glow-worms — a few hundred blue-green lights on threads of silk, hung from a damp roof, best with the torch off; bat roosts; olms in the still pools, pale and blind, that flinch from the beam; fossils in the bedding — ammonites, crinoid stems, shells; mineral tints by region; bones, and the packs of the cavers who left them.
Every cave has one great room, well in: a cavern with a lake through the middle of it, algae on the walls, water
falling from the roof, glow-worms over the far shore. Chambers you reach get names, written into the survey. Some packs hold a page from their owner's log — what they
learned about the sump, the drop, the roof or the air nearby — copied into the margin of your survey and kept for
every later attempt at that cave.

## Risks (by design)

Sumps you may not have the breath for. Streams whose current strengthens toward the place they sink — swim with it
or don't get in. Pits you can't see until you're falling — about half the dry ones have a traverse from the ledge that winds down to
the same place, if you find it (the chalk sometimes says which side). Some pitches still have a rope somebody rigged and
left: most hold; the thin dark ones do not, about halfway down. Loose blocks in cavern roofs that come down when something
moves under them — you get about a second's warning. Dead-end pockets where the air has gone bad. Low stretches of the main way that come down behind you
once you are through — the rock is real afterwards, and stays down for that cave. And every so often it rains up
top: you hear it first, then every stream, sump and plunge pool rises by up to a metre for a few minutes, the
currents double, and the air bells fill. The way out is
never less than 340 m from where you fell in, and it is through the water — sometimes literally: a main line that
reaches far enough while it is a streamway leaves by a resurgence, the water quickening and running out into the light. Crawls that pinch shut. Caverns whose
far walls your torch never reaches. A torch that dies in about two minutes unless you keep shaking it — blind while you
do. Getting wedged in a crawl — and the tight ones only let you through on an empty chest: hold C to breathe out and push, a few centimetres at a time, and let go before the bar runs out. Flooded crawls where you go flat out with your chin in the water and the roof on your
back — every dip in the floor puts your face under. Cold that shakes the torch out of your hand. Bats. And sometimes, down the passage, a
pair of eyes — more often the longer this cave has known you. Sometimes the beam finds something low on the floor
ahead, looking back.

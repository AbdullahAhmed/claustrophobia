# Karst

A roguelike caving simulator in the browser. The cave is endless and procedurally carved; it is pitch black; you have a
hand-crank torch, sixteen seconds of breath (a little more with every sump you come up from), and a piece of chalk. Somewhere, if you persist, it opens to daylight.

**Play:** serve the folder with any static server and open `index.html` (ES modules need http, not `file://`):

```bash
python -m http.server 8080
```

Then http://localhost:8080/ — add `?seed=123` to fix the cave layout; the title screen links today's cave (the date as
a seed, the same for everyone). Mouse + keyboard or a controller, headphones recommended.

For development without stale browser caching, run `python tools/serve.py 8793` and open
http://127.0.0.1:8793/. Opening `index.html` directly from File Explorer will not load the ES modules.

Regression checks: `node --experimental-vm-modules --no-warnings tools/check.cjs` checks source syntax,
30 cave seeds against commit `dfabfd2` (bump that hash in tools/check.cjs when generation changes on purpose), intact slab collision, slab removal, stale worker results, and audio files.
For browser smoke checks, run `python tools/serve.py 8794`, open http://127.0.0.1:8794/tools/smoke.html,
and click **Run checks in this test tab**. Use this separate test port: the checks create a saved attempt there.
The browser checks cover rendering, sound decoding, walking, torch charging, the survey, autosave, and resume.

Static hosting needs `index.html`, `src/`, `sounds/out/`, and `sounds/CREDITS.md` with their paths intact.
Three.js and fonts load from the external URLs in `index.html`; the game needs an internet connection for them.
Development tools, screenshots, `.git`, and `.claude` are not needed on the web server.

| Control | Action |
|---|---|
| WASD / arrows + mouse | Move / look |
| Shift (hold) | Run |
| C / Ctrl (hold) | Crouch or dive; breathe out when tightly wedged. Release to breathe. Low ceilings still crouch/crawl automatically. |
| Space | Hop; hold to climb a chimney or swim upward |
| Left mouse (hold) | Shake and recharge the torch continuously; the beam dims while charging |
| Right mouse (hold) | Focus the beam; release for wide. The focused beam uses more battery. |
| E | Use or rig a nearby rope — a coil is about twelve metres; a deeper pitch takes two, tied. Hold E at the top of a rope you rigged to pull it up and coil it again. At the edge of a sump, E ties a coil off and lays it through as a line (about fourteen metres of line per coil); in the water, hold E to haul yourself along the line toward the nearer end, faster than swimming and blind if you have to. Hold E on either bank to reel it in |
| G | Tap to drop a glowstick; hold and release to throw |
| P (right stick click) | Photograph. Eight frames on the roll per attempt; the flash lights the whole room for an instant — more than the torch ever shows — and the print goes into the survey, numbered where you took it. Prints stay in the cave's notebook across attempts and appear on the end screen |
| Q (hold) | Tools wheel: move the mouse toward chalk, whistle, rest, or stone, then release Q. Release at the center to cancel. A tossed stone lands where you are looking: you hear the floor, or the drop — and a crust over a shaft gives way under it. |
| Tab | Open / close the survey notebook |
| chalk | type a note and press Enter; press Enter with nothing typed (or pick chalk on a controller) for an arrow with the compass direction you face |
| Esc | Pause movement, resources, hazards, delayed events, and audio; open settings and the new-cave option |
| Alternating A / D | Work free from ordinary wedging |
| Backtick | Developer debug display |

Rest is selected from the tools wheel on dry ground and continues until you move or charge the torch.
Chalk opens a text field: Enter writes, Esc cancels and pauses. The tools wheel and notebook do **not** pause the cave.
HUD visibility and starting a new cave are in the pause menu; N no longer abandons a cave.
When pointer lock is unavailable, use the middle mouse button to drag-look.

Controller: left/right sticks move/look; A hops/climbs/swims upward; B crouches/dives/exhales;
hold X to charge, hold LB to focus, hold Y and aim the right stick for the tools wheel;
RB drops/throws a glowstick, LT runs, D-pad up uses a rope, View opens the survey, and Menu pauses/resumes.
Chalk text entry still needs a keyboard. Controller mappings have browser simulation coverage; physical controller feel needs a playtest.

One cave per seed: you keep the same cave until you get out of it. After six of you have died in one cave, a red rope
hangs down the hole you fell through: someone up there counted. Climbing it ends the cave — found, not out. Your dead stay where they fell (bones, and your old
torch — worth 25 % if you reach it), last attempt's chalk is still on the walls, and an interrupted attempt resumes where it
stopped. Ropes you rigged and lines you laid stay where they are for every later attempt at that cave. Choose **New cave** in the pause or death menu to abandon it.

## How it works

`src/gen.js` — **worm graph → distance field → marching cubes.** Worm agents walk *floor lines* through space carrying a
width/height that drifts through modes (passage, chamber, crawl, squeeze, canyon, bedding plane, sump, pit, cavern,
stream, lake, duck, chimney, gour, crystal). Every 120-200 m a trunk line changes *theme* — dry, wet, broken, old, maze —
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
steps and sometimes go under; rimstone terraces — calcite dams holding clear pools, stepping down, with cave pearls in them; black lakes in big chambers that you wade into, swim across in the cold, and wade out of; windows — a second hole to the sky in a shallow chamber roof, with rain and roots and birds and no way up it; glow-worms — a few hundred blue-green lights on threads of silk, hung from a damp roof, best with the torch off; bat roosts; olms in the still pools, pale and blind, that flinch from the beam; fossils in the bedding — ammonites, crinoid stems, shells; mineral tints by region; bones, and the packs of the cavers who left them — spare cells, glowsticks, rope, a first-aid kit, a wetsuit if you
are lucky, and their pages.
Every cave has one camp, well in: sleeping bags, a stove, the packs and pages of a party that stopped there, and
everything they chalked on the walls. Every cave has one great room, well in: a cavern with a lake through the middle of it, algae on the walls, water
falling from the roof, glow-worms over the far shore. The surface keeps real time: the light down the shafts and at the mouth is whatever it is outside right now — grey
day, orange dusk, or stars, with hardly a bird. Chambers you reach get names, written into the survey. Some packs hold a page from their owner's log — what they
learned about the sump, the drop, the roof or the air nearby — copied into the margin of your survey and kept for
every later attempt at that cave.

## Risks (by design)

Sumps you may not have the breath for — and in the deeper caves, an air bell whose air has nothing in it. Streams whose current strengthens toward the place they sink — swim with it
or don't get in. Pits you can't see until you're falling — and some you can't see at all: a crust of sediment lies across the top,
looks like floor, and takes your weight for about a second. About half the dry pits have a traverse from the ledge that winds down to
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
ahead, looking back. And if you sit resting in the dark long enough, in a cave that knows you, something picks up
the torch and carries it a way down the passage before setting it down again.

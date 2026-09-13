# Expedition demo v0.4

Accepted target: 10-15 minutes for a successful escape, without a countdown or fixed seed catalogue. Existing v0.2/v0.3 saves retain their generators. New caves gain a seeded route, camp and readable milestones, while optional cave branches continue growing.

Implementation order: verified surface attachment; procedural expedition and recovery; informative quieter audio; UI and hazard teaching; regression and rendered play checks; commit and publish the verified release.

Acceptance: no placement on unknown terrain; attachments disappear if their support is removed; traversable route samples and a reachable exit; visible camp interaction and checkpoint retry; deliberate treatment with progress; persistent objective/status and pickup identification; nearby hazards warned before contact; varied positional audio with optional captions. Timing is a design estimate until player playtests establish observed completion times.

## Implemented and verified

- Surface traces stop at unknown chunks; mineral, pearl, straw and small dripstone batches validate their supporting surface as regions update. Ceiling/floor placement uses loaded terrain. Inspection showed 106 visible supported mineral instances and no nearby unsupported records in the sampled gallery.
- New generator version 4 creates a seeded expedition route incrementally, one camp and a surface exit. A continuing procedural trunk and optional side passages remain. Versions 2 and 3 retain their existing generators. Numbered chalk marks and compass bearings guide the route; the objective progresses from camp to Mineral Gallery to Low Passage to daylight.
- Camp offers a paused interaction menu, route notes, a checkpoint, warmth/stamina recovery and deliberate medkit treatment. Retry uses the checkpoint. Treatment takes four seconds and moving cancels without consuming the kit. Moderate falls injure instead of killing above seven metres; impacts equivalent to more than twelve metres remain fatal. A second moderate fall drains stamina rather than killing immediately.
- Status, nearby pickup labels, coloured battery wraps and saved collected supplies make equipment understandable. Fragile sediment has visible crack markings, a pre-contact cue, a stone-testing hint and a longer collapse reaction window.
- Quiet ambience crossfades between recordings/offsets before looping. Breathing occurs in spaced bursts related to injury, cold or exertion. Actual flowing-water sources are positioned and attenuated by obstruction. Captions are optional and important cues reduce ambient masking. Camp suppresses nearby threat updates; misleading random presence sounds are disabled for expeditions.

Validation on 12 September 2026 (local):

- Source/density suite: 13 modules, 100 deterministic expedition plans, 107 supported/clear route samples across three seeds, route water/air checks, fall outcomes and removal/unknown-support checks. Thirty v3 baseline seeds and thirty v2 legacy seeds remain identical. Existing slab/worker/audio checks pass.
- 26 expedition browser checks: camp interaction, pause, notes, checkpoint/reload, treatment/cancellation, warmth/stamina, objectives, fall rules, audio rotation and caption setting.
- 40 gameplay smoke checks and 43 prior integration checks passed during this update; 22 visual checks passed across all quality/tape combinations. Camp equipment and mineral attachments were visually inspected.
- A continuous accelerated collision traversal of seed 17 reached the actual escape trigger in 9.46 simulated movement minutes. An earlier run found a low-passage blockage; the passage clearance and automatic crawl transition were corrected and the traversal passed twice afterward.

Limits: simulated movement time excludes player deliberation, map reading, rest and optional exploration. The 10-15 minute target requires human playtesting, especially the length of low passages. The traversal uses actual movement/collision and generated terrain, but is not a timed human survival run or exhaustive validation of all seeds. Physical controller feel and audio mix acceptance remain player checks. A browser WebGL-context failure followed repeated fixture reloads; a fresh Codex browser tab recovered and passed visual checks. No universal performance or constant-memory claim is made.

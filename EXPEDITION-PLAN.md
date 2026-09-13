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

## Publication

Published to https://claustro.alphasquaredgames.com/ on 12 September 2026 (America/Edmonton), verified at 2026-09-13T03:50:37Z. Runtime commit `b8cb183` is pushed on `codex/claustrophobia-expedition-demo-v0.4` from the isolated `C:\dev\claustrophobia-demo` worktree. Claude's original checkout was not modified.

Release `demo-0.4.0-9e5eac1edf` contains 148 files, 7,950,466 bytes before compression. Package and machine-readable verification evidence are at `C:\Users\afahm\Documents\ChatGPT\Claustrophobia\artifacts\browser-demo-release\demo-0.4.0-9e5eac1edf`. Through the signed-in Codex browser, the runtime archive was uploaded and extracted to `/home/u481134120/domains/alphasquaredgames.com/public_html/claustro`; all 147 versioned runtime files matched the manifest over cache-busted public HTTPS before the entry page was replaced.

Both `/` and `/index.html` returned HTTP 200 with SHA-256 `aa4f1ba5c7ff8e3ba6ce903e4cd39758a296bdaf4d53c1c59ed93009cf430501`. The public game displayed version `0.4.0-demo`, preserved the previous cave at startup, and loaded a fresh expedition through its normal UI. Gameplay started with the camp objective and status, then paused successfully, with no captured warning/error logs. Pointer lock was unavailable in the Codex browser and the existing middle-drag fallback was offered.

The previous live entry is saved as `previous-live-index.html` beside the package; v0.3 runtime files remain hosted. Restoring that saved entry is the rollback path. The 10-15 minute label remains a playtest target, not a measured human completion guarantee.

# Reviewed gameplay integration - browser demo v0.3

## Source and branch isolation

The integration branch is `codex/claustrophobia-integrated-demo-v0.3`, based on published v0.2 commit `4430de6`. It merges Claude's committed work through `bd55f1d` and the stable captured soda-straw changes in `src/gen.js` and `src/main.js`. The original checkout at `C:/dev/claustrophobia` was not edited. Subsequent Claude changes are outside this reviewed snapshot.

The source snapshot and hashes are held locally in `C:/Users/afahm/Documents/ChatGPT/Claustrophobia/artifacts/claude-integration-source-20260912-183212/snapshot.json`. The dirty `tools/_patch.py` snapshot was retained as evidence, not executed or applied. The committed helper arrives through the merge history.

## Reviewed changes and improvements

- Integrated camera photographs, persistent ropes and sump lines, a stone tool, wetsuit/cold mechanics, camp, chalk arrows, maze passages, torch theft, environmental hazards, rescue rope, ambient sound and surface dressing with the existing visual and control systems.
- Saved cave geometry is versioned. Unversioned v0.2 saves use the preserved legacy generator; new caves use generator 3. Both continue generating during exploration. Old caves therefore retain their layout rather than adding the new maze/camp layout underneath existing saved positions and marks.
- Rope requirements consistently round up using 12 metres per coil. A 25-metre pitch requires three coils. Controller hold/release retrieves without first descending. Underwater hauling follows the direction faced when grabbing the line; releasing and regrabbing allows reversal. Pause and disconnection clear held actions.
- Photographs use the same presentation pipeline as play. Reduced motion captures the lit photograph and restores the unflashed world in the same frame. Film usage is saved immediately, capped at eight, and blocked while paused, underwater or using the tool menu. Restored attempts retain cold exposure and film usage.
- Torch theft now records its starting position; moving the player no longer drags the carried torch's trajectory with them.
- Soda straws are placed at the actual ceiling and streamed through a bounded 1,200-instance GPU pool. They no longer disappear permanently after a global lifetime placement cap. CPU records remain retained for reconstruction.
- Decal clipping retains triangles that cross the affected region even when their first vertex lies outside it. This prevents missing patches on large triangles.
- Added authored sleeping-bag, stove and folded-wetsuit models in the established matte, worn low-poly palette. Restored ropes retain detailed anchor hardware. New impacts and water drips use the existing chips, splash and ripple effects.
- Unsupported asynchronous gamepad vibration failures are handled. The simplified charging/focus/tool wheel scheme, graphics presets, tape controls, brightness and comfort settings remain available.
- Raised the development server connection backlog to avoid transient connection failures when test fixtures reload the model/audio library rapidly. This helper is excluded from deployment.

## Validation - 2026-09-12

- Source/geometry checks: 10 JavaScript modules; 30 new-generator seed comparisons against `bd55f1d`; 30 legacy-generator comparisons against `4430de6`; procedural growth from 902 to 3,481 nodes; high ceiling, flood interpolation, floor cases, collision/slab removal, worker results and 97 audio files passed.
- `tools/integration-check.html`: 43 checks passed, including photographs across all tape modes, reduced-motion capture, film/cold persistence, authored camp assets, rope length/retrieval/hauling, streamed straws, crossing-triangle decals, theft trajectory and legacy-save migration.
- `tools/smoke.html`: 40 gameplay checks passed on the final runtime, including movement, resources, tool inputs, pause, simulated controller, autosave and reload.
- `tools/visual-check.html`: 22 checks passed on the final runtime, including all nine quality/tape combinations, 19 models, geometry preservation, effect pool bounds and regional reconstruction.
- Camp equipment was visually inspected in the rendered cave.
- Package `demo-0.3.0-1266a34b5b`: all 145 files matched their manifest SHA-256 hashes both on disk and through local HTTP. The exact packaged entry point loaded, entered play and paused successfully in the Codex browser.

## Release and acceptance

Published v0.3 to https://claustro.alphasquaredgames.com/ on 12 September 2026 (America/Edmonton), at 2026-09-13 01:19 UTC. All 144 versioned assets passed public HTTPS SHA-256 verification before replacing the entry point. Both `/` and `/index.html` then matched the packaged entry SHA-256 `986c5926dbe429a6b88772cd47444c54c8aa41c55fbf8df624688a19325c3911`. The public game loaded, started and paused in the Codex in-app browser, showing `0.3.0-demo`, with no captured warning/error logs. The previous v0.2 assets remain on the host; its entry point was saved locally as `previous-live-index.html` beside the v0.3 package for rollback. Machine-readable evidence is stored there as `public-assets-verification.json` and `public-entry-verification.json`. Runtime commit: `05cb3c8`, pushed on the integration branch.

Checks use controlled fixtures and browser-simulated controller input. They do not certify a complete escape playthrough, survival balance, physical controller feel, every browser or a universal frame-rate target. Procedural growth remains supported, but total CPU memory is not constant for unlimited exploration. Final visual/control acceptance remains a player playtest of this exact build.

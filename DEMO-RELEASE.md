# Claustrophobia browser demo release candidate

Validated locally on 12 September 2026. Public publication is pending browser file-upload access; this document does not certify a live deployment.

## Release

- Release ID: `demo-0.2.0-9ad98ebf4e`; build label: `0.2.0-demo`.
- Package: `C:\Users\afahm\Documents\ChatGPT\Claustrophobia\artifacts\browser-demo-release\demo-0.2.0-9ad98ebf4e`.
- 141 runtime files, 7,722,268 bytes before ZIP compression. Runtime dependencies, 16 GLB models, fonts and 97 sound clips are local.
- `manifest.json` contains SHA-256 for each deployed file. Every packaged file was verified on disk and through the existing local HTTP server.
- `runtime-first.zip` contains versioned runtime assets; upload and extract it before publishing the separate `index.html`. `complete-demo.zip` is the complete static site.

## Implemented

Original Blender source and low-poly models for the torch, glove, remains, supplies, rope hardware, crystals and creatures; named model parts animate at runtime. GLBs do not contain reusable animation clips.

World-only VHS presentation with Off/Subtle/Full modes, Low/Standard/High quality, brightness and camera comfort settings. UI remains separate from post-processing. Water shoreline clipping, depth coloration, world-space wave normals and continuous flood offsets; torch-cone motes; bounded debris, dust, cracks and ripple effects; regional decoration reconstruction and light reassignment. Startup waits for assets, reports loading failures and exposes local credits.

The cave still grows procedurally as exploration advances. Thirty seeds are regression samples, not a fixed catalogue or a cap on generated caves. Generation, survival rules and existing `karst.*` save keys are retained.

## Evidence

- `node --experimental-vm-modules --no-warnings tools/check.cjs`: 9 modules parse; 30 baseline seed comparisons; cave grows from 272 to 2,355 nodes; high-ceiling and flood-interpolation checks; 3 floor cases, 3,597 solid samples, slab removal, stale worker handling and 97 audio files pass.
- `tools/smoke.html`: all 40 checks pass on final runtime, including terrain, decoded audio, walking, torch charge/focus, tools, notebook, pause and delayed hazards, simulated controller mappings, autosave and reload.
- `tools/visual-check.html`: all 22 checks pass, including 16 assets, nine quality/tape combinations, unchanged cave geometry, bounded effects and regional instance reconstruction.
- Exact release entry point loads, starts and pauses in Edge without captured warning/error logs.
- Eight diagnostic scene captures and scene metadata are stored in `C:\Users\afahm\Documents\ChatGPT\Claustrophobia\artifacts\demo-visual-verification-20260912`.

## Qualification limits

Scene captures use staged viewpoints and effects; they are not an end-to-end survival, escape or encounter playthrough. The collapse view uses a sufficiently tall cave section to keep its diagnostic camera out of the ceiling. Physical controller feel and owner acceptance remain untested. Chrome and Firefox were unavailable for this session.

Intel Iris Xe / ANGLE D3D11, 1280 x 720, Standard/Subtle: warmed synchronous CPU plus GPU throughput measured 10.1 ms median and 23.4 ms p95 over 120 samples. Earlier warm-up had a 134.4 ms p95. Browser animation-frame timing was throttled, so these are not displayed frame-rate measurements or a sustained 60 FPS certification. Region creation hitches remain a performance concern.

GPU instance pools are bounded and selected unique geometries unload when distant. CPU reconstruction records remain resident; some decorative texture allocations also remain. Unlimited exploration with constant memory has not been established.

## Checkout and publication handoff

Work is isolated at `C:\dev\claustrophobia-demo`, branch `codex/demo-release`, based on `981e748`. Another process changed and committed the original `C:\dev\claustrophobia` checkout during implementation, including newly added demo assets/modules. Its work was preserved; the original checkout was not reset or overwritten. The earlier dirty-state backup is in `artifacts\pre-visual-overhaul-20260912` under the workspace.

Target: `https://claustro.alphasquaredgames.com/`. Hostinger document root was verified as `/home/u481134120/domains/alphasquaredgames.com/public_html/claustro`, containing only `default.php` at inspection. Selecting the upload archive failed with `Not allowed`; no release files were uploaded. The browser extension requires the user to enable **Allow access to file URLs** before the upload can proceed. Do not claim this release is live until public HTTPS file hashes and the public entry point have been verified.

Two accidental nested copy directories, `assets/assets` and `vendor/vendor`, were left ignored after automatic approval review blocked deletion. They are excluded by the release allowlist. Development scripts, Blender source, repository metadata and these duplicates are not in the web package.

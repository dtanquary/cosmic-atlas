# Prototype validation — 10 September 2026

The first prototype uses the full accepted DESI DR1 galaxy catalog. Local numerical, dataset-integrity, production-build, and browser checks passed. Remaining checks are identified below rather than inferred from the results.

## Data correctness

- Official FITS source: 22,371,272,640 bytes; 28,425,963 records. SHA-256: `2d95ad99361039b556c402b49e0e7c84df5f00106dc5731d44476a58b128b49b`.
- Accepted: **14,140,375 unique primary galaxy targets**. Sequential exclusions and exact filters are recorded in the manifest.
- Full catalog: 1,010 hierarchy nodes, 984,457,330 compressed asset bytes. The deterministic development dataset contains 1,000,000 galaxies.
- Direct Astropy comparison: maximum measured distance-interpolation error **1.772 × 10⁻⁷ Mpc**, below the 10⁻⁴ Mpc numerical budget. This is computational error, not observational uncertainty.
- Maximum render-coordinate rounding error: **0.0002441 Mpc per axis** in the coarsest nodes. Inspection and measurement retain float64 source-derived positions.
- Full and development dataset validators passed: every compressed checksum and header, row count, coordinate reconstruction, node bounds, ID uniqueness, child accounting, and exactly-once leaf coverage.
- Seven TypeScript tests and four Python numerical tests passed. Strict TypeScript and the production build passed. The prebuild check verifies active asset presence and declared byte counts.

## Browser checks

Actual browsers on this Mac were used, including GPU ID rendering/readback. Each passed selecting two distinct points, exact 64-bit target ID display, measurement persistence across detail changes, WebGL context loss/recovery, and rejection of corrupted data.

| Browser | Dataset tested | Result |
| --- | --- | --- |
| Chrome 152 | Full 14,140,375 catalog | Pass |
| Safari 27 | 1,000,000 development sample | Pass |
| Firefox 149 | 1,000,000 development sample | Pass |

The tests exposed and fixed a Retina picking error: the GPU pick scissor rectangle was being scaled twice. Picking now uses physical render-target coordinates once. Context recovery restores the map and dismisses the recovery overlay. A measurement of 915.7522950655592 Mpc remained identical through a detail-mode transition in Chrome.

## Measured performance

Apple M3 Max, 36 GB system memory, Chrome/ANGLE Metal, 1920 × 1080 drawing buffer. Continuous overview orbit after five seconds of warmup, sampled for twenty seconds. These are local steady-state results, not minimum-device guarantees.

| Mode | Submitted points | Mean FPS | p95 frame time | Draw calls | Managed allocations |
| --- | ---: | ---: | ---: | ---: | ---: |
| Adaptive | 1,990,709 | 120.0 | 10.3 ms | 142 | 436.9 MiB |
| Full detail | 14,140,375 | 20.8 | 59.5 ms | 883 | 436.4 MiB |

Both runs had no pending/failed chunks or memory-limit state at measurement end. Full detail reported complete coverage. Adaptive remained explicitly sampled. Managed allocations describe the application's tracked arrays, GPU attributes, metadata, and reservations; they are not total browser-process memory or all driver overhead.

The earliest observed coarse view in the full-catalog Chrome run appeared at 168 ms on localhost. That result does **not** verify the three-second target at a controlled 100 Mbps. The browser checks also observed 429 ms in Safari and 366 ms in Firefox using the smaller development dataset.

## Remaining checks and scope limits

- Manual pointer-lock flight, dense-region/fly performance, controlled-network startup, and a long cache-eviction soak still need dedicated acceptance runs. The native desktop window connection became unavailable during the final manual pass.
- Safari and Firefox compatibility passed on the development dataset; full-catalog stress benchmarks were run only in Chrome.
- Optional WebMCP registration was unavailable in all three browser environments, so those optional tools have not been exercised there. Normal controls do not depend on WebMCP.
- Mobile navigation, broad resolved-galaxy coverage, and completeness beyond the selected DESI release are outside this prototype's scope. The subsequent single-galaxy close-up is recorded below.

Raw browser evidence is retained in [validation-results.json](validation-results.json). Reproduction commands and development-only diagnostic routes are in the [README](../README.md).

## Delivery status

The full prototype is running locally at `http://127.0.0.1:5173/`. The production archive passed manifest, file-presence, and declared-size validation, but the hosting connector rejected its 1,063,492,539-byte upload against a 536,870,912-byte limit. No version was saved or deployed. The accepted full catalog remains available locally; it has not been replaced by a smaller sample. Cloud delivery needs a separate object-storage path for the catalog assets, or a hosting service that accepts the complete static bundle.

## Distance-cue update — 11 September 2026

The updated point shader and GPU picker passed an isolated actual-GPU check: a nearby point reached alpha 255 and covered more pixels, a middle-distance point reached alpha 149, and a distant point produced neither visible pixels nor pick hits. Disabling the effect restored the distant point and its pick hit. The regular full-catalog interaction checks also passed, including measurement persistence, integrity rejection, and context recovery.

On the same M3 Max/Chrome setup at 1920 × 1080, the updated adaptive overview measured **120.0 FPS, p95 9.3 ms**, with 1,990,709 submitted points and 142 draw calls. Managed allocations were 438.0 MiB. These results remain specific to the measured overview route.

Manual checks passed for clicking a galaxy, focusing to its neighborhood, switching the Navigation Help checkbox off/on, entering pointer-lock flight, and releasing it with Escape. The overview and focused views were visually reviewed. Sustained flight/eviction stress tests remain pending. All seven TypeScript tests and the strict production build passed. Catalog files and scientific computations were unchanged; data validation was not repeated.

The subsequent Observer toolbar button was manually verified in Chrome: clicking it centered the observer marker and changed the overview scale to the local neighborhood scale. The strict production build passed. Observer and selected-galaxy focus share the same camera routine, which clears residual orbit damping and sets the focus distance to 25 Mpc.

## Flight speed controls regression — 11 September 2026

Auto fly was subsequently verified in Chrome: it moved the camera through the cloud without pointer capture, kept the speed slider editable during travel, and stopped on Escape while the slider held keyboard focus. The controls returned to their paused state, preserving the revised speed. The strict production build passed.

Reproduced in Chrome: Fly captured the pointer before the slider appeared, and Escape removed the slider on unlock. The root cause was `flight-controls.hidden = !active` coupling settings visibility to pointer capture. There was no independent settings-open state.

The native-browser regression route now passes: Fly opens an enabled slider without capturing the mouse; a slider change updates the displayed speed; Start flying captures the mouse at that value; Escape leaves the slider visible and enabled; another change persists when flight restarts; Orbit closes the panel. The first configured readout was 26 million ly/sec, and the resumed flight retained the revised 41 million ly/sec. This loop used actual browser pointer lock and accessibility state. No shallow unit test was added for browser pointer capture. Production compilation passed; no debug instrumentation was added.

## NGC 4026 resolved profile — 11 September 2026

The extractor matched the exact DESI target/dense ID and SGA reference to checksum-verified leaf data, retained the original derived distance, and recovered imaging shape/profile fields from the raw source row. The existing 14,140,375-galaxy spatial data was not rebuilt. The Gaussian approximation has 0.054% maximum relative surface-profile error over 0.01–8 effective radii, before display color/exposure and tail taper.

All **12 TypeScript tests passed**, including independent projection-covariance checks at multiple RA/Dec positions and ellipticity signs, angular/comoving scale, integrated half-light radius, transition bounds, selection away from the center, and inside/far model states. Strict TypeScript compilation and the Sites production build passed, including the full catalog asset presence/size checks.

Actual Chrome 152 / WebGL2 / ANGLE Metal checks passed:

- Rendering from the observer direction, with camera zoom sufficient to resolve the image, recovered minor/major ratio **0.314739**, versus the catalog-derived **0.314602**. A face-on view recovered **0.999993**.
- The shader rendered from inside the volume and submitted no visible model when distant. These tests passed again after forced WebGL context loss and recovery.
- Clicking the resolved body two effective radii from its center selected the exact target **39633263488141603** through the normal interaction path.
- Visit galaxy and the close-up inspector were visually reviewed. Distant point clutter fades out, while the observer marker does not appear behind the camera.
- Seven seconds of continuous close-up orbit at a **2268 × 1218** drawing buffer measured **120.0 FPS, p95 9.3 ms** over the final rolling frame window. The view submitted 25,836 catalog points, with **4 total draw calls** (including the one galaxy volume), approximately **61.6 MiB** tracked allocations, and no pending/failed chunks or memory limit.

The final shared-shader regression also passed ordinary GPU point picking, two distinct exact IDs, measurement persistence through detail changes, distance-cue visibility/picking, integrity rejection, and context recovery. The source extractor rerun produced the same profile.

This is one model on the local M3 Max. It does not establish performance for many simultaneous volumes, other GPUs, or Safari/Firefox volume rendering. The measured profile is distinct from the chosen 3D depth and illustrative colors. The existing hosting upload-size blocker is unchanged.

## Spiral preview, name search, and opacity floor — 11 September 2026

Added NGC 3982 as a second measured global profile with illustrative spiral arms; retained the smooth NGC 4026 model. Its source extraction verified the exact DESI/SGA identity and existing metadata, and the 17-Gaussian smooth profile fit has 0.246% maximum relative error. The local search index contains 17,320 names and 3,181 destinations verified against existing leaf checksums and target IDs. Main catalog binaries and cosmological computations were unchanged.

All **17 TypeScript tests passed**, covering projection, scale, model transitions, deterministic bounded arm geometry, normalized catalog/Messier aliases, honest unavailable-name behavior, nearby suggestions, and unique complete visit destinations. Strict compilation and the Sites production build passed, including the full catalog presence/size checks.

Actual Chrome 152 / WebGL2 / M3 Max checks passed:

- Both smooth model components retained their observer-projected axis ratios: **0.314739 vs 0.314602** for NGC 4026 and **0.879160 vs 0.878839** for NGC 3982. Face-on, inside-volume, distant-invisibility, and context-recovery checks passed. Spiral light is explicitly excluded from the smooth-profile measurement because its distribution is illustrative.
- Body selection two effective radii from each center returned the correct, distinct exact DESI target ID.
- At a **1%** distant opacity floor the GPU produced maximum alpha **3/255**, with visible pixels and successful pick coverage. At **0%** the same distant point had neither visible pixels nor pick coverage. Near points remained fully opaque and larger.
- Seven seconds of close-up orbit at **2268 × 1218** measured **120.0 FPS, p95 9.3 ms** with either floor. With 0% the view submitted 25,836 catalog points, **5 draw calls**, and **65.3 MiB** managed allocations. With 2% it retained 1,489,586 submitted points, **87 draw calls**, and **166.7 MiB**. Neither run had pending/failed chunks or hit its memory limit at measurement. These short, local measurements are not guarantees for other GPUs or simultaneous resolved populations.
- The ordinary full-catalog regression passed GPU point picking of two distinct IDs, measurement persistence through detail changes, integrity rejection, distance-fade checks, and context recovery.

Native Chrome UI review confirmed Visit's nearby suggestions, autocomplete for `ngc 03982`, Enter-to-visit for both NGC 3982 and `Messier 109` (NGC 3992), correct selected-name/exact-ID display, and an explicit unavailable explanation for Andromeda. The spiral close-up and its measured-versus-illustrative description were visually reviewed. Settings accepted a **2%** floor, disabled the slider when distance cues were off, and retained the floor after reload. A positive floor keeps more catalog geometry active; the normal adaptive and memory budgets remain in force.

Raw reports are included in [validation-results.json](validation-results.json). Name coverage is deliberately partial; unavailable familiar names do not receive fabricated positions. The previously documented hosting upload-size blocker remains unchanged.

## All-galaxy models — 11 September 2026

The model extractor emitted profiles aligned with all 1,010 existing spatial chunks. The independent model validator checked every compressed SHA-256, binary header/size, unique full leaf coverage, model counts, and exact agreement with the two original measured profiles. **14,140,375 model records** passed: **12,097,577 usable measured shapes**, **2,042,798 assumed shapes**, and **3,128 recorded visual classifications**. Positions, distances, and the original point/metadata binaries were unchanged. The sidecars total **142,725,259 compressed bytes**.

All **22 TypeScript tests passed**. New checks distinguish imaging fits from visual classification, preserve projected covariance for all five 3D families including very flattened shapes, identify missing/PSF shapes as assumptions, reject wrong profile formats, and bound deterministic irregular geometry. The Python checks also guard the meaningful `Sb` versus `SB` distinction. Strict TypeScript and production compilation passed.

Actual Chrome 152 / M3 Max GPU checks passed for NGC 3982 (spiral), NGC 5107 (barred), NGC 4026 (lenticular), NGC 4121 (elliptical), and NGC 3738 (irregular). Every family selected the correct target from its visible body, recovered the measured projected ellipse in the smooth component, rendered from inside, and disappeared at unresolved distances. The unknown-shape example retained its exact DESI identity and disclosed an assumed **0.005 Mpc** radius.

Removing NGC 3738's model, clearing selection, and approaching its location loaded it automatically without selecting it. A batch of **24 real catalog model requests saturated the pool at exactly 12 resident models**, exercising eviction. Distance fading at 0% and 1%, ordinary GPU point selection, measurement persistence, integrity rejection, and WebGL context recovery also passed.

With the saved **2%** opacity floor, a seven-second irregular-galaxy orbit measured approximately **110 FPS, p95 9.3 ms** at a **2268 × 1218** drawing buffer, with two visible models, 83 draw calls, approximately 216.6 MiB tracked allocations, and no failed chunks or memory-limit state. The twenty-second **1920 × 1080** adaptive overview benchmark measured **120.0 FPS, p95 9.3 ms**, with 1,990,709 submitted points and 142 draw calls. Its 556.2 MiB tracked allocations included the complete point catalog retained from the preceding full-detail interaction test. These local short runs do not establish performance on other devices or a long flight through dense clusters.

The barred-spiral, irregular and elliptical close-ups, named model suggestions, and measured-versus-assumed inspector text were visually reviewed in native Chrome. Catalog-wide profiles, name search and original preview URLs now resolve from the selected catalog origin, preparing the app for a separate public data host. Public GitHub and web delivery remain the next release step; no public deployment is claimed by this validation.

## Clear navigation and UI review — 11 September 2026

The initial real-GPU observer approach reproduced a full-screen foreground washout with just NGC 3982: 48.7% bright coverage at six half-light radii, 96.5% at two radii, and 100% at 0.25 radii and the center. Off-center clicks hit the volume. Automatic obstruction fading now records **zero bright pixels and no model body hit** at each of those close approach distances. Deliberate focus retains full model visibility; Observer and Overview remove that exemption while preserving inspection. Points-only and focused-only choices pass, and switching to points keeps the focused neighborhood's distance-fading horizon stable.

The new `?uxtest` route checks the real camera, renderer and UI. Nine control checks pass: initial Focus reachability, Close after scrolling, Retry hit target, delayed Visit cancellation, reusable search, immediate close/reopen cancellation, editable flight speed, auto fly with a free pointer, and Escape preserving the speed menu. Native Chrome review verified autocomplete/Enter-to-visit, restored trigger focus, Settings choices and persistence, and keyboard access to scrolling inspector content at 150% browser zoom (about 1008×541 CSS pixels). Browser zoom and Automatic display were restored afterward.

The combined `?uxtest&modeltest&selftest&run=ux-release-check` also passed all five model families, measured sky projection, inside-volume views, body picking, the assumed-shape example, automatic nearby streaming and the 12-model limit, point picking, distance fading, measurement persistence, integrity rejection and context recovery. **24 TypeScript tests** and the final Sites production build pass. The build verifies the full 14,140,375-record catalog and model coverage; binary source data was unchanged.

The final seven-second close-up orbit on Chrome 152 / M3 Max at **2268×1218** measured **109.5 FPS, p95 8.4 ms**, with three visible models, 90 draw calls, 236.1 MiB tracked allocations and no pending/failed chunks or memory-limit state. This is a short local run, not a sustained dense-cluster or cross-device guarantee. See [the UI review](ux-review.md) and [baseline/final reports](validation-results.json). The previously recorded public-hosting data-size constraint is unchanged; this is local validation.

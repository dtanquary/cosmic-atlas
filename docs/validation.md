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

## Milky Way reference — 11 September 2026

All **27 TypeScript tests** pass, including independent checks of the Galactic-center sky direction, observer distance, solar height in the adopted midplane, handedness of the transformed basis, arrival framing, reference allocation bound and visibility policies. The production build passes and verifies the unchanged full accepted catalog and all profile assets.

The actual Chrome 152 / M3 Max `?uxtest&hometest&modeltest&selftest&run=milky-way-integration` run passed. Observer arrives at 60 kpc from the origin with the Sun at screen center and the Galactic center offset. Reference-body picking opens the home inspector without replacing the catalog identity or measurement. GPU readback finds visible light outside, near the Sun and from inside the Galaxy; points-only and nonfocused suppression produce no light. The Sun marker stays within the clipping range at the 10 pc minimum orbit distance. Every check passed again after forced graphics loss/recovery.

The same run passed all five catalog model families, automatic nearby loading, the 12-model catalog pool, ordinary GPU point picking, distance cues, measurement persistence, integrity rejection, the observer obstruction regression and all nine UI checks. The home model is separately bounded at **1,792,000 tracked geometry bytes**. Its seven-second orbit at **2268×1218** measured **109.1 FPS, p95 9.4 ms**, 19 total draw calls, one visible home model, 124.9 MiB tracked allocations, and no pending/failed chunks or memory-limit state. These are short local measurements, not hardware-wide performance guarantees.

The Observer arrival and reference inspector were visually reviewed in native Chrome. Searching `Milky Way` and pressing Enter opened the reference; **Galaxy view** centered the Galaxy with the Sun visibly offset, and **Our position** restored the Sun-centered view. Source parameters, frame transformation and scientific/visual assumptions are recorded in [milky-way.md](milky-way.md).

## README clean-checkout verification — 11 September 2026

The documented quick start was executed in an isolated checkout without copying the existing catalog binaries: `npm ci`, `uv sync --frozen`, `npm run data:bootstrap`, and `npm run dev`. Bootstrap downloaded 24 byte ranges from the official DESI source and produced **47,589 accepted observations** in one node, about **2.9 MiB compressed**. The main workspace's full catalog was untouched.

All **27 TypeScript tests**, the **four Python unit checks**, independent validation of the generated bootstrap dataset, and `npm run build` passed. The independent validator confirmed all 47,589 records with maximum reconstructed render-position error **0.00024372 Mpc**. HTTP checks verified that the active manifest and every declared point/metadata asset were served with the expected byte lengths.

The fresh setup's actual Chrome 152 / M3 Max `?hometest&selftest&run=readme-bootstrap` run passed Milky Way arrival, body picking, rendering modes, near-Sun clipping and graphics recovery; point picking returned two distinct exact IDs and their **589.007162 Mpc** separation. Measurement persistence, distance cues, integrity rejection and ordinary graphics recovery also passed. The combined runner resets to the survey overview before point checks so a preceding home test does not leave distant points intentionally faded out. Raw results are retained in [validation-results.json](validation-results.json).

## Galactic-core focus and optional point enlargement — 11 September 2026

The baseline `home-framing-before` reproduced the user's offset: Observer and Milky Way search zoomed toward the Sun, growing the core's offset from **104.9 to 290.2 CSS pixels** between camera distances of 60 and 19.8 kpc. The preexisting Galaxy view stayed centered through the same wheel events. Physical placement/size tests passed; the problem was the destination's camera target.

The combined `?uxtest&hometest&modeltest&selftest&run=home-core-point-size` run passes. The renamed Milky Way toolbar action, Galactic core inspector action and Milky Way autocomplete/Enter path all keep the core within **0.001 CSS pixels** of center through the same zoom. Sun / Observer still centers the origin. Both focus-state indicators and the separate core/Sun annotations pass their real-UI checks. Full model rendering, body/point picking, obstruction suppression, delayed-search cancellation, measurements, integrity rejection and graphics recovery remain passing.

The new independent size setting is off by default. With an 8-pixel diagnostic marker, GPU readback measures **52 covered pixels off / 124 on**, both with fully opaque near centers. The ID pass measures **52 off / 140 on**; distant floor visibility/picking still passes. Size changes also work with distance fading disabled. The real settings handler changes the renderer and saves both values. Native Chrome review verified the settings layout and reload persistence with enlargement both on and off; enlargement was left off for testing. The existing 2% opacity floor and Automatic model display were preserved.

All **27 TypeScript tests** and the final Sites production build pass, including the full accepted catalog/model asset checks. The seven-second home orbit on Chrome 152 / M3 Max at **2268×1218** measured **108.3 FPS, p95 9.3 ms**, 20 draw calls and 124.9 MiB tracked allocations, with no pending/failed chunks or memory-limit state. These are short local measurements. No catalog positions, reference geometry, model dimensions or source data changed. Baseline and final browser reports are in [validation-results.json](validation-results.json).

## Search availability clarity — 11 September 2026

The `search-availability-before` real-DOM regression reproduced a disabled Andromeda row being counted and highlighted as a visit suggestion; selecting it replaced the count with a missing-observation message. Independent alias tests and the source name index confirmed correct recognition of NGC 224 without a verified DESI destination.

`?uxtest&hometest&run=search-availability-fixed` passes the new availability regression. Andromeda has one recognized name, a readable location-unavailable explanation, zero visit options and no active keyboard option. Clicking or pressing Enter preserves both message and camera; Browse available galaxies restores usable suggestions and input focus. Mixed queries exclude unavailable names from keyboard selection, and an unknown query clears stale content and uses a distinct empty-state message. Existing cancellation, reopen, flight, obstruction, Milky Way search/zoom, reference rendering and context recovery checks all pass.

Native Chrome review confirmed the Andromeda panel, aliases, recovery action and the mixed `NGC 398` result count. All **27 TypeScript tests** and the final Sites production build pass, including the unchanged 14,140,375-record catalog and model asset verification. No new destinations or astronomical measurements were added. Baseline and final reports are retained in [validation-results.json](validation-results.json).

## Embedded local positions — 11 September 2026

The baseline `local-positions-before` and fixed `local-distance-guard` reports preserve the actual-GPU regression for the 1,107 metadata positions inside the Milky Way model's outer sphere. Across four orbit angles, protected visual and ID coverage changes from nonzero to **zero**. Disabling fading and setting a 100% floor do not bypass the safeguard. Raw mode shows amber points; a control beyond the guard remains visible and pickable.

The real-chunk/settings test exercises node 701 with a nonzero chunk origin and target `39628351635193964`. Raw ID readback equals the expected code **46006272**. Hidden visits are rejected; raw visits retain identity and never create physical models. Settings persistence, uncertainty notices, annotation suppression and preserved selected records/measurement endpoints/catalog count all pass. The full-data audit probes report unavailable for subsets rather than failing the independent reference tests.

The combined `?uxtest&hometest&modeltest&selftest&run=local-distance-guard` passes the new local-position checks and all existing UI/search, core/Sun navigation, Milky Way rendering/recovery, five catalog families, automatic streaming, 12-model bound, point settings, exact-ID picking, measurement persistence, integrity rejection and context recovery. **27 TypeScript tests** and the Sites production build pass; asset checks confirm all **14,140,375 observations** and profile coverage. No prepared catalog asset changed.

Native Chrome review confirmed the raw amber cloud, its removal, the new setting and its persistence after reload. The protected core view was restored afterward with the user's 2% opacity floor and enlargement disabled. In this combined run at 2268×1218 on Chrome 152 / M3 Max, the short home orbit recorded **101.4 FPS, p95 25 ms**, and the model orbit **107.5 FPS, p95 9.2 ms**. The home p95 exceeds the 20 ms target; these short combined acceptance samples are not a sustained performance benchmark or a cross-device guarantee. Both snapshots had no failed/pending chunks or memory-limit state.

The policy hides uncertain local positions without altering their original numerical distances. The 1 Mpc radius is a display safeguard, not a scientific certainty boundary. [Audit and source context](local-distance-audit.md); [raw reports](validation-results.json).

## Independent nearby galaxies — 11 September 2026

The six nearby entries pass **30 TypeScript tests**, including sourced-distance retention, separate IDs/null redshifts, coordinate conversion, independent-distance guard bypass, projected ellipse preservation, bounded geometry and alias deduplication. Regenerating the reference from its pinned source excerpt produces byte-for-byte identical output. The final Sites production build passes and verifies the unchanged **14,140,375 accepted observations** and all DESI model assets.

The actual Chrome 152 / M3 Max full-data `?nearbytest&uxtest&hometest&modeltest&selftest&run=nearby-integration` suite passes. All six names resolve to usable destinations; their visits center the correct model, show independent-distance provenance without redshift fields, preserve projected shapes, and support body and GPU point selection under their separate identities. The same checks pass after forced graphics loss/recovery. M31–M33 separation is **0.206452254649 Mpc** and remains unchanged, with visible endpoints, when the uncertain-local-position setting changes. Original DESI counts stay unchanged. The nearby models add **2,688,000 tracked geometry bytes**.

The full run also passes the prior availability/late-search cancellation, flight controls, foreground obstruction, Galactic-core wheel navigation, Milky Way reference rendering, embedded-redshift-position safeguard, five DESI model families, 12-model DESI bound, point settings, ordinary selection/measurement, integrity rejection and context recovery checks. At **2268×1218**, the short home orbit recorded **99.7 FPS, p95 9.4 ms**, with 25 draw calls and 157.7 MiB tracked allocations; the model orbit recorded **104.7 FPS, p95 8.7 ms**, with 89 calls and 276.5 MiB. Both had no failed/pending chunks or memory-limit state. These are short local acceptance samples, not a dedicated nearby fly-through benchmark or a cross-device guarantee.

The million-object `?dataset=development&nearbytest&hometest&selftest&run=nearby-subset` suite also passes all six local destinations, model/point picking, measurement preservation, source UI, home navigation, point settings and graphics recovery. DESI-specific embedded-position probes correctly report unavailable on subsets. This exercises the subset branch that retains the nearby layer without loading the full DESI name index; a fresh bootstrap setup was not repeated for this feature.

Native Chrome visual review confirmed Andromeda's single available search result and Enter-to-visit, centered spiral model, source links and quoted distance error. LMC and SMC show the assumed radius labels; LMC shows unknown orientation while SMC retains the adopted 45° sky angle. The full atlas was left on Andromeda with Automatic models, uncertainty protection enabled, a 2% distant-opacity floor and point enlargement off. Final subsequent source edits only clarified About/Help copy and the search placeholder; the native review includes those edits. [Raw browser reports](validation-results.json); [measurements and assumptions](nearby-galaxies.md).

## All spirals and continuous model residency — 11 September 2026

The actual-GPU baseline replayed two orbits around Andromeda and recorded **26 abrupt central-viewport transitions**, with a peak blend jump of **1.0**. Targeted removal traces confirmed two causes: visible models lost candidate membership as the point frontier changed, and near-equal pool rankings caused immediate replacements. Extending the distance threshold alone would not fix these removals.

`?continuitytest&uxtest&nearbytest&hometest&modeltest&selftest&run=spiral-final` passes on Chrome 152 / Apple M3 Max at **2268×1218**. The same replay now has **zero abrupt transitions**; peak blend change per sampled step is **0.1541**, all 136 removals occur at zero blend, and residency stays at **12 DESI models**. Pending fades finish after the camera stops. The threshold for a reported abrupt transition is 0.35 between approximately 40 ms samples with the center inside the central 85% of the viewport. These checks isolate interior model popping; ordinary field-of-view exits and subthreshold fades are expected.

The real appearance setting switches both catalog and nearby models, saves the preference, preserves source objects/identities/positions and catalog totals, retains body picking, and shows the override disclosure. The default all-spiral nearby geometry is **4,032,000 tracked bytes**. All existing foreground-obstruction, search lifecycle, flight controls, Milky Way core/wheel focus, uncertain-local protection, named/source families, 12-model saturation, projected-profile checks, body/point selection, measurement persistence, integrity rejection and graphics recovery pass. Catalog source profiles are still independently tested even when the rendered appearance is overridden.

The development-subset `?dataset=development&continuitytest&nearbytest&selftest&run=spiral-subset` also passes appearance switching, six nearby destinations, source UI, model/point picking, measurements, point settings and recovery. Its DESI orbit probe reports unavailable as intended. The final idle-loop adjustment affects streamed DESI residency; it was included in the subsequent full acceptance run.

All **31 TypeScript tests** and the production build pass; asset checks confirm the unchanged **14,140,375 accepted observations** and complete DESI profiles. New tests verify spiral geometry across all source families without rewriting data or projected covariance. The standalone illustrative disk profile is reproducibly generated from an exponential law, with no catalog mutation. Native Chrome review checked the appearance menu, both options, persistence after reload, the inspector disclosure and Andromeda framing. Automatic display and All spirals were left enabled; existing opacity and local-uncertainty preferences were preserved.

The final short model orbit recorded **97.3 FPS, p95 9.4 ms**, 87 draw calls and 396.5 MiB tracked allocations. The home orbit recorded **120.0 FPS, p95 9.2 ms**, 24 calls and 330.9 MiB. Both had no pending/failed chunks or memory-limit state. These are short local acceptance samples with warm streamed data, not sustained or cross-device guarantees. [Baseline, targeted trace and final reports](validation-results.json).

## Subtle galaxy color variation — 11 September 2026

All **33 TypeScript tests** and the final production build pass, including unchanged coverage of **14,140,375 accepted observations** and their model assets. Palette tests cover deterministic identity-based colors, restrained channel ranges, controlled luminance, and unchanged arm/clump positions and sizes.

The actual-GPU `?colortest&continuitytest&uxtest&nearbytest&hometest&modeltest&selftest&run=galaxy-colors` completes with all 79 reported pass/recovery/integrity assertions true. The isolated color comparison renders identical spiral geometry with two nearby identities: aggregate red/blue ratios are **0.689** and **1.134**, while integrated luminance differs by only **0.0151%**. Recreating the same identity produces an identical pixel checksum, including after graphics-context recovery. Both variants retain **2 draw calls and 672,000 geometry bytes**.

The two Andromeda orbits retain **zero abrupt central-viewport jumps**, peak sample blend change **0.139**, **130 removals all at zero blend**, and the **12-model resident cap**. Fades finish after movement stops. Existing nearby search/framing/picking, source preservation, Milky Way core/Sun navigation, local-position safeguards, profile projection, point settings and measurement checks pass. The separate million-record development-subset `?colortest&nearbytest&selftest&run=galaxy-colors-subset` completes with all 54 reported assertions true.

Short local orbit samples on Chrome 152 / M3 Max at **2268×1218** measure **98.6 FPS, p95 9.3 ms** for the model route and **120.0 FPS, p95 9.3 ms** for the Milky Way route. Both have no pending/failed chunks or memory-limit state. These are local acceptance measurements, not cross-device performance guarantees. Raw reports are retained in [validation-results.json](validation-results.json).

Native Chrome review confirmed the blue-white Andromeda palette and the soft ivory Small Magellanic Cloud palette, both with restrained warm centers and preserved spiral structure. The inspector explains that the varying colors are illustrative. The full atlas was returned to Andromeda afterward.

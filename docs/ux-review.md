# Navigation and UI review — 2026-09-11

Status: verified.

## Foreground model obstruction

Reproduction: `?uxtest&run=observer-before` puts the actual camera on the line through NGC 3982 toward the observer and samples eight approach distances. GPU readback measures the fraction of pixels brighter than 24/255, independently of background points. A body-hit probe checks an off-center map click.

Before: at 6 half-light radii the model brightens 48.7% of the viewport; at 2 radii 96.5%; at 0.25 radii and the center 100%. Its blend stays 1 and the off-center click hits the galaxy. Verified on Chrome 152 / Apple M3 Max, 2268×1218 drawing buffer. The full view visibly washes out. A single measured galaxy reproduces the problem, so overlapping/fallback models are not necessary.

Ranked hypotheses: (1) angular-size-only model blending has no obstruction limit; (2) no explicit distinction between intended galaxy focus and incidental transit; (3) additive overlap amplifies the effect.

Acceptance: automatic incidental models smoothly return to points before filling the view; observer/overview navigation clears any previous model-focus exemption; explicitly focused galaxy profiles and body picking retain their close-up fidelity. A points-only setting offers direct control without changing scientific positions, sizes, or the accepted catalog.

## UI review

Check primary inspector actions at short viewport heights, search cancellation during asynchronous visits, dialog focus restoration, icon-only accessible labels, and error retry hit targets. Record reproduced issues and final evidence here.

First fix evidence: the identical GPU pass now records zero bright pixels and no body interception at 6, 2, 0.25 and 0 radii. Explicit focus, points-only override, focused-only mode, and observer/overview focus clearing all pass. 24 TypeScript tests pass; the original regression was observed failing before implementation.

## Verified UI fixes

- The fixed inspector header keeps Close, Focus and Copy ID reachable while the detail body scrolls. The original layout hid Focus initially and Close after scrolling. Hit-target checks now pass at normal size and native Chrome 150% zoom (about 1008×541 CSS pixels).
- Search visits check a current-intent guard before and after metadata/model awaits. Closing the dialog cancels the intent; reopening invalidates the previous request before the browser's queued close event. Both delayed-dismissal and immediate-reopen tests preserve the camera and selection and leave the new input usable. Native autocomplete and Enter-to-visit restore focus to the Visit button.
- Error Retry buttons explicitly receive pointer events; the inherited loading overlay previously prevented them from being clicked.
- Dialog titles/close actions stay available while scrolling. Dialogs and icon-only toolbar controls now have explicit accessible names. Focus closes the flight menu consistently with the other navigation actions.
- The existing editable flight-speed menu, free-pointer auto fly and Escape-to-pause behavior pass their real-control regression checks.

Points-only initially exposed another display dependency: hiding the focused model also removed its local distance-fading horizon, brightening the background. The new regression failed before the fix; the focused galaxy's angular scale now preserves that horizon independently of model display choice.

## Final evidence

`?uxtest&modeltest&selftest&run=ux-release-check` passes the observer pass, all nine UI checks, all five model families, assumed-shape example, automatic streaming, bounded 12-model pool, body and point picking, distance cues, measurement persistence, integrity rejection and context recovery. All 24 TypeScript tests and the production build pass. The full accepted catalog remains 14,140,375 records.

A seven-second close-up orbit on Chrome 152 / M3 Max at 2268×1218 measured 109.5 FPS, p95 8.4 ms, three visible models, 90 draw calls, 236.1 MiB tracked allocations, and no pending/failed chunks or memory-limit state. This short local measurement does not establish sustained dense-cluster performance on other devices. Raw baseline and final GPU reports are in `docs/validation-results.json`.

Prevention: navigation intent is now explicit and independent of inspection and display mode. The regression runner exercises the production camera/model/picking and UI paths so later visual changes can be checked against the same obstruction and cancellation cases.

## Milky Way zoom framing

Status: verified.

The actual home controls and wheel handler reproduce the reported drift in `?hometest&run=home-framing-before`. Observer and Milky Way search both target the Sun, 8.122 kpc from the Galactic center. Zooming from 60 to 19.8 kpc grows the center's screen offset from **104.9 to 290.2 CSS pixels**. The Galaxy view button stays centered through the identical wheel sequence (less than 0.001 px error). The new navigation regression fails while the existing geometry/GPU reference checks pass.

Ranked hypotheses: (1) galaxy visits reuse Solar System focus; (2) incorrect physical scale or reference transform; (3) residual orbit damping. The identical wheel comparison isolates the focus target, while the independent frame/dimension tests pass. Both Sun-directed paths produce the same drift, and the center-directed path stays stable with the same camera controls. The intended fix is to center galaxy visits without moving or resizing the physical reference; retain a separate, explicit Solar System view.

The toolbar is now labeled Milky Way, and both it and name search call the core-focused visit path. Sun / Observer is an explicit alternative in the inspector. Active focus buttons, a short zoom/orbit hint and separate core/Sun labels clarify the chosen target. The same wheel regression now holds the core within **0.001 CSS pixels** of center through every tested zoom step on all three galaxy-entry paths. The Sun-directed alternative remains centered on the origin. Existing measured placement and size tests remain unchanged and pass.

The user also requested control over nearby enlargement. Settings now separates **Enlarge nearby points** from **Distance fading**. Enlargement is off by default and persists locally. Actual GPU readback measures 52 covered pixels with it off versus 124 with it on at the diagnostic point size, with identical near opacity; the ID pass follows the size choice. The size boost also works with fading disabled. Galaxy volumes are never resized by this setting.

`?uxtest&hometest&modeltest&selftest&run=home-core-point-size` passes the new core/Sun controls, search and wheel checks, the setting-to-shader/persistence checks, all previous navigation/model/picking cases and graphics recovery. All 27 TypeScript tests and the production build pass. The cause was reuse of the Sun-focused navigation path for a galaxy destination; the regression now checks the caller and zoom behavior instead of only validating the reference's physical coordinates.

## Recognized names without visit destinations

Status: verified.

`?uxtest&run=search-availability-before` reproduces Andromeda as “1 suggestion,” with one disabled but active listbox option. Clicking or pressing Enter changes the count message into a missing-observation message. Mixed queries also put unavailable names into the interactive suggestion list. The fresh no-match query clears the old row correctly, so stale results are not required to reproduce this confusion.

Ranked hypotheses: (1) presentation and keyboard selection conflate a recognized name with a verified visit destination; (2) alias resolution is wrong; (3) stale result state. The checked-in index and alias tests correctly resolve Andromeda to NGC 224, with no verified DESI visit reference. The new real-DOM regression fails on the misleading selectable result and status change. The fix must disclose recognized unavailable names clearly, keep them out of visit selection, and offer a route back to available destinations without inventing coordinates.

The fixed `?uxtest&hometest&run=search-availability-fixed` reports **1 name match · no visit location**, zero visit options and no active keyboard option for Andromeda. Its common name and NGC 224 / M 31 aliases appear in a readable explanation panel. Click, ArrowDown and Enter preserve the explanation and camera. Browse available galaxies restores the nearby list and input focus. Mixed queries contain only available destinations in the interactive list; unknown queries clear both lists and show the distinct no-name-match message. All new checks, the existing nine UI checks, observer obstruction and home navigation/rendering/recovery checks pass. All 27 TypeScript tests and the final production build pass.

Native Chrome review confirmed the Andromeda explanation and recovery button, then a mixed `NGC 398` query showing eight name matches with one available destination (NGC 3982). Catalog/index data was unchanged. Prevention: recognized matches and visit options are now separate collections; result counts, keyboard state and explanatory content are checked together through the actual dialog.

## Unreliable local positions inside the Milky Way

Status: verified display mitigation; independent local distances remain unavailable.

The [float64 catalog audit](local-distance-audit.md) already confirmed that near-zero-redshift distance inference places records within the home model. Additional orbit screenshots rule out a purely projected-background explanation. Physical model dimensions and coordinates remain consistent with their checked-in reference; display enlargement is not the cause of these embedded points.

The new `?hometest&run=local-positions-before` GPU probe loads the checksum-verified metadata of all intersecting leaves, reconstructs the 1,107 actual records within the Milky Way bounding sphere, and renders their positions from four orbit angles using the production point/picking shaders. The baseline draws 8,723–10,934 colored pixels and nonzero pick coverage in every view, even when requesting protection. A control point outside the proposed local guard remains visible. This failing regression isolates actual local positions rather than distant projection or illustrative arm particles.

Implemented display safeguard: hide redshift-only positions within 1 Mpc of the observer by default, allow them to be shown as explicitly uncertain amber points, and suppress physical galaxy models for those records. Keep the original records, counts and coordinates intact. The guard radius is a conservative UI policy, not a physical boundary of distance reliability; independent local distances remain a separate data-integration task.

`?uxtest&hometest&modeltest&selftest&run=local-distance-guard` now passes the same four-angle regression: **zero visible pixels and zero ID hits** for the embedded positions when protected, including no fading and a 100% opacity floor. Raw display produces 8,729–10,950 amber pixels, with nonzero pick coverage. The outer control remains visible and pickable. The actual loaded chunk callback (origin approximately `[75.2744, -17.4456, -14.1801]` Mpc) correctly distinguishes world position from chunk-relative coordinates and returns the exact expected GPU ID in raw mode.

The real Settings path persists both choices, rejects hidden visits, allows raw record inspection without a model, updates warnings, and suppresses selection/measurement annotations while retaining original IDs, values and the catalog total. All preceding UI, search, home, model, point-sizing, measurement, integrity and recovery checks pass. All 27 TypeScript tests and the final production build pass.

Native Chrome comparison confirmed the dense local cloud returns as amber points when enabled and clears when disabled, with unchanged Milky Way scale/framing. Reload retains the raw preference. The final browser was returned to the Galactic core with uncertain locals hidden, Automatic models, enlargement off and the existing 2% distant-opacity floor.

Prevention: the renderer now treats local redshift-only positions as an explicitly uncertain data class. The guard is shared by display, ID picking and model eligibility, while original records remain available for later cross-matching. This fixes the misleading presentation; it does not supply corrected distances or establish the records' actual identities.

## Nearby destinations — 11 September 2026

Andromeda now has a sourced independent-distance destination rather than an unavailable DESI name. Search merges its aliases into one selectable result, and the empty list prioritizes the Milky Way and six nearby neighbors. The former unavailable-Andromeda regression now uses the still-unavailable Sombrero Galaxy, preserving checks that explanatory matches cannot enter keyboard selection or move the camera. The async DESI-visit regressions still explicitly choose NGC 3982, so local synchronous visits do not accidentally weaken cancellation coverage.

Full-data UI/home/model/point checks and separate full/subset nearby suites pass. Native Chrome review verified Andromeda search/Enter, model framing, distance citation/error, and the Clouds' assumed-size/unknown-orientation disclosures. The fixed inspector actions remain reachable above the scrolling details. Separate HUD counts and source-specific separation labels keep nearby entries distinguishable from the original survey. See [validation](validation.md) and [nearby provenance](nearby-galaxies.md).

## Spiral appearance and Andromeda background continuity — verified

The user requested a temporary all-spiral visual treatment and a longer model draw distance. The two-orbit `?continuitytest&run=spiral-continuity-before` replay reproduces the reported background popping through the actual camera, renderer and model planner: **26 on-screen appearance/disappearance jumps**, including fully visible models evicted and reloaded one sample later. The peak blend jump is **1.0**; the resident pool peaks at 11. The pattern repeats on the second orbit. Baseline results are retained in validation-results.json.

Ranked causes to test: streamed frontier changes drop still-visible model candidates; tight pool rankings churn at small view changes; the projected-size cutoff reveals models too late. The regression samples real resident identities and visibility inside the central 85% of the viewport to distinguish interior popping from ordinary offscreen culling.

The targeted trace confirmed visible removals both when the source point node left the frontier and while it remained drawn. Resident models now retain their exact-center candidate independently of the frontier; a 30% resident score margin reduces ranking churn, and automatic models retain their slot through a 0.6-second fade before disposal. New automatic models fade in. The final two-orbit replay records **zero abrupt central-viewport jumps**, **zero removals with nonzero blend**, and a maximum of **12 resident DESI models**. Fades also finish after camera motion stops. Separating model residency from point-frontier membership prevents recurrence of the original coupling.

All spirals is now the saved/default appearance, with Catalog types available in Settings. The common disk/arms override leaves original identities, catalog classifications, positions, radii and projected ellipses intact. The inspector explicitly distinguishes the appearance from source properties. Models resolve across 0.6–5 CSS pixels instead of 1–8, approximately 60% farther out, with earlier candidate loading.

Native Chrome review confirmed the Settings layout, both appearance choices, reload persistence and Andromeda framing. The faint cloud-like background texture is also present in Points only; it is submitted survey-point density, not one of the replaced glow models. Automatic close-ups and All spirals were restored with the 2% opacity floor, enlargement off and uncertain-local safeguard on. Full and subset acceptance results are recorded in [validation](validation.md).

## Subtle color variation — verified

Galaxy models now vary gently between blue-white and soft ivory, with warmer centers and sparse muted pink accents. A palette belongs to the exact galaxy identity, so streaming or switching appearance does not reshuffle its tint. The inspector and README disclose that the palettes are illustrative rather than measured photometry.

Native Chrome comparison of Andromeda and the Small Magellanic Cloud confirmed visible but restrained cool/warm differences with the existing spiral shapes. GPU comparison of identical geometry isolates the tint from orientation and size: integrated brightness differs by just 0.0151%, and reconstruction/context recovery reproduce the same colors. Full and subset rendering, navigation and nearby checks pass; the Andromeda continuity replay still records zero abrupt transitions. No new controls were needed. The browser was returned to Andromeda for testing.

## Restrained disk variants — verified

The default appearance now mixes the existing classic spiral with a finer multi-arm disk and a ringed spiral disk. The ring is a partial accent that retains visible spiral arms. Both use the same size/exposure/light-sample template; identity-based assignment persists across loading and dataset row changes. The inspector names the illustration separately from source morphology, and Settings describes the three related styles.

Side-by-side native Chrome review and three-angle GPU readback confirm distinct structure with closely matched total brightness and no added near-white area. The concentrated-bar trial was excluded after failing the highlight check. The existing two-orbit continuity test still reports zero abrupt transitions. The development preview now ignores pointer events, and all nine UI reachability/search/flight checks pass with it visible. See [validation](validation.md) for measurements and raw reports.
# Fixed arrow reported during release review — 2026-09-11

The reported stationary arrow was visible at the same screen coordinates in the native atlas preview and Chrome's unrelated New Tab page. Independent page screenshots contain no arrow. This isolates it to an overlay outside the application; the app only renders its explicit flight crosshair and standard browser cursor styles. No atlas UI change or application regression test is appropriate for an external desktop/browser overlay. The native blank-tab comparison and direct page captures are the diagnostic evidence.

# Milky Way appearance review — 11 September 2026

Verified the revised continuous starlight/dust volume in native Chrome and direct production page captures. The core remains centered through real wheel zoom, the Sun marker stays at its independently adopted position, and the inspector links to the Andromeda appearance reference while disclosing reconstructed dust/arms/colors. Face-on, inclined, edge-on, reverse and inside views pass GPU checks with restrained highlights and one fixed model allocation. The full UI/continuity suites pass. Their synthetic Window keyboard event exposed an unsafe Element cast in the shortcut handler; an actual Element guard prevents the exception without changing typing or flight controls.

## CMB shell — 12 September 2026

State: verified on full-data actual-GPU navigation, production controls and final compact layouts.

The visibility toggle preserves the existing camera, selected record and measurements; the dedicated cosmic-scale action cancels earlier focus and frames the sphere about the observer. The comparison panel yields to galaxy inspectors, and Settings provides the same framing action while an inspector is open. Full-data `?uxtest&hometest&continuitytest&selftest` passes with the shell enabled, including search cancellation/reopening, foreground obstruction, display fading, inspector reachability, core/Sun focus, wheel behavior and point/body selection. Production checks pass persistence in both states and units. Visual review prompted a compact short-height toolbar and narrow-width comparison card, plus explicit stacking above observer labels.

Final production screenshots were visually reviewed at 1600×1000, 1000×600 and 390×844. The compact card preserves access to all six toolbar buttons; the frame action and all toolbar hit tests pass at both smaller sizes. The card no longer draws observer labels over its text, and the short-window rail clears the catalog count. Production controls report no JavaScript/shader errors. [GPU and production reports](validation-results.json).

## Lookback time — 12 September 2026

State: verified on full-data and development-subset GPU runs and direct page captures.

The footer scale bar gains one muted line with the lookback time at focus depth; the inspector gains a Light travel time row (distance ÷ c for nearby galaxies, Planck18 lookback for DESI records, hidden for uncertain local positions). Settings adds an off-by-default saved Lookback time rings checkbox with no new toolbar button. Initial captures showed inner ring labels over the bright point cloud and, at 390×844, labels colliding with the brand header and the icon rail. Labels now carry a translucent pill, anchor only inside the central 80% of the viewport height (95% of width), and drop the distance clause below 600 px width.

Reviewed captures at 1600×1000, 1000×600 and 390×844 with rings enabled: rings and their stacked labels are legible and non-overlapping (five labels at the two larger sizes, seven short labels at phone width), the footer line fits under the scale rule (wrapping to two lines at 390 px), and no label touches the header, rail or footer. A follow-up 800×600 capture covers the 601–900 px band that the earlier set skipped: six stacked labels (3–11 Gyr) sit clear of the compact icon rail and the header, and the footer line fits on one line (`.cache/lookback/full-800x600.png`). The footer line is hidden while the focus is the Sun / Observer itself, where the depth is zero. The status text crowding the footer at 390 px width was present before this change (confirmed by hiding only the new line) and remains within the deferred mobile scope. Evidence: `.cache/lookback/full-1600x1000.png`, `full-1000x600.png`, `full-390x844.png`, `full.json`, `subset.json`; reports copied to [validation-results.json](validation-results.json).

## Survey footprint — 12 September 2026

State: verified on full-data and development-subset GPU runs and direct page captures.

Settings adds an off-by-default saved Survey footprint checkbox beside the lookback rings, with no new toolbar button. Its hint shows the sidecar's own disclosure once the grid has loaded, a generic explanation before that, and an unavailable notice if the sidecar fails; About the data gains a Survey footprint section with the DESI DR1 link. The overlay is drawn on an observer-centered sphere at the catalog's farthest distance, after the rings and before the points.

Reviewed captures at 1600×1000, 1000×600, 800×600 and 390×844 with the footprint enabled from the overview: the tint reads as a faint teal shell behind the point cloud, the points stay brighter than the tint everywhere, unsurveyed directions stay dark, and no HUD element moves. With the footprint, lookback rings and CMB shell all enabled at 1600×1000, the rings and their five labels remain legible over the tint and the shell's grid is not washed out (`footprint-stack-stack-overview.png`). From the Sun / Observer focus zoomed out slightly, the view along the Galactic plane shows no tint, as expected because DESI avoids the plane; orbiting 180° and tilting away from the plane brings the surveyed sky into view as broad teal regions with the nearest catalog points in front of them and the edge-on Milky Way model dark against them (`footprint-stack-stack-origin*.png`). No rendering change was needed after inspection. The first stacked GPU run exposed a probe timing race (its baseline frame was taken while chunks were still streaming, so draw counts climbed between toggles while every render check passed); the probe now waits for two consecutive settled frames before comparing draw counts. The pre-existing status-text crowding at 390 px width remains within the deferred mobile scope. Evidence: `.cache/footprint/footprint-full-*.png`, `footprint-stack-*.png`, `footprint-full.json`, `footprint-subset.json`; reports copied to [validation-results.json](validation-results.json).

## Shareable views and camera travel — 12 September 2026

State: verified on full-data and development-subset GPU runs, a DOM smoke of the real dialog and direct page captures.

Share joins Visit, About the data and Settings in the top bar and opens one dialog: a one-line explanation of what a link carries, Copy link, a Save this view row whose placeholder is the default name (the selected galaxy, Milky Way or Overview with the time), and the saved list with Open and Delete per row. No toolbar button was added. Copy link builds the link from the live camera at click time; when the clipboard is unavailable the link appears in a read-only field under the button instead of failing silently. Saved names are HTML-escaped (a name containing `<b>` renders as text).

Reviewed captures of the dialog empty and with three saved views at 1600×1000, 1000×600, 800×600 and 390×844: the layout follows the Visit dialog's width and spacing, rows read name over date with Open and Delete aligned right, the 600 px rule stacks the save row so the button keeps its full label, and short windows scroll the list inside the dialog rather than growing past 80 % of the viewport. The first capture showed the grid placing the buttons before the name because items with an explicit row are placed first; explicit grid areas fixed it before the suite ran.

Opening a link from a fresh load lands on the exact catalog position with the link's camera offset (NGC 3982, a non-resident chunk, Andromeda and the Galactic core all within 1e-9 relative; every identity case had its absolute target deliberately perturbed by 1 µMpc so only the re-verified position could pass). A link naming a target ID or row this catalog does not hold leaves the selection empty, keeps the camera-only view and shows "This link points to a galaxy this catalog does not contain."; a six-digit row never decodes. Opening a saved view travels for 1.5 s and the dialog closes at once; a real wheel event 0.6 s into a 2 s Milky Way travel cancels it with zero target drift over the following 300 ms, and an uninterrupted travel ends within 1e-9 of the instant pose. During a 2 s hop from the Milky Way to NGC 3982 the pool stayed within the 12-model limit (peaks of 6 and 7 across the two passes; 12 and 10 removals, all at zero blend). The address bar is stripped of the hash after it is applied. The dialog captures predate two behaviour-neutral one-liners landed in the same phase (the `visitCatalog` arrival return and the public `stopTravel()`), which touch no markup or style. Evidence: `.cache/share/share-full-*.png`, `share-full.json`, `share-subset.json`, `travel-regress.json`, `smoke.mjs`; reports copied to [validation-results.json](validation-results.json).

## Guided tours — 12 September 2026

State: verified on full-data and development-subset GPU runs and direct page captures.

Tours joins the rail below Overview and opens one dialog: a one-line explanation (camera motion between real destinations, any input pauses, Escape exits, nothing saved changes), then the two routes with title, summary, stop count and a Start button that stays disabled until the atlas is ready. Starting closes the dialog and opens a panel in the right column with the tour title and an "n / N" counter, the stop title and caption, Prev / Pause-or-Play / Next and a status line (Travelling…, Arrived · continuing shortly, Paused · drag or scroll moved the view, Paused, Finished · Exit returns to the map). The galaxy and Milky Way inspectors and the CMB card yield to the panel while a tour runs and return on exit, so the Milky Way stop does not stack the home inspector beside the panel.

Reviewed captures at 1600×1000 of the dialog and all five zoom-out stops: the Sun stop sits inside the disk with the Sun · Observer label centred, the Milky Way stop frames the core with both labels, the Local Group stop shows the nearby models with the Sun at the bottom of the frame, the survey stop shows the catalog wedge with the count filled from the manifest ("14,140,375 accepted DESI DR1 observations in this dataset"), and the CMB stop shows the shell with the CMB shell rail button lit while the saved setting is untouched; after Escape the panel is gone and the shell is off. The first compact captures at 1000×600 and 800×600 placed the panel's control row under the footer's Adaptive / Full detail switch; the controls now live in a fixed footer of the panel and the compact max-height was trimmed, so the caption scrolls while Prev / Play / Next stay reachable just above the switch. At 390×844 the panel spans the width beside the icon rail and the dialog stacks each route's Start under its summary; the pre-existing status-text crowding at that width remains within the deferred mobile scope. Evidence: `.cache/tours/shots/dialog-*.png`, `zoom-out-*-1600x1000.png`, `after-exit-1600x1000.png`, `panel-*.png`, `.cache/validation-tour-full.json`, `.cache/validation-tour-subset.json`; reports copied to [validation-results.json](validation-results.json).

## Handoff review: pause while a tour stop loads — 12 September 2026

State: verified at `d70630b` on full-data and subset GPU runs, including context recovery, and the rebuilt production package.

Read through `33f60bd`, `0ac380b` and `5a6cfda`: R/F capture matches the explorer's shortcut guards, the autoplay-off and forward-skip assertions cover their intended cases, shared diagnostic helpers and merged CSS preserve behavior, and the committed `tour-final` report exactly matches the saved report. `npm test` correctly confines discovery to `tests/` (84 tests before this fix).

The read-through also found an uncovered pause path: a catalog stop can still be waiting for metadata before an animation exists. In that state `stopTravel()` does nothing, the panel stays Travelling and the pending visit remains authorized to move later. A deferred-visit unit test reproduced the failure. Pause now invalidates the tour visit token, drops the previous arrival pose and enters Paused immediately; Play retries the same destination with a fresh token. The new test verifies late completion cannot change state or schedule a dwell, and resume remains possible. The real-GPU tour probe now holds an actual metadata lookup at NGC 3982, pauses through the panel, releases the lookup, checks the camera stays put and resumes the stop.

The held NGC 3982 lookup now produces zero target and camera drift after Pause, both before and after context recovery, and Play resumes successfully. All shared navigation/home/nearby/CMB/continuity probes pass. Production R/F checks pass during travel, all five zoom-out stops remain paused when stepped with autoplay off, shell restoration passes, and Andromeda/NGC 3982 links retain their camera and verified selection in fresh tabs. Tour controls remain reachable at 1000×600, 800×600 and 390×844. Screenshots of the stacked overlays and CMB tour panel were inspected; the existing narrow status-text crowding remains deferred. Final reports are linked in [validation](validation.md).

## Road trip model expansion — verified

Dave requested more galaxy and cloud models for the cosmic road trip. Baseline captures show the Magellanic Clouds currently inherit generic spiral illustrations. First checkpoint adds tightly wound and feathered recipes, choosing Andromeda, Triangulum and NGC 3982 by exact public identity. Unit checks preserve each sample's radius, depth, size and color across recipes. GPU appearance/brightness, cloud renderer and production review are still pending.


Cloud renderer checkpoint: LMC now has a soft offset bar with broken outer patches; SMC has a fragmented elongated stellar body. Both use static 48³ fields and 4,096 light knots, replacing the generic spiral in either appearance mode. Inspector, Settings and tour captions disclose the illustration and preserve distance/shape provenance. Refined isolated `?cloudtest` passed on the actual Apple M3 Max GPU, including front/reverse/edge/inside/behind views, attenuation, repeat/reconstruction, highlights and picking, before and after graphics recovery. Unit suite: 88 tests across 18 files; strict TypeScript passes. Full tour/shared regressions and the final production package are pending.


Final review at `2de64f1`: full-data `tourtest`, `cloudtest`, `varianttest`, `colortest`, `continuitytest`, `uxtest`, `nearbytest` and `hometest` all pass on HeadlessChrome 153 / ANGLE Metal Apple M3 Max, 1600×1000. Subset cloud/nearby/tour suites pass, including the expected two unavailable NGC stop notices. All repeated rendering checks pass after WebGL recovery; cloud checksums match across recovery. Both routes retain all their navigation and pending-visit pause behavior. The model pool stays at 12, with no abrupt continuity events or visible removals.

Production package control review passes all 35 assertions: the default display label, all ten road trip stops and cloud captions, five named recipes through search, both cloud models in Catalog types, point-display choices, cloud share-link restoration, saved appearance, NGC 4026's retained catalog lenticular model and full observation count. No JavaScript or shader errors. Inspected production screenshots at stops 2, 3, 4, 6, 7 and 8, plus both cloud orbits; the clouds have distinct continuous haze/dust shapes, and the two new spiral recipes retain restrained highlights. The tour controls remain readable and reachable in the reviewed desktop layout. Recorded evidence is in `docs/validation-results.json` under `roadtrip-models-full`, `roadtrip-models-subset` and `roadtrip-models-production`; local captures are in the ignored `.cache/roadtrip-models/production/`.

## Road-trip telescope-image portraits — verified

Inspected primary images for each individual road-trip object and both Coma fields; reviewed the official DESI map explanation (its local image download was unavailable). Added exact-identity continuous disk recipes, retained source ellipses/radii, restored smooth M32/M110/NGC 4026 profiles in the default mode, and refined both cloud templates. References and interpretation limits are in [image-portraits.md](image-portraits.md). Initial real-GPU disk/cloud volume suites pass, including recovery. A final interarm-light refinement and the complete tour, shared GPU and production checks remain pending. Unit milestone: 91 tests/19 files; strict build passes before that final visual refinement.

Final review at `7d11885`: full and subset GPU suites pass with stable graphics recovery and zero errors; all ten production road-trip stops and eight individual named models were inspected. M31 has continuous light/dust arcs, M33 and NGC 3982 have distinct patchy stellar disks, LMC/SMC have distinct bar/body/wing treatments, and M32/M110/NGC 4026 retain smooth profiles at their adopted sizes. Production controls, reference-image links, source disclosures, cloud share restoration and appearance persistence pass. Full reports are appended to validation-results.json, preserving older results. The source and accepted catalog are ready for release.

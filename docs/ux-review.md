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

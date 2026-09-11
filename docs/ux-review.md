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

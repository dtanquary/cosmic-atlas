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

# Navigation and UI review — 2026-09-11

Status: fixing.

## Foreground model obstruction

Reproduction: `?uxtest&run=observer-before` puts the actual camera on the line through NGC 3982 toward the observer and samples eight approach distances. GPU readback measures the fraction of pixels brighter than 24/255, independently of background points. A body-hit probe checks an off-center map click.

Before: at 6 half-light radii the model brightens 48.7% of the viewport; at 2 radii 96.5%; at 0.25 radii and the center 100%. Its blend stays 1 and the off-center click hits the galaxy. Verified on Chrome 152 / Apple M3 Max, 2268×1218 drawing buffer. The full view visibly washes out. A single measured galaxy reproduces the problem, so overlapping/fallback models are not necessary.

Ranked hypotheses: (1) angular-size-only model blending has no obstruction limit; (2) no explicit distinction between intended galaxy focus and incidental transit; (3) additive overlap amplifies the effect.

Acceptance: automatic incidental models smoothly return to points before filling the view; observer/overview navigation clears any previous model-focus exemption; explicitly focused galaxy profiles and body picking retain their close-up fidelity. A points-only setting offers direct control without changing scientific positions, sizes, or the accepted catalog.

## UI review

Check primary inspector actions at short viewport heights, search cancellation during asynchronous visits, dialog focus restoration, icon-only accessible labels, and error retry hit targets. Record reproduced issues and final evidence here.

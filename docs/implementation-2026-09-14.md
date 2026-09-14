# Improvement implementation record

Dave authorized implementation of the [eight-phase plan](roadmap-2026-09-14.md) on 14 September 2026 and requested documentation throughout. This record tracks milestones, decisions and remaining work; linked validation reports contain the evidence behind completion claims.

| Phase | Status | Evidence / next milestone |
| --- | --- | --- |
| 1 — Baseline | Browser baseline verified | Cold/warm/throttled Chrome, WebKit phone layout and 600-second exploration complete; physical iPhone follow-up pending |
| 2 — Tour experience | Released | Ordered milestone 1 completes companion labels, place context, Continue and all-stop responsive/interruption review |
| 3 — Loading and rendering | Released | Ordered milestone 2 adds bounded row lookup/preparation, useful arrivals and measured performance comparisons |
| 4 — Photographs | Released | Ordered milestone 3 ships ten attributed on-demand photographs and calibrated NGC 4026 framing |
| 5 — Custom trips | Released | Ordered milestone 4 implements paused stop links, local authoring, recipient previews and bounded file/link sharing |
| 6 — Cosmic-web slicing | Planned | Coherent visual/picking filter and bounded streaming |
| 7 — Size comparison | Planned | Audit size conventions before diagram layout |
| 8 — Narration | Planned | Source-checked scripts, deliberate audio start, combined validation |

**Baseline decisions**

- Measure the already verified production package so documentation and upcoming source work cannot reset the run through hot reload. The benchmark verifies the served entry-bundle checksum before and after.
- Reuse the public tour controls and F8 diagnostics. Benchmark instrumentation is injected by Playwright and never bundled into the atlas.
- Report global queue completion as a loading proxy, distinct from camera arrival and screenshot evidence. A new readiness feature should not inherit the false assumption that every outstanding background request is essential to the current stop.
- Separate actual Chrome/WebKit GPU results on the development machine from physical iPhone performance. Hardware temperature, power and Safari interruptions require a physical-device follow-up.
- Preserve the existing source/catalog geometry, default 0.5% background floor, full accepted count and allocation limits throughout baseline collection.
- Reviewed all ten arrival captures in both desktop Chrome and WebKit phone portrait. Keep the outward Coma framing. The small Andromeda companions would benefit from curated labels in the next phase 2 pass; preserve their adopted size rather than enlarging the models.

See [method, results and ranked investigations](performance.md) and [compact evidence](performance-results.json). First coarse view was about 0.76 seconds on ordinary localhost and 3.85 seconds with network emulation; intermittent transition hitches and loading readiness are the next investigation priorities. Performance changes have not started and no speedup is claimed.

**First tour milestone**

- Added route-scoped stable stop IDs and brief visual cues. Existing sourced captions, measured coordinates, model profiles and travel durations remain intact.
- The progress label opens Stops & pace. Opening it pauses playback; choosing a chapter or Return to stop lands paused. Quick retains the existing dwell, Relaxed doubles it, and Manual schedules no automatic progression. Pacing is session-only; existing shared road-trip invitations deliberately retain their automatic Quick start.
- Keep the source explanation in the existing Details area on phones and retain the desktop inspector structure. The added short cue and a full touch target for options permit a compact phone tour panel up to 215 px in the regression journey; landscape omits the cue while collapsed to preserve map space.
- Added Back to previous view with 32 session entries, restoring verified camera/target/identity through the existing share-view lifecycle. Internal tour hops and orbit frames do not fill the history. Further contextual labels and optional highlights remain for subsequent phase 2 review. No full-phase completion is claimed until those decisions and validation gates are resolved.

**Validation checkpoints**

- `8670fdf`: stable stop IDs and pacing logic passed 95 tracked tests and strict TypeScript.
- `fd94282`: first UI/history milestone passed 98 tracked tests, strict TypeScript and the full-data production package. The initial production acceptance passed 44 Chrome/WebKit assertions. The existing mobile and invitation journeys passed 126 and 30 assertions respectively; full/subset GPU checks passed.
- `6a6ebe1`: follow-up QA fixed Back re-centering a panned Andromeda view. An explicit history-only target-preservation option retains identity verification and public-link anchoring. The rebuilt production journey passes 50 assertions, including pan plus selection and Back after a shared view. All 98 tracked tests, strict build, full/subset GPU navigation and graphics recovery pass on this final implementation. See [validation details](validation.md) and [reports](validation-results.json).

**Work remaining after the first tour checkpoint — now resolved**

- Ordered milestone 1 supplies curated place context and two bounded M32/M110 labels.
- The all-stop portrait/landscape/desktop, hidden-tab and reduced-motion matrix passes; paused playback explicitly says Continue.
- Ordered milestones 2–4 cover phases 3–5. Phases 6–8 remain future work; physical-phone performance remains a separate pending check.

**Delivery — 14 September 2026**

Committed and pushed the first milestone to GitHub, then deployed the verified full-data package to Cloudflare. Hosted verification matched all app/license assets and the catalog/search sidecars, checked nine point/metadata/model chunks, and confirmed the expected missing/private-path responses. A live browser opened the road-trip invitation, switched to Manual, jumped to Coma, and verified its cue, full count and available phone map area without page errors. App implementation is `6a6ebe1`; the release documentation checkpoint is `fc817c4`. Deployment destinations, receipts and screenshots remain in ignored `.deploy/`.

**Four ordered milestones**

Dave's subsequent instruction to work through all four milestones is tracked in [the ordered record](four-milestones-2026-09-14.md). It covers phases 2–5 above. Tour clarity, measured arrival preparation and photograph comparisons are committed, pushed and deployed with exact-byte hosted verification. The final custom-trip milestone passes 124 unit tests and 83 production Chrome/WebKit checks; its final shared GPU/mobile suite passes. All 1,020 production browser assertions and the full model/source gates pass. Scientific coordinates, radii, source classifications, catalog coverage and background opacity remain unchanged. The detailed records distinguish browser evidence from unperformed physical-device or messaging-app tests.

**Final delivery of the four ordered milestones**

All four are committed, pushed and deployed. Final app source is `18256b1`; `068fc88` records the combined validation. Hosted exact-byte verification and a fresh live phone-layout check of stop links, photographs, recipient previews and custom playback pass with 14,140,375 accepted observations and no page errors. The complete evidence remains in the ordered record and milestone results; private operational receipts remain ignored. Phases 6–8 are future work beyond this four-milestone execution.

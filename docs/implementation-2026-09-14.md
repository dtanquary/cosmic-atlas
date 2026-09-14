# Improvement implementation record

Dave authorized implementation of the [eight-phase plan](roadmap-2026-09-14.md) on 14 September 2026 and requested documentation throughout. This record tracks milestones, decisions and remaining work; linked validation reports contain the evidence behind completion claims.

| Phase | Status | Evidence / next milestone |
| --- | --- | --- |
| 1 — Baseline | Browser baseline verified | Cold/warm/throttled Chrome, WebKit phone layout and 600-second exploration complete; physical iPhone follow-up pending |
| 2 — Tour experience | In progress | Stable IDs, cues, pacing, chapters, Return to stop and bounded view history implemented locally; validation pending; further context/framing review remains |
| 3 — Loading and rendering | Planned | Use phase 1 evidence to choose bounded optimizations |
| 4 — Photographs | Planned | Source/rights manifest and first disk/cloud comparison |
| 5 — Custom trips | Planned | Built-in stop links before the custom editor |
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
- `fd94282`: first UI/history milestone passed 98 tracked tests, strict TypeScript and the full-data production package. The initial production acceptance passed 44 Chrome/WebKit assertions. The existing mobile and invitation journeys passed 126 and 30 assertions respectively. Shared GPU navigation/recovery and additional history checks are in progress; this checkpoint is not yet a released build.
- Follow-up QA reproduced Back re-centering a panned Andromeda view. Added an explicit history-only target-preservation option to the existing identity-verified restore path, retaining public-link anchoring. The regression now checks pan plus selection and Back after a shared view; final validation pending.

**Remaining phase 2 work**

- Curated place context and a bounded label/highlight treatment for subtle subjects, especially M32/M110.
- All-stop landscape composition review and the final hidden-tab/reduced-motion acceptance matrix. Existing Play already returns to the stop after exploration; review whether its paused label should explicitly say Continue.
- Complete the browser/GPU release gates below before publishing the first milestone. Phases 3–8 remain planned, and physical-phone performance remains a separate pending check.

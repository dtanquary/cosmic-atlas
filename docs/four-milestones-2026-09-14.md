# Four ordered implementation milestones

Dave authorized all four on 14 September 2026, without intermediate permission stops. These extend the existing improvement plan; each gets coherent commits, production/GPU checks, a GitHub push and a verified Cloudflare deployment. Physical-device testing is explicitly pending device access and does not block browser work.

| Milestone | Status | Deliverable |
| --- | --- | --- |
| 1. Tour clarity | Verified; publishing | Curated companion labels, place context, Continue, hidden-tab/reduced-motion behavior, all-stop phone review |
| 2. Smoother arrivals | Planned | Bounded cancellable next-stop preparation, useful destination readiness, measured transition investigation |
| 3. Telescope photographs | Planned | Source/rights manifest, lazy bounded comparison for supported targets, unsupported-image fallback |
| 4. Sharing and custom trips | Planned | Versioned paused stop links, local itinerary editor, validated bounded sharing and recipient preview |

## Milestone 1 decisions

Two screen labels identify M32/M110 at their existing independently measured positions during the companions stop. They use the existing frame loop, have no geometry or picking presence, and disappear offscreen/behind the camera or on tour exit. No model is enlarged. Place context reuses the existing brand subtitle so it does not increase phone panel height; it describes curated tour context or the verified selection rather than inferring group membership from proximity. Continue explicitly resumes after exploration; backgrounding pauses without automatically resuming on return.

Validation and deployment results will be appended at each milestone. Source captions, data identities, counts, modeled dimensions and the 0.5% background floor stay intact.

Milestone 1 validation checkpoint (`58a1d42`): 98 tracked tests and full-data package passed. All-stop composition checks passed 469 assertions on Chrome 153 and WebKit 26.6 at 402×874, 874×402 and 1600×1000, covering both routes. All 90 captures were reviewed. The initial label threshold hid the small M32 reference and was lowered without changing its model. Full/subset tour/UI/home/share/nearby GPU suites and context recovery passed; existing phone controls passed 126 assertions and tour/history controls passed 50. Final review adds clearing of stale prior-stop toasts during rapid reduced-motion jumps; final production rerun pending. Visibility events are simulated; reduced-motion media preference and camera behavior run in the actual browser engines.

Final milestone 1 production source `9990629` passes 493 assertions, including stale-message cleanup. [Validation](validation.md) and [machine-readable evidence](milestone-results.json) record the combined gates. The full package remains 3,058 files / 1,078.8 MiB, largest 3.24 MiB.

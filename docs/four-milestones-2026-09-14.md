# Four ordered implementation milestones

Dave authorized all four on 14 September 2026, without intermediate permission stops. These extend the existing improvement plan; each gets coherent commits, production/GPU checks, a GitHub push and a verified Cloudflare deployment. Physical-device testing is explicitly pending device access and does not block browser work.

| Milestone | Status | Deliverable |
| --- | --- | --- |
| 1. Tour clarity | Released | Curated companion labels, place context, Continue, hidden-tab/reduced-motion behavior, all-stop phone review |
| 2. Smoother arrivals | Released | Bounded cancellable next-stop preparation, useful destination readiness, measured transition investigation |
| 3. Telescope photographs | Implementing | Source/rights manifest, lazy bounded comparison for supported targets, unsupported-image fallback |
| 4. Sharing and custom trips | Planned | Versioned paused stop links, local itinerary editor, validated bounded sharing and recipient preview |

## Milestone 1 decisions

Two screen labels identify M32/M110 at their existing independently measured positions during the companions stop. They use the existing frame loop, have no geometry or picking presence, and disappear offscreen/behind the camera or on tour exit. No model is enlarged. Place context reuses the existing brand subtitle so it does not increase phone panel height; it describes curated tour context or the verified selection rather than inferring group membership from proximity. Continue explicitly resumes after exploration; backgrounding pauses without automatically resuming on return.

Validation and deployment results will be appended at each milestone. Source captions, data identities, counts, modeled dimensions and the 0.5% background floor stay intact.

Milestone 1 validation checkpoint (`58a1d42`): 98 tracked tests and full-data package passed. All-stop composition checks passed 469 assertions on Chrome 153 and WebKit 26.6 at 402×874, 874×402 and 1600×1000, covering both routes. All 90 captures were reviewed. The initial label threshold hid the small M32 reference and was lowered without changing its model. Full/subset tour/UI/home/share/nearby GPU suites and context recovery passed; existing phone controls passed 126 assertions and tour/history controls passed 50. Final review adds clearing of stale prior-stop toasts during rapid reduced-motion jumps; final production rerun pending. Visibility events are simulated; reduced-motion media preference and camera behavior run in the actual browser engines.

Final milestone 1 production source `9990629` passes 493 assertions, including stale-message cleanup. [Validation](validation.md) and [machine-readable evidence](milestone-results.json) record the combined gates. The full package remains 3,058 files / 1,078.8 MiB, largest 3.24 MiB.

Milestone 1 was pushed and deployed. A transient new-asset 404 during alias propagation cleared on retry; canonical and deployment URLs served the file, and the complete hosted verification then passed. Operational evidence remains ignored.

## Milestone 2 investigation

A Chrome CPU sample of the Triangulum → NGC 3982 transition (development source matching milestone 1) attributes approximately 1.55 seconds to repeated model-row searches, versus 0.37 seconds in model candidate scanning and 0.23 seconds in shape tests. This is sampled CPU attribution, not a GPU frame-time or end-user speedup result. The first candidate caches positive and negative point-row lookups for the current bounded model set: two Int32 arrays, 96 bytes per loaded point chunk. It preserves immutable IDs, exact row results and pool ordering, with no per-record hash map. The matching Chrome sample with the cache attributes 0.20 seconds to lookup resolution versus 1.55 seconds before (12.05 and 11.69 second sampled windows). Other costs vary between runs; this is evidence for removing repeated searches, not a claimed frame-rate improvement. All 100 unit tests and strict TypeScript pass. Production/GPU and repeated journey validation remain pending for milestone 2.

The loader now has independent speculative leases, required-work promotion, current-view queue priority and acknowledgement-safe cancellation. Six focused worker tests cover shared owners, explicit navigation joining, frontier release, late replies, reservations/queue cancellation and worker recovery; all 106 tests and strict TypeScript pass. This is a loading-lifecycle checkpoint; tour integration remains in progress.

Tour integration checkpoint: bounded preparation and destination readiness are implemented with the original single timer. All 110 tests and strict TypeScript pass. Actual-GPU, production interaction and performance checks follow before release.

GPU review found the Local Group readiness margin excluded the deliberately separated galaxies near the top and bottom of the frame. Its check now uses the full viewport, retaining the tighter central-region check for cluster/survey coverage. Recorded projected positions showed all six references inside the viewport. The initial run correctly exposed the overly strict criterion; rerun follows.

Full-data tour/UI/home/share/nearby/continuity/self-test GPU checks pass on `6ee64eb`, including context recovery and no shader/page errors. The subset probe now explicitly chooses Continue on its expected partial Coma view; choosing Next would correctly leave subsequent stops paused, so the prior automated wait for Finished was invalid.

The production arrival journey passes 17 Chrome/WebKit assertions. It observes both next-stop assets requested at Triangulum, preserves the current camera, pauses correctly, then reaches NGC 3982. The partial-data branch uses the genuine development catalog as a network fixture: production intentionally ignores dataset query parameters. Retry, Continue, Next and phone map access pass; both partial-view captures were inspected. Full model-sidecar verification passes for 14,140,375 records. The independent floor/resolution experiment found no frame-distribution benefit worth a rendering-policy change; details are in `performance.md`.

The sustained/cold, warm and slow-network comparisons completed; the normal-speed WebKit phone route exposed a false partial-data state at Coma. A reproducible 402×874 / 250,000-point-budget GPU check draws the same 218,650 points: the global 31,247-point sample finds only four points in the arrival region, while sampling its intersecting chunk examines 8,192 points and finds fourteen. Readiness now spends its bounded sample on intersecting spatial chunks. No rendering, sampling budget or catalog positions change. The benchmark now saves failure state and screenshots and reports the active stop, which made the phone failure directly reviewable. The corrected production phone route and shared GPU/phone controls are being rerun.

Final source `c2d3f2a` passes full/subset GPU suites and graphics recovery; production checks pass 493 all-stop, 126 mobile, 50 tour/history and 17 arrival assertions. The partial-arrival fixture now withholds non-root point chunks from the genuine development dataset: its original available subset can correctly satisfy the improved readiness check. All 110 tests, full profile coverage and the 3,058-file package pass. Cold/warm/slow-network and final WebKit journeys complete; the cold run includes 600 seconds of exploration. Measured gains, workload growth and earlier failed attempt are recorded in `performance.md`.

Milestone 2 is pushed and deployed. Initial alias propagation returned old/missing assets; the final exact-byte hosted verification passes for app/license assets and sampled full-catalog chunks. Milestone 3 now has ten verified source images and a lazy bounded comparison panel; production/GPU checks follow.

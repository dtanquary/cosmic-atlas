# Improvement implementation record

Dave authorized implementation of the [eight-phase plan](roadmap-2026-09-14.md) on 14 September 2026 and requested documentation throughout. This record tracks milestones, decisions and remaining work; linked validation reports contain the evidence behind completion claims.

| Phase | Status | Evidence / next milestone |
| --- | --- | --- |
| 1 — Baseline | In progress | Production journey harness added; Chrome baseline running; WebKit/network cases and physical-device follow-up remain |
| 2 — Tour experience | Planned | Stable stop IDs, cues, pacing, chapters, return/history/place controls |
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

See [method and reproduction](performance.md). Performance changes have not started and no speedup is claimed.

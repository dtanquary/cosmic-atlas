# Journey performance measurements

Phase 1 of the [improvement plan](roadmap-2026-09-14.md) establishes a repeatable production baseline. Measurements and tuning decisions belong here; performance targets remain in [requirements](requirements.md). A browser with phone dimensions is not a physical-phone benchmark.

Run a stable full-data production preview before measuring. Keep the production package fixed for the entire run and run only one GPU benchmark at a time. Source documentation can change while the fixed package is measured; the report records both the starting checkout commit and the actual served entry-bundle checksum.

```sh
npm run build:pages
npm run preview:pages -- --port 4180 --strictPort
```

In another terminal, using an independently installed Playwright as in the mobile validation instructions:

```sh
PLAYWRIGHT_MODULE="$PWD/.cache/capture-tools/node_modules/playwright/index.mjs" \
  node scripts/benchmark-journey.mjs
```

`ATLAS_TEST_URL` selects a preview or deployed build, `ATLAS_TEST_OUTPUT` selects the ignored results directory, and `ATLAS_BENCH_CASES` selects comma-separated `chrome-cold,chrome-warm,chrome-slow,webkit-phone`. Warm runs require cold in the same invocation and reuse its browser context/cache in a new page. `ATLAS_SOAK_SECONDS` defaults to 600, applies to Chrome cold, and can be 0 for a short trial. Do not describe a zero-duration trial as sustained performance.

The cases use installed Chrome at 1600×1000 CSS pixels and WebKit at 402×874 with device scale factor 3. The app's existing drawing-resolution cap remains active and the report records actual drawing dimensions. Chrome slow uses network emulation of 5 Mbps down, 1 Mbps up and 80 ms latency. An unthrottled local preview isolates much of the rendering cost but is not a CDN or mobile-network measurement; preview caching headers may differ from the deployed package. Treat response bytes and cache behavior in that context.

The route follows all ten road-trip stops at ordinary production travel/dwell speed. It records an arrival screenshot at each stop. The sustained Chrome portion repeats the route for at least ten minutes, adding public mouse orbit gestures at Andromeda and Coma; it introduces no private camera moves or accelerated tour clock. WebKit measures the tour and phone layout; physical touch correctness is independently exercised by `check-mobile-ui.mjs`.

**What the report measures**

- First coarse view: the first 250 ms sample with submitted observations and the loading overlay hidden. This has up to one polling interval of uncertainty and is a navigable-view proxy, not a paint-timing assertion.
- Camera arrival: the public tour status changes to Arrived. Queue-settled delay is the first subsequent sample with no reported outstanding chunks before the stop changes. This is a global loading proxy, not proof that a particular feature was visible. Arrival screenshots provide separate visual evidence; phase 3 will add a destination-specific readiness contract.
- Movement frame intervals: timestamps of app animation callbacks that issue actual WebGL draw calls during tour travel or a scripted gesture. The harness wraps the existing callback/draw entry points; it adds no animation loop, pixel readback or synchronous GPU wait. Intervals are grouped by object and activity so idle time and navigation boundaries are not mistaken for movement stutters. Screenshot capture and the following 250 ms are excluded.
- Callback CPU duration: elapsed CPU time around the existing animation callback, including draw submission. This is not GPU execution time. The small instrumentation overhead and visible F8 HUD are present in every measured case.
- Resources: sampled managed-allocation/model/pending values from the existing F8 HUD, submitted/loaded counts, completed response-body sizes and request timings, and supported browser long-task entries. Managed memory excludes browser/driver allocations. Response sizes are not a measurement of cellular billing, and cache-served responses can still report body sizes.
- Sustained behavior: early and late movement distributions accompany the full distribution. Different tour stops have different workloads; inspect the per-stop raw data before attributing a difference to device warming. No temperature, battery-power or physical iPhone result is inferred from these measurements.

Full frame samples, response paths and screenshots stay in ignored `.cache/performance/`; source-controlled evidence contains the concise summary and methodology. The harness fails on missing stops, browser exceptions, wrong accepted count, a changed opacity default, or a changed production entry bundle. A good frame-rate result never excuses changed geometry, dropped catalog coverage or failed picking.

**Initial run — 14 September 2026**

Browser baseline complete. All five cases used the verified Coma-framing production code at `43b9f5d`; starting checkout commits and the unchanged served-bundle checksum are in [the compact results](performance-results.json). No rendering optimization has been applied. Physical iPhone testing remains pending device access.

| Case | First coarse view | Movement p95 / p99 | Peak managed memory | Movement intervals over 50 ms |
| --- | ---: | ---: | ---: | ---: |
| Chrome cold, complete tour | 755 ms | 33.4 / 83.4 ms | 336.3 MiB | 99 / 2,598 |
| Chrome warm, complete tour | 758 ms | 33.4 / 83.4 ms | 341.0 MiB | 92 / 2,619 |
| Chrome, emulated 5 Mbps | 3,846 ms | 16.8 / 16.8 ms | 187.8 MiB | 0 / 3,054 |
| WebKit phone layout | 716 ms | 19 / 47 ms | 325.1 MiB | 21 / 2,971 |
| Chrome, tour plus 600-second exploration | 756 ms | 16.8 / 83.4 ms | 373.7 MiB | 484 / 18,728 |

Chrome used ANGLE Metal on Apple M3 Max with a 1600×1000 drawing buffer. WebKit reported Apple GPU and a 603×1311 drawing buffer at 402×874 CSS pixels. Every case completed all ten stops with 14,140,375 catalog observations, the default 0.5% opacity floor, no page errors and no reported memory-limit blocking. The peak 14 visible models includes the separate nearby/home references; it is not a count of the capped DESI pool.

The slower-network case loaded fewer resources during the route (65.7 MB of completed response bodies versus 190.5 MB in the ordinary cold case). Its smoother movement therefore does not demonstrate an optimization: the loading and rendering workloads differ. The global queue did not settle before departure at six slow-network stops, although the Coma arrival capture already clearly showed its subject. Use destination-specific visual readiness, not global queue zero, to decide when future tour dwell should begin.

The sustained run has a 16.8 ms p95 but an 83.4 ms p99, so averages alone conceal intermittent hitches. NGC 3982 and NGC 4026 movement had p95 values around 67 ms; nearby cloud/companion routes were generally smoother. Early and late samples have different scene workloads, preventing a thermal or power conclusion. Managed memory stayed below 374 MiB in this run; this is not a general device-memory guarantee.

**Ranked investigation for phase 3**

1. Instrument the intermittent work around distant named-galaxy transitions, separating decoding, uploads, model preparation and rendering. The stop correlation is measured; a particular cause is not yet established.
2. Define useful destination readiness and bounded next-stop preparation. The network case demonstrates why ordinary arrival and completion of every background request are inadequate substitutes.
3. Profile the faint-background frontier and pixel cost independently before attempting adaptive resolution or culling changes. Keep the 0.5% default and complete Full detail coverage.

**Harness correction:** the first sustained run retained render timestamps but mistakenly reset the interval accumulator on non-rendering animation callbacks used by browser polling. Its movement intervals were reconstructed from consecutive retained render timestamps within the same stop/activity; arrival screenshots occurred during dwell, outside those movement samples. The original report remains in the ignored evidence directory. The committed harness now ignores non-rendering callbacks and asserts nonempty movement/allocation evidence. The independent cold/warm/network/WebKit runs used the corrected harness. Raw frame samples, request records and arrival images remain in `.cache/performance/phase1-chrome/` and `.cache/performance/phase1-comparison/`.

**Milestone 2 — measured transition work**

A matching development Chrome CPU sample of Triangulum → NGC 3982 attributed 1,551 ms to repeated resident-model row searches before caching, versus 201 ms in the bounded lookup implementation afterward. Sample windows were 12.05 and 11.69 seconds. This supports eliminating repeated scans; sampled CPU attribution is not a frame-time speedup. Positive and absent rows are cached for only the current 12 DESI model identities, adding 96 bytes per loaded point chunk. Geometry, identity mapping and model capacity remain unchanged.

An independent warm NGC 3982 orbit on the actual M3 Max GPU used eight seconds per condition, with default opacity restored for a final repeat:

| Condition | Movement p95 / p99 | Callback CPU p95 | Submitted at end |
| --- | --- | --- | --- |
| 1600×1000, 0.5% floor | 16.8 / 16.8 ms | 7.3 ms | 1,459,749 |
| 800×500, 0.5% floor | 16.8 / 16.8 ms | 7.8 ms | 1,986,232 |
| 1600×1000, zero floor (experiment only) | 16.7 / 16.8 ms | 2.3 ms | 25,836 |
| 1600×1000, 0.5% floor repeated | 16.8 / 16.8 ms | 7.5 ms | 1,993,810 |

Adaptive streaming kept changing the workload, so this is an exploratory comparison rather than an isolated pixel-cost measurement. Lower resolution did not improve the measured frame distribution. Removing the faint background reduced work but also removed its visual coverage, with no material frame-time gain in this case. Neither an adaptive-resolution change nor a different background frontier is retained in this milestone; the 0.5% default, positive-floor picking and Full detail coverage remain intact. Physical-phone performance is still unverified. Raw CPU profiles and this experiment remain in the ignored `.cache/` directory. The complete cold/warm/network/WebKit and ten-minute comparison follows separately.

Final milestone 2 comparison: Chrome cold plus 600 seconds of exploration has movement p95/p99 **16.8/33.3 ms**, with 4 of 20,361 intervals over 50 ms (baseline sustained: 484/18,728, p99 83.4 ms). Warm Chrome is 16.8/33.4 ms; emulated 5 Mbps is 16.8/16.8 ms. First coarse view remains about 755 ms locally and 3,846 ms with network emulation. The final WebKit phone route completes all ten stops at 20/37 ms, versus baseline 19/47 ms; these runs do not establish a phone p95 improvement. Its drawing buffer remains 603×1311 and peak managed memory is 334.6 MiB.

Sustained peak managed memory rose to 486 MiB from 373.7 MiB, with no reported memory blocking. Adaptive detail loaded up to 11.41 million and submitted 2.00 million points, versus 8.43 million / 0.998 million in the baseline. Completed response bodies rose from 383.16 MB to 451.55 MB. These differing workloads preclude attributing every timing/resource difference to the cache. All cases retain the full accepted catalog and 0.5% floor. The first three cases use `ee7ee58`; final WebKit uses `c2d3f2a`, whose only runtime difference is the bounded regional readiness check. An earlier phone failure and the original reports remain in ignored evidence. Forty arrival captures across the completed cases were reviewed.

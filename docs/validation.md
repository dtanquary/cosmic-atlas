# Prototype validation — 10 September 2026

The first prototype uses the full accepted DESI DR1 galaxy catalog. Local numerical, dataset-integrity, production-build, and browser checks passed. Remaining checks are identified below rather than inferred from the results.

## Data correctness

- Official FITS source: 22,371,272,640 bytes; 28,425,963 records. SHA-256: `2d95ad99361039b556c402b49e0e7c84df5f00106dc5731d44476a58b128b49b`.
- Accepted: **14,140,375 unique primary galaxy targets**. Sequential exclusions and exact filters are recorded in the manifest.
- Full catalog: 1,010 hierarchy nodes, 984,457,330 compressed asset bytes. The deterministic development dataset contains 1,000,000 galaxies.
- Direct Astropy comparison: maximum measured distance-interpolation error **1.772 × 10⁻⁷ Mpc**, below the 10⁻⁴ Mpc numerical budget. This is computational error, not observational uncertainty.
- Maximum render-coordinate rounding error: **0.0002441 Mpc per axis** in the coarsest nodes. Inspection and measurement retain float64 source-derived positions.
- Full and development dataset validators passed: every compressed checksum and header, row count, coordinate reconstruction, node bounds, ID uniqueness, child accounting, and exactly-once leaf coverage.
- Seven TypeScript tests and four Python numerical tests passed. Strict TypeScript and the production build passed. The prebuild check verifies active asset presence and declared byte counts.

## Browser checks

Actual browsers on this Mac were used, including GPU ID rendering/readback. Each passed selecting two distinct points, exact 64-bit target ID display, measurement persistence across detail changes, WebGL context loss/recovery, and rejection of corrupted data.

| Browser | Dataset tested | Result |
| --- | --- | --- |
| Chrome 152 | Full 14,140,375 catalog | Pass |
| Safari 27 | 1,000,000 development sample | Pass |
| Firefox 149 | 1,000,000 development sample | Pass |

The tests exposed and fixed a Retina picking error: the GPU pick scissor rectangle was being scaled twice. Picking now uses physical render-target coordinates once. Context recovery restores the map and dismisses the recovery overlay. A measurement of 915.7522950655592 Mpc remained identical through a detail-mode transition in Chrome.

## Measured performance

Apple M3 Max, 36 GB system memory, Chrome/ANGLE Metal, 1920 × 1080 drawing buffer. Continuous overview orbit after five seconds of warmup, sampled for twenty seconds. These are local steady-state results, not minimum-device guarantees.

| Mode | Submitted points | Mean FPS | p95 frame time | Draw calls | Managed allocations |
| --- | ---: | ---: | ---: | ---: | ---: |
| Adaptive | 1,990,709 | 120.0 | 10.3 ms | 142 | 436.9 MiB |
| Full detail | 14,140,375 | 20.8 | 59.5 ms | 883 | 436.4 MiB |

Both runs had no pending/failed chunks or memory-limit state at measurement end. Full detail reported complete coverage. Adaptive remained explicitly sampled. Managed allocations describe the application's tracked arrays, GPU attributes, metadata, and reservations; they are not total browser-process memory or all driver overhead.

The earliest observed coarse view in the full-catalog Chrome run appeared at 168 ms on localhost. That result does **not** verify the three-second target at a controlled 100 Mbps. The browser checks also observed 429 ms in Safari and 366 ms in Firefox using the smaller development dataset.

## Remaining checks and scope limits

- Manual pointer-lock flight, dense-region/fly performance, controlled-network startup, and a long cache-eviction soak still need dedicated acceptance runs. The native desktop window connection became unavailable during the final manual pass.
- Safari and Firefox compatibility passed on the development dataset; full-catalog stress benchmarks were run only in Chrome.
- Optional WebMCP registration was unavailable in all three browser environments, so those optional tools have not been exercised there. Normal controls do not depend on WebMCP.
- Mobile navigation, physical galaxy sizes/artwork, and completeness beyond the selected DESI release are outside this prototype's scope.

Raw browser evidence is retained in [validation-results.json](validation-results.json). Reproduction commands and development-only diagnostic routes are in the [README](../README.md).

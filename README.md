# Cosmic Atlas

A minimal, scientifically explicit 3D explorer of **14,140,375 DESI DR1 galaxies**. Each point is an actual accepted catalog observation. The map uses linear Planck18 comoving distances, with adaptive streaming or full detail, GPU point selection, two-galaxy measurement, orbit controls, and free flight.

## Run locally

The prepared dataset is already available in this workspace:

```sh
npm ci
npm run dev
```

Open the localhost URL printed by Vite. The application uses TypeScript, Three.js/WebGL2, a data-decoding worker, and self-hosted fonts. No server, account, API key, or live astronomy-service connection is needed during use.

The complete prototype is available locally. Cloud publication is currently blocked by the hosting connector's 512 MiB upload limit: the validated application and datasets package is approximately 1 GB. A separate catalog object store is the next delivery task; the local full dataset remains intact.

## Rebuild the data on a fresh checkout

Node 22.12+, 24, or 26+ and Python 3.11+ with `uv` are recommended. The lockfiles pin the dependencies. Large generated binary assets and source downloads are excluded from Git; manifests and their checksums are tracked.

For a small, clearly labeled real-data preview:

```sh
uv sync
npm run data:bootstrap
npm run dev
```

For the full atlas, allow about 24 GB of additional storage for the official 22.37 GB FITS source and processed data. Downloads use resumable byte ranges and an upstream ETag; rerun the command to resume interruptions. The importer refuses an incomplete download checkpoint.

```sh
npm run data:download
npm run data:prepare
```

The importer validates primary-record uniqueness, records all filtering exclusions, computes distances, creates a reproducible one-million-galaxy development sample, writes the full spatial hierarchy, and activates the full dataset only when all referenced assets exist. Use `?dataset=development` for the million-galaxy test dataset. All normal browsing uses the complete accepted catalog.

## Controls

- Drag to orbit; right-drag to pan; scroll to zoom.
- Click a point to inspect it. **F** focuses the selection; **R** resets the overview.
- Choose **Measure**, then select two galaxies. Distances are estimated comoving separations.
- Choose **Fly** for mouse look and **WASD** travel; **Q/E** move down/up, **Shift** accelerates, and **Escape** releases the pointer. Scroll or use the slider to adjust camera speed.
- Choose **Full detail** to load every accepted galaxy in view. Loading and incomplete states are explicit; full detail can reduce frame rate.
- **F8** toggles the performance and managed-memory readout.

## Validation

```sh
npm test
npm run test:data
uv run python scripts/test_data.py public/data/dr1
npm run build
```

The build checks that the active dataset's assets exist and match their declared sizes. The Python dataset validator additionally checks every compressed checksum, binary layout, coordinate reconstruction, node bounds, unique object IDs, and complete leaf coverage.

Development-only browser checks are available at `?selftest=1&run=my-browser`, `?benchmark=1&run=my-browser-adaptive`, and `?benchmark=full&run=my-browser-full`. They use the actual browser GPU, display their results, and save reports under `.cache/validation-*.json`. Benchmark runs use a 1920×1080 drawing buffer, five seconds of warmup, and twenty seconds of continuous overview orbit. Development checks are excluded from production bundles.

## Scientific conventions and attribution

This is an observer-centered reconstruction of catalog measurements, not a complete galaxy census or a simultaneous image of the universe today. Spectroscopic redshifts include peculiar velocities; comoving distance depends on a cosmological model. Screen point sizes and intensities do not encode physical galaxy sizes or luminosities. The About the data panel explains survey gaps, sampling, and uncertainty.

See [requirements](docs/requirements.md), [architecture](docs/architecture.md), [build sequence](docs/build-plan.md), and [validation results](docs/validation.md). DESI DR1 is licensed CC BY 4.0; the required release citation, acknowledgments, and processing changes appear in [the attribution file](public/acknowledgments.txt).

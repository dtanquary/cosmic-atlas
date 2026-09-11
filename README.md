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
- Choose **Visit** to search galaxy names with autocomplete, arrow keys and Enter, or choose a nearby suggestion. Try **NGC 3982** for a spiral close-up, **NGC 4026** for a smooth lenticular model, or **M 109** for a catalog point. The two models crossfade in as you approach. Drag to orbit, scroll to change scale, and choose **Observer-facing view** to restore the measured sky orientation. Click their visible bodies to inspect them.
- Click a point to inspect it. **F** focuses the selection; **R** resets the overview.
- Choose **Observer** in the left toolbar to center and zoom onto our location at the map origin. It returns to orbit navigation and preserves selected galaxies and measurements.
- Choose **Measure**, then select two galaxies. Distances are estimated comoving separations.
- Choose **Fly** to open the speed controls, adjust the slider, then choose **Start flying** for mouse look and **WASD** travel. **Q/E** move down/up, **Shift** accelerates, and scrolling adjusts speed while flying. **Escape** releases the pointer and keeps the controls open so you can adjust the slider and start again. **Orbit** closes flight controls.
- Choose **Auto fly** in those controls for a straight forward pass at the selected speed, with your mouse free to adjust the slider. **Stop auto fly** or **Escape** pauses movement. Observer, Overview, Orbit, manual flight, and switching tabs stop auto fly. Aim the view before starting.
- Flight speed now extends down to 1 parsec/sec for close-up passes. Set a low speed before flying around the galaxy model.
- Choose **Full detail** to load every accepted galaxy in view. Loading and incomplete states are explicit; full detail can reduce frame rate.
- **F8** toggles the performance and managed-memory readout.
- Nearby galaxies have opaque centers and slightly larger markers; distant points fade smoothly. **Settings → Minimum distant opacity** sets their fade floor in 0.5% increments and saves it in your browser. Try **1–5%** to keep a faint background; **0%** allows complete disappearance. The checkbox toggles distance cues. Neither marker size nor brightness represents a physical galaxy property.

## Validation

```sh
npm test
npm run test:data
uv run python scripts/test_data.py public/data/dr1
npm run build
```

The build checks that the active dataset's assets exist and match their declared sizes. The Python dataset validator additionally checks every compressed checksum, binary layout, coordinate reconstruction, node bounds, unique object IDs, and complete leaf coverage.

Development-only browser checks are available at `?selftest=1&run=my-browser`, `?benchmark=1&run=my-browser-adaptive`, and `?benchmark=full&run=my-browser-full`. They use the actual browser GPU, display their results, and save reports under `.cache/validation-*.json`. Benchmark runs use a 1920×1080 drawing buffer, five seconds of warmup, and twenty seconds of continuous overview orbit. The development acceptance runner is excluded from production bundles.

Use `?detailtest&run=my-browser-galaxy` to check both resolved profiles' actual GPU projection, selection away from their centers, rendering from inside, distance-fade floors, close-up orbit performance, and context recovery. Rebuild the small checked-in profiles with `uv run python scripts/prepare_galaxy_detail.py` after preparing the full dataset. The previews are available only for the matched full DR1 catalog.

Name search is a lazy-loaded local index of **17,320 names**, with **3,181 verified, visitable matches** to existing DESI rows. It is not a name for every atlas point. Unmatched familiar names are explained without inventing positions; Milky Way visits the existing observer marker. Rebuild with `python3 scripts/download_search_sources.py`, then `uv run python scripts/prepare_galaxy_search.py`. Sources, exact reference matching, checksums, and limitations are described in [architecture](docs/architecture.md#name-search).

## Scientific conventions and attribution

This is an observer-centered reconstruction of catalog measurements, not a complete galaxy census or a simultaneous image of the universe today. Spectroscopic redshifts include peculiar velocities; comoving distance depends on a cosmological model. Screen point sizes and intensities do not encode physical galaxy sizes or luminosities. The About the data panel explains survey gaps, sampling, and uncertainty.

NGC 4026 and NGC 3982 use measured imaging size, ellipticity and Sersic profiles from their original DESI rows. Their apparent sky orientations are preserved; unknown depth assumes an oblate, transparent galaxy with intrinsic axis ratio 0.12 and one of two possible tilt directions. NGC 3982 adds illustrative spiral arms and light knots, whose pitch, phase, and brightness are not measured. Colors and display exposure are illustrative. Both models use the same comoving scale as the map, with no size exaggeration. See [model provenance and assumptions](docs/galaxy-detail.md).

See [requirements](docs/requirements.md), [architecture](docs/architecture.md), [build sequence](docs/build-plan.md), and [validation results](docs/validation.md). DESI DR1 is licensed CC BY 4.0. OpenNGC names by Mattia Verga are CC BY-SA 4.0; the derived name index carries that license. Citations, acknowledgments, and processing changes appear in [the attribution file](public/acknowledgments.txt).

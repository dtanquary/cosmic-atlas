# Cosmic Atlas

A minimal 3D explorer of **14,140,375 accepted DESI DR1 galaxy observations**, built with TypeScript, Three.js and Vite. Browse the cosmic web, inspect catalog measurements, compare distances, fly through space, and approach galaxies to reveal procedural 3D models.

The Milky Way is a separate reference model around the Solar System. **Observer** takes you to it; **Galaxy view** orbits its center, while **Our position** lets you zoom toward the Sun.

The project is being built collaboratively by Dave and **ChatGPT Astra**, through Codex. Dave supplies the product direction, visual references and hands-on feedback; Astra implements and tests the application, data tools and documentation.

## Built with ChatGPT Astra

Development began with requirements for a simple, scientifically grounded point map that could handle millions of galaxies. Astra helped choose the stack, research the coordinate conventions, and build the data pipeline and first working explorer. Dave tested the prototype and guided successive additions: distance fading, flight controls, name search, measured-shape galaxy models and the Milky Way reference.

The workflow is iterative: describe a feature or reproduce a problem, make a focused change, check the relevant data and automated tests, inspect actual browser rendering, and commit the result. The [requirements](docs/requirements.md), [architecture](docs/architecture.md), [validation evidence](docs/validation.md) and Git history record those decisions. Scientific assumptions are documented alongside their sources so contributors can review and improve them.

There is no runtime OpenAI dependency or API key requirement. ChatGPT Astra helps build the software; the atlas runs locally using prepared astronomy data and deterministic rendering code.

## Quick start: a small real-data preview

Clone this repository, then run these commands from its root. You need **Node.js 22.12 or newer**, npm, **Python 3.11 or newer**, and [uv](https://docs.astral.sh/uv/getting-started/installation/). A desktop browser with WebGL2 and hardware acceleration is required. The full-data tooling is intended for macOS/Linux; use WSL on Windows because the resumable downloader uses POSIX file writes.

```sh
npm ci
uv sync --frozen
npm run data:bootstrap
npm run dev
```

Open the URL Vite prints, normally **http://127.0.0.1:5173/**.

Bootstrap downloads small byte ranges from the official DESI catalog and builds a clearly labeled subset of real observations. It gives you the point map, navigation, selection, distance measurement and the Milky Way reference model. Catalog-wide close-up models and verified galaxy-name destinations require the full-data setup below.

**Generated catalog binaries are not in Git.** A fresh clone needs bootstrap or full preparation before it can load the map. `data:bootstrap` also changes `public/data/catalog.json` to activate the sample; treat that as a local dataset choice when reviewing changes for a commit.

Once data has been prepared, subsequent sessions only need:

```sh
npm run dev
```

There is no backend account, API key or live astronomy-service dependency while browsing. Vite serves the application and locally prepared static assets; the browser does not download the original FITS catalog.

## Prepare the full atlas

Use this path for catalog-wide model development and named galaxy visits. Allow roughly **30 GB of free disk space** for the 22.37 GB source FITS file, generated datasets, dependencies and temporary files. Full preparation can take substantial time and memory; use bootstrap for ordinary UI work. Peak preparation memory has not yet been profiled.

After `npm ci` and `uv sync --frozen`:

```sh
npm run data:download
npm run data:prepare
python3 scripts/download_search_sources.py
uv run python scripts/prepare_galaxy_search.py
npm run data:models
npm run dev
```

Run the commands in order. `data:download` is resumable: rerun it after an interruption. `data:prepare` applies the documented filters, computes Planck18 comoving distances, writes the spatial hierarchy, creates a deterministic million-object development subset, and activates the full catalog. Model preparation additionally needs the name index and SGA/OpenNGC sources from the preceding commands.

The prepared full atlas contains all **14,140,375** accepted observations. Its model sidecars add about **143 MB compressed**. The name index contains **17,320 names** and **3,181 verified catalog destinations**; an unmatched familiar name does not receive a fabricated position.

To work with the million-object subset after full preparation, open `/?dataset=development`. Full catalog model/name matching is deliberately disabled for subsets. The Milky Way reference model is available independently.

The two original individually fitted previews and the Milky Way reference data are checked in. To regenerate them:

```sh
# Requires the full source catalog and prepared DR1 metadata:
uv run python scripts/prepare_galaxy_detail.py

# Small, independent reference calculation; no DESI download needed:
uv run python scripts/prepare_milky_way.py
```

## How it works

Python, NumPy, Astropy and SciPy prepare immutable binary datasets ahead of time. The browser streams a spatial hierarchy, initially drawing a representative set of real catalog positions and revealing more as you approach. **Full detail** loads all accepted observations in view once loading completes.

The main renderer batches point geometry, uses camera-relative coordinates to retain precision at galaxy scales, and performs selection on the GPU. A Web Worker decompresses and validates chunks. The browser never creates a scene object or DOM element for every galaxy and never integrates cosmological distances during navigation.

Nearby catalog objects crossfade into bounded analytic light volumes and, where appropriate, seeded spiral arms or irregular clumps. There are at most **12 resident catalog models**, plus the fixed Milky Way reference model. Automatic display fades incidental models back to points before they fill the view. **Visit** or **Focus** keeps the chosen galaxy visible for deliberate close-ups. Settings also offers **Focused galaxy only** and **Points only**.

The visual direction is a dark, uncluttered atlas with recognizable galaxy shapes, restrained glow and varied orientations. Dense fly-through views with many small galaxy silhouettes are a future intermediate level of detail; currently distant observations remain points.

## Where to make changes

| File or directory | Responsibility |
| --- | --- |
| [`src/app.ts`](src/app.ts) | HUD markup, inspector panels, settings, control wiring and optional WebMCP actions |
| [`src/style.css`](src/style.css) | Layout, theme, responsive controls and scrolling panels |
| [`src/explorer.ts`](src/explorer.ts) | Camera/navigation, point shaders, streaming decisions, GPU picking, model pool and diagnostic probes |
| [`src/galaxy-detail.ts`](src/galaxy-detail.ts) | Shared volume renderer, measured-shape projection, model fading and seeded light geometry |
| [`src/model-catalog.ts`](src/model-catalog.ts) | Profile sidecar loading, decoding and morphology interpretation |
| [`src/milky-way.ts`](src/milky-way.ts) | Home-galaxy disk, bar, arms, bulge and arrival direction |
| [`src/galaxy-search.ts`](src/galaxy-search.ts) | Name normalization, suggestions and cancellable visits |
| [`src/loader.ts`](src/loader.ts), [`src/data.worker.ts`](src/data.worker.ts) | Chunk requests, decompression, integrity checks and data lifetimes |
| [`src/spatial.ts`](src/spatial.ts), [`src/format.ts`](src/format.ts) | Hierarchy selection, coordinate conversion, distances and display units |
| [`scripts/`](scripts) | Reproducible data downloads, preparation and independent validation |
| [`tests/`](tests) | Geometry, parsing, catalog and rendering-policy tests |
| [`src/diagnostics.ts`](src/diagnostics.ts), [`src/ui-diagnostics.ts`](src/ui-diagnostics.ts) | Development-only browser acceptance runners |

For a UI change, start with `app.ts` and `style.css`; Vite updates the page as you edit. For a camera or navigation change, start with `explorer.ts`. For galaxy appearance, use `galaxy-detail.ts` or `milky-way.ts`; keep display effects distinct from measured physical properties.

For Milky Way placement or adopted dimensions, edit `scripts/prepare_milky_way.py`, regenerate the small JSON reference, and update its sources/assumptions. For catalog formats, change the producer, consumer and validators together. Do not hand-edit generated binary chunks or their checksums.

Read [`AGENTS.md`](AGENTS.md) before contributing. Make small, coherent commits, preserve existing user work, and include the relevant tests and documentation. Raw source downloads, generated `.bin`/`.bin.gz` files, caches, dependencies and build output stay out of Git.

## Controls

| Action | Control |
| --- | --- |
| Orbit / pan / zoom | Drag / right-drag / scroll or pinch |
| Inspect a catalog galaxy | Click its point or visible body |
| Focus selection / survey overview | **F** / **R** |
| Visit by name | **Visit**, type a name, arrows to choose, **Enter** |
| Explore our galaxy | **Observer**, or search **Milky Way** with the full name index available |
| Compare two catalog distances | **Measure**, then click two galaxies |
| Configure flight | **Fly**, adjust speed, then **Start flying** |
| Manual flight | **WASD**, **Q/E**, **Shift** to accelerate; scroll changes speed |
| Release the pointer | **Escape**; the speed controls remain available |
| Slow camera pass with the mouse free | **Auto fly**; **Escape** pauses it |
| Rendering mode and distant opacity | **Settings**; display choices and opacity floor persist locally |
| Performance readout | **F8** |

Flight speed ranges from 1 parsec/sec to 10,000 megaparsecs/sec. Start low for galaxy-scale passes. The observer marker identifies the Solar System, about 26,500 light-years from the adopted Galactic center, rather than the center itself.

## Test and build

The fast tests do not require the full FITS source:

```sh
npm test
npm run test:data
```

Validate whichever point dataset you prepared:

```sh
uv run python scripts/test_data.py public/data/bootstrap
# Or, after full preparation:
uv run python scripts/test_data.py public/data/dr1
npm run test:models
```

The Python validators check compressed hashes, binary layouts, reconstructed coordinates, bounds and full leaf coverage. `test:models` requires the complete generated model sidecars.

For production output:

```sh
npm run build
npm run preview
```

`build` checks active dataset asset presence/sizes, runs strict TypeScript compilation and writes the static application to `dist/`. Preview the URL printed by Vite. A missing-data build error is intentional: prepare the active dataset first, and run the model preparation step for full DR1.

### Actual-browser checks

Run these against `npm run dev`, using a unique `run` name:

| URL query | Checks |
| --- | --- |
| `?selftest&run=my-points` | Point visibility/picking, measurement persistence, data integrity rejection and graphics recovery |
| `?hometest&run=my-milky-way` | Observer arrival, Milky Way body picking, inside/near-Sun rendering, display modes, Sun marker clipping and graphics recovery |
| `?uxtest&run=my-navigation` | Foreground obstruction, focus intent, reachable actions, delayed-search cancellation and flight controls; requires full data |
| `?modeltest&run=my-models` | All five catalog families, projected shape, body selection, automatic loading and the model pool limit; requires full data |
| `?benchmark=adaptive&run=my-overview` | 1920×1080 overview orbit: 5-second warmup, 20-second measurement |
| `?benchmark=full&run=my-full-overview` | The same benchmark with full detail in view |

Use Automatic model display for the full model suite. Keep the browser tab visible during the run. Reports appear on screen and save to `.cache/validation-<run>.json`; check the individual `passed`/result fields, not just `status: complete`. These routes and the report-saving endpoint are development-only. Return to `/` before editing to avoid rerunning a diagnostic on every hot reload.

Measured results and device-specific limitations are in [`docs/validation.md`](docs/validation.md). Performance on one GPU is not a guarantee for other hardware.

## Scientific boundaries and data credit

This is an observer-centered reconstruction of catalog measurements, not a complete census or a simultaneous snapshot of the universe. Distances are **linear comoving distances inferred with Planck18**; redshift includes local velocity effects. Survey gaps are not proof of empty space. Point size, opacity and color are navigation cues, not measured luminosity.

Of the catalog models, **12,097,577 (85.6%)** have usable measured sizes and projected ellipses. The remainder disclose an assumed 5 kpc half-light radius. **3,128** have matched visual classifications; other families are labeled approximations. Inferred depth, near side, spiral structure, clumps and colors remain illustrative. The Milky Way uses separately documented literature-based geometry and is excluded from DESI counts and pair measurements.

See [galaxy model provenance](docs/galaxy-detail.md), [Milky Way assumptions and sources](docs/milky-way.md), and [data credits and processing notes](public/acknowledgments.txt). DESI and OpenNGC-derived data have their own licenses; preserve their attribution. An application-source license has not yet been selected.

## Public hosting and project documents

The intended release is a public URL with the source shared on GitHub. The full catalog exceeds the current Sites upload limit, so public delivery needs separate object storage/CDN hosting for the data. Keep relative asset paths and manifest-pinned bytes intact. Binary gzip payloads are decompressed by the worker and must not receive an extra HTTP `Content-Encoding: gzip` layer.

The repository includes `.openai/hosting.json` for the current Sites integration; ordinary local development and `npm run build` do not require a Codex plugin or hosting account. Public deployment is not yet configured. See [public delivery](docs/public-delivery.md) before changing packaging or data origins.

- [Requirements](docs/requirements.md) and [build plan](docs/build-plan.md)
- [Architecture and coordinate conventions](docs/architecture.md)
- [Model provenance](docs/galaxy-detail.md) and [Milky Way reference](docs/milky-way.md)
- [Validation evidence](docs/validation.md) and [UI review](docs/ux-review.md)

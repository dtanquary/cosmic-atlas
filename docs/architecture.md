# Architecture

## Stack and boundaries

Vite + strict TypeScript + Three.js WebGL2. A small semantic HTML/CSS HUD owns controls; the renderer owns camera, batched point geometries, selection, and measurements. Galaxy records never become individual scene objects or DOM elements. Python/NumPy/Astropy prepare immutable static datasets; the browser never downloads FITS or computes cosmological integrals.

## Coordinate conventions

Mpc internally. Observer at zero. Equatorial coordinates: x = D cos(dec) cos(ra), y = D cos(dec) sin(ra), z = D sin(dec). North celestial pole is +z; the camera uses +z as its up vector. Distances use Astropy's Planck18 (including its radiation/neutrino parameters). A validated high-resolution lookup interpolates comoving distances for bulk conversion. Inspection and measurement retain float64 Cartesian values reconstructed from original RA/Dec and the stored derived distance. Render chunks use float32 positions relative to a float64 node center. The vertex shader subtracts camera position from node origin on the CPU before projection.

## Dataset contract v1

`manifest.json` identifies the dataset, source release/hash, filters, accepted/source counts, development subset status, cosmology, axes/units, bounds, and a flat octree. Node records contain id, bounds/center, represented count, stored point count, children, compressed point/metadata URLs, hashes and bytes. Bounds cover descendant points, not merely a sampled subset.

Point files use a 16-byte little-endian header: magic `0x43415431`, version 1, row count, reserved. Then contiguous XYZ float32 positions (3N) and uint32 stable dataset row IDs (N). Metadata files have the same header with magic `0x43414d31`; rows are 56 bytes: int64 TARGETID, float64 RA, DEC, Z, ZERR, comoving distance in Mpc, DELTACHI2. File transport is gzip, explicitly decoded in the worker. Metadata rows align with point rows. IDs are read with BigInt and shown as strings.

Node samples are deterministic hashes of real target IDs. Leaves contain all their assigned points. A render frontier contains either a parent sample or covered descendants; never both. Full detail requests all visible leaves. A parent remains visible while required descendants load. The UI distinguishes sampled coverage, full-detail loading, complete view, and failed/blocked detail. Counts mean dataset population, unique loaded render records, and points submitted for the current frame; submitted points may overlap or be clipped.

## Runtime

Flight settings visibility is UI state independent of pointer lock. Fly opens the editable speed panel; Start flying requests pointer lock. Escape ends capture but retains the panel and current speed. The slider is disabled while captured, when the wheel controls speed instead. Orbit, Milky Way, and Overview explicitly close the panel. The renderer's `onFlight` callback reports capture changes without deciding whether settings should be visible.

Auto fly is a separate, mutually exclusive movement state. The existing frame loop translates the camera and orbit target together along the camera's forward vector using the current speed and bounded frame delta. Orbit input is suspended during the straight pass, while the cursor remains free for the speed slider and stop button. Escape handles stopping before the form-control keyboard guard. Navigation/focus actions and tab hiding stop auto movement. No additional animation loop or per-galaxy work is introduced.

An abortable worker loader handles fetch, integrity checking, gzip decode, and typed arrays with transferable buffers. A bounded queue prioritizes coarse coverage and visible refinement. Resident chunks track their last use; eviction disposes GPU buffers and typed-array references. Selected metadata is independent of render residency. Memory accounting includes point arrays, corresponding GPU attributes, metadata, and in-flight reservations. Full detail stops loading with an explicit memory-limit state instead of silently changing mode.

On-demand GPU ID picking uses the same point geometry and camera as rendering, unblended integer-color IDs, and async readback. Dense IDs map back to node row metadata. The picker uses a small screen region and a larger hit radius for usability. Idle rendering stops; camera input, pending transitions, loads, and resize invalidate the frame. Tab visibility suspends animation.

Distance cues run in the existing point vertex shader with shared uniforms, without additional attributes, scene objects, or draw calls. Euclidean camera distance drives a smooth opacity fade and an optional capped 65% marker-size boost within 150 Mpc. Separate shared uniforms control fading and enlargement in both the visual and GPU ID passes; enlargement is off by default. The fade horizon expands continuously outside the catalog's bounding sphere and settles to a neighborhood range inside it. Opacity interpolates from 1 to a configurable floor. The display and ID pass discard only zero visibility, retaining even 0.5–1% floors. Annotation materials bypass the effect. Settings independently toggles fading and point enlargement, saving enlargement and the floor percentage in localStorage; positions and measurements remain unchanged. Submitted-point counts include distance-faded points.

## Catalog-wide galaxy models

`public/data/models/manifest.json` pins the DR1 source checksum, 14,140,375 observations, 1,010 profile assets, a small Gaussian library, and 3,128 exact named visual-type matches. The extractor uses the same accepted-row ordering as the existing position catalog, verifies node point/metadata hashes, and leaves those original assets untouched. Details and limitations are in [galaxy-detail.md](galaxy-detail.md).

Each gzip profile sidecar aligns one-for-one with its node's point rows. Its 16-byte little-endian header is magic `0x43415331`, version 1, count, reserved. Each 20-byte row holds float32 angular half-light radius, e1, e2, Sersic index, then uint32 flags. The low byte identifies the imaging fit (unknown/PSF/REX/EXP/DEV/SER); the next byte identifies a matched visual family (unknown/spiral/barred/elliptical/lenticular/irregular). These two classifications remain distinct. The complete sidecars are about 143 MB compressed; the model manifest is about 733 KB.

`ModelCatalog` uses a worker for checksum verification and decompression, with at most four nearby profile requests initiated by the candidate planner. Its LRU profile cache is bounded to 16 chunks and 48 MiB including reservations. Conservative per-node maximum radii avoid requesting shapes that cannot resolve on screen. At most every 250 ms during movement, or after relevant loads, the renderer scans packed positions only in nearby displayed chunks and ranks projected radii. Metadata is fetched only for the small selected/nearby set, supplying exact float64 centers and target IDs. Profile failures leave the point atlas available and expose Retry.

At most **12** resolved models are resident. The two original individually fitted previews stay pinned; the remaining slots favor the current selection and largest projected nearby galaxies. Removed models dispose their GPU geometry and materials. Generic structured models use one batched geometry of 12,000 light knots; NGC 3982 retains its 24,000-knot preview. There are no individual star objects or catalog-sized scene graphs. Combined CPU/GPU point, slot, metadata, profile cache, in-flight reservation and model attributes contribute to the existing managed memory accounting.

Each smooth volume analytically integrates at most 20 oblate Gaussian components along the front half of each camera ray. A conservative screen rectangle bounds each volume to one draw call when visible. Spiral/barred/irregular structure adds one batched draw. Double-precision CPU subtraction supplies camera-relative coordinates, allowing galaxy-scale precision and entry into the volume. Generic Sersic fits use the nearest library index in 0.1 steps; the original two profiles retain their individual fits.

Projected half-light radius drives the point/model crossfade from 1 to 8 CSS pixels. A float slot attribute per point (zero normally) indexes the small active-model origin/blend uniform arrays. Only matching rows are updated when model residency changes. This avoids testing every vertex against a list of models. The original dense ID and node-row picker are retained, and an analytic body hit test supports selecting the visible galaxy away from its center.

Distance cues shorten the point fade horizon around resolved galaxies. With a zero floor, node bounds beyond that horizon are culled before requesting/submitting points. Positive opacity floors bypass that distance cull; normal frustum culling, adaptive budgets and memory limits remain active. The volume has an independent near-plane calculation. Orbit supports a 10-parsec minimum distance and flight speed down to 1 parsec/sec.

## Name search

Visit lazily loads the 1.46 MB `galaxy-search.json` once. Its 17,320 entries combine SGA NGC/IC/UGC names and OpenNGC galaxy aliases; 3,181 have verified visit destinations. The source checksum and catalog ID must match the active full DR1 manifest. The search normalizes case, spacing, padded numbers, and Messier aliases, ranks exact matches before prefixes and substrings, and displays at most eight suggestions. The empty search suggests the observer and nearby examples spanning the five model families, plus M 109. There is no runtime astronomy-service query or DOM element per catalog galaxy.

`scripts/download_search_sources.py` obtains three filtered SGA FITS downloads (NGC, IC and UGC) and OpenNGC aliases. `scripts/prepare_galaxy_search.py` joins accepted DESI rows through exact `REF_CAT=L3` and `REF_ID=SGA_ID`, requires agreement within 3 arcsec of the SGA center, then prefers the closest central match (redshift-fit significance breaks ties). This avoids linking a nearby knot as the galaxy center. The script verifies leaf point/metadata checksums and exact target IDs, retaining the existing derived distance, leaf node and row. Source hashes are recorded in the name index. OpenNGC-derived names are credited to Mattia Verga, CC BY-SA 4.0; the derived index carries that license.

Entries without such matches remain searchable with an explicit unavailable explanation; no coordinate or distance is invented. This small named subset is not the percentage of all atlas galaxies that are cataloged. Visiting a result loads its checksum-verified metadata through the existing worker, checks the exact target ID again, and selects/focuses it. Navigation serials prevent a late metadata result overriding a newer camera action. The Milky Way result calls `visitMilkyWay` to focus the sourced Galactic center. The observer marker stays at zero.

## Delivery

Static build in `dist`, with a Sites static hosting manifest. Raw downloads, local caches, and generated binary assets stay outside Git; manifests pin the checksum-verified datasets generated from the documented source before packaging. A saved deployment must contain the exact validated generated assets. The application performs no runtime calls to astronomy services and stores no personal data.

## Model visibility and navigation intent

`ResolvedGalaxy.update` combines ordinary point-to-model LOD with a viewport-relative obstruction fade for incidental models. Its single blend drives volume light, arm/clump light, and the complementary catalog point; suppressed bodies do not intercept picking. `Explorer` tracks explicit galaxy focus separately from inspection, protects both identities within the existing 12-model pool, and clears focus intent on observer/overview navigation. Points-only and focused-only display skip automatic candidate scans. Offscreen models reset their blend so they cannot shorten the distance-fading horizon.

A focused galaxy's angular scale also determines its local distance-fading horizon independently of display mode, so points-only does not brighten the distant background. Name search supplies `visitCatalog` a current-intent guard checked before and after asynchronous work; the guard includes dialog visibility and request identity, covering the gap before a native dialog's queued close event. The inspector separates its fixed identity/actions header from its scrolling detail body.

## Milky Way reference integration

`GalaxyVolume` owns the reusable light rendering. `ResolvedGalaxy` supplies a catalog identity and measured sky deprojection; `MilkyWay` supplies independent reference geometry generated by Astropy. The fixed home model adds a disk, bulge and one 32,000-knot batch (three draws, 1,792,000 tracked geometry bytes) beside the existing maximum of 12 resident catalog models. It never enters point IDs, metadata, sidecar counts, or pair measurements.

The observer origin is the Solar System, not the Galactic center. `homeFocused` controls its close-up exemption separately from catalog focus; `homeSelected` controls the reference inspector while preserving the previous catalog selection. The Milky Way toolbar action and name search use `visitMilkyWay` to focus the Galactic center from 60 kpc with an oblique disk view. Only the explicit Sun / Observer action uses `focusObserver` to target the origin. `homeView` derives the active focus from the real orbit target, clearing the active indicator after a pan. Separate core and Sun annotations retain their physical positions; the core label is suppressed when the two labels would overlap. Ordinary catalog selection restores the normal inspector. Points-only still hides the reference volumes. The camera near plane adapts down at local scales so the Sun marker is not clipped when zooming to the 10 pc orbit minimum.

See [the sourced reference model](milky-way.md) for coordinates, assumptions and reproduction. `?hometest` exercises the real toolbar, search, wheel zoom and separate Sun focus before checking reference-body picking, inside/near-Sun rendering, display choices, marker clipping, data preservation and graphics recovery.

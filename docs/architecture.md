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

Flight settings visibility is UI state independent of pointer lock. Fly opens the editable speed panel; Start flying requests pointer lock. Escape ends capture but retains the panel and current speed. The slider is disabled while captured, when the wheel controls speed instead. Orbit, Observer, and Overview explicitly close the panel. The renderer's `onFlight` callback reports capture changes without deciding whether settings should be visible.

Auto fly is a separate, mutually exclusive movement state. The existing frame loop translates the camera and orbit target together along the camera's forward vector using the current speed and bounded frame delta. Orbit input is suspended during the straight pass, while the cursor remains free for the speed slider and stop button. Escape handles stopping before the form-control keyboard guard. Navigation/focus actions and tab hiding stop auto movement. No additional animation loop or per-galaxy work is introduced.

An abortable worker loader handles fetch, integrity checking, gzip decode, and typed arrays with transferable buffers. A bounded queue prioritizes coarse coverage and visible refinement. Resident chunks track their last use; eviction disposes GPU buffers and typed-array references. Selected metadata is independent of render residency. Memory accounting includes point arrays, corresponding GPU attributes, metadata, and in-flight reservations. Full detail stops loading with an explicit memory-limit state instead of silently changing mode.

On-demand GPU ID picking uses the same point geometry and camera as rendering, unblended integer-color IDs, and async readback. Dense IDs map back to node row metadata. The picker uses a small screen region and a larger hit radius for usability. Idle rendering stops; camera input, pending transitions, loads, and resize invalidate the frame. Tab visibility suspends animation.

Distance cues run in the existing point vertex shader with shared uniforms, without additional attributes, scene objects, or draw calls. Euclidean camera distance drives a smooth opacity fade and a capped 65% marker-size boost within 150 Mpc. The fade horizon expands continuously outside the catalog's bounding sphere and settles to a neighborhood range inside it. Opacity interpolates from 1 to a configurable floor. The display and ID pass discard only zero visibility, retaining even 0.5–1% floors. Annotation materials bypass the effect. Settings toggles the cues and saves the floor percentage in localStorage; positions and measurements remain unchanged. Submitted-point counts include distance-faded points.

## Resolved galaxy prototypes

Two optional JSON sidecars, about 3 KB each, match NGC 4026 and NGC 3982 to exact DR1 dense IDs, target IDs and source checksum. The raw source's imaging shape columns are recovered by a reproducible Python extractor; existing spatial data is unchanged. Subset datasets do not enable these models. Shape conventions, deprojection equations, fit accuracy and limitations are documented in [galaxy-detail.md](galaxy-detail.md).

The renderer analytically integrates an oblate Gaussian light volume (19 or 17 active components) along each camera ray. A conservative screen rectangle bounds each volume to one draw call when visible. NGC 3982 adds one batched draw of 24,000 deterministic light knots arranged in illustrative logarithmic spiral arms. These require about 1.28 MiB of combined CPU/GPU attributes, allocated once. No individual star objects, textures, ray-marching loop or per-frame catalog scan are added. Double-precision CPU subtraction supplies camera-relative coordinates. Half-ray integrals allow the camera to enter and leave the volume.

Projected half-light radius drives a smooth transition from 1 to 8 CSS pixels. A one-time ID lookup per loaded chunk sets two special-row uniforms; each matched row uses the exact model center and complementary display opacity. Arms share their volume's transition. Picking retains each point ID, and an analytic body hit test provides selection away from the center. Both paths feed the existing selection and measurement logic.

Distance cues shorten the point fade horizon smoothly around resolved galaxies. With a zero floor, entire node bounds beyond that horizon are culled before requesting/submitting points. A positive floor bypasses this distance cull so the faint background survives; normal frustum culling, adaptive budgets, and memory limits remain active. Disabling distance cues restores the normal visible point frontier. Orbit supports a 10-parsec minimum distance, and flight speed can go down to 1 parsec/sec. The volume does not depend on the point camera's near plane.

## Name search

Visit lazily loads the 1.46 MB `galaxy-search.json` once. Its 17,320 entries combine SGA NGC/IC/UGC names and OpenNGC galaxy aliases; 3,181 have verified visit destinations. The source checksum and catalog ID must match the active full DR1 manifest. The search normalizes case, spacing, padded numbers, and Messier aliases, ranks exact matches before prefixes and substrings, and displays at most eight suggestions. The empty search suggests the observer and five nearby named targets. There is no runtime astronomy-service query or DOM element per catalog galaxy.

`scripts/download_search_sources.py` obtains three filtered SGA FITS downloads (NGC, IC and UGC) and OpenNGC aliases. `scripts/prepare_galaxy_search.py` joins accepted DESI rows through exact `REF_CAT=L3` and `REF_ID=SGA_ID`, requires agreement within 3 arcsec of the SGA center, then prefers the closest central match (redshift-fit significance breaks ties). This avoids linking a nearby knot as the galaxy center. The script verifies leaf point/metadata checksums and exact target IDs, retaining the existing derived distance, leaf node and row. Source hashes are recorded in the name index. OpenNGC-derived names are credited to Mattia Verga, CC BY-SA 4.0; the derived index carries that license.

Entries without such matches remain searchable with an explicit unavailable explanation; no coordinate or distance is invented. This small named subset is not the percentage of all atlas galaxies that are cataloged. Visiting a result loads its checksum-verified metadata through the existing worker, checks the exact target ID again, and selects/focuses it. Navigation serials prevent a late metadata result overriding a newer camera action. The Milky Way result focuses the existing observer marker at zero.

## Delivery

Static build in `dist`, with a Sites static hosting manifest. Raw downloads, local caches, and generated binary assets stay outside Git; manifests pin the checksum-verified datasets generated from the documented source before packaging. A saved deployment must contain the exact validated generated assets. The application performs no runtime calls to astronomy services and stores no personal data.

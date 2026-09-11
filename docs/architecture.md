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

An abortable worker loader handles fetch, integrity checking, gzip decode, and typed arrays with transferable buffers. A bounded queue prioritizes coarse coverage and visible refinement. Resident chunks track their last use; eviction disposes GPU buffers and typed-array references. Selected metadata is independent of render residency. Memory accounting includes point arrays, corresponding GPU attributes, metadata, and in-flight reservations. Full detail stops loading with an explicit memory-limit state instead of silently changing mode.

On-demand GPU ID picking uses the same point geometry and camera as rendering, unblended integer-color IDs, and async readback. Dense IDs map back to node row metadata. The picker uses a small screen region and a larger hit radius for usability. Idle rendering stops; camera input, pending transitions, loads, and resize invalidate the frame. Tab visibility suspends animation.

## Delivery

Static build in `dist`, with a Sites static hosting manifest. Raw downloads, local caches, and generated binary assets stay outside Git; manifests pin the checksum-verified datasets generated from the documented source before packaging. A saved deployment must contain the exact validated generated assets. The application performs no runtime calls to astronomy services and stores no personal data.

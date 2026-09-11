# Cosmic Atlas requirements

Build a minimal desktop-browser explorer that makes the quantity, arrangement, and distances of measured galaxies understandable. The audience is a curious non-specialist. Scientific honesty, simple controls, a clean dark science-fiction aesthetic, and smooth navigation take priority.

## Agreed behavior

- A full-window point cloud of DESI DR1 galaxies. No generated galaxies, compressed spatial axes, decorative star field, or implied physical galaxy sizes.
- Orbit/pan/zoom by default, optional pointer-lock WASD flight, vertical movement, speed adjustment, focus on selection, and overview reset.
- Click a visible point for its exact DESI target ID, measured sky position, redshift and fitting error, derived comoving distance, and provenance.
- Measure the estimated comoving separation between two selected galaxies. Preserve measurements through loading and detail changes.
- Adaptive detail by default; explicit full detail includes every accepted galaxy in the view after loading, even when frame rate falls. Never silently call a sampled view complete.
- Light-years displayed by default, optional Mpc. Observer marker and a scale reference at focus depth.
- Near-black background, off-white points, a restrained cyan accent, quiet borders, readable controls, and collapsible details. No galaxy artwork in v1.
- Desktop Chrome is the primary performance browser. Desktop Safari and Firefox are compatibility targets; mobile controls are deferred.

## Data and scientific meaning

Source: DESI DR1 iron `zall-pix-iron.fits`. Accept primary records with `SPECTYPE=GALAXY`, `OBJTYPE=TGT`, `ZWARN=0`, valid RA/Dec, and finite positive redshift. Use all survey programs represented in that primary catalog. Assert unique target IDs. These are catalog quality filters, not a guarantee of an error-free or volume-complete scientific sample.

Use Astropy Planck18 comoving distances and equatorial Cartesian axes in Mpc. Preserve source redshifts; do not apply undocumented velocity or frame corrections. Radial peculiar velocities and measurement errors affect inferred positions. The observations sample different lookback times; the map is not a simultaneous measurement of the universe today. Unsurveyed space and survey selection effects must not be described as confirmed empty space. Point sizes are screen markers, not galaxy diameters or luminosities. Redshift fitting errors do not include all distance/model uncertainties.

The development subset is explicitly labeled. A full-detail development subset remains a subset of the release. Final catalog counts come from the importer, not hardcoded survey summary figures.

## Acceptance targets

- On the local M3 Max, Chrome at 1920×1080 drawing resolution: adaptive navigation approximately 60 FPS, p95 frame time below 20 ms after warmup.
- First navigable coarse view within 3 seconds at 100 Mbps; progressive refinement continues without blocking navigation.
- Managed CPU/GPU allocations below 768 MiB adaptive and 1.5 GiB full detail. Report full-detail performance separately.
- Verify source filtering, exact IDs, coordinate conventions, distance accuracy, binary round trips, LOD coverage, GPU picking, measurement stability, loading failures, context loss, and cache bounds.
- Record measured results and limitations separately from these targets.

## Deferred

Galaxy artwork and diameters, stars and planets, inferred populations, cosmological/time simulations, search, merged catalogs, accounts, public access, and mobile-first navigation.

Sources: https://data.desi.lbl.gov/doc/releases/dr1/ ; https://data.desi.lbl.gov/doc/organization/ ; https://docs.astropy.org/en/stable/api/astropy.cosmology.realizations.Planck18.html ; https://data.desi.lbl.gov/doc/acknowledgments/

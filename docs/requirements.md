# Cosmic Atlas requirements

Build a minimal desktop-browser explorer that makes the quantity, arrangement, and distances of measured galaxies understandable. The audience is a curious non-specialist. Scientific honesty, simple controls, a clean dark science-fiction aesthetic, and smooth navigation take priority.

## Agreed behavior

- A full-window point cloud of DESI DR1 galaxies. No generated catalog galaxies, compressed spatial axes, or decorative star field. Point markers do not imply physical size.
- Orbit/pan/zoom by default, optional pointer-lock WASD flight, vertical movement, speed adjustment, focus on selection, and overview reset.
- An Observer button focuses the observer marker at the coordinate origin from any view, leaving flight and preserving galaxy selections and measurements.
- Flight settings open before pointer capture. Start flying explicitly enters flight; Escape releases the mouse while keeping the speed slider available. Orbit closes flight settings. Scrolling adjusts speed during flight.
- Auto fly moves straight forward at the current flight speed without capturing the pointer. Speed remains editable during movement. Its toggle and Escape stop it; changing navigation mode, focusing, opening dialogs, or hiding the tab stops it too.
- Click a visible point for its exact DESI target ID, measured sky position, redshift and fitting error, derived comoving distance, and provenance.
- Measure the estimated comoving separation between two selected galaxies. Preserve measurements through loading and detail changes.
- Adaptive detail by default; explicit full detail includes every accepted galaxy in the view after loading, even when frame rate falls. Never silently call a sampled view complete.
- Light-years displayed by default, optional Mpc. Observer marker and a scale reference at focus depth.
- Near-black background, off-white points, a restrained cyan accent, quiet borders, readable controls, and collapsible details.
- Two resolved galaxy prototypes: NGC 4026 has a smooth lenticular light profile; NGC 3982 adds illustrative spiral arms. Both automatically crossfade from points as their angular size increases. Use measured sky orientation and size, preserve map scale, and distinguish inferred depth, arm structure, and display colors from measurements. Other galaxies remain points.
- Visit opens a local name search with autocomplete, keyboard selection, and popular/nearby suggestions. Resolve names only to verified existing catalog observations and explicitly explain unmatched names. The Milky Way suggestion visits the observer. Resolved bodies support inspection and measurement under their existing identities; observer-facing view restores orientation from our direction. Flight controls include galaxy-scale speeds.
- Camera-distance display cues: distant points fade smoothly; nearby points have opaque centers and grow modestly. Settings can restore uniform points or set a saved minimum distant opacity from 0–100%, in 0.5% steps. Positive floors retain faint background points and their pick hits; 0% allows disappearance. Selection rings and measurements remain readable.
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

Additional galaxy types and broad resolved-galaxy coverage, measured arm/dust/star structure, planets, inferred populations, cosmological/time simulations, merged position catalogs, accounts, public access, and mobile-first navigation.

Sources: https://data.desi.lbl.gov/doc/releases/dr1/ ; https://data.desi.lbl.gov/doc/organization/ ; https://docs.astropy.org/en/stable/api/astropy.cosmology.realizations.Planck18.html ; https://data.desi.lbl.gov/doc/acknowledgments/

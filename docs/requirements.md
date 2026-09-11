# Cosmic Atlas requirements

Build a minimal desktop-browser explorer that makes the quantity, arrangement, and distances of measured galaxies understandable. The audience is a curious non-specialist. Scientific honesty, simple controls, a clean dark science-fiction aesthetic, and smooth navigation take priority.

## Agreed behavior

- A full-window point cloud of DESI DR1 galaxies. Add the six sourced nearby galaxies as a separate layer. No generated catalog galaxies, compressed spatial axes, or decorative star field. Point markers do not imply physical size.
- Orbit/pan/zoom by default, optional pointer-lock WASD flight, vertical movement, speed adjustment, focus on selection, and overview reset.
- A Milky Way button opens a close-up centered on the Galactic core, leaving flight and preserving catalog selections and measurements. A separate Sun / Observer action focuses the Solar System at the coordinate origin.
- Flight settings open before pointer capture. Start flying explicitly enters flight; Escape releases the mouse while keeping the speed slider available. Orbit closes flight settings. Scrolling adjusts speed during flight.
- Auto fly moves straight forward at the current flight speed without capturing the pointer. Speed remains editable during movement. Its toggle and Escape stop it; changing navigation mode, focusing, opening dialogs, or hiding the tab stops it too.
- Click a visible survey point for its exact DESI target ID, measured sky position, redshift and fitting error, derived comoving distance, and provenance. Nearby-layer points instead expose a separate identity, independent distance, quoted uncertainty and source.
- Measure the estimated comoving separation between two selected galaxies. Preserve measurements through loading and detail changes.
- Adaptive detail by default; explicit full detail submits every accepted observation in the view after loading, even when frame rate falls. The disclosed local-distance safeguard still applies. Never silently call a sampled view complete.
- Light-years displayed by default, optional Mpc. Observer marker and a scale reference at focus depth.
- Near-black background, off-white points, a restrained cyan accent, quiet borders, readable controls, and collapsible details.
- Every accepted galaxy outside the local-distance safeguard supports an automatically streamed close-up model. Provide spiral, barred spiral, elliptical, lenticular and irregular variants. In Catalog types appearance, use recorded visual types where matched; label other choices as approximations. Default to the requested temporary All spirals appearance, with the override clearly disclosed and source classifications preserved. Preserve usable measured size and sky ellipse. Missing shapes use a clearly disclosed 5 kpc comoving half-light radius and unknown orientation. Retain the original NGC 4026 and NGC 3982 previews.
- Distant objects stay as points; a fixed pool of at most 12 resident DESI close-up models protects navigation performance; six fixed nearby models use the same visibility policies. Candidate searches operate on nearby resident chunks, not on the entire catalog each frame. Model bodies and point markers keep the same exact catalog identities.
- Visit opens a local name search with autocomplete, keyboard selection, and popular/nearby suggestions. Resolve names to verified DESI observations or independently sourced nearby entries and explicitly explain unmatched names. The Milky Way suggestion focuses the Galactic core. Resolved bodies support inspection and measurement under their existing identities; observer-facing view restores orientation from our direction. Flight controls include galaxy-scale speeds.
- Camera-distance display cues: distant points fade smoothly; nearby points have opaque centers. A separate, saved Enlarge nearby points toggle is off by default and optionally restores modest marker growth. It works independently of distance fading and never resizes galaxy models. Settings can disable fading or set a saved minimum distant opacity from 0–100%, in 0.5% steps. Positive floors retain faint background points and their pick hits; 0% allows disappearance. Selection rings and measurements remain readable.
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

Measured arm/dust/star structure, planets, inferred populations, cosmological/time simulations, merged position catalogs, accounts and mobile-first navigation. Public web hosting and a public GitHub source repository are the agreed delivery goal; the catalog needs a separate asset-hosting path.

Sources: https://data.desi.lbl.gov/doc/releases/dr1/ ; https://data.desi.lbl.gov/doc/organization/ ; https://docs.astropy.org/en/stable/api/astropy.cosmology.realizations.Planck18.html ; https://data.desi.lbl.gov/doc/acknowledgments/

## Clear close-up navigation

Automatic galaxy models fade back to catalog points when their projected half-light radius grows from 6% to 16% of the shorter viewport dimension. A galaxy deliberately opened with Visit or Focus remains fully resolved, including inside its volume. Milky Way and Overview clear a catalog galaxy's focus exemption while preserving inspection and measurement. Settings offers Automatic, Focused galaxy only, and Points only; the choice persists locally. Rendering visibility never changes measured positions, sizes, or catalog completeness.

Primary inspector actions must remain reachable while detail content scrolls. Dismissing or reopening name search must invalidate its pending navigation; older requests must not move the camera, close a new dialog, or disable its input. Model-display choices must preserve local distance fading around an intentionally focused galaxy.

Name search must distinguish recognized names from verified visit locations. Unavailable names appear as readable explanatory content, never selectable visit options; counts and empty-state messages must agree with the displayed matches. Only available destinations participate in arrow/Enter navigation. An unavailable or unknown query offers Browse available galaxies to restore usable suggestions without inventing positions.

## Milky Way and visual direction

The Milky Way is a fixed reference model available with every dataset. The observer is the Solar System at the origin; the Galactic center and plane use a pinned, sourced reference frame. Milky Way arrives 60 kpc from the Galactic core in an oblique view and keeps that core centered while zooming and orbiting. The inspector highlights Galactic core or Sun / Observer focus; the latter explicitly targets the origin. Both preserve the home model during close-up navigation. The home inspector distinguishes adopted literature dimensions from illustrative structure, has no DESI ID/redshift, and cannot create catalog pair measurements. Catalog counts are unchanged.

The user's supplied galaxy-field image establishes the longer-term fly-through direction: dark space, restrained glow, many recognizable small galaxy shapes and varied orientations. A future intermediate silhouette level should bridge points and full models within a bounded draw budget; it is not yet implemented.

## Uncertain local redshift positions

Hide catalog positions with inferred observer distance below 1 Mpc by default. This conservative display safeguard prevents near-zero redshifts from being presented as confirmed galaxies embedded in the Milky Way; it is not a scientific distance-reliability boundary. Keep the full original records, positions, IDs and accepted count. The HUD discloses the current policy and distinguishes catalog totals from submitted points.

Settings offers a saved **Show uncertain local positions** option. Revealed records use amber points with uncertainty text in the inspector; never construct physical galaxy models from these distances. Hidden positions must have no point/picking coverage, selection rings or measurement lines, regardless of distance fading or its opacity floor. Preserve an already inspected record and measurement values, but label their distance/separation as unreliable and disable focus while hidden. Neither this safeguard nor its toggle changes the sourced Milky Way reference geometry or its markers. The six independently measured nearby entries bypass this redshift-only safeguard and retain their own provenance; they do not correct or remove the uncertain DESI records.

## Nearby reference catalog

Include Andromeda, Triangulum, the Large and Small Magellanic Clouds, M32 and M110 with sourced redshift-independent distances. They must be searchable, visitable, inspectable and measurable in full and subset datasets, even without the DESI name index. Keep the six-entry count separate and preserve every original DESI observation. The combined view is not a globally deduplicated census. No fabricated redshifts or DESI target IDs.

Preserve cited projected shapes where available and disclose size/orientation assumptions, especially for the Clouds. Label local and mixed-source separations accurately and disclose that errors are not propagated. Keep rendering/picking batched and bounded; the current nearby layer is capped at 12 entries pending a streaming design. See [sources and reproduction](nearby-galaxies.md).

## Spiral appearance and continuous background models

Default to spiral illustrations for every DESI and nearby-layer model. Settings offers a saved Galaxy appearance choice to restore Catalog types. Preserve adopted coordinates, distance, radius and projected sky ellipse; disclose the illustrative morphology, light profile and depth. Keep the separate Milky Way spiral reference intact.

Resolve models across a 0.6–5 CSS-pixel half-light-radius range, approximately 60% farther away than before. Prefetch earlier, retain resident models across point-frontier changes, and avoid near-equal candidates constantly replacing each other. Fade automatic pool arrivals and departures over 0.6 seconds, preserving the maximum of 12 resident DESI models and consistent point/body selection. Verify the reported Andromeda orbit with actual streaming; increasing distance alone is insufficient to fix visible model eviction.

# Cosmic Atlas requirements

Build a minimal browser explorer that makes the quantity, arrangement, and distances of measured galaxies understandable, with desktop and phone controls. The audience is a curious non-specialist. Scientific honesty, simple controls, a clean dark science-fiction aesthetic, and smooth navigation take priority.

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
- Every accepted galaxy outside the local-distance safeguard supports an automatically streamed close-up model. Provide spiral, barred spiral, elliptical, lenticular and irregular variants. In Catalog types appearance, use recorded visual types where matched; label other choices as approximations. Default to image-inspired models for verified road-trip targets and spiral illustrations elsewhere, with the override clearly disclosed and source classifications preserved. Preserve usable measured size and sky ellipse. Missing shapes use a clearly disclosed 5 kpc comoving half-light radius and unknown orientation. Retain the original NGC 4026 and NGC 3982 previews.
- Distant objects stay as points; a fixed pool of at most 12 resident DESI close-up models protects navigation performance; six fixed nearby models use the same visibility policies. Candidate searches operate on nearby resident chunks, not on the entire catalog each frame. Model bodies and point markers keep the same exact catalog identities.
- Visit opens a local name search with autocomplete, keyboard selection, and popular/nearby suggestions. Resolve names to verified DESI observations or independently sourced nearby entries and explicitly explain unmatched names. The Milky Way suggestion focuses the Galactic core. Resolved bodies support inspection and measurement under their existing identities; observer-facing view restores orientation from our direction. Flight controls include galaxy-scale speeds.
- Camera-distance display cues: distant points fade smoothly; nearby points have opaque centers. A separate, saved Enlarge nearby points toggle is off by default and optionally restores modest marker growth. It works independently of distance fading and never resizes galaxy models. Settings can disable fading or set a saved minimum distant opacity from 0–100%, in 0.5% steps, defaulting to 0.5%. Existing saved choices, including 0%, take precedence. Positive floors retain faint background points and their pick hits; 0% allows disappearance. Selection rings and measurements remain readable.
- Desktop Chrome is the primary performance browser. Desktop Safari and Firefox are compatibility targets. Phone controls are implemented as described below; simulated Chrome/WebKit journeys are verified separately from physical-device performance.

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

Measured arm/dust/star structure, planets, inferred populations, cosmological/time simulations, merged position catalogs and accounts remain deferred. The [improvement plan](roadmap-2026-09-14.md) sequences further tour, mobile-performance and exploration work; its [implementation record](implementation-2026-09-14.md) distinguishes planned work from verified behavior. Public web hosting and a public GitHub source repository are the agreed delivery goal. The full catalog can use the same Cloudflare Pages deployment while it fits the documented asset limits; never reduce coverage to fit. Original code is MIT licensed; data and third-party attribution retain their separate terms. Personal deployment details stay in ignored local configuration.

Sources: https://data.desi.lbl.gov/doc/releases/dr1/ ; https://data.desi.lbl.gov/doc/organization/ ; https://docs.astropy.org/en/stable/api/astropy.cosmology.realizations.Planck18.html ; https://data.desi.lbl.gov/doc/acknowledgments/

## Clear close-up navigation

Automatic galaxy models fade back to catalog points when their projected half-light radius grows from 6% to 16% of the shorter viewport dimension. A galaxy deliberately opened with Visit or Focus remains fully resolved, including inside its volume. Milky Way and Overview clear a catalog galaxy's focus exemption while preserving inspection and measurement. Settings offers Automatic, Focused galaxy only, and Points only; the choice persists locally. Rendering visibility never changes measured positions, sizes, or catalog completeness.

Primary inspector actions must remain reachable while detail content scrolls. Dismissing or reopening name search must invalidate its pending navigation; older requests must not move the camera, close a new dialog, or disable its input. Model-display choices must preserve local distance fading around an intentionally focused galaxy.

Name search must distinguish recognized names from verified visit locations. Unavailable names appear as readable explanatory content, never selectable visit options; counts and empty-state messages must agree with the displayed matches. Only available destinations participate in arrow/Enter navigation. An unavailable or unknown query offers Browse available galaxies to restore usable suggestions without inventing positions.

## Milky Way and visual direction

The home model uses Andromeda telescope imagery as a visual guide for a continuous stellar disk, fine dust lanes, restrained warm central light and muted blue outer arms. Preserve Milky Way geometry and a softer barred center; disclose the reconstructed appearance. Dust and starlight must work from either side and inside the disk, with bounded allocations and no bright point-sampled bar.

The Milky Way is a fixed reference model available with every dataset. The observer is the Solar System at the origin; the Galactic center and plane use a pinned, sourced reference frame. Milky Way arrives 60 kpc from the Galactic core in an oblique view and keeps that core centered while zooming and orbiting. The inspector highlights Galactic core or Sun / Observer focus; the latter explicitly targets the origin. Both preserve the home model during close-up navigation. The home inspector distinguishes adopted literature dimensions from illustrative structure, has no DESI ID/redshift, and cannot create catalog pair measurements. Catalog counts are unchanged.

The user's supplied galaxy-field image establishes the longer-term fly-through direction: dark space, restrained glow, many recognizable small galaxy shapes and varied orientations. A future intermediate silhouette level should bridge points and full models within a bounded draw budget; it is not yet implemented.

## Uncertain local redshift positions

Hide catalog positions with inferred observer distance below 1 Mpc by default. This conservative display safeguard prevents near-zero redshifts from being presented as confirmed galaxies embedded in the Milky Way; it is not a scientific distance-reliability boundary. Keep the full original records, positions, IDs and accepted count. The HUD discloses the current policy and distinguishes catalog totals from submitted points.

Settings offers a saved **Show uncertain local positions** option. Revealed records use amber points with uncertainty text in the inspector; never construct physical galaxy models from these distances. Hidden positions must have no point/picking coverage, selection rings or measurement lines, regardless of distance fading or its opacity floor. Preserve an already inspected record and measurement values, but label their distance/separation as unreliable and disable focus while hidden. Neither this safeguard nor its toggle changes the sourced Milky Way reference geometry or its markers. The six independently measured nearby entries bypass this redshift-only safeguard and retain their own provenance; they do not correct or remove the uncertain DESI records.

## Nearby reference catalog

Include Andromeda, Triangulum, the Large and Small Magellanic Clouds, M32 and M110 with sourced redshift-independent distances. They must be searchable, visitable, inspectable and measurable in full and subset datasets, even without the DESI name index. Keep the six-entry count separate and preserve every original DESI observation. The combined view is not a globally deduplicated census. No fabricated redshifts or DESI target IDs.

Preserve cited projected shapes where available and disclose size/orientation assumptions, especially for the Clouds. Label local and mixed-source separations accurately and disclose that errors are not propagated. Keep rendering/picking batched and bounded; the current nearby layer is capped at 12 entries pending a streaming design. See [sources and reproduction](nearby-galaxies.md).

## Spiral appearance and continuous background models

Default to spiral illustrations for DESI and nearby-layer galaxies, with dedicated cloud illustrations for the LMC and SMC requested for the road trip. Settings offers a saved Galaxy appearance choice to restore Catalog types. Preserve adopted coordinates, distance, radius and projected sky ellipse; disclose the illustrative morphology, light profile and depth. Keep the separate Milky Way spiral reference intact.

Resolve models across a 0.6–5 CSS-pixel half-light-radius range, approximately 60% farther away than before. Prefetch earlier, retain resident models across point-frontier changes, and avoid near-equal candidates constantly replacing each other. Fade automatic pool arrivals and departures over 0.6 seconds, preserving the maximum of 12 resident DESI models and consistent point/body selection. Verify the reported Andromeda orbit with actual streaming; increasing distance alone is insufficient to fix visible model eviction.

## Subtle galaxy colors

Use restrained per-galaxy color variation, spanning blue-white to soft ivory with warmer centers and faint pink accents. Assign a stable palette from the exact target identity, including nearby namespaces, so camera motion, streaming, appearance changes and reloads do not change it. Treat this as an illustrative stellar-population-inspired palette, not measured photometry, inferred age, dust or redshift color. Keep palette luminance controlled, geometry/measurement data unchanged and rendering allocations/draw counts bounded.

## Similar galaxy variants

Use the existing common spiral as the size and brightness template for four additional illustrations: fine multi-arm, ringed, tightly wound and feathered spirals. Mix them into the default appearance with stable identity-based assignment. Preserve the common light profile, exposure, radial sample distribution, depth and light-sample budget; avoid bright concentrated cores or blob-like substitutes. Keep source morphology and measurements separate from the illustration. Verify both total brightness and concentrated highlights at multiple viewing angles, plus existing model continuity and selection.

## Experimental cosmic microwave background shell

Offer an off-by-default, saved CMB shell toggle in the map toolbar and Settings. Use the same linear comoving scale as the catalog and the Sun / Observer as the fixed center. A separate View cosmic scale action frames the complete sphere; toggling visibility alone preserves the camera, selection and measurements. Keep the ordinary survey overview available.

The faint shell represents the approximate last-scattering surface at rounded z = 1090 in Planck18 (45.3 billion light-years today), not a physical edge or the entire universe's extent. Disclose the inferred radius and illustrative shell/grid, with no measured temperature map. Show the active catalog's radial reach only, explicitly distinguished from the fraction of galaxies mapped. Preserve bounded rendering and all catalog counts, IDs and picking. See [reference and sources](cosmic-horizon.md).

## Lookback time

Show how long ago the light we see now left each depth: a footer line for the focus depth, an inspector row for the selected galaxy, and an optional saved **Lookback time rings** overlay in Settings, off by default, with no new toolbar button. Use Astropy Planck18 lookback times from a generated table; the browser only interpolates. Rings are observer-centered silhouettes labeled with the lookback time and the present-day comoving distance, at most eight, culled to stay legible. Disclose that lookback time is model-dependent, that comoving distance is not the distance the light traveled, and that nearby-layer values are distance ÷ c from direct measurements. Hide the inspector row for uncertain local positions. Rings add one draw when visible and zero when off; they never enter picking, counts or measurements.

## Survey footprint

Offer an off-by-default, saved **Survey footprint** overlay in Settings, with no new toolbar button, that tints the sky directions where this catalog holds accepted DESI DR1 rows. Derive the 0.5° occupancy grid reproducibly from the prepared catalog rows, verify it against the catalog's source checksum and accepted count, and keep it available for same-source subsets. Present it as occupancy of accepted rows, never as the official survey tiling, depth or completeness: a tinted cell holds at least one accepted row, shaded by the log of its row count; dark directions were not surveyed here and are not confirmed empty. Draw it on an observer-centered sphere at the catalog's farthest distance, behind the points, so the shading is exact from the Sun / Observer; one draw when enabled and zero when off, never in picking, counts or measurements. Disclose the derivation in the data dialog and acknowledgments.

## Shareable views

Let a visitor return to, or hand someone, exactly what they are looking at. **Share** in the top bar copies a link and saves named views in this browser; there is no new toolbar button. A link carries only the orbit target, the camera relative to that target and, when something is selected, its catalog identity (`sun`, `core`, a nearby key, or a DESI node, row and target ID): nothing personal and nothing else. Opening a link re-verifies the identity against the catalog and applies the camera offset from the exact catalog position; an identity this catalog cannot confirm falls back to the camera alone with a visible notice. Saved views are local, capped and validated on read. Focus, Visit, Overview and opened saved views may travel smoothly inside the existing frame loop; any orbit input, flight or auto fly takes over immediately, and reduced-motion users get the instant placement. Travel never evicts a visible model or exceeds the model pool.

## Tours

Offer two guided routes from a **Tours** rail button: the guided zoom-out (Sun → Milky Way → Local Group → survey → CMB shell) and the cosmic road trip (Galactic core → Large and Small Magellanic Clouds → Andromeda → M32 and M110 → Triangulum → NGC 3982 → NGC 4026 → Coma cluster → survey). A tour is camera motion over the existing animated visits, never a physical trajectory. Each stop shows a caption stating its distance, its lookback time and what is measured versus assumed or illustrative; every number a caption quotes is pinned to its source data by tests. Any orbit input, flight, auto fly or navigation control pauses the tour at once, and a camera that moved during a dwell pauses instead of hopping; Pausing also cancels a pending catalog lookup before it can move the camera; Play retries that destination, Prev and Next step, Escape or Exit leaves. Tours never persist settings: the CMB stop shows the shell without saving it, and leaving the stop or exiting restores the saved choice. Catalog stops resolve by name through the loaded DESI index and are skipped with a notice on subsets or when unmatched; the survey captions report the active dataset's accepted count rather than the full-release figure. While a tour runs its panel owns the right column, replacing the inspectors and the CMB card until exit. Coma should appear as a central gathering of galaxy observations, viewed outward from the observer side; retain its NED center and the uncorrected redshift-distance elongation. See [tour stop sources and assumptions](tours.md).

## Tour controls

The tour progress control opens **Stops & pace**, pausing playback. Provide stable chapters, a short visual cue at each stop, session-only Quick / Relaxed / Manual pacing, Explore here, and Return to stop. Quick retains original timings; Relaxed doubles dwell only; Manual never advances automatically. Chapter selection and Return arrive paused, and changing pace alone does not resume playback. Existing road-trip invitations retain automatic Quick start. Keep source-pinned explanations, exact destinations, desktop control structure and bounded phone details. Phone landscape can defer the cue until Details is expanded.

Back to previous view restores deliberate navigation within the current page session, with at most 32 stored views. It is separate from a tour's Prev stop. Capture the prior camera/target/identity before focus, search, overview, opening a saved view or starting a tour; do not record animation frames or individual tour hops. Back pauses the tour, reverifies identities through the existing view restoration and preserves display preferences. Show Back only when a different stored view is available, in the desktop header or phone Explore menu.

## Road trip model expansion

Add tightly wound and feathered spiral illustrations with the existing common radial profile, depth, palette and light budget. Use stable named recipes for Andromeda, Triangulum and NGC 3982; retain measured/adopted geometry and source classifications. Add distinct volumetric Magellanic Cloud illustrations at their existing sourced destinations, disclosing assumed gas, dust and stellar structure. Preserve full catalog coverage and bounded model residency. Verify cloud extinction, forward-ray integration, orbit/inside views, stable reconstruction, selection and graphics recovery alongside the full road trip and nearby-layer regressions.

## Image-inspired road-trip targets — 12 September 2026

Review each stop against primary telescope images. Use exact matched public identities for M31, M33, NGC 3982, M32, M110, NGC 4026 and the two Magellanic Clouds; retain their adopted positions, radii and sky ellipses. Adapt the existing core continuous-light/cloud templates, linking image references and disclosing assumed internal structure. Keep the sourced Milky Way reference and current Coma/survey rendering where an external image or verified individual catalog match is unavailable. Preserve generic fallback recipes, original source profiles, both appearance settings, the 12-model DESI pool and the 4 MiB nearby allocation ceiling. See [the image review](image-portraits.md).

## Touch and phone interface

Phones (up to 700 CSS px) and coarse-pointer screens up to 1024 CSS px use a compact bottom toolbar with Visit, Milky Way, Tours and Menu. Secondary navigation, display preferences and catalog counts live in the Explore menu. Galaxy, home, tour and cosmic-scale panels start collapsed, retain their main actions, and expand into bounded, independently scrolling details. Beginning map navigation collapses details; dragging preserves the selection, while tapping retains the existing point-picking behavior. Touch navigation keeps the existing orbit, pinch and pan controls. Search, settings and sharing use bottom dialogs with safe-area and visual-viewport spacing; settings are grouped into expandable sections. Wide desktop layouts retain their existing controls. Mobile flight offers Auto fly with a reachable Done action.

Share also offers **Copy cosmic road trip link**. Its `#tour=road-trip` invitation starts the standard route at the Milky Way with autoplay after the atlas and galaxy names are ready. It does not inherit the sender's camera or selected object. Normal view links and saved views keep their existing behavior. Reload/context recovery does not reapply a consumed invitation; navigation input cancels a pending start.

### Tour orientation refinement

Use the existing header subtitle for curated tour context or verified selection/focus-distance context. Identify the small Andromeda companions with at most two noninteractive screen labels anchored to their existing measured positions, never enlarged models. Labels must remain bounded, clear on exit and stay outside picking. Paused playback is labeled Continue; hiding the tab pauses and returning does not automatically resume. All stops must remain usable on desktop and phone portrait/landscape, including reduced-motion visits.

### Tour arrival preparation (milestone 2)

Automatic pacing prepares only the next catalog destination, using cancellable shared metadata/profile leases. The allowance is two assets, at most 4 MiB compressed / 24 MiB managed reservation, skipped above 80% of the current memory budget. Current-view queued work wins; no speculative point frontier or extra model is created. Existing metadata/profile caches remain bounded. Pause, chapter changes, Exit and hidden tabs release obsolete owners without cancelling required shared loads.

After camera arrival, the single tour timer checks usable destination representation every 200 ms, for at most eight seconds. Nearby/catalog stops check a visible model or submitted point; cluster/overview checks bounded samples of submitted positions in the arrival region. Coma coverage is not membership. Partial data pauses with Retry, Continue and Next; Continue explicitly accepts the partial view. Normal dwell begins only after readiness. Tests cover readiness, timeout, stale checks and preparation cancellation. Full/subset actual-GPU checks and production recovery/navigation journeys pass; see the ordered milestone evidence. Cluster sampling first filters intersecting spatial chunks so unrelated faint-background points cannot consume its sample.

## Telescope photograph comparison

An optional, credited photograph panel is available for supported tour destinations and verified selections. It pauses the tour and loads one bounded image only on demand. Phone panels preserve access to the map; close and Model return without resuming. The ten source images, separate rights, exact identity mapping, crop/orientation disclosures and sole calibrated NGC 4026 match are documented in [photographs](photographs.md). Match is reversible; stale camera lookups cannot navigate after closing or input takeover. Existing model geometry and catalog data are unchanged.

## Custom trips and paused destination links

Share can copy a versioned paused link to the current built-in stop. Tours → Create a trip and Share → My trips offer up to ten sourced destinations or saved camera views, reordering and short separate creator notes. Trips save locally and share through bounded validated links or JSON files; recipients see a preview and explicitly start. Existing road-trip autoplay links retain their behavior. Identity checks, cancellation, source-caption separation, limits and storage/file fallbacks are specified in [custom trips](custom-trips.md). Initial links are consumed once; camera-only or unavailable-identity views never invent catalog records.

# Procedural galaxy looks

Requested by Dave on 2026-09-25: bring the galaxy rendering researched for the Atrium Galaxy screensaver (`dtanquary/atrium`, `Sources/Atrium/Galaxy.swift` and `docs/galaxy.md`, same author, MIT) into both the web app and the native client. Dave chose to cover every disc galaxy, to replace the shared-brightness variant rule with per-type looks, to choose looks from recorded catalog types, to add M51, NGC 5195, M101 and NGC 1300 as sourced nearby entries, and to land each step on the web and in Metal together. This page records the method and what has shipped.

| Step | Scope | State |
| --- | --- | --- |
| 1 | Shared shader (GLSL + Metal) on NGC 3982 | Done: web and native |
| 2 | Andromeda, Triangulum, Milky Way (sourced geometry kept) | Done: web and native; the texture portraits are removed |
| 3 | Every catalog spiral, looks chosen by recorded type or identity; replaces the variant light-budget rule | Done: web and native; variant recipes, light samples and the common spiral profile removed |
| 4 | M51, NGC 5195, M101, NGC 1300 as cited nearby entries | Done: web and native; the nearby layer holds 10 of its 12 entries |

## What carries over from Atrium

Atrium draws one spiral per pixel in a full-screen shader with no image files. Its research, checked against ESA/Hubble and ESO photographs, is what makes it read as a photograph rather than an illustration:

- A bright exponential disc that the arms brighten two to three times, not arms on a dark disc.
- A Hubble-style `asinh` stretch on brightness only, so colour stays saturated and only the brightest light pales toward white. Part of the H II pink is added after the stretch, as Hubble processing keeps H-alpha saturated.
- Arm structure ordered the way material crosses a density wave: dust lane, then H II regions, then the crest, then young blue stars. Lanes are broken, with narrow dark cores; feathers leave the arms; a ridged filament web reaches the nucleus; barred kinds get lanes along the bar's leading edges.
- Rust-coloured dust with a third of the old disc's light in front of it, so lanes redden instead of going black.
- Lumpy star clouds sampled in the unswirled disc, fine texture everywhere, lopsided arm strengths, and softening plus a haze at steep tilts.

The colour table is Atrium's photo-sampled family. Screensaver-only parts are left out: the sky, foreground stars, fixed screen grain, painted-in companions (the atlas's companions are catalog objects) and rotation, because real discs turn over hundreds of millions of years.

## How it becomes 3D

`src/galaxy-looks.ts` holds the look table, the identity seed and the GLSL; `native/Sources/AtlasCore/GalaxyLooks.swift` and `atlas_volume_look` in `Atlas.metal` are the 1:1 port. The frame, deprojection and radius are the existing catalog geometry (`galaxyFrame`, `galaxyRadius`); only the light inside it is procedural.

- **Midplane evaluation.** Each ray is intersected with the disc midplane and the Atrium structure is evaluated once at that point, in disc coordinates, so every feature keeps full per-pixel detail at any zoom. Vertical structure uses the home template's exponential layers (old 0.065, young 0.028, dust 0.019 half-light radii) with exact column integrals in front of and behind the dust sheet, and forward rays only, so views from inside the disc work.
- **Grazing and in-plane rays.** Between about 81° and 86.5° from face-on the result blends into a 48-cell march through the azimuthally averaged disc and dust; edge-on views are that march alone. Structure fades out there rather than aliasing.
- **Bulge.** An oblate cloud (intrinsic axis ratio 0.6) whose projection is Atrium's Sérsic n=2 profile. The share ahead of the camera and the share behind the dust sheet come from where the ray passes the centre.
- **Zoom.** Features are fixed in the disc; sizes are measured through the screen-space Jacobian so stars and H II regions stay round at any tilt. Star cells are chosen per pixel scale and blended over two octaves, so zooming in reveals more stars instead of enlarging them. Anything finer than about two pixels (noise octaves, lane cores, narrow arm profiles, H II regions) fades to its mean.
- **Integer hashes.** Noise lattices use integer PCG hashes (Jarzynski and Olano 2020), so web and native GPUs see the same lattice. Seeds come from the exact public identity, never the dense row.
- **Size.** The smooth disc fades out between 0.85 and 1.4 disc radii times the look's `extent`. Each look's `unitsPerRe` (0.5311 at extent 1) puts that profile's half-light radius at exactly the adopted catalog radius; `tests/galaxy-looks.test.ts` and `GalaxyLooksTests` check every look numerically. The bulge, arms, stars and H II regions are added illustrative light, as before.
- **Orientation.** `phaseDegrees` turns the pattern in the model frame and `spin: -1` mirrors it. Both are zero or one except for the Milky Way, whose bar and handedness they pin to the sourced reference.
- **Budget.** One draw per model, no textures and no light-sample geometry. Output is capped at 96% so highlights never clip.

## NGC 3982

The look is tuned against the bundled Hubble image (opo1036a, `public/photos/`): four winding arms with minor ones at 0.8, 26° pitch, ragged 0.7, dust 2.2, twice the default H II regions, cream core, blue-white disc. Arm paths, dust, stars, H II placement, colours, bulge and depth are illustrative; the DESI identity, redshift distance, measured half-light radius and projected ellipse are unchanged.

## Andromeda, Triangulum and the Milky Way

Andromeda and Triangulum take Atrium's own M31 and M33 settings. Andromeda has two arms at an 8° pitch, which read as dusty partial rings, a large cream bulge (0.13), ragged 0.5 and dust 1.2. Triangulum is flocculent (ragged 0.9) with a 30° pitch, a weak nucleus, light dust and 1.5× the H II regions. Their adopted distances, radii and sky ellipses are unchanged, and the steep-tilt softening carries Andromeda's observer view. M32 and M110 remain separate catalog objects, not painted companions. Both looks drop the 384² texture portraits, so the nearby layer's texture memory falls to the two clouds.

The Milky Way uses Atrium's Milky Way settings (four arms with the two minor ones at 0.45, a 13° pitch, bulge 0.09, ragged 0.3) with sourced geometry. Its bar is the adopted 5 kpc half-length (0.71 disc radii), turned 152° in the model frame, so it lies 28° from the Sun–centre line. The pattern is mirrored to wind with the density field's handedness. The disc extent is 1.5, which fades the disc out between about 9 and 15 kpc around the Sun at 8.1 kpc. The existing home march draws every view from within 0.35–1.4 kpc of the midplane, edge-on views and grazing rays. [The home model](milky-way.md) describes the handover.

## Catalog looks

Six catalog looks cover the DESI catalog, each one of Atrium's six galaxy types. See [galaxy detail](galaxy-detail.md#catalog-looks) for the type mapping, identity weights and inspector disclosure. Every galaxy drawn as a spiral uses one: all of them in the default appearance, and the spiral and barred-spiral families in Catalog types. The recorded Hubble type chooses it for the 2,046 typed spirals and the exact identity for everything else. The identity also turns and mirrors the pattern and tints the disc and young stars by its palette at fixed luminance. Named looks (NGC 3982, Andromeda, Triangulum, the Milky Way) keep their own settings. A catalog model is now one draw with no light-sample geometry, down from 12,000 or 24,000 samples (672,000 bytes) each.

## M51, NGC 5195, M101 and NGC 1300

These four are new [nearby entries](nearby-galaxies.md) with cited distances, sizes and shapes: red giant branch distances for M51 and M101, M51's distance assumed for NGC 5195, and a Tully–Fisher distance for NGC 1300. They get Atrium's own kinds on the galaxies those kinds were drawn from. The Whirlpool, Pinwheel and Great Barred settings are now shared constants: the grand, multi and barred catalog looks use them unchanged.

- **Handedness.** Each look's spin matches its Hubble photo rotated north up. The model frame puts the observer on the positive-normal side, so the pattern's anticlockwise sense is anticlockwise on the sky. Spin 1 winds clockwise outward (M51, M101); NGC 1300 is mirrored.
- **M51.** It is turned 37.3° so an arm crest passes where the line of sight to NGC 5195 crosses M51's midplane, 1.03 disc radii out. That arm reaches the companion, as in the photo; the noise warp moves the exact crest.
- **NGC 1300.** The bar is 0.3817 disc radii, turned −6.98°. Projected on the sky, that is 75.0 arcsec at 100.3°, the S4G bar. `tests/galaxy-looks.test.ts` and `GalaxyLooksTests` pin both numbers to `nearby-sources.json`.
- **NGC 5195.** A smooth n=2 model rather than a look: it is amorphous and bulge- and bar-dominated (RC3 I0 pec).

## Validation and cost

See [validation](validation.md#procedural-galaxy-looks--25-september-2026). On the Mac M3 Max GPU, with NGC 3982 filling the frame, `atlas_volume_look` takes 1.97 ms face-on at 2800×1800 and 0.42 ms at 660×1434. The texture portrait it replaces took 17.2 ms and 3.19 ms (Triangulum, same framing, median of 25 frames). These are local Mac measurements. Physical iPhone and iPad numbers are still to be recorded.

# Procedural galaxy looks

Requested by Dave on 2026-09-25: bring the galaxy rendering researched for the Atrium Galaxy screensaver (`dtanquary/atrium`, `Sources/Atrium/Galaxy.swift` and `docs/galaxy.md`, same author, MIT) into both the web app and the native client. Dave chose to cover every disc galaxy, to replace the shared-brightness variant rule with per-type looks, to choose looks from recorded catalog types, to add M51, NGC 5195, M101 and NGC 1300 as sourced nearby entries, and to land each step on the web and in Metal together. This page records the method and what has shipped.

| Step | Scope | State |
| --- | --- | --- |
| 1 | Shared shader (GLSL + Metal) on NGC 3982 | Done: web and native, awaiting Dave's review of the look |
| 2 | Andromeda, Triangulum, Milky Way (sourced geometry kept) | Not started |
| 3 | Every catalog spiral, looks chosen by recorded type or identity; replaces the variant light-budget rule | Not started |
| 4 | M51, NGC 5195, M101, NGC 1300 as cited nearby entries | Not started |

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
- **Size.** `lookDisc.unitsPerRe = 0.5311` puts the smooth disc's half-light radius at exactly the adopted catalog radius (checked numerically by `tests/galaxy-looks.test.ts` and `GalaxyLooksTests`). The bulge, arms, stars and H II regions are added illustrative light, as before.
- **Budget.** One draw per model, no textures and no light-sample geometry. Output is capped at 96% so highlights never clip.

## NGC 3982

The look is tuned against the bundled Hubble image (opo1036a, `public/photos/`): four winding arms with minor ones at 0.8, 26° pitch, ragged 0.7, dust 2.2, twice the default H II regions, cream core, blue-white disc. Arm paths, dust, stars, H II placement, colours, bulge and depth are illustrative; the DESI identity, redshift distance, measured half-light radius and projected ellipse are unchanged.

## Validation and cost

See [validation](validation.md#procedural-galaxy-looks--25-september-2026). On the Mac M3 Max GPU, with NGC 3982 filling the frame, `atlas_volume_look` takes 1.97 ms face-on at 2800×1800 and 0.42 ms at 660×1434. The texture portrait it replaces took 17.2 ms and 3.19 ms (Triangulum, same framing, median of 25 frames). These are local Mac measurements. Physical iPhone and iPad numbers are still to be recorded.

# Nearby galaxies

The atlas includes a small, separately identified Local Group layer alongside DESI DR1. It supplies six familiar destinations whose distances should not be inferred from their recession velocities. The layer works with full DR1, development subsets and bootstrap. It is not a complete Local Group census or a globally deduplicated catalog.

## Adopted distances

These are pinned published measurements, not a claim of the latest consensus. The inspector links each distance to its source and displays its quoted uncertainty.

| Galaxy | Adopted observer distance | Method and source |
| --- | --- | --- |
| Andromeda / M31 | 785 ± 25 kpc | Tip of the red giant branch; [McConnachie et al. (2005)](https://arxiv.org/abs/astro-ph/0410489) |
| Triangulum / M33 | 809 ± 24 kpc | Tip of the red giant branch; [McConnachie et al. (2005)](https://arxiv.org/abs/astro-ph/0410489) |
| Large Magellanic Cloud | 49.59 ± 0.09 statistical ± 0.54 systematic kpc | Eclipsing binaries; [Pietrzyński et al. (2019)](https://arxiv.org/abs/1903.08096) |
| Small Magellanic Cloud | 62.44 ± 0.47 statistical ± 0.81 systematic kpc | Eclipsing binaries; [Graczyk et al. (2020)](https://arxiv.org/abs/2010.08754) |
| M32 | 805.38 kpc; distance modulus 24.53 ± 0.21 mag, approximately ±80 kpc | RR Lyrae stars; Fiorentino et al. (2010), as tabulated in the [McConnachie compilation](https://www.cadc-ccda.hia-iha.nrc-cnrc.gc.ca/en/community/nearby/) |
| M110 / NGC 205 | 824 ± 27 kpc | Tip of the red giant branch; [McConnachie et al. (2005)](https://arxiv.org/abs/astro-ph/0410489) |

Adopted central sky coordinates come from McConnachie (2012, AJ, 144, 4), using the January 2021 public table where available and the paper's M31 coordinates. Distance modulus is converted using `D_pc = 10^((modulus + 5) / 5)`. The two Magellanic Cloud distances use their independently cited later measurements.

Positions use the existing equatorial Cartesian axes and Mpc units, with the observer at zero. Local distances are used directly, without a redshift conversion or cosmological `1 + z` factor. These are approximate observed centers; there is no proper-motion or epoch propagation. The surrounding DESI layer retains its original Planck18 comoving positions, so comparisons across the two sources are labeled **map separations**. Pairwise uncertainty is not propagated. In particular, M32's large distance uncertainty is substantial relative to its separation from M31; the app does not force satellite galaxies onto an assumed distance shell.

## What the models measure and assume

The source-based shapes below describe Catalog types appearance. The default All spirals mode renders every entry as a spiral illustration, explicitly overriding its light profile, morphology and assumed depth. Settings can restore Catalog types. Both appearances preserve adopted projected ellipses. It assumes an oblate depth and chooses one of the ambiguous near sides. Colors, exposure, spiral arms, clumps and internal light structure are illustrative. The models are not photometrically calibrated telescope reconstructions.

| Galaxy | Size and projected shape |
| --- | --- |
| M31 | Exponential disk scale 5.3 ± 0.5 kpc and disk axis ratio 0.27 from [Courteau et al. (2011)](https://arxiv.org/abs/1106.3564). Half-light radius is 1.678 × the disk scale. Sky position angle 35° comes from OpenNGC. This single-disk approximation omits a separate bulge and halo. |
| M33 | K-band disk scale 1.4 kpc at an adopted 840 kpc from [the cited disk model](https://doi.org/10.1111/j.1365-2966.2012.21778.x), rescaled to 809 kpc; half-light radius is 1.678 × this scale. OpenNGC gives axis ratio 36.73 / 62.09 and position angle 23°. The model assumes one unwarped disk. |
| LMC | **Assumed** half-light radius 1.5 kpc and round projected envelope. **No measured orientation is claimed.** Illustrative irregular clumps do not reproduce its observed bar. |
| SMC | OpenNGC projected axis ratio 179.89 / 299.92 and angle 45°. **Assumed** half-light radius is one eighth of the 299.92 arcmin major-axis diameter; that diameter is not a half-light measurement. The oblate depth and clumps do not reproduce its complex depth structure. |
| M32 | V-band semi-major half-light radius 0.47 arcmin, axis ratio 0.75 and position angle 159° from McConnachie's January 2021 table. Sérsic index 2 is illustrative. |
| M110 | V-band semi-major half-light radius 2.46 arcmin, axis ratio 0.57 and position angle 28° from the same table. Sérsic index 2 is illustrative. |

Sky angles are east of north. Missing-value sentinels in the source compilation are not interpreted as measurements. OpenNGC fields are credited to [Mattia Verga's OpenNGC database](https://github.com/mattiaverga/OpenNGC), under CC BY-SA 4.0. Preserve this attribution for the adapted shape fields, together with the research citations above; see [acknowledgments](../public/acknowledgments.txt).

## Reproduction and extension

`src/data/nearby-sources.json` is the small, reviewable input excerpt with sources and explicit assumptions. It records SHA-256 hashes of the downloaded January 2021 compilation and OpenNGC snapshot. Raw downloads stay in the ignored local cache. Regenerate the checked-in runtime reference with:

```sh
uv run python scripts/prepare_nearby_galaxies.py
npm test
```

This is a network-free calculation from the pinned excerpt. It converts sky coordinates, distance moduli, sizes and ellipticities; fits nonnegative Gaussian approximations for the illustrative exponential/Sérsic profiles; and records the input excerpt's SHA-256 in `src/data/nearby-galaxies.json`. Changing a source measurement requires updating its citation and assumptions, regenerating the reference, and checking the result.

`src/nearby-galaxies.ts` adapts the reference into the shared model contract. The six stable internal row IDs are negative; public identities are namespaced strings such as `nearby:m31`. Redshift, redshift error and redshift-fit significance are null. These entries never manufacture DESI target IDs or modify existing metadata, profile sidecars, accepted counts or catalog binaries. The HUD reports their count separately.

Search merges these aliases ahead of the DESI name index and removes redundant name suggestions for the same local destination. This deduplicates search names only, not survey observations. A failed or unavailable DESI name index still leaves the six local destinations and Milky Way usable. Nearby entries bypass the redshift-only 1 Mpc display safeguard on both CPU and GPU. Original uncertain DESI records remain subject to it.

The six distant points use one batched draw and a separate GPU-pick namespace. Models share existing visibility, focus, body picking and measurement behavior. The fixed models add 4,032,000 tracked geometry bytes in All spirals mode (2,688,000 with Catalog types), beside the 12-model DESI pool and separate Milky Way reference; invisible models do not draw. The current uniform allocation explicitly caps this layer at 12 entries. Before adding a larger population, replace the fixed layer with bounded spatial streaming and maintain stable identities/provenance.

For browser validation, run `?nearbytest&run=neighbors` and `?dataset=development&nearbytest&run=neighbors-subset`. They check all six search destinations, framing, projected shapes, model and point picking, independent-distance measurement preservation, separate catalog counts and graphics recovery. Changes shared with DESI navigation additionally require the existing UI/home/model/point suites.

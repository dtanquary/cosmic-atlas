# Nearby galaxies

The atlas includes a small, separately identified nearby-galaxy layer alongside DESI DR1. It supplies ten familiar destinations whose distances should not be inferred from their recession velocities: six Local Group galaxies and, since 2026-09-25, M51 with its companion NGC 5195, M101 and NGC 1300. The four later additions have no matched DESI observation. The layer works with full DR1, development subsets and bootstrap. It is not a complete census or a globally deduplicated catalog.

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
| Whirlpool / M51 | 8.58 ± 0.10 Mpc (statistical) | Tip of the red giant branch; [McQuinn et al. (2016)](https://arxiv.org/abs/1606.04120) |
| NGC 5195 | 8.58 Mpc, **assumed equal to M51** | M51's red giant branch distance, adopted for its interacting companion (see below) |
| Pinwheel / M101 | 6.52 ± 0.12 statistical ± 0.15 systematic Mpc | Tip of the red giant branch; [Beaton et al. (2019)](https://arxiv.org/abs/1908.06120), Carnegie-Chicago Hubble Program |
| NGC 1300 | 13.90 Mpc; distance modulus 30.715 ± 0.46 mag, about ±3 Mpc | Tully–Fisher relation; [Cosmicflows-4](https://arxiv.org/abs/2209.11238) (Tully et al. 2023), VizieR J/ApJ/944/94 |

Adopted central sky coordinates come from McConnachie (2012, AJ, 144, 4), using the January 2021 public table where available and the paper's M31 coordinates; the four later additions use OpenNGC coordinates. Distance modulus is converted using `D_pc = 10^((modulus + 5) / 5)`. The two Magellanic Cloud distances use their independently cited later measurements.

Two of the later distances need care. NGC 5195 has no red giant branch distance of its own. Its surface brightness fluctuation distance in Cosmicflows-4 (29.35 ± 0.27 mag, 7.4 Mpc) would put it about 1.2 Mpc in front of M51, although the pair is visibly interacting; McQuinn et al. note that fluctuation distances are unreliable for this disturbed system. The layer therefore adopts M51's distance for NGC 5195 and says so in its inspector. NGC 1300 has no Cepheid or red giant branch distance (its PHANGS-HST halo fields were too shallow, [Anand et al. 2021](https://arxiv.org/abs/2012.00757)). The Cosmicflows-4 Tully–Fisher modulus is the only redshift-independent measurement adopted here; the PHANGS compilation's 18.99 Mpc comes from a velocity-flow model instead.

Positions use the existing equatorial Cartesian axes and Mpc units, with the observer at zero. Local distances are used directly, without a redshift conversion or cosmological `1 + z` factor. These are approximate observed centers; there is no proper-motion or epoch propagation. The surrounding DESI layer retains its original Planck18 comoving positions, so comparisons across the two sources are labeled **map separations**. Pairwise uncertainty is not propagated. In particular, M32's large distance uncertainty is substantial relative to its separation from M31; the app does not force satellite galaxies onto an assumed distance shell.

## What the models measure and assume

The default Image-inspired targets + spirals mode and Catalog types both use [procedural looks](galaxy-looks.md) for M31, M33, M51, M101 and NGC 1300, dedicated stellar clouds for LMC/SMC, and smooth profiles for M32, M110 and NGC 5195. The [road-trip image review](image-portraits.md) records the evidence and limitations. Both appearances preserve adopted global ellipse parameters; fine structure is not an ellipse or photometric fit. Depth, near side, colors, exposure and internal feature placement remain illustrative.

| Galaxy | Size and projected shape |
| --- | --- |
| M31 | Exponential disk scale 5.3 ± 0.5 kpc and disk axis ratio 0.27 from [Courteau et al. (2011)](https://arxiv.org/abs/1106.3564). Half-light radius is 1.678 × the disk scale. Sky position angle 35° comes from OpenNGC. This single-disk approximation omits a separate bulge and halo. |
| M33 | K-band disk scale 1.4 kpc at an adopted 840 kpc from [the cited disk model](https://doi.org/10.1111/j.1365-2966.2012.21778.x), rescaled to 809 kpc; half-light radius is 1.678 × this scale. OpenNGC gives axis ratio 36.73 / 62.09 and position angle 23°. The model assumes one unwarped disk. |
| LMC | **Assumed** half-light radius 1.5 kpc and round projected envelope. **No measured orientation is claimed.** The soft offset bar and irregular haze are illustrative, with no measured bar angle or individual gas structure. |
| SMC | OpenNGC projected axis ratio 179.89 / 299.92 and angle 45°. **Assumed** half-light radius is one eighth of the 299.92 arcmin major-axis diameter; that diameter is not a half-light measurement. The oblate depth and clumps do not reproduce its complex depth structure. |
| M32 | V-band semi-major half-light radius 0.47 arcmin, axis ratio 0.75 and position angle 159° from McConnachie's January 2021 table. Sérsic index 2 is illustrative. |
| M110 | V-band semi-major half-light radius 2.46 arcmin, axis ratio 0.57 and position angle 28° from the same table. Sérsic index 2 is illustrative. |
| M51 | 3.6 µm exponential disk scale 84.2 arcsec from the S4G decomposition ([Salo et al. 2015](https://arxiv.org/abs/1503.06550)); half-light radius is 1.678 × this scale (141.3 arcsec, 5.9 kpc). Disk axis ratio 0.84 and position angle 39.1° are the S4G outer isophote, to which that fit fixes its disk. The single disk omits the fitted bulge (13% of the light). |
| NGC 5195 | Half-light radius 0.95 arcmin (2.4 kpc): the RC3 effective aperture (log A_e = 1.28), a circle holding half the B-band light. Its S4G fit is bulge- and bar-dominated, so a disk scale would overstate its size. OpenNGC axis ratio 4.36 / 5.50 and position angle 79°. Sérsic index 2 is illustrative. |
| M101 | S4G disk scale 127.3 arcsec; half-light radius 213.7 arcsec (6.8 kpc). Outer-isophote axis ratio 0.929 and position angle 37.7°; the angle is poorly defined (±43°) for this nearly face-on disk. The single disk omits the fitted bulge (5%). |
| NGC 1300 | S4G disk scale 62.3 arcsec; half-light radius 104.6 arcsec (7.0 kpc). Outer-isophote axis ratio 0.835 and position angle 106.1°. The same fit's bar (75.0 arcsec, 100.3°) sets the illustrative bar's length and sky angle. The single disk omits the fitted bulge (7%) and bar (6%). |

Visual types for the four later additions come from RC3 (de Vaucouleurs et al. 1991, VizieR VII/155). Sky angles are east of north. Missing-value sentinels in the source compilation are not interpreted as measurements. OpenNGC fields are credited to [Mattia Verga's OpenNGC database](https://github.com/mattiaverga/OpenNGC), under CC BY-SA 4.0. Preserve this attribution for the adapted shape fields, together with the research citations above; see [acknowledgments](../public/acknowledgments.txt).

## Reproduction and extension

`src/data/nearby-sources.json` is the small, reviewable input excerpt with sources and explicit assumptions. It records SHA-256 hashes of the downloaded January 2021 compilation and OpenNGC snapshot. Raw downloads stay in the ignored local cache. Regenerate the checked-in runtime reference with:

```sh
uv run python scripts/prepare_nearby_galaxies.py
npm test
```

This is a network-free calculation from the pinned excerpt. It converts sky coordinates, distance moduli, sizes and ellipticities; fits nonnegative Gaussian approximations for the illustrative exponential/Sérsic profiles; and records the input excerpt's SHA-256 in `src/data/nearby-galaxies.json`. Changing a source measurement requires updating its citation and assumptions, regenerating the reference, and checking the result.

`src/nearby-galaxies.ts` adapts the reference into the shared model contract. The ten stable internal row IDs are negative (−1 to −10); public identities are namespaced strings such as `nearby:m31`. Redshift, redshift error and redshift-fit significance are null. These entries never manufacture DESI target IDs or modify existing metadata, profile sidecars, accepted counts or catalog binaries. The HUD reports their count separately.

Search merges these aliases ahead of the DESI name index and removes redundant name suggestions for the same local destination. This deduplicates search names only, not survey observations. A failed or unavailable DESI name index still leaves the ten nearby destinations and the Milky Way usable. The empty search lists every nearby destination plus one DESI example. Nearby entries bypass the redshift-only 1 Mpc display safeguard on both CPU and GPU. Original uncertain DESI records remain subject to it.

The ten points use one batched draw and a separate GPU-pick namespace. Models share existing visibility, focus, body picking and measurement behavior. The fixed models add 1,343,488 tracked CPU/GPU geometry and texture bytes in either appearance (the two Magellanic Clouds; the other eight are procedural or smooth), beside the 12-model DESI pool and separate Milky Way reference; invisible models do not draw. The current uniform allocation explicitly caps this layer at 12 entries. Before adding a larger population, replace the fixed layer with bounded spatial streaming and maintain stable identities/provenance.

For browser validation, run `?nearbytest&run=neighbors` and `?dataset=development&nearbytest&run=neighbors-subset`. They check all ten search destinations, framing, projected shapes, model and point picking, independent-distance measurement preservation, separate catalog counts and graphics recovery. Changes shared with DESI navigation additionally require the existing UI/home/model/point suites.

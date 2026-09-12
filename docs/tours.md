# Guided tours

Two scripted routes in `src/data/tours.json` move the camera between real destinations and show a caption at each stop. The travel paths are camera motion only: the interpolated pose between two stops is not a physical trajectory, a flight time or a light path, and nothing about the catalog changes while a tour runs. Captions state the distance and the lookback time of each stop and say what is measured and what is assumed or illustrative. Every number a caption cites is repeated in the stop's `factCheck` field, and `tests/tours.test.ts` compares those fields with the live data (nearby layer, Milky Way frame, DR1 manifest, CMB reference, name index and cluster sidecar), so a caption cannot quietly drift from the data.

Lookback times follow the existing rule: Planck18 lookback for redshift-derived positions (DESI rows, the survey reach, the cluster center and the CMB shell) and distance ÷ c for the independently measured nearby layer and the Milky Way. Framing distances are the camera's distance from the stop target; `Explorer` computes the overview and CMB framings itself, the other stops carry theirs in the data.

## Guided zoom-out: from the Sun to the CMB

| Stop | Target and framing | Measured | Assumed or illustrative | Source |
| --- | --- | --- | --- | --- |
| The Sun | Coordinate origin, 3 kpc, oblique along the Milky Way approach direction | The Solar System is the origin of every catalog position | Sun marker size; the surrounding disk is the illustrative Milky Way reference | [Milky Way reference](milky-way.md) |
| The Milky Way | Galactic core, 60 kpc (the standard Milky Way visit) | Sun–core distance 8.122 kpc and frame orientation from the pinned Astropy Galactocentric parameters; light travel ≈ 26,500 years | Disk scale and bar dimensions are adopted literature values; arms, dust, colors and exposure are illustrative | [Milky Way reference](milky-way.md), `src/data/milky-way.json` |
| The Local Group | Midpoint of the Sun and Andromeda, 1.2 Mpc | Six nearby galaxies at independently measured distances; Andromeda 785 ± 25 kpc, light travel ≈ 2.56 million years | The framing distance: the farthest of the six galaxies and the Sun from the midpoint is Triangulum at 0.441 Mpc, and 0.441 / sin 25° × 1.14 = 1.19 Mpc fits all of them in a 50° field at aspect 1 with the CMB view's 14% margin, rounded to 1.2 Mpc. DESI redshift-only positions inferred within 1 Mpc stay hidden by default as a display safeguard, not as corrected distances | [Nearby galaxies](nearby-galaxies.md), [local distance audit](local-distance-audit.md) |
| The DESI survey | Catalog overview (`Explorer.reset`: 2.1 × the root node's half-diagonal) | 14,140,375 accepted DR1 observations; the farthest at 4,830.889 Mpc, Planck18 lookback 9.96 Gyr | Positions are comoving distances inferred from redshift with no peculiar-velocity correction; the uneven sky coverage reflects where DESI observed, and dark gaps are not confirmed empty | [Requirements: data](requirements.md#data-and-scientific-meaning), `public/data/dr1/manifest.json` |
| The cosmic microwave background | Shell framing (`Explorer.viewCosmicHorizon`: radius / sin(half field) × 1.14), shell shown without saving the setting | Planck18 comoving radius 13,884.421 Mpc (45.3 billion ly) at rounded z = 1090; lookback 13.787 Gyr | The thin shell, its colors and grid are illustrative; it is an approximate last-scattering surface, not a physical edge, and no measured temperature map is shown | [CMB reference](cosmic-horizon.md), `src/data/cosmic-horizon.json` |

The five framing distances increase strictly (3 kpc, 60 kpc, 1.2 Mpc, about 16,100 Mpc, about 37,500 Mpc); the test recomputes the overview and CMB values from the manifest and the CMB radius.

## Cosmic road trip

| Stop | Target and framing | Measured | Assumed or illustrative | Source |
| --- | --- | --- | --- | --- |
| The Milky Way | Galactic core, 60 kpc | As above | As above | [Milky Way reference](milky-way.md) |
| Large Magellanic Cloud | Nearby `lmc`, standard visit | Distance 49.59 kpc from eclipsing binaries; light travel ≈ 162,000 years | 1.5 kpc half-light radius and round envelope are assumed; no orientation is measured; clumps are illustrative and do not reproduce the bar | [Nearby galaxies](nearby-galaxies.md) |
| Small Magellanic Cloud | Nearby `smc`, standard visit | Distance 62.44 kpc from eclipsing binaries; OpenNGC projected ellipse and angle; light travel ≈ 204,000 years | Half-light radius assumed as one eighth of the catalog major-axis diameter; depth and clumps illustrative | [Nearby galaxies](nearby-galaxies.md) |
| Andromeda | Nearby `m31`, standard visit | Distance 785 kpc (tip of the red giant branch); disk scale, axis ratio and sky angle; light travel ≈ 2.56 million years | Spiral arms, colors and the single-disk approximation are illustrative | [Nearby galaxies](nearby-galaxies.md) |
| M32 and M110 | Nearby `m31` from 0.16 Mpc so both satellites stay in frame | M32 805 kpc (RR Lyrae, modulus ± 0.21 mag) and M110 824 ± 27 kpc, measured separately and not placed on Andromeda's distance; M110 light travel ≈ 2.69 million years | Sérsic n = 2 profiles and deprojected depth are illustrative. Framing: M110 is 0.040 Mpc from M31 in 3D, so 0.108 Mpc is the minimum and 0.16 Mpc leaves room for the depth offsets | [Nearby galaxies](nearby-galaxies.md) |
| Triangulum | Nearby `m33`, standard visit | Distance 809 kpc; disk scale, projected ellipse and angle; light travel ≈ 2.64 million years | Arms and colors illustrative; one unwarped disk | [Nearby galaxies](nearby-galaxies.md) |
| NGC 3982 | Catalog, resolved by name | Exact DESI target 39633325333155389 through the verified SGA join; redshift-derived 16.571 Mpc, Planck18 lookback 53.9 million years | The individually fitted light profile is a preview; spiral detail and colors are illustrative; the position carries redshift and peculiar-velocity error | [Name search](architecture.md#name-search), [galaxy detail](galaxy-detail.md) |
| NGC 4026 | Catalog, resolved by name | Exact DESI target 39633263488141603; redshift-derived 14.579 Mpc, lookback 47.5 million years | The same preview and redshift caveats | [Name search](architecture.md#name-search), [galaxy detail](galaxy-detail.md) |
| Coma cluster | Cluster `coma`, center at 105.729 Mpc comoving, framed from 9 Mpc (3 × a 3 Mpc framing radius) | NED preferred J2000 position 194.953°, +27.981° (12h59m48.72s +27d58m51.6s, ref. 2016ApJS..223...15B) and heliocentric redshift 0.023997 ± 0.000063 (ref. 2018A&A...609A..72D), retrieved 2026-09-12; Planck18 lookback 341 million years | The center uses the redshift-space convention of the catalog with no peculiar-velocity correction, so the cluster is stretched along the line of sight; the 3 Mpc framing radius is a round choice, not a measured cluster radius | `src/data/tour-sources.json`, [NED](https://ned.ipac.caltech.edu/) |
| The DESI survey | Catalog overview | As above | As above | as above |

Catalog stops resolve by name through the loaded DESI name index at run time and use its verified `{id, node, row, targetId}` reference; the visit re-checks the exact target ID against the metadata chunk. On development subsets or bootstrap data the index does not match the active catalog, so such a stop is skipped and the caption says why. Nearby stops work with every dataset because the nearby layer is independent of DESI.

### Coma cluster membership check

`scripts/prepare_tours.py` counts accepted DR1 rows within 2° of the NED center on the sky and within |Z − 0.023997| < 0.01, reading only the checksum-verified leaf metadata chunks whose bounds can hold such rows (9 of 882 leaves). The result is recorded in the stop's `factCheck.desiMembers` and in the sidecar:

| Cluster (NED query) | Accepted rows within 2° and Δz within ±0.01 |
| --- | --- |
| Coma cluster (ABELL 1656), used | 2,110 |
| Abell 2199 (ABELL 2199), fallback | 270 |
| Hercules cluster (ABELL 2151), fallback | 777 |
| Perseus cluster (ABELL 426), fallback | 0 |

The script requires at least 200 rows for the primary cluster and otherwise prints the fallback counts and exits non-zero without writing. The count is a plausibility check that the framed region holds DESI galaxies; it is not a cluster membership catalog, a virial radius or a completeness statement, and it depends on where DESI observed (Perseus, near the Galactic plane, has no accepted rows here). The fallback entries are pinned with the same NED fields so a future switch needs no new lookup.

## Regeneration

```sh
npm run data:tours
npm test
```

`prepare_tours.py` reads `src/data/tour-sources.json`, `nearby-galaxies.json`, `milky-way.json`, `cosmic-horizon.json`, `public/data/galaxy-search.json` and the full DR1 manifest and leaves; it needs the prepared full catalog under `public/data/dr1`. It rewrites every `factCheck`, the Local Group midpoint and the cluster stop with Astropy Planck18 and leaves the hand-written titles, captions, timings and framing distances alone. Changing a caption number means changing the underlying source first (for example a nearby distance in `nearby-sources.json`, then `prepare_nearby_galaxies.py`), rerunning this script and letting the test tell you which caption now disagrees. Changing the cluster requires updating its NED fields and citation in the sidecar and rerunning the membership check.

NED acknowledgment: this work has made use of the NASA/IPAC Extragalactic Database (NED), funded by NASA and operated by the California Institute of Technology. Nearby-layer citations are listed in [nearby-galaxies.md](nearby-galaxies.md); OpenNGC-derived fields remain CC BY-SA 4.0.

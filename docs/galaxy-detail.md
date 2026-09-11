# Resolved galaxy prototypes

The first model replaces the existing NGC 4026 catalog point, DESI target **39633263488141603** (dense ID 13414618). It is matched through `REF_CAT=L3`, `REF_ID=801183` to the [Siena Galaxy Atlas entry](https://sga.legacysurvey.org/?sgaid__gte=801183&sgaid__lte=801183). NGC 3982 adds a spiral test, documented below. All other catalog observations now use the streamed models described below. NGC 4026 is a lenticular (S0) galaxy; its smooth model is retained instead of assigning it spiral arms ([classification reference](https://www.ipac.caltech.edu/publication/1988A%26A...199...41V)).

## NGC 4026 measurements and provenance

`scripts/prepare_galaxy_detail.py` reads zero-based row 26509104 from the verified DESI DR1 FITS source. It verifies primary-record eligibility, identity, SGA reference, and correspondence with the checksum-verified existing leaf metadata. The sidecar retains the original source URL, source checksum, row checksum, and measured fields. There is no new catalog match based only on coordinate proximity.

| Property | Value |
| --- | --- |
| RA / Dec | 179.85448679932676° / +50.96165741661699° |
| Redshift | 0.003292937922230409 |
| Comoving distance | 14.579349261873272 Mpc, existing Planck18 result |
| `SHAPE_R` | 28.66065216064453 arcsec, major-axis half-light radius |
| `SHAPE_E1`, `SHAPE_E2` | 0.5204411149024963, −0.031164828687906265 |
| `SERSIC` | 1.8044934272766113 |
| Photometric profile type | `SER`; this is not a Hubble morphology classification |
| Derived apparent minor/major ratio | 0.3146016797918665 |
| Derived sky position angle | 178.2866° east of north, modulo 180° |

The [Legacy DR9 catalog documentation](https://www.legacysurvey.org/dr9/catalogs/) defines the imaging fields. Orientation follows the actual [`Tractor EllipseE.getRaDecBasis`](https://github.com/dstndstn/tractor/blob/main/tractor/ellipses.py) convention, avoiding ambiguous rendered position-angle formulas. In the local east/north tangent plane, let `theta = atan2(e2,e1)/2`, `q = (1-hypot(e1,e2))/(1+hypot(e1,e2))`. The major axis is `(sin(theta), cos(theta))`; the projected minor axis is `(cos(theta), -sin(theta))`. These are transformed into the atlas's equatorial Cartesian axes, not screen coordinates.

The world half-light radius is `D_C * SHAPE_R * pi/(180*3600)`, about **2.026 comoving kpc**. Physical size at emission is smaller by `1+z`; the map consistently uses comoving dimensions. The redshift distance is uncertain because local velocities are significant at this redshift. No independent distance measurement or velocity correction is introduced.

## Explicit model assumptions

The image alone does not determine a unique 3D galaxy. We choose a transparent, axisymmetric oblate model with intrinsic short/long axis ratio `q0=0.12`. Its inclination satisfies `cos(i)^2=(q^2-q0^2)/(1-q0^2)`. Projecting its covariance from the observer reproduces the measured ellipse. Either reflected tilt would do this; the displayed near side is an arbitrary fixed branch, not a measurement. A different assumed thickness would give a different inclination.

A positive sum of 19 Gaussians approximates the measured Sersic surface-brightness law. Maximum relative fitting error is 0.054% over 0.01–8 effective radii. The very center is regularized by finite Gaussian widths; display tails taper from 6 to 8 effective radii. These numerical choices and the illustrative exposure/color mapping mean the display is not photometrically calibrated. There are no measured individual stars, dust lanes, spiral arms, gas structures, rotation, or velocities in this model.

Each Gaussian is deprojected with the same oblate shape. The GPU evaluates its analytic line integral over the part of the viewing ray in front of the camera. This produces a true view-dependent volume with meaningful changes when orbiting or flying inside. It is not a photograph turned to face the camera. The inspector links to the original [Legacy Surveys sky image](https://www.legacysurvey.org/viewer?ra=179.8544868&dec=50.9616574&layer=ls-dr9&zoom=14) for comparison; that image is not bundled or used as a texture.

## NGC 3982 spiral test

The second sidecar matches DESI target **39633325333155389**, dense ID **13426480**, original FITS row **26540536**, through `REF_CAT=L3`, `REF_ID=678110`. It uses the same extraction, eligibility, checksum, and existing-metadata checks as NGC 4026.

| Property | Value |
| --- | --- |
| RA / Dec | 179.11738820825124° / +55.125143810334784° |
| Redshift | 0.00374319231740685 |
| Comoving distance | 16.571087037211587 Mpc |
| `SHAPE_R` | 18.033153533935547 arcsec |
| `SHAPE_E1`, `SHAPE_E2` | 0.05487750843167305, 0.03386843204498291 |
| `SERSIC` | 0.9111405611038208 |
| Derived apparent minor/major ratio | 0.8788387644479687 |
| Derived sky position angle | 15.84° east of north |
| Comoving half-light radius | About 1.449 kpc / 4.73 thousand light-years |

A 17-component positive Gaussian fit reproduces the smooth measured Sersic profile to **0.246%** maximum relative error over 0.01–8 effective radii. It shares the oblate deprojection and its ambiguities described above.

[Hubble imagery of NGC 3982](https://esahubble.org/images/opo1036a/) establishes that this is a spiral galaxy with star-forming structure. The prototype adds **illustrative**, unmeasured arms: two logarithmic arms, 22° pitch, fixed phase/handedness, finite thickness, and 24,000 deterministic light knots. Their plane uses the measured global ellipse and assumed deprojection; the exact pitch, winding, near side, individual knots, colors, and arm phase are not recovered from telescope pixels. The extra light means the composite image is not an exact Sersic profile or a calibrated surface-brightness measurement. GPU profile validation isolates the measured smooth component.

Knots are one batched geometry in true 3D, with small Gaussian sprites and an inter-arm component. The arm field extends to 4.5 effective radii and fades with the volume's angular-size transition. Each knot represents illustrative light, not an individual observed star. The source image is not redistributed or used as a texture.

## Catalog-wide variants

`scripts/prepare_model_catalog.py` extracts aligned imaging profiles for all **14,140,375** accepted observations, without changing positions or distances. It packages profiles for every existing spatial node, including parent samples. **12,097,577** records have a finite positive size, usable ellipticity, and an extended imaging fit (REX, EXP, DEV or SER). **2,042,798** do not; outside the local-distance safeguard, their display uses a smooth illustrative model with assumed **5 kpc comoving half-light radius**, zero projected ellipticity and no claimed orientation. The inspector explicitly distinguishes these assumptions.

The 3,128 exact named central matches have visual types from SGA/HyperLEDA, with OpenNGC filling missing recognized types. The current family counts are 1,657 spiral, 389 barred spiral, 285 elliptical, 657 lenticular and 140 irregular. Case matters: `Sb` is a spiral stage, while `SB` denotes a bar. Unrecognized or ambiguous-only labels remain unclassified. These are catalog classifications, not newly inferred observations. [SGA defines its visual MORPHTYPE field](https://www.legacysurvey.org/sga/sga2020/); [Legacy Surveys defines the distinct imaging-fit types](https://www.legacysurvey.org/dr9/catalogs/).

| Variant | Display structure | Example |
| --- | --- | --- |
| Spiral | Logarithmic arms and a smooth light volume | NGC 3982 |
| Barred spiral | Arms beginning near an illustrative central bar | NGC 5107 |
| Elliptical | Smooth, warmer, thicker oblate light volume | NGC 4121 |
| Lenticular | Smooth flattened light volume without arms | NGC 4026 |
| Irregular | Asymmetric clumps and a diffuse blue light component | NGC 3738 |

These families follow the broad [NASA galaxy-type descriptions](https://science.nasa.gov/universe/galaxies/types/). Without a recorded visual classification, the display uses a **labeled approximation**: concentrated fitted profiles (n ≥ 2.5) receive a spheroidal model, round exponential fits a smooth disk, other usable extended fits a disk with illustrative arms, and missing shapes a generic smooth model. A Sersic index or exponential fit does **not** establish spiral arms, an elliptical classification, or a unique 3D shape.

The assumed intrinsic axis ratio is 0.12 for disks, 0.65 for ellipticals, and 0.30 for irregulars, reduced to 95% of the measured projected axis ratio when necessary to permit deprojection. The same covariance construction preserves every usable projected ellipse. Round fits have no constrained sky position angle. The choice of thickness, reflected tilt, all internal arms/bars/clumps, and color remain unmeasured. Active nuclei and dwarf size categories are not treated as separate shape families or invented from absent measurements.

Generic smooth profiles use a 56-entry Gaussian library for n=0.5–6 in 0.1 steps; maximum index quantization is 0.05 within that range. The n=0.5 case is an exact Gaussian. Each entry uses at most 20 positive components, with maximum error below 0.426% relative to `max(Sersic intensity, 0.001)` over 0.01–8 effective radii. This is a weighted fit bound, not a relative error guarantee in arbitrarily faint tails; quantization and illustrative structure add further differences. The inspector and documentation do not claim photometric calibration. The original NGC 4026 and NGC 3982 profiles remain unchanged.

Generic structure uses 12,000 deterministic batched light knots, seeded from the exact catalog dense ID. Spiral pitch, arm count and phase vary within a small illustrative range; bars and irregular clumps are also seeded. NGC 3982 preserves its existing appearance. Knots are light samples, not resolved individual stars. The bounded model pool and fade behavior are described in [architecture](architecture.md#catalog-wide-galaxy-models).

## Next iterations

Image-constrained arm and dust geometry, improved distances for very nearby galaxies, and probabilistic morphology catalogs can replace assumptions as data becomes available. Do not present the current proxy populations as a measured distribution of visual galaxy types.

## Navigation visibility

Automatic close-ups yield to points when they would obstruct the camera. The fade spans projected half-light radii of 6–16% of the shorter viewport side; this is a display cue, not a change in physical size. Visit, Focus, and Observer-facing view explicitly protect the chosen model for full close-up exploration. Milky Way and Overview remove that catalog exemption without discarding the inspected observation. Settings can limit models to the focused galaxy or show points only.

## Milky Way

A separate [Milky Way reference model](milky-way.md) is available even with the bootstrap dataset. It shares the volume renderer and uses adopted Galactic geometry, an illustrative bar/spiral disk and bulge. It adds one fixed home model beside the bounded catalog pool. The Milky Way toolbar button and name search center this model on the Galactic core, with Sun / Observer as a separate focus; its dedicated inspector supplies sources without manufacturing a DESI record.

## Local-distance exception

Profile sidecars still cover every accepted record. The renderer now withholds physical models for redshift-only observer distances below 1 Mpc, because the inferred distances and corresponding physical sizes are unreliable at these scales. Such positions are hidden by default or shown as amber points through Settings. This applies even to manually focused records and does not affect the separately sourced Milky Way reference. See [the confirmed embedded-position audit](local-distance-audit.md); the six separately sourced nearby entries bypass this guard without correcting the original DESI records.

## Independently measured neighbors

Six additional nearby models share `ResolvedGalaxy` and `GalaxyVolume`, with adopted sizes, projected ellipses and independently measured distances. Their local distance is used directly; no redshift is fabricated. M31/M33 are disk approximations, M32/M110 use measured half-light ellipses with illustrative Sérsic profiles, and the Clouds disclose assumed sizes/structure and missing orientation. Their identities, counts and geometry budget remain separate from DESI. See [nearby-galaxies.md](nearby-galaxies.md) for the exact source and rendering assumptions.

## All-spiral appearance

The requested default now renders every source family as a spiral illustration. Settings → Galaxy appearance → Catalog types restores the measured/proxy families described above. Original type metadata, Gaussian profiles, exact positions and adopted radii/sky ellipses are retained; only rendering parameters change. The common exponential profile, assumed thin depth, two arms and colors in this mode are visual choices. They must not be presented as a measured morphology distribution. `scripts/prepare_spiral_profile.py` regenerates its small Gaussian profile from the analytic exponential law.

The more distant transition spans projected half-light radii of 0.6–5 CSS pixels. Resident models remain candidates even when their source point node leaves the displayed frontier. A 30% resident ranking margin and 0.6-second arrival/departure fades prevent abrupt pool replacement during orbiting. The final blend also controls the complementary point and body hit testing. Automatic foreground-obstruction fading and deliberate focus behavior remain in force.

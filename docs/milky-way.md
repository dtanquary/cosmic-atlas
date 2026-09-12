# Milky Way reference model

## Photographic appearance revision

The next visual revision uses [Hubble's 2025 Andromeda panorama](https://esahubble.org/images/heic2501a/) (NASA, ESA, B. Williams / University of Washington) as a reference for continuous starlight, warm inner light, muted blue outer populations, and dark filamentary dust. It does not copy Andromeda's dimensions, bulge-to-disk ratio, or viewing angle. No telescope image is distributed as a texture.

The implementation target is one bounded, camera-relative volume with a deterministic procedural disk field and front-to-back dust attenuation. Replace the bright point-sampled bar and isolated blue clumps with a softly integrated bar/bulge, a filled stellar disk and finer, less uniform arms. Retain the adopted core, Sun position, disk scale and bar geometry below. Arm details, dust distribution, colors and exposure remain illustrative. [Shen & Zheng's review](https://arxiv.org/abs/2012.10130) describes the Milky Way's box/peanut bar-bulge, four-arm structure and Local arm; it also explains why an external view remains a reconstruction.

Acceptance: inspect face-on, inclined, edge-on and inside-disk views on the actual GPU; check restrained highlights and dust contrast, one fixed resource budget, context recovery, home navigation/picking, and existing close-up visibility rules. Do not change catalog-wide galaxy appearance.

The observer remains at the atlas origin (the Solar System). The Galactic center is offset by 8.122 kpc in the ICRS direction RA 266.4051°, Dec −28.936175°. The physical midplane includes a 20.8 pc solar height. These are adopted reference parameters, not an assertion of uniquely known or latest Galactic parameters.

`uv run python scripts/prepare_milky_way.py` reproduces `src/data/milky-way.json` using Astropy's pinned `Galactocentric` **v4.0** frame. Transforming its origin and three Cartesian basis endpoints to ICRS supplies the atlas center and right-handed basis. The full reference citations are retained in the JSON. See [Astropy's frame definition](https://docs.astropy.org/en/stable/coordinates/galactocentric.html).

The visual model adopts a 2.6 kpc exponential disk scale length from [Jurić et al., Milky Way Tomography](https://arxiv.org/abs/astro-ph/0510520). An analytic Gaussian mixture approximates that exponential; its effective radius is 1.67834699 times the scale length. This is a model scale, not a measured DESI half-light radius for our Galaxy.

The bar adopts a 5 kpc half-length and 28° angle to the center–Sun line, within the estimates of [Wegg, Gerhard & Portail](https://arxiv.org/abs/1504.01401). The nearer end points toward positive Galactic longitude. Two illustrative logarithmic arms start near the bar ends. Their pitch, phase beyond the bar, knots, disk truncation, oblate thickness, bulge profile, colors and exposure are visual assumptions. This is neither a resolved star catalog nor an image of the Milky Way seen from outside.

One fixed reference model uses a smooth disk, a bulge and 32,000 deterministic light knots (three draw calls). It shares the camera-relative volume renderer with the catalog models but has no invented DESI identity or redshift and does not change any catalog counts, positions or measurements.

The Milky Way toolbar button (formerly Observer) and name search arrive 60 kpc from the Galactic center in an oblique disk view. Zoom and orbit remain centered on the core. The inspector highlights the active focus; Sun / Observer explicitly targets our location at the origin instead. Separate core and Sun labels explain their physical offset. Home focus protects the Milky Way from incidental-obstruction fading; Overview and visits to other galaxies restore automatic behavior. Points-only still hides its volumes. Neither navigation choice moves or rescales the Galaxy.

Visual direction: the user's galaxy-field reference image calls for dark space, restrained glow, recognizable small shapes, and varied orientations. A future intermediate silhouette level can support that density without allocating full volumes to thousands of galaxies; it is separate from this fixed home-galaxy model.

The sharp points previously embedded in the home model included real catalog positions derived from extremely small positive redshifts. The [catalog audit](local-distance-audit.md) confirms this separately from background projection and illustrative light knots. Redshift-only catalog positions below 1 Mpc from the Sun are now hidden by default, with an explicit amber raw-position setting. The filter leaves the Milky Way's adopted dimensions and placement unchanged. Its blue/warm knots remain illustrative light samples; background objects can still project across its transparent light volume.

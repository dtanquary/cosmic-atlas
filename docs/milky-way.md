# Milky Way reference model

The observer remains at the atlas origin (the Solar System). The Galactic center is offset by 8.122 kpc in the ICRS direction RA 266.4051°, Dec −28.936175°. The physical midplane includes a 20.8 pc solar height. These are adopted reference parameters, not an assertion of uniquely known or latest Galactic parameters.

`uv run python scripts/prepare_milky_way.py` reproduces `src/data/milky-way.json` using Astropy's pinned `Galactocentric` **v4.0** frame. Transforming its origin and three Cartesian basis endpoints to ICRS supplies the atlas center and right-handed basis. The full reference citations are retained in the JSON. See [Astropy's frame definition](https://docs.astropy.org/en/stable/coordinates/galactocentric.html).

The visual model adopts a 2.6 kpc exponential disk scale length from [Jurić et al., Milky Way Tomography](https://arxiv.org/abs/astro-ph/0510520). An analytic Gaussian mixture approximates that exponential; its effective radius is 1.67834699 times the scale length. This is a model scale, not a measured DESI half-light radius for our Galaxy.

The bar adopts a 5 kpc half-length and 28° angle to the center–Sun line, within the estimates of [Wegg, Gerhard & Portail](https://arxiv.org/abs/1504.01401). The nearer end points toward positive Galactic longitude. Two illustrative logarithmic arms start near the bar ends. Their pitch, phase beyond the bar, knots, disk truncation, oblate thickness, bulge profile, colors and exposure are visual assumptions. This is neither a resolved star catalog nor an image of the Milky Way seen from outside.

One fixed reference model uses a smooth disk, a bulge and 32,000 deterministic light knots (three draw calls). It shares the camera-relative volume renderer with the catalog models but has no invented DESI identity or redshift and does not change any catalog counts, positions or measurements.

The Milky Way toolbar button (formerly Observer) and name search arrive 60 kpc from the Galactic center in an oblique disk view. Zoom and orbit remain centered on the core. The inspector highlights the active focus; Sun / Observer explicitly targets our location at the origin instead. Separate core and Sun labels explain their physical offset. Home focus protects the Milky Way from incidental-obstruction fading; Overview and visits to other galaxies restore automatic behavior. Points-only still hides its volumes. Neither navigation choice moves or rescales the Galaxy.

Visual direction: the user's galaxy-field reference image calls for dark space, restrained glow, recognizable small shapes, and varied orientations. A future intermediate silhouette level can support that density without allocating full volumes to thousands of galaxies; it is separate from this fixed home-galaxy model.

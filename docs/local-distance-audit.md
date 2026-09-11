# Nearby catalog placement audit — 11 September 2026

Status: confirmed limitation; application behavior has not yet been changed.

The user noticed sharp galaxy points apparently inside the Milky Way. This is not explained solely by background projection or by model enlargement. The accepted catalog includes positive redshifts extremely close to zero, and the importer turns each into a Planck18 comoving distance. These numerical positions are unsuitable as reliable distances within the Local Group.

The audit used the full DR1 manifest's leaf bounds to find every leaf intersecting a sphere of radius `8 * milkyWay.radiusMpc` around the adopted Galactic center. One of 882 leaves intersects it. Its metadata SHA-256 was checked, then float64 positions were reconstructed from stored RA, Dec and distance. No overview samples or float32 point coordinates were used. The checked-in frame axes and disk thickness ratio 0.07 define the additional ellipsoid checks.

- **1,107 accepted observations** lie within the model's 34.91 kpc bounding sphere.
- **186** lie within the flattened 8-effective-radius disk envelope used for this audit.
- **80** lie within the model's 4-effective-radius body-picking ellipsoid.
- Their catalog redshifts range from **1.4432e-9 to 9.2531e-6**.
- The closest point to the adopted core is placed 4.032 kpc away, using a Sun distance of 6.628 kpc. This is an inferred catalog position, not a verified nearby galaxy.

These envelopes describe rendering geometry, not sharp physical boundaries of the Milky Way. [Audit values and example target IDs](local-distance-audit.json) preserve the observations. The catalog classification and fit flags alone do not establish that these objects are external galaxies at the inferred distances; determining their actual identity or distance requires additional cross-matching and validation.

[NASA/IPAC NED explains](https://ned.ipac.caltech.edu/Documents/Overview) that peculiar velocities make redshift-based Hubble distances inaccurate in the Local Group and nearby clusters, requiring distances measured by other methods. The importer currently accepts `SPECTYPE = GALAXY`, `ZWARN = 0` and finite positive redshift without such a nearby-distance policy. This is a limitation of applying the survey-distance approximation locally, not evidence for hundreds of galaxies embedded in the Milky Way.

Two additional display effects matter: galaxy light is additively blended without obscuring background catalog points, and the model's blue/warm grain is made from illustrative light particles rather than a measured star catalog. A screenshot alone cannot distinguish all three causes.

Recommended next change: retain the raw observations and full catalog coverage, distinguish uncertain nearby redshift positions from validated local destinations, and use sourced redshift-independent distances for nearby galaxies. A close-up display policy should prevent those uncertain positions from being presented as confirmed objects inside the home galaxy. Reducing the Milky Way's physical size would conceal the symptom without correcting the distance inference. No filtering, repositioning or new local-distance data has been applied in this audit.

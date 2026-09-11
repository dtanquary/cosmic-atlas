# Nearby catalog placement audit — 11 September 2026

Status: confirmed distance limitation; display safeguard implemented and verified. The underlying catalog distances have not been corrected.

The user noticed sharp galaxy points apparently inside the Milky Way. This is not explained solely by background projection or by model enlargement. The accepted catalog includes positive redshifts extremely close to zero, and the importer turns each into a Planck18 comoving distance. These numerical positions are unsuitable as reliable distances within the Local Group.

The audit used the full DR1 manifest's leaf bounds to find every leaf intersecting a sphere of radius `8 * milkyWay.radiusMpc` around the adopted Galactic center. One of 882 leaves intersects it. Its metadata SHA-256 was checked, then float64 positions were reconstructed from stored RA, Dec and distance. No overview samples or float32 point coordinates were used. The checked-in frame axes and disk thickness ratio 0.07 define the additional ellipsoid checks.

- **1,107 accepted observations** lie within the model's 34.91 kpc bounding sphere.
- **186** lie within the flattened 8-effective-radius disk envelope used for this audit.
- **80** lie within the model's 4-effective-radius body-picking ellipsoid.
- Their catalog redshifts range from **1.4432e-9 to 9.2531e-6**.
- The closest point to the adopted core is placed 4.032 kpc away, using a Sun distance of 6.628 kpc. This is an inferred catalog position, not a verified nearby galaxy.

These envelopes describe rendering geometry, not sharp physical boundaries of the Milky Way. [Audit values and example target IDs](local-distance-audit.json) preserve the observations. The catalog classification and fit flags alone do not establish that these objects are external galaxies at the inferred distances; determining their actual identity or distance requires additional cross-matching and validation.

[NASA/IPAC NED explains](https://ned.ipac.caltech.edu/Documents/Overview) that peculiar velocities make redshift-based Hubble distances inaccurate in the Local Group and nearby clusters, requiring distances measured by other methods. The importer accepts `SPECTYPE = GALAXY`, `ZWARN = 0` and finite positive redshift without independently measured nearby distances. This is a limitation of applying the survey-distance approximation locally, not evidence for hundreds of galaxies embedded in the Milky Way.

Two additional display effects matter: galaxy light is additively blended without obscuring background catalog points, and the model's blue/warm grain is made from illustrative light particles rather than a measured star catalog. A screenshot alone cannot distinguish all three causes.

The implemented display safeguard retains all observations and hides redshift-only positions with inferred observer distance below 1 Mpc by default. **Show uncertain local positions** in Settings reveals them as amber points, with no physical models and explicit distance/separation warnings. The HUD discloses the policy and labels the full total as catalog observations; submitted-point counts include hidden records. A selected record remains inspectable when hidden, but its focus action, marker and measurement line are suppressed. The Milky Way's physical geometry is unchanged.

The 1 Mpc radius is a conservative display policy, not a scientific boundary of reliable distances. CPU metadata uses float64, while shader decisions use existing chunk-relative float32 render positions, so classifications immediately at the boundary have rendering-precision limits. No observations have been removed or repositioned. Integrating validated, redshift-independent distances remains future work.

The actual-GPU regression renders the 1,107 positions from four orbit angles. Before the fix they cover 8,723–10,934 pixels; afterward protected display and ID passes cover zero, including disabled fading and a 100% minimum-opacity floor. Raw mode draws amber points and retains ID hits. A real nonzero-origin chunk also verifies the production uniform callback, exact GPU ID, saved setting, visit rejection while hidden, raw visits, model withholding, annotation lifecycle and preserved records. The external control point remains visible/pickable. See [validation](validation.md) and [raw reports](validation-results.json).

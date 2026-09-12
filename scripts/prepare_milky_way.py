"""Small reproducible reference model; never modifies the DESI catalog."""
import json
from pathlib import Path
import astropy.units as u
from astropy.coordinates import Galactocentric, ICRS, galactocentric_frame_defaults
import numpy as np

with galactocentric_frame_defaults.set('v4.0'):
    frame = Galactocentric()
    def world(x, y, z):
        return Galactocentric(x=x*u.kpc, y=y*u.kpc, z=z*u.kpc, **{k:getattr(frame,k) for k in frame.frame_attributes}).transform_to(ICRS()).cartesian.xyz.to_value(u.Mpc)
    center = world(0, 0, 0)
    axes = [(world(*axis)-center)/.001 for axis in np.eye(3)]
    result = dict(version=1, name='Milky Way', frame='Astropy Galactocentric v4.0 → ICRS',
        centerMpc=center.tolist(), axes=[axis.tolist() for axis in axes],
        centerRaDeg=frame.galcen_coord.ra.deg, centerDecDeg=frame.galcen_coord.dec.deg,
        observerDistanceMpc=frame.galcen_distance.to_value(u.Mpc), solarHeightMpc=frame.z_sun.to_value(u.Mpc),
        diskScaleMpc=.0026, radiusMpc=.0026*1.67834699,
        barHalfLengthMpc=.005, barAngleDeg=28,
        sources={'frame':'https://docs.astropy.org/en/stable/coordinates/galactocentric.html',
            'disk':'https://arxiv.org/abs/astro-ph/0510520', 'bar':'https://arxiv.org/abs/1504.01401',
            'structure':'https://arxiv.org/abs/2012.10130',
            'appearanceReference':'https://esahubble.org/images/heic2501a/'},
        frameReferences=frame.frame_attribute_references,
        assumptions='Disk scale and bar dimensions are adopted literature estimates. The bar/bulge light profile, arm paths, local spur, vertical profiles, dust, outer taper, emission regions, colors and exposure are illustrative. Appearance is guided by Hubble images of Andromeda, without copying its dimensions or redistributing telescope pixels. This is not a star catalog, calibrated photometry or an observed external image of the Milky Way.')
    path = Path(__file__).resolve().parents[1]/'src/data/milky-way.json'
    path.write_text(json.dumps(result,indent=2)+'\n')
    print(f'Wrote {path.name}; center distance {np.linalg.norm(center)*1000:.3f} kpc')

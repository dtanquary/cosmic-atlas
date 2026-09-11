"""Small reproducible reference model; never modifies the DESI catalog."""
import json
from pathlib import Path
import astropy.units as u
from astropy.coordinates import Galactocentric, ICRS, galactocentric_frame_defaults
import numpy as np
from scipy.optimize import nnls

with galactocentric_frame_defaults.set('v4.0'):
    frame = Galactocentric()
    def world(x, y, z):
        return Galactocentric(x=x*u.kpc, y=y*u.kpc, z=z*u.kpc, **{k:getattr(frame,k) for k in frame.frame_attributes}).transform_to(ICRS()).cartesian.xyz.to_value(u.Mpc)
    center = world(0, 0, 0)
    axes = [(world(*axis)-center)/.001 for axis in np.eye(3)]
    # Illustrative exponential disk, using the 2.6 kpc stellar scale length.
    r = np.geomspace(.005, 8, 500)
    sigma = np.geomspace(.015, 3, 16)
    brightness = np.exp(-1.67834699*r)
    matrix = np.exp(-.5*(r[:,None]/sigma)**2)
    weight = 1/np.maximum(brightness, .003)
    peaks, _ = nnls(matrix*weight[:,None], brightness*weight)
    result = dict(version=1, name='Milky Way', frame='Astropy Galactocentric v4.0 → ICRS',
        centerMpc=center.tolist(), axes=[axis.tolist() for axis in axes],
        centerRaDeg=frame.galcen_coord.ra.deg, centerDecDeg=frame.galcen_coord.dec.deg,
        observerDistanceMpc=frame.galcen_distance.to_value(u.Mpc), solarHeightMpc=frame.z_sun.to_value(u.Mpc),
        diskScaleMpc=.0026, radiusMpc=.0026*1.67834699,
        barHalfLengthMpc=.005, barAngleDeg=28,
        gaussians=[dict(sigmaRe=float(s),peak=float(p)) for s,p in zip(sigma,peaks)],
        sources={'frame':'https://docs.astropy.org/en/stable/coordinates/galactocentric.html',
            'disk':'https://arxiv.org/abs/astro-ph/0510520', 'bar':'https://arxiv.org/abs/1504.01401'},
        frameReferences=frame.frame_attribute_references,
        assumptions='Disk scale and bar dimensions are adopted literature estimates. The smooth light mixture, oblate depth, bulge, arms, knots, outer extent, and colors are illustrative; not a star catalog or observed image.')
    path = Path(__file__).resolve().parents[1]/'src/data/milky-way.json'
    path.write_text(json.dumps(result,indent=2)+'\n')
    print(f'Wrote {path.name}; center distance {np.linalg.norm(center)*1000:.3f} kpc')

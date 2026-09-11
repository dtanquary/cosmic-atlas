"""Build the small nearby layer from pinned, cited measurements; no DESI edits."""
import hashlib
import json
import math
from pathlib import Path
import numpy as np
from astropy.coordinates import SkyCoord
import astropy.units as u
from scipy.optimize import nnls

ROOT = Path(__file__).resolve().parents[1]

def main():
    source_bytes = (ROOT/'src/data/nearby-sources.json').read_bytes()
    source = json.loads(source_bytes)
    source['source']['excerptSha256'] = hashlib.sha256(source_bytes).hexdigest()
    profiles, fit_errors = {}, {}
    for n in [1, 2]:
        r = np.geomspace(.005, 8, 500)
        sigma = np.geomspace(.008, 3, 20)
        b = 1.67834699 if n == 1 else 3.67206075
        light = np.exp(-b*r**(1/n))
        matrix = np.exp(-.5*(r[:, None]/sigma)**2)
        weight = 1/np.maximum(light, .003)
        peaks, _ = nnls(matrix*weight[:, None], light*weight)
        fit_errors[n] = float(np.max(np.abs(matrix @ peaks - light) / light))
        profiles[n] = [dict(sigmaRe=float(s), peak=float(p)) for s, p in zip(sigma, peaks)]
    entries = []
    for item in source['entries']:
        c = SkyCoord(item['ra'], item['dec'], unit=(u.hourangle, u.deg), frame='icrs')
        distance = item.get('distanceKpc')
        if distance is None: distance = 10**((item['distanceModulus']+5)/5)/1000
        radius_arcsec = item.get('radiusArcmin', 0)*60
        if not radius_arcsec: radius_arcsec = item['radiusKpc']/distance*180/math.pi*3600
        q, pa = item['axisRatio'], item.get('positionAngleDeg') or 0
        e = (1-q)/(1+q)
        entries.append(dict(**item, raDeg=float(c.ra.deg), decDeg=float(c.dec.deg),
            distanceMpc=distance/1000, radiusArcsec=radius_arcsec,
            e1=e*math.cos(2*math.radians(pa)), e2=e*math.sin(2*math.radians(pa)),
            gaussians=profiles[2 if item['family']=='elliptical' else 1],
            profileFitMaxRelativeError=fit_errors[2 if item['family']=='elliptical' else 1]))
    out = ROOT/'src/data/nearby-galaxies.json'
    out.write_text(json.dumps(dict(version=1, source=source['source'], entries=entries), indent=2)+'\n')
    print(f'Wrote {len(entries)} nearby galaxies; original DESI assets untouched.')

if __name__ == '__main__': main()

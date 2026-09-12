"""Place the road trip's cited cluster stop on the catalog's Planck18 axes and count DESI rows around it.

Reads the NED position and redshift pinned in src/data/tour-sources.json, writes the comoving Cartesian
center into the cluster stop of src/data/tours.json, and records in the sidecar how many accepted DR1
rows the checksum-verified leaf metadata holds within RADIUS_DEG of that direction and DZ of that
redshift. Captions, framing distances and every other stop are hand-written; tests/tours.test.ts
checks them against their sources.
"""
import json
import math
import sys
from pathlib import Path

import numpy as np
from astropy.cosmology import Planck18
from prepare_data import leaf_metadata

ROOT = Path(__file__).resolve().parents[1]
# ponytail: fixed cone count, not membership; use a virial-radius cut if a caption ever claims members
RADIUS_DEG, DZ, MIN_ROWS = 2, .01, 200


def load(path):
    return json.loads((ROOT / path).read_text())


def dump(path, value):
    (ROOT / path).write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')


def cartesian(ra_deg, dec_deg, distance):
    """Same axes as src/format.ts: x toward RA 0°, y toward RA 90°, z to the north celestial pole."""
    a, d = math.radians(ra_deg), math.radians(dec_deg)
    return [distance * math.cos(d) * math.cos(a), distance * math.cos(d) * math.sin(a), distance * math.sin(d)]


def rows_near(manifest, directory, ra, dec, z):
    """Accepted rows within RADIUS_DEG of (ra, dec) with |Z - z| < DZ, reading only leaves whose bounds can hold such rows."""
    near, far = (float(Planck18.comoving_distance(z + s * DZ).value) for s in (-1, 1))
    center = np.array(cartesian(ra, dec, (near + far) / 2))
    reach = (far - near) / 2 + far * math.sin(math.radians(RADIUS_DEG)) + 1  # 1 Mpc margin over the render-precision node bounds
    axis, cos_limit, count, leaves = np.array(cartesian(ra, dec, 1)), math.cos(math.radians(RADIUS_DEG)), 0, 0
    for node in manifest['nodes']:
        if node['children']:
            continue
        gap = np.maximum(0, np.maximum(np.array(node['min']) - center, center - np.array(node['max'])))
        if np.linalg.norm(gap) > reach:
            continue
        rows = leaf_metadata(directory, node)
        ra_r, dec_r = np.deg2rad(rows['ra']), np.deg2rad(rows['dec'])
        cos_sep = np.cos(dec_r) * np.cos(ra_r) * axis[0] + np.cos(dec_r) * np.sin(ra_r) * axis[1] + np.sin(dec_r) * axis[2]
        count += int(np.count_nonzero((cos_sep >= cos_limit) & (np.abs(rows['z'] - z) < DZ)))
        leaves += 1
    return count, leaves


def main():
    directory = ROOT / 'public/data/dr1'
    manifest = load('public/data/dr1/manifest.json')
    sources, tours = load('src/data/tour-sources.json'), load('src/data/tours.json')
    clusters = {cluster['key']: cluster for cluster in sources['clusters']}
    for stop in (stop for tour in tours['tours'] for stop in tour['stops'] if stop['target']['kind'] == 'cluster'):
        cluster = clusters[stop['target']['key']]
        count, leaves = rows_near(manifest, directory, cluster['raDeg'], cluster['decDeg'], cluster['redshift'])
        print(f"{cluster['name']}: {count:,} accepted DR1 rows within {RADIUS_DEG}° and |Δz| < {DZ} ({leaves} leaves read)")
        if count < MIN_ROWS:
            print(f"FAIL: fewer than {MIN_ROWS} rows around {cluster['name']}; choose another cluster in tour-sources.json.", file=sys.stderr)
            sys.exit(1)
        comoving = float(Planck18.comoving_distance(cluster['redshift']).value)
        stop['target']['positionMpc'] = cartesian(cluster['raDeg'], cluster['decDeg'], comoving)
        cluster['desiMembers'] = {'count': count, 'radiusDeg': RADIUS_DEG, 'redshiftWindow': DZ,
                                  'catalogId': manifest['id'], 'catalogSourceSha256': manifest['source']['sha256']}
        print(f"  center {comoving:.3f} Mpc comoving at {stop['target']['positionMpc']}")
    dump('src/data/tour-sources.json', sources)
    dump('src/data/tours.json', tours)
    print('Wrote tours.json and tour-sources.json')


if __name__ == '__main__':
    main()

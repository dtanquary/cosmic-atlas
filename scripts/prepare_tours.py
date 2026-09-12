"""Fill the derived numbers of the tour routes: Planck18 lookbacks and the cited cluster stop.

Inputs: src/data/tour-sources.json (NED position and redshift with reference codes), the prepared
DR1 catalog, nearby-galaxies.json, milky-way.json, cosmic-horizon.json and galaxy-search.json.
Rewrites every factCheck in src/data/tours.json, places the cluster stop on the catalog's Planck18
comoving axes and counts accepted DR1 rows around it from checksum-verified leaf metadata.
Captions stay hand-written; tests/tours.test.ts checks that they repeat these numbers.
"""
import gzip
import hashlib
import json
import math
import sys
from pathlib import Path

import numpy as np
from astropy import units as u
from astropy.constants import c
from astropy.cosmology import Planck18, z_at_value
from prepare_data import META

ROOT = Path(__file__).resolve().parents[1]


def load(path):
    return json.loads((ROOT / path).read_text())


def dump(path, value):
    (ROOT / path).write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')


def cartesian(ra_deg, dec_deg, distance):
    """Same axes as src/format.ts: x toward RA 0°, y toward RA 90°, z to the north celestial pole."""
    a, d = math.radians(ra_deg), math.radians(dec_deg)
    return [distance * math.cos(d) * math.cos(a), distance * math.cos(d) * math.sin(a), distance * math.sin(d)]


def light_travel(mpc):
    """Directly measured distances (nearby layer, Milky Way): light travel time is distance ÷ c."""
    return float((mpc * u.Mpc / c).to(u.Gyr).value)


def lookback(mpc):
    """Redshift-derived positions: Planck18 lookback time for a present-day comoving distance."""
    return float(Planck18.lookback_time(z_at_value(Planck18.comoving_distance, mpc * u.Mpc)).value)


def members(manifest, directory, cluster, rule):
    """Accepted rows within rule['radiusDeg'] of the center with |Z - z| < rule['redshiftWindow'].

    Only leaves whose bounds can hold such rows are read; each is checksum-verified as in prepare_galaxy_search.py.
    """
    ra, dec, z = cluster['raDeg'], cluster['decDeg'], cluster['redshift']
    near, far = (float(Planck18.comoving_distance(z + s * rule['redshiftWindow']).value) for s in (-1, 1))
    center = np.array(cartesian(ra, dec, (near + far) / 2))
    reach = (far - near) / 2 + far * math.sin(math.radians(rule['radiusDeg'])) + 1  # 1 Mpc margin over the render-precision node bounds
    axis, cos_limit, count, leaves = np.array(cartesian(ra, dec, 1)), math.cos(math.radians(rule['radiusDeg'])), 0, 0
    for node in manifest['nodes']:
        if node['children']:
            continue
        gap = np.maximum(0, np.maximum(np.array(node['min']) - center, center - np.array(node['max'])))
        if np.linalg.norm(gap) > reach:
            continue
        compressed = (directory / node['metadata']['url']).read_bytes()
        assert hashlib.sha256(compressed).hexdigest() == node['metadata']['sha256']
        rows = np.frombuffer(gzip.decompress(compressed), META, offset=16)
        assert len(rows) == node['count']
        ra_r, dec_r = np.deg2rad(rows['ra']), np.deg2rad(rows['dec'])
        cos_sep = np.cos(dec_r) * np.cos(ra_r) * axis[0] + np.cos(dec_r) * np.sin(ra_r) * axis[1] + np.sin(dec_r) * axis[2]
        count += int(np.count_nonzero((cos_sep >= cos_limit) & (np.abs(rows['z'] - z) < rule['redshiftWindow'])))
        leaves += 1
    return {'count': count, 'radiusDeg': rule['radiusDeg'], 'redshiftWindow': rule['redshiftWindow'], 'leavesRead': leaves,
            'catalogId': manifest['id'], 'catalogSourceSha256': manifest['source']['sha256']}


def main():
    directory = ROOT / 'public/data/dr1'
    manifest = load('public/data/dr1/manifest.json')
    sources, tours = load('src/data/tour-sources.json'), load('src/data/tours.json')
    nearby = {entry['key']: entry for entry in load('src/data/nearby-galaxies.json')['entries']}
    home, horizon = load('src/data/milky-way.json'), load('src/data/cosmic-horizon.json')
    names = {entry['name']: entry for entry in load('public/data/galaxy-search.json')['entries'] if 'id' in entry}
    clusters, rule = {cluster['key']: cluster for cluster in sources['clusters']}, sources['membership']
    for stop in (stop for tour in tours['tours'] for stop in tour['stops']):
        target, kind = stop['target'], stop['target']['kind']
        if kind == 'sun':
            continue  # cites no number
        if kind == 'core':
            d = home['observerDistanceMpc']
            stop['factCheck'] = {'distanceMpc': d, 'lookbackGyr': light_travel(d)}
        elif kind in ('nearby', 'localgroup'):
            key = stop.get('factCheck', {}).get('key') or ('m31' if kind == 'localgroup' else target['key'])
            d = nearby[key]['distanceMpc']
            stop['factCheck'] = {'key': key, 'distanceMpc': d, 'lookbackGyr': light_travel(d)}
            if kind == 'localgroup':
                m31 = nearby['m31']
                target['positionMpc'] = [v / 2 for v in cartesian(m31['raDeg'], m31['decDeg'], m31['distanceMpc'])]
        elif kind == 'overview':
            d = manifest['maxDistanceMpc']
            stop['factCheck'] = {'count': manifest['count'], 'distanceMpc': d, 'lookbackGyr': lookback(d)}
        elif kind == 'cmb':
            stop['factCheck'] = {'redshift': horizon['lastScatteringRedshift'], 'distanceMpc': horizon['radiusMpc'], 'lookbackGyr': horizon['lookbackGyr']}
        elif kind == 'catalog':
            d = names[target['name']]['distance']
            stop['factCheck'] = {'distanceMpc': d, 'lookbackGyr': lookback(d)}
        elif kind == 'cluster':
            cluster = clusters[target['key']]
            assert cluster['verified'], f"{cluster['name']}: position/redshift not verified against NED"
            found = members(manifest, directory, cluster, rule)
            print(f"{cluster['name']}: {found['count']:,} accepted DR1 rows within {rule['radiusDeg']}° and |Δz| < {rule['redshiftWindow']} ({found['leavesRead']} leaves read)")
            if found['count'] < rule['minimumRows']:
                print(f"FAIL: fewer than {rule['minimumRows']} rows. Fallback candidates:", file=sys.stderr)
                for other in sources['clusters']:
                    if other['role'] == 'fallback':
                        print(f"  {other['name']} ({other['query']}): {members(manifest, directory, other, rule)['count']:,} rows", file=sys.stderr)
                sys.exit(1)
            comoving = float(Planck18.comoving_distance(cluster['redshift']).value)
            target['positionMpc'], target['distanceMpc'] = cartesian(cluster['raDeg'], cluster['decDeg'], comoving), comoving
            stop['distanceMpc'] = 3 * cluster['framingRadiusMpc']
            stop['factCheck'] = {'redshift': cluster['redshift'], 'distanceMpc': comoving,
                                 'lookbackGyr': float(Planck18.lookback_time(cluster['redshift']).value), 'desiMembers': found}
            cluster['desiMembers'] = found
            print(f"  center {comoving:.3f} Mpc comoving at {target['positionMpc']}, framed from {stop['distanceMpc']} Mpc")
        else:
            raise ValueError(f'Unknown stop kind {kind}')
    dump('src/data/tour-sources.json', sources)
    dump('src/data/tours.json', tours)
    print(f"Wrote tours.json ({sum(len(tour['stops']) for tour in tours['tours'])} stops) and tour-sources.json")


if __name__ == '__main__':
    main()

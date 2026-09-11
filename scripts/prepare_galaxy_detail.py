"""Extract one measured galaxy profile without rebuilding the point catalog.

uv run python scripts/prepare_galaxy_detail.py
Requires the verified DESI FITS and the prepared full DR1 dataset. The Gaussian
mixture approximates the measured 2D Sersic profile; its 3D deprojection is a
separate, explicitly assumed oblate model in the viewer.
"""
import gzip
import hashlib
import json
from pathlib import Path

import numpy as np
from astropy.cosmology import Planck18
from scipy.optimize import nnls
from scipy.special import gammaincinv

from prepare_data import META, accepted_mask, header, project

ROOT = Path(__file__).resolve().parent.parent


def prepare(source_row, target_id, dense_id, name, sga_id, filename, spiral=False):
    directory = ROOT / 'public/data/dr1'
    manifest = json.loads((directory / 'manifest.json').read_text())
    dtype, offset, count = header(ROOT / '.cache/zall-pix-iron.fits')
    rows = np.memmap(ROOT / '.cache/zall-pix-iron.fits', mode='r', dtype=dtype,
                     offset=offset, shape=(count,))
    raw = rows[source_row]
    assert int(raw['TARGETID']) == target_id and accepted_mask(rows[source_row:source_row + 1])[0][0]
    assert raw['REF_CAT'] == b'L3' and int(raw['REF_ID']) == sga_id
    approximate = project(np.array([raw['TARGET_RA']]), np.array([raw['TARGET_DEC']]),
                          np.array([Planck18.comoving_distance(raw['Z']).value]))[0]

    def payload(asset):
        compressed = (directory / asset['url']).read_bytes()
        assert hashlib.sha256(compressed).hexdigest() == asset['sha256']
        return gzip.decompress(compressed)

    for node in manifest['nodes']:
        if node['children'] or not np.all((approximate >= node['min']) & (approximate <= node['max'])):
            continue
        points = payload(node['points'])
        ids = np.frombuffer(points, '<u4', offset=16 + 12 * node['storedCount'])
        found = np.flatnonzero(ids == dense_id)
        if len(found):
            record = np.frombuffer(payload(node['metadata']), META, offset=16)[found[0]]
            assert int(record['targetid']) == target_id
            break
    else:
        raise ValueError('The matched galaxy is missing from the full catalog')
    for column, source in [('ra', 'TARGET_RA'), ('dec', 'TARGET_DEC'), ('z', 'Z')]:
        assert record[column] == raw[source]

    # Positive Gaussian basis fitted to relative surface-brightness error. The
    # standard Sersic b_n sets half the total projected flux inside one R_e.
    n = float(raw['SERSIC'])
    b = gammaincinv(2 * n, .5)
    radius = np.geomspace(.01, 8, 500)
    profile = np.exp(-b * (radius ** (1 / n) - 1))
    sigma = np.geomspace(.007, 8, 20) if n > 1.5 else np.geomspace(.03, 3, 20)
    basis = np.exp(-.5 * (radius[:, None] / sigma) ** 2)
    peaks, _ = nnls(basis / profile[:, None], np.ones(len(radius)), maxiter=2000)
    error = float(np.max(np.abs(basis @ peaks / profile - 1)))
    assert error < .025, error
    mixture = [{'sigmaRe': float(s), 'peak': float(p)} for s, p in zip(sigma, peaks) if p > 1e-10]
    galaxy = {key: float(record[column]) for key, column in
              [('ra', 'ra'), ('dec', 'dec'), ('z', 'z'), ('zerr', 'zerr'), ('distance', 'distance'), ('delta', 'delta')]}
    galaxy.update(id=dense_id, targetId=str(target_id),
                  position=project(np.array([record['ra']]), np.array([record['dec']]), np.array([record['distance']]))[0].tolist())
    result = {
        'version': 1, 'catalogId': manifest['id'], 'catalogSourceSha256': manifest['source']['sha256'],
        'name': name, 'galaxy': galaxy,
        'shape': {'radiusArcsec': float(raw['SHAPE_R']), 'e1': float(raw['SHAPE_E1']),
                  'e2': float(raw['SHAPE_E2']), 'sersic': n, 'profileType': raw['MORPHTYPE'].decode().strip()},
        'gaussians': mixture, 'fitMaxRelativeError': error,
        'source': {'url': manifest['source']['url'], 'rowZeroBased': source_row,
                   'rawRowSha256': hashlib.sha256(raw.tobytes()).hexdigest(),
                   'referenceCatalog': raw['REF_CAT'].decode().strip(), 'sgaId': int(raw['REF_ID']),
                   'nameMatchUrl': f'https://sga.legacysurvey.org/?sgaid__gte={sga_id}&sgaid__lte={sga_id}',
                   'shapeDocumentation': 'https://www.legacysurvey.org/dr9/catalogs/',
                   'ellipseConvention': 'https://github.com/dstndstn/tractor/blob/main/tractor/ellipses.py'},
    }
    if spiral:
        result['spiral'] = {'arms': 2, 'pitchDegrees': 22, 'phaseRadians': .7, 'seed': 3982, 'interpretation': 'Illustrative arms; measured global shape and size', 'morphologySource': 'https://esahubble.org/images/opo1036a/'}
    destination = ROOT / 'public/data' / filename
    destination.write_text(json.dumps(result, indent=2) + '\n')
    print(f'{destination}: {len(mixture)} Gaussian components, max profile error {error:.3%}')


if __name__ == '__main__':
    prepare(26509104, 39633263488141603, 13414618, 'NGC 4026', 801183, 'galaxy-detail.json')
    prepare(26540536, 39633325333155389, 13426480, 'NGC 3982', 678110, 'galaxy-spiral.json', spiral=True)

"""Sky occupancy of the accepted DR1 rows at 0.5°, for the survey footprint overlay.

Streams every leaf metadata chunk of the prepared catalog (checksum-verified),
histograms RA/Dec, and writes a compact base64 uint8 grid. This is derived from
this catalog's rows, not the official DESI tiling: dark cells were not surveyed
here and are not confirmed empty.
"""
import base64
import gzip
import hashlib
import json
import time
from pathlib import Path

import numpy as np
from prepare_data import META

ROOT = Path(__file__).resolve().parent.parent
WIDTH, HEIGHT = 720, 360  # 0.5° cells; rows = Dec south→north, columns = RA 0→360
DISCLOSURE = ('Sky occupancy of the accepted DESI DR1 galaxy rows at 0.5° resolution, derived from this catalog, '
              'not the official survey tiling. Tinted directions were observed with these filters; '
              'dark directions were not surveyed here and are not confirmed empty.')


def encode(counts, maximum):
    """0 = no accepted galaxy; 1..255 span log1p(count) up to the densest cell (`maximum`)."""
    return np.clip(np.ceil(255 * np.log1p(counts) / np.log1p(maximum)), 0, 255).astype(np.uint8)


def main():
    started = time.time()
    directory = ROOT / 'public/data/dr1'
    manifest = json.loads((directory / 'manifest.json').read_text())
    counts = np.zeros((WIDTH, HEIGHT), dtype=np.int64)
    leaves = [node for node in manifest['nodes'] if not node['children']]
    for i, node in enumerate(leaves):
        compressed = (directory / node['metadata']['url']).read_bytes()
        assert hashlib.sha256(compressed).hexdigest() == node['metadata']['sha256']
        rows = np.frombuffer(gzip.decompress(compressed), META, offset=16)
        assert len(rows) == node['count']
        counts += np.histogram2d(rows['ra'], rows['dec'], bins=[WIDTH, HEIGHT], range=[[0, 360], [-90, 90]])[0].astype(np.int64)
        if i % 100 == 0: print(f'Leaf {i + 1}/{len(leaves)}: {int(counts.sum()):,} rows binned', flush=True)
    assert int(counts.sum()) == manifest['count'], 'Leaf-once coverage broken or rows fell outside the sky range'
    counts = counts.T  # histogram2d is [ra, dec]; store [dec, ra]
    grid = encode(counts, counts.max())
    result = {'version': 1, 'catalogId': manifest['id'], 'catalogSourceSha256': manifest['source']['sha256'],
              'count': manifest['count'], 'width': WIDTH, 'height': HEIGHT, 'degreesPerCell': 0.5,
              'maxCellCount': int(counts.max()), 'occupiedCells': int(np.count_nonzero(counts)),
              'cells': base64.b64encode(grid.tobytes()).decode(),
              'sources': ['https://data.desi.lbl.gov/doc/releases/dr1/'], 'disclosure': DISCLOSURE}
    path = ROOT / 'public/data/survey-footprint.json'
    path.write_text(json.dumps(result, separators=(',', ':')) + '\n')
    # Area-weighted by cos(Dec) so polar cells do not inflate the fraction.
    weight = np.cos(np.deg2rad(np.linspace(-89.75, 89.75, HEIGHT)))[:, None] * np.ones((1, WIDTH))
    sky_fraction = float(weight[counts > 0].sum() / weight.sum())
    row, col = np.unravel_index(np.argmax(counts), counts.shape)
    print(f'{result["occupiedCells"]:,} occupied cells ({sky_fraction:.1%} of the sky), max cell count {result["maxCellCount"]:,} '
          f'at RA {col / 2 + .25:.2f}° Dec {row / 2 - 89.75:+.2f}°, {path.stat().st_size:,} bytes, {time.time() - started:.0f} s')


if __name__ == '__main__':
    main()
